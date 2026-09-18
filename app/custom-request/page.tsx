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
    <section className="section page-hero custom-request-page">
      <div className="container custom-request-shell">
        <div className="custom-request-heading">
          <div>
            <p className="eyebrow">CUSTOM 3D PRINT REQUEST</p>
            <h1>Tell me what you want to make.</h1>
            <p className="lead">Send the details once, review the summary as you go, and I&apos;ll respond with feasibility, pricing, and next steps within 24–48 hours.</p>
          </div>
          <div className="request-promise-card">
            <strong>Clear process. No surprise production.</strong>
            <span>Your request is reviewed first. Production starts only after you approve the formal quote and the required 50% deposit is confirmed.</span>
          </div>
        </div>

        <div className="request-stepper" aria-label="Custom request workflow">
          <div className="is-active"><span>1</span><div><strong>Request details</strong><small>Tell me about the project</small></div></div>
          <i aria-hidden="true" />
          <div><span>2</span><div><strong>Quote & review</strong><small>Confirm scope and price</small></div></div>
          <i aria-hidden="true" />
          <div><span>3</span><div><strong>Deposit & production</strong><small>50% deposit starts the job</small></div></div>
        </div>

        <CustomRequestForm minNeededBy={minNeededBy} initialCustomer={customer ? { displayName: customer.displayName, email: customer.email } : null} />
      </div>
    </section>
  );
}
