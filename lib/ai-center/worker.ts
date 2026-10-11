import 'server-only';
import { generateDraft } from './provider.ts';
import type { DraftProvider } from './provider.ts';
import type { CenterStore } from './store.ts';

// One bounded durable job. Can be invoked by the owner API or a separate approved worker.
// Claims/reservations commit before network I/O; no transaction spans an API call.
export async function runOne(store: CenterStore, provider: DraftProvider = generateDraft) {
  const job=store.claim(); if(!job)return null;
  try { const draft=await provider(job); return store.finish(job.id,draft.text,draft.costCents,draft.image); }
  catch { return store.fail(job.id); }
}
