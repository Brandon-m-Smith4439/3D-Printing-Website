import {boundedText} from '@/lib/commerce/http';
import {NextRequest} from 'next/server';
import {sameOrigin} from '@/lib/owner-api';
import {customerFromRequest} from '@/lib/customer-auth';
import {startCheckout} from '@/lib/commerce/checkout';
export const runtime='nodejs';
export async function POST(r:NextRequest){if(!sameOrigin(r))return Response.json({message:'Origin rejected.'},{status:403});const customer=await customerFromRequest(r);if(!customer?.emailVerified)return Response.json({message:'Sign in with a verified customer account before Checkout.'},{status:401});try{const text=await boundedText(r,4000);if(text.length>4000)throw Error('Cart too large.');const result=await startCheckout(JSON.parse(text),customer.email,customer.id);return Response.json(result,{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({message:'Checkout unavailable. Check inventory, shipping and payment configuration. If a session was created, its inventory stays reserved until Stripe confirms expiration.'},{status:409});}}
