import type { QuoteCostInput } from './pricing-types.ts';

// Bambu X2D FAQ, checked 2026-10-02: steady PLA 250 W, PC 550 W
// at 25 C. These are estimates, not the 1100 W US peak rating.
export const X2D_PLA_WATTS = 250;
export const X2D_PC_WATTS = 550;
// City of Monroe Schedule R first-tier energy charge. Tax, riders and
// fixed household charges are not included. Override from the actual bill.
export const MONROE_BASE_RATE = 0.1059;

export function printerElectricity(input: Pick<QuoteCostInput, 'machineHours' | 'printerWatts' | 'electricityRatePerKwh'>) {
  const watts = input.printerWatts ?? 0;
  const rate = input.electricityRatePerKwh ?? 0;
  const kwh = Math.max(0, input.machineHours) * Math.max(0, watts) / 1000;
  return { kwh, costCents: Math.round(kwh * Math.max(0, rate) * 100) };
}

export function processingMinutes(hours: number) { return Number((hours * 60).toFixed(4)); }
export function processingHours(minutes: number) { return minutes / 60; }

// A pre-existing snapshot may already include electricity in its machine rate.
export function quoteElectricityDefaults(snapshot: {printerWatts?:number;electricityRatePerKwh?:number}|null) {
  return snapshot
    ? {printerWatts:snapshot.printerWatts??0,electricityRatePerKwh:snapshot.electricityRatePerKwh??0}
    : {printerWatts:X2D_PLA_WATTS,electricityRatePerKwh:MONROE_BASE_RATE};
}
