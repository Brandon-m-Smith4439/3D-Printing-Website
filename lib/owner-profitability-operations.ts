import type { QuoteCostSnapshot } from './pricing-types.ts';
import { buildProfitabilityReport } from './profitability-report.ts';
import { buildProfitabilityAttention } from './owner-profitability-attention.ts';

type RequestLike = { id:string; requestCode:string; status:string; createdAt:string; updatedAt:string };
type QuoteLike = { id:string; requestId:string; requestCode?:string; revision:number; status:string; totalCents:number; updatedAt:string; sentAt?:string };

export function buildOwnerProfitabilityOperations(input:{
  requests:RequestLike[];
  quotes:QuoteLike[];
  snapshots:QuoteCostSnapshot[];
  now:Date;
}) {
  return {
    report: buildProfitabilityReport({
      requests: input.requests,
      quotes: input.quotes,
      snapshots: input.snapshots,
      now: input.now,
      range: '30d',
    }),
    attention: buildProfitabilityAttention({
      requests: input.requests,
      quotes: input.quotes,
      snapshots: input.snapshots,
      now: input.now,
    }),
  };
}
