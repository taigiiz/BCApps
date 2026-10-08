# ADR-0019: Тайлан — SQL view, QuestPDF, ClosedXML

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §4.2.13, §9.6, §12.8, §13. [ADR-0017](./ADR-0017-i18n-mongolian-first.md), [ADR-0022](./ADR-0022-backups-pitr-archive-retention.md)

## Нөхцөл байдал

- **Хууль ёсны гаралт:**
  - анхан шатны маягт: МХ-1/МХ-2, ТМ-1, БМ, ҮХ (Order 347);
  - бүртгэлийн дэвтэр (Order 100);
  - санхүүгийн тайлан Маягт А: СБТ, ОДТ, ӨӨТ, МГТ шууд аргаар (Order 361);
  - НӨАТ-ын ТТ-03а;
  - e-balance-ийн өгөгдөл ([mn-accounting.md](../research/mn-accounting.md) §3, §5).
- **Маягт хувилбартай.** Тайлангийн загвар өөрчлөгдөж болно (Order 361-ийн нэмэлт өөрчлөлт). Тиймээс загварыг код биш, өгөгдөл болгох хэрэгтэй.
- **Сангийн лиценз:**
  - QuestPDF нь жилийн орлого 1 сая ам.доллараас бага байгууллагад үнэгүй (Community). Түүнээс дээш бол төлбөртэй.
  - ClosedXML нь MIT.
  - FastReport OSS-ийн PDF сул. DevExpress арилжааных ([tech-architecture.md](../research/tech-architecture.md) §7).
- **Архив.** 10 жилийн архивт PDF/A хэрэгтэй байж магадгүй. QuestPDF-ийн PDF/A нийцэл UNVERIFIED.

## Шийдвэр

1. **Тайлангийн өгөгдлийг SQL-ээр** гаргана: модуль бүрийн published view (`<schema>.v_*`) ба `rpt` схемийн функцүүд ([920_views.sql](../db/schema/920_views.sql): `rpt.v_trial_balance_base`, `rpt.fn_trial_balance`, `party.fn_customer_aging` г.м.).
   - Query нь `REPEATABLE READ READ ONLY` transaction-д ажиллана.
   - Үлдэгдлийн тайланд `gl.v_gl_account_period_balance` view-ийг ашиглана (тусдаа проекцын хүснэгтгүй).
2. **Санхүүгийн тайлангийн загвар өгөгдөл байна:**
   - `rpt.statement_line` (Маягт А/Б-ийн мөрийн код, глобал каталог) ба `rpt.cash_flow_category` (МГТ-ийн ангилал);
   - данс → мөр: `gl.gl_account.statement_line_id`, `cash_flow_category_id`;
   - BC Account Schedule-ийн загвар: `rpt.fin_report_row_definition`, `rpt.fin_report_row`, `rpt.fin_report_column_definition`, `rpt.fin_report_column`, `rpt.financial_report`;
   - хадгалсан тайлан: `rpt.statement_snapshot` (append-only, DRAFT → FINAL) ([120_rpt.sql](../db/schema/120_rpt.sql)).

   Order 361-ийн шинэ хувилбар гарвал шинэ загварын хувилбар нэмнэ. Код өөрчлөгдөхгүй. Үе хаахын өмнө бүх posting дансны харгалзааг шалгана (REQ-ACC-10).
3. **PDF: QuestPDF.**
   - Нийтлэг компонентууд `Erp.BuildingBlocks.Documents`-д байна: толгой, гарын үсгийн блок, тамганы зураг, үсгээр бичсэн дүн, хуудаслалт.
   - Noto Sans эсвэл DejaVu фонтыг embed хийнэ.
   - Unit test нь PDF-ээс задалсан текстийг snapshot-той харьцуулна.
   - QuestPDF-ийн лицензийн орлогын босгыг жил бүр хянана.
4. **Excel: ClosedXML.**
   - Бүх grid ба тайлангийн экспорт;
   - ТТ-03а ба хавсралтууд;
   - Маягт А-ийн XLSX.

   100 000-аас олон мөртэй экспортыг OpenXML SDK-ийн streaming-ээр хийнэ.
5. **Синхрон эсвэл async.** 10 s-ээс удаан гэж тооцоолсон тайлан async job (`integration.job_definition.code = 'rpt.report.export'`, гүйлт `integration.job_run`) болж ажиллана. Үр дүн object storage-д хадгалагдаж, мэдэгдэл ирнэ. SLO-г [02-architecture.md](../02-architecture.md) §13-аас үзнэ үү.
6. **Архивын PDF.** QuestPDF-ийн PDF/A-г техникийн туршилтаар (veraPDF-ээр validate) шалгана.
   - Нийцвэл архивын багцад PDF/A ашиглана.
   - Нийцэхгүй бол энгийн PDF + SHA-256 manifest + PAdES гарын үсгээр хангаж, нөхцөлийг нээлттэй асуудалд бүртгэнэ.
7. **Хэрэглэгчийн тайлангийн дизайнер** v1-д байхгүй.

## Үр дагавар

**Эерэг:**
- Code-first маягтыг тестлэх, version control-д хадгалахад хялбар.
- Тайлангийн загвар өгөгдөл тул хуулийн маягтын өөрчлөлтийг deploy-гүйгээр нэмнэ.
- Лицензийн зардал 0 (босгоос доош).

**Сөрөг ба эрсдэл:**
- **Дизайнер байхгүй.** Маягтын өөрчлөлтийг хөгжүүлэгч хийнэ.
- **QuestPDF-ийн орлогын босго** давбал төлбөртэй лиценз авна (үнэ UNVERIFIED).
- **PDF/A** нээлттэй асуудал.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| DevExpress Reports | Хэрэглэгчийн дизайнер, баялаг экспорт | Арилжааны лиценз, vendor lock-in | Зардал |
| FastReport OSS | Banded тайлан, дизайнер | PDF-ийн боломж сул (PdfSimple) | PDF-ийн чанар |
| HTML → PDF (Chromium/Puppeteer) | Вэб технологи | Chromium-ийг серверт ажиллуулах. Хуудасны нарийн байрлал хэцүү | Үйл ажиллагаа |
| AG Grid Enterprise-ийн Excel экспорт | Клиент талд | Лиценз. Серверийн нийлбэрээс зөрөх эрсдэл | [ADR-0015](./ADR-0015-frontend-react-ag-grid.md) |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §7, TA-11
- [mn-accounting.md](../research/mn-accounting.md) §3, §5, REQ-ACC-11..15
- QuestPDF лиценз: https://github.com/QuestPDF/QuestPDF/blob/main/LICENSE.md
- ClosedXML: https://github.com/ClosedXML/ClosedXML
