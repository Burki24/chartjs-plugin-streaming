# Release process

## Branch and version contract

- `dev` is the permanent integration branch. `main` is the stable release branch.
- `package.json.version` uses `major.minor.0`, continuing the upstream 3.1.0 line.
  The patch component remains zero, matching JSLive's two-component development
  counter plus the required npm patch component.
- `.versioning.json` fixes the initial source commit and version. Count every
  reachable commit after it except subjects starting with
  `CHORE: Update package metadata`. Merge commits count too, as in JSLive.
- One new commit gives 3.2.0; three new commits give 3.4.0. Prior upstream history
  is excluded. Batched pushes and missed/superseded jobs cannot lose increments.
- Repeated runs for the same source are idempotent. Never reset the counter or
  edit the baseline casually. A major-version change or rewritten history needs
  a separate, tested baseline migration; version downgrades fail closed.
- The workflow updates `package.json`, both package-lock root versions and the
  three committed bundles together. Dependencies, package name and asset paths
  are not changed. `streamingMetadata` in `package.json` records `sourceCommit`,
  `build` (the first seven SHA digits interpreted as hexadecimal) and `date`
  (the source commit's Unix timestamp). Build numbers are identifiers, not a
  monotonic counter; use the full SHA to identify a source unambiguously.
- Tags use `v<package-version>`, for example `v3.8.0`. Development increments do
  not automatically create releases or indicate a new user-facing feature.

## One-time owner setup

1. In GitHub, rename this fork's `master` branch to `main` and make `main` the
   default branch. Preserve the branch's existing commit/history; do not replace
   it with `dev` or alter upstream branches. The first integration still uses a PR.
2. In the local clone, the maintenance change renames `master` to `main` without
   changing its commit or switching away from `dev`. After the GitHub rename:

   ```bash
   git fetch origin
   git branch --set-upstream-to=origin/main main
   git remote set-head origin -a
   ```

3. Grant the existing **Burki24 Helper Sync** GitHub App access to this fork with
   **Contents: read and write**. Make repository variable
   `HELPER_SYNC_APP_CLIENT_ID` and secret `HELPER_SYNC_APP_PRIVATE_KEY` available
   here (or include this repository in their organization-level access scope).
   Keep the private key in GitHub Secrets; never commit it or paste it into logs.
4. Permit the App's metadata commits under `dev` branch rules, without broadly
   disabling protection. Protect `main` with reviewed PRs and successful CI jobs
   `build (ubuntu-latest)`, `build (windows-latest)` and `docs`. Keep `dev` permanent.
5. Push the prepared versioning change to `dev` and wait for **Update package
   metadata**. It runs the full verification before an ordinary fast-forward
   push; it never force-pushes. If `dev` advances, the newer run counts all pending
   commits. A race at the final push fails safely; rerun for current `dev` if needed.
6. Wait for CI on the resulting metadata commit and pull it before further local
   development. The GitHub App token deliberately allows that commit to trigger
   CI; the bot-prefix guard prevents a metadata loop.

If setup was missing at the first push, configure it and rerun the failed job
for the latest `dev` commit. Manual dispatch on `dev` is also supported once the
workflow exists on the default branch. A stale rerun skips itself. Do not merge
an unverified development state into `main` merely to expose the dispatch button.

## Prepare and verify a candidate

1. Complete `CHANGELOG.md` under **Unreleased**. Run `npm run verify`,
   `npm run package`, and, for documentation changes, `npm run docs` followed by
   `npm run test:docs`. Runtime/JSLive acceptance remains a separate requirement
   when a release is intended for deployment there.
2. Wait for the latest metadata commit and all three CI jobs. Pull that commit.
3. Prepare the release heading with the **expected final version**, accounting
   for the changelog commit itself. Example: after 3.7.0, one new changelog commit
   means a heading for 3.8.0. Retain an empty **Unreleased** section for later work.
4. Push the changelog change, wait for metadata and CI again, and verify the actual
   package version matches the release heading. Additional commits also count;
   do not tag a mismatched or merely predicted version.
5. Record the exact verified `dev` candidate SHA. Open a reviewed PR to `main`.
   Do not make further source/version changes as part of merging the candidate.
6. On the resulting `main` commit, require the same CI jobs again. There is no
   metadata bump on `main`. Confirm package, lockfile, bundle banners/runtime
   version and changelog all agree. Tag the verified `main` commit, not a
   regenerated detached release commit.

## Publish manually

The owner creates an annotated or signed `v<package-version>` tag on that exact
`main` commit, pushes the tag and creates the matching GitHub release using the
changelog entry. Never move or overwrite tags or released artifacts. Corrections
need a new version and tag.

The inherited **Release**, **Publish** and **Deploy docs** jobs are explicitly
disabled. Their old scripts must not be invoked as a shortcut. This process does
not publish npm packages, deploy documentation or update JSLive. npm ownership,
package naming and publication need a separate decision before publishing under
any scope; the inherited `@qultoltd` name is not authorization to publish there.

## Back-synchronize

Merge the complete `main` result, including merge commits, back into `dev`; do not
recreate or delete `dev`. Resolve changelog and metadata conflicts cumulatively.
The metadata workflow opens the next development version and CI must pass again.
The original release commit, tag and artifacts remain immutable.

## Evidence and limits

Local tests cover arithmetic, validation, real Git commit ranges, bot exclusion,
retries, delayed/batched runs, back-merges and synchronized manifests/bundles.
Local tests cannot establish GitHub App installation, repository secret access,
branch rules or actual hosted CI. The first successful hosted metadata run and
CI on its bot commit are required to complete setup.
