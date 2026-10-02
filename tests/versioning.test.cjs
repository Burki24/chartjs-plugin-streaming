const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {test} = require('node:test');
const {calculateMetadata, updateMetadata, BOT_PREFIX} = require('../scripts/update-package-metadata.cjs');

const sha = '1234567890abcdef1234567890abcdef12345678';
test('version increments use the minor component; build and date use the source commit', () => {
  assert.deepEqual(calculateMetadata('3.1.0', 1, sha, 1790000000), {
    version: '3.2.0', streamingMetadata: {sourceCommit: sha, build: 19088743, date: 1790000000}
  });
  assert.equal(calculateMetadata('3.9.0', 4, sha, 0).version, '3.13.0');
  for (const bad of ['3.1', '3.1.1', '3.01.0', '3.2.0-beta.1', null]) {
    assert.throws(() => calculateMetadata(bad, 1, sha, 0));
  }
  for (const bad of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => calculateMetadata('3.1.0', bad, sha, 0));
  }
  assert.throws(() => calculateMetadata('3.1.0', 1, '--bad', 0));
  assert.throws(() => calculateMetadata('3.1.0', 1, sha, -1));
});

function fixture(t) {
  const cache = path.join(__dirname, '../node_modules/.cache');
  fs.mkdirSync(cache, {recursive: true});
  const root = fs.mkdtempSync(path.join(cache, 'streaming-versioning-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const write = (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const commit = subject => {
    git('add', '.');
    git('-c', 'user.name=Version test', '-c', 'user.email=test@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-b', 'dev');
  git('config', 'core.autocrlf', 'false');
  write('package.json', {name: 'test-package', version: '3.1.0', description: 'preserve me'});
  write('package-lock.json', {name: 'test-package', version: '3.1.0', lockfileVersion: 2,
    packages: {'': {name: 'test-package', version: '3.1.0'}, 'node_modules/example': {version: '9.9.9'}},
    dependencies: {example: {version: '9.9.9'}}});
  const base = commit('baseline');
  write('.versioning.json', {baseCommit: base, baseVersion: '3.1.0'});
  return {root, git, write, read, commit, base};
}

test('real Git history counts batches, excludes metadata commits, and survives retries and missed runs', t => {
  const f = fixture(t);
  const source = f.commit('introduce versioning');
  const first = updateMetadata(f.root, source);
  assert.equal(first.version, '3.2.0');
  assert.equal(first.streamingMetadata.date, Number(f.git('show', '-s', '--format=%ct', source)));
  assert.equal(f.read('package-lock.json').packages[''].version, '3.2.0');
  assert.equal(f.read('package-lock.json').version, '3.2.0');
  assert.equal(f.read('package.json').description, 'preserve me');
  assert.equal(f.read('package-lock.json').packages['node_modules/example'].version, '9.9.9');
  const files = ['package.json', 'package-lock.json'].map(file => fs.readFileSync(path.join(f.root, file), 'utf8'));
  assert.deepEqual(updateMetadata(f.root, source), first);
  assert.deepEqual(['package.json', 'package-lock.json'].map(file => fs.readFileSync(path.join(f.root, file), 'utf8')), files);
  f.commit(`${BOT_PREFIX} to v3.2.0`);
  assert.equal(updateMetadata(f.root, f.git('rev-parse', 'HEAD')), null);
  f.commit('first new change');
  const latest = f.commit('second change before the bot ran');
  assert.equal(updateMetadata(f.root, latest).version, '3.4.0');
  assert.throws(() => updateMetadata(f.root, source), /HEAD/);
  f.commit(`${BOT_PREFIX} to v3.4.0`);
  f.git('switch', '-c', 'main');
  f.commit('release documentation');
  f.git('switch', 'dev');
  f.git('-c', 'user.name=Version test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'merge', '--no-ff', 'main', '-m', 'Merge main back into dev');
  assert.equal(updateMetadata(f.root, f.git('rev-parse', 'HEAD')).version, '3.6.0');
});

test('metadata validation fails without changing manifests', t => {
  const f = fixture(t);
  f.write('package-lock.json', {version: '2.0.0', packages: {'': {version: '2.0.0'}}});
  const source = f.commit('inconsistent lockfile');
  const before = fs.readFileSync(path.join(f.root, 'package.json'), 'utf8');
  assert.throws(() => updateMetadata(f.root, source), /lockfile/);
  assert.equal(fs.readFileSync(path.join(f.root, 'package.json'), 'utf8'), before);
});

test('local changes and version downgrades are rejected before writing', t => {
  const f = fixture(t);
  let source = f.commit('versioning setup');
  f.write('package-lock.json', {...f.read('package-lock.json'), ownerNote: 'keep this'});
  const before = fs.readFileSync(path.join(f.root, 'package.json'), 'utf8');
  assert.throws(() => updateMetadata(f.root, source), /local changes/);
  assert.equal(fs.readFileSync(path.join(f.root, 'package.json'), 'utf8'), before);
  f.write('package.json', {...f.read('package.json'), version: '4.0.0'});
  source = f.commit('explicit incompatible version without baseline migration');
  assert.throws(() => updateMetadata(f.root, source), /downgrade/);
  assert.equal(f.read('package.json').version, '4.0.0');
});

test('a metadata update regenerates consistent UMD, minified and ESM artifacts', t => {
  const f = fixture(t);
  const repo = path.resolve(__dirname, '..');
  for (const name of ['package.json', 'package-lock.json', 'rollup.config.js']) {
    fs.copyFileSync(path.join(repo, name), path.join(f.root, name));
  }
  // The fixture owns its baseline even after the real repository's bot advances.
  const version = f.read('package.json').version;
  const base = f.commit('copy current package and lock');
  f.write('.versioning.json', {baseCommit: base, baseVersion: version});
  fs.cpSync(path.join(repo, 'src'), path.join(f.root, 'src'), {recursive: true});
  const source = f.commit('prepare build fixture');
  const {version: next} = updateMetadata(f.root, source);
  execFileSync(process.execPath, ['-e', `
    const {rollup} = require('rollup');
    (async () => {
      for (const {output, ...input} of require('./rollup.config')) {
        const bundle = await rollup(input);
        try { await bundle.write(output); } finally { await bundle.close(); }
      }
      const assert = require('node:assert/strict');
      const pkg = require('./package.json');
      assert.equal(require('./' + pkg.main)[0].version, pkg.version);
      const bundle = await rollup({input: pkg.module, external: ['chart.js', 'chart.js/helpers']});
      try { await bundle.write({file: 'consumer.cjs', format: 'cjs', exports: 'named'}); }
      finally { await bundle.close(); }
      assert.equal(require('./consumer.cjs').StreamingPlugin.version, pkg.version);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], {cwd: f.root, stdio: 'pipe'});
  const pkg = f.read('package.json');
  assert.equal(f.read('package-lock.json').version, next);
  for (const file of [pkg.main, pkg.module, pkg.unpkg]) {
    assert.ok(fs.readFileSync(path.join(f.root, file), 'utf8').includes(`${pkg.name} v${next}`), file);
  }
});

test('workflow confines writes to dev metadata, with pinned actions and no publication', () => {
  const yaml = require('js-yaml');
  const workflows = path.join(__dirname, '../.github/workflows');
  const workflow = yaml.load(fs.readFileSync(path.join(workflows, 'update-package-metadata.yml'), 'utf8'));
  assert.deepEqual(workflow.on.push.branches, ['dev']);
  assert.deepEqual(workflow.permissions, {contents: 'read'});
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  const job = workflow.jobs['update-package-metadata'];
  assert.ok(job.if.includes("github.ref == 'refs/heads/dev'"));
  assert.ok(job.if.includes(BOT_PREFIX));
  assert.ok(job.if.includes("github.repository == 'Burki24/chartjs-plugin-streaming'"));
  for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /@[0-9a-f]{40}$/);
  const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with.ref, '${{ github.sha }}');
  const app = job.steps.find(step => step.uses?.startsWith('actions/create-github-app-token@'));
  assert.equal(app.with['permission-contents'], 'write');
  const scripts = job.steps.map(step => step.run || '').join('\n');
  assert.ok(scripts.indexOf('npm run verify') < scripts.indexOf('git commit'));
  assert.ok(scripts.includes('git push origin HEAD:refs/heads/dev'));
  assert.ok(!/--force|npm publish|git tag|gh release/.test(scripts));
  for (const name of ['release.yml', 'publish.yml', 'deploy-docs.yml']) {
    const disabled = yaml.load(fs.readFileSync(path.join(workflows, name), 'utf8'));
    for (const legacy of Object.values(disabled.jobs)) assert.equal(legacy.if, '${{ false }}');
  }
});
