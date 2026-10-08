/* =============================================================================
   js/screens/reports-tax.js — reports & tax builder:
     #financial-statements  Маягт А: СБТ, ОДТ, ӨӨТ, МГТ (S-RPT-09..12) + e-balance шивэх хуудас (S-RPT-13)
     #vat-return            НӨАТ-ын тайлан ТТ-03а (S-TAX-03): мөр, drill-down, хаалт, илгээх, босгын хяналт
     #setup                 Компани тохируулах wizard (S-PLT-06) → platform.fn_provision_company_mn
   Every figure comes from ERP.engine (posted ledgers). Helpers that the shared engine does not expose are
   implemented here (ӨӨТ rows, e-balance round-then-sum, VAT turnover threshold, VAT return submit marker).
   Notes: js/notes/reports-tax.js · styles: css/reports-tax.css (tokens only).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;
  function E() { return ERP.engine; }
  function R() { return ERP.engine.reports; }
  function today() { return ERP.data.meta.today; }
  function fmtM(c, o) { return E().money.fmt(c, o); }
  function nz(v) { return v ? v : 0; }                 // null / undefined / -0 → 0
  function fmtK(k, blank) { if (!k && blank) return ''; return E().money.fmt(k * 100).replace(/\.00$/, ''); }
  function nowHm() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function on(id, ev, fn) { var n = document.getElementById(id); if (n) n.addEventListener(ev, fn); return n; }
  function refocus(id) { var n = document.getElementById(id); if (n) n.focus(); }
  function sum(a, f) { return a.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }

  // ===========================================================================
  // Seed copies that js/data.js does not carry (db/seed/*.sql, 1:1)
  // ===========================================================================
  // ӨӨТ (OOT) rows from mn_50_reports.sql: [row_no, code, name, type, totaling, amount type, show, opposite sign, indent]
  var OOT_ROWS = [
    [100, null, 'Өмч (2.2.1)', 'H', null, 'N', 'Y', true, 0],
    [110, 'CAP.1', 'Эхний үлдэгдэл', 'P', '3100..3149', 'G', 'Y', true, 1],
    [120, 'CAP.6', 'Өмчид гарсан өөрчлөлт', 'P', '3100..3149', 'N', 'Y', true, 1],
    [130, 'CAP.9', 'Эцсийн үлдэгдэл', 'P', '3100..3149', 'B', 'Y', true, 1],
    [200, null, 'Халаасны хувьцаа (2.2.2)', 'H', null, 'N', 'Z', true, 0],
    [210, 'TRS.1', 'Эхний үлдэгдэл', 'P', '3150..3199', 'G', 'Z', true, 1],
    [220, 'TRS.6', 'Өмчид гарсан өөрчлөлт', 'P', '3150..3199', 'N', 'Z', true, 1],
    [230, 'TRS.9', 'Эцсийн үлдэгдэл', 'P', '3150..3199', 'B', 'Z', true, 1],
    [300, null, 'Нэмж төлөгдсөн капитал (2.2.3)', 'H', null, 'N', 'Y', true, 0],
    [310, 'APIC.1', 'Эхний үлдэгдэл', 'P', '3200..3299', 'G', 'Y', true, 1],
    [320, 'APIC.6', 'Өмчид гарсан өөрчлөлт', 'P', '3200..3299', 'N', 'Y', true, 1],
    [330, 'APIC.9', 'Эцсийн үлдэгдэл', 'P', '3200..3299', 'B', 'Y', true, 1],
    [400, null, 'Хөрөнгийн дахин үнэлгээний нэмэгдэл (2.2.4)', 'H', null, 'N', 'Y', true, 0],
    [410, 'REV.1', 'Эхний үлдэгдэл', 'P', '3300..3349', 'G', 'Y', true, 1],
    [420, 'REV.5', 'Бусад дэлгэрэнгүй орлого (дахин үнэлгээ)', 'P', '3300..3349', 'N', 'Y', true, 1],
    [430, 'REV.9', 'Эцсийн үлдэгдэл', 'P', '3300..3349', 'B', 'Y', true, 1],
    [500, null, 'Гадаад валютын хөрвүүлэлтийн нөөц (2.2.5)', 'H', null, 'N', 'Z', true, 0],
    [510, 'FXR.1', 'Эхний үлдэгдэл', 'P', '3350..3359', 'G', 'Z', true, 1],
    [520, 'FXR.5', 'Бусад дэлгэрэнгүй орлого (хөрвүүлэлт)', 'P', '3350..3359', 'N', 'Z', true, 1],
    [530, 'FXR.9', 'Эцсийн үлдэгдэл', 'P', '3350..3359', 'B', 'Z', true, 1],
    [600, null, 'Эздийн өмчийн бусад хэсэг (2.2.6)', 'H', null, 'N', 'Y', true, 0],
    [610, 'OTH.1', 'Эхний үлдэгдэл', 'P', '3360..3399', 'G', 'Y', true, 1],
    [620, 'OTH.6', 'Өмчид гарсан өөрчлөлт', 'P', '3360..3399', 'N', 'Y', true, 1],
    [630, 'OTH.9', 'Эцсийн үлдэгдэл', 'P', '3360..3399', 'B', 'Y', true, 1],
    [700, null, 'Хуримтлагдсан ашиг (2.2.7)', 'H', null, 'N', 'Y', true, 0],
    [710, 'RE.1', 'Эхний үлдэгдэл', 'P', '3400..3998|5000..9998', 'G', 'Y', true, 1],
    [720, 'RE.2', 'НББ бодлогын өөрчлөлт, алдааны залруулга', 'P', '3400..3409|3500..3998', 'N', 'Y', true, 1],
    [730, 'RE.4', 'Тайлант үеийн цэвэр ашиг (алдагдал)', 'P', '5000..9998', 'N', 'Y', true, 1],
    [740, 'RE.7', 'Зарласан ногдол ашиг', 'P', '3410..3499', 'N', 'Y', true, 1],
    [750, 'RE.9', 'Эцсийн үлдэгдэл', 'P', '3400..3998|5000..9998', 'B', 'Y', true, 1],
    [800, null, 'НИЙТ ЭЗДИЙН ӨМЧ', 'H', null, 'N', 'Y', true, 0],
    [810, 'T.1', 'Эхний үлдэгдэл', 'F', 'CAP.1+TRS.1+APIC.1+REV.1+FXR.1+OTH.1+RE.1', 'N', 'Y', true, 1],
    [820, 'T.2', 'НББ бодлогын өөрчлөлт, алдааны залруулга', 'F', 'RE.2', 'N', 'Y', true, 1],
    [830, 'T.4', 'Тайлант үеийн цэвэр ашиг (алдагдал)', 'F', 'RE.4', 'N', 'Y', true, 1],
    [840, 'T.5', 'Бусад дэлгэрэнгүй орлого', 'F', 'REV.5+FXR.5', 'N', 'Y', true, 1],
    [850, 'T.6', 'Өмчид гарсан өөрчлөлт', 'F', 'CAP.6+TRS.6+APIC.6+OTH.6', 'N', 'Y', true, 1],
    [860, 'T.7', 'Зарласан ногдол ашиг', 'F', 'RE.7', 'N', 'Y', true, 1],
    [870, 'T.9', 'Эцсийн үлдэгдэл (= СБТ 2.2)', 'F', 'CAP.9+TRS.9+APIC.9+REV.9+FXR.9+OTH.9+RE.9', 'N', 'Y', true, 1],
    [880, 'T.CHK', 'Шалгалт: эхний + хөдөлгөөн - эцсийн = 0', 'F', 'T.1+T.2+T.4+T.5+T.6+T.7-T.9', 'N', 'Z', false, 1]
  ];
  // e-balance anchors (10 §5.15 EbalanceAnchors, BR-EBL-04) and check rows that never go to the keying sheet (BR-EBL-06)
  var ANCHORS = { SBT: ['1.3', '2.3'], ODT: ['22', '24'], OOT: ['CAP.9', 'TRS.9', 'APIC.9', 'REV.9', 'FXR.9', 'OTH.9', 'RE.9'], MGT: ['5', '7'] };
  var CHECK_ROWS = ['CHK', 'LEDGER', 'T.CHK', 'X'];
  var EB_CODE = { SBT: 'BS', ODT: 'IS', OOT: 'EQ', MGT: 'CF' };
  var UNVERIFIED_LINES = { BS: 45, IS: 27, EQ: 9, CF: 48 };          // rpt.statement_line verified = false (mn_00_catalogs.sql)

  // tax.tax_parameter subset (db/seed/legal_parameters.sql) — amounts in cents
  var TAX_PARAMS = [
    { code: 'vat.registration_threshold_mandatory', value: 5000000000, from: '2016-01-01', to: '2027-06-30', status: 'verified', conf: 'high' },
    { code: 'vat.registration_threshold_mandatory', value: 40000000000, from: '2027-07-01', to: null, status: 'verified', conf: 'medium' },
    { code: 'vat.registration_threshold_voluntary', value: 1000000000, from: '2016-01-01', to: null, status: 'verified', conf: 'high' },
    { code: 'ebalance.annual_deadline', text: '02-10', from: '2016-01-01', to: null, status: 'verified', conf: 'high' }
  ];
  function param(code, d) {
    return TAX_PARAMS.filter(function (p) { return p.code === code && p.from <= d && (!p.to || p.to >= d); })[0] || null;
  }

  // platform.fn_mn_number_series_def() (mn_40_setup.sql): [code, description, kind(L legal / D draft / M master), prefix, width]
  var SERIES_DEF = [
    ['SI', 'Борлуулалтын нэхэмжлэх (батлагдсан, ТМ-1)', 'L', 'SI', 5], ['SC', 'Борлуулалтын кредит нот (батлагдсан)', 'L', 'SC', 5],
    ['PI', 'Худалдан авалтын нэхэмжлэх (батлагдсан)', 'L', 'PI', 5], ['PC', 'Худалдан авалтын кредит нот (батлагдсан)', 'L', 'PC', 5],
    ['KO', 'Кассын орлогын баримт (МХ-1)', 'L', 'KO', 5], ['KZ', 'Кассын зарлагын баримт (МХ-2)', 'L', 'KZ', 5],
    ['BR', 'Банкны орлогын ваучер', 'L', 'BR', 5], ['BP', 'Банкны зарлагын ваучер', 'L', 'BP', 5],
    ['GJ', 'Ерөнхий журналын ваучер', 'L', 'GJ', 5], ['OB', 'Эхний үлдэгдлийн ваучер', 'L', 'OB', 5],
    ['CL', 'Жилийн хаалтын ваучер', 'L', 'CL', 5], ['FXA', 'Ханшийн тэгшитгэлийн ваучер', 'L', 'FXA', 5],
    ['DP', 'Элэгдлийн ваучер', 'L', 'DP', 5], ['IA', 'Бараа материалын тохируулгын баримт', 'L', 'IA', 5],
    ['IC', 'Тооллогын баримт', 'L', 'IC', 5],
    ['SI_DRAFT', 'Борлуулалтын нэхэмжлэхийн ноорог', 'D', 'DSI-', 6], ['SC_DRAFT', 'Борлуулалтын кредит нотын ноорог', 'D', 'DSC-', 6],
    ['PI_DRAFT', 'Худалдан авалтын нэхэмжлэхийн ноорог', 'D', 'DPI-', 6], ['PC_DRAFT', 'Худалдан авалтын кредит нотын ноорог', 'D', 'DPC-', 6],
    ['JNL_DRAFT', 'Журналын мөрийн ноорог дугаар', 'D', 'J-', 6], ['IA_DRAFT', 'Тохируулгын баримтын ноорог', 'D', 'DIA-', 6],
    ['IC_DRAFT', 'Тооллогын баримтын ноорог', 'D', 'DIC-', 6],
    ['CUST', 'Харилцагчийн дугаар', 'M', 'C', 5], ['VEND', 'Нийлүүлэгчийн дугаар', 'M', 'V', 5],
    ['ITEM', 'Бараа, үйлчилгээний дугаар', 'M', 'I', 5], ['FA', 'Үндсэн хөрөнгийн дугаар', 'M', 'FA', 5]
  ];
  // platform.fn_provision_company_mn steps (mn_90_provision.sql) with what each step inserts (db/seed/README.md §2–§9)
  var PROVISION_STEPS = [
    ['company_setup', 'Компанийн тохиргоо', '1', 'LCY MNT, нарийвчлал 0.01 (D-C2), алхам 1–3-ын утга'],
    ['vat_groups', 'НӨАТ-ын бүлэг', '10', '4 Bus. (DOMESTIC, EXPORT, IMPORT, NONREG) + 6 Prod. (VAT10, VAT0, EXEMPT, NOVAT, CUSTOMS_VAT, IMPORT_SERVICE)'],
    ['gen_posting_groups', 'Gen. posting бүлэг', '7', '3 Bus. (DOMESTIC, EXPORT, RELATED) + 4 Prod. (GOODS, SERVICES, FA, MISC)'],
    ['chart_of_accounts', 'Дансны төлөвлөгөө', '182', '138 бичилтийн, 20 гарчиг, 12 эхлэл, 12 төгсгөл данс; Маягт А ба МГТ-ийн харгалзаатай'],
    ['vat_setup', 'VAT Posting Setup', '19', 'Bus. × Prod. матриц, хувь tax_parameter-ээс (vat.standard_rate = 0.10)'],
    ['posting_setup', 'Posting setup', '16 + 7', '16 General Posting Setup (* нөөц мөртэй), харилцагчийн 3 ба нийлүүлэгчийн 4 бүлэг'],
    ['bank_posting_groups', 'Банкны posting бүлэг', '7', 'CASH_MNT 1100 … CARD 1121'],
    ['currencies', 'Валют', '4', 'USD, EUR, CNY, RUB (R2)'],
    ['fixed_assets', 'Үндсэн хөрөнгө', '7 + 8 + 2', '7 ангилал, 8 posting бүлэг, NBB ба TAX дэвтэр'],
    ['inventory', 'Бараа', '4 + 20', '4 барааны бүлэг (MAIN агуулах R2), 20 хэмжих нэгж (eBarimt measureUnit)'],
    ['number_series', 'Дугаарын цуврал', '26', '15 хуулийн цуврал (эхний ба дараагийн жилийн мөр), 7 ноорог, 4 мастер'],
    ['reason_codes', 'Шалтгааны код', '11', 'RETURN, PRICE_ADJ, CANCEL, CORRECTION, REVERSAL, REOPEN, WRITE_OFF, CASH_DIFF, INV_COUNT, EBARIMT_FIX, OPENING'],
    ['fiscal_years', 'Санхүүгийн жил', '2 × 12', 'Эхний ба дараагийн жил, 12 нээлттэй сар тус бүр (FR-PLT-003 AC1)'],
    ['cash_account', 'Касс', '1', 'CASH01 "Үндсэн касс" (1100, сөрөг үлдэгдэл хориотой, МХ-1 KO / МХ-2 KZ)'],
    ['journals', 'Журнал', '6', 'GENERAL, CASH_RECEIPT, PAYMENT, OPENING, CLOSING, FA template'],
    ['gl_setup', 'Ерөнхий дэвтрийн тохиргоо', '1', '3400 хуримтлагдсан ашиг, 3500 тайлант үеийн ашиг, 8290 бөөрөнхийлөлт'],
    ['payment_methods_templates', 'Төлбөрийн хэлбэр, загвар', '4 + 5 + 9', '4 төлбөрийн хэлбэр, 5 нөхцөл, 4 харилцагчийн + 5 нийлүүлэгчийн загвар'],
    ['module_setups', 'Модулийн тохиргоо', '—', 'Walk-in харилцагч C00000, eBarimt POS 001, ebarimt_setup (enabled = false, STAGING)'],
    ['tax_setup', 'Татварын тохиргоо', '1', 'НӨАТ-ын тооцоо 2310, татварын профайл (vat_registered-ээс)'],
    ['financial_reports', 'Санхүүгийн тайлан', '5', 'SBT 53, ODT 26, OOT 39, MGT 54, TB 9 мөр'],
    ['vat_statement', 'ТТ-03а загвар', '17', 'VAT / TT03A мөр (D-E8)'],
    ['aging', 'Насжилтын бүлэг', '5', 'Хугацаа болоогүй, 0–30, 31–60, 61–90, 90+ (D-F7)'],
    ['roles', 'Built-in role', '5', 'OWNER, ACCOUNTANT, EXTERNAL_ACCOUNTANT, SALES_CLERK, VIEWER']
  ];
  var ROLES = [
    ['ACCOUNTANT', 'Нягтлан бодогч', '24 permission set (BASIC, READ ALL, SALES POST, VAT, PERIOD CLOSE …); security, PII, хаасан үе нээх эрхгүй'],
    ['EXTERNAL_ACCOUNTANT', 'Гэрээт нягтлан', 'Нягтлантай ижил; хугацаа expires_at-аар хязгаарлагдана'],
    ['SALES_CLERK', 'Борлуулагч, кассчин', 'BASIC, CUSTOMER EDIT, SALES POST, CASH RECEIPT (МХ-1), DOC SIGN'],
    ['VIEWER', 'Үзэгч', 'BASIC, READ ALL, FINANCIAL REPORTS']
  ];

  // ===========================================================================
  // 1. Statement model (engine rows → { code, columns, rows[{…, raw:{colId}}] })
  // ===========================================================================
  function mkRow(a) {
    return { rowNo: a[0], code: a[1], name: a[2], type: a[3], totaling: a[4], amountType: a[5], show: a[6], opp: a[7], indent: a[8], raw: {} };
  }
  function evalF(totaling, vals) {                      // "1.1+1.2" / "T.1+…-T.9" (10 §6.6.2 subset)
    var v = 0, sign = 1;
    String(totaling).split(/([+-])/).forEach(function (t) { if (t === '+') sign = 1; else if (t === '-') sign = -1; else if (t) v += sign * nz(vals[t]); });
    return v;
  }
  function ootValue(filter, at, col) {                  // G / N / B for ӨӨТ (BR-RPT-65)
    var g = R().glBalance;
    if (at === 'G') return g(filter, E().dates.addDays(col.from, -1)) + g(filter, col.to, col.from, { onlyOpening: true });
    if (at === 'N') return g(filter, col.to, col.from, { excludeOpening: true, excludeClosing: true });   // closing voucher is not a movement (D-D4)
    return g(filter, col.to);
  }
  function cellValue(model, row, col, filter) {         // value of one account filter in one column (drill-down)
    var g = R().glBalance, at = row.amountType;
    if (model.code === 'OOT') return ootValue(filter, at, col);
    if (col.mode === 'opening') return g(filter, null, null, { onlyOpening: true });
    if (at === 'B') return g(filter, col.to);
    if (at === 'G') return g(filter, E().dates.addDays(col.from, -1)) + g(filter, col.to, col.from, { onlyOpening: true });
    return g(filter, col.to, col.from, { excludeClosing: true });
  }
  function buildOot(asOf) {
    var ys = asOf.slice(0, 4) + '-01-01';
    var col = { id: 'cur', label: 'Тайлант үе (' + ui.date(ys) + '–' + ui.date(asOf) + ')', from: ys, to: asOf, mode: 'period' };
    var vals = {};
    var rows = OOT_ROWS.map(mkRow);
    rows.forEach(function (r) {
      var v = null;
      if (r.type === 'P') v = ootValue(r.totaling, r.amountType, col);
      else if (r.type === 'F') v = evalF(r.totaling, vals);
      if (r.code) vals[r.code] = nz(v);
      r.raw.cur = r.type === 'H' ? null : nz(v);
    });
    return { code: 'OOT', asOf: asOf, columns: [col], rows: rows };
  }
  function buildModel(code, asOf) {
    var y = +asOf.slice(0, 4), ys = y + '-01-01';
    if (code === 'OOT') return buildOot(asOf);
    var conv = function (r) { return { rowNo: r.rowNo, code: r.code, name: r.name, type: r.type, totaling: r.totaling, amountType: r.amountType, show: r.show, opp: r.opp, indent: r.indent, raw: {} }; };
    if (code === 'MGT') {
      var cur = R().financialStatement('MGT', { asOf: asOf, from: ys });
      var prev = R().financialStatement('MGT', { asOf: (y - 1) + '-12-31', from: (y - 1) + '-01-01' });
      var cols = [{ id: 'prev', label: 'Өмнөх жил (' + (y - 1) + ')', from: (y - 1) + '-01-01', to: (y - 1) + '-12-31', mode: 'range' },
        { id: 'cur', label: 'Тайлант үе (' + ui.date(ys) + '–' + ui.date(asOf) + ')', from: ys, to: asOf, mode: 'range' }];
      var rows = cur.rows.map(function (r, i) {
        var x = conv(r);
        x.raw.prev = r.type === 'H' ? null : nz(prev.rows[i].v_cur);
        x.raw.cur = r.type === 'H' ? null : nz(r.v_cur);
        return x;
      });
      return { code: code, asOf: asOf, columns: cols, rows: rows };
    }
    var fs = R().financialStatement(code, { asOf: asOf });
    var columns = fs.columns.map(function (c) {
      var lbl = c.id === 'prev' ? 'Өмнөх жил (' + (y - 1) + ')' : c.label;
      return { id: c.id, label: lbl, mode: c.mode, from: c.from, to: c.to };
    });
    return { code: code, asOf: asOf, columns: columns, rows: fs.rows.map(function (r) {
      var x = conv(r);
      columns.forEach(function (c) { x.raw[c.id] = r.type === 'H' ? null : nz(r['v_' + c.id]); });
      return x;
    }) };
  }
  function rowByCode(m, code) { return m.rows.filter(function (r) { return r.code === code; })[0] || null; }
  function rawOf(m, code, colId) { var r = rowByCode(m, code); return r ? nz(r.raw[colId]) : 0; }
  function disp(r, v) { return r.opp ? -v : v; }
  function isCheck(r) { return CHECK_ROWS.indexOf(r.code) >= 0 || r.show === 'N'; }

  // rk(x) = Round(x / 1000, 0, AwayFromZero) on raw cents → whole thousands of MNT (BR-EBL-02)
  function rk(c) { var a = Math.abs(c); var k = Math.floor((a + 50000) / 100000); return c < 0 ? -k : k; }
  // round-then-sum with ROUNDING_DIFFERENCE before anchors (BR-EBL-03/04, 10 §6.8)
  function roundModel(m) {
    var anchors = ANCHORS[m.code] || [], out = {};
    m.columns.forEach(function (col) {
      var t = {}, rnd = {}, steps = [];
      m.rows.forEach(function (r) {
        if (r.type === 'H' || !r.code || (isCheck(r) && r.code !== 'X')) return;
        var raw = nz(r.raw[col.id]), v;
        v = r.type === 'F' ? evalF(r.totaling, t) : rk(raw);
        if (anchors.indexOf(r.code) >= 0) {
          var target = rk(raw);
          var computed = v;
          if (r.type !== 'F') {                         // ӨӨТ .9: эхний + хөдөлгөөн (RollForward)
            var pre = r.code.split('.')[0] + '.';
            computed = sum(m.rows.filter(function (x) { return x.code && x.code !== r.code && x.code.indexOf(pre) === 0 && (x.amountType === 'G' || x.amountType === 'N'); }), function (x) { return nz(t[x.code]); });
          }
          var diff = target - computed;
          if (diff) rnd[r.code] = diff;
          steps.push({ code: r.code, name: r.name, raw: raw, target: target, computed: computed, diff: diff, opp: r.opp });
          v = target;
        }
        t[r.code] = v;
      });
      out[col.id] = { t: t, rnd: rnd, steps: steps };
    });
    return out;
  }
  function visibleRows(m) {
    var anyNz = function (r) { return m.columns.some(function (c) { return nz(r.raw[c.id]) !== 0; }); };
    var vis = m.rows.map(function (r) {
      if (r.show === 'N' || r.code === 'CHK' || r.code === 'LEDGER' || r.code === 'T.CHK') return false;
      if (r.type === 'H') return true;
      return r.show === 'Y' || anyNz(r);
    });
    // a 'Z' heading (ӨӨТ TRS, FXR) shows only when one of its rows shows
    m.rows.forEach(function (r, i) {
      if (r.type !== 'H' || r.show !== 'Z') return;
      var any = false;
      for (var j = i + 1; j < m.rows.length && m.rows[j].type !== 'H'; j++) if (vis[j]) any = true;
      vis[i] = any;
    });
    return m.rows.filter(function (r, i) { return vis[i]; });
  }

  // cross-statement checks (BR-RPT-61/65/66/67, BR-EBL-05/08); rounded → on thousands
  function crossChecks(models, rounded) {
    var S = models.SBT, O = models.ODT, Q = models.OOT, C = models.MGT;
    var v = function (m, code, col) {
      if (rounded) return nz(rounded[m.code][col].t[code]);
      return rawOf(m, code, col);
    };
    var fmt = function (x) { return rounded ? fmtK(x) : fmtM(x); };
    var list = [];
    var push = function (code, label, a, b, rule, level) {
      list.push({ code: code, label: label, a: a, b: b, ok: a === b, diff: a - b, rule: rule, level: level || 'BLOCKING', fa: fmt(a), fb: fmt(b) });
    };
    push('BS_BALANCED', 'СБТ: 1.3 Нийт хөрөнгө = 2.3 Нийт өр төлбөр ба эздийн өмч', v(S, '1.3', 'end'), -v(S, '2.3', 'end'), 'BR-RPT-61');
    push('EQ_EQUALS_BS', 'ӨӨТ T.9 эцсийн өмч = СБТ 2.2 эздийн өмч', -v(Q, 'T.9', 'cur'), -v(S, '2.2', 'end'), 'BR-RPT-65');
    push('IS_EQUALS_EQ_RE4', 'ОДТ 22 цэвэр ашиг = ӨӨТ RE.4', -v(O, '22', 'cur'), -v(Q, 'RE.4', 'cur'), 'BR-RPT-67');
    push('CF_EQUALS_BS_CASH', 'МГТ 7 эцсийн мөнгө = СБТ 1.1.1', v(C, '7', 'cur'), v(S, '1.1.1', 'end'), 'BR-RPT-66');
    push('CF_UNCLASSIFIED_ZERO', 'МГТ X ангилаагүй мөнгөн гүйлгээ = 0', v(C, 'X', 'cur'), 0, 'BR-RPT-66');
    if (!rounded) {
      push('EQ_ROLLFORWARD', 'ӨӨТ T.CHK: эхний + хөдөлгөөн − эцсийн = 0', rawOf(Q, 'T.CHK', 'cur'), 0, 'BR-RPT-65');
      push('CF_LEDGER', 'МГТ CHK: 7 − дэвтрийн мөнгө = 0', rawOf(C, 'CHK', 'cur'), 0, 'BR-RPT-66');
    }
    var um = unmappedAccounts(models.SBT.asOf);
    list.push({ code: 'UNMAPPED_ACCOUNTS', label: 'Бичилттэй данс бүр СБТ-ийн яг нэг навч мөрөнд, орлого/зардлын данс ОДТ 1…21-ийн яг нэгд', ok: !um.length, level: 'BLOCKING', rule: 'BR-RPT-63', fa: um.length ? um.join(', ') : 'алга', fb: '', a: um.length, b: 0, diff: um.length });
    list.push({ code: 'YEAR_CLOSED', label: 'Санхүүгийн жил хаагдсан эсэх (' + S.asOf.slice(0, 4) + ')', ok: false, level: 'WARNING', rule: 'BR-EBL-08', fa: 'хаагдаагүй (rpt.year_not_closed)', fb: '', a: 0, b: 0, diff: 0 });
    return list;
  }
  function unmappedAccounts(asOf) {                     // BR-RPT-63 on the seed filters
    var S = E().state(), af = R().accountFilter, used = {};
    S.glEntries.forEach(function (e) { if (e.postingDate <= asOf) used[e.account] = true; });
    var sbtLeaves = ERP.data.statementRows.filter(function (r) { return r[0] === 'SBT' && r[4] === 'P'; }).map(function (r) { return af(r[5]); });
    var odtLeaves = ERP.data.statementRows.filter(function (r) { return r[0] === 'ODT' && r[4] === 'P' && !/^23/.test(r[2]); }).map(function (r) { return af(r[5]); });
    var bad = [];
    Object.keys(used).sort().forEach(function (no) {
      var a = E().setup.account(no);
      var n1 = sbtLeaves.filter(function (f) { return f(no); }).length;
      var n2 = a && a.incomeBalance === 'INCOME_STATEMENT' ? odtLeaves.filter(function (f) { return f(no); }).length : 1;
      if (n1 !== 1 || n2 !== 1) bad.push(no + (n1 === 0 ? ' NOT_IN_ANY_ROW' : n1 > 1 ? ' IN_MULTIPLE_ROWS' : ' ОДТ'));
    });
    return bad;
  }

  // ===========================================================================
  // 2. #financial-statements
  // ===========================================================================
  var FS_TABS = [
    { code: 'SBT', short: 'СБТ', name: 'Санхүүгийн байдлын тайлан' },
    { code: 'ODT', short: 'ОДТ', name: 'Орлогын дэлгэрэнгүй тайлан' },
    { code: 'OOT', short: 'ӨӨТ', name: 'Өмчийн өөрчлөлтийн тайлан' },
    { code: 'MGT', short: 'МГТ', name: 'Мөнгөн гүйлгээний тайлан (шууд арга)' }
  ];
  var TAB_NOTE = { SBT: 'data-note="rt.fs-sbt"', ODT: 'data-note="rt.fs-odt"', OOT: 'data-note="rt.fs-oot"', MGT: 'data-note="rt.fs-mgt"' };
  var fsState = { tab: 'SBT', asOf: null, unit: 'MNT' };

  function asOfOptions() {
    var y = +today().slice(0, 4), out = [];
    for (var m = 1; m <= 12; m++) {
      var e = E().dates.endOfMonth(y + '-' + String(m).padStart(2, '0') + '-01');
      if (e < today()) out.push([e, E().dates.monthLabel(e.slice(0, 7)) + ' эцэс (' + ui.date(e) + ')']);
    }
    out.push([today(), 'Өнөөдөр (' + ui.date(today()) + ')']);
    return out;
  }
  function defaultAsOf() { var o = asOfOptions(); return o.length > 1 ? o[o.length - 2][0] : o[0][0]; }

  function statementTable(m, unit, rounded) {
    var cols = m.columns;
    var rows = visibleRows(m);
    var html = '<div class="table-wrap"><table class="grid-table rt-gt rt-stmt" id="fs-table"><thead><tr><th class="rt-c-code">Мөр</th><th>Үзүүлэлт</th>' +
      cols.map(function (c) { return '<th class="num">' + ui.esc(c.label) + (unit === 'K' ? '<span class="rt-unit">мян.₮</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var idx = m.rows.indexOf(r);
      if (unit === 'K' && r.code && cols.some(function (c) { return rounded[c.id].rnd[r.code]; })) {
        html += '<tr class="rt-rnd"><td class="code">RND.' + ui.esc(r.code) + '</td><td class="indent-' + Math.min(3, r.indent) + '">Бөөрөнхийлөлтийн зөрүү</td>' +
          cols.map(function (c) { return '<td class="num">' + fmtK(disp(r, nz(rounded[c.id].rnd[r.code])), true) + '</td>'; }).join('') + '</tr>';
      }
      if (r.type === 'H') {
        html += '<tr class="heading rt-lvl-' + r.indent + '"><td class="code"></td><td colspan="' + (cols.length + 1) + '" class="indent-' + Math.min(3, r.indent) + '">' + ui.esc(r.name) + '</td></tr>';
        return;
      }
      var cls = r.type === 'F' ? 'subtotal' : '';
      if (r.type === 'F' && r.indent === 0) cls += ' rt-grand';
      html += '<tr class="' + cls + '"><td class="code">' + ui.esc(r.code || '') + '</td><td class="indent-' + Math.min(3, r.indent) + '">' + ui.esc(r.name) + '</td>';
      cols.forEach(function (c) {
        var txt = unit === 'K' ? fmtK(disp(r, nz(rounded[c.id].t[r.code])), true) : fmtM(disp(r, nz(r.raw[c.id])), { blankZero: true });
        var canDrill = (r.type === 'P' || r.type === 'C') && nz(r.raw[c.id]) !== 0;
        html += '<td class="num">' + (canDrill ? '<button type="button" class="rt-dd" data-fsdd="' + idx + '|' + c.id + '" aria-label="' + ui.esc((r.code || '') + ' ' + r.name + ' — ' + c.label + ' задлах') + '">' + txt + '</button>' : txt) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function balanceStrip(models, code, rounded) {
    var S = models.SBT, html = '';
    var chk = crossChecks(models, null);
    var pick = { SBT: ['BS_BALANCED'], ODT: ['IS_EQUALS_EQ_RE4'], OOT: ['EQ_ROLLFORWARD', 'EQ_EQUALS_BS'], MGT: ['CF_LEDGER', 'CF_EQUALS_BS_CASH', 'CF_UNCLASSIFIED_ZERO'] }[code];
    if (code === 'SBT') {
      var A = rawOf(S, '1.3', 'end'), L = -rawOf(S, '2.1', 'end'), Q = -rawOf(S, '2.2', 'end');
      var cy = -R().glBalance('5000..9998', S.asOf), re = -R().glBalance('3400..3998', S.asOf);
      var ok = A === L + Q;
      html += '<div class="rt-balance ' + (ok ? 'is-ok' : 'is-bad') + '" data-note="rt.fs-balance">' +
        '<div class="rt-bal-eq"><span><span class="label-caps">Хөрөнгө</span><strong class="tabular">' + fmtM(A) + '</strong></span><span class="rt-op" aria-hidden="true">=</span>' +
        '<span><span class="label-caps">Өр төлбөр</span><strong class="tabular">' + fmtM(L) + '</strong></span><span class="rt-op" aria-hidden="true">+</span>' +
        '<span><span class="label-caps">Эздийн өмч</span><strong class="tabular">' + fmtM(Q) + '</strong></span>' + ui.pill(ok ? 'PASS' : 'FAIL', ok ? 'Тэнцсэн' : 'Тэнцээгүй — ' + fmtM(A - L - Q)) + '</div>' +
        '<p class="xs muted">Эздийн өмчид тайлант үеийн үр дүн ' + fmtM(cy, { sym: true }) + ' (5000..9998, жил хаагдаагүй тул 2.2.7-д шууд, R-45) ба өмнөх хуримтлагдсан ашиг ' + fmtM(re, { sym: true }) + ' (3400..3998) орсон. ' +
        (rounded ? 'Мянгат горимд: 1.3 = ' + fmtK(nz(rounded.SBT.end.t['1.3'])) + ', 2.3 = ' + fmtK(-nz(rounded.SBT.end.t['2.3'])) + ' (RND мөртэй).' : '') + '</p></div>';
    } else {
      html += '<div class="rt-checks" data-note="rt.fs-crosscheck">' + chk.filter(function (c) { return pick.indexOf(c.code) >= 0; }).map(function (c) {
        return '<div class="rt-check-item"><span class="check-mark ' + (c.ok ? 'pass' : 'fail') + '" aria-hidden="true">' + (c.ok ? '✓' : '✕') + '</span><span>' + ui.esc(c.label) +
          '<span class="xs muted"> · ' + ui.esc(c.fa) + (c.fb !== '' ? ' / ' + ui.esc(c.fb) : '') + ' · ' + c.rule + '</span></span>' + ui.pill(c.ok ? 'PASS' : 'FAIL') + '</div>';
      }).join('') + '</div>';
    }
    return html;
  }

  function fsCalc(models, code, rounded) {
    var m = models[code], h = '';
    var g = R().glBalance;
    if (code === 'SBT') {
      var r111 = rowByCode(m, '1.1.1');
      var accs = E().setup.accounts().filter(function (a) { return a.type === 'POSTING' && R().accountFilter(r111.totaling)(a.no); });
      h += '<p><strong>Навч мөр</strong> = дансны шүүлтүүрийн үлдэгдэл (BALANCE_AT_DATE, ' + ui.date(m.asOf) + '): 1.1.1 = <code>' + r111.totaling + '</code></p><div class="formula">' +
        accs.map(function (a) { var v = g(a.no, m.asOf); return v ? a.no + ' ' + a.name.padEnd(36, ' ') + fmtM(v).padStart(18, ' ') : null; }).filter(Boolean).join('\n') +
        '\n' + '1.1.1'.padEnd(41, ' ') + fmtM(rawOf(m, '1.1.1', 'end')).padStart(18, ' ') + '</div>';
      var p227 = g('3400..3998', m.asOf), cy = g('5000..9998', m.asOf);
      h += '<p><strong>2.2.7 Хуримтлагдсан ашиг</strong> = <code>3400..3998|5000..9998</code> (R-45): жил хаагдаагүй ч орлого, зардлын данс энд орно, тиймээс баланс ямар ч огноонд тэнцэнэ (FR-RPT-008 AC1/AC2).</p>' +
        '<div class="formula">3400..3998 (хуримтлагдсан)      ' + fmtM(p227).padStart(18, ' ') + '\n5000..9998 (тайлант үеийн үр дүн) ' + fmtM(cy).padStart(18, ' ') +
        '\nтүүхий 2.2.7                      ' + fmtM(p227 + cy).padStart(18, ' ') + '  → харуулах (±) ' + fmtM(-(p227 + cy)) +
        '\n\nCHK = 1.3 + 2.3 (түүхий) = ' + fmtM(rawOf(m, '1.3', 'end')) + ' + (' + fmtM(rawOf(m, '2.3', 'end')) + ') = ' + fmtM(rawOf(m, 'CHK', 'end')) + (rawOf(m, 'CHK', 'end') === 0 ? '  ✓' : '  ✕ rpt.balance_sheet_not_balanced') + '</div>' +
        '<p>Тэмдэг: G/L-д Дт +, Кт −. "±" мөр (өр төлбөр, өмч) харуулахдаа эсрэг тэмдэгтэй (show_opposite_sign, BR-RPT-44); томьёо түүхий утгаар тооцогдоно.</p>';
    } else if (code === 'ODT') {
      var c = 'cur', parts = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'];
      h += '<p>Бүх мөр NET_CHANGE (' + ui.date(m.columns[1].from) + '–' + ui.date(m.asOf) + '), хаалтын бичилтгүй (BR-RPT-62). Орлого түүхий сөрөг, зардал эерэг; томьёо түүхий утгаар нэмэгдэнэ.</p><div class="formula">' +
        '1  Борлуулалтын орлого   5000..5999  ' + fmtM(rawOf(m, '1', c)).padStart(18, ' ') + '\n2  Борлуулалтын өртөг    6000..6999  ' + fmtM(rawOf(m, '2', c)).padStart(18, ' ') +
        '\n3  = 1 + 2                           ' + fmtM(rawOf(m, '3', c)).padStart(18, ' ') +
        '\n18 = ' + parts.join('+') + '\n   = ' + parts.filter(function (k) { return rawOf(m, k, c); }).map(function (k) { return '(' + fmtM(rawOf(m, k, c)) + ')'; }).join(' + ') + '\n   = ' + fmtM(rawOf(m, '18', c)) +
        '\n20 = 18 + 19 = ' + fmtM(rawOf(m, '20', c)) + ';  22 = 20 + 21 = ' + fmtM(rawOf(m, '22', c)) + '  → харуулах ' + fmtM(-rawOf(m, '22', c)) +
        '\nӨӨТ RE.4 (5000..9998) = ' + fmtM(-rawOf(models.OOT, 'RE.4', 'cur')) + (rawOf(m, '22', c) === rawOf(models.OOT, 'RE.4', 'cur') ? '  ✓ BR-RPT-67' : '  ✕') + '</div>' +
        '<p>Өмнөх жилийн багана 0: систем ' + ui.date(ERP.data.company.goLiveDate) + '-нд ашиглалтад орсон тул ' + (+m.asOf.slice(0, 4) - 1) + ' оны бичилт байхгүй (BR-RPT-68).</p>';
    } else if (code === 'OOT') {
      var comps = ['CAP', 'APIC', 'REV', 'OTH', 'RE'];
      h += '<p>Бүрэлдэхүүн бүр: <code>.1</code> эхний үлдэгдэл (OPENING ваучер + өмнөх оны үлдэгдэл), хөдөлгөөн (тайлант үеийн NET_CHANGE, OPENING-гүй), <code>.9</code> эцсийн үлдэгдэл. Ижил дансны мужаар тул эхний + хөдөлгөөн = эцсийн.</p><div class="formula">' +
        comps.map(function (p) {
          var rs = m.rows.filter(function (r) { return r.code && r.code.indexOf(p + '.') === 0; });
          var mv = rs.filter(function (r) { return r.amountType === 'N'; });
          var r1 = rs.filter(function (r) { return /\.1$/.test(r.code); })[0], r9 = rs.filter(function (r) { return /\.9$/.test(r.code); })[0];
          return (p + ':').padEnd(6, ' ') + fmtM(-r1.raw.cur) + mv.map(function (r) { return ' + ' + fmtM(-r.raw.cur); }).join('') + ' = ' + fmtM(-r9.raw.cur) + (r1.raw.cur + sum(mv, function (r) { return r.raw.cur; }) === r9.raw.cur ? '  ✓' : '  ✕');
        }).join('\n') +
        '\nT.9 = ' + fmtM(-rawOf(m, 'T.9', 'cur')) + ';  СБТ 2.2 = ' + fmtM(-rawOf(models.SBT, '2.2', 'end')) + (rawOf(m, 'T.9', 'cur') === rawOf(models.SBT, '2.2', 'end') ? '  ✓ FR-RPT-010 AC1' : '  ✕') +
        '\nT.CHK = T.1+T.2+T.4+T.5+T.6+T.7−T.9 = ' + fmtM(rawOf(m, 'T.CHK', 'cur')) + '</div>' +
        '<p>RE.4 = 5000..9998 = ОДТ 22; RE.2 (3400..3409|3500..3998) нь 3500 → 3400 шилжүүлэгт цэвэр 0, зөвхөн гар залруулгыг харуулна (BR-RPT-65). Энэ мөрүүдийг engine биш, энэ дэлгэцийн helper seed-ийн OOT мөрөөс тооцов.</p>';
    } else {
      var cf = R().cashFlow({ from: m.columns[1].from, to: m.asOf });
      var cats = ERP.data.cashFlowCategories;
      var ex = cf.detail.filter(function (d) { return Object.keys(d.contra).length > 1; })[0] || cf.detail[0];
      h += '<p>Гүйлгээ бүрээс мөнгөний дансны (CASH_TRANSFER: 1100…1140) өөрчлөлт Δ-г олж, харьцсан дансны МГТ ангиллаар хуваана: s<sub>c</sub> = −Σ amount (харьцсан данс, ангилал c). Гүйлгээ тэнцсэн тул Σ s<sub>c</sub> = Δ яг (BR-RPT-72). Мөнгөн данс хоорондын шилжүүлэг (Δ = 0) орохгүй.</p>' +
        '<div class="formula">' + Object.keys(cf.categories).map(function (k) { return (cats[k] ? cats[k][3] + ' ' + k : k).padEnd(28, ' ') + fmtM(cf.categories[k]).padStart(18, ' '); }).join('\n') +
        '\n' + '5 Бүх цэвэр мөнгөн гүйлгээ'.padEnd(28, ' ') + fmtM(rawOf(m, '5', 'cur')).padStart(18, ' ') + '\n' + '6 Эхний үлдэгдэл'.padEnd(28, ' ') + fmtM(rawOf(m, '6', 'cur')).padStart(18, ' ') +
        '\n' + '7 = 5 + 6'.padEnd(28, ' ') + fmtM(rawOf(m, '7', 'cur')).padStart(18, ' ') + '\n' + 'LEDGER (1100..1198, B)'.padEnd(28, ' ') + fmtM(rawOf(m, 'LEDGER', 'cur')).padStart(18, ' ') + '\nCHK = 7 − LEDGER = ' + fmtM(rawOf(m, 'CHK', 'cur')) + '</div>';
      if (ex) {
        h += '<p>Жишээ гүйлгээ ' + ex.transactionNo + ' (' + ui.esc(ex.documentNo) + ', ' + ui.date(ex.postingDate) + '): Δ = ' + fmtM(ex.delta) + ' →</p><div class="formula">' +
          Object.keys(ex.contra).map(function (k) { return k.padEnd(22, ' ') + fmtM(ex.contra[k]).padStart(16, ' '); }).join('\n') + '\nΣ = ' + fmtM(sum(Object.keys(ex.contra), function (k) { return ex.contra[k]; })) + (sum(Object.keys(ex.contra), function (k) { return ex.contra[k]; }) === ex.delta ? ' = Δ ✓' : '') + '</div>';
      }
    }
    if (rounded) {
      var rm = rounded[code];
      var colId = code === 'SBT' ? 'end' : 'cur';
      var st = rm[colId].steps;
      h += '<p><strong>Мянган төгрөг (D-C2, BR-EBL-02..04)</strong>: навч мөр бүрийг rk(x) = Round(x / 1000, AwayFromZero)-ээр бөөрөнхийлж, томьёог бөөрөнхийлсөн утгаар дахин нэмнэ; зангуу мөрт яг утгын rk-тэй зөрвөл зөрүүг "Бөөрөнхийлөлтийн зөрүү" мөрөнд гаргана.</p><div class="formula">' +
        st.map(function (s) {
          return ('зангуу ' + s.code).padEnd(14, ' ') + 'яг ' + fmtM(s.raw).padStart(17, ' ') + '  rk = ' + fmtK(s.target).padStart(9, ' ') + '  тооцоолсон = ' + fmtK(s.computed).padStart(9, ' ') + '  зөрүү = ' + fmtK(s.diff) + (s.diff ? '  → RND.' + s.code : '');
        }).join('\n') + '</div>';
    }
    return h;
  }

  function drillFs(m, row, col) {
    var model = m;
    var title = (row.code ? row.code + ' ' : '') + row.name + ' — ' + col.label;
    var body;
    if (row.type === 'C') {
      var cf = R().cashFlow({ from: col.from, to: col.to });
      var cats = row.totaling.split('|');
      var lines = cf.detail.map(function (d) { var v = sum(cats, function (c) { return nz(d.contra[c]); }); return v ? { d: d, v: v } : null; }).filter(Boolean);
      body = '<p class="small">Ангилал: <code>' + ui.esc(row.totaling) + '</code> · ' + lines.length + ' гүйлгээ. Мөнгөний дансны гүйлгээнээс харьцсан дансны ангиллаар (BR-RPT-71/72).</p>' +
        '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Огноо</th><th>Баримт</th><th>Тайлбар</th><th class="num">Мөнгөний Δ</th><th class="num">Энэ мөрөнд</th></tr></thead><tbody>' +
        lines.map(function (x) { return '<tr><td>' + ui.date(x.d.postingDate) + '</td><td class="code">' + ui.esc(x.d.documentNo) + '</td><td>' + ui.esc(x.d.description) + '</td>' + ui.moneyCell(x.d.delta) + ui.moneyCell(x.v) + '</tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="4">Σ</td>' + ui.moneyCell(sum(lines, function (x) { return x.v; })) + '</tr></tfoot></table></div>';
    } else {
      var f = R().accountFilter(row.totaling);
      var accs = E().setup.accounts().filter(function (a) { return a.type === 'POSTING' && f(a.no); })
        .map(function (a) { return { a: a, v: cellValue(model, row, col, a.no) }; }).filter(function (x) { return x.v !== 0; });
      var mode = model.code === 'OOT' ? { G: 'эхний үлдэгдэл', N: 'хөдөлгөөн (OPENING-гүй)', B: 'эцсийн үлдэгдэл' }[row.amountType] :
        col.mode === 'opening' ? 'OPENING ваучер' : { B: 'үлдэгдэл ' + ui.date(col.to), N: 'хөдөлгөөн ' + ui.date(col.from) + '–' + ui.date(col.to), G: 'эхний үлдэгдэл' }[row.amountType];
      body = '<p class="small">Шүүлтүүр <code>' + ui.esc(row.totaling) + '</code> · ' + ui.esc(mode) + '. Түүхий утга (Дт +, Кт −); мөрөнд ' + (row.opp ? 'эсрэг тэмдгээр' : 'шууд') + ' харагдана.</p>' +
        '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Данс</th><th>Нэр</th><th class="num">Түүхий</th><th class="num">Харуулах</th></tr></thead><tbody>' +
        accs.map(function (x) { return '<tr><td class="code">' + (ERP.gl && ERP.gl.accountCard ? '<button type="button" class="rt-link mono" data-rtacc="' + x.a.no + '">' + x.a.no + '</button>' : x.a.no) + '</td><td>' + ui.esc(x.a.name) + '</td>' + ui.moneyCell(x.v) + ui.moneyCell(disp(row, x.v)) + '</tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="2">Σ = мөрийн утга</td>' + ui.moneyCell(sum(accs, function (x) { return x.v; })) + ui.moneyCell(disp(row, sum(accs, function (x) { return x.v; }))) + '</tr></tfoot></table></div>';
    }
    var md = ui.modal({ title: title, body: body, wide: true });
    ui.$$('[data-rtacc]', md.el).forEach(function (b) {
      b.addEventListener('click', function () { var no = b.getAttribute('data-rtacc'); md.close(true); ERP.gl.accountCard(no, { from: col.from || (model.asOf.slice(0, 4) + '-01-01'), to: col.to || model.asOf }); });
    });
  }

  function allModels(asOf) {
    return { SBT: buildModel('SBT', asOf), ODT: buildModel('ODT', asOf), OOT: buildModel('OOT', asOf), MGT: buildModel('MGT', asOf) };
  }
  function allRounded(models) {
    var o = {};
    Object.keys(models).forEach(function (k) { o[k] = roundModel(models[k]); });
    return o;
  }

  function renderFs(el, ctx) {
    if (!fsState.asOf) fsState.asOf = defaultAsOf();
    if (ctx.rtFsTab) { fsState.tab = ctx.rtFsTab; ctx.rtFsTab = null; }
    var models = allModels(fsState.asOf);
    var rounded = fsState.unit === 'K' ? allRounded(models) : null;
    var co = ERP.data.company;
    var tab = FS_TABS.filter(function (t) { return t.code === fsState.tab; })[0];
    var m = models[tab.code];
    var checks = crossChecks(models, null);
    var blocking = checks.filter(function (c) { return !c.ok && c.level === 'BLOCKING'; });
    var html = '<div class="page-head"><div class="title-wrap"><h1>Санхүүгийн тайлан</h1><span class="pill neutral">Маягт А</span></div>' +
      '<span class="small muted">' + ui.esc(co.name) + ' · ТТД ' + ui.esc(co.tin) + ' · нэгж: ' + (fsState.unit === 'K' ? 'мянган төгрөг' : 'төгрөг') + '</span></div>';
    html += '<div class="card"><div class="card-body"><form class="rt-toolbar" id="fs-form">' +
      '<div class="field" data-note="rt.fs-asof"><label for="fs-asof">Тайлант огноо</label><select class="select" id="fs-asof">' +
      asOfOptions().map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === fsState.asOf ? ' selected' : '') + '>' + ui.esc(o[1]) + '</option>'; }).join('') + '</select></div>' +
      '<fieldset class="rt-seg" data-note="rt.fs-unit"><legend>Нэгж</legend>' +
      '<label class="rt-seg-opt" for="fs-unit-mnt"><input type="radio" name="fs-unit" id="fs-unit-mnt" value="MNT"' + (fsState.unit === 'MNT' ? ' checked' : '') + '><span>Төгрөг</span></label>' +
      '<label class="rt-seg-opt" for="fs-unit-k"><input type="radio" name="fs-unit" id="fs-unit-k" value="K"' + (fsState.unit === 'K' ? ' checked' : '') + '><span>Мянган ₮</span></label></fieldset>' +
      '<span class="rt-grow"></span>' +
      '<span class="has-note" data-note="rt.fs-ebalance" style="display:inline-flex"><button class="btn primary" type="button" id="fs-ebalance">e-balance шивэх хуудас…</button></span>' +
      '</form></div></div>';
    if (blocking.length) html += '<div class="banner danger" role="alert"><strong>Шалгалт амжилтгүй:</strong> ' + blocking.map(function (c) { return ui.esc(c.code); }).join(', ') + ' — дэлгэц ба экспорт зөвшөөрөгдөнө, FINAL болгох хориотой (BR-RPT-61).</div>';
    html += '<div class="banner" data-note="rt.fs-version">Маягт А-гийн мөрийн код (хувилбар ' + ui.date('2018-01-01') + ', 129 мөр verified = false) албан ёсны хавсралттай тулгагдаагүй ⚠ (BR-RPT-64). ' +
      'Өмнөх үеийн мэдээлэл системд бүрэн биш — ашиглалтад орсон ' + ui.date(co.goLiveDate) + ' (BR-RPT-68).</div>';
    html += '<div class="tabs" role="tablist" aria-label="Маягт А-гийн тайлан" data-note="rt.fs-tabs">' + FS_TABS.map(function (t) {
      var sel = t.code === fsState.tab;
      return '<button class="tab" role="tab" type="button" id="fs-tab-' + t.code + '" aria-selected="' + sel + '" aria-controls="fs-panel" tabindex="' + (sel ? '0' : '-1') + '" data-tab="' + t.code + '"><strong>' + t.short + '</strong> <span class="rt-tab-long">' + ui.esc(t.name) + '</span></button>';
    }).join('') + '</div>';
    html += '<section id="fs-panel" role="tabpanel" aria-labelledby="fs-tab-' + tab.code + '" class="stack">';
    html += '<div class="card" ' + TAB_NOTE[tab.code] + '><div class="card-head"><h2>' + ui.esc(tab.name) + ' <span class="muted small">(' + tab.short + ', ' + ui.date(fsState.asOf) + ')</span></h2>' +
      '<span class="small muted">Мөрийн тоо дээр дарж данс, гүйлгээ рүү задална</span></div><div class="card-body flush">' + statementTable(m, fsState.unit, rounded ? rounded[tab.code] : null) + '</div></div>';
    html += balanceStrip(models, tab.code, rounded);
    html += '<div data-note="rt.fs-calc">' + ui.calc('Тооцоог харах: ' + tab.short + '-ийн томьёо' + (rounded ? ' ба мянгатын бөөрөнхийлөлт' : ''), fsCalc(models, tab.code, rounded), 'fs-calc') + '</div>';
    html += '</section>';
    el.innerHTML = html;

    ui.$('#fs-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    on('fs-asof', 'change', function (ev) { fsState.asOf = ev.target.value; app.refresh(); refocus('fs-asof'); });
    ['fs-unit-mnt', 'fs-unit-k'].forEach(function (id) { on(id, 'change', function (ev) { fsState.unit = ev.target.value; app.refresh(); refocus(id); }); });
    var tabs = ui.$$('[data-tab]', el);
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { fsState.tab = b.getAttribute('data-tab'); app.refresh(); refocus('fs-tab-' + fsState.tab); });
      b.addEventListener('keydown', function (ev) {
        var k = ev.key, j = k === 'ArrowRight' ? (i + 1) % tabs.length : k === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : -1;
        if (j < 0) return;
        ev.preventDefault(); fsState.tab = tabs[j].getAttribute('data-tab'); app.refresh(); refocus('fs-tab-' + fsState.tab);
      });
    });
    ui.$$('[data-fsdd]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-fsdd').split('|');
        var row = m.rows[+p[0]], col = m.columns.filter(function (c) { return c.id === p[1]; })[0];
        drillFs(m, row, col);
      });
    });
    on('fs-ebalance', 'click', function () { openEbalance(fsState.asOf); });
  }

  // ---------------------------------------------------------------------------
  // e-balance keying sheet preview (S-RPT-13, 10 §5.15) — in-page only, no download
  // ---------------------------------------------------------------------------
  function codeCmp(a, b) {
    var x = a.split('.'), y = b.split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      if (x[i] === undefined) return -1;
      if (y[i] === undefined) return 1;
      var nx = +x[i], ny = +y[i];
      if (!isNaN(nx) && !isNaN(ny) && nx !== ny) return nx - ny;
      if (isNaN(nx) || isNaN(ny)) { if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; }
    }
    return 0;
  }
  function keyingSheet(m, rm) {
    var priorCol = m.code === 'SBT' ? 'begin' : m.code === 'OOT' ? null : 'prev';
    var curCol = m.code === 'SBT' ? 'end' : 'cur';
    var rows = m.rows.filter(function (r) { return r.code && r.type !== 'H' && CHECK_ROWS.indexOf(r.code) < 0 && r.show !== 'N'; });
    if (m.code !== 'OOT') rows.sort(function (a, b) { return codeCmp(a.code, b.code); });
    var out = [], n = 0;
    rows.forEach(function (r) {
      var rp = priorCol ? nz(rm[priorCol].rnd[r.code]) : 0, rc = nz(rm[curCol].rnd[r.code]);
      if (rp || rc) {
        out.push({ order: ++n, lineCode: 'RND.' + r.code, name: 'Бөөрөнхийлөлтийн зөрүү', rowType: 'ROUNDING_DIFFERENCE', prior: disp(r, rp), current: disp(r, rc), priorExact: null, currentExact: null });
      }
      out.push({ order: ++n, lineCode: r.code, name: r.name, rowType: 'LINE',
        prior: priorCol ? disp(r, nz(rm[priorCol].t[r.code])) : null, current: disp(r, nz(rm[curCol].t[r.code])),
        priorExact: priorCol ? disp(r, nz(r.raw[priorCol])) : null, currentExact: disp(r, nz(r.raw[curCol])) });
    });
    return out;
  }
  function jsonHtml(obj) {                              // like ui.json, but numbers stay as written (order, fiscalYear)
    var ind = function (n) { return '  '.repeat(n); };
    var f = function (v, n) {
      if (v === null) return '<span class="z">null</span>';
      if (typeof v === 'number' || typeof v === 'boolean') return '<span class="n">' + String(v) + '</span>';
      if (typeof v === 'string') return '<span class="s">"' + ui.esc(v) + '"</span>';
      if (Array.isArray(v)) return v.length ? '[\n' + v.map(function (x) { return ind(n + 1) + f(x, n + 1); }).join(',\n') + '\n' + ind(n) + ']' : '[]';
      return '{\n' + Object.keys(v).map(function (k) { return ind(n + 1) + '<span class="k">"' + ui.esc(k) + '"</span>: ' + f(v[k], n + 1); }).join(',\n') + '\n' + ind(n) + '}';
    };
    return '<pre class="json">' + f(obj, 0) + '</pre>';
  }
  function openEbalance(asOf) {
    var models = allModels(asOf), rounded = allRounded(models);
    var co = ERP.data.company, y = asOf.slice(0, 4);
    var sheets = {};
    ['SBT', 'ODT', 'OOT', 'MGT'].forEach(function (c) { sheets[c] = keyingSheet(models[c], rounded[c]); });
    var checks = crossChecks(models, rounded);
    var dl = param('ebalance.annual_deadline', asOf);
    var json = { format: 'mn-ebalance/1', company: { legalName: co.name, tin: co.tin, registrationNo: co.registrationNo },
      fiscalYear: +y, unit: 'THOUSAND_MNT', formCode: 'A', statementLineVersion: '2018-01-01', unverifiedLineCount: 129,
      statements: ['SBT', 'ODT', 'OOT', 'MGT'].map(function (c) {
        return { code: EB_CODE[c], rows: sheets[c].map(function (r) {
          var o = { order: r.order, lineCode: r.lineCode, name: r.name, rowType: r.rowType, prior: r.prior === null ? null : String(r.prior), current: String(r.current) };
          if (r.rowType === 'LINE') { o.priorExact = r.priorExact === null ? null : (r.priorExact / 100).toFixed(2); o.currentExact = (r.currentExact / 100).toFixed(2); }
          return o;
        }) };
      }),
      checks: checks.map(function (c) { return { code: c.code, ok: c.ok, difference: String(c.diff || 0) }; }),
      generatedAt: today() + 'T' + nowHm() + ':00+08:00', generatedBy: ERP.app.state.role === 'OWNER' ? 'Б. Наранбаатар' : 'Д. Сарнай', dataSha256: '…' };
    var tabs = [['SBT', 'СБТ'], ['ODT', 'ОДТ'], ['OOT', 'ӨӨТ'], ['MGT', 'МГТ'], ['CHK', 'Шалгалт'], ['INFO', 'Мэдээлэл'], ['JSON', 'JSON']];
    var sheetHtml = function (c) {
      var rs = sheets[c], hasPrior = c !== 'OOT';
      return '<div class="table-wrap rt-sheet"><table class="grid-table rt-gt"><thead><tr><th class="num">№</th><th>Мөрийн код</th><th>Үзүүлэлт</th>' + (hasPrior ? '<th class="num">Өмнөх, мян.₮</th>' : '') + '<th class="num">Тайлант, мян.₮</th>' +
        (hasPrior ? '<th class="num">Өмнөх, ₮ (яг)</th>' : '') + '<th class="num">Тайлант, ₮ (яг)</th><th>Тэмдэглэл</th></tr></thead><tbody>' +
        rs.map(function (r) {
          return '<tr' + (r.rowType === 'ROUNDING_DIFFERENCE' ? ' class="rt-rnd"' : '') + '><td class="num">' + r.order + '</td><td class="code">' + ui.esc(r.lineCode) + '</td><td>' + ui.esc(r.name) + '</td>' +
            (hasPrior ? '<td class="num">' + fmtK(r.prior) + '</td>' : '') + '<td class="num">' + fmtK(r.current) + '</td>' +
            (hasPrior ? '<td class="num muted">' + (r.priorExact === null ? '' : fmtM(r.priorExact)) + '</td>' : '') + '<td class="num muted">' + (r.currentExact === null ? '' : fmtM(r.currentExact)) + '</td>' +
            '<td class="xs">' + (r.rowType === 'ROUNDING_DIFFERENCE' ? 'ROUNDING_DIFFERENCE' : 'UNVERIFIED_LINE') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    };
    var chkHtml = '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Код</th><th>Тайлбар</th><th>Үр дүн</th><th class="num">Зөрүү</th></tr></thead><tbody>' +
      checks.map(function (c) { return '<tr><td class="code">' + c.code + '</td><td>' + ui.esc(c.label) + '<div class="xs muted">' + ui.esc(c.fa) + (c.fb !== '' ? ' / ' + ui.esc(c.fb) : '') + ' · ' + c.rule + '</div></td><td>' + ui.pill(c.ok ? 'PASS' : c.level === 'WARNING' ? 'WARNING' : 'FAIL') + '</td><td class="num">' + (c.code === 'UNMAPPED_ACCOUNTS' || c.code === 'YEAR_CLOSED' ? (c.diff || 0) : fmtK(c.diff || 0)) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    var infoHtml = '<dl class="kv left rt-kv">' + [['Компани', co.name], ['ТТД', co.tin], ['Улсын бүртгэлийн дугаар', co.registrationNo], ['Санхүүгийн жил', y + ' (урьдчилсан, ' + ui.date(asOf) + ' хүртэл)'],
      ['Нэгж', 'Мянган төгрөг (THOUSAND_MNT)'], ['Маягт А-гийн хувилбар', ui.date('2018-01-01') + ' · verified = false: 129 мөр (45 + 27 + 9 + 48)'], ['Эх сурвалж', 'LIVE (FINAL snapshot байхгүй — BR-EBL-01)'],
      ['Илгээх хугацаа', dl ? ui.date((+y + 1) + '-' + dl.text) + ' (ebalance.annual_deadline, дараа оны ' + dl.text + ')' : '—'], ['e-balance холбоос', 'ebalance.url (баталгаажаагүй ⚠)'],
      ['Гаргасан', ui.date(today()) + ' ' + nowHm() + ' · ' + json.generatedBy], ['Өгөгдлийн SHA-256', '<span class="mono" id="eb-sha">тооцоолж байна…</span>']]
      .map(function (x) { return '<dt>' + ui.esc(x[0]) + '</dt><dd>' + (x[0] === 'Өгөгдлийн SHA-256' ? x[1] : ui.esc(x[1])) + '</dd>'; }).join('') + '</dl>';
    var body = '<div class="banner warn">Жил хаагдаагүй (rpt.year_not_closed, WARNING): ' + ui.date(asOf) + '-ний байдлаарх урьдчилсан хуудас. Файл татахгүй — прототипт зөвхөн дэлгэцэнд харуулна; бодит системд XLSX/PDF/JSON-ийг async job (202) гаргана (BR-EBL-07).</div>' +
      '<div class="tabs rt-ebtabs" role="tablist" aria-label="Шивэх хуудасны хуудас">' + tabs.map(function (t, i) { return '<button class="tab" type="button" role="tab" id="eb-tab-' + t[0] + '" aria-selected="' + (i === 0) + '" aria-controls="eb-panel" data-ebtab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="eb-panel" role="tabpanel" aria-labelledby="eb-tab-SBT"></div>';
    var md = ui.modal({ title: 'e-balance шивэх хуудас — ' + y + ' (мянган ₮)', body: body, wide: true,
      footer: [{ label: 'JSON хуулах', id: 'eb-copy', onClick: function () { ui.copy(JSON.stringify(json, null, 2), document.getElementById('eb-copy')); } }, { label: 'Хаах', kind: 'primary' }] });
    var panel = ui.$('#eb-panel', md.el);
    var show = function (k) {
      ui.$$('[data-ebtab]', md.el).forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-ebtab') === k)); });
      panel.setAttribute('aria-labelledby', 'eb-tab-' + k);
      panel.innerHTML = k === 'CHK' ? chkHtml : k === 'INFO' ? infoHtml : k === 'JSON' ? jsonHtml(json) : sheetHtml(k);
      if (k === 'INFO') fillSha();
    };
    var shaVal = null;
    var fillSha = function () { var n = document.getElementById('eb-sha'); if (n && shaVal) n.textContent = shaVal; };
    try {
      var bytes = new TextEncoder().encode(JSON.stringify(json.statements));
      window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
        shaVal = Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        json.dataSha256 = shaVal; fillSha();
      }, function () { shaVal = 'тооцоолох боломжгүй'; fillSha(); });
    } catch (e) { shaVal = 'тооцоолох боломжгүй'; }
    ui.$$('[data-ebtab]', md.el).forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-ebtab')); }); });
    show('SBT');
  }

  // ===========================================================================
  // 3. #vat-return (S-TAX-03)
  // ===========================================================================
  var vatState = { period: null, calc: {}, submissions: {} };
  var AMT_LABEL = { BASE: 'Суурь', AMOUNT: 'НӨАТ', NON_DEDUCTIBLE_AMOUNT: 'Хасагдахгүй', FULL_AMOUNT: 'Бүтэн НӨАТ', NONE: '' };

  function vatPeriodsList() { return E().vat.periods(); }
  function defaultVatPeriod() {
    var open = vatPeriodsList().filter(function (p) { return p.status === 'OPEN' && p.end < today(); });
    return open.length ? open[0].period : vatPeriodsList()[0].period;
  }
  function rowMatch(r, e) {
    return e.type === r.genType && (!r.vatBus || e.vatBus === r.vatBus) && (!r.vatProd || e.vatProd === r.vatProd) && (!r.category || e.category === r.category);
  }
  function rowEntryValue(r, e) {
    return r.amountType === 'BASE' ? e.base : r.amountType === 'AMOUNT' ? e.amount : r.amountType === 'NON_DEDUCTIBLE_AMOUNT' ? e.nonDeductibleAmount : e.amount + e.nonDeductibleAmount;
  }
  function vatModel(period) {
    var rep = R().vatReturn(period);
    rep.rows.forEach(function (r) { if (r.type !== 'D') { r.value = nz(r.value); r.printValue = nz(r.printValue); } });
    return rep;
  }
  function salesDocsOf(period) {
    var inv = E().sales.postedInvoices().concat(E().sales.postedCreditMemos()).filter(function (p) { return p.vatDate ? p.vatDate.slice(0, 7) === period : p.postingDate.slice(0, 7) === period; });
    return inv.map(function (p) {
      var d = p.ebarimtDocId ? E().ebarimt.get(p.ebarimtDocId) : null;
      var isCm = p.docType === 'CREDIT_MEMO' || /^SC-/.test(p.no);
      var st = d ? d.status : 'NOT_CONFIGURED';
      var ebVat = d && d.totals ? d.totals.vat : null;
      return { p: p, doc: d, status: st, isCm: isCm, vat: p.vatAmount, ebVat: ebVat, ok: st === 'SUCCESS' && ebVat === p.vatAmount };
    });
  }
  function daysLeft(due) { return E().dates.daysBetween(today(), due); }

  function vatStepper(vp, calculated) {
    var st = vp.status;
    var steps = [['Тооцоолох', calculated || st !== 'OPEN' ? 'done' : 'cur'], ['Хянах', st === 'OPEN' ? (calculated ? 'cur' : 'todo') : 'done'],
      ['НӨАТ хаах', st === 'OPEN' ? 'todo' : 'done'], ['Илгээсэн', st === 'SUBMITTED' ? 'done' : st === 'CLOSED' ? 'cur' : 'todo']];
    return '<ol class="rt-stepper" data-note="rt.vat-steps">' + steps.map(function (s, i) {
      return '<li class="is-' + s[1] + '"' + (s[1] === 'cur' ? ' aria-current="step"' : '') + '><span class="rt-step-mark" aria-hidden="true">' + (s[1] === 'done' ? '✓' : s[1] === 'cur' ? '●' : '○') + '</span><span>' + (i + 1) + '. ' + s[0] + '</span><span class="sr-only"> — ' + (s[1] === 'done' ? 'дууссан' : s[1] === 'cur' ? 'одоогийн' : 'үлдсэн') + '</span></li>';
    }).join('') + '</ol>';
  }

  function vatRowsTable(rep, period) {
    var html = '<div class="table-wrap"><table class="grid-table rt-gt rt-vat" id="vat-table"><thead><tr><th class="rt-c-code">Мөр</th><th>Үзүүлэлт</th><th class="rt-opt">Төрөл</th><th class="num">Дүн (₮)</th><th class="num rt-opt">Бичилт</th><th class="rt-opt">Хавсралт</th></tr></thead><tbody>';
    rep.rows.forEach(function (r, i) {
      if (r.type === 'D') { html += '<tr class="heading"><td class="code">' + ui.esc(r.row) + '</td><td colspan="5">' + ui.esc(r.name) + '</td></tr>'; return; }
      var cls = r.type === 'R' ? (r.row === '14' ? 'subtotal rt-grand' : 'subtotal') : '';
      var n = r.entries ? r.entries.length : null;
      var badges = (r.confirmed ? '<span class="rt-tag" title="only_deductible_confirmed = true">ДДТД ✓</span>' : '') + (r.calcOpp ? '<span class="rt-tag" title="calculate_with = OPPOSITE_SIGN">±</span>' : '');
      html += '<tr class="' + cls + '"><td class="code">' + ui.esc(r.row) + '</td><td>' + ui.esc(r.name) + (r.rowTot ? ' <span class="xs muted">= ' + r.rowTot.split('|').join(' + ') + '</span>' : '') + '</td>' +
        '<td class="xs rt-opt">' + (r.type === 'V' ? AMT_LABEL[r.amountType] + ' ' + badges : 'Мөрийн нийлбэр') + '</td>' +
        '<td class="num">' + (r.type === 'V' ? '<button type="button" class="rt-dd" data-vdd="' + i + '" aria-label="Мөр ' + r.row + ' бичилт рүү задлах">' + fmtM(r.printValue) + '</button>' : fmtM(r.printValue)) + '</td>' +
        '<td class="num rt-opt">' + (n === null ? '' : n) + '</td><td class="xs rt-opt">' + ui.esc(r.box || '') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function vatEntriesTable(list, excluded) {
    var row = function (e, ex) {
      return '<tr' + (ex ? ' class="rt-excluded"' : '') + '><td class="num">' + e.entryNo + '</td><td>' + ui.date(e.vatDate) + '</td><td class="code">' + ui.esc(e.documentNo) + '</td><td class="xs">' + e.type + '</td><td class="xs">' + e.vatBus + ' × ' + e.vatProd + '</td>' +
        ui.moneyCell(e.base) + ui.moneyCell(e.amount) + ui.moneyCell(e.nonDeductibleAmount, { blankZero: true }) +
        '<td>' + (e.type === 'PURCHASE' ? (e.deductibleConfirmed ? ui.pill('OK', 'Баталгаажсан') : ui.pill('WARNING', 'Баталгаажаагүй')) : '') + '</td>' +
        '<td class="code xs" title="' + ui.esc(e.supplierDdtd || '') + '">' + (e.supplierDdtd ? '…' + e.supplierDdtd.slice(-8) : '') + '</td><td class="xs">' + (e.closed ? 'хаагдсан' : '') + (ex ? ' <strong>орохгүй (D-E4)</strong>' : '') + '</td></tr>';
    };
    return '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th class="num">№</th><th>НӨАТ огноо</th><th>Баримт</th><th>Төрөл</th><th>Bus. × Prod.</th><th class="num">Суурь</th><th class="num">НӨАТ</th><th class="num">Хасагдахгүй</th><th>Орцын</th><th>ДДТД</th><th></th></tr></thead><tbody>' +
      list.map(function (e) { return row(e, false); }).join('') + (excluded || []).map(function (e) { return row(e, true); }).join('') +
      (list.length || (excluded && excluded.length) ? '' : '<tr><td colspan="11" class="empty">Бичилт алга</td></tr>') + '</tbody></table></div>';
  }

  function drillVat(rep, r) {
    var excluded = r.confirmed ? rep.entries.filter(function (e) { return rowMatch(r, e) && !e.deductibleConfirmed; }) : [];
    var raw = sum(r.entries, function (e) { return rowEntryValue(r, e); });
    var body = '<p class="small">Шүүлтүүр: <code>' + r.genType + ' / ' + (r.vatBus || '*') + ' / ' + (r.vatProd || '*') + ' / ' + (r.category || '*') + '</code>, ' + AMT_LABEL[r.amountType] + (r.confirmed ? ', зөвхөн deductible_confirmed' : '') + ' (NULL бүлэг = бүх бүлэг, Z-TAX-10).</p>' +
      '<div class="formula">Σ ' + r.amountType.toLowerCase() + ' = ' + fmtM(raw) + (r.calcOpp ? '  → OPPOSITE_SIGN → ' + fmtM(-raw) : '') + (r.printOpp ? '  → хэвлэх (print_with) → ' + fmtM(r.printValue) : '') + '</div>' +
      vatEntriesTable(r.entries, excluded);
    ui.modal({ title: 'ТТ-03а мөр ' + r.row + ': ' + r.name, body: body, wide: true });
  }

  function registersModal(rep, period) {
    var purch = rep.entries.filter(function (e) { return e.type === 'PURCHASE' && e.deductibleConfirmed && e.amount !== 0; });
    var sales = salesDocsOf(period);
    var body = '<p class="small">ТТ-03а-5 (худалдан авалт) ба ТТ-03а-6 (борлуулалт) нь тайлантай ижил scope-оос (BR-TAX-70). Бүртгэлийн нийлбэр = мөр 7/8 ба 1/2.</p>' +
      '<h3>ТТ-03а-5 · Худалдан авалт (баталгаажсан ДДТД)</h3><div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Огноо</th><th>Баримт</th><th>Нийлүүлэгчийн ТТД</th><th>ДДТД</th><th class="num">Цэвэр дүн</th><th class="num">НӨАТ</th></tr></thead><tbody>' +
      (purch.length ? purch.map(function (e) { return '<tr><td>' + ui.date(e.vatDate) + '</td><td class="code">' + e.documentNo + '</td><td class="code">' + ui.esc(e.partyTin || '') + '</td><td class="code xs">' + ui.esc(e.supplierDdtd || '') + '</td>' + ui.moneyCell(e.base) + ui.moneyCell(e.amount) + '</tr>'; }).join('') : '<tr><td colspan="6" class="empty">Баталгаажсан худалдан авалт алга — мөр 7, 8 = 0</td></tr>') +
      '</tbody><tfoot><tr><td colspan="4">Σ (= мөр 7 / мөр 8)</td>' + ui.moneyCell(sum(purch, function (e) { return e.base; })) + ui.moneyCell(sum(purch, function (e) { return e.amount; })) + '</tr></tfoot></table></div>' +
      '<h3>ТТ-03а-6 · Борлуулалт</h3><div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Огноо</th><th>Баримт</th><th>Харилцагч</th><th>eBarimt</th><th class="num">Цэвэр дүн</th><th class="num">НӨАТ</th></tr></thead><tbody>' +
      sales.map(function (s) { var sg = s.isCm ? -1 : 1; return '<tr><td>' + ui.date(s.p.postingDate) + '</td><td class="code">' + s.p.no + '</td><td>' + ui.esc(s.p.customerName) + '</td><td>' + ui.pill(s.status) + '</td>' + ui.moneyCell(sg * s.p.amount) + ui.moneyCell(sg * s.p.vatAmount) + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="4">Σ (мөр 6 / мөр 2)</td>' + ui.moneyCell(sum(sales, function (s) { return (s.isCm ? -1 : 1) * s.p.amount; })) + ui.moneyCell(sum(sales, function (s) { return (s.isCm ? -1 : 1) * s.p.vatAmount; })) + '</tr></tfoot></table></div>' +
      '<p class="xs muted">Экспорт (XLSX/CSV) нь бодит системд async job tax.vat_return.export (202); прототипт файл татахгүй.</p>';
    ui.modal({ title: 'ТТ-03а-5 / ТТ-03а-6 бүртгэл — ' + E().dates.monthLabel(period), body: body, wide: true });
  }

  function confirmInputModal(no) {
    var p = E().purchases.list().filter(function (x) { return x.no === no; })[0];
    if (!p) return;
    var m = ui.modal({ title: 'Орцын НӨАТ баталгаажуулах — ' + no,
      body: '<form id="vat-cf-form" class="stack"><p>' + ui.esc(p.vendorName) + ' · НӨАТ ' + fmtM(p.vatAmount, { sym: true }) + '</p>' +
        '<div class="field"><label for="vat-cf-ddtd">Нийлүүлэгчийн eBarimt ДДТД (33 орон)</label><input class="input mono" id="vat-cf-ddtd" inputmode="numeric" maxlength="33" autocomplete="off" value="' + ui.esc(p.ddtd || '') + '"></div>' +
        '<div id="vat-cf-err"></div><p class="xs muted">BR-TAX-47/49: ДДТД 33 оронтой; баталгаажсаны дараа энэ тайлангийн 7, 8-р мөрөнд орно (D-E4).</p></form>',
      footer: [{ label: 'Болих' }, { label: 'Баталгаажуулах', kind: 'primary', id: 'vat-cf-ok', onClick: function (close) {
        var v = ui.$('#vat-cf-ddtd', m.el).value.replace(/\D/g, '');
        var r = E().purchases.confirmInputVat(no, v);
        if (!r.ok) { ui.$('#vat-cf-err', m.el).innerHTML = ui.errList(r.errors, 'Баталгаажуулж чадсангүй'); ui.$('#vat-cf-ddtd', m.el).classList.add('invalid'); return; }
        delete vatState.calc[vatState.period];
        close(true); ui.toast('Орцын НӨАТ баталгаажлаа: ' + ui.esc(no) + '. ТТ-03а дахин тооцоологдлоо.'); app.refresh();
      } }] });
    ui.$('#vat-cf-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); ui.$('#vat-cf-ok', m.el).click(); });
  }

  // vat.settle(…, { preview: true }) runs on a JSON copy of the state and resolves `closes` by entry no inside that copy, so the
  // live entries stay untouched; the snapshot/restore below is kept only as a belt-and-braces guard.
  function settlePreview(period, date) {
    var es = E().vat.entries();
    var snap = es.map(function (e) { return [e.closed, e.closedByEntryNo, e.vatReturnPeriod]; });
    try { return E().vat.settle(period, date, { preview: true }); }
    finally { es.forEach(function (e, i) { e.closed = snap[i][0]; e.closedByEntryNo = snap[i][1]; e.vatReturnPeriod = snap[i][2]; }); }
  }
  function settleCheck(vp, date) {                      // BR-TAX-72 subset done on the client (engine checks status + posting)
    var errs = [];
    if (!date) errs.push({ code: 'ui.invalid_date', message: 'Огноо ЖЖЖЖ.СС.ӨӨ хэлбэрээр.' });
    if (today() < vp.end) errs.push({ code: 'tax.vat_period_not_ended', message: 'Үе ' + ui.date(vp.end) + '-нд дуусна; түүнээс өмнө хаахгүй.' });
    if (date && date < vp.end) errs.push({ code: 'tax.vat_settlement_date_invalid', message: 'Хаалтын огноо үеийн сүүлийн өдрөөс (' + ui.date(vp.end) + ') өмнө байж болохгүй.' });
    var ap = date ? E().periods.of(date) : null;
    if (date && (!ap || ap.status !== 'OPEN')) errs.push({ code: 'gl.period_closed', message: ui.date(date) + '-ний нягтлан бодох үе нээлттэй биш.' });
    var prevOpen = vatPeriodsList().filter(function (p) { return p.period < vp.period && p.status === 'OPEN'; });
    if (prevOpen.length) errs.push({ code: 'tax.vat_previous_period_open', message: 'Өмнөх үе ' + prevOpen.map(function (p) { return p.period; }).join(', ') + ' хаагдаагүй (BR-TAX-44).' });
    return errs;
  }
  function settlementPreviewHtml(res) {
    if (!res.ok) return ui.errList(res.errors, 'Хаалтын урьдчилсан харагдац гарсангүй');
    var v = res.result ? res.result.vouchers[0] : null;
    var acc = function (no) { var a = E().setup.account(no); return a ? a.name : ''; };
    var groups = res.plan.groups;
    var html = '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Бүлэг (төрөл / Bus. / Prod.)</th><th class="num">Entry</th><th class="num">Σ дүн</th><th>Данс</th></tr></thead><tbody>' +
      (groups.length ? groups.map(function (g) { return '<tr><td class="xs">' + g.type + ' / ' + g.vatBus + ' / ' + g.vatProd + '</td><td class="num">' + g.entries.length + '</td>' + ui.moneyCell(g.amount) + '<td class="code">' + (g.type === 'SALE' ? g.setup.salesAcc : g.setup.purchAcc) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="empty">Хаах entry алга</td></tr>') +
      '</tbody></table></div>';
    if (v) {
      html += '<p class="small"><strong>Хаалтын ваучер</strong> (source VATSTMT, цуврал GJ, дугаар батлахад олгоно: <code>' + ui.esc(v.documentNo) + '</code>, ' + ui.date(v.postingDate) + '):</p>' +
        '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Данс</th><th>Нэр</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
        v.gl.map(function (g) { return '<tr><td class="code">' + g.account + '</td><td>' + ui.esc(acc(g.account)) + '</td>' + ui.moneyCell(g.amount > 0 ? g.amount : 0, { blankZero: true }) + ui.moneyCell(g.amount < 0 ? -g.amount : 0, { blankZero: true }) + '</tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="2">Σ</td>' + ui.moneyCell(sum(v.gl, function (g) { return g.amount > 0 ? g.amount : 0; })) + ui.moneyCell(sum(v.gl, function (g) { return g.amount < 0 ? -g.amount : 0; })) + '</tr></tfoot></table></div>' +
        '<p class="small">SETTLEMENT VAT entry: ' + v.vat.map(function (x) { return x.vatProd + ' ' + fmtM(x.amount); }).join(', ') + ' (closed = true); эх entry-үүд closed болно. Үр дүн: ' +
        (res.net >= 0 ? 'төлөх НӨАТ <strong>' + fmtM(res.net, { sym: true }) + '</strong> (2310 Кт)' : 'буцаан авах <strong>' + fmtM(-res.net, { sym: true }) + '</strong> (2310 Дт)') + '.</p>';
    } else html += '<p class="small">G/L мөргүй тул ваучер үүсэхгүй (BR-TAX-75); үе зөвхөн CLOSED болно.</p>';
    return html;
  }

  function thresholdModel(asOf) {                        // BR-TAX-83..85 (helper: engine has no threshold API)
    var S = E().state();
    var glByNo = {}; S.glEntries.forEach(function (g) { glByNo[g.entryNo] = g; });
    var minus12 = function (d) { var y = +d.slice(0, 4) - 1, md = d.slice(5); if (md === '02-29') md = '02-28'; return y + '-' + md; };
    var inScope = function (e) {
      var s = E().setup.vatSetup(e.vatBus, e.vatProd);
      var cat = s ? s.category : e.category;
      var g = glByNo[e.glEntryNo];
      return e.type === 'SALE' && (cat === 'VAT10' || cat === 'VAT0') && !(g && g.genProd === 'FA');
    };
    var T = function (d) {
      var lo = minus12(d);
      return sum(E().vat.entries().filter(function (e) { return e.vatDate > lo && e.vatDate <= d && inScope(e) && !e.reversed; }), function (e) { return -(e.base + e.nonDeductibleBase); });
    };
    var level = function (t, d, vatReg) {
      var M = param('vat.registration_threshold_mandatory', d).value, V = param('vat.registration_threshold_voluntary', d).value;
      if (vatReg) return t < M ? 'BELOW_MANDATORY' : 'NONE';
      return t >= M ? 'CROSSED' : t * 10 >= M * 8 ? 'APPROACHING' : t >= V ? 'VOLUNTARY_ELIGIBLE' : 'NONE';
    };
    var t = T(asOf), M = param('vat.registration_threshold_mandatory', asOf), V = param('vat.registration_threshold_voluntary', asOf);
    var lo = minus12(asOf);
    var sales = E().vat.entries().filter(function (e) { return e.type === 'SALE' && e.vatDate > lo && e.vatDate <= asOf && !e.reversed; });
    var excluded = sales.filter(function (e) { return !inScope(e); });
    var months = {};
    sales.filter(inScope).forEach(function (e) { var k = e.vatDate.slice(0, 7); months[k] = (months[k] || 0) - (e.base + e.nonDeductibleBase); });
    var y = +asOf.slice(0, 4), series = [];
    for (var m = 1; m <= 12; m++) {
      var d = E().dates.endOfMonth(y + '-' + String(m).padStart(2, '0') + '-01');
      if (d >= asOf) break;
      series.push({ d: d, t: T(d), M: param('vat.registration_threshold_mandatory', d).value });
    }
    series.push({ d: asOf, t: t, M: M.value });
    return { asOf: asOf, from: lo, t: t, M: M, V: V, months: months, excluded: excluded, series: series,
      levelReg: level(t, asOf, true), levelNonReg: level(t, asOf, false), M2027: param('vat.registration_threshold_mandatory', '2027-07-01'),
      crossed: series.filter(function (s) { return s.t >= s.M; })[0] || null };
  }
  var LEVEL_TEXT = {
    BELOW_MANDATORY: ['info', 'BELOW_MANDATORY · W-TAX-04', 'НӨАТ төлөгч боловч эргэлт заавал бүртгүүлэх босгоос доогуур (мэдээлэл).'],
    NONE: ['neutral', 'NONE', 'Анхааруулах зүйлгүй.'],
    CROSSED: ['danger', 'CROSSED · W-TAX-02', 'Босгыг давсан — НӨАТ төлөгчөөр бүртгүүлэх үүрэгтэй.'],
    APPROACHING: ['warn', 'APPROACHING · W-TAX-01', 'Босгын 80%-д хүрсэн.'],
    VOLUNTARY_ELIGIBLE: ['info', 'VOLUNTARY_ELIGIBLE · W-TAX-03', 'Сайн дураар бүртгүүлэх боломжтой (≥ 10 сая ₮).']
  };
  function levelChip(l) { var x = LEVEL_TEXT[l]; return '<span class="pill ' + x[0] + '">' + ui.esc(x[1]) + '</span>'; }

  function thresholdCard() {
    var th = thresholdModel(today());
    var co = ERP.data.company;
    var pct = th.M.value ? Math.min(100, th.t / th.M.value * 100) : 0;
    var pct27 = th.t / th.M2027.value * 100;
    var html = '<div class="card" data-note="rt.vat-threshold"><div class="card-head"><h2>НӨАТ-ын бүртгэлийн босгын хяналт</h2>' + levelChip(co.vatRegistered ? th.levelReg : th.levelNonReg) + '</div><div class="card-body stack">' +
      '<p class="small">Сүүлийн 12 сарын (' + ui.date(E().dates.addDays(th.from, 1)) + '–' + ui.date(th.asOf) + ') татвар ногдох борлуулалт (VAT10 + VAT0, үндсэн хөрөнгийн борлуулалтгүй) ба тухайн өдрийн босго <code>vat.registration_threshold_mandatory</code>.</p>' +
      '<div class="rt-meter" role="meter" aria-valuemin="0" aria-valuemax="' + (th.M.value / 100) + '" aria-valuenow="' + (th.t / 100) + '" aria-label="12 сарын эргэлт босготой харьцуулахад" id="vat-meter">' +
      '<span class="rt-meter-bar" style="width:' + pct.toFixed(1) + '%"></span><span class="rt-meter-tick" style="left:80%" title="80% (APPROACHING)"></span></div>' +
      '<div class="rt-meter-legend"><span><strong class="tabular">' + fmtM(th.t, { sym: true }) + '</strong> эргэлт</span><span>' + pct.toFixed(1) + '% · босго ' + fmtM(th.M.value, { sym: true }) + ' (' + ui.date(th.M.from) + '–' + (th.M.to ? ui.date(th.M.to) : '') + ')</span></div>' +
      '<dl class="kv rt-kv">' +
      '<dt>Энэ компани</dt><dd>' + (co.vatRegistered ? 'НӨАТ төлөгч (' + ui.date(co.vatRegisteredFrom) + '-нээс)' : 'НӨАТ төлөгч биш') + '</dd>' +
      '<dt>Түвшин (НӨАТ төлөгч)</dt><dd>' + levelChip(th.levelReg) + '</dd>' +
      '<dt>Хэрэв НӨАТ төлөгч биш байсан бол</dt><dd>' + levelChip(th.levelNonReg) + '</dd>' +
      '<dt>Сайн дурын босго</dt><dd>' + fmtM(th.V.value, { sym: true }) + '</dd>' +
      '<dt>' + ui.date(th.M2027.from) + '-нээс (D-K5)</dt><dd>' + fmtM(th.M2027.value, { sym: true }) + ' → ижил эргэлт ' + pct27.toFixed(1) + '%</dd>' +
      '<dt>Давсан огноо (crossedOn)</dt><dd>' + (th.crossed ? ui.date(th.crossed.d) : 'алга') + '</dd></dl>' +
      '<p class="xs muted">Босгын хяналт vat_registered-ийг автоматаар өөрчлөхгүй (BR-TAX-88). Өгөгдөл ' + ui.date(co.goLiveDate) + '-нээс тул 12 сарын цонхны эхний хэсэг хоосон.</p>';
    html += ui.calc('Тооцоог харах: 12 сарын эргэлт T(d)',
      '<div class="formula">T(d) = Σ −(base + non_deductible_base),  SALE entry,  vat_date ∈ (' + ui.date(th.from) + ', ' + ui.date(th.asOf) + '],\n       ангилал ∈ {VAT10, VAT0},  gen_prod ≠ FA   (BR-TAX-83)\n\n' +
      Object.keys(th.months).sort().map(function (k) { return E().dates.monthLabel(k).padEnd(14, ' ') + fmtM(th.months[k]).padStart(18, ' '); }).join('\n') +
      '\n' + 'T'.padEnd(14, ' ') + fmtM(th.t).padStart(18, ' ') +
      '\nM(' + ui.date(th.asOf) + ') = ' + fmtM(th.M.value) + ';  T < M → ' + (th.t < th.M.value ? 'тийм' : 'үгүй') + ';  0.8·M = ' + fmtM(th.M.value * 0.8) + '</div>' +
      '<p>Хасагдсан ' + th.excluded.length + ' борлуулалтын entry (' + fmtM(-sum(th.excluded, function (e) { return e.base; }), { sym: true }) + '): чөлөөлөгдөх (EXEMPT) / хамрах хүрээнээс гадуур эсвэл ҮХ-ийн борлуулалт эргэлтэд орохгүй. Кредит нот тэмдгээрээ хасагдана.</p>' +
      '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Огноо (d)</th><th class="num">T(d)</th><th class="num">M(d)</th><th class="num">T / M</th></tr></thead><tbody>' +
      th.series.map(function (s) { return '<tr><td>' + ui.date(s.d) + '</td>' + ui.moneyCell(s.t) + ui.moneyCell(s.M) + '<td class="num">' + (s.t / s.M * 100).toFixed(1) + '%</td></tr>'; }).join('') + '</tbody></table></div>', 'vat-th-calc');
    html += '</div></div>';
    return html;
  }

  function renderVat(el, ctx) {
    if (ctx.rtVatPeriod) { vatState.period = ctx.rtVatPeriod; ctx.rtVatPeriod = null; }
    if (!vatState.period) vatState.period = defaultVatPeriod();
    var period = vatState.period;
    var vp = vatPeriodsList().filter(function (p) { return p.period === period; })[0];
    var co = ERP.data.company;
    if (!co.vatRegistered) {                           // UX-VAT-09
      el.innerHTML = '<div class="card"><div class="soon-card"><div class="big">НӨАТ төлөгч биш</div><p>Компанийн тохиргоонд vat_registered = false тул НӨАТ-ын тайлан гарахгүй (tax.company_not_vat_registered).</p></div></div>';
      return;
    }
    var rep = vatModel(period);
    var lastNo = E().vat.entries().reduce(function (mx, e) { return Math.max(mx, e.entryNo); }, 0);
    var cs = vatState.calc[period];
    if (!cs) cs = vatState.calc[period] = { at: ui.date(today()) + ' ' + nowHm(), lastNo: lastNo, scope: rep.entries.length + '|' + sum(rep.entries, function (e) { return e.amount + (e.deductibleConfirmed ? 1 : 0); }) };
    var added = E().vat.entries().filter(function (e) { return e.entryNo > cs.lastNo && e.vatDate.slice(0, 7) === period; }).length;
    var scopeNow = rep.entries.length + '|' + sum(rep.entries, function (e) { return e.amount + (e.deductibleConfirmed ? 1 : 0); });
    var stale = added > 0 || scopeNow !== cs.scope;
    var dl = daysLeft(vp.due);
    var unc = rep.entries.filter(function (e) { return e.type === 'PURCHASE' && e.calcType === 'NORMAL' && e.amount !== 0 && !e.deductibleConfirmed && !e.closed; });
    var docs = salesDocsOf(period);
    var ebBad = docs.filter(function (d) { return !d.ok; });
    var sub = vatState.submissions[period];
    var html = '<div class="page-head"><div class="title-wrap"><h1>НӨАТ-ын тайлан</h1><span class="pill neutral">ТТ-03а</span>' + ui.pill(vp.status) + '</div>' +
      '<span class="small muted">' + ui.date(vp.start) + '–' + ui.date(vp.end) + ' · Илгээх хугацаа: ' + ui.date(vp.due) + (vp.status === 'SUBMITTED' ? '' : ' (' + (dl >= 0 ? dl + ' хоног үлдсэн' : (-dl) + ' хоног хэтэрсэн') + ')') + '</span></div>';
    html += '<div class="card"><div class="card-body stack"><form class="rt-toolbar" id="vat-form">' +
      '<div class="field" data-note="rt.vat-period"><label for="vat-period">НӨАТ-ын үе</label><select class="select" id="vat-period">' +
      vatPeriodsList().map(function (p) { return '<option value="' + p.period + '"' + (p.period === period ? ' selected' : '') + '>' + ui.esc(E().dates.monthLabel(p.period)) + ' — ' + ui.esc(ui.pillLabel(p.status)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="rt-actions">' +
      '<button class="btn" type="button" id="vat-recalc">Дахин тооцоолох</button>' +
      '<button class="btn" type="button" id="vat-registers">ТТ-03а-5/6 бүртгэл</button>' +
      '<button class="btn" type="button" id="vat-entries">НӨАТ-ын бичилт</button>' +
      (vp.status === 'OPEN' ? '<button class="btn primary" type="button" id="vat-goto-settle">НӨАТ хаах…</button>' : '') +
      (vp.status === 'CLOSED' ? '<button class="btn primary" type="button" id="vat-submit">Илгээсэн гэж тэмдэглэх…</button>' : '') +
      '</div></form>' + vatStepper(vp, true) +
      '<p class="xs muted" data-note="rt.vat-stale">Тооцоолсон: ' + ui.esc(cs.at) + ' · ' + (stale ? '<strong class="rt-warn-text">Үүнээс хойш scope өөрчлөгдсөн (' + added + ' шинэ бичилт) — [Дахин тооцоолох]</strong>' : 'үүнээс хойш энэ үед 0 бичилт нэмэгдсэн') + ' · сүүлийн VAT entry №' + lastNo + '</p></div></div>';
    if (vp.status === 'SUBMITTED') {
      html += '<div class="banner" role="status"><strong>Илгээсэн</strong>' + (sub ? ': ' + ui.esc(sub.at) + ' · №' + ui.esc(sub.ref) + ' · ' + ui.esc(sub.by) : ' (жишээ түүх)') + '. Зөвхөн drill-down ба экспорт; бусад үйлдэл байхгүй (UX-VAT-07). Засварыг дараагийн нээлттэй үеийн баримтаар (BR-TAX-80).</div>';
    }
    // warnings (UX-VAT-04)
    var warn = '';
    if (unc.length) {
      warn += '<li data-note="rt.vat-unconfirmed"><strong>Баталгаажаагүй орцын НӨАТ:</strong> ' + unc.length + ' баримт, ' + fmtM(sum(unc, function (e) { return e.amount; }), { sym: true }) + ' — тайланд орохгүй (D-E4). ' +
        unc.map(function (e) { return '<button class="btn sm" type="button" data-vconfirm="' + ui.esc(e.documentNo) + '" id="vat-cf-' + ui.esc(e.documentNo) + '">' + ui.esc(e.documentNo) + ' баталгаажуулах</button>'; }).join(' ') + '</li>';
    }
    if (ebBad.length) {
      warn += '<li data-note="rt.vat-ebarimt"><strong>eBarimt-тэй тулгагдаагүй борлуулалт:</strong> ' + ebBad.map(function (d) { return ui.esc(d.p.no) + ' (' + ui.esc(ui.pillLabel(d.status)) + ')'; }).join(', ') + ' — хаалтыг зогсоохгүй (W-TAX-06). <a href="#ebarimt">eBarimt хяналт ›</a></li>';
    }
    if (warn) html += '<div class="banner warn rt-warnings"><strong>Анхааруулга (' + ((unc.length ? 1 : 0) + (ebBad.length ? 1 : 0)) + ')</strong><ul>' + warn + '</ul></div>';

    html += '<div class="rt-vat-grid">';
    html += '<div class="stack rt-vat-main">';
    html += '<div class="card" data-note="rt.vat-rows"><div class="card-head"><h2>ТТ-03а · ' + ui.esc(E().dates.monthLabel(period)) + '</h2><span class="small muted">' + rep.entries.length + ' VAT entry · мөрийн дүн дээр дарж задлана</span></div>' +
      '<div class="card-body flush">' + vatRowsTable(rep, period) + '</div></div>';
    // calculation
    var v = function (k) { return nz(rep.values[k]); };
    var rowCalc = rep.rows.filter(function (r) { return r.type === 'V'; }).map(function (r) {
      var raw = sum(r.entries, function (e) { return rowEntryValue(r, e); });
      return ('мөр ' + r.row).padEnd(7, ' ') + (r.genType + '/' + (r.vatBus || '*') + '/' + (r.vatProd || '*') + '/' + (r.category || '*')).padEnd(34, ' ') + (r.amountType + (r.confirmed ? '✓' : '')).padEnd(24, ' ') +
        ('Σ ' + fmtM(raw)).padStart(18, ' ') + (r.calcOpp ? ' × (−1)' : '       ') + ' = ' + fmtM(r.value).padStart(14, ' ') + (r.printOpp ? '  хэвлэх ' + fmtM(r.printValue) : '');
    }).join('\n');
    html += '<div data-note="rt.vat-calc">' + ui.calc('Тооцоог харах: мөр бүрийн тооцоо ба тэмдэг',
      '<p>VAT entry-ийн борлуулалт сөрөг, худалдан авалт эерэг (BC T254). <code>calculate_with = OPPOSITE_SIGN</code> мөрийг нийлбэрт орохоос өмнө эргүүлнэ; мөрийн нийлбэрт (R) хэрэглэхгүй (R-VAT-27); <code>print_with</code> зөвхөн харуулалт.</p>' +
      '<div class="formula">' + rowCalc + '\n\nмөр 6  = 1 + 3 + 4 + 5 = ' + fmtM(v('1')) + ' + ' + fmtM(v('3')) + ' + ' + fmtM(v('4')) + ' + ' + fmtM(v('5')) + ' = ' + fmtM(v('6')) +
      '\nмөр 12 = 8 + 9 + 10 = ' + fmtM(v('8')) + ' + ' + fmtM(v('9')) + ' + ' + fmtM(v('10')) + ' = ' + fmtM(v('12')) + '  (хэвлэх ' + fmtM(-v('12')) + ')' +
      '\nмөр 14 = 2 + 13 + 12 = ' + fmtM(v('2')) + ' + ' + fmtM(v('13')) + ' + (' + fmtM(v('12')) + ') = ' + fmtM(v('14')) + (v('14') >= 0 ? '  → төлөх' : '  → илүү төлсөн') + '</div>' +
      (unc.length ? '<p>Хэрэв баталгаажаагүй ' + unc.length + ' баримт (' + fmtM(sum(unc, function (e) { return e.amount; })) + ') баталгаажвал: мөр 8 = ' + fmtM(-(-v('8') + sum(unc, function (e) { return e.amount; }))) + ', мөр 14 = ' + fmtM(v('14') - sum(unc, function (e) { return e.amount; })) + '. Одоо орохгүй — D-E4, BR-TAX-45.</p>' : '') +
      '<p>Шалгалт (VAT-RETURN, #checks): мөр 14 = −Σ SALE.amount − Σ PURCHASE.amount [баталгаажсан] = ' + fmtM(-sum(rep.entries.filter(function (e) { return e.type === 'SALE'; }), function (e) { return e.amount; }) - sum(rep.entries.filter(function (e) { return e.type === 'PURCHASE' && e.deductibleConfirmed; }), function (e) { return e.amount; })) + (v('14') === -sum(rep.entries.filter(function (e) { return e.type === 'SALE'; }), function (e) { return e.amount; }) - sum(rep.entries.filter(function (e) { return e.type === 'PURCHASE' && e.deductibleConfirmed; }), function (e) { return e.amount; }) ? ' ✓' : ' ✕') + '</p>', 'vat-calc') + '</div>';
    // eBarimt reconciliation (FR-TAX-016)
    html += '<div class="card" data-note="rt.vat-ebarimt-rec"><div class="card-head"><h2>eBarimt-тэй тулгалт</h2><span class="small muted">' + (docs.length - ebBad.length) + ' / ' + docs.length + ' тулгагдсан</span></div><div class="card-body flush"><div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Баримт</th><th>Огноо</th><th>eBarimt</th><th class="num">Баримтын НӨАТ</th><th class="num">eBarimt totalVAT</th><th></th></tr></thead><tbody>' +
      (docs.length ? docs.map(function (d) { return '<tr><td class="code"><a href="#posted-invoice" data-posted="' + ui.esc(d.p.no) + '">' + ui.esc(d.p.no) + '</a></td><td>' + ui.date(d.p.postingDate) + '</td><td>' + ui.pill(d.status) + '</td>' + ui.moneyCell((d.isCm ? -1 : 1) * d.vat) + '<td class="num">' + (d.ebVat === null ? '—' : fmtM((d.isCm ? -1 : 1) * d.ebVat)) + '</td><td>' + (d.ok ? '<span class="check-mark pass" aria-label="тулгагдсан">✓</span>' : '<span class="check-mark fail" aria-label="тулгагдаагүй">✕</span>') + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="empty">Энэ үед борлуулалт алга</td></tr>') +
      '</tbody></table></div></div></div>';
    html += '</div>';                                    // .rt-vat-main
    // side: settlement / payment + threshold
    html += '<div class="stack rt-vat-side">';
    if (vp.status === 'OPEN') {
      var dflt = vatState.settleDate && vatState.settleDate.period === period ? vatState.settleDate.date : vp.end;
      var errs = settleCheck(vp, dflt);
      var prev = settlePreview(period, dflt);
      html += '<div class="card" id="vat-settle-card" data-note="rt.vat-settle"><div class="card-head"><h2>НӨАТ-ын хаалт (урьдчилсан)</h2>' + ui.pill('DRAFT', 'Preview') + '</div><div class="card-body stack">' +
        '<form id="vat-settle-form" class="stack"><div class="field"><label for="vat-settle-date">Хаалтын огноо</label>' + ui.dateInput('vat-settle-date', dflt) + '</div></form>' +
        ui.errList(errs, 'Хаах боломжгүй') + settlementPreviewHtml(prev) +
        '<p class="xs muted">Баталгаажаагүй орцын НӨАТ хаалтад орохгүй, дараагийн хаалтад баталгаажсаны дараа орно (BR-TAX-49). Preview нь дугаар зарцуулахгүй (BR-TAX-75).</p>' +
        '<button class="btn primary" type="button" id="vat-settle"' + (errs.length || !prev.ok ? ' disabled' : '') + '>НӨАТ хаах…</button></div></div>';
    } else {
      var txGl = vp.settlementTx ? E().state().glEntries.filter(function (g) { return g.transactionNo === vp.settlementTx; }) : [];
      var bal2310 = R().glBalance('2310', today());
      html += '<div class="card" data-note="rt.vat-settled"><div class="card-head"><h2>НӨАТ-ын хаалт</h2>' + ui.pill(vp.status) + '</div><div class="card-body stack">' +
        (txGl.length ? '<p class="small">Ваучер <code>' + ui.esc(txGl[0].documentNo) + '</code> · ' + ui.date(txGl[0].postingDate) + ' · гүйлгээ №' + vp.settlementTx + '</p><div class="formula">' +
          txGl.map(function (g) { return (g.amount > 0 ? 'Дт ' : 'Кт ') + g.account + ' ' + fmtM(Math.abs(g.amount)).padStart(16, ' ') + '  ' + (E().setup.account(g.account) || {}).name; }).join('\n') + '</div>' : '<p class="small">Хаалтын ваучергүй (G/L мөргүй).</p>') +
        '<dl class="kv"><dt>Үр дүн</dt><dd>' + (nz(vp.settlementNet) >= 0 ? 'төлөх ' : 'буцаан авах ') + fmtM(Math.abs(nz(vp.settlementNet)), { sym: true }) + '</dd><dt>2310-ийн үлдэгдэл (' + ui.date(today()) + ')</dt><dd>' + fmtM(-bal2310, { sym: true }) + (bal2310 < 0 ? ' төлөх' : bal2310 > 0 ? ' илүү' : '') + '</dd></dl>' +
        (bal2310 < 0 ? '<button class="btn" type="button" id="vat-pay">НӨАТ төлөх…</button>' : '') +
        '<p class="xs muted">VATSTMT гүйлгээг нийтийн буцаалтаар буцаахгүй; зөвхөн дахин нээх (BR-TAX-77, BR-TAX-79).</p></div></div>';
    }
    html += thresholdCard();
    html += '</div></div>';                              // .rt-vat-side, .rt-vat-grid
    el.innerHTML = html;

    ui.$('#vat-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    on('vat-period', 'change', function (ev) { vatState.period = ev.target.value; app.refresh(); refocus('vat-period'); });
    on('vat-recalc', 'click', function () { delete vatState.calc[period]; app.refresh(); refocus('vat-recalc'); ui.toast('ТТ-03а дахин тооцоологдлоо (хадгалахгүй, BR-TAX-69).'); });
    on('vat-registers', 'click', function () { registersModal(rep, period); });
    on('vat-entries', 'click', function () {
      ui.modal({ title: 'НӨАТ-ын бичилт — ' + E().dates.monthLabel(period), wide: true, body: '<p class="small">SETTLEMENT-ээс бусад, vat_date ∈ ' + period + '. Худалдан авалтын баталгаажаагүй entry ТТ-03а-д орохгүй.</p>' + vatEntriesTable(rep.entries) });
    });
    ui.$$('[data-vdd]', el).forEach(function (b) { b.addEventListener('click', function () { drillVat(rep, rep.rows[+b.getAttribute('data-vdd')]); }); });
    ui.$$('[data-vconfirm]', el).forEach(function (b) { b.addEventListener('click', function () { confirmInputModal(b.getAttribute('data-vconfirm')); }); });
    ui.$$('[data-posted]', el).forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); app.navigate('posted-invoice', { postedNo: a.getAttribute('data-posted') }); }); });
    var sf = ui.$('#vat-settle-form');
    if (sf) {
      sf.addEventListener('submit', function (ev) { ev.preventDefault(); });
      var di = ui.$('#vat-settle-date');
      di.addEventListener('change', function () {
        var iso = ui.parseDate(di.value);
        if (!iso) { di.classList.add('invalid'); ui.toast('Огноо ЖЖЖЖ.СС.ӨӨ хэлбэрээр оруулна уу.', 'error'); return; }
        vatState.settleDate = { period: period, date: iso }; app.refresh(); refocus('vat-settle-date');
      });
    }
    on('vat-goto-settle', 'click', function () { var c = document.getElementById('vat-settle-card'); if (c) { c.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); refocus('vat-settle-date'); } });
    on('vat-settle', 'click', function () {
      var date = vatState.settleDate && vatState.settleDate.period === period ? vatState.settleDate.date : vp.end;
      var pv = settlePreview(period, date);
      ui.confirm({ title: 'НӨАТ хаах — ' + E().dates.monthLabel(period), ok: 'Хаах', body: '<p>Огноо ' + ui.date(date) + '. Энэ үеийн ' + pv.plan.scope.length + ' VAT entry хаагдаж, үе CLOSED болно. ' +
        (pv.net >= 0 ? 'Төлөх НӨАТ ' : 'Буцаан авах ') + '<strong>' + fmtM(Math.abs(pv.net), { sym: true }) + '</strong>.</p>' + settlementPreviewHtml(pv) }).then(function (ok) {
        if (!ok) return;
        var r = E().vat.settle(period, date);
        if (!r.ok) { ui.toast('Хаалт амжилтгүй: ' + ui.esc((r.errors || []).map(function (e) { return e.code; }).join(', ')), 'error'); return; }
        var no = r.result ? r.result.vouchers[0].documentNo : '—';
        delete vatState.calc[period];
        ui.toast('НӨАТ хаагдлаа: ' + ui.esc(no) + ' · ' + E().dates.monthLabel(period) + ' CLOSED.');
        app.refresh();
      });
    });
    on('vat-pay', 'click', function () { payModal(period); });
    on('vat-submit', 'click', function () { submitModal(vp); });
  }

  function payModal(period) {
    var banks = ERP.data.bankAccounts.filter(function (b) { return b.kind === 'BANK'; });
    var state = { bank: banks[0].no, date: today() };
    var m = ui.modal({ title: 'НӨАТ төлөх — ' + E().dates.monthLabel(period), wide: true,
      body: '<form id="vat-pay-form" class="stack"><div class="form-grid"><div class="field"><label for="vat-pay-bank">Банкны данс</label><select class="select" id="vat-pay-bank">' +
        banks.map(function (b) { return '<option value="' + b.no + '">' + ui.esc(b.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="vat-pay-date">Огноо</label>' + ui.dateInput('vat-pay-date', state.date) + '</div></div><div id="vat-pay-prev"></div></form>',
      footer: [{ label: 'Болих' }, { label: 'Төлөх (BP ваучер)', kind: 'primary', id: 'vat-pay-ok', onClick: function (close) {
        var r = E().vat.pay(period, state.date, state.bank);
        if (!r.ok) { ui.$('#vat-pay-prev', m.el).innerHTML = ui.errList(r.errors, 'Төлж чадсангүй'); return; }
        delete vatState.calc[period];
        close(true); ui.toast(r.skipped ? 'Төлөх НӨАТ алга.' : 'НӨАТ төлөгдлөө: ' + ui.esc(r.result.vouchers[0].documentNo)); app.refresh();
      } }] });
    var upd = function () {
      var r = E().vat.pay(period, state.date, state.bank, { preview: true });
      var box = ui.$('#vat-pay-prev', m.el);
      if (!r.ok) { box.innerHTML = ui.errList(r.errors, 'Урьдчилан харах боломжгүй'); return; }
      if (r.skipped) { box.innerHTML = '<p class="small">2310-д төлөх үлдэгдэл алга.</p>'; return; }
      var v = r.result.vouchers[0];
      box.innerHTML = '<p class="small">BR-TAX-81: Дт 2310 / Кт банк, НӨАТ-гүй мөр. Дүн = 2310-ийн кредит үлдэгдэл (' + ui.date(state.date) + ').</p><div class="formula">' +
        v.gl.map(function (g) { return (g.amount > 0 ? 'Дт ' : 'Кт ') + g.account + ' ' + fmtM(Math.abs(g.amount)).padStart(16, ' ') + '  ' + (E().setup.account(g.account) || {}).name; }).join('\n') + '</div>';
    };
    ui.$('#vat-pay-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); });
    ui.$('#vat-pay-bank', m.el).addEventListener('change', function (ev) { state.bank = ev.target.value; upd(); });
    ui.$('#vat-pay-date', m.el).addEventListener('change', function (ev) { var iso = ui.parseDate(ev.target.value); if (iso) { state.date = iso; ev.target.classList.remove('invalid'); upd(); } else ev.target.classList.add('invalid'); });
    upd();
  }

  function submitModal(vp) {
    var ap = E().periods.list().filter(function (p) { return p.period === vp.period; })[0];
    var m = ui.modal({ title: 'Илгээсэн гэж тэмдэглэх — ' + E().dates.monthLabel(vp.period),
      body: '<form id="vat-sub-form" class="stack"><p>ТТ-03а-г e-tax (etax.mta.mn)-д гараар илгээсний дараа тэмдэглэнэ. Буцаагдахгүй: үе SUBMITTED болж, тайлангийн мөрүүд ба scopeVersion өөрчлөгдөхгүйгээр бүртгэгдэнэ (BR-TAX-78).</p>' +
        '<div class="field"><label class="req" for="vat-sub-ref">e-tax-ийн баримтын дугаар (submission_reference)</label><input class="input mono" id="vat-sub-ref" maxlength="100" autocomplete="off" placeholder="жишээ: ТТ03А-2026-09-000123"></div>' +
        '<div class="field"><label class="req" for="vat-sub-type">Баталгаажуулахын тулд ИЛГЭЭСЭН гэж бичнэ үү</label><input class="input" id="vat-sub-type" autocomplete="off"></div>' +
        '<div class="banner"><strong>Үр дагавар (effects):</strong> ' + (ap && ap.status === 'CLOSED' ? 'SUGGEST_GL_PERIOD_LOCK — ' + E().dates.monthLabel(vp.period) + '-ын нягтлан бодох үеийг түгжих санал (автомат биш, Z-TAX-04).' : 'нягтлан бодох үе (' + (ap ? ui.pillLabel(ap.status) : '—') + ') хаагдаагүй тул түгжих санал алга.') + ' MFA + step-up (прототипт загварчилсан).</div>' +
        '<div id="vat-sub-err"></div></form>',
      footer: [{ label: 'Болих' }, { label: 'Илгээсэн гэж тэмдэглэх', kind: 'danger', id: 'vat-sub-ok', onClick: function (close) {
        var ref = ui.$('#vat-sub-ref', m.el).value.trim(), typed = ui.$('#vat-sub-type', m.el).value.trim();
        var errs = [];
        if (!ref) errs.push({ code: 'tax.submission_reference_required', message: 'Баримтын дугаар заавал.' });
        if (typed !== 'ИЛГЭЭСЭН') errs.push({ code: 'ui.confirmation_text_mismatch', message: '"ИЛГЭЭСЭН" гэж яг бичнэ үү.' });
        if (vp.status !== 'CLOSED') errs.push({ code: 'tax.vat_period_not_closed', message: 'Үе хаагдаагүй.' });
        if (errs.length) { ui.$('#vat-sub-err', m.el).innerHTML = ui.errList(errs, 'Тэмдэглэх боломжгүй'); return; }
        vp.status = 'SUBMITTED';                       // helper: the engine has no submit API (see return notes)
        vatState.submissions[vp.period] = { ref: ref, at: ui.date(today()) + ' ' + nowHm(), by: ERP.app.state.role === 'OWNER' ? 'Б. Наранбаатар' : 'Д. Сарнай' };
        close(true); ui.toast('ТТ-03а илгээсэн гэж тэмдэглэгдлээ: №' + ui.esc(ref)); app.refresh();
      } }] });
    ui.$('#vat-sub-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); ui.$('#vat-sub-ok', m.el).click(); });
    ui.$('#vat-sub-ref', m.el).focus();
  }

  // ===========================================================================
  // 4. #setup — company setup wizard (S-PLT-06, 15 §10.2–10.3, §16.10)
  // ===========================================================================
  var STEPS = [
    ['profile', 'Профайл'], ['tax', 'Татвар'], ['golive', 'Эхлэх огноо'], ['coa', 'Дансны төлөвлөгөө'], ['series', 'Цуврал'],
    ['bank', 'Касс, банк'], ['ebarimt', 'eBarimt'], ['users', 'Хэрэглэгч'], ['ob', 'Эхний үлдэгдэл'], ['summary', 'Хураангуй']
  ];
  var BANKS = ['Хаан банк', 'Голомт банк', 'Худалдаа хөгжлийн банк', 'Хас банк', 'Төрийн банк', 'Бусад'];
  var OWNER_EMAIL = 'owner@example.mn';
  var wz = null;
  var wzTimers = [];
  function wzInit() {
    var series = {};
    SERIES_DEF.forEach(function (s) { series[s[0]] = s[3]; });
    wz = { step: 0, max: 0, errors: [], info: null, infoLoading: false, provision: null,
      d: { legalName: '', legalForm: 'LLC', regNo: '0000777', tin: '00000000777', address: 'Улаанбаатар, жишээ дүүрэг, 3-р хороо, Жишээ гудамж 12',
        district: '2501', phone: '7711-0000', email: 'info@example.mn', director: 'Г. Тэмүүжин', chief: 'Д. Сарнай',
        vatRegistered: null, vatFrom: '2024-05-01', cityTax: false, standard: 'IFRS_FOR_SMES', decimals: '2',
        goLive: '2026-10-01', postFrom: '2026-10-01', series: series,
        banks: [{ bank: 'Хаан банк', acct: '5000000123', cur: 'MNT' }],
        posNo: '001', branchNo: '001', env: 'STAGING',
        invites: [{ email: 'sarnai@example.mn', role: 'ACCOUNTANT', expires: '' }],
        ob: 'excel', fail: false } };
  }
  function clearTimers() { wzTimers.forEach(function (t) { clearTimeout(t); }); wzTimers = []; }

  // simulated eBarimt getInfo (12 SET-01/02) — fictional responses only
  function getInfo(tin) {
    if (tin === '00000000000') return { found: false };
    if (tin === '00000000777') return { found: true, name: 'Жишээ Трейд ХХК', vatPayer: true, cityPayer: false };
    return { found: true, name: 'Жишээ татвар төлөгч (ТТД …' + tin.slice(-4) + ')', vatPayer: +tin.slice(-1) % 2 === 0, cityPayer: false };
  }
  function tinError(d) {
    var t = d.tin.trim();
    if (!t) return 'ТТД заавал.';
    if (d.legalForm === 'SOLE_PROPRIETOR') return /^\d{12,14}$/.test(t) ? null : 'Хувь хүний ТТД 12–14 оронтой (FR-PLT-002).';
    return /^\d{11}$/.test(t) ? null : 'ААН-ийн ТТД 11 оронтой байна (FR-PLT-002 AC1).';
  }
  var OB_SAMPLE = [                                    // fictional Excel template rows for the new company (D-D7, 02 §14.8)
    { acc: '1100', kind: 'Мөнгөний данс', party: 'CASH01', doc: '', dr: 125000000, cr: 0 },
    { acc: '1110', kind: 'Мөнгөний данс', party: 'Хаан банк …0123', doc: '', dr: 1840000000, cr: 0 },
    { acc: '1200', kind: 'Харилцагч', party: 'Жишээ Үйлчилгээ ХХК', doc: 'НЭХ-0912', dr: 220000000, cr: 0 },
    { acc: '1200', kind: 'Харилцагч', party: 'Жишээ Сургууль ТББ', doc: 'НЭХ-0927', dr: 165000000, cr: 0 },
    { acc: '1400', kind: 'G/L', party: '', doc: '', dr: 630000000, cr: 0 },
    { acc: '1630', kind: 'G/L', party: '', doc: '', dr: 480000000, cr: 0 },
    { acc: '1690', kind: 'G/L', party: '', doc: '', dr: 0, cr: 120000000 },
    { acc: '2100', kind: 'Нийлүүлэгч', party: 'Жишээ Нийлүүлэгч ХХК', doc: 'Б-0918', dr: 0, cr: 275000000 },
    { acc: '2310', kind: 'G/L', party: '', doc: '', dr: 0, cr: 64000000 },
    { acc: '3100', kind: 'G/L', party: '', doc: '', dr: 0, cr: 1000000000 },
    { acc: '3400', kind: 'G/L', party: '', doc: '', dr: 0, cr: 2001000000 }
  ];

  function wzValidate(i) {
    var d = wz.d, errs = [];
    var add = function (field, code, message) { errs.push({ field: field, code: code, message: message }); };
    var key = STEPS[i][0];
    if (key === 'profile') {
      if (!d.legalName.trim()) add('wz-name', 'platform.legal_name_required', 'Хуулийн нэр заавал.');
      var te = tinError(d); if (te) add('wz-tin', 'platform.tin_invalid', te);
      if (d.legalForm !== 'SOLE_PROPRIETOR' && d.regNo && !/^\d{7}$/.test(d.regNo)) add('wz-regno', 'platform.registration_no_invalid', 'Улсын бүртгэлийн дугаар 7 оронтой (ААН).');
      if (d.district && !/^\d{4}$/.test(d.district)) add('wz-district', 'platform.district_code_invalid', 'Дүүргийн код 4 оронтой.');
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) add('wz-email', 'ui.email_invalid', 'Имэйл буруу.');
    } else if (key === 'tax') {
      if (d.vatRegistered === null) add('wz-vat-yes', 'tax.vat_registered_required', 'НӨАТ төлөгч эсэхийг сонгоно уу.');
      if (d.vatRegistered && !d.vatFrom) add('wz-vat-from', 'tax.vat_registered_from_required', 'НӨАТ төлөгч болсон огноо заавал (BR-TAX-56).');
    } else if (key === 'golive') {
      if (!d.goLive) add('wz-golive', 'ui.invalid_date', 'Огноо ЖЖЖЖ.СС.ӨӨ хэлбэрээр.');
      else if (d.goLive >= E().dates.addDays(today(), 365)) add('wz-golive', 'platform.go_live_too_far', 'Ашиглалтад орох огноо өнөөдрөөс хойш 1 жилээс бага байна.');
      if (d.postFrom && d.goLive && d.postFrom > d.goLive) add('wz-postfrom', 'platform.posting_window_invalid', 'Posting цонх go-live-аас хойш эхэлж болохгүй.');
    } else if (key === 'series') {
      var seen = {};
      SERIES_DEF.forEach(function (s) {
        if (s[2] === 'M') return;
        var p = (d.series[s[0]] || '').trim();
        var id = 'wz-ser-' + s[0];
        if (!/^[A-ZА-ЯӨҮЁ0-9-]{1,6}$/.test(p)) add(id, 'platform.number_series_prefix_invalid', s[0] + ': угтвар 1–6 том үсэг/тоо.');
        else if (seen[p]) add(id, 'platform.number_series_prefix_duplicate', s[0] + ': угтвар "' + p + '" давхардсан (' + seen[p] + ').');
        seen[p] = s[0];
      });
    } else if (key === 'bank') {
      var acc = {};
      d.banks.forEach(function (b, k) {
        if (!/^\d{6,20}$/.test(b.acct)) add('wz-bank-acct-' + k, 'bank.account_no_invalid', (k + 1) + '-р данс: дансны дугаар 6–20 оронтой тоо.');
        else if (acc[b.acct]) add('wz-bank-acct-' + k, 'bank.account_no_duplicate', (k + 1) + '-р данс давхардсан (FR-BNK-001).');
        acc[b.acct] = true;
      });
    } else if (key === 'ebarimt') {
      if (!/^\d{3}$/.test(d.posNo)) add('wz-pos', 'ebarimt.pos_no_invalid', 'POS дугаар 3 оронтой.');
      if (!/^\d{3}$/.test(d.branchNo)) add('wz-branch', 'ebarimt.branch_no_invalid', 'Салбарын дугаар 3 оронтой.');
      if (!/^\d{4}$/.test(d.district)) add('wz-eb-district', 'ebarimt.district_code_invalid', 'districtCode 4 оронтой.');
    } else if (key === 'users') {
      var em = {};
      d.invites.forEach(function (u, k) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) add('wz-inv-email-' + k, 'ui.email_invalid', (k + 1) + '-р урилга: имэйл буруу.');
        else if (u.email.toLowerCase() === OWNER_EMAIL) add('wz-inv-email-' + k, 'platform.invite_self', 'Өөрийгөө урихгүй.');
        else if (em[u.email.toLowerCase()]) add('wz-inv-email-' + k, 'platform.invite_duplicate', 'Имэйл давхардсан.');
        em[u.email.toLowerCase()] = true;
        if (u.role === 'EXTERNAL_ACCOUNTANT' && !u.expires) add('wz-inv-exp-' + k, 'platform.invite_expiry_required', 'Гэрээт нягтланд хугацаа (expires_at) заана (13 CR-02).');
      });
    }
    return errs;
  }

  function stepperHtml() {
    return '<ol class="rt-stepper rt-wiz-steps" data-note="rt.wiz-steps">' + STEPS.map(function (s, i) {
      var st = i === wz.step ? 'cur' : i <= wz.max ? 'done' : 'todo';
      var inner = '<span class="rt-step-mark" aria-hidden="true">' + (st === 'done' ? '✓' : st === 'cur' ? '●' : '○') + '</span><span>' + (i + 1) + ' ' + s[1] + '</span>';
      return '<li class="is-' + st + '"' + (st === 'cur' ? ' aria-current="step"' : '') + '>' + (st === 'done' ? '<button type="button" class="rt-step-btn" data-wzgo="' + i + '" id="wz-go-' + i + '">' + inner + '</button>' : inner) + '</li>';
    }).join('') + '</ol>';
  }
  function fld(id, label, inner, opts) {
    opts = opts || {};
    var err = wz.errors.filter(function (e) { return e.field === id; })[0];
    return '<div class="field' + (opts.wide ? ' rt-wide' : '') + '"' + (opts.note ? ' data-note="' + opts.note + '"' : '') + '><label' + (opts.req ? ' class="req"' : '') + ' for="' + id + '">' + label + '</label>' + inner +
      (err ? '<span class="rt-ferr" id="' + id + '-err">' + ui.esc(err.message) + '</span>' : opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + '</div>';
  }
  function inp(id, val, extra) {
    var err = wz.errors.some(function (e) { return e.field === id; });
    return '<input class="input' + (err ? ' invalid' : '') + '" id="' + id + '" value="' + ui.esc(val) + '"' + (err ? ' aria-invalid="true" aria-describedby="' + id + '-err"' : '') + (extra || '') + '>';
  }

  function stepBody(key) {
    var d = wz.d, h = '';
    if (key === 'profile') {
      h += '<div class="form-grid">' +
        fld('wz-name', 'Хуулийн нэр', inp('wz-name', d.legalName, ' autocomplete="organization"'), { req: true, wide: true }) +
        fld('wz-legalform', 'Хуулийн хэлбэр', '<select class="select" id="wz-legalform">' + [['LLC', 'ХХК'], ['JSC', 'ХК'], ['NGO', 'ТББ'], ['SOLE_PROPRIETOR', 'Хувь хүн бизнес эрхлэгч']].map(function (o) { return '<option value="' + o[0] + '"' + (d.legalForm === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>') +
        fld('wz-regno', 'Улсын бүртгэлийн дугаар', inp('wz-regno', d.regNo, ' inputmode="numeric" maxlength="7"'), { hint: 'ААН-д 7 орон' }) +
        '<div class="field rt-tin" data-note="rt.wiz-getinfo"><label class="req" for="wz-tin">ТТД</label><div class="row" style="flex-wrap:nowrap">' + inp('wz-tin', d.tin, ' inputmode="numeric" maxlength="14" autocomplete="off"') +
        '<button class="btn" type="button" id="wz-getinfo">ТТД-ээр татах</button></div>' +
        (wz.errors.filter(function (e) { return e.field === 'wz-tin'; }).map(function (e) { return '<span class="rt-ferr" id="wz-tin-err">' + ui.esc(e.message) + '</span>'; }).join('') || '<span class="hint">ААН 11 орон · хувь хүн 12–14 орон</span>') + '</div>' +
        fld('wz-address', 'Хаяг', inp('wz-address', d.address), { wide: true }) +
        fld('wz-district', 'Дүүргийн код (district_code)', inp('wz-district', d.district, ' inputmode="numeric" maxlength="4"'), { hint: '4 орон (eBarimt districtCode)' }) +
        fld('wz-phone', 'Утас', inp('wz-phone', d.phone, ' autocomplete="tel"')) +
        fld('wz-email', 'Имэйл', inp('wz-email', d.email, ' autocomplete="email"')) +
        fld('wz-director', 'Захирал', inp('wz-director', d.director)) +
        fld('wz-chief', 'Ерөнхий нягтлан', inp('wz-chief', d.chief)) + '</div>';
      h += '<div id="wz-info-box">' + infoBox() + '</div>';
    } else if (key === 'tax') {
      var radio = function (name, id, val, cur, label) { return '<label class="checkbox" for="' + id + '"><input type="radio" name="' + name + '" id="' + id + '" value="' + val + '"' + (cur ? ' checked' : '') + '> ' + label + '</label>'; };
      var verr = wz.errors.filter(function (e) { return e.field === 'wz-vat-yes'; })[0];
      h += '<div class="form-grid">' +
        '<fieldset class="field rt-fs" data-note="rt.wiz-tax"><legend class="flabel req">НӨАТ төлөгч эсэх</legend><div class="row">' + radio('wz-vat', 'wz-vat-yes', '1', d.vatRegistered === true, 'Тийм') + radio('wz-vat', 'wz-vat-no', '0', d.vatRegistered === false, 'Үгүй') + '</div>' +
        (verr ? '<span class="rt-ferr">' + ui.esc(verr.message) + '</span>' : '') + '</fieldset>' +
        (d.vatRegistered ? fld('wz-vat-from', 'НӨАТ төлөгч болсон огноо', ui.dateInput('wz-vat-from', d.vatFrom), { req: true }) : '') +
        '<fieldset class="field rt-fs"><legend class="flabel">НХАТ төлөгч эсэх</legend><div class="row">' + radio('wz-city', 'wz-city-yes', '1', d.cityTax === true, 'Тийм') + radio('wz-city', 'wz-city-no', '0', d.cityTax === false, 'Үгүй') + '</div></fieldset>' +
        fld('wz-std', 'Тайлагналын суурь', '<select class="select" id="wz-std"><option value="IFRS_FOR_SMES"' + (d.standard === 'IFRS_FOR_SMES' ? ' selected' : '') + '>ЖДҮ-ийн СТОУС (IFRS for SMEs)</option><option value="IFRS"' + (d.standard === 'IFRS' ? ' selected' : '') + '>СТОУС (бүрэн)</option></select>', { req: true }) +
        fld('wz-dec', 'Тайлангийн бутархай орон', '<select class="select" id="wz-dec"><option value="2"' + (d.decimals === '2' ? ' selected' : '') + '>2</option><option value="0"' + (d.decimals === '0' ? ' selected' : '') + '>0</option></select>', { hint: 'D-C2: тайлан 0 эсвэл 2 оронтой' }) + '</div>';
      if (wz.info && wz.info.found) {
        var mm = d.vatRegistered !== null && wz.info.vatPayer !== d.vatRegistered, cm = wz.info.cityPayer !== d.cityTax;
        h += '<div class="banner' + (mm || cm ? ' warn' : '') + '" role="status">ⓘ eBarimt-аас: "НӨАТ төлөгч: ' + (wz.info.vatPayer ? 'Тийм' : 'Үгүй') + '", "НХАТ төлөгч: ' + (wz.info.cityPayer ? 'Тийм' : 'Үгүй') + '" (' + ui.esc(wz.info.checkedAt) + ' шалгасан) — ' +
          (mm || cm ? '<strong>зөрүүтэй.</strong> eBarimt идэвхжүүлэх боломжгүй болно (12 SET-02, ebarimt.vat_status_mismatch).' : 'таны сонголттой таарч байна ✓') + '</div>';
      } else h += '<p class="hint">ТТД-ээр татаагүй тул eBarimt-тай харьцуулаагүй (алхам 1).</p>';
      h += '<div class="banner" data-note="rt.wiz-threshold">ⓘ 2027-07-01-нээс НӨАТ-ын заавал бүртгүүлэх босго 50 сая → 400 сая ₮ болно (D-K5, tax_parameter). Сонголтыг дараа нь өөрчилж болно; НӨАТ төлөгч бус бол 10%-ийн VAT setup хасагдахгүй 100%-тай үүснэ (D-E5).</div>';
    } else if (key === 'golive') {
      var y = d.goLive ? +d.goLive.slice(0, 4) : +today().slice(0, 4);
      var mid = d.goLive && d.goLive.slice(5) !== '01-01';
      h += '<div class="form-grid">' + fld('wz-golive', 'Ашиглалтад орох огноо (go_live_date)', ui.dateInput('wz-golive', d.goLive), { req: true, note: 'rt.wiz-golive' }) +
        fld('wz-postfrom', 'Posting цонх: эхлэх (allow_posting_from)', ui.dateInput('wz-postfrom', d.postFrom), { hint: 'Анхдагч: go-live-ийн сарын 1; дуусах — хоосон' }) + '</div>' +
        '<div class="card rt-inset"><div class="card-body"><dl class="kv left rt-kv"><dt>Үүсэх санхүүгийн жил</dt><dd>' + y + ' ба ' + (y + 1) + ' (12 сар тус бүр; хасах боломжгүй — UX-WIZ-03)</dd>' +
        '<dt>Эхний үлдэгдлийн огноо</dt><dd>' + (d.goLive ? ui.date(E().dates.addDays(d.goLive, -1)) + (mid ? ' (оны дунд эхэлж байгаа тул go-live − 1, 02 §14.8)' : ' (go-live − 1)') : '—') + '</dd>' +
        '<dt>Хуулийн дугаарлалт</dt><dd>' + y + ' ба ' + (y + 1) + ' оны цувралын мөр (SI-' + y + '-00001 …)</dd></dl></div></div>';
    } else if (key === 'coa') {
      var rows = ERP.data.coaRows, cnt = { P: 0, H: 0, B: 0, E: 0 };
      rows.forEach(function (r) { cnt[r[1]] = (cnt[r[1]] || 0) + 1; });
      h += '<fieldset class="field rt-fs" data-note="rt.wiz-coa"><legend class="flabel req">Загвар</legend><label class="checkbox" for="wz-coa-mn"><input type="radio" name="wz-coa" id="wz-coa-mn" checked> MN стандарт (4 оронтой, Маягт А-гийн харгалзаатай) — R1-д ганц загвар</label></fieldset>' +
        '<div class="rt-counts"><span><strong>' + rows.length + '</strong> данс</span><span><strong>' + cnt.P + '</strong> бичилтийн</span><span><strong>' + cnt.H + '</strong> гарчиг</span><span><strong>' + cnt.B + '</strong> эхлэл</span><span><strong>' + cnt.E + '</strong> төгсгөл</span></div>' +
        '<div class="table-wrap rt-coa-prev" tabindex="0" aria-label="Дансны төлөвлөгөөний урьдчилсан харагдац (уншихаар)"><table class="grid-table rt-gt"><thead><tr><th>Данс</th><th>Нэр</th><th>Төрөл</th><th>Маягт А</th><th>МГТ</th><th>Шууд бичилт</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var t = { P: 'Бичилт', H: 'Гарчиг', B: 'Эхлэл', E: 'Төгсгөл' }[r[1]];
          return '<tr class="rt-coa-' + r[1] + '"><td class="code">' + r[0] + '</td><td style="padding-left:' + (10 + r[7] * 12) + 'px">' + ui.esc(r[2]) + '</td><td class="xs">' + t + '</td><td class="code xs">' + ui.esc(r[8] || '') + '</td><td class="xs">' + ui.esc(r[9] || '') + '</td><td class="xs">' + (r[1] === 'P' ? (r[5] ? 'Тийм' : 'Үгүй') : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else if (key === 'series') {
      var yy = (d.goLive || today()).slice(0, 4);
      var ex = function (s) { var p = (d.series[s[0]] || '').trim(); return s[2] === 'L' ? p + '-' + yy + '-' + '1'.padStart(s[4], '0') : s[2] === 'D' ? p + '1'.padStart(s[4], '0') : s[3] + '1'.padStart(s[4], '0'); };
      h += '<p class="small" data-note="rt.wiz-series">Хуулийн баримтын цуврал завсаргүй, жил бүр шинээр, гараар дугаарлахгүй (D-C7). Угтварыг анхны хэрэглээнээс өмнө л засна.</p>' +
        '<div class="table-wrap"><table class="grid-table rt-gt rt-series"><thead><tr><th>Код</th><th>Баримт</th><th>Угтвар</th><th>Жишээ</th><th>Төрөл</th></tr></thead><tbody>' +
        SERIES_DEF.map(function (s) {
          var id = 'wz-ser-' + s[0], err = wz.errors.some(function (e) { return e.field === id; });
          return '<tr><td class="code">' + s[0] + '</td><td>' + ui.esc(s[1]) + '</td><td>' + (s[2] === 'M' ? '<span class="code">' + s[3] + '</span>' :
            '<label class="sr-only" for="' + id + '">' + s[0] + ' угтвар</label><input class="input mono rt-prefix' + (err ? ' invalid' : '') + '" id="' + id + '" value="' + ui.esc(d.series[s[0]]) + '" maxlength="6" autocomplete="off" data-ser="' + s[0] + '">') + '</td>' +
            '<td class="code" id="' + id + '-ex">' + ui.esc(ex(s)) + '</td><td class="xs">' + (s[2] === 'L' ? '<span class="rt-tag">Завсаргүй</span> жил бүр' : s[2] === 'D' ? 'Ноорог (завсартай)' : 'Мастер, гараар зөвшөөрнө') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else if (key === 'bank') {
      var glFor = function (k) { return k === 0 ? '1110 · BANK_MNT' : k === 1 ? '1111 · BANK_MNT_2' : '1112 + BANK_MNT_3 (шинээр нэмнэ)'; };
      h += '<div class="card rt-inset"><div class="card-body small"><strong>Касс:</strong> CASH01 "Үндсэн касс" · 1100 · МХ-1 <code>KO</code> / МХ-2 <code>KZ</code> · сөрөг үлдэгдэл хориотой (D-G1) — автоматаар үүснэ.</div></div>' +
        '<div class="table-wrap" data-note="rt.wiz-bank"><table class="grid-table rt-gt rt-banks"><thead><tr><th>Банк</th><th>Дансны дугаар</th><th>Валют</th><th>G/L данс (автомат)</th><th>Импортын preset</th><th></th></tr></thead><tbody>' +
        d.banks.map(function (b, k) {
          var aerr = wz.errors.some(function (e) { return e.field === 'wz-bank-acct-' + k; });
          return '<tr><td><label class="sr-only" for="wz-bank-name-' + k + '">Банк</label><select class="select" id="wz-bank-name-' + k + '" data-bk="' + k + '" data-bf="bank">' + BANKS.map(function (x) { return '<option' + (x === b.bank ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td>' +
            '<td><label class="sr-only" for="wz-bank-acct-' + k + '">Дансны дугаар</label><input class="input mono' + (aerr ? ' invalid' : '') + '" id="wz-bank-acct-' + k + '" inputmode="numeric" value="' + ui.esc(b.acct) + '" data-bk="' + k + '" data-bf="acct"></td>' +
            '<td><label class="sr-only" for="wz-bank-cur-' + k + '">Валют</label><select class="select" id="wz-bank-cur-' + k + '" data-bk="' + k + '" data-bf="cur"><option>MNT</option><option disabled>USD (R2)</option></select></td>' +
            '<td class="code xs">' + glFor(k) + '</td><td class="xs">' + ui.esc(b.bank === 'Бусад' ? 'ерөнхий CSV' : b.bank) + '</td>' +
            '<td><button class="btn ghost sm" type="button" data-bkdel="' + k + '" id="wz-bank-del-' + k + '" aria-label="' + (k + 1) + '-р дансыг хасах">✕</button></td></tr>';
        }).join('') + (d.banks.length ? '' : '<tr><td colspan="6" class="empty">Банкны данс алга — дараа нэмж болно (алгасах боломжтой).</td></tr>') + '</tbody></table></div>' +
        '<button class="btn" type="button" id="wz-bank-add">+ Банкны данс нэмэх</button><p class="hint">Нэг G/L данс = нэг мөнгөн данс (FR-BNK-001 AC2). Банкны бүлэг: CASH_MNT 1100, BANK_MNT 1110, BANK_MNT_2 1111 …</p>';
    } else if (key === 'ebarimt') {
      var info = wz.info && wz.info.found ? wz.info : null;
      var mismatch = info && (info.vatPayer !== !!d.vatRegistered || info.cityPayer !== d.cityTax);
      h += '<div class="form-grid" data-note="rt.wiz-ebarimt">' +
        fld('wz-eb-tin', 'Мерчантын ТТД', '<input class="input mono" id="wz-eb-tin" value="' + ui.esc(d.tin) + '" readonly>', { hint: 'company_setup.tin (SET-01)' }) +
        fld('wz-eb-district', 'districtCode', inp('wz-eb-district', d.district, ' inputmode="numeric" maxlength="4"'), { req: true, hint: 'Дүүрэг/хороо (getBranchInfo)' }) +
        fld('wz-branch', 'Салбарын дугаар (branchNo)', inp('wz-branch', d.branchNo, ' inputmode="numeric" maxlength="3"'), { req: true }) +
        fld('wz-pos', 'POS дугаар (posNo)', inp('wz-pos', d.posNo, ' inputmode="numeric" maxlength="3"'), { req: true, hint: 'Касстай холбоотой POS 001' }) +
        fld('wz-env', 'Орчин', '<select class="select" id="wz-env"><option value="STAGING" selected>STAGING (туршилт)</option><option value="PRODUCTION" disabled>PRODUCTION — тусдаа баталгаажуулалттай (UX-ONB-11)</option></select>') + '</div>' +
        '<div class="banner' + (mismatch ? ' warn' : '') + '">' + (info ? (mismatch ? '⚠ getInfo-ийн НӨАТ/НХАТ төлөв профайлтай зөрүүтэй — идэвхжүүлэх хориотой (SET-02).' : '✓ getInfo ба профайл таарч байна (SET-02).') : 'ТТД-ээр татаагүй — идэвхжүүлэхийн өмнө eBarimt wizard (S-EBR-01) getInfo-г дахин шалгана.') +
        ' Provisioning нь ebarimt_setup-ийг <code>enabled = false</code>, STAGING-ээр үүсгэнэ; операторын бүртгэлийн (saveOprMerchants) дараа eBarimt wizard-аар асаана.</div>';
    } else if (key === 'users') {
      h += '<p class="small">Та (Эзэмшигч, OWNER = ERP_SUPER): <code>' + OWNER_EMAIL + '</code>. Урилгыг имэйлээр илгээж, хүлээн авахад role оноогдоно (platform.fn_accept_invitation).</p>' +
        '<div class="table-wrap" data-note="rt.wiz-users"><table class="grid-table rt-gt rt-invites"><thead><tr><th>Имэйл</th><th>Role</th><th>Хугацаа (expires_at)</th><th></th></tr></thead><tbody>' +
        d.invites.map(function (u, k) {
          var eerr = wz.errors.some(function (e) { return e.field === 'wz-inv-email-' + k; }), xerr = wz.errors.some(function (e) { return e.field === 'wz-inv-exp-' + k; });
          return '<tr><td><label class="sr-only" for="wz-inv-email-' + k + '">Имэйл</label><input class="input' + (eerr ? ' invalid' : '') + '" id="wz-inv-email-' + k + '" type="email" value="' + ui.esc(u.email) + '" data-ik="' + k + '" data-if="email" autocomplete="off"></td>' +
            '<td><label class="sr-only" for="wz-inv-role-' + k + '">Role</label><select class="select" id="wz-inv-role-' + k + '" data-ik="' + k + '" data-if="role">' + ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === u.role ? ' selected' : '') + '>' + ui.esc(r[1]) + '</option>'; }).join('') + '</select></td>' +
            '<td>' + (u.role === 'EXTERNAL_ACCOUNTANT' ? '<label class="sr-only" for="wz-inv-exp-' + k + '">Хугацаа</label>' + ui.dateInput('wz-inv-exp-' + k, u.expires, ' data-ik="' + k + '" data-if="expires"' + (xerr ? ' aria-invalid="true"' : '')) : '<span class="muted xs">хугацаагүй</span>') + '</td>' +
            '<td><button class="btn ghost sm" type="button" data-invdel="' + k + '" id="wz-inv-del-' + k + '" aria-label="' + (k + 1) + '-р урилгыг хасах">✕</button></td></tr>';
        }).join('') + (d.invites.length ? '' : '<tr><td colspan="4" class="empty">Урилгагүй — "Ганцаараа ажиллана" (алгасах боломжтой).</td></tr>') + '</tbody></table></div>' +
        '<button class="btn" type="button" id="wz-inv-add">+ Хэрэглэгч урих</button>' +
        '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Built-in role</th><th>Эрх (seed)</th></tr></thead><tbody><tr><td><strong>Эзэмшигч</strong> <span class="code xs">OWNER</span></td><td class="small">Зөвхөн ERP_SUPER — бүх эрх, хэрэглэгч, хаасан үе нээх (D-D3)</td></tr>' +
        ROLES.map(function (r) { return '<tr><td>' + ui.esc(r[1]) + ' <span class="code xs">' + r[0] + '</span></td><td class="small">' + ui.esc(r[2]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    } else if (key === 'ob') {
      var opt = function (v, label, sub) { return '<label class="rt-choice" for="wz-ob-' + v + '"><input type="radio" name="wz-ob" id="wz-ob-' + v + '" value="' + v + '"' + (d.ob === v ? ' checked' : '') + '><span><strong>' + label + '</strong><span class="xs muted">' + sub + '</span></span></label>'; };
      h += '<fieldset class="rt-choices" data-note="rt.wiz-ob"><legend class="flabel">Эхний үлдэгдэл</legend>' + opt('later', 'Дараа оруулна', 'Нүүрийн "Эхлэх алхмууд"-д сануулна') + opt('excel', 'Excel загвараар', 'S-PLT-19 импорт → OB ваучер') + opt('manual', 'Гараар журналаар', 'S-GL-05 эхний үлдэгдлийн журнал') + '</fieldset>';
      if (d.ob === 'excel') h += obPreview();
      else h += '<p class="hint">Зөвхөн сонголт хадгална; оруулалт wizard-ийн дараа (15 §10.2, алхам 8).</p>';
    } else if (key === 'summary') {
      h += summaryHtml();
    }
    return h;
  }
  function infoBox() {
    if (wz.infoLoading) return '<p class="small" role="status">⟳ eBarimt getInfo?tin=' + ui.esc(wz.d.tin) + ' …</p>';
    var i = wz.info;
    if (!i) return '<p class="hint">[ТТД-ээр татах] нь eBarimt-ийн getInfo-оос нэр, НӨАТ/НХАТ төлөгч эсэхийг санал болгоно (прототипт загварчилсан хариу).</p>';
    if (!i.found) return '<div class="banner warn" role="status">getInfo: ТТД ' + ui.esc(i.tin) + ' олдсонгүй. Нэрийг гараар оруулна уу.</div>';
    return '<div class="card rt-inset" role="status"><div class="card-body"><dl class="kv left rt-kv"><dt>getInfo (' + ui.esc(i.checkedAt) + ')</dt><dd>ТТД ' + ui.esc(i.tin) + '</dd><dt>Нэр</dt><dd>' + ui.esc(i.name) + '</dd><dt>НӨАТ төлөгч</dt><dd>' + (i.vatPayer ? 'Тийм' : 'Үгүй') + '</dd><dt>НХАТ төлөгч</dt><dd>' + (i.cityPayer ? 'Тийм' : 'Үгүй') + '</dd></dl>' +
      (wz.d.legalName !== i.name ? '<button class="btn sm" type="button" id="wz-use-name">Нэрийг ашиглах</button>' : '<span class="xs muted">Нэр хэрэглэгдсэн ✓ · НӨАТ/НХАТ төлөвийг алхам 2-т санал болгоно (UX-WIZ-02)</span>') + '</div></div>';
  }
  function obPreview() {
    var dr = sum(OB_SAMPLE, function (r) { return r.dr; }), cr = sum(OB_SAMPLE, function (r) { return r.cr; });
    var date = wz.d.goLive ? E().dates.addDays(wz.d.goLive, -1) : '';
    var checks = [];
    checks.push(['Тэнцэл Σ Дт = Σ Кт', dr === cr, fmtM(dr) + ' / ' + fmtM(cr), 'FR-GL-007']);
    var bad = OB_SAMPLE.filter(function (r) { var a = E().setup.account(r.acc); return !a || a.type !== 'POSTING'; });
    checks.push(['Данс бүр бичилтийн данс', !bad.length, bad.length ? bad.map(function (r) { return r.acc; }).join(', ') : OB_SAMPLE.length + ' мөр', 'ERG01']);
    var ctrl = OB_SAMPLE.filter(function (r) { var a = E().setup.account(r.acc); return a && !a.direct && r.kind === 'G/L'; });
    checks.push(['Хяналтын данс (1100, 1110, 1200, 2100) зөвхөн мөнгөний данс / харилцагч / нийлүүлэгчийн мөрөөр', !ctrl.length, ctrl.length ? ctrl.map(function (r) { return r.acc; }).join(', ') : 'тийм', 'FR-GL-003']);
    var docs = OB_SAMPLE.filter(function (r) { return (r.kind === 'Харилцагч' || r.kind === 'Нийлүүлэгч') && !r.doc; });
    checks.push(['Авлага, өглөг баримт тус бүрээр (насжилтад)', !docs.length, OB_SAMPLE.filter(function (r) { return r.doc; }).length + ' баримт', 'D-D7']);
    return '<div class="card rt-inset"><div class="card-head"><h3>Импортын урьдчилсан харагдац — OB-' + (date ? date.slice(0, 4) : '') + '-00001 · ' + ui.date(date) + ' · source OPENING</h3></div><div class="card-body flush">' +
      '<div class="table-wrap"><table class="grid-table rt-gt"><thead><tr><th>Данс</th><th>Нэр</th><th>Мөрийн төрөл</th><th>Харьцагч / данс</th><th>Баримт</th><th class="num">Дебит</th><th class="num">Кредит</th></tr></thead><tbody>' +
      OB_SAMPLE.map(function (r) { var a = E().setup.account(r.acc); return '<tr><td class="code">' + r.acc + '</td><td>' + ui.esc(a ? a.name : '?') + '</td><td class="xs">' + r.kind + '</td><td class="xs">' + ui.esc(r.party) + '</td><td class="code xs">' + ui.esc(r.doc) + '</td>' + ui.moneyCell(r.dr, { blankZero: true }) + ui.moneyCell(r.cr, { blankZero: true }) + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="5">Σ</td>' + ui.moneyCell(dr) + ui.moneyCell(cr) + '</tr></tfoot></table></div>' +
      '<div class="rt-checks">' + checks.map(function (c) { return '<div class="rt-check-item"><span class="check-mark ' + (c[1] ? 'pass' : 'fail') + '" aria-hidden="true">' + (c[1] ? '✓' : '✕') + '</span><span>' + ui.esc(c[0]) + '<span class="xs muted"> · ' + ui.esc(c[2]) + ' · ' + c[3] + '</span></span>' + ui.pill(c[1] ? 'PASS' : 'FAIL') + '</div>'; }).join('') + '</div>' +
      '<p class="xs muted rt-pad">Жишээ Excel-ийн мөр (зохиомол). Импорт бүр posting engine-ээр явна (02 §14.8); 1100/1110 мөр мөнгөний дансаар, 1200/2100 мөр харилцагч/нийлүүлэгчийн нээлттэй баримтаар бичигдэнэ. Wizard зөвхөн сонголтыг хадгалж, импортыг дараа хийнэ.</p></div></div>';
  }
  function summaryHtml() {
    var d = wz.d, y = (d.goLive || today()).slice(0, 4);
    var formName = { LLC: 'ХХК', JSC: 'ХК', NGO: 'ТББ', SOLE_PROPRIETOR: 'Хувь хүн' }[d.legalForm];
    var line = function (label, val, steps) {
      return '<div class="rt-sum-row"><dt>' + label + '</dt><dd>' + val + '</dd><dd class="rt-sum-edit">' + steps.map(function (s) { return '<button type="button" class="btn ghost sm" data-wzgo="' + s + '" id="wz-edit-' + s + '">Засах ' + (s + 1) + ' ›</button>'; }).join('') + '</dd></div>';
    };
    var h = '<dl class="rt-summary" data-note="rt.wiz-summary">' +
      line('Компани', ui.esc(d.legalName || '—') + ' · ТТД ' + ui.esc(d.tin) + ' · ' + formName + ' · ' + (d.vatRegistered ? 'НӨАТ төлөгч (' + ui.date(d.vatFrom) + '-нээс)' : 'НӨАТ төлөгч биш') + (d.cityTax ? ' · НХАТ төлөгч' : ''), [0, 1]) +
      line('Ашиглалтад орох', ui.date(d.goLive) + ' · Санхүүгийн жил: ' + y + ', ' + (+y + 1) + ' · Posting цонх: ' + ui.date(d.postFrom) + '–', [2]) +
      line('Дансны төлөвлөгөө ба цуврал', 'MN стандарт (4 оронтой, 182 данс) · ' + ['SI', 'KO', 'KZ'].map(function (k) { return ui.esc(d.series[k]) + '-' + y + '-'; }).join(', ') + ' …', [3, 4]) +
      line('Касс ба банк', 'CASH01 Үндсэн касс' + (d.banks.length ? ' · ' + d.banks.map(function (b) { return ui.esc(b.bank) + ' …' + ui.esc(b.acct.slice(-4)) + ' (MNT)'; }).join(', ') : ' · банкгүй'), [5]) +
      line('eBarimt', 'POS ' + ui.esc(d.posNo) + ' · салбар ' + ui.esc(d.branchNo) + ' · district ' + ui.esc(d.district) + ' · STAGING, enabled = false', [6]) +
      line('Урих ба эхний үлдэгдэл', (d.invites.length ? d.invites.map(function (u) { return ui.esc(u.email) + ' (' + ui.esc((ROLES.filter(function (r) { return r[0] === u.role; })[0] || [0, u.role])[1]) + ')'; }).join(', ') : 'урилгагүй') + ' · Эхний үлдэгдэл: ' + { later: 'дараа', excel: 'Excel-ээр дараа', manual: 'гараар журналаар' }[d.ob], [7, 8]) +
      '</dl>';
    h += '<div id="wz-prov">' + provCard() + '</div>' +
      '<div class="row"><label class="checkbox" for="wz-fail"><input type="checkbox" id="wz-fail"' + (d.fail ? ' checked' : '') + '> Туршилт: <code>number_series</code> алхамд алдаа гаргах</label></div>';
    return h;
  }
  function provCard() {
    var p = wz.provision, y = (wz.d.goLive || today()).slice(0, 4);
    return '<div class="card rt-inset" data-note="rt.wiz-provision"><div class="card-head"><h3>platform.fn_provision_company_mn — нэг DB transaction</h3>' + (p ? ui.pill(p.state === 'done' ? 'SUCCESS' : p.state === 'failed' ? 'ERROR' : 'SENT', p.state === 'done' ? 'Амжилттай' : p.state === 'failed' ? 'ROLLBACK' : 'Үүсгэж байна') : '') + '</div><div class="card-body flush">' +
      '<ol class="rt-prov">' + PROVISION_STEPS.map(function (s, i) {
        var st = !p ? 'todo' : p.state === 'failed' && i < p.at ? 'rolled' : p.state === 'failed' && i === p.at ? 'err' : i < p.at || p.state === 'done' ? 'done' : i === p.at ? 'run' : 'todo';
        var mark = { todo: '○', run: '⟳', done: '✓', err: '✕', rolled: '↺' }[st];
        return '<li class="is-' + st + '"><span class="rt-prov-mark" aria-hidden="true">' + mark + '</span><span class="rt-prov-name"><code>' + s[0] + '</code> ' + ui.esc(s[1]) + '<span class="xs muted"> · ' + ui.esc(s[3]) + '</span></span><span class="rt-prov-n tabular">' + (st === 'done' ? s[2] : st === 'rolled' ? '0' : '') + '</span></li>';
      }).join('') + '</ol>' +
      (p && p.state === 'failed' ? '<div class="errlist rt-pad" role="alert"><h3>Юу ч үүсээгүй (FR-PLT-003 AC2)</h3><p>Алдаа: <code>number_series</code> алхамд ERN01 (загварчилсан). Transaction бүхэлдээ ROLLBACK — өмнөх ' + p.at + ' алхмын мөр хадгалагдаагүй. Ижил сонголтоор, шинэ Idempotency-Key-ээр дахин оролдоно (UX-ONB-04).</p></div>' : '') +
      (p && p.state === 'done' ? '<div class="banner rt-pad" role="status"><strong>Компани бэлэн боллоо.</strong> Хариу: <code>{"fiscal_year": ' + y + ', "total_inserted": 800+}</code> (seed_checks.sql: эхний provisioning &gt; 800 мөр; давтан дуудлага 0 — idempotent). Прототипт шинэ компани руу шилжихгүй; "' + ui.esc(ERP.data.company.name) + '" жишээ компани хэвээр.</div>' : '') +
      '</div></div>';
  }

  function renderSetup(el) {
    if (!wz) wzInit();
    leaveSetup();
    var s = STEPS[wz.step], last = wz.step === STEPS.length - 1;
    var html = '<div class="page-head"><div class="title-wrap"><h1>Компани тохируулах</h1><span class="pill neutral">PROVISIONING</span></div>' +
      '<button class="btn" type="button" id="wz-save-exit">Хадгалаад гарах</button></div>';
    html += '<div class="card rt-wizard"><div class="card-body stack">' + stepperHtml() + '</div>' +
      '<form class="rt-wiz-body stack" id="wz-step-form" novalidate><h2 id="wz-step-title" tabindex="-1">' + (wz.step + 1) + '. ' + ui.esc(stepTitle(s[0])) + '</h2>' +
      ui.errList(wz.errors.filter(function (e) { return e.code; }), 'Дараах алхам руу шилжих боломжгүй — засна уу') + stepBody(s[0]) +
      '<div class="rt-wiz-foot"><button class="btn" type="button" id="wz-back"' + (wz.step === 0 ? ' disabled' : '') + '>‹ Буцах</button>' +
      (last ? '<button class="btn primary" type="button" id="wz-create"' + (wz.provision && wz.provision.state === 'run' ? ' disabled' : '') + '>' + (wz.provision && wz.provision.state === 'failed' ? 'Дахин оролдох' : wz.provision && wz.provision.state === 'done' ? 'Дахин ажиллуулах (idempotent)' : 'Компани үүсгэх') + '</button>' :
        '<button class="btn primary" type="submit" id="wz-next">Дараах › <span class="kbd">Enter</span></button>') + '</div></form></div>';
    el.innerHTML = html;
    bindSetup(el);
  }
  function stepTitle(k) {
    return { profile: 'Компанийн профайл', tax: 'Татварын профайл', golive: 'Ашиглалтад орох огноо', coa: 'Дансны төлөвлөгөө', series: 'Дугаарын цуврал',
      bank: 'Касс ба банкны данс', ebarimt: 'eBarimt: POS, салбар, districtCode', users: 'Хэрэглэгч урих', ob: 'Эхний үлдэгдэл', summary: 'Хураангуй ба үүсгэх' }[k];
  }
  function goStep(i) { wz.errors = []; wz.step = i; app.refresh(); refocus('wz-step-title'); }
  function bindSetup(el) {
    var d = wz.d;
    var form = ui.$('#wz-step-form');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (STEPS[wz.step][0] === 'summary') return;
      var errs = wzValidate(wz.step);
      wz.errors = errs;
      if (errs.length) { app.refresh(); var f = document.getElementById(errs[0].field); if (f) f.focus(); return; }
      wz.step += 1; wz.max = Math.max(wz.max, wz.step); app.refresh(); refocus('wz-step-title');
    });
    on('wz-back', 'click', function () { if (wz.step > 0) goStep(wz.step - 1); });
    ui.$$('[data-wzgo]', el).forEach(function (b) { b.addEventListener('click', function () { goStep(+b.getAttribute('data-wzgo')); }); });
    on('wz-save-exit', 'click', function () { ui.toast('Хадгалагдлаа (прототип: хуудасны санах ойд). Нүүрээс "Үргэлжлүүлэх" (UX-ONB-03).'); app.navigate('home'); });
    var bindText = function (id, key, parse) {
      on(id, 'input', function (ev) { d[key] = parse ? parse(ev.target.value) : ev.target.value; });
    };
    var bindDate = function (id, key) {
      on(id, 'change', function (ev) { var iso = ui.parseDate(ev.target.value); if (iso) { d[key] = iso; ev.target.classList.remove('invalid'); } else { d[key] = ''; ev.target.classList.add('invalid'); } });
    };
    // step 1
    bindText('wz-name', 'legalName'); bindText('wz-regno', 'regNo'); bindText('wz-address', 'address'); bindText('wz-phone', 'phone');
    bindText('wz-email', 'email'); bindText('wz-director', 'director'); bindText('wz-chief', 'chief');
    bindText('wz-tin', 'tin', function (v) { return v.replace(/\D/g, ''); });
    bindText('wz-district', 'district', function (v) { return v.replace(/\D/g, ''); });
    on('wz-legalform', 'change', function (ev) { d.legalForm = ev.target.value; });
    on('wz-getinfo', 'click', function () {
      var te = tinError(d);
      if (te) { wz.errors = [{ field: 'wz-tin', code: 'platform.tin_invalid', message: te }]; app.refresh(); refocus('wz-tin'); return; }
      wz.errors = []; wz.infoLoading = true; ui.$('#wz-info-box').innerHTML = infoBox();
      var done = function () {
        var r = getInfo(d.tin); r.tin = d.tin; r.checkedAt = ui.date(today()) + ' ' + nowHm();
        wz.info = r; wz.infoLoading = false;
        if (r.found && d.vatRegistered === null) d.vatRegistered = r.vatPayer;   // suggestion for step 2 (UX-WIZ-02)
        if (r.found) d.cityTax = r.cityPayer;
        var box = document.getElementById('wz-info-box'); if (box) { box.innerHTML = infoBox(); bindUseName(); app.decorateNotes(); }
      };
      if (reduced()) done(); else wzTimers.push(setTimeout(done, 650));
    });
    var bindUseName = function () { on('wz-use-name', 'click', function () { d.legalName = wz.info.name; app.refresh(); refocus('wz-name'); }); };
    bindUseName();
    // step 2
    ['wz-vat-yes', 'wz-vat-no'].forEach(function (id) { on(id, 'change', function (ev) { d.vatRegistered = ev.target.value === '1'; wz.errors = []; app.refresh(); refocus(id); }); });
    ['wz-city-yes', 'wz-city-no'].forEach(function (id) { on(id, 'change', function (ev) { d.cityTax = ev.target.value === '1'; app.refresh(); refocus(id); }); });
    bindDate('wz-vat-from', 'vatFrom');
    on('wz-std', 'change', function (ev) { d.standard = ev.target.value; });
    on('wz-dec', 'change', function (ev) { d.decimals = ev.target.value; });
    // step 3
    on('wz-golive', 'change', function (ev) {
      var iso = ui.parseDate(ev.target.value);
      if (!iso) { d.goLive = ''; ev.target.classList.add('invalid'); return; }
      d.goLive = iso; d.postFrom = iso.slice(0, 8) + '01'; app.refresh(); refocus('wz-golive');
    });
    bindDate('wz-postfrom', 'postFrom');
    // step 5
    ui.$$('[data-ser]', el).forEach(function (i) {
      i.addEventListener('input', function () {
        var code = i.getAttribute('data-ser'); i.value = i.value.toUpperCase(); d.series[code] = i.value;
        var s = SERIES_DEF.filter(function (x) { return x[0] === code; })[0], y = (d.goLive || today()).slice(0, 4);
        var ex = document.getElementById('wz-ser-' + code + '-ex');
        if (ex) ex.textContent = s[2] === 'L' ? i.value + '-' + y + '-' + '1'.padStart(s[4], '0') : i.value + '1'.padStart(s[4], '0');
      });
    });
    // step 6
    ui.$$('[data-bk]', el).forEach(function (i) {
      i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', function () {
        var k = +i.getAttribute('data-bk'), f = i.getAttribute('data-bf');
        d.banks[k][f] = f === 'acct' ? i.value.replace(/\D/g, '') : i.value;
        if (i.tagName === 'SELECT') { app.refresh(); refocus(i.id); }
      });
    });
    ui.$$('[data-bkdel]', el).forEach(function (b) { b.addEventListener('click', function () { d.banks.splice(+b.getAttribute('data-bkdel'), 1); wz.errors = []; app.refresh(); refocus('wz-bank-add'); }); });
    on('wz-bank-add', 'click', function () { d.banks.push({ bank: 'Голомт банк', acct: '', cur: 'MNT' }); app.refresh(); refocus('wz-bank-acct-' + (d.banks.length - 1)); });
    // step 7
    bindText('wz-eb-district', 'district', function (v) { return v.replace(/\D/g, ''); });
    bindText('wz-branch', 'branchNo', function (v) { return v.replace(/\D/g, ''); });
    bindText('wz-pos', 'posNo', function (v) { return v.replace(/\D/g, ''); });
    // step 8
    ui.$$('[data-ik]', el).forEach(function (i) {
      var k = +i.getAttribute('data-ik'), f = i.getAttribute('data-if');
      if (f === 'expires') i.addEventListener('change', function () { var iso = ui.parseDate(i.value); d.invites[k].expires = iso || ''; i.classList.toggle('invalid', !iso); });
      else if (f === 'role') i.addEventListener('change', function () { d.invites[k].role = i.value; app.refresh(); refocus(i.id); });
      else i.addEventListener('input', function () { d.invites[k].email = i.value.trim(); });
    });
    ui.$$('[data-invdel]', el).forEach(function (b) { b.addEventListener('click', function () { d.invites.splice(+b.getAttribute('data-invdel'), 1); wz.errors = []; app.refresh(); refocus('wz-inv-add'); }); });
    on('wz-inv-add', 'click', function () { d.invites.push({ email: '', role: 'VIEWER', expires: '' }); app.refresh(); refocus('wz-inv-email-' + (d.invites.length - 1)); });
    // step 9
    ['later', 'excel', 'manual'].forEach(function (v) { on('wz-ob-' + v, 'change', function () { d.ob = v; app.refresh(); refocus('wz-ob-' + v); }); });
    // step 10
    on('wz-fail', 'change', function (ev) { d.fail = ev.target.checked; });
    on('wz-create', 'click', function () {
      for (var i = 0; i < STEPS.length - 1; i++) {     // full re-validation before provisioning
        var errs = wzValidate(i);
        if (errs.length) { wz.errors = errs; wz.step = i; app.refresh(); ui.toast('Алхам ' + (i + 1) + '-д алдаа байна.', 'error'); var f = document.getElementById(errs[0].field); if (f) f.focus(); return; }
      }
      runProvision();
    });
  }
  function failIndex() { return wz.d.fail ? PROVISION_STEPS.map(function (s) { return s[0]; }).indexOf('number_series') : -1; }
  function finishProvision(announce) {                  // complete at once (reduced motion, or the user left the step)
    var failAt = failIndex();
    wz.provision = failAt >= 0 ? { state: 'failed', at: failAt } : { state: 'done', at: PROVISION_STEPS.length };
    if (announce) provToast();
  }
  function provToast() {
    if (wz.provision.state === 'failed') ui.toast('Компани үүсгэх амжилтгүй — юу ч хадгалагдаагүй.', 'error');
    else ui.toast('Компани бэлэн боллоо. Туршилтын нэхэмжлэх үүсгэж үзээрэй.');
  }
  function leaveSetup() {
    clearTimers();
    if (wz && wz.provision && wz.provision.state === 'run') finishProvision(false);
    if (wz) wz.infoLoading = false;
  }
  function runProvision() {
    var failAt = failIndex();
    if (reduced()) { finishProvision(true); app.refresh(); refocus('wz-create'); return; }
    wz.provision = { state: 'run', at: 0 };
    var paint = function () { var box = document.getElementById('wz-prov'); if (box) { box.innerHTML = provCard(); app.decorateNotes(); } };
    var tick = function () {
      var p = wz.provision;
      if (failAt >= 0 && p.at === failAt) { p.state = 'failed'; app.refresh(); refocus('wz-create'); provToast(); return; }
      p.at += 1;
      if (p.at >= PROVISION_STEPS.length) { p.state = 'done'; app.refresh(); refocus('wz-create'); provToast(); return; }
      paint();
      wzTimers.push(setTimeout(tick, 110));
    };
    var b = document.getElementById('wz-create'); if (b) b.disabled = true;
    paint();
    wzTimers.push(setTimeout(tick, 110));
  }

  // ===========================================================================
  // registration
  // ===========================================================================
  app.registerScreen({ route: 'financial-statements', title: 'Санхүүгийн тайлан (Маягт А)', crumbs: [['Тайлан'], ['Санхүүгийн тайлан']], owner: 'js/screens/reports-tax.js',
    intro: ['Маягт А-гийн дөрвөн тайлан — СБТ, ОДТ, ӨӨТ, МГТ (шууд арга) — seed-ийн мөрийн тодорхойлолт (дансны шүүлтүүр, томьёо, МГТ ангилал)-оор ерөнхий дэвтрээс шууд тооцогдоно; тоо хатуу бичигдээгүй.',
      'Эзэн ба нягтлан сар, жилийн эцэст шалгаж, жилд нэг удаа e-balance-д мянган төгрөгөөр шивнэ. "Мянган ₮" горим нь эхлээд мөр бүрийг бөөрөнхийлөөд дараа нь нийлбэрлэж, зөрүүг тусгай мөрөнд гаргана (D-C2).',
      'Энэ дэлгэц юу ч батлахгүй: тоон дээр дарж данс, гүйлгээ рүү задална; тайлан хоорондын шалгалт (баланс, ӨӨТ = СБТ 2.2, МГТ = мөнгө) доор харагдана.'],
    render: renderFs });
  app.registerScreen({ route: 'vat-return', title: 'НӨАТ-ын тайлан (ТТ-03а)', crumbs: [['Татвар'], ['НӨАТ-ын тайлан']], owner: 'js/screens/reports-tax.js',
    intro: ['Сарын ТТ-03а-гийн мөрүүдийг seed-ийн VAT statement загвараар НӨАТ-ын бичилтээс (VAT entry) тооцно. Орцын НӨАТ зөвхөн нийлүүлэгчийн ДДТД баталгаажсан үед хасагдана (D-E4).',
      'Нягтлан хянаад "НӨАТ хаах" дарахад 2300/1300-ийн үлдэгдэл 2310 "НӨАТ-ын тооцоо" руу хаагдаж (VATSTMT ваучер), үе CLOSED болно; e-tax-д илгээсний дараа "Илгээсэн" гэж тэмдэглэнэ. Баруун талд бүртгэлийн босгын хяналт.'],
    render: renderVat });
  app.registerScreen({ route: 'setup', title: 'Компани тохируулах', crumbs: [['Тохиргоо'], ['Компани тохируулах']], owner: 'js/screens/reports-tax.js',
    intro: ['Шинэ компанийг Эзэмшигч 10 алхмаар тохируулна: профайл (ТТД-ээр eBarimt getInfo), татвар, эхлэх огноо, дансны төлөвлөгөө, цуврал, касс/банк, eBarimt, хэрэглэгч, эхний үлдэгдэл.',
      'Сүүлийн алхамд <code>platform.fn_provision_company_mn</code> нэг DB transaction-д 182 данс, 19 НӨАТ-ын тохиргоо, 26 цуврал, 2 санхүүгийн жил гэх мэтийг үүсгэнэ — алдаа гарвал юу ч үлдэхгүй. Прототипт жишээ компани руу шилжихгүй, зөвхөн урсгалыг харуулна.'],
    render: renderSetup, onLeave: leaveSetup });

  // read-only helpers for other screens / debugging
  ERP.reportsTax = { buildModel: buildModel, roundModel: roundModel, crossChecks: function (asOf) { return crossChecks(allModels(asOf || today()), null); }, threshold: thresholdModel };
})();
