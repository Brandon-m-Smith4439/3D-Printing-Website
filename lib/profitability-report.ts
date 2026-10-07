import type { QuoteCostSnapshot } from "./pricing-types.ts";
import { quoteCostingIsComplete } from "./quote-cost-engine.ts";
import type { HistoricalProfitRecord } from "./historical-profit-types.ts";

export type ProfitabilityRange = "7d" | "30d" | "90d" | "all";
export type ProfitabilityReport = {
  range: ProfitabilityRange;
  active: {
    revenueCents: number;
    directCostCents: number;
    contributionProfitCents: number;
    contributionMarginBasisPoints: number;
    belowTargetCount: number;
    uncostedCount: number;
  };
  completed: {
    revenueCents: number;
    directCostCents: number;
    contributionProfitCents: number;
    contributionMarginBasisPoints: number;
    averageProfitCents: number;
    completedCount: number;
    uncostedCount: number;
  };
};

type RequestLike = { id: string; status: string; updatedAt: string; createdAt: string };
type QuoteLike = { id: string; requestId: string; revision: number; status: string; totalCents: number; updatedAt: string };

function margin(revenue: number, profit: number) {
  return revenue > 0 ? Math.round((profit / revenue) * 10_000) : 0;
}

function latestQuotes(quotes: QuoteLike[]) {
  const map = new Map<string, QuoteLike>();
  for (const quote of quotes) {
    if (["void", "draft"].includes(quote.status)) continue;
    const current = map.get(quote.requestId);
    if (!current || quote.revision > current.revision || (quote.revision === current.revision && quote.updatedAt > current.updatedAt)) {
      map.set(quote.requestId, quote);
    }
  }
  return map;
}

function inRange(value: string, now: Date, range: ProfitabilityRange) {
  if (range === "all") return true;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now.getTime() - timestamp <= days * 86_400_000 && timestamp <= now.getTime();
}

function bestSnapshot(requestId: string, quote: QuoteLike, snapshots: QuoteCostSnapshot[], completed: boolean) {
  const matches = snapshots.filter((snapshot) => snapshot.requestId === requestId && snapshot.quoteId === quote.id && snapshot.quoteRevision === quote.revision);
  if (completed) return matches.find((snapshot) => snapshot.status === "finalized") || matches.find((snapshot) => snapshot.status === "actual") || null;
  return matches.find((snapshot) => snapshot.status === "estimate") || matches.find((snapshot) => snapshot.status === "actual") || matches.find((snapshot) => snapshot.status === "finalized") || null;
}

export function buildProfitabilityReport(input: {
  requests: RequestLike[];
  quotes: QuoteLike[];
  snapshots: QuoteCostSnapshot[];
  historicalRecords?: HistoricalProfitRecord[];
  now: Date;
  range: ProfitabilityRange;
}): ProfitabilityReport {
  const quoteByRequest = latestQuotes(input.quotes);
  const historicalByRequest = new Map((input.historicalRecords || []).map((record) => [record.requestId, record] as const));

  let activeRevenue = 0;
  let activeCost = 0;
  let activeProfit = 0;
  let belowTarget = 0;
  let activeUncosted = 0;

  let completedRevenue = 0;
  let completedCost = 0;
  let completedProfit = 0;
  let completedCount = 0;
  let completedUncosted = 0;
  let costedCompleted = 0;

  for (const request of input.requests) {
    const quote = quoteByRequest.get(request.id);
    const historical = historicalByRequest.get(request.id);

    if (request.status === "completed") {
      const completedAt = historical?.completedAt || request.updatedAt;
      if (!inRange(completedAt, input.now, input.range)) continue;
      completedCount += 1;

      if (historical) {
        completedRevenue += historical.revenueCents;
        completedCost += historical.directCostCents;
        completedProfit += historical.contributionProfitCents;
        costedCompleted += 1;
        continue;
      }

      if (!quote) {
        completedUncosted += 1;
        continue;
      }

      const snapshot = bestSnapshot(request.id, quote, input.snapshots, true);
      if (!snapshot || !quoteCostingIsComplete(snapshot)) {
        completedUncosted += 1;
        continue;
      }

      completedRevenue += snapshot.quotedRevenueCents;
      completedCost += snapshot.directCostCents;
      completedProfit += snapshot.contributionProfitCents;
      costedCompleted += 1;
      continue;
    }

    if (request.status === "declined" || !quote) continue;
    const snapshot = bestSnapshot(request.id, quote, input.snapshots, false);
    if (!snapshot || !quoteCostingIsComplete(snapshot)) {
      activeUncosted += 1;
      continue;
    }

    activeRevenue += snapshot.quotedRevenueCents;
    activeCost += snapshot.directCostCents;
    activeProfit += snapshot.contributionProfitCents;
    if (snapshot.targetMarginBasisPoints > 0 && snapshot.contributionMarginBasisPoints < snapshot.targetMarginBasisPoints) belowTarget += 1;
  }

  return {
    range: input.range,
    active: {
      revenueCents: activeRevenue,
      directCostCents: activeCost,
      contributionProfitCents: activeProfit,
      contributionMarginBasisPoints: margin(activeRevenue, activeProfit),
      belowTargetCount: belowTarget,
      uncostedCount: activeUncosted,
    },
    completed: {
      revenueCents: completedRevenue,
      directCostCents: completedCost,
      contributionProfitCents: completedProfit,
      contributionMarginBasisPoints: margin(completedRevenue, completedProfit),
      averageProfitCents: costedCompleted ? Math.round(completedProfit / costedCompleted) : 0,
      completedCount,
      uncostedCount: completedUncosted,
    },
  };
}
