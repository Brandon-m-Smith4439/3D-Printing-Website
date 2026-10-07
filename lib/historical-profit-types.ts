export type HistoricalProfitRecord = {
  id: string;
  requestId: string;
  requestCode: string;
  completedAt: string;
  revenueCents: number;
  directCostCents: number;
  contributionProfitCents: number;
  contributionMarginBasisPoints: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};
