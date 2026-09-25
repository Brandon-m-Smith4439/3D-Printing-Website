import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { getFollowUpSettings, readFollowUps } from "@/lib/customer-follow-up-store";
import { previewCustomerFollowUps } from "@/lib/customer-follow-up-engine";

export const dynamic="force-dynamic";
const enabled=()=>/^(1|true|yes|on)$/i.test((process.env.CUSTOMER_FOLLOWUPS_ENABLED||"").trim());
function safeRecord(record:Awaited<ReturnType<typeof readFollowUps>>[number]){ const {resendEmailId:_resend,...safe}=record; return safe; }
export async function GET(request:NextRequest){
  if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  const [settings,records,preview]=await Promise.all([getFollowUpSettings(),readFollowUps(),previewCustomerFollowUps()]);
  const sevenDaysAgo=Date.now()-7*86_400_000;
  const deferred=records.filter(r=>r.status==="deferred").length+preview.blocked.filter(c=>/24 hours|higher-priority/i.test(c.blockedReason)).length;
  return NextResponse.json({deploymentEnabled:enabled(),settings,counts:{due:preview.counts.due,deferred,sentLast7Days:records.filter(r=>r.status==="sent"&&Date.parse(r.sentAt)>=sevenDaysAgo).length,failed:records.filter(r=>r.status==="failed").length},preview:{due:preview.due,upcoming:preview.upcoming.slice(0,25),blocked:preview.blocked.slice(0,25)},recent:[...records].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50).map(safeRecord)},{headers:{"Cache-Control":"no-store"}});
}
