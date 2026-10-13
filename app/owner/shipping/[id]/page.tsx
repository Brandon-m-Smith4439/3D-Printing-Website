import {cookies} from 'next/headers';
import Link from 'next/link';
import type {Metadata} from 'next';
import {z} from 'zod';
import {OWNER_COOKIE,validOwnerSession} from '@/lib/owner-auth';
import {readOwnerSecurityState} from '@/lib/owner-security';
import {CommerceStore} from '@/lib/commerce/store';
import {ShippingLabelPrint} from '@/components/ShippingLabelPrint';
import {ShippingPrintSignIn} from '@/components/ShippingPrintSignIn';
export const dynamic='force-dynamic';export const metadata:Metadata={title:'Private shipping label',robots:{index:false,follow:false}};
export default async function ShippingPrintPage({params}:{params:Promise<{id:string}>}){
 const security=await readOwnerSecurityState(),token=(await cookies()).get(OWNER_COOKIE)?.value;
 if(!validOwnerSession(token,security.sessionGeneration))return <section className="section"><div className="container"><h1>Owner sign-in required</h1><ShippingPrintSignIn/></div></section>;
 const {id}=await params;if(!z.uuid().safeParse(id).success)return <p>Invalid order.</p>;
 const store=new CommerceStore();try{
  const s=store.shippingForOrder(id);
  if(!s||!['label-ready','handed-off'].includes(s.state)||s.reviewReason||store.shippingOrder(id).status==='revoked')return <p>Label is unavailable or requires owner review.</p>;
  return <section className="section"><div className="container"><h1>Private 4×6 label</h1><Link href="/owner/business">Back to business controls</Link><ShippingLabelPrint id={id} test={s.providerMode==='test'}/></div></section>;
 }finally{store.close();}
}
