<p align="center">
  <img src="docs/.vuepress/public/logo.svg" style="width: 300px;">
</p>

# chartjs-plugin-streaming

[![npm](https://img.shields.io/npm/v/chartjs-plugin-streaming.svg?style=flat-square)](https://www.npmjs.com/package/@robloche/chartjs-plugin-streaming) [![GitHub Workflow Status](https://img.shields.io/github/workflow/status/nagix/chartjs-plugin-streaming/CI?style=flat-square)](https://github.com/robloche/chartjs-plugin-streaming/actions?query=workflow%3ACI+branch%3Amaster) [![Code Climate](https://img.shields.io/codeclimate/maintainability/nagix/chartjs-plugin-streaming.svg?style=flat-square)](https://codeclimate.com/github/nagix/chartjs-plugin-streaming) [![Awesome](https://awesome.re/badge-flat2.svg)](https://github.com/chartjs/awesome)

*[Chart.js](https://www.chartjs.org) plugin for live streaming data*

Forked from https://github.com/nagix/chartjs-plugin-streaming because it appears to be unmaintained.

chartjs-plugin-streaming 3.x requires Chart.js 4.1.1 or later. If you need Chart.js 2.x support, use the following versions.

- For Chart.js 2.9.x, 2.8.x or 2.7.x, use [version 1.9.0](https://github.com/nagix/chartjs-plugin-streaming/releases/tag/v1.9.0) ([tutorials](https://nagix.github.io/chartjs-plugin-streaming/1.9.0/) and [samples](https://nagix.github.io/chartjs-plugin-streaming/1.9.0/samples/))
- For Chart.js 2.6.x, use [version 1.2.0](https://github.com/nagix/chartjs-plugin-streaming/releases/tag/v1.2.0)
- For Chart.js 4.x, use [version 3.0.0](https://github.com/Robloche/chartjs-plugin-streaming)

## Documentation

- [Introduction](https://nagix.github.io/chartjs-plugin-streaming/master/guide/)
- [Getting Started](https://nagix.github.io/chartjs-plugin-streaming/master/guide/getting-started.html)
- [Options](https://nagix.github.io/chartjs-plugin-streaming/master/guide/options.html)
- [Data Feed Models](https://nagix.github.io/chartjs-plugin-streaming/master/guide/data-feed-models.html)
- [Integration](https://nagix.github.io/chartjs-plugin-streaming/master/guide/integration.html)
- [Performance](https://nagix.github.io/chartjs-plugin-streaming/master/guide/performance.html)
- [Migration](https://nagix.github.io/chartjs-plugin-streaming/master/guide/migration.html)
- [Tutorials](https://nagix.github.io/chartjs-plugin-streaming/master/tutorials/)
- [Samples](https://nagix.github.io/chartjs-plugin-streaming/master/samples/)

## Development

### Burki24 maintenance baseline

This fork starts from qultoltd commit `aa653d89c224390c15ca39c22b9a28263a3ea981`
(3.1.0). The first infrastructure step preserves the plugin sources, package
name, public API and all three upstream bundles. No npm publication or JSLive
asset replacement is performed by this step. Upstream links above remain
historical references, not this fork's release status.

Use Node.js **24.19.0** (see `.nvmrc`) and npm **11.21.0**. These are development
tool requirements, not new runtime requirements for users of the browser plugin.
Install the locked dependencies without lifecycle scripts:

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run verify
```

CI installs Chromium system dependencies as well (`--with-deps`) and runs on
Windows and Linux. A local Chromium-based browser can be selected with
`STREAMING_BROWSER_EXECUTABLE` (absolute executable path). Browser tests block
network requests and never contact Symcon. The package test requires `tar`,
available on the CI runners and current Windows installations.

The following commands will then be available from the repository root:

```bash
npm run build      # build dist files
npm run build:dev  # build and watch for changes
npm run lint       # perform code linting
npm test           # packed consumer entry points and reproducible bundle checks
npm run test:browser # realtime lifecycle smoke tests
npm run verify     # build, package tests, lint and browser tests
npm run package    # create an archive with dist files
npm run docs       # generate documentation (`dist/docs`)
npm run docs:dev   # generate documentation and watch for changes
```

The `main`, `module`, `unpkg` and `jsdelivr` paths deliberately retain the
existing `dist/@qultoltd/` layout. The `module` field is the historical bundler
ESM entry; this step does not introduce a Node.js `exports` map. Package tests
pack and extract a real npm archive, load its CommonJS entry in a fresh process,
and bundle its ESM entry. CDN and declaration files must be present too.

Build reproducibility covers the JavaScript bundles with the locked toolchain,
not archive timestamps or the documentation website. The original copyright
notice is retained instead of changing with the build machine's current year.
CI also rejects uncommitted changes in `dist` or the lockfile after verification.

The browser matrix covers Chart.js 4.1.1 (locked minimum) and 4.5.1 (JSLive's
current version), with both UMD bundles. It exercises mixed line/bar charts,
scrolling, expired-data cleanup, `update('quiet')`, tooltip values, pause/resume,
and timer/listener teardown. It is a smoke-test baseline, not full compatibility,
performance, long-running, annotation/zoom, or installed JSLive acceptance.

### Known inherited infrastructure issues

- The documentation build currently fails because its version-menu plugin
  fetches npm versions for the unavailable `@qultoltd/chartjs-plugin-streaming`
  package. The separate `docs` CI job remains blocking; it is not skipped or
  marked as an allowed failure. Repairing the documentation is a separate step.
- Six existing complexity/statement-count lint warnings remain in plugin code.
  The dependency tree contains deprecated development tools; this change does
  not claim to complete a dependency/security modernization.
- Historical release, publication and documentation-deployment workflows are
  not configured for this fork. Do not dispatch them. Releases, package naming,
  ownership metadata and publishing require a separate decision.

## License

chartjs-plugin-streaming is available under the [MIT license](https://opensource.org/licenses/MIT).
