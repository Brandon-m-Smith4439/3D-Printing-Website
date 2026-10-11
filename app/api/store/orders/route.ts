import {boundedText} from '@/lib/commerce/http';
import {NextRequest} from 'next/server';
import {sameOrigin} from '@/lib/owner-api';
import {customerFromRequest} from '@/lib/customer-auth';
import {CommerceStore} from '@/lib/commerce/store';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:NextRequest){const customer=await customerFromRequest(r);if(!customer?.emailVerified)return Response.json({message:'Sign in with your verified customer account.'},{status:401});let s:CommerceStore|undefined;try{s=new CommerceStore();return Response.json({orders:s.customerOrders(customer.id)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({message:'Orders unavailable.'},{status:503});}finally{s?.close();}}
export async function POST(r:NextRequest){if(!sameOrigin(r))return Response.json({message:'Origin rejected.'},{status:403});const customer=await customerFromRequest(r);if(!customer?.emailVerified)return Response.json({message:'Sign in required.'},{status:401});let s:CommerceStore|undefined;try{const text=await boundedText(r,1000);if(text.length>1000)throw Error();const v=z.object({id:z.uuid(),productId:z.uuid()}).strict().parse(JSON.parse(text));s=new CommerceStore();const file=s.customerDownload(v.id,customer.id,v.productId);return new Response(new Uint8Array(file.data),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}catch{return Response.json({message:'Purchased file unavailable.'},{status:403});}finally{s?.close();}}
