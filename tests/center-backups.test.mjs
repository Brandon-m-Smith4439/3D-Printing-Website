import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {backupSidecars,ensureSidecarBackup}=await import('../scripts/center-backups.mjs');
const dir=mkdtempSync(path.join(process.env.LEGACY_TEST_TEMP||tmpdir(),'sidecar-backup-'));
const source=path.join(dir,'source.sqlite'),db=new DatabaseSync(source);
try{
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE test (value TEXT); INSERT INTO test VALUES (\'durable fixture\');');
 const env={DATABASE_PATH:path.join(dir,'business.sqlite'),AI_CENTER_DATABASE_PATH:source,CONTROL_CENTER_BACKUP_DIR:path.join(dir,'backups')};
 const manifest=await backupSidecars(env);
 assert.equal(manifest.files.length,1);assert.equal(manifest.files[0].name,'ai-business-center.sqlite');
 const copy=new DatabaseSync(path.join(manifest.directory,manifest.files[0].name),{readOnly:true});
 assert.equal(copy.prepare('SELECT value FROM test').get().value,'durable fixture');copy.close();
 assert.equal(JSON.parse(readFileSync(path.join(manifest.directory,'manifest.json'),'utf8')).files[0].sha256.length,64);
 assert.ok(!JSON.stringify(manifest).includes('durable fixture'));
 assert.equal(await ensureSidecarBackup({...env,CONTROL_CENTER_BACKUPS_ENABLED:'true'}),null);
 const commerce=path.join(dir,'commerce.sqlite'),extra=new DatabaseSync(commerce);
 extra.exec('CREATE TABLE fixture(id INTEGER)');extra.close();
 const updated=await ensureSidecarBackup({...env,CONTROL_CENTER_BACKUPS_ENABLED:'true'});
 assert.equal(updated.files.length,2,'A new sidecar must not be skipped by today’s earlier manifest');
 console.log('Consistent WAL sidecar snapshot and checksum manifest passed.');
}finally{db.close();rmSync(dir,{recursive:true,force:true});}
