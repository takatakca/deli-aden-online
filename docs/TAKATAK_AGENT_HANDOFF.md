# Deli Aden — GitHub migration and TAKATAK handoff

## Scope and ownership

- Product: Les Délices d'Aden / Deli Aden
- Repository: `takatakca/deli-aden-online`
- Work branch: `codex/direct-github-takatak-migration`
- Review: PR #1
- Customer-facing domain (intended): `https://deliaden.ca`
- Hosting target: MochaHost/cPanel Node.js
- Independent restaurant operations: orders, payments, inventory, dispatch, staff, customers
- TAKATAK master platform: `takatakca/takatak-v1`

## Rules

Deli Aden owns restaurant operations and commercial transactions. TAKATAK must
not be granted unrestricted access to the restaurant database, payment
credentials or customer history. No cross-tenant access is permitted.
The TAKATAK customer dashboard and merchant dashboard remain separate.
A central account alone does not grant Deli Aden administration rights.

## Verified repository facts

The repository contains an Express `server.cjs`, React/TanStack frontend,
MySQL and SQLite configuration, Stripe/Twilio dependencies and restaurant
operations modules. Presence of code does **not** prove that an integration
works in production.

This branch removes Lovable-specific dependencies and URLs, introduces direct
GitHub Actions workflows, and retains the existing business code.

## Integration status

| Capability | Status | Evidence / next gate |
| --- | --- | --- |
| GitHub branch and PR | CODE COMPLETE | PR #1 |
| Lovable decoupling | CODE COMPLETE | Changes on branch; build pending |
| GitHub CI | BLOCKED | Repository build variables missing |
| MochaHost automatic deployment | CODE COMPLETE | Workflow created; SSH secrets and successful release verification pending |
| Stripe payments | UNVERIFIED | Existing code; test with authorized staging account |
| Twilio messaging | UNVERIFIED | Existing code; test with authorized credentials and consent |
| Restaurant ordering | UNVERIFIED | Existing code; end-to-end tests pending |
| TAKATAK V1 identity | PLANNED | Contract and entitlement review required |
| TAKATAK outbound event adapter | CODE COMPLETE / DISABLED | `server-takatak.cjs` exists; no confirmed master ingestion contract; stay disabled |
| QMAPS/ON2GO discovery | PLANNED | Approved scopes and business use case required |

## Customer journey priorities

1. Find food quickly on mobile.
2. Choose size, options and quantity.
3. Review cart, fees, taxes and availability.
4. Place pickup/delivery order using authorized payment methods.
5. Receive confirmation and track status.

## Restaurant operations priorities

1. Receive and accept orders.
2. Prepare orders in kitchen.
3. Assign and track deliveries.
4. Maintain menu and stock.
5. Reconcile payments and handle customer support.

## No-Lovable deployment

`feature branch → PR → CI → approved merge → main CI → MochaHost artifact deployment → verified public revision`.

GitHub variables required:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`.

GitHub secrets required:
`MOCHAHOST_HOST`, `MOCHAHOST_USER`, `MOCHAHOST_APP_PATH`,
`MOCHAHOST_SSH_KEY`, `MOCHAHOST_KNOWN_HOSTS`.
`MOCHAHOST_PORT` is optional.

## Security follow-up

The previous public MCP-style tool routes were disabled in this branch until
an authenticated, rate-limited contract is reviewed. Internal public-menu
functions may be reused without exposing a public tool execution API.

## Codex verification queue

1. Install dependencies and generate a committed reproducible lockfile.
2. Run lint, TypeScript, build and Node syntax checks.
3. Verify the TanStack Start build output is compatible with the Express
   static frontend; resolve any SSR/SPA mismatch.
4. Confirm every required server module is packaged for MochaHost.
5. Test public and protected API routes and customer/admin workflows.
6. Review CSP, CSRF, session storage, webhook signatures and replay controls.
7. Check live restaurant settings and menu availability; static MCP menu
   functions must never be treated as authoritative checkout data.
8. Validate GitHub deployment rollback, including server modules and
   persistent database safety.
9. Inspect actual TAKATAK V1 contracts before implementing master auth,
   entitlements, events or cross-product identity resolution.
10. Run authorized staging tests before requesting production approval.

## Handoff

Do not claim TESTED, STAGING VERIFIED or PRODUCTION VERIFIED without actual
evidence. Continue safe changes on isolated branches and do not merge another
agent's unreviewed work.

## Deployment dependency warning (2026-10-14)

The MochaHost deployment workflow now includes `package.json` and checks for
an existing `node_modules` directory before activation. **This is only a
preflight**, not a guarantee that dependencies match the new manifest. Codex
must establish a reproducible lockfile, install production dependencies safely
on an external builder or approved server procedure, and verify the Node.js
runtime and native SQLite dependency compatibility. Do not declare the release
production-ready based on the preflight alone.

The deployment rollback now includes static assets, `.cjs` modules and
`package.json`, but a production release remains blocked until the runtime
module installation is reconciled and the rollback is verified with Codex.
Persistent application state must remain outside replaceable artifacts.

## Additional progress — 2026-10-14

- Added a public `GET /healthz` endpoint with database-aware readiness and
  no sensitive diagnostic payload. This matches the deployment workflow.
- Static frontend fallback is now mounted after customer/payment API routes,
  limited to GET/HEAD, and excludes API routes, metadata and missing assets.
- Recognized TanStack SPA `_shell.html` output. The GitHub release packager
  maps the generated shell to Express `dist/index.html`, checks the entry,
  includes every `server-*.cjs` module, and writes a revision stamp.
- MochaHost deployment checks a dedicated Deli Aden path and required runtime
  modules before activation, and checks the uploaded archive SHA-256 digest.
- Cart/menu UX: single global sticky cart CTA, stabilized category navigation,
  quantity decrement to zero removes the line, storage-write failures do not
  interrupt UI, and pre-checkout totals no longer display delivery fees not
  included in the total.
- Tightened request rate limiting to use the IP interpreted by Express's trusted
  proxy configuration, not a raw client-supplied forwarding header.
- Removed the old Lovable public MCP manifest and disabled the old OAuth
  discovery response pending a properly authenticated contract.
- Read the available TAKATAK master repository documentation and searched for
  a `merchant/events` ingestion endpoint. No confirmed matching contract was
  found in the inspected paths/results; do not enable outbound integration.
- CI build, checkout, live dependency compatibility and production rollout
  remain unverified. The current branch must not be auto-merged.
