import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const customerRoute = await readFile(new URL('../app/api/account/requests/route.ts', import.meta.url), 'utf8');
for (const forbidden of [
  'directCostCents', 'contributionProfitCents', 'contributionMarginBasisPoints',
  'landedCostPerGramMicros', 'invoiceImportId', 'costingSourceSummary',
]) {
  assert.equal(customerRoute.includes(forbidden), false, `customer route must not expose ${forbidden}`);
}
assert.equal(customerRoute.includes('quote-cost'), false, 'customer route must not import quote cost storage');
assert.equal(customerRoute.includes('pricing-store'), false, 'customer route must not import pricing storage');

const invoiceListRoute = await readFile(new URL('../app/api/owner/pricing/invoices/route.ts', import.meta.url), 'utf8');
const invoiceDetailRoute = await readFile(new URL('../app/api/owner/pricing/invoices/[id]/route.ts', import.meta.url), 'utf8');
assert.match(invoiceListRoute, /privateObjectKey:_private/);
assert.match(invoiceDetailRoute, /privateObjectKey:_private/);

console.log('Pricing security source-boundary checks passed.');
