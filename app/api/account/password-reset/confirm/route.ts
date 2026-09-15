import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeVerificationToken } from "@/lib/customer-verification";
import { replaceCustomerPassword } from "@/lib/customer-store";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({ token:z.string().min(20).max(200), password:z.string().min(10).max(128) });
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  let body:unknown;try{body=await request.json();}catch{return NextResponse.json({message:"Invalid request."},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Use a password of at least 10 characters."},{status:400});
  const consumed=await consumeVerificationToken(parsed.data.token,"password-reset");
  if(!consumed.record)return NextResponse.json({message:"This reset link is invalid, expired, or has already been used."},{status:400});
  const updated=await replaceCustomerPassword(consumed.record.customerId,parsed.data.password);
  if(!updated)return NextResponse.json({message:"Account not found."},{status:404});
  await writeAudit({actor:"customer",actorId:updated.id,action:"password-reset-completed",targetType:"customer",targetId:updated.id,summary:"Password reset completed; existing sessions invalidated.",ipHash:requestIpHash(request)});
  return NextResponse.json({message:"Password changed. Sign in with your new password."});
}
