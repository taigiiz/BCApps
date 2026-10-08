/* =============================================================================
   js/app.js — window.ERP.app (shell, router, explanation mode) and window.ERP.ui (shared UI helpers).

   Screens register themselves from js/screens/*.js (loaded after this file):
     ERP.app.registerScreen({
       route: 'sales-invoice',            // bare #token, never #a=b
       title: 'Борлуулалтын нэхэмжлэх',
       crumbs: [['Борлуулалт'], ['Нэхэмжлэх', 'sales-invoices']],
       intro: ['2–4 sentences: purpose, who uses it, what happens on post'],
       owner: 'js/screens/sales.js',
       render: function (el, ctx) { ... },  // el = empty container; ctx = ERP.app.ctx (shared navigation context)
       crumbRecord: function (ctx) { ... }, // optional: record label for the last breadcrumb (UX-NAV-07), e.g. 'SI-2026-00001'
       onLeave: function () { ... }         // optional
     });
   Placeholders for later builders: ERP.app.stub({ route, title, crumbs, intro, owner, plan: [...] }).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = (window.ERP = window.ERP || {});
  var E = null;
  var LS = {
    get: function (k, d) { try { var v = window.localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: keep defaults */ } }
  };

  // ===========================================================================
  // ERP.ui — helpers shared by every screen
  // ===========================================================================
  var ui = (ERP.ui = {});
  ui.esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  ui.money = function (c, opts) { return E.money.fmt(c, opts); };                    // "1 234 567.00" (+ " ₮" with {sym:true})
  ui.moneyCell = function (c, opts) { return '<td class="num' + (c < 0 && opts && opts.negRed ? ' neg' : '') + '">' + ui.esc(E.money.fmt(c, opts)) + '</td>'; };
  ui.date = function (d) { return E.dates.fmt(d); };
  // date input in YYYY.MM.DD (15 §7.4 subset): '2026.10.05', '2026-10-05', '20261005', 'т' / 'ө' = today
  ui.parseDate = function (raw) {
    var t = String(raw || '').trim().toLowerCase();
    if (t === 'т' || t === 'ө' || t === 't') return ERP.data.meta.today;
    var m = /^(\d{4})[.\-\/ ]?(\d{1,2})[.\-\/ ]?(\d{1,2})$/.exec(t);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2200) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  };
  ui.dateInput = function (id, iso, extra) {
    return '<input class="input mono" type="text" inputmode="numeric" id="' + id + '" value="' + ui.esc(ui.date(iso || '')) + '" placeholder="ЖЖЖЖ.СС.ӨӨ" maxlength="10" autocomplete="off"' + (extra || '') + '>';
  };
  ui.$ = function (sel, root) { return (root || document).querySelector(sel); };
  ui.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  ui.html = function (el, s) { el.innerHTML = s; return el; };
  ui.frag = function (s) { var t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };

  var PILLS = {
    DRAFT: ['draft', '✎', 'Ноорог'], RELEASED: ['info', '☐', 'Бэлэн'], POSTED: ['ok', '●', 'Бичигдсэн'],
    UNPAID: ['info', '○', 'Төлөгдөөгүй'], OVERDUE: ['danger', '⚠', 'Хугацаа хэтэрсэн'], PARTIALLY_PAID: ['warn', '◐', 'Хэсэгчлэн төлөгдсөн'],
    PAID: ['ok', '●', 'Төлөгдсөн'], CANCELLED: ['cancelled', '⊘', 'Цуцлагдсан'], CORRECTIVE: ['neutral', '↺', 'Залруулгын кредит нот'],
    PENDING: ['info', '⏳', 'Хүлээгдэж буй'], SENT: ['info', '⟳', 'Илгээсэн'], SUCCESS: ['ok', '✓', 'Бүртгэгдсэн'],
    ERROR: ['danger', '✕', 'Алдаа'], UNKNOWN: ['danger', '?', 'UNKNOWN · тодорхойгүй'], CORRECTED: ['neutral', '↺', 'Засварлагдсан'],
    VOIDED: ['neutral', '⊘', 'Цуцлагдсан'], NOT_REQUIRED: ['neutral', '—', 'Шаардлагагүй'], NOT_CONFIGURED: ['warn', '⚠', 'Тохируулаагүй'],
    OPEN: ['info', '○', 'Нээлттэй'], CLOSED: ['neutral', '■', 'Хаалттай'], LOCKED: ['neutral', '🔒', 'Түгжсэн'], SUBMITTED: ['ok', '✓', 'Илгээсэн'],
    PASS: ['ok', '✓', 'PASS'], FAIL: ['danger', '✕', 'FAIL'], OK: ['ok', '✓', 'Хэвийн'], WARNING: ['warn', '◐', 'Анхаарах'], BLOCKING: ['danger', '⚠', 'Хаалт зогсооно']
  };
  ui.pill = function (status, text) {
    var p = PILLS[status] || ['neutral', '', status];
    return '<span class="pill ' + p[0] + '" title="' + ui.esc(text || p[2]) + '"><span class="ic" aria-hidden="true">' + p[1] + '</span>' + ui.esc(text || p[2]) + '</span>';
  };
  ui.pillLabel = function (status) { return (PILLS[status] || [0, 0, status])[2]; };

  ui.calc = function (summary, bodyHtml, id) {          // "Тооцоог харах" expander
    return '<details class="calc"' + (id ? ' id="' + id + '"' : '') + '><summary>' + ui.esc(summary || 'Тооцоог харах') + '</summary><div class="calc-body">' + bodyHtml + '</div></details>';
  };
  ui.errList = function (errors, title) {
    if (!errors || !errors.length) return '';
    return '<div class="errlist" role="alert"><h3>' + ui.esc(title || 'Батлах боломжгүй — дараах алдааг засна уу') + '</h3><ul>' +
      errors.map(function (e) { return '<li><code>' + ui.esc(e.code) + '</code> — ' + ui.esc(e.message) + '</li>'; }).join('') + '</ul></div>';
  };
  ui.warnList = function (warnings) {
    if (!warnings || !warnings.length) return '';
    return '<div class="banner warn"><strong>Анхааруулга:</strong> ' + warnings.map(function (w) { return ui.esc(w.message) + ' <code>' + ui.esc(w.code) + '</code>'; }).join('<br>') + '</div>';
  };
  ui.json = function (obj) {                            // syntax-highlighted JSON (keys keep their order)
    var ind = function (n) { return '  '.repeat(n); };
    var f = function (v, n, key) {                      // amounts as numbers with exactly 2 decimals (12 AMT-21); qty / ids as is
      if (v === null) return '<span class="z">null</span>';
      if (typeof v === 'number') return '<span class="n">' + (key === 'qty' || key === 'posId' ? String(v) : v.toFixed(2)) + '</span>';
      if (typeof v === 'string') return '<span class="s">"' + ui.esc(v) + '"</span>';
      if (typeof v === 'boolean') return '<span class="n">' + v + '</span>';
      if (Array.isArray(v)) return v.length ? '[\n' + v.map(function (x) { return ind(n + 1) + f(x, n + 1); }).join(',\n') + '\n' + ind(n) + ']' : '[]';
      var ks = Object.keys(v);
      return '{\n' + ks.map(function (k) { return ind(n + 1) + '<span class="k">"' + ui.esc(k) + '"</span>: ' + f(v[k], n + 1, k); }).join(',\n') + '\n' + ind(n) + '}';
    };
    return '<pre class="json">' + f(obj, 0) + '</pre>';
  };
  ui.copy = function (text, btn) {
    var done = function () { if (btn) { var t = btn.textContent; btn.textContent = 'Хуулагдлаа'; setTimeout(function () { btn.textContent = t; }, 1400); } };
    try {
      navigator.clipboard.writeText(text).then(done, function () { ui.toast('Хуулах боломжгүй байна. Текстийг сонгоод Ctrl+C дарна уу.'); });
    } catch (e) { ui.toast('Хуулах боломжгүй байна. Текстийг сонгоод Ctrl+C дарна уу.'); }
  };

  ui.toast = function (msg, kind) {
    var host = document.getElementById('toasts');
    var t = document.createElement('div');
    t.className = 'toast' + (kind === 'error' ? ' error' : '');
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.innerHTML = msg;
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 5200);
  };

  // modal: { title, body (html string or Node), wide, footer: [{ label, kind:'primary'|'danger'|'', id, onClick(close) }], onRequestClose: () => Promise<bool> }
  ui.modal = function (o) {
    var prevFocus = document.activeElement;
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="m-title-' + (ui._mid = (ui._mid || 0) + 1) + '">' +
      '<div class="m-head"><h2 id="m-title-' + ui._mid + '">' + ui.esc(o.title) + '</h2><button class="btn ghost sm" data-close aria-label="Хаах">✕</button></div>' +
      '<div class="m-body"></div><div class="m-foot"></div></div>';
    var body = ov.querySelector('.m-body'), foot = ov.querySelector('.m-foot');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    var closed = false;
    var close = function (force) {
      if (closed) return Promise.resolve(true);
      var go = function () { closed = true; ov.remove(); document.removeEventListener('keydown', onKey, true); if (o.onClose) o.onClose(); if (prevFocus && prevFocus.focus) prevFocus.focus(); return true; };
      if (!force && o.onRequestClose) return o.onRequestClose().then(function (ok) { return ok ? go() : false; });
      return Promise.resolve(go());
    };
    (o.footer || [{ label: 'Хаах' }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn' + (b.kind ? ' ' + b.kind : '');
      btn.type = 'button';
      if (b.id) btn.id = b.id;
      btn.textContent = b.label;
      btn.addEventListener('click', function () { if (b.onClick) b.onClick(close); else close(); });
      foot.appendChild(btn);
    });
    ov.querySelector('[data-close]').addEventListener('click', function () { close(); });
    var onKey = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    var first = foot.querySelector('.btn.primary') || foot.querySelector('.btn');
    if (first) first.focus();
    return { el: ov, body: body, close: close };
  };
  ui.confirm = function (o) {                           // in-page confirm (window.confirm is unavailable)
    return new Promise(function (resolve) {
      var answered = false;
      ui.modal({ title: o.title || 'Баталгаажуулах', body: '<div class="stack">' + (o.body || '') + '</div>',
        footer: [{ label: o.cancel || 'Болих', onClick: function (close) { answered = true; close(true); resolve(false); } },
          { label: o.ok || 'Тийм', kind: o.danger ? 'danger' : 'primary', id: 'confirm-ok', onClick: function (close) { answered = true; close(true); resolve(true); } }],
        onClose: function () { if (!answered) resolve(false); } });
    });
  };

  // ===========================================================================
  // ERP.app — shell, router, explanation mode
  // ===========================================================================
  var app = (ERP.app = { screens: {}, ctx: {}, state: { role: 'OWNER', notesOn: true, theme: 'system' }, current: null });

  // Information architecture (15 §2.3), reduced to the prototype's routes
  var NAV = [
    { label: 'Нүүр', route: 'home', single: true },
    { label: 'Борлуулалт', items: [['Нэхэмжлэх', 'sales-invoices'], ['Кредит нот', 'credit-memo'], ['Харилцагч', 'customers']] },
    { label: 'Худалдан авалт', items: [['Нэхэмжлэх', 'purchase-invoices']] },
    { label: 'Мөнгө', items: [['Кассын баримт (МХ-1/МХ-2)', 'cash'], ['Хуулга ба тулгалт', 'bank-rec']] },
    { label: 'eBarimt', items: [['Хяналт', 'ebarimt']] },
    { label: 'Санхүү', items: [['Ерөнхий журнал', 'journal'], ['Дансны төлөвлөгөө', 'coa'], ['Авлагын тулгалт', 'cust-apply']] },
    { label: 'Татвар', items: [['НӨАТ-ын тайлан (ТТ-03а)', 'vat-return']] },
    { label: 'Хаалт', items: [['Санхүүгийн жил ба үе', 'periods']] },
    { label: 'Тайлан', items: [['Гүйлгээ баланс', 'trial-balance'], ['Санхүүгийн тайлан (Маягт А)', 'financial-statements']] },
    { label: 'Тохиргоо', items: [['Компани тохируулах', 'setup']] },
    { label: 'Прототип', items: [['Тайлбарын жагсаалт', 'notes'], ['Шалгалт (инвариант)', 'checks']] }
  ];
  app.nav = NAV;

  app.registerScreen = function (def) { app.screens[def.route] = def; if (app._booted && app.current === def.route) render(); };
  app.stub = function (o) {
    app.registerScreen({ route: o.route, title: o.title, crumbs: o.crumbs, intro: o.intro, owner: o.owner, soon: true,
      render: function (el) {
        el.innerHTML = '<div class="card"><div class="soon-card"><div class="big">Удахгүй</div><p>Энэ дэлгэцийг прототипийн дараагийн шатанд бүтээнэ.</p>' +
          (o.plan ? '<ul style="text-align:left;max-width:60ch">' + o.plan.map(function (p) { return '<li>' + ui.esc(p) + '</li>'; }).join('') + '</ul>' : '') +
          '<p class="small muted">Файл: <code>' + ui.esc(o.owner) + '</code></p></div></div>';
      } });
  };
  app.navigate = function (route, ctx) {
    if (ctx) Object.keys(ctx).forEach(function (k) { app.ctx[k] = ctx[k]; });
    if (location.hash === '#' + route) render(); else location.hash = '#' + route;
  };
  app.refresh = function () { render(); };

  function currentRoute() {
    var h = (location.hash || '').replace(/^#/, '');
    return /^[A-Za-z0-9._~-]+$/.test(h) ? h : 'home';
  }

  function buildNav() {
    var nav = document.getElementById('sidebar');
    var html = '<div class="has-note" data-note="shell.nav" style="display:block">';
    NAV.forEach(function (g, gi) {
      if (g.single) {
        html += '<ul class="nav-items nav-single" style="padding:0"><li><a href="#' + g.route + '" data-route="' + g.route + '">' + ui.esc(g.label) + '</a></li></ul>';
        return;
      }
      var collapsed = LS.get('ui:nav:' + gi, '0') === '1';
      html += '<div class="nav-group' + (collapsed ? ' collapsed' : '') + '" data-gi="' + gi + '"><button class="nav-head" type="button" aria-expanded="' + (!collapsed) + '" id="nav-head-' + gi + '"><span>' + ui.esc(g.label) + '</span><span class="chev" aria-hidden="true">▾</span></button><ul class="nav-items">';
      g.items.forEach(function (it) {
        var s = app.screens[it[1]];
        html += '<li><a href="#' + it[1] + '" data-route="' + it[1] + '"><span>' + ui.esc(it[0]) + '</span>' + (s && s.soon ? '<span class="soon">Удахгүй</span>' : '') + '</a></li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';
    nav.innerHTML = html;
    ui.$$('.nav-head', nav).forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.parentElement; g.classList.toggle('collapsed');
        var c = g.classList.contains('collapsed'); b.setAttribute('aria-expanded', String(!c)); LS.set('ui:nav:' + g.getAttribute('data-gi'), c ? '1' : '0');
      });
    });
    nav.addEventListener('click', function (ev) { if (ev.target.closest('a')) document.getElementById('app').classList.remove('nav-open'); });
  }
  function markNav(route) {
    var alias = { 'sales-invoice': 'sales-invoices', 'posted-invoice': 'sales-invoices', customer: 'customers', 'purchase-invoice': 'purchase-invoices' }[route] || route;
    ui.$$('#sidebar a[data-route]').forEach(function (a) { if (a.getAttribute('data-route') === alias) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }

  function render() {
    var route = currentRoute();
    var prev = app.screens[app.current];
    if (prev && prev.onLeave && app.current !== route) { try { prev.onLeave(); } catch (e) { /* ignore */ } }
    app.current = route;
    var s = app.screens[route];
    var page = document.getElementById('page');
    if (!s) {
      page.innerHTML = '<div class="card"><div class="soon-card"><div class="big">Олдсонгүй</div><p>#' + ui.esc(route) + ' гэсэн дэлгэц алга.</p><a class="btn" href="#home">Нүүр рүү</a></div></div>';
      return;
    }
    var crumbs = [['Нүүр', 'home']].concat(s.crumbs || []);
    if (route === 'home') crumbs = [['Нүүр']];
    var introOpen = LS.get('ui:intro:' + route, '1') === '1';
    page.innerHTML =
      '<nav class="breadcrumb" aria-label="Замын мөр">' + crumbs.map(function (c, i) {
        var last = i === crumbs.length - 1;
        return (c[1] && !last ? '<a href="#' + c[1] + '">' + ui.esc(c[0]) + '</a>' : '<span' + (last ? ' id="crumb-last" aria-current="page"' : '') + '>' + ui.esc(c[0]) + '</span>') + (last ? '' : '<span aria-hidden="true">›</span>');
      }).join('') + '</nav>' +
      (s.intro ? '<details class="intro" id="intro-' + route + '"' + (introOpen ? ' open' : '') + '><summary><span class="chev" aria-hidden="true">▸</span>Энэ дэлгэц<span class="muted" style="font-weight:400">— ' + ui.esc(s.title) + '</span></summary><div class="intro-body">' +
        (Array.isArray(s.intro) ? s.intro : [s.intro]).map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div></details>' : '') +
      '<div id="screen-body" class="stack"></div>';
    var intro = document.getElementById('intro-' + route);
    if (intro) intro.addEventListener('toggle', function () { LS.set('ui:intro:' + route, intro.open ? '1' : '0'); });
    try { s.render(document.getElementById('screen-body'), app.ctx); }
    catch (e) { document.getElementById('screen-body').innerHTML = ui.errList([{ code: 'ui.render_failed', message: String(e && e.message || e) }], 'Дэлгэц зурахад алдаа гарлаа'); if (window.console) console.error(e); }
    // UX-NAV-07: the last breadcrumb segment is the record (document number or name) when the screen shows one
    var rec = null;
    if (s.crumbRecord) { try { rec = s.crumbRecord(app.ctx); } catch (e) { rec = null; } }
    if (rec) { var cl = document.getElementById('crumb-last'); if (cl) cl.textContent = rec; }
    document.title = (rec ? rec + ' · ' : '') + s.title + ' — ' + ERP.data.company.nameShort + ' — Бичил ERP прототип';
    markNav(route);
    app.decorateNotes();
    closePanelIfForeign();
  }

  // ---------------------------------------------------------------------------
  // Explanation mode: hotspots + panel
  // ---------------------------------------------------------------------------
  var VOID = { INPUT: 1, SELECT: 1, TEXTAREA: 1, IMG: 1, TR: 1, TABLE: 1, TBODY: 1, THEAD: 1, TFOOT: 1, BR: 1, HR: 1 };
  app.decorateNotes = function (root) {
    root = root || document.getElementById('app');
    ui.$$('.hotspot', root).forEach(function (b) { b.remove(); });
    var els = ui.$$('[data-note]', root).filter(function (el) { return !el.closest('[hidden]'); });
    var n = 0;
    app._noteOrder = [];
    els.forEach(function (el) {
      var id = el.getAttribute('data-note');
      var note = ERP.notes.get(id);
      if (!note) return;
      var host = VOID[el.tagName] ? el.parentElement : el;
      n += 1;
      host.classList.add('has-note');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'hotspot'; b.textContent = String(n);
      b.setAttribute('data-note-ref', id);
      b.setAttribute('aria-label', 'Тайлбар ' + n + ': ' + note.title);
      b.title = note.title;
      host.appendChild(b);
      app._noteOrder.push({ id: id, n: n, el: el });
    });
  };
  function panel() { return document.getElementById('note-panel'); }
  app.openNote = function (id) {
    var note = ERP.notes.get(id);
    if (!note) return;
    var order = app._noteOrder || [];
    var idx = -1;
    order.forEach(function (o, i) { if (o.id === id && idx < 0) idx = i; });
    var num = idx >= 0 ? order[idx].n : '•';
    ui.$$('.note-focus').forEach(function (x) { x.classList.remove('note-focus'); });
    ui.$$('.hotspot.active').forEach(function (x) { x.classList.remove('active'); });
    if (idx >= 0) {
      order[idx].el.classList.add('note-focus');
      var hb = ui.$('.hotspot[data-note-ref="' + id + '"]'); if (hb) hb.classList.add('active');
    }
    var sec = function (t, body) { return body ? '<section class="np-sec"><h3>' + t + '</h3>' + body + '</section>' : ''; };
    var p = panel();
    p.innerHTML =
      '<div class="np-head"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="np-num">' + num + '</span><h2 id="np-title">' + ui.esc(note.title) + '</h2></div>' +
      '<button class="btn ghost sm" id="np-close" aria-label="Тайлбарыг хаах">✕</button></div>' +
      '<div class="np-body">' +
      sec('Юу хийдэг вэ', '<p>' + note.what + '</p>') +
      sec('Яагаад', '<p>' + note.why + '</p>') +
      sec('BC-д', '<p>' + ui.esc(note.bc) + '</p>') +
      sec('Дүрэм', note.rules.length ? '<div class="chips">' + note.rules.map(function (r) { return '<span class="chip rule">' + ui.esc(r) + '</span>'; }).join('') + '</div>' : '') +
      sec('Өгөгдөл', note.data.length ? '<div class="chips">' + note.data.map(function (r) { return '<span class="chip">' + ui.esc(r) + '</span>'; }).join('') + '</div>' : '') +
      sec('Баримт', note.doc.length ? '<ul>' + note.doc.map(function (d) { return '<li><a href="' + ui.esc(ERP.notes.link(d)) + '" target="_blank" rel="noopener">' + ui.esc(d.file) + (d.section ? ' § ' + ui.esc(d.section.replace(/`/g, '')) : '') + '</a></li>'; }).join('') + '</ul>' : '') +
      '</div>' +
      '<div class="np-nav"><button class="btn sm" id="np-prev"' + (idx <= 0 ? ' disabled' : '') + '>‹ Өмнөх</button><span class="small muted">' + (idx >= 0 ? (idx + 1) + ' / ' + order.length : 'жагсаалтаас') + '</span><button class="btn sm" id="np-next"' + (idx < 0 || idx >= order.length - 1 ? ' disabled' : '') + '>Дараах ›</button></div>';
    p.hidden = false;
    p.setAttribute('data-note-id', id);
    p.setAttribute('data-route', app.current);
    p.scrollTop = 0;
    ui.$('#np-close').addEventListener('click', app.closeNote);
    ui.$('#np-prev').addEventListener('click', function () { if (idx > 0) app.openNote(order[idx - 1].id); });
    ui.$('#np-next').addEventListener('click', function () { if (idx >= 0 && idx < order.length - 1) app.openNote(order[idx + 1].id); });
    ui.$('#np-close').focus();
  };
  app.closeNote = function () {
    panel().hidden = true;
    ui.$$('.note-focus').forEach(function (x) { x.classList.remove('note-focus'); });
    ui.$$('.hotspot.active').forEach(function (x) { x.classList.remove('active'); });
  };
  function closePanelIfForeign() { var p = panel(); if (!p.hidden && p.getAttribute('data-route') !== app.current) app.closeNote(); }
  function setNotes(on) {
    app.state.notesOn = on;
    document.body.classList.toggle('notes-on', on);
    var b = document.getElementById('btn-notes');
    b.setAttribute('aria-pressed', String(on));
    LS.set('ui:notes', on ? '1' : '0');
    if (!on) app.closeNote();
  }

  // ---------------------------------------------------------------------------
  // Theme (light / dark / system)
  // ---------------------------------------------------------------------------
  var THEMES = ['system', 'light', 'dark'];
  var THEME_LABEL = { system: 'Систем', light: 'Цайвар', dark: 'Бараан' };
  function applyTheme(t) {
    app.state.theme = t;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    var b = document.getElementById('btn-theme');
    if (b) { b.querySelector('.tb-label').textContent = 'Өнгө: ' + THEME_LABEL[t]; b.setAttribute('aria-label', 'Өнгөний горим: ' + THEME_LABEL[t] + ' (дарж солих)'); }
    LS.set('ui:theme', t);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    E = ERP.engine;
    try { E.boot(); }
    catch (e) {
      document.getElementById('page').innerHTML = ui.errList([{ code: 'engine.boot_failed', message: String(e.message || e) }], 'Хөдөлгүүр эхлэхэд алдаа гарлаа');
      throw e;
    }
    var co = ERP.data.company;
    ui.$('#co-name').textContent = co.name;
    ui.$('#co-tin').textContent = 'ТТД ' + co.tin;
    ui.$('#workdate').textContent = 'Ажлын огноо ' + E.dates.fmt(ERP.data.meta.workDate);
    applyTheme(THEMES.indexOf(LS.get('ui:theme', 'system')) >= 0 ? LS.get('ui:theme', 'system') : 'system');
    ui.$('#btn-theme').addEventListener('click', function () { applyTheme(THEMES[(THEMES.indexOf(app.state.theme) + 1) % 3]); });
    setNotes(LS.get('ui:notes', '1') === '1');
    ui.$('#btn-notes').addEventListener('click', function () { setNotes(!app.state.notesOn); });
    var role = LS.get('ui:role', 'OWNER');
    app.state.role = role === 'ACCOUNTANT' ? 'ACCOUNTANT' : 'OWNER';
    var rs = ui.$('#role-select');
    rs.value = app.state.role;
    rs.addEventListener('change', function () { app.state.role = rs.value; LS.set('ui:role', rs.value); if (app.current === 'home') render(); });
    ui.$('#btn-menu').addEventListener('click', function () {
      var a = document.getElementById('app'); a.classList.toggle('nav-open');
      ui.$('#btn-menu').setAttribute('aria-expanded', String(a.classList.contains('nav-open')));
    });
    // notes: hotspot click, or click on an annotated element (not on its controls) in explanation mode
    document.getElementById('app').addEventListener('click', function (ev) {
      var hs = ev.target.closest('.hotspot');
      if (hs) { ev.preventDefault(); ev.stopPropagation(); app.openNote(hs.getAttribute('data-note-ref')); return; }
      if (!app.state.notesOn) return;
      if (ev.target.closest('button, a, input, select, textarea, summary, label, .note-panel')) return;
      var el = ev.target.closest('[data-note]');
      if (el) app.openNote(el.getAttribute('data-note'));
    }, true);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !panel().hidden && !document.querySelector('.overlay')) app.closeNote(); });
    buildNav();
    window.addEventListener('hashchange', render);
    app._booted = true;
    render();
  }
  app.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
