# Maintenance rules

- This repository is a standalone JavaScript plugin, not an IP-Symcon PHP module.
- Work on the owner's development branch without committing, pushing, tagging,
  publishing or deploying unless explicitly requested.
- Write commit subjects and descriptions in English, in separate code blocks.
- Read `README.md`, `package.json`, the lockfile and affected workflows first.
- Preserve the plugin API, upstream license/history and unrelated local changes.
- Keep build infrastructure, dependency upgrades and runtime fixes in separate,
  test-backed steps. Do not change JSLive from this repository's maintenance task.
- Use the development versions in `.nvmrc` and `packageManager`, install with
  `npm ci --ignore-scripts`, and run `npm run verify` before handing off changes.
- Check `npm run package` and bundle/lockfile diffs for packaging changes.
- For documentation changes, run `npm run docs` and `npm run test:docs` too.
  Keep the documentation CI check blocking; never deploy as part of verification.
- Never use a passing smoke test as proof of full Chart.js or JSLive compatibility.
