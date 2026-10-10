export type Agent = 'mesh' | 'products';
export type Kind = 'review' | 'outreach' | 'idea' | 'listing';
export type AgentConfig = {
  provider: 'template' | 'openai'; model: string; monthlyLimitCents: number;
  inputCentsPerMillion: number; outputCentsPerMillion: number; maxOutputTokens: number;
};
export type Settings = { monthlyLimitCents: number; paidEnabled: boolean; agents: Record<Agent, AgentConfig> };
export type Job = {
  id: string; key: string; agent: Agent; kind: Kind; brief: string; config: AgentConfig;
  status: 'spend-review' | 'queued' | 'running' | 'review' | 'ready' | 'rejected' | 'failed';
  createdAt: string; updatedAt: string; month: string; reservedCents: number; chargedCents: number | null;
  boundCents: number; output: string; reason: string;
};
