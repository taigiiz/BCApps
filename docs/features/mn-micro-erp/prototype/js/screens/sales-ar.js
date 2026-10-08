/* =============================================================================
   js/screens/sales-ar.js — RESERVED for the sales/receivables builder: #customers (S-PTY-01 + aging),
   #customer (S-PTY-02 card, ledger entries, application/unapply), posted documents list, credit memo editor,
   #ebarimt (S-EBR-02 monitor). Replace each ERP.app.stub(...) with ERP.app.registerScreen({...}).
   Notes go in js/notes/sales-ar.js, styles in css/sales-ar.css.
   ========================================================================== */
(function () {
  'use strict';
  var app = window.ERP.app;
  app.stub({ route: 'customers', title: 'Харилцагч', crumbs: [['Борлуулалт'], ['Харилцагч']], owner: 'js/screens/sales-ar.js',
    intro: ['Харилцагчдын жагсаалт, үлдэгдэл, хугацаа хэтэрсэн дүн ба авлагын насжилт (0–30 / 31–60 / 61–90 / 90+).'],
    plan: ['ERP.engine.reports.aging("customer", asOf)', 'ERP.engine.sales.customerBalance(no, asOf)', 'Харилцагчийн карт руу: ERP.app.navigate("customer", { customerNo })'] });
  app.stub({ route: 'customer', title: 'Харилцагчийн карт', crumbs: [['Борлуулалт'], ['Харилцагч', 'customers'], ['Карт']], owner: 'js/screens/sales-ar.js',
    intro: ['Харилцагчийн мэдээлэл, авлагын бичилт (header + detailed), тулгалт ба тулгалт буцаах.'],
    plan: ['ERP.engine.state().cle / .dcle', 'Тулгах: ERP.engine.ledger.applyCustomer(newEntryNo, [targetEntryNo], date, { preview })', 'Буцаах: ERP.engine.ledger.unapplyCustomer(applicationNo, date)',
      'Кредит нот: ERP.engine.drafts.create(customerNo, { docType: "CREDIT_MEMO", appliesTo: "SI-2026-…", reason: "RETURN" }) → ERP.engine.sales.post(draft)'] });
  app.stub({ route: 'ebarimt', title: 'eBarimt хяналт', crumbs: [['Борлуулалт'], ['eBarimt хяналт']], owner: 'js/screens/sales-ar.js',
    intro: ['PENDING / SENT / ERROR / UNKNOWN баримтууд, PosAPI-ийн сугалааны үлдэгдэл, UNKNOWN-ийг гараар шийдвэрлэх (D-J2).'],
    plan: ['ERP.engine.ebarimt.documents(), .get(id), .chainStatus(posted), .buildRequest(doc)', 'Илгээх (PENDING): ERP.engine.ebarimt.dispatch(id)', 'UNKNOWN шийдвэрлэх dialog (S-EBR-05)'] });
})();
