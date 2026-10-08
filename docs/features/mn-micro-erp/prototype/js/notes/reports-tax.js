/* =============================================================================
   js/notes/reports-tax.js — explanation notes for #financial-statements, #vat-return, #setup
   (js/screens/reports-tax.js). Rule ids, tables/columns and headings were checked against
   01, 02, 08, 10, 12, 13, 15, DECISIONS, db/seed/README.md and db/schema/*.sql.
   ========================================================================== */
(function () {
  'use strict';
  var N = window.ERP.notes;
  var REQ = '01-requirements.md', TAX = '08-tax-vat-mn.md', PER = '10-periods-closing-reporting.md', EBR = '12-ebarimt-integration.md',
    SEC = '13-security-audit-tenancy.md', UI = '15-ui-ux.md', DEC = 'DECISIONS.md', SEED = 'db/seed/README.md', ARC = '02-architecture.md';

  // ---------------------------------------------------------------- #financial-statements
  N.register('reports-tax', 'Санхүүгийн тайлан — Маягт А ба e-balance (S-RPT-09..13)', {
    'rt.fs-tabs': {
      title: 'Маягт А-гийн дөрвөн тайлан',
      what: 'СБТ (санхүүгийн байдал), ОДТ (орлогын дэлгэрэнгүй), ӨӨТ (өмчийн өөрчлөлт), МГТ (мөнгөн гүйлгээ, шууд арга) — бүгд ижил ерөнхий дэвтрээс, seed-ийн мөрийн тодорхойлолтоор тооцогдоно. Tab-ийг ←/→ товчоор сольж болно.',
      why: 'Нягтлан бодох бүртгэлийн хуулиар жилийн санхүүгийн тайланг Маягт А-гийн бүтцээр гаргаж e-balance-д илгээдэг. Тайланг дансны шүүлтүүр ба томьёогоор тодорхойлсон тул шинэ данс нэмэхэд тайлан автоматаар хамарна.',
      bc: 'Account Schedule / Financial Report: Table 84 "Acc. Schedule Name", Table 85 "Acc. Schedule Line", Table 333 "Column Layout Name", Table 334 "Column Layout", Report 25 "Account Schedule".',
      rules: ['BR-RPT-60', 'FR-RPT-008', 'FR-RPT-009', 'FR-RPT-010', 'FR-RPT-011', 'R-45'],
      data: ['rpt.financial_report', 'rpt.fin_report_row', 'rpt.fin_report_column', 'rpt.statement_line'],
      doc: [{ file: PER, section: '4.10 Маягт А (BR-RPT-60..69)' }, { file: PER, section: '5.13.5 Маягт А-гийн тодорхойлолт (seed `mn_50_reports.sql`, хураангуй)' }, { file: SEED, section: '8. Тайлан (`mn_50_reports.sql`)' }]
    },
    'rt.fs-asof': {
      title: 'Тайлант огноо',
      what: 'Сарын эцэс эсвэл өнөөдрийг сонгоно. СБТ тэр өдрийн үлдэгдлийг, ОДТ ба МГТ оны эхнээс тэр өдөр хүртэлх хөдөлгөөнийг, ӨӨТ эхний үлдэгдэл + хөдөлгөөн = эцсийн үлдэгдлийг харуулна.',
      why: 'Нэг огноо бүх баганын мужийг тодорхойлно (BC Date Filter): СБТ C1 = оны эхний үлдэгдэл, C2 = огнооны үлдэгдэл; ОДТ C1 = өмнөх жил (−1Y), C2 = тайлант жил. Ингэснээр дөрвөн тайлан бие биетэйгээ тулгагдана.',
      bc: 'Acc. Schedule Overview-ийн "Date Filter" ба Column Layout-ийн "Column Type" (Balance at Date, Net Change, Beginning Balance), "Comparison Date Formula".',
      rules: ['BR-RPT-04', 'BR-RPT-61', 'BR-RPT-62', 'BR-RPT-68'],
      data: ['rpt.fin_report_column.column_type', 'rpt.fin_report_column.comparison_date_formula', 'gl.gl_entry.posting_date'],
      doc: [{ file: PER, section: '4.6 Тайлангийн огнооны утга (BR-RPT-01..06)' }, { file: PER, section: '6.3 Харьцуулах огнооны томьёо' }]
    },
    'rt.fs-unit': {
      title: 'Нэгж: төгрөг / мянган төгрөг',
      what: '"Мянган ₮" горимд мөр бүрийг эхлээд мянгат руу бөөрөнхийлж, нийлбэр мөрийг бөөрөнхийлсөн утгаар дахин нэмнэ. Нийт хөрөнгө зэрэг зангуу мөрийн яг утгатай зөрвөл зөрүүг "Бөөрөнхийлөлтийн зөрүү" (RND.*) мөрөнд гаргана.',
      why: 'e-balance-д мянган төгрөгөөр шивдэг. Нүд бүрийг тусад нь бөөрөнхийлбөл (BC-ийн Rounding Factor) мөрүүдийн нийлбэр нийт дүнтэй зөрж, баланс тэнцэхгүй харагдана; D-C2-ийн "эхлээд бөөрөнхийлөөд дараа нь нийлбэрлэх" дүрэм үүнийг тусгай мөрөөр шийднэ.',
      bc: 'Table 334 "Column Layout"."Rounding Factor" (None, 1, 1000, 1000000) — BC зөвхөн нүдээр бөөрөнхийлдөг; зөрүүний мөр нь Монголын нэмэлт.',
      rules: ['D-C2', 'UX-FMT-09', 'BR-RPT-45', 'BR-EBL-02', 'BR-EBL-03', 'BR-EBL-04', 'FR-RPT-013'],
      data: ['rpt.fin_report_column.rounding_factor', 'rpt.fin_report_row.rounding_anchor', 'platform.company_setup.report_decimal_places'],
      doc: [{ file: PER, section: '6.8 e-balance: эхлээд бөөрөнхийлөөд дараа нь нийлбэрлэх (D-C2)' }, { file: UI, section: '7.5 Тайлангийн нэгж' }, { file: DEC, section: 'C. Мөнгө, дугаарлалт, ledger' }]
    },
    'rt.fs-version': {
      title: 'Мөрийн кодын хувилбар ба өмнөх үе',
      what: 'Маягт А-гийн мөрийн кодууд 2018-01-01-ний хувилбартай, 129 мөр нь албан ёсны хавсралттай тулгагдаагүй (verified = false). Компани 2026-01-01-нд ашиглалтад орсон тул өмнөх жилийн багана 0.',
      why: 'Хууль, маягт өөрчлөгдөхөд хуучин хадгалсан тайлан хуучин хувилбараараа гарах ёстой (FR-RPT-012). Өмнөх үеийн өгөгдөл системд байхгүйг тайланд тодорхой бичих нь уншигчийг төөрөгдүүлэхгүй.',
      bc: 'BC-д байхгүй (Acc. Schedule-д хувилбар байдаггүй); статутын тайлангийн хувилбар нь энэ системийн нэмэлт.',
      rules: ['BR-RPT-64', 'BR-RPT-68', 'FR-RPT-012', 'D-D7'],
      data: ['rpt.statement_line.effective_from', 'rpt.statement_line.verified', 'platform.company_setup.go_live_date'],
      doc: [{ file: PER, section: '4.10 Маягт А (BR-RPT-60..69)' }, { file: SEED, section: '4.1 Мөрийн код (`rpt.statement_line`)' }]
    },
    'rt.fs-sbt': {
      title: 'СБТ — санхүүгийн байдлын тайлан',
      what: 'Навч мөр бүр дансны мужийн үлдэгдэл (1.1.1 = 1100..1198 г.м.), нийлбэр мөр томьёо (1.3 = 1.1 + 1.2). Өр төлбөр, өмчийн мөр эсрэг тэмдгээр (эерэг) харагдана. 2.2.7 "Хуримтлагдсан ашиг" нь 3400..3998-аас гадна бүх орлого, зардлын дансыг (5000..9998) агуулна.',
      why: 'Жил хаагдаагүй байхад тайлант үеийн ашиг 3500-д шилжээгүй байдаг. 2.2.7-д орлого, зардлыг шууд оруулснаар ямар ч огноонд Хөрөнгө = Өр төлбөр + Өмч биелнэ (FR-RPT-008 AC1/AC2).',
      bc: 'Account Schedule "Balance Sheet" — Row Type "Balance at Date", "Show Opposite Sign"; BC-д ашиг "Current Year Earnings" мөрөөр (Income/Balance = Income Statement данс) орж ирдэгтэй адил.',
      rules: ['BR-RPT-61', 'BR-RPT-44', 'BR-RPT-63', 'FR-RPT-008', 'R-45'],
      data: ['rpt.fin_report_row.totaling', 'rpt.fin_report_row.show_opposite_sign', 'gl.gl_account.statement_line_id'],
      doc: [{ file: PER, section: '5.13.5 Маягт А-гийн тодорхойлолт (seed `mn_50_reports.sql`, хураангуй)' }, { file: REQ, section: 'FR-RPT-008 Санхүүгийн байдлын тайлан (СБТ, Маягт А)' }]
    },
    'rt.fs-odt': {
      title: 'ОДТ — орлогын дэлгэрэнгүй тайлан',
      what: 'Бүх мөр тухайн хугацааны хөдөлгөөн (NET_CHANGE). Зардлыг үйл ажиллагааны чиглэлээр (борлуулалтын өртөг, борлуулалт-маркетинг, ерөнхий удирдлага, санхүүгийн) ангилна. 22 "Тайлант үеийн цэвэр ашиг" = 20 + 21.',
      why: 'Хаалтын бичилтийг (is_closing) хасаж тооцдог тул жил хаасны дараа ч ашиг харагдана. Цэвэр ашиг нь ӨӨТ-ийн RE.4 ба СБТ-ийн 2.2.7-ийн өсөлттэй ижил байх ёстой (тайлан хоорондын шалгалт).',
      bc: 'Account Schedule "Income Statement" — Column Layout "Net Change", "Include Closing Entries" = No (Closing Date-ийн бичилт хасагдана).',
      rules: ['BR-RPT-62', 'BR-RPT-67', 'FR-RPT-009', 'BR-RPT-68'],
      data: ['rpt.fin_report_column.include_closing_entries', 'gl.gl_transaction.is_closing', 'gl.gl_account.income_balance'],
      doc: [{ file: PER, section: '4.10 Маягт А (BR-RPT-60..69)' }, { file: REQ, section: 'FR-RPT-009 Орлогын дэлгэрэнгүй тайлан (ОДТ)' }]
    },
    'rt.fs-oot': {
      title: 'ӨӨТ — өмчийн өөрчлөлтийн тайлан',
      what: 'Өмчийн бүрэлдэхүүн бүрд (өмч, нэмж төлөгдсөн капитал, дахин үнэлгээ, бусад, хуримтлагдсан ашиг) эхний үлдэгдэл, хөдөлгөөн, эцсийн үлдэгдэл. RE.4 = тайлант үеийн цэвэр ашиг, T.9 = СБТ-ийн 2.2.',
      why: 'Хууль ӨӨТ-ийг Маягт А-д шаарддаг. Seed-ийн OOT мөрүүд (39) ижил дансны мужаар тул эхний + хөдөлгөөн = эцсийн (T.CHK = 0). Прототипийн хөдөлгүүр ӨӨТ-ийг өгдөггүй тул энэ дэлгэцийн helper seed-ийн мөрөөс тооцов.',
      bc: 'BC-д стандарт ӨӨТ байхгүй; Account Schedule-ээр Beginning Balance / Net Change / Balance at Date мөрийн төрлөөр бүтээдэг.',
      rules: ['BR-RPT-65', 'BR-RPT-67', 'FR-RPT-010'],
      data: ['rpt.fin_report_row.amount_type', 'gl.gl_entry.source_code', 'rpt.statement_line (EQ)'],
      doc: [{ file: PER, section: '4.10 Маягт А (BR-RPT-60..69)' }, { file: REQ, section: 'FR-RPT-010 Өмчийн өөрчлөлтийн тайлан (ӨӨТ)' }]
    },
    'rt.fs-mgt': {
      title: 'МГТ — мөнгөн гүйлгээ, шууд арга',
      what: 'Мөнгөний данс (касс, банк, QPay г.м. — CASH_TRANSFER ангилалтай) хөдөлсөн гүйлгээ бүрийг харьцсан дансны МГТ ангиллаар (харилцагчаас орсон, нийлүүлэгчид төлсөн, татвар …) бүлэглэнэ. 7 = 5 + 6 нь дэвтрийн мөнгөний үлдэгдэлтэй тэнцэнэ.',
      why: 'Олон харьцсан данстай гүйлгээг харьцсан дансны дүнгээр хуваадаг тул бөөрөнхийлөлтгүй тэнцэнэ. Мөнгөн данс хоорондын шилжүүлэг (Δ = 0) тайланд орохгүй. X "Ангилаагүй" мөр илгээхээс өмнө 0 байх ёстой.',
      bc: 'BC-д шууд аргын МГТ байхгүй (Cash Flow Forecast T840 нь таамаг); дансны "cash flow category" нь энэ системийн нэмэлт.',
      rules: ['BR-RPT-66', 'BR-RPT-70', 'BR-RPT-71', 'BR-RPT-72', 'FR-RPT-011'],
      data: ['rpt.cash_flow_category', 'gl.gl_account.cash_flow_category_id', 'bank.bank_ledger_entry.cash_flow_category_id'],
      doc: [{ file: PER, section: '4.11 Мөнгөн гүйлгээний тайлан — шууд арга (BR-RPT-70..77)' }, { file: PER, section: '5.14 Мөнгөн гүйлгээний тайлан — шууд арга (`CashFlowAggregator`)' }]
    },
    'rt.fs-balance': {
      title: 'Баланс тэнцэх шалгалт',
      what: 'Хөрөнгө = Өр төлбөр + Эздийн өмч. Эздийн өмчид тайлант үеийн үр дүн (орлого − зардал) орсон. Тэнцэхгүй бол "Шалгалт амжилтгүй" тууз гарч, тайланг FINAL болгох ба илгээлт бүртгэхийг хориглоно.',
      why: 'Гүйлгээ бүр тэнцсэн (Σ дүн = 0) ба данс бүр СБТ-ийн яг нэг мөрөнд орсон бол баланс заавал тэнцэнэ; тэнцэхгүй бол дансны харгалзаа алдаатай гэсэн үг (rpt.unmapped_accounts).',
      bc: 'Account Schedule-ийн CHK мөр (Formula 1.3 + 2.3); BC-д автомат хориг байхгүй — энэ системийн BLOCKING шалгалт.',
      rules: ['BR-RPT-61', 'BR-RPT-63', 'FR-RPT-008', 'INV-01'],
      data: ['rpt.statement_snapshot.status', 'gl.gl_entry.amount'],
      doc: [{ file: PER, section: '4.10 Маягт А (BR-RPT-60..69)' }, { file: REQ, section: 'FR-RPT-008 Санхүүгийн байдлын тайлан (СБТ, Маягт А)' }]
    },
    'rt.fs-crosscheck': {
      title: 'Тайлан хоорондын шалгалт',
      what: 'ОДТ 22 = ӨӨТ RE.4; ӨӨТ T.9 = СБТ 2.2; ӨӨТ T.CHK = 0; МГТ 7 = дэвтрийн мөнгө ба СБТ 1.1.1; МГТ X = 0. Тус бүр PASS/FAIL.',
      why: 'Дөрвөн тайлан нэг ерөнхий дэвтрээс гардаг тул эдгээр тэнцэл бүтцээрээ биелэх ёстой. e-balance-ийн шивэх хуудсанд мянгатаар ч мөн биелнэ (BR-EBL-05).',
      bc: 'BC-д байхгүй; Account Schedule бүр бие даасан.',
      rules: ['BR-RPT-65', 'BR-RPT-66', 'BR-RPT-67', 'BR-EBL-05', 'BR-EBL-08'],
      data: ['rpt.statement_snapshot.result'],
      doc: [{ file: PER, section: '4.10 Маягт А (BR-RPT-60..69)' }, { file: PER, section: '4.12 e-balance шивэх хуудас (BR-EBL-01..12)' }]
    },
    'rt.fs-calc': {
      title: 'Тайлангийн тооцоо алхам алхмаар',
      what: 'Сонгосон tab-ийн мөр хэрхэн тооцогдсоныг жинхэнэ тоогоор: навч мөрийн дансны задаргаа, томьёо, эсрэг тэмдэг, МГТ-ийн харьцсан дансны хуваарилалт, мянгат горимд зангуу бүрийн rk-зөрүү.',
      why: 'Тайлангийн тоо бүр дансны шүүлтүүр ба томьёоноос шууд гарахыг харуулж, хөгжүүлэгч ба нягтлан тооцоог гараар давтаж шалгах боломж олгоно. Мөрийн тоон дээр дарахад данс, гүйлгээ рүү задална.',
      bc: 'Acc. Schedule Overview-ийн drill-down (Chart of Accounts / G/L Entries руу).',
      rules: ['BR-RPT-44', 'BR-RPT-72', 'BR-EBL-04'],
      data: ['gl.gl_entry', 'rpt.fin_report_row.totaling'],
      doc: [{ file: PER, section: '6.7 Харуулах дараалал ба бөөрөнхийлөх нэгж' }, { file: PER, section: '6.9 МГТ: харьцсан дансны хуваарилалт ба үлдэгдэл' }]
    },
    'rt.fs-ebalance': {
      title: 'e-balance шивэх хуудас',
      what: 'Дөрвөн тайланг мянган төгрөгөөр, шивэх дарааллаар (№), мөрийн код, өмнөх ба тайлант жил, яг дүнгийн хамт; "Шалгалт" ба "Мэдээлэл" хуудас, ирээдүйн adapter-т зориулсан mn-ebalance/1 JSON. Прототипт файл татахгүй — зөвхөн дэлгэцэнд.',
      why: 'e-balance-ийн албан ёсны импорт формат тодорхойгүй тул нягтлан гараар шивдэг; шивэх хуудас нь дараалал ба бөөрөнхийлсөн тоог бэлэн өгнө. Хугацаа: дараа оны 02-10 (ebalance.annual_deadline).',
      bc: 'Report 29 "Export Acc. Sched. to Excel"-тэй ойролцоо; e-balance-ийн шивэх хуудас BC-д байхгүй.',
      rules: ['FR-RPT-013', 'BR-EBL-01', 'BR-EBL-06', 'BR-EBL-07', 'BR-EBL-08', 'BR-EBL-09', 'D-C2'],
      data: ['rpt.statement_snapshot', 'rpt.filing_submission', 'tax.tax_parameter (ebalance.annual_deadline)'],
      doc: [{ file: PER, section: '5.15 e-balance шивэх хуудас (`EbalanceKeyingSheetBuilder`)' }, { file: PER, section: '4.12 e-balance шивэх хуудас (BR-EBL-01..12)' }, { file: REQ, section: 'FR-RPT-013 e-balance-ийн шивэх хуудас (мянган төгрөгөөр)' }]
    }
  });

  // ---------------------------------------------------------------- #vat-return
  N.register('vat-return', 'НӨАТ-ын тайлан ТТ-03а ба босгын хяналт (S-TAX-03)', {
    'rt.vat-period': {
      title: 'НӨАТ-ын үе',
      what: 'Сар бүр нэг үе: Нээлттэй → Хаалттай (НӨАТ хаасан) → Илгээсэн. Илгээх хугацаа дараа сарын 10 (vat.return_due_day). 1–8-р сар илгээгдсэн, 9-р сар хянагдаж байна.',
      why: 'НӨАТ-ын тайлан, төлбөр сар бүр. Үеийн төлөв нь хаалт ба илгээлтийг дарааллаар нь хийхийг хангана: өмнөх үе хаагдаагүй бол дараагийнхыг хаахгүй (BR-TAX-44).',
      bc: 'Table 737 "VAT Return Period" (Status Open/Closed), Table 740 "VAT Report Header".',
      rules: ['FR-TAX-015', 'BR-TAX-44', 'D-E9', 'UX-VAT-01'],
      data: ['tax.vat_return_period.status', 'tax.vat_return_period.due_date', 'tax.tax_parameter (vat.return_due_day)'],
      doc: [{ file: TAX, section: '4.10 НӨАТ-ын хаалт, илгээх, дахин нээх' }, { file: UI, section: '16.9 НӨАТ-ын тайлан ТТ-03а (S-TAX-03)' }]
    },
    'rt.vat-steps': {
      title: 'Алхмын заагч',
      what: '① Тооцоолох ② Хянах ③ НӨАТ хаах ④ Илгээсэн. Төлөв нь НӨАТ-ын үеийн status-аас: OPEN үед ①/②, CLOSED (хаалтын гүйлгээтэй) үед ③ ✓, SUBMITTED үед ④ ✓.',
      why: 'Нягтлан тайлангийн аль шатанд байгааг нэг харцаар мэдэж, алгасах эрсдэлийг бууруулна.',
      bc: 'VAT Return (Table 740) Status: Open → Released → Submitted.',
      rules: ['UX-VAT-01', 'UX-VAT-07'],
      data: ['tax.vat_return_period.status', 'tax.vat_return_period.settlement_transaction_no'],
      doc: [{ file: UI, section: '16.9 НӨАТ-ын тайлан ТТ-03а (S-TAX-03)' }]
    },
    'rt.vat-stale': {
      title: 'Тооцоолсон хугацаа ба хуучирсан эсэх',
      what: 'Тайлан хадгалагддаггүй — дэлгэц нээх бүрт VAT entry-ээс тооцно. Тооцоолсноос хойш энэ үед шинэ бичилт нэмэгдэх эсвэл орцын НӨАТ баталгаажвал "scope өөрчлөгдсөн" гэж анхааруулж, дахин тооцоолохыг шаардана.',
      why: 'Хаалт ба экспорт хуучирсан тооцоон дээр хийгдэхээс сэргийлнэ: сервер lastVatEntryNo ба scopeVersion-ийг харьцуулж зөрвөл 409 tax.vat_statement_stale буцаана.',
      bc: 'Report 12 "VAT Statement" preview (хадгалахгүй); scopeVersion нь энэ системийн нэмэлт.',
      rules: ['UX-VAT-02', 'UX-VAT-03', 'BR-TAX-69'],
      data: ['tax.vat_entry.entry_no', 'tax.vat_entry.deductible_confirmed_at'],
      doc: [{ file: TAX, section: '4.9 НӨАТ-ын тайлан (ТТ-03а)' }]
    },
    'rt.vat-unconfirmed': {
      title: 'Баталгаажаагүй орцын НӨАТ',
      what: 'Нийлүүлэгчийн eBarimt ДДТД бүртгэгдэж баталгаажаагүй худалдан авалтын НӨАТ ТТ-03а-гийн 7, 8-р мөрөнд орохгүй. Товч дарж 33 оронтой ДДТД оруулан баталгаажуулахад тайлан шууд шинэчлэгдэнэ.',
      why: 'Орцын НӨАТ-ыг зөвхөн баталгаажсан ДДТД-тэй үед хасна (татварын алба eBarimt-аар тулгадаг). Анхааруулга хаалтыг зогсоохгүй; баталгаажаагүй нь дараагийн нээлттэй үед орно.',
      bc: 'BC-д байхгүй (Монголын нэмэлт): VAT Entry-д deductible_confirmed талбар нэмж, VAT Statement Line-д "only deductible confirmed" шүүлтүүр.',
      rules: ['D-E4', 'BR-TAX-45', 'BR-TAX-49', 'BR-TAX-50', 'FR-TAX-009', 'W-TAX-05'],
      data: ['tax.vat_entry.deductible_confirmed', 'tax.vat_entry.supplier_ebarimt_id', 'ebarimt.purchase_receipt'],
      doc: [{ file: TAX, section: '4.6 Орцын НӨАТ-ын хасалт ба баталгаажуулалт' }, { file: DEC, section: 'E. Татвар (дэлгэрэнгүйг [08-tax-vat-mn.md](08-tax-vat-mn.md)-ээс үзнэ)' }]
    },
    'rt.vat-ebarimt': {
      title: 'eBarimt-гүй / амжилтгүй борлуулалт',
      what: 'Энэ үеийн борлуулалтаас eBarimt SUCCESS биш (хүлээгдэж буй, алдаа, тодорхойгүй) баримтыг жагсаана. Хаалтыг зогсоохгүй, гэхдээ илгээхээс өмнө шийдвэрлэх ёстой.',
      why: 'Татварын алба борлуулалтын НӨАТ-ыг eBarimt-аар хардаг; баримтгүй борлуулалт тайлантай зөрнө.',
      bc: 'BC-д байхгүй (eBarimt нь Монголын интеграц).',
      rules: ['UX-VAT-04', 'BR-TAX-71', 'W-TAX-06', 'FR-TAX-016'],
      data: ['ebarimt.ebarimt_document.status', 'ebarimt.ebarimt_document.total_vat'],
      doc: [{ file: TAX, section: '5.13 eBarimt-тэй НӨАТ-ын тулгалт (FR-TAX-016)' }]
    },
    'rt.vat-rows': {
      title: 'ТТ-03а-гийн мөрүүд',
      what: 'Seed-ийн VAT/TT03A загварын 17 мөр: тайлбар (S, P, R), VAT entry-ийн нийлбэр (суурь, НӨАТ, хасагдахгүй, бүтэн) ба мөрийн нийлбэр (6 = 1+3+4+5, 12 = 8+9+10, 14 = 2+13+12). Дүн дээр дарж тухайн мөрийн VAT entry руу задална.',
      why: 'Тайлан нь өгөгдөл болсон загвар (хувилбартай) тул маягт өөрчлөгдөхөд код биш мөрийг засна (D-E8). NULL бүлэг = бүх бүлэг. Мөрийн дугаарууд маягтын одоогийн хувилбартай бүрэн тулгагдаагүй (⚠ OQ-TAX-01).',
      bc: 'Table 255 "VAT Statement Template", Table 257 "VAT Statement Name", Table 256 "VAT Statement Line" (Type: VAT Entry Totaling / Row Totaling / Description), Report 12 "VAT Statement".',
      rules: ['FR-TAX-013', 'BR-TAX-65', 'BR-TAX-66', 'R-VAT-26', 'R-VAT-27', 'D-E8', 'Z-TAX-10'],
      data: ['tax.vat_statement_line.line_type', 'tax.vat_statement_line.amount_type', 'tax.vat_statement_line.only_deductible_confirmed', 'tax.vat_statement_line.box_no'],
      doc: [{ file: TAX, section: '3.7 НӨАТ-ын тайлангийн загвар ба ТТ-03а-гийн мөрийн харгалзаа (D-E8)' }, { file: TAX, section: '5.9 ТТ-03а-гийн тооцоо (`IVatReturnService.CalculateAsync`)' }]
    },
    'rt.vat-calc': {
      title: 'Мөр бүрийн тооцоо ба тэмдэг',
      what: 'Мөр бүрийн шүүлтүүр, Σ (суурь эсвэл НӨАТ), "эсрэг тэмдгээр тооцох" ба "эсрэг тэмдгээр хэвлэх"-ийг жинхэнэ тоогоор. Баталгаажаагүй орцын НӨАТ баталгаажвал мөр 8 ба 14 хэд болохыг мөн харуулна.',
      why: 'VAT entry-д борлуулалт сөрөг, худалдан авалт эерэг. Мөрийн нийлбэрт эсрэг тэмдэг хэрэглэхгүй тул хасагдах НӨАТ-ын мөрүүд өөрсдөө сөрөг утгатай — тэмдгийн логикийг ойлгомжтой болгоно.',
      bc: 'VAT Statement Line."Calculate with" (Sign / Opposite Sign), "Print with".',
      rules: ['BR-TAX-65', 'R-VAT-26', 'R-VAT-27'],
      data: ['tax.vat_entry.base', 'tax.vat_entry.amount', 'tax.vat_statement_line.calculate_with', 'tax.vat_statement_line.print_with'],
      doc: [{ file: TAX, section: '6.11 ТТ-03а-гийн мөрийн арифметик (BR-TAX-65)' }]
    },
    'rt.vat-ebarimt-rec': {
      title: 'eBarimt-тэй тулгалт',
      what: 'Үеийн борлуулалтын баримт бүрийн НӨАТ-ыг eBarimt-ийн SUCCESS баримтын totalVAT-тэй харьцуулна; баримтгүй, SUCCESS биш, дүн зөрсөн баримтыг ✕-ээр тэмдэглэнэ.',
      why: 'Сарын борлуулалтын НӨАТ = амжилттай илгээгдсэн eBarimt-ийн НӨАТ байх ёстой (FR-TAX-016 AC1). Зөрүү нь ТТ-03а ба татварын албаны өгөгдөл зөрөхийг илтгэнэ.',
      bc: 'BC-д байхгүй.',
      rules: ['FR-TAX-016', 'BR-TAX-71', 'BR-TAX-37'],
      data: ['ebarimt.ebarimt_document.total_vat', 'ebarimt.ebarimt_document.source_document_no'],
      doc: [{ file: TAX, section: '5.13 eBarimt-тэй НӨАТ-ын тулгалт (FR-TAX-016)' }]
    },
    'rt.vat-settle': {
      title: 'НӨАТ хаах (урьдчилсан харагдац)',
      what: 'Үеийн хаагдаагүй VAT entry-ийг (төрөл, бүлгээр) бүлэглэж 2300 борлуулалтын НӨАТ ба 1300 орцын НӨАТ-ын үлдэгдлийг 2310 "НӨАТ-ын тооцоо" руу хаах ваучерыг харуулна. "НӨАТ хаах…" дарахад батлагдаж (VATSTMT, GJ цуврал), үе CLOSED болно.',
      why: 'Хаалтын дараа 2310-ийн кредит үлдэгдэл = төлөх НӨАТ, дебит = илүү төлсөн. Хаагдсан entry-ийн гүйлгээг буцаахгүй; зөвхөн үеийг дахин нээнэ. Preview дугаар зарцуулахгүй.',
      bc: 'Report 20 "Calc. and Post VAT Settlement" (VAT Entry.Closed, Closed by Entry No.).',
      rules: ['FR-TAX-015', 'BR-TAX-72', 'BR-TAX-73', 'BR-TAX-75', 'BR-TAX-76', 'UX-VAT-05'],
      data: ['tax.vat_entry.closed', 'tax.vat_entry.closed_by_entry_no', 'tax.vat_return_period.settlement_transaction_no', 'tax.tax_setup'],
      doc: [{ file: TAX, section: '5.10 НӨАТ-ын хаалт (`:close`, `:preview-close`)' }, { file: TAX, section: '6.12 Хаалтын арифметик ба инвариант (BR-TAX-73, -82)' }]
    },
    'rt.vat-settled': {
      title: 'Хаагдсан үе, төлбөр, илгээлт',
      what: 'Хаалтын ваучер ба үр дүн (төлөх / буцаан авах), 2310-ийн одоогийн үлдэгдэл. Төлөх үлдэгдэлтэй бол "НӨАТ төлөх…" (Дт 2310 / Кт банк). CLOSED үед "Илгээсэн гэж тэмдэглэх…" e-tax-ийн дугаар ба "ИЛГЭЭСЭН" гэсэн баталгаажуулалт шаардана.',
      why: 'Илгээсэн тайлан өөрчлөгдөхгүй (засварыг дараагийн нээлттэй үеийн баримтаар). Илгээлт нь нягтлан бодох үеийг түгжихийг санал болгоно, автомат биш. Прототипийн хөдөлгүүрт submit API байхгүй тул энэ дэлгэц үеийн төлөвийг өөрөө SUBMITTED болгоно.',
      bc: 'Table 740 "VAT Report Header" Status Submitted; BC-д илгээлт нь VAT Return-ээр.',
      rules: ['BR-TAX-78', 'BR-TAX-79', 'BR-TAX-80', 'BR-TAX-81', 'UX-VAT-06', 'UX-VAT-07', 'Z-TAX-04'],
      data: ['tax.vat_return_period.submission_reference', 'tax.vat_return_period.submitted_at', 'tax.vat_return_snapshot'],
      doc: [{ file: TAX, section: '5.11 Илгээсэн гэж тэмдэглэх ба дахин нээх' }, { file: TAX, section: '4.10 НӨАТ-ын хаалт, илгээх, дахин нээх' }]
    },
    'rt.vat-threshold': {
      title: 'НӨАТ-ын бүртгэлийн босгын хяналт',
      what: 'Сүүлийн 12 сарын татвар ногдох борлуулалт (VAT10 + VAT0; чөлөөлөгдөх ба үндсэн хөрөнгийн борлуулалтгүй) ба тухайн өдрийн заавал бүртгүүлэх босго: 2027-06-30 хүртэл 50 сая ₮, 2027-07-01-нээс 400 сая ₮. Түвшин: NONE / VOLUNTARY_ELIGIBLE / APPROACHING (80%) / CROSSED, НӨАТ төлөгчид BELOW_MANDATORY.',
      why: 'Босгыг давсан НӨАТ төлөгч бус компани бүртгүүлэх үүрэгтэй. Босго хуулиар өөрчлөгдөж буй тул тоог кодонд биш tax_parameter-т огноотой хадгална; үнэлгээ тухайн өдрийн босгоор (пропорциональ биш). vat_registered-ийг автоматаар өөрчлөхгүй.',
      bc: 'BC-д байхгүй (Монголын нэмэлт).',
      rules: ['FR-TAX-012', 'BR-TAX-83', 'BR-TAX-84', 'BR-TAX-85', 'BR-TAX-88', 'D-K5', 'D-E7', 'W-TAX-01', 'W-TAX-04'],
      data: ['tax.tax_parameter (vat.registration_threshold_mandatory, vat.registration_threshold_voluntary)', 'tax.vat_entry.excluded_from_turnover', 'tax.vat_entry.gen_prod_posting_group'],
      doc: [{ file: TAX, section: '4.11 НӨАТ-ын бүртгэлийн босгын хяналт' }, { file: TAX, section: '6.13 Босгын арифметик (BR-TAX-83…85)' }, { file: TAX, section: '3.2 `tax.tax_parameter` — хуулийн параметр (D-E7)' }]
    }
  });

  // ---------------------------------------------------------------- #setup
  N.register('setup', 'Компани тохируулах wizard (S-PLT-06)', {
    'rt.wiz-steps': {
      title: 'Wizard-ийн алхмууд',
      what: '10 алхам: профайл → татвар → эхлэх огноо → дансны төлөвлөгөө → цуврал → касс, банк → eBarimt → хэрэглэгч → эхний үлдэгдэл → хураангуй. Дууссан алхам руу буцаж болно; урагш зөвхөн "Дараах"-аар (Enter), алхам бүрийн шалгалттай.',
      why: 'FR-PLT-003-ийн дарааллыг баримтална: татварын профайл, ТТД, дүүргийн кодыг provisioning-ээс өмнө хадгалснаар НӨАТ-ын матриц ба eBarimt-ийн тохиргоо зөв үүснэ. eBarimt-ийн бүрэн идэвхжүүлэлт нь тусдаа wizard (S-EBR-01).',
      bc: 'Page 1803 "Assisted Company Setup Wizard" (Assisted Setup).',
      rules: ['FR-PLT-003', 'UX-ONB-01', 'UX-ONB-02', 'UX-ONB-03', 'UX-WIZ-01'],
      data: ['platform.company_setup', 'platform.company.status'],
      doc: [{ file: UI, section: '10.2 Компани тохируулах wizard-ийн алхам' }, { file: UI, section: '10.3 Wizard-ийн харилцан үйлчлэл' }, { file: UI, section: '16.10 Компани тохируулах wizard (S-PLT-06)' }]
    },
    'rt.wiz-getinfo': {
      title: 'ТТД-ээр татах (eBarimt getInfo)',
      what: 'ТТД (ААН 11 орон, хувь хүн 12–14) оруулж товч дарахад eBarimt-ийн getInfo-оос нэр, НӨАТ ба НХАТ төлөгч эсэхийг авч санал болгоно. Прототипт хариу зохиомол (00000000777 → "Жишээ Трейд ХХК", 00000000000 → олдохгүй).',
      why: 'Татварын албаны бүртгэлтэй зөрөх профайлаар eBarimt идэвхжихгүй (SET-02). Хэрэглэгчийг дахин асуухгүйгээр алхам 2-т санал болгоно.',
      bc: 'BC-ийн VIES шалгалт (Table 249 "VAT Registration Log")-тай ойролцоо; getInfo нь Монголын нэмэлт.',
      rules: ['FR-PLT-002', 'SET-01', 'SET-02', 'UX-WIZ-02', 'UX-A11Y-22'],
      data: ['platform.company_setup.tin', 'ebarimt.taxpayer_info', 'ebarimt.ebarimt_setup.vat_payer'],
      doc: [{ file: EBR, section: '3.2 Дүрэм' }, { file: REQ, section: 'FR-PLT-002 Компанийн профайл' }]
    },
    'rt.wiz-tax': {
      title: 'Татварын профайл',
      what: 'НӨАТ төлөгч эсэх ба огноо, НХАТ төлөгч эсэх, тайлагналын суурь (ЖДҮ-ийн СТОУС анхдагч), тайлангийн бутархай орон (0/2). getInfo-тай зөрвөл анхааруулна.',
      why: 'НӨАТ төлөгч бус компанид 10%-ийн тохиргоо хасагдахгүй 100%-тай үүсч, борлуулалтад НӨАТ тооцогдохгүй (D-E5). vat_registered = true бол ТТД заавал (schema CHECK).',
      bc: 'Table 79 "Company Information" (VAT Registration No.) ба VAT Posting Setup-ийн анхдагч.',
      rules: ['FR-PLT-002', 'D-E5', 'BR-TAX-54', 'BR-TAX-56', 'UX-WIZ-02'],
      data: ['platform.company_setup.vat_registered', 'platform.company_setup.vat_registered_from', 'platform.company_setup.city_tax_payer', 'platform.company_setup.accounting_standard'],
      doc: [{ file: TAX, section: '4.7 НӨАТ төлөгч бус горим (D-E5 ⚠)' }, { file: UI, section: '10.2 Компани тохируулах wizard-ийн алхам' }]
    },
    'rt.wiz-threshold': {
      title: '2027 оны НӨАТ-ын босго',
      what: '2027-07-01-нээс заавал бүртгүүлэх босго 50 саяас 400 сая ₮ болно. Систем үүнийг tax_parameter-ийн огноотой мөрөөр мэднэ; НӨАТ-ын тайлангийн дэлгэц эргэлтийг хянана.',
      why: 'Хуулийн тоог кодонд бичихгүй (D-E7); хуулийн бусад багц 2027-01-01-нээс ч босгын заалт 2027-07-01-нээс (D-K5).',
      bc: 'BC-д байхгүй.',
      rules: ['D-K5', 'D-E7', 'FR-TAX-012'],
      data: ['tax.tax_parameter.effective_from', 'tax.tax_parameter.value_numeric'],
      doc: [{ file: DEC, section: 'K. Нэмэлт шийдвэрүүд (2026-10-06, баримтуудын зөрүүг арилгах)' }, { file: TAX, section: '3.2 `tax.tax_parameter` — хуулийн параметр (D-E7)' }]
    },
    'rt.wiz-golive': {
      title: 'Ашиглалтад орох огноо ба санхүүгийн жил',
      what: 'Go-live огноо, posting цонх (анхдагч: go-live-ийн сарын 1). Go-live-ийн жил ба дараагийн жил (12 сар тус бүр) үргэлж үүснэ. Оны дунд эхэлбэл эхний үлдэгдлийг go-live − 1 өдрөөр оруулна.',
      why: 'Хуулийн баримтын цуврал ба үе хоёр жилд бэлэн байх ёстой (FR-PLT-003 AC1). Эхний үлдэгдлийн огноо нь тайлангийн эхний баганыг тодорхойлно.',
      bc: 'Table 50 "Accounting Period", Report 93 "Create Fiscal Year"; Table 98 "General Ledger Setup" (Allow Posting From/To).',
      rules: ['FR-PLT-003', 'UX-WIZ-03', 'FR-GL-022', 'D-D7'],
      data: ['platform.company_setup.go_live_date', 'platform.company_setup.allow_posting_from', 'gl.fiscal_year', 'gl.accounting_period'],
      doc: [{ file: UI, section: '16.10 Компани тохируулах wizard (S-PLT-06)' }, { file: ARC, section: '14.8 Харилцагчийн өгөгдөл шилжүүлэх (onboarding)' }]
    },
    'rt.wiz-coa': {
      title: 'Дансны төлөвлөгөө "MN стандарт"',
      what: '182 данс (138 бичилтийн, 20 гарчиг, 12 эхлэл, 12 төгсгөл), 4 оронтой; бичилтийн данс бүр Маягт А-гийн мөр ба МГТ-ийн ангилалтай. R1-д ганц загвар, уншихаар урьдчилан харуулна.',
      why: 'Данс бүр СБТ/ОДТ-ийн яг нэг мөрөнд орсноор санхүүгийн тайлан нэмэлт тохиргоогүй гарна; хяналтын данс (1200, 2100, 1300, 2300 …) шууд бичилтгүй.',
      bc: 'Table 15 "G/L Account" (Account Type, Totaling, Indentation, Direct Posting); RapidStart Config. Package.',
      rules: ['FR-GL-001', 'FR-GL-002', 'D-D1', 'FR-PLT-003'],
      data: ['gl.gl_account', 'gl.gl_account.statement_line_id', 'gl.gl_account.cash_flow_category_id'],
      doc: [{ file: SEED, section: '3. Дансны төлөвлөгөө (182 данс: 138 posting, 20 heading, 12 begin-total, 12 end-total)' }]
    },
    'rt.wiz-series': {
      title: 'Дугаарын цуврал',
      what: '26 цуврал: 15 хуулийн (SI, SC, PI, PC, KO, KZ, BR, BP, GJ, OB, CL, FXA, DP, IA, IC — PREFIX-YYYY-#####), 7 ноорог (DSI-000001 …), 4 мастер (C00001 …). Угтварыг засахад жишээ шууд шинэчлэгдэнэ.',
      why: 'Хуулийн баримт завсаргүй, жил бүр шинээр, гараар дугаарлахгүй (D-C7). Ноорог завсартай байж болно. Угтварыг зөвхөн анхны хэрэглээнээс өмнө өөрчилнө.',
      bc: 'Table 308 "No. Series", Table 309 "No. Series Line" (Starting Date, Manual Nos., Date Order).',
      rules: ['D-C7', 'FR-PLT-008', 'UX-WIZ-04', 'INV-08'],
      data: ['platform.number_series', 'platform.number_series_line', 'platform.number_series_counter'],
      doc: [{ file: SEED, section: '7. Төлбөр, хэмжих нэгж, дугаарлалт, журнал, тохиргоо (`mn_40_setup.sql`)' }, { file: DEC, section: 'C. Мөнгө, дугаарлалт, ledger' }]
    },
    'rt.wiz-bank': {
      title: 'Касс ба банкны данс',
      what: 'CASH01 "Үндсэн касс" (1100, МХ-1 KO / МХ-2 KZ) автоматаар. Банкны данс бүр өөрийн G/L данстай (1110, 1111, гурав дахь нь 1112 + шинэ бүлэг) ба хуулга импортын preset-тэй.',
      why: 'Нэг G/L данс = нэг мөнгөн данс тул банкны дэд дэвтэр = G/L үлдэгдэл тулгалт шууд. Касс сөрөг үлдэгдэлгүй (D-G1).',
      bc: 'Table 270 "Bank Account", Table 277 "Bank Account Posting Group".',
      rules: ['FR-BNK-001', 'D-G1', 'FR-PLT-003'],
      data: ['bank.bank_account', 'bank.bank_account_posting_group', 'bank.bank_statement_import_format.preset_bank'],
      doc: [{ file: SEED, section: '7. Төлбөр, хэмжих нэгж, дугаарлалт, журнал, тохиргоо (`mn_40_setup.sql`)' }, { file: UI, section: '10.2 Компани тохируулах wizard-ийн алхам' }]
    },
    'rt.wiz-ebarimt': {
      title: 'eBarimt: POS, салбар, districtCode',
      what: 'Мерчантын ТТД (профайлаас), дүүргийн код (4 орон), салбар (3 орон), POS дугаар. Provisioning ebarimt_setup-ийг enabled = false, STAGING-ээр үүсгэнэ; PRODUCTION руу шилжих нь тусдаа баталгаажуулалттай.',
      why: 'Баримтын districtCode, branchNo, posNo нь PosAPI-ийн хүсэлтэд заавал. Операторын бүртгэл (saveOprMerchants) ба бэлэн байдлын шалгалтын дараа eBarimt wizard-аар асаана.',
      bc: 'BC-д байхгүй (Монголын интеграц).',
      rules: ['SET-01', 'SET-02', 'SET-07', 'UX-ONB-08', 'UX-ONB-11'],
      data: ['ebarimt.ebarimt_setup.district_code', 'ebarimt.ebarimt_setup.branch_no', 'ebarimt.ebarimt_pos.pos_no', 'ebarimt.ebarimt_setup.environment'],
      doc: [{ file: EBR, section: '3.1 Wizard-ийн алхам' }, { file: UI, section: '10.5 eBarimt wizard (S-EBR-01)' }]
    },
    'rt.wiz-users': {
      title: 'Хэрэглэгч урих ба role',
      what: 'Имэйл + role: Нягтлан, Гэрээт нягтлан (хугацаатай), Борлуулагч-кассчин, Үзэгч. Эзэмшигч (OWNER) зөвхөн ERP_SUPER. Өөрийгөө урихгүй, давхар имэйлгүй.',
      why: 'Role нь seed-ийн permission set-ийн багц (13 §6.5); хаасан үе нээх зэрэг эрх зөвхөн эзэмшигчид. Гэрээт нягтланы хандалт хугацаагаар дуусна.',
      bc: 'Page 9800 "Users", Table 2000000120 "User", Table 2000000004 "Permission Set", Security Group.',
      rules: ['FR-PLT-004', 'FR-PLT-005', 'D-I2', 'D-D3'],
      data: ['platform.tenant_invitation', 'platform.role', 'platform.user_company_role.expires_at'],
      doc: [{ file: SEC, section: '6.5 Built-in role (тенант бүрд provisioning-ээр, `is_builtin = true`)' }, { file: SEED, section: '9. Эрх ба role (`mn_00_catalogs.sql`, `mn_60_security.sql`)' }]
    },
    'rt.wiz-ob': {
      title: 'Эхний үлдэгдэл',
      what: 'Сонголт: дараа / Excel загвараар / гараар журналаар. Excel-ийн урьдчилсан харагдац OB ваучерыг (source OPENING, go-live − 1) ба шалгалтыг харуулна: тэнцэл, бичилтийн данс, хяналтын данс зөвхөн мөнгөний данс / харилцагч / нийлүүлэгчийн мөрөөр, авлага-өглөг баримт тус бүрээр.',
      why: 'Нээлттэй авлага, өглөгийг баримтаар оруулбал насжилт зөв гарна; импорт posting engine-ээр явж хуулийн OB-YYYY-##### дугаар авна. Wizard зөвхөн сонголтыг хадгална.',
      bc: 'RapidStart Config. Package (Table 8623) ба General Journal-аар эхний үлдэгдэл; "Opening" source code.',
      rules: ['D-D7', 'FR-GL-007', 'FR-GL-003', 'UX-ONB-02'],
      data: ['gl.gl_entry.source_code (OPENING)', 'party.cust_ledger_entry', 'party.vendor_ledger_entry'],
      doc: [{ file: ARC, section: '14.8 Харилцагчийн өгөгдөл шилжүүлэх (onboarding)' }, { file: UI, section: '10.2 Компани тохируулах wizard-ийн алхам' }]
    },
    'rt.wiz-summary': {
      title: 'Хураангуй',
      what: 'Бүх сонголт засах холбоостой ("Засах N ›"). "Компани үүсгэх" дарахад бүх алхмыг дахин шалгаж, provisioning эхэлнэ.',
      why: 'Нэг transaction-аар үүсгэхээс өмнө хэрэглэгч бүх сонголтыг нэг дор хянана.',
      bc: 'Assisted Setup-ийн "Finish" хуудас.',
      rules: ['UX-WIZ-05', 'UX-ONB-04', 'UX-ONB-05'],
      data: ['platform.company_setup'],
      doc: [{ file: UI, section: '16.10 Компани тохируулах wizard (S-PLT-06)' }]
    },
    'rt.wiz-provision': {
      title: 'platform.fn_provision_company_mn',
      what: 'Нэг DB transaction-д 23 алхмаар: НӨАТ ба Gen. бүлэг, 182 данс, 19 VAT setup, 16 General Posting Setup, банкны бүлэг, валют, ҮХ, бараа, 26 цуврал, 11 шалтгааны код, 2 санхүүгийн жил, касс, журнал, тайлан (SBT 53, ODT 26, OOT 39, MGT 54 мөр), ТТ-03а 17 мөр, насжилт, 5 role. "Туршилт" чагтаар алдаа гаргахад юу ч үүсэхгүй.',
      why: 'Бүгд эсвэл юу ч үгүй (FR-PLT-003 AC2); idempotent тул давтан дуудлага 0 мөр нэмнэ, хагас үүссэн компанийг засна. Хуулийн хувь хэмжээ tax_parameter-ээс (D-E7).',
      bc: 'Codeunit 2 "Company-Initialize" + RapidStart configuration package.',
      rules: ['FR-PLT-003', 'UX-ONB-04', 'UX-WIZ-05', 'D-E7', 'D-K6'],
      data: ['platform.company.status', 'platform.company_setup', 'gl.gl_account', 'tax.vat_posting_setup', 'platform.number_series', 'gl.fiscal_year'],
      doc: [{ file: SEED, section: '2. `platform.fn_provision_company_mn` хэрхэн ажилладаг' }, { file: REQ, section: 'FR-PLT-003 Компани тохируулах wizard ба MN анхдагч тохиргоо' }]
    }
  });
})();
