import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { getStoredRequest } from "@/lib/request-store";
import { followUpControlForRequest,followUpsForRequest,updateFollowUpControl } from "@/lib/customer-follow-up-store";
import { requestIpHash,writeAudit } from "@/lib/audit-log";
const schema=z.object({paused:z.boolean().optional(),waitingOnCustomer:z.boolean().optional(),waitingNote:z.string().trim().max(300).optional()}).strict();
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
 const {id}=await context.params; const source=await getStoredRequest(id); if(!source)return NextResponse.json({message:"Request not found."},{status:404});
 const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({message:"Check the customer follow-up settings."},{status:400});
 const before=await followUpControlForRequest(id); const patch:{paused?:boolean;waitingOnCustomer?:boolean;waitingSince?:string;waitingNote?:string}={};
 if(parsed.data.paused!==undefined)patch.paused=parsed.data.paused;
 if(parsed.data.waitingOnCustomer!==undefined){ patch.waitingOnCustomer=parsed.data.waitingOnCustomer; if(parsed.data.waitingOnCustomer&&!before.waitingOnCustomer)patch.waitingSince=new Date().toISOString(); if(!parsed.data.waitingOnCustomer){patch.waitingSince="";patch.waitingNote="";} }
 if(parsed.data.waitingNote!==undefined&&patch.waitingOnCustomer!==false)patch.waitingNote=parsed.data.waitingNote;
 const control=await updateFollowUpControl(id,patch); const recent=(await followUpsForRequest(id)).slice(0,10).map(({resendEmailId:_resend,...safe})=>safe);
 const actions:string[]=[]; if(before.paused!==control.paused)actions.push(control.paused?"follow-up-request-paused":"follow-up-request-resumed"); if(before.waitingOnCustomer!==control.waitingOnCustomer)actions.push(control.waitingOnCustomer?"follow-up-waiting-set":"follow-up-waiting-cleared");
 for(const action of actions)await writeAudit({actor:"owner",actorId:"owner",action,targetType:"request",targetId:id,summary:`${source.requestCode}: ${action.replaceAll("-"," ")}.`,ipHash:requestIpHash(request)});
 return NextResponse.json({control,recent,message:"Customer follow-up settings updated."});
}
