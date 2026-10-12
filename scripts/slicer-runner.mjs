import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {resolveProfiles} from './slicer-profiles.mjs';
export async function sliceStl({executablePath,resourcesDir,profileId,source,sourceSha256,profileHash,workRoot,colorHex='#000000',signal},spawnFn=spawn){
 if(!Buffer.isBuffer(source)||source.length>20_000_000||createHash('sha256').update(source).digest('hex')!==sourceSha256)throw Error('Source hash or size invalid');
 if(!/^#[a-fA-F0-9]{6}$/.test(colorHex))throw Error('Invalid color');
 const profiles=resolveProfiles(resourcesDir,profileId);if(profiles.profileHash!==profileHash)throw Error('Profile hash changed');
 fs.mkdirSync(workRoot,{recursive:true});const dir=fs.mkdtempSync(path.join(workRoot,'slice-job-'));
 try{
  for(const name of ['machine','process','filament'])fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(name==='filament'?{...profiles[name],filament_colour:[colorHex]}:profiles[name]));
  const sourceFile=path.join(dir,'model.stl');fs.writeFileSync(sourceFile,source);
  const args=['--datadir',path.join(dir,'runtime'),'--load-settings',[path.join(dir,'machine.json'),path.join(dir,'process.json')].join(';'),'--load-filaments',path.join(dir,'filament.json'),'--curr-bed-type','Textured PEI Plate','--ensure-on-bed','--arrange','1','--slice','0','--mstpp','120','--mtcpp','1000000','--debug','3','--outputdir',dir,'--export-3mf','slice.3mf','--export-slicedata',path.join(dir,'slice-data'),sourceFile];
  await new Promise((resolve,reject)=>{const child=spawnFn(executablePath,args,{shell:false,windowsHide:true,timeout:180000,signal});let bytes=0,failure=null;const consume=chunk=>{bytes+=chunk.length;if(bytes>1000000){failure=Error('Slicer diagnostic limit');child.kill();}};child.stdout.on('data',consume);child.stderr.on('data',consume);child.once('error',()=>{failure=Error('Slicer process failed');});child.once('close',(code)=>failure?reject(failure):code===0?resolve():reject(Error('Slicer exited unsuccessfully')));});
  const file=path.join(dir,'result.json');if(fs.statSync(file).size>1000000)throw Error('Slicer output limit');const r=JSON.parse(fs.readFileSync(file,'utf8'));if(r.return_code!==0||r.sliced_plates?.length!==1)throw Error('No single-plate result');
  const p=r.sliced_plates[0];if(p.objects?.length!==1)throw Error('Unexpected object count');const b=p.objects[0].bbox;
  const filaments=p.filaments.map(f=>({slot:f.id,consumedGrams:f.total_used_g,purgeGrams:null,towerGrams:null}));
  const fd=fs.openSync(path.join(dir,'plate_1.gcode'),'r'),prefix=Buffer.alloc(4096);let count;try{count=fs.readSync(fd,prefix,0,prefix.length,0);}finally{fs.closeSync(fd);}
  const version=prefix.subarray(0,count).toString().match(/^; BambuStudio ([0-9.]+)$/m)?.[1];if(!version)throw Error('Slicer version metadata missing');
  const result={sourceSha256,profileHash,slicerVersion:'BambuStudio '+version,grams:filaments.reduce((n,f)=>n+f.consumedGrams,0),partGrams:null,filaments,colorChanges:p.filament_change_times,seconds:p.total_predication,sizeMm:[b.width,b.depth,b.height],warnings:p.warning_message?[String(p.warning_message).slice(0,300)]:[]};
  if(result.filaments.length!==1||result.colorChanges!==0||!Number.isFinite(result.grams)||result.grams<=0||!Number.isFinite(result.seconds)||result.seconds<=0||!result.sizeMm.every(Number.isFinite))throw Error('Invalid single-color estimate');
  return result;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
