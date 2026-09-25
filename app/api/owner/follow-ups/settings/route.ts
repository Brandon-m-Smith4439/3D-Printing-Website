import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { updateFollowUpSettings } from "@/lib/customer-follow-up-store";
import { requestIpHash,writeAudit } from "@/lib/audit-log";
const schema=z.object({enabled:z.boolean()}).strict();
export async function PATCH(request:NextRequest){
 if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({message:"Choose whether customer follow-up automation is enabled."},{status:400});
 const settings=await updateFollowUpSettings(parsed.data.enabled,"owner");
 await writeAudit({actor:"owner",actorId:"owner",action:settings.enabled?"follow-up-settings-enabled":"follow-up-settings-paused",targetType:"automation",targetId:"customer-follow-ups",summary:settings.enabled?"Customer follow-up automation enabled by owner.":"Customer follow-up automation paused by owner.",ipHash:requestIpHash(request)});
 return NextResponse.json({settings,message:settings.enabled?"Customer follow-up automation enabled.":"Customer follow-up automation paused."});
}
