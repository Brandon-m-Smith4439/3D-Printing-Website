import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {CenterStore}=await import('../lib/ai-center/store.ts');
const {defaultSettings}=await import('../lib/ai-center/policy.ts');
const {generateTray}=await import('../lib/ai-center/stl.ts');
const {generateProductImage}=await import('../lib/ai-center/provider.ts');
const {runOne}=await import('../lib/ai-center/worker.ts');
function chunk(type,data){const bytes=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,bytes,tail]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1024);ihdr.writeUInt32BE(1024,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.alloc(1024*(1024*4+1)))),chunk('IEND',Buffer.alloc(0))]);
const dir=mkdtempSync(path.join(tmpdir(),'ai-images-'));process.env.AI_CENTER_DATABASE_PATH=path.join(dir,'ai.sqlite');process.env.AI_CENTER_OPENAI_API_KEY='test-key';
const store=new CenterStore();
try{
 let p=store.createProject({business:'mesh',name:'Tray',brief:'An original rectangular tray'});
 p=store.addRevision(p.id,p.version,'tray.stl','Simple open tray',generateTray({width:60,length:40,height:12,wall:2,base:2}));
 p=store.updateProject(p.id,p.version,{action:'test',revisionId:p.revisions[0].id,passed:true,notes:'Owner confirmed pass',printer:'Test printer',material:'PLA',minutes:17,grams:10.92});
 p=store.updateProject(p.id,p.version,{action:'sales',input:{costSource:'Fixture, unknown costs intentionally preserved',fees:{website:null,etsy:null}}});
 const settings=defaultSettings();settings.paidEnabled=true;settings.images.enabled=true;settings.agents.mesh.roleLimitsCents.image=500;store.configure(settings);
 const image=store.prepareSale(p.id,p.version,true).find(j=>j.kind==='image');
 let calls=0;await runOne(store);assert.equal(await runOne(store),null,'Image cannot run before spending approval');
 store.decide(image.id,'approve');settings.agents.mesh.roleLimitsCents.image=image.boundCents-1;store.configure(settings);assert.equal(store.claim(),null,'Image role cap also bounds image calls');
 settings.agents.mesh.roleLimitsCents.image=500;store.configure(settings);
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/images/generations');const body=JSON.parse(options.body);assert.equal(body.n,1);assert.equal(body.size,'1024x1024');assert.equal(body.quality,'low');assert.equal(body.model,'gpt-image-2');assert.equal(body.output_format,'png');return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}],usage:{input_tokens:200,output_tokens:1000,input_tokens_details:{text_tokens:200,image_tokens:0}}}));};
 const done=await runOne(store,job=>generateProductImage(job,fetcher));assert.equal(done.status,'review');assert.equal(calls,1);assert.equal(done.chargedCents,2);assert.ok(done.artifactId);assert.deepEqual(store.projectAsset(done.artifactId).data,png);assert.match(done.output,/not an actual product photo/);
 store.decide(done.id,'approve');
 p=store.updateProject(p.id,p.version,{action:'sales',input:p.sales});
 const next=store.prepareSale(p.id,p.version,true).find(j=>j.kind==='image');store.decide(next.id,'approve');await runOne(store);
 const failed=await runOne(store,job=>generateProductImage(job,async()=>new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))));assert.equal(failed.status,'failed');assert.ok(store.snapshot().usage.uncertainCents>=next.boundCents);assert.equal(await runOne(store),null,'Uncertain image calls are never retried');
 await assert.rejects(()=>generateProductImage(image,async()=>new Response('{}',{headers:{'content-length':'9000000'}})),/limit/);
 await assert.rejects(()=>generateProductImage(image,async()=>new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}],usage:{input_tokens:-1,output_tokens:1000,input_tokens_details:{image_tokens:0}}}))),/Invalid/);
 p=store.updateProject(p.id,p.version,{action:'sales',input:p.sales});const over=store.prepareSale(p.id,p.version,true).find(j=>j.kind==='image');store.decide(over.id,'approve');await runOne(store);assert.equal(store.claim().id,over.id);store.finish(over.id,'Reported overage',over.boundCents+1,png);assert.equal(store.snapshot().settings.paidEnabled,false);
 p=store.addRevision(p.id,p.version,'new.stl','New geometry',generateTray({width:65,length:40,height:12,wall:2,base:2}));assert.throws(()=>store.decide(over.id,'approve'),/changed/);
 console.log('Image provider, private assets, approval, role budget, uncertain usage and overage checks passed.');
}finally{store.close();rmSync(dir,{recursive:true,force:true});}
