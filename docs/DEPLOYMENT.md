# DELIADEN.CA — Deployment

## Current checkpoint — 2026-11-07 — Codex — ChatGPT Work

This checkpoint supersedes older hosting/build assumptions below. PR #1 is being reconciled with main 6baa2a2 while preserving its three newer company-document commits. Actual discovered target: existing Coolify VPS2 Deli Aden app, branch main, port3000, previously restarting on missing ADMIN_PASSWORD, with no persistent mount. Both deliaden.ca and www.deliaden.ca currently fail DNS resolution from that server; no DNS change made.

The release now defaults to a **read-only preview** via server-launch.cjs / server-preview.cjs. It serves the existing SPA and menu, displays an explicit French preview notice, returns preview-ok (not database/live-order readiness), applies noindex and blocks all customer/admin/order/payment/contact/AI API operations. It never loads operational DB/provider modules. DELI_LIVE_ORDERING=true is a separate commercial gate; production additionally requires strong admin/JWT secrets and explicit persistent database configuration. No real credential or provider account was created or changed.

Node22 frozen install, full build/typecheck, lint (0 errors;28 existing warnings), 27 synthetic tests and packaged preview HTTP checks have been run locally. Tests cover server-owned prices/options, signed Stripe webhooks, bound amount/currency/order validation, retryable DB failures, repeated/out-of-order events, anonymous tracking privacy, admin denial, explicit SMS opt-out and a disposable SQLite backup/restore. These are isolated tests, not actual Stripe/Twilio acceptance. Full functional candidate 9bede82ed97bce94de0142a120867a84fe46e173 passed CI42380599466, including the actual Docker build and preview HTTP acceptance. The first container build revealed a localhost address-family mismatch; explicit Vite preview host127.0.0.1 corrected it without skipping prerendering. Final documentation checkpoint CI and native publication receipt are tracked in PR #1.

Source tracing confirms no application serverFn uses the generated Supabase middleware. All real SPA account/order calls target Express. The unused global middleware was detached; build uses no fake credentials, and the unused generated files/project remain untouched. CI now exercises the actual container preview. The old MochaHost workflow is gated off unless DELI_DEPLOY_TARGET=mochahost-approved after separate host review. This is a change of supported deployment mode, not a waiver of commercial launch tests.

Commercial launch remains blocked: genuine restaurant settings/menu/availability, strong owner-managed credentials, persistent DB mount+offsite/restore, payment creation/refund concurrency and reconciliation, real provider tests, SMS/email consent/delivery, kitchen/driver/inventory acceptance and TAKATAK scoped identity/entitlement/event contracts. Outbound TAKATAK stays disabled. Known remaining payment limits include incomplete paginated refund reconciliation and lack of a durable transactional event outbox; do not enable live payments based on these unit/integration tests alone.

Next: verify the final documentation checkpoint CI and main CI, then deploy only the preview and verify exact revision/source digest/assets. Native image/compose and original settings are retained privately; automatic deployment is disabled, explicit Dockerfile/source argument/health check configured. No environment value, DNS, database or provider change. Final deployment receipts belong in PR #1 and the signed deployment journal. Open follow-ups: #2 current/history environment review; #3 commercial launch; #4 DNS and CI-gated automation.

Signed: Codex — ChatGPT Work.


## Actual target described by repository
MochaHost/cPanel Node.js application at deliaden.ca, served by Express server.cjs. Target is documented but live production version was not verified in this session. Do not assume Contabo/Coolify is active for this repository.

## Source of truth
GitHub repository takatakca/deli-aden-online. Migration branch codex/direct-github-takatak-migration in PR #1. Review .github/workflows/ci.yml and deploy-mochahost.yml before any release.

## Variables / secrets
GitHub Actions variables: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID (existing approved project only).
MochaHost secrets: MOCHAHOST_HOST, MOCHAHOST_USER, MOCHAHOST_APP_PATH, MOCHAHOST_SSH_KEY, MOCHAHOST_KNOWN_HOSTS; optional MOCHAHOST_PORT.
Never commit passwords, tokens or personal data.

## Release gates
1. Reproducible install, lint, syntax and build pass on exact reviewed commit.
2. Confirm dist shell and every server-*.cjs runtime module in built artifact; keep persistent database/env outside release.
3. Verify deployment preflight: SSH host key, target directory boundary, matching runtime/node modules, SHA-256 archive digest.
4. Staging health /healthz and order/admin/payment smoke checks, rollback test.
5. Reviewed PR merge to main; pipeline production deploy; external health check and deployed revision match; archive evidence in handoff.

## Rollback
Use existing workflow's guarded rollback after checking database compatibility and previous release integrity. Do not roll back irreversible DB migrations blindly.

Reference: README_MOCHAHOST.md and docs/TAKATAK_AGENT_HANDOFF.md.
