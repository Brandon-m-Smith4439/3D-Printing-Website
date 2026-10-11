# AI Business Control Center MVP

The current user request is the approved scope. Add `/owner/business` and a protected API using the existing owner session and same-origin policy. Preserve all existing checkout, quote, fulfillment, and notification behavior.

Use a separate SQLite sidecar beside the existing business database (or `AI_CENTER_DATABASE_PATH`). Transactions atomically claim jobs and reserve monthly USD cents across all workers. Business metrics read the existing database in read-only mode without initialization, seeds, migrations, or writes. No external account data or credentials are copied into source.

Two engines: Mesh Harbor (operations review and draft outreach) and independent digital products (idea and listing drafts). Jobs, owner decisions, provider/model snapshots, budget reservations, usage, and an activity log are durable. Defaults: $25/month overall, $10/month per engine, local templates, paid AI disabled. Paid requests require explicit approval of the exact brief/model/cost bound. Every output requires a separate review; approval only marks it ready for manual action. There is no send, publish, payment, refund, deployment, or external spending executor.

Paid adapter: OpenAI Chat Completions, initially non-reasoning mini models only, bounded input/output, configured verified token prices, no tools, fixed endpoint, no retries. Provider abstraction also supports free local templates; additional adapters are future work. Budget accounting is a conservative application ledger, not a provider billing reconciliation. Unknown outcomes retain reservations; interrupted jobs never automatically retry. Credentials remain environment-only. Customer records are not supplied to models; owner briefs must avoid sensitive information.

Acceptance: authenticated dashboard and mutations; unauthenticated and cross-origin requests rejected; atomic limits and duplicate claims tested; errors preserve budget; drafts require review; no real revenue assumptions; real-record counts and existing costed profitability with provenance and limitations; setup and verification report; separate branch and draft PR, no merge/deploy.
