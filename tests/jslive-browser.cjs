/* global Chart, moment, chart, probe */
const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');
const {chromium} = require('playwright');
const {openPage, createChart} = require('./jslive-harness.cjs');
const pkg = require('../package.json');
const {installTimerProbe, checkScaleReplacement} = require('./scale-replacement.cjs');

for (const timezone of ['UTC', 'Europe/Berlin']) {
  for (const artifact of [pkg.main, pkg.unpkg]) {
    test(`JSLive / ${timezone} / ${path.basename(artifact)}: realtime scale replacement`, {timeout: 30000}, async () => {
      const browser = await chromium.launch({headless: true,
        executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
      try {
        const {page, errors} = await openPage(browser, {artifact, timezone, clock: true, beforeScripts: installTimerProbe});
        await checkScaleReplacement(page);
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
    test(`JSLive / ${timezone} / ${path.basename(artifact)}: Moment, labels and lifecycle`, {timeout: 30000}, async () => {
      const browser = await chromium.launch({headless: true,
        executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
      try {
        const {page, errors} = await openPage(browser, {artifact, timezone, clock: true});
        assert.deepEqual(await page.evaluate(() => [Chart.version, moment.version]), ['4.5.1', '2.31.0']);
        await createChart(page, {ttl: 1000});
        await page.clock.runFor(50);
        await page.evaluate(() => {
          chart.data.datasets.forEach((dataset, index) => {
            dataset.data = Array.from({length: 8}, (_, i) => ({x: Date.now() - 1500 + i * 200, y: i + index * 10}));
          });
          chart.update('quiet');
          const active = [{datasetIndex: 0, index: 5}, {datasetIndex: 1, index: 5}];
          probe.selected = chart.data.datasets.map(dataset => dataset.data[5]);
          chart.setActiveElements(active);
          chart.tooltip.setActiveElements(active, {x: 450, y: 200});
          chart.update('quiet');
        });
        const title = `02.01.2024 ${timezone === 'UTC' ? '12' : '13'}:00:00`;
        assert.deepEqual(await page.evaluate(() => chart.tooltip.title), [title]);
        await page.clock.runFor(200);
        const retained = await page.evaluate(() => ({
          indices: chart.data.datasets.map((dataset, i) => dataset.data.indexOf(probe.selected[i])),
          hover: chart.getActiveElements().map(item => item.index),
          tip: chart.tooltip.getActiveElements().map(item => item.index),
          values: chart.tooltip.dataPoints.map(item => [item.raw.y, Number(item.formattedValue)]),
          title: chart.tooltip.title, labels: probe.labels,
          coordinates: chart.getActiveElements().map(item => [item.element.x, item.element.y])
        }));
        assert.ok(retained.indices.every(index => index >= 0 && index < 5));
        assert.deepEqual(retained.hover, retained.indices);
        assert.deepEqual(retained.tip, retained.indices);
        assert.deepEqual(retained.values, [[5, 5], [15, 15]]);
        assert.deepEqual(retained.title, [title]);
        assert.ok(retained.labels > 0, 'datalabel text must actually be drawn');
        assert.ok(retained.coordinates.flat().every(Number.isFinite));
        await page.clock.runFor(1100);
        assert.deepEqual(await page.evaluate(() => [chart.getActiveElements().length,
          chart.tooltip.getActiveElements().length, chart.tooltip.opacity]), [0, 0, 0]);
        // Refill both controllers before testing pause/resume and normal updates.
        await page.evaluate(() => {
          chart.data.datasets.forEach((dataset, index) => dataset.data.push({x: Date.now(), y: 42 + index}));
          chart.update('quiet');
          chart.options.scales.x.realtime.pause = true;
          chart.update('quiet');
        });
        const paused = await page.evaluate(() => [chart.scales.x.min, chart.scales.x.max]);
        await page.clock.runFor(1500);
        assert.deepEqual(await page.evaluate(() => [chart.scales.x.min, chart.scales.x.max]), paused);
        await page.evaluate(() => { chart.options.scales.x.realtime.pause = false; chart.update('quiet'); });
        await page.clock.runFor(500);
        assert.ok(await page.evaluate(max => chart.scales.x.max > max, paused[1]));
        const stopped = await page.evaluate(() => {
          chart.destroy();
          return {draws: probe.draws, refreshes: probe.refreshes};
        });
        await page.clock.runFor(1000);
        assert.deepEqual(await page.evaluate(() => ({draws: probe.draws, refreshes: probe.refreshes})), stopped);
        assert.equal(await page.evaluate(() => !!Chart.getChart(document.getElementById('chart'))), false);
        // JSLive reloads a different period by destroying and recreating the chart.
        await page.evaluate(() => {
          window.chart = new Chart(document.getElementById('chart'), {type: 'bar',
            data: {datasets: [{data: [{x: Date.now() - 500, y: 7}]}]},
            options: {responsive: false, animation: false,
              scales: {x: {type: 'time', min: Date.now() - 1000, max: Date.now()}}}});
          chart.update();
        });
        await page.clock.runFor(500);
        assert.equal(await page.evaluate(() => chart.scales.x.type), 'time');
        assert.ok(await page.evaluate(() => Number.isFinite(chart.getDatasetMeta(0).data[0].y)));
        await page.evaluate(() => chart.destroy());
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
  }
}
