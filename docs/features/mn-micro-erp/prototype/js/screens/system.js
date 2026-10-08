/* =============================================================================
   js/screens/system.js — prototype pages: #notes (all explanations by screen) and #checks (live invariants).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;

  var SCREEN_ROUTE = { shell: 'home', home: 'home', 'sales-invoices': 'sales-invoices', 'sales-invoice': 'sales-invoice', 'posted-invoice': 'posted-invoice',
    'purchase-invoices': 'purchase-invoices', checks: 'checks', gl: 'coa', 'sales-ar': 'customers', 'cash-bank': 'cash', 'reports-tax': 'financial-statements' };

  function renderNotes(el) {
    var groups = ERP.notes.byScreen().filter(function (g) { return g.notes.length; });
    var total = groups.reduce(function (s, g) { return s + g.notes.length; }, 0);
    var html = '<div class="page-head"><div class="title-wrap"><h1>Тайлбарын жагсаалт</h1></div><span class="small muted" data-note="notes.list">' + total + ' тайлбар · ' + groups.length + ' бүлэг</span></div>';
    groups.forEach(function (g) {
      var route = SCREEN_ROUTE[g.screen];
      html += '<section class="card"><div class="card-head"><h2>' + ui.esc(g.title) + '</h2>' + (route && app.screens[route] ? '<a class="small" href="#' + route + '">Дэлгэц нээх ›</a>' : '') + '</div><div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Тайлбар</th><th>Юу хийдэг вэ</th><th>Дүрэм</th><th>Баримт</th></tr></thead><tbody>' +
        g.notes.map(function (n) {
          return '<tr><td><button class="btn ghost sm" type="button" data-open-note="' + n.id + '" id="nl-' + n.id.replace(/[^\w-]/g, '_') + '">' + ui.esc(n.title) + '</button><div class="xs muted code">' + n.id + '</div></td>' +
            '<td class="small" style="max-width:52ch">' + n.what + '</td>' +
            '<td><div class="chips">' + n.rules.map(function (r) { return '<span class="chip rule">' + ui.esc(r) + '</span>'; }).join('') + '</div></td>' +
            '<td class="small">' + n.doc.map(function (d) { return '<a href="' + ui.esc(ERP.notes.link(d)) + '" target="_blank" rel="noopener">' + ui.esc(d.file) + (d.section ? ' §' + ui.esc(d.section.split(' ')[0]) : '') + '</a>'; }).join('<br>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div></section>';
    });
    el.innerHTML = html;
    ui.$$('[data-open-note]', el).forEach(function (b) { b.addEventListener('click', function () { app.openNote(b.getAttribute('data-open-note')); }); });
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
