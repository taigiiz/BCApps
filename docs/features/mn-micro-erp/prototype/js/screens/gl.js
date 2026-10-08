/* =============================================================================
   js/screens/gl.js — General ledger area (GL builder)
     #coa            S-GL-01 Дансны төлөвлөгөө  (+ S-GL-02 account card drawer, Navigate UX-NAV-15..17)
     #journal        S-GL-03 Ерөнхий журнал     (+ S-GL-08 preview, S-GL-07 transactions + reversal, FR-GL-014 correction)
     #trial-balance  S-RPT-02 Гүйлгээ баланс
     #periods        S-GL-09/10 Үе ба сарын хаалт, S-GL-11 жилийн хаалт (preview; post once all 12 months are closed)

   Accounting goes through the public ERP.engine API (post, reports, periods, setup, ledger, state() for reading).
   ENGINE GAPS implemented locally in this file (engine.js was not changed):
     G1  journal lines with a VAT group (05 §6.4 gross method, BR-PST-36/38) — engine.journal.post has no VAT, so the
         journal assembles its own posting document and calls engine.post();
     G2  reversal that also mirrors VAT and customer/vendor entries (BR-PST-47/49) — engine.ledger.reverseTransaction
         mirrors only G/L + bank entries; reverseTx() builds the mirror voucher and closes both sub-ledger entries;
     G3  trial balance with the is_closing filter, OPENING placement, heading/total rows (10 §5.9, BR-RPT-11/12);
     G4  year-end closing voucher (05 §5.13, BR-YEC-04) and the is_closing flag (engine always writes isClosing=false);
     G5  period status log, checklist acknowledgement, PRIOR_PERIOD_OPEN, fiscal-year status (BR-PER-13/18/40/44).
   Flags that engine.post() cannot set (reversed*, isClosing) are updated afterwards on the posted rows, mirroring
   the DB's fn_ledger_update (D-C4: only those system columns change).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;
  var E = function () { return ERP.engine; };
  var DATA = ERP.data;
  var LS = {
    get: function (k, d) { try { var v = window.localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };

  // ---------------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------------
  function st() { return E().state(); }
  function acc(no) { return E().setup.account(no); }
  function fmtM(c, o) { return E().money.fmt(c, o); }
  function today() { return DATA.meta.today; }
  function fyYear() { return DATA.fiscalYear.year; }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function nowStamp() { var d = new Date(); return today() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function opt(v, label, sel, dis) { return '<option value="' + ui.esc(v) + '"' + (sel ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + ui.esc(label) + '</option>'; }
  function dr(a) { return a > 0 ? a : 0; }
  function cr(a) { return a < 0 ? -a : 0; }
  function plain(c) { var neg = c < 0; c = Math.abs(c); return (neg ? '-' : '') + Math.floor(c / 100) + '.' + pad2(c % 100); }
  function parseAmt(s) {                                 // 15 §7.3 subset: spaces / NBSP / thousands commas ignored, '.' decimal
    var t = String(s === null || s === undefined ? '' : s).replace(/[\s  ,]/g, '');
    if (!t) return 0;
    var c = E().money.toCents(t);
    return c === null ? NaN : c;
  }
  function userName() {
    var u = DATA.company.users.filter(function (x) { return x.role === app.state.role; })[0];
    return u ? u.roleMn + ' — ' + u.name : app.state.role;
  }
  function ymLabel(ym) { return E().dates.monthLabel(ym); }
  function on(id, ev, fn) { var x = document.getElementById(id); if (x) x.addEventListener(ev, fn); }
  function dateField(id, cur, set, after) {
    on(id, 'change', function (ev) {
      var iso = ui.parseDate(ev.target.value);
      if (!iso) { ev.target.classList.add('invalid'); ui.toast('Огноог ЖЖЖЖ.СС.ӨӨ хэлбэрээр оруулна уу (жишээ 2026.10.08).', 'error'); ev.target.value = ui.date(cur); return; }
      set(iso); after();
    });
  }
  function rerender() {                                   // full re-render that keeps the focused control (ids are stable)
    var a = document.activeElement, id = a && a.id, pos = null;
    try { if (a && typeof a.selectionStart === 'number') pos = a.selectionStart; } catch (e) { pos = null; }
    app.refresh();
    if (!id) return;
    var n = document.getElementById(id);
    if (n && n.focus) { n.focus({ preventScroll: true }); try { if (pos !== null && n.setSelectionRange) n.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ } }
  }

  var TYPE_LABEL = { POSTING: 'Бичилт', HEADING: 'Гарчиг', BEGIN_TOTAL: 'Эхлэл', END_TOTAL: 'Төгсгөл', TOTAL: 'Нийлбэр' };
  var CAT_LABEL = { ASSETS: 'Хөрөнгө', LIABILITIES: 'Өр төлбөр', EQUITY: 'Эздийн өмч', INCOME: 'Орлого', COGS: 'Өртөг', EXPENSE: 'Зардал' };
  var SIDE_LABEL = { D: 'Дт', C: 'Кт', B: 'Дт/Кт' };
  var SRC_LABEL = { GENJNL: 'Ерөнхий журнал', CASHRECJNL: 'Мөнгөн орлогын журнал', PAYMENTJNL: 'Төлбөрийн журнал', CASHVOUCHER: 'Кассын баримт',
    PAYMENTREG: 'Төлбөр (банк)', OPENING: 'Эхний үлдэгдэл', PAYROLLJNL: 'Цалингийн журнал', SALES: 'Борлуулалт', PURCHASES: 'Худалдан авалт',
    REVERSAL: 'Буцаалт', CLSINCOME: 'Жилийн хаалт', VATSTMT: 'НӨАТ-ын хаалт' };
  var CF_EXTRA = { CASH_TRANSFER: 'Мөнгө (МГТ-ийн үлдэгдэл, дотоод шилжүүлэг)', NON_CASH: 'Мөнгөн бус (МГТ-д орохгүй)' };
  function cfLabel(code) { if (!code) return '—'; var c = DATA.cashFlowCategories[code]; return c ? c[0] : (CF_EXTRA[code] || code); }

  var STMT = null;                                        // Form A line code → { report, name, filter }
  function stmtLine(a) {
    if (!STMT) {
      STMT = { SBT: {}, ODT: {} };
      DATA.statementRows.forEach(function (r) { if ((r[0] === 'SBT' || r[0] === 'ODT') && r[2]) STMT[r[0]][r[2]] = { report: r[0], code: r[2], name: r[3], type: r[4], filter: r[5] }; });
    }
    if (!a || !a.line) return null;
    return STMT[a.incomeBalance === 'BALANCE_SHEET' ? 'SBT' : 'ODT'][a.line] || null;
  }
  function filterHas(filter, no) { return filter ? E().reports.accountFilter(filter)(no) : false; }

  // ---------------------------------------------------------------------------
  // shared UI: G/L entry table, Navigate (UX-NAV-15..17), account card drawer (S-GL-02)
  // ---------------------------------------------------------------------------
  function glTable(entries, o) {
    o = o || {};
    var sd = 0, sc = 0;
    var body = entries.map(function (e) {
      sd += dr(e.amount); sc += cr(e.amount);
      var a = acc(e.account);
      return '<tr' + (e.reversed ? ' class="is-reversed"' : '') + '>' +
        (o.relative ? '<td class="code">' + (e._rel || '') + '</td>' : '<td class="code">' + (e.entryNo || '—') + '</td>') +
        '<td class="nowrap">' + ui.date(e.postingDate) + '</td>' +
        '<td>' + (e.documentNo && !o.noLinks && e.transactionNo ? '<button type="button" class="lnk mono" data-navdoc="' + ui.esc(e.documentNo) + '" data-navdate="' + e.postingDate + '">' + ui.esc(e.documentNo) + '</button>' : '<span class="code">' + ui.esc(e.documentNo || '') + '</span>') + (e._sim ? '<span class="sim-tag">загвар</span>' : '') + '</td>' +
        (o.noAccount ? '' : '<td class="code">' + e.account + '</td><td>' + ui.esc(a ? a.name : '') + '</td>') +
        '<td>' + ui.esc(e.description || '') + '</td>' +
        ui.moneyCell(dr(e.amount), { blankZero: true }) + ui.moneyCell(cr(e.amount), { blankZero: true }) +
        (o.running ? ui.moneyCell(e._run) : '') +
        '<td class="code">' + ui.esc(e.sourceCode || '') + (e.isClosing ? ' · is_closing' : '') + '</td>' +
        (o.noTx ? '' : '<td class="code">' + (e.transactionNo || '—') + '</td>') +
        '<td>' + (e.reversed ? ui.pill('CORRECTED', e.reversedByTx ? 'Буцаагдсан → #' + e.reversedByTx : 'Буцаалт') : '') + '</td></tr>';
    }).join('');
    var cols = 8 + (o.noAccount ? 0 : 2) + (o.running ? 1 : 0) + (o.noTx ? 0 : 1);
    return '<div class="table-wrap"><table class="grid-table"><thead><tr><th>' + (o.relative ? '№ (харьцангуй)' : 'Entry №') + '</th><th>Огноо</th><th>Баримт №</th>' +
      (o.noAccount ? '' : '<th>Данс</th><th>Нэр</th>') + '<th>Тайлбар</th><th class="num">Дебит</th><th class="num">Кредит</th>' + (o.running ? '<th class="num">Өссөн үлдэгдэл</th>' : '') +
      '<th>Source</th>' + (o.noTx ? '' : '<th>Гүйлгээ</th>') + '<th>Төлөв</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="' + cols + '" class="empty">Бичилт алга</td></tr>') + '</tbody>' +
      (o.noTotal || !entries.length ? '' : '<tfoot><tr><td colspan="' + (o.noAccount ? 4 : 6) + '">Σ ' + entries.length + ' мөр' + (sd === sc ? ' · Дт = Кт ✓' : '') + '</td>' + ui.moneyCell(sd) + ui.moneyCell(sc) + '<td colspan="' + (cols - (o.noAccount ? 6 : 8)) + '"></td></tr></tfoot>') +
      '</table></div>';
  }
  function bindNav(root, before) {
    ui.$$('[data-navdoc]', root).forEach(function (b) {
      b.addEventListener('click', function () { if (before) before(); navigateDoc(b.getAttribute('data-navdoc'), b.getAttribute('data-navdate')); });
    });
    ui.$$('[data-acccard]', root).forEach(function (b) {
      b.addEventListener('click', function () { if (before) before(); accountCard(b.getAttribute('data-acccard')); });
    });
  }

  function navigateDoc(docNo, date) {                     // BC "Find entries" (Navigate): document no AND posting date (UX-NAV-16)
    var S = st();
    var txs = S.transactions.filter(function (t) { return t.documentNo === docNo && (!date || t.postingDate === date); });
    var txNos = txs.map(function (t) { return t.transactionNo; });
    var inTx = function (e) { return txNos.indexOf(e.transactionNo) >= 0; };
    var gl = S.glEntries.filter(inTx), vat = S.vatEntries.filter(inTx), cle = S.cle.filter(inTx), vle = S.vle.filter(inTx), ble = S.ble.filter(inTx);
    var cv = S.cashVouchers.filter(inTx);
    var si = E().sales.getPosted(docNo);
    var pi = E().purchases.list().filter(function (p) { return p.no === docNo; })[0];
    var eb = si && si.ebarimtDocId ? E().ebarimt.get(si.ebarimtDocId) : null;
    var rows = [['gl.gl_entry', 'Ерөнхий дэвтрийн бичилт', gl.length], ['tax.vat_entry', 'НӨАТ-ын бичилт', vat.length],
      ['party.cust_ledger_entry', 'Харилцагчийн бичилт', cle.length], ['party.vendor_ledger_entry', 'Нийлүүлэгчийн бичилт', vle.length],
      ['bank.bank_ledger_entry', 'Банк, кассын бичилт', ble.length], ['bank.posted_cash_voucher', 'Кассын баримт (МХ-1/МХ-2)', cv.length],
      ['sales.sales_invoice_header', 'Батлагдсан борлуулалтын баримт', si ? 1 : 0], ['purch.purch_inv_header', 'Батлагдсан худалдан авалтын баримт', pi ? 1 : 0],
      ['ebarimt.ebarimt_document', 'eBarimt баримт', eb ? 1 : 0]].filter(function (r) { return r[2] > 0; });
    var reversible = txs.filter(function (t) { return !t.reversed && t.sourceCode !== 'REVERSAL' && E().ledger.reversibleSources.indexOf(t.sourceCode) >= 0; });
    var body = '<div class="stack" data-note="gl.navigate">' +
      '<p class="small">Баримт <code>' + ui.esc(docNo) + '</code> · огноо ' + ui.date(date) + ' · ' + txs.length + ' гүйлгээ' +
      (txs.length ? ' (#' + txNos.join(', #') + ', source ' + txs.map(function (t) { return t.sourceCode; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ')' : '') + '</p>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Хүснэгт</th><th>Төрөл</th><th class="num">Тоо</th></tr></thead><tbody>' +
      (rows.map(function (r) { return '<tr><td class="code">' + r[0] + '</td><td>' + r[1] + '</td><td class="num">' + r[2] + '</td></tr>'; }).join('') || '<tr><td colspan="3" class="empty">Олдсонгүй</td></tr>') +
      '</tbody></table></div>' +
      '<h3 class="small">Гүйлгээний бүх G/L бичилт</h3>' + glTable(gl, { noLinks: true }) +
      (vat.length ? '<h3 class="small">НӨАТ-ын бичилт</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>№</th><th>Төрөл</th><th>Бүлэг</th><th class="num">Суурь</th><th class="num">НӨАТ</th><th>Баталгаажсан</th><th>Хаагдсан</th></tr></thead><tbody>' +
        vat.map(function (v) { return '<tr><td class="code">' + v.entryNo + '</td><td>' + v.type + '</td><td class="code">' + v.vatBus + ' × ' + v.vatProd + '</td>' + ui.moneyCell(v.base) + ui.moneyCell(v.amount) + '<td>' + (v.deductibleConfirmed ? 'Тийм' : '—') + '</td><td>' + (v.closed ? 'Тийм' : 'Үгүй') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      '</div>';
    var footer = [{ label: 'Хаах' }];
    if (si) footer.unshift({ label: 'Баримт нээх', onClick: function (close) { close(true); app.navigate('posted-invoice', { postedNo: si.no }); } });
    if (reversible.length) footer.unshift({ label: 'Гүйлгээ / буцаалт', onClick: function (close) { close(true); app.navigate('journal', { glJnlTab: 'posted', glTxNo: reversible[0].transactionNo, glTxFilter: 'all' }); } });
    var m = ui.modal({ title: 'Бичилт хайх (Navigate) — ' + docNo, wide: true, body: body, footer: footer });
    app.decorateNotes(m.el);
  }

  function accountCard(no, range) {
    var a = acc(no);
    if (!a) return;
    range = range || coaState();
    var from = range.from, to = range.to;
    var R = E().reports;
    var isPosting = a.type === 'POSTING';
    var filter = isPosting ? no : (a.totaling || null);
    var bal = filter ? R.glBalance(filter, to) : null;
    var net = filter ? R.glBalance(filter, to, from) : null;
    var line = stmtLine(a);
    var html = '<div class="stack" data-note="gl.account-card">' +
      '<div class="row">' + ui.pill(a.blocked ? 'CANCELLED' : 'OK', TYPE_LABEL[a.type]) + (a.direct ? '' : ui.pill('WARNING', 'Хяналтын данс — гар бичилт хориотой')) + '</div>' +
      '<dl class="kv left">' +
      '<dt>Дугаар / нэр</dt><dd><code>' + a.no + '</code> ' + ui.esc(a.name) + '</dd>' +
      '<dt>Төрөл (D-D1)</dt><dd>' + TYPE_LABEL[a.type] + ' · ' + (a.incomeBalance === 'BALANCE_SHEET' ? 'Тайлан баланс' : 'Орлогын тайлан') + '</dd>' +
      '<dt>Ангилал</dt><dd>' + ui.esc(CAT_LABEL[a.category] || a.category || '—') + '</dd>' +
      '<dt>Хэвийн тал</dt><dd>' + (SIDE_LABEL[a.side] || '—') + ' <span class="gl-note">(зөвхөн анхааруулга, FR-GL-005)</span></dd>' +
      '<dt>Шууд бичилт</dt><dd>' + (a.direct ? 'Тийм' : '<span class="flag-no">Үгүй</span> — зөвхөн системийн бичилт (FR-GL-003)') + '</dd>' +
      (a.totaling ? '<dt>Нийлбэрийн муж</dt><dd class="code">' + ui.esc(a.totaling) + '</dd>' : '') +
      '<dt>Догол</dt><dd>' + a.indent + '</dd>' +
      '<dt>Маягт А</dt><dd>' + (line ? '<code>' + line.report + ' ' + line.code + '</code> ' + ui.esc(line.name) : (isPosting ? '<span class="flag-no">харгалзаагүй</span>' : '—')) + '</dd>' +
      '<dt>МГТ ангилал</dt><dd>' + (a.cf ? '<code>' + a.cf + '</code> ' + ui.esc(cfLabel(a.cf)) : '—') + '</dd>' +
      (a.genProd || a.vatProd ? '<dt>Анхдагч бүлэг</dt><dd class="code">' + (a.genProd || '—') + ' / ' + (a.vatProd || '—') + '</dd>' : '') +
      (filter ? '<dt>Хөдөлгөөн ' + ui.date(from) + '–' + ui.date(to) + '</dt><dd>' + fmtM(net) + '</dd><dt>Үлдэгдэл ' + ui.date(to) + '</dt><dd><strong>' + fmtM(bal) + '</strong> ' + (bal > 0 ? 'Дт' : bal < 0 ? 'Кт' : '') + '</dd>' : '') +
      '</dl>' + controlNote(a);
    if (isPosting) {
      var all = R.accountEntries(no, null, to);
      var run = 0;
      var withRun = all.map(function (e) { run += e.amount; var c = Object.assign({}, e); c._run = run; return c; }).filter(function (e) { return e.postingDate >= from; });
      var recent = withRun.slice(-25).reverse();
      html += '<h3 class="small">Сүүлийн бичилтүүд (' + recent.length + ' / ' + withRun.length + ', хугацаанд) — баримтын дугаар дарж гүйлгээг нээнэ</h3>' +
        glTable(recent, { noAccount: true, running: true, noTotal: true }) +
        '<p class="gl-note">Устгах: бичилттэй дансыг устгахгүй, зөвхөн блоклоно (FR-GL-004, UX-COA-06). Бичилт ' + all.length + '.</p>';
    } else if (a.totaling) {
      var parts = E().setup.accounts().filter(function (x) { return x.type === 'POSTING' && filterHas(a.totaling, x.no); });
      html += '<h3 class="small">' + ui.esc(a.totaling) + ' мужийн бичилтийн данс (' + parts.length + ')</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Нэр</th><th class="num">Үлдэгдэл</th></tr></thead><tbody>' +
        parts.map(function (x) { var b = R.glBalance(x.no, to); return b ? '<tr><td class="code">' + x.no + '</td><td>' + ui.esc(x.name) + '</td>' + ui.moneyCell(b) + '</tr>' : ''; }).join('') +
        '</tbody><tfoot><tr><td colspan="2">Σ = ' + a.no + '</td>' + ui.moneyCell(bal) + '</tr></tfoot></table></div>';
    }
    html += '</div>';
    var m = ui.modal({ title: 'Дансны карт — ' + a.no + ' ' + a.name, wide: true, body: html, footer: [{ label: 'Хаах' }] });
    m.el.classList.add('gl-drawer');
    bindNav(m.el, function () { m.close(true); });
    app.decorateNotes(m.el);
  }
  function controlNote(a) {
    if (a.direct || a.type !== 'POSTING') return '';
    var why = [];
    Object.keys(DATA.customerPostingGroups).forEach(function (g) { if (DATA.customerPostingGroups[g].receivables === a.no) why.push('харилцагчийн posting group ' + g + ' (авлагын дэд дэвтэр)'); });
    Object.keys(DATA.vendorPostingGroups).forEach(function (g) { if (DATA.vendorPostingGroups[g].payables === a.no) why.push('нийлүүлэгчийн posting group ' + g + ' (өглөгийн дэд дэвтэр)'); });
    DATA.bankAccounts.forEach(function (b) { if (E().setup.bankGlAccount(b.no) === a.no) why.push('мөнгөний данс ' + b.no + ' ' + b.name); });
    if (a.no === '1300' || a.no === '2300' || a.no === '2305') why.push('VAT Posting Setup-ийн НӨАТ-ын данс (НӨАТ-ын бичилттэй тэнцэнэ)');
    if (a.no === '8290') why.push('бөөрөнхийлөлтийн зөрүү (системийн мөр)');
    return why.length ? '<p class="banner small">Энэ дансанд зөвхөн ' + ui.esc(why.join('; ')) + '-ээр систем бичнэ. Гар журналд сонгогдохгүй (UX-JNL-04, BR-PST-42).</p>' : '';
  }

  // ===========================================================================
  // #coa — Дансны төлөвлөгөө (S-GL-01)
  // ===========================================================================
  function coaState() {
    var c = app.ctx;
    if (!c.glCoa) c.glCoa = { from: fyYear() + '-01-01', to: today(), q: '', postingOnly: false, collapsed: {} };
    return c.glCoa;
  }
  function renderCoa(el) {
    var f = coaState();
    var R = E().reports;
    var accts = E().setup.accounts();
    var q = f.q.trim().toLowerCase();
    var flat = !!q || f.postingOnly;
    var hideIndent = null;
    var nPosting = accts.filter(function (a) { return a.type === 'POSTING'; }).length;
    var rows = [];
    accts.forEach(function (a) {
      if (flat) {
        if (f.postingOnly && a.type !== 'POSTING') return;
        if (q && (a.no + ' ' + a.name).toLowerCase().indexOf(q) < 0) return;
        rows.push(a); return;
      }
      if (hideIndent !== null && a.indent > hideIndent) return;
      hideIndent = null;
      rows.push(a);
      if (f.collapsed[a.no] && (a.type === 'HEADING' || a.type === 'BEGIN_TOTAL')) hideIndent = a.indent;
    });
    var html = '<div class="page-head"><div class="title-wrap"><h1>Дансны төлөвлөгөө</h1><span class="small muted">' + accts.length + ' данс · ' + nPosting + ' бичилтийн</span></div>' +
      '<div class="row"><button class="btn" type="button" id="coa-forma">Маягт А-гийн шалгалт</button>' +
      '<button class="btn" type="button" id="coa-expand">Бүгдийг дэлгэх</button><button class="btn" type="button" id="coa-collapse">Гарчгаар хураах</button></div></div>';
    html += '<div class="card"><div class="card-body"><form class="gl-toolbar" id="coa-filter" data-note="gl.coa-balance">' +
      '<div class="field grow"><label for="coa-q">Хайх (дугаар, нэр)</label><input class="input" id="coa-q" type="search" value="' + ui.esc(f.q) + '" placeholder="жишээ 1200 эсвэл авлага" autocomplete="off"></div>' +
      '<div class="field date"><label for="coa-from">Хөдөлгөөн: эхлэх</label>' + ui.dateInput('coa-from', f.from) + '</div>' +
      '<div class="field date"><label for="coa-to">Үлдэгдлийн огноо</label>' + ui.dateInput('coa-to', f.to) + '</div>' +
      '<div class="checks"><label class="checkbox" for="coa-posting"><input type="checkbox" id="coa-posting"' + (f.postingOnly ? ' checked' : '') + '> Зөвхөн бичилтийн данс</label></div>' +
      '</form></div></div>';
    html += '<div class="card" data-note="gl.coa-tree"><div class="col-legend"><span class="muted">Багана:</span>' +
      '<span data-note="gl.coa-direct">Шууд = direct posting</span><span data-note="gl.coa-forma">Маягт А = СБТ/ОДТ-ийн мөр</span><span data-note="gl.coa-cf">МГТ = мөнгөн гүйлгээний ангилал</span>' +
      '<span>Тал = хэвийн тал (Дт/Кт)</span><span>Үлдэгдэл: Дт +, Кт −</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table coa-grid" role="treegrid" aria-label="Дансны төлөвлөгөө"><thead><tr>' +
      '<th>Дугаар</th><th>Нэр</th><th>Төрөл</th><th>Ангилал</th><th>Тал</th><th>Шууд</th><th>Маягт А</th><th>МГТ</th>' +
      '<th class="num" title="Сонгосон хугацааны цэвэр хөдөлгөөн: Дт +, Кт −">Хөдөлгөөн</th><th class="num" title="Огноо хүртэлх Σ gl_entry.amount: дебит үлдэгдэл эерэг, кредит үлдэгдэл сөрөг (UX-COA-03)">Үлдэгдэл</th></tr></thead><tbody>';
    rows.forEach(function (a) {
      var isTot = a.type === 'END_TOTAL' || a.type === 'TOTAL';
      var filter = a.type === 'POSTING' ? a.no : (isTot ? a.totaling : null);
      var bal = filter ? R.glBalance(filter, f.to) : null;
      var net = filter ? R.glBalance(filter, f.to, f.from) : null;
      var canFold = !flat && (a.type === 'HEADING' || a.type === 'BEGIN_TOTAL');
      var folded = !!f.collapsed[a.no];
      var line = stmtLine(a);
      html += '<tr class="t-' + a.type + ' lvl-' + a.indent + (a.blocked ? ' blocked' : '') + '" aria-level="' + (a.indent + 1) + '"' + (canFold ? ' aria-expanded="' + (!folded) + '"' : '') + '>' +
        '<td class="code"><button type="button" class="lnk mono" data-acccard="' + a.no + '" id="coa-acc-' + a.no + '">' + a.no + '</button></td>' +
        '<td class="acc-name"><div class="tree-cell" style="padding-left:' + (flat ? 0 : a.indent * 16) + 'px">' +
        (canFold ? '<button type="button" class="tree-toggle" data-fold="' + a.no + '" id="coa-fold-' + a.no + '" aria-label="' + (folded ? 'Дэлгэх: ' : 'Хураах: ') + ui.esc(a.name) + '">' + (folded ? '▸' : '▾') + '</button>' : '<span class="tree-spacer" aria-hidden="true"></span>') +
        '<span>' + ui.esc(a.name) + '</span></div></td>' +
        '<td>' + TYPE_LABEL[a.type] + '</td><td>' + ui.esc(CAT_LABEL[a.category] || '') + '</td><td>' + (SIDE_LABEL[a.side] || '') + '</td>' +
        '<td>' + (a.type === 'POSTING' ? (a.direct ? 'Тийм' : '<span class="flag-no" title="Хяналтын данс: зөвхөн системийн бичилт (FR-GL-003)">Үгүй</span>') : '') + '</td>' +
        '<td class="code" title="' + ui.esc(line ? line.report + ' ' + line.code + ' ' + line.name : '') + '">' + (line ? line.report + ' ' + line.code : '') + '</td>' +
        '<td class="code" title="' + ui.esc(a.cf ? cfLabel(a.cf) : '') + '">' + ui.esc(a.cf || '') + '</td>' +
        (filter ? ui.moneyCell(net, { blankZero: true }) + ui.moneyCell(bal, { blankZero: a.type === 'POSTING' }) : '<td></td><td></td>') + '</tr>';
    });
    if (!rows.length) html += '<tr><td colspan="10" class="empty">"' + ui.esc(f.q) + '" — данс олдсонгүй</td></tr>';
    html += '</tbody></table></div></div></div>';
    html += '<div data-note="gl.coa-equation">' + ui.calc('Тооцоог харах: нийлбэр данс ба тэнцлийн тэгшитгэл (' + ui.date(f.to) + ')', coaCalc(f), 'coa-calc') + '</div>';
    el.innerHTML = html;

    ui.$('#coa-filter').addEventListener('submit', function (ev) { ev.preventDefault(); });
    var qEl = ui.$('#coa-q');
    qEl.addEventListener('input', function () { f.q = qEl.value; var p = qEl.selectionStart; rerender(); var n = ui.$('#coa-q'); if (n) { n.focus(); n.setSelectionRange(p, p); } });
    dateField('coa-from', f.from, function (v) { f.from = v; }, rerender);
    dateField('coa-to', f.to, function (v) { f.to = v; }, rerender);
    on('coa-posting', 'change', function (ev) { f.postingOnly = ev.target.checked; rerender(); });
    on('coa-expand', 'click', function () { f.collapsed = {}; rerender(); });
    on('coa-collapse', 'click', function () { f.collapsed = {}; accts.forEach(function (a) { if (a.type === 'HEADING') f.collapsed[a.no] = true; }); rerender(); });
    on('coa-forma', 'click', formACheck);
    ui.$$('[data-fold]', el).forEach(function (b) {
      var no = b.getAttribute('data-fold');
      var toggle = function (want) { if (want === undefined) want = !f.collapsed[no]; if (!!f.collapsed[no] === want) return; f.collapsed[no] = want; rerender(); var n = ui.$('#coa-fold-' + no); if (n) n.focus(); };
      b.addEventListener('click', function () { toggle(); });
      b.addEventListener('keydown', function (ev) { if (ev.key === 'ArrowLeft') { ev.preventDefault(); toggle(true); } else if (ev.key === 'ArrowRight') { ev.preventDefault(); toggle(false); } });
    });
    bindNav(el);
  }

  function coaCalc(f) {
    var R = E().reports, to = f.to;
    var A = R.glBalance('1000..1999', to), L = R.glBalance('2000..2999', to), Q = R.glBalance('3000..3999', to), P = R.glBalance('5000..9999', to);
    var tots = E().setup.accounts().filter(function (a) { return a.type === 'END_TOTAL' && a.indent === 0; });
    return '<p><strong>1. Нийлбэр мөр</strong> (End-Total, UX-COA-03): өөрийн <code>totaling</code> мужийн бичилтийн дансны Σ <code>gl_entry.amount</code> (огноо ≤ ' + ui.date(to) + '). Begin-Total ба Heading мөр дүнгүй.</p>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Нэр</th><th>Муж</th><th class="num">Σ amount</th></tr></thead><tbody>' +
      tots.map(function (a) { return '<tr><td class="code">' + a.no + '</td><td>' + ui.esc(a.name) + '</td><td class="code">' + a.totaling + '</td>' + ui.moneyCell(R.glBalance(a.totaling, to)) + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<p><strong>2. Тэнцлийн тэгшитгэл.</strong> Гүйлгээ бүр Σ = 0 (D-C5) тул бүх дансны нийлбэр 0: хөрөнгө + өр төлбөр + өмч + орлого/зардал = 0. Жилийн хаалтаас өмнө тайлант үеийн үр дүн 5000–9999 дансанд байна (D-D4).</p>' +
      '<div class="formula">Хөрөнгө (1000..1999)              = ' + fmtM(A) +
      '\nӨр төлбөр (2000..2999)            = ' + fmtM(L) + '   → ' + fmtM(-L) + ' Кт' +
      '\nЭздийн өмч (3000..3999)           = ' + fmtM(Q) + '   → ' + fmtM(-Q) + ' Кт' +
      '\nТайлант үеийн үр дүн (5000..9999) = ' + fmtM(P) + '   → ' + (P <= 0 ? 'ашиг ' + fmtM(-P) : 'алдагдал ' + fmtM(P)) +
      '\nΣ = ' + fmtM(A + L + Q + P) + (A + L + Q + P === 0 ? '  ✓' : '  ✕') +
      '\nХөрөнгө ' + fmtM(A) + ' = Өр ' + fmtM(-L) + ' + Өмч ' + fmtM(-Q) + ' + Үр дүн ' + fmtM(-P) + '</div>';
  }

  function formACheck() {                                  // FR-GL-002, BR-PER-33, UX-COA-07
    var to = coaState().to;
    var S = st();
    var used = {};
    S.glEntries.forEach(function (e) { if (e.postingDate <= to) used[e.account] = (used[e.account] || 0) + 1; });
    var res = [], errs = 0;
    E().setup.accounts().filter(function (a) { return a.type === 'POSTING'; }).forEach(function (a) {
      var line = stmtLine(a);
      var issues = [];
      if (!a.line) issues.push('Маягт А-гийн мөргүй');
      else if (!line) issues.push('мөр ' + a.line + ' олдсонгүй');
      else if (line.type === 'P' && !filterHas(line.filter, a.no)) issues.push('мөрийн шүүлтүүр ' + line.filter + '-д данс орохгүй');
      if (!a.cf) issues.push('МГТ ангилалгүй');
      if (issues.length && used[a.no]) errs++;
      res.push({ a: a, line: line, issues: issues, used: used[a.no] || 0 });
    });
    var cashSet = res.filter(function (r) { return r.a.cf === 'CASH_TRANSFER'; }).map(function (r) { return r.a.no; });
    var sbt111 = res.filter(function (r) { return r.line && r.line.report === 'SBT' && r.line.code === '1.1.1'; }).map(function (r) { return r.a.no; });
    var setOk = cashSet.join() === sbt111.join();
    var bad = res.filter(function (r) { return r.issues.length; });
    var body = '<div class="stack">' +
      (errs || !setOk ? ui.errList([{ code: 'gl.year_close_unmapped_accounts', message: errs + ' бичилттэй данс харгалзаагүй' + (setOk ? '' : '; МГТ-ийн мөнгөний данс ≠ СБТ 1.1.1') }], 'Маягт А-гийн харгалзаа: алдаатай') :
        '<div class="banner">' + ui.pill('OK') + ' Бичилттэй бүх ' + res.filter(function (r) { return r.used; }).length + ' данс СБТ/ОДТ-ийн мөр ба МГТ ангилалд харгалзсан; мөр бүрийн шүүлтүүр дансаа агуулж байна. Мөнгөний дансны олонлог (CASH_TRANSFER) = СБТ 1.1.1 (' + cashSet.join(', ') + ').</div>') +
      '<p class="small">Шалгасан: ' + res.length + ' бичилтийн данс, огноо ≤ ' + ui.date(to) + '. Дүрэм: FR-GL-002 AC1, BR-PER-33 (а)(б)(в). Сарын хаалтын шалгах хуудсын <code>FORM_A_MAPPING</code> мөр ижил шалгалтыг BLOCKING-оор ажиллуулна.</p>' +
      (bad.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Нэр</th><th>Бичилт</th><th>Асуудал</th></tr></thead><tbody>' +
        bad.map(function (r) { return '<tr><td class="code">' + r.a.no + '</td><td>' + ui.esc(r.a.name) + '</td><td class="num">' + r.used + '</td><td>' + ui.esc(r.issues.join('; ')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      '<details class="calc"><summary>Тооцоог харах: данс бүрийн мөр ба шүүлтүүр</summary><div class="calc-body"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Мөр</th><th>Мөрийн нэр</th><th>Шүүлтүүр</th><th>Орох уу</th><th>МГТ</th><th class="num">Бичилт</th></tr></thead><tbody>' +
      res.map(function (r) { return '<tr><td class="code">' + r.a.no + '</td><td class="code">' + (r.line ? r.line.report + ' ' + r.line.code : '—') + '</td><td>' + ui.esc(r.line ? r.line.name : '') + '</td><td class="code">' + ui.esc(r.line ? r.line.filter || '' : '') + '</td><td>' + (r.issues.length ? '✕' : '✓') + '</td><td class="code">' + ui.esc(r.a.cf || '—') + '</td><td class="num">' + r.used + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></details></div>';
    var m = ui.modal({ title: 'Маягт А-гийн шалгалт', wide: true, body: body });
    app.decorateNotes(m.el);
  }

  // ===========================================================================
  // #journal — Ерөнхий журнал (S-GL-03), preview (S-GL-08), transactions + reversal (S-GL-07)
  // ===========================================================================
  var BATCHES = [
    { id: 'GENERAL.DEFAULT', tmpl: 'GENERAL', label: 'GENERAL · Үндсэн', series: 'GJ', source: 'GENJNL' },
    { id: 'CASH_RECEIPT.BANK', tmpl: 'CASH_RECEIPT', label: 'CASH_RECEIPT · Банкны орлого', series: 'BR', source: 'CASHRECJNL' },
    { id: 'CASH_RECEIPT.CASH', tmpl: 'CASH_RECEIPT', label: 'CASH_RECEIPT · Кассын орлого (МХ-1)', series: 'KO', source: 'CASHRECJNL', balBank: 'CASH01' },
    { id: 'PAYMENT.BANK', tmpl: 'PAYMENT', label: 'PAYMENT · Банкны зарлага', series: 'BP', source: 'PAYMENTJNL' },
    { id: 'PAYMENT.CASH', tmpl: 'PAYMENT', label: 'PAYMENT · Кассын зарлага (МХ-2)', series: 'KZ', source: 'PAYMENTJNL', balBank: 'CASH01' },
    { id: 'OPENING.DEFAULT', tmpl: 'OPENING', label: 'OPENING · Эхний үлдэгдэл', series: 'OB', source: 'OPENING', reason: 'OPENING' }
  ];
  var LINE_TYPES = [['GL', 'Данс'], ['CUSTOMER', 'Харилцагч'], ['VENDOR', 'Нийлүүлэгч'], ['BANK', 'Мөнгөний данс']];
  var JNL = null;
  var jnlKeyHandler = null;

  function nextDraftNo() { JNL.counter += 1; return 'J-' + String(JNL.counter).padStart(6, '0'); }
  function mkLine(date, docNo, type, no, desc, debit, credit, extra) {
    var l = { uid: ++JNL.uid, date: date, docNo: docNo, type: type, no: no || '', desc: desc || '', debit: debit || '', credit: credit || '', vat: '', applyTo: null, extDoc: '', due: null };
    if (extra) Object.keys(extra).forEach(function (k) { l[k] = extra[k]; });
    return l;
  }
  function jnl() {
    if (JNL) return JNL;
    JNL = { counter: DATA.draftCounters.JNL_DRAFT, uid: 0, lines: {}, posted: [] };
    BATCHES.forEach(function (b) { JNL.lines[b.id] = []; });
    var t = today(), y1 = E().dates.addDays(t, -1);
    var a = nextDraftNo(), b = nextDraftNo();
    JNL.lines['GENERAL.DEFAULT'] = [
      mkLine(y1, a, 'GL', '7214', 'Принтерийн засварын сэлбэг (НӨАТ-тай)', '330000.00', '', { vat: 'PURCHASE|DOMESTIC|VAT10' }),
      mkLine(y1, a, 'VENDOR', 'V00004', 'Бөөний Техник Хангамж — БТХ-26-201', '', '330000.00', { extDoc: 'БТХ-26-201' }),
      mkLine(t, b, 'GL', '7230', 'Аудитын үйлчилгээний хуримтлал (3-р улирал)', '450000.00', ''),
      mkLine(t, b, 'GL', '2600', 'Нөөц: аудитын төлбөр', '', '450000.00')
    ];
    var open = st().cle.filter(function (e) { return e.open && e.documentType === 'INVOICE' && !e.reversed && e.remaining > 0; })
      .sort(function (x, y) { return x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : 0; });
    var tgt = open.filter(function (e) { return e.customer === 'C00004'; })[0] || open[0];
    if (tgt) {
      var c = nextDraftNo(), cust = E().setup.customer(tgt.customer);
      JNL.lines['CASH_RECEIPT.BANK'] = [
        mkLine(t, c, 'BANK', 'GOLOMT01', 'Төлбөр ' + cust.name + ' — ' + tgt.documentNo, plain(tgt.remaining), ''),
        mkLine(t, c, 'CUSTOMER', tgt.customer, 'Төлбөр ' + tgt.documentNo, '', plain(tgt.remaining), { applyTo: tgt.entryNo })
      ];
    }
    var d = nextDraftNo();
    JNL.lines['CASH_RECEIPT.CASH'] = [
      mkLine(t, d, 'BANK', 'CASH01', 'Эзнээс авсан богино хугацаат зээл (бэлнээр)', '500000.00', ''),
      mkLine(t, d, 'GL', '2420', 'Б. Наранбаатараас авсан зээл', '', '500000.00')
    ];
    var e2 = nextDraftNo();
    JNL.lines['PAYMENT.BANK'] = [
      mkLine(E().dates.addDays(t, -3), e2, 'GL', '2200', 'Цалин олгосон: 9-р сар', '1433700.00', ''),
      mkLine(E().dates.addDays(t, -3), e2, 'BANK', 'KHAN01', 'Цалин олгосон: 9-р сар', '', '1433700.00')
    ];
    var f2 = nextDraftNo();
    JNL.lines['PAYMENT.CASH'] = [
      mkLine(t, f2, 'GL', '7213', 'Принтерийн цаас (бэлнээр)', '25000.00', ''),
      mkLine(t, f2, 'BANK', 'CASH01', 'Принтерийн цаас', '', '25000.00')
    ];
    return JNL;
  }
  function curBatch(ctx) {
    var id = ctx.glBatch || LS.get('ui:gl:batch', 'GENERAL.DEFAULT');
    var b = BATCHES.filter(function (x) { return x.id === id; })[0] || BATCHES[0];
    ctx.glBatch = b.id;
    return b;
  }
  function lineAmt(l) { var d = parseAmt(l.debit), c = parseAmt(l.credit); return (isNaN(d) || isNaN(c)) ? NaN : d - c; }
  function isEmptyLine(l) { return !l.no && !parseAmt(l.debit) && !parseAmt(l.credit); }      // BR-PST-10
  function partyName(type, no) {
    if (!no) return '';
    if (type === 'GL') { var a = acc(no); return a ? a.name : ''; }
    if (type === 'CUSTOMER') { var c = E().setup.customer(no); return c ? c.name : ''; }
    if (type === 'VENDOR') { var v = E().setup.vendor(no); return v ? v.name : ''; }
    var bk = E().setup.bank(no); return bk ? bk.name : '';
  }
  function glAccountOf(l) {
    if (!l.no) return null;
    if (l.type === 'GL') return l.no;
    if (l.type === 'CUSTOMER') { var c = E().setup.customer(l.no); return c ? E().setup.receivablesAccount(c.cpg) : null; }
    if (l.type === 'VENDOR') { var v = E().setup.vendor(l.no); return v ? E().setup.payablesAccount(v.vpg) : null; }
    return E().setup.bankGlAccount(l.no);
  }
  function vatOptions() {                                   // NORMAL VAT setups of the DOMESTIC business group (05 §6.4)
    var out = [];
    DATA.vatPostingSetup.forEach(function (r) {
      if (r[0] !== 'DOMESTIC' || r[2] !== 'NORMAL') return;
      ['PURCHASE', 'SALE'].forEach(function (t) { out.push({ v: t + '|DOMESTIC|' + r[1], label: (t === 'PURCHASE' ? 'Худалдан авалт' : 'Борлуулалт') + ' · ' + DATA.vatProdGroups[r[1]] }); });
    });
    return out;
  }
  function vatSplit(A, vatKey) {                           // gross method: VAT = r(A × r / (100 + r)), base = A − VAT
    var p = vatKey.split('|');
    var s = E().setup.vatSetup(p[1], p[2]);
    var pct = s ? s.pct : 0;
    var vat = pct ? Number(E().money.roundDiv(BigInt(A) * BigInt(pct), BigInt(100 + pct))) : 0;
    return { type: p[0], bus: p[1], prod: p[2], setup: s, pct: pct, vat: vat, base: A - vat };
  }
  function vouchersOf(lines) {                             // BR-PST-21: (document_no, posting_date) → voucher
    var g = {}, order = [];
    lines.forEach(function (l, i) {
      if (isEmptyLine(l)) return;
      var k = l.docNo + '|' + l.date;
      if (!g[k]) { g[k] = { key: k, docNo: l.docNo, date: l.date, idx: [], sum: 0, dr: 0, cr: 0, bad: false, first: i }; order.push(k); }
      var a = lineAmt(l);
      g[k].idx.push(i);
      if (isNaN(a)) g[k].bad = true; else { g[k].sum += a; g[k].dr += dr(a); g[k].cr += cr(a); }
    });
    return order.map(function (k) { return g[k]; }).sort(function (x, y) {   // BR-PST-27: date, draft no, first line
      return x.date !== y.date ? (x.date < y.date ? -1 : 1) : x.docNo !== y.docNo ? (x.docNo < y.docNo ? -1 : 1) : x.first - y.first;
    });
  }

  function buildJournal(b, lines) {
    var errors = [], warnings = [], lineErr = {};
    var addE = function (i, code, msg) { errors.push({ code: code, message: (i !== null ? 'Мөр ' + (i + 1) + ': ' : '') + msg, line: i }); if (i !== null) lineErr[i] = true; };
    var live = lines.filter(function (l) { return !isEmptyLine(l); });
    if (!live.length) errors.push({ code: 'gl.journal_empty', message: 'Багцад батлах мөр алга (BR-PST-62).' });
    lines.forEach(function (l, i) {
      if (isEmptyLine(l)) return;
      if (!l.date) addE(i, 'gl.posting_date_required', 'бүртгэлийн огноо заавал (BR-PST-11).');
      if (!l.docNo || !l.docNo.trim()) addE(i, 'gl.document_no_required', 'баримтын дугаар заавал (BR-PST-11).');
      if (!l.no) addE(i, 'gl.account_required', 'данс сонгоно уу (BR-PST-12).');
      var a = lineAmt(l);
      if (isNaN(a)) addE(i, 'ui.amount_invalid', 'дүн буруу хэлбэртэй.');
      else if (a === 0) addE(i, 'gl.amount_zero', 'дүн 0 мөр батлагдахгүй (FR-GL-006 AC3, BR-PST-13).');
      if (l.vat && l.type !== 'GL') addE(i, 'gl.vat_group_not_allowed', 'НӨАТ-ын бүлэг зөвхөн "Данс" төрлийн мөрөнд (BR-PST-16).');
      if (l.applyTo && l.type !== 'CUSTOMER' && l.type !== 'VENDOR') addE(i, 'gl.applies_to_not_allowed', 'тулгах баримт зөвхөн харилцагч/нийлүүлэгчийн мөрөнд (BR-PST-14).');
      var ga = glAccountOf(l), acct = ga ? acc(ga) : null;
      if (acct && !isNaN(a) && a !== 0 && l.type === 'GL' && ((acct.side === 'D' && a < 0) || (acct.side === 'C' && a > 0)))
        warnings.push({ code: 'W-01', message: 'Мөр ' + (i + 1) + ': ' + acct.no + ' "' + acct.name + '" хэвийн тал ' + SIDE_LABEL[acct.side] + ', харин ' + (a > 0 ? 'дебит' : 'кредит') + ' бичигдэнэ (FR-GL-005, батлахыг зогсоохгүй).' });
    });
    var groups = vouchersOf(lines);
    var vouchers = [], vatCalc = [];
    groups.forEach(function (g, gi) {
      if (!g.bad && g.sum !== 0) {
        errors.push({ code: 'gl.voucher_unbalanced', message: 'Баримт ' + g.docNo + ' (' + ui.date(g.date) + ') тэнцэхгүй: Дт ' + fmtM(g.dr) + ' − Кт ' + fmtM(g.cr) + ' = зөрүү ' + fmtM(g.sum) + ' (FR-GL-007, D-C5).' });
        g.idx.forEach(function (i) { lineErr[i] = true; });
      }
      var gl = [], vat = [], cle = [], vle = [], ble = [];
      var partners = {};
      g.idx.forEach(function (i) { var l = lines[i]; if ((l.type === 'CUSTOMER' || l.type === 'VENDOR') && l.no) partners[l.type + ':' + l.no] = l; });
      var pk = Object.keys(partners);
      var hasVat = g.idx.some(function (i) { return lines[i].vat && lines[i].type === 'GL'; });
      if (hasVat && pk.length > 1) errors.push({ code: 'gl.vat_multiple_partners', message: 'Баримт ' + g.docNo + ': НӨАТ-тай ваучерт нэгээс олон харилцагч/нийлүүлэгч байж болохгүй (BR-PST-23).' });
      var partner = pk.length === 1 ? partners[pk[0]] : null;
      var pParty = partner ? (partner.type === 'CUSTOMER' ? E().setup.customer(partner.no) : E().setup.vendor(partner.no)) : null;
      g.idx.forEach(function (i) {
        var l = lines[i], A = lineAmt(l), k = 'L' + i;
        if (isNaN(A) || A === 0 || !l.no) return;
        var desc = l.desc || '';
        if (l.type === 'GL') {
          if (l.vat) {
            var vs = vatSplit(A, l.vat);
            if (!vs.setup) { addE(i, 'tax.vat_setup_missing', 'VAT Posting Setup олдсонгүй.'); return; }
            gl.push({ key: k, acc: l.no, amount: vs.base, origin: 'USER', desc: desc, genPostingType: vs.type, genBus: 'DOMESTIC', vatBus: vs.bus, vatProd: vs.prod, vatAmount: vs.vat });
            var vAcc = vs.type === 'SALE' ? vs.setup.salesAcc : vs.setup.purchAcc;
            if (vs.vat !== 0) gl.push({ key: k + 'V', acc: vAcc, amount: vs.vat, origin: 'SYSTEM', desc: 'НӨАТ: ' + desc });
            vat.push({ glKey: k, type: vs.type, base: vs.base, amount: vs.vat, vatBus: vs.bus, vatProd: vs.prod, category: vs.setup.category, calcType: vs.setup.calcType,
              pct: vs.pct, taxType: vs.setup.taxType, partyNo: pParty ? pParty.no : null, partyTin: pParty ? pParty.tin : null, deductibleConfirmed: false });
            vatCalc.push({ line: i, docNo: g.docNo, A: A, vs: vs, vAcc: vAcc, acc: l.no });
          } else gl.push({ key: k, acc: l.no, amount: A, origin: 'USER', desc: desc });
        } else if (l.type === 'BANK') {
          var bank = E().setup.bank(l.no);
          gl.push({ key: k, acc: E().setup.bankGlAccount(l.no), amount: A, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: l.no, desc: desc });
          ble.push({ glKey: k, bank: l.no, amount: A, description: desc, party: pParty ? pParty.name : null,
            cashVoucher: bank.kind === 'CASH' && b.source !== 'OPENING' ? (A > 0 ? 'KO' : 'KZ') : null });   // 05 §5.4.4: OB cash needs no МХ
        } else if (l.type === 'CUSTOMER') {
          var c = E().setup.customer(l.no);
          gl.push({ key: k, acc: E().setup.receivablesAccount(c.cpg), amount: A, origin: 'SYSTEM', sourceType: 'CUSTOMER', sourceNo: c.no, desc: desc });
          cle.push({ glKey: k, customer: c.no, docType: A >= 0 ? 'INVOICE' : 'PAYMENT', amount: A, dueDate: l.due || g.date, cpg: c.cpg, description: desc, extDoc: l.extDoc || null, applyTo: l.applyTo || null });
        } else if (l.type === 'VENDOR') {
          var v = E().setup.vendor(l.no);
          gl.push({ key: k, acc: E().setup.payablesAccount(v.vpg), amount: A, origin: 'SYSTEM', sourceType: 'VENDOR', sourceNo: v.no, desc: desc });
          vle.push({ glKey: k, vendor: v.no, docType: A <= 0 ? 'INVOICE' : 'PAYMENT', amount: A, dueDate: l.due || g.date, vpg: v.vpg, description: desc, vendorInvoiceNo: l.extDoc || null, applyTo: l.applyTo || null });
        }
      });
      var firstDesc = g.idx.map(function (i) { return lines[i].desc; }).filter(Boolean)[0] || b.label;
      vouchers.push({ key: 'V' + (gi + 1), draftNo: g.docNo, postingDate: g.date, documentType: b.tmpl === 'GENERAL' || b.tmpl === 'OPENING' ? 'NONE' : 'PAYMENT',
        docSeries: b.series, description: firstDesc, reasonCode: b.reason || null, gl: gl, vat: vat, cle: cle, vle: vle, ble: ble });
    });
    return { doc: { sourceCode: b.source, description: b.label, vouchers: vouchers }, errors: errors, warnings: warnings, groups: groups, lineErr: lineErr, vatCalc: vatCalc };
  }

  function jnlCalcBody(b, lines, built) {
    var html = '<p><strong>1. Тэмдэг</strong> (UX-JNL-02, D-C3): Дебит x → <code>amount = +x</code>, Кредит x → <code>amount = −x</code>. G/L-д зөвхөн тэмдэгтэй дүн хадгалагдана; дебит/кредит багана нь тэмдгээс гарна (storno-гүй).</p>';
    html += '<p><strong>2. Ваучер</strong> = (баримтын дугаар, огноо) (BR-PST-21); ваучер бүрд Σ amount = 0 (BR-PST-22, хүлцэлгүй).</p><div class="table-wrap"><table class="grid-table"><thead><tr><th>Ноорог №</th><th>Огноо</th><th class="num">Мөр</th><th class="num">Σ Дебит</th><th class="num">Σ Кредит</th><th class="num">Σ amount</th><th></th></tr></thead><tbody>' +
      (built.groups.map(function (g) { return '<tr><td class="code">' + ui.esc(g.docNo) + '</td><td>' + ui.date(g.date) + '</td><td class="num">' + g.idx.length + '</td>' + ui.moneyCell(g.dr) + ui.moneyCell(g.cr) + ui.moneyCell(g.sum) + '<td>' + (g.bad ? '?' : g.sum === 0 ? '<span class="bal-ok">✓</span>' : '<span class="bal-bad">✕</span>') + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="empty">Мөр алга</td></tr>') +
      '</tbody></table></div>';
    if (built.vatCalc.length) {
      html += '<p><strong>3. НӨАТ — gross арга</strong> (05 §6.4, BR-PST-36/38): мөрийн дүн A нь НӨАТ орсон; НӨАТ = r(A × r / (100 + r)), суурь = A − НӨАТ (бөөрөнхийлөлтийн үлдэгдэл суурьд). Суурь мөр зардлын дансанд, НӨАТ VAT Posting Setup-ийн дансанд, нэг VAT entry үүснэ.</p>';
      built.vatCalc.forEach(function (x) {
        var exact = E().money.fmtRatio(BigInt(x.A) * BigInt(x.vs.pct), BigInt(100 + x.vs.pct), 6);
        html += '<div class="formula">Мөр ' + (x.line + 1) + ' (' + x.docNo + '): A = ' + fmtM(x.A) + ', ' + x.vs.type + ' ' + x.vs.bus + ' × ' + x.vs.prod + ' (r = ' + x.vs.pct + '%)' +
          '\nЯг НӨАТ = ' + fmtM(x.A) + ' × ' + x.vs.pct + ' / ' + (100 + x.vs.pct) + ' = ' + exact + '  →  НӨАТ = ' + fmtM(x.vs.vat) +
          '\nСуурь = ' + fmtM(x.A) + ' − ' + fmtM(x.vs.vat) + ' = ' + fmtM(x.vs.base) +
          '\nG/L: ' + x.acc + ' ' + fmtM(x.vs.base) + (x.vs.vat ? ';  ' + x.vAcc + ' ' + fmtM(x.vs.vat) : '') + '   VAT entry: ' + x.vs.type + ' суурь ' + fmtM(x.vs.base) + ', НӨАТ ' + fmtM(x.vs.vat) +
          (x.vs.type === 'PURCHASE' && x.vs.vat ? '\nОрцын НӨАТ ДДТД-гүй тул "баталгаажаагүй" (D-E4): ТТ-03а-ийн хасагдах мөрөнд ДДТД баталгаажсаны дараа орно.' : '') + '</div>';
      });
    }
    html += '<p><strong>' + (built.vatCalc.length ? 4 : 3) + '. Данс тодорхойлолт</strong> (05 §5.4.2): харилцагч → posting group-ийн авлагын данс (1200), нийлүүлэгч → өглөгийн данс (2100), мөнгөний данс → bank posting group-ийн данс (1100/1110/1111); эдгээр нь <code>SystemDerived</code> мөр тул хяналтын дансны хоригт (FR-GL-003) өртөхгүй. Дугаар: батлахад <code>' + b.series + '-' + fyYear() + '-#####</code> (D-C7).</p>';
    return html;
  }

  function renderJournal(el, ctx) {
    jnl();
    var tab = ctx.glJnlTab || 'lines';
    var html = '<div class="page-head"><div class="title-wrap"><h1>Ерөнхий журнал</h1></div></div>' +
      '<div class="tabs" role="tablist" data-note="jnl.tabs">' +
      [['lines', 'Журналын мөр'], ['posted', 'Гүйлгээ ба буцаалт']].map(function (t) { return '<button class="tab" role="tab" type="button" id="jnl-tab-' + t[0] + '" aria-selected="' + (tab === t[0]) + '" data-jtab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div><div id="jnl-body" class="stack"></div>';
    el.innerHTML = html;
    ui.$$('[data-jtab]', el).forEach(function (bt) { bt.addEventListener('click', function () { ctx.glJnlTab = bt.getAttribute('data-jtab'); rerender(); var n = ui.$('#jnl-tab-' + ctx.glJnlTab); if (n) n.focus(); }); });
    var body = ui.$('#jnl-body');
    if (tab === 'posted') renderTxTab(body, ctx); else renderLinesTab(body, ctx);
    if (!jnlKeyHandler) {
      jnlKeyHandler = function (ev) {
        if (ev.key !== 'F9' || app.current !== 'journal' || (app.ctx.glJnlTab || 'lines') !== 'lines' || document.querySelector('.overlay')) return;
        ev.preventDefault(); postJournal(app.ctx);
      };
      document.addEventListener('keydown', jnlKeyHandler);
    }
  }

  function renderLinesTab(body, ctx) {
    var b = curBatch(ctx);
    var lines = JNL.lines[b.id];
    var built = buildJournal(b, lines);
    var sel = Math.min(ctx.glJnlSel || 0, Math.max(0, lines.length - 1));
    var glAccts = E().setup.accounts().filter(function (a) { return a.type === 'POSTING' && a.direct && !a.blocked; });   // UX-JNL-04
    var vopts = vatOptions();
    var html = '<div class="card"><div class="card-body"><form class="gl-toolbar" id="jnl-form">' +
      '<div class="field grow" data-note="jnl.batch"><label for="jnl-batch">Багц (загвар · багц)</label><select class="select" id="jnl-batch">' +
      BATCHES.map(function (x) { return opt(x.id, x.label + ' — ' + x.series + '-' + fyYear() + '-#####' + (JNL.lines[x.id].length ? ' (' + JNL.lines[x.id].length + ' мөр)' : ''), x.id === b.id); }).join('') + '</select>' +
      '<span class="hint">Source code <code>' + b.source + '</code> · цуврал <code>' + b.series + '</code>' + (b.balBank ? ' · анхдагч харьцсан данс ' + b.balBank : '') + (b.reason ? ' · шалтгаан ' + b.reason : '') + '</span></div>' +
      '</form></div></div>';
    if (b.tmpl === 'OPENING') html += '<div class="banner warn" data-note="jnl.opening">Эхний үлдэгдэл аль хэдийн <code>OB-' + fyYear() + '-00001</code>-ээр ' + ui.date(DATA.company.goLiveDate) + '-нд бичигдсэн бөгөөд 1-р сар хаалттай. Энд шинээр батлахыг оролдвол хөдөлгүүр <code>gl.period_closed</code> алдаа өгнө (D-D3, D-D7). Хяналтын данс (1200, 2100, 1100…) руу шууд мөр оруулахгүй — харилцагч, нийлүүлэгч, мөнгөний дансны мөрөөр (05 §5.4.4).</div>';
    if (b.balBank) html += '<div class="banner small" data-note="jnl.cash">Кассын багц: мөнгөний мөр бүр МХ-' + (b.series === 'KO' ? '1 (KO)' : '2 (KZ)') + ' кассын баримт үүсгэнэ; касс сөрөг болох бол батлахгүй (D-G1, INV-19).</div>';
    html += '<div class="actionbar" data-note="jnl.actions">' +
      '<button class="btn primary" type="button" id="jnl-post">Батлах <span class="kbd">F9</span></button>' +
      '<button class="btn" type="button" id="jnl-preview">Урьдчилан харах</button>' +
      '<button class="btn" type="button" id="jnl-add">+ Мөр нэмэх</button>' +
      '<button class="btn danger" type="button" id="jnl-clear"' + (lines.length ? '' : ' disabled') + '>Багц цэвэрлэх</button>' +
      '<span class="small muted">Мөр санах ойд (ноорог); батлахад багц хоосорно.</span></div>';
    html += '<div id="jnl-errors"></div>';
    html += '<div class="card" data-note="jnl.lines"><div class="col-legend"><span class="muted">Багана:</span>' +
      '<span data-note="jnl.docno">Баримт № (ноорог J-…)</span><span data-note="jnl.account-type">Дансны төрөл</span><span data-note="jnl.vat">НӨАТ-ын бүлэг</span>' +
      '<span data-note="jnl.applies">Тулгах баримт</span><span data-note="jnl.normal-side"><span class="side-warn" aria-hidden="true">◐</span> хэвийн талын анхааруулга</span></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="grid-table jnl-grid"><thead><tr>' +
      '<th>Бүрт. огноо</th><th>Баримт №</th><th>Дансны төрөл</th><th>Данс</th><th>Тайлбар</th><th class="num">Дебит</th><th class="num">Кредит</th><th>НӨАТ-ын бүлэг</th><th>Тулгах баримт</th><th><span class="sr-only">Устгах</span></th></tr></thead><tbody>';
    lines.forEach(function (l, i) {
      var noOpts;
      if (l.type === 'GL') noOpts = opt('', '— данс —', !l.no) + glAccts.map(function (a) { return opt(a.no, a.no + ' ' + a.name, a.no === l.no); }).join('') + (l.no && !glAccts.some(function (a) { return a.no === l.no; }) ? opt(l.no, l.no + ' (шууд бичих боломжгүй)', true) : '');
      else if (l.type === 'CUSTOMER') noOpts = opt('', '— харилцагч —', !l.no) + DATA.customers.map(function (c) { return opt(c.no, c.no + ' ' + c.name, c.no === l.no); }).join('');
      else if (l.type === 'VENDOR') noOpts = opt('', '— нийлүүлэгч —', !l.no) + DATA.vendors.map(function (v) { return opt(v.no, v.no + ' ' + v.name, v.no === l.no); }).join('');
      else noOpts = opt('', '— мөнгөний данс —', !l.no) + DATA.bankAccounts.map(function (k) { return opt(k.no, k.no + ' ' + k.name, k.no === l.no); }).join('');
      var A = lineAmt(l), ga = glAccountOf(l), acct = ga ? acc(ga) : null;
      var sideW = l.type === 'GL' && acct && !isNaN(A) && A !== 0 && ((acct.side === 'D' && A < 0) || (acct.side === 'C' && A > 0));
      var sw = sideW ? '<span class="side-warn" title="W-01: ' + ui.esc(acct.no + ' хэвийн тал ' + SIDE_LABEL[acct.side]) + ' — зөвхөн анхааруулга (FR-GL-005)" aria-label="Хэвийн талын анхааруулга">◐</span>' : '';
      var applyCell = '—';
      if ((l.type === 'CUSTOMER' || l.type === 'VENDOR') && l.no) {
        var list = (l.type === 'CUSTOMER' ? st().cle.filter(function (e) { return e.customer === l.no; }) : st().vle.filter(function (e) { return e.vendor === l.no; }))
          .filter(function (e) { return e.open && !e.reversed && (isNaN(A) || A === 0 || Math.sign(e.remaining) !== Math.sign(A)); });
        applyCell = '<label class="sr-only" for="jl-apply-' + i + '">Тулгах баримт ' + (i + 1) + '</label><select class="select" id="jl-apply-' + i + '">' + opt('', '— тулгахгүй —', !l.applyTo) +
          list.map(function (e) { return opt(String(e.entryNo), e.documentNo + ' · ' + ui.date(e.dueDate) + ' · ' + fmtM(e.remaining), e.entryNo === l.applyTo); }).join('') + '</select>';
      }
      html += '<tr data-jl="' + i + '" class="' + (i === sel ? 'sel' : '') + (built.lineErr[i] ? ' err' : '') + '">' +
        '<td class="c-date"><label class="sr-only" for="jl-date-' + i + '">Огноо ' + (i + 1) + '</label>' + ui.dateInput('jl-date-' + i, l.date) + '</td>' +
        '<td class="c-doc"><label class="sr-only" for="jl-doc-' + i + '">Баримт № ' + (i + 1) + '</label><input class="input mono" id="jl-doc-' + i + '" value="' + ui.esc(l.docNo) + '" autocomplete="off"></td>' +
        '<td class="c-type"><label class="sr-only" for="jl-type-' + i + '">Дансны төрөл ' + (i + 1) + '</label><select class="select" id="jl-type-' + i + '">' + LINE_TYPES.map(function (t) { return opt(t[0], t[1], t[0] === l.type); }).join('') + '</select></td>' +
        '<td class="c-no"><label class="sr-only" for="jl-no-' + i + '">Данс ' + (i + 1) + '</label><select class="select" id="jl-no-' + i + '">' + noOpts + '</select></td>' +
        '<td class="c-desc"><label class="sr-only" for="jl-desc-' + i + '">Тайлбар ' + (i + 1) + '</label><input class="input" id="jl-desc-' + i + '" value="' + ui.esc(l.desc) + '"></td>' +
        '<td class="c-amt"><div class="amt-wrap">' + (A > 0 ? sw : '') + '<label class="sr-only" for="jl-dr-' + i + '">Дебит ' + (i + 1) + '</label><input class="input num mono" id="jl-dr-' + i + '" inputmode="decimal" value="' + ui.esc(l.debit) + '"></div></td>' +
        '<td class="c-amt"><div class="amt-wrap">' + (A < 0 ? sw : '') + '<label class="sr-only" for="jl-cr-' + i + '">Кредит ' + (i + 1) + '</label><input class="input num mono" id="jl-cr-' + i + '" inputmode="decimal" value="' + ui.esc(l.credit) + '"></div></td>' +
        '<td class="c-vat">' + (l.type === 'GL' ? '<label class="sr-only" for="jl-vat-' + i + '">НӨАТ-ын бүлэг ' + (i + 1) + '</label><select class="select" id="jl-vat-' + i + '">' + opt('', '— НӨАТ-гүй —', !l.vat) + vopts.map(function (o) { return opt(o.v, o.label, o.v === l.vat); }).join('') + '</select>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="c-apply">' + applyCell + '</td>' +
        '<td><button class="btn ghost sm" type="button" id="jl-del-' + i + '" aria-label="Мөр ' + (i + 1) + ' устгах">✕</button></td></tr>';
    });
    if (!lines.length) html += '<tr><td colspan="10" class="empty">Багц хоосон. "+ Мөр нэмэх" дарна уу.</td></tr>';
    html += '</tbody></table></div><div class="jnl-foot" id="jnl-foot" data-note="jnl.balance">' + footHtml(b, lines, sel) + '</div></div></div>';
    html += '<div id="jnl-calc-wrap" data-note="jnl.calc">' + ui.calc('Тооцоог харах: тэнцэл, НӨАТ, данс тодорхойлолт', jnlCalcBody(b, lines, built), 'jnl-calc') + '</div>';
    if (JNL.posted.length) {
      html += '<div class="card"><div class="card-head"><h2>Энэ сессэд батлагдсан</h2><span class="small muted">ноорог → хуулийн дугаар (UX-JNL-08)</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Багц</th><th>Ноорог №</th><th>Хуулийн дугаар</th><th>Огноо</th><th>Гүйлгээ</th><th class="num">Дүн</th></tr></thead><tbody>' +
        JNL.posted.slice().reverse().map(function (p) { return '<tr><td>' + ui.esc(p.batch) + '</td><td class="code">' + ui.esc(p.draft) + '</td><td><button type="button" class="lnk mono" data-navdoc="' + ui.esc(p.no) + '" data-navdate="' + p.date + '">' + ui.esc(p.no) + '</button></td><td>' + ui.date(p.date) + '</td><td class="code">#' + p.tx + '</td>' + ui.moneyCell(p.amount) + '</tr>'; }).join('') +
        '</tbody></table></div></div></div>';
    }
    body.innerHTML = html;
    bindLines(body, ctx, b, lines);
    if (ctx.glJnlCalcOpen) ui.$('#jnl-calc').open = true;
    ui.$('#jnl-calc').addEventListener('toggle', function () { ctx.glJnlCalcOpen = ui.$('#jnl-calc').open; });
  }

  function footHtml(b, lines, sel) {
    var l = lines[sel];
    var groups = vouchersOf(lines);
    var batchSum = groups.reduce(function (s, g) { return s + (g.bad ? 0 : g.sum); }, 0);
    var nLines = lines.filter(function (x) { return !isEmptyLine(x); }).length;
    var info = '<div><div class="lbl">Фокустай мөр</div>—</div>';
    var docInfo = '<div><div class="lbl">Баримтын тэнцэл</div>—</div>';
    if (l) {
      var ga = glAccountOf(l), a = ga ? acc(ga) : null, extra = '';
      if (l.type === 'CUSTOMER' && l.no) extra = ' · харилцагчийн үлдэгдэл ' + fmtM(E().sales.customerBalance(l.no));
      if (l.type === 'BANK' && l.no) extra = ' · ' + l.no + ' үлдэгдэл ' + fmtM(E().reports.bankBalance(l.no));
      if (l.type === 'VENDOR' && l.no) extra = ' · өглөг ' + fmtM(-st().dvle.filter(function (d) { return d.vendor === l.no; }).reduce(function (s, d) { return s + d.amount; }, 0));
      info = '<div><div class="lbl">Мөр ' + (sel + 1) + ': ' + ui.esc(partyName(l.type, l.no) || '—') + '</div>' + (a ? '<code>' + a.no + '</code> ' + ui.esc(a.name) + ' · үлдэгдэл ' + fmtM(E().reports.glBalance(a.no)) + extra : '—') + '</div>';
      var g = groups.filter(function (x) { return x.docNo === l.docNo && x.date === l.date; })[0];
      if (g) docInfo = '<div><div class="lbl">Баримтын тэнцэл (' + ui.esc(g.docNo) + ', ' + ui.date(g.date) + ')</div>' + (g.bad ? '<span class="bal-bad">дүн буруу</span>' : g.sum === 0 ? '<span class="bal-ok">0.00 ✓</span>' : '<span class="bal-bad">' + fmtM(g.sum) + ' ✕</span>') + '</div>';
    }
    return info + docInfo +
      '<div><div class="lbl">Багцын тэнцэл</div>' + (batchSum === 0 ? '<span class="bal-ok">0.00 ✓</span>' : '<span class="bal-bad">' + fmtM(batchSum) + ' ✕</span>') + '</div>' +
      '<div><div class="lbl">Мөр / ваучер</div>' + nLines + ' / ' + groups.length + '</div>';
  }

  function bindLines(body, ctx, b, lines) {
    ui.$('#jnl-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    on('jnl-batch', 'change', function (ev) { ctx.glBatch = ev.target.value; ctx.glJnlSel = 0; LS.set('ui:gl:batch', ctx.glBatch); rerender(); });
    var soft = function () {
      var built = buildJournal(b, lines);
      ui.$('#jnl-foot').innerHTML = footHtml(b, lines, Math.min(ctx.glJnlSel || 0, Math.max(0, lines.length - 1)));
      var open = ui.$('#jnl-calc').open;
      ui.$('#jnl-calc-wrap').innerHTML = ui.calc('Тооцоог харах: тэнцэл, НӨАТ, данс тодорхойлолт', jnlCalcBody(b, lines, built), 'jnl-calc');
      ui.$('#jnl-calc').open = open;
      ui.$('#jnl-calc').addEventListener('toggle', function () { ctx.glJnlCalcOpen = ui.$('#jnl-calc').open; });
      app.decorateNotes();
    };
    lines.forEach(function (l, i) {
      dateField('jl-date-' + i, l.date, function (v) { l.date = v; }, rerender);
      on('jl-doc-' + i, 'input', function (ev) { l.docNo = ev.target.value.trim(); soft(); });
      on('jl-doc-' + i, 'change', rerender);
      on('jl-type-' + i, 'change', function (ev) { l.type = ev.target.value; l.no = ''; l.applyTo = null; if (l.type !== 'GL') l.vat = ''; rerender(); });
      on('jl-no-' + i, 'change', function (ev) { l.no = ev.target.value; l.applyTo = null; if (!l.desc) l.desc = partyName(l.type, l.no); rerender(); });
      on('jl-desc-' + i, 'input', function (ev) { l.desc = ev.target.value; });
      on('jl-vat-' + i, 'change', function (ev) { l.vat = ev.target.value; rerender(); });
      on('jl-apply-' + i, 'change', function (ev) {
        l.applyTo = ev.target.value ? +ev.target.value : null;
        if (l.applyTo && !parseAmt(l.debit) && !parseAmt(l.credit)) {          // BC: applying fills the amount with the open remaining
          var e = (l.type === 'CUSTOMER' ? st().cle : st().vle).filter(function (x) { return x.entryNo === l.applyTo; })[0];
          if (e) { if (e.remaining > 0) l.credit = plain(e.remaining); else l.debit = plain(-e.remaining); }
        }
        rerender();
      });
      ['dr', 'cr'].forEach(function (side) {
        var key = side === 'dr' ? 'debit' : 'credit', other = side === 'dr' ? 'credit' : 'debit';
        on('jl-' + side + '-' + i, 'input', function (ev) { l[key] = ev.target.value; soft(); });
        on('jl-' + side + '-' + i, 'change', function () {                   // UX-JNL-02: one side only; negative moves to the other side
          var v = parseAmt(l[key]);
          if (isNaN(v)) { ui.toast('Дүнг 1234567.89 хэлбэрээр оруулна уу.', 'error'); rerender(); return; }
          if (v < 0) { l[other] = plain(-v); l[key] = ''; }
          else if (v > 0) { l[key] = plain(v); l[other] = ''; }
          else l[key] = '';
          rerender();
        });
      });
      on('jl-del-' + i, 'click', function () { lines.splice(i, 1); ctx.glJnlSel = Math.max(0, i - 1); rerender(); });
    });
    ui.$$('tr[data-jl]', body).forEach(function (tr) {
      tr.addEventListener('focusin', function () {
        var i = +tr.getAttribute('data-jl');
        if (ctx.glJnlSel === i) return;
        ctx.glJnlSel = i;
        ui.$$('tr[data-jl]', body).forEach(function (t) { t.classList.toggle('sel', t === tr); });
        ui.$('#jnl-foot').innerHTML = footHtml(b, lines, i);
        app.decorateNotes();
      });
    });
    on('jnl-add', 'click', function () {                    // UX-JNL-03: same document while unbalanced, else the next J-number
      var last = lines[lines.length - 1];
      var groups = vouchersOf(lines);
      var lg = last ? groups.filter(function (g) { return g.docNo === last.docNo && g.date === last.date; })[0] : null;
      var same = last && lg && lg.sum !== 0;
      var nl = mkLine(last ? last.date : today(), same ? last.docNo : nextDraftNo(), 'GL', '', '', '', '');
      if (same) { if (lg.sum > 0) nl.credit = plain(lg.sum); else nl.debit = plain(-lg.sum); }
      if (b.balBank && !same) nl.type = 'GL';
      lines.push(nl);
      ctx.glJnlSel = lines.length - 1;
      rerender();
      var n = ui.$('#jl-no-' + (lines.length - 1)); if (n) n.focus();
    });
    on('jnl-clear', 'click', function () {
      ui.confirm({ title: 'Багц цэвэрлэх', body: '<p>' + ui.esc(b.label) + ' багцын ' + lines.length + ' мөрийг устгах уу? Ноорог тул хуулийн дугаарт нөлөөлөхгүй.</p>', ok: 'Цэвэрлэх', danger: true })
        .then(function (ok) { if (!ok) return; lines.splice(0, lines.length); ctx.glJnlSel = 0; rerender(); });
    });
    on('jnl-preview', 'click', function () { previewJournal(ctx); });
    on('jnl-post', 'click', function () { postJournal(ctx); });
    bindNav(body);
  }

  function showJnlErrors(errors, warnings) {
    var box = document.getElementById('jnl-errors');
    if (box) { box.innerHTML = ui.errList(errors) + ui.warnList(warnings); box.scrollIntoView({ block: 'nearest' }); }
    ui.toast('Батлах боломжгүй: ' + errors.length + ' алдаа', 'error');
  }
  function relNumber(res) {                                // BR-PST-52: preview shows relative entry numbers
    var n = 0, list = [];
    res.vouchers.forEach(function (v, vi) { v.gl.forEach(function (e) { var c = Object.assign({}, e); c._rel = ++n; c.transactionNo = null; c._v = vi; list.push(c); }); });
    return list;
  }
  function previewTabs(res, b) {
    var gl = relNumber(res), vat = [], cle = [], vle = [], ble = [], cv = [];
    res.vouchers.forEach(function (v) { vat = vat.concat(v.vat); cle = cle.concat(v.cle); vle = vle.concat(v.vle); ble = ble.concat(v.ble); if (v.cashVoucher) cv.push(v.cashVoucher); });
    var t = {};
    t.gl = glTable(gl, { relative: true, noTx: true, noLinks: true });
    t.vat = vat.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Төрөл</th><th>Бүлэг</th><th>Ангилал</th><th class="num">%</th><th class="num">Суурь</th><th class="num">НӨАТ</th><th>taxType</th><th>Баталгаажсан</th></tr></thead><tbody>' +
      vat.map(function (e) { return '<tr><td>' + e.type + '</td><td class="code">' + e.vatBus + ' × ' + e.vatProd + '</td><td>' + e.category + '</td><td class="num">' + e.pct + '</td>' + ui.moneyCell(e.base) + ui.moneyCell(e.amount) + '<td class="code">' + e.taxType + '</td><td>' + (e.deductibleConfirmed ? 'Тийм' : 'Үгүй (ДДТД хүлээгдэнэ)') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">НӨАТ-ын бичилт үүсэхгүй.</p>';
    var sub = function (rows, kind) {
      return rows.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>' + (kind === 'C' ? 'Харилцагч' : 'Нийлүүлэгч') + '</th><th>Төрөл</th><th class="num">Дүн</th><th class="num">Үлдэгдэл</th><th>Төлөх огноо</th></tr></thead><tbody>' +
        rows.map(function (e) { var p = kind === 'C' ? E().setup.customer(e.customer) : E().setup.vendor(e.vendor); return '<tr><td>' + ui.esc(p.name) + '</td><td>' + e.documentType + '</td>' + ui.moneyCell(e.amount) + ui.moneyCell(e.remaining) + '<td>' + ui.date(e.dueDate) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="xs muted">Тулгах баримт заасан бол батлах үед ижил гүйлгээнд тулгагдана (application entry, BR-AR-25).</p>' : '<p class="muted">Бичилт үүсэхгүй.</p>';
    };
    t.cle = sub(cle, 'C'); t.vle = sub(vle, 'V');
    t.bank = ble.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөнгөний данс</th><th>Тайлбар</th><th class="num">Дүн</th><th>МХ баримт</th></tr></thead><tbody>' +
      ble.map(function (x) { return '<tr><td>' + ui.esc(E().setup.bank(x.bank).name) + '</td><td>' + ui.esc(x.description) + '</td>' + ui.moneyCell(x.amount) + '<td class="code">' + ui.esc(x.cashVoucherNo || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">Банк, кассын бичилт үүсэхгүй.</p>';
    return { t: t, tabs: [['gl', 'Ерөнхий дэвтэр', gl.length], ['vat', 'НӨАТ', vat.length], ['cle', 'Харилцагч', cle.length], ['vle', 'Нийлүүлэгч', vle.length], ['bank', 'Банк/касс', ble.length]] };
  }
  function tabbedModal(title, intro, pt, footer, extra) {
    var body = '<div class="stack">' + intro +
      '<div class="tabs" role="tablist">' + pt.tabs.map(function (x, i) { return '<button class="tab" role="tab" type="button" id="pv-tab-' + x[0] + '" aria-selected="' + (i === 0) + '" data-pv="' + x[0] + '">' + x[1] + ' <span class="count">(' + x[2] + ')</span></button>'; }).join('') + '</div>' +
      '<div id="pv-body">' + pt.t.gl + '</div>' + (extra || '') + '</div>';
    var m = ui.modal({ title: title, wide: true, body: body, footer: footer });
    ui.$$('[data-pv]', m.el).forEach(function (bt) {
      bt.addEventListener('click', function () {
        ui.$$('[data-pv]', m.el).forEach(function (x) { x.setAttribute('aria-selected', String(x === bt)); });
        ui.$('#pv-body', m.el).innerHTML = pt.t[bt.getAttribute('data-pv')];
      });
    });
    app.decorateNotes(m.el);
    return m;
  }
  function previewJournal(ctx) {
    var b = curBatch(ctx), lines = JNL.lines[b.id];
    var built = buildJournal(b, lines);
    if (built.errors.length) { rerender(); showJnlErrors(built.errors, built.warnings); return; }
    var r = E().post(built.doc, { preview: true });
    if (!r.ok) { showJnlErrors(r.errors, built.warnings); return; }
    var pt = previewTabs(r.result, b);
    tabbedModal('Батлахын өмнө харах — ' + b.label,
      '<div data-note="jnl.preview">' + ui.warnList(built.warnings) + '<p class="small">' + r.result.vouchers.length + ' ваучер · дугаар <code>***</code> (хуулийн дугаар зөвхөн батлахад, BR-PST-52). Урьдчилан харах нь батлахтай ижил код (engine.post) — дараа нь бүх өөрчлөлтийг буцаана (ROLLBACK, D-C6); дугаар зарцуулагдахгүй.</p></div>',
      pt, [{ label: 'Хаах' }, { label: 'Батлах', kind: 'primary', onClick: function (close) { close(true); postJournal(ctx); } }],
      ui.calc('Тооцоог харах: тэнцэл ба НӨАТ', jnlCalcBody(b, lines, built)));
  }
  function postJournal(ctx) {
    var b = curBatch(ctx), lines = JNL.lines[b.id];
    var built = buildJournal(b, lines);
    if (built.errors.length) { rerender(); showJnlErrors(built.errors, built.warnings); return; }
    var pre = E().post(built.doc, { preview: true });
    if (!pre.ok) { showJnlErrors(pre.errors, built.warnings); return; }
    var total = built.groups.reduce(function (s, g) { return s + g.dr; }, 0);
    ui.confirm({ title: 'Журнал батлах уу?', ok: 'Батлах',
      body: '<p><strong>' + ui.esc(b.label) + '</strong>: ' + built.groups.length + ' ваучер, нийт дебит ' + fmtM(total, { sym: true }) + '.</p>' +
        '<p>Ваучер бүр <code>' + b.series + '-' + fyYear() + '-#####</code> завсаргүй дугаар авч, G/L' + (built.vatCalc.length ? ', НӨАТ' : '') + ' болон дэд дэвтрийн бичилт нэг гүйлгээнд бичигдэнэ. Дараа нь засахгүй — зөвхөн буцаалтаар (D-D5).</p>' + ui.warnList(built.warnings) })
      .then(function (ok) {
        if (!ok) return;
        var r = E().post(built.doc);
        if (!r.ok) { showJnlErrors(r.errors, built.warnings); return; }
        var map = r.result.vouchers.map(function (v, i) {
          var V = built.doc.vouchers[i];
          var amt = v.gl.reduce(function (s, e) { return s + dr(e.amount); }, 0);
          JNL.posted.push({ batch: b.label, draft: V.draftNo, no: v.documentNo, date: v.postingDate, tx: v.transactionNo, amount: amt });
          return v.documentNo + ' (' + V.draftNo + ')';
        });
        lines.splice(0, lines.length);
        ctx.glJnlSel = 0;
        ui.toast(r.result.vouchers.length + ' ваучер батлагдлаа: <strong>' + ui.esc(map.join(', ')) + '</strong>');
        rerender();
      });
  }

  // ---- transactions + reversal (S-GL-07, D-D5) -------------------------------
  function reverseBlockers(tx, reason) {
    var S = st(), errs = [];
    var REV = E().ledger.reversibleSources;
    if (tx.sourceCode === 'REVERSAL' || tx.reversesTx) errs.push({ code: 'gl.reversal_not_reversible', message: 'Буцаалтыг дахин буцаахгүй (BR-PST-45, BR-PST-50).' });
    else if (tx.sourceCode === 'SALES' || tx.sourceCode === 'PURCHASES') errs.push({ code: 'gl.reversal_use_credit_memo', message: 'Баримтаас үүссэн гүйлгээ — кредит нотоор засна (D-D5, FR-GL-013 AC2).' });
    else if (tx.sourceCode === 'CLSINCOME') errs.push({ code: 'gl.closing_transaction_not_reversible', message: 'Жилийн хаалтыг буцаахгүй; дахин ажиллуулж зөрүүг бичнэ (BR-YEC-13).' });
    else if (REV.indexOf(tx.sourceCode) < 0) errs.push({ code: 'gl.reversal_not_reversible', message: 'Source ' + tx.sourceCode + ' нийтийн буцаалтгүй (05 §3.7).' });
    if (tx.reversed) errs.push({ code: 'gl.transaction_already_reversed', message: 'Аль хэдийн буцаагдсан (INV-22).' });
    var p = E().periods.of(tx.postingDate);
    if (!p || p.status !== 'OPEN') errs.push({ code: 'gl.period_closed', message: (p ? ymLabel(p.period) + ' ' + ui.pillLabel(p.status).toLowerCase() : 'Үе алга') + ' — эх огноогоор буцаахгүй; одоогийн нээлттэй үед залруулах журнал хийнэ (BR-PST-51, FR-GL-014).' });
    var sub = S.cle.filter(function (e) { return e.transactionNo === tx.transactionNo; }).concat(S.vle.filter(function (e) { return e.transactionNo === tx.transactionNo; }));
    if (sub.some(function (e) { return e.remaining !== e.amount; })) errs.push({ code: 'gl.reversal_entries_applied', message: 'Харилцагч/нийлүүлэгчийн бичилт тулгагдсан — эхлээд тулгалтыг буцаана (BR-PST-46).' });
    if (S.vatEntries.some(function (v) { return v.transactionNo === tx.transactionNo && v.closed; })) errs.push({ code: 'gl.reversal_vat_settled', message: 'НӨАТ-ын хаалтад орсон (FR-GL-013 AC3, BR-TAX-34).' });
    if (S.ble.some(function (x) { return x.transactionNo === tx.transactionNo && x.statementStatus === 'CLOSED'; })) errs.push({ code: 'bank.reversal_statement_matched', message: 'Банкны хуулгаар тулгагдсан бичилттэй (BR-PST-46).' });
    if (!reason) errs.push({ code: 'gl.reason_code_required', message: 'Шалтгааны код заавал (FR-GL-013).' });
    return errs;
  }
  function reverseTx(txNo, reason, opts) {                 // ENGINE GAP G2: mirror G/L + VAT + customer/vendor + bank (BR-PST-47/49)
    opts = opts || {};
    var S = st();
    var tx = S.transactions.filter(function (t) { return t.transactionNo === txNo; })[0];
    if (!tx) return { ok: false, errors: [{ code: 'api.resource_not_found', message: 'Гүйлгээ олдсонгүй.' }] };
    var errs = reverseBlockers(tx, reason);
    if (errs.length) return { ok: false, errors: errs };
    var gls = S.glEntries.filter(function (e) { return e.transactionNo === txNo; }).sort(function (a, b) { return b.entryNo - a.entryNo; });
    var keyOf = {};
    gls.forEach(function (e, i) { keyOf[e.entryNo] = 'R' + i; });
    var pre = 'Буцаалт: ';
    var V = { key: 'V1', postingDate: tx.postingDate, documentType: tx.documentType, documentNo: tx.documentNo, description: pre + tx.description, reasonCode: reason,
      gl: gls.map(function (e, i) {
        return { key: 'R' + i, acc: e.account, amount: -e.amount, origin: 'SYSTEM', desc: pre + e.description, genPostingType: e.genPostingType, genBus: e.genBus, genProd: e.genProd,
          vatBus: e.vatBus, vatProd: e.vatProd, vatAmount: -e.vatAmount, sourceType: e.sourceType, sourceNo: e.sourceNo };
      }),
      vat: S.vatEntries.filter(function (v) { return v.transactionNo === txNo; }).map(function (v) {
        return { glKey: keyOf[v.glEntryNo] || null, type: v.type, base: -v.base, amount: -v.amount, vatBus: v.vatBus, vatProd: v.vatProd, category: v.category, calcType: v.calcType,
          pct: v.pct, taxType: v.taxType, partyNo: v.partyNo, partyTin: v.partyTin, deductibleConfirmed: v.deductibleConfirmed, supplierDdtd: v.supplierDdtd, vatDate: v.vatDate };
      }),
      cle: S.cle.filter(function (c) { return c.transactionNo === txNo; }).map(function (c) {
        return { glKey: keyOf[c.glEntryNo] || null, customer: c.customer, docType: c.documentType, amount: -c.amount, dueDate: c.dueDate, cpg: c.cpg, description: pre + c.description, applyTo: c.entryNo };
      }),
      vle: S.vle.filter(function (c) { return c.transactionNo === txNo; }).map(function (c) {
        return { glKey: keyOf[c.glEntryNo] || null, vendor: c.vendor, docType: c.documentType, amount: -c.amount, dueDate: c.dueDate, vpg: c.vpg, description: pre + c.description, applyTo: c.entryNo };
      }),
      ble: S.ble.filter(function (x) { return x.transactionNo === txNo; }).map(function (x) {
        return { glKey: keyOf[x.glEntryNo] || null, bank: x.bank, amount: -x.amount, description: pre + x.description, party: x.party };
      }) };
    var r = E().post({ sourceCode: 'REVERSAL', description: V.description, vouchers: [V] }, { preview: !!opts.preview });
    if (!r.ok || opts.preview) return r;
    var newTx = r.result.vouchers[0].transactionNo;       // fn_ledger_update equivalent: only reversed* flags (D-C4, INV-22, INV-30)
    tx.reversed = true;
    S.transactions.filter(function (t) { return t.transactionNo === newTx; }).forEach(function (t) { t.reversesTx = txNo; });
    var inOld = function (e) { return e.transactionNo === txNo; }, inNew = function (e) { return e.transactionNo === newTx; };
    S.glEntries.filter(inOld).forEach(function (e) { e.reversed = true; e.reversedByTx = newTx; });
    S.glEntries.filter(inNew).forEach(function (e) { e.reversed = true; e.reversesTx = txNo; });
    S.vatEntries.filter(function (e) { return inOld(e) || inNew(e); }).forEach(function (e) { e.reversed = true; });
    S.cle.filter(function (e) { return inOld(e) || inNew(e); }).forEach(function (e) { e.reversed = true; });
    S.vle.filter(function (e) { return inOld(e) || inNew(e); }).forEach(function (e) { e.reversed = true; });
    S.ble.filter(function (e) { return inOld(e) || inNew(e); }).forEach(function (e) { e.reversed = true; });
    return r;
  }
  function correctionLines(tx, reason) {                   // BR-PST-51 / FR-GL-014: opposite-sign draft in the current open period
    var S = st();
    var gls = S.glEntries.filter(function (e) { return e.transactionNo === tx.transactionNo; });
    var vats = S.vatEntries.filter(function (v) { return v.transactionNo === tx.transactionNo; });
    var vatGl = {};
    vats.forEach(function (v) { if (v.amount !== 0) gls.forEach(function (e) { if (!e.sourceType && (e.account === '1300' || e.account === '2300') && e.amount === v.amount) vatGl[e.entryNo] = true; }); });
    var docNo = nextDraftNo();
    var date = today();
    var out = [];
    gls.forEach(function (e) {
      if (vatGl[e.entryNo]) return;
      var A = -(e.amount + (e.vatAmount || 0));
      var type = e.sourceType === 'CUSTOMER' ? 'CUSTOMER' : e.sourceType === 'VENDOR' ? 'VENDOR' : e.sourceType === 'BANK' ? 'BANK' : 'GL';
      var no = type === 'GL' ? e.account : e.sourceNo;
      var l = mkLine(date, docNo, type, no, 'Залруулга ' + tx.documentNo + ': ' + e.description, A > 0 ? plain(A) : '', A < 0 ? plain(-A) : '');
      if (e.vatBus && e.vatProd && e.vatAmount) l.vat = e.genPostingType + '|' + e.vatBus + '|' + e.vatProd;
      out.push(l);
    });
    return out;
  }

  function renderTxTab(body, ctx) {
    var S = st();
    var filter = ctx.glTxFilter || 'reversible';
    var q = (ctx.glTxQ || '').trim().toLowerCase();
    var sessionTx = JNL.posted.map(function (p) { return p.tx; });
    var list = S.transactions.slice().reverse().filter(function (t) {
      if (q && (t.documentNo + ' ' + t.description + ' ' + t.sourceCode).toLowerCase().indexOf(q) < 0) return false;
      if (filter === 'reversible') return reverseBlockers(t, 'REVERSAL').length === 0;
      if (filter === 'session') return sessionTx.indexOf(t.transactionNo) >= 0 || t.reversesTx;
      return true;
    });
    var shown = list.slice(0, 80);
    var html = '<div class="card"><div class="card-body"><form class="gl-toolbar" id="tx-form" data-note="jnl.tx-list">' +
      '<div class="field"><label for="tx-filter">Шүүлтүүр</label><select class="select" id="tx-filter">' +
      opt('reversible', 'Буцааж болох (нээлттэй үе, журналаас)', filter === 'reversible') + opt('session', 'Энэ сессийн журнал ба буцаалт', filter === 'session') + opt('all', 'Бүх гүйлгээ', filter === 'all') + '</select></div>' +
      '<div class="field grow"><label for="tx-q">Хайх (баримт №, тайлбар, source)</label><input class="input" id="tx-q" type="search" value="' + ui.esc(ctx.glTxQ || '') + '" autocomplete="off"></div></form></div></div>';
    html += '<div class="card"><div class="card-head"><h2>Гүйлгээ (gl_transaction)</h2><span class="small muted">' + list.length + ' олдлоо' + (list.length > shown.length ? ', эхний ' + shown.length + ' харуулав' : '') + '</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr>' +
      '<th>Гүйлгээ №</th><th>Огноо</th><th>Баримт №</th><th>Source</th><th>Тайлбар</th><th class="num">Дүн (Σ Дт)</th><th>Үе</th><th>Төлөв</th></tr></thead><tbody>' +
      (shown.map(function (t) {
        var amt = S.glEntries.filter(function (e) { return e.transactionNo === t.transactionNo; }).reduce(function (s, e) { return s + dr(e.amount); }, 0);
        var p = E().periods.of(t.postingDate);
        return '<tr class="clickable' + (t.transactionNo === ctx.glTxNo ? ' sel' : '') + (t.reversed ? ' is-reversed' : '') + '" tabindex="0" data-tx="' + t.transactionNo + '"><td class="code">#' + t.transactionNo + '</td><td>' + ui.date(t.postingDate) + '</td><td class="code">' + ui.esc(t.documentNo) + '</td>' +
          '<td class="code" title="' + ui.esc(SRC_LABEL[t.sourceCode] || '') + '">' + t.sourceCode + '</td><td>' + ui.esc(t.description) + '</td>' + ui.moneyCell(amt) + '<td>' + (p ? ui.pill(p.status) : '') + '</td>' +
          '<td>' + (t.reversed ? ui.pill('CORRECTED', 'Буцаагдсан') : t.reversesTx ? ui.pill('CORRECTIVE', 'Буцаалт #' + t.reversesTx) : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty">Гүйлгээ олдсонгүй</td></tr>') + '</tbody></table></div></div></div>';
    html += '<div id="tx-detail"></div>';
    body.innerHTML = html;
    ui.$('#tx-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    on('tx-filter', 'change', function (ev) { ctx.glTxFilter = ev.target.value; rerender(); });
    var qEl = ui.$('#tx-q');
    qEl.addEventListener('input', function () { ctx.glTxQ = qEl.value; var p = qEl.selectionStart; rerender(); var n = ui.$('#tx-q'); if (n) { n.focus(); n.setSelectionRange(p, p); } });
    ui.$$('tr[data-tx]', body).forEach(function (tr) {
      var go = function () { ctx.glTxNo = +tr.getAttribute('data-tx'); ctx.glRevReason = ctx.glRevReason || 'REVERSAL'; rerender(); var d = ui.$('#tx-detail'); if (d) d.scrollIntoView({ block: 'start' }); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    });
    if (ctx.glTxNo) renderTxDetail(ui.$('#tx-detail'), ctx);
  }

  function renderTxDetail(box, ctx) {
    var S = st();
    var tx = S.transactions.filter(function (t) { return t.transactionNo === ctx.glTxNo; })[0];
    if (!tx) { box.innerHTML = ''; return; }
    var reason = ctx.glRevReason || 'REVERSAL';
    var gls = S.glEntries.filter(function (e) { return e.transactionNo === tx.transactionNo; });
    var pv = reverseTx(tx.transactionNo, reason, { preview: true });
    var html = '<div class="card tx-detail" data-note="jnl.reverse"><div class="card-head"><h2>Гүйлгээ #' + tx.transactionNo + ' · <span class="code">' + ui.esc(tx.documentNo) + '</span> · ' + ui.date(tx.postingDate) + '</h2>' +
      '<div class="row">' + ui.pill(tx.reversed ? 'CORRECTED' : 'POSTED', tx.reversed ? 'Буцаагдсан' : tx.reversesTx ? 'Буцаалт (#' + tx.reversesTx + ')' : 'Бичигдсэн') + '<span class="code small">' + tx.sourceCode + '</span></div></div><div class="card-body stack">';
    html += '<p class="small">' + ui.esc(tx.description) + ' · register #' + tx.registerNo + '</p>';
    if (!pv.ok) {
      var closed = pv.errors.some(function (e) { return e.code === 'gl.period_closed'; });
      var onlyPeriod = closed && pv.errors.every(function (e) { return e.code === 'gl.period_closed'; });
      html += '<h3 class="small">Эх бичилт</h3>' + glTable(gls, { noLinks: true });
      html += ui.errList(pv.errors, 'Буцаах боломжгүй') +
        (onlyPeriod ? '<div class="banner" data-note="jnl.correction"><p><strong>Залруулах журнал (FR-GL-014).</strong> Эх үе хаалттай тул эх огноогоор бичихгүй. Одоогийн нээлттэй огноо (' + ui.date(today()) + ')-той, эсрэг тэмдэгтэй ноорог мөрүүдийг GENERAL багцад үүсгэнэ; автоматаар батлахгүй, шалтгаан CORRECTION.</p><div class="row" style="margin-top:6px"><button class="btn" type="button" id="tx-correct">Залруулах журнал санал болгох</button></div></div>' : '');
    } else {
      var res = pv.result.vouchers[0];
      var mirror = res.gl.map(function (e) { var c = Object.assign({}, e); c.transactionNo = null; c.entryNo = null; c.documentNo = tx.documentNo; return c; });
      html += '<div class="field" style="max-width:360px"><label for="tx-reason" class="req">Шалтгааны код</label><select class="select" id="tx-reason">' +
        ['REVERSAL', 'CORRECTION'].map(function (k) { return opt(k, k + ' — ' + DATA.reasonCodes[k], k === reason); }).join('') + '</select></div>';
      html += '<div class="mirror-cols"><div><h3 class="small">Эх бичилт (#' + tx.transactionNo + ')</h3>' + glTable(gls, { noLinks: true, noTx: true }) + '</div>' +
        '<div><h3 class="small">Буцаалтын бичилт (preview, эсрэг баганад)</h3>' + glTable(mirror, { noLinks: true, noTx: true }) + '</div></div>';
      html += '<p class="small">Ижил баримтын дугаар <code>' + ui.esc(tx.documentNo) + '</code>, ижил огноо, source <code>REVERSAL</code>, шинэ гүйлгээ ба register (BR-PST-30, BR-PST-47). ' +
        (res.vat.length ? res.vat.length + ' НӨАТ-ын бичилт, ' : '') + (res.cle.length + res.vle.length ? (res.cle.length + res.vle.length) + ' дэд дэвтрийн бичилт толин тусгалаар хаагдана, ' : '') + (res.ble.length ? res.ble.length + ' банк/кассын бичилт, ' : '') + 'хоёр гүйлгээ "буцаагдсан" тэмдэгтэй болно.</p>';
      html += ui.calc('Тооцоог харах: эсрэг тэмдэг, эсрэг багана (D-C3)', revCalc(gls));
      html += '<div class="row"><button class="btn danger" type="button" id="tx-reverse">Гүйлгээ буцаах</button></div>';
    }
    html += '</div></div>';
    box.innerHTML = html;
    on('tx-reason', 'change', function (ev) { ctx.glRevReason = ev.target.value; renderTxDetail(box, ctx); app.decorateNotes(); });
    on('tx-reverse', 'click', function () {
      ui.confirm({ title: 'Гүйлгээ #' + tx.transactionNo + '-ийг буцаах уу?', ok: 'Буцаах', danger: true,
        body: '<p>' + ui.esc(tx.documentNo) + ' · ' + ui.date(tx.postingDate) + ': ' + gls.length + ' G/L бичилтийг эсрэг тэмдгээр бичнэ. Шалтгаан: <strong>' + ui.esc(DATA.reasonCodes[reason]) + '</strong>. Нэг гүйлгээг нэг л удаа буцаана (INV-22).</p>' })
        .then(function (ok) {
          if (!ok) return;
          var r = reverseTx(tx.transactionNo, reason);
          if (!r.ok) { box.insertAdjacentHTML('afterbegin', ui.errList(r.errors)); return; }
          var nt = r.result.vouchers[0].transactionNo;
          ui.toast('Гүйлгээ #' + tx.transactionNo + ' буцаагдлаа → шинэ гүйлгээ <strong>#' + nt + '</strong> (' + ui.esc(tx.documentNo) + ', REVERSAL).');
          ctx.glTxNo = nt; ctx.glTxFilter = 'session';
          rerender();
        });
    });
    on('tx-correct', 'click', function () {
      var lines = correctionLines(tx, 'CORRECTION');
      var tgt = JNL.lines['GENERAL.DEFAULT'];
      lines.forEach(function (l) { tgt.push(l); });
      ctx.glBatch = 'GENERAL.DEFAULT'; ctx.glJnlTab = 'lines'; ctx.glJnlSel = tgt.length - lines.length;
      ui.toast('Залруулах журналын ноорог ' + ui.esc(lines[0] ? lines[0].docNo : '') + ' GENERAL багцад нэмэгдлээ (' + lines.length + ' мөр). Хянаад батална уу.');
      rerender();
    });
  }
  function revCalc(gls) {
    return '<p>Мөр бүр: шинэ <code>amount = −эх amount</code> (05 BR-PST-47, entry_no буурах дарааллаар). Дебит/кредит багана тэмдгээс гардаг тул эх дебит мөр буцаалтад <strong>кредит</strong> баганад эерэг гарна — сөрөг дебит (storno) биш (D-C3, FR-GL-010 AC1).</p>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th class="num">Эх amount</th><th class="num">Эх Дт</th><th class="num">Эх Кт</th><th class="num">Шинэ amount</th><th class="num">Шинэ Дт</th><th class="num">Шинэ Кт</th></tr></thead><tbody>' +
      gls.slice().sort(function (a, b) { return b.entryNo - a.entryNo; }).map(function (e) {
        return '<tr><td class="code">' + e.account + '</td>' + ui.moneyCell(e.amount) + ui.moneyCell(dr(e.amount), { blankZero: true }) + ui.moneyCell(cr(e.amount), { blankZero: true }) +
          ui.moneyCell(-e.amount) + ui.moneyCell(dr(-e.amount), { blankZero: true }) + ui.moneyCell(cr(-e.amount), { blankZero: true }) + '</tr>';
      }).join('') + '</tbody><tfoot><tr><td>Σ</td>' + ui.moneyCell(gls.reduce(function (s, e) { return s + e.amount; }, 0)) + '<td></td><td></td>' + ui.moneyCell(-gls.reduce(function (s, e) { return s + e.amount; }, 0)) + '<td></td><td></td></tr></tfoot></table></div>' +
      '<p class="xs">Үр дүн: данс бүрийн үлдэгдэл буцаалтын өмнөх байдалдаа орно (FR-GL-013 AC1); гүйлгээ баланс ба ерөнхий дэвтэрт хос хоёулаа харагдана (BR-RPT-15).</p>';
  }

  // ===========================================================================
  // #trial-balance — Гүйлгээ баланс (S-RPT-02)
  // ===========================================================================
  var PER = null;                                          // period area state (status log, fiscal year, year-end simulation)
  function per() {
    if (PER) return PER;
    PER = { log: [], fy: { status: 'OPEN', closedAt: null, closedBy: null, closingTx: null }, sim: null, manual: {} };
    E().periods.list().forEach(function (p) {                // sample history of the mock months Jan–Aug (fictional)
      if (p.status === 'CLOSED') {
        var m = +p.period.slice(5, 7);
        PER.log.push({ period: p.period, from: 'OPEN', to: 'CLOSED', at: fyYear() + '-' + pad2(m + 1) + '-12 17:' + pad2(10 + m), by: 'Нягтлан — Д. Сарнай', reason: null, sample: true });
      }
    });
    return PER;
  }
  function tbState() {
    var c = app.ctx;
    if (!c.glTb) {
      var prev = E().dates.addDays(today().slice(0, 8) + '01', -1);
      c.glTb = { from: prev.slice(0, 8) + '01', to: prev, incl: false, zero: false, totals: true, ob: true };
    }
    return c.glTb;
  }
  function simEntries() {
    var p = per();
    return p.sim ? p.sim.entries : [];
  }
  function tbCompute(o) {                                  // 10 §5.9 / §6.4 (ENGINE GAP G3)
    var entries = st().glEntries.concat(simEntries());
    var rows = {};
    var get = function (no) { return rows[no] || (rows[no] = { no: no, opening: 0, debit: 0, credit: 0, excluded: 0 }); };
    entries.forEach(function (e) {
      if (e.postingDate > o.to) return;
      var r = get(e.account);
      if (e.postingDate < o.from || (o.ob && e.sourceCode === 'OPENING')) r.opening += e.amount;
      else if (!o.incl && e.isClosing && e.postingDate === o.to) r.excluded += e.amount;
      else if (e.amount > 0) r.debit += e.amount; else r.credit -= e.amount;
    });
    var posting = E().setup.accounts().filter(function (a) { return a.type === 'POSTING'; }).map(function (a) {
      var r = rows[a.no] || { no: a.no, opening: 0, debit: 0, credit: 0, excluded: 0 };
      r.name = a.name; r.closing = r.opening + r.debit - r.credit; r.acc = a;
      return r;
    });
    var tot = { od: 0, oc: 0, d: 0, c: 0, cd: 0, cc: 0, excluded: 0 };
    posting.forEach(function (r) { tot.od += dr(r.opening); tot.oc += cr(r.opening); tot.d += r.debit; tot.c += r.credit; tot.cd += dr(r.closing); tot.cc += cr(r.closing); tot.excluded += Math.abs(r.excluded); });
    var nz = function (r) { return r.opening || r.debit || r.credit || r.closing; };
    var out = [];
    if (o.totals) {
      E().setup.accounts().forEach(function (a) {
        if (a.type === 'POSTING') { var r = posting.filter(function (x) { return x.no === a.no; })[0]; if (o.zero || nz(r)) out.push({ kind: 'P', r: r }); }
        else if (a.type === 'HEADING' || a.type === 'BEGIN_TOTAL') out.push({ kind: 'H', a: a });
        else if (a.totaling) {
          var s = { opening: 0, debit: 0, credit: 0, closing: 0 };
          posting.forEach(function (x) { if (filterHas(a.totaling, x.no)) { s.opening += x.opening; s.debit += x.debit; s.credit += x.credit; s.closing += x.closing; } });
          out.push({ kind: 'E', a: a, r: s });
        }
      });
    } else posting.forEach(function (r) { if (o.zero || nz(r)) out.push({ kind: 'P', r: r }); });
    return { rows: out, posting: posting, totals: tot, balanced: tot.od === tot.oc && tot.d === tot.c && tot.cd === tot.cc };
  }
  function renderTb(el, ctx) {
    var o = tbState();
    if (ctx.tbFrom) { o.from = ctx.tbFrom; o.to = ctx.tbTo; ctx.tbFrom = null; ctx.tbTo = null; }
    var tb = tbCompute(o);
    var p = per();
    var y = fyYear();
    var presets = [['month', 'Энэ сар', today().slice(0, 8) + '01', E().dates.endOfMonth(today())],
      ['prev', 'Өмнөх сар', E().dates.addDays(today().slice(0, 8) + '01', -1).slice(0, 8) + '01', E().dates.addDays(today().slice(0, 8) + '01', -1)],
      ['ytd', 'Оны эхнээс', y + '-01-01', today()], ['year', y + ' он бүтэн', y + '-01-01', y + '-12-31']];
    var html = '<div class="page-head"><div class="title-wrap"><h1>Гүйлгээ баланс</h1><span class="small muted">' + ui.date(o.from) + ' – ' + ui.date(o.to) + ' · нэгж: төгрөг</span></div></div>';
    html += '<div class="card"><div class="card-body stack"><form class="gl-toolbar" id="tb-form" data-note="tb.filters">' +
      '<div class="field date"><label for="tb-from">Хугацаа: эхлэх</label>' + ui.dateInput('tb-from', o.from) + '</div>' +
      '<div class="field date"><label for="tb-to">Дуусах</label>' + ui.dateInput('tb-to', o.to) + '</div>' +
      '<div class="field"><span class="flabel">Түргэн сонголт</span><div class="gl-presets">' + presets.map(function (x) { var cur = o.from === x[2] && o.to === x[3]; return '<button type="button" class="btn sm" id="tb-p-' + x[0] + '" data-pfrom="' + x[2] + '" data-pto="' + x[3] + '" aria-pressed="' + cur + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="checks"><span class="has-note" data-note="tb.closing" style="display:inline-flex"><label class="checkbox" for="tb-incl"><input type="checkbox" id="tb-incl"' + (o.incl ? ' checked' : '') + '> Хаалтын бичилт оруулах</label></span>' +
      '<label class="checkbox" for="tb-zero"><input type="checkbox" id="tb-zero"' + (o.zero ? ' checked' : '') + '> Тэг данс харуулах</label>' +
      '<label class="checkbox" for="tb-totals"><input type="checkbox" id="tb-totals"' + (o.totals ? ' checked' : '') + '> Гарчиг, нийлбэр</label>' +
      '<span class="has-note" data-note="tb.ob" style="display:inline-flex"><label class="checkbox" for="tb-ob"><input type="checkbox" id="tb-ob"' + (o.ob ? ' checked' : '') + '> OPENING ваучер эхний үлдэгдэлд</label></span></div>' +
      '</form>' +
      '<p class="hint">Прототипт анхдагч хугацаа нь хаагдаж буй өмнөх сар (UX-TB-01-д одоогийн сар; ' + ymLabel(today().slice(0, 7)) + '-д бичилт цөөн).</p></div></div>';
    if (p.sim) html += '<div class="banner warn row between" data-note="tb.sim"><span>Жилийн хаалтын <strong>загварчлал</strong> идэвхтэй: ' + p.sim.entries.length + ' хаалтын мөр (' + ui.date(y + '-12-31') + ', is_closing) зөвхөн энэ тайланд нэмэгдсэн; ledger-т бичигдээгүй.</span><button class="btn sm" type="button" id="tb-sim-off">Загварчлал унтраах</button></div>';
    if (!tb.balanced) html += '<div class="banner danger">Тэнцэхгүй — системийн алдаа. Support-д хандана уу (UX-TB-03).</div>';
    html += '<div class="card" data-note="tb.columns"><div class="card-body flush"><div class="table-wrap"><table class="grid-table tb-grid"><thead>' +
      '<tr><th rowspan="2">Данс</th><th rowspan="2">Нэр</th><th class="grp" colspan="2">Эхний үлдэгдэл</th><th class="grp" colspan="2">Гүйлгээ</th><th class="grp" colspan="2">Эцсийн үлдэгдэл</th></tr>' +
      '<tr><th class="num bl">Дебит</th><th class="num">Кредит</th><th class="num bl">Дебит</th><th class="num">Кредит</th><th class="num bl">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>';
    var cell = function (no, col, v, first) { return '<td class="num' + (first ? ' bl' : '') + '">' + (v ? '<button type="button" class="dd" data-dd="' + no + '|' + col + '" aria-label="' + no + ' ' + col + ' задлах">' + ui.esc(fmtM(v)) + '</button>' : '') + '</td>'; };
    tb.rows.forEach(function (x) {
      if (x.kind === 'H') { html += '<tr class="t-' + x.a.type + '"><td class="code">' + x.a.no + '</td><td colspan="7" style="padding-left:' + (10 + x.a.indent * 12) + 'px">' + ui.esc(x.a.name) + '</td></tr>'; return; }
      if (x.kind === 'E') {
        var s = x.r;
        html += '<tr class="t-' + x.a.type + '"><td class="code">' + x.a.no + '</td><td style="padding-left:' + (10 + x.a.indent * 12) + 'px">' + ui.esc(x.a.name) + '</td>' +
          '<td class="num bl">' + fmtM(dr(s.opening), { blankZero: true }) + '</td><td class="num">' + fmtM(cr(s.opening), { blankZero: true }) + '</td>' +
          '<td class="num bl">' + fmtM(s.debit, { blankZero: true }) + '</td><td class="num">' + fmtM(s.credit, { blankZero: true }) + '</td>' +
          '<td class="num bl">' + fmtM(dr(s.closing), { blankZero: true }) + '</td><td class="num">' + fmtM(cr(s.closing), { blankZero: true }) + '</td></tr>';
        return;
      }
      var r = x.r;
      html += '<tr class="t-POSTING"><td class="code"><button type="button" class="lnk mono" data-acccard="' + r.no + '">' + r.no + '</button></td><td' + (o.totals ? ' style="padding-left:' + (10 + r.acc.indent * 12) + 'px"' : '') + '>' + ui.esc(r.name) + '</td>' +
        cell(r.no, 'od', dr(r.opening), true) + cell(r.no, 'oc', cr(r.opening)) + cell(r.no, 'd', r.debit, true) + cell(r.no, 'c', r.credit) + cell(r.no, 'cd', dr(r.closing), true) + cell(r.no, 'cc', cr(r.closing)) + '</tr>';
    });
    if (!tb.rows.length) html += '<tr><td colspan="8" class="empty">Энэ хугацаанд бичилттэй данс алга</td></tr>';
    var T = tb.totals;
    var okc = function (a, b) { return a === b ? '<td class="ok-cell" colspan="2">✓ тэнцсэн</td>' : '<td class="bad-cell" colspan="2">✕ зөрүү ' + fmtM(a - b) + '</td>'; };
    html += '</tbody><tfoot><tr><td colspan="2">НИЙТ (бичилтийн данс)</td><td class="num bl">' + fmtM(T.od) + '</td><td class="num">' + fmtM(T.oc) + '</td><td class="num bl">' + fmtM(T.d) + '</td><td class="num">' + fmtM(T.c) + '</td><td class="num bl">' + fmtM(T.cd) + '</td><td class="num">' + fmtM(T.cc) + '</td></tr>' +
      '<tr><td colspan="2"></td>' + okc(T.od, T.oc) + okc(T.d, T.c) + okc(T.cd, T.cc) + '</tr></tfoot></table></div>' +
      '<div class="tb-check" data-note="tb.totals">' + [['Эхний', T.od, T.oc], ['Гүйлгээ', T.d, T.c], ['Эцсийн', T.cd, T.cc]].map(function (x) { return '<span class="' + (x[1] === x[2] ? 'bal-ok' : 'bal-bad') + '">Σ ' + x[0] + ': Дт = Кт ' + (x[1] === x[2] ? '✓' : '✕') + '</span>'; }).join('') +
      '<span class="muted">' + tb.posting.filter(function (r) { return r.opening || r.debit || r.credit || r.closing; }).length + ' данс · FR-RPT-001 AC1</span></div></div></div>';
    if (T.excluded) html += '<p class="small muted">Хасагдсан хаалтын бичилт (' + ui.date(o.to) + ', is_closing): ' + fmtM(T.excluded / 2) + ' — "Хаалтын бичилт оруулах" асаахад гүйлгээнд орно (BR-RPT-11).</p>';
    html += '<div data-note="tb.calc">' + ui.calc('Тооцоог харах: томьёо ба нийлбэрийн шалгалт', tbCalc(o, tb), 'tb-calc') + '</div>';
    el.innerHTML = html;
    ui.$('#tb-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    dateField('tb-from', o.from, function (v) { o.from = v; }, rerender);
    dateField('tb-to', o.to, function (v) { o.to = v; }, rerender);
    ui.$$('[data-pfrom]', el).forEach(function (bt) { bt.addEventListener('click', function () { o.from = bt.getAttribute('data-pfrom'); o.to = bt.getAttribute('data-pto'); rerender(); var n = ui.$('#' + bt.id); if (n) n.focus(); }); });
    ['incl', 'zero', 'totals', 'ob'].forEach(function (k) { on('tb-' + k, 'change', function (ev) { o[k] = ev.target.checked; rerender(); var n = ui.$('#tb-' + k); if (n) n.focus(); }); });
    on('tb-sim-off', 'click', function () { per().sim = null; rerender(); });
    if (o.from > o.to) ui.toast('Эхлэх огноо дуусахаас хойш байна.', 'error');
    ui.$$('[data-dd]', el).forEach(function (bt) { bt.addEventListener('click', function () { var p2 = bt.getAttribute('data-dd').split('|'); drill(p2[0], p2[1], o); }); });
    bindNav(el);
  }
  function tbCalc(o, tb) {
    var ex = tb.posting.slice().sort(function (a, b) { return (b.debit + b.credit) - (a.debit + a.credit); })[0];
    var html = '<p><strong>Томьёо</strong> (10 §6.4, BR-RPT-11): эхний = Σ amount (огноо &lt; ' + ui.date(o.from) + (o.ob ? ', мөн OPENING ваучер' : '') + '); гүйлгээ Дт = Σ max(amount, 0), Кт = Σ max(−amount, 0) (' + ui.date(o.from) + ' ≤ огноо ≤ ' + ui.date(o.to) +
      (o.incl ? '' : ', ' + ui.date(o.to) + '-ний is_closing хасна') + '); эцсийн = эхний + Дт − Кт; Дт/Кт багана нь данс бүрийн цэвэр үлдэгдлээр хуваагдана.</p>';
    if (ex) html += '<div class="formula">Жишээ: ' + ex.no + ' ' + ex.name + '\nЭхний = ' + fmtM(ex.opening) + '  →  ' + (ex.opening >= 0 ? 'Дт ' + fmtM(dr(ex.opening)) : 'Кт ' + fmtM(cr(ex.opening))) +
      '\nГүйлгээ: Дт ' + fmtM(ex.debit) + ', Кт ' + fmtM(ex.credit) +
      '\nЭцсийн = ' + fmtM(ex.opening) + ' + ' + fmtM(ex.debit) + ' − ' + fmtM(ex.credit) + ' = ' + fmtM(ex.closing) + '  →  ' + (ex.closing >= 0 ? 'Дт ' + fmtM(dr(ex.closing)) : 'Кт ' + fmtM(cr(ex.closing))) + '</div>';
    var T = tb.totals;
    html += '<div class="formula">Σ эхний   Дт ' + fmtM(T.od) + ' = Кт ' + fmtM(T.oc) + (T.od === T.oc ? '  ✓' : '  ✕') +
      '\nΣ гүйлгээ Дт ' + fmtM(T.d) + ' = Кт ' + fmtM(T.c) + (T.d === T.c ? '  ✓' : '  ✕') +
      '\nΣ эцсийн  Дт ' + fmtM(T.cd) + ' = Кт ' + fmtM(T.cc) + (T.cd === T.cc ? '  ✓' : '  ✕') + '\nШалтгаан: гүйлгээ бүр Σ amount = 0 (D-C5, INV-01) тул бүх дансны нийлбэр тэг.</div>';
    if (o.ob && !per().sim) {
      var eng = E().reports.trialBalance({ from: o.from, to: o.to }).totals;
      var same = eng.openingDebit === T.od && eng.openingCredit === T.oc && eng.debit === T.d && eng.credit === T.c && eng.closingDebit === T.cd && eng.closingCredit === T.cc;
      html += '<p class="small">Хөдөлгүүрийн <code>reports.trialBalance</code>-тай тулгав: ' + (same ? '✓ 6 нийлбэр ижил' : '✕ зөрүүтэй (' + fmtM(eng.debit) + ' / ' + fmtM(eng.credit) + ')') + '.</p>';
    }
    return html;
  }
  function drill(no, col, o) {                             // UX-TB-04 / BR-RPT-13
    var entries = st().glEntries.concat(simEntries()).filter(function (e) { return e.account === no && e.postingDate <= o.to; });
    var isOpen = function (e) { return e.postingDate < o.from || (o.ob && e.sourceCode === 'OPENING'); };
    var isEx = function (e) { return !o.incl && e.isClosing && e.postingDate === o.to; };
    var label = { od: 'Эхний үлдэгдэл', oc: 'Эхний үлдэгдэл', d: 'Гүйлгээ (дебит)', c: 'Гүйлгээ (кредит)', cd: 'Эцсийн үлдэгдэл', cc: 'Эцсийн үлдэгдэл' }[col];
    var list = entries.filter(function (e) {
      if (col === 'od' || col === 'oc') return isOpen(e);
      if (col === 'd') return !isOpen(e) && !isEx(e) && e.amount > 0;
      if (col === 'c') return !isOpen(e) && !isEx(e) && e.amount < 0;
      return !isEx(e);
    }).map(function (e) { var c = Object.assign({}, e); if (e._sim) c._sim = true; return c; });
    var a = acc(no);
    var m = ui.modal({ title: label + ' — ' + no + ' ' + a.name, wide: true,
      body: '<div class="stack" data-note="tb.drill"><p class="small">Шүүлтүүр: ' + (col === 'od' || col === 'oc' ? 'огноо &lt; ' + ui.date(o.from) + (o.ob ? ' эсвэл OPENING ваучер' : '') : col === 'd' || col === 'c' ? ui.date(o.from) + ' – ' + ui.date(o.to) + ', ' + (col === 'd' ? 'amount &gt; 0' : 'amount &lt; 0') : 'огноо ≤ ' + ui.date(o.to)) + (o.incl ? '' : '; is_closing (' + ui.date(o.to) + ') хасав') + '.</p>' + glTable(list) + '</div>',
      footer: [{ label: 'Дансны карт', onClick: function (close) { close(true); accountCard(no, { from: o.from, to: o.to }); } }, { label: 'Хаах' }] });
    bindNav(m.el, function () { m.close(true); });
    app.decorateNotes(m.el);
  }

  // ===========================================================================
  // #periods — Санхүүгийн жил ба үе (S-GL-09/10), жилийн хаалт (S-GL-11)
  // ===========================================================================
  function checklistFor(period) {
    var p = per();
    var cl = E().home.closeChecklist(period);
    var items = cl.items.map(function (it) { var c = Object.assign({}, it); if (c.code === 'CASH_COUNTED' && p.manual[period]) { c.status = 'OK'; c.detail = 'Тооллогыг гараар баталгаажуулсан'; } return c; });
    var prior = E().periods.list().filter(function (x) { return x.period < period && x.status === 'OPEN'; });
    items.push({ code: 'PRIOR_PERIOD_OPEN', label: 'Өмнөх сар нээлттэй эсэх', status: prior.length ? 'WARNING' : 'OK', count: prior.length,
      detail: prior.length ? prior.map(function (x) { return ymLabel(x.period); }).join(', ') + ' нээлттэй (дарааллаар хаах заавал биш, BR-PER-14)' : 'Өмнөх бүх сар хаагдсан', link: '#periods', rule: 'BR-PER-40' });
    if (p.fy.status === 'OPEN' && p.fy.closedAt) items.push({ code: 'YEAR_CLOSE_OUTDATED', label: 'Жилийн хаалт хуучирсан', status: 'WARNING', detail: 'Хаалтын дараа сар дахин нээгдсэн — жилийн хаалтыг дахин ажиллуулна', link: '#periods', rule: 'BR-PER-42' });
    return { items: items, blocking: items.filter(function (i) { return i.status === 'BLOCKING'; }), warnings: items.filter(function (i) { return i.status === 'WARNING'; }), ok: items.filter(function (i) { return i.status === 'OK'; }).length };
  }
  function logStatus(period, from, to, reason, extra) {
    per().log.push({ period: period, from: from, to: to, at: nowStamp(), by: userName(), reason: reason || null, snapshot: extra || null });
  }
  function closeMonth(period) {                            // BR-PER-13 / BR-PER-44
    var p = E().periods.list().filter(function (x) { return x.period === period; })[0];
    if (!p || p.status !== 'OPEN') return;
    var cl = checklistFor(period);
    var hasCash = cl.items.some(function (i) { return i.code === 'CASH_COUNTED' && i.status !== 'OK'; });
    var body = '<div class="stack close-form" data-note="per.close">' +
      '<p>' + ymLabel(period) + ' (' + ui.date(p.start) + '–' + ui.date(p.end) + ')-ыг хаана. Хаасны дараа энэ сарын огноотой баримт, журнал, буцаалт батлагдахгүй (BR-PER-20); НӨАТ-ын үе тусдаа (BR-PER-25).</p>' +
      (cl.blocking.length ? ui.errList(cl.blocking.map(function (i) { return { code: 'gl.period_close_blocked', message: i.label + ': ' + i.detail }; }), 'Хаах боломжгүй (BLOCKING)') : '') +
      (cl.warnings.length ? '<div class="banner warn"><strong>' + cl.warnings.length + ' анхааруулга:</strong><ul style="margin:4px 0 0;padding-left:18px">' + cl.warnings.map(function (i) { return '<li>' + ui.esc(i.label) + ' — ' + ui.esc(i.detail) + ' <code>' + i.rule + '</code></li>'; }).join('') + '</ul></div>' : '<div class="banner">' + ui.pill('OK') + ' Бүх шалгалт хэвийн.</div>') +
      (hasCash ? '<label class="checkbox" for="pc-cash"><input type="checkbox" id="pc-cash"> Сарын эцсийн кассын тооллогыг хийсэн (manual, BR-PER-32)</label>' : '') +
      (cl.warnings.length ? '<label class="checkbox" for="pc-ack"><input type="checkbox" id="pc-ack"> Анхааруулгыг хүлээн зөвшөөрч хаана (acknowledgeWarnings)</label>' +
        '<div class="field"><label class="req" for="pc-reason">Шалтгаан (≥ 10 тэмдэгт, аудитын логт)</label><textarea class="input" id="pc-reason" rows="2" placeholder="жишээ нь: Хуулга 10-нд ирнэ, НӨАТ-ын тайланг тусад нь хаана"></textarea></div>' : '') +
      '<p class="xs muted">Хэрэглэгч: ' + ui.esc(userName()) + ' · шалгах хуудасны snapshot хадгалагдана (SCR-RPT-04).</p></div>';
    var m = ui.modal({ title: ymLabel(period) + '-ыг хаах', body: body,
      footer: [{ label: 'Болих' }, { label: 'Сар хаах', kind: 'primary', id: 'pc-ok', onClick: function (close) {
        var cash = ui.$('#pc-cash'), ack = ui.$('#pc-ack'), rs = ui.$('#pc-reason');
        if (cash && cash.checked) per().manual[period] = true;
        var cl2 = checklistFor(period);
        if (cl2.blocking.length) return;
        if (cl2.warnings.length && (!ack || !ack.checked || (rs.value || '').trim().length < 10)) { ui.toast('Анхааруулгыг зөвшөөрч, ≥ 10 тэмдэгт шалтгаан бичнэ үү (gl.period_close_warnings_unacknowledged).', 'error'); return; }
        E().periods.setStatus(period, 'CLOSED');
        logStatus(period, 'OPEN', 'CLOSED', rs ? rs.value.trim() : null, cl2.items.map(function (i) { return i.code + ':' + i.status; }).join(' '));
        close(true);
        var allClosed = E().periods.list().every(function (x) { return x.status !== 'OPEN'; });
        ui.toast(ymLabel(period) + ' хаагдлаа.' + (allClosed ? ' 12 сар бүгд хаагдсан — жилийн хаалт хийх боломжтой (gl.year_ready_to_close).' : ''));
        rerender();
      } }] });
    var okB = ui.$('#pc-ok', m.el);
    var sync = function () {
      var ack = ui.$('#pc-ack', m.el), rs = ui.$('#pc-reason', m.el);
      okB.disabled = !!cl.blocking.length || (!!ack && (!ack.checked || (rs.value || '').trim().length < 10));
    };
    ['pc-ack', 'pc-reason', 'pc-cash'].forEach(function (id) { var x = ui.$('#' + id, m.el); if (x) { x.addEventListener('input', sync); x.addEventListener('change', sync); } });
    sync();
    app.decorateNotes(m.el);
  }
  function lockMonth(period) {                             // BR-PER-16
    var p = E().periods.list().filter(function (x) { return x.period === period; })[0];
    if (+period.slice(5, 7) === 12 && per().fy.status !== 'CLOSED') {
      ui.modal({ title: 'Түгжих боломжгүй', body: ui.errList([{ code: 'gl.period_lock_requires_year_close', message: '12-р сарыг түгжихийн өмнө жилийн хаалт хийнэ (BR-PER-16).' }]) });
      return;
    }
    var m = ui.modal({ title: ymLabel(period) + '-ыг түгжих', body: '<div class="stack" data-note="per.lock">' +
      '<p>Түгжсэн сарыг <strong>дахин нээх боломжгүй</strong> (UI ба API-д үйлдэл байхгүй, FR-GL-024 AC3). Ихэвчлэн НӨАТ-ын тайлан илгээгдсэн эсвэл жилийн тайлан илгээсний дараа түгжинэ.</p>' +
      '<p class="small muted">Бодит системд MFA дахин баталгаажуулалт (step-up, ≤ 15 мин) шаардана; прототипт энэ баталгаажуулалтаар орлуулав.</p>' +
      '<label class="checkbox" for="pl-irrev"><input type="checkbox" id="pl-irrev"> Буцаагдахгүйг ойлгосон (confirmIrreversible)</label></div>',
      footer: [{ label: 'Болих' }, { label: 'Түгжих', kind: 'danger', id: 'pl-ok', onClick: function (close) {
        if (!ui.$('#pl-irrev').checked) return;
        E().periods.setStatus(period, 'LOCKED'); logStatus(period, p.status, 'LOCKED', null); close(true); ui.toast(ymLabel(period) + ' түгжигдлээ.'); rerender();
      } }] });
    var okB = ui.$('#pl-ok', m.el); okB.disabled = true;
    ui.$('#pl-irrev', m.el).addEventListener('change', function (ev) { okB.disabled = !ev.target.checked; });
    app.decorateNotes(m.el);
  }
  function reopenMonth(period) {                           // FR-GL-024 AC2, SEC-POST-04
    var m = ui.modal({ title: ymLabel(period) + '-ыг дахин нээх', body: '<div class="stack close-form">' +
      '<p>Зөвхөн Эзэн, шалтгаантайгаар (≥ 10 тэмдэгт) дахин нээнэ; аудитын лог ба мэдэгдэл үүснэ (BR-PER-18).' + (per().fy.status === 'CLOSED' ? ' Жил хаагдсан тул нээхэд жил OPEN болж, жилийн хаалтыг дахин ажиллуулах шаардлагатай болно (SEC-POST-04, BR-YEC-12).' : '') + '</p>' +
      '<div class="field"><label class="req" for="pr-reason">Шалтгаан</label><textarea class="input" id="pr-reason" rows="2"></textarea></div></div>',
      footer: [{ label: 'Болих' }, { label: 'Дахин нээх', kind: 'primary', id: 'pr-ok', onClick: function (close) {
        var r = ui.$('#pr-reason').value.trim();
        if (r.length < 10) return;
        E().periods.setStatus(period, 'OPEN'); logStatus(period, 'CLOSED', 'OPEN', r);
        var f = per().fy;
        if (f.status === 'CLOSED') { f.status = 'OPEN'; ui.toast(fyYear() + ' он дахин OPEN — жилийн хаалт хуучирсан (YEAR_CLOSE_OUTDATED).'); }
        close(true); ui.toast(ymLabel(period) + ' дахин нээгдлээ.'); rerender();
      } }] });
    var okB = ui.$('#pr-ok', m.el); okB.disabled = true;
    ui.$('#pr-reason', m.el).addEventListener('input', function (ev) { okB.disabled = ev.target.value.trim().length < 10; });
  }

  function yecPlan() {                                     // 05 §5.13 / 10 §5.6 (ENGINE GAP G4)
    var Y = fyYear(), from = Y + '-01-01', to = Y + '-12-31';
    var S = st();
    var net = {};
    S.glEntries.forEach(function (e) {
      if (e.postingDate < from || e.postingDate > to) return;
      if (acc(e.account).incomeBalance !== 'INCOME_STATEMENT') return;
      net[e.account] = (net[e.account] || 0) + e.amount;          // closing entries included → re-run writes only the difference
    });
    var lines = Object.keys(net).sort().filter(function (k) { return net[k] !== 0; }).map(function (k) { return { acc: k, net: net[k], amount: -net[k] }; });
    var R = lines.reduce(function (s, l) { return s + l.net; }, 0);
    var errors = [], warnings = [], f = per().fy;
    var periods = E().periods.list();
    var open = periods.filter(function (p) { return p.status === 'OPEN'; });
    if (f.status === 'LOCKED') errors.push({ code: 'gl.fiscal_year_locked', message: Y + ' он түгжигдсэн.' });
    if (open.length) errors.push({ code: 'gl.year_close_periods_open', message: 'Нээлттэй сар: ' + open.map(function (p) { return ymLabel(p.period); }).join(', ') + ' (BR-YEC-02).' });
    var dec = periods.filter(function (p) { return +p.period.slice(5, 7) === 12; })[0];
    if (dec && dec.status === 'LOCKED') errors.push({ code: 'gl.period_locked', message: '12-р сар түгжигдсэн — хаалтын ваучер бичигдэхгүй.' });
    var r3500 = acc('3500');
    if (!r3500) errors.push({ code: 'gl.year_close_result_account_missing', message: '"Тайлант үеийн ашиг" данс тохируулаагүй.' });
    else if (r3500.type !== 'POSTING' || r3500.incomeBalance !== 'BALANCE_SHEET' || r3500.category !== 'EQUITY' || r3500.blocked) errors.push({ code: 'gl.year_close_result_account_invalid', message: '3500 нь POSTING, BALANCE_SHEET, EQUITY байх ёстой.' });
    if (to > DATA.company.allowPostingTo || to < DATA.company.allowPostingFrom) errors.push({ code: 'gl.posting_date_outside_window', message: ui.date(to) + ' компанийн цонхоос гадуур (BR-PER-23).' });
    var unmapped = lines.filter(function (l) { var a = acc(l.acc); return !a.line || !a.cf; });
    if (unmapped.length) errors.push({ code: 'gl.year_close_unmapped_accounts', message: unmapped.map(function (l) { return l.acc; }).join(', ') });
    var blocked = lines.filter(function (l) { return acc(l.acc).blocked; });
    if (blocked.length) errors.push({ code: 'gl.account_blocked', message: blocked.map(function (l) { return l.acc; }).join(', ') });
    var preTax = -lines.filter(function (l) { return l.acc < '9000'; }).reduce(function (s, l) { return s + l.net; }, 0);
    var cit = S.glEntries.some(function (e) { return e.account === '9100' && e.postingDate >= from && e.postingDate <= to; });
    if (!cit && preTax > 0) warnings.push({ code: 'CIT_NOT_ACCRUED', message: 'ААНОАТ (9100) энэ онд бичигдээгүй, татвар төлөхийн өмнөх ашиг ' + fmtM(preTax, { sym: true }) + '.' });
    var vp12 = E().vat.periods().filter(function (p) { return +p.period.slice(5, 7) === 12; })[0];
    if (vp12 && vp12.status === 'OPEN') warnings.push({ code: 'VAT_RETURN_NOT_CLOSED', message: '12-р сарын НӨАТ-ын үе нээлттэй.' });
    warnings.push({ code: 'W-04', message: (Y + 1) + ' оны санхүүгийн жил үүсээгүй — 3500 → 3400 шилжүүлгийн ноорог үүсэхгүй (gl.next_fiscal_year_missing).' });
    var bal3500 = S.glEntries.filter(function (e) { return e.account === '3500' && e.postingDate <= (Y + 1) + '-01-01'; }).reduce(function (s, e) { return s + e.amount; }, 0);
    var B = bal3500 + R;
    var doc = { sourceCode: 'CLSINCOME', description: Y + ' оны орлого, зардлын хаалт', vouchers: [{ key: 'V1', postingDate: to, documentType: 'NONE', docSeries: 'CL', description: Y + ' оны орлого, зардлын хаалт (D-D4)',
      gl: lines.map(function (l, i) { return { key: 'C' + i, acc: l.acc, amount: l.amount, origin: 'SYSTEM', desc: 'Жилийн хаалт ' + Y }; }).concat(R !== 0 ? [{ key: 'RES', acc: '3500', amount: R, origin: 'SYSTEM', desc: 'Тайлант үеийн үр дүн ' + Y }] : []) }] };
    return { Y: Y, from: from, to: to, lines: lines, R: R, errors: errors, warnings: warnings, B: B, bal3500: bal3500, doc: doc, preTax: preTax };
  }
  function postYearEnd() {
    var plan = yecPlan();
    if (plan.errors.length) return;
    var f = per().fy;
    ui.confirm({ title: plan.Y + ' оны жилийн хаалт', ok: 'Хаах',
      body: '<p>' + (plan.lines.length ? plan.lines.length + ' орлого/зардлын дансыг ' + ui.date(plan.to) + '-ний <code>is_closing</code> ваучераар (CL цуврал) 3500 руу хаана: үр дүн ' + (plan.R < 0 ? 'ашиг ' + fmtM(-plan.R, { sym: true }) : 'алдагдал ' + fmtM(plan.R, { sym: true })) + '.' : 'Зөрүү 0 — ваучер үүсэхгүй, зөвхөн жил CLOSED болно (BR-YEC-06).') + '</p>' })
      .then(function (ok) {
        if (!ok) return;
        var txNo = null;
        if (plan.lines.length) {
          var r = E().post(plan.doc);
          if (!r.ok) { ui.modal({ title: 'Жилийн хаалт амжилтгүй', body: ui.errList(r.errors) }); return; }
          var v = r.result.vouchers[0];
          txNo = v.transactionNo;
          st().glEntries.filter(function (e) { return e.transactionNo === txNo; }).forEach(function (e) { e.isClosing = true; });
          st().transactions.filter(function (t) { return t.transactionNo === txNo; }).forEach(function (t) { t.isClosing = true; });
          ui.toast('Жилийн хаалтын ваучер <strong>' + ui.esc(v.documentNo) + '</strong> батлагдлаа (is_closing).');
        }
        f.status = 'CLOSED'; f.closedAt = nowStamp(); f.closedBy = userName(); if (txNo) f.closingTx = txNo;
        per().sim = null;
        rerender();
      });
  }

  function renderPeriods(el, ctx) {
    var p = per();
    var periods = E().periods.list();
    var sel = ctx.glPeriod || (periods.filter(function (x) { return x.status === 'OPEN' && x.start <= today(); })[0] || periods[0]).period;
    ctx.glPeriod = sel;
    var isOwner = app.state.role === 'OWNER';
    var S = st();
    var cnt = {};
    S.glEntries.forEach(function (e) { var m = e.postingDate.slice(0, 7); cnt[m] = (cnt[m] || 0) + 1; });
    var co = DATA.company;
    var html = '<div class="page-head"><div class="title-wrap"><h1>Санхүүгийн жил ба үе</h1>' + ui.pill(p.fy.status, fyYear() + ' он: ' + ui.pillLabel(p.fy.status)) + '</div>' +
      '<span class="small muted" data-note="per.window">Posting цонх ' + ui.date(co.allowPostingFrom) + '–' + ui.date(co.allowPostingTo) + ' · хэрэглэгч ' + ui.esc(userName()) + '</span></div>';
    if (p.fy.status === 'OPEN' && p.fy.closedAt) html += '<div class="banner warn">Жилийн хаалт ' + ui.esc(p.fy.closedAt) + '-нд хийгдсэн боловч дараа нь сар дахин нээгдсэн — хаалтыг дахин ажиллуулна (BR-YEC-12).</div>';
    html += '<div class="card" data-note="per.list"><div class="card-head"><h2>Сарууд (gl.accounting_period)</h2><span class="small muted">Нээлттэй → Хаалттай → Түгжсэн (D-D3)</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table per-grid"><thead><tr>' +
      '<th>Сар</th><th>Хугацаа</th><th>Төлөв</th><th class="num">G/L бичилт</th><th>НӨАТ-ын үе</th><th>Үйлдэл</th></tr></thead><tbody>';
    periods.forEach(function (x) {
      var vp = E().vat.periods().filter(function (v) { return v.period === x.period; })[0];
      var acts = '';
      if (x.status === 'OPEN') acts = '<button class="btn sm" type="button" data-pclose="' + x.period + '" id="per-close-' + x.period + '">Хаах…</button>';
      else if (x.status === 'CLOSED') acts = '<button class="btn sm" type="button" data-plock="' + x.period + '" id="per-lock-' + x.period + '">Түгжих…</button>' +
        '<button class="btn sm ghost" type="button" data-preopen="' + x.period + '" id="per-reopen-' + x.period + '"' + (isOwner ? '' : ' disabled title="403 — зөвхөн Эзэн дахин нээнэ (FR-GL-024 AC2)"') + '>Дахин нээх…</button>';
      else acts = '<span class="small muted">Үйлдэлгүй (FR-GL-024 AC3)</span>';
      html += '<tr data-per="' + x.period + '" class="' + (x.period === sel ? 'sel' : '') + '" tabindex="0"><td><strong>' + ymLabel(x.period) + '</strong></td><td class="nowrap">' + ui.date(x.start) + ' – ' + ui.date(x.end) + '</td><td>' + ui.pill(x.status) + '</td>' +
        '<td class="num">' + (cnt[x.period] || '') + '</td><td>' + (vp ? ui.pill(vp.status) : '') + '</td><td><div class="row">' + acts + '</div></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    var cl = checklistFor(sel);
    var selP = periods.filter(function (x) { return x.period === sel; })[0];
    html += '<div class="card" data-note="per.checklist"><div class="card-head"><h2>' + ymLabel(sel) + ' — сарын хаалтын шалгах хуудас (' + cl.ok + '/' + cl.items.length + ')</h2>' + ui.pill(selP.status) + '</div><div class="card-body flush">' +
      cl.items.map(function (i) {
        var mk = i.status === 'OK' ? '<span class="check-mark pass">✓</span>' : i.status === 'BLOCKING' ? '<span class="check-mark fail">✕</span>' : '<span class="check-mark warn">!</span>';
        return '<div class="check-row">' + mk + '<div><div><strong>' + ui.esc(i.label) + '</strong> <code class="xs">' + i.code + '</code>' + (i.manual ? ' <span class="xs muted">(гараар)</span>' : '') + '</div><div class="small muted">' + ui.esc(i.detail || '') + '</div></div>' +
          '<div class="row">' + ui.pill(i.status) + '<span class="chip rule">' + i.rule + '</span>' + (i.link && i.link !== '#periods' ? '<a class="small" href="' + i.link + '">Алхам руу ›</a>' : '') + '</div></div>';
      }).join('') +
      '</div></div>';
    html += '<div class="card" data-note="per.history"><div class="card-head"><h2>Төлөвийн түүх (accounting_period_status_log)</h2></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Огноо, цаг</th><th>Сар</th><th>Шилжилт</th><th>Хэрэглэгч</th><th>Шалтгаан</th></tr></thead><tbody>' +
      p.log.slice().reverse().map(function (l) { return '<tr><td class="nowrap">' + ui.esc(ui.date(l.at.slice(0, 10)) + l.at.slice(10)) + (l.sample ? ' <span class="xs muted">(жишээ)</span>' : '') + '</td><td>' + ymLabel(l.period) + '</td><td>' + ui.pillLabel(l.from) + ' → ' + ui.pillLabel(l.to) + '</td><td>' + ui.esc(l.by) + '</td><td>' + ui.esc(l.reason || '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>';
    html += yecHtml();
    el.innerHTML = html;
    ui.$$('tr[data-per]', el).forEach(function (tr) {
      var go = function (ev) { if (ev && ev.target.closest('button')) return; ctx.glPeriod = tr.getAttribute('data-per'); rerender(); var n = ui.$('tr[data-per="' + ctx.glPeriod + '"]'); if (n) n.focus(); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target === tr) go(); });
    });
    ui.$$('[data-pclose]', el).forEach(function (b) { b.addEventListener('click', function () { closeMonth(b.getAttribute('data-pclose')); }); });
    ui.$$('[data-plock]', el).forEach(function (b) { b.addEventListener('click', function () { lockMonth(b.getAttribute('data-plock')); }); });
    ui.$$('[data-preopen]', el).forEach(function (b) { b.addEventListener('click', function () { if (app.state.role === 'OWNER') reopenMonth(b.getAttribute('data-preopen')); }); });
    on('yec-post', 'click', postYearEnd);
    on('yec-sim', 'click', function () {
      var plan = yecPlan();
      var docNo = 'CL-' + plan.Y + '-*****';
      per().sim = { at: nowStamp(), entries: plan.doc.vouchers[0].gl.map(function (l) {
        return { account: l.acc, amount: l.amount, postingDate: plan.to, isClosing: true, sourceCode: 'CLSINCOME', documentNo: docNo, description: l.desc, transactionNo: null, entryNo: null, _sim: true };
      }) };
      app.navigate('trial-balance', { tbFrom: plan.Y + '-01-01', tbTo: plan.to });
    });
  }
  function yecHtml() {
    var plan = yecPlan();
    var f = per().fy;
    var pv = plan.lines.length ? E().post(plan.doc, { preview: true }) : null;
    var engineErr = pv && !pv.ok ? pv.errors : [];
    var locked = E().periods.list().some(function (p) { return +p.period.slice(5, 7) === 12 && p.status === 'LOCKED'; });
    var canPost = !plan.errors.length && !engineErr.length && f.status !== 'CLOSED' && !locked;
    var steps = ['① Шалгах хуудас', '② Урьдчилан харах', '③ Хаах', '④ 3500 → 3400 шилжүүлэг', '⑤ Маягт А, гарын үсэг', '⑥ e-balance', '⑦ Илгээж түгжих'];
    var cur = f.status === 'CLOSED' ? 3 : plan.errors.length ? 0 : 1;
    var sd = 0, sc = 0;
    var vlines = plan.doc.vouchers[0].gl;
    vlines.forEach(function (l) { sd += dr(l.amount); sc += cr(l.amount); });
    var html = '<div class="card"><div class="card-head"><h2>Жилийн хаалт ' + plan.Y + ' (S-GL-11)</h2>' + ui.pill(f.status, 'Жил: ' + ui.pillLabel(f.status)) + '</div><div class="card-body stack">' +
      '<ol class="steps" aria-label="Wizard-ийн алхам">' + steps.map(function (s, i) { return '<li class="' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '">' + s + '</li>'; }).join('') + '</ol>';
    html += '<div data-note="yec.checks">' + (plan.errors.length ? ui.errList(plan.errors, 'BLOCKING — хаалт хийх боломжгүй (BR-YEC-02)') : '<div class="banner">' + ui.pill('OK') + ' Урьдчилсан нөхцөл биелсэн (BR-YEC-02).</div>') +
      (plan.warnings.length ? '<div class="banner warn" style="margin-top:8px"><strong>WARNING (BR-YEC-03):</strong><ul style="margin:4px 0 0;padding-left:18px">' + plan.warnings.map(function (w) { return '<li><code>' + w.code + '</code> ' + ui.esc(w.message) + '</li>'; }).join('') +
        '<li>Гараар: тооллого, найдваргүй авлага, нөөц, тооцоо нийлсэн акт (INVENTORY_COUNTED, BAD_DEBT_REVIEWED, PROVISIONS_REVIEWED, BALANCE_CONFIRMATIONS)</li></ul></div>' : '') + '</div>';
    html += '<div data-note="yec.voucher"><h3 class="small" style="margin-bottom:6px">Хаалтын ваучерын урьдчилсан харагдац (батлахаас өмнө)</h3>' +
      '<div class="yec-meta"><span>Дугаар <code>' + (pv && pv.ok ? ui.esc(pv.result.vouchers[0].documentNo) : '***') + '</code> (CL цуврал)</span><span>Огноо <code>' + ui.date(plan.to) + '</code></span><span><code>is_closing = true</code></span><span>Source <code>CLSINCOME</code></span><span>document_type <code>NONE</code></span><span>dimension set 0</span></div>' +
      (engineErr.length ? ui.errList(engineErr, 'Хөдөлгүүрийн шалгалт') : '') +
      (vlines.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Нэр</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
        vlines.map(function (l) { var a = acc(l.acc); return '<tr' + (l.acc === '3500' ? ' class="subtotal"' : '') + '><td class="code">' + l.acc + '</td><td>' + ui.esc(a.name) + '</td>' + ui.moneyCell(dr(l.amount), { blankZero: true }) + ui.moneyCell(cr(l.amount), { blankZero: true }) + '</tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="2">Σ ' + vlines.length + ' мөр' + (sd === sc ? ' · Дт = Кт ✓' : '') + '</td>' + ui.moneyCell(sd) + ui.moneyCell(sc) + '</tr></tfoot></table></div>' :
        '<p class="muted">Хаах зөрүү алга — ваучер үүсэхгүй (BR-YEC-06).</p>') +
      '<p class="small">Үр дүн R = Σ net = ' + fmtM(plan.R) + ' → 3500 ' + (plan.R < 0 ? 'Кт ' + fmtM(-plan.R) + ' (ашиг)' : plan.R > 0 ? 'Дт ' + fmtM(plan.R) + ' (алдагдал)' : '0') + '. ' + (f.status === 'CLOSED' ? 'Жил хаагдсан; дахин ажиллуулахад зөвхөн зөрүү бичигдэнэ (FR-GL-026 AC2).' : 'Одоо ' + ui.date(today()) + '-ний байдлаар тооцсон; 12-31 хүртэлх бичилтээр өөрчлөгдөнө.') + '</p>' +
      ui.calc('Тооцоог харах: net(a) ба R (05 §6.7, BR-YEC-04)', yecCalc(plan)) + '</div>';
    html += '<div data-note="yec.re-transfer"><h3 class="small" style="margin:6px 0">④ Хуримтлагдсан ашиг руу шилжүүлэх санал (' + ui.date((plan.Y + 1) + '-01-01') + ')</h3>' +
      (plan.B !== 0 ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Нэр</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
        '<tr><td class="code">3500</td><td>' + ui.esc(acc('3500').name) + '</td>' + ui.moneyCell(dr(-plan.B), { blankZero: true }) + ui.moneyCell(cr(-plan.B), { blankZero: true }) + '</tr>' +
        '<tr><td class="code">3400</td><td>' + ui.esc(acc('3400').name) + '</td>' + ui.moneyCell(dr(plan.B), { blankZero: true }) + ui.moneyCell(cr(plan.B), { blankZero: true }) + '</tr></tbody></table></div>' +
        '<p class="xs muted">B = Σ amount(3500, огноо ≤ ' + ui.date((plan.Y + 1) + '-01-01') + ') = ' + fmtM(plan.bal3500) + (f.status === 'CLOSED' ? '' : ' + R ' + fmtM(plan.R)) + ' = ' + fmtM(plan.B) + '. GENERAL багцын ноорог журнал (GENJNL, is_closing = false) болж хэрэглэгч хянаж батална; ' + (plan.Y + 1) + ' оны жил үүсээгүй тул одоо үүсэхгүй (W-04).</p>' : '<p class="muted">B = 0 — санал үүсэхгүй.</p>') + '</div>';
    html += '<div class="row" data-note="yec.simulate"><button class="btn primary" type="button" id="yec-post"' + (canPost ? '' : ' disabled title="BLOCKING алдаатай"') + '>③ Жилийн хаалт батлах</button>' +
      '<button class="btn" type="button" id="yec-sim"' + (vlines.length && f.status !== 'CLOSED' ? '' : ' disabled') + '>Гүйлгээ балансад загварчлах</button>' +
      '<span class="small muted">' + (canPost ? 'Бүх сар хаагдсан — батлах боломжтой.' : 'Прототипт: Есөн–12-р сарыг хаавал батлах товч идэвхжинэ (Хаах… товч).') + '</span></div>';
    html += '</div></div>';
    return html;
  }
  function yecCalc(plan) {
    return '<p>IS = орлогын тайлангийн (5000–9999) бичилтийн данс. net(a) = Σ amount (' + ui.date(plan.from) + ' ≤ огноо ≤ ' + ui.date(plan.to) + ', <strong>хаалтын бичилт орно</strong>); хаалтын мөр L(a) = −net(a); R = Σ net(a) → 3500. Тэнцэл: Σ L(a) + R = 0.</p>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Нэр</th><th class="num">net(a)</th><th class="num">L(a) = −net</th></tr></thead><tbody>' +
      plan.lines.map(function (l) { return '<tr><td class="code">' + l.acc + '</td><td>' + ui.esc(acc(l.acc).name) + '</td>' + ui.moneyCell(l.net) + ui.moneyCell(l.amount) + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="2">R = Σ net</td>' + ui.moneyCell(plan.R) + ui.moneyCell(-plan.R) + '</tr></tfoot></table></div>' +
      '<div class="formula">Σ L(a) = ' + fmtM(-plan.R) + ';  мөр 3500 = R = ' + fmtM(plan.R) + ';  Σ L(a) + R = ' + fmtM(0) + ' ✓' +
      '\nОДТ 22 "Тайлант үеийн цэвэр ашиг" = −R = ' + fmtM(-plan.R) + ' (одоогийн байдлаар); хаасны дараа СБТ 2.2.7 = 3400..3998|5000..9998 тул баланс хоёр байдалд ижил (BR-YEC-10).</div>';
  }

  // ===========================================================================
  // registration
  // ===========================================================================
  app.registerScreen({ route: 'coa', title: 'Дансны төлөвлөгөө', crumbs: [['Санхүү'], ['Дансны төлөвлөгөө']], owner: 'js/screens/gl.js',
    intro: ['MN seed-ийн 182 дансны мод: Heading, Begin-Total, End-Total мөрүүд доголоор бүтэц үүсгэж, бичилтийн 138 дансанд л гүйлгээ бичигдэнэ. Сонгосон хугацааны хөдөлгөөн ба огнооны үлдэгдлийг ерөнхий дэвтрийн бичилтээс шууд тооцно.',
      'Нягтлан дансны тохиргоог (шууд бичилт, Маягт А-гийн мөр, МГТ ангилал) шалгана; данс дарж карт ба сүүлийн бичилтүүдийг, баримтын дугаар дарж тухайн гүйлгээний бүх бичилтийг (Navigate) нээнэ. Энэ дэлгэц юу ч батлахгүй.'],
    render: function (el) { renderCoa(el); } });
  app.registerScreen({ route: 'journal', title: 'Ерөнхий журнал', crumbs: [['Санхүү'], ['Ерөнхий журнал']], owner: 'js/screens/gl.js',
    intro: ['Нягтлангийн гар журнал: багц сонгоод мөр бүрт данс (G/L, харилцагч, нийлүүлэгч, мөнгөний данс), дебит эсвэл кредит, шаардлагатай бол НӨАТ-ын бүлэг оруулна. Ижил баримтын дугаар ба огноотой мөрүүд нэг ваучер болж, зөрүү 0 үед л батлагдана.',
      'Батлахад ноорог J-дугаар хуулийн завсаргүй <code>GJ/BR/BP/KO/KZ/OB-2026-#####</code> дугаараар солигдож, G/L, НӨАТ, дэд дэвтрийн бичилт нэг гүйлгээнд бичигдэнэ. "Гүйлгээ ба буцаалт" tab-аас журналаас үүссэн гүйлгээг эсрэг тэмдэгтэй бичилтээр буцаана (storno-гүй).'],
    render: function (el, ctx) { renderJournal(el, ctx); },
    onLeave: function () { if (jnlKeyHandler) { document.removeEventListener('keydown', jnlKeyHandler); jnlKeyHandler = null; } } });
  app.registerScreen({ route: 'trial-balance', title: 'Гүйлгээ баланс', crumbs: [['Тайлан'], ['Гүйлгээ баланс']], owner: 'js/screens/gl.js',
    intro: ['Данс бүрийн эхний үлдэгдэл, тухайн хугацааны дебит/кредит гүйлгээ, эцсийн үлдэгдлийг ерөнхий дэвтрээс тооцно; гурван хос баганын нийлбэр үргэлж тэнцэнэ. Нягтлан сарын хаалтын өмнө, эзэн ба аудитор тайлан шалгахад хэрэглэнэ.',
      'Дүн дээр дарж бичилт рүү задална. "Хаалтын бичилт оруулах" нь 12-31-ний жилийн хаалтын (is_closing) бичилтийг гүйлгээнд оруулах эсэхийг шийднэ.'],
    render: function (el, ctx) { renderTb(el, ctx); } });
  app.registerScreen({ route: 'periods', title: 'Санхүүгийн жил ба үе', crumbs: [['Хаалт'], ['Санхүүгийн жил ба үе']], owner: 'js/screens/gl.js',
    intro: ['2026 оны 12 сар тус бүрийн төлөв (Нээлттэй → Хаалттай → Түгжсэн): хаалттай сард ямар ч баримт, журнал батлагдахгүй. Сар сонгоход хаалтын шалгах хуудас гарна; анхааруулгатай хаахад шалтгаан бичигдэнэ, дахин нээхийг зөвхөн Эзэн хийнэ.',
      'Доод хэсэгт жилийн хаалт: орлого, зардлын дансыг 12-31-ний is_closing ваучераар 3500 "Тайлант үеийн ашиг" руу хаахыг батлахаас өмнө харуулна (D-D4).'],
    render: function (el, ctx) { renderPeriods(el, ctx); } });

  // exposed for other screens / debugging (read-only helpers)
  ERP.gl = { navigateDoc: navigateDoc, accountCard: accountCard, reverseTx: reverseTx, trialBalance: tbCompute, yearEndPlan: yecPlan };
})();
