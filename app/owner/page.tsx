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
          <p>Manage customer requests and their production positions together, then update branding, images, and public site content from the same dashboard.</p>
        </div>
        <OwnerQueueManager />
      </div>
    </section>
  );
}
