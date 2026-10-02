# JSLive compatibility checkpoint

This checkpoint covers the unpublished 3.4.0 fork, source `1a46cd9`, metadata
commit `fc0dd2e`. It is not a release, deployment or installed JSLive acceptance.
JSLive's ADR 0005 selects this maintenance fork instead of continuing its own
realtime-controller prototype. Production JSLive still uses streaming 3.1.0.

## Deterministic browser matrix

`npm run test:browser` (also part of `npm run verify`) retains the existing
16 Luxon-based cases and adds four Moment-based cases: UTC and Europe/Berlin,
each with unminified and minified UMD bundles. Dependencies are locked:

- Chart.js 4.5.1 (`chartjs-current` development alias);
- Moment 2.31.0 and chartjs-adapter-moment 1.0.1 (development dependencies only);
- Datalabels 2.2.0.

`tests/jslive-browser.cjs` uses real libraries, a controlled browser clock and
blocked network access. It checks mixed line/bar geometry, actually drawn
datalabel text, the JSLive date-format tokens, raw and formatted tooltip values,
selection indices after expiration, hiding expired selections, pause/resume,
and destroy/recreate followed by a normal time-axis update. The historical
reload follows JSLive's destroy/recreate pattern, not an in-place scale swap.
The new cases pass locally; hosted CI must still run after the owner's push.

## Bounded real-clock comparison

Run from this repository with the documented Node/npm toolchain and Playwright:

```powershell
$env:JSLIVE_ROOT = 'E:\git\JSLive'
$env:STREAMING_BROWSER_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:soak
```

The browser executable override is optional when Playwright Chromium is
installed. `STREAMING_SOAK_SECONDS` defaults to 120 (multiples of ten, at least
60), and `STREAMING_SOAK_REPETITIONS` to two. `STREAMING_SOAK_OUTPUT` optionally
selects the generated JSON report; by default it stays in ignored
`node_modules/.cache/jslive-soak.json`. This longer hardware-sensitive experiment
is not part of ordinary CI and requires the explicit JSLive checkout.

`tests/jslive-soak.cjs` loads the actual JSLive libraries for both variants and
checks their equivalence to the npm-locked test libraries. Only terminal
whitespace/line endings and the source-map filename comment are normalized;
original SHA-256 hashes are recorded. The baseline must match the documented
JSLive streaming 3.1.0 hash. No CDN, transport, private installation data,
Symcon access, source checkout mutation or live deployment is involved.

The preflight compares the entire canvas image, retained data and axis bounds
at the same controlled time; labels must be drawn. Each real-clock run uses a
fresh browser context, a ten-second warm-up, a ten-second retention window,
line/bar datasets, 200 offered points/s combined, 100 ms refresh, 30 target
frames/s and visible labels on every twentieth retained point. Delayed refreshes
catch up to the same offered data rate. Pause at 40 seconds and resume at 50
seconds are asserted. Baseline/candidate order is reversed on repetition two.

Samples every ten seconds retain actual elapsed time, dataset counts, draw and
refresh counts, input counts, label draws, CDP main-thread TaskDuration and JS
heap. Garbage collection is requested only before/after the measured interval;
the retained-heap comparison is not a process-memory or leak proof. Draws/s are
Chart.js afterDraw calls, not guaranteed display frames. Frame-gap p95 covers
only the bounded tail of frame timestamps. Teardown must stop draws/refreshes
and unregister the chart. Data counts must stay below 2,500 per dataset.

## Results and scope

The [raw report](benchmarks/jslive-soak-3.4.0.json) records four successful
120-second measurements (two per variant, plus warm-up). The deterministic
preflight was pixel-identical, with equal data and axis ranges. All pause,
resume, bounded-retention and teardown assertions passed; no browser errors
occurred. Libraries and runtime bundle hashes are included in the report.

| Observation | Existing 3.1.0 | Candidate 3.4.0 |
| --- | --- | --- |
| Main-thread time | 33.47-34.67% | 31.29-32.83% |
| Draw calls/second | 37.49-37.51 | 37.50 |
| Tail frame-gap p95 | 37.1-42.1 ms | 37.2 ms |
| Final points per dataset | 1,001 | 1,001 |
| JS heap after final GC | 6.69-6.73 MB | 6.38-6.76 MB |

Extra refresh-driven renders explain draw-call rates above the 30-frame target.
During pause the sampled counts rose to about 2,000 points per dataset and
returned to 1,001 after resume. Post-GC heap increased from the initial sample
in both variants (approximately 0.71-1.12 MB); this short run cannot exclude
slow leaks. MB here denotes decimal bytes, not MiB.

There is no observed performance regression for this fixture. Two local runs
per variant do not establish a general speed improvement or all-day stability.
Performance observations are machine-dependent; there is no new universal
CPU/FPS pass threshold. A visible regression requires investigation before
integration, even if the functional assertions pass. The recorded Git HEAD
identifies the runtime source; the newly added test harness is in the working
tree accompanying this report, not in that older commit.

Remaining gates: real WebSocket/Pull transport, installed Symcon, actual
IPSView/WebView devices, all chart options and long-duration/background tests.
The fixture neither loads the complete JSLive template nor simulates its PHP
backend. No inference of complete compatibility follows from these tests.

## Separate finding: in-place scale replacement

An additional exploratory test replaced `options.scales.x` from `realtime` to
`time` on the same Chart instance, then destroyed it. The 3.4.0 candidate kept
an old realtime callback alive and attempted to draw after destruction
(`Cannot read properties of null (reading 'save')`). This is outside JSLive's
destroy/recreate period-switch path, which passes. It is an open standalone
plugin limitation, not fixed or claimed supported by this checkpoint.

Reproduction: create a realtime chart; let refresh start; replace
`chart.options.scales.x` with a normal time scale; call `chart.update()`;
call `chart.destroy()` and advance the clock. Track a separate runtime fix
and regression test if this transition is to be supported.
