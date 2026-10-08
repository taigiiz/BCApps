/* =============================================================================
   js/screens/system.js — prototype pages: #notes (all explanations by screen) and #checks (live invariants).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;

  // note group (ERP.notes.register screen key) → route of the screen that shows it; a key that is itself a route maps to itself
  var SCREEN_ROUTE = { shell: 'home', gl: 'coa', 'sales-ar': 'customers', 'cash-bank': 'cash', 'reports-tax': 'financial-statements' };
  function routeOf(key) { return SCREEN_ROUTE[key] || (app.screens[key] ? key : null); }

  var notesFilter = '';
  function noteText(n) { return [n.id, n.title, n.what, n.why, n.bc, n.rules.join(' '), n.data.join(' '), n.doc.map(function (d) { return d.file + ' ' + (d.section || ''); }).join(' ')].join(' ').toLowerCase(); }
  function renderNotes(el) {
    var all = ERP.notes.byScreen().filter(function (g) { return g.notes.length; });
    var total = all.reduce(function (s, g) { return s + g.notes.length; }, 0);
    var q = notesFilter.trim().toLowerCase();
    var groups = all.map(function (g) { return { screen: g.screen, title: g.title, notes: q ? g.notes.filter(function (n) { return noteText(n).indexOf(q) >= 0; }) : g.notes }; }).filter(function (g) { return g.notes.length; });
    var shown = groups.reduce(function (s, g) { return s + g.notes.length; }, 0);
    var html = '<div class="page-head"><div class="title-wrap"><h1>Тайлбарын жагсаалт</h1></div><span class="small muted" data-note="notes.list">' + total + ' тайлбар · ' + all.length + ' бүлэг</span></div>';
    html += '<form class="row" id="notes-form" role="search"><label for="notes-filter" class="small">Шүүх</label><input class="input" type="search" id="notes-filter" placeholder="Дүрэм (BR-SAL-22), хүснэгт (gl.gl_entry), BC объект, үг…" value="' + ui.esc(notesFilter) + '" style="width:min(100%,420px)">' +
      (q ? '<span class="small muted">' + shown + ' / ' + total + ' тайлбар</span>' : '') + '</form>';
    html += '<nav class="chips" aria-label="Бүлгүүд">' + groups.map(function (g) { return '<a class="chip" href="#notes" data-jump="ng-' + ui.esc(g.screen) + '">' + ui.esc(g.title.split(' (')[0].split(' — ')[0]) + ' · ' + g.notes.length + '</a>'; }).join('') + '</nav>';
    if (!groups.length) html += '<div class="card"><div class="card-body"><p class="empty">"' + ui.esc(notesFilter) + '"-д тохирох тайлбар алга. Дүрмийн ID-г бүтнээр нь (жишээ нь D-E3) эсвэл хүснэгтийн нэрийг оруулна уу.</p></div></div>';
    groups.forEach(function (g) {
      var route = routeOf(g.screen);
      html += '<section class="card" id="ng-' + ui.esc(g.screen) + '"><div class="card-head"><h2>' + ui.esc(g.title) + '</h2>' + (route && app.screens[route] ? '<a class="small" href="#' + route + '">Дэлгэц нээх ›</a>' : '') + '</div><div class="card-body flush"><div class="table-wrap"><table class="grid-table notes-table"><thead><tr><th>Тайлбар</th><th>Юу хийдэг вэ</th><th>Дүрэм</th><th>Баримт</th></tr></thead><tbody>' +
        g.notes.map(function (n) {
          return '<tr><td><button class="btn ghost sm" type="button" data-open-note="' + n.id + '" id="nl-' + n.id.replace(/[^\w-]/g, '_') + '">' + ui.esc(n.title) + '</button><div class="xs muted code">' + n.id + '</div></td>' +
            '<td class="small" style="max-width:52ch">' + n.what + '<div class="xs muted" style="margin-top:4px">BC: ' + ui.esc(n.bc) + '</div></td>' +
            '<td><div class="chips">' + n.rules.map(function (r) { return '<span class="chip rule">' + ui.esc(r) + '</span>'; }).join('') + '</div></td>' +
            '<td class="small">' + n.doc.map(function (d) { return '<a href="' + ui.esc(ERP.notes.link(d)) + '" target="_blank" rel="noopener">' + ui.esc(d.file) + (d.section ? ' §' + ui.esc(d.section.split(' ')[0].replace(/\.$/, '')) : '') + '</a>'; }).join('<br>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div></section>';
    });
    el.innerHTML = html;
    ui.$$('[data-open-note]', el).forEach(function (b) { b.addEventListener('click', function () { app.openNote(b.getAttribute('data-open-note')); }); });
    var f = ui.$('#notes-filter');
    ui.$('#notes-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    f.addEventListener('input', function () { notesFilter = f.value; var pos = f.selectionStart; renderNotes(el); app.decorateNotes(); var n = ui.$('#notes-filter'); n.focus(); n.setSelectionRange(pos, pos); });
    ui.$$('[data-jump]', el).forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); var t = document.getElementById(a.getAttribute('data-jump')); if (t) { t.scrollIntoView({ block: 'start' }); var h = t.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } } }); });
  }

  function renderChecks(el) {
    var E = ERP.engine;
    var t0 = Date.now();
    var checks = E.invariants();
    var ms = Date.now() - t0;
    var pass = checks.filter(function (c) { return c.pass; }).length;
    var S = E.state();
    var html = '<div class="page-head"><div class="title-wrap"><h1>Шалгалт</h1>' + ui.pill(pass === checks.length ? 'PASS' : 'FAIL', pass + ' / ' + checks.length + ' PASS') + '</div>' +
      '<button class="btn" id="chk-rerun" type="button">Дахин ажиллуулах</button></div>';
    html += '<p class="small muted">Ledger: ' + S.glEntries.length + ' G/L бичилт, ' + S.transactions.length + ' гүйлгээ, ' + S.vatEntries.length + ' VAT entry, ' + S.cle.length + ' авлагын, ' + S.vle.length + ' өглөгийн, ' + S.ble.length + ' банкны бичилт, ' + S.ebarimtDocs.length + ' eBarimt баримт · ' + ms + ' мс.</p>';
    html += '<div class="card" data-note="checks.list"><div class="card-body flush">' + checks.map(function (c) {
      return '<div class="check-row"><span class="check-mark ' + (c.pass ? 'pass' : 'fail') + '" aria-hidden="true">' + (c.pass ? '✓' : '✕') + '</span><div><strong>' + ui.esc(c.name) + '</strong><div class="small muted">' + ui.esc(c.detail) + '</div><div class="chips" style="margin-top:4px"><span class="chip">' + ui.esc(c.id) + '</span><span class="chip rule">' + ui.esc(c.rule) + '</span></div></div>' + ui.pill(c.pass ? 'PASS' : 'FAIL') + '</div>';
    }).join('') + '</div></div>';
    var tb = E.reports.trialBalance({});
    html += ui.calc('Тооцоог харах: гүйлгээ балансын нийлбэр', '<div class="formula">Эхний үлдэгдэл  Дт ' + E.money.fmt(tb.totals.openingDebit) + '   Кт ' + E.money.fmt(tb.totals.openingCredit) +
      '\nГүйлгээ         Дт ' + E.money.fmt(tb.totals.debit) + '   Кт ' + E.money.fmt(tb.totals.credit) + '\nЭцсийн үлдэгдэл Дт ' + E.money.fmt(tb.totals.closingDebit) + '   Кт ' + E.money.fmt(tb.totals.closingCredit) + '</div>' +
      '<p>Бичилт бүр тэмдэгтэй нэг дүнтэй (Дт +, Кт −; D-C3). Гүйлгээ бүрийн Σ = 0 тул бүх бичилтийн Σ = 0, иймээс Дт = Кт.</p>');
    el.innerHTML = html;
    ui.$('#chk-rerun').addEventListener('click', function () { renderChecks(el); app.decorateNotes(); ui.toast('Шалгалт дахин ажиллалаа.'); });
  }

  app.registerScreen({ route: 'notes', title: 'Тайлбарын жагсаалт', crumbs: [['Прототип'], ['Тайлбарын жагсаалт']], owner: 'js/screens/system.js',
    intro: ['Прототипийн бүх тайлбар дэлгэцээр бүлэглэгдсэн. Тайлбар бүр Business Central-ийн объект, дүрмийн ID, DB хүснэгт ба хөгжүүлэлтийн баримтын хэсэгтэй холбоотой.'],
    render: renderNotes });
  app.registerScreen({ route: 'checks', title: 'Шалгалт', crumbs: [['Прототип'], ['Шалгалт']], owner: 'js/screens/system.js',
    intro: ['Хөдөлгүүрийн инвариантуудыг одоогийн ledger дээр шууд ажиллуулна: гүйлгээний тэнцэл, дэд дэвтэр = хяналтын данс, НӨАТ-ын тайлан = VAT entry, баланс тэнцэх, дугаарлалт завсаргүй, QR хадгалагдаагүй гэх мэт.',
      'Нэхэмжлэх батласны дараа энд эргэж ирээд бүх шалгалт PASS хэвээр байгааг хараарай.'],
    render: renderChecks });
})();
