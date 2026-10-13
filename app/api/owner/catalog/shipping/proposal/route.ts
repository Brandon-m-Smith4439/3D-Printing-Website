import {NextRequest,NextResponse} from 'next/server';
import {requestIsOwner} from '@/lib/owner-auth';
import {CommerceStore} from '@/lib/commerce/store';import {CenterStore} from '@/lib/ai-center/store';import {packingForOrder} from '@/lib/ai-center/order-packing';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(r:NextRequest){if(!await requestIsOwner(r))return NextResponse.json({message:'Sign in required'},{status:401,headers});if(process.env.AI_CENTER_SLICING_ENABLED!=='true')return NextResponse.json({proposal:null},{headers});const commerce=new CommerceStore(),center=new CenterStore();try{const view=commerce.overview(),order=view.orders.find(o=>o.id===r.nextUrl.searchParams.get('orderId'));const proposal=order?packingForOrder(order,view.products,center.snapshot().projects,center.slicing.snapshot().jobs,center.slicing.config()):null;return NextResponse.json({proposal},{headers});}finally{commerce.close();center.close();}}
