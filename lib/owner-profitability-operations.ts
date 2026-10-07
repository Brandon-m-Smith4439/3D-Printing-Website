import type { QuoteCostSnapshot } from './pricing-types.ts';
import { buildProfitabilityReport } from './profitability-report.ts';
import { buildProfitabilityAttention } from './owner-profitability-attention.ts';
import type { HistoricalProfitRecord } from './historical-profit-types.ts';

type RequestLike = { id:string; requestCode:string; status:string; createdAt:string; updatedAt:string };
type QuoteLike = { id:string; requestId:string; requestCode?:string; revision:number; status:string; totalCents:number; updatedAt:string; sentAt?:string };

export function buildOwnerProfitabilityOperations(input:{
  requests:RequestLike[];
  quotes:QuoteLike[];
  snapshots:QuoteCostSnapshot[];
  historicalRecords?:HistoricalProfitRecord[];
  now:Date;
}) {
  return {
    report: buildProfitabilityReport({
      requests: input.requests,
      quotes: input.quotes,
      snapshots: input.snapshots,
      historicalRecords: input.historicalRecords,
      now: input.now,
      range: 'all',
    }),
    attention: buildProfitabilityAttention({
      requests: input.requests,
      quotes: input.quotes,
      snapshots: input.snapshots,
      now: input.now,
    }),
  };
}
