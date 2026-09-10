# CI/CD workflows

`ci.yml` validates every pull request and every push to `main` on a
GitHub-hosted runner. `deploy-production.yml` runs only after CI succeeds for a
push to `main`, on the self-hosted production runner, and calls the trusted
root-owned `deploy-scalene` script; it never checks out repository code.
`rollback-production.yml` and `restart-production.yml` are manual.

## Scheduling a feature release

`scheduled-merge.yml` merges a pull request at a time you pick, with nobody
present to click Merge. Merging `main` is what starts the deploy chain, so the
scheduled merge time is the publish time plus one deploy.

To schedule a release:

1. Open the pull request as normal and let CI go green.
2. Put a `Merge-at:` line anywhere in the pull request **description**:

   ```
   Merge-at: 2026-09-12 00:01 America/New_York
   ```

   Either a wall-clock time plus an [IANA zone][tz] (correct across daylight
   saving, and the form to prefer) or an absolute instant
   (`2026-09-12T00:01:00-04:00`, `2026-09-12T04:01:00Z`). A wall-clock time the
   spring-forward jump skips over is rejected rather than guessed at.
3. Add the `scheduled-merge` label. That label is the arming switch: no label,
   no automatic merge.

Optionally add `Merge-method: merge|squash|rebase` to the description. The
default is `squash`.

### What it checks before merging

The workflow wakes every ten minutes and, for each labelled pull request whose
`Merge-at:` has passed, refuses to merge unless the pull request is open, not a
draft, conflict-free, unblocked by branch protection, and every check run and
commit status on its head commit has **finished and passed**. A pull request
with checks still running is left alone and reconsidered on the next tick; one
with no checks at all is refused outright, so nothing unvalidated ships.

If something is actually wrong (failed checks, conflicts, still a draft), the
workflow comments with the reason, swaps the `scheduled-merge` label for
`scheduled-merge-blocked`, and stops. Dropping the label is deliberate: it
means one explanatory comment instead of one every ten minutes, and it means a
broken release never merges later "by surprise" once the problem clears. Fix the
problem and re-add the label to re-arm it.

### Timing accuracy

GitHub runs scheduled workflows on a best-effort queue and frequently several
minutes late, occasionally dropping ticks entirely under load. Read `Merge-at:`
as **not before** that time — in practice it lands within about fifteen minutes
after. Don't schedule anything that has to be exact to the minute; for a
genuinely hard deadline, merge by hand.

`workflow_dispatch` runs the same pass immediately, which is the way to test a
setup or push a release out early. Its `pr` input narrows the run to one pull
request and `dry_run` reports what would happen without merging anything.

### Required setup: `RELEASE_BOT_TOKEN`

This is the one piece that cannot live in the repository. The workflow merges
with a repository secret named `RELEASE_BOT_TOKEN` and **fails loudly if it is
missing** rather than merging without it.

The reason is a deliberate GitHub rule: a push made with the built-in
`GITHUB_TOKEN` does not trigger further workflows. The deploy chain hangs off a
`workflow_run` from a *push* to `main`, so a `GITHUB_TOKEN` merge would land the
commit and then deploy nothing at all — which is the one failure a timed release
must never have. A user or GitHub App token produces a real push event, so the
chain runs exactly as if a person had clicked Merge.

Create a fine-grained personal access token (or a GitHub App installation token)
scoped to this repository with **Contents: read and write** and **Pull requests:
read and write**, and save it as the `RELEASE_BOT_TOKEN` repository secret.
Whoever owns the token appears as the merge author, so prefer a machine account
over a person where one is available. Note that a fine-grained PAT expires:
put its expiry somewhere you will see it, because the failure mode is a release
that silently does not go out.

[tz]: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
