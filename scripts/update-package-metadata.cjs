/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const BOT_PREFIX = 'CHORE: Update package metadata';
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function gitOutput(root, ...args) {
  // The locked documentation dependency tree already exceeds Node's 1 MiB default.
  return execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
}

function parseVersion(version) {
  if (typeof version !== 'string' || !(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.0$/).test(version)) {
    throw new Error('Version must use major.minor.0 without leading zeroes or prerelease suffixes.');
  }
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) {
    throw new Error('Version components must be safe integers.');
  }
  return parts;
}

function calculateMetadata(baseVersion, increment, sha, date) {
  const [major, minor] = parseVersion(baseVersion);
  if (!Number.isSafeInteger(increment) || increment < 1 || !Number.isSafeInteger(minor + increment)) {
    throw new Error('Increment must be a positive safe integer without version overflow.');
  }
  if (!SHA_PATTERN.test(sha) || !Number.isSafeInteger(date) || date < 0) {
    throw new Error('Metadata needs a full commit SHA and non-negative Unix timestamp.');
  }
  return {version: `${major}.${minor + increment}.0`, streamingMetadata: {
    sourceCommit: sha, build: parseInt(sha.slice(0, 7), 16), date
  }};
}

function validateManifests(pkg, lock, version) {
  const [major, minor] = parseVersion(pkg.version);
  const [nextMajor, nextMinor] = parseVersion(version);
  if (major > nextMajor || major === nextMajor && minor > nextMinor) {
    throw new Error('Refusing a version downgrade; an explicit new baseline is required.');
  }
  const lockRoot = lock.packages && lock.packages[''];
  if (lock.lockfileVersion !== 2 || !lockRoot ||
      [lock, lockRoot].some(entry => entry.version !== pkg.version || entry.name !== pkg.name)) {
    throw new Error('The lockfile root must match package.json (locked format 2).');
  }
}

function planMetadata(root, source) {
  const git = (...args) => gitOutput(root, ...args).trim();
  if (!SHA_PATTERN.test(source) || git('rev-parse', 'HEAD') !== source) {
    throw new Error('Source must be the full SHA of the checked-out HEAD.');
  }
  if (git('show', '-s', '--format=%s', source).startsWith(BOT_PREFIX)) {
    return null;
  }
  const read = name => JSON.parse(git('show', `${source}:${name}`));
  const {baseCommit, baseVersion} = read('.versioning.json');
  if (!SHA_PATTERN.test(baseCommit)) {
    throw new Error('Invalid versioning base commit.');
  }
  git('merge-base', '--is-ancestor', baseCommit, source);
  const subjects = git('log', '--format=%s', `${baseCommit}..${source}`);
  const increment = subjects.split('\n').filter(subject => subject && !subject.startsWith(BOT_PREFIX)).length;
  const metadata = calculateMetadata(baseVersion, increment, source, Number(git('show', '-s', '--format=%ct', source)));
  const pkg = read('package.json');
  const lock = read('package-lock.json');
  validateManifests(pkg, lock, metadata.version);
  Object.assign(pkg, metadata);
  lock.version = metadata.version;
  lock.packages[''].version = metadata.version;
  return {metadata, files: {'package.json': pkg, 'package-lock.json': lock}};
}

function updateMetadata(root, source) {
  const plan = planMetadata(root, source);
  if (!plan) {
    return null;
  }
  const outputs = Object.entries(plan.files).map(([name, data]) => {
    const file = path.join(root, name);
    const output = JSON.stringify(data, null, 2) + '\n';
    const current = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const original = gitOutput(root, 'show', `${source}:${name}`).replace(/\r\n/g, '\n');
    if (current !== original && current !== output) {
      throw new Error(`Refusing to overwrite local changes in ${name}.`);
    }
    return {file, output};
  });
  // Validate both files before writing either. A repeated run produces identical bytes.
  outputs.forEach(({file, output}) => fs.writeFileSync(file, output));
  return plan.metadata;
}

module.exports = {BOT_PREFIX, calculateMetadata, updateMetadata};

if (require.main === module) {
  try {
    const result = updateMetadata(process.cwd(), process.env.SOURCE_SHA);
    console.log(result ? `Prepared package metadata ${result.version} for ${result.streamingMetadata.sourceCommit}` : 'Metadata commit: nothing to do.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
