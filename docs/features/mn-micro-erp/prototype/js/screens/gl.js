/* =============================================================================
   js/screens/gl.js — RESERVED for the GL builder: #coa (S-GL-01), #journal (S-GL-03), #trial-balance (S-RPT-02),
   #periods (S-GL-09/10). Replace each ERP.app.stub(...) below with ERP.app.registerScreen({...}).
   Use only the public APIs documented in prototype/README.md (ERP.engine.*, ERP.ui.*, ERP.app.*, ERP.notes.register).
   Notes go in js/notes/gl.js, styles in css/gl.css — no shared file needs to change.
   ========================================================================== */
(function () {
  'use strict';
  var app = window.ERP.app;
  app.stub({ route: 'coa', title: 'Дансны төлөвлөгөө', crumbs: [['Санхүү'], ['Дансны төлөвлөгөө']], owner: 'js/screens/gl.js',
    intro: ['MN seed-ийн 182 данс (138 posting): төрөл, хэвийн тал, хяналтын данс (direct posting = false), Маягт А-гийн мөр, МГТ-ийн ангилал, үлдэгдэл.'],
    plan: ['Дансны мод (Heading/Begin-Total/End-Total) ба үлдэгдэл — ERP.engine.setup.accounts(), ERP.engine.reports.glBalance()',
      'Дансны карт: бичилтүүд — ERP.engine.reports.accountEntries(no, from, to)', 'Маягт А / МГТ харгалзааны шалгалт (FR-GL-002)'] });
  app.stub({ route: 'journal', title: 'Ерөнхий журнал', crumbs: [['Санхүү'], ['Ерөнхий журнал']], owner: 'js/screens/gl.js',
    intro: ['Гар журнал: данс, харилцагч, нийлүүлэгч, мөнгөний данстай мөр; ваучер тэнцэх ёстой; батлахад GJ-2026-##### олгогдоно.'],
    plan: ['Журналын мөрийн засварлагч ба тэнцлийн шалгалт — ERP.engine.journal.post({...}, { preview: true })',
      'Гүйлгээ буцаах (D-D5) — ERP.engine.ledger.reverseTransaction(txNo, reasonCode)', 'Цалингийн журнал импорт (PAYROLLJNL) жишээ'] });
  app.stub({ route: 'trial-balance', title: 'Гүйлгээ баланс', crumbs: [['Тайлан'], ['Гүйлгээ баланс']], owner: 'js/screens/gl.js',
    intro: ['Данс бүрийн эхний үлдэгдэл, дебит, кредит гүйлгээ, эцсийн үлдэгдэл. Σ дебит = Σ кредит.'],
    plan: ['ERP.engine.reports.trialBalance({ from, to }) → rows, totals', 'Ангиар дэд дүн, drill-down бичилт руу'] });
  app.stub({ route: 'periods', title: 'Санхүүгийн жил ба үе', crumbs: [['Хаалт'], ['Санхүүгийн жил ба үе']], owner: 'js/screens/gl.js',
    intro: ['2026 оны 12 сар: Нээлттэй / Хаалттай / Түгжсэн; сарын хаалтын шалгах хуудас.'],
    plan: ['ERP.engine.periods.list(), ERP.engine.periods.setStatus(period, status)', 'Сарын хаалтын шалгах хуудас — ERP.engine.home.closeChecklist(period)'] });
})();
