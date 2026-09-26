import type { Metadata } from "next";
import Link from "next/link";
import { getSiteContent } from "@/lib/site-content-store";
import { CUSTOMER_POLICY_EFFECTIVE_DATE, CUSTOMER_POLICY_VERSION } from "@/lib/customer-policies";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fulfillment Policy",
  description: "Local pickup, local delivery, carrier shipping, tracking, and handoff policies for Mesh Harbor 3D orders.",
};

export default async function FulfillmentPage() {
  const site = await getSiteContent();
  return (
    <section className="section page-hero">
      <div className="container policy-page">
        <p className="eyebrow">FULFILLMENT POLICY</p>
        <h1>Pickup, delivery, and shipping without surprises.</h1>
        <p className="lead">The approved quote identifies the fulfillment method for an order. Exact availability, fees, carrier services, and timing are confirmed before quote approval.</p>
        <div className="policy-version"><span>Effective {CUSTOMER_POLICY_EFFECTIVE_DATE}</span><span>Policy {CUSTOMER_POLICY_VERSION}</span></div>

        <h2>Local pickup</h2>
        <p>Local pickup is appointment-based when scheduling is enabled. Before a pickup appointment is booked, the public site shows only the general pickup area: <strong>{site.pickup.publicArea || "Monroe, NC"}</strong>. The exact address and arrival instructions are shown privately in the customer profile after a pickup time is reserved.</p>
        <p>Orders should be marked Ready and the final balance should be paid before handoff. Customers can reschedule or cancel an appointment while the order remains eligible for pickup scheduling. Pickup availability is not a promise that production will finish earlier than the quoted or displayed ready estimate.</p>

        <h2>Local delivery</h2>
        <p>Local delivery is available only when it is included in the accepted quote. The delivery area, fee, timing, and handoff details are confirmed for the specific order. A quoted delivery fee may be revised if the destination or delivery requirements change before approval.</p>

        <h2>Carrier shipping</h2>
        <p>Carrier-shipped orders use the packed weight and dimensions entered by Mesh Harbor 3D plus the customer&apos;s shipping address to request available carrier rates. The customer selects from the supported rate options before approving the quote. The selected shipping charge becomes part of the quote total and therefore affects the 50% deposit and remaining balance.</p>

        <h2>Address responsibility</h2>
        <p>Customers should verify the recipient name, street address, city, state, ZIP code, and any unit or suite information before selecting a shipping rate. Address changes after quote approval may require a new rate and revised quote. Carrier address corrections, intercepts, or reshipments can create additional charges.</p>

        <h2>Labels and tracking</h2>
        <p>A shipping label is purchased only through the owner fulfillment workflow. Tracking information is shown in the customer profile when available. A created label does not necessarily mean the carrier has possession of the package; tracking normally begins with pre-transit and updates as the carrier scans the shipment.</p>

        <h2>Carrier estimates and delays</h2>
        <p>Carrier delivery dates and transit times are estimates supplied by the carrier. Mesh Harbor 3D can package the order, purchase the selected service, and provide tracking, but cannot guarantee a carrier&apos;s delivery date after the parcel has been accepted into the carrier network.</p>

        <h2>Damage, loss, and delivery exceptions</h2>
        <p>If a package arrives visibly damaged, keep the packaging and item and contact Mesh Harbor 3D promptly with photos. Lost packages, return-to-sender events, address problems, and carrier exceptions are reviewed using the tracking record and carrier process. Replacement, refund, reshipment, or claim handling depends on the circumstances and any carrier coverage applicable to the shipment.</p>

        <h2>Final payment before fulfillment</h2>
        <p>The remaining balance is due before carrier shipment and before local pickup or local delivery handoff. The owner workflow prevents a customer order from being marked Completed while an applicable final-balance invoice remains unpaid.</p>

        <h2>Related terms</h2>
        <p>These fulfillment rules work together with the <Link href="/terms">Custom Order Terms</Link> and the specific terms shown in your approved quote.</p>
      </div>
    </section>
  );
}
