/* global Chart, ChartDataLabels, chart, probe */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {chromium} = require('playwright');
const pkg = require('../package.json');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const chartPackage of ['chart.js', 'chartjs-current']) {
  for (const artifact of [pkg.main, pkg.unpkg]) {
    test(`${chartPackage} / ${path.basename(artifact)}: realtime lifecycle`, {timeout: 30000}, async () => {
      const browser = await chromium.launch({headless: true,
        executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.route('**/*', route => route.abort());
        await page.clock.install({time: new Date('2024-01-02T12:00:00Z')});
        await page.clock.pauseAt(new Date('2024-01-02T12:00:01Z'));
        await page.setContent('<canvas id="chart" width="900" height="500"></canvas>');
        await page.evaluate(() => {
          window.probe = {draws: 0, refreshes: 0, intervals: new Set(), frames: new Set(), listeners: new Map()};
          const interval = window.setInterval.bind(window);
          const clear = window.clearInterval.bind(window);
          window.setInterval = (...args) => {
            const id = interval(...args);
            probe.intervals.add(id);
            return id;
          };
          window.clearInterval = id => { probe.intervals.delete(id); clear(id); };
          const frame = window.requestAnimationFrame.bind(window);
          const cancel = window.cancelAnimationFrame.bind(window);
          window.requestAnimationFrame = callback => {
            const id = frame(time => { probe.frames.delete(id); callback(time); });
            probe.frames.add(id);
            return id;
          };
          window.cancelAnimationFrame = id => { probe.frames.delete(id); cancel(id); };
          const canvas = document.getElementById('chart');
          const add = canvas.addEventListener.bind(canvas);
          const remove = canvas.removeEventListener.bind(canvas);
          canvas.addEventListener = (type, listener, options) => {
            if (!probe.listeners.has(type)) probe.listeners.set(type, new Set());
            probe.listeners.get(type).add(listener);
            add(type, listener, options);
          };
          canvas.removeEventListener = (type, listener, options) => {
            probe.listeners.get(type)?.delete(listener);
            remove(type, listener, options);
          };
        });
        for (const file of [
          `node_modules/${chartPackage}/dist/chart.umd.js`,
          'node_modules/luxon/build/global/luxon.min.js',
          'node_modules/chartjs-adapter-luxon/dist/chartjs-adapter-luxon.umd.js',
          'node_modules/chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.js',
          artifact
        ]) await page.addScriptTag({content: read(file)});
        await page.evaluate(() => {
          const canvas = document.getElementById('chart');
          Chart.register(ChartDataLabels);
          window.chart = new Chart(canvas, {
            type: 'line',
            data: {datasets: ['line', 'bar'].map((type, index) => ({type, label: type,
              data: Array.from({length: 20}, (_, i) => ({x: Date.now() - 9500 + i * 500, y: i + index}))
            }))},
            options: {responsive: false, animation: false,
              plugins: {streaming: {frameRate: 30}, datalabels: {display: true}},
              scales: {x: {type: 'realtime', realtime: {duration: 5000, refresh: 100,
                onRefresh: () => { probe.refreshes++; }}}, y: {type: 'linear'}}},
            plugins: [{id: 'testProbe', afterDraw: () => { probe.draws++; }}]
          });
        });
        await page.clock.runFor(500);
        const initial = await page.evaluate(() => ({min: chart.scales.x.min, max: chart.scales.x.max,
          draws: probe.draws, refreshes: probe.refreshes, intervals: probe.intervals.size, frames: probe.frames.size,
          counts: chart.data.datasets.map(d => d.data.length)}));
        assert.equal(initial.max - initial.min, 5000);
        assert.ok(initial.draws > 1);
        assert.ok(initial.refreshes > 0);
        assert.ok(initial.intervals > 0 && initial.frames > 0, 'lifecycle probe must observe active timers');
        assert.ok(initial.counts.every(count => count > 0 && count < 20), 'expired points are retained indefinitely');
        await page.evaluate(() => {
          chart.data.datasets.forEach((dataset, index) => dataset.data.push({x: Date.now(), y: 42 + index}));
          chart.update('quiet');
          chart.tooltip.setActiveElements([{datasetIndex: 0, index: chart.data.datasets[0].data.length - 1}], {x: 450, y: 200});
          chart.update('quiet');
        });
        assert.equal(await page.evaluate(() => chart.tooltip.dataPoints[0].raw.y), 42);
        assert.equal(await page.evaluate(() => Number(chart.tooltip.dataPoints[0].formattedValue)), 42);
        await page.clock.runFor(500);
        assert.ok(await page.evaluate(max => chart.scales.x.max > max, initial.max));
        const paused = await page.evaluate(() => {
          chart.options.scales.x.realtime.pause = true;
          chart.update('quiet');
          return {min: chart.scales.x.min, max: chart.scales.x.max};
        });
        await page.clock.runFor(1000);
        assert.deepEqual(await page.evaluate(() => ({min: chart.scales.x.min, max: chart.scales.x.max})), paused);
        await page.evaluate(() => { chart.options.scales.x.realtime.pause = false; chart.update('quiet'); });
        await page.clock.runFor(500);
        assert.ok(await page.evaluate(max => chart.scales.x.max > max, paused.max));
        const destroyed = await page.evaluate(() => {
          chart.destroy();
          return {draws: probe.draws, refreshes: probe.refreshes};
        });
        await page.clock.runFor(1000);
        assert.deepEqual(await page.evaluate(() => ({draws: probe.draws, refreshes: probe.refreshes})), destroyed);
        assert.deepEqual(await page.evaluate(() => ({intervals: probe.intervals.size, frames: probe.frames.size,
          listeners: [...probe.listeners.values()].reduce((sum, entries) => sum + entries.size, 0),
          registered: !!Chart.getChart(document.getElementById('chart'))})),
        {intervals: 0, frames: 0, listeners: 0, registered: false});
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
  }
}
