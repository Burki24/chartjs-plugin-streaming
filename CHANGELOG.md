# Changelog

## Unreleased

### Added

- JSLive compatibility coverage for Chart.js 4.5.1, Moment 2.31.0, its 1.0.1
  adapter and Datalabels 2.2.0 in UTC/Berlin, plus an opt-in bounded real-time
  comparison against the unchanged JSLive streaming 3.1.0 asset.

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
- Cancel pending hover replays when a chart is destroyed, including destruction
  from rendering callbacks, without accessing the disposed chart afterward.
- Keep tooltip selections and displayed values aligned with retained data when
  expired points are removed; clear expired selections and refresh external
  tooltips after data synchronization, including on paused scales.

This section describes unpublished fork work since the qultoltd 3.1.0 baseline.
It does not replace or relabel upstream tags or releases.
