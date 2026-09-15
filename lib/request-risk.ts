import type { CustomRequest } from "@/lib/request-schema";

export type RequestRiskAssessment = {
  block: boolean;
  review: boolean;
  reasons: string[];
};

function combinedText(values: CustomRequest) {
  return [
    values.name,
    values.email,
    values.phone,
    values.dimensions,
    values.colorPreference,
    values.budget,
    values.referenceUrl,
    values.description,
  ].join(" \n ").toLowerCase();
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

/**
 * Conservative scam heuristics for common custom-order payment scams.
 * High-confidence combinations are rejected. Single suspicious indicators are
 * preserved as an owner-only review flag so legitimate customers are not blocked.
 */
export function assessCustomRequestRisk(values: CustomRequest): RequestRiskAssessment {
  const text = combinedText(values);
  const reasons: string[] = [];

  const mentionsCheck = has(text, /\b(cashier'?s?|certified|bank)\s+check\b|\bcheque\b/i);
  const mentionsOverpayment = has(text, /\b(overpay(?:ment|ing)?|extra\s+(?:money|payment)|excess\s+(?:money|payment)|difference\s+back)\b/i);
  const asksToForwardMoney = has(text, /\b(send|forward|refund|return|reimburse|transfer)\b.{0,55}\b(money|funds|difference|balance|extra|excess)\b/i);
  const mentionsThirdPartyPayee = has(text, /\b(mover|courier|shipper|shipping\s+agent|pickup\s+agent|driver|delivery\s+agent)\b/i);
  const mentionsGiftCards = has(text, /\b(gift\s*card|itunes\s*card|apple\s*card|steam\s*card|google\s*play\s*card)\b/i);
  const giftCardPayment = mentionsGiftCards && has(text, /\b(payment|pay\s+with|card\s+code|card\s+codes|redeem|pin\s+number|send\s+(?:the\s+)?(?:card|code))\b/i);
  const mentionsCrypto = has(text, /\b(bitcoin|crypto(?:currency)?|ethereum|usdt|tether)\b/i);
  const cryptoPayment = mentionsCrypto && has(text, /\b(payment|pay|transfer|wallet|send\s+(?:money|funds|crypto))\b/i);
  const thirdPartyPayment = mentionsThirdPartyPayee && has(text, /\b(pay|payment|send|forward|transfer|reimburse)\b/i);
  const asksSensitiveBanking = has(text, /\b(routing\s+number|bank\s+account|online\s+banking|bank\s+login|login\s+credentials|one[- ]time\s+(?:code|password)|\botp\b)\b/i);
  const asksToShareSensitive = has(text, /\b(send|share|provide|give|text|email)\b.{0,45}\b(code|password|login|routing|account)\b/i);

  const highConfidence =
    (mentionsOverpayment && asksToForwardMoney) ||
    (mentionsCheck && thirdPartyPayment && (mentionsOverpayment || asksToForwardMoney)) ||
    giftCardPayment ||
    (cryptoPayment && asksToForwardMoney) ||
    (asksSensitiveBanking && asksToShareSensitive);

  if (mentionsCheck) reasons.push("Mentions check-based payment");
  if (mentionsOverpayment) reasons.push("Mentions overpayment or excess funds");
  if (thirdPartyPayment) reasons.push("Mentions payment to a third-party courier/mover");
  if (giftCardPayment) reasons.push("Mentions gift-card payment");
  if (cryptoPayment) reasons.push("Mentions cryptocurrency payment");
  if (asksSensitiveBanking) reasons.push("Mentions sensitive banking or verification information");

  return {
    block: highConfidence,
    review: !highConfidence && reasons.length > 0,
    reasons,
  };
}
