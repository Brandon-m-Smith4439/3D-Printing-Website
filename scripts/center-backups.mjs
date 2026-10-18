import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,existsSync} from 'node:fs';
import {mkdir,writeFile,readdir,readFile,stat,rm,chmod} from 'node:fs/promises';
import path from 'node:path';

function paths(env){
 const business=path.resolve(env.DATABASE_PATH||path.join(env.RAILWAY_VOLUME_MOUNT_PATH||path.join(process.cwd(),'data'),'3d-printing-business.sqlite'));
 const base=path.dirname(business);
 return {root:path.resolve(env.CONTROL_CENTER_BACKUP_DIR||path.join(base,'control-center-backups')),files:[['ai-business-center.sqlite',env.AI_CENTER_DATABASE_PATH||path.join(base,'ai-business-center.sqlite')],['commerce.sqlite',env.COMMERCE_DATABASE_PATH||path.join(base,'commerce.sqlite')],['marketplace.sqlite',env.MARKETPLACE_DATABASE_PATH||path.join(base,'marketplace.sqlite')]]};
}
async function checksum(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function backupSidecars(env=process.env){
 const {root,files}=paths(env),name=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
 const directory=path.join(root,name);await mkdir(directory,{recursive:true,mode:0o700});
 const manifest={directory,createdAt:new Date().toISOString(),files:[]};
 for(const [name,source] of files){
  if(!existsSync(source))continue;
  const db=new DatabaseSync(source,{readOnly:true}),destination=path.join(directory,name);
  try{await backup(db,destination);await chmod(destination,0o600);const bytes=(await stat(destination)).size;manifest.files.push({name,bytes,sha256:await checksum(destination)});}finally{db.close();}
 }
 await writeFile(path.join(directory,'manifest.json'),JSON.stringify({createdAt:manifest.createdAt,files:manifest.files},null,2),{flag:'wx',mode:0o600});
 // Only prune completed folders created by this helper within the configured backup root.
 const entries=(await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^\d{4}-\d{2}-\d{2}T[0-9TZ-]+-[a-f0-9-]{36}$/.test(e.name)).map(e=>e.name).sort().reverse();
 const complete=[];for(const entry of entries)if(existsSync(path.join(root,entry,'manifest.json')))complete.push(entry);
 for(const old of complete.slice(1)){
  const target=path.resolve(root,old),relative=path.relative(root,target);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Backup target escaped root.');
  await rm(target,{recursive:true,force:true});
 }
 return manifest;
}
export async function ensureSidecarBackup(env=process.env){
 if(env.CONTROL_CENTER_BACKUPS_ENABLED!=='true')return null;
 const {root,files}=paths(env),today=new Date().toISOString().slice(0,10);
 const required=files.filter(([,source])=>existsSync(source)).map(([name])=>name);
 if(!required.length)return null;
 const entries=await readdir(root).catch(()=>[]);
 for(const entry of entries.filter(e=>e.startsWith(today)))try{const m=JSON.parse(await readFile(path.join(root,entry,'manifest.json'),'utf8'));if(m.createdAt?.startsWith(today)&&required.every(name=>m.files?.some(f=>f.name===name)))return null;}catch{}
 return backupSidecars(env);
}
