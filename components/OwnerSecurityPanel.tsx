"use client";
import { useEffect, useState } from "react";
import type { AuditEntry } from "@/lib/audit-log";

type BackupInfo={name:string;createdAt:string;databaseBytes:number;includesPrivateFiles:boolean};
type Notice={kind:"success"|"error"|"warning";text:string}|null;
export function OwnerSecurityPanel({onNotice}:{onNotice:(n:Notice)=>void}){
  const [audit,setAudit]=useState<AuditEntry[]>([]);const [backups,setBackups]=useState<BackupInfo[]>([]);const [busy,setBusy]=useState(false);
  async function load(){const [a,b]=await Promise.all([fetch("/api/owner/audit",{cache:"no-store"}),fetch("/api/owner/backups",{cache:"no-store"})]);if(a.ok){const j=await a.json() as {entries?:AuditEntry[]};setAudit(j.entries||[]);}if(b.ok){const j=await b.json() as {backups?:BackupInfo[]};setBackups(j.backups||[]);}}
  useEffect(()=>{void load();},[]);
  async function backup(){setBusy(true);try{const r=await fetch("/api/owner/backups",{method:"POST"});const j=await r.json() as {message?:string};if(!r.ok)throw new Error(j.message||"Could not create backup.");onNotice({kind:"success",text:"Secure backup snapshot created."});await load();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not create backup."});}finally{setBusy(false);}}
  return <div className="owner-security-grid">
    <section className="owner-panel"><div className="owner-panel-heading"><div><p className="eyebrow">BACKUPS</p><h2>Database & private files</h2></div><button className="button button-small" disabled={busy} onClick={()=>void backup()} type="button">{busy?"Creating…":"Create Backup"}</button></div><p className="owner-panel-intro">A daily snapshot is created when the owner dashboard checks backup status. Manual snapshots include the SQLite database and private customer-upload storage, and old backups are rotated automatically.</p><div className="backup-list">{backups.length===0?<div className="queue-empty compact"><strong>No backups yet.</strong></div>:backups.map(item=><article key={item.name}><div><strong>{item.name}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div><span>{(item.databaseBytes/1024/1024).toFixed(2)} MB DB {item.includesPrivateFiles?"+ private files":""}</span></article>)}</div></section>
    <section className="owner-panel"><div className="owner-panel-heading"><div><p className="eyebrow">AUDIT LOG</p><h2>Security & business actions</h2></div><button className="text-button" type="button" onClick={()=>void load()}>Refresh</button></div><p className="owner-panel-intro">Sensitive actions are timestamped with the actor and a privacy-preserving hashed IP marker. Raw IP addresses are not stored.</p><div className="audit-list">{audit.length===0?<div className="queue-empty compact"><strong>No audit events yet.</strong></div>:audit.map(item=><article key={item.id}><div><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString()} • {item.actor} • {item.action}</small></div><span>{item.ipHash||"system"}</span></article>)}</div></section>
  </div>;
}
