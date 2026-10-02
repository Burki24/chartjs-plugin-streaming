/* global Chart, ChartDataLabels, chart, probe */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {chromium} = require('playwright');
const pkg = require('../package.json');
const {installTimerProbe, checkScaleReplacement} = require('./scale-replacement.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const chartPackage of ['chart.js', 'chartjs-current']) {
  for (const artifact of [pkg.main, pkg.unpkg]) {
    test(`${chartPackage} / ${path.basename(artifact)}: realtime scale replacement`, {timeout: 30000}, async () => {
      const browser = await chromium.launch({headless: true,
        executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.clock.install({time: new Date('2024-01-02T12:00:00Z')});
        await page.clock.pauseAt(new Date('2024-01-02T12:00:01Z'));
        await page.setContent('<canvas id="chart" width="900" height="500"></canvas>');
        await installTimerProbe(page);
        for (const file of [`node_modules/${chartPackage}/dist/chart.umd.js`,
          'node_modules/luxon/build/global/luxon.min.js',
          'node_modules/chartjs-adapter-luxon/dist/chartjs-adapter-luxon.umd.js', artifact]) {
          await page.addScriptTag({content: read(file)});
        }
        await checkScaleReplacement(page);
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
    test(`${chartPackage} / ${path.basename(artifact)}: active points survive data cleanup`, {timeout: 30000}, async () => {
      const browser = await chromium.launch({headless: true,
        executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.clock.install({time: new Date('2024-01-02T12:00:00Z')});
        await page.clock.pauseAt(new Date('2024-01-02T12:00:01Z'));
        await page.setContent('<canvas id="chart" width="900" height="500"></canvas>');
        for (const file of [`node_modules/${chartPackage}/dist/chart.umd.js`,
          'node_modules/luxon/build/global/luxon.min.js',
          'node_modules/chartjs-adapter-luxon/dist/chartjs-adapter-luxon.umd.js', artifact]) {
          await page.addScriptTag({content: read(file)});
        }
        for (const ttl of [1000, null]) {
          for (const tooltip of [true, false]) {
            await page.evaluate(({ttl, tooltip}) => {
              window.probe = {external: null};
              window.chart = new Chart(document.getElementById('chart'), {
                type: 'line', data: {datasets: [{data: []}, {xAxisID: 'staticX', data: []}]},
                options: {responsive: false, animation: false,
                  plugins: {tooltip: tooltip ? {external: ({tooltip: tip}) => {
                    probe.external = {opacity: tip.opacity,
                      values: tip.dataPoints?.map(item => item.raw.y) || []};
                  }} : false},
                  scales: {x: {type: 'realtime', realtime: {duration: 1000, refresh: 100,
                    ...(ttl === null ? {} : {ttl})}}, staticX: {type: 'linear', axis: 'x'}}}
              });
            }, {ttl, tooltip});
            await page.clock.runFor(50);
            await page.evaluate(tooltip => {
              chart.data.datasets[0].data = Array.from({length: 8}, (_, i) => ({x: Date.now() - 1500 + i * 200, y: (i + 1) * 10}));
              chart.data.datasets[0].pointHoverRadius = [11, 12, 13, 14, 15, 16, 17, 18];
              chart.data.datasets[1].data = [{x: 0, y: 100}, {x: 1, y: 200}, {x: 2, y: 300}];
              chart.update('quiet');
              probe.selected = chart.data.datasets[0].data[5];
              probe.element = chart.getDatasetMeta(0).data[5];
              const active = [{datasetIndex: 0, index: 5}, {datasetIndex: 1, index: 2}];
              chart.setActiveElements(active);
              if (tooltip) chart.tooltip.setActiveElements(active, {x: 450, y: 200});
            }, tooltip);
            await page.clock.runFor(200);
            assert.deepEqual(errors, []);
            const retained = await page.evaluate(tooltip => {
              const index = chart.data.datasets[0].data.indexOf(probe.selected);
              const active = chart.getActiveElements();
              return {shifted: index >= 0 && index < 5,
                hover: active.map(item => ({datasetIndex: item.datasetIndex, index: item.index})),
                expectedHover: [{datasetIndex: 0, index}, {datasetIndex: 1, index: 2}],
                sameElement: active[0].element === probe.element,
                radius: active[0].element.options.radius,
                tip: tooltip ? chart.tooltip.getActiveElements().map(item => ({datasetIndex: item.datasetIndex, index: item.index})) : null,
                values: tooltip ? chart.tooltip.dataPoints.map(item => [item.dataIndex, item.raw.y, Number(item.formattedValue)]) : null};
            }, tooltip);
            assert.equal(retained.shifted, true, 'cleanup must remove points before the selection');
            assert.deepEqual(retained.hover, retained.expectedHover);
            assert.equal(retained.sameElement, true);
            assert.equal(retained.radius, 16);
            if (tooltip) {
              assert.deepEqual(retained.tip, retained.expectedHover, 'tooltip must track the same sample after index shifts');
              assert.deepEqual(retained.values, [[retained.expectedHover[0].index, 60, 60], [2, 300, 300]]);
            }
            await page.clock.runFor(1400);
            assert.deepEqual(errors, []);
            const removed = await page.evaluate(tooltip => ({
              selectedPresent: chart.data.datasets[0].data.includes(probe.selected),
              hover: chart.getActiveElements().map(item => [item.datasetIndex, item.index]),
              tip: tooltip ? chart.tooltip.getActiveElements().map(item => [item.datasetIndex, item.index]) : null,
              values: tooltip ? chart.tooltip.dataPoints.map(item => item.raw.y) : null,
              external: probe.external
            }), tooltip);
            assert.equal(removed.selectedPresent, false);
            assert.deepEqual(removed.hover, [[1, 2]]);
            if (tooltip) {
              assert.deepEqual(removed.tip, [[1, 2]]);
              assert.deepEqual(removed.values, [300]);
              assert.deepEqual(removed.external, {opacity: 1, values: [300]});
            }
            if (tooltip && ttl !== null) {
              await page.evaluate(() => {
                chart.data.datasets[0].data.push({x: Date.now(), y: 42});
                chart.update('quiet');
                const active = [{datasetIndex: 0, index: 0}];
                chart.setActiveElements(active);
                chart.tooltip.setActiveElements(active, {x: 450, y: 200});
              });
              await page.clock.runFor(1100);
              assert.deepEqual(await page.evaluate(() => ({hover: chart.getActiveElements().length,
                tip: chart.tooltip.getActiveElements().length, opacity: chart.tooltip.opacity,
                externalOpacity: probe.external.opacity})),
              {hover: 0, tip: 0, opacity: 0, externalOpacity: 0}, 'the last expired selection must hide the tooltip');
              assert.deepEqual(errors, []);
            }
            await page.evaluate(() => chart.destroy());
          }
        }
        // A paused scale preserves visible points but can trim a middle range of future data.
        await page.evaluate(() => {
          window.chart = new Chart(document.getElementById('chart'), {
            type: 'line', data: {datasets: [{data: []}]},
            options: {responsive: false, animation: false,
              scales: {x: {type: 'realtime', realtime: {duration: 1000, refresh: 100, ttl: 1000}}}}
          });
        });
        await page.clock.runFor(50);
        await page.evaluate(() => {
          chart.data.datasets[0].data = Array.from({length: 9}, (_, i) => ({x: Date.now() - 600 + i * 200, y: (i + 1) * 10}));
          chart.update('quiet');
          chart.options.scales.x.realtime.pause = true;
          chart.update('quiet');
          const active = [{datasetIndex: 0, index: 1}, {datasetIndex: 0, index: 8}];
          chart.setActiveElements(active);
          chart.tooltip.setActiveElements(active, {x: 450, y: 200});
          probe.selected = chart.data.datasets[0].data[8];
        });
        await page.clock.runFor(1800);
        assert.deepEqual(errors, []);
        const paused = await page.evaluate(() => ({index: chart.data.datasets[0].data.indexOf(probe.selected),
          hover: chart.getActiveElements().map(item => item.index),
          tip: chart.tooltip.getActiveElements().map(item => item.index),
          values: chart.tooltip.dataPoints.map(item => item.raw.y)}));
        assert.ok(paused.index >= 5 && paused.index < 8);
        assert.deepEqual(paused.hover, [1, paused.index]);
        assert.deepEqual(paused.tip, [1, paused.index]);
        assert.deepEqual(paused.values, [20, 90]);
        await page.clock.runFor(400);
        assert.deepEqual(errors, []);
        assert.deepEqual(await page.evaluate(() => ({hover: chart.getActiveElements().map(item => item.index),
          tip: chart.tooltip.getActiveElements().map(item => item.index),
          values: chart.tooltip.dataPoints.map(item => item.raw.y)})), {hover: [1], tip: [1], values: [20]});
        await page.evaluate(() => chart.destroy());
      } finally {
        await browser.close();
      }
    });
    test(`${chartPackage} / ${path.basename(artifact)}: hover replay teardown`, {timeout: 30000}, async () => {
      const browser = await chromium.launch({headless: true,
        executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.clock.install({time: new Date('2024-01-02T12:00:00Z')});
        await page.clock.pauseAt(new Date('2024-01-02T12:00:01Z'));
        await page.setContent('<canvas id="chart" width="900" height="500"></canvas>');
        for (const file of [`node_modules/${chartPackage}/dist/chart.umd.js`,
          'node_modules/luxon/build/global/luxon.min.js',
          'node_modules/chartjs-adapter-luxon/dist/chartjs-adapter-luxon.umd.js', artifact]) {
          await page.addScriptTag({content: read(file)});
        }
        for (const destroyIn of ['render', 'queued']) {
          await page.evaluate(destroyIn => {
            window.probe = {events: 0, lateEvents: 0, armed: false, destroyed: false};
            window.chart = new Chart(document.getElementById('chart'), {
              type: 'line', data: {datasets: [{data: [{x: Date.now(), y: 1}]}]},
              options: {responsive: false, animation: false,
                scales: {x: {type: 'realtime', realtime: {refresh: 10000}}}},
              plugins: [{id: 'hoverTeardownProbe', afterRender: instance => {
                if (!probe.armed) return;
                probe.armed = false;
                const destroy = () => { instance.destroy(); probe.destroyed = true; };
                if (destroyIn === 'render') destroy();
                // Runs after streaming.render has queued its replay, but before the replay fires.
                else setTimeout(destroy, 0);
              }}]
            });
            const handle = chart._eventHandler;
            chart._eventHandler = function(...args) {
              probe.events++;
              if (probe.destroyed) probe.lateEvents++;
              return handle.apply(this, args);
            };
          }, destroyIn);
          await page.clock.runFor(50);
          await page.evaluate(() => {
            const canvas = chart.canvas;
            const box = canvas.getBoundingClientRect();
            // The plugin's native mouse listener records a hover position for frame replays.
            canvas.dispatchEvent(new MouseEvent('mousedown', {clientX: box.left + 450, clientY: box.top + 200}));
          });
          await page.clock.runFor(100);
          assert.ok(await page.evaluate(() => probe.events > 0), 'live hover replay must remain functional');
          await page.evaluate(() => chart.canvas.dispatchEvent(new MouseEvent('mouseout')));
          await page.clock.runFor(100);
          const outside = await page.evaluate(() => probe.events);
          await page.clock.runFor(100);
          assert.equal(await page.evaluate(() => probe.events), outside, 'mouseout must stop hover replay');
          await page.evaluate(() => {
            const box = chart.canvas.getBoundingClientRect();
            chart.canvas.dispatchEvent(new MouseEvent('mousedown', {clientX: box.left + 500, clientY: box.top + 200}));
          });
          await page.clock.runFor(100);
          assert.ok(await page.evaluate(count => probe.events > count, outside), 'hover must work after re-entry');
          await page.evaluate(() => { probe.armed = true; });
          await page.clock.runFor(100);
          assert.deepEqual(await page.evaluate(() => ({destroyed: probe.destroyed, lateEvents: probe.lateEvents})),
            {destroyed: true, lateEvents: 0}, `${destroyIn}: no event handling after destruction`);
          assert.deepEqual(errors, [], destroyIn);
          const count = await page.evaluate(() => probe.events);
          await page.clock.runFor(1000);
          assert.equal(await page.evaluate(() => probe.events), count);
        }
      } finally {
        await browser.close();
      }
    });
    test(`${chartPackage} / ${path.basename(artifact)}: quiet update recovery`, {timeout: 30000}, async () => {
      const browser = await chromium.launch({headless: true,
        executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.clock.install({time: new Date('2024-01-02T12:00:00Z')});
        await page.clock.pauseAt(new Date('2024-01-02T12:00:01Z'));
        await page.setContent('<canvas id="chart" width="900" height="500"></canvas>');
        for (const file of [`node_modules/${chartPackage}/dist/chart.umd.js`, artifact]) {
          await page.addScriptTag({content: read(file)});
        }
        const failures = await page.evaluate(() => {
          const failures = [];
          const keys = ['_setStyle', 'updateElement', 'updateSharedOptions'];
          for (const ownMethods of [false, true]) {
            for (const phase of ['success', 'beforeUpdate', 'beforeDatasetUpdate', 'afterDatasetUpdate', 'cancel']) {
              for (const active of [false, true]) {
                const label = `${ownMethods ? 'own' : 'inherited'} / ${phase} / animation=${active}`;
                const expectedError = new Error(label);
                let armed = false;
                let sawSuppression = false;
                const fault = hook => { if (armed && phase === hook) throw expectedError; };
                const instance = new Chart(document.getElementById('chart'), {
                  type: 'line', data: {labels: ['a', 'b'], datasets: [{data: [1, 2]}, {data: [3, 4]}]},
                  options: {responsive: false, animation: false},
                  plugins: [{id: 'quietFailureProbe',
                    beforeUpdate: () => fault('beforeUpdate'),
                    beforeDatasetsUpdate: chart => {
                      // Control only the visibility-animation branch, not the update under test.
                      if (armed && active) chart.data.datasets.forEach((_, index) => {
                        chart.getDatasetMeta(index).$animations = {visible: {_active: true}};
                      });
                    },
                    beforeDatasetUpdate: (chart, {meta}) => {
                      if (armed && active) {
                        sawSuppression = Object.hasOwn(meta.controller, 'updateElement') &&
                          Object.hasOwn(meta.controller, 'updateSharedOptions');
                      }
                      fault('beforeDatasetUpdate');
                      if (armed && phase === 'cancel') return false;
                    },
                    afterDatasetUpdate: () => fault('afterDatasetUpdate')
                  }]
                });
                try {
                  const controllers = instance.data.datasets.map((_, i) => instance.getDatasetMeta(i).controller);
                  if (ownMethods) controllers.forEach(controller => keys.forEach(key => {
                    const original = controller[key];
                    Object.defineProperty(controller, key, {configurable: true, writable: true,
                      enumerable: false, value: function(...args) { return original.apply(this, args); }});
                  }));
                  const snapshots = controllers.map(controller => keys.map(key => ({
                    method: controller[key], descriptor: Object.getOwnPropertyDescriptor(controller, key)
                  })));
                  armed = true;
                  let caught;
                  try { instance.update('quiet'); } catch (error) { caught = error; }
                  armed = false;
                  const shouldThrow = !['success', 'cancel'].includes(phase);
                  if (caught !== (shouldThrow ? expectedError : undefined)) failures.push(`${label}: original error`);
                  if (active && phase !== 'beforeUpdate' && !sawSuppression) failures.push(`${label}: missing suppression`);
                  controllers.forEach((controller, index) => keys.forEach((key, keyIndex) => {
                    const saved = snapshots[index][keyIndex];
                    const actual = Object.getOwnPropertyDescriptor(controller, key);
                    if (controller[key] !== saved.method || !!actual !== !!saved.descriptor ||
                      (actual && ['value', 'get', 'set', 'writable', 'enumerable', 'configurable']
                        .some(field => actual[field] !== saved.descriptor[field]))) {
                      failures.push(`${label}: dataset ${index} ${key} not restored`);
                    }
                  }));
                  controllers.forEach(controller => { delete controller._cachedMeta.$animations; });
                  const point = instance.getDatasetMeta(0).data[0];
                  const oldY = point.y;
                  instance.data.datasets[0].data[0] = 77;
                  instance.update('none');
                  if (!Number.isFinite(point.y) || point.y === oldY ||
                    instance.getDatasetMeta(0).controller.getParsed(0).y !== 77) {
                    failures.push(`${label}: subsequent normal update did not recover`);
                  }
                } finally {
                  instance.destroy();
                }
              }
            }
          }
          let armed = false;
          let nested = false;
          const nestedError = new Error('nested update');
          const instance = new Chart(document.getElementById('chart'), {
            type: 'line', data: {labels: ['a'], datasets: [{data: [1]}, {data: [2]}]},
            options: {responsive: false, animation: false},
            plugins: [{id: 'nestedQuietProbe', beforeUpdate: chart => {
              if (!armed) return;
              if (nested) throw nestedError;
              nested = true;
              const controller = chart.getDatasetMeta(0).controller;
              const outerStyle = controller._setStyle;
              let caught;
              try { chart.update('quiet'); } catch (error) { caught = error; }
              if (caught !== nestedError || controller._setStyle !== outerStyle) {
                failures.push('nested update did not restore the outer override');
              }
            }}]
          });
          try {
            const controller = instance.getDatasetMeta(0).controller;
            const original = controller._setStyle;
            armed = true;
            instance.update('quiet');
            if (controller._setStyle !== original || Object.hasOwn(controller, '_setStyle')) {
              failures.push('outer update did not restore the original method');
            }
            armed = false;
            // A failure while installing the second override must restore the first.
            const second = instance.getDatasetMeta(1).controller;
            Object.defineProperty(second, '_setStyle', {value: second._setStyle,
              writable: false, configurable: true});
            let caught;
            try { instance.update('quiet'); } catch (error) { caught = error; }
            if (!(caught instanceof TypeError) || controller._setStyle !== original ||
              Object.hasOwn(controller, '_setStyle') ||
              Object.getOwnPropertyDescriptor(second, '_setStyle').writable !== false) {
              failures.push('partial override setup was not rolled back');
            }
            delete second._setStyle;
            instance.update('none');
          } finally {
            instance.destroy();
          }
          return failures;
        });
        assert.deepEqual(failures, []);
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
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
        for (const destroyIn of ['onRefresh', 'afterRender']) {
          await page.evaluate(destroyIn => {
            probe.refreshes = 0;
            probe.destroyed = 0;
            probe.armed = false;
            const destroy = instance => {
              if (probe.armed) { probe.destroyed++; instance.destroy(); }
            };
            window.chart = new Chart(document.getElementById('chart'), {
              type: 'line',
              data: {datasets: [{data: [{x: Date.now(), y: 1}]}]},
              options: {responsive: false, animation: false,
                scales: {x: {type: 'realtime', realtime: {refresh: 100,
                  onRefresh: instance => {
                    probe.refreshes++;
                    if (destroyIn === 'onRefresh') destroy(instance);
                  }}}}},
              plugins: [{id: 'destroyProbe', afterRender: instance => {
                if (destroyIn === 'afterRender') destroy(instance);
              }}]
            });
          }, destroyIn);
          // Let the initial zero-delay refresh establish its configured interval.
          await page.clock.runFor(50);
          await page.evaluate(() => { probe.armed = true; });
          await page.clock.runFor(1000);
          assert.equal(await page.evaluate(() => probe.destroyed), 1, destroyIn);
          assert.deepEqual(errors, [], `${destroyIn}: no work may access a destroyed chart`);
          assert.deepEqual(await page.evaluate(() => ({intervals: probe.intervals.size,
            frames: probe.frames.size,
            listeners: [...probe.listeners.values()].reduce((sum, entries) => sum + entries.size, 0),
            registered: !!Chart.getChart(document.getElementById('chart'))})),
          {intervals: 0, frames: 0, listeners: 0, registered: false}, destroyIn);
          const refreshes = await page.evaluate(() => probe.refreshes);
          await page.clock.runFor(500);
          assert.equal(await page.evaluate(() => probe.refreshes), refreshes);
        }
      } finally {
        await browser.close();
      }
    });
  }
}
