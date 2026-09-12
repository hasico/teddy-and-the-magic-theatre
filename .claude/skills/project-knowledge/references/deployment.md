# Deployment & Operations

## Purpose

Deployment process, infrastructure, and production operations for AI agents.

---

## Deployment Platform

**Platform:** GitHub Pages

**Type:** Static hosting (client-side only, no server)

**Why this platform:** Free, deploys directly from GitHub Actions with no external account or secrets needed. Chosen over Cloudflare Pages/Netlify/Vercel specifically because Cloudflare's IP ranges are prone to collateral blocking in Russia, and the target audience is the ru-segment - reliability there matters more than PR-preview convenience.

---

## Access Information

**SSH Access:** Not applicable - static hosting, no server to access. All operations go through GitHub Actions per project policy (no direct server access except emergency debugging, which doesn't apply here).

**Credentials location:** GitHub Actions secrets (none required yet; will hold Android signing keys once Google Play packaging starts).

---

## Environment Variables

**See:** [.env.example](../../.env.example) in project root

None required currently - no API keys, no backend.

---

## Deployment Triggers

**Production:** `.github/workflows/deploy.yml` runs on push to `main`: `npm ci` → `npm test` → `npm run build` → publish `dist/` to GitHub Pages via `actions/deploy-pages`. Requires GitHub Pages source set to "GitHub Actions" in repo settings (Settings → Pages).

**CI (build+test):** `.github/workflows/ci.yml` runs on push/PR to `dev` and `main`: gitleaks secret scan → `npm ci` → `npm run lint` → `npm run build` → `npm test`.

**Staging:** Not configured - `dev` branch changes are built/tested locally before merging to `main`.

**Preview:** Not configured (see platform rationale above - traded off for RU accessibility).

---

## Pre-Deploy Checklist

Fully automated via CI once the pipeline is set up (build + test + publish on push to `main`). No manual steps expected for this static, backend-less game.

---

## Rollback Procedure

**Platform rollback:** Revert the merge commit on `main`; CI redeploys the previous build automatically.

**Manual steps if needed:** None - no database/migrations to roll back.

**Approximate time:** ~2-5 minutes (CI build + publish time).

---

## Environments

**Production:** `https://hasico.github.io/teddy-and-the-magic-theatre/` (live since 2026-09-12, Act I vertical slice) - deploys from `main` branch. The game is served under the `/teddy-and-the-magic-theatre/` subpath; Vite's `base` handles it, so all asset loads must go through `import.meta.env.BASE_URL` (see patterns.md).

No staging environment for v1.

---

## Planned: Android / Google Play

Not started. Later phase (after Acts I-III, Prologue and Finale are complete): package the same Vite/Phaser build with Capacitor into an Android app for Google Play. Requires reviewing Google Play's "Designed for Families" policy (ads/data-collection restrictions for children's apps) before submission, and a signing key stored in GitHub Actions secrets.

---

## Monitoring & Observability

<!--
SCALING HINT: If this section grows beyond ~80 lines, extract to references/monitoring.md.
If no monitoring configured, write: "Logs output to stdout only. No error tracking configured."
-->

### Logging

**Where:** Browser console only - static client-side game, no server-side logs.
**Format:** Default browser console output.

### Error Tracking

**Tool:** None configured.
**Config:** Not configured.

### Health Checks

**Endpoint:** None - static site, no backend to check.
**Checks:** N/A.

### Metrics

**Analytics:** None configured.
**Key metrics:** N/A.

### Alerts

**Tool:** None.
**Rules:** N/A.
