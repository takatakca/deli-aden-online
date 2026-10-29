# DELIADEN.CA — Decisions

2026-10-15 — Continue PR #1 migration branch rather than rebuilding or rewriting functional restaurant code. GitHub remains source of truth.

2026-10-15 — Keep MochaHost/cPanel as documented target until infrastructure verification shows a different approved target; do not redirect to Contabo/Coolify on assumption.

2026-10-15 — Separate formatting checks from substantive ESLint: Prettier reported thousands of formatting findings obscuring code diagnostics. Formatting remains a tracked P2 task, not a waiver for actual syntax/security defects.

2026-10-15 — Production gate stays closed until CI, staging checkout, Stripe/Twilio, runtime modules, health and rollback are verified. No unreviewed auto-merge.

Architecture — TAKATAK central identity authority, product-level entitlement and strict tenant isolation. Deli Aden retains independent merchant operations and payments; no direct master database exposure. Don't enable TAKATAK outbound events without a confirmed contract.

Security — Never publish .env, admin passwords, Stripe/Twilio secrets or SSH keys; use GitHub protected variables/secrets and separate persistent data from releases.
