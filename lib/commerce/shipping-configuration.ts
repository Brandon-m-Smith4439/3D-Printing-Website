import {existsSync,realpathSync} from 'node:fs';
import path from 'node:path';

export function isolatedSandboxFile(value:string|undefined){
 if(!value||!path.isAbsolute(value))throw Error('Sandbox database paths must be explicit isolated absolute paths.');
 const file=path.resolve(value);
 const valid=(location:string)=>{const segments=location.replaceAll('\\','/').toLowerCase().split('/');return segments.includes('sandbox-data')&&!segments.includes('data')&&!segments.includes('public');};
 if(!valid(file))throw Error('Sandbox databases must be isolated under sandbox-data.');
 let ancestor=file;
 while(!existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
 const canonical=path.resolve(realpathSync(ancestor),path.relative(ancestor,file));
 if(!valid(canonical))throw Error('Sandbox databases must remain isolated after resolving links.');
 return canonical;
}
// Test aliases are confined to isolated fulfillment QA. Generic customer email
// continues to have no RESEND_API_KEY in the checkout fixture.
export function shippingSandboxEnabled(env:Record<string,string|undefined>=process.env){
 const aliases=env.CATALOG_SHIPPING_TEST_EASYPOST_API_KEY||env.CATALOG_SHIPPING_TEST_RESEND_API_KEY;
 if(env.COMMERCE_SHIPPING_SANDBOX_ENABLED!=='true'){if(aliases?.trim())throw Error('Explicit shipping sandbox opt-in required.');return false;}
 const paths=['DATABASE_PATH','AI_CENTER_DATABASE_PATH','COMMERCE_DATABASE_PATH','MARKETPLACE_DATABASE_PATH'].map(name=>isolatedSandboxFile(env[name]).replaceAll('\\','/').toLowerCase());
 const roots=paths.map(p=>p.slice(0,p.lastIndexOf('/')));
 if(env.COMMERCE_SANDBOX_FIXTURE!=='true'||env.EASYPOST_LIVE_ENABLED!=='false'||env.STRIPE_LIVE_ENABLED!=='false'||env.EASYPOST_API_KEY?.trim()||env.RESEND_API_KEY?.trim()||!/^EZTK[A-Za-z0-9_-]+$/.test(env.CATALOG_SHIPPING_TEST_EASYPOST_API_KEY||'')||!/^re_[A-Za-z0-9_-]+$/.test(env.CATALOG_SHIPPING_TEST_RESEND_API_KEY||'')||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.OWNER_SHIPPING_EMAIL||'')||paths.some(p=>!/(?:^|\/)sandbox-data\/[^/]+\.sqlite$/.test(p)||p.split('/').some(s=>['data','public','..','.'].includes(s)))||new Set(paths).size!==4||new Set(roots).size!==1)throw Error('Shipping sandbox needs isolated databases, TEST postage, locked live modes, owner mail and no generic credentials.');
 return true;
}
export function catalogCarrierCredential(env:Record<string,string|undefined>=process.env){return (shippingSandboxEnabled(env)?env.CATALOG_SHIPPING_TEST_EASYPOST_API_KEY:env.EASYPOST_API_KEY)||'';}
export function catalogLabelEmailKey(env:Record<string,string|undefined>=process.env){return (shippingSandboxEnabled(env)?env.CATALOG_SHIPPING_TEST_RESEND_API_KEY:env.RESEND_API_KEY)||'';}
