# 09. Мөнгөн хөрөнгө (касс, банк, хэтэвч) ба валют (Cash, Bank & FX) — модулийн тодорхойлолт

> **Төлөв:** Хөгжүүлэлтэд бэлэн ноорог v1.0. **Огноо:** 2026-10-07.
> **Модуль:** `bank` schema (мөнгөний данс: касс / банк / хэтэвч, банкны дэд дэвтэр, кассын баримт МХ-1/МХ-2, хуулга импорт, автомат тулгалт, банкны тулгалт, кассын тооллого, хэтэвчийн тооцоо) + `fx` schema (валют, ханш, Монголбанкны өдрийн ханшийн job, хөрвүүлэлт, тулгалтын хэрэгжсэн ханшийн зөрүү, хэрэгжээгүй ханшийн зөрүүний дахин үнэлгээ).
> **Нэг эх сурвалж:** [DECISIONS.md](./DECISIONS.md) (§K: нэршлийг [`db/schema/*.sql`](./db/schema/) тодорхойлно). Бусад баримттай зөрвөл DECISIONS → schema → энэ баримт гэсэн дарааллаар давамгайлна.
> **Уншигч:** backend хөгжүүлэгч, QA, нягтлан ба татварын зөвлөх.
> **Холбоотой баримт:** [01-requirements.md](./01-requirements.md) (FR-BNK-001..019, FR-FX-001..010, FR-PTY-009..012, FR-GL-003), [02-architecture.md](./02-architecture.md) §4.2.3, §4.2.10, §6, §8.3–8.5, §9.4, §9.5, [03-domain-model.md](./03-domain-model.md), [05-posting-engine.md](./05-posting-engine.md), [06-sales-receivables.md](./06-sales-receivables.md) §5.9, §6.11–6.12, [07-purchases-payables.md](./07-purchases-payables.md) BR-PUR-71..76, BR-AP-60..79, [08-tax-vat-mn.md](./08-tax-vat-mn.md), [13-security-audit-tenancy.md](./13-security-audit-tenancy.md), [14-api.md](./14-api.md) §9.5, §15.4, [15-ui-ux.md](./15-ui-ux.md) §16.3–16.4, S-BNK-01..15, S-FX-01..03, [16-test-strategy.md](./16-test-strategy.md) §12.8–12.10, [db/README.md](./db/README.md), [db/seed/README.md](./db/seed/README.md).
> **Судалгаа (BC эх):** [bc-bank-cash.md](./research/bc-bank-cash.md) (R-BANK-CASH-01..42), [bc-currency-fx.md](./research/bc-currency-fx.md) (R-CURRENCY-FX-01..35, R-CURRENCY-FX-30a), [mn-integrations-market.md](./research/mn-integrations-market.md) (§4 Монголбанк, §5 банк, §6 QPay, I-09..I-11), [mn-accounting.md](./research/mn-accounting.md) (§5.2 МХ-1/МХ-2, §7, REQ-ACC-03/14/15/20), [bc-subledgers-application.md](./research/bc-subledgers-application.md), [bc-gl-posting.md](./research/bc-gl-posting.md).

## Агуулга

- [0. Энэ баримтыг хэрхэн унших](#0-энэ-баримтыг-хэрхэн-унших)
- [1. Зорилго ба хамрах хүрээ](#1-зорилго-ба-хамрах-хүрээ)
- [2. Ойлголт ба BC-ээс авсан зүйл](#2-ойлголт-ба-bc-ээс-авсан-зүйл)
- [3. Өгөгдөл](#3-өгөгдөл)
- [4. Бизнесийн дүрмүүд](#4-бизнесийн-дүрмүүд)
- [5. Процесс ба алгоритм](#5-процесс-ба-алгоритм)
- [6. Тооцоолол ба бөөрөнхийлөлт](#6-тооцоолол-ба-бөөрөнхийлөлт)
- [7. Posting-ийн жишээнүүд](#7-posting-ийн-жишээнүүд)
- [8. Validation ба алдааны кодууд](#8-validation-ба-алдааны-кодууд)
- [9. Events ба интеграц](#9-events-ба-интеграц)
- [10. API ба UI холбоос](#10-api-ба-ui-холбоос)
- [11. Тест сценари](#11-тест-сценари)
- [12. Schema change requests](#12-schema-change-requests)
- [13. Нээлттэй асуулт](#13-нээлттэй-асуулт)
- [Хавсралт А. Бусад баримттай зөрүү](#хавсралт-а-бусад-баримттай-зөрүү)

---

## 0. Энэ баримтыг хэрхэн унших

### 0.1 Тэмдэглэгээ

| Тэмдэглэгээ | Утга |
|---|---|
| `BR-BNK-nn` | Мөнгөний данс, банкны дэд дэвтэр, кассын баримт, шилжүүлэг, кассын тооллого, хэтэвч, хуулга импорт, тулгалтын бизнесийн дүрэм (энэ баримт эзэмшинэ) |
| `BR-FX-nn` | Валют, ханш, Монголбанкны job, хөрвүүлэлт, хэрэгжсэн ба хэрэгжээгүй ханшийн зөрүүний дүрэм (энэ баримт эзэмшинэ) |
| `AT-BNK-nn`, `AT-FX-nn` | Хүлээн авах тест (Given/When/Then, §11) |
| `GS-CASH-nnn`, `GS-REC-nnn`, `GS-FX-nnn` | Golden scenario ([16-test-strategy.md](./16-test-strategy.md) §11–12) |
| `P1..P17` | §7-ийн posting-ийн жишээ |
| `SCR-BNK-nn`, `SCR-FX-nn` | Энэ баримтын schema/seed өөрчлөлтийн хүсэлт (§12) |
| `OQ-BNK-nn`, `OQ-FX-nn` | Нээлттэй асуулт (§13) |
| `Z-BNK-nn` | BC-ээс санаатай зөрүүтэй шийдвэр (§2.4) |
| `r(x)` | `MoneyMath.Round(x, p_LCY)`, `MidpointRounding.AwayFromZero` (ADR-0006). `p_LCY = platform.company_setup.amount_rounding_precision` (анхдагч 0.01) |
| `rc(x)` | Валютын нарийвчлалаар бөөрөнхийлөх: `Round(x, fx.currency.amount_rounding_precision)` (USD 0.01, JPY/KRW 1) |
| `rate` | **1 нэгж валютад ногдох MNT** ("1 USD = 3 450.50 ₮", Монголбанкны хэлбэр). Хадгалалт ба BC-ийн `currency_factor`-тай хөрвүүлэлтийг §6.2 |
| Мөнгөний данс | `bank.bank_account` мөр (`kind` = `BANK` харилцах данс, `CASH` касс, `WALLET` хэтэвч — QPay/картын тооцоо; D-G1, D-G2) |
| BLE | Bank ledger entry = `bank.bank_ledger_entry` (BC T271) |
| CLE / VLE | `party.cust_ledger_entry` / `party.vendor_ledger_entry` (D-K2) |
| Тэмдэг | **Дебит = +, кредит = −** (D-C3). BLE ба хуулгын мөрийн дүн: **мөнгө орвол +, гарвал −** (банкны данс эзэмшигчийн талаас; R-BANK-CASH §5 sign convention) |
| Дүн | Жишээ бүр MNT (R2-ын жишээнд USD), НӨАТ 10 %, нарийвчлал 0.01. Мянгатын тусгаарлагч нь таслал (`1,100,000.00`) |

### 0.2 Нэрийн зөрүүг шийдсэн байдал (D-K1: schema давамгайлна)

| Бусад баримтад | Энэ баримтад (schema) |
|---|---|
| `cash_bank.*`, `cash_desk`, `payment_document`, `payment_line`, `bank_import_format` (02 §4.2.10, §9.4) | `bank.bank_account` (касс = `kind = 'CASH'`), `bank.bank_ledger_entry`, `bank.posted_cash_voucher`, `bank.bank_statement_import_format` + `bank.bank_statement_import_column`, `bank.bank_statement(_line)`, `bank.bank_reconciliation(_line)`, `bank.bank_rec_match(_member)`, `bank.payment_application_proposal`, `bank.text_to_account_mapping`, `bank.bank_account_statement(_line)` |
| `currency.ref_currency`, `currency.ref_official_rate`, `currency.company_rate`, `currency.rate_fetch_log` (02 §4.2.3) | `fx.iso_currency`, `fx.official_exchange_rate`, `fx.currency`, `fx.currency_exchange_rate`; татлагын лог = `integration.job_run` |
| `fx_reval_run`, `fx_reval_line` (research §7) | `fx.exch_rate_adjmt_register` (BC T86), `fx.exch_rate_adjmt_ledger_entry` (BC T186) |
| Ханшийн эх сурвалж `MONGOLBANK_AUTO` (FR-FX-002/003, 02 §9.5) | `fx.official_exchange_rate.source = 'MONGOLBANK'`; `fx.currency_exchange_rate.source ∈ {'MONGOLBANK','MANUAL','IMPORT'}` |
| R1-д `currency_code = MNT` (FR-FX-001 AC1) | `currency_code IS NULL` = LCY (MNT) (бүх хүснэгтийн COMMENT; `CHECK (currency_code IS NOT NULL OR amount = amount_lcy)`) |
| `12-bank-cash spec`, `13-currency-fx spec`, "Банк/кассын spec", "Валютын spec", "FX spec" (05, 06, 07, 14, 16) | Энэ баримт (`09-bank-cash-fx.md`) |
| `event.PaymentPosted`, `BankStatementImported`, `BankReconciled`, `ExchangeRatesUpdated` (02 §4.2.3, §4.2.10) | Outbox topic `event.payment.posted`, `event.bank_statement.imported`, `event.bank_reconciliation.posted`, `event.exchange_rates.updated` (`integration.outbox.topic` CHECK жижиг үсэг шаарддаг; 06 §0.2-тай ижил) |
| `MongolbankRateFetchJob` (02 §9.5) | `integration.job_definition.code = 'fx.mongolbank_rates'` (scope `SYSTEM`, `max_attempts = 5`) |
| Улаан сторно (`is_correction`, 02 §6.8) | Хэрэглэхгүй (D-C3) |

---

## 1. Зорилго ба хамрах хүрээ

### 1.1 Зорилго

Энэ модуль нь бичил бизнесийн **мөнгөн хөрөнгийг** (касс, харилцах данс, цахим хэтэвч) нэг дэд дэвтрээр (subledger) бүртгэж, ерөнхий дэвтэртэй (G/L) үргэлж тэнцүү байлгана. Мөн **гадаад валютын** гүйлгээг Монголбанкны албан ханшаар MNT-д хөрвүүлж, ханшийн зөрүүг хуулийн дагуу тооцно:

1. **Мөнгөний данс** (`bank.bank_account`, `kind` = BANK / CASH / WALLET): нэг мөнгөний данс = нэг G/L данс, валют, банкны мэдээлэл, импортын профайл, тулгалтын хүлцэл, сөрөг үлдэгдлийн хориг.
2. **Кассын орлого ба зарлагын баримт** (МХ-1 / МХ-2, Сангийн сайдын 2017 оны 347-р тушаалын маягт): касс бүрийн завсаргүй цуврал, дүнг үсгээр, хэвлэх маягт; **касс сөрөг болохыг хориглоно** (D-G1).
3. **Төлбөр ба орлого** (`POST /payments`): харилцагч, нийлүүлэгч, G/L данс, мөнгөний данс хоорондын шилжүүлэг — нэг командаар батлах (BC Payment Registration).
4. **Кассын тооллого**: дэвтрийн ба тоолсон үлдэгдлийн зөрүүг илүүдэл/дутагдлын дансанд.
5. **Хэтэвч** (QPay, картын тооцоо): нэгтгэсэн орлогыг WALLET дансаар хүлээж, банк руу шилжихэд шимтгэлийг тусад нь бичих.
6. **Банкны хуулга импорт**: CSV/XLSX mapping wizard, Хаан ба Голомт банкны preset, давхар импортоос сэргийлэх.
7. **Автомат тулгалт** (BC Match Bank Payments-ийг хялбарчилсан): оноо, итгэлийн түвшин, текстээс данс руу дүрэм.
8. **Банкны тулгалт** ("Батлах ба тулгах"): тулгалтаас үүсэх төлбөр/дүрмийн бичилт, банкны entry-г хаах, хуулгын агшин зураг, буцаах, тулгалтын тайлан.
9. **Валют ба ханш** (R2): валютын лавлах, Монголбанкны өдрийн ханшийг автоматаар татах job, гар оруулга, огноогоор ханш хайх.
10. **Хөрвүүлэлт ба бөөрөнхийлөлт** (R2): FCY → MNT, баримтын мөрийн хуримтлагдсан (running total) хөрвүүлэлт.
11. **Хэрэгжсэн ханшийн зөрүү** (R2): авлага/өглөгийн тулгалт бүрд.
12. **Хэрэгжээгүй ханшийн зөрүү — дахин үнэлгээ** (R2): сар/жилийн эцэст нээлттэй авлага, өглөг, валютын мөнгөний данс.

### 1.2 Хамрах хүрээ

| Хүрээнд | Хүрээнээс гадуур (эзэмшигч) |
|---|---|
| `bank.*` бүх хүснэгт, `fx.*` бүх хүснэгт | Posting engine, дугаарлалт, register, preview механизм ([05](./05-posting-engine.md)) |
| `BankLedgerWriter` (`ILedgerWriter<BankLedgerLine>`): BLE, МХ-1/МХ-2, касс сөрөг болохгүй шалгалт | Авлага/өглөгийн дэд дэвтэр, тулгалтын цөм (`party.*`; [06](./06-sales-receivables.md) §5.13, [07](./07-purchases-payables.md)) — энэ баримт зөвхөн **ханшийн зөрүүний мөрийг** (`UNREALIZED_*`, `REALIZED_*`, `CORRECTION_OF_REMAINING_AMOUNT`) тооцох томьёог өгнө |
| `POST /payments` командын угсралт (мөнгөний тал + харьцагчийн тал) | Нэхэмжлэх дээрх "Төлбөр бүртгэх" товч, бэлэн борлуулалт/худалдан авалтын автомат төлбөр (06 BR-SAL-50..56, 07 BR-PUR-71..76) — тэд энэ модулийн `BankLedgerLine`-ийг хэрэглэнэ |
| Хуулга импорт, тулгалт, тулгалтын тайлан | Төлөх нэхэмжлэхийн санал (07 BR-AP-70..79); банкны бөөн төлбөрийн файл (01 §7, хувилбаргүй) |
| Валют, ханш, хөрвүүлэх функц (`IFxConverter`), дахин үнэлгээний run | Баримтын валютын талбарыг ашиглах (06 §6.12, 07 §6), НӨАТ MNT-ээр (08) |
| Мөнгөний дансны МГТ-ийн ангиллыг BLE-д дамжуулах (`cash_flow_category_id`) | МГТ-ийн тайлан (тайлангийн spec) |
| QPay/картын орлогыг WALLET-аар бүртгэх, хэтэвчийн тооцоо (R1) | QPay API (нэхэмжлэх, `payment/check`, QPay eBarimt) — **R3** (DECISIONS §H); eBarimt-ийн `payments[].code` ([12](./12-ebarimt-integration.md)) |
| Банкны хуулга файлаар (R1) | Банкны corporate API (FR-BNK-019) — **R3** |

### 1.3 Хувилбар (DECISIONS §H)

| Хувилбар | Агуулга |
|---|---|
| **R1 (MVP)** | Мөнгөний данс BANK/CASH/WALLET (FR-BNK-001); МХ-1/МХ-2 ба хэвлэмэл (FR-BNK-002/003); касс сөрөг болохгүй (D-G1); банкны төлбөр/орлого (FR-BNK-005); нэхэмжлэхээс төлбөр бүртгэх (FR-BNK-006); данс хоорондын шилжүүлэг (FR-BNK-007); кассын тооллого (FR-BNK-004, Should); хуулга импортын wizard (FR-BNK-008); Хаан/Голомт preset (FR-BNK-009, Should; жишээ файл ⚠); давхар импортын хориг (FR-BNK-010); автомат тулгалт (FR-BNK-011); текстээс данс руу дүрэм (FR-BNK-012, Should); "Батлах ба тулгах" (FR-BNK-013); тулгалт буцаах (FR-BNK-014, Should); мөнгөний бичилт буцаах хориг (FR-BNK-015); тулгалтын тайлан (FR-BNK-016); WALLET ба хэтэвчийн тооцоо (FR-BNK-017, Should). **Зөвхөн MNT** (FR-FX-001: валютын талбарууд схемд байгаа, функц идэвхгүй). |
| **R2** | Валют ба ханшийн хүснэгт (FR-FX-002); Монголбанкны ханш автоматаар (FR-FX-003); валютын баримт ба хөрвүүлэлт (FR-FX-004); баримтын ханшийг өөрчлөх (FR-FX-005, Should); зөвхөн ижил валютаар тулгах (FR-FX-006); хэрэгжсэн ханшийн зөрүү (FR-FX-007); хэрэгжээгүй ханшийн зөрүү (FR-FX-008); валютын мөнгөний дансны дахин үнэлгээ (FR-FX-009); дахин үнэлгээний хамгаалалт ба буцаалт (FR-FX-010, Should); валютын касс (1101) ба харилцах данс (1115); валют арилжаа (USD → MNT шилжүүлэг) |
| **R3** | Банкны API-аар хуулга татах (FR-BNK-019); QPay merchant API v2 (нэхэмжлэх, `payment/check`, callback-ийг `integration.inbox`-оор); банкны бөөн төлбөрийн файл (хэрэгцээ гарвал) |

### 1.4 Шаардлагын хамрах хүснэгт (traceability)

| FR | Гарчиг | Хувилбар | Энэ баримтын хэсэг |
|---|---|---|---|
| FR-BNK-001 | Мөнгөний данс: банк, касс, хэтэвч | R1 | BR-BNK-01..09, BR-BNK-10..16, §3.1, SCR-BNK-03 |
| FR-BNK-002 | Кассын орлогын баримт (МХ-1) | R1 | BR-BNK-20..29, §5.2, §5.3, P1 |
| FR-BNK-003 | Кассын зарлагын баримт (МХ-2) | R1 | BR-BNK-20..29, §5.2, P2 |
| FR-BNK-004 | Кассын тооллого | R1 (Should) | BR-BNK-33, §5.5, P4 |
| FR-BNK-005 | Банкны төлбөр ба орлого | R1 | BR-BNK-10..16, §5.2 |
| FR-BNK-006 | Нэхэмжлэхээс төлбөр бүртгэх | R1 | §5.2 (06/07-оос дуудна) |
| FR-BNK-007 | Мөнгөний данс хоорондын шилжүүлэг | R1 | BR-BNK-30..32, §5.4, P3 |
| FR-BNK-008 | Хуулга импорт (CSV/XLSX wizard) | R1 | BR-BNK-40..49, §5.7, §5.8 |
| FR-BNK-009 | Хаан ба Голомт банкны preset | R1 (Should) | §5.8.4, OQ-BNK-01 |
| FR-BNK-010 | Давхар импортоос сэргийлэх | R1 | BR-BNK-44..46, §6.6 |
| FR-BNK-011 | Автомат тулгалт | R1 | BR-BNK-50..62, §5.9, §6.7 |
| FR-BNK-012 | Текстээс данс руу дүрэм | R1 (Should) | BR-BNK-58, §5.9.6 |
| FR-BNK-013 | Хянах ба "Батлах ба тулгах" | R1 | BR-BNK-63..72, §5.10, §5.11, P6, P7 |
| FR-BNK-014 | Хуулгын тулгалтыг буцаах | R1 (Should) | BR-BNK-73..75, §5.12, SCR-BNK-02 |
| FR-BNK-015 | Мөнгөний бичилтийг буцаах | R1 | BR-BNK-76..77 |
| FR-BNK-016 | Банкны тулгалтын тайлан | R1 | BR-BNK-78, §6.8 |
| FR-BNK-017 | Хэтэвч (WALLET) | R1 (Should) | BR-BNK-34..36, §5.6, P5 |
| FR-BNK-018 | Төлөх нэхэмжлэхийн санал | R1 (Should) | [07](./07-purchases-payables.md) BR-AP-70..79 (энэ баримт зөвхөн `POST /payments`-аар батлана) |
| FR-BNK-019 | Банкны API | **R3** | §5.8.6 (гэрээ) |
| FR-FX-001 | Валютын талбар R1-ээс (функц идэвхгүй) | R1 | BR-FX-01 |
| FR-FX-002 | Валют ба ханшийн хүснэгт | R2 | BR-FX-02..09, §5.13 |
| FR-FX-003 | Монголбанкны ханш автоматаар | R2 | BR-FX-10..18, §5.14 |
| FR-FX-004 | Валютын баримт ба MNT-д хөрвүүлэх | R2 | BR-FX-20..27, §6.2–6.3 |
| FR-FX-005 | Баримтын ханшийг өөрчлөх | R2 (Should) | BR-FX-25, P15 |
| FR-FX-006 | Зөвхөн ижил валютаар тулгах | R2 | BR-FX-30 |
| FR-FX-007 | Хэрэгжсэн ханшийн зөрүү | R2 | BR-FX-30..39, §5.15, §6.4, P11, P12 |
| FR-FX-008 | Хэрэгжээгүй ханшийн зөрүү | R2 | BR-FX-40..52, §5.16, §6.5, P10, P13, P14 |
| FR-FX-009 | Валютын мөнгөний дансны дахин үнэлгээ | R2 | BR-FX-46, P10, P13, SCR-FX-02 |
| FR-FX-010 | Дахин үнэлгээний хамгаалалт ба буцаалт | R2 (Should) | BR-FX-53..55, §5.17 |
| FR-GL-003 | Хяналтын данс руу шууд бичих хориг (мөнгөний данс) | R1 | BR-BNK-13 |
| FR-PTY-009, 010, 012 | Тулгалт, хуваарилалт, урьдчилгаа (төлбөрийн тал) | R1 | §5.2 (`applyTo[]`, `applyToOldest`), [06](./06-sales-receivables.md) §5.13 |
| REQ-ACC-14, 15 | Кассын дэвтэр, МХ-1/МХ-2 маягт | R1 | §5.3, §10 (`cash-bank-book`) |
| REQ-ACC-03, 20 | MNT функциональ валют, сарын хаалтын дахин үнэлгээ | R2 | §5.16 |

---

## 2. Ойлголт ба BC-ээс авсан зүйл

### 2.1 Үндсэн ойлголт

```mermaid
flowchart LR
    subgraph master[Мастер]
      BA[bank_account<br/>BANK / CASH / WALLET] --> PG[bank_account_posting_group] --> GL[(gl_account<br/>1100..1121)]
      CUR[fx.currency] --> CER[fx.currency_exchange_rate]
      OFF[fx.official_exchange_rate<br/>глобал] -.хуулна.-> CER
    end
    subgraph posting[Posting (05)]
      PAY[POST /payments<br/>МХ-1/МХ-2/банк/шилжүүлэг] --> BLW[BankLedgerWriter]
      SAL[Бэлэн борлуулалт/худалдан авалт<br/>журнал CASH/BANK] --> BLW
      BLW --> BLE[(bank_ledger_entry)]
      BLW --> PCV[(posted_cash_voucher<br/>МХ-1 / МХ-2)]
    end
    subgraph rec[Хуулга ба тулгалт]
      FILE[CSV/XLSX] --> BS[bank_statement + lines<br/>dedupe_key]
      BS --> REC[bank_reconciliation + lines]
      REC --> MATCH[bank_rec_match /<br/>payment_application_proposal]
      MATCH -- "Батлах ба тулгах" --> BLE
      REC --> BAS[(bank_account_statement<br/>агшин зураг)]
    end
    subgraph fxrun[R2: дахин үнэлгээ]
      RUN[Exch. rate adjustment run] --> REG[(exch_rate_adjmt_register<br/>+ ledger_entry)]
      RUN --> DET[(detailed_*_ledger_entry<br/>UNREALIZED_*)]
      RUN --> BLE
    end
```

- **Мөнгөний данс = мөнгөн хөрөнгийн дэд дэвтэр.** Мөнгөний дансанд хийсэн posting бүр **нэг BLE** ба мөнгөний дансны G/L данс руу **ижил `amount_lcy`-тай нэг G/L мөр** бичнэ (R-BANK-CASH-06). Үлдэгдэл = Σ BLE (хадгалсан үлдэгдэлгүй; `bank.v_bank_account_balance`, R-BANK-CASH-07).
- **Касс нь тусдаа модуль биш**: `kind = 'CASH'` мөнгөний данс (D-G1; BC W1-тэй ижил, R-BANK-CASH §1). МХ-1/МХ-2 нь CZ локализацийн Cash Desk-ийн санаагаар нэмэгдэнэ (research F7 step 4).
- **BLE-ийн хоёр бие даасан төлөв** (R-BANK-CASH §1): (a) `open` / `remaining_amount` — банкны хуулгатай тулгагдсан эсэх; (b) `statement_status` / `statement_no` / `statement_line_no` — аль хуулгын мөрөөр хаагдсан.
- **Нэг тулгалтын урсгал** (research §7.3): BC-ийн "Bank Reconciliation" ба "Payment Reconciliation Journal"-ыг нэгтгэнэ. Хуулгын мөр нь (a) өмнө бүртгэсэн BLE-тэй, (b) нээлттэй авлага/өглөгтэй (төлбөр үүснэ), (c) текстийн дүрэм эсвэл гараар сонгосон данстай (бичилт үүснэ) тулгагдана. "Батлах ба тулгах" нь бүгдийг нэг DB transaction-д хийнэ.
- **Валют** (R2): ханшийг "1 нэгж = X ₮" хэлбэрээр оруулж харуулна; схем нь BC-ийн `currency_factor`-ийг (1 LCY-д ногдох FCY) хадгалдаг тул хөрвүүлэлтийн каноник томьёог §6.2-т тогтооно.
- **Ханшийн зөрүү хоёр төрөл**: *хэрэгжсэн* (realized) — валютын авлага/өглөг төлөгдөж тулгагдах үед, **анхны ханштай** харьцуулж (R-CURRENCY-FX-28); *хэрэгжээгүй* (unrealized) — үеийн эцэст нээлттэй үлдэгдлийг тухайн өдрийн ханшаар дахин үнэлэх (R-CURRENCY-FX-16). Seed: хэрэгжсэн **8500**, хэрэгжээгүй **8510** (Дт/Кт аль аль).

### 2.2 BC-ээс шууд авсан (copy)

| BC дүрэм | Юу | Энэ баримтад |
|---|---|---|
| R-BANK-CASH-01 | Валютыг үлдэгдэл 0 ба нээлттэй BLE-гүй үед л солино | BR-BNK-04 |
| R-BANK-CASH-02 | Блоклоогүй, posting group ба G/L данстай | BR-BNK-10 |
| R-BANK-CASH-03 | Валютын нийцэл: LCY мөр → LCY данс; FCY данс → ижил валют; LCY данс FCY мөрийг LCY-ээр хүлээн авна | BR-BNK-11, BR-FX-24 |
| R-BANK-CASH-04 | BLE: `amount` (дансны валютаар), `amount_lcy`, `remaining = amount`, `positive`, `open = amount ≠ 0`; 0 дүнтэй entry хаалттай | BR-BNK-12 |
| R-BANK-CASH-06 | Нэг G/L мөр, ижил `amount_lcy`, ижил transaction | BR-BNK-12 |
| R-BANK-CASH-07 | Үлдэгдэл = Σ, огноогоор | BR-BNK-15 |
| R-BANK-CASH-09 | Бичилттэй дансыг устгахгүй | BR-BNK-06 |
| R-BANK-CASH-12..16 | Тулгалтын нөхцөл, үр дүн (BLE хаах, хуулгын агшин зураг, `balance_last_statement`) | BR-BNK-63..72 |
| R-BANK-CASH-15 | "Σ мөр = эцсийн − өмнөх" ба мөр бүр бүрэн тайлбарлагдсан | BR-BNK-66, BR-BNK-67 |
| R-BANK-CASH-22..28 | Төлбөрийн тулгалтын нэр дэвшигч, харьцагч/баримт/дүнгийн дохио, оноо, нэг мөр → нэг харьцагч | BR-BNK-50..62, §5.9 |
| R-BANK-CASH-29 | Текстээс данс руу: агуулсан эсэх, орлогод `debit_account_id`, зарлагад `credit_account_id`; давхар бичилтээс сэргийлэх (±2 хоног) | BR-BNK-58 |
| R-BANK-CASH-30 | Зөрүүтэй мөрийг хувааж зөрүүг сонгосон дансанд | BR-BNK-62 |
| R-BANK-CASH-32 | Тулгалтаас үүсэх төлбөр: огноо = гүйлгээний огноо, Payment/Refund төрөл, шинэ BLE шууд хаагдана | BR-BNK-68, BR-BNK-69 |
| R-BANK-CASH-34, 35 | Давхардлын түлхүүр, баганын харгалзаа, multiplier, сөрөг тэмдгийн тэмдэглэгээ, `line_no = n × 10000` | BR-BNK-41..46 |
| R-BANK-CASH-36 | Хүлцлийн муж (дүн/хувь, 0-ээр хязгаарлах, сөрөгт солих) | §6.7.1 |
| R-BANK-CASH-38, 39 | Тулгалт буцаах; буцаалтын өмнө тулгалтгүй байх | BR-BNK-73..77 |
| R-BANK-CASH-42, R-CURRENCY-FX-22 | Валютын банкны дахин үнэлгээ: BLE `amount = 0`, `amount_lcy = delta` | BR-FX-46 |
| R-CURRENCY-FX-01 | Ханш = `starting_date ≤ D`-ийн хамгийн сүүлийнх; байхгүй бол алдаа, хэзээ ч 1 биш | BR-FX-04 |
| R-CURRENCY-FX-06, 09, 10 | Баримтын ханш posting огноогоор, мөрийн хуримтлагдсан хөрвүүлэлт, entry-д анхны ба тохируулсан ханш | BR-FX-20..23 |
| R-CURRENCY-FX-07 | LCY дүнг гараар өгөхөд ханш = FCY / LCY | BR-FX-25 |
| R-CURRENCY-FX-15..21 | Дахин үнэлгээ: as-of D, delta, мөрийн төрөл, FCY 0, G/L | BR-FX-40..48 |
| R-CURRENCY-FX-19 | Хоцорсон run: D-ээс хойших detailed мөр бүрийн огноогоор дахин тохируулах | BR-FX-49 |
| R-CURRENCY-FX-25..31, 30a | Тулгалтын дараалал, хэрэгжээгүйг хувь тэнцүүлэн буцаах, хэрэгжсэн, засварын мөр, шинэ entry-ийн буцаалт | BR-FX-30..39 |
| R-CURRENCY-FX-32 | Unapply → тохируулсан ханшаар дахин тохируулах | BR-FX-38 |
| R-CURRENCY-FX-33 | Ашиглагдсан валютыг устгахгүй | BR-FX-03 |

### 2.3 Хялбарчилсан (simplify)

| BC | Манайд | Шалтгаан / эх |
|---|---|---|
| Хоёр worksheet (Bank Reconciliation + Payment Application), хоёр тусдаа дугаарын тоолуур (R-BANK-CASH-10, 17) | Нэг `bank_reconciliation`; хуулгын дугаарыг хэрэглэгч өгнө, `bank_account.last_statement_no`-д **зөвхөн батлахад** бичигдэнэ | research §7.3, §8 "Statement number reservation" |
| Parent/child мөр хуваах, T2711 n:1 buffer | `bank_rec_match` (1:1, 1:n, n:1; Σ тэнцүү), зөрүүг хүү мөрөөр (`statement_line_no + 1`) | R-BANK-CASH-13, 30; research §7.4 |
| Matching rule хүснэгт (T1252), тохиргооны UI (T1253) | BC-ийн анхдагч 25 дүрмийг **кодонд тогтмол** (Direct Debit-ээс бусад), оноо ижил томьёогоор | R-BANK-CASH-26; research §7.5 |
| `Bank Acc. Posting Group` | Схемд байгаа (`bank_account_posting_group`), гэхдээ **нэг бүлэг = нэг мөнгөний данс = нэг G/L данс** | FR-BNK-001 AC2, seed §5 |
| Data Exchange framework (T1221..1227) | `bank_statement_import_format` + `bank_statement_import_column` (баганын дугаар эсвэл гарчгаар) | R-BANK-CASH-35 |
| Ханшийн хүснэгт: relational currency, Fix type, тусдаа adjustment rate | `exchange_rate_amount = 1`, `relational_exch_rate_amount = MNT`; adjustment баганууд **үргэлж ижил утгатай** | R-CURRENCY-FX-05; research §7.1 |
| Дахин үнэлгээний Start/End date | Зөвхөн as-of огноо D (= posting огноо) | R-CURRENCY-FX-15 pitfall |
| Валют бүрд gain/loss данс | `gl.general_ledger_setup`-ийн анхдагч (8500/8510), `fx.currency`-д override | D-G3; research §7.5 |
| Payment discount, payment tolerance | Байхгүй (D-F2: R2+) | — |

### 2.4 Хассан ба санаатай зөрүү (drop / Z-BNK)

| ID | BC | Шийдвэр | Шалтгаан |
|---|---|---|---|
| Z-BNK-01 | `Min. Balance` зөвхөн харагдана (R-BANK-CASH-08) | **CASH данс үргэлж сөрөг болохгүй** (DB `ERC01`, D-G1); бусад дансанд `prevent_negative_balance`. `min_balance` = анхааруулга | D-G1 |
| Z-BNK-02 | Мөнгөний дансны G/L руу шууд журнал бичиж болно (R-BANK-CASH-06 caveat) | **Хориглоно**: 1100–1121 `direct_posting = false` (FR-GL-003) | Дэд дэвтэр = G/L invariant |
| Z-BNK-03 | Auto-match-ийн огнооны хүлцэл анхдагч 0 хоног (R-BANK-CASH-19) | **3 хоног** | Амралтын өдөр, маргааш нь орох гүйлгээ (research §8) |
| Z-BNK-04 | Бүх мөр High бол шууд батлах санал (R-BANK-CASH-31) | Хэрэглэгч үргэлж хянана (SKIP) | research §3 |
| Z-BNK-05 | "Post payments only" (тулгалтгүй) | Үргэлж "Батлах ба тулгах" (R-BANK-CASH-33) | research §7.3 |
| Z-BNK-06 | BLE-ийн хэсэгчилсэн тулгалт (`Remaining Amount` хэсэгчлэн) | Хориглоно: BLE бүхлээрээ нэг бүлэгт тулгагдана (n:1 нь хуулгын мөрүүдийн нийлбэр = BLE) | BC өөрөө анхааруулдаг (`RPOST:571-583`) |
| Z-BNK-07 | Check, positive pay, SEPA, direct debit, employee matching, Copilot | Хассан | research §7.12 |
| Z-BNK-08 | Тулгалтаас үүсэх төлбөрийн `Document No.` = хуулгын дугаар (R-BANK-CASH-32) | Хуулийн завсаргүй цуврал `BR`/`BP` (D-C7) | MN хуулийн баримтын дугаарлалт |
| Z-FX-01 | Банкны дахин үнэлгээ **хэрэгжсэн** дансанд (R-CURRENCY-FX-22) | Анхдагч нь BC-тэй адил (FR-FX-009, GS-FX-005); тохиргоогоор хэрэгжээгүй руу (SCR-FX-02, ⚠ OQ-FX-01) | MN татварын хандлага тодорхойгүй |
| Z-FX-02 | Хэрэгжээгүй олз ба гарзыг тусдаа G/L мөрөөр (R-CURRENCY-FX-20) | Gain ба loss данс **ижил** бол нэг мөрөөр цэвэр дүнгээр (seed: 8510 = 8510) | Утгагүй Дт/Кт хос мөрөөс сэргийлэх |
| Z-FX-03 | Валют хоорондын тулгалт (`Appln. between Currencies = All`) | Байхгүй (`None`) | R-CURRENCY-FX-25, FR-FX-006 |
| Z-FX-04 | ACY, G/L/НӨАТ-ын ханшийн тэгшитгэл, residual данс, EMU, `Conv. LCY Rndg.` | Хассан | R-CURRENCY-FX-23; research §7.8 |
| Z-FX-05 | Хамгийн сүүлийн дахин үнэлгээнээс өмнөх огноотой FCY posting зөвшөөрнө | **Хориглоно** (`fx.posting_before_last_revaluation`) | FR-FX-010; research §7.4 |

---
## 3. Өгөгдөл

Бүх хүснэгт `tenant_id`, `company_id`, `id uuid` (UUIDv7), forced RLS-тэй (D-B3, D-K6). Мастер/ноорогт `row_version` (optimistic concurrency), ledger-д `entry_no bigint` (компани дотор завсаргүй, `platform.fn_next_entry_no`, D-K3). Доорх хүснэгтэд зөвхөн энэ модульд утга нь чухал баганыг тайлбарлав.

### 3.1 Мөнгөний данс (`090_bank.sql`)

**`bank.bank_account_posting_group`** (BC T277): `code`, `gl_account_id` — мөнгөний дансны G/L данс. Seed: `CASH_MNT` 1100, `CASH_FCY` 1101, `BANK_MNT` 1110, `BANK_MNT_2` 1111, `BANK_FCY` 1115, `WALLET` 1120 (QPay), `CARD` 1121.

**`bank.bank_account`** (BC T270):

| Багана | Утга ба дүрэм |
|---|---|
| `no`, `name` | Дансны код (`CASH01`, `BANK01`, `QPAY01`, `GOL-USD`) ба нэр |
| `kind` | `BANK` харилцах данс / `CASH` касс / `WALLET` хэтэвч (QPay, картын тооцоо). CASH-д `bank_account_no`, `iban` NULL (CHECK) |
| `bank_name`, `bank_code` | Банкны нэр ба банк хоорондын код (Хаан 050000, Голомт 150000, ХХБ 040000, Хас 320000, Төрийн 340000 — mn-integrations §5) |
| `bank_account_no`, `iban` | Дансны дугаар; IBAN `MN` + 2 шалгах + 4 банкны код + 12 орон = 20 тэмдэгт, mod-97 (BR-BNK-03) |
| `currency_code` | NULL = MNT. R2: USD г.м. (BR-BNK-04) |
| `bank_account_posting_group_id` | → G/L данс (BR-BNK-02) |
| `import_format_id` | Анхдагч импортын профайл (BR-BNK-40) |
| `last_statement_no`, `balance_last_statement` | Хамгийн сүүлд **батлагдсан** хуулгын дугаар ба эцсийн үлдэгдэл (BR-BNK-70) |
| `match_tolerance_type`, `match_tolerance_value` | Автомат тулгалтын дүнгийн хүлцэл `AMOUNT` / `PERCENTAGE` (§6.7.1). Анхдагч 0 |
| `min_balance` | Анхааруулгын босго (Z-BNK-01) |
| `prevent_negative_balance` | `BANK`/`WALLET`-д сонголттой; `CASH`-д **үргэлж true гэж үзнэ** (DB trigger `kind = 'CASH' OR prevent_negative_balance`) |
| `cash_receipt_no_series_id`, `cash_payment_no_series_id` | МХ-1 (`KO`) ба МХ-2 (`KZ`) завсаргүй, жил бүр шинэчлэгддэг цуврал (зөвхөн `CASH`-д заавал, BR-BNK-21) |
| `blocked` | Блоклогдсон дансанд posting хийхгүй (BR-BNK-10) |

**`bank.v_bank_account_balance`** (920): `balance` = Σ `amount`, `balance_lcy` = Σ `amount_lcy`.

### 3.2 Банкны дэд дэвтэр ба кассын баримт

**`bank.bank_ledger_entry`** (BC T271; append-only, whitelist: `remaining_amount`, `open`, `closed_by_entry_no`, `closed_at_date`, `statement_status`, `statement_no`, `statement_line_no`, `reversed`, `reversed_by_entry_no` — зөвхөн `platform.fn_ledger_update`-ээр, D-C4):

| Багана | Утга |
|---|---|
| `entry_no` | Counter `BANK_LEDGER_ENTRY` |
| `bank_account_id`, `posting_date`, `document_date`, `document_type`, `document_no`, `external_document_no`, `description` | Ваучерын мэдээлэл. `document_no` = ваучерын хуулийн дугаар (`KO-…`, `BR-…`, `SI-…` г.м.) |
| `counterparty_name` | Харьцагчийн нэр (кассын дэвтэр, тулгалтын текст харьцуулалт) |
| `currency_code`, `amount`, `amount_lcy` | `amount` = **мөнгөний дансны валютаар**, тэмдэгтэй (орлого +); `amount_lcy` = G/L мөрийнх. LCY дансанд `amount = amount_lcy` |
| `debit_amount`, `credit_amount` | Generated (тэмдгээс) |
| `remaining_amount`, `open`, `positive` | Тулгалтын төлөв (`open = amount ≠ 0` бичихэд; 0 дүнтэй бол `false`) |
| `closed_by_entry_no`, `closed_at_date` | Хаасан entry / хуулгын огноо |
| `statement_status`, `statement_no`, `statement_line_no` | `OPEN` → `CLOSED` (v1-д `BANK_ACC_ENTRY_APPLIED`-ийг ашиглахгүй, BR-BNK-64). CHECK: `OPEN` биш бол `statement_no` заавал |
| `bal_account_type`, `bal_account_id` | Харьцсан тал (харилцагч/нийлүүлэгч/G/L/мөнгөний данс) — тулгалтын харьцагчийн дохио (§5.9.3) |
| `cash_flow_category_id` | МГТ-ийн ангиллын override (тайлангийн spec) |
| `transaction_no`, `gl_register_no`, `dimension_set_id`, `source_code`, `reason_code_id` | Posting-ийн холбоос |
| `reversed`, `reversed_by_entry_no`, `reversed_entry_no` | Буцаалт (05 §5.x) |

**`bank.posted_cash_voucher`** (МХ-1/МХ-2; BC-д хүснэгтгүй; append-only, засварлах багана байхгүй):

| Багана | Утга | Хэвлэмэл дээр |
|---|---|---|
| `voucher_type` | `RECEIPT` (МХ-1) / `PAYMENT` (МХ-2) | Маягтын код "НХМаягт МХ-1" / "МХ-2" |
| `no` | Касс бүрийн цувралын завсаргүй дугаар (`KO-2026-00001`), `UNIQUE (company_id, voucher_type, no)` | "№" |
| `bank_account_id` | Касс | "Касс" |
| `posting_date` | Огноо | "20__ оны __ сарын __" |
| `counterparty_type`, `counterparty_id` | `CUSTOMER` / `VENDOR` / `GL_ACCOUNT` / `BANK_ACCOUNT` + id (NULL байж болно) | — |
| `counterparty_name` | Тушаагч (МХ-1) / хүлээн авагч (МХ-2) | "Хэнээс хүлээн авсан" / "Хэнд олгосон" |
| `counterparty_id_doc` | Хувь хүний бичиг баримтын дугаар (регистр) эсвэл ТТД; PII, `enc:v1:` шифрлэгдсэн ([13](./13-security-audit-tenancy.md) PiiCatalog); МХ-2-т заавал | "Бичиг баримтын дугаар" |
| `purpose` | Гүйлгээний утга (≤ 250) | "Гүйлгээний утга" |
| `amount` | **Эерэг** дүн (CHECK > 0), кассын валютаар | "Дүн (тоогоор)" |
| `amount_in_words` | Posting үед `MoneyWords.ToMongolian()`-оор үүсгэж хадгална (§6.9); дахин тооцохгүй | "Дүн (үсгээр)" |
| `currency_code` | NULL = MNT | Валютын нэр (R2) |
| `bank_ledger_entry_no`, `transaction_no` | Эх BLE ба G/L transaction | "Харьцсан данс"-ыг transaction-ий бусад G/L мөрөөс уншина (§5.3) |

### 3.3 Хуулга импорт

**`bank.bank_statement_import_format`** (BC Data Exch. Def T1222 + Line Def T1227): `code` (`KHAN_XLSX`, `GOLOMT_XLSX`, `GENERIC_CSV`), `preset_bank` (`KHAN`/`GOLOMT`/`TDB`/`XAC`/`STATE`/`GENERIC`), `file_type` (`CSV`/`XLSX`), `encoding` (анхдагч `UTF-8`; `windows-1251` зөвшөөрнө), `delimiter` (CSV-д заавал), `header_rows` (гарчгийн мөр хүртэлх мөрийн тоо; гарчгаар харгалзуулсан бол **хайх дээд хязгаар**, §5.8.2), `sheet_name`, `date_format` (.NET custom format, жишээ `yyyy.MM.dd`), `decimal_separator`, `thousand_separator`, `amount_mode` (`SIGNED` нэг багана / `DEBIT_CREDIT` хоёр багана), `negative_sign_identifier` (дүнгийн нүдний эхэнд эсвэл төгсгөлд байвал сөрөг гэж үзэх тэмдэгт мөр, жишээ `DR`, `Дт`, `-`).

**`bank.bank_statement_import_column`** (BC Column Def T1223 + Field Mapping T1225): `target_field` (`TRANSACTION_DATE`, `VALUE_DATE`, `AMOUNT`, `DEBIT_AMOUNT`, `CREDIT_AMOUNT`, `DESCRIPTION`, `COUNTERPARTY_NAME`, `COUNTERPARTY_ACCOUNT`, `PAYMENT_REFERENCE`, `TRANSACTION_ID`, `RUNNING_BALANCE`, `CURRENCY`), `column_no` **эсвэл** `column_header`, `data_format` (тухайн баганын огноо/тооны формат override), `multiplier` (анхдагч 1; −1 = тэмдэг эргүүлэх), `optional`.

**`bank.bank_statement`**: `statement_no`, `statement_date`, `period_from/to`, `opening_balance`, `closing_balance`, `import_format_id`, `file_name`, `file_sha256` (32 байт; давхар файл `ux_bank_statement__file`, `status <> 'DISCARDED'`), `status` (`IMPORTED` → `IN_RECONCILIATION` → `POSTED`; `DISCARDED`).

**`bank.bank_statement_line`**: `line_no` (10000, 20000, …), `transaction_date`, `value_date`, `amount` (тэмдэгтэй, дансны валютаар), `currency_code`, `description` (файлын эх текст), `transaction_text` (**нормчилсон хайлтын текст**, §6.10), `counterparty_name`, `counterparty_account`, `payment_reference`, `transaction_id`, `running_balance`, `dedupe_key` (§6.6; `ux_bank_statement_line__dedupe (company_id, bank_account_id, dedupe_key) WHERE status <> 'IGNORED'`), `status` (`NEW` → `MATCHED` → `POSTED`; `IGNORED`).

### 3.4 Тулгалт

**`bank.bank_reconciliation`** (BC T273): `bank_account_id`, `statement_no` (`UNIQUE (company_id, bank_account_id, statement_no)`), `statement_date`, `balance_last_statement` (нээхэд `bank_account.balance_last_statement`-аас хуулна, BR-BNK-65), `statement_ending_balance`, `bank_statement_id` (эхний импорт), `status` (`OPEN`/`POSTED`; `ux_bank_reconciliation__one_open` — данс бүрд нэг нээлттэй), `posted_at`, `posted_by`.

**`bank.bank_reconciliation_line`** (BC T274): `statement_line_no`, `bank_statement_line_id`, `transaction_date`, `value_date`, `description`, `transaction_text`, `related_party_name`, `related_party_account_no`, `payment_reference_no`, `transaction_id`, `statement_amount`, `applied_amount`, `difference` (generated = statement − applied), `applied_entries`, `account_type`/`account_id` (BLE байхгүй үед бичих зорилтот данс: G/L, харилцагч/нийлүүлэгч урьдчилгаа, мөнгөний данс), `match_confidence` (`NONE`/`LOW`/`MEDIUM`/`HIGH`/`HIGH_TEXT_TO_ACCOUNT`/`MANUAL`/`ACCEPTED`), `match_quality` (оноо).

**`bank.bank_rec_match`** (`match_no`, `match_confidence`, `score`, `rule_code`) ба **`bank.bank_rec_match_member`** (`member_type` = `STATEMENT_LINE` | `BANK_LEDGER_ENTRY`, `reconciliation_line_id` эсвэл `bank_ledger_entry_no`, `amount`): тулгалтын бүлэг — Σ мөр = Σ зорилт (BR-BNK-60). Мөр нэг бүлэгт л (`ux_bank_rec_match_member__line`).

**`bank.payment_application_proposal`** (BC T1294 + T1293): `reconciliation_line_id`, `account_type` (`CUSTOMER`/`VENDOR`/`GL_ACCOUNT`/`BANK_ACCOUNT`), `account_id`, `applies_to_entry_no` (CLE/VLE; NULL = урьдчилгаа/on account), `applied_amount` (**банкны тэмдгээр**: орлого +), `match_confidence`, `quality`, `rule_code` (§6.7.4), `accepted`.

**`bank.text_to_account_mapping`** (BC T1251): `line_no` (эрэмбэ), `mapping_text`, `debit_account_id` (орлого, дүн > 0), `credit_account_id` (зарлага, дүн < 0), `bal_source_type` (`GL_ACCOUNT`/`CUSTOMER`/`VENDOR`/`BANK_ACCOUNT`), `bal_source_id`. Seed: "ШИМТГЭЛ" → зарлага 8300; "ХАДГАЛАМЖИЙН ХҮҮ", "ХҮҮНИЙ ОРЛОГО" → орлого 8110.

**`bank.bank_account_statement`** + **`_line`** (BC T275/276 + T1295/1296; append-only): батлагдсан хуулгын агшин зураг — `balance_last_statement`, `statement_ending_balance`, `gl_balance_at_posting_date`, `outstanding_payments` (тулгагдаагүй зарлагын BLE-ийн нийлбэр, сөрөг), `outstanding_transactions` (тулгагдаагүй орлогын BLE, эерэг), мөр бүрийн `applied_entry_nos[]`, `applied_document_no`, `transaction_id`.

### 3.5 Валют (`050_fx.sql`, R2; схем R1-ээс бүрэн)

| Хүснэгт | Гол багана | Тайлбар |
|---|---|---|
| `fx.iso_currency` | `code`, `numeric_code`, `name`, `name_en`, `minor_units`, `symbol` | Глобал ISO 4217 лавлах (MNT, USD, EUR, CNY, RUB, KRW, JPY, GBP seed) |
| `fx.official_exchange_rate` | `currency_code`, `rate_date`, `rate_mnt` (1 нэгжид ногдох MNT), `source = 'MONGOLBANK'`, `fetched_at`, `source_reference`; `UNIQUE (source, currency_code, rate_date)` | Глобал (`tenant_id`-гүй), зөвхөн worker бичнэ |
| `fx.currency` | `code`, `iso_code`, `description`, `amount_rounding_precision` (USD 0.01, JPY/KRW 1), `unit_amount_rounding_precision`, `invoice_rounding_*`, `realized_gains/losses_account_id`, `unrealized_gains/losses_account_id` (NULL = `general_ledger_setup`-ийн анхдагч), `last_date_adjusted` (сүүлийн дахин үнэлгээний огноо, BR-FX-53), `blocked` | Компанийн валют (LCY мөр биш) |
| `fx.currency_exchange_rate` | `currency_id`, `starting_date`, `exchange_rate_amount` (= 1), `relational_exch_rate_amount` (= MNT), `adjustment_exch_rate_amount`, `relational_adjmt_exch_rate_amount` (**үргэлж эхний хоёртой ижил**, BR-FX-06), `source` (`MONGOLBANK`/`MANUAL`/`IMPORT`), `official_exchange_rate_id`; `UNIQUE (company_id, currency_id, starting_date)` | Компанийн ханш |
| `fx.exch_rate_adjmt_register` | `no`, `run_no`, `posting_date`, `document_no`, `account_type` (`CUSTOMER`/`VENDOR`/`BANK_ACCOUNT`), `posting_group_code`, `currency_code`, `currency_factor`, `adjusted_base` (Σ FCY), `adjusted_base_lcy` (Σ LCY өмнө), `adjusted_amt_lcy` (Σ delta), `transaction_no`, `gl_register_no` | BC T86, run × данс төрөл × бүлэг × валют бүрд нэг мөр |
| `fx.exch_rate_adjmt_ledger_entry` | `entry_no`, `register_no`, `posting_date`, `account_type`, `account_id`, `account_no`, `document_type/no` (дахин үнэлсэн entry-ийнх), `currency_code`, `currency_factor`, `base_amount` (FCY үлдэгдэл), `base_amount_lcy` (LCY үлдэгдэл өмнө), `adjustment_amount` (delta), `detailed_ledger_entry_no`, `ledger_entry_no` | BC T186, item бүрийн аудит |
| `gl.general_ledger_setup` | `cash_over_account_id` (8240), `cash_short_account_id` (8440), `realized_fx_gain/loss_account_id` (8500/8500), `unrealized_fx_gain/loss_account_id` (8510/8510) | Seed (D-G1, D-G3) |
| `party.cust/vendor_ledger_entry` | `currency_code`, `original_currency_factor` (posting-ийн ханш, өөрчлөгдөхгүй), `adjusted_currency_factor` (сүүлийн дахин үнэлгээний ханш; whitelist), `remaining_amount`, `remaining_amount_lcy` (кэш = Σ detailed) | R2 |
| `party.detailed_*_ledger_entry` | `entry_type` ∈ {`UNREALIZED_GAIN`, `UNREALIZED_LOSS`, `REALIZED_GAIN`, `REALIZED_LOSS`, `CORRECTION_OF_REMAINING_AMOUNT`, …}, `amount` (FCY; ханшийн мөрөнд **0**), `amount_lcy`, `exch_rate_adjmt_reg_no`, `application_no` | R2 |
| `party.customer/vendor_posting_group.appln_rounding_account_id` | 8290 | `CORRECTION_OF_REMAINING_AMOUNT`-ийн данс (R-CURRENCY-FX-30) |
| `gl.journal_line`, `sales.*_header`, `purchase.*_header` | `currency_code`, `currency_factor` (1 LCY-д ногдох FCY = BC Currency Factor) | §6.2 |
| `gl.gl_entry` | `source_currency_code`, `source_currency_amount` | R2: валютын posting-ийн FCY дүн (аудит) |

### 3.6 Бусад хэрэглэх хүснэгт

| Хүснэгт | Хэрэглээ |
|---|---|
| `platform.company_setup` | `amount_rounding_precision` (`p_LCY`), `lcy_code = 'MNT'`, `legal_name`, `tin`, `registration_no` (МХ маягтын толгой), `time_zone` |
| `platform.number_series(_line, _counter)` | `KO`/`KZ` (касс бүрд), `BR`/`BP` (банк, хэтэвч), `GJ` (кассын тооллого), `FXA` (дахин үнэлгээ — seed хүсэлт SCR-FX-04) |
| `gl.journal_template`/`journal_batch` | `CASH_RECEIPT/BANK` → `BR`, `CASH_RECEIPT/CASH` → `KO`, `PAYMENT/BANK` → `BP`, `PAYMENT/CASH` → `KZ` (05 §5.4) |
| `party.payment_method` | `CASH` → `CASH01`, `BANK` → `BANK01`, `CARD` → картын WALLET, `QPAY` → QPay WALLET (`bal_account_type = 'BANK_ACCOUNT'`) |
| `party.vendor_bank_account` | Нийлүүлэгчийн данс → харьцагчийг танихад (§5.9.3) |
| `integration.job_definition` / `job_run` | `fx.mongolbank_rates` (`SYSTEM`, `max_attempts = 5`) |
| `integration.outbox` | §9 |
| `platform.reason_code` | `CASH_DIFF` (кассын тооллого), `REVERSAL` |

### 3.7 Схемийн дутуу зүйл (дэлгэрэнгүйг §12)

1. Харилцагчийн банкны данс хадгалах хүснэгт байхгүй → хуулгын `counterparty_account`-аар харилцагчийг "Бүрэн" таних боломжгүй (GS-REC-001 L1 HIGH) → **SCR-BNK-01**.
2. Батлагдсан хуулгыг буцаасныг тэмдэглэх багана `bank.bank_account_statement`-д байхгүй (append-only, `UNIQUE statement_no`) → **SCR-BNK-02**.
3. "Нэг G/L данс = нэг мөнгөний данс" (FR-BNK-001 AC2)-ийг DB хамгаалдаггүй → **SCR-BNK-03**.
4. Баримт/entry-д MNT ханш биш зөвхөн `currency_factor` хадгалагддаг → дунд цэгийн (midpoint) бөөрөнхийлөлт алдагдана (§6.2) → **SCR-FX-01**.
5. Банкны дахин үнэлгээний дансны сонголт → **SCR-FX-02**.

---

## 4. Бизнесийн дүрмүүд

Дүрэм бүр нэг тестээр шалгагдана (§11). "Эх" баганад DECISIONS, FR, судалгааны дүрмийн ID-г заав.

### 4.1 Мөнгөний данс (BR-BNK-01..09)

| ID | Дүрэм | Эх |
|---|---|---|
| BR-BNK-01 | `kind` нь үүсгэсний дараа өөрчлөгдөхгүй, хэрэв BLE байвал (`bank.account_has_entries`). | D-G1, R-BANK-CASH-01 |
| BR-BNK-02 | Мөнгөний данс бүр өөрийн `bank_account_posting_group`-тэй; тэр бүлгийн `gl_account_id` нь өөр ямар ч мөнгөний дансны бүлэгт ашиглагдаагүй, `account_type = 'POSTING'`, `direct_posting = false` байна. Зөрвөл `bank.gl_account_in_use`. | FR-BNK-001 AC2, R-BANK-CASH-06, SCR-BNK-03 |
| BR-BNK-03 | `iban` өгвөл: `MN`-ээр эхэлсэн бол яг 20 тэмдэгт, ISO 13616 mod-97 = 1; бусад улсын IBAN ≤ 34 тэмдэгт, mod-97. Буруу бол `bank.iban_invalid`. `bank_account_no` нь зөвхөн тоо ба зураас (≤ 30). | I-10, 02 §9.4 |
| BR-BNK-04 | `currency_code`-ийг зөвхөн тухайн дансны `balance = 0`, `balance_lcy = 0` ба `open = true` BLE байхгүй үед солино (`bank.account_currency_locked`). R1-д `currency_code` заавал NULL (`gl.currency_not_enabled`). | R-BANK-CASH-01, FR-FX-001 |
| BR-BNK-05 | `CASH` данс `cash_receipt_no_series_id` ба `cash_payment_no_series_id`-тэй байна; тэдгээр нь `gapless = true`, `reset_yearly = true`, `manual_nos = false` цуврал. Касс бүр өөрийн цувралтай (D-C7, seed `KO`/`KZ`; хоёр дахь касс нэмэхэд wizard `KO2`/`KZ2` үүсгэнэ). | D-C7 ⚠, FR-BNK-002 |
| BR-BNK-06 | BLE-тэй мөнгөний дансыг устгахгүй, зөвхөн `blocked = true` (`api.resource_in_use`). | R-BANK-CASH-09, D-I3 |
| BR-BNK-07 | `prevent_negative_balance`-ийг `CASH` дансанд `false` болгох оролдлогыг үл тооно (UI засагдахгүй, API 422 `bank.cash_negative_not_allowed`); DB trigger `kind = 'CASH'`-ийг үргэлж шалгадаг. | D-G1, 15 S-BNK-02 |
| BR-BNK-08 | `match_tolerance_value`: `PERCENTAGE` бол 0..99; `AMOUNT` бол ≥ 0, дансны валютын нарийвчлалаар. | R-BANK-CASH-36 |
| BR-BNK-09 | `WALLET` дансны `bank_account_no` нь хэтэвчийн merchant/terminal ID байж болно (IBAN-гүй); хуулга импорт зөвшөөрнө (QPay тооцооны тайлан). | D-G2 |

### 4.2 Мөнгөний posting (BR-BNK-10..16)

| ID | Дүрэм | Эх |
|---|---|---|
| BR-BNK-10 | Posting-ийн өмнө (түгжээний дор): мөнгөний данс `blocked = false`, posting group ба G/L данстай. Эс бөгөөс `bank.account_blocked` / `bank.posting_group_missing`. | R-BANK-CASH-02 |
| BR-BNK-11 | Валютын нийцэл: (a) мөрийн валют NULL → данс LCY байна; (b) данс FCY → мөрийн валют = дансны валют; (c) данс LCY, мөр FCY (R2) → BLE `amount = amount_lcy`. Зөрвөл `bank.account_currency_mismatch`. | R-BANK-CASH-03, R-CURRENCY-FX-11 |
| BR-BNK-12 | `BankLedgerLine` бүр яг нэг BLE ба мөнгөний дансны G/L данс руу нэг G/L мөр (`amount_lcy` ижил, ижил `transaction_no`) үүсгэнэ. BLE: `remaining_amount = amount`, `open = (amount ≠ 0)`, `positive = (amount > 0)`, `statement_status = 'OPEN'`. | R-BANK-CASH-04, 06 |
| BR-BNK-13 | Мөнгөний дансны G/L данс (1100–1121) руу `GL_ACCOUNT` төрлийн мөрөөр шууд бичихийг хориглоно (`gl.direct_posting_not_allowed`); зөвхөн `BANK_ACCOUNT` төрлийн мөр/тал. | Z-BNK-02, FR-GL-003 |
| BR-BNK-14 | Invariant (шөнийн шалгалт, 02 §8.8): мөнгөний данс бүрд Σ BLE `amount_lcy` = G/L дансны үлдэгдэл (бүх огноо). LCY дансанд мөн Σ `amount` = G/L. | R-BANK-CASH-06 |
| BR-BNK-15 | Үлдэгдэл огноогоор: `balance_at(D)` = Σ `amount` (`posting_date ≤ D`); `balance_lcy_at(D)` = Σ `amount_lcy`. Хадгалсан үлдэгдлийн багана байхгүй. | R-BANK-CASH-07 |
| BR-BNK-16 | `document_type`: харилцагчаас орлого, нийлүүлэгчид зарлага = `PAYMENT`; харилцагчид буцаан олгох, нийлүүлэгчээс буцаан авах = `REFUND`; G/L ба шилжүүлэг = `NONE`. | R-BANK-CASH-32 |

### 4.3 Кассын баримт ба сөрөг үлдэгдэл (BR-BNK-20..29)

| ID | Дүрэм | Эх |
|---|---|---|
| BR-BNK-20 | `CASH` дансны BLE бүрд (буцаалт, эхний үлдэгдэл `OPENING`, кассын тооллого `CASHCOUNT`, ханшийн тэгшитгэл `EXCHRATADJ`-аас бусад) яг нэг `posted_cash_voucher` үүснэ: `amount > 0` → `RECEIPT` (МХ-1), `< 0` → `PAYMENT` (МХ-2), `amount` = \|BLE.amount\|. | D-A4, FR-BNK-002/003, 05 §5.4.4 |
| BR-BNK-21 | Дугаар: ваучерын `document_no` нь тухайн кассын тухайн чиглэлийн цувралаас олгогдсон бол (CASH batch, `POST /payments`) **тэр дугаарыг** ашиглана; эс бөгөөс (бэлэн борлуулалт `SI-…`, бэлэн худалдан авалт `PI-…`) кассын цувралаас **тусдаа** завсаргүй дугаар posting transaction дотор олгоно. Нэг ваучерт нэг касс, нэг чиглэлийн хэд хэдэн BLE байвал эхнийх нь (мөрийн дарааллаар) ваучерын дугаарыг, бусад нь шинэ дугаар авна. | D-C7, 06 BR-SAL-54, 07 BR-PUR-74 |
| BR-BNK-22 | `counterparty_name` (1..200) ба `purpose` (1..250) заавал. Эх сурвалж: хүсэлтийн `cashVoucher` → эс бөгөөс харьцагчийн нэр ба "{баримтын төрөл} {дугаар}" (06/07). | FR-BNK-002, CashVoucherInput |
| BR-BNK-23 | **МХ-2**-т `counterparty_id_doc` заавал: хүсэлтийн `counterpartyIdDocument ?? vendor.tin ?? vendor.registration_no ?? customer.tin ?? customer.registration_no`; бүгд хоосон бол `bank.cash_voucher_required` (422). МХ-1-д сонголттой. | FR-BNK-003 AC2, 07 BR-PUR-74, BR-AP-66 |
| BR-BNK-24 | `amount_in_words` нь §6.9-ийн алгоритмаар posting үед үүсч хадгалагдана; дахин хэвлэхэд хадгалсан утгыг хэвлэнэ. | REQ-ACC-04, REQ-ACC-15 |
| BR-BNK-25 | **Касс сөрөг болохгүй:** `kind = 'CASH'` (эсвэл `prevent_negative_balance`) дансны хувьд posting-ийн дараа `posting_date`-ээс хойших **өдөр бүрийн** хуримтлагдсан үлдэгдэл (Σ `amount`, дансны валютаар) ≥ 0 байна. Апп түгжээний дор урьдчилж шалгана (`bank.cash_negative_balance`, `available`, `shortfall` талбартай); DB нь COMMIT-д `ERC01`-ээр баталгаажуулна. | D-G1, FR-BNK-003 AC1, 910 `fn_check_non_negative_cash` |
| BR-BNK-26 | Хоцорсон огноотой кассын баримт: цувралын `date_order = true` нь ижил цуврал дахь сүүлийн дугаарын огнооноос өмнөх огноог хүлээн авахгүй (`platform.number_series_date_order`, ERN02). | D-C7, GS-CASH-005 |
| BR-BNK-27 | `min_balance > 0` бөгөөд posting-ийн дараах үлдэгдэл < `min_balance` бол анхааруулга `W-BNK-01` (батлахыг зогсоохгүй). | Z-BNK-01 |
| BR-BNK-28 | Кассын баримт ноороггүй, нэг командаар батлагдана (`POST /payments`); preview нь `POST /payments:preview` (дугаар `***`). | 14 §15.4, 15 Z-UI-11 |
| BR-BNK-29 | `posted_cash_voucher` ба BLE-ийн буцаалтаар шинэ МХ үүсэхгүй; эх МХ хэвлэмэл дээр "БУЦААГДСАН {огноо}, {буцаалтын дугаар}" тэмдэг гарна (`bank_ledger_entry.reversed`-ээс). | 05 §буцаалт |

### 4.4 Шилжүүлэг, кассын тооллого, хэтэвч (BR-BNK-30..36)

| ID | Дүрэм | Эх |
|---|---|---|
| BR-BNK-30 | Данс хоорондын шилжүүлэг (`partyType = BANK_ACCOUNT`) нь **нэг** G/L transaction: хүлээн авах данс Дт, илгээх данс Кт, хоёр BLE. Хоёр данс ижил бол `bank.transfer_same_account`. | FR-BNK-007 AC1 |
| BR-BNK-31 | Шилжүүлгийн ваучерын дугаар: хүлээн авах данс CASH бол түүний `KO`; эс бөгөөс илгээх данс CASH бол түүний `KZ`; бусад тохиолдолд илгээх дансны `BP`. Нөгөө тал CASH бол түүний МХ-ийг BR-BNK-21-ээр тусдаа дугаартай үүсгэнэ. Source code: CASH оролцвол `CASHVOUCHER`, эс бөгөөс `PAYMENTREG`. | GS-CASH-003, GS-CASH-005 |
| BR-BNK-32 | Өөр валютын хоёр данс хоорондын шилжүүлэг (R2, валют арилжаа): илгээх FCY тал = `rc(FCY)`, LCY = `r(FCY × rate_D)` (албан ханш); хүлээн авах MNT тал = хэрэглэгчийн өгсөн бодит MNT дүн (`counterAmount`); зөрүү → хэрэгжсэн ханшийн зөрүүний данс (8500). | R-CURRENCY-FX-11, P16 |
| BR-BNK-33 | Кассын тооллого (`:count-cash`): `difference = counted − balance_at(countDate)`. `< 0` → `cash_short_account` (8440) Дт / касс Кт; `> 0` → касс Дт / `cash_over_account` (8240) Кт; `= 0` → posting хийхгүй (`posting = null`). Ваучер `GJ` цуврал, source `CASHCOUNT`, шалтгаан `CASH_DIFF`, МХ үүсэхгүй. `countDate` ≤ өнөөдөр, нээлттэй үе. Данс нь CASH биш бол `bank.not_cash_account`. | D-G1, FR-BNK-004, GS-CASH-004 |
| BR-BNK-34 | QPay/картын төлбөрийн хэлбэр (`QPAY`, `CARD`) нь `bal_account_type = 'BANK_ACCOUNT'` WALLET дансыг заана; бэлэн бус тул МХ үүсэхгүй; eBarimt `payments[].code` = `BANK_TRANSFER_QPAY` / `PAYMENT_CARD`. | D-G2, FR-BNK-017, I-11 |
| BR-BNK-35 | **Хэтэвчийн тооцоо** (`:settle-wallet`): сонгосон нээлттэй WALLET BLE-үүдийн Σ = `gross`; `fee = gross − net ≥ 0`. Нэг transaction: банк Дт `net`, шимтгэлийн данс (анхдагч 8300) Дт `fee`, WALLET Кт `gross`. Сонгосон WALLET BLE-үүд ба шинэ WALLET BLE (−gross) шууд хаагдана (`statement_status = 'CLOSED'`, `statement_no` = тооцооны ваучерын дугаар, `closed_at_date` = тооцооны огноо). Банкны шинэ BLE нээлттэй үлдэж хуулгаар тулгагдана. | FR-BNK-017 AC1, GS-CASH-006 |
| BR-BNK-36 | Хэтэвчийн тооцоонд `fee < 0` (банкинд орсон нь их) бол `bank.wallet_settlement_invalid`; шимтгэлийн НӨАТ нь шимтгэлийн дансны VAT тохиргоогоор (анхдагч EXEMPT; ⚠ OQ-BNK-04). | FR-BNK-017 |
