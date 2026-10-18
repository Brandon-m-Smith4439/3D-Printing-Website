import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(process.env.LEGACY_TEST_TEMP||tmpdir(),'asset-quota-'));
process.env.AI_CENTER_DATABASE_PATH=path.join(dir,'ai.sqlite');
const {CenterStore}=await import('../lib/ai-center/store.ts');
const {generateTray}=await import('../lib/ai-center/stl.ts');
const store=new CenterStore();
try{
 const data=generateTray({width:60,length:40,height:12,wall:2,base:2});
 process.env.AI_CENTER_ASSET_LIMIT_BYTES=String(data.length);
 const p=store.createProject({business:'mesh',name:'Quota fixture',brief:'No production data.'});
 const revised=store.addRevision(p.id,p.version,'tray.stl','First revision',data);
 assert.throws(()=>store.addRevision(p.id,revised.version,'tray2.stl','Over quota',data),/storage limit/);
 assert.equal(store.snapshot().projects[0].revisions.length,1);
 process.env.AI_CENTER_ASSET_LIMIT_BYTES='bad';
 assert.throws(()=>store.addRevision(p.id,revised.version,'tray2.stl','Bad configuration',data),/storage limit/);
 console.log('STL aggregate byte quota and rollback passed.');
}finally{store.close();delete process.env.AI_CENTER_ASSET_LIMIT_BYTES;rmSync(dir,{recursive:true,force:true});}
