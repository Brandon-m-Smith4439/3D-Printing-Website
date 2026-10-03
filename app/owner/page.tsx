import type { Metadata } from "next";
import { OwnerQueueManager } from "@/components/OwnerQueueManager";

export const metadata: Metadata = { title: "Owner Dashboard", robots: { index: false, follow: false } };

export default function OwnerPage() {
  return (
    <section className="section page-hero owner-page">
      <div className="container">
        <div className="section-heading page-heading owner-page-heading">
          <p className="eyebrow">PRIVATE MANAGEMENT</p>
          <h1>Owner Dashboard.</h1>
          <p>Quote requests, manage production, and keep an eye on profit and service health.</p>
        </div>
        <OwnerQueueManager />
      </div>
    </section>
  );
}
