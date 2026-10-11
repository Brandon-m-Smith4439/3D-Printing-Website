import 'server-only';
import { SYSTEM_PROMPT, prompt } from './policy.ts';
import type { Job } from './types.ts';

export type DraftResult = { text: string; costCents: number;image?:Buffer };
export type DraftProvider = (job: Job) => Promise<DraftResult>;
function template(job: Job) {
  if(job.kind==='pricing')return {text:`Free cost-calculator handoff; no AI API call.\n${job.brief}\nReview missing costs and confirmed comparable matches. The calculator produces estimates, not a proven selling price. Use OpenAI for an AI-written recommendation. No listing or price changed.`,costCents:0};
  if(['plan','research','design'].includes(job.kind))return {text:`${job.kind==='plan'?'Leader planning':job.kind==='research'?'Research':'Design/refinement'} — free workflow template, no AI API call\n\n${job.brief}\n\nNext steps: verify evidence and originality; prefer small PLA designs without supports; preserve each revision; slice and physically test; record failures and refine; review margin, photos, license and shipping before release. Marketplace sales and demand are unverified. This template does not browse, generate arbitrary CAD or authorize external actions.`,costCents:0};
  const heading=job.kind==='outreach'?'Outreach draft':job.kind==='review'?'Operations review':job.kind==='idea'?'Digital product idea':'Digital product listing draft';
  const next=job.agent==='mesh'
    ? 'Review the request and quote details in Mesh Harbor. Confirm the customer facts, consent, and recipient before any manual contact. Identify one bottleneck and one next action. Do not offer prices or delivery dates without confirmation.'
    : 'Define the buyer, problem, deliverable, and a small validation experiment. Draft title, description, and contents. Review rights/licenses, originality, accuracy, and marketplace rules. Pricing and demand are unverified. Human approval is required before any public listing or spending.';
  return {text:`${heading} — local template, no AI API call\n\nOwner brief:\n${job.brief}\n\nReview checklist:\n${next}\n\nDraft starting point:\n${job.kind==='outreach'?'Hello, I am following up about your project. Could you confirm the remaining details so we can review the next step?':job.kind==='listing'?'Title: [Confirm a specific benefit]\nDescription: [Describe the actual contents, format, compatibility, and limitations]\nPrice: [Owner to validate]':'Proposed next step: [Owner to validate against actual business needs]'}\n\nThis is a draft requiring review. Nothing has been sent, purchased, or published.`,costCents:0};
}
export async function generateDraft(job: Job, fetcher: typeof fetch = fetch): Promise<DraftResult> {
  if(job.kind==='image')return generateProductImage(job,fetcher);
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
export async function generateProductImage(job:Job,fetcher:typeof fetch=fetch):Promise<DraftResult>{
  const key=process.env.AI_CENTER_OPENAI_API_KEY,config=job.imageConfig;
  if(!key||!config?.enabled||!job.projectId||!job.revisionId||!job.projectVersion)throw Error('Image provider or exact product revision missing.');
  const response=await fetcher('https://api.openai.com/v1/images/generations',{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,prompt:job.brief,n:1,size:'1024x1024',quality:'low',output_format:'png'})});
  if(!response.ok)throw Error('Image provider request failed.');
  if(Number(response.headers.get('content-length')||0)>8_000_000)throw Error('Image response exceeds limit.');
  const reader=response.body?.getReader();if(!reader)throw Error('Image response missing.');
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8_000_000){await reader.cancel();throw Error('Image response exceeds limit.');}chunks.push(value);}}finally{reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(chunks).toString()) as {data?:{b64_json?:string}[];usage?:{input_tokens?:number;output_tokens?:number;input_tokens_details?:{text_tokens?:number;image_tokens?:number}}};
  const input=data.usage?.input_tokens,output=data.usage?.output_tokens,encoded=data.data?.[0]?.b64_json;
  if(!Number.isSafeInteger(input)||input!<0||!Number.isSafeInteger(output)||output!<0||data.usage?.input_tokens_details?.image_tokens!==0||typeof encoded!=='string'||data.data?.length!==1||encoded.length>7_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('Invalid image or usage; reservation remains uncertain.');
  return {image:Buffer.from(encoded,'base64'),costCents:Math.ceil((input!*config.inputCentsPerMillion+output!*config.outputCentsPerMillion)/1_000_000),text:`AI concept preview for product revision ${job.revisionId}. Illustrative gray color, not an actual product photo or verified geometry. Owner must compare against the physical print. Original physical-product photos are required for Etsy. No image was uploaded to a public listing.`};
}
