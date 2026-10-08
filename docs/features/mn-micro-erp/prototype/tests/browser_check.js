#!/usr/bin/env node
/* =============================================================================
   tests/browser_check.js — drives prototype/standalone.html (file://) in headless Chromium with Playwright.

   For each configuration (1280x800 and 390x844, light and dark colour scheme) it:
     - visits every route known to the shell (ERP.app.nav + every registered screen),
     - collects console errors, page errors, dialogs (alert/confirm/prompt are forbidden) and outbound requests,
     - checks there is no horizontal page scroll, no render failure, no "#a=b" hash links, every form control has an id,
     - checks #checks shows all PASS (before and after posting),
     - toggles explanation mode and opens at least one note per screen,
     - runs the sales invoice flow end to end (draft -> line -> preview -> post -> posted invoice + eBarimt preview),
     - saves screenshots to prototype/screenshots/ (desktop light + dark, mobile light) for the key screens.

   Run (rebuild first):
     python3 docs/features/mn-micro-erp/prototype/build_standalone.py
     node docs/features/mn-micro-erp/prototype/tests/browser_check.js
   Playwright: uses the preinstalled package (global or /opt/node-tools) and browsers in PLAYWRIGHT_BROWSERS_PATH.
   Exit code 0 = clean, 1 = at least one failure.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const tries = ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright package not found (tried ' + tries.join(', ') + ')');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file://' + path.join(ROOT, 'standalone.html');
const SHOT_DIR = path.join(ROOT, 'screenshots');
const SHOT_ROUTES = ['home', 'sales-invoice', 'posted-invoice', 'trial-balance', 'financial-statements', 'bank-rec', 'vat-return'];
const CONFIGS = [
  { name: 'desktop-light', width: 1280, height: 800, scheme: 'light', shots: true },
  { name: 'desktop-dark', width: 1280, height: 800, scheme: 'dark', shots: true },
  { name: 'mobile-light', width: 390, height: 844, scheme: 'light', shots: true },
  { name: 'mobile-dark', width: 390, height: 844, scheme: 'dark', shots: false }
];

const failures = [];
const summary = [];
function fail(cfg, where, msg) { failures.push('[' + cfg + '] ' + where + ': ' + msg); }

async function settle(page, ms) { await page.waitForTimeout(ms || 120); }
async function go(page, route) {
  await page.evaluate((r) => { if (location.hash === '#' + r) window.ERP.app.refresh(); else location.hash = '#' + r; }, route);
  await settle(page);
}
async function closeOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const n = await page.locator('.overlay').count();
    if (!n) return;
    await page.keyboard.press('Escape');
    await settle(page, 80);
  }
  await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
}

// Page-side probe: layout + markup rules for the current screen.
async function probe(page) {
  return page.evaluate(() => {
    const se = document.scrollingElement;
    const out = { scrollW: se.scrollWidth, innerW: window.innerWidth, wide: [] };
    if (out.scrollW > out.innerW) {
      // name the widest offenders to make fixing easy
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 && r.width > 0 && !el.closest('.table-wrap, .overlay, [hidden]')) {
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed' && out.wide.length < 6) out.wide.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' right=' + Math.round(r.right));
        }
      });
    }
    out.renderFailed = !!document.querySelector('#screen-body .errlist h3') && /зурахад алдаа/.test(document.querySelector('#screen-body .errlist h3').textContent);
    out.renderFailMsg = out.renderFailed ? document.querySelector('#screen-body .errlist').textContent.slice(0, 300) : '';
    out.notFound = !document.getElementById('screen-body');
    out.badHashes = Array.from(document.querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href')).filter((h) => /[=&?]/.test(h));
    out.noId = Array.from(document.querySelectorAll('input, select, textarea')).filter((c) => !c.id && c.type !== 'hidden').map((c) => c.outerHTML.slice(0, 120));
    out.dupIds = (() => { const seen = {}, d = []; document.querySelectorAll('[id]').forEach((e) => { if (seen[e.id]) d.push(e.id); seen[e.id] = 1; }); return Array.from(new Set(d)); })();
    out.downloads = Array.from(document.querySelectorAll('a[download]')).length;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    out.bodyBg = bodyBg;
    return out;
  });
}
function lum(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
  if (!m) return -1;
  return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
}

// Opens the first visible hotspot on the page body (falls back to any visible hotspot). Returns note id or null.
async function openOneNote(page) {
  const id = await page.evaluate(() => {
    document.querySelectorAll('[data-bc-target]').forEach((e) => e.removeAttribute('data-bc-target'));
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const all = Array.from(document.querySelectorAll('#page .hotspot')).filter(vis);
    const hs = all[0];
    if (!hs) return null;
    hs.setAttribute('data-bc-target', '1');
    hs.scrollIntoView({ block: 'center' });
    return hs.getAttribute('data-note-ref');
  });
  if (!id) return null;
  await page.locator('[data-bc-target]').click({ timeout: 3000 });
  await settle(page, 80);
  const ok = await page.evaluate((nid) => {
    const p = document.getElementById('note-panel');
    return !!p && !p.hidden && p.getAttribute('data-note-id') === nid && !!p.querySelector('#np-title') && p.querySelector('#np-title').textContent.trim().length > 0;
  }, id);
  await page.evaluate(() => window.ERP.app.closeNote());
  return ok ? id : 'FAILED:' + id;
}

async function checksAllPass(page) {
  await go(page, 'checks');
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.check-row'));
    const failed = rows.filter((r) => r.querySelector('.check-mark.fail')).map((r) => r.querySelector('strong').textContent + ' — ' + (r.querySelector('.small') || {}).textContent);
    const head = (document.querySelector('.page-head .pill') || {}).textContent || '';
    return { total: rows.length, failed, head };
  });
}

async function salesFlow(page, cfg, shot, custNo, shotNames) {
  const where = 'sales-flow ' + custNo;
  shotNames = shotNames || {};
  await go(page, 'sales-invoices');
  await page.locator('#sl-new').click();
  await settle(page, 150);
  if ((await page.evaluate(() => location.hash)) !== '#sales-invoice') { fail(cfg.name, where, 'new draft did not open #sales-invoice'); return null; }
  const cust = await page.evaluate((want) => {
    const sel = document.getElementById('f-customer');
    const opts = Array.from(sel.options).filter((o) => o.value);
    return opts.some((o) => o.value === want) ? want : null;
  }, custNo);
  if (!cust) { fail(cfg.name, where, 'customer ' + custNo + ' not in #f-customer'); return null; }
  await page.selectOption('#f-customer', cust);
  await settle(page);
  await page.locator('#act-add').click();
  await settle(page);
  const lineNo = await page.evaluate(() => { const s = document.getElementById('l-no-0'); const o = s && Array.from(s.options).find((x) => x.value); return o ? o.value : null; });
  if (!lineNo) { fail(cfg.name, where, 'line 1 has no item options'); return null; }
  await page.selectOption('#l-no-0', lineNo);
  await settle(page);
  await page.fill('#l-qty-0', '3');
  await page.locator('#l-qty-0').dispatchEvent('change');
  await settle(page);
  const price = await page.inputValue('#l-price-0');
  if (!price || Number(price.replace(/[\s ]/g, '')) <= 0) {
    await page.fill('#l-price-0', '125000');
    await page.locator('#l-price-0').dispatchEvent('change');
    await settle(page);
  }
  const amt = (await page.textContent('#l-amt-0') || '').trim();
  if (!amt) fail(cfg.name, where, 'line amount empty after qty/price');
  if (shot && shotNames.draft) await shot(shotNames.draft);
  // preview
  await page.locator('#act-preview').click();
  await settle(page, 200);
  const pv = await page.evaluate(() => {
    const ov = document.querySelector('.overlay');
    if (!ov) return { open: false, err: (document.getElementById('draft-errors') || {}).textContent || '' };
    const foot = ov.querySelector('#pv-body tfoot');
    return { open: true, balanced: !!foot && /✓/.test(foot.textContent), rows: ov.querySelectorAll('#pv-body tbody tr').length };
  });
  if (!pv.open) { fail(cfg.name, where, 'preview did not open: ' + pv.err); return null; }
  if (!pv.balanced) fail(cfg.name, where, 'preview G/L not balanced');
  if (!pv.rows) fail(cfg.name, where, 'preview G/L has no rows');
  await page.locator('#pv-tab-eb').click();
  await settle(page, 80);
  const ebJson = await page.evaluate(() => !!document.querySelector('.overlay #pv-body pre.json, .overlay #pv-body .muted'));
  if (!ebJson) fail(cfg.name, where, 'preview eBarimt tab empty');
  await closeOverlays(page);
  // post
  await page.locator('#act-post').click();
  await settle(page, 150);
  if (!(await page.locator('#confirm-ok').count())) {
    fail(cfg.name, where, 'post confirmation did not open: ' + ((await page.textContent('#draft-errors')) || '').slice(0, 300));
    return null;
  }
  await page.locator('#confirm-ok').click();
  await settle(page, 300);
  if ((await page.evaluate(() => location.hash)) !== '#posted-invoice') { fail(cfg.name, where, 'did not navigate to #posted-invoice after post'); return null; }
  const posted = await page.evaluate(() => window.ERP.app.ctx.postedNo);
  if (!/^SI-2026-\d{5}$/.test(posted || '')) fail(cfg.name, where, 'posted number not SI-2026-#####: ' + posted);
  // B2C opens the print preview automatically; B2B is dispatched after ~2.6 s.
  await page.waitForTimeout(2900);
  await closeOverlays(page);
  await go(page, 'posted-invoice');
  const pi = await page.evaluate((no) => {
    const inv = window.ERP.engine.sales.getPosted(no); const doc = inv && window.ERP.engine.state().ebarimtDocs.filter((d) => d.id === inv.ebarimtDocId)[0];
    return { text: document.getElementById('screen-body').textContent, printBtn: !!document.getElementById('pp-print'), copyBtn: !!document.getElementById('pp-copy'), ebStatus: doc ? doc.status : null };
  }, posted);
  if (pi.ebStatus !== 'SUCCESS') fail(cfg.name, where, 'eBarimt status after dispatch is ' + pi.ebStatus);
  if (pi.text.indexOf(posted) < 0) fail(cfg.name, where, 'posted invoice page does not show ' + posted);
  if (shot && shotNames.posted) await shot(shotNames.posted);
  // eBarimt preview (print window with QR, or copy without QR)
  const btn = pi.printBtn ? '#pp-print' : pi.copyBtn ? '#pp-copy' : null;
  let ebarimt = 'none';
  if (btn) {
    await page.locator(btn).click();
    await settle(page, 200);
    const pr = await page.evaluate(() => { const ov = document.querySelector('.overlay'); return ov ? { qr: !!ov.querySelector('#qr-canvas'), text: ov.textContent.slice(0, 200) } : null; });
    if (!pr) fail(cfg.name, where, 'eBarimt preview did not open');
    else ebarimt = pr.qr ? 'print preview with QR' : 'copy preview (no QR)';
    if (shot && pr && shotNames.ebarimt) await shot(shotNames.ebarimt);
    await closeOverlays(page);
  } else {
    fail(cfg.name, where, 'posted invoice has no eBarimt preview button (status: ' + (pi.text.match(/(SUCCESS|PENDING|ERROR|UNKNOWN|Бүртгэгдсэн|Хүлээгдэж буй|Алдаа)/) || ['?'])[0] + ')');
  }
  return { posted, customer: cust, item: lineNo, amount: amt, ebarimt, ebStatus: pi.ebStatus };
}

async function runConfig(browser, cfg) {
  const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, colorScheme: cfg.scheme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  const external = new Set();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
  page.on('dialog', async (d) => { errors.push('dialog(' + d.type() + '): ' + d.message()); await d.dismiss(); });
  // Fonts come from Google Fonts in production; offline here, answered with an empty stylesheet (fallback stacks apply).
  await page.route(/^https?:\/\//, (route) => {
    const u = route.request().url();
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    external.add(u);
    return route.abort();
  });
  // Screens: top of the page down to at most 2400 px (full page, capped). Open dialogs: the viewport.
  const shot = cfg.shots ? async (name) => {
    const h = await page.evaluate(() => {
      document.querySelectorAll('#toasts .toast').forEach((t) => t.remove());
      window.scrollTo(0, 0);
      return document.querySelector('.overlay') ? 0 : document.scrollingElement.scrollHeight;
    });
    const file = path.join(SHOT_DIR, name + '-' + cfg.name + '.png');
    if (h) await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: cfg.width, height: Math.min(h, 2400) } });
    else await page.screenshot({ path: file });
  } : null;

  await page.goto(PAGE_URL + '#home');
  await page.waitForFunction(() => window.ERP && window.ERP.app && window.ERP.app._booted, null, { timeout: 30000 });
  await settle(page, 300);

  // theme: system follows the emulated scheme; toggle cycles system -> light -> dark -> system
  const p0 = await probe(page);
  const L = lum(p0.bodyBg);
  if (cfg.scheme === 'dark' && !(L >= 0 && L < 0.35)) fail(cfg.name, 'theme', 'dark scheme but body background is ' + p0.bodyBg);
  if (cfg.scheme === 'light' && !(L > 0.65)) fail(cfg.name, 'theme', 'light scheme but body background is ' + p0.bodyBg);
  const themes = [];
  for (let i = 0; i < 3; i++) { await page.locator('#btn-theme').click(); themes.push(await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'system')); }
  if (themes.join(',') !== 'light,dark,system') fail(cfg.name, 'theme', 'toggle cycle was ' + themes.join(','));
  const darkBg = await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); const b = getComputedStyle(document.body).backgroundColor; document.documentElement.removeAttribute('data-theme'); return b; });
  if (!(lum(darkBg) < 0.35)) fail(cfg.name, 'theme', 'data-theme=dark background is ' + darkBg);
  const chip = await page.evaluate(() => { const c = document.querySelector('.sample-chip'); if (!c) return ''; const k = c.cloneNode(true); k.querySelectorAll('.hotspot').forEach((h) => h.remove()); return k.textContent.trim(); });
  if (chip !== 'Жишээ өгөгдөл — бодит компани биш') fail(cfg.name, 'shell', 'sample chip missing: ' + chip);

  // checks before any user action
  const c0 = await checksAllPass(page);
  if (!c0.total || c0.failed.length) fail(cfg.name, '#checks (initial)', c0.total + ' checks, failed: ' + c0.failed.join(' | '));

  // explanation mode toggle: off hides hotspots, on shows them
  await go(page, 'home');
  const notesOn0 = await page.evaluate(() => document.body.classList.contains('notes-on'));
  if (!notesOn0) await page.locator('#btn-notes').click();
  await page.locator('#btn-notes').click();
  const hiddenWhenOff = await page.evaluate(() => Array.from(document.querySelectorAll('.hotspot')).every((h) => getComputedStyle(h).display === 'none'));
  if (!hiddenWhenOff) fail(cfg.name, 'notes', 'hotspots still visible with explanation mode off');
  await page.locator('#btn-notes').click();
  const shownWhenOn = await page.evaluate(() => document.body.classList.contains('notes-on') && Array.from(document.querySelectorAll('#page .hotspot')).some((h) => getComputedStyle(h).display !== 'none'));
  if (!shownWhenOn) fail(cfg.name, 'notes', 'no hotspots visible with explanation mode on');

  // mobile: menu button opens the sidebar
  if (cfg.width < 700) {
    const menuVisible = await page.locator('#btn-menu').isVisible();
    if (!menuVisible) fail(cfg.name, 'shell', 'menu button not visible on narrow screen');
    else {
      await page.locator('#btn-menu').click();
      await settle(page, 150);
      const open = await page.evaluate(() => { const r = document.getElementById('sidebar').getBoundingClientRect(); return r.width > 0 && r.right > 40; });
      if (!open) fail(cfg.name, 'shell', 'sidebar did not open from the menu button');
      await page.locator('#sidebar a[data-route="trial-balance"]').click();
      await settle(page, 150);
      const closed = await page.evaluate(() => !document.getElementById('app').classList.contains('nav-open') && location.hash === '#trial-balance');
      if (!closed) fail(cfg.name, 'shell', 'nav link did not close sidebar / navigate');
    }
  }

  // sales invoice flow: B2B (bank, eBarimt queued then dispatched) and B2C (cash, print window with QR)
  const flow = [await salesFlow(page, cfg, shot, 'C00001', { draft: 'sales-invoice', posted: 'posted-invoice', ebarimt: 'ebarimt-copy' }),
    await salesFlow(page, cfg, shot, 'C00006', { ebarimt: 'ebarimt-print' })].filter(Boolean);

  // every route
  const routes = await page.evaluate(() => {
    const r = [];
    window.ERP.app.nav.forEach((g) => { if (g.single) r.push(g.route); else g.items.forEach((it) => r.push(it[1])); });
    Object.keys(window.ERP.app.screens).forEach((k) => { if (r.indexOf(k) < 0) r.push(k); });
    return r;
  });
  const notesOpened = {};
  for (const route of routes) {
    const before = errors.length;
    await go(page, route);
    const pr = await probe(page);
    if (pr.notFound) fail(cfg.name, '#' + route, 'screen not found');
    if (pr.renderFailed) fail(cfg.name, '#' + route, 'render failed: ' + pr.renderFailMsg);
    if (pr.scrollW > pr.innerW) fail(cfg.name, '#' + route, 'horizontal page scroll ' + pr.scrollW + ' > ' + pr.innerW + ' (' + pr.wide.join('; ') + ')');
    if (pr.badHashes.length) fail(cfg.name, '#' + route, 'hash links with parameters: ' + pr.badHashes.slice(0, 5).join(', '));
    if (pr.noId.length) fail(cfg.name, '#' + route, pr.noId.length + ' form controls without id: ' + pr.noId.slice(0, 3).join(' | '));
    if (pr.dupIds.length) fail(cfg.name, '#' + route, 'duplicate ids: ' + pr.dupIds.slice(0, 8).join(', '));
    if (pr.downloads) fail(cfg.name, '#' + route, 'a[download] present');
    const nid = await openOneNote(page);
    notesOpened[route] = nid;
    if (!nid) fail(cfg.name, '#' + route, 'no visible explanation hotspot on the screen');
    else if (/^FAILED:/.test(nid)) fail(cfg.name, '#' + route, 'note did not open: ' + nid);
    const pr2 = await probe(page);
    if (pr2.scrollW > pr2.innerW && !(pr.scrollW > pr.innerW)) fail(cfg.name, '#' + route, 'horizontal scroll after opening a note ' + pr2.scrollW + ' (' + pr2.wide.join('; ') + ')');
    if (shot && SHOT_ROUTES.indexOf(route) >= 0 && route !== 'sales-invoice' && route !== 'posted-invoice') await shot(route);
    if (errors.length > before) fail(cfg.name, '#' + route, errors.slice(before).join(' | '));
    await closeOverlays(page);
  }

  // checks after posting
  const c1 = await checksAllPass(page);
  if (!c1.total || c1.failed.length) fail(cfg.name, '#checks (after posting)', c1.total + ' checks, failed: ' + c1.failed.join(' | '));
  const unexpected = Array.from(external);
  if (unexpected.length) fail(cfg.name, 'network', 'external requests: ' + unexpected.slice(0, 5).join(', '));
  if (errors.length) fail(cfg.name, 'console', errors.length + ' error(s); first: ' + errors[0]);

  summary.push({ config: cfg.name, routes: routes.length, notesOpened: Object.values(notesOpened).filter((v) => v && !/^FAILED/.test(v)).length,
    checksBefore: c0.head.trim(), checksAfter: c1.head.trim(), flow, consoleErrors: errors.length, externalRequests: unexpected.length });
  await ctx.close();
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  if (!fs.existsSync(path.join(ROOT, 'standalone.html'))) { console.error('standalone.html missing — run build_standalone.py'); process.exit(2); }
  const browser = await chromium.launch({ headless: true });
  try {
    for (const cfg of CONFIGS) {
      try { await runConfig(browser, cfg); }
      catch (e) { fail(cfg.name, 'run', 'exception: ' + (e && e.stack || e)); }
    }
  } finally { await browser.close(); }
  for (const s of summary) {
    console.log('== ' + s.config + ': ' + s.routes + ' routes, notes opened on ' + s.notesOpened + ', checks ' + s.checksBefore + ' -> ' + s.checksAfter +
      ', console errors ' + s.consoleErrors + ', external requests ' + s.externalRequests);
    s.flow.forEach((f) => console.log('   sales flow: ' + f.posted + ' (customer ' + f.customer + ', item ' + f.item + ', line ' + f.amount + ') · eBarimt ' + f.ebStatus + ' · ' + f.ebarimt));
  }
  const shots = fs.readdirSync(SHOT_DIR).filter((f) => f.endsWith('.png'));
  console.log('screenshots: ' + shots.length + ' in ' + path.relative(process.cwd(), SHOT_DIR));
  if (failures.length) {
    console.log('\nFAILURES (' + failures.length + '):');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('\nALL BROWSER CHECKS PASSED');
})();
