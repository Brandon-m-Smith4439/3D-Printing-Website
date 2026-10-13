import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requestIsOwner} from '@/lib/owner-auth';
import {sameOrigin} from '@/lib/owner-api';
import {intakeSchema} from '@/lib/ai-center/intake';
import {createOwnerStoredRequest} from '@/lib/request-store';
export const runtime='nodejs';
export async function POST(request:NextRequest){
  if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:'Request origin was not accepted.'},{status:403});
  let body:unknown;try{const raw=await request.text();if(raw.length>12000)return NextResponse.json({message:'Draft too large.'},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({message:'Invalid draft.'},{status:400});}
  const parsed=intakeSchema.extend({key:z.string().uuid(),customerEmail:z.union([z.literal(''),z.string().trim().toLowerCase().email().max(160)]).default(''),customerPhone:z.string().trim().max(30).default(''),contactReviewed:z.boolean().default(false)}).superRefine((value,context)=>{if((value.customerEmail||value.customerPhone)&&!value.contactReviewed)context.addIssue({code:'custom',message:'Confirm the customer contact before saving.'});}).safeParse(body);
  if(!parsed.success)return NextResponse.json({message:'Check the project name, description, quantity and stage.'},{status:400});
  const {key,stage,customerEmail,customerPhone,contactReviewed,...draft}=parsed.data;
  void contactReviewed;
  const saved=await createOwnerStoredRequest({...draft,email:customerEmail,phone:customerPhone,emailNotifications:false,ownerIntakeKey:key,ownerTrackingStatus:stage,status:stage==='new'?'new':'reviewing',internalNote:'Owner-reviewed in-person intake. No payment or customer notification recorded.'});
  return NextResponse.json({message:`${saved.requestCode} saved to the owner request board.`,requestCode:saved.requestCode},{headers:{'Cache-Control':'no-store'}});
}
