import {CommerceStore} from '@/lib/commerce/store';
import {visibleCatalog} from '@/lib/commerce/catalog';
import {commerceConfig} from '@/lib/commerce/config';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){let s:CommerceStore|undefined;try{s=new CommerceStore();return Response.json({products:visibleCatalog(s).map(({id,name,description,license,physicalPriceCents,digitalPriceCents,stock,photoUrl})=>({id,name,description,license,physicalPriceCents,digitalPriceCents,stock,photoUrl})),checkoutEnabled:commerceConfig().checkoutEnabled},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({message:'Store unavailable.'},{status:503});}finally{s?.close();}}
