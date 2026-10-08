/* =============================================================================
   js/screens/cash-bank.js — RESERVED for the cash & bank builder: #cash (МХ-1 / МХ-2 cash vouchers, S-BNK-03/04/05)
   and #bank-rec (statement import + reconciliation, S-BNK-08/09). Replace each ERP.app.stub(...) with
   ERP.app.registerScreen({...}). Notes go in js/notes/cash-bank.js, styles in css/cash-bank.css.
   ========================================================================== */
(function () {
  'use strict';
  var app = window.ERP.app;
  app.stub({ route: 'cash', title: 'Кассын баримт (МХ-1 / МХ-2)', crumbs: [['Мөнгө'], ['Кассын баримт']], owner: 'js/screens/cash-bank.js',
    intro: ['Кассын орлого (МХ-1, KO-2026-#####) ба зарлагын (МХ-2, KZ-2026-#####) баримт; касс сөрөг үлдэгдэлгүй (D-G1).'],
    plan: ['Жагсаалт: ERP.engine.state().cashVouchers', 'Орлого: ERP.engine.payments.receipt({ date, bank: "CASH01", cust, amount, appliesTo })',
      'Зарлага: ERP.engine.payments.bankGl({ date, bank: "CASH01", acc, amount: "-45000.00", desc, party })', 'Шилжүүлэг: ERP.engine.payments.transfer({ date, from, to, amount, desc })'] });
  app.stub({ route: 'bank-rec', title: 'Хуулга ба тулгалт', crumbs: [['Мөнгө'], ['Хуулга ба тулгалт']], owner: 'js/screens/cash-bank.js',
    intro: ['Хаан, Голомт банкны хуулга импорт ба автомат тулгалт (BC Match Bank Payments-ын оноо).'],
    plan: ['Хуулга: ERP.engine.reports.bankStatement("KHAN01", "2026-09") → { openingBalance, closingBalance, lines }', 'Тулгалтын оноо (09 §5.9) ба "Тооцоог харах"',
      'Тулгагдаагүй мөрөөс бичилт: ERP.engine.payments.bankGl / receipt'] });
})();
