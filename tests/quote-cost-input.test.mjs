import assert from 'node:assert/strict';
import { validateQuoteCostInput } from '../lib/quote-cost-input.ts';
const good={materialLines:[{id:'m1',catalogItemId:'pla-basic-refill',grams:200}],machineHours:4,designHours:1,laborHours:.5,postProcessingHours:.25,packagingCostCents:100,localDeliveryInternalCostCents:0,miscellaneousCostCents:50};
assert.deepEqual(validateQuoteCostInput(good),good);
assert.throws(()=>validateQuoteCostInput({...good,machineHours:-1}),/machine hours/i);
assert.throws(()=>validateQuoteCostInput({...good,materialLines:new Array(21).fill(good.materialLines[0])}),/material lines/i);
assert.throws(()=>validateQuoteCostInput({...good,materialLines:[{id:'m',catalogItemId:'',grams:100}]}),/catalog item/i);
console.log('Quote cost input validation checks passed.');
