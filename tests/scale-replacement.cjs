/* global Chart, chart, probe, replaceScale */
const assert = require('node:assert/strict');

async function installTimerProbe(page) {
  await page.evaluate(() => {
    window.probe = {intervals: new Set(), frames: new Set()};
    const interval = window.setInterval.bind(window);
    const clear = window.clearInterval.bind(window);
    window.setInterval = (...args) => { const id = interval(...args); probe.intervals.add(id); return id; };
    window.clearInterval = id => { probe.intervals.delete(id); clear(id); };
    const frame = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const id = frame(time => { probe.frames.delete(id); callback(time); });
      probe.frames.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { probe.frames.delete(id); cancel(id); };
  });
}

async function checkScaleReplacement(page) {
  for (const phase of ['normal', 'cancel', 'throw', 'nested', 'onRefresh', 'remove']) {
    await page.evaluate(phase => {
      Object.assign(probe, {phase, refreshes: [0, 0], draws: 0, armed: false, nested: false,
        error: new Error('scale replacement sentinel')});
      window.replaceScale = () => {
        if (probe.phase === 'remove') {
          delete chart.options.scales.x;
          chart.data.datasets[0].xAxisID = 'xOther';
        } else {
          chart.options.scales.x = {type: 'time', min: Date.now() - 1000, max: Date.now()};
        }
        chart.update();
      };
      window.chart = new Chart(document.getElementById('chart'), {
        type: 'line', data: {datasets: [{xAxisID: 'x', data: [{x: Date.now(), y: 1}]},
          {xAxisID: 'xOther', data: [{x: Date.now(), y: 2}]}]},
        options: {responsive: false, animation: false, scales: {
          x: {type: 'realtime', realtime: {duration: 1000, refresh: 100, onRefresh: () => {
            probe.refreshes[0]++;
            if (probe.phase === 'onRefresh' && probe.armed) { probe.armed = false; replaceScale(); }
          }}},
          xOther: {axis: 'x', type: 'realtime', realtime: {duration: 1000, refresh: 100,
            onRefresh: () => { probe.refreshes[1]++; }}}
        }},
        plugins: [{id: 'replacementProbe', beforeUpdate: () => {
          if (!probe.armed) return;
          if (probe.phase === 'cancel') return false;
          if (probe.phase === 'throw') throw probe.error;
          if (probe.phase === 'nested' && !probe.nested) { probe.nested = true; chart.update(); }
        }, afterDraw: () => { probe.draws++; }}]
      });
    }, phase);
    await page.clock.runFor(300);
    assert.equal(await page.evaluate(() => probe.intervals.size), 2, `${phase}: both scales must refresh`);
    assert.equal(await page.evaluate(() => probe.frames.size), 2, `${phase}: both scales must scroll`);
    const replaced = await page.evaluate(() => {
      probe.armed = true;
      if (probe.phase === 'onRefresh') return true;
      let caught;
      try { replaceScale(); } catch (error) { caught = error; }
      probe.armed = false;
      return caught === (probe.phase === 'throw' ? probe.error : undefined);
    });
    assert.equal(replaced, true, `${phase}: preserve the original update outcome`);
    if (phase === 'onRefresh') await page.clock.runFor(100);
    assert.equal(await page.evaluate(() => probe.intervals.size), 1, `${phase}: replaced scale must stop its interval immediately`);
    assert.equal(await page.evaluate(() => probe.frames.size), 1, `${phase}: replaced scale must stop its frame loop immediately`);
    const retired = await page.evaluate(() => probe.refreshes.slice());
    // Finish any cancelled/failed update before allowing the surviving scale to draw.
    await page.evaluate(() => chart.update());
    await page.clock.runFor(300);
    assert.equal(await page.evaluate(() => probe.refreshes[0]), retired[0], `${phase}: no retired callbacks`);
    assert.ok(await page.evaluate(count => probe.refreshes[1] > count, retired[1]), `${phase}: preserve the other scale`);
    // Repeatedly create and retire a replacement with the same ID.
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.evaluate(() => {
        chart.options.scales.x = {type: 'realtime', realtime: {duration: 1000, refresh: 100,
          onRefresh: () => { probe.refreshes[0]++; }}};
        chart.data.datasets[0].xAxisID = 'x';
        chart.update();
      });
      await page.clock.runFor(200);
      assert.equal(await page.evaluate(() => probe.intervals.size), 2);
      await page.evaluate(() => { chart.options.scales.x = {type: 'time'}; chart.update(); });
      assert.equal(await page.evaluate(() => probe.intervals.size), 1);
    }
    const stopped = await page.evaluate(() => {
      chart.destroy();
      return {draws: probe.draws, refreshes: probe.refreshes.slice()};
    });
    assert.deepEqual(await page.evaluate(() => [probe.intervals.size, probe.frames.size]), [0, 0]);
    await page.clock.runFor(500);
    assert.deepEqual(await page.evaluate(() => ({draws: probe.draws, refreshes: probe.refreshes})), stopped);
    assert.equal(await page.evaluate(() => !!Chart.getChart(document.getElementById('chart'))), false);
  }
}

module.exports = {installTimerProbe, checkScaleReplacement};
