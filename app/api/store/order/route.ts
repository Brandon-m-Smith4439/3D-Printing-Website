import {boundedText} from '@/lib/commerce/http';
import {NextRequest} from 'next/server';
import {sameOrigin} from '@/lib/owner-api';
import {CommerceStore} from '@/lib/commerce/store';
import {z} from 'zod';
export const runtime='nodejs';
export async function POST(r:NextRequest){if(!sameOrigin(r))return Response.json({message:'Origin rejected.'},{status:403});let s:CommerceStore|undefined;try{const text=await boundedText(r,1000);if(text.length>1000)throw Error();const v=z.object({id:z.uuid(),token:z.string().regex(/^[a-f0-9]{64}$/),productId:z.uuid().optional()}).strict().parse(JSON.parse(text));s=new CommerceStore();if(!v.productId)return Response.json(s.status(v.id,v.token),{headers:{'Cache-Control':'no-store'}});const file=s.download(v.id,v.token,v.productId);return new Response(new Uint8Array(file.data),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}catch{return Response.json({message:'Order access or download unavailable.'},{status:403});}finally{s?.close();}}
