import "server-only";
import { cp, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const RAILWAY_VOLUME = (process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
const ROOT = path.resolve((process.env.PRIVATE_STORAGE_DIR || (RAILWAY_VOLUME ? path.join(RAILWAY_VOLUME, "private") : path.join(process.cwd(), "storage", "private"))).trim());

function safeKey(key:string){
  if(!key || key.includes("..") || key.includes("\\") || path.isAbsolute(key)) throw new Error("Invalid private object key.");
  return key.replace(/^\/+/, "");
}
export function privateObjectRoot(){return ROOT;}
export function privateObjectPath(key:string){return path.join(ROOT,safeKey(key));}
export async function putPrivateObject(key:string,data:Buffer){const file=privateObjectPath(key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data,{flag:"wx"});return {key:safeKey(key),bytes:data.length};}
export async function readPrivateObject(key:string){return readFile(privateObjectPath(key));}
export async function deletePrivateObject(key:string){await unlink(privateObjectPath(key)).catch(()=>undefined);}
export async function privateObjectExists(key:string){try{return (await stat(privateObjectPath(key))).isFile();}catch{return false;}}
export async function copyPrivateObjectStore(destination:string){try{if((await stat(ROOT)).isDirectory()){await mkdir(destination,{recursive:true});await cp(ROOT,destination,{recursive:true,force:true});return true;}}catch{}return false;}
