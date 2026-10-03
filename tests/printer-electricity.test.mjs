import assert from 'node:assert/strict';
import { printerElectricity, processingHours, processingMinutes } from '../lib/printer-electricity.ts';
import { validateQuoteCostInput } from '../lib/quote-cost-input.ts';

assert.deepEqual(printerElectricity({machineHours:10,printerWatts:250,electricityRatePerKwh:.1059}),{kwh:2.5,costCents:26});
assert.deepEqual(printerElectricity({machineHours:10,printerWatts:550,electricityRatePerKwh:.1059}),{kwh:5.5,costCents:58});
assert.equal(processingHours(30),.5);
assert.equal(processingMinutes(.25),15);
assert.equal(processingMinutes(processingHours(7)),7);
// Old snapshots used a bundled machine rate. Missing electricity fields must
// remain zero instead of retroactively changing their recorded cost basis.
assert.deepEqual(printerElectricity({machineHours:10}),{kwh:0,costCents:0});
const input={materialLines:[],machineHours:2.5,designHours:.5,laborHours:0,postProcessingHours:.25,packagingCostCents:0,localDeliveryInternalCostCents:0,miscellaneousCostCents:0,printerWatts:250,electricityRatePerKwh:.1059};
assert.equal(validateQuoteCostInput(input).electricityRatePerKwh,.1059);
assert.throws(()=>validateQuoteCostInput({...input,printerWatts:-1}),/Printer watts/);
assert.throws(()=>validateQuoteCostInput({...input,electricityRatePerKwh:Infinity}),/Electricity rate/);
assert.equal(validateQuoteCostInput({...input,targetMarginBasisPoints:0}).targetMarginBasisPoints,0);
console.log('Printer electricity and time-unit checks passed.');

// Reopening a legacy estimate must not add electricity to its bundled rate.
import { quoteElectricityDefaults } from '../lib/printer-electricity.ts';
assert.deepEqual(quoteElectricityDefaults({machineHours:10}),{printerWatts:0,electricityRatePerKwh:0});
assert.deepEqual(quoteElectricityDefaults(null),{printerWatts:250,electricityRatePerKwh:.1059});
assert.deepEqual(quoteElectricityDefaults({printerWatts:160,electricityRatePerKwh:.15}),{printerWatts:160,electricityRatePerKwh:.15});
