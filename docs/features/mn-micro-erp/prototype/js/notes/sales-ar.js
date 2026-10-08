/* =============================================================================
   js/notes/sales-ar.js — explanation notes for js/screens/sales-ar.js:
   #customers (S-PTY-01 + aging), #customer (S-PTY-02/05: card, ledger entries, aging, statement, applications),
   #cust-apply (S-PTY-07 apply entries), #credit-memo (S-SAL-04 + eBarimt return/correction), #ebarimt (S-EBR-02/05),
   #purchase-invoices / #purchase-invoice (S-PUR-01/02 draft editor with supplier ДДТД).
   doc.section = exact heading text of the spec file (tests/engine_check.js verifies it).
   ========================================================================== */
(function () {
  'use strict';
  var SAL = '06-sales-receivables.md', PUR = '07-purchases-payables.md', TAX = '08-tax-vat-mn.md', EB = '12-ebarimt-integration.md',
    UI = '15-ui-ux.md', PST = '05-posting-engine.md', DEC = 'DECISIONS.md';
  var N = window.ERP.notes;

  // ---------------------------------------------------------------------------
  // #customers, #customer
  // ---------------------------------------------------------------------------
  N.register('sales-ar', 'Харилцагч ба авлага (жагсаалт, карт, насжилт, хуулга)', {
    'ar.list': {
      title: 'Харилцагчдын жагсаалт ба үлдэгдэл',
      what: 'Харилцагч бүрийн одоогийн авлагын үлдэгдэл, хугацаа хэтэрсэн дүн, хамгийн их хоцролтын хоног, зээлийн хязгаарын ашиглалт. Үлдэгдлийг ledger-ийн detailed бичилтүүдийн нийлбэрээр (Σ amount) тооцно — тусад нь хадгалсан "balance" талбар байхгүй.',
      why: 'Бизнес эзэн хэнээс хэдийг, хэр удаан авах ёстойгоо нэг дороос харна. Үлдэгдлийг detailed бичилтээс гаргаснаар дэд дэвтэр ба 1200 "Дансны авлага" данс үргэлж тэнцэнэ (INV-11).',
      bc: 'Customer List (Page 22) — "Balance (LCY)", "Balance Due (LCY)" FlowField; Detailed Cust. Ledg. Entry (Table 379).',
      rules: ['FR-PTY-001', 'BR-AR-05', 'BR-AR-71', 'INV-11'],
      data: ['party.customer', 'party.v_customer_balance', 'party.detailed_cust_ledger_entry.amount'],
      doc: [{ file: UI, section: '15.4 Харилцагч, нийлүүлэгч, бараа' }, { file: SAL, section: '4.11 Авлагын дэд дэвтэр' }]
    },
    'ar.type': {
      title: 'B2B / B2C төрөл ба ТТД',
      what: 'Хуулийн этгээд (11 оронтой ТТД-тэй) харилцагчид eBarimt-ийн B2B баримт (худалдан авагчийн ТТД-тэй), иргэнд B2C баримт (сугалаатай) гарна. "Автомат" анхдагч нь төрлийг ТТД-ээр шийднэ. Иргэний регистр маскаар (УБ******33) харагдана.',
      why: 'B2B баримт нь худалдан авагчийн орцын НӨАТ-ын нотолгоо болдог тул ТТД заавал. Иргэний хувийн мэдээллийг маскалж хамгаална (13 SEC-PII).',
      bc: 'BC-д байхгүй (Монголын нэмэлт). Ойролцоо: Customer "VAT Registration No.", "Partner Type" (Company / Person).',
      rules: ['D-J1', 'FR-EBR-002', 'FR-PTY-004', 'UX-CUST-03'],
      data: ['party.customer.kind', 'party.customer.tin', 'party.customer.default_ebarimt_type'],
      doc: [{ file: EB, section: '4.1 Модны зураг' }, { file: UI, section: '16.7 Харилцагчийн карт (S-PTY-02)' }]
    },
    'ar.aging': {
      title: 'Авлагын насжилт (0–30 / 31–60 / 61–90 / 90+)',
      what: 'Нээлттэй бичилт бүрийн хоцролтыг <em>огноо D − төлөх огноо</em>-оор тооцож бүлэгт хуваана: "Хугацаа болоогүй" (≤ −1), 0–30, 31–60, 61–90, 90+. Сөрөг үлдэгдэл (тулгагдаагүй төлбөр, кредит нот) тусдаа "Урьдчилгаа / кредит" баганад. Огноо D-г сольж өнгөрсөн байдлыг харж болно.',
      why: 'Насжилт нь авлагын эрсдэл ба найдваргүй авлагын нөөцийн үндэс. Үлдэгдлийг detailed бичилтээс D хүртэл тооцдог тул D-ээс хойш төлөгдсөн нэхэмжлэх D-ийн байдлаар бүтэн үлдэгдлээрээ гарна (BR-AR-67).',
      bc: 'Report 120 "Aged Accounts Receivable" (Aging by Due Date); Detailed Cust. Ledg. Entry (Table 379).',
      rules: ['D-F7', 'BR-AR-65', 'BR-AR-66', 'BR-AR-67', 'BR-AR-68', 'BR-AR-69', 'FR-RPT-004'],
      data: ['rpt.aging_bucket_set', 'rpt.aging_bucket', 'party.detailed_cust_ledger_entry.posting_date', 'party.cust_ledger_entry.due_date'],
      doc: [{ file: SAL, section: '4.15 Хуулга ба насжилт' }, { file: SAL, section: '5.17 Насжилт (огноо D)' }]
    },
    'ar.card-info': {
      title: 'Харилцагчийн карт: posting group ба нөхцөл',
      what: 'Харилцагчийн бүлэг (DOMESTIC) нь авлагын хяналтын дансыг (1200 "Дансны авлага") тодорхойлно; бизнесийн ба НӨАТ-ын бүлэг нь орлогын данс ба НӨАТ-ын тохиргоог (General / VAT Posting Setup) сонгоно. Төлбөрийн нөхцөл төлөх огноог, төлбөрийн хэлбэр (CASH) бэлэн борлуулалтын автомат төлбөрийг заана.',
      why: 'Бүлгийг солих нь зөвхөн шинэ баримтад нөлөөлнө — батлагдсан бичилт posting үеийн бүлгээ хадгалдаг (UX-CUST-05, BR-AR-02). Ингэснээр авлагын данс хооронд дүн "нүүхгүй".',
      bc: 'Customer Card (Page 21): "Customer Posting Group", "Gen. Bus. Posting Group", "VAT Bus. Posting Group", "Payment Terms Code", "Payment Method Code".',
      rules: ['D-F1', 'FR-PTY-005', 'FR-PTY-006', 'UX-CUST-05', 'BR-AR-02', 'BR-AR-16'],
      data: ['party.customer.customer_posting_group_id', 'party.customer_posting_group.receivables_account_id', 'party.customer.credit_limit_lcy'],
      doc: [{ file: UI, section: '16.7 Харилцагчийн карт (S-PTY-02)' }, { file: SAL, section: '4.5 Данс тодорхойлох' }]
    },
    'ar.entries': {
      title: 'Авлагын бичилт (header) ба нээлттэй / хаалттай',
      what: 'Баримт бүр (нэхэмжлэх +, кредит нот −, төлбөр −, буцаан олголт +) яг нэг header бичилт үүсгэнэ. "Үлдэгдэл" ба "Нээлттэй" нь кэш: зөвхөн detailed бичилтээс шинэчлэгдэнэ. Мөрийг дэлгэхэд тухайн бичилтийн бүх detailed хөдөлгөөн (INITIAL, APPLICATION, unapply) харагдана.',
      why: 'BC-ийн загвар: анхны дүн өөрчлөгдөхгүй, тулгалт бүр тусдаа мөр болж үлдэнэ (append-only). Ингэснээр хэзээ, ямар төлбөрөөр хаагдсаныг аудит хийнэ.',
      bc: 'Customer Ledger Entries (Page 25), Cust. Ledger Entry (Table 21): "Remaining Amount", "Open", "Closed by Entry No.".',
      rules: ['D-F3', 'FR-PTY-007', 'BR-AR-01', 'BR-AR-03', 'BR-AR-04', 'BR-AR-31'],
      data: ['party.cust_ledger_entry.remaining_amount', 'party.cust_ledger_entry.open', 'party.cust_ledger_entry.closed_by_entry_no'],
      doc: [{ file: SAL, section: '3.7 `party` — авлагын дэд дэвтэр (D-K2)' }, { file: SAL, section: '4.11 Авлагын дэд дэвтэр' }]
    },
    'ar.detailed': {
      title: 'Detailed бичилт (INITIAL / APPLICATION)',
      what: 'INITIAL = баримтын анхны дүн. APPLICATION мөрүүд хосоороо үүснэ: тулгагдаж буй (хуучин) бичилтэд −sign(Old)·a, тулгаж буй (шинэ) бичилтэд +sign(Old)·a, хоёулаа нэг application №-тэй. Батлагдсан бичилт хооронд тулгавал гүйлгээ № хоосон (G/L үүсэхгүй). Unapply нь толин тусгал мөр нэмнэ, хуучныг устгахгүй.',
      why: 'Үлдэгдэл = Σ detailed (INV-04) тул ямар ч огноогоор үлдэгдэл, насжилт, хуулгыг дахин тооцох боломжтой. MNT-д тулгалт авлагын G/L-д нөлөөгүй (хоёр мөр нийлбэрээрээ 0).',
      bc: 'Detailed Cust. Ledg. Entry (Table 379): "Entry Type" (Initial Entry / Application), "Applied Cust. Ledger Entry No.", "Unapplied", "Unapplied by Entry No.".',
      rules: ['INV-04', 'BR-AR-23', 'BR-AR-24', 'BR-AR-25', 'BR-AR-44', 'D-C4'],
      data: ['party.detailed_cust_ledger_entry.entry_type', 'party.detailed_cust_ledger_entry.application_no', 'party.detailed_cust_ledger_entry.applied_cust_ledger_entry_no', 'party.detailed_cust_ledger_entry.transaction_no'],
      doc: [{ file: SAL, section: '3.7 `party` — авлагын дэд дэвтэр (D-K2)' }, { file: SAL, section: '6.11 Тулгалтын дүн' }]
    },
    'ar.statement': {
      title: 'Дансны хуулга (тооцоо нийлсэн акт)',
      what: 'Сонгосон хугацааны [F, T] хуулга: эхний үлдэгдэл = Σ detailed (огноо < F); мөр = APPLICATION-аас бусад detailed мөр; эцсийн үлдэгдэл = Σ detailed (огноо ≤ T). Доор нь T-ийн байдлаарх нээлттэй баримт, насжилттай.',
      why: 'Харилцагчтай тооцоо нийлэх (ТМ-2..4 загварын акт) ба өрийн нотолгоо. Эхний + Σ мөр = эцсийн (BR-AR-61) — тулгалтын мөр нэг харилцагчид нийлбэрээрээ 0 тул хасагдсан ч тэнцэнэ.',
      bc: 'Report 116 "Statement" (Customer Statement), Report 1316 "Standard Statement".',
      rules: ['FR-RPT-003', 'BR-AR-60', 'BR-AR-61', 'BR-AR-62', 'BR-AR-63'],
      data: ['party.detailed_cust_ledger_entry', 'party.cust_ledger_entry.due_date', 'platform.document_signature'],
      doc: [{ file: SAL, section: '5.18.1 Хуулга (S-RPT-04, FR-RPT-003)' }, { file: SAL, section: '4.15 Хуулга ба насжилт' }]
    },
    'ar.applications': {
      title: 'Тулгалтууд ба unapply (LIFO)',
      what: 'Харилцагчийн бүх тулгалтыг application №-ээр бүлэглэв: posting доторх (төлбөр, бэлэн борлуулалт, кредит нот — гүйлгээтэй) ба батлагдсан бичилт хооронд (G/L-гүй). "Буцаах" нь тухайн тулгалтын бүх мөрийг толин тусгалаар цуцалж үлдэгдлийг сэргээнэ. Нэг бичилтэд хожуу тулгалт байвал эхлээд түүнийг буцаана (хатуу LIFO).',
      why: 'Буруу нэхэмжлэхэд тулгасан төлбөрийг баримтыг буцаахгүйгээр зөв нэхэмжлэхэд шилжүүлэх боломж. LIFO нь detailed мөрийн дарааллыг тууштай байлгана.',
      bc: 'Codeunit 226 "CustEntry-Apply Posted Entries" (Unapply), Page 623 "Unapply Customer Entries", Applied Customer Entries (Page 62).',
      rules: ['FR-PTY-011', 'BR-AR-40', 'BR-AR-41', 'BR-AR-42', 'BR-AR-45', 'BR-AR-47', 'BR-AR-48'],
      data: ['party.detailed_cust_ledger_entry.unapplied', 'party.detailed_cust_ledger_entry.unapplied_by_entry_no'],
      doc: [{ file: SAL, section: '4.13 Unapply' }, { file: SAL, section: 'P6. Тулгалт буцаах (LIFO, FR-PTY-011)' }]
    },
    'ar.payment': {
      title: 'Төлбөр бүртгэх (Applies-to Doc.)',
      what: 'Нэхэмжлэх сонговол төлбөр батлагдахдаа тухайн нэхэмжлэхэд шууд тулгагдана (posting доторх тулгалт, гүйлгээтэй). Тулгах баримтгүй бол төлбөр нээлттэй "урьдчилгаа" бичилт болж үлдээд дараа нь тулгагдана. Банк → BR-2026-#####, касс → МХ-1 KO-2026-#####.',
      why: 'Бичил бизнест ихэнх төлбөр нэг нэхэмжлэхийг төлдөг; илүү төлсөн дүн харилцагчийн кредит болж үлдэнэ (D-F4). Posting: банк/касс Дт, 1200 Кт.',
      bc: 'Cash Receipt Journal (Page 255) "Applies-to Doc. No.", Codeunit 12 "Gen. Jnl.-Post Line"; Payment Registration (Page 981).',
      rules: ['FR-BNK-006', 'FR-PTY-009', 'FR-PTY-012', 'BR-AR-29', 'BR-AR-50', 'D-F4'],
      data: ['bank.bank_ledger_entry', 'party.cust_ledger_entry', 'gl.gl_entry'],
      doc: [{ file: SAL, section: '5.13.5 Нэхэмжлэхээс төлбөр бүртгэх (FR-BNK-006)' }, { file: SAL, section: '4.14 Урьдчилгаа' }]
    }
  });

  // ---------------------------------------------------------------------------
  // #cust-apply
  // ---------------------------------------------------------------------------
  N.register('cust-apply', 'Тулгалт хийх (Applies-to ID)', {
    'ap.applying': {
      title: 'Тулгаж буй бичилт (New)',
      what: 'Харилцагчийн нээлттэй сөрөг бичилт — тулгагдаагүй төлбөр эсвэл кредит нот. Түүний үлдэгдлийг сонгосон нэхэмжлэхүүдэд хуваарилна. Тулгагдаагүй төлбөр байхгүй бол эндээс шууд урьдчилгаа төлбөр бүртгэж болно.',
      why: 'Applies-to ID арга: нэг төлбөрөөр олон нэхэмжлэх хаах (FR-PTY-010). Батлагдсан бичилт хооронд хийх тул G/L бичилт үүсэхгүй.',
      bc: 'Apply Customer Entries (Page 232) — "Applying Entry", "Set Applies-to ID" (Shift+F11).',
      rules: ['FR-PTY-010', 'BR-AR-20', 'BR-AR-36', 'D-F3'],
      data: ['party.application_draft.is_applying_entry', 'party.cust_ledger_entry.remaining_amount'],
      doc: [{ file: SAL, section: '5.13 Тулгалт (`IApplicationService`, Parties)' }, { file: UI, section: '15.4 Харилцагч, нийлүүлэгч, бараа' }]
    },
    'ap.targets': {
      title: 'Нээлттэй нэхэмжлэх ба тулгах дүн',
      what: 'Тулгах нэхэмжлэхүүдээ сонгоод дүнгээ оруулна (хоосон = бүх үлдэгдэл). "Төлөх огноогоор хуваарилах" нь үлдэгдлийг хамгийн эрт төлөх огноотойгоос эхлэн дүүргэнэ. Дүн нь нэхэмжлэхийн үлдэгдлээс, нийлбэр нь төлбөрийн үлдэгдлээс хэтэрч болохгүй.',
      why: 'Хос бүрийн дүн a = min(|New үлдэгдэл|, тулгах дүн) (BR-AR-22). Хэтрүүлэн тулгах нь INV-26 (|үлдэгдэл| ≤ |дүн|)-г зөрчинө.',
      bc: 'Apply Customer Entries: "Amount to Apply", "Appln. Remaining Amount"; Cust. Entry-Apply Posted Entries (Codeunit 226).',
      rules: ['BR-AR-22', 'BR-AR-34', 'BR-AR-35', 'BR-AR-16', 'INV-26'],
      data: ['party.application_draft.amount_to_apply', 'party.application_draft.sequence_no'],
      doc: [{ file: SAL, section: '4.12 Тулгалт' }, { file: SAL, section: 'P8. Олон нэхэмжлэхэд хуваарилах, G/L-гүй (FR-PTY-010 AC1)' }]
    },
    'ap.result': {
      title: 'Үүсэх detailed мөрүүд (APPLICATION)',
      what: 'Хос бүрд хоёр APPLICATION мөр: нэхэмжлэхэд −a, төлбөрт +a, нэг application №, огноо = тулгалтын огноо, гүйлгээ № хоосон. Нэхэмжлэхийн үлдэгдэл 0 болбол хаагдана ("Closed by Entry No." = төлбөр).',
      why: 'Авлагын G/L-д нөлөөгүй тул 1200 дансны үлдэгдэл өөрчлөгдөхгүй, зөвхөн дэд дэвтрийн нээлттэй/хаалттай байдал өөрчлөгдөнө. Огноо нээлттэй үед байх ёстой (BR-AR-28).',
      bc: 'Detailed Cust. Ledg. Entry (Table 379) Entry Type = Application, Transaction No. = 0.',
      rules: ['BR-AR-23', 'BR-AR-25', 'BR-AR-27', 'BR-AR-28', 'BR-AR-31', 'FR-PTY-013'],
      data: ['party.detailed_cust_ledger_entry', 'party.cust_ledger_entry.closed_at_date'],
      doc: [{ file: SAL, section: '6.11 Тулгалтын дүн' }, { file: SAL, section: 'P5. Хэсэгчилсэн төлбөр ба хоёр дахь төлбөр (FR-PTY-009 AC1, AC2)' }]
    }
  });

  // ---------------------------------------------------------------------------
  // #credit-memo
  // ---------------------------------------------------------------------------
  N.register('credit-memo', 'Кредит нот (буцаалт) ба eBarimt-ийн засвар', {
    'cm.source': {
      title: 'Эх нэхэмжлэхээс буцаалт',
      what: 'Батлагдсан нэхэмжлэхийн мөрүүд (үнэ, хөнгөлөлт, НӨАТ-ын бүлэг, eBarimt шинж) кредит нот руу хуулагдана; хэрэглэгч зөвхөн буцаах тоог багасгана. Өмнө нь буцаасан тоо хасагдаж, үлдсэнээс хэтрүүлэхгүй.',
      why: 'Нэг кредит нот яг нэг нэхэмжлэхийг засна (RET-03). Үнийг хуулсны ачаар НӨАТ ижил аргаар тооцогдож, eBarimt-ийн цэвэр төлөв (нэхэмжлэх − кредит нотууд) мөр бүрээр тулна.',
      bc: 'Sales Credit Memo (Page 44) "Get Posted Doc. Lines to Reverse", Codeunit 6620 "Copy Document Mgt."; Corrective credit memo (Codeunit 1303).',
      rules: ['FR-SAL-007', 'BR-SAL-62', 'BR-SAL-64', 'BR-SAL-66', 'BR-SAL-67', 'BR-SAL-73'],
      data: ['sales.sales_header.applies_to_doc_no', 'sales.sales_header.corrected_invoice_id', 'sales.sales_header.reason_code_id'],
      doc: [{ file: SAL, section: '4.7 Кредит нот' }, { file: UI, section: '5.9 Залруулах үйлдэл' }]
    },
    'cm.reason': {
      title: 'Шалтгааны код ба огноо',
      what: 'Шалтгаан заавал (Бараа буцаалт, Үнийн тохируулга, Нэхэмжлэх цуцлах…). Огноо анхдагчаар өнөөдөр, нээлттэй үед, эх нэхэмжлэхийн огнооноос өмнө биш.',
      why: 'Кредит нот нь орлого ба НӨАТ-ыг бууруулдаг тул аудитын мөрд шалтгаан шаардлагатай. Хаалттай сарыг өөрчлөхгүйн тулд залруулгыг одоогийн үед хийнэ (D-F6).',
      bc: 'Reason Code (Table 231), Sales Header "Reason Code"; "Posting Date".',
      rules: ['BR-SAL-61', 'BR-SAL-66', 'D-F6', 'BR-PST-20'],
      data: ['platform.reason_code', 'sales.sales_cr_memo_header.reason_code_id'],
      doc: [{ file: SAL, section: '4.7 Кредит нот' }, { file: DEC, section: 'F. Борлуулалт, худалдан авалт, авлага/өглөг' }]
    },
    'cm.posting': {
      title: 'Posting ба автомат тулгалт',
      what: 'Кредит нот орлого ба НӨАТ-ыг <strong>дебит</strong>, 1200 авлагыг кредит болгоно (мөрийг урвуулахгүй). Батлахад эх нэхэмжлэхийн нээлттэй үлдэгдэлд автоматаар тулгагдана; нэхэмжлэх аль хэдийн төлөгдсөн бол илүү дүн нь харилцагчийн кредит болж үлдэнэ. Бэлэн борлуулалтын кредит нот бол касснаас бэлэн буцаан олголт (МХ-2, KZ-2026-#####) хамт батлагдана.',
      why: 'BC-ийн Sales-Post логик: кредит нот = тусдаа баримт, SC-2026-##### завсаргүй дугаартай; эх нэхэмжлэх засагдахгүй.',
      bc: 'Codeunit 80 "Sales-Post" (Credit Memo), Applies-to Doc. Type/No.; Posted Sales Credit Memo (Table 114).',
      rules: ['BR-SAL-60', 'BR-SAL-63', 'D-F5', 'D-F6', 'D-C7'],
      data: ['sales.sales_cr_memo_header', 'gl.gl_entry', 'tax.vat_entry', 'party.detailed_cust_ledger_entry'],
      doc: [{ file: SAL, section: 'P3. Хэсэгчилсэн кредит нот, нэхэмжлэхтэй автомат тулгалт (FR-SAL-007 AC1)' }, { file: SAL, section: 'P9. Бэлэн борлуулалтын бараа буцаах: кредит нот + бэлэн буцаан олголт (P2-ийн үргэлжлэл)' }]
    },
    'cm.ebarimt': {
      title: 'eBarimt: DELETE, inactiveId, гараар цуцлах',
      what: 'Шийдвэрийн мод: гинжинд SENT/UNKNOWN байвал батлахгүй; PENDING/ERROR баримтыг CANCELLED (SUPERSEDED_BY) болгоно. Дараа нь цэвэр төлөв (нэхэмжлэх − бүх кредит нот) хоосон бол: B2C → <code>DELETE /rest/receipt</code>, B2B → порталд гараар цуцлах (MANUAL_VOID_REQUIRED). Хоосон биш бол засварласан бүтэн баримтыг <code>inactiveId</code> = сүүлийн хүчинтэй ДДТД-тэй шинээр илгээнэ.',
      why: 'eBarimt нь буцаалтын тусдаа "сөрөг" баримт хүлээж авдаггүй: шинэ баримт хуучныг бүхэлд нь орлоно. Өмнөх сарын засварт reportMonth цонх (сарын 1–7) мөрдөгдөнө.',
      bc: 'BC-д байхгүй (Монголын eBarimt). Ойролцоо: e-Invoicing-ийн corrective document.',
      rules: ['D-J4', 'FR-EBR-009', 'FR-EBR-010', 'FR-EBR-011', 'RET-02', 'RET-20', 'RET-30', 'RET-51', 'BR-SAL-76'],
      data: ['ebarimt.ebarimt_document.operation', 'ebarimt.ebarimt_document.inactive_ddtd', 'ebarimt.ebarimt_document.replaces_document_id', 'ebarimt.ebarimt_document.report_month'],
      doc: [{ file: EB, section: '12.1 Шийдвэрийн мод' }, { file: EB, section: '12.4 Бүтэн B2C буцаалт (`DELETE`)' }, { file: EB, section: '12.5 Хэсэгчилсэн буцаалт ба дүн засах (`inactiveId`)' }, { file: EB, section: '12.7 B2B-ийн бүтэн цуцлалт' }]
    },
    'cm.netstate': {
      title: 'Цэвэр төлөв (NetState)',
      what: 'Засварын баримт нь кредит нотын дүн биш, борлуулалтын <em>засварласан бүтэн төлөв</em>: нэхэмжлэхийн мөр бүрээс өмнөх ба одоогийн бүх кредит нотын тоо, дүн, НӨАТ-ыг хасна. Мөр 0 болбол баримтад орохгүй. Бүх мөр 0 = "хоосон".',
      why: 'НӨАТ-ыг дахин тооцохгүй, хасна (RET-12): шинэ баримтын НӨАТ = нэхэмжлэх − кредит нотуудын НӨАТ, тиймээс ERP ба eBarimt-ийн НӨАТ үргэлж тэнцэнэ (RET-11).',
      bc: 'BC-д байхгүй.',
      rules: ['RET-10', 'RET-11', 'RET-12', 'MAP-04'],
      data: ['ebarimt.ebarimt_document_line', 'ebarimt.ebarimt_sub_receipt'],
      doc: [{ file: EB, section: '12.3 Цэвэр (net) төлөвийг тооцох алгоритм' }, { file: EB, section: '12.6 `reportMonth` (нөхөн тайлагнах) цонх' }]
    }
  });

  // ---------------------------------------------------------------------------
  // #ebarimt
  // ---------------------------------------------------------------------------
  N.register('ebarimt', 'eBarimt хяналт (S-EBR-02, S-EBR-05)', {
    'eb.list': {
      title: 'eBarimt баримтын жагсаалт',
      what: 'Батлагдсан нэхэмжлэх, кредит нот бүрийн eBarimt баримт: төрөл (B2B/B2C), үйлдэл (SAVE / DELETE, inactiveId), billIdSuffix, дүн, төлөв, нас, оролдлого, ДДТД эсвэл алдаа. Анхдагч шүүлтүүр нь асуудалтай баримт: ERROR, UNKNOWN, 24 цагаас дээш PENDING.',
      why: 'Татварын хуулиар борлуулалт бүр 72 цагийн дотор eBarimt-д бүртгэгдэх ёстой. Нягтлан өдөр бүр эндээс шалгана (UNK-01).',
      bc: 'BC-д байхгүй (Монголын нэмэлт). Ойролцоо: Job Queue Log Entries, E-Documents (Page 6122).',
      rules: ['FR-EBR-012', 'FR-EBR-013', 'UNK-01', 'STM-06'],
      data: ['ebarimt.ebarimt_document', 'ebarimt.ebarimt_document_event', 'ebarimt.ebarimt_document.attempt_count'],
      doc: [{ file: UI, section: '15.6 Мөнгө ба eBarimt' }, { file: EB, section: '9.1 Төлөвүүд (schema: `PENDING`, `SENT`, `SUCCESS`, `ERROR`, `UNKNOWN`, `CANCELLED`)' }]
    },
    'eb.status': {
      title: 'Төлөвийн машин',
      what: 'PENDING (outbox-д, сүлжээнд гараагүй) → SENT (илгээхээс өмнө commit, attempt = 1) → SUCCESS (ДДТД) / ERROR (баримт үүсээгүй нь тодорхой) / UNKNOWN (хүсэлт явсан байж магадгүй, хариу алга). CANCELLED: орлогдсон, гараар цуцлагдсан, эсвэл засварын баримтаар идэвхгүй болсон (INACTIVATED_BY).',
      why: 'ERROR ба UNKNOWN-ийг ялгах нь давхар баримтаас сэргийлнэ: ERROR бол дахин илгээх аюулгүй, UNKNOWN бол татварын системд аль хэдийн бүртгэгдсэн байж болно.',
      bc: 'BC-д байхгүй.',
      rules: ['STM-01', 'STM-02', 'STM-03', 'STM-05', 'D-I6'],
      data: ['ebarimt.ebarimt_document.status', 'ebarimt.ebarimt_document.resolution_note'],
      doc: [{ file: EB, section: '9.2 Шилжилт' }, { file: EB, section: '10.4 Хариуг ангилах' }]
    },
    'eb.noretry': {
      title: 'Автомат дахин илгээхгүй (D-J2)',
      what: '<code>POST /rest/receipt</code> нэг л удаа (max_attempts = 1) илгээгдэнэ. Timeout болбол баримт UNKNOWN болж, систем өөрөө дахин илгээхгүй — хүн шалгаж шийднэ. Баримтын хуудсан дээр "Дахин илгээх" товч байхгүй; дахин илгээх нь зөвхөн энд, шинэ billIdSuffix-тэй клон хэлбэрээр.',
      why: 'PosAPI нь давхардлаас сэргийлэх idempotency key-гүй. Хариу ирээгүй хүсэлтийг давтвал татварын системд хоёр баримт (давхар НӨАТ, давхар сугалаа) үүсэх эрсдэлтэй.',
      bc: 'BC-д байхгүй (Job Queue "Maximum No. of Attempts to Run" = 1-тэй адил санаа).',
      rules: ['D-J2', 'D-I6', 'FR-EBR-006', 'FR-EBR-007', 'UX-EBR-01', 'DSP-21'],
      data: ['ebarimt.ebarimt_document.max_attempts', 'integration.outbox'],
      doc: [{ file: DEC, section: 'J. eBarimt' }, { file: EB, section: '10.4 Хариуг ангилах' }]
    },
    'eb.posapi': {
      title: 'PosAPI: сугалааны үлдэгдэл ба sendData',
      what: 'PosAPI instance-ийн сугалааны үлдэгдэл (leftLotteries) ба сүүлийн <code>sendData</code> (локал баримтуудыг татварын сервер рүү илгээсэн) цаг. Сугалаа 100-аас доош бол анхааруулга; sendData 12 цагаас удаан бол P2, 48 цагаас P1, 72 цагаас нийцлийн инцидент.',
      why: 'Сугалаа дуусвал B2C баримт гарахгүй. sendData амжилтгүй бол PosAPI-д бүртгэгдсэн баримт татварын системд хүрэхгүй — 72 цагийн хуулийн хугацаа зөрчигдөнө.',
      bc: 'BC-д байхгүй.',
      rules: ['MON-01', 'MON-02', 'MON-03', 'FR-EBR-013'],
      data: ['ebarimt.posapi_instance.left_lotteries', 'ebarimt.posapi_instance.last_send_data_at', 'tax.tax_parameter (ebarimt.left_lotteries_warning)'],
      doc: [{ file: EB, section: '14.2 `/rest/info` ба `sendData`' }, { file: EB, section: '14.3 Alert ба тайлан' }]
    },
    'eb.unknown': {
      title: 'UNKNOWN-ийг гараар шийдэх (S-EBR-05)',
      what: '1) Сүүлийн оролдлогоос ≥ 10 мин хүлээнэ. 2) eBarimt порталаас огноо, дүнгээр хайна. 3а) Олдвол "Бүртгэгдсэн": 33 оронтой ДДТД, огноо/цаг, порталын нийт дүн (= баримтын дүн), тэмдэглэл (≥ 10 тэмдэгт) → SUCCESS. 3б) Олдохгүй бол "Бүртгэгдээгүй": sendData сүүлийн оролдлогын дараа ажилласан ба ≥ 30 мин өнгөрсөн байх → хуучин CANCELLED + шинэ billIdSuffix-тэй клон PENDING.',
      why: 'Хүлээлт ба sendData нөхцөл нь "баримт хоцорч бүртгэгдээд байж болзошгүй" эрсдэлийг бууруулна. QR/сугалаа сэргэхгүй (хадгалдаггүй); B2C бол зөвхөн QR-гүй хуулбар.',
      bc: 'BC-д байхгүй.',
      rules: ['FR-EBR-007', 'UNK-01', 'UNK-10', 'STM-07', 'D-J2', 'D-J3'],
      data: ['ebarimt.ebarimt_document.resolved_at', 'ebarimt.ebarimt_document.resolved_by', 'ebarimt.ebarimt_document.resolution_note', 'ebarimt.ebarimt_document.resent_from_document_id'],
      doc: [{ file: EB, section: '11.2 UNKNOWN-ийг шийдэх алхам' }, { file: EB, section: '11.3 Клон (дахин илгээх) алгоритм' }]
    },
    'eb.error': {
      title: 'ERROR: засаад дахин илгээх / цуцлах',
      what: '"Засаад дахин илгээх" нь хуучин баримтыг CANCELLED болгож, дүн/тоо/төрлийг өөрчлөхгүйгээр зөвхөн eBarimt-ийн шинжийг (БҮНА код, taxProductCode, нэр) засаж шинэ billIdSuffix-тэй клон үүсгэнэ. "Цуцлах" нь баримт шаардлагагүй болсон үед (тэмдэглэл заавал).',
      why: 'ERROR = баримт үүсээгүй нь тодорхой тул дахин илгээх аюулгүй. Хүсэлтийн өгөгдөл immutable (STM-01) тул ERROR → PENDING хориотой; шинэ баримт үүсгэнэ (STM-03).',
      bc: 'BC-д байхгүй.',
      rules: ['STM-03', 'UNK-10', 'UNK-12', 'RET-62'],
      data: ['ebarimt.ebarimt_document.error_code', 'ebarimt.ebarimt_document.bill_seq', 'ebarimt.ebarimt_document.bill_id_suffix'],
      doc: [{ file: EB, section: '11.4 ERROR-ийн үйлдэл' }, { file: EB, section: '7. `billIdSuffix`' }]
    },
    'eb.chain': {
      title: 'Засварын гинж ба read model',
      what: 'Нэхэмжлэх дээр гинжийн нэгдсэн төлөв харагдана: Бүртгэгдсэн, Засварлагдсан (кредит нотоор inactiveId), Цуцлагдсан (DELETE эсвэл порталд), Порталд гараар цуцлах шаардлагатай (B2B бүтэн буцаалт). Гинжинд SUCCESS SAVE баримт зөвхөн нэг (сүүлийнх) байна; өмнөх нь INACTIVATED_BY-ээр CANCELLED.',
      why: 'Татварын системд хүчинтэй баримт нэг л байх ёстой (STM-05); inactiveId үргэлж сүүлийн хүчинтэй ДДТД-г заана (RET-02).',
      bc: 'BC-д байхгүй.',
      rules: ['RET-01', 'RET-02', 'STM-05', 'STM-07', 'UX-EBR-06'],
      data: ['ebarimt.v_source_document_status', 'ebarimt.ebarimt_document.replaces_document_id'],
      doc: [{ file: EB, section: '9.4 Posted баримт дээр харагдах eBarimt төлөв (read model)' }, { file: UI, section: '5.8 eBarimt-ийн төлөв ба хэвлэх цонх' }]
    }
  });

  // ---------------------------------------------------------------------------
  // #purchase-invoices / #purchase-invoice (merged into the existing purchases group)
  // ---------------------------------------------------------------------------
  N.register('purchase-invoices', 'Худалдан авалтын нэхэмжлэх', {
    'pi.drafts': {
      title: 'Худалдан авалтын ноорог',
      what: 'Ноорог DPI-###### дугаартай (завсартай цуврал), засагдана. Батлахад хуулийн PI-2026-##### дугаар олгогдож, зардал/хөрөнгө Дт, 1300 орцын НӨАТ Дт, 2100 өглөг Кт бичигдэнэ.',
      why: 'Ноорог устгахад хуулийн цувралд завсар үүсэхгүйн тулд дугаарыг зөвхөн батлах үед олгоно (D-C7).',
      bc: 'Purchase Invoices (Page 9308), Purchase Header (Table 38), Codeunit 90 "Purch.-Post".',
      rules: ['FR-PUR-001', 'BR-PUR-01', 'D-C7'],
      data: ['purchase.purchase_header', 'purchase.purchase_line', 'purchase.v_draft_document'],
      doc: [{ file: PUR, section: '3.3 `purchase.purchase_header` (ноорог, BC T38)' }, { file: UI, section: '15.5 Борлуулалт ба худалдан авалт' }]
    },
    'pi.vendor-no': {
      title: 'Нийлүүлэгчийн нэхэмжлэхийн дугаар (давхардахгүй)',
      what: 'Заавал. Хадгалахаас өмнө зай хасаж том үсгээр (кирилл орно) normalize хийнэ. Тухайн нийлүүлэгчийн өмнө батлагдсан нэхэмжлэхтэй ижил бол батлахгүй; өөр ноорогт байвал анхааруулна.',
      why: 'Нэг нэхэмжлэхийг хоёр бүртгэж, хоёр төлөхөөс сэргийлнэ (DB-ийн UNIQUE индекс ux_vendor_ledger_entry__vendor_doc_no).',
      bc: 'Purchase Header "Vendor Invoice No.", Purchases & Payables Setup "Ext. Doc. No. Mandatory"; Codeunit 90 CheckExternalDocumentNumber.',
      rules: ['FR-PUR-002', 'BR-PUR-10', 'BR-PUR-11', 'BR-PUR-12', 'INV-18'],
      data: ['purchase.purchase_header.vendor_invoice_no', 'party.vendor_ledger_entry.external_document_no'],
      doc: [{ file: PUR, section: '4.2 Нийлүүлэгчийн баримтын дугаар' }]
    },
    'pi.ddtd': {
      title: 'Нийлүүлэгчийн eBarimt ДДТД (33 орон)',
      what: 'Нийлүүлэгчийн өгсөн eBarimt баримтын ДДТД: зай, зураасыг хасаад яг 33 цифр. Компанид өөр баримтад бүртгэгдсэн ДДТД-г дахин ашиглахгүй. ДДТД-гүй бол "хүлээгдэж буй" (PENDING) гэж батлагдана — НӨАТ 1300-д бичигдэх боловч тайланд хасагдахгүй.',
      why: 'Татварын хуулиар орцын НӨАТ-ыг зөвхөн eBarimt-ээр баталгаажсан худалдан авалтаас хасна (D-E4). ДДТД-ийн дотоод бүтэц UNVERIFIED тул зөвхөн уртыг шалгана.',
      bc: 'BC-д байхгүй (Монголын нэмэлт).',
      rules: ['D-E4', 'BR-PUR-42', 'BR-PUR-43', 'BR-PUR-46', 'BR-TAX-47', 'FR-PUR-003'],
      data: ['purchase.purchase_header.supplier_ebarimt_id', 'ebarimt.purchase_receipt.ddtd', 'ebarimt.purchase_receipt.status'],
      doc: [{ file: PUR, section: '4.7 Нийлүүлэгчийн ДДТД ба орцын НӨАТ-ын баталгаажуулалт' }]
    },
    'pi.confirm': {
      title: 'deductible_confirmed — орцын НӨАТ баталгаажуулах',
      what: 'ДДТД зөв, хэрэглэгч эрхтэй үед "Баталгаажуулах" сонгосон бол батлахад VAT entry-д deductible_confirmed = true бичигдэнэ → ТТ-03а-ийн 7–8-р мөрөнд хасагдана. Сонгоогүй бол жагсаалтаас дараа нь баталгаажуулна.',
      why: 'Баталгаажуулах нь татварын хасалтын шийдвэр тул тусдаа эрх (tax.vat_entry.confirm_deductible) ба тусдаа туг шаарддаг.',
      bc: 'VAT Entry (Table 254) — BC-д байхгүй нэмэлт талбар.',
      rules: ['BR-PUR-47', 'BR-TAX-45', 'BR-TAX-46', 'BR-TAX-50', 'FR-TAX-009', 'INV-16'],
      data: ['tax.vat_entry.deductible_confirmed', 'tax.vat_entry.supplier_ebarimt_id'],
      doc: [{ file: TAX, section: '4.6 Орцын НӨАТ-ын хасалт ба баталгаажуулалт' }, { file: PUR, section: '4.7 Нийлүүлэгчийн ДДТД ба орцын НӨАТ-ын баталгаажуулалт' }]
    },
    'pi.lines': {
      title: 'Мөр: данс, НӨАТ-ын бүлэг, дүн',
      what: 'Мөр бүр зардал/хөрөнгийн данс (шууд бичих боломжтой данс л), тоо, нэгжийн үнэ (НӨАТ-гүй), НӨАТ-ын бүлэг. НӨАТ-ыг баримтын түвшинд VAT identifier тус бүрд нэг удаа тооцоод мөрүүдэд running remainder-ээр хуваарилна.',
      why: 'Борлуулалттай ижил тооцоолол (D-E3) тул НӨАТ-ын тайлан ба баримтын НӨАТ үргэлж тэнцэнэ. Хяналтын данс (1200, 2100, 1300) гараар сонгогдохгүй.',
      bc: 'Purchase Line (Table 39) Type = G/L Account; VAT Amount Line (Table 290).',
      rules: ['FR-PUR-004', 'D-E3', 'BR-PST-15', 'D-F1'],
      data: ['purchase.purchase_line.gl_account_id', 'purchase.purchase_line.vat_prod_posting_group_id', 'purchase.purchase_line.amount'],
      doc: [{ file: PUR, section: '4.9 Данс тодорхойлох' }, { file: TAX, section: '4.4 VAT entry ба posting' }]
    },
    'pi.preview': {
      title: 'Батлахын өмнө харах (posting preview)',
      what: 'Батлах кодыг яг ижлээр ажиллуулж (дугаар зарцуулахгүй, хадгалахгүй) үүсэх G/L, НӨАТ, өглөгийн бичилтийг харуулна. Дт = Кт шалгалт, deductible_confirmed утга, төлөх огноо харагдана.',
      why: 'Нягтлан батлахаас өмнө данс зөв эсэхийг шалгана; батлагдсан баримт засагдахгүй, зөвхөн кредит нотоор залруулна.',
      bc: 'Codeunit 19 "Gen. Jnl.-Post Preview", Purchase Invoice "Preview Posting".',
      rules: ['D-C6', 'BR-PUR-56', 'INV-01'],
      data: ['gl.gl_entry', 'tax.vat_entry', 'party.vendor_ledger_entry'],
      doc: [{ file: PST, section: '4.10 Preview' }, { file: PUR, section: '4.8 Батлах (posting)' }]
    }
  });
})();
