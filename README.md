# Scalene
The Triangle Website, but like, React!



# Project Setup
- installed astro
- added tailwind to project
- added react-router-dom

# Operations
Production is https://www.thetriangle.org. Merging to `main` deploys it automatically: CI runs, then **Deploy production** runs the server's deploy script. You don't need to do anything by hand for a normal release.

Two manual buttons live in the Actions tab, for when you do:

**Restart production** — re-runs the deploy script against current `main`. Reach for it when the site is broken but `main` is fine: the process is wedged, a deploy half-finished, the box got rebooted. It rebuilds and restarts; it changes no code.

**Rollback production** — takes a merged PR number and opens a PR reverting it. It does *not* deploy. Merging that revert PR is what ships the rollback, so it still needs CI and a review. Reach for it when a specific PR broke production and you want it gone.

Rolling back is a revert, not an un-merge. Once a revert lands, re-merging the original branch restores **nothing** — git already counts those commits as part of `main`. To ship the work later, revert the revert.

Both buttons roll back code only. Neither touches the database or anything else with state.
