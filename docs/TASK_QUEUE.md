# DELIADEN.CA — Task queue

## Current checkpoint — 2026-11-07 — Codex — ChatGPT Work

This checkpoint supersedes older hosting/build assumptions below. PR #1 is being reconciled with main 6baa2a2 while preserving its three newer company-document commits. Actual discovered target: existing Coolify VPS2 Deli Aden app, branch main, port3000, previously restarting on missing ADMIN_PASSWORD, with no persistent mount. Both deliaden.ca and www.deliaden.ca currently fail DNS resolution from that server; no DNS change made.

The release now defaults to a **read-only preview** via server-launch.cjs / server-preview.cjs. It serves the existing SPA and menu, displays an explicit French preview notice, returns preview-ok (not database/live-order readiness), applies noindex and blocks all customer/admin/order/payment/contact/AI API operations. It never loads operational DB/provider modules. DELI_LIVE_ORDERING=true is a separate commercial gate; production additionally requires strong admin/JWT secrets and explicit persistent database configuration. No real credential or provider account was created or changed.

Node22 frozen install, full build/typecheck, lint (0 errors;28 existing warnings), 27 synthetic tests and packaged preview HTTP checks have been run locally. Tests cover server-owned prices/options, signed Stripe webhooks, bound amount/currency/order validation, retryable DB failures, repeated/out-of-order events, anonymous tracking privacy, admin denial, explicit SMS opt-out and a disposable SQLite backup/restore. These are isolated tests, not actual Stripe/Twilio acceptance. Final candidate CI/native verification remains pending.

Source tracing confirms no application serverFn uses the generated Supabase middleware. All real SPA account/order calls target Express. The unused global middleware was detached; build uses no fake credentials, and the unused generated files/project remain untouched. CI now exercises the actual container preview. The old MochaHost workflow is gated off unless DELI_DEPLOY_TARGET=mochahost-approved after separate host review. This is a change of supported deployment mode, not a waiver of commercial launch tests.

Commercial launch remains blocked: genuine restaurant settings/menu/availability, strong owner-managed credentials, persistent DB mount+offsite/restore, payment creation/refund concurrency and reconciliation, real provider tests, SMS/email consent/delivery, kitchen/driver/inventory acceptance and TAKATAK scoped identity/entitlement/event contracts. Outbound TAKATAK stays disabled. Known remaining payment limits include incomplete paginated refund reconciliation and lack of a durable transactional event outbox; do not enable live payments based on these unit/integration tests alone.

Next: publish the reconciled candidate, require full native-container CI, preserve native rollback/configuration, then deploy only the preview and verify exact revision/source digest/assets. Final receipts belong in PR #1 and the signed deployment journal.

Signed: Codex — ChatGPT Work.


Priority and evidence-driven queue, 2026-10-15.

1. DONE — Substantive ESLint errors and server syntax checks passed in previous CI. Added server-pricing regression tests and CI diagnostic compilation (commit pending; confirm new CI evidence). Missing real Supabase variables still fail the release gate.
2. P0 — Establish lockfile reproducibility; replace npm install in CI with npm ci only after committed package-lock consistency is verified.
3. P0 — Configure existing non-billable Supabase project GitHub Actions variables VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID; do not create a new billable project or commit keys.
4. P0 — Run production-like build and confirm packaged static shell, all server modules and database persistence exclusions.
5. P0 — Confirm MochaHost deployment secrets and Node runtime, then safely test staging deployment, /healthz, rollback and checksum.
6. P0 — End-to-end authorized tests: pricing and discounts, Stripe webhook signature, cash/offline checkout, protected admin, kitchen, driver, inventory, Twilio consent and public order tracking.
7. P1 — Review TAKATAK identity/entitlement contracts and strictly tenant-scoped integration; leave unverified outbound events disabled.
8. P1 — Review PR #1, merge only after gates pass, verify deployed commit SHA and rollback path.
9. P2 — Format code separately with Prettier in a scoped reviewable change, preserving code behavior.

Never mark complete without logs, release SHA or reproducible results.
