/* =============================================================================
   js/screens/home.js — #home: role center (15 §3, S-PLT-05). Owner / Accountant variants.
   Every figure comes from ERP.engine (cues are computed from the posted ledgers).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui;

  var CUE_META = {
    'CUE-01': { title: 'Төлөгдөөгүй нэхэмжлэх', link: '#sales-invoices' },
    'CUE-02': { title: 'Хугацаа хэтэрсэн авлага', link: '#customers', note: 'home.cue-overdue' },
    'CUE-03': { title: 'Мөнгөн хөрөнгө', link: '#cash', note: 'home.cue-cash' },
    'CUE-04': { title: 'Төлөх НӨАТ (урьдчилсан)', link: '#vat-return', note: 'home.cue-vat' },
    'CUE-05': { title: 'eBarimt хүлээгдэж буй', link: '#ebarimt', note: 'home.cue-ebarimt-pending' },
    'CUE-06': { title: 'eBarimt алдаа, тодорхойгүй', link: '#ebarimt', note: 'home.cue-ebarimt-errors' },
    'CUE-07': { title: 'eBarimt-гүй борлуулалт', link: '#sales-invoices' },
    'CUE-08': { title: 'Сугалааны үлдэгдэл (PosAPI)', link: '#ebarimt', note: 'home.cue-lottery' },
    'CUE-09': { title: 'Ноорог баримт', link: '#sales-invoices' },
    'CUE-10': { title: 'Тулгагдаагүй хуулгын мөр', link: '#bank-rec' },
    'CUE-11': { title: 'Энэ сарын борлуулалт', link: '#sales-invoices' },
    'CUE-12': { title: '7 хоногт төлөх өглөг', link: '#purchase-invoices' },
    'CUE-13': { title: 'Хугацаа хэтэрсэн өглөг', link: '#purchase-invoices' },
    'CUE-14': { title: 'Баталгаажаагүй орцын НӨАТ', link: '#purchase-invoices', note: 'home.cue-input-vat' },
    'CUE-15': { title: 'Үеийн төлөв', link: '#periods' },
    'CUE-16': { title: 'Нийт авлага', link: '#customers', note: 'home.cue-ar' },
    'CUE-17': { title: 'Нийт өглөг', link: '#purchase-invoices' }
  };
  // 15 §3.3.1 HomeLayout
  var LAYOUT = {
    OWNER: [['Мөнгө ба тооцоо', ['CUE-03', 'CUE-01', 'CUE-02', 'CUE-17', 'CUE-16', 'CUE-11']],
      ['Татвар ба eBarimt', ['CUE-04', 'CUE-06', 'CUE-05', 'CUE-08', 'CUE-07']]],
    ACCOUNTANT: [['Хийх ажил', ['CUE-09', 'CUE-10', 'CUE-06', 'CUE-07', 'CUE-12', 'CUE-14', 'CUE-05', 'CUE-08']],
      ['Татвар ба хаалт', ['CUE-04', 'CUE-15', 'CUE-02', 'CUE-13', 'CUE-01', 'CUE-03']]]
  };
  var STATE_TEXT = { FAVORABLE: '✓ Хэвийн', AMBIGUOUS: '◐ Анхаарах', UNFAVORABLE: '⚠ Арга хэмжээ', NONE: '' };

  function cueTile(id, c, E) {
    var m = CUE_META[id];
    var M = E.money, D = E.dates;
    var value = '', sub = '', title = m.title, full = '';
    switch (id) {
      case 'CUE-03':
        value = M.compact(c.value); full = M.fmt(c.value, { sym: true });
        sub = 'Касс ' + M.compact(c.breakdown.CASH) + ' · Банк ' + M.compact(c.breakdown.BANK); break;
      case 'CUE-01': value = M.compact(c.value); full = M.fmt(c.value, { sym: true }); sub = c.count + ' нэхэмжлэх'; break;
      case 'CUE-02': value = M.compact(c.value); full = M.fmt(c.value, { sym: true }); sub = c.count + ' харилцагч · ' + c.entries + ' баримт'; break;
      case 'CUE-04':
        if (c.value < 0) title = 'Буцаан авах НӨАТ (урьдчилсан)';
        value = M.compact(c.value); full = M.fmt(c.value, { sym: true });
        sub = E.dates.monthLabel(c.period).replace(/ \d{4}$/, '') + ' · ' + (c.days >= 0 ? 'илгээх хүртэл ' + c.days + ' хоног' : 'хугацаа ' + (-c.days) + ' хоног хэтэрсэн'); break;
      case 'CUE-05': value = String(c.value); sub = c.oldest ? 'хамгийн хуучин: ' + D.fmt(c.oldest.slice(0, 10)) + ' ' + c.oldest.slice(11, 16) : 'дараалал хоосон'; break;
      case 'CUE-06': value = String(c.value); sub = c.unknown ? c.unknown + ' тодорхойгүй (UNKNOWN)' : 'тодорхойгүй баримтгүй'; break;
      case 'CUE-07': if (!c.value) return ''; value = String(c.value); break;      // UX-HOME-02: hidden at 0
      case 'CUE-08': value = c.value.toLocaleString('en-US').replace(/,/g, ' '); sub = 'сүүлийн sendData: ' + c.lastSendData.slice(5).replace('-', '.'); break;
      case 'CUE-09': value = String(c.value); sub = 'борлуулалтын ноорог'; break;
      case 'CUE-10': value = c.value + ' мөр'; sub = 'Хаан, Голомт · 9-р сар'; break;
      case 'CUE-11': value = M.compact(c.value); full = M.fmt(c.value, { sym: true }); sub = E.dates.monthLabel(c.month) + ' · НӨАТ-гүй'; break;
      case 'CUE-12': value = M.compact(c.value); sub = c.count + ' нэхэмжлэх'; break;
      case 'CUE-13': value = M.compact(c.value); sub = c.count + ' нэхэмжлэх'; break;
      case 'CUE-14': value = c.count + ' · ' + M.compact(c.value); sub = 'ДДТД бүртгээгүй / баталгаажаагүй'; break;
      case 'CUE-15': value = E.dates.monthLabel(c.period).replace(/ \d{4}$/, '') + ': ' + ui.pillLabel(c.value); sub = 'Хаасан: ' + (c.lastClosed ? E.dates.monthLabel(c.lastClosed) : '—') + (c.prevOpen ? ' · ' + E.dates.monthLabel(c.prevOpen).replace(/ \d{4}$/, '') + ' нээлттэй' : ''); break;
      case 'CUE-16': value = M.compact(c.value); full = M.fmt(c.value, { sym: true }); sub = 'харилцагчдын үлдэгдэл'; break;
      case 'CUE-17': value = M.compact(c.value); full = M.fmt(c.value, { sym: true }); sub = '7 хоногт: ' + M.compact(c.due7); break;
    }
    var st = c.state || 'NONE';
    var aria = title + ': ' + (full || value) + (sub ? ', ' + sub : '') + (STATE_TEXT[st] ? ', ' + STATE_TEXT[st].slice(2) : '');
    return '<a class="cue" href="' + m.link + '" data-state="' + st + '" aria-label="' + ui.esc(aria) + '" title="' + ui.esc(full || value) + '"' + (m.note ? ' data-note="' + m.note + '"' : '') + '>' +
      '<span class="cue-title">' + ui.esc(title) + '</span><span class="cue-value">' + ui.esc(value) + '</span>' +
      (sub ? '<span class="cue-sub">' + ui.esc(sub) + '</span>' : '') + (STATE_TEXT[st] ? '<span class="cue-state">' + STATE_TEXT[st] + '</span>' : '') + '</a>';
  }

  function headline(role, cues, E) {                   // 15 §3.5
    var name = role === 'OWNER' ? 'Наранбаатар' : 'Сарнай';
    var tip = '';
    var c6 = cues['CUE-06'], c4 = cues['CUE-04'], c2 = cues['CUE-02'];
    if (c6.unknown > 0) tip = '<a href="#ebarimt">eBarimt: ' + c6.unknown + ' баримт тодорхойгүй — шийдвэрлэх ›</a>';
    else if (c4 && c4.days <= 3) tip = '<a href="#vat-return">НӨАТ-ын тайлан (' + E.dates.monthLabel(c4.period).replace(/ \d{4}$/, '') + ') илгээх хүртэл ' + c4.days + ' хоног ›</a>';
    else if (c2.value > 0) tip = '<a href="#customers">Хугацаа хэтэрсэн авлага ' + E.money.compact(c2.value) + ' ›</a>';
    return 'Өглөөний мэнд, ' + name + '. ' + tip;
  }

  function chart(E) {                                  // monthly sales (invoices − credit memos, excl. VAT), drawn to scale
    var months = E.reports.salesByMonth(2026).slice(0, 10);
    var max = Math.max.apply(null, months.map(function (m) { return m.amount; }));
    var stepM = [1, 2, 2.5, 5, 10].map(function (x) { return x * 1e8; });       // cents: 1, 2, 2.5, 5, 10 сая
    var step = stepM.filter(function (s) { return max / s <= 5; })[0] || 1e9;
    var top = Math.ceil(max / step) * step;
    var W = 640, H = 230, L = 52, R = 12, T = 14, B = 34;
    var pw = W - L - R, ph = H - T - B, bw = pw / months.length;
    var y = function (v) { return T + ph - (v / top) * ph; };
    var grid = '', ticks = '';
    for (var v = 0; v <= top; v += step) {
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="ch-grid"/>';
      ticks += '<text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" class="ch-tick" text-anchor="end">' + (v / 1e8).toString() + '</text>';
    }
    var last = months.reduce(function (i, m, k) { return m.amount > 0 ? k : i; }, 0);
    var bars = months.map(function (m, i) {
      var x = L + i * bw + bw * 0.22, w = bw * 0.56, h = Math.max(0, (m.amount / top) * ph);
      var y0 = T + ph;
      var r = Math.min(4, w / 2, h);
      var path = h > 0 ? 'M' + x.toFixed(1) + ',' + y0 + ' V' + (y0 - h + r).toFixed(1) + ' Q' + x.toFixed(1) + ',' + (y0 - h).toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + (y0 - h).toFixed(1) +
        ' H' + (x + w - r).toFixed(1) + ' Q' + (x + w).toFixed(1) + ',' + (y0 - h).toFixed(1) + ' ' + (x + w).toFixed(1) + ',' + (y0 - h + r).toFixed(1) + ' V' + y0 + ' Z' : '';
      var lbl = E.dates.monthLabel(m.month).replace(/ \d{4}$/, '');
      return '<g class="ch-bar" tabindex="0" data-i="' + i + '" aria-label="' + ui.esc(lbl + ': ' + E.money.fmt(m.amount, { sym: true }) + ', ' + m.count + ' нэхэмжлэх') + '">' +
        '<rect x="' + (L + i * bw).toFixed(1) + '" y="' + T + '" width="' + bw.toFixed(1) + '" height="' + ph + '" class="ch-hit"/>' +
        (path ? '<path d="' + path + '" class="ch-mark' + (i === last ? ' ch-last' : '') + '"/>' : '') +
        '<text x="' + (L + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 14) + '" class="ch-tick" text-anchor="middle">' + (i + 1) + '</text>' +
        (i === last || m.amount === max ? '<text x="' + (L + i * bw + bw / 2).toFixed(1) + '" y="' + (y(m.amount) - 5).toFixed(1) + '" class="ch-label" text-anchor="middle">' + (m.amount / 1e8).toFixed(1) + '</text>' : '') +
        '</g>';
    }).join('');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img" aria-label="2026 оны сарын борлуулалт, сая төгрөгөөр">' + grid + ticks +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" class="ch-axis"/>' + bars +
      '<text x="' + (W - R) + '" y="' + (H - 1) + '" class="ch-tick" text-anchor="end">сар (2026)</text><text x="4" y="' + (T + 4) + '" class="ch-tick">сая ₮</text></svg>';
    var table = '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Сар</th><th class="num">Борлуулалт (НӨАТ-гүй)</th><th class="num">Нэхэмжлэх</th></tr></thead><tbody>' +
      months.map(function (m) { return '<tr><td>' + ui.esc(E.dates.monthLabel(m.month)) + '</td>' + ui.moneyCell(m.amount) + '<td class="num">' + m.count + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return { svg: svg, table: table, months: months };
  }

  function render(el) {
    var E = ERP.engine, role = ERP.app.state.role;
    var cues = E.home.cues();
    var html = '';
    html += '<div class="page-head"><div class="title-wrap"><h1>Нүүр</h1><span class="pill neutral">' + (role === 'OWNER' ? 'Эзэн' : 'Нягтлан') + '</span></div>' +
      '<span class="small muted">' + E.dates.fmt(ERP.data.meta.today) + ' 09:00-ийн байдлаар</span></div>';
    html += '<div class="headline" data-note="home.headline">' + headline(role, cues, E) + '</div>';
    html += '<div class="row quick-actions" data-note="home.actions">' +
      '<button class="btn primary" id="qa-new-invoice" type="button">+ Шинэ нэхэмжлэх</button>' +
      (role === 'OWNER' ? '<a class="btn" href="#cash">+ Кассын орлого</a><a class="btn" href="#purchase-invoices">Худалдан авалт</a>'
        : '<a class="btn" href="#journal">+ Ерөнхий журнал</a><a class="btn" href="#bank-rec">Хуулга импорт</a><a class="btn" href="#vat-return">НӨАТ-ын тайлан</a><a class="btn" href="#trial-balance">Гүйлгээ баланс</a>') + '</div>';
    LAYOUT[role].forEach(function (g) {
      html += '<section class="cue-group"><h2>' + ui.esc(g[0]) + '</h2><div class="cues">' + g[1].map(function (id) { return cues[id] ? cueTile(id, cues[id], E) : ''; }).join('') + '</div></section>';
    });
    // VAT cue calculation
    var c4 = cues['CUE-04'];
    if (c4) {
      var es = E.vat.entries().filter(function (e) { return e.vatDate.slice(0, 7) === c4.period && e.type !== 'SETTLEMENT'; });
      var sale = es.filter(function (e) { return e.type === 'SALE'; });
      var conf = es.filter(function (e) { return e.type === 'PURCHASE' && e.deductibleConfirmed; });
      var unc = es.filter(function (e) { return e.type === 'PURCHASE' && !e.deductibleConfirmed && e.amount !== 0; });
      var sum = function (a) { return a.reduce(function (s, e) { return s + e.amount; }, 0); };
      html += ui.calc('Тооцоог харах: Төлөх НӨАТ (' + E.dates.monthLabel(c4.period) + ')',
        '<div class="formula">CUE-04 = −(Σ SALE.amount + Σ PURCHASE.amount [deductible_confirmed]),  vat_date ∈ ' + c4.period + '\n' +
        '      = −(' + E.money.fmt(sum(sale)) + ' + ' + E.money.fmt(sum(conf)) + ')\n' +
        '      = ' + E.money.fmt(c4.value, { sym: true }) + '\n' +
        'Илгээх хугацаа: ' + E.dates.fmt(c4.due) + ' (vat.return_due_day = 10) → ' + c4.days + ' хоног → ' + (c4.state === 'UNFAVORABLE' ? 'Арга хэмжээ (≤ 3)' : c4.state) + '</div>' +
        '<p>Борлуулалтын ' + sale.length + ' VAT entry (тэмдэг сөрөг, BR-TAX-29), баталгаажсан орцын ' + conf.length + ' entry. Баталгаажаагүй ' + unc.length + ' entry (' + E.money.fmt(sum(unc), { sym: true }) + ') тооцоонд ороогүй — D-E4.</p>');
    }
    // chart + overdue top 5
    var ch = chart(E);
    var ag = E.reports.aging('customer');
    var od = ag.parties.map(function (p) {
      var o = p.entries.filter(function (x) { return x.days > 0 && x.remaining > 0; });
      return { name: p.name, no: p.party, amount: o.reduce(function (s, x) { return s + x.remaining; }, 0), days: o.reduce(function (m, x) { return Math.max(m, x.days); }, 0) };
    }).filter(function (x) { return x.amount > 0; }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5);
    html += '<div class="grid home-split">' +
      '<div class="card" data-note="home.chart"><div class="card-head"><h2>Сарын борлуулалт, 2026 (НӨАТ-гүй)</h2><button class="btn ghost sm" id="chart-toggle" type="button" aria-pressed="false">Хүснэгтээр харах</button></div>' +
      '<div class="card-body chart-body"><div id="chart-view">' + ch.svg + '<div class="ch-tip" id="ch-tip" hidden></div></div><div id="chart-table" hidden>' + ch.table + '</div>' +
      '<p class="xs muted">Нэхэмжлэх − кредит нот, НӨАТ-гүй дүн (CUE-11-ийн суурь). Тэмдэглэсэн утга: хамгийн их ба сүүлийн сар.</p></div></div>' +
      '<div class="card" data-note="home.overdue"><div class="card-head"><h2>Хугацаа хэтэрсэн — топ 5</h2><a class="small" href="#customers">Насжилт ›</a></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Харилцагч</th><th class="num">Дүн</th><th class="num">Хоног</th></tr></thead><tbody>' +
      (od.length ? od.map(function (x) { return '<tr><td>' + ui.esc(x.name) + '</td>' + ui.moneyCell(x.amount) + '<td class="num">' + x.days + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="empty">Хугацаа хэтэрсэн авлага алга</td></tr>') +
      '</tbody></table></div></div></div></div>';
    if (role === 'ACCOUNTANT') {
      var cl = E.home.closeChecklist('2026-09');
      html += '<div class="card" data-note="home.checklist"><div class="card-head"><h2>9-р сарын хаалт (' + cl.ok + '/' + cl.items.length + ')</h2><a class="small" href="#periods">Үе ба хаалт ›</a></div><div class="card-body flush">' +
        cl.items.map(function (i) {
          var mark = i.status === 'OK' ? '<span class="check-mark pass" aria-hidden="true">✓</span>' : i.status === 'BLOCKING' ? '<span class="check-mark fail" aria-hidden="true">✕</span>' : '<span class="check-mark warn" aria-hidden="true">☐</span>';
          return '<div class="check-row">' + mark + '<div><a href="' + i.link + '">' + ui.esc(i.label) + '</a><div class="xs muted">' + ui.esc(i.detail) + ' · <code>' + i.code + '</code> ' + i.rule + '</div></div>' + ui.pill(i.status) + '</div>';
        }).join('') + '</div></div>';
    } else {
      var cash = cues['CUE-03'];
      html += ui.calc('Тооцоог харах: Мөнгөн хөрөнгө (CUE-03)',
        '<div class="formula">' + ERP.data.bankAccounts.map(function (b) { return b.name.padEnd(30, ' ') + E.money.fmt(E.reports.bankBalance(b.no, ERP.data.meta.today)).padStart(18, ' ') + '   (' + E.setup.bankGlAccount(b.no) + ')'; }).join('\n') +
        '\n' + 'Σ'.padEnd(30, ' ') + E.money.fmt(cash.value).padStart(18, ' ') + '</div><p>Банкны дэд дэвтрийн (bank_ledger_entry) үлдэгдэл. #checks хуудас үүнийг 1100/1110/1111 дансны G/L үлдэгдэлтэй тулгана (BR-PST-42).</p>');
    }
    el.innerHTML = html;

    ui.$('#qa-new-invoice').addEventListener('click', function () {
      var d = E.drafts.create(null);
      ERP.app.navigate('sales-invoice', { draftNo: d.no });
    });
    var tg = ui.$('#chart-toggle');
    tg.addEventListener('click', function () {
      var t = ui.$('#chart-table'), v = ui.$('#chart-view');
      var showTable = t.hidden;
      t.hidden = !showTable; v.hidden = showTable;
      tg.textContent = showTable ? 'Графикаар харах' : 'Хүснэгтээр харах';
      tg.setAttribute('aria-pressed', String(showTable));
    });
    var tip = ui.$('#ch-tip'), view = ui.$('#chart-view');
    var show = function (g) {
      var i = +g.getAttribute('data-i'), m = ch.months[i];
      tip.innerHTML = '<strong>' + ui.esc(E.dates.monthLabel(m.month)) + '</strong><br>' + ui.esc(E.money.fmt(m.amount, { sym: true })) + '<br><span class="muted">' + m.count + ' нэхэмжлэх</span>';
      tip.hidden = false;
      var r = g.querySelector('.ch-hit').getBoundingClientRect(), vr = view.getBoundingClientRect();
      var left = r.left - vr.left + r.width / 2;
      tip.style.left = Math.min(Math.max(left, 70), vr.width - 70) + 'px';
      ui.$$('.ch-bar').forEach(function (b) { b.classList.toggle('dim', b !== g); });
    };
    var hide = function () { tip.hidden = true; ui.$$('.ch-bar').forEach(function (b) { b.classList.remove('dim'); }); };
    ui.$$('.ch-bar').forEach(function (g) {
      g.addEventListener('mouseenter', function () { show(g); });
      g.addEventListener('focus', function () { show(g); });
      g.addEventListener('mouseleave', hide);
      g.addEventListener('blur', hide);
    });
  }

  ERP.app.registerScreen({
    route: 'home', title: 'Нүүр', owner: 'js/screens/home.js',
    intro: ['Компанийн өнөөдрийн байдал: мөнгө хаана байна, хэн хэдэн төгрөг өртэй, татвар ба eBarimt-д эрсдэл байгаа эсэх. Тоо бүр батлагдсан бичилтээс (ledger) тооцогдоно; дарж холбогдох жагсаалт руу орно.',
      'Эзэн ба Нягтлан өөр хувилбар хардаг (дээд мөрөнд үүргээ солиод үзээрэй). Нүүр хуудас юу ч батлахгүй — зөвхөн уншина.'],
    render: render
  });
})();
