/* js/notes/purchases.js — explanation notes for #purchase-invoices (js/screens/purchases.js). */
(function () {
  'use strict';
  window.ERP.notes.register('purchase-invoices', 'Худалдан авалтын нэхэмжлэх', {
    'purch.list': {
      title: 'Худалдан авалт ба нийлүүлэгчийн ДДТД',
      what: 'Батлагдсан худалдан авалт бүр: дотоод дугаар PI-2026-#####, нийлүүлэгчийн нэхэмжлэхийн дугаар (давхардахгүй), нийлүүлэгчийн eBarimt ДДТД, өглөгийн үлдэгдэл, орцын НӨАТ баталгаажсан эсэх. Posting: зардал/бараа Дт, 1300 орцын НӨАТ Дт, 2100 өглөг Кт.',
      why: 'Нийлүүлэгчийн баримтын дугаарын давхардал нь давхар төлбөрөөс сэргийлнэ. ДДТД нь орцын НӨАТ хасах хуулийн нөхцөл.',
      bc: 'Posted Purchase Invoices (Page 146), Codeunit 90 "Purch.-Post", Vendor Ledger Entry (Table 25).',
      rules: ['FR-PUR-001', 'FR-PUR-002', 'FR-PUR-003', 'INV-18', 'BR-TAX-28'],
      data: ['purchase.purch_inv_header', 'party.vendor_ledger_entry', 'ebarimt.purchase_receipt.ddtd'],
      doc: [{ file: '07-purchases-payables.md', section: '4.7 Нийлүүлэгчийн ДДТД ба орцын НӨАТ-ын баталгаажуулалт' }, { file: '07-purchases-payables.md', section: '4.2 Нийлүүлэгчийн баримтын дугаар' }, { file: '08-tax-vat-mn.md', section: '4.4 VAT entry ба posting' }]
    },
    'purch.unconfirmed': {
      title: 'Баталгаажаагүй орцын НӨАТ',
      what: 'ДДТД-гүй эсвэл баталгаажуулаагүй худалдан авалтын НӨАТ 1300 дансанд байгаа ч НӨАТ-ын тайланд (ТТ-03а мөр 7–8) хасагдахгүй, сарын НӨАТ-ын хаалтад ч орохгүй. "Баталгаажуулах" товч 33 оронтой ДДТД шалгаад VAT entry-д deductible_confirmed = true болгоно.',
      why: 'Татварын хуулиар орцын НӨАТ зөвхөн eBarimt-ээр баталгаажсан худалдан авалтаас хасагдана. Баталгаажсан entry дараагийн нээлттэй үеийн тайланд орно.',
      bc: 'VAT Entry (Table 254) — BC-д байхгүй нэмэлт талбар.',
      rules: ['D-E4', 'BR-TAX-45', 'BR-TAX-47', 'BR-TAX-49', 'BR-TAX-50', 'FR-TAX-009'],
      data: ['tax.vat_entry.deductible_confirmed', 'tax.vat_entry.supplier_ebarimt_id', 'ebarimt.purchase_receipt.status'],
      doc: [{ file: '08-tax-vat-mn.md', section: '4.6 Орцын НӨАТ-ын хасалт ба баталгаажуулалт' }, { file: '12-ebarimt-integration.md', section: '16.1 Төлөв (`ebarimt.purchase_receipt.status`)' }]
    }
  });
})();
