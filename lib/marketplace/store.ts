import 'server-only';
import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';

export const tokenSchema=z.object({accessToken:z.string().regex(/^\d+\.[A-Za-z0-9_-]+$/).max(4096),refreshToken:z.string().regex(/^\d+\.[A-Za-z0-9_-]+$/).max(4096),expiresAt:z.number().int().positive(),scopes:z.array(z.string().max(40)).max(10),shopId:z.number().int().positive().safe(),userId:z.number().int().positive().safe(),shopName:z.string().min(1).max(100)}).strict();
export type EtsyToken=z.infer<typeof tokenSchema>;
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function encryptionKey(){const hex=process.env.MARKETPLACE_TOKEN_KEY||'';if(!/^[a-fA-F0-9]{64}$/.test(hex))throw Error('Configure MARKETPLACE_TOKEN_KEY as a private 32-byte hexadecimal key.');return Buffer.from(hex,'hex');}
function seal(value:unknown,purpose:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAAD(Buffer.from(purpose));const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');}
function unseal(value:string,purpose:string){const bytes=Buffer.from(value,'base64');if(bytes.length<29)throw Error('Invalid encrypted state.');const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),bytes.subarray(0,12));decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));}
export function marketplaceDatabasePath(){
 const business=path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH||path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH||path.join(process.cwd(),'data'),'3d-printing-business.sqlite'));
 const ai=path.resolve(/*turbopackIgnore: true*/ process.env.AI_CENTER_DATABASE_PATH||path.join(path.dirname(business),'ai-business-center.sqlite'));
 const commerce=path.resolve(/*turbopackIgnore: true*/ process.env.COMMERCE_DATABASE_PATH||path.join(path.dirname(business),'commerce.sqlite'));
 const file=path.resolve(/*turbopackIgnore: true*/ process.env.MARKETPLACE_DATABASE_PATH||path.join(path.dirname(business),'marketplace.sqlite'));
 if([business,ai,commerce].some(p=>p.toLowerCase()===file.toLowerCase()))throw Error('Marketplace must use a separate database.');return file;
}
export class MarketplaceStore{
 private db:DatabaseSync;
 constructor(){const file=marketplaceDatabasePath();mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS marketplace_token(id INTEGER PRIMARY KEY CHECK(id=1),cipher TEXT NOT NULL); CREATE TABLE IF NOT EXISTS marketplace_oauth(state TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL,cipher TEXT NOT NULL); CREATE TABLE IF NOT EXISTS marketplace_leases(name TEXT PRIMARY KEY,lease TEXT NOT NULL,expires INTEGER NOT NULL,last_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS marketplace_reports(id INTEGER PRIMARY KEY,at TEXT NOT NULL,json TEXT NOT NULL);');}
 close(){this.db.close();}
 private tx<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 challenge(owner:string,now=Date.now(),writes=false){
  if(!owner)throw Error('Owner session required.');const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const encrypted=seal({verifier,writes},'etsy-pkce');this.tx(()=>{this.db.prepare('DELETE FROM marketplace_oauth WHERE owner=? OR expires<=?').run(hash(owner),now);this.db.prepare('INSERT INTO marketplace_oauth VALUES(?,?,?,?)').run(hash(state),hash(owner),now+600_000,encrypted);});
  return {state,challenge:createHash('sha256').update(verifier).digest('base64url')};
 }
 consume(owner:string,state:string,now=Date.now()){
  return this.tx(()=>{const row=this.db.prepare('SELECT owner,expires,cipher FROM marketplace_oauth WHERE state=?').get(hash(state)) as {owner:string;expires:number;cipher:string}|undefined;
   if(!row||row.owner!==hash(owner)||row.expires<=now)throw Error('Authorization expired, used, or belongs to a different owner session. Start again.');
   const value=z.object({verifier:z.string().regex(/^[A-Za-z0-9_-]{43}$/),writes:z.boolean().default(false)}).strict().parse(unseal(row.cipher,'etsy-pkce'));this.db.prepare('DELETE FROM marketplace_oauth WHERE state=?').run(hash(state));return value;});
 }
 epoch(){this.db.exec('CREATE TABLE IF NOT EXISTS marketplace_epoch(id INTEGER PRIMARY KEY CHECK(id=1),generation INTEGER NOT NULL); INSERT OR IGNORE INTO marketplace_epoch VALUES(1,0);');return (this.db.prepare('SELECT generation FROM marketplace_epoch WHERE id=1').get() as {generation:number}).generation;}
 saveToken(value:EtsyToken,expectedEpoch?:number){const token=tokenSchema.parse(value),cipher=seal(token,'etsy-token');this.tx(()=>{if(expectedEpoch!==undefined&&this.epoch()!==expectedEpoch)throw Error('Authorization was removed or changed while the request ran. Start again.');this.db.prepare('INSERT INTO marketplace_token VALUES(1,?) ON CONFLICT(id) DO UPDATE SET cipher=excluded.cipher').run(cipher);});}
 token(){const row=this.db.prepare('SELECT cipher FROM marketplace_token WHERE id=1').get() as {cipher:string}|undefined;return row?tokenSchema.parse(unseal(row.cipher,'etsy-token')):null;}
 status(now=Date.now()){const token=this.token();return {connected:Boolean(token),shopName:token?.shopName||'',shopId:token?.shopId||null,expiresAt:token?new Date(token.expiresAt).toISOString():null,expired:Boolean(token&&token.expiresAt<=now),scopes:token?.scopes||[]};}
 disconnect(){this.tx(()=>{this.epoch();this.db.exec('UPDATE marketplace_epoch SET generation=generation+1 WHERE id=1; DELETE FROM marketplace_token; DELETE FROM marketplace_oauth;');});}
 lease(name:string,now=Date.now(),ttl=120_000,gap=30_000){return this.tx(()=>{const row=this.db.prepare('SELECT expires,last_at FROM marketplace_leases WHERE name=?').get(name) as {expires:number;last_at:number}|undefined;if(row&&(row.expires>now||now-row.last_at<gap))throw Error('A marketplace request is running or was just completed. Wait 30 seconds and refresh.');const id=randomUUID();this.db.prepare('INSERT INTO marketplace_leases VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET lease=excluded.lease,expires=excluded.expires,last_at=excluded.last_at').run(name,id,now+ttl,now);return id;});}
 release(name:string,id:string){this.db.prepare('UPDATE marketplace_leases SET expires=0 WHERE name=? AND lease=?').run(name,id);}
 record(report:unknown,now=Date.now()){this.tx(()=>{this.db.prepare('INSERT INTO marketplace_reports(at,json) VALUES(?,?)').run(new Date(now).toISOString(),JSON.stringify(report));this.db.exec('DELETE FROM marketplace_reports WHERE id NOT IN (SELECT id FROM marketplace_reports ORDER BY id DESC LIMIT 20)');});}
 reports(){return (this.db.prepare('SELECT json FROM marketplace_reports ORDER BY id DESC LIMIT 20').all() as {json:string}[]).map(r=>JSON.parse(r.json) as Record<string,unknown>);}
}
