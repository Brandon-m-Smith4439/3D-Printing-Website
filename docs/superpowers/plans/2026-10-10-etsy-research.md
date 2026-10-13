# Etsy adapter implementation plan

1. Write failing behavior tests for session-bound single-use OAuth, expiry, encrypted/redacted tokens, malicious payloads and fixed-host bounded pagination.
2. Implement separate sidecar, OAuth and fixed-host read adapter. Keep defaults disabled, read-only scopes, bounded response sizes, explicit source provenance and unknown-data labels.
3. Add owner routes, strict-cookie-compatible callback handoff, research connection UI and approved-tested manual export.
4. Run isolated Node fixtures, targeted lint/types; document environment and remaining approval/configuration gates. Root agent integrates UI/CI/environment entries and performs shared build/review. Do not edit existing commerce or AI center files.
