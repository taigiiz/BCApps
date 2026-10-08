#!/usr/bin/env node
/* =============================================================================
   tests/engine_check.js — loads js/data.js + js/engine.js (+ the note files) in a vm context with a fake window,
   boots the engine and asserts the invariants, known numbers from the specs, posting behaviour and the
   explanation-note references. Run:  node docs/features/mn-micro-erp/prototype/tests/engine_check.js
   ========================================================================== */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.resolve(ROOT, '..');
const ctx = { console, Set, Map, BigInt, JSON, Math, Date, Number, String, Object, Array, Error, RegExp, setTimeout: () => 0 };
ctx.window = ctx; ctx.ERP = undefined;
vm.createContext(ctx);
const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
// data, engine, annotations and notes only (no DOM needed)
for (const f of scripts.filter((s) => /js\/(data|engine|annotations)\.js$|js\/notes\//.test(s))) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const ERP = ctx.window.ERP;
const E = ERP.engine;
E.boot();

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS  ' + name + (detail ? '  — ' + detail : '')); }
  else { failed++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const M = E.money, fmt = (c) => M.fmt(c);

// ---------------------------------------------------------------- 1. invariants after boot
for (const c of E.invariants()) check('[boot] ' + c.id + ' ' + c.name, c.pass, c.detail);

// ---------------------------------------------------------------- 2. money arithmetic (06 §6.1)
check('round half away from zero: 2.345 → 2.35', M.toCents('2.345') === 235);
check('round half away from zero: -2.345 → -2.35', M.toCents('-2.345') === -235);
check('round 0.005 → 0.01', M.toCents('0.005') === 1);
check('roundDiv(-5, 2) = -3 (away from zero)', M.roundDiv(-5n, 2n) === -3n);
check('money format uses narrow NBSP grouping and ₮', M.fmt(123456789, { sym: true }) === '1 234 567.89 ₮', JSON.stringify(M.fmt(123456789, { sym: true })));

// ---------------------------------------------------------------- 3. spec examples (06 §6.2–6.5)
function calc(piv, lines) { return E.calcDocument({ side: 'SALE', docType: 'INVOICE', pricesInclVat: piv, vatBus: 'DOMESTIC', genBus: 'DOMESTIC', lines }); }
let c = calc(false, [{ type: 'GL_ACCOUNT', no: '5110', qty: '3', price: '333.335', disc: '10' }]);
check('FR-SAL-003 AC1: 3 × 333.335 → G 1 000.01, LDA 100.00, LA 900.01', c.lines[0].G === 100001 && c.lines[0].LDA === 10000 && c.lines[0].LA === 90001, fmt(c.lines[0].G) + ' / ' + fmt(c.lines[0].LDA) + ' / ' + fmt(c.lines[0].LA));
c = calc(false, [1, 2, 3].map(() => ({ type: 'GL_ACCOUNT', no: '5110', qty: '1', price: '100.05' })));
check('Example 6-A: VAT 30.02 allocated 10.01 / 10.00 / 10.01', c.vatAmount === 3002 && c.lines.map((l) => l.vatAmount).join() === '1001,1000,1001', c.lines.map((l) => fmt(l.vatAmount)).join(' / '));
c = calc(true, [{ type: 'GL_ACCOUNT', no: '5100', qty: '3', price: '11000' }, { type: 'GL_ACCOUNT', no: '5100', qty: '7', price: '1999' }]);
check('Example 6-B (prices incl. VAT): VAT 4 272.09 → 3 000.00 + 1 272.09; base 42 720.91',
  c.vatAmount === 427209 && c.lines[0].vatAmount === 300000 && c.lines[1].vatAmount === 127209 && c.amount === 4272091, fmt(c.vatAmount) + ' base ' + fmt(c.amount));
c = calc(false, [{ type: 'GL_ACCOUNT', no: '5110', qty: '1', price: '1000.05' }, { type: 'GL_ACCOUNT', no: '5110', qty: '1', price: '-100.03' }]);
check('Example 6-C (negative line, carry): document VAT 90.00', c.vatAmount === 9000, fmt(c.vatAmount));
const draft36 = E.drafts.get('DSI-000036');
c = E.drafts.calc(draft36);
check('15 §16.2 wireframe draft DSI-000036: 50 900.01 + VAT 5 090.00 = 55 990.01', c.amount === 5090001 && c.vatAmount === 509000 && c.amountInclVat === 5599001, fmt(c.amountInclVat));

// eBarimt item split (12 §6.2 example: qty 3, G 10 000.00, V 909.09)
const items = E.ebarimt.itemsFromLines([{ type: 'ITEM', no: 'X1', description: 'Дэвтэр 48 хуудас', qty: '3', aiv: 1000000, vat: 90909, amount: 909091, taxType: 'VAT_ABLE', lineNo: 10000, classificationCode: '4817000', uomName: 'ш' }]);
check('12 §6.2 STRICT_SPLIT: 2 × 3 333.33 + 1 × 3 333.34, VAT 606.06 + 303.03',
  items.length === 2 && items[0].unitPrice === 333333 && items[0].totalAmount === 666666 && items[1].totalAmount === 333334 && items[0].totalVAT === 60606 && items[1].totalVAT === 30303,
  items.map((i) => fmt(i.totalAmount) + '/' + fmt(i.totalVAT)).join(' + '));

// ---------------------------------------------------------------- 4. known numbers from the mock history
const S = E.state();
const si1 = E.sales.getPosted('SI-2026-00001');
check('SI-2026-00001 = Өглөөний Туяа ХХК, 1 960 000.00 + 196 000.00 = 2 156 000.00', si1 && si1.customer === 'C00001' && si1.amount === 196000000 && si1.vatAmount === 19600000 && si1.amountInclVat === 215600000, si1 && fmt(si1.amountInclVat));
const si2 = E.sales.getPosted('SI-2026-00002');
check('SI-2026-00002 (B2C cash, prices incl. VAT): 120 100.00, VAT round(120 100 × 10/110) = 10 918.18', si2.amountInclVat === 12010000 && si2.vatAmount === 1091818 && si2.lines[0].vat + si2.lines[1].vat === 1091818, fmt(si2.vatAmount));
check('SI-2026-00002 paid by cash voucher МХ-1 KO-2026-00001 and closed', si2.cashVoucherNo === 'KO-2026-00001' && E.sales.paymentStatus(si2).status === 'PAID');
check('Gapless series after boot: SI 27, SC 3, PI 14, OB 1', S.series['SI|2026'].last === 27 && S.series['SC|2026'].last === 3 && S.series['PI|2026'].last === 14 && S.series['OB|2026'].last === 1);
const tb = E.reports.trialBalance({});
check('Trial balance debit = credit', tb.totals.debit === tb.totals.credit && tb.totals.closingDebit === tb.totals.closingCredit, fmt(tb.totals.debit));
const sbt = E.reports.financialStatement('SBT', {});
check('СБТ 1.3 total assets = 2.3 liabilities + equity', sbt.values.end['1.3'] === -sbt.values.end['2.3'], fmt(sbt.values.end['1.3']));
check('СБТ opening column balances (OB-2026-00001)', sbt.values.begin['1.3'] === 3457500000 && sbt.values.begin['CHK'] === 0, fmt(sbt.values.begin['1.3']));
const odt = E.reports.financialStatement('ODT', {});
check('ОДТ 22 net profit is positive (profitable mock business)', -odt.values.cur['22'] > 0, fmt(-odt.values.cur['22']));
const vr = E.reports.vatReturn('2026-09');
const cue = E.home.cues();
check('ТТ-03а 2026-09 row 14 = CUE-04 estimate', vr.values['14'] === cue['CUE-04'].value, fmt(vr.values['14']) + ' / ' + fmt(cue['CUE-04'].value));
check('CUE-04 is due 2026-10-10 (2 days) → UNFAVORABLE', cue['CUE-04'].due === '2026-10-10' && cue['CUE-04'].days === 2 && cue['CUE-04'].state === 'UNFAVORABLE');
check('eBarimt statuses: 1 UNKNOWN, 1 ERROR, 1 PENDING', cue['CUE-06'].unknown === 1 && cue['CUE-06'].value === 2 && cue['CUE-05'].value === 1);
check('Unconfirmed input VAT: 2 entries (PI without ДДТД and not confirmed)', cue['CUE-14'].count === 2, fmt(cue['CUE-14'].value));
const mgt = E.reports.financialStatement('MGT', {});
check('МГТ: cash at end = ledger cash, X = 0', mgt.values.cur['CHK'] === 0 && (mgt.values.cur['X'] || 0) === 0, fmt(mgt.values.cur['7']));
const ag = E.reports.aging('customer');
check('AR aging total = CUE-16 total receivables', ag.parties.reduce((s, p) => s + p.total, 0) === cue['CUE-16'].value, fmt(cue['CUE-16'].value));

// ---------------------------------------------------------------- 4b. accounting review (Mongolian accountant / BC consultant)
check('VAT identifier comes from the seed setup (RC10, CUSTOMS ≠ VAT10; D-E3, BR-TAX-18)',
  E.setup.vatSetup('IMPORT', 'IMPORT_SERVICE').identifier === 'RC10' && E.setup.vatSetup('DOMESTIC', 'CUSTOMS_VAT').identifier === 'CUSTOMS' &&
  E.setup.vatSetup('EXPORT', 'VAT10').identifier === 'VAT0' && E.setup.vatSetup('DOMESTIC', 'VAT10').identifier === 'VAT10');
c = calc(false, [{ type: 'GL_ACCOUNT', no: '5110', qty: '1', price: '1000.05' }, { type: 'GL_ACCOUNT', no: '5110', qty: '0', price: '5' }]);
check('Zero line (CLA = 0) is not grouped and gets VAT 0 (BR-TAX-22)', c.groups.length === 1 && c.lines[1].vatAmount === 0 && c.vatAmount === 10001);
// account determination against mn_30_posting.sql / mn_20_tax.sql
const gps = (b, p) => E.setup.genPostingSetup(b, p);
check('General posting setup = seed (DOMESTIC GOODS 5100/6100, SERVICES 5110/7200, EXPORT GOODS 5120, RELATED 5130, * fallback)',
  gps('DOMESTIC', 'GOODS').sales === '5100' && gps('DOMESTIC', 'GOODS').purch === '6100' && gps('DOMESTIC', 'SERVICES').sales === '5110' &&
  gps('DOMESTIC', 'SERVICES').purch === '7200' && gps('EXPORT', 'GOODS').sales === '5120' && gps('RELATED', 'SERVICES').sales === '5130' && gps('NOGROUP', 'MISC').sales === '8200');
check('Receivables / payables / VAT accounts = seed (1200, 2100, 2300, 1300, reverse charge 2305)',
  E.setup.receivablesAccount('DOMESTIC') === '1200' && E.setup.payablesAccount('DOMESTIC') === '2100' && E.setup.payablesAccount('CUSTOMS') === '2365' &&
  E.setup.vatSetup('DOMESTIC', 'VAT10').salesAcc === '2300' && E.setup.vatSetup('DOMESTIC', 'VAT10').purchAcc === '1300' && E.setup.vatSetup('IMPORT', 'IMPORT_SERVICE').reverseAcc === '2305');
// every posted sales line went to the account of the setup
const badAcc = [];
E.sales.postedInvoices().concat(E.sales.postedCreditMemos()).forEach((p) => p.lines.forEach((l) => {
  if (l.type === 'ITEM') { const it = E.setup.item(l.no); if (l.account !== gps(p.genBus, it.genProd).sales) badAcc.push(p.no + '/' + l.lineNo); }
}));
check('Every posted item line hit the General Posting Setup sales account (D-F1)', badAcc.length === 0, badAcc.join(', '));
// each sales voucher: revenue + VAT = receivable
const badVch = [];
E.sales.postedInvoices().forEach((p) => {
  const g = S.glEntries.filter((e) => e.transactionNo === p.transactionNo);
  const ar = g.filter((e) => e.account === '1200').reduce((x, e) => x + e.amount, 0);
  const vat = g.filter((e) => e.account === '2300').reduce((x, e) => x + e.amount, 0);
  if (ar !== p.amountInclVat || vat !== -p.vatAmount || g.reduce((x, e) => x + e.amount, 0) !== 0) badVch.push(p.no);
});
check('Sales vouchers: Дт 1200 = НӨАТ-тэй дүн, Кт 2300 = баримтын НӨАТ, Σ = 0', badVch.length === 0, badVch.join(', '));
// AR / AP per party = aging = G/L
const custSum = {}; S.dcle.forEach((d) => { custSum[d.customer] = (custSum[d.customer] || 0) + d.amount; });
const agC = E.reports.aging('customer');
check('AR per customer: Σ detailed = aging total; Σ = 1200', agC.parties.every((p) => p.total === custSum[p.party]) &&
  Object.values(custSum).reduce((a, b) => a + b, 0) === E.reports.glBalance('1200'));
const agV = E.reports.aging('vendor');
check('AP aging total = 2100 balance', agV.parties.reduce((a, p) => a + p.total, 0) === E.reports.glBalance('2100'), fmt(E.reports.glBalance('2100')));
// Form A
check('СБТ 2.2.7 (end) = 3400 opening + ОДТ 22: current-year result sits in equity', -sbt.values.end['2.2.7'] === 2277500000 + -odt.values.cur['22'], fmt(-sbt.values.end['2.2.7']));
check('ОДТ: 2 (өртөг) shown positive, 3 = 1 − 2, 18 = 3 + other lines', odt.displayValue(odt.rows.find((r) => r.code === '2'), 'cur') > 0 &&
  -odt.values.cur['3'] === -odt.values.cur['1'] - odt.values.cur['2']);
check('МГТ: vendor payment overrides (BR-RPT-73): laptop in 2.2.1, rent/internet in 1.2.4, fuel in 1.2.5',
  mgt.values.cur['2.2.1'] === -264000000 && mgt.values.cur['1.2.5'] === -42900000 && mgt.values.cur['1.2.4'] < -700000000, fmt(mgt.values.cur['2.2.1']) + ' / ' + fmt(mgt.values.cur['1.2.4']) + ' / ' + fmt(mgt.values.cur['1.2.5']));
check('МГТ 1 + 2 + 3 + 4 + X = 7 − 6', mgt.values.cur['5'] === mgt.values.cur['7'] - mgt.values.cur['6']);
// mock data plausibility
check('Payroll: ХХОАТ after the monthly credit (2 × (10 % × (900 000 − 103 500) − 18 000) = 123 300); net 1 469 700',
  E.reports.glBalance('2340') === -12330000 && E.reports.glBalance('2200') === -146970000 && E.reports.glBalance('2350') === -43200000);
check('Depreciation: 4-year life, laptop from 2026-06-01 → 1690 = −(2 125 000 + 531 250 + 581 250 + 681 250)', E.reports.glBalance('1690') === -391875000, fmt(E.reports.glBalance('1690')));
check('ТТД / регистр are obviously fake (00000…) and 11 / 7 digits', [ERP.data.company].concat(ERP.data.customers.filter((x) => x.tin), ERP.data.vendors)
  .every((x) => /^0{6}\d{5}$/.test(x.tin)) && /^0{4}\d{3}$/.test(ERP.data.company.registrationNo));
const isic = ['9511', '6202', '4321', '6311', '8549', '6920'];
const allItems = E.ebarimt.documents().filter((d) => d.lines).flatMap((d) => d.lines);
check('eBarimt classificationCode: 7 digits, БҮНА (CPC-based) not ISIC activity codes; rental line 7312400',
  allItems.every((l) => /^\d{7}$/.test(l.classificationCode) && isic.indexOf(l.classificationCode.slice(0, 4)) < 0) && allItems.some((l) => l.classificationCode === '7312400'));
// eBarimt JSON rules (12 §5, TYP-02, MAP-01, MAP-24)
const ebBad = [];
E.ebarimt.documents().forEach((d) => {
  const r = d.operation === 'DELETE' ? null : E.ebarimt.buildRequest(d);
  if (!r) return;
  const p = E.sales.getPosted(d.sourceNo);
  if (r.type === 'B2B_RECEIPT' && !(/^\d{11}$/.test(r.customerTin) && r.consumerNo === '')) ebBad.push(d.id + ' B2B tin');
  if (r.type === 'B2C_RECEIPT' && r.customerTin !== null) ebBad.push(d.id + ' B2C tin');
  if (r.type === 'B2B_RECEIPT' && E.setup.customer(p.customer).kind !== 'LEGAL') ebBad.push(d.id + ' B2B individual');
  const order = ['VAT_ABLE', 'VAT_ZERO', 'VAT_FREE', 'NOT_VAT'];
  r.receipts.forEach((x, i) => {
    if (x.customerTin !== null) ebBad.push(d.id + ' receipt customerTin');
    if (i && order.indexOf(x.taxType) <= order.indexOf(r.receipts[i - 1].taxType)) ebBad.push(d.id + ' order');
    x.items.forEach((it) => {
      if (x.taxType === 'VAT_ABLE' ? it.taxProductCode !== null : !(it.taxProductCode && it.totalVAT === 0)) ebBad.push(d.id + ' taxProductCode/VAT');
      if (!(it.qty > 0 && it.unitPrice > 0 && it.totalVAT >= 0 && it.totalVAT <= it.totalAmount)) ebBad.push(d.id + ' AMT-12');
    });
  });
  if (!/^001\d{6}$/.test(r.billIdSuffix)) ebBad.push(d.id + ' billIdSuffix');
  if (d.sourceType === 'SALES_INVOICE' && (r.totalAmount * 100 !== p.amountInclVat || Math.round(r.totalVAT * 100) !== p.vatAmount)) ebBad.push(d.id + ' AMT-05');
});
check('eBarimt JSON: B2B tin / B2C consumerNo, receipt order and taxType split, taxProductCode only off VAT_ABLE, AMT-05/12', ebBad.length === 0, ebBad.join(', '));

// ---------------------------------------------------------------- 5. posting behaviour
const before = JSON.stringify(S.counters);
const pv = E.sales.preview(draft36);
check('Preview succeeds, uses "***" and does not consume numbers (D-C6 ROLLBACK)', pv.ok && pv.result.vouchers[0].documentNo === '***' && JSON.stringify(E.state().counters) === before);
const pvGl = pv.result.vouchers[0].gl;
check('Preview voucher balances and hits 1200 / 5110 / 8100 / 2300', pvGl.reduce((s, e) => s + e.amount, 0) === 0 && ['1200', '5110', '8100', '2300'].every((a) => pvGl.some((e) => e.account === a)));
const r1 = E.sales.post(draft36, { interactive: true });
check('Post DSI-000036 → SI-2026-00028 (B2B, async → PENDING)', r1.ok && r1.posted.no === 'SI-2026-00028' && r1.ebarimt.status === 'PENDING' && !r1.printPayload, r1.ok ? r1.posted.no + ' ' + r1.ebarimt.status : JSON.stringify(r1.errors));
check('Draft removed after posting', !E.drafts.get('DSI-000036'));
E.ebarimt.dispatch(r1.ebarimt.id);
const doc1 = E.ebarimt.get(r1.ebarimt.id);
check('Worker dispatch → SUCCESS with a 33-digit ДДТД', doc1.status === 'SUCCESS' && /^\d{33}$/.test(doc1.ddtd), doc1.ddtd);
const d35 = E.drafts.get('DSI-000035');
const r2 = E.sales.post(d35, { interactive: true });
check('Post B2C cash draft → SYNC_FIRST print payload with qrData + lottery (returned only)', r2.ok && r2.printPayload && r2.printPayload.qrData.length > 50 && /^ЖБ \d{8}$/.test(r2.printPayload.lottery));
check('Cash sale creates МХ-1 KO-2026-00008 and closes the invoice', r2.posted.cashVoucherNo === 'KO-2026-00008' && E.sales.paymentStatus(r2.posted).status === 'PAID', r2.posted.cashVoucherNo);
const req2 = E.ebarimt.buildRequest(E.ebarimt.get(r2.posted.ebarimtDocId));
check('Receipt JSON: B2C, consumerNo "", payments CASH, sum chain exact', req2.type === 'B2C_RECEIPT' && req2.consumerNo === '' && req2.payments[0].code === 'CASH' && E.ebarimt.chainOk(req2).ok && req2.totalAmount * 100 === r2.posted.amountInclVat);
check('Receipt JSON carries no qrData / lottery', !('qrData' in req2) && !('lottery' in req2));
// errors
const bad = E.drafts.create('C00001', { postingDate: '2026-08-15', documentDate: '2026-08-15', lines: [{ type: 'ITEM', no: 'I00001', qty: '1' }] });
let rb = E.sales.post(bad, { interactive: true });
check('Posting into a closed period is refused (gl.period_closed)', !rb.ok && rb.errors.some((e) => e.code === 'gl.period_closed'));
const bad2 = E.drafts.create('C00001', { lines: [{ type: 'GL_ACCOUNT', no: '1200', qty: '1', price: '1000' }] });
rb = E.sales.post(bad2, { interactive: true });
check('A control account on a G/L line is refused (BR-SAL-11)', !rb.ok && rb.errors.some((e) => e.code === 'gl.direct_posting_not_allowed'));
const bad3 = E.drafts.create('C00001', {});
rb = E.sales.post(bad3, { interactive: true });
check('A document without lines is refused (sales.no_lines)', !rb.ok && rb.errors.some((e) => e.code === 'sales.no_lines'));
check('Failed postings consumed no legal numbers', E.state().series['SI|2026'].last === 29);
// application / unapply / reversal
const payTx = E.payments.receipt({ date: '2026-10-08', bank: 'KHAN01', cust: 'C00004', amount: '1000000.00' });
const payEntry = E.state().cle[E.state().cle.length - 1];
const target = E.sales.getPosted('SI-2026-00024');
const ap = E.ledger.applyCustomer(payEntry.entryNo, [target.cleEntryNo], '2026-10-08');
check('Apply an open payment to SI-2026-00024 (G/L-less application)', payTx.ok && ap.ok && ap.applied === 100000000, ap.ok ? fmt(ap.applied) : JSON.stringify(ap.errors));
const un = E.ledger.unapplyCustomer(ap.applicationNo, '2026-10-08');
check('Unapply restores remaining amounts', un.ok && E.sales.paymentStatus(target).remaining === target.amountInclVat && payEntry.remaining === -100000000);
const fee = E.payments.bankGl({ date: '2026-10-08', bank: 'KHAN01', acc: '8300', amount: '-2500.00', desc: 'ШИМТГЭЛ тест' });
const rev = E.ledger.reverseTransaction(fee.result.vouchers[0].transactionNo, 'REVERSAL');
check('Reverse a journal-origin bank fee (same document no, source REVERSAL)', rev.ok && rev.result.vouchers[0].documentNo === fee.result.vouchers[0].documentNo);
const revInv = E.ledger.reverseTransaction(target.transactionNo, 'REVERSAL');
check('Reversing an invoice transaction is refused (use a credit memo, D-D5)', !revInv.ok && revInv.errors.some((e) => e.code === 'gl.reversal_use_credit_memo'));
const conf = E.purchases.confirmInputVat(E.purchases.list().find((p) => !p.deductibleConfirmed && p.ddtd).no);
check('Confirm input VAT with the registered ДДТД (BR-TAX-49)', conf.ok && E.home.cues()['CUE-14'].count === 1);
for (const c2 of E.invariants()) check('[after posting] ' + c2.id, c2.pass, c2.detail);

// ---------------------------------------------------------------- 5b. application / unapply detail (06 §5.13–5.14), VAT scope (08 §5.9)
const cleOf = (no) => E.state().cle.find((e) => e.entryNo === no);
const pay2 = E.payments.receipt({ date: '2026-10-08', bank: 'KHAN01', cust: 'C00004', amount: '500000.00' });
const pe2 = E.state().cle[E.state().cle.length - 1];
const otherCust = E.sales.postedInvoices().find((p) => p.customer === 'C00003' && E.sales.paymentStatus(p).remaining > 0);
let ax = E.ledger.applyCustomer(pe2.entryNo, [otherCust.cleEntryNo], '2026-10-08');
check('Applying a payment to another customer\'s invoice is refused (INV-27)', pay2.ok && !ax.ok && ax.errors.some((e) => e.code === 'party.application_customer_mismatch'));
ax = E.ledger.applyCustomer(pe2.entryNo, [target.cleEntryNo], '2026-10-07');
check('Application dated before the payment is refused (BR-AR-27)', !ax.ok && ax.errors.some((e) => e.code === 'party.application_date_before_entries'));
ax = E.ledger.applyCustomer(pe2.entryNo, [{ entryNo: target.cleEntryNo, amount: 30000000 }], '2026-10-08');
const apRows = E.state().dcle.filter((d) => d.applicationNo === ax.applicationNo);
check('Capped application 300 000.00: two detailed rows ±300 000, transaction_no NULL, payment remaining −200 000',
  ax.ok && ax.applied === 30000000 && apRows.length === 2 && apRows.every((d) => d.transactionNo === null && Math.abs(d.amount) === 30000000) && pe2.remaining === -20000000);
const un2 = E.ledger.unapplyCustomer(ax.applicationNo, '2026-10-08');
const mirrors = E.state().dcle.filter((d) => d.unappliedOf && apRows.some((r) => r.entryNo === d.unappliedOf));
check('Unapply: mirror rows with a new application no, −amount, transaction_no NULL; originals point to them (BR-AR-44/45)',
  un2.ok && mirrors.length === 2 && mirrors.every((m) => m.applicationNo === un2.undoApplicationNo && m.applicationNo !== ax.applicationNo && m.transactionNo === null && m.unapplied) &&
  apRows.every((r) => r.unapplied && mirrors.some((m) => m.entryNo === r.unappliedByEntryNo)) && pe2.remaining === -50000000 && cleOf(target.cleEntryNo).remaining === target.amountInclVat);
check('Unapplying the same application twice is refused', !E.ledger.unapplyCustomer(ax.applicationNo, '2026-10-08').ok);
// VAT settlement preview must not touch live entries; settled period keeps its entries; a late confirmation goes to the next open return
const liveClosed = () => E.vat.entries().filter((e) => e.closed).length;
const before2 = liveClosed();
const pvs = E.vat.settle('2026-09', '2026-09-30', { preview: true });
check('VAT settlement preview leaves the live VAT entries untouched (ROLLBACK)', pvs.ok && liveClosed() === before2);
const st = E.vat.settle('2026-09', '2026-09-30');
const sep = E.reports.vatReturn('2026-09');
check('Close September VAT: settlement = ТТ-03а row 14, period CLOSED, 2310 credited', st.ok && st.net === sep.values['14'] && E.vat.periods().find((p) => p.period === '2026-09').status === 'CLOSED', fmt(st.net));
const p13 = E.purchases.list().find((p) => !p.ddtd);
const cf13 = E.purchases.confirmInputVat(p13.no, '000000000914202609120915420001084');
const oct = E.reports.vatReturn('2026-10'), sep2 = E.reports.vatReturn('2026-09');
check('Input VAT confirmed after its month was closed is deducted in the next open return (BR-TAX-49, 08 §5.9)',
  cf13.ok && oct.values['8'] === -p13.vatAmount && sep2.values['14'] === sep.values['14'], 'Oct row 8 ' + fmt(oct.values['8']));
for (const c3 of E.invariants()) check('[after review scenarios] ' + c3.id, c3.pass, c3.detail);

// ---------------------------------------------------------------- 6. explanation notes → real spec headings
const headingCache = {};
function headings(file) {
  if (!headingCache[file]) {
    const p = path.join(DOCS, file);
    headingCache[file] = fs.existsSync(p) ? new Set(fs.readFileSync(p, 'utf8').split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#{1,6} /, '').trim())) : null;
  }
  return headingCache[file];
}
let notes = 0, badRefs = [];
for (const n of ERP.notes.all()) {
  notes++;
  for (const k of ['title', 'what', 'why', 'bc']) if (!n[k]) badRefs.push(n.id + ': missing ' + k);
  for (const d of n.doc) {
    const h = headings(d.file);
    if (!h) badRefs.push(n.id + ': file not found ' + d.file);
    else if (d.section && !h.has(d.section)) badRefs.push(n.id + ': heading not found in ' + d.file + ': ' + d.section);
  }
}
check('Every note (' + notes + ') has title/what/why/bc and links to an existing spec heading', badRefs.length === 0, badRefs.join(' | '));
check('Slug matches GitHub rules', ERP.notes.slug('6.3 НӨАТ — үнэ НӨАТ-гүй (`prices_including_vat = false`)') === '63-нөат--үнэ-нөат-гүй-prices_including_vat--false');
// every data-note id used by the built screens is registered
const used = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'js/screens'))) {
  const src = fs.readFileSync(path.join(ROOT, 'js/screens', f), 'utf8');
  for (const m of src.matchAll(/data-note="([\w.-]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/note: '([^']+)'/g)) used.add(m[1]);
}
for (const m of html.matchAll(/data-note="([^"]+)"/g)) used.add(m[1]);
const missing = [...used].filter((id) => !ERP.notes.get(id));
check('All ' + used.size + ' data-note ids used in markup are registered', missing.length === 0, missing.join(', '));
// every js / css file in the folder is referenced by app.html
const refd = new Set(scripts.concat([...html.matchAll(/href="((?:css\/)?[\w-]+\.css)"/g)].map((m) => m[1])));
const onDisk = [];
for (const dir of ['js', 'js/notes', 'js/screens', 'css']) for (const f of fs.readdirSync(path.join(ROOT, dir))) if (/\.(js|css)$/.test(f)) onDisk.push(dir + '/' + f);
onDisk.push('styles.css');
const unref = onDisk.filter((f) => !refd.has(f));
check('Every js/css file is included in app.html', unref.length === 0, unref.join(', '));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
