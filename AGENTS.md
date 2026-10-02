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
- Keep the existing documentation check visible. Report its known failure
  separately until an explicitly authorized documentation repair is complete.
- Never use a passing smoke test as proof of full Chart.js or JSLive compatibility.
