'use client';
import {useState} from 'react';
export function ShippingTest(){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[label,setLabel]=useState('');
  return <div><button disabled={busy} onClick={async()=>{setBusy(true);setMessage('');setLabel('');try{const r=await fetch('/api/owner/shipping/test-label',{method:'POST'});const result=await r.json();if(!r.ok)throw Error(result.message);setMessage(`${result.warning} ${result.carrier} ${result.service}; 4×6 PNG. Fixture rate: $${(result.rateCents/100).toFixed(2)} (not a real postage charge).`);setLabel(result.labelUrl);}catch(e){setMessage(e instanceof Error?e.message:'Test unavailable.');}finally{setBusy(false);}}}>{busy?'Testing carrier…':'Generate a 4×6 test-only shipping label'}</button><p role="status">{message}</p>{label&&<a href={label} target="_blank" rel="noopener noreferrer">Open TEST label — not valid postage</a>}<p>This test refuses live keys and uses disposable sample addresses and packaging. Your real package measurements must be entered per order.</p></div>;
}
