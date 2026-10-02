/* global Chart, ChartDataLabels, probe */
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const files = [
  ['node_modules/chartjs-current/dist/chart.umd.js', 'SymconJSLive/js/chartjs/4.5.1/chart.umd.min.js'],
  ['node_modules/moment/min/moment.min.js', 'SymconJSLive/js/moment/2.31.0/moment.min.js'],
  ['node_modules/chartjs-adapter-moment/dist/chartjs-adapter-moment.min.js', 'SymconJSLive/js/chartjs/plugins/moment/1.0.1/chartjs-adapter-moment.min.js'],
  ['node_modules/chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.min.js', 'SymconJSLive/js/chartjs/plugins/datalabels/2.2.0/chartjs-plugin-datalabels.min.js']
];
const read = file => fs.readFileSync(file, 'utf8');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function openPage(browser, {artifact = pkg.unpkg, timezone = 'Europe/Berlin', clock = false, jsliveRoot, beforeScripts} = {}) {
  const context = await browser.newContext({viewport: {width: 1024, height: 768}, timezoneId: timezone});
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  if (clock) {
    await page.clock.install({time: new Date('2024-01-02T12:00:00Z')});
    await page.clock.pauseAt(new Date('2024-01-02T12:00:01Z'));
  }
  await page.setContent('<canvas id="chart" width="900" height="500"></canvas>');
  if (beforeScripts) await beforeScripts(page);
  for (const [installed, vendored] of files) {
    await page.addScriptTag({content: read(jsliveRoot ? path.join(jsliveRoot, vendored) : path.join(root, installed))});
  }
  await page.addScriptTag({content: read(path.resolve(root, artifact))});
  return {context, page, errors};
}

async function createChart(page, {duration = 1000, ttl, feed = false} = {}) {
  await page.evaluate(({duration, ttl, feed}) => {
    window.probe = {draws: 0, labels: 0, refreshes: 0, frames: [], appended: 0, stopped: false};
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (String(text).startsWith('Value:')) probe.labels++;
      return fill.call(this, text, ...args);
    };
    Chart.register(ChartDataLabels);
    const start = Date.now();
    const count = feed ? duration / 10 : 8;
    window.chart = new Chart(document.getElementById('chart'), {
      type: 'line', data: {datasets: ['line', 'bar'].map((type, index) => ({
        type, label: type, borderColor: index ? '#dc2626' : '#2563eb',
        backgroundColor: index ? '#dc262680' : '#2563eb80', pointRadius: 2,
        data: Array.from({length: count}, (_, i) => ({x: start - duration + i * duration / count,
          y: 20 + index * 10 + Math.sin(i / 8)}))
      }))},
      options: {responsive: false, animation: false,
        plugins: {streaming: {frameRate: 30}, datalabels: {display: context => context.dataIndex % 20 === 0,
          formatter: point => `Value:${point.y.toFixed(1)}`}},
        scales: {x: {type: 'realtime', time: {tooltipFormat: 'DD.MM.YYYY HH:mm:ss',
          displayFormats: {year: 'YYYY', month: 'MMM YYYY', day: 'DD.MM', hour: 'HH', minute: 'HH:mm', second: 'ss'}},
        realtime: {duration, refresh: 100, ...(ttl === undefined ? {} : {ttl}), onRefresh: instance => {
          probe.refreshes++;
          if (feed && !probe.stopped) {
            // Fixed 200 samples/s offered load: catch up to the wall clock, do not
            // silently feed fewer samples when a slower renderer delays a timer.
            const until = Math.floor((Date.now() - start) / 10);
            for (let i = probe.appended; i < until; i++) {
              instance.data.datasets.forEach((dataset, index) => dataset.data.push({
                x: start + i * 10, y: 20 + index * 10 + Math.sin(i / 8)}));
            }
            probe.appended = until;
          }
        }}}, y: {type: 'linear', min: 0, max: 45}}},
      plugins: [{id: 'jsliveProbe', afterDraw: () => {
        probe.draws++;
        probe.frames.push(performance.now());
        // Bounded instrumentation must not create an artificial memory leak.
        if (probe.frames.length > 1000) probe.frames.splice(0, 500);
      }}]
    });
  }, {duration, ttl, feed});
}

module.exports = {openPage, createChart, files, hash, root};
