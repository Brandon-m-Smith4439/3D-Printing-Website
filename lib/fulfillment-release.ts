export type FulfillmentMode = "pickup" | "shipping" | "local-delivery" | "unsure";
export type FulfillmentCheckStatus = "ready" | "attention" | "blocked";

export type FulfillmentReleaseInput = {
  hasQuote: boolean;
  fulfillmentMode: FulfillmentMode;
  depositSatisfied: boolean;
  jobStatus: string;
  finalBalancePaid: boolean;
  shippingSelected: boolean;
  trackingCode: string;
  shipmentStatus: string;
  refundStatus: string;
  pickupScheduled: boolean;
};

export type FulfillmentReleaseCheck = {
  id: "deposit" | "production" | "balance" | "fulfillment";
  label: string;
  status: FulfillmentCheckStatus;
  detail: string;
};

const invalidShipmentStatuses = new Set(["not_created", "review_required", "refund_submitted", "refunded"]);
const invalidRefundStatuses = new Set(["submitted", "refunded"]);

export function shipmentHasUsableLabel(input: Pick<FulfillmentReleaseInput, "trackingCode" | "shipmentStatus" | "refundStatus">) {
  return Boolean(
    input.trackingCode.trim()
    && !invalidShipmentStatuses.has(input.shipmentStatus)
    && !invalidRefundStatuses.has(input.refundStatus),
  );
}

export function evaluateFulfillmentRelease(input: FulfillmentReleaseInput) {
  if (!input.hasQuote) {
    return {
      canBuyShippingLabel: false,
      canComplete: true,
      checks: [] as FulfillmentReleaseCheck[],
    };
  }

  const productionReady = input.jobStatus === "ready" || input.jobStatus === "completed";
  const labelReady = shipmentHasUsableLabel(input);
  const checks: FulfillmentReleaseCheck[] = [
    {
      id: "deposit",
      label: "Deposit",
      status: input.depositSatisfied ? "ready" : "blocked",
      detail: input.depositSatisfied ? "50% deposit requirement is satisfied." : "Reconcile the current 50% deposit requirement.",
    },
    {
      id: "production",
      label: "Production",
      status: productionReady ? "ready" : "blocked",
      detail: productionReady ? "Production is Ready for fulfillment." : "Mark production Ready before fulfillment.",
    },
    {
      id: "balance",
      label: "Final balance",
      status: input.finalBalancePaid ? "ready" : "blocked",
      detail: input.finalBalancePaid ? "Final balance is paid." : "Final balance must be paid before handoff or shipment.",
    },
  ];

  if (input.fulfillmentMode === "shipping") {
    checks.push({
      id: "fulfillment",
      label: "Carrier release",
      status: labelReady ? "ready" : input.shippingSelected ? "attention" : "blocked",
      detail: labelReady
        ? `Shipping label is active with tracking ${input.trackingCode}.`
        : input.shippingSelected
          ? "Customer selected a carrier rate; owner-confirmed label purchase is still required."
          : "Customer must select a carrier service before shipping.",
    });
  } else if (input.fulfillmentMode === "pickup") {
    checks.push({
      id: "fulfillment",
      label: "Pickup handoff",
      status: input.pickupScheduled ? "ready" : "attention",
      detail: input.pickupScheduled ? "Pickup appointment is scheduled." : "Pickup can be scheduled from the customer profile when the order is Ready.",
    });
  } else if (input.fulfillmentMode === "local-delivery") {
    checks.push({
      id: "fulfillment",
      label: "Local delivery",
      status: input.finalBalancePaid && productionReady ? "ready" : "attention",
      detail: "Confirm the delivery handoff details with the customer before marking the order Completed.",
    });
  }

  return {
    canBuyShippingLabel: input.fulfillmentMode === "shipping"
      && input.depositSatisfied
      && input.jobStatus === "ready"
      && input.finalBalancePaid
      && input.shippingSelected
      && !labelReady,
    canComplete: input.depositSatisfied
      && input.finalBalancePaid
      && (input.fulfillmentMode !== "shipping" || labelReady),
    checks,
  };
}
