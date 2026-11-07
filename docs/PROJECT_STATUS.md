# DELIADEN.CA — Project status

## Current checkpoint — 2026-11-07 — Codex — ChatGPT Work

This checkpoint supersedes older hosting/build assumptions below. PR #1 is being reconciled with main 6baa2a2 while preserving its three newer company-document commits. Actual discovered target: existing Coolify VPS2 Deli Aden app, branch main, port3000, previously restarting on missing ADMIN_PASSWORD, with no persistent mount. Both deliaden.ca and www.deliaden.ca currently fail DNS resolution from that server; no DNS change made.

The release now defaults to a **read-only preview** via server-launch.cjs / server-preview.cjs. It serves the existing SPA and menu, displays an explicit French preview notice, returns preview-ok (not database/live-order readiness), applies noindex and blocks all customer/admin/order/payment/contact/AI API operations. It never loads operational DB/provider modules. DELI_LIVE_ORDERING=true is a separate commercial gate; production additionally requires strong admin/JWT secrets and explicit persistent database configuration. No real credential or provider account was created or changed.

Node22 frozen install, full build/typecheck, lint (0 errors;28 existing warnings), 27 synthetic tests and packaged preview HTTP checks have been run locally. Tests cover server-owned prices/options, signed Stripe webhooks, bound amount/currency/order validation, retryable DB failures, repeated/out-of-order events, anonymous tracking privacy, admin denial, explicit SMS opt-out and a disposable SQLite backup/restore. These are isolated tests, not actual Stripe/Twilio acceptance. Final candidate CI/native verification remains pending.

Source tracing confirms no application serverFn uses the generated Supabase middleware. All real SPA account/order calls target Express. The unused global middleware was detached; build uses no fake credentials, and the unused generated files/project remain untouched. CI now exercises the actual container preview. The old MochaHost workflow is gated off unless DELI_DEPLOY_TARGET=mochahost-approved after separate host review. This is a change of supported deployment mode, not a waiver of commercial launch tests.

Commercial launch remains blocked: genuine restaurant settings/menu/availability, strong owner-managed credentials, persistent DB mount+offsite/restore, payment creation/refund concurrency and reconciliation, real provider tests, SMS/email consent/delivery, kitchen/driver/inventory acceptance and TAKATAK scoped identity/entitlement/event contracts. Outbound TAKATAK stays disabled. Known remaining payment limits include incomplete paginated refund reconciliation and lack of a durable transactional event outbox; do not enable live payments based on these unit/integration tests alone.

Next: publish the reconciled candidate, require full native-container CI, preserve native rollback/configuration, then deploy only the preview and verify exact revision/source digest/assets. Final receipts belong in PR #1 and the signed deployment journal.

Signed: Codex — ChatGPT Work.


Updated: 2026-10-15 (America/Toronto)
Repository: takatakca/deli-aden-online
Default branch: main. Active migration PR: #1 (codex/direct-github-takatak-migration).

## Confirmed
- Existing Express / React / TanStack application retained, not rewritten.
- PR #1 contains GitHub-native CI and MochaHost deploy workflow, pricing and checkout hardening, and removal of Lovable dependencies.
- CI runs 38843754353 and 38843748257 passed dependency install, catalogue export, ESLint and server syntax; both failed at Supabase browser configuration, so build did not run.
- Commit 9cfe952 separates Prettier formatting from ESLint to expose substantive failures.

## Not verified
- Successful lint, build and deploy for latest SHA.
- Browser environment variables in GitHub Actions; previous validation found all three absent.
- Validated Stripe/Twilio integration, production orders, access controls, database migrations and rollback.
- Live MochaHost revision and health check.

Completion status: NOT production verified. See TASK_QUEUE.md and AGENT_HANDOFF.md.
