import type {StripeOperationalMode} from '../stripe-mode.ts';
import {resolveStripeOperationalMode} from '../stripe-mode.ts';
export type ReadinessCheck={id:string;label:string;status:'ready'|'action'|'off';detail:string};
export function launchReadiness(env:NodeJS.ProcessEnv=process.env){
  const checks:ReadinessCheck[]=[];
  const add=(id:string,label:string,ready:boolean,detail:string)=>checks.push({id,label,status:ready?'ready':'action',detail});
  let origin=false;try{const u=new URL(env.NEXT_PUBLIC_SITE_URL||'');origin=u.protocol==='https:'&&!u.username&&!u.password;}catch{}
  add('origin','Public site address',origin,'Configure the canonical HTTPS site address before OAuth and checkout.');
  add('owner','Owner protection',(env.OWNER_PASSWORD||'').length>=14&&(env.OWNER_SESSION_SECRET||'').length>=32&&env.OWNER_SESSION_SECRET!=='replace-with-a-long-random-secret-before-production','Use existing strong owner credentials. Values are never shown here.');
  add('storage','Persistent shared storage',Boolean(env.RAILWAY_VOLUME_MOUNT_PATH),'Web and worker must run in one container with the same /data volume and one replica. Include all sidecar databases in backups.');
  add('ai-key','AI provider billing and key',Boolean(env.AI_CENTER_OPENAI_API_KEY),'A dedicated API billing account and server key are required for paid drafts. Confirm current model prices; the $25 default cap applies to this workspace.');
  add('etsy','Etsy developer app setup',Boolean(env.ETSY_APP_KEY&&env.ETSY_SHARED_SECRET&&env.ETSY_REDIRECT_URI)&&/^[a-fA-F0-9]{64}$/.test(env.MARKETPLACE_TOKEN_KEY||''),'Register the Etsy developer app and exact callback, configure private server keys, then authorize read access in the Etsy section below. Browser login does not supply ongoing API access.');
  checks.push({id:'research',label:'Daily marketplace observations',status:env.ETSY_RESEARCH_ENABLED==='true'?'ready':'off',detail:'At most one bounded keyword page per day after app authorization. Search position and favorites are proxies; competitor item sales are not verified.'});
  checks.push({id:'etsy-writes',label:'Etsy listing publication',status:env.ETSY_WRITES_ENABLED==='true'?'ready':'off',detail:'Separate write authorization and exact preview/fee approval required for each tested product. No background job publishes. Unknown outcomes require manual Etsy reconciliation.'});
  checks.push({id:'backups',label:'Control center backups',status:env.CONTROL_CENTER_BACKUPS_ENABLED==='true'?'ready':'off',detail:'Optional daily SQLite-consistent sidecar snapshots retain one completed local copy. Export encrypted marketplace state and other private data to secure off-site storage; preserve the encryption key separately. Monitor the 500MB production volume.'});
  checks.push({id:'worker',label:'Background worker',status:env.AI_CENTER_WORKER_ENABLED==='true'?'ready':'off',detail:'Disabled by default. The reviewed launcher runs web and worker together; enable only during an approved deployment.'});
  const paymentMode:StripeOperationalMode=resolveStripeOperationalMode(env.STRIPE_SECRET_KEY||'',env.STRIPE_LIVE_ENABLED==='true');
  add('payments','Store checkout configuration',['test','live'].includes(paymentMode)&&Boolean(env.COMMERCE_STRIPE_WEBHOOK_SECRET),'Configure the dedicated /api/store/webhook endpoint in a Stripe sandbox and validate Checkout there before enabling live payments. Configured keys alone do not prove connectivity.');
  add('email','Existing transactional email',Boolean(env.RESEND_API_KEY),'Reuse the verified Mesh Harbor sending domain. AI outreach remains draft-only.');
  add('tax','Tax policy reviewed',env.COMMERCE_TAX_REVIEWED==='true','Review the seller tax setup before checkout. Enable automatic tax only after configuring registrations in Stripe.');
  add('shipping','Physical shipping settings',Boolean(env.COMMERCE_SHIPPING_COUNTRIES)&&/^\d+$/.test(env.COMMERCE_SHIPPING_RATE_CENTS||''),'Set accurate shipping destinations/rate and shop policies. Website stock is allocated separately from Etsy; automatic cross-channel stock synchronization is unavailable.');
  checks.push({id:'catalog',label:'Public catalog',status:env.COMMERCE_CATALOG_ENABLED==='true'?'ready':'off',detail:'Each product additionally needs an exact passed print revision, owner-reviewed description, prices, photos/license and separate publication approval.'});
  checks.push({id:'checkout',label:'Customer checkout',status:env.COMMERCE_CHECKOUT_ENABLED==='true'?'ready':'off',detail:'Checkout stays disabled until sandbox and release approval. Existing quote checkout is separate.'});
  return {checks,configuredOnly:true,limitations:'These are local configuration checks, not proof of provider access, API billing, marketplace approval, legal/tax compliance, product safety, or successful production sales. No deployment or publication occurs from this screen.'};
}
