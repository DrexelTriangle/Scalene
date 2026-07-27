# Scalene
The Triangle Website, but like, Astro!

# Operations
Production is https://www.thetriangle.org. Merging to `main` needs CI green and a review, and the deploy then waits for an approval on the `production` environment before it touches the server. Once both clear, **Deploy production** runs the server's deploy script. There's no unattended path to production, by design.

Two manual buttons live in the Actions tab:

**Restart production** — re-runs the deploy script against current `main`. Reach for it when the site is broken but `main` is fine: the process is wedged, a deploy half-finished, the box got rebooted. It rebuilds and restarts; it changes no code. It waits on the same `production` approval, so you still need someone to click it.

**Rollback production** — takes a merged PR number and opens a PR reverting it. It does *not* deploy, and opening the PR needs no approval. Merging that revert PR is what ships the rollback, so it needs CI and a review, and then the deploy needs the `production` approval like any other. Reach for it when a specific PR broke production and you want it gone.

Rolling back is a revert, not an un-merge. Once a revert lands, re-merging the original branch restores **nothing** — git already counts those commits as part of `main`. To ship the work later, revert the revert.

Both buttons roll back code only. Neither touches the database or anything else with state.

# Project Setup
- installed astro
- added tailwind to project
- added react-router-dom

## Local HTTPS Cert Trust
- `npm run dev`, `npm run build`, and `npm run preview` now auto-detect `localhost.crt` at:
  - `../triangle-cms/server/certs/localhost.crt`
  - `./triangle-cms/server/certs/localhost.crt`
- You can override the cert path with `LOCALHOST_CERT_PATH`.
- This makes Node's `fetch` trust the self-signed `triangle-cms` cert at `https://localhost:8080` during local development.

### Override cert path examples
- macOS/Linux:
  - `LOCALHOST_CERT_PATH=/full/path/to/localhost.crt npm run build`
- Windows cmd:
  - `set LOCALHOST_CERT_PATH=C:\full\path\to\localhost.crt&& npm run build`
- Windows PowerShell:
  - `$env:LOCALHOST_CERT_PATH='C:\full\path\to\localhost.crt'; npm run build`
