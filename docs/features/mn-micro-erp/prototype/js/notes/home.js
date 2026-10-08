/* js/notes/home.js — explanation notes for #home (js/screens/home.js). */
(function () {
  'use strict';
  var UI = '15-ui-ux.md';
  window.ERP.notes.register('home', 'Нүүр (role center)', {
    'home.headline': {
      title: 'Мэдээний мөр',
      what: 'Мэндчилгээ ба өнөөдөр хамгийн чухал нэг санамж. Эрэмбэ: eBarimt-ийн тодорхойгүй баримт → НӨАТ-ын тайлангийн хугацаа ≤ 3 хоног → тохируулаагүй eBarimt → хугацаа хэтэрсэн авлага.',
      why: 'Бичил бизнесийн эзэн өдөрт нэг удаа л системээ нээдэг. Хуулийн хугацаатай (НӨАТ-ын тайлан 10-ны дотор) эсвэл татварын эрсдэлтэй (eBarimt UNKNOWN) зүйлийг эхэнд харуулна.',
      bc: 'Headline RC (Page 1442 "Headline RC Business Manager").',
      rules: ['UX-HOME-11', 'FR-PLT-015'],
      data: ['ebarimt.ebarimt_document.status', 'tax.vat_return_period.due_date'],
      doc: [{ file: UI, section: '3.5 Мэдээний мөр (headline)' }]
    },
    'home.actions': {
      title: 'Шуурхай үйлдэл',
      what: 'Хамгийн их хийгддэг баримтыг нэг товчоор эхлүүлнэ. "Шинэ нэхэмжлэх" дарахад DSI-###### дугаартай ноорог үүсэж засварлагч нээгдэнэ.',
      why: 'Баримт эхэнд (UXP-01): хэрэглэгч журнал биш, баримт бичдэг. Эзэн ба нягтлангийн товч өөр.',
      bc: 'Role Center-ийн "Actions" (Creation) хэсэг.',
      rules: ['UXP-01', 'BR-SAL-01'],
      data: ['sales.sales_header'],
      doc: [{ file: UI, section: '3.2 Нүүр хуудсын бүрэлдэхүүн' }]
    },
    'home.cue-cash': {
      title: 'Мөнгөн хөрөнгө (CUE-03)',
      what: 'Касс, Хаан, Голомт банкны өнөөдрийн үлдэгдлийн нийлбэр. Банкны дэд дэвтрээс (bank_ledger_entry) тооцно; доорх "Тооцоог харах"-д данс бүрээр задлав.',
      why: 'Эзний хамгийн эхний асуулт: "мөнгө хаана байна". Дэд дэвтэр нь 1100/1110/1111 дансны G/L үлдэгдэлтэй тэнцэх ёстой (шалгалт #checks).',
      bc: 'Finance Cue (Table 9054) "Cash Accounts Balance"; Bank Account Ledger Entry (Table 271).',
      rules: ['CUE-03', 'BR-PST-42', 'UX-HOME-07'],
      data: ['bank.bank_ledger_entry.amount', 'bank.v_bank_account_balance'],
      doc: [{ file: UI, section: '3.3 Cue-ийн каталог' }, { file: UI, section: '7.6 Товч хэлбэр (cue, KPI)' }]
    },
    'home.cue-overdue': {
      title: 'Хугацаа хэтэрсэн авлага (CUE-02)',
      what: 'Нээлттэй нэхэмжлэхийн үлдэгдлээс төлөх огноо нь өнөөдрөөс өмнө байгаа хэсэг ба харилцагчийн тоо. 0-ээс их бол "⚠ Арга хэмжээ" төлөвтэй.',
      why: 'Бичил бизнест мөнгөний урсгалын гол эрсдэл. Төлөх огноо нь баримтын огноо + төлбөрийн нөхцөлөөс тооцогдсон (BR-SAL-05).',
      bc: 'Activities Cue (Table 1313) "Overdue Sales Invoice Amount"; Cust. Ledger Entry (Table 21).',
      rules: ['CUE-02', 'BR-AR-15', 'D-F7'],
      data: ['party.cust_ledger_entry.due_date', 'party.cust_ledger_entry.remaining_amount'],
      doc: [{ file: UI, section: '3.3 Cue-ийн каталог' }, { file: '06-sales-receivables.md', section: '5.17 Насжилт (огноо D)' }]
    },
    'home.cue-ar': {
      title: 'Нийт авлага (CUE-16)',
      what: 'Бүх харилцагчийн авлагын үлдэгдэл = detailed бичилтийн нийлбэр. 1200 дансны G/L үлдэгдэлтэй яг тэнцүү.',
      why: 'Авлагын данс нь хяналтын данс: түүнд гараар бичихгүй, зөвхөн баримтаар бичигдэнэ (FR-GL-003), тиймээс дэд дэвтэр ба G/L үргэлж тэнцэнэ.',
      bc: 'Customer (Table 18) "Balance (LCY)" FlowField = Σ Detailed Cust. Ledg. Entry (Table 379).',
      rules: ['CUE-16', 'INV-11', 'D-F3'],
      data: ['party.detailed_cust_ledger_entry.amount', 'party.v_customer_balance'],
      doc: [{ file: '06-sales-receivables.md', section: '4.11 Авлагын дэд дэвтэр' }]
    },
    'home.cue-vat': {
      title: 'Төлөх НӨАТ, урьдчилсан (CUE-04)',
      what: 'Хамгийн эрт илгээгээгүй НӨАТ-ын үеийн (энд 9-р сар) борлуулалтын НӨАТ − баталгаажсан орцын НӨАТ. Илгээх хугацаа хүртэлх хоног ≤ 3 бол улаан. Эцсийн дүнг НӨАТ-ын тайлан (ТТ-03а) гаргана.',
      why: 'НӨАТ-ын тайлан дараа сарын 10-ны дотор (vat.return_due_day). Баталгаажаагүй орцын НӨАТ хасагдахгүй тул нягтлан ДДТД-ээ бүртгэх хэрэгтэйг харуулна.',
      bc: 'Finance Cue-тэй адил тоолуур; VAT Entry (Table 254), VAT Return Period (Table 737).',
      rules: ['CUE-04', 'UX-HOME-09', 'D-E4', 'D-E7'],
      data: ['tax.vat_entry.amount', 'tax.vat_entry.deductible_confirmed', 'tax.vat_return_period.due_date'],
      doc: [{ file: UI, section: '3.3 Cue-ийн каталог' }, { file: '08-tax-vat-mn.md', section: '4.6 Орцын НӨАТ-ын хасалт ба баталгаажуулалт' }]
    },
    'home.cue-ebarimt-errors': {
      title: 'eBarimt алдаа, тодорхойгүй (CUE-06)',
      what: 'PosAPI татгалзсан (ERROR) эсвэл хариу ирээгүй (UNKNOWN) баримтын тоо. UNKNOWN-ийг тусад нь тоолно.',
      why: 'Timeout болсон баримтыг автоматаар дахин илгээвэл давхар баримт үүсэх эрсдэлтэй тул UNKNOWN-ийг заавал гараар шийдвэрлэнэ (D-J2). Нэхэмжлэх өөрөө батлагдсан хэвээр; зөвхөн eBarimt асуудалтай.',
      bc: 'BC-д шууд байхгүй; ойролцоо нь Job Queue Entry-ийн алдаа ба E-Document-ийн төлөв.',
      rules: ['CUE-06', 'D-J2', 'FR-EBR-007', 'UX-EBR-06'],
      data: ['ebarimt.ebarimt_document.status'],
      doc: [{ file: '12-ebarimt-integration.md', section: '11.2 UNKNOWN-ийг шийдэх алхам' }, { file: 'DECISIONS.md', section: 'J. eBarimt' }]
    },
    'home.cue-ebarimt-pending': {
      title: 'eBarimt хүлээгдэж буй (CUE-05)',
      what: 'Outbox-д орсон боловч хараахан бүртгэгдээгүй (PENDING/SENT) баримт ба хамгийн хуучных нь нас. 24 цагаас хуучин бол улаан.',
      why: 'B2B баримт posting-ийн дараа асинхроноор илгээгддэг. Удаан хүлээгдэж байгаа нь worker эсвэл PosAPI-ийн асуудлыг илтгэнэ.',
      bc: 'Job Queue Entries (Table 472)-тэй ойролцоо.',
      rules: ['CUE-05', 'D-J2', 'FR-EBR-006'],
      data: ['ebarimt.ebarimt_document.status', 'integration.outbox'],
      doc: [{ file: '12-ebarimt-integration.md', section: '14.3 Alert ба тайлан' }]
    },
    'home.cue-lottery': {
      title: 'Сугалааны үлдэгдэл (CUE-08)',
      what: 'Компанийн баримтыг илгээдэг PosAPI instance-ийн сугалааны дугаарын үлдэгдэл ба сүүлийн sendData хугацаа. Анхааруулах босго нь tax_parameter-ийн ebarimt.left_lotteries_warning (100).',
      why: 'Сугалаа дуусвал B2C баримт гаргах боломжгүй болно; sendData 48 цагаас удаан хийгдээгүй бол PosAPI түгжигдэх эрсдэлтэй.',
      bc: 'BC-д байхгүй (Монголын PosAPI-ийн онцлог).',
      rules: ['CUE-08', 'UX-HOME-08', 'D-E7'],
      data: ['ebarimt.posapi_instance.left_lotteries'],
      doc: [{ file: UI, section: '3.3 Cue-ийн каталог' }]
    },
    'home.cue-input-vat': {
      title: 'Баталгаажаагүй орцын НӨАТ (CUE-14)',
      what: 'Нийлүүлэгчийн ДДТД бүртгэгдээгүй эсвэл баталгаажаагүй худалдан авалтын VAT entry-ийн тоо ба дүн.',
      why: 'Орцын НӨАТ зөвхөн нийлүүлэгчийн eBarimt баталгаажсан үед хасагдана; эс бөгөөс компани илүү НӨАТ төлнө.',
      bc: 'VAT Entry (Table 254) — манай нэмэлт талбар deductible_confirmed.',
      rules: ['CUE-14', 'BR-TAX-50', 'D-E4'],
      data: ['tax.vat_entry.deductible_confirmed', 'tax.vat_entry.supplier_ebarimt_id'],
      doc: [{ file: '08-tax-vat-mn.md', section: '4.6 Орцын НӨАТ-ын хасалт ба баталгаажуулалт' }]
    },
    'home.chart': {
      title: 'Сарын борлуулалт',
      what: 'Сар бүрийн батлагдсан нэхэмжлэх − кредит нот, НӨАТ-гүй дүн. Баганын өндөр нь масштабаар (0-ээс эхэлсэн тэнхлэг); хулганаа эсвэл Tab-аар очиход яг дүн гарна. "Хүснэгтээр харах" нь ижил тоог хүснэгтээр харуулна.',
      why: 'Эзэн борлуулалтын чиг хандлагыг харна; хүртээмжийн шаардлагаар график бүр хүснэгт хувилбартай (UX-A11Y-14).',
      bc: 'Business Chart (Table 485 Business Chart Buffer) / "Trailing Sales Orders" chart.',
      rules: ['CUE-11', 'UX-A11Y-14'],
      data: ['sales.sales_invoice_header.amount', 'sales.sales_cr_memo_header.amount'],
      doc: [{ file: UI, section: '3.2 Нүүр хуудсын бүрэлдэхүүн' }]
    },
    'home.overdue': {
      title: 'Хугацаа хэтэрсэн топ 5',
      what: 'Төлөх огноо өнгөрсөн нээлттэй авлагаар харилцагчдыг эрэмбэлэв. "Хоног" = өнөөдөр − хамгийн эрт хэтэрсэн баримтын төлөх огноо.',
      why: 'Хэнээс эхэлж мөнгө нэхэхийг шийдэхэд. Насжилтын бүлэг (0–30 / 31–60 / 61–90 / 90+) нь detailed бичилтээс тооцогдоно.',
      bc: 'Aged Accounts Receivable (Report 120); Role Center-ийн "Overdue customers" хэсэг.',
      rules: ['D-F7', 'BR-AR-05', 'FR-RPT-004'],
      data: ['party.cust_ledger_entry.due_date', 'party.detailed_cust_ledger_entry'],
      doc: [{ file: '10-periods-closing-reporting.md', section: '6.10 Насжилтын хоног' }]
    },
    'home.checklist': {
      title: 'Сарын хаалтын шалгах хуудас',
      what: '9-р сарыг хаахаас өмнө автоматаар шалгах мөрүүд: банкны тулгалт, кассын тооллого, Маягт А-гийн харгалзаа, eBarimt, орцын НӨАТ, НӨАТ-ын хаалт, ноорог, дэд дэвтэр = G/L, МГТ ангилал, цалин. Төлөв нь OK / Анхаарах / Хаалт зогсооно.',
      why: 'Монголын бичил бизнесийн сарын хаалтын дараалал (баримт → тулгалт → НӨАТ → цалин → тайлан → түгжих). BLOCKING мөр байвал үеийг хаахгүй.',
      bc: 'BC-д бүрэн ижил хуудас байхгүй; Accounting Periods (Table 50) ба "Close Income Statement"-ийн өмнөх шалгалтууд.',
      rules: ['BR-PER-30', 'BR-PER-31', 'BR-PER-33', 'BR-PER-35', 'BR-PER-38', 'FR-GL-025'],
      data: ['gl.accounting_period.status', 'bank.bank_ledger_entry.statement_status'],
      doc: [{ file: '10-periods-closing-reporting.md', section: '4.4 Сарын хаалтын шалгах хуудас (BR-PER-30..45)' }]
    }
  });
})();
