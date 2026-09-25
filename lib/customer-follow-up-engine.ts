import type { AuditEntry } from "./audit-log.ts";
import type { CustomerAccount } from "./customer-types.ts";
import type { FinalInvoiceRecord } from "./final-invoice-types.ts";
import { buildFollowUpCandidates } from "./customer-follow-up-policy.ts";
import { getFollowUpSettings, readFollowUpControls, readFollowUps, updateFollowUp, upsertFollowUp } from "./customer-follow-up-store.ts";
import type { CustomerFollowUpRecord, FollowUpCandidate, RequestFollowUpControl } from "./customer-follow-up-types.ts";
import type { StoredQuote } from "./quote-types.ts";
import type { StoredRequest } from "./request-types.ts";
import { sendFollowUpEmail, type FollowUpEmailResult } from "./customer-follow-up-email.ts";

type FollowUpData = { requests: StoredRequest[]; quotes: StoredQuote[]; invoices: FinalInvoiceRecord[]; accounts: CustomerAccount[]; controls: RequestFollowUpControl[] };
type NotifyFn = (request: StoredRequest, message: string, options?: { email?: boolean; notificationId?: string; subject?: string }) => Promise<void>;
type AuditFn = (entry: Omit<AuditEntry, "id" | "createdAt">) => Promise<unknown>;
export type FollowUpEngineDependencies = {
  now?: Date;
  loadData?: () => Promise<FollowUpData>;
  sendEmail?: (input: { request: StoredRequest; record: CustomerFollowUpRecord }) => Promise<FollowUpEmailResult>;
  notify?: NotifyFn;
  audit?: AuditFn;
  deploymentEnabled?: boolean;
};
export type FollowUpPreview = { generatedAt:string; deploymentEnabled:boolean; ownerEnabled:boolean; due:FollowUpCandidate[]; upcoming:FollowUpCandidate[]; blocked:FollowUpCandidate[]; counts:{due:number;upcoming:number;blocked:number} };
export type FollowUpSweepResult = { sent:number; failed:number; canceled:number; skipped:number; deploymentEnabled:boolean; ownerEnabled:boolean };

function envEnabled(){ return /^(1|true|yes|on)$/i.test((process.env.CUSTOMER_FOLLOWUPS_ENABLED||"").trim()); }
async function defaultLoadData():Promise<FollowUpData>{
  const [{readRequests},{readQuotes},{readFinalInvoices},{readCollection}] = await Promise.all([
    import("./request-store.ts"), import("./quote-store.ts"), import("./final-invoice-store.ts"), import("./database.ts"),
  ]);
  const [requests,quotes,invoices,accounts,controls]=await Promise.all([readRequests(),readQuotes(),readFinalInvoices(),readCollection<CustomerAccount>("customers"),readFollowUpControls()]);
  return {requests,quotes,invoices,accounts:accounts.map(a=>({...a,preferences:{emailStatusUpdates:false,showQueuePosition:true,...(a.preferences||{})}})),controls};
}
async function defaultNotify(...args:Parameters<NotifyFn>){ const {notifyCustomer}=await import("./customer-notifications.ts"); return notifyCustomer(...args); }
async function defaultAudit(entry:Omit<AuditEntry,"id"|"createdAt">){ const {writeAudit}=await import("./audit-log.ts"); return writeAudit(entry); }
function recordFromCandidate(c:FollowUpCandidate, now:string):CustomerFollowUpRecord { return {id:c.id,requestId:c.requestId,requestCode:c.requestCode,customerAccountId:c.customerAccountId,type:c.type,stage:c.stage,anchorId:c.anchorId,anchorRevision:c.anchorRevision,dueAt:c.dueAt,status:"pending",subject:c.subject,text:c.text,idempotencyKey:c.idempotencyKey,attemptCount:0,lastAttemptAt:"",nextAttemptAt:"",sentAt:"",resendEmailId:"",reason:"",createdAt:now,updatedAt:now}; }

export async function previewCustomerFollowUps(now=new Date(), deps:Pick<FollowUpEngineDependencies,"loadData"|"deploymentEnabled">={}):Promise<FollowUpPreview>{
  const [data,records,settings]=await Promise.all([(deps.loadData||defaultLoadData)(),readFollowUps(),getFollowUpSettings()]);
  const candidates=buildFollowUpCandidates({now, ...data, records});
  const due=candidates.filter(c=>c.eligible);
  const upcoming=candidates.filter(c=>!c.eligible&&c.blockedReason==="Not due yet.");
  const blocked=candidates.filter(c=>!c.eligible&&c.blockedReason!=="Not due yet.");
  return {generatedAt:now.toISOString(),deploymentEnabled:deps.deploymentEnabled??envEnabled(),ownerEnabled:settings.enabled,due,upcoming,blocked,counts:{due:due.length,upcoming:upcoming.length,blocked:blocked.length}};
}

export async function runCustomerFollowUpSweep(deps:FollowUpEngineDependencies={}):Promise<FollowUpSweepResult>{
  const now=deps.now||new Date(); const deploymentEnabled=deps.deploymentEnabled??envEnabled(); const settings=await getFollowUpSettings();
  const result:FollowUpSweepResult={sent:0,failed:0,canceled:0,skipped:0,deploymentEnabled,ownerEnabled:settings.enabled};
  if(!deploymentEnabled||!settings.enabled) return result;
  const load=deps.loadData||defaultLoadData; const data=await load(); const records=await readFollowUps();
  const candidates=buildFollowUpCandidates({now,...data,records}); const currentIds=new Set(candidates.map(c=>c.id));
  for(const record of records){ if(["pending","deferred","failed","sending"].includes(record.status)&&!currentIds.has(record.id)){ await updateFollowUp(record.id,{status:"canceled",reason:"Workflow state changed before this reminder was sent.",nextAttemptAt:""}); result.canceled++; } }
  const requestById=new Map(data.requests.map(r=>[r.id,r])); const send=deps.sendEmail||sendFollowUpEmail; const notify=deps.notify||defaultNotify; const audit=deps.audit||defaultAudit; const handled=new Set<string>();
  for(const candidate of candidates){
    if(!candidate.eligible||handled.has(candidate.requestId)){ result.skipped++; continue; }
    const request=requestById.get(candidate.requestId); if(!request){continue;}
    let record=(await readFollowUps()).find(r=>r.id===candidate.id)||null;
    if(record?.status==="sent"||record?.status==="canceled") continue;
    if(record?.nextAttemptAt&&Date.parse(record.nextAttemptAt)>now.getTime()) continue;
    record=record||await upsertFollowUp(recordFromCandidate(candidate,now.toISOString()));
    const attempt=Math.min(3,(record.attemptCount||0)+1);
    record=await updateFollowUp(record.id,{status:"sending",attemptCount:attempt,lastAttemptAt:now.toISOString(),reason:""})||record;
    await notify(request,record.text,{email:false,notificationId:`followup:${record.id}`,subject:record.subject});
    const sendResult=await send({request,record});
    handled.add(candidate.requestId);
    if(sendResult.ok){ await updateFollowUp(record.id,{status:"sent",sentAt:now.toISOString(),resendEmailId:sendResult.emailId,nextAttemptAt:"",reason:""}); result.sent++; await audit({actor:"system",actorId:"system",action:"follow-up-sent",targetType:"request",targetId:request.id,summary:`${record.type} follow-up stage ${record.stage} sent for ${request.requestCode}.`,ipHash:""}); continue; }
    const preferenceCanceled=/email updates are disabled|email is not verified|account is unavailable/i.test(sendResult.reason);
    if(preferenceCanceled){ await updateFollowUp(record.id,{status:"canceled",reason:sendResult.reason,nextAttemptAt:""}); result.canceled++; continue; }
    const nextAttemptAt=sendResult.retryable&&attempt<3?new Date(now.getTime()+(attempt===1?1:4)*60*60*1000).toISOString():"";
    await updateFollowUp(record.id,{status:"failed",reason:sendResult.reason,nextAttemptAt}); result.failed++;
    await audit({actor:"system",actorId:"system",action:"follow-up-send-failed",targetType:"request",targetId:request.id,summary:`${record.type} follow-up failed for ${request.requestCode}.`,ipHash:""});
  }
  return result;
}
