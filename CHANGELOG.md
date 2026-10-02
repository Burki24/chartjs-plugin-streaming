# Changelog

## Unreleased

### Added

- JSLive-style development versioning on `dev`, with `major.minor.0` package
  versions, source-derived build metadata and synchronized distribution bundles.
- A controlled `dev`/`main` release process with manual, immutable tags/releases
  and back-merges; automatic publication and deployment remain disabled.
- Reproducible builds, package checks, browser lifecycle coverage and a local
  development documentation build for the maintenance fork.

### Fixed

- Prevent stopped or replaced streaming timers from restarting after callbacks.
- Stop refresh processing when `onRefresh` destroys its chart.
- Restore temporary controller methods after failed, cancelled or nested quiet
  updates while preserving pre-existing method descriptors.

This section describes unpublished fork work since the qultoltd 3.1.0 baseline.
It does not replace or relabel upstream tags or releases.
