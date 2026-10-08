/* =============================================================================
   js/notes/cash-bank.js — explanation notes for #cash (МХ-1 / МХ-2, S-BNK-03/04/05) and #bank-rec
   (statement import wizard S-BNK-08 + reconciliation worksheet S-BNK-09, report FR-BNK-016, history S-BNK-10).
   Every doc.section is an exact heading of the referenced spec file (checked by tests/engine_check.js).
   ========================================================================== */
(function () {
  'use strict';
  var BNK = '09-bank-cash-fx.md', UI = '15-ui-ux.md', REQ = '01-requirements.md', PST = '05-posting-engine.md', SEC = '13-security-audit-tenancy.md';
  var N = window.ERP.notes;

  // ---------------------------------------------------------------------------
  // #cash — Кассын баримт (МХ-1 / МХ-2)
  // ---------------------------------------------------------------------------
  N.register('cash', 'Касс — МХ-1 / МХ-2', {
    'cash.balance': {
      title: 'Кассын үлдэгдэл',
      what: 'Касс (CASH01 "Үндсэн касс")-ын одоогийн үлдэгдэл ба энэ оны МХ-1 / МХ-2-ын тоо, нийлбэр. Үлдэгдэл нь тусад нь хадгалагдсан тоо биш — кассын банкны дэвтрийн бичилтүүдийн (BLE) нийлбэр бөгөөд 1100 "Касс (төгрөг)" дансны үлдэгдэлтэй үргэлж тэнцэнэ.',
      why: 'Хадгалсан үлдэгдлийн багана байвал ledger-тэй зөрөх эрсдэлтэй. Нийлбэрээр тооцвол хэзээ ч зөрөхгүй; #checks дээрх BANK-SUB/CASH01 шалгалт үүнийг баталгаажуулна.',
      bc: 'Bank Account (Table 270) "Balance" FlowField = Σ Bank Account Ledger Entry (Table 271); Bank Account Posting Group (Table 277) → G/L 1100.',
      rules: ['BR-BNK-14', 'BR-BNK-15', 'BR-BNK-12', 'D-G1', 'CUE-19'],
      data: ['bank.v_bank_account_balance.balance', 'bank.bank_ledger_entry.amount', 'gl.gl_entry.amount (1100)'],
      doc: [{ file: BNK, section: '4.2 Мөнгөний posting (BR-BNK-10..16)' }, { file: BNK, section: '3.2 Банкны дэд дэвтэр ба кассын баримт' }]
    },
    'cash.list': {
      title: 'Кассын баримтын жагсаалт (S-BNK-05)',
      what: 'Кассын бүх батлагдсан баримт: МХ-1 (орлого, KO-2026-#####) ба МХ-2 (зарлага, KZ-2026-#####). Бэлэн борлуулалтын нэхэмжлэх (SI-…) батлахад түүний МХ-1 автоматаар үүснэ — тиймээс "Холбоотой баримт" багана SI/SC дугаар харуулж болно. Мөр дарахад хэвлэмэл нээгдэнэ. Эхний үлдэгдэл (OB) МХ үүсгэхгүй.',
      why: 'Кассын BLE бүрд (эхний үлдэгдэл, тооллого, буцаалтаас бусад) яг нэг МХ баримт байх ёстой — касс хөдөлсөн бүрд цаасан анхан шатны баримт (Order 347-ийн маягт) гарна.',
      bc: 'BC-д МХ хүснэгт байхгүй (W1); ойролцоо нь Bank Account Ledger Entries (Page 372) ба CZ локализацын Cash Desk (Table 11744). Энд bank.posted_cash_voucher гэсэн тусдаа, append-only хүснэгт.',
      rules: ['BR-BNK-20', 'BR-BNK-21', 'BR-BNK-22', 'D-A4', 'FR-BNK-002', 'FR-BNK-003'],
      data: ['bank.posted_cash_voucher.voucher_type', 'bank.posted_cash_voucher.no', 'bank.posted_cash_voucher.bank_ledger_entry_no'],
      doc: [{ file: BNK, section: '4.3 Кассын баримт ба сөрөг үлдэгдэл (BR-BNK-20..29)' }, { file: UI, section: '15.6 Мөнгө ба eBarimt' }]
    },
    'cash.numbering': {
      title: 'Завсаргүй дугаар KO / KZ',
      what: 'МХ-1 нь KO, МХ-2 нь KZ цувралаас дугаар авна (PREFIX-YYYY-#####, жил бүр 00001-ээс). Дугаарыг зөвхөн батлах гүйлгээ дотор олгоно; урьдчилан харахад "***". Цуврал дахь сүүлийн дугаарын огнооноос өмнөх огноогоор баримт батлахыг хориглоно.',
      why: 'Хуулийн анхан шатны баримтын дугаар цоорхойгүй, дараалсан байх ёстой (аудитор алга болсон баримт хайхгүй). Касс бүр өөрийн цувралтай.',
      bc: 'No. Series (Table 308) + No. Series Line (Table 309) "Starting Date" ба "Allow Gaps in Nos." = false; Codeunit "No. Series" (310).',
      rules: ['D-C7', 'BR-BNK-05', 'BR-BNK-21', 'BR-BNK-26', 'INV-08'],
      data: ['platform.number_series (KO, KZ)', 'platform.number_series_counter', 'bank.bank_account.cash_receipt_no_series_id'],
      doc: [{ file: PST, section: '4.4 Дугаарлалт' }, { file: BNK, section: '4.3 Кассын баримт ба сөрөг үлдэгдэл (BR-BNK-20..29)' }]
    },
    'cash.form-type': {
      title: 'МХ-1 эсвэл МХ-2 — ноороггүй баримт',
      what: 'Баримтын төрөл нь сонгосон товчоор тогтоно (МХ-1 = орлого, МХ-2 = зарлага) бөгөөд дараа нь солигдохгүй. Форм зөвхөн санах ойд; "Батлах" нэг командаар (POST /payments) бүх бичилтийг үүсгэнэ — хадгалсан ноорог байхгүй.',
      why: 'Кассын баримт нь мөнгө гараас гар руу шилжих агшинд бүртгэгддэг; ноорог хадгалах нь хэвлээгүй, батлаагүй "сул" баримт үлдээнэ. Бичиг баримтын дугаар (PII) browser storage-д хэзээ ч хадгалагдахгүй.',
      bc: 'Cash Receipt Journal (Page 255) / Payment Journal (Page 256) — BC-д журналын мөр хадгалагддаг; энд Payment Registration (CU 980)-ийн "нэг товч" загварыг авсан.',
      rules: ['UX-CASH-01', 'UX-CASH-06', 'BR-BNK-28', 'Z-UI-11', 'FR-BNK-002', 'FR-BNK-003'],
      data: ['bank.posted_cash_voucher.voucher_type (RECEIPT = МХ-1, PAYMENT = МХ-2)', 'API PaymentCreate.direction, PaymentCreate.cashVoucher (api/openapi.yaml)'],
      doc: [{ file: UI, section: '16.3 Кассын баримт МХ-1 / МХ-2 (S-BNK-03, S-BNK-04)' }, { file: BNK, section: '5.2 Төлбөр, орлого, шилжүүлэг: `POST /payments` (FR-BNK-002..007)' }]
    },
    'cash.party': {
      title: 'Харьцагч ба тулгах баримт',
      what: 'Харилцагч сонговол (МХ-1) нээлттэй нэхэмжлэхүүд, нийлүүлэгч сонговол (МХ-2) нээлттэй худалдан авалтууд санал болно; сонгоход дүн = үлдэгдэл. Үлдэгдлээс их дүн оруулбал илүү нь урьдчилгаа (нээлттэй төлбөр) болж үлдэнэ. "Данс" төрөлд 1100-ийн эсрэг тал нь сонгосон G/L данс (жишээ 7213 бичиг хэрэг, 8200 бусад орлого). "Мөнгөний данс" = касс → банк тушаалт.',
      why: 'Авлага/өглөгийн дэд дэвтэр ба хяналтын данс (1200 / 2100) зөвхөн системээр бичигдэнэ; тулгалт (application) нь нэхэмжлэхийн үлдэгдлийг хааж насжилтыг зөв болгоно.',
      bc: 'Gen. Journal Line "Account Type" + "Applies-to Doc. No." / "Applies-to ID"; Codeunit 12 "Gen. Jnl.-Post Line" (CustPostApplyCustLedgEntry).',
      rules: ['UX-CASH-03', 'UX-CASH-04', 'D-F4', 'BR-BNK-31', 'FR-BNK-006', 'FR-BNK-007'],
      data: ['party.cust_ledger_entry.remaining_amount', 'party.vendor_ledger_entry.remaining_amount', 'bank.posted_cash_voucher.counterparty_type'],
      doc: [{ file: UI, section: '16.3 Кассын баримт МХ-1 / МХ-2 (S-BNK-03, S-BNK-04)' }, { file: BNK, section: 'P1. Кассын орлого (МХ-1), нэхэмжлэхтэй тулгах — R1 (GS-CASH-001, FR-BNK-002 AC1)' }]
    },
    'cash.id-doc': {
      title: 'Хүлээн авагч / тушаагч ба бичиг баримт',
      what: 'МХ-1-д "Тушаагч" (хэнээс хүлээн авсан), МХ-2-т "Хүлээн авагч" (хэнд олгосон) заавал. МХ-2-т хүлээн авагчийн бичиг баримтын дугаар (регистр эсвэл ТТД) заавал; нийлүүлэгчийн ТТД анхдагчаар бөглөгдөнө. Жагсаалтад маскаар, хэвлэмэлд бүтнээр гарна.',
      why: 'Бэлэн мөнгө хэнд олгосныг нотлох нь кассын хяналтын гол нөхцөл (FR-BNK-003 AC2). Бичиг баримтын дугаар нь хувийн мэдээлэл тул DB-д шифрлэгдэж (enc:v1:), browser storage-д хадгалагдахгүй.',
      bc: 'BC W1-д байхгүй; CZ Cash Document "Received From / Paid To", "Identification Card No." талбартай ойролцоо.',
      rules: ['BR-BNK-22', 'BR-BNK-23', 'FR-BNK-003', 'UX-SEC-02', 'UX-PRN-06'],
      data: ['bank.posted_cash_voucher.counterparty_name', 'bank.posted_cash_voucher.counterparty_id_doc (enc:v1)'],
      doc: [{ file: BNK, section: '3.2 Банкны дэд дэвтэр ба кассын баримт' }, { file: REQ, section: 'FR-BNK-003 Кассын зарлагын баримт (МХ-2)' }]
    },
    'cash.amount-words': {
      title: 'Дүн үсгээр',
      what: 'Дүнг монголоор үсгээр бичнэ: 3 оронтой бүлэг (тэрбум, сая, мянга, нэгж); тоон үг араасаа үг дагавал холбох хэлбэрт ("гурван", "зуун", "наян"), "мянга" зөвхөн сүүлийн үг бол "мянган"; зуу, мянга, сая-гийн өмнө "нэг"-ийг заавал бичнэ. Жишээ: 880.00 → "Найман зуун наян төгрөг 00 мөнгө".',
      why: 'МХ маягтад дүнг тоо ба үсгээр давхар бичдэг — засвар, хуурамчаар өөрчлөхөөс хамгаална. Батлах үед нэг удаа үүсгэж хадгалдаг тул дахин хэвлэхэд өөрчлөгдөхгүй.',
      bc: 'BC-д Report "Check" (1401)-ийн FormatNoText (англи); монгол хэлний алгоритмыг шинээр бичсэн (MoneyWords.ToMongolian).',
      rules: ['BR-BNK-24', 'REQ-ACC-04', 'REQ-ACC-15', 'UX-FMT-12', 'PBT-BNK-01'],
      data: ['bank.posted_cash_voucher.amount_in_words'],
      doc: [{ file: BNK, section: '6.9 Дүнг монголоор үсгээр бичих (`MoneyWords.ToMongolian`, BR-BNK-24)' }]
    },
    'cash.negative': {
      title: 'Касс сөрөг болохгүй',
      what: 'Батлахаас өмнө баримтын огноо ба түүнээс хойших өдөр бүрийн хуримтлагдсан үлдэгдлийг шинэ мөрийг оруулж тооцно; аль нэг өдөр < 0 бол "Батлах" идэвхгүй, боломжит дүн ба дутууг харуулна. Сервер мөн адил шалгаж (bank.cash_negative_balance), DB COMMIT-д дахин шалгана (ERC01).',
      why: 'Кассад байхгүй мөнгийг олгох боломжгүй — сөрөг касс нь бүртгэлгүй орлого эсвэл алдааг илтгэнэ (D-G1). Хоцорсон огноотой зарлага нь хойших өдрийн үлдэгдлийг сөрөг болгож болох тул зөвхөн одоогийн үлдэгдлээр биш, өдөр бүрээр шалгана.',
      bc: 'BC W1-д сөрөг кассыг хориглодоггүй (Min. Balance хэрэгжээгүй); CZ Cash Desk "Cash Document-Release" (CashDocumentReleaseCZP) шалгадаг. Энд хатуу хориг.',
      rules: ['D-G1', 'BR-BNK-25', 'BR-BNK-07', 'FR-BNK-003', 'UX-CASH-05', 'INV-19'],
      data: ['bank.bank_account.prevent_negative_balance', 'bank.bank_ledger_entry.amount', 'bank.fn_check_non_negative_cash() (trigger, 910_ledger_guards.sql)'],
      doc: [{ file: BNK, section: '6.11 Кассын сөрөг үлдэгдлийн шалгалт (BR-BNK-25)' }, { file: REQ, section: 'FR-BNK-003 Кассын зарлагын баримт (МХ-2)' }]
    },
    'cash.post': {
      title: 'Батлах: нэг гүйлгээ',
      what: 'Нэг гүйлгээнд: (1) KO/KZ дугаар, (2) G/L: 1100 касс ↔ эсрэг тал (1200 авлага, 2100 өглөг, G/L данс эсвэл банк), (3) кассын BLE, (4) МХ-ийн бүртгэл ба дүн үсгээр, (5) авлага/өглөгийн тулгалт. "Урьдчилан харах" нь ижил кодыг ажиллуулаад буцаана (дугаар "***").',
      why: 'Бүгд эсвэл юу ч биш (атомик) — хагас бичигдсэн касс байж болохгүй. Ваучер бүр тэнцэнэ (Σ Дт = Σ Кт); касс/банкны данс руу гараар G/L мөр бичихийг хориглоно (BR-BNK-13).',
      bc: 'Codeunit 13 "Gen. Jnl.-Post Batch" → Codeunit 12 "Gen. Jnl.-Post Line" (PostBankAcc, PostCust, PostVend); Codeunit 19 "Gen. Jnl.-Post Preview".',
      rules: ['BR-BNK-12', 'BR-BNK-13', 'BR-BNK-28', 'UX-CASH-07', 'D-C5', 'D-C6'],
      data: ['gl.gl_entry', 'bank.bank_ledger_entry', 'bank.posted_cash_voucher', 'party.detailed_cust_ledger_entry'],
      doc: [{ file: BNK, section: '5.2 Төлбөр, орлого, шилжүүлэг: `POST /payments` (FR-BNK-002..007)' }, { file: PST, section: '4.10 Preview' }]
    },
    'cash.print': {
      title: 'МХ-1 / МХ-2 хэвлэмэл',
      what: 'Сангийн сайдын 2017 оны 347 тушаалын маягт: байгууллага, ТТД, "КАССЫН ОРЛОГЫН/ЗАРЛАГЫН БАРИМТ №", огноо, касс, харьцагч, бичиг баримт, гүйлгээний утга, харьцсан данс (гүйлгээний 1100-аас бусад G/L), дүн тоо ба үсгээр, гарын үсгийн мөр, тамганы байрлал. Буцаагдсан баримтад "БУЦААГДСАН" тэмдэг гарна.',
      why: 'Цаасан анхан шатны баримт нь хуулиар шаардлагатай; системийн өгөгдлөөс шууд гаргаснаар гар бичилтийн алдаа гарахгүй. Прототипт PDF үүсгэхгүй — бодит системд GET /cash-vouchers/{id}/pdf (A5 хэвтээ).',
      bc: 'BC W1-д МХ маягт байхгүй; Report "Cash Desk Receipt/Withdrawal" (CZ) ба Document Sending Profile-ийн загвар.',
      rules: ['REQ-ACC-08', 'REQ-ACC-15', 'BR-BNK-29', 'OQ-BNK-02', 'UX-CASH-07', 'FR-PLT-012'],
      data: ['bank.posted_cash_voucher', 'platform.company_setup.legal_name', 'platform.document_signature'],
      doc: [{ file: BNK, section: '5.3 МХ-1 / МХ-2: бүртгэл ба хэвлэмэл' }]
    },
    'cash.factbox': {
      title: 'Кассын үлдэгдэл: одоо ба дараа',
      what: '"Одоо" = кассын одоогийн үлдэгдэл; "Огноонд" = баримтын огнооны эцсийн үлдэгдэл; "Дараа" = батласны дараах үлдэгдэл (клиент урьдчилан тооцно, зөвхөн харуулалт). Доор харьцагчийн нээлттэй баримтууд.',
      why: 'Кассчин мөнгө олгохоос өмнө хүрэлцэх эсэхийг харах ёстой. Эцсийн шийдвэр серверийнх (UX-CASH-05).',
      bc: 'FactBox "Bank Account Balance"; Customer/Vendor Ledger Entries FactBox.',
      rules: ['UX-CASH-05', 'BR-BNK-15', 'BR-BNK-27'],
      data: ['bank.v_bank_account_balance', 'party.cust_ledger_entry (open)'],
      doc: [{ file: UI, section: '16.3 Кассын баримт МХ-1 / МХ-2 (S-BNK-03, S-BNK-04)' }]
    },
    'cash.roles': {
      title: 'Хэн батлах эрхтэй',
      what: 'МХ-1 батлах эрх: bank.cash_receipt.post; МХ-2: bank.cash_payment.post. Борлуулагч (SALES_CLERK) зөвхөн МХ-1, зөвхөн CASH дансанд; "Данс" төрлийн харьцагч түүнд харагдахгүй.',
      why: 'Зарлага нь мөнгө гаргадаг тул илүү хатуу эрх шаардана (үүргийн хуваарилалт).',
      bc: 'Permission Set ("D365 CASH DESK" маягийн), Execute permission on Codeunit 13.',
      rules: ['SEC-REC-04', 'UX-CASH-08'],
      data: ['platform.permission (object_type ACTION, object_name bank.cash_receipt.post)', 'platform.permission_set'],
      doc: [{ file: SEC, section: '6.3 `ACTION` ба `REPORT` объектын каталог' }, { file: SEC, section: '6.6 Role-ийн эрхийн матриц (нормативаар)' }]
    }
  });

  // ---------------------------------------------------------------------------
  // #bank-rec — Хуулга импорт ба тулгалт
  // ---------------------------------------------------------------------------
  N.register('bank-rec', 'Банкны хуулга ба тулгалт', {
    'rec.account': {
      title: 'Данс ба нэг нээлттэй тулгалт',
      what: 'Банкны данс (Хаан 1110, Голомт 1111) сонгоно. Данс бүрд нэг л нээлттэй тулгалт байна; нээлттэй бол түүнийг, эс бөгөөс хуулга импортлохыг санал болгоно. Касс (CASH)-ыг хуулгаар тулгахгүй — кассын тооллогоор шалгана.',
      why: 'Нэг дансны хоёр зэрэгцээ тулгалт нэг банкны бичилтийг хоёр удаа хааж болно. "Өмнөх үлдэгдэл" нь сүүлд батлагдсан хуулгын эцсийн үлдэгдэл.',
      bc: 'Bank Acc. Reconciliation (Table 273) + Bank Acc. Reconciliation List (Page 388); Bank Account "Balance Last Statement", "Last Statement No.".',
      rules: ['UX-REC-01', 'BR-BNK-63', 'BR-BNK-65', 'BR-BNK-70'],
      data: ['bank.bank_reconciliation.status', 'bank.bank_account.balance_last_statement', 'bank.bank_account.last_statement_no'],
      doc: [{ file: UI, section: '16.4 Банкны тулгалт (S-BNK-09)' }, { file: BNK, section: '3.4 Тулгалт' }]
    },
    'rec.wizard': {
      title: 'Хуулга импортын wizard (S-BNK-08)',
      what: '6 алхам: 1) Файл ба preset, 2) Танилт (файлын төрөл, кодлол, тусгаарлагч, гарчгийн мөр), 3) Баганын харгалзуулалт, 4) Урьдчилан харах ба үлдэгдлийн шалгалт, 5) Профайл хадгалах, 6) Импорт. Энд жишээ файл нь Хаан банкны интернэт банкны экспорт (CSV хувилбар); агуулгыг засаж туршиж болно.',
      why: 'Банк бүр өөр формат өгдөг; нэг удаа харгалзуулаад профайл болгон хадгалснаар дараагийн сард гар ажиллагаагүй импортлогдоно. Импорт нь ledger-ийг өөрчлөхгүй.',
      bc: 'Data Exch. Def (Table 1222), Data Exch. Column Def (1223), Data Exch. Field Mapping (1225); Codeunit "Import Bank Statement", "Process Data Exch.".',
      rules: ['FR-BNK-008', 'FR-BNK-009', 'BR-BNK-40', 'BR-BNK-49', 'D-G2'],
      data: ['bank.bank_statement_import_format', 'bank.bank_statement_import_column', 'bank.bank_statement'],
      doc: [{ file: BNK, section: '5.8.1 Алхам' }, { file: BNK, section: '5.8.4 Хаан ба Голомт банкны preset (⚠ жишээ файлаар баталгаажаагүй — FR-BNK-009, OQ-BNK-01)' }]
    },
    'rec.detect': {
      title: 'Файлын танилт',
      what: 'Файлын эхний байтаар төрөл (PK → XLSX, эс бөгөөс CSV), кодлол (UTF-8 / windows-1251), тусгаарлагч (эхний 20 мөрөнд тоо нь тогтмол ≥ 2 тэмдэгт), гарчгийн мөр (эхний 30 мөрөөс: ≥ 50 % текст, дараагийн мөрөнд огноо ба тоо). Толгойн хэсгээс "Эхний / Эцсийн үлдэгдэл"-ийг хайна.',
      why: 'Банкны экспорт файлын дээд хэсэгт дансны мэдээлэл, үлдэгдэл байдаг; гарчгийн мөрийг автоматаар олж байж хэрэглэгч мөр тоолохгүй.',
      bc: 'Data Exch. Def "Header Lines", "File Type", "Column Separator", "File Encoding".',
      rules: ['R-BANK-CASH-37', 'BR-BNK-41', 'BR-BNK-43'],
      data: ['bank.bank_statement_import_format.delimiter', 'bank.bank_statement_import_format.header_rows', 'bank.bank_statement_import_format.encoding'],
      doc: [{ file: BNK, section: '5.8.1 Алхам' }, { file: BNK, section: '5.8.3 Утга задлах' }]
    },
    'rec.mapping': {
      title: 'Баганын харгалзуулалт',
      what: 'Гарчиг бүрийг нормчилж (том үсэг, кирилл → латин, тэмдэгт хасах) синоним толиор зорилтот талбарт санал болгоно: огноо, дебит/кредит эсвэл тэмдэгтэй дүн, утга, харьцсан данс, журнал (гүйлгээний id), үлдэгдэл. Preset сонговол банкны баганын нэрийг шууд ашиглана. Сонголтыг өөрчилж болно; огнооны формат нь бүх мөрийг алдаагүй задлах эхний формат.',
      why: 'Хуулгын кредит = данс руу орсон (+), дебит = гарсан (−). Буруу харгалзуулбал дүнгийн тэмдэг эргэж, 4-р алхмын үлдэгдлийн шалгалт унана.',
      bc: 'Data Exch. Field Mapping (Table 1225) "Multiplier", "Negative-Sign Identifier"; Data Exch. Column Def "Data Format".',
      rules: ['BR-BNK-41', 'BR-BNK-42', 'BR-BNK-43', 'FR-BNK-008'],
      data: ['bank.bank_statement_import_column.target_field', 'bank.bank_statement_import_column.column_header', 'bank.bank_statement_import_format.amount_mode'],
      doc: [{ file: BNK, section: '5.8.2 Гарчгийн нормчлол ба синоним толь' }, { file: BNK, section: '4.5 Хуулга импорт (BR-BNK-40..49)' }]
    },
    'rec.preview': {
      title: 'Урьдчилан харах ба үлдэгдлийн шалгалт',
      what: 'Задалсан мөрүүд (алдаатай нь улаанаар), "Эхний үлдэгдэл + Σ мөр = Эцсийн үлдэгдэл" шалгалт, мөр бүрийн "өмнөх + дүн = үлдэгдэл" шалгалт, мөн хуулгын эхний үлдэгдэл = сүүлд батлагдсан хуулгын эцсийн үлдэгдэл эсэх (W-BNK-02).',
      why: 'Дутуу эсвэл давхар мөртэй файлыг тулгалт эхлэхээс өмнө илрүүлнэ. Зөрсөн ч импорт хийгдэх боловч батлахад хатуу шалгагдана (BR-BNK-66).',
      bc: 'Bank Acc. Reconciliation "Statement Ending Balance"; Report "Bank Acc. Recon. - Test".',
      rules: ['BR-BNK-47', 'BR-BNK-48', 'FR-BNK-008'],
      data: ['bank.bank_statement.opening_balance', 'bank.bank_statement.closing_balance', 'bank.bank_statement_line.running_balance'],
      doc: [{ file: BNK, section: '4.5 Хуулга импорт (BR-BNK-40..49)' }, { file: REQ, section: 'FR-BNK-008 Банкны хуулга импорт (CSV/XLSX wizard)' }]
    },
    'rec.dedupe': {
      title: 'Давхар импортоос сэргийлэх',
      what: 'Ижил файлыг (хэш) дахин импортлохыг бүхэлд нь татгалзана (bank.statement_already_imported). Файл өөр боловч мөр давхцвал мөр бүрийн түлхүүрээр алгасна: банкны гүйлгээний id ("T:" + Norm(журнал)), эс бөгөөс огноо|дүн|утга|үлдэгдэл|давтамжийн хэш.',
      why: 'Нэг гүйлгээг хоёр удаа тулгавал төлбөр давхар бүртгэгдэнэ. Хаях (discard) үед түлхүүр чөлөөлөгдөж дахин импортлох боломжтой.',
      bc: 'Bank Account Statement Line "Transaction ID" давхардлын шалгалт (Import Bank Statement); энд hash + unique index-ээр хатуу.',
      rules: ['FR-BNK-010', 'BR-BNK-44', 'BR-BNK-45', 'BR-BNK-46', 'BR-BNK-80'],
      data: ['bank.bank_statement.file_sha256', 'bank.bank_statement_line.dedupe_key', 'ux_bank_statement_line__dedupe (unique index, 090_bank.sql)'],
      doc: [{ file: BNK, section: '6.6 Давхардлын түлхүүр (`dedupe_key`, BR-BNK-46)' }, { file: REQ, section: 'FR-BNK-010 Давхар импортоос сэргийлэх' }]
    },
    'rec.header': {
      title: 'Тулгалтын толгой ба үлдэгдлийн тэгшитгэл',
      what: 'Өмнөх үлдэгдэл (сүүлд батлагдсан хуулга) + Σ мөр = Эцсийн үлдэгдэл. ✓ үед л батлах боломжтой; эцсийн үлдэгдлийг гараар өөрчилбөл ✕ болж зөрүүг харуулна.',
      why: 'Хуулгын бүх мөр импортлогдсон, нэг ч мөр алга болоогүйг баталгаажуулна (FR-BNK-013 AC2).',
      bc: 'Bank Acc. Reconciliation (Table 273) "Balance Last Statement", "Statement Ending Balance", "Total Balance on Bank Account".',
      rules: ['UX-REC-02', 'BR-BNK-66', 'BR-BNK-65', 'FR-BNK-013'],
      data: ['bank.bank_reconciliation.balance_last_statement', 'bank.bank_reconciliation.statement_ending_balance'],
      doc: [{ file: UI, section: '16.4 Банкны тулгалт (S-BNK-09)' }, { file: BNK, section: '4.7 Тулгалтыг батлах, буцаах, тайлан (BR-BNK-63..79)' }]
    },
    'rec.lines': {
      title: 'Хуулгын мөр ба итгэлийн тэмдэг',
      what: 'Мөр бүрийн тулгалтын итгэл: ● Өндөр (HIGH), ● Дүрэм (текстийн дүрэм), ◐ Дунд, ◔ Бага, ○ Алга, ✎ Гараар, ✓ Батлагдсан. Өндөр ба Дүрэм автоматаар тулгагдана; Дунд/Бага нь хэрэглэгчийн шийдвэр шаардана. Мөр дарж баруун самбараас саналыг харна.',
      why: 'Нягтлан зөвхөн эргэлзээтэй мөрийг шалгана — бусдыг систем найдвартай тулгасан. Шалтгаан ба оноо ил байх нь итгэлийг нэмнэ (UXP-03).',
      bc: 'Payment Reconciliation Journal (Page 1290) "Match Confidence" (None/Low/Medium/High/High - Text-to-Account Mapping/Manual/Accepted).',
      rules: ['UX-REC-03', 'UX-REC-04', 'FR-BNK-011', 'BR-BNK-59'],
      data: ['bank.bank_reconciliation_line.match_confidence', 'bank.bank_reconciliation_line.match_quality', 'bank.bank_reconciliation_line.difference'],
      doc: [{ file: UI, section: '16.4 Банкны тулгалт (S-BNK-09)' }, { file: BNK, section: '6.7.3 Итгэлийн түвшин ба автомат тулгалт' }]
    },
    'rec.phase-a': {
      title: 'А үе — бүртгэгдсэн банкны бичилттэй яг дүнгээр',
      what: 'Эхлээд хуулгын мөрийг аль хэдийн бүртгэгдсэн, нээлттэй банкны бичилттэй (BLE) тулгана: дүн яг тэнцүү, огнооны зөрүү ≤ 3 хоног. Эрэмбэ: огнооны зөрүү бага → текстийн оноо их → бичилтийн дугаар бага. Ганц нэр дэвшигч → HIGH 3990; олноос эрэмбээр сонгосон → MEDIUM 2990; тэнцсэн бол тулгахгүй.',
      why: 'Цалин, татвар, нийлүүлэгчийн төлбөр зэрэг банкаар аль хэдийн бүртгэсэн гүйлгээг дахин бичихгүйн тулд (давхар бүртгэл) хамгийн түрүүнд шалгана.',
      bc: 'Codeunit "Match Bank Rec. Lines" (MatchSingle: Amount + Transaction Date tolerance, RecordMatchMgt nearness).',
      rules: ['BR-BNK-51', 'BR-BNK-52', 'Z-BNK-03', 'R-BANK-CASH-19', 'R-BANK-CASH-21'],
      data: ['bank.bank_rec_match (rule_code A)', 'bank.bank_rec_match_member', 'bank.bank_ledger_entry.open'],
      doc: [{ file: BNK, section: '5.9.4 А үе — бүртгэгдсэн BLE (яг дүн)' }]
    },
    'rec.scoring': {
      title: 'Б үе — оноо ба шалтгаан',
      what: 'Үлдсэн мөрийг нээлттэй нэхэмжлэх (авлага/өглөг)-тэй гурван дохиогоор харьцуулна: харьцагч (нэрийн ойролцоо ≥ 95, ТТД, сурсан данс → Бүрэн / Хэсэгчлэн / Үгүй), баримтын дугаар (SI-2026-00024 гэх мэт токен), дүн (хүлцлийн мужид ганц / олон / үгүй). Дүрмийн хүснэгтээс тохирох эхний мөр → оноо = 1000 × (итгэл + 1) − эрэмбэ.',
      why: 'Хэсэгчилсэн төлбөр, буруу бичсэн утгатай гүйлгээг ч олно; оноо ба шалтгаан нь яагаад санал болгосныг тайлбарлана. Дүнгийн дохио "бүх харилцагчаас ганц" эсэхийг шалгадаг тул ижил дүнтэй хоёр нэхэмжлэх автоматаар тулгагдахгүй (FR-BNK-011 AC2).',
      bc: 'Codeunit "Match Bank Payments" (1255) ба Bank Pmt. Appl. Rule (Table 1252) "Score" = InsertDefaultMatchingRules; Applied Payment Entry (Table 1294).',
      rules: ['BR-BNK-53', 'BR-BNK-54', 'BR-BNK-55', 'BR-BNK-56', 'BR-BNK-57', 'FR-BNK-011'],
      data: ['bank.payment_application_proposal.quality', 'bank.payment_application_proposal.rule_code', 'bank.payment_application_proposal.applies_to_entry_no'],
      doc: [{ file: BNK, section: '6.7.2 Дүрмийн хүснэгт (BC `BankPmtApplRule.InsertDefaultMatchingRules`, W1; Direct Debit-ийн High #1-ийг хассан, эрэмбэ BC-ийнхээр)' }, { file: BNK, section: '5.9.3 Харьцагчийн дохио' }, { file: BNK, section: '6.10.3 Ойролцоо (nearness) ба текстийн оноо' }]
    },
    'rec.text-rule': {
      title: 'Текстээс данс руу дүрэм',
      what: 'Хуулгын утгад дүрмийн текст (нормчилсон) агуулагдвал тухайн дансанд бичихийг санал болгоно: "ШИМТГЭЛ" → зарлага 8300 Санхүүгийн зардал; "ХАДГАЛАМЖИЙН ХҮҮ", "ХҮҮНИЙ ОРЛОГО" → орлого 8110. Оноо = 3000 + текстийн урт + 1 (ШИМТГЭЛ → 3009). Мөрөөс "Дүрэм үүсгэх"-ээр шинэ дүрэм нэмж болно.',
      why: 'Банкны шимтгэл, хүү сар бүр давтагддаг; нэг удаа дүрэм тохируулбал гар ажиллагаагүй. Ижил дүнтэй, тэр дансанд аль хэдийн бичсэн BLE байвал шинэ бичилт биш тэр BLE-тэй тулгана.',
      bc: 'Text-to-Account Mapping (Table 1251) "Mapping Text", "Debit Acc. No.", "Credit Acc. No."; Match Bank Payments "Text-to-Account".',
      rules: ['BR-BNK-58', 'FR-BNK-012', 'UX-REC-07', 'R-BANK-CASH-29'],
      data: ['bank.text_to_account_mapping.mapping_text', 'bank.text_to_account_mapping.credit_account_id', 'db/seed/mn_40_setup.sql'],
      doc: [{ file: BNK, section: '5.9.6 Текстээс данс руу' }, { file: REQ, section: 'FR-BNK-012 Текстээс данс руу дүрэм' }]
    },
    'rec.proposals': {
      title: 'Санал батлах, татгалзах',
      what: 'Сонгосон мөрийн саналууд (дээд тал нь 5, оноо буурахаар). "Тулгах" — саналыг батална (✓ Батлагдсан); "Татгалзах" — тухайн саналыг хасна, автомат тулгалт дахин санал болгохгүй; "Тулгалт арилгах" — мөрийг тулгаагүй болгоно. Нэг мөрийн бүх санал нэг харьцагчид хамаарна; Σ мөр = Σ зорилт.',
      why: 'Дунд итгэлтэй санал (жишээ нь хэсэгчилсэн төлбөр) нь хэрэглэгчийн шийдвэр шаардана. Тулгалтын ажлын хуудсыг засах нь ledger-ийг өөрчлөхгүй — зөвхөн батлахад бичигдэнэ.',
      bc: 'Payment Application (Page 1292): "Applied" checkbox, Accept Applications / Reject Application actions.',
      rules: ['BR-BNK-59', 'BR-BNK-60', 'BR-BNK-61', 'BR-BNK-64', 'UX-REC-05'],
      data: ['bank.payment_application_proposal.accepted', 'bank.bank_reconciliation_line.applied_amount'],
      doc: [{ file: BNK, section: '5.10 Гар тулгалт, арилгах, хуваах (S-BNK-09)' }, { file: BNK, section: '4.6 Автомат тулгалт (BR-BNK-50..62)' }]
    },
    'rec.write-account': {
      title: 'Данс руу бичих, урьдчилгаа, зөрүүг хуваах',
      what: 'Тулгагдаагүй мөрийг (жишээ нь SMS-ийн хураамж) G/L данс руу бичих, эсвэл харилцагч/нийлүүлэгчийн урьдчилгаа (нэхэмжлэхгүй) болгоно. Хэсэгчлэн тайлбарлагдсан мөрийн зөрүүг сонгосон дансанд хуваана. Батлахад эдгээр нь BR (орлого) / BP (зарлага) ваучер болно, НӨАТ-гүй.',
      why: 'Тулгагдаагүй мөртэй хуулгыг батлахгүй — мөр бүр тайлбарлагдсан байх ёстой ("зөрүүтэйгээр батлах" байхгүй). НӨАТ-тай зардлыг худалдан авалтын нэхэмжлэхээр бүртгэнэ.',
      bc: 'Payment Reconciliation Journal "Transfer Difference to Account" (Page 1290), "Account Type/Account No." on Bank Acc. Reconciliation Line.',
      rules: ['BR-BNK-62', 'BR-BNK-67', 'BR-BNK-68', 'UX-REC-06', 'D-F4', 'BR-PST-38'],
      data: ['bank.bank_reconciliation_line.account_type', 'bank.bank_reconciliation_line.account_id', 'bank.bank_reconciliation_line.match_confidence (MANUAL)'],
      doc: [{ file: BNK, section: '5.10 Гар тулгалт, арилгах, хуваах (S-BNK-09)' }, { file: BNK, section: 'P7. MEDIUM санал, зөрүүг хуваах — R1 (FR-BNK-013, R-BANK-CASH-30)' }]
    },
    'rec.post': {
      title: 'Батлах ба тулгах (F9)',
      what: 'Шалгалт: Σ мөр = эцсийн − өмнөх үлдэгдэл, тулгагдаагүй мөр 0, мөрийн огноо ≤ хуулгын огноо. Дараа нь BLE-тэй тулгаагүй мөр бүр нэг ваучер (BR/BP, source PAYMTRECON, огноо = гүйлгээний огноо) болж, тулгагдсан бүх BLE хаагдана, дансны "сүүлийн хуулгын үлдэгдэл" = эцсийн үлдэгдэл.',
      why: 'Хуулга ба дэвтэр нэг агшинд тохирно; батлагдсан хуулгын агшин зураг (S-BNK-10) аудитад үлдэнэ.',
      bc: 'Codeunit "Bank Acc. Reconciliation Post" (370) → Bank Account Statement (Table 275/276); Payment Reconciliation "Post Payments and Reconcile".',
      rules: ['FR-BNK-013', 'BR-BNK-66', 'BR-BNK-67', 'BR-BNK-68', 'BR-BNK-69', 'BR-BNK-70', 'BR-BNK-81'],
      data: ['bank.bank_account_statement', 'bank.bank_ledger_entry.statement_status', 'bank.bank_account.last_statement_no'],
      doc: [{ file: BNK, section: '5.11 "Батлах ба тулгах" (`POST /bank-reconciliations/{id}:post`, FR-BNK-013)' }, { file: BNK, section: 'P6. Хуулга №6: автомат тулгалт ба "Батлах ба тулгах" — R1 (GS-REC-001, FR-BNK-011..013)' }]
    },
    'rec.report': {
      title: 'Тулгалтын тайлан (тэгшитгэл)',
      what: 'D огноонд: G/L(D) − Тулгагдаагүй дэвтрийн бичилт(D) + Тулгагдаагүй хуулгын мөр(D) − Хуулгын үлдэгдэл(D) = 0. Тулгалтын ажлын хуудсанд BLE-тэй бүлэглэгдсэн бичилтийг "тулгагдаагүй"-д оруулахгүй.',
      why: 'Банкны үлдэгдэл ба дэвтрийн үлдэгдлийн зөрүүг бүрэн тайлбарлана (замд яваа төлбөр, бүртгээгүй шимтгэл). ≠ 0 бол "Шалгах шаардлагатай".',
      bc: 'Report "Bank Acc. Recon. - Test" (1408) ба Codeunit "Bank Acc. Recon. Test": Balance at Statement Date = Ending Balance + Σ outstanding.',
      rules: ['FR-BNK-016', 'BR-BNK-78', 'BR-BNK-79'],
      data: ['bank.bank_account_statement.gl_balance_at_posting_date', 'bank.bank_account_statement.outstanding_payments', 'bank.bank_account_statement.outstanding_transactions'],
      doc: [{ file: BNK, section: '6.8 Тулгалтын тайлан (FR-BNK-016, BR-BNK-78)' }]
    },
    'rec.history': {
      title: 'Хуулгын түүх ба буцаалт (S-BNK-10)',
      what: 'Батлагдсан хуулга бүрийн агшин зураг. Зөвхөн хамгийн сүүлийн хуулгыг буцаана: тулгагдсан BLE дахин нээгдэж, "сүүлийн хуулгын үлдэгдэл" сэргэнэ, тулгалт дахин нээгдэнэ. Тулгалтаар үүссэн төлбөр, шимтгэлийн ваучер буцаагдахгүй — мөр нь тэр шинэ BLE-тэй тулгагдах тул давхар төлбөр үүсэхгүй.',
      why: 'Буруу тулгалтыг засах боломж; гэхдээ ledger-ийн бичилтийг устгахгүй (D-D5 — зөвхөн тусдаа буцаалт).',
      bc: 'Codeunit "Undo Bank Statement (Yes/No)" (UndoBankStatementYesNo); Bank Account Statement List (Page 389).',
      rules: ['FR-BNK-014', 'BR-BNK-73', 'BR-BNK-74', 'BR-BNK-75', 'BR-BNK-76'],
      data: ['bank.bank_account_statement.undone_at (SCR-BNK-02)', 'bank.bank_ledger_entry.statement_no'],
      doc: [{ file: BNK, section: '5.12 Тулгалтыг буцаах (`POST /bank-account-statements/{id}:undo`, FR-BNK-014)' }, { file: REQ, section: 'FR-BNK-014 Хуулгын тулгалтыг буцаах' }]
    }
  });
})();
