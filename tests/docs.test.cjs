const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const config = require('../docs/.vuepress/config');

test('development documentation works without a published npm package', () => {
  assert.equal(config.base, '/chartjs-plugin-streaming/');
  assert.equal(config.themeConfig.repo, 'Burki24/chartjs-plugin-streaming');
  assert.equal(config.themeConfig.docsBranch, 'dev');
  const plugins = config.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin);
  assert.ok(!plugins.includes('@simonbrunel/vuepress-plugin-versions'));
  assert.ok(!plugins.includes('@vuepress/google-analytics'));
  for (const locale of ['/', '/ja/']) {
    const menu = config.themeConfig.locales[locale].nav.find(item => item.text === 'Development (dev)');
    assert.ok(menu, `Missing development menu for ${locale}`);
    assert.ok(menu.items.some(item => item.link === 'https://github.com/Burki24/chartjs-plugin-streaming/releases'));
    assert.ok(menu.items.some(item => item.link === `${locale}guide/`));
  }
});

test('documentation examples import an existing generated plugin bundle', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/scripts/register.js'), 'utf8');
  const match = source.match(/import StreamingPlugin from '([^']+)'/);
  assert.ok(match);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../docs/scripts', match[1])), match[1]);
});
