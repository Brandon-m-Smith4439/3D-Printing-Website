import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getSiteContent } from "@/lib/site-content-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteContent();
  return {
    title: { default: `${site.name} | Custom 3D Printing`, template: `%s | ${site.name}` },
    description: site.description,
    robots: { index: process.env.COMMERCE_SANDBOX_FIXTURE !== "true", follow: process.env.COMMERCE_SANDBOX_FIXTURE !== "true" },
    icons: { icon: "/favicon.png", apple: "/brand/mesh-harbor-3d-icon-v070.png" },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {process.env.COMMERCE_SANDBOX_FIXTURE === "true" && (
          <div role="status" style={{ padding: "12px 16px", background: "#fef3c7", color: "#78350f", textAlign: "center", fontWeight: 700 }}>
            TEST ONLY SANDBOX — Fake products and prices. Use Stripe test payment details only. No real orders or shipping.
          </div>
        )}
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
