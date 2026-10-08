/* =============================================================================
   js/notes/gl.js — explanation notes for #coa, #journal, #trial-balance, #periods (js/screens/gl.js).
   Every rule id, table/column and section heading below was checked against the spec files
   (05, 06, 08, 09, 10, 13, 15, DECISIONS) and db/schema/*.sql.
   ========================================================================== */
(function () {
  'use strict';
  var N = window.ERP.notes;
  var PST = '05-posting-engine.md', PER = '10-periods-closing-reporting.md', UI = '15-ui-ux.md', DEC = 'DECISIONS.md',
    TAX = '08-tax-vat-mn.md', BNK = '09-bank-cash-fx.md', SAL = '06-sales-receivables.md', SEC = '13-security-audit-tenancy.md';

  // ---------------------------------------------------------------- #coa + shared drawers
  N.register('gl', 'Дансны төлөвлөгөө, дансны карт, бичилт хайх (S-GL-01/02)', {
    'gl.coa-balance': {
      title: 'Хугацаа ба үлдэгдлийн огноо',
      what: '"Үлдэгдлийн огноо" хүртэлх бүх бичилтийн нийлбэр нь "Үлдэгдэл" багана, "Хөдөлгөөн: эхлэх"-ээс тэр огноо хүртэлх цэвэр өөрчлөлт нь "Хөдөлгөөн" багана. Хайлт ба "Зөвхөн бичилтийн данс" нь модыг хавтгай жагсаалт болгоно.',
      why: 'Нягтлан тодорхой өдрийн байдлаар данс бүрийн үлдэгдлийг (жишээ нь сарын эцэс) шууд харах хэрэгтэй. Үлдэгдлийг хадгалдаггүй, ерөнхий дэвтрийн бичилтээс огноогоор тооцдог тул ямар ч огноогоор зөв гарна.',
      bc: 'Page 16 "Chart of Accounts": "Date Filter" ба FlowField "Balance at Date", "Net Change" (CalcFormula = Sum("G/L Entry".Amount)).',
      rules: ['UX-COA-03', 'BR-RPT-05', 'D-C3'],
      data: ['gl.gl_entry.amount', 'gl.gl_entry.posting_date', 'rpt.v_trial_balance_base'],
      doc: [{ file: UI, section: '16.6 Дансны төлөвлөгөө (S-GL-01)' }]
    },
    'gl.coa-tree': {
      title: 'Дансны мод: Гарчиг, Эхлэл, Төгсгөл',
      what: 'MN seed-ийн 182 данс: "Бичилт" (138) дансанд л гүйлгээ бичигдэнэ; "Гарчиг" ба "Эхлэл" (Begin-Total) мөр бүлгийг нээнэ, "Төгсгөл" (End-Total) мөр өөрийн нийлбэрийн мужийн (жишээ 1000..1999) дүнг харуулна. Догол нь indentation-аас. ▾/▸ эсвэл ←/→ товчоор бүлгийг хураана/дэлгэнэ. Дугаар дарвал дансны карт нээгдэнэ.',
      why: 'Санхүүгийн тайлангийн бүтэц ба нийлбэрийг дансны төлөвлөгөө дотроо агуулдаг BC-ийн загвар. Нийлбэр мөр хадгалагдсан дүнгүй — бичилтийн дансны нийлбэрээс тооцогддог тул хэзээ ч зөрөхгүй.',
      bc: 'Table 15 "G/L Account" ("Account Type", "Totaling", "Indentation"); Page 16 "Chart of Accounts"; Codeunit 3 "G/L Account-Indent".',
      rules: ['D-D1', 'UX-COA-01', 'UX-COA-02', 'UX-COA-03', 'BR-RPT-12'],
      data: ['gl.gl_account.account_type', 'gl.gl_account.indentation', 'gl.gl_account.totaling', 'gl.gl_account.income_balance'],
      doc: [{ file: UI, section: '16.6 Дансны төлөвлөгөө (S-GL-01)' }, { file: DEC, section: 'D. Ерөнхий дэвтэр, үе, хаалт' }]
    },
    'gl.coa-direct': {
      title: 'Шууд бичилт (direct posting)',
      what: '"Үгүй" гэсэн данс (1100–1111 мөнгө, 1200 авлага, 2100 өглөг, 1300/2300 НӨАТ г.м.) хяналтын данс: гар журналын "Данс" жагсаалтад гарахгүй. Тэдгээрт систем зөвхөн харилцагч, нийлүүлэгч, мөнгөний дансны мөр эсвэл НӨАТ-ын тохиргоогоор бичнэ.',
      why: 'Авлагын дэд дэвтрийн нийлбэр = 1200-ийн үлдэгдэл гэх мэт тэнцлийг хадгалахын тулд. Хэн нэгэн 1200 руу шууд журнал бичвэл харилцагчийн хуулга ба G/L зөрнө.',
      bc: 'Table 15 "G/L Account"."Direct Posting"; Codeunit 11 "Gen. Jnl.-Check Line" (TestField Direct Posting = true for user-entered lines).',
      rules: ['FR-GL-003', 'BR-PST-15', 'BR-PST-42', 'UX-JNL-04', 'INV-11'],
      data: ['gl.gl_account.direct_posting', 'party.customer_posting_group', 'bank.bank_account_posting_group'],
      doc: [{ file: PST, section: '4.2 Мөрийн шалгалт (BC CU11-ийн дасгал)' }, { file: PST, section: '4.7 Дэд дэвтэр (`ILedgerWriter`)' }]
    },
    'gl.coa-forma': {
      title: 'Маягт А-гийн мөр',
      what: 'Бичилтийн данс бүр СБТ (санхүүгийн байдлын тайлан) эсвэл ОДТ (орлогын дэлгэрэнгүй тайлан)-ийн нэг мөрөнд харгалзана, жишээ нь 1200 → СБТ 1.1.2, 5100 → ОДТ-ийн борлуулалтын мөр. "Маягт А-гийн шалгалт" товч харгалзаагүй эсвэл мөрийн шүүлтүүрт ороогүй дансыг жагсаана.',
      why: 'Жилийн тайланг (e-balance) дансны үлдэгдлээс автоматаар гаргахын тулд. Харгалзаагүй бичилттэй данс байвал сарын хаалт BLOCKING-оор зогсоно — тайлан тэнцэхгүй болохоос сэргийлнэ.',
      bc: 'BC-д шууд талбаргүй; ойролцоо нь Financial Report / Account Schedule (Table 85 "Acc. Schedule Line"."Totaling") ба Table 570 "G/L Account Category".',
      rules: ['FR-GL-002', 'BR-PER-33', 'UX-COA-07', 'BR-RPT-60'],
      data: ['gl.gl_account.statement_line_id', 'rpt.statement_line'],
      doc: [{ file: PER, section: '4.10 Маягт А (BR-RPT-60..69)' }, { file: PER, section: '4.4 Сарын хаалтын шалгах хуудас (BR-PER-30..45)' }]
    },
    'gl.coa-cf': {
      title: 'МГТ ангилал',
      what: 'Мөнгөн гүйлгээний тайлангийн (шууд арга) ангилал: мөнгөний данстай харьцсан данс нь мөнгө аль ангилалд (үйл ажиллагаа, хөрөнгө оруулалт, санхүүжилт) орохыг заана. CASH_TRANSFER = мөнгөний данс өөрөө (СБТ 1.1.1-тэй ижил олонлог), NON_CASH = мөнгөн бус.',
      why: 'МГТ-г ерөнхий дэвтрээс автоматаар гаргахын тулд данс бүр ангилалтай байх ёстой; ангилалгүй бичилттэй данс хаалтын шалгалтад BLOCKING.',
      bc: 'BC-д шууд аналоггүй (BC Cash Flow Forecast нь Table 841 "Cash Flow Account" тусдаа); энд MN-ийн шууд аргын МГТ-д зориулж нэмсэн.',
      rules: ['BR-PER-33', 'BR-RPT-70', 'BR-PER-39'],
      data: ['gl.gl_account.cash_flow_category_id', 'rpt.cash_flow_category'],
      doc: [{ file: PER, section: '4.11 Мөнгөн гүйлгээний тайлан — шууд арга (BR-RPT-70..77)' }]
    },
    'gl.coa-equation': {
      title: 'Нийлбэр мөр ба тэнцлийн тэгшитгэл',
      what: 'Төгсгөл мөр бүрийн дүнг (Σ amount өөрийн мужид) болон Хөрөнгө + Өр + Өмч + Тайлант үеийн үр дүн = 0 тэгшитгэлийг сонгосон огнооны жинхэнэ тоогоор харуулна.',
      why: 'Гүйлгээ бүр Дт = Кт тул бүх дансны нийлбэр үргэлж 0. Жилийн хаалтаас өмнө ашиг 5000–9999 дансанд байдаг; хаасны дараа 3500-д шилждэг тул тэгшитгэл хоёр байдалд хоёуланд нь биелнэ.',
      bc: 'Page 16 "Chart of Accounts" End-Total мөрийн "Totaling" FlowField; BC-ийн "Balance" нь мөн Σ G/L Entry.Amount.',
      rules: ['D-C5', 'INV-01', 'D-D4', 'BR-YEC-10'],
      data: ['gl.gl_entry.amount', 'gl.gl_account.totaling'],
      doc: [{ file: PST, section: '6.3 Ваучерын тэнцэл' }, { file: PER, section: '6.6.1 Дансны шүүлтүүр (`POSTING_ACCOUNTS`, `gl_account.totaling`)' }]
    },
    'gl.account-card': {
      title: 'Дансны карт ба сүүлийн бичилт',
      what: 'Дансны тохиргоо (төрөл, ангилал, хэвийн тал, шууд бичилт, Маягт А, МГТ), сонгосон хугацааны хөдөлгөөн ба үлдэгдэл, сүүлийн 25 бичилт өссөн үлдэгдэлтэй. Хяналтын дансны хувьд аль posting group, мөнгөний данс энэ дансанд бичдэгийг тайлбарлана. Баримтын дугаар дарвал тухайн гүйлгээний бүх бичилт нээгдэнэ.',
      why: 'Нягтлан дансны "яагаад ийм үлдэгдэлтэй вэ" гэдгийг нэг дор шалгана. Бичилттэй дансыг устгахгүй, зөвхөн блоклоно — түүх хадгалагдана.',
      bc: 'Page 17 "G/L Account Card"; Page 20 "General Ledger Entries" (Ctrl+F7); FactBox "G/L Account Statistics".',
      rules: ['FR-GL-004', 'UX-COA-04', 'UX-COA-06', 'FR-GL-005'],
      data: ['gl.gl_account', 'gl.gl_entry.entry_no', 'gl.gl_entry.transaction_no'],
      doc: [{ file: UI, section: '16.6 Дансны төлөвлөгөө (S-GL-01)' }, { file: UI, section: '15.2 Ерөнхий дэвтэр ба хаалт' }]
    },
    'gl.navigate': {
      title: 'Бичилт хайх (Navigate)',
      what: 'Баримтын дугаар ба бүртгэлийн огноогоор тухайн гүйлгээнд үүссэн бүх бичилтийг хүснэгт тус бүрээр тоолж (G/L, НӨАТ, харилцагч, нийлүүлэгч, банк/касс, МХ баримт, батлагдсан баримт, eBarimt), G/L бичилтийг бүтнээр нь харуулна.',
      why: 'Хуулийн дугаар жил бүр шинээр эхэлдэг тул дугаар + огноо хоёулаа тохирох ёстой. Аудитор нэг баримтаас бүх ledger руу "мөрдөх" боломжтой байх шаардлагатай.',
      bc: 'Page 344 "Navigate" (Find entries, Ctrl+Alt+Q); "Document No." + "Posting Date" шүүлтүүр.',
      rules: ['UX-NAV-15', 'UX-NAV-16', 'UX-NAV-17', 'FR-PLT-013'],
      data: ['audit.document_entry', 'gl.gl_entry.document_no', 'gl.gl_transaction.transaction_no'],
      doc: [{ file: UI, section: '2.5 Бичилт хайх (Navigate)' }]
    }
  });

  // ---------------------------------------------------------------- #journal
  N.register('journal', 'Ерөнхий журнал, урьдчилан харах, буцаалт (S-GL-03, S-GL-07, S-GL-08)', {
    'jnl.tabs': {
      title: 'Журналын мөр ба гүйлгээ',
      what: '"Журналын мөр" — батлагдаагүй ноорог мөрүүд (засварлана). "Гүйлгээ ба буцаалт" — аль хэдийн бичигдсэн гүйлгээ (gl_transaction); тэндээс журналаас үүссэн гүйлгээг буцаана.',
      why: 'Ноорог засагдана, бичигдсэн бичилт хэзээ ч засагдахгүй (append-only) — алдааг зөвхөн эсрэг тэмдэгтэй буцаалтаар засна.',
      bc: 'Page 39 "General Journal" ба Page 20 "General Ledger Entries" / Page 116 "G/L Registers" (Reverse Transaction / Reverse Register).',
      rules: ['D-C4', 'D-D5', 'FR-GL-006', 'FR-GL-013'],
      data: ['gl.journal_line', 'gl.gl_transaction'],
      doc: [{ file: UI, section: '16.5 Ерөнхий журнал (S-GL-03)' }, { file: DEC, section: 'C. Мөнгө, дугаарлалт, ledger' }]
    },
    'jnl.batch': {
      title: 'Багц (загвар · багц) ба цуврал',
      what: 'GENERAL (GJ), CASH_RECEIPT (банк BR, касс KO), PAYMENT (банк BP, касс KZ), OPENING (OB). Загвар нь source code-ийг (GENJNL, CASHRECJNL, PAYMENTJNL, OPENING) ба батлах үеийн хуулийн цувралыг тогтооно. Сүүлд сонгосон багцыг санана.',
      why: 'Ерөнхий журнал, мөнгөн орлого/зарлагын журнал, эхний үлдэгдэл нь өөр өөр дугаарын цуврал ба МХ баримттай; source code нь бичилт хаанаас үүссэнийг аудитад харуулна.',
      bc: 'Table 80 "Gen. Journal Template", Table 232 "Gen. Journal Batch" ("No. Series", "Posting No. Series", "Source Code"); Table 230 "Source Code".',
      rules: ['UX-JNL-01', 'UX-JNL-11', 'BR-PST-09', 'D-C7'],
      data: ['gl.journal_template.source_code', 'gl.journal_batch', 'platform.number_series'],
      doc: [{ file: PST, section: '3.7 Source code-ийн харгалзаа' }, { file: PST, section: '5.4 Ерөнхий журнал батлах' }]
    },
    'jnl.opening': {
      title: 'Эхний үлдэгдлийн журнал (OPENING)',
      what: 'Ашиглалтад орох өдрийн үлдэгдлийг OB-2026-##### ваучераар оруулна. Авлага, өглөгийг харилцагч/нийлүүлэгчийн мөрөөр баримт тус бүрээр, мөнгийг мөнгөний дансны мөрөөр; хяналтын дансанд шууд биш. Прототипт OB-2026-00001 аль хэдийн 2026.01.01-нд бичигдсэн, 1-р сар хаалттай.',
      why: 'Эхний авлага, өглөг дэд дэвтэрт баримтаараа байх ёстой (насжилт, тулгалт). Хаалттай сар руу posting хийхгүй тул шинэ OB ваучер gl.period_closed алдаа өгнө.',
      bc: 'BC-д General Journal-аар эхний үлдэгдэл (Opening Balance), Customer/Vendor journal lines with Applies-to; Configuration Package "Migrate opening balances".',
      rules: ['D-D7', 'UX-JNL-11', 'D-D3', 'BR-PST-18'],
      data: ['gl.gl_entry.source_code', 'party.cust_ledger_entry', 'party.vendor_ledger_entry'],
      doc: [{ file: PST, section: '5.4.4 Эхний үлдэгдэл (OPENING, D-D7)' }]
    },
    'jnl.cash': {
      title: 'Кассын багц ба МХ-1 / МХ-2',
      what: 'Кассын (CASH01) мөнгөний мөр бүр батлах үед кассын орлогын (МХ-1, KO) эсвэл зарлагын (МХ-2, KZ) баримт үүсгэнэ. Батлалтын дараа касс сөрөг үлдэгдэлтэй болох бол батлахгүй.',
      why: 'Кассын баримт нь хуулийн баримт (завсаргүй дугаар). Бэлэн мөнгө сөрөг байх боломжгүй тул систем хориглоно.',
      bc: 'BC-д МХ байхгүй (MN нэмэлт); ойролцоо нь Table 270 "Bank Account" + Cash Receipt / Payment Journal (Page 255/256).',
      rules: ['D-G1', 'BR-BNK-20', 'BR-BNK-21', 'BR-BNK-25', 'INV-19'],
      data: ['bank.posted_cash_voucher', 'bank.bank_ledger_entry', 'bank.bank_account.kind'],
      doc: [{ file: BNK, section: '4.3 Кассын баримт ба сөрөг үлдэгдэл (BR-BNK-20..29)' }, { file: PST, section: '5.4.5 Мөнгөн орлого/зарлагын журнал (CASH_RECEIPT, PAYMENT)' }]
    },
    'jnl.actions': {
      title: 'Батлах (F9), урьдчилан харах',
      what: '"Батлах" багцын бүх мөрийг шалгаад in-page баталгаажуулалтын дараа нэг гүйлгээнд бичнэ; амжилттай бол багц хоосорч, ноорог → хуулийн дугаарын харгалзааг харуулна. "Урьдчилан харах" ижил кодыг ажиллуулж үүсэх бичилтийг харуулаад буцаана. "+ Мөр нэмэх": өмнөх баримт тэнцээгүй бол ижил дугаар ба зөрүүг санал болгоно.',
      why: 'Бүх алдааг нэг удаа цуглуулж харуулна (хагас бичигдэх зүйл байхгүй). Батлагдсан мөрийг засахгүй тул батлахаас өмнө харах нь чухал.',
      bc: 'Codeunit 13 "Gen. Jnl.-Post Batch", Codeunit 12 "Gen. Jnl.-Post Line", Codeunit 19 "Gen. Jnl.-Post Preview"; F9 = Post.',
      rules: ['UX-JNL-08', 'UX-JNL-03', 'BR-PST-04', 'FR-GL-008', 'BR-PST-27'],
      data: ['gl.gl_register', 'gl.gl_transaction', 'gl.journal_line'],
      doc: [{ file: UI, section: '16.5 Ерөнхий журнал (S-GL-03)' }, { file: PST, section: '4.3 Ваучер ба тэнцэл' }]
    },
    'jnl.lines': {
      title: 'Журналын мөрүүд',
      what: 'Мөр бүр: огноо, ноорог баримт №, дансны төрөл, данс, тайлбар, дебит эсвэл кредит, (Данс төрөлд) НӨАТ-ын бүлэг, (харилцагч/нийлүүлэгчид) тулгах баримт. Алдаатай мөр зүүн талдаа улаан зураастай. Дүнгийн нэг талд л утга үлдэнэ; сөрөг дебит кредит рүү эерэгээр шилжинэ.',
      why: 'Серверт ганц тэмдэгтэй amount хадгалагддаг (D-C3); Дт/Кт хоёр багана нь зөвхөн UI. Хоосон мөр алгасагдана, 0 дүнтэй мөр батлагдахгүй.',
      bc: 'Table 81 "Gen. Journal Line" (Amount, "Debit Amount", "Credit Amount" validate); Page 39 "General Journal".',
      rules: ['UX-JNL-02', 'BR-PST-10', 'BR-PST-11', 'BR-PST-13', 'FR-GL-006'],
      data: ['gl.journal_line.amount', 'gl.journal_line.posting_date', 'gl.journal_line.document_no'],
      doc: [{ file: PST, section: '4.2 Мөрийн шалгалт (BC CU11-ийн дасгал)' }, { file: PST, section: '6.2 Тэмдэг ба багана' }]
    },
    'jnl.docno': {
      title: 'Ноорог дугаар → хуулийн дугаар',
      what: 'Мөрийн "Баримт №" нь J-###### ноорог дугаар (JNL_DRAFT цуврал, завсартай байж болно). Ижил ноорог дугаар + огноотой мөрүүд нэг ваучер. Батлахад ваучер бүр огноо, ноорог дугаарын дарааллаар GJ-2026-00021 гэх мэт завсаргүй хуулийн дугаар авна.',
      why: 'Хуулийн дугаарт цоорхой байх ёсгүй; ноорог устгах, preview хийхэд дугаар зарцуулагдахгүй байхын тулд хуулийн дугаарыг зөвхөн батлах мөчид олгоно.',
      bc: 'Table 308 "No. Series" / 309 "No. Series Line"; Gen. Journal Batch "No. Series" (ноорог) ба "Posting No. Series" (батлах).',
      rules: ['D-C7', 'BR-PST-21', 'BR-PST-26', 'BR-PST-27', 'UX-JNL-03'],
      data: ['gl.journal_line.document_no', 'gl.gl_transaction.document_no', 'platform.number_series'],
      doc: [{ file: PST, section: '4.4 Дугаарлалт' }, { file: PST, section: '4.3 Ваучер ба тэнцэл' }]
    },
    'jnl.account-type': {
      title: 'Дансны төрөл: Данс / Харилцагч / Нийлүүлэгч / Мөнгөний данс',
      what: '"Данс" нь зөвхөн шууд бичих боломжтой, блоклоогүй бичилтийн данс. Харилцагч → posting group-ийн авлагын данс (1200) + авлагын бичилт; Нийлүүлэгч → өглөгийн данс (2100) + өглөгийн бичилт; Мөнгөний данс → банк/кассын данс (1100/1110/1111) + банкны бичилт.',
      why: 'Хяналтын дансыг зөвхөн дэд дэвтэртэй хамт бичих замаар Σ дэд дэвтэр = хяналтын данс тэнцлийг үргэлж хадгална.',
      bc: 'Table 81 "Gen. Journal Line"."Account Type" (G/L Account, Customer, Vendor, Bank Account); Codeunit 12 → Cust./Vend./Bank Account Posting Group.',
      rules: ['UX-JNL-04', 'BR-PST-12', 'BR-PST-42', 'FR-GL-003'],
      data: ['gl.journal_line.account_type', 'gl.journal_line.account_id', 'party.customer_posting_group.receivables_account_id'],
      doc: [{ file: PST, section: '4.7 Дэд дэвтэр (`ILedgerWriter`)' }, { file: UI, section: '16.5 Ерөнхий журнал (S-GL-03)' }]
    },
    'jnl.vat': {
      title: 'Журналын мөрийн НӨАТ (gross арга)',
      what: 'НӨАТ-ын бүлэг сонгосон "Данс" мөрийн дүн НӨАТ орсон гэж үзнэ: НӨАТ = A × 10 / 110 (бөөрөнхийлсөн), суурь = A − НӨАТ. Суурь нь сонгосон дансанд, НӨАТ VAT Posting Setup-ийн дансанд (1300 орц / 2300 борлуулалт) бичигдэж, нэг НӨАТ-ын бичилт үүснэ. Орцын НӨАТ ДДТД-гүй тул "баталгаажаагүй".',
      why: 'Гар журналаар орсон худалдан авалт, борлуулалтын НӨАТ ч ТТ-03а-д орох ёстой. Нэг ваучерт нэгээс олон харилцагч/нийлүүлэгч байвал НӨАТ-ыг хэнд хамааруулах тодорхойгүй тул хориглоно.',
      bc: 'Table 81 "Gen. Posting Type", "VAT Bus./Prod. Posting Group", "VAT Amount"; Table 325 "VAT Posting Setup"; Table 254 "VAT Entry".',
      rules: ['BR-PST-36', 'BR-PST-38', 'BR-PST-16', 'BR-PST-23', 'D-E4'],
      data: ['gl.journal_line.vat_amount', 'gl.journal_line.vat_base_amount', 'tax.vat_entry', 'tax.vat_posting_setup'],
      doc: [{ file: PST, section: '6.4 Журналын мөрийн НӨАТ (gross арга, R-VAT-16)' }, { file: TAX, section: '6.8 Журналын мөр (gross арга, 05 §6.4)' }]
    },
    'jnl.applies': {
      title: 'Тулгах баримт (applies-to)',
      what: 'Харилцагч/нийлүүлэгчийн мөрөнд эсрэг тэмдэгтэй нээлттэй баримтыг сонгоно. Дүн хоосон бол үлдэгдлээр бөглөгдөнө. Батлахад төлбөр ба нэхэмжлэх ижил гүйлгээнд тулгагдаж, нэхэмжлэхийн үлдэгдэл буурна.',
      why: 'Төлбөрийг аль нэхэмжлэхэд хамааруулахыг тодорхой заахгүй бол насжилт, хугацаа хэтэрсэн авлага буруу гарна.',
      bc: 'Table 81 "Applies-to Doc. Type/No.", "Applies-to ID"; Codeunit 12 "Gen. Jnl.-Post Line" ApplyCustLedgEntry.',
      rules: ['BR-PST-14', 'BR-AR-20', 'BR-AR-25', 'UX-JNL-05'],
      data: ['party.cust_ledger_entry.remaining_amount', 'party.detailed_cust_ledger_entry', 'party.vendor_ledger_entry'],
      doc: [{ file: SAL, section: '4.12 Тулгалт' }]
    },
    'jnl.normal-side': {
      title: '◐ Хэвийн талын анхааруулга (W-01)',
      what: 'Данс нь хэвийн талаараа (жишээ нь зардал Дт, орлого Кт) биш тал руу бичигдэж байвал дүнгийн хажууд ◐ гарна. Энэ нь зөвхөн анхааруулга — батлахыг зогсоохгүй.',
      why: 'Буцаалт, залруулга зэрэгт эсрэг тал руу бичих нь зөв байж болно; гэхдээ ихэнхдээ дебит/кредитийг сольж оруулсан алдааг илрүүлнэ.',
      bc: 'Table 15 "G/L Account"."Debit/Credit" (Both / Debit / Credit) — BC-д мөн зөвхөн мэдээллийн шинж.',
      rules: ['FR-GL-005', 'D-D1', 'UX-JNL-07', 'W-01'],
      data: ['gl.gl_account.normal_side'],
      doc: [{ file: PST, section: '8.7 Анхааруулга (батлахыг зогсоохгүй)' }]
    },
    'jnl.balance': {
      title: 'Баримтын ба багцын тэнцэл',
      what: 'Доод самбар: фокустай мөрийн дансны нэр ба үлдэгдэл, тэр мөрийн баримтын (ноорог № + огноо) тэнцэл, бүх багцын тэнцэл, мөр/ваучерын тоо. 0.00 ✓ үед л батлагдана; тэнцээгүй бол зөрүүг улаанаар.',
      why: 'Ваучер бүр Дт = Кт байх ёстой — хүлцэл, автомат "round-off" мөр байхгүй. Багцын тэнцэл 0 боловч ваучер тус бүр тэнцэхгүй бол батлахгүй.',
      bc: 'Page 39 "General Journal" footer: "Account Name", "Bal. Account Name", "Balance", "Total Balance"; Codeunit 13 "Gen. Jnl.-Post Batch" CheckBalance.',
      rules: ['FR-GL-007', 'D-C5', 'BR-PST-22', 'UX-JNL-06'],
      data: ['gl.journal_line.amount', 'gl.journal_line.document_no', 'gl.journal_line.posting_date'],
      doc: [{ file: PST, section: '6.3 Ваучерын тэнцэл' }, { file: UI, section: '16.5 Ерөнхий журнал (S-GL-03)' }]
    },
    'jnl.calc': {
      title: 'Тооцоо: тэмдэг, ваучер, НӨАТ, данс',
      what: 'Мөр бүрийн дебит/кредит → тэмдэгтэй amount, ваучер тус бүрийн Σ, НӨАТ-ын яг ба бөөрөнхийлсөн дүн, суурь, ямар дансанд бичигдэхийг одоогийн мөрийн тоогоор алхам алхмаар харуулна.',
      why: 'Нягтлан систем юу хийснийг гараар давтаж шалгаж чадах ёстой (хар хайрцаг биш).',
      bc: 'Codeunit 11 "Gen. Jnl.-Check Line", Codeunit 12 "Gen. Jnl.-Post Line" (InsertVAT, CalcVATAmount).',
      rules: ['D-C3', 'BR-PST-21', 'BR-PST-22', 'BR-PST-36'],
      data: ['gl.gl_entry.amount', 'tax.vat_entry.base', 'tax.vat_entry.amount'],
      doc: [{ file: PST, section: '6.2 Тэмдэг ба багана' }, { file: PST, section: '6.4 Журналын мөрийн НӨАТ (gross арга, R-VAT-16)' }]
    },
    'jnl.preview': {
      title: 'Батлахын өмнө харах (preview)',
      what: 'Үүсэх G/L, НӨАТ, харилцагч, нийлүүлэгч, банк/кассын бичилтийг tab-аар харуулна. Дугаар нь *** ба харьцангуй entry № (1..n). Хаахад юу ч бичигдээгүй, дугаар зарцуулагдаагүй хэвээр.',
      why: 'Preview нь батлахтай яг ижил кодоор явж, төгсгөлд ROLLBACK хийдэг — тиймээс preview-д харсан зүйл батлахад яг тийм гарна, preview-ийн алдаа = батлахын алдаа.',
      bc: 'Codeunit 19 "Gen. Jnl.-Post Preview", Page 93 "G/L Posting Preview" (Preview Posting).',
      rules: ['FR-GL-011', 'BR-PST-52', 'BR-PST-53', 'D-C6'],
      data: ['gl.gl_entry', 'tax.vat_entry', 'party.cust_ledger_entry', 'bank.bank_ledger_entry'],
      doc: [{ file: PST, section: '4.10 Preview' }, { file: UI, section: '5.5 Батлахын өмнө харах (preview)' }]
    },
    'jnl.tx-list': {
      title: 'Гүйлгээний жагсаалт',
      what: 'Бичигдсэн гүйлгээ (шинээс хуучин): №, огноо, баримт №, source, тайлбар, Σ дебит, үеийн төлөв, буцаалтын төлөв. "Буцааж болох" шүүлтүүр нь нээлттэй үеийн, журналаас үүссэн, тулгагдаагүй гүйлгээг л харуулна. Мөр дарвал доор дэлгэрэнгүй нээгдэнэ.',
      why: 'Буцаалт нь гүйлгээ (transaction_no) түвшинд хийгддэг. Нэхэмжлэх, худалдан авалтаас үүссэн гүйлгээг кредит нотоор засна — тиймээс зөвхөн журналын source-той гүйлгээ буцаагдана.',
      bc: 'Page 116 "G/L Registers", Page 20 "General Ledger Entries" → "Reverse Transaction".',
      rules: ['D-D5', 'BR-PST-45', 'BR-PST-46', 'FR-GL-013'],
      data: ['gl.gl_transaction.source_code', 'gl.gl_transaction.reversed_by_transaction_no', 'gl.accounting_period.status'],
      doc: [{ file: PST, section: '3.7 Source code-ийн харгалзаа' }, { file: PST, section: '4.9 Буцаалт ба залруулга' }]
    },
    'jnl.reverse': {
      title: 'Гүйлгээ буцаах (storno-гүй)',
      what: 'Эх бичилт ба буцаалтын бичилтийг зэрэгцүүлнэ: мөр бүр эсрэг тэмдэгтэй, тиймээс эх дебит нь буцаалтад кредит баганад эерэгээр гарна (сөрөг дебит биш). Ижил баримт №, ижил огноо, source REVERSAL, шалтгааны код заавал. НӨАТ, харилцагч/нийлүүлэгч, банкны бичилт мөн толин тусгалаар хаагдана. Нэг гүйлгээг нэг л удаа буцаана.',
      why: 'Бичигдсэн ledger-ийг засах, устгах боломжгүй (append-only). Монголын тайлангийн уламжлалаар сөрөг багана (storno) хэрэглэхгүй — гүйлгээ баланс дахь эргэлт хоёр тал руу нэмэгдэнэ.',
      bc: 'Codeunit 17 "Gen. Jnl.-Post Reverse", Codeunit 179 "Reversal-Post", Table 179 "Reversal Entry", Page 179 "Reverse Entries".',
      rules: ['D-C3', 'D-D5', 'BR-PST-30', 'BR-PST-47', 'BR-PST-49', 'BR-PST-50', 'INV-22', 'FR-GL-010'],
      data: ['gl.gl_entry.reversed', 'gl.gl_entry.reversed_entry_no', 'gl.gl_transaction.reverses_transaction_no', 'gl.gl_transaction.reversed_by_transaction_no'],
      doc: [{ file: PST, section: '5.10 Буцаалт (гүйлгээ ба register)' }, { file: PST, section: 'E-F. Гүйлгээ буцаах: E-A (GS-GL-006)' }]
    },
    'jnl.correction': {
      title: 'Хаалттай үеийн залруулах журнал',
      what: 'Эх гүйлгээний сар хаалттай бол буцаахгүй; оронд нь өнөөдрийн (нээлттэй) огноотой, эсрэг тэмдэгтэй ноорог мөрүүдийг GENERAL багцад санал болгоно. Автоматаар батлахгүй — нягтлан хянаад батална.',
      why: 'Хаасан сарын тайлан (илгээсэн НӨАТ, санхүүгийн тайлан) өөрчлөгдөх ёсгүй; залруулга нь бичигдсэн үедээ тусна.',
      bc: 'BC-д ижил функц байхгүй (BC хаалттай үед reversal-ийг хориглодог); гараар General Journal-аар залруулдагийг автоматжуулсан.',
      rules: ['FR-GL-014', 'BR-PST-51', 'BR-PER-26', 'SEC-POST-09', 'W-03'],
      data: ['gl.journal_line', 'gl.accounting_period.status'],
      doc: [{ file: PST, section: '5.11 Хаалттай үеийн залруулгын санал (FR-GL-014)' }, { file: PST, section: 'E-L. Хаалттай үеийн залруулгын санал (GS-GL-012, FR-GL-014)' }]
    }
  });

  // ---------------------------------------------------------------- #trial-balance
  N.register('trial-balance', 'Гүйлгээ баланс (S-RPT-02)', {
    'tb.filters': {
      title: 'Хугацаа ба шүүлтүүр',
      what: 'Эхлэх ба дуусах огноо (хоёулаа заавал), түргэн сонголт (энэ сар, өмнөх сар, оны эхнээс, бүтэн жил), "Тэг данс харуулах", "Гарчиг, нийлбэр" (Heading/Total мөр нэмэх).',
      why: 'Гүйлгээ баланс нь заасан хугацааны эргэлтийг харуулдаг; хоёр талдаа хязгаартай муж л зөвшөөрнө. Бүх G/L тайлан бүртгэлийн огноогоор (НӨАТ-ын огноо биш).',
      bc: 'Report 6 "Trial Balance" ("Date Filter"), Report 38 "Trial Balance by Period".',
      rules: ['UX-TB-01', 'BR-RPT-01', 'BR-RPT-05', 'BR-RPT-12'],
      data: ['rpt.fn_trial_balance', 'gl.gl_entry.posting_date'],
      doc: [{ file: UI, section: '16.8 Гүйлгээ баланс (S-RPT-02)' }]
    },
    'tb.closing': {
      title: 'Хаалтын бичилт оруулах',
      what: 'Анхдагчаар унтраастай: дуусах огноо нь 12-31 бол тэр өдрийн жилийн хаалтын (is_closing) бичилтийг гүйлгээний баганаас хасна. Асаахад орно. Эхний үлдэгдэлд өмнөх хаалтууд үргэлж орно.',
      why: 'BC-ийн "C-огноо"-г орлох D-D4-ийн шийдэл: хаалтын бичилт 12-31-нд хийгдэх боловч хаалтын өмнөх (ашиг харагдах) ба дараах байдлыг хоёуланг нь харах боломжтой байх ёстой.',
      bc: 'BC "Closing Date" (C12/31/26) ба "Closing Entries" шүүлтүүр (Report 6 "Trial Balance", Account Schedule "Closing Entries: Include/Exclude").',
      rules: ['D-D4', 'BR-RPT-02', 'BR-RPT-11', 'UX-TB-01'],
      data: ['gl.gl_entry.is_closing', 'gl.gl_transaction.is_closing'],
      doc: [{ file: PER, section: '6.1 Хаалтын бичилтийн дарааллын түлхүүр `k`' }, { file: PER, section: '4.7 Гүйлгээ баланс, ерөнхий дэвтэр, хуулга, бүртгэл (BR-RPT-10..19)' }]
    },
    'tb.ob': {
      title: 'OPENING ваучер эхний үлдэгдэлд',
      what: 'Асаалттай (анхдагч) үед ашиглалтад орох өдрийн эхний үлдэгдлийн (OB) ваучер хугацааны дотор байсан ч "Эхний үлдэгдэл" баганад орно, гүйлгээнд биш. Унтраавал гүйлгээнд харагдана.',
      why: 'Эхний жилд оны эхнээс тайлан гаргахад эхний үлдэгдлийг эргэлт гэж харуулах нь буруу (эргэлт хиймэл өснө). Прототипын нэмэлт сонголт — хөдөлгүүрийн reports.trialBalance-тай ижил үр дүн.',
      bc: 'BC-д ийм сонголт байхгүй; BC-д эхний үлдэгдлийг ихэвчлэн өмнөх оны сүүлийн өдрөөр (closing date) оруулдаг.',
      rules: ['D-D7', 'BR-YEC-16', 'BR-RPT-11'],
      data: ['gl.gl_entry.source_code'],
      doc: [{ file: PER, section: '4.5 Жилийн хаалт (BR-YEC-01..16)' }, { file: PST, section: '5.4.4 Эхний үлдэгдэл (OPENING, D-D7)' }]
    },
    'tb.sim': {
      title: 'Жилийн хаалтын загварчлал',
      what: '"Үе ба хаалт" дэлгэцээс ирсэн бол жилийн хаалтын ваучерын мөрүүд (CL-2026-*****, 12-31, is_closing) зөвхөн энэ тайланд нэмэгдэнэ. Ledger-т бичигдээгүй; "Хаалтын бичилт оруулах"-ыг асааж/унтрааж хоёр байдлыг харьцуулна.',
      why: 'Нягтлан жилийн хаалтыг батлахаас өмнө 5000–9999 данс тэглэгдэж, 3500-д үр дүн шилжихийг гүйлгээ балансаар шалгах боломж.',
      bc: 'BC-д байхгүй (BC Report 94 "Close Income Statement" журналын мөр үүсгэдэг тул журналыг preview хийж харна).',
      rules: ['D-D4', 'BR-YEC-01', 'BR-YEC-14'],
      data: ['gl.gl_entry.is_closing'],
      doc: [{ file: PER, section: '5.6 Жилийн хаалтын wizard (S-GL-11)' }]
    },
    'tb.columns': {
      title: 'Эхний үлдэгдэл · Гүйлгээ · Эцсийн үлдэгдэл',
      what: 'Данс бүрд 3 хос багана. Эхний = Σ amount (огноо < эхлэх); Гүйлгээ Дт = хугацааны эерэг дүнгийн нийлбэр, Кт = сөрөг дүнгийн нийлбэр (тэмдэггүй); Эцсийн = эхний + Дт − Кт. Үлдэгдлийн Дт/Кт нь цэвэр үлдэгдлийн тэмдгээр. Дүн дээр дарж бичилт рүү задална; дансны дугаар дарж карт нээнэ.',
      why: 'Order 100-ийн эргэлтийн тайлан (гүйлгээ баланс) — Монголын нягтлангийн үндсэн шалгах хэрэгсэл. Буцаалтын хос хоёулаа гүйлгээнд ордог (storno-гүй).',
      bc: 'Report 6 "Trial Balance" ("Net Change", "Balance"); Page 20 "General Ledger Entries" drill-down.',
      rules: ['FR-RPT-001', 'BR-RPT-10', 'BR-RPT-11', 'BR-RPT-15', 'UX-TB-02'],
      data: ['rpt.fn_trial_balance', 'rpt.v_trial_balance_base', 'gl.gl_entry.debit_amount', 'gl.gl_entry.credit_amount'],
      doc: [{ file: PER, section: '6.4 Гүйлгээ балансын томьёо' }, { file: PER, section: '5.9 Гүйлгээ баланс (FR-RPT-001; SCR-RPT-01-ийн функц)' }]
    },
    'tb.totals': {
      title: 'НИЙТ мөр: гурван хос тэнцэнэ',
      what: 'Бичилтийн дансны Σ эхний Дт = Кт, Σ гүйлгээ Дт = Кт, Σ эцсийн Дт = Кт бол хос бүрийн доор "✓ тэнцсэн". Аль нэг нь зөрвөл улаан тууз "Тэнцэхгүй — системийн алдаа".',
      why: 'Гүйлгээ бүр Σ = 0 (DB-ийн deferred trigger) тул тэнцэхгүй байх боломжгүй; зөрвөл энэ нь өгөгдлийн гэмтэл бөгөөд хэрэглэгчийн алдаа биш.',
      bc: 'Report 6 "Trial Balance" нийлбэр мөр.',
      rules: ['UX-TB-03', 'D-C5', 'INV-01', 'FR-RPT-001'],
      data: ['gl.gl_entry.amount'],
      doc: [{ file: UI, section: '16.8 Гүйлгээ баланс (S-RPT-02)' }, { file: PER, section: 'E-2. Гүйлгээ баланс 2026-01-01..2026-12-31, хаалтын бичилтгүй' }]
    },
    'tb.calc': {
      title: 'Тооцоо: томьёо ба шалгалт',
      what: 'Хамгийн их эргэлттэй дансаар томьёог жинхэнэ тоогоор задлаад, гурван нийлбэрийн тэнцлийг харуулна. Мөн энэ дэлгэцийн тооцоог хөдөлгүүрийн reports.trialBalance-тай тулгаж 6 нийлбэр ижил эсэхийг шалгана.',
      why: 'Хоёр өөр замаар тооцсон дүн таарах нь тайлангийн логик зөвийг баталгаажуулна.',
      bc: 'Report 6 "Trial Balance".',
      rules: ['BR-RPT-10', 'BR-RPT-11', 'D-C5'],
      data: ['rpt.fn_trial_balance'],
      doc: [{ file: PER, section: '6.4 Гүйлгээ балансын томьёо' }]
    },
    'tb.drill': {
      title: 'Задлах (drill-down)',
      what: 'Эхний үлдэгдлийн нүд → огноо < эхлэх бичилтүүд; гүйлгээний Дт/Кт нүд → хугацааны эерэг/сөрөг бичилтүүд (хаалтын шүүлтүүр ижил); эцсийн нүд → огноо ≤ дуусах. Баримт № дарж Navigate нээнэ.',
      why: 'Тайлангийн тоо бүр бичилт хүртэл мөрдөгдөх ёстой (аудитын мөр).',
      bc: 'Report 6 / Page 16 "Chart of Accounts" → DrillDown → Page 20 "General Ledger Entries".',
      rules: ['UX-TB-04', 'BR-RPT-13'],
      data: ['gl.gl_entry.posting_date', 'gl.gl_entry.amount', 'gl.gl_entry.is_closing'],
      doc: [{ file: PER, section: '4.7 Гүйлгээ баланс, ерөнхий дэвтэр, хуулга, бүртгэл (BR-RPT-10..19)' }]
    }
  });

  // ---------------------------------------------------------------- #periods
  N.register('periods', 'Санхүүгийн жил, үе ба хаалт (S-GL-09, S-GL-10, S-GL-11)', {
    'per.window': {
      title: 'Компанийн posting цонх',
      what: 'allow_posting_from / allow_posting_to (прототипт 2026.01.01–2026.12.31). Цонхоос гадуурх огноотой баримт, журнал, буцаалт хэнд ч (Эзэнд ч) батлагдахгүй. Сарын төлөв нь гол түгжээ, цонх нэмэлт давхарга.',
      why: 'Санамсаргүйгээр ирээдүйн эсвэл хуучин огноогоор бичихээс сэргийлнэ.',
      bc: 'Table 98 "General Ledger Setup"."Allow Posting From/To"; Table 91 "User Setup" (R2-т хэрэглэгчийн цонх).',
      rules: ['D-D3', 'FR-GL-023', 'BR-PER-20', 'BR-PER-21', 'SEC-POST-01'],
      data: ['platform.company_setup.allow_posting_from', 'platform.company_setup.allow_posting_to'],
      doc: [{ file: PER, section: '4.3 Posting огнооны цонх ба түгжээний давхарга (BR-PER-20..26)' }, { file: SEC, section: '8.3 Үеийн төлөв ба эрх' }]
    },
    'per.list': {
      title: 'Сарууд ба төлөв',
      what: '2026 оны 12 сар: Нээлттэй → (Хаах) → Хаалттай → (Түгжих) → Түгжсэн; Хаалттай → (Дахин нээх, зөвхөн Эзэн) → Нээлттэй. Түгжсэн сар дахин нээгдэхгүй. НӨАТ-ын үе тусдаа төлөвтэй (баганад). Мөр сонгоход доор шалгах хуудас гарна.',
      why: 'Хаасан сарын тоо (илгээсэн тайлан) өөрчлөгдөхгүй байх баталгаа. Сар хаах нь НӨАТ-ын үеийг хаахгүй — НӨАТ-ын тайлан тусдаа илгээгддэг.',
      bc: 'Table 50 "Accounting Period", Page 100 "Accounting Periods" ("Closed", "Date Locked"); BC-д Locked төлөвийг User Setup-ийн огноогоор хийдэг.',
      rules: ['D-D3', 'BR-PER-10', 'BR-PER-12', 'BR-PER-25', 'FR-GL-024'],
      data: ['gl.accounting_period.status', 'gl.fiscal_year.status', 'tax.vat_return_period.status'],
      doc: [{ file: PER, section: '4.2 Үеийн төлөвийн машин (BR-PER-10..19)' }]
    },
    'per.checklist': {
      title: 'Сарын хаалтын шалгах хуудас',
      what: 'Тогтмол кодтой мөрүүд (FORM_A_MAPPING, BANK_UNRECONCILED, CASH_COUNTED, EBARIMT_OPEN, INPUT_VAT_UNCONFIRMED, VAT_RETURN_NOT_CLOSED, DRAFTS_IN_PERIOD, SUBLEDGER_GL_DIFF, PRIOR_PERIOD_OPEN …) тус бүр OK / WARNING / BLOCKING. BLOCKING байвал хаахгүй; WARNING-тай бол шалтгаантай хүлээн зөвшөөрч хаана.',
      why: 'Сар хаахаас өмнө нийтлэг алдаа (тулгаагүй банк, eBarimt-ийн алдаа, дэд дэвтэр ба G/L зөрүү) үлдээгүйг нэг дор шалгана.',
      bc: 'BC-д шууд аналоггүй (BC-ийн "Close the period" гарын авлагын алхмууд); MN-д зориулж нэмсэн.',
      rules: ['BR-PER-30', 'BR-PER-33', 'BR-PER-38', 'BR-PER-40', 'BR-PER-14', 'BR-PER-45'],
      data: ['gl.accounting_period_status_log.checklist_snapshot'],
      doc: [{ file: PER, section: '4.4 Сарын хаалтын шалгах хуудас (BR-PER-30..45)' }]
    },
    'per.close': {
      title: 'Сар хаах (in-page баталгаажуулалт)',
      what: 'Шалгах хуудсыг дахин ажиллуулна. BLOCKING байвал товч идэвхгүй. Анхааруулгатай бол "хүлээн зөвшөөрөх" чагт ба ≥ 10 тэмдэгт шалтгаан заавал; кассын тооллогыг гараар баталгаажуулж болно. Хаасны дараа тухайн сарын огноотой ямар ч posting хийгдэхгүй.',
      why: 'Анхааруулгатай хаасан шалтгаан ба тэр үеийн шалгах хуудасны snapshot аудитын логт хадгалагдана — дараа нь "яагаад хаасан бэ" гэдгийг нотолно.',
      bc: 'Page 100 "Accounting Periods" → "Close Year" / User Setup "Allow Posting From" шилжүүлэх (BC-д сар хаах нь огнооны цонхоор).',
      rules: ['BR-PER-13', 'BR-PER-44', 'BR-PER-32', 'BR-PER-20', 'SEC-POST-10'],
      data: ['gl.accounting_period.status', 'gl.accounting_period_status_log.reason_text', 'gl.accounting_period_status_log.checklist_snapshot'],
      doc: [{ file: PER, section: '5.3 Сар хаах (`POST /accounting-periods/{id}:close`)' }]
    },
    'per.lock': {
      title: 'Сар түгжих',
      what: 'Зөвхөн хаалттай сарыг түгжинэ; "буцаагдахгүйг ойлгосон" баталгаажуулалт заавал. 12-р сарыг жилийн хаалтаас өмнө түгжихгүй. Түгжсэн сарыг ямар ч эрхээр нээх үйлдэл UI ба API-д байхгүй.',
      why: 'НӨАТ-ын тайлан эсвэл жилийн тайлан илгээсний дараа тэр сарын өгөгдлийг бүрмөсөн царцаана.',
      bc: 'Table 50 "Accounting Period"."Date Locked" (Close Year-ийн дараа).',
      rules: ['BR-PER-16', 'SEC-POST-03', 'SEC-POST-08', 'FR-GL-024'],
      data: ['gl.accounting_period.status'],
      doc: [{ file: PER, section: '5.5 Дахин нээх, түгжих' }]
    },
    'per.history': {
      title: 'Төлөвийн түүх',
      what: 'Сар бүрийн шилжилт: огноо/цаг, хэрэглэгч, хуучин → шинэ төлөв, шалтгаан. 1–8-р сарын мөрүүд нь жишээ түүх.',
      why: 'Дахин нээлт бүр шалтгаантай, хэн хийсэн нь тодорхой байх ёстой (DB-д дахин нээхэд reason_text заавал — CHECK).',
      bc: 'BC-д тусгай хүснэгтгүй; Table 405 "Change Log Entry" ойролцоо.',
      rules: ['BR-PER-18', 'SEC-POST-05', 'SEC-POST-02'],
      data: ['gl.accounting_period_status_log.from_status', 'gl.accounting_period_status_log.to_status', 'gl.accounting_period_status_log.reason_text'],
      doc: [{ file: PER, section: '4.2 Үеийн төлөвийн машин (BR-PER-10..19)' }, { file: SEC, section: '8.4 Дахин нээх алгоритм' }]
    },
    'yec.checks': {
      title: 'Жилийн хаалтын урьдчилсан нөхцөл',
      what: 'BLOCKING: жил түгжээгүй, 12 сар бүгд хаалттай/түгжсэн, 12-р сар түгжээгүй, 3500 данс зөв тохируулсан, 12-31 цонх дотор, данс бүр Маягт А-д харгалзсан. WARNING: ААНОАТ (9100) бичигдээгүй, 12-р сарын НӨАТ-ын үе нээлттэй, дараагийн жил үүсээгүй (W-04) гэх мэт — хаалтыг зогсоохгүй.',
      why: 'Хаалтын дараа сар нээгдэхгүй байх нөхцөлд л үр дүнг 3500-д тогтвортой шилжүүлнэ. Прототипт 9–12-р сар нээлттэй тул одоогоор BLOCKING.',
      bc: 'Codeunit 6 "Fiscal Year-Close" ба Report 94 "Close Income Statement"-ийн шалгалт (бүх үе Closed байх).',
      rules: ['BR-YEC-02', 'BR-YEC-03', 'BR-PST-54', 'FR-GL-026'],
      data: ['gl.fiscal_year.status', 'gl.accounting_period.status', 'gl.general_ledger_setup.current_year_result_account_id'],
      doc: [{ file: PER, section: '4.5 Жилийн хаалт (BR-YEC-01..16)' }, { file: PST, section: '4.11 Жилийн хаалт' }]
    },
    'yec.voucher': {
      title: 'Хаалтын ваучерын урьдчилсан харагдац',
      what: '5000–9999 данс бүрийн net = Σ amount (2026-01-01..12-31, өмнөх хаалтын бичилт орно) → мөр −net; 3500 "Тайлант үеийн ашиг (алдагдал)"-д R = Σ net. CL цуврал, 12-31, is_closing = true, source CLSINCOME, НӨАТ ба дэд дэвтэргүй. Батлахаас өмнө бүх мөрийг Дт/Кт-ээр харуулна.',
      why: 'D-D4: тусдаа "нэгдсэн данс" (BC Closing Date + Retained Earnings)-ын оронд 12-31-ний тэмдэглэгдсэн бичилт. Дахин ажиллуулахад зөвхөн зөрүү бичигдэнэ; зөрүү 0 бол ваучер үүсэхгүй.',
      bc: 'Report 94 "Close Income Statement" (Closing Date-тай журналын мөр → Retained Earnings Acc.); Codeunit 6 "Fiscal Year-Close".',
      rules: ['D-D4', 'BR-YEC-04', 'BR-PST-55', 'BR-PST-56', 'BR-PST-17', 'BR-YEC-07', 'BR-YEC-06'],
      data: ['gl.gl_entry.is_closing', 'gl.gl_transaction.is_closing', 'gl.fiscal_year.closing_transaction_no'],
      doc: [{ file: PST, section: '6.7 Жилийн хаалтын дүн (BR-PST-55)' }, { file: PER, section: 'E-3. Жилийн хаалт 2026 (`CL-2026-00001`)' }]
    },
    'yec.re-transfer': {
      title: 'Хуримтлагдсан ашиг руу шилжүүлэх санал',
      what: '2027-01-01-ний огноотой 3500 → 3400 шилжүүлэг: B = 3500-ийн 2027-01-01 хүртэлх үлдэгдэл. Энэ нь энгийн GENERAL багцын ноорог (is_closing = false) — хэрэглэгч хянаж батална. 2027 оны санхүүгийн жил үүсээгүй тул прототипт зөвхөн дүнг харуулна (W-04).',
      why: 'Тайлант үеийн ашиг шинэ жилд хуримтлагдсан ашиг болж, 3500 дараагийн жилийн үр дүнд хоосорно.',
      bc: 'BC-д шууд Retained Earnings руу хаадаг тул энэ алхам байхгүй.',
      rules: ['BR-YEC-08', 'BR-YEC-09', 'BR-PST-58', 'W-04'],
      data: ['gl.journal_line', 'gl.general_ledger_setup.retained_earnings_account_id'],
      doc: [{ file: PER, section: '5.7 Хуримтлагдсан ашиг руу шилжүүлэх санал (BR-YEC-08)' }, { file: PST, section: '6.8 Хуримтлагдсан ашиг руу шилжүүлэх дүн (BR-PST-58)' }]
    },
    'yec.simulate': {
      title: 'Батлах ба загварчлах',
      what: '"Жилийн хаалт батлах" нь бүх BLOCKING арилсны дараа (9–12-р сарыг хаавал) in-page баталгаажуулалттайгаар ваучерыг бичиж, жилийг CLOSED болгоно. "Гүйлгээ балансад загварчлах" нь ваучерын мөрийг ledger-т бичихгүйгээр гүйлгээ балансад нэмж харуулна.',
      why: 'Хаалтын ваучерыг буцаахгүй (дахин ажиллуулж зөрүүг бичнэ) тул батлахаас өмнө үр дүнг тайлангаар шалгах боломж хэрэгтэй.',
      bc: 'Report 94 "Close Income Statement" → General Journal → Preview Posting.',
      rules: ['BR-YEC-01', 'BR-YEC-05', 'BR-YEC-13', 'BR-PST-57'],
      data: ['gl.fiscal_year.status', 'gl.fiscal_year.closing_transaction_no'],
      doc: [{ file: PER, section: '5.6 Жилийн хаалтын wizard (S-GL-11)' }, { file: PST, section: '5.13 Жилийн хаалт (D-D4, FR-GL-026)' }]
    }
  });
})();
