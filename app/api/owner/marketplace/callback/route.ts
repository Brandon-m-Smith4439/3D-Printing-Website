import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {OWNER_COOKIE} from '@/lib/owner-auth';
import {MarketplaceStore} from '@/lib/marketplace/store';
import {completeAuthorization} from '@/lib/marketplace/etsy';
import {commandText,marketplaceFailure,marketplaceJson,ownerGate,privateHeaders} from '@/lib/marketplace/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Cross-site OAuth arrival does not include the existing SameSite=Strict owner cookie.
// This public, data-free handoff establishes a same-origin document; its POST requires
// the owner cookie plus same-origin validation and the session-bound single-use state.
export async function GET(){const nonce=randomBytes(24).toString('base64');return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Etsy authorization</title><meta name="referrer" content="no-referrer"></head><body><h1>Etsy authorization</h1><p id="status">Completing authorization for the signed-in owner…</p><a href="/owner/business">Return to Business Control Center</a><script nonce="${nonce}">const p=new URLSearchParams(location.search);const code=p.get('code'),state=p.get('state');history.replaceState(null,'',location.pathname);if(!code||!state){document.getElementById('status').textContent='Authorization was declined or incomplete. Start again from the owner dashboard.';}else{fetch(location.pathname,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,state})}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.message||'Authorization failed.');location.replace('/owner/business');}).catch(e=>{document.getElementById('status').textContent=e.message;});}</script></body></html>`,{headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`}});}
export async function POST(request:NextRequest){const denied=await ownerGate(request,true);if(denied)return denied;let input:{code:string;state:string};try{input=z.object({code:z.string().min(1).max(2048),state:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(await commandText(request));}catch{return marketplaceJson({message:'Invalid authorization callback.'},400);}let store:MarketplaceStore|undefined;try{store=new MarketplaceStore();await completeAuthorization(store,request.cookies.get(OWNER_COOKIE)!.value,input.state,input.code);return marketplaceJson({message:'Etsy authorization completed for the requested scopes.'});}catch(e){return marketplaceFailure(e);}finally{store?.close();}}
