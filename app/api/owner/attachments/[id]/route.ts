import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { requestIsOwner } from "@/lib/owner-auth";
import { customerUploadPath, getCustomerUploadForOwner } from "@/lib/customer-upload-store";

export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  const {id}=await context.params;const record=await getCustomerUploadForOwner(id);if(!record)return NextResponse.json({message:"Attachment not found."},{status:404});
  try{const bytes=await readFile(customerUploadPath(record));return new NextResponse(bytes,{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch{return NextResponse.json({message:"Attachment file is unavailable."},{status:404});}
}
