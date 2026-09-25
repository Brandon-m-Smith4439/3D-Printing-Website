import { NextRequest,NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { previewCustomerFollowUps } from "@/lib/customer-follow-up-engine";
import { requestIpHash,writeAudit } from "@/lib/audit-log";
export async function POST(request:NextRequest){
 if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
 const preview=await previewCustomerFollowUps();
 await writeAudit({actor:"owner",actorId:"owner",action:"follow-up-previewed",targetType:"automation",targetId:"customer-follow-ups",summary:`Previewed customer follow-ups: ${preview.counts.due} due, ${preview.counts.upcoming} upcoming, ${preview.counts.blocked} blocked.`,ipHash:requestIpHash(request)});
 return NextResponse.json({preview},{headers:{"Cache-Control":"no-store"}});
}
