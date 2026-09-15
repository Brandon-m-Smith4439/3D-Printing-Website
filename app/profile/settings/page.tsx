import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/AccountSettings";
import { currentCustomer } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account Settings", robots: { index: false, follow: false } };

export default async function ProfileSettingsPage() {
  const customer = await currentCustomer();
  if (!customer) redirect("/login");
  return <section className="section page-hero"><div className="container"><AccountSettings /></div></section>;
}
