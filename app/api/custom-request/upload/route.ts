import { NextRequest, NextResponse } from "next/server";

import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { cleanupOrphanCustomerUploads, createCustomerUpload } from "@/lib/customer-upload-store";
import { deletePrivateObject, privateObjectPath, putPrivateObject } from "@/lib/private-object-store";

export const runtime = "nodejs";
const MAX_FILE = 10 * 1024 * 1024;
const buckets = new Map<string, { count: number; resetAt: number }>();
function clientIp(request: NextRequest) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"; }
function sameOrigin(request: NextRequest) { const origin=request.headers.get("origin"); if(!origin) return process.env.NODE_ENV!=="production"; try{return new URL(origin).origin===request.nextUrl.origin;}catch{return false;} }
function limited(ip:string){const now=Date.now();const b=buckets.get(ip);if(!b||b.resetAt<=now){buckets.set(ip,{count:1,resetAt:now+10*60_000});return false;}b.count+=1;return b.count>12;}
function safeName(name:string){return name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,120)||"attachment";}
function extension(name:string){return path.extname(name).toLowerCase();}
function isPng(b:Buffer){return b.length>=8&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));}
function isJpeg(b:Buffer){return b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;}
function isWebp(b:Buffer){return b.length>=12&&b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP";}
function is3mf(b:Buffer){return b.length>=4&&b[0]===0x50&&b[1]===0x4b&&b[2]===0x03&&b[3]===0x04;}
function isStl(b:Buffer){if(b.length<15)return false;const head=b.subarray(0,80).toString("utf8").trimStart().toLowerCase();if(head.startsWith("solid")&&b.subarray(0,Math.min(b.length,2000)).toString("utf8").toLowerCase().includes("facet"))return true;if(b.length<84)return false;const count=b.readUInt32LE(80);return 84+count*50===b.length;}
function classify(name:string,b:Buffer){const ext=extension(name);if(ext===".png"&&isPng(b))return{kind:"image" as const,mime:"image/png"};if([".jpg",".jpeg"].includes(ext)&&isJpeg(b))return{kind:"image" as const,mime:"image/jpeg"};if(ext===".webp"&&isWebp(b))return{kind:"image" as const,mime:"image/webp"};if(ext===".stl"&&isStl(b))return{kind:"model" as const,mime:"model/stl"};if(ext===".3mf"&&is3mf(b))return{kind:"model" as const,mime:"model/3mf"};return null;}

async function clamScan(filePath:string){
  const scanner=(process.env.CUSTOMER_UPLOAD_SCANNER||"").trim().toLowerCase();
  if(scanner!=="clamav"){
    if(process.env.NODE_ENV==="production") throw new Error("File scanning is temporarily unavailable.");
    return "development-unscanned" as const;
  }
  const executable=(process.env.CLAMSCAN_PATH||"clamscan").trim();
  return new Promise<"clean">((resolve,reject)=>{
    const child=spawn(executable,["--no-summary",filePath],{stdio:["ignore","pipe","pipe"],shell:false});
    let stderr="";const timer=setTimeout(()=>{child.kill();reject(new Error("Malware scan timed out."));},30_000);
    child.stderr.on("data",d=>{stderr+=String(d).slice(0,2000);});
    child.on("error",()=>{clearTimeout(timer);reject(new Error("Malware scanner could not start."));});
    child.on("close",code=>{clearTimeout(timer);if(code===0)resolve("clean");else if(code===1)reject(new Error("The uploaded file was rejected by malware scanning."));else reject(new Error(stderr||"Malware scanner failed."));});
  });
}

export async function POST(request:NextRequest){
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const ip=clientIp(request);if(limited(ip))return NextResponse.json({message:"Too many upload attempts. Try again later."},{status:429});
  const length=Number(request.headers.get("content-length")||"0");if(length>MAX_FILE+1_000_000)return NextResponse.json({message:"File is too large."},{status:413});
  let form:FormData;try{form=await request.formData();}catch{return NextResponse.json({message:"Invalid upload."},{status:400});}
  const file=form.get("file");if(!(file instanceof File))return NextResponse.json({message:"Choose a file to upload."},{status:400});
  if(file.size<=0||file.size>MAX_FILE)return NextResponse.json({message:"Files must be 10 MB or smaller."},{status:413});
  const buffer=Buffer.from(await file.arrayBuffer());const classification=classify(file.name,buffer);if(!classification)return NextResponse.json({message:"Allowed files are PNG, JPG, WebP, STL, and 3MF with a valid file signature."},{status:415});
  const storedName=`${randomBytes(18).toString("hex")}${extension(file.name)}`;const objectKey=`customer-uploads/${storedName}`;await putPrivateObject(objectKey,buffer);const filePath=privateObjectPath(objectKey);
  try{
    const scanStatus=await clamScan(filePath);await cleanupOrphanCustomerUploads();
    const created=await createCustomerUpload({originalName:safeName(file.name),storedName,mimeType:classification.mime,kind:classification.kind,size:file.size,scanStatus});
    return NextResponse.json({attachment:{id:created.record.id,name:created.record.originalName,kind:created.record.kind,size:created.record.size,scanStatus:created.record.scanStatus},claimToken:created.token},{status:201});
  }catch(error){await deletePrivateObject(objectKey);return NextResponse.json({message:error instanceof Error?error.message:"Upload was rejected."},{status:process.env.NODE_ENV==="production"?503:400});}
}
