const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {execFileSync} = require('node:child_process');
const {rollup} = require('rollup');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

test('all advertised package entry points exist', () => {
  for (const field of ['main', 'module', 'types', 'unpkg', 'jsdelivr']) {
    assert.ok(fs.existsSync(path.join(root, pkg[field])), `${field}: ${pkg[field]} is missing`);
  }
});

test('npm archive includes working CommonJS, bundler ESM, CDN and type entry points', async () => {
  assert.ok(process.env.npm_execpath, 'Run this test with npm test');
  const cache = path.join(root, 'node_modules', '.cache');
  fs.mkdirSync(cache, {recursive: true});
  const temp = fs.mkdtempSync(path.join(cache, 'streaming-package-'));
  try {
    const output = execFileSync(process.execPath, [process.env.npm_execpath,
      'pack', '--ignore-scripts', '--json', '--pack-destination', temp], {cwd: root, encoding: 'utf8'});
    const [packed] = JSON.parse(output);
    const files = new Set(packed.files.map(file => file.path));
    for (const field of ['main', 'module', 'types', 'unpkg', 'jsdelivr']) {
      assert.ok(files.has(pkg[field]), `npm archive omits ${field}: ${pkg[field]}`);
    }
    assert.ok(files.has('LICENSE.md'));
    assert.ok(files.has('README.md'));
    assert.ok(![...files].some(file => /^(tests|src|node_modules)\//.test(file)));
    execFileSync('tar', ['-xf', path.join(temp, packed.filename), '-C', temp]);
    const extracted = path.join(temp, 'package');
    // A fresh process resolves the package directory through its actual main field.
    execFileSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const {Chart} = require('chart.js');
      const components = require(${JSON.stringify(extracted)});
      assert.deepEqual(components.map(component => component.id), ['streaming', 'realtime']);
      assert.equal(Chart.registry.getPlugin('streaming').version, ${JSON.stringify(pkg.version)});
      assert.equal(Chart.registry.getScale('realtime').id, 'realtime');
    `], {cwd: root});

    // The historical "module" entry is a bundler contract, not a Node exports map.
    const bundle = await rollup({input: path.join(extracted, pkg.module),
      external: ['chart.js', 'chart.js/helpers']});
    try {
      const file = path.join(temp, 'consumer.cjs');
      await bundle.write({file, format: 'cjs', exports: 'named'});
      const esm = require(file);
      assert.equal(esm.StreamingPlugin.id, 'streaming');
      assert.equal(esm.RealTimeScale.id, 'realtime');
      assert.deepEqual(esm.default.map(component => component.id), ['streaming', 'realtime']);
    } finally {
      await bundle.close();
    }
  } finally {
    // Only the unique directory created by this test is removed.
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('locked build reproduces committed bundles independently of the wall-clock year', async () => {
  const configs = require('../rollup.config');
  const originalDate = global.Date;
  try {
    for (const year of [2023, 2030]) {
      global.Date = class extends originalDate {
        getFullYear() { return year; }
      };
      // Reload so a date-dependent banner cannot pass just because it was cached.
      delete require.cache[require.resolve('../rollup.config')];
      const freshConfigs = require('../rollup.config');
      for (let index = 0; index < configs.length; index++) {
        const {output, ...input} = freshConfigs[index];
        const bundle = await rollup(input);
        try {
          const generated = await bundle.generate(output);
          assert.equal(generated.output.length, 1);
          assert.equal(generated.output[0].code, fs.readFileSync(path.join(root, output.file), 'utf8'),
            `${output.file} differs from the committed baseline in ${year}`);
        } finally {
          await bundle.close();
        }
      }
    }
  } finally {
    global.Date = originalDate;
  }
});
