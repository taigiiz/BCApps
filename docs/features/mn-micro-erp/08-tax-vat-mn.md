# 08. Татвар: НӨАТ (Монгол), НХАТ, хуулийн параметр, ТТ-03а ба НӨАТ-ын хаалт, ААНОАТ-ын туслах тайлан — хөгжүүлэлтэд бэлэн тодорхойлолт

> **Төлөв:** Хөгжүүлэлтэд бэлэн, v1.1 (adversarial review, 2026-10-08 — төгсгөлийн "Хяналтын тэмдэглэл"-ийг үзнэ үү). **Огноо:** 2026-10-07.
> **Нэг эх сурвалж:** [DECISIONS.md](./DECISIONS.md) (ялангуяа §E, §H, §K). Хүснэгт, багана, функцийн нэрийн эх сурвалж нь [db/schema/*.sql](./db/schema/) ба [db/seed/](./db/seed/) (D-K1). Бусад баримт эдгээртэй зөрвөл DECISIONS ба схем давамгайлна (§0.3).
> **Холбоос:** [01-requirements.md](./01-requirements.md) §2.3 (FR-TAX); [02-architecture.md](./02-architecture.md) §4.2.5, §4.5, §6, §9.6; [03-domain-model.md](./03-domain-model.md) §3.3, §5; [05-posting-engine.md](./05-posting-engine.md) §5.7, §6.4, §6.6; [06-sales-receivables.md](./06-sales-receivables.md) §4.3, §5.4, §6.3–§6.5; [11-fixed-assets-inventory.md](./11-fixed-assets-inventory.md); [12-ebarimt-integration.md](./12-ebarimt-integration.md) §5.6, §6, §16; [13-security-audit-tenancy.md](./13-security-audit-tenancy.md) §8, §18; [14-api.md](./14-api.md) §15.5; [15-ui-ux.md](./15-ui-ux.md) §16.9; [99-glossary.md](./99-glossary.md) §7; [db/seed/README.md](./db/seed/README.md) §6, §8.
> **Судалгаа:** [bc-vat.md](./research/bc-vat.md) (R-VAT-01…32), [mn-tax.md](./research/mn-tax.md) (§2–§7, R1…R19), [legal-parameters.md](./research/legal-parameters.md) ((a)…(k), параметрийн хүснэгт), [mn-accounting.md](./research/mn-accounting.md) (§7 хаалтын календарь, REQ-ACC-13, -19, -20, -22).
> **Уншигч:** backend хөгжүүлэгч (Tax, Sales, Purchases, GeneralLedger, Reporting, EBarimt модуль), QA, нягтлан ба татварын зөвлөх.
> **Энэ баримт эзэмшинэ:** Tax модулийн гэрээ (`Erp.Tax.Contracts`): `ITaxParameterProvider`, `IVatSetupResolver`, `ITaxCalculator`, `IVatPostingComposer`, `IJournalVatHandler`-ийн хэрэгжүүлэлт, VAT ledger writer; НӨАТ-ын тайлан (ТТ-03а), хаалт, илгээх, дахин нээх; орцын НӨАТ-ын баталгаажуулалт; босгын хяналт; НХАТ (R2); хялбаршуулсан НӨАТ (R2); ААНОАТ-ын туслах тайлан (R2); [14-api.md](./14-api.md) §9.5-д "08" гэж заасан `tax.*` алдааны кодын эцсийн жагсаалт.

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

Tax модуль нь **ямар** татвар, **ямар** хувиар, **ямар** дансанд, **хэзээ** хасагдах вэ гэдгийг тогтооно. Бичилтийг **хэрхэн** бичихийг posting engine ([05](./05-posting-engine.md)) тогтооно.

| Сэдэв | Энэ баримтад | Эзэмшигч spec |
|---|---|---|
| Хуулийн параметрийн хайлт (`GetParameter(code, date)`), кэш, `verified`/`unverified` дүрэм | Тийм | — |
| НӨАТ-ын бүлэг ба VAT Posting Setup-ийн матриц, тооцооны төрөл, хувь, данс, eBarimt `taxType` | Тийм | Seed-ийн утга: [db/seed/README.md](./db/seed/README.md) §6 |
| Баримтын НӨАТ тооцоолол (`ITaxCalculator.ComputeDocument`): бүлэглэл, бөөрөнхийлөлт, хуваарилалт, хасагдахгүй НӨАТ, урвуу тооцоо, гаалийн НӨАТ, НХАТ | Тийм | Дуудагч: [06](./06-sales-receivables.md) §5.4, худалдан авалтын spec |
| Posting buffer-ийн мөрийг G/L ба VAT мөр болгох (`IVatPostingComposer`), VAT ledger writer | Тийм (агуулга) | Гэрээ ба engine-ийн алхам: [05](./05-posting-engine.md) §5.7, §5.8 |
| Журналын мөрийн НӨАТ (`IJournalVatHandler`) | Tax-ийн дүрэм | Gross арга ба мөр задлах: [05](./05-posting-engine.md) §5.4.2, §6.4 |
| VAT entry, НӨАТ-ын огноо, НӨАТ-ын үе ба түүний төлөвийн машин | Тийм | DB guard: [13](./13-security-audit-tenancy.md) §8 (P4, P5) |
| Орцын НӨАТ-ын баталгаажуулалт ба татгалзал (D-E4) | Тийм (VAT entry тал) | `ebarimt.purchase_receipt` ба импорт: [12](./12-ebarimt-integration.md) §16 |
| ТТ-03а-гийн тооцоо (VAT Statement), ТТ-03а-5/6 бүртгэлийн агуулга | Тийм | XLSX экспорт ба сувгийн интерфейс: Reporting (02 §9.6) |
| НӨАТ-ын хаалт (settlement), илгээх, дахин нээх | Тийм | — |
| eBarimt-ийн баримттай НӨАТ-ын тулгалт (FR-TAX-016) | Тулгалтын дүрэм | eBarimt-ийн төлөв: [12](./12-ebarimt-integration.md) §9 |
| НӨАТ-ын бүртгэлийн босгын хяналт (FR-TAX-012), 2027-07-01-ний өөрчлөлт | Тийм | Самбарын cue: [15](./15-ui-ux.md) §3 |
| НӨАТ төлөгч бус горим (D-E5) | Tax-ийн дүрэм | Борлуулалтын тал: [06](./06-sales-receivables.md) BR-SAL-28; eBarimt: [12](./12-ebarimt-integration.md) SET-09 |
| НХАТ (R2) | Тийм | eBarimt-ийн `totalCityTax`: [12](./12-ebarimt-integration.md) AMT-02 |
| Хялбаршуулсан НӨАТ-ын горим (R2, параметрээр) | Тийм | — |
| ААНОАТ-ын улирлын ба жилийн туслах тайлан (R2) | Тийм (тооцоолол) | Татварын элэгдлийн дэвтэр: [11](./11-fixed-assets-inventory.md) |
| Татварын календарь (FR-TAX-018) | Тийм | Самбар: [15](./15-ui-ux.md) |
| Суутган татвар (WHT), ХХОАТ, НДШ | Үгүй (хүрээнээс гадуур, 01 §7) | — |
| REST-ийн дэлгэрэнгүй (body, schema) | Зөвхөн нэр | [14](./14-api.md) |

### 0.2 Тэмдэглэгээ

| Тэмдэглэгээ | Утга |
|---|---|
| `BR-TAX-NN` | Энэ баримтын бизнесийн дүрэм (§4) |
| `AT-TAX-NNN` | Хүлээн авах тест (§11.1) |
| `GS-VAT-NNN-<slug>` | Golden scenario ([18-dev-setup.md](./18-dev-setup.md) §13.3-ын формат, `tests/Golden/Scenarios/vat/`) |
| `E-TAX-NN` | §7-ийн posting-ийн жишээ |
| `W-TAX-NN` | Анхааруулга (батлахыг зогсоохгүй, §8.2) |
| `CR-TAX-NN` | Схемийн өөрчлөлтийн хүсэлт (§12) |
| `Z-TAX-NN` | Баримтуудын зөрүүг шийдсэн мөр (§0.3) |
| `OQ-TAX-NN` | Нээлттэй асуулт (§13) |
| `R-VAT-12` г.м. | [bc-vat.md](./research/bc-vat.md)-ийн BC дүрэм ([01-requirements.md](./01-requirements.md) §1.4) |
| `mn-tax R5` | [mn-tax.md](./research/mn-tax.md) §10-ийн шаардлага |
| `param:vat.standard_rate` | [legal-parameters.md](./research/legal-parameters.md)-ийн `param_code` (`tax.tax_parameter.param_code`) |
| Дт / Кт | Дебит (`amount > 0`) / кредит (`amount < 0`) (D-C3) |
| `P` | Компанийн дүнгийн нарийвчлал `platform.company_setup.amount_rounding_precision` (анхдагч 0.01, D-C2) |
| `R(x)` | `x`-ийг `P`-д Nearest аргаар (0.5-ыг тэгээс холдуулж) бөөрөнхийлөх (ADR-0006) |
| `RV(x)` | `x`-ийг `P`-д `company_setup.vat_rounding_type`-ийн чиглэлээр (абсолют утгаар) бөөрөнхийлөх (R-VAT-12) |
| A / B / C үе | Түгжээгүй угсралт / нэг DB transaction / commit-ийн дараах үйлдэл ([05](./05-posting-engine.md) §0.2) |

### 0.3 Баримтуудын зөрүүг шийдсэн байдал

Энэ баримтыг бичихэд илэрсэн зөрүүг D-K1-ийн дагуу (схем ба seed = нэрийн эх сурвалж) шийдсэн. Холбогдох баримтыг эзэмшигч нь засна.

| # | Зөрүү | Энэ баримтын шийдвэр | Үндэслэл |
|---|---|---|---|
| Z-TAX-01 | 02 §4.2.5 ба ADR-0021-д `tax_code`, `ref_legal_parameter`, `company_tax_profile`, `vat_settlement`, `vat_period`, `threshold_snapshot` хүснэгт | Схемийн нэр: `tax.vat_posting_setup` (татварын код = VAT Bus. × VAT Prod. мөр), `tax.tax_parameter`, `tax.vat_return_period` (+ `settlement_transaction_no`). Компанийн огноотой татварын профайл схемд алга → CR-TAX-04. Босгын snapshot хүснэгт үүсгэхгүй: тооцоолж, outbox-ийн idempotency түлхүүрээр нэг удаа мэдэгдэнэ (§5.14) | D-K1 |
| Z-TAX-02 | 02 §4.2.5 `ILegalParameterProvider.GetAsync(code, asOf) → (value, versionId)` | `ITaxParameterProvider.GetParameter(code, date, use)` → `TaxParameterValue` (утга + `Id` + `Status`). Утга нь ижил | Даалгаврын нэр; D-E7 |
| Z-TAX-03 | ADR-0021-ийн `confidence IN ('CONFIRMED','UNVERIFIED')` | Схем: `status IN ('verified','unverified','superseded')` ба тусдаа `confidence IN ('high','medium','low')`. Бичилтийн дүрэм `status`-аас хамаарна (BR-TAX-12) | D-K1 |
| Z-TAX-04 | 02 §6.9 "ТТ-03а илгээхэд нягтлан бодох үе HARD_LOCKED"; 03 §6.2 `CLOSED → LOCKED : НӨАТ илгээсэн`; 15 OQ-UI-19 | НӨАТ-ын үеийг `SUBMITTED` болгох нь нягтлан бодох үеийг **автоматаар түгжихгүй**. Хариуны `effects[]`-д түгжих **санал** (13 SEC-POST-08). VAT entry-г `SUBMITTED` үе өөрөө хамгаална (`ERV01`) | D-D3; элэгдэл, хуримтлал зэрэг НӨАТ-гүй залруулгыг хаахгүйн тулд |
| Z-TAX-05 | Эрхийн объектын нэр: 14 §15.5 `tax.vat_period.close`, `tax.vat_period.submit`; 12 `tax.vat.confirm_input` ба seed/13 `tax.vat.settle`, `tax.vat_return.submit`, `tax.vat_entry.confirm_deductible` | Seed-ийн нэр (`mn_00_catalogs.sql`) канон. Шинэ объект CR-TAX-09-өөр. 15 OQ-UI-23-ын татварын хэсгийг хаана | D-K1 |
| Z-TAX-06 | FR-TAX-007-д `settlement_id` | Схем: `closed_by_entry_no` (хаалтын SETTLEMENT entry) ба `vat_return_period_id` (тайлангийн үеийн оноолт) | D-K1 |
| Z-TAX-07 | FR-TAX-008 AC2, FR-TAX-015-д НӨАТ-ын үеийн "Locked" | Схемийн `SUBMITTED` (эцсийн). `CLOSED` нь хаалт хийгдсэн, буцаан нээх боломжтой | D-K1; 910 `trg_vat_return_period_status` |
| Z-TAX-08 | `040_tax.sql`-ийн COMMENT-д VAT Bus. код `DOMESTIC, FOREIGN, NONVAT_PARTY`; FR-TAX-001-д `FOREIGN` | Seed-ийн код: `DOMESTIC`, `EXPORT`, `IMPORT`, `NONREG` (`mn_20_tax.sql`) | D-K1 |
| Z-TAX-09 | 05 §6.6-д хуваарилалтыг хуримтлагдсан бөөрөнхийлөлтөөр (`C_k = R(T × Σa/W)`) бичсэн; D-E3 ба 06 §5.4-д running remainder (BC `DivideAmount`) | **Running remainder** канон (BR-TAX-20). Хоёр томьёо ихэнхдээ ижил үр дүн өгдөг ч `rem` сөрөг дундаж утга (−0.5P) дээр зөрнө. `MoneyMath.Allocate` нь §6.2-ын алгоритмыг хэрэгжүүлнэ; 05 §6.6-г засах санал | D-E3; R-VAT-08 |
| Z-TAX-10 | BC R-VAT-26: VAT Entry Totaling мөрийн хоосон бүлэг = зөвхөн хоосон | Seed-ийн гэрээ: NULL бүлэг = **бүх бүлэг**, `vat_category` нь ангиллаар шүүнэ ([db/seed/README.md](./db/seed/README.md) §12 #11). `040_tax.sql`-ийн COMMENT-ийг шинэчлэх (CR-TAX-12) | FR-TAX-013 |
| Z-TAX-11 | 02 §9.6-д `reporting.filing_submission` | Схемд алга. НӨАТ-ын илгээлтийг `tax.vat_return_period` (`submitted_at`, `submitted_by`, `submission_reference`)-д бүртгэнэ | D-K1 |
| Z-TAX-12 | bc-vat §7 #9: "Released/Submitted төлөвийг хасаж зөвхөн `locked`" | Схем: `OPEN` / `CLOSED` / `SUBMITTED` | D-K1 |
| Z-TAX-13 | BC-ийн тайлан ба хаалт VAT date-ийн мужаар (R-VAT-26, R-VAT-28) | Хаалтын **дараа** ТТ-03а нь `vat_return_period_id = P`-ээр (оноолтоор), хаалтаас **өмнө** "энэ хаалтад орох" нээлттэй entry-ээр тооцогдоно (BR-TAX-66). Ингэснээр хоцорч баталгаажсан орцын НӨАТ (12 PUR-05) дараагийн үед орж, хаагдсан үеийн тайлан өөрчлөгдөхгүй | D-E4, D-E9 |
| Z-TAX-14 | 06 §5.4-ийн `ITaxCalculator.ComputeDocument(lines, piv, P, mode)` | Бүрэн гэрээ §5.1 (`TaxDocument` → `TaxResult`). 06-ийн дуудлага нь түүний дэд хэсэг бөгөөд үр дүн ижил | Даалгавар |
| Z-TAX-15 | 05 §5.7.1 `PostingBufferKey`-д хасагдахгүй НӨАТ-ын шалтгаан ба НХАТ-ын код алга | Түлхүүрт `NonDeductibleReason` ба `CityTaxCodeId` нэмэх санал (05 эзэмшигч засна). Нэмэгдэх хүртэл эх модуль ийм мөрийг `SeparateLineNo`-оор тусгаарлана | BR-TAX-31, BR-TAX-94 |
| Z-TAX-16 | 05 BR-PST-36 ба §5.7.2: суурь G/L мөрийн `VatAmount` = **бүтэн** НӨАТ (хасагдахгүй хэсэг орно); энэ баримт BR-TAX-31: **хасагдах** НӨАТ | **Хасагдах** НӨАТ канон: тэгвэл NORMAL суурь мөрт (хасагдахгүй хэсэгтэй ч) `amount + vat_amount` = цэвэр + ND + (VAT − ND) = бохир дүн; RC ба FULL_VAT-д 05 §5.11-ийн тооцооны төрөл тус бүрийн томьёо хэвээр. Мөн `vat_amount` нь VAT дансны G/L мөрийн дүнтэй тэнцэнэ. Хасагдахгүй хэсэг нь VAT entry-ийн `non_deductible_amount`-д бий. 05 BR-PST-36, §5.7.2-ын `VatAmount = row.VatAmount`-ийг `row.VatAmount − row.NonDeductibleVat` болгох санал (05 эзэмшигч засна) | BR-TAX-31; R-VAT-18 |

---

## 1. Зорилго ба хамрах хүрээ

### 1.1 Зорилго

Tax модуль нь Монголын бичил бизнест дараах үүргийг гүйцэтгэнэ:

1. **НӨАТ-ыг зөв тооцох** (VAT, нэмэгдсэн өртгийн албан татвар). Баримтын түвшинд VAT identifier тус бүрээр нэг удаа бөөрөнхийлж, мөрүүдэд үлдэгдлээр хуваарилна (D-E3). Ингэснээр хэвлэсэн, батлагдсан, eBarimt-д илгээсэн НӨАТ нэг утгатай байна.
2. **НӨАТ-ын дэд дэвтэр** (`tax.vat_entry`) хөтөлнө. Энэ нь ТТ-03а, ТТ-03а-5/6, хаалтын цорын ганц эх сурвалж.
3. **Орцын НӨАТ-ыг зөвхөн баталгаажсан ДДТД-тэй** (эсвэл гаалийн мэдүүлэгтэй) үед хасна (D-E4).
4. **Сарын ТТ-03а-гийн өгөгдөл** гаргаж, **НӨАТ-ын хаалт** (settlement) хийж, НӨАТ-ын тооцооны дансанд (2310) төлөх/буцаан авах дүнг гаргана. Илгээсэн үеийг эцэслэнэ.
5. **Хуулийн бүх тоог огноотой параметрээс** уншина (D-E7). 2027 оны өөрчлөлт (НӨАТ-ын босго 400 сая 2027-07-01-нээс, хялбаршуулсан НӨАТ, ААНОАТ-ын 3 шатлал) кодын өөрчлөлтгүй ажиллана (D-K5).
6. **НӨАТ төлөгч бус** бизнесийг дэмжинэ (D-E5): борлуулалтад НӨАТ-гүй, худалдан авалтын НӨАТ өртөгт, босгыг хянана.
7. R2-т **НХАТ** (D-E6), **хялбаршуулсан НӨАТ**, **ААНОАТ-ын туслах тайлан** нэмнэ.

### 1.2 Хувилбарын хамрах хүрээ (DECISIONS §H)

| Чадвар | R1 | R2 | R3 |
|---|---|---|---|
| `tax.tax_parameter`-ийн хайлт (`GetParameter`), API `GET /tax-parameters` | Тийм | | |
| VAT Bus./Prod. бүлэг, VAT Posting Setup-ийн матриц (seed 19 мөр), тохиргооны дүрэм | Тийм | | |
| Баримтын НӨАТ: VAT10 / VAT0 / EXEMPT / NOVAT, үнэ НӨАТ-тэй/гүй, сөрөг мөр, хуваарилалт | Тийм | | |
| Хасагдахгүй НӨАТ (шалтгаантай), НӨАТ-ын зөрүү (худалдан авалт) | Тийм | | |
| НӨАТ төлөгч бус горим | Тийм | | |
| VAT entry, G/L–VAT холбоос, буцаалтын VAT толин тусгал | Тийм | | |
| НӨАТ-ын огноо, НӨАТ-ын үе (OPEN/CLOSED/SUBMITTED) | Тийм | Хэрэглэгчийн VAT огнооны цонх | |
| Орцын НӨАТ-ын гар баталгаажуулалт ба татгалзал | Тийм (татгалзал: Should) | eBarimt импортоор автомат (12 PUR-12) | |
| ТТ-03а-гийн тооцоо (seed загвар), ТТ-03а-5/6 бүртгэл, XLSX/CSV экспорт | Тийм | | e-tax-д шууд илгээх (FR-INT-008, хэрэв API нээлттэй бол) |
| НӨАТ-ын хаалт, илгээсэн гэж тэмдэглэх, хаалтыг цуцлах (дахин нээх) | Тийм (хаалт: Should) | | |
| eBarimt-тэй НӨАТ-ын тулгалт (FR-TAX-016) | Тийм (Should) | | |
| НӨАТ-ын бүртгэлийн босгын хяналт | Тийм (Should) | | |
| Татварын календарь | Тийм (Could) | | |
| Урвуу тооцоо (импортын үйлчилгээ, FR-TAX-020), гаалийн НӨАТ (FR-TAX-021) | Тооцоолол ба setup бэлэн (seed); UI-д нээхгүй | Тийм (FR-TAX-020/021 нь R2 · Should) | |
| НХАТ (D-E6, FR-TAX-019) | Схем бэлэн | Тийм | |
| Хялбаршуулсан НӨАТ (FR-TAX-022) | | Тийм (Could, параметр баталгаажсаны дараа бичилт) | |
| ААНОАТ-ын улирлын/жилийн туслах тайлан | | Тийм (санал, OQ-TAX-10) | Бүрэн ААНОАТ-ын тооцоолол (00 §хүрээнээс гадуур) |
| Компанийн огноотой татварын профайл (CR-TAX-04) | `company_setup.vat_registered`, `vat_registered_from` | Тийм | |

### 1.3 Хамрах шаардлага (FR)

| FR | Энэ баримт юуг хангах | Хэсэг |
|---|---|---|
| FR-TAX-001 VAT posting setup-ийн матриц | BR-TAX-01…09, seed-ийн матриц | §3.3, §4.1 |
| FR-TAX-002 Ангилал ба eBarimt `taxType` | BR-TAX-06, -55 | §3.3, §4.1 |
| FR-TAX-003 Хувийг огноогоор | BR-TAX-10…16, `GetParameter` | §4.2, §5.2 |
| FR-TAX-004 Баримтын түвшинд тооцох, хуваарилах | BR-TAX-17…22 | §5.4, §6.2 |
| FR-TAX-005 Үнэ НӨАТ-тэй | BR-TAX-19 | §6.3 |
| FR-TAX-006 Кредит нот ба сөрөг мөр | BR-TAX-18, -29, -35 | §6.4 |
| FR-TAX-007 VAT entry | BR-TAX-28…34 | §3.4, §5.6 |
| FR-TAX-008 НӨАТ-ын огноо | BR-TAX-39…44 | §4.5 |
| FR-TAX-009 Орцын НӨАТ баталгаажсан ДДТД-тэй | BR-TAX-45…51 | §5.8 |
| FR-TAX-010 Хасагдахгүй орцын НӨАТ | BR-TAX-25, -52, -53 | §6.5, E-TAX-02 |
| FR-TAX-011 НӨАТ төлөгч бус горим | BR-TAX-54…58 | §4.7, E-TAX-05 |
| FR-TAX-012 Босгын хяналт | BR-TAX-83…88 | §5.14, §6.13 |
| FR-TAX-013 НӨАТ-ын тайлангийн загвар → ТТ-03а | BR-TAX-65…69 | §3.7, §5.9 |
| FR-TAX-014 ТТ-03а-5/6, экспорт | BR-TAX-70 | §5.12 |
| FR-TAX-015 НӨАТ-ын хаалт ба үеийн түгжээ | BR-TAX-72…82 | §5.10, §5.11, E-TAX-06 |
| FR-TAX-016 eBarimt-тэй тулгалт | BR-TAX-71 | §5.13 |
| FR-TAX-017 Хуулийн параметрийн хүснэгт | BR-TAX-10…16 | §3.2, §5.2 |
| FR-TAX-018 Татварын календарь | BR-TAX-109, -110 | §5.18 |
| FR-TAX-019 НХАТ (R2) | BR-TAX-89…96 | §5.15, E-TAX-10 |
| FR-TAX-020 Reverse charge (R2) | BR-TAX-23, -59, -60 | E-TAX-03 |
| FR-TAX-021 Гаалийн НӨАТ (R2) | BR-TAX-24, -61…63 | E-TAX-04 |
| FR-TAX-022 Хялбаршуулсан НӨАТ (R2) | BR-TAX-97…102 | §5.16, E-TAX-11 |
| FR-PUR-003, FR-PUR-009 (орцын НӨАТ) | VAT entry тал | §5.8 |
| CMP-015…019, CMP-021, CMP-022, CMP-034, CMP-035 | Параметр, босго, ТТ-03а, НХАТ, засварын цонх | §3.2, §4 |
| REQ-ACC-19, REQ-ACC-22 (mn-accounting) | ААНОАТ-ын туслах тайлан, огноотой параметр | §5.17 |

---

## 2. Ойлголт ба BC-ээс авсан зүйл

### 2.1 Гол ойлголт

| Ойлголт | Тодорхойлолт | Схем |
|---|---|---|
| **Хуулийн параметр** (statutory parameter) | Хувь, босго, хугацаа зэрэг хуулийн тоо. `effective_from..effective_to` (хоёулаа орно) хүчинтэй. Глобал, тенантгүй | `tax.tax_parameter` |
| **НӨАТ-ын бизнесийн бүлэг** (VAT business posting group) | Харилцагч/нийлүүлэгчийн НӨАТ-ын анги: дотоод, экспорт, импорт, НӨАТ төлөгч бус нийлүүлэгч | `tax.vat_bus_posting_group` |
| **НӨАТ-ын барааны бүлэг** (VAT product posting group) | Бараа/үйлчилгээний НӨАТ-ын анги: VAT10, VAT0, EXEMPT, NOVAT, IMPORT_SERVICE, CUSTOMS_VAT | `tax.vat_prod_posting_group` |
| **НӨАТ-ын тохиргоо** (VAT posting setup) | Bus. × Prod. хос бүрийн тооцооны төрөл, хувь, VAT identifier, ангилал, данс, eBarimt `taxType` | `tax.vat_posting_setup` |
| **Тооцооны төрөл** (VAT calculation type) | `NORMAL` (хувь × суурь), `REVERSE_CHARGE` (худалдан авагч өөрөө тооцно), `FULL_VAT` (мөрийн дүн бүхэлдээ НӨАТ) (D-E1) | `platform.vat_calc_type` |
| **VAT identifier** | Баримтын НӨАТ-ыг бүлэглэх түлхүүр (жишээ `VAT10`, `RC10`, `CUSTOMS`) | `vat_posting_setup.vat_identifier` |
| **НӨАТ-ын ангилал** (VAT category) | ТТ-03а ба eBarimt-д харагдах ангилал: `VAT10`, `VAT0`, `EXEMPT`, `NOVAT` (D-E2) | `vat_category` |
| **Хэрэгжих ангилал** (effective category) | Тухайн бичилтэд хэрэглэгдсэн ангилал. НӨАТ төлөгч бус компанийн борлуулалтад `NOVAT` болж хувирна (BR-TAX-55) | `vat_entry.vat_category` |
| **НӨАТ-ын бичилт** (VAT entry) | НӨАТ-ын дэд дэвтрийн мөр: суурь, дүн, хасагдахгүй хэсэг, хувийн snapshot | `tax.vat_entry` |
| **Хасагдах / хасагдахгүй НӨАТ** (deductible / non-deductible VAT) | Худалдан авалтын НӨАТ-ын тайланд хасагдах хэсэг (`amount`) ба өртөгт шингэх хэсэг (`non_deductible_amount`) | `vat_entry` |
| **Баталгаажсан** (deductible confirmed) | Орцын НӨАТ-ыг тайланд хасахыг зөвшөөрсөн тэмдэг: ДДТД баталгаажсан (NORMAL), эсвэл баримтаар (урвуу тооцоо, гаалийн мэдүүлэг) | `vat_entry.deductible_confirmed` |
| **НӨАТ-ын үе** (VAT return period) | ТТ-03а-гийн сар (хялбаршуулсан горимд улирал). `OPEN` → `CLOSED` → `SUBMITTED` | `tax.vat_return_period` |
| **Оноолт** (period assignment) | VAT entry аль үеийн тайланд орж тайлагнагдсаныг заана. Хаалтаар тавигдана | `vat_entry.vat_return_period_id` |
| **НӨАТ-ын хаалт** (VAT settlement) | Үеийн борлуулалтын ба хасагдах НӨАТ-ыг НӨАТ-ын тооцооны дансанд (2310) шилжүүлж, entry-г хаах бичилт | source `VATSTMT` |
| **ТТ-03а** | НӨАТ суутган төлөгчийн сарын тайлан. Хавсралт: ТТ-03а-5 (худалдан авалт), ТТ-03а-6 (борлуулалт) | `tax.vat_statement_*` |
| **Урвуу тооцоо** (reverse charge) | Резидент бусаас авсан үйлчилгээний НӨАТ-ыг худалдан авагч өөрөө төлөх ба хасах. G/L-д цэвэр 0 | `REVERSE_CHARGE`, 2305 |
| **Гаалийн НӨАТ** (import VAT) | Импортын бараанд гаальд төлсөн НӨАТ. Мэдүүлгээр хасагдана | `FULL_VAT`, `CUSTOMS_VAT` |
| **НХАТ** (capital city tax) | Нийслэлийн албан татвар: НӨАТ-гүй цэвэр дүнгийн 2%. НӨАТ-аас тусдаа мөр (D-E6) | `tax.city_tax_*` |
| **Эргэлт** (turnover, босгын) | Сүүлийн 12 сарын татвар ногдох борлуулалт (үндсэн хөрөнгийн борлуулалтгүй) | Тооцоолно (§6.13) |

### 2.2 BC-ээс хуулсан, хялбарчилсан, хассан зүйл

| BC (W1 v29) | Манай хэрэгжүүлэлт | Ангилал | Research дүрэм |
|---|---|---|---|
| VAT Bus. × VAT Prod. → VAT Posting Setup (T323/324/325), мөр заавал, `Blocked` | Хуулсан. Seed 4 × 4 + урвуу + гааль = 19 мөр | Хуулсан | R-VAT-01, R-VAT-05 |
| Posting үед мөрийн тооцооны төрөл = setup-ийнх | Хуулсан; setup-ийн `row_version`-оор (05 §5.2 `gl.setup_changed`) | Хуулсан | R-VAT-02 |
| VAT entry үүссэн бол тооцооны төрлийг өөрчлөхгүй; `VAT %` чөлөөтэй өөрчлөгдөнө | Тооцооны төрөл түгжигдэнэ; хувь нь **огноотой параметрээс** (засах шаардлагагүй) | Өөрчилсөн | R-VAT-03; D-E7 |
| Ижил VAT identifier → ижил хувь (Bus. бүлэг дотор) | Хуулсан (хадгалах үед шалгана) | Хуулсан | R-VAT-04 |
| Normal / Reverse Charge / Full VAT | Хуулсан. Урвуу тооцоо, гаалийн НӨАТ нь зөвхөн худалдан авалт ба журналд | Хуулсан (хязгаарласан) | R-VAT-07, R-VAT-07a, R-VAT-07b |
| Sales Tax, No Taxable VAT | Хассан | Хассан | R-VAT-07c |
| VAT Amount Line: (identifier, calc type, tax group, use tax, **positive**) бүлэг, нэг бөөрөнхийлөлт, үлдэгдлийн хуваарилалт | Хуулсан. Түлхүүр: (identifier, calc type, [НХАТ-ын код — НӨАТ-тэй үнэд], тэмдэг) | Хуулсан | R-VAT-08, R-VAT-13 |
| Мөр засах үеийн "ойролцоо" НӨАТ (running totals) | Хассан: сервер **бүхэл баримтыг** дахин тооцно | Хялбарчилсан | R-VAT-09; pitfall 18 |
| Үнэ НӨАТ-тэй/гүй томьёо | Хуулсан; НХАТ-тай үед хуваагчид НХАТ-ын хувь нэмэгдэнэ | Хуулсан (өргөтгөсөн) | R-VAT-10, R-VAT-11 |
| `Amount Rounding Precision`, `VAT Rounding Type` (магнитудаар) | Хуулсан (`company_setup`) | Хуулсан | R-VAT-12 |
| VAT Difference, `Max. VAT Difference Allowed` | Зөвхөн худалдан авалт ба журналд (нийлүүлэгчийн баримттай тааруулах) | Хялбарчилсан | R-VAT-14 |
| Invoice rounding | Борлуулалтын spec (06 §5.10); бөөрөнхийлөлтийн данс НӨАТ-гүй | Шилжүүлсэн | R-VAT-15; pitfall 11 |
| Журналын gross арга, урвуу тооцоо цэвэр дүн дээр | Хуулсан (05 §6.4) | Хуулсан | R-VAT-16, R-VAT-17 |
| Invoice Posting Buffer → нэг VAT entry / buffer мөр, 0 %-д ч VAT entry | Хуулсан | Хуулсан | R-VAT-18, R-VAT-20 |
| Тэмдэг: борлуулалт сөрөг, худалдан авалт эерэг | Хуулсан | Хуулсан | R-VAT-19 |
| VAT entry-д posting-ийн контекст | Хуулсан + хувь, ангилал, eBarimt `taxType`, баталгаажуулалтын талбар | Өргөтгөсөн | R-VAT-21 |
| VAT entry-ийн VAT date-ийг дараа нь засах (CU338, VAT Reporting Date Mgt) | Хассан: `vat_date` нь posting үед л (D-E9), дараа нь өөрчлөгдөхгүй | Хассан | R-VAT-22 |
| Control VAT Period (block / warn горимууд) | Нэг дүрэм: `OPEN` бус үед хориглоно (`ERV01`) | Хялбарчилсан | R-VAT-23 |
| Хаагдсан VAT entry-тэй гүйлгээг буцаахгүй | Хуулсан + оноогдсон entry (`vat_return_period_id`) | Хуулсан (өргөтгөсөн) | R-VAT-24 |
| Unrealized (мөнгөн суурьтай) VAT, урьдчилгааны НӨАТ | Хассан: аккруэл суурь | Хассан | R-VAT-25 |
| VAT Statement: Account / VAT Entry / Row Totaling, Description; Calculate/Print with | Хуулсан; NULL бүлэг = бүх бүлэг (Z-TAX-10); `vat_category`, `only_deductible_confirmed` шүүлт нэмсэн | Өргөтгөсөн | R-VAT-26, R-VAT-27 |
| "Round to whole numbers" | Хассан (0.01-ээр) | Хассан | R-VAT-27 |
| Open/Closed, Within / Before-and-Within period | Оноолтын scope-оор орлуулсан (Z-TAX-13) | Өөрчилсөн | R-VAT-28 |
| Calc. and Post VAT Settlement: setup × төрөл, `−Σ` VAT дансанд, нийлбэр settlement дансанд, entry хаах | Хуулсан; "≤ үеийн эцэс" нээлттэй entry (bc-vat §7 #7); 0 дүнтэй бүлэг G/L-гүй оноогдоно | Хуулсан (өөрчлөлттэй) | R-VAT-29, R-VAT-30, R-VAT-32 |
| Урвуу тооцооны хаалт: Purchase VAT Кт, Reverse Chrg. Дт | Хуулсан + хасагдахгүй хэсэг төлөх дүнд нэмэгдэнэ | Өргөтгөсөн | R-VAT-31 |
| Non-Deductible VAT (CU6200), VAT entry-ийн `Non-Deductible VAT Base/Amount` | Энгийн хувилбар: мөрийн хувь (0 эсвэл 100) ба шалтгаан | Хялбарчилсан | bc-vat §2 (T254); FR-TAX-010 |
| VAT Rate Change хэрэгсэл | `tax.tax_parameter` (огноотой хувь) | Орлуулсан | bc-vat §7 #2; D-E7 |
| VAT Clause | `vat_posting_setup.vat_clause_text` (ТМ-1-д хэвлэнэ) | Хялбарчилсан | bc-vat §2 (T560) |
| VAT Return Period (T737) | `tax.vat_return_period` + хаалтын ваучерын холбоос | Хуулсан | R-VAT-23 |

### 2.3 BC-д байхгүй, Монголын нөхцөлд нэмсэн

| Нэмэлт | Шалтгаан | Эх |
|---|---|---|
| Огноотой хуулийн параметр (`tax.tax_parameter`), `verified`/`unverified` | Хууль 2027-01-01 ба 2027-07-01-нд өөрчлөгдөнө; утгын хувилбарыг нотлох | D-E7, D-K5; ADR-0021; mn-tax R1 |
| Орцын НӨАТ-ын баталгаажуулалт (`deductible_confirmed`, ДДТД) | Орцын НӨАТ зөвхөн нэгдсэн системд бүртгэгдэж баталгаажсан баримтаар хасагдана | D-E4; mn-tax §2.4, R5; CMP-018 |
| eBarimt `taxType`/`taxProductCode` setup-д | PosAPI-ийн шаардлага | D-E2; mn-tax R3 |
| НӨАТ төлөгч бус горим | Ихэнх бичил бизнес босгоос доош (2027-07-01-нээс 400 сая) | D-E5; mn-tax R2 |
| Босгын хяналт (12 сарын эргэлт) | Заавал бүртгүүлэх үүрэг | mn-tax R4; CMP-016 |
| НХАТ (тусдаа татвар, тусдаа ledger) | НӨАТ-ын суурьт орохгүй, НӨАТ НХАТ-ын суурьт орохгүй | D-E6; mn-tax §5, R14 |
| Хялбаршуулсан НӨАТ (улирлын, 90 %-ийн тооцоот худалдан авалт) | 2027 оны багц | D-E7; mn-tax §2.6, R10 |
| ААНОАТ-ын туслах тайлан | Улирлын ТТ-02-д бэлтгэх | mn-tax R11; REQ-ACC-19 |
| Татварын календарь | 10-ны НӨАТ, 20-ны ААНОАТ г.м. | mn-tax R17; mn-accounting §7; REQ-ACC-13 |

---
## 3. Өгөгдөл

Энэ хэсэг [db/schema/040_tax.sql](./db/schema/040_tax.sql) ба seed-ийн нэрийг яг ашиглана. Схемд байхгүй зүйлийг §12-т хүсэлт болгосон; тэр хүртэлх түр шийдлийг тус бүрд нь заав.

### 3.1 Хүснэгтийн эзэмшил ба бичих зам

| Хүснэгт | Төрөл | Хэн бичнэ | Хэрхэн |
|---|---|---|---|
| `tax.tax_parameter` | Глобал лавлах (RLS-гүй) | Платформын оператор | Зөвхөн migration (`legal_parameters.sql`-ийн шинэ мөр, ADR-0014). Тенант зөвхөн уншина |
| `tax.vat_bus_posting_group`, `tax.vat_prod_posting_group`, `tax.vat_posting_setup` | Компанийн тохиргоо | Tax (setup API), seed `tax.fn_mn_seed_vat_groups()`, `tax.fn_mn_seed_vat_setup(date)` | CRUD, `audit.row_change` |
| `tax.vat_return_period` | Компанийн тохиргоо + төлөв | Tax: `tax.fn_mn_ensure_vat_return_periods(year)`; үйлдэл `:close`, `:reopen`, `:submit` | Төлөвийн баганыг ерөнхий PATCH өөрчлөхгүй (13 SEC-AZ-18) |
| `tax.vat_statement_template`, `tax.vat_statement_name`, `tax.vat_statement_line` | Компанийн тохиргоо | Seed `tax.fn_mn_seed_vat_statement()`; setup API | CRUD + мөрийн шалгалт (BR-TAX-65) |
| `tax.vat_entry` | Ledger (append-only, D-C4) | Tax-ийн `VatLedgerWriter` (posting engine-ийн transaction, order 10) | INSERT; зөвшөөрөгдсөн баганыг `platform.fn_ledger_update`-ээр (BR-TAX-32) |
| `tax.gl_entry_vat_entry_link` | Ledger | `VatLedgerWriter` | INSERT |
| `tax.city_tax_code`, `tax.city_tax_setup` | Компанийн тохиргоо (R2) | Tax setup API, seed | CRUD |
| `tax.city_tax_entry` | Ledger (R2) | Tax-ийн `CityTaxLedgerWriter` (order 15) | INSERT; `fn_ledger_update` |

Tax модуль бусад модулийн хүснэгтэд SQL-ээр **бичихгүй** (02 §4.3 дүрэм 2). eBarimt-ийн `purchase_receipt`-ийн төлөвийг `IPurchaseReceiptRegistry` (EBarimt.Contracts)-ээр шинэчилнэ (§5.8).

### 3.2 `tax.tax_parameter` — хуулийн параметр (D-E7)

| Багана | Утга ба хэрэглээ |
|---|---|
| `id` | Параметрийн хувилбарын id. Тооцоолол ашигласан хувилбарыг хадгалахад (CR-TAX-01) |
| `param_code` | `^[a-z0-9_]+(\.[a-z0-9_]+)+$` (жишээ `vat.standard_rate`) |
| `value_numeric` / `value_text` | Тоон эсвэл текст утга (хоёрын нэг заавал). Хувь нь ratio (0.10 = 10 %) |
| `unit` | `ratio`, `MNT`, `day_of_following_month`, `day_of_month_after_quarter`, `month_day_following_year`, `period`, `rule`, `list`, `flag`, `months`, `years`, `days` |
| `effective_from`, `effective_to` | Хүчинтэй муж, хоёр захаа оруулна (`daterange(…, '[]')`). `effective_to` NULL = нээлттэй. Нэг кодод давхцахгүй (EXCLUDE) |
| `status` | `verified` / `unverified` / `superseded`. Бичилтэд зөвхөн `verified` (BR-TAX-12) |
| `confidence`, `legal_basis`, `source_url`, `applies_to` | UI-д эх сурвалж ба итгэлийг харуулна (S-TAX-06) |

**Энэ модульд хэрэглэгдэх параметр** ([legal_parameters.sql](./db/seed/legal_parameters.sql), 2026-10-06-ны байдлаар):

| `param_code` | Утга | `effective_from` – `to` | `status` | Хэрэглээ | Хэрэглэх төрөл |
|---|---|---|---|---|---|
| `vat.standard_rate` | 0.10 | 2016-01-01 – | verified | VAT10, урвуу тооцоо, гааль (`vat_rate_param_code`) | POSTING |
| `vat.zero_rate` | 0 | 2016-01-01 – | verified | VAT0 мөр | POSTING |
| `vat.registration_threshold_mandatory` | 50 000 000 | 2016-01-01 – 2027-06-30 | verified | Босго (BR-TAX-84) | REPORT |
| `vat.registration_threshold_mandatory` | 400 000 000 | 2027-07-01 – | verified (medium) | Босго (D-K5) | REPORT |
| `vat.registration_threshold_voluntary` | 10 000 000 | 2016-01-01 – | verified | Сайн дурын бүртгэлийн мэдээлэл | REPORT |
| `vat.return_frequency` | `monthly` | 2016-01-01 – | verified | НӨАТ-ын үеийн давтамж | REPORT |
| `vat.return_due_day` | 10 | 2016-01-01 – | verified | `vat_return_period.due_date`, календарь | REPORT |
| `vat.simplified.turnover_threshold` | 400 000 000 | 2027-01-01 – | unverified | Хялбаршуулсан горимын эрх (R2) | REPORT |
| `vat.simplified.deemed_purchase_share` | 0.9 | 2027-01-01 – | unverified | Хялбаршуулсан НӨАТ-ын тооцоо (R2) | POSTING (баталгаажих хүртэл зөвхөн тооцоо) |
| `vat.simplified.return_frequency` | `quarterly` | 2027-01-01 – | unverified | Улирлын үе (R2) | REPORT |
| `vat.simplified.excluded_activities` | текст жагсаалт | 2027-01-01 – | unverified | Эрхийн шалгалт (R2) | REPORT |
| `vat.capex_input_immediate_deduction` | 1 | 2027-01-01 – | unverified | ҮХ-ийн орцын НӨАТ шууд хасагдах (мэдээлэл) | REPORT |
| `vat.fa_input_spread_months.buildings` / `.equipment` | 120 / 60 | 2016-01-01 – 2026-12-31 | unverified | Хүрээнээс гадуур (CMP-020); зөвхөн мэдээлэл | — |
| `vat.payment_deferral_months_initial` / `_additional` | 1 / 2 | 2027-01-01 – | verified | Календарийн тайлбар (хойшлуулалт хүсэлтээр) | REPORT |
| `city_tax.rate_ub` | 0.02 | 2024-01-01 – | verified | НХАТ-ын код `UB` (`rate_param_code`, R2) | POSTING |
| `city_tax.rate_max_ub` | 0.02 | 2024-01-01 – | verified | НХАТ-ын хувийн дээд хязгаар (setup шалгалт) | REPORT |
| `city_tax.base` | `net_price_excl_vat` | 2024-01-01 – | verified | НХАТ-ын суурь (мэдээлэл; `city_tax_code.base_type`) | REPORT |
| `cit.rate_band_1`, `cit.band_1_upper` | 0.10, 6 000 000 000 | 2020-01-01 – | verified | ААНОАТ (R2) | REPORT |
| `cit.rate_band_2` | 0.25 / 0.15 | 2020-01-01 – 2026-12-31 / 2027-01-01 – | verified | ААНОАТ (R2) | REPORT |
| `cit.band_2_upper`, `cit.rate_band_3` | 10 000 000 000, 0.25 | 2027-01-01 – | verified | ААНОАТ (R2) | REPORT |
| `cit.credit_90pct_threshold` | 1 500 000 000 / 2 500 000 000 | 2020-01-01 – 2026-12-31 / 2027-01-01 – | verified | 90 %-ийн хөнгөлөлт (R2) | REPORT |
| `cit.credit_90pct_rate` | 0.9 | 2020-01-01 – | verified | 90 %-ийн хөнгөлөлт (R2) | REPORT |
| `cit.turnover_regime_rate`, `cit.turnover_regime_threshold` | 0.01, 300 000 000 | 2020-01-01 – | verified | 1 %-ийн горим (R2) | REPORT |
| `cit.simplified_return_threshold` | 50 000 000 / 400 000 000 | 2020-01-01 – 2026-12-31 / 2027-01-01 – (unverified) | verified / unverified | ТТ-02(ХГ) (R2) | REPORT |
| `cit.quarterly_return_due_day` | 20 | 2020-01-01 – | verified | Календарь, туслах тайлан | REPORT |
| `cit.quarterly_payment_due` | `last day of the month after the quarter` | 2027-01-01 – | unverified | Календарь | REPORT |
| `cit.advance_payment_due_day` | 25 | 2020-01-01 – | unverified | Календарь | REPORT |
| `cit.annual_return_due` | `02-10` / `03-05` | 2020-01-01 – 2026-12-31 / 2027-01-01 – (unverified) | verified / unverified | Календарь | REPORT |
| `cit.loss_carryforward_years`, `cit.loss_offset_cap_ratio` | 4, 0.5 | 2020-01-01 – | unverified | Алдагдал шилжүүлэх (R2) | REPORT |
| `tax.return_amendment_window_years` | 2 | 2027-01-01 – | verified | Засварын цонхны мэдээлэл (CMP-034) | REPORT |

"Хэрэглэх төрөл" нь BR-TAX-12-ын `ParameterUse` юм: `POSTING` нь ledger-т бичигдэх дүнд (зөвхөн `verified`), `REPORT` нь анхааруулга, тайлан, календарьт (`unverified` бол ⚠ тэмдэгтэй).

### 3.3 НӨАТ-ын бүлэг ба VAT Posting Setup

**`tax.vat_bus_posting_group`** (BC T323) ба **`tax.vat_prod_posting_group`** (BC T324): `code` (`platform.code20`), `description`, `description_en`. Seed ([mn_20_tax.sql](./db/seed/mn_20_tax.sql)):

| Төрөл | Код | Утга | Хэнд оноох |
|---|---|---|---|
| Bus. | `DOMESTIC` | Дотоодын харилцагч ба НӨАТ төлөгч нийлүүлэгч, иргэн | Анхдагч харилцагч, нийлүүлэгч |
| Bus. | `EXPORT` | Гадаад худалдан авагч (экспорт, 0 %) | Гадаад харилцагч (`kind = FOREIGN`) |
| Bus. | `IMPORT` | Гадаад нийлүүлэгч (импорт, урвуу тооцоо, гааль) | Гадаад нийлүүлэгч, гаалийн байгууллага (`CUSTOMS` загвар) |
| Bus. | `NONREG` | НӨАТ төлөгч бус нийлүүлэгч | Зөвхөн нийлүүлэгч. Харилцагчид оноохгүй: борлуулалтын НӨАТ худалдан авагчаас биш, компанийн өөрийн бүртгэлээс хамаарна (D-E5) |
| Prod. | `VAT10` | НӨАТ 10 % (стандарт) | Анхдагч бараа/үйлчилгээ |
| Prod. | `VAT0` | НӨАТ 0 % (экспорт, олон улсын үйлчилгээ) | Тэг хувьтай бараа |
| Prod. | `EXEMPT` | НӨАТ-аас чөлөөлөгдөх | Санхүү, эрүүл мэнд, боловсрол г.м. |
| Prod. | `NOVAT` | НӨАТ-ын хамрах хүрээнээс гадуур | Цалин, татвар, элэгдэл г.м. дансны мөр |
| Prod. | `IMPORT_SERVICE` | Резидент бусаас авсан үйлчилгээ (урвуу тооцоо) | Гадаад нийлүүлэгчийн үйлчилгээний мөр |
| Prod. | `CUSTOMS_VAT` | Гаалийн байгууллагад төлсөн импортын НӨАТ | Гаалийн НӨАТ-ын мөр |

**`tax.vat_posting_setup`** (BC T325) — баганын утга:

| Багана | Утга |
|---|---|
| `vat_bus_posting_group_id`, `vat_prod_posting_group_id` | Матрицын түлхүүр (`UNIQUE`) |
| `vat_calculation_type` | `NORMAL` / `REVERSE_CHARGE` / `FULL_VAT` (D-E1). VAT entry үүссэн бол өөрчлөхгүй (BR-TAX-03) |
| `vat_identifier` | Баримтын бүлэглэлийн түлхүүр (seed: `VAT10`, `VAT0`, `EXEMPT`, `NOVAT`, `RC10`, `CUSTOMS`) |
| `vat_category` | `VAT10` / `VAT0` / `EXEMPT` / `NOVAT` (D-E2): ТТ-03а-гийн мөр ба eBarimt-ийн ангилал |
| `vat_percent` | Анхны хувь (seed-ийн үед). `vat_rate_param_code` байвал хэрэглэгдэхгүй (BR-TAX-14) |
| `vat_rate_param_code` | Огноотой хувийн параметр (`vat.standard_rate`, `vat.zero_rate`) |
| `sales_vat_account_id`, `purchase_vat_account_id`, `reverse_chrg_vat_account_id` | 2300, 1300, 2305 (seed). DB CHECK: `REVERSE_CHARGE` бол урвуу тооцооны данс заавал |
| `non_deductible_vat_percent` | 0 (seed, НӨАТ төлөгч) эсвэл 100 (seed, НӨАТ төлөгч бус компани). Хэрэглээ BR-TAX-25 |
| `ebarimt_tax_type`, `ebarimt_tax_product_code` | DB CHECK-ийн харгалзаа: VAT10→`VAT_ABLE`, VAT0→`VAT_ZERO`, EXEMPT→`VAT_FREE`, NOVAT→`NOT_VAT`/`VAT_FREE`. VAT0/EXEMPT (NORMAL) мөрөнд анхдагч код заавал (seed-д `TBD`, W-TAX-11) |
| `vat_clause_text` | ТМ-1 нэхэмжлэх дээр хэвлэх тайлбар |
| `blocked` | Posting-ийг хориглоно (BR-TAX-01) |

**Seed-ийн матриц** ([db/seed/README.md](./db/seed/README.md) §6; `tax.fn_mn_seed_vat_setup(p_as_of)`). Хувь нь `vat.standard_rate`-аас; "Хасаг. бус %" нь компани НӨАТ төлөгч бус бол 100:

| # | VAT Bus. | VAT Prod. | Тооцоо | Identifier | Ангилал | % | eBarimt `taxType` / код | Данс: борл. / х.а. / урвуу | Хасаг. бус % (бүртгэлгүй) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | DOMESTIC | VAT10 | NORMAL | VAT10 | VAT10 | 10 | VAT_ABLE / — | 2300 / 1300 / — | 100 |
| 2 | DOMESTIC | VAT0 | NORMAL | VAT0 | VAT0 | 0 | VAT_ZERO / `TBD` | 2300 / 1300 / — | 0 |
| 3 | DOMESTIC | EXEMPT | NORMAL | EXEMPT | EXEMPT | 0 | VAT_FREE / `TBD` | 2300 / 1300 / — | 0 |
| 4 | DOMESTIC | NOVAT | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 5 | DOMESTIC | CUSTOMS_VAT | FULL_VAT | CUSTOMS | VAT10 | 10 | VAT_ABLE / — | 2300 / 1300 / — | 100 |
| 6 | EXPORT | VAT10 | NORMAL | VAT0 | VAT0 | 0 | VAT_ZERO / `TBD` | 2300 / 1300 / — | 0 |
| 7 | EXPORT | VAT0 | NORMAL | VAT0 | VAT0 | 0 | VAT_ZERO / `TBD` | 2300 / 1300 / — | 0 |
| 8 | EXPORT | EXEMPT | NORMAL | EXEMPT | EXEMPT | 0 | VAT_FREE / `TBD` | 2300 / 1300 / — | 0 |
| 9 | EXPORT | NOVAT | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 10 | IMPORT | VAT10 | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 11 | IMPORT | VAT0 | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 12 | IMPORT | EXEMPT | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 13 | IMPORT | NOVAT | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 14 | IMPORT | IMPORT_SERVICE | REVERSE_CHARGE | RC10 | VAT10 | 10 | VAT_ABLE / — | 2300 / 1300 / 2305 | 100 |
| 15 | IMPORT | CUSTOMS_VAT | FULL_VAT | CUSTOMS | VAT10 | 10 | VAT_ABLE / — | 2300 / 1300 / — | 100 |
| 16 | NONREG | VAT10 | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 17 | NONREG | VAT0 | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 18 | NONREG | EXEMPT | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |
| 19 | NONREG | NOVAT | NORMAL | NOVAT | NOVAT | 0 | NOT_VAT / — | 2300 / 1300 / — | 0 |

Тайлбар:
- Мөр 10: гадаад нийлүүлэгчийн барааны нэхэмжлэхэд Монголын НӨАТ байхгүй; импортын НӨАТ-ыг гаалийн мэдүүлгээр мөр 15-аар бичнэ (BR-TAX-61).
- Мөр 14 ба 10-ын ялгаа: гадаад нийлүүлэгчийн **үйлчилгээний** мөрөнд хэрэглэгч `IMPORT_SERVICE` сонгохгүй бол урвуу тооцоо хийгдэхгүй. Үүнийг W-TAX-07 анхааруулна ([db/seed/README.md](./db/seed/README.md) §12 #10).
- Мөр 5, 15 (`FULL_VAT`)-ийн `vat_percent` = 10 нь мэдээллийн утга: гаалийн НӨАТ-ын мөрийн дүн бүхэлдээ НӨАТ (BR-TAX-24).
- Хувийн `TBD` код нь eBarimt-ийн лавлахаас (`getProductTaxCode`) авсан кодоор солигдох хүртэл барааны карт дээрх код заавал (12 MAP-22).

### 3.4 `tax.vat_entry` — НӨАТ-ын дэд дэвтэр (BC T254)

| Багана | Утга | Хаанаас / хэн |
|---|---|---|
| `id` | UUIDv7 | App |
| `entry_no` | Компани доторх завсаргүй дугаар | `platform.fn_next_entry_no('VAT_ENTRY', n)` (Tax writer) |
| `entry_type` | `SALE`, `PURCHASE`, `SETTLEMENT` | Buffer-ийн `gen_posting_type`; хаалт |
| `posting_date` | Ваучерын огноо (DB: ваучертай ижил, `ERB02`) | Engine |
| `vat_date` | НӨАТ-ын огноо (D-E9). Тайлангийн үеийг тодорхойлно. SETTLEMENT-д = үеийн `ending_date` | Баримт/журнал; хаалт |
| `document_date`, `document_type`, `document_no` | Баримтын огноо, төрөл, хуулийн дугаар. Гаалийн НӨАТ-д `document_date` = мэдүүлгийн огноо | Engine |
| `external_document_no` | Нийлүүлэгчийн нэхэмжлэхийн дугаар; гаалийн НӨАТ-д **мэдүүлгийн дугаар** (BR-TAX-62) | Баримт |
| `base` | **Хасагдах** суурь, тэмдэгтэй (борлуулалт < 0, худалдан авалт > 0, кредит нот эсрэг). `FULL_VAT`-д 0 | Composer |
| `amount` | **Хасагдах** (борлуулалтад: тооцсон) НӨАТ, тэмдэгтэй | Composer |
| `non_deductible_base`, `non_deductible_amount` | Хасагдахгүй хэсгийн суурь ба НӨАТ (`base`/`amount`-тай ижил тэмдэгтэй). Борлуулалтад 0 | Composer (BR-TAX-25) |
| `vat_difference` | Гараар тааруулсан НӨАТ-ын зөрүү (зөвхөн худалдан авалт, журнал) | Composer (BR-TAX-26) |
| `vat_calculation_type`, `vat_percent`, `vat_identifier` | Snapshot. `vat_percent` = хэрэглэгдсэн хувь (BC-д байхгүй талбар) | Resolver (BR-TAX-14) |
| `vat_category`, `ebarimt_tax_type` | **Хэрэгжих** ангилал ба `taxType` (НӨАТ төлөгч бус компанийн борлуулалтад `NOVAT`, BR-TAX-55) | Resolver |
| `vat_bus_posting_group`, `vat_prod_posting_group`, `gen_bus_posting_group`, `gen_prod_posting_group` | Бүлгийн **код**-ын snapshot (FK-гүй) | Buffer |
| `bill_to_pay_to_type`, `bill_to_pay_to_id`, `bill_to_pay_to_no` | `CUSTOMER` / `VENDOR` | Баримт |
| `party_tin` | Хуулийн этгээдийн ТТД (`customer.tin` / `vendor.tin`), гадаадынхад `foreign_tax_id`. **Хувь хүний регистр/ТТД-г бичихгүй** (PII, 13 §10.6) | Баримт |
| `country_code` | Харилцагчийн улс | Баримт |
| `transaction_no`, `gl_register_no` | Ваучер ба run | Engine |
| `gl_entry_no` | **Суурь** G/L entry (`FULL_VAT`: 1300-ийн мөр өөрөө; SETTLEMENT: VAT дансны мөр) | Engine (key → entry_no) |
| `closed`, `closed_by_entry_no` | Хаалтаар (эсвэл татгалзлын хос) хаагдсан | `fn_ledger_update` (BR-TAX-73, -51) |
| `vat_return_period_id` | Аль үеийн ТТ-03а-д тайлагнасан (оноолт) | `fn_ledger_update` (хаалт) |
| `deductible_confirmed`, `deductible_confirmed_at`, `deductible_confirmed_by` | Орцын НӨАТ хасагдахыг зөвшөөрсөн (D-E4). DB CHECK: NORMAL худалдан авалтад ДДТД заавал | Posting эсвэл `fn_ledger_update` (BR-TAX-46, -49) |
| `supplier_ebarimt_id` | Нийлүүлэгчийн ДДТД (33 орон) | Баримт эсвэл баталгаажуулалт |
| `source_code`, `reason_code_id` | Процесс (`SALES`, `PURCHASES`, `GENJNL`, `VATSTMT`, `REVERSAL` …), шалтгаан | Engine |
| `reversed`, `reversed_by_entry_no`, `reversed_entry_no` | Буцаалтын холбоос (BR-TAX-34) | Writer-ийн `ReverseAsync` |
| `created_at`, `created_by` | Transaction-ий цаг (trigger), хэрэглэгч | DB |

Индекс `ix_vat_entry__open` (`WHERE NOT closed`) ба `ix_vat_entry__period` нь хаалт ба тайлангийн scope-ийн query-д тохирно (§5.9, §5.10).

### 3.5 `tax.gl_entry_vat_entry_link` (BC T253)

`(gl_entry_no, vat_entry_no)` — суурь G/L entry ↔ VAT entry. Append-only. Буцаалт (VAT entry-г суурь entry-ээр олох) ба drill-down-д хэрэглэнэ. Нэг VAT entry нэг суурь entry-тэй (R1); `UNIQUE (company_id, gl_entry_no, vat_entry_no)`.

### 3.6 `tax.vat_return_period` (BC T737)

| Багана | Утга |
|---|---|
| `starting_date`, `ending_date` | Сар (стандарт) эсвэл улирал (хялбаршуулсан, R2). Давхцахгүй (EXCLUDE) |
| `due_date` | `ending_date`-ийн дараагийн сарын 1 + `vat.return_due_day` − 1 (seed функц) |
| `status` | `OPEN` → `CLOSED` (хаалт) → `SUBMITTED` (эцсийн). `CLOSED` → `OPEN` зөвхөн `:reopen`-оор (BR-TAX-79) |
| `settlement_transaction_no` | Хаалтын `VATSTMT` ваучер (G/L мөргүй хаалтад NULL) |
| `submitted_at`, `submitted_by`, `submission_reference` | e-tax-д илгээсний бүртгэл (DB CHECK: `SUBMITTED` бол `submitted_at` заавал) |

DB guard: `trg_vat_entry_period` (`ERV01`): `vat_date` нь `OPEN` биш үед байвал SALE/PURCHASE entry оруулахгүй (SETTLEMENT-ийг зөвшөөрнө). `trg_vat_return_period_status` (`ERP02`): `SUBMITTED` үеийн төлөв ба огноо өөрчлөгдөхгүй; entry-тэй эсвэл `OPEN` биш үеийг устгахгүй.

### 3.7 НӨАТ-ын тайлангийн загвар ба ТТ-03а-гийн мөрийн харгалзаа (D-E8)

`tax.vat_statement_template` (`VAT`) → `tax.vat_statement_name` (`TT03A`, `form_code = 'ТТ-03а'`) → `tax.vat_statement_line`. Мөрийн баганын утга:

| Багана | Утга |
|---|---|
| `line_no`, `row_no`, `description` | Дараалал, ТТ-03а-гийн мөрийн дугаар, нэр |
| `line_type` | `DESCRIPTION`, `VAT_ENTRY_TOTALING`, `ACCOUNT_TOTALING`, `ROW_TOTALING` (R-VAT-26) |
| `gen_posting_type` | `SALE` / `PURCHASE` (VAT entry-ийн `entry_type`) |
| `vat_bus_posting_group_id`, `vat_prod_posting_group_id` | NULL = бүх бүлэг (Z-TAX-10) |
| `vat_category` | Хэрэгжих ангиллаар шүүнэ (NULL = бүгд) |
| `amount_type` | `AMOUNT`, `BASE` (хасагдах), `NON_DEDUCTIBLE_AMOUNT`, `NON_DEDUCTIBLE_BASE`, `FULL_AMOUNT`, `FULL_BASE` (хоёулаа) |
| `only_deductible_confirmed` | `true` бол `deductible_confirmed = true` entry л (D-E4) |
| `account_totaling` | BC-ийн шүүлтийн синтакс (`2300\|2305`, `1300..1399`), `ACCOUNT_TOTALING`-д |
| `row_totaling` | `row_no`-ийн шүүлт (`1\|3\|4\|5`, `7..11`), `ROW_TOTALING`-д |
| `calculate_with` | `OPPOSITE_SIGN` бол нийлбэрт орохоосоо өмнө эсрэг тэмдэг. `ROW_TOTALING`-д хориотой (R-VAT-27) |
| `print`, `print_with` | Харуулах эсэх, хэвлэхэд эсрэг тэмдэг |
| `box_no` | ТТ-03а-гийн хавсралтын лавлагаа (`ТТ-03а-5`, `ТТ-03а-6`) |

**Seed-ийн ТТ-03а** (`tax.fn_mn_seed_vat_statement()`, 17 мөр). "Дугаар ⚠" = маягтын одоогийн хувилбарын мөрийн дугаар баталгаажаагүй (OQ-TAX-01):

| `line_no` | `row_no` | Агуулга | Төрөл | Төрөл / Bus. / Prod. / Ангилал | `amount_type` | Зөвхөн баталгаажсан | Calc / Print | `box_no` | Итгэл |
|---|---|---|---|---|---|---|---|---|---|
| 10 | S | БОРЛУУЛАЛТ | DESCRIPTION | | | | | | |
| 20 | 1 | Татвар ногдох борлуулалт (10 %) — суурь | VAT_ENTRY | SALE / * / * / VAT10 | BASE | Үгүй | OPP / SIGN | ТТ-03а-6 | Дугаар ⚠ |
| 30 | 2 | Борлуулалтын НӨАТ (10 %) | VAT_ENTRY | SALE / * / * / VAT10 | AMOUNT | Үгүй | OPP / SIGN | ТТ-03а-6 | Дугаар ⚠ |
| 40 | 3 | 0 %-иар татвар ногдох борлуулалт (экспорт) | VAT_ENTRY | SALE / * / * / VAT0 | BASE | Үгүй | OPP / SIGN | ТТ-03а-6 | Дугаар ⚠ |
| 50 | 4 | Чөлөөлөгдөх борлуулалт | VAT_ENTRY | SALE / * / * / EXEMPT | BASE | Үгүй | OPP / SIGN | ТТ-03а-6 | Дугаар ⚠ |
| 60 | 5 | Хамрах хүрээнээс гадуурх борлуулалт | VAT_ENTRY | SALE / * / * / NOVAT | BASE | Үгүй | OPP / SIGN | ТТ-03а-6 | Дугаар ⚠; 4/5 нэгдсэн байж магадгүй |
| 70 | 6 | Нийт борлуулалт = 1+3+4+5 | ROW_TOTALING `1\|3\|4\|5` | | | | SIGN / SIGN | | Дугаар ⚠ |
| 80 | P | ХУДАЛДАН АВАЛТ, ИМПОРТ | DESCRIPTION | | | | | | |
| 90 | 7 | Дотоодын худалдан авалт (10 %, ДДТД баталгаажсан) — суурь | VAT_ENTRY | PURCHASE / DOMESTIC / VAT10 / * | BASE | Тийм | SIGN / SIGN | ТТ-03а-5 | Дугаар ⚠ |
| 100 | 8 | Хасагдах орцын НӨАТ (дотоод) | VAT_ENTRY | PURCHASE / DOMESTIC / VAT10 / * | AMOUNT | Тийм | OPP / OPP | ТТ-03а-5 | Дугаар ⚠ |
| 110 | 9 | Импортын (гаалийн) НӨАТ | VAT_ENTRY | PURCHASE / * / CUSTOMS_VAT / * | AMOUNT | Тийм | OPP / OPP | ТТ-03а-5 | ⚠ байрлал |
| 120 | 10 | Урвуу тооцооны НӨАТ — хасагдах | VAT_ENTRY | PURCHASE / IMPORT / IMPORT_SERVICE / * | AMOUNT | Үгүй | OPP / OPP | ТТ-03а-5 | ⚠ байрлал |
| 130 | 11 | Хасагдахгүй НӨАТ (мэдээлэл) | VAT_ENTRY | PURCHASE / * / * / VAT10 | NON_DEDUCTIBLE_AMOUNT | Үгүй | SIGN / SIGN | | ⚠ мэдээллийн мөр |
| 140 | 12 | Нийт хасагдах НӨАТ = 8+9+10 | ROW_TOTALING `8\|9\|10` | | | | SIGN / OPP | | Дугаар ⚠ |
| 150 | R | ТООЦООЛОЛ | DESCRIPTION | | | | | | |
| 160 | 13 | Урвуу тооцооны НӨАТ (төлөх, бүтэн) | VAT_ENTRY | PURCHASE / IMPORT / IMPORT_SERVICE / * | FULL_AMOUNT | Үгүй | SIGN / SIGN | | ⚠ байрлал |
| 170 | 14 | Төлөх (+) / илүү төлсөн (−) = 2+13+12 | ROW_TOTALING `2\|13\|12` | | | | SIGN / SIGN | | Механик НӨАТ-ын хуулийн дагуу; дугаар ⚠ |

Тэмдгийн логик (R-VAT-26, R-VAT-27): VAT entry-ийн борлуулалт сөрөг тул борлуулалтын мөрүүд `OPPOSITE_SIGN`-ээр эерэг болно. Хасагдах НӨАТ-ын мөр (8, 9, 10) эерэг entry-г `OPPOSITE_SIGN`-ээр сөрөг болгож нийлбэрт оруулна; хэвлэхдээ `print_with = OPPOSITE_SIGN`-ээр эерэг харагдана. Мөр 12 сөрөг утгатай (хэвлэхэд эерэг), мөр 14 = 2 + 13 + 12 = борлуулалтын НӨАТ + урвуу тооцоо − хасагдах НӨАТ.

### 3.8 НХАТ-ын хүснэгт (D-E6, R2)

| Хүснэгт | Гол багана | Seed |
|---|---|---|
| `tax.city_tax_code` | `code`, `rate_percent`, `rate_param_code`, `base_type = 'NET_EXCL_VAT'`, `payable_account_id` (НХАТ-ын өглөг), `expense_account_id` (худалдан авалтын талд шингэх зардал), `effective_from/to`, `blocked` | `UB`: 2 % (`city_tax.rate_ub`), 2320, 7250 |
| `tax.city_tax_setup` | `enabled`, `default_city_tax_code_id`, `settlement_account_id` (сарын хаалтын данс) | `enabled = company_setup.city_tax_payer`, `UB`, 2325 |
| `tax.city_tax_entry` | `entry_no` (`CITY_TAX_ENTRY`), `entry_type`, `city_tax_code_id`, `posting_date`, `tax_date`, `document_*`, `base`, `amount`, `rate_percent`, `bill_to_pay_to_*`, `transaction_no`, `gl_register_no`, `gl_entry_no`, `closed`, `closed_by_entry_no`, `source_code`, буцаалтын холбоос | — |

Мөрийн талбар: `sales_line.city_tax_code_id`, `city_tax_amount` (мөн posted мөр: `city_tax_code` snapshot, `city_tax_amount`); `purchase_line` ижил; толгойд `city_tax_amount`; `inv.item.city_tax_code_id` (анхдагч).

### 3.9 Бусад модулиас уншдаг өгөгдөл (contract эсвэл зөвшөөрөгдсөн чиглэлээр)

| Эх | Талбар | Хэрэглээ |
|---|---|---|
| `platform.company_setup` | `vat_registered`, `vat_registered_from`, `city_tax_payer`, `tin`, `amount_rounding_precision`, `vat_rounding_type`, `time_zone` | НӨАТ төлөгч эсэх (BR-TAX-54), бөөрөнхийлөлт, бизнесийн огноо |
| `gl.general_ledger_setup` | `max_vat_difference_allowed` (анхдагч 0 → зөрүү хориотой) | BR-TAX-26 |
| `gl.journal_template` | `allow_vat_difference` | Журналын НӨАТ-ын зөрүү |
| `gl.gl_account` | `no`, `account_type`, `blocked`, `account_category`, `account_subcategory_id` → `gl.gl_account_category.code`, `gen_posting_type` | Дансны шалгалт (BR-TAX-05, -76), ААНОАТ (BR-TAX-105) |
| `gl.gl_entry` | `amount`, `vat_date`, `posting_date`, `is_closing`, данс | ACCOUNT_TOTALING мөр, ААНОАТ, нэгтгэлийн инвариант |
| `gl.accounting_period`, `gl.fiscal_year` | `status` | Хаалтын огноо (BR-TAX-72) |
| `purchase.purchase_setup` (Purchases contract) | `require_supplier_ebarimt`, `allow_vat_difference` | BR-TAX-48, -26 |
| `sales.sales_setup` (Sales contract) | `allow_vat_difference` (R1-д борлуулалтад 0) | BR-TAX-26 |
| Sales/Purchases-ийн мөр (дуудагч `TaxDocument`-оор өгнө) | Мөрийн дүн, бүлэг, хасагдахгүй шалтгаан, НХАТ-ын код | §5.4 |
| `ebarimt.ebarimt_setup` (EBarimt contract) | `non_vat_payer_tax_type` (12 SCR-04; байхгүй үед `NOT_VAT`) | BR-TAX-55 |
| `ebarimt.ebarimt_document` (EBarimt contract `IEbarimtReceiptQuery`) | Борлуулалтын баримтын төлөв, `total_vat` | BR-TAX-71 |
| `ebarimt.purchase_receipt` (EBarimt contract `IPurchaseReceiptRegistry`) | ДДТД, төлөв | BR-TAX-49 |
| FA-ийн татварын дэвтэр (FixedAssets contract, R2) | Нягтлан ба татварын элэгдлийн зөрүү | BR-TAX-106 |

### 3.10 Хэрэглэгдэх seed данс ([db/seed/README.md](./db/seed/README.md) §3)

| Данс | Нэр | Хэрэглээ | `direct_posting` |
|---|---|---|---|
| 1300 | Орцын НӨАТ (татварын авлага) | `purchase_vat_account_id`; гаалийн НӨАТ (FULL_VAT) | false (`SystemDerived` мөр л) |
| 2300 | Борлуулалтын НӨАТ (татварын өр) | `sales_vat_account_id` | false |
| 2305 | Урвуу тооцооны НӨАТ | `reverse_chrg_vat_account_id` | false |
| 2310 | НӨАТ-ын тооцоо (төлөх / буцаан авах) | НӨАТ-ын хаалтын данс (CR-TAX-03), төлбөр Дт | true |
| 2320 | НХАТ-ын өглөг | `city_tax_code.payable_account_id` (R2) | false |
| 2325 | НХАТ-ын тооцоо (төлөх) | `city_tax_setup.settlement_account_id` (R2) | true |
| 2330 | ААНОАТ-ын өглөг | ААНОАТ-ын хуримтлалын ноорог (R2) | true |
| 2365 | Гаалийн татвар, импортын НӨАТ-ын өглөг | Нийлүүлэгчийн бүлэг `CUSTOMS` | false |
| 1310 | ААНОАТ-ын урьдчилгаа төлөлт | Мэдээлэл (ААНОАТ) | true |
| 7250 | Татвар, хураамж, төлбөрийн зардал | `city_tax_code.expense_account_id` (R2) | true |
| 8200 | Бусад орлого | Хялбаршуулсан НӨАТ-ын тооцоот хасалтын зөрүү (R2, ⚠ OQ-TAX-06) | true |
| 9100 | Орлогын албан татварын зардал | ААНОАТ-ын хуримтлалын ноорог (R2) | true |
| 8430 | Торгууль, алдангийн зардал | ААНОАТ-д хасагдахгүй зардал (анхдагч, CR-TAX-10) | true |

### 3.11 Тоолуур, source code, дугаарлалт, эрх, job

| Төрөл | Утга |
|---|---|
| Ledger тоолуур | `VAT_ENTRY` (R1), `CITY_TAX_ENTRY` (R2) — `platform.ledger_counter`, Tax writer нөөцөлнө (05 §3.3) |
| Source code | `SALES`, `PURCHASES`, `GENJNL`, `CASHRECJNL`, `PAYMENTJNL` (эх модуль), `VATSTMT` (НӨАТ-ын хаалт), `CITYTAXSTMT` (НХАТ-ын хаалт, R2), `REVERSAL` (хаалтыг цуцлах), `VATADJ` (орцын НӨАТ-ын татгалзал, CR-TAX-08; тэр хүртэл `PURCHASES`) |
| Хаалтын ваучерын дугаар | `GENERAL` журналын template-ийн `posting_no_series` (seed `GJ`, `GJ-2027-#####`), завсаргүй, жил бүр (D-C7). `tax_setup` (CR-TAX-03) өөр цуврал заавал түүнийг |
| Эрх (seed, `ERP_VAT`) | `ACTION tax.vat.settle` (хаалт, preview), `ACTION tax.vat_return.submit` (илгээсэн), `ACTION tax.vat_entry.confirm_deductible` (баталгаажуулах, татгалзах), `REPORT rpt.vat_return` (ТТ-03а, бүртгэл, тулгалт), `TABLE tax.vat_entry Rm`, `TABLE tax.vat_return_period RIM` |
| Эрх (шинэ, CR-TAX-09) | `ACTION tax.vat.reopen` (`ERP_PERIOD_REOPEN` — Owner), `ACTION tax.vat_return.export`, `REPORT rpt.vat_threshold`, `REPORT rpt.cit_helper` (R2) |
| Setup-ийн эрх (`ERP_SETUP`) | `TABLE tax.vat_*_posting_group`, `tax.vat_posting_setup`, `tax.vat_statement_*`, `tax.city_tax_code`, `tax.city_tax_setup` |
| Job (`integration.job_definition`, CR-TAX-11) | `tax.vat_threshold.check` (өдөр бүр, компани тус бүр), `tax.vat_return.export` (14 SCR-API-02) |

---
## 4. Бизнесийн дүрмүүд

Дүрэм бүр тестлэгдэнэ. "Шалгах" баганад хүлээн авах тест (§11.1) эсвэл golden scenario (§11.2)-ийг заав.

### 4.1 НӨАТ-ын тохиргоо

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-01 | `gen_posting_type ∈ {SALE, PURCHASE}` мөр бүр (VAT Bus., VAT Prod.)-ийн яг нэг `tax.vat_posting_setup` мөртэй, `blocked = false` байна. Байхгүй → `tax.vat_posting_setup_missing`, блоклосон → `tax.vat_posting_setup_blocked`. Ноорог хадгалахад анхааруулга (W-TAX-12), release/preview/posting-д алдаа. | R-VAT-01; FR-TAX-001 AC1; BR-SAL-24 | AT-TAX-001 |
| BR-TAX-02 | Posting-ийн B үед мөрийн `vat_calculation_type` нь setup-ийнхтэй ижил, A үед уншсан setup-ийн `row_version` өөрчлөгдөөгүй байна; эс бөгөөс `409 gl.setup_changed` (05 §5.2), клиент дахин илгээнэ. | R-VAT-02 | AT-TAX-002 |
| BR-TAX-03 | Setup мөрийн (Bus. код, Prod. код)-оор `tax.vat_entry` үүссэн бол `vat_calculation_type`-ийг өөрчлөхгүй (`tax.vat_calc_type_locked`). Бүлэг эсвэл setup мөрийг entry, мастер өгөгдөл, баримтад ашиглагдаж байвал устгахгүй, бүлгийн `code`-ыг өөрчлөхгүй (`tax.vat_setup_in_use`) — VAT entry бүлгийг **кодоор** snapshot хийдэг ба хаалт (§5.10) дансыг кодоор хайдаг тул. Хувийг өөрчилж болно; батлагдсан snapshot өөрчлөгдөхгүй. НӨАТ-ын данс (`sales_vat_account_id`, `purchase_vat_account_id`, `reverse_chrg_vat_account_id`)-ыг тухайн (Bus., Prod.) кодтой `closed = false`, `amount ≠ 0` (RC-д `amount + non_deductible_amount ≠ 0`) entry байхад өөрчлөхгүй (`tax.vat_account_change_open_entries`): хаалт одоогийн setup-ийн дансыг Кт/Дт хийдэг тул хуучин дансанд бичигдсэн НӨАТ хаагдахгүй үлдэнэ (R-VAT-29). `blocked = true` нь шинэ posting-ийг л хориглоно, хаалтад нөлөөлөхгүй. | R-VAT-03; R-VAT-29; FR-TAX-001 AC2 | AT-TAX-003 |
| BR-TAX-04 | Нэг VAT Bus. бүлэг дотор ижил `vat_identifier`-тэй мөрүүд ижил `vat_calculation_type`, ижил `vat_rate_param_code` (байхгүй бол ижил `vat_percent`)-тэй байна; хадгалахад `tax.vat_identifier_rate_conflict`. | R-VAT-04 | AT-TAX-004 |
| BR-TAX-05 | Данс: хувь > 0 NORMAL мөрийг борлуулалтад хэрэглэхэд `sales_vat_account_id`, худалдан авалтад `purchase_vat_account_id`; `REVERSE_CHARGE`-д `purchase_vat_account_id` ба `reverse_chrg_vat_account_id`; `FULL_VAT`-д `purchase_vat_account_id` заавал (`tax.sales_vat_account_missing`, `tax.purchase_vat_account_missing`, `tax.reverse_charge_account_missing`). Хадгалахад: данс `POSTING`, блоклогдоогүй, `gen_posting_type = 'NONE'`; борлуулалтын ба урвуу тооцооны данс `LIABILITIES`, худалдан авалтын данс `ASSETS` ангилалтай (`tax.vat_account_invalid`). | R-VAT-05; 05 BR-PST-15 | AT-TAX-005 |
| BR-TAX-06 | Ангилал ↔ eBarimt `taxType`-ийн харгалзаа нь D-E2 (DB CHECK). `VAT0`/`EXEMPT` (NORMAL) мөр анхдагч `ebarimt_tax_product_code`-той (CHECK). `TBD` түр кодтой мөрийг eBarimt-тэй компанид хэрэглэхэд W-TAX-11; барааны/мөрийн код заавал (12 MAP-22, VAL-09 `ebarimt.tax_product_code_missing`). Tax модуль энэ шалгалтыг давхардуулахгүй. | D-E2; FR-TAX-002 AC1; 12 MAP-22 | AT-TAX-006 |
| BR-TAX-07 | Тооцооны төрлийн хэрэглээ: борлуулалтын баримт ба `SALE` журнал → зөвхөн `NORMAL`; худалдан авалтын баримт ба `PURCHASE` журнал → `NORMAL`, `REVERSE_CHARGE`, `FULL_VAT`. Зөрвөл `tax.vat_calc_type_not_allowed`. | R-VAT-07a, R-VAT-07b; 12 MAP-21 | AT-TAX-007 |
| BR-TAX-08 | Шинэ компанийн setup-ийг seed (§3.3) үүсгэнэ; дахин дуудахад зөвхөн дутуу мөр нэмнэ, байгаа утгыг дарахгүй. | [db/seed/README.md](./db/seed/README.md) §10 | GS-VAT-001 |
| BR-TAX-09 | Худалдан авалтын мөрийн нийлүүлэгч VAT Bus. `IMPORT`, мөр `GL_ACCOUNT` (зардал) эсвэл үйлчилгээний бараа, VAT Prod. `VAT10` бол W-TAX-07 ("Урвуу тооцоо хийх үү? `IMPORT_SERVICE` сонгоно уу"). Батлахыг зогсоохгүй. | [db/seed/README.md](./db/seed/README.md) §12 #10; mn-tax §2.1 | AT-TAX-009 |

### 4.2 Хувь ба хуулийн параметр

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-10 | Хуулийн тоо (хувь, босго, хугацаа) кодонд бичигдэхгүй; бүгд `tax.tax_parameter`-ээс. Architecture test `No_statutory_literals_in_tax_code`: `Erp.Tax*`, `Erp.Sales*`, `Erp.Purchases*`-д `0.10m`, `10m` (хувь), `50000000`, `400000000` зэрэг literal байвал унана (тестийн өгөгдлөөс бусад). | D-E7; ADR-0021 "Сөрөг"; mn-tax R1 | AT-TAX-010 |
| BR-TAX-11 | `GetParameter(code, d)` нь `param_code = code`, `status <> 'superseded'`, `effective_from ≤ d ≤ coalesce(effective_to, ∞)` мөрийг (EXCLUDE-ийн дагуу ≤ 1) буцаана. Мөр байхгүй → `tax.parameter_not_effective` (API-д 404, тооцоололд 422). | D-E7; FR-TAX-017 AC1; 14 AT-API-047 | AT-TAX-011, GS-VAT-018 |
| BR-TAX-12 | `ParameterUse.Posting` (ledger-т бичигдэх дүн: НӨАТ/НХАТ-ын хувь, хялбаршуулсан НӨАТ-ын төлөх дүн) нь `status = 'verified'` шаардана, эс бөгөөс `tax.parameter_unverified`. `Report`/`Warning`/`Calendar` нь `unverified`-ийг зөвшөөрч, хариунд `isVerified = false`, UI-д ⚠ (W-TAX-08). Тенантын түвшинд override байхгүй: баталгаажуулалт = операторын migration. | legal-parameters "Lookup rule"; ADR-0021 #6 | AT-TAX-012 |
| BR-TAX-13 | `asOf` огноо: НӨАТ ба НХАТ-ын хувь → мөрийн `vat_date`; босго → үнэлэх огноо `d`; НӨАТ-ын үеийн (хялбаршуулсан) параметр → үеийн `starting_date`; ААНОАТ-ын хувь, шатлал, босго → санхүүгийн жилийн 01-01; хугацаа → тухайн үе. | mn-tax R1; ADR-0021 #4 | AT-TAX-013 |
| BR-TAX-14 | Хэрэгжих хувь `r` = `vat_rate_param_code` байвал `round(GetParameter(code, vat_date, Posting).value_numeric × 100, 5)`, эс бөгөөс `vat_percent`. Хувийг баримтын мөрт (`vat_percent`) ба VAT entry-д (`vat_percent`, CR-TAX-01-ийн `tax_parameter_id`) snapshot хийнэ. | FR-TAX-003 AC1; BR-SAL-25; R-VAT pitfall 6 | AT-TAX-014 |
| BR-TAX-15 | Ноорог хадгалах, release, preview, posting бүр мөрийн `vat_date`-ийн хувийг дахин уншина; posting нь дахин тооцсон хувийг ашиглана (06 BR-SAL-38). Үл хамаарах: нэхэмжлэх цуцлах кредит нот нь эх snapshot-ыг ашиглана (06 BR-SAL-74). | R-VAT pitfall 6; 06 BR-SAL-74 | AT-TAX-015 |
| BR-TAX-16 | `tax.tax_parameter` тенантад зөвхөн унших (RLS-гүй глобал, `app_user`-т SELECT). Өөрчлөлт нь `legal_basis` ба `source_url`-тай migration; оруулахад давхцал DB-д татгалзагдана (EXCLUDE, `23P01`). | FR-TAX-017 AC2; 13 | AT-TAX-016 |

### 4.3 Баримтын НӨАТ-ын тооцоолол

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-17 | Баримтын НӨАТ, НХАТ, хасагдахгүй НӨАТ-ыг **нэг цэвэр функц** `ITaxCalculator.ComputeDocument` тооцно. UI хадгалалт, release, preview, posting, PDF, eBarimt бүгд түүний үр дүнг ашиглана; мөрийн кэшлэсэн утгыг шууд бичихгүй. | bc-vat §7 #3; R-VAT-09; pitfall 18 | AT-TAX-017 |
| BR-TAX-18 | Бүлгийн түлхүүр = (`vat_identifier`, `vat_calculation_type`, `city_tax_code_id` — зөвхөн үнэ НӨАТ-тэй баримтад, тэмдэг). Тэмдэг = `CLA ≥ 0`. Дараалал: identifier (ordinal) → тооцооны төрөл → НХАТ-ын код → **сөрөг бүлэг эхэлж**. Сөрөг бүлгийн бөөрөнхийллийн үлдэгдэл (`exact − VAT`) ижил (identifier, төрөл, код)-ын эерэг бүлэгт нэмэгдэнэ. | R-VAT-08, R-VAT-13; D-E3; FR-TAX-006 | AT-TAX-018, GS-VAT-013 |
| BR-TAX-19 | Үнэ НӨАТ-гүй: `VAT_g = RV(Base_g × r/100 + carry)`. Үнэ НӨАТ-тэй: `VAT_g = RV(G_g × r/(100 + r + c) + carry)`, `c` = бүлгийн НХАТ-ын хувь (НХАТ-гүй бол 0); `Base_g = G_g − VAT_g − CT_g`. | R-VAT-10, R-VAT-11; FR-TAX-005 AC1/AC2; city_tax.base | AT-TAX-019, GS-VAT-002 |
| BR-TAX-20 | Бүлгийн НӨАТ-ыг мөрүүдэд `line_no` дарааллаар **running remainder**-ээр (BC `DivideAmount`) хуваарилна: `rem += VAT_g × CLA_i/ΣCLA; VAT_i = R(rem); rem −= VAT_i`. Инвариант: бүлэг бүрд `Σ VAT_i = VAT_g`; баримтад `Σ (AIV_i − Amount_i) = Σ VAT_g`; eBarimt-ийн барааны НӨАТ-ын нийлбэр = баримтын НӨАТ. Нэг функц `MoneyMath.Allocate` (Z-TAX-09). | D-E3 ⚠; R-VAT-08; FR-TAX-004 AC1/AC2 | AT-TAX-020, GS-VAT-001 |
| BR-TAX-21 | Дүн `P`-д; НӨАТ `RV` (`company_setup.vat_rounding_type`: `NEAREST` анхдагч, `UP`/`DOWN` абсолют утгаар); суурь, хуваарилалт, НХАТ, хасагдахгүй хэсэг `R` (Nearest). Дунд утга тэгээс холдоно (`MidpointRounding.AwayFromZero`). | R-VAT-12; D-C2; ADR-0006 | AT-TAX-021 |
| BR-TAX-22 | `CLA = 0` мөр (тоо 0, 100 % хөнгөлөлт) бүлэгт орохгүй, НӨАТ 0. | R-VAT pitfall 14 | AT-TAX-022 |
| BR-TAX-23 | `REVERSE_CHARGE` (худалдан авалт): баримтын мөрийн НӨАТ = 0 (нийлүүлэгчид цэвэр дүн төлнө, `AIV = Amount`). Өөрөө тооцох НӨАТ `SA_g = RV(Base_g × r/100)`-ийг **баримтын түвшинд бүлгээр** тооцож мөрүүдэд running remainder-ээр хуваарилна (BC-ийн buffer мөр бүрийн тооцоог хялбарчилсан). Үнэ НӨАТ-тэй горимд ч мөрийн дүнг цэвэр гэж үзнэ. | R-VAT-07a, R-VAT-16; pitfall 19 | AT-TAX-023, GS-VAT-010 |
| BR-TAX-24 | `FULL_VAT` (гаалийн НӨАТ, худалдан авалт/журнал): `Amount = 0`, `VAT = CLA`, `AIV = CLA`, суурь 0. Мөрийн данс = setup-ийн `purchase_vat_account_id` (`tax.full_vat_account_mismatch`); composer тэр мөрийг `SystemDerived` болгоно (1300-ийн `direct_posting = false`-ийг давна). Хасагдахгүй хувь > 0 бол `tax.full_vat_non_deductible_not_allowed` (өртөгт NOVAT мөрөөр бичнэ). | R-VAT-07b; FR-TAX-021; 05 §6.4 | AT-TAX-024, GS-VAT-011 |
| BR-TAX-25 | Хасагдахгүй хувь (худалдан авалт, NORMAL ба REVERSE_CHARGE): `nd% = 100` хэрэв компани `vat_date`-нд НӨАТ төлөгч биш (`NON_VAT_COMPANY`), хялбаршуулсан горимд (`SIMPLIFIED_REGIME`, R2), эсвэл мөр `non_deductible_reason`-тэй; эс бөгөөс setup-ийн `non_deductible_vat_percent`. `VAT_nd_i = R(VAT_i × nd%/100)` (урвуу тооцоонд `SA_i`), `Base_nd_i = R(Amount_i × nd%/100)`. Борлуулалтад үргэлж 0. | FR-TAX-010; D-E5; mn-tax R5 | AT-TAX-025, GS-VAT-005 |
| BR-TAX-26 | НӨАТ-ын зөрүү (VAT difference): зөвхөн худалдан авалтын баримт (`purchase_setup.allow_vat_difference`) ба журнал (`journal_template.allow_vat_difference`); бүлгийн түвшинд `abs(diff_g) ≤ general_ledger_setup.max_vat_difference_allowed` (анхдагч 0 = хориотой). `VAT_g' = VAT_g + diff_g`-ийг хуваарилж, мөрийн `vat_difference`-д хуваарилсан зөрүүг хадгална. Борлуулалтад R1-д 0 (06 BR-SAL-29). Алдааны код эх модулийнх (Tax шинэ код нэмэхгүй): баримтад 07-ийн `purchase.vat_difference_not_allowed`, `purchase.vat_difference_exceeds_max`; журналд 05-ийн `gl.vat_difference_not_allowed`, `gl.vat_difference_too_large` (`TaxDocument.Origin`-оор сонгоно). | R-VAT-14; bc-vat §7 #5; 14 Q17 | AT-TAX-026 |
| BR-TAX-27 | НХАТ-ын тооцоо §4.12-т (R2). R1-д мөрийн `city_tax_code_id` бөглөгдсөн бол `tax.city_tax_not_enabled`. | D-E6; DECISIONS §H | AT-TAX-089 |

### 4.4 VAT entry ба posting

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-28 | `gen_posting_type ∈ {SALE, PURCHASE}` buffer мөр бүрд **нэг** VAT entry (0 %-ийн мөрөнд ч: суурь ≠ 0, дүн 0). VAT G/L мөр: NORMAL — хасагдах НӨАТ ≠ 0 бол 1 мөр (2300 эсвэл 1300); REVERSE_CHARGE — 2 мөр (1300 Дт хасагдах хэсэг, 2305 Кт бүтэн); FULL_VAT — тусдаа мөргүй (суурь мөр өөрөө 1300). | R-VAT-18, R-VAT-20; FR-TAX-007 AC1; 05 BR-PST-24, BR-PST-36 | AT-TAX-028, GS-VAT-001, GS-VAT-003 |
| BR-TAX-29 | Тэмдэг: борлуулалтын нэхэмжлэх `base`, `amount` < 0; борлуулалтын кредит нот > 0; худалдан авалтын нэхэмжлэх > 0; худалдан авалтын кредит нот < 0; `non_deductible_*` ижил тэмдэгтэй; SETTLEMENT = −Σ бүлэг. | R-VAT-19; FR-TAX-006 AC1 | AT-TAX-029 |
| BR-TAX-30 | VAT entry snapshot: хувь, identifier, тооцооны төрөл, **хэрэгжих** ангилал ба `taxType`, 4 бүлгийн код, харилцагч (`bill_to_pay_to_*`, `party_tin`, `country_code`), баримтын талбар, source code, шалтгаан. `party_tin` нь хуулийн этгээдийн ТТД эсвэл гадаадын `foreign_tax_id`; хувь хүний регистр бичигдэхгүй. | R-VAT-21; 13 §10.6 | AT-TAX-030 |
| BR-TAX-31 | `gl_entry_no` = суурь G/L entry; `tax.gl_entry_vat_entry_link`-д (суурь, VAT) мөр. `gl_entry.vat_amount` = суурь мөрийн **хасагдах** НӨАТ (борлуулалтад тооцсон НӨАТ). Buffer түлхүүр нь хасагдахгүй шалтгаан ба НХАТ-ын кодоор тусгаарлагдана (Z-TAX-15). | R-VAT-20; R-GL-POSTING-33 | AT-TAX-031 |
| BR-TAX-32 | VAT entry-ийн `vat_date`, `base`, `amount`, `non_deductible_*`, snapshot хэзээ ч өөрчлөгдөхгүй. Зөвхөн `closed`, `closed_by_entry_no`, `vat_return_period_id`, `deductible_confirmed(_at/_by)`, `supplier_ebarimt_id`, `reversed`, `reversed_by_entry_no` нь `platform.fn_ledger_update`-ээр (бусад нь `ERL01`). VAT date-ийг дараа засах (BC CU338) байхгүй. | D-C4; R-VAT-22 (хассан); 910 `ledger_guard` | AT-TAX-032 |
| BR-TAX-33 | `entry_no`-г Tax writer `platform.fn_next_entry_no('VAT_ENTRY', n)`-ээр блокоор (writer order 10) олгоно; register-ийн `from_vat_entry_no..to_vat_entry_no` = энэ муж. | 05 BR-PST-28, BR-PST-37 | AT-TAX-033 |
| BR-TAX-34 | VAT entry-тэй гүйлгээг буцаах нөхцөл: entry бүр `closed = false`, `vat_return_period_id IS NULL`, `vat_date`-ийн НӨАТ-ын үе `OPEN`; эс бөгөөс `409 gl.reversal_vat_settled`. Толин тусгал entry: `base`, `amount`, `non_deductible_*`, `vat_difference` эсрэг тэмдэгтэй, ижил `vat_date` ба snapshot, `deductible_confirmed` ба `supplier_ebarimt_id` хуулна, `reversed = true`, `reversed_entry_no`; эх entry `reversed = true`, `reversed_by_entry_no`. | R-VAT-24; 05 BR-PST-46, BR-PST-49 | AT-TAX-034 |
| BR-TAX-35 | Баримтаас үүссэн НӨАТ-ыг кредит нотоор засна (D-D5). Хэсэгчилсэн кредит нот өөрийн мөрөөс НӨАТ-ыг дахин тооцно; эх мөрийн хуваарилсан НӨАТ-аас 1 нэгжээр (`P`) зөрж болно (BC-тэй ижил). Цуцлалтын кредит нот нь яг тэнцүү (06 BR-SAL-74). | R-VAT pitfall 3; D-D5, D-F6 | AT-TAX-035 |
| BR-TAX-36 | Худалдан авалтын кредит нотын VAT entry: `supplier_ebarimt_id` = засаж буй нэхэмжлэхийн ДДТД (эсвэл нийлүүлэгчийн буцаалтын баримтын ДДТД); `deductible_confirmed = true` хэрэв засаж буй нэхэмжлэхийн PURCHASE entry бүгд баталгаажсан, эс бөгөөс `false` бөгөөд эх нэхэмжлэхийг баталгаажуулахад хамт баталгаажна (BR-TAX-49). | D-E4; 040 `ix_vat_entry__supplier_receipt` | AT-TAX-036 |
| BR-TAX-37 | Борлуулалтын баримт бүрд `Σ VAT entry.amount` (тэмдгийг эргүүлсэн) = толгойн `vat_amount` = eBarimt-ийн `totalVAT` (бөөрөнхийллийн мөргүй үед). | 12 AMT-05, AMT-08; BR-SAL-23 | AT-TAX-037 |
| BR-TAX-38 | Hash chain (13 CR-15) хэрэгжсэн үед Tax нь `ILedgerHashContributor`-оор `tax.vat_entry`-ийн canonical мөрийг (`entry_no`, `entry_type`, `vat_date`, `base`, `amount`, `non_deductible_*`, бүлгийн код, `gl_entry_no`) register-ийн hash-д оруулна. | 02 §4.5, §8.7 | CR-15-ийн дараа |

### 4.5 НӨАТ-ын огноо ба үе

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-39 | `vat_date` анхдагч = `posting_date`. Борлуулалтын нэхэмжлэхэд `vat_date = posting_date` (06 BR-SAL-34). Худалдан авалтын баримт ба журналд `vat_date ≤ posting_date` байж болно (хоцорч ирсэн нэхэмжлэх), хэзээ ч `posting_date`-ээс хойш биш (`tax.vat_date_after_posting_date`). | D-E9; FR-TAX-008 AC1; R-VAT-06 | AT-TAX-039, GS-VAT-008 |
| BR-TAX-40 | Компани `vat_date`-нд НӨАТ төлөгч бол тэр огноог хамарсан `tax.vat_return_period` байх (`tax.vat_period_missing`) ба `OPEN` байх (`tax.vat_period_closed`; DB `ERV01`). SETTLEMENT entry үүнээс чөлөөлөгдөнө. НӨАТ төлөгч бус компанид үе байхгүй бол алдаагүй. | D-E9; FR-TAX-008 AC2; 03 INV-17; 13 P4 | AT-TAX-040, GS-VAT-008 |
| BR-TAX-41 | R2: хэрэглэгчийн VAT огнооны цонх (`platform.user_setup.allow_vat_date_from/to`) нь компанийн дүрмийг нарийсгана (`tax.vat_date_outside_user_window`). | 13 P5; R-VAT-23 | AT-TAX-041 |
| BR-TAX-42 | НӨАТ-ын үе: санхүүгийн жил бүрийн 12 сар (`tax.fn_mn_ensure_vat_return_periods(year)` — provisioning ба санхүүгийн жил үүсгэх job дуудна). `due_date` = дараагийн сарын `vat.return_due_day` (10). Хялбаршуулсан горимд улирал (R2, BR-TAX-98). Үеийн огноог зөвхөн `OPEN` ба entry-гүй үед засна. | FR-TAX-015; seed `mn_20_tax.sql`; mn-tax §2.3 | AT-TAX-042 |
| BR-TAX-43 | Төлөвийн машин: `OPEN` → `CLOSED` (`:close`), `CLOSED` → `OPEN` (`:reopen`), `CLOSED` → `SUBMITTED` (`:submit`, эцсийн, DB `ERP02`). Ерөнхий PATCH төлвийг өөрчлөхгүй. | 13 SEC-AZ-18; 910 `trg_vat_return_period_status` | AT-TAX-043 |
| BR-TAX-44 | Дараалал: P-г хаахад НӨАТ-ын бүртгэлийн огнооноос (`vat_registered_from`) хойш дуусах өмнөх бүх үе `CLOSED`/`SUBMITTED` (`tax.vat_period_previous_open`). Дахин нээх нь зөвхөн хамгийн сүүлийн `CLOSED` үед (дараагийн үе нь `OPEN`), `SUBMITTED` үеийг нээхгүй (`tax.vat_period_reopen_not_latest`, `tax.vat_period_submitted`). | R-VAT pitfall 8; FR-TAX-015 | AT-TAX-044 |

### 4.6 Орцын НӨАТ-ын хасалт ба баталгаажуулалт

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-45 | `NORMAL`, `amount ≠ 0` PURCHASE entry нь зөвхөн `deductible_confirmed = true` үед НӨАТ-ын тайланд хасагдана. NORMAL entry-г баталгаажуулахад ДДТД заавал (DB CHECK). | D-E4 ⚠; FR-TAX-009 AC1; 03 INV-16 | AT-TAX-045 |
| BR-TAX-46 | Posting үеийн утга: NORMAL худалдан авалт — `true` зөвхөн ДДТД бөглөгдсөн, хүсэлт `confirmInputVat = true`, хэрэглэгч `ACTION tax.vat_entry.confirm_deductible` эрхтэй, хасагдах дүн ≠ 0 үед (07 BR-PUR-47); бусад үед `false` (дараа нь гараар, R2-т импортоор баталгаажуулна, 12 PUR-12); `REVERSE_CHARGE` — `true` (баримтаар); `FULL_VAT` — үргэлж `true`: мэдүүлгийн дугаар (`external_document_no`/`vendor_invoice_no`) ба огноо (`document_date`) posting-д **заавал** (BR-TAX-62, `tax.customs_declaration_required`), учир нь `external_document_no`, `document_date` нь VAT entry-д дараа нь өөрчлөгдөх боломжгүй (BR-TAX-32) ба `ConfirmDeductibleAsync` зөвхөн NORMAL entry-г баталгаажуулна — `false` FULL_VAT entry хэзээ ч хасагдахгүй, хаагдахгүй үлдэх байсан; `amount = 0` entry — `false` (хасах зүйлгүй). | D-E4; FR-TAX-021 AC1; FR-TAX-020 | AT-TAX-046 |
| BR-TAX-47 | ДДТД `^[0-9]{33}$` (`ebarimt.purchase_receipt_ddtd_invalid` — 12 ба 07 BR-PUR-42-ын код). Нэг ДДТД-ийг компанид нэг л баримтад бүртгэх нь `ebarimt.purchase_receipt UNIQUE (company_id, ddtd)` (`ebarimt.purchase_receipt_duplicate`). | FR-TAX-009 AC3; 12 PUR-02 | AT-TAX-047 |
| BR-TAX-48 | ДДТД-гүй батлах бодлого нь Purchases-ийнх (07 BR-PUR-46): хасагдах НӨАТ-тай (`NORMAL`, `Σ(VAT − ND) ≠ 0`) баримт ДДТД-гүй бол `require_supplier_ebarimt = true` үед хүсэлт `missingEbarimt ∈ {PENDING, NON_DEDUCTIBLE}`-ийг заавал агуулна (`purchase.supplier_ebarimt_required`); `NON_DEDUCTIBLE` → Tax мөр бүрд `NO_EBARIMT` шалтгаанаар `nd% = 100` (BR-TAX-25) тооцно; `PENDING` → `deductible_confirmed = false`. Tax-ийн `tax.supplier_receipt_id_required` нь зөвхөн баталгаажуулалтад ДДТД дутуу үед. | 07 BR-PUR-46; 12 PUR-01; mn-tax R5 | AT-TAX-048 |
| BR-TAX-49 | Баталгаажуулах (`ACTION tax.vat_entry.confirm_deductible`): батлагдсан худалдан авалтын нэхэмжлэхийн (ба түүнийг засах кредит нотын) `NORMAL`, `amount ≠ 0`, `NOT deductible_confirmed`, `NOT closed`, `NOT reversed`, `vat_return_period_id IS NULL` PURCHASE entry бүрд `deductible_confirmed = true`, `_at`, `_by`, `supplier_ebarimt_id` (хоосон бол). ДДТД-ийн нийцэл **нэхэмжлэхийн** entry-ээр шалгагдана: нэхэмжлэхийн entry-д өөр ДДТД бүртгэлтэй бол `tax.supplier_receipt_id_mismatch`; кредит нотын entry өөрийн (нийлүүлэгчийн буцаалтын баримтын) ДДТД-тэй бол түүнийгээ хадгална, хоосон бол нэхэмжлэхийн ДДТД-ийг авна (BR-TAX-36). Дараа нь `IPurchaseReceiptRegistry.MarkConfirmedAsync`. Аль хэдийн баталгаажсан → no-op (идемпотент). `vat_date`-ийн үе хаагдсан байсан ч зөвшөөрнө: дараагийн хаагдах нээлттэй үеийн тайланд орно (W-TAX-10). | D-E4; FR-TAX-009 AC2; 12 PUR-04, PUR-05 | AT-TAX-049, GS-VAT-015 |
| BR-TAX-50 | "Баталгаажаагүй орцын НӨАТ" = PURCHASE, NORMAL, `amount ≠ 0`, `NOT deductible_confirmed`, `NOT closed`, `NOT reversed`, `vat_return_period_id IS NULL`. ТТ-03а-д орохгүй, тусдаа жагсаалт ба cue (15 CUE-14). | FR-TAX-009 AC1; FR-TAX-013 AC1 | AT-TAX-050 |
| BR-TAX-51 | Хасалтаас татгалзах (R1 · Should, `tax.vat_entry.confirm_deductible`): BR-TAX-50-ийн entry-үүдийг хасагдахгүй болгох **залруулгын ваучер**: Дт суурь мөрийн данс (G/L–VAT холбоосоор, ижил dimension set), Кт `purchase_vat_account_id`; эх entry бүрд эсрэг VAT entry (`base = −base`, `amount = −amount`, `non_deductible_base = +base`, `non_deductible_amount = +amount`, шалтгаан `REJECTED`/`NO_EBARIMT`), хоёулаа `closed = true` бөгөөд `closed_by_entry_no`-оор бие биеэ заана. Source `VATADJ` (CR-TAX-08). Баталгаажсан, хаагдсан, оноогдсон entry-д `tax.deduction_reject_not_allowed`. | mn-tax R5 (`REJECTED`); FR-TAX-010; 12 §16.1 | AT-TAX-051, GS-VAT-016 |
| BR-TAX-52 | Хасагдахгүй шалтгаан (CR-TAX-02): хэрэглэгч сонгох — `PASSENGER_CAR`, `PERSONAL_USE`, `EXEMPT_RELATED`, `NO_EBARIMT`; систем тавих — `NON_VAT_COMPANY`, `SIMPLIFIED_REGIME`, `REJECTED`. Мөрийг хасагдахгүй гэж тэмдэглэвэл шалтгаан заавал (`tax.non_deductible_reason_required`); системийн шалтгааныг гараар сонгохгүй (`tax.non_deductible_reason_invalid`). | FR-TAX-010; mn-tax R5; CMP-019 | AT-TAX-052 |
| BR-TAX-53 | Хасагдахгүй НӨАТ нь суурь мөрийн дансанд (зардал, ҮХ, бараа) нэмэгдэнэ: суурь G/L мөр = цэвэр + `VAT_nd`; 1300-д бичигдэхгүй. | FR-TAX-010 AC1; 05 §5.7.2; 11 INV-R-11 | AT-TAX-053, GS-VAT-005 |

### 4.7 НӨАТ төлөгч бус горим (D-E5 ⚠)

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-54 | `IsVatRegistered(d) = company_setup.vat_registered AND (vat_registered_from IS NULL OR d ≥ vat_registered_from)` (CR-TAX-04-ийн дараа профайлын огноотой мөрөөс). | D-E5; 06 BR-SAL-28 | AT-TAX-054 |
| BR-TAX-55 | `NOT IsVatRegistered(vat_date)` үед: **борлуулалт** — хувь 0, хэрэгжих ангилал `NOVAT`, `taxType` = `ebarimt_setup.non_vat_payer_tax_type` (12 SCR-04; байхгүй бол `NOT_VAT`), VAT entry суурь ≠ 0, дүн 0, `vat_identifier` = setup-ийнх (босгод, BR-TAX-83); **худалдан авалт** — нийлүүлэгчийн НӨАТ бүхэлдээ хасагдахгүй (`NON_VAT_COMPANY`); НӨАТ-ын тайлан ба хаалтын үйлдэл → `tax.company_not_vat_registered` (R2: НХАТ төлөгч бол `:close` нь зөвхөн НХАТ-ын хаалт, BR-TAX-72). | D-E5 ⚠; FR-TAX-011 AC1/AC2; 12 SET-09 | AT-TAX-055, GS-VAT-006 |
| BR-TAX-56 | `vat_registered`-ийг өөрчлөх (компанийн тохиргоо, `ERP_SETUP`): `true` болгоход `vat_registered_from` заавал (`tax.vat_registered_from_required`). Tax handler: `vat_registered_from`-ийн оноос одоогийн он хүртэлх НӨАТ-ын үеийг үүсгэнэ; seed-ээр 100 тавигдсан setup-ийн `non_deductible_vat_percent`-ийг 0 болгох санал (wizard-аар баталгаажуулна); батлагдсан entry-д нөлөөлөхгүй; тухайн үед W-TAX-09. `vat_registered_from`-ийг (`true` хэвээр) өөрчлөхөд хуучин ба шинэ огнооны аль бага нь болон түүнээс хойш `CLOSED`/`SUBMITTED` НӨАТ-ын үе, эсвэл `vat_date ≥ min(хуучин, шинэ)` SALE/PURCHASE entry байвал татгалзана (`tax.vat_registered_from_locked`) — эс бөгөөс хаагдсан үеийн scope (BR-TAX-57) ба батлагдсан борлуулалтын хувь (BR-TAX-55) хойноос өөрчлөгдөнө. | D-E5; [db/seed/README.md](./db/seed/README.md) §6 | AT-TAX-056 |
| BR-TAX-57 | НӨАТ-ын тайлан ба хаалтын scope нь `vat_date ≥ vat_registered_from` entry л. Бүртгэлийн огнооноос өмнө дууссан үеийг хаах шаардлагагүй (BR-TAX-44). | D-E5 | AT-TAX-057 |
| BR-TAX-58 | НӨАТ төлөгчөөс хасагдах (deregistration) огноо нь CR-TAX-04-ийн профайлаар (R2). R1-д `IsVatRegistered` нь "хүртэл" огноогүй тул `vat_registered = false` болгоход бүх огноо (өнгөрсөн ч) НӨАТ төлөгч бус гэж үнэлэгдэж, өмнөх үеийг хаах (BR-TAX-72) боломжгүй болно. Иймд R1-д `false` болгох урьдчилсан нөхцөл: `SALE`/`PURCHASE` entry-тэй (`amount ≠ 0` эсвэл `base ≠ 0`, `vat_date ≥ vat_registered_from`) НӨАТ-ын үе бүр `CLOSED` эсвэл `SUBMITTED` байх; эс бөгөөс `tax.vat_deregistration_periods_open` (жагсаалттай). Дараа нь батлагдсан entry өөрчлөгдөхгүй; шинэ борлуулалт BR-TAX-55-аар; entry-гүй `OPEN` үеийг устгаж болно (DB `ERP02` зөвшөөрнө). | ADR-0021 #2; mn-accounting §8 | AT-TAX-056, AT-TAX-058 |

### 4.8 Урвуу тооцоо ба импорт

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-59 | Резидент бусаас авсан үйлчилгээ, ажил: VAT Bus. `IMPORT` × VAT Prod. `IMPORT_SERVICE` (`REVERSE_CHARGE`, 2305). Posting: Дт зардал (цэвэр + хасагдахгүй хэсэг), Дт 1300 (хасагдах), Кт 2305 (бүтэн), Кт өглөг (цэвэр). | R-VAT-07a; FR-TAX-020 AC1; mn-tax §2.1, R8 | AT-TAX-059, GS-VAT-010 |
| BR-TAX-60 | Урвуу тооцооны entry posting үед `deductible_confirmed = true`. Хаалт: Кт 1300 хасагдах, Дт 2305 бүтэн, зөрүү (хасагдахгүй хэсэг) 2310-д төлөх дүнд нэмэгдэнэ. | R-VAT-31 (өргөтгөсөн); seed ТТ-03а мөр 13 | AT-TAX-060 |
| BR-TAX-61 | Импортын бараа: гадаад нийлүүлэгчийн нэхэмжлэх (`IMPORT` × бараа) = NOVAT 0 %. Импортын НӨАТ зөвхөн гаалийн мөрөөр (`CUSTOMS_VAT`, `FULL_VAT`). | [db/seed/README.md](./db/seed/README.md) §6; mn-tax §2.5 | AT-TAX-061 |
| BR-TAX-62 | Гаалийн НӨАТ-ыг (а) "гааль" нийлүүлэгчийн (`CUSTOMS` загвар → 2365) худалдан авалтын нэхэмжлэхийн 1300 дээрх `CUSTOMS_VAT` мөрөөр, эсвэл (б) төлбөрийн журналын мөрөөр (данс 1300, `PURCHASE`, `CUSTOMS_VAT`, харьцсан данс банк) оруулна. Мэдүүлгийн дугаар → `vendor_invoice_no`/`external_document_no`, огноо → `document_date`; `FULL_VAT` мөртэй баримт/журналын мөрийг **батлахад** хоёулаа заавал (`tax.customs_declaration_required`, VAT writer-ийн `ValidateLockedAsync`, §5.6), entry `deductible_confirmed = true` (BR-TAX-46). Гаалийн үнэ, татварын задаргааг CR-TAX-05 хадгална. | FR-TAX-021; mn-tax R7; R-VAT pitfall 9 | AT-TAX-062, GS-VAT-011 |
| BR-TAX-63 | Гаалийн татвар, онцгой албан татвар нь барааны өртөгт (1400) эсвэл зардалд, `NOVAT` мөрөөр. | mn-tax R7; 11 INV-R-11 | AT-TAX-063 |
| BR-TAX-64 | Резидент бусад төлөх төлбөрийн суутган татвар (20 %) хүрээнээс гадуур (01 §7): систем автоматаар тооцохгүй, урвуу тооцооны нэхэмжлэхэд мэдээллийн тэмдэглэл л харуулна. | mn-tax R12; 01 §7 | — |

### 4.9 НӨАТ-ын тайлан (ТТ-03а)

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-65 | Тайлан = `tax.vat_statement_line`-ийн загвар (seed `VAT`/`TT03A`, §3.7). Мөрийн шалгалт (хадгалахад): `ROW_TOTALING`-д `OPPOSITE_SIGN` хориотой; `row_totaling` нь `a\|b` ба `a..b` (`row_no`-оор); давталтгүй, гүн ≤ 6 (`tax.vat_statement_row_cycle`); `VAT_ENTRY_TOTALING`-д `gen_posting_type ∈ {SALE, PURCHASE}` ба `amount_type ≠ NONE` (`tax.vat_statement_line_invalid`). NULL бүлэг = бүх бүлэг. | R-VAT-26, R-VAT-27; D-E8; FR-TAX-013; Z-TAX-10 | AT-TAX-065 |
| BR-TAX-66 | **Scope** (VAT_ENTRY_TOTALING-ийн entry-ийн олонлог): P нь `OPEN` бол — `vat_return_period_id IS NULL`, `entry_type ∈ {SALE, PURCHASE}`, `vat_date ≤ P.ending_date`, `vat_date ≥ coalesce(vat_registered_from, −∞)`, BR-TAX-67-ийн эрхтэй entry ("энэ хаалтад орох"); P нь `CLOSED`/`SUBMITTED` бол — `vat_return_period_id = P.id`. SETTLEMENT entry хэзээ ч орохгүй. | Z-TAX-13; R-VAT-28 (өөрчилсөн) | AT-TAX-066, GS-VAT-007 |
| BR-TAX-67 | Хаалт/тайланд орох эрх: SALE — үргэлж; PURCHASE — `deductible_confirmed` ЭСВЭЛ `amount = 0` ЭСВЭЛ `closed` (татгалзлын хос) ЭСВЭЛ `reversed`. | D-E4; BR-TAX-51 | AT-TAX-067 |
| BR-TAX-68 | `ACCOUNT_TOTALING`: `gl_account.no` шүүлтэд таарах дансны `Σ gl_entry.amount`, `vat_date ∈ [P.starting_date, P.ending_date]` (scope-оос үл хамаарна). | R-VAT-26 (нэмэлт) | AT-TAX-068 |
| BR-TAX-69 | Тооцоо зөвхөн уншина (хадгалахгүй). Хариунд мөр бүрийн утга, хэвлэх утга, drill-down шүүлт (`vatEntryFilter`), `lastVatEntryNo` (компанийн хамгийн их `entry_no`) ба `scopeVersion`. `scopeVersion` = `lower(hex(sha256("{lastVatEntryNo}\|{n}\|{Σbase}\|{Σamount}\|{Σnon_deductible_amount}\|{maxConfirmedAt}")))`-ийн эхний 16 тэмдэгт, энд `n`, `Σ` нь BR-TAX-66-ийн scope-ийн entry-ээр, `maxConfirmedAt` = scope-ийн `max(deductible_confirmed_at)` (ISO-8601 UTC, байхгүй бол `-`), дүн нь `numeric`-ийн canonical текст (4 орон). Шинэ entry (`lastVatEntryNo`) зөвхөн **нэмэлтийг** илрүүлнэ; баталгаажуулалт/цуцлалт entry нэмэхгүйгээр scope-ийг өөрчилдөг тул `scopeVersion` шаардлагатай. Хаалт ба экспорт нь клиентийн `expectedScopeVersion`-ийг (байхгүй бол `expectedLastVatEntryNo`-г) компанийн advisory lock-ийн дор дахин тооцсон утгатай харьцуулна: зөрвөл `409 tax.vat_statement_stale`. | 15 UX-VAT-02, UX-VAT-03, A-11 | AT-TAX-069 |
| BR-TAX-70 | ТТ-03а-5 (худалдан авалт) ба ТТ-03а-6 (борлуулалт) нь ижил scope-оос (§5.12). Бүртгэлийн нийлбэр = тайлангийн харгалзах мөр. XLSX/CSV экспорт нь async job `tax.vat_return.export` (202). | D-E8; FR-TAX-014 AC1; mn-tax R9, R18; 02 §9.6 | AT-TAX-070 |
| BR-TAX-71 | eBarimt-тэй тулгалт: үеийн SALE scope-ийн баримт бүрийн (`document_no`) НӨАТ ба eBarimt-ийн `SUCCESS` баримтын `total_vat`-ийг харьцуулна; баримтгүй, `SUCCESS` биш, дүн зөрсөн баримтыг жагсаана. Хаалтыг зогсоохгүй (W-TAX-06). | FR-TAX-016 AC1; REQ-ACC-16; mn-tax R9 | AT-TAX-071 |

### 4.10 НӨАТ-ын хаалт, илгээх, дахин нээх

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-72 | `:close` урьдчилсан нөхцөл (бүгдийг цуглуулна): `ACTION tax.vat.settle`; `IsVatRegistered(P.ending_date)`; P `OPEN`; BR-TAX-44; бизнесийн огноо ≥ `P.ending_date` (`tax.vat_period_not_ended`); `postingDate ≥ P.ending_date` (`tax.vat_settlement_date_invalid`), тэр огноо нээлттэй нягтлан бодох үед ба компанийн цонхонд (`gl.period_closed`, `gl.posting_date_outside_window`); хаалтын данс BR-TAX-76; `expectedScopeVersion`/`expectedLastVatEntryNo` (BR-TAX-69). R2: компани `IsVatRegistered(P.ending_date) = false` боловч НХАТ идэвхтэй (`city_tax_payer AND city_tax_setup.enabled`) бол `:close` нь зөвхөн НХАТ-ын хаалтыг (`V2`, BR-TAX-95) хийнэ — ТТ-03а тооцогдохгүй, VAT entry оноогдохгүй; НХАТ-ын төлөгчид НӨАТ-ын үе (`fn_mn_ensure_vat_return_periods`) үүснэ (OQ-TAX-09). Анхааруулга: W-TAX-05 (баталгаажаагүй орцын НӨАТ), W-TAX-06 (eBarimt). | R-VAT-32; FR-TAX-015; 15 UX-VAT-05 | AT-TAX-072 |
| BR-TAX-73 | Хаалтын алгоритм (§5.10): scope-ийн (BR-TAX-66) `closed = false` entry-ийг (Bus. код, Prod. код, төрөл)-өөр бүлэглэнэ. `Σamount ≠ 0` (урвуу тооцоонд `Σamount + Σnon_deductible_amount ≠ 0`) бүлэг бүрд: VAT дансны G/L мөр (`gen_posting_type = SETTLEMENT`, бүлгийн код) ба нэг SETTLEMENT VAT entry (`base = −Σbase`, `amount = −Σamount`, `non_deductible_* = −Σ`, `closed = true`, `vat_date = P.ending_date`, `vat_return_period_id = P`); эх entry-үүд `closed = true`, `closed_by_entry_no = S`. Бусад (0 дүнтэй бүлэг, аль хэдийн хаагдсан татгалзлын хос) зөвхөн `vat_return_period_id = P`. Нийлбэр хаалтын дансанд (`NONE`, бүлэггүй). | R-VAT-29, R-VAT-30, R-VAT-31; FR-TAX-015 AC1 | AT-TAX-073, GS-VAT-007 |
| BR-TAX-74 | Боловсруулах дараалал: Bus. код → Prod. код (ordinal) → `PURCHASE` дараа нь `SALE` (R-VAT-29); entry ба мөрийн дугаар детерминист. | R-VAT-29 | AT-TAX-074 |
| BR-TAX-75 | Ваучер: source `VATSTMT`, дугаар `GENERAL` template-ийн posting цуврал (`GJ`), `document_type = 'NONE'`, тайлбар "НӨАТ-ын хаалт YYYY-MM", мөрүүд `SystemGenerated`. G/L мөргүй бол ваучер үүсэхгүй (`settlement_transaction_no` NULL). Үеийн төлөв `CLOSED` нь ижил DB transaction-д. Preview = ижил код + ROLLBACK. | R-VAT-32; 05 BR-PST-52 | AT-TAX-075 |
| BR-TAX-76 | Хаалтын данс = `tax_setup.vat_settlement_account_id` (CR-TAX-03); тэр хүртэл хүсэлтийн `settlementAccountId` (UI анхдагч: данс `2310`). Данс `POSTING`, блоклогдоогүй, `LIABILITIES`, `gen_posting_type = 'NONE'`, НӨАТ/Gen. бүлэггүй (`tax.vat_settlement_account_missing`, `tax.vat_settlement_account_invalid`). | R-VAT-30; pitfall 11 | AT-TAX-076 |
| BR-TAX-77 | `VATSTMT` гүйлгээг нийтийн `:reverse` буцаахгүй (05 §3.7, `gl.reversal_not_reversible`); зөвхөн `:reopen`. | 05 BR-PST-45, OQ-PST-06 | AT-TAX-077 |
| BR-TAX-78 | `:submit` (`ACTION tax.vat_return.submit`, MFA + step-up): P `CLOSED` (`tax.vat_period_not_closed`); `submission_reference` 1–100 тэмдэгт заавал (`tax.submission_reference_required`); `SUBMITTED`, `submitted_at = now()`, `submitted_by`. Хариуны `effects[]`: P-г хамарсан нягтлан бодох үе `CLOSED` бол `SUGGEST_GL_PERIOD_LOCK` (автомат биш, Z-TAX-04). Дахин илгээх → `tax.vat_period_already_submitted`. Илгээсэн тайлангийн **өөрчлөгдөхгүй бүртгэл** (mn-tax R19): ижил transaction-д ТТ-03а-г (§5.9) тооцож мөр бүрийн (`line_no`, `row_no`, `value`, `printed`) ба `scopeVersion`, `sha256`-ийг хадгална — CR-TAX-15 хүртэл `audit.security_event` (`VAT_PERIOD_SUBMITTED`)-ийн `details`-д (нэгтгэсэн дүн, PII-гүй). | FR-TAX-015; 15 UX-VAT-06; 13 SEC-POST-08; mn-tax R19 | AT-TAX-078 |
| BR-TAX-79 | `:reopen` (`ACTION tax.vat.reopen`, Owner, step-up, шалтгаан ≥ 10 тэмдэгт `tax.reopen_reason_required`): P `CLOSED` ба хамгийн сүүлийнх (BR-TAX-44). Хаалтын ваучерыг `IReversalService`-ээр (`allowedSourceCodes = [VATSTMT]`) эх огноогоор буцаана (нягтлан бодох үе `OPEN` байх); SETTLEMENT entry-г толин тусгалаар; `closed_by_entry_no` нь P-гийн SETTLEMENT entry байсан эх entry → `closed = false`, `closed_by_entry_no = NULL`; `vat_return_period_id = P` бүх **SALE/PURCHASE** entry → NULL (SETTLEMENT entry ба түүний толин тусгал түүхэнд P-гийн id-гаа хадгална; scope-д хэзээ ч орохгүй, BR-TAX-66); R2: `city_tax_settlement_transaction_no` (CR-TAX-06) байвал түүнийг мөн ижил transaction-д буцаана (НХАТ-ын SETTLEMENT толин тусгал, эх `city_tax_entry` `closed = false`); P `OPEN`, `settlement_transaction_no = NULL`. Татгалзлын хос (BR-TAX-51) `closed = true` хэвээр (тэдгээрийн `closed_by_entry_no` нь SETTLEMENT биш). Аудит ба outbox. | 05 OQ-PST-06; FR-TAX-015 | AT-TAX-079, GS-VAT-017 |
| BR-TAX-80 | `SUBMITTED`-ийн дараах засвар нь дараагийн нээлттэй үеийн огноотой шинэ баримт/кредит нотоор (pitfall 12). Засварласан тайлан (2 жилийн цонх, `tax.return_amendment_window_years`, 2027-оос) нь систем дотор дахин нээх замаар биш; засварын жагсаалтыг экспортоор (R3-т e-tax). | R-VAT pitfall 12; CMP-034 | AT-TAX-080 |
| BR-TAX-81 | НӨАТ-ын төлбөр нь энгийн төлбөрийн журнал/банкны төлбөр: Дт 2310 / Кт банк (НӨАТ-гүй мөр). Буцаан авах (илүү төлсөн) үлдэгдэл 2310-ийн дебит үлдэгдэл болж дараагийн үеийн төлөхөөс хасагдана. | bc-vat F6.5 | GS-VAT-014 |
| BR-TAX-82 | Инвариант (шөнийн шалгалт, 02 §8.8), НӨАТ-ын данс **тус бүрээр** (setup-ийн дансаар, seed-д 2300/1300/2305): `Σ gl_entry`(борлуулалтын данс) = `Σ amount` (SALE, `NOT closed`); `Σ gl_entry`(худалдан авалтын данс) = `Σ amount` (PURCHASE, `NOT closed`, бүх тооцооны төрөл); `Σ gl_entry`(урвуу тооцооны данс) = `−Σ (amount + non_deductible_amount)` (PURCHASE RC, `NOT closed`). Бүх огноогоор (`posting_date`-ийн хязгааргүй). Эдгээр дансанд гараар бичих боломжгүй (`direct_posting = false`); дансны өөрчлөлтийг BR-TAX-03 хамгаална. | NFR-005; 05 BR-PST-42 | AT-TAX-082 |

### 4.11 НӨАТ-ын бүртгэлийн босгын хяналт

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-83 | Эргэлт `T(d) = Σ −(base + non_deductible_base)` — SALE entry, `vat_date ∈ (d − 12 сар, d]`, setup-ийн (одоогийн, бүлгийн кодоор; setup олдохгүй бол entry-ийн `vat_category`) `vat_category ∈ {VAT10, VAT0}`, үндсэн хөрөнгийн борлуулалт биш (R1: `gen_prod_posting_group` код нь `Tax:Threshold:ExcludedGenProdGroupCodes` (анхдагч `["FA"]`)-д байхгүй; R2: CR-TAX-07-ийн `excluded_from_turnover = false`). Буцаалт ба кредит нот хасагдана (тэмдгээрээ). | mn-tax R4; FR-TAX-012; CMP-016; 11 §7 (ҮХ-ийн борлуулалт) | AT-TAX-083, GS-VAT-009 |
| BR-TAX-84 | Босго `M(d)` = `GetParameter('vat.registration_threshold_mandatory', d, Report)`, `V(d)` = `…_voluntary`. НӨАТ төлөгч бус компанид: `T ≥ M` → `CROSSED` (W-TAX-02); `T ≥ 0.8 M` → `APPROACHING` (W-TAX-01); `T ≥ V` → `VOLUNTARY_ELIGIBLE` (мэдээлэл W-TAX-03); бусад `NONE`. НӨАТ төлөгчид: `T < M` → `BELOW_MANDATORY` (мэдээлэл W-TAX-04), бусад `NONE`. 80 %-ийн харьцаа нь UI-ийн тогтмол (хуулийн тоо биш). | FR-TAX-012 AC1/AC2; D-K5 | AT-TAX-084 |
| BR-TAX-85 | 2027-07-01: `M` 50 сая → 400 сая. Үнэлгээ нь `d`-ийн `M`-ийг ашиглана (пропорциональ биш). Хариунд `crossedOn` = цонхонд `T(x) ≥ M(x)` болсон хамгийн эрт `x`; `crossedOn < 2027-07-01` ба одоогийн түвшин `CROSSED` биш бол "өмнөх босгыг {crossedOn}-нд давсан" тайлбар (эрх зүйн үр дагавар OQ-TAX-05). | D-K5; legal-parameters (a) | AT-TAX-085, GS-VAT-009 |
| BR-TAX-86 | Өдөр бүр job `tax.vat_threshold.check` (06:00 Asia/Ulaanbaatar, компани тус бүр) ба `GET /tax/vat-threshold?asOf=`. Түвшин өөрчлөгдөхөд outbox `tax.vat_threshold.level_changed` (`idempotency_key = …:{companyId}:{level}:{thresholdParamId}` — нэг түвшинд нэг босгын хувилбарт нэг удаа). | 02 §4.2.5 `VatThresholdReached`; ADR-0012 | AT-TAX-086 |
| BR-TAX-87 | Борлуулалтын нэхэмжлэхийн preview/post-ийн хариунд сүүлд тооцсон түвшин `CROSSED` бол W-TAX-02 (posting дотор дахин тооцохгүй). | FR-TAX-012 | AT-TAX-087 |
| BR-TAX-88 | Босгын хяналт `vat_registered`-ийг автоматаар өөрчлөхгүй. | D-E5 | AT-TAX-087 |

### 4.12 НХАТ (R2)

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-89 | Борлуулалтад идэвхтэй нөхцөл: `company_setup.city_tax_payer AND city_tax_setup.enabled`. Эс бөгөөс борлуулалтын мөрийн НХАТ-ын код → `tax.city_tax_not_enabled`. Худалдан авалтад нийлүүлэгчийн баримтын НХАТ компанийн тэмдгээс үл хамаарна (өртөг). | D-E6; FR-TAX-019; mn-tax R14 | AT-TAX-089 |
| BR-TAX-90 | Мөрийн код: `ITEM` мөрөнд `inv.item.city_tax_code_id` анхдагч; `GL_ACCOUNT` мөрөнд хэрэглэгч сонгоно. Код блоклогдоогүй, `effective_from ≤ vat_date ≤ effective_to` (`tax.city_tax_code_not_effective`). | D-E6 | AT-TAX-090 |
| BR-TAX-91 | Хувь `c` = `rate_param_code` байвал `round(GetParameter(code, vat_date, Posting) × 100, 5)`, эс бөгөөс `rate_percent`. Хадгалахад `c ≤ GetParameter('city_tax.rate_max_ub', d) × 100` (`tax.city_tax_rate_exceeds_max`). | D-E7; legal-parameters (h) | AT-TAX-091 |
| BR-TAX-92 | Суурь = НӨАТ-гүй цэвэр дүн (`NET_EXCL_VAT`). НӨАТ НХАТ-аас, НХАТ НӨАТ-аас тооцогдохгүй: `G = net × (1 + r/100 + c/100)`. | `param:city_tax.base`; mn-tax §5 (PosAPI жишээ 5 000 + 500 + 100) | AT-TAX-092, GS-VAT-012, GS-VAT-019 |
| BR-TAX-93 | Баримтын түвшинд бүлгээр, Nearest: үнэ НӨАТ-гүй — бүлэг (код, тэмдэг), `CT_g = R(ΣAmount × c/100 + carry)`; үнэ НӨАТ-тэй — НӨАТ-ын бүлэг (BR-TAX-18) дотор `CT_g = R(G_g × c/(100 + r + c) + carry)`. Мөрүүдэд running remainder-ээр. | D-E3 (адил зарчим) | AT-TAX-093 |
| BR-TAX-94 | Posting: борлуулалт — Кт `city_tax_code.payable_account_id` (2320), `city_tax_entry` SALE (`base = −net`, `amount = −CT`), авлага = AIV + CT; худалдан авалт — Дт `expense_account_id` (7250; NULL бол суурь мөрийн данс), `city_tax_entry` PURCHASE (мэдээлэл). Ledger `CITY_TAX_ENTRY`, writer order 15. | D-E6; 05 BR-PST-40 | AT-TAX-094, GS-VAT-012, GS-VAT-019 |
| BR-TAX-95 | НХАТ-ын хаалт НӨАТ-ын `:close`-той нэг DB transaction-д, тусдаа ваучер (`CITYTAXSTMT`): `NOT closed` SALE entry (`tax_date ≤ P.ending_date`) кодоор: Дт 2320 Σ / Кт `city_tax_setup.settlement_account_id` (2325); SETTLEMENT entry, эх entry хаагдана. PURCHASE entry хаагдахгүй. Үеийн холбоосыг CR-TAX-06 хадгална. | D-E6; R-VAT-29 (адил) | AT-TAX-095, GS-VAT-020 |
| BR-TAX-96 | eBarimt-ийн `totalCityTax` = мөрийн `city_tax_amount` (12 AMT-02); НХАТ төлөгч бус мерчант илгээхгүй (`ebarimt.city_tax_not_registered`). | 12 AMT-02; FR-EBR-019 | AT-TAX-096 |

### 4.13 Хялбаршуулсан НӨАТ (R2 · Could, параметрээр)

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-97 | Горимыг компанийн татварын профайлд (CR-TAX-04, `vat_status = SIMPLIFIED`, `valid_from` = улирлын эхэн) тохируулна. Эрх: `T(valid_from) < GetParameter('vat.simplified.turnover_threshold')` ба салбар хасагдсан жагсаалтад байхгүй (`vat.simplified.excluded_activities`); эс бөгөөс `tax.simplified_vat_not_eligible`. | mn-tax §2.6, R10; legal-parameters (b) | AT-TAX-097 |
| BR-TAX-98 | Үе нь улирал (`vat.simplified.return_frequency`); `due_date` параметр байхгүй тул NULL (⚠, календарьт "тодорхойгүй"). | legal-parameters (b) | AT-TAX-098 |
| BR-TAX-99 | Борлуулалтын НӨАТ 10 %-иар өөрчлөгдөхгүй (⚠ OQ-TAX-06); худалдан авалтын НӨАТ хасагдахгүй (`SIMPLIFIED_REGIME`, өртөгт). | mn-tax R10 | AT-TAX-099 |
| BR-TAX-100 | Улирлын хаалт: `S` = scope-ийн SALE (ангилал VAT10) `Σ −base` (`VAT_EXCLUSIVE` анхдагч; `VAT_INCLUSIVE` профайлын сонголтоор `S + O`), `O = Σ −amount`, `Payable = R(r/100 × S × (1 − share))`, `D = O − Payable`. Ваучер: Дт 2300 `O` / Кт хаалтын данс `Payable` / Кт `tax_setup.simplified_vat_gain_account_id` `D`. `share`, `r` параметр `Posting` (unverified бол `tax.parameter_unverified`, зөвхөн тооцоо харуулна). | FR-TAX-022 AC1; mn-tax R10 | AT-TAX-100, GS-VAT-021 |
| BR-TAX-101 | "Хялбаршуулсан НӨАТ-ын тооцоо" тайлан нь кодоор (загвар биш; маягт тодорхойгүй ⚠). | FR-TAX-022 | AT-TAX-100 |
| BR-TAX-102 | Горим солих огноо = НӨАТ-ын үеийн эхлэл (`tax.regime_change_not_at_period_start`). | ADR-0021 #2 | AT-TAX-102 |

### 4.14 ААНОАТ-ын туслах тайлан (R2, OQ-TAX-10)

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-103 | Зөвхөн уншдаг тооцоо; автоматаар бичилт үүсгэхгүй. Сонголтоор хуримтлалын **журналын ноорог** (Дт 9100 / Кт 2330) үүсгэнэ; хэрэглэгч батална. | 00 §хүрээнээс гадуур (бүрэн ААНОАТ); mn-tax R11 | AT-TAX-103 |
| BR-TAX-104 | Хуримтлагдсан үе: Q1 (01-01..03-31), H1 (..06-30), 9M (..09-30), FY (..12-31). Параметрийн `asOf` = Y-01-01. | mn-tax §3.3; BR-TAX-13 | AT-TAX-104 |
| BR-TAX-105 | G/L-ээс (`is_closing = false`): орлого `Rev` = `−Σ amount` (`account_category = 'INCOME'`, дэд ангилал `DISCONTINUED`-ээс бусад); татварын өмнөх ашиг `PBT` = `−Σ amount` (`income_balance = 'INCOME_STATEMENT'`, дэд ангилал `INCOME_TAX`-аас бусад). | REQ-ACC-19; seed `gl_account_category` | AT-TAX-105, GS-VAT-022 |
| BR-TAX-106 | Тохируулга: + хасагдахгүй зардлын дансны (CR-TAX-10; анхдагч 8430) дебит цэвэр дүн; − татвар ногдохгүй орлого; + (R2 ҮХ) НББ ба татварын элэгдлийн зөрүү; + гараар оруулсан тохируулга (хүсэлтийн параметр, хадгалахгүй). `TI = PBT + Adj`. | mn-tax §3.5, R11, R13 | AT-TAX-106 |
| BR-TAX-107 | Тооцоолол: STANDARD (шатлал), CREDIT_90 (`Tax × (1 − credit_90pct_rate)` хэрэв өмнөх жилийн орлого ≤ босго ба салбар хасагдаагүй), ONE_PERCENT (`turnover_regime_rate × Rev` хэрэв өмнөх жилийн орлого ≤ `turnover_regime_threshold`), SIMPLIFIED_ANNUAL (`1 % × Rev`, жилийн, НӨАТ төлөгч бус, өмнөх жилийн орлого < `simplified_return_threshold`). Бүгдийг харуулж, профайлын горимыг тодруулна; эрхгүйг тайлбартай. Алдагдал шилжүүлэх нь хэрэглэгчийн оруулсан өмнөх оны алдагдлаар (`loss_carryforward_years`, `loss_offset_cap_ratio` unverified ⚠). | mn-tax §3.1–3.3; legal-parameters (c) | AT-TAX-107, GS-VAT-022 |
| BR-TAX-108 | Улирлын төлөх = `Tax(E) − Tax(E_prev)` (хуримтлагдсан ялгавар, төлөвгүй). Хугацаа: `cit.quarterly_return_due_day`, `cit.quarterly_payment_due` (⚠), жилийн `cit.annual_return_due`. | mn-tax §3.3; legal-parameters (d) | AT-TAX-108 |

### 4.15 Татварын календарь

| ID | Дүрэм | Эх | Шалгах |
|---|---|---|---|
| BR-TAX-109 | Календарийн мөр параметрээс: НӨАТ (сар бүр, `vat_return_period.due_date`); хялбаршуулсан НӨАТ (улирал, ⚠); ААНОАТ улирлын тайлан (20), төлбөр (2027-оос ⚠), урьдчилгаа (25, ⚠), жилийн (02-10 → 2027-оос 03-05 ⚠); НХАТ (НӨАТ-ын хугацаатай ижил гэж үзнэ ⚠). `unverified` мөр ⚠-тэй. Хүсэлтийн `[from, to]`-д **хугацаа (due)** нь орсон мөрийг буцаана; хугацааны параметрийг үе дууссаны дараагийн өдрөөр уншина (§5.18). Амралтын өдрөөр шилжүүлэхгүй (OQ-TAX-13). | FR-TAX-018; mn-tax R17; mn-accounting §7; REQ-ACC-13 | AT-TAX-109 |
| BR-TAX-110 | Мөрийн төлөв өгөгдлөөс: НӨАТ-ын үе `SUBMITTED` → "Илгээсэн"; эс бөгөөс үлдсэн хоног (`due_date − бизнесийн огноо`). НӨАТ төлөгч бус компанид НӨАТ-ын мөр гарахгүй. | FR-TAX-018 AC1; 15 CUE-04 | AT-TAX-110 |

---
## 5. Процесс ба алгоритм

### 5.1 Гэрээ (`Erp.Tax.Contracts`)

Tax нь GL.Contracts-оос (`ISubledgerLine`, `ILedgerWriter`, `IPostingDocumentSource`, `PostingBuffer`) хамаарна; Sales, Purchases, CashBank, Reporting нь Tax.Contracts-оос хамаарна (02 §4.3). Tax нь EBarimt.Contracts-ийг дуудна (ТТД, баримтын төлөв); EBarimt нь Tax-ийг мэдэхгүй.

```csharp
namespace Erp.Tax.Contracts;

// ---------- Хуулийн параметр (D-E7) ----------
public enum ParameterUse { Posting, Report, Warning, Calendar }

public sealed record TaxParameterValue(
    Guid Id, string Code, decimal? Numeric, string? Text, string Unit,
    DateOnly EffectiveFrom, DateOnly? EffectiveTo, string Status, string Confidence,
    string? LegalBasis, string? SourceUrl)
{
    public bool IsVerified => Status == "verified";
    public decimal RequireNumeric() => Numeric ?? throw TaxException.Internal($"parameter {Code} is not numeric");
    public decimal AsPercent() => decimal.Round(RequireNumeric() * 100m, 5, MidpointRounding.AwayFromZero);
}

public interface ITaxParameterProvider
{
    // Хүчинтэй утга. Байхгүй → tax.parameter_not_effective; Posting ба unverified → tax.parameter_unverified (BR-TAX-11, -12)
    TaxParameterValue GetParameter(string code, DateOnly asOf, ParameterUse use = ParameterUse.Posting);
    bool TryGetParameter(string code, DateOnly asOf, ParameterUse use, [NotNullWhen(true)] out TaxParameterValue? value);
    IReadOnlyList<TaxParameterValue> GetTimeline(string code);          // effective_from ASC (S-TAX-06, API)
}

// ---------- Компанийн контекст ба setup ----------
public enum TaxDirection { Sale, Purchase }
public enum VatRounding { Nearest, Up, Down }                            // company_setup.vat_rounding_type

public sealed record TaxCompanyContext(
    Guid CompanyId, decimal AmountPrecision, VatRounding VatRounding,
    bool VatRegistered, DateOnly? VatRegisteredFrom,                     // CR-TAX-04-ийн дараа профайлын мөрүүд
    string NonVatPayerTaxType,                                           // ebarimt_setup.non_vat_payer_tax_type ?? "NOT_VAT"
    bool CityTaxEnabled,                                                 // company_setup.city_tax_payer && city_tax_setup.enabled (R2)
    Func<DateOnly, VatRegime> RegimeAt)                                  // R1: үргэлж Standard
{
    public bool IsVatRegistered(DateOnly d) => VatRegistered && (VatRegisteredFrom is null || d >= VatRegisteredFrom);
}
public enum VatRegime { Standard, Simplified }

public sealed record ResolvedVatSetup(
    Guid SetupId, int RowVersion, string VatBusCode, string VatProdCode,
    string CalcType, string Identifier, string SetupCategory,
    string EffectiveCategory, string EffectiveEbarimtTaxType, string? DefaultTaxProductCode,
    decimal RatePercent, Guid? RateParameterId,
    decimal NonDeductiblePercent, string? NonDeductibleReason,          // систем эсвэл мөрийн шалтгаан (BR-TAX-25, -52)
    Guid? SalesVatAccountId, Guid? PurchaseVatAccountId, Guid? ReverseChargeAccountId);

public sealed record ResolvedCityTax(Guid CodeId, string Code, decimal RatePercent, Guid? RateParameterId,
                                     Guid? PayableAccountId, Guid? ExpenseAccountId);    // R2

public interface IVatSetupResolver
{
    ResolvedVatSetup Resolve(Guid vatBusGroupId, Guid vatProdGroupId, TaxDirection dir, DateOnly vatDate,
                             TaxCompanyContext co, string? lineNonDeductibleReason);
    ResolvedCityTax? ResolveCityTax(Guid? cityTaxCodeId, DateOnly vatDate, TaxCompanyContext co);   // R2
}

// ---------- Баримтын тооцоолол (цэвэр функц, BR-TAX-17) ----------
public sealed record TaxLine(
    int LineNo, decimal Cla,                      // мөрийн хөнгөлөлтийн дараах дүн, БАРИМТЫН тэмдгээр (кредит нотод ч эерэг)
    Guid? AccountId,                              // GL_ACCOUNT мөрийн данс (FULL_VAT-ын шалгалт)
    ResolvedVatSetup Setup, ResolvedCityTax? CityTax = null,
    decimal VatDifference = 0m);                  // худалдан авалт/журнал (BR-TAX-26)

public sealed record TaxDocument(TaxDirection Direction, bool PricesIncludingVat, DateOnly VatDate,
    TaxCompanyContext Company, bool AllowVatDifference, decimal MaxVatDifference, IReadOnlyList<TaxLine> Lines);

public sealed record TaxLineResult(int LineNo,
    decimal Amount,              // НӨАТ, НХАТ-гүй цэвэр дүн (FULL_VAT: 0)
    decimal VatAmount,           // баримт дээр тооцсон НӨАТ (REVERSE_CHARGE: 0)
    decimal AmountIncludingVat,  // Amount + VatAmount (НХАТ орохгүй, 12 AMT-02)
    decimal VatBase,             // NORMAL, RC: Amount; FULL_VAT: 0
    decimal SelfAssessedVat,     // REVERSE_CHARGE-ийн өөрөө тооцох НӨАТ
    decimal NonDeductibleVat, decimal NonDeductibleBase,
    decimal VatDifference, decimal CityTaxAmount,
    ResolvedVatSetup Setup, ResolvedCityTax? CityTax);

public sealed record VatGroupResult(string Identifier, string CalcType, Guid? CityTaxCodeId, bool Positive,
    decimal RatePercent, decimal Base, decimal Vat, decimal SelfAssessedVat, decimal CityTax);

public sealed record TaxResult(IReadOnlyDictionary<int, TaxLineResult> Lines, IReadOnlyList<VatGroupResult> Groups,
    IReadOnlyList<TaxIssue> Errors, IReadOnlyList<TaxIssue> Warnings);

public interface ITaxCalculator { TaxResult ComputeDocument(TaxDocument doc); }

// ---------- Posting (05 §5.7.2) ----------
public sealed record VatPartyContext(string Type /*CUSTOMER|VENDOR*/, Guid Id, string No, string? Tin, string CountryCode,
    bool VendorVatRegistered, string? SupplierEbarimtId, string? ExternalDocumentNo, DateOnly? DocumentDate,
    bool CorrectedInvoiceConfirmed /*худалдан авалтын кредит нот, BR-TAX-36*/,
    bool ConfirmInputVat = false /*07 BR-PUR-47: хүсэлт + эрх шалгагдсан*/);

public sealed record VatComposition(GlPostingLine BaseLine, IReadOnlyList<GlPostingLine> VatGlLines, VatLedgerLine VatLine,
    IReadOnlyList<GlPostingLine> CityTaxGlLines, CityTaxLedgerLine? CityTaxLine);

public interface IVatPostingComposer
{
    VatComposition Compose(PostingBufferRow row, string baseLineKey, VatPartyContext party, DateOnly vatDate);
}

public sealed record VatLedgerLine(
    string EntryType, IReadOnlyList<string> GlLineKeys, DateOnly VatDate,
    decimal Base, decimal Amount, decimal NonDeductibleBase, decimal NonDeductibleAmount, decimal VatDifference,
    ResolvedVatSetup Setup, PostingGroupSnapshot Groups, VatPartyContext? Party,
    bool DeductibleConfirmed, string? SupplierEbarimtId, string? NonDeductibleReason /*CR-TAX-02*/,
    bool ExcludedFromTurnover /*CR-TAX-07*/,
    SettlementLink? Settlement = null,            // SETTLEMENT: (PeriodId, SourceEntryNos)
    long? PairedWithEntryNo = null) : ISubledgerLine   // татгалзлын хос (BR-TAX-51)
{
    public string Ledger => LedgerCodes.VatEntry;
    IReadOnlyList<string> ISubledgerLine.GlLineKeys => GlLineKeys;
}

// ---------- Үйл ажиллагаа ----------
public interface IInputVatService            // §5.8
{
    Task<ConfirmResult> ConfirmDeductibleAsync(ConfirmDeductibleCommand cmd, CancellationToken ct);
    Task<ConfirmResult> UnconfirmAsync(UnconfirmDeductibleCommand cmd, CancellationToken ct);           // 07 BR-PUR-51 (Should); §5.8
    Task<PostingResult> RejectDeductionAsync(RejectDeductionCommand cmd, PostingMode mode, CancellationToken ct);
    IAsyncEnumerable<UnconfirmedInputVat> ListUnconfirmedAsync(CancellationToken ct);                  // BR-TAX-50; 07 BR-PUR-52
}
public interface IVatReturnService           // §5.9–§5.11
{
    Task<VatStatementResult> CalculateAsync(Guid periodId, string statementName, CancellationToken ct);  // lastVatEntryNo, scopeVersion
    Task<VatCloseResult> CloseAsync(VatCloseCommand cmd, PostingMode mode, CancellationToken ct);       // mode = Preview → :preview-close
    Task<VatSubmitResult> SubmitAsync(Guid periodId, string submissionReference, CancellationToken ct);
    Task<VatReopenResult> ReopenAsync(Guid periodId, Guid? reasonCodeId, string reasonText, CancellationToken ct);
}
public sealed record VatCloseCommand(Guid PeriodId, DateOnly PostingDate, Guid? SettlementAccountId,
                                     string? ExpectedScopeVersion, long? ExpectedLastVatEntryNo);       // BR-TAX-69, -72
public interface IVatReturnQuery             // Reporting-ийн бүртгэл ба экспорт (§5.12), dashboard
{
    IAsyncEnumerable<VatScopeEntry> GetScopeEntriesAsync(Guid periodId, CancellationToken ct);
    Task<VatPeriodStatus> GetPeriodStatusAsync(Guid periodId, CancellationToken ct);                    // CUE-04, CUE-14
}
public interface IVatThresholdMonitor { Task<ThresholdStatus> EvaluateAsync(DateOnly asOf, CancellationToken ct); }   // §5.14
public interface ICitHelper { Task<CitHelperResult> CalculateAsync(CitHelperRequest req, CancellationToken ct); }      // §5.17 (R2)
public interface ITaxCalendar { Task<IReadOnlyList<TaxCalendarItem>> GetAsync(DateOnly from, DateOnly to, CancellationToken ct); }  // §5.18
```

Хэрэгжүүлэлт: `Erp.Tax.Domain` (цэвэр тооцоолол: `TaxCalculator`, `VatStatementEvaluator`, `SettlementPlanner`, `CitCalculator`), `Erp.Tax.Infrastructure` (SQL: `Sql/*.sql` embedded resource, writer, кэш), `Erp.Tax.Application` (use case, A/B үе).

### 5.2 Хуулийн параметрийн хайлт (`GetParameter(code, date)`)

**Эх өгөгдөл.** `tax.tax_parameter` (≈110 мөр, глобал). Процесс эхлэхэд бүх мөрийг санах ойд ачаална:

```sql
-- Sql/TaxParameter.LoadAll.sql
SELECT id, param_code, value_numeric, value_text, unit, effective_from, effective_to,
       status, confidence, legal_basis, source_url
  FROM tax.tax_parameter
 WHERE status <> 'superseded'
 ORDER BY param_code, effective_from;
```

```csharp
public sealed class TaxParameterProvider(ITaxParameterSnapshotSource source, TimeProvider clock) : ITaxParameterProvider
{
    private volatile TaxParameterSnapshot _snap = source.Load();             // ImmutableDictionary<code, TaxParameterValue[]>

    public TaxParameterValue GetParameter(string code, DateOnly asOf, ParameterUse use = ParameterUse.Posting)
    {
        if (!TryFind(code, asOf, out var hit))
            throw new TaxException("tax.parameter_not_effective", new { code, date = asOf });          // BR-TAX-11
        if (use == ParameterUse.Posting && !hit.IsVerified)
            throw new TaxException("tax.parameter_unverified", new { code, date = asOf, status = hit.Status }); // BR-TAX-12
        return hit;
    }

    public bool TryGetParameter(string code, DateOnly asOf, ParameterUse use, out TaxParameterValue? value)
    {
        value = null;
        if (!TryFind(code, asOf, out var hit)) return false;
        if (use == ParameterUse.Posting && !hit.IsVerified) return false;
        value = hit; return true;
    }

    private bool TryFind(string code, DateOnly d, out TaxParameterValue hit)
    {
        hit = default!;
        if (!_snap.Rows.TryGetValue(code, out var rows)) return false;
        // EXCLUDE нь давхцлыг хориглодог тул ≤ 1 мөр таарна; хоёр зах хоёулаа орно ('[]')
        foreach (var r in rows)
            if (r.EffectiveFrom <= d && (r.EffectiveTo is null || d <= r.EffectiveTo)) { hit = r; return true; }
        return false;
    }

    public IReadOnlyList<TaxParameterValue> GetTimeline(string code) =>
        _snap.Rows.TryGetValue(code, out var rows) ? rows : [];

    internal void Reload() => _snap = source.Load();                        // NOTIFY эсвэл үечилсэн шалгалт
}
```

- **Шинэчлэх.** Параметрийн migration нь төгсгөлдөө `NOTIFY tax_parameter_changed` хийнэ; апп `LISTEN`-ээр `Reload()`. Нэмэлтээр 10 минут тутам `SELECT count(*), max(created_at) FROM tax.tax_parameter`-ийг харьцуулна (NOTIFY алдагдсан үед). Snapshot нь immutable, солилт нь атомар (`volatile` reference).
- **Нийцэл.** DB функц `tax.fn_tax_parameter_numeric(code, date, require_verified)` (seed) ба энэ provider ижил үр дүн өгнө (unit тест AT-TAX-011: бүх код × 2016-01-01..2030-12-31-ийн хил огноо).
- **Хувилбарын нотолгоо.** Posting нь хэрэглэсэн `TaxParameterValue.Id`-г VAT entry-д (CR-TAX-01) ба баримтын мөрт хадгална. CR хэрэгжих хүртэл `vat_percent` + `vat_date`-ээр параметрийн мөрийг тодорхойлж болно (EXCLUDE-ийн дагуу нэг утгатай).
- **API.** `GET /api/v1/tax-parameters` (бүх код, timeline), `GET /api/v1/tax-parameters/{paramCode}?date=YYYY-MM-DD` (хүчинтэй мөр эсвэл 404 `tax.parameter_not_effective`; `date`-гүй бол timeline). Тоо нь string (14 API-JSON), `status`, `confidence`, `isVerified` гарна (AT-API-047).

### 5.3 Setup шийдэх (`IVatSetupResolver.Resolve`)

```csharp
public ResolvedVatSetup Resolve(Guid busId, Guid prodId, TaxDirection dir, DateOnly vatDate,
                                TaxCompanyContext co, string? lineReason)
{
    var s = _setups.Get(co.CompanyId, busId, prodId)                                         // кэш: компанийн setup (row_version-тай)
        ?? throw Issue("tax.vat_posting_setup_missing", new { vatBus = Code(busId), vatProd = Code(prodId) });  // BR-TAX-01
    if (s.Blocked) throw Issue("tax.vat_posting_setup_blocked", new { s.VatBusCode, s.VatProdCode });
    if (dir == TaxDirection.Sale && s.CalcType != "NORMAL")
        throw Issue("tax.vat_calc_type_not_allowed", new { calcType = s.CalcType, direction = "SALE" });     // BR-TAX-07

    TaxParameterValue? rp = s.RateParamCode is { } pc ? _params.GetParameter(pc, vatDate, ParameterUse.Posting) : null;
    decimal rate = rp?.AsPercent() ?? s.VatPercent;                                          // BR-TAX-14
    string effCat = s.Category, effType = s.EbarimtTaxType;
    decimal nd = 0m; string? reason = null;
    bool registered = co.IsVatRegistered(vatDate);                                           // BR-TAX-54

    if (dir == TaxDirection.Sale)
    {
        if (!registered) { rate = 0m; effCat = "NOVAT"; effType = co.NonVatPayerTaxType; }   // BR-TAX-55
    }
    else
    {
        if (!registered && s.CalcType == "REVERSE_CHARGE")
            throw Issue("tax.company_not_vat_registered", new { calcType = s.CalcType, date = vatDate });   // OQ-TAX-07; §8.1
        if (!registered)                                  { nd = 100m; reason = "NON_VAT_COMPANY"; }
        else if (co.RegimeAt(vatDate) == VatRegime.Simplified) { nd = 100m; reason = "SIMPLIFIED_REGIME"; }   // R2, BR-TAX-99
        else if (lineReason is not null)                  { nd = 100m; reason = lineReason; }               // BR-TAX-52
        else                                              { nd = s.NonDeductibleVatPercent; }
    }
    return new ResolvedVatSetup(s.Id, s.RowVersion, s.VatBusCode, s.VatProdCode, s.CalcType, s.Identifier, s.Category,
        effCat, effType, s.EbarimtTaxProductCode, rate, rp?.Id, nd, reason,
        s.SalesVatAccountId, s.PurchaseVatAccountId, s.ReverseChargeAccountId);
}
```

- Кэш: компанийн setup-ийг request-ийн хүрээнд нэг удаа уншина; A үед ашигласан мөрийн `row_version`-ыг posting-ийн B үед `LockSourceAsync` шалгана (BR-TAX-02).
- Данс дутуу эсэх (BR-TAX-05) нь мөрийн тооцоолсон дүнгээс хамаарах тул `ComputeDocument`-ийн дараа (§5.4 алхам 5) шалгагдана.

### 5.4 Баримтын тооцоолол (`ITaxCalculator.ComputeDocument`)

Дуудагч (Sales, Purchases) мөр бүрийн `Setup`-ийг `Resolve`-ээр, `Cla`-г өөрийн дүрмээр (06 §6.2) бэлтгэнэ. Функц DB-гүй, I/O-гүй, детерминист.

```csharp
public TaxResult ComputeDocument(TaxDocument d)
{
    var P = d.Company.AmountPrecision; var mode = d.Company.VatRounding;
    var b = new TaxResultBuilder(d);
    var lines = d.Lines.Where(l => l.Cla != 0m).OrderBy(l => l.LineNo).ToList();            // BR-TAX-22
    foreach (var z in d.Lines.Where(l => l.Cla == 0m)) b.Zero(z);

    // 1) Мөрийн шалгалт (бүгдийг цуглуулна)
    foreach (var l in lines)
    {
        if (l.Setup.CalcType == "FULL_VAT")
        {
            if (l.AccountId != l.Setup.PurchaseVatAccountId) b.Error(l, "tax.full_vat_account_mismatch");          // BR-TAX-24
            if (l.Setup.NonDeductiblePercent > 0m)        b.Error(l, "tax.full_vat_non_deductible_not_allowed");
        }
        if (l.VatDifference != 0m && (d.Direction == TaxDirection.Sale || !d.AllowVatDifference))
            b.Error(l, VatDiffCode(d, tooLarge: false));  // purchase.vat_difference_not_allowed (07) | gl.vat_difference_not_allowed (05); BR-TAX-26
        if (l.VatDifference % P != 0m)                      // Allocate-ийн Σ = total баталгаа P-ийн үржвэр шаарддаг
            b.Error(l, "api.validation_failed", new { field = "vatDifference", precision = P });
        if (l.CityTax is not null && d.Direction == TaxDirection.Sale && !d.Company.CityTaxEnabled)
            b.Error(l, "tax.city_tax_not_enabled");                                                                // BR-TAX-89
    }

    // 2) НӨАТ-ын бүлэг: (identifier, calc type, [НХАТ-ын код — НӨАТ-тэй үнэд], тэмдэг) — BR-TAX-18
    var groups = lines
        .GroupBy(l => new GroupKey(l.Setup.Identifier, l.Setup.CalcType,
                                   d.PricesIncludingVat ? l.CityTax?.CodeId : null, Positive: l.Cla > 0m))
        .OrderBy(g => g.Key.Identifier, StringComparer.Ordinal)
        .ThenBy(g => g.Key.CalcType, StringComparer.Ordinal)
        .ThenBy(g => g.Key.CityTaxCodeId)
        .ThenBy(g => g.Key.Positive);                                                       // false (сөрөг) эхэлж
    var carryVat = new Dictionary<(string, string, Guid?), decimal>();
    var carryCt  = new Dictionary<(string, string, Guid?), decimal>();

    foreach (var g in groups)
    {
        var rates = g.Select(l => l.Setup.RatePercent).Distinct().ToList();
        if (rates.Count > 1) { b.Error(g, "tax.vat_identifier_rate_conflict", new { identifier = g.Key.Identifier, rates }); continue; }
        decimal r = rates[0];
        decimal c = g.Key.CityTaxCodeId is null ? 0m : g.First().CityTax!.RatePercent;
        var k = (g.Key.Identifier, g.Key.CalcType, g.Key.CityTaxCodeId);
        var ls = g.OrderBy(l => l.LineNo).ToList();
        var w  = ls.Select(l => l.Cla).ToList();
        decimal W = w.Sum();

        switch (g.Key.CalcType)
        {
            case "NORMAL":
            {
                decimal exact = (d.PricesIncludingVat ? W * r / (100m + r + c) : W * r / 100m) + carryVat.GetValueOrDefault(k);
                decimal vat = MoneyMath.RoundVat(exact, P, mode);                                       // BR-TAX-19, -21
                if (!g.Key.Positive) carryVat[k] = exact - vat;                                        // R-VAT-13
                decimal diff = ls.Sum(l => l.VatDifference);
                if (Math.Abs(diff) > d.MaxVatDifference) b.Error(g, VatDiffCode(d, tooLarge: true), new { difference = diff, maxAllowed = d.MaxVatDifference });  // purchase.vat_difference_exceeds_max | gl.vat_difference_too_large
                vat += diff;
                var vatI  = MoneyMath.Allocate(vat, w, P);                                              // BR-TAX-20
                var diffI = MoneyMath.Allocate(diff, w, P);
                var ctI   = new decimal[ls.Count];
                if (d.PricesIncludingVat && c != 0m)                                                    // BR-TAX-93 (НӨАТ-тэй үнэ)
                {
                    decimal exactCt = W * c / (100m + r + c) + carryCt.GetValueOrDefault(k);
                    decimal ct = MoneyMath.Round(exactCt, P);
                    if (!g.Key.Positive) carryCt[k] = exactCt - ct;
                    ctI = MoneyMath.Allocate(ct, w, P);
                }
                for (int i = 0; i < ls.Count; i++)
                {
                    decimal amount = d.PricesIncludingVat ? ls[i].Cla - vatI[i] - ctI[i] : ls[i].Cla;
                    b.Line(ls[i], amount: amount, vat: vatI[i], vatBase: amount, selfAssessed: 0m, diff: diffI[i], cityTax: ctI[i]);
                }
                b.Group(g.Key, r, @base: d.PricesIncludingVat ? W - vat - ctI.Sum() : W, vat, sa: 0m, ct: ctI.Sum());
                break;
            }
            case "REVERSE_CHARGE":                                                                     // BR-TAX-23
            {
                decimal exact = W * r / 100m + carryVat.GetValueOrDefault(k);
                decimal sa = MoneyMath.RoundVat(exact, P, mode);
                if (!g.Key.Positive) carryVat[k] = exact - sa;
                var saI = MoneyMath.Allocate(sa, w, P);
                for (int i = 0; i < ls.Count; i++)
                    b.Line(ls[i], amount: ls[i].Cla, vat: 0m, vatBase: ls[i].Cla, selfAssessed: saI[i], diff: 0m, cityTax: 0m);
                b.Group(g.Key, r, @base: W, vat: 0m, sa: sa, ct: 0m);
                break;
            }
            case "FULL_VAT":                                                                           // BR-TAX-24
            {
                foreach (var l in ls) b.Line(l, amount: 0m, vat: l.Cla, vatBase: 0m, selfAssessed: 0m, diff: 0m, cityTax: 0m);
                b.Group(g.Key, r, @base: 0m, vat: W, sa: 0m, ct: 0m);
                break;
            }
        }
    }

    // 3) НХАТ, үнэ НӨАТ-гүй: (код, тэмдэг) бүлэг, суурь = цэвэр дүн (BR-TAX-92, -93)
    if (!d.PricesIncludingVat)
    {
        var ctCarry = new Dictionary<Guid, decimal>();
        foreach (var cg in lines.Where(l => l.CityTax is not null)
                                .GroupBy(l => (Code: l.CityTax!.CodeId, Positive: l.Cla > 0m))
                                .OrderBy(x => x.Key.Code).ThenBy(x => x.Key.Positive))
        {
            var ls = cg.OrderBy(l => l.LineNo).ToList();
            var wn = ls.Select(l => b.Amount(l)).ToList();
            decimal c = ls[0].CityTax!.RatePercent;
            decimal exact = wn.Sum() * c / 100m + ctCarry.GetValueOrDefault(cg.Key.Code);
            decimal ct = MoneyMath.Round(exact, P);
            if (!cg.Key.Positive) ctCarry[cg.Key.Code] = exact - ct;
            var ctI = MoneyMath.Allocate(ct, wn, P);
            for (int i = 0; i < ls.Count; i++) b.SetCityTax(ls[i], ctI[i]);
        }
    }

    // 4) Хасагдахгүй хэсэг (зөвхөн худалдан авалт) — BR-TAX-25
    if (d.Direction == TaxDirection.Purchase)
        foreach (var l in lines.Where(x => x.Setup.NonDeductiblePercent > 0m))
        {
            var x = b.Get(l);
            decimal src = l.Setup.CalcType == "REVERSE_CHARGE" ? x.SelfAssessedVat : x.VatAmount;
            b.SetNonDeductible(l, vat:   MoneyMath.Round(src * l.Setup.NonDeductiblePercent / 100m, P),
                                  @base: MoneyMath.Round(x.VatBase * l.Setup.NonDeductiblePercent / 100m, P));
        }

    // 5) Дансны шалгалт (BR-TAX-05) ба анхааруулга (W-TAX-07, W-TAX-11)
    foreach (var x in b.Lines())
    {
        bool needSales = d.Direction == TaxDirection.Sale && x.VatAmount != 0m;
        decimal charged = x.Setup.CalcType == "REVERSE_CHARGE" ? x.SelfAssessedVat : x.VatAmount;   // §5.5-тай ижил
        bool needPurch = d.Direction == TaxDirection.Purchase
                         && (charged - x.NonDeductibleVat != 0m || x.Setup.CalcType == "FULL_VAT");   // бүрэн хасагдахгүй NORMAL мөрөнд данс шаардахгүй
        if (needSales && x.Setup.SalesVatAccountId is null)    b.Error(x, "tax.sales_vat_account_missing");
        if (needPurch && x.Setup.PurchaseVatAccountId is null) b.Error(x, "tax.purchase_vat_account_missing");
        if (x.Setup.CalcType == "REVERSE_CHARGE" && x.Setup.ReverseChargeAccountId is null) b.Error(x, "tax.reverse_charge_account_missing");
    }
    return b.Build();       // Line: AmountIncludingVat = Amount + VatAmount
}
```

**`MoneyMath`** (`Erp.BuildingBlocks.Domain.Monetary`, ADR-0006; Math.Round-ийг зөвхөн энд):

```csharp
public static decimal Round(decimal x, decimal p) => Math.Round(x / p, 0, MidpointRounding.AwayFromZero) * p;
public static decimal RoundVat(decimal x, decimal p, VatRounding m) => m switch
{
    VatRounding.Up   => Math.Sign(x) * Math.Ceiling(Math.Abs(x) / p) * p,       // абсолют утгаар (R-VAT-12)
    VatRounding.Down => Math.Sign(x) * Math.Floor(Math.Abs(x) / p) * p,
    _                => Round(x, p)
};
// Running remainder (BC DivideAmount, Z-TAX-09): line_no дарааллаар, сүүлийн мөр үлдэгдлийг шингээнэ
public static decimal[] Allocate(decimal total, IReadOnlyList<decimal> weights, decimal p)
{
    var res = new decimal[weights.Count];
    decimal W = 0m; foreach (var w in weights) W += w;
    if (W == 0m || total == 0m) return res;
    decimal rem = 0m;
    for (int i = 0; i < weights.Count; i++)
    {
        rem += total * weights[i] / W;
        res[i] = Round(rem, p);
        rem -= res[i];
    }
    // Баталгаа: Σ res = total (бүлэг дотор жин нэг тэмдэгтэй; rem-ийн эцсийн утга |rem| < p/2 ба
    // нийлбэр нь total-ын p-ийн үржвэр тул rem = 0). Assert(res.Sum() == total) — зөрвөл InternalTaxException.
    return res;
}
```

### 5.5 Buffer мөрийг G/L, VAT, НХАТ мөр болгох (`IVatPostingComposer.Compose`)

Эх модуль `ComputeDocument`-ийн мөрийн үр дүнг `PostingBuffer`-т нэмнэ (05 §5.7.1; борлуулалтын нэхэмжлэх ба худалдан авалтын кредит нотод тэмдгийг урвуулна). Buffer мөрийн талбар (тэмдэгтэй): `Amount`, `VatAmount`, `SelfAssessedVat`, `VatBase`, `NonDeductibleVat`, `NonDeductibleBase`, `VatDifference`, `CityTaxAmount`, `CityTaxBase` (05-ийн `PostingBufferRow`-д сүүлийн дөрвийг нэмэх санал, Z-TAX-15).

```csharp
public VatComposition Compose(PostingBufferRow row, string baseKey, VatPartyContext party, DateOnly vatDate)
{
    var s = row.Key.ResolvedSetup;                       // ComputeDocument-ийн snapshot (buffer түлхүүрт)
    bool sale = row.Key.GenPostingType == "SALE";
    bool rc = s.CalcType == "REVERSE_CHARGE", full = s.CalcType == "FULL_VAT";
    decimal charged  = rc ? row.SelfAssessedVat : row.VatAmount;
    decimal deductible = charged - row.NonDeductibleVat;                                // борлуулалтад NonDeductibleVat = 0

    // 1) Суурь мөр
    var baseLine = new GlPostingLine
    {
        Key = baseKey,
        GlAccountId = row.Key.GlAccountId,                                              // FULL_VAT: = purchase_vat_account_id (шалгасан)
        Amount = full ? row.VatAmount : row.Amount + row.NonDeductibleVat,              // BR-TAX-53
        VatAmount = deductible,                                                         // gl_entry.vat_amount (BR-TAX-31)
        Origin = full || row.SystemCreated ? LineOrigin.SystemDerived : LineOrigin.UserEntered,   // BR-TAX-24
        GenPostingType = row.Key.GenPostingType,
        Groups = row.Key.Groups, VatDate = vatDate, DimensionSetId = row.Key.DimensionSetId
    };

    // 2) VAT G/L мөр (BR-TAX-28)
    var vatGl = new List<GlPostingLine>();
    if (!full && !rc && deductible != 0m)
        vatGl.Add(SysLine($"{baseKey}/VAT", sale ? s.SalesVatAccountId!.Value : s.PurchaseVatAccountId!.Value, deductible, row));
    if (rc && charged != 0m)
    {
        if (deductible != 0m) vatGl.Add(SysLine($"{baseKey}/VAT", s.PurchaseVatAccountId!.Value, deductible, row));
        vatGl.Add(SysLine($"{baseKey}/VAT2", s.ReverseChargeAccountId!.Value, -charged, row));          // 2305 Кт бүтэн
    }

    // 3) VAT entry (BR-TAX-28..30, -46)
    bool confirmed = !sale && deductible != 0m && (rc                                          // amount = 0 entry → false (BR-TAX-46)
                     || full                                                                    // мэдүүлэг заавал (§5.6, BR-TAX-46, -62)
                     || (!rc && !full && deductible != 0m && party.CorrectedInvoiceConfirmed)       // BR-TAX-36
                     || (!rc && !full && deductible != 0m && party.ConfirmInputVat                  // 07 BR-PUR-47: хүсэлт + эрх
                         && party.SupplierEbarimtId is not null));                                  // (эрхийг Purchases шалгаж тугийг өгнө)
    var vatLine = new VatLedgerLine(
        EntryType: sale ? "SALE" : "PURCHASE", GlLineKeys: [baseKey], VatDate: vatDate,
        Base: row.VatBase - row.NonDeductibleBase, Amount: deductible,
        NonDeductibleBase: row.NonDeductibleBase, NonDeductibleAmount: row.NonDeductibleVat,
        VatDifference: row.VatDifference, Setup: s, Groups: row.Key.Groups, Party: party,
        DeductibleConfirmed: confirmed, SupplierEbarimtId: sale ? null : party.SupplierEbarimtId,
        NonDeductibleReason: row.NonDeductibleVat != 0m ? s.NonDeductibleReason : null,
        ExcludedFromTurnover: row.Key.Kind == BufferLineKind.FixedAsset);                   // CR-TAX-07 (R2)

    // 4) НХАТ (R2, BR-TAX-94)
    var ctGl = new List<GlPostingLine>(); CityTaxLedgerLine? ctLine = null;
    if (row.CityTaxAmount != 0m)
    {
        var ct = row.Key.ResolvedCityTax!;
        if (sale) ctGl.Add(SysLine($"{baseKey}/CT", ct.PayableAccountId!.Value, row.CityTaxAmount, row));
        else if (ct.ExpenseAccountId is { } exp) ctGl.Add(SysLine($"{baseKey}/CT", exp, row.CityTaxAmount, row));
        else baseLine = baseLine with { Amount = baseLine.Amount + row.CityTaxAmount };
        ctLine = new CityTaxLedgerLine(sale ? "SALE" : "PURCHASE", [baseKey], vatDate, ct,
                                       Base: row.CityTaxBase, Amount: row.CityTaxAmount, party);
    }
    // 5) Суурь мөр 0 боловч НӨАТ ≠ 0 (ижил дансны +/− мөр buffer-т цэвэрлэгдээд, хуваарилалтын 1 нэгж үлдсэн; 05 BR-PST-25 нь 0 мөрийг хориглоно)
    if (baseLine.Amount == 0m && vatGl.Count > 0)
    {
        baseLine = null;                                                                 // суурь G/L мөр бичигдэхгүй
        vatLine = vatLine with { GlLineKeys = [vatGl[0].Key] };                          // VAT entry → VAT дансны мөр (gl_entry_no)
    }
    return new VatComposition(baseLine, vatGl, vatLine, ctGl, ctLine);                  // BaseLine nullable
}
```

Харилцагч/нийлүүлэгчийн мөр = −Σ(суурь + VAT + НХАТ мөр) (05 §5.7.1). Урвуу тооцоонд 1300 ба 2305 бие биеэ нөхөх тул өглөг = цэвэр дүн (BR-TAX-59). Алхам 5 нь зөвхөн буфферийн `Amount = 0`, `VatAmount ≠ 0` мөрөнд (05 §5.7.1 нь гурвуулаа 0 мөрийг хасдаг) — тэнцэл харилцагчийн мөрөөр хадгалагдана.

### 5.6 VAT ledger writer (`VatLedgerWriter : ILedgerWriter, IReversibleLedger`, order 10)

```csharp
public async Task<IReadOnlyList<PostingError>> ValidateLockedAsync(IPostingContext ctx, IReadOnlyList<VatLedgerLine> lines, CancellationToken ct)
{
    var errs = new List<PostingError>();
    var co = await _company.LoadAsync(ctx, ct);
    foreach (var d in lines.Where(l => l.EntryType != "SETTLEMENT").Select(l => l.VatDate).Distinct())
    {
        if (!co.IsVatRegistered(d)) continue;                                                  // BR-TAX-40
        var p = await ctx.QuerySingleOrDefaultAsync<VatPeriodRow>(Sql.PeriodCovering, new { d }, ct);
        if (p is null) errs.Add(Err("tax.vat_period_missing", new { vatDate = d }));
        else if (p.Status != "OPEN") errs.Add(Err("tax.vat_period_closed", new { vatDate = d, status = p.Status }));
        // R2: user_setup.allow_vat_date_from/to → tax.vat_date_outside_user_window (BR-TAX-41)
    }
    foreach (var l in lines.Where(l => l.EntryType == "PURCHASE" && l.DeductibleConfirmed && l.Setup.CalcType == "NORMAL"
                                       && l.Amount != 0m && l.SupplierEbarimtId is null))
        errs.Add(Err("tax.supplier_receipt_id_required"));                                    // DB CHECK-ийн өмнөх шалгалт
    foreach (var l in lines.Where(l => l.EntryType == "PURCHASE" && l.Setup.CalcType == "FULL_VAT"
                                       && (string.IsNullOrWhiteSpace(l.Party?.ExternalDocumentNo) || l.Party?.DocumentDate is null)))
        errs.Add(Err("tax.customs_declaration_required"));                                    // BR-TAX-62 (мэдүүлгийн № ба огноо)
    return errs;
}

public async Task WriteAsync(IPostingContext ctx, IReadOnlyList<VatLedgerLine> lines, CancellationToken ct)
{
    long first = await ctx.ReserveEntryNumbersAsync(LedgerCodes.VatEntry, lines.Count, ct);   // BR-TAX-33
    var rows = lines.Select((l, i) => VatEntryRow.From(l, entryNo: first + i,
                   glEntryNo: ctx.GlEntryNo(l.GlLineKeys[0]), voucher: ctx.VoucherOf(l.GlLineKeys[0]),
                   closed: l.EntryType == "SETTLEMENT" || l.PairedWithEntryNo is not null,
                   closedBy: l.PairedWithEntryNo,
                   periodId: l.Settlement?.PeriodId)).ToList();
    await ctx.ExecAsync(Sql.InsertVatEntries, VatEntryRow.ToArrays(rows), ct);                // INSERT … SELECT FROM unnest(@…)
    await ctx.ExecAsync(Sql.InsertGlVatLinks, rows.Select(r => (r.GlEntryNo, r.EntryNo)), ct);
    foreach (var (l, r) in lines.Zip(rows))
    {
        if (l.Settlement is { } st)                                                             // BR-TAX-73
            foreach (var src in st.SourceEntryNos)
                await ctx.LedgerUpdateAsync("tax.vat_entry", src,
                    new { closed = true, closed_by_entry_no = r.EntryNo, vat_return_period_id = st.PeriodId }, ct);
        if (l.PairedWithEntryNo is { } orig)                                                    // BR-TAX-51
            await ctx.LedgerUpdateAsync("tax.vat_entry", orig, new { closed = true, closed_by_entry_no = r.EntryNo }, ct);
    }
    ctx.RegisterVatEntryRange(first, first + lines.Count - 1);                                  // gl_register.from/to_vat_entry_no
}

public async Task ReverseAsync(IReversalContext ctx, CancellationToken ct)                     // BR-TAX-34
{
    var src = await ctx.QueryAsync<VatEntryRow>(Sql.VatEntriesByTransactions, new { ctx.OriginalTransactionNos }, ct);
    foreach (var e in src.Where(e => e.EntryType != "SETTLEMENT"))
        if (e.Closed || e.VatReturnPeriodId is not null) ctx.Fail("gl.reversal_vat_settled", new { e.EntryNo });
    long first = await ctx.ReserveEntryNumbersAsync(LedgerCodes.VatEntry, src.Count, ct);
    var mirrors = src.OrderByDescending(e => e.EntryNo)
                     .Select((e, i) => e.Mirror(entryNo: first + i, glEntryNo: ctx.MirrorOfGlEntry(e.GlEntryNo),
                                               transactionNo: ctx.MirrorOfTransaction(e.TransactionNo))).ToList();
    await ctx.ExecAsync(Sql.InsertVatEntries, VatEntryRow.ToArrays(mirrors), ct);              // vat_date, snapshot хэвээр
    await ctx.ExecAsync(Sql.InsertGlVatLinks, mirrors.Select(m => (m.GlEntryNo, m.EntryNo)), ct);
    foreach (var (e, m) in src.OrderByDescending(e => e.EntryNo).Zip(mirrors))
    {
        await ctx.LedgerUpdateAsync("tax.vat_entry", e.EntryNo, new { reversed = true, reversed_by_entry_no = m.EntryNo }, ct);
        if (e.EntryType == "SETTLEMENT")                                                         // хаалтыг цуцлах (BR-TAX-79)
            await ctx.ExecAsync(Sql.ReopenSourcesOfSettlement, new { settlementEntryNo = e.EntryNo }, ct);
    }
    ctx.RegisterVatEntryRange(first, first + mirrors.Count - 1);
}
```

`Sql.ReopenSourcesOfSettlement` нь `closed_by_entry_no = @s` мөр бүрд `platform.fn_ledger_update('tax.vat_entry', entry_no, '{"closed":false,"closed_by_entry_no":null}')` дуудна. `VatEntryRow.Mirror`: `base`, `amount`, `non_deductible_*`, `vat_difference` эсрэг тэмдэгтэй; `reversed = true`, `reversed_entry_no = e.entry_no`; SETTLEMENT толин тусгалын `closed = true`.

### 5.7 Журналын мөрийн НӨАТ (`IJournalVatHandler`, Tax)

05 §5.4.2, §6.4-ийн gross аргыг дагана. Tax-ийн нэмэлт:

1. `Resolve(vat_bus, vat_prod, gen_posting_type ↦ direction, vat_date ?? posting_date, co, reason)` — НӨАТ төлөгч бус компанид худалдан авалтын НӨАТ хасагдахгүй (BR-TAX-55), `SALE` журналд зөвхөн NORMAL (BR-TAX-07).
2. NORMAL: `VAT = RV(A × r/(100 + r))`, суурь `A − VAT`; `vat_difference` (BR-TAX-26). REVERSE_CHARGE: `A` цэвэр, `SA = RV(A × r/100)`. FULL_VAT: `VAT = A`, данс = `purchase_vat_account_id`, `SystemDerived`.
3. Хасагдахгүй хувь: `VAT_nd = R(VAT × nd%/100)`, `Base_nd = R((A − VAT) × nd%/100)`.
4. Composer-ийг (§5.5) нэг мөрийн buffer row-оор дуудна. `supplier_ebarimt_id` нь `journal_line.supplier_ebarimt_id`; NORMAL худалдан авалтын `deductible_confirmed = false` (журналд `confirmInputVat` байхгүй; баталгаажуулалт §5.8); гаалийн мөрийн мэдүүлэг = `external_document_no` ба `document_date`.
5. VAT entry-ийн харилцагч: ваучерын partner мөр (BR-PST-23-аар нэг).

### 5.8 Орцын НӨАТ-ын баталгаажуулалт ба татгалзал

**Баталгаажуулах** (`IInputVatService.ConfirmDeductibleAsync`, `ACTION tax.vat_entry.confirm_deductible`). Tax өөрийн public endpoint-гүй; дуудагч нь 12-ын `POST /purchase-receipts/{id}:confirm` (PUR-04), 07-ийн `POST /purchase-invoices/{id}:link-ebarimt` (`confirm = true`, BR-PUR-49) ба S-TAX-05-ийн бөөн баталгаажуулалт (тэр нь мөн `:confirm`-ийг баримт тус бүрд дуудна); `Idempotency-Key` нь тэдгээр endpoint-ийнх. Posting дээрх баталгаажуулалт (07 BR-PUR-47, `confirmInputVat = true`) нь VAT entry-г шууд `true`-аар бичнэ (энэ функцийг дуудахгүй):

```csharp
public async Task<ConfirmResult> ConfirmDeductibleAsync(ConfirmDeductibleCommand c, CancellationToken ct)
{
    // c: PurchaseInvoiceId эсвэл EntryNos[], SupplierEbarimtId (33 орон) — BR-TAX-47
    if (c.SupplierEbarimtId is not null && !Regex.IsMatch(c.SupplierEbarimtId, "^[0-9]{33}$"))
        throw Validation("ebarimt.purchase_receipt_ddtd_invalid");             // 07 BR-PUR-42, 12
    var s = _session;                                                  // pipeline-ийн transaction
    await s.ExecAsync(Sql.LockCompanyPosting, new { s.TenantId, s.CompanyId }, ct);    // хаалттай зэрэгцэхгүй (BR-PST-60)
    var docNos = await ResolveDocumentsAsync(c, ct);                   // нэхэмжлэх + түүнийг засах кредит нот (BR-TAX-36)
    var entries = await s.QueryAsync<VatEntryRow>(Sql.ConfirmableEntries, new { docNos }, ct);
    //  WHERE entry_type = 'PURCHASE' AND vat_calculation_type = 'NORMAL' AND amount <> 0
    //    AND NOT deductible_confirmed AND NOT closed AND NOT reversed AND vat_return_period_id IS NULL
    if (entries.Count == 0) return ConfirmResult.NothingToConfirm;     // идемпотент
    // ДДТД-ийн нийцлийг зөвхөн НЭХЭМЖЛЭХИЙН entry-ээр шалгана; кредит нот өөрийн буцаалтын ДДТД-тэй байж болно (BR-TAX-36, -49)
    var existing = entries.Where(e => e.DocumentType != "CREDIT_MEMO")
                          .Select(e => e.SupplierEbarimtId).Where(x => x is not null).Distinct().ToList();
    if (existing.Count > 1) throw Conflict("tax.supplier_receipt_id_mismatch", new { existing });   // SingleOrDefault-ийн exception-аас өмнө
    var ddtd = c.SupplierEbarimtId ?? existing.SingleOrDefault()
               ?? throw Validation("tax.supplier_receipt_id_required");
    if (existing.Any(x => x != ddtd)) throw Conflict("tax.supplier_receipt_id_mismatch", new { existing });
    var now = _clock.GetUtcNow(); var lateWarnings = new List<TaxIssue>();
    foreach (var e in entries)
    {
        await s.LedgerUpdateAsync("tax.vat_entry", e.EntryNo, new {
            deductible_confirmed = true, deductible_confirmed_at = now, deductible_confirmed_by = s.UserId,
            supplier_ebarimt_id = e.SupplierEbarimtId ?? ddtd }, ct);                        // байгаа ДДТД-ийг дарахгүй
        if (await PeriodStatusAsync(e.VatDate, ct) is "CLOSED" or "SUBMITTED")
            lateWarnings.Add(Warn("W-TAX-10", new { e.EntryNo, e.VatDate }));                // BR-TAX-49
    }
    await _purchaseReceipts.MarkConfirmedAsync(ddtd, c.PurchaseInvoiceId, s, ct);         // EBarimt.Contracts (12 PUR-04)
    return new ConfirmResult(entries.Select(e => e.EntryNo).ToList(), lateWarnings);
}
```

**Цуцлах** (`IInputVatService.UnconfirmAsync`, `:unconfirm`, 07 BR-PUR-51, Should): `fn_lock_company_posting`-ийн дор; entry бүр `NOT closed`, `vat_return_period_id IS NULL`, `NOT reversed` (эс бөгөөс `tax.vat_entry_closed`); `deductible_confirmed = false`, `_at`/`_by` = NULL (whitelist), `supplier_ebarimt_id` хэвээр. Entry нэмэгдэхгүй тул нээлттэй ТТ-03а-г `scopeVersion` (BR-TAX-69) хуучруулна.

**R2 автомат.** EBarimt нь импортын тулгалтын дараа outbox `ebarimt.purchase_receipts.imported` (`{ companyId, importRunId, matched: [{ receiptId, ddtd, purchInvHeaderId, autoConfirm }] }`) нийтэлнэ. Tax-ийн inbox handler `autoConfirm = true` мөр бүрд дээрх `ConfirmDeductibleAsync`-ийг шинэ transaction-д дуудна (12 PUR-12).

**Татгалзах** (зардалд шилжүүлэх; `POST /input-vat:write-off` — 07 §5.12-ийн нэр, `POST /input-vat:preview-write-off` — санал; BR-TAX-51). Posting engine-ийн нэг run (`IPostingDocumentSource`, түгжээний дор угсарна):

```csharp
sealed class RejectDeductionSource(Guid purchInvoiceId, DateOnly postingDate, Guid reasonCodeId, string reason) : IPostingDocumentSource
{
    public async ValueTask<PostingDocument?> BuildAsync(IPostingReadContext ctx, CancellationToken ct)
    {
        var es = await ctx.QueryAsync<VatEntryWithBase>(Sql.RejectableEntries, new { purchInvoiceId }, ct);
        // BR-TAX-50-ийн entry + суурь G/L entry-ийн данс, dimension set (gl_entry_vat_entry_link-ээр)
        if (es.Count == 0) throw Conflict("tax.deduction_reject_not_allowed");
        var gl = new List<GlPostingLine>(); var vat = new List<VatLedgerLine>(); int n = 0;
        foreach (var e in es)
        {
            var key = $"V1/R{++n}";
            gl.Add(SysLine($"{key}/EXP", e.BaseGlAccountId, +e.Amount, e.DimensionSetId));      // Дт зардал (хасагдахгүй болсон НӨАТ)
            gl.Add(SysLine($"{key}/VAT", e.PurchaseVatAccountId, -e.Amount, e.DimensionSetId)); // Кт 1300
            vat.Add(e.ToRejectionLine(glKey: $"{key}/EXP", vatDate: postingDate, reason: reason)
                     with { PairedWithEntryNo = e.EntryNo });  // base −b, amount −a, nd_base +b, nd_amount +a
        }
        return new PostingDocument {
            Run = new("VATADJ", "INPUT_VAT_WRITE_OFF" /*07 SCR-PUR-11; тэр хүртэл GENERAL_JOURNAL*/, SourceRef.PurchaseInvoice(purchInvoiceId), null, null),
            Vouchers = [ new PostingVoucher { Key = "V1", Numbering = new VoucherNumbering.FromSeries("GJ"),
                         DocumentType = "NONE", PostingDate = postingDate, ReasonCodeId = reasonCodeId,
                         Description = $"Орцын НӨАТ хасагдахгүй: {es[0].DocumentNo}", GlLines = gl, SubledgerLines = vat } ] };
    }
}
```

- Эсрэг VAT entry-ийн `vat_date` = эх entry-ийн `vat_date` биш, **`postingDate`** (одоогийн нээлттэй НӨАТ-ын үе; хаагдсан үед entry оруулах боломжгүй, `ERV01`). Хос нь `closed = true` тул дараагийн хаалтад зөвхөн оноогдож, G/L-ийн нийлбэрт орохгүй (BR-TAX-73), ТТ-03а-гийн мөр 11 (мэдээлэл)-д хасагдахгүй НӨАТ болж харагдана.
- Нийлүүлэгчийн баримт eBarimt-д `REJECTED` болсон бол (12 §16.1) энэ үйлдлийг UI санал болгоно.
- `RejectableEntries` нь нэхэмжлэх **ба** түүнийг засах баталгаажаагүй кредит нотын entry-г хамт авна (кредит нотын entry сөрөг тул Дт/Кт эсрэг). Бүрэн кредит нотлогдсон нэхэмжлэхэд ваучерын мөрүүд бие биеэ нөхөх ч entry бүр хос авч хаагдана (BR-TAX-50-ийн жагсаалтаас гарна).
- Суурь G/L данс одоо `blocked` эсвэл `account_type ≠ POSTING` бол engine-ийн `gl.account_blocked`/`gl.account_not_posting` (05) — хэрэглэгч дансыг түр нээх ёстой; Tax өөр дансанд шилжүүлэхгүй. Хос мөр `SystemGenerated` тул `direct_posting`-ийн шалгалтад орохгүй (1300).
- Ваучерын мөр `gen_posting_type = NONE`, НӨАТ-ын бүлэггүй (VAT entry-г writer шууд бичнэ; 05 R-VAT-17-ийн журналын шалгалт хамаарахгүй).

### 5.9 ТТ-03а-гийн тооцоо (`IVatReturnService.CalculateAsync`)

**Scope** (BR-TAX-66, -67) — SQL нь нэгтгэсэн мөр буцаана, мөрийн утгыг санах ойд тооцно:

```sql
-- Sql/VatReturn.ScopeAggregate.sql   (@periodId, @end, @regFrom, @open)
SELECT e.entry_type, e.vat_bus_posting_group AS vat_bus, e.vat_prod_posting_group AS vat_prod,
       e.vat_category, e.vat_calculation_type, e.deductible_confirmed,
       sum(e.base) AS base, sum(e.amount) AS amount,
       sum(e.non_deductible_base) AS nd_base, sum(e.non_deductible_amount) AS nd_amount,
       count(*) AS entries, max(e.entry_no) AS max_entry_no
  FROM tax.vat_entry e
 WHERE e.company_id = platform.current_company_id()
   AND e.entry_type IN ('SALE','PURCHASE')
   AND CASE WHEN @open THEN
            e.vat_return_period_id IS NULL
            AND e.vat_date <= @end
            AND (@regFrom IS NULL OR e.vat_date >= @regFrom)
            AND (e.entry_type = 'SALE' OR e.deductible_confirmed OR e.amount = 0 OR e.closed OR e.reversed)
       ELSE e.vat_return_period_id = @periodId END
 GROUP BY 1, 2, 3, 4, 5, 6;
```

**Мөрийн тооцоо** (R-VAT-26, R-VAT-27):

```csharp
public VatStatementResult Evaluate(IReadOnlyList<StatementLine> lines, IReadOnlyList<ScopeAgg> agg,
                                   Func<StatementLine, decimal> accountTotal)
{
    var byRow = lines.Where(l => l.RowNo is not null).ToDictionary(l => l.RowNo!);
    var value = new Dictionary<int, decimal>();                  // line_no → тооцоонд орох утга (calc sign-тэй)

    decimal Calc(StatementLine l, int depth, ImmutableHashSet<int> path)
    {
        if (value.TryGetValue(l.LineNo, out var v)) return v;
        if (depth > 6 || path.Contains(l.LineNo)) throw Issue("tax.vat_statement_row_cycle", new { path });
        decimal raw = l.LineType switch
        {
            "DESCRIPTION" => 0m,
            "VAT_ENTRY_TOTALING" => agg
                .Where(a => a.EntryType == l.GenPostingType
                         && (l.VatBusCode  is null || a.VatBus  == l.VatBusCode)          // NULL = бүгд (Z-TAX-10)
                         && (l.VatProdCode is null || a.VatProd == l.VatProdCode)
                         && (l.VatCategory is null || a.VatCategory == l.VatCategory)
                         && (!l.OnlyDeductibleConfirmed || a.DeductibleConfirmed))
                .Sum(a => l.AmountType switch {
                    "AMOUNT" => a.Amount, "BASE" => a.Base,
                    "NON_DEDUCTIBLE_AMOUNT" => a.NdAmount, "NON_DEDUCTIBLE_BASE" => a.NdBase,
                    "FULL_AMOUNT" => a.Amount + a.NdAmount, "FULL_BASE" => a.Base + a.NdBase, _ => 0m }),
            "ACCOUNT_TOTALING" => accountTotal(l),                                             // BR-TAX-68
            "ROW_TOTALING" => RowFilter.Resolve(l.RowTotaling!, lines)                        // "a|b", "a..b" (line_no-оор)
                                       .Sum(r => Calc(r, depth + 1, path.Add(l.LineNo))),
            _ => 0m
        };
        v = l.LineType == "ROW_TOTALING" || l.CalculateWith == "SIGN" ? raw : -raw;           // ROW_TOTALING-д OPPOSITE хориотой
        value[l.LineNo] = v;
        return v;
    }

    var rows = lines.Select(l => {
        var v = Calc(l, 0, ImmutableHashSet<int>.Empty);
        decimal? printed = !l.Print || l.LineType == "DESCRIPTION" ? null : (l.PrintWith == "SIGN" ? v : -v);
        return new VatStatementRow(l.LineNo, l.RowNo, l.Description, l.BoxNo, v, printed, DrillFilter(l));
    }).ToList();
    return new VatStatementResult(rows, LastVatEntryNo: _lastEntryNo, UnconfirmedInputVat: _unconfirmed);
}
```

- `RowFilter`: `|`-ээр тусгаарласан `row_no`-ууд; `a..b` нь `row_no = a` мөрөөс `row_no = b` мөр хүртэлх **`line_no`-ийн** муж (BC-ийн Code-ийн тэмдэгт мөрийн харьцуулалт `"7".."11"`-ийг хоосон болгодог тул). Олдохгүй `row_no` → `tax.vat_statement_line_invalid`.
- `accountTotal(l)` = `SELECT sum(amount) FROM gl.gl_entry WHERE gl_account_id IN (шүүлтийн данс) AND vat_date BETWEEN @start AND @end` (`calculate_with`-ийг дээрх мөр хэрэглэнэ).
- Хариу: мөр бүр (`value`, `printed`, `drillFilter` = `{ entryType, vatBus, vatProd, vatCategory, onlyConfirmed, periodScope }`), `lastVatEntryNo` (`SELECT max(entry_no) FROM tax.vat_entry`), `scopeVersion` (BR-TAX-69; scope-ийн агрегатын ижил query-д `count(*)`, `sum`, `max(deductible_confirmed_at)`-ийг нэмж тооцно), `unconfirmedInputVat` (BR-TAX-50-ийн тоо ба `Σ amount`), анхааруулга (W-TAX-05, W-TAX-06, W-TAX-09). Хадгалахгүй (UX-VAT-02).
- Drill-down: `GET /vat-entries?periodScope={periodId}&entryType=…&vatBus=…` нь ижил scope-ийн entry жагсаалт.

### 5.10 НӨАТ-ын хаалт (`:close`, `:preview-close`)

**Урсгал.**

```mermaid
sequenceDiagram
    autonumber
    actor U as Нягтлан
    participant API as Api pipeline
    participant VR as VatReturnService (Tax)
    participant PE as PostingEngine (GL)
    participant SW as VatSettlementDocumentWriter (Tax)
    participant VW as VatLedgerWriter (Tax)
    participant DB as PostgreSQL
    U->>API: POST /vat-return-periods/{id}:close {postingDate, settlementAccountId?, expectedScopeVersion, expectedLastVatEntryNo?} (Idempotency-Key)
    API->>VR: Close(cmd)
    Note over VR: A үе: эрх, НӨАТ төлөгч, үеийн төлөв, өмнөх үе, огноо, данс (бүгдийг цуглуулна)
    VR->>PE: PostAsync(VatSettlementSource, mode)
    PE->>DB: fn_lock_company_posting
    PE->>VR: BuildAsync (түгжээний дор): үе FOR UPDATE + status, scopeVersion (BR-TAX-69), scope, бүлэглэл → SettlementPlan
    alt G/L мөр байхгүй
        VR-->>PE: null (NothingToPost)
        VR->>DB: fn_ledger_update vat_return_period_id (оноолт), status = CLOSED, outbox tax.vat_period.closed, audit VAT_PERIOD_CLOSE
    else G/L мөртэй
        PE->>DB: GJ дугаар, gl_transaction, gl_entry
        PE->>VW: WriteAsync: SETTLEMENT entry, эх entry closed/closed_by/vat_return_period_id
        PE->>SW: WriteAsync: зөвхөн оноолт, status = CLOSED, settlement_transaction_no
        PE->>DB: outbox tax.vat_period.closed, gl_register, posting_log
    end
    API->>DB: COMMIT (Preview: SET CONSTRAINTS ALL IMMEDIATE; ROLLBACK)
    API-->>U: 200 VatCloseResult {statement, voucher, warnings}
```

**Төлөвлөгөө (`SettlementPlanner`, цэвэр функц):**

```csharp
public SettlementPlan Plan(VatPeriod p, IReadOnlyList<ScopeEntry> scope, Func<string, string, SetupAccounts> setupByCodes,
                           Guid settlementAccountId, DateOnly postingDate)
{
    var gl = new List<GlPostingLine>(); var vat = new List<VatLedgerLine>(); var assignOnly = new List<long>();
    decimal net = 0m; int n = 0;
    var groups = scope.GroupBy(e => (e.VatBus, e.VatProd, e.EntryType))
                      .OrderBy(g => g.Key.VatBus, StringComparer.Ordinal)
                      .ThenBy(g => g.Key.VatProd, StringComparer.Ordinal)
                      .ThenBy(g => g.Key.EntryType == "PURCHASE" ? 0 : 1);                       // BR-TAX-74
    foreach (var g in groups)
    {
        assignOnly.AddRange(g.Where(e => e.Closed).Select(e => e.EntryNo));                      // татгалзлын хос
        var open = g.Where(e => !e.Closed).ToList();
        if (open.Count == 0) continue;
        decimal sb = open.Sum(e => e.Base), sa = open.Sum(e => e.Amount);
        decimal snb = open.Sum(e => e.NdBase), sna = open.Sum(e => e.NdAmount);
        string calc = open.Select(e => e.CalcType).Distinct().Single();                          // BR-TAX-03
        bool rc = calc == "REVERSE_CHARGE";
        if (sa == 0m && !(rc && sna != 0m)) { assignOnly.AddRange(open.Select(e => e.EntryNo)); continue; }
        var acc = setupByCodes(g.Key.VatBus, g.Key.VatProd);
        var key = $"V1/S{++n}";
        var groupsSnap = new PostingGroupSnapshot(null, null, g.Key.VatBus, g.Key.VatProd);
        if (!rc)
        {
            var account = g.Key.EntryType == "SALE" ? acc.SalesVatAccountId : acc.PurchaseVatAccountId;
            gl.Add(Settle($"{key}/VAT", account, -sa, groupsSnap));                              // 2300 Дт / 1300 Кт
            net += sa;
        }
        else
        {
            if (sa != 0m) gl.Add(Settle($"{key}/VAT", acc.PurchaseVatAccountId, -sa, groupsSnap));   // 1300 Кт хасагдах
            gl.Add(Settle($"{key}/VAT2", acc.ReverseChargeAccountId, sa + sna, groupsSnap));          // 2305 Дт бүтэн
            net -= sna;                                                                                // хасагдахгүй хэсэг → төлөх
        }
        var linkKey = !rc || sa != 0m ? $"{key}/VAT" : $"{key}/VAT2";                         // SETTLEMENT entry → VAT дансны мөр
        vat.Add(new VatLedgerLine("SETTLEMENT", [linkKey],
                    VatDate: p.EndingDate, Base: -sb, Amount: -sa, NonDeductibleBase: -snb, NonDeductibleAmount: -sna,
                    VatDifference: 0m, Setup: acc.Snapshot(calc), Groups: groupsSnap, Party: null,
                    DeductibleConfirmed: false, SupplierEbarimtId: null, NonDeductibleReason: null, ExcludedFromTurnover: false,
                    Settlement: new SettlementLink(p.Id, open.Select(e => e.EntryNo).ToList())));
    }
    if (net != 0m) gl.Add(Settle("V1/NET", settlementAccountId, net, groups: null, genPostingType: "NONE")); // BR-TAX-76
    // Шалгалт: Σ gl = 0 (BR-PST-25); net < 0 = төлөх (2310 Кт), net > 0 = буцаан авах/дараа сард шилжих (2310 Дт)
    return new SettlementPlan(gl, vat, assignOnly, Net: net);
}
```

- `Settle(...)` мөр: `Origin = SystemGenerated`, `GenPostingType = "SETTLEMENT"` (VAT дансны мөрт), `VatDate = p.EndingDate`, dimension set 0.
- **Ваучер:** `PostingVoucher { Key = "V1", Numbering = FromSeries(GENERAL template-ийн posting цуврал), DocumentType = "NONE", PostingDate = postingDate, SourceCode = "VATSTMT", Description = "НӨАТ-ын хаалт 2027-05" }`; R2-т НХАТ-ын хаалт `V2` (`CITYTAXSTMT`, §5.15) ижил `PostingDocument`-д (05 BR-PST-02: нэг run).
- **`BuildAsync`** (хоёр замд ч, engine-ийн advisory lock-ийн дор): `SELECT … FROM tax.vat_return_period WHERE id = @p FOR UPDATE`; `status = 'OPEN'` (`tax.vat_period_not_open`); scope-ийн `scopeVersion`-ийг дахин тооцож `expectedScopeVersion`-тэй (байхгүй бол `max(entry_no)`-ийг `expectedLastVatEntryNo`-тэй) харьцуулна (`tax.vat_statement_stale`); `setupByCodes` нь блоклогдсон setup мөрийг ч уншина (BR-TAX-03), олдохгүй бол `tax.vat_posting_setup_missing`.
- **`VatSettlementDocumentWriter : IPostedDocumentWriter`**: `LockSourceAsync` — дээрх шалгалтыг давтана (ижил transaction, хямд); `WriteAsync` — `assignOnly` бүрд `fn_ledger_update('tax.vat_entry', n, '{"vat_return_period_id": P}')`, `UPDATE tax.vat_return_period SET status = 'CLOSED', settlement_transaction_no = ctx.TransactionNo("V1"), updated_at/by`, outbox.
- **G/L мөргүй тохиолдол** (жишээ нь зөвхөн 0 %-ийн борлуулалт, эсвэл бүх бүлгийн Σ = 0, R2-т НХАТ-ын `V2` ч хоосон): `BuildAsync` нь `null` буцааж (engine `NothingToPost`, 05 §5.13), `VatReturnService` ижил transaction-д (advisory lock ба `FOR UPDATE` хэвээр) оноолт, `status = 'CLOSED'`, outbox `tax.vat_period.closed` (`settlementTransactionNo = null`), `audit.security_event` `VAT_PERIOD_CLOSE`-ийг өөрөө бичнэ; `settlement_transaction_no = NULL`. Preview горимд энэ замыг алгасна (engine `MarkRollbackOnly`).
- **Preview:** ижил код; G/L-тэй бол engine-ийн preview (05 BR-PST-52, дугаар `***`), G/L-гүй бол төлөвлөгөөг бичихгүйгээр буцаана.

### 5.11 Илгээсэн гэж тэмдэглэх ба дахин нээх

**`:submit`** (`ACTION tax.vat_return.submit`, MFA + step-up, `Idempotency-Key`):

```text
BEGIN; fn_set_context; fn_lock_company_posting
p := SELECT … FROM tax.vat_return_period WHERE id = @id FOR UPDATE
if p.status = 'SUBMITTED': raise 409 tax.vat_period_already_submitted
if p.status <> 'CLOSED':   raise 409 tax.vat_period_not_closed
if trim(@ref) = '' or len(@ref) > 100: raise 422 tax.submission_reference_required
UPDATE tax.vat_return_period SET status = 'SUBMITTED', submitted_at = now(), submitted_by = @user, submission_reference = @ref
stmt := VatReturnService.Calculate(p.id, 'TT03A')                                  -- scope = vat_return_period_id = p (BR-TAX-66)
snapshot := { rows: [(line_no, row_no, value, printed)], scopeVersion, sha256(canonical JSON) }   -- BR-TAX-78, mn-tax R19
effects := []
for ap in gl.accounting_period overlapping [p.starting_date, p.ending_date]:
    if ap.status = 'CLOSED': effects += { type: 'SUGGEST_GL_PERIOD_LOCK', accountingPeriodId: ap.id }   -- Z-TAX-04
INSERT outbox tax.vat_period.submitted; audit.security_event 'VAT_PERIOD_SUBMITTED' (details = snapshot; CR-TAX-15-ийн дараа tax.vat_return_snapshot)
COMMIT → 200 { period, effects }
```

**`:reopen`** (`ACTION tax.vat.reopen`, Owner, step-up, `{ reasonCodeId?, reasonText }`):

```text
BEGIN; fn_set_context; (IReversalService нь fn_lock_company_posting авна)
p := … FOR UPDATE
if p.status = 'SUBMITTED': raise 409 tax.vat_period_submitted
if p.status <> 'CLOSED':   raise 409 tax.vat_period_not_closed                       -- аль хэдийн OPEN
if exists later period with status IN ('CLOSED','SUBMITTED'): raise 409 tax.vat_period_reopen_not_latest
if len(trim(reasonText)) < 10: raise 422 tax.reopen_reason_required
txs := [p.settlement_transaction_no, p.city_tax_settlement_transaction_no /* R2, CR-TAX-06 */] (NULL-ийг хасна)
if txs is not empty:                                                                  -- нэг run (05 BR-PST-02): хоёр гүйлгээг хамт
    IReversalService.Reverse(transactionNos = txs, allowedSourceCodes = ['VATSTMT', 'CITYTAXSTMT'],
                             reasonCodeId, description = 'НӨАТ-ын хаалт цуцлав')   -- эх огноо; gl.period_closed боломжтой
    -- VatLedgerWriter.ReverseAsync: SETTLEMENT толин тусгал; эх entry closed = false (BR-TAX-79)
    -- CityTaxLedgerWriter.ReverseAsync (R2): SETTLEMENT толин тусгал; эх city_tax_entry closed = false
for e in tax.vat_entry WHERE vat_return_period_id = p.id AND entry_type IN ('SALE','PURCHASE'):
    fn_ledger_update('tax.vat_entry', e.entry_no, '{"vat_return_period_id": null}')   -- SETTLEMENT entry түүхэнд id-гаа хадгална
UPDATE tax.vat_return_period SET status = 'OPEN', settlement_transaction_no = NULL   -- R2: city_tax_settlement_transaction_no = NULL
INSERT outbox tax.vat_period.reopened (+ notify); audit.security_event 'VAT_PERIOD_REOPEN' (шалтгаантай)
COMMIT
```

Тэмдэглэл: хаалтын ваучерын нягтлан бодох үе аль хэдийн `CLOSED` бол буцаалт `gl.period_closed`-оор зогсоно; энэ тохиолдолд хэрэглэгч (Owner) тэр сарыг нээх (13 §8.4) эсвэл залруулгыг дараагийн нээлттэй НӨАТ-ын үед хийнэ.

### 5.12 ТТ-03а-5, ТТ-03а-6 бүртгэл ба экспорт

Reporting модуль `IVatReturnQuery.GetScopeEntriesAsync(periodId)` (BR-TAX-66-ийн scope, entry түвшинд) ба Parties, EBarimt-ийн contract-аар нэр, ДДТД-ийг баяжуулна (Tax нь `party` хүснэгтэд хандахгүй).

**ТТ-03а-5 (худалдан авалт).** Хэсэг ба мөр (баримт × ДДТД тутамд нэг мөр, entry-ийг нэгтгэнэ):

| Хэсэг | Шүүлт | Багана |
|---|---|---|
| А. Дотоодын худалдан авалт | PURCHASE, NORMAL, `deductible_confirmed`, `amount ≠ 0` | №, нийлүүлэгчийн ТТД (`party_tin`), нэр, ДДТД (`supplier_ebarimt_id`), баримтын огноо (`document_date`), НӨАТ-ын огноо, нийлүүлэгчийн баримтын № (`external_document_no`), манай дугаар (`document_no`), суурь (`base`), НӨАТ (`amount`), хасагдахгүй НӨАТ, "хоцорч баталгаажсан" (`vat_date < P.starting_date`) |
| Б. Импорт (гааль) | PURCHASE, FULL_VAT, `deductible_confirmed` | Мэдүүлгийн № (`external_document_no`), огноо (`document_date`), НӨАТ; гаалийн үнэ (CR-TAX-05-ийн дараа) |
| В. Урвуу тооцоо | PURCHASE, REVERSE_CHARGE | Нийлүүлэгч (`foreign_tax_id`, улс), баримт, суурь, тооцсон НӨАТ (бүтэн), хасагдах хэсэг |

Нийлбэр: А.НӨАТ = мөр 8, Б = мөр 9, В.хасагдах = мөр 10, В.бүтэн = мөр 13 (BR-TAX-70; FR-TAX-014 AC1).

**ТТ-03а-6 (борлуулалт).** SALE scope, баримт тутамд: харилцагчийн ТТД (хувь хүнд хоосон, "Иргэд" гэж өдрөөр нэгтгэнэ), нэр, eBarimt-ийн ДДТД (EBarimt contract: сүүлийн `SUCCESS` баримт), огноо, ангилал, суурь, НӨАТ. Нийлбэр = мөр 1–5.

**Экспорт** (`POST /vat-return-periods/{id}:export` → 202, job `tax.vat_return.export`, max_attempts 3, timeout 2 мин): XLSX (ТТ-03а мөрийн дарааллаар + 2 хавсралт хуудас) ба CSV (хавсралт бүрд). Файлын нэр `TT03A_{ТТД}_{YYYYMM}.xlsx`. Job-ийн параметрт `lastVatEntryNo` ба `scopeVersion` (job эхлэхэд дахин тооцож зөрвөл `tax.vat_statement_stale`-аар унана); файлын эхний мөрөнд "Тооцоолсон: {цаг}, бичилт ≤ {lastVatEntryNo}, хувилбар {scopeVersion}" (D-E8; 02 §9.6; `ITaxFilingChannel = ManualExportChannel`).

### 5.13 eBarimt-тэй НӨАТ-ын тулгалт (FR-TAX-016)

```text
for doc in SALE scope of P WHERE source_code = 'SALES' AND document_type IN ('INVOICE','CREDIT_MEMO')
        grouped by (document_type, document_no):                        -- журналын SALE entry-д eBarimt байхгүй → тусдаа "журналын НӨАТ" (мэдээлэл)
    ledgerVat := −Σ amount                                              -- кредит нотод сөрөг; r.totalVat-ийг ижил тэмдэгт хөрвүүлнэ
    ledgerTotal := −Σ (base + amount) − Σ city_tax_entry.amount (ижил document_no, R2)   -- city tax entry SALE < 0
    r := IEbarimtReceiptQuery.GetNetStateBySourceDocument(doc)          -- 12 §12.3 (засварын гинжийн цэвэр төлөв)
    if r is null and company eBarimt enabled:   issue NO_RECEIPT
    else if r.status <> 'SUCCESS':              issue STATUS_{r.status}   (PENDING, SENT, ERROR, UNKNOWN)
    else if r.totalVat <> ledgerVat:            issue VAT_MISMATCH { ledgerVat, receiptVat }
result: { issues[], ledgerVatTotal, receiptVatTotal (SUCCESS-ийн нийлбэр), difference }
```

AC: 3-р сарын нэхэмжлэхийн НӨАТ 1 000 000, `SUCCESS` баримтын НӨАТ 990 000 → баримтгүй нэхэмжлэхүүд (нийт НӨАТ 10 000) жагсаалтад (FR-TAX-016 AC1). Хаалтын үед W-TAX-06.

### 5.14 НӨАТ-ын бүртгэлийн босгын хяналт (FR-TAX-012)

```sql
-- Sql/Threshold.DailyTurnover.sql  (@asOf, @excluded text[])
WITH daily AS (
    SELECT e.vat_date AS d, sum(-(e.base + e.non_deductible_base)) AS t
      FROM tax.vat_entry e
      LEFT JOIN tax.vat_bus_posting_group  b ON b.company_id = e.company_id AND b.code = e.vat_bus_posting_group
      LEFT JOIN tax.vat_prod_posting_group p ON p.company_id = e.company_id AND p.code = e.vat_prod_posting_group
      LEFT JOIN tax.vat_posting_setup s ON s.company_id = e.company_id
                                       AND s.vat_bus_posting_group_id = b.id AND s.vat_prod_posting_group_id = p.id
     WHERE e.company_id = platform.current_company_id()
       AND e.entry_type = 'SALE'
       AND e.vat_date >  (@asOf - interval '24 months')::date
       AND e.vat_date <= @asOf
       AND coalesce(s.vat_category, e.vat_category) IN ('VAT10', 'VAT0')         -- мөн чанараараа татвар ногдох (BR-TAX-83); setup-гүй бол entry-ийн ангилал
       AND coalesce(e.gen_prod_posting_group, '') <> ALL (@excluded)              -- R1: ҮХ; R2: AND NOT e.excluded_from_turnover
     GROUP BY e.vat_date)
SELECT x.d::date AS day,
       (SELECT coalesce(sum(t), 0) FROM daily WHERE daily.d > (x.d - interval '12 months')::date AND daily.d <= x.d) AS turnover
  FROM generate_series((@asOf - interval '12 months')::date + 1, @asOf, interval '1 day') AS x(d)
 ORDER BY 1;
```

```csharp
public async Task<ThresholdStatus> EvaluateAsync(DateOnly asOf, CancellationToken ct)
{
    var co = await _company.LoadAsync(ct);
    var series = await _db.QueryAsync<(DateOnly Day, decimal Turnover)>(Sql.DailyTurnover, new { asOf, excluded = _opt.ExcludedGenProdGroupCodes }, ct);
    decimal T = series[^1].Turnover;
    var M = _params.GetParameter("vat.registration_threshold_mandatory", asOf, ParameterUse.Report);
    var V = _params.GetParameter("vat.registration_threshold_voluntary", asOf, ParameterUse.Report);
    decimal m = M.RequireNumeric(), v = V.RequireNumeric();
    bool registered = co.IsVatRegistered(asOf);
    var level = registered
        ? (T < m ? ThresholdLevel.BelowMandatory : ThresholdLevel.None)
        : T >= m ? ThresholdLevel.Crossed
        : T >= 0.8m * m ? ThresholdLevel.Approaching
        : T >= v ? ThresholdLevel.VoluntaryEligible : ThresholdLevel.None;              // BR-TAX-84
    DateOnly? crossedOn = null;                                                                   // BR-TAX-85
    foreach (var x in series)
        if (x.Turnover >= _params.GetParameter("vat.registration_threshold_mandatory", x.Day, ParameterUse.Report).RequireNumeric())
        { crossedOn = x.Day; break; }
    return new ThresholdStatus(asOf, T, m, M.Id, M.IsVerified, v,
        decimal.Round(T / m * 100m, 2, MidpointRounding.AwayFromZero), level, crossedOn, registered);   // ToEven хориотой (No_bankers_rounding)
}
```

- Job `tax.vat_threshold.check` өдөр бүр 06:00 (компани тус бүр, `integration.job_run`): үр дүнгийн түвшин нь өмнөхөөсөө өөр бол outbox `tax.vat_threshold.level_changed` (`idempotency_key = 'tax.vat_threshold.level_changed:' || companyId || ':' || level || ':' || thresholdParamId`, `ON CONFLICT DO NOTHING` → нэг удаа). Сүүлийн үр дүнг `integration.job_run.result` (JSON)-д хадгална; самбарын cue ба BR-TAX-87 үүнийг уншина.
- Гүйцэтгэл: 24 сарын өдрийн нийлбэр (≤ 730 мөр) ба 366 цонх; `ix_vat_entry__vat_date` индекс.

### 5.15 НХАТ (R2)

**Тооцоолол** нь §5.4-ийн алхам 2 (НӨАТ-тэй үнэ) ба 3 (НӨАТ-гүй үнэ). **Posting** нь §5.5 алхам 4. **Writer** `CityTaxLedgerWriter` (order 15, тоолуур `CITY_TAX_ENTRY`): `city_tax_entry` (`entry_type`, `city_tax_code_id`, `tax_date = vat_date`, `base`, `amount`, `rate_percent`, `bill_to_pay_to_*`, `gl_entry_no` = суурь entry), буцаалтын толин тусгал VAT-тай ижил.

**Хаалт** (НӨАТ-ын `:close`-ийн `SettlementPlan`-д `V2` ваучер, BR-TAX-95):

```text
open := city_tax_entry WHERE entry_type = 'SALE' AND NOT closed AND tax_date <= P.ending_date
for g in open grouped by city_tax_code_id (code ASC):
    s := Σ amount (сөрөг)
    if s = 0: continue
    V2 lines: Дт payable_account(code) −s ;  Кт city_tax_setup.settlement_account_id  s   (нэгтгэсэн)
    SETTLEMENT city_tax_entry: base = −Σbase, amount = −s, closed = true; эх entry: closed = true, closed_by_entry_no
vat_return_period.city_tax_settlement_transaction_no := V2.transaction_no        -- CR-TAX-06
```

Төлбөр: Дт 2325 / Кт банк. Тайлан "НХАТ-ын тайлан" (сар, код, суурь, татвар; маягт тодорхойгүй ⚠ OQ-TAX-09).

### 5.16 Хялбаршуулсан НӨАТ (R2 · Could)

1. Профайл (CR-TAX-04): `vat_status = SIMPLIFIED`, `valid_from` = улирлын эхэн (BR-TAX-102). Эрхийн шалгалт BR-TAX-97 (`T(valid_from)`, `vat.simplified.turnover_threshold`, хасагдсан салбар).
2. Үе: `tax.fn_mn_ensure_vat_return_periods`-ийн хувилбар улирлаар (`vat.simplified.return_frequency = 'quarterly'`); `due_date` NULL.
3. Худалдан авалт: `Resolve` нь `nd% = 100`, `SIMPLIFIED_REGIME` (BR-TAX-99) — VAT entry `amount = 0`, бүгд хаалтад оноогдоно.
4. Хаалт (`SettlementPlanner.PlanSimplified`):

```csharp
var r     = _params.GetParameter("vat.standard_rate", p.StartingDate, ParameterUse.Posting).AsPercent();
var share = _params.GetParameter("vat.simplified.deemed_purchase_share", p.StartingDate, ParameterUse.Posting).RequireNumeric();
var sales = scope.Where(e => e.EntryType == "SALE" && e.VatCategory == "VAT10" && !e.Closed).ToList();
decimal O = -sales.Sum(e => e.Amount);                                   // улиралд 2300-д бичигдсэн НӨАТ
decimal S = -sales.Sum(e => e.Base) + (profile.SimplifiedBase == "VAT_INCLUSIVE" ? O : 0m);
decimal payable = MoneyMath.Round(r / 100m * S * (1m - share), P);
decimal D = O - payable;
// V1: Дт 2300 O (SETTLEMENT entry: бүлэг тус бүрд −Σ); Кт хаалтын данс payable; Кт tax_setup.simplified_vat_gain_account_id D
// Бусад бүлэг (0 %, чөлөөлөгдөх, худалдан авалт) зөвхөн оноогдоно
```

Параметр `unverified` бол `GetParameter(…, Posting)` → `tax.parameter_unverified`: `:close` боломжгүй, харин `GET /reports/simplified-vat?periodId=` нь `Report` горимоор тооцоог ⚠-тэй харуулна.

### 5.17 ААНОАТ-ын туслах тайлан (R2)

```csharp
public async Task<CitHelperResult> CalculateAsync(CitHelperRequest q, CancellationToken ct)   // q: Year, Period (Q1|H1|9M|FY), ManualAdjustments, PriorLosses[]
{
    var y0 = new DateOnly(q.Year, 1, 1); var e = PeriodEnd(q.Year, q.Period);                       // BR-TAX-104
    var gl = await _gl.SumsByCategoryAsync(y0, e, excludeClosing: true, ct);                       // GL.Contracts (view)
    decimal rev = -gl.Where(x => x.Category == "INCOME" && x.Subcategory != "DISCONTINUED").Sum(x => x.Amount);
    decimal pbt = -gl.Where(x => x.IncomeBalance == "INCOME_STATEMENT" && x.Subcategory != "INCOME_TAX").Sum(x => x.Amount);
    decimal nonDeductible = gl.Where(x => x.CitTreatment == "NON_DEDUCTIBLE").Sum(x => x.Amount);   // дебит цэвэр > 0 (CR-TAX-10; анхдагч 8430)
    decimal nonTaxable    = -gl.Where(x => x.CitTreatment == "NON_TAXABLE").Sum(x => x.Amount);     // кредит цэвэр > 0
    decimal adj = nonDeductible - nonTaxable
                + await _fa.TaxDepreciationDifferenceAsync(y0, e, ct)                                // R2 ҮХ (байхгүй бол 0)
                + q.ManualAdjustments.Sum(a => a.Amount);
    decimal ti = pbt + adj;
    decimal lossUsed = LossOffset(ti, q.PriorLosses, y0);                                          // §6.15; ⚠ unverified параметр
    decimal tiAfterLoss = Math.Max(0m, ti - lossUsed);
    decimal prevYearRev = await PriorYearRevenueAsync(q.Year - 1, ct);                             // эрхийн босгод
    var std = Banded(tiAfterLoss, y0);                                                             // §6.15
    var result = new CitHelperResult(q, rev, pbt, adj, ti, lossUsed, tiAfterLoss,
        Standard: std,
        Credit90: Eligible("cit.credit_90pct_threshold", prevYearRev, y0) ? MoneyMath.Round(std * (1m - Num("cit.credit_90pct_rate", y0)), _P) : null,
        OnePercent: Eligible("cit.turnover_regime_threshold", prevYearRev, y0) ? MoneyMath.Round(rev * Num("cit.turnover_regime_rate", y0), _P) : null,
        SimplifiedAnnual: q.Period == "FY" && !_co.IsVatRegistered(e) && prevYearRev < Num("cit.simplified_return_threshold", y0)
                          ? MoneyMath.Round(rev * Num("cit.simplified_return_rate", y0), _P) : null);       // CR-TAX-13 (параметр нэмэх)
    var prev = q.Period == "Q1" ? null : await CalculateAsync(q with { Period = Prev(q.Period) }, ct);   // BR-TAX-108
    return result with { PayableThisQuarter = result.Selected(_profile) - (prev?.Selected(_profile) ?? 0m),
                         DueDates = DueDates(q, e) };
}
```

- `Num(code, y0)` = `GetParameter(code, y0, ParameterUse.Report).RequireNumeric()` (unverified бол хариунд ⚠); `_P` = компанийн нарийвчлал.
- `Eligible(code, value, y0)` = `value ≤ Num(code, y0)` ба профайлын `excluded_sector = false`.
- Хуримтлалын ноорог (`POST /reports/cit-helper:create-accrual-draft`): `GENERAL` журналд мөр Дт 9100 / Кт 2330 = `PayableThisQuarter` (огноо = үеийн эцэс), `comment = {"kind":"CIT_ACCRUAL","year":Y,"period":"Q1"}`; өмнөх батлагдаагүй ноорогийг солино (05 BR-PST-58-тай ижил загвар).

### 5.18 Татварын календарь (FR-TAX-018)

```text
-- Дүрэм: мөр нь ХУГАЦААГААР шүүгдэнэ — due ∈ [from, to] (хоёр зах орно). Хугацааны параметрийн asOf = тайлагнах үеийн
-- дараагийн өдөр (үе дууссаны дараа мөрдөгдөх журам; BR-TAX-13). Хугацаа null (тодорхойгүй) мөр: үеийн end + 1 ∈ [from, to] бол.
items := []
if company VAT-registered (Standard):
    for P in vat_return_period WHERE due_date BETWEEN from AND to:
        items += { kind: 'VAT_RETURN', form: 'ТТ-03а', period: P, due: P.due_date,
                   verified: param('vat.return_due_day', P.ending_date + 1).isVerified,
                   status: P.status = 'SUBMITTED' ? 'DONE' : daysLeft(P.due_date) }
if Simplified (R2): улирлын P, due = null (⚠ "хугацаа тодорхойгүй")
for quarter Q with Q.end ∈ [from − 2 months, to]:                                -- ААНОАТ (R2-т тайлан; R1-д календарь л); due нь Q.end-ээс ≤ 1 сарын дараа
    a := Q.end + 1
    d := firstDayOfNextMonth(Q.end) + (param('cit.quarterly_return_due_day', a) − 1)
    if d ∈ [from, to]: items += { kind: 'CIT_QUARTERLY_RETURN', form: 'ТТ-02', due: d, verified: … }
    if TryParam('cit.quarterly_payment_due', a, Report):                            -- 2027-01-01-нээс (unverified)
        d := lastDay(month(a)); if d ∈ [from, to]: items += { kind: 'CIT_QUARTERLY_PAYMENT', due: d, verified: false }
for month M with day 25 ∈ [from, to]: if TryParam('cit.advance_payment_due_day', firstDay(M), Report):
    items += { kind: 'CIT_ADVANCE', due: date(M, value), verified: false }
for Y: d := date(Y+1, param('cit.annual_return_due', (Y+1)-01-01)[MM-DD]); if d ∈ [from, to]: items += { kind: 'CIT_ANNUAL', year: Y, due: d }
if city tax payer (R2): VAT_RETURN-тэй ижил P ба due-аар { kind: 'CITY_TAX', verified: false }   -- OQ-TAX-09
return items ordered by (due, kind)
```

Амралтын өдрөөр хугацааг шилжүүлэхгүй (OQ-TAX-13). `tax.filing_extension_max_days` нь зөвхөн тайлбар.

### 5.19 Transaction, түгжээ, idempotency-ийн хураангуй

| Үйлдэл | Transaction | Түгжээ | Idempotency | Preview |
|---|---|---|---|---|
| Баримт/журнал батлах (НӨАТ-ын мөр) | Posting engine-ийн нэг transaction (05) | `fn_lock_company_posting`; эх ноорог `FOR UPDATE` | `Idempotency-Key` (05 BR-PST-62) | Тийм (05) |
| Баталгаажуулалт (`purchase-receipts/{id}:confirm`) | Нэг transaction | `fn_lock_company_posting` (хаалттай давхцахгүй) | `Idempotency-Key`; байгалийн: баталгаажсан → no-op | Үгүй |
| Баталгаажуулалт цуцлах (`:unconfirm`, Should) | Нэг transaction | `fn_lock_company_posting` | `Idempotency-Key`; байгалийн: аль хэдийн `false` → no-op | Үгүй |
| `input-vat:write-off` | Engine run (`VATADJ`) | Engine | `Idempotency-Key`; байгалийн: entry хаагдсан → 409 | Тийм |
| `:close` | Engine run (`VATSTMT` [+`CITYTAXSTMT`]) эсвэл G/L-гүй шууд бичилт | Engine + `vat_return_period FOR UPDATE` | `Idempotency-Key`; байгалийн: `CLOSED` → `409 tax.vat_period_not_open` | `:preview-close` |
| `:reopen` | `IReversalService` run + оноолтын бичилт | Engine + `FOR UPDATE` | `Idempotency-Key`; байгалийн: `OPEN` → 409 | Үгүй |
| `:submit` | Нэг transaction | `fn_lock_company_posting` + `FOR UPDATE` | `Idempotency-Key`; байгалийн: `SUBMITTED` → 409 | Үгүй |
| `:export` | Job (`tax.vat_return.export`) | Үгүй (уншина, `REPEATABLE READ`) | Job-ийн түлхүүр `(periodId, scopeVersion)` — ижил бол өмнөх файлыг буцаана (`lastVatEntryNo` дангаараа баталгаажуулалтыг илрүүлэхгүй) | — |
| Босгын job | Job transaction | Үгүй | Outbox `idempotency_key` | — |
| `GET /reports/vat-return`, бүртгэл, ААНОАТ | Уншина (`REPEATABLE READ`, `READ ONLY`) | Үгүй | — | — |

Advisory lock-ийн дараалал нь 05 BR-PST-61. VAT entry-ийн `fn_ledger_update` нь posting run-ий writer дотор эсвэл lock-той transaction-д л дуудагдана.

---
## 6. Тооцоолол ба бөөрөнхийлөлт

### 6.1 Нарийвчлал ба функц

| Хэмжигдэхүүн | Хадгалах төрөл | Бөөрөнхийлөх | Эх |
|---|---|---|---|
| Суурь, НӨАТ, НХАТ, хасагдахгүй хэсэг, хаалтын дүн | `platform.amount` = `numeric(19,4)` | `P` = `company_setup.amount_rounding_precision` (0.01; сонголтоор 1) | D-C1, D-C2 ⚠ |
| Хувь (`vat_percent`, `rate_percent`) | `platform.percent` = `numeric(9,5)` | `round(ratio × 100, 5)` | D-C1 |
| Параметрийн утга | `numeric` | Бөөрөнхийлөхгүй | D-E7 |
| Дундын тооцоо | C# `decimal` | Зөвхөн `MoneyMath`-ийн цэгт (§5.4) | ADR-0006 |

- НӨАТ: `RV` (`vat_rounding_type`: NEAREST / UP / DOWN, абсолют утгаар). НХАТ, хуваарилалт, хасагдахгүй хэсэг, хялбаршуулсан НӨАТ, ААНОАТ: `R` (Nearest).
- Дунд утга тэгээс холдоно: `R(2.345) = 2.35`, `R(−2.345) = −2.35`, `R(0.005) = 0.01`. .NET-ийн анхдагч `ToEven` хориотой (architecture test `No_bankers_rounding`).
- Сөрөг дүнг бөөрөнхийлөхдөө баримтын (эерэг) тэмдгээр тооцоод buffer-т урвуулна (R-VAT pitfall 15; 06 §6.1).

Бөөрөнхийлөх чиглэлийн нөлөө (`P = 0.01`, r = 10):

| Тохиолдол | Яг НӨАТ | NEAREST | UP | DOWN |
|---|---|---|---|---|
| Үнэ НӨАТ-гүй, суурь 3 015.05 | 301.505 | 301.51 | 301.51 | 301.50 |
| Үнэ НӨАТ-тэй, бохир 3 015.00 | 274.090909… | 274.09 | 274.10 | 274.09 |
| `P = 1`, бохир 3 015 | 274.0909… | 274 | 275 | 274 |

### 6.2 Үнэ НӨАТ-гүй: бүлэг ба хуваарилалт (BR-TAX-19, -20)

```
Бүлэг g = (identifier, calc type, тэмдэг); мөр i = 1..n (line_no ASC); CLA_i > 0
W_g     = Σ CLA_i
VAT_g   = RV(W_g × r/100 + carry_g) + diff_g
rem_0 = 0;  rem_i' = rem_{i−1} + VAT_g × CLA_i / W_g;  VAT_i = R(rem_i');  rem_i = rem_i' − VAT_i
Amount_i = CLA_i;  AIV_i = CLA_i + VAT_i;  VatBase_i = CLA_i
Баталгаа: Σ VAT_i = VAT_g
```

**Жишээ 6.2-A** (E-TAX-01): VAT10, мөр 10 000.05, 6 666.66, 4 999.99; `W = 21 666.70`, `VAT_g = RV(2 166.670) = 2 166.67`.

| Мөр | CLA | Хувь хэмжээ `VAT_g × CLA/W` | rem өмнө | rem' | `VAT_i` | rem дараа | Тусад нь бөөрөнхийлсөн |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10000 | 10 000.05 | 1 000.005 | 0 | 1 000.005 | 1 000.01 | −0.005 | 1 000.01 |
| 20000 | 6 666.66 | 666.666 | −0.005 | 666.661 | 666.66 | +0.001 | 666.67 |
| 30000 | 4 999.99 | 499.999 | +0.001 | 500.000 | 500.00 | 0 | 500.00 |
| Σ | 21 666.70 | | | | **2 166.67** | | 2 166.68 (✗ 0.01 илүү) |

### 6.3 Үнэ НӨАТ-тэй (BR-TAX-19)

```
G_g    = Σ CLA_i                                   (НӨАТ ба НХАТ шингэсэн)
VAT_g  = RV(G_g × r/(100 + r + c) + carry_g)
CT_g   = R(G_g × c/(100 + r + c) + carryCT_g)      (c = 0 бол 0)
Base_g = G_g − VAT_g − CT_g
VAT_i, CT_i: running remainder (жин CLA_i);  Amount_i = CLA_i − VAT_i − CT_i;  AIV_i = Amount_i + VAT_i
```

**Жишээ 6.3-A:** 3 мөр × 1 005.00, VAT10, НХАТ-гүй. `G = 3 015.00`, `VAT = RV(274.090909) = 274.09`, `Base = 2 740.91`. Хуваарилах нь **бөөрөнхийлсөн** `VAT_g`: хувь хэмжээ `274.09 × 1 005/3 015 = 91.363333`: мөр 1 → 91.36 (rem +0.003333), мөр 2 → R(91.366667) = 91.37 (rem −0.003333), мөр 3 → R(91.360000) = 91.36. Σ = 274.09 ✓. Amount = 913.64 / 913.63 / 913.64 (Σ 2 740.91).

**Жишээ 6.3-B** (FR-TAX-005 AC2): 33 000.00 ба 13 993.00 → `G = 46 993.00`, `VAT = R(4 272.090909) = 4 272.09`, `Base = 42 720.91`; мөр 1 = R(2 999.99936) = 3 000.00, мөр 2 = 1 272.09 (06 Жишээ 6-B-тэй ижил).

### 6.4 Сөрөг мөр ба carry (BR-TAX-18, R-VAT-13)

```
Сөрөг бүлэг (−) эхэлнэ:  exact⁻ = W⁻ × r/100;  VAT⁻ = RV(exact⁻);  carry = exact⁻ − VAT⁻
Эерэг бүлэг (+):          VAT⁺ = RV(W⁺ × r/100 + carry)
Баталгаа: VAT⁻ + VAT⁺ = RV((W⁻ + W⁺) × r/100)  (NEAREST үед, бүлэг бүр нэг тэмдэгтэй; онцгой: exact⁺ + carry яг ±P/2 дээр тэмдэг солигдвол P-ээр зөрж болно — тест PBT-TAX-02 зөвшөөрнө)
```

Жишээ (06 Жишээ 6-C): −100.03 ба +1 000.05 → `VAT⁻ = −10.00` (carry −0.003), `VAT⁺ = R(100.005 − 0.003) = 100.00` → нийт 90.00 = R(900.02 × 0.1) ✓.

### 6.5 Хасагдахгүй хэсэг (BR-TAX-25)

```
nd% ∈ {0, 100} (ихэнх) эсвэл setup-ийн хувь (жишээ 50 — холимог үйл ажиллагаа)
VAT_nd_i  = R(VAT_i × nd%/100)          (REVERSE_CHARGE: SA_i)
Base_nd_i = R(VatBase_i × nd%/100)
VAT entry:  base = Σ(VatBase − Base_nd),  amount = Σ(VAT − VAT_nd),  non_deductible_base = Σ Base_nd,  non_deductible_amount = Σ VAT_nd
G/L: суурь мөр = Σ Amount + Σ VAT_nd;  VAT дансны мөр = Σ(VAT − VAT_nd)
```

Жишээ (seed_checks 4j): урвуу тооцоо суурь 300.00, SA 30.00, nd% 50 → `VAT_nd = 15.00`, `Base_nd = 150.00`; entry: base 150.00, amount 15.00, nd 150.00 / 15.00. ТТ-03а: мөр 10 = 15, мөр 11 = 15, мөр 13 = 30.

### 6.6 Урвуу тооцоо (BR-TAX-23)

```
Баримтын мөр: VAT = 0, AIV = Amount = CLA (нийлүүлэгчид цэвэр)
SA_g = RV(W_g × r/100 + carry_g);  SA_i — running remainder
G/L: Дт 1300 Σ(SA − SA_nd);  Кт 2305 Σ SA;  суурь мөр Дт Σ(Amount + SA_nd)
```

Жишээ: 3 500 000.00 × 10 % = 350 000.00 (E-TAX-03).

### 6.7 Гаалийн НӨАТ (BR-TAX-24)

```
Мөр: Amount = 0, VAT = CLA, AIV = CLA, VatBase = 0
G/L: суурь мөр = 1300 (purchase_vat_account_id) дээр Amount = CLA, VatAmount = CLA (тусдаа VAT мөргүй)
VAT entry: base = 0, amount = CLA
Мэдээлэл: импортын НӨАТ-ын суурь = гаалийн үнэ + гаалийн татвар + онцгой албан татвар (UNVERIFIED, mn-tax §2.5) — CR-TAX-05
```

### 6.8 Журналын мөр (gross арга, 05 §6.4)

```
NORMAL:          VAT = RV(A × r/(100 + r)) + diff;  Base = A − VAT;  VAT_nd = R(VAT × nd%/100)
REVERSE_CHARGE:  Base = A;  SA = RV(A × r/100)
FULL_VAT:        VAT = A;  Base = 0
```

Жишээ: `A = 12 345.00` → `VAT = 1 122.27`, `Base = 11 222.73` (05 E-B).

### 6.9 НӨАТ-ын зөрүү (BR-TAX-26)

```
diff_g = VAT_supplier_g − VAT_g (хэрэглэгч бүлгийн НӨАТ-ыг оруулна);  abs(diff_g) ≤ max_vat_difference_allowed
VAT_g' = VAT_g + diff_g → мөрүүдэд хуваарилна;  diff_i = Allocate(diff_g, CLA)
```

Жишээ: `max_vat_difference_allowed = 1.00`; 3 мөр × 3 030.30 → `W = 9 090.90`, `VAT_g = 909.09`; нийлүүлэгчийн баримтын НӨАТ 909.10 → `diff = 0.01`. `VAT_g' = 909.10` → мөр 303.03 / 303.04 / 303.03; `diff_i` = 0.00 / 0.01 / 0.00. VAT entry `amount = 909.10`, `vat_difference = 0.01`.

### 6.10 НХАТ (BR-TAX-92, -93)

```
Үнэ НӨАТ-гүй:  CT_g = R(Σ Amount_i × c/100 + carry);  gross = Amount + VAT + CT
Үнэ НӨАТ-тэй:  §6.3 (хуваагч 100 + r + c)
city_tax_entry: base = −Σ Amount (борлуулалт), amount = −Σ CT
```

Жишээ (FR-TAX-019 AC1): цэвэр 5 000.00, r = 10, c = 2 → VAT 500.00, CT 100.00, нийт 5 600.00. Үнэ НӨАТ-тэй хувилбар: `G = 5 600.00` → `VAT = R(5 600 × 10/112) = 500.00`, `CT = R(5 600 × 2/112) = 100.00`, `Base = 5 000.00`.

### 6.11 ТТ-03а-гийн мөрийн арифметик (BR-TAX-65)

```
raw(l)    = Σ_{e ∈ scope, filter(l)} AmountType(e)
value(l)  = calculate_with(l) = OPPOSITE ? −raw(l) : raw(l);   ROW_TOTALING: value = Σ value(rows)
printed(l)= print_with(l) = OPPOSITE ? −value(l) : value(l)
Seed: мөр 14 = value(2) + value(13) + value(12) = −Σamount(SALE, VAT10) + Σ(amount+nd)(RC) − Σamount(хасагдах: 8, 9, 10)
```

### 6.12 Хаалтын арифметик ба инвариант (BR-TAX-73, -82)

```
Бүлэг g (Bus, Prod, Type), зөвхөн closed = false:  sb, sa, snb, sna = Σ base, amount, nd_base, nd_amount
NORMAL/FULL_VAT:  VAT данс += −sa;                         net += sa
REVERSE_CHARGE:   1300 += −sa;  2305 += sa + sna;          net += −sna
Хаалтын данс (2310) += net       (net < 0 → төлөх Кт; net > 0 → буцаан авах Дт)
Σ ваучер = Σ_N(−sa) + Σ_RC(−sa + sa + sna) + net,  net = Σ_N sa − Σ_RC sna  ⇒  Σ ваучер = 0  (N = NORMAL ба FULL_VAT бүлэг)
Төлөх НӨАТ = −net = ТТ-03а мөр 14 (seed загварт; зөрвөл W-TAX-13)
Инвариант (хаалтын дараа): Σ gl(2300) = Σ amount(SALE, ¬closed); Σ gl(1300) = Σ amount(PURCHASE, ¬closed); Σ gl(2305) = −Σ(amount + nd)(RC, ¬closed)
```

### 6.13 Босгын арифметик (BR-TAX-83…85)

```
T(d) = Σ_{e: SALE, vat_date ∈ (d − 12 сар, d], ангилал(setup) ∈ {VAT10, VAT0}, ¬ҮХ} −(base + non_deductible_base)
M(d) = vat.registration_threshold_mandatory @ d;   V(d) = vat.registration_threshold_voluntary @ d
ratio = T/M × 100 (2 орон)
```

| Огноо `d` | `T(d)` | `M(d)` | Харьцаа | Түвшин (НӨАТ төлөгч бус) |
|---|---:|---:|---:|---|
| 2027-05-15 | 41 000 000 | 50 000 000 | 82.00 % | `APPROACHING` (W-TAX-01) — FR-TAX-012 AC1 |
| 2027-06-20 | 52 000 000 | 50 000 000 | 104.00 % | `CROSSED` (W-TAX-02), `crossedOn = 2027-06-20` |
| 2027-07-01 | 53 500 000 | 400 000 000 | 13.38 % | `VOLUNTARY_ELIGIBLE` (мэдээлэл); тайлбар "өмнөх босгыг 2027-06-20-нд давсан" |
| 2027-07-02 | 41 000 000 | 400 000 000 | 10.25 % | `VOLUNTARY_ELIGIBLE` — анхааруулга гарахгүй (FR-TAX-012 AC2) |

### 6.14 Хялбаршуулсан НӨАТ (BR-TAX-100)

```
S = Σ −base (SALE, VAT10)   [VAT_INCLUSIVE сонголтод S += O]
O = Σ −amount (SALE, VAT10)
Payable = R(r/100 × S × (1 − share));   D = O − Payable
```

Жишээ (FR-TAX-022 AC1): `S = 30 000 000`, `r = 10`, `share = 0.9` → `Payable = 300 000.00`, `O = 3 000 000.00`, `D = 2 700 000.00`.

### 6.15 ААНОАТ (BR-TAX-105…108)

```
Шатлал (asOf = Y-01-01):  bands = [(0, U1, r1), (U1, U2 ?? ∞, r2), (U2, ∞, r3 — байвал)]
Tax(TI) = Σ_k r_k × max(0, min(TI, upper_k) − lower_k)   (TI ≤ 0 → 0);  R(·)
CREDIT_90:   Net = R(Tax × (1 − cit.credit_90pct_rate))
ONE_PERCENT: Net = R(Rev × cit.turnover_regime_rate)
Алдагдал (LossOffset, ⚠ хоёр параметр unverified → Report):
  eligible = Σ L_v  (хэрэглэгчийн оруулсан өмнөх оны алдагдал L_v > 0, Y − v ≤ cit.loss_carryforward_years, ашиглагдаагүй үлдэгдэл)
  lossUsed = TI ≤ 0 ? 0 : min(eligible, R(TI × cit.loss_offset_cap_ratio));   хамгийн эртний он эхэлж хэрэглэнэ (FIFO)
Улирлын төлөх = Net(E) − Net(E_prev)   (сөрөг бол 0 биш, сөрөг утгаараа харуулна — илүү төлсөн)
```

| TI | 2026 (`r2 = 0.25`, `U2` байхгүй) | 2027 (`r2 = 0.15`, `U2 = 10 тэрбум`, `r3 = 0.25`) |
|---:|---:|---:|
| 18 500 000 | 1 850 000 | 1 850 000 |
| 8 000 000 000 | 600 000 000 + 500 000 000 = 1 100 000 000 | 600 000 000 + 300 000 000 = 900 000 000 |
| 12 000 000 000 | 600 000 000 + 1 500 000 000 = 2 100 000 000 | 600 000 000 + 600 000 000 + 500 000 000 = 1 700 000 000 |

---

## 7. Posting-ийн жишээнүүд

**Таамаг.** Компани "Жишээ ХХК", 2020-01-01-нээс НӨАТ төлөгч, LCY = MNT, `P = 0.01`, `vat_rounding_type = NEAREST`, НӨАТ 10 % (`param:vat.standard_rate`), Улаанбаатар. Данс нь seed-ийнх (§3.10; мөн 1110 Харилцах данс, 1200 Дансны авлага, 1400 Барааны нөөц, 2100 Дансны өглөг, 2101 Дансны өглөг (гадаад), 5100, 5110, 5120 орлого, 7210 Түрээс, 7213 Бичиг хэрэг, 7221 Тээврийн хэрэгслийн зардал, 7230 Мэргэжлийн үйлчилгээ). Бүх ваучер тэнцсэн (Σ Дт = Σ Кт).

| Мастер өгөгдөл | Утга |
|---|---|
| Харилцагч | `C0001` Тэмүүлэн ХХК (DOMESTIC, AR 1200); `C0105` Altai Trade LLC (EXPORT, AR 1201) |
| Нийлүүлэгч | `V0001` Оффис Плюс ХХК (DOMESTIC, НӨАТ төлөгч, AP 2100); `V0105` Global Consulting LLC (IMPORT, резидент бус, AP 2101); `V0106` Shenzhen Trading Co. (IMPORT, AP 2101); `V0107` Гаалийн ерөнхий газар (загвар `CUSTOMS`: VAT Bus. IMPORT, бүлэг CUSTOMS → 2365) |
| Мөнгөний данс | `BANK01` → 1110; `CASH01` → 1100 |

Хүснэгтэд "Дт"/"Кт" нь `debit_amount`/`credit_amount`; VAT entry-ийн дүн тэмдэгтэй (`base`, `amount`).

### E-TAX-01. Борлуулалтын нэхэмжлэх: VAT10 + EXEMPT, баримтын түвшний хуваарилалт (GS-VAT-001)

`SI-2027-00105`, 2027-03-10, `C0001`, үнэ НӨАТ-гүй. Мөр: 10000 бараа (GOODS → 5100) 1 × 10 000.05; 20000 бараа (GOODS → 5100) 2 × 3 333.33 = 6 666.66; 30000 үйлчилгээ (SERVICES → 5110) 1 × 4 999.99; 40000 сургалт (SERVICES → 5110, VAT Prod. EXEMPT) 1 × 2 000.00. НӨАТ: §6.2-A (2 166.67; мөр 1 000.01 / 666.66 / 500.00); EXEMPT бүлэг 0.

Buffer мөр: R1 (5100, GOODS, VAT10) −16 666.71 / НӨАТ −1 666.67; R2 (5110, SERVICES, VAT10) −4 999.99 / −500.00; R3 (5110, SERVICES, EXEMPT) −2 000.00 / 0.

| G/L entry | Данс | Дт | Кт | `vat_amount` | Бүлэг |
|---|---|---:|---:|---:|---|
| 901 | 5100 Борлуулалтын орлого - бараа | | 16 666.71 | −1 666.67 | SALE, DOMESTIC/GOODS, DOMESTIC/VAT10 |
| 902 | 2300 Борлуулалтын НӨАТ | | 1 666.67 | 0 | NONE |
| 903 | 5110 Ажил, үйлчилгээний орлого | | 4 999.99 | −500.00 | SALE, DOMESTIC/SERVICES, DOMESTIC/VAT10 |
| 904 | 2300 Борлуулалтын НӨАТ | | 500.00 | 0 | NONE |
| 905 | 5110 Ажил, үйлчилгээний орлого | | 2 000.00 | 0 | SALE, DOMESTIC/SERVICES, DOMESTIC/EXEMPT |
| 906 | 1200 Дансны авлага (C0001) | 25 833.37 | | 0 | NONE |
| | **Нийт** | **25 833.37** | **25 833.37** | | |

| VAT entry | Төрөл | `base` | `amount` | % | Ангилал / `taxType` | `gl_entry_no` |
|---|---|---:|---:|---:|---|---|
| 301 | SALE | −16 666.71 | −1 666.67 | 10 | VAT10 / VAT_ABLE | 901 |
| 302 | SALE | −4 999.99 | −500.00 | 10 | VAT10 / VAT_ABLE | 903 |
| 303 | SALE | −2 000.00 | 0.00 | 0 | EXEMPT / VAT_FREE | 905 |

Холбоос: (901, 301), (903, 302), (905, 303); register `from_vat_entry_no = 301`, `to_vat_entry_no = 303`. Шалгалт: `Σ −amount = 2 166.67` = толгойн `vat_amount` = eBarimt `totalVAT` (BR-TAX-37). EXEMPT-д НӨАТ-ын G/L entry үүсээгүй (FR-TAX-007 AC1).

### E-TAX-02. Худалдан авалт: хасагдах ба хасагдахгүй (`PASSENGER_CAR`) мөр (GS-VAT-005, GS-VAT-004)

`PI-2027-00144`, 2027-05-12, `V0001`, нийлүүлэгчийн ДДТД `0123…` (33 орон), үнэ НӨАТ-гүй. Мөр 10000: 7213 Бичиг хэрэг 3 000 000.00 (VAT10). Мөр 20000: 7221 суудлын автомашины сэлбэг 200 000.00 (VAT10, шалтгаан `PASSENGER_CAR`). Бүлэг VAT10: `W = 3 200 000.00`, `VAT = 320 000.00` → 300 000.00 / 20 000.00; мөр 20000 `nd% = 100` → `VAT_nd = 20 000.00`, `Base_nd = 200 000.00`.

| Данс | Дт | Кт | Тайлбар |
|---|---:|---:|---|
| 7213 Бичиг хэрэг, хэвлэлийн зардал | 3 000 000.00 | | Суурь мөр, `vat_amount` 300 000.00 |
| 1300 Орцын НӨАТ | 300 000.00 | | Хасагдах НӨАТ (баталгаажих хүртэл) |
| 7221 Тээврийн хэрэгслийн зардал | 220 000.00 | | 200 000 + хасагдахгүй НӨАТ 20 000 (BR-TAX-53) |
| 2100 Дансны өглөг (V0001) | | 3 520 000.00 | |
| **Нийт** | **3 520 000.00** | **3 520 000.00** | |

| VAT entry | Төрөл | `base` | `amount` | `non_deductible_base` | `non_deductible_amount` | `deductible_confirmed` | Шалтгаан |
|---|---|---:|---:|---:|---:|---|---|
| 404 | PURCHASE | 3 000 000.00 | 300 000.00 | 0.00 | 0.00 | false → **true** (2027-05-20, `purchase-receipts/{id}:confirm`) | — |
| 405 | PURCHASE | 0.00 | 0.00 | 200 000.00 | 20 000.00 | false | `PASSENGER_CAR` |

`ebarimt.purchase_receipt`: `MATCHED` → `CONFIRMED` (12 PUR-03, PUR-04). FR-TAX-010 AC1-ийн хувилбар: зөвхөн 7221 мөртэй бол 7221 Дт 220 000 / 2100 Кт 220 000, 1300-д бичилт байхгүй.

### E-TAX-03. Импортын үйлчилгээ, урвуу тооцоо (GS-VAT-010)

`PI-2027-00147`, 2027-05-15, `V0105` (IMPORT). Мөр: 7230 зөвлөх үйлчилгээ 3 500 000.00, VAT Prod. `IMPORT_SERVICE` (`REVERSE_CHARGE`, RC10). Баримтын НӨАТ 0; `SA = 350 000.00`.

| Данс | Дт | Кт | Тайлбар |
|---|---:|---:|---|
| 7230 Мэргэжлийн үйлчилгээний зардал | 3 500 000.00 | | Суурь мөр, `vat_amount` 350 000.00 |
| 1300 Орцын НӨАТ | 350 000.00 | | Хасагдах урвуу НӨАТ |
| 2305 Урвуу тооцооны НӨАТ | | 350 000.00 | Төлөх урвуу НӨАТ |
| 2101 Дансны өглөг (гадаад, V0105) | | 3 500 000.00 | Нийлүүлэгчид цэвэр дүн |
| **Нийт** | **3 850 000.00** | **3 850 000.00** | |

VAT entry 406: PURCHASE, `REVERSE_CHARGE`, `base` 3 500 000.00, `amount` 350 000.00, `deductible_confirmed = true`, ангилал VAT10, `party_tin` = `foreign_tax_id`. Суутган татвар хүрээнээс гадуур (BR-TAX-64).

### E-TAX-04. Импортын бараа ба гаалийн НӨАТ (`FULL_VAT`) (GS-VAT-011, R2)

Гаалийн мэдүүлэг `ГМ-2027-000123`, 2027-05-20: гаалийн үнэ 1 900 000.00, гаалийн татвар 100 000.00, НӨАТ = 10 % × 2 000 000.00 = 200 000.00.

(а) `PI-2027-00148`, 2027-05-18, `V0106` (IMPORT × VAT10 = NOVAT):

| Данс | Дт | Кт |
|---|---:|---:|
| 1400 Барааны нөөц | 1 900 000.00 | |
| 2101 Дансны өглөг (гадаад) | | 1 900 000.00 |
| **Нийт** | **1 900 000.00** | **1 900 000.00** |

VAT entry 407: PURCHASE, `base` 1 900 000.00, `amount` 0, ангилал NOVAT, `NOT_VAT`.

(б) `PI-2027-00149`, 2027-05-20, `V0107` (гааль), `vendor_invoice_no` = `ГМ-2027-000123`, `document_date` = 2027-05-20. Мөр 10000: 1400 гаалийн татвар 100 000.00 (VAT Prod. NOVAT); мөр 20000: 1300 гаалийн НӨАТ 200 000.00 (VAT Prod. CUSTOMS_VAT, `FULL_VAT`).

| Данс | Дт | Кт | Тайлбар |
|---|---:|---:|---|
| 1400 Барааны нөөц | 100 000.00 | | Гаалийн татвар өртөгт (BR-TAX-63) |
| 1300 Орцын НӨАТ | 200 000.00 | | FULL_VAT суурь мөр = VAT данс, `SystemDerived` |
| 2365 Гаалийн татвар, импортын НӨАТ-ын өглөг | | 300 000.00 | |
| **Нийт** | **300 000.00** | **300 000.00** | |

VAT entry 408: PURCHASE, NOVAT, `base` 100 000.00, `amount` 0. VAT entry 409: PURCHASE, `FULL_VAT`, `base` 0, `amount` 200 000.00, `external_document_no = 'ГМ-2027-000123'`, `document_date = 2027-05-20`, `deductible_confirmed = true` (BR-TAX-46).

(в) Гаальд төлөх, `BP-2027-00052`, 2027-05-21: 2365 Дт 300 000.00 / 1110 Кт 300 000.00 (НӨАТ-гүй).

Хувилбар (журнал): гаалийн НӨАТ-ыг нийлүүлэгчгүйгээр банкнаас шууд — төлбөрийн журналын мөр: данс 1300, `PURCHASE`, IMPORT × CUSTOMS_VAT, дүн 200 000.00, харьцсан данс `BANK01`, `external_document_no = 'ГМ-2027-000123'`, `document_date = 2027-05-20` (хоёулаа заавал, BR-TAX-62) → 1300 Дт 200 000.00 / 1110 Кт 200 000.00, VAT entry (`base` 0, `amount` 200 000.00, `deductible_confirmed = true`). Мэдүүлгийн дугаар эсвэл огноо хоосон бол батлах → 422 `tax.customs_declaration_required`.

### E-TAX-05. НӨАТ төлөгч бус компани (GS-VAT-006)

Компани "Бага ХХК", `vat_registered = false`.

(а) `SI-2027-00007`, 2027-03-05, үйлчилгээ 1 000 000.00 (setup DOMESTIC × VAT10): хувь 0, хэрэгжих ангилал NOVAT, `taxType = NOT_VAT` (анхдагч).

| Данс | Дт | Кт |
|---|---:|---:|
| 1200 Дансны авлага | 1 000 000.00 | |
| 5110 Ажил, үйлчилгээний орлого | | 1 000 000.00 |
| **Нийт** | **1 000 000.00** | **1 000 000.00** |

VAT entry: SALE, `base` −1 000 000.00, `amount` 0, `vat_percent` 0, `vat_identifier` VAT10, ангилал NOVAT, `NOT_VAT` (босгод 1 000 000.00 тооцогдоно, BR-TAX-83). eBarimt `totalVAT = 0` (FR-TAX-011 AC1).

(б) `PI-2027-00004`, 2027-03-06, түрээс 1 000 000.00 + нийлүүлэгчийн НӨАТ 100 000.00 (ДДТД бүртгэсэн):

| Данс | Дт | Кт |
|---|---:|---:|
| 7210 Түрээсийн зардал | 1 100 000.00 | |
| 2100 Дансны өглөг | | 1 100 000.00 |
| **Нийт** | **1 100 000.00** | **1 100 000.00** |

VAT entry: PURCHASE, `base` 0, `amount` 0, `non_deductible_base` 1 000 000.00, `non_deductible_amount` 100 000.00, шалтгаан `NON_VAT_COMPANY` (FR-TAX-011 AC2).

### E-TAX-06. 2027 оны 5-р сарын ТТ-03а ба НӨАТ-ын хаалт (GS-VAT-007)

**Хаалтын өмнөх нээлттэй VAT entry** ("Жишээ ХХК", 5-р сар):

| Entry | Баримт | Төрөл | Bus. / Prod. | Ангилал | `base` | `amount` | nd base / nd amount | Баталгаажсан | Scope-д |
|---|---|---|---|---|---:|---:|---:|---|---|
| 401 | SI-2027-00210 | SALE | DOMESTIC / VAT10 | VAT10 | −6 000 000.00 | −600 000.00 | 0 / 0 | — | Тийм |
| 402 | SI-2027-00225 | SALE | EXPORT / VAT10 | VAT0 | −2 000 000.00 | 0.00 | 0 / 0 | — | Тийм |
| 403 | SI-2027-00227 | SALE | DOMESTIC / EXEMPT | EXEMPT | −500 000.00 | 0.00 | 0 / 0 | — | Тийм |
| 404 | PI-2027-00144 | PURCHASE | DOMESTIC / VAT10 | VAT10 | 3 000 000.00 | 300 000.00 | 0 / 0 | true | Тийм |
| 405 | PI-2027-00144 | PURCHASE | DOMESTIC / VAT10 | VAT10 | 0.00 | 0.00 | 200 000 / 20 000 | false | Тийм (`amount = 0`) |
| 406 | PI-2027-00147 | PURCHASE | IMPORT / IMPORT_SERVICE | VAT10 | 3 500 000.00 | 350 000.00 | 0 / 0 | true | Тийм |
| 407 | PI-2027-00148 | PURCHASE | IMPORT / VAT10 | NOVAT | 1 900 000.00 | 0.00 | 0 / 0 | false | Тийм (`amount = 0`) |
| 408 | PI-2027-00149 | PURCHASE | IMPORT / NOVAT | NOVAT | 100 000.00 | 0.00 | 0 / 0 | false | Тийм (`amount = 0`) |
| 409 | PI-2027-00149 | PURCHASE | IMPORT / CUSTOMS_VAT | VAT10 | 0.00 | 200 000.00 | 0 / 0 | true | Тийм |
| 410 | PI-2027-00152 | PURCHASE | DOMESTIC / VAT10 | VAT10 | 500 000.00 | 50 000.00 | 0 / 0 | false | **Үгүй** (баталгаажаагүй) |
| 411 | SI-2027-00231 | SALE | DOMESTIC / VAT10 | VAT10 | −4 000 000.00 | −400 000.00 | 0 / 0 | — | Тийм |

**ТТ-03а (2027-05, `GET /reports/vat-return`):**

| Мөр | Агуулга | `value` | Хэвлэх |
|---|---|---:|---:|
| 1 | Татвар ногдох борлуулалт (10 %) — суурь | 10 000 000.00 | 10 000 000.00 |
| 2 | Борлуулалтын НӨАТ | 1 000 000.00 | 1 000 000.00 |
| 3 | 0 %-ийн борлуулалт | 2 000 000.00 | 2 000 000.00 |
| 4 | Чөлөөлөгдөх борлуулалт | 500 000.00 | 500 000.00 |
| 5 | Хамрах хүрээнээс гадуур | 0.00 | 0.00 |
| 6 | Нийт борлуулалт | 12 500 000.00 | 12 500 000.00 |
| 7 | Дотоодын худалдан авалт (баталгаажсан) — суурь | 3 000 000.00 | 3 000 000.00 |
| 8 | Хасагдах орцын НӨАТ (дотоод) | −300 000.00 | 300 000.00 |
| 9 | Импортын (гаалийн) НӨАТ | −200 000.00 | 200 000.00 |
| 10 | Урвуу тооцооны НӨАТ — хасагдах | −350 000.00 | 350 000.00 |
| 11 | Хасагдахгүй НӨАТ (мэдээлэл) | 20 000.00 | 20 000.00 |
| 12 | Нийт хасагдах НӨАТ | −850 000.00 | 850 000.00 |
| 13 | Урвуу тооцооны НӨАТ (төлөх) | 350 000.00 | 350 000.00 |
| 14 | **Төлөх НӨАТ** = 2 + 13 + 12 | **500 000.00** | **500 000.00** |

Баталгаажаагүй орцын НӨАТ: 1 баримт (PI-2027-00152), 50 000.00 (W-TAX-05, CUE-14). `lastVatEntryNo = 411`, `scopeVersion` (BR-TAX-69) — scope 10 entry (410 орохгүй).

**Хаалт** `:close` (`postingDate = 2027-05-31`, хаалтын данс 2310, `expectedScopeVersion` = тооцооны хариуных, `expectedLastVatEntryNo = 411`) → ваучер `GJ-2027-00088`, source `VATSTMT`. Тооцоо ба хаалтын хооронд PI-2027-00152-ыг баталгаажуулсан бол entry нэмэгдэхгүй ч `scopeVersion` өөрчлөгдөж `409 tax.vat_statement_stale` (EC-13):

| Бүлэг (дарааллаар) | Entry | Σ amount | Үйлдэл |
|---|---|---:|---|
| DOMESTIC / EXEMPT / SALE | 403 | 0 | Зөвхөн оноох |
| DOMESTIC / VAT10 / PURCHASE | 404, 405 | 300 000.00 | 1300 Кт 300 000.00; SETTLEMENT 412 |
| DOMESTIC / VAT10 / SALE | 401, 411 | −1 000 000.00 | 2300 Дт 1 000 000.00; SETTLEMENT 413 |
| EXPORT / VAT10 / SALE | 402 | 0 | Зөвхөн оноох |
| IMPORT / CUSTOMS_VAT / PURCHASE | 409 | 200 000.00 | 1300 Кт 200 000.00; SETTLEMENT 414 |
| IMPORT / IMPORT_SERVICE / PURCHASE (RC) | 406 | 350 000.00 (nd 0) | 1300 Кт 350 000.00, 2305 Дт 350 000.00; SETTLEMENT 415 |
| IMPORT / NOVAT / PURCHASE | 408 | 0 | Зөвхөн оноох |
| IMPORT / VAT10 / PURCHASE | 407 | 0 | Зөвхөн оноох |

| G/L entry | Данс | Дт | Кт | `gen_posting_type` |
|---|---|---:|---:|---|
| 2001 | 1300 Орцын НӨАТ (DOMESTIC/VAT10) | | 300 000.00 | SETTLEMENT |
| 2002 | 2300 Борлуулалтын НӨАТ (DOMESTIC/VAT10) | 1 000 000.00 | | SETTLEMENT |
| 2003 | 1300 Орцын НӨАТ (IMPORT/CUSTOMS_VAT) | | 200 000.00 | SETTLEMENT |
| 2004 | 1300 Орцын НӨАТ (IMPORT/IMPORT_SERVICE) | | 350 000.00 | SETTLEMENT |
| 2005 | 2305 Урвуу тооцооны НӨАТ | 350 000.00 | | SETTLEMENT |
| 2006 | 2310 НӨАТ-ын тооцоо | | 500 000.00 | NONE |
| | **Нийт** | **1 350 000.00** | **1 350 000.00** | |

| SETTLEMENT entry | `base` | `amount` | nd base / nd amount | `gl_entry_no` | Хаасан эх entry |
|---|---:|---:|---:|---|---|
| 412 | −3 000 000.00 | −300 000.00 | −200 000.00 / −20 000.00 | 2001 | 404, 405 |
| 413 | 10 000 000.00 | 1 000 000.00 | 0 / 0 | 2002 | 401, 411 |
| 414 | 0.00 | −200 000.00 | 0 / 0 | 2003 | 409 |
| 415 | −3 500 000.00 | −350 000.00 | 0 / 0 | 2004 | 406 |

Үр дүн: 401, 404–406, 409, 411 → `closed = true`, `closed_by_entry_no`, `vat_return_period_id` = 2027-05; 402, 403, 407, 408 → зөвхөн `vat_return_period_id` (closed = false); 410 өөрчлөгдөөгүй. Үе `CLOSED`, `settlement_transaction_no` = `GJ-2027-00088`-ийн гүйлгээ. Хаалтын дараах ТТ-03а (оноолтоор) өмнөхтэй яг ижил. Инвариант: 1300 = 300 000 + 50 000 + 350 000 + 200 000 − 850 000 = 50 000.00 = entry 410-ын `amount`; 2300 = 0; 2305 = 0; 2310 = 500 000.00 Кт = мөр 14.

**Хоцорч баталгаажуулах хувилбар:** 2027-06-12-нд PI-2027-00152-ыг ДДТД-ээр баталгаажуулбал entry 410 (`vat_date` 2027-05-22) 6-р сарын scope-д орж, 6-р сарын ТТ-03а-гийн мөр 7 (+500 000.00), мөр 8 (−50 000.00)-д нэмэгдэнэ; ТТ-03а-5-д "хоцорч баталгаажсан" (W-TAX-10). 5-р сарын тайлан өөрчлөгдөхгүй.

### E-TAX-07. НӨАТ төлөх (GS-VAT-014)

`BP-2027-00061`, 2027-06-08 (хугацаа 2027-06-10):

| Данс | Дт | Кт |
|---|---:|---:|
| 2310 НӨАТ-ын тооцоо | 500 000.00 | |
| 1110 Харилцах данс | | 500 000.00 |
| **Нийт** | **500 000.00** | **500 000.00** |

### E-TAX-08. Орцын НӨАТ-ын хасалтаас татгалзах (GS-VAT-016)

Нийлүүлэгч PI-2027-00152-ын баримтыг eBarimt-д бүртгээгүй тул 2027-06-15-нд `input-vat:write-off` (шалтгаан `NO_EBARIMT`) → ваучер `GJ-2027-00095`, source `VATADJ`:

| Данс | Дт | Кт | Тайлбар |
|---|---:|---:|---|
| 7213 Бичиг хэрэг, хэвлэлийн зардал | 50 000.00 | | Эх суурь мөрийн данс (G/L–VAT холбоос) |
| 1300 Орцын НӨАТ | | 50 000.00 | |
| **Нийт** | **50 000.00** | **50 000.00** | |

| VAT entry | `vat_date` | `base` | `amount` | nd base / nd amount | `closed` / `closed_by_entry_no` |
|---|---|---:|---:|---:|---|
| 410 (эх) | 2027-05-22 | 500 000.00 | 50 000.00 | 0 / 0 | true / 430 |
| 430 (шинэ) | 2027-06-15 | −500 000.00 | −50 000.00 | 500 000.00 / 50 000.00 | true / 410 |

6-р сарын хаалтад 410 ба 430 зөвхөн оноогдоно (G/L-гүй); ТТ-03а-гийн мөр 11 = 50 000.00 (мэдээлэл); 1300-ийн үлдэгдэл 0.

### E-TAX-09. Хаалтыг цуцлах (дахин нээх) (GS-VAT-017)

E-TAX-06-ийн дараа, илгээхээс өмнө 2027-06-05-нд (5-р сарын нягтлан бодох үе `OPEN`) Owner `:reopen` (шалтгаан "Мартагдсан нэхэмжлэх нэмэх"). Буцаалтын ваучер (source `REVERSAL`, огноо 2027-05-31, `document_no = GJ-2027-00088`):

| Данс | Дт | Кт |
|---|---:|---:|
| 1300 Орцын НӨАТ | 300 000.00 | |
| 2300 Борлуулалтын НӨАТ | | 1 000 000.00 |
| 1300 Орцын НӨАТ | 200 000.00 | |
| 1300 Орцын НӨАТ | 350 000.00 | |
| 2305 Урвуу тооцооны НӨАТ | | 350 000.00 |
| 2310 НӨАТ-ын тооцоо | 500 000.00 | |
| **Нийт** | **1 350 000.00** | **1 350 000.00** |

SETTLEMENT толин тусгал 416–419 (`reversed = true`); 412–415 `reversed = true`; 401, 404–406, 409, 411 → `closed = false`; 401–409, 411 → `vat_return_period_id = NULL`; үе `OPEN`. Шинэ хаалт нь шинэ дугаар (`GJ-2027-00096` г.м.) авна.

### E-TAX-10. НХАТ: рестораны B2C борлуулалт, үнэ НӨАТ ба НХАТ шингэсэн (GS-VAT-019, GS-VAT-020, R2)

Компани "Хоолны газар ХХК" (НӨАТ ба НХАТ төлөгч). `SI-2027-00512`, 2027-08-14, бэлэн. Мөр 10000: хоол 3 × 4 480.00 = 13 440.00 (НХАТ `UB`); мөр 20000: цай 1 × 1 000.00 (`UB`). Бүлэг (VAT10, NORMAL, UB, +): `G = 14 440.00`, `VAT = RV(14 440 × 10/112) = RV(1 289.2857) = 1 289.29`, `CT = R(14 440 × 2/112) = R(257.8571) = 257.86`, `Base = 12 892.85`.

| Мөр | CLA | VAT (хувь хэмжээ → утга) | CT (хувь хэмжээ → утга) | Amount |
|---|---:|---|---|---:|
| 10000 | 13 440.00 | 1 200.003989 → 1 200.00 | 240.002659 → 240.00 | 12 000.00 |
| 20000 | 1 000.00 | 89.286011 + 0.003989 → 89.29 | 17.857341 + 0.002659 → 17.86 | 892.85 |
| Σ | 14 440.00 | 1 289.29 | 257.86 | 12 892.85 |

Нэхэмжлэхийн ваучер:

| Данс | Дт | Кт |
|---|---:|---:|
| 1200 Дансны авлага | 14 440.00 | |
| 5110 Ажил, үйлчилгээний орлого | | 12 892.85 |
| 2300 Борлуулалтын НӨАТ | | 1 289.29 |
| 2320 НХАТ-ын өглөг | | 257.86 |
| **Нийт** | **14 440.00** | **14 440.00** |

Төлбөрийн ваучер (МХ-1): 1100 Дт 14 440.00 / 1200 Кт 14 440.00. VAT entry: SALE `base` −12 892.85, `amount` −1 289.29. `city_tax_entry`: SALE `base` −12 892.85, `amount` −257.86, `rate_percent` 2, код `UB`. eBarimt: item `totalVAT` 1 200.00 / 89.29, `totalCityTax` 240.00 / 17.86; толгой `totalAmount` 14 440.00.

8-р сарын хаалт (`V2`, `CITYTAXSTMT`, 2027-08-31; сард зөвхөн энэ баримт гэж үзвэл): 2320 Дт 257.86 / 2325 Кт 257.86; SETTLEMENT `city_tax_entry` (`base` 12 892.85, `amount` 257.86). Төлбөр: 2325 Дт / 1110 Кт 257.86.

### E-TAX-11. Хялбаршуулсан НӨАТ, 2027 оны 3-р улирал (GS-VAT-021, R2, параметр баталгаажсаны дараа)

Компани "Жижиг Худалдаа ХХК", профайл `SIMPLIFIED` 2027-07-01-нээс. Улиралд: борлуулалт (VAT10) суурь 30 000 000.00, НӨАТ 3 000 000.00 (2300 Кт); худалдан авалт 12 000 000.00 + НӨАТ 1 200 000.00 → бүхэлдээ өртөгт (`SIMPLIFIED_REGIME`; 1400/7xxx Дт 13 200 000.00 / 2100 Кт 13 200 000.00). Хаалт 2027-09-30 (§6.14):

| Данс | Дт | Кт |
|---|---:|---:|
| 2300 Борлуулалтын НӨАТ | 3 000 000.00 | |
| 2310 НӨАТ-ын тооцоо (төлөх) | | 300 000.00 |
| 8200 Бусад орлого (тооцоот хасалт, ⚠ OQ-TAX-06) | | 2 700 000.00 |
| **Нийт** | **3 000 000.00** | **3 000 000.00** |

### E-TAX-12. ААНОАТ-ын туслах тайлан, 2027 он (GS-VAT-022, R2)

"Жишээ ХХК", STANDARD + CREDIT_90 эрхтэй (2026 оны орлого 450 000 000 ≤ 2 500 000 000; 1 %-ийн горимд эрхгүй: 450 000 000 > 300 000 000).

| Үзүүлэлт | Q1 (01-01..03-31) | H1 (01-01..06-30) |
|---|---:|---:|
| Орлого (`Rev`) | 120 000 000.00 | 260 000 000.00 |
| Татварын өмнөх ашиг (`PBT`) | 18 000 000.00 | 39 500 000.00 |
| Хасагдахгүй зардал (8430 торгууль) | 500 000.00 | 500 000.00 |
| Татвар ногдох орлого (`TI`) | 18 500 000.00 | 40 000 000.00 |
| Шатлалын татвар (10 %) | 1 850 000.00 | 4 000 000.00 |
| 90 %-ийн хөнгөлөлт | −1 665 000.00 | −3 600 000.00 |
| Хөнгөлөлтийн дараах татвар | 185 000.00 | 400 000.00 |
| **Улирлын төлөх** | **185 000.00** | **215 000.00** |
| Тайлангийн хугацаа (`cit.quarterly_return_due_day`) | 2027-04-20 | 2027-07-20 |

Хуримтлалын ноорог (хэрэглэгч батална): Q1 — 9100 Дт 185 000.00 / 2330 Кт 185 000.00; Q2 — 9100 Дт 215 000.00 / 2330 Кт 215 000.00.

---

## 8. Validation ба алдааны кодууд

Хэлбэр нь 14 §9.1-ийн RFC 9457 `problem+json` (`code`, `title`, `detail`, `errors[]`, `traceId`; API-ERR-01..06). `code` нь `tax.<snake_case>` (05-ийн `gl.period_closed` хэв маяг). Мессеж монгол, `{…}`-д серверийн утга орно; англи `title` нь i18n-ийн нөөц. Нэг хүсэлтийн шалгалтыг **бүгдийг цуглуулж** (05 BR-PST-06) `errors[]`-д мөр бүрийн `pointer`-той (`/lines/3/vatProdPostingGroupId` гэх мэт) буцаана. Posting-ийн B үе (DB) дэх алдааг SQLSTATE → код (§8.3) хөрвүүлнэ.

### 8.1 Алдаа (blocking)

#### Тохиргоо ба тооцоолол

| Код | HTTP | Нөхцөл | Мессеж (MN) | BR |
|---|---|---|---|---|
| `tax.vat_posting_setup_missing` | 422 | (VAT Bus., VAT Prod.) хослолд setup мөр алга | "НӨАТ-ын тохиргоо олдсонгүй: {vatBus} × {vatProd}. Тохиргоо → НӨАТ-ын тохиргоо цэснээс нэмнэ үү." | BR-TAX-01 |
| `tax.vat_posting_setup_blocked` | 422 | Setup мөр `blocked = true` | "НӨАТ-ын тохиргоо {vatBus} × {vatProd} хаагдсан байна." | BR-TAX-01 |
| `tax.vat_calc_type_locked` | 409 | Entry-тэй хослолын тооцооны төрлийг өөрчлөх | "Энэ хослолоор НӨАТ-ын бичилт үүссэн тул тооцооны төрлийг өөрчлөх боломжгүй. Шинэ бүтээгдэхүүний бүлэг үүсгэнэ үү." | BR-TAX-03 |
| `tax.vat_setup_in_use` | 409 | Entry-тэй бүлэг/setup мөрийг устгах, эсвэл бүлгийн `code`-ыг өөрчлөх | "{code} бүлгийг НӨАТ-ын бичилт ашиглаж байгаа тул устгах эсвэл кодыг өөрчлөх боломжгүй. Хаах (blocked) сонголтыг ашиглана уу." | BR-TAX-03 |
| `tax.vat_account_change_open_entries` | 409 | Хаагдаагүй (`closed = false`, дүн ≠ 0) entry-тэй setup мөрийн НӨАТ-ын дансыг өөрчлөх | "{vatBus} × {vatProd}-д хаагдаагүй НӨАТ-ын бичилт ({count}) байгаа тул дансыг өөрчлөх боломжгүй. Эхлээд НӨАТ-ын хаалт хийнэ үү." | BR-TAX-03 |
| `tax.vat_identifier_rate_conflict` | 422 | Нэг Bus. бүлэгт ижил identifier өөр хувь/төрөлтэй | "{vatBus} бүлэгт '{identifier}' таних тэмдэг өөр хувь эсвэл тооцооны төрөлтэй мөрөнд давхардсан байна." | BR-TAX-04 |
| `tax.sales_vat_account_missing` | 422 | Хувь > 0 NORMAL мөрийг борлуулалтад, данс хоосон | "{vatBus} × {vatProd}-д борлуулалтын НӨАТ-ын данс тохируулаагүй байна." | BR-TAX-05 |
| `tax.purchase_vat_account_missing` | 422 | Худалдан авалт/RC/FULL_VAT-д данс хоосон | "{vatBus} × {vatProd}-д худалдан авалтын НӨАТ-ын данс тохируулаагүй байна." | BR-TAX-05 |
| `tax.reverse_charge_account_missing` | 422 | `REVERSE_CHARGE` мөрийн 2305 данс хоосон | "{vatBus} × {vatProd}-д урвуу тооцооны НӨАТ-ын данс тохируулаагүй байна." | BR-TAX-05 |
| `tax.vat_account_invalid` | 422 | НӨАТ-ын данс `POSTING` биш, блоклогдсон, `gen_posting_type ≠ 'NONE'`, эсвэл ангилал буруу (борлуулалт/урвуу тооцоо — `LIABILITIES`, худалдан авалт — `ASSETS`) | "{accountNo} данс НӨАТ-ын дансаар ашиглах боломжгүй ({reason})." | BR-TAX-05 |
| `tax.vat_calc_type_not_allowed` | 422 | Борлуулалтад `REVERSE_CHARGE`/`FULL_VAT`, эсвэл баримтын төрөлд зөвшөөрөгдөөгүй | "'{calcType}' тооцооны төрлийг {documentType} баримтад хэрэглэхгүй." | BR-TAX-07 |
| `tax.full_vat_account_mismatch` | 422 | `FULL_VAT` мөрийн данс ≠ setup-ийн `purchase_vat_account_id` | "Гаалийн НӨАТ-ын мөрийн данс {expected} байх ёстой (одоо {actual})." | BR-TAX-24 |
| `tax.full_vat_non_deductible_not_allowed` | 422 | `FULL_VAT` мөрөнд хасагдахгүй хувь/шалтгаан | "Гаалийн НӨАТ-ын мөрөнд хасагдахгүй хэсэг тавих боломжгүй; зардлын мөрөөр бүртгэнэ үү." | BR-TAX-24 |
| `tax.customs_declaration_required` | 422 | `FULL_VAT` мөртэй баримт/журналын мөрийг батлахад мэдүүлгийн дугаар (`vendor_invoice_no`/`external_document_no`; CR-TAX-05-ийн дараа `customs_declaration_id`) эсвэл огноо (`document_date`) хоосон | "Гаалийн НӨАТ-ын мөрөнд гаалийн мэдүүлгийн дугаар ба огноог оруулна уу." | BR-TAX-46, BR-TAX-62 |
| (НӨАТ-ын зөрүү) | 422 | BR-TAX-26 | Эх модулийн код: `purchase.vat_difference_not_allowed`, `purchase.vat_difference_exceeds_max` (07 §8), `gl.vat_difference_not_allowed`, `gl.vat_difference_too_large` (05 §8) | BR-TAX-26 |
| `tax.non_deductible_reason_required` | 422 | `nd% > 0` гараар тавьсан, шалтгаангүй | "Хасагдахгүй НӨАТ-ын шалтгааныг сонгоно уу." | BR-TAX-52 |
| `tax.non_deductible_reason_invalid` | 422 | Систем-д зориулсан шалтгааныг (`NON_VAT_COMPANY`, `SIMPLIFIED_REGIME`, `REJECTED`) гараар сонгох, эсвэл NORMAL/RC бус мөрөнд | "'{reason}' шалтгааныг энэ мөрөнд хэрэглэх боломжгүй." | BR-TAX-52 |

#### Хуулийн параметр

| Код | HTTP | Нөхцөл | Мессеж (MN) | BR |
|---|---|---|---|---|
| `tax.parameter_not_effective` | 422 (posting, тооцоолол) / 404 (`GET /tax-parameters/{code}?date=`) | `d` огноонд хүчинтэй мөр алга | "'{code}' хуулийн параметр {date}-нд хүчинтэй утгагүй байна. Системийн администраторт хандана уу." | BR-TAX-11 |
| `tax.parameter_unverified` | 422 | `ParameterUse.Posting`-д `status = 'unverified'` | "'{code}' параметрийн {date}-ний утга баталгаажаагүй тул бүртгэлд ашиглах боломжгүй." | BR-TAX-12 |

#### НӨАТ-ын огноо, үе, бүртгэл

| Код | HTTP | Нөхцөл | Мессеж (MN) | BR |
|---|---|---|---|---|
| `tax.vat_date_after_posting_date` | 422 | `vat_date > posting_date` (худалдан авалт, журнал) | "НӨАТ-ын огноо бүртгэлийн огнооноос хойш байж болохгүй." | BR-TAX-39 |
| `tax.vat_period_missing` | 422 | НӨАТ төлөгчийн `vat_date`-д үе алга | "{vatDate}-ний НӨАТ-ын тайлангийн үе үүсээгүй байна." | BR-TAX-40 |
| `tax.vat_period_closed` | 409 | `vat_date`-ийн үе `CLOSED`/`SUBMITTED` (DB `ERV01`) | "{period} сарын НӨАТ-ын тайлан хаагдсан тул {vatDate} огноотой НӨАТ бүртгэх боломжгүй. НӨАТ-ын огноог дараагийн нээлттэй сард шилжүүлнэ үү." | BR-TAX-40 |
| `tax.vat_date_outside_user_window` | 422 | R2: хэрэглэгчийн VAT огнооны цонхноос гадуур | "Таны эрхийн НӨАТ-ын огнооны муж {from}–{to}; {vatDate} гадуур байна." | BR-TAX-41 |
| `tax.company_not_vat_registered` | 409 | НӨАТ төлөгч бус компанид хаалт, баталгаажуулалт, урвуу тооцоо | "Компани {date}-нд НӨАТ төлөгч биш тул энэ үйлдэл хийгдэхгүй." | BR-TAX-55, BR-TAX-72; OQ-TAX-07 |
| `tax.vat_registered_from_required` | 422 | `vat_registered = true` болгоход огноогүй | "НӨАТ төлөгчөөр бүртгэгдсэн огноог оруулна уу." | BR-TAX-56 |
| `tax.vat_registered_from_locked` | 409 | Хаагдсан НӨАТ-ын үе эсвэл НӨАТ-ын бичилттэй огнооны мужид бүртгэлийн огноог өөрчлөх | "{from}-оос хойш НӨАТ-ын бичилт эсвэл хаагдсан тайлан байгаа тул бүртгэлийн огноог өөрчлөх боломжгүй." | BR-TAX-56 |
| `tax.vat_deregistration_periods_open` | 409 | R1: `vat_registered = false` болгоход бичилттэй НӨАТ-ын үе хаагдаагүй | "НӨАТ төлөгчөөс хасагдахаас өмнө {periods} сарын НӨАТ-ын тайланг хаана уу." | BR-TAX-58 |

#### Орцын НӨАТ

| Код | HTTP | Нөхцөл | Мессеж (MN) | BR |
|---|---|---|---|---|
| `ebarimt.purchase_receipt_ddtd_invalid` | 422 | ДДТД `^[0-9]{33}$`-д таарахгүй (зай, `-` хассаны дараа; код 12/07-ийнх) | "ДДТД 33 оронтой тоо байна (оруулсан: {length} тэмдэгт)." | BR-TAX-47 |
| `tax.supplier_receipt_id_required` | 422 | Баталгаажуулахад ДДТД алга (батлах үеийн шалгалт нь 07-ийн `purchase.supplier_ebarimt_required`) | "Нийлүүлэгчийн eBarimt-ийн ДДТД-ийг оруулна уу." | BR-TAX-45, BR-TAX-48 |
| `tax.supplier_receipt_id_mismatch` | 409 | Баримтын entry-үүдэд өөр ДДТД бүртгэлтэй | "Энэ баримтад өөр ДДТД ({existing}) бүртгэгдсэн байна." | BR-TAX-49 |
| `ebarimt.purchase_receipt_duplicate` | 409 | ДДТД өөр баримтад бүртгэлтэй (12) | "Энэ ДДТД {documentNo} баримтад аль хэдийн бүртгэгдсэн." | BR-TAX-47 |
| `tax.deduction_reject_not_allowed` | 409 | Татгалзах entry BR-TAX-50-д таарахгүй (баталгаажсан, хаагдсан, үед оноогдсон, буцаагдсан) | "{entryNo} бичилтийн хасалтаас татгалзах боломжгүй ({reason})." | BR-TAX-51 |
| `tax.vat_entry_closed` | 409 | Баталгаажуулалтыг буцаах (`:unconfirm`, Should) үед entry хаагдсан эсвэл үед оноогдсон | "НӨАТ-ын бичилт {entryNo} тайланд орж хаагдсан тул баталгаажуулалтыг буцаах боломжгүй." | 07 BR-PUR-51 |

#### НӨАТ-ын тайлан, хаалт, илгээх, дахин нээх

| Код | HTTP | Нөхцөл | Мессеж (MN) | BR |
|---|---|---|---|---|
| `tax.vat_period_not_open` | 409 | `:close` үед үе `OPEN` биш | "{period} сарын НӨАТ-ын тайлан аль хэдийн хаагдсан байна." | BR-TAX-72 |
| `tax.vat_period_previous_open` | 409 | Өмнөх үе хаагдаагүй | "Өмнөх {previous} сарын НӨАТ-ын тайланг эхлээд хаана уу." | BR-TAX-44 |
| `tax.vat_period_not_ended` | 409 | Бизнесийн огноо < `P.ending_date` | "{period} сар дуусаагүй байна ({endingDate})." | BR-TAX-72 |
| `tax.vat_period_not_closed` | 409 | `:submit` эсвэл `:reopen` үед үе `CLOSED` биш | "НӨАТ-ын тайлан хаагдаагүй байна." | BR-TAX-78, BR-TAX-79 |
| `tax.vat_period_already_submitted` | 409 | `:submit`-ийг давтах (idempotency-гүй) | "{period} сарын НӨАТ-ын тайланг {submittedAt}-нд илгээсэн гэж тэмдэглэсэн." | BR-TAX-78 |
| `tax.vat_period_submitted` | 409 | `SUBMITTED` үеийг өөрчлөх/дахин нээх (DB `ERP02`) | "Илгээсэн НӨАТ-ын тайланг өөрчлөх боломжгүй. Засварыг дараагийн нээлттэй сарын баримтаар хийнэ үү." | BR-TAX-43, BR-TAX-80 |
| `tax.vat_period_reopen_not_latest` | 409 | Хожуу үе хаагдсан байхад өмнөхийг нээх | "Зөвхөн хамгийн сүүлд хаасан НӨАТ-ын үеийг дахин нээнэ ({latest})." | BR-TAX-79 |
| `tax.vat_settlement_date_invalid` | 422 | Хаалтын `postingDate < P.ending_date` (нягтлан бодох үе хаалттай бол `gl.period_closed`, цонхноос гадуур бол `gl.posting_date_outside_window`) | "Хаалтын огноо {date} нь {period} сарын сүүлийн өдөр ({endingDate})-өөс өмнө байж болохгүй." | BR-TAX-72 |
| `tax.vat_settlement_account_missing` | 422 | `tax_setup`-д ба хүсэлтэд данс алга | "НӨАТ-ын тооцооны дансыг (жишээ нь 2310) сонгоно уу." | BR-TAX-76 |
| `tax.vat_settlement_account_invalid` | 422 | Данс `POSTING` биш, блоклогдсон, `LIABILITIES` ангилалгүй, `gen_posting_type ≠ NONE`, Gen./НӨАТ-ын бүлэгтэй, эсвэл аль нэг setup-ийн НӨАТ-ын данс (1300/2300/2305) | "{accountNo} дансыг НӨАТ-ын тооцооны дансаар ашиглах боломжгүй ({reason})." | BR-TAX-76 |
| `tax.vat_statement_stale` | 409 | Тооцоо/preview-ээс хойш scope өөрчлөгдсөн: шинэ VAT entry эсвэл баталгаажуулалт/цуцлалт (`scopeVersion` эсвэл `lastVatEntryNo` зөрсөн) | "Тайланг тооцоолсноос хойш НӨАТ-ын бичилт нэмэгдсэн эсвэл баталгаажуулалт өөрчлөгдсөн. Дахин тооцоолно уу." | BR-TAX-69, BR-TAX-72 |
| `tax.vat_statement_template_missing` | 422 | Компанид `VAT`/`TT03A` загвар алга | "НӨАТ-ын тайлангийн загвар (ТТ-03а) тохируулагдаагүй байна." | BR-TAX-65 |
| `tax.vat_statement_line_invalid` | 422 | Загварын мөрийн шалгалт (BR-TAX-65) | "Тайлангийн мөр {rowNo}: {reason}." | BR-TAX-65 |
| `tax.vat_statement_row_cycle` | 422 | `ROW_TOTALING` давталт | "Тайлангийн мөр {rowNo} өөрийгөө (шууд эсвэл шууд бусаар) нэмж байна." | BR-TAX-65 |
| `tax.submission_reference_required` | 422 | Илгээлтийн дугаар хоосон эсвэл > 100 тэмдэгт | "Татварын албанд илгээсэн дугаарыг (e-tax.mta.mn) оруулна уу." | BR-TAX-78 |
| `tax.reopen_reason_required` | 422 | Шалтгаан < 10 тэмдэгт | "Дахин нээх шалтгааныг дор хаяж 10 тэмдэгтээр бичнэ үү." | BR-TAX-79 |
| `gl.reversal_vat_settled` | 409 | Хаагдсан/үед оноогдсон VAT entry-тэй гүйлгээг буцаах (05) | "Энэ гүйлгээний НӨАТ тайланд орсон тул буцаах боломжгүй. Кредит нот эсвэл засварын баримт үүсгэнэ үү." | BR-TAX-34 |
| `gl.reversal_not_reversible` | 409 | `VATSTMT`/`CITYTAXSTMT` гүйлгээг `:reverse` | "НӨАТ-ын хаалтын гүйлгээг буцаахгүй; НӨАТ-ын үеийг дахин нээнэ үү." | BR-TAX-77 |

#### НХАТ, хялбаршуулсан НӨАТ, ААНОАТ (R2)

| Код | HTTP | Нөхцөл | Мессеж (MN) | BR |
|---|---|---|---|---|
| `tax.city_tax_not_enabled` | 422 | R1-д эсвэл компани НХАТ төлөгч биш үед мөрөнд НХАТ-ын код | "Компанид НХАТ идэвхжээгүй байна." | BR-TAX-27, BR-TAX-89 |
| `tax.city_tax_code_not_effective` | 422 | Код блоклогдсон эсвэл `vat_date`-д хүчингүй | "НХАТ-ын код '{code}' {vatDate}-нд хүчингүй байна." | BR-TAX-90 |
| `tax.city_tax_rate_exceeds_max` | 422 | `c` > хуулийн дээд хязгаар | "НХАТ-ын хувь {rate}% нь хуулийн дээд хязгаар {max}%-иас их байна." | BR-TAX-91 |
| `tax.city_tax_account_missing` | 422 | Кодын `payable_account_id`/`expense_account_id` хоосон | "НХАТ-ын код '{code}'-д {kind} данс тохируулаагүй байна." | BR-TAX-94 |
| `tax.simplified_vat_not_eligible` | 422 | Эргэлт хялбаршуулсан горимын босгоос их, эсвэл салбар хасагдсан | "Компани хялбаршуулсан НӨАТ-ын нөхцөл хангахгүй байна ({reason})." | BR-TAX-97 |
| `tax.regime_change_not_at_period_start` | 422 | Горим солих огноо үеийн эхлэл биш | "Татварын горимыг зөвхөн НӨАТ-ын үеийн эхний өдрөөс өөрчилнө ({expected})." | BR-TAX-102 |
| `tax.cit_period_invalid` | 422 | ААНОАТ-ын туслах тайлангийн үе Q1/H1/9M/FY биш эсвэл санхүүгийн жилгүй | "ААНОАТ-ын тооцооны үе буруу байна ({period})." | BR-TAX-104 |

Эрх, MFA, step-up-ийн алдаа нь платформын `platform.permission_denied`, `platform.mfa_required`, `platform.reauth_required` (403; 14 §9.2) — Tax шинэ код нэмэхгүй. Нэгээс олон алдаатай бол дээд `code` = `api.validation_failed` (API-ERR-05).

### 8.2 Анхааруулга (non-blocking)

Хариуны `warnings[]` (`{ code, message, pointer?, params? }` — `errors[i]`-тэй ижил хэлбэр, API-ERR-04). Анхааруулга баримтыг батлахыг зогсоохгүй; UI нь шар туузаар харуулна.

| ID / API `code` | Хаана | Нөхцөл | Мессеж (MN) | BR |
|---|---|---|---|---|
| W-TAX-01 `tax.vat_threshold_approaching` | Босгын хяналт, dashboard, борлуулалтын preview | `T ≥ 0.8 M`, `T < M` (НӨАТ төлөгч бус) | "Сүүлийн 12 сарын борлуулалт {turnover}₮ нь НӨАТ-ын заавал бүртгүүлэх босгын {pct}% ({threshold}₮) хүрлээ." | BR-TAX-84 |
| W-TAX-02 `tax.vat_threshold_crossed` | Мөн | `T ≥ M` | "Сүүлийн 12 сарын борлуулалт {turnover}₮ нь НӨАТ-ын босго {threshold}₮-ийг {crossedOn}-нд давсан. Татварын албанд НӨАТ төлөгчөөр бүртгүүлэх шаардлагатай." | BR-TAX-84, BR-TAX-87 |
| W-TAX-03 `tax.vat_voluntary_registration_eligible` | Босгын хяналт | `V ≤ T < M` | "Та НӨАТ төлөгчөөр сайн дураар бүртгүүлэх боломжтой (босго {voluntary}₮)." | BR-TAX-84 |
| W-TAX-04 `tax.vat_turnover_below_mandatory` | Босгын хяналт (НӨАТ төлөгч компани) | `T < M` | "Борлуулалт заавал бүртгүүлэх босгоос бага байна. НӨАТ төлөгчөөс хасагдах эсэхийг зөвлөхтэйгээ шийднэ үү." | BR-TAX-84 |
| W-TAX-05 `tax.input_vat_unconfirmed` | ТТ-03а, `:preview-close`, cue | Үед баталгаажаагүй орцын НӨАТ байна | "{count} баримтын {amount}₮ орцын НӨАТ баталгаажаагүй тул энэ сарын тайланд хасагдахгүй." | BR-TAX-50 |
| W-TAX-06 `tax.ebarimt_vat_not_reconciled` | `:preview-close`, тулгалт | eBarimt-тэй зөрүү (`NO_RECEIPT`, `STATUS_*`, `VAT_MISMATCH`) | "{count} борлуулалтын баримтын НӨАТ eBarimt-тэй тулгагдаагүй байна (зөрүү {difference}₮)." | BR-TAX-71 |
| W-TAX-07 `tax.import_service_without_reverse_charge` | Худалдан авалтын мөр | `IMPORT` × үйлчилгээ × `VAT10` | "Гадаадын нийлүүлэгчийн үйлчилгээ байна. Урвуу тооцоо хийх бол 'IMPORT_SERVICE' бүлгийг сонгоно уу." | BR-TAX-09 |
| W-TAX-08 `tax.parameter_unverified_used` | Тайлан, календарь, параметрийн дэлгэц | Ашигласан параметр `unverified` | "'{code}' параметрийн утга баталгаажаагүй (итгэл: {confidence}). Хуулийн эх сурвалжаар шалгана уу." | BR-TAX-12 |
| W-TAX-09 `tax.vat_registration_changed_in_period` | ТТ-03а, хаалт | Үеийн дотор НӨАТ-ын бүртгэлийн огноо өөрчлөгдсөн | "НӨАТ төлөгчөөр бүртгэгдсэн огноо ({from}) энэ үеийн дунд байна; тайланд зөвхөн тэр огнооноос хойших гүйлгээ орно." | BR-TAX-57 |
| W-TAX-10 `tax.input_vat_confirmed_late` | Баталгаажуулалт (`purchase-receipts/{id}:confirm`, `:link-ebarimt`) | `vat_date`-ийн үе хаагдсаны дараа баталгаажуулсан | "{vatDate} огнооны НӨАТ-ын үе хаагдсан тул энэ хасалт дараагийн нээлттэй үеийн тайланд орно." | BR-TAX-49 |
| W-TAX-11 `tax.tax_product_code_placeholder` | Борлуулалтын мөр, eBarimt preview | Setup мөрийн татварын барааны код `TBD` | "'{vatProd}'-ийн eBarimt татварын барааны код түр ('TBD') байна; eBarimt илгээхээс өмнө тохируулна уу." | BR-TAX-06 |
| W-TAX-12 `tax.vat_posting_setup_missing` | Ноорог хадгалах | Setup мөр алга (батлах үед алдаа болно) | "{vatBus} × {vatProd} НӨАТ-ын тохиргоо алга; батлахаас өмнө нэмнэ үү." | BR-TAX-01 |
| W-TAX-13 `tax.vat_return_settlement_mismatch` | `:preview-close` | ТТ-03а мөр 14 ≠ хаалтын төлөх дүн | "ТТ-03а-ийн төлөх НӨАТ ({row14}₮) хаалтын дүн ({settlement}₮)-тэй зөрж байна. Тайлангийн загварыг шалгана уу." | §6.12; BR-TAX-73 |

`warnings[].code` нь хүснэгтийн API код (W-TAX-NN нь баримтын ID). W-TAX-12 нь алдааны кодтой ижил боловч ноорог хадгалахад `severity = warning`. 16 Q13-ын санал `tax.vat_registration_threshold_warning`-ийн оронд W-TAX-01/02-ын кодыг хэрэглэнэ.

### 8.3 SQLSTATE ба DB-ийн хамгаалалт → код

| SQLSTATE / constraint | Эх | Код |
|---|---|---|
| `ERV01` (`tax.fn_vat_entry_before_insert`: `vat_date`-ийн үе `OPEN` биш, SETTLEMENT-ээс бусад) | VAT entry INSERT | `tax.vat_period_closed` |
| `ERP02` (`tax.vat_return_period` `SUBMITTED` мөрийг өөрчлөх) | UPDATE | `tax.vat_period_submitted` |
| `ERL01` (ledger immutable, `fn_ledger_update`-гүй UPDATE) | `tax.vat_entry` | 500 (`traceId`; хөгжүүлэлтийн алдаа — аппликейшн хэзээ ч шууд UPDATE хийхгүй) |
| `23P01` (`tax.tax_parameter` EXCLUDE давхцал) | Migration | Migration унана (тенантын API-д гарахгүй) |
| `23505` `ebarimt.purchase_receipt (company_id, ddtd)` | Баталгаажуулалт | `ebarimt.purchase_receipt_duplicate` |
| `23505` `tax.vat_posting_setup (company_id, vat_bus, vat_prod)` | Setup үүсгэх | `api.duplicate` (409, 14) |
| `23514` (CHECK: ангилал ↔ `taxType`, `vat_percent` 0..100) | Setup хадгалах | `tax.vat_account_invalid` эсвэл `api.validation_failed` (талбартай) |

Код бүрийн монгол/англи текст `Erp.Tax/Resources/Errors.mn.resx` ба `.en.resx`-д; architecture test нь §8.1–8.2-ын код бүр resx-д байгаа эсэхийг шалгана (AT-TAX-017-ийн хамт CI).

---

## 9. Events ба integration

### 9.1 Синхрон гэрээ (нэг transaction дотор, in-process)

| Гэрээ | Эзэмшигч | Хэрэглэгч | Тайлбар |
|---|---|---|---|
| `ITaxParameterProvider.GetParameter(code, asOf, use)`, `GetTimeline` | Tax | Sales, Purchases, GL, Reporting, Platform (календарь), EBarimt | §5.2; процессын immutable snapshot, `NOTIFY tax_parameter_changed` + 10 мин тутмын шалгалтаар шинэчлэгдэнэ |
| `IVatSetupResolver.Resolve` | Tax | Sales, Purchases, GL (журнал) | §5.3 |
| `ITaxCalculator.ComputeDocument(TaxDocument)` | Tax | Sales (06 §5.4), Purchases (07), GL журнал, EBarimt (дүнгийн шалгалт) | §5.4; цэвэр функц, DB-гүй |
| `IVatPostingComposer.Compose` | Tax | Posting engine (05 §5.7) | §5.5 |
| `ILedgerWriter<VatLedgerLine>`, `IReversibleLedger` (order 10); `ILedgerWriter<CityTaxLedgerLine>` (order 15, R2) | Tax | Posting engine | §5.6; 05 BR-PST-40 |
| `IJournalVatHandler` | Tax | GL журнал (05 §5.4.2) | §5.7 |
| `IInputVatService` (`ConfirmDeductibleAsync`, `UnconfirmAsync`, `RejectDeductionAsync`, `ListUnconfirmedAsync`) | Tax | API, inbox handler (R2) | §5.8 |
| `IVatReturnService` (`CalculateAsync`, `CloseAsync(cmd, PostingMode)` — `Preview` = `:preview-close`, `SubmitAsync`, `ReopenAsync`) | Tax | API, job | §5.9–5.11 |
| `IVatReturnQuery` (`GetScopeEntriesAsync`, `GetPeriodStatusAsync`) | Tax | Reporting (ТТ-03а-5/6, CUE-04/14), Platform (dashboard) | §5.12; зөвхөн унших |
| `IVatThresholdMonitor.EvaluateAsync(asOf)` | Tax | Job, dashboard, Sales preview (сүүлийн түвшин) | §5.14 |
| `ICitHelper.CalculateAsync(CitHelperRequest)` (R2) | Tax | Reporting API | §5.17 |
| `ITaxCalendar.GetAsync(from, to)` | Tax | Platform (dashboard, мэдэгдэл), API | §5.18 |
| `IEbarimtReceiptQuery.GetNetStateBySourceDocument` | EBarimt | Tax (§5.13) | 12 §12.3 |
| `IReversalService.Reverse` | GL | Tax (`:reopen`) | 05 §5.10 |
| `IPostingService.PostAsync` | GL | Tax (`:close`, `input-vat:write-off`) | 05 §5.1 |
| `IPartyDirectory` (нэр, ТТД — зөвхөн ТТ-03а-5/6-ийн баяжуулалт) | Parties | Reporting (Tax биш) | Tax `party` хүснэгтэд хандахгүй |

Хамаарлын чиглэл (02 §4.3): Sales, Purchases, GL → Tax.Contracts; Tax → GL.Contracts (posting, reversal), EBarimt.Contracts (зөвхөн унших), Platform. Tax нь Sales/Purchases-ийн хүснэгтийг уншихгүй — баримтын мэдээлэл VAT entry-ийн snapshot-оос (BR-TAX-30).

### 9.2 Нийтлэх outbox topic (`integration.outbox`)

Бүгд тухайн үйлдлийн transaction дотор; payload нимгэн (дугаар, түлхүүр, төлөв), дүн ба PII-гүй (05 §9.1-ийн зарчим). `aggregate_type = 'tax.vat_return_period'` (эсвэл `'tax.vat_threshold'`). Topic нь consumer бүртгэгдсэн үед л бичигдэнэ (05 BR-PST-68).

| Topic | Хэзээ | `payload` | `idempotency_key` | Consumer | Хувилбар |
|---|---|---|---|---|---|
| `tax.vat_period.closed` | `:close` commit | `{ companyId, vatReturnPeriodId, periodCode, settlementTransactionNo?, cityTaxSettlementTransactionNo?, closedAt, lastVatEntryNo }` | `tax.vat_period.closed:{companyId}:{periodId}:{rowVersion}` (`vat_return_period.row_version` шинэчилсний дараах; хаах → нээх → G/L-гүй дахин хаах үед `lastVatEntryNo` давтагдаж event алга болохоос сэргийлнэ) | Мэдэгдэл (нягтлан, Owner), dashboard кэш, R2 webhook `vat_return_period.status_changed` | R1 |
| `tax.vat_period.submitted` | `:submit` | `{ companyId, vatReturnPeriodId, periodCode, submittedAt, submittedBy }` (`submission_reference` орохгүй) | `tax.vat_period.submitted:{companyId}:{periodId}` | Мэдэгдэл, GL үе түгжих санал (Z-TAX-04), R2 webhook | R1 |
| `tax.vat_period.reopened` | `:reopen` | `{ companyId, vatReturnPeriodId, periodCode, reversalTransactionNo?, reopenedBy, reasonCodeId? }` | `tax.vat_period.reopened:{companyId}:{periodId}:{rowVersion}` | **Заавал мэдэгдэл** (бүх Owner, нягтлан — 13 аюулгүй байдлын event), R2 webhook | R1 |
| `tax.vat_threshold.level_changed` | Босгын job, түвшин өөрчлөгдсөн | `{ companyId, asOf, previousLevel, level, crossedOn? }` | `tax.vat_threshold.level_changed:{companyId}:{level}:{thresholdParamId}` (BR-TAX-86) | Мэдэгдэл (Owner: имэйл + апп), dashboard | R1 |
| `tax.input_vat.rejected` | `input-vat:write-off` | `{ companyId, transactionNo, documentNo, purchInvoiceId, entryNos[] }` | `tax.input_vat.rejected:{companyId}:{transactionNo}` | Мэдэгдэл (Purchases-ийн эзэн) | R1 · Should |
| `tax.vat_return.exported` | Экспортын job амжилттай | `{ companyId, vatReturnPeriodId, jobId, lastVatEntryNo }` | `tax.vat_return.exported:{companyId}:{jobId}` | Мэдэгдэл (S-PLT-18) | R1 (job framework-ийн ерөнхий event-ээр хангагдвал хасна) |

Webhook (R2, 14 §11.2): `vat_return_period.status_changed` (`{ id, status, previousStatus }`) — дээрх гурван topic-ийн fan-out. `vat_entry`-ийн webhook байхгүй (эх баримтын `*.posted` хангалттай).

### 9.3 Хүлээн авах event

| Event | Илгээгч | Энэ модулийн үйлдэл | Idempotency | Хувилбар |
|---|---|---|---|---|
| `ebarimt.purchase_receipts.imported` | EBarimt (outbox → inbox) | `matched[].autoConfirm = true` мөр бүрд `ConfirmDeductibleAsync` (шинэ transaction, мөр тус бүр); алдаатай мөрийг `integration.inbox`-ийн үр дүнд бичиж, бусдыг үргэлжлүүлнэ | `inbox (consumer='tax', message_id)`; баталгаажсан entry → no-op | R2 (12 PUR-12) |
| `platform.company_settings.changed` (`vat_registered`, `vat_registered_from`, `city_tax_payer`, `vat_rounding_type`) | Platform (in-process domain event, ижил transaction) | BR-TAX-56: НӨАТ-ын үе үүсгэх (`fn_mn_ensure_vat_return_periods`), босгын хяналтыг дахин үнэлэх job товлох | Transaction-ий нэг хэсэг | R1 |
| `gl.fiscal_year.created` | GL (in-process) | Тухайн жилийн 12 НӨАТ-ын үе үүсгэх | `ON CONFLICT DO NOTHING` | R1 |
| `platform.company.provisioned` | Platform (`mn_90_provision.sql`) | `tax.fn_mn_seed_vat_groups`, `…_vat_setup`, `…_vat_statement`, `…_ensure_vat_return_periods` | Seed функц идемпотент (BR-TAX-08) | R1 |
| `tax.tax_parameter` migration | Operator (deploy) | `ITaxParameterProvider`-ийн кэш хүчингүй (deploy hook); календарь ба босгын job дараагийн ажиллалтаар шинэ утга | — | R1 |

`platform.company_settings.changed`, `gl.fiscal_year.created`, `platform.company.provisioned` нь бусад spec-д нэрлэгдээгүй in-process domain event-ийн **санал болгож буй нэр** (02 §4-ийн Domain давхаргын in-memory domain event); эзэмшигч модуль өөр нэр сонговол энэ хүснэгтийг дагуулж засна. Синхрон дуудлагаар (Platform → `ITaxProvisioning`) хэрэгжүүлж болно — үр дүн ижил.

### 9.4 Job

| Job | Хуваарь | Үйлдэл | Retry | Хувилбар |
|---|---|---|---|---|
| `tax.vat_threshold.check` | Өдөр бүр 06:00 Asia/Ulaanbaatar, компани тус бүр | §5.14; түвшин өөрчлөгдсөн бол outbox | 3, timeout 5 мин | R1 (CR-TAX-11) |
| `tax.vat_return.export` | Хүсэлтээр (`:export`) | §5.12 | 3, timeout 2 мин | R1 (CR-TAX-11) |
| `tax.vat_invariant.check` | Шөнө бүр (02 §8.8-ийн шөнийн шалгалтын нэг алхам) | BR-TAX-82: дансны үлдэгдэл ↔ VAT entry; зөрвөл 02 §8.8-ийн `ops.consistency_issue` (P2; схемд хараахан алга — 02-ын эзэмшил) ба Owner-т мэдэгдэл | 1 | R1 (02 §8.8-ийн job-д нэмнэ) |
| `tax.calendar.reminder` | Өдөр бүр 09:00 | Хугацаа хүртэл 7, 3, 1 хоног үлдсэн мөрөнд мэдэгдэл (BR-TAX-110) | 1 | R1 · Should (платформын мэдэгдлийн job-оор) |

### 9.5 Ажиглалт

- Метрик: `erp_tax_document_compute_duration_seconds`, `erp_tax_vat_close_total{result}`, `erp_tax_parameter_lookup_total{use,status}` (`unverified`-ийн Report хэрэглээг харуулна), `erp_tax_threshold_level{level}`.
- Log: `:close`, `:submit`, `:reopen`, `input-vat:write-off` бүр `audit.security_event`-д (13 §9; `VAT_PERIOD_CLOSE`, `VAT_PERIOD_SUBMITTED`, `VAT_PERIOD_REOPEN`, `VAT_DEDUCTION_REJECTED`).
- Trace span: `tax.compute_document`, `tax.vat_close.plan`, `tax.vat_close.post`.

---

## 10. API ба UI холбоос

Нэр, зам, эрхийн жагсаалт. Request/response-ийн бүрэн schema нь [14-api.md](./14-api.md) §15 ба `api/openapi.yaml`-д (энд зөвхөн нэр). Бүх зам `/api/v1/companies/{companyId}/…` дор (глобал `tax-parameters`-ээс бусад).

### 10.1 Endpoint

| Endpoint | Эрх | Хувилбар | Тайлбар |
|---|---|---|---|
| `GET /tax-parameters`, `GET /tax-parameters/{paramCode}?date=` | AUTHENTICATED (глобал) | R1 | BR-TAX-11; хариунд `status`, `confidence`, `legalBasis`, `sourceUrl`, `isVerified` |
| `GET/POST/PATCH/DELETE /vat-business-posting-groups`, `/vat-product-posting-groups` | `TABLE tax.vat_bus_posting_group`, `tax.vat_prod_posting_group` | R1 | BR-TAX-03 (устгах хамгаалалт) |
| `GET/POST/PATCH/DELETE /vat-posting-setups` | `TABLE tax.vat_posting_setup` | R1 | BR-TAX-01…06; `ETag` |
| `GET /vat-entries`, `GET /vat-entries/{entryNo}` | `TABLE tax.vat_entry R` | R1 | Шүүлт: `vatDateFrom/To`, `entryType`, `vatReturnPeriodId`, `periodScope`, `closed`, `deductibleConfirmed`, `vatBus`, `vatProd`, `vatCategory`, `documentNo`, `entryNoFrom` |
| `GET /input-vat/unconfirmed` (07 BR-PUR-52) | `TABLE tax.vat_entry R` | R1 | BR-TAX-50; Tax-ийн `IInputVatService.ListUnconfirmedAsync` |
| `POST /purchase-receipts/{id}:confirm`, `:unconfirm` (12, 07 BR-PUR-50/51); `POST /purchase-invoices/{id}:link-ebarimt` (`confirm`, 07) | `ACTION tax.vat_entry.confirm_deductible` | R1 (`:unconfirm` Should) | BR-TAX-49; Tax-ийн `ConfirmDeductibleAsync` / `UnconfirmAsync` |
| `POST /input-vat:write-off` (07 §5.12), `POST /input-vat:preview-write-off` (санал) | `ACTION tax.vat_entry.confirm_deductible` | R1 · Should | BR-TAX-51; `PostingPreview` |
| `PUT /purchase-invoices/{id}/vat-amount-lines` | `TABLE purchase.purchase_header M` | R1 | BR-TAX-26 (НӨАТ-ын зөрүү); 07-ийн endpoint, Tax шалгана |
| `GET /vat-return-periods`, `GET /vat-return-periods/{id}` | `TABLE tax.vat_return_period R` | R1 | |
| `POST /vat-return-periods/{id}:preview-close` | `ACTION tax.vat.settle` | R1 | `PostingPreview` + `warnings[]` + `lastVatEntryNo` + `scopeVersion` |
| `POST /vat-return-periods/{id}:close` | `ACTION tax.vat.settle` | R1 | `{ postingDate, settlementAccountId?, expectedScopeVersion, expectedLastVatEntryNo? }`; BR-TAX-69, -72…76 |
| `POST /vat-return-periods/{id}:submit` | `ACTION tax.vat_return.submit` (MFA, step-up) | R1 | `{ submissionReference }`; хариунд `effects[]` |
| `POST /vat-return-periods/{id}:reopen` | `ACTION tax.vat.reopen` (Owner, step-up; CR-TAX-09) | R1 | `{ reasonCodeId?, reasonText }` |
| `POST /vat-return-periods/{id}:export` | `ACTION tax.vat_return.export` (CR-TAX-09; тэр хүртэл `rpt.export.excel` + `REPORT rpt.vat_return`) | R1 | 202 + `Job` |
| `GET /reports/vat-return?periodId=&scope=` | `REPORT rpt.vat_return` | R1 | §5.9; `scope = PERIOD \| OPEN_PREVIEW` |
| `GET /reports/vat-return/lines/{rowNo}/entries?periodId=` | `REPORT rpt.vat_return` + `TABLE tax.vat_entry R` | R1 | Drill-down (`drillFilter`) |
| `GET /reports/vat-purchase-register?periodId=` (ТТ-03а-5), `GET /reports/vat-sales-register?periodId=` (ТТ-03а-6) | `REPORT rpt.vat_return` | R1 | §5.12 |
| `GET /reports/vat-ebarimt-reconciliation?periodId=` | `REPORT rpt.vat_return` | R1 | §5.13 |
| `GET/POST/PATCH /vat-statement-templates`, `/vat-statement-names`, `/vat-statement-lines` | `TABLE tax.vat_statement_*` | R1 · Could (R1-д seed загварыг зөвхөн унших) | BR-TAX-65 |
| `GET /tax/vat-threshold?asOf=` | `REPORT rpt.vat_threshold` (CR-TAX-09; тэр хүртэл `REPORT rpt.vat_return`) | R1 | §5.14 |
| `GET /tax/calendar?from=&to=` | `TABLE tax.tax_parameter R` | R1 · Should | §5.18 |
| `GET/POST/PATCH /city-tax-codes`, `GET/PATCH /city-tax-setup`, `GET /city-tax-entries`, `GET /reports/city-tax?periodId=` | `TABLE tax.city_tax_*`, `REPORT rpt.vat_return` | R2 | §5.15 |
| `GET/POST /company-tax-profiles` (effective-dated) | `ERP_SETUP` | R2 | CR-TAX-04; BR-TAX-97, -102 |
| `GET /reports/simplified-vat?periodId=` | `REPORT rpt.vat_return` | R2 · Could | §5.16 |
| `GET /reports/cit-helper?year=&period=`, `POST /reports/cit-helper:create-accrual-draft`, `POST /reports/cit-helper:export` | `REPORT rpt.cit_helper` (CR-TAX-09); ноорогт `TABLE gl.journal_line I` | R2 | §5.17 |
| `GET/POST/PATCH /customs-declarations` | `TABLE tax.customs_declaration` (CR-TAX-05) | R2 | BR-TAX-62 |

Тэмдэг: `vat-entries` нь DB-ийн тэмдгийг өөрчлөхгүй (14 API-JSON-07); мөнгөн дүн string (`"−2166.67"`).

### 10.2 Дэлгэц

| ID | Нэр | Зам | Гол үйлдэл | Endpoint |
|---|---|---|---|---|
| S-TAX-01 | НӨАТ-ын тохиргоо (матриц) | `/settings/vat` | Бүлэг, setup засах; entry-тэй мөрийн тооцооны төрөл түгжээтэй (BR-TAX-03); `TBD` кодын тэмдэглэгээ (W-TAX-11) | `vat-*-posting-groups`, `vat-posting-setups` |
| S-TAX-02 | НӨАТ-ын тайлангийн үе | `/tax/vat-returns` | Жагсаалт, төлөв, `due_date`, хаалтын гүйлгээ руу холбоос | `vat-return-periods` |
| S-TAX-03 ★ | НӨАТ-ын тайлан (ТТ-03а) | `/tax/vat-returns/{id}` | Тооцоолох, drill-down, анхааруулгын самбар (W-TAX-05/06/08/13), Хаах (preview → баталгаажуулах), Илгээсэн болгох ("ИЛГЭЭСЭН" гэж бичих, UX-PAGE-23), Дахин нээх (Owner), Экспорт | `reports/vat-return`, `:preview-close`, `:close`, `:submit`, `:reopen`, `:export` |
| S-TAX-04 | НӨАТ-ын бичилт | `/tax/vat-entries` | Шүүх, эх баримт ба G/L руу | `vat-entries` |
| S-TAX-05 | Орцын НӨАТ баталгаажуулах | `/tax/input-vat` | ДДТД оруулах/тулгах, бөөнөөр баталгаажуулах, зардалд шилжүүлэх (preview) | `input-vat/unconfirmed`, `purchase-receipts/{id}:confirm`, `input-vat:write-off` |
| S-TAX-06 | Хуулийн параметр | `/settings/legal-parameters` | Хугацааны шугам, эх сурвалж, итгэл, ⚠ | `tax-parameters` |
| S-TAX-07 | Татварын календарь | `/tax/calendar` | Хугацаа, төлөв, үе рүү холбоос | `tax/calendar` |
| S-TAX-08 | НХАТ (R2) | `/tax/city-tax` | Код, тохиргоо, бичилт, тайлан | `city-tax-*`, `reports/city-tax` |
| S-TAX-09 (шинэ) | ТТ-03а-5/6 бүртгэл | `/tax/vat-returns/{id}/registers` | Хоёр таб, Excel | `reports/vat-*-register` |
| S-TAX-10 (шинэ) | eBarimt-тэй тулгалт | `/tax/vat-returns/{id}/ebarimt` | Зөрүүтэй баримт, 12-ын хяналт руу | `reports/vat-ebarimt-reconciliation` |
| S-TAX-11 (шинэ) | НӨАТ-ын босгын хяналт | `/tax/vat-threshold` | 12 сарын график, `M`/`V` шугам (2027-07-01-ний алхам) | `tax/vat-threshold` |
| S-TAX-12 (шинэ, R2) | Татварын профайл | `/settings/tax-profile` | Горимын түүх (НӨАТ, ААНОАТ) | `company-tax-profiles` |
| S-TAX-13 (шинэ, R2) | Хялбаршуулсан НӨАТ | `/tax/simplified-vat` | Улирлын тооцоо | `reports/simplified-vat` |
| S-TAX-14 (шинэ, R2) | ААНОАТ-ын туслах | `/tax/cit-helper` | Хуримтлагдсан тооцоо, ноорог үүсгэх | `reports/cit-helper` |

Dashboard: CUE-04 (төлөх НӨАТ), CUE-14 (баталгаажаагүй орцын НӨАТ) нь `IVatReturnQuery`-гээр; босгын түвшин `APPROACHING`/`CROSSED` бол Owner-ийн нүүрэнд шар/улаан тууз (S-TAX-11 руу). Борлуулалт, худалдан авалтын карт: мөрийн "НӨАТ" багана `ITaxCalculator`-ийн серверийн дүн (UI өөрөө тооцохгүй, 15 UX-DOC), хөл хэсэгт identifier тус бүрийн НӨАТ ба НХАТ.

**Бусад баримтад тусгах (засварлахгүй, санал):** 15 §18-д S-TAX-09…14-ийг нэмэх; 14 §15-д `:preview-close`, `:reopen`, `input-vat:write-off`, `input-vat:preview-write-off`, `reports/vat-*-register`, `reports/vat-ebarimt-reconciliation`, `tax/vat-threshold`, `tax/calendar` endpoint-ийг нэмэх (14 Q19-ийг энэ баримтын §5.11 хаана); 14 §11.2-т webhook `vat_return_period.status_changed`.

---

## 11. Тест сценари

Түвшин: **U** — unit (`Erp.Tax.Tests`, DB-гүй), **P** — property (FsCheck), **I** — integration (Testcontainers PostgreSQL, seed `BASE` эсвэл `BASE-NONVAT`, 16 §10), **A** — architecture, **E** — API (WebApplicationFactory). Бүх тестийн огноо `FakeTimeProvider`-оор; хуулийн параметр нь `legal_parameters.sql`-ийн бодит мөр (тестийн тусгай мөрийг `tax.tax_parameter`-д migration-аар л оруулна). Хэлбэр: **Өгөгдсөн нь** (Given) / **Хэрэв** (When) / **Тэгвэл** (Then).

### 11.1 Хүлээн авах тест (AT-TAX)

#### Тохиргоо (BR-TAX-01…09)

- **AT-TAX-001** (BR-TAX-01) · I/E. **Өгөгдсөн нь** `DOMESTIC × VAT10` setup-ийг устгасан (эсвэл `blocked = true`); **Хэрэв** тэр хослолтой борлуулалтын ноорог хадгалж, дараа нь `:post`; **Тэгвэл** хадгалалт 200 + `warnings[0].code = tax.vat_posting_setup_missing` (W-TAX-12); post → 422 `tax.vat_posting_setup_missing` (`blocked` үед `tax.vat_posting_setup_blocked`), `errors[].pointer = /lines/0/...`; G/L, VAT entry үүсэхгүй.
- **AT-TAX-002** (BR-TAX-02) · I. **Өгөгдсөн нь** posting-ийн A үед setup уншигдсан; **Хэрэв** B үеэс өмнө өөр session setup-ийн `vat_calculation_type`/данс өөрчилнө (тест hook); **Тэгвэл** 409 `gl.setup_changed`, юу ч бичигдэхгүй; дахин илгээхэд шинэ тохиргоогоор амжилттай.
- **AT-TAX-003** (BR-TAX-03) · E. **Өгөгдсөн нь** `DOMESTIC × VAT10`-оор VAT entry бий; **Хэрэв** `PATCH /vat-posting-setups/{id}` `vatCalculationType = REVERSE_CHARGE`; **Тэгвэл** 409 `tax.vat_calc_type_locked`; `vatPercent`-ийг өөрчлөх → 200, өмнөх entry-ийн `vat_percent` өөрчлөгдөхгүй; бүлгийг `DELETE` эсвэл `code`-ыг өөрчлөх → 409 `tax.vat_setup_in_use`; хаагдаагүй entry-тэй үед `purchaseVatAccountId`-ийг өөр дансаар → 409 `tax.vat_account_change_open_entries`, хаалтын дараа → 200.
- **AT-TAX-004** (BR-TAX-04) · E. **Өгөгдсөн нь** `DOMESTIC` бүлэгт identifier `VAT10` (10 %); **Хэрэв** шинэ Prod. бүлгийн мөрийг identifier `VAT10`, хувь 0 эсвэл төрөл `REVERSE_CHARGE`-ээр хадгална; **Тэгвэл** 422 `tax.vat_identifier_rate_conflict`.
- **AT-TAX-005** (BR-TAX-05) · E/I. (а) `sales_vat_account_id = NULL` мөрөөр 10 %-ийн борлуулалт → 422 `tax.sales_vat_account_missing`; (б) RC мөрийн 2305 хоосон → `tax.reverse_charge_account_missing`; (в) setup-ийн худалдан авалтын дансанд `LIABILITIES` ангиллын данс (2300) эсвэл `HEADING` данс → 422 `tax.vat_account_invalid`.
- **AT-TAX-006** (BR-TAX-06) · I. **Өгөгдсөн нь** seed setup; **Тэгвэл** `VAT0`/`EXEMPT` мөр бүр `ebarimt_tax_product_code` бөглөгдсөн (CHECK); ангилал `VAT10` + `taxType = VAT_FREE` INSERT → `23514`; `TBD` кодтой мөрөөр eBarimt-тэй компанийн борлуулалтын preview → `warnings[].code = tax.tax_product_code_placeholder` (W-TAX-11).
- **AT-TAX-007** (BR-TAX-07) · U/E. Борлуулалтын нэхэмжлэхэд `IMPORT × IMPORT_SERVICE` (RC) мөр → 422 `tax.vat_calc_type_not_allowed`; `SALE` журналд `CUSTOMS_VAT` → мөн; худалдан авалтын нэхэмжлэхэд гурван төрөл зөвшөөрөгдөнө.
- **AT-TAX-009** (BR-TAX-09) · U. **Өгөгдсөн нь** нийлүүлэгч `IMPORT`, мөр `GL_ACCOUNT` 7230, Prod. `VAT10`; **Хэрэв** preview; **Тэгвэл** `warnings[].code = tax.import_service_without_reverse_charge` (W-TAX-07), батлалт амжилттай, VAT entry ангилал `NOVAT` (setup мөр 10).

#### Хуулийн параметр (BR-TAX-10…16)

- **AT-TAX-010** (BR-TAX-10) · A. `No_statutory_literals_in_tax_code`: `Erp.Tax*`, `Erp.Sales*`, `Erp.Purchases*` assembly-ийн IL-д `10m`, `0.10m`, `50000000`, `400000000`, `0.02m` (НХАТ), `0.01m` (хялбаршуулсан) literal хориотой (allow-list: `MoneyMath`-ийн нарийвчлал, тест). Literal нэмсэн PR → CI улаан.
- **AT-TAX-011** (BR-TAX-11) · U/E. **Өгөгдсөн нь** `vat.registration_threshold_mandatory` мөр 1 (… – 2027-06-30, 50 000 000), мөр 2 (2027-07-01 – ∞, 400 000 000); **Тэгвэл** `GetParameter(…, 2027-06-30)` = 50 000 000, `2027-07-01` = 400 000 000; эхний мөрийн `effective_from`-оос өмнөх огноо → `tax.parameter_not_effective`; `GET /tax-parameters/{code}?date=1990-01-01` → 404 `tax.parameter_not_effective`. `superseded` мөр хэзээ ч буцахгүй.
- **AT-TAX-012** (BR-TAX-12) · U/I. **Өгөгдсөн нь** `vat.simplified.deemed_purchase_share` нь `unverified` (seed-ийн бодит төлөв); **Хэрэв** хялбаршуулсан тайлан (`Report`) ба хаалт (`Posting`); **Тэгвэл** тайлан 200 + `isVerified = false` + W-TAX-08 (`tax.parameter_unverified_used`); хаалт 422 `tax.parameter_unverified`, юу ч бичигдэхгүй.
- **AT-TAX-013** (BR-TAX-13) · U. `asOf`-ийн сонголт: худалдан авалтын мөр `posting_date` 2027-04-03, `vat_date` 2027-03-28 → хувь 03-28-аар; ААНОАТ 2027 Q3 → `asOf = 2027-01-01`; хялбаршуулсан Q3 → `2027-07-01`. Mock provider дуудлагын `asOf`-ийг шалгана.
- **AT-TAX-014** (BR-TAX-14) · I. **Өгөгдсөн нь** setup `vat_rate_param_code = 'vat.standard_rate'` (0.10); **Хэрэв** нэхэмжлэх батлах; **Тэгвэл** мөрийн `vat_percent = 10.00000`, VAT entry `vat_percent = 10`, (CR-TAX-01-ийн дараа) `tax_parameter_id` = тэр мөрийн id.
- **AT-TAX-015** (BR-TAX-15) · I. **Өгөгдсөн нь** ноорог 2027-06-30-нд хадгалсан (тест migration-аар 2027-07-01-нээс хувь 12 % гэж тавьсан тусгай параметр — зөвхөн энэ тестийн DB-д); **Хэрэв** `posting_date`/`vat_date`-ийг 2027-07-01 болгож батлах; **Тэгвэл** НӨАТ 12 %-иар дахин тооцогдоно; цуцлалтын кредит нот (06 BR-SAL-74) эх 10 %-ийг хадгална.
- **AT-TAX-016** (BR-TAX-16) · I. `app_user`-ээр `INSERT/UPDATE tax.tax_parameter` → `42501`; owner-оор давхцах хугацаатай мөр → `23P01`.

#### Баримтын тооцоолол (BR-TAX-17…26)

- **AT-TAX-017** (BR-TAX-17) · A/I. Architecture: `Erp.Sales`, `Erp.Purchases`, `Erp.GeneralLedger` нь `vat_amount`-ийг өөрөө тооцох арифметик (`* r / 100`) агуулахгүй (Roslyn analyzer `ERP-TAX-001`); integration: ижил ноорогт preview, post, PDF, eBarimt payload-ийн НӨАТ ижил. §8-ын код бүр `Errors.mn.resx`, `.en.resx`-д байна.
- **AT-TAX-018** (BR-TAX-18) · U. Мөр −100.03 ба +1 000.05 (VAT10) → VAT⁻ −10.00, VAT⁺ 100.00, нийт 90.00 (§6.4); бүлгийн дараалал: сөрөг эхэлж; `RC10` ба `VAT10` тусдаа бүлэг.
- **AT-TAX-019** (BR-TAX-19) · U. Үнэ НӨАТ-тэй 33 000.00 + 13 993.00 → НӨАТ 4 272.09, суурь 42 720.91 (§6.3); НХАТ-тай PIV 14 440.00 → НӨАТ 1 289.29, НХАТ 257.86, суурь 12 892.85 (E-TAX-10).
- **AT-TAX-020** (BR-TAX-20) · U/P. E-TAX-01: бүлэг VAT10 (5100 + 5110) — мөрийн НӨАТ-ын нийлбэр = 2 166.67; property: санамсаргүй 1…200 мөр, үнэ 0.01…10⁹ → `Σ VAT_i = VAT_g`, `|VAT_i − exact_i| < 1` (UT-TAX-01, PBT-02).
- **AT-TAX-021** (BR-TAX-21) · U. `vat_rounding_type`: `NEAREST` 100.005 → 100.01, `UP` 100.001 → 100.01, `DOWN` 100.009 → 100.00, сөрөг −100.005 (`NEAREST`) → −100.01 (абсолют утгаар).
- **AT-TAX-022** (BR-TAX-22) · U. Тоо 0 эсвэл 100 % хөнгөлөлттэй мөр бүлэгт орохгүй, бусад мөрийн хуваарилалт өөрчлөгдөхгүй, тэр мөрийн НӨАТ 0.
- **AT-TAX-023** (BR-TAX-23) · U. RC мөр 3 500 000 → `AIV = 3 500 000`, мөрийн НӨАТ 0, `SA = 350 000`; үнэ НӨАТ-тэй горимд ч `SA = 350 000` (дүнг цэвэр гэж үзнэ).
- **AT-TAX-024** (BR-TAX-24) · U/E. `FULL_VAT` мөр 1 200 000 → `Amount = 0`, `VAT = AIV = 1 200 000`; мөрийн данс 7200 → 422 `tax.full_vat_account_mismatch`; `nonDeductibleReason` тавьсан → 422 `tax.full_vat_non_deductible_not_allowed`.
- **AT-TAX-025** (BR-TAX-25) · U. `PASSENGER_CAR` мөр 800 000 (VAT 80 000) → `VAT_nd = 80 000`, `Base_nd = 800 000`; `BASE-NONVAT` компанид бүх мөр `nd% = 100` (`NON_VAT_COMPANY`); борлуулалтад үргэлж 0.
- **AT-TAX-026** (BR-TAX-26) · E. `max_vat_difference_allowed = 1.00`, худалдан авалтын бүлгийн зөрүү +0.01 → 200, мөрийн `vat_difference` хуваарилагдсан; +1.01 → 422 `purchase.vat_difference_exceeds_max`; `allow_vat_difference = false` → 422 `purchase.vat_difference_not_allowed`; журналд мөн → `gl.vat_difference_*`.

#### VAT entry ба posting (BR-TAX-28…37)

- **AT-TAX-028** (BR-TAX-28) · I. E-TAX-01: 3 buffer мөр → VAT entry 3 (EXEMPT-д `amount = 0`), 2300-ийн G/L мөр 2 (EXEMPT-д мөргүй); RC → G/L-д 1300 Дт ба 2305 Кт хоёр мөр; FULL_VAT → тусдаа НӨАТ-ын мөргүй.
- **AT-TAX-029** (BR-TAX-29) · I. Борлуулалтын нэхэмжлэх/кредит нот, худалдан авалтын нэхэмжлэх/кредит нот тус бүрийн VAT entry-ийн `base`, `amount`, `non_deductible_*` тэмдэг хүснэгтийн дагуу; SETTLEMENT = −Σ бүлэг.
- **AT-TAX-030** (BR-TAX-30) · I. Батласны дараа setup-ийн хувь, ангиллыг өөрчлөхөд entry-ийн snapshot өөрчлөгдөхгүй; хувь хүн харилцагчийн борлуулалтын entry-ийн `party_tin` NULL (регистр бичигдэхгүй).
- **AT-TAX-031** (BR-TAX-31) · I. `gl_entry_vat_entry_link`-д (901, 301), (903, 302), (905, 303); `gl_entry.vat_amount` (901) = −1 666.67; хасагдахгүй хэсэгтэй худалдан авалтад суурь мөрийн `vat_amount` = хасагдах хэсэг.
- **AT-TAX-032** (BR-TAX-32) · I. `UPDATE tax.vat_entry SET amount = …` → `ERL01`; `fn_ledger_update('tax.vat_entry', n, '{"vat_date": …}')` → татгалзана (mutable биш); `deductible_confirmed` → зөвшөөрнө.
- **AT-TAX-033** (BR-TAX-33) · I. Хоёр зэрэгцээ posting → `entry_no` муж давхцахгүй, тасралтгүй; register-ийн `from/to_vat_entry_no` тохирно.
- **AT-TAX-034** (BR-TAX-34) · I/E. Хаагдаагүй entry-тэй журналыг `:reverse` → толин тусгал entry (эсрэг тэмдэг, ижил `vat_date`, `reversed_entry_no`); хаалтад орсон entry-тэй гүйлгээ → 409 `gl.reversal_vat_settled`.
- **AT-TAX-035** (BR-TAX-35) · I. 3 мөрт нэхэмжлэхийн 1 мөрийг хэсэгчлэн буцаах кредит нот → тухайн мөрөөс шинээр тооцсон НӨАТ (эх хуваарилалтаас ≤ 0.01 зөрж болно); цуцлалтын кредит нот → яг тэнцүү.
- **AT-TAX-036** (BR-TAX-36) · I. Баталгаажсан нэхэмжлэхийг засах кредит нот → `deductible_confirmed = true`, `supplier_ebarimt_id` = нэхэмжлэхийнх; баталгаажаагүй нэхэмжлэхийн кредит нот → `false`, нэхэмжлэхийг баталгаажуулахад хамт `true`.
- **AT-TAX-037** (BR-TAX-37) · I. Борлуулалтын баримт бүрд `−Σ amount` = толгойн `vat_amount` = eBarimt payload `totalVAT` (GS-VAT-001, GS-VAT-003-ийн баримтаар).

#### НӨАТ-ын огноо ба үе (BR-TAX-39…44)

- **AT-TAX-039** (BR-TAX-39) · E. Худалдан авалт `posting_date` 2027-04-03, `vat_date` 2027-03-28 → 200; `vat_date` 2027-04-05 → 422 `tax.vat_date_after_posting_date`; борлуулалтын нэхэмжлэхэд `vatDate ≠ postingDate` → 06 BR-SAL-34-ээр татгалзана.
- **AT-TAX-040** (BR-TAX-40) · I. 3-р сарын үе `CLOSED` үед `vat_date` 03-28-тай худалдан авалт → 409 `tax.vat_period_closed` (DB түвшинд шууд INSERT → `ERV01`); 2029 оны үе үүсээгүй → 422 `tax.vat_period_missing`; `BASE-NONVAT` компани үегүй → алдаагүй; SETTLEMENT entry хаагдсан үед бичигдэнэ.
- **AT-TAX-041** (BR-TAX-41, R2) · E. `allow_vat_date_from = 2027-05-01` хэрэглэгч `vat_date` 2027-04-28 → 422 `tax.vat_date_outside_user_window`.
- **AT-TAX-042** (BR-TAX-42) · I. `fn_mn_ensure_vat_return_periods(2027)` → 12 үе, `due_date` = дараа сарын 10; дахин дуудах → 0 мөр нэмэгдэнэ; entry-тэй үеийн огноог өөрчлөх → 409.
- **AT-TAX-043** (BR-TAX-43) · I/E. `PATCH /vat-return-periods/{id}` `status` → 400 `api.read_only_field`; DB-д `SUBMITTED → OPEN` UPDATE → `ERP02`.
- **AT-TAX-044** (BR-TAX-44) · E. 4-р сар `OPEN` байхад 5-р сарыг `:close` → 409 `tax.vat_period_previous_open`; 5, 6-р сар `CLOSED` үед 5-р сарыг `:reopen` → 409 `tax.vat_period_reopen_not_latest`.

#### Орцын НӨАТ (BR-TAX-45…53)

- **AT-TAX-045** (BR-TAX-45) · I. Баталгаажаагүй NORMAL entry ТТ-03а-гийн мөр 7/8-д орохгүй; `deductible_confirmed = true`, `supplier_ebarimt_id = NULL` UPDATE → CHECK `23514`.
- **AT-TAX-046** (BR-TAX-46) · I. (а) ДДТД + `confirmInputVat = true` + эрхтэй → entry `true`; (б) эрхгүй → `false` + анхааруулга `purchase.confirm_input_vat_not_permitted` (07); (в) RC → `true`; (г) FULL_VAT мэдүүлгийн дугаар ба огноотой → `true`; аль нэг нь хоосон → 422 `tax.customs_declaration_required` (батлагдахгүй); (д) `amount = 0` → `false`.
- **AT-TAX-047** (BR-TAX-47) · E. ДДТД 32 орон → 422 `ebarimt.purchase_receipt_ddtd_invalid`; ижил ДДТД өөр нэхэмжлэхэд → 409 `ebarimt.purchase_receipt_duplicate`.
- **AT-TAX-048** (BR-TAX-48) · E. `require_supplier_ebarimt = true`, ДДТД-гүй, `missingEbarimt` байхгүй → 422 `purchase.supplier_ebarimt_required`; `NON_DEDUCTIBLE` → бүх мөр `NO_EBARIMT`, НӨАТ зардалд, 1300-д мөргүй; `PENDING` → `deductible_confirmed = false`.
- **AT-TAX-049** (BR-TAX-49) · I/E. Баталгаажуулалт: entry `true`, `_at`, `_by`; давтах → no-op (200, хоосон жагсаалт); өөр ДДТД-тэй → 409 `tax.supplier_receipt_id_mismatch`; `vat_date`-ийн үе `CLOSED` → 200 + W-TAX-10, `vat_return_period_id` NULL хэвээр (GS-VAT-015).
- **AT-TAX-050** (BR-TAX-50) · E. `GET /input-vat/unconfirmed` нь зөвхөн BR-TAX-50-ийн entry-г (хаагдсан, буцаагдсан, оноогдсоныг биш) буцаана; Σ = CUE-14-ийн дүн.
- **AT-TAX-051** (BR-TAX-51) · I. E-TAX-08: ваучер Дт 7213 50 000 / Кт 1300 50 000, эсрэг entry `base −500 000`, `amount −50 000`, `nd +500 000/+50 000`, хос `closed = true`; баталгаажсан entry-д → 409 `tax.deduction_reject_not_allowed`; preview → ижил бичилт, ROLLBACK.
- **AT-TAX-052** (BR-TAX-52) · E. Хасагдахгүй хувь > 0, шалтгаангүй → 422 `tax.non_deductible_reason_required`; хэрэглэгч `NON_VAT_COMPANY` сонгох → 422 `tax.non_deductible_reason_invalid` (07-ийн мөрийн шалгалт `purchase.non_deductible_reason_invalid`-тэй давхцахгүй: 0 %-ийн мөр 07, системийн шалтгаан Tax).
- **AT-TAX-053** (BR-TAX-53) · I. E-TAX-02: `PASSENGER_CAR` мөрийн суурь G/L = цэвэр + НӨАТ, 1300-д тэр мөрийн хэсэг бичигдэхгүй.

#### НӨАТ төлөгч бус (BR-TAX-54…58)

- **AT-TAX-054** (BR-TAX-54) · U. `vat_registered = true`, `vat_registered_from = 2027-04-01` → `IsVatRegistered(2027-03-31) = false`, `(2027-04-01) = true`.
- **AT-TAX-055** (BR-TAX-55) · I/E. `BASE-NONVAT`: VAT10 бараатай борлуулалт → НӨАТ 0, ангилал `NOVAT`, `taxType = NOT_VAT` (эсвэл `ebarimt_setup.non_vat_payer_tax_type`), entry суурь ≠ 0; худалдан авалтын НӨАТ бүхэлдээ зардалд; `POST /vat-return-periods/{id}:close` → 409 `tax.company_not_vat_registered` (E-TAX-05).
- **AT-TAX-056** (BR-TAX-56, -58) · E. `vat_registered = true`, огноогүй → 422 `tax.vat_registered_from_required`; огноотой → тухайн оны үе үүснэ, өмнөх entry өөрчлөгдөхгүй; 5-р сар `CLOSED` болсны дараа `vat_registered_from`-ийг 2027-03-01 → 2027-06-01 болгох → 409 `tax.vat_registered_from_locked`.
- **AT-TAX-058** (BR-TAX-58) · E. НӨАТ төлөгч компани, 6-р сарын үе `OPEN` ба SALE entry-тэй; **Хэрэв** `vat_registered = false`; **Тэгвэл** 409 `tax.vat_deregistration_periods_open` (`periods = [2027-06]`); 6-р сарыг хаасны дараа → 200, дараагийн борлуулалт BR-TAX-55-аар (`NOVAT`, НӨАТ 0), 7-р сарын entry-гүй үеийг устгах → 204.
- **AT-TAX-057** (BR-TAX-57) · I. `vat_registered_from = 2027-04-15`: 4-р сарын ТТ-03а-д зөвхөн 04-15-аас хойших entry; 3-р сарыг хаах шаардлагагүй (4-р сарын `:close` 409 гаргахгүй); W-TAX-09.

#### Урвуу тооцоо ба импорт (BR-TAX-59…63)

- **AT-TAX-059** (BR-TAX-59) · I. E-TAX-03: Дт 7230 3 500 000, Дт 1300 350 000, Кт 2305 350 000, Кт 2101 3 500 000; VAT entry `REVERSE_CHARGE` 3 500 000 / 350 000.
- **AT-TAX-060** (BR-TAX-60) · I. RC entry `deductible_confirmed = true`; 50 % хасагдахгүй RC (`PERSONAL_USE`) → хаалтад Кт 1300 175 000, Дт 2305 350 000, 2310-д +175 000.
- **AT-TAX-061** (BR-TAX-61) · I. Гадаад нийлүүлэгчийн барааны нэхэмжлэх (`IMPORT × VAT10`) → entry ангилал `NOVAT`, 0 %, 1300-д мөргүй.
- **AT-TAX-062** (BR-TAX-62) · E. Гаалийн нийлүүлэгчийн нэхэмжлэх `CUSTOMS_VAT` 1 200 000, мэдүүлгийн дугааргүй (эсвэл `document_date`-гүй) батлах → 422 `tax.customs_declaration_required`, юу ч бичигдэхгүй; дугаар ба огноотой → entry `true`, ТТ-03а мөр 9; журналын хувилбар ижил.
- **AT-TAX-063** (BR-TAX-63) · I. Гаалийн татвар 300 000 `NOVAT` мөрөөр 1400-д → VAT entry `NOVAT` суурь 300 000 / 0, ТТ-03а мөр 7/8/9-д орохгүй.

#### ТТ-03а (BR-TAX-65…71)

- **AT-TAX-065** (BR-TAX-65) · E. `ROW_TOTALING` мөрөнд `OPPOSITE_SIGN` → 422 `tax.vat_statement_line_invalid`; 14 → 15 → 14 давталт → 422 `tax.vat_statement_row_cycle`; гүн 7 → мөн.
- **AT-TAX-066** (BR-TAX-66) · I. E-TAX-06: `OPEN` үеийн scope-д өмнөх сарын хаагдаагүй, баталгаажсан entry орно; хаалтын дараа scope = `vat_return_period_id = P`; SETTLEMENT entry хэзээ ч орохгүй.
- **AT-TAX-067** (BR-TAX-67) · U. PURCHASE entry: баталгаажаагүй, `amount ≠ 0` → эрхгүй; `amount = 0` → эрхтэй; татгалзлын хос (`closed`) → эрхтэй; `reversed` хос → эрхтэй.
- **AT-TAX-068** (BR-TAX-68) · I. `ACCOUNT_TOTALING` мөр (данс `2310`) нь `vat_date ∈ P` G/L-ийн нийлбэр; scope-оос үл хамаарна.
- **AT-TAX-069** (BR-TAX-69) · E. `GET /reports/vat-return` хоёр удаа → DB-д мөр нэмэгдэхгүй; хариунд `lastVatEntryNo`; шинэ entry нэмээд хуучин `expectedLastVatEntryNo`-оор `:close` → 409 `tax.vat_statement_stale`; entry нэмэлгүй зөвхөн нэг худалдан авалтыг баталгаажуулаад хуучин `expectedScopeVersion`-оор `:close` → 409 `tax.vat_statement_stale` (`lastVatEntryNo` ижил хэвээр).
- **AT-TAX-070** (BR-TAX-70) · E. ТТ-03а-5-ын А хэсгийн НӨАТ-ын нийлбэр = мөр 8, Б = мөр 9, В = мөр 10/13; ТТ-03а-6-ын нийлбэр = мөр 1…6; `:export` → 202, job `SUCCEEDED`, XLSX 3 хуудас.
- **AT-TAX-071** (BR-TAX-71) · I. 3 нэхэмжлэх: `SUCCESS` (тэнцүү), eBarimt-гүй, `SUCCESS` (НӨАТ 0.01 зөрүү) → тулгалт 2 issue (`NO_RECEIPT`, `VAT_MISMATCH`); `:preview-close` → W-TAX-06, хаалт зогсохгүй.

#### Хаалт, илгээх, дахин нээх (BR-TAX-72…82)

- **AT-TAX-072** (BR-TAX-72) · E. Нэг хүсэлтэд олон зөрчил (эрх ✓, сар дуусаагүй, данс хоосон) → 422 `api.validation_failed`, `errors[]` = [`tax.vat_period_not_ended`, `tax.vat_settlement_account_missing`]; `postingDate` 2027-05-30 (5-р сар) → `tax.vat_settlement_date_invalid`; нягтлан бодох 5-р сар `CLOSED` → `gl.period_closed`.
- **AT-TAX-073** (BR-TAX-73) · I. E-TAX-06: SETTLEMENT entry 412–415 (бүлэг тус бүр), эх entry `closed = true`, `closed_by_entry_no`; 0-дүнтэй бүлэг (VAT0, EXEMPT) зөвхөн оноогдоно; 410 (баталгаажаагүй) хаагдахгүй, оноогдохгүй; G/L тэнцсэн (Σ Дт = Σ Кт = 1 350 000), 2310 Кт 500 000 = ТТ-03а мөр 14.
- **AT-TAX-074** (BR-TAX-74) · U. Ижил өгөгдөлд `SettlementPlanner` хоёр удаа → ижил дараалал ба мөрийн түлхүүр; PURCHASE мөр SALE-ээс өмнө.
- **AT-TAX-075** (BR-TAX-75) · I. Ваучерын source `VATSTMT`, дугаар `GJ-…`, тайлбар "НӨАТ-ын хаалт 2027-05"; бүх entry `amount = 0` үе → ваучергүй, `settlement_transaction_no` NULL, үе `CLOSED`; `:preview-close` → ижил хариу, DB өөрчлөгдөхгүй.
- **AT-TAX-076** (BR-TAX-76) · E. `settlementAccountId` = 1300 → 422 `tax.vat_settlement_account_invalid`; `HEADING` данс → мөн; `tax_setup`-гүй, хүсэлтэд дансгүй → `tax.vat_settlement_account_missing`.
- **AT-TAX-077** (BR-TAX-77) · E. `POST /gl-transactions/{no}:reverse` (VATSTMT) → 409 `gl.reversal_not_reversible`.
- **AT-TAX-078** (BR-TAX-78) · E. `OPEN` үеийг `:submit` → 409 `tax.vat_period_not_closed`; лавлах дугааргүй → 422 `tax.submission_reference_required`; амжилттай → `SUBMITTED`, `effects[]`-д `SUGGEST_GL_PERIOD_LOCK` (GL үе `CLOSED` үед); давтах (өөр `Idempotency-Key`) → 409 `tax.vat_period_already_submitted`; MFA-гүй → 403 `platform.mfa_required`.
- **AT-TAX-079** (BR-TAX-79) · I/E. E-TAX-09: `:reopen` → ваучерын толин тусгал, SETTLEMENT entry-ийн толин тусгал, эх entry `closed = false`, `vat_return_period_id = NULL`, үе `OPEN`, outbox `tax.vat_period.reopened`; шалтгаан 5 тэмдэгт → 422 `tax.reopen_reason_required`; Accountant → 403 `platform.permission_denied`; `SUBMITTED` → 409 `tax.vat_period_submitted`.
- **AT-TAX-080** (BR-TAX-80) · E. `SUBMITTED` 5-р сарын `vat_date`-тэй кредит нот → 409 `tax.vat_period_closed`; 6-р сарын огноотой → 200, 6-р сарын ТТ-03а-д.
- **AT-TAX-082** (BR-TAX-82) · I. Санамсаргүй 200 баримт (P: борлуулалт, худалдан авалт, RC, FULL_VAT, татгалзал, хаалт, дахин нээх) → шөнийн шалгалтын гурван тэгшитгэл үнэн; 1300-д шууд журнал → `gl.direct_posting_not_allowed` (05).

#### Босго (BR-TAX-83…88)

- **AT-TAX-083** (BR-TAX-83) · I. Эргэлтэд VAT10 + VAT0 орно, EXEMPT/NOVAT, ҮХ-ийн борлуулалт (`gen_prod = FA`) орохгүй; кредит нот хасагдана; цонх `(d − 12 сар, d]` хил (яг 12 сарын өмнөх өдөр орохгүй).
- **AT-TAX-084** (BR-TAX-84) · U. `T/M` = 79.99 % → `NONE`/`VOLUNTARY_ELIGIBLE`; 80.00 % → `APPROACHING`; 100 % → `CROSSED`; НӨАТ төлөгчид `T < M` → `BELOW_MANDATORY`.
- **AT-TAX-085** (BR-TAX-85) · U. §6.13-ын хүснэгт бүхэлдээ (`crossedOn = 2027-06-20`, 07-01-нд тайлбар).
- **AT-TAX-086** (BR-TAX-86) · I. Job хоёр удаа ижил түвшинд → outbox 1 мөр; түвшин өөрчлөгдөхөд 1 шинэ мөр (`idempotency_key` давхцахгүй).
- **AT-TAX-087** (BR-TAX-87, -88) · E. Сүүлийн түвшин `CROSSED` компанийн борлуулалтын preview → `warnings[].code = tax.vat_threshold_crossed`; `company_setup.vat_registered` өөрчлөгдөөгүй хэвээр.

#### НХАТ (BR-TAX-27, -89…96, R2)

- **AT-TAX-089** (BR-TAX-27, -89) · E. R1 (feature flag off) эсвэл `city_tax_payer = false` → мөрийн `cityTaxCodeId` → 422 `tax.city_tax_not_enabled`; худалдан авалтад нийлүүлэгчийн НХАТ зөвшөөрөгдөнө.
- **AT-TAX-090** (BR-TAX-90) · E. Кодын `effective_to = 2027-06-30`, `vat_date` 2027-07-01 → 422 `tax.city_tax_code_not_effective`; `ITEM` мөрөнд барааны анхдагч код тавигдана.
- **AT-TAX-091** (BR-TAX-91) · E. `rate_percent = 3` (`city_tax.rate_max_ub` 2 %) → 422 `tax.city_tax_rate_exceeds_max`.
- **AT-TAX-092** (BR-TAX-92) · U. Цэвэр 5 000 → НӨАТ 500, НХАТ 100, нийт 5 600 (GS-VAT-012).
- **AT-TAX-093** (BR-TAX-93) · U/P. Олон мөрийн НХАТ-ын хуваарилалт `Σ CT_i = CT_g`; сөрөг мөрийн carry.
- **AT-TAX-094** (BR-TAX-94) · I. Борлуулалт: Кт 2320, `city_tax_entry` SALE −base/−CT, авлага = AIV + CT; худалдан авалт: Дт 7250, entry PURCHASE; writer order 15.
- **AT-TAX-095** (BR-TAX-95) · I. `:close` → `VATSTMT` ба `CITYTAXSTMT` хоёр ваучер нэг transaction-д; НХАТ-ын ваучер Дт 2320 / Кт 2325; PURCHASE entry хаагдахгүй; `CITYTAXSTMT` алдаатай бол НӨАТ-ын хаалт ч rollback.
- **AT-TAX-096** (BR-TAX-96) · I. eBarimt payload `totalCityTax` = мөрийн НХАТ-ын нийлбэр; НХАТ төлөгч бус мерчант → 12-ын `ebarimt.city_tax_not_registered`.

#### Хялбаршуулсан НӨАТ (BR-TAX-97…102, R2 · Could)

- **AT-TAX-097** (BR-TAX-97) · E. Эргэлт ≥ `vat.simplified.turnover_threshold` → 422 `tax.simplified_vat_not_eligible`; хасагдсан салбар → мөн.
- **AT-TAX-098** (BR-TAX-98) · I. Хялбаршуулсан компанид улирлын үе, `due_date = NULL`, календарьт "тодорхойгүй" ⚠.
- **AT-TAX-099** (BR-TAX-99) · I. Худалдан авалтын НӨАТ `SIMPLIFIED_REGIME` шалтгаанаар өртөгт; борлуулалтын НӨАТ 10 %.
- **AT-TAX-100** (BR-TAX-100, -101) · I. E-TAX-11: `O = 3 000 000`, `Payable = 300 000` (2310 Кт), `D = 2 700 000` (8200 Кт); unverified параметртэй → 422 `tax.parameter_unverified`, тайлан W-TAX-08-тэй.
- **AT-TAX-102** (BR-TAX-102) · E. Профайлын `valid_from = 2027-08-15` → 422 `tax.regime_change_not_at_period_start`.

#### ААНОАТ туслах (BR-TAX-103…108, R2)

- **AT-TAX-103** (BR-TAX-103) · E. `GET /reports/cit-helper` → G/L өөрчлөгдөхгүй; `:create-accrual-draft` → `GENERAL` журналд ноорог мөр (батлагдаагүй).
- **AT-TAX-104** (BR-TAX-104) · E. `period = Q2` → 422 `tax.cit_period_invalid`; `H1` → 01-01..06-30.
- **AT-TAX-105** (BR-TAX-105) · I. `is_closing = true` мөр, `DISCONTINUED`, `INCOME_TAX` ангиллын данс тооцоонд орохгүй.
- **AT-TAX-106** (BR-TAX-106) · U. 8430-ийн дебит 120 000 → `Adj = +120 000`; гараар оруулсан тохируулга хадгалагдахгүй.
- **AT-TAX-107** (BR-TAX-107) · U. E-TAX-12: STANDARD + CREDIT_90 — Q1 185 000, H1 400 000; CREDIT_90, ONE_PERCENT эрхгүй үед тайлбартай.
- **AT-TAX-108** (BR-TAX-108) · U. Улирлын төлөх = хуримтлагдсан ялгавар (Q2 215 000); хугацаа 2027-04-20, 2027-07-20.

#### Календарь (BR-TAX-109, -110)

- **AT-TAX-109** (BR-TAX-109) · E. 2020-оос НӨАТ төлөгч компани, `GET /tax/calendar?from=2027-01-01&to=2027-03-31` → хугацаа нь мужид орсон мөр л: НӨАТ 3 (01-10 — 2026-12, 02-10 — 2027-01, 03-10 — 2027-02; 3-р сарын 04-10 орохгүй), ААНОАТ 2026 Q4 тайлан 01-20, 2026 Q4 төлбөр 01-31 (`cit.quarterly_payment_due` 2027-01-01-нээс, `verified = false`), урьдчилгаа 01-25, 02-25, 03-25 (`verified = false`), 2026 оны жилийн тайлан 03-05 (`cit.annual_return_due` @ 2027-01-01, `verified = false`); амралтын өдөр шилжихгүй.
- **AT-TAX-110** (BR-TAX-110) · E. `SUBMITTED` үе → `status = DONE`; бусад → үлдсэн хоног; `BASE-NONVAT` → НӨАТ-ын мөргүй.

### 11.2 Golden scenario (GS-VAT)

GS-VAT-001…012 нь [16 §12.4](./16-test-strategy.md)-ийн каталогийнх (алхам, дүн тэнд). Энэ баримтын E-TAX жишээ нь тухайн scenario-ийн **нэмэлт case** (`cases[]`) болно; 16-ийн хүлээгдэх үр дүн энэ баримтын дүрэмтэй зөрвөл энэ баримт давуу (16 Z8). GS-VAT-013…022 нь энэ баримтаас шинээр (16-д нэмэх санал).

| ID | Нэр | Хувилбар | Эх (энэ баримт) | Гол шалгалт |
|---|---|---|---|---|
| GS-VAT-001 | Баримтын түвшний НӨАТ, running remainder | R1 | E-TAX-01 | Мөрийн НӨАТ-ын нийлбэр = бүлгийн НӨАТ = eBarimt `totalVAT` |
| GS-VAT-002 | Үнэ НӨАТ-тэй, бэлэн борлуулалт | R1 | §6.3 жишээ B | 46 993.00 → НӨАТ 4 272.09 |
| GS-VAT-003 | Холимог ангилал VAT10/VAT0/EXEMPT | R1 | E-TAX-01 (EXEMPT мөр) | 0 %-д G/L мөргүй, entry суурьтай |
| GS-VAT-004 | Орцын НӨАТ ба ДДТД баталгаажуулалт | R1 | E-TAX-02 (entry 404) | Баталгаажуулалт ledger бичихгүй, ТТ-03а мөр 8 |
| GS-VAT-005 | Хасагдахгүй орцын НӨАТ | R1 | E-TAX-02 (entry 405, `PASSENGER_CAR`) | 1300-д мөргүй, мөр 11 |
| GS-VAT-006 | НӨАТ төлөгч бус компани | R1 | E-TAX-05 | NOVAT/`NOT_VAT`, `:close` → `tax.company_not_vat_registered` |
| GS-VAT-007 | ТТ-03а, НӨАТ-ын хаалт, илгээх | R1 | E-TAX-06 | Мөр 14 = 2310-ын Кт; SETTLEMENT entry; `SUBMITTED` түгжээ |
| GS-VAT-008 | Хоцорсон худалдан авалтын НӨАТ-ын огноо | R1 | BR-TAX-39, -40 | `vat_date` < `posting_date`; хаагдсан үе → `tax.vat_period_closed` |
| GS-VAT-009 | НӨАТ-ын босгын хяналт (2027) | R1 | §6.13 | 50 сая → 400 сая (2027-07-01), `crossedOn` |
| GS-VAT-010 | Урвуу тооцоо | R2 | E-TAX-03 | G/L-д НӨАТ цэвэр 0; хаалтад 1300/2305 |
| GS-VAT-011 | Гаалийн НӨАТ (`FULL_VAT`) | R2 | E-TAX-04 | Суурь 0; мөр 9; 2365 |
| GS-VAT-012 | НХАТ (үнэ НӨАТ-гүй) | R2 | §6.10 | 5 000 + 500 + 100 |
| GS-VAT-013 | Сөрөг мөр ба carry | R1 | §6.4 | −100.03 / +1 000.05 → 90.00 |
| GS-VAT-014 | НӨАТ төлөх | R1 | E-TAX-07 | Дт 2310 / Кт банк, VAT entry-гүй |
| GS-VAT-015 | Хоцорсон баталгаажуулалт | R1 | E-TAX-06 "хоцорч баталгаажуулах" | 5-р сарын entry 6-р сарын хаалтад; W-TAX-10 |
| GS-VAT-016 | Хасалтаас татгалзах (зардалд шилжүүлэх) | R1 · Should | E-TAX-08 | `VATADJ`, хос `closed`, мөр 11 |
| GS-VAT-017 | Хаалтыг дахин нээх | R1 | E-TAX-09 | Толин тусгал, `vat_return_period_id` NULL, дахин хаахад ижил дүн |
| GS-VAT-018 | Параметрийн хил | R1 | §5.2, AT-TAX-011 | 2027-06-30 / 07-01; хувь ба босго огноогоор |
| GS-VAT-019 | НХАТ үнэ НӨАТ-тэй (B2C ресторан) | R2 | E-TAX-10 | 14 440.00 → 1 289.29 / 257.86 / 12 892.85 |
| GS-VAT-020 | НХАТ-ын хаалт | R2 | E-TAX-10 | `CITYTAXSTMT`, 2320 → 2325 |
| GS-VAT-021 | Хялбаршуулсан НӨАТ | R2 · Could | E-TAX-11 | 3 000 000 / 300 000 / 2 700 000 |
| GS-VAT-022 | ААНОАТ-ын туслах | R2 | E-TAX-12 | Q1 185 000, Q2 215 000 |

Урвуу тооцоо ба гаалийн НӨАТ-ын тооцоолол R1-д seed-ээр бэлэн тул GS-VAT-010/011-ийн unit түвшний хэсэг (AT-TAX-023, -024) R1-д ажиллана; golden нь R2-ийн чанарын хаалганд (16 QG-R2).

Бүх R1 scenario-д 16 §12-ын `variants: y2027` хамаарна (GS-VAT-009, -018-аас бусад — тэдгээр нь огноогоо өөрөө агуулна).

### 11.3 Property ба инвариант тест

| ID | Шинж | Генератор |
|---|---|---|
| PBT-TAX-01 | `ComputeDocument` детерминист: мөрийн дарааллыг ижил `line_no`-оор хадгалж дахин дуудахад ижил үр дүн | 1…200 мөр, 4 identifier, тэмдэг холимог |
| PBT-TAX-02 | Бүлэг бүр `Σ VAT_i = VAT_g`, `Σ CT_i = CT_g`, `Σ ND_i ≤ Σ VAT_i` | мөн |
| PBT-TAX-03 | Үнэ НӨАТ-тэй: `Σ (Base_i + VAT_i + CT_i) = G` (яг) | мөн, `c ∈ {0, 1, 2}` |
| PBT-TAX-04 | Posting бүрийн дараа BR-TAX-82-ын гурван тэгшитгэл | Санамсаргүй баримтын дараалал (posting, кредит нот, буцаалт, баталгаажуулалт, татгалзал, хаалт, дахин нээх) |
| PBT-TAX-05 | Хаалт → дахин нээх → хаах = анхны хаалттай ижил дүн (entry дугаараас бусад) | мөн |
| PBT-TAX-06 | `T(d)` нь entry-ийн дарааллаас үл хамаарна; кредит нот + нэхэмжлэх (ижил дүн) → 0 нөлөө | SALE entry-ийн дараалал |

### 11.4 Edge case

| # | Тохиолдол | Хүлээгдэх |
|---|---|---|
| EC-01 | Баримтын бүх мөр `CLA = 0` | НӨАТ 0, VAT entry-гүй (buffer мөргүй) |
| EC-02 | Нэг мөр 0.01, хувь 10 % | НӨАТ 0.00 (`NEAREST`), `UP` горимд 0.01 |
| EC-03 | Маш том дүн 9 999 999 999 999.99 | `platform.amount = numeric(19,4)` (15 бүхэл орон) хүрээнд, overflow-гүй; C# `decimal`-д `W × r` завсрын үржвэр 28 оронд багтана |
| EC-04 | 12-р сарын 31-ний хаалт ба санхүүгийн жилийн хаалт | НӨАТ-ын хаалт `is_closing = false`; жилийн хаалтын өмнө ч, дараа ч (05) |
| EC-05 | `vat_registered_from` сарын дунд (2027-04-15) | 4-р сарын хаалт зөвхөн 04-15-аас; 3-р сар шаардлагагүй |
| EC-06 | 2-р сарын 29 (2028) ба 12 сарын цонх | `(2028-02-29 − 12 сар) = 2027-02-28` (`AddMonths`) |
| EC-07 | Баталгаажаагүй entry-тэй нэхэмжлэхийг хэсэгчлэн буцаах | Кредит нотын entry `false`; хоёуланг нь нэг ДДТД-ээр баталгаажуулна |
| EC-08 | Ижил үед хоёр хэрэглэгч зэрэг `:close` | Нэг нь 200, нөгөө нь 409 `tax.vat_period_not_open` (advisory lock + `FOR UPDATE`) |
| EC-09 | `:close` ба батлалт зэрэг | Батлалт хаалтын дараа → `tax.vat_period_closed`, эсвэл өмнө → хаалт `tax.vat_statement_stale` |
| EC-10 | FX баримт (USD) | НӨАТ төгрөгөөр (`_lcy`) тооцогдож entry-д MNT; ханшийн зөрүү VAT entry-д нөлөөлөхгүй (09/10) |
| EC-11 | Параметрийн мөр `superseded` болсон (migration) | Шинэ тооцоонд хэрэглэгдэхгүй; хуучин entry-ийн snapshot өөрчлөгдөхгүй |
| EC-12 | Татгалзсан entry-тэй нэхэмжлэхэд дараа нь ДДТД ирсэн | `purchase.input_vat_written_off` (07); засварыг шинэ журналаар (OQ-TAX-02) |
| EC-13 | ТТ-03а тооцсоны дараа, `:close`-оос өмнө худалдан авалтыг баталгаажуулсан (шинэ entry үүсээгүй) | `scopeVersion` өөрчлөгдсөн → `:close` 409 `tax.vat_statement_stale`; дахин тооцоолоход мөр 7/8 өснө (BR-TAX-69) |
| EC-14 | Нэг дансанд +100.05 ба −100.05 (VAT10) мөр, ижил identifier-ийн өөр дансны мөртэй; buffer-т цэвэрлэгдээд `Amount = 0`, хуваарилалтаас `VatAmount = ±0.01` үлдсэн | Суурь G/L мөр бичигдэхгүй, VAT entry VAT дансны мөртэй холбогдоно (§5.5 алхам 5); ваучер тэнцсэн |
| EC-15 | Баталгаажаагүй нэхэмжлэхийг бүрэн кредит нотолсон (ДДТД хэзээ ч ирэхгүй) | BR-TAX-50-ийн жагсаалтад хоёулаа (цэвэр 0); `input-vat:write-off` хоёуланг нь хос авч хаана, G/L-ийн цэвэр нөлөө 0 |
| EC-16 | R2: НӨАТ төлөгч бус, НХАТ төлөгч ресторан | `:close` нь зөвхөн `CITYTAXSTMT` (`V2`), ТТ-03а-гүй; `tax.company_not_vat_registered` гарахгүй (BR-TAX-72) |
| EC-17 | R2: `SUBMITTED` үеийн дараа ТТ-03а-гийн загварын мөрийг засварласан | Илгээсэн утга `:submit`-ийн snapshot-оос (CR-TAX-15); дахин тооцоолсон утга зөрвөл UI "илгээсэн хувилбараас зөрүүтэй" тэмдэглэнэ. R1-д загвар зөвхөн унших тул үүсэхгүй |
| EC-18 | Хаагдаагүй entry-тэй үед setup-ийн 1300 дансыг 1305 болгох оролдлого | 409 `tax.vat_account_change_open_entries`; хаалтын дараа зөвшөөрнө (BR-TAX-03) |

---

## 12. Schema change requests

> **Төлөв (2026-10-08):** эдгээр хүсэлтийн шийдвэр, эцсийн нэрийг [db/CHANGE_REQUESTS.md](db/CHANGE_REQUESTS.md)-ээс үзнэ. Хүссэнээс ялгаатай: CR-TAX-03: `tax.tax_setup` нь `id` PK + `UNIQUE (company_id)`. CR-TAX-05: `customs_declaration_id` нь `purchase_header`, `purch_inv_header`-т мөн. CR-TAX-07: `party.gen_prod_posting_group.exclude_from_vat_turnover`. CR-TAX-11: job код `tax.vat_threshold.check`.

Энэ баримт `db/` файлыг засахгүй; доорх хүсэлтийг схемийн эзэн ([db/README](./db/README.md), D-K1) шийднэ. Хүсэлт хэрэгжих хүртэлх түр шийдлийг "Түр" баганад.

| ID | Хүснэгт / өөрчлөлт | Шалтгаан | Түр | Ач холбогдол |
|---|---|---|---|---|
| CR-TAX-01 | `tax.vat_entry.tax_parameter_id uuid NULL` (FK `tax.tax_parameter(id)`), `tax.city_tax_entry.tax_parameter_id uuid NULL`; posted баримтын мөрт (`sales.sales_invoice_line`, `purchase.purch_inv_line`, cr memo LIKE) мөн. Mutable биш. | FR-TAX-003 AC1: аль параметрийн мөрөөр тооцсоныг аудитлах (BR-TAX-14); 16 SCR-T04-тэй ижил | `vat_percent` snapshot л | Өндөр |
| CR-TAX-02 | `tax.vat_entry.non_deductible_reason text NULL CHECK (non_deductible_reason IN ('NON_VAT_COMPANY','SIMPLIFIED_REGIME','REJECTED','PASSENGER_CAR','PERSONAL_USE','EXEMPT_RELATED','NO_EBARIMT'))` + `CHECK (non_deductible_reason IS NULL OR non_deductible_amount <> 0 OR non_deductible_base <> 0)`; `gl.journal_line.non_deductible_reason` (ижил CHECK). Худалдан авалтын мөр — 07 SCR-PUR-01. | BR-TAX-25, -51, -52; ТТ-03а мөр 11-ийн задаргаа; buffer түлхүүр (Z-TAX-15) | Шалтгааныг `audit`-д; тайланд задаргаагүй | Өндөр |
| CR-TAX-03 | Шинэ `tax.tax_setup` (PK `company_id`, RLS): `vat_settlement_account_id uuid` (→ `gl.gl_account`), `simplified_vat_gain_account_id uuid` (8200), `cit_expense_account_id uuid` (9100), `cit_payable_account_id uuid` (2330), `settlement_journal_template_id uuid` (анхдагч `GENERAL`), `row_version`. Seed `mn_40_setup.sql`: 2310 / 8200 / 9100 / 2330. | BR-TAX-75, -76, -100, -103; компани бүрийн хаалтын данс хүсэлтээр дамжих эрсдэл (pitfall 11) | `:close` хүсэлтийн `settlementAccountId` (UI анхдагч 2310) | Өндөр |
| CR-TAX-04 | Шинэ `tax.company_tax_profile` (`id`, `company_id`, `valid_from date NOT NULL`, `valid_to date`, `vat_status` (`STANDARD`, `SIMPLIFIED`, `NOT_REGISTERED`), `vat_return_frequency` (`MONTHLY`, `QUARTERLY`), `simplified_base` (`VAT_EXCLUSIVE`, `VAT_INCLUSIVE`), `cit_regime` (`STANDARD`, `CREDIT_90`, `ONE_PERCENT`, `SIMPLIFIED_ANNUAL`), `excluded_activity_code text`, `note`; `EXCLUDE USING gist (company_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&)`); `company_setup.vat_registered/_from` нь профайлаас trigger-ээр шинэчлэгдэх кэш. | ADR-0021 #2; BR-TAX-54, -58, -97, -102, -107; deregistration ба горимын түүх | `company_setup.vat_registered`, `vat_registered_from` (нэг шилжилт) | Дунд (R2-ийн өмнө заавал) |
| CR-TAX-05 | Шинэ `tax.customs_declaration` (`id`, `company_id`, `declaration_no text`, `declaration_date date`, `customs_office_code`, `vendor_id`, `customs_value numeric(19,4)`, `customs_duty`, `excise_tax`, `vat_base`, `vat_amount numeric(19,2)`, `currency_code`, `exchange_rate`); `tax.vat_entry.customs_declaration_id uuid NULL` (FK). 07 SCR-PUR-07 (`customs_declaration_no`, `customs_value` header-т)-тэй нэгтгэх. | BR-TAX-62; ТТ-03а-5 Б хэсгийн гаалийн үнэ; OQ-TAX-08 | `external_document_no`, `document_date` | Дунд |
| CR-TAX-06 | `tax.vat_return_period.city_tax_settlement_transaction_no bigint`; `tax.city_tax_entry.vat_return_period_id uuid NULL` (FK) ба `platform.ledger_guard`-ийн mutable жагсаалтад нэмэх. | BR-TAX-95; НХАТ-ын хаалтыг `:reopen`-оор буцаах | `CITYTAXSTMT` гүйлгээг `posting_log`-оор хайх | Дунд (R2) |
| CR-TAX-07 | `tax.vat_entry.excluded_from_turnover boolean NOT NULL DEFAULT false` (snapshot); `party.gen_prod_posting_group.exclude_from_vat_turnover boolean NOT NULL DEFAULT false` (seed `FA` = true). | BR-TAX-83: ҮХ-ийн борлуулалтыг босгоос хасах (CMP-016) | `Tax:Threshold:ExcludedGenProdGroupCodes` тохиргоо | Дунд |
| CR-TAX-08 | `platform.source_code` seed-д `('VATADJ', 'Орцын НӨАТ-ын залруулга', 'Input VAT adjustment')`; `audit.posting_log.posting_type` CHECK-д `INPUT_VAT_WRITE_OFF` (07 SCR-PUR-11). | BR-TAX-51; 05 §3.7-ын source code-оор буцаалтын бодлого | `PURCHASES` / `GENERAL_JOURNAL` | Дунд |
| CR-TAX-09 | Эрхийн объект (`mn_00_catalogs.sql`, `mn_60_security.sql`): `ACTION tax.vat.reopen` (`ERP_PERIOD_REOPEN`, Owner), `ACTION tax.vat_return.export` (`ERP_VAT`), `REPORT rpt.vat_threshold` (`ERP_VAT`, `ERP_FIN_REPORTS`), `REPORT rpt.cit_helper` (R2). `ERP_VAT`-ийн `TABLE tax.vat_entry` `Rm` → `Rim` (`:close` нь SETTLEMENT, `input-vat:write-off` нь VATADJ entry INSERT хийнэ); R2: `TABLE tax.city_tax_entry` `i` (`ERP_SALES_POST`, `ERP_PURCH_POST`, `ERP_VAT`), `Rm` (`ERP_VAT`). | BR-TAX-51, -73, -79, -95; §10.1 | `tax.vat.settle` + Owner шалгалт; `rpt.vat_return` | Дунд |
| CR-TAX-10 | `gl.gl_account.cit_treatment text NOT NULL DEFAULT 'NORMAL' CHECK (cit_treatment IN ('NORMAL','NON_DEDUCTIBLE','NON_TAXABLE'))`; seed 8430 = `NON_DEDUCTIBLE`. | BR-TAX-106 | Тохиргооны дансны жагсаалт | Бага (R2) |
| CR-TAX-11 | `integration.job_definition` seed: `tax.vat_threshold.check` (cron `0 6 * * *` Asia/Ulaanbaatar, `max_attempts 3`), `tax.vat_return.export` (`max_attempts 3`, timeout 120 s; 14 SCR-API-02-той нэг). | BR-TAX-86, -70 | — | Бага |
| CR-TAX-12 | `COMMENT ON COLUMN tax.vat_statement_line.vat_bus_posting_group / vat_prod_posting_group / vat_category IS '… NULL = any (seed contract)'`. | Z-TAX-10: BC-ийн "хоосон = зөвхөн хоосон"-оос ялгаатай гэрээг схемд баримтжуулах | Энэ баримт | Бага |
| CR-TAX-13 | `legal_parameters.sql`: `cit.simplified_return_rate` (0.01, `unverified`, эх mn-tax §3.3). | BR-TAX-107 (SIMPLIFIED_ANNUAL) кодонд literal бичихгүй (BR-TAX-10) | Горимыг "параметргүй" гэж харуулна | Бага (R2) |
| CR-TAX-14 | `tax.vat_entry` CHECK нэмэх: `vat_calculation_type <> 'FULL_VAT' OR base = 0`; `entry_type <> 'SALE' OR (non_deductible_base = 0 AND non_deductible_amount = 0)`; `entry_type <> 'SETTLEMENT' OR closed`; `entry_type <> 'PURCHASE' OR vat_calculation_type <> 'FULL_VAT' OR amount = 0 OR (deductible_confirmed AND external_document_no IS NOT NULL AND document_date IS NOT NULL)`. | BR-TAX-24, -25, -46, -62, -73 инвариантыг DB-д | Апп-ын шалгалт | Бага |
| CR-TAX-15 | Шинэ `tax.vat_return_snapshot` (`id`, `tenant_id`, `company_id`, `vat_return_period_id` FK, `statement_name_code`, `rows jsonb NOT NULL` (`line_no`, `row_no`, `value`, `printed`), `scope_version text`, `sha256 text`, `created_at`, `created_by`; `UNIQUE (company_id, vat_return_period_id)`; append-only — `platform.ledger_guard`-д mutable баганагүй). `:submit` бичнэ. | mn-tax R19 "илгээсэн тайлан бүрийн өөрчлөгдөхгүй бүртгэл"; R2-т загвар засварлах боломжтой болоход илгээсэн утга дахин тооцоогоор өөрчлөгдөх эрсдэл (EC-17) | `audit.security_event.details` (`VAT_PERIOD_SUBMITTED`) | Дунд (R2-ийн загвар засварлахаас өмнө заавал) |

05-д тусгах (схем биш, гэрээ): `PostingBufferKey`-д `NonDeductibleReason`, `CityTaxCodeId` нэмэх; `PostingBufferRow`-д `VatDifference`, `NonDeductibleBase` (Z-TAX-15).

---

## 13. Нээлттэй асуулт

| ID | Асуулт | Нөлөө | Одоогийн таамаг (энэ баримтад хэрэгжсэн) | Хариулах | Холбоо |
|---|---|---|---|---|---|
| OQ-TAX-01 | ТТ-03а-гийн мөрийн дугаар, байршил (мөр 1–14, ТТ-03а-5/6-ийн багана) 2027 оны маягтаар өөрчлөгдөх эсэх | Тайлангийн загвар, экспорт | Seed `TT03A` загвар (`mn_50_reports.sql`); өөрчлөлт нь загварын мөрөөр, кодоор биш (D-E8) | СМТТ, татварын зөвлөх | D-E8; BR-TAX-65 |
| OQ-TAX-02 | Орцын НӨАТ-ыг хэдэн сарын дотор хасуулах ёстой (хугацааны хязгаар) ба хоцорч баталгаажсан (өмнөх үеийн `vat_date`) НӨАТ-ыг аль үеийн тайланд оруулах | BR-TAX-49 (дараагийн нээлттэй үе), W-TAX-10, ТТ-03а-5-ын тэмдэглэгээ; татгалзсаны дараа ДДТД ирвэл | Хугацааны хязгааргүй; дараагийн хаагдах үед; татгалзсан баримтыг дахин хасахгүй (`purchase.input_vat_written_off`) | Татварын зөвлөх | D-E4 ⚠; mn-tax §2.4 (UNVERIFIED) |
| OQ-TAX-03 | "Баталгаажсан" гэдэг нь ДДТД бүртгэгдсэн байх уу, эсвэл e-tax/eBarimt-ийн худалдан авалтын жагсаалтад нийлүүлэгчийн баримт `SUCCESS`, худалдан авагч "баталгаажуулсан" байх уу | `deductible_confirmed`-ийн утга, R2 автомат импорт (12 PUR-12) | R1: ДДТД (33 орон) + хэрэглэгчийн баталгаажуулалт; R2: импортоор тулгасан баримт | Татварын зөвлөх, СМТТ | D-E4 ⚠; 12 OQ-14 |
| OQ-TAX-04 | НӨАТ төлөгч бус компанийн борлуулалтын eBarimt `taxType` (`NOT_VAT` эсвэл `VAT_FREE`); VAT10 бараатай мөрийг автоматаар NOVAT болгох (энэ баримт, 06 BR-SAL-28) эсвэл татгалзах (16 Q12, 12 VAL-11) | BR-TAX-55, GS-VAT-006, eBarimt payload | Автоматаар NOVAT, `ebarimt_setup.non_vat_payer_tax_type` (анхдагч `NOT_VAT`); 16 Q12-ын таамаг энэ баримттай зөрнө — нэгтгэх | СМТТ | D-E5 ⚠; 06 OQ-SAL-04; 12 OQ-04 |
| OQ-TAX-05 | Босгын эргэлтэд юу орох (ҮХ-ийн борлуулалт, VAT0 экспорт, EXEMPT); 2027-07-01-нээс өмнө 50 саяыг давсан НӨАТ төлөгч бус компани 400 саяын босго хүчин төгөлдөр болсны дараа бүртгүүлэх үүрэгтэй хэвээр эсэх | BR-TAX-83…85, W-TAX-02 | VAT10 + VAT0, ҮХ ба EXEMPT/NOVAT-гүй; `d`-ийн босгоор үнэлж `crossedOn`-ийг тайлбарт | Татварын зөвлөх | D-K5; mn-tax R4 |
| OQ-TAX-06 | Хялбаршуулсан НӨАТ: эхлэх огноо, эрхийн нөхцөл (эргэлт, салбар), суурь (НӨАТ-гүй эсвэл НӨАТ-тэй), төлөх хувь ба хөнгөлөлтийн хувь, тайлангийн маягт ба хугацаа, борлуулалтын баримтад 10 % хэвээр эсэх, үлдэх дүнгийн (D) бүртгэл (8200 орлого эсвэл өөр) | BR-TAX-97…102, GS-VAT-021 | Бүгд `unverified` параметр; Posting хориотой (BR-TAX-12); 8200 | Татварын зөвлөх, СМТТ | D-E7; ADR-0021; legal-parameters (b) |
| OQ-TAX-07 | Урвуу тооцооны хамрах хүрээ: зөвхөн резидент бусын үйлчилгээ үү, барааны (гаалиар ороогүй) хамаарах уу; НӨАТ төлөгч бус компани урвуу тооцоо хийх үүрэгтэй эсэх; суутган татвар (20 %)-тай уялдаа | BR-TAX-59, -64; `tax.company_not_vat_registered` | Зөвхөн үйлчилгээ; НӨАТ төлөгч бус компанид RC хориотой (алдаа); суутган татвар хүрээнээс гадуур | Татварын зөвлөх | D-E1; mn-tax R8, R12; 01 §7 |
| OQ-TAX-08 | Импортын НӨАТ-ын суурь (гаалийн үнэ + гаалийн татвар + онцгой албан татвар) ба ТТ-03а-5 Б хэсэгт гаалийн үнийг заавал харуулах эсэх | CR-TAX-05, ТТ-03а-5 | Гаалийн мэдүүлгийн НӨАТ-ын дүнг шууд оруулна (FULL_VAT), гаалийн үнэ сонголтоор | Татварын зөвлөх | mn-tax §2.5 (UNVERIFIED); FR-TAX-021 |
| OQ-TAX-09 | НХАТ-ын тайлангийн маягт, давтамж (сар/улирал), төлөх хугацаа, аймаг/нийслэлийн өөр хувь | BR-TAX-72, -95, -109; S-TAX-08 | НӨАТ-ын үетэй ижил сар; хугацаа НӨАТ-тай ижил ⚠; хувь кодоор; НӨАТ төлөгч бус НХАТ төлөгчид мөн сарын үе үүсгэж `:close`-оор зөвхөн НХАТ-ыг хаана (EC-16) | Татварын зөвлөх, НТГ | D-E6; mn-tax R14 |
| OQ-TAX-10 | ААНОАТ-ын туслах тайлан DECISIONS §H-д (хувилбарын агуулга) байхгүй; R2-т оруулах эсэх (D-E-д шийдвэр хэрэгтэй); 1 %-ийн горимын суурь (нийт орлого эсвэл борлуулалт), CREDIT_90-ийн нөхцөл | §5.17, BR-TAX-103…108, GS-VAT-022 | R2 · Could, зөвхөн уншдаг тооцоо + ноорог | Бүтээгдэхүүний эзэн, татварын зөвлөх | DECISIONS §H; mn-tax §3 |
| OQ-TAX-11 | Үндсэн хөрөнгийн орцын НӨАТ-ыг нэг дор эсвэл хэсэгчлэн (жишээ нь барилга 120 сар, бусад 60 сар) хасах дүрэм | BR-TAX-25, 11-fixed-assets | Нэг дор (BC загвар); хэсэгчилсэн хасалт хийхгүй | Татварын зөвлөх | CMP-020; 11 |
| OQ-TAX-12 | eBarimt-ийн бараа бүрийн НӨАТ ба баримтын НӨАТ-ын бөөрөнхийллийн дүрэм (баримтын түвшний Nearest + running remainder) PosAPI-ийн шалгалттай таарах эсэх; бэлэн бүхэл төгрөгийн бөөрөнхийлөлтийн (D-C2) НӨАТ-д нөлөө | BR-TAX-19…21, -37; GS-VAT-001/002 | Баримтын түвшин, Nearest, 0.01; бэлэн бөөрөнхийлөлт НӨАТ-ын суурьт орохгүй | СМТТ (PosAPI) | D-E3 ⚠; D-C2 |
| OQ-TAX-13 | Тайлангийн хугацаа амралтын өдөрт таарвал дараагийн ажлын өдөр рүү шилжих эсэх (НӨАТ 10, ААНОАТ 20) | BR-TAX-109, -110; CUE-04 | Шилжүүлэхгүй (хуанлийн өдөр) | Татварын зөвлөх | mn-tax R17 |
| OQ-TAX-14 | НӨАТ-ын тайланг илгээсний (`SUBMITTED`) дараа нягтлан бодох үеийг автоматаар түгжих үү | Z-TAX-04, BR-TAX-78 | Санал (`effects[]`) л; автомат биш | Бүтээгдэхүүний эзэн | 13 SEC-POST-08; D-D3 |
| OQ-TAX-15 | 16 §12.4-ийн GS-VAT-001…012-ийн дүн ба энэ баримтын E-TAX жишээг нэг scenario-д нэгтгэх журам (16 Z8) | §11.2 | E-TAX нь нэмэлт case; зөрвөл энэ баримт | QA, нягтлан зөвлөх | 16 Z8, TST-GS-02 |

---

## Хавсралт. Бусад баримттай тулгалт (2026-10-07)

| Баримт | Тулгасан зүйл | Энэ баримтын шийдэл |
|---|---|---|
| [07-purchases-payables.md](./07-purchases-payables.md) | BR-PUR-46/47 (ДДТД-гүй батлах, `confirmInputVat`), §5.12 `POST /input-vat:write-off`, `GET /input-vat/unconfirmed`, SCR-PUR-01/07/11, `ebarimt.purchase_receipt_ddtd_invalid`, `purchase.vat_difference_*` | BR-TAX-46, -48, §5.8, §8, §10 нь 07-ийн нэр, кодыг ашиглана; механик (Tax) хэвээр |
| [12-ebarimt-integration.md](./12-ebarimt-integration.md) | `POST /purchase-receipts/{id}:confirm` (PUR-04) | Tax-д тусдаа confirm endpoint байхгүй; `IInputVatService`-ийг дуудна |
| [13-security-audit-tenancy.md](./13-security-audit-tenancy.md) | `VAT_PERIOD_SUBMITTED` аудитын event | §5.11, §9.5 |
| [14-api.md](./14-api.md) | §9 problem хэлбэр, `tax.parameter_not_effective` 404, SCR-API-02 job | §8, §9.4; Q19-ийг §5.11 хаана |
| [16-test-strategy.md](./16-test-strategy.md) | §12.4 GS-VAT-001…012 | §11.2-т ID-г 16-тай тааруулж, 013…022-ыг нэмэв; OQ-TAX-04 (Q12), OQ-TAX-15 |

---

## Хяналтын тэмдэглэл (Review log)

**2026-10-08, adversarial review.** Шалгасан: §6–§7-ийн бүх тоон жишээг дахин бодсон (E-TAX-01…12, §6.1–§6.15; Python `Decimal`, `ROUND_HALF_UP`) — бүх ваучер тэнцсэн, ТТ-03а-гийн мөр 1–14 ба хаалтын 2310 = 500 000.00 зөв; хүснэгт/баганын нэрийг `db/schema/*.sql`-тай, seed (`mn_10_coa.sql`, `mn_20_tax.sql`, `mn_50_reports.sql`, `legal_parameters.sql`, `mn_00_catalogs.sql`)-тэй, FR id-г 01-тэй, алдааны кодын хэв маягийг 02/05/14-тэй тулгасан; bc-vat (R-VAT-01…32, pitfall 1–19), mn-tax (R1–R19), mn-accounting (§7, REQ-ACC-13/16/19/22)-ийн MUST дүрмийн хамрагдалт.

| # | Төрөл | Олдсон асуудал | Засвар |
|---|---|---|---|
| 1 | Нягтлан (хаалт) | `FULL_VAT` entry мэдүүлэггүй батлагдвал `deductible_confirmed = false` болж, `ConfirmDeductibleAsync` зөвхөн NORMAL-ийг баталгаажуулдаг, `external_document_no` whitelist-гүй тул тэр НӨАТ хэзээ ч хасагдахгүй, хаагдахгүй 1300-д үлдэх байсан | Мэдүүлгийн № ба огноо posting-д заавал, FULL_VAT үргэлж `true` (BR-TAX-46, -62, §5.5, §5.6, §8.1, AT-TAX-046/062, E-TAX-04; CR-TAX-14-т CHECK). 07 BR-PUR-47/P14-ийг дагуулж засах санал |
| 2 | Нягтлан (хаалт) | Setup-ийн НӨАТ-ын дансыг нээлттэй entry байхад сольж болдог байсан → хаалт шинэ дансыг Кт/Дт хийж, хуучин дансны НӨАТ үлдэнэ; бүлгийн кодыг солиход `setupByCodes` олдохгүй | BR-TAX-03: кодыг солихгүй, нээлттэй entry-тэй үед данс солихгүй (`tax.vat_account_change_open_entries`), blocked setup хаалтад нөлөөлөхгүй; EC-18 |
| 3 | Зэрэгцээ ажиллагаа | `expectedLastVatEntryNo` нь entry нэмэхгүй баталгаажуулалт/цуцлалтыг илрүүлэхгүй → хэрэглэгчийн харсан ТТ-03а-аас өөр дүнгээр хаалт хийгдэх боломжтой | `scopeVersion` (BR-TAX-69 томьёо), `expectedScopeVersion` (BR-TAX-72, §5.10, §5.12 экспорт, §5.19, §10.1, `VatCloseCommand`); AT-TAX-069, EC-13 |
| 4 | Хэрэгжүүлэлт (bug) | `ConfirmDeductibleAsync`: ДДТД-ийн олон утгад `SingleOrDefault` exception (409 биш 500); кредит нотын өөрийн буцаалтын ДДТД (BR-TAX-36) нь `supplier_receipt_id_mismatch` өгч, бас дарагдах байсан | Нийцлийг зөвхөн нэхэмжлэхийн entry-ээр, эхлээд `Count > 1` шалгана, байгаа ДДТД-ийг дарахгүй (BR-TAX-49, §5.8) |
| 5 | Хэрэгжүүлэлт (bug) | `ComputeDocument` алхам 5: бүрэн хасагдахгүй NORMAL мөрөнд `SelfAssessedVat − ND ≠ 0` болж худалдан авалтын НӨАТ-ын данс шаардах буруу алдаа | `charged`-ийг тооцооны төрлөөр (§5.5-тай ижил) |
| 6 | Хэрэгжүүлэлт | `decimal.Round(T/m*100, 2)` нь .NET-ийн анхдагч banker's rounding (баримтын `No_bankers_rounding` дүрэм зөрчсөн); босгын SQL inner JOIN нь setup/бүлэг олдохгүй entry-г чимээгүй хасдаг | `MidpointRounding.AwayFromZero`; LEFT JOIN + `coalesce(s.vat_category, e.vat_category)` (§5.14, BR-TAX-83) |
| 7 | Хэрэгжүүлэлт | Buffer-т ижил дансны +/− мөр цэвэрлэгдээд `Amount = 0` боловч `VatAmount ≠ 0` үлдэх тохиолдолд суурь G/L мөр 0 болж 05 BR-PST-25 (500) зөрчигдөнө; НӨАТ-ын зөрүү `P`-ийн үржвэр биш бол `Allocate`-ийн Σ баталгаа эвдэрнэ | Composer алхам 5 (суурь мөргүй, VAT entry → VAT дансны мөр), `vatDifference % P` шалгалт; EC-14 |
| 8 | Нягтлан / дүрэм | R1-д `vat_registered = false` болгоход `IsVatRegistered` бүх огноонд `false` болж өмнөх үеийг хаах боломжгүй; `vat_registered_from`-ийг хойноос солиход хаагдсан үеийн scope өөрчлөгдөнө | BR-TAX-58 урьдчилсан нөхцөл (`tax.vat_deregistration_periods_open`), BR-TAX-56 түгжээ (`tax.vat_registered_from_locked`); AT-TAX-056, шинэ AT-TAX-058 |
| 9 | Хамрах хүрээ (R2) | НӨАТ төлөгч бус НХАТ төлөгч (ресторан) `:close` хийж чадахгүй (`company_not_vat_registered`) тул НХАТ хэзээ ч хаагдахгүй; `:reopen` НХАТ-ын хаалтыг буцаадаггүй; хоёр `Reverse` дуудлага 05 BR-PST-02 (нэг run)-ийг зөрчих | BR-TAX-72/-55: НХАТ-ын л хаалт; reopen нь хоёр гүйлгээг нэг run-д буцаана, SALE/PURCHASE-ийн оноолтыг л арилгана (BR-TAX-79, §5.11); EC-16, OQ-TAX-09 |
| 10 | Шаардлага (mn-tax R19) | Илгээсэн ТТ-03а-гийн өөрчлөгдөхгүй бүртгэл байхгүй (R2-т загвар засварлахад илгээсэн утга өөрчлөгдөнө) | BR-TAX-78 + §5.11: `:submit`-д snapshot (`audit.security_event.details`); CR-TAX-15; EC-17 |
| 11 | Тоон жишээ | §6.3-A: бөөрөнхийлөөгүй НӨАТ-ыг (91.363636) хуваарилсан завсрын утга — алгоритм бөөрөнхийлсөн `VAT_g`-ийг хуваарилна | 91.363333 / rem ±0.003333 болгож засав (эцсийн утга өөрчлөгдөөгүй) |
| 12 | Тест | AT-TAX-073 "2310 Кт 1 350 000" (ваучерын нийт, 2310 нь 500 000); AT-TAX-051 данс 7200 (E-TAX-08-д 7213); AT-TAX-012 байхгүй параметр `vat.simplified.payable_rate`; EC-03 `numeric(19,2)` (схем `numeric(19,4)`) | Засав |
| 13 | Тодорхой бус алгоритм | Татварын календарийн шүүлт ("overlapping [from, to+2 months]") AT-TAX-109-ийн хүлээлттэй зөрчилдөж байсан; хугацааны параметрийн `asOf` тодорхойгүй | Дүрэм: `due ∈ [from, to]`, параметр = үеийн дараагийн өдрөөр (§5.18, BR-TAX-109), AT-TAX-109-ийг бодит мөрүүдээр дахин бичсэн |
| 14 | Тодорхой бус алгоритм | ААНОАТ-ын `LossOffset` томьёогүй; §5.17-д §6.14 гэж буруу заасан | §6.15-д FIFO, хувийн хязгаар, хугацаатай томьёо |
| 15 | Тодорхой бус алгоритм | G/L-гүй хаалтын замд outbox/audit хэн бичих, түгжээ/stale шалгалт хаана хийгдэх тодорхойгүй (engine `LockSourceAsync`-ийг дууддаггүй) | §5.10: `BuildAsync` хоёр замд шалгана, VatReturnService outbox ба audit бичнэ |
| 16 | Тодорхой бус алгоритм | `:unconfirm` алгоритм, түгжээ байхгүй; eBarimt тулгалтад журналын SALE entry (eBarimt-гүй) ба НХАТ-ын тэмдэг | §5.8 "Цуцлах", §5.19 мөр; §5.13 scope `source_code = 'SALES'`, тэмдэг |
| 17 | Idempotency | `tax.vat_period.closed`/`reopened`-ийн `idempotency_key` хаах → нээх → G/L-гүй дахин хаахад давтагдаж event алга болно | `{rowVersion}`-оор (§9.2) |
| 18 | Тууштай байдал | 05 BR-PST-36 суурь мөрийн `VatAmount` = бүтэн НӨАТ, энэ баримт = хасагдах НӨАТ | Z-TAX-16 (хасагдах канон, үндэслэлтэй; 05-д засах санал) |
| 19 | Тууштай байдал | §5.1-ийн гэрээ ба §9.1/§10.1-ийн нэр зөрүү (`PreviewCloseAsync`, `ComputeAsync`, `GetItemsAsync`, `ListUnconfirmedAsync`, `UnconfirmAsync`, `GetPeriodStatusAsync`); параметрийн кэшийн тайлбар §5.2-той зөрсөн | Нэгтгэв |
| 20 | Тууштай байдал (схем) | `purch.purchase_header`, `gl.gen_journal_line`, `gl.gen_product_posting_group`, `audit.integrity_issue` — схемд байхгүй нэр; эрхийн үсэг `W` (D-I2-д R/I/M/D/X) | `purchase.purchase_header M`, `gl.journal_line I`, `party.gen_prod_posting_group` (CR-TAX-07), 02 §8.8-ийн `ops.consistency_issue` |
| 21 | Тууштай байдал | §5.3 RC + НӨАТ төлөгч бус компанид `tax.vat_calc_type_not_allowed`, §8.1 ба OQ-TAX-07-д `tax.company_not_vat_registered` | `tax.company_not_vat_registered` |
| 22 | Алдааны код | Шинэ дүрмийн код дутуу; `tax.vat_settlement_date_invalid`-ийн BR буруу; `tax.vat_settlement_account_invalid`-ийн нөхцөл BR-TAX-76-тай зөрсөн; `tax.customs_declaration_required` нөхцөл | 4 шинэ код (`tax.vat_account_change_open_entries`, `tax.vat_registered_from_locked`, `tax.vat_deregistration_periods_open` + stale-ийн нөхцөл), бусдыг тааруулав |
| 23 | Эрх | `ERP_VAT` нь `tax.vat_entry`-д `Rm` л (seed) — `:close` (SETTLEMENT) ба `input-vat:write-off` (VATADJ) INSERT хийнэ; R2 `city_tax_entry`-ийн эрх алга | CR-TAX-09-д нэмэв |
| 24 | Инвариант | BR-TAX-82 нь 2300/1300/2305 гэж хатуу дансаар; setup өөр данс заавал буруу дохио | Setup-ийн данс тус бүрээр |
| 25 | Татгалзал | Суурь данс блоклогдсон, кредит нот хамт, ваучерын мөрийн `gen_posting_type` тодорхойгүй | §5.8-д нэмэв; EC-15 |
| 26 | Жижиг | §0.2 W-TAX → §8.2; §1.3, §2.1 → §6.13; §6.4 дунд утгын онцгой тохиолдол; §6.12 тэнцлийн мөр | Засав |

**Schema change requests (энэ review-ээр):** CR-TAX-15 шинэ (`tax.vat_return_snapshot`); CR-TAX-09 (ERP_VAT `Rim`, `city_tax_entry` эрх) ба CR-TAX-14 (FULL_VAT CHECK) өргөтгөсөн; CR-TAX-07-ийн хүснэгтийн нэрийг `party.gen_prod_posting_group` болгож засав. SQL файлыг засаагүй.

**Бусад баримтад дагуулж засах (санал):** 05 BR-PST-36/§5.7.2 (Z-TAX-16); 07 BR-PUR-47 ба P14 (FULL_VAT-ын мэдүүлэг заавал, `true`); 14 §15 (`expectedScopeVersion`, `scopeVersion`); 15 UX-VAT-03 (`scopeVersion`-оор харьцуулах); 02 §8.8 (`ops.consistency_issue` хүснэгт схемд).
