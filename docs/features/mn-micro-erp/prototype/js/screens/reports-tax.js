/* =============================================================================
   js/screens/reports-tax.js — RESERVED for the reports & tax builder: #financial-statements (Form A СБТ, ОДТ, МГТ),
   #vat-return (ТТ-03а, S-TAX-03), #setup (company setup wizard, S-PLT-06). Replace each ERP.app.stub(...) with
   ERP.app.registerScreen({...}). Notes go in js/notes/reports-tax.js, styles in css/reports-tax.css.
   ========================================================================== */
(function () {
  'use strict';
  var app = window.ERP.app;
  app.stub({ route: 'financial-statements', title: 'Санхүүгийн тайлан (Маягт А)', crumbs: [['Тайлан'], ['Санхүүгийн тайлан']], owner: 'js/screens/reports-tax.js',
    intro: ['СБТ, ОДТ, МГТ (шууд арга) seed-ийн мөрийн тодорхойлолтоос тооцогдоно; баланс тэнцэх шалгалттай.'],
    plan: ['ERP.engine.reports.financialStatement("SBT" | "ODT" | "MGT", { asOf }) → { columns, rows, values, displayValue(row, colId) }',
      'МГТ-ийн задаргаа: ERP.engine.reports.cashFlow({ from, to }) → categories, detail', 'Нэгж: төгрөг / мянган төгрөг'] });
  app.stub({ route: 'vat-return', title: 'НӨАТ-ын тайлан (ТТ-03а)', crumbs: [['Татвар'], ['НӨАТ-ын тайлан']], owner: 'js/screens/reports-tax.js',
    intro: ['Сар бүрийн ТТ-03а-гийн мөрүүд VAT entry-ээс; НӨАТ-ын хаалт (2300/1300 → 2310) ба төлөлт.'],
    plan: ['ERP.engine.reports.vatReturn("2026-09") → rows (value, printValue, entries)', 'Хаалтын урьдчилсан харагдац: ERP.engine.vat.settle(period, date, { preview: true })',
      'Баталгаажаагүй орцын НӨАТ: ERP.engine.vat.unconfirmedInput(upTo)'] });
  app.stub({ route: 'setup', title: 'Компани тохируулах', crumbs: [['Тохиргоо'], ['Компани тохируулах']], owner: 'js/screens/reports-tax.js',
    intro: ['Компани тохируулах wizard: ТТД, НӨАТ төлөгч эсэх, санхүүгийн жил, MN seed (fn_provision_company_mn) юу үүсгэдэг.'],
    plan: ['ERP.data.company, ERP.data.numberSeries, ERP.data.vatPostingSetup, ERP.data.generalPostingSetup', 'Seed-ийн тоо: 182 данс, 19 VAT setup, 16 General Posting Setup'] });
})();
