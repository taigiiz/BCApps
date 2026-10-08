/* =============================================================================
   js/engine.js — window.ERP.engine: the prototype's accounting logic.

   It re-implements, in plain JavaScript and in memory, the parts of the specified .NET posting engine that the
   prototype needs: exact money arithmetic (integer cents, BigInt for products/ratios, half away from zero —
   ADR-0006 / 06 §6.1), document VAT per VAT identifier with running-remainder allocation (D-E3, BR-SAL-22..26),
   account determination from the seed posting setups (D-F1), voucher posting into G/L, VAT, customer/vendor
   (header + detailed) and bank ledgers (05 BR-PST-*), gapless number series (D-C7), application / unapply
   (D-F3), reversal (D-D5), VAT settlement, reports (trial balance, Form A СБТ/ОДТ/МГТ, ТТ-03а, aging),
   eBarimt receipt JSON (12 §5–§6) with a simulated PosAPI, and the invariants shown on #checks.

   Conventions: every stored amount is an integer number of cents (Number, always an integer). Products and
   divisions go through BigInt. G/L amounts are signed: debit +, credit − (D-C3).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = (window.ERP = window.ERP || {});
  var E = (ERP.engine = {});
  var D = null;        // ERP.data
  var S = null;        // mutable ledger state
  var SET = null;      // indexed setup

  // ===========================================================================
  // 1. Money, numbers, dates
  // ===========================================================================
  var NNBSP = ' ';   // narrow no-break space (thousands)
  var NBSP = ' ';
  var TEN = function (n) { var r = 1n; for (var i = 0; i < n; i++) r *= 10n; return r; };

  function parseScaled(str, scale) {
    if (str === null || str === undefined) return null;
    var s = String(str).replace(/[\s  ,]/g, '').replace('−', '-');
    if (s === '' || s === '-' || s === '.' || !/^[-+]?\d*(\.\d*)?$/.test(s)) return null;
    var neg = s[0] === '-';
    s = s.replace(/^[-+]/, '');
    var parts = s.split('.');
    var ip = parts[0] || '0', fp = parts[1] || '';
    var n = BigInt(ip) * TEN(scale);
    if (fp.length <= scale) {
      n += BigInt((fp + '0'.repeat(scale)).slice(0, scale) || '0');
    } else {
      n += BigInt(fp.slice(0, scale) || '0');
      if (fp[scale] >= '5') n += 1n;                 // half away from zero on the absolute value
    }
    return neg ? -n : n;
  }
  function roundDiv(n, d) {                           // BigInt n/d rounded half away from zero
    if (d === 0n) throw new Error('division by zero');
    if (d < 0n) { n = -n; d = -d; }
    var q = n / d, r = n % d;
    if (r < 0n) r = -r;
    if (r * 2n >= d) q += (n < 0n ? -1n : 1n);
    return q;
  }
  function toCents(str) { var v = parseScaled(str, 2); return v === null ? null : Number(v); }
  function group3(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP); }
  function fmtCents(c, opts) {
    opts = opts || {};
    if (c === null || c === undefined || isNaN(c)) return '';
    c = Math.round(c);
    if (opts.blankZero && c === 0) return '';
    var neg = c < 0, a = Math.abs(c);
    var s = group3(String(Math.floor(a / 100))) + '.' + String(a % 100).padStart(2, '0');
    if (neg) s = '-' + s;
    if (opts.sym) s += NBSP + '₮';
    return s;
  }
  function fmtCompact(c) {                            // 15 §7.6 formatCompactMnt
    var a = Math.abs(c) / 100, sign = c < 0 ? '-' : '';
    if (a < 1e6) return sign + group3(String(Math.round(a))) + NBSP + '₮';
    var unit = 'сая', v = a / 1e6;
    if (a >= 1e9 || Math.round(v * 10) / 10 >= 1000) { unit = 'тэрбум'; v = a / 1e9; }
    var t = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return sign + t + NBSP + unit + NBSP + '₮';
  }
  function fmtScaled(n, scale, minFrac, maxFrac) {   // BigInt scaled → decimal string, trailing zeros trimmed
    var neg = n < 0n; if (neg) n = -n;
    if (maxFrac < scale) { n = roundDiv(n, TEN(scale - maxFrac)); scale = maxFrac; }
    var s = n.toString().padStart(scale + 1, '0');
    var ip = s.slice(0, s.length - scale), fp = scale ? s.slice(s.length - scale) : '';
    fp = fp.replace(/0+$/, '');
    while (fp.length < minFrac) fp += '0';
    var out = group3(ip) + (fp ? '.' + fp : '');
    return (neg && n !== 0n ? '-' : '') + out;
  }
  function fmtQty(q5) { return fmtScaled(q5, 5, 0, 5); }
  function fmtPrice(p6) { return fmtScaled(p6, 6, 2, 6); }
  function fmtRatio(num, den, digits) {               // num/den cents shown with `digits` decimals of ₮
    digits = digits || 7;
    var q = roundDiv(num * TEN(digits), den);          // cents * 10^digits
    return fmtScaled(q, digits + 2, 2, digits + 2);
  }
  function fmtDate(d) { return d ? d.replace(/-/g, '.') : ''; }
  function parseDate(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function isoDate(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function addDays(s, n) { return isoDate(parseDate(s) + n * 86400000); }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }   // b - a
  function endOfMonth(s) { var p = s.split('-'); var t = Date.UTC(+p[0], +p[1], 0); return isoDate(t); }
  function monthOf(s) { return s.slice(0, 7); }
  function calcDate(formula, s) {                      // 06 §5.3 DateFormula subset: nD, CM
    if (!formula) return s;
    if (formula === 'CM') return endOfMonth(s);
    var m = /^(\d+)D$/.exec(formula);
    return m ? addDays(s, +m[1]) : s;
  }
  var MONTH_MN = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];
  function monthLabel(ym) { return MONTH_MN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }

  E.money = { parseScaled: parseScaled, roundDiv: roundDiv, toCents: toCents, fmt: fmtCents, compact: fmtCompact,
    fmtQty: fmtQty, fmtPrice: fmtPrice, fmtRatio: fmtRatio, fmtScaled: fmtScaled };
  E.dates = { fmt: fmtDate, addDays: addDays, daysBetween: daysBetween, endOfMonth: endOfMonth, calcDate: calcDate,
    monthOf: monthOf, monthLabel: monthLabel };

  // ===========================================================================
  // 2. Setup index (seed → lookups)
  // ===========================================================================
  function buildSetup() {
    var accounts = {}, list = [];
    D.coaRows.forEach(function (r) {
      var t = { P: 'POSTING', H: 'HEADING', B: 'BEGIN_TOTAL', E: 'END_TOTAL', T: 'TOTAL' }[r[1]];
      var a = { no: r[0], type: t, name: r[2], category: r[3], side: r[4], direct: r[5], totaling: r[6], indent: r[7],
        line: r[8], cf: r[9], genProd: r[10], vatProd: r[11], blocked: false,
        incomeBalance: '123'.indexOf(r[0][0]) >= 0 ? 'BALANCE_SHEET' : 'INCOME_STATEMENT' };
      accounts[a.no] = a; list.push(a);
    });
    var gps = {};
    D.generalPostingSetup.forEach(function (r) {
      gps[r[0] + '|' + r[1]] = { bus: r[0], prod: r[1], sales: r[2], salesDisc: r[3], purch: r[4], purchDisc: r[5], cogs: r[6] };
    });
    var vps = {};
    D.vatPostingSetup.forEach(function (r) {
      vps[r[0] + '|' + r[1]] = { bus: r[0], prod: r[1], calcType: r[2], category: r[3], pct: r[4], taxType: r[5],
        taxProductCode: r[6], salesAcc: r[7], purchAcc: r[8], reverseAcc: r[9], identifier: r[10] || r[3] };
    });
    var idx = function (arr) { var m = {}; arr.forEach(function (x) { m[x.no] = x; }); return m; };
    return { accounts: accounts, accountList: list, gps: gps, vps: vps,
      customers: idx(D.customers), vendors: idx(D.vendors), items: idx(D.items), banks: idx(D.bankAccounts) };
  }
  function acc(no) { return SET.accounts[no]; }
  function genPostingSetup(bus, prod) {                // D-F1: exact row first, then '*' fallback
    return SET.gps[bus + '|' + prod] || SET.gps['*|' + prod] || null;
  }
  function vatSetup(bus, prod) { return SET.vps[bus + '|' + prod] || null; }
  function bankGlAccount(bankNo) { var b = SET.banks[bankNo]; return b ? D.bankPostingGroups[b.postingGroup] : null; }
  function vatLabel(s) {
    if (!s) return '—';
    if (s.category === 'VAT10') return 'НӨАТ ' + s.pct + '%';
    return { VAT0: 'НӨАТ 0%', EXEMPT: 'Чөлөөлөгдөх', NOVAT: 'Хамрах хүрээнээс гадуур' }[s.category] || s.category;
  }
  E.setup = {
    account: function (no) { return acc(no); },
    accounts: function () { return SET.accountList; },
    genPostingSetup: genPostingSetup, vatSetup: vatSetup, bankGlAccount: bankGlAccount, vatLabel: vatLabel,
    customer: function (no) { return SET.customers[no]; }, vendor: function (no) { return SET.vendors[no]; },
    item: function (no) { return SET.items[no]; }, bank: function (no) { return SET.banks[no]; },
    receivablesAccount: function (cpg) { return D.customerPostingGroups[cpg].receivables; },
    payablesAccount: function (vpg) { return D.vendorPostingGroups[vpg].payables; }
  };

  // ===========================================================================
  // 3. State
  // ===========================================================================
  function emptyState() {
    var periods = [], vatPeriods = [];
    for (var m = 1; m <= 12; m++) {
      var ym = D.fiscalYear.year + '-' + String(m).padStart(2, '0');
      var start = ym + '-01', end = endOfMonth(start);
      periods.push({ period: ym, start: start, end: end, status: 'OPEN' });
      var nextM = m === 12 ? (D.fiscalYear.year + 1) + '-01' : D.fiscalYear.year + '-' + String(m + 1).padStart(2, '0');
      vatPeriods.push({ period: ym, start: start, end: end, due: nextM + '-' + String(D.fiscalYear.vatReturnDueDay).padStart(2, '0'),
        status: 'OPEN', settlementTx: null, settlementNet: null });
    }
    return {
      glEntries: [], transactions: [], registers: [], vatEntries: [],
      cle: [], dcle: [], vle: [], dvle: [], ble: [],
      salesInvoices: [], salesCrMemos: [], purchInvoices: [], cashVouchers: [], ebarimtDocs: [],
      drafts: [], refs: {}, periods: periods, vatPeriods: vatPeriods,
      counters: { REGISTER: 0, TRANSACTION: 0, GL_ENTRY: 0, VAT_ENTRY: 0, CLE: 0, DCLE: 0, VLE: 0, DVLE: 0, BLE: 0, APPLICATION_NO: 0, BILL_SEQ: 0, EBARIMT: 0 },
      series: {}, draftCounters: JSON.parse(JSON.stringify(D.draftCounters)), session: { b2cPrinted: 0 }
    };
  }
  function next(counter) { S.counters[counter] += 1; return S.counters[counter]; }

  function seriesNext(code, date, preview) {           // D-C7 / INV-08: gapless, yearly, date order
    var def = D.numberSeries[code];
    var year = date.slice(0, 4);
    var key = code + '|' + year;
    var st = S.series[key] || { last: 0, lastDate: null };
    if (preview) return { no: '***', error: null };
    st.last += 1; st.lastDate = date; S.series[key] = st;
    return { no: def.prefix + '-' + year + '-' + String(st.last).padStart(def.width, '0') };
  }
  function seriesCheck(code, date) {
    var st = S.series[code + '|' + date.slice(0, 4)];
    if (st && st.lastDate && st.lastDate > date) {
      return { code: 'platform.number_series_date_order', message: 'Цуврал ' + code + '-д сүүлд ' + fmtDate(st.lastDate) + '-ний огноотой дугаар олгосон тул ' + fmtDate(date) + '-ний огноо өмнө байна (ERN02).' };
    }
    if (+date.slice(0, 4) !== D.fiscalYear.year) {
      return { code: 'platform.number_series_missing_line', message: date.slice(0, 4) + ' оны цувралын мөр байхгүй (ERN01).' };
    }
    return null;
  }
  function draftNext(code) {
    S.draftCounters[code] += 1;
    var def = D.numberSeries[code];
    return def.prefix + String(S.draftCounters[code]).padStart(def.width, '0');
  }

  function periodOf(date) { return S.periods.filter(function (p) { return p.start <= date && p.end >= date; })[0] || null; }
  function vatPeriodOf(date) { return S.vatPeriods.filter(function (p) { return p.start <= date && p.end >= date; })[0] || null; }

  // ===========================================================================
  // 4. Voucher posting core (05 §5.2: assemble → validate (collect all errors) → number → write)
  // ===========================================================================
  // doc = { sourceCode, description, vouchers: [V] }
  // V   = { key, postingDate, documentType, docSeries | documentNo | sameAs, description, reasonCode, externalDocNo,
  //         gl:[{key, acc, amount, desc, origin:'USER'|'SYSTEM', genPostingType, genBus, genProd, vatBus, vatProd, vatAmount, sourceType, sourceNo}],
  //         vat:[{glKey, type, base, amount, ...snapshot}], cle:[...], vle:[...], ble:[...] }
  function validateDocument(doc) {
    var errors = [];
    var co = D.company;
    doc.vouchers.forEach(function (v) {
      var p = periodOf(v.postingDate);
      if (!p) errors.push({ code: 'gl.period_missing', message: fmtDate(v.postingDate) + ' огноонд нягтлан бодох үе байхгүй (ERP01).' });
      else if (p.status !== 'OPEN' && doc.sourceCode !== 'CLSINCOME') errors.push({ code: 'gl.period_closed', message: monthLabel(p.period) + ' хаалттай. Нээлттэй үеийн огноо сонгоно уу (D-D3, ERP01).', field: 'postingDate' });
      if (v.postingDate < co.allowPostingFrom || v.postingDate > co.allowPostingTo) errors.push({ code: 'gl.posting_date_outside_window', message: 'Огноо компанийн posting цонхноос (' + fmtDate(co.allowPostingFrom) + '–' + fmtDate(co.allowPostingTo) + ') гадуур.', field: 'postingDate' });
      if (v.docSeries) { var se = seriesCheck(v.docSeries, v.postingDate); if (se) errors.push(se); }
      var sum = 0, nonzero = 0;
      v.gl.forEach(function (l) {
        var a = acc(l.acc);
        if (!a) { errors.push({ code: 'gl.account_not_found', message: 'Данс ' + l.acc + ' олдсонгүй.' }); return; }
        if (a.type !== 'POSTING') errors.push({ code: 'gl.account_not_posting', message: 'Данс ' + a.no + ' "' + a.name + '" нь бичилт хийх данс биш (ERG01).' });
        if (a.blocked) errors.push({ code: 'gl.account_blocked', message: 'Данс ' + a.no + ' блоклогдсон.' });
        if (l.origin === 'USER' && !a.direct) errors.push({ code: 'gl.direct_posting_not_allowed', message: 'Данс ' + a.no + ' "' + a.name + '" нь хяналтын данс тул гараар бичихгүй (FR-GL-003, BR-PST-15).' });
        if (!Number.isInteger(l.amount)) errors.push({ code: 'api.internal_error', message: 'Бөөрөнхийлөгдөөгүй дүн ' + l.amount });
        sum += l.amount; if (l.amount !== 0) nonzero++;
      });
      if (sum !== 0) errors.push({ code: 'gl.voucher_unbalanced', message: 'Ваучер тэнцэхгүй байна: Σ = ' + fmtCents(sum) + ' (D-C5, ERB01).' });
      if (nonzero < 2) errors.push({ code: 'gl.voucher_too_few_lines', message: 'Ваучер дор хаяж 2 тэг биш мөртэй байна (BR-PST-24).' });
      (v.vat || []).forEach(function (x) {
        if (x.type === 'SETTLEMENT') return;
        var vp = vatPeriodOf(x.vatDate || v.postingDate);
        if (vp && vp.status !== 'OPEN') errors.push({ code: 'tax.vat_period_closed', message: 'НӨАТ-ын үе ' + monthLabel(vp.period) + ' ' + (vp.status === 'SUBMITTED' ? 'илгээгдсэн' : 'хаагдсан') + ' (ERV01).' });
      });
      (v.ble || []).forEach(function (b) {
        var bank = SET.banks[b.bank];
        if (bank && bank.preventNegative) {
          var bal = bankBalance(b.bank, v.postingDate) + b.amount;
          var finalBal = bankBalance(b.bank) + b.amount;
          if (bal < 0 || finalBal < 0) errors.push({ code: 'bank.cash_negative_balance', message: bank.name + '-ын үлдэгдэл сөрөг болно (' + fmtCents(Math.min(bal, finalBal), { sym: true }) + '). D-G1, ERC01.' });
        }
      });
    });
    return errors;
  }

  function commitDocument(doc, preview) {
    var res = { registerNo: next('REGISTER'), vouchers: [] };
    var fromGl = S.counters.GL_ENTRY + 1, fromVat = S.counters.VAT_ENTRY + 1;
    var byKey = {};
    var appNo = null;
    doc.vouchers.forEach(function (v) {
      var tx = next('TRANSACTION');
      var docNo = v.documentNo;
      if (v.sameAs) docNo = byKey[v.sameAs].documentNo;
      else if (v.docSeries) docNo = seriesNext(v.docSeries, v.postingDate, preview && D.numberSeries[v.docSeries].gapless).no;
      var out = { key: v.key, transactionNo: tx, documentNo: docNo, documentType: v.documentType, postingDate: v.postingDate,
        gl: [], vat: [], cle: [], dcle: [], vle: [], dvle: [], ble: [], cashVoucher: null };
      byKey[v.key] = out;
      var glMap = {};
      v.gl.forEach(function (l) {
        if (l.amount === 0) return;                     // BR-PST-24
        var e = { entryNo: next('GL_ENTRY'), transactionNo: tx, registerNo: res.registerNo, postingDate: v.postingDate,
          documentType: v.documentType, documentNo: docNo, account: l.acc, description: l.desc || v.description || '',
          amount: l.amount, sourceCode: doc.sourceCode, genPostingType: l.genPostingType || 'NONE',
          genBus: l.genBus || null, genProd: l.genProd || null, vatBus: l.vatBus || null, vatProd: l.vatProd || null,
          vatAmount: l.vatAmount || 0, sourceType: l.sourceType || null, sourceNo: l.sourceNo || null,
          reasonCode: v.reasonCode || null, externalDocNo: v.externalDocNo || null, reversed: false, reversedByTx: null, isClosing: false };
        glMap[l.key] = e.entryNo;
        S.glEntries.push(e); out.gl.push(e);
      });
      (v.vat || []).forEach(function (x) {
        var e = { entryNo: next('VAT_ENTRY'), transactionNo: tx, glEntryNo: glMap[x.glKey] || null, type: x.type,
          postingDate: v.postingDate, vatDate: x.vatDate || v.postingDate, documentType: v.documentType, documentNo: docNo,
          base: x.base, amount: x.amount, nonDeductibleBase: 0, nonDeductibleAmount: 0,
          vatBus: x.vatBus, vatProd: x.vatProd, category: x.category, calcType: x.calcType || 'NORMAL', pct: x.pct, taxType: x.taxType,
          partyNo: x.partyNo || null, partyTin: x.partyTin || null, deductibleConfirmed: !!x.deductibleConfirmed,
          supplierDdtd: x.supplierDdtd || null, closed: false, closedByEntryNo: null, vatReturnPeriod: null, reversed: false };
        S.vatEntries.push(e); out.vat.push(e);
        if (x.closes) {                                     // entry numbers, resolved in the current state (a preview copy stays a copy)
          var cl = {}; x.closes.forEach(function (no) { cl[no] = true; });
          S.vatEntries.forEach(function (o) { if (cl[o.entryNo]) { o.closed = true; o.closedByEntryNo = e.entryNo; o.vatReturnPeriod = x.period; } });
          e.vatReturnPeriod = x.period;
        }
      });
      (v.cle || []).forEach(function (c) {
        var e = { entryNo: next('CLE'), customer: c.customer, postingDate: v.postingDate, documentType: c.docType, documentNo: docNo,
          description: c.description || v.description || '', amount: c.amount, remaining: c.amount, open: c.amount !== 0,
          dueDate: c.dueDate || v.postingDate, cpg: c.cpg, transactionNo: tx, extDoc: c.extDoc || v.externalDocNo || null,
          ref: c.ref || null, closedByEntryNo: null, closedAtDate: null, reversed: false, glEntryNo: glMap[c.glKey] || null };
        S.cle.push(e); out.cle.push(e);
        if (c.ref) S.refs[c.ref] = { kind: 'CLE', entryNo: e.entryNo };
        var d = { entryNo: next('DCLE'), cleEntryNo: e.entryNo, entryType: 'INITIAL', postingDate: v.postingDate, documentType: c.docType,
          documentNo: docNo, amount: c.amount, customer: c.customer, applicationNo: null, appliedCleEntryNo: null, transactionNo: tx, unapplied: false, cpg: c.cpg };
        S.dcle.push(d); out.dcle.push(d);
      });
      (v.vle || []).forEach(function (c) {
        var e = { entryNo: next('VLE'), vendor: c.vendor, postingDate: v.postingDate, documentType: c.docType, documentNo: docNo,
          vendorInvoiceNo: c.vendorInvoiceNo || null, description: c.description || v.description || '', amount: c.amount, remaining: c.amount,
          open: c.amount !== 0, dueDate: c.dueDate || v.postingDate, vpg: c.vpg, transactionNo: tx, ref: c.ref || null,
          closedByEntryNo: null, closedAtDate: null, reversed: false, glEntryNo: glMap[c.glKey] || null };
        S.vle.push(e); out.vle.push(e);
        if (c.ref) S.refs[c.ref] = { kind: 'VLE', entryNo: e.entryNo };
        var d = { entryNo: next('DVLE'), vleEntryNo: e.entryNo, entryType: 'INITIAL', postingDate: v.postingDate, documentType: c.docType,
          documentNo: docNo, amount: c.amount, vendor: c.vendor, applicationNo: null, appliedVleEntryNo: null, transactionNo: tx, unapplied: false, vpg: c.vpg };
        S.dvle.push(d); out.dvle.push(d);
      });
      (v.ble || []).forEach(function (b) {
        var cv = null;
        if (b.cashVoucher) {
          var cvNo = (v.docSeries === b.cashVoucher) ? docNo : seriesNext(b.cashVoucher, v.postingDate, preview).no;
          cv = { no: cvNo, kind: b.cashVoucher === 'KO' ? 'RECEIPT' : 'PAYMENT', bank: b.bank, postingDate: v.postingDate, amount: Math.abs(b.amount),
            party: b.party || null, purpose: b.description || v.description || '', transactionNo: tx, documentNo: docNo };
          S.cashVouchers.push(cv); out.cashVoucher = cv;
        }
        var e = { entryNo: next('BLE'), bank: b.bank, postingDate: v.postingDate, documentType: v.documentType, documentNo: docNo,
          description: b.description || v.description || '', amount: b.amount, transactionNo: tx, party: b.party || null,
          cashVoucherNo: cv ? cv.no : null, statementStatus: 'OPEN', cfOverride: b.cf || null, reversed: false, glEntryNo: glMap[b.glKey] || null };
        S.ble.push(e); out.ble.push(e);
      });
      S.transactions.push({ transactionNo: tx, registerNo: res.registerNo, postingDate: v.postingDate, documentType: v.documentType,
        documentNo: docNo, sourceCode: doc.sourceCode, description: v.description || doc.description || '', reversed: false, reversesTx: null });
      // applications inside the posting (BR-AR-25: transaction_no = this voucher)
      (v.cle || []).forEach(function (c, i) {
        if (c.applyTo === undefined || c.applyTo === null) return;
        var target = typeof c.applyTo === 'object' ? byKey[c.applyTo.voucher].cle[c.applyTo.index] : findCle(c.applyTo);
        if (!target) return;
        if (appNo === null) appNo = next('APPLICATION_NO');
        applyPair('C', out.cle[i], target, v.postingDate, tx, appNo, out.dcle, c.applyMax);
      });
      (v.vle || []).forEach(function (c, i) {
        if (c.applyTo === undefined || c.applyTo === null) return;
        var target = typeof c.applyTo === 'object' ? byKey[c.applyTo.voucher].vle[c.applyTo.index] : findVle(c.applyTo);
        if (!target) return;
        if (appNo === null) appNo = next('APPLICATION_NO');
        applyPair('V', out.vle[i], target, v.postingDate, tx, appNo, out.dvle, c.applyMax);
      });
      res.vouchers.push(out);
    });
    S.registers.push({ no: res.registerNo, sourceCode: doc.sourceCode, fromEntryNo: fromGl, toEntryNo: S.counters.GL_ENTRY,
      fromVatEntryNo: S.counters.VAT_ENTRY >= fromVat ? fromVat : null, toVatEntryNo: S.counters.VAT_ENTRY >= fromVat ? S.counters.VAT_ENTRY : null });
    return res;
  }

  function findCle(entryNo) { return S.cle.filter(function (e) { return e.entryNo === entryNo; })[0] || null; }
  function findVle(entryNo) { return S.vle.filter(function (e) { return e.entryNo === entryNo; })[0] || null; }

  // 06 §6.11 / BR-AR-22..23: a = min(|New.remaining|, |Old.remaining|); Old row −sign(Old)·a, New row +sign(Old)·a
  function applyPair(kind, newE, oldE, date, tx, appNo, outRows, cap) {
    if (!newE.open || !oldE.open) return 0;
    if (Math.sign(newE.remaining) === Math.sign(oldE.remaining)) return 0;    // BR-AR-20
    var a = Math.min(Math.abs(newE.remaining), Math.abs(oldE.remaining));
    if (cap) a = Math.min(a, cap);
    if (a <= 0) return 0;
    var sOld = Math.sign(oldE.remaining);
    var mk = function (entry, amount, other) {
      var base = { entryType: 'APPLICATION', postingDate: date, documentType: newE.documentType, documentNo: newE.documentNo,
        amount: amount, applicationNo: appNo, transactionNo: tx, unapplied: false };
      if (kind === 'C') { base.entryNo = next('DCLE'); base.cleEntryNo = entry.entryNo; base.customer = entry.customer; base.appliedCleEntryNo = other.entryNo; base.cpg = entry.cpg; S.dcle.push(base); }
      else { base.entryNo = next('DVLE'); base.vleEntryNo = entry.entryNo; base.vendor = entry.vendor; base.appliedVleEntryNo = other.entryNo; base.vpg = entry.vpg; S.dvle.push(base); }
      if (outRows) outRows.push(base);
      entry.remaining += amount;
      entry.open = entry.remaining !== 0;
      if (!entry.open) { entry.closedByEntryNo = other.entryNo; entry.closedAtDate = date; }
    };
    mk(oldE, -sOld * a, newE);
    mk(newE, sOld * a, oldE);
    return a;
  }

  // public posting entry point: returns {ok, errors, result}; preview runs the same code on a copy (ROLLBACK, D-C6)
  function post(doc, opts) {
    opts = opts || {};
    var errors = validateDocument(doc).concat(opts.extraErrors || []);
    if (errors.length) return { ok: false, errors: errors };
    if (opts.preview) {
      var saved = S;
      S = JSON.parse(JSON.stringify(S));
      var r;
      try { r = commitDocument(doc, true); } finally { S = saved; }
      return { ok: true, errors: [], result: r, preview: true };
    }
    return { ok: true, errors: [], result: commitDocument(doc, false) };
  }
  E.post = post;

  // ===========================================================================
  // 5. Document calculation (06 §6: line amounts, VAT per identifier, remainder allocation)
  // ===========================================================================
  // doc: { side:'SALE'|'PURCHASE', docType, pricesInclVat, vatBus, genBus, lines:[{type, no, description, qty, price, disc, vatProd, genProd}] }
  function calcDocument(doc) {
    var errors = [], warnings = [];
    var lines = doc.lines.map(function (l, idx) {
      var out = { idx: idx, lineNo: (idx + 1) * 10000, type: l.type, no: l.no, description: l.description || '', qtyStr: l.qty, priceStr: l.price, discStr: l.disc || '0' };
      if (!l.no) {                                          // blank line: ignored (BR-PST-10 "EmptyLine")
        out.blank = true; out.qty = 0n; out.price = 0n; out.disc = 0n; out.G = 0; out.LDA = 0; out.LA = 0; out.pct = 0; out.vat = null; out.account = null;
        return out;
      }
      var qty = parseScaled(l.qty || '0', 5), price = parseScaled(l.price || '0', 6), disc = parseScaled(l.disc || '0', 5);
      if (qty === null || qty < 0n) { errors.push({ code: 'api.invalid_quantity', message: 'Мөр ' + (idx + 1) + ': тоо хэмжээ буруу.', line: idx }); qty = 0n; }
      if (price === null) { errors.push({ code: 'api.invalid_price', message: 'Мөр ' + (idx + 1) + ': нэгжийн үнэ буруу.', line: idx }); price = 0n; }
      if (disc === null || disc < 0n || disc > 100n * TEN(5)) { errors.push({ code: 'sales.invalid_discount', message: 'Мөр ' + (idx + 1) + ': хөнгөлөлтийн хувь 0–100.', line: idx }); disc = 0n; }
      out.qty = qty; out.price = price; out.disc = disc;
      var item = l.type === 'ITEM' ? SET.items[l.no] : null;
      var a = l.type === 'GL_ACCOUNT' ? acc(l.no) : null;
      if (l.type === 'ITEM' && !item) errors.push({ code: 'inv.item_not_found', message: 'Мөр ' + (idx + 1) + ': бараа олдсонгүй.', line: idx });
      if (l.type === 'GL_ACCOUNT') {
        if (!a) errors.push({ code: 'gl.account_not_found', message: 'Мөр ' + (idx + 1) + ': данс олдсонгүй.', line: idx });
        else if (a.type !== 'POSTING') errors.push({ code: 'gl.account_not_posting', message: 'Мөр ' + (idx + 1) + ': ' + a.no + ' бичилт хийх данс биш.', line: idx });
        else if (!a.direct) errors.push({ code: 'gl.direct_posting_not_allowed', message: 'Мөр ' + (idx + 1) + ': ' + a.no + ' "' + a.name + '" хяналтын данс (BR-SAL-11).', line: idx });
      }
      if (price < 0n && l.type === 'ITEM') errors.push({ code: 'sales.negative_line_not_allowed', message: 'Мөр ' + (idx + 1) + ': барааны мөрөнд сөрөг үнэ хориотой (BR-SAL-14).', line: idx });
      out.genProd = l.genProd || (item ? item.genProd : a ? a.genProd : null);
      out.vatProd = l.vatProd || (item ? item.vatProd : a ? a.vatProd : null);
      out.uom = item ? item.uom : null;
      out.uomName = item ? D.unitsOfMeasure[item.uom] : '';
      out.bunaa = l.classificationCode || (item ? item.bunaa : D.ebarimtSetup.defaultClassificationCode);   // MAP-31: line → item → setup default
      out.barcode = item ? item.barcode : null;
      out.barcodeType = item ? item.barcodeType : 'UNDEFINED';
      out.taxProductCode = item ? item.taxProductCode : null;
      if (!out.description) out.description = item ? item.name : a ? a.name : '';
      var setup = vatSetup(doc.vatBus, out.vatProd);
      if (!setup && (item || a)) errors.push({ code: 'tax.vat_posting_setup_missing', message: 'Мөр ' + (idx + 1) + ': НӨАТ-ын тохиргоо (' + doc.vatBus + ' × ' + out.vatProd + ') байхгүй (BR-SAL-24).', line: idx });
      if (setup && doc.side === 'SALE' && setup.calcType !== 'NORMAL') errors.push({ code: 'sales.vat_calculation_type_not_allowed', message: 'Мөр ' + (idx + 1) + ': борлуулалтад зөвхөн NORMAL НӨАТ (BR-SAL-15).', line: idx });
      out.vat = setup;
      var gps = out.genProd ? genPostingSetup(doc.genBus, out.genProd) : null;
      if ((item || a) && !gps) errors.push({ code: 'sales.gen_posting_setup_missing', message: 'Мөр ' + (idx + 1) + ': General Posting Setup (' + doc.genBus + ' × ' + out.genProd + ') байхгүй (BR-SAL-41).', line: idx });
      out.gps = gps;
      out.account = l.type === 'GL_ACCOUNT' ? l.no : (gps ? (doc.side === 'SALE' ? gps.sales : gps.purch) : null);
      // C1–C3 (06 §6.2): G = r(Qty × UnitPrice); LDA = r(G × LD% / 100); LA = G − LDA
      var g = roundDiv(qty * price, TEN(9));               // qty·1e5 × price·1e6 = 1e11 → cents (1e2)
      var lda = roundDiv(g * disc, 100n * TEN(5));
      out.G = Number(g); out.LDA = Number(lda); out.LA = Number(g - lda);
      out.pct = setup ? setup.pct : 0;
      return out;
    });

    // VAT groups (BR-SAL-22, BR-TAX-18): key = (vat identifier, calc type, sign); order identifier → calc type → negative first.
    // The identifier comes from the VAT posting setup (seed: VAT10, VAT0, EXEMPT, NOVAT, RC10, CUSTOMS), not from the category:
    // a reverse-charge or customs line is never grouped (or carried) with an ordinary VAT10 line (D-E3).
    var groups = {};
    lines.forEach(function (l) {
      if (!l.vat || l.LA === 0) return;                    // BR-TAX-22: CLA = 0 line is not grouped, VAT 0
      var sign = l.LA >= 0 ? '+' : '-';
      var k = l.vat.identifier + '|' + l.vat.calcType + '|' + sign;
      if (!groups[k]) groups[k] = { key: k, identifier: l.vat.identifier, category: l.vat.category, pct: l.vat.pct,
        calcType: l.vat.calcType, sign: sign, label: vatLabel(l.vat), lines: [], total: 0 };
      groups[k].lines.push(l); groups[k].total += l.LA;
    });
    var order = Object.keys(groups).sort(function (a, b) {
      var A = groups[a], B = groups[b];
      if (A.identifier !== B.identifier) return A.identifier < B.identifier ? -1 : 1;
      if (A.calcType !== B.calcType) return A.calcType < B.calcType ? -1 : 1;
      return A.sign === '-' ? -1 : 1;
    });
    var carry = {};   // per (identifier, calc type): numerator over den (§6.5)
    var glist = order.map(function (k) {
      var g = groups[k], r = BigInt(g.pct);
      var den = doc.pricesInclVat ? (100n + r) : 100n;
      var total = BigInt(g.total);
      var ck = g.identifier + '|' + g.calcType;
      var carryIn = carry[ck] || 0n;
      var exactNum = total * r + carryIn;                    // exact VAT = exactNum / den (cents)
      var vat = roundDiv(exactNum, den);
      if (g.sign === '-') carry[ck] = exactNum - vat * den;
      g.den = den; g.exactNum = exactNum; g.carryIn = carryIn; g.vat = Number(vat);
      g.base = doc.pricesInclVat ? g.total - g.vat : g.total;
      g.aiv = doc.pricesInclVat ? g.total : g.total + g.vat;
      // running remainder allocation (BC DivideAmount)
      var rem = 0n, D0 = total;
      g.alloc = [];
      g.lines.forEach(function (l) {
        var before = rem;
        var vi = 0n;
        if (D0 !== 0n) { rem += vat * BigInt(l.LA); vi = roundDiv(rem, D0); rem -= vi * D0; }
        l.vatAmount = Number(vi);
        if (doc.pricesInclVat) { l.aiv = l.LA; l.amount = l.LA - l.vatAmount; } else { l.amount = l.LA; l.aiv = l.LA + l.vatAmount; }
        g.alloc.push({ line: l.idx, shareNum: vat * BigInt(l.LA), den: D0, remBefore: before, vat: l.vatAmount, remAfter: rem });
      });
      return g;
    });
    var amount = 0, vatAmount = 0, aiv = 0;
    lines.forEach(function (l) { if (l.amount === undefined) { l.amount = l.LA; l.vatAmount = 0; l.aiv = l.LA; } amount += l.amount; vatAmount += l.vatAmount; aiv += l.aiv; });
    var byId = {};
    glist.forEach(function (g) { var b = byId[g.label] || (byId[g.label] = { label: g.label, base: 0, vat: 0 }); b.base += g.base; b.vat += g.vat; });
    return { lines: lines, groups: glist, amount: amount, vatAmount: vatAmount, amountInclVat: aiv,
      vatByIdentifier: Object.keys(byId).map(function (k) { return byId[k]; }), errors: errors, warnings: warnings, pricesInclVat: !!doc.pricesInclVat };
  }
  E.calcDocument = calcDocument;

  // BR-SAL-13: item price → document price mode; unit price precision 0.00001 (ru)
  function itemPriceFor(item, docPiv, vatBus) {
    var p = parseScaled(item.price, 6);
    if (!!item.piv === !!docPiv) return fmtScaled(p, 6, 0, 6).replace(/ /g, '');
    var s = vatSetup(vatBus, item.vatProd), r = BigInt(s ? s.pct : 0);
    var conv = docPiv ? roundDiv(p * (100n + r), 100n * 10n) * 10n : roundDiv(p * 100n, (100n + r) * 10n) * 10n;
    return fmtScaled(conv, 6, 0, 6).replace(/ /g, '');
  }
  E.itemPriceFor = itemPriceFor;

  // ===========================================================================
  // 6. Sales documents: drafts, preview, post (06 §5.6–5.11)
  // ===========================================================================
  function customerBalance(no, asOf) {
    return S.dcle.filter(function (d) { return d.customer === no && (!asOf || d.postingDate <= asOf); })
      .reduce(function (s, d) { return s + d.amount; }, 0);
  }
  function decideEbarimtType(requested, cust) {        // 12 §4.2 (R1: *_RECEIPT only)
    if (requested && requested !== 'AUTO') return requested;
    var def = cust.ebarimt || 'AUTO';
    if (def === 'B2B') return 'B2B_RECEIPT';
    if (def === 'B2C') return 'B2C_RECEIPT';
    if (def === 'NONE') return 'NONE';
    return (cust.kind === 'LEGAL' && cust.tin && /^\d{11}$/.test(cust.tin)) ? 'B2B_RECEIPT' : 'B2C_RECEIPT';
  }
  E.decideEbarimtType = decideEbarimtType;

  function snapshotCustomer(d, custNo) {               // BR-SAL-02
    var c = SET.customers[custNo];
    d.customer = custNo;
    d.customerName = c.name;
    d.cpg = c.cpg; d.genBus = c.genBus; d.vatBus = c.vatBus;
    d.terms = c.terms; d.method = c.method; d.piv = !!c.piv;
    d.ebarimtType = 'AUTO';
    d.dueDate = null;
  }
  function newDraft(custNo, opts) {
    opts = opts || {};
    var d = { no: opts.no || draftNext(opts.docType === 'CREDIT_MEMO' ? 'SC_DRAFT' : 'SI_DRAFT'), docType: opts.docType || 'INVOICE', status: 'OPEN',
      documentDate: opts.documentDate || D.meta.workDate, postingDate: opts.postingDate || D.meta.workDate, dueDate: null,
      lines: [], consumerNo: '', createdBy: opts.createdBy || 'U2', note: opts.note || '', appliesTo: opts.appliesTo || null, reason: opts.reason || null };
    if (custNo) snapshotCustomer(d, custNo);
    (opts.lines || []).forEach(function (l) { d.lines.push(newLine(d, l)); });
    return d;
  }
  function newLine(d, l) {
    var line = { type: l.type || 'ITEM', no: l.no || '', description: l.description || '', qty: l.qty || '1', price: l.price, disc: l.disc || '0', vatProd: l.vatProd || null };
    if (l.classificationCode) line.classificationCode = l.classificationCode;
    if (line.type === 'ITEM' && line.no && SET.items[line.no]) {
      var it = SET.items[line.no];
      if (line.price === undefined || line.price === null) line.price = itemPriceFor(it, d.piv, d.vatBus || 'DOMESTIC');
      if (!line.description) line.description = it.name;
    } else if (line.type === 'GL_ACCOUNT' && line.no && acc(line.no)) {
      if (!line.description) line.description = acc(line.no).name;
    }
    if (line.price === undefined || line.price === null) line.price = '0';
    return line;
  }
  function draftDueDate(d) {
    if (d.dueDate) return d.dueDate;
    if (d.docType === 'CREDIT_MEMO') return d.documentDate;                // BR-SAL-05
    var t = D.paymentTerms[d.terms];
    return calcDate(t ? t.formula : '0D', d.documentDate);
  }
  function calcDraft(d) {
    return calcDocument({ side: 'SALE', docType: d.docType, pricesInclVat: d.piv, vatBus: d.vatBus || 'DOMESTIC', genBus: d.genBus || 'DOMESTIC', lines: d.lines });
  }

  E.drafts = {
    list: function () { return S.drafts; },
    get: function (no) { return S.drafts.filter(function (d) { return d.no === no; })[0] || null; },
    create: function (custNo, opts) { var d = newDraft(custNo, opts); S.drafts.push(d); return d; },
    setCustomer: function (d, custNo) {                  // BR-SAL-04: groups re-snapshotted, prices unchanged
      snapshotCustomer(d, custNo);
    },
    setPricesInclVat: function (d, piv, recalcPrices) { // BR-SAL-27
      if (!!d.piv === !!piv) return;
      if (recalcPrices) {
        d.lines.forEach(function (l) {
          var s = vatSetup(d.vatBus, l.vatProd || (l.type === 'ITEM' ? (SET.items[l.no] || {}).vatProd : (acc(l.no) || {}).vatProd));
          var r = BigInt(s ? s.pct : 0), p = parseScaled(l.price, 6);
          if (p === null) return;
          var conv = piv ? roundDiv(p * (100n + r), 100n * 10n) * 10n : roundDiv(p * 100n, (100n + r) * 10n) * 10n;
          l.price = fmtScaled(conv, 6, 0, 6).replace(/ /g, '');
        });
      }
      d.piv = !!piv;
    },
    addLine: function (d, l) { var line = newLine(d, l || {}); d.lines.push(line); return line; },
    setLineNo: function (d, i, type, no) {
      var old = d.lines[i];
      d.lines[i] = newLine(d, { type: type, no: no, qty: old ? old.qty : '1', disc: old ? old.disc : '0' });
    },
    removeLine: function (d, i) { d.lines.splice(i, 1); },
    remove: function (no) { S.drafts = S.drafts.filter(function (d) { return d.no !== no; }); },   // BR-SAL-08: no gap in legal series
    dueDate: draftDueDate,
    calc: calcDraft,
    resolvedEbarimtType: function (d) { var c = SET.customers[d.customer]; return c ? decideEbarimtType(d.ebarimtType, c) : null; }
  };

  // assemble the posting document for a sales draft (06 §5.7)
  function assembleSales(d, calc, ctx) {
    var cust = SET.customers[d.customer];
    var isInv = d.docType === 'INVOICE';
    var s = isInv ? -1 : 1;                                 // revenue/VAT sign: invoice credit
    var recAcc = D.customerPostingGroups[d.cpg].receivables;
    var desc = (isInv ? 'Нэхэмжлэх ' : 'Кредит нот ') + cust.name;
    var V1 = { key: 'V1', postingDate: d.postingDate, documentType: isInv ? 'INVOICE' : 'CREDIT_MEMO', docSeries: isInv ? 'SI' : 'SC',
      description: desc, reasonCode: d.reason || null, gl: [], vat: [], cle: [], ble: [] };
    var buf = {}, order = [];
    calc.lines.forEach(function (l) {
      if (l.qty === 0n || !l.account) return;
      var k = [l.account, d.genBus, l.genProd, d.vatBus, l.vatProd].join('|');
      if (!buf[k]) { buf[k] = { acc: l.account, genProd: l.genProd, vatProd: l.vatProd, setup: l.vat, amount: 0, vat: 0, user: l.type === 'GL_ACCOUNT' }; order.push(k); }
      buf[k].amount += l.amount; buf[k].vat += l.vatAmount;
    });
    order.forEach(function (k, i) {
      var b = buf[k];
      V1.gl.push({ key: 'B' + i, acc: b.acc, amount: s * b.amount, origin: b.user ? 'USER' : 'SYSTEM', genPostingType: 'SALE',
        genBus: d.genBus, genProd: b.genProd, vatBus: d.vatBus, vatProd: b.vatProd, vatAmount: s * b.vat, desc: desc });
      if (b.vat !== 0) V1.gl.push({ key: 'BV' + i, acc: b.setup.salesAcc, amount: s * b.vat, origin: 'SYSTEM', desc: 'НӨАТ ' + desc });
      V1.vat.push({ glKey: 'B' + i, type: 'SALE', base: s * b.amount, amount: s * b.vat, vatBus: d.vatBus, vatProd: b.vatProd,
        category: b.setup.category, calcType: b.setup.calcType, pct: b.setup.pct, taxType: b.setup.taxType,
        partyNo: cust.no, partyTin: cust.kind === 'LEGAL' ? cust.tin : null });
    });
    var total = calc.amountInclVat;
    V1.gl.push({ key: 'AR', acc: recAcc, amount: -s * total, origin: 'SYSTEM', sourceType: 'CUSTOMER', sourceNo: cust.no, desc: desc });
    var cleLine = { glKey: 'AR', customer: cust.no, docType: V1.documentType, amount: -s * total, dueDate: draftDueDate(d), cpg: d.cpg, description: desc, ref: ctx && ctx.ref };
    if (!isInv && ctx && ctx.applyToEntryNo) cleLine.applyTo = ctx.applyToEntryNo;   // BR-SAL-63
    V1.cle.push(cleLine);
    var doc = { sourceCode: 'SALES', description: desc, vouchers: [V1] };
    var pm = D.paymentMethods[d.method];
    if (pm && pm.balBank) {                                   // D-F5 / BR-SAL-50..56: second voucher, same document no
      var bankAcc = bankGlAccount(pm.balBank);
      var cashKind = SET.banks[pm.balBank].kind === 'CASH';
      var V2 = { key: 'V2', sameAs: 'V1', postingDate: d.postingDate, documentType: isInv ? 'PAYMENT' : 'REFUND', description: (isInv ? 'Бэлэн төлбөр ' : 'Бэлэн буцаалт ') + cust.name,
        gl: [{ key: 'CASH', acc: bankAcc, amount: -s * total, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: pm.balBank },
          { key: 'AR2', acc: recAcc, amount: s * total, origin: 'SYSTEM', sourceType: 'CUSTOMER', sourceNo: cust.no }],
        cle: [{ glKey: 'AR2', customer: cust.no, docType: isInv ? 'PAYMENT' : 'REFUND', amount: s * total, dueDate: d.postingDate, cpg: d.cpg, applyTo: { voucher: 'V1', index: 0 } }],
        ble: [{ glKey: 'CASH', bank: pm.balBank, amount: -s * total, party: cust.name, description: (isInv ? 'Борлуулалтын орлого ' : 'Буцаалт ') + cust.name, cashVoucher: cashKind ? (isInv ? 'KO' : 'KZ') : null }] };
      doc.vouchers.push(V2);
      doc.sourceCode = 'SALES';
    }
    return doc;
  }

  function salesPrecheck(d, calc) {                       // BR-SAL-03, 33, 36, 37, 39, 64; eBarimt VAL (12 §8 subset)
    var errs = calc.errors.slice(), warns = [];
    var cust = SET.customers[d.customer];
    if (!cust) { errs.push({ code: 'sales.customer_required', message: 'Харилцагч сонгоно уу.', field: 'customer' }); return { errors: errs, warnings: warns }; }
    if (!d.postingDate) errs.push({ code: 'sales.posting_date_required', message: 'Бүртгэлийн огноо заавал (BR-SAL-33).', field: 'postingDate' });
    var real = calc.lines.filter(function (l) { return l.qty !== 0n; });
    if (!real.length) errs.push({ code: 'sales.no_lines', message: 'Дор хаяж нэг мөр (тоо > 0) оруулна уу (BR-SAL-36).' });
    else if (calc.amountInclVat === 0) errs.push({ code: 'sales.document_total_zero', message: 'Нийт дүн 0 баримт батлагдахгүй (BR-SAL-37).' });
    else if (calc.amountInclVat < 0) errs.push({ code: 'sales.negative_total', message: 'Нийт дүн сөрөг байна; кредит нот ашиглана уу (BR-SAL-36).' });
    if (d.documentDate && d.postingDate && d.dueDate && d.dueDate < d.documentDate) errs.push({ code: 'sales.due_date_before_document_date', message: 'Төлөх огноо баримтын огнооноос өмнө байж болохгүй (BR-SAL-05).', field: 'dueDate' });
    var type = decideEbarimtType(d.ebarimtType, cust);
    if (type === 'B2B_RECEIPT' && !(cust.tin && /^\d{11}$/.test(cust.tin))) errs.push({ code: 'ebarimt.customer_tin_required', message: 'B2B баримтад худалдан авагчийн 11 оронтой ТТД заавал.', field: 'ebarimtType' });
    if (d.consumerNo && type === 'B2C_RECEIPT' && !/^\d{8}$/.test(d.consumerNo)) errs.push({ code: 'ebarimt.consumer_no_invalid', message: 'Иргэний eBarimt дугаар 8 оронтой байна.', field: 'consumerNo' });
    if (D.ebarimtSetup.enabled && type !== 'NONE') {
      real.forEach(function (l) {
        if (!/^\d{7}$/.test(l.bunaa || '')) errs.push({ code: 'ebarimt.classification_code_missing', message: 'Мөр ' + (l.idx + 1) + ': БҮНА код (7 орон) байхгүй (MAP-30).', line: l.idx });
        if (l.vat && l.vat.taxType !== 'VAT_ABLE' && !(l.taxProductCode || (l.vat.taxProductCode && l.vat.taxProductCode !== 'TBD')))
          errs.push({ code: 'ebarimt.tax_product_code_required', message: 'Мөр ' + (l.idx + 1) + ': ' + l.vat.taxType + ' мөрөнд taxProductCode заавал (VAL-09).', line: l.idx });
      });
    }
    var pm = D.paymentMethods[d.method];
    if (d.docType === 'INVOICE' && !(pm && pm.balBank) && Number(cust.creditLimit ? toCents(cust.creditLimit) : 0) > 0) {
      var bal = customerBalance(cust.no);
      if (bal + calc.amountInclVat > toCents(cust.creditLimit)) warns.push({ code: 'sales.credit_limit_exceeded', message: 'Зээлийн хязгаар (' + fmtCents(toCents(cust.creditLimit), { sym: true }) + ') хэтэрнэ: үлдэгдэл + энэ нэхэмжлэх = ' + fmtCents(bal + calc.amountInclVat, { sym: true }) + ' (BR-SAL-39).' });
    }
    if (pm && pm.balBank && draftDueDate(d) > d.postingDate) warns.push({ code: 'sales.immediate_payment_with_credit_terms', message: 'Бэлэн төлбөртэй боловч төлөх огноо хойш байна (BR-SAL-50).' });
    return { errors: errs, warnings: warns };
  }

  function postSalesDraft(d, opts) {
    opts = opts || {};
    var calc = calcDraft(d);
    var pc = salesPrecheck(d, calc);
    var ctx = { ref: opts.ref || null };
    var target = null;
    if (d.docType === 'CREDIT_MEMO' && d.appliesTo) {
      target = S.salesInvoices.filter(function (x) { return x.no === d.appliesTo; })[0];
      if (target) ctx.applyToEntryNo = target.cleEntryNo;
    }
    if (pc.errors.length) return { ok: false, errors: pc.errors, warnings: pc.warnings, calc: calc };
    var doc = assembleSales(d, calc, ctx);
    var r = post(doc, { preview: opts.preview });
    if (!r.ok) return { ok: false, errors: r.errors, warnings: pc.warnings, calc: calc };
    var type = decideEbarimtType(d.ebarimtType, SET.customers[d.customer]);
    if (opts.preview) {
      var pseudo = buildPostedSales(d, calc, r.result, type, true);
      return { ok: true, preview: true, result: r.result, calc: calc, warnings: pc.warnings, posted: pseudo,
        ebarimtRequest: type === 'NONE' ? null : buildReceiptRequest(pseudo, null, { billSeq: S.counters.BILL_SEQ + 1 }) };
    }
    var posted = buildPostedSales(d, calc, r.result, type, false);
    S.drafts = S.drafts.filter(function (x) { return x.no !== d.no; });
    var eb = null, printPayload = null;
    if (type !== 'NONE' && D.ebarimtSetup.enabled) {
      var ebr = ebarimtEnqueue(posted, { scenario: opts.ebarimt, error: opts.ebarimtError, interactive: opts.interactive, target: target });
      eb = ebr.doc; printPayload = ebr.printPayload;
    }
    return { ok: true, result: r.result, calc: calc, warnings: pc.warnings, posted: posted, ebarimt: eb, printPayload: printPayload };
  }

  function buildPostedSales(d, calc, res, type, preview) {
    var cust = SET.customers[d.customer];
    var v1 = res.vouchers[0];
    var p = { no: v1.documentNo, draftNo: d.no, docType: d.docType, customer: cust.no, customerName: cust.name, customerTin: cust.tin,
      postingDate: d.postingDate, documentDate: d.documentDate, dueDate: draftDueDate(d), vatDate: d.postingDate,
      terms: d.terms, method: d.method, piv: d.piv, cpg: d.cpg, genBus: d.genBus, vatBus: d.vatBus,
      lines: calc.lines.map(function (l) {
        return { lineNo: l.lineNo, type: l.type, no: l.no, description: l.description, qty: fmtQty(l.qty).replace(/ /g, ''), uom: l.uom, uomName: l.uomName,
          unitPrice: fmtScaled(l.price, 6, 2, 6).replace(/ /g, ''), disc: fmtScaled(l.disc, 5, 0, 5), G: l.G, LDA: l.LDA, lineAmount: l.LA,
          amount: l.amount, vat: l.vatAmount, aiv: l.aiv, vatProd: l.vatProd, genProd: l.genProd, vatPct: l.pct,
          vatCategory: l.vat ? l.vat.category : null, taxType: l.vat ? l.vat.taxType : null, account: l.account,
          classificationCode: l.bunaa, taxProductCode: l.taxProductCode || (l.vat && l.vat.taxProductCode !== 'TBD' ? l.vat.taxProductCode : null),
          barcode: l.barcode, barcodeType: l.barcodeType };
      }),
      amount: calc.amount, vatAmount: calc.vatAmount, amountInclVat: calc.amountInclVat, vatByIdentifier: calc.vatByIdentifier,
      transactionNo: v1.transactionNo, paymentTransactionNo: res.vouchers[1] ? res.vouchers[1].transactionNo : null,
      cleEntryNo: v1.cle[0] ? v1.cle[0].entryNo : null, cashVoucherNo: res.vouchers[1] && res.vouchers[1].cashVoucher ? res.vouchers[1].cashVoucher.no : null,
      ebarimtType: type, ebarimtCustomerTin: type === 'B2B_RECEIPT' ? cust.tin : null, ebarimtConsumerNo: type === 'B2C_RECEIPT' ? (d.consumerNo || '') : null,
      ebarimtDocId: null, appliesTo: d.appliesTo || null, reason: d.reason || null, createdBy: d.createdBy, status: 'POSTED' };
    if (!preview) (d.docType === 'INVOICE' ? S.salesInvoices : S.salesCrMemos).push(p);
    return p;
  }

  E.sales = {
    calc: calcDraft,
    precheck: function (d) { return salesPrecheck(d, calcDraft(d)); },
    preview: function (d) { return postSalesDraft(d, { preview: true }); },
    post: function (d, opts) { return postSalesDraft(d, opts || { interactive: true }); },
    postedInvoices: function () { return S.salesInvoices; },
    postedCreditMemos: function () { return S.salesCrMemos; },
    getPosted: function (no) { return S.salesInvoices.concat(S.salesCrMemos).filter(function (x) { return x.no === no; })[0] || null; },
    paymentStatus: function (p) {                          // BR-SAL-90 (+ UI OVERDUE badge, 15 §5.1)
      var e = findCle(p.cleEntryNo);
      if (!e) return { status: 'UNKNOWN', remaining: 0 };
      var st = e.remaining === 0 ? 'PAID' : (e.remaining === e.amount ? 'UNPAID' : 'PARTIALLY_PAID');
      var badge = st;
      if (st !== 'PAID' && p.docType === 'INVOICE' && e.dueDate < D.meta.today) badge = 'OVERDUE';
      return { status: st, badge: badge, remaining: e.remaining, entry: e };
    },
    customerBalance: customerBalance
  };

  // ===========================================================================
  // 7. Purchases (07): G/L or item lines, input VAT with supplier ДДТД (D-E4)
  // ===========================================================================
  function postPurchaseInvoice(src, opts) {
    opts = opts || {};
    var v = SET.vendors[src.vend];
    var calc = calcDocument({ side: 'PURCHASE', docType: 'INVOICE', pricesInclVat: false, vatBus: v.vatBus, genBus: v.genBus, lines: src.lines });
    if (calc.errors.length) return { ok: false, errors: calc.errors };
    // the prototype computes NORMAL VAT only; REVERSE_CHARGE (BR-TAX-23: line VAT 0, self-assessed 2305) and FULL_VAT
    // (BR-TAX-24: amount 0, VAT = line) would otherwise be posted as if they were ordinary 10 % input VAT
    var nn = calc.lines.filter(function (l) { return l.vat && l.vat.calcType !== 'NORMAL'; });
    if (nn.length) return { ok: false, errors: nn.map(function (l) { return { code: 'tax.vat_calculation_type_not_supported', message: 'Мөр ' + (l.idx + 1) + ': ' + l.vat.calcType + ' НӨАТ-ыг прототип тооцохгүй (BR-TAX-23/24).', line: l.idx }; }) };
    var dup = S.purchInvoices.filter(function (p) { return p.vendor === v.no && p.vendorInvoiceNo === src.vendorInvoiceNo; });
    if (dup.length) return { ok: false, errors: [{ code: 'purchase.vendor_invoice_no_duplicate', message: 'Нийлүүлэгчийн нэхэмжлэхийн дугаар давхардсан (INV-18).' }] };
    if (src.ddtd && !/^\d{33}$/.test(src.ddtd)) return { ok: false, errors: [{ code: 'ebarimt.purchase_receipt_ddtd_invalid', message: 'ДДТД 33 оронтой байна (BR-TAX-47).' }] };
    var payAcc = D.vendorPostingGroups[v.vpg].payables;
    var desc = 'Худалдан авалт ' + v.name + ' ' + src.vendorInvoiceNo;
    var V1 = { key: 'V1', postingDate: src.date, documentType: 'INVOICE', docSeries: 'PI', description: desc, externalDocNo: src.vendorInvoiceNo, gl: [], vat: [], vle: [] };
    var confirmed = !!(src.ddtd && src.confirm);
    calc.lines.forEach(function (l, i) {
      V1.gl.push({ key: 'B' + i, acc: l.account, amount: l.amount, origin: l.type === 'GL_ACCOUNT' ? 'USER' : 'SYSTEM', genPostingType: 'PURCHASE',
        genBus: v.genBus, genProd: l.genProd, vatBus: v.vatBus, vatProd: l.vatProd, vatAmount: l.vatAmount, desc: l.description });
      if (l.vatAmount) V1.gl.push({ key: 'BV' + i, acc: l.vat.purchAcc, amount: l.vatAmount, origin: 'SYSTEM', desc: 'Орцын НӨАТ ' + v.name });
      V1.vat.push({ glKey: 'B' + i, type: 'PURCHASE', base: l.amount, amount: l.vatAmount, vatBus: v.vatBus, vatProd: l.vatProd, category: l.vat.category,
        calcType: l.vat.calcType, pct: l.pct, taxType: l.vat.taxType, partyNo: v.no, partyTin: v.tin, deductibleConfirmed: confirmed && l.vatAmount !== 0, supplierDdtd: src.ddtd || null });
    });
    var due = calcDate(D.paymentTerms[v.terms].formula, src.date);
    V1.gl.push({ key: 'AP', acc: payAcc, amount: -calc.amountInclVat, origin: 'SYSTEM', sourceType: 'VENDOR', sourceNo: v.no, desc: desc });
    V1.vle.push({ glKey: 'AP', vendor: v.no, docType: 'INVOICE', amount: -calc.amountInclVat, dueDate: due, vpg: v.vpg, vendorInvoiceNo: src.vendorInvoiceNo, description: desc, ref: src.id });
    var r = post({ sourceCode: 'PURCHASES', description: desc, vouchers: [V1] }, { preview: opts.preview });
    if (!r.ok || opts.preview) return r;
    var v1 = r.result.vouchers[0];
    var p = { no: v1.documentNo, vendor: v.no, vendorName: v.name, vendorTin: v.tin, vendorInvoiceNo: src.vendorInvoiceNo, postingDate: src.date, documentDate: src.date,
      dueDate: due, lines: calc.lines.map(function (l) { return { description: l.description, account: l.account, amount: l.amount, vat: l.vatAmount, vatProd: l.vatProd }; }),
      amount: calc.amount, vatAmount: calc.vatAmount, amountInclVat: calc.amountInclVat, ddtd: src.ddtd || null, deductibleConfirmed: confirmed,
      transactionNo: v1.transactionNo, vleEntryNo: v1.vle[0].entryNo, sourceId: src.id };
    S.purchInvoices.push(p);
    r.posted = p;
    return r;
  }
  function confirmInputVat(purchNo, ddtd) {             // BR-TAX-49
    var p = S.purchInvoices.filter(function (x) { return x.no === purchNo; })[0];
    if (!p) return { ok: false, errors: [{ code: 'api.resource_not_found', message: 'Баримт олдсонгүй.' }] };
    var id = ddtd || p.ddtd;
    if (!id || !/^\d{33}$/.test(id)) return { ok: false, errors: [{ code: 'tax.supplier_receipt_id_required', message: '33 оронтой ДДТД оруулна уу (BR-TAX-47).' }] };
    S.vatEntries.forEach(function (e) {
      if (e.transactionNo === p.transactionNo && e.type === 'PURCHASE' && e.amount !== 0 && !e.closed && !e.reversed) { e.deductibleConfirmed = true; e.supplierDdtd = id; }
    });
    p.ddtd = id; p.deductibleConfirmed = true;
    return { ok: true };
  }
  E.purchases = { post: postPurchaseInvoice, list: function () { return S.purchInvoices; }, confirmInputVat: confirmInputVat };

  // ===========================================================================
  // 8. Payments, cash vouchers, bank lines, transfers, journals (09 §5.2, 05 §5.4)
  // ===========================================================================
  function moneySeries(bankNo, inflow) {
    var cash = SET.banks[bankNo].kind === 'CASH';
    return cash ? (inflow ? 'KO' : 'KZ') : (inflow ? 'BR' : 'BP');
  }
  function resolveApply(kind, appliesTo) {
    if (!appliesTo) return null;
    if (typeof appliesTo === 'number') return appliesTo;
    var r = S.refs[appliesTo];
    if (r) return r.entryNo;
    var list = kind === 'C' ? S.cle : S.vle;
    var e = list.filter(function (x) { return x.documentNo === appliesTo && x.open; })[0];
    return e ? e.entryNo : null;
  }
  function postReceipt(o, opts) {                      // customer payment (FR-BNK-006)
    var c = SET.customers[o.cust], bank = SET.banks[o.bank];
    var target = resolveApply('C', o.appliesTo);
    var tEntry = target ? findCle(target) : null;
    var amount = o.amount ? (typeof o.amount === 'number' ? o.amount : toCents(o.amount)) : (tEntry ? tEntry.remaining : 0);
    var cpg = tEntry ? tEntry.cpg : c.cpg;                 // BR-SAL-43
    var recAcc = D.customerPostingGroups[cpg].receivables;
    var series = moneySeries(o.bank, true);
    var desc = o.desc || ('Төлбөр ' + c.name + (tEntry ? ' — ' + tEntry.documentNo : ''));
    var V = { key: 'V1', postingDate: o.date, documentType: 'PAYMENT', docSeries: series, description: desc,
      gl: [{ key: 'BANK', acc: bankGlAccount(o.bank), amount: amount, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: o.bank },
        { key: 'AR', acc: recAcc, amount: -amount, origin: 'SYSTEM', sourceType: 'CUSTOMER', sourceNo: c.no }],
      cle: [{ glKey: 'AR', customer: c.no, docType: 'PAYMENT', amount: -amount, cpg: cpg, applyTo: target, description: desc }],
      ble: [{ glKey: 'BANK', bank: o.bank, amount: amount, party: c.name, description: desc, cashVoucher: bank.kind === 'CASH' ? 'KO' : null, cf: o.cf || null }] };
    return post({ sourceCode: bank.kind === 'CASH' ? 'CASHVOUCHER' : 'PAYMENTREG', description: desc, vouchers: [V] }, opts);
  }
  function postVendorPayment(o, opts) {
    var v = SET.vendors[o.vend], bank = SET.banks[o.bank];
    var target = resolveApply('V', o.appliesTo);
    var tEntry = target ? findVle(target) : null;
    var amount = o.amount ? toCents(o.amount) : (tEntry ? -tEntry.remaining : 0);
    var vpg = tEntry ? tEntry.vpg : v.vpg;
    var desc = o.desc || ('Төлбөр ' + v.name + (tEntry && tEntry.vendorInvoiceNo ? ' — ' + tEntry.vendorInvoiceNo : ''));
    var V = { key: 'V1', postingDate: o.date, documentType: 'PAYMENT', docSeries: moneySeries(o.bank, false), description: desc,
      gl: [{ key: 'AP', acc: D.vendorPostingGroups[vpg].payables, amount: amount, origin: 'SYSTEM', sourceType: 'VENDOR', sourceNo: v.no },
        { key: 'BANK', acc: bankGlAccount(o.bank), amount: -amount, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: o.bank }],
      vle: [{ glKey: 'AP', vendor: v.no, docType: 'PAYMENT', amount: amount, vpg: vpg, applyTo: target, description: desc }],
      ble: [{ glKey: 'BANK', bank: o.bank, amount: -amount, party: v.name, description: desc, cashVoucher: bank.kind === 'CASH' ? 'KZ' : null, cf: o.cf || null }] };
    return post({ sourceCode: bank.kind === 'CASH' ? 'CASHVOUCHER' : 'PAYMENTREG', description: desc, vouchers: [V] }, opts);
  }
  function postBankGl(o, opts) {                       // bank/cash line against a G/L account (fees, interest, taxes, salary)
    var amount = typeof o.amount === 'number' ? o.amount : toCents(o.amount);
    var bank = SET.banks[o.bank];
    var V = { key: 'V1', postingDate: o.date, documentType: amount >= 0 ? 'PAYMENT' : 'PAYMENT', docSeries: moneySeries(o.bank, amount > 0), description: o.desc,
      gl: [{ key: 'BANK', acc: bankGlAccount(o.bank), amount: amount, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: o.bank },
        { key: 'CONTRA', acc: o.acc, amount: -amount, origin: 'USER', desc: o.desc }],
      ble: [{ glKey: 'BANK', bank: o.bank, amount: amount, party: o.party || null, description: o.desc, cashVoucher: bank.kind === 'CASH' ? (amount > 0 ? 'KO' : 'KZ') : null, cf: o.cf || null }] };
    return post({ sourceCode: bank.kind === 'CASH' ? 'CASHVOUCHER' : (amount > 0 ? 'CASHRECJNL' : 'PAYMENTJNL'), description: o.desc, vouchers: [V] }, opts);
  }
  function postTransfer(o, opts) {                     // FR-BNK-007
    var amount = toCents(o.amount);
    var from = SET.banks[o.from];
    var V = { key: 'V1', postingDate: o.date, documentType: 'PAYMENT', docSeries: moneySeries(o.from, false), description: o.desc,
      gl: [{ key: 'TO', acc: bankGlAccount(o.to), amount: amount, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: o.to },
        { key: 'FROM', acc: bankGlAccount(o.from), amount: -amount, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: o.from }],
      ble: [{ glKey: 'FROM', bank: o.from, amount: -amount, description: o.desc, cashVoucher: from.kind === 'CASH' ? 'KZ' : null, party: SET.banks[o.to].name },
        { glKey: 'TO', bank: o.to, amount: amount, description: o.desc, party: from.name }] };
    return post({ sourceCode: from.kind === 'CASH' ? 'CASHVOUCHER' : 'PAYMENTREG', description: o.desc, vouchers: [V] }, opts);
  }
  function postJournal(o, opts) {                      // general / opening / payroll journal (05 §5.4)
    var V = { key: 'V1', postingDate: o.date, documentType: 'NONE', docSeries: o.series || 'GJ', description: o.desc, reasonCode: o.reason || null, gl: [], cle: [], vle: [], ble: [] };
    o.lines.forEach(function (l, i) {
      var amt = typeof l.amt === 'number' ? l.amt : toCents(l.amt);
      var k = 'L' + i;
      if (l.acc) V.gl.push({ key: k, acc: l.acc, amount: amt, origin: 'USER', desc: l.desc });
      else if (l.bank) {
        V.gl.push({ key: k, acc: bankGlAccount(l.bank), amount: amt, origin: 'SYSTEM', sourceType: 'BANK', sourceNo: l.bank, desc: l.desc });
        V.ble.push({ glKey: k, bank: l.bank, amount: amt, description: l.desc });
      } else if (l.cust) {
        var c = SET.customers[l.cust];
        V.gl.push({ key: k, acc: D.customerPostingGroups[c.cpg].receivables, amount: amt, origin: 'SYSTEM', sourceType: 'CUSTOMER', sourceNo: c.no, desc: l.desc });
        V.cle.push({ glKey: k, customer: c.no, docType: amt >= 0 ? 'INVOICE' : 'PAYMENT', amount: amt, dueDate: l.due, cpg: c.cpg, description: l.desc, extDoc: l.extDoc, ref: l.ref, applyTo: resolveApply('C', l.appliesTo) });
      } else if (l.vend) {
        var v = SET.vendors[l.vend];
        V.gl.push({ key: k, acc: D.vendorPostingGroups[v.vpg].payables, amount: amt, origin: 'SYSTEM', sourceType: 'VENDOR', sourceNo: v.no, desc: l.desc });
        V.vle.push({ glKey: k, vendor: v.no, docType: amt <= 0 ? 'INVOICE' : 'PAYMENT', amount: amt, dueDate: l.due, vpg: v.vpg, description: l.desc, vendorInvoiceNo: l.extDoc, ref: l.ref, applyTo: resolveApply('V', l.appliesTo) });
      }
    });
    return post({ sourceCode: o.source || 'GENJNL', description: o.desc, vouchers: [V] }, opts);
  }
  E.payments = { receipt: postReceipt, vendorPayment: postVendorPayment, bankGl: postBankGl, transfer: postTransfer };
  E.journal = { post: postJournal };

  // ===========================================================================
  // 9. Application (posted ↔ posted, G/L-less), unapply (LIFO), reversal
  // ===========================================================================
  // targets: entry numbers, or { entryNo, amount } with amount = amountToApply (positive, ≤ |remaining|; BR-AR-22/35)
  function applyEntries(kind, newNo, targetNos, date, opts) {      // 06 §5.13.3 (BR-AR-16, 20..30)
    opts = opts || {};
    var find = kind === 'C' ? findCle : findVle;
    var pk = kind === 'C' ? 'customer' : 'vendor';
    var ctlAcc = function (e) { return kind === 'C' ? D.customerPostingGroups[e.cpg].receivables : D.vendorPostingGroups[e.vpg].payables; };
    var n = find(newNo);
    if (!n) return { ok: false, errors: [{ code: 'api.resource_not_found', message: 'Бичилт олдсонгүй.' }] };
    var req = targetNos.map(function (t) { return typeof t === 'object' ? { entryNo: t.entryNo, cap: t.amount } : { entryNo: t, cap: null }; });
    var targets = req.map(function (r) { var e = find(r.entryNo); return e ? { e: e, cap: r.cap } : null; }).filter(Boolean);
    var errs = [];
    if (!targets.length) errs.push({ code: 'party.application_nothing_to_apply', message: 'Тулгах бичилт сонгоогүй (BR-AR-30).' });
    if (!n.open) errs.push({ code: 'party.entry_closed', message: 'Тулгаж буй бичилт нээлттэй биш.' });
    if (n.reversed || targets.some(function (t) { return t.e.reversed; })) errs.push({ code: 'party.entry_reversed', message: 'Буцаагдсан бичилтийг тулгахгүй (BR-AR-33).' });
    if (targets.some(function (t) { return t.e[pk] !== n[pk]; })) errs.push({ code: 'party.application_customer_mismatch', message: 'Зөвхөн нэг харилцагчийн бичилтүүдийг тулгана (INV-27).' });
    if (targets.some(function (t) { return ctlAcc(t.e) !== ctlAcc(n); })) errs.push({ code: 'party.application_posting_group_mismatch', message: 'Авлага/өглөгийн данс өөр бичилтүүдийг тулгахгүй (BR-AR-16).' });
    if (targets.some(function (t) { return t.e.entryNo === n.entryNo || !t.e.open || Math.sign(t.e.remaining) === Math.sign(n.remaining); }))
      errs.push({ code: 'party.application_sign_mismatch', message: 'Эсрэг тэмдэгтэй, нээлттэй бичилтүүдийг л тулгана (BR-AR-20).' });
    targets.forEach(function (t) {
      if (t.cap !== null && (!(t.cap > 0) || t.cap > Math.abs(t.e.remaining))) errs.push({ code: 'party.application_exceeds_remaining', message: t.e.documentNo + ': тулгах дүн үлдэгдлээс их (BR-AR-35).' });
    });
    var minDate = targets.reduce(function (m, t) { return t.e.postingDate > m ? t.e.postingDate : m; }, n.postingDate);
    if (date < minDate) errs.push({ code: 'party.application_date_before_entries', message: 'Тулгалтын огноо (' + fmtDate(date) + ') оролцогч бичилтийн хамгийн хожуу огнооноос (' + fmtDate(minDate) + ') өмнө байж болохгүй (BR-AR-27).' });
    var p = periodOf(date);
    if (!p || p.status !== 'OPEN') errs.push({ code: 'gl.period_closed', message: 'Тулгалтын огноо нээлттэй үед байх ёстой (BR-AR-28).' });
    if (errs.length) return { ok: false, errors: errs };
    if (opts.preview) {
      var rem = Math.abs(n.remaining), plan = [];
      targets.forEach(function (t) { var a = Math.min(rem, Math.abs(t.e.remaining), t.cap === null ? Infinity : t.cap); if (a > 0) { plan.push({ entryNo: t.e.entryNo, documentNo: t.e.documentNo, amount: a }); rem -= a; } });
      return { ok: true, preview: true, plan: plan, unapplied: rem };
    }
    // posted ↔ posted: subledger only, no G/L, transaction_no NULL (BR-AR-25); one application_no for the run (BR-AR-24)
    var appNo = next('APPLICATION_NO'), total = 0, rows = [];
    targets.forEach(function (t) { if (n.remaining !== 0) total += applyPair(kind, n, t.e, date, null, appNo, rows, t.cap); });
    return { ok: true, applicationNo: appNo, applied: total, rows: rows };
  }
  function unapply(kind, applicationNo, date) {          // 06 §5.14, BR-AR-40..46 (hard LIFO)
    var det = kind === 'C' ? S.dcle : S.dvle;
    var rows = det.filter(function (r) { return r.applicationNo === applicationNo && r.entryType === 'APPLICATION' && !r.unapplied; });
    if (!rows.length) return { ok: false, errors: [{ code: 'party.application_not_found', message: 'Тулгалт олдсонгүй.' }] };
    var ek = kind === 'C' ? 'cleEntryNo' : 'vleEntryNo';
    var find = kind === 'C' ? findCle : findVle;
    var entries = rows.map(function (r) { return r[ek]; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var later = det.filter(function (r) { return r.entryType === 'APPLICATION' && !r.unapplied && entries.indexOf(r[ek]) >= 0 && r.applicationNo > applicationNo; });
    if (later.length) return { ok: false, errors: [{ code: 'party.unapply_not_latest', message: 'Энэ бичилтэд хийгдсэн хожуу тулгалтыг эхлээд буцаана уу (BR-AR-41).' }] };
    if (entries.some(function (no) { return find(no).reversed; })) return { ok: false, errors: [{ code: 'party.entry_reversed', message: 'Буцаагдсан бичилтийн тулгалтыг буцаахгүй (BR-AR-43).' }] };
    var maxDate = rows.reduce(function (m, r) { return r.postingDate > m ? r.postingDate : m; }, '');
    if (date < maxDate) return { ok: false, errors: [{ code: 'party.unapply_date_before_application', message: 'Буцаах огноо тулгалтын огнооноос өмнө байж болохгүй (BR-AR-42).' }] };
    var p = periodOf(date);
    if (!p || p.status !== 'OPEN') return { ok: false, errors: [{ code: 'gl.period_closed', message: 'Нээлттэй үеийн огноо сонгоно уу.' }] };
    // mirror rows: new application_no (undo no), transaction_no NULL, −amount, unapplied = true, unapplied_by ↔ (BR-AR-44, 45)
    var undoNo = next('APPLICATION_NO');
    rows.slice().sort(function (a, b) { return a.entryNo - b.entryNo; }).forEach(function (r) {
      var m = JSON.parse(JSON.stringify(r));
      m.entryNo = next(kind === 'C' ? 'DCLE' : 'DVLE'); m.amount = -r.amount; m.postingDate = date; m.transactionNo = null;
      m.applicationNo = undoNo; m.unapplied = true; m.unappliedOf = r.entryNo; m.unappliedByEntryNo = null;
      det.push(m);
      r.unapplied = true; r.unappliedByEntryNo = m.entryNo;
      var e = find(r[ek]);
      e.remaining -= r.amount; e.open = e.remaining !== 0;
    });
    entries.forEach(function (no) { var e = find(no); if (e.open) { e.closedByEntryNo = null; e.closedAtDate = null; } });   // BR-AR-46
    return { ok: true, applicationNo: applicationNo, undoApplicationNo: undoNo };
  }
  var REVERSIBLE = ['GENJNL', 'CASHRECJNL', 'PAYMENTJNL', 'CASHVOUCHER', 'PAYMENTREG', 'OPENING', 'PAYROLLJNL'];
  function reverseTransaction(txNo, reasonCode, opts) {            // D-D5, 05 §5.10
    opts = opts || {};
    var tx = S.transactions.filter(function (t) { return t.transactionNo === txNo; })[0];
    var errs = [];
    if (!tx) return { ok: false, errors: [{ code: 'api.resource_not_found', message: 'Гүйлгээ олдсонгүй.' }] };
    if (REVERSIBLE.indexOf(tx.sourceCode) < 0) errs.push({ code: tx.sourceCode === 'SALES' || tx.sourceCode === 'PURCHASES' ? 'gl.reversal_use_credit_memo' : 'gl.reversal_not_allowed', message: 'Баримтаас үүссэн гүйлгээг кредит нотоор засна (D-D5).' });
    if (tx.reversed) errs.push({ code: 'gl.transaction_already_reversed', message: 'Аль хэдийн буцаагдсан (INV-22).' });
    var p = periodOf(tx.postingDate);
    if (!p || p.status !== 'OPEN') errs.push({ code: 'gl.period_closed', message: 'Эх гүйлгээний үе хаалттай; одоогийн үед залруулах журнал хийнэ (FR-GL-014).' });
    var cles = S.cle.filter(function (e) { return e.transactionNo === txNo; }), vles = S.vle.filter(function (e) { return e.transactionNo === txNo; });
    if (cles.concat(vles).some(function (e) { return e.remaining !== e.amount; })) errs.push({ code: 'gl.reversal_entries_applied', message: 'Тулгагдсан бичилттэй. Эхлээд тулгалтыг буцаана уу.' });
    var vats = S.vatEntries.filter(function (e) { return e.transactionNo === txNo; });
    if (vats.some(function (e) { return e.closed; })) errs.push({ code: 'gl.reversal_vat_settled', message: 'НӨАТ-ын хаалтад орсон (BR-TAX-34).' });
    if (!reasonCode) errs.push({ code: 'gl.reason_code_required', message: 'Шалтгааны код заавал (BR-PST-20).' });
    if (errs.length) return { ok: false, errors: errs };
    var gls = S.glEntries.filter(function (e) { return e.transactionNo === txNo; });
    var V = { key: 'V1', postingDate: tx.postingDate, documentType: tx.documentType, documentNo: tx.documentNo, description: 'Буцаалт: ' + tx.description, reasonCode: reasonCode,
      gl: gls.map(function (e, i) { return { key: 'R' + i, acc: e.account, amount: -e.amount, origin: 'SYSTEM', desc: 'Буцаалт: ' + e.description }; }),
      ble: S.ble.filter(function (b) { return b.transactionNo === txNo; }).map(function (b) { return { glKey: null, bank: b.bank, amount: -b.amount, description: 'Буцаалт: ' + b.description }; }) };
    var r = post({ sourceCode: 'REVERSAL', description: V.description, vouchers: [V] }, { preview: opts.preview });
    if (!r.ok || opts.preview) return r;
    var newTx = r.result.vouchers[0].transactionNo;
    tx.reversed = true;
    S.transactions.filter(function (t) { return t.transactionNo === newTx; })[0].reversesTx = txNo;
    gls.forEach(function (e) { e.reversed = true; e.reversedByTx = newTx; });
    S.glEntries.filter(function (e) { return e.transactionNo === newTx; }).forEach(function (e) { e.reversed = true; });
    S.ble.filter(function (b) { return b.transactionNo === txNo || b.transactionNo === newTx; }).forEach(function (b) { b.reversed = true; });
    cles.concat(vles).forEach(function (e) { e.reversed = true; });
    return r;
  }
  E.ledger = {
    applyCustomer: function (newNo, targets, date, opts) { return applyEntries('C', newNo, targets, date, opts); },
    applyVendor: function (newNo, targets, date, opts) { return applyEntries('V', newNo, targets, date, opts); },
    unapplyCustomer: function (appNo, date) { return unapply('C', appNo, date); },
    unapplyVendor: function (appNo, date) { return unapply('V', appNo, date); },
    reverseTransaction: reverseTransaction,
    reversibleSources: REVERSIBLE
  };

  // ===========================================================================
  // 10. VAT settlement and payment (08 §5.10 — BC VAT Settlement: 2300/1300 → 2310)
  // ===========================================================================
  // 08 §5.9 scope: an OPEN period takes every SALE / PURCHASE entry not yet assigned to a return with vat_date ≤ period end
  // (purchases only once deductible-confirmed or zero) — so input VAT confirmed after its own month was closed falls into
  // the next open return (BR-TAX-49, W-TAX-10); a CLOSED / SUBMITTED period shows exactly the entries assigned to it.
  function vatScope(vp) {
    if (vp.status === 'OPEN') return S.vatEntries.filter(function (e) {
      return (e.type === 'SALE' || e.type === 'PURCHASE') && !e.vatReturnPeriod && e.vatDate <= vp.end &&
        (e.type === 'SALE' || e.deductibleConfirmed || e.amount === 0 || e.closed || e.reversed);
    });
    return S.vatEntries.filter(function (e) { return e.type !== 'SETTLEMENT' && e.vatReturnPeriod === vp.period; });
  }
  function vatSettlementPlan(period) {
    var vp = S.vatPeriods.filter(function (p) { return p.period === period; })[0];
    var scope = vatScope(vp).filter(function (e) { return !e.closed && !e.reversed; });
    var groups = {};
    scope.forEach(function (e) {
      var k = e.type + '|' + e.vatBus + '|' + e.vatProd;
      var s = vatSetup(e.vatBus, e.vatProd);
      if (!groups[k]) groups[k] = { type: e.type, vatBus: e.vatBus, vatProd: e.vatProd, setup: s, amount: 0, entries: [] };
      groups[k].amount += e.amount; groups[k].entries.push(e);
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; });
    list.sort(function (a, b) {                             // BR-TAX-74: VAT bus → VAT prod → PURCHASE first
      if (a.vatBus !== b.vatBus) return a.vatBus < b.vatBus ? -1 : 1;
      if (a.vatProd !== b.vatProd) return a.vatProd < b.vatProd ? -1 : 1;
      return a.type === 'PURCHASE' ? -1 : 1;
    });
    return { period: vp, scope: scope, groups: list };
  }
  function vatSettle(period, date, opts) {
    opts = opts || {};
    var plan = vatSettlementPlan(period);
    var V = { key: 'V1', postingDate: date, documentType: 'NONE', docSeries: 'GJ', description: 'НӨАТ-ын хаалт ' + monthLabel(period), gl: [], vat: [] };
    var net = 0;
    plan.groups.forEach(function (g, i) {
      if (g.amount === 0) {
        V.vat.push({ type: 'SETTLEMENT', base: 0, amount: 0, vatBus: g.vatBus, vatProd: g.vatProd, category: g.setup.category, pct: g.setup.pct, taxType: g.setup.taxType, closes: g.entries.map(function (e) { return e.entryNo; }), period: period, vatDate: plan.period.end });
        return;
      }
      var a = g.type === 'SALE' ? g.setup.salesAcc : g.setup.purchAcc;
      V.gl.push({ key: 'S' + i, acc: a, amount: -g.amount, origin: 'SYSTEM', desc: 'НӨАТ-ын хаалт ' + monthLabel(period) });
      V.vat.push({ glKey: 'S' + i, type: 'SETTLEMENT', base: 0, amount: -g.amount, vatBus: g.vatBus, vatProd: g.vatProd, category: g.setup.category, pct: g.setup.pct, taxType: g.setup.taxType, closes: g.entries.map(function (e) { return e.entryNo; }), period: period, vatDate: plan.period.end });
      net += g.amount;
    });
    if (net !== 0) V.gl.push({ key: 'NET', acc: '2310', amount: net, origin: 'SYSTEM', desc: 'НӨАТ-ын тооцоо ' + monthLabel(period) });
    var errs = [];
    if (plan.period.status !== 'OPEN') errs.push({ code: 'tax.vat_period_closed', message: 'НӨАТ-ын үе нээлттэй биш.' });
    if (errs.length) return { ok: false, errors: errs };
    var r = (V.gl.length >= 2) ? post({ sourceCode: 'VATSTMT', description: V.description, vouchers: [V] }, { preview: opts.preview }) : { ok: true, result: null };
    if (!r.ok || opts.preview) { r.plan = plan; r.net = -net; return r; }
    if (!r.result) plan.scope.forEach(function (e) { e.vatReturnPeriod = period; });   // BR-TAX-75: nothing to post → assignment only
    plan.period.status = 'CLOSED';
    plan.period.settlementTx = r.result ? r.result.vouchers[0].transactionNo : null;
    plan.period.settlementNet = -net;                      // + = payable
    r.plan = plan; r.net = -net;
    return r;
  }
  function vatPay(period, date, bankNo, opts) {
    var bal = glBalance('2310', date);                      // credit balance = payable
    var amount = -bal;
    if (amount <= 0) return { ok: true, skipped: true, amount: 0 };
    return postBankGl({ date: date, bank: bankNo, acc: '2310', amount: -amount, desc: 'НӨАТ төлсөн: ' + monthLabel(period), party: 'Татварын алба' }, opts);
  }
  E.vat = {
    settlementPlan: vatSettlementPlan, settle: vatSettle, pay: vatPay,
    periods: function () { return S.vatPeriods; },
    entries: function () { return S.vatEntries; },
    unconfirmedInput: function (upTo) {                     // BR-TAX-50
      return S.vatEntries.filter(function (e) { return e.type === 'PURCHASE' && e.calcType === 'NORMAL' && e.amount !== 0 && !e.deductibleConfirmed && !e.closed && !e.reversed && !e.vatReturnPeriod && (!upTo || e.vatDate <= upTo); });
    }
  };

  // ===========================================================================
  // 11. Balances and reports
  // ===========================================================================
  function accountFilter(filter) {                      // BC filter '1100..1198|1300'
    var parts = String(filter).split('|').map(function (p) { var r = p.split('..'); return r.length === 2 ? [r[0], r[1]] : [r[0], r[0]]; });
    return function (no) { return parts.some(function (r) { return no >= r[0] && no <= r[1]; }); };
  }
  function glBalance(filterOrNo, to, from, opts) {
    opts = opts || {};
    var f = typeof filterOrNo === 'function' ? filterOrNo : (/^\d{4}$/.test(filterOrNo) ? function (n) { return n === filterOrNo; } : accountFilter(filterOrNo));
    var s = 0;
    for (var i = 0; i < S.glEntries.length; i++) {
      var e = S.glEntries[i];
      if (to && e.postingDate > to) continue;
      if (from && e.postingDate < from) continue;
      if (opts.onlyOpening && e.sourceCode !== 'OPENING') continue;
      if (opts.excludeOpening && e.sourceCode === 'OPENING') continue;
      if (opts.excludeClosing && e.isClosing) continue;
      if (f(e.account)) s += e.amount;
    }
    return s;
  }
  function bankBalance(bankNo, asOf) {
    return S.ble.filter(function (b) { return b.bank === bankNo && (!asOf || b.postingDate <= asOf); }).reduce(function (s, b) { return s + b.amount; }, 0);
  }
  function trialBalance(o) {                             // FR-RPT-001; OPENING entries form the opening column
    o = o || {};
    var from = o.from || D.fiscalYear.year + '-01-01', to = o.to || D.meta.today;
    var rows = {};
    S.glEntries.forEach(function (e) {
      if (e.postingDate > to) return;
      var r = rows[e.account] || (rows[e.account] = { no: e.account, name: acc(e.account).name, opening: 0, debit: 0, credit: 0, closing: 0 });
      if (e.postingDate < from || e.sourceCode === 'OPENING') r.opening += e.amount;
      else if (e.amount > 0) r.debit += e.amount; else r.credit += -e.amount;
      r.closing += e.amount;
    });
    var list = Object.keys(rows).sort().map(function (k) { return rows[k]; });
    var tot = { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 };
    list.forEach(function (r) {
      if (r.opening > 0) tot.openingDebit += r.opening; else tot.openingCredit -= r.opening;
      tot.debit += r.debit; tot.credit += r.credit;
      if (r.closing > 0) tot.closingDebit += r.closing; else tot.closingCredit -= r.closing;
    });
    return { from: from, to: to, rows: list, totals: tot };
  }

  // МГТ direct method (10 §5.14): per transaction touching CASH_TRANSFER accounts, contra accounts by category
  function cashAccounts() { return SET.accountList.filter(function (a) { return a.type === 'POSTING' && a.cf === 'CASH_TRANSFER'; }).map(function (a) { return a.no; }); }
  function cashFlow(o) {
    o = o || {};
    var from = o.from || D.fiscalYear.year + '-01-01', to = o.to || D.meta.today;
    var cash = cashAccounts();
    var byTx = {};
    S.glEntries.forEach(function (e) {
      if (e.postingDate < from || e.postingDate > to || e.isClosing || e.sourceCode === 'OPENING') return;
      (byTx[e.transactionNo] || (byTx[e.transactionNo] = [])).push(e);
    });
    var cats = {}, detail = [];
    var ovrByTx = {};                                       // BR-RPT-73: bank ledger entry override of the МГТ category
    S.ble.forEach(function (b) { if (b.cfOverride && b.amount) (ovrByTx[b.transactionNo] || (ovrByTx[b.transactionNo] = [])).push(b); });
    var addC = function (c, v) { if (v) cats[c] = (cats[c] || 0) + v; };
    Object.keys(byTx).forEach(function (k) {
      var es = byTx[k];
      var delta = es.filter(function (e) { return cash.indexOf(e.account) >= 0; }).reduce(function (s, e) { return s + e.amount; }, 0);
      if (delta === 0) return;
      var contra = {};
      es.forEach(function (e) { if (cash.indexOf(e.account) >= 0) return; var c = acc(e.account).cf || 'NON_CASH'; contra[c] = (contra[c] || 0) - e.amount; });
      var ovr = ovrByTx[k] || [], used = {};
      ovr.forEach(function (b) { used[b.cfOverride] = (used[b.cfOverride] || 0) + b.amount; addC(b.cfOverride, b.amount); });
      var rest = delta - ovr.reduce(function (s, b) { return s + b.amount; }, 0);
      var keys = Object.keys(contra).filter(function (c) { return contra[c] !== 0; });
      if (!ovr.length) keys.forEach(function (c) { addC(c, contra[c]); });
      else if (rest !== 0) {                                // 10 §6.9: rest by contra weights, cumulative rounding
        keys.sort(function (a, b) { return Math.abs(contra[b]) - Math.abs(contra[a]) || (a < b ? -1 : 1); });
        var w = keys.reduce(function (s, c) { return s + contra[c]; }, 0), cum = 0, prev = 0;
        keys.forEach(function (c) { cum += contra[c]; var cur = Number(roundDiv(BigInt(rest) * BigInt(cum), BigInt(w))); addC(c, cur - prev); used[c] = (used[c] || 0) + cur - prev; prev = cur; });
      }
      detail.push({ transactionNo: +k, postingDate: es[0].postingDate, documentNo: es[0].documentNo, description: es[0].description, delta: delta, contra: ovr.length ? used : contra, override: ovr.length ? ovr.map(function (b) { return b.cfOverride; }) : null });
    });
    var opening = glBalance(function (n) { return cash.indexOf(n) >= 0; }, addDays(from, -1)) + glBalance(function (n) { return cash.indexOf(n) >= 0; }, to, from, { onlyOpening: true });
    var closing = glBalance(function (n) { return cash.indexOf(n) >= 0; }, to);
    return { from: from, to: to, categories: cats, detail: detail, opening: opening, closing: closing };
  }

  // Form A statements from the seed row definitions (10 §5.13)
  function financialStatement(code, o) {
    o = o || {};
    var asOf = o.asOf || D.meta.today;
    var yearStart = asOf.slice(0, 4) + '-01-01';
    var rows = D.statementRows.filter(function (r) { return r[0] === code; })
      .map(function (r) { return { report: r[0], rowNo: r[1], code: r[2], name: r[3], type: r[4], totaling: r[5], amountType: r[6], show: r[7], opp: r[8], indent: r[9] }; });
    var cols;
    if (code === 'SBT') cols = [{ id: 'begin', label: 'Эхний үлдэгдэл (' + fmtDate(D.company.goLiveDate) + ')', mode: 'opening' }, { id: 'end', label: 'Эцсийн үлдэгдэл (' + fmtDate(asOf) + ')', mode: 'range', from: null, to: asOf }];
    else if (code === 'ODT') cols = [{ id: 'prev', label: 'Өмнөх жил', mode: 'range', from: (+asOf.slice(0, 4) - 1) + '-01-01', to: (+asOf.slice(0, 4) - 1) + '-12-31' }, { id: 'cur', label: 'Тайлант үе (' + fmtDate(yearStart) + '–' + fmtDate(asOf) + ')', mode: 'range', from: yearStart, to: asOf }];
    else cols = [{ id: 'cur', label: fmtDate(o.from || yearStart) + '–' + fmtDate(asOf), mode: 'range', from: o.from || yearStart, to: asOf }];
    var values = {};
    cols.forEach(function (c) {
      var vals = {};
      var cf = code === 'MGT' ? cashFlow({ from: c.from, to: c.to }) : null;
      rows.forEach(function (r) {
        var v = 0;
        if (r.type === 'P') {
          if (c.mode === 'opening') v = glBalance(r.totaling, null, null, { onlyOpening: true });
          else if (r.amountType === 'B') v = glBalance(r.totaling, c.to);
          else if (r.amountType === 'G') v = cf ? cf.opening : glBalance(r.totaling, addDays(c.from, -1));
          else v = glBalance(r.totaling, c.to, c.from, { excludeClosing: true });   // net change: the year-end closing voucher (D-D4) would zero ОДТ
        } else if (r.type === 'C') {
          v = r.totaling.split('|').reduce(function (s, k) { return s + (cf.categories[k] || 0); }, 0);
        } else if (r.type === 'F') {
          var toks = r.totaling.split(/([+-])/), sign = 1;
          toks.forEach(function (t) { if (t === '+') sign = 1; else if (t === '-') sign = -1; else if (t) v += sign * (vals[t] || 0); });
        }
        if (r.code) vals[r.code] = v;
        r['v_' + c.id] = r.type === 'H' ? null : v;
      });
      values[c.id] = vals;
    });
    return { code: code, asOf: asOf, columns: cols, rows: rows, values: values,
      displayValue: function (r, colId) { var v = r['v_' + colId]; return v === null ? null : (r.opp ? -v : v); } };
  }

  // ТТ-03а (08 §5.9) from VAT entries; R-VAT-26/27 sign rules; NULL group = all groups
  function vatReturn(period) {
    var vp0 = S.vatPeriods.filter(function (p) { return p.period === period; })[0];
    var es = vatScope(vp0);
    var rows = D.tt03aRows.map(function (r) { return { row: r[0], name: r[1], type: r[2], genType: r[3], vatBus: r[4], vatProd: r[5], category: r[6], rowTot: r[7], amountType: r[8], confirmed: r[9], calcOpp: r[10], printOpp: r[11], box: r[12] }; });
    var vals = {};
    rows.forEach(function (r) {
      var v = 0;
      if (r.type === 'V') {
        r.entries = es.filter(function (e) {
          return e.type === r.genType && (!r.vatBus || e.vatBus === r.vatBus) && (!r.vatProd || e.vatProd === r.vatProd) &&
            (!r.category || e.category === r.category) && (!r.confirmed || e.deductibleConfirmed);
        });
        r.entries.forEach(function (e) {
          var x = r.amountType === 'BASE' ? e.base : r.amountType === 'AMOUNT' ? e.amount : r.amountType === 'NON_DEDUCTIBLE_AMOUNT' ? e.nonDeductibleAmount : e.amount + e.nonDeductibleAmount;
          v += x;
        });
        if (r.calcOpp) v = -v;
      } else if (r.type === 'R') {
        r.rowTot.split('|').forEach(function (k) { v += vals[k] || 0; });
      }
      if (r.type !== 'D') { vals[r.row] = v; r.value = v; r.printValue = r.printOpp ? -v : v; }
    });
    var vp = S.vatPeriods.filter(function (p) { return p.period === period; })[0];
    return { period: period, vatPeriod: vp, rows: rows, values: vals, entries: es,
      unconfirmed: vp.status === 'OPEN' ? E.vat.unconfirmedInput(vp.end) : [] };
  }

  // Aging by due date (D-F7, 10 §6.10) from detailed entries up to asOf
  var AGING_BUCKETS = [{ id: 'notdue', label: 'Хугацаа болоогүй', to: -1 }, { id: 'b0', label: '0–30', from: 0, to: 30 },
    { id: 'b31', label: '31–60', from: 31, to: 60 }, { id: 'b61', label: '61–90', from: 61, to: 90 }, { id: 'b91', label: '90+', from: 91 }];
  function aging(kind, asOf) {
    asOf = asOf || D.meta.today;
    var entries = kind === 'customer' ? S.cle : S.vle;
    var det = kind === 'customer' ? S.dcle : S.dvle, ek = kind === 'customer' ? 'cleEntryNo' : 'vleEntryNo', pk = kind === 'customer' ? 'customer' : 'vendor';
    var remByEntry = {};
    det.forEach(function (d) { if (d.postingDate <= asOf) remByEntry[d[ek]] = (remByEntry[d[ek]] || 0) + d.amount; });
    var parties = {};
    entries.forEach(function (e) {
      if (e.postingDate > asOf) return;
      var rem = remByEntry[e.entryNo] || 0;
      if (rem === 0) return;
      var days = daysBetween(e.dueDate, asOf);
      var b = AGING_BUCKETS.filter(function (x) { return (x.from === undefined || days >= x.from) && (x.to === undefined || days <= x.to); })[0];
      var p = parties[e[pk]] || (parties[e[pk]] = { party: e[pk], name: (kind === 'customer' ? SET.customers : SET.vendors)[e[pk]].name, total: 0, buckets: {}, entries: [], maxDays: -9999 });
      p.total += rem; p.buckets[b.id] = (p.buckets[b.id] || 0) + rem; p.entries.push({ entry: e, remaining: rem, days: days, bucket: b.id });
      if (rem * (kind === 'customer' ? 1 : -1) > 0) p.maxDays = Math.max(p.maxDays, days);
    });
    return { kind: kind, asOf: asOf, buckets: AGING_BUCKETS, parties: Object.keys(parties).map(function (k) { return parties[k]; }) };
  }

  function salesByMonth(year) {                          // CUE-11 basis: invoices − credit memos, excl. VAT
    var m = []; for (var i = 1; i <= 12; i++) m.push({ month: year + '-' + String(i).padStart(2, '0'), amount: 0, count: 0 });
    S.salesInvoices.forEach(function (p) { if (p.postingDate.slice(0, 4) === String(year)) { var x = m[+p.postingDate.slice(5, 7) - 1]; x.amount += p.amount; x.count++; } });
    S.salesCrMemos.forEach(function (p) { if (p.postingDate.slice(0, 4) === String(year)) { m[+p.postingDate.slice(5, 7) - 1].amount -= p.amount; } });
    return m;
  }

  E.reports = {
    glBalance: glBalance, bankBalance: bankBalance, accountFilter: accountFilter, trialBalance: trialBalance,
    cashFlow: cashFlow, financialStatement: financialStatement, vatReturn: vatReturn, aging: aging, salesByMonth: salesByMonth,
    cashAccounts: cashAccounts,
    accountEntries: function (no, from, to) { return S.glEntries.filter(function (e) { return e.account === no && (!from || e.postingDate >= from) && (!to || e.postingDate <= to); }); },
    // mock bank statement for a month: posted bank entries + extras that are only on the bank's side
    bankStatement: function (bankNo, ym) {
      var start = ym + '-01', end = endOfMonth(start);
      var lines = S.ble.filter(function (b) { return b.bank === bankNo && monthOf(b.postingDate) === ym && !b.reversed; })
        .map(function (b) { return { date: b.postingDate, amount: b.amount, text: b.description + (b.party ? ' / ' + b.party : ''), bleEntryNo: b.entryNo }; });
      D.bankStatementExtras.filter(function (x) { return x.bank === bankNo && monthOf(x.date) === ym; })
        .forEach(function (x) { lines.push({ date: x.date, amount: toCents(x.amount), text: x.text, bleEntryNo: null }); });
      lines.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var opening = bankBalance(bankNo, addDays(start, -1));
      var closing = opening + lines.reduce(function (s, l) { return s + l.amount; }, 0);
      return { bank: bankNo, month: ym, openingBalance: opening, closingBalance: closing, lines: lines };
    }
  };

  // ===========================================================================
  // 12. eBarimt (12 §4–§10, §13): receipt JSON, simulated PosAPI, status machine
  // ===========================================================================
  function ddtdFor(dateStr, timeStr, seq) {              // fake 33 digits: 0 + merchant TIN + yyyymmdd + hhmmss + 7-digit seq
    return '0' + D.ebarimtSetup.merchantTin + dateStr.replace(/-/g, '') + timeStr.replace(/:/g, '') + String(seq).padStart(7, '0');
  }
  function pseudoRandomDigits(seed, n) {
    var x = seed * 9301 + 49297, s = '';
    for (var i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; s += String(Math.floor(x / 233280 * 10)); }
    return s;
  }
  function itemsFromLines(lines) {                        // 12 §6.2 BuildItems (STRICT_SPLIT)
    var L = lines.filter(function (l) { return l.type !== 'COMMENT' && l.aiv !== 0; }).map(function (l) {
      return { src: l, G: l.aiv, V: l.vat, C: 0, taxType: l.taxType, qty5: parseScaled(l.qty, 5) };
    });
    // MAP-04: absorb negative lines into positive lines of the same taxType (running remainder)
    ['VAT_ABLE', 'VAT_ZERO', 'VAT_FREE', 'NOT_VAT'].forEach(function (t) {
      var P = L.filter(function (x) { return x.taxType === t && x.G > 0; }), N = L.filter(function (x) { return x.taxType === t && x.G < 0; });
      if (!N.length) return;
      var W = P.map(function (p) { return p.G; }), base = W.reduce(function (a, b) { return a + b; }, 0);
      ['G', 'V'].forEach(function (f) {
        var amount = N.reduce(function (s, n) { return s + n[f]; }, 0), remaining = amount;
        P.forEach(function (p, i) { if (i === P.length - 1) { p[f] += remaining; return; } var share = Number(roundDiv(BigInt(amount) * BigInt(W[i]), BigInt(base))); p[f] += share; remaining -= share; });
      });
      L = L.filter(function (x) { return N.indexOf(x) < 0; });
    });
    var items = [];
    L.filter(function (x) { return x.G > 0; }).forEach(function (x) {
      var l = x.src, G = BigInt(x.G), Q = x.qty5;
      var base = { name: l.description, barCode: l.barcode || (l.type === 'ITEM' ? l.no : l.classificationCode), barCodeType: l.barcode ? (l.barcodeType || 'UNDEFINED') : 'UNDEFINED',
        classificationCode: l.classificationCode, taxProductCode: x.taxType === 'VAT_ABLE' ? null : (l.taxProductCode || null), measureUnit: l.uomName || 'ш', taxType: x.taxType, sourceLineNo: l.lineNo };
      var mk = function (q5, unitCents, total, vat) { var o = JSON.parse(JSON.stringify(base)); o.qty5 = q5; o.unitPrice = unitCents; o.totalAmount = total; o.totalVAT = vat; o.totalCityTax = 0; return o; };
      if ((G * TEN(5)) % Q === 0n) { items.push(mk(Q, Number(G * TEN(5) / Q), x.G, x.V)); return; }
      var isInt = Q % TEN(5) === 0n, q = Q / TEN(5);
      if (isInt && q >= 2n && G / q >= 1n) {
        var p = G / q, gA = p * (q - 1n), gB = G - gA;
        var vA = Number(roundDiv(BigInt(x.V) * gA, G));
        items.push(mk((q - 1n) * TEN(5), Number(p), Number(gA), vA));
        items.push(mk(TEN(5), Number(gB), Number(gB), x.V - vA));
        return;
      }
      var it = mk(TEN(5), x.G, x.G, x.V); it.name = l.description + ' (' + fmtQty(Q) + ' ' + (l.uomName || '') + ')'; items.push(it);
    });
    return items;
  }
  var TAX_ORDER = ['VAT_ABLE', 'VAT_ZERO', 'VAT_FREE', 'NOT_VAT'];   // MAP-01
  function money2(c) { return Number((c / 100).toFixed(2)); }
  // Builds the PosAPI request object (field order of 12 §22). Amounts are numbers with 2 decimals (AMT-21).
  function buildReceiptRequest(posted, doc, o) {
    o = o || {};
    var setup = D.ebarimtSetup;
    var lines = o.lines || posted.lines;
    var items = itemsFromLines(lines);
    var receipts = TAX_ORDER.filter(function (t) { return items.some(function (i) { return i.taxType === t; }); }).map(function (t) {
      var its = items.filter(function (i) { return i.taxType === t; });
      return { totalAmount: its.reduce(function (s, i) { return s + i.totalAmount; }, 0), taxType: t, merchantTin: setup.merchantTin, customerTin: null,
        totalVAT: its.reduce(function (s, i) { return s + i.totalVAT; }, 0), totalCityTax: 0, bankAccountNo: '', iBan: '', invoiceId: null, items: its };
    });
    var total = receipts.reduce(function (s, r) { return s + r.totalAmount; }, 0);
    var totalVat = receipts.reduce(function (s, r) { return s + r.totalVAT; }, 0);
    var type = (doc && doc.type) || posted.ebarimtType;
    var billSeq = doc ? doc.billSeq : (o.billSeq || 0);
    var req = {
      branchNo: setup.branchNo, totalAmount: money2(total), totalVAT: money2(totalVat), totalCityTax: 0.00, districtCode: setup.districtCode,
      merchantTin: setup.merchantTin, posNo: setup.posNo, customerTin: type === 'B2B_RECEIPT' ? posted.customerTin : null,
      consumerNo: type === 'B2C_RECEIPT' ? (posted.ebarimtConsumerNo || '') : '', type: type,
      inactiveId: doc ? doc.inactiveId : (o.inactiveId || null), invoiceId: null, reportMonth: doc ? doc.reportMonth || null : null,
      billIdSuffix: setup.posNo + String(billSeq % 1000000).padStart(6, '0'),
      receipts: receipts.map(function (r) {
        return { totalAmount: money2(r.totalAmount), taxType: r.taxType, merchantTin: r.merchantTin, customerTin: null, totalVAT: money2(r.totalVAT),
          totalCityTax: 0.00, bankAccountNo: '', iBan: '', invoiceId: null,
          items: r.items.map(function (i) {
            return { name: i.name, barCode: i.barCode, barCodeType: i.barCodeType, classificationCode: i.classificationCode, taxProductCode: i.taxProductCode,
              measureUnit: i.measureUnit, qty: Number(fmtQty(i.qty5).replace(/ /g, '')), unitPrice: money2(i.unitPrice), totalAmount: money2(i.totalAmount),
              totalVAT: money2(i.totalVAT), totalCityTax: 0.00 };
          }) };
      }),
      payments: [{ code: (D.paymentMethods[posted.method] || {}).ebarimt || 'BANK_TRANSFER', status: 'PAID', paidAmount: money2(total) }]
    };
    Object.defineProperty(req, '_cents', { value: { total: total, vat: totalVat, receipts: receipts, items: items }, enumerable: false });
    return req;
  }
  // AMT-03 sum chain check (exact, in cents)
  function receiptChainOk(req) {
    var c = req._cents, ok = true, msgs = [];
    c.items.forEach(function (i) {
      if (BigInt(i.unitPrice) * i.qty5 !== BigInt(i.totalAmount) * TEN(5)) { ok = false; msgs.push('qty × unitPrice ≠ totalAmount: ' + i.name); }
    });
    c.receipts.forEach(function (r) {
      if (r.items.reduce(function (s, i) { return s + i.totalAmount; }, 0) !== r.totalAmount) { ok = false; msgs.push('receipt total'); }
      if (r.items.reduce(function (s, i) { return s + i.totalVAT; }, 0) !== r.totalVAT) { ok = false; msgs.push('receipt VAT'); }
    });
    var paid = Math.round(req.payments.reduce(function (s, p) { return s + p.paidAmount * 100; }, 0));
    if (paid !== c.total) { ok = false; msgs.push('payments ≠ total'); }
    return { ok: ok, messages: msgs };
  }
  function simulatePosApi(req, doc, scenario) {          // returns a PosAPI-like response; qrData/lottery only here
    var date = doc.queuedAt.slice(0, 10), time = doc.queuedAt.slice(11, 19);
    if (scenario === 'UNKNOWN') return { timeout: true };
    if (scenario === 'ERROR') return { status: 'ERROR', message: doc.errorText || 'ebarimt.rejected', date: date + ' ' + time };
    var id = ddtdFor(date, time, doc.billSeq);
    return { id: id, version: '3.2.48', totalAmount: req.totalAmount, totalVAT: req.totalVAT, totalCityTax: 0.00, branchNo: req.branchNo,
      districtCode: req.districtCode, merchantTin: req.merchantTin, posNo: req.posNo, type: req.type, billIdSuffix: req.billIdSuffix,
      receipts: req.receipts.map(function (r, i) { return { id: id.slice(0, 31) + String(10 + i), taxType: r.taxType, totalAmount: r.totalAmount, totalVAT: r.totalVAT }; }),
      posId: 100001, status: 'SUCCESS', message: '', date: date + ' ' + time, easy: false,
      qrData: pseudoRandomDigits(doc.billSeq, 120),
      lottery: req.type === 'B2C_RECEIPT' ? ('ЖБ ' + pseudoRandomDigits(doc.billSeq + 7, 8)) : null };
  }
  function addSeconds(ts, s) { var t = Date.UTC(+ts.slice(0, 4), +ts.slice(5, 7) - 1, +ts.slice(8, 10), +ts.slice(11, 13), +ts.slice(14, 16), +ts.slice(17, 19)) + s * 1000; var d = new Date(t); return isoDate(t) + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ':' + String(d.getUTCSeconds()).padStart(2, '0'); }
  // store only what 12 §22.1 says to store: ddtd, ebarimt date, sub-receipt ids, status — never qrData/lottery (D-J3, INV-15)
  function applyResponse(doc, resp, at) {
    if (resp.timeout) { doc.status = 'UNKNOWN'; doc.events.push({ at: at, status: 'UNKNOWN', text: 'Хариу ирсэнгүй (timeout). Автоматаар дахин илгээхгүй — гараар шийдвэрлэнэ (D-J2).' }); return; }
    if (resp.status !== 'SUCCESS') { doc.status = 'ERROR'; doc.errorCode = resp.message; doc.events.push({ at: at, status: 'ERROR', text: 'PosAPI татгалзсан: ' + resp.message }); return; }
    doc.status = 'SUCCESS'; doc.ddtd = resp.id; doc.ebarimtDate = resp.date;
    doc.subReceipts.forEach(function (s, i) { s.subId = resp.receipts[i] ? resp.receipts[i].id : null; });
    doc.events.push({ at: resp.date, status: 'SUCCESS', text: 'Бүртгэгдсэн. ДДТД олгогдсон.' });
  }
  function ebarimtEnqueue(posted, o) {                   // called inside posting (BR-SAL-95); dispatch is after commit
    o = o || {};
    var isCm = posted.docType === 'CREDIT_MEMO';
    var original = isCm && o.target ? S.ebarimtDocs.filter(function (d) { return d.id === o.target.ebarimtDocId; })[0] : null;
    var operation = 'SAVE', inactiveId = null, netLines = null;
    var type = posted.ebarimtType;
    if (isCm) {
      type = original ? original.type : posted.ebarimtType;                       // TYP-06: credit memo inherits the chain type
      posted.ebarimtType = type;
      inactiveId = original ? original.ddtd : null;
      var credited = S.salesCrMemos.filter(function (c) { return c.appliesTo === posted.appliesTo; });
      netLines = netStateLines(o.target, credited);
      if (!netLines.length && type === 'B2C_RECEIPT') { operation = 'DELETE'; }
    }
    var seq = operation === 'DELETE' ? null : next('BILL_SEQ');
    var hh = 9 + (S.counters.EBARIMT % 9), mm = (S.counters.EBARIMT * 7) % 60;
    var queuedAt = posted.postingDate + ' ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String((S.counters.EBARIMT * 13) % 60).padStart(2, '0');
    var doc = { id: 'EB-' + String(next('EBARIMT')).padStart(5, '0'), sourceType: isCm ? 'SALES_CR_MEMO' : 'SALES_INVOICE', sourceNo: posted.no, customer: posted.customer,
      type: type, operation: operation, status: 'PENDING', ddtd: null, ebarimtDate: null, billSeq: seq, billIdSuffix: seq ? D.ebarimtSetup.posNo + String(seq % 1000000).padStart(6, '0') : null,
      customerTin: type === 'B2B_RECEIPT' ? posted.customerTin : null, consumerNo: type === 'B2C_RECEIPT' ? (posted.ebarimtConsumerNo || '') : null,
      inactiveId: inactiveId, reportMonth: null, mode: (type === 'B2C_RECEIPT' && (o.interactive || posted.method === 'CASH')) ? 'SYNC_FIRST' : 'ASYNC',
      queuedAt: queuedAt, totals: null, subReceipts: [], lines: null, netLines: netLines, errorCode: null, errorText: o.error || null,
      events: [{ at: queuedAt, status: 'PENDING', text: 'Outbox-д бичигдлээ (posting-ийн transaction дотор).' }], scenario: o.scenario || 'SUCCESS' };
    var req = operation === 'DELETE' ? null : buildReceiptRequest(posted, doc, { lines: netLines || posted.lines });
    if (req) {
      doc.totals = { amount: req._cents.total, vat: req._cents.vat, cityTax: 0 };
      doc.subReceipts = req._cents.receipts.map(function (r) { return { taxType: r.taxType, amount: r.totalAmount, vat: r.totalVAT, subId: null }; });
      doc.lines = req._cents.items.map(function (i) { return { name: i.name, qty: fmtQty(i.qty5).replace(/ /g, ''), unitPrice: i.unitPrice, total: i.totalAmount, vat: i.totalVAT, taxType: i.taxType, classificationCode: i.classificationCode, barCode: i.barCode }; });
    }
    S.ebarimtDocs.push(doc);
    posted.ebarimtDocId = doc.id;
    var printPayload = null;
    if (o.interactive && doc.mode === 'SYNC_FIRST') {     // 12 §10.5 SYNC_FIRST: send right after commit, print payload to the caller only
      var resp = dispatch(doc);
      if (resp && resp.qrData) printPayload = { docId: doc.id, ddtd: resp.id, date: resp.date, qrData: resp.qrData, lottery: resp.lottery, request: req };
    } else if (!o.interactive) {
      dispatch(doc);                                       // historical data: the worker already ran
    }
    return { doc: doc, printPayload: printPayload };
  }
  function netStateLines(invoice, creditMemos) {          // 12 §12.3 net state = invoice − credit memos (per line no / item)
    if (!invoice) return [];
    var net = invoice.lines.map(function (l) { return JSON.parse(JSON.stringify(l)); });
    creditMemos.forEach(function (cm) {
      cm.lines.forEach(function (cl) {
        var t = net.filter(function (l) { return l.no === cl.no && l.aiv > 0; })[0];
        if (!t) return;
        var q = parseScaled(t.qty, 5) - parseScaled(cl.qty, 5);
        t.aiv -= cl.aiv; t.vat -= cl.vat; t.amount -= cl.amount;
        if (cl.unitPrice === t.unitPrice || q > 0n) t.qty = fmtQty(q > 0n ? q : TEN(5)).replace(/ /g, '');
      });
    });
    return net.filter(function (l) { return l.aiv > 0; });
  }
  function dispatch(doc) {                                 // worker / sync send; returns the raw response (caller decides what to keep)
    if (doc.status !== 'PENDING' || doc.scenario === 'PENDING') return null;
    var sentAt = addSeconds(doc.queuedAt, 2);
    doc.status = 'SENT'; doc.events.push({ at: sentAt, status: 'SENT', text: 'PosAPI руу илгээж байна (max_attempts = 1).' });
    if (doc.operation === 'DELETE') { doc.status = 'SUCCESS'; doc.events.push({ at: addSeconds(sentAt, 1), status: 'SUCCESS', text: 'DELETE /rest/receipt амжилттай (бүтэн буцаалт).' }); return { status: 'SUCCESS' }; }
    var posted = E.sales.getPosted(doc.sourceNo);
    var req = buildReceiptRequest(posted, doc, { lines: doc.netLines || posted.lines });
    var resp = simulatePosApi(req, doc, doc.scenario);
    resp.date = resp.date ? addSeconds(sentAt, 1) : resp.date;
    applyResponse(doc, resp, addSeconds(sentAt, resp.timeout ? 20 : 1));
    return resp;
  }
  function chainStatus(posted) {                          // 12 §9.4 read model shown on the posted document
    if (!posted.ebarimtDocId) return posted.ebarimtType === 'NONE' ? 'NOT_REQUIRED' : 'NOT_CONFIGURED';
    var doc = S.ebarimtDocs.filter(function (d) { return d.id === posted.ebarimtDocId; })[0];
    if (posted.docType === 'INVOICE') {
      var corr = S.ebarimtDocs.filter(function (d) { return d.sourceType === 'SALES_CR_MEMO' && d.inactiveId && d.inactiveId === doc.ddtd && d.status === 'SUCCESS'; });
      if (corr.length) return corr.some(function (d) { return d.operation === 'DELETE'; }) ? 'VOIDED' : 'CORRECTED';
    }
    return doc.status;
  }
  E.ebarimt = {
    decideType: decideEbarimtType,
    documents: function () { return S.ebarimtDocs; },
    get: function (id) { return S.ebarimtDocs.filter(function (d) { return d.id === id; })[0] || null; },
    buildRequest: function (docOrPosted) {                // rebuilds the request from the stored snapshot (AMT-23: JSON itself is not stored)
      if (docOrPosted && docOrPosted.sourceNo) { var p = E.sales.getPosted(docOrPosted.sourceNo); return docOrPosted.operation === 'DELETE' ? null : buildReceiptRequest(p, docOrPosted, { lines: docOrPosted.netLines || p.lines }); }
      return buildReceiptRequest(docOrPosted, null, {});
    },
    chainOk: receiptChainOk,
    dispatch: function (id) { var d = E.ebarimt.get(id); var r = d ? dispatch(d) : null; return r ? { status: d.status } : null; },  // response (with qrData) is dropped here
    chainStatus: chainStatus,
    itemsFromLines: itemsFromLines
  };

  // ===========================================================================
  // 13. Home cues (15 §3.3), month-end checklist (10 §4.4)
  // ===========================================================================
  function cues() {
    var Dt = D.meta.today, out = {};
    var openInv = S.cle.filter(function (e) { return e.open && e.documentType === 'INVOICE' && !e.reversed; });
    out['CUE-01'] = { value: openInv.reduce(function (s, e) { return s + e.remaining; }, 0), count: openInv.length, state: 'NONE' };
    var overdue = openInv.filter(function (e) { return e.dueDate < Dt; });
    var ovCust = {}; overdue.forEach(function (e) { ovCust[e.customer] = true; });
    out['CUE-02'] = { value: overdue.reduce(function (s, e) { return s + e.remaining; }, 0), count: Object.keys(ovCust).length, entries: overdue.length };
    out['CUE-02'].state = out['CUE-02'].value > 0 ? 'UNFAVORABLE' : 'FAVORABLE';
    var byKind = { CASH: 0, BANK: 0, WALLET: 0 };
    D.bankAccounts.forEach(function (b) { byKind[b.kind] = (byKind[b.kind] || 0) + bankBalance(b.no, Dt); });
    out['CUE-03'] = { value: byKind.CASH + byKind.BANK + byKind.WALLET, breakdown: byKind, state: 'NONE' };
    var P = S.vatPeriods.filter(function (p) { return p.status !== 'SUBMITTED' && p.start <= Dt; })[0];
    if (P) {
      var v = vatReturn(P.period).values['14'];             // same scope and rows as ТТ-03а (08 §5.9)
      var days = daysBetween(Dt, P.due);
      out['CUE-04'] = { value: v, period: P.period, due: P.due, days: days, state: days <= 3 ? 'UNFAVORABLE' : days <= 7 ? 'AMBIGUOUS' : 'NONE', current: P.end >= Dt };
    }
    var inProg = S.ebarimtDocs.filter(function (d) { return d.status === 'PENDING' || d.status === 'SENT'; });
    var oldest = inProg.reduce(function (m, d) { return !m || d.queuedAt < m ? d.queuedAt : m; }, null);
    var ageH = oldest ? Math.round((parseDate(Dt) + 9 * 3600000 - parseDate(oldest.slice(0, 10)) - (+oldest.slice(11, 13)) * 3600000) / 3600000) : 0;
    out['CUE-05'] = { value: inProg.length, oldest: oldest, ageHours: ageH, state: !inProg.length || ageH <= 1 ? 'FAVORABLE' : ageH <= 24 ? 'AMBIGUOUS' : 'UNFAVORABLE' };
    var errs = S.ebarimtDocs.filter(function (d) { return d.status === 'ERROR' || d.status === 'UNKNOWN'; });
    out['CUE-06'] = { value: errs.length, unknown: errs.filter(function (d) { return d.status === 'UNKNOWN'; }).length, state: errs.length ? 'UNFAVORABLE' : 'FAVORABLE' };
    var noEb = S.salesInvoices.filter(function (p) { return p.ebarimtType !== 'NONE' && !p.ebarimtDocId; });
    out['CUE-07'] = { value: noEb.length, state: noEb.length ? 'UNFAVORABLE' : 'FAVORABLE' };
    var left = D.ebarimtSetup.posapiInstance.leftLotteries - S.session.b2cPrinted, W = 100;
    out['CUE-08'] = { value: left, lastSendData: D.ebarimtSetup.posapiInstance.lastSendData, state: left < W ? 'UNFAVORABLE' : left < 2 * W ? 'AMBIGUOUS' : 'FAVORABLE' };
    out['CUE-09'] = { value: S.drafts.length, state: 'NONE' };
    var unrec = 0;
    D.bankAccounts.filter(function (b) { return b.kind === 'BANK'; }).forEach(function (b) {
      var thr = D.reconciledThrough[b.no] || '0000';
      unrec += S.ble.filter(function (x) { return x.bank === b.no && x.postingDate > thr && x.postingDate <= Dt; }).length;
      unrec += D.bankStatementExtras.filter(function (x) { return x.bank === b.no && x.date > thr; }).length;
    });
    out['CUE-10'] = { value: unrec, state: unrec > 0 ? 'AMBIGUOUS' : 'NONE' };
    var ym = monthOf(Dt);
    out['CUE-11'] = { value: salesByMonth(+Dt.slice(0, 4))[+ym.slice(5, 7) - 1].amount, month: ym, state: 'NONE' };
    var openVle = S.vle.filter(function (e) { return e.open && e.documentType === 'INVOICE' && !e.reversed; });
    var due7 = openVle.filter(function (e) { return e.dueDate >= Dt && e.dueDate <= addDays(Dt, 7); });
    out['CUE-12'] = { value: -due7.reduce(function (s, e) { return s + e.remaining; }, 0), count: due7.length, state: 'NONE' };
    var ovp = openVle.filter(function (e) { return e.dueDate < Dt; });
    out['CUE-13'] = { value: -ovp.reduce(function (s, e) { return s + e.remaining; }, 0), count: ovp.length, state: ovp.length ? 'UNFAVORABLE' : 'FAVORABLE' };
    var unc = E.vat.unconfirmedInput(Dt);
    out['CUE-14'] = { value: unc.reduce(function (s, e) { return s + e.amount; }, 0), count: unc.length,
      state: unc.length ? ((out['CUE-04'] && out['CUE-04'].days <= 3) ? 'UNFAVORABLE' : 'AMBIGUOUS') : 'NONE' };
    var cur = periodOf(Dt), closed = S.periods.filter(function (p) { return p.status !== 'OPEN'; }).slice(-1)[0];
    var prev = S.periods.filter(function (p) { return p.end < Dt; }).slice(-1)[0];
    out['CUE-15'] = { value: cur ? cur.status : null, period: cur ? cur.period : null, lastClosed: closed ? closed.period : null,
      state: prev && prev.status === 'OPEN' && +Dt.slice(8, 10) > D.fiscalYear.vatReturnDueDay ? 'AMBIGUOUS' : 'NONE', prevOpen: prev && prev.status === 'OPEN' ? prev.period : null };
    out['CUE-16'] = { value: S.dcle.reduce(function (s, d) { return s + d.amount; }, 0), state: 'NONE' };
    out['CUE-17'] = { value: -S.dvle.reduce(function (s, d) { return s + d.amount; }, 0), due7: out['CUE-12'].value, state: 'NONE' };
    return out;
  }

  function closeChecklist(period) {                       // 10 §4.4 BR-PER-30..41 (subset)
    var p = S.periods.filter(function (x) { return x.period === period; })[0];
    var end = p.end, items = [];
    var bankOpen = 0;
    D.bankAccounts.filter(function (b) { return b.kind === 'BANK'; }).forEach(function (b) {
      var thr = D.reconciledThrough[b.no] || '0000';
      bankOpen += S.ble.filter(function (x) { return x.bank === b.no && x.postingDate > thr && x.postingDate <= end; }).length;
    });
    items.push({ code: 'BANK_UNRECONCILED', label: 'Банкны тулгалт', status: bankOpen ? 'WARNING' : 'OK', count: bankOpen, detail: bankOpen + ' банкны бичилт хуулгатай тулгагдаагүй', link: '#bank-rec', rule: 'BR-PER-31' });
    items.push({ code: 'CASH_COUNTED', label: 'Кассын тооллого (гараар баталгаажуулна)', status: 'WARNING', manual: true, detail: 'Сарын эцсийн тооллогыг баталгаажуулаагүй', link: '#cash', rule: 'BR-PER-32' });
    var unmapped = SET.accountList.filter(function (a) { return a.type === 'POSTING' && (!a.line || !a.cf) && S.glEntries.some(function (e) { return e.account === a.no && e.postingDate <= end; }); });
    items.push({ code: 'FORM_A_MAPPING', label: 'Маягт А-гийн харгалзаа', status: unmapped.length ? 'BLOCKING' : 'OK', count: unmapped.length, detail: unmapped.length ? unmapped.map(function (a) { return a.no; }).join(', ') : 'Бичилттэй бүх данс СБТ/ОДТ ба МГТ-д харгалзсан', link: '#coa', rule: 'BR-PER-33' });
    var ebOpen = S.ebarimtDocs.filter(function (d) { return monthOf(d.queuedAt) === period && d.status !== 'SUCCESS'; });
    items.push({ code: 'EBARIMT_OPEN', label: 'eBarimt асуудалгүй', status: ebOpen.length ? 'WARNING' : 'OK', count: ebOpen.length, detail: ebOpen.length ? ebOpen.map(function (d) { return d.sourceNo + ' ' + d.status; }).join(', ') : 'Бүх баримт бүртгэгдсэн', link: '#ebarimt', rule: 'BR-PER-34' });
    var unc = E.vat.unconfirmedInput(end);
    items.push({ code: 'INPUT_VAT_UNCONFIRMED', label: 'Орцын НӨАТ баталгаажсан', status: unc.length ? 'WARNING' : 'OK', count: unc.length, amount: unc.reduce(function (s, e) { return s + e.amount; }, 0), detail: unc.length ? unc.length + ' бичилт ДДТД-гүй / баталгаажаагүй' : 'Бүгд баталгаажсан', link: '#purchase-invoices', rule: 'BR-PER-35' });
    var vp = S.vatPeriods.filter(function (x) { return x.period === period; })[0];
    items.push({ code: 'VAT_RETURN_NOT_CLOSED', label: 'НӨАТ-ын хаалт', status: vp.status === 'OPEN' ? 'WARNING' : 'OK', detail: vp.status === 'OPEN' ? 'НӨАТ-ын үе нээлттэй (төлөх хугацаа ' + fmtDate(vp.due) + ')' : 'Хаагдсан', link: '#vat-return', rule: 'BR-PER-36' });
    var drafts = S.drafts.filter(function (d) { return d.postingDate && d.postingDate >= p.start && d.postingDate <= end; });
    items.push({ code: 'DRAFTS_IN_PERIOD', label: 'Сарын ноорог баримт', status: drafts.length ? 'WARNING' : 'OK', count: drafts.length, detail: drafts.length + ' ноорог', link: '#sales-invoices', rule: 'BR-PER-37' });
    var inv = invariants().filter(function (c) { return /^(INV-11|AP-SUB|BANK-SUB)/.test(c.id); });
    var diff = inv.filter(function (c) { return !c.pass; });
    items.push({ code: 'SUBLEDGER_GL_DIFF', label: 'Дэд дэвтэр = Ерөнхий дэвтэр', status: diff.length ? 'WARNING' : 'OK', detail: diff.length ? diff.map(function (c) { return c.name; }).join('; ') : 'Авлага, өглөг, мөнгөний данс тэнцсэн', link: '#checks', rule: 'BR-PER-38' });
    var cf = cashFlow({ from: p.start, to: end });
    var x = cf.categories.NON_CASH || 0;
    items.push({ code: 'CF_UNCLASSIFIED', label: 'МГТ ангилаагүй мөнгөн гүйлгээ', status: x ? 'WARNING' : 'OK', amount: x, detail: x ? fmtCents(x, { sym: true }) : '0 ₮', link: '#financial-statements', rule: 'BR-PER-39' });
    var payroll = S.glEntries.some(function (e) { return ['7120', '7201', '6130'].indexOf(e.account) >= 0 && monthOf(e.postingDate) === period; });
    items.push({ code: 'PAYROLL_NOT_POSTED', label: 'Цалингийн журнал', status: payroll ? 'OK' : 'WARNING', detail: payroll ? 'Бичигдсэн' : 'Энэ сард цалингийн бичилт алга', link: '#journal', rule: 'BR-PER-41' });
    return { period: period, items: items, ok: items.filter(function (i) { return i.status === 'OK'; }).length };
  }
  E.home = { cues: cues, closeChecklist: closeChecklist };

  // ===========================================================================
  // 14. Invariants (03 §5, #checks)
  // ===========================================================================
  function deepHasKey(obj, keys, path, seen) {
    if (!obj || typeof obj !== 'object') return null;
    seen = seen || new Set();
    if (seen.has(obj)) return null; seen.add(obj);
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (keys.indexOf(k) >= 0) return path + '.' + k;
      var r = deepHasKey(obj[k], keys, path + '.' + k, seen);
      if (r) return r;
    }
    return null;
  }
  function invariants() {
    var checks = [];
    var add = function (id, name, pass, detail, rule) { checks.push({ id: id, name: name, pass: !!pass, detail: detail, rule: rule }); };
    // INV-01 balanced transactions
    var sums = {};
    S.glEntries.forEach(function (e) { sums[e.transactionNo] = (sums[e.transactionNo] || 0) + e.amount; });
    var unb = Object.keys(sums).filter(function (k) { return sums[k] !== 0; });
    add('INV-01', 'Гүйлгээ бүр тэнцсэн (Σ дүн = 0)', unb.length === 0, S.transactions.length + ' гүйлгээ, ' + S.glEntries.length + ' G/L бичилт; тэнцээгүй: ' + (unb.length ? unb.join(', ') : 'алга'), 'D-C5, BR-PST-22');
    // trial balance
    var tb = trialBalance({});
    var t = tb.totals;
    add('TB', 'Гүйлгээ баланс: дебит = кредит', t.debit === t.credit && t.closingDebit === t.closingCredit && t.openingDebit === t.openingCredit,
      'Гүйлгээ Дт ' + fmtCents(t.debit) + ' / Кт ' + fmtCents(t.credit) + '; эцсийн Дт ' + fmtCents(t.closingDebit) + ' / Кт ' + fmtCents(t.closingCredit), 'FR-RPT-001');
    // INV-11 AR subledger = control accounts
    Object.keys(D.customerPostingGroups).forEach(function (g) {
      var a = D.customerPostingGroups[g].receivables;
      var sub = S.dcle.filter(function (d) { return d.cpg === g; }).reduce(function (s, d) { return s + d.amount; }, 0);
      var gl = glBalance(a);
      if (sub === 0 && gl === 0 && g !== 'DOMESTIC') return;
      add('INV-11/' + a, 'Авлагын дэд дэвтэр = ' + a + ' дансны үлдэгдэл', sub === gl, 'Дэд дэвтэр ' + fmtCents(sub) + ' · G/L ' + fmtCents(gl), 'INV-11, BR-AR-08');
    });
    Object.keys(D.vendorPostingGroups).forEach(function (g) {
      var a = D.vendorPostingGroups[g].payables;
      var sub = S.dvle.filter(function (d) { return d.vpg === g; }).reduce(function (s, d) { return s + d.amount; }, 0);
      var gl = glBalance(a);
      if (sub === 0 && gl === 0 && g !== 'DOMESTIC') return;
      add('AP-SUB/' + a, 'Өглөгийн дэд дэвтэр = ' + a + ' дансны үлдэгдэл', sub === gl, 'Дэд дэвтэр ' + fmtCents(sub) + ' · G/L ' + fmtCents(gl), 'INV-11 (өглөг), BR-PST-42');
    });
    D.bankAccounts.forEach(function (b) {
      var gl = glBalance(bankGlAccount(b.no)), sub = bankBalance(b.no);
      add('BANK-SUB/' + b.no, b.name + ': банкны дэвтэр = ' + bankGlAccount(b.no), gl === sub, 'BLE ' + fmtCents(sub) + ' · G/L ' + fmtCents(gl), 'BR-PST-42');
    });
    // INV-04 remaining = Σ detailed; INV-26
    var badRem = S.cle.filter(function (e) { return e.remaining !== S.dcle.filter(function (d) { return d.cleEntryNo === e.entryNo; }).reduce(function (s, d) { return s + d.amount; }, 0); })
      .concat(S.vle.filter(function (e) { return e.remaining !== S.dvle.filter(function (d) { return d.vleEntryNo === e.entryNo; }).reduce(function (s, d) { return s + d.amount; }, 0); }));
    add('INV-04', 'Үлдэгдэл = detailed бичилтийн нийлбэр', badRem.length === 0, (S.cle.length + S.vle.length) + ' бичилт шалгав; зөрүүтэй: ' + badRem.length, 'INV-04, D-F3');
    var over = S.cle.concat(S.vle).filter(function (e) { return Math.abs(e.remaining) > Math.abs(e.amount) || (e.remaining !== 0 && Math.sign(e.remaining) !== Math.sign(e.amount)); });
    add('INV-26', 'Хэтрүүлж тулгаагүй (|үлдэгдэл| ≤ |дүн|, тэмдэг хадгалагдсан)', over.length === 0, 'Зөрчил: ' + over.length, 'INV-26, BR-AR-06');
    // VAT entries = VAT control accounts
    var vatSum = S.vatEntries.reduce(function (s, e) { return s + e.amount; }, 0);
    var vatGl = glBalance('2300') + glBalance('1300');
    add('VAT-GL', 'НӨАТ-ын бичилт = 2300 + 1300 дансны үлдэгдэл', vatSum === vatGl, 'Σ VAT entry ' + fmtCents(vatSum) + ' · G/L ' + fmtCents(vatGl), 'BR-TAX-28, BR-PST-36');
    // VAT return per period = VAT entries
    var vrBad = [];
    S.vatPeriods.forEach(function (p) {
      if (p.start > D.meta.today) return;
      var vr = vatReturn(p.period), sc = vatScope(p);
      var sale = -sc.filter(function (e) { return e.type === 'SALE' && e.category === 'VAT10'; }).reduce(function (s, e) { return s + e.amount; }, 0);
      var ded = sc.filter(function (e) { return e.type === 'PURCHASE' && e.vatBus === 'DOMESTIC' && e.vatProd === 'VAT10' && e.deductibleConfirmed; }).reduce(function (s, e) { return s + e.amount; }, 0);
      if (vr.values['2'] !== sale || vr.values['12'] !== -ded || vr.values['14'] !== sale - ded) vrBad.push(p.period);
      if (p.settlementNet !== null && p.settlementNet !== vr.values['14']) vrBad.push(p.period + ' (хаалт)');
    });
    add('VAT-RETURN', 'ТТ-03а мөр 2, 12, 14 = НӨАТ-ын бичилт; хаалтын дүн = мөр 14', vrBad.length === 0, vrBad.length ? 'Зөрүүтэй үе: ' + vrBad.join(', ') : 'Бүх үе тэнцсэн', 'D-E8, FR-TAX-013');
    // document VAT = VAT entries = eBarimt total VAT
    var docBad = [];
    S.salesInvoices.concat(S.salesCrMemos).forEach(function (p) {
      var ve = S.vatEntries.filter(function (e) { return e.transactionNo === p.transactionNo; }).reduce(function (s, e) { return s + e.amount; }, 0);
      var expect = p.docType === 'INVOICE' ? -p.vatAmount : p.vatAmount;
      var lineSum = p.lines.reduce(function (s, l) { return s + l.vat; }, 0);
      if (ve !== expect || lineSum !== p.vatAmount) docBad.push(p.no);
      if (p.docType === 'INVOICE' && p.ebarimtDocId) {
        var d = E.ebarimt.get(p.ebarimtDocId);
        if (d.totals && (d.totals.vat !== p.vatAmount || d.totals.amount !== p.amountInclVat)) docBad.push(p.no + ' (eBarimt)');
      }
    });
    add('BR-TAX-37', 'Баримтын НӨАТ = мөрийн НӨАТ-ын нийлбэр = VAT entry = eBarimt totalVAT', docBad.length === 0, docBad.length ? docBad.join(', ') : (S.salesInvoices.length + S.salesCrMemos.length) + ' баримт тэнцсэн', 'BR-SAL-23, BR-TAX-37, AMT-05');
    var chainBad = S.ebarimtDocs.filter(function (d) { var r = d.operation === 'DELETE' ? null : E.ebarimt.buildRequest(d); return r && !receiptChainOk(r).ok; });
    add('AMT-03', 'eBarimt нийлбэрийн гинж (qty × unitPrice = totalAmount; Σ items = receipt; Σ payments = total)', chainBad.length === 0, S.ebarimtDocs.length + ' баримт; алдаатай: ' + chainBad.length, '12 AMT-03');
    // balance sheet
    var sbt = financialStatement('SBT', {});
    var a = sbt.values.end['1.3'], le = sbt.values.end['2.3'];
    add('SBT', 'СБТ: хөрөнгө = өр төлбөр + эздийн өмч (тайлант үеийн ашиг орно)', a + le === 0 && sbt.values.begin['1.3'] + sbt.values.begin['2.3'] === 0,
      'Хөрөнгө ' + fmtCents(a) + ' = Өр + өмч ' + fmtCents(-le), 'FR-RPT-008, R-45');
    var mgt = financialStatement('MGT', {});
    add('MGT', 'МГТ: эцсийн мөнгө = дэвтрийн мөнгөн хөрөнгө; ангилаагүй (X) = 0', mgt.values.cur['CHK'] === 0 && (mgt.values.cur['X'] || 0) === 0,
      'МГТ 7 = ' + fmtCents(mgt.values.cur['7']) + ' · дэвтэр ' + fmtCents(mgt.values.cur['LEDGER']) + ' · X = ' + fmtCents(mgt.values.cur['X'] || 0), 'FR-RPT-011, BR-PER-39');
    // ODT net profit = −Σ income statement accounts
    var odt = financialStatement('ODT', {});
    var plSum = glBalance(function (n) { return n >= '5000'; }, D.meta.today, D.fiscalYear.year + '-01-01', { excludeClosing: true });
    add('ODT', 'ОДТ 22 (цэвэр ашиг) = орлого, зардлын дансны нийлбэр', odt.values.cur['22'] === plSum, 'ОДТ 22 ' + fmtCents(-odt.values.cur['22']) + ' · данс ' + fmtCents(-plSum), 'FR-RPT-009');
    // INV-08 gapless numbering
    var gaps = [];
    var used = {};
    S.transactions.forEach(function (t) { if (t.documentNo) used[t.documentNo] = true; });
    S.cashVouchers.forEach(function (c) { used[c.no] = true; });
    Object.keys(S.series).forEach(function (k) {
      var code = k.split('|')[0], y = k.split('|')[1], def = D.numberSeries[code];
      for (var i = 1; i <= S.series[k].last; i++) { var no = def.prefix + '-' + y + '-' + String(i).padStart(def.width, '0'); if (!used[no]) gaps.push(no); }
    });
    add('INV-08', 'Хуулийн дугаар завсаргүй (SI, SC, PI, KO, KZ, BR, BP, GJ, OB)', gaps.length === 0, Object.keys(S.series).map(function (k) { return k.split('|')[0] + ' ' + S.series[k].last; }).join(' · ') + (gaps.length ? ' · завсар: ' + gaps.join(', ') : ''), 'D-C7, INV-08');
    var en = S.glEntries.map(function (e) { return e.entryNo; });
    var contiguous = en.every(function (n, i) { return n === i + 1; });
    add('INV-09', 'Entry / transaction дугаар дараалсан, давхардалгүй', contiguous && S.transactions.every(function (t, i) { return t.transactionNo === i + 1; }), 'G/L 1..' + en.length + ', гүйлгээ 1..' + S.transactions.length, 'INV-09, BR-PST-28');
    var leak = deepHasKey(S, ['qrData', 'lottery'], 'state');
    add('INV-15', 'qrData / lottery хаана ч хадгалагдаагүй', !leak, leak ? 'Олдсон: ' + leak : 'Төлөвийн бүх объектыг шалгав', 'D-J3, INV-15');
    var negCash = [];
    D.bankAccounts.filter(function (b) { return b.preventNegative; }).forEach(function (b) {
      var bal = 0;
      S.ble.filter(function (x) { return x.bank === b.no; }).sort(function (x, y) { return x.postingDate < y.postingDate ? -1 : x.postingDate > y.postingDate ? 1 : x.entryNo - y.entryNo; })
        .forEach(function (x) { bal += x.amount; if (bal < 0) negCash.push(b.no + ' ' + x.postingDate); });
    });
    add('INV-19', 'Касс сөрөг үлдэгдэлгүй (огноо бүрээр)', negCash.length === 0, negCash.length ? negCash.join(', ') : 'Кассын хамгийн бага үлдэгдэл сөрөг биш', 'D-G1, INV-19');
    return checks;
  }
  E.invariants = invariants;

  // ===========================================================================
  // 15. Boot: post the source transactions in date order
  // ===========================================================================
  var PRIORITY = { journal: 1, purchaseInvoice: 1, salesInvoice: 1, salesCreditMemo: 2, receipt: 3, vendorPayment: 3, bankGl: 3, transfer: 3, vatPayment: 3, vatSettlement: 9 };
  function postSource(x) {
    var r;
    switch (x.t) {
      case 'journal': r = postJournal(x); break;
      case 'salesInvoice':
      case 'salesCreditMemo': {
        var d = newDraft(x.cust, { no: 'SRC-' + x.id, docType: x.t === 'salesInvoice' ? 'INVOICE' : 'CREDIT_MEMO', documentDate: x.date, postingDate: x.date, lines: x.lines,
          appliesTo: x.appliesTo ? (S.refs[x.appliesTo] ? S.refs[x.appliesTo].docNo : null) : null, reason: x.reason || null });
        r = postSalesDraft(d, { ref: x.id, ebarimt: x.ebarimt, ebarimtError: x.ebarimtError, interactive: false });
        if (r.ok) S.refs[x.id] = { kind: 'CLE', entryNo: r.posted.cleEntryNo, docNo: r.posted.no };
        break;
      }
      case 'purchaseInvoice': r = postPurchaseInvoice(x); break;
      case 'receipt': r = postReceipt(x); break;
      case 'vendorPayment': r = postVendorPayment(x); break;
      case 'bankGl': r = postBankGl(x); break;
      case 'transfer': r = postTransfer(x); break;
      case 'vatSettlement': r = vatSettle(x.period, x.date); break;
      case 'vatPayment': r = vatPay(x.period, x.date, x.bank); break;
      default: r = { ok: false, errors: [{ code: 'unknown', message: x.t }] };
    }
    if (!r.ok) throw new Error('Source ' + (x.id || x.t) + ' ' + x.date + ' failed: ' + r.errors.map(function (e) { return e.code + ' ' + e.message; }).join('; '));
    return r;
  }
  function boot() {
    D = ERP.data;
    SET = buildSetup();
    S = emptyState();
    var src = D.sources.map(function (x, i) { return { x: x, i: i }; });
    src.sort(function (a, b) {
      if (a.x.date !== b.x.date) return a.x.date < b.x.date ? -1 : 1;
      var pa = PRIORITY[a.x.t], pb = PRIORITY[b.x.t];
      if (a.x.t === 'journal' && a.x.source === 'OPENING') pa = 0;
      if (b.x.t === 'journal' && b.x.source === 'OPENING') pb = 0;
      return pa !== pb ? pa - pb : a.i - b.i;
    });
    src.forEach(function (o) { postSource(o.x); });
    // period / VAT period statuses after the history (D-D3)
    S.periods.forEach(function (p) { p.status = D.fiscalYear.periodStatus[p.period.slice(5, 7)] || 'OPEN'; });
    S.vatPeriods.forEach(function (p) { var st = D.fiscalYear.vatPeriodStatus[p.period.slice(5, 7)]; if (st === 'SUBMITTED') p.status = 'SUBMITTED'; });
    // bank entries up to the last reconciliation are matched to statements
    S.ble.forEach(function (b) { var thr = D.reconciledThrough[b.bank]; if (thr && b.postingDate <= thr) b.statementStatus = 'CLOSED'; });
    // drafts
    D.drafts.forEach(function (dr) { var d = newDraft(dr.customer, { no: dr.no, documentDate: dr.documentDate, postingDate: dr.postingDate, lines: dr.lines, createdBy: dr.createdBy, note: dr.note }); S.drafts.push(d); });
    return E;
  }
  E.boot = boot;
  E.state = function () { return S; };
  E.periods = { list: function () { return S.periods; }, of: periodOf, vatOf: vatPeriodOf,
    setStatus: function (period, status) { var p = S.periods.filter(function (x) { return x.period === period; })[0]; if (p) p.status = status; return p; } };
  E.version = '0.1.0';
})();
