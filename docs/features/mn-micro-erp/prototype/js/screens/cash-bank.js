/* =============================================================================
   js/screens/cash-bank.js — #cash (S-BNK-03/04/05: МХ-1 / МХ-2 cash vouchers, print form) and #bank-rec
   (S-BNK-08 statement import wizard, S-BNK-09 reconciliation worksheet, FR-BNK-016 report, S-BNK-10 history).

   Posting goes through ERP.engine (payments.receipt / vendorPayment / bankGl / transfer, journal.post with
   series BR/BP and source PAYMTRECON). Things the shared engine does not have are implemented here as
   screen-local helpers (see "engine gaps" in the README hand-off):
     - MoneyWords.ToMongolian (09 §6.9) and the per-day negative-cash pre-check (09 §6.11);
     - Norm / NormName / Nearness / Compress (09 §6.10), the BC matching-rule table (09 §6.7.2), phase A / phase B
       auto-match (09 §5.9), text-to-account rules (seed mn_40_setup.sql);
     - CSV statement parsing with header detection, synonym mapping and Хаан / Голомт presets (09 §5.8);
     - reconciliation state (statement status, last statement no / balance, snapshots, undo) — kept in this
       closure (REC), the ledger itself is only changed through the engine's posting functions.
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;
  var E = function () { return ERP.engine; };
  var CASH = 'CASH01';
  var STMT_MONTH = '2026-09';

  // ---------------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------------
  function S() { return E().state(); }
  function fmtM(c, o) { return E().money.fmt(c, o); }
  function today() { return ERP.data.meta.workDate; }
  function opt(v, label, sel, dis) { return '<option value="' + ui.esc(v) + '"' + (sel ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + ui.esc(label) + '</option>'; }
  function centsStr(c) { var a = Math.abs(c); return (c < 0 ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0'); }
  function csvNum(c) { var a = Math.abs(c); return (c < 0 ? '-' : '') + String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(a % 100).padStart(2, '0'); }
  function userName() { var r = app.state.role; var u = ERP.data.company.users.filter(function (x) { return x.role === r; })[0]; return u ? u.name : ''; }
  function acc(no) { return E().setup.account(no); }
  function accLabel(no) { var a = acc(no); return no + (a ? ' · ' + a.name : ''); }
  function bankName(no) { var b = E().setup.bank(no); return b ? b.name : no; }
  function maxDate(a, b) { return a > b ? a : b; }
  function mask(s) { s = String(s || ''); if (!s) return ''; return s.length <= 4 ? s.replace(/./g, '*') : s.slice(0, 2) + '*'.repeat(s.length - 4) + s.slice(-2); }
  function sum(arr, f) { return arr.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
  function directAccounts() {
    return E().setup.accounts().filter(function (a) { return a.type === 'POSTING' && a.direct && a.no.slice(0, 2) !== '11'; });
  }
  function mnDateWords(iso) { return iso.slice(0, 4) + ' оны ' + iso.slice(5, 7) + ' сарын ' + iso.slice(8, 10); }
  function errBox(errors, title) { return ui.errList(errors, title); }

  // ===========================================================================
  // 1. MoneyWords.ToMongolian (09 §6.9, BR-BNK-24)
  // ===========================================================================
  // Numeric words are always in the attributive form (they are followed by another word or by "төгрөг");
  // "мянга" becomes "мянган" only as the last word; "сая", "тэрбум" never change; "нэг" is always written.
  var W_ONES = ['', 'нэг', 'хоёр', 'гурван', 'дөрвөн', 'таван', 'зургаан', 'долоон', 'найман', 'есөн'];
  var W_TENS = ['', 'арван', 'хорин', 'гучин', 'дөчин', 'тавин', 'жаран', 'далан', 'наян', 'ерэн'];
  var W_SCALES = [[1e9, 'тэрбум'], [1e6, 'сая'], [1e3, 'мянга'], [1, '']];
  function moneyWords(cents) {
    cents = Math.abs(Math.round(cents || 0));
    var i = Math.floor(cents / 100), f = cents % 100, words = [], steps = [], rest = i;
    if (i === 0) words.push('тэг');
    W_SCALES.forEach(function (g) {
      var n = Math.floor(rest / g[0]);
      rest = rest % g[0];
      if (!n) return;
      var part = [], h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10;
      if (h) part.push(W_ONES[h], 'зуун');
      if (t) part.push(W_TENS[t]);
      if (u) part.push(W_ONES[u]);
      if (g[1]) part.push(g[1]);
      steps.push({ n: n, scale: g[1] || 'нэгж', words: part.slice() });
      words = words.concat(part);
    });
    var lastChanged = false;
    if (words[words.length - 1] === 'мянга') { words[words.length - 1] = 'мянган'; lastChanged = true; }
    var s = words.join(' ') + ' төгрөг ' + String(f).padStart(2, '0') + ' мөнгө';
    return { text: s.charAt(0).toUpperCase() + s.slice(1), steps: steps, integer: i, fraction: f, lastChanged: lastChanged };
  }

  // ===========================================================================
  // 2. Text normalisation and nearness (09 §6.10)
  // ===========================================================================
  var TR = { 'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'YO', 'Ж': 'J', 'З': 'Z', 'И': 'I', 'Й': 'I', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'Ө': 'U', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ү': 'U', 'Ф': 'F', 'Х': 'KH', 'Ц': 'TS', 'Ч': 'CH', 'Ш': 'SH',
    'Щ': 'SH', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'YU', 'Я': 'YA' };
  function norm(s) {
    var u = String(s === null || s === undefined ? '' : s).normalize('NFKC').toUpperCase(), out = '';
    for (var k = 0; k < u.length; k++) out += Object.prototype.hasOwnProperty.call(TR, u[k]) ? TR[u[k]] : u[k];
    return out.replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  var LEGAL = { 'ХХК': 1, 'ХК': 1, 'ТӨХК': 1, 'ТББ': 1, 'ХЗХ': 1, 'ББСБ': 1, 'LLC': 1, 'LTD': 1, 'JSC': 1, 'INC': 1 };
  function normName(s) {
    var toks = String(s || '').normalize('NFKC').toUpperCase().split(/\s+/).filter(function (t) { return !LEGAL[t.replace(/[^\p{L}\p{N}]/gu, '')]; });
    return norm(toks.join(' '));
  }
  function compress(s) { return norm(s).replace(/ /g, ''); }
  function tokensOf(s) { var o = {}; String(s || '').split(/\s+/).forEach(function (t) { var c = compress(t); if (c) o[c] = true; }); return o; }
  function normAccount(s) {
    var t = String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (/^MN\d{18}$/.test(t)) t = t.slice(-12);
    t = t.replace(/^0+/, '');
    return t.length < 6 ? null : t;
  }
  function lcs(a, b) {                                   // longest common substring
    var best = { L: 0, i: 0, j: 0 };
    if (!a || !b) return best;
    var prev = new Array(b.length + 1).fill(0);
    for (var i = 1; i <= a.length; i++) {
      var cur = new Array(b.length + 1).fill(0);
      for (var j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best.L) best = { L: cur[j], i: i - cur[j], j: j - cur[j] }; }
      }
      prev = cur;
    }
    return best;
  }
  function nearness(a, b) {                              // RMM: Σ LCS pieces ≥ 4 / shorter length
    a = String(a).replace(/ /g, ''); b = String(b).replace(/ /g, '');
    var short = Math.min(a.length, b.length), total = 0, pieces = [];
    if (!short) return { score: 0, pieces: pieces, short: 0, total: 0 };
    for (;;) {
      var r = lcs(a, b);
      if (r.L < 4) break;
      total += r.L; pieces.push(a.substr(r.i, r.L));
      a = a.slice(0, r.i) + a.slice(r.i + r.L); b = b.slice(0, r.j) + b.slice(r.j + r.L);
    }
    return { score: Math.floor(100 * total / short), pieces: pieces, short: short, total: total };
  }
  function exactScore(base, text) { base = String(base).replace(/ /g, ''); text = String(text).replace(/ /g, ''); return base.length ? Math.floor(100 * lcs(base, text).L / base.length) : 0; }
  function fnv(str, seed) {                              // prototype file / line hash (the system uses SHA-256)
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function hash16(str) { return fnv(str, 2166136261) + fnv(str, 2166136261 ^ 0x5bd1e995); }

  // ===========================================================================
  // 3. Matching rules (09 §6.7.2) and text-to-account rules (seed)
  // ===========================================================================
  var RULES = [
    ['H02', 'HIGH', 2, 'FULLY', 'YES_MULTIPLE', 'ONE_MATCH'], ['H03', 'HIGH', 3, 'FULLY', 'YES_MULTIPLE', 'MULTIPLE'],
    ['H04', 'HIGH', 4, 'FULLY', 'YES', 'ONE_MATCH'], ['H05', 'HIGH', 5, 'FULLY', 'YES', 'MULTIPLE'],
    ['H06', 'HIGH', 6, 'PARTIALLY', 'YES_MULTIPLE', 'ONE_MATCH'], ['H07', 'HIGH', 7, 'PARTIALLY', 'YES_MULTIPLE', 'MULTIPLE'],
    ['H08', 'HIGH', 8, 'PARTIALLY', 'YES', 'ONE_MATCH'], ['H09', 'HIGH', 9, 'FULLY', 'NO', 'ONE_MATCH'],
    ['H10', 'HIGH', 10, 'NO', 'YES_MULTIPLE', 'ONE_MATCH'], ['H11', 'HIGH', 11, 'NO', 'YES_MULTIPLE', 'MULTIPLE'],
    ['M01', 'MEDIUM', 1, 'FULLY', 'YES_MULTIPLE', null], ['M02', 'MEDIUM', 2, 'FULLY', 'YES', null],
    ['M03', 'MEDIUM', 3, 'FULLY', 'NO', 'MULTIPLE'], ['M04', 'MEDIUM', 4, 'PARTIALLY', 'YES_MULTIPLE', null],
    ['M05', 'MEDIUM', 5, 'PARTIALLY', 'YES', null], ['M06', 'MEDIUM', 6, 'NO', 'YES', 'ONE_MATCH'],
    ['M07', 'MEDIUM', 7, 'NO', 'YES_MULTIPLE', null], ['M08', 'MEDIUM', 8, 'PARTIALLY', 'NO', 'ONE_MATCH'],
    ['M09', 'MEDIUM', 9, 'NO', 'YES', null],
    ['L01', 'LOW', 1, 'FULLY', 'NO', 'NO_MATCHES'], ['L02', 'LOW', 2, 'PARTIALLY', 'NO', 'MULTIPLE'],
    ['L03', 'LOW', 3, 'PARTIALLY', 'NO', 'NO_MATCHES'], ['L04', 'LOW', 4, 'NO', 'NO', 'ONE_MATCH'], ['L05', 'LOW', 5, 'NO', 'NO', 'MULTIPLE']
  ];
  var CONF_N = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  var MIN_SCORE = 1995, DATE_TOL = 3, TEXT_RULE_DAYS = 2, NAME_EXACT = 95, NAME_MIN_LEN_RATIO = 0.65, MAX_PROPOSALS = 5;
  function ruleScore(r) { return 1000 * (CONF_N[r[1]] + 1) - r[2]; }
  function bestRule(party, doc, amount) {
    for (var i = 0; i < RULES.length; i++) { var r = RULES[i]; if (r[3] === party && r[4] === doc && (r[5] === null || r[5] === amount)) return r; }
    return null;
  }
  // bank.text_to_account_mapping seed (mn_40_setup.sql): debit = inflow account, credit = outflow account (BC T1251)
  var TEXT_RULES = [
    { lineNo: 10000, text: 'ШИМТГЭЛ', debit: null, credit: '8300', seed: true },
    { lineNo: 20000, text: 'ХАДГАЛАМЖИЙН ХҮҮ', debit: '8110', credit: null, seed: true },
    { lineNo: 30000, text: 'ХҮҮНИЙ ОРЛОГО', debit: '8110', credit: null, seed: true }
  ];
  var LEARNED = {};        // BR-BNK-72 / SCR-BNK-01: normalised counterparty account → { type, no }
  var CONF = { HIGH: ['●', 'Өндөр'], HIGH_TEXT_TO_ACCOUNT: ['●', 'Дүрэм'], MEDIUM: ['◐', 'Дунд'], LOW: ['◔', 'Бага'], NONE: ['○', 'Алга'], MANUAL: ['✎', 'Гараар'], ACCEPTED: ['✓', 'Батлагдсан'] };
  var SIG_MN = { FULLY: 'Бүрэн', PARTIALLY: 'Хэсэгчлэн', NO: 'Үгүй', YES: 'Тийм', YES_MULTIPLE: 'Олон баримт', ONE_MATCH: 'Ганц', MULTIPLE: 'Олон', NO_MATCHES: 'Таараагүй' };
  function confHtml(c, sugg) {
    var x = CONF[c] || CONF.NONE;
    return '<span class="conf ' + c + (sugg ? ' sugg' : '') + '"><span aria-hidden="true">' + x[0] + '</span>' + x[1] + (sugg ? ' · санал' : '') + '</span>';
  }

  // ===========================================================================
  // 4. Statement files: presets, synonyms, embedded sample files (Хаан / Голомт, 2026-09)
  // ===========================================================================
  var PRESETS = {
    KHAN: { code: 'KHAN_XLSX', name: 'Хаан банк — KHAN_XLSX (CSV хувилбар)', dateFormat: 'yyyy.MM.dd HH:mm:ss',
      cols: { TRANSACTION_DATE: 'Гүйлгээний огноо', VALUE_DATE: 'Огноо', DEBIT_AMOUNT: 'Дебит гүйлгээ', CREDIT_AMOUNT: 'Кредит гүйлгээ', DESCRIPTION: 'Гүйлгээний утга',
        COUNTERPARTY_ACCOUNT: 'Харьцсан данс', TRANSACTION_ID: 'Журнал', RUNNING_BALANCE: 'Эцсийн үлдэгдэл' } },
    GOLOMT: { code: 'GOLOMT_CSV', name: 'Голомт банк — GOLOMT_CSV', dateFormat: 'yyyy-MM-dd',
      cols: { TRANSACTION_DATE: 'Гүйлгээ хийсэн огноо', DESCRIPTION: 'Гүйлгээний утга', COUNTERPARTY_NAME: 'Харьцсан дансны нэр', COUNTERPARTY_ACCOUNT: 'Харьцсан данс',
        DEBIT_AMOUNT: 'Дебит', CREDIT_AMOUNT: 'Кредит', RUNNING_BALANCE: 'Үлдэгдэл', TRANSACTION_ID: 'Гүйлгээний дугаар' } }
  };
  var BANK_PRESET = { KHAN01: 'KHAN', GOLOMT01: 'GOLOMT' };
  var TARGETS = [['TRANSACTION_DATE', 'Гүйлгээний огноо'], ['VALUE_DATE', 'Бодит огноо'], ['AMOUNT', 'Дүн (тэмдэгтэй)'], ['DEBIT_AMOUNT', 'Дебит (данснаас гарсан)'],
    ['CREDIT_AMOUNT', 'Кредит (данс руу орсон)'], ['DESCRIPTION', 'Гүйлгээний утга'], ['COUNTERPARTY_NAME', 'Харьцагчийн нэр'], ['COUNTERPARTY_ACCOUNT', 'Харьцсан данс'],
    ['PAYMENT_REFERENCE', 'Лавлах дугаар'], ['TRANSACTION_ID', 'Гүйлгээний id'], ['RUNNING_BALANCE', 'Үлдэгдэл'], ['CURRENCY', 'Валют']];
  function targetLabel(t) { var x = TARGETS.filter(function (p) { return p[0] === t; })[0]; return x ? x[1] : '—'; }
  var SYN = {                                            // 09 §5.8.2
    TRANSACTION_DATE: ['Огноо', 'Гүйлгээний огноо', 'Гүйлгээ хийсэн огноо', 'Date', 'Tran date', 'Transaction date', 'tranDate'],
    VALUE_DATE: ['Бодит огноо', 'Хүчинтэй огноо', 'Value date', 'postDate'],
    AMOUNT: ['Дүн', 'Гүйлгээний дүн', 'Amount'],
    DEBIT_AMOUNT: ['Дебит', 'Дебит гүйлгээ', 'Зарлага', 'Гарсан', 'Debit', 'Withdrawal'],
    CREDIT_AMOUNT: ['Кредит', 'Кредит гүйлгээ', 'Орлого', 'Орсон', 'Credit', 'Deposit'],
    DESCRIPTION: ['Гүйлгээний утга', 'Утга', 'Тайлбар', 'Гүйлгээний тайлбар', 'Description', 'Narrative'],
    COUNTERPARTY_NAME: ['Харьцсан дансны нэр', 'Харьцагч', 'Илгээгч', 'Хүлээн авагч', 'Counterparty', 'Related name'],
    COUNTERPARTY_ACCOUNT: ['Харьцсан данс', 'Харилцагчийн данс', 'Илгээгчийн данс', 'Хүлээн авагчийн данс', 'Related account', 'relatedAccount'],
    PAYMENT_REFERENCE: ['Лавлах', 'Лавлах дугаар', 'Reference', 'Ref'],
    TRANSACTION_ID: ['Гүйлгээний дугаар', 'Журнал', 'Журналын дугаар', 'Record', 'Transaction ID', 'journal'],
    RUNNING_BALANCE: ['Үлдэгдэл', 'Эцсийн үлдэгдэл', 'Balance'],
    CURRENCY: ['Валют', 'Currency']
  };
  var DATE_FORMATS = [
    ['yyyy-MM-dd', /^(\d{4})-(\d{2})-(\d{2})$/, 'ymd'], ['yyyy.MM.dd', /^(\d{4})\.(\d{2})\.(\d{2})$/, 'ymd'], ['yyyy/MM/dd', /^(\d{4})\/(\d{2})\/(\d{2})$/, 'ymd'],
    ['dd.MM.yyyy', /^(\d{2})\.(\d{2})\.(\d{4})$/, 'dmy'], ['dd/MM/yyyy', /^(\d{2})\/(\d{2})\/(\d{4})$/, 'dmy'], ['MM/dd/yyyy', /^(\d{2})\/(\d{2})\/(\d{4})$/, 'mdy'],
    ['yyyyMMdd', /^(\d{4})(\d{2})(\d{2})$/, 'ymd'], ['yyyy-MM-dd HH:mm:ss', /^(\d{4})-(\d{2})-(\d{2}) \d{2}:\d{2}:\d{2}$/, 'ymd'],
    ['yyyy.MM.dd HH:mm:ss', /^(\d{4})\.(\d{2})\.(\d{2}) \d{2}:\d{2}:\d{2}$/, 'ymd'], ['yyyy/MM/dd HH:mm', /^(\d{4})\/(\d{2})\/(\d{2}) \d{2}:\d{2}$/, 'ymd'],
    ['dd.MM.yyyy HH:mm', /^(\d{2})\.(\d{2})\.(\d{4}) \d{2}:\d{2}$/, 'dmy'], ['dd/MM/yyyy HH:mm:ss', /^(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}:\d{2}$/, 'dmy'],
    ['yyyy-MM-ddTHH:mm:ss', /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}$/, 'ymd']
  ];
  function parseDateFmt(s, name) {
    var f = DATE_FORMATS.filter(function (x) { return x[0] === name; })[0];
    if (!f) return null;
    var m = f[1].exec(String(s || '').trim());
    if (!m) return null;
    var y, mo, d;
    if (f[2] === 'ymd') { y = +m[1]; mo = +m[2]; d = +m[3]; } else if (f[2] === 'dmy') { d = +m[1]; mo = +m[2]; y = +m[3]; } else { mo = +m[1]; d = +m[2]; y = +m[3]; }
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (y < 2000 || y > 2200 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function anyDate(s) { for (var i = 0; i < DATE_FORMATS.length; i++) { var d = parseDateFmt(s, DATE_FORMATS[i][0]); if (d) return { iso: d, fmt: DATE_FORMATS[i][0] }; } return null; }
  function detectDateFormat(values) {
    var vs = values.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
    if (!vs.length) return null;
    for (var i = 0; i < DATE_FORMATS.length; i++) { var n = DATE_FORMATS[i][0]; if (vs.every(function (v) { return parseDateFmt(v, n); })) return n; }
    return null;
  }
  function isNumberCell(s) { s = String(s || '').trim(); if (!s || anyDate(s)) return false; return /^\(?-?\d+(\.\d+)?\)?$/.test(s.replace(/[\s  ,']/g, '')); }
  function parseAmountCell(s) {
    s = String(s || '').trim();
    if (!s) return { ok: true, cents: null };
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /(DR|Дт)$/i.test(s);
    var c = s.replace(/[\s  ,'()]/g, '').replace(/^-/, '').replace(/(DR|Дт)$/i, '');
    if (!/^\d+(\.\d{1,2})?$/.test(c)) return { ok: false, cents: null };
    var v = E().money.toCents(c);
    return { ok: true, cents: neg ? -v : v };
  }

  // Bank-side texts for the posted bank entries of the month (what the bank prints, not what the ERP wrote)
  function bankSideLine(bank, l, idx) {
    var b = l.bleEntryNo ? S().ble.filter(function (x) { return x.entryNo === l.bleEntryNo; })[0] : null;
    var out = { date: l.date, amount: l.amount, text: l.text, cpName: '', cpAcc: '' };
    var custAcc = function (c) { return '50000' + String(c.tin || '00000').slice(-5); };
    if (b) {
      var cle = S().cle.filter(function (e) { return e.transactionNo === b.transactionNo; })[0];
      var vle = S().vle.filter(function (e) { return e.transactionNo === b.transactionNo; })[0];
      var m;
      if (cle) {
        var c = E().setup.customer(cle.customer), inv = (/(SI-\d{4}-\d{5})/.exec(b.description) || [])[1] || '';
        out.text = (inv ? inv + ' төлбөр ' : 'Төлбөр ') + c.name; out.cpName = c.name; out.cpAcc = custAcc(c);
      } else if (vle) {
        var v = E().setup.vendor(vle.vendor);
        out.text = 'Төлбөр ' + (vle.documentNo || '') + ' ' + v.name; out.cpName = v.name; out.cpAcc = '49000' + String(v.tin).slice(-5);
      } else if ((m = /^Цалин олгосон: (\d+)-р сар/.exec(b.description))) {
        out.text = 'ЦАЛИН ' + m[1] + '-Р САР /2 АЖИЛТАН/'; out.cpName = 'Цалингийн жагсаалт';
      } else if ((m = /^ХХОАТ төлсөн: (\d+)-р сар/.exec(b.description))) {
        out.text = 'ТАТВАР ХХОАТ ' + m[1] + '-Р САР ТТД ' + ERP.data.company.tin; out.cpName = 'Татварын алба'; out.cpAcc = '100900000001';
      } else if ((m = /^НДШ төлсөн: (\d+)-р сар/.exec(b.description))) {
        out.text = 'НИЙГМИЙН ДААТГАЛ НДШ ' + m[1] + '-Р САР'; out.cpName = 'Нийгмийн даатгалын сан'; out.cpAcc = '100900000002';
      } else if ((m = /^НӨАТ төлсөн: (\d+)-р сар/.exec(b.description))) {
        out.text = 'ТАТВАР НӨАТ ' + m[1] + '-Р САР ТТД ' + ERP.data.company.tin; out.cpName = 'Татварын алба'; out.cpAcc = '100900000001';
        out.date = E().dates.addDays(l.date, 1);              // the bank processed it the next day (Δ = 1 day)
      } else out.text = b.description.toUpperCase();
    } else {
      ERP.data.customers.forEach(function (c) { if (l.text.indexOf(c.name) >= 0) { out.cpName = c.name; out.cpAcc = custAcc(c); } });
    }
    out.journal = bank === 'KHAN01' ? String(88412000 + idx * 37) : 'GT26' + String(90510 + idx * 11);
    out.time = String(9 + (idx % 8)).padStart(2, '0') + ':' + String((idx * 7) % 60).padStart(2, '0') + ':' + String((idx * 13) % 60).padStart(2, '0');
    return out;
  }
  var FILE_CACHE = {};
  function sampleFile(bank) {                            // built once from the ledger as it was when first opened
    if (FILE_CACHE[bank]) return FILE_CACHE[bank];
    var st = E().reports.bankStatement(bank, STMT_MONTH);
    var lines = st.lines.map(function (l, i) { return bankSideLine(bank, l, i + 1); });
    if (bank === 'KHAN01') {                             // statement-only line without a text rule → "○ Алга" (demo of "Данс руу бичих")
      lines.push({ date: '2026-09-30', amount: -120000, text: 'SMS МЭДЭГДЛИЙН ХУРААМЖ 9-р сар', cpName: '', cpAcc: '', journal: String(88412000 + 99 * 37), time: '23:59:10' });
    }
    lines = lines.map(function (l, i) { l.i = i; return l; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i; });
    var opening = st.openingBalance, run = opening, deb = 0, cre = 0;
    lines.forEach(function (l) { run += l.amount; l.running = run; if (l.amount < 0) deb -= l.amount; else cre += l.amount; });
    var closing = run, ba = E().setup.bank(bank), rows = [], NC = 8;
    var cell = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var row = function (cells) { while (cells.length < NC) cells.push(''); rows.push(cells.map(cell).join(',')); };
    var dot = function (iso) { return iso.replace(/-/g, '.'); };
    if (bank === 'KHAN01') {
      row(['Хаан банк — дансны хуулга (жишээ файл)']);
      row(['Данс', ba.accountNo, ERP.data.company.name]);
      row(['Хугацаа', dot(STMT_MONTH + '-01'), dot(E().dates.endOfMonth(STMT_MONTH + '-01'))]);
      row(['Эхний үлдэгдэл', csvNum(opening)]);
      row(['Эцсийн үлдэгдэл', csvNum(closing)]);
      row([]);
      row(['Гүйлгээний огноо', 'Огноо', 'Дебит гүйлгээ', 'Кредит гүйлгээ', 'Гүйлгээний утга', 'Харьцсан данс', 'Журнал', 'Эцсийн үлдэгдэл']);
      lines.forEach(function (l) { row([dot(l.date) + ' ' + l.time, dot(l.date), l.amount < 0 ? csvNum(-l.amount) : '', l.amount > 0 ? csvNum(l.amount) : '', l.text, l.cpAcc, l.journal, csvNum(l.running)]); });
      row(['', '', csvNum(deb), csvNum(cre), 'Нийт']);
    } else {
      row(['Голомт банк — хуулга (жишээ файл)']);
      row(['Дансны дугаар', ba.accountNo, ERP.data.company.name]);
      row(['Эхний үлдэгдэл', csvNum(opening)]);
      row(['Эцсийн үлдэгдэл', csvNum(closing)]);
      row([]);
      row(['Гүйлгээ хийсэн огноо', 'Гүйлгээний утга', 'Харьцсан дансны нэр', 'Харьцсан данс', 'Дебит', 'Кредит', 'Үлдэгдэл', 'Гүйлгээний дугаар']);
      lines.forEach(function (l) { row([l.date, l.text, l.cpName, l.cpAcc, l.amount < 0 ? csvNum(-l.amount) : '', l.amount > 0 ? csvNum(l.amount) : '', csvNum(l.running), l.journal]); });
      row(['', 'Нийт', '', '', csvNum(deb), csvNum(cre)]);
    }
    FILE_CACHE[bank] = { name: (bank === 'KHAN01' ? 'khan_' : 'golomt_') + ba.accountNo + '_' + STMT_MONTH + '.csv', text: rows.join('\n') + '\n', opening: opening, closing: closing };
    return FILE_CACHE[bank];
  }

  // CSV parsing and detection (09 §5.8.1 step 2)
  function parseCsv(text, delim) {
    var rows = [], row = [], cell = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function countOutside(line, d) { var n = 0, q = false; for (var i = 0; i < line.length; i++) { if (line[i] === '"') q = !q; else if (!q && line[i] === d) n++; } return n; }
  function detectFile(text) {
    var raw = String(text || '');
    var res = { fileType: raw.slice(0, 2) === 'PK' ? 'XLSX' : 'CSV', encoding: /^﻿/.test(raw) ? 'UTF-8 (BOM)' : 'UTF-8', errors: [] };
    var lines = raw.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; }).slice(0, 20);
    res.delims = [',', ';', '\t', '|'].map(function (d) {
      var counts = lines.map(function (l) { return countOutside(l, d); });
      return { d: d, counts: counts, ok: counts.length > 0 && counts[0] >= 2 && counts.every(function (c) { return c === counts[0]; }) };
    });
    var okD = res.delims.filter(function (x) { return x.ok; })[0];
    res.delimiter = okD ? okD.d : ',';
    if (!okD) res.errors.push({ code: 'bank.statement_parse_failed', message: 'Тусгаарлагч тодорхойгүй: эхний 20 мөрөнд тоо нь тогтмол ≥ 2 тэмдэгт олдсонгүй.' });
    res.rows = parseCsv(raw, res.delimiter);
    res.headerRow = -1;
    for (var r = 0; r < Math.min(30, res.rows.length - 1); r++) {
      var cells = res.rows[r].map(function (c) { return String(c).trim(); }).filter(Boolean);
      if (cells.length < 3) continue;
      var textCells = cells.filter(function (c) { return !isNumberCell(c) && !anyDate(c); }).length;
      if (textCells / cells.length < 0.5) continue;
      var next = res.rows[r + 1].map(function (c) { return String(c).trim(); });
      if (next.some(function (c) { return anyDate(c); }) && next.some(function (c) { return isNumberCell(c); })) { res.headerRow = r; break; }
    }
    if (res.headerRow < 0) { res.errors.push({ code: 'bank.statement_parse_failed', message: 'Гарчгийн мөр олдсонгүй (эхний 30 мөрөөс ≥ 50 % текст, дараагийн мөрөнд огноо ба тоо).' }); return res; }
    res.headers = res.rows[res.headerRow].map(function (h) { return String(h).trim(); });
    while (res.headers.length && !res.headers[res.headers.length - 1]) res.headers.pop();
    res.dataRows = res.rows.slice(res.headerRow + 1);
    res.opening = null; res.closing = null;
    res.rows.slice(0, res.headerRow).forEach(function (rw) {
      rw.forEach(function (c, i) {
        var n = norm(c), val = rw.slice(i + 1).filter(function (x) { return String(x).trim(); })[0];
        if (!val) return;
        var p = parseAmountCell(val);
        if (n === norm('Эхний үлдэгдэл') && p.ok) res.opening = p.cents;
        if (n === norm('Эцсийн үлдэгдэл') && p.ok) res.closing = p.cents;
      });
    });
    return res;
  }
  function suggestMapping(headers, presetKey, profile) {
    var used = {};
    return headers.map(function (h) {
      var nh = norm(h), t = null, src = '';
      var tryMap = function (cols, label) { Object.keys(cols).forEach(function (k) { if (!t && !used[k] && norm(cols[k]) === nh) { t = k; src = label; } }); };
      if (profile) tryMap(profile.cols, 'профайл');
      if (!t && presetKey && PRESETS[presetKey]) tryMap(PRESETS[presetKey].cols, 'preset');
      if (!t) Object.keys(SYN).forEach(function (k) { if (!t && !used[k] && SYN[k].some(function (s) { return norm(s) === nh; })) { t = k; src = 'синоним'; } });
      if (t) used[t] = true;
      return { header: h, norm: nh, target: t, src: src };
    });
  }
  function mappingIndex(map) { var idx = {}; map.forEach(function (m, i) { if (m.target) idx[m.target] = i; }); return idx; }
  function mappingErrors(map) {
    var idx = mappingIndex(map), errs = [];
    if (idx.TRANSACTION_DATE === undefined) errs.push({ code: 'required_missing', message: '"Гүйлгээний огноо" баганыг сонгоно уу.' });
    if (idx.DESCRIPTION === undefined) errs.push({ code: 'required_missing', message: '"Гүйлгээний утга" баганыг сонгоно уу.' });
    if (idx.AMOUNT === undefined && idx.DEBIT_AMOUNT === undefined && idx.CREDIT_AMOUNT === undefined) errs.push({ code: 'required_missing', message: 'Дүн: "Дүн (тэмдэгтэй)" эсвэл "Дебит"/"Кредит" баганыг сонгоно уу.' });
    if (idx.AMOUNT !== undefined && (idx.DEBIT_AMOUNT !== undefined || idx.CREDIT_AMOUNT !== undefined)) errs.push({ code: 'mapping_conflict', message: '"Дүн (тэмдэгтэй)" ба "Дебит/Кредит"-ийг зэрэг сонгохгүй (amount_mode нэг).' });
    return errs;
  }
  function parseStatement(det, map, dateFmt) {                     // 09 §5.8.3, BR-BNK-41..43, 47
    var idx = mappingIndex(map), lines = [], errors = [], pending = [], badRun = 0, zero = 0;
    var valueFmt = idx.VALUE_DATE !== undefined ? detectDateFormat(det.dataRows.map(function (r) { return r[idx.VALUE_DATE]; }).slice(0, 200).filter(function (v, i, a) { return v && anyDate(v); })) : null;
    for (var k = 0; k < det.dataRows.length; k++) {
      var r = det.dataRows[k], fileRow = det.headerRow + 2 + k;
      var get = function (t) { return idx[t] === undefined ? '' : String(r[idx[t]] === undefined ? '' : r[idx[t]]).trim(); };
      var d = parseDateFmt(get('TRANSACTION_DATE'), dateFmt);
      if (!d) { pending.push({ fileRow: fileRow, raw: get('TRANSACTION_DATE') }); badRun++; if (badRun >= 2) break; continue; }
      pending.forEach(function (p) { errors.push({ code: 'date_invalid', message: 'Мөр ' + p.fileRow + ': огноо "' + p.raw + '" ' + dateFmt + ' форматаар задрахгүй.', fileRow: p.fileRow }); });
      pending = []; badRun = 0;
      var line = { fileRow: fileRow, date: d, valueDate: valueFmt ? parseDateFmt(get('VALUE_DATE'), valueFmt) : null, description: get('DESCRIPTION'), cpName: get('COUNTERPARTY_NAME'),
        cpAccount: get('COUNTERPARTY_ACCOUNT'), ref: get('PAYMENT_REFERENCE'), txId: get('TRANSACTION_ID'), running: null, errors: [] };
      if (idx.AMOUNT !== undefined) {
        var a = parseAmountCell(get('AMOUNT'));
        if (!a.ok || a.cents === null) line.errors.push('amount_precision'); else line.amount = a.cents;
      } else {
        var de = parseAmountCell(get('DEBIT_AMOUNT')), cr = parseAmountCell(get('CREDIT_AMOUNT'));
        if (!de.ok || !cr.ok) line.errors.push('amount_precision');
        else if ((de.cents || 0) > 0 === (cr.cents || 0) > 0) line.errors.push('amount_ambiguous');
        else line.amount = (cr.cents || 0) - (de.cents || 0);
      }
      if (!line.description) line.errors.push('required_missing');
      if (idx.RUNNING_BALANCE !== undefined) { var rb = parseAmountCell(get('RUNNING_BALANCE')); if (rb.ok) line.running = rb.cents; }
      if (idx.CURRENCY !== undefined && get('CURRENCY') && ['MNT', '₮', 'ТӨГ'].indexOf(get('CURRENCY').toUpperCase()) < 0) line.errors.push('currency_mismatch');
      if (!line.errors.length && line.amount === 0) { zero++; continue; }
      line.errors.forEach(function (c) { errors.push({ code: c, message: 'Мөр ' + fileRow + ': ' + ({ amount_precision: 'дүн задрахгүй эсвэл 2-оос олон бутархай', amount_ambiguous: 'дебит ба кредитын яг нэг нь > 0 байх ёстой', required_missing: 'заавал талбар хоосон', currency_mismatch: 'валют дансны валюттай таарахгүй' })[c], fileRow: fileRow }); });
      lines.push(line);
    }
    var ok = lines.filter(function (l) { return !l.errors.length; });
    var opening = det.opening !== null && det.opening !== undefined ? det.opening : (ok[0] && ok[0].running !== null ? ok[0].running - ok[0].amount : null);
    var closing = det.closing !== null && det.closing !== undefined ? det.closing : (ok.length && ok[ok.length - 1].running !== null ? ok[ok.length - 1].running : null);
    var total = sum(ok, function (l) { return l.amount; }), prev = opening, runBad = [];
    ok.forEach(function (l) { if (l.running !== null && prev !== null) { l.runOk = prev + l.amount === l.running; if (!l.runOk) runBad.push(l.fileRow); prev = l.running; } });
    return { lines: lines, errors: errors, zero: zero, opening: opening, closing: closing, total: total, balanceOk: opening !== null && closing !== null && opening + total === closing,
      runBad: runBad, valueFmt: valueFmt, statementDate: ok.reduce(function (m, l) { return l.date > m ? l.date : m; }, '') };
  }

  // ===========================================================================
  // 5. Reconciliation store (bank.bank_reconciliation, bank_account_statement — prototype, in memory)
  // ===========================================================================
  var REC = {}, recSeq = 0, PROFILES = [];
  function recStore(bank) {
    if (!REC[bank]) {
      var thr = ERP.data.reconciledThrough[bank] || null;
      var st = { bank: bank, closed: {}, keys: {}, hashes: {}, open: null, history: [], lastStatementDate: thr, lastStatementNo: thr ? thr.slice(0, 7) : '',
        balanceLast: thr ? E().reports.bankBalance(bank, thr) : 0, baseline: null };
      S().ble.forEach(function (b) { if (b.bank === bank && b.statementStatus === 'CLOSED') st.closed[b.entryNo] = thr; });
      st.baseline = { statementNo: st.lastStatementNo, statementDate: thr, ending: st.balanceLast };
      REC[bank] = st;
    }
    return REC[bank];
  }
  function isOpenBle(b, st) { return b.bank === st.bank && !b.reversed && b.amount !== 0 && b.statementStatus === 'OPEN' && !Object.prototype.hasOwnProperty.call(st.closed, b.entryNo); }
  function bleByNo(n) { return S().ble.filter(function (b) { return b.entryNo === n; })[0] || null; }
  function nextStatementNo(st, date) {
    var last = st.lastStatementNo, no;
    if (!last || /^\d{4}-\d{2}$/.test(last)) no = date.slice(0, 7);
    else no = last.replace(/(\d+)(?!.*\d)/, function (d) { return String(+d + 1).padStart(d.length, '0'); });
    var used = st.history.map(function (h) { return h.statementNo; }), base = no, k = 2;
    while (used.indexOf(no) >= 0) no = base + '-' + (k++);
    return no;
  }
  function mkLine(l, lineNo) {
    return { lineNo: lineNo, date: l.date, valueDate: l.valueDate, amount: l.amount, description: l.description, cpName: l.cpName, cpAccount: l.cpAccount, ref: l.ref, txId: l.txId,
      running: l.running, key: l.key, text: norm([l.description, l.cpName, l.ref].join(' ')), tokens: tokensOf(l.description + ' ' + (l.ref || '')),
      match: null, proposals: [], rejected: {}, split: null };
  }
  function dedupeKey(l, occ) {                                     // 09 §6.6
    if (l.txId) return 'T:' + norm(l.txId);
    var base = [l.date, centsStr(l.amount), norm(l.description), l.running !== null ? centsStr(l.running) : ''].join('|');
    occ[base] = (occ[base] || 0) + 1;
    return 'H:' + hash16(base + '|' + occ[base]);
  }
  function importStatement(bank, fileName, text, parsed) {          // 09 §5.7, BR-BNK-44/45/49
    var st = recStore(bank), h = hash16(text);
    if (st.hashes[h]) return { ok: false, errors: [{ code: 'bank.statement_already_imported', message: 'Энэ файл (хэш ' + h + ') аль хэдийн импортлогдсон — бүхэлд нь татгалзав (BR-BNK-44). Агуулгыг өөрчилбөл давхар мөрүүд мөр бүрийн түлхүүрээр алгасагдана.' }] };
    var occ = {}, fresh = [], skipped = 0;
    parsed.lines.forEach(function (l) { var k = dedupeKey(l, occ); if (st.keys[k]) { skipped++; return; } l.key = k; fresh.push(l); });
    st.hashes[h] = fileName;
    if (!fresh.length) return { ok: true, imported: 0, skipped: skipped, rec: st.open, hash: h };
    var rec = st.open;
    if (!rec) {
      rec = { id: ++recSeq, bank: bank, statementNo: nextStatementNo(st, parsed.statementDate), statementDate: parsed.statementDate, balanceLast: st.balanceLast,
        ending: parsed.closing !== null ? parsed.closing : st.balanceLast + parsed.total, lines: [], files: [], status: 'OPEN' };
      st.open = rec;
    } else {
      rec.statementDate = maxDate(rec.statementDate, parsed.statementDate);
      if (parsed.closing !== null) rec.ending = parsed.closing;
    }
    var maxNo = rec.lines.reduce(function (m, l) { return Math.max(m, l.lineNo); }, 0);
    fresh.forEach(function (l, i) { st.keys[l.key] = rec.id; rec.lines.push(mkLine(l, maxNo + 10000 * (i + 1))); });
    rec.files.push({ name: fileName, hash: h, lines: fresh.length, skipped: skipped });
    var summary = autoMatch(rec);
    return { ok: true, imported: fresh.length, skipped: skipped, rec: rec, hash: h, summary: summary };
  }

  // ---------------------------------------------------------------------------
  // auto-match (09 §5.9): phase A exact bank entries, phase B ledger entries / text rules
  // ---------------------------------------------------------------------------
  function lineBleEntries(l) { return l.match && l.match.prop && l.match.prop.kind === 'BLE' ? l.match.prop.entries : null; }
  function lineApplied(l) {
    if (!l.match) return 0;
    if (l.match.kind === 'ACCOUNT' || l.match.kind === 'ADVANCE') return l.amount;
    return l.match.prop.applied + (l.split ? l.split.amount : 0);
  }
  function lineDiff(l) { return l.amount - lineApplied(l); }
  function lineConf(l) {
    if (l.match) {
      if (l.match.kind === 'ACCOUNT' || l.match.kind === 'ADVANCE') return { c: 'MANUAL' };
      return { c: l.match.by === 'USER' ? 'ACCEPTED' : l.match.prop.confidence };
    }
    var p = l.proposals.filter(function (x) { return !x.rejected; })[0];
    return p ? { c: p.confidence, sugg: true } : { c: 'NONE' };
  }
  function textScore(l, e) {
    var best = { score: 0, field: '', near: 0, exact: 0 };
    [['document_no', e.documentNo], ['description', e.description]].forEach(function (f) {
      if (!f[1]) return;
      var nf = norm(f[1]), near = nearness(nf, l.text).score, ex = exactScore(nf, l.text), s = Math.max(near, ex);
      if (s > best.score) best = { score: s, field: f[0], near: near, exact: ex, value: f[1] };
    });
    return best;
  }
  function partiesOf(type) { return type === 'CUSTOMER' ? ERP.data.customers : ERP.data.vendors; }
  function matchParty(l, type, party) {                           // 09 §5.9.3
    var out = { sig: 'NO', how: '', near: null };
    var acct = normAccount(l.cpAccount);
    if (acct && LEARNED[acct] && LEARNED[acct].type === type && LEARNED[acct].no === party.no) return { sig: 'FULLY', how: 'сурсан данс ' + acct + ' (BR-BNK-72)' };
    if (party.tin && party.tin.length >= 7 && l.tokens[compress(party.tin)]) return { sig: 'FULLY', how: 'ТТД ' + party.tin + ' текстэд' };
    var text = normName(l.cpName || l.description), name = normName(party.name);
    out.text = text; out.name = name;
    if (text.replace(/ /g, '').length < name.replace(/ /g, '').length * NAME_MIN_LEN_RATIO) { out.how = 'текст хэт богино'; return out; }
    var nr = nearness(name, text);
    out.near = nr.score; out.pieces = nr.pieces; out.short = nr.short; out.total = nr.total;
    if (nr.score < NAME_EXACT) { out.how = 'нэрийн ойролцоо ' + nr.score + ' < ' + NAME_EXACT; return out; }
    var same = partiesOf(type).filter(function (p) { return nearness(normName(p.name), text).score >= NAME_EXACT; });
    out.count = same.length;
    out.sig = same.length === 1 ? 'FULLY' : 'PARTIALLY';
    out.how = 'нэрийн ойролцоо ' + nr.score + (same.length === 1 ? ', ганц харьцагч' : ', ' + same.length + ' харьцагч');
    return out;
  }
  function matchDoc(l, fields) {                                  // 09 BR-BNK-55
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f) continue;
      var c = compress(f);
      if (c.length >= 4 && (l.tokens[c] || (l.ref && compress(l.ref) === c))) return { sig: 'YES', hit: f, comp: c };
    }
    return { sig: 'NO', hit: null };
  }
  function txHasAccount(txNo, account) { return S().glEntries.some(function (g) { return g.transactionNo === txNo && g.account === account; }); }

  function autoMatch(rec) {
    var st = recStore(rec.bank), D = E().dates;
    var keep = rec.lines.filter(function (l) { return l.match && l.match.by === 'USER'; });
    var work = rec.lines.filter(function (l) { return l.amount !== 0 && !(l.match && l.match.by === 'USER'); });
    work.forEach(function (l) { l.match = null; l.proposals = []; l.split = null; });
    var usedBle = {}, reserved = {};
    keep.forEach(function (l) {
      var es = lineBleEntries(l); if (es) es.forEach(function (n) { usedBle[n] = true; });
      if (l.match.prop && (l.match.prop.kind === 'CUSTOMER' || l.match.prop.kind === 'VENDOR')) l.match.prop.targets.forEach(function (t) { reserved[l.match.prop.kind[0] + t.entryNo] = (reserved[l.match.prop.kind[0] + t.entryNo] || 0) + t.applied; });
    });
    var openBle = S().ble.filter(function (b) { return isOpenBle(b, st) && !usedBle[b.entryNo]; });

    // ---- phase A (BR-BNK-51/52) ----
    var pairs = [];
    work.forEach(function (l) {
      openBle.forEach(function (e) {
        if (e.amount !== l.amount) return;
        if (e.postingDate > maxDate(rec.statementDate, l.date)) return;
        var dd = Math.abs(D.daysBetween(e.postingDate, l.date));
        if (dd > DATE_TOL) return;
        pairs.push({ l: l, e: e, dd: dd, text: textScore(l, e) });
      });
    });
    var better = function (a, b) { return a.dd < b.dd || (a.dd === b.dd && a.text.score > b.text.score); };
    var ordered = pairs.slice().sort(function (a, b) { return a.dd - b.dd || b.text.score - a.text.score || a.e.entryNo - b.e.entryNo; });
    var byLine = new Map(), byEntry = new Map(), changed, pass = 0;
    do {
      changed = false;
      ordered.forEach(function (p) {
        var cur = byLine.get(p.l);
        if (cur && (cur === p || !better(p, cur))) return;
        var other = byEntry.get(p.e.entryNo);
        if (other && !better(p, other)) return;
        if (other) byLine.delete(other.l);
        if (cur) byEntry.delete(cur.e.entryNo);
        byLine.set(p.l, p); byEntry.set(p.e.entryNo, p); changed = true;
      });
    } while (changed && ++pass <= work.length + 1);
    var bleProp = function (p, conf, score, rivals) {
      return { key: 'B:' + p.e.entryNo, kind: 'BLE', entries: [p.e.entryNo], applied: p.e.amount, score: score, confidence: conf, rule: 'A',
        title: 'BLE #' + p.e.entryNo + ' · ' + p.e.documentNo,
        signals: { dd: p.dd, text: p.text, rivals: rivals, amount: p.e.amount, bleDesc: p.e.description }, dateDiff: p.dd, amountDiff: 0, entryNo: p.e.entryNo };
    };
    var assigned = new Set();
    byLine.forEach(function (p, l) {
      var mine = pairs.filter(function (q) { return q.l === l; });
      var tie = mine.some(function (q) { return q.e !== p.e && !better(p, q) && !better(q, p); });
      assigned.add(l);
      if (tie) { l.proposals = mine.map(function (q) { return bleProp(q, 'MEDIUM', 2990, mine.length); }); return; }
      var conf = mine.length === 1 ? 'HIGH' : 'MEDIUM', score = mine.length === 1 ? 3990 : 2990;
      l.proposals = [bleProp(p, conf, score, mine.length)].concat(mine.filter(function (q) { return q !== p; }).map(function (q) { return bleProp(q, 'MEDIUM', 2990, mine.length); }));
      l.proposals.forEach(function (x) { x.rejected = !!l.rejected[x.key]; });
      if (!l.rejected[l.proposals[0].key]) l.match = { prop: l.proposals[0], by: 'AUTO' };
    });

    // ---- phase B (BR-BNK-53..58) ----
    var avail = function (kind, e) { return e.remaining - (reserved[kind + e.entryNo] || 0); };
    var cles = S().cle.filter(function (e) { return e.open && e.remaining !== 0 && !e.reversed; });
    var vles = S().vle.filter(function (e) { return e.open && e.remaining !== 0 && !e.reversed; });
    // entries already reserved by AUTO matches of earlier lines in this run (no entry used twice, §5.9.2 ctx.Reserve)
    var autoRes = {};
    work.filter(function (l) { return !assigned.has(l); }).sort(function (a, b) { return a.lineNo - b.lineNo; }).forEach(function (l) {
      var Sx = l.amount, range = [Sx, Sx], cands = [];                // tolerance 0 (bank_account.match_tolerance_value default)
      var inRange = function (v) { return v >= range[0] && v <= range[1]; };
      [['CUSTOMER', cles, 'C'], ['VENDOR', vles, 'V']].forEach(function (grp) {
        var type = grp[0], kind = grp[2];
        var list = grp[1].map(function (e) { return { e: e, bs: avail(kind, e) - (autoRes[kind + e.entryNo] || 0) }; })
          .filter(function (x) { return x.bs !== 0 && Math.sign(x.bs) === Math.sign(Sx) && l.date >= x.e.postingDate; });
        var nIn = list.filter(function (x) { return inRange(x.bs); }).length;
        var partyCache = {}, docHits = {};
        list.forEach(function (x) {
          var pno = type === 'CUSTOMER' ? x.e.customer : x.e.vendor, party = type === 'CUSTOMER' ? E().setup.customer(pno) : E().setup.vendor(pno);
          var ps = partyCache[pno] || (partyCache[pno] = matchParty(l, type, party));
          var ds = matchDoc(l, type === 'CUSTOMER' ? [x.e.documentNo, x.e.extDoc] : [x.e.documentNo, x.e.vendorInvoiceNo]);
          if (ds.sig === 'YES') (docHits[pno] = docHits[pno] || []).push(x);
          var am = !inRange(x.bs) ? 'NO_MATCHES' : nIn === 1 ? 'ONE_MATCH' : 'MULTIPLE';
          var r = bestRule(ps.sig, ds.sig, am);
          if (!r) return;
          var applied = Math.min(Math.abs(x.bs), Math.abs(Sx)) * Math.sign(Sx);
          cands.push({ key: kind + ':' + x.e.entryNo, kind: type, partyNo: pno, partyName: party.name, targets: [{ entryNo: x.e.entryNo, docNo: x.e.documentNo, available: x.bs, applied: applied }],
            applied: applied, score: ruleScore(r), confidence: r[1], rule: r[0], title: x.e.documentNo + ' · ' + party.name,
            signals: { party: ps, doc: ds, amount: am, range: range, nIn: nIn, available: x.bs, remaining: x.e.remaining, reserved: (reserved[kind + x.e.entryNo] || 0) + (autoRes[kind + x.e.entryNo] || 0), rule: r },
            amountDiff: Sx - x.bs, dateDiff: E().dates.daysBetween(x.e.postingDate, l.date), dueDate: x.e.dueDate, entryNo: x.e.entryNo });
        });
        // 1:n document group (YES_MULTIPLE): ≥ 2 entries of one party named in the text
        Object.keys(docHits).forEach(function (pno) {
          var xs = docHits[pno];
          if (xs.length < 2) return;
          xs.sort(function (a, b) { return a.e.postingDate < b.e.postingDate ? -1 : 1; });
          var tot = sum(xs, function (x) { return x.bs; }), party = type === 'CUSTOMER' ? E().setup.customer(pno) : E().setup.vendor(pno);
          var ps = partyCache[pno], am = inRange(tot) ? 'ONE_MATCH' : 'NO_MATCHES', r = bestRule(ps.sig, 'YES_MULTIPLE', am);
          if (!r) return;
          var left = Math.abs(Sx), targets = xs.map(function (x) { var a = Math.min(left, Math.abs(x.bs)); left -= a; return { entryNo: x.e.entryNo, docNo: x.e.documentNo, available: x.bs, applied: a * Math.sign(Sx) }; }).filter(function (t) { return t.applied !== 0; });
          var applied = sum(targets, function (t) { return t.applied; });
          cands.push({ key: kind + ':' + targets.map(function (t) { return t.entryNo; }).join('+'), kind: type, partyNo: pno, partyName: party.name, targets: targets, applied: applied,
            score: ruleScore(r), confidence: r[1], rule: r[0], title: targets.map(function (t) { return t.docNo; }).join(' + ') + ' · ' + party.name,
            signals: { party: ps, doc: { sig: 'YES_MULTIPLE', hit: targets.map(function (t) { return t.docNo; }).join(', ') }, amount: am, range: range, nIn: 1, available: tot, group: true, rule: r },
            amountDiff: Sx - tot, dateDiff: 0, dueDate: xs[0].e.dueDate, entryNo: xs[0].e.entryNo });
        });
      });
      // text-to-account rules (BR-BNK-58)
      TEXT_RULES.slice().sort(function (a, b) { return a.lineNo - b.lineNo; }).forEach(function (tr) {
        var t = norm(tr.text);
        if (!t || l.text.indexOf(t) < 0) return;
        var target = Sx > 0 ? tr.debit : tr.credit;
        if (!target) return;
        var score = 3000 + Math.min(t.length, 498) + 1;
        var existing = openBle.filter(function (e) { return !byEntry.has(e.entryNo) && e.amount === Sx && Math.abs(E().dates.daysBetween(e.postingDate, l.date)) <= TEXT_RULE_DAYS && txHasAccount(e.transactionNo, target); })[0];
        if (existing) cands.push({ key: 'B:' + existing.entryNo, kind: 'BLE', entries: [existing.entryNo], applied: existing.amount, score: score, confidence: 'HIGH_TEXT_TO_ACCOUNT', rule: 'T' + tr.lineNo,
          title: 'Банкны бичилт #' + existing.entryNo + ' (' + target + '-д аль хэдийн бичсэн)', signals: { textRule: tr, norm: t, target: target, existing: true }, amountDiff: 0, dateDiff: 0, entryNo: existing.entryNo });
        else cands.push({ key: 'G:' + target + ':' + tr.lineNo, kind: 'GL', account: target, applied: Sx, score: score, confidence: 'HIGH_TEXT_TO_ACCOUNT', rule: 'T' + tr.lineNo,
          title: accLabel(target), signals: { textRule: tr, norm: t, target: target, existing: false }, amountDiff: 0, dateDiff: 0, entryNo: 0 });
      });
      cands = cands.filter(function (c) { return c.score >= MIN_SCORE; });
      cands.forEach(function (c) { c.rejected = !!l.rejected[c.key]; });
      cands.sort(function (a, b) {
        return (a.rejected - b.rejected) || (b.score - a.score) || (Math.abs(a.amountDiff) - Math.abs(b.amountDiff)) || (Math.abs(a.dateDiff) - Math.abs(b.dateDiff)) ||
          ((a.dueDate || '') < (b.dueDate || '') ? -1 : (a.dueDate || '') > (b.dueDate || '') ? 1 : 0) || (a.entryNo - b.entryNo);
      });
      l.proposals = cands.slice(0, MAX_PROPOSALS);
      var best = l.proposals.filter(function (c) { return !c.rejected; })[0];
      if (best && (best.confidence === 'HIGH' || best.confidence === 'HIGH_TEXT_TO_ACCOUNT') && best.applied === Sx) {
        l.match = { prop: best, by: 'AUTO' };
        if (best.targets) best.targets.forEach(function (t) { var k = best.kind[0] + t.entryNo; autoRes[k] = (autoRes[k] || 0) + t.applied; });
        if (best.kind === 'BLE') best.entries.forEach(function (n) { byEntry.set(n, true); });
      }
    });
    var s = { lines: rec.lines.length, matched: 0, high: 0, medium: 0, low: 0, none: 0 };
    rec.lines.forEach(function (l) {
      if (l.match) s.matched++;
      var c = lineConf(l).c;
      if (c === 'HIGH' || c === 'HIGH_TEXT_TO_ACCOUNT' || c === 'ACCEPTED' || c === 'MANUAL') s.high++; else if (c === 'MEDIUM') s.medium++; else if (c === 'LOW') s.low++; else s.none++;
    });
    return s;
  }

  // ---------------------------------------------------------------------------
  // posting (09 §5.11) and undo (§5.12) — vouchers via ERP.engine.journal.post (series BR/BP, source PAYMTRECON)
  // ---------------------------------------------------------------------------
  function recErrors(rec) {
    var errs = [], st = recStore(rec.bank);
    var total = sum(rec.lines, function (l) { return l.amount; });
    if (rec.balanceLast + total !== rec.ending) errs.push({ code: 'bank.reconciliation_balance_mismatch', message: 'Өмнөх үлдэгдэл + Σ мөр = ' + fmtM(rec.balanceLast + total) + ' ≠ эцсийн үлдэгдэл ' + fmtM(rec.ending) + ' (зөрүү ' + fmtM(rec.ending - rec.balanceLast - total) + '). BR-BNK-66, FR-BNK-013 AC2.' });
    if (st.lastStatementDate && rec.statementDate < st.lastStatementDate) errs.push({ code: 'bank.reconciliation_date_invalid', message: 'Хуулгын огноо өмнөх батлагдсан хуулгын огнооноос (' + ui.date(st.lastStatementDate) + ') өмнө байна.' });
    var late = rec.lines.filter(function (l) { return l.date > rec.statementDate; });
    if (late.length) errs.push({ code: 'bank.reconciliation_date_invalid', message: 'Мөр ' + late.map(function (l) { return l.lineNo; }).join(', ') + ': гүйлгээний огноо хуулгын огнооноос хойш (BR-BNK-66).' });
    var open = rec.lines.filter(function (l) { return lineDiff(l) !== 0; });
    if (open.length) errs.push({ code: 'bank.reconciliation_unmatched_lines', message: 'Тулгагдаагүй ' + open.length + ' мөр: ' + open.map(function (l) { return l.lineNo + ' (' + fmtM(lineDiff(l)) + ')'; }).join(', ') + '. Тулгах эсвэл "Данс руу бичих"-ээр тайлбарлана уу (BR-BNK-67).' });
    rec.lines.forEach(function (l) {
      var es = lineBleEntries(l);
      if (es) es.forEach(function (n) { var b = bleByNo(n); if (!b || !isOpenBle(b, st)) errs.push({ code: 'bank.match_target_changed', message: 'Мөр ' + l.lineNo + ': банкны бичилт #' + n + ' нээлттэй биш болсон (BR-BNK-71).' }); });
      if (l.match && l.match.prop && l.match.prop.targets) l.match.prop.targets.forEach(function (t) {
        var e = (l.match.prop.kind === 'CUSTOMER' ? S().cle : S().vle).filter(function (x) { return x.entryNo === t.entryNo; })[0];
        if (!e || !e.open || Math.abs(e.remaining) < Math.abs(t.applied)) errs.push({ code: 'bank.match_target_changed', message: 'Мөр ' + l.lineNo + ': ' + t.docNo + '-ийн үлдэгдэл өөрчлөгдсөн (BR-BNK-71).' });
      });
    });
    return errs;
  }
  function recVouchers(rec) {
    var out = [];
    rec.lines.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.lineNo - b.lineNo; }).forEach(function (l) {
      if (!l.match || lineBleEntries(l)) return;
      var Sx = l.amount, d = (l.description || '').slice(0, 100), ls = [{ bank: rec.bank, amt: Sx, desc: d }];
      if (l.match.kind === 'ACCOUNT') ls.push({ acc: l.match.acc, amt: -Sx, desc: d });
      else if (l.match.kind === 'ADVANCE') ls.push(l.match.partyType === 'CUSTOMER' ? { cust: l.match.partyNo, amt: -Sx, desc: d } : { vend: l.match.partyNo, amt: -Sx, desc: d });
      else {
        var p = l.match.prop;
        if (p.kind === 'GL') ls.push({ acc: p.account, amt: -Sx, desc: d });
        else p.targets.forEach(function (t) { ls.push(p.kind === 'CUSTOMER' ? { cust: p.partyNo, amt: -t.applied, appliesTo: t.entryNo, desc: d } : { vend: p.partyNo, amt: -t.applied, appliesTo: t.entryNo, desc: d }); });
        if (l.split) ls.push({ acc: l.split.acc, amt: -l.split.amount, desc: 'Зөрүү: ' + d });
      }
      out.push({ line: l, o: { date: l.date, series: Sx > 0 ? 'BR' : 'BP', source: 'PAYMTRECON', desc: d, lines: ls } });
    });
    return out;
  }
  function postRec(rec) {
    var st = recStore(rec.bank), vs = recVouchers(rec), results = [];
    for (var i = 0; i < vs.length; i++) {
      var r = E().journal.post(vs[i].o);
      if (!r.ok) return { ok: false, errors: r.errors, posted: results };
      var v = r.result.vouchers[0];
      results.push({ line: vs[i].line, docNo: v.documentNo, tx: v.transactionNo, ble: v.ble[0].entryNo });
    }
    var closedNow = [];
    results.forEach(function (x) {                                // §5.11 step 8: the line now points at the new bank entry
      var l = x.line, p = l.match.prop;
      if (p && (p.kind === 'CUSTOMER' || p.kind === 'VENDOR') && l.cpAccount && normAccount(l.cpAccount)) LEARNED[normAccount(l.cpAccount)] = { type: p.kind, no: p.partyNo };
      l.posted = { docNo: x.docNo, tx: x.tx, before: l.match.kind || (p && p.kind), title: l.match.kind === 'ACCOUNT' ? accLabel(l.match.acc) : l.match.kind === 'ADVANCE' ? 'Урьдчилгаа ' + l.match.partyNo : p.title };
      l.match = { prop: { key: 'B:' + x.ble, kind: 'BLE', entries: [x.ble], applied: l.amount, score: 0, confidence: 'ACCEPTED', rule: 'M', title: 'Банкны бичилт #' + x.ble + ' · ' + x.docNo + ' (тулгалтаар үүссэн)', signals: {} }, by: 'USER' };
      l.split = null;
    });
    rec.lines.forEach(function (l) { var es = lineBleEntries(l); if (es) es.forEach(function (n) { st.closed[n] = rec.statementDate; closedNow.push(n); }); });
    var D = rec.statementDate;
    var openAfter = S().ble.filter(function (b) { return isOpenBle(b, st) && b.postingDate <= D; });
    var snap = { statementNo: rec.statementNo, statementDate: D, balanceLast: rec.balanceLast, ending: rec.ending, lineCount: rec.lines.length,
      glAt: E().reports.bankBalance(rec.bank, D), outPay: sum(openAfter.filter(function (b) { return b.amount < 0; }), function (b) { return b.amount; }),
      outTx: sum(openAfter.filter(function (b) { return b.amount > 0; }), function (b) { return b.amount; }), postedAt: today(), by: userName(),
      vouchers: results.map(function (x) { return x.docNo; }), closed: closedNow, rec: rec, undone: false,
      prev: { balanceLast: st.balanceLast, lastStatementNo: st.lastStatementNo, lastStatementDate: st.lastStatementDate } };
    st.history.push(snap);
    st.balanceLast = rec.ending; st.lastStatementNo = rec.statementNo; st.lastStatementDate = D;
    rec.status = 'POSTED'; st.open = null;
    return { ok: true, snap: snap, results: results };
  }
  function undoLatest(bank) {
    var st = recStore(bank), snap = st.history.filter(function (h) { return !h.undone; }).slice(-1)[0];
    if (!snap) return { ok: false, errors: [{ code: 'bank.statement_not_latest', message: 'Буцаах батлагдсан хуулга алга.' }] };
    if (st.open) return { ok: false, errors: [{ code: 'bank.reconciliation_already_open', message: 'Энэ дансанд нээлттэй тулгалт байна — эхлээд батлах эсвэл хаях (BR-BNK-63).' }] };
    snap.closed.forEach(function (n) { delete st.closed[n]; });
    snap.undone = true; snap.undoneAt = today();
    st.balanceLast = snap.prev.balanceLast; st.lastStatementNo = snap.prev.lastStatementNo; st.lastStatementDate = snap.prev.lastStatementDate;
    snap.rec.status = 'OPEN'; st.open = snap.rec;
    return { ok: true, snap: snap };
  }
  function discardRec(bank) {                                    // BR-BNK-80
    var st = recStore(bank), rec = st.open;
    if (!rec) return;
    if (rec.lines.some(function (l) { return l.posted; })) return { ok: false, errors: [{ code: 'bank.statement_in_use', message: 'Буцаагдсан хуулгын мөр батлагдсан ваучертай — хаяхгүй, дахин батална уу (BR-BNK-80).' }] };
    rec.lines.forEach(function (l) { delete st.keys[l.key]; });
    rec.files.forEach(function (f) { delete st.hashes[f.hash]; });
    st.open = null;
    return { ok: true };
  }
  function recReport(bank, D) {                                   // 09 §6.8
    var st = recStore(bank), rec = st.open;
    var base = { ending: st.balanceLast, date: st.lastStatementDate || '0000-00-00', no: st.lastStatementNo };
    var M = {};
    if (rec) rec.lines.forEach(function (l) { var es = lineBleEntries(l); if (es && l.date <= D) es.forEach(function (n) { M[n] = true; }); });
    var gl = E().reports.bankBalance(bank, D);
    var outs = S().ble.filter(function (b) {
      if (b.bank !== bank || b.postingDate > D || b.amount === 0 || b.reversed || M[b.entryNo]) return false;
      var closedAt = Object.prototype.hasOwnProperty.call(st.closed, b.entryNo) ? st.closed[b.entryNo] : null;
      return b.statementStatus === 'OPEN' && (closedAt === null || closedAt > D);
    });
    var U = rec ? rec.lines.filter(function (l) { return l.date > base.date && l.date <= D; }) : [];
    var unrec = U.filter(function (l) { return !lineBleEntries(l); });
    var r = { D: D, base: base, gl: gl, outstanding: sum(outs, function (b) { return b.amount; }), outs: outs, U: U, unrec: unrec, unreconciled: sum(unrec, function (l) { return l.amount; }),
      statement: base.ending + sum(U, function (l) { return l.amount; }), valid: D >= base.date };
    r.check = r.gl - r.outstanding + r.unreconciled - r.statement;
    return r;
  }

  // ===========================================================================
  // 6. #cash — МХ-1 / МХ-2 (S-BNK-03/04/05)
  // ===========================================================================
  var cf = null;              // form in memory only (UX-CASH-06) — never written to browser storage
  var cashMeta = {};          // voucher no → { name, idDoc, partyType, words } for vouchers created in this session
  var keyHandler = null;

  function cashBalances() {
    var st = S(), list = st.ble.filter(function (b) { return b.bank === CASH; });
    return { now: E().reports.bankBalance(CASH), list: list };
  }
  function seriesLast(code) { var s = S().series[code + '|2026']; return s ? s.last : 0; }
  function nextNo(code) { var def = ERP.data.numberSeries[code]; return def.prefix + '-2026-' + String(seriesLast(code) + 1).padStart(def.width, '0'); }
  function newForm(type) {
    return { type: type, bank: CASH, date: today(), dateRaw: ui.date(today()), partyType: type === 'RECEIPT' ? 'CUSTOMER' : 'VENDOR', party: '', applyTo: '', name: '', idDoc: '', purpose: '', amount: '', touched: {} };
  }
  function partyOptions(f) {
    if (f.partyType === 'CUSTOMER') return ERP.data.customers.map(function (c) { return [c.no, c.no + ' · ' + c.name]; });
    if (f.partyType === 'VENDOR') return ERP.data.vendors.map(function (v) { return [v.no, v.no + ' · ' + v.name]; });
    if (f.partyType === 'GL') return directAccounts().map(function (a) { return [a.no, a.no + ' · ' + a.name]; });
    return ERP.data.bankAccounts.filter(function (b) { return b.kind === 'BANK'; }).map(function (b) { return [b.no, b.no + ' · ' + b.name]; });
  }
  function openEntries(f) {
    if (f.partyType === 'CUSTOMER' && f.party) return S().cle.filter(function (e) { return e.customer === f.party && e.open && e.remaining > 0 && !e.reversed; });
    if (f.partyType === 'VENDOR' && f.party) return S().vle.filter(function (e) { return e.vendor === f.party && e.open && e.remaining < 0 && !e.reversed; });
    return [];
  }
  function applyDefaults(f) {                                     // UX-CASH-03/04
    var es = openEntries(f), e = f.applyTo ? es.filter(function (x) { return String(x.entryNo) === String(f.applyTo); })[0] : null;
    var c = f.partyType === 'CUSTOMER' && f.party ? E().setup.customer(f.party) : null, v = f.partyType === 'VENDOR' && f.party ? E().setup.vendor(f.party) : null;
    if (!f.touched.name) f.name = c ? c.name : v ? v.name : f.partyType === 'BANK' ? userName() : '';
    if (!f.touched.idDoc) f.idDoc = v ? v.tin : c ? (c.tin || c.regNo || '') : '';
    if (!f.touched.purpose) {
      if (e) f.purpose = (f.partyType === 'VENDOR' ? (e.vendorInvoiceNo || e.documentNo) + ' (' + e.documentNo + ')' : e.documentNo) + ' төлбөр';
      else if (f.partyType === 'GL' && f.party) f.purpose = acc(f.party).name;
      else if (f.partyType === 'BANK') f.purpose = 'Бэлэн мөнгө банкинд тушаасан';
      else if (c || v) f.purpose = (f.type === 'RECEIPT' ? 'Урьдчилгаа: ' : 'Урьдчилгаа олгосон: ') + (c || v).name;
      else f.purpose = '';
    }
    if (!f.touched.amount && e) f.amount = centsStr(Math.abs(e.remaining));
  }
  function cfAmount(f) {
    var raw = String(f.amount || '').trim();
    if (!raw) return { cents: null, err: null };
    if (/\.\d{3,}$/.test(raw.replace(/[\s  ,]/g, ''))) return { cents: null, err: { code: 'api.amount_precision_exceeded', message: 'Дүн 2-оос олон бутархай оронтой (MNT 0.01).' } };
    var c = E().money.toCents(raw);
    if (c === null) return { cents: null, err: { code: 'api.validation_failed', message: 'Дүн тоо биш.' } };
    if (c <= 0) return { cents: null, err: { code: 'api.validation_failed', message: 'Дүн эерэг байна (МХ-д тэмдэггүй дүн, BR-BNK-20).' } };
    return { cents: c, err: null };
  }
  function cashCheck(date, delta) {                               // 09 §6.11 — running balance on the posting date and every later date
    var bles = S().ble.filter(function (b) { return b.bank === CASH; });
    var dates = [date].concat(bles.filter(function (b) { return b.postingDate > date; }).map(function (b) { return b.postingDate; }));
    dates = dates.filter(function (d, i) { return dates.indexOf(d) === i; }).sort();
    var rows = dates.map(function (d) { var before = E().reports.bankBalance(CASH, d); return { d: d, before: before, after: before + delta }; });
    var minAfter = Math.min.apply(null, rows.map(function (r) { return r.after; }));
    var arg = rows.filter(function (r) { return r.after === minAfter; })[0];
    var available = Math.min.apply(null, rows.map(function (r) { return r.before; }));
    return { rows: rows, ok: minAfter >= 0, minAfter: minAfter, argmin: arg ? arg.d : date, available: available, shortfall: minAfter < 0 ? -minAfter : 0 };
  }
  function cfValidate(f) {
    var errs = [], a = cfAmount(f);
    if (!f.date) errs.push({ code: 'api.validation_failed', message: 'Бүртгэлийн огноо буруу (ЖЖЖЖ.СС.ӨӨ).' });
    if (!f.party) errs.push({ code: 'api.validation_failed', message: 'Харьцагч сонгоно уу.' });
    if (!String(f.name || '').trim() || f.name.length > 200) errs.push({ code: 'bank.cash_voucher_required', message: (f.type === 'RECEIPT' ? 'Тушаагч' : 'Хүлээн авагч') + ' заавал (1–200 тэмдэгт, BR-BNK-22).' });
    if (!String(f.purpose || '').trim() || f.purpose.length > 250) errs.push({ code: 'bank.cash_voucher_required', message: 'Гүйлгээний утга заавал (1–250 тэмдэгт, BR-BNK-22).' });
    if (f.type === 'PAYMENT' && !String(f.idDoc || '').trim()) errs.push({ code: 'bank.cash_voucher_required', message: 'МХ-2-т хүлээн авагчийн бичиг баримтын дугаар заавал (BR-BNK-23, FR-BNK-003 AC2).' });
    if (a.err) errs.push(a.err); else if (a.cents === null) errs.push({ code: 'api.validation_failed', message: 'Дүн оруулна уу.' });
    if (a.cents && f.date && f.type === 'PAYMENT') {
      var chk = cashCheck(f.date, -a.cents);
      if (!chk.ok) errs.push({ code: 'bank.cash_negative_balance', message: 'Кассын үлдэгдэл хүрэлцэхгүй: ' + ui.date(chk.argmin) + '-нд ' + fmtM(chk.minAfter, { sym: true }) + ' болно. Боломжит дүн ' + fmtM(chk.available, { sym: true }) + ', дутуу ' + fmtM(chk.shortfall, { sym: true }) + ' (D-G1, BR-BNK-25).' });
    }
    return { errors: errs, cents: a.cents };
  }
  function cfCall(f, cents, preview) {
    var o = { preview: !!preview };
    if (f.partyType === 'CUSTOMER') return E().payments.receipt({ date: f.date, bank: f.bank, cust: f.party, amount: cents, appliesTo: f.applyTo ? +f.applyTo : null, desc: f.purpose }, o);
    if (f.partyType === 'VENDOR') return E().payments.vendorPayment({ date: f.date, bank: f.bank, vend: f.party, amount: centsStr(cents), appliesTo: f.applyTo ? +f.applyTo : null, desc: f.purpose }, o);
    if (f.partyType === 'GL') return E().payments.bankGl({ date: f.date, bank: f.bank, acc: f.party, amount: f.type === 'RECEIPT' ? cents : -cents, desc: f.purpose, party: f.name }, o);
    return E().payments.transfer({ date: f.date, from: f.bank, to: f.party, amount: centsStr(cents), desc: f.purpose }, o);
  }

  function renderCash(el, ctx) {
    var mode = ctx.cashMode === 'new' && cf ? 'new' : 'list';
    var bal = cashBalances();
    var vs = S().cashVouchers.filter(function (c) { return c.bank === CASH; });
    var ins = vs.filter(function (c) { return c.kind === 'RECEIPT'; }), outs = vs.filter(function (c) { return c.kind === 'PAYMENT'; });
    var html = '<div class="page-head"><div class="title-wrap"><h1>Кассын баримт (МХ-1 / МХ-2)</h1><span class="docno">' + ui.esc(bankName(CASH)) + '</span></div>' +
      '<div class="row"><button class="btn primary" id="cash-new-in" type="button">+ Кассын орлого (МХ-1)</button><button class="btn" id="cash-new-out" type="button">+ Кассын зарлага (МХ-2)</button></div></div>';
    html += '<div class="cues cb-cues">' +
      '<div class="cue" data-state="NONE" data-note="cash.balance"><span class="cue-title">Кассын үлдэгдэл</span><span class="cue-value">' + fmtM(bal.now, { sym: true }) + '</span><span class="cue-sub">CASH01 · G/L 1100 = ' + fmtM(E().reports.glBalance('1100')) + '</span></div>' +
      '<div class="cue" data-state="FAVORABLE"><span class="cue-title">МХ-1 орлого (2026)</span><span class="cue-value">' + fmtM(sum(ins, function (c) { return c.amount; })) + '</span><span class="cue-sub">' + ins.length + ' баримт</span></div>' +
      '<div class="cue" data-state="AMBIGUOUS"><span class="cue-title">МХ-2 зарлага (2026)</span><span class="cue-value">' + fmtM(sum(outs, function (c) { return c.amount; })) + '</span><span class="cue-sub">' + outs.length + ' баримт</span></div>' +
      '<div class="cue" data-state="NONE" data-note="cash.numbering"><span class="cue-title">Дараагийн дугаар</span><span class="cue-value mono">' + nextNo('KO') + '</span><span class="cue-sub mono">' + nextNo('KZ') + ' · батлахад олгоно</span></div>' +
      '</div>';
    html += mode === 'new' ? formHtml(cf) : listHtml(ctx, bal);
    el.innerHTML = html;
    ui.$('#cash-new-in').addEventListener('click', function () { cf = newForm('RECEIPT'); ctx.cashMode = 'new'; app.refresh(); });
    ui.$('#cash-new-out').addEventListener('click', function () { cf = newForm('PAYMENT'); ctx.cashMode = 'new'; app.refresh(); });
    if (mode === 'new') bindForm(el, ctx); else bindList(el, ctx);
  }

  // --- list (S-BNK-05) ---------------------------------------------------------
  function cashBook() {
    var rows = S().ble.filter(function (b) { return b.bank === CASH; }).slice().sort(function (a, b) { return a.postingDate < b.postingDate ? -1 : a.postingDate > b.postingDate ? 1 : a.entryNo - b.entryNo; });
    var run = 0, byNo = {};
    S().cashVouchers.forEach(function (c) { byNo[c.no] = c; });
    return rows.map(function (b) { run += b.amount; return { b: b, cv: b.cashVoucherNo ? byNo[b.cashVoucherNo] : null, run: run }; });
  }
  function listHtml(ctx, bal) {
    var f = ctx.cashFilter || 'all', q = String(ctx.cashSearch || '').toLowerCase();
    var book = cashBook();
    var rows = book.filter(function (r) {
      if (f === 'in' && !(r.cv && r.cv.kind === 'RECEIPT')) return false;
      if (f === 'out' && !(r.cv && r.cv.kind === 'PAYMENT')) return false;
      if (!q) return true;
      var m = r.cv ? cashMeta[r.cv.no] : null;
      return [r.b.documentNo, r.cv ? r.cv.no : '', r.b.description, r.b.party || '', m ? m.name : ''].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var cIn = book.filter(function (r) { return r.cv && r.cv.kind === 'RECEIPT'; }).length, cOut = book.filter(function (r) { return r.cv && r.cv.kind === 'PAYMENT'; }).length;
    var html = '<div class="cb-toolbar"><div class="tabs" role="tablist" aria-label="Баримтын төрөл">' +
      [['all', 'Кассын дэвтэр', book.length], ['in', 'МХ-1 орлого', cIn], ['out', 'МХ-2 зарлага', cOut]].map(function (t) {
        return '<button class="tab" role="tab" type="button" id="cash-f-' + t[0] + '" data-cf="' + t[0] + '" aria-selected="' + (f === t[0]) + '">' + t[1] + ' <span class="count">' + t[2] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="field"><label class="sr-only" for="cash-search">Хайх</label><input class="input" id="cash-search" type="search" placeholder="Дугаар, харьцагч, утга…" value="' + ui.esc(ctx.cashSearch || '') + '" style="width:240px;max-width:100%"></div></div>';
    html += '<div class="card"><div class="table-wrap"><table class="grid-table"><thead><tr><th data-note="cash.list">Төрөл</th><th>Дугаар</th><th>Огноо</th><th>Харьцагч</th><th>Гүйлгээний утга</th><th>Холбоотой баримт</th><th class="num">Орлого</th><th class="num">Зарлага</th><th class="num">Үлдэгдэл</th></tr></thead><tbody>' +
      (rows.map(function (r) {
        var b = r.b, cv = r.cv, m = cv ? cashMeta[cv.no] : null;
        if (!cv) {
          var ob = b.documentNo && b.documentNo.indexOf('OB-') === 0;
          return '<tr class="' + (ob ? 'cb-ob' : 'cb-rev') + '"><td><span class="cb-kind none">' + (ob ? 'Эхний үлдэгдэл' : 'МХ-гүй') + '</span></td><td class="code">' + ui.esc(b.documentNo) + '</td><td>' + ui.date(b.postingDate) + '</td><td>—</td><td>' + ui.esc(b.description) + (ob ? ' <span class="xs muted">(OB — МХ үүсэхгүй, BR-BNK-20)</span>' : '') + '</td><td></td>' +
            ui.moneyCell(b.amount > 0 ? b.amount : 0, { blankZero: true }) + ui.moneyCell(b.amount < 0 ? -b.amount : 0, { blankZero: true }) + ui.moneyCell(r.run) + '</tr>';
        }
        var rel = cv.documentNo && cv.documentNo !== cv.no ? cv.documentNo : '';
        return '<tr class="clickable' + (b.reversed ? ' cb-rev' : '') + '" data-cv="' + ui.esc(cv.no) + '" tabindex="0"><td><span class="cb-kind ' + (cv.kind === 'RECEIPT' ? 'in">МХ-1' : 'out">МХ-2') + '</span></td>' +
          '<td class="code">' + ui.esc(cv.no) + (b.reversed ? ' <span class="pill danger">Буцаагдсан</span>' : '') + '</td><td>' + ui.date(cv.postingDate) + '</td><td>' + ui.esc(m ? m.name : (cv.party || '')) + '</td><td>' + ui.esc(cv.purpose) + '</td>' +
          '<td>' + (rel ? (rel.indexOf('SI-') === 0 ? '<button class="cb-lnk mono" type="button" data-si="' + ui.esc(rel) + '">' + ui.esc(rel) + '</button>' : '<span class="code">' + ui.esc(rel) + '</span>') : '') + '</td>' +
          ui.moneyCell(cv.kind === 'RECEIPT' ? cv.amount : 0, { blankZero: true }) + ui.moneyCell(cv.kind === 'PAYMENT' ? cv.amount : 0, { blankZero: true }) + ui.moneyCell(r.run) + '</tr>';
      }).join('') || '<tr><td colspan="9" class="empty">Хайлтад тохирох баримт алга.</td></tr>') +
      '</tbody><tfoot><tr><td colspan="6">Кассын үлдэгдэл ' + ui.date(today()) + '</td><td></td><td></td>' + ui.moneyCell(bal.now) + '</tr></tfoot></table></div></div>';
    html += '<p class="xs muted">Мөр дарж МХ-1 / МХ-2 хэвлэмэлийг нээнэ. Бэлэн борлуулалтын МХ-1 (SI-…) нэхэмжлэх батлахад автоматаар үүснэ (BR-BNK-21). Үлдэгдэл = банкны дэвтрийн бичилтийн хуримтлагдсан нийлбэр.</p>';
    html += gaplessCalc();
    return html;
  }
  function gaplessCalc() {
    var body = '<p>Хуулийн дугаар цуврал бүрд 1-ээс завсаргүй, огноо буурахгүй байх ёстой (D-C7, INV-08, BR-BNK-26). Батлагдсан кассын баримтаас шууд шалгав:</p>';
    ['KO', 'KZ'].forEach(function (code) {
      var list = S().cashVouchers.filter(function (c) { return c.no.indexOf(code + '-2026-') === 0; }).sort(function (a, b) { return a.no < b.no ? -1 : 1; });
      var last = seriesLast(code), missing = [], dateBad = [];
      for (var i = 1; i <= last; i++) { var no = code + '-2026-' + String(i).padStart(5, '0'); if (!list.some(function (c) { return c.no === no; })) missing.push(no); }
      list.forEach(function (c, i) { if (i && c.postingDate < list[i - 1].postingDate) dateBad.push(c.no); });
      body += '<div class="formula">' + code + ' (' + ui.esc(ERP.data.numberSeries[code].name) + '): тоолуур = ' + last + ', баримт = ' + list.length +
        '\nДугаарууд: ' + list.map(function (c) { return c.no.slice(-5) + '@' + c.postingDate.slice(5); }).join(' ') +
        '\nЗавсар: ' + (missing.length ? missing.join(', ') + ' ✕' : 'байхгүй ✓') + '   Огнооны дараалал: ' + (dateBad.length ? 'зөрчилтэй ' + dateBad.join(', ') + ' ✕' : 'зөв ✓') + '</div>';
    });
    return ui.calc('Тооцоог харах: KO / KZ дугаарын завсаргүй байдал', body);
  }
  function bindList(el, ctx) {
    ui.$$('[data-cf]', el).forEach(function (b) { b.addEventListener('click', function () { ctx.cashFilter = b.getAttribute('data-cf'); app.refresh(); var t = ui.$('#cash-f-' + ctx.cashFilter); if (t) t.focus(); }); });
    var s = ui.$('#cash-search', el);
    s.addEventListener('input', function () { ctx.cashSearch = s.value; var pos = s.selectionStart; app.refresh(); var n = ui.$('#cash-search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
    ui.$$('button[data-si]', el).forEach(function (b) { b.addEventListener('click', function (ev) { ev.stopPropagation(); app.navigate('posted-invoice', { postedNo: b.getAttribute('data-si') }); }); });
    ui.$$('tr[data-cv]', el).forEach(function (tr) {
      var go = function () { var cv = S().cashVouchers.filter(function (c) { return c.no === tr.getAttribute('data-cv'); })[0]; if (cv) openVoucherPrint(cv, cashMeta[cv.no], null); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    });
  }

  // --- form (S-BNK-03 / S-BNK-04) -------------------------------------------
  function formHtml(f) {
    var rec = f.type === 'RECEIPT';
    var pts = rec ? [['CUSTOMER', 'Харилцагч'], ['GL', 'Данс (бусад орлого)'], ['BANK', 'Мөнгөний данс (банкнаас)', true]]
      : [['VENDOR', 'Нийлүүлэгч'], ['GL', 'Данс (зардал)'], ['BANK', 'Мөнгөний данс (банкинд тушаах)']];
    var es = openEntries(f), per = f.date ? E().periods.of(f.date) : null;
    var html = '<div class="card cb-form ' + f.type + '">' +
      '<div class="card-head" data-note="cash.form-type"><h2>' + (rec ? 'Кассын орлогын баримт (МХ-1)' : 'Кассын зарлагын баримт (МХ-2)') + ' <span class="cb-kind ' + (rec ? 'in">Орлого' : 'out">Зарлага') + '</span></h2>' +
      '<span class="small muted">Дугаар: батлахад олгоно (<span class="mono">' + (rec ? 'KO' : 'KZ') + '-2026-#####</span>) · <span class="pill draft">Хадгалаагүй форм</span></span></div>' +
      '<div class="card-body stack">' +
      '<div class="actionbar"><span class="row" data-note="cash.post"><button class="btn primary" id="cf-post" type="button">Батлах <span class="kbd">F9</span></button><button class="btn" id="cf-preview" type="button">Урьдчилан харах</button></span>' +
      '<button class="btn ghost" id="cf-clear" type="button">Цэвэрлэх</button><button class="btn ghost" id="cf-back" type="button">Жагсаалт руу</button>' +
      '<span class="small muted" data-note="cash.roles">Эрх: <code>' + (rec ? 'bank.cash_receipt.post' : 'bank.cash_payment.post') + '</code></span></div>' +
      '<div id="cf-errors"></div>' +
      '<div class="doc-layout"><div class="doc-main"><form id="cf-form" class="form-grid" novalidate>' +
      '<div class="field"><label class="req" for="cf-bank">Касс</label><select class="select" id="cf-bank">' + ERP.data.bankAccounts.filter(function (b) { return b.kind === 'CASH'; }).map(function (b) { return opt(b.no, b.no + ' · ' + b.name, b.no === f.bank); }).join('') + '</select><span class="hint">Зөвхөн CASH төрлийн данс (UX-CASH-02)</span></div>' +
      '<div class="field"><label class="req" for="cf-date">Бүртгэлийн огноо</label>' + ui.dateInput('cf-date', f.date) + '<span class="hint" id="cf-date-hint">' + (per ? monthHint(per) : 'Огноо буруу') + '</span></div>' +
      '<fieldset class="cb-party-types span-all" data-note="cash.party"><legend class="req">Харьцагчийн төрөл</legend>' +
      pts.map(function (p) {
        return '<label class="checkbox"' + (p[2] ? ' aria-disabled="true" title="Банк → касс шилжүүлгийн МХ-1-ийг хөдөлгүүр одоогоор үүсгэдэггүй (BR-BNK-31) — S-BNK-07"' : '') + '><input type="radio" name="cf-pt" id="cf-pt-' + p[0] + '" value="' + p[0] + '"' + (f.partyType === p[0] ? ' checked' : '') + (p[2] ? ' disabled' : '') + '> ' + p[1] + '</label>';
      }).join('') + '</fieldset>' +
      '<div class="field"><label class="req" for="cf-party">' + ({ CUSTOMER: 'Харилцагч', VENDOR: 'Нийлүүлэгч', GL: 'Харьцсан данс (G/L)', BANK: 'Банкны данс' })[f.partyType] + '</label><select class="select" id="cf-party"><option value="">— сонгох —</option>' +
      partyOptions(f).map(function (o) { return opt(o[0], o[1], o[0] === f.party); }).join('') + '</select></div>';
    if (f.partyType === 'CUSTOMER' || f.partyType === 'VENDOR') {
      html += '<div class="field"><label for="cf-apply">Тулгах баримт</label><select class="select" id="cf-apply"' + (f.party ? '' : ' disabled') + '><option value="">' + (f.party ? (es.length ? '— тулгахгүй (урьдчилгаа) —' : 'Нээлттэй баримт алга') : '— эхлээд харьцагч —') + '</option>' +
        es.map(function (e) { return opt(e.entryNo, e.documentNo + (e.vendorInvoiceNo ? ' / ' + e.vendorInvoiceNo : '') + ' · үлдэгдэл ' + fmtM(Math.abs(e.remaining)), String(e.entryNo) === String(f.applyTo)); }).join('') + '</select><span class="hint">Үлдэгдлээс их дүн → илүү нь урьдчилгаа (D-F4)</span></div>';
    }
    html += '<div class="field span-all" data-note="cash.id-doc"><div class="form-grid">' +
      '<div class="field"><label class="req" for="cf-name">' + (rec ? 'Тушаагч (хэнээс хүлээн авсан)' : 'Хүлээн авагч (хэнд олгосон)') + '</label><input class="input" id="cf-name" maxlength="200" autocomplete="off" value="' + ui.esc(f.name) + '"></div>' +
      '<div class="field"><label' + (rec ? '' : ' class="req"') + ' for="cf-iddoc">Бичиг баримтын дугаар</label><input class="input mono" id="cf-iddoc" maxlength="50" autocomplete="off" value="' + ui.esc(f.idDoc) + '"><span class="hint">Регистр эсвэл ТТД · ' + (rec ? 'сонголттой' : 'МХ-2-т заавал') + ' · жагсаалтад маскаар</span></div>' +
      '</div></div>' +
      '<div class="field span-all"><label class="req" for="cf-purpose">Гүйлгээний утга</label><input class="input" id="cf-purpose" maxlength="250" autocomplete="off" value="' + ui.esc(f.purpose) + '"></div>' +
      '<div class="field"><label class="req" for="cf-amount">Дүн (₮)</label><input class="input num mono" id="cf-amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + ui.esc(f.amount) + '"></div>' +
      '<div class="field span-all" data-note="cash.amount-words"><span class="flabel" id="cf-words-label">Дүн үсгээр</span><div class="cb-words" id="cf-words" aria-labelledby="cf-words-label" aria-live="polite"></div></div>' +
      '</form>' +
      '<div data-note="cash.negative"><div id="cf-neg"></div></div>' +
      '<details class="calc" id="cf-calc"><summary>Тооцоог харах: үсгээр бичих, кассын үлдэгдэл, бичилт</summary><div class="calc-body" id="cf-calc-body"></div></details>' +
      '</div>' +
      '<aside class="factbox" aria-label="Кассын мэдээлэл"><div class="card" data-note="cash.factbox"><div class="card-head"><h3>Кассын үлдэгдэл</h3><span class="code small">CASH01</span></div><div class="card-body" id="cf-fb"></div></div>' +
      '<div class="card"><div class="card-head"><h3>Нээлттэй баримт</h3></div><div class="card-body" id="cf-open"></div></div></aside>' +
      '</div></div></div>';
    return html;
  }
  function monthHint(per) { return 'Үе: ' + E().dates.monthLabel(per.period) + ' — ' + ui.pillLabel(per.status); }
  function cfDerive() {
    var f = cf;
    if (!f) return;
    var a = cfAmount(f), delta = a.cents ? (f.type === 'RECEIPT' ? a.cents : -a.cents) : 0;
    var w = a.cents !== null ? moneyWords(a.cents) : null;
    var wEl = ui.$('#cf-words'); if (wEl) wEl.textContent = w ? w.text : '';
    var now = E().reports.bankBalance(CASH), atDate = f.date ? E().reports.bankBalance(CASH, f.date) : null;
    var chk = f.date ? cashCheck(f.date, delta) : null;
    var fb = ui.$('#cf-fb');
    if (fb) fb.innerHTML = '<dl class="kv"><dt>Одоо</dt><dd>' + fmtM(now) + '</dd>' + (f.date ? '<dt>' + ui.date(f.date) + '-нд</dt><dd>' + fmtM(atDate) + '</dd>' : '') +
      '<dt>Дараа</dt><dd class="' + (now + delta < 0 ? 'neg' : '') + '">' + fmtM(now + delta) + '</dd>' +
      (chk && f.type === 'PAYMENT' ? '<dt>Зарцуулж болох</dt><dd>' + fmtM(Math.max(chk.available, 0)) + '</dd>' : '') + '</dl>';
    var es = openEntries(f), op = ui.$('#cf-open');
    if (op) op.innerHTML = es.length ? '<ul class="cb-fb-list">' + es.map(function (e) { return '<li><span class="code">' + ui.esc(e.documentNo) + '</span><span class="num">' + fmtM(Math.abs(e.remaining)) + '</span></li>'; }).join('') + '</ul>'
      : '<p class="small muted">' + (f.party ? 'Нээлттэй баримт алга.' : 'Харьцагч сонгоход нээлттэй нэхэмжлэх гарна.') + '</p>';
    var neg = ui.$('#cf-neg');
    if (neg) neg.innerHTML = chk && !chk.ok ? '<div class="banner danger" role="alert"><strong>Кассын үлдэгдэл хүрэлцэхгүй (D-G1).</strong> ' + ui.date(chk.argmin) + '-ний үлдэгдэл ' + fmtM(chk.minAfter, { sym: true }) + ' болно. Боломжит дүн ' + fmtM(Math.max(chk.available, 0), { sym: true }) + ', дутуу ' + fmtM(chk.shortfall, { sym: true }) + '. Батлах идэвхгүй.</div>'
      : '<p class="xs muted">Касс сөрөг болохгүй: батлахаас өмнө огноо ба түүнээс хойших өдөр бүрийн үлдэгдлийг шалгана (BR-BNK-25).</p>';
    var post = ui.$('#cf-post');
    if (post) { var bad = chk && !chk.ok; post.disabled = !!bad; post.title = bad ? 'Кассын үлдэгдэл хүрэлцэхгүй (D-G1)' : ''; }
    var cb = ui.$('#cf-calc-body');
    if (cb) cb.innerHTML = cfCalcBody(f, a, w, chk, delta);
  }
  function cfCalcBody(f, a, w, chk, delta) {
    var html = '';
    if (w) {
      html += '<p><strong>1. Дүн үсгээр</strong> (09 §6.9): бүхэл ' + w.integer.toLocaleString('en-US').replace(/,/g, ' ') + ', бутархай ' + String(w.fraction).padStart(2, '0') + '. 3 оронтой бүлэг бүрд зуу → аравт → нэгж, дараа нь бүлгийн нэр.</p><div class="formula">' +
        w.steps.map(function (s) { return String(s.n).padStart(3, ' ') + ' (' + s.scale + ') → ' + s.words.join(' '); }).join('\n') +
        (w.lastChanged ? '\nСүүлийн үг "мянга" → холбох хэлбэр "мянган"' : '') + '\n= ' + w.text + '</div>';
    } else html += '<p class="muted">Дүн оруулахад үсгээр бичих алхам гарна.</p>';
    if (chk) {
      html += '<p><strong>2. Кассын үлдэгдлийн шалгалт</strong> (09 §6.11): running(d) = Σ BLE (огноо ≤ d) ' + (delta >= 0 ? '+ ' : '− ') + fmtM(Math.abs(delta)) + ', d ∈ {' + ui.date(f.date) + '} ∪ хойших огноонууд.</p>' +
        '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Огноо d</th><th class="num">Өмнө</th><th class="num">Энэ баримттай</th><th></th></tr></thead><tbody>' +
        chk.rows.map(function (r) { return '<tr><td>' + ui.date(r.d) + '</td>' + ui.moneyCell(r.before) + ui.moneyCell(r.after, { negRed: true }) + '<td>' + (r.after < 0 ? '<span class="bad-mark">✕</span>' : '<span class="ok-mark">✓</span>') + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="xs">min running = ' + fmtM(chk.minAfter) + (chk.ok ? ' ≥ 0 → зөвшөөрнө.' : ' < 0 → татгалзана: available = min(өмнө) = ' + fmtM(chk.available) + ', shortfall = ' + fmtM(chk.shortfall) + '.') + '</p>';
    }
    var contra = f.partyType === 'CUSTOMER' && f.party ? E().setup.receivablesAccount(E().setup.customer(f.party).cpg) + ' Дансны авлага (харилцагчийн posting group ' + E().setup.customer(f.party).cpg + ')'
      : f.partyType === 'VENDOR' && f.party ? E().setup.payablesAccount(E().setup.vendor(f.party).vpg) + ' Дансны өглөг (нийлүүлэгчийн posting group ' + E().setup.vendor(f.party).vpg + ')'
        : f.partyType === 'GL' && f.party ? accLabel(f.party) + ' (direct posting шалгана)' : f.partyType === 'BANK' && f.party ? E().setup.bankGlAccount(f.party) + ' ' + bankName(f.party) : '—';
    html += '<p><strong>3. Данс тодорхойлолт</strong>: касс CASH01 → bank posting group CASH_MNT → <code>1100</code>; эсрэг тал → <code>' + ui.esc(contra) + '</code>.</p>' +
      '<div class="formula">' + (f.type === 'RECEIPT' ? '1100 Касс            Дт ' + fmtM(Math.abs(delta)) + '\n' + contra.split(' ')[0] + '                 Кт ' + fmtM(Math.abs(delta))
        : contra.split(' ')[0] + '                 Дт ' + fmtM(Math.abs(delta)) + '\n1100 Касс            Кт ' + fmtM(Math.abs(delta))) + '\nΣ Дт = Σ Кт (D-C5); МХ дугаар ' + (f.type === 'RECEIPT' ? 'KO' : 'KZ') + ' цувралаас (BR-BNK-21)</div>';
    return html;
  }
  function bindForm(el, ctx) {
    var f = cf;
    var re = function () { app.refresh(); };
    ui.$('#cf-form').addEventListener('submit', function (ev) { ev.preventDefault(); doCashPost(ctx); });
    ui.$('#cf-bank').addEventListener('change', function (ev) { f.bank = ev.target.value; cfDerive(); });
    var dEl = ui.$('#cf-date');
    dEl.addEventListener('change', function () {
      var iso = ui.parseDate(dEl.value);
      f.date = iso; dEl.classList.toggle('invalid', !iso);
      if (iso) dEl.value = ui.date(iso);
      var per = iso ? E().periods.of(iso) : null;
      ui.$('#cf-date-hint').textContent = per ? monthHint(per) : 'Огноо буруу (ЖЖЖЖ.СС.ӨӨ)';
      cfDerive();
    });
    ui.$$('input[name="cf-pt"]').forEach(function (r) { r.addEventListener('change', function () { f.partyType = r.value; f.party = ''; f.applyTo = ''; f.touched = {}; f.amount = ''; applyDefaults(f); re(); }); });
    ui.$('#cf-party').addEventListener('change', function (ev) { f.party = ev.target.value; f.applyTo = ''; f.touched.name = false; f.touched.purpose = false; f.touched.idDoc = false; applyDefaults(f); re(); });
    var ap = ui.$('#cf-apply');
    if (ap) ap.addEventListener('change', function () { f.applyTo = ap.value; f.touched.purpose = false; f.touched.amount = false; applyDefaults(f); re(); });
    [['cf-name', 'name'], ['cf-iddoc', 'idDoc'], ['cf-purpose', 'purpose'], ['cf-amount', 'amount']].forEach(function (p) {
      var i = ui.$('#' + p[0]);
      i.addEventListener('input', function () { f[p[1]] = i.value; f.touched[p[1]] = true; if (p[1] === 'amount') cfDerive(); });
    });
    ui.$('#cf-amount').addEventListener('change', function (ev) { var a = cfAmount(f); ev.target.classList.toggle('invalid', !!a.err); if (a.cents) { f.amount = centsStr(a.cents); ev.target.value = fmtM(a.cents); } cfDerive(); });
    ui.$('#cf-post').addEventListener('click', function () { doCashPost(ctx); });
    ui.$('#cf-preview').addEventListener('click', function () { cashPreview(); });
    ui.$('#cf-clear').addEventListener('click', function () { cf = newForm(f.type); re(); });
    ui.$('#cf-back').addEventListener('click', function () {
      var dirty = f.party || f.amount;
      var go = function () { cf = null; ctx.cashMode = 'list'; re(); };
      if (!dirty) { go(); return; }
      ui.confirm({ title: 'Формоос гарах', body: '<p>Батлаагүй кассын баримт устна. Гарах уу? (UX-CASH-06)</p>', ok: 'Гарах', danger: true }).then(function (ok) { if (ok) go(); });
    });
    cfDerive();
  }
  function cashPreview() {
    var f = cf, v = cfValidate(f), box = ui.$('#cf-errors');
    if (v.errors.length) { box.innerHTML = errBox(v.errors); box.scrollIntoView({ block: 'nearest' }); return; }
    var r = cfCall(f, v.cents, true);
    if (!r.ok) { box.innerHTML = errBox(r.errors); return; }
    box.innerHTML = '';
    var vch = r.result.vouchers[0], gl = vch.gl, dr = sum(gl, function (e) { return Math.max(e.amount, 0); }), cr = sum(gl, function (e) { return Math.max(-e.amount, 0); });
    var cv = vch.cashVoucher || { no: '***', kind: f.type, bank: f.bank, postingDate: f.date, amount: v.cents, party: f.name, purpose: f.purpose, transactionNo: '***' };
    var tables = {
      gl: '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Ваучер</th><th>Данс</th><th>Дансны нэр</th><th>Тайлбар</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
        gl.map(function (e) { return '<tr><td class="code">' + ui.esc(e.documentNo) + '</td><td class="code">' + e.account + '</td><td>' + ui.esc(acc(e.account).name) + '</td><td>' + ui.esc(e.description) + '</td>' + ui.moneyCell(Math.max(e.amount, 0), { blankZero: true }) + ui.moneyCell(Math.max(-e.amount, 0), { blankZero: true }) + '</tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="4">Σ ' + (dr === cr ? '✓ Дебит = Кредит' : '✕') + '</td>' + ui.moneyCell(dr) + ui.moneyCell(cr) + '</tr></tfoot></table></div>',
      bank: '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөнгөний данс</th><th>Тайлбар</th><th class="num">Дүн</th><th>МХ</th></tr></thead><tbody>' +
        vch.ble.map(function (b) { return '<tr><td>' + ui.esc(bankName(b.bank)) + '</td><td>' + ui.esc(b.description) + '</td>' + ui.moneyCell(b.amount) + '<td class="code">' + ui.esc(b.cashVoucherNo || '') + '</td></tr>'; }).join('') + '</tbody></table></div>',
      party: (vch.cle.length || vch.vle.length) ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Дэд дэвтэр</th><th>Төрөл</th><th class="num">Дүн</th><th>Тулгалт</th></tr></thead><tbody>' +
        vch.cle.map(function (e) { return '<tr><td>Авлага · ' + ui.esc(e.customer) + '</td><td>' + e.documentType + '</td>' + ui.moneyCell(e.amount) + '<td>' + (f.applyTo ? 'нэхэмжлэх #' + f.applyTo + '-д' : 'урьдчилгаа') + '</td></tr>'; }).join('') +
        vch.vle.map(function (e) { return '<tr><td>Өглөг · ' + ui.esc(e.vendor) + '</td><td>' + e.documentType + '</td>' + ui.moneyCell(e.amount) + '<td>' + (f.applyTo ? 'баримт #' + f.applyTo + '-д' : 'урьдчилгаа') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="muted">Авлага/өглөгийн бичилт үүсэхгүй.</p>',
      mx: voucherHtml(cv, { name: f.name, idDoc: f.idDoc, partyType: f.partyType, words: moneyWords(v.cents).text }, gl.filter(function (e) { return e.account !== '1100'; }).map(function (e) { return e.account; }), true)
    };
    var tabs = [['gl', 'Ерөнхий дэвтэр'], ['bank', 'Банк/касс'], ['party', 'Авлага/өглөг'], ['mx', (f.type === 'RECEIPT' ? 'МХ-1' : 'МХ-2') + ' хэвлэмэл']];
    var m = ui.modal({ title: 'Батлахын өмнө харах — ' + (f.type === 'RECEIPT' ? 'МХ-1' : 'МХ-2'), wide: true,
      body: '<div class="stack"><p class="small">Дугаар <code>***</code> — хуулийн дугаар зөвхөн батлахад олгогдоно. Урьдчилан харах нь батлахтай ижил кодыг ажиллуулаад буцаана (D-C6).</p>' +
        '<div class="tabs" role="tablist">' + tabs.map(function (t, i) { return '<button class="tab" role="tab" type="button" id="cpv-' + t[0] + '" data-cpv="' + t[0] + '" aria-selected="' + (i === 0) + '">' + t[1] + '</button>'; }).join('') + '</div><div id="cpv-body">' + tables.gl + '</div></div>',
      footer: [{ label: 'Хаах' }, { label: 'Батлах', kind: 'primary', onClick: function (close) { close(true); doCashPost(app.ctx); } }] });
    ui.$$('[data-cpv]', m.el).forEach(function (b) {
      b.addEventListener('click', function () {
        ui.$$('[data-cpv]', m.el).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        ui.$('#cpv-body', m.el).innerHTML = tables[b.getAttribute('data-cpv')];
        app.decorateNotes(m.el);
      });
    });
  }
  function doCashPost(ctx) {
    var f = cf;
    if (!f) return;
    var v = cfValidate(f), box = ui.$('#cf-errors');
    if (v.errors.length) { box.innerHTML = errBox(v.errors); box.scrollIntoView({ block: 'nearest' }); ui.toast('Батлах боломжгүй: ' + v.errors.length + ' алдаа', 'error'); return; }
    var pre = cfCall(f, v.cents, true);
    if (!pre.ok) { box.innerHTML = errBox(pre.errors); ui.toast('Батлах боломжгүй: ' + pre.errors.length + ' алдаа', 'error'); return; }
    var words = moneyWords(v.cents).text;
    ui.confirm({ title: (f.type === 'RECEIPT' ? 'МХ-1' : 'МХ-2') + ' батлах уу?', ok: 'Батлах',
      body: '<p><strong>' + ui.esc(f.name) + '</strong> · ' + ui.date(f.date) + ' · <strong>' + fmtM(v.cents, { sym: true }) + '</strong></p><p class="small">' + ui.esc(words) + '</p>' +
        '<p class="small">Батлахад ' + (f.type === 'RECEIPT' ? 'KO' : 'KZ') + '-2026-##### дугаар олгогдож, ерөнхий дэвтэр, кассын бичилт' + (f.partyType === 'CUSTOMER' || f.partyType === 'VENDOR' ? ', авлага/өглөгийн тулгалт' : '') + ' нэг гүйлгээнд үүснэ. Дараа нь засахгүй — зөвхөн буцаалтаар.</p>' })
      .then(function (ok) {
        if (!ok) return;
        var r = cfCall(f, v.cents, false);
        if (!r.ok) { var b2 = ui.$('#cf-errors'); if (b2) b2.innerHTML = errBox(r.errors); ui.toast('Батлах боломжгүй', 'error'); return; }
        var cv = r.result.vouchers[0].cashVoucher;
        if (cv) cashMeta[cv.no] = { name: f.name, idDoc: f.idDoc, partyType: f.partyType, words: words };
        ui.toast((f.type === 'RECEIPT' ? 'МХ-1 ' : 'МХ-2 ') + '<strong>' + ui.esc(cv ? cv.no : r.result.vouchers[0].documentNo) + '</strong> батлагдлаа. Кассын үлдэгдэл ' + ui.esc(fmtM(E().reports.bankBalance(CASH), { sym: true })) + '.');
        cf = null; ctx.cashMode = 'list';
        app.refresh();
        if (cv) setTimeout(function () { openVoucherPrint(cv, cashMeta[cv.no], null); }, 30);
      });
  }

  // --- printed form (09 §5.3) -------------------------------------------------
  function voucherHtml(cv, meta, contraAccs, isPreview) {
    var rec = cv.kind === 'RECEIPT', co = ERP.data.company;
    var b = !isPreview ? S().ble.filter(function (x) { return x.cashVoucherNo === cv.no; })[0] : null;
    var revTx = b && b.reversed ? S().transactions.filter(function (t) { return t.reversesTx === cv.transactionNo; })[0] : null;
    var words = meta && meta.words ? meta.words : moneyWords(cv.amount).text;
    var accs = (contraAccs || []).filter(function (a, i, arr) { return arr.indexOf(a) === i; });
    var signs = rec ? ['Ерөнхий нягтлан бодогч', 'Кассчин', 'Тушаагч'] : ['Захирал (зөвшөөрсөн)', 'Ерөнхий нягтлан бодогч', 'Кассчин', 'Хүлээн авагч'];
    return '<div class="mx-wrap" data-note="cash.print"><div class="mx-form">' + (revTx ? '<div class="mx-reversed">БУЦААГДСАН ' + ui.date(revTx.postingDate) + ', ' + ui.esc(revTx.documentNo) + '</div>' : '') +
      (isPreview ? '<div class="mx-mark" aria-hidden="true">УРЬДЧИЛСАН</div>' : '<div class="mx-mark" aria-hidden="true">ЖИШЭЭ</div>') +
      '<div class="mx-top"><div class="mx-co"><strong>' + ui.esc(co.name) + '</strong><span>Регистр ' + ui.esc(co.registrationNo) + ' · ТТД ' + ui.esc(co.tin) + '</span></div>' +
      '<div class="mx-legal">Сангийн сайдын 2017 оны 347 дугаар тушаалын хавсралт<br><strong>НХМаягт ' + (rec ? 'МХ-1' : 'МХ-2') + '</strong></div></div>' +
      '<h3 class="mx-title">' + (rec ? 'КАССЫН ОРЛОГЫН БАРИМТ' : 'КАССЫН ЗАРЛАГЫН БАРИМТ') + ' № <span class="mono">' + ui.esc(cv.no) + '</span></h3>' +
      '<p class="mx-date">' + mnDateWords(cv.postingDate) + '</p>' +
      '<dl class="mx-fields"><dt>Касс</dt><dd>' + ui.esc(bankName(cv.bank)) + ' (' + ui.esc(cv.bank) + ')</dd>' +
      '<dt>' + (rec ? 'Хэнээс хүлээн авсан' : 'Хэнд олгосон') + '</dt><dd>' + ui.esc(meta && meta.name ? meta.name : (cv.party || '')) + '</dd>' +
      '<dt>Бичиг баримтын дугаар</dt><dd class="mono">' + ui.esc(meta && meta.idDoc ? meta.idDoc : '—') + '</dd>' +
      '<dt>Гүйлгээний утга</dt><dd>' + ui.esc(cv.purpose) + '</dd>' +
      '<dt>Харьцсан данс</dt><dd class="mono">' + (accs.length ? accs.map(function (a) { return ui.esc(accLabel(a)); }).join(', ') : '—') + '</dd>' +
      '<dt>Дүн (тоогоор)</dt><dd class="mx-amount">' + fmtM(cv.amount, { sym: true }) + '</dd>' +
      '<dt>Дүн (үсгээр)</dt><dd>' + ui.esc(words) + '</dd></dl>' +
      '<div class="mx-signs">' + signs.map(function (s) { return '<div><span class="mx-line"></span><span>' + s + '</span><span class="mx-sub">/ гарын үсэг · нэр /</span></div>'; }).join('') + '<div class="mx-stamp">Тамганы<br>байр</div></div>' +
      '<div class="mx-foot"><span>Гүйлгээ #' + ui.esc(cv.transactionNo) + '</span><span>Хэвлэсэн ' + ui.date(today()) + ' · ' + ui.esc(userName()) + '</span><span>Жишээ өгөгдөл — бодит баримт биш</span></div></div></div>';
  }
  function openVoucherPrint(cv, meta) {
    var contra = S().glEntries.filter(function (g) { return g.transactionNo === cv.transactionNo && g.account !== E().setup.bankGlAccount(cv.bank); }).map(function (g) { return g.account; });
    var m = ui.modal({ title: (cv.kind === 'RECEIPT' ? 'МХ-1 ' : 'МХ-2 ') + cv.no, wide: true,
      body: voucherHtml(cv, meta, contra, false) + '<p class="xs muted">Хэвлэмэл нь батлах үед хадгалсан утгаас (дүн үсгээр BR-BNK-24) гарна. Прототипт хэвлэх, PDF татах идэвхгүй — бодит системд <code>GET /cash-vouchers/{id}/pdf</code> (A5 хэвтээ, UX-CASH-07).</p>',
      footer: [{ label: 'Хэвлэх (PDF)', onClick: function () { ui.toast('Прототипт хэвлэх идэвхгүй: бодит системд сервер МХ-ийн PDF-ийг (QuestPDF, A5) нээнэ.'); } }, { label: 'Хаах', kind: 'primary' }] });
    app.decorateNotes(m.el);
  }

  // ===========================================================================
  // 7. #bank-rec — import wizard (S-BNK-08) and worksheet (S-BNK-09)
  // ===========================================================================
  var WZ = null;
  var WZ_STEPS = ['Файл', 'Танилт', 'Баганын харгалзуулалт', 'Урьдчилан харах', 'Профайл хадгалах', 'Импорт'];
  function newWizard(bank) {
    var file = sampleFile(bank), p = PROFILES.filter(function (x) { return x.bank === bank && x.isDefault; })[0];
    return { bank: bank, step: 1, preset: p ? 'P:' + p.code : BANK_PRESET[bank] || 'AUTO', fileName: file.name, text: file.text, det: null, map: null, dateFmt: null, parsed: null,
      profileCode: (BANK_PRESET[bank] === 'KHAN' ? 'KHAN_CSV_' : 'GOLOMT_CSV_') + 'NARAN', profileDefault: true, errors: [], result: null };
  }
  function wzRunDetect() {
    var w = WZ;
    w.det = detectFile(w.text);
    w.errors = w.det.errors.slice();
    if (w.det.headerRow < 0) return false;
    var profile = w.preset.indexOf('P:') === 0 ? PROFILES.filter(function (x) { return 'P:' + x.code === w.preset; })[0] : null;
    w.map = suggestMapping(w.det.headers, profile ? null : (w.preset === 'AUTO' ? null : w.preset), profile);
    var idx = mappingIndex(w.map);
    var vals = idx.TRANSACTION_DATE !== undefined ? w.det.dataRows.map(function (r) { return r[idx.TRANSACTION_DATE]; }).filter(function (v) { return v && anyDate(v); }) : [];
    w.dateFmt = (profile && profile.dateFormat) || detectDateFormat(vals) || (w.preset !== 'AUTO' && PRESETS[w.preset] ? PRESETS[w.preset].dateFormat : 'yyyy-MM-dd');
    return true;
  }
  function wzHtml() {
    var w = WZ, st = recStore(w.bank), html = '';
    html += '<div class="card" data-note="rec.wizard"><div class="card-head"><h2>Хуулга импорт — ' + ui.esc(bankName(w.bank)) + '</h2><span class="small muted">S-BNK-08 · импорт нь ledger-ийг өөрчлөхгүй (BR-BNK-49)</span></div><div class="card-body stack">' +
      '<ol class="wz-steps" aria-label="Алхам">' + WZ_STEPS.map(function (s, i) { var n = i + 1; return '<li class="' + (n < w.step ? 'done' : '') + '"' + (n === w.step ? ' aria-current="step"' : '') + '>' + s + '</li>'; }).join('') + '</ol>' +
      errBox(w.errors, 'Алдаа') + '<div id="wz-body">';
    if (w.step === 1) {
      html += '<div class="form-grid"><div class="field"><span class="flabel">Мөнгөний данс</span><div class="input" style="display:flex;align-items:center">' + ui.esc(w.bank + ' · ' + bankName(w.bank)) + '</div></div>' +
        '<div class="field"><label for="wz-preset">Импортын профайл</label><select class="select" id="wz-preset">' +
        Object.keys(PRESETS).map(function (k) { return opt(k, PRESETS[k].name, w.preset === k); }).join('') +
        PROFILES.filter(function (p) { return p.bank === w.bank; }).map(function (p) { return opt('P:' + p.code, 'Хадгалсан: ' + p.code, w.preset === 'P:' + p.code); }).join('') +
        opt('AUTO', 'Автомат таних (синоним толь)', w.preset === 'AUTO') + '</select><span class="hint">Preset-ийн баганын нэр ⚠ жишээ файлаар баталгаажаагүй (OQ-BNK-01)</span></div>' +
        '<div class="field"><label for="wz-fname">Файлын нэр</label><input class="input mono" id="wz-fname" value="' + ui.esc(w.fileName) + '"></div></div>' +
        '<div class="field"><label for="wz-text">Файлын агуулга (жишээ CSV — засаж туршиж болно)</label><textarea class="input wz-file" id="wz-text" spellcheck="false">' + ui.esc(w.text) + '</textarea>' +
        '<span class="hint">Хаан банкны интернэт банкны экспорт: толгойн хэсэгт данс ба эхний/эцсийн үлдэгдэл, дараа нь гарчгийн мөр. Дүнгийн мянгатын тусгаарлагч ",", бутархай ".".</span></div>' +
        '<div class="row"><button class="btn sm" id="wz-reset" type="button">Жишээ файлыг сэргээх</button>' + (Object.keys(st.hashes).length ? '<span class="small muted">Энэ дансанд импортолсон файл: ' + Object.keys(st.hashes).length + '</span>' : '') + '</div>';
    } else if (w.step === 2) {
      var d = w.det;
      html += '<div class="grid cols-2"><div data-note="rec.detect"><dl class="kv"><dt>Файлын төрөл</dt><dd>' + d.fileType + ' <span class="muted xs">(эхний байт "PK" биш)</span></dd><dt>Кодлол</dt><dd>' + d.encoding + '</dd>' +
        '<dt>Тусгаарлагч</dt><dd class="mono">"' + (d.delimiter === '\t' ? '\\t' : d.delimiter) + '"</dd><dt>Гарчгийн мөр</dt><dd>' + (d.headerRow + 1) + '-р мөр</dd>' +
        '<dt>Өгөгдлийн мөр (дээд тал)</dt><dd>' + d.dataRows.length + '</dd><dt>Эхний үлдэгдэл (толгой)</dt><dd>' + (d.opening !== null ? fmtM(d.opening) : '—') + '</dd><dt>Эцсийн үлдэгдэл (толгой)</dt><dd>' + (d.closing !== null ? fmtM(d.closing) : '—') + '</dd></dl></div>' +
        '<div>' + ui.calc('Тооцоог харах: тусгаарлагч ба гарчгийн мөр', '<p>Эхний 20 хоосон биш мөрөнд хашилтын гаднах тэмдэгтийн тоо (мөр бүрд тогтмол ба ≥ 2 бол сонгоно):</p><div class="formula">' +
          d.delims.map(function (x) { return '"' + (x.d === '\t' ? '\\t' : x.d) + '": ' + x.counts.slice(0, 12).join(' ') + (x.counts.length > 12 ? ' …' : '') + (x.ok ? '  ✓ тогтмол' : '  ✕'); }).join('\n') + '</div>' +
          '<p>Гарчгийн мөр: эхний 30 мөрөөс ≥ 3 нүдтэй, нүдний ≥ 50 % нь тоо/огноо биш текст, дараагийн мөрөнд огноо ба тоо байгаа эхний мөр.</p>') + '</div></div>' +
        '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Мөр</th>' + d.headers.map(function (h, i) { return '<th>' + (i + 1) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        d.rows.slice(0, Math.min(d.rows.length, d.headerRow + 5)).map(function (r, i) {
          return '<tr class="' + (i === d.headerRow ? 'wz-headrow' : i < d.headerRow ? 'wz-block' : '') + '"><td class="code">' + (i + 1) + '</td>' + d.headers.map(function (h, j) { return '<td>' + ui.esc(r[j] || '') + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div><p class="xs muted">Саарал — толгойн хэсэг (данс, үлдэгдэл); тодруулсан — гарчгийн мөр.</p>';
    } else if (w.step === 3) {
      var ix = mappingIndex(w.map);
      var amountMode = ix.AMOUNT !== undefined ? 'SIGNED' : 'DEBIT_CREDIT';
      html += '<div data-note="rec.mapping"><div class="table-wrap"><table class="grid-table wz-map"><thead><tr><th>#</th><th>Файлын гарчиг</th><th>NormHeader</th><th>Жишээ утга</th><th>Зорилтот талбар</th><th>Эх</th></tr></thead><tbody>' +
        w.map.map(function (m, i) {
          var samples = w.det.dataRows.slice(0, 3).map(function (r) { return r[i] || ''; }).filter(Boolean);
          return '<tr><td class="code">' + (i + 1) + '</td><td>' + ui.esc(m.header) + '</td><td class="code">' + ui.esc(m.norm) + '</td><td class="small">' + samples.map(ui.esc).join('<br>') + '</td>' +
            '<td><label class="sr-only" for="wz-map-' + i + '">' + ui.esc(m.header) + ' → талбар</label><select class="select" id="wz-map-' + i + '" data-map="' + i + '"><option value="">— алгасах —</option>' +
            TARGETS.map(function (t) { return opt(t[0], t[1] + ' (' + t[0] + ')', m.target === t[0]); }).join('') + '</select></td><td class="wz-src">' + ui.esc(m.src || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<div class="form-grid"><div class="field"><label for="wz-datefmt">Огнооны формат (гүйлгээний огноо)</label><select class="select" id="wz-datefmt">' + DATE_FORMATS.map(function (f) { return opt(f[0], f[0], f[0] === w.dateFmt); }).join('') + '</select><span class="hint">Бүх мөрийг алдаагүй задлах эхний формат (09 §5.8.3)</span></div>' +
        '<div class="field"><span class="flabel">Дүнгийн горим</span><div class="input" style="display:flex;align-items:center">' + amountMode + '</div><span class="hint">' + (amountMode === 'DEBIT_CREDIT' ? 'дүн = кредит − дебит (BR-BNK-42)' : 'дүн = AMOUNT × multiplier') + '</span></div>' +
        '<div class="field"><span class="flabel">Мянгат / бутархай</span><div class="input mono" style="display:flex;align-items:center">"," / "."</div></div></div>' +
        ui.calc('Тооцоог харах: гарчгийн нормчлол', '<p>NormHeader(h) = Upper(Translit(Trim(CollapseSpaces(RemovePunct(h))))) — кирилл үсгийг латинаар (Ө → U, Х → KH, Ү → U), дараа нь синоним толийн нормчилсон хэлбэртэй яг тэнцүү эсэхийг шалгана. Нэг талбарыг нэг л баганад онооно.</p><div class="formula">' +
          w.map.map(function (m) { return '"' + m.header + '" → ' + m.norm + ' → ' + (m.target ? m.target + ' (' + m.src + ')' : '—'); }).join('\n') + '</div>');
    } else if (w.step === 4) {
      var p = w.parsed;
      var warnLink = p.opening !== null && p.opening !== st.balanceLast + (st.open ? sum(st.open.lines, function (l) { return l.amount; }) : 0);
      html += '<div data-note="rec.preview">' + (p.balanceOk ? '<div class="banner"><span class="ok-mark">✓</span> Эхний үлдэгдэл ' + fmtM(p.opening) + ' + Σ мөр ' + fmtM(p.total) + ' = ' + fmtM(p.opening + p.total) + ' = эцсийн үлдэгдэл ' + fmtM(p.closing) + ' (BR-BNK-47)</div>'
        : '<div class="banner warn"><span class="bad-mark">✕</span> Үлдэгдлийн шалгалт таарахгүй: эхний ' + fmtM(p.opening) + ' + Σ ' + fmtM(p.total) + ' = ' + fmtM((p.opening || 0) + p.total) + ' ≠ эцсийн ' + fmtM(p.closing) + '. Импорт хийгдэх боловч батлахад хатуу шалгана. Дебит/кредит баганыг шалгана уу.</div>') +
        (warnLink ? '<div class="banner warn">W-BNK-02: Өмнөх хуулгатай залгаагүй — сүүлд батлагдсан хуулгын эцсийн үлдэгдэл ' + fmtM(st.balanceLast) + ' ≠ энэ хуулгын эхний ' + fmtM(p.opening) + ' (BR-BNK-48).</div>' : '') +
        (p.runBad.length ? '<div class="banner warn">Мөрийн үлдэгдэл зөрсөн мөр: ' + p.runBad.join(', ') + '</div>' : '') +
        '<div class="table-wrap"><table class="grid-table"><thead><tr><th>Файлын мөр</th><th>Огноо</th><th>Утга</th><th>Харьцсан данс</th><th>Журнал</th><th class="num">Дүн</th><th class="num">Үлдэгдэл</th><th></th></tr></thead><tbody>' +
        p.lines.slice(0, 20).map(function (l) {
          return '<tr class="' + (l.errors.length ? 'err' : '') + '"><td class="code">' + l.fileRow + '</td><td>' + ui.date(l.date) + '</td><td>' + ui.esc(l.description) + '</td><td class="code">' + ui.esc(l.cpAccount || l.cpName || '') + '</td><td class="code">' + ui.esc(l.txId) + '</td>' +
            (l.amount !== undefined ? ui.moneyCell(l.amount) : '<td class="num">—</td>') + (l.running !== null ? ui.moneyCell(l.running) : '<td></td>') + '<td>' + (l.errors.length ? '<span class="bad-mark">✕ ' + l.errors.join(', ') + '</span>' : l.runOk === false ? '<span class="bad-mark">✕ үлдэгдэл</span>' : '<span class="ok-mark">✓</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (p.zero ? '<p class="xs muted">0 дүнтэй ' + p.zero + ' мөрийг алгасав.</p>' : '') + '</div>' +
        ui.calc('Тооцоог харах: үлдэгдлийн шалгалт', '<div class="formula">Эхний үлдэгдэл (толгой)        ' + fmtM(p.opening) + '\n' +
          p.lines.filter(function (l) { return !l.errors.length; }).map(function (l) { return (l.amount >= 0 ? '+ ' : '− ') + fmtM(Math.abs(l.amount)).padStart(16, ' ') + '   ' + l.description.slice(0, 40); }).join('\n') +
          '\n= ' + fmtM((p.opening || 0) + p.total) + '   эцсийн (толгой) ' + fmtM(p.closing) + (p.balanceOk ? '  ✓' : '  ✕') + '</div>');
    } else if (w.step === 5) {
      html += '<div class="form-grid"><div class="field"><label for="wz-prof">Профайлын код</label><input class="input mono" id="wz-prof" value="' + ui.esc(w.profileCode) + '" maxlength="30"></div>' +
        '<div class="field"><span class="flabel">Анхдагч болгох</span><label class="checkbox" for="wz-prof-def"><input type="checkbox" id="wz-prof-def"' + (w.profileDefault ? ' checked' : '') + '> ' + ui.esc(w.bank) + '-ийн import_format_id</label></div></div>' +
        '<div class="table-wrap"><table class="grid-table"><thead><tr><th>target_field</th><th>column_header</th></tr></thead><tbody>' +
        w.map.filter(function (m) { return m.target; }).map(function (m) { return '<tr><td class="code">' + m.target + '</td><td>' + ui.esc(m.header) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="xs muted">bank.bank_statement_import_format + _column: date_format ' + ui.esc(w.dateFmt) + ', delimiter ",", decimal ".", thousand ",", header_rows 30 (хайх хязгаар).</p>';
    } else {
      var res = w.result;
      if (!res) {
        html += '<div data-note="rec.dedupe"><p>Импортлоход: файлын хэшээр давхар файлыг, мөр бүрийн түлхүүрээр (журналын дугаар → <code>T:</code>…) давхар мөрийг шалгана. Дараа нь автомат тулгалт шууд ажиллана.</p>' +
          '<dl class="kv" style="max-width:420px"><dt>Файл</dt><dd class="mono">' + ui.esc(w.fileName) + '</dd><dt>Хэш (прототип)</dt><dd class="mono">' + hash16(w.text) + '</dd><dt>Мөр</dt><dd>' + w.parsed.lines.length + '</dd>' +
          '<dt>Хуулгын №</dt><dd class="mono">' + ui.esc(st.open ? st.open.statementNo + ' (нээлттэйд нэмнэ)' : nextStatementNo(st, w.parsed.statementDate)) + '</dd></dl></div>';
      } else {
        html += '<div data-note="rec.dedupe"><div class="banner"><strong>Импортлосон ' + res.imported + ' мөр</strong>, давхар тул алгассан ' + res.skipped + ' мөр (FR-BNK-010). ' +
          (res.rec ? 'Тулгалт <span class="mono">' + ui.esc(res.rec.statementNo) + '</span>' + (res.summary ? ': автомат тулгалт — тулгагдсан ' + res.summary.matched + ' / ' + res.summary.lines + ', дунд ' + res.summary.medium + ', алга ' + res.summary.none + '.' : '') : '') + '</div>' +
          '<p class="small">Ижил файлыг дахин импортлох гэвэл бүхэлд нь татгалзана; агуулгыг өөрчилсөн файлд давхар мөрүүд алгасагдана.</p></div>';
      }
    }
    html += '</div><div class="wz-nav"><div class="row"><button class="btn" id="wz-cancel" type="button">Болих</button>' + (w.step > 1 && !w.result ? '<button class="btn" id="wz-back" type="button">‹ Буцах</button>' : '') + '</div><div class="row">' +
      (w.step < 6 ? '<button class="btn primary" id="wz-next" type="button">Дараах ›</button>' : w.result ? (w.result.rec ? '<button class="btn primary" id="wz-go" type="button">Тулгалт руу ›</button>' : '') + '<button class="btn" id="wz-again" type="button">Дахин импортлох</button>' : '<button class="btn primary" id="wz-import" type="button">Импортлох</button>') +
      '</div></div></div></div>';
    return html;
  }
  function wzNext() {
    var w = WZ;
    w.errors = [];
    if (w.step === 1) { if (!String(w.text).trim()) { w.errors = [{ code: 'api.validation_failed', message: 'Файл хоосон.' }]; return; } if (!wzRunDetect()) return; }
    if (w.step === 3) {
      var me = mappingErrors(w.map);
      if (me.length) { w.errors = me; return; }
      w.parsed = parseStatement(w.det, w.map, w.dateFmt);
      if (!w.parsed.lines.length) { w.errors = [{ code: 'bank.statement_parse_failed', message: 'Огноо задрах мөр алга — огнооны формат эсвэл баганыг шалгана уу.' }].concat(w.parsed.errors); return; }
    }
    if (w.step === 4 && w.parsed.errors.length) { w.errors = [{ code: 'bank.statement_parse_failed', message: 'Алдаатай мөртэй файлыг импортлохгүй (хэсэгчилсэн импорт байхгүй, 09 §5.7).' }].concat(w.parsed.errors); return; }
    if (w.step === 5) {
      var code = String(w.profileCode || '').trim().toUpperCase();
      if (!/^[A-Z0-9_]{2,30}$/.test(code)) { w.errors = [{ code: 'api.validation_failed', message: 'Профайлын код: A–Z, 0–9, "_" (2–30).' }]; return; }
      var cols = {};
      w.map.forEach(function (m) { if (m.target) cols[m.target] = m.header; });
      PROFILES = PROFILES.filter(function (p) { return !(p.bank === w.bank && p.code === code); });
      if (w.profileDefault) PROFILES.forEach(function (p) { if (p.bank === w.bank) p.isDefault = false; });
      PROFILES.push({ bank: w.bank, code: code, cols: cols, dateFormat: w.dateFmt, isDefault: w.profileDefault });
      ui.toast('Импортын профайл <strong>' + ui.esc(code) + '</strong> хадгалагдлаа.');
    }
    w.step = Math.min(6, w.step + 1);
  }

  function renderRec(el, ctx) {
    var bank = ctx.recBank && BANK_PRESET[ctx.recBank] ? ctx.recBank : 'KHAN01';
    ctx.recBank = bank;
    var st = recStore(bank);
    var view = ctx.recView || (st.open ? 'work' : 'start');
    if (view === 'work' && !st.open) view = 'start';
    if (view === 'import' && (!WZ || WZ.bank !== bank)) WZ = newWizard(bank);
    var html = '<div class="page-head"><div class="title-wrap"><h1>Хуулга ба тулгалт</h1><span class="docno">' + ui.esc(bankName(bank)) + ' · ' + E().setup.bankGlAccount(bank) + '</span></div>' +
      '<div class="row" data-note="rec.account"><label class="sr-only" for="rec-bank">Банкны данс</label><select class="select" id="rec-bank" style="width:auto">' +
      ERP.data.bankAccounts.map(function (b) { return opt(b.no, b.no + ' · ' + b.name + (b.kind === 'CASH' ? ' (касс — тооллогоор)' : ''), b.no === bank, b.kind === 'CASH'); }).join('') + '</select>' +
      (view !== 'import' ? '<button class="btn' + (st.open ? '' : ' primary') + '" id="rec-import" type="button">Хуулга импорт</button>' : '') + '</div></div>';
    html += '<p class="small muted">Сүүлд батлагдсан хуулга: <span class="mono">' + ui.esc(st.lastStatementNo || '—') + '</span> · ' + (st.lastStatementDate ? ui.date(st.lastStatementDate) : '—') + ' · үлдэгдэл <strong>' + fmtM(st.balanceLast) + '</strong>' +
      (st.open ? ' · нээлттэй тулгалт <span class="mono">' + ui.esc(st.open.statementNo) + '</span>' : '') + '. Касс (CASH)-ыг хуулгаар тулгахгүй — <a href="#cash">кассын баримт</a>, тооллогоор (BR-BNK-63).</p>';
    if (view === 'import') html += wzHtml();
    else if (view === 'work') html += workHtml(st.open, ctx);
    else if (view === 'done' && ctx.recDone) html += doneHtml(ctx.recDone);
    else html += '<div class="card"><div class="soon-card"><div class="big">Банкны хуулга импортлоогүй</div><p>Хаан, Голомт банкны файл эсвэл CSV/XLSX. Импортолсны дараа автомат тулгалт ажиллана.</p>' +
      '<button class="btn primary" id="rec-import-2" type="button">Хуулга импорт</button></div></div>';
    html += reportHtml(bank, ctx) + historyHtml(bank);
    el.innerHTML = html;
    bindRec(el, ctx, bank, view);
  }

  function workHtml(rec, ctx) {
    var total = sum(rec.lines, function (l) { return l.amount; }), calcEnd = rec.balanceLast + total, okBal = calcEnd === rec.ending;
    var unmatched = rec.lines.filter(function (l) { return lineDiff(l) !== 0; });
    var lowConf = rec.lines.filter(function (l) { var c = lineConf(l); return !l.match || c.c === 'MEDIUM' || c.c === 'LOW'; });
    var flt = ctx.recFilter || 'all';
    var shown = flt === 'open' ? unmatched : flt === 'low' ? lowConf : rec.lines;
    var sel = rec.lines.filter(function (l) { return l.lineNo === ctx.recSel; })[0] || unmatched[0] || rec.lines[0];
    if (sel) ctx.recSel = sel.lineNo;
    var vs = recVouchers(rec), closeCount = sum(rec.lines, function (l) { var es = lineBleEntries(l); return es ? es.length : 0; });
    var why = !okBal ? 'Мөрүүдийн нийлбэр эцсийн үлдэгдэлтэй таарахгүй (зөрүү ' + fmtM(rec.ending - calcEnd) + ').' : unmatched.length ? 'Тулгагдаагүй ' + unmatched.length + ' мөр (' + fmtM(sum(unmatched, lineDiff)) + '). Тулгах эсвэл данс руу бичнэ үү.' : '';
    var html = '<div class="card"><div class="card-body stack">' +
      '<div class="actionbar"><span class="row" data-note="rec.post"><button class="btn primary" id="rec-post" type="button"' + (why ? ' disabled title="' + ui.esc(why) + '"' : '') + '>Батлах ба тулгах <span class="kbd">F9</span></button>' +
      '<button class="btn" id="rec-preview" type="button">Урьдчилан харах</button></span><button class="btn" id="rec-auto" type="button">Автомат тулгах</button>' +
      '<button class="btn ghost" id="rec-discard" type="button">Хуулга хаях</button>' + (why ? '<span class="small muted" id="rec-why">' + ui.esc(why) + '</span>' : '<span class="small ok-mark">✓ Батлахад бэлэн</span>') + '</div>' +
      '<div id="rec-errors"></div>' +
      '<div class="rec-head" data-note="rec.header"><dl class="kv"><dt>Данс</dt><dd>' + ui.esc(rec.bank) + ' (' + E().setup.bankGlAccount(rec.bank) + ')</dd><dt>Хуулгын №</dt><dd class="mono">' + ui.esc(rec.statementNo) + '</dd><dt>Хуулгын огноо</dt><dd>' + ui.date(rec.statementDate) + '</dd></dl>' +
      '<div class="rec-eq"><span>Өмнөх үлдэгдэл ' + fmtM(rec.balanceLast) + '</span><span class="op">+</span><span>Мөрүүд ' + fmtM(total) + '</span><span class="op">=</span><strong>' + fmtM(calcEnd) + '</strong></div>' +
      '<div class="field"><label for="rec-ending">Эцсийн үлдэгдэл (хуулга)</label><input class="input num mono" id="rec-ending" inputmode="decimal" value="' + ui.esc(fmtM(rec.ending)) + '">' +
      '<span class="' + (okBal ? 'ok-mark' : 'bad-mark') + ' small">' + (okBal ? '✓ Таарсан' : '✕ Зөрүү ' + fmtM(rec.ending - calcEnd)) + '</span></div></div>' +
      ui.calc('Тооцоог харах: үлдэгдлийн тэгшитгэл', '<div class="formula">balance_last_statement   ' + fmtM(rec.balanceLast) + '   (сүүлд батлагдсан хуулга ' + ui.esc(recStore(rec.bank).lastStatementNo || '—') + ')\n' +
        rec.lines.map(function (l) { return '+ мөр ' + String(l.lineNo).padStart(5, ' ') + '  ' + (l.amount >= 0 ? ' ' : '') + fmtM(l.amount).padStart(16, ' '); }).join('\n') + '\n= ' + fmtM(calcEnd) + (okBal ? ' = statement_ending_balance ✓' : ' ≠ ' + fmtM(rec.ending) + ' ✕') + '</div><p class="xs">BR-BNK-66: Σ statement_amount = statement_ending_balance − balance_last_statement.</p>') +
      '<div class="row between"><div class="tabs" role="tablist" aria-label="Шүүлтүүр">' +
      [['all', 'Бүгд', rec.lines.length], ['open', 'Тулгагдаагүй', unmatched.length], ['low', 'Бага итгэлтэй', lowConf.length]].map(function (t) {
        return '<button class="tab" role="tab" type="button" id="rec-f-' + t[0] + '" data-rf="' + t[0] + '" aria-selected="' + (flt === t[0]) + '">' + t[1] + ' <span class="count">' + t[2] + '</span></button>';
      }).join('') + '</div><div class="row small muted rec-algo">Алгоритм: <span data-note="rec.phase-a" class="chip">А үе · BLE яг дүн</span> → <span data-note="rec.scoring" class="chip">Б үе · оноо</span> → <span data-note="rec.text-rule" class="chip">текстийн дүрэм</span></div></div>' +
      '<div class="rec-wrap"><div class="rec-layout"><div class="card"><div class="table-wrap"><table class="grid-table rec-lines"><thead><tr><th>Мөр</th><th>Огноо</th><th>Тайлбар</th><th class="num">Дүн</th><th data-note="rec.lines">Итгэл</th><th>Тулгалт</th><th class="num">Зөрүү</th></tr></thead><tbody>' +
      (shown.map(function (l) {
        var c = lineConf(l), d = lineDiff(l);
        var tgt = l.match ? (l.match.kind === 'ACCOUNT' ? 'Данс ' + accLabel(l.match.acc) : l.match.kind === 'ADVANCE' ? 'Урьдчилгаа ' + l.match.partyNo : l.match.prop.title) + (l.split ? ' + зөрүү → ' + l.split.acc : '') : '—';
        return '<tr class="clickable' + (sel && sel.lineNo === l.lineNo ? ' sel' : '') + '" data-rl="' + l.lineNo + '" tabindex="0" aria-selected="' + (sel && sel.lineNo === l.lineNo) + '"><td class="code">' + l.lineNo + '</td><td>' + ui.date(l.date) + '</td>' +
          '<td class="desc">' + ui.esc(l.description) + (l.cpName ? '<br><span class="xs muted">' + ui.esc(l.cpName) + '</span>' : '') + '</td>' + ui.moneyCell(l.amount) + '<td>' + confHtml(c.c, c.sugg) + '</td><td class="small tgt">' + ui.esc(tgt) + '</td>' + ui.moneyCell(d, { blankZero: true, negRed: true }) + '</tr>';
      }).join('') || '<tr><td colspan="7" class="empty">Энэ шүүлтүүрт мөр алга.</td></tr>') +
      '</tbody></table></div></div>' +
      '<aside class="rec-side" aria-label="Сонгосон мөрийн санал">' + (sel ? sideHtml(rec, sel, ctx) : '') + '</aside></div></div>' +
      '<div class="rec-foot"><span>Σ хуулга <strong>' + fmtM(total) + '</strong></span><span>Σ тулгасан <strong>' + fmtM(sum(rec.lines, lineApplied)) + '</strong></span>' +
      '<span>Тулгагдаагүй <strong>' + unmatched.length + '</strong> мөр (' + fmtM(sum(unmatched, lineDiff)) + ')</span>' +
      '<span>Батлахад: <strong>' + vs.filter(function (v) { return v.line.match.prop && (v.line.match.prop.kind === 'CUSTOMER' || v.line.match.prop.kind === 'VENDOR') || v.line.match.kind === 'ADVANCE'; }).length + '</strong> төлбөр, <strong>' +
      vs.filter(function (v) { return v.line.match.kind === 'ACCOUNT' || (v.line.match.prop && v.line.match.prop.kind === 'GL'); }).length + '</strong> дүрэм/дансны бичилт, <strong>' + closeCount + '</strong> банкны бичилт хаагдана</span></div>' +
      '<p class="xs muted">Файл: ' + rec.files.map(function (f) { return ui.esc(f.name) + ' (' + f.lines + ' мөр' + (f.skipped ? ', ' + f.skipped + ' давхар' : '') + ')'; }).join(', ') + '. Ажлын хуудсыг засах нь ledger-ийг өөрчлөхгүй (BR-BNK-64).</p>' +
      '</div></div>';
    return html;
  }

  function sideHtml(rec, l, ctx) {
    var props = l.proposals, chosenKey = ctx.recProp && props.some(function (p) { return p.key === ctx.recProp; }) ? ctx.recProp : (l.match && l.match.prop ? l.match.prop.key : (props.filter(function (p) { return !p.rejected; })[0] || {}).key);
    var chosen = props.filter(function (p) { return p.key === chosenKey; })[0] || (l.match && l.match.prop && l.match.prop.key === chosenKey ? l.match.prop : null);
    var d = lineDiff(l), html = '<div class="card"><div class="card-head"><h3>Мөр ' + l.lineNo + ' · ' + fmtM(l.amount) + '</h3>' + confHtml(lineConf(l).c, lineConf(l).sugg) + '</div><div class="card-body">' +
      '<p class="small">' + ui.date(l.date) + ' · ' + ui.esc(l.description) + (l.cpAccount ? ' · данс <span class="mono">' + ui.esc(l.cpAccount) + '</span>' : '') + '</p>' +
      '<p class="norm-text" title="Norm(утга + харьцагч + лавлах) — 09 §6.10.1">' + ui.esc(l.text) + '</p>';
    if (l.match) {
      html += '<div class="banner"><strong>Тулгасан:</strong> ' + ui.esc(l.match.kind === 'ACCOUNT' ? 'Данс ' + accLabel(l.match.acc) : l.match.kind === 'ADVANCE' ? 'Урьдчилгаа — ' + l.match.partyNo : l.match.prop.title) +
        ' · ' + (l.match.by === 'USER' ? 'хэрэглэгч' : 'автомат') + (l.posted ? ' · батлахад ' + ui.esc(l.posted.docNo) + ' үүссэн (' + ui.esc(l.posted.title) + ')' : '') +
        (d !== 0 ? '<br><span class="bad-mark">Зөрүү ' + fmtM(d) + '</span>' : '') + '</div><div class="row"><button class="btn sm" id="rec-unmatch" type="button">Тулгалт арилгах</button></div>';
    }
    html += '<div class="rec-sub" data-note="rec.proposals"><h3>Санал (оноо буурахаар, ≤ ' + MAX_PROPOSALS + ')</h3>';
    if (props.length) {
      html += '<ul class="prop-list">' + props.map(function (p, i) {
        var s = p.signals || {}, why = '';
        if (p.kind === 'BLE' && s.text) why = 'Дүн яг тэнцүү · огнооны зөрүү ' + s.dd + ' хоног · текстийн оноо ' + s.text.score + (s.text.field ? ' (' + s.text.field + ')' : '') + ' · нэр дэвшигч ' + s.rivals;
        else if (p.kind === 'BLE' || p.kind === 'GL') why = 'Текст «' + ui.esc(s.textRule ? s.textRule.text : '') + '» → ' + ui.esc(s.norm || '') + ' ⊂ мөрийн текст' + (s.existing ? ' · ижил дүнтэй бичилт аль хэдийн бий' : '');
        else why = '<span class="sig">Харьцагч: <b>' + SIG_MN[s.party.sig] + '</b></span> · <span class="sig">Баримт: <b>' + SIG_MN[s.doc.sig] + '</b>' + (s.doc.hit ? ' (' + ui.esc(s.doc.hit) + ')' : '') + '</span> · <span class="sig">Дүн: <b>' + SIG_MN[s.amount] + '</b></span>';
        return '<li class="prop' + (p.key === chosenKey ? ' chosen' : '') + (p.rejected ? ' rejected' : '') + '"><input type="radio" name="rec-prop" id="rp-' + i + '" value="' + ui.esc(p.key) + '"' + (p.key === chosenKey ? ' checked' : '') + '>' +
          '<label class="prop-title" for="rp-' + i + '">' + ui.esc(p.title) + '</label>' +
          '<div class="prop-meta">' + confHtml(p.confidence) + '<span>оноо <b class="mono">' + p.score + '</b> · ' + p.rule + '</span><span>тулгах ' + fmtM(p.applied) + '</span>' + (s.available !== undefined ? '<span>боломжит ' + fmtM(s.available) + '</span>' : '') + (p.rejected ? '<span class="bad-mark">татгалзсан</span>' : '') + '</div>' +
          '<div class="prop-why">' + why + '</div></li>';
      }).join('') + '</ul>';
      html += '<div class="row">' + (chosen && chosen.rejected ? '<button class="btn sm" id="rec-restore" type="button">Сэргээх</button>' : '<button class="btn primary sm" id="rec-accept" type="button"' + (chosen && !(l.match && l.match.prop && l.match.prop.key === chosen.key && l.match.by === 'USER') ? '' : ' disabled') + '>Тулгах ↵</button><button class="btn sm" id="rec-reject" type="button"' + (chosen ? '' : ' disabled') + '>Татгалзах</button>') + '</div>';
      if (chosen) html += ui.calc('Тооцоог харах: оноо ба шалтгаан', propCalc(l, chosen));
    } else html += '<p class="small muted">Санал алга: нээлттэй банкны бичилт, нэхэмжлэх эсвэл текстийн дүрэм таарсангүй (оноо &lt; ' + MIN_SCORE + ').</p>';
    html += '</div>';
    // write to account / advance / split / create rule
    var accs = directAccounts(), sign = l.amount > 0;
    var defAcc = sign ? '8200' : '8300';
    html += '<div class="rec-sub" data-note="rec.write-account"><h3>Гараар тайлбарлах</h3>';
    if (l.match && d !== 0) {
      html += '<label class="small" for="rec-split-acc">Зөрүү ' + fmtM(d) + ' → данс руу (BR-BNK-62)</label><div class="row"><select class="select" id="rec-split-acc">' + accs.map(function (a) { return opt(a.no, a.no + ' · ' + a.name, a.no === defAcc); }).join('') + '</select><button class="btn sm" id="rec-split" type="button">Зөрүүг хуваах</button></div>';
    }
    html += '<label class="small" for="rec-acc">Данс руу бичих (бүтэн мөр, НӨАТ-гүй)</label><div class="row"><select class="select" id="rec-acc">' + accs.map(function (a) { return opt(a.no, a.no + ' · ' + a.name, a.no === defAcc); }).join('') + '</select><button class="btn sm" id="rec-to-acc" type="button">Бичих</button></div>' +
      '<label class="small" for="rec-adv">Урьдчилгаа болгох (' + (sign ? 'харилцагч' : 'нийлүүлэгч') + ', D-F4)</label><div class="row"><select class="select" id="rec-adv">' + partiesOf(sign ? 'CUSTOMER' : 'VENDOR').map(function (p) { return opt(p.no, p.no + ' · ' + p.name); }).join('') + '</select><button class="btn sm" id="rec-to-adv" type="button">Урьдчилгаа</button></div>';
    var suggestText = String(l.description || '').toUpperCase().replace(/[0-9.,/:-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    html += '<details class="fasttab"><summary><span class="chev" aria-hidden="true">▸</span>Дүрэм үүсгэх (UX-REC-07)</summary><div class="ft-body stack"><div class="field"><label for="rec-rule-text">Текст (утгад агуулагдах)</label><input class="input mono" id="rec-rule-text" value="' + ui.esc(suggestText) + '"></div>' +
      '<div class="field"><label for="rec-rule-acc">' + (sign ? 'Орлогын данс (debit_account_id)' : 'Зарлагын данс (credit_account_id)') + '</label><select class="select" id="rec-rule-acc">' + accs.map(function (a) { return opt(a.no, a.no + ' · ' + a.name, a.no === defAcc); }).join('') + '</select></div>' +
      '<button class="btn sm" id="rec-rule-save" type="button">Дүрэм хадгалаад дахин тулгах</button>' +
      '<p class="xs muted">Одоогийн дүрэм: ' + TEXT_RULES.map(function (t) { return t.lineNo + ' «' + ui.esc(t.text) + '» → ' + (t.debit || t.credit); }).join(' · ') + '</p></div></details></div>';
    html += '</div></div>';
    return html;
  }
  function propCalc(l, p) {
    var s = p.signals || {}, h = '';
    if (p.kind === 'BLE' && s.text) {
      h += '<p><strong>А үе</strong> (09 §5.9.4): нээлттэй банкны бичилтээс дүн яг тэнцүү (' + fmtM(s.amount) + ' = ' + fmtM(l.amount) + '), |Δогноо| ≤ ' + DATE_TOL + ' хоног.</p>' +
        '<div class="formula">Δогноо = |' + ui.date(l.date) + ' − бичилтийн огноо| = ' + s.dd + ' хоног\nТекстийн оноо = max over {document_no, description} of max(Nearness, Exact)\n  ' + ui.esc(s.text.field || '—') + ': "' + ui.esc(s.text.value || '') + '" → Nearness ' + s.text.near + ', Exact ' + s.text.exact + ' → ' + s.text.score +
        '\nЭнэ мөрийн нэр дэвшигч: ' + s.rivals + ' → ' + (s.rivals === 1 ? 'ганц → HIGH, оноо 3990, автоматаар тулгана' : 'эрэмбээр (Δогноо ↑, текст ↓, entry_no ↑) сонгосон → MEDIUM 2990') + ' (BR-BNK-52)</div>';
      return h;
    }
    if (p.kind === 'GL' || p.kind === 'BLE') {
      return '<div class="formula">Norm("' + ui.esc(s.textRule.text) + '") = ' + ui.esc(s.norm) + ' (' + s.norm.length + ' тэмдэгт)\nNorm(мөр) = ' + ui.esc(l.text) + '\n→ агуулагдаж байна ✓\nДүн ' + (l.amount > 0 ? '> 0 → debit_account_id' : '< 0 → credit_account_id') + ' = ' + ui.esc(s.target) +
        '\nОноо = 3000 + min(' + s.norm.length + ', 498) + 1 = ' + p.score + ' → HIGH_TEXT_TO_ACCOUNT (BR-BNK-58)\nИжил дүн, |Δ| ≤ ' + TEXT_RULE_DAYS + ' хоног, ' + ui.esc(s.target) + '-д бичсэн нээлттэй BLE: ' + (s.existing ? 'бий → тэр BLE-тэй тулгана' : 'алга → батлахад шинэ BP/BR ваучер') + '</div>';
    }
    var ps = s.party, r = s.rule;
    h += '<p><strong>1. Харьцагч</strong> (09 §5.9.3): ' + ui.esc(ps.how || '') + '</p>';
    if (ps.name !== undefined) {
      h += '<div class="formula">NormName(харьцагч) = ' + ui.esc(ps.name) + '\nNormName(текст)     = ' + ui.esc(ps.text) + (ps.pieces ? '\nLCS хэсгүүд (≥ 4): ' + ps.pieces.map(ui.esc).join(', ') + ' → Σ ' + ps.total + ' / богино урт ' + ps.short + ' → Nearness = ' + ps.near : '') +
        '\n' + (ps.near !== null && ps.near !== undefined ? (ps.near >= NAME_EXACT ? '≥ ' + NAME_EXACT + ', энэ нэртэй харьцагч ' + ps.count + ' → ' + ps.sig : '< ' + NAME_EXACT + ' → NO') : '→ ' + ps.sig) + '</div>';
    }
    h += '<p><strong>2. Баримт</strong> (BR-BNK-55): ' + (s.doc.sig === 'NO' ? 'нэхэмжлэхийн дугаар (шахсан) текстийн токенуудад алга → NO' : 'Compress("' + ui.esc(s.doc.hit) + '")' + (s.doc.comp ? ' = ' + ui.esc(s.doc.comp) : '') + ' нь текстийн шахсан токентой тэнцүү → ' + s.doc.sig) + '. Токенууд: <span class="mono">' + ui.esc(Object.keys(l.tokens).join(' ')) + '</span></p>';
    h += '<p><strong>3. Дүн</strong> (BR-BNK-56, §6.7.1): S = ' + fmtM(l.amount) + ', хүлцэл 0 → муж [' + fmtM(s.range[0]) + '; ' + fmtM(s.range[1]) + ']. Боломжит = үлдэгдэл ' + fmtM(s.remaining !== undefined ? s.remaining : s.available) + (s.reserved ? ' − энэ тулгалтад батлагдсан ' + fmtM(s.reserved) : '') + ' = ' + fmtM(s.available) +
      ' → ' + (s.amount === 'NO_MATCHES' ? 'муж дотор биш → NO_MATCHES' : 'муж дотор; бүх ' + (p.kind === 'CUSTOMER' ? 'харилцагчийн' : 'нийлүүлэгчийн') + ' нэр дэвшигчээс ' + s.nIn + ' → ' + s.amount) + '.</p>';
    h += '<p><strong>4. Дүрэм</strong> (09 §6.7.2): (' + ps.sig + ', ' + s.doc.sig + ', ' + s.amount + ') → хүснэгтийг оноо буурахаар гүйж тохирох эхний мөр <b>' + r[0] + '</b> (' + r[1] + ', эрэмбэ ' + r[2] + ').</p>' +
      '<div class="formula">Оноо = 1000 × (c + 1) − priority = 1000 × (' + CONF_N[r[1]] + ' + 1) − ' + r[2] + ' = ' + ruleScore(r) + '\nТулгах дүн = min(|' + fmtM(s.available) + '|, |' + fmtM(l.amount) + '|) × sign(S) = ' + fmtM(p.applied) +
      '\nАвтомат тулгах уу: ' + ((r[1] === 'HIGH') && p.applied === l.amount ? 'тийм (HIGH ба дүн бүрэн)' : 'үгүй — ' + (r[1] !== 'HIGH' ? r[1] + ' итгэл хэрэглэгчийн шийдвэр шаардана' : 'дүн бүрэн тайлбарлагдаагүй')) + ' (BR-BNK-59)</div>';
    return h;
  }

  function reportHtml(bank, ctx) {
    var st = recStore(bank), D = ctx.recRepDate || (st.open ? st.open.statementDate : today());
    var r = recReport(bank, D);
    var html = '<div class="card" data-note="rec.report"><div class="card-head"><h2>Тулгалтын тайлан</h2><div class="field" style="flex-direction:row;align-items:center;gap:6px"><label for="rr-date" class="small" style="white-space:nowrap">Огноо D</label>' + ui.dateInput('rr-date', D) + '</div></div><div class="card-body stack">';
    if (!r.valid) html += '<div class="banner warn">D нь сүүлд батлагдсан хуулгын огнооноос (' + ui.date(r.base.date) + ') өмнө — энэ үед батлагдсан агшин зургийн тайланг харна (S-BNK-10). Тэгшитгэл зөвхөн D ≥ ' + ui.date(r.base.date) + '-д хүчинтэй.</div>';
    html += '<div class="table-wrap"><table class="grid-table rr-eq"><tbody>' +
      '<tr><td>G/L үлдэгдэл (Σ банкны бичилт, огноо ≤ D) — ' + E().setup.bankGlAccount(bank) + '</td>' + ui.moneyCell(r.gl) + '</tr>' +
      '<tr><td>− Тулгагдаагүй дэвтрийн бичилт (outstanding, ' + r.outs.length + ')</td>' + ui.moneyCell(-r.outstanding) + '</tr>' +
      '<tr><td>+ Тулгагдаагүй хуулгын мөр (ledger-д ороогүй, ' + r.unrec.length + ')</td>' + ui.moneyCell(r.unreconciled) + '</tr>' +
      '<tr><td>− Хуулгын үлдэгдэл (сүүлд батлагдсан ' + fmtM(r.base.ending) + ' + импортолсон ' + r.U.length + ' мөр)</td>' + ui.moneyCell(-r.statement) + '</tr>' +
      '</tbody><tfoot><tr><td>= Шалгалт ' + (r.check === 0 ? '<span class="ok-mark">✓ тэнцсэн</span>' : '<span class="bad-mark">✕ Шалгах шаардлагатай</span>') + '</td>' + ui.moneyCell(r.check) + '</tr></tfoot></table></div>' +
      ui.calc('Тооцоог харах: тэгшитгэлийн бүрэлдэхүүн', '<div class="formula">GL(D) − Outstanding(D) + Unreconciled(D) − Statement(D)\n= ' + fmtM(r.gl) + ' − (' + fmtM(r.outstanding) + ') + ' + fmtM(r.unreconciled) + ' − ' + fmtM(r.statement) + ' = ' + fmtM(r.check) + '</div>' +
        '<p><strong>Outstanding</strong> — нээлттэй банкны бичилт (тулгалтын ажлын хуудсанд BLE-тэй бүлэглэгдсэнийг оруулахгүй):</p>' +
        (r.outs.length ? '<div class="table-wrap"><table class="grid-table"><thead><tr><th>#</th><th>Огноо</th><th>Баримт</th><th>Тайлбар</th><th class="num">Дүн</th></tr></thead><tbody>' + r.outs.map(function (b) { return '<tr><td class="code">' + b.entryNo + '</td><td>' + ui.date(b.postingDate) + '</td><td class="code">' + ui.esc(b.documentNo) + '</td><td>' + ui.esc(b.description) + '</td>' + ui.moneyCell(b.amount) + '</tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">алга</p>') +
        '<p><strong>Unreconciled</strong> — импортолсон, BLE-тэй бүлэглээгүй хуулгын мөр (санал/дүрэм/дансаар тулгасан ч ledger-д хараахан ороогүй):</p>' +
        (r.unrec.length ? '<div class="formula">' + r.unrec.map(function (l) { return 'мөр ' + l.lineNo + '  ' + fmtM(l.amount).padStart(16, ' ') + '  ' + l.description.slice(0, 50); }).join('\n') + '</div>' : '<p class="muted small">алга</p>')) +
      '</div></div>';
    return html;
  }
  function historyHtml(bank) {
    var st = recStore(bank), latest = st.history.filter(function (h) { return !h.undone; }).slice(-1)[0];
    return '<div class="card" data-note="rec.history"><div class="card-head"><h2>Хуулгын түүх</h2><span class="small muted">S-BNK-10 · зөвхөн хамгийн сүүлийнхийг буцаана</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Хуулгын №</th><th>Огноо</th><th class="num">Өмнөх үлдэгдэл</th><th class="num">Эцсийн үлдэгдэл</th><th class="num">Мөр</th><th class="num">G/L (огноонд)</th><th class="num" title="Outstanding — тулгагдаагүй дэвтрийн бичилт">Тулгагдаагүй</th><th>Ваучер</th><th>Төлөв</th><th></th></tr></thead><tbody>' +
      '<tr class="cb-ob"><td class="code">' + ui.esc(st.baseline.statementNo || '—') + '</td><td>' + (st.baseline.statementDate ? ui.date(st.baseline.statementDate) : '—') + '</td><td></td>' + ui.moneyCell(st.baseline.ending) + '<td></td><td></td><td></td><td></td><td colspan="2">Өмнөх (шилжүүлсэн өгөгдөл)</td></tr>' +
      st.history.map(function (h) {
        return '<tr><td class="code">' + ui.esc(h.statementNo) + '</td><td>' + ui.date(h.statementDate) + '</td>' + ui.moneyCell(h.balanceLast) + ui.moneyCell(h.ending) + '<td class="num">' + h.lineCount + '</td>' + ui.moneyCell(h.glAt) + ui.moneyCell(h.outPay + h.outTx) +
          '<td class="code small">' + ui.esc(h.vouchers.join(', ') || '—') + '</td><td>' + (h.undone ? '<span class="pill neutral">Буцаагдсан ' + ui.date(h.undoneAt) + '</span>' : '<span class="pill ok">Батлагдсан</span>') + '</td>' +
          '<td>' + (h === latest ? '<button class="btn sm danger" id="rec-undo" type="button">Буцаах</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
  }
  function doneHtml(d) {
    return '<div class="card"><div class="card-body stack"><div class="banner"><strong>Хуулга ' + ui.esc(d.statementNo) + ' тулгагдлаа.</strong> Сүүлийн хуулгын үлдэгдэл ' + fmtM(d.ending, { sym: true }) + '. ' +
      (d.vouchers.length ? 'Үүссэн ваучер: <span class="mono">' + ui.esc(d.vouchers.join(', ')) + '</span>. ' : '') + 'Хаагдсан банкны бичилт: ' + d.closed.length + '.</div>' +
      '<p class="small">Тулгалтаар үүссэн төлбөр, шимтгэлийн ваучер ерөнхий дэвтэрт бичигдсэн (#checks дээрх BANK-SUB, INV-08 шалгалт PASS хэвээр). Буцаавал хуулга дахин нээгдэх ч ваучер буцаагдахгүй (BR-BNK-74).</p>' +
      '<div class="row"><a class="btn" href="#checks">Шалгалт руу</a><a class="btn" href="#journal">Ерөнхий журнал</a></div></div></div>';
  }

  function bindRec(el, ctx, bank, view) {
    var st = recStore(bank);
    ui.$('#rec-bank').addEventListener('change', function (ev) { ctx.recBank = ev.target.value; ctx.recView = null; ctx.recSel = null; ctx.recProp = null; ctx.recRepDate = null; ctx.recDone = null; app.refresh(); });
    var imp = function () { WZ = newWizard(bank); ctx.recView = 'import'; app.refresh(); };
    ['#rec-import', '#rec-import-2'].forEach(function (s) { var b = ui.$(s); if (b) b.addEventListener('click', imp); });
    var rr = ui.$('#rr-date');
    rr.addEventListener('change', function () { var iso = ui.parseDate(rr.value); if (!iso) { rr.classList.add('invalid'); return; } ctx.recRepDate = iso; app.refresh(); });
    var undo = ui.$('#rec-undo');
    if (undo) undo.addEventListener('click', function () {
      ui.confirm({ title: 'Хуулгын тулгалтыг буцаах уу?', danger: true, ok: 'Буцаах',
        body: '<p>Тулгагдсан банкны бичилтүүд дахин нээгдэж, "сүүлийн хуулгын үлдэгдэл" өмнөх утгаа авна. Тулгалтаар үүссэн ваучер буцаагдахгүй (BR-BNK-74) — тэдгээрийн мөр шинэ банкны бичилттэй тулгагдсан хэвээр тул дахин батлахад давхар төлбөр үүсэхгүй.</p><p class="small">Шалтгаан: <code>REVERSAL</code> (BR-BNK-75, аудитын лог).</p>' })
        .then(function (ok) {
          if (!ok) return;
          var r = undoLatest(bank);
          if (!r.ok) { ui.toast(ui.esc(r.errors[0].message), 'error'); return; }
          ui.toast('Хуулга ' + ui.esc(r.snap.statementNo) + ' буцаагдлаа — тулгалт дахин нээгдлээ.');
          ctx.recView = 'work'; ctx.recDone = null; app.refresh();
        });
    });
    if (view === 'import') bindWizard(el, ctx, bank);
    if (view === 'work') bindWork(el, ctx, st.open);
  }
  function bindWizard(el, ctx, bank) {
    var w = WZ, re = function () { app.refresh(); };
    var on = function (id, ev, fn) { var x = ui.$('#' + id); if (x) x.addEventListener(ev, fn); };
    on('wz-preset', 'change', function (ev) { w.preset = ev.target.value; w.det = null; });
    on('wz-fname', 'input', function (ev) { w.fileName = ev.target.value; });
    on('wz-text', 'input', function (ev) { w.text = ev.target.value; w.det = null; });
    on('wz-reset', 'click', function () { var f = sampleFile(bank); w.text = f.text; w.fileName = f.name; re(); });
    on('wz-cancel', 'click', function () { WZ = null; ctx.recView = null; re(); });
    on('wz-back', 'click', function () { w.errors = []; w.step = Math.max(1, w.step - 1); re(); });
    on('wz-next', 'click', function () { wzNext(); re(); var b = ui.$('#wz-next') || ui.$('#wz-import'); if (b) b.focus(); });
    on('wz-datefmt', 'change', function (ev) { w.dateFmt = ev.target.value; });
    on('wz-prof', 'input', function (ev) { w.profileCode = ev.target.value; });
    on('wz-prof-def', 'change', function (ev) { w.profileDefault = ev.target.checked; });
    ui.$$('select[data-map]', el).forEach(function (s) {
      s.addEventListener('change', function () {
        var i = +s.getAttribute('data-map'), t = s.value || null;
        w.map.forEach(function (m, j) { if (j !== i && t && m.target === t) { m.target = null; m.src = ''; } });
        w.map[i].target = t; w.map[i].src = t ? 'гараар' : '';
        re();
        var n = ui.$('#wz-map-' + i); if (n) n.focus();
      });
    });
    on('wz-import', 'click', function () {
      var r = importStatement(bank, w.fileName, w.text, w.parsed);
      if (!r.ok) { w.errors = r.errors; re(); return; }
      w.result = r; w.errors = [];
      if (r.rec) { ctx.recSel = null; ctx.recProp = null; }
      ui.toast(r.imported ? 'Хуулга импортлогдлоо: ' + r.imported + ' мөр, автомат тулгалт ажиллав.' : 'Шинэ мөр алга — бүгд давхар (' + r.skipped + ').');
      re();
    });
    on('wz-go', 'click', function () { WZ = null; ctx.recView = 'work'; re(); });
    on('wz-again', 'click', function () { WZ = newWizard(bank); re(); });
  }
  function bindWork(el, ctx, rec) {
    var re = function () { app.refresh(); };
    var line = rec.lines.filter(function (l) { return l.lineNo === ctx.recSel; })[0];
    var on = function (id, ev, fn) { var x = ui.$('#' + id); if (x) x.addEventListener(ev, fn); };
    ui.$$('[data-rf]', el).forEach(function (b) { b.addEventListener('click', function () { ctx.recFilter = b.getAttribute('data-rf'); re(); var t = ui.$('#rec-f-' + ctx.recFilter); if (t) t.focus(); }); });
    ui.$$('tr[data-rl]', el).forEach(function (tr) {
      var go = function () { ctx.recSel = +tr.getAttribute('data-rl'); ctx.recProp = null; re(); var n = ui.$('tr[data-rl="' + ctx.recSel + '"]'); if (n) n.focus(); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.ctrlKey) go();
        if (ev.key === 'Enter' && ev.ctrlKey) { ctx.recSel = +tr.getAttribute('data-rl'); var l = rec.lines.filter(function (x) { return x.lineNo === ctx.recSel; })[0]; var p = l && l.proposals.filter(function (x) { return !x.rejected; })[0]; if (p) acceptProp(rec, l, p); re(); }
        if (ev.key === 'Delete') { var l2 = rec.lines.filter(function (x) { return x.lineNo === +tr.getAttribute('data-rl'); })[0]; if (l2) { l2.match = null; l2.split = null; re(); } }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); var sib = ev.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling; if (sib && sib.focus) sib.focus(); }
      });
    });
    ui.$$('input[name="rec-prop"]', el).forEach(function (r) { r.addEventListener('change', function () { ctx.recProp = r.value; re(); var n = ui.$('input[name="rec-prop"][value="' + r.value + '"]'); if (n) n.focus(); }); });
    var chosenKey = function () { var r = ui.$('input[name="rec-prop"]:checked'); return r ? r.value : null; };
    on('rec-accept', 'click', function () {
      var p = line.proposals.filter(function (x) { return x.key === chosenKey(); })[0];
      if (!p) return;
      var err = acceptProp(rec, line, p);
      if (err) { ui.$('#rec-errors').innerHTML = errBox([err]); return; }
      ui.toast('Мөр ' + line.lineNo + ' тулгагдлаа: ' + ui.esc(p.title) + (lineDiff(line) ? ' — зөрүү ' + fmtM(lineDiff(line)) + ' үлдлээ.' : '.'));
      re();
    });
    on('rec-reject', 'click', function () {
      var k = chosenKey(); if (!k) return;
      line.rejected[k] = true;
      if (line.match && line.match.prop && line.match.prop.key === k) { line.match = null; line.split = null; }
      line.proposals.forEach(function (p) { if (p.key === k) p.rejected = true; });
      ui.toast('Санал татгалзагдлаа — автомат тулгалт дахин санал болгохгүй.');
      re();
    });
    on('rec-restore', 'click', function () { var k = chosenKey(); delete line.rejected[k]; line.proposals.forEach(function (p) { if (p.key === k) p.rejected = false; }); re(); });
    on('rec-unmatch', 'click', function () { line.match = null; line.split = null; re(); });
    on('rec-to-acc', 'click', function () { line.match = { kind: 'ACCOUNT', acc: ui.$('#rec-acc').value, by: 'USER' }; line.split = null; ui.toast('Мөр ' + line.lineNo + ' → ' + ui.esc(accLabel(line.match.acc)) + ' (✎ Гараар).'); re(); });
    on('rec-to-adv', 'click', function () { line.match = { kind: 'ADVANCE', partyType: line.amount > 0 ? 'CUSTOMER' : 'VENDOR', partyNo: ui.$('#rec-adv').value, by: 'USER' }; line.split = null; re(); });
    on('rec-split', 'click', function () { line.split = { acc: ui.$('#rec-split-acc').value, amount: lineDiff(line) }; re(); });
    on('rec-rule-save', 'click', function () {
      var txt = String(ui.$('#rec-rule-text').value || '').trim(), a = ui.$('#rec-rule-acc').value, t = norm(txt);
      if (!t || line.text.indexOf(t) < 0) { ui.$('#rec-errors').innerHTML = errBox([{ code: 'api.validation_failed', message: 'Дүрмийн текст (Norm = "' + t + '") энэ мөрийн текстэд агуулагдахгүй.' }]); return; }
      var no = TEXT_RULES.reduce(function (m, r) { return Math.max(m, r.lineNo); }, 0) + 10000;
      TEXT_RULES.push({ lineNo: no, text: txt.toUpperCase(), debit: line.amount > 0 ? a : null, credit: line.amount < 0 ? a : null, seed: false });
      if (line.match && line.match.by !== 'USER') line.match = null;
      var s = autoMatch(rec);
      ui.toast('Дүрэм ' + no + ' «' + ui.esc(txt.toUpperCase()) + '» → ' + a + ' хадгалагдлаа; автомат тулгалт: ' + s.matched + '/' + s.lines + ' мөр.');
      re();
    });
    on('rec-auto', 'click', function () { var s = autoMatch(rec); ui.toast('Автомат тулгалт: тулгагдсан ' + s.matched + ' / ' + s.lines + ' (гараар батлагдсан мөр хөндөгдөхгүй).'); re(); });
    var endEl = ui.$('#rec-ending');
    endEl.addEventListener('change', function () { var c = E().money.toCents(endEl.value); if (c === null) { endEl.classList.add('invalid'); return; } rec.ending = c; re(); });
    on('rec-preview', 'click', function () { recPreview(rec); });
    on('rec-post', 'click', function () { doRecPost(rec, ctx); });
    on('rec-discard', 'click', function () {
      ui.confirm({ title: 'Хуулга хаях уу?', danger: true, ok: 'Хаях', body: '<p>Тулгалтын мөр, санал устаж, хуулгын мөр <code>IGNORED</code> болно; давхардлын түлхүүр чөлөөлөгдөж дахин импортлох боломжтой (BR-BNK-80). Ledger өөрчлөгдөхгүй.</p>' })
        .then(function (ok) {
          if (!ok) return;
          var r = discardRec(rec.bank);
          if (r && !r.ok) { ui.toast(ui.esc(r.errors[0].message), 'error'); return; }
          ctx.recView = null; ctx.recSel = null; re();
        });
    });
  }
  function acceptProp(rec, line, p) {                              // BR-BNK-60/61/64
    if (p.kind === 'BLE') {
      var clash = rec.lines.filter(function (l) { return l !== line && lineBleEntries(l) && lineBleEntries(l).some(function (n) { return p.entries.indexOf(n) >= 0; }); })[0];
      if (clash) return { code: 'bank.match_spec_invalid', message: 'Банкны бичилт #' + p.entries.join(', ') + ' мөр ' + clash.lineNo + '-т тулгагдсан — нэг бичилт нэг л бүлэгт (BR-BNK-64). Тэр мөрийн тулгалтыг эхлээд арилгана уу.' };
    }
    if (p.targets) {
      for (var i = 0; i < p.targets.length; i++) {
        var t = p.targets[i], used = 0;
        rec.lines.forEach(function (l) { if (l !== line && l.match && l.match.prop && l.match.prop.targets) l.match.prop.targets.forEach(function (x) { if (x.entryNo === t.entryNo && l.match.prop.kind === p.kind) used += x.applied; }); });
        var e = (p.kind === 'CUSTOMER' ? S().cle : S().vle).filter(function (x) { return x.entryNo === t.entryNo; })[0];
        if (e && Math.abs(e.remaining - used) < Math.abs(t.applied)) return { code: 'bank.match_amount_mismatch', message: t.docNo + '-ийн боломжит үлдэгдэл ' + fmtM(e.remaining - used) + ' — бусад мөрт аль хэдийн тулгасан (BR-BNK-53).' };
      }
    }
    line.match = { prop: p, by: 'USER' };
    line.split = null;
    return null;
  }
  function recPreview(rec) {
    var vs = recVouchers(rec), errs = [], body = '';
    vs.forEach(function (v) {
      var r = E().journal.post(v.o, { preview: true });
      if (!r.ok) { errs = errs.concat(r.errors.map(function (e) { return { code: e.code, message: 'Мөр ' + v.line.lineNo + ': ' + e.message }; })); return; }
      var gl = r.result.vouchers[0].gl;
      body += '<h3 class="small">Мөр ' + v.line.lineNo + ' · ' + ui.date(v.o.date) + ' · ' + v.o.series + '-2026-***** · PAYMTRECON</h3><div class="table-wrap"><table class="grid-table"><thead><tr><th>Данс</th><th>Тайлбар</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
        gl.map(function (e) { return '<tr><td class="code">' + ui.esc(accLabel(e.account)) + '</td><td>' + ui.esc(e.description) + '</td>' + ui.moneyCell(Math.max(e.amount, 0), { blankZero: true }) + ui.moneyCell(Math.max(-e.amount, 0), { blankZero: true }) + '</tr>'; }).join('') + '</tbody></table></div>';
    });
    var closing = sum(rec.lines, function (l) { var es = lineBleEntries(l); return es ? es.length : 0; });
    ui.modal({ title: 'Батлахын өмнө харах — хуулга ' + rec.statementNo, wide: true,
      body: '<div class="stack">' + errBox(recErrors(rec), 'Батлахад саад болох') + errBox(errs, 'Ваучерын алдаа') +
        '<p class="small">BLE-тэй тулгаагүй мөр бүр нэг ваучер (огноо = гүйлгээний огноо, BR/BP цуврал, НӨАТ-гүй, BR-BNK-68). Дугаар <code>***</code> — батлахад олгоно. Хаагдах банкны бичилт: ' + closing + ' + шинэ ' + vs.length + '. Дансны сүүлийн хуулгын үлдэгдэл → ' + fmtM(rec.ending) + '.</p>' +
        (body || '<p class="muted">Шинэ ваучер үүсэхгүй — бүх мөр бүртгэгдсэн банкны бичилттэй тулгагдсан.</p>') + '</div>' });
  }
  function doRecPost(rec, ctx) {
    var box = ui.$('#rec-errors'), errs = recErrors(rec);
    if (errs.length) { if (box) box.innerHTML = errBox(errs); ui.toast('Батлах боломжгүй: ' + errs.length + ' алдаа', 'error'); return; }
    var vs = recVouchers(rec), pe = [];
    vs.forEach(function (v) { var r = E().journal.post(v.o, { preview: true }); if (!r.ok) pe = pe.concat(r.errors.map(function (e) { return { code: e.code, message: 'Мөр ' + v.line.lineNo + ': ' + e.message }; })); });
    if (pe.length) { if (box) box.innerHTML = errBox(pe); ui.toast('Батлах боломжгүй', 'error'); return; }
    ui.confirm({ title: 'Хуулга ' + rec.statementNo + '-ийг батлах ба тулгах уу?', ok: 'Батлах ба тулгах',
      body: '<p>' + vs.length + ' шинэ ваучер (төлбөр, шимтгэл) батлагдаж, ' + sum(rec.lines, function (l) { var es = lineBleEntries(l); return es ? es.length : 0; }) + ' бүртгэгдсэн банкны бичилт тулгагдсан болно. Дансны сүүлийн хуулгын үлдэгдэл <strong>' + fmtM(rec.ending, { sym: true }) + '</strong> болно.</p><p class="small">Бүгд нэг DB transaction-д (прототипт ваучер тус бүр engine-ээр, урьдчилан бүгдийг шалгасан).</p>' })
      .then(function (ok) {
        if (!ok) return;
        var r = postRec(rec);
        if (!r.ok) { var b = ui.$('#rec-errors'); if (b) b.innerHTML = errBox(r.errors); ui.toast('Батлахад алдаа гарлаа', 'error'); app.refresh(); return; }
        ui.toast('Хуулга ' + ui.esc(r.snap.statementNo) + ' тулгагдлаа. Үлдэгдэл ' + ui.esc(fmtM(r.snap.ending, { sym: true })) + '.');
        ctx.recView = 'done'; ctx.recDone = r.snap; ctx.recSel = null; ctx.recProp = null;
        app.refresh();
      });
  }

  // ===========================================================================
  // 8. registration
  // ===========================================================================
  function onKey(ev) {
    if (ev.key !== 'F9' || document.querySelector('.overlay')) return;
    if (app.current === 'cash' && cf && app.ctx.cashMode === 'new') { ev.preventDefault(); doCashPost(app.ctx); }
    else if (app.current === 'bank-rec' && app.ctx.recBank && recStore(app.ctx.recBank).open && (app.ctx.recView === 'work' || !app.ctx.recView)) { ev.preventDefault(); doRecPost(recStore(app.ctx.recBank).open, app.ctx); }
  }
  function ensureKeys() { if (!keyHandler) { keyHandler = onKey; document.addEventListener('keydown', keyHandler); } }
  function dropKeys() { if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; } }

  app.registerScreen({
    route: 'cash', title: 'Кассын баримт (МХ-1 / МХ-2)', crumbs: [['Мөнгө'], ['Кассын баримт']], owner: 'js/screens/cash-bank.js',
    intro: ['Кассын орлогын (МХ-1, <code>KO-2026-#####</code>) ба зарлагын (МХ-2, <code>KZ-2026-#####</code>) баримт, кассын дэвтэр ба үлдэгдэл. Кассчин, нягтлан хэрэглэнэ; бэлэн борлуулалтын МХ-1 нэхэмжлэх батлахад автоматаар үүснэ.',
      'Баримт ноороггүй: <strong>Батлах (F9)</strong> нэг гүйлгээнд завсаргүй дугаар, 1100 Касс ↔ эсрэг тал (1200 авлага, 2100 өглөг, зардал/орлогын данс, банк)-ын бичилт, кассын бичилт, авлага/өглөгийн тулгалт ба дүнг үсгээр бичсэн МХ-ийг үүсгэнэ. Касс аль ч өдөр сөрөг болох зарлагыг хориглоно (D-G1) — 800 000 ₮-ийн МХ-2 оруулж туршаарай.'],
    render: function (el, ctx) { ensureKeys(); renderCash(el, ctx); },
    onLeave: dropKeys
  });
  app.registerScreen({
    route: 'bank-rec', title: 'Банкны хуулга ба тулгалт', crumbs: [['Мөнгө'], ['Хуулга ба тулгалт']], owner: 'js/screens/cash-bank.js',
    intro: ['Банкны хуулгыг (Хаан, Голомт банкны CSV/XLSX) импортолж, мөр бүрийг бүртгэгдсэн банкны бичилт, нээлттэй нэхэмжлэх эсвэл текстийн дүрэмтэй автоматаар тулгана. Нягтлан хэрэглэнэ.',
      'Санал бүр оноо ба шалтгаантай (BC Match Bank Payments): өндөр итгэлтэйг систем тулгана, дундыг (жишээ нь хэсэгчилсэн төлбөр) хэрэглэгч батална, тайлбаргүй мөрийг данс руу бичнэ. <strong>Батлах ба тулгах (F9)</strong> нь тулгаагүй мөрөөс BR/BP ваучер үүсгэж, банкны бичилтүүдийг хааж, хуулгын эцсийн үлдэгдлийг дансанд хадгална.'],
    render: function (el, ctx) { ensureKeys(); renderRec(el, ctx); },
    onLeave: dropKeys
  });

  // exposed for tests / other builders (read-only helpers)
  ERP.cashBank = { moneyWords: function (c) { return moneyWords(c).text; }, norm: norm, normName: normName, nearness: nearness, bestRule: bestRule, ruleScore: ruleScore,
    detectFile: detectFile, parseStatement: parseStatement, suggestMapping: suggestMapping, sampleFile: sampleFile, importStatement: importStatement, autoMatch: autoMatch,
    recStore: recStore, recErrors: recErrors, recVouchers: recVouchers, postRec: postRec, undoLatest: undoLatest, recReport: recReport, cashCheck: cashCheck, lineDiff: lineDiff, lineConf: lineConf };
})();
