import 'server-only';
import { SYSTEM_PROMPT, prompt } from './policy.ts';
import type { Job } from './types.ts';

export type DraftResult = { text: string; costCents: number };
export type DraftProvider = (job: Job) => Promise<DraftResult>;
function template(job: Job) {
  const heading=job.kind==='outreach'?'Outreach draft':job.kind==='review'?'Operations review':job.kind==='idea'?'Digital product idea':'Digital product listing draft';
  const next=job.agent==='mesh'
    ? 'Review the request and quote details in Mesh Harbor. Confirm the customer facts, consent, and recipient before any manual contact. Identify one bottleneck and one next action. Do not offer prices or delivery dates without confirmation.'
    : 'Define the buyer, problem, deliverable, and a small validation experiment. Draft title, description, and contents. Review rights/licenses, originality, accuracy, and marketplace rules. Pricing and demand are unverified. Human approval is required before any public listing or spending.';
  return {text:`${heading} — local template, no AI API call\n\nOwner brief:\n${job.brief}\n\nReview checklist:\n${next}\n\nDraft starting point:\n${job.kind==='outreach'?'Hello, I am following up about your project. Could you confirm the remaining details so we can review the next step?':job.kind==='listing'?'Title: [Confirm a specific benefit]\nDescription: [Describe the actual contents, format, compatibility, and limitations]\nPrice: [Owner to validate]':'Proposed next step: [Owner to validate against actual business needs]'}\n\nThis is a draft requiring review. Nothing has been sent, purchased, or published.`,costCents:0};
}
export async function generateDraft(job: Job, fetcher: typeof fetch = fetch): Promise<DraftResult> {
  if(job.config.provider==='template')return template(job);
  const key=process.env.AI_CENTER_OPENAI_API_KEY;
  if(!key)throw new Error('Paid provider is not configured.');
  const response=await fetcher('https://api.openai.com/v1/chat/completions',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(45_000),
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:job.config.model,store:false,max_completion_tokens:job.config.maxOutputTokens,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:prompt(job)}]}),
  });
  if(!response.ok)throw new Error('Provider request failed.');
  const data=await response.json() as {choices?:{message?:{content?:string}}[];usage?:{prompt_tokens?:number;completion_tokens?:number}};
  const text=data.choices?.[0]?.message?.content,input=data.usage?.prompt_tokens,output=data.usage?.completion_tokens;
  if(typeof text!=='string'||!text.trim()||text.length>24000||!Number.isSafeInteger(input)||!Number.isSafeInteger(output)||input!<0||output!<0)throw new Error('Provider returned invalid text or usage.');
  const costCents=Math.ceil((input!*job.config.inputCentsPerMillion+output!*job.config.outputCentsPerMillion)/1_000_000);
  return {text,costCents};
}
