# DELIADEN.CA — Task queue

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
