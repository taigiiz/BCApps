/* =============================================================================
   js/screens/sales.js — #sales-invoices (S-SAL-01/05), #sales-invoice (S-SAL-02 draft editor),
   #posted-invoice (S-SAL-06 + eBarimt panel, S-EBR-04 print preview).
   Accounting is done by ERP.engine (calcDocument / sales.preview / sales.post); this file only renders.
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;
  var E = function () { return ERP.engine; };
  var printPayload = null;     // D-J3 / UX-SEC-01: qrData + lottery live ONLY in this closure variable, never in state/storage
  var keyHandler = null;

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  function customer(no) { return E().setup.customer(no); }
  function fmtM(c, o) { return E().money.fmt(c, o); }
  function ebLabel(type) { return { B2B_RECEIPT: 'B2B (ТТД-тэй ААН)', B2C_RECEIPT: 'B2C (иргэн)', NONE: 'Үгүй' }[type] || type; }
  function directAccounts() { return E().setup.accounts().filter(function (a) { return a.type === 'POSTING' && a.direct && a.incomeBalance === 'INCOME_STATEMENT'; }); }
  function chainBadge(p) { return E().ebarimt.chainStatus(p); }
  function fmtTs(ts) { return ts ? ui.date(ts.slice(0, 10)) + ts.slice(10) : ''; }
  function opt(v, label, sel) { return '<option value="' + ui.esc(v) + '"' + (sel ? ' selected' : '') + '>' + ui.esc(label) + '</option>'; }

  // ===========================================================================
  // #sales-invoices — list
  // ===========================================================================
  function renderList(el, ctx) {
    var tab = ctx.salesTab || 'drafts';
    var drafts = E().drafts.list(), inv = E().sales.postedInvoices(), cms = E().sales.postedCreditMemos();
    var q = (ctx.salesSearch || '').toLowerCase();
    var match = function (s) { return !q || s.toLowerCase().indexOf(q) >= 0; };
    var html = '<div class="page-head"><div class="title-wrap"><h1>Борлуулалтын нэхэмжлэх</h1></div>' +
      '<div class="row"><button class="btn primary" id="sl-new" type="button">+ Шинэ нэхэмжлэх</button></div></div>';
    html += '<div class="row between"><div class="tabs" role="tablist" data-note="sales.list-tabs">' +
      [['drafts', 'Ноорог', drafts.length], ['posted', 'Батлагдсан нэхэмжлэх', inv.length], ['cm', 'Кредит нот', cms.length]].map(function (t) {
        return '<button class="tab" role="tab" type="button" id="tab-' + t[0] + '" aria-selected="' + (tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + ' <span class="count">' + t[2] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="row"><label class="sr-only" for="sl-search">Хайх</label><input class="input" id="sl-search" type="search" placeholder="Дугаар эсвэл харилцагч…" value="' + ui.esc(ctx.salesSearch || '') + '" style="width:220px"></div></div>';
    if (tab === 'drafts') {
      html += '<div class="card" data-note="sales.draft-list"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Ноорог №</th><th>Харилцагч</th><th>Баримтын огноо</th><th>Бүртгэлийн огноо</th><th class="num">Нийт дүн ≈</th><th>Төлөв</th></tr></thead><tbody>' +
        (drafts.filter(function (d) { return match(d.no + ' ' + (d.customerName || '')); }).map(function (d) {
          var c = E().drafts.calc(d);
          return '<tr class="clickable" data-draft="' + d.no + '" tabindex="0"><td class="code">' + d.no + '</td><td>' + ui.esc(d.customerName || '— харилцагчгүй —') + '</td><td>' + ui.date(d.documentDate) + '</td><td>' + ui.date(d.postingDate) + '</td>' + ui.moneyCell(c.amountInclVat) + '<td>' + ui.pill('DRAFT') + '</td></tr>';
        }).join('') || '<tr><td colspan="6" class="empty">' + (q ? 'Хайлтад тохирох ноорог алга.' : 'Ноорог алга. "+ Шинэ нэхэмжлэх" дарж эхлүүлнэ үү.') + '</td></tr>') + '</tbody></table></div></div>' +
        '<p class="xs muted">Ноорогийн дугаар (DSI-…) завсартай байж болно; хуулийн дугаар SI-2026-##### зөвхөн батлахад олгогдоно (D-C7).</p>';
    } else if (tab === 'posted') {
      html += '<div class="card" data-note="sales.posted-list"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Дугаар</th><th>Огноо</th><th>Харилцагч</th><th class="num">Нийт дүн</th><th class="num">Үлдэгдэл</th><th>Төлбөр</th><th>eBarimt</th><th>Төлөх огноо</th></tr></thead><tbody>' +
        (inv.slice().reverse().filter(function (p) { return match(p.no + ' ' + p.customerName); }).map(function (p) {
          var ps = E().sales.paymentStatus(p);
          return '<tr class="clickable" data-posted="' + p.no + '" tabindex="0"><td class="code">' + p.no + '</td><td>' + ui.date(p.postingDate) + '</td><td>' + ui.esc(p.customerName) + '</td>' + ui.moneyCell(p.amountInclVat) + ui.moneyCell(ps.remaining, { blankZero: true }) +
            '<td>' + ui.pill(ps.badge) + '</td><td>' + ui.pill(chainBadge(p)) + '</td><td>' + ui.date(p.dueDate) + '</td></tr>';
        }).join('') || '<tr><td colspan="8" class="empty">' + (q ? 'Хайлтад тохирох батлагдсан нэхэмжлэх алга.' : 'Батлагдсан нэхэмжлэх алга. Ноорог батлахад энд гарна.') + '</td></tr>') + '</tbody></table></div></div>';
    } else {
      html += '<div class="row between"><p class="small muted" style="margin:0">Кредит нот нь батлагдсан нэхэмжлэхээс үүсч, эх нэхэмжлэхэд автоматаар тулгагдана (BR-SAL-63).</p><button class="btn" type="button" id="sl-new-cm">+ Кредит нот</button></div>' +
        '<div class="card" data-note="sales.cm-list"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Дугаар</th><th>Огноо</th><th>Харилцагч</th><th>Эх нэхэмжлэх</th><th>Шалтгаан</th><th class="num">Нийт дүн</th><th>eBarimt</th></tr></thead><tbody>' +
        (cms.slice().reverse().filter(function (p) { return match(p.no + ' ' + p.customerName); }).map(function (p) {
          return '<tr class="clickable" data-posted="' + p.no + '" tabindex="0"><td class="code">' + p.no + '</td><td>' + ui.date(p.postingDate) + '</td><td>' + ui.esc(p.customerName) + '</td><td class="code">' + ui.esc(p.appliesTo || '') + '</td><td>' + ui.esc(ERP.data.reasonCodes[p.reason] || p.reason || '') + '</td>' + ui.moneyCell(p.amountInclVat) + '<td>' + ui.pill(chainBadge(p)) + '</td></tr>';
        }).join('') || '<tr><td colspan="7" class="empty">' + (q ? 'Хайлтад тохирох кредит нот алга.' : 'Кредит нот алга.') + '</td></tr>') + '</tbody></table></div></div>';
    }
    el.innerHTML = html;
    ui.$$('.tab', el).forEach(function (b) { b.addEventListener('click', function () { ctx.salesTab = b.getAttribute('data-tab'); renderList(el, ctx); app.decorateNotes(); ui.$('#tab-' + ctx.salesTab).focus(); }); });
    var s = ui.$('#sl-search');
    s.addEventListener('input', function () { ctx.salesSearch = s.value; var pos = s.selectionStart; renderList(el, ctx); app.decorateNotes(); var n = ui.$('#sl-search'); n.focus(); n.setSelectionRange(pos, pos); });
    ui.$('#sl-new').addEventListener('click', function () { var d = E().drafts.create(null); app.navigate('sales-invoice', { draftNo: d.no }); });
    var ncm = ui.$('#sl-new-cm');
    if (ncm) ncm.addEventListener('click', function () { app.navigate('credit-memo'); });
    ui.$$('tr[data-draft]', el).forEach(function (tr) {
      var go = function () { app.navigate('sales-invoice', { draftNo: tr.getAttribute('data-draft') }); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    });
    ui.$$('tr[data-posted]', el).forEach(function (tr) {
      var go = function () { app.navigate('posted-invoice', { postedNo: tr.getAttribute('data-posted') }); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    });
  }

  // ===========================================================================
  // #sales-invoice — draft editor
  // ===========================================================================
  function currentDraft(ctx) {
    var d = ctx.draftNo ? E().drafts.get(ctx.draftNo) : null;
    if (!d) d = E().drafts.list()[0] || null;
    if (!d) d = E().drafts.create(null);
    ctx.draftNo = d.no;
    return d;
  }

  function calcBody(d, c) {                            // "Тооцоог харах" — step by step with the real numbers
    var M = E().money;
    var rows = c.lines.filter(function (l) { return !l.blank; }).map(function (l) {
      var exact = M.fmtScaled(l.qty * l.price, 11, 2, 11);
      var ldaExact = l.disc ? M.fmtScaled(BigInt(l.G) * l.disc, 9, 2, 9) : '0';
      return '<tr><td>' + (l.idx + 1) + '</td><td class="code">' + ui.esc(l.no) + '</td><td class="num">' + M.fmtQty(l.qty) + ' × ' + M.fmtPrice(l.price) + ' = ' + exact + '</td><td class="num">' + fmtM(l.G) + '</td>' +
        '<td class="num">' + (l.disc ? ldaExact + ' → ' + fmtM(l.LDA) : '0.00') + '</td><td class="num">' + fmtM(l.LA) + '</td></tr>';
    }).join('');
    var html = '<p><strong>1. Мөрийн дүн</strong> (06 §6.2, BR-SAL-18): G = r(Тоо × Нэгжийн үнэ); хөнгөлөлт LDA = r(G × LD% / 100); мөрийн дүн LA = G − LDA. r = 0.01 хүртэл, тэгээс холдуулж бөөрөнхийлнө (ADR-0006).</p>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөр</th><th>Дугаар</th><th class="num">Тоо × Үнэ (яг)</th><th class="num">G</th><th class="num">LDA</th><th class="num">LA</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="empty">Мөр алга</td></tr>') + '</tbody></table></div>';
    html += '<p><strong>2. НӨАТ баримтын түвшинд</strong>, VAT identifier тус бүрд нэг удаа (D-E3, BR-SAL-22). Үнэ ' + (c.pricesInclVat ? '<strong>НӨАТ-тэй</strong>: НӨАТ = rv(G × r / (100 + r)), суурь = G − НӨАТ (BR-SAL-26)' : '<strong>НӨАТ-гүй</strong>: НӨАТ = rv(Суурь × r / 100)') + '.</p>';
    c.groups.forEach(function (g) {
      html += '<div class="formula">' + ui.esc(g.label) + ' (' + g.calcType + ', тэмдэг ' + g.sign + '):  ' + (c.pricesInclVat ? 'G' : 'Суурь') + ' = ' + fmtM(g.total) +
        '\nЯг НӨАТ = ' + fmtM(g.total) + ' × ' + g.pct + ' / ' + g.den.toString() + (g.carryIn !== 0n ? ' + carry ' + M.fmtRatio(g.carryIn, g.den, 4) : '') + ' = ' + M.fmtRatio(g.exactNum, g.den, 6) +
        '\nБөөрөнхийлсөн НӨАТ = ' + fmtM(g.vat) + (c.pricesInclVat ? '   →   суурь = ' + fmtM(g.total) + ' − ' + fmtM(g.vat) + ' = ' + fmtM(g.base) : '') + '</div>';
      if (g.lines.length > 1 && g.den !== 0n && g.vat !== 0) {
        html += '<p class="xs">Мөрүүдэд хуваарилах (running remainder, BC DivideAmount): rem += НӨАТ × LA / Σ; мөрийн НӨАТ = r(rem); rem −= мөрийн НӨАТ.</p>' +
          '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөр</th><th class="num">Хувь (яг)</th><th class="num">rem өмнө</th><th class="num">Мөрийн НӨАТ</th><th class="num">rem дараа</th><th class="num">Тусад нь бөөрөнхийлвэл</th></tr></thead><tbody>' +
          g.alloc.map(function (a) {
            var line = c.lines[a.line];
            var alone = E().money.roundDiv(BigInt(line.LA) * BigInt(g.pct), c.pricesInclVat ? BigInt(100 + g.pct) : 100n);
            return '<tr><td>' + (a.line + 1) + '</td><td class="num">' + M.fmtRatio(a.shareNum, a.den, 7) + '</td><td class="num">' + M.fmtRatio(a.remBefore, a.den, 7) + '</td><td class="num"><strong>' + fmtM(a.vat) + '</strong></td><td class="num">' + M.fmtRatio(a.remAfter, a.den, 7) + '</td><td class="num">' + fmtM(Number(alone)) + '</td></tr>';
          }).join('') + '</tbody><tfoot><tr><td>Σ</td><td></td><td></td><td class="num">' + fmtM(g.vat) + '</td><td></td><td class="num">' +
          fmtM(g.alloc.reduce(function (s, a) { var l = c.lines[a.line]; return s + Number(E().money.roundDiv(BigInt(l.LA) * BigInt(g.pct), c.pricesInclVat ? BigInt(100 + g.pct) : 100n)); }, 0)) + '</td></tr></tfoot></table></div>';
      }
    });
    html += '<p><strong>3. Нийлбэр</strong> (06 §6.8): Дүн = Σ мөрийн дүн = ' + fmtM(c.amount) + '; НӨАТ = Σ мөрийн НӨАТ = ' + fmtM(c.vatAmount) + '; Нийт = ' + fmtM(c.amountInclVat, { sym: true }) + '. Энэ нь VAT entry, eBarimt-ийн totalVAT-тай яг тэнцүү байна (BR-SAL-23).</p>';
    return html;
  }

  function factbox(d, c, ctx) {
    var cust = d.customer ? customer(d.customer) : null;
    var html = '';
    if (cust) {
      var bal = E().sales.customerBalance(cust.no);
      var ag = E().reports.aging('customer').parties.filter(function (p) { return p.party === cust.no; })[0];
      var overdue = ag ? ag.entries.filter(function (x) { return x.days > 0 && x.remaining > 0; }).reduce(function (s, x) { return s + x.remaining; }, 0) : 0;
      var lastPay = E().state().cle.filter(function (e) { return e.customer === cust.no && e.documentType === 'PAYMENT'; }).slice(-1)[0];
      var limit = E().money.toCents(cust.creditLimit || '0');
      html += '<div class="card" data-note="sales.factbox-customer"><div class="card-head"><h3>Харилцагч</h3><span class="code small">' + cust.no + '</span></div><div class="card-body"><dl class="kv">' +
        '<dt>Үлдэгдэл</dt><dd>' + fmtM(bal) + '</dd><dt>Хугацаа хэтэрсэн</dt><dd' + (overdue ? ' style="color:var(--seal)"' : '') + '>' + fmtM(overdue) + (overdue ? ' ⚠' : '') + '</dd>' +
        '<dt>Зээлийн хязгаар</dt><dd>' + (limit ? fmtM(limit) : '—') + '</dd><dt>Сүүлд төлсөн</dt><dd>' + (lastPay ? ui.date(lastPay.postingDate) : '—') + '</dd>' +
        '<dt>Posting group</dt><dd class="code">' + cust.cpg + ' → ' + E().setup.receivablesAccount(cust.cpg) + '</dd></dl></div></div>';
    }
    var i = Math.min(ctx.selLine || 0, Math.max(0, c.lines.length - 1));
    var l = c.lines[i];
    if (l && !l.blank) {
      var a = l.account ? E().setup.account(l.account) : null;
      html += '<div class="card" data-note="sales.factbox-line"><div class="card-head"><h3>Мөр ' + (i + 1) + '</h3><span class="small muted">' + ui.esc(l.no) + '</span></div><div class="card-body"><dl class="kv">' +
        '<dt>Орлогын данс</dt><dd class="code">' + (a ? a.no : '—') + '</dd><dt colspan="2" style="grid-column:1/3;text-align:left;color:var(--ink-2)">' + (a ? ui.esc(a.name) : '') + '</dt>' +
        '<dt>Тодорхойлсон</dt><dd class="small">' + (l.type === 'ITEM' ? 'Gen. ' + (d.genBus || '?') + ' × ' + l.genProd : 'мөрийн данс') + '</dd>' +
        '<dt>НӨАТ</dt><dd>' + (l.vat ? ui.esc(E().setup.vatLabel(l.vat)) + ' · ' + l.vat.taxType : '—') + '</dd>' +
        '<dt>НӨАТ-ын данс</dt><dd class="code">' + (l.vat ? l.vat.salesAcc : '—') + '</dd>' +
        '<dt>БҮНА код</dt><dd class="code">' + ui.esc(l.bunaa || '—') + '</dd>' +
        (l.taxProductCode ? '<dt>taxProductCode</dt><dd class="code">' + ui.esc(l.taxProductCode) + '</dd>' : '') +
        '</dl></div></div>';
    }
    html += '<div class="card"><div class="card-head"><h3>Хавсралт (0)</h3></div><div class="card-body small muted">Прототипт файл хавсаргахгүй (FR-PLT-011).</div></div>';
    return html;
  }

  function totalsHtml(c) {
    return '<dl class="totals" data-note="sales.totals"><dt>Дүн (НӨАТ-гүй)</dt><dd>' + fmtM(c.amount, { sym: true }) + '</dd>' +
      (c.vatByIdentifier.length ? c.vatByIdentifier.map(function (v) { return '<dt>' + ui.esc(v.label) + (v.label.indexOf('%') < 0 ? ' (суурь ' + fmtM(v.base) + ')' : '') + '</dt><dd>' + fmtM(v.vat, { sym: true }) + '</dd>'; }).join('') : '<dt>НӨАТ</dt><dd>' + fmtM(0, { sym: true }) + '</dd>') +
      '<dt class="grand">Нийт дүн</dt><dd class="grand">' + fmtM(c.amountInclVat, { sym: true }) + '</dd></dl>';
  }

  function renderEditor(el, ctx) {
    var d = currentDraft(ctx);
    var c = E().drafts.calc(d);
    var custs = ERP.data.customers, items = ERP.data.items, accs = directAccounts();
    var due = E().drafts.dueDate(d);
    var resolved = d.customer ? E().drafts.resolvedEbarimtType(d) : null;
    var pm = ERP.data.paymentMethods[d.method];
    var focusId = document.activeElement && document.activeElement.id;
    var html = '<div class="page-head"><div class="title-wrap"><h1>Борлуулалтын нэхэмжлэх</h1><span class="docno">' + d.no + '</span>' + ui.pill('DRAFT') + '</div>' +
      '<span class="small muted">Ноорог санах ойд хадгалагдсан' + (d.note ? ' · ' + ui.esc(d.note) : '') + '</span></div>';
    html += '<div class="actionbar" data-note="sales.actions">' +
      '<button class="btn primary" id="act-post" type="button">Батлах <span class="kbd">F9</span></button>' +
      '<button class="btn" id="act-preview" type="button">Урьдчилан харах</button>' +
      '<button class="btn" id="act-add" type="button">+ Мөр нэмэх</button>' +
      '<button class="btn" id="act-new" type="button">Шинэ ноорог</button>' +
      '<button class="btn danger" id="act-delete" type="button">Ноорог устгах</button></div>';
    html += '<div id="draft-errors"></div>';
    html += '<div class="doc-layout"><div class="doc-main">';
    // header
    html += '<details class="fasttab" open><summary><span class="chev" aria-hidden="true">▸</span>Ерөнхий</summary><div class="ft-body"><div class="form-grid">' +
      '<div class="field" data-note="sales.customer"><label class="req" for="f-customer">Харилцагч</label><select class="select" id="f-customer">' + opt('', '— сонгох —', !d.customer) +
      custs.map(function (x) { return opt(x.no, x.no + ' · ' + x.name, x.no === d.customer); }).join('') + '</select>' +
      (d.customer ? '<span class="hint">' + (customer(d.customer).tin ? 'ТТД ' + customer(d.customer).tin + ' · ' : '') + ui.esc(ERP.data.genBusGroups[d.genBus]) + ' · НӨАТ ' + d.vatBus + '</span>' : '<span class="hint">Харилцагч сонгоход нөхцөл, хэлбэр, бүлэг автоматаар бөглөгдөнө</span>') + '</div>' +
      '<div class="field"><label for="f-docdate">Баримтын огноо</label>' + ui.dateInput('f-docdate', d.documentDate) + '</div>' +
      '<div class="field" data-note="sales.posting-date"><label class="req" for="f-postdate">Бүртгэлийн огноо</label>' + ui.dateInput('f-postdate', d.postingDate) + '<span class="hint">Үе: ' + ui.pillLabel((E().periods.of(d.postingDate || '') || {}).status || 'CLOSED') + '</span></div>' +
      '<div class="field" data-note="sales.due-date"><label for="f-duedate">Төлөх огноо</label>' + ui.dateInput('f-duedate', due) + '<span class="hint">' + (d.dueDate ? 'гараар засварласан' : 'нөхцөлөөс: ' + ((ERP.data.paymentTerms[d.terms] || {}).formula || '—') + ' + баримтын огноо') + '</span></div>' +
      '<div class="field"><label for="f-terms">Төлбөрийн нөхцөл</label><select class="select" id="f-terms">' + Object.keys(ERP.data.paymentTerms).map(function (k) { return opt(k, ERP.data.paymentTerms[k].name, k === d.terms); }).join('') + '</select></div>' +
      '<div class="field" data-note="sales.payment-method"><label for="f-method">Төлбөрийн хэлбэр</label><select class="select" id="f-method">' + Object.keys(ERP.data.paymentMethods).map(function (k) { return opt(k, ERP.data.paymentMethods[k].name, k === d.method); }).join('') + '</select>' +
      (pm && pm.balBank ? '<span class="hint">Бэлэн борлуулалт: батлахад кассын орлого (МХ-1) автоматаар бичигдэнэ (D-F5)</span>' : '') + '</div>' +
      '<div class="field" data-note="sales.piv"><span class="flabel">Үнийн горим</span><label class="checkbox" for="f-piv"><input type="checkbox" id="f-piv"' + (d.piv ? ' checked' : '') + '> Үнэ НӨАТ-тэй</label></div>' +
      '</div></div></details>';
    // eBarimt
    html += '<details class="fasttab" open><summary><span class="chev" aria-hidden="true">▸</span>eBarimt</summary><div class="ft-body"><div class="form-grid">' +
      '<div class="field" data-note="sales.ebarimt-type"><label for="f-ebtype">Баримтын төрөл</label><select class="select" id="f-ebtype">' +
      [['AUTO', 'Автомат'], ['B2C_RECEIPT', 'B2C (иргэн)'], ['B2B_RECEIPT', 'B2B (ААН)'], ['NONE', 'Үгүй']].map(function (x) { return opt(x[0], x[1], (d.ebarimtType || 'AUTO') === x[0]); }).join('') + '</select>' +
      '<span class="hint">' + (resolved ? '→ ' + ebLabel(resolved) + ((d.ebarimtType || 'AUTO') === 'AUTO' ? (resolved === 'B2B_RECEIPT' ? ' — ТТД-тэй ААН' : ' — ТТД-гүй / иргэн') : '') : 'харилцагч сонгоно уу') + '</span></div>' +
      (resolved === 'B2B_RECEIPT' ? '<div class="field"><label for="f-buyertin">Худалдан авагчийн ТТД</label><input class="input mono" id="f-buyertin" value="' + ui.esc(customer(d.customer).tin || '') + '" readonly></div>' : '') +
      (resolved === 'B2C_RECEIPT' ? '<div class="field"><label for="f-consumer">Иргэний eBarimt дугаар (8 орон)</label><input class="input mono" id="f-consumer" inputmode="numeric" maxlength="8" value="' + ui.esc(d.consumerNo || '') + '" placeholder="заавал биш"></div>' : '') +
      '</div></div></details>';
    html += '</div><aside class="factbox" id="factbox">' + factbox(d, c, ctx) + '</aside></div>';
    // lines: full width under header + FactBox (the grid has 10 columns; BC lines subpage spans the page)
    html += '<div class="card" data-note="sales.lines"><div class="card-head"><h2>Мөрүүд</h2><span class="small muted">' + (d.piv ? 'Үнэ НӨАТ-тэй' : 'Үнэ НӨАТ-гүй') + '</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table lines-grid"><thead><tr>' +
      '<th>Төрөл</th><th>Дугаар</th><th>Тайлбар</th><th class="num">Тоо</th><th>Нэгж</th><th class="num">Нэгжийн үнэ</th><th class="num">Хөн.%</th><th class="num">Мөрийн дүн</th><th>НӨАТ</th><th><span class="sr-only">Устгах</span></th></tr></thead><tbody>' +
      d.lines.map(function (l, i) {
        var cl = c.lines[i];
        var noOpts = l.type === 'ITEM' ? opt('', '— бараа —', !l.no) + items.map(function (it) { return opt(it.no, it.no + ' ' + it.name, it.no === l.no); }).join('')
          : opt('', '— данс —', !l.no) + accs.map(function (a) { return opt(a.no, a.no + ' ' + a.name, a.no === l.no); }).join('');
        var vatSel = cl.vatProd || '';
        return '<tr data-line="' + i + '"' + ((ctx.selLine || 0) === i ? ' class="sel"' : '') + '>' +
          '<td><label class="sr-only" for="l-type-' + i + '">Мөрийн төрөл ' + (i + 1) + '</label><select class="select" id="l-type-' + i + '">' + opt('ITEM', 'Бараа', l.type === 'ITEM') + opt('GL_ACCOUNT', 'Данс', l.type === 'GL_ACCOUNT') + '</select></td>' +
          '<td><label class="sr-only" for="l-no-' + i + '">Дугаар ' + (i + 1) + '</label><select class="select" id="l-no-' + i + '">' + noOpts + '</select></td>' +
          '<td><label class="sr-only" for="l-desc-' + i + '">Тайлбар ' + (i + 1) + '</label><input class="input" id="l-desc-' + i + '" value="' + ui.esc(l.description) + '"></td>' +
          '<td><label class="sr-only" for="l-qty-' + i + '">Тоо ' + (i + 1) + '</label><input class="input num" id="l-qty-' + i + '" inputmode="decimal" value="' + ui.esc(l.qty) + '"></td>' +
          '<td>' + ui.esc(cl.uomName || '') + '</td>' +
          '<td><label class="sr-only" for="l-price-' + i + '">Нэгжийн үнэ ' + (i + 1) + '</label><input class="input num" id="l-price-' + i + '" inputmode="decimal" value="' + ui.esc(l.price) + '"></td>' +
          '<td><label class="sr-only" for="l-disc-' + i + '">Хөнгөлөлт ' + (i + 1) + '</label><input class="input num" id="l-disc-' + i + '" inputmode="decimal" value="' + ui.esc(l.disc || '0') + '"></td>' +
          '<td class="num" id="l-amt-' + i + '">' + (cl.blank ? '' : fmtM(cl.LA)) + '</td>' +
          '<td><label class="sr-only" for="l-vat-' + i + '">НӨАТ-ын бүлэг ' + (i + 1) + '</label><select class="select" id="l-vat-' + i + '">' + opt('', '—', !vatSel) + Object.keys(ERP.data.vatProdGroups).filter(function (k) { return ['VAT10', 'VAT0', 'EXEMPT', 'NOVAT'].indexOf(k) >= 0; }).map(function (k) { return opt(k, ERP.data.vatProdGroups[k], k === vatSel); }).join('') + '</select></td>' +
          '<td><button class="btn ghost sm" type="button" id="l-del-' + i + '" aria-label="Мөр ' + (i + 1) + ' устгах">✕</button></td></tr>';
      }).join('') +
      (d.lines.length ? '' : '<tr><td colspan="10" class="empty">Мөр алга. "+ Мөр нэмэх" дарна уу.</td></tr>') + '</tbody></table></div></div></div>';
    html += '<div id="totals-box">' + totalsHtml(c) + '</div>';
    html += '<div data-note="sales.calc" id="calc-wrap">' + ui.calc('Тооцоог харах: мөрийн дүн ба НӨАТ', calcBody(d, c), 'calc-details') + '</div>';
    el.innerHTML = html;
    bindEditor(el, ctx, d);
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
    var calcOpen = ctx.calcOpen; if (calcOpen) ui.$('#calc-details').open = true;
    ui.$('#calc-details').addEventListener('toggle', function () { ctx.calcOpen = ui.$('#calc-details').open; });
  }

  function rerender(ctx) { renderEditor(document.getElementById('screen-body'), ctx); app.decorateNotes(); }
  function softUpdate(ctx, d) {                        // while typing: update amounts + totals without losing the caret
    var c = E().drafts.calc(d);
    c.lines.forEach(function (cl, i) { var td = document.getElementById('l-amt-' + i); if (td) td.textContent = cl.blank ? '' : fmtM(cl.LA); });
    ui.$('#totals-box').innerHTML = totalsHtml(c);
    var open = ui.$('#calc-details').open;
    ui.$('#calc-wrap').innerHTML = ui.calc('Тооцоог харах: мөрийн дүн ба НӨАТ', calcBody(d, c), 'calc-details');
    ui.$('#calc-details').open = open;
    ui.$('#calc-details').addEventListener('toggle', function () { ctx.calcOpen = ui.$('#calc-details').open; });
    ui.$('#factbox').innerHTML = factbox(d, c, ctx);
    app.decorateNotes();
  }

  function bindEditor(el, ctx, d) {
    var on = function (id, ev, fn) { var x = document.getElementById(id); if (x) x.addEventListener(ev, fn); };
    on('f-customer', 'change', function (ev) {
      var v = ev.target.value;
      if (!v) { ev.target.value = d.customer || ''; return; }
      var apply = function () { E().drafts.setCustomer(d, v); rerender(ctx); };
      if (d.lines.length && d.customer) {
        ui.confirm({ title: 'Харилцагч солих', body: '<p>Харилцагч солиход мөрийн НӨАТ ба дансны тохиргоо дахин тооцогдоно. Үнэ өөрчлөгдөхгүй (BR-SAL-04). Үргэлжлүүлэх үү?</p>', ok: 'Солих' })
          .then(function (ok) { if (ok) apply(); else ev.target.value = d.customer; });
      } else apply();
    });
    var dateField = function (id, set, allowEmpty) {
      on(id, 'change', function (ev) {
        var v = ev.target.value.trim();
        if (!v && allowEmpty) { set(null); rerender(ctx); return; }
        var iso = ui.parseDate(v);
        if (!iso) { ev.target.classList.add('invalid'); ui.toast('Огноог ЖЖЖЖ.СС.ӨӨ хэлбэрээр оруулна уу (жишээ 2026.10.08).', 'error'); return; }
        set(iso); rerender(ctx);
      });
    };
    dateField('f-docdate', function (v) { d.documentDate = v; });
    dateField('f-postdate', function (v) { d.postingDate = v; });
    dateField('f-duedate', function (v) { d.dueDate = v; }, true);
    on('f-terms', 'change', function (ev) { d.terms = ev.target.value; d.dueDate = null; rerender(ctx); });
    on('f-method', 'change', function (ev) { d.method = ev.target.value; rerender(ctx); });
    on('f-ebtype', 'change', function (ev) { d.ebarimtType = ev.target.value; rerender(ctx); });
    on('f-consumer', 'input', function (ev) { d.consumerNo = ev.target.value.replace(/\D/g, '').slice(0, 8); });
    on('f-piv', 'change', function (ev) {
      var want = ev.target.checked;
      if (!d.lines.length) { E().drafts.setPricesInclVat(d, want, false); rerender(ctx); return; }
      ev.target.checked = !want;
      var m = ui.modal({ title: 'Үнийн горим солих', body: '<p>Мөртэй ноорог дээр "Үнэ НӨАТ-тэй"-г солиход нэгжийн үнийг яах вэ? (BR-SAL-27)</p><ul><li><strong>Хөрвүүлэх</strong>: үнэ × ' + (want ? '110/100' : '100/110') + ' (0.00001 нарийвчлалаар) — нийт дүн бараг хэвээр.</li><li><strong>Хэвээр үлдээх</strong>: үнэ хэвээр, НӨАТ ба нийт дүн өөрчлөгдөнө.</li></ul>',
        footer: [{ label: 'Болих' }, { label: 'Хэвээр үлдээх', onClick: function (close) { E().drafts.setPricesInclVat(d, want, false); close(true); rerender(ctx); } },
          { label: 'Хөрвүүлэх', kind: 'primary', onClick: function (close) { E().drafts.setPricesInclVat(d, want, true); close(true); rerender(ctx); } }] });
      return m;
    });
    d.lines.forEach(function (l, i) {
      on('l-type-' + i, 'change', function (ev) { E().drafts.setLineNo(d, i, ev.target.value, ''); ctx.selLine = i; rerender(ctx); });
      on('l-no-' + i, 'change', function (ev) { E().drafts.setLineNo(d, i, l.type, ev.target.value); ctx.selLine = i; rerender(ctx); });
      on('l-desc-' + i, 'input', function (ev) { l.description = ev.target.value; });
      ['qty', 'price', 'disc'].forEach(function (f) {
        on('l-' + f + '-' + i, 'input', function (ev) { l[f] = ev.target.value.replace(/[\s ]/g, ''); softUpdate(ctx, d); });
        on('l-' + f + '-' + i, 'change', function () { rerender(ctx); });
      });
      on('l-vat-' + i, 'change', function (ev) { l.vatProd = ev.target.value || null; rerender(ctx); });
      on('l-del-' + i, 'click', function () { E().drafts.removeLine(d, i); ctx.selLine = 0; rerender(ctx); });
    });
    ui.$$('tr[data-line]', el).forEach(function (tr) {
      tr.addEventListener('focusin', function () {
        var i = +tr.getAttribute('data-line');
        if (ctx.selLine !== i) { ctx.selLine = i; ui.$$('tr[data-line]', el).forEach(function (t) { t.classList.toggle('sel', t === tr); }); ui.$('#factbox').innerHTML = factbox(d, E().drafts.calc(d), ctx); app.decorateNotes(); }
      });
    });
    on('act-add', 'click', function () {
      E().drafts.addLine(d, { type: 'ITEM', no: '', qty: '1' });
      ctx.selLine = d.lines.length - 1; rerender(ctx);
      var n = document.getElementById('l-no-' + (d.lines.length - 1)); if (n) n.focus();
    });
    on('act-new', 'click', function () { var nd = E().drafts.create(null); app.navigate('sales-invoice', { draftNo: nd.no, selLine: 0 }); });
    on('act-delete', 'click', function () {
      ui.confirm({ title: 'Ноорог устгах', body: '<p>Ноорог ' + d.no + '-ийг устгах уу? Хуулийн дугаарт нөлөөлөхгүй (BR-SAL-08); устгалт эцсийнх.</p>', ok: 'Устгах', danger: true })
        .then(function (ok) { if (!ok) return; E().drafts.remove(d.no); ui.toast('Ноорог ' + d.no + ' устгагдлаа.'); ctx.draftNo = null; app.navigate('sales-invoices', { salesTab: 'drafts' }); });
    });
    on('act-preview', 'click', function () { openPreview(d, ctx); });
    on('act-post', 'click', function () { doPost(d, ctx); });
  }

  // --- preview (S-GL-08) -------------------------------------------------------
  function previewTables(r) {
    var M = E().money, setup = E().setup;
    var res = r.result, gl = [], vat = [], cle = [], dcle = [], ble = [], cv = [];
    res.vouchers.forEach(function (v) { gl = gl.concat(v.gl); vat = vat.concat(v.vat); cle = cle.concat(v.cle); dcle = dcle.concat(v.dcle); ble = ble.concat(v.ble); if (v.cashVoucher) cv.push(v.cashVoucher); });
    var dr = gl.reduce(function (s, e) { return s + Math.max(e.amount, 0); }, 0), cr = gl.reduce(function (s, e) { return s + Math.max(-e.amount, 0); }, 0);
    var t = {};
    t.gl = '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Ваучер</th><th>Данс</th><th>Дансны нэр</th><th>Тайлбар</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
      gl.map(function (e) { return '<tr><td class="code">' + ui.esc(e.documentNo) + ' · ' + ui.esc(e.documentType) + '</td><td class="code">' + e.account + '</td><td>' + ui.esc(setup.account(e.account).name) + '</td><td>' + ui.esc(e.description) + '</td>' + ui.moneyCell(Math.max(e.amount, 0), { blankZero: true }) + ui.moneyCell(Math.max(-e.amount, 0), { blankZero: true }) + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="4">Σ ' + (dr === cr ? '✓ Дебит = Кредит (D-C5)' : '✕ тэнцэхгүй') + '</td>' + ui.moneyCell(dr) + ui.moneyCell(cr) + '</tr></tfoot></table></div>';
    t.vat = '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Төрөл</th><th>VAT bus × prod</th><th>Ангилал</th><th class="num">%</th><th class="num">Суурь</th><th class="num">НӨАТ</th><th>taxType</th></tr></thead><tbody>' +
      vat.map(function (e) { return '<tr><td>' + e.type + '</td><td class="code">' + e.vatBus + ' × ' + e.vatProd + '</td><td>' + e.category + '</td><td class="num">' + e.pct + '</td>' + ui.moneyCell(e.base) + ui.moneyCell(e.amount) + '<td class="code">' + e.taxType + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="xs muted">Тэмдэг (BR-TAX-29): борлуулалтын нэхэмжлэхийн суурь ба НӨАТ сөрөг; тайланд OPPOSITE_SIGN-ээр эерэг гарна.</p>';
    t.ar = '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Харилцагч</th><th>Төрөл</th><th class="num">Дүн</th><th>Төлөх огноо</th></tr></thead><tbody>' +
      cle.map(function (e) { return '<tr><td>' + ui.esc(customer(e.customer).name) + '</td><td>' + e.documentType + '</td>' + ui.moneyCell(e.amount) + '<td>' + ui.date(e.dueDate) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="small"><strong>Detailed entry</strong> (D-F3):</p><div class="table-wrap"><table class="grid-table"><thead><tr><th>Төрөл</th><th class="num">Дүн</th><th>Тулгалт №</th></tr></thead><tbody>' +
      dcle.map(function (x) { return '<tr><td>' + x.entryType + '</td>' + ui.moneyCell(x.amount) + '<td>' + (x.applicationNo ? '#' + x.applicationNo : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    t.bank = ble.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөнгөний данс</th><th>Тайлбар</th><th class="num">Дүн</th><th>МХ баримт</th></tr></thead><tbody>' +
      ble.map(function (b) { return '<tr><td>' + ui.esc(setup.bank(b.bank).name) + '</td><td>' + ui.esc(b.description) + '</td>' + ui.moneyCell(b.amount) + '<td class="code">' + ui.esc(b.cashVoucherNo || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">Банк, кассын бичилт үүсэхгүй (зээлийн нэхэмжлэх).</p>';
    return { tables: t, counts: { gl: gl.length, vat: vat.length, ar: cle.length, bank: ble.length } };
  }
  function determinationCalc(d, c) {
    var setup = E().setup;
    var rows = c.lines.filter(function (l) { return !l.blank && l.qty !== 0n; }).map(function (l) {
      var how = l.type === 'ITEM' ? 'General Posting Setup (' + d.genBus + ' × ' + l.genProd + ')' + (setup.genPostingSetup(d.genBus, l.genProd) && setup.genPostingSetup(d.genBus, l.genProd).bus === '*' ? ' — "*" мөр' : '') + ' → sales_account' : 'мөрийн данс (direct posting шалгасан)';
      return '<tr><td>' + (l.idx + 1) + '</td><td class="code">' + ui.esc(l.no) + '</td><td>' + ui.esc(how) + '</td><td class="code">' + l.account + '</td><td class="code">' + d.vatBus + ' × ' + l.vatProd + ' → ' + (l.vat ? l.vat.salesAcc : '?') + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөр</th><th>Дугаар</th><th>Орлогын данс хэрхэн</th><th>Данс</th><th>VAT Posting Setup → данс</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p>Авлагын данс: баримтын харилцагчийн posting group <code>' + d.cpg + '</code> → <code>' + setup.receivablesAccount(d.cpg) + '</code> (BR-SAL-43). Ижил (данс, бүлгүүд) түлхүүртэй мөрүүд posting buffer-т нэгтгэгдэж нэг G/L ба нэг VAT entry болно (BR-SAL-44).</p>';
  }
  function openPreview(d, ctx) {
    var r = E().sales.preview(d);
    if (!r.ok) { showErrors(r.errors, r.warnings); return; }
    var pt = previewTables(r);
    var tabs = [['gl', 'Ерөнхий дэвтэр', pt.counts.gl], ['vat', 'НӨАТ', pt.counts.vat], ['ar', 'Авлага', pt.counts.ar], ['bank', 'Банк/касс', pt.counts.bank], ['eb', 'eBarimt', r.ebarimtRequest ? 1 : 0]];
    var eb = r.ebarimtRequest ? '<p>Тодорхойлсон төрөл: <strong>' + ebLabel(r.posted.ebarimtType) + '</strong>. ' + r.ebarimtRequest.receipts.map(function (x) { return x.taxType + ': ' + fmtM(Math.round(x.totalAmount * 100)) + ' (НӨАТ ' + fmtM(Math.round(x.totalVAT * 100)) + ')'; }).join(' · ') +
      '</p><p class="xs muted">Урьдчилан харахад QR ба сугалаа байхгүй (UX-POST-10). Батлах үед энэ JSON PosAPI руу илгээгдэнэ.</p>' + ui.json(r.ebarimtRequest) : '<p class="muted">eBarimt үүсэхгүй.</p>';
    var body = '<div class="stack" data-note="sales.preview">' + ui.warnList(r.warnings) +
      '<p class="small">Баримтын дугаар <code>***</code> — хуулийн дугаар зөвхөн батлахад олгогдоно (UX-POST-10). Урьдчилан харах нь батлахтай ижил кодыг ажиллуулаад буцаана (ROLLBACK, D-C6).</p>' +
      '<div class="tabs" role="tablist">' + tabs.map(function (t, i) { return '<button class="tab" role="tab" type="button" id="pv-tab-' + t[0] + '" aria-selected="' + (i === 0) + '" data-pv="' + t[0] + '">' + t[1] + ' <span class="count">(' + t[2] + ')</span></button>'; }).join('') + '</div>' +
      '<div id="pv-body">' + pt.tables.gl + '</div>' + ui.calc('Тооцоог харах: данс тодорхойлолт', determinationCalc(d, r.calc)) + '</div>';
    var m = ui.modal({ title: 'Батлахын өмнө харах — ' + d.no, wide: true, body: body,
      footer: [{ label: 'Хаах' }, { label: 'Батлах', kind: 'primary', onClick: function (close) { close(true); doPost(d, ctx); } }] });
    var all = { gl: pt.tables.gl, vat: pt.tables.vat, ar: pt.tables.ar, bank: pt.tables.bank, eb: eb };
    ui.$$('[data-pv]', m.el).forEach(function (b) {
      b.addEventListener('click', function () {
        ui.$$('[data-pv]', m.el).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        ui.$('#pv-body', m.el).innerHTML = all[b.getAttribute('data-pv')];
      });
    });
    app.decorateNotes(m.el);
  }
  function showErrors(errors, warnings) {
    var box = document.getElementById('draft-errors');
    if (box) { box.innerHTML = ui.errList(errors) + ui.warnList(warnings); box.scrollIntoView({ block: 'nearest' }); }
    ui.toast('Батлах боломжгүй: ' + errors.length + ' алдаа', 'error');
  }
  function doPost(d, ctx) {
    var pc = E().sales.precheck(d);
    if (pc.errors.length) { showErrors(pc.errors, pc.warnings); return; }
    var c = E().drafts.calc(d);
    var cust = customer(d.customer);
    var type = E().drafts.resolvedEbarimtType(d);
    ui.confirm({ title: 'Нэхэмжлэх батлах уу?', ok: 'Батлах',
      body: '<p><strong>' + ui.esc(cust.name) + '</strong> · ' + ui.date(d.postingDate) + ' · нийт <strong>' + fmtM(c.amountInclVat, { sym: true }) + '</strong></p>' +
        '<p>Батлахад хуулийн дугаар (SI-2026-#####) завсаргүй цувралаас олгогдож, ерөнхий дэвтэр, НӨАТ, авлагын бичилт нэг гүйлгээнд үүснэ. Дараа нь засахгүй — зөвхөн кредит нотоор засна (UXP-05).</p>' +
        '<p>eBarimt: ' + ebLabel(type) + (type === 'B2C_RECEIPT' ? ' — батласны дараа шууд илгээж хэвлэх цонх нээгдэнэ.' : type === 'B2B_RECEIPT' ? ' — илгээх дараалалд орно (асинхрон).' : '') + '</p>' + ui.warnList(pc.warnings) })
      .then(function (ok) {
        if (!ok) return;
        var r = E().sales.post(d, { interactive: true });
        if (!r.ok) { showErrors(r.errors, r.warnings); return; }
        ui.toast('Нэхэмжлэх <strong>' + r.posted.no + '</strong> батлагдлаа.');
        ctx.postedNo = r.posted.no; ctx.draftNo = null;
        if (r.printPayload) { printPayload = r.printPayload; ERP.engine.state().session.b2cPrinted += 1; }
        app.navigate('posted-invoice');
        if (r.printPayload) setTimeout(function () { openPrint(r.posted, true); }, 30);
        else if (r.ebarimt && r.ebarimt.status === 'PENDING') {
          ui.toast('eBarimt илгээх дараалалд орлоо.');
          var id = r.ebarimt.id, no = r.posted.no;
          setTimeout(function () {
            E().ebarimt.dispatch(id);
            if (app.current === 'posted-invoice' && app.ctx.postedNo === no) app.refresh();
            var doc = E().ebarimt.get(id);
            ui.toast('eBarimt ' + no + ': ' + ui.pillLabel(doc.status) + (doc.ddtd ? ' · ДДТД …' + doc.ddtd.slice(-6) : ''));
          }, 2600);
        }
      });
  }

  // ===========================================================================
  // #posted-invoice
  // ===========================================================================
  function currentPosted(ctx) {
    var p = ctx.postedNo ? E().sales.getPosted(ctx.postedNo) : null;
    if (!p) { var l = E().sales.postedInvoices(); p = l[l.length - 1]; ctx.postedNo = p ? p.no : null; }
    return p;
  }
  function entriesHtml(p) {
    var S = E().state(), setup = E().setup;
    var txs = [p.transactionNo, p.paymentTransactionNo].filter(Boolean);
    var gl = S.glEntries.filter(function (e) { return txs.indexOf(e.transactionNo) >= 0; });
    var vat = S.vatEntries.filter(function (e) { return txs.indexOf(e.transactionNo) >= 0; });
    var cle = S.cle.filter(function (e) { return e.documentNo === p.no; });
    var det = S.dcle.filter(function (x) { return cle.some(function (e) { return e.entryNo === x.cleEntryNo; }); });
    var ble = S.ble.filter(function (b) { return txs.indexOf(b.transactionNo) >= 0; });
    return '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Бичилт №</th><th>Гүйлгээ №</th><th>Данс</th><th>Нэр</th><th class="num">Дебит</th><th class="num">Кредит</th><th title="Source code (эх сурвалжийн код)">Эх код</th></tr></thead><tbody>' +
      gl.map(function (e) { return '<tr><td class="code">' + e.entryNo + '</td><td class="code">' + e.transactionNo + '</td><td class="code">' + e.account + '</td><td>' + ui.esc(setup.account(e.account).name) + '</td>' + ui.moneyCell(Math.max(e.amount, 0), { blankZero: true }) + ui.moneyCell(Math.max(-e.amount, 0), { blankZero: true }) + '<td class="code">' + e.sourceCode + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<div class="grid cols-2"><div><h3 class="small">НӨАТ-ын бичилт (tax.vat_entry)</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>№</th><th>Ангилал</th><th class="num">Суурь</th><th class="num">НӨАТ</th><th>Хаагдсан</th></tr></thead><tbody>' +
      vat.map(function (e) { return '<tr><td class="code">' + e.entryNo + '</td><td>' + e.category + '</td>' + ui.moneyCell(e.base) + ui.moneyCell(e.amount) + '<td>' + (e.closed ? 'Тийм (' + (e.vatReturnPeriod || '') + ')' : 'Үгүй') + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div><h3 class="small">Авлагын detailed бичилт</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>№</th><th>Төрөл</th><th>Огноо</th><th>Баримт</th><th class="num">Дүн</th></tr></thead><tbody>' +
      det.map(function (x) { return '<tr><td class="code">' + x.entryNo + '</td><td>' + x.entryType + (x.unapplied ? ' (буцаасан)' : '') + '</td><td>' + ui.date(x.postingDate) + '</td><td class="code">' + ui.esc(x.documentNo) + '</td>' + ui.moneyCell(x.amount) + '</tr>'; }).join('') + '</tbody></table></div></div></div>' +
      (ble.length ? '<p class="small">Банк/касс: ' + ble.map(function (b) { return ui.esc(setup.bank(b.bank).name) + ' ' + fmtM(b.amount, { sym: true }) + (b.cashVoucherNo ? ' · МХ баримт ' + b.cashVoucherNo : ''); }).join('; ') + '</p>' : '');
  }
  function timelineHtml(doc) {
    return '<ol class="timeline">' + doc.events.map(function (e) {
      return '<li><span class="tl-time mono">' + ui.esc(ui.date(e.at.slice(0, 10)) + ' ' + e.at.slice(11, 19)) + '</span>' + ui.pill(e.status) + '<span>' + ui.esc(e.text) + '</span></li>';
    }).join('') + '</ol>';
  }
  function renderPosted(el, ctx) {
    var p = currentPosted(ctx);
    if (!p) { el.innerHTML = '<div class="card"><div class="empty">Батлагдсан нэхэмжлэх алга.</div></div>'; return; }
    var isInv = p.docType === 'INVOICE';
    var ps = E().sales.paymentStatus(p);
    var doc = p.ebarimtDocId ? E().ebarimt.get(p.ebarimtDocId) : null;
    var chain = chainBadge(p);
    var req = doc && doc.operation !== 'DELETE' ? E().ebarimt.buildRequest(doc) : null;
    var chk = req ? E().ebarimt.chainOk(req) : null;
    var hasPayload = printPayload && printPayload.docId === (doc && doc.id);
    var html = '<div class="page-head"><div class="title-wrap"><h1>' + (isInv ? 'Борлуулалтын нэхэмжлэх' : 'Кредит нот') + '</h1><span class="docno">' + p.no + '</span><span class="stamp">Бичигдсэн</span>' +
      (isInv ? ui.pill(ps.badge) : ui.pill('CORRECTIVE', 'Кредит нот')) + ui.pill(chain) + '</div>' +
      '<span class="small muted">Ноорог ' + ui.esc(p.draftNo.replace(/^SRC-.*/, '(эх өгөгдлөөс)')) + ' · гүйлгээ №' + p.transactionNo + '</span></div>';
    html += '<div class="actionbar">' +
      (hasPayload ? '<button class="btn primary" id="pp-print" type="button">eBarimt хэвлэх цонх (QR-тай)</button>' : '') +
      (doc && doc.status === 'SUCCESS' ? '<button class="btn" id="pp-copy" type="button">Хуулбар харах (QR-гүй)</button>' : '') +
      '<a class="btn" href="#sales-invoices">Жагсаалт руу</a>' +
      '<button class="btn" type="button" disabled title="Кредит нотыг зөвхөн батлагдсан нэхэмжлэхээс үүсгэнэ">Кредит нот үүсгэх</button>' +
      '<button class="btn" type="button" disabled title="Зөвхөн үлдэгдэлтэй нэхэмжлэхэд төлбөр бүртгэнэ">Төлбөр бүртгэх</button></div>';
    if (doc && (doc.status === 'ERROR' || doc.status === 'UNKNOWN')) html += '<div class="banner danger" data-note="posted.ebarimt-problem"><strong>' + (isInv ? 'Нэхэмжлэх' : 'Кредит нот') + ' батлагдсан. Зөвхөн eBarimt-ийн баримт асуудалтай.</strong> ' + (doc.status === 'UNKNOWN' ? 'Илгээсэн эсэх нь тодорхойгүй — автоматаар дахин илгээхгүй, eBarimt хяналтаар гараар шийдвэрлэнэ (D-J2). ' : 'Алдааг засаад eBarimt хяналтаас дахин илгээнэ. ') + '<a href="#ebarimt">eBarimt хяналт ›</a></div>';
    html += '<div class="doc-layout"><div class="doc-main">';
    html += '<div class="card"><div class="card-body"><dl class="form-grid ro-grid">' +
      [['Харилцагч', p.customer + ' · ' + p.customerName], ['ТТД', p.customerTin || '—'], ['Бүртгэлийн огноо', ui.date(p.postingDate)], ['Баримтын огноо', ui.date(p.documentDate)],
        ['Төлөх огноо', ui.date(p.dueDate)], ['НӨАТ-ын огноо', ui.date(p.vatDate)], ['Төлбөрийн нөхцөл', (ERP.data.paymentTerms[p.terms] || {}).name], ['Төлбөрийн хэлбэр', (ERP.data.paymentMethods[p.method] || {}).name],
        ['Үнийн горим', p.piv ? 'НӨАТ-тэй' : 'НӨАТ-гүй'], ['eBarimt төрөл', ebLabel(p.ebarimtType)]].concat(isInv ? [] : [['Эх нэхэмжлэх', p.appliesTo || '—'], ['Шалтгаан', ERP.data.reasonCodes[p.reason] || p.reason || '—']])
        .map(function (x) { return '<div class="field"><dt class="flabel">' + x[0] + '</dt><dd>' + ui.esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div></div>';
    html += '</div><aside class="factbox">';
    html += '<div class="card"><div class="card-head"><h3>Төлбөр</h3>' + (isInv ? ui.pill(ps.badge) : '') + '</div><div class="card-body"><dl class="kv"><dt>Нийт</dt><dd>' + fmtM(p.amountInclVat) + '</dd><dt>Үлдэгдэл</dt><dd>' + fmtM(isInv ? ps.remaining : 0) + '</dd>' +
      (p.cashVoucherNo ? '<dt>Кассын баримт</dt><dd class="code">' + p.cashVoucherNo + '</dd>' : '') + '<dt>Төлөх огноо</dt><dd>' + ui.date(p.dueDate) + '</dd></dl></div></div>';
    if (doc) html += '<div class="card"><div class="card-head"><h3>eBarimt</h3>' + ui.pill(chain) + '</div><div class="card-body small">' + (doc.ddtd ? 'ДДТД <span class="mono">…' + doc.ddtd.slice(-6) + '</span><br>' + ui.esc(fmtTs(doc.ebarimtDate || '')) : ui.esc(doc.errorText || 'ДДТД олгогдоогүй')) + '</div></div>';
    html += '</aside></div>';
    // lines, eBarimt, JSON and entries: full width under header + FactBox
    html += '<div class="card"><div class="card-head"><h2>Мөрүүд</h2></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Дугаар</th><th>Тайлбар</th><th class="num">Тоо</th><th class="num">Нэгжийн үнэ</th><th class="num">Хөн.%</th><th class="num">Дүн (НӨАТ-гүй)</th><th class="num">НӨАТ</th><th class="num">Нийт</th><th>Данс</th><th>taxType</th></tr></thead><tbody>' +
      p.lines.filter(function (l) { return l.no; }).map(function (l) { return '<tr><td class="code">' + ui.esc(l.no) + '</td><td>' + ui.esc(l.description) + '</td><td class="num">' + ui.esc(l.qty) + ' ' + ui.esc(l.uomName || '') + '</td><td class="num">' + ui.esc(E().money.fmtPrice(E().money.parseScaled(l.unitPrice, 6))) + '</td><td class="num">' + ui.esc(l.disc) + '</td>' + ui.moneyCell(l.amount) + ui.moneyCell(l.vat) + ui.moneyCell(l.aiv) + '<td class="code">' + l.account + '</td><td class="code">' + l.taxType + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>';
    html += totalsHtml({ amount: p.amount, vatByIdentifier: p.vatByIdentifier, amountInclVat: p.amountInclVat });
    // eBarimt panel
    if (doc) {
      html += '<div class="card" data-note="posted.ebarimt"><div class="card-head"><h2>eBarimt</h2>' + ui.pill(doc.status) + '</div><div class="card-body stack">' +
        '<dl class="kv"><dt>Төрөл / үйлдэл</dt><dd>' + ebLabel(doc.type) + ' · ' + doc.operation + (doc.inactiveId ? ' · inactiveId' : '') + '</dd>' +
        '<dt>ДДТД</dt><dd class="mono">' + (doc.ddtd ? ui.esc(doc.ddtd) + ' <button class="btn ghost sm" id="pp-copy-ddtd" type="button" aria-label="ДДТД хуулах">Хуулах</button>' : '—') + '</dd>' +
        (doc.inactiveId ? '<dt>Засаж буй ДДТД (inactiveId)</dt><dd class="mono">…' + doc.inactiveId.slice(-10) + '</dd>' : '') +
        '<dt>billIdSuffix</dt><dd class="mono">' + ui.esc(doc.billIdSuffix || '—') + '</dd><dt>Горим</dt><dd>' + (doc.mode === 'SYNC_FIRST' ? 'SYNC_FIRST (B2C, шууд хэвлэх)' : 'ASYNC (outbox → worker)') + '</dd>' +
        (doc.subReceipts.length ? doc.subReceipts.map(function (s) { return '<dt>' + s.taxType + '</dt><dd>' + fmtM(s.amount) + ' · НӨАТ ' + fmtM(s.vat) + '</dd>'; }).join('') : '') + '</dl>' +
        '<div data-note="posted.timeline"><h3 class="small">Төлөвийн түүх</h3>' + timelineHtml(doc) + '</div></div></div>';
      if (req) {
        html += '<div class="card" data-note="posted.json"><div class="card-head"><h2>PosAPI руу илгээсэн JSON</h2><span class="small muted">POST /rest/receipt</span></div><div class="card-body stack">' +
          '<p class="small">Хүсэлтийн JSON-ийг DB-д хадгалахгүй — хадгалсан snapshot-оос (ebarimt_document, sub_receipt, document_line) дахин угсарч hash-ийг харьцуулна (AMT-22, AMT-23). Хариуны <code>qrData</code>, <code>lottery</code> нь энд ч, төлөвт ч байхгүй (D-J3).</p>' +
          ui.json(req) +
          ui.calc('Тооцоог харах: нийлбэрийн гинж (AMT-03) ба мөр хуваалт', receiptCalc(p, req, chk)) + '</div></div>';
      }
    } else {
      html += '<div class="banner">' + (p.ebarimtType === 'NONE' ? 'Энэ баримтад eBarimt гаргахгүй.' : 'eBarimt тохируулаагүй тул баримт гараагүй.') + '</div>';
    }
    html += '<div class="card" data-note="posted.entries"><div class="card-head"><h2>Бичилтүүд (Navigate)</h2><span class="small muted">гүйлгээ ' + [p.transactionNo, p.paymentTransactionNo].filter(Boolean).join(', ') + '</span></div><div class="card-body stack">' + entriesHtml(p) + '</div></div>';
    el.innerHTML = html;
    var b;
    if ((b = ui.$('#pp-print'))) b.addEventListener('click', function () { openPrint(p, true); });
    if ((b = ui.$('#pp-copy'))) b.addEventListener('click', function () { openPrint(p, false); });
    if ((b = ui.$('#pp-copy-ddtd'))) b.addEventListener('click', function () { ui.copy(doc.ddtd, b); });
  }
  function receiptCalc(p, req, chk) {
    var c = req._cents, M = E().money;
    var rows = c.items.map(function (i) {
      var q = M.fmtQty(i.qty5);
      return '<tr><td>' + ui.esc(i.name) + '</td><td class="code">' + i.taxType + '</td><td class="num">' + q + ' × ' + fmtM(i.unitPrice) + ' = ' + fmtM(i.totalAmount) + '</td><td class="num">' + fmtM(i.totalVAT) + '</td></tr>';
    }).join('');
    return '<p>Дүн бүр НӨАТ шингэсэн (AMT-01). Мөр бүрийн G = нийт дүн (amount_including_vat), V = мөрийн НӨАТ; НӨАТ-ыг дахин тооцохгүй. G/Q нь 0.01-д яг хуваагдахгүй бол мөрийг (Q−1) × p ба 1 × (G − p(Q−1)) болгож хуваана (12 §6.2 STRICT_SPLIT).</p>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Item</th><th>taxType</th><th class="num">qty × unitPrice = totalAmount</th><th class="num">totalVAT</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="formula">Σ items.totalAmount = ' + fmtM(c.total) + '   (= нэхэмжлэхийн нийт ' + fmtM(p.amountInclVat) + ', AMT-05)\nΣ items.totalVAT    = ' + fmtM(c.vat) + '   (= нэхэмжлэхийн НӨАТ ' + fmtM(p.vatAmount) + ')\nΣ payments.paidAmount = ' + fmtM(c.total) + '\nГинж: ' + (chk.ok ? '✓ яг тэнцсэн' : '✕ ' + chk.messages.join('; ')) + '</div>';
  }

  // --- print preview (S-EBR-04) -----------------------------------------------
  function drawQrPlaceholder(canvas, data) {
    var n = 29, px = 4, ctx2 = canvas.getContext('2d');
    var cs = getComputedStyle(document.documentElement);
    var ink = cs.getPropertyValue('--ink').trim() || '#000', bg = cs.getPropertyValue('--surface').trim() || '#fff';
    canvas.width = canvas.height = (n + 4) * px;
    ctx2.fillStyle = bg; ctx2.fillRect(0, 0, canvas.width, canvas.height);
    ctx2.fillStyle = ink;
    var finder = function (x, y) {
      for (var i = 0; i < 7; i++) for (var j = 0; j < 7; j++) {
        var on = i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        if (on) ctx2.fillRect((x + i + 2) * px, (y + j + 2) * px, px, px);
      }
    };
    var inFinder = function (i, j) { return (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9); };
    var h = 0;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      if (inFinder(i, j)) continue;
      h = (h * 31 + data.charCodeAt((i * n + j) % data.length) + i * 7 + j) % 1000003;
      if (h % 2) ctx2.fillRect((i + 2) * px, (j + 2) * px, px, px);
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  }
  function openPrint(p, withQr) {
    var doc = E().ebarimt.get(p.ebarimtDocId);
    var payload = withQr && printPayload && printPayload.docId === doc.id ? printPayload : null;
    var setup = ERP.data.ebarimtSetup, co = ERP.data.company;
    var lines = doc.lines || [];
    var body = '<div data-note="posted.print"><div class="receipt">' + (payload ? '' : '<div class="receipt-copy">ХУУЛБАР</div>') +
      '<div class="r-center"><strong>' + ui.esc(co.name) + '</strong><br>ТТД ' + ui.esc(setup.merchantTin) + '<br>Салбар ' + setup.branchNo + ' · POS ' + setup.posNo + '</div>' +
      '<div class="r-rule"></div><div class="r-row"><span>Төрөл</span><span>' + (doc.type === 'B2B_RECEIPT' ? 'B2B' : 'B2C') + '</span></div>' +
      (doc.type === 'B2B_RECEIPT' ? '<div class="r-row"><span>Худалдан авагч</span><span>' + ui.esc(p.customerName) + '</span></div><div class="r-row"><span>ТТД</span><span>' + ui.esc(doc.customerTin) + '</span></div>' : '') +
      '<div class="r-row"><span>Огноо</span><span>' + ui.esc(fmtTs((payload ? payload.date : doc.ebarimtDate) || '')) + '</span></div><div class="r-ddtd">ДДТД<br><span class="mono">' + ui.esc(doc.ddtd || '') + '</span></div><div class="r-rule"></div>' +
      lines.map(function (l) { return '<div class="r-item">' + ui.esc(l.name) + '<div class="r-row"><span>' + ui.esc(l.qty) + ' × ' + fmtM(l.unitPrice) + '</span><span>' + fmtM(l.total) + '</span></div></div>'; }).join('') +
      '<div class="r-rule"></div>' + doc.subReceipts.map(function (s) { return '<div class="r-row small"><span>' + s.taxType + '</span><span>' + fmtM(s.amount) + '</span></div>'; }).join('') +
      '<div class="r-row"><span>НӨАТ</span><span>' + fmtM(doc.totals.vat) + '</span></div><div class="r-row"><span>НХАТ</span><span>0.00</span></div>' +
      '<div class="r-row r-total"><span>НИЙТ</span><span>' + fmtM(doc.totals.amount, { sym: true }) + '</span></div><div class="r-row small"><span>Төлбөр</span><span>' + ui.esc((ERP.data.paymentMethods[p.method] || {}).ebarimt || '') + '</span></div>' +
      (payload ? (payload.lottery ? '<div class="r-center r-lottery">Сугалааны дугаар<br><strong class="mono">' + ui.esc(payload.lottery) + '</strong></div>' : '') +
        '<div class="r-center"><canvas id="qr-canvas" width="132" height="132" aria-label="QR кодын жишээ дүрслэл"></canvas><div class="xs">QR — прототипийн жишээ дүрслэл (qrData-аас зурсан, бодит QR биш)</div></div>'
        : '<div class="r-center xs">Дахин хэвлэлт: QR ба сугалаагүй, ДДТД-тэй (PRN-10).</div>') + '</div></div>' +
      '<p class="xs muted">Бодит системд энэ цонхноос 80 мм баримтын принтерээр хэвлэнэ (UX-EBR-04). qrData, lottery нь зөвхөн энэ цонхны санах ойд байна; цонх хаагдахад устгагдана (UX-EBR-05).</p>';
    var m = ui.modal({ title: payload ? 'eBarimt хэвлэх цонх' : 'eBarimt — хуулбар (QR-гүй)', body: body,
      footer: [{ label: 'Хаах', kind: payload ? 'primary' : '' }],
      onRequestClose: payload ? function () {
        return ui.confirm({ title: 'Хэвлэх цонх хаах', body: '<p>QR кодыг дахин хэвлэх боломжгүй. Хаах уу? (PRN-11)</p>', ok: 'Хаах', danger: true });
      } : null,
      onClose: function () { if (payload) { printPayload = null; app.refresh(); } } });
    if (payload) drawQrPlaceholder(m.el.querySelector('#qr-canvas'), payload.qrData);
    app.decorateNotes(m.el);
  }

  // ===========================================================================
  // registration
  // ===========================================================================
  app.registerScreen({
    route: 'sales-invoices', title: 'Борлуулалтын нэхэмжлэх', crumbs: [['Борлуулалт'], ['Нэхэмжлэх']], owner: 'js/screens/sales.js',
    intro: ['Ноорог ба батлагдсан нэхэмжлэх, кредит нотын жагсаалт. Борлуулагч, нягтлан хэрэглэнэ.',
      'Ноорогийг засаж болно; батлагдсан баримт засагдахгүй, зөвхөн кредит нотоор залруулна. Батлагдсан мөр бүр төлбөрийн ба eBarimt-ийн хоёр төлөвтэй (FR-SAL-014).'],
    render: renderList
  });
  app.registerScreen({
    route: 'sales-invoice', title: 'Борлуулалтын нэхэмжлэх (ноорог)', crumbs: [['Борлуулалт'], ['Нэхэмжлэх', 'sales-invoices'], ['Ноорог']], owner: 'js/screens/sales.js',
    intro: ['Нэхэмжлэхийн ноорог: харилцагч, огноо, нөхцөл, мөрүүдийг оруулахад дүн ба НӨАТ шууд тооцогдоно. "Урьдчилан харах" нь ерөнхий дэвтэр, НӨАТ, авлагын ямар бичилт үүсэхийг батлахаас өмнө харуулна.',
      '<strong>Батлах (F9)</strong> үед нэг гүйлгээнд: хуулийн дугаар SI-2026-##### олгогдож, орлого/НӨАТ/авлагын бичилт, (бэлэн бол) кассын МХ-1, eBarimt баримт бүгд үүснэ. Мөр нэмж, үнэ солиод доорх "Тооцоог харах"-аас НӨАТ-ын хуваарилалтыг ажиглаарай.'],
    render: renderEditor,
    crumbRecord: function (ctx) { return ctx.draftNo || null; },
    onLeave: function () { if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; } }
  });
  // F9 = post while the editor is open (UX-POST-05)
  var origRender = app.screens['sales-invoice'].render;
  app.screens['sales-invoice'].render = function (el, ctx) {
    origRender(el, ctx);
    if (!keyHandler) {
      keyHandler = function (ev) { if (ev.key === 'F9' && app.current === 'sales-invoice' && !document.querySelector('.overlay')) { ev.preventDefault(); var d = E().drafts.get(app.ctx.draftNo); if (d) doPost(d, app.ctx); } };
      document.addEventListener('keydown', keyHandler);
    }
  };
  app.registerScreen({
    route: 'posted-invoice', title: 'Батлагдсан нэхэмжлэх', crumbs: [['Борлуулалт'], ['Нэхэмжлэх', 'sales-invoices'], ['Батлагдсан']], owner: 'js/screens/sales.js',
    intro: ['Батлагдсан баримт зөвхөн уншигдана. Энд төлбөрийн төлөв, eBarimt-ийн төлөвийн түүх, PosAPI руу илгээсэн JSON, ерөнхий дэвтэр/НӨАТ/авлагын бичилтүүдийг харна.',
      'B2C баримтыг батлах үед QR ба сугалаатай хэвлэх цонх нэг л удаа гарна; хаасны дараа зөвхөн QR-гүй хуулбар хэвлэгдэнэ.'],
    render: renderPosted,
    crumbRecord: function (ctx) { return ctx.postedNo || null; },
    onLeave: function () { /* print payload survives only while its modal is open */ }
  });
})();
