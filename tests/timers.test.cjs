const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {before, test} = require('node:test');
const {rollup} = require('rollup');
const {nodeResolve} = require('@rollup/plugin-node-resolve');

let code;
before(async () => {
  const bundle = await rollup({input: path.join(__dirname, '../src/helpers/helpers.streaming.js'),
    plugins: [nodeResolve()]});
  try {
    const result = await bundle.generate({format: 'iife', name: 'timers'});
    code = result.output[0].code;
  } finally {
    await bundle.close();
  }
});

// Fake only the scheduler boundary; execute the real streaming and Chart.js helpers.
function scheduler() {
  let nextId = 1;
  const frames = new Map();
  const intervals = new Map();
  const sandbox = {window: {
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  },
  setInterval(callback, delay) { const id = nextId++; intervals.set(id, {callback, delay}); return id; },
  clearInterval(id) { intervals.delete(id); }};
  vm.runInNewContext(code, sandbox);
  return {timers: sandbox.timers, frames, intervals,
    frame() { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); },
    refresh() { intervals.values().next().value.callback(); }};
}

for (const kind of ['Frame', 'Data']) {
  for (const restart of [false, true]) {
    test(`${kind} timer respects ${restart ? 'replacement' : 'stop'} inside its callback`, () => {
      const clock = scheduler();
      const context = {};
      const start = clock.timers[`start${kind}RefreshTimer`];
      const stop = clock.timers[`stop${kind}RefreshTimer`];
      const pending = kind === 'Frame' ? clock.frames : clock.intervals;
      let calls = 0;
      let replacementCalls = 0;
      const callback = () => {
        calls++;
        stop(context);
        if (restart) start(context, () => { replacementCalls++; return 250; }, 250);
        return 100;
      };
      start(context, callback, 50);
      (kind === 'Frame' ? clock.frame : clock.refresh)();
      assert.equal(calls, 1);
      assert.equal(pending.size, restart ? 1 : 0, 'old callback must not resurrect or duplicate its timer');
      if (restart) {
        if (kind === 'Data') assert.equal(pending.values().next().value.delay, 250);
        (kind === 'Frame' ? clock.frame : clock.refresh)();
        assert.equal(replacementCalls, 1, 'the replacement callback must remain in control');
        assert.equal(calls, 1);
      }
      stop(context);
      stop(context);
      assert.equal(pending.size, 0);
    });
  }
}

test('data timer applies refresh changes without duplicating intervals', () => {
  const clock = scheduler();
  const context = {};
  clock.timers.startDataRefreshTimer(context, () => 250, 50);
  clock.refresh();
  assert.equal(clock.intervals.size, 1);
  assert.equal(clock.intervals.values().next().value.delay, 250);
  const id = context.refreshTimerID;
  clock.refresh();
  assert.equal(context.refreshTimerID, id);
  clock.timers.stopDataRefreshTimer(context);
  assert.equal(clock.intervals.size, 0);
});
