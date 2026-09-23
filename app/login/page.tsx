import type { Metadata } from "next";
import { LoginPanel } from "@/components/LoginPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Login", robots: { index: false, follow: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const initialMode = params.mode === "register" ? "register" : "login";

  return (
    <section className="section account-page">
      <div className="container account-page-shell">
        <LoginPanel adminMode={params.admin === "1"} initialMode={initialMode} />
      </div>
    </section>
  );
}
