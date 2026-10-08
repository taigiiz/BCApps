/* =============================================================================
   js/screens/sales-ar.js — Sales/AR builder:
     #customers          S-PTY-01 list + aging (D-F7)
     #customer           S-PTY-02 card, S-PTY-05 ledger entries (+ detailed), aging, applications/unapply, statement
     #cust-apply         S-PTY-07 apply entries (Applies-to ID) + S-SAL-11 register payment
     #credit-memo        S-SAL-04 credit memo from a posted invoice (+ eBarimt DELETE / inactiveId / manual void, 12 §12)
     #ebarimt            S-EBR-02 monitor, S-EBR-05 resolve UNKNOWN, ERROR resend/cancel, PosAPI sendData / lottery
     #purchase-invoices  S-PUR-01/05 list (overrides the read-only foundation list, keeps its ДДТД confirmation)
     #purchase-invoice   S-PUR-02 editable purchase invoice draft (supplier ДДТД, vendor invoice no, posting preview)
   Accounting is done by ERP.engine (capped application included). Helpers that the engine does not expose (eBarimt chain
   resolution of 12 §12.8, UNKNOWN/ERROR resolution and clone of 12 §11, purchase drafts) live in this file and are
   marked "ENGINE GAP".
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;
  var E = function () { return ERP.engine; };
  // Prototype "now" (Asia/Ulaanbaatar): the business date of the mock data + a fixed time of day.
  var NOW = ERP.data.meta.today + ' 10:30:00';

  // ===========================================================================
  // generic helpers
  // ===========================================================================
  function today() { return ERP.data.meta.today; }
  function fmtM(c, o) { return E().money.fmt(c, o); }
  function opt(v, label, sel) { return '<option value="' + ui.esc(v) + '"' + (sel ? ' selected' : '') + '>' + ui.esc(label) + '</option>'; }
  function fmtTs(ts) { return ts ? ui.date(ts.slice(0, 10)) + (ts.length > 10 ? ' ' + ts.slice(11, 16) : '') : ''; }
  function tsMs(ts) { return Date.UTC(+ts.slice(0, 4), +ts.slice(5, 7) - 1, +ts.slice(8, 10), +(ts.slice(11, 13) || 0), +(ts.slice(14, 16) || 0), +(ts.slice(17, 19) || 0)); }
  function minutesBetween(a, b) { return Math.round((tsMs(b) - tsMs(a)) / 60000); }
  function ageText(min) {
    min = Math.max(0, min);
    if (min < 60) return min + ' мин';
    if (min < 48 * 60) return Math.floor(min / 60) + ' цаг';
    return Math.floor(min / 1440) + ' хоног';
  }
  function parseAmt(s) {
    var t = String(s === null || s === undefined ? '' : s).replace(/[\s  ₮]/g, '').replace(',', '.');
    if (!t) return null;
    return E().money.toCents(t);
  }
  function amtInputVal(c) { return c === null || c === undefined ? '' : (c / 100).toFixed(2); }
  function periodOpen(date) { var p = E().periods.of(date || ''); return !!(p && p.status === 'OPEN'); }
  function sum(arr, f) { return arr.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
  function customer(no) { return E().setup.customer(no); }
  function ebLabel(t) { return { B2B_RECEIPT: 'B2B', B2C_RECEIPT: 'B2C', NONE: 'Үгүй' }[t] || t; }
  function kindLabel(c) { return c.kind === 'LEGAL' ? 'Хуулийн этгээд' : 'Иргэн'; }
  function idText(c) { return c.kind === 'LEGAL' ? (c.tin || '—') : (c.regNo || '—'); }
  function docTypeLabel(t) {
    return { INVOICE: 'Нэхэмжлэх', CREDIT_MEMO: 'Кредит нот', PAYMENT: 'Төлбөр', REFUND: 'Буцаан олголт' }[t] || t;
  }
  function wireRowNav(root, attr, fn) {
    ui.$$('tr[' + attr + ']', root).forEach(function (tr) {
      var go = function () { fn(tr.getAttribute(attr)); };
      tr.addEventListener('click', function (ev) { if (ev.target.closest('button, a, input, select, label')) return; go(); });
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target === tr) go(); });
    });
  }
  function bindDate(id, fn) {
    var inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('change', function () {
      var v = ui.parseDate(inp.value);
      if (!v) { inp.classList.add('invalid'); ui.toast('Огноо буруу: ЖЖЖЖ.СС.ӨӨ хэлбэрээр оруулна уу.', 'error'); return; }
      inp.classList.remove('invalid');
      fn(v);
    });
  }
  function glTable(gl) {
    var setup = E().setup;
    return '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Нэр</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
      gl.map(function (e) { var a = setup.account(e.account); return '<tr><td class="code">' + e.account + '</td><td>' + ui.esc(a ? a.name : '') + '</td>' + ui.moneyCell(Math.max(e.amount, 0), { blankZero: true }) + ui.moneyCell(Math.max(-e.amount, 0), { blankZero: true }) + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="2">Σ (Дт = Кт)</td>' + ui.moneyCell(sum(gl, function (e) { return Math.max(e.amount, 0); })) + ui.moneyCell(sum(gl, function (e) { return Math.max(-e.amount, 0); })) + '</tr></tfoot></table></div>';
  }

  // ===========================================================================
  // AR derived data (all from detailed entries — INV-04)
  // ===========================================================================
  function custAging(asOf) { return E().reports.aging('customer', asOf || today()); }
  function bucketsOf(party) {                              // positive remainders by bucket; negative ones = advance / credit
    var b = { notdue: 0, b0: 0, b31: 0, b61: 0, b91: 0, credit: 0 };
    if (!party) return b;
    party.entries.forEach(function (x) { if (x.remaining < 0) b.credit += x.remaining; else b[x.bucket] += x.remaining; });
    return b;
  }
  function custStats(no, asOf) {
    asOf = asOf || today();
    var S = E().state();
    var p = custAging(asOf).parties.filter(function (x) { return x.party === no; })[0] || null;
    var od = p ? p.entries.filter(function (x) { return x.days > 0 && x.remaining > 0; }) : [];
    var lastPay = S.cle.filter(function (e) { return e.customer === no && e.documentType === 'PAYMENT' && e.postingDate <= asOf; }).slice(-1)[0] || null;
    var year = asOf.slice(0, 4);
    var ytd = sum(E().sales.postedInvoices().filter(function (x) { return x.customer === no && x.postingDate.slice(0, 4) === year; }), function (x) { return x.amount; }) -
      sum(E().sales.postedCreditMemos().filter(function (x) { return x.customer === no && x.postingDate.slice(0, 4) === year; }), function (x) { return x.amount; });
    return { party: p, balance: E().sales.customerBalance(no, asOf), overdue: sum(od, function (x) { return x.remaining; }),
      maxDays: od.reduce(function (m, x) { return Math.max(m, x.days); }, 0), lastPay: lastPay, ytd: ytd };
  }
  function dcleOf(entryNo) { return E().state().dcle.filter(function (d) { return d.cleEntryNo === entryNo; }); }
  function cleOf(entryNo) { return E().state().cle.filter(function (e) { return e.entryNo === entryNo; })[0] || null; }
  function detTypeLabel(d) {
    if (d.entryType === 'INITIAL') return 'Анхны (INITIAL)';
    if (d.unappliedOf) return 'Unapply (толин тусгал)';
    return 'Тулгалт (APPLICATION)' + (d.unapplied ? ' — буцаагдсан' : '');
  }

  // Capped application (BR-AR-22/35: amountToApply per target) — the engine takes { entryNo, amount } targets and runs
  // the same checks as the product (same customer, same receivables account, dates, open, sign, period; 06 §5.13.3).
  function applyCapped(newNo, pairs, date) {
    return E().ledger.applyCustomer(newNo, pairs.map(function (p) { return { entryNo: p.entryNo, amount: p.amount }; }), date);
  }

  // ===========================================================================
  // eBarimt chain helpers (12 §9.4, §12.1–§12.8)
  // ===========================================================================
  function allDocs() { return E().ebarimt.documents(); }
  function invoiceFor(posted) { return !posted ? null : posted.docType === 'INVOICE' ? posted : E().sales.getPosted(posted.appliesTo); }
  function memosOf(inv) { return E().sales.postedCreditMemos().filter(function (c) { return c.appliesTo === inv.no; }); }
  function chainDocs(inv) {                                 // RET-01
    if (!inv) return [];
    var cms = memosOf(inv).map(function (c) { return c.no; });
    return allDocs().filter(function (d) { return d.sourceNo === inv.no || (d.sourceType === 'SALES_CR_MEMO' && cms.indexOf(d.sourceNo) >= 0); });
  }
  // effective status: the historical mock data does not run T11, so an older SUCCESS receipt replaced by a newer
  // SUCCESS correction (inactiveId = its ДДТД) is shown as CANCELLED (INACTIVATED_BY), RET-31.
  function effStatus(doc) {
    if (doc.status === 'SUCCESS' && doc.operation === 'SAVE' && doc.ddtd) {
      var by = allDocs().filter(function (d) { return d !== doc && d.status === 'SUCCESS' && (d.inactiveId === doc.ddtd || d.voidsDdtd === doc.ddtd); })[0];
      if (by) return { status: 'CANCELLED', why: 'INACTIVATED_BY:' + by.id };
    }
    return { status: doc.status, why: doc.resolutionNote || '' };
  }
  function latestOf(docs) {                                 // RET-02: the only SUCCESS SAVE receipt that is still valid
    var l = docs.filter(function (d) { return d.operation === 'SAVE' && effStatus(d).status === 'SUCCESS'; });
    return l[l.length - 1] || null;
  }
  function chainStatusX(inv) {                              // read model incl. MANUAL_VOID_REQUIRED (RET-51)
    var docs = chainDocs(inv);
    if (!docs.length) return E().ebarimt.chainStatus(inv);
    var st = docs.map(function (d) { return effStatus(d).status; });
    if (st.indexOf('UNKNOWN') >= 0) return 'UNKNOWN';
    if (st.indexOf('ERROR') >= 0) return 'ERROR';
    if (st.indexOf('SENT') >= 0) return 'SENT';
    if (docs.some(function (d) { return d.operation === 'MANUAL_VOID' && d.status === 'PENDING'; })) return 'MANUAL_VOID_REQUIRED';
    if (st.indexOf('PENDING') >= 0) return 'PENDING';
    if (docs.some(function (d) { return (d.operation === 'DELETE' && d.status === 'SUCCESS') || /^MANUAL_VOID:/.test(d.resolutionNote || ''); })) return 'VOIDED';
    var latest = latestOf(docs);
    if (latest) return latest.sourceNo === inv.no ? 'SUCCESS' : 'CORRECTED';
    return 'CANCELLED';
  }
  function chainPill(status) {
    if (status === 'MANUAL_VOID_REQUIRED') return ui.pill('WARNING', 'Порталд гараар цуцлах');
    return ui.pill(status);
  }
  function lastAttempt(doc) { var s = doc.events.filter(function (e) { return e.status === 'SENT'; }); return s.length ? s[s.length - 1].at : null; }
  function attempts(doc) { return doc.events.filter(function (e) { return e.status === 'SENT'; }).length; }
  function fakeDdtd(doc, at) {                              // 33 digits: 0 + merchant TIN + yyyymmdd + hhmmss + 7-digit seq (same shape as the simulator)
    return '0' + ERP.data.ebarimtSetup.merchantTin + at.slice(0, 10).replace(/-/g, '') + at.slice(11, 19).replace(/:/g, '') + String(doc.billSeq || 0).padStart(7, '0');
  }
  function addEvent(doc, status, text, at) { doc.events.push({ at: at || NOW, status: status, text: text }); }
  function rebuildDocLines(doc) {
    var req = E().ebarimt.buildRequest(doc);
    if (!req) return;
    doc.lines = req._cents.items.map(function (i) { return { name: i.name, qty: E().money.fmtQty(i.qty5).replace(/ /g, ''), unitPrice: i.unitPrice, total: i.totalAmount, vat: i.totalVAT, taxType: i.taxType, classificationCode: i.classificationCode, barCode: i.barCode }; });
  }
  // ENGINE GAP 2 — clone for resend (12 §11.3): old → CANCELLED (RESENT_AS), new PENDING with a new billIdSuffix,
  // same amounts/type/ТТД; only eBarimt attributes (classificationCode) may be overridden.
  function cloneDoc(old, overrides, note) {
    var S = E().state();
    var posted = E().sales.getPosted(old.sourceNo);
    var nd = JSON.parse(JSON.stringify(old));
    nd.id = 'EB-' + String(S.counters.EBARIMT += 1).padStart(5, '0');
    if (old.operation === 'SAVE') { nd.billSeq = (S.counters.BILL_SEQ += 1); nd.billIdSuffix = ERP.data.ebarimtSetup.posNo + String(nd.billSeq % 1000000).padStart(6, '0'); }
    nd.status = 'PENDING'; nd.ddtd = null; nd.ebarimtDate = null; nd.errorCode = null; nd.errorText = null; nd.scenario = 'SUCCESS';
    nd.queuedAt = NOW; nd.mode = 'ASYNC'; nd.resolutionNote = null; nd.clonedFrom = old.id;
    nd.subReceipts.forEach(function (s) { s.subId = null; });
    if (overrides && Object.keys(overrides).length) {
      var base = JSON.parse(JSON.stringify(old.netLines || posted.lines));
      base.forEach(function (l) { if (overrides[l.lineNo]) l.classificationCode = overrides[l.lineNo]; });
      nd.netLines = base;
    }
    nd.events = [{ at: NOW, status: 'PENDING', text: 'Клон: ' + old.id + '-ийг орлосон шинэ баримт (шинэ billIdSuffix ' + (nd.billIdSuffix || '—') + '). Outbox-д бичигдлээ.' }];
    rebuildDocLines(nd);
    old.status = 'CANCELLED';
    old.resolutionNote = note + ' RESENT_AS:' + nd.id;
    old.resolvedAt = NOW; old.resolvedBy = currentUser();
    addEvent(old, 'CANCELLED', 'Цуцлагдсан: ' + note + ' → ' + nd.id);
    S.ebarimtDocs.push(nd);
    if (posted.ebarimtDocId === old.id) posted.ebarimtDocId = nd.id;
    return nd;
  }
  function workerSend(doc) {                                // simulated outbox worker (one attempt, D-J2)
    if (doc.status !== 'PENDING' || doc.operation === 'MANUAL_VOID') return null;
    if (doc.scenario === 'PENDING') doc.scenario = 'SUCCESS';
    return E().ebarimt.dispatch(doc.id);                     // the raw response (qrData, lottery) is dropped by the engine API
  }
  function currentUser() { return app.state.role === 'OWNER' ? 'Б. Наранбаатар' : 'Д. Сарнай'; }

  // ===========================================================================
  // #customers — S-PTY-01 + aging
  // ===========================================================================
  var listFilter = 'all';
  function renderCustomers(el, ctx) {
    var asOf = ctx.arAsOf || today();
    var ag = custAging(asOf);
    var q = (ctx.arSearch || '').toLowerCase();
    var rows = ERP.data.customers.map(function (c) {
      var st = custStats(c.no, asOf);
      return { c: c, st: st, type: E().ebarimt.decideType(null, c), lim: E().money.toCents(c.creditLimit || '0') };
    });
    var shown = rows.filter(function (r) {
      if (q && (r.c.no + ' ' + r.c.name + ' ' + (r.c.tin || '')).toLowerCase().indexOf(q) < 0) return false;
      if (listFilter === 'overdue') return r.st.overdue > 0;
      if (listFilter === 'b2b') return r.type === 'B2B_RECEIPT';
      if (listFilter === 'b2c') return r.type === 'B2C_RECEIPT';
      return true;
    });
    var totBal = sum(rows, function (r) { return r.st.balance; }), totOd = sum(rows, function (r) { return r.st.overdue; });
    var gl1200 = E().reports.glBalance('1200', asOf);
    var sub = sum(E().state().dcle.filter(function (d) { return d.cpg === 'DOMESTIC' && d.postingDate <= asOf; }), function (d) { return d.amount; });
    var html = '<div class="page-head"><div class="title-wrap"><h1>Харилцагч</h1></div><div class="row">' +
      '<a class="btn" href="#cust-apply">Төлбөр бүртгэх / тулгах</a><a class="btn" href="#credit-memo">Кредит нот</a></div></div>';
    html += '<div class="cues ar-cues">' +
      '<div class="cue" data-state="' + (totOd ? 'AMBIGUOUS' : 'FAVORABLE') + '"><span class="cue-title">Нийт авлага</span><span class="cue-value">' + ui.esc(E().money.compact(totBal)) + '</span><span class="cue-sub">' + fmtM(totBal, { sym: true }) + '</span></div>' +
      '<div class="cue" data-state="' + (totOd ? 'UNFAVORABLE' : 'FAVORABLE') + '"><span class="cue-title">Хугацаа хэтэрсэн</span><span class="cue-value">' + ui.esc(E().money.compact(totOd)) + '</span><span class="cue-sub">' + rows.filter(function (r) { return r.st.overdue > 0; }).length + ' харилцагч</span></div>' +
      '<div class="cue" data-state="' + (gl1200 === sub ? 'FAVORABLE' : 'UNFAVORABLE') + '" data-note="ar.list"><span class="cue-title">1200 "Дансны авлага" = дэд дэвтэр</span><span class="cue-value">' + (gl1200 === sub ? '✓ тэнцсэн' : '✕ зөрүүтэй') + '</span><span class="cue-sub">G/L ' + fmtM(gl1200) + '</span></div></div>';
    html += '<div class="row between ar-toolbar"><div class="row ar-chips" role="group" aria-label="Шүүлтүүр">' +
      [['all', 'Бүгд'], ['overdue', 'Хугацаа хэтэрсэн'], ['b2b', 'B2B (ТТД-тэй)'], ['b2c', 'B2C (иргэн)']].map(function (f) {
        return '<button class="btn sm chipbtn" type="button" id="cf-' + f[0] + '" data-filter="' + f[0] + '" aria-pressed="' + (listFilter === f[0]) + '">' + f[1] + '</button>';
      }).join('') + '</div><div class="row"><label class="sr-only" for="cs-search">Хайх</label><input class="input" id="cs-search" type="search" placeholder="Дугаар, нэр, ТТД…" value="' + ui.esc(ctx.arSearch || '') + '"></div></div>';
    html += '<div class="card" data-note="ar.list"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Дугаар</th><th>Нэр</th><th data-note="ar.type">Төрөл</th><th>ТТД / регистр</th><th>eBarimt</th><th>Утас</th>' +
      '<th class="num">Үлдэгдэл</th><th class="num">Хугацаа хэтэрсэн</th><th class="num">Хоног</th><th>Зээлийн хязгаар</th><th>Нөхцөл</th></tr></thead><tbody>' +
      (shown.map(function (r) {
        var use = r.lim ? Math.round(Math.max(r.st.balance, 0) * 100 / r.lim) : null;
        return '<tr class="clickable" tabindex="0" data-cust="' + r.c.no + '"><td class="code">' + r.c.no + '</td><td>' + ui.esc(r.c.name) + '</td><td>' + kindLabel(r.c) + '</td>' +
          '<td class="code">' + ui.esc(idText(r.c)) + '</td><td><span class="ar-tag ' + (r.type === 'B2B_RECEIPT' ? 'b2b' : 'b2c') + '">' + ebLabel(r.type) + '</span></td><td class="code">' + ui.esc(r.c.phone || '—') + '</td>' +
          ui.moneyCell(r.st.balance) + '<td class="num' + (r.st.overdue ? ' ar-overdue' : '') + '">' + ui.esc(fmtM(r.st.overdue, { blankZero: true })) + '</td>' +
          '<td class="num">' + (r.st.maxDays ? r.st.maxDays : '') + '</td>' +
          '<td>' + (r.lim ? '<span class="meter" title="' + use + '%"><span class="meter-fill' + (use > 100 ? ' over' : use > 80 ? ' high' : '') + '" style="width:' + Math.min(use, 100) + '%"></span></span> <span class="xs">' + use + '% · ' + ui.esc(E().money.compact(r.lim)) + '</span>' : '<span class="muted xs">—</span>') + '</td>' +
          '<td>' + ui.esc((ERP.data.paymentTerms[r.c.terms] || {}).name || r.c.terms) + '</td></tr>';
      }).join('') || '<tr><td colspan="11" class="empty">Шүүлтүүрт тохирох харилцагч алга.</td></tr>') +
      '</tbody><tfoot><tr><td colspan="6">Нийт (' + shown.length + ')</td>' + ui.moneyCell(sum(shown, function (r) { return r.st.balance; })) + ui.moneyCell(sum(shown, function (r) { return r.st.overdue; })) + '<td colspan="3"></td></tr></tfoot></table></div></div>';
    // aging
    var bucketsHead = ag.buckets.map(function (b) { return '<th class="num">' + ui.esc(b.label) + '</th>'; }).join('');
    var agRows = ag.parties.map(function (p) { return { p: p, b: bucketsOf(p) }; });
    var tot = { notdue: 0, b0: 0, b31: 0, b61: 0, b91: 0, credit: 0 };
    agRows.forEach(function (r) { Object.keys(tot).forEach(function (k) { tot[k] += r.b[k]; }); });
    html += '<div class="card" data-note="ar.aging"><div class="card-head"><h2>Авлагын насжилт (төлөх огноогоор)</h2><div class="row"><label class="small" for="ar-asof">Огноо D</label>' + ui.dateInput('ar-asof', asOf, ' style="width:120px"') + '</div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Харилцагч</th>' + bucketsHead + '<th class="num">Урьдчилгаа / кредит</th><th class="num">Нийт</th><th>Бүтэц</th></tr></thead><tbody>' +
      (agRows.map(function (r) {
        var pos = r.b.notdue + r.b.b0 + r.b.b31 + r.b.b61 + r.b.b91;
        return '<tr class="clickable" tabindex="0" data-cust="' + r.p.party + '"><td>' + ui.esc(r.p.name) + ' <span class="code xs muted">' + r.p.party + '</span></td>' +
          ['notdue', 'b0', 'b31', 'b61', 'b91'].map(function (k) { return '<td class="num' + (k !== 'notdue' && k !== 'b0' && r.b[k] ? ' ar-overdue' : '') + '">' + ui.esc(fmtM(r.b[k], { blankZero: true })) + '</td>'; }).join('') +
          '<td class="num">' + ui.esc(fmtM(r.b.credit, { blankZero: true })) + '</td>' + ui.moneyCell(r.p.total) + '<td>' + agingBar(r.b, pos) + '</td></tr>';
      }).join('') || '<tr><td colspan="9" class="empty">Нээлттэй авлага алга.</td></tr>') +
      '</tbody><tfoot><tr><td>Нийт</td>' + ['notdue', 'b0', 'b31', 'b61', 'b91', 'credit'].map(function (k) { return ui.moneyCell(tot[k]); }).join('') +
      ui.moneyCell(sum(agRows, function (r) { return r.p.total; })) + '<td></td></tr></tfoot></table></div></div></div>';
    html += '<div class="ar-legend xs muted"><span><i class="sw sw-notdue"></i>Хугацаа болоогүй</span><span><i class="sw sw-b0"></i>0–30</span><span><i class="sw sw-b31"></i>31–60</span><span><i class="sw sw-b61"></i>61–90</span><span><i class="sw sw-b91"></i>90+</span></div>';
    html += ui.calc('Тооцоог харах: насжилтын бүлэг ба 1200-тай тулгалт', agingCalc(ag, gl1200, sub));
    el.innerHTML = html;
    ui.$$('[data-filter]', el).forEach(function (b) { b.addEventListener('click', function () { listFilter = b.getAttribute('data-filter'); renderCustomers(el, ctx); app.decorateNotes(); ui.$('#cf-' + listFilter).focus(); }); });
    var s = ui.$('#cs-search');
    s.addEventListener('input', function () { ctx.arSearch = s.value; var pos = s.selectionStart; renderCustomers(el, ctx); app.decorateNotes(); var n = ui.$('#cs-search'); n.focus(); n.setSelectionRange(pos, pos); });
    bindDate('ar-asof', function (v) { ctx.arAsOf = v; renderCustomers(el, ctx); app.decorateNotes(); });
    wireRowNav(el, 'data-cust', function (no) { app.navigate('customer', { customerNo: no }); });
  }
  function agingBar(b, pos) {
    if (pos <= 0) return '<span class="muted xs">—</span>';
    return '<span class="agebar" aria-hidden="true">' + ['notdue', 'b0', 'b31', 'b61', 'b91'].filter(function (k) { return b[k] > 0; }).map(function (k) {
      return '<span class="seg sw-' + k + '" style="flex-grow:' + Math.max(1, Math.round(b[k] * 1000 / pos)) + '"></span>';
    }).join('') + '</span>';
  }
  function agingCalc(ag, gl1200, sub) {
    var rows = [];
    ag.parties.forEach(function (p) { p.entries.forEach(function (x) { rows.push({ p: p, x: x }); }); });
    var b = function (id) { return (ag.buckets.filter(function (q) { return q.id === id; })[0] || {}).label || id; };
    return '<p><strong>1. Бичилт бүрийн D-ийн байдлаарх үлдэгдэл</strong> = Σ detailed (огноо ≤ D) — header-ийн "үлдэгдэл" кэшийг ашиглахгүй (BR-AR-67).</p>' +
      '<p><strong>2. Хоцролт</strong> = D − төлөх огноо (хоног). ≤ −1 → "Хугацаа болоогүй"; 0–30; 31–60; 61–90; 91+ (D-F7). Сөрөг үлдэгдэл (тулгагдаагүй төлбөр, кредит нот) → "Урьдчилгаа / кредит".</p>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Харилцагч</th><th>Баримт</th><th>Төлөх огноо</th><th class="num">D − төлөх</th><th>Бүлэг</th><th class="num">Үлдэгдэл (D)</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + ui.esc(r.p.party) + '</td><td class="code">' + ui.esc(r.x.entry.documentNo) + '</td><td>' + ui.date(r.x.entry.dueDate) + '</td><td class="num">' + ui.date(ag.asOf).slice(5) + ' − ' + ui.date(r.x.entry.dueDate).slice(5) + ' = ' + r.x.days + '</td><td>' + (r.x.remaining < 0 ? 'Урьдчилгаа / кредит' : ui.esc(b(r.x.bucket))) + '</td>' + ui.moneyCell(r.x.remaining) + '</tr>'; }).join('') +
      '</tbody></table></div>' +
      '<div class="formula">Σ насжилт (бүх бүлэг)            = ' + fmtM(sum(ag.parties, function (p) { return p.total; })) + '\nΣ detailed (DOMESTIC, огноо ≤ D)  = ' + fmtM(sub) + '\nG/L 1200 "Дансны авлага" (≤ D)     = ' + fmtM(gl1200) + '\nINV-11: ' + (sub === gl1200 ? '✓ дэд дэвтэр = хяналтын данс' : '✕ зөрүү ' + fmtM(sub - gl1200)) + '</div>';
  }

  // ===========================================================================
  // #customer — S-PTY-02 card + S-PTY-05 entries
  // ===========================================================================
  function renderCustomer(el, ctx) {
    var no = ctx.customerNo && customer(ctx.customerNo) ? ctx.customerNo : 'C00003';
    ctx.customerNo = no;
    var c = customer(no);
    var st = custStats(no);
    var tab = ctx.arCardTab || 'entries';
    var type = E().ebarimt.decideType(null, c);
    var lim = E().money.toCents(c.creditLimit || '0');
    var html = '<div class="page-head"><div class="title-wrap"><h1>' + ui.esc(c.name) + '</h1><span class="docno">' + c.no + '</span>' + ui.pill('OK', 'Идэвхтэй') + '</div>' +
      '<div class="row"><label class="sr-only" for="cc-switch">Харилцагч солих</label><select class="select" id="cc-switch">' + ERP.data.customers.map(function (x) { return opt(x.no, x.no + ' · ' + x.name, x.no === no); }).join('') + '</select></div></div>';
    html += '<div class="actionbar"><button class="btn primary" type="button" id="cc-new-inv">+ Нэхэмжлэх</button><button class="btn" type="button" id="cc-apply">Төлбөр бүртгэх / тулгах</button>' +
      '<button class="btn" type="button" id="cc-cm">+ Кредит нот</button><button class="btn" type="button" id="cc-stmt">Дансны хуулга</button><a class="btn ghost" href="#customers">Жагсаалт руу</a></div>';
    html += '<div class="doc-layout"><div class="doc-main">';
    html += '<details class="fasttab" open><summary><span class="chev" aria-hidden="true">▸</span>Ерөнхий</summary><div class="ft-body"><dl class="form-grid ro-grid">' +
      [['Дугаар', c.no], ['Нэр', c.name], ['Төрөл', kindLabel(c)], [c.kind === 'LEGAL' ? 'ТТД' : 'Регистр (нууцлалтай)', idText(c)],
        [c.kind === 'LEGAL' ? 'Улсын бүртгэлийн дугаар' : 'Хувь хүний ТТД', c.kind === 'LEGAL' ? (c.regNo || '—') : '•••••• (write-only)'], ['Утас', c.phone || '—'], ['Хаяг', c.address || '—']]
        .map(function (x) { return '<div class="field"><dt class="flabel">' + x[0] + '</dt><dd>' + ui.esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div></details>';
    html += '<details class="fasttab" open><summary><span class="chev" aria-hidden="true">▸</span>Нэхэмжлэх ба тооцоо</summary><div class="ft-body" data-note="ar.card-info"><dl class="form-grid ro-grid">' +
      [['Харилцагчийн бүлэг', c.cpg + ' → ' + E().setup.receivablesAccount(c.cpg) + ' ' + E().setup.account(E().setup.receivablesAccount(c.cpg)).name],
        ['Бизнесийн бүлэг', c.genBus + ' · ' + ERP.data.genBusGroups[c.genBus]], ['НӨАТ-ын бүлэг', c.vatBus + ' · ' + ERP.data.vatBusGroups[c.vatBus]],
        ['Төлбөрийн нөхцөл', (ERP.data.paymentTerms[c.terms] || {}).name + ' (' + (ERP.data.paymentTerms[c.terms] || {}).formula + ')'],
        ['Төлбөрийн хэлбэр', (ERP.data.paymentMethods[c.method] || {}).name + ((ERP.data.paymentMethods[c.method] || {}).balBank ? ' — харьцсан данс ' + ERP.data.paymentMethods[c.method].balBank : '')],
        ['Үнэ НӨАТ-тэй', c.piv ? 'Тийм' : 'Үгүй'], ['Зээлийн хязгаар', lim ? fmtM(lim, { sym: true }) : '—'], ['Тулгалтын арга', 'Гараар (Applies-to)']]
        .map(function (x) { return '<div class="field"><dt class="flabel">' + x[0] + '</dt><dd>' + ui.esc(x[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="xs muted">Бүлгийг солих нь зөвхөн шинэ баримтад нөлөөлнө. Батлагдсан баримт өөрчлөгдөхгүй (UX-CUST-05).</p></div></details>';
    html += '<details class="fasttab"><summary><span class="chev" aria-hidden="true">▸</span>eBarimt</summary><div class="ft-body" data-note="ar.type"><dl class="form-grid ro-grid">' +
      [['Анхдагч төрөл', { AUTO: 'Автомат', B2B: 'B2B', B2C: 'B2C', NONE: 'Үгүй' }[c.ebarimt] || c.ebarimt], ['Шийдсэн төрөл', ebLabel(type) + (c.ebarimt === 'AUTO' ? (type === 'B2B_RECEIPT' ? ' — 11 оронтой ТТД-тэй' : ' — ТТД-гүй') : '')],
        ['Иргэний eBarimt дугаар', c.kind === 'LEGAL' ? '—' : 'баримт бүрд (заавал биш)']]
        .map(function (x) { return '<div class="field"><dt class="flabel">' + x[0] + '</dt><dd>' + ui.esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div></details>';
    html += '</div><aside class="factbox">';
    html += '<div class="card"><div class="card-head"><h3>Статистик</h3></div><div class="card-body"><dl class="kv">' +
      '<dt>Үлдэгдэл</dt><dd>' + fmtM(st.balance) + '</dd><dt>Хэтэрсэн</dt><dd' + (st.overdue ? ' class="ar-overdue"' : '') + '>' + fmtM(st.overdue) + (st.overdue ? ' ⚠' : '') + '</dd>' +
      '<dt>Хамгийн их хоцролт</dt><dd>' + (st.maxDays ? st.maxDays + ' хоног' : '—') + '</dd><dt>Энэ жил (НӨАТ-гүй)</dt><dd>' + ui.esc(E().money.compact(st.ytd)) + '</dd>' +
      '<dt>Сүүлд төлсөн</dt><dd>' + (st.lastPay ? ui.date(st.lastPay.postingDate) : '—') + '</dd>' +
      (lim ? '<dt>Зээлийн хязгаар</dt><dd>' + Math.round(Math.max(st.balance, 0) * 100 / lim) + '%</dd>' : '') + '</dl></div></div>';
    var glA = E().setup.receivablesAccount(c.cpg);
    html += '<div class="card"><div class="card-head"><h3>Хяналтын данс</h3></div><div class="card-body small"><p>Энэ харилцагчийн бүх авлага <span class="code">' + glA + '</span> дансанд. Дэд дэвтэр (бүх харилцагч) = ' + fmtM(sum(E().state().dcle.filter(function (d) { return d.cpg === c.cpg; }), function (d) { return d.amount; })) +
      '; G/L ' + glA + ' = ' + fmtM(E().reports.glBalance(glA)) + '.</p></div></div>';
    html += '</aside></div>';
    // tabs (full width under the card + FactBox: ledger tables need the room)
    html += '<div class="tabs" role="tablist">' + [['entries', 'Бичилт'], ['aging', 'Насжилт'], ['apps', 'Тулгалт'], ['statement', 'Дансны хуулга']].map(function (t) {
      return '<button class="tab" role="tab" type="button" id="cct-' + t[0] + '" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div><div id="cc-tab-body" class="stack"></div>';
    el.innerHTML = html;
    renderCardTab(ui.$('#cc-tab-body'), ctx, c);
    ui.$('#cc-switch').addEventListener('change', function (ev) { ctx.customerNo = ev.target.value; ctx.arExpanded = []; app.refresh(); });
    ui.$$('.tab', el).forEach(function (b) { b.addEventListener('click', function () { ctx.arCardTab = b.getAttribute('data-tab'); renderCustomer(el, ctx); app.decorateNotes(); ui.$('#cct-' + ctx.arCardTab).focus(); }); });
    ui.$('#cc-new-inv').addEventListener('click', function () { var d = E().drafts.create(no); app.navigate('sales-invoice', { draftNo: d.no }); });
    ui.$('#cc-apply').addEventListener('click', function () { app.navigate('cust-apply', { arApplyCust: no }); });
    ui.$('#cc-cm').addEventListener('click', function () {
      var inv = E().sales.postedInvoices().filter(function (p) { return p.customer === no; }).slice(-1)[0];
      app.navigate('credit-memo', { cmSource: inv ? inv.no : null });
    });
    ui.$('#cc-stmt').addEventListener('click', function () { ctx.arCardTab = 'statement'; renderCustomer(el, ctx); app.decorateNotes(); ui.$('#cct-statement').focus(); });
  }

  function renderCardTab(host, ctx, c) {
    var tab = ctx.arCardTab || 'entries';
    if (tab === 'entries') host.innerHTML = entriesTab(ctx, c);
    else if (tab === 'aging') host.innerHTML = agingTab(ctx, c);
    else if (tab === 'apps') host.innerHTML = appsTab(ctx, c);
    else host.innerHTML = statementTab(ctx, c);
    var rerender = function () { renderCardTab(host, ctx, c); app.decorateNotes(); };
    ui.$$('[data-ef]', host).forEach(function (b) { b.addEventListener('click', function () { ctx.arEntryFilter = b.getAttribute('data-ef'); rerender(); ui.$('#ef-' + ctx.arEntryFilter).focus(); }); });
    ui.$$('[data-expand]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var n = +b.getAttribute('data-expand'), ex = ctx.arExpanded || (ctx.arExpanded = []);
        var i = ex.indexOf(n); if (i >= 0) ex.splice(i, 1); else ex.push(n);
        rerender(); var nb = ui.$('#exp-' + n); if (nb) nb.focus();
      });
    });
    ui.$$('[data-unapply]', host).forEach(function (b) { b.addEventListener('click', function () { doUnapply(+b.getAttribute('data-unapply'), rerender); }); });
    ui.$$('[data-doc]', host).forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); openDoc(a.getAttribute('data-doc')); }); });
    bindDate('ag-asof', function (v) { ctx.arCardAsOf = v; rerender(); });
    bindDate('st-from', function (v) { ctx.arStmtFrom = v; rerender(); });
    bindDate('st-to', function (v) { ctx.arStmtTo = v; rerender(); });
  }
  function openDoc(no) {
    if (E().sales.getPosted(no)) app.navigate('posted-invoice', { postedNo: no });
    else ui.toast('Баримт ' + ui.esc(no) + ' — төлбөр / журналын баримт (банк, кассын дэлгэцэд).');
  }
  function docLink(no) { return '<a href="#posted-invoice" class="code" data-doc="' + ui.esc(no) + '">' + ui.esc(no) + '</a>'; }

  function entriesTab(ctx, c) {
    var f = ctx.arEntryFilter || 'all';
    var ex = ctx.arExpanded || [];
    var S = E().state();
    var list = S.cle.filter(function (e) { return e.customer === c.no && (f === 'all' || e.open); }).slice().reverse();
    var html = '<div class="card" data-note="ar.entries"><div class="card-head"><h2>Харилцагчийн бичилт</h2><div class="row ar-chips" role="group" aria-label="Нээлттэй / бүгд">' +
      [['open', 'Нээлттэй'], ['all', 'Бүгд']].map(function (x) { return '<button class="btn sm chipbtn" type="button" id="ef-' + x[0] + '" data-ef="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>'; }).join('') +
      '</div></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table ar-entries"><thead><tr><th><span class="sr-only">Дэлгэх</span></th><th>Бичилт №</th><th>Огноо</th><th>Төрөл</th><th>Баримт</th><th>Тайлбар</th><th>Төлөх огноо</th>' +
      '<th class="num">Дүн</th><th class="num">Үлдэгдэл</th><th>Нээлттэй</th><th>Хаасан</th></tr></thead><tbody>';
    list.forEach(function (e) {
      var open = ex.indexOf(e.entryNo) >= 0;
      var od = e.open && e.remaining > 0 && e.dueDate < today();
      html += '<tr' + (open ? ' class="sel"' : '') + '><td><button class="btn ghost sm" type="button" id="exp-' + e.entryNo + '" data-expand="' + e.entryNo + '" aria-expanded="' + open + '" aria-label="Detailed бичилт ' + e.entryNo + '">' + (open ? '▾' : '▸') + '</button></td>' +
        '<td class="code">' + e.entryNo + '</td><td>' + ui.date(e.postingDate) + '</td><td>' + docTypeLabel(e.documentType) + '</td><td>' + docLink(e.documentNo) + '</td><td>' + ui.esc(e.description) + '</td>' +
        '<td>' + ui.date(e.dueDate) + (od ? ' ' + ui.pill('OVERDUE', daysLate(e) + ' хоног') : '') + '</td>' + ui.moneyCell(e.amount) + ui.moneyCell(e.remaining, { blankZero: true }) +
        '<td>' + (e.open ? ui.pill('OPEN') : ui.pill('CLOSED')) + '</td><td class="xs">' + (e.closedByEntryNo ? '№' + e.closedByEntryNo + ' · ' + ui.date(e.closedAtDate) : '') + '</td></tr>';
      if (open) {
        var det = dcleOf(e.entryNo);
        html += '<tr class="ar-sub"><td></td><td colspan="10"><div data-note="ar.detailed"><table class="grid-table"><thead><tr><th>№</th><th>Төрөл</th><th>Огноо</th><th>Баримт</th><th>Тулгалт №</th><th>Хос бичилт</th><th>Гүйлгээ №</th><th class="num">Дүн</th></tr></thead><tbody>' +
          det.map(function (d) { return '<tr><td class="code">' + d.entryNo + '</td><td>' + detTypeLabel(d) + '</td><td>' + ui.date(d.postingDate) + '</td><td class="code">' + ui.esc(d.documentNo) + '</td><td class="code">' + (d.applicationNo || '') + '</td><td class="code">' + (d.appliedCleEntryNo || '') + '</td><td class="code">' + (d.transactionNo || '<span class="muted">—</span>') + '</td>' + ui.moneyCell(d.amount) + '</tr>'; }).join('') +
          '</tbody><tfoot><tr><td colspan="7">Σ detailed = үлдэгдэл (INV-04)</td>' + ui.moneyCell(sum(det, function (d) { return d.amount; })) + '</tr></tfoot></table></div></td></tr>';
      }
    });
    if (!list.length) html += '<tr><td colspan="11" class="empty">' + (f === 'open' ? 'Нээлттэй бичилт алга.' : 'Бичилт алга.') + '</td></tr>';
    html += '</tbody></table></div></div></div>';
    var sample = list.filter(function (e) { return e.remaining !== 0 && e.remaining !== e.amount; })[0] || list.filter(function (e) { return e.open; })[0] || list[0];
    if (sample) {
      var det = dcleOf(sample.entryNo);
      html += ui.calc('Тооцоог харах: ' + sample.documentNo + '-ийн үлдэгдэл', '<p>Header-ийн "Үлдэгдэл" нь кэш. Жинхэнэ утга нь тухайн entry-ийн бүх detailed мөрийн нийлбэр (INV-04, D-F3):</p><div class="formula">' +
        det.map(function (d) { return (d.amount >= 0 ? '+ ' : '− ') + fmtM(Math.abs(d.amount)).padStart(16, ' ') + '   ' + detTypeLabel(d) + ' ' + d.documentNo; }).join('\n') +
        '\n= ' + fmtM(sum(det, function (d) { return d.amount; })).padStart(16, ' ') + '   (header remaining ' + fmtM(sample.remaining) + (sum(det, function (d) { return d.amount; }) === sample.remaining ? ' ✓' : ' ✕') + ')</div>' +
        '<p class="xs">Нээлттэй = үлдэгдэл ≠ 0. Хос тулгалтын APPLICATION мөрүүд (−a / +a) нэг харилцагчийн хүрээнд нийлбэр 0 тул авлагын дансны G/L-д нөлөөлөхгүй (BR-AR-23, BR-AR-45).</p>');
    }
    return html;
  }
  function daysLate(e) { return E().dates.daysBetween(e.dueDate, today()); }

  function agingTab(ctx, c) {
    var asOf = ctx.arCardAsOf || today();
    var ag = custAging(asOf);
    var p = ag.parties.filter(function (x) { return x.party === c.no; })[0];
    var b = bucketsOf(p);
    var html = '<div class="card" data-note="ar.aging"><div class="card-head"><h2>Насжилт</h2><div class="row"><label class="small" for="ag-asof">Огноо D</label>' + ui.dateInput('ag-asof', asOf, ' style="width:120px"') + '</div></div><div class="card-body stack">' +
      '<div class="ar-buckets">' + ag.buckets.map(function (q) { return '<div class="ar-bucket' + (q.id !== 'notdue' && q.id !== 'b0' && b[q.id] ? ' bad' : '') + '"><span class="xs muted">' + ui.esc(q.label) + '</span><strong>' + fmtM(b[q.id]) + '</strong></div>'; }).join('') +
      '<div class="ar-bucket"><span class="xs muted">Урьдчилгаа / кредит</span><strong>' + fmtM(b.credit) + '</strong></div></div>';
    html += '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Баримт</th><th>Огноо</th><th>Төлөх огноо</th><th class="num">Хоцролт</th><th>Бүлэг</th><th class="num">Үлдэгдэл (D)</th></tr></thead><tbody>' +
      (p ? p.entries.map(function (x) { var q = ag.buckets.filter(function (z) { return z.id === x.bucket; })[0]; return '<tr><td class="code">' + ui.esc(x.entry.documentNo) + '</td><td>' + ui.date(x.entry.postingDate) + '</td><td>' + ui.date(x.entry.dueDate) + '</td><td class="num">' + x.days + '</td><td>' + (x.remaining < 0 ? 'Урьдчилгаа / кредит' : ui.esc(q.label)) + '</td>' + ui.moneyCell(x.remaining) + '</tr>'; }).join('') : '<tr><td colspan="6" class="empty">' + ui.date(asOf) + '-ний байдлаар нээлттэй бичилт алга.</td></tr>') +
      '</tbody></table></div><p class="xs muted">D-г өнгөрсөн огноо болговол тэр өдрийн байдлыг харна: D-ээс хойш хийгдсэн төлбөр, тулгалт тооцогдохгүй (BR-AR-67).</p></div></div>';
    return html;
  }

  function appsTab(ctx, c) {
    var S = E().state();
    var rows = S.dcle.filter(function (d) { return d.customer === c.no && d.entryType === 'APPLICATION' && !d.unappliedOf; });
    var groups = {}, order = [];
    rows.forEach(function (d) { if (!groups[d.applicationNo]) { groups[d.applicationNo] = []; order.push(d.applicationNo); } groups[d.applicationNo].push(d); });
    order.sort(function (a, b) { return b - a; });
    var html = '<div class="card" data-note="ar.applications"><div class="card-head"><h2>Тулгалтууд</h2><span class="small muted">' + order.length + ' тулгалт · шинээс хуучин</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Тулгалт №</th><th>Огноо</th><th>Тулгаж буй (New)</th><th>Тулгагдсан (Old)</th><th>Төрөл</th><th class="num">Дүн</th><th>Төлөв</th><th><span class="sr-only">Үйлдэл</span></th></tr></thead><tbody>' +
      (order.map(function (n) {
        var g = groups[n];
        var undone = g.every(function (d) { return d.unapplied; });
        var newDocs = {}, oldDocs = {};
        g.forEach(function (d) { var e = cleOf(d.cleEntryNo); if (e.documentNo === d.documentNo) newDocs[e.documentNo] = 1; else oldDocs[e.documentNo] = 1; });
        var amt = sum(g.filter(function (d) { return d.amount > 0; }), function (d) { return d.amount; });
        return '<tr><td class="code">' + n + '</td><td>' + ui.date(g[0].postingDate) + '</td><td class="code">' + Object.keys(newDocs).join(', ') + '</td><td class="code">' + Object.keys(oldDocs).join(', ') + '</td>' +
          '<td class="xs">' + (g[0].transactionNo ? 'Posting доторх (гүйлгээ ' + g[0].transactionNo + ')' : 'Батлагдсан бичилт хооронд (G/L-гүй)') + '</td>' + ui.moneyCell(amt) +
          '<td>' + (undone ? ui.pill('CANCELLED', 'Цуцлагдсан') : ui.pill('OK', 'Идэвхтэй')) + '</td><td>' + (undone ? '' : '<button class="btn sm" type="button" id="ua-' + n + '" data-unapply="' + n + '">Тулгалт цуцлах</button>') + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty">Тулгалт алга.</td></tr>') + '</tbody></table></div></div></div>';
    html += ui.calc('Тооцоог харах: unapply ба LIFO', '<p>Буцаах нэгж нь бүхэл application № (BR-AR-40). Мөр бүрд толин тусгал мөр (−эх дүн, огноо = буцаасан огноо, unapplied = true) нэмэгдэж, entry-ийн үлдэгдэл сэргэнэ; G/L үүсэхгүй (BR-AR-44, 45).</p>' +
      '<p>Хатуу LIFO (BR-AR-41): оролцогч entry бүрийн идэвхтэй APPLICATION мөрүүдийн хамгийн их application № нь буцааж буй тулгалт байх ёстой. Үгүй бол <code>party.unapply_not_latest</code>.</p>' +
      '<p>Цуцлалтын тулгалт (нэхэмжлэх ↔ "Нэхэмжлэх цуцлах" кредит нот) буцаагдахгүй — <code>party.unapply_cancellation_not_allowed</code> (BR-AR-48).</p>');
    return html;
  }
  function doUnapply(appNo, rerender) {
    var S = E().state();
    var rows = S.dcle.filter(function (d) { return d.applicationNo === appNo && d.entryType === 'APPLICATION' && !d.unapplied; });
    var cancelCm = rows.some(function (d) { var p = E().sales.getPosted(d.documentNo); return p && p.docType === 'CREDIT_MEMO' && p.reason === 'CANCEL'; });
    if (cancelCm) { ui.modal({ title: 'Тулгалт цуцлах боломжгүй', body: ui.errList([{ code: 'party.unapply_cancellation_not_allowed', message: 'Цуцлалтын тулгалт буцаагдахгүй. Алдаатай цуцалсан бол шинэ нэхэмжлэх үүсгэнэ (BR-AR-48).' }], 'Тулгалтыг буцаах боломжгүй') }); return; }
    var docs = {};
    rows.forEach(function (d) { docs[cleOf(d.cleEntryNo).documentNo] = 1; });
    ui.confirm({ title: 'Тулгалт №' + appNo + '-ийг цуцлах уу?', ok: 'Тулгалт цуцлах', danger: true,
      body: '<p>Оролцогч баримт: <span class="code">' + Object.keys(docs).join(', ') + '</span>. Огноо: ' + ui.date(today()) + '.</p><p>Толин тусгал detailed мөр нэмэгдэж үлдэгдэл сэргэнэ. Баримтууд хэвээр үлдэх тул дахин тулгаж болно (BR-AR-47).</p>' })
      .then(function (ok) {
        if (!ok) return;
        var r = E().ledger.unapplyCustomer(appNo, today());
        if (!r.ok) { ui.modal({ title: 'Тулгалт цуцлах боломжгүй', body: ui.errList(r.errors, 'Тулгалтыг цуцлах боломжгүй') }); return; }
        ui.toast('Тулгалт №' + appNo + ' буцаагдлаа.');
        rerender();
      });
  }

  function statementTab(ctx, c) {
    var F = ctx.arStmtFrom || '2026-07-01', T = ctx.arStmtTo || today();
    var det = E().state().dcle.filter(function (d) { return d.customer === c.no; });
    var opening = sum(det.filter(function (d) { return d.postingDate < F; }), function (d) { return d.amount; });
    var lines = det.filter(function (d) { return d.postingDate >= F && d.postingDate <= T && d.entryType !== 'APPLICATION'; });
    var closing = sum(det.filter(function (d) { return d.postingDate <= T; }), function (d) { return d.amount; });
    var ag = custAging(T).parties.filter(function (x) { return x.party === c.no; })[0];
    var run = opening;
    var html = '<div class="card" data-note="ar.statement"><div class="card-head"><h2>Дансны хуулга (тооцоо нийлсэн акт)</h2><div class="row">' +
      '<label class="small" for="st-from">Эхлэх</label>' + ui.dateInput('st-from', F, ' style="width:120px"') + '<label class="small" for="st-to">Дуусах</label>' + ui.dateInput('st-to', T, ' style="width:120px"') + '</div></div>' +
      '<div class="card-body stack"><div class="ar-stmt-head"><div><strong>' + ui.esc(ERP.data.company.name) + '</strong><br><span class="xs">ТТД ' + ERP.data.company.tin + '</span></div><div class="ar-stmt-to"><span class="xs muted">Хэнд</span><br><strong>' + ui.esc(c.name) + '</strong><br><span class="xs">' + ui.esc(idText(c)) + '</span></div></div>' +
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Огноо</th><th>Баримт</th><th>Тайлбар</th><th class="num">Дебит (нэхэмжилсэн)</th><th class="num">Кредит (төлсөн / буцаасан)</th><th class="num">Үлдэгдэл</th></tr></thead><tbody>' +
      '<tr class="subtotal"><td>' + ui.date(F) + '</td><td colspan="4">Эхний үлдэгдэл</td>' + ui.moneyCell(opening) + '</tr>' +
      lines.map(function (d) {
        run += d.amount;
        var e = cleOf(d.cleEntryNo);
        return '<tr><td>' + ui.date(d.postingDate) + '</td><td class="code">' + ui.esc(d.documentNo) + '</td><td>' + ui.esc(d.unappliedOf ? 'Тулгалт буцаасан' : (e ? e.description : '')) + '</td>' + ui.moneyCell(Math.max(d.amount, 0), { blankZero: true }) + ui.moneyCell(Math.max(-d.amount, 0), { blankZero: true }) + ui.moneyCell(run) + '</tr>';
      }).join('') +
      '</tbody><tfoot><tr><td>' + ui.date(T) + '</td><td colspan="2">Эцсийн үлдэгдэл</td>' + ui.moneyCell(sum(lines, function (d) { return Math.max(d.amount, 0); })) + ui.moneyCell(sum(lines, function (d) { return Math.max(-d.amount, 0); })) + ui.moneyCell(closing) + '</tr></tfoot></table></div>' +
      '<h3 class="small">' + ui.date(T) + '-ний байдлаарх нээлттэй баримт</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>Баримт</th><th>Төлөх огноо</th><th class="num">Хоцролт</th><th class="num">Үлдэгдэл</th></tr></thead><tbody>' +
      (ag ? ag.entries.map(function (x) { return '<tr><td class="code">' + ui.esc(x.entry.documentNo) + '</td><td>' + ui.date(x.entry.dueDate) + '</td><td class="num">' + (x.days > 0 ? x.days : '—') + '</td>' + ui.moneyCell(x.remaining) + '</tr>'; }).join('') : '<tr><td colspan="4" class="empty">Нээлттэй баримт алга.</td></tr>') +
      '</tbody></table></div><div class="ar-sign xs"><span>Харилцагч: ............................</span><span>Нягтлан: ............................</span></div>' +
      '<p class="xs muted">Хэвлэх, PDF-ээр илгээх нь бүтээгдэхүүнд (S-RPT-04); прототипт зөвхөн урьдчилан харна.</p></div></div>';
    html += ui.calc('Тооцоог харах: хуулгын үлдэгдэл', '<div class="formula">Эхний үлдэгдэл = Σ detailed (огноо < ' + ui.date(F) + ')            = ' + fmtM(opening) +
      '\n+ Σ мөр (INITIAL + unapply, ' + ui.date(F) + '–' + ui.date(T) + ')   = ' + fmtM(sum(lines, function (d) { return d.amount; })) +
      '\n+ Σ APPLICATION (хосын нийлбэр, харуулахгүй)    = ' + fmtM(sum(det.filter(function (d) { return d.postingDate >= F && d.postingDate <= T && d.entryType === 'APPLICATION'; }), function (d) { return d.amount; })) +
      '\n= Эцсийн үлдэгдэл = Σ detailed (огноо ≤ ' + ui.date(T) + ')   = ' + fmtM(closing) + '</div><p class="xs">APPLICATION мөрүүдийг хуулгад харуулахгүй: нэг харилцагчийн хүрээнд хосоороо 0 (06 §5.18.1).</p>');
    return html;
  }

  // ===========================================================================
  // #cust-apply — S-PTY-07 apply entries + S-SAL-11 register payment
  // ===========================================================================
  var ap = null;                                               // worksheet state (party.application_draft analogue, in memory)
  function apReset(cust, ctx) {
    ap = { cust: cust, src: 'NEW', bank: 'KHAN01', date: today(), amount: null, desc: '', sel: {}, amt: {}, done: null };
    var pre = ctx.arApplyTargets || [];
    ctx.arApplyTargets = null;
    if (pre.length) {
      var total = 0;
      E().state().cle.forEach(function (e) {
        if (e.customer === cust && e.open && e.remaining > 0 && pre.indexOf(e.documentNo) >= 0) { ap.sel[e.entryNo] = true; total += e.remaining; }
      });
      ap.amount = total || null;
    }
  }
  function apSources(cust) { return E().state().cle.filter(function (e) { return e.customer === cust && e.open && e.remaining < 0 && !e.reversed; }); }
  function apTargets(cust) {
    return E().state().cle.filter(function (e) { return e.customer === cust && e.open && e.remaining > 0 && !e.reversed; })
      .sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.entryNo - b.entryNo; });
  }
  function apAvailable() {
    if (ap.src === 'NEW') return ap.amount || 0;
    var e = cleOf(+ap.src); return e ? Math.abs(e.remaining) : 0;
  }
  function apPlan() {                                           // [{ entry, amount }] in due-date order; typed amounts first, the rest fills empty ones
    var sel = apTargets(ap.cust).filter(function (t) { return ap.sel[t.entryNo]; });
    var typed = function (t) { return ap.amt[t.entryNo] !== null && ap.amt[t.entryNo] !== undefined; };
    var avail = apAvailable() - sum(sel.filter(typed), function (t) { return ap.amt[t.entryNo] || 0; });
    return sel.map(function (t) {
      if (typed(t)) return { entry: t, amount: ap.amt[t.entryNo], typed: true };
      var a = Math.max(0, Math.min(t.remaining, avail));
      avail -= a;
      return { entry: t, amount: a, typed: false };
    });
  }
  function apErrors(plan) {
    var errs = [];
    if (ap.src === 'NEW') {
      if (!ap.amount || ap.amount <= 0) errs.push({ code: 'bank.amount_required', message: 'Төлбөрийн дүн оруулна уу.' });
      if (!ui.parseDate(ui.date(ap.date))) errs.push({ code: 'api.invalid_date', message: 'Огноо буруу.' });
    }
    if (!periodOpen(ap.date)) errs.push({ code: 'gl.period_closed', message: 'Огноо ' + ui.date(ap.date) + ' хаалттай үед байна (BR-AR-28).' });
    var avail = apAvailable(), total = 0;
    plan.forEach(function (p) {
      if (p.amount <= 0) errs.push({ code: 'party.application_nothing_to_apply', message: p.entry.documentNo + ': тулгах дүн 0 (BR-AR-30).' });
      if (p.amount > p.entry.remaining) errs.push({ code: 'party.application_exceeds_remaining', message: p.entry.documentNo + ': тулгах дүн үлдэгдэл ' + fmtM(p.entry.remaining) + '-ээс их (BR-AR-35).' });
      if (p.entry.postingDate > ap.date) errs.push({ code: 'party.application_date_before_entries', message: p.entry.documentNo + ' нь ' + ui.date(p.entry.postingDate) + '-нд бичигдсэн; тулгалтын огноо түүнээс өмнө байж болохгүй (BR-AR-27).' });
      total += p.amount;
    });
    if (ap.src !== 'NEW') { var s = cleOf(+ap.src); if (s && s.postingDate > ap.date) errs.push({ code: 'party.application_date_before_entries', message: 'Тулгалтын огноо ' + s.documentNo + '-ийн огнооноос өмнө байна (BR-AR-27).' }); }
    if (total > avail) errs.push({ code: 'party.application_exceeds_remaining', message: 'Тулгах нийт ' + fmtM(total) + ' > тулгаж буй дүн ' + fmtM(avail) + '.' });
    if (ap.src !== 'NEW' && !plan.length) errs.push({ code: 'party.application_nothing_to_apply', message: 'Тулгах нэхэмжлэх сонгоно уу (BR-AR-30).' });
    return errs;
  }
  function renderApply(el, ctx) {
    var cust = ctx.arApplyCust && customer(ctx.arApplyCust) ? ctx.arApplyCust : 'C00004';
    if (!ap || ap.cust !== cust || ctx.arApplyTargets) apReset(cust, ctx);
    ctx.arApplyCust = cust;
    var c = customer(cust);
    var srcs = apSources(cust), tg = apTargets(cust);
    if (ap.src !== 'NEW' && !srcs.some(function (s) { return String(s.entryNo) === String(ap.src); })) ap.src = 'NEW';
    var banks = ERP.data.bankAccounts;
    var html = '<div class="page-head"><div class="title-wrap"><h1>Төлбөр бүртгэх ба тулгах</h1><span class="docno">' + ui.esc(c.name) + '</span></div>' +
      '<div class="row"><label class="sr-only" for="ap-cust">Харилцагч</label><select class="select" id="ap-cust">' + ERP.data.customers.map(function (x) { return opt(x.no, x.no + ' · ' + x.name, x.no === cust); }).join('') + '</select>' +
      '<a class="btn ghost" href="#customer" id="ap-card">Харилцагчийн карт</a></div></div>';
    if (ap.done) html += '<div class="banner" role="status"><strong>Батлагдлаа.</strong> ' + ap.done + '</div>';
    html += '<div class="grid cols-2 ap-grid"><div class="card" data-note="ap.applying"><div class="card-head"><h2>1. Тулгаж буй бичилт (New)</h2></div><div class="card-body stack">' +
      '<fieldset class="ap-src"><legend class="sr-only">Тулгаж буй бичилт</legend>' +
      '<label class="checkbox" for="ap-src-new"><input type="radio" name="ap-src" id="ap-src-new" value="NEW"' + (ap.src === 'NEW' ? ' checked' : '') + '> Шинэ төлбөр бүртгэх</label>' +
      srcs.map(function (s) { return '<label class="checkbox" for="ap-src-' + s.entryNo + '"><input type="radio" name="ap-src" id="ap-src-' + s.entryNo + '" value="' + s.entryNo + '"' + (String(ap.src) === String(s.entryNo) ? ' checked' : '') + '> ' + docTypeLabel(s.documentType) + ' <span class="code">' + s.documentNo + '</span> · ' + ui.date(s.postingDate) + ' · үлдэгдэл ' + fmtM(s.remaining) + '</label>'; }).join('') +
      (srcs.length ? '' : '<p class="xs muted">Тулгагдаагүй төлбөр, кредит нот алга — шинэ төлбөр бүртгэнэ.</p>') + '</fieldset>' +
      '<form id="ap-form" class="form-grid"' + (ap.src === 'NEW' ? '' : ' hidden') + ' data-note="ar.payment">' +
      '<div class="field"><label class="req" for="ap-date">Огноо</label>' + ui.dateInput('ap-date', ap.date) + '</div>' +
      '<div class="field"><label class="req" for="ap-bank">Мөнгөний данс</label><select class="select" id="ap-bank">' + banks.map(function (b) { return opt(b.no, b.name + ' (' + E().setup.bankGlAccount(b.no) + ')', b.no === ap.bank); }).join('') + '</select><span class="hint">' + (E().setup.bank(ap.bank).kind === 'CASH' ? 'Касс → МХ-1 кассын орлогын баримт KO-2026-#####' : 'Банк → банкны орлогын ваучер BR-2026-#####') + '</span></div>' +
      '<div class="field"><label class="req" for="ap-amount">Дүн (₮)</label><input class="input num mono" id="ap-amount" inputmode="decimal" autocomplete="off" value="' + ui.esc(amtInputVal(ap.amount)) + '"></div>' +
      '<div class="field"><label for="ap-desc">Тайлбар</label><input class="input" id="ap-desc" maxlength="100" value="' + ui.esc(ap.desc) + '" placeholder="Төлбөр ' + ui.esc(c.name) + '"></div></form>' +
      (ap.src !== 'NEW' ? '<div class="field" style="max-width:200px"><label class="req" for="ap-date2">Тулгалтын огноо</label>' + ui.dateInput('ap-date2', ap.date) + '</div>' : '') +
      '</div></div>';
    html += '<div class="card" data-note="ap.targets"><div class="card-head"><h2>2. Нээлттэй нэхэмжлэх</h2><div class="row"><button class="btn sm" type="button" id="ap-auto">Төлөх огноогоор хуваарилах</button><button class="btn sm ghost" type="button" id="ap-clear">Цэвэрлэх</button></div></div>' +
      '<div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th><span class="sr-only">Сонгох</span></th><th>Баримт</th><th>Төлөх огноо</th><th class="num">Үлдэгдэл</th><th class="num">Тулгах дүн</th></tr></thead><tbody>' +
      (tg.map(function (t) {
        var od = t.dueDate < ap.date;
        return '<tr><td><input type="checkbox" id="ap-sel-' + t.entryNo + '" data-sel="' + t.entryNo + '"' + (ap.sel[t.entryNo] ? ' checked' : '') + ' aria-label="' + t.documentNo + ' сонгох"></td><td class="code">' + t.documentNo + '<br><span class="xs muted">' + ui.date(t.postingDate) + '</span></td>' +
          '<td>' + ui.date(t.dueDate) + (od ? ' ' + ui.pill('OVERDUE', E().dates.daysBetween(t.dueDate, ap.date) + ' хоног') : '') + '</td>' + ui.moneyCell(t.remaining) +
          '<td class="num"><label class="sr-only" for="ap-amt-' + t.entryNo + '">' + t.documentNo + ' тулгах дүн</label><input class="input num mono ap-amt" id="ap-amt-' + t.entryNo + '" data-amt="' + t.entryNo + '" inputmode="decimal" autocomplete="off" placeholder="бүх үлдэгдэл" value="' + ui.esc(amtInputVal(ap.amt[t.entryNo])) + '"' + (ap.sel[t.entryNo] ? '' : ' disabled') + '></td></tr>';
      }).join('') || '<tr><td colspan="5" class="empty">Энэ харилцагчид нээлттэй нэхэмжлэх алга. Төлбөр бүртгэвэл урьдчилгаа болж үлдэнэ (BR-AR-50).</td></tr>') +
      '</tbody></table></div></div></div></div>';
    html += '<div id="ap-derived" class="stack"></div>';
    html += '<div class="actionbar"><button class="btn primary" type="button" id="ap-post">' + (ap.src === 'NEW' ? 'Төлбөр батлах ба тулгах' : 'Тулгах') + '</button><a class="btn" href="#customer" id="ap-card2">Болих</a></div>';
    el.innerHTML = html;
    updateApplyDerived();
    var refresh = function () { renderApply(el, ctx); app.decorateNotes(); };
    ui.$('#ap-cust').addEventListener('change', function (ev) { ctx.arApplyCust = ev.target.value; ap = null; refresh(); });
    ['#ap-card', '#ap-card2'].forEach(function (s) { ui.$(s).addEventListener('click', function (ev) { ev.preventDefault(); app.navigate('customer', { customerNo: cust }); }); });
    ui.$$('input[name="ap-src"]', el).forEach(function (r) { r.addEventListener('change', function () { ap.src = r.value; ap.done = null; refresh(); var n = ui.$('#' + r.id); if (n) n.focus(); }); });
    ui.$('#ap-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    bindDate('ap-date', function (v) { ap.date = v; updateApplyDerived(); });
    bindDate('ap-date2', function (v) { ap.date = v; updateApplyDerived(); });
    var bank = ui.$('#ap-bank');
    if (bank) bank.addEventListener('change', function () { ap.bank = bank.value; refresh(); ui.$('#ap-bank').focus(); });
    var amt = ui.$('#ap-amount');
    if (amt) {
      amt.addEventListener('input', function () { var v = parseAmt(amt.value); ap.amount = v; amt.classList.toggle('invalid', amt.value !== '' && v === null); updateApplyDerived(); });
      amt.addEventListener('blur', function () { if (ap.amount !== null) amt.value = amtInputVal(ap.amount); });
    }
    var desc = ui.$('#ap-desc');
    if (desc) desc.addEventListener('input', function () { ap.desc = desc.value; });
    ui.$$('[data-sel]', el).forEach(function (cb) {
      cb.addEventListener('change', function () {
        var n = +cb.getAttribute('data-sel');
        ap.sel[n] = cb.checked;
        var inp = ui.$('#ap-amt-' + n); inp.disabled = !cb.checked;
        if (!cb.checked) { ap.amt[n] = null; inp.value = ''; }
        updateApplyDerived();
      });
    });
    ui.$$('[data-amt]', el).forEach(function (inp) {
      inp.addEventListener('input', function () { var n = +inp.getAttribute('data-amt'); var v = parseAmt(inp.value); ap.amt[n] = inp.value === '' ? null : v; inp.classList.toggle('invalid', inp.value !== '' && v === null); updateApplyDerived(); });
      inp.addEventListener('blur', function () { var n = +inp.getAttribute('data-amt'); if (ap.amt[n] !== null && ap.amt[n] !== undefined) inp.value = amtInputVal(ap.amt[n]); });
    });
    ui.$('#ap-auto').addEventListener('click', function () {          // BR-AR-34 DUE_DATE allocation
      var avail = apAvailable();
      if (ap.src === 'NEW' && !ap.amount) { avail = sum(tg, function (t) { return t.remaining; }); ap.amount = avail; }
      ap.sel = {}; ap.amt = {};
      tg.forEach(function (t) { if (avail <= 0) return; var a = Math.min(t.remaining, avail); ap.sel[t.entryNo] = true; ap.amt[t.entryNo] = a; avail -= a; });
      refresh();
    });
    ui.$('#ap-clear').addEventListener('click', function () { ap.sel = {}; ap.amt = {}; refresh(); });
    ui.$('#ap-post').addEventListener('click', function () { doApply(ctx, refresh); });
  }
  function updateApplyDerived() {
    var host = ui.$('#ap-derived');
    if (!host) return;
    var plan = apPlan(), errs = apErrors(plan), avail = apAvailable();
    var total = sum(plan, function (p) { return p.amount; });
    var c = customer(ap.cust);
    var newLabel = ap.src === 'NEW' ? (E().setup.bank(ap.bank).kind === 'CASH' ? 'KO-2026-*****' : 'BR-2026-*****') : (cleOf(+ap.src) || {}).documentNo;
    var inPosting = ap.src === 'NEW' && plan.length === 1 && plan[0].amount === avail && avail > 0;
    var html = '<div class="card"><div class="card-head"><h2>3. Нийлбэр</h2></div><div class="card-body"><dl class="totals ap-totals"><dt>Тулгаж буй дүн</dt><dd>' + fmtM(avail, { sym: true }) + '</dd><dt>Тулгах нийт (' + plan.length + ' баримт)</dt><dd>' + fmtM(total, { sym: true }) + '</dd>' +
      '<dt class="grand">Тулгагдаагүй үлдэх (урьдчилгаа)</dt><dd class="grand">' + fmtM(Math.max(avail - total, 0), { sym: true }) + '</dd></dl>' +
      (ap.src === 'NEW' ? '<p class="xs muted">Тулгалтын арга: ' + (inPosting ? '<strong>posting доторх</strong> — төлбөрийн мөрийн Applies-to Doc. = ' + plan[0].entry.documentNo + ' (гүйлгээтэй, BR-AR-25, 29).' : plan.length ? '<strong>Applies-to ID</strong> — төлбөр батлагдсаны дараа сонгосон бичилтүүдтэй нэг application №-оор тулгана (G/L-гүй, BR-AR-24, 25).' : 'тулгах баримтгүй → нээлттэй урьдчилгаа төлбөр (BR-AR-50).') + '</p>' : '') + '</div></div>';
    var touched = ap.src !== 'NEW' || ap.amount !== null || plan.length > 0;
    html += touched ? ui.errList(errs, 'Батлах боломжгүй — дараах алдааг засна уу') : '<p class="small muted">Дүн оруулж, тулгах нэхэмжлэхээ сонгоно уу (эсвэл "Төлөх огноогоор хуваарилах").</p>';
    // result preview
    var rows = '';
    plan.forEach(function (p) {
      rows += '<tr><td class="code">' + p.entry.documentNo + '</td><td>Old (нэхэмжлэх)</td><td class="num">−' + fmtM(p.amount) + '</td><td class="code">' + ui.esc(newLabel) + '</td>' + ui.moneyCell(p.entry.remaining - p.amount) + '<td>' + (p.entry.remaining - p.amount === 0 ? ui.pill('CLOSED', 'Хаагдана') : ui.pill('PARTIALLY_PAID', 'Хэсэгчлэн')) + '</td></tr>' +
        '<tr><td class="code">' + ui.esc(newLabel) + '</td><td>New (төлбөр)</td><td class="num">+' + fmtM(p.amount) + '</td><td class="code">' + p.entry.documentNo + '</td><td></td><td></td></tr>';
    });
    var glPrev = '';
    if (ap.src === 'NEW' && ap.amount > 0 && periodOpen(ap.date)) {
      var r = E().payments.receipt({ date: ap.date, bank: ap.bank, cust: ap.cust, amount: ap.amount, desc: ap.desc || null }, { preview: true });
      if (r.ok) glPrev = '<h3 class="small">Төлбөрийн ваучер (' + (E().setup.bank(ap.bank).kind === 'CASH' ? 'МХ-1, KO-2026-#####' : 'BR-2026-#####') + ', дугаар батлахад олгоно)</h3>' + glTable(r.result.vouchers[0].gl);
      else glPrev = ui.errList(r.errors, 'Төлбөрийн ваучер');
    }
    html += '<div class="card" data-note="ap.result"><div class="card-head"><h2>4. Үүсэх detailed мөрүүд</h2><span class="small muted">application № = (шинэ), огноо ' + ui.date(ap.date) + '</span></div><div class="card-body stack">' +
      (plan.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Entry-ийн баримт</th><th>Үүрэг</th><th class="num">APPLICATION мөр</th><th>Хос</th><th class="num">Үлдэгдэл дараа</th><th>Төлөв</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="small muted">Нэхэмжлэх сонгоогүй.</p>') +
      glPrev + '</div></div>';
    html += ui.calc('Тооцоог харах: тулгах дүн a = min(...)', (function () {
      var rem = avail, s = '<div class="formula">Тулгаж буй үлдэгдэл |New| = ' + fmtM(avail) + '\n';
      plan.forEach(function (p, i) {
        var auto = Math.min(rem, p.entry.remaining);
        s += '\n' + (i + 1) + ') ' + p.entry.documentNo + ': a = min(|New| ' + fmtM(rem) + ', Old ' + fmtM(p.entry.remaining) + (p.typed ? ', amountToApply ' + fmtM(p.amount) : '') + ') = ' + fmtM(Math.min(auto, p.amount)) +
          '\n   Old мөр = −sign(Old) × a = −' + fmtM(p.amount) + ';  New мөр = +' + fmtM(p.amount) + '\n   Old үлдэгдэл ' + fmtM(p.entry.remaining) + ' → ' + fmtM(p.entry.remaining - p.amount);
        rem = Math.max(rem - p.amount, 0);
      });
      return s + '\n\nNew үлдэгдэл → −' + fmtM(rem) + (rem ? ' (нээлттэй урьдчилгаа)' : ' (хаагдана)') + '</div><p class="xs">BR-AR-22..23: хос бүрийн мөрийн нийлбэр 0 тул 1200 дансны G/L өөрчлөгдөхгүй; төлбөр өөрөө л Дт ' + E().setup.bankGlAccount(ap.bank) + ' / Кт 1200 бичнэ.</p>';
    })());
    host.innerHTML = html;
    app.decorateNotes();
    var btn = ui.$('#ap-post');
    if (btn) btn.disabled = errs.length > 0;
  }
  function doApply(ctx, refresh) {
    var plan = apPlan(), errs = apErrors(plan);
    if (errs.length) { updateApplyDerived(); return; }
    var c = customer(ap.cust);
    var avail = apAvailable();
    var body = '<p>' + ui.esc(c.name) + ' · ' + ui.date(ap.date) + (ap.src === 'NEW' ? ' · төлбөр <strong>' + fmtM(ap.amount, { sym: true }) + '</strong> (' + ui.esc(E().setup.bank(ap.bank).name) + ')' : '') + '</p>' +
      (plan.length ? '<p>Тулгах: ' + plan.map(function (p) { return '<span class="code">' + p.entry.documentNo + '</span> ' + fmtM(p.amount); }).join(', ') + '</p>' : '<p>Тулгах баримтгүй — урьдчилгаа болж үлдэнэ.</p>');
    ui.confirm({ title: ap.src === 'NEW' ? 'Төлбөр батлах уу?' : 'Тулгах уу?', ok: ap.src === 'NEW' ? 'Батлах' : 'Тулгах', body: body }).then(function (ok) {
      if (!ok) return;
      var newNo = ap.src === 'NEW' ? null : +ap.src, payNo = null, msg = [];
      var inPosting = ap.src === 'NEW' && plan.length === 1 && plan[0].amount === avail;
      if (ap.src === 'NEW') {
        var r = E().payments.receipt({ date: ap.date, bank: ap.bank, cust: ap.cust, amount: ap.amount, desc: ap.desc || null, appliesTo: inPosting ? plan[0].entry.entryNo : null });
        if (!r.ok) { ui.modal({ title: 'Батлах боломжгүй', body: ui.errList(r.errors) }); return; }
        var v = r.result.vouchers[0];
        payNo = v.documentNo; newNo = v.cle[0].entryNo;
        msg.push('Төлбөр <strong>' + payNo + '</strong>' + (v.cashVoucher ? ' (МХ-1 ' + v.cashVoucher.no + ')' : '') + ' · гүйлгээ №' + v.transactionNo);
        if (inPosting) msg.push('posting доторх тулгалт: ' + plan[0].entry.documentNo);
      }
      if (!inPosting && plan.length) {
        var engPlan = E().ledger.applyCustomer(newNo, plan.map(function (p) { return p.entry.entryNo; }), ap.date, { preview: true });
        var same = engPlan.ok && engPlan.plan.length === plan.length && engPlan.plan.every(function (x, i) { return x.amount === plan[i].amount; });
        var res = same ? E().ledger.applyCustomer(newNo, plan.map(function (p) { return p.entry.entryNo; }), ap.date)
          : applyCapped(newNo, plan.map(function (p) { return { entryNo: p.entry.entryNo, amount: p.amount }; }), ap.date);
        if (!res.ok) { ui.modal({ title: 'Тулгах боломжгүй', body: ui.errList(res.errors) }); refresh(); return; }
        msg.push('тулгалт №' + res.applicationNo + ' (' + fmtM(res.applied, { sym: true }) + ', ' + plan.length + ' баримт' + (same ? '' : ', хэсэгчилсэн дүнтэй') + ')');
      }
      app.ctx.customerNo = ap.cust; app.ctx.arCardTab = 'apps';
      ap.done = msg.join(' · ') + '. <a href="#customer">Харилцагчийн карт › Тулгалт</a>';
      ap.sel = {}; ap.amt = {}; ap.amount = null; ap.desc = ''; ap.src = 'NEW';
      ui.toast('Батлагдлаа: ' + msg.join(' · '));
      refresh();
    });
  }

  // ===========================================================================
  // #credit-memo — S-SAL-04 from a posted invoice + eBarimt return / correction (12 §12)
  // ===========================================================================
  var cm = null;                                                 // { src, reason, date, desc, qty: [], price: [], override }
  function cmReset(no) {
    var p = E().sales.getPosted(no);
    cm = { src: no, reason: 'RETURN', date: today(), desc: '', qty: [], price: [], override: false, result: null };
    if (!p) return;
    p.lines.forEach(function (l, i) { cm.qty[i] = '0'; cm.price[i] = l.unitPrice; });
  }
  function priorCredit(p) {                                       // per invoice line: credited qty / amount by earlier memos
    var memos = memosOf(p);
    return p.lines.map(function (l) {
      var q = 0n, aiv = 0, amt = 0, vat = 0;
      memos.forEach(function (m) { m.lines.forEach(function (ml) { if (ml.no === l.no && ml.type === l.type) { if (ml.unitPrice === l.unitPrice) q += E().money.parseScaled(ml.qty, 5); aiv += ml.aiv; amt += ml.amount; vat += ml.vat; } }); });
      var invQ = E().money.parseScaled(l.qty, 5);
      return { qty: q, aiv: aiv, amount: amt, vat: vat, qtyLeft: invQ - q, aivLeft: l.aiv - aiv };
    });
  }
  function cmLines(p) {
    return p.lines.map(function (l, i) {
      return { type: l.type, no: l.no, description: l.description, qty: cm.qty[i] || '0', price: cm.reason === 'PRICE_ADJ' ? cm.price[i] : l.unitPrice, disc: l.disc, vatProd: l.vatProd };
    });
  }
  function cmCalc(p) {
    return E().calcDocument({ side: 'SALE', docType: 'CREDIT_MEMO', pricesInclVat: p.piv, vatBus: p.vatBus, genBus: p.genBus, lines: cmLines(p) });
  }
  function cmTransientDraft(p, c) {                                // not stored: preview / precheck only
    return { no: 'DSC-(урьдчилсан)', docType: 'CREDIT_MEMO', status: 'OPEN', customer: c.no, customerName: c.name, cpg: p.cpg, genBus: p.genBus, vatBus: p.vatBus,
      terms: p.terms, method: p.method, piv: p.piv, ebarimtType: 'AUTO', dueDate: null, consumerNo: '', postingDate: cm.date, documentDate: cm.date,
      appliesTo: p.no, reason: cm.reason, lines: cmLines(p).filter(function (l) { return E().money.parseScaled(l.qty || '0', 5) > 0n; }) };
  }
  // 12 §12.6 ReportMonthDecision
  function reportMonthDecision(type, srcMonth, nowDate) {
    var cur = nowDate.slice(0, 7);
    var y = +cur.slice(0, 4), m = +cur.slice(5, 7);
    var prev = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
    if (srcMonth === cur) return { rm: null, decision: 'OK' };
    if (srcMonth === prev) {
      if (type !== 'B2C_RECEIPT') return +nowDate.slice(8, 10) <= 7 ? { rm: srcMonth, decision: 'OK' } : { rm: null, decision: 'WINDOW_CLOSED' };
      return { rm: null, decision: 'CROSS_MONTH_B2C' };
    }
    return { rm: null, decision: 'TOO_OLD' };
  }
  // 12 §12.8 ResolveChainForMemo (decision only — what the posting will do with eBarimt)
  function cmEbarimtPlan(p, calc) {
    var docs = chainDocs(p);
    var plan = { action: 'NO_DOCUMENT', errors: [], superseded: [], latest: null, type: p.ebarimtType, net: [], netEmpty: false, rm: null, decision: null };
    if (!docs.length) { plan.reason = p.ebarimtType === 'NONE' ? 'Нэхэмжлэх eBarimt-гүй (NONE) тул кредит нотод ч баримт үүсэхгүй.' : 'Нэхэмжлэхэд eBarimt баримт үүсээгүй.'; return plan; }
    var last = docs[docs.length - 1];
    if (docs.every(function (d) { return d.status === 'CANCELLED' && !d.ddtd; }) && /^MANUAL_CANCEL:/.test(last.resolutionNote || '')) { plan.reason = 'Гинжийг "Цуцлах"-аар санаатай цуцалсан тул кредит нотод баримт үүсэхгүй (RET-62).'; return plan; }
    plan.type = docs[0].type;                                         // TYP-06
    var live = docs.filter(function (d) { return ['PENDING', 'SENT', 'UNKNOWN', 'ERROR'].indexOf(d.status) >= 0 && d.operation !== 'MANUAL_VOID'; });
    if (live.some(function (d) { return d.status === 'SENT'; })) plan.errors.push({ code: 'ebarimt.predecessor_in_flight', message: 'Гинжинд илгээгдэж буй (SENT) баримт байна. Хэдэн секундын дараа дахин оролдоно уу (BR-SAL-76).' });
    if (live.some(function (d) { return d.status === 'UNKNOWN'; })) plan.errors.push({ code: 'ebarimt.predecessor_unknown', message: 'Гинжинд UNKNOWN баримт байна. Эхлээд eBarimt хяналтаас шийдвэрлэнэ үү (12 §11, BR-SAL-76).' });
    if (docs.some(function (d) { return d.operation === 'MANUAL_VOID' && d.status === 'PENDING'; })) plan.errors.push({ code: 'ebarimt.predecessor_in_flight', message: 'Порталд гараар цуцлах хүсэлт хүлээгдэж байна (RET-51).' });
    plan.superseded = live.filter(function (d) { return d.status === 'PENDING' || d.status === 'ERROR'; });
    plan.latest = latestOf(docs);
    // net state (12 §12.3) per invoice line: invoice − earlier memos − this memo
    var prior = priorCredit(p);
    plan.net = p.lines.map(function (l, i) {
      var cl = calc.lines[i] || { aiv: 0, vatAmount: 0 };
      var thisAiv = cl.blank ? 0 : (cl.aiv || 0);
      return { line: l, inv: l.aiv, prior: prior[i].aiv, cur: thisAiv, net: l.aiv - prior[i].aiv - thisAiv };
    });
    plan.netEmpty = plan.net.every(function (n) { return n.net <= 0; });
    if (plan.netEmpty) {
      if (!plan.latest) { plan.action = 'NO_DOCUMENT'; plan.reason = 'Цэвэр төлөв хоосон бөгөөд хүчинтэй (SUCCESS) баримт байхгүй → хоёулаа баримтгүй (RET-60).'; }
      else if (plan.type === 'B2C_RECEIPT') { plan.action = 'DELETE'; plan.reason = 'Бүтэн B2C буцаалт → DELETE /rest/receipt { id: ' + plan.latest.ddtd + ' } (RET-20, 21).'; }
      else { plan.action = 'MANUAL_VOID'; plan.reason = 'Бүтэн B2B буцаалт: PosAPI-д B2B DELETE байхгүй → шинэ хүсэлт үүсэхгүй, e-invoice порталд гараар цуцлаад "Порталд цуцалсан" дарна (RET-50, 51).'; }
      return plan;
    }
    var srcMonth = plan.latest ? (plan.latest.ebarimtDate || '').slice(0, 7) : p.vatDate.slice(0, 7);
    var rmd = reportMonthDecision(plan.type, srcMonth, cm.date);
    plan.rm = rmd.rm; plan.decision = rmd.decision; plan.srcMonth = srcMonth;
    if ((rmd.decision === 'WINDOW_CLOSED' || rmd.decision === 'TOO_OLD') && plan.latest) {
      if (!cm.override) plan.errors.push({ code: 'ebarimt.report_month_window_closed', message: 'Засаж буй баримт ' + srcMonth + '-д бүртгэгдсэн; ' + (rmd.decision === 'TOO_OLD' ? 'өмнөх сараас өмнөх' : 'сарын 7-ны цонх хаагдсан') + ' тул засварын баримт илгээх боломжгүй (12 §12.6, FR-EBR-011 AC2).' });
      plan.action = cm.override ? 'OVERRIDE_NONE' : 'BLOCKED';
      plan.reason = cm.override ? 'Override: кредит нот eBarimt-гүй (NONE + шалтгаан) батлагдаж нийцлийн тайланд гарна.' : 'reportMonth цонх хаагдсан.';
      return plan;
    }
    plan.action = 'SAVE';
    plan.reason = 'Засварласан бүтэн төлөвийг шинэ баримтаар илгээнэ' + (plan.latest ? ', inactiveId = ' + plan.latest.ddtd : ' (хүчинтэй өмнөх баримтгүй тул inactiveId-гүй)') + (plan.rm ? ', reportMonth = ' + plan.rm : '') + ' (RET-30).';
    return plan;
  }
  function cmErrors(p, calc, plan) {
    var errs = calc.errors.slice();
    var prior = priorCredit(p);
    if (!cm.reason) errs.push({ code: 'sales.reason_code_required', message: 'Шалтгаан заавал (BR-SAL-61).' });
    if (cm.date < p.postingDate) errs.push({ code: 'sales.posting_date_before_invoice', message: 'Кредит нотын огноо нэхэмжлэхийн огноо (' + ui.date(p.postingDate) + ')-оос өмнө байж болохгүй (BR-SAL-66).' });
    if (!periodOpen(cm.date)) errs.push({ code: 'gl.period_closed', message: ui.date(cm.date) + ' хаалттай үед байна.' });
    var real = calc.lines.filter(function (l) { return l.qty > 0n; });
    if (!real.length) errs.push({ code: 'sales.no_lines', message: 'Буцаах тоо (> 0) оруулна уу (BR-SAL-36).' });
    calc.lines.forEach(function (l, i) {
      if (l.qty > prior[i].qtyLeft && cm.reason !== 'PRICE_ADJ') errs.push({ code: 'sales.credit_exceeds_invoice', message: 'Мөр ' + (i + 1) + ': буцаах тоо үлдсэн ' + E().money.fmtQty(prior[i].qtyLeft) + '-ээс их (BR-SAL-64).' });
      if ((l.aiv || 0) > prior[i].aivLeft) errs.push({ code: 'ebarimt.correction_exceeds_receipt', message: 'Мөр ' + (i + 1) + ': кредит ' + fmtM(l.aiv) + ' > үлдсэн ' + fmtM(prior[i].aivLeft) + ' (BR-SAL-64, 12 §12.3).' });
    });
    var priorTotal = sum(memosOf(p), function (m) { return m.amountInclVat; });
    if (priorTotal + calc.amountInclVat > p.amountInclVat) errs.push({ code: 'sales.credit_exceeds_invoice', message: 'Нийт кредит (' + fmtM(priorTotal + calc.amountInclVat) + ') нэхэмжлэхийн дүнгээс их (BR-SAL-64).' });
    if (cm.reason === 'CANCEL') {
      var e = cleOf(p.cleEntryNo);
      if (e && e.remaining !== e.amount) errs.push({ code: 'sales.invoice_has_applications', message: 'Хэсэгчлэн/бүтэн төлөгдсөн. Эхлээд тулгалтыг цуцлана уу (BR-SAL-71, FR-SAL-008 AC2).' });
    }
    return errs.concat(plan.errors);
  }
  function renderCreditMemo(el, ctx) {
    var invs = E().sales.postedInvoices();
    var srcNo = ctx.cmSource && E().sales.getPosted(ctx.cmSource) ? ctx.cmSource : (cm && cm.src) || 'SI-2026-00022';
    if (!cm || cm.src !== srcNo) cmReset(srcNo);
    ctx.cmSource = srcNo;
    var p = E().sales.getPosted(srcNo);
    var c = customer(p.customer);
    var html = '<div class="page-head"><div class="title-wrap"><h1>Кредит нот (буцаалт)</h1>' + (cm.result ? '<span class="docno">' + cm.result.no + '</span><span class="stamp">Бичигдсэн</span>' : '<span class="docno">DSC-…</span>' + ui.pill('DRAFT')) + '</div>' +
      '<div class="row"><label class="small" for="cm-src">Эх нэхэмжлэх</label><select class="select" id="cm-src">' + invs.slice().reverse().map(function (x) {
        var ps = E().sales.paymentStatus(x);
        return opt(x.no, x.no + ' · ' + x.customerName + ' · ' + fmtM(x.amountInclVat) + ' · ' + ui.pillLabel(chainStatusX(x) === 'MANUAL_VOID_REQUIRED' ? 'WARNING' : chainStatusX(x)) + (ps.status === 'PAID' ? ' · төлөгдсөн' : ''), x.no === srcNo);
      }).join('') + '</select></div></div>';
    html += '<p class="xs muted cm-examples">Жишээ: SI-2026-00022 (B2C, бэлэн) бүгдийг буцаавал DELETE + МХ-2 буцаан олголт · SI-2026-00023 (B2B, 9-р сар) хэсэгчилбэл reportMonth цонх хаагдсан, бүгдийг буцаавал порталд гараар цуцлах · SI-2026-00026 (B2C, ERROR) → SUPERSEDED · SI-2026-00025 (UNKNOWN) → хориг.</p><div id="cm-result"></div>';
    html += '<div class="doc-layout"><div class="doc-main">';
    var ps = E().sales.paymentStatus(p);
    html += '<div class="card" data-note="cm.source"><div class="card-head"><h2>Эх нэхэмжлэх ' + docLink(p.no) + '</h2><div class="row">' + ui.pill(ps.badge) + chainPill(chainStatusX(p)) + '</div></div><div class="card-body"><dl class="form-grid ro-grid">' +
      [['Харилцагч', c.no + ' · ' + c.name], ['Огноо', ui.date(p.postingDate)], ['Нийт', fmtM(p.amountInclVat, { sym: true })], ['Үлдэгдэл', fmtM(ps.remaining, { sym: true })],
        ['Төлбөрийн хэлбэр', (ERP.data.paymentMethods[p.method] || {}).name], ['eBarimt төрөл', ebLabel(p.ebarimtType)], ['Өмнөх кредит нот', memosOf(p).map(function (m) { return m.no; }).join(', ') || '—'], ['Үнийн горим', p.piv ? 'НӨАТ-тэй' : 'НӨАТ-гүй']]
        .map(function (x) { return '<div class="field"><dt class="flabel">' + x[0] + '</dt><dd>' + ui.esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div></div>';
    html += '<form id="cm-form" class="card" data-note="cm.reason"><div class="card-head"><h2>Толгой</h2></div><div class="card-body"><div class="form-grid">' +
      '<div class="field"><label class="req" for="cm-reason">Шалтгаан</label><select class="select" id="cm-reason">' + ['RETURN', 'PRICE_ADJ', 'CANCEL', 'CORRECTION'].map(function (k) { return opt(k, ERP.data.reasonCodes[k], cm.reason === k); }).join('') + '</select>' +
      '<span class="hint">' + { RETURN: 'Буцаах тоог оруулна', PRICE_ADJ: 'Тоо + хасах нэгжийн үнэ (НӨАТ-ын горимоор)', CANCEL: 'Бүтэн кредит нот, бүх мөр түгжигдэнэ (D-F6)', CORRECTION: 'Алдаатай мөрийг хэсэгчлэн залруулна' }[cm.reason] + '</span></div>' +
      '<div class="field"><label class="req" for="cm-date">Бүртгэлийн огноо</label>' + ui.dateInput('cm-date', cm.date) + '<span class="hint">≥ ' + ui.date(p.postingDate) + ' · үе ' + ui.pillLabel((E().periods.of(cm.date) || {}).status || 'CLOSED') + '</span></div>' +
      '<div class="field"><label for="cm-desc">Тайлбар</label><input class="input" id="cm-desc" maxlength="100" value="' + ui.esc(cm.desc) + '"></div>' +
      '<div class="field"><span class="flabel">Төлөх огноо</span><span class="cm-ro">' + ui.date(cm.date) + ' <span class="xs muted">= баримтын огноо (BR-SAL-05)</span></span></div></div></div></form>';
    html += '<div class="card"><div class="card-head"><h2>Мөрүүд (эх нэхэмжлэхээс)</h2><div class="row"><button class="btn sm" type="button" id="cm-all">Бүгдийг буцаах</button><button class="btn sm ghost" type="button" id="cm-none">Цэвэрлэх</button></div></div><div class="card-body flush"><div id="cm-lines"></div></div></div>';
    html += '<div id="cm-derived" class="stack"></div>';
    html += '</div><aside class="factbox" id="cm-factbox"></aside></div>';
    el.innerHTML = html;
    if (cm.result) showCmResult();
    renderCmLines(p);
    updateCm(p, c);
    var rerender = function () { renderCreditMemo(el, ctx); app.decorateNotes(); };
    ui.$$('.card-head [data-doc]', el).forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); openDoc(a.getAttribute('data-doc')); }); });
    ui.$('#cm-src').addEventListener('change', function (ev) { ctx.cmSource = ev.target.value; cm = null; rerender(); ui.$('#cm-src').focus(); });
    ui.$('#cm-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    ui.$('#cm-reason').addEventListener('change', function (ev) {
      cm.reason = ev.target.value;
      if (cm.reason === 'CANCEL') { var pr = priorCredit(p); p.lines.forEach(function (l, i) { cm.qty[i] = E().money.fmtQty(pr[i].qtyLeft).replace(/ /g, ''); }); }
      if (cm.reason !== 'PRICE_ADJ') p.lines.forEach(function (l, i) { cm.price[i] = l.unitPrice; });
      cm.override = false;
      rerender(); ui.$('#cm-reason').focus();
    });
    bindDate('cm-date', function (v) { cm.date = v; updateCm(p, c); });
    ui.$('#cm-desc').addEventListener('input', function (ev) { cm.desc = ev.target.value; });
    ui.$('#cm-all').addEventListener('click', function () { var pr = priorCredit(p); p.lines.forEach(function (l, i) { cm.qty[i] = E().money.fmtQty(pr[i].qtyLeft > 0n ? pr[i].qtyLeft : 0n).replace(/ /g, ''); }); renderCmLines(p); updateCm(p, c); });
    ui.$('#cm-none').addEventListener('click', function () { if (cm.reason === 'CANCEL') return; p.lines.forEach(function (l, i) { cm.qty[i] = '0'; }); renderCmLines(p); updateCm(p, c); });
  }
  function renderCmLines(p) {
    var host = ui.$('#cm-lines');
    var prior = priorCredit(p);
    var lock = cm.reason === 'CANCEL' || !!cm.result;
    host.innerHTML = '<div class="table-wrap"><table class="grid-table cm-grid"><thead><tr><th>Дугаар</th><th>Тайлбар</th><th class="num">Нэхэмжилсэн</th><th class="num">Өмнө буцаасан</th><th class="num">Буцаах тоо</th><th class="num">Нэгжийн үнэ</th><th class="num">Хөн.%</th><th class="num">Мөрийн дүн</th><th class="num">НӨАТ</th></tr></thead><tbody>' +
      p.lines.map(function (l, i) {
        return '<tr><td class="code">' + ui.esc(l.no) + '</td><td>' + ui.esc(l.description) + '</td><td class="num">' + ui.esc(l.qty) + ' ' + ui.esc(l.uomName || '') + '</td>' +
          '<td class="num">' + (prior[i].aiv ? E().money.fmtQty(prior[i].qty) + ' / ' + fmtM(prior[i].aiv) : '—') + '</td>' +
          '<td class="num"><label class="sr-only" for="cm-qty-' + i + '">Мөр ' + (i + 1) + ' буцаах тоо</label><input class="input num mono" id="cm-qty-' + i + '" data-qty="' + i + '" inputmode="decimal" autocomplete="off" value="' + ui.esc(cm.qty[i]) + '"' + (lock ? ' readonly' : '') + ' style="width:84px"></td>' +
          '<td class="num">' + (cm.reason === 'PRICE_ADJ' && !cm.result ? '<label class="sr-only" for="cm-price-' + i + '">Мөр ' + (i + 1) + ' хасах үнэ</label><input class="input num mono" id="cm-price-' + i + '" data-price="' + i + '" inputmode="decimal" autocomplete="off" value="' + ui.esc(cm.price[i]) + '" style="width:110px">' : ui.esc(E().money.fmtPrice(E().money.parseScaled(l.unitPrice, 6)))) + '</td>' +
          '<td class="num">' + ui.esc(l.disc) + '</td><td class="num" id="cm-la-' + i + '"></td><td class="num" id="cm-vat-' + i + '"></td></tr>';
      }).join('') + '</tbody></table></div>';
    var c = customer(p.customer);
    ui.$$('[data-qty]', host).forEach(function (inp) { inp.addEventListener('input', function () { cm.qty[+inp.getAttribute('data-qty')] = inp.value.replace(/[\s ]/g, '').replace(',', '.') || '0'; updateCm(p, c); }); });
    ui.$$('[data-price]', host).forEach(function (inp) { inp.addEventListener('input', function () { cm.price[+inp.getAttribute('data-price')] = inp.value.replace(/[\s ]/g, '').replace(',', '.') || '0'; updateCm(p, c); }); });
  }
  function updateCm(p, c) {
    if (cm.result) { ui.$('#cm-derived').innerHTML = ''; ui.$('#cm-factbox').innerHTML = ''; return; }
    var calc = cmCalc(p);
    var plan = cmEbarimtPlan(p, calc);
    var errs = cmErrors(p, calc, plan);
    calc.lines.forEach(function (l, i) {
      var a = ui.$('#cm-la-' + i), v = ui.$('#cm-vat-' + i);
      if (a) a.textContent = l.qty > 0n ? fmtM(l.LA) : '';
      if (v) v.textContent = l.qty > 0n ? fmtM(l.vatAmount) : '';
      var q = ui.$('#cm-qty-' + i); if (q) q.classList.toggle('invalid', errs.some(function (e) { return e.message.indexOf('Мөр ' + (i + 1) + ':') === 0; }));
    });
    var html = '<dl class="totals"><dt>Дүн (НӨАТ-гүй)</dt><dd>' + fmtM(calc.amount, { sym: true }) + '</dd>' + calc.vatByIdentifier.map(function (v) { return '<dt>' + ui.esc(v.label) + '</dt><dd>' + fmtM(v.vat, { sym: true }) + '</dd>'; }).join('') +
      '<dt class="grand">Кредит нотын нийт</dt><dd class="grand">' + fmtM(calc.amountInclVat, { sym: true }) + '</dd></dl>';
    var anyQty = calc.lines.some(function (l) { return l.qty > 0n; });
    var shownErrs = anyQty ? errs : errs.filter(function (e) { return e.code !== 'sales.no_lines'; });
    html += shownErrs.length ? ui.errList(shownErrs) : anyQty ? '' : '<p class="small muted">Буцаах тоо оруулна уу, эсвэл "Бүгдийг буцаах".</p>';
    // posting preview
    var pv = null;
    if (calc.amountInclVat > 0 && !calc.errors.length) pv = E().sales.preview(cmTransientDraft(p, c));
    var ps = E().sales.paymentStatus(p);
    var applyA = Math.min(calc.amountInclVat, Math.max(ps.remaining, 0));
    html += '<div class="card" data-note="cm.posting"><div class="card-head"><h2>Батлахад үүсэх бичилт</h2><span class="small muted">SC-2026-##### (дугаар батлахад)</span></div><div class="card-body stack">' +
      (pv && pv.ok ? pv.result.vouchers.map(function (v, i) { return '<h3 class="small">' + (i === 0 ? 'Ваучер 1: кредит нот' : 'Ваучер 2: бэлэн буцаан олголт (' + (v.cashVoucher ? 'МХ-2 KZ-2026-#####' : 'банк') + ')') + '</h3>' + glTable(v.gl); }).join('') : (pv ? ui.errList(pv.errors, 'Preview') : '<p class="small muted">Буцаах тоо оруулахад бичилт харагдана.</p>')) +
      '<p class="small">Авто тулгалт (BR-SAL-63): ' + (calc.amountInclVat > 0 ? 'a = min(кредит нот ' + fmtM(calc.amountInclVat) + ', нэхэмжлэхийн үлдэгдэл ' + fmtM(Math.max(ps.remaining, 0)) + ') = <strong>' + fmtM(applyA) + '</strong>' + (calc.amountInclVat > applyA && !(ERP.data.paymentMethods[p.method] || {}).balBank ? '; илүү ' + fmtM(calc.amountInclVat - applyA) + ' нь харилцагчийн кредит болж нээлттэй үлдэнэ.' : '.') : '—') + '</p></div></div>';
    // eBarimt effect
    html += '<div class="card" data-note="cm.ebarimt"><div class="card-head"><h2>eBarimt-д юу болох вэ</h2>' + ebActionPill(plan.action) + '</div><div class="card-body stack">' +
      '<p>' + ui.esc(plan.reason || '') + '</p>' +
      (plan.superseded.length ? '<p class="small">Гинжийн ' + plan.superseded.map(function (d) { return d.id + ' (' + d.status + ')'; }).join(', ') + ' → CANCELLED (SUPERSEDED_BY) (T4/T10).</p>' : '') +
      (plan.decision ? '<p class="small">reportMonth: эх сар ' + ui.esc(plan.srcMonth || '') + ', одоо ' + cm.date.slice(0, 7) + ' → <code>' + plan.decision + '</code>' + (plan.rm ? ', reportMonth = ' + plan.rm : '') + ' (12 §12.6).</p>' : '') +
      (plan.decision === 'WINDOW_CLOSED' || plan.decision === 'TOO_OLD' ? '<label class="checkbox" for="cm-override"><input type="checkbox" id="cm-override"' + (cm.override ? ' checked' : '') + '> eBarimt-гүйгээр батлах (override, <code>ebarimt.document.override</code> X)</label>' : '') +
      '<div data-note="cm.netstate"><h3 class="small">Цэвэр төлөв (нэхэмжлэх − бүх кредит нот)</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөр</th><th class="num">Нэхэмжлэх</th><th class="num">Өмнөх кредит</th><th class="num">Энэ кредит</th><th class="num">Цэвэр</th></tr></thead><tbody>' +
      plan.net.map(function (n) { return '<tr><td>' + ui.esc(n.line.description) + '</td>' + ui.moneyCell(n.inv) + ui.moneyCell(-n.prior, { blankZero: true }) + ui.moneyCell(-n.cur, { blankZero: true }) + '<td class="num"><strong>' + fmtM(Math.max(n.net, 0)) + '</strong></td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Σ (шинэ баримтын totalAmount)</td>' + ui.moneyCell(sum(plan.net, function (n) { return n.inv; })) + ui.moneyCell(-sum(plan.net, function (n) { return n.prior; })) + ui.moneyCell(-sum(plan.net, function (n) { return n.cur; })) + ui.moneyCell(sum(plan.net, function (n) { return Math.max(n.net, 0); })) + '</tr></tfoot></table></div></div></div></div>';
    html += ui.calc('Тооцоог харах: кредит нотын НӨАТ ба шийдвэрийн мод', cmCalcBody(calc, plan));
    html += '<div class="actionbar"><button class="btn primary" type="button" id="cm-post"' + (errs.length ? ' disabled' : '') + '>Батлах</button><a class="btn" href="#posted-invoice" id="cm-back">Эх нэхэмжлэх рүү</a></div>';
    ui.$('#cm-derived').innerHTML = html;
    // factbox
    var docs = chainDocs(p);
    ui.$('#cm-factbox').innerHTML = '<div class="card" data-note="eb.chain"><div class="card-head"><h3>eBarimt гинж</h3>' + chainPill(chainStatusX(p)) + '</div><div class="card-body"><ol class="eb-chain">' +
      docs.map(function (d) { var es = effStatus(d); return '<li><span class="code">' + d.id + '</span> ' + ui.esc(d.sourceNo) + ' · ' + d.operation + ' ' + ui.pill(es.status) + (d.ddtd ? '<br><span class="mono xs">…' + d.ddtd.slice(-8) + '</span>' : '') + (d.inactiveId ? '<br><span class="xs muted">inactiveId …' + d.inactiveId.slice(-8) + '</span>' : '') + '</li>'; }).join('') +
      '</ol></div></div>';
    app.decorateNotes();
    var ov = ui.$('#cm-override');
    if (ov) ov.addEventListener('change', function () { cm.override = ov.checked; updateCm(p, c); var n = ui.$('#cm-override'); if (n) n.focus(); });
    ui.$('#cm-back').addEventListener('click', function (ev) { ev.preventDefault(); app.navigate('posted-invoice', { postedNo: p.no }); });
    ui.$('#cm-post').addEventListener('click', function () { doPostCm(p, c); });
    ui.$$('[data-doc]', ui.$('#cm-derived')).forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); openDoc(a.getAttribute('data-doc')); }); });
  }
  function ebActionPill(a) {
    return { SAVE: ui.pill('SENT', 'Засвар: SAVE + inactiveId'), DELETE: ui.pill('CANCELLED', 'DELETE (B2C)'), MANUAL_VOID: ui.pill('WARNING', 'Порталд гараар цуцлах'),
      NO_DOCUMENT: ui.pill('NOT_REQUIRED', 'Баримт үүсэхгүй'), BLOCKED: ui.pill('ERROR', 'Хориглосон'), OVERRIDE_NONE: ui.pill('WARNING', 'eBarimt-гүй (override)') }[a] || '';
  }
  function cmCalcBody(calc, plan) {
    var s = '<p><strong>1. Мөрийн дүн, НӨАТ</strong> — нэхэмжлэхтэй ижил тооцоолол (06 §6, BR-SAL-60): G = r(Тоо × Үнэ), LA = G − r(G × хөн.% / 100), НӨАТ VAT identifier тус бүрд нэг удаа, running remainder-ээр мөрүүдэд.</p>';
    calc.groups.forEach(function (g) {
      s += '<div class="formula">' + ui.esc(g.label) + ': ' + (calc.pricesInclVat ? 'G' : 'Суурь') + ' = ' + fmtM(g.total) + ' → НӨАТ = r(' + fmtM(g.total) + ' × ' + g.pct + ' / ' + g.den.toString() + ') = ' + fmtM(g.vat) + '</div>';
    });
    s += '<p><strong>2. Posting</strong>: мөрийг урвуулахгүй — орлого ба 2300 НӨАТ <em>дебит</em>, 1200 авлага <em>кредит</em> ' + fmtM(calc.amountInclVat) + '.</p>';
    s += '<p><strong>3. eBarimt шийдвэр (12 §12.8)</strong>: SENT/UNKNOWN гинжинд → хориг; PENDING/ERROR → SUPERSEDED; цэвэр төлөв хоосон → (latest байхгүй: баримтгүй · B2C: DELETE · B2B: гараар); хоосон биш → reportMonth шалгаад SAVE + inactiveId.</p>' +
      '<div class="formula">latest (сүүлийн хүчинтэй SUCCESS SAVE) = ' + (plan.latest ? plan.latest.id + ' ДДТД ' + plan.latest.ddtd : 'байхгүй') +
      '\nЦэвэр нийт = Σ max(нэхэмжлэх − өмнөх − энэ, 0) = ' + fmtM(sum(plan.net, function (n) { return Math.max(n.net, 0); })) + (plan.netEmpty ? '  → хоосон' : '') + '\nҮйлдэл = ' + plan.action + '</div>';
    return s;
  }
  // ENGINE GAP 3 — 12 §12.8 chain resolution around ERP.engine.sales.post (the engine always enqueues a SAVE/DELETE
  // with inactiveId = invoice ДДТД and does not check SENT/UNKNOWN, supersede PENDING/ERROR or handle B2B full returns).
  function doPostCm(p, c) {
    var calc = cmCalc(p), plan = cmEbarimtPlan(p, calc), errs = cmErrors(p, calc, plan);
    if (errs.length) return;
    ui.confirm({ title: 'Кредит нот батлах уу?', ok: 'Батлах',
      body: '<p>' + ui.esc(c.name) + ' · ' + ui.date(cm.date) + ' · <strong>' + fmtM(calc.amountInclVat, { sym: true }) + '</strong> · ' + ui.esc(ERP.data.reasonCodes[cm.reason]) + '</p>' +
        '<p>SC-2026-##### дугаар олгогдож, ' + p.no + '-д автоматаар тулгагдана. eBarimt: ' + ui.esc(plan.reason || '') + '</p>' })
      .then(function (ok) {
        if (!ok) return;
        var d = E().drafts.create(c.no, { docType: 'CREDIT_MEMO', postingDate: cm.date, documentDate: cm.date, appliesTo: p.no, reason: cm.reason, note: cm.desc,
          lines: cmLines(p).filter(function (l) { return E().money.parseScaled(l.qty || '0', 5) > 0n; }) });
        d.piv = p.piv; d.method = p.method; d.terms = p.terms; d.cpg = p.cpg; d.genBus = p.genBus; d.vatBus = p.vatBus;
        // keep the engine from sending: we resolve the chain first, then hand the document to the (simulated) worker
        var r = E().sales.post(d, { interactive: true, ebarimt: 'PENDING' });
        if (!r.ok) { E().drafts.remove(d.no); ui.modal({ title: 'Батлах боломжгүй', body: ui.errList(r.errors) }); return; }
        var posted = r.posted, doc = r.ebarimt, S = E().state(), msgs = [];
        plan.superseded.forEach(function (x) { x.status = 'CANCELLED'; x.resolutionNote = 'SUPERSEDED_BY:' + posted.no; x.resolvedAt = NOW; addEvent(x, 'CANCELLED', 'Кредит нот ' + posted.no + '-оор орлогдсон (SUPERSEDED_BY, T4/T10).'); msgs.push(x.id + ' → CANCELLED'); });
        var removeDoc = function () { S.ebarimtDocs.splice(S.ebarimtDocs.indexOf(doc), 1); posted.ebarimtDocId = null; posted.ebarimtType = 'NONE'; doc = null; };
        if (doc) { doc.queuedAt = NOW; doc.events.forEach(function (e) { e.at = NOW; }); }
        if (doc) {
          if (plan.action === 'NO_DOCUMENT' || plan.action === 'OVERRIDE_NONE') { removeDoc(); msgs.push(plan.action === 'OVERRIDE_NONE' ? 'eBarimt-гүй (override)' : 'eBarimt баримт үүсээгүй (RET-60)'); }
          else if (plan.action === 'MANUAL_VOID') {
            doc.operation = 'MANUAL_VOID'; doc.voidsDdtd = plan.latest.ddtd; doc.inactiveId = null; doc.billSeq = null; doc.billIdSuffix = null; doc.mode = 'MANUAL';
            doc.totals = { amount: 0, vat: 0, cityTax: 0 }; doc.subReceipts = []; doc.lines = []; doc.netLines = []; doc.scenario = 'PENDING';
            doc.events = [{ at: NOW, status: 'PENDING', text: 'Бүтэн B2B буцаалт: ' + plan.latest.ddtd + '-г e-invoice порталд гараар цуцлах шаардлагатай (RET-51). PosAPI руу хүсэлт илгээхгүй.' }];
            msgs.push('Порталд гараар цуцлах хүсэлт ' + doc.id);
          } else {
            doc.inactiveId = plan.latest ? plan.latest.ddtd : null;           // RET-02: always the latest valid ДДТД
            doc.reportMonth = plan.rm || null;
            if (doc.operation === 'DELETE') doc.events[0].text = 'Outbox-д бичигдлээ: DELETE /rest/receipt { id: …' + (doc.inactiveId || '').slice(-8) + ' }.';
            doc.scenario = 'SUCCESS';
            if (doc.type === 'B2C_RECEIPT') { workerSend(doc); msgs.push(doc.id + ' ' + doc.operation + ' → ' + doc.status); }
            else {
              msgs.push(doc.id + ' хүлээгдэж буй (ASYNC)');
              var id = doc.id;
              setTimeout(function () { var x = E().ebarimt.get(id); if (x) { workerSend(x); ui.toast('eBarimt ' + id + ': ' + ui.pillLabel(x.status) + (x.ddtd ? ' · ДДТД …' + x.ddtd.slice(-6) : '')); if (app.current === 'credit-memo' || app.current === 'ebarimt') app.refresh(); } }, 2600);
            }
          }
        }
        cm.result = { no: posted.no, posted: posted, msgs: msgs, applied: [].concat.apply([], r.result.vouchers.map(function (v) { return v.dcle || []; })).filter(function (x) { return x.entryType === 'APPLICATION'; }) };
        ui.toast('Кредит нот <strong>' + posted.no + '</strong> батлагдлаа.');
        app.refresh();
      });
  }
  function showCmResult() {
    var r = cm.result, p = r.posted;
    var applied = sum(r.applied.filter(function (x) { return x.amount > 0; }), function (x) { return x.amount; });
    ui.$('#cm-result').innerHTML = '<div class="banner" role="status"><strong>' + r.no + ' батлагдлаа</strong> · ' + fmtM(p.amountInclVat, { sym: true }) + ' · тулгасан ' + fmtM(applied, { sym: true }) +
      (p.cashVoucherNo ? ' · бэлэн буцаалт МХ-2 ' + p.cashVoucherNo : '') + (r.msgs.length ? ' · eBarimt: ' + ui.esc(r.msgs.join('; ')) : '') +
      ' <span class="row" style="display:inline-flex"><button class="btn sm" type="button" id="cm-open">Кредит нот харах</button><button class="btn sm" type="button" id="cm-again">Шинэ кредит нот</button><a class="btn sm ghost" href="#ebarimt">eBarimt хяналт</a></span></div>';
    ui.$('#cm-open').addEventListener('click', function () { app.navigate('posted-invoice', { postedNo: r.no }); });
    ui.$('#cm-again').addEventListener('click', function () { cmReset(cm.src); app.refresh(); });
  }

  // ===========================================================================
  // #ebarimt — S-EBR-02 monitor, S-EBR-05 resolve
  // ===========================================================================
  var eb = { filter: 'problem', type: '', q: '', sel: null, lowLotto: false };
  function docAgeMin(d) { return minutesBetween(d.queuedAt, NOW); }
  function isProblem(d) {
    var s = effStatus(d).status;
    return s === 'ERROR' || s === 'UNKNOWN' || (s === 'PENDING' && (docAgeMin(d) > 24 * 60 || d.operation === 'MANUAL_VOID'));
  }
  function renderEbarimt(el, ctx) {
    var docs = allDocs();
    var inst = ERP.data.ebarimtSetup.posapiInstance;
    var lotto = eb.lowLotto ? 80 : inst.leftLotteries;
    var sdMin = minutesBetween(inst.lastSendData + ':00', NOW);
    var sdState = sdMin >= 72 * 60 ? ['BLOCKING', 'Нийцлийн инцидент (≥ 72 цаг)'] : sdMin >= 48 * 60 ? ['FAIL', 'P1 (≥ 48 цаг)'] : sdMin >= 12 * 60 ? ['WARNING', 'P2 (≥ 12 цаг)'] : ['OK', 'Хэвийн (< 12 цаг)'];
    var since = docs.filter(function (d) { return d.status === 'SUCCESS' && d.ebarimtDate && d.ebarimtDate > inst.lastSendData; }).length;
    var b2c = docs.filter(function (d) { return d.type === 'B2C_RECEIPT' && d.operation === 'SAVE'; });
    var perDay = b2c.length / Math.max(1, E().dates.daysBetween(ERP.data.fiscalYear.year + '-01-01', today()));
    var counts = {};
    docs.forEach(function (d) { var s = effStatus(d).status; counts[s] = (counts[s] || 0) + 1; });
    var problems = docs.filter(isProblem);
    var html = '<div class="page-head"><div class="title-wrap"><h1>eBarimt хяналт</h1><span class="small muted">' + ERP.data.ebarimtSetup.environment + ' · ТТД ' + ERP.data.ebarimtSetup.merchantTin + ' · салбар ' + ERP.data.ebarimtSetup.branchNo + ' · POS ' + ERP.data.ebarimtSetup.posNo + '</span></div><span class="small muted">Одоо ' + fmtTs(NOW) + '</span></div>';
    if (lotto < 100) html += '<div class="banner danger" role="alert" data-note="eb.posapi"><strong>Сугалааны үлдэгдэл ' + lotto + '.</strong> 100-аас доош: B2C баримтад сугалаа олгогдохгүй болохоос өмнө PosAPI-д сугалаа нэмүүлэх хүсэлт гаргана уу (sendData хийснээр шинэчлэгдэнэ).</div>';
    if (problems.length) html += '<div class="banner warn">' + problems.length + ' баримт анхаарал шаардаж байна: ' + problems.map(function (d) { return d.sourceNo + ' (' + (d.operation === 'MANUAL_VOID' ? 'гараар цуцлах' : effStatus(d).status) + ')'; }).join(', ') + '. Батлагдсан баримтын бүртгэлд нөлөөлөхгүй — зөвхөн eBarimt (UX-EBR-06).</div>';
    html += '<div class="grid cols-3 eb-top">' +
      '<div class="card" data-note="eb.posapi"><div class="card-head"><h2>PosAPI instance</h2>' + ui.pill(sdState[0], sdState[1]) + '</div><div class="card-body"><dl class="kv">' +
      '<dt>Instance</dt><dd>' + ui.esc(inst.name) + '</dd><dt>Сүүлийн sendData</dt><dd>' + ui.esc(fmtTs(inst.lastSendData)) + ' (' + ageText(sdMin) + ' өмнө)</dd>' +
      '<dt>sendData-аас хойш бүртгэгдсэн</dt><dd>' + since + ' баримт</dd><dt>/rest/info</dt><dd>' + ui.pill('OK', 'эрүүл') + '</dd></dl>' +
      '<table class="grid-table eb-days"><caption class="xs muted">Өдөр тутмын sendData (сүүлийн 7 хоног, жишээ)</caption><tbody>' + sendDataDays(inst).map(function (x) { return '<tr><td>' + ui.date(x.d) + '</td><td class="mono">' + x.t + '</td><td>' + ui.pill('OK', 'илгээсэн') + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-head"><h2>Сугалааны үлдэгдэл</h2>' + (lotto < 100 ? ui.pill('FAIL', 'Бага') : ui.pill('OK')) + '</div><div class="card-body stack"><div class="eb-lotto"><strong>' + lotto.toLocaleString('en-US').replace(/,/g, ' ') + '</strong><span class="xs muted">leftLotteries</span></div>' +
      '<p class="small">B2C баримт өдөрт дунджаар ' + perDay.toFixed(2) + ' → ' + (perDay && lotto / perDay < 365 ? 'ойролцоогоор ' + Math.floor(lotto / perDay) + ' хоногт' : '1 жилээс илүү') + ' хүрэлцэнэ. Босго: 100.</p>' +
      '<label class="checkbox" for="eb-lowlotto"><input type="checkbox" id="eb-lowlotto"' + (eb.lowLotto ? ' checked' : '') + '> Туршилт: үлдэгдэл 80 болсон үеийг харуулах</label></div></div>' +
      '<div class="card" data-note="eb.noretry"><div class="card-head"><h2>Автомат дахин илгээхгүй</h2>' + ui.pill('NEUTRAL', 'D-J2') + '</div><div class="card-body small"><ol class="eb-flow"><li><strong>PENDING</strong> — posting-ийн transaction-д outbox-д бичигдэнэ</li><li><strong>SENT</strong> — оролдлого = 1-ийг сүлжээнээс <em>өмнө</em> commit</li>' +
      '<li><strong>SUCCESS</strong> ДДТД · <strong>ERROR</strong> баримт үүсээгүй нь тодорхой · <strong>UNKNOWN</strong> хариугүй</li><li>UNKNOWN/ERROR → хүн шийднэ; дахин илгээх = шинэ billIdSuffix-тэй клон (давхар баримтаас сэргийлнэ)</li></ol></div></div></div>';
    // filters
    var filters = [['problem', 'Асуудалтай', problems.length], ['all', 'Бүгд', docs.length], ['PENDING', 'PENDING', counts.PENDING || 0], ['SENT', 'SENT', counts.SENT || 0], ['SUCCESS', 'SUCCESS', counts.SUCCESS || 0], ['ERROR', 'ERROR', counts.ERROR || 0], ['UNKNOWN', 'UNKNOWN', counts.UNKNOWN || 0], ['CANCELLED', 'CANCELLED', counts.CANCELLED || 0]];
    html += '<div class="row between ar-toolbar"><div class="row ar-chips" role="group" aria-label="Төлөвийн шүүлтүүр" data-note="eb.status">' + filters.map(function (f) {
      return '<button class="btn sm chipbtn" type="button" id="ebf-' + f[0] + '" data-ebf="' + f[0] + '" aria-pressed="' + (eb.filter === f[0]) + '">' + f[1] + ' <span class="count">' + f[2] + '</span></button>';
    }).join('') + '</div><div class="row"><label class="sr-only" for="eb-type">Төрөл</label><select class="select" id="eb-type">' + opt('', 'Бүх төрөл', !eb.type) + opt('B2B_RECEIPT', 'B2B', eb.type === 'B2B_RECEIPT') + opt('B2C_RECEIPT', 'B2C', eb.type === 'B2C_RECEIPT') + '</select>' +
      '<label class="sr-only" for="eb-q">Хайх</label><input class="input" id="eb-q" type="search" placeholder="Баримт, ДДТД…" value="' + ui.esc(eb.q) + '"></div></div>';
    var shown = docs.filter(function (d) {
      var s = effStatus(d).status;
      if (eb.filter === 'problem' && !isProblem(d)) return false;
      if (eb.filter !== 'problem' && eb.filter !== 'all' && s !== eb.filter) return false;
      if (eb.type && d.type !== eb.type) return false;
      if (eb.q && (d.id + ' ' + d.sourceNo + ' ' + (d.ddtd || '') + ' ' + (customer(d.customer) || {}).name).toLowerCase().indexOf(eb.q.toLowerCase()) < 0) return false;
      return true;
    }).slice().reverse();
    html += '<div class="card" data-note="eb.list"><div class="table-wrap"><table class="grid-table"><thead><tr><th>ID</th><th>Эх баримт</th><th>Харилцагч</th><th>Төрөл</th><th>Үйлдэл</th><th>billIdSuffix</th><th class="num">Дүн</th><th>Төлөв</th><th class="num">Нас</th><th class="num">Оролдлого</th><th>ДДТД / алдаа</th></tr></thead><tbody>' +
      (shown.map(function (d) {
        var es = effStatus(d);
        return '<tr class="clickable' + (eb.sel === d.id ? ' sel' : '') + '" tabindex="0" data-ebdoc="' + d.id + '"><td class="code">' + d.id + '</td><td class="code">' + ui.esc(d.sourceNo) + '</td><td>' + ui.esc((customer(d.customer) || {}).name || '') + '</td><td>' + ebLabel(d.type) + '</td>' +
          '<td class="code">' + d.operation + (d.inactiveId ? ' <span class="xs muted">inactiveId</span>' : '') + (d.reportMonth ? ' <span class="xs muted">rm ' + d.reportMonth + '</span>' : '') + '</td><td class="code">' + ui.esc(d.billIdSuffix || '—') + '</td>' + ui.moneyCell(d.totals ? d.totals.amount : 0, { blankZero: true }) +
          '<td>' + (d.operation === 'MANUAL_VOID' && d.status === 'PENDING' ? ui.pill('WARNING', 'Гараар цуцлах') : ui.pill(es.status)) + '</td><td class="num">' + (['PENDING', 'SENT', 'ERROR', 'UNKNOWN'].indexOf(es.status) >= 0 ? ageText(docAgeMin(d)) : '<span class="muted">—</span>') + '</td><td class="num">' + attempts(d) + '</td>' +
          '<td class="' + (d.ddtd ? 'mono xs' : 'xs') + '">' + (d.ddtd ? '…' + d.ddtd.slice(-10) : ui.esc(d.errorText || d.errorCode || (es.why || ''))) + '</td></tr>';
      }).join('') || '<tr><td colspan="11" class="empty">Шүүлтүүрт тохирох баримт алга.' + (eb.filter === 'problem' && !eb.q && (!eb.type || eb.type === 'ALL') ? ' Анхаарал шаардсан баримт алга — бүх баримт хэвийн.' : '') + '</td></tr>') + '</tbody></table></div></div>';
    html += '<div id="eb-detail"></div>';
    el.innerHTML = html;
    var rerender = function () { renderEbarimt(el, ctx); app.decorateNotes(); };
    ui.$$('[data-ebf]', el).forEach(function (b) { b.addEventListener('click', function () { eb.filter = b.getAttribute('data-ebf'); rerender(); ui.$('#ebf-' + eb.filter).focus(); }); });
    ui.$('#eb-type').addEventListener('change', function (ev) { eb.type = ev.target.value; rerender(); ui.$('#eb-type').focus(); });
    var q = ui.$('#eb-q');
    q.addEventListener('input', function () { eb.q = q.value; var pos = q.selectionStart; rerender(); var n = ui.$('#eb-q'); n.focus(); n.setSelectionRange(pos, pos); });
    ui.$('#eb-lowlotto').addEventListener('change', function (ev) { eb.lowLotto = ev.target.checked; rerender(); ui.$('#eb-lowlotto').focus(); });
    wireRowNav(el, 'data-ebdoc', function (id) { eb.sel = id; rerender(); var d = ui.$('#eb-detail'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest' }); });
    if (!eb.sel && shown.length) eb.sel = shown[0].id;
    if (eb.sel) renderEbDetail(ui.$('#eb-detail'), E().ebarimt.get(eb.sel), rerender);
  }
  function sendDataDays(inst) {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = E().dates.addDays(inst.lastSendData.slice(0, 10), -i);
      out.push({ d: d, t: i === 0 ? inst.lastSendData.slice(11, 16) : '07:' + String((i * 7 + 3) % 60).padStart(2, '0') });
    }
    return out;
  }
  function renderEbDetail(host, d, rerender) {
    if (!d) { host.innerHTML = ''; return; }
    var es = effStatus(d), posted = E().sales.getPosted(d.sourceNo), inv = invoiceFor(posted);
    var la = lastAttempt(d), sinceAttempt = la ? minutesBetween(la, NOW) : null;
    var actions = '';
    if (d.operation === 'MANUAL_VOID' && d.status === 'PENDING') actions = '<button class="btn primary" type="button" id="eb-mv">Порталд цуцалсныг баталгаажуулах</button>';
    else if (es.status === 'UNKNOWN') actions = '<button class="btn primary" type="button" id="eb-resolve"' + (sinceAttempt !== null && sinceAttempt < 10 ? ' disabled title="Сүүлийн оролдлогоос 10 мин хүлээнэ"' : '') + '>Шийдвэрлэх (S-EBR-05)</button>';
    else if (es.status === 'ERROR') actions = '<button class="btn primary" type="button" id="eb-fix">Засаад дахин илгээх</button><button class="btn danger" type="button" id="eb-cancel">Цуцлах</button>';
    else if (es.status === 'PENDING') actions = '<button class="btn primary" type="button" id="eb-send">' + (d.type === 'B2C_RECEIPT' ? 'Илгээх (worker-ээс өмнө)' : 'Worker ажиллуулах') + '</button>';
    var req = d.operation === 'SAVE' ? E().ebarimt.buildRequest(d) : null;
    var html = '<div class="card"><div class="card-head"><h2>' + d.id + ' — ' + ui.esc(d.sourceNo) + '</h2><div class="row">' + ui.pill(es.status) + (inv ? chainPill(chainStatusX(inv)) : '') + '</div></div><div class="card-body stack">' +
      '<div class="grid cols-2"><dl class="kv"><dt>Эх баримт</dt><dd><a href="#posted-invoice" class="code" id="eb-src">' + ui.esc(d.sourceNo) + '</a></dd><dt>Төрөл / үйлдэл</dt><dd>' + ebLabel(d.type) + ' · ' + d.operation + ' · ' + (d.mode || '') + '</dd>' +
      '<dt>billIdSuffix</dt><dd class="mono">' + ui.esc(d.billIdSuffix || '—') + '</dd><dt>ДДТД</dt><dd class="mono">' + ui.esc(d.ddtd || '—') + '</dd>' +
      (d.inactiveId ? '<dt>inactiveId</dt><dd class="mono">' + ui.esc(d.inactiveId) + '</dd>' : '') + (d.voidsDdtd ? '<dt>Гараар цуцлах ДДТД</dt><dd class="mono">' + ui.esc(d.voidsDdtd) + '</dd>' : '') + '</dl>' +
      '<dl class="kv"><dt>Дүн / НӨАТ</dt><dd>' + (d.totals ? fmtM(d.totals.amount) + ' / ' + fmtM(d.totals.vat) : '—') + '</dd><dt>Дараалалд орсон</dt><dd>' + fmtTs(d.queuedAt) + ' (' + ageText(docAgeMin(d)) + ')</dd>' +
      '<dt>Сүүлийн оролдлого</dt><dd>' + (la ? fmtTs(la) + ' (' + ageText(sinceAttempt) + ' өмнө)' : '—') + '</dd><dt>Оролдлого</dt><dd>' + attempts(d) + ' / 1 (max_attempts)</dd>' +
      (d.errorText ? '<dt>Алдаа</dt><dd>' + ui.esc(d.errorText) + '</dd>' : '') + (es.why ? '<dt>Тэмдэглэл</dt><dd class="xs">' + ui.esc(es.why) + '</dd>' : '') + '</dl></div>' +
      (actions ? '<div class="actionbar">' + actions + '</div>' : '') +
      (es.status === 'UNKNOWN' ? '<div class="banner danger" data-note="eb.unknown">Илгээсэн эсэх нь тодорхойгүй. Систем өөрөө дахин илгээхгүй: эхлээд eBarimt порталаас ' + fmtTs(la || d.queuedAt) + ' ± 10 мин, ' + fmtM(d.totals ? d.totals.amount : 0, { sym: true }) + ' дүнгээр хайгаад шийднэ.</div>' : '') +
      (es.status === 'ERROR' ? '<div class="banner warn" data-note="eb.error">PosAPI татгалзсан — баримт үүсээгүй нь тодорхой. Дүн, тоо, төрөл өөрчлөгдөхгүй; зөвхөн eBarimt-ийн шинжийг (БҮНА код г.м.) засаж шинэ billIdSuffix-тэй клоноор илгээнэ.</div>' : '') +
      '<div data-note="eb.status"><h3 class="small">Төлөвийн түүх</h3><ol class="timeline">' + d.events.map(function (e) { return '<li><span class="tl-time mono">' + ui.esc(fmtTs(e.at)) + '</span>' + ui.pill(e.status) + '<span>' + ui.esc(e.text) + '</span></li>'; }).join('') + '</ol></div>' +
      (inv ? '<div data-note="eb.chain"><h3 class="small">Засварын гинж (' + ui.esc(inv.no) + ')</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>ID</th><th>Эх</th><th>Үйлдэл</th><th>ДДТД</th><th>inactiveId</th><th>Төлөв</th></tr></thead><tbody>' +
        chainDocs(inv).map(function (x) { var s = effStatus(x); return '<tr' + (x === d ? ' class="sel"' : '') + '><td class="code">' + x.id + '</td><td class="code">' + ui.esc(x.sourceNo) + '</td><td class="code">' + x.operation + '</td><td class="mono xs">' + (x.ddtd ? '…' + x.ddtd.slice(-10) : '—') + '</td><td class="mono xs">' + (x.inactiveId ? '…' + x.inactiveId.slice(-10) : x.voidsDdtd ? 'гараар …' + x.voidsDdtd.slice(-10) : '') + '</td><td>' + ui.pill(s.status) + (s.why ? ' <span class="xs muted">' + ui.esc(s.why) + '</span>' : '') + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>' : '') +
      (req ? ui.calc('Тооцоог харах: PosAPI хүсэлт ба нийлбэрийн гинж', '<p>JSON-ийг хадгалахгүй — snapshot-оос дахин угсарна (AMT-23). qrData/lottery хаана ч хадгалагдахгүй (D-J3).</p>' + ui.json(req) +
        '<div class="formula">Σ items.totalAmount = ' + fmtM(req._cents.total) + ' · Σ totalVAT = ' + fmtM(req._cents.vat) + '\nГинж (AMT-03): ' + (E().ebarimt.chainOk(req).ok ? '✓ яг тэнцсэн' : '✕ ' + E().ebarimt.chainOk(req).messages.join('; ')) + '</div>') : '') +
      '</div></div>';
    host.innerHTML = html;
    app.decorateNotes();
    ui.$('#eb-src').addEventListener('click', function (ev) { ev.preventDefault(); app.navigate('posted-invoice', { postedNo: d.sourceNo }); });
    var b;
    if ((b = ui.$('#eb-send'))) b.addEventListener('click', function () { workerSend(d); ui.toast(d.id + ': ' + ui.pillLabel(d.status) + (d.ddtd ? ' · ДДТД …' + d.ddtd.slice(-6) : '')); rerender(); });
    if ((b = ui.$('#eb-resolve'))) b.addEventListener('click', function () { resolveUnknown(d, rerender); });
    if ((b = ui.$('#eb-fix'))) b.addEventListener('click', function () { fixAndResend(d, rerender); });
    if ((b = ui.$('#eb-cancel'))) b.addEventListener('click', function () { cancelDoc(d, rerender); });
    if ((b = ui.$('#eb-mv'))) b.addEventListener('click', function () { confirmManualVoid(d, rerender); });
  }
  function noteField(id) { return '<div class="field"><label class="req" for="' + id + '">Тэмдэглэл (≥ 10 тэмдэгт)</label><textarea class="input" id="' + id + '" rows="2" maxlength="300"></textarea></div>'; }
  function resolveUnknown(d, rerender) {
    var inst = ERP.data.ebarimtSetup.posapiInstance;
    var la = lastAttempt(d) || d.queuedAt;
    var waited = minutesBetween(la, NOW);
    var sdAfter = inst.lastSendData + ':00' > la;
    var canNot = sdAfter && waited >= 30;
    var guess = fakeDdtd(d, la);
    if (!d.totals) d.totals = { amount: 0, vat: 0, cityTax: 0 };
    var m = ui.modal({ title: 'UNKNOWN шийдвэрлэх — ' + d.sourceNo, wide: true,
      body: '<form id="rs-form" class="stack" data-note="eb.unknown"><div class="checklist">' +
        '<div class="check-row"><span class="check-mark ' + (waited >= 10 ? 'pass' : 'fail') + '">' + (waited >= 10 ? '✓' : '✕') + '</span><span>Сүүлийн оролдлогоос ≥ 10 мин (' + ageText(waited) + ')</span></div>' +
        '<div class="check-row"><span class="check-mark ' + (sdAfter ? 'pass' : 'fail') + '">' + (sdAfter ? '✓' : '✕') + '</span><span>sendData сүүлийн оролдлогын дараа ажилласан (' + fmtTs(inst.lastSendData) + ' > ' + fmtTs(la) + ')</span></div>' +
        '<div class="check-row"><span class="check-mark ' + (waited >= 30 ? 'pass' : 'fail') + '">' + (waited >= 30 ? '✓' : '✕') + '</span><span>Оролдлогоос ≥ 30 мин ("Бүртгэгдээгүй"-д)</span></div></div>' +
        '<fieldset class="stack"><legend class="small"><strong>Порталаас хайсан үр дүн</strong> (огноо ' + fmtTs(la) + ' ± 10 мин, дүн ' + fmtM(d.totals.amount, { sym: true }) + ')</legend>' +
        '<label class="checkbox" for="rs-found"><input type="radio" name="rs-dec" id="rs-found" value="FOUND" checked> Бүртгэгдсэн — порталд олдсон</label>' +
        '<label class="checkbox" for="rs-notfound"><input type="radio" name="rs-dec" id="rs-notfound" value="NOT_FOUND"' + (canNot ? '' : ' disabled') + '> Бүртгэгдээгүй — олдоогүй (хуучныг цуцлаад шинэ billIdSuffix-тэй клон)</label></fieldset>' +
        '<div id="rs-found-fields" class="form-grid"><div class="field"><label class="req" for="rs-ddtd">ДДТД (33 орон)</label><input class="input mono" id="rs-ddtd" inputmode="numeric" maxlength="33" autocomplete="off"><span class="hint" id="rs-ddtd-n">0 / 33</span></div>' +
        '<div class="field"><label class="req" for="rs-dt">Баримтын огноо, цаг</label><input class="input mono" id="rs-dt" value="' + ui.esc(la.slice(0, 16).replace(/-/g, '.')) + '" placeholder="ЖЖЖЖ.СС.ӨӨ ЦЦ:ММ"></div>' +
        '<div class="field"><label class="req" for="rs-total">Порталын нийт дүн</label><input class="input num mono" id="rs-total" inputmode="decimal" autocomplete="off"></div>' +
        '<div class="field"><span class="flabel">Жишээ</span><button class="btn sm" type="button" id="rs-fill">Порталд олдсон жишээ утга бөглөх</button></div></div>' +
        noteField('rs-note') + '<div id="rs-err"></div><p class="xs muted">QR ба сугалаа сэргэхгүй (хадгалдаггүй); B2C бол зөвхөн "ХУУЛБАР" хэвлэнэ (12 §13.3). Аудитад хэн, хэзээ, ямар шийдвэр гаргасан нь бичигдэнэ.</p></form>',
      footer: [{ label: 'Болих' }, { label: 'Шийдвэрлэх', kind: 'primary', id: 'rs-ok', onClick: function (close) {
        var dec = ui.$('input[name="rs-dec"]:checked', m.el).value;
        var note = ui.$('#rs-note', m.el).value.trim(), errs = [];
        if (note.length < 10) errs.push({ code: 'ebarimt.resolution_note_required', message: 'Тэмдэглэл дор хаяж 10 тэмдэгт.' });
        if (dec === 'FOUND') {
          var id = ui.$('#rs-ddtd', m.el).value.replace(/\D/g, '');
          var tot = parseAmt(ui.$('#rs-total', m.el).value);
          var dt = ui.$('#rs-dt', m.el).value.trim().replace(/\./g, '-');
          if (!/^\d{33}$/.test(id)) errs.push({ code: 'ebarimt.ddtd_invalid', message: 'ДДТД яг 33 оронтой тоо байна.' });
          else if (allDocs().some(function (x) { return x.ddtd === id && x.operation === 'SAVE'; })) errs.push({ code: 'ebarimt.ddtd_duplicate', message: 'Энэ ДДТД өөр баримтад бүртгэгдсэн байна.' });
          if (tot !== d.totals.amount) errs.push({ code: 'ebarimt.resolution_amount_mismatch', message: 'Порталын нийт дүн баримтын дүн ' + fmtM(d.totals.amount) + '-тэй тэнцэхгүй.' });
          if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dt)) errs.push({ code: 'api.invalid_date', message: 'Огноо, цаг ЖЖЖЖ.СС.ӨӨ ЦЦ:ММ хэлбэрээр.' });
          if (errs.length) { ui.$('#rs-err', m.el).innerHTML = ui.errList(errs, 'Шийдвэрлэх боломжгүй'); return; }
          d.status = 'SUCCESS'; d.ddtd = id; d.ebarimtDate = dt + ':00'; d.resolutionNote = 'FOUND: ' + note; d.resolvedAt = NOW; d.resolvedBy = currentUser();
          d.subReceipts.forEach(function (s, i) { s.subId = id.slice(0, 31) + String(10 + i); });
          addEvent(d, 'SUCCESS', 'Гараар "Бүртгэгдсэн" (T8): ДДТД оруулсан — ' + currentUser() + '. ' + note);
          close(true); ui.toast(d.sourceNo + ': SUCCESS (гараар шийдсэн).'); rerender();
        } else {
          if (!canNot) errs.push({ code: 'ebarimt.resolution_too_early', message: 'sendData оролдлогын дараа ажиллаагүй эсвэл 30 мин болоогүй (12 §11.2).' });
          if (errs.length) { ui.$('#rs-err', m.el).innerHTML = ui.errList(errs, 'Шийдвэрлэх боломжгүй'); return; }
          var nd = cloneDoc(d, null, 'NOT_FOUND: ' + note);
          close(true); eb.sel = nd.id; ui.toast(d.id + ' → CANCELLED · шинэ ' + nd.id + ' PENDING.');
          scheduleSend(nd.id, rerender); rerender();
        }
      } }] });
    ui.$('#rs-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); });
    var dd = ui.$('#rs-ddtd', m.el);
    dd.addEventListener('input', function () { var n = dd.value.replace(/\D/g, '').length; ui.$('#rs-ddtd-n', m.el).textContent = n + ' / 33'; dd.classList.toggle('invalid', n > 0 && n !== 33); });
    ui.$('#rs-fill', m.el).addEventListener('click', function () { dd.value = guess; dd.dispatchEvent(new Event('input')); ui.$('#rs-total', m.el).value = amtInputVal(d.totals.amount); ui.$('#rs-note', m.el).value = 'Порталаас огноо, дүнгээр хайж олсон.'; });
    ui.$$('input[name="rs-dec"]', m.el).forEach(function (r) { r.addEventListener('change', function () { ui.$('#rs-found-fields', m.el).hidden = r.value !== 'FOUND' || !r.checked; }); });
    app.decorateNotes(m.el);
  }
  function scheduleSend(id, rerender) {
    setTimeout(function () {
      var x = E().ebarimt.get(id);
      if (!x || x.status !== 'PENDING') return;
      workerSend(x);
      ui.toast('eBarimt ' + id + ': ' + ui.pillLabel(x.status) + (x.ddtd ? ' · ДДТД …' + x.ddtd.slice(-6) : ''));
      if (app.current === 'ebarimt') rerender();
    }, 2600);
  }
  function fixAndResend(d, rerender) {
    var posted = E().sales.getPosted(d.sourceNo);
    var lines = (d.netLines || posted.lines).filter(function (l) { return l.aiv > 0; });
    var m = ui.modal({ title: 'Засаад дахин илгээх — ' + d.sourceNo, wide: true,
      body: '<form id="fx-form" class="stack" data-note="eb.error"><p class="small">Алдаа: <code>' + ui.esc(d.errorText || d.errorCode || '') + '</code>. Дүн, тоо, taxType, төрөл, ТТД өөрчлөгдөхгүй; зөвхөн БҮНА код (classificationCode) засна (12 §11.3).</p>' +
        '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөр</th><th>Нэр</th><th class="num">Дүн</th><th>БҮНА код</th></tr></thead><tbody>' +
        lines.map(function (l) { return '<tr><td class="code">' + l.lineNo + '</td><td>' + ui.esc(l.description) + '</td>' + ui.moneyCell(l.aiv) + '<td><label class="sr-only" for="fx-code-' + l.lineNo + '">БҮНА код мөр ' + l.lineNo + '</label><input class="input mono" id="fx-code-' + l.lineNo + '" data-code="' + l.lineNo + '" maxlength="7" inputmode="numeric" value="' + ui.esc(l.classificationCode || '') + '" style="width:100px"></td></tr>'; }).join('') +
        '</tbody></table></div>' + noteField('fx-note') + '<div id="fx-err"></div></form>',
      footer: [{ label: 'Болих' }, { label: 'Клон үүсгэж илгээх', kind: 'primary', onClick: function (close) {
        var ov = {}, errs = [];
        ui.$$('[data-code]', m.el).forEach(function (i) { var v = i.value.trim(); if (!/^\d{7}$/.test(v)) errs.push({ code: 'ebarimt.classification_code_missing', message: 'Мөр ' + i.getAttribute('data-code') + ': БҮНА код 7 оронтой (MAP-30).' }); ov[+i.getAttribute('data-code')] = v; });
        var note = ui.$('#fx-note', m.el).value.trim();
        if (note.length < 10) errs.push({ code: 'ebarimt.resolution_note_required', message: 'Тэмдэглэл дор хаяж 10 тэмдэгт.' });
        if (errs.length) { ui.$('#fx-err', m.el).innerHTML = ui.errList(errs, 'Илгээх боломжгүй'); return; }
        var nd = cloneDoc(d, ov, 'FIX: ' + note);
        close(true); eb.sel = nd.id; ui.toast(d.id + ' → CANCELLED · клон ' + nd.id + ' PENDING.');
        scheduleSend(nd.id, rerender); rerender();
      } }] });
    ui.$('#fx-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); });
    app.decorateNotes(m.el);
  }
  function cancelDoc(d, rerender) {
    var m = ui.modal({ title: 'eBarimt баримт цуцлах — ' + d.sourceNo,
      body: '<form id="cx-form" class="stack"><p>Борлуулалтад eBarimt баримт шаардлагагүй болсон үед л (жишээ нь нэхэмжлэх бүтэн кредит нотоор цуцлагдсан). Баримт CANCELLED болж "eBarimt-гүй борлуулалт" тайланд гарна (12 §11.4, RET-62).</p>' + noteField('cx-note') + '<div id="cx-err"></div></form>',
      footer: [{ label: 'Болих' }, { label: 'Цуцлах', kind: 'danger', onClick: function (close) {
        var note = ui.$('#cx-note', m.el).value.trim();
        if (note.length < 10) { ui.$('#cx-err', m.el).innerHTML = ui.errList([{ code: 'ebarimt.resolution_note_required', message: 'Тэмдэглэл дор хаяж 10 тэмдэгт (RET-62).' }], 'Цуцлах боломжгүй'); return; }
        d.status = 'CANCELLED'; d.resolutionNote = 'MANUAL_CANCEL:' + note; d.resolvedAt = NOW; d.resolvedBy = currentUser();
        addEvent(d, 'CANCELLED', 'Гараар цуцалсан (T10, MANUAL_CANCEL) — ' + currentUser() + '. ' + note);
        close(true); ui.toast(d.id + ' цуцлагдлаа.'); rerender();
      } }] });
    ui.$('#cx-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); });
  }
  function confirmManualVoid(d, rerender) {
    var target = allDocs().filter(function (x) { return x.ddtd === d.voidsDdtd; })[0];
    var m = ui.modal({ title: 'Порталд цуцалсныг баталгаажуулах',
      body: '<form id="mv-form" class="stack"><p>e-invoice порталд ДДТД <span class="mono">' + ui.esc(d.voidsDdtd) + '</span>-г цуцалсан уу? Баталгаажуулахад ' + (target ? target.id : '') + ' → CANCELLED (MANUAL_VOID, T11), гинжийн төлөв "Цуцлагдсан" болно (RET-51).</p>' + noteField('mv-note') + '<div id="mv-err"></div></form>',
      footer: [{ label: 'Болих' }, { label: 'Баталгаажуулах', kind: 'primary', onClick: function (close) {
        var note = ui.$('#mv-note', m.el).value.trim();
        if (note.length < 10) { ui.$('#mv-err', m.el).innerHTML = ui.errList([{ code: 'ebarimt.resolution_note_required', message: 'Тэмдэглэл дор хаяж 10 тэмдэгт.' }], 'Баталгаажуулах боломжгүй'); return; }
        if (target) { target.status = 'CANCELLED'; target.resolutionNote = 'MANUAL_VOID:' + note; target.resolvedAt = NOW; addEvent(target, 'CANCELLED', 'Порталд гараар цуцалсан (MANUAL_VOID, T11) — ' + currentUser() + '.'); }
        d.status = 'CANCELLED'; d.resolutionNote = 'MANUAL_VOID_CONFIRMED:' + note; d.resolvedAt = NOW;
        addEvent(d, 'CANCELLED', 'Хүсэлт хаагдсан: порталын цуцлалт баталгаажсан.');
        close(true); ui.toast('Порталын цуцлалт баталгаажлаа.'); rerender();
      } }] });
    ui.$('#mv-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); });
  }

  // ===========================================================================
  // Purchases — #purchase-invoices (list) + #purchase-invoice (editor)
  // ENGINE GAP 4 — the engine has no purchase drafts; drafts live in this module (DPI-###### from state.draftCounters).
  // ===========================================================================
  var pdrafts = null;
  function pDrafts() {
    if (pdrafts) return pdrafts;
    pdrafts = [];
    newPDraft({ vend: 'V00002', vendorInvoiceNo: 'ДХ-26-1008', date: '2026-10-08', ddtd: '000000000712202610080914220001207', confirm: true, memo: 'Бэлэн ноорог: ДДТД-тэй, баталгаажуулсан',
      lines: [{ no: '7212', qty: '3', price: '120000', vatProd: 'VAT10', description: 'Интернэт 4-р улирал' }, { no: '7231', qty: '1', price: '90000', vatProd: 'VAT10', description: 'Хостинг серверийн түрээс' }] });
    newPDraft({ vend: 'V00004', vendorInvoiceNo: 'БТХ-26-164', date: '2026-10-07', ddtd: '00000000091420261007', confirm: false, memo: 'Алдаатай жишээ: давхардсан дугаар, ДДТД 20 оронтой',
      lines: [{ no: '6100', qty: '1', price: '430000', vatProd: 'VAT10', description: 'Утасгүй хулгана 10 ш' }] });
    return pdrafts;
  }
  function newPDraft(o) {
    var S = E().state();
    S.draftCounters.PI_DRAFT += 1;
    var d = { no: 'DPI-' + String(S.draftCounters.PI_DRAFT).padStart(6, '0'), vend: o.vend || '', vendorInvoiceNo: o.vendorInvoiceNo || '', date: o.date || today(), ddtd: o.ddtd || '', confirm: !!o.confirm, memo: o.memo || '',
      lines: (o.lines || [{ no: '', qty: '1', price: '0', vatProd: 'VAT10', description: '' }]).map(function (l) { return { type: 'GL_ACCOUNT', no: l.no, qty: l.qty, price: l.price, disc: '0', vatProd: l.vatProd, description: l.description }; }) };
    pdrafts.push(d);
    return d;
  }
  function purchAccounts() {
    return E().setup.accounts().filter(function (a) { return a.type === 'POSTING' && a.direct && a.vatProd && /^(14|16|17|6|7|83)/.test(a.no); });
  }
  function piCalc(d) {
    var v = d.vend ? E().setup.vendor(d.vend) : null;
    return E().calcDocument({ side: 'PURCHASE', docType: 'INVOICE', pricesInclVat: false, vatBus: v ? v.vatBus : 'DOMESTIC', genBus: v ? v.genBus : 'DOMESTIC', lines: d.lines });
  }
  function ddtdState(d) {
    var digits = (d.ddtd || '').replace(/\D/g, '');
    if (!digits) return { ok: false, empty: true, n: 0 };
    return { ok: /^\d{33}$/.test(d.ddtd), empty: false, n: digits.length };
  }
  function piErrors(d, calc) {
    var errs = calc.errors.slice();
    if (!d.vend) errs.push({ code: 'purchase.vendor_required', message: 'Нийлүүлэгч сонгоно уу.' });
    if (!d.vendorInvoiceNo.trim()) errs.push({ code: 'purchase.vendor_invoice_no_required', message: 'Нийлүүлэгчийн нэхэмжлэхийн дугаар заавал (FR-PUR-002).' });
    else if (dupVendorNo(d)) errs.push({ code: 'purchase.vendor_invoice_no_duplicate', message: 'Нийлүүлэгчийн нэхэмжлэхийн дугаар ' + d.vendorInvoiceNo + ' аль хэдийн бүртгэгдсэн: ' + dupVendorNo(d) + ' (INV-18).' });
    var ds = ddtdState(d);
    if (!ds.empty && !ds.ok) errs.push({ code: 'ebarimt.purchase_receipt_ddtd_invalid', message: 'ДДТД яг 33 оронтой тоо байна (одоо ' + ds.n + ', BR-TAX-47).' });
    if (d.confirm && !ds.ok) errs.push({ code: 'tax.supplier_receipt_id_required', message: 'Орцын НӨАТ баталгаажуулахад 33 оронтой ДДТД заавал (BR-TAX-49).' });
    if (!calc.lines.some(function (l) { return !l.blank && l.qty > 0n; })) errs.push({ code: 'purchase.no_lines', message: 'Дор хаяж нэг мөр оруулна уу.' });
    if (!periodOpen(d.date)) errs.push({ code: 'gl.period_closed', message: ui.date(d.date) + ' хаалттай үед байна.' });
    return errs;
  }
  function dupVendorNo(d) {
    var no = d.vendorInvoiceNo.trim();
    var p = E().purchases.list().filter(function (x) { return x.vendor === d.vend && x.vendorInvoiceNo === no; })[0];
    if (p) return p.no;
    var o = pDrafts().filter(function (x) { return x !== d && x.vend === d.vend && x.vendorInvoiceNo.trim() === no; })[0];
    return o ? o.no + ' (ноорог)' : null;
  }
  function piSrc(d) { return { id: d.no, date: d.date, vend: d.vend, vendorInvoiceNo: d.vendorInvoiceNo.trim(), lines: d.lines.filter(function (l) { return l.no; }), ddtd: d.ddtd || null, confirm: d.confirm }; }

  function renderPurchList(el, ctx) {
    var tab = ctx.piTab || 'posted';
    var list = E().purchases.list().slice().reverse();
    var drafts = pDrafts();
    var S = E().state();
    var unc = E().vat.unconfirmedInput();
    var html = '<div class="page-head"><div class="title-wrap"><h1>Худалдан авалтын нэхэмжлэх</h1></div><div class="row"><button class="btn primary" type="button" id="pl-new">+ Шинэ нэхэмжлэх</button></div></div>';
    if (unc.length) html += '<div class="banner warn" data-note="purch.unconfirmed">' + unc.length + ' баримтын орцын НӨАТ (' + fmtM(sum(unc, function (e) { return e.amount; }), { sym: true }) + ') баталгаажаагүй тул НӨАТ-ын тайланд хасагдахгүй (D-E4). Нийлүүлэгчийн eBarimt ДДТД-ийг бүртгээд баталгаажуулна уу.</div>';
    html += '<div class="tabs" role="tablist" data-note="pi.drafts">' + [['drafts', 'Ноорог', drafts.length], ['posted', 'Батлагдсан', list.length]].map(function (t) {
      return '<button class="tab" role="tab" type="button" id="pt-' + t[0] + '" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + ' <span class="count">' + t[2] + '</span></button>';
    }).join('') + '</div>';
    if (tab === 'drafts') {
      html += '<div class="card"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Ноорог №</th><th>Нийлүүлэгч</th><th>Нийлүүлэгчийн №</th><th>Огноо</th><th>ДДТД</th><th class="num">Нийт ≈</th><th>Төлөв</th></tr></thead><tbody>' +
        (drafts.map(function (d) {
          var c = piCalc(d), errs = piErrors(d, c), ds = ddtdState(d);
          return '<tr class="clickable" tabindex="0" data-pdraft="' + d.no + '"><td class="code">' + d.no + '</td><td>' + ui.esc(d.vend ? E().setup.vendor(d.vend).name : '—') + '</td><td class="code">' + ui.esc(d.vendorInvoiceNo || '—') + '</td><td>' + ui.date(d.date) + '</td>' +
            '<td>' + (ds.empty ? '<span class="muted xs">бүртгээгүй</span>' : ds.ok ? ui.pill('OK', '33 орон') : ui.pill('ERROR', ds.n + ' орон')) + '</td>' + ui.moneyCell(c.amountInclVat) + '<td>' + ui.pill('DRAFT') + (errs.length ? ' ' + ui.pill('WARNING', errs.length + ' алдаа') : '') + '</td></tr>';
        }).join('') || '<tr><td colspan="7" class="empty">Ноорог алга.</td></tr>') + '</tbody></table></div></div><p class="xs muted">Ноорогийн дугаар DPI-… завсартай байж болно; хуулийн дугаар PI-2026-##### батлахад л олгогдоно (D-C7).</p>';
    } else {
      html += '<div class="card" data-note="purch.list"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Дугаар</th><th>Огноо</th><th>Нийлүүлэгч</th><th>Нийлүүлэгчийн №</th><th>ДДТД</th><th class="num">Дүн</th><th class="num">НӨАТ</th><th class="num">Нийт</th><th class="num">Үлдэгдэл</th><th>Орцын НӨАТ</th><th>Төлөх огноо</th></tr></thead><tbody>' +
        list.map(function (p) {
          var vle = S.vle.filter(function (e) { return e.entryNo === p.vleEntryNo; })[0];
          var overdue = vle.open && vle.dueDate < today();
          return '<tr><td class="code">' + p.no + '</td><td>' + ui.date(p.postingDate) + '</td><td>' + ui.esc(p.vendorName) + '</td><td class="code">' + ui.esc(p.vendorInvoiceNo) + '</td>' +
            '<td class="code" title="' + ui.esc(p.ddtd || '') + '">' + (p.ddtd ? '…' + p.ddtd.slice(-6) : '<span class="muted">бүртгээгүй</span>') + '</td>' + ui.moneyCell(p.amount) + ui.moneyCell(p.vatAmount) + ui.moneyCell(p.amountInclVat) + ui.moneyCell(-vle.remaining, { blankZero: true }) +
            '<td>' + (p.deductibleConfirmed ? ui.pill('OK', 'Баталгаажсан') : '<button class="btn sm" type="button" data-confirm="' + p.no + '" id="pc-' + p.no + '">Баталгаажуулах</button>') + '</td><td>' + ui.date(p.dueDate) + (overdue ? ' ' + ui.pill('OVERDUE') : '') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    el.innerHTML = html;
    ui.$$('.tab', el).forEach(function (b) { b.addEventListener('click', function () { ctx.piTab = b.getAttribute('data-tab'); renderPurchList(el, ctx); app.decorateNotes(); ui.$('#pt-' + ctx.piTab).focus(); }); });
    ui.$('#pl-new').addEventListener('click', function () { pDrafts(); var d = newPDraft({}); app.navigate('purchase-invoice', { piDraftNo: d.no }); });
    wireRowNav(el, 'data-pdraft', function (no) { app.navigate('purchase-invoice', { piDraftNo: no }); });
    ui.$$('[data-confirm]', el).forEach(function (b) { b.addEventListener('click', function () { confirmPurchase(b.getAttribute('data-confirm'), function () { renderPurchList(el, ctx); app.decorateNotes(); }); }); });
  }
  function confirmPurchase(no, done) {
    var p = E().purchases.list().filter(function (x) { return x.no === no; })[0];
    var m = ui.modal({ title: 'Орцын НӨАТ баталгаажуулах — ' + no,
      body: '<form id="pc-form" class="stack" data-note="pi.confirm"><p>' + ui.esc(p.vendorName) + ' · ' + ui.esc(p.vendorInvoiceNo) + ' · НӨАТ ' + fmtM(p.vatAmount, { sym: true }) + '</p><div class="field"><label class="req" for="pc-ddtd">Нийлүүлэгчийн eBarimt ДДТД (33 орон)</label><input class="input mono" id="pc-ddtd" inputmode="numeric" maxlength="33" autocomplete="off" value="' + ui.esc(p.ddtd || '') + '"><span class="hint" id="pc-n"></span></div><div id="pc-err"></div><p class="xs muted">Баталгаажсан VAT entry (deductible_confirmed = true) нээлттэй үеийн ТТ-03а-ийн 7, 8-р мөрөнд хасагдана (BR-TAX-49, 50).</p></form>',
      footer: [{ label: 'Болих' }, { label: 'Баталгаажуулах', kind: 'primary', onClick: function (close) {
        var v = ui.$('#pc-ddtd', m.el).value.replace(/\D/g, '');
        var r = E().purchases.confirmInputVat(no, v);
        if (!r.ok) { ui.$('#pc-err', m.el).innerHTML = ui.errList(r.errors, 'Баталгаажуулж чадсангүй'); return; }
        close(true); ui.toast('Орцын НӨАТ баталгаажлаа: ' + no); done();
      } }] });
    var inp = ui.$('#pc-ddtd', m.el), cnt = function () { var n = inp.value.replace(/\D/g, '').length; ui.$('#pc-n', m.el).textContent = n + ' / 33'; inp.classList.toggle('invalid', n > 0 && n !== 33); };
    inp.addEventListener('input', cnt); cnt();
    ui.$('#pc-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); });
    app.decorateNotes(m.el);
  }

  function renderPurchEditor(el, ctx) {
    var drafts = pDrafts();
    var d = drafts.filter(function (x) { return x.no === ctx.piDraftNo; })[0] || drafts[0] || newPDraft({});
    ctx.piDraftNo = d.no;
    var vendors = ERP.data.vendors, accs = purchAccounts();
    var v = d.vend ? E().setup.vendor(d.vend) : null;
    var html = '<div class="page-head"><div class="title-wrap"><h1>Худалдан авалтын нэхэмжлэх</h1><span class="docno">' + d.no + '</span>' + ui.pill('DRAFT') + '</div><span class="small muted">' + ui.esc(d.memo || 'Ноорог санах ойд') + '</span></div>';
    html += '<div class="actionbar"><button class="btn primary" type="button" id="pi-post">Батлах</button><button class="btn" type="button" id="pi-preview">Урьдчилан харах</button><button class="btn" type="button" id="pi-add">+ Мөр нэмэх</button><button class="btn danger" type="button" id="pi-del">Ноорог устгах</button><a class="btn ghost" href="#purchase-invoices">Жагсаалт руу</a></div>';
    html += '<div id="pi-errors"></div><div class="doc-layout"><div class="doc-main">';
    html += '<form id="pi-form"><details class="fasttab" open><summary><span class="chev" aria-hidden="true">▸</span>Ерөнхий</summary><div class="ft-body"><div class="form-grid">' +
      '<div class="field"><label class="req" for="pi-vendor">Нийлүүлэгч</label><select class="select" id="pi-vendor">' + opt('', '— сонгох —', !d.vend) + vendors.map(function (x) { return opt(x.no, x.no + ' · ' + x.name, x.no === d.vend); }).join('') + '</select>' +
      (v ? '<span class="hint">ТТД ' + v.tin + ' · ' + v.vpg + ' → ' + E().setup.payablesAccount(v.vpg) + ' · ' + (ERP.data.paymentTerms[v.terms] || {}).name + '</span>' : '') + '</div>' +
      '<div class="field" data-note="pi.vendor-no"><label class="req" for="pi-vino">Нийлүүлэгчийн нэхэмжлэхийн №</label><input class="input mono" id="pi-vino" maxlength="35" autocomplete="off" value="' + ui.esc(d.vendorInvoiceNo) + '"><span class="hint" id="pi-vino-hint"></span></div>' +
      '<div class="field"><label class="req" for="pi-date">Огноо</label>' + ui.dateInput('pi-date', d.date) + '<span class="hint" id="pi-due-hint"></span></div>' +
      '</div></div></details>';
    html += '<details class="fasttab" open><summary><span class="chev" aria-hidden="true">▸</span>Нийлүүлэгчийн eBarimt ба орцын НӨАТ</summary><div class="ft-body"><div class="form-grid">' +
      '<div class="field pi-ddtd-field" data-note="pi.ddtd"><label for="pi-ddtd">ДДТД (33 орон)</label><input class="input mono" id="pi-ddtd" inputmode="numeric" maxlength="40" autocomplete="off" value="' + ui.esc(d.ddtd) + '" placeholder="000000000712202610080914220001207"><span class="hint" id="pi-ddtd-hint"></span></div>' +
      '<div class="field" data-note="pi.confirm"><span class="flabel">deductible_confirmed</span><label class="checkbox" for="pi-confirm"><input type="checkbox" id="pi-confirm"' + (d.confirm ? ' checked' : '') + '> Орцын НӨАТ баталгаажсан (ДДТД-ийг шалгасан)</label><span class="hint" id="pi-confirm-hint"></span></div>' +
      '</div></div></details></form>';
    html += '<div class="card" data-note="pi.lines"><div class="card-head"><h2>Мөрүүд</h2><span class="small muted">Үнэ НӨАТ-гүй</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table lines-grid pi-grid"><thead><tr><th>Данс</th><th>Тайлбар</th><th class="num">Тоо</th><th class="num">Нэгжийн үнэ</th><th>НӨАТ</th><th class="num">Дүн</th><th class="num">НӨАТ дүн</th><th><span class="sr-only">Устгах</span></th></tr></thead><tbody>' +
      d.lines.map(function (l, i) {
        return '<tr><td><label class="sr-only" for="pl-acc-' + i + '">Мөр ' + (i + 1) + ' данс</label><select class="select" id="pl-acc-' + i + '" data-f="no" data-i="' + i + '">' + opt('', '— данс —', !l.no) + accs.map(function (a) { return opt(a.no, a.no + ' ' + a.name, a.no === l.no); }).join('') + '</select></td>' +
          '<td><label class="sr-only" for="pl-desc-' + i + '">Мөр ' + (i + 1) + ' тайлбар</label><input class="input" id="pl-desc-' + i + '" data-f="description" data-i="' + i + '" value="' + ui.esc(l.description || '') + '"></td>' +
          '<td><label class="sr-only" for="pl-qty-' + i + '">Мөр ' + (i + 1) + ' тоо</label><input class="input num mono" id="pl-qty-' + i + '" data-f="qty" data-i="' + i + '" inputmode="decimal" value="' + ui.esc(l.qty) + '" style="width:70px"></td>' +
          '<td><label class="sr-only" for="pl-price-' + i + '">Мөр ' + (i + 1) + ' үнэ</label><input class="input num mono" id="pl-price-' + i + '" data-f="price" data-i="' + i + '" inputmode="decimal" value="' + ui.esc(l.price) + '" style="width:110px"></td>' +
          '<td><label class="sr-only" for="pl-vat-' + i + '">Мөр ' + (i + 1) + ' НӨАТ</label><select class="select" id="pl-vat-' + i + '" data-f="vatProd" data-i="' + i + '">' + ['VAT10', 'VAT0', 'EXEMPT', 'NOVAT'].map(function (k) { return opt(k, ERP.data.vatProdGroups[k] || k, (l.vatProd || 'VAT10') === k); }).join('') + '</select></td>' +
          '<td class="num" id="pl-amt-' + i + '"></td><td class="num" id="pl-vamt-' + i + '"></td><td><button class="btn ghost sm" type="button" data-del="' + i + '" id="pl-del-' + i + '" aria-label="Мөр ' + (i + 1) + ' устгах">✕</button></td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
    html += '<div id="pi-totals"></div><div id="pi-preview-host"></div>';
    html += '</div><aside class="factbox" id="pi-factbox"></aside></div>';
    el.innerHTML = html;
    var refresh = function () { renderPurchEditor(el, ctx); app.decorateNotes(); };
    ui.$('#pi-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    ui.$('#pi-vendor').addEventListener('change', function (ev) { d.vend = ev.target.value; refresh(); ui.$('#pi-vendor').focus(); });
    ui.$('#pi-vino').addEventListener('input', function (ev) { d.vendorInvoiceNo = ev.target.value; updatePi(d); });
    bindDate('pi-date', function (val) { d.date = val; updatePi(d); });
    ui.$('#pi-ddtd').addEventListener('input', function (ev) { d.ddtd = ev.target.value.replace(/\s/g, ''); if (!ddtdState(d).ok) d.confirm = false; ui.$('#pi-confirm').checked = d.confirm; updatePi(d); });
    ui.$('#pi-confirm').addEventListener('change', function (ev) { d.confirm = ev.target.checked; updatePi(d); });
    ui.$$('[data-f]', el).forEach(function (inp) {
      var ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, function () {
        var i = +inp.getAttribute('data-i'), f = inp.getAttribute('data-f');
        var val = inp.value; if (f === 'qty' || f === 'price') val = val.replace(/[\s ]/g, '').replace(',', '.');
        d.lines[i][f] = val;
        if (f === 'no' && val) { var a = E().setup.account(val); if (a && !d.lines[i].description) { d.lines[i].description = a.name; ui.$('#pl-desc-' + i).value = a.name; } if (a && a.vatProd) { d.lines[i].vatProd = a.vatProd; ui.$('#pl-vat-' + i).value = a.vatProd; } }
        updatePi(d);
      });
    });
    ui.$$('[data-del]', el).forEach(function (b) { b.addEventListener('click', function () { d.lines.splice(+b.getAttribute('data-del'), 1); if (!d.lines.length) d.lines.push({ type: 'GL_ACCOUNT', no: '', qty: '1', price: '0', disc: '0', vatProd: 'VAT10', description: '' }); refresh(); }); });
    ui.$('#pi-add').addEventListener('click', function () { d.lines.push({ type: 'GL_ACCOUNT', no: '', qty: '1', price: '0', disc: '0', vatProd: 'VAT10', description: '' }); refresh(); var s = ui.$('#pl-acc-' + (d.lines.length - 1)); if (s) s.focus(); });
    ui.$('#pi-del').addEventListener('click', function () {
      ui.confirm({ title: 'Ноорог устгах уу?', body: '<p>' + d.no + ' устгагдана. Ноорогийн дугаар завсартай байж болно; хуулийн цуврал (PI) хөндөгдөхгүй.</p>', ok: 'Устгах', danger: true }).then(function (ok) {
        if (!ok) return; pdrafts.splice(pdrafts.indexOf(d), 1); ctx.piDraftNo = null; ctx.piTab = 'drafts'; app.navigate('purchase-invoices');
      });
    });
    ui.$('#pi-preview').addEventListener('click', function () { showPiPreview(d, true); });
    ui.$('#pi-post').addEventListener('click', function () { postPi(d, ctx); });
    updatePi(d);
  }
  function updatePi(d) {
    var calc = piCalc(d), errs = piErrors(d, calc), v = d.vend ? E().setup.vendor(d.vend) : null, ds = ddtdState(d);
    calc.lines.forEach(function (l, i) {
      var a = ui.$('#pl-amt-' + i), b = ui.$('#pl-vamt-' + i);
      if (a) a.textContent = l.blank ? '' : fmtM(l.amount);
      if (b) b.textContent = l.blank ? '' : fmtM(l.vatAmount);
    });
    var dup = d.vendorInvoiceNo.trim() ? dupVendorNo(d) : null;
    var vino = ui.$('#pi-vino');
    vino.classList.toggle('invalid', !!dup);
    ui.$('#pi-vino-hint').textContent = dup ? 'Давхардсан: ' + dup + ' (INV-18)' : 'Нийлүүлэгч дотроо давхардахгүй';
    ui.$('#pi-due-hint').textContent = v ? 'Төлөх огноо ' + ui.date(E().dates.calcDate(ERP.data.paymentTerms[v.terms].formula, d.date)) + ' (' + ERP.data.paymentTerms[v.terms].formula + ')' : '';
    var dd = ui.$('#pi-ddtd');
    dd.classList.toggle('invalid', !ds.empty && !ds.ok);
    ui.$('#pi-ddtd-hint').innerHTML = ds.empty ? 'Бүртгээгүй — НӨАТ 1300-д бичигдэх ч тайланд хасагдахгүй' : ds.ok ? '✓ 33 / 33 орон' : '<span class="ar-overdue">' + ds.n + ' / 33 орон' + (/\D/.test(d.ddtd) ? ', зөвхөн тоо' : '') + '</span>';
    var cb = ui.$('#pi-confirm');
    cb.disabled = !ds.ok;
    ui.$('#pi-confirm-hint').textContent = ds.ok ? (d.confirm ? 'VAT entry deductible_confirmed = true → ' + d.date.slice(0, 7) + '-ийн ТТ-03а-д хасагдана' : 'Баталгаажуулаагүй → дараа жагсаалтаас баталгаажуулна') : 'ДДТД 33 оронтой үед идэвхжинэ (BR-TAX-49)';
    ui.$('#pi-totals').innerHTML = '<dl class="totals"><dt>Дүн (НӨАТ-гүй)</dt><dd>' + fmtM(calc.amount, { sym: true }) + '</dd>' + calc.vatByIdentifier.map(function (x) { return '<dt>' + ui.esc(x.label) + '</dt><dd>' + fmtM(x.vat, { sym: true }) + '</dd>'; }).join('') +
      '<dt class="grand">Нийт (өглөг)</dt><dd class="grand">' + fmtM(calc.amountInclVat, { sym: true }) + '</dd></dl>' +
      ui.calc('Тооцоог харах: орцын НӨАТ', '<p>Борлуулалттай ижил тооцоолол (D-E3): НӨАТ VAT identifier тус бүрд нэг удаа, үнэ НӨАТ-гүй тул НӨАТ = r(Суурь × r / 100), мөрүүдэд running remainder-ээр.</p>' +
        calc.groups.map(function (g) { return '<div class="formula">' + ui.esc(g.label) + ': Суурь ' + fmtM(g.total) + ' × ' + g.pct + ' / 100 = ' + E().money.fmtRatio(g.exactNum, g.den, 4) + ' → ' + fmtM(g.vat) + (g.lines.length > 1 ? '\n  мөрүүд: ' + g.alloc.map(function (a) { return '№' + (a.line + 1) + ' ' + fmtM(a.vat); }).join(', ') : '') + '</div>'; }).join('') +
        '<p class="xs">Posting: зардал/хөрөнгө Дт ' + fmtM(calc.amount) + ', 1300 орцын НӨАТ Дт ' + fmtM(calc.vatAmount) + ', ' + (v ? E().setup.payablesAccount(v.vpg) : '2100') + ' өглөг Кт ' + fmtM(calc.amountInclVat) + '. deductible_confirmed = ' + (d.confirm && ds.ok) + '.</p>');
    ui.$('#pi-errors').innerHTML = errs.length ? ui.errList(errs, 'Батлах боломжгүй — дараах алдааг засна уу') : '';
    ui.$('#pi-post').disabled = errs.length > 0;
    var fb = '';
    if (v) {
      var bal = sum(E().state().dvle.filter(function (x) { return x.vendor === v.no; }), function (x) { return x.amount; });
      fb += '<div class="card"><div class="card-head"><h3>Нийлүүлэгч</h3><span class="code small">' + v.no + '</span></div><div class="card-body"><dl class="kv"><dt>Өглөгийн үлдэгдэл</dt><dd>' + fmtM(-bal) + '</dd><dt>ТТД</dt><dd class="code">' + v.tin + '</dd><dt>Posting group</dt><dd class="code">' + v.vpg + ' → ' + E().setup.payablesAccount(v.vpg) + '</dd></dl></div></div>';
    }
    fb += '<div class="card"><div class="card-head"><h3>ДДТД-ийн төлөв</h3>' + (ds.empty ? ui.pill('NEUTRAL', 'Бүртгээгүй') : !ds.ok ? ui.pill('ERROR', 'Буруу') : d.confirm ? ui.pill('OK', 'CONFIRMED') : ui.pill('SENT', 'MATCHED')) + '</div><div class="card-body small">' +
      (ds.ok ? '<span class="mono xs">' + ui.esc(d.ddtd) + '</span><br>' : '') + 'IMPORTED → MATCHED (нэхэмжлэхтэй холбосон) → CONFIRMED (орцын НӨАТ хасагдана). R2-т <code>getSaleListERP</code>-ээр автоматаар тулгана.</div></div>';
    ui.$('#pi-factbox').innerHTML = fb;
    var ph = ui.$('#pi-preview-host');
    if (ph.getAttribute('data-open') === '1') showPiPreview(d, false);
  }
  function showPiPreview(d, scroll) {
    var host = ui.$('#pi-preview-host');
    host.setAttribute('data-open', '1');
    var calc = piCalc(d), errs = piErrors(d, calc).filter(function (e) { return e.code !== 'purchase.vendor_invoice_no_duplicate'; });
    if (errs.length) { host.innerHTML = '<div class="card" data-note="pi.preview"><div class="card-head"><h2>Батлахын өмнө харах</h2></div><div class="card-body">' + ui.errList(errs, 'Урьдчилан харах боломжгүй') + '</div></div>'; app.decorateNotes(); return; }
    var src = piSrc(d);
    src.vendorInvoiceNo = src.vendorInvoiceNo + (dupVendorNo(d) ? ' (preview)' : '');
    var r = E().purchases.post(src, { preview: true });
    var html = '<div class="card" data-note="pi.preview"><div class="card-head"><h2>Батлахын өмнө харах</h2><span class="small muted">PI-2026-##### · дугаар зарцуулахгүй (D-C6)</span></div><div class="card-body stack">';
    if (!r.ok) html += ui.errList(r.errors, 'Preview');
    else {
      var v = r.result.vouchers[0];
      html += '<h3 class="small">Ерөнхий дэвтэр (gl.gl_entry)</h3>' + glTable(v.gl) +
        '<div class="grid cols-2"><div><h3 class="small">НӨАТ-ын бичилт (tax.vat_entry)</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>Ангилал</th><th class="num">Суурь</th><th class="num">НӨАТ</th><th>deductible_confirmed</th></tr></thead><tbody>' +
        v.vat.map(function (e) { return '<tr><td>' + e.category + '</td>' + ui.moneyCell(e.base) + ui.moneyCell(e.amount) + '<td>' + (e.deductibleConfirmed ? ui.pill('OK', 'true') : ui.pill('NEUTRAL', 'false')) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
        '<div><h3 class="small">Өглөгийн бичилт (party.vendor_ledger_entry)</h3><dl class="kv">' + v.vle.map(function (e) { return '<dt>Дүн</dt><dd>' + fmtM(e.amount) + '</dd><dt>Төлөх огноо</dt><dd>' + ui.date(e.dueDate) + '</dd><dt>Нийлүүлэгчийн №</dt><dd class="code">' + ui.esc(d.vendorInvoiceNo) + '</dd>'; }).join('') + '</dl></div></div>' +
        '<p class="small">Дт = Кт: ' + fmtM(sum(v.gl, function (e) { return Math.max(e.amount, 0); })) + ' = ' + fmtM(sum(v.gl, function (e) { return Math.max(-e.amount, 0); })) + ' ✓ (INV-01)</p>';
    }
    html += '</div></div>';
    host.innerHTML = html;
    app.decorateNotes();
    if (scroll && host.scrollIntoView) host.scrollIntoView({ block: 'nearest' });
  }
  function postPi(d, ctx) {
    var calc = piCalc(d), errs = piErrors(d, calc);
    if (errs.length) return;
    var v = E().setup.vendor(d.vend);
    ui.confirm({ title: 'Худалдан авалт батлах уу?', ok: 'Батлах',
      body: '<p>' + ui.esc(v.name) + ' · ' + ui.esc(d.vendorInvoiceNo) + ' · ' + ui.date(d.date) + ' · <strong>' + fmtM(calc.amountInclVat, { sym: true }) + '</strong></p><p>PI-2026-##### дугаар олгогдож зардал/хөрөнгө, 1300 орцын НӨАТ, ' + E().setup.payablesAccount(v.vpg) + ' өглөг нэг гүйлгээнд бичигдэнэ. Орцын НӨАТ: ' + (d.confirm ? 'баталгаажсан' : 'баталгаажаагүй (тайланд хасагдахгүй)') + '.</p>' })
      .then(function (ok) {
        if (!ok) return;
        var r = E().purchases.post(piSrc(d));
        if (!r.ok) { ui.$('#pi-errors').innerHTML = ui.errList(r.errors); return; }
        pdrafts.splice(pdrafts.indexOf(d), 1);
        ui.toast('Худалдан авалт <strong>' + r.posted.no + '</strong> батлагдлаа.');
        ctx.piDraftNo = null; ctx.piTab = 'posted';
        app.navigate('purchase-invoices');
      });
  }

  // ===========================================================================
  // posted invoice (js/screens/sales.js): enable the "Кредит нот үүсгэх" / "Төлбөр бүртгэх" buttons it reserved
  // for this builder. Wraps the render function; sales.js itself is not edited.
  // ===========================================================================
  var postedScreen = app.screens['posted-invoice'];
  if (postedScreen) {
    var origPosted = postedScreen.render;
    postedScreen.render = function (el, ctx) {
      origPosted(el, ctx);
      var p = ctx.postedNo ? E().sales.getPosted(ctx.postedNo) : null;
      if (!p) return;
      ui.$$('.actionbar button[disabled]', el).forEach(function (b) {
        var t = b.textContent;
        if (t.indexOf('Кредит нот') === 0 && p.docType === 'INVOICE') {
          b.disabled = false; b.removeAttribute('title');
          b.addEventListener('click', function () { cm = null; app.navigate('credit-memo', { cmSource: p.no }); });
        } else if (t.indexOf('Төлбөр бүртгэх') === 0 && p.docType === 'INVOICE') {
          var ps = E().sales.paymentStatus(p);
          if (ps.remaining > 0) {
            b.disabled = false; b.removeAttribute('title');
            b.addEventListener('click', function () { ap = null; app.navigate('cust-apply', { arApplyCust: p.customer, arApplyTargets: [p.no] }); });
          } else b.title = 'Төлөгдсөн — үлдэгдэлгүй';
        }
      });
      var bar = ui.$('.actionbar', el);
      if (bar) {
        var a = document.createElement('button');
        a.type = 'button'; a.className = 'btn'; a.id = 'pp-customer'; a.textContent = 'Харилцагчийн карт';
        a.addEventListener('click', function () { app.navigate('customer', { customerNo: p.customer }); });
        bar.appendChild(a);
      }
    };
  }

  // ===========================================================================
  // registration
  // ===========================================================================
  app.registerScreen({
    route: 'customers', title: 'Харилцагч', crumbs: [['Борлуулалт'], ['Харилцагч']], owner: 'js/screens/sales-ar.js',
    intro: ['Харилцагч бүрийн авлагын үлдэгдэл, хугацаа хэтэрсэн дүн, ТТД ба eBarimt-ийн төрөл (B2B/B2C), доор нь авлагын насжилт (0–30 / 31–60 / 61–90 / 90+). Бизнес эзэн, нягтлан хэрэглэнэ.',
      'Бүх тоо detailed бичилтээс тооцогдоно — тусад нь хадгалсан "үлдэгдэл" байхгүй. Мөр дээр дарж харилцагчийн карт, бичилт, тулгалт, хуулга руу орно.'],
    render: renderCustomers
  });
  app.registerScreen({
    route: 'customer', title: 'Харилцагчийн карт', crumbs: [['Борлуулалт'], ['Харилцагч', 'customers'], ['Карт']], owner: 'js/screens/sales-ar.js',
    intro: ['Харилцагчийн мэдээлэл, posting group (авлагын данс 1200), нөхцөл ба eBarimt-ийн анхдагч. Доорх табуудад: авлагын бичилт (нээлттэй/хаалттай, үлдэгдэл, мөр бүрийн detailed хөдөлгөөн), насжилт, тулгалтууд, дансны хуулга.',
      '"Тулгалт цуцлах" (unapply) нь толин тусгал мөр нэмж үлдэгдлийг сэргээнэ, хатуу LIFO дарааллаар. Карт өөрөө posting хийхгүй; нэхэмжлэх, төлбөр, кредит нот руу товчоор шилжинэ.'],
    render: renderCustomer,
    crumbRecord: function (ctx) { var c = ctx.customerNo && E().setup.customer(ctx.customerNo); return c ? c.name : null; }
  });
  app.registerScreen({
    route: 'cust-apply', title: 'Төлбөр бүртгэх ба тулгах', crumbs: [['Санхүү'], ['Авлагын тулгалт']], owner: 'js/screens/sales-ar.js',
    intro: ['Харилцагчийн төлбөрийг (эсвэл тулгагдаагүй төлбөр, кредит нотыг) нэг буюу хэд хэдэн нээлттэй нэхэмжлэхэд тулгана (BC-ийн Applies-to ID). Нягтлан хэрэглэнэ.',
      'Шинэ төлбөр батлахад банкны BR-2026-##### эсвэл кассын МХ-1 KO-2026-##### ваучер (Дт мөнгө / Кт 1200) үүснэ; тулгалт нь хос APPLICATION мөр үүсгэж нэхэмжлэхийн үлдэгдлийг бууруулна. Дүнгээ өөрчилж "Тооцоог харах"-аас a = min(...) алхмыг ажиглаарай.'],
    render: renderApply
  });
  app.registerScreen({
    route: 'credit-memo', title: 'Кредит нот (буцаалт)', crumbs: [['Борлуулалт'], ['Кредит нот']], owner: 'js/screens/sales-ar.js',
    intro: ['Батлагдсан нэхэмжлэхээс буцаалт эсвэл үнийн тохируулга хийнэ: мөрүүд хуулагдаж, та зөвхөн буцаах тоог (эсвэл хасах үнийг) оруулна. Шалтгаан заавал.',
      'Батлахад SC-2026-##### олгогдож орлого ба НӨАТ дебит, 1200 кредит бичигдэн эх нэхэмжлэхэд автоматаар тулгагдана. eBarimt-д: бүтэн B2C буцаалт → DELETE, хэсэгчилсэн → засварласан бүтэн баримт inactiveId-тэй, бүтэн B2B → порталд гараар цуцлах. Доорх "eBarimt-д юу болох вэ" хэсэг шийдвэрийн модыг жинхэнэ гинжээр харуулна.'],
    render: renderCreditMemo
  });
  app.registerScreen({
    route: 'ebarimt', title: 'eBarimt хяналт', crumbs: [['eBarimt'], ['Хяналт']], owner: 'js/screens/sales-ar.js',
    intro: ['Бүх eBarimt баримтын төлөв (PENDING / SENT / SUCCESS / ERROR / UNKNOWN / CANCELLED), PosAPI-ийн сугалааны үлдэгдэл ба өдөр тутмын sendData. Анхдагч шүүлтүүр нь зөвхөн анхаарал шаардсан баримт. Нягтлан эсвэл эзэн хэрэглэнэ.',
      'Систем баримтыг автоматаар дахин илгээхгүй (D-J2): UNKNOWN-ийг порталаас шалгаж "Бүртгэгдсэн" (ДДТД оруулна) эсвэл "Бүртгэгдээгүй" (шинэ billIdSuffix-тэй клон) гэж хүн шийднэ. Энэ нь нягтлан бодох бүртгэлд нөлөөлөхгүй.'],
    render: renderEbarimt
  });
  app.registerScreen({
    route: 'purchase-invoices', title: 'Худалдан авалтын нэхэмжлэх', crumbs: [['Худалдан авалт'], ['Нэхэмжлэх']], owner: 'js/screens/sales-ar.js',
    intro: ['Худалдан авалтын ноорог ба батлагдсан нэхэмжлэх, өглөгийн үлдэгдэл, нийлүүлэгчийн eBarimt ДДТД. Нягтлан хэрэглэнэ.',
      'Батлахад PI-2026-##### олгогдож зардал/хөрөнгө Дт, 1300 орцын НӨАТ Дт, 2100 өглөг Кт бичигдэнэ. Орцын НӨАТ зөвхөн 33 оронтой ДДТД бүртгэгдэж баталгаажсан үед НӨАТ-ын тайланд хасагдана (D-E4).'],
    render: renderPurchList
  });
  app.registerScreen({
    route: 'purchase-invoice', title: 'Худалдан авалтын нэхэмжлэх (ноорог)', crumbs: [['Худалдан авалт'], ['Нэхэмжлэх', 'purchase-invoices'], ['Ноорог']], owner: 'js/screens/sales-ar.js',
    intro: ['Нийлүүлэгчийн нэхэмжлэхийг бүртгэнэ: нийлүүлэгчийн дугаар (нийлүүлэгч дотроо давхардахгүй), огноо, ДДТД (яг 33 орон), мөр бүрийн зардлын данс ба НӨАТ-ын бүлэг.',
      '"Урьдчилан харах" нь батлах кодыг дугаар зарцуулахгүйгээр ажиллуулж G/L, НӨАТ, өглөгийн бичилтийг харуулна. "Бэлэн" ноорог DPI-000015, алдаатай жишээ DPI-000016.'],
    render: renderPurchEditor,
    crumbRecord: function (ctx) { return ctx.piDraftNo || null; }
  });
})();
