# DELIADEN.CA — Deployment

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
