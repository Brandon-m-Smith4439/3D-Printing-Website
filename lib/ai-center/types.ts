export type Agent = 'mesh' | 'products';
export type Kind = 'review' | 'outreach' | 'idea' | 'listing' | 'plan' | 'research' | 'design' | 'pricing' | 'image';
export const roleNames: Record<Kind,string> = {plan:'Leader',research:'Research',design:'Design & refinement',listing:'Listing',review:'Operations',outreach:'Outreach drafts',idea:'Product ideas',pricing:'Pricing & sale preparation',image:'Product image drafts'};
export type ImageConfig={enabled:boolean;model:'gpt-image-2'|'gpt-image-2-2026-04-21';inputCentsPerMillion:number;outputCentsPerMillion:number};
export type AgentConfig = {
  provider: 'template' | 'openai'; model: string; monthlyLimitCents: number;
  roleLimitsCents: Record<Kind,number>;
  inputCentsPerMillion: number; outputCentsPerMillion: number; maxOutputTokens: number;
};
export type Settings = { monthlyLimitCents: number; paidEnabled: boolean; agents: Record<Agent, AgentConfig>;images:ImageConfig };
export type Job = {
  id: string; key: string; agent: Agent; kind: Kind; brief: string; config: AgentConfig;
  status: 'spend-review' | 'queued' | 'running' | 'review' | 'ready' | 'rejected' | 'failed';
  createdAt: string; updatedAt: string; month: string; reservedCents: number; chargedCents: number | null;
  boundCents: number; output: string; reason: string;
  projectId?: string;
  projectVersion?:number;
  revisionId?:string;
  imageConfig?:ImageConfig;
  artifactId?:string;
};
