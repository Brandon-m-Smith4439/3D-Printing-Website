import type { Metadata } from "next";
import { CustomRequestForm } from "@/components/CustomRequestForm";
import { minimumRequestDate } from "@/lib/business-date";
import { currentCustomer } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Custom Request",
  description: "Request a custom 3D print and share project details for review and quoting.",
};

export default async function CustomRequestPage() {
  const minNeededBy = minimumRequestDate();
  const customer = await currentCustomer();
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
              <li>Your needed-by date; requests less than 3 days away may require rush pricing</li>
            </ul>
          </div>
          <div className="info-card compact-info-card">
            <h3>What happens next?</h3>
            <p>I&apos;ll review whether the job is printable, whether design work is needed, the best material, expected cost, and any rush fee for very short lead times. Nothing is treated as an order until those details are agreed on.</p>
          </div>
          <div className="security-note">
            <strong>Safer file handling</strong>
            <p>This form uses reference links instead of direct file uploads for now. Submissions are validated server-side and protected against automated abuse.</p>
          </div>
        </aside>
        <div className="form-panel">
          <div className="form-panel-heading">
            <span>Project details</span>
            <small>Required fields are marked *</small>
          </div>
          <CustomRequestForm minNeededBy={minNeededBy} initialCustomer={customer ? { displayName: customer.displayName, email: customer.email } : null} />
        </div>
      </div>
    </section>
  );
}
