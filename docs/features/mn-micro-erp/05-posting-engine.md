# 05. Posting engine — Ерөнхий дэвтрийн бичилтийн хөдөлгүүр (хөгжүүлэлтэд бэлэн тодорхойлолт)

> **Төлөв:** Хөгжүүлэлтэд бэлэн, v1.1 (adversarial review, 2026-10-08 — төгсгөлийн "Хяналтын тэмдэглэл"). **Огноо:** 2026-10-07.
> **Нэг эх сурвалж:** [DECISIONS.md](./DECISIONS.md). Хүснэгт, багана, функцийн нэрийн эх сурвалж нь [db/schema/*.sql](./db/schema/) (D-K1). Бусад баримт эдгээртэй зөрвөл DECISIONS ба схем давамгайлна (§0.3).
> **Холбоос:** [02-architecture.md](./02-architecture.md) §4.5, §6, §8; [03-domain-model.md](./03-domain-model.md) §5, §7; [13-security-audit-tenancy.md](./13-security-audit-tenancy.md) §8, §18; [14-api.md](./14-api.md) §7–§9, §15.2; [15-ui-ux.md](./15-ui-ux.md) §5.5, §16.5; [db/README.md](./db/README.md); [db/seed/README.md](./db/seed/README.md).
> **Уншигч:** backend хөгжүүлэгч (GeneralLedger, Tax, Parties, CashBank, Sales, Purchases модуль), QA, нягтлан зөвлөх.
> **Энэ баримт эзэмшинэ:** posting engine-ийн гэрээ (`Erp.GeneralLedger.Contracts.Posting`), журнал батлах, буцаалт ба залруулга, preview, жилийн хаалтын бичилт үүсгэх, мөн [14-api.md](./14-api.md) §9.5-д "05" гэж заасан `gl.*` алдааны кодын эцсийн жагсаалт.

---

## Агуулга

0. [Энэ баримтыг хэрхэн унших](#0-энэ-баримтыг-хэрхэн-унших)
1. [Зорилго ба хамрах хүрээ](#1-зорилго-ба-хамрах-хүрээ)
2. [Ойлголт ба BC-ээс авсан зүйл](#2-ойлголт-ба-bc-ээс-авсан-зүйл)
3. [Өгөгдөл](#3-өгөгдөл)
4. [Бизнесийн дүрмүүд](#4-бизнесийн-дүрмүүд)
5. [Процесс ба алгоритм](#5-процесс-ба-алгоритм)
6. [Тооцоолол ба бөөрөнхийлөлт](#6-тооцоолол-ба-бөөрөнхийлөлт)
7. [Posting-ийн жишээнүүд](#7-posting-ийн-жишээнүүд)
8. [Validation ба алдааны кодууд](#8-validation-ба-алдааны-кодууд)
9. [Events ба integration](#9-events-ба-integration)
10. [API ба UI холбоос](#10-api-ба-ui-холбоос)
11. [Тест сценари](#11-тест-сценари)
12. [Schema change requests](#12-schema-change-requests)
13. [Нээлттэй асуулт](#13-нээлттэй-асуулт)
14. [Хяналтын тэмдэглэл (Review log)](#хяналтын-тэмдэглэл-review-log)

---

## 0. Энэ баримтыг хэрхэн унших

### 0.1 Хамрах хүрээний хил

Posting engine нь бичилтийг **хэрхэн** бичихийг тогтооно. **Ямар** данс, ямар НӨАТ, ямар тулгалт гэдгийг эх модулийн spec тогтооно.

| Сэдэв | Энэ баримтад | Эзэмшигч spec |
|---|---|---|
| `PostingDocument` гэрээ, engine-ийн алхам, түгжээ, дугаарлалт, register, preview, idempotency | ✔ | — |
| Ерөнхий журнал (GENERAL, CASH_RECEIPT, PAYMENT, OPENING) батлах | ✔ | — |
| Гүйлгээ ба register буцаах, хаалттай үеийн залруулгын ноорог | ✔ | — |
| Жилийн хаалтын бичилт үүсгэх, 3500 → 3400 шилжүүлгийн санал | ✔ | Үе ба жилийн төлөвийн машин: үе ба хаалтын spec (00-д `07-periods-closing.md`), [13](./13-security-audit-tenancy.md) §8 |
| `ILedgerWriter`-ийн гэрээ ба engine-д тавих шаардлага | ✔ | Мөр бүрийн дотоод логик: Tax (НӨАТ-ын spec, 00-д `08-tax-vat-mn.md`), авлага ба тулгалт ([06-sales-receivables.md](./06-sales-receivables.md)), өглөг (худалдан авалтын spec), банк ба касс, R2-т ҮХ ба бараа ([11-fixed-assets-inventory.md](./11-fixed-assets-inventory.md)) |
| Данс тодорхойлох (General Posting Setup, `*` fallback) | Зөвхөн интерфейс | Данс тодорхойлолтын spec (00-д `06-account-determination.md`) |
| НӨАТ-ын тооцоолол, ангилал, хасагдах НӨАТ (D-E3, D-E4) | Зөвхөн hook | НӨАТ-ын spec (00-д `08-tax-vat-mn.md`) |
| Тулгалт ба unapply-ийн алгоритм | Transaction-ий хүрээ (§5.19) | [06-sales-receivables.md](./06-sales-receivables.md) §5.13–§5.14 (авлага), худалдан авалтын spec (өглөг) |
| Борлуулалт, худалдан авалтын баримт угсрах | Зөвхөн posting buffer | [06-sales-receivables.md](./06-sales-receivables.md), худалдан авалтын spec |
| eBarimt | Outbox-ийн дараалал | [12-ebarimt-integration.md](./12-ebarimt-integration.md) |
| REST-ийн дэлгэрэнгүй (body, schema) | Зөвхөн нэр | [14-api.md](./14-api.md) |
| Дугаарын цувралын мастер өгөгдөл | Зөвхөн хэрэглээ | Платформын spec, [db/seed/README.md](./db/seed/README.md) §7 |

Модулийн spec-ийн дугаарлалт [00-overview.md](./00-overview.md)-ийн төлөвлөгөөнөөс өөрчлөгдсөн (06 нь борлуулалт ба авлагыг нэгтгэсэн, 11 нь ҮХ ба бараа). Тиймээс энэ баримт бусад spec-ийг файлын нэрээр биш, **сэдвээр** (НӨАТ-ын spec, банк ба кассын spec г.м.) заана; файл бий болсон үед холбоосыг шинэчилнэ.

### 0.2 Тэмдэглэгээ

| Тэмдэглэгээ | Утга |
|---|---|
| `BR-PST-NN` | Энэ баримтын бизнесийн дүрэм (§4) |
| `AT-PST-NNN` | Хүлээн авах тест (§11.1) |
| `GS-GL-NNN-<slug>` | Golden scenario ([18-dev-setup.md](./18-dev-setup.md) §2.1-ийн формат: `tests/Golden/Scenarios/gl/`) |
| `E-A` … `E-L` | §7-ийн posting-ийн жишээ |
| `R-GL-POSTING-12` г.м. | [research/](./research/)-ийн BC дүрэм ([01-requirements.md](./01-requirements.md) §1.4) |
| `D-C6` г.м. | [DECISIONS.md](./DECISIONS.md)-ийн шийдвэр |
| Дт / Кт | Дебит (`amount > 0`) / кредит (`amount < 0`) (D-C3) |
| A үе / B үе / C үе | Түгжээгүй угсралт / нэг DB transaction / commit-ийн дараах үйлдэл ([02](./02-architecture.md) §6.3) |

### 0.3 Баримтуудын зөрүүг шийдсэн байдал

Энэ баримтыг бичихэд илэрсэн зөрүүг D-K1-ийн дагуу (схем = нэрийн эх сурвалж) шийдсэн. Холбогдох баримтыг эзэмшигч нь засна.

| # | Зөрүү | Энэ баримтын шийдвэр | Үндэслэл |
|---|---|---|---|
| Z-PST-01 | 02 §6.5, ADR-0009-д `core.fn_lock_company_posting` | `platform.fn_lock_company_posting(tenant, company)` (010_platform.sql) | D-K1 |
| Z-PST-02 | 02 §6.5, ADR-0008 #7-д `gl.company_counter` (`last_transaction_no`, `last_entry_no`, `last_register_no`) | `platform.ledger_counter` + `platform.fn_next_entry_no(ledger, n)`; ledger кодын каталог §3.3 | D-K1, D-K3 |
| Z-PST-03 | 02 §6.2 `GlPostingLine.IsCorrection`, 02 §6.8 ба ADR-0007 "улаан сторно", `gl_entry_reversal` хүснэгт | Storno байхгүй (D-C3). Буцаалтын холбоос нь `gl_entry.reversed`, `reversed_by_entry_no`, `reversed_entry_no` ба `gl_transaction.reverses_transaction_no`, `reversed_by_transaction_no` | D-C3, 03 §8 #5 |
| Z-PST-04 | 02 §6.9-д үеийн 4 төлөв (`SOFT_LOCKED`, `HARD_LOCKED`) | `OPEN` / `CLOSED` / `LOCKED` (схем, 13 §8.3) | D-D3 |
| Z-PST-05 | ADR-0010: dimension set-ийн id нь UUIDv7, хоосон = nil UUID, ledger-д global баганагүй | `dimension_set_id bigint`, 0 = хоосон, `gl.fn_get_dimension_set_id(uuid[])`; `global_dim_1/2_value_id`-г trigger set-ээс гаргана (`gl.fn_derive_global_dimensions`) | D-K1, D-D2 |
| Z-PST-06 | 02 §6.5-д `platform.no_series_line` | `platform.number_series`, `number_series_line`, `number_series_counter` + `platform.fn_next_document_no(code, date)` | D-K1, D-C7 |
| Z-PST-07 | 02 §8.7, ADR-0007 #6-д `gl_register`-ийн hash chain; схемд багана алга | Engine hash contributor-ийн цэгийг бэлдэнэ; багана нь [13](./13-security-audit-tenancy.md) CR-15-аар (§12, CR-PST-02) | D-K1 |
| Z-PST-08 | 02 §6.3 B.8, ADR-0007 #3-д проекц `gl.account_period_balance`, `parties.cust_open_item` | Схемд алга. Үлдэгдэл нь view (`920_views.sql`) ба `party.*_ledger_entry`-ийн trigger-ийн кэш. Engine R1-д проекц бичихгүй | D-K1 |
| Z-PST-09 | FR-GL-020, 02 §4.6-ийн source code (`PURCHASE`, `CASH_RECEIPT`, `CLOSE_YEAR` г.м.) | `platform.source_code`-ийн каталог (§3.7-ийн харгалзаа) | D-K1 |
| Z-PST-10 | 02 §6.2: `PostingDocument` нь нэг header-тэй | Нэг run (= нэг `gl_register`) олон ваучертай (`Vouchers[]`). Журналын олон ваучер, бэлэн борлуулалтын 2 гүйлгээ (03 §7) ба register-ийн буцаалт үүнийг шаарддаг | 03 §7, FR-GL-015 |
| Z-PST-11 | 02 §8.3-д ханш нь "1 нэгж валютад ногдох MNT" | Схемийн `currency_factor` = 1 LCY-д ногдох FCY (BC Currency Factor). Engine R1-д валютгүй; R2-ийн томьёо §6.10 | D-K1 |
| Z-PST-12 | FR-PLT-008 AC3: "2028 оны мөр автоматаар үүснэ"; схем: `reset_yearly` цувралд мөр байхгүй бол `ERN01` | Шинэ жилийн мөрийг жилийн хаалтын job (`platform.fn_mn_ensure_number_series(year)`) урьдчилж үүсгэнэ. Posting дотор мөр байхгүй бол `platform.number_series_missing_line`. Автоматаар үүсгэх нь Platform-ийн `INumberAllocator`-ийн хариуцлага (CR-PST-04) | D-C7 |
| Z-PST-13 | 15 §5.9-д залруулах журналын мөрийг клиент угсарна | Сервер санал болгосон мөрийг буцаана (`GET …/correction-proposal`, §5.11); клиент `POST /journals/{id}/lines`-аар нэмнэ | Дүрмийг нэг газарт |
| Z-PST-14 | 14 API-IDEM-03, -07, -12 (Idempotency-ийн эзэмшигч): Шат 0 (A үеэс өмнөх replay хайлт), `request_hash`-ийн томьёо, idempotency мөрийн `lock_timeout` → `409 api.idempotency_in_progress` | 14-ийг дагана (§5.14, §5.15, BR-PST-62, -63). Өмнөх хувилбарын `method + routeTemplate + companyId + body + ifMatch` томьёо ба 503 хүчингүй | 14 эзэмшинэ (14 §22 N1, R7) |
| Z-PST-15 | Бэлэн борлуулалтын 2 дахь (төлбөрийн) ваучерын `document_no`: өмнөх хувилбарын E-E ба 07 BR-PUR-72 нь кассын цуврал (`KO-…`); 06 BR-SAL-50, 09 BR-BNK-21/AT-BNK-10 ба BC (R-SALES-DOCUMENTS-37) нь posted баримтын дугаар (`SI-…`) | BC/06/09-ийг дагана: ваучер 2 = `document_type = 'PAYMENT'` (кредит нотод `REFUND`), `document_no` = posted баримтын дугаар (`VoucherNumbering.SameAsVoucher`, §5.1), source `CASHVOUCHER`/`PAYMENTREG`; МХ-1/МХ-2-ийн дугаарыг (`posted_cash_voucher.no`) CashBank writer кассын цувралаас **тусдаа** олгоно (09 BR-BNK-21). 07 BR-PUR-72-ыг тааруулах | BC; 06/09 |
| Z-PST-16 | Өмнөх §6.6: НӨАТ-ын хуваарилалт хуримтлагдсан дүнгийн бөөрөнхийлөлтөөр (`C_k = R(T·Σa/W)`); D-E3 ба 08 BR-TAX-20 (Z-TAX-09): running remainder | D-E3-ийг дагана (§6.6 засварласан). E-D-ийн үр дүн өөрчлөгдөхгүй | D-E3; 08 Z-TAX-09 |
| Z-PST-17 | Өмнөх §6.10: `amount_lcy = Round(amount / currency_factor)`, LCY үлдэгдэл "дараагийн тэг биш мөрт"; 09 BR-FX-21, BR-FX-26 | 09-ийг дагана: `ToLcy = r(fcy × RateOf(f))`, үлдэгдэл хамгийн их \|LCY\|-тай мөрт (§6.10) | 09 эзэмшинэ |
| Z-PST-18 | 08 Z-TAX-15: `PostingBufferKey`-д хасагдахгүй НӨАТ-ын шалтгаан ба НХАТ-ын код алга; 11 X-04/X-05: `FA_DEPRECIATION_RUN` counter, `ItemApplicationEntry` тогтмол, `PHYSINVJNL` source code | Нэмсэн (§5.7.1, §3.3, §5.1, §3.7) | 08, 11 |

---

## 1. Зорилго ба хамрах хүрээ

### 1.1 Зорилго

Posting engine нь бүх модулийн бүртгэлийг **нэг гэрээгээр**, **нэг DB transaction-д**, **компани тус бүрд цуваа** бичдэг цорын ганц бүрэлдэхүүн (BC-ийн `Gen. Jnl.-Post Line` CU12-ийн үүрэг) юм. Үүнд борлуулалт, худалдан авалт, касс, банк, ерөнхий журнал, эхний үлдэгдэл, буцаалт, жилийн хаалт, R2-т элэгдэл, бараа, ханшийн тэгшитгэл орно. BC-ийн CU13/CU11/CU12/CU19/CU17-ийн **логикийг** хуулна, **бүтцийг** хуулахгүй ([bc-gl-posting.md](./research/bc-gl-posting.md) §7).

Engine-ийн баталгаа:

1. **Тэнцэл.** Гүйлгээ (`transaction_no`) бүр Σ `amount` = 0. Кодоор (insert-ээс өмнө) ба DB-ийн deferred trigger-ээр (COMMIT үед) давхар шалгана (D-C5).
2. **Бүгд эсвэл юу ч үгүй.** G/L, НӨАТ, дэд дэвтэр, posted баримт, outbox, register нэг transaction-д бичигдэнэ. Алдаа гарвал юу ч үлдэхгүй, дугаар зарцуулагдахгүй (D-C6).
3. **Завсаргүй дугаар.** Хуулийн баримтын дугаар, `entry_no`, `transaction_no`, register-ийн дугаар компани дотор завсаргүй (D-C7, D-K3).
4. **Өөрчлөгдөхгүй ledger.** Залруулга зөвхөн шинэ бичилтээр (буцаалт, кредит нот, залруулгын ваучер) (D-C4, D-D5).
5. **Preview = post.** Урьдчилан харах нь ижил код замаар явж ROLLBACK хийнэ (D-C6).
6. **Модулийн хил.** Engine зөвхөн `gl` schema-д SQL бичнэ. Бусад ledger-ийг эзэмшигч модуль нь `ILedgerWriter`-ээр ижил transaction-д бичнэ (D-K2, ADR-0011).

### 1.2 Хувилбарын хамрах хүрээ (DECISIONS §H)

| Чадвар | R1 | R2 | R3 |
|---|---|---|---|
| `PostingDocument` гэрээ, A/B/C үе, advisory lock, idempotency, posting log | ✔ | | |
| Ерөнхий журнал (GENERAL), мөнгөн орлого/зарлагын журнал (CASH_RECEIPT, PAYMENT), эхний үлдэгдэл (OPENING) | ✔ | | |
| Журналын мөрийн НӨАТ (мөрөнд `gen_posting_type` ба VAT бүлгийг тодорхой заасан үед) | ✔ (Should) | | |
| Стандарт журналаас хуулах (D-D6) | ✔ | | |
| Давтагдах журнал (FIXED, VARIABLE, REVERSING_*) | | ✔ | |
| Дугаарлалт: хуулийн дугаар, `entry_no`, `transaction_no`, register | ✔ | | |
| Dimension set (2 global), value posting дүрмийн шалгалт (engine) | ✔ | UI (D-D2) | |
| НӨАТ-ын hook (`tax.vat_entry`, G/L–VAT холбоос) | ✔ | НХАТ (`tax.city_tax_entry`) | |
| Дэд дэвтрийн writer: авлага, өглөг, банк, касс | ✔ | ҮХ, бараа, ханшийн тэгшитгэл | |
| Гүйлгээ буцаах, register буцаах, хаалттай үеийн залруулгын ноорог | ✔ | | |
| G/L-гүй дэд дэвтрийн run (тулгалт, unapply) | ✔ | G/L-тэй тулгалт (ханшийн зөрүү) | |
| Preview | ✔ | | |
| Жилийн хаалтын бичилт (данс бүрээр), 3500 → 3400 шилжүүлгийн ноорог | ✔ | Dimension-ээр хаах | |
| Валютын мөр (FCY тэнцэл, `source_currency_*`) | | ✔ | |
| Хэрэглэгчийн posting цонх (`platform.user_setup`) | | ✔ | |
| `gl_register`-ийн hash chain (FR-GL-028) | ✔ (Should, CR-15-аас хамаарна) | | |
| Approval-ийн дараа батлах (D-I4) | | | ✔ |

### 1.3 Хамрах шаардлага (FR)

| FR | Энэ баримт юуг хангах | Хэсэг |
|---|---|---|
| FR-GL-003 Хяналтын данс руу шууд бичих хориг | `LineOrigin`, BR-PST-15 | §4.2, §5.3 |
| FR-GL-006 Ерөнхий журнал ба ваучер | Журнал батлах use case | §5.4 |
| FR-GL-007 Ваучерийн тэнцвэр | BR-PST-21..25 | §4.3, §5.4 |
| FR-GL-008 Posting engine, бүх алдааг цуглуулах | A/B үе, `ValidateAsync` | §5.2, §5.3 |
| FR-GL-009 Гүйлгээ, register, entry-ийн дугаар | §5.5, §5.9 | §4.4, §4.8 |
| FR-GL-010 Тэмдэгтэй дүн | BR-PST-05, -06 | §6.2 |
| FR-GL-011 Preview | §5.12 | §4.10 |
| FR-GL-012 Засах, устгах боломжгүй | DB guard-д тулгуурлана | §3.6 |
| FR-GL-013 Гүйлгээ буцаах | §5.10 | §4.9 |
| FR-GL-014 Хаалттай үеийн засвар | §5.11 | §4.9 |
| FR-GL-015 Register бүхэлд нь буцаах | §5.10 | §4.9 |
| FR-GL-016 Стандарт журнал | Хуулах үйлдэл | §5.4.6 |
| FR-GL-017 Давтагдах журнал (R2) | Hook | §5.4.7 |
| FR-GL-018 Dimension ба 2 global dimension | §5.6 | §4.5 |
| FR-GL-019 Default dimension, value posting (UI R2) | Engine-ийн шалгалт R1 | §5.6 |
| FR-GL-020 Source code, шалтгааны код | §3.7, BR-PST-09, -20 | §4.1, §4.2 |
| FR-GL-021 Эхний үлдэгдэл | OPENING журнал | §5.4, E-K |
| FR-GL-023 Компанийн posting огнооны цонх | BR-PST-18 | §5.3 |
| FR-GL-026 Жилийн хаалт | §5.13 | §4.11, E-H..E-J |
| FR-GL-027 Хэрэглэгчийн posting цонх (R2) | BR-PST-18 | §5.3 |
| FR-GL-028 Hash chain | Hook (CR-15) | §5.9 |
| FR-PLT-008 Дугаарын цуврал | Posting доторх хэрэглээ | §5.5 |
| FR-PLT-013 Navigate | Баримтын дугаар бүх ledger-т | §3.1 |
| FR-TAX-007, FR-TAX-008 VAT entry, НӨАТ-ын огноо | НӨАТ-ын hook | §5.7 |
| FR-PTY-009..011, FR-PTY-013 Тулгалт, unapply, тулгалтын огноо | G/L-гүй run-ий transaction хүрээ (алгоритм нь 06) | §4.15, §5.19 |
| NFR-001, -003, -004, -007, -010, -012, -016 | Тэнцэл, завсаргүй дугаар, idempotency, гүйцэтгэл | §4.12, §4.13, §5.14–§5.16 |

---

## 2. Ойлголт ба BC-ээс авсан зүйл

### 2.1 Гол ойлголт

| Ойлголт | Тодорхойлолт | Схем |
|---|---|---|
| **Posting run** (батлах ажиллагаа) | Нэг `PostingDocument`-ийг батлах нэг ажиллагаа. Нэг DB transaction, нэг `gl_register` | `gl.gl_register` |
| **Ваучер** (voucher, гүйлгээ) | Тэнцсэн G/L мөрийн багц. Нэг posting огноо, нэг баримтын дугаар | `gl.gl_transaction` (`transaction_no`) |
| **G/L entry** (ерөнхий дэвтрийн бичилт) | Нэг дансны тэмдэгтэй дүн | `gl.gl_entry` (`entry_no`) |
| **Дэд дэвтрийн мөр** (subledger line) | Ваучерын G/L мөртэй холбоотой НӨАТ, авлага, өглөг, банкны мөр | `tax.vat_entry`, `party.*_ledger_entry`, `bank.bank_ledger_entry` |
| **Posting buffer** (бичилтийн буфер) | Баримтын мөрийг (данс, posting group, НӨАТ-ын бүлэг, dimension set)-ээр нэгтгэж G/L мөр болгох санах ойн бүтэц (BC T55) | Санах ой |
| **Writer** (`ILedgerWriter`) | Өөрийн schema-ийн ledger-ийг бичдэг модулийн бүрэлдэхүүн | — |
| **Posted document writer** (`IPostedDocumentWriter`) | Эх баримтыг түгжиж, posted баримт бичиж, ноорогийг устгадаг эх модулийн бүрэлдэхүүн | — |
| **Мөрийн гарал** (`LineOrigin`) | `UserEntered` (хэрэглэгч шууд сонгосон данс), `SystemDerived` (тохиргооноос гарсан данс), `SystemGenerated` (хаалт, буцаалт) | `gl_entry.system_created` |

### 2.2 BC-ээс юуг хуулсан, хялбарчилсан, хассан

| BC (W1 v29) | Манай хэрэгжүүлэлт | Ангилал | Research дүрэм |
|---|---|---|---|
| CU13 Post Batch: (1) мөр бүрийг шалгах, (2) тэнцлийг шалгах, (3) бичих, нэг Commit | A үе (бүх шалгалт, бүх алдаа) → B үе (түгжээний дор дахин шалгах, бичих) → нэг COMMIT | Хуулсан | R-GL-POSTING-21, R-GL-POSTING-22, R-GL-POSTING-26 |
| CU11 Check Line (`RunCheck`-ийн дараалал) | BR-PST-10..20, §5.3-ын дараалал | Хуулсан (дасгал) | R-GL-POSTING-13, R-GL-POSTING-14, R-GL-POSTING-17, R-GL-POSTING-18, R-GL-POSTING-19, R-GL-POSTING-20 |
| Force Doc. Balance (сонголттой) | Ямагт асаалттай. Ваучер = (`document_no`, `posting_date`) | Хялбарчилсан | R-GL-POSTING-21 |
| `Transaction No.`: баримт/огноо солигдох эсвэл running balance 0 болоход шинэ | Ваучер бүр = нэг `gl_transaction` (тодорхой header) | Хялбарчилсан | R-GL-POSTING-29 |
| G/L, Cust., Bank entry ижил `Entry No.`-тэй | Ledger бүр өөрийн counter-тэй, холбоос нь `transaction_no` ба тодорхой FK | Хассан | R-GL-POSTING-30 |
| Огноогоор жигнэсэн checksum (run даяар хуримтлагдана) | Гүйлгээ бүрийн Σ = 0 (engine-ийн self-check + deferred trigger). BC-ээс хатуу | Өөрчилсөн | R-GL-POSTING-35, D-C5 |
| `Correction` (storno), `UpdateDebitCredit` | Тэмдгээс generated `debit_amount`/`credit_amount`. Буцаалт эсрэг баганад | Өөрчилсөн | R-GL-POSTING-10, R-GL-POSTING-36, D-C3 |
| "needs rounding" шалгалт | Дүн LCY нарийвчлалаар бөөрөнхийлөгдсөн байх ёстой | Хуулсан | R-GL-POSTING-34 |
| G/L Register: эхэнд insert, төгсгөлд modify | Төгсгөлд нэг удаа INSERT (append-only), FK нь DEFERRABLE | Өөрчилсөн | R-GL-POSTING-28, R-GL-POSTING-31 |
| G/L Transaction (T57) | Ваучерын толгой болгож өргөтгөсөн (огноо, баримт, `is_closing`, буцаалтын холбоос) | Өргөтгөсөн | R-GL-POSTING-31 |
| VAT entry → **суурь** G/L entry-ийн холбоос (T253) | `tax.gl_entry_vat_entry_link` + `vat_entry.gl_entry_no` | Хуулсан | R-GL-POSTING-33, R-VAT-20 |
| Invoice Posting Buffer, нэгтгэх дүрэм | `PostingBuffer` (жижигрүүлсэн түлхүүр) | Хялбарчилсан | R-ACCOUNT-DETERMINATION-17, R-ACCOUNT-DETERMINATION-18, R-ACCOUNT-DETERMINATION-33 |
| System-created мөр Direct Posting-ийг алгасна | `LineOrigin` | Хуулсан | R-GL-POSTING-07, R-ACCOUNT-DETERMINATION-22, R-ACCOUNT-DETERMINATION-34 |
| Гарал үүслийн дансны dimension шалгалт | Хуулсан | Хуулсан | R-DIMENSIONS-NOSERIES-AUDIT-20 |
| Dimension Set Tree Node | Агуулгын hash (`key_hash`) + `fn_get_dimension_set_id` | Өөрчилсөн | R-DIMENSIONS-NOSERIES-AUDIT-08, R-DIMENSIONS-NOSERIES-AUDIT-09 |
| Global Dimension 1/2 Code entry дээр | `global_dim_1/2_value_id`-г trigger set-ээс гаргана | Өөрчилсөн | R-DIMENSIONS-NOSERIES-AUDIT-23, R-DIMENSIONS-NOSERIES-AUDIT-24 |
| Value Posting (Code Mandatory / Same Code / No Code), хуримтлагдах | Хуулсан (UI R2) | Хуулсан | R-DIMENSIONS-NOSERIES-AUDIT-13, R-DIMENSIONS-NOSERIES-AUDIT-18, R-DIMENSIONS-NOSERIES-AUDIT-19 |
| No. Series Normal (мөрийг түгжиж ижил transaction-д бичих) | `fn_next_document_no` + `number_series_counter` | Хуулсан | R-DIMENSIONS-NOSERIES-AUDIT-27, R-DIMENSIONS-NOSERIES-AUDIT-28, R-DIMENSIONS-NOSERIES-AUDIT-29, R-DIMENSIONS-NOSERIES-AUDIT-34 |
| Posting No.-г ledger-ээс өмнө commit, "Deleted Document" орлуулагч | Хэрэггүй (нэг transaction) | Хассан | R-DIMENSIONS-NOSERIES-AUDIT-35, ADR-0008 |
| Allowed posting dates (template → user → G/L Setup) | Компанийн цонх (R1) ∩ хэрэглэгчийн цонх (R2) ∩ үеийн төлөв `OPEN` | Өөрчилсөн | R-GL-POSTING-18, R-PERIODS-REPORTING-08, R-PERIODS-REPORTING-11 |
| C-огноо (closing date) | 12-31-ний `is_closing = true` ваучер | Өөрчилсөн | R-GL-POSTING-19, R-GL-POSTING-37, R-PERIODS-REPORTING-12, R-PERIODS-REPORTING-15, D-D4 |
| Close Income Statement (R94) → журналын мөр → хэрэглэгч батлана | Төлөвгүй үйлчилгээ: түгжээний дор тооцож шууд батална (preview-тэй); данс бүрд нэг мөр; үр дүн 3500 руу | Хялбарчилсан | R-PERIODS-REPORTING-16, R-PERIODS-REPORTING-17, R-PERIODS-REPORTING-18, R-PERIODS-REPORTING-21, R-PERIODS-REPORTING-22 |
| Fiscal Year Close (CU6), `Closed` нь posting-ийг хаадаггүй | `fiscal_year.status`, `accounting_period.status`: `CLOSED` нь posting-ийг хаана | Өөрчилсөн | R-PERIODS-REPORTING-05, R-PERIODS-REPORTING-06, D-D3 |
| Reverse Transaction / Register | Хуулсан. Ялгаа: storno-гүй; register буцаалт нь эх гүйлгээ бүрд тусдаа шинэ гүйлгээ; эх register-ийн `reversed` нь бүх гүйлгээ буцаагдсан үед | Хуулсан (өөрчлөлттэй) | R-GL-POSTING-38, R-GL-POSTING-39, R-GL-POSTING-40, R-GL-POSTING-41 |
| Буцаалтын нөхцөл (тулгалт, банкны хуулга, НӨАТ хаагдсан) | Хуулсан | Хуулсан | R-GL-POSTING-39, R-VAT-24, R-SUBLEDGERS-APPLICATION-32, R-BANK-CASH-39 |
| Preview (`CommitBehavior::Error`, `***`) | Ижил код + `SET CONSTRAINTS ALL IMMEDIATE` + ROLLBACK | Хуулсан (механизм өөр) | R-GL-POSTING-42 |
| Нэг баримтад НӨАТ-тай үед нэг л харилцагч | Хуулсан | Хуулсан | R-GL-POSTING-24 |
| Харилцагч/нийлүүлэгчийн мөр posting group-гүй | Хуулсан | Хуулсан | R-ACCOUNT-DETERMINATION-31, R-VAT-17 |
| Source Code Setup (T242) | Процесс бүрийн тогтмол код (§3.7) | Хялбарчилсан | R-DIMENSIONS-NOSERIES-AUDIT-37, R-DIMENSIONS-NOSERIES-AUDIT-38 |
| Reason Code (логикгүй шошго) | Буцаалт ба кредит нотод заавал | Өргөтгөсөн | R-DIMENSIONS-NOSERIES-AUDIT-39, FR-GL-020 |
| Давтагдах журнал | R2 (F, V, RF, RV) | Хойшлуулсан | R-GL-POSTING-43, R-GL-POSTING-44 |
| Журналын мөр бүрийн `Correction` ижил байх (R-23) | Storno байхгүй тул хэрэггүй | Хассан | R-GL-POSTING-23 |
| Posted Gen. Journal Line архив | Ledger өөрөө архив | Хассан | bc-gl-posting.md §7 #10 |
| `Prior-Year Entry` | Огнооноос гаргана | Хассан | R-GL-POSTING-31, R-PERIODS-REPORTING-06 |
| ACY, IC, Job, Deferral, Allocation, payment tolerance, Use Concurrent Posting | Хамрахгүй | Хассан | bc-gl-posting.md §7 #10 |
| `LockTable` (G/L Entry, VAT Entry, G/L Register) — бүх хэрэглэгчийг цуваа болгодог | Компани тус бүрийн `pg_advisory_xact_lock` | Өөрчилсөн | R-GL-POSTING-28, TA-05 |
| Batch нь дугаарыг санах ойд тооцоод `SaveState` | Дугаарын мөрийг transaction дотор түгжинэ (давхардал боломжгүй) | Өөрчилсөн | R-DIMENSIONS-NOSERIES-AUDIT-34, bc-dimensions-noseries-audit.md §8 #18 |

---

## 3. Өгөгдөл

Энэ хэсэг нь [db/schema/*.sql](./db/schema/)-ийн нэрийг яг ашиглана. Схемд байхгүй зүйлийг §12-т хүсэлт болгосон.

### 3.1 Engine-ийн бичдэг хүснэгт (`gl` schema)

**`gl.gl_transaction`** — ваучерын толгой (BC T57-г өргөтгөсөн). Ваучер бүрд нэг мөр.

| Багана | Утга | Хаанаас |
|---|---|---|
| `id` | UUIDv7 | App (`Guid.CreateVersion7()`) |
| `tenant_id`, `company_id` | Контекст | `ITenantContext` |
| `transaction_no` | Компани доторх завсаргүй дугаар | `fn_next_entry_no('GL_TRANSACTION', n)` |
| `gl_register_no` | Энэ run-ий register | `fn_next_entry_no('GL_REGISTER', 1)` |
| `posting_date` | Ваучерын огноо. Бүх entry ба дэд дэвтрийн мөр ижил огноотой (DB шалгана) | `PostingVoucher.PostingDate` |
| `is_closing` | Жилийн хаалтын ваучер (D-D4). `true` бол огноо 12-31 (CHECK) | `PostingVoucher.IsClosing` |
| `document_type` | Мөрүүд ижил төрөлтэй бол тэр төрөл, эс бөгөөс `NONE` | `PostingVoucher.DocumentType` |
| `document_no` | Хуулийн дугаар (`SI-2026-00042`) | `fn_next_document_no` эсвэл буцаалтад эх дугаар |
| `source_code` | Процессын код (§3.7) | `PostingVoucher.SourceCode ?? Run.SourceCode` |
| `reason_code_id` | Шалтгаан (буцаалт, кредит нотод заавал) | `PostingVoucher.ReasonCodeId` |
| `description` | Ваучерын тайлбар | `PostingVoucher.Description` |
| `reverses_transaction_no` | Буцаалтын ваучер дээр: эх гүйлгээ. `UNIQUE` (нэг л удаа буцаана) | `ReversalService` |
| `reversed_by_transaction_no` | Эх гүйлгээн дээр: буцаалт. Зөвхөн `fn_ledger_update`-ээр | `ReversalService` |
| `created_at`, `created_by` | Transaction-ий цаг (trigger `now()`), `app.user_id` | DB |

**`gl.gl_entry`** — G/L-ийн бичилт (BC T17). `GlPostingLine` бүрд нэг мөр.

| Багана | Утга | Хаанаас |
|---|---|---|
| `id` | UUIDv7 | App |
| `entry_no` | Компани доторх завсаргүй дугаар | `fn_next_entry_no('GL_ENTRY', n)` |
| `transaction_no`, `gl_register_no`, `posting_date`, `is_closing` | Ваучерынхтай яг ижил (DB: `ERB02`) | Ваучер |
| `gl_account_id` | POSTING төрлийн, блоклогдоогүй данс (DB: `ERG01`) | `GlPostingLine.GlAccountId` |
| `document_type`, `document_no` | Ваучерын баримт (мөрийн төрөл) | Ваучер / мөр |
| `document_date`, `external_document_no` | Анхан шатны баримтын огноо, гадаад дугаар | Мөр / ваучер |
| `description` | ≤ 100 тэмдэгт; мөрийнх эсвэл ваучерынх | Мөр |
| `amount` | Тэмдэгтэй LCY: Дт > 0, Кт < 0 (D-C3) | `GlPostingLine.Amount` |
| `debit_amount`, `credit_amount` | Generated (engine бичихгүй) | DB |
| `vat_amount` | Суурь мөрийн НӨАТ (BC `G/L Entry."VAT Amount"`); бусад мөрөнд 0 | `GlPostingLine.VatAmount` |
| `gen_posting_type` | `NONE`, `SALE`, `PURCHASE`, `SETTLEMENT` | Мөр |
| `gen_bus_posting_group`, `gen_prod_posting_group`, `vat_bus_posting_group`, `vat_prod_posting_group` | Posting group-ийн **код**-ын snapshot (FK-гүй) | `GlPostingLine.Groups` |
| `vat_date` | НӨАТ-ын огноо (D-E9) | Мөр |
| `bal_account_type`, `bal_account_id` | Харьцсан данс (мэдээллийн) | Мөр |
| `source_type`, `source_id`, `source_no` | Харилцагч, нийлүүлэгч, мөнгөний данс (дансны хуулга, Navigate) | `GlPostingLine.Source` |
| `source_currency_code`, `source_currency_amount` | R2: анхны валют ба дүн | `GlPostingLine.SourceCurrency` |
| `dimension_set_id` | 0 = хоосон | Мөр |
| `global_dim_1_value_id`, `global_dim_2_value_id` | Trigger set-ээс гаргана (engine бичихгүй) | DB |
| `source_code`, `reason_code_id` | Ваучерынх (мөрийн шалтгаан давуу) | Ваучер / мөр |
| `journal_template_code`, `journal_batch_code` | Журналаас бол template/batch-ийн код; буцаалтад NULL | `Run` |
| `system_created` | `Origin ≠ UserEntered` | Мөр |
| `reversed`, `reversed_by_entry_no` | Эх entry дээр, зөвхөн `fn_ledger_update`-ээр | `ReversalService` |
| `reversed_entry_no` | Буцаалтын entry дээр (insert үед), `reversed = true`-тэй хамт | `ReversalService` |

**`gl.gl_register`** — posting run-ий бүртгэл (BC T45). Run бүрд нэг мөр, **хамгийн сүүлд** INSERT.

| Багана | Утга |
|---|---|
| `no` | `fn_next_entry_no('GL_REGISTER', 1)` |
| `from_entry_no`, `to_entry_no` | Энэ run-ий G/L entry-ийн муж (бүгд дараалсан) |
| `from_vat_entry_no`, `to_vat_entry_no` | Tax writer-ийн нөөцөлсөн VAT entry-ийн муж; НӨАТ байхгүй бол NULL |
| `source_code` | `Run.SourceCode` |
| `journal_template_code`, `journal_batch_code` | Журналаас бол |
| `request_id` | `app.request_id` (API хүсэлт эсвэл `job:<job_run_id>`) |
| `reversed` | Бүх гүйлгээ нь буцаагдсан бол `true` (зөвхөн `fn_ledger_update`) |

### 3.2 Engine-ийн уншдаг өгөгдөл

| Хүснэгт | Багана | Хэрэглээ |
|---|---|---|
| `gl.gl_account` | `no`, `name`, `account_type`, `blocked`, `direct_posting`, `income_balance`, `account_category`, `normal_side` | BR-PST-15, жилийн хаалт, W-01 анхааруулга (D-D1) |
| `gl.general_ledger_setup` | `current_year_result_account_id` (3500), `retained_earnings_account_id` (3400), `global_dimension_1_id/2_id`, `max_vat_difference_allowed` | Жилийн хаалт, НӨАТ-ын зөрүү |
| `gl.fiscal_year`, `gl.accounting_period` | `status`, `starting_date`, `ending_date`, `closing_transaction_no` | BR-PST-18, -54, -57 |
| `platform.company_setup` | `allow_posting_from/to`, `amount_rounding_precision`, `lcy_code`, `vat_rounding_type`, `vat_registered`, `time_zone` | BR-PST-05, -18 |
| `platform.user_setup` (R2) | `allow_posting_from/to` | Хэрэглэгчийн цонх |
| `platform.source_code` | `code` | BR-PST-09 |
| `platform.reason_code` | `blocked` | BR-PST-20 |
| `gl.journal_template` | `code`, `template_type`, `source_code`, `recurring`, `allow_vat_difference`, `bal_account_*`, `no_series_id`, `posting_no_series_id` | Журнал |
| `gl.journal_batch` | `code`, `bal_account_*`, `posting_no_series_id`, `reason_code_id`, `copy_vat_setup`, `row_version` | Журнал (ETag) |
| `gl.journal_line` | Бүх багана (§5.4) | Журнал |
| `gl.standard_journal`, `gl.standard_journal_line` | Мөрийн загвар | Хуулах (D-D6) |
| `gl.dimension`, `gl.dimension_value`, `gl.dimension_set`, `gl.dimension_set_entry`, `gl.default_dimension` | `blocked`, `value_type`, `value_posting` | BR-PST-31..35 |

### 3.3 Дугаарлалтын объект

**`platform.ledger_counter`** (`company_id`, `ledger`, `last_no`) — ledger бүрийн завсаргүй counter (D-C6, D-K3). Зөвхөн `platform.fn_next_entry_no(ledger, count)` (SECURITY DEFINER) бичнэ; энэ нь `count` ширхэг дараалсан дугаар нөөцөлж эхнийхийг буцаана. Мөрийн түгжээ commit хүртэл үргэлжилнэ.

| `ledger` код | Багана | Хэн нөөцөлнө | Хувилбар |
|---|---|---|---|
| `GL_REGISTER` | `gl.gl_register.no` (`gl_register_no`) | Engine | R1 |
| `GL_TRANSACTION` | `gl.gl_transaction.transaction_no` | Engine | R1 |
| `GL_ENTRY` | `gl.gl_entry.entry_no` | Engine | R1 |
| `VAT_ENTRY` | `tax.vat_entry.entry_no` | Tax writer | R1 |
| `CUST_LEDGER_ENTRY`, `DETAILED_CUST_LEDGER_ENTRY` | `party.cust_ledger_entry.entry_no`, `party.detailed_cust_ledger_entry.entry_no` | Parties writer | R1 |
| `VENDOR_LEDGER_ENTRY`, `DETAILED_VENDOR_LEDGER_ENTRY` | `party.vendor_ledger_entry.entry_no`, `party.detailed_vendor_ledger_entry.entry_no` | Parties writer | R1 |
| `APPLICATION_NO` | `party.detailed_*.application_no` | Parties writer | R1 |
| `BANK_LEDGER_ENTRY` | `bank.bank_ledger_entry.entry_no` | CashBank writer | R1 |
| `CITY_TAX_ENTRY` | `tax.city_tax_entry.entry_no` | Tax writer | R2 |
| `FA_LEDGER_ENTRY` | `fa.fa_ledger_entry.entry_no` | FixedAssets writer | R2 |
| `ITEM_LEDGER_ENTRY`, `VALUE_ENTRY`, `ITEM_APPLICATION_ENTRY` | `inv.*.entry_no` | Inventory writer | R2 |
| `EXCH_RATE_ADJMT_REGISTER`, `EXCH_RATE_ADJMT_LEDGER_ENTRY` | `fx.*` | Currency (R2) | R2 |
| `FA_DEPRECIATION_RUN` | `fa.depreciation_run.run_no` (ledger биш, техникийн дугаар; [11](./11-fixed-assets-inventory.md) X-04) | FixedAssets | R2 |

Кодыг C#-д `LedgerCodes` тогтмолоор (`Erp.GeneralLedger.Contracts.Posting`) тодорхойлно. Шинэ ledger нэмэхэд энэ хүснэгт ба тогтмолыг шинэчилнэ.

`fn_next_entry_no(ledger, count)` нь `count < 1` үед `22023` алдаа өгнө. Тиймээс engine ба writer **0 мөртэй ledger-т дугаар нөөцлөхгүй** (жишээ нь НӨАТ-гүй run-д `VAT_ENTRY`-г дуудахгүй, `from/to_vat_entry_no = NULL`).

**Хуулийн баримтын дугаар.** `platform.number_series` (`code`, `gapless`, `reset_yearly`, `date_order`, `manual_nos`), `platform.number_series_line` (`starting_date`, `prefix`, `width`, `starting_no`, `ending_no`), `platform.number_series_counter` (gapless цувралын `last_no_used`, `last_date_used`). Дугаарыг зөвхөн `platform.fn_next_document_no(series_code, posting_date)` олгоно (SECURITY DEFINER; алдаа `ERN01` мөр алга, `ERN02` огнооны дараалал, `ERN03` дууссан). Seed-ийн хуулийн цуврал ([db/seed/README.md](./db/seed/README.md) §7): `SI`, `SC`, `PI`, `PC`, `KO`, `KZ`, `BR`, `BP`, `GJ`, `OB`, `CL` — бүгд `gapless`, `reset_yearly`, `PREFIX-YYYY-#####`.

**Журналын цуврал.** Ваучерын цуврал = `journal_batch.posting_no_series_id ?? journal_template.posting_no_series_id`. Seed: GENERAL/DEFAULT → `GJ`; CASH_RECEIPT/BANK → `BR`, CASH_RECEIPT/CASH → `KO` (МХ-1); PAYMENT/BANK → `BP`, PAYMENT/CASH → `KZ` (МХ-2); OPENING/DEFAULT → `OB`; CLOSING/YEAR_END → `CL`. Ноорогийн дугаар `JNL_DRAFT` (`J-000123`, завсартай байж болно).

### 3.4 Engine-ийн дуудах DB функц

| Функц | Үүрэг | Алдаа |
|---|---|---|
| `platform.fn_set_context(tenant, company, user, request_id)` | Transaction-ий RLS контекст (pipeline дуудна) | — |
| `platform.fn_lock_company_posting(tenant, company)` | `pg_advisory_xact_lock(hashtextextended('post:'‖tenant‖':'‖company, 0))` | `55P03` (lock_timeout) |
| `platform.fn_next_entry_no(ledger, count)` | Ledger-ийн дугаарын блок | — |
| `platform.fn_next_document_no(series, date)` | Хуулийн дугаар | `ERN01..03` |
| `platform.fn_ledger_update(table, key, jsonb)` | Зөвшөөрөгдсөн баганыг өөрчлөх (`reversed`, `reversed_by_entry_no`, `reversed_by_transaction_no`, register-ийн `reversed`) | `ERL01` |
| `gl.fn_get_dimension_set_id(uuid[])` | Dimension set олох/үүсгэх | `ERD01` |
| `gl.fn_assert_posting_date_allowed(company, date, is_closing)` | Үе ба цонхны дүрэм (trigger ашигладаг; engine урьдчилж ижил дүрмийг кодоор шалгана) | `ERP01` |

### 3.5 Writer-ээр бичигдэх хүснэгт (engine шууд хандахгүй)

| Хүснэгт | Writer (модуль) | Engine-д тавих шаардлага |
|---|---|---|
| `tax.vat_entry`, `tax.gl_entry_vat_entry_link` | Tax | `gl_entry_no` = суурь G/L entry; `transaction_no`, `gl_register_no`, `posting_date` = ваучерынх; VAT entry-ийн мужийг контекстод бүртгэнэ |
| `tax.city_tax_entry` (R2) | Tax | Ижил |
| `party.cust_ledger_entry`, `party.detailed_cust_ledger_entry` | Parties | Харилцагчийн мөрийн хяналтын G/L entry ижил ваучерт; `remaining_amount`, `open`-ийг trigger тооцно |
| `party.vendor_ledger_entry`, `party.detailed_vendor_ledger_entry` | Parties | Ижил |
| `bank.bank_ledger_entry`, `bank.posted_cash_voucher` | CashBank | Касс сөрөг болохгүй (DB `ERC01`) |
| `fa.fa_ledger_entry` (R2), `inv.item_ledger_entry`, `inv.value_entry`, `inv.gl_item_ledger_relation` (R2) | FixedAssets, Inventory | — |
| `sales.*`, `purchase.*` posted баримт, ноорог | `IPostedDocumentWriter` (эх модуль) | Ноорогийг устгах, posted баримт бичих |
| `ebarimt.ebarimt_document`, `integration.outbox` (eBarimt) | `IEbarimtReceiptQueue` (12) | Posted document writer дуудна |

### 3.6 Хөндлөнгийн хүснэгт ба DB-ийн хамгаалалт

| Объект | Engine-ийн хэрэглээ |
|---|---|
| `integration.idempotency_key` | Pipeline бичнэ (§5.14); engine-ийн хариуг `response_body`-д хадгална (`qrData`/`lottery`-гүй, CHECK) |
| `integration.outbox` | `PostingDocument.Outbox` + GL event (§9); `idempotency_key` UNIQUE per tenant |
| `audit.posting_log` | Амжилттай run (ижил transaction), бүтэлгүй run (тусдаа transaction) (§5.17) |

Engine-ийн тулгуурладаг DB guard ([910_ledger_guards.sql](./db/schema/910_ledger_guards.sql)):

| Guard | Юуг хангах | SQLSTATE |
|---|---|---|
| `trg_gl_entry_balanced`, `trg_gl_transaction_has_entries` (DEFERRABLE INITIALLY DEFERRED) | Гүйлгээ бүр Σ = 0, ≥ 1 entry, COMMIT үед, RLS-ээс хамааралгүй | `ERB01` |
| `trg_gl_transaction_period` | Огноо `OPEN` үед (хаалтын ваучер: `LOCKED` биш), компанийн цонхонд | `ERP01` |
| `trg_gl_entry_rules` | Entry нь өөрийн ваучертай ижил огноо/closing/register; ваучер энэ DB transaction-д үүссэн; данс POSTING, блоклогдоогүй | `ERB02`, `ERL01`, `ERG01` |
| `trg_*_transaction_check` | Дэд дэвтэр/posted мөр ваучерынхаа огноотой, энэ transaction-ий ваучерт | `ERB02`, `ERL01` |
| `trg_*_global_dims` | Global dimension-ийг set-ээс гаргана | — |
| `trg_vat_entry_period` | НӨАТ-ын огноо `OPEN` НӨАТ-ын үед | `ERV01` |
| `trg_bank_ledger_entry_non_negative` (deferred) | Касс сөрөг болохгүй | `ERC01` |
| `fn_guard_immutable` + REVOKE | Ledger append-only; зөвхөн whitelist багана `fn_ledger_update`-ээр | `ERL01`, `42501` |
| `fn_ledger_before_insert` | Ledger мөр контекстын компанид; `created_at = now()` | `ERT01` |
| `ux_gl_transaction__reverses` | Нэг гүйлгээг нэг л удаа буцаана | `23505` |

### 3.7 Source code-ийн харгалзаа

`platform.source_code` бол глобал, хаалттай каталог. Engine нь процессоор код сонгоно; хэрэглэгч сонгохгүй (R-DIMENSIONS-NOSERIES-AUDIT-38).

| FR-GL-020 / 02-ийн нэр | `platform.source_code.code` | Процесс | `:reverse` (нийтийн) |
|---|---|---|---|
| GENJNL | `GENJNL` | Ерөнхий журнал (GENERAL) | ✔ |
| — | `STDJNL` | Стандарт журналаас шууд батлах (R1-д ашиглахгүй: хуулсан мөр GENJNL-ээр батлагдана) | ✔ |
| CASH_RECEIPT | `CASHRECJNL` | Мөнгөн орлогын журнал | ✔ |
| PAYMENT | `PAYMENTJNL` | Төлбөрийн журнал | ✔ |
| CASH_RECEIPT / PAYMENT | `CASHVOUCHER`, `PAYMENTREG` | `POST /payments`-ийн МХ-1/МХ-2, банкны төлбөр; бэлэн борлуулалт/худалдан авалтын 2 дахь ваучер | ✔ (тулгагдаагүй үед). `POST /payments` нь BC-ийн Cash Receipt/Payment Journal-ийн API хэлбэр тул D-D5-ийн "журналаас үүссэн" гэдэгт багтана. Бэлэн борлуулалтын ваучер нь заавал тулгагдсан тул бодитоор `gl.reversal_entries_applied` өгнө (кредит нотоор засна) |
| OPENING | `OPENING` | Эхний үлдэгдэл (D-D7) | ✔ |
| — | `PAYROLLJNL`, `CASHCOUNT` (seed) | Цалингийн журнал импорт, кассын тооллого | ✔ |
| SALES | `SALES` | Борлуулалтын нэхэмжлэх, кредит нот | ✕ → кредит нот (`gl.reversal_use_credit_memo`) |
| PURCHASE | `PURCHASES` | Худалдан авалтын баримт | ✕ → кредит нот |
| REVERSAL | `REVERSAL` | Буцаалт | ✕ (буцаалтыг буцаахгүй) |
| CLOSE_YEAR | `CLSINCOME` | Жилийн хаалт | ✕ (дахин ажиллуулах нь зөрүүг бичнэ, §5.13) |
| VAT_SETTLEMENT | `VATSTMT`, `CITYTAXSTMT` | НӨАТ/НХАТ-ын хаалт | ✕ нийтийн; Tax модуль `IReversalService`-ийг өөрийн нөхцөлөөр дуудна (НӨАТ-ын spec) |
| BANK_REC | `BANKREC`, `PAYMTRECON` | Банкны тулгалт | ✕ нийтийн; хуулгын undo (банкны spec) |
| — | `SALESAPPL`, `PURCHAPPL`, `UNAPPSALES`, `UNAPPPURCH` | Тулгалт, unapply (G/L-гүй run, §5.19) | ✕; unapply ([06](./06-sales-receivables.md) §5.14) |
| FX_REVAL | `EXCHRATADJ` | Ханшийн тэгшитгэл (R2) | ✕ нийтийн; Currency модуль (R2) |
| — | `FAGLJNL`, `DEPRECIATION` | ҮХ (R2) | ✕ нийтийн; FA модуль (R2) |
| INVENTORY | `INVTADJMT`, `ITEMJNL`; `PHYSINVJNL` (схемд алга — [11](./11-fixed-assets-inventory.md) SCR-INV-01, X-05) | Бараа (R2) | ✕ нийтийн; Inventory модуль |

---

## 4. Бизнесийн дүрмүүд

Дүрэм бүр тестлэгдэх бөгөөд "Шалгах" баганад хүлээн авах тест (§11.1) эсвэл golden scenario (§11.2)-ийг заав.

### 4.1 Ерөнхий

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-01 | Ledger (`gl`, `tax`, `party`, `bank`, `fa`, `inv`)-д бичих цорын ганц зам нь `IPostingService.PostAsync`. Engine зөвхөн `gl.gl_transaction`, `gl.gl_entry`, `gl.gl_register`-ийг өөрөө бичнэ. Бусад ledger-ийг зөвхөн бүртгэгдсэн `ILedgerWriter` бичнэ. Ledger хүснэгтийн `INSERT` SQL өөр газар байвал architecture test (`Ledger_tables_written_by_engine_only`) унана. | 02 §4.5, §5.4; D-K2; ADR-0009 #9 | AT-PST-001 |
| BR-PST-02 | Нэг `PostingDocument` = нэг DB transaction = нэг `gl_register` (posting run). `PostingVoucher` бүр = нэг `gl_transaction`. | R-GL-POSTING-26, R-GL-POSTING-28, R-GL-POSTING-31; D-C6 | AT-PST-002 |
| BR-PST-03 | Posting нь A үе (түгжээгүй угсралт ба шалгалт), B үе (нэг transaction, түгжээний дор дахин шалгалт ба бичилт), C үе (commit-ийн дараах үйлдэл, жишээ нь POS-ийн синхрон eBarimt)-тэй. B үед гадаад IO (HTTP, файл, S3) хийхгүй. | 02 §6.1, §6.3; ADR-0009 #4, #6 | AT-PST-003 |
| BR-PST-04 | Бүх шалгалтыг бичихээс өмнө хийж **бүх алдааг цуглуулж** нэг удаа буцаана. Алдаатай бол юу ч бичигдэхгүй, хуулийн дугаар зарцуулагдахгүй. | FR-GL-008 AC1; R-GL-POSTING-26; R-ACCOUNT-DETERMINATION-09 | AT-PST-004 |
| BR-PST-05 | G/L-ийн дүн нь LCY (MNT), тэмдэгтэй (Дт +, Кт −), `company_setup.amount_rounding_precision` (0.01 эсвэл 1)-ээр бөөрөнхийлөгдсөн, тэгээс ялгаатай. | D-C1, D-C2, D-C3; R-GL-POSTING-34 | AT-PST-005 |
| BR-PST-06 | `debit_amount`, `credit_amount`-ийг engine бичихгүй (generated). Storno ба сөрөг баганын утга байхгүй. | D-C3; R-GL-POSTING-36 (өөрчилсөн) | AT-PST-006 |
| BR-PST-07 | `global_dim_1/2_value_id` ба `created_at`-ийг engine бичихгүй (trigger). `created_by` нь `app.user_id`. | INV-29; 910 `fn_ledger_before_insert` | AT-PST-007 |
| BR-PST-08 | G/L entry posting group-ийн **кодын snapshot**-ийг (`gen_bus_posting_group` г.м.) хадгална. Дараа нь мастер өөрчлөгдсөн ч түүх хэвээр. | R-ACCOUNT-DETERMINATION-05; 020_gl.sql | GS-GL-003 |
| BR-PST-09 | Source code нь §3.7-ийн хаалттай жагсаалтаас процессоор тогтоогдоно. Хэрэглэгч сонгохгүй. Мэдэгдэхгүй код бол кодын алдаа (500). | R-DIMENSIONS-NOSERIES-AUDIT-37, R-DIMENSIONS-NOSERIES-AUDIT-38; FR-GL-020 | AT-PST-008 |

### 4.2 Мөрийн шалгалт (BC CU11-ийн дасгал)

Журналын мөрөнд бүрэн, баримтын модулийн `GlPostingLine`-д холбогдох хэсэг нь (BR-PST-13, -15, -16, -18, -20) хэрэгжинэ.

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-10 | Хоосон мөр алдаагүй алгасагдана: `account_id IS NULL AND amount = 0 AND (bal_account_id IS NULL OR system_created = false)` (BC `EmptyLine`). Батлагдсан журналын batch-аас хоосон мөр ч мөн устна (BC: batch бүхэлдээ цэвэрлэгдэнэ). | R-GL-POSTING-13, R-GL-POSTING-27 | AT-PST-010 |
| BR-PST-11 | `posting_date` ба `document_no` (ноорог дугаар) заавал. | R-GL-POSTING-17 | AT-PST-011 |
| BR-PST-12 | `account_id` эсвэл `bal_account_id`-ийн дор хаяж нэг заавал. Хоёр тал хоёулаа partner (`CUSTOMER`, `VENDOR`, `FIXED_ASSET`) байж болохгүй: дор хаяж нэг тал нь `GL_ACCOUNT` эсвэл `BANK_ACCOUNT`. | R-GL-POSTING-09; FR-GL-006 AC2 | AT-PST-012 |
| BR-PST-13 | `amount ≠ 0` (`Origin = UserEntered` мөрөнд). `amount` ба `amount_lcy` ижил тэмдэгтэй. Дүн нь валютын, `amount_lcy` нь LCY-ийн нарийвчлалаар бөөрөнхийлөгдсөн. | R-GL-POSTING-13, R-GL-POSTING-17, R-GL-POSTING-34; FR-GL-006 AC3 | AT-PST-013 |
| BR-PST-14 | `applies_to_doc_type`, `applies_to_doc_no`, `applies_to_id` нь зөвхөн `CUSTOMER`/`VENDOR` талтай мөрөнд байна. | R-GL-POSTING-17 | AT-PST-014 |
| BR-PST-15 | `GL_ACCOUNT` тал: `account_type = 'POSTING'`, `blocked = false`. `Origin = UserEntered` бол `direct_posting = true` заавал. `SystemDerived`/`SystemGenerated` мөр `direct_posting`-ийг алгасна. | R-GL-POSTING-01, R-GL-POSTING-07; R-ACCOUNT-DETERMINATION-22, R-ACCOUNT-DETERMINATION-34; FR-GL-003 | AT-PST-015 |
| BR-PST-16 | НӨАТ эсвэл gen бүлэгтэй `GL_ACCOUNT` тал `gen_posting_type ∈ {SALE, PURCHASE}` заавал. `CUSTOMER`/`VENDOR`/`BANK_ACCOUNT` тал `gen_posting_type = 'NONE'`, бүлэггүй. Автомат НӨАТ бол `vat_amount + vat_base_amount = amount` (LCY-д ч). | R-GL-POSTING-14; R-ACCOUNT-DETERMINATION-31; R-VAT-17 | AT-PST-016 |
| BR-PST-17 | `is_closing = true` ваучерыг зөвхөн жилийн хаалтын үйлчилгээ (source `CLSINCOME`) үүсгэнэ: огноо 12-31, бүх мөр `GL_ACCOUNT`. Source code нь `CLSINCOME` template-ийн batch-ийг журналын API-аар батлахгүй. | R-GL-POSTING-19, R-GL-POSTING-37; D-D4 | AT-PST-017 |
| BR-PST-18 | Огноо: тухайн өдрийн `accounting_period` ба `fiscal_year` `OPEN` (хаалтын ваучерт `LOCKED` биш); компанийн `allow_posting_from/to` дотор (Owner-т ч); R2-т хэрэглэгчийн цонх дотор (нарийсгана, өргөсгөхгүй). НӨАТ-ын огноог Tax writer шалгана (нээлттэй НӨАТ-ын үе). | D-D3, D-E9; R-GL-POSTING-18; R-PERIODS-REPORTING-08, R-PERIODS-REPORTING-11; 13 §8.2; FR-GL-023, FR-GL-024 AC1 | AT-PST-018 |
| BR-PST-19 | R1-д идэвхгүй: `account_type = 'FIXED_ASSET'` эсвэл `fa_posting_type` бөглөгдсөн мөр, `currency_code IS NOT NULL` мөр, `journal_template.recurring = true`. | DECISIONS §H | AT-PST-019 |
| BR-PST-20 | Шалтгааны код: source `REVERSAL` эсвэл `document_type = 'CREDIT_MEMO'` ваучерт заавал. Шалтгаан блоклогдоогүй. Журналд `journal_line.reason_code_id ?? journal_batch.reason_code_id`. | FR-GL-020 AC2; R-DIMENSIONS-NOSERIES-AUDIT-39 | AT-PST-020 |

### 4.3 Ваучер ба тэнцэл

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-21 | Журналын мөрүүд (`document_no`, `posting_date`)-ээр ваучер болно. Ваучер дотор мөр бүр өөрийн `document_type`-тэй байж болно; `gl_transaction.document_type` нь бүх мөр ижил бол тэр төрөл, эс бөгөөс `NONE`. Нэг ноорог дугаартай боловч өөр огноотой мөрүүд тусдаа ваучер болж, тус бүр тэнцэнэ. | R-GL-POSTING-21; 14 API-ACT-07; bc-gl-posting.md §8 | AT-PST-021 |
| BR-PST-22 | Ваучер бүрд: (а) мөрийн түвшинд Σ `Balance (LCY)` = 0 (данс ба харьцсан данстай мөр 0, зөвхөн дансны мөр `+amount_lcy`, зөвхөн харьцсан дансны мөр `−amount_lcy`); (б) задарсан G/L мөрийн Σ `Amount` = 0. Хүлцэл (tolerance) байхгүй, автомат "round-off" мөр үүсгэхгүй. | D-C5; R-GL-POSTING-11, R-GL-POSTING-21, R-GL-POSTING-22, R-GL-POSTING-35; 02 §8.4 | AT-PST-022 |
| BR-PST-23 | НӨАТ-тай мөртэй ваучерт харилцагч/нийлүүлэгч нэгээс олон байхгүй. | R-GL-POSTING-24; 02 §6.2 #5 | AT-PST-023 |
| BR-PST-24 | Ваучер ≥ 2 тэг биш G/L мөртэй. Дүн ба НӨАТ нь 0 болсон buffer мөр G/L entry үүсгэхгүй. НӨАТ = 0 мөр VAT G/L entry үүсгэхгүй, харин суурь ≠ 0 бол VAT entry үүснэ (ТТ-03а-ийн 0 %, чөлөөлөгдөх, хамрах хүрээнээс гадуурх мөрт). | R-ACCOUNT-DETERMINATION-08; bc-account-determination.md §8 #11 | AT-PST-024 |
| BR-PST-25 | Insert хийхээс өмнө engine санах ойд дахин шалгана (self-check): ваучер бүрийн Σ = 0, мөр бүр бөөрөнхий, **мөр бүр `Amount ≠ 0`** (0 дүнтэй `GlPostingLine`-ийг assembler шүүх ёстой; BR-PST-24), `GlPostingLine.Key` ба `PostingVoucher.Key` run дотор давтагдахгүй, `ISubledgerLine.GlLineKeys` бүгд олдоно. Зөрвөл энэ нь assembler-ийн кодын алдаа: `500 api.internal_error`, P1 alert. DB-ийн deferred trigger нь хоёр дахь хамгаалалт. | ADR-0009 #8; NFR-001 | AT-PST-025 |

### 4.4 Дугаарлалт

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-26 | Ваучерын хуулийн дугаарыг B үед, бүх шалгалтын дараа, insert-ээс өмнө `platform.fn_next_document_no(series, posting_date)`-ээр олгоно. Gapless цувралд гараар дугаар оруулахгүй. Rollback бол дугаар буцна (завсаргүй). BR-PST-04-ийн дагуу `CheckLockedAsync` нь цувралын мөр (ERN01), огнооны дараалал (ERN02), дуусалт (ERN03)-ыг дугаар олгохоос **өмнө** уншиж бусад алдаатай хамт буцаана (§5.3 query 5); бүх олголт компанийн advisory lock-ийн дор явдаг тул уншсан төлөв олголт хүртэл өөрчлөгдөхгүй. | D-C7; ADR-0008; R-DIMENSIONS-NOSERIES-AUDIT-29, R-DIMENSIONS-NOSERIES-AUDIT-34; FR-PLT-008 AC1, AC2 | AT-PST-026, GS-GL-015 |
| BR-PST-27 | Олон ваучертай run-д дугаарыг (`posting_date` ASC, ноорог `document_no` ASC, эхний `line_no` ASC) дарааллаар олгоно (`date_order`-д нийцэх). Ижил ноорог дугаартай ваучерын бүх мөр нэг хуулийн дугаар авна. Хариунд ноорог ↔ хуулийн дугаарын харгалзаа (`vouchers[]`). | R-GL-POSTING-25; 14 API-ACT-07; 15 UX-JNL-08 | AT-PST-027 |
| BR-PST-28 | `gl_register.no`, `transaction_no`, `entry_no`-г `platform.fn_next_entry_no(ledger, n)`-ээр **блокоор**, тогтмол дарааллаар олгоно: `GL_REGISTER` → `GL_TRANSACTION` → `GL_ENTRY` → writer-ийн ledger (§4.7-ийн дараалал). Компани дотор завсаргүй, дараалсан. IDENTITY эсвэл sequence ашиглахгүй. | D-C6, D-C8, D-K3; R-GL-POSTING-28 | AT-PST-028 |
| BR-PST-29 | Run-ий `transaction_no`-г `Vouchers`-ийн дарааллаар (BR-PST-27), `entry_no`-г ваучер дотор `GlLines`-ийн дарааллаар ононо. Entry-ийн дараалал нягтлан бодох утгагүй; тест нь entry-г олонлогоор харьцуулна (`entry_no`-ийн тасралтгүй байдлаас бусад). | R-ACCOUNT-DETERMINATION-33; R-GL-POSTING-32 (SKIP) | GS-GL-003 |
| BR-PST-30 | Буцаалтын ваучер шинэ хуулийн дугаар авахгүй: эх ваучерын `document_type`, `document_no`-г хадгална (BC, `VoucherNumbering.Existing`). Ялгах түлхүүр нь `transaction_no`, `source_code = 'REVERSAL'`, `reverses_transaction_no`. ⚠ OQ-PST-02. Нэг run-ий дараагийн ваучер өмнөх ваучерын олгосон дугаарыг авах бол (бэлэн борлуулалтын төлбөрийн ваучер, BC R-SALES-DOCUMENTS-37) `VoucherNumbering.SameAsVoucher(key)` ашиглана; заасан ваучер `Vouchers`-т өмнө нь байх ёстой (эс бөгөөс кодын алдаа 500). | R-GL-POSTING-40; R-SALES-DOCUMENTS-37 | AT-PST-047, AT-PST-076 |

### 4.5 Dimension

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-31 | Мөр бүр `dimension_set_id`-тэй (0 = хоосон). Set-ийг `gl.fn_get_dimension_set_id(value_ids[])`-ээр олно/үүсгэнэ: ижил хослол → ижил id, дараалал хамаарахгүй. Ноорогт хадгалагдсан set (`journal_line.dimension_set_id`, `sales_line.dimension_set_id` г.м.)-ийг шууд ашиглана. | D-D2; R-DIMENSIONS-NOSERIES-AUDIT-07, R-DIMENSIONS-NOSERIES-AUDIT-08, R-DIMENSIONS-NOSERIES-AUDIT-10; INV-10; FR-GL-018 AC2 | AT-PST-031 |
| BR-PST-32 | Баримтад: авлага/өглөгийн мөр **header**-ийн set, орлого/зардал/НӨАТ-ын мөр **мөрийн** set. Журналд: дансны тал, харьцсан дансны тал ба гарал үүслийн данс (НӨАТ, хяналтын данс) бүгд журналын мөрийн set. | R-DIMENSIONS-NOSERIES-AUDIT-25; FR-GL-018 AC1 | GS-GL-014 |
| BR-PST-33 | Posting-ийн үед set-ийн утга бүр: dimension блоклогдоогүй, утга блоклогдоогүй, `value_type = 'STANDARD'` (ноорогт хадгалсан set ч дахин шалгагдана). Үл хамаарах: `SystemGenerated` мөр (буцаалт нь эх entry-ийн түүхэн set-ийг давтана; хаалтын мөр set 0) — эс бөгөөс дараа нь блоклосон утгатай гүйлгээг буцаах боломжгүй болно. | R-DIMENSIONS-NOSERIES-AUDIT-05, R-DIMENSIONS-NOSERIES-AUDIT-18 | AT-PST-033 |
| BR-PST-34 | `gl.default_dimension`-ийн `value_posting` (`CODE_MANDATORY`, `SAME_CODE`, `NO_CODE`) дүрэм хуримтлагдана: тухайн мөрийн (`entity_id`) ба хүснэгтийн түвшний (`entity_id IS NULL`) дүрэм хоёулаа хэрэгжинэ. Шалгах эх сурвалж: G/L мөрийн данс (`GL_ACCOUNT`, гарал үүслийн данс орно), мөрийн харилцагч/нийлүүлэгч/мөнгөний данс (`CUSTOMER`, `VENDOR`, `BANK_ACCOUNT`). `Amount = 0` мөрийг алгасна. `SystemGenerated` мөр (хаалт, буцаалт) алгасна. UI нь R2, engine R1-д мөрдөнө. | R-DIMENSIONS-NOSERIES-AUDIT-12, R-DIMENSIONS-NOSERIES-AUDIT-13, R-DIMENSIONS-NOSERIES-AUDIT-19, R-DIMENSIONS-NOSERIES-AUDIT-20; R-PERIODS-REPORTING-20; FR-GL-019 AC1 | AT-PST-034 |
| BR-PST-35 | Posting transaction дотор шинээр үүссэн set-ийн id-г зөвхөн COMMIT-ийн дараа кэшлэнэ. Preview эсвэл rollback-ийн set кэшид орохгүй. | ADR-0010 #2 | AT-PST-035 |

### 4.6 НӨАТ-ын hook

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-36 | НӨАТ-тай buffer/журналын мөр бүр: (1) суурь G/L мөр (`Amount` = цэвэр + хасагдахгүй НӨАТ, `VatAmount` = бүтэн НӨАТ), (2) хасагдах НӨАТ `D ≠ 0` бол VAT G/L мөр (`vat_posting_setup`-ийн борлуулалт/худалдан авалтын данс; худалдан авалтын урвуу тооцоонд 1300 `+D` ба 2305 `−VAT`; борлуулалтын урвуу тооцоо ба `FULL_VAT`-д тусдаа мөргүй — §5.7.2), (3) нэг `VatLedgerLine` (суурь G/L мөрийн key-тэй). Tax writer `tax.vat_entry` (`gl_entry_no` = суурь entry) ба `tax.gl_entry_vat_entry_link` (суурь entry ↔ VAT entry)-ийг бичнэ. | R-GL-POSTING-33; R-VAT-18, R-VAT-20, R-VAT-21; R-ACCOUNT-DETERMINATION-08, R-ACCOUNT-DETERMINATION-22; FR-TAX-007 | GS-GL-003 |
| BR-PST-37 | `gl_register.from_vat_entry_no/to_vat_entry_no` = энэ run-д Tax writer-ийн нөөцөлсөн `VAT_ENTRY` муж; НӨАТ байхгүй бол NULL. | R-GL-POSTING-28, R-GL-POSTING-31 | AT-PST-037 |
| BR-PST-38 | Журналын НӨАТ зөвхөн мөрөнд `gen_posting_type ∈ {SALE, PURCHASE}` ба хоёр VAT бүлэг тодорхой заагдсан үед (seed-ийн данснууд `NONE`). Тооцоо нь gross арга (§6.4). `vat_difference ≠ 0` бол `journal_template.allow_vat_difference = true` ба `abs(vat_difference) ≤ general_ledger_setup.max_vat_difference_allowed`. Хасагдах эсэхийг (D-E4) Tax шийднэ. ⚠ OQ-PST-05 | R-VAT-16, R-VAT-17; D-E3, D-E4 | GS-GL-002 |

### 4.7 Дэд дэвтэр (`ILedgerWriter`)

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-39 | Writer бүр `ValidateLockedAsync` (түгжээний дор, бүх алдаа) ба `WriteAsync`-тай. Writer-ийн мөр бүр ваучерын `transaction_no`, `posting_date`, `gl_register_no`-г авна (DB шалгана). Writer өөр модулийн хүснэгтэд SQL-ээр хандахгүй. | 02 §4.5; INV-05 | AT-PST-039 |
| BR-PST-40 | Дараалал тогтмол: G/L (engine) → `VAT_ENTRY` (10) → `CITY_TAX_ENTRY` (15, R2) → харилцагч (20) → нийлүүлэгч (30) → банк/касс (40) → ҮХ (50, R2) → бараа (60, R2) → ханш (70, R2) → `IPostedDocumentWriter` → outbox → `gl_register` → posting log. | ADR-0009 #4 | AT-PST-040 |
| BR-PST-41 | `ISubledgerLine` бүр ≥ 1 `GlLineKey`-тэй. Engine key-г `entry_no` руу хөрвүүлж writer-т өгнө. Олдохгүй key эсвэл writer-гүй ledger код нь кодын алдаа (500). | 02 §4.5 | AT-PST-041 |
| BR-PST-42 | Харилцагч, нийлүүлэгч, мөнгөний дансны хяналтын данс (1200, 2100, 1100, 1110…)-ыг posting group-ээс тодорхойлж `SystemDerived` G/L мөр болгоно. Дэд дэвтрийн нийлбэр = хяналтын дансны үлдэгдэл (шөнийн шалгалт). | R-ACCOUNT-DETERMINATION-06, R-ACCOUNT-DETERMINATION-07; R-BANK-CASH-02, R-BANK-CASH-06; INV-11; NFR-005 | GS-GL-005 |

### 4.8 Register

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-43 | `gl_register` run бүрд нэг мөр, хамгийн сүүлд INSERT: `no`, `from_entry_no` = min, `to_entry_no` = max, `from/to_vat_entry_no`, `source_code`, `journal_template_code`, `journal_batch_code`, `request_id`. Append-only, зөвхөн `reversed` өөрчлөгдөнө. | R-GL-POSTING-28, R-GL-POSTING-31; D-C4; FR-GL-009 AC1 | AT-PST-043 |
| BR-PST-44 | Hash chain (FR-GL-028): CR-15-ийн багана нэмэгдсэний дараа engine register-ийн hash-ийг advisory lock-ийн дор тооцож бичнэ (§5.9). Тэр хүртэл шөнийн шалгалт Σ = 0 ба дугаарын тасралтгүй байдлыг шалгана. | 02 §8.7; 13 Z6, CR-15 | AT-PST-044 (CR-15-ийн дараа) |

### 4.9 Буцаалт ба залруулга

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-45 | Нийтийн `:reverse` зөвхөн §3.7-д "✔" тэмдэгтэй source code-той, буцаагдаагүй (`reversed_by_transaction_no IS NULL`), өөрөө буцаалт биш (`reverses_transaction_no IS NULL`) гүйлгээнд ажиллана. `SALES`, `PURCHASES` → `gl.reversal_use_credit_memo`; бусад → `gl.reversal_not_reversible`. | D-D5; R-GL-POSTING-38, R-GL-POSTING-39; R-DIMENSIONS-NOSERIES-AUDIT-38; FR-GL-013 AC2 | AT-PST-045 |
| BR-PST-46 | Нөхцөл (бүгдийг цуглуулна): эх огнооны үе `OPEN` ба цонх дотор; G/L данс блоклогдоогүй; харилцагч/нийлүүлэгчийн entry-д `INITIAL`-аас бусад, unapply хийгдээгүй detailed мөр байхгүй; банкны entry `open`, хуулгад ороогүй (`statement_no IS NULL`); VAT entry `closed = false` ба НӨАТ-ын огнооны үе `OPEN`; буцаалтын дараа касс сөрөг болохгүй. | R-GL-POSTING-39; R-VAT-24; R-SUBLEDGERS-APPLICATION-32; R-BANK-CASH-39; D-G1; FR-GL-013 AC3 | AT-PST-046 |
| BR-PST-47 | Буцаалт: шинэ register (`source_code = 'REVERSAL'`); эх гүйлгээ бүрд нэг шинэ гүйлгээ (эх `posting_date`, `document_type`, `document_no`, `is_closing`; `reverses_transaction_no`; шалтгааны код). Entry-г `entry_no` буурах дарааллаар толин тусгал болгоно: `amount`, `vat_amount`, `source_currency_amount` эсрэг тэмдэгтэй, тиймээс **эсрэг баганад** орно (storno-гүй). Шинэ entry: `reversed = true`, `reversed_entry_no`. Эх entry: `fn_ledger_update` → `reversed = true`, `reversed_by_entry_no`. Эх гүйлгээ: `reversed_by_transaction_no`. | R-GL-POSTING-40; D-C3; INV-22, INV-30; FR-GL-010 AC1, FR-GL-013 AC1 | GS-GL-006 |
| BR-PST-48 | Register-ийн буцаалт: эх register-ийн бүх гүйлгээ BR-PST-45, -46-г хангана. Эх гүйлгээ бүрд (`transaction_no` буурах дарааллаар) тусдаа шинэ гүйлгээ үүснэ (BC нэг гүйлгээ үүсгэдэг; бидэнд огноо тус бүрийн тэнцэл ба нэг `posting_date` шаардлагатай). Эх register-ийн `reversed = true` нь түүний бүх гүйлгээ буцаагдсан үед (register эсвэл гүйлгээ тус бүрээр). BC-ийн "`To Entry No.` таарвал register-ийг тэмдэглэх" heuristic-ийг хуулахгүй. | R-GL-POSTING-38, R-GL-POSTING-40; FR-GL-015 AC1 | GS-GL-007 |
| BR-PST-49 | Дэд дэвтэр ба НӨАТ-ыг writer-ийн `ReverseAsync` толин тусгалаар бичнэ. VAT entry нь эх суурь entry-ийн холбоосоор олдож, шинэ VAT entry нь шинэ (толин тусгал) суурь entry-тэй холбогдоно. Буцаалтын дараа эх ба толин тусгал дэд дэвтрийн entry хоёулаа хаагдсан (`remaining = 0`, `open = false`). | R-GL-POSTING-40; R-VAT-20; R-BANK-CASH-39 | GS-GL-006 |
| BR-PST-50 | Буцаалтыг дахин буцаахгүй; нэг гүйлгээг нэг л удаа буцаана (`ux_gl_transaction__reverses`). Зэрэг хоёр хүсэлтийн хоёр дахь нь `409 gl.transaction_already_reversed`. | INV-22; R-GL-POSTING-39 | AT-PST-050 |
| BR-PST-51 | Эх огноонд posting хийх боломжгүй бол (үе эсвэл жил `OPEN` биш, эсвэл огноо компанийн `allow_posting_from/to`-оос гадуур — `CheckPostingDateAsync(t.PostingDate, false)` алдаа өгөх) буцаалтын оронд **залруулах журналын ноорог** (санал): одоогийн нээлттэй огноо, эсрэг тэмдэгтэй мөр, шалтгаан заавал. Автоматаар батлахгүй. Эх огноонд posting боломжтой бол санал өгөхгүй (`gl.correction_use_reversal`). | D-D5; FR-GL-014 AC1; 13 SEC-POST-09 | GS-GL-012, AT-PST-075 |

### 4.10 Preview

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-52 | Preview нь Post-той ижил код замаар явна (A + B: түгжээ, дугаар, writer, posted document writer, outbox, register). Төгсгөлд `SET CONSTRAINTS ALL IMMEDIATE`, дараа нь ROLLBACK. Idempotency, posting log, C үе, кэш хийхгүй. Хариунд хуулийн дугаар `***`, `transaction_no`/`entry_no` нь харьцангуй (1..n), register-ийн дугаар нуугдана. | D-C6; R-GL-POSTING-42; 14 API-ACT-09..12; FR-GL-011 AC1 | AT-PST-052 |
| BR-PST-53 | Preview-ийн алдаа = Post-ийн алдаа (ижил код, HTTP). Preview-ийн entry = Post-ийн entry (дугаараас бусад). | 14 API-ACT-11; ADR-0009 #7 | GS-GL-013 |

### 4.11 Жилийн хаалт

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-54 | Нөхцөл: санхүүгийн жил `LOCKED` биш; жилийн аль ч сар `OPEN` биш (`CLOSED` эсвэл `LOCKED`), 12-р сар `LOCKED` биш (хаалтын ваучер 12-31-нд бичигдэнэ); өмнөх санхүүгийн жил (Y−1) бичилттэй бол `CLOSED` эсвэл `LOCKED` (жилийг дарааллаар хаана, R-PERIODS-REPORTING-05; `gl.year_close_previous_year_open`); `current_year_result_account_id` (3500) тохируулсан, `POSTING`, `BALANCE_SHEET`, `EQUITY` (эсвэл хоосон) ангилалтай, блоклогдоогүй; Y-12-31 компанийн цонх дотор; орлогын тайлангийн бичилттэй данс бүр блоклогдоогүй. | D-D4; R-PERIODS-REPORTING-05, R-PERIODS-REPORTING-13, R-PERIODS-REPORTING-16, R-PERIODS-REPORTING-19; FR-GL-026 | AT-PST-054, AT-PST-078 |
| BR-PST-55 | Дүн: `income_balance = 'INCOME_STATEMENT'` данс бүрийн `net = Σ amount` (Y-01-01..Y-12-31, **хаалтын бичилт орно**). Мөр = `−net` (0 бол алгасна). 3500-ийн мөр = `Σ net`. Dimension-гүй (set 0), данс бүрд нэг мөр. Тооцоог advisory lock-ийн дор хийнэ. | R-GL-POSTING-05; R-PERIODS-REPORTING-17, R-PERIODS-REPORTING-18; bc-periods-reporting.md §5.6 | GS-GL-008 |
| BR-PST-56 | Ваучер: `CL` цуврал (template CLOSING / batch YEAR_END), огноо Y-12-31, `is_closing = true`, source `CLSINCOME`, `document_type = 'NONE'`, `SystemGenerated` мөр. Дахин ажиллуулахад зөвхөн зөрүү бичигдэнэ; зөрүү 0 бол ваучер, дугаар, `gl_register`, `posting_log` үүсэхгүй (идемпотент), **гэхдээ** BR-PST-57-ийн жилийн төлөв ба BR-PST-58-ийн шилжүүлгийн санал мөн адил шинэчлэгдэнэ (§5.13 "No-op хаалт"). | FR-GL-026 AC1, AC2; R-PERIODS-REPORTING-17 | GS-GL-009, AT-PST-073 |
| BR-PST-57 | Амжилттай бол (ваучер бичигдсэн эсэхээс үл хамааран) `fiscal_year.status = 'CLOSED'`, `closed_at`, `closed_by`; ваучер бичигдсэн бол `closing_transaction_no` = энэ хаалтын гүйлгээ (no-op үед хуучин утга хэвээр, бичилтгүй жилд NULL). Бүх хаалтын гүйлгээг `gl_transaction.is_closing AND posting_date = Y-12-31`-ээр олно. Жил `CLOSED` боловч сар нь дахин нээгдсэн бол (13 SEC-POST-04 жилийг `OPEN` болгоно) хаалтыг дахин ажиллуулна. | D-D4; 13 SEC-POST-04, SEC-POST-11 | AT-PST-057, AT-PST-073 |
| BR-PST-58 | Сонголтоор (анхдагч асаалттай) (Y+1)-01-01-ний огноотой 3500 → 3400 шилжүүлгийн **журналын ноорог** (GENERAL/DEFAULT) үүсгэнэ. Дүн = 3500-ийн (Y+1)-01-01 хүртэлх (тэр өдөр орно) үлдэгдэл: Y-ийн хаалтын бичилт ба аль хэдийн батлагдсан 01-01-ний шилжүүлэг орно, тиймээс дахин ажиллуулахад зөвхөн зөрүү санал болгоно. Өмнөх батлагдаагүй саналын мөрийг (`comment` нь яг `{"kind":"RE_TRANSFER","year":Y}` тэмдэгт мөр — engine ингэж каноник хэлбэрээр бичиж, тэнцүүгээр хайна; JSON parse хийхгүй) устгаад шинээр үүсгэнэ. Дүн 0 бол ноорог үүсэхгүй. Хэрэглэгч засах, устгах, батлах эрхтэй. Санхүүгийн жил Y+1 байхгүй бол ноорог үүсэхгүй, анхааруулга `W-04`; GENERAL/DEFAULT batch байхгүй бол `W-06`. Batch-ийг `LockSourceAsync`-д (дугаар олгохоос өмнө) `FOR UPDATE` түгжиж, `row_version`-ийг нэмнэ (нээлттэй журналын ETag хүчингүй болно). `GJ` цуврал `date_order = true` (seed) үед Y+1-д 01-01-ээс хойш огноотой `GJ` ваучер аль хэдийн батлагдсан бол энэ ноорогийг батлахад `ERN02` гарна — CR-PST-03 / ⚠ OQ-PST-03 шийдэгдэх хүртэл хэрэглэгч ноорогийн огноог өөрчлөхгүйгээр батлах боломжгүй тул шилжүүлгийг Y+1-ийн анхны `GJ` ваучерын өмнө хийхийг UI зөвлөнө. | D-D4; FR-GL-026 AC3 | GS-GL-010 |
| BR-PST-59 | Хаалтын мөр `SystemGenerated`: `direct_posting` ба dimension value posting-ийн шалгалтгүй. | R-GL-POSTING-07; R-PERIODS-REPORTING-20 | GS-GL-008 |

### 4.12 Зэрэг ажиллагаа ба idempotency

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-60 | B үеийн эхэнд `platform.fn_lock_company_posting(tenant, company)`. Posting, буцаалт, жилийн хаалт, үеийн төлөвийн өөрчлөлт, НӨАТ-ын хаалт, R2-т элэгдэл, ханшийн тэгшитгэл, өртгийн дахин тооцоо бүгд энэ түгжээг авна. `lock_timeout = 5s`, `statement_timeout = 30s` (жилийн хаалт ба эхний үлдэгдлийн импортод 120s). | D-C6; ADR-0009 #2, #3, #5; 13 SEC-POST-10 | AT-PST-060 |
| BR-PST-61 | Түгжээ авах дараалал (deadlock 0): idempotency мөр → advisory lock → эх ноорог `FOR UPDATE` (журналын batch, жилийн хаалтын `fiscal_year` ба шилжүүлгийн batch) → дугаарын цуврал (`number_series_line`, `number_series_counter`) → `ledger_counter` (BR-PST-28-ийн дараалал) → ledger мөрийн `fn_ledger_update`. Дугаарын цуврал ба counter нь компанийн хүрээнийх бөгөөд тэдгээрийг зөвхөн тухайн компанийн advisory lock-ийн дор түгжинэ; тиймээс writer өөрийн баримтын дугаарыг (МХ-1/МХ-2, 09 BR-BNK-21) `WriteAsync` дотор олгож болно. Advisory lock-гүйгээр ноорог засварлах үйлдэл (журналын мөр нэмэх) `journal_batch FOR UPDATE` → `JNL_DRAFT` дарааллыг баримтална. | NFR-016; 02 §13 | AT-PST-061 |
| BR-PST-62 | Post команд `Idempotency-Key`-тэй. **Шат 0** (14 API-IDEM-12): A үеэс өмнө түгжээгүй уншиж `COMPLETED` мөр олдвол hash ижил → хадгалсан хариу (`Idempotent-Replayed: true`), өөр → `422 api.idempotency_key_reused`; handler ажиллахгүй. Түлхүүрийн мөр бизнесийн бичилттэй нэг transaction-д (`INSERT … ON CONFLICT`). Бизнесийн алдаа → rollback, түлхүүр хадгалагдахгүй. `request_hash` = 14 API-IDEM-03. Байгалийн idempotency: ноорог устсан → `409 api.document_already_posted`; журнал хоосон → `422 gl.journal_empty`; буцаагдсан → `409 gl.transaction_already_reversed`; хаалтын зөрүү 0 → no-op (жилийн төлөвийг л шинэчилнэ, BR-PST-56). | D-I1; 02 §8.5; 14 API-IDEM-01..12; NFR-004; TA-09 | AT-PST-062, AT-PST-074 |
| BR-PST-63 | Advisory lock-ийн `lock_timeout` → `503 api.lock_timeout` + `Retry-After: 2` (клиент ижил түлхүүрээр давтана). Idempotency мөрийн unique индекс дээрх хүлээлтийн `lock_timeout` → `409 api.idempotency_in_progress` + `Retry-After: 1` (14 API-IDEM-07). `40001`/`40P01` → сервер нэг удаа автоматаар давтана. Commit-ийн үеэр холболт тасарвал клиент ижил түлхүүрээр давтана. | 02 §6.10; 14 §9.6, API-ACT-05, API-IDEM-07 | AT-PST-063 |

### 4.13 Гүйцэтгэл ба хязгаар

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-64 | Нэг run-д ≤ 20 000 G/L entry ба ≤ 5 000 ваучер; хэтэрвэл `422 gl.posting_too_large`. Баримтын мөрийн хязгаар (≤ 1 000) нь эх модулийнх (`api.too_many_lines`). | ADR-0009 (эрсдэл); NFR-011 | AT-PST-064 |
| BR-PST-65 | Хүснэгт бүрд ≤ 1 000 мөр бол `INSERT … SELECT … FROM unnest(@arrays)` (нэг statement), > 1 000 бол binary `COPY`. Round trip-ийг `NpgsqlBatch`-аар багцална. | TA-05; 02 §13 | AT-PST-065 (perf) |
| BR-PST-66 | SLO: ≤ 50 мөрт B үеийн түгжээ барих хугацаа p95 ≤ 150 ms; журналын ваучер (≤ 20 мөр) p95 ≤ 200 ms; нэхэмжлэх (≤ 50 мөр) p95 ≤ 300 ms; advisory lock хүлээх p95 ≤ 100 ms. | NFR-010, NFR-012, NFR-016; 02 §13 | Ачааллын тест |

### 4.14 Аудит ба лог

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-67 | Амжилттай Post бүр `audit.posting_log` (`status = 'SUCCEEDED'`, `transaction_no` = эхний, `gl_register_no`, `document_no` = эхний ваучерынх)-ийг ижил transaction-д бичнэ. Бүтэлгүй Post бүр `FAILED` мөрийг **тусдаа** transaction-д (`error_code`, PII-гүй `error_message`): handler эхэлсний дараах (A үе, B үе, COMMIT-ийн deferred алдаа орно) 409/412/422/500/503 бүр; 400/401/403/404 (handler-ээс өмнө), Шат 0-ийн replay, preview, no-op (зөрүү 0 хаалт) бичигдэхгүй. | 13 §9.5, AT-SEC-053; 140 `audit.posting_log` | AT-PST-067 |
| BR-PST-68 | Outbox: `PostingDocument.Outbox` ба GL event (§9.1) нэг transaction-д. Handler бүртгэгдээгүй topic-ийг бичихгүй. `qrData`/`lottery` агуулахгүй (CHECK). | ADR-0012; D-J3 | AT-PST-068 |

### 4.15 G/L-гүй дэд дэвтрийн run (тулгалт, unapply)

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-PST-69 | Батлагдсан entry хоорондын тулгалт ба unapply нь `IPostingService.RunSubledgerOnlyAsync`-ээр явна: Post-той ижил transaction, advisory lock, timeout, Idempotency-Key; G/L entry, `gl_transaction`, `gl_register`, хуулийн дугаар **үүсэхгүй**. Detailed мөр `transaction_no = NULL`, `application_no` (counter `APPLICATION_NO`). Source code нь `SALESAPPL`, `PURCHAPPL`, `UNAPPSALES`, `UNAPPPURCH`-ийн нэг; бусад код → кодын алдаа (500). | R-SUBLEDGERS-APPLICATION-08; 060_party.sql (`transaction_no` NULL); 06-sales-receivables §5.13.3, §5.14 | AT-PST-069 |
| BR-PST-70 | G/L-гүй run-ий огноо (`posting_date`) нь Post-той ижил дүрмээр шалгагдана (`ISubledgerRunContext.AssertPostingDateAsync` → `gl.period_closed`, `gl.period_locked`, `gl.posting_date_outside_window`); DB-ийн `ERP01` хоёр дахь хамгаалалт. | INV-06; FR-PTY-013 AC1 | AT-PST-070 |
| BR-PST-71 | G/L-д нөлөөлөх тулгалт (R2: ханшийн зөрүү, `APPL_ROUNDING`, хөнгөлөлт) энэ замаар явахгүй: эх модуль ваучертай `PostingDocument` угсарч `PostAsync`-аар батална (source `SALESAPPL`/`PURCHAPPL`, `gl_register` үүснэ). R1-д (MNT, хөнгөлөлтгүй) тулгалт үргэлж G/L-гүй. | R-SUBLEDGERS-APPLICATION-08; DECISIONS §H | AT-PST-071 |
| BR-PST-72 | G/L-гүй run амжилттай бол `audit.posting_log` (`posting_type = 'APPLICATION'`/`'UNAPPLICATION'`, `gl_register_no = NULL`, `source_no` = `application_no`)-г ижил transaction-д; бүтэлгүй бол BR-PST-67-той ижил `FAILED` мөр. Preview горим R1-д байхгүй. | 140 `audit.posting_log` CHECK | AT-PST-072 |

---

## 5. Процесс ба алгоритм

### 5.1 Гэрээ (`Erp.GeneralLedger.Contracts.Posting`)

GL нь гэрээг тодорхойлно; бусад модуль хэрэгжүүлнэ (dependency inversion, [02](./02-architecture.md) §4.3 дүрэм 3). GL нь Tax, Parties, CashBank-ийг мэдэхгүй.

```csharp
namespace Erp.GeneralLedger.Contracts.Posting;

public enum PostingMode { Post, Preview }

public enum LineOrigin
{
    UserEntered,     // хэрэглэгч шууд сонгосон данс: direct_posting ба dimension дүрэм шалгана (BR-PST-15, -34)
    SystemDerived,   // тохиргооноос гарсан данс (авлага, НӨАТ, банк, General Posting Setup-ийн орлого): direct_posting алгасна
    SystemGenerated  // хаалт, буцаалт: direct_posting ба dimension value posting алгасна
}

public static class LedgerCodes   // platform.ledger_counter.ledger (§3.3)
{
    public const string GlRegister = "GL_REGISTER", GlTransaction = "GL_TRANSACTION", GlEntry = "GL_ENTRY",
        VatEntry = "VAT_ENTRY", CityTaxEntry = "CITY_TAX_ENTRY",
        CustLedgerEntry = "CUST_LEDGER_ENTRY", DetailedCustLedgerEntry = "DETAILED_CUST_LEDGER_ENTRY",
        VendorLedgerEntry = "VENDOR_LEDGER_ENTRY", DetailedVendorLedgerEntry = "DETAILED_VENDOR_LEDGER_ENTRY",
        ApplicationNo = "APPLICATION_NO", BankLedgerEntry = "BANK_LEDGER_ENTRY",
        FaLedgerEntry = "FA_LEDGER_ENTRY", ItemLedgerEntry = "ITEM_LEDGER_ENTRY", ValueEntry = "VALUE_ENTRY",
        ItemApplicationEntry = "ITEM_APPLICATION_ENTRY", FaDepreciationRun = "FA_DEPRECIATION_RUN",   // R2 (11 X-04)
        ExchRateAdjmtRegister = "EXCH_RATE_ADJMT_REGISTER", ExchRateAdjmtLedgerEntry = "EXCH_RATE_ADJMT_LEDGER_ENTRY"; // R2
}

// ---------- Оролт ----------
public sealed record PostingDocument
{
    public required PostingRun Run { get; init; }
    public required IReadOnlyList<PostingVoucher> Vouchers { get; init; }      // 1..5 000 (BR-PST-64)
    public IPostedDocumentWriter? PostedDocument { get; init; }                 // эх модулийн posted баримт (журналд: JournalBatchWriter)
    public IReadOnlyList<OutboxMessageDraft> Outbox { get; init; } = [];        // SalesInvoicePosted г.м.
    public IReadOnlyList<PostingWarning> Warnings { get; init; } = [];          // W-01 (D-D1) г.м., хариунд дамжина
}

public sealed record PostingRun(
    string SourceCode,            // gl_register.source_code (§3.7)
    string PostingType,           // audit.posting_log.posting_type: GENERAL_JOURNAL, SALES_INVOICE, REVERSAL, YEAR_CLOSE, OPENING_BALANCE …
    SourceRef Source,             // (Kind, Id, No) → posting_log.source_id/source_no
    string? JournalTemplateCode,  // gl_register / gl_entry
    string? JournalBatchCode);

public abstract record VoucherNumbering
{
    public sealed record FromSeries(string SeriesCode) : VoucherNumbering; // fn_next_document_no (gapless)
    public sealed record Existing(string DocumentNo) : VoucherNumbering;   // зөвхөн ReversalService (BR-PST-30)
    public sealed record SameAsVoucher(string VoucherKey) : VoucherNumbering; // өмнөх ваучерын олгосон дугаар (бэлэн борлуулалтын төлбөр, Z-PST-15)
}

public sealed record PostingVoucher
{
    public required string Key { get; init; }                          // "V1"…, run дотор давтагдахгүй
    public required VoucherNumbering Numbering { get; init; }
    public required string DocumentType { get; init; }                 // platform.document_type
    public required DateOnly PostingDate { get; init; }
    public DateOnly? DocumentDate { get; init; }
    public bool IsClosing { get; init; }                               // зөвхөн YearEndCloseService (BR-PST-17)
    public string? SourceCode { get; init; }                           // null = Run.SourceCode (бэлэн борлуулалтын төлбөр: CASHVOUCHER)
    public string? Description { get; init; }                          // gl_transaction.description
    public Guid? ReasonCodeId { get; init; }
    public long? ReversesTransactionNo { get; init; }                  // зөвхөн ReversalService
    public string? DraftDocumentNo { get; init; }                      // журнал/ноорогийн дугаар (J-000045) → хариуны vouchers[]
    public string DisplayNo => DraftDocumentNo ?? Key;                 // алдааны мессежид (хуулийн дугаар олгогдоогүй)
    public required IReadOnlyList<GlPostingLine> GlLines { get; init; } // ≥ 2, Σ Amount = 0 (BR-PST-22, -24)
    public IReadOnlyList<ISubledgerLine> SubledgerLines { get; init; } = [];
}

public sealed record GlPostingLine
{
    public required string Key { get; init; }                // run дотор давтагдахгүй: журнал "V1/L10000/A/BASE", "V1/L10000/B/CTRL" (§5.4.2); баримт "V1/R1/BASE", "V1/PARTY"
    public required Guid GlAccountId { get; init; }
    public required decimal Amount { get; init; }            // LCY, тэмдэгтэй, бөөрөнхийлсөн, ≠ 0 (BR-PST-05)
    public decimal VatAmount { get; init; }                  // gl_entry.vat_amount (суурь мөрөнд)
    public required LineOrigin Origin { get; init; }
    public long DimensionSetId { get; init; }                // 0 = хоосон
    public string GenPostingType { get; init; } = "NONE";
    public PostingGroupSnapshot? Groups { get; init; }       // (GenBus, GenProd, VatBus, VatProd) кодууд
    public DateOnly? VatDate { get; init; }
    public DateOnly? DocumentDate { get; init; }             // null = ваучерынх
    public string? DocumentType { get; init; }               // null = ваучерынх
    public string? Description { get; init; }                // ≤ 100; null = ваучерынх (100 тэмдэгтээр таслана: gl_entry.description CHECK)
    public string? ExternalDocumentNo { get; init; }
    public AccountRef? BalAccount { get; init; }             // (GL_ACCOUNT | BANK_ACCOUNT …, id)
    public SourceParty? Source { get; init; }                // (CUSTOMER | VENDOR | BANK_ACCOUNT | FIXED_ASSET, id, no)
    public CurrencyAmount? SourceCurrency { get; init; }     // R2
    public Guid? ReasonCodeId { get; init; }                 // null = ваучерынх
    public IReadOnlyList<DimensionRuleSource> DimensionRuleSources { get; init; } = []; // (entity_type, entity_id); данс өөрөө үргэлж орно
    public long? ReversedEntryNo { get; init; }              // зөвхөн ReversalService
}

public interface ISubledgerLine
{
    string Ledger { get; }                        // LedgerCodes.* — writer-ийг сонгох түлхүүр
    IReadOnlyList<string> GlLineKeys { get; }     // VAT: [суурь мөр]; харилцагч: [хяналтын дансны мөр]; банк: [мөнгөний дансны мөр]
}

// ---------- Engine ----------
public interface IPostingService
{
    // A үе: түгжээгүй, зөвхөн уншина, бүх алдааг буцаана. Transaction шаардахгүй.
    Task<IReadOnlyList<PostingError>> ValidateAsync(PostingDocument doc, CancellationToken ct);

    // B үе: pipeline-ийн нээсэн ITransactionalSession (BEGIN + set_config + timeout) дотор.
    Task<PostingResult> PostAsync(PostingDocument doc, PostingMode mode, CancellationToken ct);

    // Түгжээний дор угсрах: буцаалт, жилийн хаалт, R2-т элэгдэл, ханш, НӨАТ-ын хаалт
    Task<PostingResult> PostAsync(IPostingDocumentSource source, PostingMode mode, CancellationToken ct);

    // G/L-гүй дэд дэвтрийн run (BC "Transaction No. 0"): батлагдсан entry хоорондын тулгалт ба unapply (§5.19).
    // sourceCode ∈ { SALESAPPL, PURCHAPPL, UNAPPSALES, UNAPPPURCH }. G/L entry, gl_register, хуулийн дугаар үүсэхгүй.
    Task<T> RunSubledgerOnlyAsync<T>(string sourceCode, Func<ISubledgerRunContext, Task<T>> body, CancellationToken ct);
}

public interface IPostingDocumentSource
{
    // Advisory lock-ийн ДАРАА дуудагдана; null = бичих зүйлгүй (no-op, PostingResult.Posted = false)
    ValueTask<PostingDocument?> BuildAsync(IPostingReadContext ctx, CancellationToken ct);
}

// ---------- Гаралт ----------
public sealed record PostingResult(
    bool Posted,                                   // false: preview эсвэл no-op
    bool Preview,
    long? RegisterNo,                              // preview-д null
    IReadOnlyList<PostedVoucher> Vouchers,         // Key, DraftDocumentNo?, DocumentNo ("***" preview), TransactionNo (preview: 1..n)
    IReadOnlyList<PostedGlEntry> GlEntries,        // EntryNo (preview: 1..n), данс, Дт, Кт, НӨАТ, dimension
    IReadOnlyList<LedgerRowView> SubledgerRows,    // writer-ийн тайлбарласан мөр (VAT, авлага, банк …)
    IReadOnlyList<PostingWarning> Warnings);
```

Engine-ийн хэрэгжүүлэлт `Erp.GeneralLedger.Infrastructure.Posting.PostingEngine`-д, SQL нь `Sql/*.sql` embedded resource-д байна ([02](./02-architecture.md) §5.2).

### 5.2 Нийт урсгал

```mermaid
sequenceDiagram
    autonumber
    actor U as Хэрэглэгч / клиент
    participant API as Api pipeline
    participant ASM as Assembler (эх модулийн Application)
    participant PE as PostingEngine (GL)
    participant PDW as IPostedDocumentWriter (эх модуль)
    participant LW as ILedgerWriter-ууд (Tax, Parties, CashBank)
    participant DB as PostgreSQL

    U->>API: POST …:post (Idempotency-Key, If-Match) эсвэл …:preview
    API->>API: AuthZ (ACTION …post), schema validation (400)
    opt Post горим — Шат 0 (14 API-IDEM-12)
        API->>DB: SELECT idempotency_key (түгжээгүй, transaction-гүй)
        alt COMPLETED, hash ижил
            API-->>U: хадгалсан хариу (Idempotent-Replayed: true), handler ажиллахгүй
        else COMPLETED, hash өөр
            API-->>U: 422 api.idempotency_key_reused
        end
    end
    API->>ASM: Handle(command)
    Note over ASM,DB: A үе — transaction-гүй, түгжээгүй
    ASM->>DB: ноорог, мастер, тохиргоо унших
    ASM->>ASM: данс тодорхойлох, НӨАТ, PostingBuffer → PostingDocument
    ASM->>PE: ValidateAsync(doc) — CU11-ийн дүрэм, үе, данс, dimension
    alt алдаатай
        PE-->>API: 422 errors[] (transaction эхлээгүй, дугаар зарцуулаагүй)
    end
    Note over API,DB: B үе — нэг DB transaction
    API->>DB: BEGIN; fn_set_context; SET LOCAL lock_timeout, statement_timeout
    opt Post горим
        API->>DB: INSERT idempotency_key … ON CONFLICT DO NOTHING (зэрэг хүсэлт энд хүлээнэ; 5 s → 409 api.idempotency_in_progress)
        alt ижил түлхүүр энэ хооронд COMPLETED болсон
            API-->>U: хадгалсан хариу (Idempotent-Replayed), ROLLBACK
        end
    end
    API->>PE: PostAsync(doc, mode)
    PE->>DB: fn_lock_company_posting (pg_advisory_xact_lock)
    PE->>PDW: LockSourceAsync (ноорог FOR UPDATE, row_version = If-Match)
    PE->>DB: дахин шалгах: үе, цонх, данс, dimension, шалтгаан
    PE->>LW: ValidateLockedAsync (нээлттэй entry, НӨАТ-ын үе, касс)
    PE->>DB: fn_next_document_no × ваучер; fn_next_entry_no (GL_REGISTER, GL_TRANSACTION, GL_ENTRY)
    PE->>DB: INSERT gl_transaction, gl_entry (unnest / COPY)
    PE->>LW: WriteAsync (дарааллаар)
    LW->>DB: fn_next_entry_no (өөрийн ledger), INSERT, fn_ledger_update
    PE->>PDW: WriteAsync (posted баримт, ноорог устгах, eBarimt дараалал)
    PE->>DB: INSERT outbox (бүртгэлтэй topic)
    PE->>DB: INSERT gl_register (from/to entry, from/to VAT)
    alt Post
        PE->>DB: INSERT audit.posting_log (SUCCEEDED)
        PE-->>API: PostingResult
        API->>DB: UPDATE idempotency_key → COMPLETED (хариутай)
        API->>DB: COMMIT — deferred: ERB01 (Σ ≠ 0), ERC01 (касс), FK
        Note over API: C үе: POS бол eBarimt-ийн синхрон dispatch (12)
        API-->>U: 200 PostingResult
    else Preview
        PE->>DB: SET CONSTRAINTS ALL IMMEDIATE
        PE-->>API: PostingResult (*** дугаар, 1..n)
        API->>DB: ROLLBACK
        API-->>U: 200 PostingPreview
    end
```

**Engine-ийн цөм (B үе):**

```csharp
public async Task<PostingResult> PostAsync(IPostingDocumentSource source, PostingMode mode, CancellationToken ct)
{
    var s = _session;                                  // ITransactionalSession — pipeline нээсэн
    s.EnsureNoPostingRunYet();                         // нэг transaction-д нэг run (BR-PST-02); өмнө нь зөвхөн idempotency мөр бичигдсэн байж болно
    var startedAt = _clock.GetUtcNow();

    await s.ExecAsync(Sql.LockCompanyPosting, new { s.TenantId, s.CompanyId }, ct);        // BR-PST-60; 55P03 → 503
    var ctx = new PostingContext(s, mode, await _settings.LoadAsync(s, ct));             // LCY, нарийвчлал, цонх

    var doc = await source.BuildAsync(ctx, ct);                                          // баримт: A үеийн бэлэн doc
    if (doc is null)                                                                     // жилийн хаалтын зөрүү 0 г.м.
    {
        if (mode == PostingMode.Preview) s.MarkRollbackOnly();                           // source-ийн хийсэн төлөвийн өөрчлөлтийг ч буцаана
        return PostingResult.NothingToPost(mode, ctx.Warnings, ctx.Effects);             // posted = false; posting_log бичихгүй
    }

    var errors = new PostingErrorList();
    errors.AddRange(_rules.CheckDocument(doc, ctx.Settings));                            // §5.3, санах ойд
    if (doc.PostedDocument is { } pdw) errors.AddRange(await pdw.LockSourceAsync(ctx, ct)); // 412 / 409
    errors.AddRange(await _guards.CheckLockedAsync(ctx, doc, ct));                      // үе, цонх, данс, dimension, шалтгаан
    foreach (var g in _writers.Group(doc)) errors.AddRange(await g.Writer.ValidateLockedAsync(ctx, g.Lines, ct));
    if (errors.Any) throw new PostingValidationException(errors);                         // pipeline → ROLLBACK, 422/409

    SelfCheck(doc, ctx.Settings);                                  // BR-PST-25: Σ = 0, бөөрөнхий, Amount ≠ 0, key давтагдахгүй, GlLineKeys олдоно; эс бөгөөс InternalPostingException (500, P1)

    await _numbers.AllocateAsync(ctx, doc, ct);                    // §5.5: хуулийн дугаар, register, transaction, entry
    await _glWriter.InsertTransactionsAndEntriesAsync(ctx, doc, ct);   // §5.16
    foreach (var g in _writers.Group(doc).OrderBy(g => g.Writer.Order))
        await g.Writer.WriteAsync(ctx, g.Lines, ct);               // BR-PST-40
    if (doc.PostedDocument is { } w) await w.WriteAsync(ctx, ct);
    await _outbox.EnqueueAsync(ctx, doc.Outbox.Concat(ctx.Outbox).Concat(_events.For(ctx, doc)), ct);  // §9
    await _glWriter.InsertRegisterAsync(ctx, doc, ct);             // §5.9 — хамгийн сүүлд
    var result = _results.Build(ctx, doc);

    if (mode == PostingMode.Preview)
    {
        await s.ExecAsync("SET CONSTRAINTS ALL IMMEDIATE", ct);   // ERB01, ERC01, deferred FK одоо ажиллана
        s.MarkRollbackOnly();                                      // pipeline ROLLBACK хийнэ
        return result.MaskForPreview();                            // BR-PST-52
    }
    await _log.WriteSucceededAsync(ctx, doc, startedAt, ct);       // BR-PST-67
    s.OnCommitted(() => _dimensionSetCache.Promote(ctx.NewDimensionSets));   // BR-PST-35
    return result;
}

// Баримтын (A үеийн) хувилбар: source = AlreadyBuilt(doc)
public Task<PostingResult> PostAsync(PostingDocument doc, PostingMode mode, CancellationToken ct)
    => PostAsync(new AlreadyBuiltSource(doc), mode, ct);
```

**A үе (эх модуль):** ноорог ба тохиргоог уншина → данс тодорхойлно (данс тодорхойлолтын spec) → НӨАТ тооцно (НӨАТ-ын spec) → `PostingBuffer` (§5.7) → `PostingDocument` угсарна → `ValidateAsync`. Алдаатай бол 422 (`api.validation_failed` + `errors[]`). Transaction эхлээгүй тул хуулийн дугаар зарцуулагдахгүй, `Idempotency-Key` хадгалагдахгүй.

**A ба B үеийн хооронд өөрчлөлт.** Ноорог өөрчлөгдвөл `LockSourceAsync` 412 `api.etag_mismatch` өгнө. Данс, dimension, үе, шалтгааны төлөвийг engine B үед дахин уншина. Posting setup ба VAT setup-ийн өөрчлөлтийг эх модуль `LockSourceAsync`-д A үед ашигласан мөрийн `row_version`-оор шалгана (зөрвөл `409 gl.setup_changed`; клиент дахин илгээнэ).

### 5.3 Шалгалт (BC CU11-ийн дасгал)

Engine нь BC-ийн `RunCheck`-ийн дарааллыг ([bc-gl-posting.md](./research/bc-gl-posting.md) R-GL-POSTING-17) дагана. Алдаа бүрийг цуглуулна (эхний алдаан дээр зогсохгүй); `pointer` нь журналд `/lines/{index}/…`, баримтад эх модулийн өгсөн pointer.

```csharp
// Журналын мөр (5.4-ийн JournalAssembler дуудна). Баримтын мөрийг эх модуль өөрийн дүрмээр шалгана;
// engine нь GlPostingLine түвшний шалгалтыг (CheckDocument) бүх төрлийн баримтад хийнэ.
IEnumerable<PostingError> CheckJournalLine(JournalLine l, JournalTemplate t, CompanySettings cs)
{
    if (l.AccountId is null && l.BalAccountId is null && l.Amount == 0) yield break;            // BR-PST-10: хоосон
    if (l.PostingDate is null) yield return Err("gl.posting_date_required", l, "postingDate");    // BR-PST-11
    if (string.IsNullOrWhiteSpace(l.DocumentNo)) yield return Err("gl.document_no_required", l, "documentNo");
    if (l.AccountId is null && l.BalAccountId is null) yield return Err("gl.line_account_required", l, "accountId"); // BR-PST-12
    if (IsPartner(l.AccountType) && IsPartner(l.BalAccountType))
        yield return Err("gl.line_partner_pair_invalid", l, "balAccountType");
    if (l.Amount == 0) yield return Err("gl.line_amount_zero", l, "amount");                      // BR-PST-13
    if (Math.Sign(l.Amount) != Math.Sign(l.AmountLcy)) yield return Err("gl.line_amount_sign_mismatch", l, "amountLcy");
    if (l.AmountLcy != MoneyMath.Round(l.AmountLcy, cs.AmountPrecision))
        yield return Err("gl.amount_not_rounded", l, "amount", new { precision = cs.AmountPrecision });
    if (HasAppliesTo(l) && !IsPartner(l.AccountType) && !IsPartner(l.BalAccountType))
        yield return Err("gl.applies_to_not_allowed", l, "appliesToDocNo");                       // BR-PST-14
    foreach (var side in Sides(l))                                                                 // дансны ба харьцсан дансны тал
    {
        if (side.Type is "CUSTOMER" or "VENDOR" or "BANK_ACCOUNT" &&
            (side.GenPostingType != "NONE" || side.HasAnyGroup))
            yield return Err("gl.posting_groups_not_allowed", l, side.Pointer);                   // BR-PST-16
        if (side.Type == "GL_ACCOUNT" && side.HasVatOrGenGroup && side.GenPostingType is not ("SALE" or "PURCHASE"))
            yield return Err("gl.gen_posting_type_required", l, side.Pointer + "GenPostingType");
        if (side.Type == "FIXED_ASSET" || l.FaPostingType is not null)
            yield return Err("gl.account_type_not_enabled", l, side.Pointer, new { accountType = "FIXED_ASSET" }); // BR-PST-19 (R1)
    }
    if (l.CurrencyCode is not null) yield return Err("gl.currency_not_enabled", l, "currencyCode");  // R1
    if (t.Recurring) yield return Err("gl.recurring_not_enabled", l, null);                          // R1
}

// Бүх PostingDocument-д (журнал ба баримт), санах ойд
IEnumerable<PostingError> CheckDocument(PostingDocument d, CompanySettings cs)
{
    if (d.Vouchers.Count == 0) { yield return Err("gl.voucher_empty", null); yield break; }       // G/L-гүй run нь §5.19-ийн замаар
    if (d.Vouchers.Count > 5000 || d.Vouchers.Sum(v => v.GlLines.Count) > 20000)
        yield return Err("gl.posting_too_large", …);                                              // BR-PST-64
    foreach (var v in d.Vouchers)
    {
        var lines = v.GlLines;
        if (lines.Count(x => x.Amount != 0) < 2) yield return Err("gl.voucher_empty", v);         // BR-PST-24
        if (lines.Any(x => x.Amount != MoneyMath.Round(x.Amount, cs.AmountPrecision)))
            yield return Err("gl.amount_not_rounded", v);                                         // BR-PST-05
        var diff = lines.Sum(x => x.Amount);
        if (diff != 0) yield return Err("gl.voucher_unbalanced", v, new { documentNo = v.DisplayNo, v.PostingDate,
            debit = lines.Where(x => x.Amount > 0).Sum(x => x.Amount), credit = -lines.Where(x => x.Amount < 0).Sum(x => x.Amount),
            difference = diff });                                                                  // BR-PST-22
        if (v.IsClosing && (d.Run.SourceCode != "CLSINCOME" || v.PostingDate is not { Month: 12, Day: 31 }))
            yield return Err("gl.closing_entry_invalid", v);                                      // BR-PST-17
        if ((v.SourceCode ?? d.Run.SourceCode) == "REVERSAL" || v.DocumentType == "CREDIT_MEMO")
            if (v.ReasonCodeId is null) yield return Err("gl.reason_code_required", v);           // BR-PST-20
        if (HasVat(v) && DistinctParties(v).Count() > 1)
            yield return Err("gl.voucher_multiple_partners_with_vat", v);                         // BR-PST-23
    }
}
```

**Түгжээний доорх шалгалт (`CheckLockedAsync`).** Нэг round trip-ээр (NpgsqlBatch) дараах өгөгдлийг уншаад санах ойд шалгана:

```sql
-- (1) Ваучерын огноо бүрийн үе, жил, цонх (13 §8.2-ын AssertPostingAllowed-тэй ижил дүрэм)
SELECT d.posting_date, d.is_closing, p.status AS period_status, fy.status AS fy_status,
       cs.allow_posting_from, cs.allow_posting_to
  FROM unnest(@dates::date[], @closing::boolean[]) AS d(posting_date, is_closing)
  LEFT JOIN gl.accounting_period p ON p.company_id = @c AND d.posting_date BETWEEN p.starting_date AND p.ending_date
  LEFT JOIN gl.fiscal_year fy ON fy.company_id = @c AND fy.id = p.fiscal_year_id
  CROSS JOIN platform.company_setup cs WHERE cs.company_id = @c;
-- (2) Ашигласан данс
SELECT id, no, account_type, blocked, direct_posting, normal_side FROM gl.gl_account
 WHERE company_id = @c AND id = ANY(@accountIds);
-- (3) Ашигласан dimension set-ийн утга (§5.6) ба default_dimension дүрэм
-- (4) Ашигласан шалтгааны код
SELECT id, blocked FROM platform.reason_code WHERE company_id = @c AND id = ANY(@reasonIds);
-- (5) FromSeries ваучерын цуврал бүр × огноо: fn_next_document_no-той ижил мөр сонголт (BR-PST-26)
SELECT q.series_code, q.posting_date, s.reset_yearly, s.date_order, l.starting_date, l.ending_no, l.starting_no,
       l.increment_by, coalesce(c.last_no_used, l.last_no_used) AS last_no_used, coalesce(c.last_date_used, l.last_date_used) AS last_date_used
  FROM unnest(@seriesCodes::text[], @seriesDates::date[]) AS q(series_code, posting_date)
  LEFT JOIN platform.number_series s ON s.company_id = @c AND s.code = q.series_code
  LEFT JOIN LATERAL (SELECT * FROM platform.number_series_line x
                      WHERE x.company_id = @c AND x.number_series_id = s.id AND x.starting_date <= q.posting_date AND x.open
                      ORDER BY x.starting_date DESC LIMIT 1) l ON true
  LEFT JOIN platform.number_series_counter c ON c.company_id = @c AND c.number_series_line_id = l.id AND s.gapless;
```

Цувралын урьдчилсан шалгалт (санах ойд, ваучерыг BR-PST-27-ийн дарааллаар гүйлгэж, нэг цувралаас хэд хэдэн дугаар авахыг тооцно): мөр алга эсвэл `reset_yearly` ба мөрийн жил ≠ огнооны жил → `platform.number_series_missing_line`; `date_order` ба огноо < (`last_date_used` эсвэл энэ run-ий өмнөх ваучерын огноо) → `platform.number_series_date_order`; `ending_no` хэтрэх → `platform.number_series_exhausted`. Энэ нь ERN01..03-ийг бусад алдаатай хамт нэг хариунд гаргах зорилготой; `fn_next_document_no` нь эцсийн хамгаалалт хэвээр.

| Нөхцөл | Код |
|---|---|
| Огноонд үе байхгүй | `gl.period_not_found` |
| `is_closing = false` ба (үе эсвэл жил `LOCKED`) | `gl.period_locked` |
| `is_closing = false` ба (үе эсвэл жил `OPEN` биш) | `gl.period_closed` |
| `is_closing = true` ба (үе эсвэл жил `LOCKED`) | `gl.period_locked` |
| `posting_date ∉ [allow_posting_from, allow_posting_to]` (хоосон хил = хязгааргүй) | `gl.posting_date_outside_window` |
| R2: хэрэглэгчийн цонхноос гадуур | `gl.posting_date_outside_user_window` |
| Данс `account_type ≠ 'POSTING'` / `blocked` | `gl.account_not_posting` / `gl.account_blocked` |
| `Origin = UserEntered` ба `direct_posting = false` | `gl.direct_posting_not_allowed` |
| Шалтгаан блоклогдсон | `gl.reason_code_blocked` |
| `normal_side = 'DEBIT'` дансанд кредит (эсвэл эсрэгээр), `UserEntered` | Анхааруулга `W-01` (батлахыг зогсоохгүй, D-D1, FR-GL-005) |

### 5.4 Ерөнхий журнал батлах

Журнал нь GL-ийн өөрийн use case (`PostJournalHandler`, `Erp.GeneralLedger.Application`). Template төрөл: GENERAL, CASH_RECEIPTS, PAYMENTS, OPENING (seed: GENERAL, CASH_RECEIPT, PAYMENT, OPENING). Source code = `journal_template.source_code` (GENJNL, CASHRECJNL, PAYMENTJNL, OPENING). `CLSINCOME` source-той template-ийг (CLOSING) энэ use case батлахгүй (BR-PST-17).

#### 5.4.1 Алхам

```csharp
public async Task<PostingResult> Handle(PostJournal cmd, PostingMode mode, CancellationToken ct)
{
    // ---- A үе ----
    var batch = await _repo.LoadBatchAsync(cmd.JournalBatchId, ct);                 // 404
    var t = batch.Template;
    if (t.SourceCode == "CLSINCOME") throw Problem("gl.closing_template_manual_line");
    var allLines = await _repo.LoadLinesAsync(batch.Id, ct);                          // хоосон мөр орно (устгахад, BR-PST-10)
    var lines = allLines.Where(l => !l.IsEmpty).OrderBy(l => l.LineNo).ToList();      // IsEmpty: BR-PST-10-ийн томьёо
    if (lines.Count == 0) throw Problem("gl.journal_empty");                         // BR-PST-62
    if (cmd.ExpectedLineCount is int n && n != lines.Count) throw Problem("gl.journal_changed"); // 409; хоосон биш мөрийн тоо

    var errors = lines.SelectMany(l => _rules.CheckJournalLine(l, t, _settings)).ToList();   // §5.3
    var series = batch.PostingNoSeriesCode ?? t.PostingNoSeriesCode;                  // §3.3; хоёулаа NULL бол gl.journal_series_missing
    if (series is null) errors.Add(Err("gl.journal_series_missing", null, new { template = t.Code, batch = batch.Code }));

    // Ваучер = (document_no, posting_date) — BR-PST-21. Огноо эсвэл дугааргүй мөр (BR-PST-11 алдаатай) ваучерт орохгүй.
    var groups = lines.Where(l => l.PostingDate is not null && !string.IsNullOrWhiteSpace(l.DocumentNo))
                      .GroupBy(l => (l.DocumentNo, l.PostingDate))
                      .OrderBy(g => g.Key.PostingDate).ThenBy(g => g.Key.DocumentNo, StringComparer.Ordinal)
                      .ThenBy(g => g.Min(l => l.LineNo));                              // BR-PST-27
    var vouchers = new List<PostingVoucher>(); int i = 0;
    foreach (var g in groups)
    {
        var key = $"V{++i}";
        errors.AddRange(CheckLineBalance(g));                                         // BR-PST-22(а): Σ Balance(LCY)
        var partner = SinglePartnerOrNull(g);                                         // BR-PST-23-д
        var gl = new List<GlPostingLine>(); var sub = new List<ISubledgerLine>();
        foreach (var l in g)
            foreach (var side in Sides(l))                                            // дансны тал (+), харьцсан дансны тал (−)
            {
                var exp = await ExpandSideAsync(key, l, side, partner, t, ct);         // §5.4.2
                gl.AddRange(exp.GlLines); sub.AddRange(exp.SubledgerLines); errors.AddRange(exp.Errors);
            }
        vouchers.Add(new PostingVoucher {
            Key = key, Numbering = new VoucherNumbering.FromSeries(series),
            DocumentType = g.Select(l => l.DocumentType).Distinct().Count() == 1 ? g.First().DocumentType : "NONE",
            PostingDate = g.Key.PostingDate!.Value, DocumentDate = g.First().DocumentDate,
            Description = g.Select(l => l.Description).FirstOrDefault(d => !string.IsNullOrWhiteSpace(d)),
            ReasonCodeId = g.First().ReasonCodeId ?? batch.ReasonCodeId,
            GlLines = gl, SubledgerLines = sub, DraftDocumentNo = g.Key.DocumentNo });
    }

    var doc = new PostingDocument {
        Run = new(t.SourceCode, t.TemplateType == "OPENING" ? "OPENING_BALANCE" : "GENERAL_JOURNAL",
                  new SourceRef("gl.journal_batch", batch.Id, batch.Code), t.Code, batch.Code),
        Vouchers = vouchers,
        PostedDocument = new JournalBatchWriter(batch.Id, cmd.IfMatch, allLines.Select(l => l.Id).ToArray()), // хоосон мөр орно
        Warnings = NormalSideWarnings(vouchers) };
    errors.AddRange(await _posting.ValidateAsync(doc, ct));
    if (errors.Any()) throw new PostingValidationException(errors);                   // 422, бүгдийг

    // ---- B үе ----
    return await _posting.PostAsync(doc, mode, ct);
}
```

`JournalBatchWriter` (GL-ийн дотоод `IPostedDocumentWriter`):
- `LockSourceAsync`: `SELECT row_version FROM gl.journal_batch WHERE company_id = @c AND id = @id FOR UPDATE`; `row_version ≠ If-Match` → `412 api.etag_mismatch`. Мөрийн id-ийн олонлог ба тоо A үеийнхтэй ижил эсэхийг шалгана (`SELECT id FROM gl.journal_line WHERE journal_batch_id = @id FOR UPDATE`) → зөрвөл `409 gl.journal_changed`.
- `WriteAsync`: `DELETE FROM gl.journal_line WHERE company_id = @c AND journal_batch_id = @id AND id = ANY(@lineIds)` (`@lineIds` = A үед уншсан **бүх** мөр, хоосон мөр орно, BR-PST-10); `UPDATE gl.journal_batch SET row_version = row_version + 1 …` (trigger). Batch өөрөө үлдэнэ (R-GL-POSTING-27).
- Batch/template-ийн `bal_account_*` нь мөр **үүсгэх** үед UI/API-аар мөрт хуулагдах анхдагч утга (R-GL-POSTING-12); engine батлах үед хоосон `bal_account_id`-г batch-аас бөглөхгүй.
- Batch ба template хоёулаа `posting_no_series_id`-гүй бол `422 gl.journal_series_missing` (seed-д үргэлж бий; гараар үүсгэсэн template-д).

#### 5.4.2 Мөрийн талыг G/L мөр болгох (`ExpandSideAsync`)

| Талын төрөл | G/L мөр | Дэд дэвтрийн мөр | Хэн |
|---|---|---|---|
| `GL_ACCOUNT`, НӨАТ-гүй | `GlPostingLine(account, ±amount_lcy, UserEntered*)` | — | GL |
| `GL_ACCOUNT`, НӨАТ-тай (BR-PST-38) | Суурь мөр (`Amount = ±amount − VAT`, `VatAmount = VAT`) + VAT G/L мөр (`SystemDerived`) | `VatLedgerLine` (Tax.Contracts) | `IJournalVatHandler` (Tax) |
| `CUSTOMER`, `VENDOR` | Хяналтын данс (1200, 2100 … posting group-ээс), `SystemDerived`, `Source` = харилцагч | `CustomerLedgerLine` / `VendorLedgerLine` (тулгалтын `applies_to_*`-тай) | `IJournalAccountTypeHandler` (Parties) |
| `BANK_ACCOUNT` | Мөнгөний дансны G/L (1100, 1110 … bank posting group-ээс), `SystemDerived`, `Source` = мөнгөний данс | `BankLedgerLine` (+ касс бол МХ-1/МХ-2) | `IJournalAccountTypeHandler` (CashBank) |
| `FIXED_ASSET` | R2 | `FaLedgerLine` | FixedAssets (R2) |

\* `journal_line.system_created = true` бол `SystemDerived`.

```csharp
public interface IJournalAccountTypeHandler        // GL.Contracts; Parties, CashBank, FixedAssets(R2) хэрэгжүүлнэ
{
    string AccountType { get; }                     // "CUSTOMER" | "VENDOR" | "BANK_ACCOUNT" | "FIXED_ASSET"
    ValueTask<SideExpansion> ExpandAsync(JournalSide side, VoucherInfo voucher, CancellationToken ct);
    // SideExpansion: GlLines (хяналтын дансны мөр, SystemDerived), SubledgerLines, Errors (блоклогдсон харилцагч г.м.)
}

public interface IJournalVatHandler                // GL.Contracts; Tax хэрэгжүүлнэ
{
    ValueTask<SideExpansion> ExpandAsync(JournalSide side, PartyRef? voucherPartner, JournalTemplateInfo t, CancellationToken ct);
    // Gross арга (§6.4), VAT setup-ийн данс, урвуу тооцоо, vat_difference-ийн хязгаар; VatLedgerLine.GlLineKeys = [суурь мөр]
}
```

Талын дүрэм:
- Дансны тал `+amount_lcy`, харьцсан дансны тал `−amount_lcy`. Харьцсан талын бүлэг нь `bal_gen_posting_type`, `bal_vat_bus_posting_group_id`, `bal_vat_prod_posting_group_id`.
- Хоёр талтай мөрийн G/L мөр бүр `BalAccount` = нөгөө тал. `Source` = мөрийн `CUSTOMER`/`VENDOR`/`BANK_ACCOUNT`/`FIXED_ASSET` тал (байвал; BC `GenJnlLine` Source Type), эс бөгөөс `source_type = 'NONE'` (NOT NULL багана). Жишээ: E-A-ийн 7210 мөр ч `source = BANK_ACCOUNT BANK01`.
- G/L мөрийн key: `{voucherKey}/L{line_no}/{A|B}/{BASE|VAT|VAT2|CTRL}`.
- Дансны тал ба харьцсан тал ижил G/L данс бол анхааруулга `W-02` (нийлбэр 0, утгагүй мөр); батлахыг зогсоохгүй.

#### 5.4.3 Дугаарын харгалзаа

Хуулийн дугаар B үед олгогдоно (§5.5). Хариуны `vouchers[]`: `{ draftDocumentNo: "J-000045", documentNo: "GJ-2026-00012", postingDate, transactionNo }`. Preview-д `documentNo = "***"`.

#### 5.4.4 Эхний үлдэгдэл (OPENING, D-D7)

- Template OPENING / batch DEFAULT, source `OPENING`, цуврал `OB`, `posting_type = 'OPENING_BALANCE'`.
- Харилцагч/нийлүүлэгчийн мөр бүр нэг нээлттэй баримт: `document_type = 'INVOICE'` (эсвэл `CREDIT_MEMO`, `PAYMENT`), `external_document_no` = анхны баримтын дугаар, `document_date`, `due_date` = анхны төлөх огноо. Дэд дэвтрийн entry-ийн `document_no` = ваучерын дугаар (`OB-…`), анхны дугаар `external_document_no`-д.
- Мөнгөний дансны мөр (касс) нь МХ-1 шаардахгүй (CashBank writer `OPENING` source-ийг чөлөөлнө).
- Хяналтын данс (1200, 1201, 1360, 2100, 2101, 2210, 2365, 1100–1121) руу шууд G/L мөр оруулахгүй (BR-PST-15): харилцагч (`EMPLOYEE` бүлэг → 1360), нийлүүлэгч (`EMPLOYEE` → 2210, `CUSTOMS` → 2365), мөнгөний дансны мөрөөр.
- Дэд дэвтэргүй хяналтын данс (1300, 2300, 2305, 2320, 8290)-ын эхний үлдэгдлийг тэдгээрт оруулахгүй: НӨАТ/НХАТ-ын цэвэр үлдэгдлийг тооцооны данс **2310** / **2325** (хяналтын биш)-д оруулна (seed README §3: 1300/2300 нь нээлттэй VAT entry-ийн нийлбэртэй тэнцэх ёстой, BR-TAX-82; нээлттэй VAT entry-гүй үлдэгдэл түүнийг зөрчинө). 8290 нь орлогын тайлангийн данс: 01-01-нд эхлэхэд үлдэгдэлгүй; жилийн дундуур эхлэх бол YTD дүнг `direct_posting = true` бусад орлого/зардлын дансанд оруулна.
- Excel импорт (FR-GL-021) нь журналын мөр үүсгэнэ; 20 000 мөрөөс их бол хэд хэдэн run-д хуваана: ваучер бүр өөрөө тэнцсэн байх ёстой (жишээ нь хэсэг бүрийг `2690` түр дансаар тэнцүүлж, сүүлийн хэсэгт хаана). `statement_timeout = 120s`.

#### 5.4.5 Мөнгөн орлого/зарлагын журнал (CASH_RECEIPT, PAYMENT)

Engine-ийн хувьд ерөнхий журналтай ижил. CASH batch-ийн ваучерын дугаар `KO`/`KZ` (batch-ийн `posting_no_series_id`). МХ-1/МХ-2-ийн (`bank.posted_cash_voucher`) мөр, касс сөрөг болохгүй шалгалтыг CashBank writer хариуцна.

#### 5.4.6 Стандарт журнал (D-D6, FR-GL-016)

`POST /standard-journals/{id}:copy-to-journal` (`journalId`, `postingDate`): `gl.standard_journal_line` бүрийг `gl.journal_line` болгон хуулна (`line_no` = batch-ийн сүүлийн + 10000·k, `document_no` = `JNL_DRAFT`-ийн дараагийн дугаар, `posting_date` = өгсөн огноо, `dimension_set_id` ижил). Posting хийхгүй. "Стандарт болгох" нь эсрэг чиглэлтэй хуулбар.

#### 5.4.7 Давтагдах журнал (R2)

`journal_template.recurring = true` R1-д `gl.recurring_not_enabled`. R2-т `recurring_method` (FIXED, VARIABLE, REVERSING_FIXED, REVERSING_VARIABLE), `recurring_frequency`, `expiration_date`-ийг R-GL-POSTING-43, R-GL-POSTING-44-ийн дагуу: батласны дараа мөрийн огноо `+frequency` болж үлдэнэ (VARIABLE-ийн дүн 0 болно); REVERSING_* нь `posting_date + 1` огноотой эсрэг ваучерыг **ижил run**-д нэмнэ (тус бүр тэнцсэн). Сарын эцсийн огноо `CM`-ээр тогтвортой (bc-gl-posting.md E-F).

### 5.5 Дугаар олгох

Бүгд B үед, advisory lock-ийн дор, бүх шалгалтын дараа, insert-ээс өмнө нэг `NpgsqlBatch`-аар (statement-ууд дарааллаар гүйцэтгэгдэнэ).

```csharp
async Task AllocateAsync(PostingContext ctx, PostingDocument doc, CancellationToken ct)
{
    var batch = ctx.Session.CreateBatch();
    // (1) Хуулийн дугаар — ваучерын дарааллаар (BR-PST-27). Existing бол дуудахгүй.
    foreach (var v in doc.Vouchers.Where(v => v.Numbering is VoucherNumbering.FromSeries))
        batch.Add("SELECT platform.fn_next_document_no(@series, @date)",
                  new { series = ((VoucherNumbering.FromSeries)v.Numbering).SeriesCode, date = v.PostingDate });
    // (2) Register, transaction, entry — тогтмол дараалал (BR-PST-28, -61)
    batch.Add("SELECT platform.fn_next_entry_no('GL_REGISTER', 1)");
    batch.Add("SELECT platform.fn_next_entry_no('GL_TRANSACTION', @n)", new { n = doc.Vouchers.Count });
    batch.Add("SELECT platform.fn_next_entry_no('GL_ENTRY', @n)",       new { n = doc.Vouchers.Sum(v => v.GlLines.Count) });
    var r = await batch.ExecuteAsync(ct);          // ERN01/02/03 → platform.number_series_* (422)

    ctx.RegisterNo = r.Register;
    long tx = r.FirstTransactionNo, e = r.FirstEntryNo;
    foreach (var v in doc.Vouchers)                 // BR-PST-29
    {
        ctx.SetVoucher(v.Key, transactionNo: tx++, documentNo: v.Numbering switch {
            VoucherNumbering.FromSeries => r.NextDocumentNo(),
            VoucherNumbering.Existing x => x.DocumentNo,
            VoucherNumbering.SameAsVoucher s => ctx.Voucher(s.VoucherKey).DocumentNo,   // өмнө нь олгогдсон байх ёстой (BR-PST-30)
            _ => throw new InternalPostingException("unknown numbering") });
        foreach (var l in v.GlLines) ctx.SetGlEntry(l.Key, entryNo: e++);
    }
    ctx.RecordRange(LedgerCodes.GlEntry, r.FirstEntryNo, e - 1);
}
```

- Writer бүр өөрийн ledger-ийн дугаарыг **нэг удаа, блокоор** `ctx.ReserveEntryNumbersAsync(ledger, count)`-ээр (`fn_next_entry_no`) нөөцөлнө; контекст мужийг бүртгэнэ (VAT_ENTRY-ийн муж register-т очно, BR-PST-37). `count = 0` бол дуудахгүй (§3.3); контекст нэг ledger-ийг run-д хоёр дахь удаа нөөцлөх оролдлогыг `InternalPostingException`-ээр зогсооно (муж тасралтгүй байх баталгаа).
- `SameAsVoucher` ваучер хуулийн цувралаас дугаар авахгүй (counter өөрчлөгдөхгүй); ижил `document_no`-той хоёр `gl_transaction` (INVOICE + PAYMENT) нь BC-тэй ижил (`ix_gl_transaction__document` unique биш).
- `ERN01`-ийн шалтгаан: `reset_yearly` цувралд тухайн жилийн мөр алга эсвэл огнооны мөр алга. Мессеж: "{series} цувралд {year} оны мөр алга. Тохиргоо › Дугаарын цуврал-д шинэ жилийн мөр нэмнэ үү" (CR-PST-04-ийн дараа автоматаар үүснэ, Z-PST-12).
- `ERN02` (огнооны дараалал): `date_order = true` цувралд энэ огноо `last_date_used`-аас өмнө. ⚠ OQ-PST-03.
- Preview нь ижил функцийг дуудаж counter-ыг түгжинэ, ROLLBACK-аар буцна (завсар үүсэхгүй; ADR-0008 "Preview нь тоолуурыг түгжинэ").

### 5.6 Dimension set ба value posting

**Set олох/үүсгэх.** Ноорогийн set-ийг (`dimension_set_id`) шууд ашиглана. Шинэ хослол хэрэгтэй бол (жишээ нь баримтын header ба мөрийн утгыг нэгтгэх, R2-т хаалтыг dimension-ээр) `IDimensionSetService.GetOrCreateAsync(valueIds)`:

```csharp
public async ValueTask<long> GetOrCreateAsync(IReadOnlyCollection<Guid> valueIds, ITransactionalSession s, CancellationToken ct)
{
    if (valueIds.Count == 0) return 0;                                              // хоосон set (R-DIMENSIONS-NOSERIES-AUDIT-07)
    var key = DimensionSetKey.From(valueIds);                                       // sha256 нь DB-д тооцогдоно; кэшийн түлхүүр = эрэмбэлсэн id
    if (_cache.TryGet(s.CompanyId, key, out var id)) return id;                     // зөвхөн COMMIT болсон id (BR-PST-35)
    id = await s.ScalarAsync<long>("SELECT gl.fn_get_dimension_set_id(@ids)", new { ids = valueIds.ToArray() }, ct); // ERD01
    s.PendingDimensionSets.Add(key, id);                                            // OnCommitted → _cache.Promote
    return id;
}
```

`gl.fn_get_dimension_set_id` нь `UNIQUE (company_id, key_hash)` + `ON CONFLICT DO NOTHING`-оор зэрэг үүсгэлтэд давхардал гаргахгүй (R-DIMENSIONS-NOSERIES-AUDIT-09). `gl.dimension_set_id_seq`-ийн завсар хор хөнөөлгүй (техникийн id).

**Value posting шалгалт (BR-PST-33, -34).**

```csharp
IEnumerable<PostingError> CheckDimensions(GlPostingLine l, DimensionSnapshot ds)
{
    if (l.Amount == 0 || l.Origin == LineOrigin.SystemGenerated) yield break;          // BR-PST-33, -34 (SystemGenerated бүрэн чөлөөлөгдөнө)
    var set = ds.SetEntries(l.DimensionSetId);                                       // dimension_id → value_id
    foreach (var (dimId, valId) in set)
    {
        if (ds.Dimension(dimId).Blocked)  yield return Err("gl.dimension_blocked", l, new { dimension = ds.Dimension(dimId).Code });
        var v = ds.Value(valId);
        if (v.Blocked)                    yield return Err("gl.dimension_value_blocked", l, new { dimension = v.DimensionCode, value = v.Code });
        if (v.ValueType != "STANDARD")    yield return Err("gl.dimension_value_not_postable", l, new { value = v.Code });
    }
    // Дүрмийн эх сурвалж: данс (үргэлж) + мөрийн DimensionRuleSources (харилцагч, нийлүүлэгч, мөнгөний данс)
    var sources = l.DimensionRuleSources.Prepend(new("GL_ACCOUNT", l.GlAccountId));
    foreach (var rule in sources.SelectMany(src => ds.Rules(src.EntityType, src.EntityId)     // тухайн мөр
                                     .Concat(ds.Rules(src.EntityType, null))))                  // хүснэгтийн түвшин — хуримтлагдана
    {
        set.TryGetValue(rule.DimensionId, out var actual);
        switch (rule.ValuePosting)
        {
            case "CODE_MANDATORY" when actual == default:
                yield return Err("gl.dimension_value_required", l, new { account = l.AccountNo, dimension = rule.DimensionCode }); break;
            case "SAME_CODE" when actual != rule.DimensionValueId:   // схемийн CHECK: SAME_CODE ⇒ dimension_value_id NOT NULL.
                // BC-ийн "SAME_CODE + хоосон утга = байх ёсгүй" (R-DIMENSIONS-NOSERIES-AUDIT-13)-ийг манайд NO_CODE илэрхийлнэ.
                yield return Err("gl.dimension_value_must_match", l, new { account = l.AccountNo, dimension = rule.DimensionCode,
                                                                           expected = rule.DimensionValueCode }); break;
            case "NO_CODE" when actual != default:
                yield return Err("gl.dimension_value_not_allowed", l, new { account = l.AccountNo, dimension = rule.DimensionCode }); break;
        }
    }
}
```

- Баримтад харилцагчийн мөрийн `DimensionRuleSources` = [`CUSTOMER`/`VENDOR` id], set = header-ийн set; орлого/НӨАТ-ын мөрийн эх сурвалж = данс өөрөө (R-DIMENSIONS-NOSERIES-AUDIT-25).
- Журналд мөрийн бүх G/L мөр (хяналтын данс, НӨАТ орно) журналын мөрийн set ба мөрийн partner-ийг эх сурвалж болгоно (R-DIMENSIONS-NOSERIES-AUDIT-17, R-DIMENSIONS-NOSERIES-AUDIT-20).
- `global_dim_1/2_value_id`-г `trg_gl_entry_global_dims` гаргана; engine бичихгүй (BR-PST-07).
- Тохиргоо хадгалах үед зөрчилтэй дүрмийг (хүснэгтийн түвшинд `CODE_MANDATORY` + тухайн мөрөнд `NO_CODE`) илрүүлэх нь dimension-ийн UI-ийн ажил (R2, BC Report 30-ийн оронд).

### 5.7 НӨАТ-ын hook ба posting buffer

#### 5.7.1 Posting buffer (бүх баримтын модулийн гэрээ)

`PostingBuffer` нь `Erp.GeneralLedger.Contracts.Posting`-д байна. Sales, Purchases, CashBank (R2-т FA, Inventory) өөрийн мөрийг үүгээр нэгтгэнэ. Буфер нь бөөрөнхийлөлт хийхгүй: оролтын дүн аль хэдийн бөөрөнхийлөгдсөн (НӨАТ-ын хуваарилалт §6.6).

```csharp
public enum BufferLineKind { GlAccount, Item, Service, FixedAsset /*R2*/, Discount, InvoiceRounding }

public sealed record PostingBufferKey(
    BufferLineKind Kind,
    Guid GlAccountId,                     // данс тодорхойлсны дараах данс
    string GenPostingType,                // SALE | PURCHASE
    Guid? GenBusPostingGroupId, Guid? GenProdPostingGroupId,
    Guid? VatBusPostingGroupId, Guid? VatProdPostingGroupId,
    string? VatIdentifier, string VatCalculationType,   // VAT % нь түлхүүрт орохгүй: бүлгээс гарна (R-ACCOUNT-DETERMINATION-17)
    long DimensionSetId,
    string? NonDeductibleReason,          // хасагдахгүй НӨАТ-ын шалтгаан (08 BR-TAX-25, Z-TAX-15): өөр шалтгаантай мөр нэгтгэгдэхгүй
    Guid? CityTaxCodeId,                  // R2 НХАТ (08 BR-TAX-94, Z-TAX-15); R1-д үргэлж null
    int? SeparateLineNo);                 // мөр бүрийн тайлбар эсвэл ҮХ-ийн мөр → нэгтгэхгүй (R-ACCOUNT-DETERMINATION-19)

public sealed class PostingBufferRow
{
    public required PostingBufferKey Key { get; init; }
    public decimal Amount, VatAmount, VatBase, VatDifference, NonDeductibleVatAmount, Quantity;  // LCY, тэмдэгтэй
    public bool SystemCreated = true;      // нэг ч мөр false бол false (R-ACCOUNT-DETERMINATION-18)
    public string? Description;            // эхний мөрийнх
    public List<int> SourceLineNos { get; } = [];
}

public sealed class PostingBuffer
{
    private readonly Dictionary<PostingBufferKey, PostingBufferRow> _rows = new();
    private readonly List<PostingBufferKey> _order = [];                    // анх орсон дараалал (R-ACCOUNT-DETERMINATION-33-ийг хуулахгүй)

    public void Add(PostingBufferKey key, decimal amount, decimal vatAmount, decimal vatBase, decimal vatDifference,
                    decimal nonDeductibleVat, decimal quantity, bool systemCreated, string? description, int sourceLineNo)
    {
        if (!_rows.TryGetValue(key, out var r)) { r = new() { Key = key, Description = description }; _rows[key] = r; _order.Add(key); }
        r.Amount += amount; r.VatAmount += vatAmount; r.VatBase += vatBase; r.VatDifference += vatDifference;
        r.NonDeductibleVatAmount += nonDeductibleVat; r.Quantity += quantity;
        r.SystemCreated &= systemCreated; r.SourceLineNos.Add(sourceLineNo);
    }

    // Amount = 0 ба VatAmount = 0 ба VatBase = 0 мөрийг хасна (BR-PST-24)
    public IReadOnlyList<PostingBufferRow> Rows => _order.Select(k => _rows[k])
        .Where(r => r.Amount != 0 || r.VatAmount != 0 || r.VatBase != 0).ToList();
}
```

Тэмдгийн дүрэм (R-ACCOUNT-DETERMINATION-11): борлуулалтын нэхэмжлэх ба худалдан авалтын кредит нотын дүнг буферт оруулахаас өмнө сөрөг болгоно (орлого Кт, зардлын буцаалт Кт); борлуулалтын кредит нот ба худалдан авалтын нэхэмжлэх эерэг. Харилцагч/нийлүүлэгчийн мөр = −Σ(буферийн мөрийн `Amount` + `VatAmount`), энд buffer-ийн `Amount` = цэвэр дүн (хасагдахгүй НӨАТ ороогүй), `VatAmount` = бүтэн НӨАТ (хасагдахгүй хэсэг орно); урвуу тооцооны (REVERSE_CHARGE) мөрийн НӨАТ нийлүүлэгчид төлөгдөхгүй тул тэр мөрөнд `−Σ Amount` л орно. Хасагдахгүй хэсгийг суурь G/L мөр рүү шилжүүлэх нь §5.7.2.

**Тэмдэг түлхүүрт орохгүй** (BC Invoice Posting Buffer, R-ACCOUNT-DETERMINATION-17): ижил түлхүүртэй эерэг ба сөрөг мөр (жишээ нь нэхэмжлэх доторх хасах мөр) нэг buffer мөрөнд **цэвэрлэгдэнэ** (нэг G/L мөр, нэг VAT entry). НӨАТ-ын бүлгийг тэмдгээр салгах (R-VAT-13, 08 BR-TAX-18) нь buffer-ээс **өмнө** Tax-ийн хуваарилалтад хамаарна; мөр бүрийн хуваарилсан НӨАТ buffer-т нийлбэрлэгдэнэ. Цэвэрлэгдээд `Amount = 0`, `VatAmount = 0`, `VatBase = 0` болсон мөр хасагдана (16 Q10-ийн хариу).

#### 5.7.2 Buffer-ийн мөрийг G/L ба НӨАТ болгох

Tax.Contracts-ийн `IVatPostingComposer` (Tax хэрэгжүүлнэ; Sales/Purchases ба Tax-ийн `IJournalVatHandler` дуудна):

```csharp
// Tax.Contracts
public interface IVatPostingComposer
{
    VatComposition Compose(PostingBufferRow row, string baseLineKey, VatPartyContext party, DateOnly vatDate);
}
public sealed record VatComposition(
    GlPostingLine BaseLine,                     // Amount = row.Amount + ND (FULL_VAT: row.VatAmount), VatAmount = row.VatAmount, Groups snapshot
    IReadOnlyList<GlPostingLine> VatGlLines,    // 0: НӨАТ = 0, FULL_VAT, борлуулалтын RC; 1: NORMAL (±(VAT − ND)); 1–2: худалдан авалтын RC (1300 +(VAT − ND), 2305 −VAT)
    VatLedgerLine VatLine);                     // ISubledgerLine, Ledger = "VAT_ENTRY", GlLineKeys = [baseLineKey]
```

Дүрэм (BR-PST-36):
1. **Суурь мөр:** `Amount` = буферийн цэвэр дүн + `NonDeductibleVatAmount` (хасагдахгүй НӨАТ өртөгт шингэнэ — D-E5, 08 BR-TAX-25), `VatAmount` = бүтэн НӨАТ (`gl_entry.vat_amount`, мэдээллийн), `GenPostingType` = SALE/PURCHASE, `Groups` = 4 бүлгийн код, `Origin` = буферийн `SystemCreated` ? `SystemDerived` : `UserEntered`.
2. **VAT G/L мөр** (`SystemDerived`). `D = VatAmount − NonDeductibleVatAmount` (= VAT entry-ийн `amount`, хасагдах хэсэг):
   - `NORMAL` — `D ≠ 0` бол нэг мөр `±D`: борлуулалтад `sales_vat_account_id` (2300), худалдан авалтад `purchase_vat_account_id` (1300).
   - `FULL_VAT` — тусдаа мөргүй; 1-р дүрмийн оронд суурь мөр нь `purchase_vat_account_id` (1300) дээр `Amount = row.VatAmount` (buffer-ийн `row.Amount = 0`, 08 BR-TAX-24), `VatAmount = row.VatAmount`, `SystemDerived` (§6.4; хасагдахгүй хэсэг хориотой).
   - `REVERSE_CHARGE` худалдан авалт — `D ≠ 0` бол `purchase_vat_account_id` (1300) `+D`; `VatAmount ≠ 0` бол `reverse_chrg_vat_account_id` (2305) `−VatAmount`. Шалгалт: суурь (`net + ND`) + `D` − `VatAmount` = `net` = нийлүүлэгчийн мөр (R-ACCOUNT-DETERMINATION-08; 08 BR-TAX-82: 2305 = −Σ(amount + non_deductible_amount)).
   - `REVERSE_CHARGE` борлуулалт — VAT G/L мөргүй (R-ACCOUNT-DETERMINATION-08), зөвхөн VAT entry.
   - НӨАТ = 0 бол VAT G/L мөр үүсэхгүй (VAT entry үүснэ, BR-PST-24).
   - Мөр бүрийн тэнцэл: `BaseLine.Amount + Σ VatGlLines.Amount = row.Amount + row.VatAmount` (NORMAL), `= row.Amount` (REVERSE_CHARGE), `= row.VatAmount` (FULL_VAT). Composer үүнийг assert хийнэ.
3. **VAT entry** (Tax writer): `entry_type` = SALE/PURCHASE; `base`, `amount` нь буферийн тэмдэгтэй (борлуулалт сөрөг, худалдан авалт эерэг — R-VAT-18, 040_tax.sql COMMENT; `amount` = хасагдах хэсэг, `non_deductible_amount` = хасагдахгүй хэсэг, 08); `vat_percent`, `vat_identifier`, `vat_category`, `vat_calculation_type`, `ebarimt_tax_type` нь `vat_posting_setup`-ийн snapshot; `bill_to_pay_to_*`, `party_tin`, `country_code` нь харилцагч/нийлүүлэгчийнх; `supplier_ebarimt_id`, `deductible_confirmed` (D-E4) Tax-ийн дүрмээр; `vat_date` = мөрийн `vat_date ?? posting_date` (D-E9); `gl_entry_no` = суурь entry; `tax.gl_entry_vat_entry_link` (суурь entry, VAT entry).
4. VAT entry-ийн бүлэг: **buffer-ийн мөр бүрд нэг** (R-VAT-20). Ижил VAT identifier-тэй ч өөр данс/dimension-тэй мөр тусдаа VAT entry.

#### 5.7.3 Tax writer-ийн engine-д өгөх баталгаа

- `ValidateLockedAsync`: `vat_posting_setup` байгаа, блоклогдоогүй, тооцооны төрөл мөртэй ижил (R-VAT-01, R-VAT-02); НӨАТ-ын огноо `OPEN` НӨАТ-ын үед (`tax.vat_period_closed`, D-E9); НӨАТ-ын зөрүүний хязгаар.
- `WriteAsync`: `ReserveEntryNumbersAsync("VAT_ENTRY", n)` → `INSERT tax.vat_entry` (unnest) → `INSERT tax.gl_entry_vat_entry_link`. Engine-ээс авах: суурь мөрийн `entry_no` (`ctx.GlEntry(key)`), ваучерын `transaction_no`, `posting_date`, `document_*`, `register_no`.
- `ReverseAsync`: §5.10.

### 5.8 `ILedgerWriter` гэрээ (авлага, өглөг, банк, ҮХ, бараа)

```csharp
namespace Erp.GeneralLedger.Contracts.Posting;

public interface ILedgerWriter
{
    string Ledger { get; }     // LedgerCodes.* (мөрийн ISubledgerLine.Ledger-тэй таарна)
    int Order { get; }         // 10 VAT, 15 НХАТ, 20 харилцагч, 30 нийлүүлэгч, 40 банк, 50 ҮХ, 60 бараа, 70 ханш (BR-PST-40)
}

public interface ILedgerWriter<in TLine> : ILedgerWriter where TLine : ISubledgerLine
{
    // Түгжээний дор: нээлттэй entry, тулгалтын дүн, блок, касс сөрөг болох эсэх … Бүх алдааг буцаана.
    ValueTask<IReadOnlyList<PostingError>> ValidateLockedAsync(IPostingContext ctx, IReadOnlyList<TLine> lines, CancellationToken ct);
    // Өөрийн schema-д INSERT, тулгалтын fn_ledger_update. Дугаарыг ctx.ReserveEntryNumbersAsync-ээр.
    ValueTask WriteAsync(IPostingContext ctx, IReadOnlyList<TLine> lines, CancellationToken ct);
}

public interface IReversibleLedger : ILedgerWriter
{
    // Гүйлгээний энэ ledger-ийн мөрийг буцааж болох эсэх (R-GL-POSTING-39-ийн хэсэг)
    ValueTask<IReadOnlyList<PostingError>> ValidateReversalAsync(IPostingReadContext ctx, IReadOnlyList<long> transactionNos, CancellationToken ct);
    // Толин тусгал мөр бичих; plan: эх transaction → шинэ transaction, эх G/L entry → шинэ G/L entry
    ValueTask ReverseAsync(IPostingContext ctx, ReversalPlan plan, CancellationToken ct);
    // Залруулгын санал (§5.11): энэ ledger-ийн мөрийг журналын мөр болгох
    ValueTask<IReadOnlyList<CorrectionLine>> DescribeForCorrectionAsync(IPostingReadContext ctx, long transactionNo, CancellationToken ct);
}

public interface IPostedDocumentWriter
{
    ValueTask<IReadOnlyList<PostingError>> LockSourceAsync(IPostingContext ctx, CancellationToken ct);  // FOR UPDATE, row_version, setup stamp
    ValueTask WriteAsync(IPostingContext ctx, CancellationToken ct);                                       // posted баримт, ноорог устгах, eBarimt
}

public interface IPostingContext : IPostingReadContext
{
    PostingMode Mode { get; }
    long RegisterNo { get; }
    VoucherInfo Voucher(string voucherKey);              // TransactionNo, DocumentNo, PostingDate, DocumentType, SourceCode, ReasonCodeId
    GlEntryInfo GlEntry(string glLineKey);               // EntryNo, TransactionNo, GlAccountId, Amount, DimensionSetId
    ValueTask<long> ReserveEntryNumbersAsync(string ledger, int count, CancellationToken ct);   // эхний дугаар; мужийг бүртгэнэ
    void Produced(string ledger, string lineKey, long entryNo);   // posted document writer-т (жишээ: cust_ledger_entry_no)
    long? ProducedEntryNo(string ledger, string lineKey);
    void AddOutbox(OutboxMessageDraft draft);
    void AddResultRows(IEnumerable<LedgerRowView> rows);  // preview/хариуны tab (15 UX-POST-09)
}
public interface IPostingReadContext { ITransactionalSession Session { get; } CompanySettings Settings { get; } Guid? UserId { get; } }
```

**Бүртгэл.** Модуль бүр `Add<M>Module()`-д `services.AddLedgerWriter<CustomerLedgerLine, CustomerLedgerWriter>()` хэлбэрээр бүртгэнэ. `ILedgerWriterRegistry.Group(doc)` нь `SubledgerLines`-ийг `Ledger` кодоор бүлэглэж writer-тэй хослуулна; writer-гүй код → `InternalPostingException` (BR-PST-41).

**Writer-ийн шаардлага (engine-ийн гэрээ):**

| # | Шаардлага | Учир |
|---|---|---|
| W1 | Мөр бүр `transaction_no = ctx.Voucher(...).TransactionNo`, `posting_date` = ваучерынх, `gl_register_no = ctx.RegisterNo` | DB `trg_*_transaction_check` (`ERB02`, `ERL01`) |
| W2 | `dimension_set_id` = холбогдох G/L мөрийнх (харилцагчийн мөр: header set) | R-DIMENSIONS-NOSERIES-AUDIT-25 |
| W3 | `source_code`, `reason_code_id` = ваучерынх | R-DIMENSIONS-NOSERIES-AUDIT-37, -39 |
| W4 | `entry_no`-г зөвхөн `ReserveEntryNumbersAsync`-ээр, нэг удаа, блокоор | BR-PST-28 |
| W5 | Тулгалтын (apply) өөрчлөлтийг зөвхөн `platform.fn_ledger_update`; кэш (`remaining_amount`, `open`) нь trigger | D-C4, INV-04 |
| W6 | `WriteAsync` дотор гадаад IO, commit, savepoint-гүй | BR-PST-03 |
| W7 | Preview-д ч ижил код (контекстын `Mode`-оор салаалахгүй) | BR-PST-52 |
| W8 | Хариуны мөр (`AddResultRows`) нь PII-гүй, `qrData`/`lottery`-гүй | D-J3 |
| W9 | `count = 0` бол `ReserveEntryNumbersAsync` дуудахгүй; нэг ledger-ийг run-д нэг л удаа нөөцлөнө (2 дахь дуудлага → `InternalPostingException`) | `fn_next_entry_no` `22023`; register-ийн муж тасралтгүй |

**Гол writer-ууд (R1):**

| Writer | `Ledger` | Бичих хүснэгт | Тайлбар |
|---|---|---|---|
| `VatEntryWriter` (Tax) | `VAT_ENTRY` | `tax.vat_entry`, `tax.gl_entry_vat_entry_link` | §5.7.3 |
| `CustomerLedgerWriter` (Parties) | `CUST_LEDGER_ENTRY` | `party.cust_ledger_entry`, `party.detailed_cust_ledger_entry` | `INITIAL` detailed мөр (дүн 0 ч гэсэн, R-SUBLEDGERS-APPLICATION-03), `applies_to_*`-оор тулгалт ([06](./06-sales-receivables.md) §5.13) |
| `VendorLedgerWriter` (Parties) | `VENDOR_LEDGER_ENTRY` | `party.vendor_ledger_entry`, `party.detailed_vendor_ledger_entry` | Нийлүүлэгчийн нэхэмжлэхийн дугаар давхардахгүй (`ux_vendor_ledger_entry__vendor_doc_no`) |
| `BankLedgerWriter` (CashBank) | `BANK_LEDGER_ENTRY` | `bank.bank_ledger_entry`, `bank.posted_cash_voucher` | Касс сөрөг болохгүй (урьдчилж шалгана; DB `ERC01`), МХ-1/МХ-2: ваучерын `document_no` кассын цувралаас бол тэр дугаар, эс бөгөөс (бэлэн борлуулалт `SI-…`) кассын цувралаас тусдаа завсаргүй дугаар (09 BR-BNK-20, -21) |

### 5.9 Register ба hash hook

```sql
-- Хамгийн сүүлд (BR-PST-43). gl_transaction/gl_entry/ledger-ийн register FK нь DEFERRABLE INITIALLY DEFERRED.
INSERT INTO gl.gl_register (id, tenant_id, company_id, no, from_entry_no, to_entry_no,
                            from_vat_entry_no, to_vat_entry_no, source_code, journal_template_code, journal_batch_code, request_id)
VALUES (@id, @t, @c, @registerNo, @fromEntry, @toEntry, @fromVat, @toVat, @sourceCode, @tmpl, @batch,
        nullif(current_setting('app.request_id', true), ''));
```

- `from_entry_no..to_entry_no` нь энэ run-ий бүх G/L entry-г яг хамарна (BR-PST-28-аар дараалсан). Буцаалтын run-д ч мөн.
- **Hash (CR-15-ийн дараа, R1 Should):** `hash = SHA-256(hash_version ‖ prev_hash ‖ canonical(register) ‖ canonical(gl_transaction[]) ‖ canonical(gl_entry[] entry_no-оор) ‖ contributors[])`; `prev_hash` = тухайн компанийн өмнөх register-ийн `hash` (эхнийх 32 тэг байт). Contributor (`ILedgerHashContributor`, Tax-ийн `vat_entry`) нь санах ойн мөрөөс каноник байт өгнө. Advisory lock-ийн дор тооцох тул гинж шугаман. Каноник формат ([02](./02-architecture.md) §8.7): UTF-8, тогтмол талбарын дараалал, дүн `0.0000`, огноо ISO.

### 5.10 Буцаалт (гүйлгээ ба register)

`IReversalService` (GL.Contracts) нь нийтийн `:reverse`-ийг ба бусад модулийн (Tax-ийн НӨАТ-ын хаалт, R2-т элэгдэл, ханш) өөрийн нөхцөлтэй буцаалтыг гүйцэтгэнэ. Нийтийн API-д зөвшөөрөх source code нь §3.7-ийн "✔" жагсаалт; модулийн дуудлага `allowedSourceCodes`-оо өгнө.

```mermaid
sequenceDiagram
    autonumber
    actor U as Нягтлан
    participant API as Api pipeline
    participant RS as ReversalService (GL)
    participant PE as PostingEngine
    participant RL as IReversibleLedger-ууд
    participant DB as PostgreSQL
    U->>API: POST /gl-transactions/{id}:reverse {reasonCodeId} (Idempotency-Key)
    API->>DB: BEGIN, fn_set_context, idempotency_key
    API->>RS: Reverse(scope = Transaction | Register)
    RS->>PE: PostAsync(ReversalSource, Post)
    PE->>DB: fn_lock_company_posting
    PE->>RS: BuildAsync (түгжээний дор)
    RS->>DB: эх gl_transaction, gl_entry (FOR SHARE), үе, данс
    RS->>RL: ValidateReversalAsync (тулгалт, хуулга, НӨАТ хаагдсан)
    RS-->>PE: PostingDocument (эх огноо, эх дугаар, −amount)
    PE->>DB: дугаар, INSERT gl_transaction/gl_entry (reversed_entry_no)
    PE->>DB: fn_ledger_update эх entry (reversed, reversed_by_entry_no), эх гүйлгээ (reversed_by_transaction_no)
    PE->>RL: ReverseAsync (VAT, авлага/өглөг, банк толин тусгал)
    PE->>DB: INSERT gl_register (REVERSAL); эх register.reversed (бүгд буцаагдсан бол)
    API->>DB: COMMIT
    API-->>U: 201 ReversalResult
```

```csharp
sealed class ReversalSource(ReversalRequest req, ReversalPolicy policy) : IPostingDocumentSource
{
    public async ValueTask<PostingDocument?> BuildAsync(IPostingReadContext ctx, CancellationToken ct)
    {
        // 1. Эх гүйлгээ(үүд)-ийг түгжээний дор унших
        var txs = req.Scope == ReversalScope.Register
            ? await Q.TransactionsOfRegister(ctx, req.RegisterNo, ct)           // transaction_no DESC
            : [await Q.Transaction(ctx, req.TransactionNo, ct)];                 // 404 api.resource_not_found
        if (req.ReasonCodeId is null) Fail("gl.reason_code_required");          // BR-PST-20
        var errors = new PostingErrorList();
        if (req.Scope == ReversalScope.Register)
        {
            var reg = await Q.Register(ctx, req.RegisterNo, ct);
            if (reg.Reversed) errors.Add("gl.register_already_reversed");
            if (reg.SourceCode == "REVERSAL" || !policy.Allows(reg.SourceCode)) errors.Add("gl.register_not_reversible");
        }
        foreach (var t in txs)                                                   // BR-PST-45, -46
        {
            if (t.ReversedByTransactionNo is not null) errors.Add("gl.transaction_already_reversed", new { t.TransactionNo });
            if (t.ReversesTransactionNo is not null || t.SourceCode == "REVERSAL") errors.Add("gl.reversal_not_reversible", t);
            else if (t.SourceCode is "SALES" or "PURCHASES") errors.Add("gl.reversal_use_credit_memo", t);
            else if (!policy.Allows(t.SourceCode)) errors.Add("gl.reversal_not_reversible", t);
            errors.AddRange(await _guards.CheckPostingDateAsync(ctx, t.PostingDate, t.IsClosing, ct));   // gl.period_closed …
            errors.AddRange(await _guards.CheckAccountsNotBlockedAsync(ctx, t.Entries, ct));
        }
        foreach (var rl in _reversibleLedgers)
            errors.AddRange(await rl.ValidateReversalAsync(ctx, txs.Select(t => t.TransactionNo).ToList(), ct));
            // Parties: gl.reversal_entries_applied; CashBank: bank.entry_reconciled, bank.cash_negative_balance;
            // Tax: gl.reversal_vat_settled, tax.vat_period_closed
        if (errors.Any) throw new PostingValidationException(errors);

        // 2. Толин тусгал ваучер — эх гүйлгээ бүрд нэг (BR-PST-47, -48)
        var vouchers = txs.Select((t, i) => new PostingVoucher {
            Key = $"R{i + 1}",
            Numbering = new VoucherNumbering.Existing(t.DocumentNo),             // BR-PST-30
            DocumentType = t.DocumentType, PostingDate = t.PostingDate, IsClosing = t.IsClosing,
            SourceCode = "REVERSAL", ReasonCodeId = req.ReasonCodeId,
            Description = Trunc($"Буцаалт: {t.Description ?? t.DocumentNo}", 100),
            ReversesTransactionNo = t.TransactionNo,
            GlLines = t.Entries.OrderByDescending(e => e.EntryNo).Select(e => new GlPostingLine {
                Key = $"R{i + 1}/E{e.EntryNo}", GlAccountId = e.GlAccountId,
                Amount = -e.Amount, VatAmount = -e.VatAmount,                    // эсрэг тэмдэг → эсрэг багана (D-C3)
                Origin = LineOrigin.SystemGenerated, DimensionSetId = e.DimensionSetId,
                GenPostingType = e.GenPostingType, Groups = e.Groups, VatDate = e.VatDate,
                DocumentType = e.DocumentType, DocumentDate = e.DocumentDate, ExternalDocumentNo = e.ExternalDocumentNo,
                Description = e.Description, BalAccount = e.BalAccount, Source = e.Source,
                SourceCurrency = e.SourceCurrency?.Negate(), ReversedEntryNo = e.EntryNo }).ToList(),
            SubledgerLines = [new ReversalMarker(t.TransactionNo)]               // IReversibleLedger-уудыг дуудуулна
        }).ToList();
        return new PostingDocument {
            Run = new("REVERSAL", "REVERSAL", new SourceRef("gl.gl_transaction", txs[0].Id, txs[0].DocumentNo), null, null),
            Vouchers = vouchers };
    }
}
```

Engine нь `ReversedEntryNo`-той мөрийг insert хийсний дараа (ижил batch-д):

```sql
-- эх entry бүрд (BR-PST-47)
SELECT platform.fn_ledger_update('gl.gl_entry', @origEntryNo,
       jsonb_build_object('reversed', true, 'reversed_by_entry_no', @newEntryNo));
-- шинэ entry нь INSERT үед reversed = true, reversed_entry_no = @origEntryNo (CHECK хангагдана)
-- эх гүйлгээ
SELECT platform.fn_ledger_update('gl.gl_transaction', @origTxNo, jsonb_build_object('reversed_by_transaction_no', @newTxNo));
-- эх register: бүх гүйлгээ нь буцаагдсан бол (BR-PST-48)
SELECT platform.fn_ledger_update('gl.gl_register', @origRegisterNo, '{"reversed": true}')
 WHERE NOT EXISTS (SELECT 1 FROM gl.gl_transaction
                    WHERE company_id = @c AND gl_register_no = @origRegisterNo AND reversed_by_transaction_no IS NULL);
```

`ReversalPlan` (`IReversibleLedger.ReverseAsync`-д): `{ origTxNo → newTxNo, origGlEntryNo → newGlEntryNo, newRegisterNo }`.

**`ReversalMarker`-ийн боловсруулалт.** `ReversalMarker : ISubledgerLine` нь `Ledger = "REVERSAL"` (writer-ийн бүртгэлд **ороогүй** тусгай код), `GlLineKeys` = тухайн ваучерын бүх G/L мөрийн key. Engine `Group(doc)`-д энэ кодыг writer хайхгүй (BR-PST-41-ийн үл хамаарах); `ValidateLockedAsync`-ийн оронд `ValidateReversalAsync` аль хэдийн `BuildAsync`-д түгжээний дор дуудагдсан. `WriteAsync` алхамд engine бүх `IReversibleLedger`-ийг `Order` дарааллаар (10 VAT → 20 харилцагч → 30 нийлүүлэгч → 40 банк …) `ReverseAsync(ctx, plan)`-ээр **нэг удаа** (run-ий бүх ваучерыг агуулсан нэг plan-аар) дуудна; тухайн гүйлгээнд мөргүй ledger юу ч бичихгүй (W9). Бусад `ISubledgerLine` ба `ReversalMarker`-ийг нэг ваучерт холихгүй.

| Writer | `ValidateReversalAsync` | `ReverseAsync` |
|---|---|---|
| Tax | VAT entry `closed = true` → `gl.reversal_vat_settled`; `vat_date`-ийн НӨАТ-ын үе `OPEN` биш → `tax.vat_period_closed` | Шинэ `vat_entry`: `base`, `amount`, `non_deductible_*`, `vat_difference` эсрэг тэмдэгтэй, ижил `vat_date`, `reversed = true`, `reversed_entry_no`, `gl_entry_no` = шинэ суурь entry (эх link → plan); эх: `fn_ledger_update` `reversed`, `reversed_by_entry_no`; шинэ link (R-VAT-20) |
| Parties | Гүйлгээний CLE/VLE-д `entry_type ≠ 'INITIAL'` ба `unapplied = false` detailed мөр байвал → `gl.reversal_entries_applied` (R-SUBLEDGERS-APPLICATION-32) | Толин тусгал CLE/VLE (`amount` эсрэг, `reversed_entry_no`) + `INITIAL` detailed; эх ба шинэ entry-г хооронд нь тулгаж хоёуланг хаана (`APPLICATION` мөр, `application_no`); эх: `reversed`, `reversed_by_entry_no` ([06](./06-sales-receivables.md)) |
| CashBank | BLE `open = false` эсвэл `statement_no IS NOT NULL` → `bank.entry_reconciled` (R-BANK-CASH-39); буцаалтын дараа касс сөрөг → `bank.cash_negative_balance` | Толин тусгал BLE (`amount` эсрэг, `remaining_amount = 0`, `open = false`, `reversed = true`, `reversed_entry_no`); эх: `remaining_amount = 0`, `open = false`, `closed_by_entry_no`, `reversed`, `reversed_by_entry_no`. МХ-1/МХ-2 шинээр үүсэхгүй |

### 5.11 Хаалттай үеийн залруулгын санал (FR-GL-014)

Эх үе `CLOSED`/`LOCKED` (тиймээс `:reverse` боломжгүй) үед сервер толин тусгал **журналын мөрийн санал** буцаана; клиент `POST /journals/{id}/lines`-аар ноорог болгоно (15 §5.9). Posting хийхгүй.

```csharp
public async Task<CorrectionProposal> ProposeCorrection(long transactionNo, DateOnly correctionDate, Guid reasonCodeId, CancellationToken ct)
{
    var t = await Q.Transaction(_ctx, transactionNo, ct);
    if (t.SourceCode is "SALES" or "PURCHASES") throw Problem("gl.reversal_use_credit_memo");
    if (!PublicReversalPolicy.Allows(t.SourceCode) || t.ReversesTransactionNo is not null) throw Problem("gl.reversal_not_reversible");
    if (t.ReversedByTransactionNo is not null) throw Problem("gl.transaction_already_reversed");
    var origDateErrs = await _guards.CheckPostingDateAsync(_ctx, t.PostingDate, isClosing: false, ct);
    if (!origDateErrs.Any) throw Problem("gl.correction_use_reversal");                                         // BR-PST-51: эх огноонд буцаах боломжтой
    var errs = await _guards.CheckPostingDateAsync(_ctx, correctionDate, isClosing: false, ct);                  // шинэ огноо OPEN, цонх дотор
    if (errs.Any) throw new PostingValidationException(errs);

    var lines = new List<CorrectionLine>();
    // (1) Дэд дэвтрийн мөр → харилцагч/нийлүүлэгч/мөнгөний дансны мөр (хяналтын G/L entry-г орлоно).
    //     Tax-ийн DescribeForCorrectionAsync хоосон буцаана: НӨАТ (2)-ын бүлгээр дахин тооцогдоно.
    foreach (var rl in _reversibleLedgers) lines.AddRange(await rl.DescribeForCorrectionAsync(_ctx, transactionNo, ct));
    // (2) "Суурь" мөр = хэрэглэгчийн G/L entry (system_created = false) ∪ VAT entry-тэй холбоотой суурь entry
    //     (tax.gl_entry_vat_entry_link; FULL_VAT-ын 1300 мөр SystemDerived боловч энд орно). Дүн нь журналын gross дүн:
    //     NORMAL: −(amount + v.amount)  (ND нь amount-д шингэсэн, v.amount = хасагдах хэсэг)
    //     REVERSE_CHARGE: −(amount − v.non_deductible_amount)  (журналын дүн цэвэр, R-VAT-16);  FULL_VAT, НӨАТ-гүй: −amount
    foreach (var e in t.Entries.Where(e => !e.SystemCreated || e.VatEntry is not null))
        lines.Add(new CorrectionLine("GL_ACCOUNT", e.GlAccountId,
            Amount: -(e.VatEntry switch {
                { VatCalculationType: "NORMAL" } v         => e.Amount + v.Amount,
                { VatCalculationType: "REVERSE_CHARGE" } v => e.Amount - v.NonDeductibleAmount,
                _                                          => e.Amount }),
            GenPostingType: e.GenPostingType, Groups: await ResolveGroupIdsAsync(e.Groups, ct),   // байхгүй бол gl.correction_group_missing
            DimensionSetId: e.DimensionSetId, Description: Trunc($"Залруулга: {t.DocumentNo}", 100)));
    // (3) VAT G/L мөр (1300/2300/2305) ба хяналтын дансны entry-г алгасна (1, 2-оор дахин үүснэ)
    Debug.Assert(lines.Sum(l => l.Amount) == 0);                    // Σ эх entry = 0 тул саналын Σ = 0
    return new CorrectionProposal(correctionDate, reasonCodeId, OriginalTransactionNo: transactionNo, OriginalDocumentNo: t.DocumentNo, lines);
}
```

- Эх гүйлгээтэй холбох багана схемд алга (CR-PST-01). Түр шийдэл: мөрийн `description` = "Залруулга: GJ-2026-00042", `comment` = `{"correctsTransactionNo": 119}`.
- НӨАТ-ын хувь өөрчлөгдсөн бол дахин тооцсон НӨАТ эхнийхээс өөр байж болно — санал анхааруулга `W-03`-тэй.

### 5.12 Preview

1. Endpoint `…:preview` (Idempotency-Key-гүй, `If-Match` сонголттой; 14 API-ACT-09..12). Rate limit хэрэглэгч бүрд 30/мин (`platform.rate_limited`).
2. A үе ба B үе бүтнээрээ (`PostingMode.Preview`): түгжээ, дугаар, writer, posted document writer, eBarimt-ийн дараалал, outbox, register.
3. `SET CONSTRAINTS ALL IMMEDIATE` — deferred trigger (тэнцэл `ERB01`, касс `ERC01`, register-ийн FK) одоо ажиллана; алдаа бол Post-тэй ижил код (BR-PST-53).
4. `PostingResult.MaskForPreview()`: хуулийн дугаар `***`; `transactionNo`, `entryNo`, writer-ийн `entryNo` нь run доторх харьцангуй дугаар (1..n); `registerNo = null`.
5. `session.MarkRollbackOnly()` → pipeline ROLLBACK. Шинэ dimension set, counter, outbox бүгд буцна; кэшид юу ч орохгүй; `audit.posting_log` бичигдэхгүй; C үе ажиллахгүй.

### 5.13 Жилийн хаалт (D-D4, FR-GL-026)

`YearEndCloseService` нь `POST /fiscal-years/{id}:preview-close` (Preview) ба `:close` (Post)-ыг гүйцэтгэнэ. Журналын ноорог ашиглахгүй (төлөвгүй): тооцоо ба бичилт нэг transaction-д, түгжээний дор (BR-PST-55). Template CLOSING / batch YEAR_END нь зөвхөн код ба цувралаар (`CL`) оролцоно.

```csharp
sealed class YearEndCloseSource(Guid fiscalYearId, bool createReTransferDraft) : IPostingDocumentSource
{
    public async ValueTask<PostingDocument?> BuildAsync(IPostingReadContext ctx, CancellationToken ct)
    {
        var fy = await Q.FiscalYearForUpdate(ctx, fiscalYearId, ct);                       // FOR UPDATE
        var y = fy.Year; var start = new DateOnly(y, 1, 1); var end = new DateOnly(y, 12, 31);
        var errors = new PostingErrorList();
        if (fy.Status == "LOCKED") errors.Add("gl.fiscal_year_locked");
        var open = await Q.OpenPeriods(ctx, fy.Id, ct);                                     // status = 'OPEN' (CLOSED ба LOCKED сар хаагдсанд тооцогдоно)
        if (open.Count > 0) errors.Add("gl.year_close_periods_open", new { year = y, periods = open.Select(p => p.Name) });
        // 12-р сар LOCKED бол хаалтын ваучер бичигдэхгүй → engine-ийн CheckLockedAsync gl.period_locked өгнө (BR-PST-54)
        var prev = await Q.FiscalYearByYear(ctx, y - 1, ct);                                 // R-PERIODS-REPORTING-05: дарааллаар
        if (prev is { Status: "OPEN" } && await Q.HasEntriesAsync(ctx, prev.StartingDate, prev.EndingDate, ct))
            errors.Add("gl.year_close_previous_year_open", new { year = y, previousYear = y - 1 });
        var setup = await Q.GlSetup(ctx, ct);
        var result = setup.CurrentYearResultAccount;                                        // 3500
        if (result is null) errors.Add("gl.year_close_result_account_missing");
        else if (result.AccountType != "POSTING" || result.IncomeBalance != "BALANCE_SHEET"
                 || result.AccountCategory is not (null or "EQUITY") || result.Blocked)
            errors.Add("gl.year_close_result_account_invalid", new { account = result.No });
        errors.AddRange(await _guards.CheckWindowAsync(ctx, end, ct));                      // gl.posting_date_outside_window
        if (errors.Any) throw new PostingValidationException(errors);

        // Орлогын тайлангийн данс бүрийн цэвэр дүн (хаалтын бичилт орно → дахин ажиллуулахад зөвхөн зөрүү)
        var rows = await ctx.Session.QueryAsync<(Guid AccountId, string No, bool Blocked, decimal Net)>("""
            SELECT a.id, a.no, a.blocked, sum(e.amount)
              FROM gl.gl_entry e JOIN gl.gl_account a ON a.company_id = e.company_id AND a.id = e.gl_account_id
             WHERE e.company_id = @c AND e.posting_date BETWEEN @start AND @end
               AND a.income_balance = 'INCOME_STATEMENT'
             GROUP BY a.id, a.no, a.blocked
            HAVING sum(e.amount) <> 0
             ORDER BY a.no
            """, new { c = ctx.Session.CompanyId, start, end }, ct);
        var blocked = rows.Where(r => r.Blocked).Select(r => r.No).ToList();
        if (blocked.Count > 0) throw new PostingValidationException("gl.account_blocked", new { accounts = blocked });   // BR-PST-54
        if (rows.Count == 0)                                                                // зөрүү 0 → G/L no-op (BR-PST-56)
        {
            // Ваучергүй ч жилийн төлөв ба шилжүүлгийн санал шинэчлэгдэнэ (BR-PST-56, -57): ижил transaction, түгжээний дор.
            // Preview горимд ч ажиллаж (ROLLBACK болно) хариунд effects-ийг харуулна.
            await new FiscalYearCloseWriter(fy.Id, createReTransferDraft).ApplyWithoutVoucherAsync(ctx, ct);
            return null;                                                                    // PostingResult.Posted = false
        }

        var lines = rows.Select(r => new GlPostingLine {
            Key = $"C/{r.No}", GlAccountId = r.AccountId, Amount = -r.Net,                 // BR-PST-55
            Origin = LineOrigin.SystemGenerated, Description = $"{y} оны орлого, зардлын хаалт" }).ToList();
        lines.Add(new GlPostingLine { Key = "C/RESULT", GlAccountId = result!.Id, Amount = rows.Sum(r => r.Net),
            Origin = LineOrigin.SystemGenerated, Description = $"{y} оны тайлант үеийн ашиг (алдагдал)" });

        return new PostingDocument {
            Run = new("CLSINCOME", "YEAR_CLOSE", new SourceRef("gl.fiscal_year", fy.Id, y.ToString()), "CLOSING", "YEAR_END"),
            Vouchers = [new PostingVoucher { Key = "C", Numbering = new VoucherNumbering.FromSeries("CL"),
                         DocumentType = "NONE", PostingDate = end, IsClosing = true,
                         Description = $"{y} оны жилийн хаалт", GlLines = lines }],
            PostedDocument = new FiscalYearCloseWriter(fy.Id, createReTransferDraft) };
    }
}
```

`FiscalYearCloseWriter` (ижил transaction, Post ба Preview хоёуланд):
- `LockSourceAsync` (дугаар олгохоос өмнө, BR-PST-61): `fiscal_year` аль хэдийн `FOR UPDATE`; `createReTransferDraft` бол GENERAL/DEFAULT `journal_batch`-ийг `FOR UPDATE` (байхгүй бол анхааруулга `W-06`, ноорог алгасна).
- `WriteAsync` (ваучертай) ба `ApplyWithoutVoucherAsync` (зөрүү 0) хоёулаа:
1. `UPDATE gl.fiscal_year SET status = 'CLOSED', closing_transaction_no = coalesce(@tx, closing_transaction_no), closed_at = now(), closed_by = @user WHERE company_id = @c AND id = @fy` (`@tx` = энэ run-ий хаалтын гүйлгээ, no-op үед NULL; BR-PST-57). `LOCKED` жилд DB `ERP02` → `gl.fiscal_year_locked` (урьдчилж шалгасан тул ховор).
2. `createReTransferDraft` ба санхүүгийн жил Y+1 байгаа бол: өмнөх батлагдаагүй саналын мөрийг (`comment = '{"kind":"RE_TRANSFER","year":Y}'`, тэмдэгт мөрийн тэнцүү) устгана; `B = Σ amount (3500, posting_date ≤ (Y+1)-01-01)` (энэ transaction-ий хаалтын бичилт ба аль хэдийн батлагдсан шилжүүлэг орно). `B ≠ 0` бол GENERAL/DEFAULT batch-д хоёр мөр (`account_type = GL_ACCOUNT`, `gen_posting_type = NONE`, `dimension_set_id = 0`, `system_created = false`): `3500: amount = amount_lcy = −B`, `3400 (retained_earnings_account_id): amount = amount_lcy = +B`, `posting_date = (Y+1)-01-01`, `document_no` = `JNL_DRAFT`-ийн дараагийн (хоёр мөр ижил дугаар → нэг ваучер), `line_no` = batch-ийн сүүлийн + 10000, +20000, тайлбар "{Y} оны ашгийг хуримтлагдсан ашигт шилжүүлэх", `comment` = маркер; batch-ийн `row_version + 1` (BR-PST-58). Y+1 байхгүй бол анхааруулга `W-04`; `retained_earnings_account_id` NULL бол `W-06`-тай адил ноорог алгасна (`gl.year_close_result_account_missing`-ийн мессежтэй анхааруулга).
3. Хариунд `closingVoucher` (no-op үед null), `fiscalYearStatus`, `retainedEarningsDraft` (journalId, мөр эсвэл null), `warnings[]` гарна. Outbox `gl.fiscal_year.closed` (§9.1) хоёр тохиолдолд.

**Rerun-ийн жишээ** (FR-GL-026 AC2): 12-р сарыг дахин нээхэд (Owner, 13 §8.4) жил ч `OPEN` болно (13 SEC-POST-04); нэмэлт зардал бичээд, сарыг дахин хаагаад `:close`-ийг дуудна → зөвхөн зөрүүгийн ваучер `CL-YYYY-00002` (E-I), жил дахин `CLOSED`. Хэрэв нээлтийн хооронд зөвхөн балансын данс хөдөлсөн бол (зөрүү 0) ваучер үүсэхгүй ч жил `CLOSED` болно (no-op хаалт). Хаалтын шалгах хуудас (үе ба хаалтын spec) нь "Хаалт хийгдсэний дараа өөрчлөгдсөн жил" анхааруулгыг харуулна (13 SEC-POST-11).

**No-op хаалт ба engine.** `BuildAsync` `null` буцаавал engine `PostingResult.NothingToPost` (`posted = false`) өгнө: `gl_register`, `posting_log`, дугаар үүсэхгүй. Advisory lock ба `fiscal_year FOR UPDATE` commit хүртэл барина. Idempotency мөр нь 200 хариутайгаар хадгалагдана (давталт replay).

### 5.14 Idempotency

Pipeline-ийн `IdempotencyFilter`-ийг **14 §7 эзэмшинэ** (API-IDEM-01..12); доорх нь engine-тэй холбогдох хэсгийн хураангуй (Z-PST-14). Шат 0 нь A үеэс өмнө, `INSERT` нь B үеийн transaction дотор engine-ээс өмнө ажиллана:

```csharp
// Post горим (preview-д алгасна, API-IDEM-11)
// API-IDEM-03: METHOD \n path(+эрэмбэлсэн query, companyId-г агуулна) \n principalId \n JCS(body) (RFC 8785)
var hash = Sha256($"{method}\n{pathAndSortedQuery}\n{principalId}\n{Jcs(body)}");

// ---- Шат 0 (API-IDEM-12): A үеэс өмнө, transaction-гүй, түгжээгүй ----
var pre = await db.QuerySingleOrDefaultAsync("SELECT request_hash, status, response_code, response_body FROM integration.idempotency_key WHERE tenant_id = @t AND key = @key");
if (pre is { Status: "COMPLETED" })
    return pre.RequestHash == hash ? Replay(pre) : Problem(422, "api.idempotency_key_reused");   // handler ажиллахгүй
// ... A үе (handler: угсралт, ValidateAsync) ...

// ---- B үе: BEGIN; fn_set_context; SET LOCAL lock_timeout = '5s' ----
var inserted = await s.ExecAsync("""
    INSERT INTO integration.idempotency_key (id, tenant_id, key, user_id, http_method, request_path, request_hash, status)
    VALUES (@id, @t, @key, @user, @method, @path, @hash, 'IN_PROGRESS')
    ON CONFLICT (tenant_id, key) DO NOTHING
    """, ...);                                   // зэрэг ирсэн ижил түлхүүр энд хүлээнэ (unique index); 55P03 → 409 api.idempotency_in_progress + Retry-After: 1
if (inserted == 0)
{
    var k = await s.QuerySingleAsync("SELECT request_hash, status, response_code, response_body, resource_id FROM integration.idempotency_key WHERE tenant_id = @t AND key = @key");
    s.MarkRollbackOnly();
    if (k.RequestHash != hash) return Problem(422, "api.idempotency_key_reused");
    if (k.Status == "COMPLETED") return Replay(k.ResponseCode, k.ResponseBody);          // Idempotent-Replayed: true
    return Problem(409, "api.idempotency_in_progress");                                  // Retry-After: 1 (зөвхөн хуучин session үлдсэн тохиолдолд)
}
var result = await next();                                                                // handler → engine
await s.ExecAsync("UPDATE integration.idempotency_key SET status = 'COMPLETED', response_code = @code, response_body = @body, resource_id = @rid WHERE tenant_id = @t AND key = @key", ...);
// COMMIT pipeline хийнэ. Алдаа (422/409/412/500) → ROLLBACK → түлхүүрийн мөр үлдэхгүй → засаад ижил түлхүүрээр дахин илгээж болно.
```

- `response_body` нь `PostingResult`-ийн JSON (`qrData`/`lottery`-гүй; CHECK `fn_has_forbidden_ebarimt_keys`). POS-ийн хэвлэх payload (C үе) хадгалагдахгүй; replay хариунд байхгүй (12).
- Байгалийн idempotency (BR-PST-62) нь өөр түлхүүртэй давхар хүсэлтийг хамгаална.

### 5.15 Түгжээ, timeout, дахин оролдлого

| Алхам | Түгжээ | Хугацаа | Алдаа |
|---|---|---|---|
| Idempotency мөр | `integration.idempotency_key` UNIQUE (tenant, key) | `lock_timeout` 5 s | `55P03` → `409 api.idempotency_in_progress`, `Retry-After: 1` (14 API-IDEM-07) |
| Компанийн posting | `pg_advisory_xact_lock(hashtextextended('post:'‖tenant‖':'‖company, 0))` | 5 s | `55P03` → `503 api.lock_timeout`, `Retry-After: 2` |
| Эх ноорог | `FOR UPDATE` (эх модуль) | 5 s | 412 / 409 |
| Хуулийн дугаар | `number_series_line` ба `number_series_counter` `FOR UPDATE` (`fn_next_document_no`) | 5 s | `ERN0x` → 422 |
| Ledger counter | `platform.ledger_counter` мөр (`ON CONFLICT DO UPDATE`) | 5 s | — |
| Тулгалт | Дэд дэвтрийн мөр (`fn_ledger_update`) | 5 s | — |
| Statement | — | 30 s (жилийн хаалт, импорт: 120 s) | `57014` → 503 |

- Бүх түгжээ transaction-level; COMMIT/ROLLBACK-аар чөлөөлөгдөнө. Session-level advisory lock ашиглахгүй.
- Hash давхцал нь хоёр компанийг хооронд нь хүлээлгэх л үр дагавартай (буруу үр дүн гаргахгүй).
- `40001`/`40P01` (READ COMMITTED-д ховор) → pipeline шинэ transaction-д **нэг удаа** бүх командыг давтана (A үеийг оролцуулан), дахин бүтэлгүйтвэл `503 api.lock_timeout`.
- Ижил компанийн үйлдлүүд (posting, үе хаах/нээх, жилийн хаалт, НӨАТ-ын хаалт) бүгд ижил түгжээ авдаг тул хоорондоо цуваа; өөр компани зэрэг ажиллана (NFR-016).

### 5.16 Гүйцэтгэл: олноор бичих

```sql
-- ≤ 1 000 мөр: нэг statement (BR-PST-65)
INSERT INTO gl.gl_entry (id, tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date,
       is_closing, document_type, document_no, document_date, external_document_no, description, amount, vat_amount,
       gen_posting_type, gen_bus_posting_group, gen_prod_posting_group, vat_bus_posting_group, vat_prod_posting_group,
       vat_date, bal_account_type, bal_account_id, source_type, source_id, source_no, source_currency_code,
       source_currency_amount, dimension_set_id, source_code, reason_code_id, journal_template_code, journal_batch_code,
       system_created, reversed, reversed_entry_no)
SELECT * FROM unnest(@id::uuid[], @tenant::uuid[], @company::uuid[], @entry_no::bigint[], @tx::bigint[], @reg::bigint[],
       @account::uuid[], @posting_date::date[], @is_closing::bool[], @doc_type::text[], @doc_no::text[], @doc_date::date[],
       @ext_doc::text[], @descr::text[], @amount::numeric[], @vat_amount::numeric[], @gpt::text[], @gbus::text[],
       @gprod::text[], @vbus::text[], @vprod::text[], @vat_date::date[], @bal_type::text[], @bal_id::uuid[],
       @src_type::text[], @src_id::uuid[], @src_no::text[], @src_cur::text[], @src_amt::numeric[], @dim::bigint[],
       @source_code::text[], @reason::uuid[], @tmpl::text[], @batch::text[], @sys::bool[], @rev::bool[], @rev_entry::bigint[]);
-- > 1 000 мөр: NpgsqlBinaryImporter ("COPY gl.gl_entry (...) FROM STDIN (FORMAT BINARY)"); row trigger COPY-д ч ажиллана
```

- `gl_transaction`-ийг `gl_entry`-ээс өмнө insert хийнэ (entry-ийн trigger ваучерыг шалгана).
- Нэг run-ий round trip (≤ 50 мөрт зорилт ≈ 8): (1) түгжээ; (2) эх ноорог + дахин шалгалтын unnest query; (3) writer-ийн шалгалт; (4) дугаар (NpgsqlBatch); (5) `gl_transaction` + `gl_entry`; (6) writer-ийн бичилт; (7) posted баримт; (8) outbox + register + posting log (NpgsqlBatch).
- Данс, тохиргоог компанийн кэшээс авна (`row_version`-оор хүчингүй болгоно); B үед зөвхөн ашигласан мөрийг дахин уншина (§5.3).
- Deferred тэнцлийн trigger нь ваучерын хамгийн их `entry_no`-той мөрөнд л нийлбэр тооцно (O(n), 910) — engine ваучерын entry-г дараалсан дугаартай бичдэг тул ачаалал шугаман.
- Метрик (ADR-0020): `erp_posting_duration_seconds{phase=A|B, source_code}`, `erp_posting_lock_wait_seconds`, `erp_posting_lock_hold_seconds`, `erp_posting_lock_timeouts_total`, `erp_posting_failures_total{code}`, `erp_posting_entries_total{ledger}`. Trace span: `posting.validate`, `posting.lock`, `posting.numbers`, `posting.insert.gl`, `posting.writer.{ledger}`, `posting.register`.

### 5.17 Алдааны лог

Pipeline-ийн `PostingLogFilter` нь posting командыг (`:post`, `:reverse`, `:close`, `:apply`, `:unapply`, `POST /payments` г.м.) **A үе, B үе ба COMMIT-ийг бүхэлд нь** ороосон `try/catch`-тэй (A үеийн 422 ба COMMIT-ийн deferred `ERB01`/`ERC01` ч лог болно; BR-PST-67-ийн хүрээ):

```csharp
catch (Exception ex) when (mode == PostingMode.Post && !IsReplay && ex.MapsToStatus() is 409 or 412 or 422 or 500 or 503)
{
    // pipeline ROLLBACK хийсний ДАРАА, шинэ богино transaction-д (контекстыг дахин тохируулна)
    await using var s2 = await _sessions.BeginAsync(tenant, company, user, requestId, ct);
    await s2.ExecAsync("""
        INSERT INTO audit.posting_log (id, tenant_id, company_id, request_id, idempotency_key, posting_type, source_id, source_no,
                                       status, error_code, error_message, started_at)
        VALUES (@id, @t, @c, @req, @keyHash, @type, @srcId, @srcNo, 'FAILED', @code, @msg, @startedAt)
        """, ...);                  // @msg: кодын мессеж (PII, SQL, stack-гүй); @keyHash: Idempotency-Key-ийн hash (02 §11.2)
    await s2.CommitAsync(ct);
    throw;
}
```

`ERB01`, `ERB02`, `ERL01`, `ERT01`, `42501` → P1/P2 alert (14 §9.6). 422/409 нь alert биш, `erp_posting_failures_total{code}`.

### 5.18 Transaction-ий хил

| Үйлдэл | Transaction | Түгжээ | Idempotency | Commit-ийн дараа |
|---|---|---|---|---|
| A үе (угсралт, `ValidateAsync`) | Байхгүй (эсвэл богино read-only) | Байхгүй | — | — |
| Post (баримт, журнал, буцаалт, жилийн хаалт) | Нэг, READ COMMITTED | Advisory + мөрийн | Түлхүүр ижил transaction-д | C үе (POS eBarimt), outbox dispatcher |
| Preview | Нэг, ROLLBACK | Advisory + мөрийн | Байхгүй | Байхгүй |
| Бүтэлгүй Post-ийн лог | Тусдаа, богино | Байхгүй | — | — |
| Залруулгын санал (`correction-proposal`) | Read-only | Байхгүй | — | — |
| Стандарт журналаас хуулах | Нэг (journal_line INSERT) | `journal_batch` `FOR UPDATE` | Түлхүүр | — |
| Outbox dispatch | Тусдаа (worker) | `FOR UPDATE SKIP LOCKED` | `integration.outbox.idempotency_key` | — |
| G/L-гүй тулгалт / unapply (§5.19) | Нэг, READ COMMITTED | Advisory + дэд дэвтрийн мөр | Түлхүүр ижил transaction-д | Outbox dispatcher |

### 5.19 G/L-гүй дэд дэвтрийн run (`RunSubledgerOnlyAsync`)

Батлагдсан entry хооронд тулгах (`POST /customer-ledger-entries:apply`, `…/vendor-ledger-entries:apply`) ба unapply нь G/L-д нөлөөлөхгүй (R1: MNT, хөнгөлөлтгүй). BC-д эдгээр нь `Transaction No. = 0`-тэй detailed мөр үүсгэдэг (R-SUBLEDGERS-APPLICATION-08). Бидэнд `transaction_no = NULL` (060_party.sql). Тулгалтын алгоритм Parties модульд ([06-sales-receivables.md](./06-sales-receivables.md) §5.13.3, §5.14); engine нь зөвхөн transaction-ий хүрээг өгнө (BR-PST-69..72).

```csharp
public interface ISubledgerRunContext : IPostingReadContext
{
    string SourceCode { get; }
    ValueTask<long> ReserveEntryNumbersAsync(string ledger, int count, CancellationToken ct);   // DETAILED_*, APPLICATION_NO
    ValueTask AssertPostingDateAsync(DateOnly date, CancellationToken ct);                      // BR-PST-70: gl.period_closed …
    void AddOutbox(OutboxMessageDraft draft);
    void SetLogSource(Guid? sourceId, string sourceNo);                                         // posting_log.source_* (application_no)
}

public async Task<T> RunSubledgerOnlyAsync<T>(string sourceCode, Func<ISubledgerRunContext, Task<T>> body, CancellationToken ct)
{
    if (sourceCode is not ("SALESAPPL" or "PURCHAPPL" or "UNAPPSALES" or "UNAPPPURCH"))
        throw new InternalPostingException($"source_code {sourceCode} is not a subledger-only run");      // BR-PST-69
    var s = _session.Current;                                       // pipeline: BEGIN, fn_set_context, timeout, Idempotency-Key
    await s.ExecAsync("SELECT platform.fn_lock_company_posting(@t, @c)", ct);                           // BR-PST-60
    var ctx = new SubledgerRunContext(s, sourceCode, _counters, _guards);
    var startedAt = _clock.UtcNow;
    try
    {
        var result = await body(ctx);                              // Parties: LockState, ApplyPair, fn_ledger_update, detailed INSERT
        if (ctx.GlTouched) throw new InternalPostingException("G/L write in subledger-only run");          // BR-PST-71
        await _outbox.EnqueueAsync(ctx, ctx.Outbox, ct);
        await _log.WriteSucceededAsync(ctx, postingType: sourceCode is "SALESAPPL" or "PURCHAPPL" ? "APPLICATION" : "UNAPPLICATION",
                                       glRegisterNo: null, startedAt, ct);                                  // BR-PST-72
        return result;
    }
    catch (Exception) { /* §5.17-ийн FAILED лог, тусдаа transaction */ throw; }
}
```

- 06 §5.13.3-ын жишээн дэх `ctx.AuditPostingLog(type, applicationNo)` ба `ctx.Outbox(...)` нь энэ гэрээний `SetLogSource` ба `AddOutbox`-той харгалзана; posting log-ийг engine өөрөө бичнэ (BR-PST-72), body бичихгүй.
- `ctx.GlTouched` нь `ISubledgerRunContext`-ээр G/L counter (`GL_ENTRY`, `GL_TRANSACTION`, `GL_REGISTER`) нөөцлөх оролдлогыг илрүүлнэ. DB түвшинд G/L-гүй detailed мөрийн `entry_type ∈ (APPLICATION, APPL_ROUNDING, CORRECTION_OF_REMAINING_AMOUNT)` CHECK хамгаална.
- Тулгалтын хүсэлтийн давхардлыг Idempotency-Key ба байгалийн idempotency (`party.application_nothing_to_apply`, `party.unapply_nothing`) хамгаална.
- G/L-д нөлөөлөх тулгалт (R2) нь энгийн `PostAsync` (BR-PST-71): ваучерын G/L мөр (`8500` хэрэгжсэн ханшийн зөрүү г.м.) + `CustomerLedgerLine`/`VendorLedgerLine` (тулгалтын заавартай), `gl_register` үүснэ.

---

## 6. Тооцоолол ба бөөрөнхийлөлт

### 6.1 Нарийвчлал ба бөөрөнхийлөх функц

| Хэмжигдэхүүн | Хадгалах төрөл | Бөөрөнхийлөх нарийвчлал `p` | Эх |
|---|---|---|---|
| G/L, VAT, дэд дэвтрийн дүн (LCY) | `platform.amount` = `numeric(19,4)` | `company_setup.amount_rounding_precision` (0.01 анхдагч; 1 сонголттой) | D-C1, D-C2 |
| FCY дүн (R2) | `numeric(19,4)` | `fx.currency`-ийн нарийвчлал | D-C1 |
| Нэгжийн үнэ | `numeric(19,6)` | `unit_amount_rounding_precision` | D-C1 |
| Ханш (R2) | `numeric(38,18)` | Бөөрөнхийлөхгүй | D-C1 |

```csharp
// Erp.BuildingBlocks.Domain.Monetary — Math.Round-ийг зөвхөн энд (02 §5.4 No_floating_point_money)
public static decimal Round(decimal x, decimal p) => Math.Round(x / p, 0, MidpointRounding.AwayFromZero) * p;   // "Nearest"
public static decimal RoundUp(decimal x, decimal p)   => Math.Sign(x) * Math.Ceiling(Math.Abs(x) / p) * p;      // хэмжээгээр нь (R-GL-POSTING §5)
public static decimal RoundDown(decimal x, decimal p) => Math.Sign(x) * Math.Floor(Math.Abs(x) / p) * p;
public static decimal RoundVat(decimal x, decimal p, string type) => type switch
    { "UP" => RoundUp(x, p), "DOWN" => RoundDown(x, p), _ => Round(x, p) };       // company_setup.vat_rounding_type
public static bool IsRounded(decimal x, decimal p) => x == Round(x, p);
```

- Midpoint нь тэгээс холдоно (AwayFromZero) — PostgreSQL `round()`-тэй ижил (ADR-0006, tech-architecture.md §3). .NET-ийн анхдагч `ToEven` хориотой.
- `UP`/`DOWN` нь **абсолют утгаар** (кредит талын НӨАТ дебит талынхтай ижил чиглэлээр): `RoundUp(−1,122.2727, 0.01) = −1,122.28` (R-GL-POSTING §5 "Rounding direction", R-VAT-16).
- Engine **бөөрөнхийлөхгүй**; зөвхөн `IsRounded`-ийг шалгана (BR-PST-05, R-GL-POSTING-34). PostgreSQL нь scale-ээс илүү оронг чимээгүй бөөрөнхийлдөг тул шалгалт нь заавал (tech-architecture.md §3 #2).

### 6.2 Тэмдэг ба багана

```
amount > 0  → дебит;   debit_amount  = amount,  credit_amount = 0
amount < 0  → кредит;  debit_amount  = 0,       credit_amount = −amount
```

Storno байхгүй (D-C3): буцаалтын entry `amount' = −amount` тул **эсрэг баганад** орно. Үр дагавар: буцаалт хийхэд дансны дебит ба кредит эргэлт хоёулаа өснө, үлдэгдэл 0 (E-F). ⚠ OQ-PST-01.

### 6.3 Ваучерын тэнцэл

```
Мөрийн түвшин (журнал, R-GL-POSTING-11):
  BalanceLcy(l) = 0                 хэрэв account_id ба bal_account_id хоёулаа бөглөгдсөн
                = +amount_lcy(l)    хэрэв зөвхөн account_id
                = −amount_lcy(l)    хэрэв зөвхөн bal_account_id
  Ваучер V: Σ_{l∈V} BalanceLcy(l) = 0

Entry-ийн түвшин (бүх ваучер, D-C5):
  Σ_{e∈V} amount(e) = 0   (яг; хүлцэлгүй)
```

Мөрийн түвшинд тэнцсэн бол entry-ийн түвшинд ч тэнцэнэ: НӨАТ-ын задрал `base + VAT = gross` (§6.4), хяналтын дансны мөр = мөрийн дүн. Entry-ийн түвшний зөрүү нь assembler-ийн алдаа (BR-PST-25).

### 6.4 Журналын мөрийн НӨАТ (gross арга, R-VAT-16)

Мөрийн дүн `A` (LCY, тэмдэгтэй, НӨАТ орсон), хувь `r` (%), нарийвчлал `p`, төрөл `type`:

| Тооцооны төрөл | НӨАТ | Суурь | VAT G/L мөр |
|---|---|---|---|
| `NORMAL` | `VAT = RoundVat(A × r / (100 + r), p, type)` | `Base = A − VAT` (бөөрөнхийлөлтийн үлдэгдлийг суурь шингээнэ) | `VAT ≠ 0` бол 1 мөр (`±VAT`) |
| `REVERSE_CHARGE` (R-VAT-16: дүн цэвэр) | `VAT = RoundVat(A × r / 100, p, type)` | `Base = A` | 2 мөр: 1300 `+VAT`, 2305 `−VAT` |
| `FULL_VAT` (гаалийн НӨАТ) | `VAT = A` | `Base = 0` | Тусдаа VAT G/L мөргүй: "суурь" мөр нь өөрөө `purchase_vat_account_id` (1300) дээр `Amount = A`, `VatAmount = A`; VAT entry түүнтэй холбогдоно |

`vat_difference ≠ 0` бол: `VAT' = VAT + vat_difference`, `Base' = A − VAT'`; нөхцөл `template.allow_vat_difference` ба `|vat_difference| ≤ general_ledger_setup.max_vat_difference_allowed` (BR-PST-38).

Жишээ (E-B): `A = 12,345.00`, `r = 10`, `p = 0.01`:

| `vat_rounding_type` | `A × 10 / 110` | VAT | Суурь |
|---|---|---|---|
| NEAREST | 1,122.272727… | 1,122.27 | 11,222.73 |
| UP | 1,122.272727… | 1,122.28 | 11,222.72 |
| DOWN | 1,122.272727… | 1,122.27 | 11,222.73 |
| NEAREST, `p = 1` (D-C2 сонголт) | 1,122.272727… | 1,122 | 11,223 |

### 6.5 Posting buffer-ийн нэгтгэл

```
Түлхүүр K = (Kind, GlAccountId, GenPostingType, GenBus, GenProd, VatBus, VatProd, VatIdentifier, VatCalcType, DimensionSetId, SeparateLineNo)
Row(K).Amount     = Σ_{i: key(i)=K} Amount_i          (бөөрөнхийлөлтгүй — нийлбэр нь бөөрөнхий тооны нийлбэр)
Row(K).VatAmount  = Σ VatAmount_i;  Row(K).VatBase = Σ VatBase_i;  Row(K).VatDifference = Σ VatDifference_i
Row(K).SystemCreated = ∧ SystemCreated_i            (R-ACCOUNT-DETERMINATION-18)
```

### 6.6 НӨАТ-ын үлдэгдлийн хуваарилалт (баримтын түвшин, D-E3)

НӨАТ-ыг баримтын түвшинд VAT identifier бүрээр (мөн тэмдгээр, R-VAT-13) нэг удаа бөөрөнхийлж, мөрүүдэд **running remainder** (үлдэгдэл дамжуулах) аргаар хуваарилна (D-E3, BC `DivideAmount`, R-VAT-08). Тооцоог Tax (08 §6.2, BR-TAX-20 — канон) хийнэ; функц нь `MoneyMath.Allocate`-д нэг л газар байна (Z-PST-16):

```
Бүлэг G-ийн мөр i = 1..n (line_no ASC), цэвэр дүн a_i, W = Σ a_i:
  T     = RoundVat(W × r / 100, p, type)                -- бүлгийн НӨАТ (чиглэлтэй бөөрөнхийлөлт зөвхөн энд)
  rem_0 = 0
  rem_i' = rem_{i−1} + T × a_i / W                       -- decimal (28 орон), бөөрөнхийлөхгүй
  VAT_i = Round(rem_i', p)  (Nearest, AwayFromZero)      -- i < n
  rem_i = rem_i' − VAT_i
  VAT_n = T − Σ_{i<n} VAT_i                              -- сүүлийн мөр (decimal хуваалтын 10⁻²⁸ алдааг шингээнэ)
Баталгаа: Σ VAT_i = T;  |VAT_i − T × a_i / W| < p;  W = 0 бол бүх VAT_i = 0.
```

```csharp
public static decimal[] Allocate(decimal total, IReadOnlyList<decimal> weights, decimal p)
{
    var w = weights.Sum(); var r = new decimal[weights.Count];
    if (w == 0 || weights.Count == 0) return r;
    decimal rem = 0, allocated = 0;
    for (var i = 0; i < weights.Count; i++)
    {
        if (i == weights.Count - 1) { r[i] = total - allocated; break; }
        var exact = rem + total * weights[i] / w;
        r[i] = Round(exact, p);                     // MidpointRounding.AwayFromZero
        rem = exact - r[i]; allocated += r[i];
    }
    return r;
}
```

Жишээ (E-D): 3 мөр × 3,333.33, `W = 9,999.99`, `T = Round(999.999) = 1,000.00`, хувь хэмжээ `T × a_i / W = 333.3333…`:

| Мөр | rem өмнө | rem' | VAT_i | rem дараа |
|---|---:|---:|---:|---:|
| 1 | 0 | 333.333333 | 333.33 | +0.003333 |
| 2 | +0.003333 | 333.336667 | 333.34 | −0.003333 |
| 3 (сүүлийн) | | | 1,000.00 − 666.67 = 333.33 | |
| Σ | | | **1,000.00** | |

Мөр бүрийг тусад нь бөөрөнхийлбөл 3 × 333.33 = 999.99 болж 0.01-ээр дутна.

### 6.7 Жилийн хаалтын дүн (BR-PST-55)

```
IS = { a : a.account_type = 'POSTING' ∧ a.income_balance = 'INCOME_STATEMENT' }
net(a) = Σ amount(e),  e.gl_account_id = a,  Y-01-01 ≤ e.posting_date ≤ Y-12-31  (is_closing-ийг ОРУУЛНА)
Хаалтын мөр:   L(a) = −net(a)                      (net(a) = 0 бол мөргүй)
Үр дүнгийн мөр: R = Σ_{a∈IS} net(a) = −Σ L(a)      → 3500 (R < 0: ашиг, Кт; R > 0: алдагдал, Дт)
Тэнцэл:  Σ L(a) + R = 0
Дахин ажиллуулахад: net(a) нь өмнөх хаалтыг агуулсан тул зөвхөн зөрүү (delta).
```

Бөөрөнхийлөлт хэрэггүй (бөөрөнхий тооны нийлбэр). Dimension-гүй: нэг данс = нэг мөр (BC R-PERIODS-REPORTING-22-ийн "entry бүрд мөр" хэлбэрийг хуулахгүй).

### 6.8 Хуримтлагдсан ашиг руу шилжүүлэх дүн (BR-PST-58)

```
B = Σ amount(e),  e.gl_account_id = 3500,  e.posting_date ≤ (Y+1)-01-01
    (Y-ийн хаалтын бичилт ба 01-01-нд аль хэдийн батлагдсан шилжүүлэг орно → дахин ажиллуулахад зөрүү)
Ноорог (Y+1-01-01):  3500: amount = −B;   3400: amount = +B    (B = 0 бол ноорог үүсэхгүй)
```

Ашигтай жилд `B < 0` (кредит үлдэгдэл) → 3500 Дт `|B|`, 3400 Кт `|B|`. Хэрэглэгч ноорогийн огноог 01-01-ээс өөр болгож батлавал дараагийн дахин ажиллуулалт түүнийг тооцохгүй — UI огноог түгжинэ (`W-05` анхааруулга).

### 6.9 Буцаалт ба register-ийн муж

```
Буцаалт: amount' = −amount; vat_amount' = −vat_amount; source_currency_amount' = −source_currency_amount
         VAT entry: base' = −base; amount' = −amount; non_deductible_*' = −…; vat_difference' = −vat_difference
         Σ_{e'∈V'} amount' = −Σ_{e∈V} amount = 0
Register: from_entry_no = F (GL_ENTRY-ийн нөөцийн эхний дугаар); to_entry_no = F + N − 1  (N = run-ий G/L entry-ийн тоо)
          from_vat_entry_no = FV;  to_vat_entry_no = FV + NV − 1  (NV = 0 бол хоёулаа NULL)
```

### 6.10 Валют (R2)

Валютын тооцооны эзэмшигч нь [09-bank-cash-fx.md](./09-bank-cash-fx.md) (Z-PST-17). Схемийн ханш нь `currency_factor` = 1 LCY-д ногдох FCY (Z-PST-11). Каноник хөрвүүлэлт (09 BR-FX-21): `amount_lcy = ToLcy(amount, rate) = Round(amount × rate, p_LCY)`, `rate = RateOf(currency_factor) = Round(1 / currency_factor, 6)` (SCR-FX-01 хэрэгжтэл); `amount / currency_factor` томьёог **хэрэглэхгүй**. R2-т бүх мөр нэг валюттай ваучерыг FCY-ээр ч тэнцүүлнэ (R-GL-POSTING-22, SHOULD); FCY тэнцсэн ч LCY-д бөөрөнхийлөлтийн зөрүү (≤ 0.01 × мөрийн тоо) гарвал **хамгийн их |LCY|-тай мөрт** залруулна (09 BR-FX-26); автомат "round-off" данс үүсгэхгүй. Buffer-ийн LCY-only үлдэгдэл (R-ACCOUNT-DETERMINATION-20) 09-ийн дүрмээр. R1-д валютын мөр `gl.currency_not_enabled`.

---

## 7. Posting-ийн жишээнүүд

**Таамаг.** Компани "Жишээ ХХК", НӨАТ төлөгч, LCY = MNT, `amount_rounding_precision = 0.01`, `vat_rounding_type = NEAREST`, НӨАТ 10 % (`param:vat.standard_rate`). Данс нь seed-ийн дансны төлөвлөгөө ([db/seed/README.md](./db/seed/README.md) §3): 1100 Касс (төгрөг), 1110 Харилцах данс (төгрөг), 1200 Дансны авлага, 1300 Орцын НӨАТ, 2100 Дансны өглөг, 2300 Борлуулалтын НӨАТ, 2650 Бусад богино хугацаат өр төлбөр, 3100 Өмч, 3400 Хуримтлагдсан ашиг, 3500 Тайлант үеийн ашиг, 5100 Борлуулалтын орлого - бараа, 5110 Ажил, үйлчилгээний орлого, 6100 Борлуулсан барааны өртөг, 7201 Цалингийн зардал, 7210 Түрээсийн зардал, 7212 Холбоо, интернэтийн зардал, 7213 Бичиг хэрэг, хэвлэлийн зардал, 8110 Хүүний орлого, 8300 Санхүүгийн зардал, 9100 Орлогын албан татварын зардал.

| Мастер өгөгдөл | Утга |
|---|---|
| Мөнгөний данс | `CASH01` Үндсэн касс (`kind = CASH`, бүлэг `CASH_MNT` → 1100); `BANK01` Хаан банк (`kind = BANK`, бүлэг `BANK_MNT` → 1110) |
| Харилцагч | `C0001` Тэмүүлэн ХХК (Gen./VAT bus `DOMESTIC`, бүлэг `DOMESTIC` → 1200, NET30); `C0002` Иргэн (B2C, бэлэн, `DOMESTIC` → 1200) |
| Нийлүүлэгч | `V0001` Оффис Плюс ХХК (`DOMESTIC` → 2100) |
| Dimension set | 0 = хоосон; 7 = {САЛБАР = ТӨВ}; 9 = {САЛБАР = ТӨВ, ТӨСӨЛ = П1}; 11, 12, 13 = {САЛБАР = Салбар-1/2/3}. Ижил хослол = ижил id (`UNIQUE (company_id, key_hash)`), тиймээс журнал (E-A) ба нэхэмжлэхийн header (E-C) хоёулаа {ТӨВ} = 7 (16 GS-GL-014-тэй нийцнэ) |

**E-A … E-G-ийн эхлэх төлөв** (2026 оны 3-р сар, бүх үе `OPEN`):

| Counter / цуврал | Утга |
|---|---|
| `GL_REGISTER` / `GL_TRANSACTION` / `GL_ENTRY` | 40 / 118 / 530 |
| `VAT_ENTRY` / `CUST_LEDGER_ENTRY` / `DETAILED_CUST_LEDGER_ENTRY` / `BANK_LEDGER_ENTRY` / `APPLICATION_NO` | 72 / 25 / 60 / 14 / 9 |
| `GJ` / `KZ` / `SI` / `KO` 2026-ийн сүүлийн дугаар | 00041 / 00017 / 00041 / 00030 |

Хүснэгтэд "Дт"/"Кт" нь `debit_amount`/`credit_amount`, "amount" нь хадгалагдсан тэмдэгтэй дүн.

### E-A. Ерөнхий журнал: түрээс банкаар (GS-GL-001)

Журнал GENERAL/DEFAULT, мөр 10000: `posting_date = 2026-03-10`, `document_no = J-000123`, `GL_ACCOUNT 7210`, Дт 1,500,000.00 (`amount = +1,500,000.00`), харьцсан `BANK_ACCOUNT BANK01`, set 7, "3-р сарын оффисын түрээс".

`gl_transaction` 119: `GJ-2026-00042`, 2026-03-10, `NONE`, source `GENJNL`, register 41.

| entry_no | Данс | Дт | Кт | amount | system_created | source | bal_account | set |
|---|---|---:|---:|---:|---|---|---|---|
| 531 | 7210 | 1,500,000.00 | | +1,500,000.00 | false | BANK_ACCOUNT BANK01 | BANK_ACCOUNT BANK01 | 7 |
| 532 | 1110 | | 1,500,000.00 | −1,500,000.00 | true | BANK_ACCOUNT BANK01 | GL_ACCOUNT 7210 | 7 |
| **Σ** | | **1,500,000.00** | **1,500,000.00** | **0.00** | | | | |

| Дэд дэвтэр | Мөр |
|---|---|
| `bank.bank_ledger_entry` 15 | BANK01, `amount = −1,500,000.00`, `amount_lcy = −1,500,000.00`, `positive = false`, `remaining_amount = −1,500,000.00`, `open = true`, `statement_status = OPEN`, transaction 119, register 41, set 7 |
| `gl.gl_register` 41 | `from_entry_no = 531`, `to_entry_no = 532`, VAT NULL, `GENJNL`, GENERAL / DEFAULT |
| `audit.posting_log` | `GENERAL_JOURNAL`, `SUCCEEDED`, transaction 119, register 41, `GJ-2026-00042` |

Хариуны `vouchers[]`: `{ draftDocumentNo: "J-000123", documentNo: "GJ-2026-00042", transactionNo: 119 }`.

### E-B. Төлбөрийн журнал (касс): НӨАТ-тай бичиг хэрэг (GS-GL-002)

Журнал PAYMENT/CASH (цуврал `KZ`, МХ-2), мөр: 2026-03-12, `GL_ACCOUNT 7213`, `gen_posting_type = PURCHASE`, VAT bus `DOMESTIC`, VAT prod `VAT10`, Дт 12,345.00 (НӨАТ орсон), харьцсан `BANK_ACCOUNT CASH01`, нийлүүлэгчийн ДДТД бөглөсөн. НӨАТ = `Round(12,345.00 × 10/110) = 1,122.27`, суурь = 11,222.73 (§6.4).

`gl_transaction` 120: `KZ-2026-00018`, 2026-03-12, source `PAYMENTJNL`, register 42.

| entry_no | Данс | Дт | Кт | amount | vat_amount | system_created |
|---|---|---:|---:|---:|---:|---|
| 533 | 7213 | 11,222.73 | | +11,222.73 | 1,122.27 | false |
| 534 | 1300 | 1,122.27 | | +1,122.27 | 0 | true |
| 535 | 1100 | | 12,345.00 | −12,345.00 | 0 | true |
| **Σ** | | **12,345.00** | **12,345.00** | **0.00** | | |

| Дэд дэвтэр | Мөр |
|---|---|
| `tax.vat_entry` 73 | `PURCHASE`, `vat_date = 2026-03-12`, `base = +11,222.73`, `amount = +1,122.27`, `NORMAL`, 10 %, identifier/category `VAT10`, `DOMESTIC`/`VAT10`, `VAT_ABLE`, `supplier_ebarimt_id` = ДДТД, `gl_entry_no = 533`, transaction 120 (`deductible_confirmed` нь 08-ийн дүрмээр) |
| `tax.gl_entry_vat_entry_link` | (533, 73) — **суурь** entry, VAT G/L entry 534 биш (R-GL-POSTING-33) |
| `bank.bank_ledger_entry` 16 | CASH01, `−12,345.00`, transaction 120 |
| `bank.posted_cash_voucher` | `PAYMENT`, `KZ-2026-00018`, 12,345.00, `bank_ledger_entry_no = 16` |
| `gl.gl_register` 42 | 533–535, VAT 73–73, `PAYMENTJNL`, PAYMENT / CASH |

### E-C. Зээлийн борлуулалтын нэхэмжлэх: posting buffer, header ба мөрийн dimension (GS-GL-003, GS-GL-014)

`SI-2026-00042`, 2026-03-15, `C0001`, header set 7, NET30 → төлөх 2026-04-14. Мөр 10000: бараа (GOODS), 2 × 350,000.00 = 700,000.00, set 9 → General Posting Setup `DOMESTIC × GOODS` → 5100. Мөр 20000: үйлчилгээ (SERVICES) 300,000.00, set 7 → 5110. НӨАТ (VAT10): `T = Round(1,000,000.00 × 0.10) = 100,000.00` → 70,000.00 / 30,000.00 (§6.6).

Posting buffer (нэхэмжлэх тул сөрөг):

| Мөр | Түлхүүр (Kind, данс, Gen. Bus × Prod, VAT Bus × Prod, set) | Amount | VatAmount | VatBase |
|---|---|---:|---:|---:|
| R1 | Item, 5100, DOMESTIC × GOODS, DOMESTIC × VAT10, 9 | −700,000.00 | −70,000.00 | −700,000.00 |
| R2 | Service, 5110, DOMESTIC × SERVICES, DOMESTIC × VAT10, 7 | −300,000.00 | −30,000.00 | −300,000.00 |

`gl_transaction` 121: `SI-2026-00042`, `INVOICE`, source `SALES`, register 43.

| entry_no | Данс | Дт | Кт | amount | vat_amount | set | Гарал |
|---|---|---:|---:|---:|---:|---|---|
| 536 | 5100 | | 700,000.00 | −700,000.00 | −70,000.00 | 9 | R1 суурь (SystemDerived) |
| 537 | 2300 | | 70,000.00 | −70,000.00 | 0 | 9 | R1 VAT |
| 538 | 5110 | | 300,000.00 | −300,000.00 | −30,000.00 | 7 | R2 суурь |
| 539 | 2300 | | 30,000.00 | −30,000.00 | 0 | 7 | R2 VAT |
| 540 | 1200 | 1,100,000.00 | | +1,100,000.00 | 0 | 7 | Харилцагч (header set), source CUSTOMER C0001 |
| **Σ** | | **1,100,000.00** | **1,100,000.00** | **0.00** | | | |

| Дэд дэвтэр | Мөр |
|---|---|
| `tax.vat_entry` 74 | `SALE`, `base = −700,000.00`, `amount = −70,000.00`, `gl_entry_no = 536`, `bill_to_pay_to = CUSTOMER C0001`, `party_tin` |
| `tax.vat_entry` 75 | `SALE`, `base = −300,000.00`, `amount = −30,000.00`, `gl_entry_no = 538` |
| `party.cust_ledger_entry` 26 | `C0001`, `INVOICE`, `SI-2026-00042`, `amount = amount_lcy = +1,100,000.00`, `sales_lcy = 1,000,000.00`, `positive = true`, `due_date = 2026-04-14`, бүлэг `DOMESTIC`, set 7, transaction 121 → trigger: `remaining_amount = 1,100,000.00`, `open = true` |
| `party.detailed_cust_ledger_entry` 61 | `INITIAL`, CLE 26, `+1,100,000.00`, `ledger_entry_amount = true`, transaction 121 |
| `gl.gl_register` 43 | 536–540, VAT 74–75, `SALES` |
| Posted document writer | `sales.sales_invoice_header` (`no = SI-2026-00042`, `cust_ledger_entry_no = 26`); eBarimt `B2B_RECEIPT` `PENDING` + outbox `ebarimt.receipt.send` (12) |

Dimension-ээр харвал (R-DIMENSIONS-NOSERIES-AUDIT-25): ТӨСӨЛ = П1 нь −770,000.00, ТӨСӨЛ хоосон нь +770,000.00 — dimension тус бүрийн гүйлгээ баланс тэнцэхгүй нь хэвийн.

### E-D. Preview: НӨАТ-ын үлдэгдлийн хуваарилалт (GS-GL-004, GS-GL-013)

Ноорог нэхэмжлэх (`C0002`, header set 0): гурван үйлчилгээний мөр тус бүр 3,333.33, set 11, 12, 13 (өөр салбар тул buffer-т нэгтгэгдэхгүй). `POST /sales-invoices/{id}:preview`.

| relativeEntryNo | Данс | Дт | Кт | amount | set |
|---|---|---:|---:|---:|---|
| 1 | 5110 | | 3,333.33 | −3,333.33 | 11 |
| 2 | 2300 | | 333.33 | −333.33 | 11 |
| 3 | 5110 | | 3,333.33 | −3,333.33 | 12 |
| 4 | 2300 | | 333.34 | −333.34 | 12 |
| 5 | 5110 | | 3,333.33 | −3,333.33 | 13 |
| 6 | 2300 | | 333.33 | −333.33 | 13 |
| 7 | 1200 | 10,999.99 | | +10,999.99 | 0 |
| **Σ** | | **10,999.99** | **10,999.99** | **0.00** | |

Хариу: `documentNo = "***"`, `transactionNo = 1`, VAT entry 1..3 (`base/amount` = −3,333.33/−333.33, −3,333.33/−333.34, −3,333.33/−333.33), харилцагчийн entry 1 (`+10,999.99`), `registerNo = null`. ROLLBACK-ийн дараа `ledger_counter`, `SI` цуврал, `gl_*`, `tax.*`, `party.*`, `integration.outbox` өөрчлөгдөөгүй; `audit.posting_log`-д мөр алга. Ижил ноорогийг дараа нь батлахад entry 1..7-той яг ижил данс, дүн, set гарна (BR-PST-53).

### E-E. Бэлэн борлуулалт: нэг register, хоёр гүйлгээ, тулгалт (GS-GL-005)

`C0002`, 2026-03-15, үйлчилгээ 100,000.00 + НӨАТ 10,000.00, төлбөрийн хэлбэр `CASH` → `CASH01` (D-F5). Ваучер V1 = нэхэмжлэх (`SI`, `FromSeries`), V2 = төлбөр (`document_type = PAYMENT`, `document_no` = V1-ийн дугаар — `SameAsVoucher("V1")`, source `CASHVOUCHER`; R-SALES-DOCUMENTS-37, 06 BR-SAL-50). МХ-1-ийн дугаар `KO`-оос тусдаа (09 BR-BNK-21).

| entry_no | transaction | Баримт | Данс | Дт | Кт | amount |
|---|---|---|---|---:|---:|---:|
| 541 | 122 | SI-2026-00043 (`INVOICE`) | 5110 | | 100,000.00 | −100,000.00 |
| 542 | 122 | SI-2026-00043 | 2300 | | 10,000.00 | −10,000.00 |
| 543 | 122 | SI-2026-00043 | 1200 | 110,000.00 | | +110,000.00 |
| 544 | 123 | SI-2026-00043 (`PAYMENT`) | 1100 | 110,000.00 | | +110,000.00 |
| 545 | 123 | SI-2026-00043 (`PAYMENT`) | 1200 | | 110,000.00 | −110,000.00 |
| **Σ T122** | | | | **110,000.00** | **110,000.00** | **0.00** |
| **Σ T123** | | | | **110,000.00** | **110,000.00** | **0.00** |

| Дэд дэвтэр | Мөр |
|---|---|
| `tax.vat_entry` 76 | `SALE`, `base = −100,000.00`, `amount = −10,000.00`, `gl_entry_no = 541`, transaction 122 |
| `party.cust_ledger_entry` 27 | `INVOICE`, SI-2026-00043, `+110,000.00`, transaction 122 |
| `party.cust_ledger_entry` 28 | `PAYMENT`, SI-2026-00043, `−110,000.00`, transaction 123 |
| `party.detailed_cust_ledger_entry` 62 | `INITIAL`, CLE 27, `+110,000.00`, transaction 122 |
| `party.detailed_cust_ledger_entry` 63 | `INITIAL`, CLE 28, `−110,000.00`, transaction 123 |
| `party.detailed_cust_ledger_entry` 64 | `APPLICATION`, CLE 27, `−110,000.00`, transaction 123, `application_no = 10`, `applied_cust_ledger_entry_no = 28` |
| `party.detailed_cust_ledger_entry` 65 | `APPLICATION`, CLE 28, `+110,000.00`, transaction 123, `application_no = 10`, `applied_cust_ledger_entry_no = 28` |
| Үр дүн (trigger) | CLE 27: `remaining = 0`, `open = false`, `closed_by_entry_no = 28` (`fn_ledger_update`); CLE 28: `remaining = 0`, `open = false` |
| `bank.bank_ledger_entry` 17 | CASH01, `PAYMENT`, `document_no = SI-2026-00043`, `+110,000.00`, transaction 123; `bank.posted_cash_voucher` `RECEIPT`, `no = KO-2026-00031` (CashBank writer `fn_next_document_no('KO', 2026-03-15)`, `KO` counter 00030 → 00031), `bank_ledger_entry_no = 17` |
| `gl.gl_register` 44 | 541–545, VAT 76–76, `SALES` |

1200-ийн хөдөлгөөн: Дт 110,000.00, Кт 110,000.00, үлдэгдэл 0 = харилцагчийн detailed entry-ийн нийлбэр 0 (BR-PST-42).

### E-F. Гүйлгээ буцаах: E-A (GS-GL-006)

2026-03-20-нд `POST /gl-transactions/{T119}:reverse { reasonCodeId: REVERSAL }`. Үе 2026-03 `OPEN`, BLE 15 `open`, хуулгад ороогүй.

Шинэ register 45 (`REVERSAL`), `gl_transaction` 124: `posting_date = 2026-03-10` (эх), `document_no = GJ-2026-00042` (эх), source `REVERSAL`, `reverses_transaction_no = 119`.

| entry_no | Данс | Дт | Кт | amount | reversed | reversed_entry_no |
|---|---|---:|---:|---:|---|---|
| 546 | 1110 | 1,500,000.00 | | +1,500,000.00 | true | 532 |
| 547 | 7210 | | 1,500,000.00 | −1,500,000.00 | true | 531 |
| **Σ** | | **1,500,000.00** | **1,500,000.00** | **0.00** | | |

| Өөрчлөлт | Утга |
|---|---|
| `gl_entry` 531 / 532 (`fn_ledger_update`) | `reversed = true`, `reversed_by_entry_no = 547` / `546` |
| `gl_transaction` 119 | `reversed_by_transaction_no = 124` |
| `bank.bank_ledger_entry` 18 | BANK01, `+1,500,000.00`, `reversed = true`, `reversed_entry_no = 15`, `remaining = 0`, `open = false`, transaction 124 |
| `bank.bank_ledger_entry` 15 | `reversed = true`, `reversed_by_entry_no = 18`, `remaining_amount = 0`, `open = false`, `closed_by_entry_no = 18` |
| `gl.gl_register` 45 | 546–547, `REVERSAL`; register 41-ийн цорын ганц гүйлгээ буцаагдсан тул `register 41.reversed = true` |

3-р сарын гүйлгээ баланс, 7210: Дт эргэлт 1,500,000.00, Кт эргэлт 1,500,000.00, эцсийн үлдэгдэл 0.00 (storno-гүй: эсрэг баганад). 1110: Дт 1,500,000.00, Кт 1,500,000.00 (энэ хоёр гүйлгээнээс).

### E-G. Register буцаах: огноо өөр 2 ваучер (GS-GL-007)

Нэг журналын run (register 46, `GENJNL`): `GJ-2026-00043` (2026-03-11): `GL_ACCOUNT 8300` Дт 5,000.00 / `BANK_ACCOUNT BANK01` (G/L 1110) Кт 5,000.00 (BLE 19); `GJ-2026-00044` (2026-03-12): `GL_ACCOUNT 2650` Дт 200,000.00 / `BANK_ACCOUNT BANK01` (G/L 1110) Кт 200,000.00 (BLE 20). 1110 нь хяналтын данс тул шууд `GL_ACCOUNT 1110` гэж оруулбал `gl.direct_posting_not_allowed`.

| entry_no | transaction | Огноо | Данс | Дт | Кт |
|---|---|---|---|---:|---:|
| 548 | 125 | 2026-03-11 | 8300 | 5,000.00 | |
| 549 | 125 | 2026-03-11 | 1110 | | 5,000.00 |
| 550 | 126 | 2026-03-12 | 2650 | 200,000.00 | |
| 551 | 126 | 2026-03-12 | 1110 | | 200,000.00 |

`POST /gl-registers/{46}:reverse` → register 47 (`REVERSAL`), эх гүйлгээ бүрд нэг шинэ гүйлгээ, `transaction_no` буурах дарааллаар (BR-PST-48):

| entry_no | transaction (reverses) | Огноо / баримт | Данс | Дт | Кт | reversed_entry_no |
|---|---|---|---|---:|---:|---|
| 552 | 127 (126) | 2026-03-12 / GJ-2026-00044 | 1110 | 200,000.00 | | 551 |
| 553 | 127 (126) | 2026-03-12 / GJ-2026-00044 | 2650 | | 200,000.00 | 550 |
| 554 | 128 (125) | 2026-03-11 / GJ-2026-00043 | 1110 | 5,000.00 | | 549 |
| 555 | 128 (125) | 2026-03-11 / GJ-2026-00043 | 8300 | | 5,000.00 | 548 |
| **Σ T127** | | | | **200,000.00** | **200,000.00** | |
| **Σ T128** | | | | **5,000.00** | **5,000.00** | |

BLE 21 (`+200,000.00`, rev 20), BLE 22 (`+5,000.00`, rev 19). Register 47: 552–555. Register 46 `reversed = true`. Дахин `POST /gl-registers/{46}:reverse` → `409 gl.register_already_reversed`.

### E-H. Жилийн хаалт 2026 (GS-GL-008)

Эхлэх төлөв: `GL_REGISTER` 319, `GL_TRANSACTION` 1,499, `GL_ENTRY` 7,000; 2026-ийн 12 сар бүгд `CLOSED`; `current_year_result_account_id` = 3500; 3500-д өмнө бичилт алга. Орлогын тайлангийн дансны 2026 оны цэвэр дүн:

| Данс | net (Σ amount) |
|---|---:|
| 5100 | −10,000,000.00 |
| 5110 | −2,000,000.00 |
| 6100 | +6,000,000.00 |
| 7201 | +2,400,000.00 |
| 7210 | +1,200,000.00 |
| 8110 | −50,000.00 |
| 8300 | +100,000.00 |
| 9100 | +235,000.00 |
| **Σ net** | **−2,115,000.00** (ашиг 2,115,000.00) |

`POST /fiscal-years/{2026}:close` → `CL-2026-00001`, `gl_transaction` 1500, 2026-12-31, `is_closing = true`, source `CLSINCOME`, register 320, CLOSING / YEAR_END:

| entry_no | Данс | Дт | Кт | amount |
|---|---|---:|---:|---:|
| 7001 | 5100 | 10,000,000.00 | | +10,000,000.00 |
| 7002 | 5110 | 2,000,000.00 | | +2,000,000.00 |
| 7003 | 6100 | | 6,000,000.00 | −6,000,000.00 |
| 7004 | 7201 | | 2,400,000.00 | −2,400,000.00 |
| 7005 | 7210 | | 1,200,000.00 | −1,200,000.00 |
| 7006 | 8110 | 50,000.00 | | +50,000.00 |
| 7007 | 8300 | | 100,000.00 | −100,000.00 |
| 7008 | 9100 | | 235,000.00 | −235,000.00 |
| 7009 | 3500 | | 2,115,000.00 | −2,115,000.00 |
| **Σ** | | **12,050,000.00** | **12,050,000.00** | **0.00** |

`fiscal_year` 2026: `status = CLOSED`, `closing_transaction_no = 1500`. Шилжүүлгийн санал (ноорог, GENERAL/DEFAULT, 2027-01-01, `J-000201`): 3500 Дт 2,115,000.00 / 3400 Кт 2,115,000.00 (`B = −2,115,000.00`, §6.8). Хаалтын бичилтийг оруулсан гүйлгээ балансад 5000–9999 дансны 2026-12-31-ний үлдэгдэл 0; "хаалтын бичилтгүй" горимд (`rpt.fn_trial_balance(..., p_include_closing = false)`) ОДТ-ийн ашиг 2,115,000.00 харагдана.

### E-I. Жилийн хаалтыг дахин ажиллуулах: зөрүү (GS-GL-009)

E-H-ийн дараа, шилжүүлгийн ноорог батлагдаагүй байхад: Owner 2026-12-ийг дахин нээж (шалтгаантай, 13 §8.4) `GJ-2026-00310` (2026-12-20): `GL_ACCOUNT 7210` Дт 100,000.00 / `BANK_ACCOUNT BANK01` (G/L 1110) Кт 100,000.00 батлаад, 12-р сарыг дахин хаана. Сарыг нээхэд жил `OPEN` болсон (13 SEC-POST-04); `GJ` цуврал `date_order` тул 2026-ийн `GJ`-ийн `last_date_used` ≤ 2026-12-20 байх ёстой (эс бөгөөс `ERN02`, ⚠ OQ-PST-03). `:close` дахин:

| Данс | net (хаалт орно) |
|---|---|
| 7210 | 1,200,000.00 + 100,000.00 − 1,200,000.00 = +100,000.00 |
| Бусад | 0 (мөргүй) |

`CL-2026-00002`, `gl_transaction` 1530, 2026-12-31, `is_closing`, register 335:

| entry_no | Данс | Дт | Кт | amount |
|---|---|---:|---:|---:|
| 7101 | 7210 | | 100,000.00 | −100,000.00 |
| 7102 | 3500 | 100,000.00 | | +100,000.00 |
| **Σ** | | **100,000.00** | **100,000.00** | **0.00** |

`fiscal_year.closing_transaction_no = 1530`. Шилжүүлгийн өмнөх ноорог (`J-000201`) устаж шинэ санал үүснэ: `B = −2,115,000.00 + 100,000.00 = −2,015,000.00`. Гуравдахь удаа `:close` → бичих зүйлгүй (`posted = false`), дугаар, register, posting log үүсэхгүй; жил `CLOSED` хэвээр, шилжүүлгийн санал (`B` өөрчлөгдөөгүй) дахин үүсгэгдэнэ (BR-PST-56).

### E-J. Хуримтлагдсан ашиг руу шилжүүлэх (GS-GL-010)

Шинэ санал `J-000202` (2027-01-01) батлагдав → `GJ-2027-00001` (source `GENJNL`):

| Данс | Дт | Кт | amount |
|---|---:|---:|---:|
| 3500 | 2,015,000.00 | | +2,015,000.00 |
| 3400 | | 2,015,000.00 | −2,015,000.00 |
| **Σ** | **2,015,000.00** | **2,015,000.00** | **0.00** |

Үр дүн: 3500-ийн 2027-01-01-ний үлдэгдэл 0; 3400 Кт 2,015,000.00. Дараа нь `:close` (2026) дахин ажиллавал `B = 0` тул шинэ санал үүсэхгүй.

### E-K. Эхний үлдэгдэл (GS-GL-011, D-D7)

Шинэ компани, ашиглалтад орох 2026-01-01, бүх counter 0. Журнал OPENING/DEFAULT, бүх мөр `J-000001`, 2026-01-01:

| Мөр | Дансны төрөл | Данс | Дт | Кт | Нэмэлт |
|---|---|---|---:|---:|---|
| 10000 | BANK_ACCOUNT | CASH01 | 1,000,000.00 | | |
| 20000 | BANK_ACCOUNT | BANK01 | 5,000,000.00 | | |
| 30000 | CUSTOMER | C0001 | 1,100,000.00 | | `INVOICE`, гадаад № INV-2025-118, огноо 2025-12-21, төлөх 2026-01-20 |
| 40000 | VENDOR | V0001 | | 550,000.00 | `INVOICE`, гадаад № ОП-7781, огноо 2025-12-16, төлөх 2026-01-15 |
| 50000 | GL_ACCOUNT | 3100 | | 5,000,000.00 | |
| 60000 | GL_ACCOUNT | 3400 | | 1,550,000.00 | |

Мөрийн түвшний тэнцэл: 1,000,000 + 5,000,000 + 1,100,000 − 550,000 − 5,000,000 − 1,550,000 = 0 ✓. `OB-2026-00001`, `gl_transaction` 1 (`document_type = NONE`, мөрүүд холимог), source `OPENING`, register 1:

| entry_no | Данс | Дт | Кт | source | Дэд дэвтэр |
|---|---|---:|---:|---|---|
| 1 | 1100 | 1,000,000.00 | | BANK_ACCOUNT CASH01 | BLE 1 `+1,000,000.00` (МХ-1 үүсэхгүй) |
| 2 | 1110 | 5,000,000.00 | | BANK_ACCOUNT BANK01 | BLE 2 `+5,000,000.00` |
| 3 | 1200 | 1,100,000.00 | | CUSTOMER C0001 | CLE 1 (`INVOICE`, `OB-2026-00001`, гадаад INV-2025-118, `+1,100,000.00`, төлөх 2026-01-20) + DCLE 1 `INITIAL` |
| 4 | 2100 | | 550,000.00 | VENDOR V0001 | VLE 1 (`INVOICE`, `OB-2026-00001`, гадаад ОП-7781, `−550,000.00`, төлөх 2026-01-15) + DVLE 1 `INITIAL` |
| 5 | 3100 | | 5,000,000.00 | | |
| 6 | 3400 | | 1,550,000.00 | | |
| **Σ** | | **7,100,000.00** | **7,100,000.00** | | |

1200-ийн үлдэгдэл 1,100,000.00 = нээлттэй харилцагчийн entry-ийн нийлбэр (FR-GL-021 AC1). Хэрэв мөр 30000-ийг `GL_ACCOUNT 1200` гэж оруулбал → `gl.direct_posting_not_allowed` (BR-PST-15).

### E-L. Хаалттай үеийн залруулгын санал (GS-GL-012, FR-GL-014)

Эх гүйлгээ `GJ-2026-00090` (2026-01-25, `GENJNL`): 7212 Дт 300,000.00 / 2650 Кт 300,000.00 (хоёулаа хэрэглэгчийн G/L мөр). 2026-01 нь `CLOSED`. `GET /gl-transactions/{id}/correction-proposal?date=2026-04-05&reasonCodeId=CORRECTION`:

| Санал болгох мөр | Дансны төрөл | Данс | Дт | Кт | Эх |
|---|---|---|---:|---:|---|
| 1 | GL_ACCOUNT | 7212 | | 300,000.00 | entry 7212 (`system_created = false`) |
| 2 | GL_ACCOUNT | 2650 | 300,000.00 | | entry 2650 |
| **Σ** | | | **300,000.00** | **300,000.00** | |

Клиент мөрүүдийг GENERAL/DEFAULT-д нэмж (тайлбар "Залруулга: GJ-2026-00090"), шаардлагатай бол зөв зардлын мөр (жишээ 7213 Дт 300,000.00 / 2650 Кт 300,000.00) нэмээд батална → 2026-04-05-ний `GJ-2026-…`. 1-р сарын бичилт өөрчлөгдөхгүй (FR-GL-014 AC1). Эх гүйлгээ ижил 1-р сард `OPEN` байсан бол → `409 gl.correction_use_reversal`.

---

## 8. Validation ба алдааны кодууд

### 8.1 Шалгалтын дараалал

| # | Шат | Хаана | Зогсох эсэх | HTTP |
|---|---|---|---|---|
| 1 | OpenAPI schema (төрөл, заавал талбар, `amount` string) | Api pipeline | Тийм | 400 `api.request_invalid` (14 API-ERR-07) |
| 2 | Эрх (`ACTION gl.journal.post X` г.м.) | Api pipeline | Тийм | 403 `platform.permission_denied` |
| 3 | Idempotency Шат 0 (A үеэс өмнө; `COMPLETED` бол replay эсвэл өөр hash) ба B үеийн `INSERT … ON CONFLICT` (зэрэг хүсэлт) | `IdempotencyFilter` (§5.14, 14 §7) | Тийм | Replay / 422 / 409 |
| 4 | A үе: `CheckJournalLine` (журнал), эх модулийн шалгалт (баримт), `CheckDocument`, `ValidateAsync` | Handler, engine | **Үгүй** — бүгдийг цуглуулна | 422 |
| 5 | Advisory lock | Engine | Тийм | 503 `api.lock_timeout` |
| 6 | `LockSourceAsync` (ETag, мөрийн олонлог, setup stamp) | `IPostedDocumentWriter` | Тийм | 412 / 409 |
| 7 | B үе: `CheckLockedAsync` (үе, цонх, данс, dimension, шалтгаан, **дугаарын цувралын урьдчилсан шалгалт**) + writer-ийн `ValidateLockedAsync` | Engine, writer | **Үгүй** — бүгдийг цуглуулна | 422 / 409 |
| 8 | Self-check (Σ = 0, бөөрөнхий) | Engine | Тийм | 500 `api.internal_error` (P1) |
| 9 | Хуулийн дугаар (`ERN01..03`) — 7-д урьдчилж илэрсэн тул ердийн үед гарахгүй | `fn_next_document_no` | Тийм | 422 `platform.number_series_*` |
| 10 | Insert-ийн trigger (`ERP01`, `ERG01`, `ERD01`, `ERC01`, `ERV01`) | DB | Тийм | §8.6 (апп урьдчилж шалгадаг тул ховор) |
| 11 | Deferred тэнцэл ба FK (`ERB01`, register FK) | DB, COMMIT эсвэл preview-ийн `SET CONSTRAINTS ALL IMMEDIATE` | Тийм | 500 (P1) |

- 4 ба 7-д цугласан алдаа 1 бол хариуны дээд `code` = тэр алдааны код ба HTTP; нэгээс олон бол `422 api.validation_failed`, бүгд `errors[]`-д (14 API-ERR-05). Алдаа бүр `pointer` (`/lines/{index}/accountId`), `lineId`, `params`-тай.
- Ваучерын түвшний алдааны `params` нь `documentNo` (ноорог дугаар, `J-000045`), `postingDate`-тэй, учир нь хуулийн дугаар хараахан олгогдоогүй.
- Анхааруулга (`W-*`) нь `PostingResult.Warnings` ба preview-ийн хариунд гарна; батлахыг зогсоохгүй.

### 8.2 Энэ баримтын эзэмшдэг `gl.*` код: ваучер ба журнал

| Код | HTTP | Мессеж (mn) | Хэзээ | Дүрэм |
|---|---|---|---|---|
| `gl.voucher_unbalanced` | 422 | Ваучер {documentNo} ({postingDate}) тэнцээгүй: дебит {debit}, кредит {credit}, зөрүү {difference}. | Ваучерын Σ ≠ 0 (мөрийн эсвэл задарсан G/L түвшинд) | BR-PST-22 |
| `gl.voucher_empty` | 422 | Ваучер {documentNo}-д тэгээс ялгаатай хоёроос цөөн мөр байна. | < 2 тэг биш G/L мөр; хоосон `PostingDocument` | BR-PST-24 |
| `gl.voucher_multiple_partners_with_vat` | 422 | НӨАТ-тай ваучер {documentNo} нэгээс олон харилцагч/нийлүүлэгчтэй байж болохгүй. | BR-PST-23 | BR-PST-23 |
| `gl.posting_too_large` | 422 | Нэг удаад {maxEntries} хүртэлх бичилт, {maxVouchers} хүртэлх ваучер батлах боломжтой. Журналыг хувааж батална уу. | > 20 000 entry эсвэл > 5 000 ваучер | BR-PST-64 |
| `gl.amount_not_rounded` | 422 | Дүн {precision} нарийвчлалаар бөөрөнхийлөгдөөгүй байна. | `amount_lcy` эсвэл G/L мөрийн дүн | BR-PST-05, -13 |
| `gl.journal_empty` | 422 | Журналд батлах мөр алга. | Хоосон мөрөөс бусад мөр байхгүй | BR-PST-62 |
| `gl.journal_changed` | 409 | Журнал өөр хэрэглэгчээр өөрчлөгдсөн. Дахин ачаалж батална уу. | `expectedLineCount` эсвэл B үеийн мөрийн олонлог зөрсөн | §5.4.1 |
| `gl.journal_series_missing` | 422 | Журнал {template}/{batch}-д батлах дугаарын цуврал тохируулаагүй байна. | Batch ба template хоёулаа `posting_no_series_id`-гүй | §5.4.1 |
| `gl.setup_changed` | 409 | Дансны эсвэл НӨАТ-ын тохиргоо батлах явцад өөрчлөгдсөн. Дахин оролдоно уу. | A үед ашигласан setup-ийн `row_version` B үед өөр | §5.2 |
| `gl.closing_template_manual_line` | 422 | Жилийн хаалтын журналыг гараар батлах боломжгүй. "Жилийн хаалт" хуудсыг ашиглана уу. | `CLSINCOME` template-ийн batch-ийг `:post` | BR-PST-17 |
| `gl.closing_entry_invalid` | 422 | Хаалтын бичилтийг зөвхөн жилийн хаалт 12-р сарын 31-ний огноогоор үүсгэнэ. | `IsClosing` буруу (кодын хамгаалалт) | BR-PST-17 |
| `gl.reason_code_required` | 422 | Шалтгааны код заавал. | Буцаалт, кредит нот, залруулгын санал | BR-PST-20 |
| `gl.reason_code_blocked` | 422 | Шалтгааны код {code} блоклогдсон. | | BR-PST-20 |

### 8.3 Мөр ба данс

| Код | HTTP | Мессеж (mn) | Хэзээ | Дүрэм |
|---|---|---|---|---|
| `gl.posting_date_required` | 422 | Мөр {lineNo}: огноо заавал. | | BR-PST-11 |
| `gl.document_no_required` | 422 | Мөр {lineNo}: баримтын дугаар заавал. | | BR-PST-11 |
| `gl.line_account_required` | 422 | Мөр {lineNo}: данс эсвэл харьцсан данс заавал. | | BR-PST-12 |
| `gl.line_partner_pair_invalid` | 422 | Мөр {lineNo}: хоёр тал хоёулаа харилцагч, нийлүүлэгч эсвэл үндсэн хөрөнгө байж болохгүй. | | BR-PST-12 |
| `gl.line_amount_zero` | 422 | Мөр {lineNo}: дүн 0 байж болохгүй. | | BR-PST-13 |
| `gl.line_amount_sign_mismatch` | 422 | Мөр {lineNo}: валютын дүн ба төгрөгийн дүнгийн тэмдэг зөрсөн. | | BR-PST-13 |
| `gl.applies_to_not_allowed` | 422 | Мөр {lineNo}: тулгах баримтыг зөвхөн харилцагч/нийлүүлэгчийн мөрөнд заана. | | BR-PST-14 |
| `gl.account_not_posting` | 422 | Данс {account} гүйлгээний данс биш (толгой эсвэл нийлбэр данс). | `account_type ≠ 'POSTING'`; DB `ERG01` | BR-PST-15 |
| `gl.account_blocked` | 422 | Данс {account} блоклогдсон. | Мөр, буцаалт, жилийн хаалт (`accounts[]`) | BR-PST-15, -46, -54 |
| `gl.direct_posting_not_allowed` | 422 | Данс {account} руу шууд бичих боломжгүй (хяналтын данс). Харилцагч, нийлүүлэгч эсвэл мөнгөний дансаар оруулна уу. | `UserEntered` ба `direct_posting = false` | BR-PST-15 |
| `gl.gen_posting_type_required` | 422 | Мөр {lineNo}: НӨАТ-ын бүлэгтэй мөрөнд гүйлгээний төрөл (Борлуулалт / Худалдан авалт) заавал. | | BR-PST-16 |
| `gl.posting_groups_not_allowed` | 422 | Мөр {lineNo}: харилцагч, нийлүүлэгч, мөнгөний дансны талд НӨАТ-ын бүлэг заахгүй. | | BR-PST-16 |
| `gl.vat_amount_mismatch` | 422 | Мөр {lineNo}: НӨАТ ба суурь дүнгийн нийлбэр мөрийн дүнтэй тэнцэхгүй байна. | `vat_amount + vat_base_amount ≠ amount` | BR-PST-16 |
| `gl.vat_difference_not_allowed` | 422 | Журнал {template}-д НӨАТ-ын дүнг гараар засахыг зөвшөөрөөгүй. | `vat_difference ≠ 0`, `allow_vat_difference = false` | BR-PST-38 |
| `gl.vat_difference_too_large` | 422 | НӨАТ-ын зөрүү {difference} нь зөвшөөрөгдөх дээд хэмжээ {max}-ээс их байна. | | BR-PST-38 |
| `gl.account_type_not_enabled` | 422 | Дансны төрөл {accountType} энэ хувилбарт идэвхгүй. | R1-д `FIXED_ASSET` | BR-PST-19 |
| `gl.currency_not_enabled` | 422 | Гадаад валютаар журнал бичих боломж дараагийн хувилбарт нээгдэнэ. | R1-д `currency_code` | BR-PST-19 |
| `gl.recurring_not_enabled` | 422 | Давтагдах журнал дараагийн хувилбарт нээгдэнэ. | R1-д `recurring = true` | BR-PST-19 |

### 8.4 Dimension

| Код | HTTP | Мессеж (mn) | Хэзээ | Дүрэм |
|---|---|---|---|---|
| `gl.dimension_blocked` | 422 | Хэмжигдэхүүн {dimension} блоклогдсон. | | BR-PST-33 |
| `gl.dimension_value_not_found` | 422 | Хэмжигдэхүүний утга олдсонгүй. | `fn_get_dimension_set_id` → `ERD01` | BR-PST-31 |
| `gl.dimension_value_blocked` | 422 | {dimension}-ийн утга {value} блоклогдсон. | | BR-PST-33 |
| `gl.dimension_value_not_postable` | 422 | {value} нь толгой/нийлбэр утга тул бичилтэд ашиглахгүй. | `value_type ≠ 'STANDARD'` | BR-PST-33 |
| `gl.dimension_value_required` | 422 | Данс {account}-д {dimension} хэмжигдэхүүн заавал. | `CODE_MANDATORY` | BR-PST-34 |
| `gl.dimension_value_must_match` | 422 | Данс {account}-д {dimension} = {expected} байх ёстой. | `SAME_CODE` | BR-PST-34 |
| `gl.dimension_value_not_allowed` | 422 | Данс {account}-д {dimension} хэмжигдэхүүн заахгүй. | `NO_CODE` | BR-PST-34 |

### 8.5 Буцаалт, залруулга, жилийн хаалт

| Код | HTTP | Мессеж (mn) | Хэзээ | Дүрэм |
|---|---|---|---|---|
| `gl.reversal_use_credit_memo` | 409 | Борлуулалт, худалдан авалтын баримтыг кредит нотоор буцаана. | Source `SALES`, `PURCHASES` | BR-PST-45 |
| `gl.reversal_not_reversible` | 409 | Энэ гүйлгээг ({sourceCode}) буцаах боломжгүй. | Буцаалт, хаалт, тулгалт, НӨАТ-ын хаалт г.м. | BR-PST-45 |
| `gl.transaction_already_reversed` | 409 | Гүйлгээ {transactionNo} аль хэдийн буцаагдсан. | `reversed_by_transaction_no` бөглөгдсөн; `23505 ux_gl_transaction__reverses` | BR-PST-50 |
| `gl.reversal_entries_applied` | 409 | Гүйлгээний авлага/өглөг тулгагдсан байна. Эхлээд тулгалтыг цуцална уу. | Parties-ийн `ValidateReversalAsync` | BR-PST-46 |
| `gl.reversal_vat_settled` | 409 | НӨАТ-ын бичилт хаагдсан (тайлагнасан) тул буцаах боломжгүй. Нээлттэй үед залруулга хийнэ үү. | VAT entry `closed = true` | BR-PST-46 |
| `gl.register_not_reversible` | 409 | Бүртгэл {registerNo}-ийг буцаах боломжгүй. | Буцаалтын register эсвэл зөвшөөрөгдөөгүй source | BR-PST-48 |
| `gl.register_already_reversed` | 409 | Бүртгэл {registerNo} аль хэдийн буцаагдсан. | | BR-PST-48 |
| `gl.correction_use_reversal` | 409 | Эх гүйлгээний үе нээлттэй байна. Залруулгын оронд буцаалт хийнэ үү. | `correction-proposal`, эх үе `OPEN` | BR-PST-51 |
| `gl.correction_group_missing` | 422 | Эх бичилтийн бүлэг {group} одоо байхгүй. Залруулгын мөрийг гараар бөглөнө үү. | `correction-proposal` | §5.11 |
| `gl.year_close_periods_open` | 422 | {year} оны бүх сар хаагдаагүй: {periods}. | | BR-PST-54 |
| `gl.year_close_result_account_missing` | 422 | Ерөнхий дэвтрийн тохиргоонд "Тайлант үеийн ашиг (алдагдал)" данс заагаагүй байна. | | BR-PST-54 |
| `gl.year_close_result_account_invalid` | 422 | Данс {account} нь тайлант үеийн ашгийн данс байж болохгүй: гүйлгээний, балансын, өөрийн хөрөнгийн блоклогдоогүй данс байх ёстой. | | BR-PST-54 |
| `gl.year_close_previous_year_open` | 422 | {previousYear} оны санхүүгийн жил хаагдаагүй байна. Жилүүдийг дарааллаар нь хаана уу. | Y−1 бичилттэй, `OPEN` | BR-PST-54 |

### 8.6 Бусад баримтын эзэмшдэг, энэ engine-ээс гардаг код

| Код | HTTP | Эзэмшигч | Энэ engine-д хэзээ |
|---|---|---|---|
| `gl.period_not_found`, `gl.period_closed`, `gl.posting_date_outside_window`, `gl.posting_date_outside_user_window` (R2) | 422 | [13](./13-security-audit-tenancy.md) §18.1 | `CheckLockedAsync`, буцаалт, G/L-гүй run (BR-PST-18, -46, -70) |
| `gl.period_locked`, `gl.fiscal_year_locked` | 409 | 13 §18.1 | Мөн; жилийн хаалт (BR-PST-54) |
| `platform.number_series_missing_line`, `platform.number_series_date_order`, `platform.number_series_exhausted` | 422 | 13 §18.1, 14 §9.6 | Хуулийн дугаар (`ERN01..03`, BR-PST-26) |
| `tax.vat_period_closed` | 422 | НӨАТ-ын spec | Tax writer (`ERV01`), буцаалт |
| `bank.cash_negative_balance`, `bank.entry_reconciled` | 422 / 409 | Банк/кассын spec | CashBank writer (`ERC01`), буцаалт |
| `party.*` (тулгалт, блоклогдсон харилцагч) | 422 / 409 | [06-sales-receivables.md](./06-sales-receivables.md) §8 | Parties writer, `IJournalAccountTypeHandler`, G/L-гүй run |
| `api.validation_failed`, `api.etag_mismatch`, `api.document_already_posted`, `api.idempotency_key_reused`, `api.idempotency_in_progress`, `api.lock_timeout`, `api.internal_error`, `api.resource_not_found` | 422 / 412 / 409 / 503 / 500 / 404 | [14](./14-api.md) §9.4 | §8.1 |
| `platform.immutable_record`, `platform.context_error`, `platform.rate_limited` | 500 / 500 / 429 | 13 §18.1, 14 §9.6 | `ERL01`, `ERT01`, preview-ийн rate limit |

### 8.7 Анхааруулга (батлахыг зогсоохгүй)

| Код | Мессеж (mn) | Хэзээ |
|---|---|---|
| `W-01` (`gl.normal_side_warning`) | Данс {account}-ийн хэвийн тал {normalSide}; энэ мөр эсрэг талд бичигдэж байна. | `UserEntered` мөр, D-D1, FR-GL-005 |
| `W-02` (`gl.same_account_both_sides`) | Мөр {lineNo}: данс ба харьцсан данс ижил тул бичилт үр дүнгүй. | §5.4.2 |
| `W-03` (`gl.correction_vat_recalculated`) | НӨАТ-ын хувь өөрчлөгдсөн тул залруулгын НӨАТ эх бичилтээс ялгаатай байж болно. | §5.11 |
| `W-04` (`gl.next_fiscal_year_missing`) | {nextYear} оны санхүүгийн жил үүсээгүй тул хуримтлагдсан ашиг руу шилжүүлэх ноорог үүсээгүй. | BR-PST-58 |
| `W-05` (`gl.re_transfer_date_changed`) | Шилжүүлгийн огноог {date} болгосон тул дахин хаалт хийхэд тооцогдохгүй. | §6.8 |
| `W-06` (`gl.re_transfer_draft_skipped`) | Хуримтлагдсан ашиг руу шилжүүлэх ноорог үүсээгүй: {reason} (ерөнхий журналын DEFAULT багц эсвэл хуримтлагдсан ашгийн данс тохируулаагүй). | §5.13, BR-PST-58 |

Анхааруулгын кодыг хариунд `warnings[] = { code, message, params }` хэлбэрээр (14-т `warnings` өргөтгөл нэмэх санал, §10.3).

### 8.8 DB-ийн SQLSTATE → апп-ийн код (posting-ийн онцлог)

14 §9.6-ийн ерөнхий хүснэгтийг дагана. Posting-д дараах нарийвчлал нэмэгдэнэ:

| SQLSTATE / constraint | Апп-ийн код | HTTP | Тайлбар |
|---|---|---|---|
| `ERB01` (тэнцэл), `ERB02` (огноо/register зөрсөн) | `api.internal_error` | 500 | Self-check (BR-PST-25)-ийг давсан кодын алдаа; P1 alert |
| `ERP01` | `gl.period_not_found` / `gl.period_closed` / `gl.period_locked` (409) / `gl.posting_date_outside_window` | 422 / 409 | DB нэг код (`ERP01`)-оор бүх тохиолдлыг өгнө: mapper `CheckPostingDateAsync`-ийг (уншилт) дахин ажиллуулж тодорхой кодыг сонгоно, олдохгүй бол `gl.period_closed`. `CheckLockedAsync`-ийг давсан бол P3 (урьдчилсан шалгалт дутуу) |
| `ERP02` | `gl.fiscal_year_locked` (posting-д зөвхөн `FiscalYearCloseWriter`-ийн `UPDATE gl.fiscal_year`-ээс); үеийн төлөвийн үйлдэлд `gl.period_locked` (13 §18) | 409 | Posting-ийн огноо `LOCKED` үед `ERP02` биш `ERP01` гардаг (910 `fn_assert_posting_date_allowed`) |
| `ERG01` | `gl.account_not_posting` | 422 | |
| `ERD01` | `gl.dimension_value_not_found` | 422 | |
| `ERV01` | `tax.vat_period_closed` | 422 | |
| `ERC01` | `bank.cash_negative_balance` | 422 | |
| `ERN01`, `ERN02`, `ERN03` | `platform.number_series_*` | 422 | |
| `ERL01` | `platform.immutable_record` | 500 (14 §9.6) | `fn_ledger_update`-ийн whitelist зөрчсөн writer (кодын алдаа); P2. 13 §18.1-д 409 гэж бичсэнийг 13 засна |
| `ERT01`, `42501` | `platform.context_error` | 500 | P1 |
| `23505` `ux_gl_transaction__reverses` | `gl.transaction_already_reversed` | 409 | Зэрэг хоёр буцаалт (BR-PST-50) |
| `23505` `gl_entry (company_id, entry_no)`, `gl_transaction (company_id, transaction_no)`, `gl_register (company_id, no)` | `api.internal_error` | 500 | Counter-ийг тойрсон кодын алдаа; P1 |
| `55P03` (advisory lock, дугаарын цуврал, ledger counter, ноорог `FOR UPDATE`), `57014` | `api.lock_timeout` + `Retry-After: 2` | 503 | BR-PST-63 |
| `55P03` (`integration.idempotency_key`-ийн `INSERT … ON CONFLICT`) | `api.idempotency_in_progress` + `Retry-After: 1` | 409 | 14 API-IDEM-07; аль statement дээр гарсныг pipeline мэднэ |
| `22023` (`fn_next_entry_no(count < 1)`) | `api.internal_error` | 500 | W9 зөрчсөн кодын алдаа; P2 |
| `40001`, `40P01` | Нэг удаа автомат давталт, дараа нь `api.lock_timeout` | 503 | §5.15 |

---

## 9. Events ба integration

### 9.1 Нийтэлдэг outbox topic (GL)

Бүгд posting-ийн transaction дотор `integration.outbox`-д (ADR-0012), topic нь `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$` CHECK-д таарна. Handler (consumer) бүртгэгдээгүй topic-ийг бичихгүй (BR-PST-68): `IOutboxTopicRegistry.IsHandled(topic)`.

| Topic | Хэзээ | `payload` | `idempotency_key` | Consumer | Хувилбар |
|---|---|---|---|---|---|
| `gl.register.posted` | Run бүрийн commit (preview-гүй) | `{ companyId, registerNo, sourceCode, postingType, transactionNos: [..], fromEntryNo, toEntryNo, documentNos: [..] }` | `gl.register.posted:{companyId}:{registerNo}` | R2: webhook fan-out (`gl_register.posted` event), тайлангийн кэш хүчингүй болгох | R2 (R1-д handler байхгүй тул бичигдэхгүй) |
| `gl.transaction.reversed` | Буцаалтын run | `{ companyId, registerNo, reversals: [{ originalTransactionNo, reversalTransactionNo, documentNo }], reasonCodeId }` | `gl.transaction.reversed:{companyId}:{registerNo}` | Мэдэгдэл (Owner/нягтлан), eBarimt-ийн хяналт (банкны МХ баримтад хамааралгүй) | R1 |
| `gl.fiscal_year.closed` | Жилийн хаалт (эхний, дахин ажиллуулалт, ваучергүй no-op хаалт; preview-гүй) | `{ companyId, fiscalYearId, year, closingTransactionNo (no-op үед хуучин эсвэл null), documentNo?, voucherPosted: bool, rerun: bool, reTransferDraftJournalId? }` | `gl.fiscal_year.closed:{companyId}:{year}:{requestId}` (no-op үед transactionNo байхгүй тул хүсэлтийн id; ижил хүсэлтийн давталт Idempotency-Key-ээр replay болдог) | Тайлангийн архив (FR-RPT-017, Маягт А-гийн snapshot), мэдэгдэл | R1 |

- Payload нь "нимгэн": дугаар ба түлхүүр талбар; дүн, харилцагчийн нэр, PII агуулахгүй. Consumer `GET`-ээр бүрэн өгөгдлийг уншина (14 §11.2-ын зарчим).
- `aggregate_type = 'gl.gl_register'`, `aggregate_id` = register-ийн `id`; `request_id` = хүсэлтийн id.

### 9.2 Эх модулийн event (engine дамжуулна)

Engine нь `PostingDocument.Outbox` ба writer-ийн `ctx.AddOutbox`-ийг өөрчлөхгүйгээр ижил transaction-д бичнэ. Жишээ (эзэмшигч нь эх модуль):

| Topic (жишээ) | Эзэмшигч | Тайлбар |
|---|---|---|
| `ebarimt.receipt.send` | [12](./12-ebarimt-integration.md) | Борлуулалтын баримтын eBarimt; POS-д C үеийн синхрон илгээлт (BR-PST-03) |
| `event.sales_invoice.posted`, `event.sales_credit_memo.posted` | [06](./06-sales-receivables.md) §9 | Webhook (`sales_invoice.posted`, 14 §11.2) |
| `event.customer_entries.applied` | 06 §5.13.3 | G/L-гүй run (§5.19) |
| `webhook.fanout` | [14](./14-api.md) §11.3 | R2 |

### 9.3 Хэрэглэдэг event

Posting engine нь outbox/inbox-оос **юу ч хэрэглэхгүй** (синхрон дуудлагаар л ажиллана). Жилийн хаалт, буцаалтыг async job-оор (14 §10) ажиллуулах нь R2-ийн сонголт (job `gl.year_close`), тэр үед ч engine-ийн дуудлага ижил.

### 9.4 Модуль хоорондын in-process өргөтгөлийн цэг

| Интерфейс | Байршил | Хэрэгжүүлэгч | Зорилго |
|---|---|---|---|
| `IPostingService`, `IPostingDocumentSource`, `PostingDocument`, `PostingBuffer` | `Erp.GeneralLedger.Contracts.Posting` | GL | Бүх модулийн posting (§5.1) |
| `ILedgerWriter<TLine>`, `IReversibleLedger` | мөн | Tax, Parties, CashBank (R2: FA, Inventory, Currency) | Дэд дэвтэр бичих, буцаах (§5.8) |
| `IPostedDocumentWriter` | мөн | Sales, Purchases, CashBank, GL (журнал, жилийн хаалт) | Posted баримт, ноорог устгах (§5.8) |
| `IJournalAccountTypeHandler`, `IJournalVatHandler` | `Erp.GeneralLedger.Contracts.Journals` | Parties, CashBank, Tax | Журналын мөрийг задлах (§5.4.2) |
| `IVatPostingComposer` | `Erp.Tax.Contracts` | Tax | НӨАТ-ын G/L мөр ба VAT line (§5.7) |
| `IReversalService` | `Erp.GeneralLedger.Contracts.Posting` | GL | Tax (НӨАТ-ын хаалтын буцаалт), R2 модулиуд (§5.10) |
| `IDimensionSetService` | `Erp.GeneralLedger.Contracts.Dimensions` | GL | Set олох/үүсгэх (§5.6) |
| `ILedgerHashContributor` | `Erp.GeneralLedger.Contracts.Posting` | Tax (`vat_entry`), бусад writer (CR-15-ийн дараа) | Register-ийн hash-д өөрийн мөрийн каноник байт өгөх (§5.9) |

### 9.5 Ажиглалт (observability)

Метрик ба span нь §5.16-д. Нэмэлт: `erp_posting_runs_total{source_code, mode, result}`, `erp_reversal_total{scope}`, `erp_year_close_total{rerun}`. Log-д `registerNo`, `transactionNo`, `sourceCode`, `requestId` бүтэцтэй талбараар; дүн, харилцагчийн нэр бичигдэхгүй (13 §9).

---

## 10. API ба UI холбоос

### 10.1 REST endpoint (дэлгэрэнгүй нь [14-api.md](./14-api.md) §15.2)

| Endpoint | Эрх | Энэ баримтын хэсэг | 14-д байгаа эсэх |
|---|---|---|---|
| `GET /journal-templates`, `GET`/`POST`/`PATCH`/`DELETE /journals`, `…/journals/{id}/lines` | `TABLE gl.journal_*` | §5.4 | ✔ |
| `POST /journals/{id}:preview` | `ACTION gl.journal.preview` | §5.12, BR-PST-52 | ✔ |
| `POST /journals/{id}:post` (body `{ expectedLineCount? }`) | `ACTION gl.journal.post` | §5.4, BR-PST-21..30 | ✔ (body нэмэх, §10.3) |
| `GET /gl-transactions`, `GET /gl-transactions/{id}` | `TABLE gl.gl_transaction R` | §3.1 | ✔ |
| `POST /gl-transactions/{id}:reverse` (body `{ reasonCodeId, description? }`) | `ACTION gl.transaction.reverse` | §5.10, BR-PST-45..50 | ✔ |
| `POST /gl-transactions/{id}:preview-reverse` | `ACTION gl.transaction.reverse` | §5.10, §5.12 | ✕ санал |
| `GET /gl-transactions/{id}/correction-proposal?date=&reasonCodeId=` | `ACTION gl.transaction.reverse` | §5.11, BR-PST-51 | ✕ санал |
| `GET /gl-registers`, `POST /gl-registers/{id}:reverse` | `TABLE gl.gl_register R`, `ACTION gl.register.reverse` | §5.10, BR-PST-48 | ✔ |
| `POST /gl-registers/{id}:preview-reverse` | `ACTION gl.register.reverse` | §5.10 | ✕ санал |
| `GET /gl-entries`, `GET /gl-entries/{id}` | `TABLE gl.gl_entry R` | §3.1 | ✔ |
| `POST /fiscal-years/{id}:preview-close`, `:close` (body `{ createRetainedEarningsTransferDraft: true }`) | `ACTION gl.year.close` | §5.13, BR-PST-54..59 | ✔ (body нэмэх) |
| `GET`/`POST`/`PATCH`/`DELETE /standard-journals`, `POST /standard-journals/{id}:copy-to-journal` (`journalId`, `postingDate`) | `TABLE gl.standard_journal*`, `TABLE gl.journal_line I` | §5.4.6 | ✕ санал |
| `POST /customer-ledger-entries:apply`, `…/{id}:unapply` (ба нийлүүлэгчийнх) | 06-ийн эрх | §5.19 | 06 / 14 |

### 10.2 UI дэлгэц ([15-ui-ux.md](./15-ui-ux.md))

| Дэлгэц | Холбогдох хэсэг |
|---|---|
| S-GL-03 Ерөнхий журнал (§16.5, UX-JNL-01..08, UX-POST-01..09) | §5.4, §7 E-A, E-B; ноорог ↔ хуулийн дугаарын харгалзаа (BR-PST-27) |
| S-GL-04 Стандарт журнал | §5.4.6 |
| S-GL-05 Эхний үлдэгдэл | §5.4.4, E-K |
| S-GL-06 Ерөнхий дэвтрийн бичилт | §3.1, буцаалтын холбоос (`reversed_entry_no`) |
| S-GL-07 Гүйлгээ ба бүртгэл ("Гүйлгээ буцаах", "Бүртгэл буцаах", "Залруулах журнал") | §5.10, §5.11, E-F, E-G, E-L |
| S-GL-08 Батлахын өмнө харах (ledger бүрийн tab, UX-POST-09) | §5.12, `PostingResult`, E-D |
| S-GL-11 Жилийн хаалт (wizard) | §5.13, E-H, E-I, E-J |
| S-GL-14 Журналын загвар ба багц | §3.3 (цуврал), §5.4 |

### 10.3 14 ба 15-д тусгах санал

- 14 §15.2-д нэмэх: `:preview-reverse` (гүйлгээ, register), `GET …/correction-proposal`, `/standard-journals` CRUD ба `:copy-to-journal`; `:post` body `expectedLineCount`; `:close` body `createRetainedEarningsTransferDraft`; хариуны `warnings[]` өргөтгөл (§8.7).
- 14 §9.5-ын "05" мөрийг §8.2–8.5-ын эцсийн жагсаалтаар солих. `gl.account_in_use`, `gl.account_has_entries`, `gl.income_balance_mismatch` (дансны CRUD) нь posting engine-ийнх биш — дансны төлөвлөгөөний (CoA) хэсэгт үлдэнэ.
- 15 S-GL-07: "Залруулах журнал" товч → `correction-proposal` → `POST /journals/{id}/lines` (сервер санал, клиент хадгална; Z-PST-13).
- `gl.journal.preview` эрхийн объект seed-д алга (15 OQ-UI-23) — 13 §6.3 ба `mn_00_catalogs.sql`-д нэмэх.
- 14 §9.5-д шинэ код нэмэх: `gl.journal_series_missing`, `gl.year_close_previous_year_open`; анхааруулга `W-06`. 14-ийн `gl.fiscal_year_already_closed`-ыг `:close`-д **хэрэглэхгүй** (дахин ажиллуулалт нь зөрүү/no-op, BR-PST-56); үеийн spec-д үлдэнэ.
- Бусад spec (Z-PST-15): 07 BR-PUR-72 — бэлэн худалдан авалтын 2 дахь ваучер `document_no` = posted нэхэмжлэхийн дугаар (`PI-…`, `SameAsVoucher`), МХ-2 дугаар `KZ`-оос тусдаа (09 BR-BNK-21); 06 BR-SAL-50 аль хэдийн нийцсэн.

---

## 11. Тест сценари

Формат: **Өгөгдсөн нь** (Given) / **Хэрэв** (When) / **Тэгэхэд** (Then) / **Мөн** (And). Seed: `mn_*` (дансны төлөвлөгөө, журнал, цуврал), компани К1, 2026 оны 12 үе `OPEN`, `amount_rounding_precision = 0.01`, бүх counter §7-ийн эхлэлтэй.

### 11.1 Хүлээн авах тест (AT-PST)

- **AT-PST-001** (BR-PST-01). **Өгөгдсөн нь** solution; **Хэрэв** architecture test (`Ledger_tables_written_by_engine_only`) ажиллавал; **Тэгэхэд** `INSERT INTO (gl|tax|party|bank|fa|inv)\.[a-z_]*(entry|register|transaction)` нь зөвхөн `Erp.GeneralLedger.Infrastructure.Posting` ба бүртгэгдсэн writer-ийн `Sql/` дотор олдоно.
- **AT-PST-002** (BR-PST-02). **Өгөгдсөн нь** 3 ваучертай журнал; **Хэрэв** батлавал; **Тэгэхэд** 1 `gl_register`, 3 `gl_transaction` (дараалсан `transaction_no`), entry бүр register-ийн мужид.
- **AT-PST-003** (BR-PST-03). **Өгөгдсөн нь** HTTP клиентийг mock-лосон writer; **Хэрэв** B үед гадаад дуудлага хийвэл; **Тэгэхэд** architecture test унана (B үеийн interface-д `HttpClient` inject хийгдэхгүй).
- **AT-PST-004** (BR-PST-04). **Өгөгдсөн нь** 3 алдаатай мөр (хоосон данс, блоклогдсон данс, тэнцээгүй ваучер); **Хэрэв** `:post`; **Тэгэхэд** `422 api.validation_failed`, `errors[]` = 3; **Мөн** `GJ` counter өөрчлөгдөөгүй, `gl_entry` мөр нэмэгдээгүй.
- **AT-PST-005** (BR-PST-05). API-аар `100.005` хадгалах гэвэл ноорог хадгалах үед `422 api.amount_precision_exceeded` (14 API-JSON-06a; engine-д хүрэхгүй). Ноорог 0.01-ээр хадгалагдсаны дараа компанийн `amount_rounding_precision`-ийг 1 болгоод `100.50`-тай журнал батлах → `gl.amount_not_rounded` (`precision = 1`); тестийн assembler `GlPostingLine.Amount = 100.005` өгвөл → self-check 500 (BR-PST-25).
- **AT-PST-006** (BR-PST-06). Батлагдсан кредит мөрийн `debit_amount = 0`, `credit_amount = |amount|`; engine-ийн INSERT баганын жагсаалтад `debit_amount` байхгүй (SQL snapshot тест).
- **AT-PST-007** (BR-PST-07). Global dimension 1 = DEPT; set {DEPT=ADMIN} мөрийн `global_dim_1_value_id` = ADMIN (trigger); engine-ийн INSERT-д багана байхгүй.
- **AT-PST-008** (BR-PST-09). `PostingRun.SourceCode = "FOO"` → `500 api.internal_error` (FK `platform.source_code`), лог `FAILED`.
- **AT-PST-010** (BR-PST-10). Хоосон мөр (данс, дүн хоосон; мөн зөвхөн `bal_account_id`-тэй, дүн 0, `system_created = false` мөр) бүхий журнал → хоосон мөрийг алгасаж батлагдана; батласны дараа batch-д нэг ч мөр үлдэхгүй (хоосон мөр ч устна).
- **AT-PST-011** (BR-PST-11). Огноогүй мөр → `gl.posting_date_required` (`pointer = /lines/0/postingDate`).
- **AT-PST-012** (BR-PST-12). `CUSTOMER` ↔ `VENDOR` мөр → `gl.line_partner_pair_invalid`.
- **AT-PST-013** (BR-PST-13). Дүн 0 мөр (данстай) → `gl.line_amount_zero`.
- **AT-PST-014** (BR-PST-14). `GL_ACCOUNT` ↔ `BANK_ACCOUNT` мөрөнд `applies_to_doc_no` → `gl.applies_to_not_allowed`.
- **AT-PST-015** (BR-PST-15). `GL_ACCOUNT 1200` (direct_posting = false) → `gl.direct_posting_not_allowed`; ижил данс `SystemDerived` мөрөөр (харилцагчийн мөр) → амжилттай.
- **AT-PST-016** (BR-PST-16). `VENDOR` талд `vat_prod_posting_group` → `gl.posting_groups_not_allowed`; `GL_ACCOUNT` талд VAT бүлэгтэй, `gen_posting_type = NONE` → `gl.gen_posting_type_required`.
- **AT-PST-017** (BR-PST-17). CLOSING/YEAR_END batch-ийг `:post` → `gl.closing_template_manual_line`.
- **AT-PST-018** (BR-PST-18). 2026-01 `CLOSED` → 01-15-ны мөр `gl.period_closed`; `LOCKED` → `409 gl.period_locked`; `allow_posting_to = 2026-03-31` ба 04-02 → `gl.posting_date_outside_window` (Owner-т ч).
- **AT-PST-019** (BR-PST-19). `currency_code = 'USD'` мөр → `gl.currency_not_enabled`; `FIXED_ASSET` → `gl.account_type_not_enabled`.
- **AT-PST-020** (BR-PST-20). `:reverse` body-д `reasonCodeId` байхгүй → `gl.reason_code_required`; блоклогдсон шалтгаан → `gl.reason_code_blocked`.
- **AT-PST-021** (BR-PST-21). `J-000045` дугаартай 4 мөр (2 нь 03-01, 2 нь 03-02, тус бүр тэнцсэн) → 2 ваучер, 2 хуулийн дугаар; 03-02-ныхыг 2 мөрийн нэгийг өөрчилж тэнцүүлээгүй бол зөвхөн тэр ваучерт `gl.voucher_unbalanced` (`postingDate = 2026-03-02`).
- **AT-PST-022** (BR-PST-22). 1,000.00 Дт / 999.99 Кт → `gl.voucher_unbalanced` (`difference = 0.01`); "round-off" мөр үүсэхгүй.
- **AT-PST-023** (BR-PST-23). НӨАТ-тай мөр + C0001 ба C0002 мөр нэг ваучерт → `gl.voucher_multiple_partners_with_vat`.
- **AT-PST-024** (BR-PST-24). 0 %-ийн борлуулалт (суурь 500,000, НӨАТ 0) → VAT G/L entry 0, VAT entry 1 (`base = −500,000`, `amount = 0`).
- **AT-PST-025** (BR-PST-25). Тестийн assembler Σ = 0.01 гаргавал → `500 api.internal_error`, P1 alert, DB-д юу ч бичигдээгүй, дугаар зарцуулагдаагүй.
- **AT-PST-026** (BR-PST-26). Tax writer-ийг `ValidateLockedAsync`-ийн дараа exception шиддэг болгоод батлах → ROLLBACK; дараагийн амжилттай posting өмнөх дугаарыг (`GJ-2026-00042`) авна.
- **AT-PST-027** (BR-PST-27). Журнал: `J-000050` (03-05), `J-000049` (03-05), `J-000048` (03-04) → хуулийн дугаар: `J-000048` → `GJ-…-01`, `J-000049` → `-02`, `J-000050` → `-03`; хариуны `vouchers[]` харгалзаа.
- **AT-PST-028** (BR-PST-28). 2 ваучер, 5 entry, 1 VAT → `GL_REGISTER +1`, `GL_TRANSACTION +2`, `GL_ENTRY +5`, `VAT_ENTRY +1`; бүгд завсаргүй.
- **AT-PST-031** (BR-PST-31). Утга {DEPT=ADMIN, PROJ=P1} ба {PROJ=P1, DEPT=ADMIN} → ижил `dimension_set_id`.
- **AT-PST-033** (BR-PST-33). Блоклогдсон утга → `gl.dimension_value_blocked`; `TOTAL` төрлийн утга → `gl.dimension_value_not_postable`.
- **AT-PST-034** (BR-PST-34). 7210-д `DEPT CODE_MANDATORY` ба мөрөнд DEPT алга → `gl.dimension_value_required`; хүснэгтийн түвшинд `PROJ NO_CODE` ба мөрөнд PROJ → `gl.dimension_value_not_allowed`; хаалтын мөр (`SystemGenerated`) шалгагдахгүй.
- **AT-PST-035** (BR-PST-35). Шинэ хослолтой preview → кэшид id алга; дараагийн Post ижил хослолд шинэ id авч болно (preview-ийн id rollback болсон).
- **AT-PST-037** (BR-PST-37). E-C → `gl_register.from_vat_entry_no = 74`, `to_vat_entry_no = 75`; НӨАТ-гүй E-A → NULL.
- **AT-PST-039** (BR-PST-39). Writer мөрийн `posting_date` ваучерынхаас өөр бол DB `ERB02` → 500 (тестийн writer).
- **AT-PST-040** (BR-PST-40). Writer-уудын дуудлагын дараалал log-оор: VAT → CUST → BANK → posted doc → outbox → register.
- **AT-PST-041** (BR-PST-41). `GlLineKeys` олдохгүй subledger мөр → `500 api.internal_error`.
- **AT-PST-043** (BR-PST-43). Register-ийн `from_entry_no..to_entry_no` = run-ий бүх entry; `app_user`-ээр `UPDATE gl.gl_register SET source_code = …` → `42501` (REVOKE); эзэмшигч (`app_owner`) ч → `ERL01` (`fn_guard_immutable`).
- **AT-PST-044** (BR-PST-44, CR-15-ийн дараа). Register 41-ийн `hash` = `sha256(prev_hash ‖ canonical(run))`; 40-ийн өгөгдлийг гараар өөрчлөхөд шөнийн шалгалт 41-ээс хойш тасралт мэдээлнэ.
- **AT-PST-045** (BR-PST-45). `SALES` гүйлгээг `:reverse` → `409 gl.reversal_use_credit_memo`; `CLSINCOME` → `409 gl.reversal_not_reversible`; буцаалтыг дахин → `gl.reversal_not_reversible`.
- **AT-PST-046** (BR-PST-46). Төлбөрийн журнал (C0001-ийн авлагыг тулгасан) → `gl.reversal_entries_applied`; хуулгад тулгагдсан банкны мөр → `bank.entry_reconciled`; НӨАТ-ын үе хаагдсан → `gl.reversal_vat_settled`; бүгд нэг хариунд (`api.validation_failed`).
- **AT-PST-047** (BR-PST-30, -47). E-F: буцаалтын `document_no = GJ-2026-00042`, `GJ` counter өөрчлөгдөөгүй, эх 531/532 `reversed = true`.
- **AT-PST-050** (BR-PST-50). Ижил гүйлгээг 2 зэрэгцээ хүсэлтээр (өөр key) буцаахад → нэг нь 201, нөгөө нь `409 gl.transaction_already_reversed`.
- **AT-PST-052** (BR-PST-52). Preview → хариуны `documentNo = "***"`, `registerNo = null`, entry 1..n; дараа нь бүх counter, `gl_entry`, `outbox`, `posting_log`, `dimension_set` өөрчлөгдөөгүй.
- **AT-PST-054** (BR-PST-54). 2026-11 `OPEN` → `gl.year_close_periods_open` (`periods = ["11-р сар 2026"]` — `accounting_period.name`); 2026-01..10 `LOCKED`, 11–12 `CLOSED` → нөхцөл хангагдана; 2026-12 `LOCKED` → `409 gl.period_locked` (хаалтын ваучерын огноо); 3500 блоклогдсон → `gl.year_close_result_account_invalid`; жил `LOCKED` → `409 gl.fiscal_year_locked`.
- **AT-PST-057** (BR-PST-57). E-H-ийн дараа `fiscal_year.status = 'CLOSED'`, `closing_transaction_no = 1500`; E-I-ийн дараа 1530.
- **AT-PST-060** (BR-PST-60). Session A `fn_lock_company_posting`-ийг барьж 6 s хүлээхэд session B-ийн `:post` → `503 api.lock_timeout`, `Retry-After: 2`; өөр компанийн posting хүлээхгүй.
- **AT-PST-061** (BR-PST-61). Posting ба сар хаах 100 удаа зэрэг → deadlock 0 (`40P01` тоолуур 0).
- **AT-PST-062** (BR-PST-62). Ижил key-ээр 2 удаа `:post` → хоёр дахь нь `Idempotent-Replayed: true`, ижил body; key ижил, body өөр → `422 api.idempotency_key_reused`; 422-ийн дараа засаад ижил key → амжилттай.
- **AT-PST-063** (BR-PST-63). COMMIT-ийн дараа холболт тасарсан (proxy-оор) → ижил key-ээр давтахад replay, давхар бичилт байхгүй.
- **AT-PST-064** (BR-PST-64). 20,001 entry үүсгэх журнал → `gl.posting_too_large`.
- **AT-PST-065** (BR-PST-65, perf). 5,000 мөрийн эхний үлдэгдэл → binary COPY, B үе ≤ 10 s, `statement_timeout = 120s` дотор.
- **AT-PST-067** (BR-PST-67). Амжилттай → `posting_log` `SUCCEEDED` (`gl_register_no`); `gl.period_closed`-оор бүтэлгүйтсэн → `FAILED` (`error_code = 'gl.period_closed'`), бизнесийн мөр 0; preview → мөр байхгүй.
- **AT-PST-068** (BR-PST-68). R1-д `gl.register.posted` handler бүртгэгдээгүй → outbox-д тэр topic бичигдэхгүй; `gl.transaction.reversed` бичигдэнэ.
- **AT-PST-069** (BR-PST-69). `:apply` (төлбөр ↔ нэхэмжлэх) → `DETAILED_CUST_LEDGER_ENTRY +2`, `APPLICATION_NO +1`, `transaction_no IS NULL`; `GL_REGISTER`, `GL_ENTRY` counter өөрчлөгдөөгүй.
- **AT-PST-070** (BR-PST-70). `:apply` огноо 2026-01-20 ба 2026-01 `CLOSED` → `gl.period_closed`.
- **AT-PST-071** (BR-PST-71). G/L-гүй run-ий body `GL_ENTRY` дугаар нөөцлөх гэвэл → `500 api.internal_error`.
- **AT-PST-072** (BR-PST-72). `:apply` амжилттай → `posting_log` (`APPLICATION`, `gl_register_no = NULL`, `source_no` = application_no).
- **AT-PST-073** (BR-PST-56, -57). **Өгөгдсөн нь** E-H-ийн дараа 2026-12 дахин нээгдсэн (жил `OPEN`), зөвхөн `BANK01` → `CASH01` 50,000 шилжүүлэг батлагдсан, 12-р сар дахин `CLOSED`; **Хэрэв** `:close`; **Тэгэхэд** `200`, `posted = false`, `CL` counter, `GL_*` counter, `gl_register`, `posting_log` өөрчлөгдөөгүй; **Мөн** `fiscal_year.status = 'CLOSED'`, `closing_transaction_no = 1500` хэвээр, шилжүүлгийн санал дахин үүссэн; `:preview-close` нь жилийн төлөвийг өөрчлөхгүй (ROLLBACK). Бичилтгүй жил (бүх данс 0) → мөн `CLOSED`, `closing_transaction_no = NULL`.
- **AT-PST-074** (BR-PST-62, 14 API-IDEM-12). Нэхэмжлэх `:post` амжилттай (ноорог устсан); ижил key, ижил body-оор давтахад → хадгалсан `200` хариу, `Idempotent-Replayed: true` (`409 api.document_already_posted` биш); A үеийн handler дуудагдаагүй (log). Хоёр зэрэг хүсэлтийн хоёр дахь нь эхнийх 6 s commit хийхгүй байхад → `409 api.idempotency_in_progress`, `Retry-After: 1`.
- **AT-PST-075** (BR-PST-51). Эх гүйлгээний 2026-02 `OPEN` боловч `allow_posting_from = 2026-03-01` → `:reverse` → `gl.posting_date_outside_window`; `correction-proposal` → санал буцна (`gl.correction_use_reversal` биш). Тэр гүйлгээ E-B-тэй ижил бүтэцтэй (7213 НӨАТ-тай, касс) бол санал: `GL_ACCOUNT 7213` `−12,345.00` (gross, `PURCHASE`, `DOMESTIC`/`VAT10`), `BANK_ACCOUNT CASH01` `+12,345.00`, Σ = 0; 1300 ба 1100-ийн мөр саналд орохгүй (дахин үүснэ).
- **AT-PST-076** (BR-PST-30, Z-PST-15). E-E: V2-ийн `document_no = SI-2026-00043`, `document_type = PAYMENT`; `SI` counter +1 (V2 дугаар авахгүй); `posted_cash_voucher.no = KO-2026-00031`, `KO` counter +1.
- **AT-PST-077** (BR-PST-26, BR-PST-04). 2027 оны `GJ` мөр байхгүй + блоклогдсон данстай журнал (2027-01-05) → нэг хариунд `platform.number_series_missing_line` ба `gl.account_blocked` (`422 api.validation_failed`, `errors[]` = 2); counter өөрчлөгдөөгүй.
- **AT-PST-078** (BR-PST-54). 2026 жил бичилттэй, `OPEN`; 2027-ийн бүх сар `CLOSED` → 2027 `:close` → `gl.year_close_previous_year_open`.

### 11.2 Golden scenario (`tests/Golden/Scenarios/gl/`)

| ID | Жишээ | Шалгах гол зүйл |
|---|---|---|
| `GS-GL-001-journal-bank-expense` | E-A | 2 entry, BLE, register 41 |
| `GS-GL-002-journal-vat-cash` | E-B | Gross НӨАТ 1,122.27, VAT entry, касс МХ-2 |
| `GS-GL-003-sales-invoice-buffer` | E-C | Buffer нэгтгэл, header/мөрийн set, posting group snapshot |
| `GS-GL-004-vat-remainder-allocation` | E-D | 3 × 3,333.33 → 333.33 / 333.34 / 333.33 |
| `GS-GL-005-cash-sale-two-vouchers` | E-E | 1 register, 2 гүйлгээ, тулгалт, хяналтын данс = дэд дэвтэр |
| `GS-GL-006-reverse-transaction` | E-F | Эсрэг багана, холбоос, дэд дэвтэр хаагдсан |
| `GS-GL-007-reverse-register-multi-date` | E-G | Огноо тус бүрийн гүйлгээ, register `reversed` |
| `GS-GL-008-year-end-close` | E-H | Орлогын тайлангийн данс 0, 3500 = цэвэр ашиг |
| `GS-GL-009-year-end-close-rerun` | E-I | Зөвхөн зөрүү, `CL-2026-00002`, шинэ ноорог |
| `GS-GL-010-retained-earnings-transfer` | E-J | 3500 → 3400, 2027-01-01-нд 3500 = 0 |
| `GS-GL-011-opening-balances` | E-K | Холимог ваучер, CLE/VLE/BLE, `direct_posting` |
| `GS-GL-012-correction-closed-period` | E-L | Санал Σ = 0, эх үе өөрчлөгдөөгүй |
| `GS-GL-013-preview-equals-post` | E-D + E-C | Preview-ийн entry = Post-ийн entry (дугаараас бусад) |
| `GS-GL-014-dimension-header-line` | E-C | Авлага header-ийн set 7, орлого мөрийн set 9/7 |
| `GS-GL-015-rollback-no-gap` | AT-PST-026 | Бүтэлгүй posting-ийн дараа `GJ`, `GL_*` counter завсаргүй |
| `GS-GL-016-unbalanced-rejected` | AT-PST-022, AT-PST-004 | Тэнцээгүй ваучер 422, дугаар зарцуулаагүй ([16](./16-test-strategy.md) §12.2) |
| `GS-GL-017-all-errors-at-once` | AT-PST-004, AT-PST-077 | Бүх алдаа нэг хариунд (цувралын алдаа орно) |
| `GS-GL-018-document-reversal-blocked` | AT-PST-045 | `SALES`/`PURCHASES` → `gl.reversal_use_credit_memo` |
| `GS-GL-019-company-posting-window` | AT-PST-018, AT-PST-075 | Цонхноос гадуур posting, буцаалт хориглогдох; залруулгын санал |
| `GS-GL-020-year-crossing-numbering` | AT-PST-077 | Оны мөр байхгүй → `platform.number_series_missing_line`; 2027-ийн мөр нэмсний дараа `GJ-2027-00001` |
| `GS-CLOSE-006-year-close-noop-status` | AT-PST-073 | Зөрүү 0 дахин хаалт: ваучергүй, жил `CLOSED` ([16](./16-test-strategy.md) §12.2-т GS-CLOSE-006 — [10](./10-periods-closing-reporting.md) §11.2-ын ижил санал; `GS-GL-021` нь starter-ийн өөр scenario, REVIEW-consistency) |

Scenario бүр: (1) seed + урьдчилсан нөхцөл, (2) команд, (3) хүлээгдэх `gl_entry`, `gl_transaction`, `gl_register`, writer-ийн мөр (олонлогоор, `entry_no` тасралтгүй), (4) хяналт: Σ = 0, хяналтын данс = дэд дэвтэр.

### 11.3 Property-based тест (FsCheck)

| Шинж | Генератор | Хүлээгдэх |
|---|---|---|
| P1. Ваучер бүр тэнцэнэ | Санамсаргүй тэнцсэн журнал (1–50 мөр, холимог төрөл, НӨАТ) | Батлагдсан ваучер бүр Σ `amount` = 0; Σ `debit_amount` = Σ `credit_amount` |
| P2. Post + reverse = 0 | P1 + `:reverse` | Данс × dimension set бүрийн Σ = 0; дэд дэвтрийн `remaining_amount` = 0 |
| P3. Preview = Post | P1 | Entry-ийн олонлог (дугаараас бусад) ижил; алдаа бол код ижил |
| P4. Хуваарилалт | Нийт НӨАТ, 1–200 мөрийн жин | Σ хуваарилсан = нийт; мөр бүрийн зөрүү < 1 нэгж (§6.6) |
| P5. Хаалт | Санамсаргүй орлого/зардлын бичилт | Хаалтын дараа Y-ийн орлогын тайлангийн данс бүрийн Σ = 0; 3500-ийн өөрчлөлт = −Σ орлогын тайлангийн net |
| P6. Counter | Санамсаргүй амжилттай/бүтэлгүй posting-ийн дараалал | `entry_no`, `transaction_no`, `register.no`, хуулийн дугаар завсаргүй |

### 11.4 Зэрэг ажиллагаа ба гэмтлийн тест

- **CT-PST-01.** Нэг компанид 50 зэрэг `:post` (10 нь `gl.period_closed`-оор унах) → 40 амжилттай, `GJ` дугаар 40 завсаргүй, `FAILED` лог 10.
- **CT-PST-02.** Posting ба `accounting-periods/{id}:close` зэрэг → нэг нь нөгөөгөө хүлээнэ; хаалтын дараа тэр үеийн огноотой entry шинээр үүсээгүй.
- **CT-PST-03.** COMMIT-ийн яг үед процессыг унтраах (chaos) → DB-д бүтэн эсвэл огт байхгүй; клиент ижил key-ээр давтахад нэг л бичилт.
- **CT-PST-04.** 2 компани × 25 зэрэг posting → компани хооронд хүлээлт байхгүй (`lock_wait` p95 ≤ 100 ms, NFR-016).
- **CT-PST-05.** Ижил register-ийг 2 хэрэглэгч зэрэг буцаах → нэг нь 201, нөгөө нь `409 gl.register_already_reversed` эсвэл `gl.transaction_already_reversed`.

### 11.5 Хязгаарын тохиолдол

- 12-31-ний огноотой энгийн (хаалтын биш) журнал жилийн хаалтын дараа: 12-р сар `CLOSED` тул `gl.period_closed`; 12-р сарыг дахин нээгээд бичвэл дахин хаалтад зөрүү гарна (E-I).
- `amount_rounding_precision = 1` компанид НӨАТ 1,122.27 → 1,122 (§6.4).
- Нэг журналд 2 ноорог дугаар, нэг огноо, хоёулаа тэнцсэн → 2 тусдаа хуулийн дугаар.
- Нэг ноорог дугаартай мөрүүд өөр огноотой (BR-PST-21) → огноо бүр тусдаа ваучер, тус бүр тэнцэх ёстой.
- Ваучер дотор `BANK_ACCOUNT CASH01` → касс сөрөг болох → `bank.cash_negative_balance` (касс сөрөг болох нь A үед харагдахгүй, B үед writer илрүүлнэ).
- Буцаалт: эх гүйлгээний данс одоо блоклогдсон → `gl.account_blocked`.
- Register буцаалт: гүйлгээнүүдийн нэг нь аль хэдийн буцаагдсан → `gl.transaction_already_reversed` (бүх register-ийг буцаахгүй; үлдсэнийг гүйлгээ тус бүрээр).
- Жилийн хаалт: орлогын тайлангийн бүх данс 0 (бизнес бичилтгүй жил) → no-op, ваучер, дугаар үүсэхгүй, жил `CLOSED`.
- Жилийн хаалт: Y+1 санхүүгийн жил байхгүй → хаалт амжилттай, `W-04`.
- `SAME_CODE`-ийг утгагүйгээр хадгалах боломжгүй (030 CHECK); BC-ийн "SAME_CODE + хоосон" (dimension байх ёсгүй)-г `NO_CODE`-оор тохируулна → мөрөнд утгатай бол `gl.dimension_value_not_allowed`.
- Буцаах гүйлгээний dimension утга одоо блоклогдсон → буцаалт амжилттай (`SystemGenerated`, BR-PST-33); шинэ журналд тэр утга → `gl.dimension_value_blocked`.
- Нэхэмжлэх доторх эерэг ба сөрөг мөр ижил buffer түлхүүртэй → нэг G/L мөр, нэг VAT entry (цэвэр дүн); цэвэр 0 бол мөр үүсэхгүй (§5.7.1).
- Эхний үлдэгдэлд 2300-ийн үлдэгдлийг `GL_ACCOUNT 2300`-оор оруулах → `gl.direct_posting_not_allowed`; 2310-оор оруулна (§5.4.4).
- Журнал batch/template-д цуврал байхгүй → `gl.journal_series_missing`.
- НӨАТ-гүй run → `VAT_ENTRY` counter дуудагдахгүй, register-ийн VAT муж NULL (W9).
- Preview дээр шинэ dimension set үүсгээд rollback → дараагийн Post ижил set-ийг дахин үүсгэнэ (id өөр байж болно, BR-PST-35).
- Эхний үлдэгдэл 20,000-аас их entry → хэд хэдэн run (§5.4.4), хэсэг бүр тэнцсэн.

---

## 12. Schema change requests

> **Төлөв (2026-10-08):** эдгээр хүсэлтийн шийдвэр, эцсийн нэрийг [db/CHANGE_REQUESTS.md](db/CHANGE_REQUESTS.md)-ээс үзнэ. Хүссэнээс ялгаатай: CR-PST-01..05 хэрэгжсэн. CR-PST-06: шинэ SQLSTATE-ийн оронд `ERP01` хэвээр, DETAIL-д `gl.period_not_found`, `gl.period_closed`, `gl.period_locked`, `gl.posting_date_outside_window`.

| # | Хүснэгтийн өөрчлөлт | Шалтгаан | Ач холбогдол |
|---|---|---|---|
| CR-PST-01 | `gl.gl_transaction.corrects_transaction_no bigint NULL` (FK `(company_id, corrects_transaction_no)` → `gl.gl_transaction`, индекс `ix_gl_transaction__corrects`) ба `gl.journal_line.corrects_transaction_no bigint NULL`; engine журналын мөрөөс ваучерт дамжуулна | FR-GL-014: хаалттай үеийн залруулгыг эх гүйлгээтэй холбох; одоо `comment` JSON-оор түр холбоно (§5.11), тайлан/аудитын хайлт индексгүй | Дунд |
| CR-PST-02 | `gl.gl_register.hash_version smallint`, `prev_hash bytea`, `hash bytea` (= [13](./13-security-audit-tenancy.md) CR-15) | FR-GL-028, BR-PST-44: register-ийн hash chain; engine-ийн hook бэлэн (§5.9) | Дунд (13-ийн CR-15-аас хамаарна) |
| CR-PST-03 | `db/seed`-ийн `fn_mn_number_series_def`: `GJ`, `BR`, `BP`, `OB`, `CL` цувралд `date_order = false` (SI, PI, KO, KZ г.м. баримтын цувралд `true` хэвээр) | Журнал ба хаалтын ваучерыг хойш огноогоор (сарын хаалтын өмнө өмнөх сард) бичихэд `ERN02` (`platform.number_series_date_order`) гарна; ⚠ D-C7 (OQ-PST-03) | Дунд |
| CR-PST-04 | `platform.number_series.yearly_prefix_pattern text NULL` (жишээ `'SI-{YYYY}-'`), `INumberAllocator` нь шинэ оны мөр (`number_series_line`) байхгүй бол үүсгэнэ | FR-PLT-008 AC3 (оны эхэнд дугаар автоматаар 00001-ээс); одоо мөр байхгүй бол `ERN01` (Z-PST-12) | Бага (эзэмшигч: платформ) |
| CR-PST-05 | `gl.journal_line.system_origin text NULL CHECK (system_origin ~ '^[A-Z_]+:[0-9A-Za-z_-]+$')` + индекс `(company_id, journal_batch_id, system_origin) WHERE system_origin IS NOT NULL` | BR-PST-58: хуримтлагдсан ашгийн шилжүүлгийн саналын мөрийг одоо чөлөөт `comment` текстээр (`{"kind":"RE_TRANSFER","year":Y}`) танина — хэрэглэгч comment-ийг засвал санал давхардана. Багана нь `RE_TRANSFER:2026` хэлбэрээр системийн гарлыг найдвартай тэмдэглэнэ (CR-PST-01-ийн залруулгын холбоостой хамт) | Бага |
| CR-PST-06 | `910_ledger_guards.sql` `gl.fn_assert_posting_date_allowed`: тохиолдол бүрд тусдаа SQLSTATE (`ERP01` үе алга, `ERP03` үе/жил `OPEN` биш, `ERP04` `LOCKED`, `ERP05` компанийн цонхноос гадуур) эсвэл `ERP01`-ийн `DETAIL`-д машинаар уншигдах шалтгаан | §8.8: одоо бүх тохиолдол `ERP01` тул апп-ийн кодыг (`gl.period_closed` / `gl.period_locked` / `gl.posting_date_outside_window`) сонгохын тулд mapper дахин уншилт хийдэг | Бага |

Тэмдэглэл: posting engine-д шинэ хүснэгт шаардлагагүй. `gl.company_counter`, `gl_entry_reversal`, проекц хүснэгт (Z-PST-02, -03, -08) нь **санал биш** — схемийн одоогийн загвар хангалттай.

---

## 13. Нээлттэй асуулт

| # | Асуулт | Холбоос | Энэ баримтын түр шийдэл | Хэн шийдэх |
|---|---|---|---|---|
| OQ-PST-01 | Storno-гүй буцаалт (D-C3) дебит, кредитийн эргэлтийг хоёуланг нь өсгөдөг. Аудитор ба Order 47-ийн шалгалт (G1) үүнийг хүлээн зөвшөөрөх үү, эсвэл "Эргэлтийн тайлан"-д буцаалтын хос мөрийг хасах шүүлт хэрэгтэй юу? | ⚠ D-C3; BR-PST-47 | Эсрэг багана; тайланд `reversed` шүүлт (тайлангийн spec) | Нягтлан зөвлөх, аудитор |
| OQ-PST-02 | Буцаалтын ваучер эх `document_no`-г хадгалах (BC) уу, эсвэл `GJ`-ээс шинэ дугаар авах уу? Шинэ дугаар нь эх огноотой тул `date_order`-д (ERN02) саад болно. | ⚠ D-C7; BR-PST-30 | Эх дугаар (`source_code = REVERSAL`, `reverses_transaction_no`-оор ялгана) | Нягтлан зөвлөх |
| OQ-PST-03 | Журналын цувралд (`GJ`, `BR`, `BP`, `OB`, `CL`) `date_order` шаардлагатай юу? Хуулийн шаардлага нь зөвхөн завсаргүй байдал уу? | ⚠ D-C7; CR-PST-03 | CR-PST-03 батлагдах хүртэл ERN02 гарвал хэрэглэгч огноогоор эрэмбэлж батална | Нягтлан зөвлөх, хуульч |
| OQ-PST-04 | Хуримтлагдсан ашиг руу шилжүүлэх ваучерын огноо: (Y+1)-01-01 уу, хувьцаа эзэмшигчдийн хурлын шийдвэрийн огноо уу? Цуврал `GJ` үү, `CL` үү? | ⚠ D-D4; BR-PST-58 | (Y+1)-01-01, `GJ`, журналын ноорог (хэрэглэгч засна) | Нягтлан зөвлөх |
| OQ-PST-05 | R1-д журналаар НӨАТ (ДДТД-тэй орцын НӨАТ) оруулахыг зөвшөөрөх үү? Seed-ийн тайлбар "НӨАТ зөвхөн баримтаас" гэдэг; хасагдах эсэх (D-E4) журналын мөрөнд ДДТД-гүй бол хэрхэх вэ? | ⚠ D-E4; BR-PST-38 | Engine дэмжинэ (gross арга); Tax ДДТД-гүй орцын НӨАТ-ыг хасагдахгүй гэж ангилна; UI-д бүлгийн багана нуугдсан | Татварын зөвлөх |
| OQ-PST-06 | `CLSINCOME`, `VATSTMT` гүйлгээг нийтийн `:reverse`-ээр (Owner, step-up) буцаах боломж хэрэгтэй юу? | D-D5; §3.7 | Үгүй: жилийн хаалт дахин ажиллуулалтаар, НӨАТ-ын хаалт Tax модулийн өөрийн undo-оор | Бүтээгдэхүүн, нягтлан зөвлөх |
| OQ-PST-07 | Бэлэн мөнгөний гүйлгээг буцаахад (CASHVOUCHER, PAYMENTJNL-ийн касс) шинэ МХ-1/МХ-2 үүсэхгүй (09 BR-BNK-29: эх баримтад "БУЦААГДСАН" тэмдэг). Кассын баримтын бүртгэлд (МХ дугаарын дараалал) буцаалтын тусдаа баримт шаардлагатай юу? | ⚠ D-C7; §5.10 CashBank | Шинэ МХ үүсгэхгүй | Нягтлан зөвлөх |

---

## Хяналтын тэмдэглэл (Review log)

**Огноо:** 2026-10-08. **Хамрах хүрээ:** нягтлан бодох зөв байдал (§7-ийн жишээ бүрийг дахин тооцсон), `db/schema/*.sql` ба seed-тэй нэрийн нийцэл, DECISIONS, 02/13/14-ийн алдааны код ба idempotency, 06/07/08/09/11/16-гийн 05-д хандсан хүсэлт, research-ийн MUST дүрэм.

**Шалгаад зөв гарсан:** E-A … E-L-ийн бүх ваучер Дт = Кт; НӨАТ (1,122.27 / 11,222.73; 70,000 / 30,000; 333.33 / 333.34 / 333.33), жилийн хаалт (Σ net = −2,115,000; хаалт 12,050,000 = 12,050,000; дахин хаалт 100,000; B = −2,015,000), эхний үлдэгдэл (7,100,000 = 7,100,000), counter/register-ийн муж; `gl_entry` INSERT-ийн 37 багана ба `unnest` массивын дараалал; §3-ийн бүх хүснэгт/багана/функц/trigger-ийн нэр 010/020/030/040/060/090/140/910-д байгаа; FR/NFR ба research-ийн rule id бүгд оршин байгаа.

| # | Олдсон асуудал | Засвар | Хэсэг |
|---|---|---|---|
| 1 | Зөрүү 0 үед жилийн хаалт `null` буцааж, `FiscalYearCloseWriter` ажиллахгүй → дахин нээсэн жил (13 SEC-POST-04-өөр `OPEN`) хэзээ ч `CLOSED` болохгүй; бичилтгүй жилийн хаалт ч мөн. 11.5-ын "жил CLOSED" хүлээлттэй зөрчилдөж байв | No-op хаалт: ваучергүйгээр жилийн төлөв ба шилжүүлгийн саналыг шинэчилнэ; preview-д rollback; outbox түлхүүр | BR-PST-56, -57, §5.2 цөм, §5.13, §9.1, AT-PST-073 |
| 2 | Жилийн хаалтын нөхцөл `status <> 'CLOSED'` нь `LOCKED` сарыг "нээлттэй" гэж тооцно; 12-р сар `LOCKED`, өмнөх жил нээлттэй байх (R-PERIODS-REPORTING-05 MUST) тохиолдол тодорхойгүй | `status = 'OPEN'`; 12-р сар LOCKED → `gl.period_locked`; шинэ код `gl.year_close_previous_year_open` | BR-PST-54, §5.13, §8.5, AT-PST-054, -078 |
| 3 | Idempotency нь 14 (эзэмшигч)-тэй зөрчилтэй: Шат 0 байхгүй (амжилттай `:post`-ийн давталт 409 авна), hash-ийн томьёо өөр, idempotency мөрийн `55P03` → 503 | 14 API-IDEM-03/-07/-12-ийг дагасан | Z-PST-14, BR-PST-62, -63, §5.2, §5.14, §5.15, §8.1, §8.8, AT-PST-074 |
| 4 | НӨАТ-ын хуваарилалт D-E3 ба 08 BR-TAX-20-ийн running remainder биш, хуримтлагдсан бөөрөнхийлөлтөөр бичигдсэн | Running remainder (сүүлийн мөр = үлдэгдэл); E-D-ийг хүснэгтээр дахин тооцсон (үр дүн ижил) | Z-PST-16, §6.6 |
| 5 | Бэлэн борлуулалтын 2 дахь ваучерын дугаар 06/09/BC-тэй зөрчилтэй (`KO-…` vs `SI-…`); өмнөх ваучерын дугаарыг авах механизм гэрээнд байгаагүй | `VoucherNumbering.SameAsVoucher`; E-E: V2 `SI-2026-00043` (`PAYMENT`), МХ-1 `KO-2026-00031` тусдаа | Z-PST-15, §5.1, §5.5, BR-PST-30, §3.7, §5.8, E-E, AT-PST-076 |
| 6 | Хасагдахгүй НӨАТ-тай мөрийн VAT G/L дүн тодорхойгүй (суурьт ND нэмээд VAT мөрөнд бүтэн НӨАТ бичвэл тэнцэхгүй); FULL_VAT-ын суурь дүн 1-р дүрэмтэй зөрчилтэй; борлуулалтын RC | `D = VAT − ND`; RC: 1300 `+D`, 2305 `−VAT`; FULL_VAT: суурь = `row.VatAmount` 1300 дээр; мөрийн тэнцлийн assert | BR-PST-36, §5.7.1, §5.7.2 |
| 7 | Залруулгын санал: (а) эх үе `OPEN` боловч цонхноос гадуур бол буцаалт ч, санал ч боломжгүй; (б) gross томьёо `amount + vat_amount` нь ND, RC, FULL_VAT-д буруу (Σ ≠ 0) | (а) `CheckPostingDateAsync`-оор шийднэ; (б) VAT entry-ийн тооцооны төрлөөр томьёо; FULL_VAT суурийг оруулна | BR-PST-51, §5.11, AT-PST-075 |
| 8 | Жишээнд хяналтын данс 1110-ыг журналын `GL_ACCOUNT` мэт бичсэн (E-G, E-I) — BR-PST-15-аар унах ёстой | `BANK_ACCOUNT BANK01 (G/L 1110)` болгож тодруулсан | E-G, E-I |
| 9 | Ижил dimension хослолд хоёр set id (5 ба 7) — `UNIQUE (company_id, key_hash)`-тэй зөрчилтэй | Set 5-ыг хасаж E-A-д 7 | §7 мастер, E-A |
| 10 | Эхний үлдэгдэлд дэд дэвтэргүй хяналтын данс (1300/2300/2305/2320/8290)-ын үлдэгдлийг оруулах зам байгаагүй; 1360/2210/2365-ийн зам тодорхойгүй | 2310/2325 тооцооны данс; EMPLOYEE/CUSTOMS бүлгийн зам | §5.4.4 |
| 11 | Журнал: огноо/дугааргүй мөр ваучер бүлэглэхэд `null`-оор унах; хоосон мөр устахгүй (AT-PST-010-тай зөрчилтэй); BC-ийн хоосон мөрийн томьёоноос зөрүүтэй; цувралгүй template | Бүлэглэлтээс хасах; бүх мөрийг устгах; BC `EmptyLine`; `gl.journal_series_missing` | BR-PST-10, §5.4.1, §8.2 |
| 12 | ERN01..03 нь B үеийн дугаар олголтын үед л илэрч BR-PST-04 ("бүх алдааг нэг дор")-ийг зөрчинө | `CheckLockedAsync`-ийн query (5)-аар урьдчилж шалгана | BR-PST-26, §5.3, §8.1, AT-PST-077 |
| 13 | `fn_next_entry_no(count < 1)` → `22023`; writer 0 мөрөнд дуудах, нэг ledger-ийг хоёр удаа нөөцлөх (register-ийн муж тасрах) эрсдэл | §3.3 тэмдэглэл, W9, §8.8 | §3.3, §5.5, §5.8 |
| 14 | `ReversalMarker`-ийг writer-ийн бүртгэлээр хайвал BR-PST-41-ээр 500 болно; `ReverseAsync`-ийг хэдэн удаа дуудах нь тодорхойгүй | Тусгай `Ledger = "REVERSAL"`, бүх `IReversibleLedger`-ийг `Order`-оор нэг plan-аар нэг удаа | §5.10 |
| 15 | `SystemGenerated` мөрийг dimension-ий блокийн шалгалтаас код чөлөөлдөг боловч BR-PST-33 чөлөөлөөгүй (буцаалт блоклогдсон утгаар унах); `SAME_CODE` + хоосон утга схемийн CHECK-ээр боломжгүй | BR-PST-33 тодруулсан; код ба хязгаарын тохиолдлыг засав | BR-PST-33, §5.6, §11.5 |
| 16 | `ERP02`-ийг `gl.period_locked`-д буулгасан нь буруу (posting-ийн LOCKED нь `ERP01`); `ERP01` олон утгатай | Mapper-ийн дүрэм; CR-PST-06 | §8.8, §12 |
| 17 | Preview-ийн no-op замд `MarkRollbackOnly` дуудагдахгүй | Засав | §5.2 |
| 18 | Posting log-ийн FAILED хүрээ (A үе, COMMIT-ийн deferred алдаа) тодорхойгүй | `PostingLogFilter`-ийн хүрээ | BR-PST-67, §5.17 |
| 19 | Шилжүүлгийн ноорогийн batch-ийг дугаар олгосны дараа түгжих (BR-PST-61-ийн дараалал зөрчих), маркерыг JSON-оор хайх, batch байхгүй тохиолдол, GJ `date_order`-ийн `ERN02` эрсдэл | `LockSourceAsync`-д түгжинэ; тэмдэгт мөрийн тэнцүү; `W-06`; анхааруулга ба CR-PST-05 | BR-PST-58, -61, §5.13, §8.7 |
| 20 | Posting buffer-т тэмдгийн дүрэм (16 Q10), хасагдахгүй НӨАТ-ын шалтгаан ба НХАТ-ын код (08 Z-TAX-15) байхгүй | Тэмдэг түлхүүрт орохгүй (BC); `NonDeductibleReason`, `CityTaxCodeId` нэмсэн | §5.7.1 |
| 21 | FX томьёо 09 BR-FX-21/-26-тэй зөрчилтэй | 09-ийг дагасан | Z-PST-17, §6.10 |
| 22 | 11 X-04/X-05: `FA_DEPRECIATION_RUN`, `ItemApplicationEntry`, `PHYSINVJNL` | Нэмсэн | §3.3, §5.1, §3.7 |
| 23 | `Source` дүрэм E-A-тай зөрчилтэй (банкны мөрийг partner гэж тооцоогүй); hash contributor-ийн нэр 2 өөр; `GlPostingLine.Key`-ийн жишээ §5.4.2-тэй зөрүүтэй; R-VAT-26 буруу ишлэл | Тааруулсан | §5.4.2, §9.4, §5.1, §5.7.2 |
| 24 | Тестүүд: AT-PST-005 (14 API-JSON-06a-тай зөрчил), AT-PST-043 (`app_user` → `42501`), AT-PST-054 (үеийн нэр); 16-д байгаа GS-GL-016…020 05-д алга | Засаж, AT-PST-073…078, GS-GL-016…020 ба GS-CLOSE-006 (анх GS-GL-021 гэж дугаарласан, REVIEW-consistency) нэмсэн | §11 |

**Schema change requests (шинэ):** CR-PST-05 (`gl.journal_line.system_origin`), CR-PST-06 (`fn_assert_posting_date_allowed`-ийн тусдаа SQLSTATE). CR-PST-01…04 хэвээр.

**Бусад баримтад дамжуулах:** 07 BR-PUR-72 (бэлэн худалдан авалтын 2 дахь ваучерын дугаар, Z-PST-15); 14 §9.5 (шинэ код, `gl.fiscal_year_already_closed`-ийг `:close`-д хэрэглэхгүй); 16 (GS-CLOSE-006, AT-PST-073…078); 08 Z-TAX-09 ба Z-TAX-15 хаагдсан.

**Нээлттэй хэвээр:** OQ-PST-01…06 (⚠ D-C3, D-C7, D-D4, D-E4), шинэ OQ-PST-07 (кассын буцаалтын МХ баримт).
