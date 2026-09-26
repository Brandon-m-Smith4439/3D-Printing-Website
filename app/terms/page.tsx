import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOMER_POLICY_EFFECTIVE_DATE, CUSTOMER_POLICY_VERSION } from "@/lib/customer-policies";

export const metadata: Metadata = {
  title: "Terms",
  description: "Mesh Harbor 3D custom-order terms covering quotes, payments, cancellations, production, customer files, and fulfillment.",
};

export default function TermsPage() {
  return (
    <section className="section page-hero">
      <div className="container policy-page">
        <p className="eyebrow">CUSTOM ORDER TERMS</p>
        <h1>Clear terms before a print goes into production.</h1>
        <p className="lead">These terms explain the standard Mesh Harbor 3D custom-order process. Your specific quote may add project-specific requirements. If a project-specific quote term conflicts with a general term below, the accepted quote controls for that order.</p>
        <div className="policy-version"><span>Effective {CUSTOMER_POLICY_EFFECTIVE_DATE}</span><span>Policy {CUSTOMER_POLICY_VERSION}</span></div>

        <h2>Requests are not orders</h2>
        <p>Submitting a custom request starts a review. It does not obligate Mesh Harbor 3D to produce the item and does not create a payment obligation. Feasibility, scope, material, timing, fulfillment, and price are confirmed in a formal quote.</p>

        <h2>Quote approval</h2>
        <p>A quote is accepted only when the customer approves the current quote revision while signed in to a verified customer account. Approval applies to the price, project specifications, fulfillment method, owner notes, quote terms, and the customer policy version shown at the time of approval. A later quote revision replaces the prior unaccepted revision.</p>

        <h2>50% deposit and final balance</h2>
        <p>Unless a written quote says otherwise, 50% of the approved total is required before production begins. The remaining balance is due before carrier shipment and before the completed item is handed over for local pickup or local delivery. Stripe-hosted payment pages handle card information; Mesh Harbor 3D does not store full card numbers on this website.</p>

        <h2>Changes after approval</h2>
        <p>Changes to quantity, dimensions, material, color, assembly, turnaround, shipping, delivery, or other scope can require a revised quote. A revised quote may change the total, required deposit, estimated completion date, shipping cost, or other terms. Production should not proceed on changed scope until the revision and any required payment adjustment are resolved.</p>

        <h2>Cancellations, deposits, and refunds</h2>
        <p>Before materials are committed or production work begins, a cancellation may qualify for a full or partial deposit refund depending on the work already performed and nonrecoverable costs. After materials have been purchased, design/setup work has been completed, or printing has begun, the deposit may be applied to materials, machine time, labor, failed or test prints reasonably required for the job, and other work already performed. Any project-specific cancellation or refund language in the accepted quote also applies.</p>

        <h2>3D-print characteristics and tolerances</h2>
        <p>Fused-filament and resin prints can show layer lines, support marks, seams, small color variation, minor surface variation, and dimensional tolerance that differ from injection-molded or machined parts. Functional fit requirements and critical dimensions should be identified before quoting. Unless the accepted quote states a specific tolerance or certification, custom prints are not represented as precision-certified, safety-certified, food-safe, medical, structural, or life-safety components.</p>

        <h2>Customer-provided files and rights</h2>
        <p>The customer is responsible for having permission to provide and reproduce any model, image, logo, character, design, trademark, or other protected material submitted with a request. Mesh Harbor 3D may decline a project when ownership, authorization, safety, or lawful use is unclear.</p>

        <h2>Design and file review</h2>
        <p>Customer-provided models may require repair, resizing, orientation, supports, splitting, or other print-preparation work. A file that opens successfully is not a guarantee that it can be manufactured as requested. Any material design work, model modification, or assembly labor should be described in the quote.</p>

        <h2>Turnaround estimates</h2>
        <p>Estimated-ready dates are targets rather than guarantees unless the accepted quote expressly states otherwise. Printer failures, material availability, reprints, customer changes, shipping delays, weather, and other conditions can affect timing. Rush fees reserve scheduling priority but do not override safety, quality, or events outside Mesh Harbor 3D&apos;s control.</p>

        <h2>Fulfillment</h2>
        <p>Pickup, local delivery, and carrier shipping each have separate operational rules. Review the <Link href="/fulfillment">Fulfillment Policy</Link> before approving a quote. Shipping charges can change when the packed dimensions, weight, destination, or carrier service changes before quote approval.</p>

        <h2>Completed orders and unclaimed pickup</h2>
        <p>Customers should arrange pickup or delivery promptly after an order is marked Ready and the final balance is paid. If an order remains unclaimed for an extended period, Mesh Harbor 3D may contact the customer to arrange a new handoff. Any special storage deadline or fee must be disclosed before it is applied.</p>

        <h2>Questions before approval</h2>
        <p>If anything in the quote or these terms does not match your expectations, use the counter-offer or contact workflow before approving the quote. Approval should happen only after the scope and terms are understood.</p>
      </div>
    </section>
  );
}
