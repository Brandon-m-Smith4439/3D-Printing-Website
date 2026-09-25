import assert from 'node:assert/strict';
import { parseBambuInvoiceText } from '../lib/bambu-invoice-parser.ts';
import { bambuCatalogSeed } from '../lib/bambu-catalog-seed.ts';

const text=`
Bambu Lab
Order #US-TEST-1001
Order Date: September 20, 2026
ITEM: PLA Basic - Refill | COLOR: Black | SKU: A00-BLK-R | QTY: 4 | UNIT: $19.99 | LINE: $79.96 | DISCOUNT: $20.00
ITEM: PVA | COLOR: Natural | SKU: PVA-NAT | QTY: 1 | UNIT: $39.99 | LINE: $39.99
ITEM: Reusable Spool | SKU: SPOOL-1 | QTY: 1 | UNIT: $11.99 | LINE: $11.99
Subtotal $111.94
Order discount -$15.00
Shipping $0.00
Tax $8.12
Total $105.06
`;
const parsed=parseBambuInvoiceText(text,bambuCatalogSeed);
assert.equal(parsed.orderNumber,'US-TEST-1001');
assert.equal(parsed.orderDate,'2026-09-20');
assert.equal(parsed.subtotalCents,11194);
assert.equal(parsed.discountCents,1500);
assert.equal(parsed.shippingCents,0);
assert.equal(parsed.taxCents,812);
assert.equal(parsed.totalCents,10506);
assert.equal(parsed.lines.length,3);
assert.equal(parsed.lines[0].quantity,4);
assert.equal(parsed.lines[0].directLineDiscountCents,2000);
assert.equal(parsed.lines[0].catalogItemId,'pla-basic-refill');
assert.equal(parsed.lines[0].packageType,'refill');+assert.equal(parsed.lines[0].colorName,'Black');
assert.equal(parsed.lines[1].catalogItemId,'pva');
assert.equal(parsed.lines[2].isFilament,false);
assert.equal(parsed.parseStatus,'parsed');

const ambiguous=parseBambuInvoiceText(`Bambu Lab\nOrder #X\nOrder Date: 09/20/2026\nITEM: PLA | QTY: 1 | UNIT: $20.00 | LINE: $20.00\nSubtotal $20.00\nShipping $0.00\nTax $1.00\nTotal $21.00`,bambuCatalogSeed);
assert.equal(ambiguous.lines[0].catalogItemId,'');
assert.equal(ambiguous.parseStatus,'review-required');
assert.ok(ambiguous.warnings.length>0);

const badTotals=parseBambuInvoiceText(`Bambu Lab\nOrder #X2\nOrder Date: 09/20/2026\nITEM: PLA Basic - Refill | QTY: 1 | UNIT: $19.99 | LINE: $19.99\nSubtotal $19.99\nTax $1.00\nTotal $99.99`,bambuCatalogSeed);
assert.equal(badTotals.parseStatus,'review-required');
assert.match(badTotals.warnings.join(' '),/total/i);
console.log('Bambu invoice parser checks passed.');
