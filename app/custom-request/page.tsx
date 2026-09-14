import type { Metadata } from "next";
import { CustomRequestForm } from "@/components/CustomRequestForm";

export const metadata: Metadata = {
  title: "Custom Request",
  description: "Request a custom 3D print and share project details for review and quoting.",
};

export default function CustomRequestPage() {
  return (
    <section className="section page-hero">
      <div className="container request-layout">
        <aside className="request-intro">
          <p className="eyebrow">CUSTOM 3D PRINT REQUEST</p>
          <h1>Tell me what you want to make.</h1>
          <p className="lead">The more useful detail you send, the more accurate the first response and quote can be.</p>
          <div className="info-card">
            <h3>Helpful details</h3>
            <ul>
              <li>What the part or print is for</li>
              <li>Approximate size or required dimensions</li>
              <li>Quantity and preferred colors</li>
              <li>Whether it will face heat, sunlight, flexing, or impact</li>
              <li>A link to photos, a model, sketch, or inspiration</li>
            </ul>
          </div>
          <div className="security-note">
            <strong>Secure by design</strong>
            <p>This form does not accept executable files or direct uploads. Submissions are validated server-side and protected against automated abuse.</p>
          </div>
        </aside>
        <div className="form-panel">
          <CustomRequestForm />
        </div>
      </div>
    </section>
  );
}
