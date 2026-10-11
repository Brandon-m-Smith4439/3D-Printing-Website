import {mkdirSync,existsSync,realpathSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {register} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const databaseNames=['DATABASE_PATH','AI_CENTER_DATABASE_PATH','COMMERCE_DATABASE_PATH','MARKETPLACE_DATABASE_PATH'];
const disabledFlags=['AI_CENTER_WORKER_ENABLED','AI_CENTER_COORDINATOR_ENABLED','AI_CENTER_MESHY_ENABLED','CUSTOMER_FOLLOWUPS_ENABLED','CONTROL_CENTER_BACKUPS_ENABLED','ETSY_ENABLED','ETSY_WRITES_ENABLED','ETSY_RESEARCH_ENABLED','EASYPOST_LIVE_ENABLED','EASYPOST_AUTO_BUY_LABELS','STRIPE_LIVE_ENABLED'];
const disabledCredentials=['RESEND_API_KEY','AI_CENTER_OPENAI_API_KEY','AI_CENTER_MESHY_API_KEY','ETSY_APP_KEY','ETSY_SHARED_SECRET','MARKETPLACE_TOKEN_KEY','EASYPOST_API_KEY'];
function isolatedFile(value){
  if(!value||!path.isAbsolute(value))throw Error('All sandbox database paths must be explicit isolated absolute paths.');
  const file=path.resolve(value);
  const valid=location=>{const segments=location.replaceAll('\\','/').toLowerCase().split('/');return segments.includes('sandbox-data')&&!segments.includes('data')&&!segments.includes('public');};
  if(!valid(file))throw Error('Sandbox database paths must be isolated under sandbox-data, never data or public.');
  let ancestor=file;
  while(!existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
  const canonical=path.resolve(realpathSync(ancestor),path.relative(ancestor,file));
  if(!valid(canonical))throw Error('Sandbox database paths must stay isolated after resolving links.');
  return canonical;
}
export function assertSandboxEnvironment(env=process.env){
  if(env.COMMERCE_SANDBOX_FIXTURE!=='true')throw Error('Explicit COMMERCE_SANDBOX_FIXTURE=true opt-in required.');
  if(!/^(sk_test_|rk_test_).+/.test(env.STRIPE_SECRET_KEY||''))throw Error('A Stripe test credential is required.');
  const files=databaseNames.map(name=>isolatedFile(env[name]));
  if(new Set(files.map(file=>file.toLowerCase())).size!==files.length)throw Error('Sandbox databases must use distinct files.');
  if(new Set(files.map(file=>path.dirname(file).toLowerCase())).size!==1)throw Error('Sandbox databases must share one isolated sandbox-data directory.');
  if(disabledFlags.some(name=>env[name]&&env[name]!=='false')||disabledCredentials.some(name=>env[name]?.trim()))throw Error('External email, workers, Etsy and paid providers must remain disabled in this fixture.');
  if((env.COMMERCE_SANDBOX_PASSWORD||'').length<16)throw Error('A private sandbox password of at least 16 characters is required.');
  return files;
}

export async function seedCommerceSandbox(){
  const [businessFile]=assertSandboxEnvironment();
  register('./ai-center-server-loader.mjs',import.meta.url);
  // Do not import legacy production JSON from this checkout into a new sandbox DB.
  mkdirSync(path.dirname(businessFile),{recursive:true});
  const db=new DatabaseSync(businessFile);
  try{db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');db.prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)').run('legacy-json-migrated','1');}finally{db.close();}
  const {CenterStore}=await import('../lib/ai-center/store.ts');
  const {generateTray}=await import('../lib/ai-center/stl.ts');
  const {CommerceStore}=await import('../lib/commerce/store.ts');
  const {createCustomerAccount,findCustomerByEmail,markCustomerEmailVerified,verifyCustomerPassword}=await import('../lib/customer-store.ts');
  const center=new CenterStore(),commerce=new CommerceStore();
  try{
    const name='TEST ONLY — Synthetic sandbox tray';
    let project=center.snapshot().projects.find(p=>p.name===name);
    if(!project)project=center.createProject({business:'mesh',name,brief:'TEST ONLY synthetic checkout fixture. Original parametric tray. No actual demand, manufacturing, physical test or fulfillment claims.'});
    if(!project.revisions.length)project=center.addRevision(project.id,project.version,'test-only-tray.stl','TEST ONLY original generated tray; fixture geometry, not a manufactured product.',generateTray({width:60,length:40,height:12,wall:2,base:2}));
    const revision=project.revisions.at(-1);
    if(!revision.tests.length)project=center.updateProject(project.id,project.version,{action:'test',revisionId:revision.id,passed:true,notes:'TEST ONLY synthetic fixture PASS for exercising approval gates. Not physically printed or verified; illustrative 30 minutes and 18 grams, not actual business evidence.',printer:'Synthetic fixture printer',material:'Illustrative PLA',minutes:30,grams:18});
    if(!project.release)project=center.updateProject(project.id,project.version,{action:'prepare',description:'TEST ONLY synthetic fixture. Fake $1 physical print or $1 STL purchase; no real printing, shipping or business cost claims. Original 60 x 40 x 12 mm parametric tray for checkout testing.',physicalPriceCents:100,digitalPriceCents:100,costCents:20,stock:100,license:'TEST ONLY original fixture STL. Personal testing use. No product quality or manufacturing claims.',original:true});
    let product=commerce.overview().products.find(p=>p.projectId===project.id&&p.revisionId===revision.id);
    if(!product){const asset=center.projectAsset(revision.id),release=project.release;product=commerce.prepare({projectId:project.id,revisionId:revision.id,name,description:release.description,license:release.license,physicalPriceCents:release.physicalPriceCents,digitalPriceCents:release.digitalPriceCents,costCents:release.costCents,stock:release.stock,filename:asset.filename,data:asset.data,photoUrl:''});}
    if(product.status==='draft')commerce.approve(product.id);
    if(product.status==='withdrawn')throw Error('Fixture was withdrawn; use a fresh isolated sandbox database rather than restoring it.');
    const email='testcustomer@example.invalid';
    let account=await findCustomerByEmail(email);
    if(!account)account=(await createCustomerAccount('TEST ONLY Fixture Customer',email,process.env.COMMERCE_SANDBOX_PASSWORD,{emailStatusUpdates:false})).account;
    if(!account||!await verifyCustomerPassword(account,process.env.COMMERCE_SANDBOX_PASSWORD))throw Error('Existing fixture account password differs; use its original private password or fresh isolated databases.');
    if(!account.emailVerifiedAt)await markCustomerEmailVerified(account.id,email);
    return {productId:product.id,customerId:account.id};
  }finally{commerce.close();center.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{await seedCommerceSandbox();console.log('TEST ONLY isolated commerce fixture ready. No payment or external provider calls made.');}
  catch{console.error('Sandbox fixture refused or failed. Check explicit test mode, isolated paths, disabled integrations and private password configuration.');process.exitCode=1;}
}
