import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {chromium} from 'playwright';

// Behavioral adapter tests on a current browser with isolated missing features.
// These never qualify a historic Android WebView; the actual provider is tested separately.
async function fixture(t, {legacy = false, missing = false} = {}) {
  const server = createServer((req, res) => {
    if (req.url === '/webview-compat.js') return res.setHeader('Content-Type', 'text/javascript').end(readFileSync(new URL('../static/webview-compat.js', import.meta.url)));
    if (req.url === '/webview-legacy.css') return res.setHeader('Content-Type', 'text/css').end(readFileSync(new URL('../static/webview-legacy.css', import.meta.url)));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html><head><script src="/webview-compat.js"></script><link rel="stylesheet" href="/webview-legacy.css"></head><body><div id="background" aria-hidden="false"><button id="first" tabindex="2">First</button></div><button id="outside">Outside</button><form class="source-uid-form"><input><button class="source-refresh-button">Refresh</button></form><div class="request-workspace" style="width:520px"></div></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({headless: true}); t.after(() => browser.close());
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(({missing}) => {
    window.nativeHasOwn = Object.hasOwn;
    window.nativeAt = Array.prototype.at;
    window.nativeUUID = crypto.randomUUID;
    if (!missing) return;
    Object.defineProperty(Object, 'hasOwn', {configurable: true, writable: true, value: undefined});
    Object.defineProperty(Array.prototype, 'at', {configurable: true, writable: true, value: undefined});
    Object.defineProperty(crypto, 'randomUUID', {configurable: true, value: undefined});
    delete HTMLElement.prototype.inert;
    const supports = CSS.supports.bind(CSS);
    CSS.supports = function (rule, value) {
      if (['selector(:has(*))', 'height: 100dvh', 'container-type: size', 'color: color-mix(in srgb, black, white)'].includes(rule)) return false;
      return arguments.length === 1 ? supports(rule) : supports(rule, value);
    };
  }, {missing});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${legacy ? '#bilikara-legacy' : ''}`);
  t.after(() => assert.deepEqual(errors, []));
  return page;
}

test('latest leaves native implementations and input semantics untouched', async t => {
  const page = await fixture(t);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.webviewMode,
    Object.hasOwn === nativeHasOwn, Array.prototype.at === nativeAt, crypto.randomUUID === nativeUUID,
    document.documentElement.hasAttribute('data-legacy-inert')]), ['latest', true, true, true, false]);
});

test('legacy fills only missing primitives with correct generic indexing and secure UUIDs', async t => {
  const page = await fixture(t, {legacy: true, missing: true});
  assert.deepEqual(await page.evaluate(() => {
    const proto = {inherited: 1}, object = Object.assign(Object.create(proto), {own: 2});
    let rejectsNull = false, rejectsBigInt = false;
    try { Object.hasOwn(null, 'x'); } catch (e) { rejectsNull = e instanceof TypeError; }
    try { [1].at(1n); } catch (e) { rejectsBigInt = e instanceof TypeError; }
    return [Object.hasOwn(object, 'own'), Object.hasOwn(object, 'inherited'), rejectsNull,
      [1, 2, 3].at(-1), Array.prototype.at.call({0: 'a', 1: 'b', length: 2}, -1),
      [1].at(Infinity) === undefined, rejectsBigInt, Object.keys(Array.prototype).includes('at'),
      new Set(Array.from({length: 32}, () => crypto.randomUUID())).size];
  }), [true, false, true, 3, 'b', true, true, false, 32]);
  assert.match(await page.evaluate(() => crypto.randomUUID()), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('legacy inert blocks pointer, keyboard and programmatic focus; nested/dynamic controls restore', async t => {
  const page = await fixture(t, {legacy: true, missing: true});
  await page.evaluate(() => {
    window.activations = 0;
    document.querySelector('#first').onclick = () => activations++;
    document.querySelector('#background').inert = true;
    document.querySelector('#background').insertAdjacentHTML('beforeend', '<section id="nested" inert><button id="dynamic">Dynamic</button></section>');
  });
  await page.waitForFunction(() => document.querySelector('#dynamic').tabIndex === -1);
  assert.equal(await page.evaluate(() => {
    const first = document.querySelector('#first'); first.focus(); first.click();
    first.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
    return document.activeElement === first || activations !== 0;
  }), false);
  await page.locator('#outside').focus(); await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'first');
  await page.evaluate(() => { document.querySelector('#background').inert = false; });
  assert.equal(await page.locator('#first').getAttribute('tabindex'), '2');
  assert.equal(await page.locator('#background').getAttribute('aria-hidden'), 'false');
  assert.equal(await page.locator('#dynamic').getAttribute('tabindex'), '-1');
  await page.evaluate(() => { document.querySelector('#nested').inert = false; });
  assert.equal(await page.locator('#dynamic').getAttribute('tabindex'), null);
  await page.locator('#first').click(); assert.equal(await page.evaluate(() => activations), 1);
});

test('legacy relational styles, viewport and container sizes follow real DOM changes', async t => {
  const page = await fixture(t, {legacy: true, missing: true});
  await page.waitForFunction(() => document.querySelector('.source-uid-form').getAttribute('data-legacy-has')?.includes('r24'));
  await page.evaluate(() => document.querySelector('.source-refresh-button').remove());
  await page.waitForFunction(() => !document.querySelector('.source-uid-form').getAttribute('data-legacy-has').includes('r24'));
  await page.waitForFunction(() => document.querySelector('.request-workspace').hasAttribute('data-legacy-wide'));
  await page.evaluate(() => { document.querySelector('.request-workspace').style.width = '300px'; });
  await page.waitForFunction(() => !document.querySelector('.request-workspace').hasAttribute('data-legacy-wide'));
  await page.setViewportSize({width: 390, height: 650});
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--legacy-vh') === '6.5px');
});

// New shared relationships must be reviewed when extending the legacy surface.
test('every shared :has relationship retains a matching legacy adapter', () => {
  const source = readFileSync(new URL('../static/webview-compat.js', import.meta.url), 'utf8');
  const relations = JSON.parse(/var relations = (\[[\s\S]*?\n\]);/u.exec(source)[1]);
  const normalize = value => value.trim().replace(/\s+/gu, ' ');
  for (const name of readdirSync(new URL('../static/', import.meta.url)).filter(name => name.endsWith('.css'))) {
    const css = readFileSync(new URL('../static/' + name, import.meta.url), 'utf8');
    for (let start = css.indexOf(':has('); start >= 0; start = css.indexOf(':has(', start + 5)) {
      let depth = 1, end = start + 5;
      while (depth) { if (css[end] === '(') depth++; if (css[end] === ')') depth--; end++; }
      const relative = css.slice(start + 5, end - 1);
      const fallback = /^,\s*:where\(\[data-legacy-has~="([^"]+)"\]\)\)/u.exec(css.slice(end));
      assert.ok(fallback, name + ': missing legacy relationship');
      assert.ok(relations.some(([key, , query]) => key === fallback[1] && normalize(query) === normalize(relative)), name + ': adapter query drift');
    }
  }
});
