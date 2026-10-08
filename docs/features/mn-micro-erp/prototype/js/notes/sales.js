/* js/notes/sales.js — explanation notes for #sales-invoices, #sales-invoice, #posted-invoice (js/screens/sales.js). */
(function () {
  'use strict';
  var SAL = '06-sales-receivables.md', UI = '15-ui-ux.md', EB = '12-ebarimt-integration.md';
  var N = window.ERP.notes;

  N.register('sales-invoices', 'Борлуулалтын нэхэмжлэх — жагсаалт', {
    'sales.list-tabs': {
      title: 'Ноорог ба батлагдсан баримт',
      what: 'Ноорог нь засагдах боломжтой, завсартай цувралын дугаартай (DSI-######). Батлагдсан нэхэмжлэх, кредит нот нь хуулийн завсаргүй дугаартай (SI-2026-#####, SC-2026-#####) бөгөөд засагдахгүй.',
      why: 'Хуулийн баримтын дугаар цоорхойгүй байх ёстой; ноорог устгахад хуулийн цувралд завсар үүсэхгүйн тулд дугаарыг зөвхөн батлах үед олгоно.',
      bc: 'Sales Invoices (Page 9301) ба Posted Sales Invoices (Page 143); No. Series (Table 308/309).',
      rules: ['D-C7', 'BR-SAL-01', 'BR-SAL-08', 'BR-SAL-31', 'FR-SAL-014'],
      data: ['sales.sales_header.no', 'sales.sales_invoice_header.no', 'platform.number_series_counter'],
      doc: [{ file: SAL, section: '4.9 Ноорогийн төлөв ба жагсаалт' }, { file: '05-posting-engine.md', section: '4.4 Дугаарлалт' }]
    },
    'sales.posted-list': {
      title: 'Төлбөр ба eBarimt-ийн хоёр төлөв',
      what: 'Батлагдсан мөр бүр хоёр тэмдэгтэй: төлбөрийн төлөв (Төлөгдөөгүй / Хэсэгчлэн / Төлөгдсөн / Хугацаа хэтэрсэн) ба eBarimt-ийн төлөв (Бүртгэгдсэн / Хүлээгдэж буй / Алдаа / UNKNOWN / Засварлагдсан). Мөр дарж баримтыг нээнэ.',
      why: 'Төлбөрийн төлөв авлагын бичилтийн үлдэгдлээс (remaining = 0 → Төлөгдсөн), eBarimt-ийн төлөв гинжийн read model-оос гарна. Хоёулаа серверийнх; UI зөвхөн харуулна.',
      bc: 'Posted Sales Invoices (Page 143) "Closed", "Remaining Amount"; Cust. Ledger Entry (Table 21).',
      rules: ['BR-SAL-90', 'UX-DOC-02', 'UX-DOC-14', 'FR-SAL-014'],
      data: ['party.cust_ledger_entry.remaining_amount', 'ebarimt.v_source_document_status'],
      doc: [{ file: UI, section: '5.1 Төлөвийн загвар ба тэмдэг' }, { file: EB, section: '9.4 Posted баримт дээр харагдах eBarimt төлөв (read model)' }]
    }
  });

  N.register('sales-invoice', 'Борлуулалтын нэхэмжлэх — ноорог', {
    'sales.actions': {
      title: 'Үйлдлийн мөр',
      what: '"Батлах (F9)" — бүх шалгалтын дараа нэг гүйлгээнд батална. "Урьдчилан харах" — яг ижил кодыг ажиллуулж үүсэх бичилтийг харуулаад буцаана. Ноорог устгах нь хуулийн дугаарт нөлөөлөхгүй.',
      why: 'Батлагдсан баримтыг устгахгүй, буцаана (UXP-05). Батлахаас өмнө харах нь нягтлангийн итгэлийг нэмнэ (UXP-03).',
      bc: 'Codeunit 80 "Sales-Post", Codeunit 81 "Sales-Post (Yes/No)", Codeunit 19 "Gen. Jnl.-Post Preview"; F9 товчлол.',
      rules: ['UX-POST-05', 'UX-POST-08', 'BR-SAL-30', 'BR-SAL-08', 'D-C6'],
      data: ['sales.sales_header', 'gl.gl_register'],
      doc: [{ file: UI, section: '5.4 Батлах (post) урсгал' }, { file: SAL, section: '4.4 Батлах (posting)' }]
    },
    'sales.customer': {
      title: 'Харилцагч ба snapshot',
      what: 'Харилцагч сонгоход posting group, НӨАТ-ын бүлэг, төлбөрийн нөхцөл ба хэлбэр, "Үнэ НӨАТ-тэй" толгойд хуулагдана (snapshot). Мөртэй үед солиход баталгаажуулна; үнэ өөрчлөгдөхгүй, НӨАТ ба данс дахин тооцогдоно.',
      why: 'Мастер өгөгдлийг дараа өөрчлөх нь ноорог ба батлагдсан баримтад нөлөөлөх ёсгүй. Блоклосон харилцагчид нэхэмжлэх үүсгэхгүй.',
      bc: 'Sales Header (Table 36) Validate "Sell-to Customer No." → Customer Posting Group, Gen./VAT Bus. Posting Group; "Do you want to change…" dialog.',
      rules: ['BR-SAL-02', 'BR-SAL-03', 'BR-SAL-04', 'UX-DOC-03', 'FR-SAL-001'],
      data: ['sales.sales_header.customer_posting_group_id', 'sales.sales_header.vat_bus_posting_group_id', 'party.customer'],
      doc: [{ file: SAL, section: '4.1 Ноорог ба толгой' }, { file: UI, section: '5.2 Толгой ба мөр' }]
    },
    'sales.posting-date': {
      title: 'Бүртгэлийн огноо ба үе',
      what: 'Ledger-т бичигдэх огноо. Анхдагч нь ажлын огноо (2026.10.08). Огноо нь нээлттэй нягтлан бодох үе ба компанийн posting цонхонд байх ёстой; 1–8-р сар хаалттай тул тэр огноогоор батлахгүй.',
      why: 'Хаасан сарын тайлан өөрчлөгдөхгүй байх (D-D3). Нэхэмжлэхийн НӨАТ-ын огноо = бүртгэлийн огноо.',
      bc: 'Sales Header "Posting Date"; G/L Setup / User Setup "Allow Posting From/To"; Accounting Period (Table 50).',
      rules: ['BR-SAL-06', 'BR-SAL-34', 'BR-SAL-35', 'D-D3', 'D-E9', 'INV-06'],
      data: ['sales.sales_header.posting_date', 'gl.accounting_period.status', 'platform.company_setup.allow_posting_from'],
      doc: [{ file: SAL, section: '4.4 Батлах (posting)' }]
    },
    'sales.due-date': {
      title: 'Төлөх огноо',
      what: 'Баримтын огноо + төлбөрийн нөхцлийн томьёо (30D, 15D, CM = сарын эцэс). Гараар засварлаж болно; нөхцөл солиход дахин тооцогдоно.',
      why: 'Насжилт, хугацаа хэтэрсэн авлага, cue бүгд энэ огноогоор тооцогдоно.',
      bc: 'Payment Terms (Table 3) "Due Date Calculation" (DateFormula), CalcDate.',
      rules: ['BR-SAL-05', 'UX-DOC-05', 'FR-PTY-006'],
      data: ['sales.sales_header.due_date', 'party.payment_terms.due_date_calculation'],
      doc: [{ file: SAL, section: '5.3 Төлөх огноо (DateFormula)' }]
    },
    'sales.payment-method': {
      title: 'Төлбөрийн хэлбэр ба бэлэн борлуулалт',
      what: '"Бэлэн мөнгө" хэлбэр нь касстай холбоотой (balancing account). Ийм нэхэмжлэхийг батлахад хоёр дахь ваучер (ижил SI дугаартай) үүсч, касс Дт / авлага Кт бичигдэн, кассын орлогын баримт МХ-1 (KO-2026-#####) олгогдож нэхэмжлэхтэй автоматаар тулгагдана.',
      why: 'Дэлгүүрийн бэлэн борлуулалтыг нэг товчоор: нэхэмжлэх + төлбөр. eBarimt-д төлбөрийн код нь payment_method-оос (CASH, BANK_TRANSFER…).',
      bc: 'Payment Method (Table 289) "Bal. Account No."; Sales-Post-ийн "PostBalancingEntry".',
      rules: ['D-F5', 'BR-SAL-50', 'BR-SAL-53', 'BR-SAL-54', 'BR-SAL-55', 'FR-SAL-006'],
      data: ['party.payment_method.bal_account_id', 'bank.posted_cash_voucher'],
      doc: [{ file: SAL, section: '4.6 Бэлэн борлуулалт (харьцсан данс)' }]
    },
    'sales.piv': {
      title: 'Үнэ НӨАТ-тэй',
      what: 'Асаалттай бол мөрийн үнэ НӨАТ шингэсэн; НӨАТ = rv(G × 10 / 110), суурь = G − НӨАТ. Мөртэй үед солиход үнийг хөрвүүлэх эсэхийг асууна (× 110/100 эсвэл × 100/110, 0.00001 нарийвчлал).',
      why: 'Иргэдэд НӨАТ-тэй үнэ, ААН-д НӨАТ-гүй үнэ хэлэх нь түгээмэл. Мөр бүрийг /1.1 хийхгүй, бүлгээр нэг удаа тооцно.',
      bc: 'Sales Header "Prices Including VAT"; Sales Line "Unit Price"-ийн хөрвүүлэлт.',
      rules: ['BR-SAL-13', 'BR-SAL-26', 'BR-SAL-27', 'FR-TAX-005'],
      data: ['sales.sales_header.prices_including_vat', 'sales.sales_line.unit_price'],
      doc: [{ file: SAL, section: '6.4 НӨАТ — үнэ НӨАТ-тэй (`prices_including_vat = true`)' }]
    },
    'sales.ebarimt-type': {
      title: 'eBarimt баримтын төрөл',
      what: '"Автомат": 11 оронтой ТТД-тэй ААН бол B2B_RECEIPT (худалдан авагчийн ТТД-тэй), бусад тохиолдолд B2C_RECEIPT (иргэний дугаар заавал биш). "Үгүй" сонголт тусгай эрх, шалтгаан шаардана.',
      why: 'R1-д нэхэмжлэх бүр батлахад баримт гаргана (*_INVOICE урсгал R2). B2B-д ТТД, B2C-д consumerNo л илгээгдэнэ.',
      bc: 'BC-д байхгүй (MN нутагшуулалт).',
      rules: ['D-J1', 'UX-DOC-06', 'FR-EBR-002', 'BR-SAL-98'],
      data: ['sales.sales_header.ebarimt_receipt_type', 'sales.sales_header.ebarimt_customer_tin', 'sales.sales_header.ebarimt_consumer_no'],
      doc: [{ file: EB, section: '4.2 Pseudo-code' }]
    },
    'sales.lines': {
      title: 'Мөрүүд: бараа ба данс',
      what: '"Бараа" мөр нь барааны карт (нэгж, үнэ, НӨАТ-ын бүлэг, БҮНА код)-аас бөглөгдөнө. "Данс" мөр нь зөвхөн шууд бичих (direct posting) зөвшөөрөгдсөн орлогын данс сонгоно — 1200, 2300 г.м. хяналтын данс сонгогдохгүй. Мөрийн дүн = r(тоо × үнэ) − хөнгөлөлт.',
      why: 'Хяналтын данс руу баримтгүй бичвэл дэд дэвтэр G/L-тэй зөрнө. БҮНА (7 орон) код eBarimt-д заавал.',
      bc: 'Sales Line (Table 37) Type = Item / G/L Account; G/L Account "Direct Posting".',
      rules: ['BR-SAL-10', 'BR-SAL-11', 'BR-SAL-12', 'BR-SAL-14', 'UX-SAL-02', 'MAP-30'],
      data: ['sales.sales_line.line_type', 'sales.sales_line.unit_price', 'inv.item.classification_code', 'gl.gl_account.direct_posting'],
      doc: [{ file: SAL, section: '4.2 Мөр' }, { file: UI, section: '16.2 Борлуулалтын нэхэмжлэх (S-SAL-02)' }]
    },
    'sales.totals': {
      title: 'Нийлбэрийн самбар',
      what: 'Дүн (НӨАТ-гүй), НӨАТ-ыг identifier бүрээр ("НӨАТ 10%", "Чөлөөлөгдөх"), нийт дүн. Мөр бүрийн НӨАТ-ыг мөрөнд биш, энд identifier-ээр харуулна.',
      why: 'НӨАТ баримтын түвшинд бөөрөнхийлөгдөнө; мөр бүрийг тусад нь бөөрөнхийлвэл нийлбэр 0.01-ээр зөрөх тохиолдол гарна (доорх "Тооцоог харах").',
      bc: 'Sales Statistics (Page 160) / Document Totals (Codeunit 57).',
      rules: ['UX-DOC-07', 'UX-SAL-05', 'BR-SAL-23'],
      data: ['sales.sales_header.amount', 'sales.sales_header.amount_including_vat'],
      doc: [{ file: UI, section: '5.3 Нийлбэрийн самбар' }]
    },
    'sales.calc': {
      title: 'Тооцоог харах: НӨАТ-ын хуваарилалт',
      what: 'Мөрийн дүнгийн бөөрөнхийлөлт, НӨАТ-ын бүлэг бүрийн яг утга ба бөөрөнхийлсөн утга, мөрүүдэд running remainder-ээр хуваарилсан алхам бүрийг жинхэнэ тоогоор харуулна. "Тусад нь бөөрөнхийлвэл" багана нь буруу аргын үр дүн.',
      why: 'eBarimt-ийн бараа бүрийн НӨАТ-ын нийлбэр баримтын НӨАТ-тай яг тэнцүү байх ёстой (D-E3). Бүх тооцоо бүхэл мөнгөн нэгжээр (цент), тэгээс холдуулж бөөрөнхийлнө.',
      bc: 'Sales Line "UpdateVATOnLines" + DivideAmount (Codeunit 80 / Table 37), VAT Amount Line (Table 290).',
      rules: ['D-E3', 'BR-SAL-18', 'BR-SAL-22', 'BR-SAL-26', 'FR-TAX-004', 'FR-SAL-003'],
      data: ['sales.sales_line.amount', 'sales.sales_line.amount_including_vat', 'sales.sales_line.vat_identifier'],
      doc: [{ file: SAL, section: '6.2 Мөрийн дүн (C1–C3)' }, { file: SAL, section: '6.3 НӨАТ — үнэ НӨАТ-гүй (`prices_including_vat = false`)' }, { file: 'DECISIONS.md', section: 'C. Мөнгө, дугаарлалт, ledger' }]
    },
    'sales.factbox-customer': {
      title: 'FactBox: харилцагч',
      what: 'Сонгосон харилцагчийн авлагын үлдэгдэл, хугацаа хэтэрсэн дүн, зээлийн хязгаар, сүүлийн төлбөр. Хязгаар хэтэрвэл батлахад анхааруулга гарна (блоклохгүй).',
      why: 'Нэхэмжлэх бичиж буй хүн харилцагчийн эрсдэлийг шууд харна.',
      bc: 'Customer Statistics FactBox (Page 9082), Credit Limit check (Codeunit 312 "Cust-Check Cr. Limit").',
      rules: ['BR-SAL-39', 'UX-SAL-08'],
      data: ['party.v_customer_balance', 'party.customer.credit_limit_lcy'],
      doc: [{ file: UI, section: '4.4 Хажуугийн самбар (FactBox)' }]
    },
    'sales.factbox-line': {
      title: 'FactBox: мөрийн данс тодорхойлолт',
      what: 'Сонгосон мөр аль орлогын дансанд бичигдэхийг харуулна: бараа бол General Posting Setup (Gen. Bus. × Gen. Prod., жишээ DOMESTIC × SERVICES → 5110), данс бол мөрийн данс; НӨАТ-ын данс VAT Posting Setup-аас (DOMESTIC × VAT10 → 2300); eBarimt taxType ба БҮНА код.',
      why: 'Хэрэглэгч дансны дугаар сонгохгүйгээр зөв данс руу бичигдэнэ; "*" нөөц мөр нь бүлэг тохируулаагүй үед ажиллана.',
      bc: 'General Posting Setup (Table 252), VAT Posting Setup (Table 325).',
      rules: ['D-F1', 'BR-SAL-40', 'BR-SAL-41', 'BR-SAL-42'],
      data: ['party.general_posting_setup.sales_account_id', 'tax.vat_posting_setup.sales_vat_account_id', 'tax.vat_posting_setup.ebarimt_tax_type'],
      doc: [{ file: SAL, section: '4.5 Данс тодорхойлох' }, { file: 'db/seed/README.md', section: '5. Posting group ба тохиргоо (`mn_30_posting.sql`)' }]
    },
    'sales.preview': {
      title: 'Батлахын өмнө харах',
      what: 'Ерөнхий дэвтэр (Дт = Кт шалгалттай), НӨАТ, авлага (header + detailed), банк/касс, eBarimt-ийн JSON-ийг баримтын дугаар "***"-аар харуулна. Ижил данс, бүлэгтэй мөрүүд posting buffer-т нэгтгэгдэнэ.',
      why: 'Preview нь батлахтай ижил кодыг ажиллуулаад ROLLBACK хийдэг тул харсан зүйл яг бичигдэнэ; QR/сугалаа гарахгүй.',
      bc: 'Codeunit 19 "Gen. Jnl.-Post Preview", Page 115 "G/L Posting Preview"; Invoice Posting Buffer (Table 55).',
      rules: ['UX-POST-08', 'UX-POST-09', 'UX-POST-10', 'BR-SAL-44', 'D-C6', 'FR-GL-011'],
      data: ['gl.gl_entry', 'tax.vat_entry', 'party.cust_ledger_entry', 'party.detailed_cust_ledger_entry'],
      doc: [{ file: UI, section: '5.5 Батлахын өмнө харах (preview)' }, { file: SAL, section: '5.7 Posting buffer ба G/L, VAT мөр' }, { file: '05-posting-engine.md', section: '4.3 Ваучер ба тэнцэл' }]
    }
  });

  N.register('posted-invoice', 'Батлагдсан нэхэмжлэх ба eBarimt', {
    'posted.ebarimt': {
      title: 'eBarimt-ийн самбар',
      what: 'Баримтын төрөл (B2B/B2C), үйлдэл (SAVE, засварт inactiveId, бүтэн буцаалтад DELETE), ДДТД (33 орон), billIdSuffix (POS + 6 оронтой тоолуур), taxType тус бүрийн дэд баримт.',
      why: 'eBarimt-ийн алдаа нэхэмжлэхийн ledger-т нөлөөлөхгүй — нэхэмжлэх батлагдсан хэвээр, зөвхөн eBarimt-ийн баримт асуудалтай байж болно.',
      bc: 'BC-д байхгүй; ойролцоо нь E-Document (Table 6121) ба түүний log.',
      rules: ['D-J1', 'UX-EBR-06', 'BIL-01', 'D-K4', 'FR-EBR-005'],
      data: ['ebarimt.ebarimt_document.ddtd', 'ebarimt.ebarimt_document.bill_id_suffix', 'ebarimt.ebarimt_sub_receipt'],
      doc: [{ file: EB, section: '5.2 Толгой (header)' }, { file: EB, section: '7. `billIdSuffix`' }]
    },
    'posted.timeline': {
      title: 'Төлөвийн түүх',
      what: 'PENDING (posting-ийн transaction дотор outbox-д бичигдсэн) → SENT (илгээж байна) → SUCCESS (ДДТД олгогдсон) / ERROR (татгалзсан) / UNKNOWN (timeout).',
      why: 'Илгээлтийг commit-ийн дараа асинхроноор хийдэг тул posting PosAPI-аас хамаарахгүй. Timeout болбол автоматаар дахин илгээхгүй (max_attempts = 1), гараар шийдвэрлэнэ.',
      bc: 'Job Queue Log Entry (Table 474)-тэй ойролцоо.',
      rules: ['D-J2', 'D-I6', 'FR-EBR-006', 'FR-EBR-007', 'FR-EBR-012'],
      data: ['ebarimt.ebarimt_document.status', 'ebarimt.ebarimt_document_event', 'integration.outbox'],
      doc: [{ file: EB, section: '9.2 Шилжилт' }]
    },
    'posted.json': {
      title: 'PosAPI руу илгээсэн JSON',
      what: 'POST /rest/receipt-ийн бие: толгой → receipts[] (taxType бүрд нэг) → items[] → payments[]. Бүх дүн НӨАТ шингэсэн, 2 оронтой тоо. Нийлбэрийг доороос дээш нэмнэ: qty × unitPrice = totalAmount; Σ items = receipt; Σ receipts = нийт; Σ payments = нийт.',
      why: 'PosAPI нийлбэрийн хүлцэлгүй. Хүсэлтийн JSON-ийг DB-д хадгалахгүй (customerTin, consumerNo агуулдаг) — snapshot-оос дахин угсарч hash-аар шалгана. qrData ба lottery хариунд л ирж, хэвлэх цонхонд нэг удаа харагдана; хаана ч хадгалагдахгүй (D-J3).',
      bc: 'BC-д байхгүй.',
      rules: ['AMT-01', 'AMT-03', 'AMT-05', 'AMT-21', 'AMT-23', 'MAP-01', 'MAP-24', 'D-J3', 'INV-15'],
      data: ['ebarimt.ebarimt_document.request_sha256', 'ebarimt.ebarimt_document_line'],
      doc: [{ file: EB, section: '6.1 Хатуу дүрэм' }, { file: EB, section: '6.2 Item угсрах алгоритм' }, { file: EB, section: '22.1 Жишээ A — B2C, бэлэн, `VAT_ABLE` (нэхэмжлэх SI-2026-00123)' }]
    },
    'posted.ebarimt-problem': {
      title: 'eBarimt асуудалтай баримт',
      what: 'ERROR эсвэл UNKNOWN төлөвтэй үед харагдана. Нэхэмжлэх ба түүний бичилт хэвийн; асуудлыг eBarimt хяналтын дэлгэцээр шийдвэрлэнэ (UNKNOWN бол порталаас шалгаж "Бүртгэгдсэн / Бүртгэгдээгүй" гэж тэмдэглэнэ).',
      why: 'Давхар баримт үүсгэхгүйн тулд хэрэглэгч баримтын хуудаснаас "Дахин илгээх" хийх боломжгүй.',
      bc: 'BC-д байхгүй.',
      rules: ['UX-EBR-01', 'UX-EBR-06', 'D-J2', 'FR-EBR-007'],
      data: ['ebarimt.ebarimt_document.status', 'ebarimt.ebarimt_document.error_code'],
      doc: [{ file: EB, section: '11.2 UNKNOWN-ийг шийдэх алхам' }]
    },
    'posted.entries': {
      title: 'Бичилтүүд (Navigate)',
      what: 'Энэ баримтаас үүссэн бүх ledger бичилт: G/L (entry №, гүйлгээ №, Дт/Кт), НӨАТ (суурь ба дүн, аль сарын хаалтад орсон), авлагын detailed бичилт (INITIAL ба тулгалтын APPLICATION), банк/касс.',
      why: 'Ledger нь append-only: засах, устгахгүй; залруулга шинэ бичилтээр. Гүйлгээ бүр Дт = Кт. Авлагын үлдэгдэл = detailed бичилтийн нийлбэр.',
      bc: 'Navigate (Page 344 "Find entries"); G/L Entry (Table 17), VAT Entry (Table 254), Cust. Ledger Entry (Table 21), Detailed Cust. Ledg. Entry (Table 379).',
      rules: ['D-C3', 'D-C4', 'D-C5', 'D-F3', 'INV-01', 'INV-04', 'BR-AR-01', 'FR-PLT-013'],
      data: ['gl.gl_entry.amount', 'gl.gl_entry.transaction_no', 'tax.vat_entry', 'party.detailed_cust_ledger_entry'],
      doc: [{ file: '05-posting-engine.md', section: '4.3 Ваучер ба тэнцэл' }, { file: '08-tax-vat-mn.md', section: '4.4 VAT entry ба posting' }, { file: SAL, section: '4.11 Авлагын дэд дэвтэр' }]
    },
    'posted.print': {
      title: 'eBarimt хэвлэх цонх',
      what: 'B2C баримт батлагдсан даруйд SYNC_FIRST горимоор илгээгдэж, хариуны qrData-аас QR, сугалааны дугаартай баримт нэг удаа гарна. Хаахад "QR кодыг дахин хэвлэх боломжгүй" гэж асууна. Дараа нь зөвхөн "ХУУЛБАР" (ДДТД-тэй, QR ба сугалаагүй) хэвлэгдэнэ. Энд QR нь жишээ дүрслэл.',
      why: 'qrData, lottery-г DB, лог, кэш, browser storage-д хадгалахыг хориглосон (D-J3, INV-15); тиймээс зөвхөн энэ цонхны санах ойд байгаад хаагдахад устна.',
      bc: 'BC-д байхгүй (Sales-Post + Print-тэй ойролцоо урсгал).',
      rules: ['D-J3', 'UX-EBR-02', 'UX-EBR-03', 'UX-EBR-05', 'UX-SEC-01', 'PRN-10', 'PRN-11'],
      data: ['(хадгалахгүй) qrData', '(хадгалахгүй) lottery'],
      doc: [{ file: EB, section: '13.1 Хориг (D-J3, CMP-024)' }, { file: EB, section: '13.3 Дахин хэвлэх ба QR алдагдсан тохиолдол' }, { file: UI, section: '5.8 eBarimt-ийн төлөв ба хэвлэх цонх' }]
    }
  });
})();
