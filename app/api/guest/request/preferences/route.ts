import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guestRequestFromRequest } from "@/lib/guest-access";
import { sameOrigin } from "@/lib/owner-api";
import { updateStoredRequest } from "@/lib/request-store";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema=z.object({emailNotifications:z.boolean()}).strict();
export async function POST(request:NextRequest){
  const guest=await guestRequestFromRequest(request);if(!guest)return NextResponse.json({message:"Open the secure request link from your email again."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  let body:unknown;try{body=await request.json();}catch{return NextResponse.json({message:"Invalid preference request."},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Invalid preference request."},{status:400});
  const updated=await updateStoredRequest(guest.id,{emailNotifications:parsed.data.emailNotifications});if(!updated)return NextResponse.json({message:"Request not found."},{status:404});
  await writeAudit({actor:"customer",actorId:"guest-email",action:"guest-email-preference",targetType:"request",targetId:guest.id,summary:`Guest status emails ${parsed.data.emailNotifications?"enabled":"disabled"} for ${guest.requestCode}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({message:parsed.data.emailNotifications?"Status update emails are enabled.":"Optional production status emails are disabled. Quote and payment-action emails will still be sent."});
}
