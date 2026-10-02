const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {once} = require('node:events');
const {test} = require('node:test');
const {chromium} = require('playwright');

test('built documentation menus and live sample work without external network access', {timeout: 60000}, async () => {
  const root = path.resolve(__dirname, '../dist/docs');
  const base = '/chartjs-plugin-streaming/';
  const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'};
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
    let file = path.resolve(root, decodeURIComponent(pathname.slice(base.length)));
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({headless: true,
      executablePath: process.env.STREAMING_BROWSER_EXECUTABLE || undefined});
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    page.setDefaultTimeout(10000);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.route('**/*', route => {
      // The inherited theme references an optional CDN icon stylesheet. Stub
      // that exact resource, not application scripts. Icon rendering is not
      // covered by this offline menu/chart smoke test.
      if (route.request().url() === 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.1/css/all.min.css') {
        return route.fulfill({status: 200, contentType: 'text/css', body: ''});
      }
      if (new URL(route.request().url()).origin !== origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    for (const locale of ['', 'ja/']) {
      const response = await page.goto(`${origin}${base}${locale}guide/`);
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => !!document.querySelector('#app')?.__vue__);
      const menu = page.getByRole('button', {name: 'Development (dev)', exact: true});
      // The inherited theme opens desktop dropdowns by hover or keyboard.
      await menu.focus();
      await menu.press('Enter');
      const source = page.locator('.navbar a[href="https://github.com/Burki24/chartjs-plugin-streaming/tree/dev"]');
      await source.waitFor({state: 'visible'});
      assert.ok(await source.isVisible());
      assert.equal(await source.getAttribute('href'), 'https://github.com/Burki24/chartjs-plugin-streaming/tree/dev');
      assert.equal(await page.locator('.navbar a[href="https://github.com/Burki24/chartjs-plugin-streaming/releases"]').getAttribute('href'),
        'https://github.com/Burki24/chartjs-plugin-streaming/releases');
      const edit = await page.locator('.edit-link a').getAttribute('href');
      assert.ok(edit.startsWith('https://github.com/Burki24/chartjs-plugin-streaming/edit/dev/docs/'));
    }
    await page.goto(`${origin}${base}samples/charts/line-horizontal.html`);
    await page.waitForFunction(() => {
      const chart = document.querySelector('.chart-view')?.__vue__?.chart();
      return chart && chart.data.datasets.every(dataset => dataset.data.length > 1);
    });
    const sample = await page.evaluate(() => {
      const chart = document.querySelector('.chart-view').__vue__.chart();
      return {type: chart.scales.x.type, range: chart.scales.x.max - chart.scales.x.min,
        count: chart.data.datasets.length};
    });
    assert.equal(sample.type, 'realtime');
    assert.ok(sample.range > 0);
    assert.equal(sample.count, 2);
    assert.deepEqual(external, [], 'documentation requests external resources');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
