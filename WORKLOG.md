# Work log

- 2026-11-07 | Codex — ChatGPT Work | codex/direct-github-takatak-migration → PR #1 | done (source; release receipt in PR #1) | Reconciled main; frozen Node22 build/typecheck/lint,27 regressions and actual Docker preview pass CI42380599466; fixed prerender loopback | Next: require final checkpoint/main CI, native preview verification and signed PR #1 receipt; keep #2/#3/#4 open

- 2026-10-28 | ChatGPT | codex/direct-github-takatak-migration → PR #1 | code pushed; CI pending | Added security regression tests for server-owned prices/options and moved CI compile/typecheck before the real Supabase release gate using CI-only placeholders | Next: review Actions for this SHA; add genuine approved Supabase variables, create verified lockfile, stage checkout and MochaHost deployment before merge

- 2026-10-15 | ChatGPT | codex/direct-github-takatak-migration → PR #1 | CI improvement pushed; deployment blocked | Confirmed run 38609926578 failed at browser env validation (all three Supabase variables absent); reordered CI to execute lint and server syntax checks before required browser configuration gate | Next: review new CI results, configure existing Supabase project variables and MochaHost secrets, validate build and payments in staging before merge

- 2026-10-14 | ChatGPT | codex/direct-github-takatak-migration → PR #1 | code pushed; CI/deploy blocked | Server-priced checkout with verified options, strict Stripe webhook signatures, catalogue included in releases, privacy-limited public tracking and private order tokens for online/offline checkout | Next: supply Supabase variables and MochaHost secrets, validate Node 22 build, staging payments/ordering, then merge and verify live revision

- 2026-10-14 | ChatGPT | codex/direct-github-takatak-migration → PR #1 | code complete; validation pending | Hardened corrupted cart recovery and delegated Express errors after headers sent; strengthened GitHub artifact SHA-256 and app-root protection | Next: confirm CI variables, runtime dependencies, mobile cart, build, rollback and production gates with Codex

- 2026-10-14 | ChatGPT | codex/direct-github-takatak-migration → PR #1 | code complete, untested | Added DB-backed /healthz, static SPA shell normalization, checksum verification, dedicated path/runtime guards, trusted-proxy rate limiting, menu/cart fixes, and removal of Lovable MCP manifest | Codex: configure variables, generate lockfile, verify build and checkout in staging, then review release gates

- 2026-10-14 | ChatGPT | codex/direct-github-takatak-migration → PR #1 | code complete; tests deferred | Fixed Express 5 SPA fallback order, included all server modules in release, strengthened server rollback and CI-only production trigger | Codex: run build/integration tests and validate SSH/production gates


- 2026-10-10 | Codex | codex/direct-github-takatak-migration → PR #1 | blocked: CI needs GitHub Actions repository variables and MochaHost deployment secrets | Removed Lovable-specific build/runtime integration and added direct GitHub CI/deployment path | Add the required repository variables/secrets, rerun CI, then merge/deploy

Newest first, one line per piece of work. Rule: `AGENTS.md` › Work log rule.
Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

- 2026-10-08 | claude (owner setup) | default branch | done | Added the work log rule, this log and the stop reminder | every agent follows AGENTS.md › Work log rule
