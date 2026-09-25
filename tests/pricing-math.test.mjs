import assert from 'node:assert/strict';
import {
  contributionMetrics,
  costPerGramMicros,
  materialCostCents,
  paymentFeeCents,
  suggestedRevenueCents,
} from '../lib/pricing-math.ts';

assert.equal(costPerGramMicros(1999, 1000), 1999000);
assert.equal(costPerGramMicros(3999, 500), 7998000);
assert.equal(materialCostCents(250, 1999000), 500);
assert.equal(materialCostCents(0, 1999000), 0);

const feeSettings = {
  defaultPaymentFeePercentBasisPoints: 290,
  defaultPaymentFeeFixedCents: 30,
  targetContributionMarginBasisPoints: 4000,
};
assert.equal(paymentFeeCents(10000, feeSettings), 320);
assert.equal(paymentFeeCents(0, feeSettings), 0);

const suggested = suggestedRevenueCents(3000, feeSettings);
assert.equal(suggested, 5307);
const metrics = contributionMetrics(suggested, 3000, feeSettings);
assert.ok(metrics.contributionMarginBasisPoints >= 4000);
assert.equal(metrics.directCostCents, 3000 + metrics.paymentFeeCents);

assert.equal(suggestedRevenueCents(3000, { ...feeSettings, targetContributionMarginBasisPoints: 0, defaultPaymentFeePercentBasisPoints: 0, defaultPaymentFeeFixedCents: 0 }), 3000);
assert.throws(() => suggestedRevenueCents(3000, { ...feeSettings, targetContributionMarginBasisPoints: 9800, defaultPaymentFeePercentBasisPoints: 300 }), /target margin/i);
assert.throws(() => costPerGramMicros(-1, 1000), /non-negative/i);
assert.throws(() => costPerGramMicros(1000, 0), /greater than zero/i);

console.log('Pricing math checks passed.');
