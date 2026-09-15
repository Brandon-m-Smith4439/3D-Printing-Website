import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileDashboard } from "@/components/ProfileDashboard";
import { currentCustomer } from "@/lib/customer-auth";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };
export default async function ProfilePage() {
  const customer = await currentCustomer();
  if (!customer) redirect("/login");
  return <section className="section page-hero"><div className="container"><ProfileDashboard customer={{ displayName: customer.displayName, email: customer.email, emailVerified: customer.emailVerified, showQueuePosition: customer.preferences.showQueuePosition }} /></div></section>;
}
