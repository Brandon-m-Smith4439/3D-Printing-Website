import type { QuoteCostSnapshot } from './pricing-types.ts';

export type ProfitabilityAttentionItem = {
  id: string;
  severity: 'watch';
  category: 'profitability';
  title: string;
  detail: string;
  requestId: string;
  requestCode: string;
  createdAt: string;
};

type RequestLike = { id:string; requestCode:string; status:string; createdAt:string; updatedAt:string };
type QuoteLike = { id:string; requestId:string; revision:number; status:string; updatedAt:string; sentAt?:string };

function latestQuotes(quotes: QuoteLike[]) {
  const map = new Map<string, QuoteLike>();
  for (const quote of quotes) {
    if (quote.status === 'void' || quote.status === 'draft') continue;
    const current = map.get(quote.requestId);
    if (!current || quote.revision > current.revision || (quote.revision === current.revision && quote.updatedAt >= current.updatedAt)) map.set(quote.requestId, quote);
  }
  return map;
}

export function buildProfitabilityAttention(input:{requests:RequestLike[];quotes:QuoteLike[];snapshots:QuoteCostSnapshot[];now:Date}) {
  const quoteByRequest = latestQuotes(input.quotes);
  const items: ProfitabilityAttentionItem[] = [];
  for (const request of input.requests) {
    const quote = quoteByRequest.get(request.id);
    if (!quote) continue;
    const snapshots = input.snapshots.filter((snapshot) => snapshot.requestId === request.id && snapshot.quoteId === quote.id && snapshot.quoteRevision === quote.revision);
    if (request.status === 'completed') {
      const finalized = snapshots.find((snapshot) => snapshot.status === 'finalized');
      if (!finalized) {
        items.push({
          id:`profitability:${request.id}:not-finalized`, severity:'watch', category:'profitability',
          title:'Completed job cost is not finalized',
          detail:'Finalize actual material, machine, labor, packaging, and shipping costs so completed contribution profit is accurate.',
          requestId:request.id, requestCode:request.requestCode, createdAt:request.updatedAt || request.createdAt,
        });
      }
      continue;
    }
    if (!['sent','approved','deposit-paid'].includes(quote.status)) continue;
    const estimate = snapshots.find((snapshot) => snapshot.status === 'estimate');
    if (!estimate) {
      items.push({
        id:`profitability:${request.id}:missing-costing`, severity:'watch', category:'profitability',
        title:'Quote is missing costing',
        detail:'Add Bambu material, machine, and labor estimates so expected contribution profit can be measured.',
        requestId:request.id, requestCode:request.requestCode, createdAt:quote.sentAt || quote.updatedAt || request.updatedAt,
      });
      continue;
    }
    if (estimate.targetMarginBasisPoints > 0 && estimate.contributionMarginBasisPoints < estimate.targetMarginBasisPoints) {
      items.push({
        id:`profitability:${request.id}:below-target`, severity:'watch', category:'profitability',
        title:'Quote is below target contribution margin',
        detail:`Expected margin ${(estimate.contributionMarginBasisPoints/100).toFixed(1)}% is below the ${(estimate.targetMarginBasisPoints/100).toFixed(1)}% target.`,
        requestId:request.id, requestCode:request.requestCode, createdAt:estimate.updatedAt || quote.updatedAt || request.updatedAt,
      });
    }
  }
  return items;
}
