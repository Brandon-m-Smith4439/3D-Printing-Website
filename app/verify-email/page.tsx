import type { Metadata } from "next";
import { EmailVerificationPanel } from "@/components/EmailVerificationPanel";

export const metadata: Metadata = { title: "Verify Email", robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <section className="section account-page"><div className="container account-page-shell"><EmailVerificationPanel token={params.token || ""} /></div></section>;
}
