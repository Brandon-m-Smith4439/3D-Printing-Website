import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestIsOwner } from '@/lib/owner-auth';
import { sameOrigin } from '@/lib/owner-api';
import { CenterStore } from '@/lib/ai-center/store';
import { enqueueSchema, settingsSchema } from '@/lib/ai-center/policy';
import { runOne } from '@/lib/ai-center/worker';
import { businessOverview } from '@/lib/ai-center/metrics';
import { createProjectSchema, projectActionSchema } from '@/lib/ai-center/projects';
import { generateTray, traySchema } from '@/lib/ai-center/stl';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
const commands=z.discriminatedUnion('action',[
  z.object({action:z.literal('enqueue'),task:enqueueSchema}).strict(),
  z.object({action:z.literal('configure'),settings:settingsSchema}).strict(),
  z.object({action:z.literal('decide'),id:z.uuid(),decision:z.enum(['approve','reject'])}).strict(),
  z.object({action:z.literal('run')}).strict(),
  z.object({action:z.literal('createProject'),project:createProjectSchema}).strict(),
  z.object({action:z.literal('project'),id:z.uuid(),version:z.number().int().positive(),change:projectActionSchema}).strict(),
  z.object({action:z.literal('delegate'),id:z.uuid(),version:z.number().int().positive()}).strict(),
  z.object({action:z.literal('tray'),id:z.uuid(),version:z.number().int().positive(),dimensions:traySchema,notes:z.string().trim().min(1).max(2000)}).strict(),
]);
export async function GET(request: NextRequest) {
  if(!await requestIsOwner(request))return json({message:'Sign in required.'},401);
  let store:CenterStore|undefined;
  try {store=new CenterStore();return json({...store.snapshot(),business:businessOverview(),providerConfigured:Boolean(process.env.AI_CENTER_OPENAI_API_KEY)});}
  catch {return json({message:'Control center storage unavailable. Check server configuration.'},503);}
  finally {store?.close();}
}
export async function POST(request: NextRequest) {
  if(!sameOrigin(request))return json({message:'Origin rejected.'},403);
  if(!await requestIsOwner(request))return json({message:'Sign in required.'},401);
  if(Number(request.headers.get('content-length')||0)>20000)return json({message:'Request too large.'},413);
  let command:z.infer<typeof commands>;
  try {const text=await request.text();if(Buffer.byteLength(text)>20000)return json({message:'Request too large.'},413);command=commands.parse(JSON.parse(text));}
  catch {return json({message:'Invalid command. Check task and budget fields.'},400);}
  let store:CenterStore|undefined;
  try {
    store=new CenterStore();
    if(command.action==='enqueue')store.enqueue(command.task);
    else if(command.action==='configure')store.configure(command.settings);
    else if(command.action==='decide')store.decide(command.id,command.decision);
    else if(command.action==='createProject')store.createProject(command.project);
    else if(command.action==='project')store.updateProject(command.id,command.version,command.change);
    else if(command.action==='delegate')store.delegate(command.id,command.version);
    else if(command.action==='tray')store.addRevision(command.id,command.version,'mesh-harbor-tray.stl',command.notes,generateTray(command.dimensions));
    else {const job=await runOne(store);return json({message:job?job.status==='failed'?'Job failed; reservation retained. Check configuration.':'Draft generated; review required.':'No eligible task. Check pending approvals, limits, and paid-AI toggle.'});}
    return json({message:'Saved.'});
  } catch {return json({message:'Command could not be completed. Check task status, paid-AI settings, and storage configuration.'},409);}
  finally {store?.close();}
}
