# DELIADEN.CA — Agent handoff

## Current checkpoint — 2026-11-07 — Codex — ChatGPT Work

This checkpoint supersedes older hosting/build assumptions below. PR #1 is being reconciled with main 6baa2a2 while preserving its three newer company-document commits. Actual discovered target: existing Coolify VPS2 Deli Aden app, branch main, port3000, previously restarting on missing ADMIN_PASSWORD, with no persistent mount. Both deliaden.ca and www.deliaden.ca currently fail DNS resolution from that server; no DNS change made.

The release now defaults to a **read-only preview** via server-launch.cjs / server-preview.cjs. It serves the existing SPA and menu, displays an explicit French preview notice, returns preview-ok (not database/live-order readiness), applies noindex and blocks all customer/admin/order/payment/contact/AI API operations. It never loads operational DB/provider modules. DELI_LIVE_ORDERING=true is a separate commercial gate; production additionally requires strong admin/JWT secrets and explicit persistent database configuration. No real credential or provider account was created or changed.

Node22 frozen install, full build/typecheck, lint (0 errors;28 existing warnings), 27 synthetic tests and packaged preview HTTP checks have been run locally. Tests cover server-owned prices/options, signed Stripe webhooks, bound amount/currency/order validation, retryable DB failures, repeated/out-of-order events, anonymous tracking privacy, admin denial, explicit SMS opt-out and a disposable SQLite backup/restore. These are isolated tests, not actual Stripe/Twilio acceptance. Final candidate CI/native verification remains pending.

Source tracing confirms no application serverFn uses the generated Supabase middleware. All real SPA account/order calls target Express. The unused global middleware was detached; build uses no fake credentials, and the unused generated files/project remain untouched. CI now exercises the actual container preview. The old MochaHost workflow is gated off unless DELI_DEPLOY_TARGET=mochahost-approved after separate host review. This is a change of supported deployment mode, not a waiver of commercial launch tests.

Commercial launch remains blocked: genuine restaurant settings/menu/availability, strong owner-managed credentials, persistent DB mount+offsite/restore, payment creation/refund concurrency and reconciliation, real provider tests, SMS/email consent/delivery, kitchen/driver/inventory acceptance and TAKATAK scoped identity/entitlement/event contracts. Outbound TAKATAK stays disabled. Known remaining payment limits include incomplete paginated refund reconciliation and lack of a durable transactional event outbox; do not enable live payments based on these unit/integration tests alone.

Next: publish the reconciled candidate, require full native-container CI, preserve native rollback/configuration, then deploy only the preview and verify exact revision/source digest/assets. Final receipts belong in PR #1 and the signed deployment journal.

Signed: Codex — ChatGPT Work.


Updated: 2026-10-16 America/Toronto

## Update 2026-10-28 — diagnostic compilation and pricing tests
- Added `node --test tests/server-pricing.test.cjs` to CI: genuine catalogue prices, forged prices, required choices, combo premiums, unavailable products, stale overrides and limits.
- CI now attempts the actual `npm run build` (Vite + TypeScript) with explicitly fake compile-only Supabase values **only if** repository variables are absent. Its build artifacts are not production artifacts.
- The real GitHub variable check is still mandatory, now **after** compilation. Missing any of the three real variables MUST fail the overall job; the production `workflow_run` remains gated on success. The independent deploy workflow rebuilds with the approved real variables.
- Lockfile, MochaHost credentials, staging checkout, real payment and live deployment remain unverified. Do not merge or deploy just because the diagnostic build passes.

## Last completed task
Confirmed CI runs 38843754353 and 38843748257 PASS dependency install, catalogue export, lint and server syntax; both FAIL only at Validate browser configuration (Supabase vars missing). No build executed. Confirmed package-lock.json is absent on PR branch. Production deploy workflow remains conditional on success of main CI.

Fixed seven substantive ESLint errors identified in CI run 38843570100 (empty catch handling, const assignment, admin menu loop), commits a50ae116, e15bb59a, 9a1ff44d and 1c40cbda.

Diagnosed PR #1 CI failure: run 38843409163 succeeded at npm dependency install and menu export, then failed lint (2118 findings, mainly formatting). Updated eslint.config.js to remove Prettier's presentation-only rules from substantive ESLint checks.

## Current task
Create/commit reproducible npm lockfile against the actual dependency tree, configure repository variables for the approved existing Supabase project, and run a real build before production merge.

## Files modified in this session
- eslint.config.js (9cfe952)
- src/lib/cart-store.ts, src/lib/realtime.ts, src/routes/admin.board.tsx, src/routes/admin.menu.tsx
- docs/PROJECT_STATUS.md, docs/TASK_QUEUE.md, docs/AGENT_HANDOFF.md, docs/DEPLOYMENT.md, docs/DECISIONS.md (documentation commits following 9cfe952)

## Last pushed commit
1c40cbdad6f8208f0e6f8107621ecd41a403b0e1 is last verified application-code commit before this handoff update. Verify branch HEAD before continuing.

## Commands / checks executed
- GitHub repository metadata, PR #1 metadata, docs directory and workflow run inspection via GitHub connector.
- Fetched GitHub Actions jobs and logs from run 38843409163; lint failed with 2094 errors, 24 warnings.
- Pushed ESLint config change. Subsequent run 38843570100 reported seven actual errors and 28 warnings; four code files patched. Post-fix CI remains to be checked.

## Known errors and blockers
- Supabase GitHub Actions variables were empty at previously inspected run 38609926578: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID.
- package-lock.json confirmed missing on migration branch. CI installs with npm install rather than npm ci; reproducibility not achieved. Native SQLite/Node 22 compatibility and runtime artifact installation not proven.
- Staging payments, Twilio consent, DB health and deployment rollback unverified.

## Deployment status
NOT VERIFIED. No successful production deploy has been confirmed during this session. PR #1 remains open; main remains the default branch.

## Required access, no secret contents
Repository GitHub Actions variables above, MochaHost SSH host/user/app-root/private-key/known-hosts secrets and access to authorized staging payment/messaging systems. Never print or commit secret values.

## Exact next action
Generate package-lock.json using npm install --package-lock-only --legacy-peer-deps with Node 22, commit it, switch CI to npm ci, then populate the three GitHub Actions variables from the approved pre-existing Supabase project and rerun CI. Next verify staged checkout and MochaHost runtime before production merge.
