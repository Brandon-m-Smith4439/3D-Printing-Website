'use client';
import {useEffect,useState} from 'react';
import type {launchReadiness} from '@/lib/ai-center/readiness';
import styles from './AiBusinessCenter.module.css';
export function LaunchReadiness(){
 const [data,setData]=useState<ReturnType<typeof launchReadiness>|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
 async function refresh(){try{const r=await fetch('/api/owner/business/readiness',{cache:'no-store'});if(!r.ok)throw Error('Unable to check launch configuration.');setData(await r.json());setError('');}catch{setError('Unable to check launch configuration.');}}
 useEffect(()=>{void refresh();},[]);
 async function backup(){setSaving(true);setMessage('');try{const r=await fetch('/api/owner/business/backup',{method:'POST'});const value=await r.json();if(!r.ok)throw Error(value.message);setMessage(value.message);}catch(e){setError(e instanceof Error?e.message:'Backup failed.');}finally{setSaving(false);}}
 return <article className={styles.card}><h2>Launch setup & owner actions</h2><p>Starting AI budget: $25/month, configurable in the settings below. Configuration presence is separate from a verified connection or launch approval.</p><button type="button" onClick={()=>void refresh()}>Check setup</button><button type="button" disabled={saving} onClick={()=>void backup()}>Save private database snapshot</button>{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}{data&&<><div className={styles.grid}>{data.checks.map(c=><div key={c.id}><h3>{c.label}</h3><p><strong>{c.status==='ready'?'Configured':c.status==='off'?'Disabled':'Owner setup needed'}</strong></p><p>{c.detail}</p></div>)}</div><p className={styles.muted}>{data.limitations}</p></>}</article>;
}
