import 'server-only';
import {stripeClient,stripeKeyMode} from '@/lib/stripe-client';
import {CommerceStore} from './store.ts';
// Read-only Stripe recovery. Never expires, refunds or charges a session remotely.
export async function reconcileOrder(store:CommerceStore,id:string){const o=store.overview().orders.find(o=>o.id===id);if(!o||!o.sessionId||o.live!==(stripeKeyMode()==='live'))throw Error('Matching configured Stripe session required.');const session=await stripeClient().checkout.sessions.retrieve(o.sessionId);if(session.payment_status==='paid')store.paid(session);else if(session.status==='expired')store.expire(session);else throw Error('Stripe session is still open/pending; stock remains reserved.');}
