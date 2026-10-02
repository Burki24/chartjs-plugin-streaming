/* global Chart, chart, probe */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const {openPage, createChart, files, hash, root} = require('./jslive-harness.cjs');
const pkg = require('../package.json');
const jsliveRoot = process.env.JSLIVE_ROOT;
const seconds = Number(process.env.STREAMING_SOAK_SECONDS || 120);
const repetitions = Number(process.env.STREAMING_SOAK_REPETITIONS || 2);
const output = path.resolve(root, process.env.STREAMING_SOAK_OUTPUT || 'node_modules/.cache/jslive-soak.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const gitHead = cwd => execFileSync('git', ['rev-parse', 'HEAD'], {cwd, encoding: 'utf8'}).trim();
const round = n => Math.round(n * 100) / 100;

async function metrics(cdp) {
  const result = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map(item => [item.name, item.value]));
}

async function preflight(browser, artifact) {
  const h = await openPage(browser, {artifact, jsliveRoot, clock: true});
  try {
    await createChart(h.page);
    await h.page.clock.runFor(500);
    const snapshot = await h.page.evaluate(() => ({image: chart.canvas.toDataURL(),
      range: [chart.scales.x.min, chart.scales.x.max],
      data: chart.data.datasets.map(dataset => dataset.data), labelsDrawn: probe.labels > 0}));
    assert.ok(snapshot.labelsDrawn);
    await h.page.evaluate(() => chart.destroy());
    await h.page.clock.runFor(300);
    assert.deepEqual(h.errors, []);
    return snapshot;
  } finally {
    await h.context.close();
  }
}

async function measure(browser, variant, artifact, repetition) {
  const h = await openPage(browser, {artifact, jsliveRoot});
  try {
    const cdp = await h.context.newCDPSession(h.page);
    await cdp.send('Performance.enable');
    await createChart(h.page, {duration: 10000, feed: true});
    await sleep(10000); // Warm up one complete retention window before measuring.
    await cdp.send('HeapProfiler.collectGarbage');
    const start = await metrics(cdp);
    const initial = await h.page.evaluate(() => ({draws: probe.draws, appended: probe.appended}));
    const samples = [];
    let pausedRange;
    for (let elapsed = 10; elapsed <= seconds; elapsed += 10) {
      await sleep(10000);
      const m = await metrics(cdp);
      const sample = await h.page.evaluate(() => ({counts: chart.data.datasets.map(dataset => dataset.data.length),
        range: [chart.scales.x.min, chart.scales.x.max], draws: probe.draws, refreshes: probe.refreshes,
        appended: probe.appended, labels: probe.labels}));
      assert.deepEqual(h.errors, []);
      assert.ok(sample.counts.every(count => count > 0 && count < 2500), 'retention must stay bounded');
      assert.equal(sample.range[1] - sample.range[0], 10000);
      samples.push({elapsedSeconds: round(m.Timestamp - start.Timestamp), ...sample,
        taskSeconds: round(m.TaskDuration - start.TaskDuration), heapBytes: m.JSHeapUsedSize});
      if (elapsed === 40) {
        pausedRange = await h.page.evaluate(() => {
          chart.options.scales.x.realtime.pause = true;
          chart.update('quiet');
          return [chart.scales.x.min, chart.scales.x.max];
        });
      }
      if (elapsed === 50) {
        assert.deepEqual(sample.range, pausedRange, 'pause must freeze the visible window');
        await h.page.evaluate(() => { chart.options.scales.x.realtime.pause = false; chart.update('quiet'); });
      }
      if (elapsed === 60) assert.ok(sample.range[1] > pausedRange[1], 'resume must catch up');
      console.log(`${variant} run ${repetition}: ${elapsed}/${seconds}s, points ${sample.counts.join('/')}`);
    }
    const end = await metrics(cdp);
    const last = samples[samples.length - 1];
    const frameGaps = await h.page.evaluate(() => probe.frames.slice(1).map((t, i) => t - probe.frames[i]));
    frameGaps.sort((a, b) => a - b);
    await cdp.send('HeapProfiler.collectGarbage');
    const retained = await metrics(cdp);
    const stopped = await h.page.evaluate(() => {
      chart.destroy();
      return {draws: probe.draws, refreshes: probe.refreshes};
    });
    await sleep(500);
    assert.deepEqual(await h.page.evaluate(() => ({draws: probe.draws, refreshes: probe.refreshes})), stopped);
    assert.equal(await h.page.evaluate(() => !!Chart.getChart(document.getElementById('chart'))), false);
    assert.deepEqual(h.errors, []);
    const duration = end.Timestamp - start.Timestamp;
    assert.ok(last.labels > 0);
    assert.ok(last.appended - initial.appended >= seconds * 95, 'offered input must not disappear under load');
    return {variant, repetition, durationSeconds: round(duration), samples,
      summary: {mainThreadPercent: round(100 * (end.TaskDuration - start.TaskDuration) / duration),
        drawsPerSecond: round((last.draws - initial.draws) / duration),
        lastFrameGapP95Ms: round(frameGaps[Math.floor(frameGaps.length * 0.95)]),
        gcHeapStartBytes: start.JSHeapUsedSize, gcHeapEndBytes: retained.JSHeapUsedSize,
        finalCounts: last.counts, teardown: 'passed'}};
  } finally {
    await h.context.close();
  }
}

async function main() {
  assert.ok(jsliveRoot, 'Set JSLIVE_ROOT to the unchanged JSLive checkout; no downloads or asset writes are performed.');
  assert.ok(Number.isInteger(seconds) && seconds >= 60 && seconds % 10 === 0);
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 10);
  const baseline = path.join(jsliveRoot, 'SymconJSLive/js/chartjs/plugins/chartjs-plugin-streaming.min.js');
  assert.equal(hash(baseline), '2e0ac91691bc76ff2c618c7d600a36cc3a10784ef34cd30ac968d72d6d15d839', 'baseline must be JSLive streaming 3.1.0');
  const candidate = path.join(root, pkg.unpkg);
  // JSLive renames Chart.js's map trailer and adds a terminal LF to Moment.
  // Ignore only those packaging differences, never executable differences.
  const canonical = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    .replace(/\n\/\/# sourceMappingURL=[^\n]*\n?$/, '').trimEnd();
  const libraries = files.map(([installed, vendored]) => {
    const installedHash = hash(path.join(root, installed));
    const vendoredHash = hash(path.join(jsliveRoot, vendored));
    assert.equal(canonical(path.join(root, installed)), canonical(path.join(jsliveRoot, vendored)), vendored);
    return {file: vendored, installedHash, vendoredHash};
  });
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
  const report = {schemaVersion: 1, date: new Date().toISOString(),
    environment: {node: process.version, browser: browser.version(), platform: os.platform(), cpu: os.cpus()[0].model},
    forkCommit: gitHead(root), jsliveCommit: gitHead(jsliveRoot), candidateVersion: pkg.version,
    baselineSha256: hash(baseline), candidateSha256: hash(candidate), libraries,
    workload: {seconds, repetitions, warmupSeconds: 10, timezone: 'Europe/Berlin',
      datasets: ['line', 'bar'], offeredSamplesPerSecond: 200, windowMs: 10000, refreshMs: 100,
      frameRate: 30, labels: 'every twentieth retained point', pauseSeconds: [40, 50]}, runs: []};
  try {
    assert.deepEqual(await preflight(browser, candidate), await preflight(browser, baseline),
      'deterministic initial data, axes, labels and canvas must match');
    report.visualPreflight = 'pixel-identical';
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      // Reverse order to reduce one-sided warm-up/background-work bias.
      const variants = repetition % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
      for (const variant of variants) {
        report.runs.push(await measure(browser, variant, variant === 'baseline' ? baseline : candidate, repetition));
      }
    }
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Saved ${output}`);
    console.log(JSON.stringify(report.runs.map(({variant, repetition, summary}) => ({variant, repetition, ...summary})), null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
