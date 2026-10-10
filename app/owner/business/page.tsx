import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { OWNER_COOKIE, validOwnerSession } from '@/lib/owner-auth';
import { readOwnerSecurityState } from '@/lib/owner-security';
import { AiBusinessCenter } from '@/components/AiBusinessCenter';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'AI Business Control Center',robots:{index:false,follow:false}};
export default async function BusinessPage() {
  const security=await readOwnerSecurityState();
  const token=(await cookies()).get(OWNER_COOKIE)?.value;
  if(!validOwnerSession(token,security.sessionGeneration))return <section className="section"><div className="container"><h1>Owner sign-in required</h1><p>Sign in on the owner dashboard, then open the Business Control Center.</p><Link href="/owner">Owner dashboard</Link></div></section>;
  return <section className="section"><div className="container"><p className="eyebrow">PRIVATE MANAGEMENT</p><h1>AI Business Control Center</h1><p>Two revenue engines. You review every draft and control the budget.</p><Link href="/owner">← Mesh Harbor owner dashboard</Link><AiBusinessCenter /></div></section>;
}
