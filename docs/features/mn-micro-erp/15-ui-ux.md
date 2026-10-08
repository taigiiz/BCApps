# 15. UI/UX тодорхойлолт — мэдээллийн архитектур, role-ийн нүүр хуудас, дэлгэц, харилцан үйлчлэлийн дүрэм

> **Төлөв:** Хөгжүүлэлтэд бэлэн, adversarial хяналт хийгдсэн (24 засвар, төгсгөлийн "Хяналтын тэмдэглэл"). (draft-2: [14-api.md](./14-api.md) §2, §8, §15–16, [api/openapi.yaml](./api/openapi.yaml), [12](./12-ebarimt-integration.md) §18.1, seed-ийн данс/цуврал/эрхтэй тулгасан). **Огноо:** 2026-10-07. **Хамрах хүрээ:** `web/` SPA (React + TypeScript + AG Grid Community), BFF-ийн UI-тэй холбоотой зан төлөв, хэвлэх ба имэйлийн UI.
> **Эх сурвалж (давамгайлах дарааллаар):** [DECISIONS.md](./DECISIONS.md) (D-A4, D-C1..C7, D-D3, D-D5, D-E4, D-E5, D-F5..F7, D-G1, D-G2, D-I1..I3, D-J1..J4, D-K1) → [db/schema/*.sql](./db/schema/) (**нэрийн цорын ганц эх сурвалж**, D-K1) → [13-security-audit-tenancy.md](./13-security-audit-tenancy.md) §5–§6, §10.4 (эрх, step-up, маск) → [12-ebarimt-integration.md](./12-ebarimt-integration.md) §3, §9.4, §11, §13, §14 → [01-requirements.md](./01-requirements.md) (FR, NFR-060..072, NFR-080, NFR-120..121) → [02-architecture.md](./02-architecture.md) §5.3, §6.7, §6.10, §8.5–8.6, §10.1–10.3, §13 → [ADR-0006](./adr/ADR-0006-money-and-rounding.md), [ADR-0015](./adr/ADR-0015-frontend-react-ag-grid.md), [ADR-0016](./adr/ADR-0016-auth-openiddict-bff.md), [ADR-0017](./adr/ADR-0017-i18n-mongolian-first.md) → [18-dev-setup.md](./18-dev-setup.md) §2.1, §3.4–3.5 → [03-domain-model.md](./03-domain-model.md) §6 → [99-glossary.md](./99-glossary.md) → судалгаа [bc-platform-security-api.md](./research/bc-platform-security-api.md) (§1, §7: Profile/Role Center = "SKIP (role dashboards)" — UI-д өөрсдийн хялбар хувилбараар).
> **BC-ийн UI эх сурвалж (BCApps repo, MIT):** Role Center: page 9022 "Business Manager Role Center", page 9027 "Accountant Role Center", page 9020 "Small Business Owner RC"; cue: table 1313 "Activities Cue", table 9054 "Finance Cue", page 1310 "O365 Activities", codeunit 1311 "Activities Mgt." (хугацаа хэтэрсэн авлага = `Open AND Due Date < Today`); cue-ийн өнгө: System Application table 9701 "Cue Setup" (Threshold 1/2, Low/Middle/High Range Style), enum 9701 "Cues And KPIs Style" (None, Favorable, Unfavorable, Ambiguous, Subordinate); headline: page 1442 "Headline RC Accountant". BC-ийн гарын товчлол: Microsoft Learn "Keyboard shortcuts" (2026-10-06-нд уншсан).
> **Модуль тус бүрийн spec:** draft-2 бичигдэх үед 05–10 байхгүй байсан тул дэлгэцийн талбар ба дүрмийг schema, FR, 12/13/14-өөс гаргасан. Хяналтын үед (2026-10-07) [05-posting-engine.md](./05-posting-engine.md), [06-sales-receivables.md](./06-sales-receivables.md), [08-tax-vat-mn.md](./08-tax-vat-mn.md), [11-fixed-assets-inventory.md](./11-fixed-assets-inventory.md) гарсан; 06 §3.3 (`ebarimt_receipt_type` NULL = автомат) ба BR-SAL-34 (`vat_date`)-тай тулгасан. Бусад тулгалт OQ-UI-20.

---

## Агуулга

0. [Энэ баримтыг хэрхэн унших](#0-энэ-баримтыг-хэрхэн-унших)
1. [Хамрах хүрээ ба UX зарчим](#1-хамрах-хүрээ-ба-ux-зарчим)
2. [Мэдээллийн архитектур (IA) ба навигаци](#2-мэдээллийн-архитектур-ia-ба-навигаци)
3. [Role-ийн нүүр хуудас (home) ба cue](#3-role-ийн-нүүр-хуудас-home-ба-cue)
4. [Хуудасны төрөл ба ерөнхий бүтэц](#4-хуудасны-төрөл-ба-ерөнхий-бүтэц)
5. [Баримтын хуудасны зан төлөв](#5-баримтын-хуудасны-зан-төлөв)
6. [Хүснэгт (AG Grid) ба гараар оруулах](#6-хүснэгт-ag-grid-ба-гараар-оруулах)
7. [Тоо, огноо, мөнгөний формат (mn-MN)](#7-тоо-огноо-мөнгөний-формат-mn-mn)
8. [Баталгаажуулалт ба алдаа харуулах](#8-баталгаажуулалт-ба-алдаа-харуулах)
9. [Хоосон төлөв (empty state)](#9-хоосон-төлөв-empty-state)
10. [Onboarding: компани тохируулах wizard ба эхлэх алхмууд](#10-onboarding-компани-тохируулах-wizard-ба-эхлэх-алхмууд)
11. [Хүртээмж (WCAG 2.2 AA)](#11-хүртээмж-wcag-22-aa)
12. [Responsive ба мобайл](#12-responsive-ба-мобайл)
13. [Design token ба компонент](#13-design-token-ба-компонент)
14. [i18n түлхүүрийн дүрэм](#14-i18n-түлхүүрийн-дүрэм)
15. [Дэлгэцийн жагсаалт (screen inventory)](#15-дэлгэцийн-жагсаалт-screen-inventory)
16. [Wireframe ба дэлгэц тус бүрийн дүрэм (10 дэлгэц)](#16-wireframe-ба-дэлгэц-тус-бүрийн-дүрэм-10-дэлгэц)
17. [Хүлээн авах тест](#17-хүлээн-авах-тест)
18. [Schema өөрчлөлтийн хүсэлт (SCR-UI)](#18-schema-өөрчлөлтийн-хүсэлт-scr-ui)
19. [Нээлттэй асуулт (OQ-UI)](#19-нээлттэй-асуулт-oq-ui)
20. [Шаардлагын уялдаа (FR/NFR → дэлгэц, дүрэм)](#20-шаардлагын-уялдаа-frnfr--дэлгэц-дүрэм)
- [Хяналтын тэмдэглэл (Review log)](#хяналтын-тэмдэглэл-review-log)

---

## 0. Энэ баримтыг хэрхэн унших

### 0.1 Нэр томьёо

Монгол нэрийг UI-д хэрэглэнэ. Англи нэрийг анх удаа хаалтад бичив. BC-ийн нэрийг харьцуулах зорилгоор өгөв.

| Монгол (UI) | English | BC | Тайлбар |
|---|---|---|---|
| Нүүр хуудас | Home page, role home | Role Center (`PageType = RoleCenter`) | Role бүрийн эхлэх хуудас (§3) |
| Товч үзүүлэлт (cue) | Cue | Cue (Activities part) | Тоо эсвэл дүн бүхий хавтан. Дарахад шүүсэн жагсаалт нээгдэнэ |
| Гол үзүүлэлт (KPI) | KPI tile | Finance Performance, KPI | Том тоо + чиг хандлага |
| Мэдээний мөр | Headline | Headline RC | Мэндчилгээ ба нэг санамж |
| Жагсаалт | List page | List | Олон мөр. Мөр дарахад карт нээгдэнэ |
| Карт | Card page | Card | Нэг мастер бичлэг (харилцагч, данс) |
| Баримт | Document page | Document | Толгой + мөр + нийлбэр (нэхэмжлэх, кассын баримт) |
| Ажлын хуудас | Worksheet | Worksheet (journal) | Мөр оруулж бөөнөөр батлах (журнал, тулгалт) |
| Тайлан | Report (request + viewer) | Report + request page | Шүүлтүүрийн самбар + үр дүн |
| Wizard | Wizard (assisted setup) | NavigatePage | Алхам алхмаар (тохируулах, импорт) |
| Үйлдлийн мөр | Action bar | Action bar (Promoted actions) | Хуудасны дээд хэсгийн товчнууд |
| Хажуугийн самбар | FactBox pane | FactBox | Холбоотой мэдээлэл (үлдэгдэл, eBarimt, хавсралт) |
| Хэсэг | Field group | FastTab | Эвхэгддэг талбарын бүлэг |
| Мөрүүд | Lines part | Lines subpage | Баримтын мөрийн хүснэгт |
| Төлөвийн тэмдэг | Status badge | Status field, Style | Өнгө + текст + дүрс (зөвхөн өнгө биш) |
| Мэдэгдэл (toast) | Toast | Notification (message bar) | Түр харагдах амжилтын мессеж |
| Тууз (banner) | Banner | Notification bar | Байнгын төлөвийн мэдэгдэл (support хандалт, түгжигдсэн үе) |
| Бүртгэлийн огноо | Posting date | Posting Date | `posting_date`. Ledger-ийн огноо |
| Баримтын огноо | Document date | Document Date | `document_date` |
| Төлөх огноо | Due date | Due Date | `due_date` |
| НӨАТ-ын огноо | VAT date | VAT Reporting Date | `vat_date` (D-E9) |
| Ажлын огноо | Work date | Work Date | Шинэ баримтын анхдагч бүртгэлийн огноо. Зөвхөн session-д (§7.4) |
| Батлах | Post | Post (F9) | Ledger-т бичих. Буцаахгүй |
| Батлахын өмнө харах | Preview posting | Preview Posting | Ижил код + ROLLBACK (02 §6.7) |
| Бичилт хайх | Find entries | Navigate / Find Entries | Баримтын дугаар + огноогоор бүх бичилт |
| Хайх | Search ("Tell me") | Tell Me (Alt+Q) | Хуудас, үйлдэл, бичлэг хайх |

### 0.2 Дүрмийн ID

| Төрөл | Хэлбэр | Жишээ |
|---|---|---|
| Дүрэм | `UX-<ХЭСЭГ>-<NN>` | `UX-GRID-07`, `UX-POST-03` |
| Дэлгэц | `S-<МОДУЛЬ>-<NN>` | `S-SAL-02` (борлуулалтын нэхэмжлэх) |
| Cue | `CUE-<NN>` | `CUE-06` (eBarimt алдаа) |
| UI-ийн алдааны код | `ui.<snake_case>` | `ui.amount_precision_exceeded` |
| Хүлээн авах тест | `AT-UI-<NN>` | `AT-UI-12` |
| Schema өөрчлөлтийн хүсэлт | `SCR-UI-<NN>` | `SCR-UI-03` |
| Нээлттэй асуулт | `OQ-UI-<NN>` | `OQ-UI-05` |

Хэсгийн код: `NAV` (навигаци), `HOME`, `PAGE`, `SAVE`, `DOC`, `POST`, `PRN` (хэвлэх), `MAIL`, `EBR` (eBarimt UI), `GRID`, `FMT`, `VAL`, `EMPTY`, `ONB`, `A11Y`, `RESP`, `TOK` (token), `I18N`, `SEC` (UI-ийн аюулгүй байдал), мөн дэлгэцийн: `SAL`, `CASH`, `REC`, `JNL`, `COA`, `CUST`, `TB`, `VAT`, `WIZ`.

"Заавал" = MUST, "Зөвлөмж" = SHOULD. Хүлээн авах тестийн түлхүүр үг: **Өгөгдсөн нь** (Given), **Хэрэв** (When), **Тэгэхэд** (Then), **Мөн** (And) (01 §1.5).

### 0.3 Баримтуудын зөрүүг шийдсэн байдал

| # | Зөрүү | Энэ баримтын шийдвэр | Үндэслэл |
|---|---|---|---|
| Z-UI-1 | Командын зам: D-I1 `POST /sales-invoices/{id}:post`; 02 §5.3 ба 18 §3.4 `…/{id}/post`, `…/post-preview` | [14-api.md](./14-api.md) §2.5-ыг дагана: `:post`, `:preview`, `:cancel`, `:copy`, `:send`, `:release`, `:reopen`. Ноорог ба батлагдсан баримт нэг resource (`sales-invoices`), id тогтвортой (14 API-URL-10) | DECISIONS, 14-api |
| Z-UI-2 | 02 §10.2-т 7 role; 13 §6.5-д 5 built-in role | 5 built-in role (`OWNER`, `ACCOUNTANT`, `EXTERNAL_ACCOUNTANT`, `SALES_CLERK`, `VIEWER`). Custom role-ийн нүүрийг эрхээр сонгоно (§3.1) | D-I2, 13 Z2 |
| Z-UI-3 | Үеийн төлөв: 02 §6.9-д 4 төлөв | `OPEN` / `CLOSED` / `LOCKED` (schema `gl.accounting_period`) | D-D3, 13 Z3 |
| Z-UI-4 | 00-overview P4: борлуулагч буцаалт хийнэ; 13 CR-23: `sales.creditmemo.post`-ийг `ERP_SALES_RETURN` руу шилжүүлж, `SALES_CLERK`-д өгөхгүй | UI нь эрхийг дагана: `SALES_CLERK`-д "Кредит нот" товч харагдахгүй. Бизнесийн шийдвэрийг OQ-UI-01 | 13 §6.4–6.6 |
| Z-UI-5 | eBarimt-ийн шийдвэрийн эрх: 12 §11.1-д `ebarimt.document.resolve`; seed ба 13 §6.3-т `ebarimt.unknown.resolve` | Seed-ийн нэр `ebarimt.unknown.resolve` | D-K1 (db/ = нэрийн эх) |
| Z-UI-6 | Тооны формат: ADR-0017 "өөрсдийн formatter, браузерийн ICU-д найдахгүй"; 18 §3.5 "`Intl`-ээр `mn-MN`-ээр форматлана" | Өөрсдийн `formatDecimal` (§7.2). `Intl.NumberFormat`-ийг mn-MN locale-оор хэрэглэхгүй. 18 §3.5-ыг засах санал (OQ-UI-02) | ADR-0017 #4 |
| Z-UI-7 | 03 §6.3: `ERROR → PENDING`; 12 STM-03: хэрэглэхгүй, клон баримт | UI "Засаад дахин илгээх" нь шинэ баримт (клон) үүсгэнэ | 12 §9.3 |
| Z-UI-8 | 00-overview §11.1 файлын жагсаалтад `17-api-ui.md`; энэ ажлын файл `15-ui-ux.md` | UI/UX энд. REST гэрээ API-ийн spec-д | Ажлын хуваарь |
| Z-UI-9 | API-ийн enum утга: 18 §3.4 camelCase (`"posted"`); 010_platform.sql тайлбар ба 14 §0.2 #2: UPPER_SNAKE | UPPER_SNAKE (14-api). i18n түлхүүрт API-ийн утгыг **өөрчлөлтгүй** хэрэглэнэ (§14.3) | 14-api |
| Z-UI-10 | Эрхийн нэр: 14-api §15 (`sales.credit_memo.post`, `tax.vat_period.close/submit`, `ebarimt.document.resolve`, `sales.document.print`, `rpt.ar_aging`) ба seed/13 (`sales.creditmemo.post`, `tax.vat.settle`, `tax.vat_return.submit`, `ebarimt.unknown.resolve`, `rpt.customer_aging`) зөрүүтэй | UI эрхийн нэрийг хатуу бичихгүй: цэс/товчийн нөхцөлийг `me/permissions`-ийн хариугаар, каталогийн тогтмолоос (`permissions.catalog.json`, 13 §6.3) үүсгэнэ. Энэ баримтад seed-ийн нэр (D-K1). Нэгтгэх: OQ-UI-23 | D-K1 |
| Z-UI-11 | Кассын баримтын ноорог: энэ баримтын эхний хувилбар журналын мөрөөр ноорог хадгалахаар бичсэн; 14-api §15.4 `POST /payments` (`cashVoucher` объекттой) — **ноорог үүсэхгүй** | 14-api-г дагана: МХ-1/МХ-2 нь санах ой дахь форм → `:preview` → нэг командаар батлах (§16.3). Ноорогоор хадгалах хэрэгцээ OQ-UI-22; SCR-UI-10 нь зөвхөн тэр асуултын хариу "тийм" бол | 14-api |
| Z-UI-12 | Төлбөрийн төлөв: энэ баримтын эхний хувилбарт API `OVERDUE`, `CORRECTIVE` буцаана гэж бичсэн; 14 API-ACT-19 `paymentStatus` ∈ {`PAID`, `UNPAID`, `PARTIALLY_PAID`}, `status` ∈ {`DRAFT`, `RELEASED`, `POSTED`, `CANCELLED`}, кредит нотод `isCancellation` | API-ийн утгыг дагана. "Хугацаа хэтэрсэн" нь **харуулалтын** дүрэм: `paymentStatus ≠ PAID ∧ dueDate < D` (UB-ийн өнөөдөр); мөнгөн дүн тооцохгүй тул UXP-04-ийг зөрчихгүй (§5.1) | 14 §8.4 |
| Z-UI-13 | Журналын resource: эхний хувилбарт `journal-batches`; 14 §2.2 ба §15.2-т `journals` (= `gl.journal_batch`) | `POST …/journals/{id}:post` (`expectedLineCount`-тэй, API-ACT-07) | 14-api |
| Z-UI-14 | eBarimt-ийн UI төлөв: 12 §9.4 монгол шошгоор, 14 API-ACT-20 `ebarimt.chainStatus` enum-аар | UI нь `chainStatus`-ийн утгыг (`NOT_REQUIRED` … `VOIDED`) i18n `enums.ebarimtChainStatus.*`-ээр харуулна (§5.8) | 14 §8.4, 12 §9.4 |
| Z-UI-15 | PII задлах эрх: seed `mn_60_security.sql` нь `ACCOUNTANT`, `EXTERNAL_ACCOUNTANT`-д `ERP_PII_UNMASK` олгодог; 13 §6.5–6.6 (CR-23-ын дараах норматив матриц) зөвхөн `OWNER`-т | UI эрхийг хатуу бичихгүй (`me/permissions`); хүлээн авах тест (AT-UI-44) аль ч хувилбарт `platform.pii.unmask`-гүй `VIEWER`-ийг хэрэглэнэ. Нэгтгэх нь OQ-UI-23 | D-K1, 13 CR-23 |
| Z-UI-16 | Экспорт: эхний хувилбарт "≤ 10 000 мөр синхрон Excel"; 14 API-JOB-01 — экспорт үргэлж async (`POST /reports/{code}:export` → 202), синхрон тайлан > 5 000 мөр бол `422 api.result_too_large` | 14-ийг дагана (UX-PAGE-18) | 14 §10 |

---

## 1. Хамрах хүрээ ба UX зарчим

### 1.1 Хамрах хүрээ

| Чадвар | R1 | R2 | R3 |
|---|:-:|:-:|:-:|
| App shell, компани солих, хайх (Alt+Q), бичилт хайх (Navigate) | ✔ | | |
| Role-ийн нүүр: Owner, Accountant/External accountant, Sales clerk, Viewer | ✔ | | |
| Cue-ийн босгыг хэрэглэгч тохируулах (BC Cue Setup) | | ✔ | |
| Жагсаалт, карт, баримт, ажлын хуудас, тайлан, wizard | ✔ | | |
| Гараар бүрэн ажиллах (BC-ийн товчлол) | ✔ | | |
| Excel-ээс хуулж буулгах (paste) журналд ба баримтын мөрөнд | ✔ | | |
| Хадгалсан харагдац (saved view), дуртай данс (My Accounts) | | ✔ | |
| Компани тохируулах wizard, eBarimt wizard, Excel импорт, хуулга импорт | ✔ | | |
| Desktop ≥ 1280 px бүрэн; tablet ≥ 768 px Sales clerk-ийн урсгал | ✔ | | |
| Утас (< 768 px): унших урсгал (NFR-080) | ✔ | | |
| Утас (< 768 px): Sales clerk-ийн оруулах урсгал (бэлэн борлуулалт, МХ-1) | ✔ (Should, OQ-UI-14) | | |
| Мобайл апп | | | ✔ |
| Харанхуй горим (dark mode) | | ✔ | |
| Тенант хоорондын нэгдсэн самбар (гэрээт нягтлан, BC Company Hub) | | | ✔ |

### 1.2 UX зарчим

| ID | Зарчим | Практикт | Эх |
|---|---|---|---|
| UXP-01 | **Баримт эхэнд.** | Цэс нь баримтаар эхэлнэ (Борлуулалт, Мөнгө). Гар журнал "Санхүү" хэсэгт | PP-02 |
| UXP-02 | **Гар эхэнд.** | BC-ийн товчлол (F9, Alt+N, F8, Ctrl+Insert …) ажиллана. Хулгана заавал биш | NFR-071 |
| UXP-03 | **Тайлбарлагдах.** | Батлахын өмнө харах, сонгогдсон данс, тулгалтын шалтгаан ба оноо харагдана | PP-07 |
| UXP-04 | **Сервер бол үнэн.** | Эцсийн нийлбэрийг сервер гаргана. UI эрхгүй товчийг нууна, гэхдээ шалгалтыг сервер хийнэ | ADR-0015, FR-PLT-005 |
| UXP-05 | **Устгахгүй, буцаана.** | Батлагдсан баримтад "Устгах" байхгүй. "Цуцлах", "Буцаах", "Кредит нот" л байна | PP-03 |
| UXP-06 | **Монгол эхэнд.** | Анхдагч хэл `mn`. Хуулийн маягт үргэлж монголоор | ADR-0017 |
| UXP-07 | **Энгийн анхдагч.** | Ховор талбар "Дэлгэрэнгүй" дор нуугдана (BC "Show more"). Dimension тохируулаагүй бол багана харагдахгүй | PP-10 |
| UXP-08 | **Нууцыг хамгийн бага.** | `qrData`, `lottery` зөвхөн санах ойд. PII маскаар | D-J3, 13 §10.4 |
| UXP-09 | **Бүх алдааг нэг дор.** | Батлах үеийн алдааг жагсааж, засах газар руу холбоно | NFR-121 |
| UXP-10 | **Төлөв үргэлж харагдана.** | Баримт, eBarimt, төлбөр, үеийн төлөв тэмдгээр харагдана | FR-SAL-014 |

---

## 2. Мэдээллийн архитектур (IA) ба навигаци

### 2.1 App shell

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [≡] ЛОГО │ [Б] Болд Трейд ХХК ▾ (ТУРШИЛТ)│  🔍 Хайх (Alt+Q)…              │ 🔔 3 │ ? │ БТ ▾    │ ← top bar 48px
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ Support хандалт идэвхтэй: 2026.10.07 14:00 хүртэл (зөвхөн унших)            [Дэлгэрэнгүй]   │ ← banner (байвал)
├───────────────┬──────────────────────────────────────────────────────────────┬─────────────────┤
│ Нүүр          │ Нүүр › Борлуулалт › Нэхэмжлэх                                │ Хажуугийн       │
│ Борлуулалт  ▾ │ ┌ Хуудасны гарчиг ──────────────────── Төлөвийн тэмдэг ┐   │ самбар          │
│  Нэхэмжлэх    │ │ [Батлах F9] [Урьдчилан харах] [Хэвлэх] [⋯ Бусад]    │   │ (FactBox,       │
│  Бэлэн борл.  │ └──────────────────────────────────────────────────────┘   │  Alt+F2)        │
│ Худалдан ав.▸ │                                                              │                 │
│ Мөнгө       ▸ │                  Хуудасны агуулга                            │                 │
│ eBarimt     ▸ │                                                              │                 │
│ Санхүү      ▸ │                                                              │                 │
│ Татвар      ▸ │                                                              │                 │
│ Хаалт       ▸ │                                                              │                 │
│ Тайлан      ▸ │                                                              │                 │
│ Тохиргоо    ▸ │                                                              │                 │
│  [« Хураах]   │                                                              │                 │
└───────────────┴──────────────────────────────────────────────────────────────┴─────────────────┘
   240px (хураасан 56px)                    уян                                    320px
```

### 2.2 Навигацийн дүрэм

| ID | Дүрэм |
|---|---|
| UX-NAV-01 | **Компанийн контекст.** Компанид хамаарах бүх зам `/c/{companyId}/…` хэлбэртэй. Тенант нь session-оос (cookie) ирнэ, URL-д байхгүй (18 §3.4). |
| UX-NAV-02 | **Компани солих** (Ctrl+O, BC-тэй ижил): шинэ компанид ижил зам руу шилжинэ; хэрэглэгч тэр замд эрхгүй (цэс харагдахгүй) эсвэл бичлэг нь өөр компанийнх бол `/c/{new}/home` руу. Солихын өмнө хадгалагдаагүй өөрчлөлтийг UX-SAVE-06-ийн дагуу хадгална. TanStack Query-ийн кэшийг компаниар (`queryKey[0] = companyId`) тусгаарлана. |
| UX-NAV-03 | **Тенант солих** нь `POST /bff/switch-tenant`-ийн дараа хуудсыг бүрэн дахин ачаална (`location.assign('/')`). Санах ой дахь бүх төлөв, ялангуяа `PrintPayload`, цэвэрлэгдэнэ (13 §5.5: шинэ `sid`). Бусад tab 401 авч тенант сонгох хуудас руу шилжинэ. |
| UX-NAV-04 | **Компанийн тэмдэг (badge):** нэрийн эхний үсэг + өнгө (компани бүрд тогтмол, `id`-ийн hash-аас 8 өнгөний нэг). `platform.company.is_demo = true` бол "ТУРШИЛТ" шошго (BC company badge). Олон компанитай хэрэглэгч алдаж бичихээс сэргийлнэ. |
| UX-NAV-05 | **Цэсийн харагдах байдал:** цэсийн зүйл бүр §2.3-ын "Эрх" баганатай. Хэрэглэгчийн үр дүнгийн эрхэнд (`GET /api/v1/companies/{cid}/me/permissions`, 60 s кэш) тэр эрх байхгүй бол зүйл харагдахгүй. Бүх дэд зүйл нуугдсан бүлэг нуугдана. **Энэ нь зөвхөн UX.** Сервер endpoint бүрийг шалгана (FR-PLT-005). |
| UX-NAV-06 | **Хувилбарын шүүлтүүр:** R2/R3-ийн дэлгэц feature flag-аар бүрэн нуугдана. "Удахгүй" гэсэн идэвхгүй цэс харуулахгүй. |
| UX-NAV-07 | **Замын мөр (breadcrumb):** `Нүүр › Бүлэг › Хуудас › Бичлэг`. Бичлэгийн хэсэг нь баримтын дугаар эсвэл нэр. Сүүлийн хэсгээс бусад нь холбоос. |
| UX-NAV-08 | **Браузерийн "Буцах":** хуудас бүр history-д `push` хийнэ. Tab солих, шүүлтүүр өөрчлөх нь `replace`. Dialog нээх нь history-д орохгүй; Esc хаана. |
| UX-NAV-09 | **Жагсаалтын төлөв URL-д:** шүүлтүүр, эрэмбэ, хайлт query string-д (`?status=OPEN&dueTo=2026-10-31&sort=-postingDate`). Хуулсан холбоос ижил жагсаалтыг нээнэ. Cursor (хуудаслалт) URL-д орохгүй. |
| UX-NAV-10 | **Тогтвортой id:** баримтын карт нэг замтай: `/c/{cid}/sales/invoices/{id}` (ноорог ба батлагдсан хоёулаа, 14 API-URL-10/11). API-ийн `posted` талбараар S-SAL-02 (засвартай) эсвэл S-SAL-06 (унших) харагдацыг сонгоно. Батлагдсаны дараа зам өөрчлөгдөхгүй; хуудас хариуны `invoice`-ээр дахин зурагдана. Хуучин холбоос ч ажиллана. Олдохгүй бол (404 `api.resource_not_found`) "Олдсонгүй" хоосон төлөв (§9). |
| UX-NAV-11 | **Сүүлд нээсэн:** сүүлийн 10 бичлэгийг (төрөл, id, гарчиг) санах ойд ба `localStorage`-д (`ui:recent:{userId}:{companyId}`) хадгална. PII-ийн маскгүй утга, eBarimt-ийн хэвлэх өгөгдөл энд орохгүй (UX-SEC-02). |
| UX-NAV-12 | **Хуудасны гарчиг (`<title>`):** `<Хуудас> — <Компани> — <Бүтээгдэхүүн>`. Хэлний сонголтоор. |

### 2.3 Цэсийн мод (монгол)

Багана: **Зам** — `/c/{cid}` угтваргүй. **Эрх** — цэсийг харуулах нөхцөл (13 §6.3; `R x` = TABLE `x`-ийн R, `X a` = ACTION/REPORT `a`). **R** — хувилбар.

| Цэс | Зам | Дэлгэц | Эрх (харуулах нөхцөл) | R |
|---|---|---|---|:-:|
| **Нүүр** | `/home` | S-PLT-05 | `X platform.profile.edit` (бүгд) | 1 |
| **Борлуулалт** | | | | |
| ├ Нэхэмжлэх | `/sales/invoices` | S-SAL-01 | `R sales.sales_header` | 1 |
| ├ Бэлэн борлуулалт | `/sales/cash-sale/new` | S-SAL-09 | `X sales.pos.post` | 1 |
| ├ Кредит нот | `/sales/credit-memos` | S-SAL-03 | `R sales.sales_header` ба `X sales.creditmemo.post` | 1 |
| ├ Батлагдсан нэхэмжлэх | `/sales/invoices?posted=true` | S-SAL-05 | `R sales.sales_invoice_header` | 1 |
| ├ Батлагдсан кредит нот | `/sales/credit-memos?posted=true` | S-SAL-07 | `R sales.sales_cr_memo_header` | 1 |
| ├ Харилцагч | `/customers` | S-PTY-01 | `R party.customer` | 1 |
| └ Бараа, үйлчилгээ | `/items` | S-INV-01 | `R inv.item` | 1 |
| **Худалдан авалт** | | | | |
| ├ Нэхэмжлэх | `/purchases/invoices` | S-PUR-01 | `R purchase.purchase_header` | 1 |
| ├ Кредит нот | `/purchases/credit-memos` | S-PUR-03 | `R purchase.purchase_header` | 1 |
| ├ Батлагдсан нэхэмжлэх | `/purchases/invoices?posted=true` | S-PUR-05 | `R purchase.purch_inv_header` | 1 |
| ├ Батлагдсан кредит нот | `/purchases/credit-memos?posted=true` | S-PUR-07 | `R purchase.purch_cr_memo_header` | 1 |
| ├ Нийлүүлэгчийн eBarimt (ДДТД) | `/purchases/supplier-receipts` | S-PUR-09 | `R ebarimt.purchase_receipt` | 1 |
| └ Нийлүүлэгч | `/vendors` | S-PTY-03 | `R party.vendor` | 1 |
| **Мөнгө** | | | | |
| ├ Кассын орлого (МХ-1) | `/cash/receipts/new` | S-BNK-03 | `X bank.cash_receipt.post` | 1 |
| ├ Кассын зарлага (МХ-2) | `/cash/payments/new` | S-BNK-04 | `X bank.cash_payment.post` | 1 |
| ├ Кассын баримтууд | `/cash/vouchers` | S-BNK-05 | `R bank.posted_cash_voucher` | 1 |
| ├ Банкны орлого, зарлага | `/bank/journal` | S-BNK-06 | `X bank.payment.post` | 1 |
| ├ Данс хоорондын шилжүүлэг | `/bank/transfers/new` | S-BNK-07 | `X bank.payment.post` | 1 |
| ├ Хуулга ба тулгалт | `/bank/reconciliations` | S-BNK-09 | `R bank.bank_reconciliation` | 1 |
| ├ Мөнгөний данс | `/bank/accounts` | S-BNK-01 | `R bank.bank_account` | 1 |
| └ Банкны бичилт | `/bank/entries` | S-BNK-14 | `R bank.bank_ledger_entry` | 1 |
| **eBarimt** | | | | |
| ├ Хяналт | `/ebarimt/monitor` | S-EBR-02 | `R ebarimt.ebarimt_document` | 1 |
| ├ Баримтууд | `/ebarimt/documents` | S-EBR-03 | `R ebarimt.ebarimt_document` | 1 |
| └ POS | `/ebarimt/pos` | S-EBR-06 | `R ebarimt.ebarimt_pos` | 1 |
| **Санхүү** | | | | |
| ├ Ерөнхий журнал | `/gl/journal` | S-GL-03 | `R gl.journal_line` | 1 |
| ├ Эхний үлдэгдэл | `/gl/opening` | S-GL-05 | `X gl.journal.post` | 1 |
| ├ Стандарт журнал | `/gl/standard-journals` | S-GL-04 | `R gl.standard_journal` | 1 |
| ├ Дансны төлөвлөгөө | `/gl/accounts` | S-GL-01 | `R gl.gl_account` | 1 |
| ├ Ерөнхий дэвтрийн бичилт | `/gl/entries` | S-GL-06 | `R gl.gl_entry` | 1 |
| ├ Гүйлгээ ба бүртгэл | `/gl/transactions` | S-GL-07 | `R gl.gl_transaction` | 1 |
| ├ Авлагын тулгалт | `/parties/customer-entries` | S-PTY-05 | `R party.cust_ledger_entry` | 1 |
| ├ Өглөгийн тулгалт | `/parties/vendor-entries` | S-PTY-06 | `R party.vendor_ledger_entry` | 1 |
| └ Бичилт хайх | `/find-entries` | S-PLT-17 | `X rpt.navigate` (CR-23) эсвэл `R gl.gl_entry` | 1 |
| **Татвар** | | | | |
| ├ НӨАТ-ын тайлан (ТТ-03а) | `/tax/vat-returns` | S-TAX-02/03 | `R tax.vat_return_period` | 1 |
| ├ Орцын НӨАТ баталгаажуулах | `/tax/input-vat` | S-TAX-05 | `X tax.vat_entry.confirm_deductible` | 1 |
| ├ НӨАТ-ын бичилт | `/tax/vat-entries` | S-TAX-04 | `R tax.vat_entry` | 1 |
| └ Татварын календарь | `/tax/calendar` | S-TAX-07 | `R tax.tax_parameter` | 1 |
| **Хаалт** | | | | |
| ├ Санхүүгийн жил ба үе | `/close/periods` | S-GL-09 | `R gl.accounting_period` | 1 |
| ├ Сарын хаалтын шалгах хуудас | `/close/checklist` | S-GL-10 | `X gl.period.close` | 1 |
| └ Жилийн хаалт | `/close/year-end` | S-GL-11 | `X gl.year.close` | 1 |
| **Тайлан** | `/reports` | S-RPT-01 | Доорх тайлангийн аль нэгийн X | 1 |
| ├ Гүйлгээ баланс | `/reports/trial-balance` | S-RPT-02 | `X rpt.trial_balance` | 1 |
| ├ Ерөнхий дэвтэр | `/reports/gl-detail` | S-RPT-03 | `X rpt.gl_detail` | 1 |
| ├ Дансны хуулга, тооцоо нийлсэн акт | `/reports/account-statement` | S-RPT-04 | `X rpt.customer_statement` | 1 |
| ├ Авлагын насжилт / Өглөгийн насжилт | `/reports/ar-aging`, `/reports/ap-aging` | S-RPT-05/06 | `X rpt.customer_aging` / `X rpt.vendor_aging` | 1 |
| ├ Касс ба банкны дэвтэр | `/reports/cash-book` | S-RPT-07 | `X rpt.gl_detail` | 1 |
| ├ Борлуулалт / худалдан авалтын журнал | `/reports/sales-journal`, `/reports/purchase-journal` | S-RPT-08 | `X rpt.sales_journal` / `X rpt.purchase_journal` | 1 |
| ├ Санхүүгийн тайлан (Маягт А: СБТ, ОДТ, ӨӨТ, МГТ) | `/reports/statements/{code}` | S-RPT-09..12 | `X rpt.balance_sheet` … | 1 |
| ├ e-balance шивэх хуудас | `/reports/ebalance` | S-RPT-13 | `X rpt.ebalance.keying_sheet` | 1 |
| ├ Банкны тулгалтын тайлан | `/reports/bank-rec` | S-RPT-14 | `R bank.bank_account_statement` | 1 |
| ├ Өдрийн борлуулалт | `/reports/daily-sales` | S-RPT-15 | `X rpt.daily_sales` (CR-23) | 1 |
| └ Жилийн архивын багц | `/reports/archive` | S-RPT-16 | `X platform.archive.download` | 1 |
| **Тохиргоо** | `/settings` | S-PLT-30 | Доорх зүйлийн аль нэг | 1 |
| ├ Компанийн мэдээлэл | `/settings/company` | S-PLT-07 | `R platform.company_setup` | 1 |
| ├ Ерөнхий тохиргоо | `/settings/general` | S-PLT-08 | `R platform.company_setup` | 1 |
| ├ Хэрэглэгч ба эрх | `/settings/members` | S-PLT-09/11 | `X platform.security.manage` | 1 |
| ├ Дугаарын цуврал | `/settings/number-series` | S-PLT-12 | `R platform.number_series` | 1 |
| ├ Дансны тодорхойлолт (posting group) | `/settings/posting` | S-GL-13 | `R party.general_posting_setup` | 1 |
| ├ НӨАТ-ын тохиргоо | `/settings/vat` | S-TAX-01 | `R tax.vat_posting_setup` | 1 |
| ├ Төлбөрийн нөхцөл ба хэлбэр | `/settings/payment` | S-PTY-08/09 | `R party.payment_terms` | 1 |
| ├ Журналын загвар | `/settings/journals` | S-GL-14 | `R gl.journal_template` | 1 |
| ├ Хэмжигдэхүүн (dimension) | `/settings/dimensions` | S-GL-12 | `R gl.dimension` | 1 |
| ├ Шалтгааны код | `/settings/reason-codes` | S-PLT-13 | `R platform.reason_code` | 1 |
| ├ eBarimt тохиргоо | `/settings/ebarimt` | S-EBR-01 | `R ebarimt.ebarimt_setup` | 1 |
| ├ Хуулга импортын профайл | `/settings/bank-import-formats` | S-BNK-11 | `R bank.bank_statement_import_format` | 1 |
| ├ Текстээс данс руу дүрэм | `/settings/text-mappings` | S-BNK-12 | `R bank.text_to_account_mapping` | 1 |
| ├ Excel импорт | `/settings/import` | S-PLT-19 | `I party.customer` эсвэл `I gl.journal_line` | 1 |
| ├ Аудитын лог | `/settings/audit` | S-PLT-14 | `R audit.row_change` | 1 |
| ├ Аюулгүй байдлын лог | `/settings/security-events` | S-PLT-15 | `R audit.security_event` | 1 |
| ├ Ажлын түүх (background job) | `/settings/jobs` | S-PLT-18 | бүгд (өөрийн), `R integration.job_run` (бүгдийн) | 1 |
| ├ Support хандалт | `/settings/support-access` | S-PLT-20 | `X platform.security.manage` | 1 |
| ├ Компаниуд | `/settings/companies` | S-PLT-25 | `X platform.company.create` | 1 |
| └ Хуулийн параметр | `/settings/legal-parameters` | S-TAX-06 | `R tax.tax_parameter` | 1 |
| **R2-т нэмэгдэх:** Валют ба ханш, Ханшийн тэгшитгэл, Үндсэн хөрөнгө, Элэгдлийн run, Барааны журнал ба тооллого, НХАТ, Давтагдах журнал, Засварлах тайлан | | §15 | | 2 |

**Хэрэглэгчийн цэс** (top bar-ын баруун дээд): Миний тохиргоо (S-PLT-16, Alt+T), Хэл (mn/en), Ажлын огноо, MFA ба session, Тенант солих, Гарах.

### 2.4 Хайх (Alt+Q)

Хайлтын цонх нь BC-ийн "Tell me"-тэй ижил: хуудас, үйлдэл, бичлэгийг нэг дор хайна.

```text
function GlobalSearch(text):
    q := Skeleton(text)                               -- §7.9 (UX-FMT-14): жижиг үсэг, кирилл↔латин араг
    if length(q) < 2: return RecentItems()            -- UX-NAV-11
    groups := []
    groups += MatchPages(q)       -- клиент талд: цэсийн зүйл + үйлдлийн каталог (эрхээр шүүсэн), max 5
    groups += MatchActions(q)     -- "шинэ нэхэмжлэх", "кассын орлого", "гүйлгээ баланс" г.м., max 5
    if q looks like document no (^[A-ZА-Я]{1,4}-?\d{2,4}-?\d+$): groups += SearchDocuments(q)   -- сервер
    if q is all digits and length in (7, 11, 12..14): groups += SearchPartiesByTin(q)             -- сервер, R эрхтэй бол
    groups += SearchRecords(q)    -- сервер: харилцагч, нийлүүлэгч, данс, бараа (pg_trgm), групп бүрд max 5
    return groups (debounce 200 ms; хүсэлт цуцлагдана шинэ товчлуурт)
```

- **UX-NAV-13.** Сервер хайлт `GET /api/v1/companies/{cid}/search?q=&types=` (p95 ≤ 400 ms, 02 §13). Эрхгүй төрлийн бичлэгийг сервер буцаахгүй.
- **UX-NAV-14.** Үр дүн дээр Enter = нээх; Alt+Enter = шинэ tab-д нээх. Үйлдлийн үр дүн (жишээ нь "Шинэ нэхэмжлэх") шууд тухайн хуудсыг шинэ бичлэгтэйгээр нээнэ.

### 2.5 Бичилт хайх (Navigate)

- **UX-NAV-15.** Нээх: Ctrl+Alt+Q (бүх газраас), Alt+G (батлагдсан баримт, бичилтийн жагсаалтаас: тухайн мөрийн `document_no` + `posting_date`-ээр).
- **UX-NAV-16.** Оролт: баримтын дугаар, бүртгэлийн огноо, гадаад баримтын дугаар. Гурвуулаа хоосон бол хайхгүй (R-PLATFORM-SECURITY-API-25). Бичлэгээс нээгдвэл дугаар **ба** огноо хоёул тохирно (дугаар жил бүр давтагдана).
- **UX-NAV-17.** Үр дүн: хүснэгт (Хүснэгт/Баримтын төрөл, Тоо) + "Эх сурвалж" мөр (ганц харилцагч/нийлүүлэгч олдвол). Мөр дарахад тухайн жагсаалт шүүлттэй нээгдэнэ. Эх: `audit.document_entry` view (140), eBarimt баримт орно (FR-PLT-013 AC1).

### 2.6 Сесс ба олон tab

- **UX-NAV-18.** Идэвхгүй хугацаа нь серверийнх: 60 мин, хамгийн урт 12 цаг (13 SEC-AUTH-05, ADR-0016). Клиент "идэвх" гэж зөвхөн хэрэглэгчийн оролтыг (`keydown`, `pointerdown`, `wheel`) тооцно; аль ч tab-ын оролт бүх tab-ын тоолуурыг шинэчилнэ (UX-NAV-19 `activity` дохио). Оролтгүй 55 минут болоход modal (`SessionTimeoutDialog`): "Таны session 5 минутын дараа дуусна" [Үргэлжлүүлэх]. Modal гарахад `dirty` хоосон биш бол `Flush()` хийнэ (дууссаны дараа 401 тул хадгалах боломжгүй). [Үргэлжлүүлэх] нь `GET /bff/user`-ийг дуудаж серверийн session-ийг сунгана (13 §5). Хугацаа дуусвал (401 `platform.session_expired`) нэвтрэх хуудас руу `returnUrl`-тай шилжинэ; санах ойд үлдсэн хадгалаагүй өөрчлөлт алдагдана гэдгийг modal-д урьдчилан бичнэ. Хамгийн урт 12 цаг дуусахаас 10 минутын өмнө мөн анхааруулна (02 §10.1).
- **UX-NAV-18a. Polling ба идэвхгүй хугацаа.** Арын polling (eBarimt төлөв UX-EBR, job UX-PAGE-18, мэдэгдэл, нүүрийн cue) нь серверийн sliding session-ийг сунгадаг тул хэрэглэгчийн оролтгүй 5 мин болоход **бүх polling зогсоно**; оролт эсвэл tab `visibilitychange → visible` болоход сэргэнэ. Үгүй бол нээлттэй tab session-ийг хязгааргүй сунгаж SEC-AUTH-05-ыг зөрчинө. Далд tab (`document.hidden`) polling хийхгүй.
- **UX-NAV-19.** Tab хооронд `BroadcastChannel('erp')`-ээр зөвхөн дохио (`logout`, `tenant-switched`, `activity` — сүүлийн оролтын цаг, 30 s-д ≤ 1 удаа) дамжуулна. Өгөгдөл дамжуулахгүй.

---

## 3. Role-ийн нүүр хуудас (home) ба cue

BC-д нүүр хуудас нь профайлын (profile) Role Center юм. Энэ нь эрх биш (R-PLATFORM-SECURITY-API: "Profile = Role Center UI, not security"). Манайд нүүр хуудсын хувилбарыг role-оос гаргана. Cue-ийн загвар BC-ийн table 1313 "Activities Cue", table 9054 "Finance Cue"-ийг дагана: **тоо эсвэл дүн + шүүсэн жагсаалт руу холбоос + өнгөний босго** (table 9701 "Cue Setup").

### 3.1 Нүүр хуудсын хувилбар сонгох

| Хувилбар | Role (13 §6.5) | Зорилго |
|---|---|---|
| `OWNER_HOME` | `OWNER` | Мөнгө хаана байна, хэн хэдэн төгрөг өртэй, татварын эрсдэл байна уу |
| `ACCOUNTANT_HOME` | `ACCOUNTANT`, `EXTERNAL_ACCOUNTANT` | Хийх ажил: ноорог, тулгалт, eBarimt алдаа, НӨАТ, хаалт |
| `SALES_HOME` | `SALES_CLERK` | Борлуулалт, касс, баримт хэвлэх — хамгийн цөөн товчоор |
| `VIEWER_HOME` | `VIEWER` | Унших: үлдэгдэл, авлага, өглөг, тайлан |

```text
function ResolveHomeVariant(user, companyId):
    roles := RoleCodes(user, companyId)                  -- platform.user_company_role (company_id = cid эсвэл NULL)
    if 'OWNER' in roles: return OWNER_HOME
    if 'ACCOUNTANT' in roles or 'EXTERNAL_ACCOUNTANT' in roles: return ACCOUNTANT_HOME
    if 'SALES_CLERK' in roles: return SALES_HOME
    if 'VIEWER' in roles: return VIEWER_HOME
    -- custom role: эрхээр
    p := EffectivePermissions(user, companyId)           -- 13 §6.7
    if p.has(X gl.journal.post) or p.has(X tax.vat.settle): return ACCOUNTANT_HOME
    if p.has(X sales.invoice.post) or p.has(X bank.cash_receipt.post): return SALES_HOME
    return VIEWER_HOME
```

- **UX-HOME-01.** Хэрэглэгч "Миний тохиргоо"-д өөр хувилбар сонгож болно (зөвхөн харагдац; эрх өөрчлөгдөхгүй). R1-д сонголтыг `localStorage`-д (`ui:home:{userId}:{companyId}`) хадгална. Серверт хадгалах нь SCR-UI-01.
- **UX-HOME-02.** Нүүр хуудсанд харагдах cue бүр `visibleIf` нөхцөлтэй (§3.3). Нөхцөл биелэхгүй cue-г **харуулахгүй** (тэг утгатай харуулахгүй).

### 3.2 Нүүр хуудсын бүрэлдэхүүн

| Хэсэг | BC | Агуулга | OWNER | ACCOUNTANT | SALES | VIEWER |
|---|---|---|:-:|:-:|:-:|:-:|
| Мэдээний мөр | Headline RC (P1442) | Мэндчилгээ + нэг чухал санамж (§3.5) | ✔ | ✔ | ✔ | ✔ |
| Эхлэх алхмууд | Getting Started / Assisted Setup | Onboarding-ийн шалгах хуудас (§10.4), бүгд дуусвал нуугдана | ✔ | ✔ | | |
| Шуурхай үйлдэл | Actions (Creation) | "Шинэ нэхэмжлэх", "Кассын орлого" г.м. том товч | ✔ | ✔ | ✔ (том) | |
| Cue-ийн бүлэг | Activities part | §3.3-ын cue | ✔ | ✔ | ✔ | ✔ |
| Мөнгөний хөдөлгөөн (30 хоног) | Cash Flow chart | Касс + банкны өдрийн үлдэгдлийн шугаман график, хүснэгт хувилбартай (UX-A11Y-14) | ✔ (Should) | | | ✔ (Should) |
| Хугацаа хэтэрсэн топ 5 харилцагч | Overdue Customers part | Харилцагч, дүн, хамгийн их хоног | ✔ | ✔ | | ✔ |
| Сарын хаалтын явц | — | S-GL-10-ийн алхам (4/9): `GET /accounting-periods/{id}/close-checklist` (`CloseChecklist.items[]`, `status` ∈ `OK`/`WARNING`/`BLOCKING`, `link`) | | ✔ | | |
| Миний ажлууд | My Job Queue | Өөрийн background job (экспорт, импорт) | ✔ | ✔ | | |

### 3.3 Cue-ийн каталог

Тэмдэглэгээ: `D` = бизнесийн өнөөдөр (`Asia/Ulaanbaatar`, 13 §1.2). BC-ийн CU1311 UI-д ажлын огноог (`GetDefaultWorkDate`), web service-д `Today()`-г хэрэглэдэг; манайд ажлын огноо зөвхөн клиентийн session-д байдаг (UX-FMT-07) тул cue үргэлж `D`-ээр тооцогдоно. Дүн бүгд MNT (LCY). "Төлөв" нь §3.4-ийн `EvaluateState`-ийн анхдагч дүрэм. Төлөвийн утга BC enum 9701-ийнх: `NONE`, `FAVORABLE`, `AMBIGUOUS`, `UNFAVORABLE`, `SUBORDINATE`.

| ID | Нэр (mn / en) | Тодорхойлолт (өгөгдлийн эх) | Харуулах (`visibleIf`) | Анхдагч төлөв | Дарахад | Хувилбар |
|---|---|---|---|---|---|---|
| CUE-01 | Төлөгдөөгүй нэхэмжлэх / Unpaid invoices | `party.cust_ledger_entry`: `open AND document_type = 'INVOICE'` → тоо, Σ `remaining_amount_lcy` | `R party.cust_ledger_entry` | `NONE` | S-SAL-05 `?payment=UNPAID,PARTIALLY_PAID` (OVERDUE орно) | O, A |
| CUE-02 | Хугацаа хэтэрсэн авлага / Overdue receivables | CUE-01 + `due_date < D` → Σ дүн, харилцагчийн тоо (BC CU1311 `OverdueSalesInvoiceAmount`) | `R party.cust_ledger_entry` | 0 → `FAVORABLE`; > 0 → `UNFAVORABLE` | S-RPT-05 `?asOf=D&overdueOnly=true` | O, A, V |
| CUE-03 | Мөнгөн хөрөнгө / Cash and bank | `bank.v_bank_account_balance` ⋈ `bank.bank_account` (`NOT blocked`): Σ `balance_lcy`, `kind`-аар задлал (Касс / Банк / Хэтэвч) | `R bank.bank_account` ба `R bank.bank_ledger_entry` | `NONE` | S-BNK-01 | O, A, V |
| CUE-04 | Төлөх НӨАТ (урьдчилсан) / VAT payable (estimate) | Үе `P` = `tax.vat_return_period`-оос `status <> 'SUBMITTED' AND starting_date <= D AND ending_date >= coalesce(company_setup.go_live_date, company_setup.vat_registered_from, '-infinity')`-ийн хамгийн эрт мөр (go-live-аас өмнөх, системд хэзээ ч илгээгдэхгүй үеийг алгасна; эс бөгөөс cue олон сарын өмнөх үед "гацна"). Утга = −(Σ `amount` [`entry_type = 'SALE'`] + Σ `amount` [`entry_type = 'PURCHASE' AND deductible_confirmed`]), `vat_date ∈ P`. Хоёрдогч: хугацаа хүртэлх хоног = `P.due_date − D` (`due_date` NULL бол `tax_parameter 'vat.return_due_day'`-аас) | `company_setup.vat_registered` ба `R tax.vat_entry` | хоног ≤ 3 (сөрөг буюу хэтэрсэн орно) → `UNFAVORABLE`; ≤ 7 → `AMBIGUOUS`; бусад `NONE` | S-TAX-03 (`P`) | O, A |
| CUE-05 | eBarimt илгээгдэж буй / eBarimt in progress | `ebarimt.ebarimt_document`: `status IN ('PENDING','SENT')` → тоо; хамгийн хуучны нас | `R ebarimt.ebarimt_document` ба `ebarimt_setup.enabled` | тоо 0 эсвэл нас ≤ 1 цаг → `FAVORABLE`; 1–24 цаг → `AMBIGUOUS`; > 24 цаг → `UNFAVORABLE` (12 §14.3) | S-EBR-02 `?status=PENDING,SENT` | O, A |
| CUE-06 | eBarimt алдаа, тодорхойгүй / eBarimt errors | `status IN ('ERROR','UNKNOWN')` → тоо; `UNKNOWN`-ийг тусад нь ("2 тодорхойгүй") | `R ebarimt.ebarimt_document` | 0 → `FAVORABLE`; ≥ 1 → `UNFAVORABLE` | S-EBR-02 `?status=UNKNOWN,ERROR` | O, A |
| CUE-07 | eBarimt-гүй борлуулалт / Sales without eBarimt | Батлагдсан нэхэмжлэх, кредит нот: `ebarimt_receipt_type <> 'NONE'` ба `ebarimt.ebarimt_document` байхгүй (12 §9.4 "Тохируулаагүй") | `R sales.sales_invoice_header`; утга > 0 бол л | ≥ 1 → `UNFAVORABLE` | S-SAL-05 `?ebarimt=NOT_CONFIGURED` | O, A |
| CUE-08 | PosAPI-ийн сугалааны үлдэгдэл / Lottery numbers left | `ebarimt.posapi_instance.left_lotteries` (компанийн `ebarimt_setup.posapi_instance_id`) — SCR-UI-05 view-ээр. Хоёрдогч: сүүлийн `sendData`-гаас хойших цаг | `X ebarimt.merchant.register` ба `ebarimt_setup.enabled` | NULL → `NONE` ("мэдээлэл алга"); `< W` → `UNFAVORABLE`; `< 2W` → `AMBIGUOUS`; бусад `FAVORABLE`. `W` = `tax_parameter 'ebarimt.left_lotteries_warning'` (12 SCR-14, 100). `sendData` > 48 цаг → `UNFAVORABLE` | S-EBR-02 (instance-ийн мэдээлэл) | O, A |
| CUE-09 | Ноорог баримт / Open drafts | `sales.sales_header` + `purchase.purchase_header` (бүх төрөл) → тоо. `SALES_HOME`-д зөвхөн `created_by = me` | `R sales.sales_header` эсвэл `R purchase.purchase_header` | `NONE` | S-SAL-01 (эсвэл S-PUR-01) | A, S |
| CUE-10 | Тулгагдаагүй хуулгын мөр / Unreconciled statement lines | `bank.bank_statement_line`: `status IN ('NEW','MATCHED')` → тоо | `R bank.bank_reconciliation` | > 0 → `AMBIGUOUS` | S-BNK-09 | A |
| CUE-11 | Энэ сарын борлуулалт / Sales this month | Σ `sales_invoice_header.amount_lcy` − Σ `sales_cr_memo_header.amount_lcy`, `posting_date` ∈ `D`-ийн сар (НӨАТ-гүй; BC "Sales This Month"). Хоёрдогч: өмнөх сарын ижил өдрүүдтэй харьцуулсан % (Should) | `R sales.sales_invoice_header` | `NONE` | S-RPT-08 (сар) | O, V |
| CUE-12 | 7 хоногт төлөх өглөг / Payables due in 7 days | `party.vendor_ledger_entry`: `open AND document_type = 'INVOICE' AND due_date BETWEEN D AND D + 7` → −Σ `remaining_amount_lcy`, тоо (D-ээс D+7 хүртэл, хоёр тал орно = 8 хуанлийн өдөр) | `R party.vendor_ledger_entry` | `NONE` | S-PTY-06 `?dueFrom=D&dueTo=D+7` | A (O-д CUE-17-ийн хоёрдогч мөр) |
| CUE-13 | Хугацаа хэтэрсэн өглөг / Overdue payables | Ижил, `due_date < D` | `R party.vendor_ledger_entry` | 0 → `FAVORABLE`; > 0 → `UNFAVORABLE` | S-RPT-06 | A |
| CUE-14 | Баталгаажаагүй орцын НӨАТ / Unconfirmed input VAT | `tax.vat_entry`: `entry_type = 'PURCHASE' AND NOT deductible_confirmed AND vat_calculation_type = 'NORMAL' AND amount <> 0 AND vat_date ∈ P` (CUE-04-ийн үе) → тоо, Σ `amount` (D-E4) | `vat_registered` ба `X tax.vat_entry.confirm_deductible` | > 0 ба хоног ≤ 3 → `UNFAVORABLE`; > 0 → `AMBIGUOUS` | S-TAX-05 | A |
| CUE-15 | Үеийн төлөв / Period status | `D` агуулсан `gl.accounting_period.status`; сүүлд `CLOSED` болсон үеийн нэр; S-GL-10-ийн явц | `R gl.accounting_period` | Өмнөх сар `D` нь `vat.return_due_day`-ээс хойш `OPEN` хэвээр → `AMBIGUOUS` | S-GL-09 | A |
| CUE-16 | Нийт авлага / Total receivables | Σ `party.v_customer_balance.balance_lcy` | `R party.cust_ledger_entry` | `NONE` | S-PTY-01 `?balance=nonzero` | O, V |
| CUE-17 | Нийт өглөг / Total payables | −Σ `party.v_vendor_balance.balance_lcy`. Хоёрдогч: CUE-12-ийн дүн ("7 хоногт: …") | `R party.vendor_ledger_entry` | `NONE` | S-PTY-03 `?balance=nonzero` | O, V |
| CUE-18 | Өнөөдрийн миний борлуулалт / My sales today | Σ `amount_including_vat_lcy` (нэхэмжлэх − кредит нот), `posting_date = D`, `created_by = me` → дүн, баримтын тоо | `X sales.invoice.post` | `NONE` | S-SAL-05 `?postingDate=D&mine=true` | S |
| CUE-19 | Кассын үлдэгдэл / Cash on hand | `kind = 'CASH' AND NOT blocked` данснуудын үлдэгдэл. Компанийн анхдагч POS-ийн (`ebarimt_pos.is_default`) `bank_account_id` нь CASH бол зөвхөн тэр (хэрэглэгч тус бүрийн POS schema-д алга — SCR-UI-01 `default_ebarimt_pos_id`) | `X bank.cash_receipt.post` | `NONE` | S-BNK-05 | S |
| CUE-20 | Миний eBarimt асуудал / My eBarimt issues | `ebarimt_document.created_by = me AND status IN ('PENDING','SENT','ERROR','UNKNOWN')` | `R ebarimt.ebarimt_document` | `ERROR`/`UNKNOWN` ≥ 1 → `UNFAVORABLE` | S-EBR-02 `?mine=true` | S |

Хувилбар: O = `OWNER_HOME`, A = `ACCOUNTANT_HOME`, S = `SALES_HOME`, V = `VIEWER_HOME`.

#### 3.3.1 Нүүрийн байршил (`HomeLayout`)

§3.4-ийн `HomeLayout[variant]`-ийг энд тогтооно. Бүлэг дээрээс доош, бүлэг доторх tile зүүнээс баруун тийш **энэ дарааллаар** байрлана. `visibleIf` биелээгүй эсвэл UX-HOME-02-оор нуугдсан tile-ийн байрыг дараагийнх нь эзэлнэ. Мөрөнд багтахгүй бол (≥ 1280 px-д 4–5 tile) дараагийн мөрөнд шилжинэ. §3.6-ийн wireframe нь бүлэг бүрийн эхний мөрийг л харуулна.

| Хувилбар | Бүлэг (`home.groups.*`) | Cue (дараалал) |
|---|---|---|
| `OWNER_HOME` | `moneyAndBalances` "Мөнгө ба тооцоо" | CUE-03, CUE-01, CUE-02, CUE-17, CUE-16, CUE-11 |
| | `taxAndEbarimt` "Татвар ба eBarimt" | CUE-04, CUE-06, CUE-05, CUE-08, CUE-07 |
| `ACCOUNTANT_HOME` | `todo` "Хийх ажил" | CUE-09, CUE-10, CUE-06, CUE-07, CUE-12, CUE-14, CUE-05, CUE-08 |
| | `taxAndClose` "Татвар ба хаалт" | CUE-04, CUE-15, CUE-02, CUE-13, CUE-01, CUE-03 |
| `SALES_HOME` | `today` (нэг мөр, товч хэлбэр) | CUE-18, CUE-19, CUE-09, CUE-20 |
| `VIEWER_HOME` | `moneyAndBalances` | CUE-03, CUE-02, CUE-16, CUE-17, CUE-11 |

Cue-ийн "Хувилбар" багана (§3.3) ба энэ хүснэгт зөрвөл энэ хүснэгт давамгайлна; CI тест хоёуланг тулгана (cue бүр зөвхөн "Хувилбар"-т заасан layout-д байна).

### 3.4 Cue тооцох алгоритм ба API

```text
GET /api/v1/companies/{cid}/home?variant=OWNER_HOME           -- Accept-Language: mn
→ 200 { variant, asOf, headline, cues: [ { id, value, count, secondary, state, drill: { route, query } } ], checklist? }

function BuildHome(user, cid, variant):
    D := BusinessToday('Asia/Ulaanbaatar')
    perms := EffectivePermissions(user, cid)                       -- 13 §6.7, 60 s кэш
    list := HomeLayout[variant].cues.filter(c => CueCatalog[c].visibleIf(perms, CompanyFlags(cid)))
    BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY                 -- 02 §5.3 #4: нэг snapshot
    for c in list:
        key := (cid, c, D, c.mineScoped ? user.id : '*')
        if not forceRefresh and Cache.has(key, ttl = 60 s): result[c] := Cache.get(key); continue
        SAVEPOINT s; SET LOCAL statement_timeout = '2s'
        try:
            v := CueCatalog[c].query(D, user)                     -- §3.3-ын тодорхойлолт, LCY, numeric (string болгож буцаана)
            result[c] := { value: v.value, count: v.count, secondary: v.secondary, state: EvaluateState(c, v) }
            Cache.set(key, result[c])
        catch timeout or error:
            ROLLBACK TO SAVEPOINT s
            result[c] := { state: 'ERROR' }                        -- нэг cue унах нь хуудсыг унагахгүй
    COMMIT
    return result

function EvaluateState(c, v):
    if CueCatalog[c].customRule: return CueCatalog[c].customRule(v)        -- CUE-04, 05, 08, 14, 15
    s := CueSetup(company, user, c) ?? CueCatalog[c].defaultSetup          -- R1: зөвхөн анхдагч; R2: SCR-UI-02
    if v.value < s.threshold1: return s.lowStyle                           -- BC T9701-ийн утга
    if v.value <= s.threshold2: return s.middleStyle
    return s.highStyle
```

| ID | Дүрэм |
|---|---|
| UX-HOME-03 | Cue-ийн кэш компани ба огноогоор 60 s. "Шинэчлэх" (F5 хуудсан дээр) `forceRefresh=true` илгээнэ; хэрэглэгч бүрд 10 s-д 1 удаа. Батлах, тулгах зэрэг команд амжилттай болсны дараа клиент нүүрийн query-г invalidate хийнэ (серверийн кэш 60 s хүртэл хоцорч болно; tile дээр "10:42-ийн байдлаар" гэж харагдана). |
| UX-HOME-04 | Cue tile: гарчиг, том утга (§7.6-ийн товч формат), хоёрдогч мөр, төлөвийн дүрс + зураас. Төлөвийг **зөвхөн өнгөөр биш** дүрс ба текстээр давхар илэрхийлнэ (WCAG 1.4.1): `FAVORABLE` ✓ "Хэвийн", `AMBIGUOUS` ◐ "Анхаарах", `UNFAVORABLE` ⚠ "Арга хэмжээ", `ERROR` ⟳ "Ачаалж чадсангүй". |
| UX-HOME-05 | Tile бүр нэг `<a>` (холбоос). `aria-label` нь бүтэн утгатай: "Хугацаа хэтэрсэн авлага: 3,450,000.00 төгрөг, 4 харилцагч, арга хэмжээ шаардлагатай". Enter/Space нээнэ. |
| UX-HOME-06 | `state = ERROR` tile нь утга харуулахгүй, "Дахин оролдох" товчтой. Бусад tile хэвийн ажиллана. |
| UX-HOME-07 | Cue-ийн утгыг клиент **тооцохгүй, нийлүүлэхгүй** (UXP-04). Задлал (CUE-03-ийн касс/банк/хэтэвч) серверээс ирнэ. |
| UX-HOME-08 | CUE-08-ийн tooltip: "Энэ тоо нь танай компанийн баримтыг илгээдэг PosAPI-ийн нийт сугалааны үлдэгдэл". Компанийн PosAPI instance тодорхойгүй (`ebarimt_setup.posapi_instance_id` NULL) бол tile харагдахгүй; утга NULL бол `NONE` төлөвтэй "Мэдээлэл алга". |
| UX-HOME-09 | CUE-04-ийн хоёрдогч мөр: `P` нь `D`-ээс өмнө дууссан бол "9-р сар · илгээх хүртэл 4 хоног"; одоогийн сар бол "10-р сар · явцын дүн"; хугацаа өнгөрсөн (хоног < 0) бол "9-р сар · хугацаа 2 хоног хэтэрсэн". Утга сөрөг бол гарчиг "Буцаан авах НӨАТ (урьдчилсан)". Tile дээр "Урьдчилсан тооцоо. Эцсийн дүн — НӨАТ-ын тайлан" гэсэн тайлбар. |
| UX-HOME-10 | Нүүрийн ачаалал p95 ≤ 1 s (cue бүр ≤ 2 s timeout). Skeleton эхлээд, cue тус бүр ирэхэд дүүрнэ. |

### 3.5 Мэдээний мөр (headline)

```text
function Headline(user, cues, now):
    greet := hour(now @ UB) in [5,11) ? 'Өглөөний мэнд' : [11,17) ? 'Өдрийн мэнд' : [17,23) ? 'Оройн мэнд' : 'Сайн байна уу'
    -- нэг л санамж, эрэмбээр (байхгүй бол санамжгүй)
    if cues.CUE-06.unknownCount > 0: tip := t('home.headline.ebarimtUnknown', {count})            -- "eBarimt: {{count}} баримт тодорхойгүй — шийдвэрлэх"
    elif cues.CUE-04.daysToDue <= 3 and P.status <> SUBMITTED:
        tip := daysToDue >= 0 ? t('home.headline.vatDue', {days, month}) : t('home.headline.vatOverdue', {days: -daysToDue, month})
    elif cues.CUE-07.value > 0: tip := t('home.headline.ebarimtNotConfigured', {count})
    elif cues.CUE-02.value > 0: tip := t('home.headline.topOverdue', {customer, amount})
    return greet + ', ' + user.displayName.firstName + '. ' + tip
```

- **UX-HOME-11.** Санамж нь холбоостой (cue-ийн drill-тэй ижил). FR-PLT-015 AC1: UNKNOWN 2 бол "eBarimt: 2 тодорхойгүй" холбоостой мэдэгдэл харагдана.

### 3.6 Нүүрийн wireframe (дэлгэц №1)

**OWNER_HOME (≥ 1280 px):**

```text
┌ Нүүр ──────────────────────────────────────────────────────────────────────────────────────────┐
│ Өглөөний мэнд, Болд. ⚠ eBarimt: 2 баримт тодорхойгүй — шийдвэрлэх ›            10:42-ийн байдлаар ⟳│
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [+ Шинэ нэхэмжлэх]  [+ Бэлэн борлуулалт]  [+ Кассын орлого]  [+ Худалдан авалт]                 │
├──────────────────────────────── Мөнгө ба тооцоо ────────────────────────────────────────────────┤
│ ┌ Мөнгөн хөрөнгө ─────┐ ┌ Төлөгдөөгүй нэхэмжлэх ┐ ┌ Хугацаа хэтэрсэн авлага┐ ┌ Нийт өглөг ───────┐│
│ │ 48.7 сая ₮          │ │ 12.5 сая ₮            │ │ ⚠ 3.5 сая ₮            │ │ 9.8 сая ₮          ││
│ │ Касс 2.1 · Банк 45  │ │ 23 нэхэмжлэх          │ │ 4 харилцагч · Арга хэм.│ │ 7 хоногт: 2.3 сая  ││
│ │ · Хэтэвч 1.5        │ │                       │ │                        │ │                    ││
│ └─────────────────────┘ └───────────────────────┘ └────────────────────────┘ └────────────────────┘│
├──────────────────────────────── Татвар ба eBarimt ──────────────────────────────────────────────┤
│ ┌ Төлөх НӨАТ (урьдч.) ┐ ┌ eBarimt алдаа ────────┐ ┌ eBarimt илгээгдэж буй ┐ ┌ Сугалааны үлдэгдэл┐│
│ │ ◐ 2.8 сая ₮         │ │ ⚠ 3 (2 тодорхойгүй)   │ │ 1 · 3 мин              │ │ ✓ 4,820           ││
│ │ 9-р сар · 4 хоног   │ │ Арга хэмжээ           │ │ Хэвийн                 │ │ sendData: 2 цаг   ││
│ └─────────────────────┘ └───────────────────────┘ └────────────────────────┘ └────────────────────┘│
├───────────── Мөнгөний хөдөлгөөн, 30 хоног (Should) ──────────┬──── Хугацаа хэтэрсэн топ 5 ─────────┤
│  50 ┤                                   ╭──╮                  │ Харилцагч          Дүн    Хоног     │
│  40 ┤          ╭───╮      ╭────────────╯  ╰──                 │ Номин ХХК      1,200,000    45      │
│  30 ┤ ────────╯   ╰──────╯                                    │ Од Трейд         850,000    31      │
│      09.07          09.21          10.06   [Хүснэгтээр харах] │ …                [Насжилт ›]        │
├───────────────────────────────────────────────────────────────┴────────────────────────────────────┤
│ Эхлэх алхмууд (5/8) ▸ eBarimt идэвхжүүлэх · Банкны данс нэмэх · Хэрэглэгч урих                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**ACCOUNTANT_HOME (≥ 1280 px):**

```text
┌ Нүүр ──────────────────────────────────────────────────────────────────────────────────────────┐
│ Өдрийн мэнд, Сарнай. НӨАТ-ын тайлан (9-р сар) илгээх хүртэл 3 хоног ›         14:05-ийн байдлаар ⟳│
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [+ Ерөнхий журнал] [Хуулга импорт] [НӨАТ-ын тайлан] [Гүйлгээ баланс] [Бичилт хайх Ctrl+Alt+Q]  │
├── Хийх ажил ─────────────────────────────────────────────────────────────────────────────────────┤
│ ┌ Ноорог баримт ┐ ┌ Тулгагдаагүй хуулга ┐ ┌ eBarimt алдаа ┐ ┌ 7 хоногт төлөх    ┐ ┌ Баталгаажаагүй ┐│
│ │ 6             │ │ ◐ 14 мөр            │ │ ⚠ 3           │ │ 2.3 сая ₮         │ │ орцын НӨАТ     ││
│ │               │ │                     │ │ 3 татгалзсан  │ │ 3 нэхэмжлэх       │ │ ⚠ 5 · 312,000₮ ││
│ └───────────────┘ └─────────────────────┘ └───────────────┘ └───────────────────┘ └────────────────┘│
├── Татвар ба хаалт ───────────────────────────────────────────────────────────────────────────────┤
│ ┌ Төлөх НӨАТ ───┐ ┌ Үеийн төлөв ────────┐ ┌ Хугацаа хэтэрсэн авлага ┐ ┌ Хугацаа хэтэрсэн өглөг ┐   │
│ │ ⚠ 2.8 сая ₮   │ │ 10-р сар: Нээлттэй  │ │ ⚠ 3.5 сая ₮            │ │ ✓ 0 ₮                  │   │
│ │ 3 хоног       │ │ Хаасан: 8-р сар     │ │                        │ │                        │   │
│ └───────────────┘ └─────────────────────┘ └────────────────────────┘ └────────────────────────┘   │
├── 9-р сарын хаалт (4/9) ───────────────────────────────────────┬── Миний ажлууд ─────────────────┤
│ ✓ Банкны тулгалт  ✓ Кассын тооллого  ✓ eBarimt алдаагүй      │ Excel экспорт: Гүйлгээ баланс  ✓│
│ ✓ Орцын НӨАТ  ☐ НӨАТ-ын хаалт  ☐ Маягт А-гийн харгалзаа … ›  │ Харилцагч импорт (120 мөр)    ⟳ │
└────────────────────────────────────────────────────────────────┴─────────────────────────────────┘
```

CUE-07 (eBarimt-гүй борлуулалт) утга 0 тул энд харагдахгүй (UX-HOME-02); CUE-12 нь түүний оронд байр эзэлнэ (tile-ийн дараалал = §3.3.1 `HomeLayout`; CUE-05, CUE-08 ба CUE-01, CUE-03 нь бүлэг бүрийн 2-р мөрөнд, wireframe-д товчилсон). Энэ жишээнд `UNKNOWN` = 0 (3 нь бүгд `ERROR`) тул мэдээний мөр нь НӨАТ-ын санамжийг харуулна (§3.5-ын эрэмбэ: `UNKNOWN` > 0 бол eBarimt-ийн санамж давамгайлна).

OWNER_HOME-ийн CUE-03-ийн задлал нь бүрэлдэхүүн бүрийг тусад нь бөөрөнхийлдөг тул нийлбэр нь гарчгийн утгаас 0.1-ээр зөрж болно (2,140,500 + 45,012,000 + 1,500,000 = 48,652,500 → "48.7 сая"; задлал 2.1 + 45 + 1.5 = 48.6). CUE-16, CUE-11 нь "Мөнгө ба тооцоо"-ны 2-р мөрөнд, CUE-07 нь 0 тул харагдахгүй.

**SALES_HOME (tablet ≥ 768 px):**

```text
┌ Нүүр ──────────────────────────────────────────────────┐
│ Сайн байна уу, Тэмүүлэн.                               │
│ ┌──────────────────┐ ┌──────────────────┐ ┌───────────┐│
│ │  🛒               │ │  🧾               │ │  💵        ││
│ │ БЭЛЭН БОРЛУУЛАЛТ │ │ НЭХЭМЖЛЭХ         │ │ КАССЫН     ││
│ │  (Alt+N)         │ │                  │ │ ОРЛОГО     ││
│ └──────────────────┘ └──────────────────┘ └───────────┘│
│ Өнөөдөр: 1,245,000 ₮ · 18 баримт   Касс: 2,140,500 ₮   │
│ Миний ноорог: 2 ›     Миний eBarimt асуудал: ✓ 0      │
└────────────────────────────────────────────────────────┘
```

---

## 4. Хуудасны төрөл ба ерөнхий бүтэц

### 4.1 Хуудасны төрөл

| Төрөл | BC `PageType` | Бүтэц (дээрээс доош) | Хадгалалт | Жишээ |
|---|---|---|---|---|
| Жагсаалт (List) | List | Гарчиг + үйлдлийн мөр → хайлт/шүүлтүүр → хүснэгт (infinite) → нийлбэрийн мөр (серверийн) | Засахгүй (posted) эсвэл мөр дарж карт нээнэ | S-SAL-01, S-PTY-01 |
| Карт (Card) | Card | Гарчиг + төлөв + үйлдэл → хэсгүүд (FastTab) → хажуугийн самбар | Автомат (§4.5) | S-PTY-02, S-GL-02 |
| Баримт (Document) | Document | Гарчиг + төлөв + үйлдэл → толгойн хэсэг → **мөрүүд** (AG Grid) → нийлбэрийн самбар → хажуугийн самбар | Автомат (§4.5) | S-SAL-02, S-BNK-03 |
| Ажлын хуудас (Worksheet) | Worksheet | Batch/данс сонгогч → мөрүүд (бүтэн өргөн) → доод талын тэнцлийн самбар | Мөр бүр автомат | S-GL-03, S-BNK-09 |
| Тайлан (Report) | Report + request page | Зүүн/дээд: шүүлтүүрийн самбар → [Харах] → үр дүнгийн хүснэгт (drill-down) → [Excel] [PDF] | Хадгалахгүй. Шүүлтүүр URL-д | S-RPT-02, S-TAX-03 |
| Wizard | NavigatePage | Алхмын заагч → алхмын агуулга → [Буцах] [Дараах] / [Дуусгах] | Алхам бүрд (§10.3) | S-PLT-06, S-BNK-08 |
| Dialog | ConfirmationDialog / StandardDialog | Гарчиг → талбар → [Үндсэн] [Болих] | Үндсэн товчоор | Төлбөр бүртгэх, Цуцлах |
| Хажуугийн самбар (FactBox) | CardPart / ListPart | Жижиг хэсгүүд, эвхэгддэг | Зөвхөн унших | Харилцагчийн статистик, eBarimt төлөв |

### 4.2 Үйлдлийн мөр (action bar)

| ID | Дүрэм |
|---|---|
| UX-PAGE-01 | Үйлдлийн мөрийн дараалал: **үндсэн үйлдэл** (Батлах, Хадгалах биш) → **хоёрдогч** (Урьдчилан харах, Хэвлэх, Илгээх) → **холбоотой** (Бичилт Ctrl+F7, Статистик F7, Dimension Alt+D) → `⋯ Бусад` (overflow). BC-ийн Promoted / Navigate / Report бүлэгтэй ижил. |
| UX-PAGE-02 | Товч бүрийн tooltip-д товчлол: "Батлах (F9)". `aria-keyshortcuts="F9"`. |
| UX-PAGE-03 | **Эрхгүй** үйлдэл харагдахгүй. **Төлвийн улмаас** боломжгүй үйлдэл (жишээ нь төлөгдсөн нэхэмжлэхийг цуцлах) идэвхгүй харагдаж, tooltip-д шалтгаан: "Төлбөрт тулгагдсан. Эхлээд тулгалтыг цуцална уу." Клиент мэдэхгүй нөхцлийг сервер 422-оор буцаана (§8). |
| UX-PAGE-04 | Нэг хуудсанд үндсэн үйлдэл нэг. Үндсэн товч `primary` хэв маягтай; бусад нь `secondary`/`ghost`. |
| UX-PAGE-05 | Overflow цэсийг Shift+F10 эсвэл `⋯` товчоор нээнэ; ↑↓ Enter Esc-ээр удирдана (ARIA `menu`). |
| UX-PAGE-06 | Хор хөнөөлтэй үйлдэл (Цуцлах, Буцаах, Ноорог устгах, Үе түгжих) `danger` хэв маягтай, заавал баталгаажуулах dialog-той (§4.7). |

### 4.3 Талбарын бүлэг (FastTab) ба талбар

- **UX-PAGE-07.** Карт ба баримтын толгой хэсгүүдэд хуваагдана (жишээ нь "Ерөнхий", "Нэхэмжлэх", "Төлбөр", "eBarimt"). Хэсэг эвхэгдэнэ (Alt+F6). Эвхэгдсэн хэсгийн гарчигт гол утгын товчлол харагдана (BC FastTab summary).
- **UX-PAGE-08.** Хэсэг бүр "Дэлгэрэнгүй харуулах / Хураах" товчтой. Ховор талбар (жишээ нь `vat_date`, `external_document_no`, posting group) анхдагчаар нуугдана. Нуугдсан талбар алдаатай бол хэсэг автоматаар дэлгэгдэнэ.
- **UX-PAGE-09.** Заавал талбарын шошгонд `*` (aria-hidden) ба `aria-required="true"`. Хоосон заавал талбарыг хадгалах үед биш, **батлах** үед алдаа болгоно (ноорог дутуу байж болно), карт үүсгэхэд шаардлагатай талбараас бусад.
- **UX-PAGE-10.** Зөвхөн унших талбар input биш, текст (`<output>` эсвэл `<dd>`) хэлбэрээр; Tab-ын дараалалд орохгүй, гэхдээ уншигдана.
- **UX-PAGE-11.** Lookup талбар (харилцагч, данс, бараа) нь combobox: бичихэд шууд хайна (дугаар, нэр, `search_name`, ТТД), Alt+↓ жагсаалт нээнэ, Ctrl+Alt+↓ холбоотой картыг нээнэ (BC). Олдохгүй утгад "+ Шинэ харилцагч «…» үүсгэх" сонголт (тухайн хүснэгтийн I эрхтэй бол).

### 4.4 Хажуугийн самбар (FactBox)

- **UX-PAGE-12.** Alt+F2 нээх/хаах. Нээлттэй эсэх нь хэрэглэгч ба хуудасны төрлөөр `localStorage`-д хадгалагдана. < 1280 px үед самбар drawer болно (§12).

| Хуудас | FactBox-ийн хэсгүүд |
|---|---|
| Борлуулалтын ноорог | Харилцагчийн статистик (үлдэгдэл, хугацаа хэтэрсэн, зээлийн хязгаар, сүүлийн төлбөр), Сонгосон мөрийн дэлгэрэнгүй (данс, НӨАТ-ын бүлэг, БҮНА), Хавсралт |
| Батлагдсан нэхэмжлэх / кредит нот | eBarimt төлөв (§5.8), Төлбөрийн төлөв (үлдэгдэл, тулгагдсан төлбөр), Илгээлт (имэйл), Хавсралт, Гарын үсэг |
| Кассын баримт | Кассын үлдэгдэл (өмнө / дараа), Харилцагчийн нээлттэй баримт |
| Харилцагчийн карт | Статистик (үлдэгдэл, хугацаа хэтэрсэн, энэ жилийн борлуулалт), ТТД-ийн шалгалт (`getInfo`-ийн огноо), Хавсралт |
| Дансны карт / CoA | Дансны үлдэгдэл (энэ сар, жил), Маягт А-гийн мөр |
| Журнал | Сонгосон мөрийн дансны нэр ба үлдэгдэл, харьцсан дансны нэр ба үлдэгдэл (BC "Account Name", "Balance") |

### 4.5 Хадгалах загвар (autosave)

BC нь талбараас гарахад бичлэгийг хадгалдаг. Манайд ноорог ба мастер өгөгдөл **автоматаар** хадгалагдана. Сервер `ETag`/`If-Match` (02 §8.6) ба `Idempotency-Key` (18 §3.4) шаардана.

```text
state: etag, isNew, dirty = { header: {}, lines: { upsert: Map, delete: Set } }, inFlight = null, again = false, createKey = uuidv7()

onFieldCommit(field, value):                   -- blur, Enter, lookup-ээс сонгох
    if not FormatValid(field, value): ShowFieldError(field, ui.*); return          -- §7.3: формат буруу бол илгээхгүй
    dirty.header[field] := value; ScheduleSave(800 ms)

onLineCommit(row):                             -- мөрөөс гарах (↑↓, Tab сүүлийн нүднээс, хулгана)
    if row.isBlankNew: return                  -- хоосон шинэ мөрийг хадгалахгүй
    if not FormatValidRow(row): MarkRowErrors(row); return
    dirty.lines.upsert[row.key] := row.changes; ScheduleSave(800 ms)

Flush():                                       -- debounce дуусах, Ctrl+S, хуудаснаас гарах
    if inFlight: again := true; return inFlight
    if Empty(dirty): return
    if isNew and not CanCreate(dirty): return  -- жишээ нь нэхэмжлэхэд customerId заавал (sales_header.customer_id NOT NULL)
    batch := TakeAndClear(dirty)
    key := isNew ? createKey : uuidv7()
    req := isNew ? POST collection {body: batch, Idempotency-Key: key}
                 : PATCH item {body: batch, If-Match: etag, Idempotency-Key: key}
    inFlight := Send(req, retry = [1 s, 2 s, 4 s] on network/5xx/503, SAME key)
    on 200/201: etag := ETag; isNew := false
                ApplyServerValues(resp, except fields edited since batch was taken)   -- нийлбэр, мөрийн дүн, анхдагч утга
                SaveIndicator('saved', now)
    on 412:     OpenConflictDialog(batch)                                             -- UX-SAVE-04
    on 422:     MergeBack(batch); MapProblemErrors(resp)                             -- §8.2
    on 404/409: ShowBanner(ui.document_gone); ResolvePosted()                         -- UX-NAV-10
    on final failure: MergeBack(batch); SaveIndicator('failed')                       -- [Дахин оролдох]
    finally: inFlight := null; if again: again := false; Flush()
```

| ID | Дүрэм |
|---|---|
| UX-SAVE-01 | Нэг хуудсанд нэг зэрэг **нэг л** хадгалах хүсэлт. Дараагийн өөрчлөлт хүлээж, нэг хүсэлтэд нийлнэ. |
| UX-SAVE-02 | Хадгалах төлвийн заагч толгойд: "Хадгалж байна…", "Хадгалсан 10:42", "Хадгалаагүй өөрчлөлт", "Хадгалж чадсангүй [Дахин оролдох]". `aria-live="polite"`. |
| UX-SAVE-03 | Ctrl+S шууд `Flush()` (браузерийн "Save page"-ийг `preventDefault`). Ctrl+Enter = хадгалж хаах (BC). |
| UX-SAVE-04 | **412 (зөрчил):** dialog "Энэ баримтыг өөр хэрэглэгч (Сарнай, 10:41) өөрчилсөн." [Шинэ хувилбарыг ачаалах] (миний хадгалаагүй өөрчлөлт устна) / [Миний өөрчлөлтийг шинэ хувилбар дээр хэрэглэх] (талбар бүрээр дахин хэрэглэж, шинэ ETag-аар хадгална; ижил талбарыг хоёулаа өөрчилсөн бол тэр талбарыг тодруулж харуулна). Шийдтэл засвар хаалттай. |
| UX-SAVE-05 | Шинэ бичлэг: заавал түлхүүр талбар бөглөгдөхөөс өмнө серверт илгээхгүй (BC DelayedInsert). Нэхэмжлэх — харилцагч; харилцагч — нэр (загвараас posting group); данс — дугаар, нэр, төрөл. `createKey` нь хуудас нээгдэхэд нэг удаа үүсч, давтан оролдлогод ижил (давхар үүсэхээс хамгаална). |
| UX-SAVE-06 | **Хуудаснаас гарах:** route солих, компани солих, tab хаахын өмнө `Flush()`-ийг 5 s хүлээнэ. Амжилтгүй бол dialog [Хадгалахгүй гарах] [Үлдэх]. Хадгалаагүй өөрчлөлттэй үед `beforeunload` анхааруулга. |
| UX-SAVE-07 | Батлагдсан баримт, ledger, түгжигдсэн үеийн бичлэг **зөвхөн унших** горимоор нээгдэнэ (талбар input биш). |
| UX-SAVE-08 | Аудит: ноорог ба мастерын хадгалалт бүр `audit.row_change`-д мөр болно (FR-PLT-009). Debounce 800 ms нь мөрийн тоог бууруулна. Нэг хадгалалт = нэг transaction (02 §5.3 #1). |

### 4.6 Жагсаалт

| ID | Дүрэм |
|---|---|
| UX-PAGE-13 | Keyset хуудаслалт (`?after=<cursor>&limit=50`, 02 §5.3, 18 §3.4). AG Grid-ийн infinite row model, block = 50 мөр (§6.8). Эрэмбэ солиход cursor шинэчлэгдэнэ. |
| UX-PAGE-14 | Хайлт (F3): жагсаалтын дээд талын хайлтын талбар; сервер талд `pg_trgm` (ADR-0017 #7). Шүүлтүүрийн самбар (Shift+F3): талбар + оператор + утга; Alt+F3 = сонгосон нүдний утгаар шүүх/цэвэрлэх (BC). |
| UX-PAGE-15 | Анхдагч шүүлтүүр: ноорог жагсаалт — бүгд; батлагдсан баримт — сүүлийн 3 сар (`postingDateFrom = D − 3 сар`), шүүлтүүрийн chip-ээр харагдана, хасаж болно. |
| UX-PAGE-16 | Нийлбэр (жишээ нь Σ дүн) серверийн `totals` объектоос; клиент нийлүүлэхгүй (ADR-0015 #2). Ачаалсан мөрөөр биш, бүх шүүлттэй мөрөөр. |
| UX-PAGE-17 | Олон мөр сонгох (checkbox, Shift/Ctrl + товшилт, Ctrl+A) нь бөөн үйлдэлд (жишээ нь "Сонгосныг батлах" — журнал; "Excel рүү") л. Бөөн батлах нь мөр тус бүр дээр хүсэлт илгээж, үр дүнг жагсаана (амжилттай / алдаатай). |
| UX-PAGE-18 | Excel/PDF экспорт = серверийн ClosedXML/QuestPDF (ADR-0019), **үргэлж async** (14 API-JOB-01): `POST /reports/{code}:export` (эсвэл `vat-return-periods/{id}:export`) → 202 + `Job`. UI нь toast "Экспорт бэлтгэж байна…" харуулж `GET /jobs/{id}`-ийг `Retry-After` (≥ 2 s)-ээр шалгана; 10 s дотор `SUCCEEDED` бол `result.file.downloadUrl`-ийг шууд татна, эс бөгөөс "Бэлэн болмогц мэдэгдэнэ" ба S-PLT-18 / мэдэгдлийн самбарт (15 мин хүчинтэй холбоог дахин `GET /jobs/{id}`-ээр шинэчилнэ). Синхрон тайлан `422 api.result_too_large` (> 5 000 мөр) буцаавал "Үр дүн хэт их. Excel рүү экспортлох уу?" [Экспорт]. Экспорт PII-ийг маскална (SEC-PII-10). |
| UX-PAGE-19 | Мөр дээр Enter эсвэл давхар биш **нэг** товшилт картыг нээнэ (бичлэгийн дугаар нүд холбоос). Карт дээрээс Ctrl+↑/↓ өмнөх/дараагийн бичлэг (BC). |

### 4.7 Баталгаажуулах dialog

- **UX-PAGE-20.** Батлах, цуцлах, буцаах, устгах, үе хаах/түгжих/нээх үйлдэлд dialog. Текст нь **үр дагаврыг** хэлнэ: "Нэхэмжлэхийг батлах уу? Батлагдсан нэхэмжлэхийг засах боломжгүй. Залруулахдаа кредит нот үүсгэнэ."
- **UX-PAGE-21.** Товч: [Тийм] (анхдагч фокус, Enter) / [Үгүй] (Esc). Үсгээр: `Т`/`Y` = Тийм, `Ү`/`N` = Үгүй (BC Y/N-тэй ижил; хоёр гарын байрлалд ажиллана). Хор хөнөөлтэй үйлдэлд (Цуцлах, Үе түгжих) анхдагч фокус [Үгүй] дээр.
- **UX-PAGE-22.** Анхааруулга (§8.4) байвал батлах dialog-д жагсаана: "Анхааруулга (2): Бүртгэлийн огноо өнөөдрөөс 45 хоногийн өмнө; Харилцагчийн зээлийн хязгаар хэтэрнэ."
- **UX-PAGE-23.** Буцаагдахгүй (`gl.period.lock`, `tax.vat_return.submit`) эсвэл хуулийн эрсдэлтэй (`gl.period.reopen` — зөвхөн Owner, шалтгаантай, D-D3) үйлдэлд хэрэглэгч баталгаажуулах үг бичнэ (жишээ нь "ТҮГЖИХ", "НЭЭХ").

### 4.8 Дахин баталгаажуулалт (step-up)

- **UX-PAGE-24.** Сервер `403 platform.reauth_required` буцаавал (13 §5.7) SPA `StepUpDialog` нээнэ: MFA-тай бол TOTP код (6 орон, paste зөвшөөрнө — WCAG 3.3.8), үгүй бол нууц үг. `POST /api/v1/me:reauth` амжилттай бол **ижил хүсэлтийг ижил `Idempotency-Key`-ээр** дахин илгээнэ. Хэрэглэгч болих бол үйлдэл цуцлагдана.
- **UX-PAGE-25.** `403 platform.mfa_enrollment_required` (13 §5.5) → бүтэн хуудсаар MFA бүртгэлийн урсгал (S-PLT-02) руу шилжинэ; зөвхөн `/api/v1/me/*` ажиллана.

### 4.9 Тууз (banner)

| ID | Нөхцөл | Текст (mn) | Хэв маяг | Хаагдах эсэх |
|---|---|---|---|---|
| UX-PAGE-26 | Support хандалт идэвхтэй (FR-PLT-016) | "Support хандалт идэвхтэй: {{until}} хүртэл ({{scope}})" | warning | Үгүй |
| UX-PAGE-27 | Тенант `READ_ONLY` (FR-PLT-018) | "Захиалга дууссан. Зөвхөн унших ба архив татах боломжтой." | warning | Үгүй |
| UX-PAGE-28 | Туршилтын компани (`is_demo`) | "Туршилтын компани. Энд хийсэн бичилт хуулийн бүртгэл биш." | info | Үгүй |
| UX-PAGE-29 | Ажлын огноо ≠ өнөөдөр | "Ажлын огноо: {{workDate}}" [Өнөөдөр болгох] | info | Үгүй |
| UX-PAGE-30 | Сүлжээ тасарсан (`navigator.onLine = false` эсвэл 3 дараалсан network алдаа) | "Холболт тасарсан. Өөрчлөлт хадгалагдаагүй байж болно." | danger | Автомат |
| UX-PAGE-31 | Шинэ хувилбар гарсан (nginx-ийн статик `/version.json`-ийн build hash өөрчлөгдсөн; 5 мин тутам, UX-NAV-18a-ын polling дүрмээр; API endpoint шаардахгүй) | "Шинэ хувилбар бэлэн." [Дахин ачаалах] (хадгалсны дараа) | info | Тийм |
| UX-PAGE-32 | Үе `CLOSED`/`LOCKED` (баримтын бүртгэлийн огноо тэр үед) | "{{period}} хаагдсан. Энэ огноогоор батлах боломжгүй." | warning | Үгүй |

Нэг зэрэг хамгийн ихдээ 2 тууз; илүү бол "+N" товч. Тууз `role="status"` (danger бол `role="alert"`).

---

## 5. Баримтын хуудасны зан төлөв

### 5.1 Төлөвийн загвар ба тэмдэг

```text
UI төлөв (баримт):
  ШИНЭ (серверт байхгүй) ──customer сонгох──▶ НООРОГ (sales_header.status = OPEN)
  НООРОГ ──Бэлэн болгох (Ctrl+F9)──▶ БЭЛЭН (RELEASED) ──Дахин нээх──▶ НООРОГ
  НООРОГ | БЭЛЭН ──Батлах (F9)──▶ БАТЛАГДСАН ─┬─ Төлөгдөөгүй | Хэсэгчлэн төлөгдсөн | Төлөгдсөн   (cust_ledger_entry)
                                             ├─ Цуцлагдсан (cancelled_document-д эх)
                                             └─ Залруулгын кредит нот (cancelled_document-д шинэ)
  НООРОГ ──Устгах──▶ ∅ (дугаарын завсар үүсэхгүй, FR-SAL-015)
```

```text
function DisplayBadge(doc, D):                      -- doc = API-ийн SalesInvoice/SalesCreditMemo (14 §8.4, §16.1)
    -- status, paymentStatus, isCancellation-ийг СЕРВЕР тооцно; UI зөвхөн огноог харьцуулна (Z-UI-12)
    if doc.status == 'DRAFT':     return DRAFT
    if doc.status == 'RELEASED':  return RELEASED
    if doc.status == 'CANCELLED': return CANCELLED                     -- нэхэмжлэх, cancellationCreditMemoId-тэй
    if doc.isCancellation:        return CORRECTIVE                    -- цуцлалтаас үүссэн кредит нот
    if doc.paymentStatus == 'PAID': return PAID                       -- кредит нотоор хаагдсан ч PAID (API-ACT-19)
    if doc.dueDate is not null and doc.dueDate < D:
        return OVERDUE                                                -- UNPAID эсвэл PARTIALLY_PAID + хугацаа хэтэрсэн
    return doc.paymentStatus                                          -- UNPAID | PARTIALLY_PAID
```

- **UX-DOC-14.** `OVERDUE` тэмдэг нь `PARTIALLY_PAID`-ийг давамгайлна; tooltip-д хоёуланг нь: "Хугацаа хэтэрсэн · Хэсэгчлэн төлөгдсөн · үлдэгдэл 350,000.00". Жагсаалтын шүүлтүүр `?payment=OVERDUE`-ийг клиент `paymentStatus=UNPAID,PARTIALLY_PAID&dueTo=D−1` болгон серверт илгээнэ (сервер `OVERDUE` утгыг мэдэхгүй).

| Төлөв | Тэмдгийн текст (mn) | Token | Дүрс |
|---|---|---|---|
| `DRAFT` (OPEN) | Ноорог | `status.neutral` | ✎ |
| `RELEASED` | Бэлэн | `status.info` | ☐✓ |
| `UNPAID` | Төлөгдөөгүй | `status.info` | ○ |
| `OVERDUE` | Хугацаа хэтэрсэн | `status.danger` | ⚠ |
| `PARTIALLY_PAID` | Хэсэгчлэн төлөгдсөн | `status.warning` | ◐ |
| `PAID` | Төлөгдсөн | `status.success` | ● |
| `CANCELLED` | Цуцлагдсан | `status.neutral` (зураастай) | ⊘ |
| `CORRECTIVE` | Залруулгын кредит нот | `status.neutral` | ↺ |

`OVERDUE` ба `CORRECTIVE` нь UI-ийн тэмдэг (API-ийн enum биш, Z-UI-12); бусад нь API-ийн `status`/`paymentStatus`-ийн утга.

- **UX-DOC-01.** Төлвийн тэмдэг хуудасны гарчгийн хажууд ба жагсаалтын баганад. Тэмдэг = текст + дүрс + өнгө (зөвхөн өнгө биш).
- **UX-DOC-02.** Жагсаалтад батлагдсан баримт **хоёр** тэмдэгтэй: төлбөрийн төлөв ба eBarimt-ийн төлөв (§5.8, FR-SAL-014).

### 5.2 Толгой ба мөр

- **UX-DOC-03.** Харилцагч сонгоход сервер анхдагч утгыг бөглөнө: posting group, төлбөрийн нөхцөл → төлөх огноо, төлбөрийн хэлбэр, "Үнэ НӨАТ-тэй", eBarimt-ийн төрөл, ТТД (FR-SAL-001 AC2). Мөр байгаа үед харилцагч солиход dialog: "Харилцагч солиход мөрийн НӨАТ ба дансны тохиргоо дахин тооцогдоно. Үргэлжлүүлэх үү?" (BC "Do you want to change…").
- **UX-DOC-04.** Бүртгэлийн огноо: шинэ баримтад ажлын огноо (`sales_setup.default_posting_date = 'WORK_DATE'`), `NO_DATE` бол хоосон (батлахад заавал). `link_doc_date_to_posting_date = true` бол бүртгэлийн огноо өөрчлөгдөхөд баримтын огноо дагана.
- **UX-DOC-05.** Хэрэглэгч `due_date`-ийг гараар өөрчилж болно; төлбөрийн нөхцөл солиход дахин тооцогдоно.
- **UX-DOC-06.** eBarimt-ийн хэсэг (нэхэмжлэх): Төрөл (Автомат = `null` / B2C / B2B / Үгүй; анхдагч нь харилцагчийн `default_ebarimt_type`, `AUTO` → `null`), Худалдан авагчийн ТТД (B2B, `ebarimt_customer_tin`), Иргэний eBarimt дугаар (`ebarimt_consumer_no`, 8 орон, маскаар, 13 §10.4). "Автомат"-ын үр дүнг ("ТТД-тэй ААН → B2B") тайлбар болгон харуулна (12 §4).

### 5.3 Нийлбэрийн самбар

```text
function RenderTotals(doc):
    if doc.server.totalsVersion == doc.localVersion:          -- сүүлийн хадгалалтын хариу
        show doc.server.totals (amount, vatByIdentifier[], cityTax, amountIncludingVat, invoiceRounding?)
    else:
        preview := DecimalPreview(doc.lines)                  -- decimal.js; ITaxCalculator-ийн дүрмийг давтахгүй, ойролцоо
        show preview with prefix "≈" and muted style, aria-label "урьдчилсан"
    amountInWords := doc.server.amountInWords                 -- серверээс (MongolianAmountInWords, ADR-0017 #5)
```

- **UX-DOC-07.** Нийлбэрийн самбар: Дүн (НӨАТ-гүй), НӨАТ (identifier бүрээр: "НӨАТ 10%", "НӨАТ 0%", "Чөлөөлөгдөх"), НХАТ (R2), Бөөрөнхийлөлт (асаалттай бол), **Нийт дүн**, дүн үсгээр. "≈" тэмдэгтэй урьдчилсан утга хадгалалтын хариу ирэхэд серверийн утгаар солигдоно (ADR-0015 #3).
- **UX-DOC-08.** Клиентийн урьдчилсан утга серверийнхээс ялгаатай байх нь алдаа биш. Батлах товч нь серверийн нийлбэр ирсний дараа л идэвхжинэ (хадгалах хүлээгдэж байвал Flush хийнэ).

### 5.4 Батлах (post) урсгал

```text
async function PostDocument(doc, mode):                         -- mode ∈ { POST, POST_AND_PRINT, POST_AND_NEW }
    pdfTab := (mode == POST_AND_PRINT) ? window.open('about:blank') : null    -- popup blocker-оос сэргийлж click дээр нээнэ
    if not await Flush(): Abort(ui.save_failed_before_post)
    errs := ClientPrecheck(doc)          -- харилцагч, бүртгэлийн огноо, ≥ 1 тайлбар биш мөр, тоо > 0, үнэ ≥ 0
    if errs: ShowErrorList(errs); return
    if not await ConfirmPost(doc, doc.server.warnings ∪ ClientWarnings(doc)): return   -- §4.7
    key := doc.pendingPostKey ??= uuidv7()                       -- тодорхой хариу иртэл санах ойд хадгална
    for attempt in 1..3:
        res := POST {doc.url}:post?ebarimtPrint={IsInteractiveB2C(doc) ? 'sync' : 'async'}
                     headers { Idempotency-Key: key, If-Match: doc.etag, X-CSRF: 1 }   -- body байхгүй (14 API-ACT-01)
        case res.status:
          200 → doc.pendingPostKey := null
                print := TakePrintPayload(res.body.ebarimt)      -- ebarimt.print-ийг салгаж, кэшид оруулахгүй (UX-SEC-01)
                Announce(t('sales.post.success', { no: res.body.posting.documentNo }))
                Invalidate(['home', 'salesInvoices', 'customer', res.body.invoice.customerId])   -- ноорог/posted нэг resource
                RenderPosted(res.body.invoice)                   -- ижил id, ижил зам (UX-NAV-10)
                if print: OpenEbarimtPrintModal(print)           -- S-EBR-04
                elif res.headers['Idempotent-Replayed'] and IsInteractiveB2C(doc): Toast(ui.print_payload_unavailable)
                if pdfTab: pdfTab.location := PdfUrl(doc.id)     -- GET …/sales-invoices/{id}/pdf
                if mode == POST_AND_NEW: OpenNewDraftInNewRoute()
                return
          412 → doc.pendingPostKey := null; OpenConflictDialog(res.problem.currentEtag); return   -- api.etag_mismatch
          422 → doc.pendingPostKey := null; ShowErrorList(MapProblem(res)); return          -- 422 үед түлхүүр хадгалагдахгүй (02 §8.5)
          403 platform.reauth_required → if await StepUp(): continue; else return            -- ижил key
          403 → ShowForbidden(); return
          409 api.document_already_posted, 404 → Reload(doc.id); return                    -- өөр хэрэглэгч/өөр key-ээр баталсан
          503 → await Sleep(RetryAfter(res) ?? 2 s); continue                              -- lock timeout (02 §6.10)
          network, 500, 502, 504 → await Sleep(2^attempt s); continue                       -- ижил key = давхардахгүй
    ShowUncertainDialog(doc, key)    -- "Батлалтын үр дүн тодорхойгүй." [Дахин шалгах] = ижил key-ээр дахин илгээх
```

| ID | Дүрэм |
|---|---|
| UX-POST-01 | `Idempotency-Key` нь **батлах товчийг дарахад** үүснэ (02 §8.5) ба тодорхой хариу (200, 412, 422, 403, 404/409) хүртэл бүх давтан оролдлогод ижил. Хэрэглэгч "Дахин шалгах" дарахад ч ижил. |
| UX-POST-02 | Батлах хүсэлт явж байх үед бүх засвар, Батлах товч идэвхгүй; хуудас дээр `aria-busy="true"`, spinner "Батлаж байна…". 10 s-ээс удаан бол "Удаан байна, хүлээнэ үү" (SLO p99 0.8 s, 02 §13). **Клиентийн timeout:** `?ebarimtPrint=sync` үед 35 s (PosAPI timeout 20 s + posting, 02 §13 POS мөр), бусад үед 15 s; timeout нь `network` гэж тооцогдож ижил key-ээр давтана (сервер `409 api.idempotency_in_progress` буцааж болно, §8.6). |
| UX-POST-03 | Амжилттай батлахад toast: "Нэхэмжлэх SI-2026-00042 батлагдлаа" (`aria-live="polite"`), хуулийн дугаар холбоос. Хуудас батлагдсан баримтын карт руу шилжинэ (id тогтвортой, UX-NAV-10). |
| UX-POST-04 | 422-ийн бүх алдааг нэг жагсаалтаар (§8.3). Алдаа бүр холбогдох талбар/мөр/тохиргоо руу "Засах" холбоостой (NFR-121). |
| UX-POST-05 | F9 = Батлах; Shift+F9 = Батлаад хэвлэх; Alt+F9 = Батлаад шинэ ноорог (BC). Ажлын хуудсанд F9 нь batch-ийг батална. |
| UX-POST-06 | Борлуулалтын нэхэмжлэх B2C (**тодорхойлогдсон** төрөл `B2C_RECEIPT`: `ebarimt_receipt_type = 'B2C_RECEIPT'` эсвэл `null` ба серверийн `resolvedEbarimtType = B2C_RECEIPT`) ба интерактив хэрэглэгч бол `?ebarimtPrint=sync` (12 DSP-30, 14 API-ACT-08: cookie session-ийн анхдагч ч `sync`). B2B ба API нь `async`. Хариуны `ebarimt.status` нь `PENDING`/`UNKNOWN`/`ERROR` байж болно; posting амжилттай хэвээр (UX-EBR-06). |
| UX-POST-07 | Батлагдсаны дараа ноорогийн `sessionStorage`/`localStorage`-д үлдсэн UI төлөв (grid-ийн мөрийн өргөн биш, өгөгдөл) байвал устгана. |

### 5.5 Батлахын өмнө харах (preview)

- **UX-POST-08.** "Урьдчилан харах" (Ctrl+Alt+F9 — BC-д товчлол байхгүй тул манай нэмэлт) → `POST …:preview` (`Idempotency-Key` шаардахгүй, `If-Match` сонголттой; 14 API-ACT-09..12). Хариуг **S-GL-08** dialog-оор (≥ 1280 px-д 90% өргөн) харуулна.
- **UX-POST-09.** Tab-ууд (зөвхөн мөртэй нь): "Ерөнхий дэвтэр (3)", "НӨАТ (1)", "Авлага (1)", "Банк/касс (0)", "eBarimt". Ерөнхий дэвтрийн tab: Мөр №, Данс, Дансны нэр, Тайлбар, Дебит, Кредит, Dimension; доор Σ Дебит = Σ Кредит шалгалт ✓.
- **UX-POST-10.** Баримтын дугаар "***", бичилтийн дугаар 1..n (02 §6.7). eBarimt tab: тодорхойлогдсон төрөл (B2C/B2B), `taxType` бүрийн дүн; QR/сугалаа байхгүй.
- **UX-POST-11.** Preview dialog-оос [Батлах] товч (§5.4-ийн урсгал). Preview-ийн хязгаар 30/мин (02 §10.3); 429 бол "Хэт олон удаа урьдчилан харлаа. 1 минутын дараа оролдоно уу."
- **UX-POST-12.** Preview алдаа өгвөл (жишээ нь тэнцэхгүй) §8.3-ын алдааны жагсаалт ижил байдлаар.

### 5.6 Хэвлэх

| ID | Дүрэм |
|---|---|
| UX-PRN-01 | Хуулийн маягтыг **сервер** PDF-ээр (QuestPDF, ADR-0019): `GET …/{doc}/{id}/pdf?form=<code>` → шинэ tab-д браузерийн PDF харагчаар. Файлын нэр `<баримтын дугаар>.pdf`. Хариу `Cache-Control: no-store`. |
| UX-PRN-02 | Маягтын каталог: борлуулалтын нэхэмжлэх → `TM1` (ТМ-1); кредит нот → `SCM` (OQ-UI-07); кассын орлого/зарлага → `MX1`/`MX2`; журналын ваучер → `JV` (Should); харилцагчийн дансны хуулга ба тооцоо нийлсэн акт → `STMT`, `ACT`. |
| UX-PRN-03 | Хуулийн маягт **үргэлж монголоор**. Хэрэглэгчийн хэл англи бол "Англи дэд шошготой" сонголт (FR-PLT-010 AC1). Тайлангийн экспортод (`ReportExportRequest.language`) хуулийн маягт `mn`, бусад тайлан хэрэглэгчийн хэлээр (OQ-UI-24). |
| UX-PRN-04 | Ноорогийг "Урьдчилан хэвлэх" нь "НООРОГ — ХУУЛИЙН БАРИМТ БИШ" усан тэмдэгтэй, хуулийн дугааргүй (Should). |
| UX-PRN-05 | PDF нь eBarimt-ийн QR ба сугалааг **агуулахгүй**; ДДТД-ийг агуулна (12 PRN-13). |
| UX-PRN-06 | МХ-1/МХ-2 дээрх хувь хүний бичиг баримтын дугаар маскгүй хэвлэгдэнэ; сервер `PII_UNMASK` (`purpose = 'PRINT_FORM'`) бичнэ (SEC-PII-11). UI нь хэвлэх товчийн tooltip-д "Хувийн мэдээлэлтэй маягт" гэж анхааруулна. |
| UX-PRN-07 | Popup blocker: PDF tab-ийг click-ийн синхрон хэсэгт `window.open` хийж, URL-ийг дараа нь онооно (§5.4). Нээгдээгүй бол toast-д холбоос. |

### 5.7 Имэйлээр илгээх

| ID | Дүрэм |
|---|---|
| UX-MAIL-01 | "Имэйлээр илгээх" (S-SAL-10) dialog: Хүлээн авагч (анхдагч `customer.email`), CC, Гарчиг (`sales.email.subject`: "{{company}} — нэхэмжлэх {{no}}"), Агуулга (загвар), PDF хавсаргах (анхдагч ✔). Эрх `X sales.document.send` (CR-23). |
| UX-MAIL-02 | Илгээх → `POST …/sales-invoices/{id}:send` (`Idempotency-Key`) → 202 (14 §2.5). Имэйл outbox-оор commit-ийн дараа явна (FR-SAL-012). Toast: "Илгээх дараалалд орлоо." |
| UX-MAIL-03 | FactBox "Илгээлт": огноо, хүлээн авагч (маскаар, 13 §10.4: `b***@gmail.com`), төлөв (Хүлээгдэж буй / Илгээсэн / Амжилтгүй + шалтгаан), [Дахин илгээх] (шинэ key). Эх: SCR-UI-04. |
| UX-MAIL-04 | Имэйлийн агуулга ба хавсралтад QR/сугалаа байхгүй (12 PRN-13). |
| UX-MAIL-05 | Имэйлийн хаягийн формат клиент талд шалгагдана (`ui.email_invalid`); олон хаягийг таслал эсвэл цэг таслалаар. |

### 5.8 eBarimt-ийн төлөв ба хэвлэх цонх

UI төлөвийг сервер гаргана: API-ийн `ebarimt.chainStatus` (14 API-ACT-20; эх нь 12 §9.4-ийн read model, `ebarimt.v_source_document_status`, 12 SCR-12). UI зөвхөн харуулна. Нэхэмжлэх дээр **гинжийн** төлөв, кредит нот дээр өөрийн баримтын төлөв.

| `chainStatus` | UI төлөв | Тэмдэг | Token | Тайлбар (FactBox) | Үйлдэл (эрхтэй бол) |
|---|---|---|---|---|---|
| `NOT_REQUIRED` | Шаардлагагүй | — | `status.neutral` | "Энэ баримтад eBarimt гаргахгүй." | — |
| `NOT_CONFIGURED` | Тохируулаагүй | ⚠ | `status.warning` | "eBarimt тохируулаагүй тул баримт гараагүй." | [eBarimt тохируулах] (`T_SETUP` M); тохируулсны дараа [Нөхөж илгээх] (`POST /ebarimt/backfill:preview` → `/backfill`, `ebarimt.unknown.resolve`, 12 RET-70) |
| `PENDING` | Хүлээгдэж буй | ⏳ | `status.info` | "Илгээх дараалалд байна." | B2C бол [Илгээж хэвлэх] (`POST /ebarimt/documents/{id}:send-and-print`, `sales.document.print` X) → хариунд `print` байвал S-EBR-04. Төлвийг 5 s тутам шинэчилнэ (2 мин хүртэл, дараа нь 30 s) |
| `SENT` | Илгээж байна | ⟳ | `status.info` | "PosAPI руу илгээж байна." | — |
| `SUCCESS` | Бүртгэгдсэн | ✓ | `status.success` | ДДТД (monospace, хуулах товч), огноо, төрөл, нийт, НӨАТ | [Хуулбар хэвлэх] (`GET /ebarimt/documents/{id}/copy.pdf`, "ХУУЛБАР", QR-гүй, 12 PRN-10) |
| `ERROR` | Татгалзсан | ✕ | `status.danger` | `error_code`-ийн i18n мессеж (`errors.ebarimt.*`) | [eBarimt хяналт руу] (`ebarimt.unknown.resolve`) |
| `UNKNOWN` | Тодорхойгүй | ? | `status.danger` | "Илгээсэн эсэх нь тодорхойгүй. Гараар шийдвэрлэнэ." | [eBarimt хяналт руу] |
| `CORRECTED` | Засварлагдсан | ↺ | `status.neutral` | Гинжийн түүх: өмнөх ДДТД → шинэ ДДТД (`inactiveId`) | [Гинж харах] (S-EBR-03) |
| `VOIDED` | Цуцлагдсан | ⊘ | `status.neutral` | "eBarimt цуцлагдсан." (`DELETE` эсвэл порталын гар цуцлалт) | — |

| ID | Дүрэм |
|---|---|
| UX-EBR-01 | Баримтын хуудсан дээр "Дахин илгээх" товч **байхгүй** (D-J2). Дахин илгээх (клон) нь зөвхөн S-EBR-02-оор, `ebarimt.unknown.resolve` эрхээр, 12 §11-ийн журмаар. `PENDING` B2C-ийн [Илгээж хэвлэх] нь дахин илгээх биш: хараахан илгээгдээгүй баримтыг worker-ээс өмнө синхроноор илгээнэ (12 §18.1); сервер давхар илгээлтээс lease-ээр хамгаална. |
| UX-EBR-02 | **Хэвлэх цонх (S-EBR-04)** нь `:post?ebarimtPrint=sync` эсвэл `:send-and-print`-ийн хариунд `ebarimt.print` байвал (`printAvailable = true`) автоматаар нээгдэнэ. Агуулга (12 §13.2): мерчант, ТТД, салбар/POS, ДДТД, огноо/цаг, мөрүүд, НӨАТ, нийт, төлбөрийн хэлбэр, **QR** (bundled `qrcode`, error correction M, `qrData`-г өөрчлөлтгүй), **сугалааны дугаар**. |
| UX-EBR-03 | Хэвлэх цонхонд [Хэвлэх (Ctrl+P)] ба [Хаах]. Хэвлээгүй үед хаахад: "QR кодыг дахин хэвлэх боломжгүй. Хаах уу?" (12 PRN-11). Route солих, tab хаах үед ижил анхааруулга. |
| UX-EBR-04 | Print CSS: зөвхөн баримтын хэсэг; өргөн 80 mm (58 mm сонголт "Миний тохиргоо"-нд). `@page { size: 80mm auto }` нь CSS Paged Media-д **хүчингүй** (урт + `auto` холих боломжгүй, браузер үл тооно) тул хэвлэхийн өмнө баримтын өндрийг хэмжиж `CSSStyleSheet.insertRule('@page { size: 80mm <H>mm; margin: 0 }')`-ээр онооно (CSSOM нь CSP-ийн inline хоригт хамаарахгүй, UX-SEC-04); хэмжиж чадаагүй бол `size: 80mm 297mm` ба принтерийн driver-ийн roll paper тохиргоо. Баримтын загвар **монголоор** (хэрэглэгчийн хэлнээс үл хамаарна). |
| UX-EBR-05 | Цонх хаагдахад `PrintPayload`-ийн бүх хуулбарыг (React state, ref, canvas) цэвэрлэнэ (12 PRN-04). |
| UX-EBR-07 | S-EBR-01/S-EBR-06-д `district_code`, `branch_no`, `pos_no`-г солих үед `PENDING` баримт байвал хадгалахаас өмнө "N баримт илгээгдэхийг хүлээж байна. Өөрчлөлт зөвхөн шинэ баримтад нөлөөлнө; хүлээгдэж буй баримт `ebarimt.request_drift` алдаа болж болзошгүй" гэж баталгаажуулна (12 SET-08). `merchant_tin` нь ACTIVE мерчантад засагдахгүй (`ebarimt.merchant_tin_locked`). |
| UX-EBR-06 | eBarimt-ийн ERROR/UNKNOWN нь батлагдсан баримтын **ledger-т нөлөөлөхгүй** гэдгийг тайлбарлана: "Нэхэмжлэх батлагдсан. Зөвхөн eBarimt-ийн баримт асуудалтай." |

### 5.9 Залруулах үйлдэл

| Үйлдэл | Хаана | Эрх | Идэвхтэй нөхцөл (клиент, API-ийн талбараар) | Dialog-ийн талбар | API (14) | Үр дүн |
|---|---|---|---|---|---|---|
| Нэхэмжлэх цуцлах | S-SAL-06 | `X sales.invoice.cancel` | `status = POSTED`, `paymentStatus = UNPAID` (`remainingAmount` = нийт), `ebarimt.chainStatus ≠ UNKNOWN` | Огноо (анхдагч ажлын огноо), Шалтгааны код (заавал, анхдагч `CANCEL`), Тайлбар (≤ 100) | `POST /sales-invoices/{id}:cancel` `{ reasonCodeId, postingDate, description }` → 201, `Location` | Бүтэн кредит нот батлагдаж тулгагдана (D-F6, FR-SAL-008); `Location`-ийн кредит нот руу шилжинэ |
| Засах | S-SAL-06 | `X sales.invoice.cancel` + `I sales.sales_header` | Цуцлахтай ижил | Цуцлахтай ижил | Ижил + `createCorrectiveDraft: true` | Цуцлаад `correctiveDraftId` ноорог руу шилжинэ (FR-SAL-009, API-ACT-15) |
| Кредит нот үүсгэх | S-SAL-06 | `X sales.creditmemo.post` + `I sales.sales_header` | `status = POSTED` | — | `POST /sales-credit-memos` `{ customerId, correctedInvoiceId }` (+ мөр хуулах: A-13) | Эх нэхэмжлэхийг заасан (`appliesToDocNo` автомат) кредит нотын ноорог (FR-SAL-007) |
| Хуулах | S-SAL-02/06 | `I sales.sales_header` | Үргэлж | — | `POST /sales-invoices/{id}:copy` `{ documentDate, includeHeader }` → 201 | Хуулийн дугааргүй шинэ ноорог (FR-SAL-010) |
| Төлбөр бүртгэх | S-SAL-06 | `X bank.payment.post` эсвэл `X bank.cash_receipt.post` | `paymentStatus ≠ PAID` | Дүн (анхдагч `remainingAmount`), Мөнгөний данс, Огноо | `POST /payments` `{ direction: RECEIPT, applyTo: [{ ledgerEntryId, amountToApply }] }` | Төлбөр батлагдаж тулгагдана (FR-BNK-006) |
| Гүйлгээ буцаах | S-GL-07 | `X gl.transaction.reverse` | `GlTransaction.reversible = true` (сервер тооцно: журналаас үүссэн, буцаагдаагүй, эх үе `OPEN`, D-D5) | Шалтгааны код (заавал), Тайлбар | `POST /gl-transactions/{id}:reverse` → 201 | Эх огноогоор эсрэг гүйлгээ |
| Залруулах журнал үүсгэх | S-GL-07 | `I gl.journal_line` | Журналаас үүссэн, буцаагдаагүй, гэхдээ эх үе `CLOSED`/`LOCKED` (тул `reversible = false`). Баримтаас үүссэн бол кредит нот (D-D5) | Огноо (нээлттэй үе), Шалтгаан | Клиент толин тусгал мөрийг `POST /journals/{id}/lines`-аар нэмнэ | Толин тусгал мөртэй **ноорог** журнал (батлахгүй) |

- **UX-DOC-13.** Идэвхгүй товчийн tooltip нь шалтгааныг хэлнэ: "Хэсэгчлэн төлөгдсөн. Эхлээд тулгалтыг цуцлана уу." (FR-SAL-008 AC2-ын текст). Сервер `409 sales.invoice_has_applications`-ийн `detail`-д ижил текстийг буцаана.
- **UX-DOC-09.** Цуцлах dialog нь eBarimt-д юу болохыг серверийн `ebarimtEffect`-ээр харуулна: "B2C баримт устгагдана (DELETE)", "Баримт засварлагдана (inactiveId)", "Өмнөх сарын B2B: 7-ны дотор засна (reportMonth)" (12 §12.1). Эх: A-07 (`cancel-effects`). Сервер энэ талбарыг өгөхгүй бол мөрийг харуулахгүй (OQ-UI-08).
- **UX-DOC-15.** Идэвхгүй товчны шалтгааныг клиент API-ийн талбараас гаргана: `paymentStatus = PARTIALLY_PAID`/`PAID` → "Төлбөрт тулгагдсан…"; `status = CANCELLED` → "Аль хэдийн цуцлагдсан"; `ebarimt.chainStatus = UNKNOWN` → "eBarimt тодорхойгүй. Эхлээд eBarimt хяналтаар шийдвэрлэнэ үү." Клиент мэдэхгүй нөхцлийг (үе хаалттай) сервер буцаана: `409 sales.invoice_has_applications`, `409 sales.invoice_already_cancelled`, `409 ebarimt.predecessor_unknown`, `422 gl.period_closed`, `409 gl.reversal_use_credit_memo`, `409 gl.reversal_entries_applied`, `409 bank.entry_reconciled` (14 API-ACT-14, 17) → §8.3-ын жагсаалт dialog дотор.

### 5.10 Хавсралт ба гарын үсэг (Should)

- **UX-DOC-10.** FactBox "Хавсралт (n)": [Файл нэмэх] товч + чирж буулгах (чирэх нь цорын ганц арга биш — WCAG 2.5.7). PDF, JPG, PNG, XLSX, ≤ 20 MB (FR-PLT-011). Вирус шалгалт дуустал "Шалгаж байна" (CR-22 `av_status`). Батлагдсан баримтад зөвхөн нэмнэ; устгах товч байхгүй.
- **UX-DOC-11.** FactBox "Гарын үсэг": үүрэг бүр (Бэлтгэсэн, Баталсан, Кассчин …) — зурсан хүн, цаг, эсвэл [Гарын үсэг зурах] (step-up, 13 §5.7). PDF-ийн hash таарахгүй бол ⚠ "Баримт гарын үсэг зурсны дараа өөрчлөгдсөн" (FR-PLT-012).

### 5.11 Ноорог устгах

- **UX-DOC-12.** "Устгах" (overflow-д) → dialog "Ноорог DSI-000123-ийг устгах уу? Хуулийн дугаарт нөлөөлөхгүй." → `DELETE` (`If-Match`, `Idempotency-Key`). Амжилттай бол жагсаалт руу буцаж, toast-д [Буцаах] **байхгүй** (устгалт эцсийн; аудитад үлдэнэ).


### 5.12 UI-ийн аюулгүй байдал ба нууцлал

| ID | Дүрэм | Эх |
|---|---|---|
| UX-SEC-01 | **`PrintPayload`-ийн тусгаарлалт.** Батлах mutation хариуг кэшид орохоос өмнө `{ result, print }` болгон салгана; `print`-ийг зөвхөн хэвлэх цонхны `useRef`-д. TanStack mutation `gcTime: 0`; query cache, глобал store, URL, `history.state`, лог, алдааны тайланд орохгүй. ESLint-ийн өөрсдийн дүрэм: `PrintPayload` төрлийн утгад `console.*`, `JSON.stringify`, storage API хориотой. Вэб telemetry-ийн redaction жагсаалтад `qrData`, `lottery`. | D-J3, 12 PRN-01..04, ADR-0020 |
| UX-SEC-02 | **Browser storage-ийн зөвшөөрсөн жагсаалт:** зөвхөн UI-ийн тохиргоо — grid-ийн баганын төлөв, сүүлд нээсэн бичлэг (төрөл, id, гарчиг), FactBox нээлттэй эсэх, нүүрийн хувилбар (`localStorage`), ажлын огноо (`sessionStorage`). Түлхүүр `ui:`-ээр эхэлж `userId`-тай. **Хориотой:** токен (BFF-ийн cookie л), маскгүй PII, мөнгөн дүн, баримтын өгөгдөл, `PrintPayload`, problem details. Гарахад тухайн хэрэглэгчийн `ui:recent:*` устгана. Унших/бичих `try/catch`-тэй. | ADR-0015 #4, ADR-0016 |
| UX-SEC-03 | **Маскгүй утга (`MaskedValue`):** unmask-ийн хариуг 60 s харуулаад арилгана (13 §10.5); form-ийн state эсвэл кэшид хуулахгүй; route солих, фокус алдахад дахин маскална. | 13 §10.4–10.5 |
| UX-SEC-04 | **CSP ба хүсэлт:** inline script/style байхгүй; AG Grid `styleNonce` эсвэл legacy CSS theme; гадаад CDN, фонт, QR сервис хэрэглэхгүй. API client wrapper төлөв өөрчлөх бүх хүсэлтэд `X-CSRF: 1`, `Idempotency-Key` (шаардлагатай бол), `If-Match` (ноорог) нэмнэ. | ADR-0015 #4, 02 §10.3 |
| UX-SEC-05 | **Клиентийн лог ба telemetry:** request/response body бичихгүй; route-ийг загвараар (`/c/:cid/sales/invoices/:id`); tenant/company id-г metric label-д оруулахгүй (NFR-100). Хэрэглэгчид `traceId`-г "Support-д хуулах"-аар өгнө. | NFR-100, NFR-102 |
| UX-SEC-06 | **Файл:** upload-ийн өмнө төрөл ба хэмжээг клиент шалгана (`ui.file_too_large`, `ui.file_type_not_allowed`); татахдаа presigned URL, `Content-Disposition: attachment` (PDF/зураг харагчаас бусад). | FR-PLT-011, 02 §10.3 |
| UX-SEC-07 | **Эрхийн өөрчлөлт:** 403 авбал клиент `me/permissions`-ийг шинэчилж цэсийг дахин зурна (role хасагдсан байж болно); эрх нь UX-ийн дохио л, хамгаалалт серверт. | FR-PLT-005 |

---

## 6. Хүснэгт (AG Grid) ба гараар оруулах

### 6.1 AG Grid Community-ийн хязгаар ба орлуулалт

ADR-0015: зөвхөн **Community** (`ag-grid-enterprise` импортыг ESLint хориглоно, 18 §3.5). Enterprise-ийн функцийг доорх байдлаар орлуулна.

| Хэрэгцээ | Enterprise функц | Манай шийдэл |
|---|---|---|
| Excel-ээс буулгах / хуулах | Clipboard, Cell Selection | Өөрсдийн `paste`/`copy` handler (§6.5) |
| Мөрийн цэс | Context Menu | Shift+F10 / `⋯` товч → өөрсдийн ARIA `menu` (UX-PAGE-05) |
| Бүлэглэлт, нийлбэр | Row Grouping, Aggregation | Сервер SQL; нийлбэрийг pinned bottom мөрөөр (§6.6) |
| Дансны мод (CoA) | Tree Data | `indentation` баганаар догол + өөрсдийн нээх/хаах (§16.6) |
| Утгын жагсаалтаар шүүх | Set Filter | Серверийн шүүлтүүрийн самбар (UX-PAGE-14) |
| Excel экспорт | Excel Export | Серверийн ClosedXML (UX-PAGE-18) |
| Серверийн мөрийн загвар | Server-Side Row Model | Infinite Row Model + keyset (§6.8) |
| Төлөвийн мөр | Status Bar | Grid-ийн доорх өөрсдийн нийлбэрийн самбар |

**Ашиглах Community функц:** infinite row model, client-side row model (≤ 500 мөртэй баримт), cell editor (өөрсдийн), cell renderer, pinned row, column resize/move/hide, row selection (checkbox), keyboard navigation, tooltip, accessibility (ARIA grid), undo/redo (нүдний засвар), `styleNonce` (CSP, ADR-0015 #4).

### 6.2 Баганын төрөл

| Төрөл | Жишээ талбар | Зэрэгцүүлэлт | Засварлагч | Харуулах | Шүүлтүүр |
|---|---|---|---|---|---|
| `code` | `no`, данс, бараа | зүүн | Lookup combobox (UX-PAGE-11) | Дугаар; нэр нь тусдаа багана эсвэл tooltip | текст |
| `text` | `description` | зүүн | Текст (`maxLength` = schema-ийн хязгаар: 100 / 250) | Хэт урт бол "…" + tooltip | текст |
| `money` | `amount`, `line_amount` | **баруун** | `MoneyCellEditor` (§7.3, ≤ 2 бутархай) | §7.2, `tabular-nums` | тоон муж |
| `unitPrice` | `unit_price` | баруун | ≤ 6 бутархай | 2–6 бутархай | тоон муж |
| `qty` | `quantity` | баруун | ≤ 5 бутархай | 0–5 бутархай | тоон муж |
| `percent` | `line_discount_percent` | баруун | 0–100, ≤ 5 бутархай | "10" → "10" (гарчигт %) | тоон муж |
| `date` | `posting_date` | зүүн | `DateCellEditor` (§7.4) | `2026.10.06` | огнооны муж |
| `enum` | `document_type`, төлөв | зүүн | Сонголт (keyboard-аар) | i18n шошго / тэмдэг | олон утга |
| `bool` | `blocked`, `direct_posting` | төв | Checkbox (Space) | ✓ / хоосон (`aria-checked`) | тийм/үгүй |
| `id` | ДДТД, ТТД | зүүн | Тусгай (§7.8) | Monospace; ДДТД-г "…4821" + tooltip | яг тэнцүү |
| `badge` | eBarimt, төлбөрийн төлөв | зүүн | — | §5.1, §5.8 | олон утга |

- **UX-GRID-01.** Мөнгө, тоо баганын гарчигт нэгж: "Дүн (₮)", "Тоо". Нүдэнд ₮ тэмдэг бичихгүй.
- **UX-GRID-02.** Баганын анхдагч өргөн: `code` 120, `text` уян (flex 1, min 200), `money` 140, `qty` 100, `date` 110, `badge` 130 px. Хэрэглэгч өөрчилж болно (UX-GRID-15).

### 6.3 Гарын товчлол (BC-тэй нийцүүлсэн)

Товчлолыг `KeyboardEvent.code` (физик товч, жишээ нь `KeyN`)-оор тодорхойлно. Ингэснээр **монгол кирилл гарын байрлалд** ч Alt+N ажиллана (`event.key` нь "т" болох тул).

| Товч | Үйлдэл | Хамрах хүрээ | BC-тэй |
|---|---|---|---|
| F9 | Батлах (журнал: batch батлах) | Баримт, ажлын хуудас | ижил |
| Shift+F9 | Батлаад хэвлэх | Баримт | ижил |
| Alt+F9 | Батлаад шинэ ноорог | Баримт | ижил |
| Ctrl+Alt+F9 | Батлахын өмнө харах | Баримт, ажлын хуудас | **манай нэмэлт** |
| Ctrl+F9 | Бэлэн болгох (release) | Баримт | ижил |
| Alt+N | Шинэ бичлэг (жагсаалт: шинэ карт; засвартай жагсаалт: шинэ мөр) | Бүгд | ижил |
| Alt+Shift+N | Хадгалаад шинэ | Карт, баримт | ижил |
| Ctrl+Insert | Одоогийн мөрийн өмнө мөр оруулах | Мөрүүд | ижил |
| Ctrl+Delete | Мөр устгах (ноорог) | Мөрүүд, журнал | ижил |
| F8 | Дээрх мөрийн ижил баганын утгыг хуулах | Засвартай grid | ижил |
| Alt+↓ | Lookup / dropdown нээх | Талбар | ижил |
| Ctrl+Alt+↓ | Холбоотой картыг нээх | Lookup талбар | ижил |
| Alt+↑ | Талбарын тайлбар / алдааг харуулах | Талбар | ижил |
| F2 | Засварлах горим (бүх утгыг сонгох ↔ төгсгөлд курсор) | Нүд, талбар | ижил |
| Enter | Утгыг баталгаажуулж дараагийн "шуурхай оролтын" талбар руу | Карт, мөрүүд | ижил (Quick Entry) |
| Shift+Enter | Өмнөх шуурхай оролтын талбар | Карт, мөрүүд | ижил |
| Tab / Shift+Tab | Дараагийн / өмнөх нүд | Grid | ижил |
| Ctrl+Enter | Хадгалж хаах (карт); grid-ээс гарах | Бүгд | ижил |
| Esc | Засвар цуцлах → dialog/хуудас хаах | Бүгд | ижил |
| Ctrl+S | Шууд хадгалах | Карт, баримт | **манай нэмэлт** |
| F3 / Shift+F3 / Alt+F3 | Хайх / Шүүлтүүрийн самбар / Энэ утгаар шүүх | Жагсаалт | ижил |
| F5 | Өгөгдлийг шинэчлэх (браузерийн reload биш) | Бүгд | ижил |
| F7 | Статистик | Карт, баримт | ижил |
| Ctrl+F7 | Бичилт (ledger entries) | Карт, жагсаалт | ижил |
| Alt+D | Dimension | Карт, баримт, мөр | ижил |
| Alt+G | Бичилт хайх (энэ баримтаар) | Батлагдсан баримт | ижил |
| Ctrl+Alt+Q | Бичилт хайх (хоосон) | Бүгд | ижил |
| Alt+Q | Хайх | Бүгд | ижил |
| Alt+T | Миний тохиргоо | Бүгд | ижил |
| Ctrl+O | Компани солих | Бүгд | ижил |
| Alt+F2 | Хажуугийн самбар | Карт, баримт | ижил |
| Alt+F6 / F6 / Shift+F6 | Хэсэг эвхэх / дараагийн / өмнөх хэсэг | Карт, баримт | ижил |
| Shift+F11 | Тулгах (apply entries) | Төлбөр, журнал, кассын баримт | ижил |
| Ctrl+Shift+F12 | Мөрүүдийг томруулах | Баримт | ижил |
| Shift+F10 | Мөрийн цэс | Grid | ижил |
| Ctrl+↑ / Ctrl+↓ | Өмнөх / дараагийн бичлэг | Карт | ижил |
| `t`, `т`, `ө` (огнооны талбарт) | Өнөөдөр | Огноо | ижил (`t`) + монгол |
| `w` (огнооны талбарт) | Ажлын огноо | Огноо | ижил |

- **UX-GRID-03.** Браузерийн нөөцөлсөн товчлол (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Shift+N, Ctrl+Tab) ашиглахгүй. F3, F5, F7, Ctrl+O, Ctrl+S, Alt+D-ийг аппын фокус дотор `preventDefault`-ээр барина; dialog эсвэл гадаад iframe (PDF) фокустай үед браузерийнх ажиллана.
- **UX-GRID-04.** Товчлолын жагсаалтыг "?" (Shift+/) эсвэл тусламжийн цэснээс dialog-оор харуулна (NFR-071 "товчлол баримтжуулсан").

### 6.4 Мөр оруулах дүрэм

| ID | Дүрэм |
|---|---|
| UX-GRID-05 | Засвартай мөрийн grid-ийн төгсгөлд үргэлж **нэг хоосон шинэ мөр** (BC). Хоосон мөр хадгалагдахгүй (UX-SAVE). |
| UX-GRID-06 | Шуурхай оролтын багана (`quickEntry`): баримтын мөрөнд Төрөл → Дугаар → Тоо → Нэгжийн үнэ; журналд Бүртгэлийн огноо → Дансны төрөл → Данс → Тайлбар → Дебит/Кредит → Харьцсан данс. Enter нь эдгээрийн дараагийнх руу; сүүлийн баганад Enter → дараагийн мөрийн эхний шуурхай багана (шаардлагатай бол шинэ мөр). |
| UX-GRID-07 | `line_no`: шинэ мөр = сүүлийн + 10 000 (BC). Ctrl+Insert = хоёр хөршийн дундаж (бүхэл). Зай дуусвал (зөрүү < 2) сервер дахин дугаарлана (`line_no` нь UI-д харагдахгүй). |
| UX-GRID-08 | Журналын шинэ мөр өмнөх мөрөөс бүртгэлийн огноо, баримтын төрөл, баримтын дугаарыг (тэнцээгүй бол ижил, тэнцсэн бол дараагийн) өвлөнө (BC Gen. Journal "SetUpNewLine"). |
| UX-GRID-09 | Lookup нүдэнд бичихэд дугаараар яг таарсан → нэрээр эхэлсэн → агуулсан (trigram) дарааллаар 8 санал. Enter = эхний санал. Таарах зүйлгүй ба I эрхтэй бол "+ Шинээр үүсгэх" (UX-PAGE-11). |
| UX-GRID-10 | Мөрийн төрөл "Тайлбар" (`COMMENT`) бол зөвхөн Тайлбар багана засагдана; бусад нүд идэвхгүй. |
| UX-GRID-11 | Мөрийн алдаа: мөрийн эхэнд ⚠ дүрс, алдаатай нүд улаан хүрээ + `aria-invalid`; Alt+↑ мессежийг харуулна. Алдаатай мөр хадгалагдахгүй ч устахгүй (UX-SAVE). |
| UX-GRID-12 | Батлагдсан, түгжигдсэн, системийн мөр засагдахгүй (`editable: false`), фокус авна. |

### 6.5 Excel-ээс буулгах ба хуулах

```text
onPaste(event):                                        -- grid фокустай, нүд засварлагдаагүй
    if not grid.editable: return
    text := event.clipboardData.getData('text/plain'); event.preventDefault()
    rows := ParseTsv(text)                             -- \r?\n мөр, \t нүд, "…" ба "" escape (Excel), сүүлийн хоосон мөр хаягдана
    if rows.length > 500: Error(ui.paste_too_many_rows); return
    if rows.length > 20 and not Confirm(t('grid.paste.confirm', {count: rows.length})): return
    cols := EditableVisibleColumnsFrom(focusedColumn)
    errors := []
    for i, cells in rows:
        target := focusedRow + i                       -- төгсгөлөөс хэтэрвэл шинэ мөр
        if IsReadOnlyRow(target): errors += (target, *, ui.paste_readonly_row); continue
        for j, raw in cells:
            if j >= cols.length: errors += (target, j, ui.paste_extra_column); continue
            r := cols[j].parse(raw)                    -- §7.3 (мөнгө, тоо, огноо), lookup = дугаараар ЯГ тэнцүү
            if r.error: errors += (target, cols[j], r.error) else SetCell(target, cols[j], r.value)
    CommitRows(all touched rows)                       -- нэг хадгалалт (UX-SAVE-01)
    Toast(t('grid.paste.result', {rows: rows.length, errors: errors.length})); HighlightErrors(errors)
```

- **UX-GRID-13.** Буулгахад lookup-ийг зөвхөн **дугаараар яг** таарцуулна (нэрээр биш), буруу данс руу бичихээс сэргийлнэ.
- **UX-GRID-14.** Хуулах (Ctrl+C) сонгосон мөрүүдийг TSV болгоно: харагдах баганын дарааллаар, мөнгийг **бүлэглэлгүй** цэвэр утгаар (`1234567.89`), огноог `2026-10-06` хэлбэрээр (Excel зөв танина). PII-ийг дэлгэц дээрхтэй ижил маскаар.

### 6.6 Нийлбэрийн мөр

- **UX-GRID-16.** Нийлбэр нь grid-ийн доод pinned мөр (жагсаалт) эсвэл тусдаа самбар (баримт, журнал). Утга нь серверийн `totals`-аас (UX-PAGE-16). Журналын самбар: "Баримтын тэнцэл", "Нийт тэнцэл", "Зөрүү" (§16.5).

### 6.7 Баганын төлөвийг хадгалах

- **UX-GRID-15.** Баганын өргөн, дараалал, нуусан эсэх, эрэмбэ `localStorage`-д: түлхүүр `ui:grid:{userId}:{gridId}:v{schemaVersion}`. Өгөгдөл хадгалахгүй. Унших/бичих `try/catch`-тэй; амжилтгүй бол анхдагч. "Баганыг анхдагч болгох" үйлдэл. `schemaVersion` өөрчлөгдвөл хуучныг үл тооно. Серверт хадгалах (saved view) нь R2 (SCR-UI-03).

### 6.8 Infinite row model ба keyset хуудаслалт

```text
datasource.getRows({ startRow, endRow, sortModel, filterModel, success, fail }):
    k := startRow / 50                                    -- block дугаар
    if k > 0 and cursors[k] is unknown:
        LoadSequentially(upTo = k)                        -- өмнөх блокуудыг дарааллаар (scrollbar-аар хол үсрэхэд)
    page := GET list ?limit=50 & after=cursors[k] (k = 0 бол байхгүй) & sort=… & filters=…
    cursors[k + 1] := page.nextCursor
    lastRow := page.hasMore ? -1 : startRow + page.items.length
    success({ rowData: page.items, rowCount: lastRow })
on sort or filter change: cursors := {}; grid.purgeInfiniteCache()
```

- **UX-GRID-17.** `cacheBlockSize = 50`, `maxBlocksInCache = 20` (1 000 мөр санах ойд). Олон мянган мөртэй ledger-ийн жагсаалтад нийт тоог зөвхөн шүүлтүүр өөрчлөгдөхөд тусад нь (`?count=estimate`) авна.
- **UX-GRID-18.** Баримтын мөр (≤ 500) client-side row model; 500-аас дээш мөртэй баримт read-only жагсаалтаар (SLO: 500 мөр p95 ≤ 2 s, 02 §13).

---

## 7. Тоо, огноо, мөнгөний формат (mn-MN)

### 7.1 Хүснэгт

ADR-0017 #4: тоо `1,234,567.89`, огноо `2026.10.06`, цагийн бүс `Asia/Ulaanbaatar`. **Өөрсдийн formatter** (браузерийн `mn` ICU өгөгдөлд найдахгүй). API-ийн мөнгө **string** (ADR-0006 #7); клиентэд `Decimal` (decimal.js) эсвэл string, хэзээ ч JS `number` биш.

| Төрөл | DB төрөл (D-C1) | Харуулах дүрэм | Оролт | Жишээ (API → UI) |
|---|---|---|---|---|
| Мөнгө (MNT) | `platform.amount` numeric(19,4), 0.01-ээр | Бүлэглэх `,`, бутархай `.`, яг 2 орон | ≤ 2 бутархай | `"1234567.8"` → `1,234,567.80` |
| Мөнгө, тайлан 0 оронтой | ижил | `company_setup.report_decimal_places = 0` бол 0 орон (харуулалт л) | — | `"1234567.50"` → `1,234,568` |
| Нэгжийн үнэ | `platform.unit_amount` (19,6) | 2–6 орон, 2-оос хойших 0-ийг хасна | ≤ 6 бутархай | `"333.335000"` → `333.335`; `"1500"` → `1,500.00` |
| Тоо хэмжээ | `platform.quantity` (19,5) | 0–5 орон, төгсгөлийн 0-ийг хасна | ≤ 5 бутархай | `"3.00000"` → `3`; `"2.50000"` → `2.5` |
| Хувь | `platform.percent` (9,5) | 0–5 орон, `%` гарчигт эсвэл суффикс | 0–100 | `"10.00000"` → `10` |
| Ханш (R2) | `platform.exch_rate` (38,18) | 2–6 орон, бүтэн утга tooltip-д | ≤ 18 бутархай | `"3450.120000000000000000"` → `3,450.12` |
| Огноо | `date` | `yyyy.MM.dd` (хэрэглэгч тохируулж болно, SCR-UI-01) | §7.4 | `"2026-10-06"` → `2026.10.06` |
| Огноо, цаг | `timestamptz` | `yyyy.MM.dd HH:mm`, `Asia/Ulaanbaatar` | — | `"2026-10-06T06:05:00Z"` → `2026.10.06 14:05` |
| Сар | — | `M-р сар yyyy` (`gl.fn_create_fiscal_year`-ийн нэртэй ижил) | — | `10-р сар 2026` |
| Сөрөг | — | Урдаа `-` (ASCII hyphen-minus; Excel-д хуулахад зөв). `-0.00` хэзээ ч харуулахгүй | `-`, `−`, `(…)` | `"-1250"` → `-1,250.00` |
| Тэг | — | `0.00`. Гүйлгээ баланс ба дансны хуулгын Дебит/Кредит баганад **хоосон** (BC) | — | — |
| Валютын тэмдэг | — | MNT: `₮` суффикс, NBSP-тэй (`1,250.00 ₮`) — нийлбэр, cue, хэвлэх цонхонд. Grid-ийн нүдэнд тэмдэггүй. FCY (R2): `1,250.00 USD` | — | — |

### 7.2 Формат хийх алгоритм

```text
function formatDecimal(s: string, minFrac: int, maxFrac: int, group = true): string
    assert s matches ^-?\d+(\.\d+)?$                       -- API-ийн string; Number() хэрэглэхгүй (ESLint хориг, 18 §3.5)
    d := new Decimal(s)
    if d.decimalPlaces() > maxFrac: d := d.toDecimalPlaces(maxFrac, Decimal.ROUND_HALF_UP)   -- ROUND_HALF_UP = тэгээс холдуулах (ADR-0006, MoneyMath.Round)
    str := d.abs().toFixed(maxFrac)                         -- decimal.js toFixed: exponent-гүй
    (int, frac) := split(str, '.')
    frac := TrimTrailingZeros(frac).padEnd(minFrac, '0')
    if group: int := InsertEvery3FromRight(int, ',')
    out := frac == '' ? int : int + '.' + frac
    if d.isNegative() and not d.isZero(): out := '-' + out
    return out

formatMoney(s, ctx)     = formatDecimal(s, p, p) where p = ctx.isReport ? company.report_decimal_places : 2
formatUnitPrice(s)      = formatDecimal(s, 2, 6)
formatQty(s)            = formatDecimal(s, 0, 5)
formatPercent(s)        = formatDecimal(s, 0, 5)
```

- **UX-FMT-01.** Харуулалтын бөөрөнхийлөлт (0 оронтой тайлан) нь хадгалсан утгыг өөрчлөхгүй. Тайлангийн нийлбэрийг сервер **бүтэн** утгаар нэмээд дараа нь бөөрөнхийлнө; тиймээс мөрүүдийн харагдах нийлбэр ба нийлбэрийн мөр 1 ₮-өөр зөрж болно. Тайлангийн доод талд "Дүнг бүхэл төгрөгөөр бөөрөнхийлж харуулав" гэж бичнэ. e-balance-ийн мянган төгрөгийн хуудас D-C2-ын "эхлээд бөөрөнхийлөөд нийлбэрлэх" дүрэмтэй (сервер, зөрүүний мөр).

### 7.3 Тоо оруулах (parse) алгоритм

```text
function parseDecimalInput(raw, kind):                  -- kind ∈ {money, unitPrice, qty, percent, rate}
    maxFrac := { money: 2, unitPrice: 6, qty: 5, percent: 5, rate: 18 }[kind]      -- MNT 0.01 (D-C2); FCY-ийн нарийвчлал R2-т валютаас
    maxInt  := { money: 15, unitPrice: 13, qty: 14, percent: 3, rate: 10 }[kind]   -- numeric(19,4)→15, (19,6)→13, (19,5)→14
    t := Trim(raw).removeAll([' ', ' ', ' ', '₮'])
    if t == '': return EMPTY
    t := t.replace(/^−/, '-')                        -- "−" (U+2212)
    if t matches ^\((.*)\)$: t := '-' + group1             -- нягтлан бодох хэлбэрийн сөрөг "(1,234.00)"
    if count(t, '.') > 1: return Error(ui.amount_unparseable)
    if count(t, '.') == 0 and count(t, ',') == 1 and t matches ,\d{1,2}$:
        t := t.replace(',', '.')                           -- "12,5" → 12.5 (бутархайн таслал)
    elif t contains ',':
        if not t matches ^-?\d{1,3}(,\d{3})+(\.\d*)?$: return Error(ui.amount_grouping_invalid)
        t := t.removeAll(',')
    if not t matches ^-?\d+(\.\d+)?$: return Error(ui.amount_unparseable)
    if t starts with '-' and not column.allowNegative: return Error(ui.amount_negative_not_allowed)
    (int, frac) := split(t.trimStart('-'), '.')
    if len(frac) > maxFrac: return Error(ui.amount_precision_exceeded, {max: maxFrac})   -- ЧИМЭЭГҮЙ бөөрөнхийлөхгүй (ADR-0006)
    if len(TrimLeadingZeros(int)) > maxInt: return Error(ui.amount_too_large)
    if kind == percent and Decimal(t) > 100: return Error(ui.percent_out_of_range)
    return Normalize(t)                                    -- "001,234.5" → "1234.5"
```

- **UX-FMT-02.** Тоон нүдэнд numpad-ийн бутархайн товч (`event.code = 'NumpadDecimal'`) **үргэлж** `.` оруулна (BC Alt+Decimal-ийн асуудлыг шийднэ).
- **UX-FMT-03.** Засвар эхлэхэд нүд бүлэглэлгүй цэвэр утгыг харуулна (`1234567.80`); засвар дуусахад форматлана.
- **UX-FMT-04.** Мөнгөний нүдэнд арифметик (`=100*3`) R1-д байхгүй.

### 7.4 Огноо оруулах ба харуулах

```text
function parseDateInput(raw, today, workDate):            -- today = Asia/Ulaanbaatar-ийн огноо
    t := Lower(Trim(raw))
    if t in {'t', 'т', 'ө'}: return today
    if t == 'w': return workDate
    if t matches ^[+-]\d{1,3}$: return today + int(t) days                 -- "+30"
    if t matches ^\d+$:
        case len(t):
          8 → (y, m, d) := (t[0:4], t[4:6], t[6:8])                        -- 20261006
          6 → (y, m, d) := (2000 + t[0:2], t[2:4], t[4:6])                 -- 261006
          4 → (y, m, d) := (today.y, t[0:2], t[2:4])                       -- 1006 = 10-р сарын 6
          1, 2 → (y, m, d) := (today.y, today.m, t)                        -- 6 = энэ сарын 6
          else → Error(ui.date_unparseable)
    else:
        p := Split(t, /[.\-\/ ]+/)
        if len(p) == 3 and len(p[0]) == 4: (y, m, d) := p                   -- 2026.10.6 (монгол дараалал)
        elif len(p) == 3 and len(p[2]) == 4: (d, m, y) := p                 -- 06.10.2026 (хуучин зуршил)
        elif len(p) == 2: (y, m, d) := (today.y, p[0], p[1])                -- 10.6
        else: return Error(ui.date_unparseable)
    if not IsValidCalendarDate(y, m, d): return Error(ui.date_invalid)       -- 2026.02.30
    if y < 2000 or y > 2200: return Error(ui.date_out_of_range)            -- gl.fiscal_year CHECK
    return Date(y, m, d)
```

- **UX-FMT-05.** "Өнөөдөр" нь **Asia/Ulaanbaatar**-ийн огноо (UTC+8), хэрэглэгчийн компьютерийн цагийн бүсээс үл хамаарна. Цагийн хэсгийг `Intl.DateTimeFormat(…, { timeZone: 'Asia/Ulaanbaatar' }).formatToParts` -оор гаргаж, өөрсдөө угсарна (locale өгөгдөлд найдахгүй).
- **UX-FMT-06.** Огнооны сонгогч (date picker): Ctrl+Home нээх/хаах (grid-ийн нүдэнд Ctrl+Home нь эхний мөр рүү шилжих тул Alt+↓ — BC-тэй ижил), сумаар өдөр/долоо хоног, PageUp/PageDown сар, Enter сонгох, Esc хаах (BC). Долоо хоног **Даваа** гарагаас эхэлнэ. Өдрийн нэр: Да, Мя, Лх, Пү, Ба, Бя, Ня.
- **UX-FMT-07.** Ажлын огноо (S-PLT-16): анхдагч өнөөдөр; хэрэглэгч сольж болно; зөвхөн тухайн browser session-д (`sessionStorage` `ui:workDate:{userId}`); өнөөдрөөс ялгаатай бол тууз (UX-PAGE-29). Серверт хадгалахгүй: клиент `postingDate`-ийг үргэлж тодорхой илгээнэ.
- **UX-FMT-08.** Харьцангуй цаг ("2 цагийн өмнө") зөвхөн лог, мэдэгдэл, eBarimt-ийн насанд; tooltip-д бүтэн огноо цаг.

### 7.5 Тайлангийн нэгж

- **UX-FMT-09.** Санхүүгийн тайлан (S-RPT-09..12) "Нэгж: төгрөг / мянган төгрөг" сонголттой. Мянган төгрөгийн горим зөвхөн харуулалт; e-balance-ийн шивэх хуудас (S-RPT-13) серверийн бөөрөнхийлөлттэй (D-C2).

### 7.6 Товч хэлбэр (cue, KPI)

```text
function formatCompactMnt(s):
    a := Decimal(s).abs(); sign := Decimal(s).isNegative() ? '-' : ''
    if a < 1 000 000:     return sign + formatDecimal(a, 0, 0) + ' ₮'                         -- 985,400 ₮
    if a < 1 000 000 000: v := a / 1e6; unit := 'сая'
    else:                 v := a / 1e9; unit := 'тэрбум'
    v := v.toDecimalPlaces(1, ROUND_HALF_UP)
    if unit == 'сая' and v >= 1000: v := (a / 1e9).toDecimalPlaces(1, ROUND_HALF_UP); unit := 'тэрбум'   -- 999,960,000 → "1 тэрбум", "1000 сая" биш
    return sign + TrimTrailing('.0', v.toFixed(1)) + ' ' + unit + ' ₮'                         -- 12.5 сая ₮
```

- **UX-FMT-10.** Товч хэлбэр зөвхөн cue/KPI-д. `aria-label` ба tooltip-д бүтэн утга (`12,534,000.00 ₮`). Англи хэлэнд `M` / `B` ("12.5M ₮").

### 7.7 Танигч (identifier)

| Төрөл | Харуулах | Жишээ | Маск (засах эрхгүйд, 13 §10.4) |
|---|---|---|---|
| ТТД (`platform.tin`) | Цифр, бүлэглэхгүй. ААН-ийн ТТД 11 орон, хувь хүн 12–14 (PosAPI `merchantTin`/`customerTin`); 7 оронтой нь улсын бүртгэлийн дугаар (`registration_no`) — ТТД биш (schema домэйн 7–14-ийг зөвшөөрдөг ч UI 7 оронтойг ТТД гэж харуулахгүй, UX-CUST-02) | `12345678901` / `200012345678` | ААН-ийнх маскгүй; хувь хүний ТТД (12–14 орон, 13 §10 "civil_id") нь `personal_tin_hint` (13 CR-06) `*********123` |
| Регистр (иргэн) | 2 үсэг + 8 орон | `УБ99112233` | `УБ******33` |
| ДДТД (33 орон) | Monospace, бүтэн; grid-д `…` + сүүлийн 6 | `…482193` | Маскгүй |
| Иргэний eBarimt дугаар | 8 орон | `12345678` | `****5678` |
| Банкны данс | Хадгалсан хэлбэрээр | `5012345678` | `**** 5678` |
| IBAN | 4 тэмдэгтээр бүлэглэх | `MN12 0005 0050 1234 5678` | `**** 5678` |
| Утас (8 орон) | `9911 2233` | | `99****33` |

- **UX-FMT-11.** ДДТД, ТТД-ийн хажууд "Хуулах" товч (`aria-label="ДДТД хуулах"`). Хуулахад бүлэглэл/зай орохгүй.

### 7.8 Үсгээр бичсэн дүн

- **UX-FMT-12.** Дүнг үсгээр серверээс (`amountInWords`, `MongolianAmountInWords`, ADR-0017 #5) авна. Клиент өөрөө үүсгэхгүй. Кассын баримт, нэхэмжлэхийн нийлбэрийн самбарт харагдана: "Нэг сая хоёр зуун гучин дөрвөн мянга таван зуун жаран долоон төгрөг наян есөн мөнгө" (FR-PLT-010 AC2).

### 7.9 Эрэмбэ ба хайлтын нормчлол

- **UX-FMT-13.** Серверийн эрэмбэ `COLLATE "mn-x-icu"` (ADR-0017 #7). Клиентийн жижиг жагсаалт (≤ 500, lookup кэш) монгол цагаан толгойн дарааллаар өөрсдийн comparator-оор: **а б в г д е ё ж з и й к л м н о ө п р с т у ү ф х ц ч ш щ ъ ы ь э ю я**, дараа нь латин, дараа нь цифр. `Intl.Collator('mn')`-д найдахгүй.
- **UX-FMT-14.** Хайлтын нормчлол (NFR-062): хоёр талыг "латин араг" (skeleton) болгож харьцуулна:

```text
function Skeleton(s):
    s := Lower(NFC(s))
    map := { а:a, б:b, в:v, г:g, д:d, е:e, ё:yo, ж:j, з:z, и:i, й:i, к:k, л:l, м:m, н:n, о:o, ө:o, п:p, р:r,
             с:s, т:t, у:u, ү:u, ф:f, х:h, ц:ts, ч:ch, ш:sh, щ:sh, ъ:'', ы:i, ь:'', э:e, ю:yu, я:ya }
    s := Transliterate(s, map)
    s := s.replaceAll('kh', 'h').replace(/[^a-z0-9]/g, '')          -- бүх тохиолдол (JS-ийн replace(string) зөвхөн эхнийхийг солино)
    return s
-- "Өнөр ХХК" → "onorhhk";  "Onor HHK" → "onorhhk"  → таарна
```

Сервер талд ижил функцийг `search_name`-д хадгалж trigram индексээр хайна (SCR-UI-08).

---

## 8. Баталгаажуулалт ба алдаа харуулах

### 8.1 Түвшин

| Түвшин | Хэзээ | Хаана харагдах | Жишээ |
|---|---|---|---|
| Талбар | Утга оруулж дуусахад (клиентийн формат) эсвэл хадгалах/батлах хариунд | Талбарын доор улаан текст + ⚠ дүрс + улаан хүрээ; `aria-invalid="true"`, `aria-describedby` | "ТТД 7 эсвэл 11 оронтой байна" |
| Мөр | Мөрөөс гарахад / хадгалах хариунд | Мөрийн эхний ⚠, алдаатай нүд; Alt+↑ мессеж | "Тоо хэмжээ 0 байж болохгүй" |
| Баримт | Батлах / preview-ийн 422 | Алдааны жагсаалтын самбар (§8.3) | "НӨАТ-ын тохиргоо олдсонгүй: DOMESTIC × SERVICE" |
| Хуудас / систем | 403, 404, 5xx, сүлжээ | Тууз эсвэл бүтэн хуудсан дээрх хоосон төлөв (§9) | "Холболт тасарсан" |

| ID | Дүрэм |
|---|---|
| UX-VAL-01 | Клиент зөвхөн **формат, урт, муж, заавал** шалгана (§7.3, §7.4, schema-ийн CHECK: `code20` `^[A-Z0-9_\-\.]{1,20}$`, `tin` `^[0-9]{7,14}$`, `ddtd` `^[0-9]{33}$`, `ebarimt_consumer_no` `^[0-9]{8}$`, `district_code` `^[0-9]{4}$`). Бизнесийн дүрмийг (данс тодорхойлолт, үе, үлдэгдэл) **сервер** шалгана. |
| UX-VAL-02 | Алдааг бичиж байх үед биш, талбараас гарах үед харуулна. Алдаатай талбарыг засахад алдаа шууд арилна. |
| UX-VAL-03 | Мессеж нь: юу буруу + яаж засах. "Буруу утга" гэх мэт ерөнхий текст хориотой. |
| UX-VAL-04 | `code20` талбарт бичсэн жижиг үсгийг автоматаар том болгоно (BC Code төрөл); бусад хориотой тэмдэгтийг оруулахыг зөвшөөрөхгүй, шалтгааныг харуулна. |

### 8.2 Серверийн алдааг талбарт харгалзуулах

Сервер RFC 9457 `application/problem+json` + `code`, `traceId`, `errors[]` буцаана (02 §5.3 #7, 18 §3.4).

```text
function MapProblem(p):
    items := []
    for e in (p.errors ?? [ { code: p.code, message: p.detail } ]):   -- 14 API-ERR-04: { code, message, pointer?, parameter?, lineId?, params? }
        key := 'errors:' + e.code                                   -- §14.3
        msg := i18n.exists(key) ? t(key, e.params) : (e.message ?? p.detail ?? t('errors:unknown'))
        target := ResolveTarget(e)
        items += { msg, code: e.code, target, fix: FixLink(e.code, e.params) }
    return items                                                     -- traceId-г "Support-д хуулах" товчонд

function ResolveTarget(e):
    if e.lineId and e.pointer matches ^/lines/\d+/(\w+)$: return GridCell(lineId = e.lineId, column = g1)   -- мөрийг lineId-аар
    if e.pointer matches ^/lines/(\d+)/(\w+)$: return GridCell(lineId = SentBody.lines[g1].id, column = g2)  -- илгээсэн body-ийн index
    if e.pointer matches ^/(\w+)$ and form has field g1: return Field(g1)
    if e.parameter: return DocumentLevel
    return DocumentLevel
```

- **UX-VAL-05.** Мөрийн алдааг `errors[].lineId`-аар (14 API-ERR-04) мөрөнд холбоно; `lineId` байхгүй бол `pointer`-ийн index-ийг **тухайн хүсэлтэд илгээсэн** мөрийн дарааллаар тайлна (хэрэглэгч хооронд нь мөр нэмж/хассан ч зөв мөрийг заана).
- **UX-VAL-06.** Нуугдсан талбар (UX-PAGE-08) эсвэл эвхэгдсэн хэсэгт алдаа байвал хэсгийг дэлгэж, эхний алдаатай талбар руу фокус.

### 8.3 Алдааны жагсаалт (BC "Error Messages")

```text
┌ Батлах боломжгүй — 3 алдаа ─────────────────────────────────────────── [Support-д хуулах] [×] ┐
│ 1  ⚠ Мөр 2: "1200 Дансны авлага" данс шууд бичилтгүй (Direct Posting = Үгүй).     [Засах ›]  │
│ 2  ⚠ Ерөнхий тохиргоонд DOMESTIC × SERVICE мөр алга.                               [Тохиргоо ›]│
│ 3  ⚠ Бүртгэлийн огноо 2026.08.31: 8-р сар хаагдсан.                                   [Үе ›]     │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **UX-VAL-07.** Батлах/preview амжилтгүй болоход самбар баримтын доор (worksheet-д доод хэсэгт) нээгдэж, фокус гарчиг руу шилжинэ; `aria-live="assertive"`: "Батлах боломжгүй. 3 алдаа олдлоо."
- **UX-VAL-08.** Мөр бүр: дугаар, мессеж, [Засах] холбоос (талбар, мөр эсвэл тохиргооны дэлгэц, шүүлттэй). Тохиргоо руу шилжих нь шинэ tab эсвэл drawer-оор (ноорог хаагдахгүй).
- **UX-VAL-09.** Самбар дараагийн амжилттай хадгалалт/батлалт хүртэл үлдэнэ. "Support-д хуулах" нь `code`, `traceId`, цаг, хуудасны замыг (PII-гүй) clipboard-д хуулна.
- **UX-VAL-10.** Сервер бүх алдааг нэг дор буцаана (FR-GL-008); UI эхний алдаагаар зогсохгүй, бүгдийг жагсаана.

### 8.4 Анхааруулга (батлахыг зогсоохгүй)

| ID | Нөхцөл | Хаана | Текст (mn) | Эх |
|---|---|---|---|---|
| W-01 | Дансны `normal_side` ≠ бичилтийн тал | Журналын мөр | "3100 Өмч (дүрмийн сан) нь ихэвчлэн кредит үлдэгдэлтэй. Дебит бичих үү?" | D-D1, FR-GL-005, 14 API-ACT-10 `warnings[]` |
| W-02 | Бүртгэлийн огноо өнөөдрөөс > 30 хоногийн өмнө эсвэл ирээдүйд | Батлах dialog | "Бүртгэлийн огноо 2026.08.15 (өнөөдрөөс 52 хоногийн өмнө)." | BC Posting Date check |
| W-03 | Харилцагчийн зээлийн хязгаар хэтэрнэ (`credit_limit_lcy > 0`) | Батлах dialog, FactBox | "Зээлийн хязгаар 5,000,000 ₮; батлахад үлдэгдэл 5,640,000 ₮ болно." | BC Credit Limit |
| W-04 | Борлуулалтын гадаад баримтын дугаар давхардсан | Талбар | "Энэ дугаартай нэхэмжлэх аль хэдийн бий: SI-2026-00031." | — |
| W-05 | Худалдан авалтад ДДТД алга | Батлах dialog | "Нийлүүлэгчийн ДДТД бүртгээгүй тул орцын НӨАТ хасагдахгүй." | D-E4 |
| W-06 | Харилцагчийн ТТД шалгагдаагүй | Талбар | "ТТД шалгагдаагүй (eBarimt сервис хариу өгсөнгүй). Батлах үед дахин шалгана." | 12 SET-12 |
| W-07 | Ажлын огноо ≠ өнөөдөр | Тууз | UX-PAGE-29 | — |

Нийлүүлэгчийн нэхэмжлэхийн дугаар давхардах нь **алдаа** (FR-PUR-002), анхааруулга биш. Кассын үлдэгдэл сөрөг болох нь **алдаа** (D-G1, FR-BNK-003); FactBox батлахаас өмнө "Батлахад үлдэгдэл −100,000 ₮ болно" гэж улаанаар урьдчилан харуулна.

### 8.5 Toast

- **UX-VAL-11.** Toast нь зөвхөн **амжилт ба мэдээлэл**-д (5 s-ийн дараа алга болно, хулгана/фокус дээр байвал зогсоно). Алдаа toast биш: самбар, талбар эсвэл тууз. Toast `role="status"`, хамгийн ихдээ 3 зэрэг, баруун доод буланд; Esc хаана.
- **UX-VAL-12.** Toast-ын холбоос (жишээ нь "SI-2026-00042") Tab-аар хүрэх боломжтой; toast алга болохоос өмнө фокус авбал хугацаа зогсоно (WCAG 2.2.1).

### 8.6 Серверийн алдааны код → UX

Кодын эх: протокол `api.*` — [14-api.md](./14-api.md) §9.2–9.4; `platform.*` — 13 §18; `ebarimt.*` — 12 §21; домэйн код — модулийн spec (14 §9.5). Энд UX-ийн хариу үйлдлийг тогтооно.

| HTTP | Код | UX |
|---|---|---|
| 400 | `api.money_must_be_string`, `api.unknown_field`, `api.read_only_field`, `api.malformed_json` | Клиентийн гэрээний алдаа: OTel-д `ui.contract_violation` event (PII-гүй) + тууз "Системийн алдаа (код: {{traceId}})". Хэрэглэгчийн өгөгдөл санах ойд үлдэнэ |
| 400 | `platform.csrf_header_missing`, `api.idempotency_key_missing` | Клиентийн алдаа (API wrapper-ийн алдаа, UX-SEC-04); дээрхтэй ижил |
| 401 | `platform.unauthenticated`, `platform.session_expired` | Нэвтрэх хуудас руу, буцах замыг хадгална. 401-ийн дараа хадгалах боломжгүй; хадгалалтыг 55 минутын анхааруулгын үед хийсэн байна (UX-NAV-18) |
| 403 | `platform.reauth_required` | StepUpDialog (UX-PAGE-24), ижил хүсэлтийг ижил key-ээр давтана |
| 403 | `platform.mfa_required` (14) / `platform.mfa_enrollment_required` (13 §5.5) | MFA бүртгэл (S-PLT-02) |
| 403 | `platform.permission_denied` | "Энэ үйлдлийг хийх эрх танд алга ({{requiredPermission}})." + `me/permissions`-ийг шинэчилнэ (UX-SEC-07) |
| 403 | `platform.tenant_read_only`, `platform.company_archived` | Тууз UX-PAGE-27; бичих үйлдлүүдийг нууна |
| 404 | `api.resource_not_found`, `platform.company_not_found` | §9-ийн `NOT_FOUND` хоосон төлөв |
| 409 | `api.document_already_posted` | Баримтыг дахин ачаалж батлагдсан харагдацаар (UX-NAV-10) + мэдээлэл "Өөр хэрэглэгч баталсан" |
| 409 | `api.document_released` | "Баримт Бэлэн төлөвт байна. Засахын тулд [Дахин нээх]" |
| 409 | `api.resource_in_use`, `api.duplicate` | Талбар/dialog-ийн алдаа; `existingResourceId` байвал "Байгаа бичлэгийг нээх" холбоос |
| 409 | `gl.journal_changed` | "Журнал өөр хэрэглэгчээр өөрчлөгдсөн." → дахин ачаалж, батлахыг дахин санал болгоно (UX-JNL-08) |
| 409 | `api.document_not_editable` | Баримтыг дахин ачаалж зөвхөн унших горимоор (UX-SAVE-07) + мэдээлэл "Баримт батлагдсан тул засах боломжгүй" |
| 409 | `api.idempotency_in_progress` | Ижил хүсэлт боловсруулагдаж байна: `Retry-After`-ийн дараа **ижил** key-ээр дахин илгээнэ (UX-POST-01); хэрэглэгчид spinner хэвээр |
| 400 | `api.invalid_cursor`, `api.cursor_mismatch` | Grid-ийн cursor-ийг хаяж (`cursors := {}`), эхнээс нь дахин ачаална (§6.8); хэрэглэгчид мессеж харуулахгүй |
| 403 | `platform.not_document_owner` | "Энэ ноорог өөр хэрэглэгчийнх. Засах эрх алга." Баримт зөвхөн унших горимоор (13 SEC-REC-03) |
| 422 | `gl.voucher_unbalanced` (ваучер бүрээр, 14 API-ACT-07) | Журналын алдааны жагсаалт: "Ваучер J-000045 тэнцээгүй: зөрүү 100.00"; тухайн ваучерын мөрүүд тодорно (UX-JNL-08) |
| 422 | `api.result_too_large` | "Үр дүн хэт их. Excel рүү экспортлох уу?" (UX-PAGE-18) |
| 429 | `platform.pii_unmask_rate_limited` | `MaskedValue`-ийн дэргэд "Цагт 20-оос олон удаа задлах боломжгүй" (13 §10.5) |
| 409 | `ebarimt.resolution_too_early`, `ebarimt.vat_status_mismatch`, `ebarimt.predecessor_unknown` (12, 14 API-ACT-14) | Dialog-ийн дотор алдаа ба шийдэл (хүлээх хугацаа, компанийн профайл, eBarimt хяналт руу холбоос) |
| 412 | `api.etag_mismatch` (`currentEtag`-тэй) | Зөрчлийн dialog (UX-SAVE-04) |
| 422 | `api.validation_failed` + `errors[]`, эсвэл ганц домэйн код (`gl.period_closed`, `bank.cash_negative_balance`, `sales.invoice_has_applications` …) | Алдааны жагсаалт (§8.3); `gl.period_closed` → [Үе ›] S-GL-09 |
| 422 | `api.amount_precision_exceeded` | Талбарын алдаа (клиент `ui.amount_precision_exceeded`-аар урьдчилан барина, §7.3) |
| 422 | `api.masked_value_not_allowed` | Клиентийн алдаа: маскласан утгыг илгээсэн (UX-SEC-03 зөрчсөн) — гэрээний алдаатай ижил |
| 422 | `api.idempotency_key_reused` | Клиентийн алдаа (key-г өөр body-д ашигласан): **автоматаар давтахгүй**, "Системийн алдаа. Хуудсыг дахин ачаална уу." |
| 428 | `api.precondition_required` | Клиентийн алдаа (`If-Match` дутсан) |
| 429 | `platform.rate_limited` | "Хэт олон хүсэлт. {{seconds}} секундын дараа оролдоно уу." (`Retry-After`, `retryAfterSeconds`) |
| 503 | `api.lock_timeout`, `api.service_unavailable` | Автомат давталт (UX-POST-01, ижил key, `Retry-After`); 3 удаа амжилтгүй бол "Систем завгүй байна" |
| 500 | `api.internal_error`, `platform.context_error`, `platform.immutable_record` | Тууз "Системийн алдаа (код: {{traceId}})"; хадгалаагүй өөрчлөлт санах ойд үлдэнэ |

### 8.7 UI-ийн алдааны код (`ui.*`)

| Код | mn | en |
|---|---|---|
| `ui.required` | "{{field}} заавал бөглөнө." | "{{field}} is required." |
| `ui.amount_unparseable` | "Тоо танигдсангүй. Жишээ: 1,234.50" | "Not a valid number. Example: 1,234.50" |
| `ui.amount_grouping_invalid` | "Мянганы таслал буруу байна. Жишээ: 1,234,567.50" | "Invalid thousands separator." |
| `ui.amount_precision_exceeded` | "Бутархай хамгийн ихдээ {{max}} орон." | "At most {{max}} decimal places." |
| `ui.amount_negative_not_allowed` | "Сөрөг утга оруулах боломжгүй." | "Negative values are not allowed." |
| `ui.amount_too_large` | "Тоо хэт их байна." | "Number is too large." |
| `ui.percent_out_of_range` | "Хувь 0–100 байна." | "Percent must be 0–100." |
| `ui.date_unparseable` | "Огноо танигдсангүй. Жишээ: 2026.10.06" | "Not a valid date. Example: 2026.10.06" |
| `ui.date_invalid` | "Ийм огноо байхгүй." | "This date does not exist." |
| `ui.date_out_of_range` | "Огноо 2000–2200 онд байна." | "Date must be between 2000 and 2200." |
| `ui.code_invalid` | "Зөвхөн том үсэг, тоо, `_ - .`, 1–20 тэмдэгт." | "Only A–Z, 0–9, `_ - .`, 1–20 characters." |
| `ui.tin_invalid` | "ТТД 7–14 оронтой тоо (ААН 11, иргэн 12–14)." | "TIN must be 7–14 digits." |
| `ui.ddtd_invalid` | "ДДТД 33 оронтой тоо." | "Receipt ID must be 33 digits." |
| `ui.email_invalid` | "Имэйл хаяг буруу." | "Invalid e-mail address." |
| `ui.save_conflict` | "Өөр хэрэглэгч өөрчилсөн." | "Changed by another user." |
| `ui.save_failed_before_post` | "Хадгалж чадаагүй тул батлах боломжгүй." | "Cannot post: saving failed." |
| `ui.document_gone` | "Энэ ноорог батлагдсан эсвэл устгагдсан." | "This draft was posted or deleted." |
| `ui.paste_too_many_rows` | "Нэг удаад 500-аас олон мөр буулгах боломжгүй." | "Cannot paste more than 500 rows." |
| `ui.paste_extra_column` | "Илүү багана үл тоогдов." | "Extra columns were ignored." |
| `ui.paste_readonly_row` | "Засагдахгүй мөр алгасав." | "Read-only row skipped." |
| `ui.print_payload_unavailable` | "eBarimt-ийн QR-ийг дахин хэвлэх боломжгүй. ДДТД-тэй хуулбар хэвлэнэ үү." | "The eBarimt QR cannot be printed again. Print a copy with the receipt ID." |
| `ui.offline` | "Холболт тасарсан." | "You are offline." |
| `ui.file_too_large` | "Файл 20 MB-аас их." | "File is larger than 20 MB." |
| `ui.file_type_not_allowed` | "Зөвхөн PDF, JPG, PNG, XLSX." | "Only PDF, JPG, PNG, XLSX." |

### 8.8 Сүлжээ тасрах

- **UX-VAL-13.** Offline үед засвар санах ойд үлдэнэ; хадгалах, батлах товч идэвхгүй, тууз UX-PAGE-30. Offline-д батлах **боломжгүй** (давхардлаас сэргийлнэ). Сүлжээ сэргэхэд автоматаар `Flush()`.
- **UX-VAL-14.** Service worker нь зөвхөн static asset кэшилнэ; `/api/`, `/bff/` хариуг **кэшлэхгүй** (12 PRN-04: `/ebarimt/` хариу ялангуяа).

---

## 9. Хоосон төлөв (empty state)

### 9.1 Төрөл

| Төрөл | Хэзээ | Агуулга |
|---|---|---|
| `FIRST_USE` | Бичлэг огт байхгүй | Зураг (энгийн дүрс), 1 өгүүлбэр тайлбар, үндсэн CTA, туслах холбоос |
| `NO_RESULTS` | Шүүлтүүрт таарах зүйлгүй | "Шүүлтүүрт тохирох … алга." [Шүүлтүүр цэвэрлэх] |
| `NOT_CONFIGURED` | Урьдчилсан тохиргоо дутуу | Юу дутууг хэлж, тохиргоо руу CTA (эрхтэй бол), эс бөгөөс "Эзэмшигчид хандана уу" |
| `NO_PERMISSION` | 403 (зам руу шууд орсон) | "Энэ хуудсыг харах эрх алга." Нүүр рүү буцах |
| `NOT_FOUND` | 404 | "Бичлэг олдсонгүй эсвэл өөр компанийнх." Жагсаалт руу |
| `ERROR` | Ачаалал амжилтгүй | "Ачаалж чадсангүй." [Дахин оролдох], `traceId` |

### 9.2 Каталог

| Дэлгэц | Төрөл | Гарчиг (mn) | Тайлбар | CTA |
|---|---|---|---|---|
| S-SAL-01 Нэхэмжлэх | FIRST_USE | "Анхны нэхэмжлэхээ үүсгэе" | "Нэхэмжлэх батлахад eBarimt автоматаар гарна." | [+ Шинэ нэхэмжлэх (Alt+N)] |
| S-SAL-05 Батлагдсан нэхэмжлэх | FIRST_USE | "Батлагдсан нэхэмжлэх алга" | "Ноорог нэхэмжлэхээ батална уу." | [Ноорог руу] |
| S-PTY-01 Харилцагч | FIRST_USE | "Харилцагч бүртгээгүй байна" | "Нэг нэгээр нэмэх эсвэл Excel-ээс импортлох." | [+ Шинэ харилцагч] [Excel импорт] |
| S-BNK-09 Тулгалт | FIRST_USE | "Банкны хуулга импортлоогүй" | "Хаан, Голомт банкны файл эсвэл CSV/XLSX." | [Хуулга импорт] |
| S-BNK-09 Тулгалт | NOT_CONFIGURED | "Банкны данс алга" | "Эхлээд мөнгөний данс нэмнэ үү." | [Банкны данс нэмэх] |
| S-EBR-02 eBarimt хяналт | NOT_CONFIGURED | "eBarimt тохируулаагүй" | "Батлагдсан борлуулалтад баримт гарахгүй байна." | [eBarimt тохируулах] |
| S-EBR-02 eBarimt хяналт | NO_RESULTS (анхдагч шүүлтүүр: асуудалтай) | "✓ Асуудалтай баримт алга" | "Бүх баримт бүртгэгдсэн." | [Бүх баримтыг харах] |
| S-GL-03 Журнал | FIRST_USE | "Журнал хоосон" | "Ихэнх бичилт баримтаас автоматаар үүснэ. Гар журналыг зөвхөн тусгай тохиолдолд." | [+ Мөр нэмэх] [Стандарт журналаас] |
| S-GL-05 Эхний үлдэгдэл | FIRST_USE | "Эхний үлдэгдэл оруулаагүй" | "Ашиглалтад орох огнооны өмнөх өдрийн үлдэгдэл." | [Excel загвар татах] [Импорт] |
| S-TAX-03 НӨАТ-ын тайлан | NOT_CONFIGURED | "НӨАТ төлөгч биш" | "Компанийн тохиргоонд НӨАТ төлөгч биш гэж бүртгэлтэй." | [Компанийн тохиргоо] |
| S-RPT-02 Гүйлгээ баланс | NO_RESULTS | "Энэ хугацаанд бичилт алга" | "Огнооны мужийг өөрчилнө үү." | — |
| S-PUR-09 Нийлүүлэгчийн ДДТД | FIRST_USE | "Нийлүүлэгчийн баримт бүртгээгүй" | "ДДТД бүртгэснээр орцын НӨАТ хасагдана." | [+ ДДТД бүртгэх] |
| Нүүрийн cue | ERROR | (tile дотор) "Ачаалж чадсангүй" | — | [Дахин оролдох] |

- **UX-EMPTY-01.** Хоосон төлөвийн CTA нь эрхтэй үед л. Эрхгүй бол "Энэ үйлдлийг {{role}} хийнэ" гэж тайлбарлана.
- **UX-EMPTY-02.** `NO_RESULTS` ба `FIRST_USE`-ийг ялгана: шүүлтүүр идэвхтэй үед `FIRST_USE`-ийг хэзээ ч харуулахгүй.
- **UX-EMPTY-03.** Ачаалж байх үед хоосон төлөв биш skeleton (300 ms-ээс удаан бол), эс бөгөөс юу ч харуулахгүй (анивчихаас сэргийлнэ).

---

## 10. Onboarding: компани тохируулах wizard ба эхлэх алхмууд

### 10.1 Урсгал

```text
Бүртгүүлэх (имэйл, нууц үг) → Имэйл баталгаажуулах → Тенант үүсгэх (FR-PLT-001 AC1)
  → MFA бүртгэх (OWNER заавал, 13 §5.6)
  → Компани тохируулах wizard (S-PLT-06, FR-PLT-003)
  → Нүүр + "Эхлэх алхмууд" (§10.4)
  → eBarimt wizard (S-EBR-01, 12 §3.1) → Анхны нэхэмжлэх (NFR-120: ≤ 15 мин)
```

### 10.2 Компани тохируулах wizard-ийн алхам

FR-PLT-003-ийн дараалал. Хадгалах газар нь schema-ийн нэр. Алхам 1–3 нь компани ба `platform.company_setup`-ийг `PROVISIONING` төлөвтэй үүсгэнэ; алхам 4–8-ийн сонголт SCR-UI-06-д; алхам 9 нэг transaction-д `platform.fn_provision_company_mn` (db/seed) ажиллуулна (FR-PLT-003 AC2: бүгд эсвэл юу ч үгүй).

| # | Алхам | Талбар (schema) | Шалгалт ба анхдагч | Алгасах |
|---|---|---|---|---|
| 1 | Компанийн профайл | `company_setup.legal_name` (заавал), `legal_name_en`, `legal_form` (LLC…), `registration_no` (ААН-д 7 орон), `tin` (ААН 11, хувь хүн 12–14; FR-PLT-002 AC1), `address`, `district_code` (4 орон), `phone`, `email`; захирал ба ерөнхий нягтлангийн нэр, лого, тамга (SCR-UI-07) | ТТД оруулахад [ТТД-ээр татах] → `getInfo` (12 SET-01/10): нэр, НӨАТ/НХАТ төлөгч эсэхийг санал болгоно (зөрвөл анхааруулга) | Үгүй |
| 2 | Татварын профайл | `vat_registered` + `vat_registered_from`, `city_tax_payer`, `accounting_standard` (IFRS_FOR_SMES анхдагч), `report_decimal_places` (0/2) | `vat_registered = true` бол `tin` заавал (schema CHECK). 2027 оны босгын тайлбар (D-K5) | Үгүй |
| 3 | Ашиглалтад орох огноо | `go_live_date`, үүсгэх санхүүгийн жил(үүд), `allow_posting_from/to` (анхдагч: go-live-ийн сарын 1 – хоосон) | Go-live < өнөөдөр + 1 жил; оны дунд бол "Эхний үлдэгдлийг {{date − 1}}-ээр оруулна" тайлбар (02 §14.8) | Үгүй |
| 4 | Дансны төлөвлөгөө | Загвар: "MN стандарт (4 оронтой, Маягт А-гийн харгалзаатай)" (R1-д ганц) | Модыг уншихаар урьдчилан харуулна (S-GL-01-ийн хэлбэр, read-only) | Үгүй |
| 5 | Дугаарын цуврал | `fn_mn_number_series_def`-ийн жагсаалт: SI, KO, KZ, … угтвар ба жишээ (`SI-2026-00001`) | Угтварыг анхны хэрэглээнээс өмнө засаж болно (`code20`); хуулийн цуврал гараар дугаарлахгүй (D-C7) — тайлбар | Тийм (анхдагч) |
| 6 | Касс ба банк | Касс `CASH01` "Үндсэн касс" (автомат); банкны данс: банк (Хаан, Голомт, ХХБ, Хас, Төрийн банк, бусад), дансны дугаар, валют MNT, импортын preset (`bank_statement_import_format.preset_bank`) | Банкны данс 0..n; G/L данс автоматаар (FR-BNK-001: давхардахгүй) | Тийм |
| 7 | Хэрэглэгч урих | Имэйл + role (`ACCOUNTANT`, `EXTERNAL_ACCOUNTANT`, `SALES_CLERK`, `VIEWER`); хугацаа (`expires_at`, External accountant, 13 CR-02) | Имэйл формат; өөрийгөө урихгүй | Тийм |
| 8 | Эхний үлдэгдэл | Сонголт: "Дараа оруулна" / "Excel загвараар" (S-PLT-19 руу) / "Гараар журналаар" (S-GL-05) | Зөвхөн сонголт хадгална; оруулалт wizard-ийн дараа | Тийм |
| 9 | Хураангуй ба үүсгэх | Бүх сонголтын хураангуй, засах холбоостой | [Компани үүсгэх] → progress ("Дансны төлөвлөгөө… Татварын тохиргоо… Дугаарын цуврал… Санхүүгийн жил…") | — |

### 10.3 Wizard-ийн харилцан үйлчлэл

| ID | Дүрэм |
|---|---|
| UX-ONB-01 | Алхмын заагч: дугаар + нэр + төлөв (✓ дууссан / ● одоогийн / ○ үлдсэн); `aria-current="step"`. Дууссан алхам руу буцаж болно; урагш зөвхөн "Дараах"-аар. |
| UX-ONB-02 | "Дараах" дарахад тухайн алхмын клиент шалгалт, дараа нь серверийн хадгалалт (алхам 1–3: `company_setup`, бусад: SCR-UI-06). Алдаатай бол шилжихгүй. Enter = Дараах (textarea-аас бусад). |
| UX-ONB-03 | "Хадгалаад гарах": дараа нь үргэлжлүүлнэ. Компани `PROVISIONING` төлөвтэй үед нүүр хуудас wizard-ийг "Үргэлжлүүлэх" товчтой харуулна. |
| UX-ONB-04 | Алхам 9-ийн хүсэлт `POST /api/v1/companies/{cid}:provision` (`Idempotency-Key`), 202 + job id; progress нь job-ын төлвөөр (2 s тутам). Амжилтгүй бол **юу ч үүсээгүй** (FR-PLT-003 AC2), алдааны мессеж ба [Дахин оролдох] (ижил сонголтоор, шинэ key). |
| UX-ONB-05 | Амжилттай бол нүүр рүү шилжиж, "Эхлэх алхмууд" нээлттэй, toast "Компани бэлэн боллоо. Туршилтын нэхэмжлэх үүсгэж үзээрэй." |
| UX-ONB-06 | Wizard-ийн өгөгдөлд PII-S (иргэний регистр) байхгүй. Хувь хүн бизнес эрхлэгчийн ТТД (12–14 орон) нь компанийн өөрийн `company_setup.tin` тул хадгалагдана, гэхдээ дэлгэцэнд оруулсны дараа маскаар (`*********123`), [Харах] нь `platform.pii.unmask`-аар (13 §10.4). |
| UX-ONB-07 | Туршилтын компани (`is_demo`): "Туршилтын өгөгдөлтэй компани үүсгэх" сонголт (Micro багцын хязгаарт тооцогдохгүй, FR-PLT-001 AC2); demo seed (18 §13.2). |

### 10.4 "Эхлэх алхмууд" шалгах хуудас

Нөхцлийг сервер тооцно (`GET …/home` → `checklist`). Бүгд дууссан эсвэл хэрэглэгч "Нуух" дарвал харагдахгүй.

| # | Алхам | Дууссан нөхцөл (өгөгдлөөс) | Холбоос |
|---|---|---|---|
| 1 | Компанийн профайл бүрэн | `company_setup.tin`, `address`, `phone` бөглөгдсөн | S-PLT-07 |
| 2 | eBarimt идэвхжүүлэх | `ebarimt.ebarimt_setup.enabled = true` | S-EBR-01 |
| 3 | Банкны данс нэмэх | `bank.bank_account` `kind = 'BANK'` ≥ 1 | S-BNK-02 |
| 4 | Эхний үлдэгдэл | `OPENING` source code-той гүйлгээ ≥ 1, эсвэл "Үлдэгдэлгүй эхэлсэн" тэмдэглэсэн | S-GL-05 |
| 5 | Харилцагч нэмэх | `party.customer` ≥ 1 | S-PTY-02 |
| 6 | Анхны нэхэмжлэх батлах | `sales.sales_invoice_header` ≥ 1 | S-SAL-02 |
| 7 | Хэрэглэгч урих | `platform.tenant_membership` ≥ 2 эсвэл "Ганцаараа ажиллана" | S-PLT-10 |
| 8 | Банкны хуулга импортлох | `bank.bank_statement` ≥ 1 | S-BNK-08 |

### 10.5 eBarimt wizard (S-EBR-01)

12 §3.1-ийн 9 алхмыг дагана. UI-ийн нэмэлт дүрэм:

- **UX-ONB-08.** Алхам 1–2: `getInfo` хариу ирэхэд нэр, НӨАТ/НХАТ төлөгч эсэхийг компанийн профайлтай **зэрэгцүүлж** харуулна; зөрвөл (12 SET-02) "Идэвхжүүлэх" идэвхгүй ба [Компанийн профайл засах] холбоос.
- **UX-ONB-09.** Алхам 3: дүүрэг/хороог хоёр шатлалт combobox (`getBranchInfo`); хайлтаар.
- **UX-ONB-10.** Алхам 9 (бэлэн байдлын шалгалт, 12 SET-07): анхааруулгын жагсаалт, мөр бүр засах холбоостой (жишээ нь "БҮНА-гүй 3 бараа ›"). Анхааруулга нь идэвхжүүлэхийг зогсоохгүй.
- **UX-ONB-11.** Орчин: `STAGING` анхдагч; `PRODUCTION` руу шилжүүлэх нь тусдаа баталгаажуулалттай ("Бодит татварын баримт гарна").

---

## 11. Хүртээмж (WCAG 2.2 AA)

Зорилт: NFR-070 (үндсэн урсгал WCAG 2.2 AA, axe алдаа 0), NFR-071 (гараар бүрэн), ADR-0015 #7. Үндсэн урсгал: нэвтрэх, нэхэмжлэх (S-SAL-02), бэлэн борлуулалт (S-SAL-09), кассын баримт (S-BNK-03/04), хуулга тулгах (S-BNK-09), журнал (S-GL-03), тайлан (S-RPT-02), wizard (S-PLT-06).

| ID | WCAG 2.2 SC | Дүрэм | Шалгах арга |
|---|---|---|---|
| UX-A11Y-01 | 1.1.1 | Дүрс-товч бүр `aria-label`-тай ("Хуулах", "Шүүлтүүр"); чимэглэлийн дүрс `aria-hidden`. | axe |
| UX-A11Y-02 | 1.3.1, 4.1.2 | Шошго `<label for>`-оор холбогдоно; хэсэг (FastTab) `<section aria-labelledby>`; grid AG Grid-ийн ARIA (`role="grid"`, `aria-rowcount`), `ariaLabel` = "Нэхэмжлэхийн мөрүүд". Өөрсдийн combobox, menu, dialog, tabs WAI-ARIA APG-ийн загвараар. | axe + гар шалгалт |
| UX-A11Y-03 | 1.3.5 | Нэвтрэх ба профайлд `autocomplete` (`email`, `current-password`, `one-time-code`, `organization`, `tel`). | Код review |
| UX-A11Y-04 | 1.4.1 | Төлөв, cue, сөрөг дүн зөвхөн өнгөөр биш: текст + дүрс + `-` тэмдэг. | Гар шалгалт (grayscale) |
| UX-A11Y-05 | 1.4.3, 1.4.11 | Текст ≥ 4.5:1, том текст ≥ 3:1, input-ийн хүрээ, фокус, төлөвийн тэмдгийн хүрээ ≥ 3:1. Token бүрийн харьцааг CI шалгана (§13.1). | Token-ийн тест |
| UX-A11Y-06 | 1.4.4, 1.4.10 | 200% томруулалтад агуулга алдагдахгүй. Grid ба тайлангаас бусад хуудас 320 CSS px-д нэг баганаар (reflow). Хоёр хэмжээст хүснэгт нь контейнер дотроо хэвтээ гүйлгэнэ (WCAG-ийн үл хамаарах тохиолдол). | Playwright 320 px |
| UX-A11Y-07 | 1.4.12, 1.4.13 | Текстийн зай нэмэгдэхэд эвдрэхгүй; tooltip Esc-ээр хаагдана, хулганаар дээр нь очиж болно, фокус алдагдах хүртэл үлдэнэ. | Гар шалгалт |
| UX-A11Y-08 | 2.1.1, 2.1.2 | Бүх үйлдэл гараар (§6.3). Grid-ээс гарах: Ctrl+Enter эсвэл эхний нүднээс Shift+Tab — гарын хавх (trap) байхгүй. Modal dialog фокусыг дотроо барина (энэ нь хавх биш; Esc хаана). | Гар шалгалтын скрипт |
| UX-A11Y-09 | 2.1.4 | Нэг тэмдэгтийн товчлол (`?`, огнооны `t`/`w`) зөвхөн тухайн компонент фокустай эсвэл input-аас гадуур ажиллана; "Миний тохиргоо"-нд нэг тэмдэгтийн товчлолыг унтраах сонголт. | Код review |
| UX-A11Y-10 | 2.2.1 | Session-ийн хугацааг сунгах анхааруулга (UX-NAV-18); toast хулгана/фокус дээр зогсоно (UX-VAL-12). | E2E |
| UX-A11Y-11 | 2.4.1, 2.4.2, 2.4.6 | "Агуулга руу шилжих" skip link (эхний Tab); `<title>` UX-NAV-12; хуудас бүр нэг `h1`. | axe |
| UX-A11Y-12 | 2.4.3, 2.4.7 | Фокусын дараалал харагдах дараалалтай ижил; фокусын тойрог `--focus-ring` (2 px цагаан + 2 px primary). `outline: none`-ийг тойрог орлуулахгүйгээр хэрэглэхгүй. | Гар шалгалт |
| UX-A11Y-13 | **2.4.11** (шинэ) | Наалттай толгой, үйлдлийн мөр, нийлбэрийн самбар фокустай элементийг **халхлахгүй**: `scroll-padding-top` = толгой + үйлдлийн мөрийн өндөр, `scroll-padding-bottom` = нийлбэрийн самбар. AG Grid `ensureIndexVisible` нь фокустай мөрийг харагдах хэсэгт байлгана. | Playwright: фокусын bounding box харагдах хэсэгт |
| UX-A11Y-14 | 1.1.1, 1.3.1 | График (мөнгөний хөдөлгөөн) нь `role="img"` + товч тайлбар, мөн [Хүснэгтээр харах] товч ижил өгөгдлийг хүснэгтээр. | axe + гар |
| UX-A11Y-15 | **2.5.7** (шинэ) | Чирэх үйлдэл бүр чирэлгүй хувилбартай: баганын дараалал → баганын цэс "Зүүн/Баруун тийш зөөх"; файл → [Файл сонгох]; тулгалтад мөр чирэх → [Тулгах] товч. | Гар шалгалт |
| UX-A11Y-16 | **2.5.8** (шинэ) | Дарах талбай ≥ 24 × 24 CSS px (desktop дүрс-товч 28 px); `pointer: coarse` үед ≥ 44 px (§12). Grid-ийн мөрийн өндөр ≥ 28 px. | Playwright хэмжилт |
| UX-A11Y-17 | 3.1.1, 3.1.2 | `<html lang="mn">` (англи үед `en`); англи дэд шошго `lang="en"`. | axe |
| UX-A11Y-18 | 3.2.1, 3.2.2 | Фокус эсвэл утга сонгох нь гэнэт шилжүүлэхгүй (lookup сонгоход хуудас солигдохгүй); харилцагч солиход баталгаажуулна (UX-DOC-03). | E2E |
| UX-A11Y-19 | **3.2.6** (шинэ) | Тусламж (`?` товч, "Support-д хандах") бүх хуудсанд top bar-ын ижил байрлалд. | Гар шалгалт |
| UX-A11Y-20 | 3.3.1–3.3.3 | Алдааг текстээр, талбартай холбож, засах санал хамт (§8). | axe + review |
| UX-A11Y-21 | 3.3.4 | Санхүүгийн үр дагавартай үйлдэл: preview + баталгаажуулалт (§4.7, §5.5) — буцаагдахгүй үйлдлийг зөвхөн баталгаажуулсны дараа. | E2E |
| UX-A11Y-22 | **3.3.7** (шинэ) | Нэг урсгалд ижил мэдээллийг дахин асуухгүй: eBarimt wizard ТТД-г компанийн профайлаас; төлбөр бүртгэх нь дүн, харилцагчийг нэхэмжлэхээс бөглөнө. | Review |
| UX-A11Y-23 | **3.3.8** (шинэ) | Нэвтрэлт: нууц үг ба TOTP талбарт paste зөвшөөрнө, password manager ажиллана (`autocomplete`), танин мэдэхүйн тест (CAPTCHA тааврын) байхгүй. | E2E |
| UX-A11Y-24 | 4.1.3 | Төлвийн мессеж `aria-live`: хадгалах заагч (polite), toast (polite), батлах амжилт (polite), батлах алдаа (assertive). | Screen reader |
| UX-A11Y-25 | Тест | Playwright + `@axe-core/playwright` үндсэн урсгал бүрд 0 зөрчил (CI-ийн nightly, NFR-070). Release бүрд гар шалгалт: NVDA + Chrome, VoiceOver + Safari, зөвхөн гараар 8 урсгал. Монгол TTS-ийн дэмжлэг хязгаарлагдмал (OQ-UI-10) тул `lang` ба шошгын бүтцийг заавал шалгана. | CI + checklist |

---

## 12. Responsive ба мобайл

| Цэг | Өргөн | Байршил |
|---|---|---|
| `xs` | < 600 px | Утас: нэг багана, цэс drawer, жагсаалт карт хэлбэрээр |
| `sm` | 600–767 px | Том утас: `xs`-тэй ижил, 2 баганат форм |
| `md` | 768–1279 px | Tablet: цэс дүрсээр (56 px), FactBox drawer, мөрийн цөөн багана |
| `lg` | 1280–1599 px | Desktop: бүрэн (NFR-072-ын суурь 1280 × 720) |
| `xl` | ≥ 1600 px | Desktop: FactBox үргэлж нээлттэй байж болно |

| ID | Дүрэм |
|---|---|
| UX-RESP-01 | Бүх дэлгэц ≥ 1280 × 720-д бүрэн ажиллана (NFR-072). |
| UX-RESP-02 | `md` (tablet, ≥ 768): Sales clerk-ийн урсгал бүрэн — S-PLT-05 (SALES_HOME), S-SAL-01/02/05/06, S-SAL-09, S-BNK-03, S-EBR-04, S-PTY-01/02. Баримтын мөрийн grid нь 4 багана (Бараа, Тоо, Үнэ, Дүн); бусад нь мөрийг дэлгэхэд ("Дэлгэрэнгүй"). |
| UX-RESP-03 | `xs`/`sm` (утас): **унших** — нүүр, жагсаалт (карт хэлбэр: гарчиг, дүн, төлөв), баримт/карт (босоо), тайлангийн хураангуй + [PDF] [Excel]; **оруулах** — S-SAL-09 бэлэн борлуулалт ба S-BNK-03 кассын орлого (Should, NFR-080). Журнал, тулгалт, CoA засвар, wizard: "Энэ хуудсыг том дэлгэцээр ашиглана уу" + унших хувилбар. |
| UX-RESP-04 | Утсан дээрх баримтын мөр: мөр бүр карт ("Бараа · 2 × 15,000 = 30,000"), [+ Мөр нэмэх] нь доод талын bottom sheet-ээр. Тоон талбар `inputmode="decimal"`, огноо `type="text"` + сонгогч (§7.4-ийн parse хэвээр). |
| UX-RESP-05 | `pointer: coarse` үед товч, мөр, checkbox ≥ 44 × 44 px; hover-оос хамаарах мэдээлэл (tooltip) товшилтоор нээгдэнэ. |
| UX-RESP-06 | Үйлдлийн мөр жижиг дэлгэцэд: үндсэн үйлдэл + `⋯`; утсан дээр үндсэн үйлдэл доод талд наалттай (`position: sticky; bottom: 0`), UX-A11Y-13-ийн padding-тэй. |
| UX-RESP-07 | Хоёр хэмжээст тайлангийн хүснэгт (гүйлгээ баланс) жижиг дэлгэцэд эхний багана (данс) наалттай хэвтээ гүйлгэнэ; хураангуй карт ("Дебит = Кредит ✓") дээр. |
| UX-RESP-08 | Баркод уншигч (keyboard wedge, Should): S-SAL-09-ийн "Бараа" талбарт баркод + Enter → `inv.item.barcode`-оор (`ix_item__barcode`, яг тэнцүү) олж (мөрийн `sales_line.barcode` нь барааны картаас хуулагдана), тоо 1-ээр мөр нэмнэ; ижил бараа дахин уншигдвал тоо +1. |
| UX-RESP-09 | Жагсаалтын хэвлэлтийг браузерээр дэмжихгүй (серверийн PDF/Excel). Зөвхөн eBarimt-ийн баримт print CSS-тэй (UX-EBR-04). |
| UX-RESP-10 | Дэлгэцийн чиглэл (portrait/landscape) хоёуланд ажиллана (WCAG 1.3.4). |

---

## 13. Design token ба компонент

### 13.1 Token

Эх файл: `web/src/shared/ui/tokens.json` → build-ээр `tokens.css` (CSS custom property). AG Grid-ийн `--ag-*` хувьсагчийг эдгээрт холбоно (CSP-ийн улмаас legacy CSS theme эсвэл `styleNonce`, ADR-0015 #4). Харанхуй горим R2 (ижил нэртэй token-ийг дахин тодорхойлно).

**Өнгө** (харьцаа нь цагаан `#FFFFFF` дэвсгэр дээр; CI тест UX-TOK-01):

| Token | Утга | Харьцаа | Хэрэглээ |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | — | Хуудасны дэвсгэр |
| `--color-bg-subtle` | `#F5F6F8` | — | Хэсгийн дэвсгэр, grid-ийн толгой |
| `--color-border` | `#D5DAE1` | (чимэглэл) | Хуваагч шугам |
| `--color-border-input` | `#7D8799` | 3.6:1 | Input, checkbox-ийн хүрээ (1.4.11) |
| `--color-text` | `#1F2733` | ≈ 15:1 | Үндсэн текст |
| `--color-text-muted` | `#5B6575` | 5.9:1 | Туслах текст, шошго |
| `--color-primary` | `#1F5FBF` | 6.1:1 | Үндсэн товч, холбоос, фокус |
| `--color-primary-hover` | `#174C99` | 8.3:1 | Hover |
| `--color-success` / `-bg` | `#1E7A3C` / `#E6F4EA` | 5.4:1 | Амжилт, `FAVORABLE`, Төлөгдсөн, Бүртгэгдсэн |
| `--color-warning` / `-bg` | `#8A5A00` / `#FFF4D6` | 5.9:1 | `AMBIGUOUS`, Хэсэгчлэн, анхааруулга |
| `--color-danger` / `-bg` | `#B42318` / `#FDECEA` | 6.6:1 | Алдаа, `UNFAVORABLE`, Хугацаа хэтэрсэн, Татгалзсан, Тодорхойгүй |
| `--color-info` / `-bg` | `#0B6E99` / `#E6F2F8` | 5.7:1 | Мэдээлэл, Төлөгдөөгүй, Хүлээгдэж буй |
| `--color-neutral` / `-bg` | `#3D4654` / `#EEF0F3` | ≈ 9:1 | Ноорог, Цуцлагдсан, Шаардлагагүй |
| `--color-focus-ring` | `0 0 0 2px #FFFFFF, 0 0 0 4px #1F5FBF` | — | Фокус |
| `--company-badge-1..8` | `#1F5FBF #6B3FA0 #0B6E99 #1E7A3C #8A5A00 #B42318 #4A5568 #9C2C6E` | цагаан текст ≥ 5.3:1 (хамгийн бага `#1E7A3C` = 5.38) | Компанийн тэмдэг (UX-NAV-04) |

Төлөвийн token (`status.*`, `cue.*`) нь дээрх семантик өнгөнд заана: `status.success → --color-success` г.м.; `cue.subordinate → --color-text-muted`.

**Бусад token:**

| Бүлэг | Token | Утга |
|---|---|---|
| Фонт | `--font-sans` | `"Noto Sans", system-ui, sans-serif` — self-host WOFF2, **latin + cyrillic + cyrillic-ext** subset (Ө U+04E8, Ү U+04AE нь cyrillic-ext-д), CDN хориотой (ADR-0015 #4, ADR-0017 #6) |
| | `--font-mono` | `"Noto Sans Mono", ui-monospace, monospace` (ДДТД, код) |
| | `--font-numeric` | `font-variant-numeric: tabular-nums` (бүх тоон нүд) |
| Хэмжээ (px / line-height) | `--text-xs` 12/16, `--text-sm` 13/18 (grid), `--text-md` 14/20 (үндсэн), `--text-lg` 16/24, `--text-xl` 20/28 (h2), `--text-2xl` 24/32 (h1), `--text-kpi` 28/36 | |
| Жин | `--weight-regular` 400, `--weight-semibold` 600 | |
| Зай | `--space-1..8` | 4, 8, 12, 16, 20, 24, 32, 48 px |
| Радиус | `--radius-sm` 4, `--radius-md` 8, `--radius-lg` 12 | |
| Сүүдэр | `--shadow-1` `0 1px 2px rgb(16 24 40 / .08)`; `--shadow-2` `0 4px 12px rgb(16 24 40 / .12)`; `--shadow-3` `0 12px 32px rgb(16 24 40 / .18)` | |
| Давхарга | `--z-sticky` 100, `--z-dropdown` 1000, `--z-drawer` 1100, `--z-dialog` 1200, `--z-toast` 1300, `--z-print` 1400 | |
| Хөдөлгөөн | `--duration-fast` 120 ms, `--duration-base` 200 ms, `--easing` `cubic-bezier(.2,0,0,1)`; `prefers-reduced-motion: reduce` → 0 ms | |
| Нягтрал | `--row-compact` 28, `--row-regular` 36, `--row-touch` 44 px; `--control-h` 32 px (coarse: 44 px) | |
| Хэмжээ | `--nav-w` 240 (хураасан 56), `--factbox-w` 320, `--topbar-h` 48 px | |

- **UX-TOK-01.** CI тест: `tokens.json`-ийн текст/дэвсгэрийн хос бүрийн харьцаа ≥ 4.5:1 (том текст 3:1), хүрээ ≥ 3:1. Компонент шууд hex бичихийг stylelint хориглоно (`color-no-hex` компонентод).
- **UX-TOK-02.** Үсгийн хэмжээг `rem`-ээр (суурь 16 px = 1 rem; `--text-md` = 0.875 rem), хэрэглэгчийн браузерийн тохиргоог хүндэтгэнэ.

### 13.2 Компонентын жагсаалт

Headless хүртээмжтэй primitive (combobox, menu, dialog, tabs, date picker) ашиглана; санал: React Aria Components (Apache-2.0) эсвэл Radix UI (MIT) — ADR шаардлагатай (OQ-UI-09). Дүрс: Lucide (ISC), SVG sprite-аар bundle. QR: `qrcode` (MIT), bundle (12 PRN-04).

| Компонент | Зорилго | Гол шинж / дүрэм |
|---|---|---|
| `AppShell`, `TopBar`, `NavMenu`, `Breadcrumb` | Хүрээ | §2.1–2.2; skip link; цэс эрхээр |
| `CompanySwitcher` | Компани солих (Ctrl+O) | Тэмдэг, "ТУРШИЛТ", хайлттай жагсаалт |
| `CommandSearch` | Хайх (Alt+Q) | §2.4; combobox + бүлэгтэй үр дүн |
| `Banner` | Тууз | §4.9; `role=status/alert` |
| `PageHeader` | Гарчиг + `StatusBadge` + `SaveIndicator` | UX-SAVE-02 |
| `ActionBar`, `OverflowMenu` | Үйлдэл | UX-PAGE-01..06; `aria-keyshortcuts` |
| `FieldGroup` (FastTab) | Талбарын бүлэг | Эвхэх, "Дэлгэрэнгүй", хураангуй |
| `FormField` | Шошго + оролт + тайлбар + алдаа | `aria-describedby`, `aria-invalid`, Alt+↑ |
| `TextInput`, `CodeInput` | Текст / код | `CodeInput`: том үсэг, `code20` regex |
| `MoneyInput`, `DecimalInput` | Мөнгө / тоо / үнэ / хувь | §7.3; `inputmode="decimal"`; NumpadDecimal |
| `DateInput`, `DatePicker` | Огноо | §7.4; Даваа гарагаас |
| `Lookup` | Харилцагч, данс, бараа сонгох | UX-PAGE-11, UX-GRID-09 |
| `EnumSelect`, `Checkbox`, `Switch` | Сонголт | i18n `enums.*` |
| `TinInput` | ТТД + [ТТД-ээр татах] | 12 SET-10/11; "шалгагдаагүй" тэмдэг |
| `DdtdInput`, `IdText` | ДДТД оруулах/харуулах | 33 орон; хуулах товч |
| `MaskedValue` | PII маск + [Харах] (unmask) | 13 §10.5: step-up, 60 s-ийн дараа арилна, state-д хадгалахгүй |
| `DataGrid` | AG Grid wrapper | §6: баганын төрөл, товчлол, paste/copy, төлөв хадгалах, keyset |
| `LinesGrid` | Баримтын мөр | Шинэ хоосон мөр, quick entry, мөрийн алдаа |
| `TotalsPanel` | Нийлбэр | §5.3; "≈" урьдчилсан |
| `StatusBadge` | Төлөвийн тэмдэг | Текст + дүрс + өнгө |
| `EbarimtStatusPanel` | eBarimt FactBox | §5.8 |
| `CueTile`, `KpiTile`, `Headline`, `Checklist` | Нүүр | §3 |
| `LineChart` + `DataTableAlt` | График | UX-A11Y-14; library-г OQ-UI-11 |
| `FactBoxPane` | Хажуугийн самбар | Alt+F2; drawer (< 1280) |
| `AttachmentList`, `FileDropzone` | Хавсралт | UX-DOC-10; товч хувилбартай |
| `SignaturePanel` | Гарын үсэг | UX-DOC-11 |
| `ErrorListPanel` | Алдааны жагсаалт | §8.3 |
| `Toast`, `ToastRegion` | Мэдэгдэл | UX-VAL-11/12 |
| `ConfirmDialog`, `StepUpDialog`, `SessionTimeoutDialog`, `KeyboardHelpDialog` | Dialog | §4.7, §4.8, UX-NAV-18, UX-GRID-04 |
| `PostingPreviewDialog` | Батлахын өмнө харах | §5.5 |
| `EbarimtPrintModal` | QR + сугалаа хэвлэх | UX-EBR-02..05; state-ийг хаахад цэвэрлэнэ |
| `Wizard`, `Stepper` | Алхамт урсгал | §10.3 |
| `ImportMapper` | Импортын багана харгалзуулах | S-PLT-19, S-BNK-08 |
| `ReportFilterPanel`, `ReportTable` | Тайлан | Шүүлтүүр URL-д, drill-down |
| `EmptyState`, `Skeleton` | Хоосон, ачаалж буй | §9 |
| `AmountInWords` | Дүн үсгээр | Серверийн утга (UX-FMT-12) |

- **UX-TOK-03.** Компонент бүр Storybook-д (эсвэл ижил) mn ба en, pseudo-locale (§14.8), `md`/`lg` өргөнтэй story-той; axe addon 0 зөрчил.

---

## 14. i18n түлхүүрийн дүрэм

ADR-0017 ба 18 §3.5-ыг нарийвчилна: `i18next` + `react-i18next`, namespace = модуль, `mn` нь анхдагч ба fallback.

### 14.1 Файл ба namespace

- Файл: `web/src/locales/{mn,en}/{namespace}.json`.
- Namespace: `common`, `nav`, `home`, `errors`, `enums`, `onboarding`, модуль: `platform`, `gl`, `tax`, `party`, `sales`, `purchase`, `bank`, `ebarimt`, `rpt` (R2: `fx`, `fa`, `inv`).

### 14.2 Түлхүүрийн хэлбэр

| ID | Дүрэм |
|---|---|
| UX-I18N-01 | Каноник нэр: `<namespace>.<screen>.<element>[.<sub>]` (18 §3.5: `sales.invoiceList.columns.dueDate`). Кодонд: `t('sales:invoiceList.columns.dueDate')`. Сегмент `camelCase`, зөвхөн `[a-zA-Z0-9]`. |
| UX-I18N-02 | `<screen>` нь дэлгэцийн ID-тай харгалзах нэр: `invoiceList` (S-SAL-01), `invoiceCard` (S-SAL-02), `postedInvoiceCard` (S-SAL-06), `cashVoucher` (S-BNK-03/04), `bankRec` (S-BNK-09), `journal` (S-GL-03), `accounts` (S-GL-01), `customerCard` (S-PTY-02), `trialBalance` (S-RPT-02), `vatReturn` (S-TAX-03), `setupWizard` (S-PLT-06). |
| UX-I18N-03 | `<element>` ангилал: `title`, `fields.<apiField>`, `columns.<apiField>`, `actions.<verb>`, `tooltips.<x>`, `messages.<x>`, `empty.<STATE>.{title,body,cta}`, `dialogs.<x>.{title,body,confirm,cancel}`, `sections.<x>`. |
| UX-I18N-04 | `fields.*` ба `columns.*`-ийн нэр нь **API-ийн camelCase талбар** (`dueDate`, `postingDate`, `ebarimtConsumerNo`) — schema ↔ API ↔ UI-г мөрдөх боломжтой. |
| UX-I18N-05 | Нийтлэг нэр томьёо (`Батлах`, `Ноорог`, `Бүртгэлийн огноо` …) `common`-д нэг удаа (§14.7); модуль `common.*`-ийг дахин орчуулахгүй, иш татна. CI lint: модулийн утга `common`-ийн нэр томьёотой яг ижил бол анхааруулга. |

### 14.3 Enum ба алдааны код

- **UX-I18N-06.** Enum: `enums.<enumName>.<API_VALUE>` — API-ийн утгыг **өөрчлөлтгүй** (Z-UI-9). Жишээ: `enums.ebarimtChainStatus.UNKNOWN` = "Тодорхойгүй", `enums.periodStatus.LOCKED` = "Түгжигдсэн", `enums.bankAccountKind.WALLET` = "Хэтэвч".
- **UX-I18N-07.** Алдаа: `errors.<code>`. Код цэгтэй тул JSON-д үүрлэсэн: `{"gl": {"period_closed": "…"}}` → `t('errors:gl.period_closed', args)`. UI-ийн алдаа `errors.ui.*` (§8.7). Орчуулга байхгүй кодод серверийн `detail` (сервер `Accept-Language`-ээр орчуулсан), дараа нь `errors.unknown` (§8.2).
- **UX-I18N-08.** API-ийн алдааны каталог (OpenAPI эсвэл тусдаа JSON) байвал CI бүх кодод `mn`/`en` түлхүүр байгааг шалгана (OQ-UI-05).

### 14.4 Утга оруулах (interpolation), олон тоо

- **UX-I18N-09.** Хувьсагч `{{name}}`. Тоо, мөнгө, огноог **formatter-ээр**: `{{amount, money}}`, `{{qty, qty}}`, `{{date, date}}`, `{{dateTime, dateTime}}` — i18next `formatter.add`-аар §7.2/§7.4-ийн функцийг (Intl биш) бүртгэнэ.
- **UX-I18N-10.** Орчуулсан хэсгүүдийг string-ээр холбохгүй (`t('a') + ' ' + t('b')` хориотой, ESLint дүрэм). Үгийн дараалал хэлээр өөр.
- **UX-I18N-11.** Олон тоо: i18next JSON v4 (`_one`, `_other`). Монголд нэр үг тоогоор ихэвчлэн өөрчлөгддөггүй тул `mn`-д `_other` хангалттай; `en`-д хоёулаа. CI: хоёр хэлэнд `_other` заавал.

### 14.5 Хэвлэх ба хуулийн текст

- **UX-I18N-12.** SPA-ийн eBarimt-ийн баримт (S-EBR-04) ба кассын баримтын урьдчилан харах нь `i18n.getFixedT('mn')`-ээр **үргэлж монголоор** (ADR-0017 #1). Сервер PDF-ийн текст `.resx`-д.
- **UX-I18N-13.** Хоёр хэлтэй өгөгдөл (`name` / `name_en`, `description` / `description_en`): UI хэл `en` ба `name_en` хоосон биш бол `name_en`, эс бөгөөс `name`. Хуулийн маягт ба экспорт үргэлж `name`.

### 14.6 Хэл солих

- **UX-I18N-14.** Хэл солиход дахин ачаалахгүй; `<html lang>` шинэчлэгдэнэ; сонголт `platform.app_user.preferred_language`-д (`PATCH /api/v1/me`). Нэвтрээгүй хуудсанд браузерийн хэлээр (`mn` бус бол ч `mn` анхдагч).

### 14.7 Нэр томьёоны хүснэгт (UI-д зөвшөөрсөн)

| English | Монгол (UI) | Хориотой хувилбар |
|---|---|---|
| Post | Батлах | Пост хийх, Постлох |
| Preview posting | Батлахын өмнө харах (товч: Урьдчилан харах) | Превью |
| Draft | Ноорог | Драфт |
| Release / Reopen | Бэлэн болгох / Дахин нээх | — |
| Reverse | Буцаах | Сторно |
| Cancel (invoice) / Correct | Цуцлах / Засах | Устгах (батлагдсан баримтад) |
| Credit memo | Кредит нот | Буцаалтын нэхэмжлэх |
| Apply / Unapply | Тулгах / Тулгалт цуцлах | — |
| Reconcile (bank) | Тулгах (хуулга) | — |
| Entries / Ledger | Бичилт / Дэвтэр | Бичлэг (ledger-т) |
| Balance / Net change | Үлдэгдэл / Гүйлгээ (эргэлт) | — |
| Posting date / Document date / Due date / VAT date | Бүртгэлийн огноо / Баримтын огноо / Төлөх огноо / НӨАТ-ын огноо | Пост огноо |
| Customer / Vendor / Item | Харилцагч / Нийлүүлэгч / Бараа | Клиент |
| Dimension | Хэмжигдэхүүн | Дименшн |
| Number series / Journal / Batch | Дугаарын цуврал / Журнал / Багц | — |
| Chart of accounts / Trial balance | Дансны төлөвлөгөө / Гүйлгээ баланс | — |
| Find entries / Search | Бичилт хайх / Хайх | Навигейт |

"Бүртгэлийн огноо" (posting date) нь [99-glossary.md](./99-glossary.md)-д нэмэгдэх санал (OQ-UI-12).

### 14.8 CI ба чанар

- **UX-I18N-15.** `npm run i18n:check`: `mn` ба `en` түлхүүрийн бүрэн ижил байдал 100% (NFR-060, release-ийн хаалга), ашиглагдаагүй түлхүүрийн тайлан, ICU/interpolation синтакс, §14.7-ийн хориотой хувилбарын lint.
- **UX-I18N-16.** Pseudo-locale `xx`: текстийг 35% уртасгаж `⟦…⟧`-оор хүрээлнэ; Playwright-ийн screenshot тестээр товч, баганын гарчиг, cue tile-д текст тасрах/давхцахыг илрүүлнэ (ADR-0017 #8). Товчны шошго `mn`-д ≤ 24 тэмдэгт (зөвлөмж).

```json
// web/src/locales/mn/sales.json (хэсэг)
{
  "invoiceCard": {
    "title": "Борлуулалтын нэхэмжлэх",
    "fields": { "customerId": "Харилцагч", "postingDate": "Бүртгэлийн огноо", "dueDate": "Төлөх огноо",
                "pricesIncludingVat": "Үнэ НӨАТ-тэй", "ebarimtConsumerNo": "Иргэний eBarimt дугаар" },
    "actions": { "post": "$t(common:actions.post)", "postAndPrint": "Батлаад хэвлэх", "preview": "$t(common:actions.preview)" },
    "dialogs": { "post": { "title": "Нэхэмжлэх батлах уу?",
                           "body": "Батлагдсан нэхэмжлэхийг засах боломжгүй. Залруулахдаа кредит нот үүсгэнэ.",
                           "confirm": "Тийм", "cancel": "Үгүй" } }
  },
  "post": { "success": "Нэхэмжлэх {{no}} батлагдлаа", "uncertain": "Батлалтын үр дүн тодорхойгүй. Дахин шалгана уу." },
  "invoiceList": { "columns": { "dueDate": "Төлөх огноо", "amountIncludingVat": "Нийт дүн (₮)" },
                   "empty": { "FIRST_USE": { "title": "Анхны нэхэмжлэхээ үүсгэе", "cta": "Шинэ нэхэмжлэх" } } }
}
```

---

## 15. Дэлгэцийн жагсаалт (screen inventory)

Багана: **Төрөл** — §4.1 (List, Card, Document, Worksheet, Report, Wizard, Dialog, Part = FactBox/хэсэг). **Эрх** — харах · үйлдэл (13 §6.3–6.6; `R/I/M/D x` = TABLE, `X a` = ACTION/REPORT; `T_SETUP` = 13 §6.2-ын бүлэг). **R** — хувилбар. ★ = §16-д wireframe-тэй.

### 15.1 Платформ

| ID | Нэр (mn / en) | Төрөл | Гол талбар | Үйлдэл | Эрх (харах · үйлдэл) | R | FR |
|---|---|---|---|---|---|:-:|---|
| S-PLT-01 | Нэвтрэх / Sign in | Form | Имэйл, нууц үг, TOTP | Нэвтрэх, Нууц үг сэргээх | нийтийн | 1 | FR-PLT-007 |
| S-PLT-02 | MFA бүртгэх / MFA enrollment | Wizard | QR (локалд зурсан), 6 оронтой код, 10 сэргээх код | Баталгаажуулах, Код татах | `/api/v1/me/*` | 1 | FR-PLT-007 |
| S-PLT-03 | Тенант сонгох / Tenant picker | List | Тенантын нэр, төлөв | Сонгох | `/bff/tenants` | 1 | FR-PLT-004 |
| S-PLT-04 | Компани солих / Company switcher | Panel | Нэр, тэмдэг, ТУРШИЛТ, role | Сонгох, Компани нэмэх | `platform.user_company_role` | 1 | FR-PLT-004 |
| S-PLT-05 ★ | Нүүр / Home | Role home | §3 | Шуурхай үйлдэл, cue → drill | бүгд | 1 | FR-PLT-015 |
| S-PLT-06 ★ | Компани тохируулах wizard / Company setup wizard | Wizard | §10.2 | Дараах, Хадгалаад гарах, Компани үүсгэх | `X platform.company.setup` (+ `X platform.company.create`) | 1 | FR-PLT-001, 003 |
| S-PLT-07 | Компанийн мэдээлэл / Company information | Card | `company_setup`: `legal_name`, `legal_name_en`, `legal_form`, `registration_no`, `tin`, `vat_registered(_from)`, `city_tax_payer`, `address`, `district_code`, `phone`, `email`, `accounting_standard`, `go_live_date`; захирал, ерөнхий нягтлан, лого, тамга (SCR-UI-07) | Засах, ТТД-ээр татах | `R platform.company_setup` · `M` (MFA) | 1 | FR-PLT-002 |
| S-PLT-08 | Ерөнхий тохиргоо / General settings | Card | `allow_posting_from/to`, `invoice_rounding_enabled`, `report_decimal_places`, `vat_rounding_type`; `general_ledger_setup`: хуримтлагдсан ашиг, тайлант үеийн ашиг, бөөрөнхийлөлт, кассын илүүдэл/дутагдлын данс, `max_vat_difference_allowed`; `sales_setup.discount_posting` | Засах | `R` · `M platform.company_setup`, `T_SETUP` | 1 | FR-PLT-019, FR-GL-023 |
| S-PLT-09 | Хэрэглэгчид / Members | List | Нэр, имэйл (маск), төлөв, компани × role, MFA, сүүлд нэвтэрсэн, `expires_at` | Урих, Role оноох/хасах, Идэвхгүй болгох, Session хүчингүй болгох | `X platform.security.manage` | 1 | FR-PLT-004, 006 |
| S-PLT-10 | Хэрэглэгч урих / Invite user | Dialog | Имэйл, role, компани (бүгд / нэг), дуусах огноо | Урих | `X platform.user.invite` | 1 | FR-PLT-004 |
| S-PLT-11 | Role ба эрх / Roles and permission sets | List + Card | Role, permission set; set-ийн мөр (`object_type`, `object_name`, RIMDX) — системийнх read-only | Custom role үүсгэх, set нэмэх/хасах | `RIMD platform.role` (Owner) | 1 | FR-PLT-005 |
| S-PLT-12 | Дугаарын цуврал / Number series | List + Card | `code`, `description`, `gapless`, `reset_yearly`; мөр: `starting_date`, `prefix`, `width`, сүүлийн дугаар | Шинэ жилийн мөр, Угтвар засах (хэрэглээгүй) | `R platform.number_series` · `T_SETUP` | 1 | FR-PLT-008 |
| S-PLT-13 | Шалтгааны код / Reason codes | List (засвартай) | `code`, `description`, `blocked` | Нэмэх, Блоклох | `T_SETUP` | 1 | FR-GL-020 |
| S-PLT-14 | Аудитын лог / Change log | List | `changed_at`, хэрэглэгч, хүснэгт, мөр, үйлдэл, `changed_columns`, өмнө/дараа (diff) | Шүүх, Экспорт | `R audit.row_change` · `X audit.export` | 1 | FR-PLT-009 |
| S-PLT-15 | Аюулгүй байдлын лог / Security events | List | Цаг, `event_type`, хэрэглэгч, үр дүн | Шүүх | `R audit.security_event` (Owner) | 1 | 13 §9.6 |
| S-PLT-16 | Миний тохиргоо / My settings | Card | Хэл, огнооны формат (SCR-UI-01), ажлын огноо, нүүрийн хувилбар, баримтын өргөн 58/80 мм, нэг тэмдэгтийн товчлол, MFA, session-ууд | Хадгалах | өөрийн | 1 | FR-PLT-010 |
| S-PLT-17 | Бичилт хайх / Find entries | Worksheet | Баримтын дугаар, бүртгэлийн огноо, гадаад дугаар; үр дүн (хүснэгт, тоо), эх сурвалж | Хайх, Харах | `X rpt.navigate` | 1 | FR-PLT-013 |
| S-PLT-18 | Ажлын түүх / Background jobs | List | Ажил, төлөв, эхэлсэн/дууссан, оролдлого, алдаа, үр дүнгийн файл | Татах, Цуцлах (QUEUED) | өөрийн; `R integration.job_run` | 1 | FR-PLT-014 |
| S-PLT-19 | Excel импорт / Excel import | Wizard | Төрөл (харилцагч, нийлүүлэгч, бараа, данс, эхний үлдэгдэл), загвар, файл, харгалзуулалт, нүд бүрийн алдаатай preview | Загвар татах, Шалгах, Хэрэглэх | Зорилтот хүснэгтийн `I` | 1 | FR-INT-004, D-I5 |
| S-PLT-20 | Support хандалт / Support access | List + Dialog | `READ_ONLY`/`READ_WRITE`, эхлэх/дуусах (≤ 72 цаг), шалтгаан | Олгох (RW: step-up), Цуцлах | `X platform.security.manage` | 1 | FR-PLT-016 |
| S-PLT-21 | Мэдэгдэл / Notifications | Panel | Ажил дууссан, eBarimt-ийн дохио, экспорт бэлэн | Нээх | өөрийн | 1 | FR-PLT-015 |
| S-PLT-22 | Хавсралт / Attachments | Part | Файлын нэр, төрөл, хэмжээ, AV төлөв, хэн, хэзээ | Нэмэх, Татах | эх баримтын R; `X platform.attachment.add` | 1 (Should) | FR-PLT-011 |
| S-PLT-23 | Гарын үсэг / Signatures | Part | Үүрэг, хэрэглэгч, цаг, hash таарсан эсэх | Гарын үсэг зурах | `X platform.document.sign` / `approve_sign` | 1 (Should) | FR-PLT-012 |
| S-PLT-24 | Өгөгдөл экспорт / Data export | Wizard | Хамрах хүрээ; job-ын явц; 7 хоногийн холбоос | Эхлүүлэх (step-up) | `X platform.data.export` | 1 (Should) | FR-PLT-017 |
| S-PLT-25 | Компаниуд / Companies | List | Нэр, төлөв, туршилт, үүсгэсэн огноо | Үүсгэх (wizard), Архивлах (step-up) | `X platform.company.create` / `archive` | 1 | FR-PLT-001 |
| S-PLT-30 | Тохиргооны төв / Settings hub | List (холбоос) | Бүлэглэсэн холбоосууд | — | аль нэг тохиргооны R | 1 | — |

### 15.2 Ерөнхий дэвтэр ба хаалт

| ID | Нэр (mn / en) | Төрөл | Гол талбар | Үйлдэл | Эрх | R | FR |
|---|---|---|---|---|---|:-:|---|
| S-GL-01 ★ | Дансны төлөвлөгөө / Chart of accounts | List (мод) | `no`, `name`, `account_type`, `income_balance`, `account_category`, `direct_posting`, `blocked`, `normal_side`, Маягт А-гийн мөр, үлдэгдэл | Шинэ, Засах, Догол тохируулах, Блоклох, Устгах (хэрэглээгүй), Бичилт (Ctrl+F7), Маягт А-гийн шалгалт, Excel | `R gl.gl_account` · `T_SETUP` | 1 | FR-GL-001..005 |
| S-GL-02 | Дансны карт / G/L account card | Card | S-GL-01 + `totaling`, `indentation`, `gen_posting_type`, posting group, `cash_flow_category_id`, `reconciliation_account`, `name_en` | Хадгалах, Бичилт | ижил | 1 | FR-GL-001 |
| S-GL-03 ★ | Ерөнхий журнал / General journal | Worksheet | §16.5 | Батлах, Урьдчилан харах, Стандарт журналаас, Стандарт болгох, Буулгах, Тулгах | `RIMD gl.journal_line` · `X gl.journal.post` | 1 | FR-GL-006..011 |
| S-GL-04 | Стандарт журнал / Standard journals | List + Worksheet | `code`, `description`, мөрүүд | Журналд хуулах | `R gl.standard_journal` | 1 | FR-GL-016 |
| S-GL-05 | Эхний үлдэгдэл / Opening balances | Worksheet | `OPENING` багц: данс, дебит, кредит; авлага/өглөг баримтаар (харилцагч, дугаар, төлөх огноо) | Excel импорт, Урьдчилан харах, Батлах | `X gl.journal.post` | 1 | FR-GL-021, D-D7 |
| S-GL-06 | Ерөнхий дэвтрийн бичилт / G/L entries | List | `entry_no`, `posting_date`, `document_no`, данс, тайлбар, дебит, кредит, НӨАТ, `source_code`, хэрэглэгч, dimension, буцаагдсан | Бичилт хайх (Alt+G), Гүйлгээ | `R gl.gl_entry` | 1 | FR-GL-012 |
| S-GL-07 | Гүйлгээ ба бүртгэл / Transactions and registers | List | `transaction_no`, огноо, баримт, `source_code`, `is_closing`, буцаалтын холбоос, `gl_register.no`, хэрэглэгч | Гүйлгээ буцаах, Бүртгэл буцаах, Залруулах журнал | `R gl.gl_transaction` · `X gl.transaction.reverse`, `X gl.register.reverse` | 1 | FR-GL-013..015 |
| S-GL-08 | Батлахын өмнө харах / Posting preview | Dialog | Ledger бүрийн tab (§5.5) | Батлах, Хаах | эх баримтын эрх | 1 | FR-GL-011 |
| S-GL-09 | Санхүүгийн жил ба үе / Fiscal years and periods | List | Жил, үе, эхлэх/дуусах, төлөв, өөрчилсөн хүн/цаг; түүх | Хаах, Түгжих (step-up), Дахин нээх (шалтгаан, step-up), Жил үүсгэх | `R gl.accounting_period` · `X gl.period.close/lock/reopen` | 1 | FR-GL-022, 024 |
| S-GL-10 | Сарын хаалтын шалгах хуудас / Period close checklist | Worksheet | `GET /accounting-periods/{id}/close-checklist` → `items[]` (`code`, `title`, `status` OK/WARNING/BLOCKING, `count`, `detail`, `link`): банк тулгагдсан, касс тоологдсон, eBarimt асуудалгүй, орцын НӨАТ, НӨАТ-ын хаалт, Маягт А харгалзаа, дэд дэвтэр = ЕД | Алхам руу (`link`), Үе хаах (`:close`; `BLOCKING` > 0 бол идэвхгүй) | `X rpt.period_close_checklist` (CR-23) · `X gl.period.close` | 1 | FR-GL-025 |
| S-GL-11 | Жилийн хаалт / Year-end close | Wizard | Жил, "Тайлант үеийн ашиг" данс, хаалтын ваучерын preview, хуримтлагдсан ашиг руу шилжүүлэх санал | Урьдчилан харах, Хаах | `X gl.year.close` | 1 | FR-GL-026, D-D4 |
| S-GL-12 | Хэмжигдэхүүн / Dimensions | List + Card | `code`, `name`, утгууд (`code`, `name`, `value_type`, `blocked`); global 1/2 | Нэмэх | `R gl.dimension` · `T_SETUP` | 1 (default dim UI: 2) | FR-GL-018, 019 |
| S-GL-13 | Дансны тодорхойлолт / Posting setup | List (матриц) | Gen. Bus. × Gen. Prod.: борлуулалт, худалдан авалт, COGS данс; customer/vendor/bank posting group | Засах | `T_SETUP` | 1 | FR-SAL-004 |
| S-GL-14 | Журналын загвар ба багц / Journal templates | List | Загвар, төрөл, source code, цуврал; багц | Багц нэмэх | `R gl.journal_template` | 1 | — |
| S-GL-15 | Давтагдах журнал / Recurring journal | Worksheet | `recurring_method`, `recurring_frequency`, `expiration_date` | Батлах | `X gl.journal.post` | 2 | FR-GL-017 |

### 15.3 Татвар

| ID | Нэр (mn / en) | Төрөл | Гол талбар | Үйлдэл | Эрх | R | FR |
|---|---|---|---|---|---|:-:|---|
| S-TAX-01 | НӨАТ-ын тохиргоо / VAT posting setup | List (матриц) | VAT Bus. × Prod.: `vat_calculation_type`, хувь, данс, `vat_identifier`, `ebarimt_tax_type`, татварын барааны код | Засах | `T_SETUP` | 1 | FR-TAX-001, 002 |
| S-TAX-02 | НӨАТ-ын тайлангийн үе / VAT return periods | List | Үе, `due_date`, `status` (OPEN/CLOSED/SUBMITTED), хаалтын гүйлгээ, `submission_reference` | Нээх | `R tax.vat_return_period` | 1 | FR-TAX-015 |
| S-TAX-03 ★ | НӨАТ-ын тайлан (ТТ-03а) / VAT return | Report + Card | §16.9 | Тооцоолох (`GET /reports/vat-return`), Экспорт (`:export`, 202), НӨАТ хаах (`:close`), Илгээсэн болгох (`:submit`) | `ERP_VAT` (`X rpt.vat_return`, `X tax.vat.settle`, `X tax.vat_return.submit`; 14-ийн нэр OQ-UI-23) | 1 | FR-TAX-013..016 |
| S-TAX-04 | НӨАТ-ын бичилт / VAT entries | List | `entry_no`, `vat_date`, `entry_type`, баримт, `base`, `amount`, `vat_category`, `party_tin`, `deductible_confirmed`, ДДТД | Бичилт хайх | `R tax.vat_entry` | 1 | FR-TAX-007 |
| S-TAX-05 | Орцын НӨАТ баталгаажуулах / Input VAT confirmation | Worksheet | Баталгаажаагүй худалдан авалтын НӨАТ; нийлүүлэгчийн ДДТД-тэй тулгах | ДДТД холбох, Баталгаажуулах | `X tax.vat_entry.confirm_deductible` | 1 | FR-TAX-009, D-E4 |
| S-TAX-06 | Хуулийн параметр / Legal parameters | List (унших) | `param_code`, утга, нэгж, `effective_from/to`, `status`, эх сурвалж | — | `R tax.tax_parameter` | 1 | FR-TAX-017 |
| S-TAX-07 | Татварын календарь / Tax calendar | List | Хугацаа, маягт, үе, төлөв | — | `R tax.tax_parameter` | 1 (Should) | FR-TAX-018 |
| S-TAX-08 | НХАТ / City tax | List + Report | `city_tax_code`, `city_tax_entry` | — | | 2 | FR-TAX-019 |

### 15.4 Харилцагч, нийлүүлэгч, бараа

| ID | Нэр (mn / en) | Төрөл | Гол талбар | Үйлдэл | Эрх | R | FR |
|---|---|---|---|---|---|:-:|---|
| S-PTY-01 | Харилцагчид / Customers | List | `no`, `name`, `tin`, утас (маск), үлдэгдэл, хугацаа хэтэрсэн, `blocked` | Шинэ, Excel импорт, Нэхэмжлэх үүсгэх | `R party.customer` · `I` | 1 | FR-PTY-001 |
| S-PTY-02 ★ | Харилцагчийн карт / Customer card | Card | §16.7 | §16.7 | `R/M party.customer` | 1 | FR-PTY-001, 003..006 |
| S-PTY-03 | Нийлүүлэгчид / Vendors | List | `no`, `name`, `tin`, үлдэгдэл, `blocked` | Шинэ, Импорт | `R party.vendor` | 1 | FR-PTY-002 |
| S-PTY-04 | Нийлүүлэгчийн карт / Vendor card | Card | Харилцагчтай ижил + `ebarimt_merchant_tin`, банкны данс (`vendor_bank_account`, IBAN маск) | Хадгалах, Нэхэмжлэх, Бичилт | `R/M party.vendor` | 1 | FR-PTY-002, 016 |
| S-PTY-05 | Харилцагчийн бичилт / Customer ledger entries | List | `entry_no`, огноо, баримт, `due_date`, дүн, үлдэгдэл, `open`, `on_hold` | Тулгах (Shift+F11), Тулгалт цуцлах, Төлөх огноо засах (нээлттэй), Дэлгэрэнгүй бичилт | `R party.cust_ledger_entry` · `X party.customer.apply/unapply`, `X party.ledger_entry.edit` | 1 | FR-PTY-007, 009..014 |
| S-PTY-06 | Нийлүүлэгчийн бичилт / Vendor ledger entries | List | Ижил | Ижил (vendor) | `R party.vendor_ledger_entry` | 1 | FR-PTY-008 |
| S-PTY-07 | Тулгалт хийх / Apply entries | Worksheet | Тулгах entry; нээлттэй entry + тулгах дүн; Σ тулгасан, үлдэгдэл | Тулгах, Болих | apply эрх | 1 | FR-PTY-009, 010 |
| S-PTY-08 | Төлбөрийн нөхцөл / Payment terms | List (засвартай) | `code`, `description`, `due_date_calculation` | — | `T_SETUP` | 1 | FR-PTY-006 |
| S-PTY-09 | Төлбөрийн хэлбэр / Payment methods | List (засвартай) | `code`, `description`, харьцсан данс, `ebarimt_payment_code` | — | `T_SETUP` | 1 | FR-EBR-004 |
| S-PTY-10 | Загвар / Customer and vendor templates | List + Card | Posting group, нөхцөл, хэлбэр, eBarimt төрөл | — | `T_SETUP` | 1 (Should) | — |
| S-INV-01 | Бараа, үйлчилгээ / Items | List | `no`, `description`, `item_type`, `unit_price`, БҮНА, `blocked` | Шинэ, Импорт | `R inv.item` | 1 | FR-INV-001 |
| S-INV-02 | Барааны карт / Item card | Card | `item_type` (R1: SERVICE, NON_INVENTORY), нэгж, `unit_price`, `price_includes_vat`, `classification_code` (7 орон, лавлахаас), `tax_product_code`, `barcode`, posting group | Хадгалах | `RIMD inv.item` (`ERP_ITEM_EDIT`) | 1 | FR-INV-001, 002 |
| S-INV-03 | Хэмжих нэгж / Units of measure | List (засвартай) | `code`, нэр, eBarimt-ийн нэгж | — | `T_SETUP` | 1 | — |

### 15.5 Борлуулалт ба худалдан авалт

| ID | Нэр (mn / en) | Төрөл | Гол талбар | Үйлдэл | Эрх | R | FR |
|---|---|---|---|---|---|:-:|---|
| S-SAL-01 | Борлуулалтын нэхэмжлэх (ноорог) / Sales invoices | List | Ноорогийн дугаар, харилцагч, баримтын/бүртгэлийн/төлөх огноо, нийт дүн, төлөв (Ноорог/Бэлэн), үүсгэсэн | Шинэ, Сонгосныг батлах, Устгах | `R sales.sales_header` (Sales clerk: own, SEC-REC-03) | 1 | FR-SAL-001, 014 |
| S-SAL-02 ★ | Борлуулалтын нэхэмжлэх / Sales invoice | Document | §16.2 | §16.2 | `RIMD sales.sales_header/line` · `X sales.invoice.post` | 1 | FR-SAL-001..006, 011, 013 |
| S-SAL-03 | Кредит нот (ноорог) / Sales credit memos | List | + эх нэхэмжлэх, шалтгаан | Шинэ, Устгах | `R sales.sales_header` · `X sales.creditmemo.post` | 1 | FR-SAL-007 |
| S-SAL-04 | Кредит нот / Sales credit memo | Document | Толгой + `applies_to_doc_no` (эх нэхэмжлэх), `reason_code_id` (заавал), мөрүүд | Батлах, Урьдчилан харах, Эх нэхэмжлэхээс мөр татах | `X sales.creditmemo.post` | 1 | FR-SAL-007 |
| S-SAL-05 | Батлагдсан нэхэмжлэх / Posted sales invoices | List | `no`, огноо, харилцагч, нийт, үлдэгдэл, төлбөрийн төлөв, eBarimt төлөв, төлөх огноо | Хэвлэх, Илгээх, Төлбөр бүртгэх, Бичилт хайх, Excel | `R sales.sales_invoice_header` | 1 | FR-SAL-014 |
| S-SAL-06 | Батлагдсан нэхэмжлэх / Posted sales invoice | Document (унших) | Бүх талбар + eBarimt самбар (§5.8) + төлбөр | Хэвлэх, Илгээх, Цуцлах, Засах, Кредит нот, Хуулах, Төлбөр бүртгэх, Бичилт хайх (Alt+G), Хавсралт | `R` · §5.9 | 1 | FR-SAL-008..012 |
| S-SAL-07 | Батлагдсан кредит нот / Posted sales credit memos | List | Ижил + эх нэхэмжлэх | Хэвлэх, Бичилт хайх | `R sales.sales_cr_memo_header` | 1 | FR-SAL-007 |
| S-SAL-08 | Батлагдсан кредит нот / Posted sales credit memo | Document (унших) | Ижил + eBarimt (`DELETE`/`inactiveId`) | Хэвлэх | `R` | 1 | FR-EBR-009..011 |
| S-SAL-09 | Бэлэн борлуулалт / Cash sale | Document (хялбар) | Харилцагч (анхдагч "Иргэн", SCR-UI-09), төлбөрийн хэлбэр (CASH/CARD/QPAY), мөрүүд (баркод), иргэний eBarimt дугаар, B2B бол ТТД, нийт, төлсөн/хариулт (Should) | Батлаад хэвлэх (eBarimt цонх), Шинэ | `X sales.pos.post` | 1 | FR-SAL-006, FR-EBR-008, 016 |
| S-SAL-10 | Имэйлээр илгээх / Send e-mail | Dialog | §5.7 | Илгээх | `X sales.document.send` | 1 | FR-SAL-012 |
| S-SAL-11 | Төлбөр бүртгэх / Register payment | Dialog / Worksheet | Нэхэмжлэх(үүд), дүн, мөнгөний данс, огноо | Батлах | `X bank.payment.post` эсвэл `X bank.cash_receipt.post` | 1 | FR-BNK-006 |
| S-SAL-12 | Борлуулалтын тохиргоо / Sales setup | Card | Цуврал, `discount_posting`, `ext_doc_no_mandatory`, `default_posting_date`, `link_doc_date_to_posting_date`, `ebarimt_on_posting` | Засах | `T_SETUP` | 1 | — |
| S-PUR-01 | Худалдан авалтын нэхэмжлэх (ноорог) / Purchase invoices | List | Ноорог, нийлүүлэгч, нийлүүлэгчийн дугаар, огноо, нийт | Шинэ, Устгах | `R purchase.purchase_header` | 1 | FR-PUR-001 |
| S-PUR-02 | Худалдан авалтын нэхэмжлэх / Purchase invoice | Document | Нийлүүлэгч, нийлүүлэгчийн нэхэмжлэхийн дугаар (заавал, давхардахгүй), огноо, ДДТД (`purchase_receipt`), мөрүүд (G/L данс, бараа), НӨАТ; FactBox: ДДТД-ийн төлөв | Батлах, Урьдчилан харах, ДДТД холбох | `X purchase.invoice.post` | 1 | FR-PUR-001..004 |
| S-PUR-03 | Кредит нот (ноорог) / Purchase credit memos | List | | | | 1 | FR-PUR-005 |
| S-PUR-04 | Кредит нот / Purchase credit memo | Document | Эх нэхэмжлэх, шалтгаан | Батлах | `X purchase.creditmemo.post` | 1 | FR-PUR-005 |
| S-PUR-05..08 | Батлагдсан нэхэмжлэх / кредит нот (жагсаалт, карт) | List / Document | | Хэвлэх, Цуцлах (`X purchase.invoice.cancel`), Бичилт хайх | `R purchase.purch_*` | 1 | FR-PUR-006 |
| S-PUR-09 | Нийлүүлэгчийн eBarimt (ДДТД) / Supplier receipts | List + Dialog | ДДТД, нийлүүлэгчийн ТТД/нэр, огноо, нийт, НӨАТ, `status` (IMPORTED/MATCHED/CONFIRMED/REJECTED/RETURNED), холбогдсон нэхэмжлэх | ДДТД бүртгэх, Нэхэмжлэхтэй холбох, Татгалзах | `R ebarimt.purchase_receipt` · `X ebarimt.purchase_receipt.import` | 1 | FR-PUR-003, FR-TAX-009 |
| S-PUR-10 | Худалдан авалтын тохиргоо / Purchase setup | Card | Цуврал, тохиргоо | Засах | `T_SETUP` | 1 | — |

### 15.6 Мөнгө ба eBarimt

| ID | Нэр (mn / en) | Төрөл | Гол талбар | Үйлдэл | Эрх | R | FR |
|---|---|---|---|---|---|:-:|---|
| S-BNK-01 | Мөнгөний данс / Money accounts | List | `no`, `name`, `kind`, банк, дансны дугаар (маск), валют, үлдэгдэл, тулгагдаагүй, сүүлийн хуулга | Шинэ, Хуулга импорт, Тулгалт, Бичилт | `R bank.bank_account` | 1 | FR-BNK-001 |
| S-BNK-02 | Мөнгөний дансны карт / Money account card | Card | `kind`, `bank_name`, `bank_code`, `bank_account_no`, `iban`, `currency_code`, posting group, `import_format_id`, МХ-1/МХ-2 цуврал (`cash_receipt_no_series_id`, `cash_payment_no_series_id`; зөвхөн `CASH`), `prevent_negative_balance` (`CASH`-д **үргэлж тийм, засагдахгүй** — D-G1 хатуу хориг; `BANK`/`WALLET`-д сонголттой; schema-д CHECK алга тул SCR-UI-12), `min_balance`, тулгалтын хүлцэл (`match_tolerance_type`, `match_tolerance_value`), `blocked` | Хадгалах | `RIM bank.bank_account` | 1 | FR-BNK-001 |
| S-BNK-03 ★ | Кассын орлогын баримт (МХ-1) / Cash receipt voucher | Document | §16.3 | Батлах, Батлаад хэвлэх, Урьдчилан харах, Тулгах | `X bank.cash_receipt.post` | 1 | FR-BNK-002 |
| S-BNK-04 ★ | Кассын зарлагын баримт (МХ-2) / Cash payment voucher | Document | §16.3 | Ижил | `X bank.cash_payment.post` | 1 | FR-BNK-003 |
| S-BNK-05 | Кассын баримтууд / Cash vouchers | List | Төрөл, `no`, огноо, касс, харьцагч, зориулалт, дүн | Хэвлэх, Гарын үсэг, Гүйлгээ руу | `R bank.posted_cash_voucher` | 1 | FR-BNK-002, 003 |
| S-BNK-06 | Банкны орлого, зарлага / Bank journal | Worksheet | `CASH_RECEIPT/BANK`, `PAYMENT/BANK` багц: огноо, төрөл (харилцагч/нийлүүлэгч/данс), данс, тайлбар, дүн, банкны данс, тулгах баримт | Батлах, Тулгах, Төлөх нэхэмжлэхийн санал | `X bank.payment.post` | 1 | FR-BNK-005, 018 |
| S-BNK-07 | Данс хоорондын шилжүүлэг / Transfer | Dialog | Хаанаас, хаашаа, дүн, огноо, тайлбар | Батлах | `X bank.payment.post` (касс руу бол + `X bank.cash_receipt.post`) | 1 | FR-BNK-007 |
| S-BNK-08 | Хуулга импорт / Statement import | Wizard | Данс, файл, preset/харгалзуулалт, preview + үлдэгдлийн шалгалт, давхардлын хураангуй | Импорт (`POST /bank-accounts/{id}/statements:import`, multipart), Хаях (`/bank-statements/{id}:discard`) | `X bank.statement.import` | 1 | FR-BNK-008..010 |
| S-BNK-09 ★ | Банкны тулгалт / Bank reconciliation | Worksheet | §16.4 | §16.4 | `RIMD bank.bank_reconciliation(_line)` · `X bank.reconciliation.post` | 1 | FR-BNK-011..014 |
| S-BNK-10 | Хуулгын түүх / Posted bank statements | List + Card | Хуулгын дугаар, огноо, үлдэгдэл, мөр | Тулгалт буцаах (`POST /bank-account-statements/{id}:undo`, зөвхөн сүүлийнх) | `R bank.bank_account_statement` · `X bank.reconciliation.post` | 1 | FR-BNK-014, 016 |
| S-BNK-11 | Импортын профайл / Import formats | List + Card | `file_type`, `delimiter`, `header_rows`, `date_format`, `decimal_separator`, `amount_mode`, баганууд | Засах | `T_SETUP` | 1 | FR-BNK-008, 009 |
| S-BNK-12 | Текстээс данс руу / Text-to-account rules | List (засвартай) | `mapping_text`, дебит/кредит данс, харьцсан эх | Засах | `R/M bank.text_to_account_mapping` | 1 (Should) | FR-BNK-012 |
| S-BNK-13 | Кассын тооллого / Cash count | Dialog | Касс, дэвтрийн үлдэгдэл (серверээс), тоолсон дүн, зөрүү, (дэвсгэртийн задаргаа — OQ-UI-13) | Батлах (`POST /bank-accounts/{id}:count-cash`, зөрүүг `CASH_DIFF` шалтгаантай) | `X bank.cash_count.post` | 1 (Should) | FR-BNK-004 |
| S-BNK-14 | Банкны бичилт / Bank ledger entries | List | `entry_no`, огноо, баримт, тайлбар, харьцагч, дүн, `statement_status` | Бичилт хайх | `R bank.bank_ledger_entry` | 1 | — |
| S-BNK-15 | Төлөх нэхэмжлэхийн санал / Suggest vendor payments | Dialog | Төлөх огноо хүртэл, дээд хязгаар | Санал гаргах | `X bank.payment.post` | 1 (Should) | FR-BNK-018 |
| S-EBR-01 | eBarimt тохиргоо / eBarimt setup | Wizard + Card | 12 §3.1 (ТТД, нэр, НӨАТ/НХАТ, дүүрэг, салбар, POS, B2C анхдагч, орчин, бүртгэл, бэлэн байдал) | Дараах, Идэвхжүүлэх | `T_SETUP` M · `X ebarimt.merchant.register` | 1 | FR-EBR-001 |
| S-EBR-02 | eBarimt хяналт / eBarimt monitor | List + Detail | Шүүлтүүр (анхдагч: ERROR, UNKNOWN, 24 цагаас дээш PENDING), эх баримт, төрөл, POS, дүн, нас, `error_code`, оролдлого; PosAPI instance (сугалааны үлдэгдэл, сүүлийн `sendData`, эрүүл мэнд) | Бүртгэгдсэн / Бүртгэгдээгүй (S-EBR-05, `:resolve`), Засаад дахин илгээх (`:resend` + overrides), Цуцлах (`:cancel`), Порталын цуцлалтыг баталгаажуулах (`:confirm-manual-void`), Илгээж хэвлэх (PENDING B2C, `:send-and-print`), Хуулбар хэвлэх (`copy.pdf`), Нөхөж илгээх (`backfill`) — 12 §18.1 | `R ebarimt.ebarimt_document` · `X ebarimt.unknown.resolve`, `X sales.document.print` | 1 | FR-EBR-007, 013 |
| S-EBR-03 | eBarimt баримт / eBarimt document | Card (унших) | Төлөв, ДДТД, төрөл, `bill_id_suffix`, нийт, мөр, үйл явдлын түүх (`ebarimt_document_event`), засварын гинж (`GET /ebarimt/documents/{id}`) | Хуулбар хэвлэх (`GET …/{id}/copy.pdf`) | `R` | 1 | FR-EBR-012 |
| S-EBR-04 | eBarimt хэвлэх цонх / Receipt print | Modal | §5.8 | Хэвлэх, Хаах | батлагчийн | 1 | FR-EBR-008 |
| S-EBR-05 | Тодорхойгүйг шийдэх / Resolve UNKNOWN | Dialog | Шийдвэр, ДДТД (33), огноо/цаг, порталын нийт дүн, тэмдэглэл (≥ 10 тэмдэгт); 10 мин / 30 мин-ийн хүлээлтийн тоолуур (12 §11.2) | Шийдэх | `X ebarimt.unknown.resolve` | 1 | FR-EBR-007 |
| S-EBR-06 | POS / POS terminals | List (засвартай) | `pos_no` (R1: 3 орон), `branch_no`, тайлбар, касс, анхдагч, `blocked` | Засах | `T_SETUP` | 1 | FR-EBR-001 |
| S-EBR-07 | Илгээгдээгүй баримт / Unsent receipts report | Report | Огноо, дугаар, харилцагч, дүн, төлөв, нас, `error_code`, холбоос | Excel | `R ebarimt.ebarimt_document` | 1 | FR-EBR-013 |

### 15.7 Тайлан

Бүх тайлан: шүүлтүүрийн самбар (огноо/үе, dimension — R2-т бүрэн, FR-RPT-018), [Харах], drill-down, [Excel], [PDF] (`X rpt.export.excel`).

| ID | Нэр (mn / en) | Гол багана / шүүлтүүр | Эрх | R | FR |
|---|---|---|---|:-:|---|
| S-RPT-01 | Тайлангийн төв / Reports hub | Бүлгээр: Ерөнхий, Авлага/өглөг, Мөнгө, Татвар, Санхүүгийн тайлан, eBarimt | аль нэг тайлангийн X | 1 | — |
| S-RPT-02 ★ | Гүйлгээ баланс / Trial balance | §16.8 | `X rpt.trial_balance` | 1 | FR-RPT-001 |
| S-RPT-03 | Ерөнхий дэвтэр / G/L detail | Данс, огнооны муж; эхний үлдэгдэл, бичилт, эцсийн үлдэгдэл | `X rpt.gl_detail` | 1 | FR-RPT-002 |
| S-RPT-04 | Дансны хуулга, тооцоо нийлсэн акт / Account statement | Харилцагч/нийлүүлэгч, муж; PDF маягт | `X rpt.customer_statement` | 1 | FR-RPT-003 |
| S-RPT-05 | Авлагын насжилт / AR aging | Огноо (as-of), бүлэг (D-F7: 0–30/31–60/61–90/90+), харилцагч | `X rpt.customer_aging` | 1 | FR-RPT-004 |
| S-RPT-06 | Өглөгийн насжилт / AP aging | Ижил | `X rpt.vendor_aging` | 1 | FR-RPT-005 |
| S-RPT-07 | Касс ба банкны дэвтэр / Cash and bank book | Данс, муж; эхний, орлого, зарлага, эцсийн | `X rpt.gl_detail` | 1 | FR-RPT-006 |
| S-RPT-08 | Борлуулалт / худалдан авалтын журнал / Sales and purchase journals | Муж; баримт бүрийн суурь, НӨАТ, ДДТД | `X rpt.sales_journal` / `X rpt.purchase_journal` | 1 | FR-RPT-007 |
| S-RPT-09..12 | СБТ, ОДТ, ӨӨТ, МГТ (Маягт А) / Financial statements | Огноо/үе, харьцуулах үе, нэгж (₮ / мянган ₮) | `X rpt.balance_sheet` г.м. | 1 | FR-RPT-008..012 |
| S-RPT-13 | e-balance шивэх хуудас / e-balance keying sheet | Жил; мянган ₮; шивэх дараалал; зөрүүний мөр (D-C2) | `X rpt.ebalance.keying_sheet` | 1 | FR-RPT-013 |
| S-RPT-14 | Банкны тулгалтын тайлан / Bank reconciliation report | Данс, огноо: ЕД-ийн үлдэгдэл, хуулгын үлдэгдэл, тулгагдаагүй | `R bank.bank_account_statement` | 1 | FR-BNK-016 |
| S-RPT-15 | Өдрийн борлуулалт / Daily sales | Огноо, POS, хэрэглэгч; төлбөрийн хэлбэрээр | `X rpt.daily_sales` | 1 | — |
| S-RPT-16 | Жилийн архивын багц / Annual archive | Жил, төлөв, файл | `X platform.archive.download` | 1 | FR-RPT-017 |
| S-RPT-17 | Засварлах тайлан / Report designer | Мөр, баганын тодорхойлолт | `T_SETUP` | 2 | FR-RPT-016 |

### 15.8 R2-ийн дэлгэц (товч)

| ID | Нэр (mn / en) | Төрөл | FR |
|---|---|---|---|
| S-FX-01 | Валют / Currencies | List + Card | FR-FX-002 |
| S-FX-02 | Ханш / Exchange rates (Монголбанк) | List | FR-FX-003 |
| S-FX-03 | Ханшийн тэгшитгэл / Exchange rate adjustment | Wizard | FR-FX-008, 009 |
| S-FA-01..04 | Үндсэн хөрөнгө (жагсаалт, карт), элэгдлийн run, акт/борлуулалт | List, Card, Wizard, Dialog | FR-FA-001..011 |
| S-INV-04..06 | Барааны журнал, тооллого, үлдэгдлийн тайлан | Worksheet, Report | FR-INV-003..009 |

---

## 16. Wireframe ба дэлгэц тус бүрийн дүрэм (10 дэлгэц)

Wireframe нь бүтэц, талбарын дараалал, үйлдлийг харуулна; өнгө, яг хэмжээг §13 тогтооно. Жишээний данс нь MN seed-ийнх ([db/seed/mn_10_coa.sql](./db/seed/mn_10_coa.sql)), дугаар нь seed-ийн цуврал (`SI`, `KZ`, `GJ`, `J-` г.м., [mn_40_setup.sql](./db/seed/mn_40_setup.sql)).

### 16.1 Нүүр (S-PLT-05)

§3.6-д (Owner, Accountant, Sales clerk хувилбар).

### 16.2 Борлуулалтын нэхэмжлэх (S-SAL-02)

```text
┌ Нүүр › Борлуулалт › Нэхэмжлэх › DSI-000123 ─────────────────────────────────────────────────────────────────┐
│ Борлуулалтын нэхэмжлэх DSI-000123   [✎ Ноорог]                                         Хадгалсан 10:42      │
│ [Батлах F9] [Урьдчилан харах] [Батлаад хэвлэх ⇧F9] [Урьдчилан хэвлэх] [⋯ Бэлэн болгох · Хуулах · Dimension · Устгах]│
├─────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────┤
│ ▾ Ерөнхий                                                                                 │ Харилцагч            │
│   Харилцагч*        [C00012 · Номин ХХК               ▾]  ТТД 14012345678 ✓ НӨАТ төлөгч │ Үлдэгдэл 1,200,000.00 │
│   Баримтын огноо    [2026.10.06]   Бүртгэлийн огноо* [2026.10.06]   Төлөх огноо [2026.11.05]│ Хэтэрсэн   850,000.00⚠│
│   Төлбөрийн нөхцөл  [30 хоног ▾]   Төлбөрийн хэлбэр [Шилжүүлэг ▾]   ☐ Үнэ НӨАТ-тэй        │ Хязгаар  5,000,000.00 │
│   [Дэлгэрэнгүй харуулах ▸] (НӨАТ-ын огноо, гадаад дугаар, posting group, шалтгаан)        │ Сүүлд төлсөн 09.28    │
│ ▾ eBarimt   Төрөл [Автомат ▾] → B2B (ТТД-тэй ААН)   Худалдан авагчийн ТТД 14012345678    ├──────────────────────┤
│ ▾ Мөрүүд                                                                  [⤢ Ctrl+⇧F12]  │ Мөр 1                │
│ ┌───────┬─────────┬──────────────────────┬──────┬──────┬────────────┬──────┬────────────┬─────────┐ │ Данс 5110 Ажил,      │
│ │Төрөл  │Дугаар   │Тайлбар               │ Тоо  │Нэгж  │Нэгжийн үнэ │Хөн.% │Мөрийн дүн  │НӨАТ     │ │  үйлчилгээний орлого │
│ ├───────┼─────────┼──────────────────────┼──────┼──────┼────────────┼──────┼────────────┼─────────┤ │ НӨАТ 10% (VAT_ABLE)  │
│ │Бараа  │SRV-001  │Засвар үйлчилгээ      │    3 │цаг   │    333.335 │   10 │     900.01 │НӨАТ 10% │ │ БҮНА 9521100         │
│ │Данс   │8100     │Түрээсийн орлого      │    1 │      │  50,000.00 │      │  50,000.00 │НӨАТ 10% │ ├──────────────────────┤
│ │       │         │                      │      │      │            │      │            │         │ │ Хавсралт (0) [+ Файл]│
│ └───────┴─────────┴──────────────────────┴──────┴──────┴────────────┴──────┴────────────┴─────────┘ │                      │
│                                               Дүн (НӨАТ-гүй)            50,900.01 ₮       │                      │
│                                               НӨАТ 10%                   5,090.00 ₮       │                      │
│                                               Нийт дүн                  55,990.01 ₮       │                      │
│                          Тавин таван мянга есөн зуун ерэн төгрөг нэг мөнгө                │                      │
└─────────────────────────────────────────────────────────────────────────────────────────┴──────────────────────┘
```

Тооцоо (сервер, FR-SAL-003, D-E3): мөр 1 = round(3 × 333.335) = 1,000.01; хөнгөлөлт round(1,000.01 × 10%) = 100.00; дүн 900.01. НӨАТ нь identifier-ээр нэг удаа: round(50,900.01 × 10%) = 5,090.00. Нийт 55,990.01.

**Толгойн талбар:**

| Шошго | API талбар (schema) | Төрөл | Анхдагч / дүрэм |
|---|---|---|---|
| Харилцагч* | `customerId` (`sales_header.customer_id`) | Lookup | Шинэ нэхэмжлэхийг үүсгэх түлхүүр (UX-SAVE-05). `blocked IN ('INVOICE','ALL')` харилцагч ⊘ тэмдэгтэй, сонгоход алдаа |
| Баримтын огноо | `documentDate` | Огноо | Ажлын огноо |
| Бүртгэлийн огноо* | `postingDate` | Огноо | UX-DOC-04. Батлахад заавал |
| Төлөх огноо | `dueDate` | Огноо | Төлбөрийн нөхцөлөөс (UX-DOC-05) |
| НӨАТ-ын огноо | `vatDate` | Огноо (дэлгэрэнгүй), **зөвхөн унших** | Нэхэмжлэхэд = бүртгэлийн огноо, засахгүй (D-E9, 06 BR-SAL-34). Засах боломжтой нь зөвхөн худалдан авалтын нэхэмжлэх (S-PUR-02; нээлттэй НӨАТ-ын үе дотор) |
| Төлбөрийн нөхцөл | `paymentTermsId` | Lookup | Харилцагчаас |
| Төлбөрийн хэлбэр | `paymentMethodId` | Lookup | Харилцагчаас; харьцсан данстай хэлбэр (Бэлэн) сонговол "Бэлэн борлуулалт: батлахад төлбөр автоматаар бичигдэнэ" тайлбар (D-F5) |
| Үнэ НӨАТ-тэй | `pricesIncludingVat` | Checkbox | Харилцагчаас; мөртэй үед солиход баталгаажуулна |
| Гадаад дугаар | `externalDocumentNo` | Текст ≤ 35 | `ext_doc_no_mandatory` бол заавал |
| eBarimt төрөл | `ebarimtReceiptType` | Сонголт | `null` = "Автомат" (schema-д `AUTO` утга байхгүй; 06 §3.3 "NULL = автомат") → серверийн тодорхойлсон төрөл харагдана (UX-DOC-06). Бусад: `B2C_RECEIPT`, `B2B_RECEIPT`, `NONE`; `*_INVOICE` нь R2 (D-J1) тул R1-д жагсаалтад байхгүй |
| Худалдан авагчийн ТТД | `ebarimtCustomerTin` | `TinInput` | Зөвхөн B2B үед харагдана ба заавал (schema CHECK; PosAPI `customerTin` зөвхөн `B2B_*`-д). 11 оронтой ААН-ийн ТТД (7 оронтой улсын бүртгэлийн дугаар бол UX-CUST-02-оор хөрвүүлнэ) |
| Иргэний eBarimt дугаар | `ebarimtConsumerNo` | 8 орон, маск | Зөвхөн тодорхойлогдсон төрөл `B2C_RECEIPT` үед харагдана (PosAPI: `consumerNo` зөвхөн B2C_RECEIPT-д). Төрөл B2B/NONE болбол утгыг цэвэрлэх эсэхийг асууна; илгээхгүй үлдээвэл сервер 422 `ebarimt.consumer_no_invalid` (14 AT-API-055) |

| ID | Дүрэм |
|---|---|
| UX-SAL-01 | Мөрийн анхдагч төрөл "Бараа" (`ITEM`); компанид бараа бүртгэлгүй бол "Данс" (`GL_ACCOUNT`). Төрлийг Space эсвэл эхний үсгээр (Б/Д/Т) солино. |
| UX-SAL-02 | "Дугаар"-ын lookup төрлөөр шүүнэ: `ITEM` → `inv.item` (`blocked = false AND sales_blocked = false`); `GL_ACCOUNT` → `account_type = 'POSTING' AND direct_posting AND NOT blocked` (FR-SAL-002 AC1; сервер мөн шалгана). |
| UX-SAL-03 | Бараа сонгоход сервер тайлбар, нэгж, нэгжийн үнэ, НӨАТ-ын бүлэг, БҮНА-г бөглөнө. Клиент зөвхөн `itemId`, `quantity`-г илгээж, хариуны утгыг хэрэглэнэ. |
| UX-SAL-04 | "Хөн.%" багана анхдагчаар нуугдана; тохиргоо эсвэл аль нэг мөрөнд хөнгөлөлттэй бол харагдана. Global dimension тохируулсан бол "Хэмжигдэхүүн 1/2" багана (D-D2). БҮНА, татварын барааны код нь FactBox-д. |
| UX-SAL-05 | Нийлбэрийн самбар §5.3; "≈" урьдчилсан утга. Мөр бүрийн НӨАТ-ын дүнг мөрөнд биш, самбарт identifier-ээр харуулна (D-E3: баримтын түвшинд). |
| UX-SAL-06 | Батлах урсгал §5.4. B2C ба интерактив бол eBarimt хэвлэх цонх (UX-EBR-02). B2B бол toast "eBarimt илгээх дараалалд орлоо" ба FactBox-ийн төлөв. |
| UX-SAL-07 | "Бэлэн" (`RELEASED`) төлөвт толгой ба мөр зөвхөн унших; [Дахин нээх] (Ctrl+F9-ийн эсрэг) нь overflow-д. R1-д Бэлэн болгох нь заавал биш алхам. |
| UX-SAL-08 | Зээлийн хязгаар хэтрэх нь анхааруулга (W-03); блоклосон харилцагч алдаа. |
| UX-SAL-09 | Бэлэн борлуулалт (S-SAL-09) нь энэ хуудасны хялбар хувилбар: харилцагч анхдагч "Иргэн" (SCR-UI-09), огноо = өнөөдөр (засахгүй), төлбөрийн хэлбэр заавал, мөрийн багана: Бараа (баркод), Тоо, Үнэ, Дүн. "Төлсөн" ба "Хариулт" нь зөвхөн дэлгэцийн туслах тооцоо (decimal.js, хадгалахгүй). Alt+F9 = батлаад шинэ борлуулалт. |

### 16.3 Кассын баримт МХ-1 / МХ-2 (S-BNK-03, S-BNK-04)

Кассын баримт нь **ноорог хадгалахгүй, нэг командаар** батлагдана: `POST /api/v1/companies/{c}/payments` (`PaymentCreate`, `cashVoucher` объекттой; preview нь `POST /payments:preview`) — [14-api.md](./14-api.md) §15.4, BC Payment Registration. Сервер `bank.posted_cash_voucher` ба касс бүрийн `KO`/`KZ` цувралын завсаргүй дугаарыг (D-C7) нэг transaction-д үүсгэнэ. Форм санах ойд л байна (Z-UI-11).

```text
┌ Мөнгө › Кассын зарлага (МХ-2) › Шинэ ────────────────────────────────────────────────────────────────┐
│ Кассын зарлагын баримт (МХ-2)   Дугаар: батлахад олгоно (KZ-2026-#####)        ● Хадгалаагүй форм     │
│ [Батлах F9] [Батлаад хэвлэх ⇧F9] [Урьдчилан харах] [Тулгах ⇧F11] [⋯ Хэмжигдэхүүн · Цэвэрлэх]        │
├──────────────────────────────────────────────────────────────────────────────────┬────────────────────┤
│ Касс*              [CASH01 · Үндсэн касс                 ▾]                        │ Кассын үлдэгдэл    │
│ Бүртгэлийн огноо*  [2026.10.06]                                                    │ Одоо  2,140,500.00 │
│ Харьцагчийн төрөл* (•) Нийлүүлэгч  ( ) Харилцагч  ( ) Данс                         │ Дараа 1,840,500.00 │
│ Харьцагч*          [V00007 · Говь Түгээлт ХХК            ▾]                        ├────────────────────┤
│ Тулгах баримт      [PI-2026-00031 · үлдэгдэл 300,000.00  ▾]                        │ Нээлттэй баримт    │
│ Хүлээн авагч*      [Батбаяр Д.                           ]                         │ PI-2026-00031      │
│ Бичиг баримт*      [УБ99112233          ]  (батласны дараа маскаар)                │      300,000.00    │
│ Зориулалт*         [Бараа нийлүүлсний төлбөр                                  ]    │ PI-2026-00035      │
│ Дүн*               [                 300,000.00] ₮                                 │       85,000.00    │
│ [Дэлгэрэнгүй ▸] (хэмжигдэхүүн, шалтгаан, гадаад дугаар)                            │                    │
└──────────────────────────────────────────────────────────────────────────────────┴────────────────────┘
```

| Шошго | `PaymentCreate` (14-api) | Батлагдсан (`bank.posted_cash_voucher`) | Дүрэм |
|---|---|---|---|
| Төрөл | `direction` = `RECEIPT` (МХ-1) / `PAYMENT` (МХ-2) | `voucher_type` | Замаас (UX-CASH-01) |
| Касс* | `bankAccountId` | `bank_account_id` | Зөвхөн `kind = 'CASH' AND NOT blocked` (`cashVoucher` заавал) |
| Бүртгэлийн огноо* | `postingDate` | `posting_date` | Ажлын огноо |
| Харьцагчийн төрөл* | `partyType` (`CUSTOMER` / `VENDOR` / `GL_ACCOUNT`) | `counterparty_type` | `BANK_ACCOUNT` (шилжүүлэг) нь S-BNK-07 |
| Харьцагч* | `partyId` (эсвэл `partyNumber`) | `counterparty_id` | Lookup төрлөөр |
| Тулгах баримт | `applyTo[]` (`ledgerEntryId`, `amountToApply`) эсвэл `applyToOldest` | — (тулгалт) | UX-CASH-03 |
| Хүлээн авагч / Тушаагч* | `cashVoucher.counterpartyName` (1–200) | `counterparty_name` | UX-CASH-04 |
| Бичиг баримт | `cashVoucher.counterpartyIdDocument` (≤ 50) | `counterparty_id_doc` (`enc:v1:`, 13 CR-06) | МХ-2-т заавал (FR-BNK-003 AC2); МХ-1-д сонголттой (13 Q14) |
| Зориулалт* | `cashVoucher.purpose` (1–250) | `purpose` | |
| Тайлбар | `description` (≤ 100) | G/L entry-ийн тайлбар | Анхдагч = зориулалтын эхний 100 тэмдэгт |
| Дүн* | `amount` (эерэг) | `amount` (> 0) | 2 бутархай (§7.3) |
| Үсгээр | — | `amount_in_words` | Preview ба хэвлэмэлд серверээс (UX-FMT-12) |

| ID | Дүрэм |
|---|---|
| UX-CASH-01 | Төрөл нь замаар (`/cash/receipts/new` → МХ-1, `/cash/payments/new` → МХ-2); солихгүй. Гарчгийн өнгөний зураас: МХ-1 `--color-success`, МХ-2 `--color-warning` + текст (зөвхөн өнгө биш). |
| UX-CASH-02 | Касс анхдагч: компанийн анхдагч POS-ийн (`ebarimt_pos.is_default`) `bank_account_id` нь `CASH` бол тэр; эс бөгөөс компанийн ганц касс; олон бол сонгуулна. Сүүлд сонгосон кассыг `localStorage` (`ui:lastCash:{userId}:{companyId}`, зөвхөн id) санаж болно. Хэрэглэгч тус бүрийн POS нь SCR-UI-01 (`default_ebarimt_pos_id`). |
| UX-CASH-03 | Харилцагч (МХ-1) эсвэл нийлүүлэгч (МХ-2) сонгоход "Тулгах баримт" нь нээлттэй entry-үүдийг (`GET /customer-ledger-entries?open=true&…`) төлөх огноогоор санал болгоно. Сонгоход дүн = үлдэгдэл (засаж болно). Үлдэгдлээс их дүн → илүү нь нээлттэй урьдчилгаа (D-F4) гэж тайлбарлана. Олон баримтад хуваарилах = Shift+F11 (`applyTo[]` олон мөр). |
| UX-CASH-04 | Хүлээн авагч анхдагчаар харьцагчийн нэр; засаж болно (жишээ нь ажилтан мөнгө авсан). "Данс" төрөлд заавал гараар. |
| UX-CASH-05 | "Дараа" үлдэгдлийг клиент урьдчилан тооцно (`Decimal`; харуулалт л). МХ-2-ийн дараах үлдэгдэл < 0 ба серверийн үлдэгдэл ≤ 30 s-ийн өмнө ирсэн бол [Батлах] идэвхгүй, tooltip "Кассын үлдэгдэл хүрэлцэхгүй (D-G1)". Эцсийн шалгалт сервер (`bank.cash_negative_balance`, `ERC01`). |
| UX-CASH-06 | **Хадгалалт байхгүй** (UX-SAVE хамаарахгүй): форм санах ойд; бөглөсөн формоос гарах/компани солих/tab хаахад "Батлаагүй кассын баримт устна. Гарах уу?" анхааруулга. Бичиг баримтын дугаарыг (PII-S) browser storage-д хэзээ ч хадгалахгүй (UX-SEC-02). |
| UX-CASH-07 | F9 → §5.4-ийн урсгал (`POST /payments`, `Idempotency-Key` товч дарахад, `If-Match` байхгүй). Ctrl+Alt+F9 → `POST /payments:preview` (дүн үсгээр, ваучерын дугаар "***", G/L бичилт). Амжилттай бол `/cash/vouchers/{id}` (S-BNK-05-ийн карт): дугаар `KZ-2026-00015`, [Хэвлэх МХ-2] (`GET /cash-vouchers/{id}/pdf`), [Гарын үсэг] (FR-PLT-012), [Бичилт хайх]. Shift+F9 нь PDF-ийг шууд нээнэ (UX-PRN-07). |
| UX-CASH-08 | `SALES_CLERK`: зөвхөн МХ-1, зөвхөн `CASH` данс (SEC-REC-04); "Данс" төрлийн харьцагч харагдахгүй. |
| UX-CASH-09 | Утсан дээр (UX-RESP-03) МХ-1 нь нэг багана; дүнгийн талбар `inputmode="decimal"`. |

### 16.4 Банкны тулгалт (S-BNK-09)

```text
┌ Мөнгө › Хуулга ба тулгалт › Хаан-MNT · 2026-09 ─────────────────────────────────────────────────────────────┐
│ [Батлах ба тулгах F9] [Автомат тулгах] [Хуулга импорт] [Урьдчилан харах] [⋯ Дүрэм үүсгэх · Тулгалт устгах]  │
│ Данс: Хаан-MNT (1110)   Хуулгын №: 2026-09   Хуулгын огноо: 2026.09.30                                       │
│ Өмнөх үлдэгдэл 10,000,000.00 + Мөрүүд 500,000.00 = 10,500,000.00   Эцсийн үлдэгдэл [10,500,000.00]  ✓ Таарсан  │
│ Харах: (•) Бүгд (4)  ( ) Тулгагдаагүй (1)  ( ) Бага итгэлтэй (1)                                               │
├─ Хуулгын мөр ───────────────────────────────────────────────────────┬─ Санал: сонгосон мөр ──────────────────┤
│ Огноо  Тайлбар                Харьцагч      Дүн           Итгэл      │ "+1,100,000 SI-2026-00042 төлбөр"      │
│ 09.02  SI-2026-00042 төлбөр   Номин ХХК     +1,100,000.00 ● Өндөр    │ ● SI-2026-00042 · Номин ХХК            │
│ 09.05  Гүйлгээний шимтгэл                        -500.00 ● Дүрэм     │   үлдэгдэл 1,100,000.00 · оноо 3998    │
│ 09.11  Түрээс 9 сар           Од Трейд        -600,000.00 ◐ Дунд     │   шалтгаан: баримтын дугаар, дүн яг,   │
│ 09.20  Хадгаламжийн хүү                           +500.00 ○ Алга     │   харьцагчийн данс                     │
│                                                                      │ ○ Урьдчилгаа болгох (харилцагч)        │
│                                                                      │ ○ Данс руу бичих [8110 ▾]              │
│                                                                      │ [Тулгах ↵] [Тулгалт арилгах Del]       │
├──────────────────────────────────────────────────────────────────────┴────────────────────────────────────────┤
│ Σ хуулга 500,000.00 · Σ тулгасан 499,500.00 · Тулгагдаагүй 1 мөр (500.00) · Батлахад: 2 төлбөр, 1 дүрмийн бичилт│
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| ID | Дүрэм |
|---|---|
| UX-REC-01 | Данс бүрд нэг л нээлттэй тулгалт (`ux_bank_reconciliation__one_open`). Жагсаалтаас данс сонгоход нээлттэй байвал түүнийг, эс бөгөөс [Хуулга импорт] эсвэл [Гараар үүсгэх]-ийг санал болгоно. |
| UX-REC-02 | Толгойн шалгалт: `balance_last_statement + Σ statement_amount = statement_ending_balance`. ✓/✕ текст ба дүрсээр. ✕ үед [Батлах ба тулгах] идэвхгүй, tooltip "Мөрүүдийн нийлбэр эцсийн үлдэгдэлтэй таарахгүй (зөрүү 1,250.00)" (FR-BNK-013 AC2). Тулгагдаагүй мөр > 0 үед мөн идэвхгүй, tooltip "Тулгагдаагүй 1 мөр (500.00). Тулгах эсвэл данс руу бичнэ үү." ба [Тулгагдаагүйг харах] шүүлтүүр. |
| UX-REC-03 | Итгэлийн тэмдэг (`match_confidence`): `HIGH` ● Өндөр, `HIGH_TEXT_TO_ACCOUNT` ● Дүрэм, `MEDIUM` ◐ Дунд, `LOW` ◔ Бага, `NONE` ○ Алга, `MANUAL` ✎ Гараар, `ACCEPTED` ✓ Батлагдсан. Шалтгаан ба оноо санал дээр (PP-07, FR-BNK-011). |
| UX-REC-04 | Баруун самбар нь сонгосон мөрийн `bank.payment_application_proposal`-ыг `quality` буурахаар; мөн "Урьдчилгаа болгох", "Данс руу бичих", "Нээлттэй банкны бичилт" (өмнө батлагдсан төлбөр) сонголт. |
| UX-REC-05 | Гар: зүүн grid ↑↓; Tab → баруун самбар; Enter = фокустай саналыг батлах; зүүн grid дээр Ctrl+Enter = эхний саналыг батлах; Delete = тулгалт арилгах. Олон мөрийн бүлэг: Space-ээр мөрүүдийг сонгоод баруун талд зорилтуудыг сонгоно; доор "Бүлгийн зөрүү 0.00 ✓" байхад л [Тулгах] (Σ мөр = Σ зорилт, нэг харьцагч, FR-BNK-013). |
| UX-REC-06 | Зөрүүтэй тулгалт: "Зөрүү 2,000.00 — [Данс руу шилжүүлэх ▾ 8300]" нь мөрийг хувааж зөрүүг сонгосон дансанд санал болгоно. |
| UX-REC-07 | "Дүрэм үүсгэх" мөрийн тайлбараас `bank.text_to_account_mapping`-ийн ноорог (текст, данс)-ыг бөглөж dialog нээнэ (FR-BNK-012). |
| UX-REC-08 | F9 = Батлах ба тулгах: §5.4-ийн урсгал (`POST …/bank-reconciliations/{id}:post`, `Idempotency-Key`). Амжилттай бол хуулгын түүх (S-BNK-10) руу, toast "Хуулга 2026-09 тулгагдлаа. Үлдэгдэл 10,500,000.00". |
| UX-REC-09 | Чирж тулгах нь заавал биш; товчны хувилбартай (UX-A11Y-15). |
| UX-REC-10 | ≤ 2,000 мөр client-side; түүнээс их бол сервер хуудаслалт ба "Тулгагдаагүй" шүүлтүүр анхдагч. |
| UX-REC-11 | **API (14 §15.4):** нээх `GET /bank-reconciliations?bankAccountId=…` (нээлттэй нь ганц) эсвэл `POST /bank-reconciliations`; [Автомат тулгах] `POST …/{id}:auto-match` (дүрэм + оноо, FR-BNK-011); мөр тулгах `POST …/{id}/lines/{lineId}:match` (`{ targets: [...] }`, `If-Match`), арилгах `…:unmatch`; эцсийн үлдэгдэл `PATCH …/{id}`; [Урьдчилан харах] `POST …/{id}:preview`; F9 `POST …/{id}:post`. Алдаа: `bank.reconciliation_balance_mismatch` (UX-REC-02), `bank.reconciliation_unmatched_lines` (тулгагдаагүй мөртэй батлахыг зөвшөөрөхгүй — BC R-BANK-CASH-15/18: мөр бүр тайлбарлагдсан байна; мөрийг тулгах эсвэл "Данс руу бичих"-ээр зөрүүг тодорхой бичилт болгоно), `bank.match_amount_mismatch` (UX-REC-05). |

### 16.5 Ерөнхий журнал (S-GL-03)

```text
┌ Санхүү › Ерөнхий журнал ─────────────────────────────────────────────────────────────────────────────────────┐
│ Багц: [GENERAL · Үндсэн ▾]  [Батлах F9] [Урьдчилан харах] [Стандарт журналаас] [Excel-ээс буулгах] [⋯]       │
├───────────┬────────┬──────────┬──────────┬────────┬───────────────────────┬─────────────┬─────────────┬────────┤
│Бүрт.огноо │Төрөл   │Баримт №  │Дансны төр│Данс    │Тайлбар                │ Дебит       │ Кредит      │Харьцсан│
├───────────┼────────┼──────────┼──────────┼────────┼───────────────────────┼─────────────┼─────────────┼────────┤
│2026.10.06 │        │J-000045  │Данс      │7201    │9 сарын цалин          │4,500,000.00 │             │        │
│2026.10.06 │        │J-000045  │Данс      │2200    │Цалингийн өглөг        │             │3,960,000.00 │        │
│2026.10.06 │        │J-000045  │Данс      │2340    │ХХОАТ суутгал          │             │  315,000.00 │        │
│2026.10.06 │        │J-000045  │Данс      │2350    │НДШ суутгал            │             │  225,000.00 │        │
│2026.10.06 │Төлбөр  │J-000046  │Нийлүүлэгч│V00007  │Урьдчилгаа төлбөр      │  200,000.00 │             │Банк 1110│
│           │        │          │          │        │                       │             │             │        │
├───────────┴────────┴──────────┴──────────┴────────┴───────────────────────┴─────────────┴─────────────┴────────┤
│ Данс: 7201 Цалингийн зардал · үлдэгдэл 40,500,000.00    Харьцсан: —                                            │
│ Баримтын тэнцэл (J-000045): 0.00 ✓    Багцын тэнцэл: 0.00 ✓    Мөр: 5                                          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Цалингийн жишээ нь зөвхөн UI-ийн жишээ (хувь хэмжээ нь хуулийн тооцоо биш). Батлахад J-000045 → `GJ-2026-00012`, J-000046 → `GJ-2026-00013` (`GJ` цуврал, D-C7).

| ID | Дүрэм |
|---|---|
| UX-JNL-01 | Багц сонгогч нь хэрэглэгчийн эрхтэй загвар/багцыг (`gl.journal_template`, `gl.journal_batch`) харуулна; сүүлд ашигласныг санана (`localStorage`). |
| UX-JNL-02 | **Дебит/Кредит** нь UI-ийн хоёр багана; серверт ганц тэмдэгтэй `amount` (D-C3, `journal_line` нь Debit/Credit баганагүй): Дебит x → `amount = +x`, Кредит x → `amount = −x`. Нэг мөрөнд хоёуланг оруулбал сүүлд оруулсан нь үлдэж, нөгөө нь цэвэрлэгдэнэ. Дебит баганад сөрөг тоо оруулбал Кредит рүү эерэгээр шилжинэ (BC). |
| UX-JNL-03 | "Баримт №" шинэ мөрөнд UX-GRID-08-аар: өмнөх баримт тэнцээгүй бол ижил, тэнцсэн бол `JNL_DRAFT` цувралын дараагийн дугаар. Гараар өөрчилж болно (ноорог дугаар). |
| UX-JNL-04 | Дансны төрөл: Данс / Харилцагч / Нийлүүлэгч / Мөнгөний данс (`GL_ACCOUNT`, `CUSTOMER`, `VENDOR`, `BANK_ACCOUNT`; R2: `FIXED_ASSET`). "Данс" lookup нь `direct_posting = true AND account_type = 'POSTING' AND NOT blocked` (хяналтын данс руу гар бичилт хориотой, FR-GL-003). |
| UX-JNL-05 | Нуусан багана ("Харагдах багана" цэс): НӨАТ-ын бүлэг (`gen_posting_type`, `vat_*`), Хэмжигдэхүүн 1/2, Тулгах баримт, Гадаад дугаар, Шалтгаан, Баримтын огноо, НӨАТ-ын огноо. Харилцагч/нийлүүлэгч мөрөнд "Тулгах баримт" автоматаар харагдана. |
| UX-JNL-06 | Доод самбар: фокустай мөрийн дансны нэр ба үлдэгдэл, харьцсан дансны нэр ба үлдэгдэл; "Баримтын тэнцэл" (фокустай мөрийн баримт + огноо), "Багцын тэнцэл". Тэнцээгүй бол ✕ улаан ба зөрүү. Тооцоог сервер (хадгалалтын хариу) өгнө. |
| UX-JNL-07 | W-01 (`normal_side`) нь нүдний ◐ дүрс ба tooltip; батлахыг зогсоохгүй. |
| UX-JNL-08 | F9 = багцын бүх мөрийг батлах (`POST …/journals/{id}:post`, `If-Match` = журналын ETag, body `{ expectedLineCount }` = дэлгэцэд харагдаж буй мөрийн тоо; зөрвөл `409 gl.journal_changed`, API-ACT-07). Баримт тус бүр тэнцсэн байх ёстой (`force_doc_balance`, D-C5). Алдаа §8.3; алдаатай мөр тодорно. Амжилттай бол багц хоосорно; toast "2 ваучер батлагдлаа: GJ-2026-00012, GJ-2026-00013" (хариуны `vouchers[]`-ийн ноорог ↔ хуулийн дугаар, холбоостой). |
| UX-JNL-09 | "Сонгосон мөрийг батлах" (Should): зөвхөн бүтэн тэнцсэн баримтын мөрүүдийг. |
| UX-JNL-10 | "Стандарт журналаас" → `gl.standard_journal` сонгож мөрүүдийг хуулна (FR-GL-016); "Стандарт болгож хадгалах" нь сонгосон мөрөөс. |
| UX-JNL-11 | Эхний үлдэгдлийн журнал (S-GL-05) ижил grid, загвар `OPENING` / багц `DEFAULT` (seed mn_40), source code `OPENING`, батлахад `OB-2026-#####` цуврал; огноо = go-live − 1 өдөр түгжигдсэн анхдагч; харилцагч/нийлүүлэгчийн мөрөнд баримтын дугаар ба төлөх огноо заавал (D-D7: баримт тус бүрээр; `party.vendor_ledger_entry`-ийн CHECK нь `OPENING` бичилтэд гадаад дугаарыг заавал болгохгүй). |
| UX-JNL-12 | "Гар журналд хавсралт заавал" (FR-PLT-011) асаалттай бол хавсралтгүй баримтын мөрөнд ⚠ ба батлах үед алдаа. |

### 16.6 Дансны төлөвлөгөө (S-GL-01)

```text
┌ Санхүү › Дансны төлөвлөгөө ───────────────────────────────────────────────────────────────────────────────────┐
│ [+ Шинэ данс Alt+N] [Засах] [Бичилт Ctrl+F7] [Маягт А-гийн шалгалт] [⋯ Догол тохируулах · Блоклох · Excel]   │
│ Хайх: [         ]  Шүүлтүүр: [Бичилт хийх данс ✕] [Блоклоогүй ✕]   Үлдэгдэл: [2026.10.06]                     │
├──────┬──────────────────────────────────────────┬──────────┬───────────┬────────┬──────┬────────┬──────────────┤
│ Дугаар│ Нэр                                      │ Төрөл    │ Ангилал   │ Шууд   │Блок  │Маягт А │ Үлдэгдэл     │
├──────┼──────────────────────────────────────────┼──────────┼───────────┼────────┼──────┼────────┼──────────────┤
│▾1000 │ ХӨРӨНГӨ                                  │ Эхлэл    │ Хөрөнгө   │        │      │        │              │
│ ▾1001│   Эргэлтийн хөрөнгө                      │ Эхлэл    │ Хөрөнгө   │        │      │        │              │
│  ▸1099│     Мөнгө, түүнтэй адилтгах хөрөнгө      │ Гарчиг   │ Хөрөнгө   │        │      │        │              │
│   1100│       Касс (төгрөг)                      │ Бичилт   │ Хөрөнгө   │ Үгүй   │      │ 1.1.1  │  2,140,500.00│
│   1110│       Харилцах данс (төгрөг)             │ Бичилт   │ Хөрөнгө   │ Үгүй   │      │ 1.1.1  │ 45,012,000.00│
│   1200│       Дансны авлага                      │ Бичилт   │ Хөрөнгө   │ Үгүй   │      │ 1.1.2  │ 12,540,000.00│
│   …                                                                                                          │
│ 1998 │   Эргэлтийн бус хөрөнгийн дүн            │ Төгсгөл  │           │        │      │        │ 18,300,000.00│
│ 1999 │ НИЙТ ХӨРӨНГӨ                             │ Төгсгөл  │           │        │      │        │ 96,700,500.00│
└──────┴──────────────────────────────────────────┴──────────┴───────────┴────────┴──────┴────────┴──────────────┘
```

| ID | Дүрэм |
|---|---|
| UX-COA-01 | Мод нь `indentation` (0–10)-аар догол; `HEADING`, `BEGIN_TOTAL`, `END_TOTAL`, `TOTAL` мөр тод. ▾/▸ нь `HEADING`/`BEGIN_TOTAL` дээр: дараагийн `indentation` их мөрүүдийг (END_TOTAL хүртэл) нууна/харуулна (AG Grid Tree Data-ийн орлуулалт, §6.1). Гараар: ← хураах, → дэлгэх (APG treegrid). |
| UX-COA-02 | Төрлийн шошго: `POSTING` "Бичилт", `HEADING` "Гарчиг", `BEGIN_TOTAL` "Эхлэл", `END_TOTAL` "Төгсгөл", `TOTAL` "Нийлбэр" (D-D1). |
| UX-COA-03 | Үлдэгдэл = сонгосон огноо хүртэлх Σ `gl_entry.amount` (сервер, `rpt.v_trial_balance_base`); нийлбэр мөрийнх нь `totaling`-оор. Дебит үлдэгдэл эерэг, кредит сөрөг (`-`) — баганын tooltip-д тайлбар. |
| UX-COA-04 | Жагсаалтад шууд засах талбар: `name`, `blocked`, `direct_posting` (`T_SETUP` M). Бүтцийн талбар (`account_type`, `totaling`, `indentation`, `account_category`) зөвхөн картад (S-GL-02). |
| UX-COA-05 | "Догол тохируулах" (BC "Indent Chart of Accounts"): сервер `indentation` ба `BEGIN/END_TOTAL`-ийн `totaling`-ийг дахин тооцно; dialog-оор өөрчлөгдөх мөрийн тоог харуулж баталгаажуулна. |
| UX-COA-06 | Устгах: бичилтгүй данс л (`hasEntries = false`); эс бөгөөс товч идэвхгүй, tooltip "Бичилттэй дансыг устгахгүй. Блоклоно уу." (FR-GL-004, R-PLATFORM-SECURITY-API-24). |
| UX-COA-07 | "Маягт А-гийн шалгалт" (FR-GL-002): сервер `statement_line_id`-гүй эсвэл ангилалтай зөрсөн бичилтийн дансыг жагсаана → алдааны самбар (§8.3), мөр бүр картын холбоостой. |
| UX-COA-08 | Шинэ данс: дугаар (`code20`, давхардахгүй), нэр, төрөл, ангилал → `income_balance` автоматаар (schema CHECK), Маягт А-гийн мөр. Хадгалсны дараа мод дугаараар эрэмбэлэгдэнэ. |
| UX-COA-09 | `name_en` нь UI хэл `en` үед харагдана (UX-I18N-13). |

### 16.7 Харилцагчийн карт (S-PTY-02)

```text
┌ Борлуулалт › Харилцагч › C00012 Номин ХХК ────────────────────────────────────────────────────────────────────┐
│ Номин ХХК (C00012) [● Идэвхтэй]                                                            Хадгалсан 10:40     │
│ [+ Нэхэмжлэх] [+ Кредит нот] [Бичилт Ctrl+F7] [Дансны хуулга] [Статистик F7] [⋯ Блоклох · Өөрчлөлтийн түүх]   │
├──────────────────────────────────────────────────────────────────────────────────────┬────────────────────────┤
│ ▾ Ерөнхий                                                                              │ Статистик              │
│   Дугаар [C00012]  Нэр* [Номин ХХК                         ]                           │ Үлдэгдэл  1,200,000.00 │
│   Төрөл* (•) Хуулийн этгээд  ( ) Иргэн  ( ) Гадаад                                     │ Хэтэрсэн    850,000.00⚠│
│   ТТД [14012345678] [ТТД-ээр татах]  ✓ 2026.10.01 · НӨАТ төлөгч ✓ · НХАТ ✗             │ Энэ жил   14.2 сая ₮   │
│   Улсын бүртгэлийн дугаар [2345678]                                                    │ Сүүлд төлсөн 2026.09.28│
│ ▾ Холбоо барих                                                                         ├────────────────────────┤
│   Хаяг  [Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо …          ]  Хот [Улаанбаатар]       │ ТТД-ийн шалгалт        │
│   Улс [MN ▾]   Утас [9911 2233]   Имэйл [info@nomin.mn          ]                       │ eBarimt: олдсон        │
│ ▾ Нэхэмжлэх ба тооцоо                                                                  │ Нэр: НОМИН ХХК         │
│   Харилцагчийн бүлэг* [DOMESTIC ▾]  Бизнесийн бүлэг* [DOMESTIC ▾]  НӨАТ-ын бүлэг* [DOMESTIC ▾]│ 2026.10.01 10:15  │
│   Төлбөрийн нөхцөл [30 хоног ▾]  Төлбөрийн хэлбэр [Шилжүүлэг ▾]  ☐ Үнэ НӨАТ-тэй         ├────────────────────────┤
│   Зээлийн хязгаар [5,000,000.00]  Тулгалтын арга [Гараар ▾]  Блоклох [Үгүй ▾]           │ Хавсралт (1)           │
│ ▾ eBarimt                                                                              │                        │
│   Анхдагч төрөл [Автомат ▾]   Иргэний eBarimt дугаар [—]                               │                        │
└──────────────────────────────────────────────────────────────────────────────────────┴────────────────────────┘
```

| ID | Дүрэм |
|---|---|
| UX-CUST-01 | Шинэ харилцагч: `party.customer_template` > 1 бол загвар сонгох dialog (BC); posting group, нөхцөл загвараас. Дугаар `CUST` цувралаас (гараар оруулж болно, `manual_nos`); үүсгэсний дараа засахгүй. |
| UX-CUST-02 | Төрөл `LEGAL`: ТТД 7 оронтой оруулбал улсын бүртгэлийн дугаар гэж үзэж `getTinInfo?regNo=`-оор 11 оронтой ТТД-г санал болгоно (12 SET-11). Иргэний регистрээр ТТД хайхгүй. |
| UX-CUST-03 | Төрөл `INDIVIDUAL`: ТТД ба улсын бүртгэлийн талбар нуугдаж (13 CR-06: `INDIVIDUAL`-д `tin`, `registration_no` NULL), "Регистр (нууцлалтай)" ба "Хувь хүний ТТД" write-only талбар (`personal_id_*`, `personal_tin_*`, SEC-PII-09) ба "Иргэний eBarimt дугаар" харагдана. Хадгалсны дараа зөвхөн hint (`personal_id_hint` = `УБ******33`); [Харах] нь `X platform.pii.unmask` + step-up. |
| UX-CUST-04 | [ТТД-ээр татах] (`X party.customer.lookup_tin`): нэр хоосон бол бөглөнө, ялгаатай бол "Нэрийг «НОМИН ХХК» болгох уу?"; `vat_registered`, `city_tax_payer`-ийг шинэчилнэ; шалгасан огноо FactBox-д. Сервис ажиллахгүй бол W-06, хадгалалт зогсохгүй (12 SET-12). |
| UX-CUST-05 | Posting group солиход: "Зөвхөн шинэ баримтад нөлөөлнө. Батлагдсан баримт өөрчлөгдөхгүй." |
| UX-CUST-06 | Блоклох: `NONE` "Үгүй", `INVOICE` "Нэхэмжлэх бичихгүй", `ALL` "Бүх гүйлгээ" — сонголт бүрийн тайлбартай. |
| UX-CUST-07 | Утас, имэйл, хаяг: `M party.customer` эрхгүйд маскаар (13 §10.4 `EDITOR_ONLY`). |
| UX-CUST-08 | Устгах: бичилтгүй бол л; эс бөгөөс "Блоклох"-ыг санал болгоно (R-PLATFORM-SECURITY-API-24). |
| UX-CUST-09 | "Өөрчлөлтийн түүх" нь S-PLT-14-ийг энэ мөрөөр шүүж нээнэ (`R audit.row_change` эрхтэй бол). |
| UX-CUST-10 | Статистик FactBox нь серверийн `party.v_customer_balance` ба нээлттэй entry-ээс; "Хэтэрсэн" дарахад S-PTY-05 шүүлттэй. |

### 16.8 Гүйлгээ баланс (S-RPT-02)

```text
┌ Тайлан › Гүйлгээ баланс ─────────────────────────────────────────────────────────────────────────────────────┐
│ Хугацаа [2026.10.01] – [2026.10.31]  ☐ Хаалтын бичилт оруулах  ☐ Тэг данс харуулах  ☑ Гарчиг, нийлбэр       │
│ Түвшин [Бүгд ▾]   [Харах]   [Excel]  [PDF]                                     Нэгж: төгрөг · 14:05-ийн байдлаар│
├──────┬──────────────────────────────┬───────────────────────────┬───────────────────────────┬─────────────────────────┤
│      │                              │ Эхний үлдэгдэл            │ Гүйлгээ                   │ Эцсийн үлдэгдэл         │
│ Данс │ Нэр                          │ Дебит        │ Кредит     │ Дебит        │ Кредит     │ Дебит       │ Кредит    │
├──────┼──────────────────────────────┼──────────────┼────────────┼──────────────┼────────────┼─────────────┼───────────┤
│ 1100 │ Касс (төгрөг)                │  1,850,000.00│            │  3,200,500.00│2,910,000.00│ 2,140,500.00│           │
│ 1110 │ Харилцах данс (төгрөг)       │ 41,500,000.00│            │ 12,812,000.00│9,300,000.00│45,012,000.00│           │
│ 1200 │ Дансны авлага                │ 11,000,000.00│            │  9,540,000.00│8,000,000.00│12,540,000.00│           │
│ 2100 │ Дансны өглөг                 │              │8,300,000.00│  6,200,000.00│7,700,000.00│             │9,800,000.00│
│ 5110 │ Ажил, үйлчилгээний орлого    │              │61,000,000.00│             │8,672,727.27│             │69,672,727.27│
│  …   │                              │              │            │              │            │             │           │
├──────┴──────────────────────────────┼──────────────┼────────────┼──────────────┼────────────┼─────────────┼───────────┤
│ НИЙТ                               │125,400,000.00│125,400,000.00│38,250,600.00│38,250,600.00│131,872,300.00│131,872,300.00│
│                                    │      ✓ тэнцсэн            │      ✓ тэнцсэн            │      ✓ тэнцсэн          │
└────────────────────────────────────┴───────────────────────────┴───────────────────────────┴─────────────────────────┘
```

Эх: `rpt.fn_trial_balance(p_from, p_to, p_include_closing)` (920_views.sql). Орлого/зардлын дансны эхний үлдэгдэл нь санхүүгийн жилийн эхнээс (функцийн дүрэм).

| ID | Дүрэм |
|---|---|
| UX-TB-01 | Шүүлтүүр: хугацаа (анхдагч одоогийн сар), "Хаалтын бичилт оруулах" (`includeClosingEntries`, анхдагч үгүй, D-D4), "Тэг данс харуулах" (`includeZero`, анхдагч үгүй), "Гарчиг, нийлбэр" (анхдагч тийм; API-ийн `rows` нь зөвхөн бичилтийн данс тул гарчиг/нийлбэрийн мөрийг A-14-ийн дагуу сервер нэмнэ; A-14 хэрэгжихээс өмнө энэ сонголт харагдахгүй), Түвшин (`indentation` ≤ N, A-14), Хэмжигдэхүүн 1/2 (`dimension1ValueId`, `dimension2ValueId`; R2-т UI, FR-RPT-018). API: `GET /reports/trial-balance?dateFrom=&dateTo=&includeClosingEntries=&includeZero=` (`TrialBalance`). Шүүлтүүр URL-д (UX-NAV-09). |
| UX-TB-02 | Багана нь API-ийн талбар: `openingDebit`/`openingCredit`, `periodDebit`/`periodCredit`, `closingDebit`/`closingCredit` — **клиент тэмдгээр хуваахгүй** (сервер `rpt.fn_trial_balance`-аас). Тэг утга хоосон (§7.1). `incomeBalance = INCOME_STATEMENT` дансны эхний үлдэгдэл жилийн эхнээс (тайлбар tooltip-д). |
| UX-TB-03 | НИЙТ мөр: `totals.*` (серверийн). `totals.balanced = true` → "✓ тэнцсэн" хос бүрийн доор. `false` бол (D-C5-ийн дагуу байж болохгүй) улаан тууз "Тэнцэхгүй — системийн алдаа. Support-д хандана уу (код: {{traceId}})". |
| UX-TB-04 | Drill-down: дүнгийн нүд дээр Enter/товшилт → S-GL-06 (данс + огнооны муж: эхний үлдэгдэл бол `< from`, гүйлгээ бол `from..to`); мөр дээр Ctrl+Enter → S-RPT-03 (ерөнхий дэвтэр). |
| UX-TB-05 | Excel/PDF: `POST /reports/trial-balance:export` (`ReportExportRequest { format, language, parameters }` — `parameters` = GET-ийн query-тэй ижил; 202 job, UX-PAGE-18); файл "Гүйлгээ баланс 2026-10.xlsx", толгойд компани, хугацаа, шүүлтүүр, хэвлэсэн огноо/хэрэглэгч. |
| UX-TB-06 | Харуулах бутархай `report_decimal_places` (UX-FMT-01). |
| UX-TB-07 | p95 ≤ 2 s (02 §13). 5 000-аас олон мөр бол сервер `422 api.result_too_large` → экспортын санал (UX-PAGE-18); 10 s-ээс удаан синхрон тайлан байхгүй (14 API-JOB-01). |
| UX-TB-08 | Толгой мөр ба эхний 2 багана наалттай; read-only grid-ийн гарын навигаци; хэвтээ гүйлгээ (UX-RESP-07). |

### 16.9 НӨАТ-ын тайлан ТТ-03а (S-TAX-03)

```text
┌ Татвар › НӨАТ-ын тайлан › 2026 оны 9-р сар ──────────────────────────────────────────────────────────────────┐
│ ТТ-03а · 2026.09.01–2026.09.30 · [Нээлттэй]   Илгээх хугацаа: 2026.10.10 (3 хоног үлдсэн)                     │
│ ① Тооцоолох ✓ ── ② Хянах ● ── ③ НӨАТ хаах ○ ── ④ Илгээсэн ○                                                   │
│ [Дахин тооцоолох] [Excel] [ТТ-03а файл] [НӨАТ хаах…] [Илгээсэн гэж тэмдэглэх…] [⋯ НӨАТ-ын бичилт]            │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ Анхааруулга (2)                                                                                           │
│   • Баталгаажаагүй орцын НӨАТ: 5 баримт, 312,000.00 ₮ — тайланд орохгүй (D-E4)        [Баталгаажуулах ›]    │
│   • eBarimt илгээгдээгүй борлуулалт: 1 баримт (SI-2026-00117, Тодорхойгүй)            [eBarimt хяналт ›]    │
├──────┬───────────────────────────────────────────────────────────┬─────────────────────┬─────────────────────┤
│ Мөр  │ Үзүүлэлт                                                  │ Суурь (₮)           │ НӨАТ (₮)            │
├──────┼───────────────────────────────────────────────────────────┼─────────────────────┼─────────────────────┤
│ 1    │ Борлуулалт, НӨАТ 10%                                      │      42,700,000.00  │       4,270,000.00  │
│ 2    │ Экспорт, 0%                                               │       3,000,000.00  │                     │
│ 3    │ Чөлөөлөгдөх борлуулалт                                    │         500,000.00  │                     │
│ 10   │ Орцын НӨАТ (баталгаажсан ДДТД)                            │      15,200,000.00  │       1,520,000.00  │
│ 20   │ Төлөх НӨАТ (1 − 10)                                       │                     │       2,750,000.00  │
└──────┴───────────────────────────────────────────────────────────┴─────────────────────┴─────────────────────┘
Тооцоолсон: 2026.10.07 09:12 · Үүнээс хойш энэ үед 0 бичилт нэмэгдсэн
```

Мөрийн дугаар ба нэр нь жишээ; эцсийнхийг `tax.vat_statement_line` (`row_no`, `box_no`)-ийн seed ба НӨАТ-ын spec тогтооно (D-E8).

| ID | Дүрэм |
|---|---|
| UX-VAT-01 | Алхмын заагч нь `tax.vat_return_period.status`-аас: `OPEN` → ①/② (тооцоолсон эсэхээс), `CLOSED` (хаалтын гүйлгээ `settlement_transaction_no`-тэй) → ③ ✓, `SUBMITTED` → ④ ✓. |
| UX-VAT-02 | "Тооцоолох" нь `tax.vat_statement_line`-ийг `vat_entry`-ээр (BC VAT Statement preview) сервер тооцно; хадгалахгүй. Мөрийн дүн дээр Enter → S-TAX-04 тухайн мөрийн шүүлтүүрээр (сервер мөр бүрийн шүүлтүүрийг буцаана). |
| UX-VAT-03 | Тооцоолсны дараа тухайн үед шинэ VAT entry нэмэгдвэл "Үүнээс хойш N бичилт нэмэгдсэн [Дахин тооцоолох]" (серверийн `lastVatEntryNo`-оор харьцуулна); экспорт ба хаалтын өмнө дахин тооцоолохыг шаардана. |
| UX-VAT-04 | Анхааруулга: баталгаажаагүй орцын НӨАТ (CUE-14), тухайн үеийн eBarimt `PENDING`/`ERROR`/`UNKNOWN`/тохируулаагүй борлуулалт (FR-TAX-016), `vat_registered` өөрчлөгдсөн огноо үед орсон эсэх. Анхааруулга нь хаахыг зогсоохгүй. |
| UX-VAT-05 | "НӨАТ хаах…" (`X tax.vat.settle`): dialog — бүртгэлийн огноо (анхдагч үеийн сүүлийн өдөр), хаалтын ваучерын preview (§5.5), баталгаажуулалт. Үр дүн: гүйлгээ (`VATSTMT`), үе `CLOSED`. |
| UX-VAT-06 | "Илгээсэн гэж тэмдэглэх…" (`X tax.vat_return.submit`, MFA + step-up): зөвхөн `CLOSED` үед; e-tax-ийн баримтын дугаар (`submission_reference`) заавал; "ИЛГЭЭСЭН" гэж бичиж баталгаажуулна (UX-PAGE-23); буцаагдахгүй гэдгийг тайлбарлана. Үр дүн: `SUBMITTED`, тууз "Илгээсэн: 2026.10.08 · №… · Сарнай". Холбогдох нягтлан бодох үе түгжигдэх эсэхийг сервер шийднэ (03 §6.2) — dialog нь серверийн `effects` жагсаалтыг харуулна. |
| UX-VAT-07 | `SUBMITTED` үед зөвхөн экспорт ба drill-down; бусад үйлдэл байхгүй. |
| UX-VAT-08 | Экспорт: Excel ба ТТ-03а-гийн файл (D-E8: v1-д файл ба Excel; формат НӨАТ-ын spec-ээр) — `POST /vat-return-periods/{id}:export` → 202 job (UX-PAGE-18). |
| UX-VAT-10 | **API (14 §15.5):** жагсаалт `GET /vat-return-periods`; тооцоолох `GET /reports/vat-return?periodId=` (safe, хадгалахгүй); хаах `POST /vat-return-periods/{id}:close` (`Idempotency-Key`; `{ postingDate }`); илгээсэн `POST …/{id}:submit` (`{ submissionReference }`, MFA + step-up, UX-PAGE-24). Эрхийн нэр 14 (`tax.vat_period.close/submit`) ба seed (`tax.vat.settle`, `tax.vat_return.submit`) зөрүүтэй — UI `me/permissions`-ээс (OQ-UI-23). |
| UX-VAT-09 | `vat_registered = false` компанид `NOT_CONFIGURED` хоосон төлөв (§9.2). |

### 16.10 Компани тохируулах wizard (S-PLT-06)

```text
┌ Компани тохируулах · Болд Трейд ХХК ─────────────────────────────────────────────────────── [Хадгалаад гарах] ┐
│ ✓1 Профайл ─ ●2 Татвар ─ ○3 Эхлэх огноо ─ ○4 Дансны төлөвлөгөө ─ ○5 Цуврал ─ ○6 Касс, банк ─ ○7 Хэрэглэгч ─  │
│ ○8 Эхний үлдэгдэл ─ ○9 Хураангуй                                                                              │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Татварын профайл                                                                                         │
│                                                                                                            │
│   НӨАТ төлөгч эсэх*         (•) Тийм   ( ) Үгүй                                                             │
│   НӨАТ төлөгч болсон огноо  [2019.03.01]                                                                    │
│   ⓘ eBarimt-аас: "НӨАТ төлөгч: Тийм" (2026.10.06 шалгасан) — таны сонголттой таарч байна ✓                 │
│   НХАТ төлөгч эсэх          ( ) Тийм   (•) Үгүй                                                             │
│   Тайлагналын суурь*        [ЖДҮ-ийн СТОУС (IFRS for SMEs) ▾]                                                │
│   Тайлангийн бутархай орон  [2 ▾]                                                                           │
│   ⓘ 2027-07-01-нээс НӨАТ-ын бүртгэлийн босго 400 сая ₮ болно (D-K5). Сонголтыг дараа нь өөрчилж болно.      │
│                                                                                                            │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                          [‹ Буцах]    [Дараах › (Enter)]    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Алхам 9 (хураангуй):

```text
│ 9. Хураангуй                                                                                                │
│   Компани: Болд Трейд ХХК · ТТД 15012345678 · ХХК · НӨАТ төлөгч (2019.03.01-нээс)          [Засах 1 ›] [Засах 2 ›]│
│   Ашиглалтад орох: 2026.10.01 · Санхүүгийн жил: 2026, 2027 · Posting цонх: 2026.10.01–                [Засах 3 ›]│
│   Дансны төлөвлөгөө: MN стандарт (4 оронтой) · Цуврал: SI-2026-, KO-2026-, KZ-2026- …                  [Засах 4–5 ›]│
│   Касс: CASH01 Үндсэн касс · Банк: Хаан-MNT (preset: Хаан банк)                                       [Засах 6 ›]│
│   Урих: sarnai@… (Нягтлан бодогч) · Эхний үлдэгдэл: Excel-ээр дараа                                  [Засах 7–8 ›]│
│                                                                                       [‹ Буцах] [Компани үүсгэх]│
│   ⟳ Үүсгэж байна: ✓ Дансны төлөвлөгөө  ✓ Татварын тохиргоо  ⟳ Дугаарын цуврал  ○ Санхүүгийн жил  ○ Журнал     │
```

| ID | Дүрэм |
|---|---|
| UX-WIZ-01 | §10.2–10.3-ын дүрэм хэрэгжинэ. Алхам бүрийн гарчиг `h2`, алхмын заагч `<ol>`, одоогийнх `aria-current="step"`. |
| UX-WIZ-02 | Алхам 1-ийн [ТТД-ээр татах]-ийн үр дүн алхам 2-т санал болгон гарна (UX-A11Y-22: дахин асуухгүй); хэрэглэгчийн сонголт eBarimt-ийнхтэй зөрвөл ⚠ "eBarimt-аас: НӨАТ төлөгч: Үгүй — зөрүүтэй. eBarimt идэвхжүүлэх боломжгүй болно (12 SET-02)". |
| UX-WIZ-03 | Алхам 3: go-live ба санхүүгийн жил: go-live-ийн жил ба дараагийн жил **үргэлж** (FR-PLT-003 AC1: "одоогийн ба дараагийн санхүүгийн жил (12 сартай) үүснэ" — сараас үл хамаарна; хэрэглэгч хасах боломжгүй, зөвхөн харуулна). `platform.fn_provision_company_mn(tenant, company, p_fiscal_year)` нь эхний жил **ба дараагийн жилийг** хоёуланг нь үүсгэнэ (`gl.fn_mn_ensure_fiscal_year(v_fy)` + `gl.fn_mn_ensure_fiscal_year(v_fy + 1)`, [mn_90_provision.sql](./db/seed/mn_90_provision.sql); 2026-10-08-нд PostgreSQL 16.15 дээр шалгасан: 2026 ба 2027, 24 сар) тул job нэмэлт жил үүсгэх шаардлагагүй (A-08; REVIEW-readiness.md). `vat_registered`, `tin`, `district_code`-ийг (алхам 1–2) provisioning-ээс **өмнө** хадгална — НӨАТ-ын матриц ба eBarimt-ийн тохиргоо үүгээр seed-лэгдэнэ (mn_90_provision.sql). |
| UX-WIZ-04 | Алхам 5: угтварын жишээ шууд шинэчлэгдэнэ ("SI-2026-00001"); хуулийн цуврал "Завсаргүй, гараар дугаарлахгүй" тэмдэгтэй. |
| UX-WIZ-05 | Алхам 9-ийн "Компани үүсгэх" нь UX-ONB-04-ийн async урсгал. Progress-ийн алхмууд серверийн job-ын `result.steps`-ээс. Алдаа гарвал "Юу ч үүсээгүй. Алдаа: … [Дахин оролдох]" (FR-PLT-003 AC2). |
| UX-WIZ-06 | Wizard-аас гарахад (Esc, "Хадгалаад гарах") алхмын өгөгдөл серверт хадгалагдсан (SCR-UI-06) тул анхааруулахгүй; хадгалаагүй алхмын өөрчлөлт байвал UX-SAVE-06. |

---

## 17. Хүлээн авах тест

Хэрэгжүүлэлт: Vitest (formatter, parser, алгоритм — AT-UI-28..34), Playwright (E2E, монгол UI-аар, Chromium/Firefox/WebKit — NFR-080), `@axe-core/playwright` (хүртээмж). "D" = бизнесийн өнөөдөр (Asia/Ulaanbaatar).

### 17.1 Навигаци ба нүүр

- **AT-UI-01 (UX-NAV-05, FR-PLT-005 AC1).** **Өгөгдсөн нь** X компанид зөвхөн `SALES_CLERK` role-той хэрэглэгч; **Хэрэв** апп нээвэл; **Тэгэхэд** цэсэнд "Ерөнхий журнал", "Хэрэглэгч ба эрх" харагдахгүй. **Мөн** `/c/X/gl/journal` руу шууд орвол `NO_PERMISSION` хоосон төлөв. **Мөн** `POST …/journals/{id}:post` 403 `platform.permission_denied` буцаана.
- **AT-UI-02 (UX-NAV-02).** **Өгөгдсөн нь** хэрэглэгч A компанийн `/c/A/sales/invoices?status=OPEN`-д; **Хэрэв** Ctrl+O-оор B компани сонговол; **Тэгэхэд** `/c/B/sales/invoices?status=OPEN` нээгдэж, A-ийн өгөгдөл кэшээс харагдахгүй.
- **AT-UI-03 (UX-NAV-03).** **Өгөгдсөн нь** B2C хэвлэх цонх нээлттэй; **Хэрэв** тенант солих оролдлого хийвэл; **Тэгэхэд** "QR-ийг дахин хэвлэх боломжгүй" анхааруулга гарна. **Мөн** солигдсоны дараа хуудас бүрэн дахин ачаалагдаж, `PrintPayload` санах ойд үлдэхгүй.
- **AT-UI-04 (§3.1).** **Өгөгдсөн нь** `ACCOUNTANT` ба `VIEWER` хоёр role-той хэрэглэгч; **Тэгэхэд** `ACCOUNTANT_HOME` нээгдэнэ. Custom role нь зөвхөн `X sales.invoice.post`-той бол `SALES_HOME`.
- **AT-UI-05 (CUE-02).** **Өгөгдсөн нь** D = 2026-10-06; нээлттэй нэхэмжлэх: A (төлөх 2026-10-05, үлдэгдэл 850,000.00), B (төлөх 2026-10-06, 300,000.00), C (төлөх 2026-10-01, бүрэн төлөгдсөн); **Тэгэхэд** CUE-02 = 850,000.00, 1 харилцагч, төлөв `UNFAVORABLE` (B нь `due_date < D`-д орохгүй). **Мөн** CUE-01 = 1,150,000.00, 2 нэхэмжлэх.
- **AT-UI-06 (FR-PLT-015 AC1, §3.5).** **Өгөгдсөн нь** `UNKNOWN` төлөвтэй 2 eBarimt баримт; **Хэрэв** Owner нүүр нээвэл; **Тэгэхэд** мэдээний мөрөнд "eBarimt: 2 баримт тодорхойгүй — шийдвэрлэх" холбоос, дарахад S-EBR-02 `?status=UNKNOWN,ERROR` нээгдэнэ.
- **AT-UI-07 (CUE-08).** **Өгөгдсөн нь** `ebarimt.left_lotteries_warning` = 100; **Тэгэхэд** `left_lotteries` 4,820 → `FAVORABLE`; 150 → `AMBIGUOUS`; 99 → `UNFAVORABLE`; NULL → `NONE` "Мэдээлэл алга". **Мөн** сүүлийн `sendData` 49 цагийн өмнө бол утгаас үл хамааран `UNFAVORABLE`.
- **AT-UI-08 (CUE-04).** **Өгөгдсөн нь** 9-р сарын VAT үе `OPEN`, `due_date` 2026-10-10, D = 2026-10-07; VAT entry: SALE Σ `amount` = −4,270,000.00, PURCHASE баталгаажсан Σ = +1,520,000.00, PURCHASE баталгаажаагүй Σ = +312,000.00; **Тэгэхэд** CUE-04 = 2,750,000.00, "9-р сар · илгээх хүртэл 3 хоног", төлөв `UNFAVORABLE`. **Мөн** CUE-14 = 5 баримт, 312,000.00.
- **AT-UI-09 (UX-HOME-06).** **Өгөгдсөн нь** CUE-10-ийн query 2 s-ээс удаан; **Тэгэхэд** CUE-10 tile "Ачаалж чадсангүй [Дахин оролдох]", бусад cue хэвийн утгатай.

### 17.2 Хадгалах ба батлах

- **AT-UI-10 (UX-SAVE-01).** **Өгөгдсөн нь** ноорог нэхэмжлэх нээлттэй; **Хэрэв** 800 ms дотор 3 толгойн талбар өөрчилбөл; **Тэгэхэд** яг нэг `PATCH` (`If-Match`, `Idempotency-Key`, 3 талбар) явна. **Мөн** заагч "Хадгалсан HH:mm".
- **AT-UI-11 (UX-SAVE-04, FR-SAL-001 AC1).** **Өгөгдсөн нь** хоёр хэрэглэгч нэг ноорог нээсэн, хоёр дахь нь хадгалсан; **Хэрэв** эхний хэрэглэгч өөрчлөлт хийвэл; **Тэгэхэд** 412 → зөрчлийн dialog; "Миний өөрчлөлтийг хэрэглэх" нь шинэ ETag-аар амжилттай хадгална.
- **AT-UI-12 (UX-SAVE-05).** **Өгөгдсөн нь** шинэ нэхэмжлэх (харилцагч сонгоогүй); **Хэрэв** огноо, тайлбар бичвэл; **Тэгэхэд** сүлжээний хүсэлт явахгүй. **Хэрэв** харилцагч сонгоод сүлжээ нэг удаа тасарвал; **Тэгэхэд** давтан `POST` ижил `Idempotency-Key`-тэй, зөвхөн нэг ноорог үүснэ.
- **AT-UI-13 (UX-POST-01, FR-SAL-005 AC2).** **Өгөгдсөн нь** сервер батлалтыг commit хийсний дараа хариу тасарсан; **Хэрэв** клиент ижил key-ээр давтвал; **Тэгэхэд** `Idempotent-Replayed: true` хариу, UI `SI-2026-00042` руу шилжинэ. **Мөн** батлагдсан нэхэмжлэх ганц.
- **AT-UI-14 (UX-POST-04, NFR-121).** **Өгөгдсөн нь** `direct_posting = false` данстай мөр ба хаагдсан үеийн огноо; **Хэрэв** F9 → Тийм; **Тэгэхэд** алдааны самбар 2 мөртэй, мөр бүр [Засах] холбоостой. **Мөн** фокус самбарын гарчиг дээр, `aria-live="assertive"` "Батлах боломжгүй. 2 алдаа олдлоо."
- **AT-UI-15 (§5.4).** **Өгөгдсөн нь** эхний оролдлого 503 `Retry-After: 2`; **Тэгэхэд** клиент 2 s хүлээгээд ижил key-ээр давтаж, хоёр дахь нь 200 бол амжилттай гэж харуулна (хэрэглэгч дахин дарахгүй).
- **AT-UI-16 (UX-PAGE-24).** **Өгөгдсөн нь** `tax.vat_return.submit` хүсэлт 403 `platform.reauth_required`; **Хэрэв** хэрэглэгч TOTP оруулбал; **Тэгэхэд** `POST /api/v1/me:reauth`-ийн дараа анхны хүсэлт **ижил** `Idempotency-Key`-ээр дахин явна.
- **AT-UI-17 (UX-EBR-02..05, D-J3).** **Өгөгдсөн нь** B2C нэхэмжлэх интерактив батлагдсан, хариунд `print` бий; **Тэгэхэд** хэвлэх цонх QR ба сугалаатай нээгдэнэ. **Хэрэв** хэвлэлгүй хаах гэвэл; **Тэгэхэд** анхааруулга. **Мөн** хаасны дараа `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, TanStack Query cache, URL, `history.state`-д `qrData`/`lottery`-ийн утга олдохгүй (Playwright скан).
- **AT-UI-18 (DSP-33).** **Өгөгдсөн нь** ижил key-ийн давтан хариу (`Idempotent-Replayed`), `print = null`; **Тэгэхэд** toast `ui.print_payload_unavailable`, хэвлэх цонх нээгдэхгүй.
- **AT-UI-19 (UX-EBR-01, 12 §11.2).** **Өгөгдсөн нь** `UNKNOWN` eBarimt-тэй батлагдсан нэхэмжлэх; **Тэгэхэд** нэхэмжлэхийн хуудсан дээр "Дахин илгээх" товч байхгүй. **Мөн** S-EBR-05-д `last_attempt_at`-аас 10 мин өнгөрөөгүй бол шийдвэрийн товч идэвхгүй, тоолууртай; "Бүртгэгдээгүй" нь 30 мин ба `sendData`-ийн нөхцөл биелэхгүй бол 409 `ebarimt.resolution_too_early`-ийн мессежийг dialog дотор харуулна.
- **AT-UI-20 (UX-POST-08..10).** **Өгөгдсөн нь** §16.2-ын ноорог; **Хэрэв** Ctrl+Alt+F9; **Тэгэхэд** "Ерөнхий дэвтэр (4)" tab: 1200 Дт 55,990.01; 5110 Кт 900.01; 8100 Кт 50,000.00; 2300 Кт 5,090.00 — Σ Дт = Σ Кт = 55,990.01 ✓; баримтын дугаар "***", бичилтийн дугаар 1..n.
- **AT-UI-21 (§5.9, FR-SAL-008 AC2).** **Өгөгдсөн нь** хэсэгчлэн төлөгдсөн нэхэмжлэх; **Тэгэхэд** [Цуцлах] идэвхгүй, tooltip "Хэсэгчлэн төлөгдсөн. Эхлээд тулгалтыг цуцлана уу."

### 17.3 Grid ба гар

- **AT-UI-22 (NFR-071).** **Өгөгдсөн нь** зөвхөн гар; **Хэрэв** Alt+N → харилцагч "C00012" Enter → Tab… мөрөнд "SRV-001" Enter, "3" Enter, Enter → F9 → Enter; **Тэгэхэд** нэхэмжлэх батлагдана (хулгана огт хэрэглэхгүй).
- **AT-UI-23 (§6.3).** **Өгөгдсөн нь** OS-ийн гарын байрлал монгол кирилл; **Хэрэв** Alt + физик `KeyN` (`event.key = 'т'`); **Тэгэхэд** шинэ бичлэг нээгдэнэ.
- **AT-UI-24 (F8).** **Өгөгдсөн нь** журналын 2-р мөрийн "Тайлбар" нүд; **Хэрэв** F8; **Тэгэхэд** 1-р мөрийн тайлбар хуулагдана.
- **AT-UI-25 (§6.5).** **Өгөгдсөн нь** журналын "Данс" нүд фокустай; **Хэрэв** 3 мөр TSV буулгавал (`7201\tЦалин\t4500000`, `2200\tӨглөг\t-3960000`, `2350\tНДШ\t12.345`); **Тэгэхэд** 3 мөр үүсч, 3-р мөрийн дүнгийн нүд `ui.amount_precision_exceeded` (бөөрөнхийлөхгүй). **Мөн** нэг хадгалах хүсэлт.
- **AT-UI-26 (UX-JNL-02).** **Хэрэв** журналын Дебит нүдэнд `-500` оруулбал; **Тэгэхэд** Дебит хоосон, Кредит 500.00, илгээсэн `amount = "-500"`.
- **AT-UI-27 (UX-JNL-06, D-C5).** **Өгөгдсөн нь** J-000045-ийн Σ = +100.00; **Тэгэхэд** "Баримтын тэнцэл (J-000045): 100.00 ✕". **Хэрэв** F9; **Тэгэхэд** сервер `422 gl.voucher_unbalanced`, самбарт "Ваучер J-000045 тэнцээгүй: зөрүү 100.00", J-000045-ийн мөрүүд тодорно.

### 17.4 Формат ба parse (Vitest)

- **AT-UI-28 (§7.2).** `formatMoney`: `"1234567.8"` → `1,234,567.80`; `"0"` → `0.00`; `"-1250"` → `-1,250.00`; `"-0.00"` → `0.00`; тайлан 0 орон: `"1234567.50"` → `1,234,568`, `"-1234567.50"` → `-1,234,568`; `formatUnitPrice("333.335000")` → `333.335`; `formatUnitPrice("1500")` → `1,500.00`; `formatQty("3.00000")` → `3`; `formatQty("2.50000")` → `2.5`.
- **AT-UI-29 (§7.3).** money: `"1,234,567.5"` → `1234567.5`; `"12,5"` → `12.5`; `"1 234 567,89"` → `1234567.89`; `"1,2345"` → `ui.amount_grouping_invalid`; `"10.555"` → `ui.amount_precision_exceeded`; `"(1,000.00)"` → `-1000.00` (сөрөг зөвшөөрсөн баганад), бусад баганад `ui.amount_negative_not_allowed`; `"1234567890123456"` → `ui.amount_too_large`; NumpadDecimal → `.`.
- **AT-UI-30 (§7.4).** today = 2026-10-06: `"20261006"`, `"2026.10.6"`, `"06.10.2026"`, `"1006"`, `"6"` → 2026-10-06; `"+30"` → 2026-11-05; `"2026.02.30"` → `ui.date_invalid`; `"1999.12.31"` → `ui.date_out_of_range`. **Мөн** компьютерийн цагийн бүс UTC, цаг 2026-10-06T17:30Z үед `"t"` → **2026-10-07** (UB = UTC+8).
- **AT-UI-31 (§7.6).** `"12534000.00"` → `12.5 сая ₮`; `"1250000000"` → `1.3 тэрбум ₮`; `"985400.40"` → `985,400 ₮`; `"-2450000"` → `-2.5 сая ₮`.
- **AT-UI-32 (UX-FMT-14).** `Skeleton("Өнөр ХХК") = Skeleton("Onor HHK") = "onorhhk"`; хайлт "onor" нь "Өнөр ХХК"-г олно.
- **AT-UI-33 (UX-FMT-13).** Клиентийн эрэмбэ: ["Өнөр", "Онон", "Үүрийн", "Улаан"] → ["Онон", "Өнөр", "Улаан", "Үүрийн"].
- **AT-UI-34 (UX-VAL-04).** `CodeInput`-д "cash-01" бичвэл "CASH-01"; "касс" (кирилл) → `ui.code_invalid`.

### 17.5 Дэлгэцүүд

- **AT-UI-35 (UX-CASH-05, FR-BNK-003 AC1).** **Өгөгдсөн нь** кассын үлдэгдэл 300,000.00; **Хэрэв** МХ-2-т 400,000.00 оруулбал; **Тэгэхэд** "Дараа −100,000.00" улаан, [Батлах] идэвхгүй. **Мөн** API-аар шууд батлахад сервер татгалзана.
- **AT-UI-36 (FR-BNK-003 AC2).** **Өгөгдсөн нь** МХ-2, "Бичиг баримт" хоосон; **Хэрэв** F9; **Тэгэхэд** клиентийн `ui.required` алдаа, хүсэлт явахгүй.
- **AT-UI-37 (UX-CASH-07).** **Өгөгдсөн нь** `SALES_CLERK`; **Тэгэхэд** "Кассын зарлага (МХ-2)" цэс байхгүй; МХ-1-ийн касс lookup зөвхөн `kind = 'CASH'`; "Данс" төрлийн харьцагч сонголт байхгүй.
- **AT-UI-38 (UX-REC-02, FR-BNK-013).** **Өгөгдсөн нь** өмнөх 10,000,000.00, мөрүүд Σ 500,000.00, эцсийн 10,499,000.00; **Тэгэхэд** "✕ Зөрүү 1,000.00", [Батлах ба тулгах] идэвхгүй. **Хэрэв** эцсийнхийг 10,500,000.00 болговол; **Тэгэхэд** ✓, батлах боломжтой; батласны дараа дансны сүүлийн хуулгын үлдэгдэл 10,500,000.00.
- **AT-UI-39 (UX-REC-05).** **Өгөгдсөн нь** 2 хуулгын мөр (+600,000, +500,000) ба нэг нэхэмжлэх (1,100,000.00, ижил харилцагч); **Тэгэхэд** бүлгийн зөрүү 0.00 ✓, [Тулгах] идэвхтэй. Зорилт өөр харилцагчийнх бол [Тулгах] идэвхгүй.
- **AT-UI-40 (UX-TB-02..04).** **Өгөгдсөн нь** §16.8-ын өгөгдөл; **Тэгэхэд** 2100-ийн эцсийн үлдэгдэл Кредит баганад 9,800,000.00; НИЙТ хос бүр тэнцүү ✓. **Хэрэв** 1110-ийн "Гүйлгээ Дебит" нүдэн дээр Enter; **Тэгэхэд** S-GL-06 данс = 1110, 2026-10-01..2026-10-31 шүүлттэй нээгдэнэ.
- **AT-UI-41 (UX-TB-01, D-D4).** **Өгөгдсөн нь** 2025-12-31-ний `is_closing` гүйлгээ; **Хэрэв** 2025-12-01..2025-12-31 тайланг "Хаалтын бичилт оруулах" унтраасан/асаасан байдлаар харвал; **Тэгэхэд** API `includeClosingEntries=false|true` (→ `rpt.fn_trial_balance(p_include_closing)`)-ээр дуудагдаж, орлогын дансны эцсийн үлдэгдэл ялгаатай.
- **AT-UI-42 (UX-VAT-04..07).** **Өгөгдсөн нь** 9-р сарын үе `OPEN`, баталгаажаагүй орцын НӨАТ 5; **Тэгэхэд** анхааруулга харагдаж, [Илгээсэн гэж тэмдэглэх] идэвхгүй (үе `CLOSED` биш). **Хэрэв** НӨАТ хаагаад, илгээсэн гэж тэмдэглэхдээ лавлах дугааргүй бол; **Тэгэхэд** `ui.required`. **Хэрэв** дугаар, step-up, "ИЛГЭЭСЭН" бичвэл; **Тэгэхэд** `SUBMITTED`, зөвхөн экспорт үлдэнэ.
- **AT-UI-43 (UX-COA-06).** **Өгөгдсөн нь** 1200 данс бичилттэй; **Тэгэхэд** [Устгах] идэвхгүй, tooltip "Бичилттэй дансыг устгахгүй. Блоклоно уу."
- **AT-UI-44 (UX-CUST-03, 13 §10.5).** **Өгөгдсөн нь** `INDIVIDUAL` харилцагч, регистр хадгалагдсан; **Тэгэхэд** ТТД талбар харагдахгүй, регистр `УБ******33`. **Хэрэв** `platform.pii.unmask`-гүй хэрэглэгч (`VIEWER`; Z-UI-15) картыг нээвэл; **Тэгэхэд** [Харах] товч харагдахгүй. Owner дарвал step-up → бүтэн утга 60 s харагдаад арилна.
- **AT-UI-45 (UX-CUST-02).** **Хэрэв** `LEGAL` харилцагчийн ТТД талбарт 7 оронтой "2345678" оруулбал; **Тэгэхэд** "Улсын бүртгэлийн дугаар байна. ТТД-г татах уу?" → `getTinInfo` хариугаар 11 оронтой ТТД санал болгоно.
- **AT-UI-46 (UX-ONB-04, FR-PLT-003 AC2).** **Өгөгдсөн нь** алхам 9-ийн provisioning job дугаарын цувралын алхамд алдаа өгсөн; **Тэгэхэд** "Юу ч үүсээгүй" мессеж ба [Дахин оролдох]; компанид дансны төлөвлөгөө, НӨАТ-ын тохиргоо **байхгүй**. Дахин оролдлого амжилттай бол нүүр нээгдэнэ.
- **AT-UI-47 (UX-ONB-03).** **Өгөгдсөн нь** алхам 5 дээр "Хадгалаад гарах"; **Хэрэв** дахин нэвтэрвэл; **Тэгэхэд** нүүрт "Компани тохируулах — үргэлжлүүлэх (5/9)" ба өмнөх сонголт хадгалагдсан.
- **AT-UI-48 (§10.4).** **Өгөгдсөн нь** анхны нэхэмжлэх батлагдсан; **Тэгэхэд** "Эхлэх алхмууд"-ын #6 ✓ болж, явц "6/8" шинэчлэгдэнэ.
- **AT-UI-49 (UX-EMPTY-02).** **Өгөгдсөн нь** харилцагчтай компани, шүүлтүүр "Блоклосон"-д мөр алга; **Тэгэхэд** `NO_RESULTS` [Шүүлтүүр цэвэрлэх], `FIRST_USE` харагдахгүй.

### 17.6 Хүртээмж, responsive, i18n, аюулгүй байдал

- **AT-UI-50 (NFR-070).** Үндсэн 8 урсгал (§11)-д `axe` 0 зөрчил (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` tag).
- **AT-UI-51 (UX-A11Y-13, 2.4.11).** Нэхэмжлэхийн 20 мөрөөр Tab/↓-ээр явахад фокустай нүдний bounding box нь наалттай толгой ба нийлбэрийн самбарын гадна бүрэн харагдана.
- **AT-UI-52 (UX-A11Y-16, 2.5.8).** Бүх товч, checkbox, дүрс-товч ≥ 24 × 24 CSS px (desktop); `pointer: coarse` эмуляцид ≥ 44 px.
- **AT-UI-53 (UX-A11Y-06).** Карт хуудас (S-PTY-02, S-PLT-07) 320 CSS px өргөнд хэвтээ гүйлгээгүй.
- **AT-UI-54 (UX-I18N-15).** **Өгөгдсөн нь** `en/sales.json`-д `invoiceCard.fields.dueDate` алга; **Тэгэхэд** `npm run i18n:check` амжилтгүй (CI улаан).
- **AT-UI-55 (UX-I18N-12/13, FR-PLT-010 AC1).** **Өгөгдсөн нь** хэрэглэгчийн хэл англи, данс `name_en` = "Cash on hand"; **Тэгэхэд** CoA-д "Cash on hand" харагдана. **Мөн** eBarimt-ийн хэвлэх баримт ба ТМ-1 PDF монголоор.
- **AT-UI-56 (UX-CUST-07).** **Өгөгдсөн нь** `VIEWER`; **Тэгэхэд** харилцагчийн утас `99****33`, имэйл `i***@nomin.mn`.
- **AT-UI-57 (NFR-072, UX-RESP-02).** 768 × 1024 viewport-д Sales clerk бэлэн борлуулалтыг баркод уншигчаар (keyboard wedge эмуляц) бүртгэж, батлаад хэвлэх цонх хүртэл гүйцэтгэнэ.
- **AT-UI-58 (UX-VAL-14).** Service worker-ийн Cache Storage-д `/api/` эсвэл `/bff/` замын хариу байхгүй.
- **AT-UI-59 (UX-NAV-18).** 55 минут оролтгүй → анхааруулга, `dirty` байвал `Flush()` нэг удаа; [Үргэлжлүүлэх] → `GET /bff/user`, session сунгагдана; дарахгүй бол 60 минутад 401 → нэвтрэх хуудас (`returnUrl`-тай). **Мөн** нээлттэй eBarimt PENDING баримттай хуудсыг оролтгүй 5 мин орхивол түүнээс хойш сүлжээнд polling хүсэлт явахгүй (UX-NAV-18a); хоёр tab-ын нэгэнд бичиж байхад нөгөө tab анхааруулга гаргахгүй (UX-NAV-19 `activity`).
- **AT-UI-60 (UX-PAGE-26, FR-PLT-016 AC1).** **Өгөгдсөн нь** идэвхтэй `READ_ONLY` support grant; **Тэгэхэд** бүх хуудсанд "Support хандалт идэвхтэй: {{хүртэл}} (зөвхөн унших)" тууз, хаах товчгүй.
- **AT-UI-61 (CUE-04, go-live).** **Өгөгдсөн нь** `go_live_date` = 2026-09-01, 2026 оны 1–8-р сарын VAT үе `OPEN` (seed-ээр үүссэн, хэзээ ч илгээгдээгүй), 9-р сар `OPEN`, D = 2026-10-07; **Тэгэхэд** CUE-04-ийн `P` = 9-р сар ("илгээх хүртэл 3 хоног"), 1-р сар биш. **Хэрэв** D = 2026-10-12 ба 9-р сар `SUBMITTED` биш; **Тэгэхэд** хоёрдогч мөр "9-р сар · хугацаа 2 хоног хэтэрсэн", төлөв `UNFAVORABLE`, мэдээний мөр `home.headline.vatOverdue`.
- **AT-UI-62 (§16.2, D-E9, PosAPI).** **Өгөгдсөн нь** ноорог нэхэмжлэх; **Тэгэхэд** "НӨАТ-ын огноо" зөвхөн унших ба бүртгэлийн огноотой тэнцүү. **Хэрэв** eBarimt төрлийг "B2C" болговол; **Тэгэхэд** "Иргэний eBarimt дугаар" харагдаж, "Худалдан авагчийн ТТД" нуугдана; "B2B" болговол эсрэгээр, ТТД заавал. **Мөн** "Автомат" сонголтод PATCH-ийн body-д `"ebarimtReceiptType": null` явна (`"AUTO"` биш).
- **AT-UI-63 (§7.6).** `"999960000"` → `1 тэрбум ₮` ("1000 сая ₮" биш); `"999949999"` → `999.9 сая ₮`.
- **AT-UI-64 (S-BNK-02, D-G1).** **Өгөгдсөн нь** `kind = 'CASH'` дансны карт; **Тэгэхэд** "Сөрөг үлдэгдэл хориглох" ✓ ба засагдахгүй; `BANK` дансанд засагдана.
- **AT-UI-65 (UX-EBR-04).** Хэвлэх цонхонд `window.print()`-ийн өмнө `document.styleSheets`-д `@page { size: 80mm <H>mm }` дүрэм нэмэгдсэн, `<H>` > 0 бөгөөд CSP-ийн зөрчлийн тайлан (`securitypolicyviolation`) гараагүй.

---

## 18. Schema өөрчлөлтийн хүсэлт (SCR-UI)

> **Төлөв (2026-10-08):** эдгээр хүсэлтийн шийдвэр, эцсийн нэрийг [db/CHANGE_REQUESTS.md](db/CHANGE_REQUESTS.md)-ээс үзнэ. Хүссэнээс ялгаатай: SCR-UI-07: `logo_attachment_id`, `stamp_attachment_id` (`platform.attachment`). SCR-UI-05: бүтэн REVOKE-ийн оронд баганын SELECT (`base_url`, `operator_tin`-гүй). SCR-UI-10 (нөхцөлт) татгалзсан.

Энэ баримт `db/` файлыг засаагүй. Доорх хүсэлтийг schema эзэмшигч шийднэ. Эрэмбээр (High → Low → нөхцөлт) жагсаав.

| ID | Эрэмбэ | Өөрчлөлт | Шалтгаан |
|---|---|---|---|
| SCR-UI-06 | Medium | `platform.onboarding_session (id uuid PK, tenant_id, company_id NOT NULL UNIQUE, current_step smallint CHECK (current_step BETWEEN 1 AND 9), data jsonb NOT NULL DEFAULT '{}', status text CHECK (status IN ('IN_PROGRESS','PROVISIONING','COMPLETED','FAILED')), provision_job_run_id uuid REFERENCES integration.job_run(id), last_error text, checklist_dismissed_at timestamptz, opening_balance_skipped boolean NOT NULL DEFAULT false, solo_user boolean NOT NULL DEFAULT false, created_*, updated_*, row_version)` + RLS (tenant, company) + `audit.fn_row_change` trigger. | Wizard-ийг үргэлжлүүлэх (UX-ONB-03, AT-UI-47), алхам 4–8-ийн сонголт, provisioning-ийн job (UX-ONB-04), "Эхлэх алхмууд"-ын #4, #7 нөхцөл (§10.4). |
| SCR-UI-07 | Medium | `platform.company_setup`-д: `director_name text`, `chief_accountant_name text`, `logo_object_key text`, `stamp_object_key text` (эсвэл 13 CR-22 `platform.attachment`-д `owner_table = 'platform.company_setup'` + `purpose IN ('LOGO','STAMP')`). | FR-PLT-002 (захирал, ерөнхий нягтлангийн нэр, лого, тамга) ба ТМ-1/МХ маягт (UX-PRN-02). Нэр нь системийн хэрэглэгч биш байж болно (13 CR-14 `company_signatory` нь `user_id`-тай). |
| SCR-UI-09 | Medium | `sales.sales_setup`-д: `walk_in_customer_id uuid` (FK `party.customer`), `default_cash_sale_payment_method_id uuid` (FK `party.payment_method`); provisioning нь "C00000 Иргэн (бэлэн борлуулалт)" харилцагч (`kind = 'INDIVIDUAL'`, `default_ebarimt_type = 'B2C'`) үүсгэнэ. | Бэлэн борлуулалт (S-SAL-09, UX-SAL-09): `sales_header.customer_id` NOT NULL тул анхдагч харилцагч хэрэгтэй. |
| SCR-UI-08 | Medium | `CREATE EXTENSION pg_trgm` (000-д алга; ADR-0017 #7 шаардсан) ба `btree_gin`; GIN индекс: `party.customer (company_id, search_name gin_trgm_ops)`, `party.vendor (…)`, `gl.gl_account (…)`, `inv.item (company_id, search_description gin_trgm_ops)`. `search_name`/`search_description`-д апп Skeleton (UX-FMT-14) хадгална гэж баганын тайлбарт бичих. | Хайх (Alt+Q) ба lookup-ийн SLO p95 ≤ 400 ms (02 §13); кирилл/латин нормчлол (NFR-062). |
| SCR-UI-04 | Medium | `integration.document_delivery (id, tenant_id, company_id, document_table text, document_id uuid, document_no text, channel text CHECK (channel = 'EMAIL'), recipient text, outbox_id uuid, status text CHECK (status IN ('QUEUED','SENT','FAILED','CANCELLED')), last_error text, sent_at timestamptz, created_at, created_by)` + RLS; `recipient` нь PII-P (`EDITOR_ONLY`). | Имэйлийн илгээлтийн түүх (UX-MAIL-03) outbox-ыг 30 хоногийн дараа цэвэрлэсний (13 CR-16) дараа ч хадгалагдах; FR-SAL-012-ын "эцэст нь хэрэглэгчид мэдэгдэнэ". |
| SCR-UI-05 | Low | View `ebarimt.v_company_posapi_status WITH (security_invoker = true)`: `ebarimt_setup` ⋈ `posapi_instance` → (`company_id`, `left_lotteries`, `last_send_data_at`, `instance_status`, 12 SCR-07-ийн `health_status`). Зөвлөмж: `app_user`-ээс `ebarimt.posapi_instance`-ийн шууд SELECT-ийг хасах (одоо 900-д бүх хүснэгтэд SELECT олгосон; `base_url`, `operator_tin` бүх тенантад харагдана). | CUE-08 (сугалааны үлдэгдэл) ба S-EBR-02-ийн instance-ийн мэдээллийг зөвхөн өөрийн компанийн instance-аар. |
| SCR-UI-01 | Low | `platform.user_preference (id, tenant_id, user_id, company_id NULL, pref_key text CHECK (pref_key IN ('date_format','home_variant','receipt_width_mm','single_key_shortcuts','report_units','factbox_open','default_ebarimt_pos_id')), value jsonb NOT NULL, updated_at, row_version, UNIQUE NULLS NOT DISTINCT (tenant_id, user_id, company_id, pref_key))` + RLS. `date_format` ∈ {`yyyy.MM.dd`, `yyyy-MM-dd`, `dd.MM.yyyy`}. | Хэрэглэгчийн тохиргоо (S-PLT-16) төхөөрөмж хооронд; R1-д `localStorage` fallback (UX-HOME-01, UX-GRID-15). Хэл нь `app_user.preferred_language`-д аль хэдийн бий. |
| SCR-UI-02 | Low (R2) | `platform.cue_setup (id, tenant_id, company_id, user_id NULL, cue_id text CHECK (cue_id ~ '^CUE-[0-9]{2}$'), threshold1 numeric(19,4), threshold2 numeric(19,4), low_style, middle_style, high_style text CHECK (… IN ('NONE','FAVORABLE','UNFAVORABLE','AMBIGUOUS','SUBORDINATE')), CHECK (threshold1 <= threshold2), UNIQUE NULLS NOT DISTINCT (company_id, user_id, cue_id))`. | BC table 9701 "Cue Setup"-ийн хялбар хувилбар (§3.4 `EvaluateState`). |
| SCR-UI-03 | Low (R2) | `platform.saved_view (id, tenant_id, company_id, user_id, page_id text CHECK (page_id ~ '^S-[A-Z]{2,3}-[0-9]{2}$'), name text, filters jsonb, sort jsonb, columns jsonb, is_default boolean, shared boolean, created_*, updated_*, row_version)`. | Хадгалсан харагдац ба баганын төлөв серверт (UX-GRID-15, BC "Views"). |
| SCR-UI-11 | Low (R2) | `platform.user_notification (id, tenant_id, company_id, user_id, kind text, title_key text, params jsonb, link text, created_at, read_at)`; `params`-д `fn_has_forbidden_ebarimt_keys` CHECK. | Байнгын мэдэгдэл (S-PLT-21, FR-PLT-015); R1-д `job_run` + cue-ээс тооцоолно. |
| SCR-UI-12 | Medium | `bank.bank_account`-д `CHECK (kind <> 'CASH' OR prevent_negative_balance)` (одоо `prevent_negative_balance` нь CASH-д ч `false` байж болно, зөвхөн тайлбарт "true for CASH by default"). | D-G1 "Кассын үлдэгдэл сөрөг болохыг хориглоно" нь сонголт биш хатуу дүрэм; S-BNK-02 энэ талбарыг CASH-д засагдахгүй харуулна. |
| SCR-UI-10 | Нөхцөлт (OQ-UI-22 "тийм" бол High) | Кассын баримтын ноорог хадгалах бол: тусдаа `bank.cash_voucher_draft (id, tenant_id, company_id, voucher_type CHECK IN ('RECEIPT','PAYMENT'), bank_account_id, posting_date, counterparty_type, counterparty_id, counterparty_name CHECK (char_length BETWEEN 1 AND 200), counterparty_id_doc text CHECK (counterparty_id_doc IS NULL OR counterparty_id_doc LIKE 'enc:v1:%'), counterparty_id_doc_hint text CHECK (char_length(counterparty_id_doc_hint) <= 20), purpose CHECK (char_length BETWEEN 1 AND 250), amount platform.amount CHECK (amount > 0), apply_to jsonb, created_*, updated_*, row_version)` + RLS + аудит; `counterparty_id_doc`-ийг 13-ын `PiiCatalog`-д PII-S. (Эхний хувилбарын `gl.journal_line`-д багана нэмэх санал хүчингүй: 14 `POST /payments` нь journal_line ашигладаггүй.) | 14-api-д МХ-1/МХ-2 нь ноороггүй, нэг командаар (Z-UI-11). Ноорог шаардлагатай бол (олон кассчин, урьдчилан бэлтгэж гарын үсэг зуруулах) л. |

### 18.1 API гэрээнд тавих шаардлага (schema биш)

[14-api.md](./14-api.md) ба [api/openapi.yaml](./api/openapi.yaml)-д тусгах (14 §22-ын жагсаалтад). "Төлөв" нь 2026-10-07-ны байдлаар.

| # | Шаардлага | Хаана (энэ баримт) | Төлөв |
|---|---|---|---|
| A-01 | `GET /api/v1/companies/{cid}/me/permissions` → үр дүнгийн эрх (`objectType`, `objectName`, RIMDX) | UX-NAV-05, UX-SEC-07 | **Бий:** 13 §19 (SEC-AZ-01) |
| A-02 | `GET /api/v1/companies/{cid}/home?variant=&forceRefresh=` → `{ variant, asOf, headline, cues[], checklist? }` (§3.4) | §3, §10.4 | **Шинэ:** 14 §15.1-д нэмэх |
| A-03 | `GET /api/v1/companies/{cid}/search?q=&types=` (эрхээр шүүсэн, групп бүрд ≤ 5, p95 ≤ 400 ms) | §2.4 | **Шинэ** |
| A-04 | Ноорог хадгалах (`POST`/`PATCH`) хариунд: шинэ `ETag`, серверийн мөрийн дүн, `amount`/`vatAmount`/`amountIncludingVat` (бий), **нэмэх:** `vatBreakdown[]` (`vatIdentifier`, `base`, `amount`), `invoiceRoundingAmount`, `amountInWords` (одоо зөвхөн `CashVoucher`-т), `warnings[]` (W-02..W-04, W-06) | §4.5, §5.3, §8.4 | **Хэсэгчлэн** |
| A-05 | `problem+json`-ийн мөрийн алдаа `lineId`-тай | §8.2, UX-VAL-05 | **Бий:** 14 API-ERR-04, API-ACT-02 |
| A-06 | Ноорог → posted тогтвортой id | UX-NAV-10 | **Бий:** 14 API-URL-10..13 (эхний хувилбарын `?draftId=` хүсэлт хүчингүй) |
| A-07 | Цуцлах dialog-д eBarimt-ийн нөлөө: `GET /sales-invoices/{id}/cancel-effects` (эсвэл `:cancel?dryRun=true`) → `{ ebarimtEffect: DELETE \| INACTIVATE \| REPORT_MONTH \| NONE, reportMonthDeadline? }` | UX-DOC-09, OQ-UI-08 | **Шинэ** |
| A-08 | `POST /api/v1/companies/{cid}:provision` (`Idempotency-Key`) → 202 + `Job`; `result.steps` = `fn_provision_company_mn`-ийн `inserted` түлхүүрүүд; дараагийн санхүүгийн жил (FR-PLT-003 AC1) `fn_provision_company_mn`-ээр өөрөө үүснэ (mn_90_provision.sql) | UX-ONB-04, UX-WIZ-03, 05 | **Шинэ** |
| A-09 | Жагсаалтын хариунд (`?includeTotals=true` үед) `totals` (бүх шүүлттэй мөрөөр: Σ `amountIncludingVat`, Σ `remainingAmount`) | UX-PAGE-16 | **Шинэ** (одоо `{ items, nextCursor, hasMore }`) |
| A-10 | `paymentStatus`, `status`, `isCancellation`, `ebarimt.chainStatus` | §5.1, §5.8 | **Бий:** 14 §8.4, §16.1 (`OVERDUE` нь UI-д, Z-UI-12) |
| A-11 | `GET /reports/vat-return`-ийн мөр бүрт drill-down шүүлтүүр (`vatEntryFilter`), хариунд `lastVatEntryNo`; `:submit`-ийн хариунд `effects[]` (жишээ нь нягтлан бодох үе түгжигдсэн эсэх) | UX-VAT-02, 03, 06 | **Шинэ** |
| A-12 | Хэвлэх маягт сонгох `GET …/{id}/pdf?form=TM1\|SCM\|…&labels=mn\|mn-en` (`Cache-Control: no-store`); кредит нотод `GET /sales-credit-memos/{id}/pdf` | UX-PRN-01..03 | **Хэсэгчлэн:** `GET …/pdf` бий |
| A-13 | Кредит нотын ноорогт эх нэхэмжлэхийн мөрийг хуулах: `POST /sales-credit-memos` `{ correctedInvoiceId, copyLinesFromInvoice: true }` (create-only) эсвэл `POST /sales-credit-memos/{id}:get-invoice-lines` (BC "Get Posted Doc. Lines to Reverse") | §5.9, S-SAL-04 | **Шинэ** |
| A-14 | Гүйлгээ балансад гарчиг/нийлбэрийн мөр: `?includeHeadings=true&maxIndentation=` → мөрт `accountType`, `indentation` | UX-TB-01 | **Шинэ** |
| A-15 | Харилцагчийн статистик FactBox: `GET /customers/{id}?include=statistics` → `balanceLcy`, `balanceDueLcy` (бий, 14 §16.4), **нэмэх:** `salesYtdLcy`, `lastPaymentDate`, `creditLimitLcy` | §4.4, UX-CUST-10 | **Хэсэгчлэн** |

## 19. Нээлттэй асуулт (OQ-UI)

| ID | Асуулт | Нөлөө | Санал болгосон анхдагч | Хэн шийдэх |
|---|---|---|---|---|
| OQ-UI-01 | Борлуулагч (`SALES_CLERK`) кредит нот (буцаалт) батлах уу? 00-overview P4 "тийм", 13 CR-23 "үгүй". | S-SAL-03/04-ийн цэс, SALES_HOME | 13-ыг дагана (үгүй); Owner custom role-оор олгож болно | Бизнес эзэн |
| OQ-UI-02 | 18 §3.5-ын "`Intl`-ээр mn-MN форматлах"-ыг ADR-0017-ийн "өөрсдийн formatter"-аар солих уу? | §7 | Өөрсдийн formatter; 18-ыг засна | Архитектор |
| OQ-UI-03 | API-ийн enum утга UPPER_SNAKE эсвэл camelCase? | i18n `enums.*` түлхүүр | **Шийдэгдсэн:** UPPER_SNAKE (14 §0.2 #2); API-ийн утгыг өөрчлөлтгүй түлхүүр болгоно | API spec |
| OQ-UI-04 | `problem+json`-ийн `pointer` мөрийг `lineId`-аар заах уу? | UX-VAL-05 | **Шийдэгдсэн:** `pointer` нь `/lines/{index}/…` + тусдаа `lineId` (14 API-ERR-04, API-ACT-02); UI `lineId`-ийг давамгайлуулна | API spec |
| OQ-UI-05 | Серверийн алдааны кодын каталогийг (OpenAPI extension эсвэл JSON) нийтлэх үү? | UX-I18N-08, CI | Тийм, `errors.catalog.json` | API spec |
| OQ-UI-06 | PosAPI instance-ийн сугалааны үлдэгдлийг (олон мерчантын нийт) мерчантад харуулах нь зөв үү, эсвэл зөвхөн "Хэвийн / Анхаарах" төлөв? | CUE-08 | Тоо + төлөв, tooltip-тэй | Бизнес эзэн, ITC |
| OQ-UI-07 | Борлуулалтын кредит нотын хэвлэх маягт (албан загвар) юу вэ? | UX-PRN-02 | ТМ-1-ийн загвар "Кредит нот" гарчигтай | Нягтлан зөвлөх |
| OQ-UI-08 | Цуцлахын өмнө eBarimt-д юу болохыг сервер урьдчилан (`ebarimtEffect`) буцаах уу? | UX-DOC-09 | Тийм | eBarimt/Sales spec |
| OQ-UI-09 | Хүртээмжтэй headless компонентын сан: React Aria Components эсвэл Radix UI? | §13.2 | React Aria Components (a11y хамрах хүрээ, date picker) — ADR | Frontend баг |
| OQ-UI-10 | Монгол хэлний дэлгэц уншигч (TTS) NVDA/VoiceOver-т хэр дэмжигддэг вэ? | UX-A11Y-25 | `lang` ба бүтцийг заавал шалгах; пилотод нэг хэрэглэгчтэй тест | UX судлаач |
| OQ-UI-11 | График сан (bundle ≤ 400 KB gzip, ADR-0015 #7)? | §3.2, UX-A11Y-14 | Өөрсдийн жижиг SVG шугаман график (R1-д ганц график) | Frontend баг |
| OQ-UI-12 | "Posting date"-ийн монгол нэр "Бүртгэлийн огноо"-г нэр томьёоны толинд батлах уу? | §0.1, §14.7 | Тийм | Нягтлан зөвлөх |
| OQ-UI-13 | Кассын тооллогод дэвсгэртийн задаргаа (10 000 ₮ × 12 …) хадгалах уу? | S-BNK-13 | R1-д зөвхөн нийт дүн; задаргаа R2 | Нягтлан зөвлөх |
| OQ-UI-14 | Утсан (< 768 px) дээрх Sales clerk-ийн оруулах урсгал R1-д заавал уу (NFR-080 "Should")? | UX-RESP-03 | Should, пилотын санал хүсэлтээр | Бизнес эзэн |
| OQ-UI-15 | Гэрээт нягтланд тенант хоорондын нэгдсэн самбар (BC Company Hub) хэрэгтэй юу? RLS-ийн улмаас тусдаа архитектур шаардана. | §1.1 (R3) | R3, судалгаагаар | Бизнес эзэн, архитектор |
| OQ-UI-16 | Батлахын баталгаажуулах dialog-ийг хэрэглэгч унтрааж болох уу? | UX-PAGE-20 | R1-д үгүй | Бизнес эзэн |
| OQ-UI-17 | Ажлын огноог (work date) бүх role сольж болох уу (буруу огноогоор бичих эрсдэл)? | UX-FMT-07 | `X gl.journal.post` эсвэл `T_SETUP` M-тэй role л | Нягтлан зөвлөх |
| OQ-UI-18 | eBarimt-ийн хэвлэх баримтын албан шаардлага (талбар, хэмжээ, лого) — 12 OQ-07 | UX-EBR-02, 04 | 12 §13.2-ын жагсаалт | ITC |
| OQ-UI-19 | НӨАТ-ын үеийг "илгээсэн" болгоход нягтлан бодох үе автоматаар `LOCKED` болох уу (03 §6.2)? | UX-VAT-06 | Серверийн `effects`-ийг харуулна | НӨАТ-ын spec |
| OQ-UI-20 | Модулийн spec 05–10 гарахад дэлгэцийн талбар, үйлдэл, алдааны кодыг тулгах | §15, §16 | Энэ баримтыг шинэчлэх | Баримтын эзэд |
| OQ-UI-21 | Имэйлийн загвар, илгээгчийн домэйн (SPF/DKIM), харилцагчийн хэлээр илгээх эсэх | UX-MAIL-01 | R1: монгол загвар, компанийн нэрээр, платформын домэйн | Ops, бизнес эзэн |
| OQ-UI-22 | Кассын баримтыг (МХ-1/МХ-2) батлахаас өмнө **ноорогоор** хадгалах хэрэгтэй юу (олон кассчин, урьдчилан бэлтгэж гарын үсэг зуруулах)? 14 `POST /payments` нь нэг командтай | S-BNK-03/04, UX-CASH-06, SCR-UI-10 | R1-д үгүй (санах ойн форм + анхааруулга); пилотын санал хүсэлтээр R2 | Бизнес эзэн, нягтлан зөвлөх |
| OQ-UI-23 | Эрхийн объектын нэрийг нэгтгэх: 14 §15 / 12 §18 ба seed / 13 §6.3-ын зөрүү — `sales.credit_memo.post` ↔ `sales.creditmemo.post`, `tax.vat_period.close` / `tax.vat_period.submit` ↔ `tax.vat.settle` / `tax.vat_return.submit`, `ebarimt.document.resolve` ↔ `ebarimt.unknown.resolve`, `rpt.ar_aging` / `rpt.ap_aging` ↔ `rpt.customer_aging` / `rpt.vendor_aging`, `tax.vat.confirm_input` (12) ↔ `tax.vat_entry.confirm_deductible`; seed-д байхгүй: `gl.journal.preview`, `sales.document.print`, `rpt.financial_statements`, `rpt.report.export`, `gl.posting_window.manage`, `gl.year.create`. Мөн PII unmask-ийн role (Z-UI-15) | §2.3, §15, `permissions.catalog.json` (UX-NAV-05) | Seed-ийн нэрийг эх болгох (D-K1); 14/12-ыг засах; seed-д байхгүй объектыг 13 CR-23-д нэмэх. UI нь каталогийн тогтмолоор тул нэр солигдоход зөвхөн каталог шинэчлэгдэнэ | Аюулгүй байдлын spec (13), API spec (14) |
| OQ-UI-24 | Хуулийн бус тайлангийн экспортыг (`ReportExportRequest.language`) хэрэглэгчийн хэлээр (en) гаргах уу? | UX-PAGE-18, UX-PRN-03 | Хуулийн маягт (Маягт А, ТТ-03а, ТМ-1, МХ-1/2, e-balance) үргэлж `mn`; бусад тайлан хэрэглэгчийн хэлээр | Нягтлан зөвлөх |
| OQ-UI-25 | Гүйлгээ балансын гарчиг/нийлбэрийн мөр (A-14) R1-д заавал уу? | UX-TB-01, S-RPT-02 | Should; A-14 хэрэгжих хүртэл зөвхөн бичилтийн данс + "Түвшин" шүүлтүүргүй | Тайлангийн spec, бизнес эзэн |

---

## 20. Шаардлагын уялдаа (FR/NFR → дэлгэц, дүрэм)

| Шаардлага | Дэлгэц | Дүрэм / тест |
|---|---|---|
| FR-PLT-001, 003 | S-PLT-06, S-PLT-25 | §10, UX-ONB-01..07, UX-WIZ-01..06, AT-UI-46, 47 |
| FR-PLT-002 | S-PLT-07 | SCR-UI-07 |
| FR-PLT-004, 006 | S-PLT-03, 04, 09, 10 | UX-NAV-02, 03, AT-UI-02 |
| FR-PLT-005 | Бүх цэс | UX-NAV-05, UX-PAGE-03, AT-UI-01 |
| FR-PLT-007 | S-PLT-01, 02 | UX-PAGE-24, 25, UX-A11Y-23, AT-UI-16 |
| FR-PLT-008 | S-PLT-12, S-PLT-06 алхам 5 | UX-WIZ-04 |
| FR-PLT-009 | S-PLT-14 | UX-SAVE-08, UX-CUST-09 |
| FR-PLT-010 | Бүгд | §7, §14, AT-UI-55 |
| FR-PLT-011, 012 | S-PLT-22, 23 | UX-DOC-10, 11 |
| FR-PLT-013 | S-PLT-17 | UX-NAV-15..17 |
| FR-PLT-014 | S-PLT-18 | UX-PAGE-18 (async job, Z-UI-16) |
| FR-PLT-015 | S-PLT-05, S-PLT-21 | §3, AT-UI-05..09 |
| FR-PLT-016 | S-PLT-20 | UX-PAGE-26, AT-UI-60 |
| FR-PLT-017 | S-PLT-24 | — |
| FR-PLT-019, FR-GL-023 | S-PLT-08 | — |
| FR-GL-001..005 | S-GL-01, 02 | UX-COA-01..09, AT-UI-43 |
| FR-GL-006..011 | S-GL-03, S-GL-08 | UX-JNL-01..12, §5.5, AT-UI-20, 24..27 |
| FR-GL-013..015 | S-GL-07 | §5.9 |
| FR-GL-016 | S-GL-04 | UX-JNL-10 |
| FR-GL-021 | S-GL-05 | UX-JNL-11 |
| FR-GL-022, 024..026 | S-GL-09..11 | CUE-15 |
| FR-TAX-009 | S-TAX-05, S-PUR-09 | CUE-14, W-05 |
| FR-TAX-013..016 | S-TAX-02, 03 | UX-VAT-01..10, A-11, AT-UI-42 |
| FR-PTY-001..006 | S-PTY-01..04 | UX-CUST-01..10, AT-UI-44, 45, 56 |
| FR-PTY-007..014 | S-PTY-05..07 | §15.4 |
| FR-SAL-001..006, 013 | S-SAL-01, 02, 09 | §5, UX-SAL-01..09, AT-UI-10..15, 22 |
| FR-SAL-007..010 | S-SAL-03, 04, 06 | §5.9, UX-DOC-13..15, A-13, AT-UI-21 |
| FR-SAL-011 | S-SAL-06 | UX-PRN-01..07 |
| FR-SAL-012 | S-SAL-10 | UX-MAIL-01..05, SCR-UI-04 |
| FR-SAL-014 | S-SAL-01, 05 | UX-DOC-01, 02, 14, §5.8 (Z-UI-12, Z-UI-14) |
| FR-SAL-015 | S-SAL-01, 02 | UX-DOC-12 |
| FR-PUR-001..006 | S-PUR-01..08 | W-05 |
| FR-BNK-001 | S-BNK-01, 02 | — |
| FR-BNK-002, 003 | S-BNK-03, 04, 05 | UX-CASH-01..08, SCR-UI-10, AT-UI-35..37 |
| FR-BNK-004 | S-BNK-13 | OQ-UI-13 |
| FR-BNK-005..007, 018 | S-BNK-06, 07, 15, S-SAL-11 | — |
| FR-BNK-008..010 | S-BNK-08, 11 | — |
| FR-BNK-011..014, 016 | S-BNK-09, 10, S-RPT-14 | UX-REC-01..11, AT-UI-38, 39 |
| FR-BNK-012 | S-BNK-12 | UX-REC-07 |
| FR-EBR-001 | S-EBR-01, 06 | UX-ONB-08..11 |
| FR-EBR-007, 013 | S-EBR-02, 05, 07 | UX-EBR-01, CUE-05..08, AT-UI-19 |
| FR-EBR-008 | S-EBR-04 | UX-EBR-02..05, AT-UI-17, 18 |
| FR-EBR-012 | S-EBR-03 | — |
| FR-RPT-001 | S-RPT-02 | UX-TB-01..08, A-14, AT-UI-40, 41 |
| FR-RPT-002..017 | S-RPT-03..16 | §15.7, UX-FMT-09 |
| FR-INT-004 | S-PLT-19 | — |
| NFR-060..062 | Бүгд | §7, §14, AT-UI-28..34, 54 |
| NFR-070..072 | Бүгд | §11, §12, AT-UI-50..53, 57 |
| NFR-080 | Бүгд | §12, UX-RESP-03 |
| NFR-120 | S-PLT-06, S-PLT-05 | §10.4 |
| NFR-121 | Баримт, ажлын хуудас | §8.3, AT-UI-14 |

---

## Хяналтын тэмдэглэл (Review log)

**Огноо:** 2026-10-07. **Хамрах хүрээ:** бүх 20 хэсэг. **Шалгасан эх:** DECISIONS.md (D-C2, D-D3, D-E9, D-G1, D-J1..J4, D-K1), `db/schema/*.sql` ба `db/seed/*.sql` (хүснэгт, багана, домэйн, эрхийн каталог `mn_00_catalogs.sql`/`mn_60_security.sql` — `grep`-ээр), 02 §10.1/§13, ADR-0016, 13 SEC-AUTH-05, 12 SET-05/08/11, 14 AT-API-055, 06 §3.3/BR-SAL-34, 01 FR-PLT-003, skill `anthropic-skills:ebarimt-integration` (PosAPI 3.0: `consumerNo`/`customerTin`-ийн хэрэглээ, ТТД 11/12–14 орон, `leftLotteries < 100`, `qrData`/`lottery`-г хадгалахгүй), Microsoft Learn "Keyboard shortcuts" (2026-10-07-нд дахин уншсан: Alt+G, Ctrl+Alt+Q, Ctrl+Enter, Ctrl+↑/↓, F8, Ctrl+Shift+F12, огнооны `t`/`w` — бүгд зөв). WCAG-ийн өнгөний харьцааг §13.1-ийн hex-ээр дахин тооцов. OpenAPI-ийн linter: энэ баримт OpenAPI биш тул ажиллуулаагүй; §18.1-ийн endpoint-уудыг `api/openapi.yaml`, 12/13/14-тэй `grep`-ээр тулгав.

| # | Төрөл | Олдсон асуудал | Засвар |
|---|---|---|---|
| R-01 | Дутуу (хэрэгжүүлэх боломжгүй) | §3.4 `BuildHome` нь `HomeLayout[variant]`-ийг ашигладаг ч хаана ч тодорхойлоогүй; §3.6-ийн тэмдэглэл "tile-ийн дараалал = §3.3-ын дараалал" гэсэн нь wireframe-тэй (03, 01, 02, 17 …) зөрчилтэй | §3.3.1 `HomeLayout` хүснэгт (хувилбар × бүлэг × cue-ийн дараалал) нэмэв; тэмдэглэлийг засав |
| R-02 | Зөрчил | OWNER wireframe-ийн "Нийт өглөг"-ийн "7 хоногт: 2.3 сая" нь CUE-12-ийн утга, харин CUE-12 нь O-д тусдаа tile гэж заасан | CUE-17-ийн хоёрдогч мөр = CUE-12-ийн дүн; CUE-12 → зөвхөн A |
| R-03 | Тооцоо | Wireframe-д "2.75 сая ₮" (×2) — `formatCompactMnt` нь 1 бутархай (HALF_UP) тул "2.8 сая ₮"; "Банк 45.0" нь `.0`-ийг хасдаг дүрэмтэй зөрчилтэй | "2.8 сая ₮", "Банк 45"; задлалын нийлбэр 48.6 ≠ 48.7 нь бие даасан бөөрөнхийлөлт гэдгийг тайлбарлав |
| R-04 | Тооцоо | `formatCompactMnt`: 999,950,000+ → "1000 сая ₮" | Бөөрөнхийлсний дараа ≥ 1000 сая бол "тэрбум" руу шилжинэ; AT-UI-63 |
| R-05 | Зөрчил | ACCOUNTANT_HOME: CUE-06 "2 тодорхойгүй" байхад мэдээний мөр НӨАТ-ыг харуулж байна — §3.5-ын эрэмбээр `UNKNOWN` > 0 бол eBarimt давамгайлна | Tile-ийг "3 татгалзсан" (UNKNOWN = 0) болгож тайлбар нэмэв |
| R-06 | Зөрчил | CUE-13 "✓ 0 ₮" (FAVORABLE) харагдаж байгаа ч дүрэмд 0 → төлөв алга (`NONE`); CUE-05 "Хэвийн" (FAVORABLE-ийн шошго) харин дүрэм `NONE` | CUE-13: 0 → `FAVORABLE`; CUE-05: 0 эсвэл ≤ 1 цаг → `FAVORABLE` |
| R-07 | Edge case | CUE-04-ийн `P` нь go-live-аас өмнөх, хэзээ ч илгээгдэхгүй `OPEN` үед (seed бүтэн жилийн үе үүсгэдэг) байнга "гацна"; хугацаа хэтэрсэн (хоног < 0) үеийн текст алга | `ending_date >= go_live_date` шүүлтүүр; "хугацаа N хоног хэтэрсэн" текст, `home.headline.vatOverdue`; AT-UI-61 |
| R-08 | Тооцоо | §16.4 хуулгын тулгалт: тулгагдсан мөр нь 2 төлбөр (+1,100,000, −600,000) + 1 дүрмийн бичилт (−500), "3 төлбөр" биш | "2 төлбөр, 1 дүрмийн бичилт" |
| R-09 | Хууль/PosAPI | Жишээнд ТТД = 7 оронтой `5123456` (ААН-ийн ТТД нь 11 орон; 7 орон нь улсын бүртгэлийн дугаар, UX-CUST-02 өөрөө ингэж заасан); B2B `customerTin`-д 7 оронтой утга явах загвар | Бүх жишээг 11 оронтой болгож, §7.7-д ТТД ба регистрийн ялгааг тодорхой бичив |
| R-10 | Schema зөрчил | `ebarimtReceiptType` = `AUTO` гэж бичсэн; `sales.sales_header.ebarimt_receipt_type`-д `AUTO` утга байхгүй (NULL = автомат, 06 §3.3); `*_INVOICE` нь R2 (D-J1) | `null` = Автомат; R1-ийн сонголтын жагсаалт; `consumerNo`/`customerTin`-ийн харагдах ба цэвэрлэх дүрэм (PosAPI); AT-UI-62 |
| R-11 | DECISIONS зөрчил | Борлуулалтын нэхэмжлэхийн НӨАТ-ын огноог засах талбар мэт харуулсан; D-E9 ба 06 BR-SAL-34-өөр нэхэмжлэхэд `vat_date = posting_date` заавал | Зөвхөн унших; засах нь худалдан авалтад л |
| R-12 | FR зөрчил | UX-WIZ-03, A-08: дараагийн санхүүгийн жилийг "go-live ≥ 10-р сар" бол л үүсгэнэ; FR-PLT-003 AC1 нь үргэлж "одоогийн ба дараагийн" | Үргэлж хоёр жил |
| R-13 | DECISIONS зөрчил | S-BNK-02: `prevent_negative_balance` CASH-д "анхдагч тийм" (= унтрааж болно); D-G1 хатуу хориг | CASH-д үргэлж тийм, засагдахгүй; SCR-UI-12; AT-UI-64 |
| R-14 | Schema-д байхгүй ойлголт | "Хэрэглэгчийн анхдагч POS" (CUE-19, UX-CASH-02) — schema-д зөвхөн компанийн `ebarimt_pos.is_default` | Компанийн анхдагч POS; хэрэглэгчийн POS-ийг SCR-UI-01-ийн `default_ebarimt_pos_id`-д нэмэв |
| R-15 | Аюулгүй байдал / edge case | Арын polling (eBarimt 5 s, job, cue) нь серверийн sliding session-ийг сунгаж 60 мин идэвхгүй хугацааг (SEC-AUTH-05) хэзээ ч дуусгахгүй; олон tab-д идэвх хуваалцахгүй; "хугацаа дууссаны дараа хадгалах оролдлого" нь 401-ийн улмаас боломжгүй; сунгах endpoint тодорхойгүй | UX-NAV-18 (оролт = идэвх, 55 минутад `Flush`, `GET /bff/user`), UX-NAV-18a (оролтгүй 5 мин → polling зогсоно), UX-NAV-19 `activity` дохио; 401 мөр ба AT-UI-59-ийг засав |
| R-16 | Дутуу | Батлах хүсэлтийн клиентийн timeout тодорхойгүй; `sync` eBarimt нь PosAPI 20 s timeout-той (02 §13) тул богино timeout давталт үүсгэнэ | 35 s (sync) / 15 s; timeout = network, ижил key |
| R-17 | Буруу техникийн мэдэгдэл | `@page { size: 80mm auto }` нь CSS-д хүчингүй | CSSOM-оор хэмжсэн өндөр; fallback; AT-UI-65 |
| R-18 | API зөрүү | UX-PAGE-31 `/api/v1/system/version` нь 14/openapi-д байхгүй, §18.1-д ч хүсээгүй | nginx-ийн статик `/version.json` |
| R-19 | Schema нэр | UX-RESP-08 бараа хайлтыг `sales_line.barcode`-оор | `inv.item.barcode` (`ix_item__barcode`) |
| R-20 | Pseudo-code | `Skeleton`: `replace('kh','h')` зөвхөн эхний тохиолдол | `replaceAll` |
| R-21 | Тооцоо | Token-ийн харьцаа: `#174C99` = 8.3:1 (8.4 биш); badge-ийн хамгийн бага 5.38 (≥ 5.4 биш) | Засав |
| R-22 | Дутуу | 12 SET-08: POS/салбар/дүүрэг солиход PENDING баримтын анхааруулга UI-д алга | UX-EBR-07 |
| R-23 | Нарийвчлал | UX-PAGE-23 `gl.period.reopen`-ийг "буцаагдахгүй" гэж ангилсан; огнооны сонгогчийн Ctrl+Home grid дотор мөр рүү үсэрдэг (BC) | Үг засав; grid-д Alt+↓ |
| R-24 | Хуучирсан | Толгойн тэмдэглэл "05–10 repo-д байхгүй" — 05, 06, 08, 11 гарсан | Шинэчилж 06-тай тулгасан зүйлсийг заав |

**Шалгаад зөв гэж үзсэн (өөрчлөөгүй):** §16.2-ын тооцоо (3 × 333.335 = 1,000.005 → 1,000.01; хөнгөлөлт 100.00; НӨАТ 5,090.00; нийт 55,990.01; дүн үсгээр), AT-UI-20-ийн G/L (Σ Дт = Σ Кт = 55,990.01, 2300 = Борлуулалтын НӨАТ), §16.5 журнал (4,500,000 = 3,960,000 + 315,000 + 225,000), §16.8 гүйлгээ балансын 5 мөр (эхний + Дт − Кт = эцсийн), §16.9 ТТ-03а (4,270,000 − 1,520,000 = 2,750,000 = AT-UI-08), AT-UI-05/07/29/30/31/33/38/39, CUE-08-ийн босго (12-тай нийцсэн: `leftLotteries < 100`, `sendData` > 48 цаг), §6.3-ын BC товчлол, бүх `schema.table` ба багана (`grep`-ээр; байхгүй нэрс нь SCR-UI эсвэл 13 CR-23-д хүсэлттэй), эрхийн нэрс (seed-д байхгүй нь 13 CR-23 / OQ-UI-23-т бүртгэлтэй), PosAPI-ийн дүрэм (`qrData`/`lottery` зөвхөн санах ойд, D-J2-ийн автомат дахин илгээлтгүй, D-J4 буцаалтын хэлбэр).

**Үлдсэн эрсдэл:** OQ-UI-23 (эрхийн нэрийн нэгтгэл) ба OQ-UI-20 (05/06/08/11-тэй бүрэн тулгалт — зөвхөн 06 §3.3, BR-SAL-34-ийг тулгав) нээлттэй.
