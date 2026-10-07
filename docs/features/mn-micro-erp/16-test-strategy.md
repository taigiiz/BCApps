# 16. Тестийн стратеги ба golden scenario-ийн каталог (Test strategy)

> **Төлөв:** Хөгжүүлэлтэд бэлэн тодорхойлолт (development-ready spec), ноорог v1.
> **Огноо:** 2026-10-07
> **Уншигч:** QA, backend ба frontend хөгжүүлэгч, DevOps, golden scenario хянадаг нягтлан зөвлөх, бүтээгдэхүүний эзэн (UAT, чанарын хаалга)
> **Эх сурвалж (давамгайлах дарааллаар):** [DECISIONS.md](./DECISIONS.md) (D-K1: DB-ийн нэрийн эх сурвалж нь [`db/schema/*.sql`](./db/schema/)) → [adr/](./adr/README.md) → [02-architecture.md](./02-architecture.md) (§1.2, §5.4, §6, §7.8, §8, §9, §11, §12.7, §13) → [03-domain-model.md](./03-domain-model.md) (§5 инвариант INV-01…INV-31) → [01-requirements.md](./01-requirements.md) (FR, NFR-001…NFR-123) → [18-dev-setup.md](./18-dev-setup.md) (§9 DoD, §10 CI, §13 тест өгөгдөл) → [12-ebarimt-integration.md](./12-ebarimt-integration.md) (§24 AT-EB, §25 staging) → [13-security-audit-tenancy.md](./13-security-audit-tenancy.md) (§17 SEC-T, §20 AT-SEC) → [14-api.md](./14-api.md) (§9 алдааны код, §19) → [15-ui-ux.md](./15-ui-ux.md) (§11 хүртээмж, AT-UI) → [research/tech-architecture.md](./research/tech-architecture.md) §11, §16 (TA-14).
> **Модулийн spec.** Хяналтын үед (2026-10-07) репод [05-posting-engine](./05-posting-engine.md), [06-sales-receivables](./06-sales-receivables.md), [07-purchases-payables](./07-purchases-payables.md), [08-tax-vat-mn](./08-tax-vat-mn.md), [11-fixed-assets-inventory](./11-fixed-assets-inventory.md) байна; [09-bank-cash-fx](./09-bank-cash-fx.md) зэрэгцэн бичигдэж байна (хяналтын үед бүрэн биш); тайлангийн spec хараахан байхгүй. Модулийн spec golden ID-г (GS-GL, GS-SAL, GS-AR, GS-PUR, GS-AP, GS-VAT) өөрөө оноосон бол тэр ID ба дүн давамгайлна (§0.4 Z8, §12.1). Шинээр бичигдэх spec-тэй §12-ын хүлээгдэх үр дүнг тулгаж, зөрвөл §22-ын журмаар шийднэ.
> **Энэ баримт `db/` болон бусад баримтыг засаагүй.** Схемийн өөрчлөлтийг §20-д, бусад баримтын өөрчлөлтийг §21-д хүсэлт болгон бичсэн.

---

## Агуулга

- [0. Энэ баримтыг хэрхэн унших](#0-энэ-баримтыг-хэрхэн-унших)
- [1. Зорилго ба зарчим](#1-зорилго-ба-зарчим)
- [2. Тестийн пирамид](#2-тестийн-пирамид)
- [3. Хэрэгсэл ба сан](#3-хэрэгсэл-ба-сан)
- [4. Тестийн орчин ба өгөгдөл](#4-тестийн-орчин-ба-өгөгдөл)
- [5. Unit тест](#5-unit-тест)
- [6. Property-based тест (FsCheck)](#6-property-based-тест-fscheck)
- [7. Snapshot тест (Verify)](#7-snapshot-тест-verify)
- [8. DB тест](#8-db-тест)
- [9. Integration тест](#9-integration-тест)
- [10. Contract тест](#10-contract-тест)
- [11. Golden scenario-ийн формат](#11-golden-scenario-ийн-формат)
- [12. Golden scenario-ийн каталог](#12-golden-scenario-ийн-каталог)
- [13. E2E тест (Playwright)](#13-e2e-тест-playwright)
- [14. Гүйцэтгэлийн тест (k6) ба SLO](#14-гүйцэтгэлийн-тест-k6-ба-slo)
- [15. Аюулгүй байдал, тэсвэрлэх чадвар, сэргээлтийн тест](#15-аюулгүй-байдал-тэсвэрлэх-чадвар-сэргээлтийн-тест)
- [16. UAT төлөвлөгөө (пилот нягтлан)](#16-uat-төлөвлөгөө-пилот-нягтлан)
- [17. Чанарын хаалга (quality gates)](#17-чанарын-хаалга-quality-gates)
- [18. Тест бичих дүрэм ба нэршил](#18-тест-бичих-дүрэм-ба-нэршил)
- [19. Тестийн дэд бүтцийн хүлээн авах тест](#19-тестийн-дэд-бүтцийн-хүлээн-авах-тест)
- [20. Schema өөрчлөлтийн хүсэлт](#20-schema-өөрчлөлтийн-хүсэлт)
- [21. Бусад баримт ба starter-т өөрчлөлтийн хүсэлт](#21-бусад-баримт-ба-starter-т-өөрчлөлтийн-хүсэлт)
- [22. Нээлттэй асуулт](#22-нээлттэй-асуулт)
- [Хяналтын тэмдэглэл (Review log)](#хяналтын-тэмдэглэл-review-log)

---

## 0. Энэ баримтыг хэрхэн унших

### 0.1 Хамрах хүрээ

Энэ баримт R1–R2-ийн бүх тестийн давхаргыг тодорхойлно. Үүнд тест тус бүрийн зорилго, хэрэгсэл, ажиллах орчин, тестийн өгөгдөл, гарах шалгуур орно. Мөн дараах зүйлсийг агуулна:

- golden scenario-ийн формат (JSON Schema) ба ажиллуулах алгоритм;
- 120 гаруй golden scenario-ийн каталог (§12);
- DB-ийн түвшний тест (RLS, ledger-ийн өөрчлөгдөхгүй байдал, зэрэгцээ ачаалал дахь завсаргүй дугаарлалт);
- PosAPI-ийн contract тест (mock-оор);
- E2E, гүйцэтгэлийн тест ба SLO-той холбосон босго;
- пилот нягтлангуудтай хийх UAT;
- хувилбар бүрийн чанарын хаалга.

Аюулгүй байдлын тестийн нарийвчилсан жагсаалт [13 §17](./13-security-audit-tenancy.md) (SEC-T-01…21)-д, eBarimt-ийн хүлээн авах тест ба staging-ийн төлөвлөгөө [12 §24–§25](./12-ebarimt-integration.md)-д байна. Энэ баримт тэдгээрийг давтахгүй, харин аль давхаргад, хэзээ, ямар хаалгад ажиллахыг заана.

### 0.2 Нэр томьёо

| Нэр томьёо | Англи | Утга |
|---|---|---|
| Golden scenario | golden scenario | Нягтлан зөвлөхийн гарын үсэгтэй, хүлээгдэх G/L, VAT, дэд дэвтэр, тайлангийн үр дүнтэй тестийн файл. Нягтлан бодох бүртгэлийн зөв байдлын **oracle** (зөв хариуг тодорхойлогч) болно |
| Oracle | test oracle | Тестийн хүлээгдэх үр дүнг хэн/юу тодорхойлдог эх сурвалж |
| Property-based тест | property-based test (PBT) | Санамсаргүй боловч хүчинтэй оролтын олон жишээн дээр invariant (заавал биелэх нөхцөл) биелэхийг шалгах тест |
| Shrinking | shrinking | PBT алдаа олсны дараа тэр алдааг гаргадаг хамгийн жижиг оролтыг хайх |
| Snapshot тест | snapshot (approval) test | Гаралтыг (JSON, текст) баталсан хувилбартай (`*.verified.*`) харьцуулах тест |
| Contract тест | contract test | Хоёр системийн хоорондын хүсэлт/хариуны гэрээг (schema, утга, алдааны хэлбэр) шалгах тест |
| Fault injection | fault injection | Тасалдал, timeout, процесс унах зэрэг алдааг санаатайгаар үүсгэх |
| SUT | system under test | Тестлэгдэж буй систем |
| Чанарын хаалга | quality gate | Дараагийн шат руу (merge, staging, production, pilot, GA) шилжихийн өмнө заавал биелэх шалгуурын багц |
| UAT | user acceptance testing | Бодит хэрэглэгч (пилот нягтлан) бизнесийн урсгалыг шалгаж хүлээн авах тест |
| Parallel run | parallel run | Пилот компани хуучин систем/Excel ба манай системд ижил өгөгдлийг зэрэг хөтөлж, үр дүнг тулгах |
| Flaky тест | flaky test | Код өөрчлөгдөөгүй ч заримдаа унадаг тест |
| SLO | service level objective | [02 §13](./02-architecture.md)-ийн гүйцэтгэл, хүртээмжийн зорилт |

### 0.3 Дүрмийн ба тестийн ID

| Угтвар | Утга | Жишээ |
|---|---|---|
| `TST-<бүлэг>-NN` | Энэ баримтын норматив дүрэм (тоолж шалгаж болно) | `TST-GS-04` |
| `UT-<модуль>-NN` | Unit тест (domain) | `UT-TAX-03` |
| `PBT-NN` | Property-based тест | `PBT-07` |
| `SNAP-NN` | Snapshot тест | `SNAP-02` |
| `DBT-<бүлэг>-NN` | DB-ийн түвшний тест | `DBT-NUM-02` |
| `INT-<бүлэг>-NN` | API + DB + worker integration тест | `INT-IDEM-03` |
| `CT-<систем>-NN` | Contract тест | `CT-POS-04` |
| `GS-<AREA>-NNN` | Golden scenario (§12). `AREA` ∈ `GL`, `VAT`, `SAL`, `AR`, `PUR`, `AP`, `CASH`, `REC`, `FX`, `CLOSE`, `RPT`, `EBR` (R2-т `FA`, `INV` нэмэгдэнэ) | `GS-SAL-001` |
| `E2E-NN` | Playwright E2E | `E2E-04` |
| `PERF-NN` | Гүйцэтгэлийн тест | `PERF-03` |
| `UAT-NN` | Пилотын UAT сценари | `UAT-07` |
| `QG-<хаалга>` | Чанарын хаалга | `QG-RC` |
| `AT-TST-NN` | Тестийн дэд бүтцийн хүлээн авах тест (§19) | `AT-TST-05` |
| `SEC-T-NN`, `AT-SEC-NNN`, `AT-EB-NN`, `AT-UI-NN` | Бусад spec-ийн тест (иш татна) | `SEC-T-03` |

Golden scenario-ийн `AREA` кодууд нь [18 §13.3](./18-dev-setup.md)-ийн жагсаалтыг (`GL`, `SAL`, `PUR`, `CASH`, `FX`, `FA`, `INV`, `VAT`, `EBR`, `CLOSE`) өргөтгөсөн: авлагын тулгалт (`AR`, [06 §11.2](./06-sales-receivables.md)-тэй ижил), өглөгийн тулгалт (`AP`, [07 §11.2](./07-purchases-payables.md)-тэй ижил), банкны хуулгын тулгалт (`REC`) ба тайлан (`RPT`)-ийг нэмсэн.

### 0.4 Баримтуудын зөрүүг шийдсэн байдал

| # | Зөрүү | Шийдвэр (энэ баримтад) | Үндэслэл |
|---|---|---|---|
| Z1 | [02](./02-architecture.md), [18](./18-dev-setup.md)-д `core.*`, `parties`, `cash_bank`, `currency`, `fixed_assets`, `inventory`, `reporting` schema, `integration.outbox_message`, `ebarimt.receipt`, `vend_ledger_entry` гэх мэт нэр байна | Тест, golden scenario, SQL жишээ бүгд каноник нэрийг хэрэглэнэ: `platform.*` (domain, туслах функц), `party`, `bank`, `fx`, `fa`, `inv`, `rpt`, `integration.outbox`, `ebarimt.ebarimt_document`, `party.vendor_ledger_entry`, `party.detailed_vendor_ledger_entry` | D-K1 |
| Z2 | [02 §6.8](./02-architecture.md)-д буцаалтыг "улаан сторно" гэж бичсэн | Буцаалт нь эсрэг тэмдэгтэй, **эсрэг баганад** орно. Сторно байхгүй. Golden scenario-д буцаалтын бичилт нь эх бичилтийн эсрэг талд (Дт ↔ Кт) бичигдэнэ | D-C3, FR-GL-010 AC1 |
| Z3 | [02 §6.9](./02-architecture.md)-д үеийн төлөв `OPEN → SOFT_LOCKED → CLOSED → HARD_LOCKED` | Каноник төлөв: `OPEN`, `CLOSED`, `LOCKED` (`gl.accounting_period`, `gl.fiscal_year`). НӨАТ-ын үе: `OPEN`, `CLOSED`, `SUBMITTED` (`tax.vat_return_period`) | D-D3, D-K1 |
| Z4 | [02 §9.1](./02-architecture.md)-д outbox-ийн төлөв `DISPATCHING`, `SENDING`, `UNKNOWN`… | Каноник: `integration.outbox.status` ∈ `PENDING`, `PROCESSING`, `DONE`, `DEAD`, `CANCELLED`. eBarimt-ийн баримтын төлөв: `ebarimt.ebarimt_document.status` ∈ `PENDING`, `SENT`, `SUCCESS`, `ERROR`, `UNKNOWN`, `CANCELLED` | D-K1, [12 §9](./12-ebarimt-integration.md) |
| Z5 | [18 §13.3](./18-dev-setup.md) golden-ийг YAML гэсэн; энэ даалгавар JSON schema шаардсан | Файлын формат нь **YAML** хэвээр (нягтлан уншихад хялбар). Бүтцийг **JSON Schema (draft 2020-12)** тодорхойлно. YAML-ийг JSON болгоод schema-аар шалгана (§11.6). JSON файлыг ч хүлээн авна | Хоёуланд нийцнэ |
| Z6 | [02 §6.3](./02-architecture.md)-ийн DB role `erp_app`, `erp_owner`; schema-д `app_user`, `app_owner`, `app_worker`, `app_readonly`, `app_rls_bypass` | Тест нь login role (`erp_app`, `erp_worker`, `erp_migrator`, `erp_ops_ro`)-оор холбогдоно. Тэдгээр нь group role-д харгалзана (`erp_app` → `app_user` г.м., `000_extensions_roles.sql`) | D-K1 |
| Z7 | Дансны дугаар: 01-requirements-ийн AC-д "5100" (борлуулалтын орлого) гэж ерөнхийлсөн. Seed-д бараа = 5100, үйлчилгээ = 5110, экспорт = 5120 | Golden scenario seed-ийн дансыг ([seed/README §3, §5](./db/seed/README.md)) яг хэрэглэнэ. Мөр бүрд Gen. Prod. бүлгийг (GOODS/SERVICES) заасан тул орлогын данс тодорхой | Seed бол тестийн oracle-ийн нэг хэсэг |
| Z8 | [05 §11.2](./05-posting-engine.md), [06 §11.2](./06-sales-receivables.md), [07 §11.2](./07-purchases-payables.md) ба [08 §4](./08-tax-vat-mn.md) (BR-ийн "Шалгах" багана, E-TAX-01…12) нь golden ID-г (GS-GL-001…015, GS-SAL-001…012, GS-AR-001…007, GS-PUR-001…012, GS-AP-001…007) өөрсдийн жишээнд оноосон; [08 §11.2](./08-tax-vat-mn.md) нь энэ баримтын GS-VAT-001…012-ийг хүлээн авч, өөрийн E-TAX жишээг тэдгээрийн нэмэлт case болгосон ба GS-VAT-013…022-ийг нэмсэн; жишээ нь шинэ бус counter (`GJ-2026-00042`), өөр master data (`C0001`, `V00007`) ашигладаг | Модулийн spec-ийн ID ба дүнг баримтлана. Энэ баримтын нэмэлт scenario дараагийн дугаар авна (GS-GL-016…020, GS-SAL-013, GS-PUR-013…015, GS-AR-008…009). Тулгалтын AREA нь `AR`, `AP`. Хөрвүүлэх дүрэм: §12.1 | Нэг ID нэг scenario (TST-GS-02); дүнгийн эх сурвалж нэг |

---

## 1. Зорилго ба зарчим

### 1.1 Чанарын зорилт (эрэмбэтэй)

Тестийн хөрөнгө оруулалтын эрэмбэ нь [02 §1.2](./02-architecture.md)-ийн чанарын шинжийн эрэмбийг дагана.

| # | Зорилт | Хэмжүүр | Гол тест |
|---|---|---|---|
| 1 | **Нягтлан бодох бүртгэлийн зөв байдал** — батлагдсан гүйлгээ бүр тэнцсэн, дүн нэг бодлогоор бөөрөнхийлөгдсөн, дэд дэвтэр = хяналтын данс, хуулийн дугаар завсаргүй | Golden 100% давна (NFR-006); тэнцээгүй гүйлгээ 0 (NFR-001, M8); дугаарын завсар 0 (NFR-003, M10); дэд дэвтрийн зөрүү 0 (NFR-005, M9) | GS-*, PBT-01…12, DBT-BAL, DBT-NUM |
| 2 | **Аудитлах чадвар** — ledger өөрчлөгдөхгүй, залруулга зөвхөн буцаалтаар | Ledger-ийг өөрчлөх оролдлого 100% бүтэлгүйтнэ (NFR-050) | DBT-IMM, GS-GL-006 |
| 3 | **Тенантын тусгаарлалт ба нууцлал** | Тенант хоорондын алдагдал 0 (NFR-030); `qrData`/`lottery` хадгалагдах 0 (NFR-041) | DBT-RLS, SEC-T-01…09, CT-POS-05 |
| 4 | **Гадаад интеграцийн найдвартай байдал** | `POST /rest/receipt` давхар илгээх 0; UNKNOWN зөв (D-J2) | CT-POS, INT-OUT, GS-EBR-006 |
| 5 | **Гүйцэтгэл** | [02 §13](./02-architecture.md)-ийн SLO | PERF-01…12 |
| 6 | **Ашиглахад хялбар байдал, хүртээмж** | Onboarding ≤ 1 цаг (M1 пилот); axe 0 зөрчил (NFR-070) | E2E, UAT |

### 1.2 Зарчим

- **TST-P-01. Бодит PostgreSQL.** DB-тэй холбоотой бүх тест бодит PostgreSQL (16/17/18) дээр ажиллана. EF Core InMemory provider, SQLite, DB-ийн mock-ийг хориглоно. Шалтгаан: зөв байдлын ихэнх баталгаа (deferred constraint trigger, RLS, guard trigger, `numeric` бөөрөнхийлөлт) зөвхөн PostgreSQL-д байдаг (P6).
- **TST-P-02. Oracle нь нягтлан.** Posting-ийн хүлээгдэх үр дүнг хөгжүүлэгч биш, нягтлан зөвлөх баталгаажуулна (golden scenario-ийн `signedOffBy`). Хөгжүүлэгч кодын гаралтыг хуулж хүлээгдэх үр дүн болгохыг хориглоно (TST-GS-06).
- **TST-P-03. Хамгаалалт бүрийг тус тусад нь тестлэнэ.** Invariant-ыг код ба DB хоёулаа хамгаалдаг (P1, P6). Тиймээс DB-ийн хамгаалалтыг аппын шалгалтыг тойрч (шууд SQL-ээр) тусад нь тестлэнэ (§8). Аппын шалгалтыг DB-ийн алдааны кодоос өмнө 422 буцааж байгаа эсэхээр тестлэнэ (§9.3).
- **TST-P-04. Тодорхой (deterministic) тест.** Ханын цаг (wall clock), санамсаргүй id, гадны сүлжээ, тестийн дараалалд найдахгүй. `TimeProvider`-ийг `FakeTimeProvider`-оор, бизнесийн огноог `Asia/Ulaanbaatar`-аар тогтооно. Санамсаргүй өгөгдлийн seed-ийг тайланд хэвлэнэ (§4.2).
- **TST-P-05. Ижил кодын зам.** Preview ба post ижил кодоор явдаг тул golden runner post алхам бүрийн өмнө preview хийж, хоёрын бичилтийг дугаараас бусдаар нь харьцуулна ([02 §6.7](./02-architecture.md)).
- **TST-P-06. Алдаа олдвол эхлээд тест.** Production, пилот эсвэл UAT-аас олдсон нягтлан бодох бүртгэлийн алдаа бүр засварын өмнө golden scenario эсвэл property болж нэмэгдэнэ (regression).
- **TST-P-07. Пирамидын доод давхаргад.** Дүрмийг шалгаж чадах хамгийн доод, хурдан давхаргад тестлэнэ (§2.3). E2E нь UI-ийн урсгалыг л шалгана, тооцооллын зөв байдлыг шалгахгүй.
- **TST-P-08. Production өгөгдөл хориотой.** Тест, staging, perf орчинд production өгөгдөл хуулахгүй ([18 §13.4](./18-dev-setup.md)).

### 1.3 Хамрах хүрээнээс гадуур

- PosAPI-ийн өөрийнх нь ачааллын тест (ITC-ийн систем; [12 §25](./12-ebarimt-integration.md) "ачааллын тест хийхгүй").
- Банкны API (R3), QPay (R3), мобайл апп (R3)-ийн тест — тухайн хувилбарт энэ баримтыг өргөтгөнө.
- Хуулийн дүгнэлт (тест нь хуулийн тайлбарыг баталгаажуулахгүй; ⚠ параметрүүдийг [legal-parameters.md](./research/legal-parameters.md) хариуцна).

---

## 2. Тестийн пирамид

### 2.1 Давхарга

```text
                      ┌──────────────┐
                      │  UAT (пилот) │  хүн, 2027-04…06
                    ┌─┴──────────────┴─┐
                    │ E2E (Playwright) │  ~40 урсгал
                  ┌─┴──────────────────┴─┐
                  │ Perf (k6) · Security │  RC / nightly
                ┌─┴──────────────────────┴─┐
                │ Golden scenario (≥ 122)   │  нягтлангийн oracle
              ┌─┴──────────────────────────┴─┐
              │ Integration · Contract (API) │  ~400
            ┌─┴──────────────────────────────┴─┐
            │ DB тест (RLS, immutability, гап)  │  ~250
          ┌─┴──────────────────────────────────┴─┐
          │ Snapshot · Architecture · Property    │  ~60 property
        ┌─┴──────────────────────────────────────┴─┐
        │ Unit (domain, pure)                        │  ~1 500
      ┌─┴──────────────────────────────────────────┴─┐
      │ Static: analyzer ERP0001, BannedSymbols, lint │  build бүрд
      └──────────────────────────────────────────────┘
```

| # | Давхарга | Төсөл / байршил | Хэрэгсэл | Юуг шалгана | Ажиллах | Нэг тестийн хугацаа |
|---|---|---|---|---|---|---|
| L0 | Static | Build | Roslyn analyzer (ERP0001), BannedSymbols, Meziantou, `dotnet format`, ESLint, `tsc`, i18n parity, `oasdiff` | `double`/`float`, нүцгэн `Math.Round`, ханын цаг, API-ийн breaking change | PR | — |
| L1 | Unit | `tests/Unit/Erp.Tests.Unit.csproj` (модуль бүрээр хавтас); `web/` Vitest | xUnit v3, Shouldly, Vitest | Domain-ийн цэвэр функц: `MoneyMath`, `ITaxCalculator`, `IAccountDetermination`, `PostingBuffer`, хуваарилалт, төлөвийн машин, mn-MN формат/parse | PR | ≤ 50 ms |
| L2 | Property-based | `tests/Unit/Properties/**`; DB-тэй property нь `tests/Integration/Properties/**` | FsCheck 3 (`FsCheck.Xunit.v3`) | Invariant: тэнцвэр, хуваарилалт, үлдэгдэл, бөөрөнхийлөлт, eBarimt-ийн нийлбэрийн гинж | PR (цөөн давталт), nightly (олон) | ≤ 2 s (цэвэр), ≤ 60 s (DB) |
| L3 | Architecture | `tests/Architecture/Erp.Tests.Architecture.csproj` | ArchUnitNET | [18 §2.4](./18-dev-setup.md)-ийн 14 дүрэм, [02 §5.4](./02-architecture.md) | PR | — |
| L4 | Snapshot | Unit ба Integration төсөлд | Verify (`Verify.XunitV3`, санал §21) | Posting preview, eBarimt payload, PDF текст, XLSX нүд, OpenAPI | PR | ≤ 1 s |
| L5 | DB | `db/tests/*.sql` (psql) + `tests/Integration/Database/**` | psql, xUnit + Npgsql, Testcontainers | RLS, append-only guard, тэнцвэр, үе, касс, завсаргүй дугаар (зэрэгцээ), каталог | PR | ≤ 5 s; зэрэгцээ тест ≤ 60 s |
| L6 | Integration | `tests/Integration/Erp.Tests.Integration.csproj` | WebApplicationFactory, Testcontainers PostgreSQL, WireMock (PosAPI mock) | API → DB → outbox → worker; idempotency, ETag, алдааны код, эрх | PR (PG 17, 18) | ≤ 3 s |
| L7 | Contract | `tests/Contracts/**` (Integration төслийн дэд хавтас) | JSON Schema шалгагч, WireMock fault, бичигдсэн хариу | PosAPI-ийн хүсэлт/хариуны гэрээ, mock-ийн drift, OpenAPI-тай нийцэх | PR | ≤ 3 s |
| L8 | Golden | `tests/Golden/Erp.Tests.Golden.csproj`, `tests/Golden/Scenarios/**` | Golden runner (§11.8), YamlDotNet | Нягтлангийн баталсан бичилт, тайлан | PR (`golden` job) | ≤ 10 s / scenario |
| L9 | E2E | `tests/E2E` (TypeScript) | Playwright, `@axe-core/playwright` | UI урсгал, хүртээмж, browser storage-д QR үлдэхгүй | main (smoke), nightly (бүрэн) | ≤ 60 s |
| L10 | Гүйцэтгэл | `tests/Perf` (k6 JS) + `tools/Erp.DevTools synth` | k6, Grafana, OTel | [02 §13](./02-architecture.md)-ийн SLO | main (smoke), RC (бүрэн) | 5 мин – 8 цаг |
| L11 | Аюулгүй байдал | [13 §17.2](./13-security-audit-tenancy.md) | CodeQL, ZAP, gitleaks, Grype, Playwright | ASVS L2 | PR / nightly / GA | — |
| L12 | UAT | Staging, пилот production | Хүн + шалгах хуудас | Бизнесийн урсгал, хэрэглэгчийн хүлээлт | Ф2 пилот | — |

### 2.2 Тоон зорилт ба хугацааны төсөв

| Хэмжүүр | R1 пилотын өмнө | R1 GA | R2 |
|---|---|---|---|
| Golden scenario (гарын үсэгтэй) | ≥ 108 (§12-ын R1 бүгд) | ≥ 118 (пилотоос нэмэгдсэн regression орно) | ≥ 145 (R2-ийн 14 + FA, INV) |
| Property | ≥ 20 (PBT-01…22-оос R1-ийнх) | ≥ 25 | ≥ 30 |
| R1-ийн **Must** FR-ийн автомат тестийн хамрах хүрээ | 100% (FR бүрд ≥ 1 тест, AC бүрд ≥ 1 тест) | 100% | R2 Must 100% |
| Domain төслийн мөрийн coverage (`*.Domain`, `GeneralLedger.Application.Posting`, `Tax`) | ≥ 90% мөр, ≥ 85% салаа | ≥ 90/85 | ≥ 90/85 |
| Нийт coverage | ≥ 75% мөр | ≥ 80% | ≥ 80% |
| Mutation score (Stryker.NET, posting/tax/money цөм, §17.3) | ≥ 60% | ≥ 70% | ≥ 75% |

**PR-ийн CI-ийн нийт хугацаа ≤ 15 минут** ([18 §10](./18-dev-setup.md)). Төсөв: build + unit + property + architecture ≤ 6 мин; integration (PG 17 ба 18 зэрэг) ≤ 8 мин; golden ≤ 8 мин (scenario-ууд класс тус бүр тусдаа DB клон дээр зэрэгцэн ажиллана); бусад job зэрэгцээ. Төсөв хэтэрвэл golden ба integration-ийг shard (хэсэглэж) хийнэ. Тестийг алгасахгүй.

### 2.3 Хаана юуг тестлэх вэ

| Дүрмийн төрөл | Үндсэн давхарга | Нэмэлт давхарга | Жишээ |
|---|---|---|---|
| Тооцоолол (бөөрөнхийлөлт, НӨАТ, хуваарилалт, FX) | Unit + Property | Golden | FR-TAX-004 → UT-TAX-01, PBT-02, GS-VAT-001 |
| Дансны тодорхойлолт | Unit (setup-ийн хүснэгтээр) | Golden | FR-SAL-004 → UT-ACD-*, GS-SAL-002 |
| Posting-ийн бүтэн үр дүн (G/L + VAT + дэд дэвтэр + дугаар) | Golden | Snapshot (preview) | GS-* |
| DB-ийн invariant (тэнцвэр, immutability, RLS, үе, касс) | DB тест | Golden-ийн default invariant | DBT-* |
| Зэрэгцээ ачаалал, түгжээ | DB тест (зэрэгцээ) | Perf (PERF-06) | DBT-NUM-02 |
| API-ийн гэрээ (ETag, Idempotency, алдааны код, хуудаслалт) | Integration | Contract (OpenAPI) | INT-IDEM-* |
| Гадаад систем (PosAPI, Монголбанк, банкны файл) | Contract | Integration, staging | CT-POS-* |
| Эрх, тенант | Integration (SEC-T-01, 03, 04) | DB тест | — |
| UI-ийн урсгал, хүртээмж | E2E | Vitest (компонент) | E2E-* |
| Гүйцэтгэл | Perf | DB microbench | PERF-* |
| Бизнесийн хүлээн авалт | UAT | — | UAT-* |

### 2.4 Ажиллах давтамж

| Багц | PR | `main` (merge) | Nightly | RC (`v*` tag-ийн өмнө) |
|---|---|---|---|---|
| Static, unit, architecture, snapshot | ✔ | ✔ | ✔ | ✔ |
| Property (давталт) | ✔ (цэвэр: 200, DB: 25) | ✔ (ижил) | ✔ (10 000 / 500) | ✔ (nightly-ийн сүүлийн үр дүн) |
| DB тест (`db/tests` + C#) | ✔ (PG 17, 18) | ✔ | ✔ (PG 16 нэмэгдэнэ) | ✔ |
| Integration, contract | ✔ (PG 17, 18) | ✔ | ✔ (PG 16) | ✔ |
| Golden (NOW ба 2027 variant) | ✔ | ✔ | ✔ | ✔ |
| Migration (Path A/B, schema diff) | ✔ | ✔ | — | ✔ |
| E2E | — | Smoke (staging deploy-ийн дараа, Chromium) | Бүрэн (Chromium, Firefox, WebKit) + axe | Бүрэн + гар шалгалт |
| Perf | — | PERF-01 smoke (staging) | PERF-02 baseline (долоо хоногт 2 удаа) | PERF-02…09, PERF-11, PERF-12 |
| Mutation (Stryker) | — | — | ✔ (долоо хоног бүр) | Сүүлийн үр дүн |
| ZAP, PII скан, egress | — | — | ✔ | ✔ |
| Restore drill, DR | — | — | Сар бүр / жилд 2 | Сүүлийн үр дүн ≤ 35 хоног |

---

## 3. Хэрэгсэл ба сан

### 3.1 .NET (хувилбарыг [`starter/Directory.Packages.props`](./starter/Directory.Packages.props) тогтооно)

| Хэрэгсэл | Хувилбар | Лиценз | Хэрэглээ |
|---|---|---|---|
| `xunit.v3` (Microsoft Testing Platform) | 4.0.1 | Apache-2.0 | Бүх .NET тест |
| `Shouldly` | 4.3.0 | BSD | Assertion. FluentAssertions v8+ хориотой (TA-16) |
| `FsCheck.Xunit.v3` | 3.4.0 | BSD-3-Clause | Property-based тест |
| `Testcontainers.PostgreSql` | 4.15.0 | MIT | PostgreSQL контейнер |
| `TngTech.ArchUnitNET.xUnitV3` | 0.13.4 | Apache-2.0 | Architecture тест |
| `Microsoft.AspNetCore.Mvc.Testing` | 10.0.12 | MIT | WebApplicationFactory |
| `Microsoft.Extensions.TimeProvider.Testing` | 10.10.0 | MIT | `FakeTimeProvider` |
| `Microsoft.Testing.Extensions.CodeCoverage` | 18.12.0 | MIT | Coverage (Cobertura) |
| `YamlDotNet` | 18.1.0 | MIT | Golden YAML унших |
| **Санал:** `Verify.XunitV3` | 2026-д хамгийн сүүлийн | MIT | Snapshot (§7) |
| **Санал:** `JsonSchema.Net` | хамгийн сүүлийн | MIT | Golden schema ба PosAPI contract шалгах |
| **Санал:** `WireMock.Net` (эсвэл `wiremock/wiremock` Docker image Testcontainers-ээр) | хамгийн сүүлийн | Apache-2.0 | PosAPI mock (fault injection) |
| **Санал:** `dotnet-stryker` (Stryker.NET, dotnet tool) | хамгийн сүүлийн | Apache-2.0 | Mutation тест (§17.3) |

Санал болгосон багцыг `Directory.Packages.props` ба `.config/dotnet-tools.json`-д нэмэхийг §21-д хүссэн (starter-ийг энэ баримт засаагүй).

### 3.2 Frontend ба E2E

| Хэрэгсэл | Лиценз | Хэрэглээ |
|---|---|---|
| Vitest | MIT | Компонент, formatter/parser ([15](./15-ui-ux.md) AT-UI-28…34) |
| `fast-check` (санал) | MIT | TypeScript property тест (mn-MN parse ↔ format) |
| `@playwright/test` | Apache-2.0 | E2E (Chromium, Firefox, WebKit; NFR-080) |
| `@axe-core/playwright` | **MPL-2.0** | Хүртээмжийн автомат шалгалт (NFR-070). Зөвхөн dev хэрэгсэл, бүтээгдэхүүнд орохгүй; лицензийн allow-list-д dev-only үл хамаарах зүйл болгож бүртгэнэ (§22 Q7) |

### 3.3 Ачаалал ба хэмжилт

| Хэрэгсэл | Лиценз | Хэрэглээ |
|---|---|---|
| Grafana k6 | AGPL-3.0 (зөвхөн хэрэгсэл, бүтээгдэхүүнд түгээхгүй; [02 §15](./02-architecture.md)) | HTTP ачааллын тест, `thresholds` |
| OpenTelemetry + Prometheus/Tempo/Grafana | Apache-2.0 / AGPL (ops стек) | Серверийн талын хэмжилт (SLO-г серверийн хугацаагаар) |
| `pg_stat_statements`, `auto_explain` | PostgreSQL | Perf үеийн query шинжилгээ |
| `pgbench` | PostgreSQL | Posting-ийн түгжээний microbench (сонголттой) |

---

## 4. Тестийн орчин ба өгөгдөл

### 4.1 PostgresFixture ба DB клон

[18 §10](./18-dev-setup.md)-ийн "Тестийн DB стратеги"-ийг мөрдөнө:

1. `ERP_TEST_PG_ADMIN` тохируулагдсан бол тэр серверийг, эс бөгөөс Testcontainers-ээр `ERP_TEST_PG_IMAGE` (default `postgres:17`)-ийг асаана. CI матриц: PG 17, 18 (PR); PG 16 (nightly).
2. Run бүрд нэг удаа `erp_tpl_<run>` template DB-д: `db/init/01-roles.sql` → migration (`Erp.Migrator migrate`) → `legal_parameters.sql` → `mn_*.sql` seed (глобал каталог ба `platform.fn_provision_company_mn` функц).
3. Тест класс бүрд `CREATE DATABASE … TEMPLATE erp_tpl_<run>`. Golden scenario бүр **өөрийн** клон DB-тэй (scenario хооронд өгөгдөл хуваалцахгүй; `extends`-ийг §11.3-аас үз).
4. Холболтын role: бизнесийн тест `erp_app` (`app_user`), worker-ийн тест `erp_worker` (`app_worker`), guard-ийн тест `erp_migrator` → `SET ROLE app_owner` (FORCE RLS эзэмшигчид ч үйлчилнэ), каталогийн тест bootstrap superuser (зөвхөн унших).
5. xUnit-ийн зэрэгцээ ажиллагаа класс тус бүрээр (DB тусдаа учир аюулгүй).

### 4.2 Тодорхой (deterministic) байдлын дүрэм

- **TST-DET-01.** Аппын код цагийг зөвхөн `TimeProvider`-оос авна (`DateTime.Now`, `DateTimeOffset.UtcNow`-ийг BannedSymbols хориглодог). Тестэд `FakeTimeProvider`; golden scenario-д алхам бүрийн `at` утгаар тохируулна.
- **TST-DET-02.** Бизнесийн огноо = `Asia/Ulaanbaatar`-ын огноо. Тест UTC-ийн шөнө дунд (УБ-ын 08:00)-ыг дамнасан тохиолдлыг тусгайлан агуулна (UT-PLT-04: `billIdSuffix`, бизнесийн өдөр).
- **TST-DET-03.** Тестийн id: `TestIds.For("C1")` нь нэрнээс тогтмол UUIDv7 үүсгэнэ (хувилбар/variant битүүд зөв, timestamp хэсэг = тогтмол epoch + нэрийн hash). Тестийн гаралт ба snapshot тогтвортой байна.
- **TST-DET-04.** FsCheck-ийн seed-ийг алдааны мессежид `Replay = "(seed, gamma, size)"` хэлбэрээр хэвлэнэ. Ижил seed-ээр локалд дахин гаргана. Nightly-д олдсон алдаатай seed-ийг тогтмол regression тест болгон нэмнэ (`[Property(Replay = "…")]`).
- **TST-DET-05.** DB-ийн `now()` (`created_at`) нь бодит цаг хэвээр байна. `fn_gl_entry_before_insert`-ийн "ижил DB transaction" шалгалт (`created_at = now()`) зөв ажиллахын тулд DB-ийн цагийг хуурамчаар солихгүй. Golden-ийн хүлээгдэх үр дүн `created_at`-ийг шалгахгүй.
- **TST-DET-07. Provisioning-ийн огноо.** `platform.fn_provision_company_mn` нь НӨАТ-ын setup-ийн хувийг `greatest(DB-ийн өнөөдөр, санхүүгийн жилийн 01-01)`-ний байдлаарх параметрээр (`v_as_of`) үүсгэдэг. Тиймээс ижил golden 2026 ба 2028 онд ажиллахад өөр setup авч болзошгүй (бодит цагаас хамаарсан, TST-P-04-ийг зөрчинө). §20 SCR-T06 хэрэгжих хүртэл runner provisioning-ийн дараа `fn_provision_company_mn`-ийн хариуны `rates_as_of`-ийг тайланд хэвлэж, setup-ийн хувийг baseline-ийн утгатай (VAT10 = 10) тулгана; зөрвөл `GS-E004`.
- **TST-DET-06.** Тест сүлжээгээр гадагш (интернэт) хандахгүй. PosAPI, Монголбанк, `api.ebarimt.mn`-ийн оронд WireMock. CI-ийн integration job egress-гүй ажиллана (Testcontainers-ийн дотоод сүлжээ).

### 4.3 Тестийн өгөгдөл

| Төрөл | Хаана | Хэрхэн |
|---|---|---|
| Builder | `src/BuildingBlocks/Erp.BuildingBlocks.Testing/Builders` | `TestData.SalesInvoice().For(customer).WithLine(item, qty: "2", price: "11000").PricesIncludingVat()` — мөнгийг string-ээр (decimal parse), `double` хэзээ ч үгүй |
| MN seed | `db/seed/mn_*.sql`, `platform.fn_provision_company_mn` | Integration ба golden тест компанийг **бодит seed**-ээр provision хийнэ. Ингэснээр seed-ийн өөрчлөлт (данс, posting setup, НӨАТ) golden-оор баригдана |
| Golden baseline | §12.1 (`BASE-VAT`, `BASE-NONVAT`) | Scenario-ийн `setup` нь baseline-аас эхэлж, зөвхөн ялгааг бичнэ |
| Демо tenant | `db/seed/demo` ([18 §13.2](./18-dev-setup.md)) | E2E ба staging; golden-д хэрэглэхгүй |
| Synthetic (perf) | `tools/Erp.DevTools synth` (§14.3) | Тогтмол seed-тэй generator; posting engine-ээр (ledger-т шууд INSERT хийхгүй) |

**TST-DATA-01.** Тестийн өгөгдөл ledger хүснэгтэд (`gl.gl_entry`, `tax.vat_entry`, `party.*_ledger_entry`, `party.detailed_*`, `bank.bank_ledger_entry`) шууд INSERT хийхгүй. Зөвхөн posting engine-ээр бичнэ ([18 §2.4](./18-dev-setup.md) №5). Үл хамаарах зүйл: DB guard-ийн тест (§8), тэр нь guard **барьж байгааг** шалгахын тулд санаатай буруу INSERT хийнэ.

### 4.4 PosAPI mock

- Локал ба CI: WireMock ([`starter/deploy/posapi-mock/mappings`](./starter/deploy/posapi-mock/mappings)), `:7080`.
- Мерчантын ТТД-ээр зан төлөв сонгоно:

| ТТД | Зан төлөв | Эх |
|---|---|---|
| `37900846788` (мөн доорх fault-ийн жагсаалтад ороогүй **бүх** ТТД; mapping-ийн `priority: 10` анхдагч хариу) | `POST /rest/receipt` → 200 SUCCESS (`qrData`/`lottery` = `QR-CANARY-…`/`LOTTERY-CANARY-…`) | `receipt-post-success.json` |
| `99999999901` | 40 s хүлээгээд хариулна (adapter-ийн timeout 20 s → UNKNOWN) | `receipt-post-timeout.json` |
| `99999999902` | 400 ERROR (баталгаажуулалтын алдаа) | `receipt-post-rejected.json` |
| `99999999903` *(санал)* | Хүсэлтийг хүлээн аваад холболтыг хариугүй хаана (WireMock fault `EMPTY_RESPONSE`) | §21 CR-T03 |
| `99999999904` *(санал)* | `CONNECTION_RESET_BY_PEER` | §21 CR-T03 |
| `99999999905` *(санал)* | HTTP 502, HTML body (proxy-ийн хариу) | §21 CR-T03 |
| `99999999906` *(санал)* | 200 SUCCESS боловч `totalAmount` илгээснээс 0.01-ээр зөрүүтэй (AT-EB-42) | §21 CR-T03 |
| `99999999907` *(санал)* | 200, JSON задрахгүй (`MALFORMED_RESPONSE_CHUNK`) | §21 CR-T03 |

- Integration тест mock-ийн хүлээн авсан хүсэлтийн тоог `GET /__admin/requests`-ээр (эсвэл WireMock.Net-ийн `LogEntries`) шалгана.
- Тест бүр mock-ийн журналыг цэвэрлэж (`DELETE /__admin/requests`) эхэлнэ.

### 4.5 Production өгөгдөл ба PII

- **TST-DATA-02.** Тест, golden, perf, E2E-ийн өгөгдөл бүгд зохиомол. Хувь хүний регистр зөвхөн canary хэлбэрээр (`УБ99887766`) ба зөвхөн SEC-T-08/09-д хэрэглэгдэнэ.
- **TST-DATA-03.** Пилотын алдааг давтан гаргахдаа `tools/Erp.DevTools anonymize`-ийн журмыг ([18 §13.4](./18-dev-setup.md)) мөрдөнө. Нэргүйжүүлсэн өгөгдлөөс golden scenario үүсгэвэл зөвхөн дүн ба бүтцийг хуулна. Нэр, ТТД, банкны дансыг зохиомол утгаар солино.

---

## 5. Unit тест

Unit тест нь DB, сүлжээ, файлгүй, цэвэр domain логикийг шалгана. Posting-ийн угсралт (`PostingDocument`) нь Application давхаргын **цэвэр функц** тул ([02 §6.1](./02-architecture.md)) ихэнх нягтлан бодох бүртгэлийн дүрмийг энд хурдан шалгана.

**Дүрэм:**

- **TST-UT-01.** Мөнгөний утгыг тестэд string-ээс (`decimal.Parse(…, CultureInfo.InvariantCulture)`) эсвэл `m` дагавартай literal-аар үүсгэнэ. Харьцуулалт яг тэнцүү (`ShouldBe(1000.01m)`). Tolerance хэрэглэхгүй ([18 §4.2](./18-dev-setup.md) №9).
- **TST-UT-02.** Бөөрөнхийлөлтийн tie тохиолдол заавал: `MoneyMath.Round(2.345m, 2) = 2.35`, `Round(-2.345m, 2) = -2.35`, `Round(2.355m, 2) = 2.36`, `Round(0.005m, 2) = 0.01`, `Round(-0.005m, 2) = -0.01`, `Round(1000.005m, 2) = 1000.01`.
- **TST-UT-03.** Domain-ийн шалгалт бүх алдааг цуглуулж буцаадаг тул (FR-GL-008), алдаатай оролтын тест алдааны **жагсаалтыг бүтнээр** нь шалгана (зөвхөн эхнийхийг биш).
- **TST-UT-04.** Хүснэгтэн өгөгдөлтэй тест (`[Theory]` + `[MemberData]`) нь [01-requirements](./01-requirements.md)-ийн AC-ийн жишээний тоог яг ашиглана. Тестийн нэрэнд FR/AC-г заана (§18).

**Гол unit тестийн бүлэг (заавал):**

| ID | Объект | Шалгах (жишээ) | Эх |
|---|---|---|---|
| UT-MON-01…10 | `MoneyMath`, `Money`, `DecimalStringJsonConverter` | TST-UT-02; JSON `"12345.6"`, `"-15.25"`, `"0"`; exponent ба мянгатын тусгаарлагч татгалзах; number ирвэл 400 | ADR-0006, [18 §4.2](./18-dev-setup.md) |
| UT-TAX-01…20 | `ITaxCalculator.ComputeDocument` | FR-TAX-004 AC1 (30.02; 10.01/10.00/10.01); FR-TAX-005 AC2 (4 272.09; 3 000.00/1 272.09); сөрөг мөрийн бүлэг (FR-TAX-006); VAT0/EXEMPT-д НӨАТ 0; `vat_rounding_type` UP/DOWN; НӨАТ төлөгч бус компани (D-E5) | D-E3, R-VAT-08…12 |
| UT-ACD-01…15 | `IAccountDetermination` | (DOMESTIC, SERVICES) → 5110; `*` fallback (FR-SAL-004 AC1); дутуу мөр → алдааны код нь дутуу хосыг нэрлэнэ; хаагдсан/блоклогдсон данс | D-F1 |
| UT-PST-01…15 | `PostingBuffer`, `PostingDocument` угсралт, урьдчилсан шалгалт | Ижил түлхүүртэй мөр нэгтгэгдэх (FR-SAL-004 AC2); Σ = 0; бүх мөр 0.01-ээр бөөрөнхийлсөн; харилцагч 2 өөр VAT-тай ваучер татгалзах (R-GL-POSTING-24) | [02 §6.2](./02-architecture.md) |
| UT-ALC-01…05 | Running remainder хуваарилагч | 6 000 / 4 000 ба −1 000 → 5 400 / 3 600 (FR-SAL-016 AC1); 0 жинтэй мөр; нэг мөр | D-E3 |
| UT-FX-01…08 | FCY→LCY хуримтлагдсан хөрвүүлэлт (R2) | FR-FX-004 AC1: 34 539.51 + 34 539.50 = 69 079.01 | ADR-0006 |
| UT-SM-01…10 | Төлөвийн машин: үе, НӨАТ-ын үе, eBarimt баримт, outbox, баримтын API төлөв | Зөвшөөрөгдсөн/хориотой шилжилт бүр | [03 §6](./03-domain-model.md), [12 §9](./12-ebarimt-integration.md) |
| UT-EBR-01…20 | eBarimt payload угсрагч ба илгээхийн өмнөх шалгалт | [12 §6.2](./12-ebarimt-integration.md): мөр хуваах (AT-EB-09), сөрөг мөр шингээх (AT-EB-10), `taxType`-аар дэд баримт, `billIdSuffix` формат `^[0-9]{9}$` (VAL-28); VAL-09 (`VAT_ABLE`-аас бусад мөрөнд `taxProductCode`); VAL-11-ийн хамгаалалт: `vat_payer = false` мерчантын хүсэлтэд `VAT_ABLE`/`VAT_ZERO` мөр **гараар угсарч** өгөхөд `ebarimt.vat_on_non_vat_payer` (engine BR-TAX-55-аар ийм мөр үүсгэдэггүй тул энэ шалгалтыг golden биш, unit-аар шалгана) | [12](./12-ebarimt-integration.md) |
| UT-PLT-01…06 | Дугаарын формат, бизнесийн огноо | `PREFIX-YYYY-#####`; УБ-ын шөнө дунд | D-C7, D-K4 |
| UT-AGE-01…05 | Насжилтын бүлэг | FR-RPT-004 AC1-ийн 4 хил | D-F7 |
| UT-RPT-01…05 | e-balance мянгаар бөөрөнхийлөх | FR-RPT-013 AC1/AC2 | D-C2 |
| UT-WEB-* (Vitest) | `formatMoney`, `parseMoney` (mn-MN) | `1 234 567,89` ↔ `"1234567.89"`; хоосон зай/NBSP; сөрөг; AT-UI-28…34 | [15 §7](./15-ui-ux.md) |

---

## 6. Property-based тест (FsCheck)

### 6.1 Дүрэм

- **TST-PBT-01.** Property бүр **invariant**-ыг (INV-xx, NFR, D-xx) иш татна. Тестийн нэр: `PBT_07_Remaining_equals_sum_of_detailed`.
- **TST-PBT-02.** Generator зөвхөн **хүчинтэй** domain утга үүсгэнэ: MNT дүн 0.01 нарийвчлалтай, тоо хэмжээ ≤ 5 бутархай орон, нэгжийн үнэ ≤ 6 орон, ханш ≤ 18 орон ба `(0, 1e10)` (D-C1). Хүчингүй оролтыг тусдаа сөрөг property-оор (`invalid → rejected`) шалгана.
- **TST-PBT-03.** Generator нь хилийн утга руу **хазайлттай** байна: `.005`-ийн tie, 0.01, 0.99, том дүн (≤ 10^13), олон мөр (1…500), бүх мөр ижил, нэг мөр маш том бусад нь жижиг, сөрөг мөр (хөнгөлөлт).
- **TST-PBT-04.** Давталтын тоо: цэвэр property PR-д 200, nightly-д 10 000. DB-тэй property PR-д 25, nightly-д 500. Shrinking асаалттай. Хугацааны хязгаар: цэвэр property ≤ 2 s (PR), DB-тэй ≤ 60 s.
- **TST-PBT-05.** DB-тэй property нэг DB клон дээр ажиллах бөгөөд давталт бүр **шинэ компани** үүсгэнэ (`fn_provision_company_mn`), эсвэл transaction-ийг ROLLBACK хийнэ. Ингэснээр давталтууд хоорондоо нөлөөлөхгүй.
- **TST-PBT-06.** Model-based (state machine) property нь бодит системийн төлөвийг энгийн загвартай (in-memory model) алхам бүрд харьцуулна.

### 6.2 Property-ийн каталог

| ID | Property (invariant) | Generator | Давхарга | Эх |
|---|---|---|---|---|
| PBT-01 | Дурын хүчинтэй баримтаас угсарсан `PostingDocument`-ийн Σ `AmountLcy` = 0, бүх мөр `= round(x, 2)`, ≥ 2 мөр | Санамсаргүй борлуулалт/худалдан авалт/журнал/касс: 1…500 мөр, НӨАТ-ын ангилал холимог, үнэ НӨАТ-тэй/гүй, хөнгөлөлт | Цэвэр | INV-01, D-C5, NFR-001 |
| PBT-02 | (а) Бүлэг (VAT identifier × тооцооны төрөл × **тэмдэг**, [08 BR-TAX-18](./08-tax-vat-mn.md)) бүрд Σ мөрийн НӨАТ = бүлгийн НӨАТ яг; мөр бүрийн НӨАТ нь бүлгийн НӨАТ-ын пропорциональ хувиас < 0.01-ээр зөрнө. (б) VAT identifier бүрд (эерэг ба сөрөг бүлгийн нийлбэр, сөрөг бүлгийн carry-тай) Σ НӨАТ = `round(Σ цэвэр суурь × r/100, 2)` (үнэ НӨАТ-гүй) эсвэл `round(Σ gross × r/(100+r), 2)` (НӨАТ-тэй; NEAREST). Анхаар: эерэг бүлгийн НӨАТ дангаараа `round(Σ⁺ × r)`-тэй тэнцэхгүй байж болно (06 жишээ 6-C: 100.00, 100.01 биш) | Мөрүүд 1…200, дүн ±0.01…10^9 (сөрөг мөр ≤ 20 %) | Цэвэр | D-E3, FR-TAX-004, FR-TAX-006 |
| PBT-03 | Үнэ НӨАТ-тэй үед суурь + НӨАТ = gross яг; суурь ≥ 0, НӨАТ ≥ 0 эерэг мөрд | Gross 0.01…10^9 | Цэвэр | FR-TAX-005 |
| PBT-04 | Running remainder хуваарилалт: Σ хэсэг = нийт яг; хэсэг бүр `abs(хэсэг − нийт × жин / Σжин) < 0.01`; жин 0 → хэсэг 0 | Нийт ±, жин 0…10^9 | Цэвэр | D-E3, FR-SAL-016 |
| PBT-05 | Posting + буцаалт → данс бүрийн цэвэр дүн 0, VAT entry-ийн суурь ба дүнгийн Σ 0, банкны entry-ийн Σ 0; буцаалтын мөр бүр эх мөрийн эсрэг баганад (D-C3) | Санамсаргүй журналын ваучер (G/L, мөнгөний данс, VAT-тай мөр) | DB | FR-GL-013, D-C3, INV-03 |
| PBT-06 | Дурын posting-ийн дараалалд гүйлгээ балансын Σ дебит = Σ кредит (эхний, гүйлгээний, эцсийн багана бүрд) | 1…50 баримтын санамсаргүй дараалал | DB | FR-RPT-001 AC1, NFR-001 |
| PBT-07 | Тулгалт/unapply-ийн дурын дараалалд: `remaining_amount = Σ detailed.amount`; `open ⇔ remaining ≠ 0`; `sign(remaining) = sign(amount)` эсвэл 0; `abs(remaining) ≤ abs(amount)`; харилцагчийн Σ detailed (LCY) = хяналтын дансны G/L (`party.v_receivables_reconciliation.difference = 0`) | Model-based: нэхэмжлэх, төлбөр, кредит нот, apply (тодорхой/ID-аар), unapply (LIFO), урьдчилгаа | DB | INV-04, INV-11, INV-26, D-F3 |
| PBT-08 | Apply → unapply хийхэд entry бүрийн `remaining_amount`, `open` нь apply-ийн өмнөх төлөвтэй яг адил; G/L-д MNT-д шинэ мөр 0 | PBT-07-ийн дэд олонлог | DB | FR-PTY-011 |
| PBT-09 | Applies-to ID-ийн анхдагч хуваарилалт: нийт тулгасан = `min(abs(төлбөр), Σ abs(үлдэгдэл))`; төлөх огноо эртийнх нь эхэлж хаагдана | Нэхэмжлэх 1…20, төлөх огноо санамсаргүй | Цэвэр | FR-PTY-010 |
| PBT-10 | eBarimt-ийн нийлбэрийн гинж: item бүр `qty × unitPrice = totalAmount` (0.01); Σ items = дэд баримт = толгой = Σ payments; Σ items.totalVAT = баримтын НӨАТ = ledger-ийн НӨАТ (AMT-05) | PBT-01-ийн борлуулалтын баримт + POS тохиргоо | Цэвэр | D-E3, [12 §6](./12-ebarimt-integration.md) |
| PBT-11 | FX (R2): мөрүүдийн Σ LCY = `round(Σ FCY × rate, 2)`; мөр бүр `abs(LCY_i − FCY_i × rate) ≤ 0.01` | Ханш 0.0001…10^5 (18 орон), мөр 1…100 | Цэвэр | ADR-0006, FR-FX-004 |
| PBT-12 | FX (R2): бүрэн төлөгдсөн валютын баримтад Σ(хэрэгжээгүй + хэрэгжсэн ханшийн зөрүү) = `FCY × (rate_төлбөр − rate_нэхэмжлэх)` (бөөрөнхийллийн 0.01 дотор) | Ханшийн дараалал, 0…3 дахин үнэлгээ | DB | FR-FX-007, FR-FX-008 |
| PBT-13 | Мөнгөний JSON: `decimal → string → decimal` адил; string regex `^-?(0\|[1-9]\d{0,14})(\.\d{1,18})?$`; exponent байхгүй | `decimal` дурын (scale 0…18) | Цэвэр | [18 §4.2](./18-dev-setup.md) №11 |
| PBT-14 | `MoneyMath.Round(x, 2)` = PostgreSQL `round(x::numeric, 2)` | ±10^14 хүртэлх, 0…10 бутархай орон, tie-д хазайлттай | DB | ADR-0006 |
| PBT-15 | Дугаарлалтын загвар: санамсаргүй commit/rollback/алдааны дараалалд олгогдсон хуулийн дугаар `1..K` завсаргүй, давхардалгүй (K = commit хийгдсэн тоо) | Model-based, дан урсгал (зэрэгцээг DBT-NUM-02 хариуцна) | DB | INV-08, D-C7 |
| PBT-16 | Dimension set: ижил утгын олонлог (дараалал хамааралгүй) → ижил `dimension_set_id`; өөр → өөр; хоосон → 0 | 0…5 dimension, утга 1…20 | DB | INV-10, ADR-0010 |
| PBT-17 | Үеийн төлөвийн машин (model-based): `OPEN ↔ CLOSED → LOCKED`; LOCKED-аас гарах шилжилт бүр `ERP02`; posting зөвхөн OPEN-д (хаалтын ваучер CLOSED-д ч) | Үйлдлийн санамсаргүй дараалал | DB | INV-06, D-D3 |
| PBT-18 | eBarimt баримтын төлөвийн машин: зөвшөөрөгдөөгүй шилжилт хориотой; ДДТД нэг л удаа олгогдоно; `SUCCESS → CANCELLED`-аас бусад эцсийн төлөвөөс гарахгүй | Үйлдлийн санамсаргүй дараалал | DB | INV-13, [12 §9](./12-ebarimt-integration.md) |
| PBT-19 | Насжилт: нээлттэй item бүр яг нэг бүлэгт орно; Σ бүлэг = огноо D хүртэлх Σ үлдэгдэл | Нэхэмжлэх/төлбөр, D санамсаргүй | DB | D-F7, FR-RPT-004 |
| PBT-20 | e-balance-ийн мянгаар бөөрөнхийлөлт: Σ бөөрөнхийлсөн мөр + зөрүүний мөр = бөөрөнхийлсөн нийт; Хөрөнгө = Өр + Өмч бөөрөнхийлсний дараа ч (зөрүүний мөртэй) | Мөрийн утга ±10^12 | Цэвэр | FR-RPT-013 |
| PBT-21 | Idempotency: ижил `Idempotency-Key`-ээр N (2…10) удаа, зэрэг ба дараалан илгээхэд нэг л posting; 2xx хариу бүр ижил (`Idempotent-Replayed: true`-аас бусад); зэрэг хүсэлт `lock_timeout` (5 s)-оос удаан хүлээвэл зөвхөн `409 api.idempotency_in_progress` + `Retry-After: 1` зөвшөөрөгдөнө ([14 API-IDEM-07](./14-api.md)) | Зэрэг хүсэлтийн тоо, хоцрол | DB + API | NFR-004, D-I1 |
| PBT-22 | mn-MN формат ↔ parse (TypeScript, fast-check): `parse(format(x)) = x` | `Money` string | Vitest | [15 §7](./15-ui-ux.md) |

### 6.3 Generator-ийн дүрэм

```csharp
// Erp.BuildingBlocks.Testing/Generators/MoneyGen.cs (санал болгох бүтэц)
public static class MoneyGen
{
    // MNT amount with exactly 2 decimals, biased to ties and boundaries.
    public static Gen<decimal> Mnt(decimal max = 1_000_000_000m) =>
        Gen.Frequency(
            (6, Gen.Choose(1, int.MaxValue).Select(i => (decimal)(i % 100_000_000) / 100m)),
            (2, Gen.Elements(0.01m, 0.99m, 1m, 100.05m, 1000.005m /* rounded later */, 9_999_999_999.99m)),
            (2, Gen.Choose(1, 99).Select(c => c / 100m + 0.005m)))      // tie source for VAT/discount math
        .Select(v => MoneyMath.Round(Math.Min(v, max), 2));

    public static Gen<decimal> Qty() =>                                   // numeric(19,5)
        Gen.Choose(1, 1_000_000).Select(i => i / 1000m)
           .Select(q => MoneyMath.Round(q, 5));

    public static Gen<decimal> UnitPrice() =>                             // numeric(19,6): up to 6 decimals
        from whole in Gen.Choose(0, 10_000_000)
        from frac  in Gen.Choose(0, 999_999)
        where whole > 0 || frac > 0
        select whole + frac / 1_000_000m;
}
```

`Gen<SalesDocumentDraft>` нь seed-ийн бодит Gen. Prod. ба VAT Prod. бүлгээс (`GOODS`, `SERVICES`, `MISC` × `VAT10`, `VAT0`, `EXEMPT`, `NOVAT`) сонгоно. Ингэснээр generator хүчингүй хос үүсгэхгүй.

### 6.4 Жишээ: PBT-02

```csharp
[Property(MaxTest = 200, Arbitrary = new[] { typeof(TaxArbitraries) })]
public Property PBT_02_Line_vat_sums_to_group_vat(NonEmptyArray<TaxLine> lines, bool pricesIncludingVat)
{
    var result = TaxCalculator.ComputeDocument(lines.Get, rate: 10m, pricesIncludingVat, VatRounding.Nearest);

    // (a) per sign group (BR-TAX-18): allocation is exact and proportional
    var perGroup = result.Groups.All(g =>
        g.Lines.Sum(l => l.VatAmount) == g.VatAmount &&                                   // exact
        g.Lines.All(l => Math.Abs(l.VatAmount - g.VatAmount * l.Weight / g.TotalWeight) < 0.01m));

    // (b) per VAT identifier (negative + positive group, carry included): one rounding of the net amount
    var perIdentifier = result.Groups.GroupBy(g => g.VatIdentifier).All(id =>
        id.Sum(g => g.VatAmount) == (pricesIncludingVat
            ? MoneyMath.Round(id.SelectMany(g => g.Lines).Sum(l => l.Gross) * 10m / 110m, 2)
            : MoneyMath.Round(id.SelectMany(g => g.Lines).Sum(l => l.Base) * 0.10m, 2)));

    return (perGroup && perIdentifier).Label("seed-replay: see test output");
}
```

---

## 7. Snapshot тест (Verify)

Snapshot тест нь **бүтцийн** өөрчлөлтийг илрүүлнэ. Нягтлан бодох бүртгэлийн oracle нь golden scenario хэвээр (snapshot нь golden-ийг орлохгүй).

| ID | Юуг snapshot хийх | Scrubber (тогтворгүй утгыг солих) | Хэн батлах |
|---|---|---|---|
| SNAP-01 | `POST …:preview`-ийн хариу (G/L, VAT, дэд дэвтрийн мөр) — golden-ийн 10 сонгосон scenario | UUID → `Guid_1…`; `***` дугаар хэвээр; огноо хэвээр (FakeTimeProvider) | `ledger-owners` |
| SNAP-02 | eBarimt `POST /rest/receipt`-ийн хүсэлтийн JSON (canonical) — [12 §22](./12-ebarimt-integration.md)-ийн жишээ A–G | `billIdSuffix` хэвээр, ДДТД (`inactiveId`) → `DDTD_1…` | `ebarimt-owners` |
| SNAP-03 | PDF-ээс задалсан текст: ТМ-1 нэхэмжлэх, МХ-1, МХ-2, Маягт А (СБТ, ОДТ), гүйлгээ баланс | Үүсгэсэн огноо/цаг, QR-ийн байрлалын тэмдэг | `reporting` + нягтлан зөвлөх |
| SNAP-04 | XLSX экспортын нүдний утга ба төрөл (тоон нүд = number; FR-RPT-014) | — | `reporting` |
| SNAP-05 | OpenAPI (`web/src/shared/api/openapi.json`) — build-ийн drift шалгалттай давхардахгүйн тулд зөвхөн ProblemDetails жишээнүүд | — | API owner |
| SNAP-06 | TT-03а туслах тайлан ба ТТ-03а-5/6 экспортын мөр (FR-TAX-014) | — | `tax-owners` |

**Дүрэм:**

- **TST-SNAP-01.** `*.verified.*` файлыг git-д хадгална. `*.received.*` файлыг CI artifact болгоно, commit хийхгүй.
- **TST-SNAP-02.** Verified файлын өөрчлөлт CODEOWNERS-ийн заасан эзний review шаардана (`tests/**/Snapshots/Posting/**` → `ledger-owners`).
- **TST-SNAP-03.** Snapshot-д `qrData`, `lottery`, PII байж болохгүй. CI нь `*.verified.*` файлаас `QR-CANARY`, `LOTTERY-CANARY` болон регистрийн regex-ийг хайж олдвол унана.
- **TST-SNAP-04.** CI-д `VerifierSettings.AutoVerify` хэзээ ч асахгүй.

---

## 8. DB тест

DB бол хамгаалалтын сүүлийн шугам (P6). Тиймээс DB-ийн хамгаалалт бүрийг **аппын кодыг тойрч**, шууд SQL-ээр шалгана.

### 8.1 Одоо байгаа SQL тестүүд

| Файл | Агуулга | CI-д |
|---|---|---|
| [`db/tests/catalog_checks.sql`](./db/tests/catalog_checks.sql) | Каталогийн шалгалт (FORCE RLS, BYPASSRLS, float төрөл г.м.) | `migrations` job (PG 16/17/18) |
| [`db/tests/smoke.sql`](./db/tests/smoke.sql) | 58 шалгалт: тэнцвэр (`ERB01`), rollback-ийн дараа завсаргүй, immutability, үе, авлагын үлдэгдэл, RLS, review regression (9.1–9.14) | `migrations` job |
| [`db/tests/seed_checks.sql`](./db/tests/seed_checks.sql) | 80 шалгалт: provisioning, CoA, матриц, дугаарлалт, тайлангийн харгалзаа, ТТ-03а | `migrations` job (`apply.sh --seed --test`) |

- **TST-DB-01.** Эдгээр файл `db/apply.sh <scratch-url> --seed --test`-ээр PG 16, 17, 18 дээр PR бүрд ажиллана. Нэг ч `FAIL` гарвал PR унана.
- **TST-DB-02.** Шинэ guard, trigger, constraint нэмэх migration бүр `smoke.sql`-д (эсвэл §8.2–8.6-ийн C# тестэд) эерэг ба сөрөг тесттэй хамт ирнэ.

### 8.2 RLS тусгаарлалт (DBT-RLS)

| ID | Өгөгдсөн нь | Хэрэв | Тэгэхэд |
|---|---|---|---|
| DBT-RLS-01 | Migration хийгдсэн DB | Каталогоос `tenant_id` баганатай бүх хүснэгтийг жагсаавал | Бүгд `relrowsecurity = relforcerowsecurity = true`; `tenant_isolation` policy байна; `company_id NOT NULL` бол `company_isolation` нь `RESTRICTIVE`. Үл хамаарах жагсаалтгүй (`audit.security_event`-ийн NULL тенантыг тусгай policy хамгаална) |
| DBT-RLS-02 | `erp_app`, `fn_set_context` дуудаагүй | Тенантын хүснэгт бүрд `SELECT 1 … LIMIT 1` | Алдаа (`42704` unrecognized configuration parameter, эсвэл хоосон утгад `22P02`) — **хоосон үр дүн биш** (D-K6). Тенантын хүснэгт бүрд давтана |
| DBT-RLS-03 | Т-А ба Т-Б тус бүр 2 компанитай; golden "суурь" багц (§12.1) хоёуланд ажилласан | Т-А/К-А1 контекстод хүснэгт бүрд `SELECT count(*) WHERE tenant_id <> current_tenant` ба (компанийн хүснэгтэд) `company_id <> current_company` | 0 |
| DBT-RLS-04 | Т-А контекст | `INSERT … (tenant_id = Т-Б)` (app_user INSERT эрхтэй хүснэгт бүрд) | `42501` (WITH CHECK) |
| DBT-RLS-05 | Т-А/К-А1 контекст | К-А2-ийн мөрийг `UPDATE`/`DELETE` | 0 мөр өөрчлөгдөнө (RESTRICTIVE) |
| DBT-RLS-06 | `pg_roles` | `rolbypassrls`-ийг шалгавал | Зөвхөн `app_rls_bypass` true; `app_owner`, `app_user`, `app_readonly`, `app_worker` болон login role бүгд false |
| DBT-RLS-07 | `SECURITY DEFINER` функцийн жагсаалт | Каталогоос | Жагсаалт [13 §7.6](./13-security-audit-tenancy.md)-тай яг таарна; бүгд `SET search_path = pg_catalog, pg_temp`; `integration.fn_claim_outbox`, `platform.fn_list_active_companies`-ийг `app_user` EXECUTE хийхэд `42501` |
| DBT-RLS-08 | View бүр | `pg_class.reloptions` | `security_invoker=true` |
| DBT-RLS-09 | Нэг холболтоор transaction 1 Т-А контекст тохируулж COMMIT | Transaction 2 контекстгүй SELECT | Алдаа (transaction-local `set_config(…, true)` дараагийн transaction руу алдагдахгүй). Nightly: PgBouncer transaction горимоор давтана |
| DBT-RLS-10 | Ledger trigger | Т-А/К-А1 контекстод К-А2-ийн `company_id`-тай ledger мөр INSERT | `ERT01` |

**Хамрах хүрээний хамгаалалт (TST-DB-03):** DBT-RLS-03-ийн дараа 0 мөртэй хүснэгтийн жагсаалтыг тайланд хэвлэнэ. Тенантын хүснэгтийн > 85% нь мөртэй байх ёстой. Эс бөгөөс тест "хоосон тул утгагүй" гэж унана. Мөргүй хүснэгт (R2-ийн `fa`, `inv`)-ийг нэрээр нь allow-list-д бичнэ.

### 8.3 Ledger-ийн өөрчлөгдөхгүй байдал (DBT-IMM)

`platform.ledger_guard` каталогоос хүснэгт бүрээр автоматаар үүсгэнэ (шинэ ledger нэмэхэд тест өөрөө өргөжнө).

| ID | Тест | Хүлээгдэх |
|---|---|---|
| DBT-IMM-01 | `app_user`-аар ledger бүрийн мөрийг `UPDATE … SET <immutable багана>`, `DELETE`, `TRUNCATE` | `42501` (эрх хураасан; NFR-050, FR-GL-012 AC2) |
| DBT-IMM-02 | `app_owner`-оор (FORCE RLS-тэй, контексттой) ижил үйлдэл | `ERL01` (`platform.fn_guard_immutable`); TRUNCATE-д ч |
| DBT-IMM-03 | `platform.fn_ledger_update`-ээр `mutable_columns`-ийн багана | Амжилттай; нэг мөр өөрчлөгдөнө |
| DBT-IMM-04 | `fn_ledger_update`-ээр `trigger_columns` (`remaining_amount`, `open`) эсвэл жагсаалтад байхгүй багана | `ERL01` |
| DBT-IMM-05 | `reversed` / `unapplied`-ийг true → false | `ERL01` (INV-30) |
| DBT-IMM-06 | Commit хийгдсэн `gl_transaction`-д шинэ `gl_entry` эсвэл дэд дэвтрийн мөр нэмэх | `ERL01` (INV-05) |
| DBT-IMM-07 | Дэд дэвтрийн мөрийн `posting_date` нь ваучерынхаас өөр | `ERB02` |
| DBT-IMM-08 | `ebarimt.ebarimt_document`-ийн хүсэлтийн талбар (`total_amount`, `bill_id_suffix`…) эсвэл олгогдсон ДДТД-ийг өөрчлөх; DELETE | `ERL01` |
| DBT-IMM-09 | Каталог: ledger бүрд `has_table_privilege('app_user', t, 'UPDATE')`, `'DELETE'`, `'TRUNCATE'` | false |
| DBT-IMM-10 | `audit.row_change`-д `app_user` INSERT/UPDATE/DELETE | `42501`; хадгалах хугацаа (10 жил) дуусаагүй мөрийг эзэмшигч DELETE хийхэд `ERL01` |
| DBT-IMM-11 | Ledger-ийн SQL кодын санд `UPDATE`/`DELETE` (architecture тест `No_update_delete_on_ledger_sql`) | 0 олдоц |

### 8.4 Тэнцвэр, үе, касс (DBT-BAL, DBT-PER, DBT-CASH)

| ID | Тест | Хүлээгдэх |
|---|---|---|
| DBT-BAL-01 | Σ ≠ 0 ваучер | COMMIT үед `ERB01`; юу ч хадгалагдахгүй |
| DBT-BAL-02 | Нэг DB transaction-д хоёр тэнцээгүй ваучер (нийлбэр нь 0) | `ERB01` (ваучер тус бүрд шалгана) |
| DBT-BAL-03 | Entry-гүй `gl_transaction` | `ERB01` |
| DBT-BAL-04 | Preview: `SET CONSTRAINTS ALL IMMEDIATE` | Тэнцээгүй бол preview-д ч `ERB01` |
| DBT-BAL-05 | COMMIT-оос өмнө контекстыг өөр компани руу шилжүүлэх | Тэнцвэр ба кассын шалгалт хэвээр ажиллана (`app_rls_bypass` функц) |
| DBT-BAL-06 | Heading/блоклогдсон данс руу entry | `ERG01` |
| DBT-PER-01 | `CLOSED` үе рүү энгийн ваучер | `ERP01` |
| DBT-PER-02 | `CLOSED` үе рүү `is_closing = true` (12-31) ваучер | Амжилттай; `LOCKED` үед `ERP01` |
| DBT-PER-03 | `allow_posting_from/to`-оос гадуур (хаалтын ваучер ч) | `ERP01` (D-D3: бүх эрхэд) |
| DBT-PER-04 | `LOCKED` үеийг `OPEN`/`CLOSED` болгох; `LOCKED` санхүүгийн жил | `ERP02` |
| DBT-PER-05 | Бичилттэй үеийн огноог өөрчлөх | `ERP02` |
| DBT-PER-06 | `SUBMITTED` НӨАТ-ын үе рүү `vat_date`-тэй VAT entry; үеийг дахин нээх | `ERV01`; `ERP02` |
| DBT-PER-07 | Ваучергүй detailed мөр (тулгалт) `CLOSED` үеийн огноотой | `ERP01` (INV-28) |
| DBT-CASH-01 | `kind = CASH` данс: 03-01 +100 000, 03-10 −80 000; дараа нь 03-05 −50 000 | COMMIT үед `ERC01` (03-10-ны running үлдэгдэл −30 000; INV-19) |
| DBT-CASH-02 | `prevent_negative_balance = true` банкны данс | Ижил дүрэм; `false` бол сөрөг зөвшөөрнө |

### 8.5 Дугаарлалт ба зэрэгцээ ачаалал (DBT-NUM)

| ID | Тест | Хүлээгдэх |
|---|---|---|
| DBT-NUM-01 | Дугаар олгосны дараа transaction ROLLBACK (тэнцээгүй ваучер, апп-ийн exception) | Дараагийн амжилттай posting ижил дугаарыг авна (завсаргүй; smoke 4) |
| DBT-NUM-02 | **Зэрэгцээ posting (§8.5.1-ийн алгоритм):** нэг компани, N = 32 урсгал × M = 25 posting, 10% нь дугаар авсны дараа rollback, 2% нь backend kill | Commit хийгдсэн K баримтын дугаар `1..K` завсаргүй, давхардалгүй; `entry_no`, `transaction_no`, `gl_register.no` бүгд `1..n` завсаргүй; deadlock 0; бүх ваучер тэнцсэн |
| DBT-NUM-03 | Өөр 8 компани зэрэг posting | Компани бүрийн дугаар тусдаа `1..K_i`; нэг компанийн posting нөгөөг хүлээлгэхгүй (`pg_locks`: advisory lock-ийн хүлээлт зөвхөн нэг компанид) |
| DBT-NUM-04 | `reset_yearly` цуврал: 2026-12-31 ба 2027-01-01-ний баримт | `SI-2026-0000k`, дараа нь `SI-2027-00001`; 2028-ийн мөр байхгүй үед `ERN01` |
| DBT-NUM-05 | `date_order = true`: сүүлийн огнооноос өмнөх огноотой баримт | `ERN02` |
| DBT-NUM-06 | `platform.number_series_counter`, `platform.ledger_counter`, `ebarimt.pos_counter`-т `app_user` INSERT/UPDATE/DELETE | `42501` |
| DBT-NUM-07 | Gapless цувралд `manual_nos = true` тохируулах | CHECK зөрчил (`23514`) |
| DBT-NUM-08 | `billIdSuffix`: POS 001-ийн өчигдрийн сүүлийн `bill_seq = 120`; өнөөдрийн эхний баримт; rollback болсон posting | `bill_seq = 121`, `001000121`; rollback-ийн дараа 121 дахин олгогдоно; шөнө дунд тэглэгдэхгүй (AT-EB-12, INV-14). **Хил:** `bill_seq` 999 999 → 1 000 000 үед `bill_id_suffix = bill_seq % 10^6 = 0` → `001000000` (9 орон хэвээр, VAL-28); тухайн өдөр ижил POS-д `bill_id_suffix = 0` өмнө нь олгогдсон бол `UNIQUE (company_id, ebarimt_pos_id, bill_date, bill_id_suffix)` зөрчигдөж `23505` (өдөрт 10^6 баримт — бодит бус, гэхдээ тест заавал) |
| DBT-NUM-09 | **Хаалт ба posting-ийн уралдаан:** A урсгал posting-ийн transaction дотор advisory lock авч 2 s хүлээнэ; B урсгал тухайн сарыг хаах (`:close`) | B нь A-г хүлээнэ (`pg_locks`-оор баталгаажуулна); A commit хийгдсэний дараа B хаана; хаалтын дараах posting `ERP01`. "Хаагдсан үед бичигдсэн" бичилт 0 |
| DBT-NUM-10 | Posting-ийн transaction дундуур `pg_terminate_backend` | Дугаар, entry_no завсаргүй; хагас бичигдсэн мөр 0 |
| DBT-NUM-11 | `lock_timeout = 5s` хэтэрсэн | `55P03` → API `503 api.lock_timeout` + `Retry-After: 2`; ижил `Idempotency-Key`-ээр дахин илгээхэд нэг posting |

#### 8.5.1 Зэрэгцээ дугаарлалтын тестийн алгоритм (DBT-NUM-02)

```text
GIVEN  клон DB, provision хийсэн компани C (BASE-VAT), цуврал SI gapless + reset_yearly,
       N = 32 урсгал, урсгал бүр M = 25 нэхэмжлэх, FaultInjector:
         p_rollback = 0.10  → дугаар авсны дараа (ledger writer-ийн өмнө) exception шиднэ
         p_kill     = 0.02  → тусдаа холболтоос pg_terminate_backend(тухайн backend)
       deadlocks_before := SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()

PARALLEL FOR w IN 1..N:
    FOR i IN 1..M:
        draft := TestData.SalesInvoice().For(B2B).WithLine(SRV-CONS, qty "1", price "1000")
        TRY
            result := IPostingService.PostAsync(draft, Post)       -- бодит engine, бодит advisory lock
            committed.Add(result.DocumentNo, result.TransactionNo)
        CATCH injected | 57P01 (terminated) | 55P03 (lock timeout)
            failed++                                            -- rollback; дугаар буцна

THEN
    K := committed.Count;  ASSERT K + failed = N × M
    nums := SELECT no FROM sales.sales_invoice_header WHERE company_id = C ORDER BY no
    ASSERT nums = ["SI-2026-00001" .. format(K)]                   -- завсаргүй, давхардалгүй
    FOR ledger IN (gl_entry.entry_no, gl_transaction.transaction_no, gl_register.no,
                   vat_entry.entry_no, cust_ledger_entry.entry_no, detailed_cust_ledger_entry.entry_no):
        ASSERT SELECT max(x) = count(*) AND min(x) = 1 FROM ledger WHERE company_id = C
    ASSERT every transaction_no: sum(amount) = 0
    ASSERT (SELECT deadlocks …) − deadlocks_before = 0
    ASSERT party.v_cust_ledger_entry_check, party.v_receivables_reconciliation (difference ≠ 0) хоосон
    REPORT lock wait p50/p95/p99 (audit.posting_log.started_at → finished_at; OTel erp_posting_lock_wait_seconds)
```

- PR-д N = 16, M = 10 (≤ 60 s). Nightly ба RC-д N = 32, M = 25.
- Зэрэгцээ тест хугацааны босго (lock wait p95 ≤ 100 ms) шалгахгүй. Тэр нь perf орчинд PERF-06 хийнэ. CI runner-ийн хурд тогтворгүй.

### 8.6 Төрөл ба хориотой өгөгдөл

| ID | Тест | Хүлээгдэх |
|---|---|---|
| DBT-TYP-01 | Каталог: мөнгө, үнэ, тоо, ханшийн багана | `platform.amount` (19,4), `platform.unit_amount` (19,6), `platform.quantity` (19,5), `platform.exch_rate` (38,18) domain; `real`, `double precision`, `money` төрөл 0 (INV-23, NFR-002) |
| DBT-TYP-02 | `AssertNoHiddenRounding`: posting бүрийн дараа бичсэн MNT дүнг буцааж уншиж `round(x, 2) = x` | Бүгд үнэн ([18 §4.2](./18-dev-setup.md) №8). Golden runner default invariant-д мөн орно |
| DBT-PII-01 | Каталог: `%qr%`, `%lottery%` нэртэй багана | 0 (AT-EB-40) |
| DBT-PII-02 | `integration.outbox`, `inbox`, `idempotency_key.response_body`, `job_run.parameters/result`-д `{"a":{"b":{"qrData":"x"}}}` | `23514` (`fn_has_forbidden_ebarimt_keys`, INV-15) |

### 8.7 Migration тест

[18 §10](./18-dev-setup.md)-ийн `migrations` job: lint → Path A (хоосон DB, `migrate` давхар ажиллуулахад no-op) → Path B (өмнөх release + `seed --set demo` + `demo-post` → одоогийн `migrate` + `verify`) → schema diff (A = B). Нэмэлт:

- **TST-MIG-01.** Path B-ийн дараа golden-ийн default invariant-ыг (§11.5 I-01…I-08) демо компани дээр ажиллуулна. Migration ledger-ийг эвдээгүйг баталгаажуулна.
- **TST-MIG-02.** Expand/contract: өмнөх release-ийн integration тестийн багцыг шинэ схем дээр ажиллуулна (nightly; rollback = өмнөх image, [02 §12.7](./02-architecture.md)).

### 8.8 Invariant → тестийн харгалзаа

| INV ([03 §5](./03-domain-model.md)) | Тест |
|---|---|
| INV-01 тэнцвэр | DBT-BAL-01…05, PBT-01, PBT-06, I-01 |
| INV-02 ledger өөрчлөгдөхгүй | DBT-IMM-01…04, 09, 11 |
| INV-03 тэмдэгтэй дүн, storno-гүй | PBT-05, GS-GL-006 |
| INV-04 үлдэгдэл = Σ detailed | PBT-07, PBT-08, I-03, GS-AR-* |
| INV-05 entry өөрийн ваучерт | DBT-IMM-06, 07 |
| INV-06 үеийн хяналт | DBT-PER-01…05, PBT-17, GS-CLOSE-001 |
| INV-07 үе давхцахгүй | `smoke.sql`, `seed_checks.sql` |
| INV-08 завсаргүй хуулийн дугаар | DBT-NUM-01…07, PBT-15, I-07, GS-GL-015, GS-GL-020 |
| INV-09 entry/transaction/register дугаар | DBT-NUM-02, I-07 |
| INV-10 dimension set | PBT-16, GS-GL-014 |
| INV-11 дэд дэвтэр = G/L | PBT-07, I-04, I-05 |
| INV-12 тенантын тусгаарлалт | DBT-RLS-01…10, SEC-T-03/04 |
| INV-13 нэг амьд eBarimt | PBT-18, GS-EBR-005 |
| INV-14 `billIdSuffix` | DBT-NUM-08 |
| INV-15 QR/сугалаа хадгалахгүй | DBT-PII-01/02, CT-POS-05, SEC-T-08, I-12 |
| INV-16 орцын НӨАТ баталгаажсан ДДТД-тэй | GS-VAT-004, GS-PUR-006, AT-EB-38 |
| INV-17 НӨАТ-ын огноо нээлттэй үед | DBT-PER-06, GS-VAT-008 |
| INV-18 нийлүүлэгчийн дугаар давхардахгүй | GS-PUR-013 |
| INV-19 касс сөрөг биш | DBT-CASH-01/02, GS-CASH-002, GS-PUR-015 |
| INV-20 posting данс | DBT-BAL-06 |
| INV-21 нэхэмжлэхийг нэг удаа цуцлах | GS-SAL-006 |
| INV-22 буцаалтын холбоос | GS-GL-006 |
| INV-23 дүнгийн төрөл | DBT-TYP-01/02 |
| INV-24 элэгдлийн run (R2) | R2-ийн GS-FA-* ([11-fixed-assets-inventory](./11-fixed-assets-inventory.md)-тэй хамт) |
| INV-25 optimistic concurrency | INT-ETAG-01…03 |
| INV-26 хэтрүүлж тулгахгүй | PBT-07, GS-AR-009 |
| INV-27 тулгалт нэг харилцагч дотор | DBT (FK) + INT-APP-03 |
| INV-28 G/L-гүй тулгалт | DBT-PER-07, GS-AR-002, GS-AR-004 |
| INV-29 global dimension | `smoke.sql` 9.5, GS-GL-014 |
| INV-30 нэг чиглэлтэй туг | DBT-IMM-05 |
| INV-31 VAT category ↔ taxType | `seed_checks.sql`, GS-VAT-003 |

---

## 9. Integration тест

### 9.1 Хамрах хүрээ

`WebApplicationFactory<Program>` нь `Erp.Api`-г, `IHost`-оор `Erp.Worker`-ийг (outbox dispatcher, Quartz job-ыг `FakeTimeProvider`-оор гараар өдөөнө) in-process ажиллуулна. PostgreSQL нь Testcontainers, PosAPI нь WireMock. Нэвтрэлтийг тестийн authentication handler (хэрэглэгч/role-ийг header-ээс) орлоно. Энэ handler зөвхөн `Test` орчинд бүртгэгдэнэ, architecture тест үүнийг production host-д байхгүй гэж шалгана.

| Бүлэг | ID | Гол сценари | Эх |
|---|---|---|---|
| Idempotency | INT-IDEM-01…06 | Ижил түлхүүр + ижил body → хадгалсан хариу, `Idempotent-Replayed: true`, posting 1; ижил түлхүүр + өөр body → `422 api.idempotency_key_reused`; зэрэг 2 хүсэлт → нэг нь хүлээгээд хадгалсан хариуг авна; эхнийх 5 s-ээс удаан бол хоёр дахь нь `409 api.idempotency_in_progress` + `Retry-After: 1` (API-IDEM-07; `55P03`-ийн үл хамаарал); бизнесийн 422 → түлхүүр хадгалагдахгүй, засаад дахин илгээнэ; түлхүүргүй POST → `400 api.idempotency_key_missing`; preview түлхүүр шаардахгүй | [02 §8.5](./02-architecture.md), [14 §7](./14-api.md), NFR-004 |
| ETag | INT-ETAG-01…03 | Хуучин ETag-аар PATCH/post → `412 api.etag_mismatch`; `If-Match`-гүй post → `428 api.precondition_required`; post-ын дараа ноорогийг засах → `409 api.document_already_posted` | FR-SAL-001 AC1, INV-25 |
| Outbox ба crash | INT-OUT-01…08 | Commit-оос өмнө PosAPI дуудлага 0 (NFR-007); commit ↔ dispatch-ийн хооронд worker kill → дахин асаахад нэг л илгээлт; `NOTIFY` алдагдвал 2 s polling; `email.send` 5 удаа оролдоод `DEAD` (FR-SAL-012); `depends_on_id` дараалал; lease дууссан `PROCESSING` → reaper | [02 §9.1](./02-architecture.md), ADR-0012 |
| eBarimt | INT-EBR-* | [12 §24](./12-ebarimt-integration.md)-ийн AT-EB-01…42 (бүгд энэ давхаргад, mock-оор) | D-J1…J4 |
| Алдааны код | INT-ERR-01…15 | §9.3 | [14 §9](./14-api.md) |
| Эрх ба тенант | SEC-T-01, 03, 04, 07, 11, 12, 19, 20 | [13 §17.2](./13-security-audit-tenancy.md) | NFR-030…036 |
| Тулгалт | INT-APP-01…05 | Өөр харилцагчийн entry рүү тулгах → 422; хаалттай entry-д → `409 party.entry_closed`; валют зөрөх (R2) → `422 party.application_currency_mismatch` | FR-PTY-009…013, FR-FX-006 |
| Async job | INT-JOB-01…04 | Экспорт 202 → `job_run` SUCCEEDED → файл; эрх хасагдвал `DEAD` (AT-SEC-039) | [14 §10](./14-api.md) |

### 9.2 Outbox crash тестийн алгоритм (INT-OUT-02)

```text
GIVEN  B2B нэхэмжлэх, merchant TIN 37900846788, worker-ийн FaultInjector: "commit-ийн дараа, claim-аас өмнө процесс зогсоно"
WHEN   POST /sales-invoices/{id}:post  → 201 (posting commit хийгдсэн, outbox PENDING)
       worker процессыг зогсоож (IHost.StopAsync, graceful биш), шинэ worker асаана
THEN   ≤ 10 s дотор outbox DONE, ebarimt_document SUCCESS
       WireMock-ийн POST /rest/receipt хүлээн авсан тоо = 1
       ebarimt_document_event: PENDING → SENT → SUCCESS
VARIANT "claim-ийн дараа, HTTP-ийн өмнө kill" → AT-EB-19 (R-2 шинэ outbox, нийт дуудлага = 1)
VARIANT "HTTP илгээсний дараа, хариу бичихээс өмнө kill" → AT-EB-18 (reaper → UNKNOWN, дуудлага ≤ 1)
```

### 9.3 Алдааны кодын харгалзааны тест

[14 §9.6](./14-api.md) ба [13 §18.2](./13-security-audit-tenancy.md)-ийн хүснэгт бүрийн мөрөнд нэг тест (INT-ERR-*). Тест нь **хоёр замаар** шалгана:

1. Аппын урьдчилсан шалгалт нь DB-ийн алдаанаас **өмнө** тодорхой домэйн кодыг буцаана (жишээ нь хаалттай үе → `422 gl.period_closed`, DB-д хүрэхгүй).
2. Урьдчилсан шалгалтыг тест тусгайлан унтраасан үед (`IPrecheckBypass`, зөвхөн Test орчинд) DB-ийн SQLSTATE нь ижил апп-ийн код руу хөрвөнө (`ERP01` → `422 gl.period_closed`; `ERB01` → `500 api.internal_error` + P1 метрик `erp_posting_failures_total{reason="ERB01"}`).

| SQLSTATE | Хүлээгдэх апп-ийн код | HTTP | Метрик/alert |
|---|---|---|---|
| `ERP01` | `gl.period_closed` / `gl.posting_date_outside_window` | 422 | — |
| `ERP02` | `gl.period_locked` (`tax.vat_return_period`-ийн `SUBMITTED` мөр дээр → `tax.vat_period_submitted`, [08 §8](./08-tax-vat-mn.md)) | 409 | — |
| `ERV01` | `tax.vat_period_closed` | 422 | — |
| `ERC01` | `bank.cash_negative_balance` | 422 | — |
| `ERG01` | `gl.account_not_posting` | 422 | — |
| `ERD01` | `gl.dimension_value_not_found` | 422 | — |
| `ERN01`/`ERN02`/`ERN03` | `platform.number_series_missing_line` / `_date_order` / `_exhausted` | 422 | — |
| `ERB01`, `ERB02` | `api.internal_error` | 500 | P1 |
| `ERL01` | `platform.immutable_record` | 500 | P2 |
| `ERT01`, `42501` | `platform.context_error` | 500 | P1 |
| `23505` (`ux_vendor_ledger_entry__vendor_doc_no`) | `purchase.vendor_invoice_no_duplicate` | 409 | — |
| `23505` (бусад unique) | Constraint-ийн map, эс бөгөөс `api.duplicate` | 409 | — |
| `23503` (FK) | Устгахад `api.resource_in_use` (409), оруулахад `api.reference_not_found` (422) | 409 / 422 | — |
| `23514` (check) | Constraint-ийн map (жишээ `fn_has_forbidden_ebarimt_keys` → DBT-PII-02), эс бөгөөс `api.validation_failed` | 422 | — |
| `40001`, `40P01` | Нэг удаа дахин оролдоод `api.lock_timeout` | 503 | — |
| `55P03`, `57014` | `api.lock_timeout` + `Retry-After: 2` | 503 | `erp_posting_lock_timeouts_total` |
| `55P03` — зөвхөн `integration.idempotency_key`-ийн `INSERT … ON CONFLICT` дээр | `api.idempotency_in_progress` + `Retry-After: 1` | 409 | — |

Энэ хүснэгт [14 §9.6](./14-api.md)-ийн хуулбар. Зөрвөл 14 давамгайлна; INT-ERR тест 14-ийн хүснэгтийг өгөгдлийн эх болгон уншина (хоёр газар гараар засахгүй).

---

## 10. Contract тест

### 10.1 PosAPI (mock-оор)

PosAPI бол манай хяналтгүй гадаад систем. Тиймээс contract-ийг **consumer талаас** (бид) албан ёсны тодорхойлолт ба staging-ийн бодит хариутай тулгана. Consumer-driven contract (Pact)-ийг хэрэглэхгүй, учир нь provider (ITC) оролцохгүй.

**Contract-ийн эх сурвалж:**

1. Албан ёсны `PosAPI.yaml` v3.2.48 (ITC). Репод `tests/Contracts/PosApi/spec/posapi-3.2.48.yaml` болгон SHA-256-тай хадгална (тараах эрхийг §22 Q1-ээр тодруулна).
2. [12 §5–§8](./12-ebarimt-integration.md)-ийн талбарын харгалзаа ба илгээхийн өмнөх шалгалтын каталог (манай нэмэлт хатуу дүрэм).
3. Staging-ийн бичигдсэн хариу (`tests/Contracts/PosApi/recorded/*.json`). `qrData`, `lottery`-г `"<PRINT-ONLY>"` болгон сольж хадгална (§10.3).

| ID | Тест | Хүлээгдэх |
|---|---|---|
| CT-POS-01 | **Хүсэлтийн гэрээ.** Golden scenario (§12)-ийн бүх eBarimt баримт ба PBT-10-ийн 1 000 санамсаргүй баримтын хүсэлтийн JSON-ийг `PosAPI.yaml`-ийн request schema-аар шалгана. Мөн [12 §8](./12-ebarimt-integration.md)-ийн бизнесийн шалгалт (нийлбэрийн гинж, `taxType` тус бүрд нэг дэд баримт, `classificationCode` 7 орон, `consumerNo` зөвхөн B2C, `customerTin` зөвхөн B2B) | Schema-ийн зөрчил 0. Бизнесийн шалгалтын зөрчил 0 |
| CT-POS-02 | **Mock-ийн нийцэл.** WireMock-ийн бүх mapping-ийн хариуны body ба `recorded/*.json` нь `PosAPI.yaml`-ийн response schema-д нийцнэ | Нийцэхгүй mapping → тест унана (mock-ийн drift) |
| CT-POS-03 | **Хариуг ангилах.** Хариуны хувилбар бүрийг adapter [12 §10.4](./12-ebarimt-integration.md)-ийн дагуу ангилна: 200 SUCCESS → SUCCESS (ДДТД 33 орон); 200 бизнесийн ERROR → ERROR; 4xx баталгаажуулалт → ERROR; 5xx → UNKNOWN; timeout → UNKNOWN; хоосон хариу/тасарсан → UNKNOWN; JSON задрахгүй → UNKNOWN; TCP холбогдоогүй → ERROR `ebarimt.connect_failed` (хүсэлт явуулаагүй) | §10.2-ын хүснэгт |
| CT-POS-04 | **Тээврийн гэрээ (retry-гүй).** `POST`/`DELETE /rest/receipt`-ийн fault бүрд mock-ийн хүлээн авсан хүсэлтийн тоо **яг 1**; GET (`/rest/info`, `sendData`) нь 3 хүртэл retry | Давхар илгээлт 0 (D-J2, AT-EB-16/17) |
| CT-POS-05 | **Redaction.** Mock-ийн canary (`QR-CANARY-…`, `LOTTERY-CANARY-…`): SYNC_FIRST, ASYNC, хоцорсон хариу (timeout mapping), idempotency replay урсгалын дараа `pg_dump --data-only`, апп ба worker-ийн лог, OTel collector-ийн экспорт (file exporter), Playwright-ийн browser storage-ээс хайна | Олдоц 0 (AT-EB-22, SEC-T-08, NFR-041) |
| CT-POS-06 | **Staging-ийн бичлэг.** [12 §25](./12-ebarimt-integration.md)-ийн TS-01…34-ийн хариуг (redact хийсэн) `recorded/`-д хадгалж, CT-POS-02/03-д оролт болгоно | Бодит хариу mock-оос зөрвөл mock-ийг шинэчилнэ (§10.3) |
| CT-POS-07 | **Лавлах сервис.** `getInfo`, `getProductTaxCode`, `barcode/*`-ийн хариуны бүтэц (mock `reference-getinfo.json` ба staging бичлэг) | Adapter задлах; хоосон/алдаатай хариуд кэш хэвээр, `ebarimt.reference_cache_stale` анхааруулга |

### 10.2 Fault-ийн матриц (CT-POS-03/04)

Тест нь adapter-ийн timeout-ийг 2 s, mock-ийн хоцролтыг 3 s болгож богиносгоно (production: 20 s / 40 s). Утга нь тохиргоогоор, кодонд биш.

| # | Mock (ТТД эсвэл fault) | `ebarimt_document.status` | `error_code` | `integration.outbox.status` | Mock-ийн хүсэлтийн тоо | Автомат дахин илгээлт |
|---|---|---|---|---|---|---|
| F1 | `37900846788` (200 SUCCESS) | `SUCCESS` (ДДТД 33 орон) | — | `DONE` | 1 | — |
| F2 | `99999999902` (400, `status = ERROR`) | `ERROR` | `posapi.rejected` | `DEAD` | 1 | Үгүй. Засаад гараар "Дахин илгээх" ([12 §11.4](./12-ebarimt-integration.md)) |
| F3 | `99999999901` (хоцролт > timeout) | `UNKNOWN` | `ebarimt.timeout` | `DEAD` | 1 | **Үгүй** (10 мин хүлээгээд ч 1; AT-EB-16) |
| F4 | `99999999903` (`EMPTY_RESPONSE`) | `UNKNOWN` | `ebarimt.connection_lost` | `DEAD` | 1 | Үгүй (AT-EB-17) |
| F5 | `99999999904` (`CONNECTION_RESET_BY_PEER`) | `UNKNOWN` | `ebarimt.connection_lost` | `DEAD` | 1 | Үгүй |
| F6 | `99999999905` (502 HTML) | `UNKNOWN` | `posapi.http_5xx` | `DEAD` | 1 | Үгүй |
| F7 | `99999999907` (JSON задрахгүй) | `UNKNOWN` | `ebarimt.response_unparseable` | `DEAD` | 1 | Үгүй |
| F8 | Mock унтарсан (TCP refused) | `ERROR` | `ebarimt.connect_failed` | `DEAD` | 0 | Үгүй (AT-EB-15, [12 §10.4](./12-ebarimt-integration.md) DSP-21) |
| F9 | Instance `DOWN` (`/rest/info` амжилтгүй) | `PENDING` (`attempt_count = 0`) | — | `DEAD` (`INSTANCE_UNAVAILABLE`) | 0 | Сэргэсний дараа reaper R-2 шинэ outbox (`:2`) үүсгэнэ (AT-EB-37) |
| F10 | `99999999906` (дүн зөрүүтэй SUCCESS) | `SUCCESS` | — | `DONE` | 1 | — ; P2 alert `ebarimt.response_amount_mismatch` (AT-EB-42) |
| F11 | Илгээсний дараа, Tx B-ээс өмнө worker kill | `UNKNOWN` (reaper R-1, 120 s) | `ebarimt.lease_expired` | `DEAD` | ≤ 1 | Үгүй (AT-EB-18) |
| F12 | 200 SUCCESS, `id` байхгүй | `UNKNOWN` | `ebarimt.response_invalid` | `DEAD` | 1 | Үгүй |

Төлөвийн харгалзааг [12 §10.7](./12-ebarimt-integration.md) тогтооно (ERROR, UNKNOWN → outbox `DEAD`).

### 10.3 Mock-ийн drift ба staging бичлэг

- **TST-CT-01.** Mock-ийн mapping-ийг гараар засах бүрд CT-POS-02 ажиллана. Schema-д нийцэхгүй mapping merge хийгдэхгүй.
- **TST-CT-02.** Staging-ийн TS-xx ажиллах бүрд (G2 хаалганы өмнө, дараа нь PosAPI-ийн шинэ хувилбар гарах бүрд) хариуг `recorded/`-д шинэчилнэ. `recorded/` ба mock-ийн бүтцийн зөрүүг (талбарын нэр, төрөл, заавал эсэх) `Erp.DevTools contract-diff` тайлагнана. Зөрүү гарвал mock-ийг шинэчлэх PR заавал.
- **TST-CT-03.** Mock-ийн `metadata.note`-д "PLACEHOLDER" гэсэн mapping байгаа үед G2 хаалга хаагдахгүй (§17.2 QG-PILOT).

### 10.4 Манай REST API (OpenAPI)

| ID | Тест | Хүлээгдэх |
|---|---|---|
| CT-API-01 | Integration тестийн бүх HTTP хариуг (`DelegatingHandler`-ээр) [api/openapi.yaml](./api/openapi.yaml)-ийн schema-аар шалгана | Зөрчил 0 (status code, `application/problem+json`, мөнгө string) |
| CT-API-02 | `oasdiff breaking` (`main`-ийн contract-тай) | v1-д breaking өөрчлөлт 0 (NFR-112) |
| CT-API-03 | `npm run api:gen` → `schema.d.ts` drift ба `tsc` | Drift 0, compile OK |
| CT-API-04 | Endpoint бүр каталогийн permission-тэй, POST бүр `Idempotency-Key`-тэй (architecture тест, SEC-T-20) | Зөрчил 0 |

### 10.5 Бусад гадаад систем

| ID | Систем | Fixture | Шалгах |
|---|---|---|---|
| CT-MB-01 (R2) | Монголбанкны ханш (албан бус endpoint) | `tests/Contracts/Mongolbank/*.json` (бичигдсэн хариу, `"USD":"3,465.69"`) | 3465.69 болж задрах (FR-FX-003 AC1); хоосон/HTML хариу → alert, гар оруулга |
| CT-BNK-01 | Хаан банкны хуулгын экспорт | `tests/Contracts/BankStatements/khan/*.xlsx` (пилотоос, нэргүйжүүлсэн; §22 Q4) | Preset-ээр гар харгалзуулалтгүй импорт (FR-BNK-009 AC1); эхний + Σ мөр = эцсийн |
| CT-BNK-02 | Голомт банкны хуулга | Ижил | Ижил |
| CT-BNK-03 | Ерөнхий CSV/XLSX wizard | Синтетик файл: дебит/кредит тусдаа багана, `1 234,56`, UTF-8 BOM | FR-BNK-008 AC1 |

---

## 11. Golden scenario-ийн формат

### 11.1 Зорилго ба эзэмшил

Golden scenario бол нягтлан бодох бүртгэлийн зөв байдлын **regression suite** ба **oracle** юм (TA-14, NFR-006). Нэг scenario нь:

1. **setup** — компани, seed, тохиргооны ялгаа, эхний үлдэгдэл, мастер өгөгдөл;
2. **steps** — бизнесийн үйлдлийн дараалал (баримт батлах, тулгах, буцаах, хаах, тайлан гаргах), хэн, хэзээ хийх;
3. **expect** — алхам бүрийн болон эцсийн хүлээгдэх G/L, VAT, дэд дэвтэр, үлдэгдэл, дугаар, тайлангийн мөр, eBarimt-ийн баримт.

| Үүрэг | Хэн |
|---|---|
| Scenario бичих, засах | QA эсвэл хөгжүүлэгч (модулийн баг) |
| Хүлээгдэх үр дүнг баталгаажуулах (`signedOffBy`) | Нягтлан зөвлөх (`ACCOUNTING_ADVISOR`); НӨАТ, НХАТ, eBarimt-ийн scenario-д мөн татварын зөвлөх (`TAX_ADVISOR`) |
| Runner, schema | `ledger-owners` баг |
| CODEOWNERS | `tests/Golden/Scenarios/**` → `@ledger-owners` + `@accounting-reviewers` (хоёулангийнх нь approval) |

### 11.2 Файлын байршил ба нэршил

```text
tests/Golden/
├── golden-scenario.schema.json          # §11.6 (JSON Schema draft 2020-12)
├── baselines/BASE-VAT.yaml              # §12.1 суурь тохиргоо
├── baselines/BASE-NONVAT.yaml
├── Scenarios/<area>/GS-<AREA>-<NNN>-<slug>.yaml   # гарын үсэгтэй, CI-ийг унагана (gating)
├── Drafts/<area>/GS-<AREA>-<NNN>-<slug>.yaml      # гарын үсэггүй ноорог, gating биш job
├── Fixtures/bank-statements/*.csv|xlsx            # хуулгын файл (REC)
└── Erp.Tests.Golden.csproj
```

- **TST-GS-01.** Файлын нэр `GS-<AREA>-<NNN>-<slug>.yaml`; `id` талбар нь файлын нэрийн эхлэлтэй яг таарна. `slug` нь латин жижиг үсэг, `-`.
- **TST-GS-02.** ID-г нэг удаа олгоно. Хасагдсан scenario-ийн ID-г дахин хэрэглэхгүй (`status: DEPRECATED` болгоод 1 release-ийн дараа устгана).
- **TST-GS-03.** `Scenarios/` доторх файл бүр `signedOffBy`-тэй байна. Гарын үсэггүй файл CI-ийг **унагана** ([18 §13.3](./18-dev-setup.md)). Ноорог `Drafts/`-д байрлаж, `golden-drafts` (gating биш) job-д ажиллана.

### 11.3 Бүтэц

| Хэсэг | Заавал | Агуулга |
|---|---|---|
| Толгой | ✔ | `schemaVersion`, `id`, `title`, `area`, `release` (R1/R2/R3), `rules` (`NOW` = одоо хүчинтэй параметр, `2027` = 2027-01-01/2027-07-01-ний өөрчлөлтийг шалгана), `refs` (FR/NFR/CMP/D/INV/AT), `signedOffBy`, `status` |
| `extends` | — | Өөр scenario-ийн бүх setup ба алхмыг эхэлж ажиллуулна (гинж: жилийн хаалт → дахин хаалт → шилжүүлэг). Гүн ≤ 3. Эх scenario-ийн `expect`-ийг дахин шалгахгүй |
| `variants` | — | Ижил scenario-г өөр нөхцөлөөр давтах: `rules: 2027` ба `shiftDates: "+1Y"` (бүх огноог 1 жилээр шилжүүлнэ). `expectOverride` нь зөвхөн ялгаатай хүлээгдэх утгыг дарна |
| `setup` | ✔ | `baseline` (`BASE-VAT` г.м.), компани бүрийн `profile`, `overrides` (данс, posting setup, үеийн төлөв, мөнгөний данс, харилцагч, нийлүүлэгч, бараа, dimension, валют, ханш, eBarimt, текстийн дүрэм), `openingBalances`, `users` |
| `steps` | ✔ | `id`, `at` (бизнесийн огноо-цаг, УБ), `as` (хэрэглэгч/role), `company`, `action` (§11.11), `input`, `idempotencyKey`, `expectOutcome` (OK эсвэл алдааны код, HTTP), `capture` (дараагийн алхамд хэрэглэх хувьсагч), `expect` (тухайн алхмын хүлээгдэх үр дүн) |
| `expect` | — | Бүх алхмын дараах эцсийн хүлээгдэх үр дүн |
| `invariants` | — | Default invariant (§11.5)-ыг унтраах (`disable: [I-05]` + `reason`) — зөвхөн сөрөг тестэд |

### 11.4 Тулгах дүрэм (matching semantics)

- **TST-GS-04. Дүн.** Бүх мөнгө string, MNT-д яг 2 бутархай орон (`"1100.00"`). G/L мөрийг `dr` эсвэл `cr`-ээр (аль нэг нь) бичнэ. Runner нь `dr` → `amount = +x`, `cr` → `amount = −x` болгоно (D-C3). Харьцуулалт яг тэнцүү.
- **TST-GS-05. Ваучер ба мөр.** Алхмын `expect.glEntries` нь тухайн алхмаар үүссэн **бүх** G/L мөрийг (`exhaustive: true` default) тодорхойлно. `transaction` (`T1`, `T2` — алхам доторх харьцангуй дугаар) ба `account`-аар бүлэглэнэ. Мөрийн дараалал хамааралгүй.
- **TST-GS-06. Нэгтгэлийн горим.** `glMatch: exact` (default) — `(transaction, account, dimension set)` бүрээр мөр яг таарна. `glMatch: byAccount` — данс бүрийн нийлбэрээр (buffer нэгтгэлийн дүрэм модулийн spec-ээр нарийсаагүй үед). `byAccount`-ийг шалтгаантай (`matchReason`) хэрэглэнэ.
- **TST-GS-07. Тодорхойгүй талбар.** `expect`-д бичээгүй багана шалгагдахгүй (жишээ нь `created_at`, `id`). `entry_no`-г харьцангуй (`#1`, `#2`…) эсвэл `$var`-аар заана.
- **TST-GS-08. Хувьсагч.** `capture: { inv: "$.documentNo" }` хариуны JSON-оос утга авна. Дараагийн `input`, `expect`, хуулгын файлын template-д `${inv}` эсвэл `$inv` хэлбэрээр орно.
- **TST-GS-09. Алдаа.** `expectOutcome: { status: ERROR, http: 422, codes: [gl.voucher_unbalanced] }` — алдааны кодын **олонлог** яг таарна (илүү, дутуу код = fail). Алдаатай алхмын дараа `expect.noRowsWritten: true` нь тухайн алхмаар ямар ч ledger, posted баримт, outbox, дугаарын өөрчлөлт гараагүйг шалгана. Хариуны body-ийн тодорхой талбарыг `bodyContains` (JSONPath → утга)-аар шалгана, жишээ нь `{"$.skippedLines": 4}`.
- **TST-GS-10. Preview = Post.** `action`-ийн нэр `*.post` бол runner эхлээд ижил оролтоор `*.preview` ажиллуулж, preview-ийн мөрүүд post-ийн мөртэй (дугаар, `id`-аас бусдаар) таарахыг шалгана (TST-P-05). Үүнийг `previewCheck: false`-оор зөвхөн preview байхгүй үйлдэлд унтраана.
- **TST-GS-11. Огноо.** `at` нь `YYYY-MM-DDThh:mm` (УБ). Posting огноо `input`-д заагаагүй бол `at`-ийн огноо (FR-SAL-001-ийн анхдагч "өнөөдөр").
- **TST-GS-12. Тайлан.** `expect.reports[].rows[]` нь мөрийн код ба баганаар утга. Тайланг API-аар (`GET /reports/...`, `POST /financial-reports/{id}:run`) гаргаж харьцуулна. Харуулах бөөрөнхийлөлтийг (0/2 орон) биш, API-ийн string утгыг харьцуулна.
- **TST-GS-18. YAML-ийн аюулгүй хэлбэр.** YAML 1.2 core schema-аар уншина. `no`, `yes`, `on`, `off`, `y`, `n`-ийг **түлхүүр** (key) болгон хэрэглэхгүй (YAML 1.1-д boolean болж хувирдаг): баримтын дугаар нь `documentNo`, мастер өгөгдлийн код нь `code`. Дансны дугаар (`"1100"`), огноо (`"2026-03-02"`), огноо-цаг (`"2026-03-02T10:15"`), дүн (`"22000.00"`), `rules: "2027"`-ийг заавал хашилтад бичнэ. Runner нь хашилтгүй тоон дүнг `GS-E001`-ээр татгалзана.
- **TST-GS-20. Fault injection.** Алхмын `faultInjection` (`AFTER_NUMBER_ALLOCATION` = дугаар олгосны дараа, `BEFORE_COMMIT` = deferred trigger-ийн дараа, COMMIT-ийн өмнө) нь зөвхөн `Testing` орчинд бүртгэгддэг `IPostingFaultInjector`-оор exception шидэж ROLLBACK хийлгэнэ. Хүлээгдэх хариу 500 `api.internal_error`. Production build-д энэ интерфейсийн бүртгэл байхгүйг architecture тест шалгана. Preview-д fault хэрэглэхгүй (GS-GL-015).

### 11.5 Default invariant (алхам бүрийн дараа ба төгсгөлд)

Runner нь scenario бүрийн **төгсгөлд**, мөн posting хийсэн **алхам бүрийн дараа** доорх шалгалтыг автоматаар хийнэ. Аль нэг нь зөрвөл `GS-E030`.

| ID | Шалгалт (SQL/API) | Эх |
|---|---|---|
| I-01 | `transaction_no` бүрд Σ `gl_entry.amount` = 0 ба ≥ 1 entry | INV-01 |
| I-02 | `rpt.fn_trial_balance(<компанийн эхний санхүүгийн жилийн эхлэл>, today, p_include_closing => true)`: Σ эхний = 0, Σ дебит гүйлгээ = Σ кредит гүйлгээ, Σ эцсийн = 0. (Эхний жилээс эхлүүлж, хаалтын бичилтийг оруулснаар хаагдаагүй өмнөх жилийн орлого/зардлын дансны асуудал гарахгүй; §20 SCR-T01) | FR-RPT-001 AC1 |
| I-03 | `party.v_cust_ledger_entry_check`, `party.v_vendor_ledger_entry_check` хоосон | INV-04 |
| I-04 | `party.v_receivables_reconciliation`, `party.v_payables_reconciliation`: `difference = 0` | INV-11, NFR-005 |
| I-05 | Мөнгөний данс бүрд Σ `bank_ledger_entry.amount_lcy` = харгалзах G/L дансны үлдэгдэл (`bank_account_posting_group`) | FR-BNK-001 AC1 |
| I-06 | НӨАТ ([08 §6.12, BR-TAX-82](./08-tax-vat-mn.md)): `Σ gl(2300) = Σ amount (SALE, ¬closed)`; `Σ gl(1300) = Σ amount (PURCHASE, ¬closed)`; `Σ gl(2305) = −Σ (amount + non_deductible_amount) (PURCHASE REVERSE_CHARGE, ¬closed)`. Компанийн VAT posting setup-ийн данс өөр бол setup-ийн дансаар | NFR-005 |
| I-07 | Компанид `entry_no` (ledger бүрд), `transaction_no`, `gl_register.no`, posted баримтын дугаар (цувралын мөр бүрд) `1..n` завсаргүй | INV-08, INV-09, M10 |
| I-08 | Хадгалсан MNT дүн бүр `round(x, 2) = x` (AssertNoHiddenRounding) | INV-23 |
| I-09 | Post алхам бүрд preview = post (TST-GS-10) | [02 §6.7](./02-architecture.md) |
| I-10 | `gl_entry.global_dim_*` = dimension set-ээс гарсан утга | INV-29 |
| I-11 | SUCCESS eBarimt баримт бүрд Σ line = Σ sub-receipt = толгой; толгой = ledger (AMT-05) | [12 §6](./12-ebarimt-integration.md) |
| I-12 | DB-ийн текст/jsonb баганад `QR-CANARY`, `LOTTERY-CANARY` олдохгүй | INV-15 |
| I-13 | (CR-15 хэрэгжсэний дараа) `gl_register`-ийн hash chain баталгаажна | FR-GL-028 |

I-01…I-08-ийг нэг SQL функцээр (§20 SCR-T02 `platform.fn_integrity_report`) хийх нь зорилт. Тэр болтол runner өөрөө SQL-ээр хийнэ.

### 11.6 JSON Schema

Файл: `tests/Golden/golden-scenario.schema.json`. Runner YAML-ийг JSON болгоод (YamlDotNet → `System.Text.Json`) энэ schema-аар шалгана (`JsonSchema.Net`). Шалгалт амжилтгүй бол `GS-E001`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.mn-erp.local/golden-scenario/v1.json",
  "title": "MN micro ERP golden scenario v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "id", "title", "area", "release", "rules", "refs", "signedOffBy", "setup", "steps"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "id": { "$ref": "#/$defs/scenarioId" },
    "title": { "type": "string", "minLength": 5, "maxLength": 160 },
    "description": { "type": "string" },
    "area": { "enum": ["GL", "VAT", "SAL", "AR", "PUR", "AP", "CASH", "REC", "FX", "CLOSE", "RPT", "EBR", "FA", "INV"] },
    "release": { "enum": ["R1", "R2", "R3"] },
    "rules": { "enum": ["NOW", "2027"] },
    "status": { "enum": ["SIGNED", "DEPRECATED"], "default": "SIGNED" },
    "refs": {
      "type": "array", "minItems": 1, "uniqueItems": true,
      "items": { "type": "string", "pattern": "^((FR|NFR|CMP)-[A-Z0-9-]+|D-[A-K][0-9]+|INV-[0-9]{2}|AT-[A-Z]+-[0-9]+|ADR-[0-9]{4}|TST-[A-Z]+-[0-9]{2})$" }
    },
    "tags": { "type": "array", "items": { "type": "string", "pattern": "^[a-z0-9-]+$" }, "uniqueItems": true },
    "extends": { "$ref": "#/$defs/scenarioId" },
    "signedOffBy": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/signOff" } },
    "variants": { "type": "array", "items": { "$ref": "#/$defs/variant" } },
    "setup": { "$ref": "#/$defs/setup" },
    "steps": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/step" } },
    "expect": { "$ref": "#/$defs/expectations" },
    "invariants": {
      "type": "object", "additionalProperties": false, "required": ["disable", "reason"],
      "properties": {
        "disable": { "type": "array", "items": { "type": "string", "pattern": "^I-[0-9]{2}$" }, "minItems": 1 },
        "reason": { "type": "string", "minLength": 10 }
      }
    }
  },
  "$defs": {
    "scenarioId": { "type": "string", "pattern": "^GS-(GL|VAT|SAL|AR|PUR|AP|CASH|REC|FX|CLOSE|RPT|EBR|FA|INV)-[0-9]{3}$" },
    "money": { "type": "string", "pattern": "^-?(0|[1-9][0-9]{0,14})\\.[0-9]{2}$" },
    "fcyAmount": { "type": "string", "pattern": "^-?(0|[1-9][0-9]{0,14})(\\.[0-9]{1,4})?$" },
    "unitPrice": { "type": "string", "pattern": "^(0|[1-9][0-9]{0,12})(\\.[0-9]{1,6})?$" },
    "qty": { "type": "string", "pattern": "^-?(0|[1-9][0-9]{0,13})(\\.[0-9]{1,5})?$" },
    "rate": { "type": "string", "pattern": "^(0|[1-9][0-9]{0,9})(\\.[0-9]{1,18})?$" },
    "percent": { "type": "string", "pattern": "^(100(\\.0{1,5})?|[0-9]{1,2}(\\.[0-9]{1,5})?)$" },
    "date": { "type": "string", "pattern": "^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$" },
    "businessTime": { "type": "string", "pattern": "^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]$" },
    "accountNo": { "type": "string", "pattern": "^[0-9]{4}$" },
    "code": { "type": "string", "pattern": "^[A-Z0-9_\\-\\.]{1,20}$" },
    "key": { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9_-]{0,30}$" },
    "varRef": { "type": "string", "pattern": "^\\$[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z0-9_]+)*$" },
    "relEntry": { "type": "string", "pattern": "^(#[0-9]{1,4}|\\$[a-zA-Z][a-zA-Z0-9_.]*)$" },
    "relTx": { "type": "string", "pattern": "^(T[0-9]{1,3}|\\$[a-zA-Z][a-zA-Z0-9_.]*)$" },
    "errorCode": { "type": "string", "pattern": "^[a-z]+(\\.[a-z0-9_]+)+$" },
    "documentNo": { "type": "string", "pattern": "^([A-Z]{1,4}-20[0-9]{2}-[0-9]{5}|\\*\\*\\*|\\$[a-zA-Z][a-zA-Z0-9_.]*)$" },

    "signOff": {
      "type": "object", "additionalProperties": false, "required": ["name", "role", "date"],
      "properties": {
        "name": { "type": "string", "minLength": 2 },
        "role": { "enum": ["ACCOUNTING_ADVISOR", "TAX_ADVISOR", "PILOT_ACCOUNTANT", "LEDGER_OWNER"] },
        "date": { "$ref": "#/$defs/date" },
        "note": { "type": "string" }
      }
    },
    "variant": {
      "type": "object", "additionalProperties": false, "required": ["name", "rules"],
      "properties": {
        "name": { "$ref": "#/$defs/key" },
        "rules": { "enum": ["NOW", "2027"] },
        "shiftDates": { "type": "string", "pattern": "^[+-][0-9]{1,2}[DMY]$" },
        "expectOverride": { "type": "object", "additionalProperties": { "$ref": "#/$defs/expectations" } }
      }
    },

    "setup": {
      "type": "object", "additionalProperties": false, "required": ["baseline", "companies"],
      "properties": {
        "baseline": { "enum": ["BASE-VAT", "BASE-NONVAT", "NONE"] },
        "users": { "type": "array", "items": { "$ref": "#/$defs/user" } },
        "companies": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/companySetup" } },
        "posapiMock": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "receiptTimeoutSeconds": { "type": "integer", "minimum": 1, "maximum": 20 },
            "faults": { "type": "array", "items": { "type": "object", "required": ["merchantTin", "fault"],
              "properties": { "merchantTin": { "type": "string", "pattern": "^[0-9]{11,14}$" },
                              "fault": { "enum": ["SUCCESS", "DELAY", "REJECT", "EMPTY_RESPONSE", "CONNECTION_RESET", "HTTP_502", "MALFORMED", "AMOUNT_MISMATCH", "DOWN"] } } } }
          }
        }
      }
    },
    "user": {
      "type": "object", "additionalProperties": false, "required": ["key", "role"],
      "properties": {
        "key": { "$ref": "#/$defs/key" },
        "role": { "enum": ["OWNER", "ACCOUNTANT", "EXTERNAL_ACCOUNTANT", "SALES_CLERK", "VIEWER"] },
        "companies": { "type": "array", "items": { "$ref": "#/$defs/key" } }
      }
    },
    "companySetup": {
      "type": "object", "additionalProperties": false, "required": ["key"],
      "properties": {
        "key": { "$ref": "#/$defs/key" },
        "name": { "type": "string" },
        "profile": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "vatRegistered": { "type": "boolean" },
            "cityTaxPayer": { "type": "boolean" },
            "tin": { "type": "string", "pattern": "^[0-9]{11,14}$" },
            "districtCode": { "type": "string", "pattern": "^[0-9]{4}$" },
            "firstFiscalYear": { "type": "integer", "minimum": 2020, "maximum": 2100 },
            "invoiceRoundingEnabled": { "type": "boolean" },
            "allowPostingFrom": { "$ref": "#/$defs/date" },
            "allowPostingTo": { "$ref": "#/$defs/date" },
            "maxVatDifferenceAllowed": { "$ref": "#/$defs/money" },
            "salesDiscountPosting": { "enum": ["NO_DISCOUNTS", "INVOICE_DISCOUNTS", "LINE_DISCOUNTS", "ALL_DISCOUNTS"] },
            "globalDimensions": { "type": "array", "maxItems": 2, "items": { "$ref": "#/$defs/code" } }
          }
        },
        "overrides": { "$ref": "#/$defs/overrides" },
        "openingBalances": { "$ref": "#/$defs/openingBalances" }
      }
    },
    "overrides": {
      "type": "object", "additionalProperties": false,
      "properties": {
        "glAccounts": { "type": "array", "items": { "type": "object", "required": ["account"], "properties": {
          "account": { "$ref": "#/$defs/accountNo" }, "blocked": { "type": "boolean" }, "directPosting": { "type": "boolean" },
          "vatProdPostingGroup": { "$ref": "#/$defs/code" } }, "additionalProperties": false } },
        "generalPostingSetup": { "type": "array", "items": { "type": "object", "required": ["bus", "prod"], "properties": {
          "bus": { "type": ["string", "null"] }, "prod": { "$ref": "#/$defs/code" }, "delete": { "type": "boolean" },
          "salesAccount": { "$ref": "#/$defs/accountNo" }, "purchaseAccount": { "$ref": "#/$defs/accountNo" },
          "blocked": { "type": "boolean" } }, "additionalProperties": false } },
        "periods": { "type": "array", "items": { "type": "object", "required": ["month", "status"], "properties": {
          "month": { "type": "string", "pattern": "^20[0-9]{2}-(0[1-9]|1[0-2])$" }, "status": { "enum": ["OPEN", "CLOSED", "LOCKED"] } },
          "additionalProperties": false } },
        "vatReturnPeriods": { "type": "array", "items": { "type": "object", "required": ["month", "status"], "properties": {
          "month": { "type": "string", "pattern": "^20[0-9]{2}-(0[1-9]|1[0-2])$" }, "status": { "enum": ["OPEN", "CLOSED", "SUBMITTED"] } },
          "additionalProperties": false } },
        "bankAccounts": { "type": "array", "items": { "type": "object", "required": ["code", "kind", "postingGroup"], "properties": {
          "code": { "$ref": "#/$defs/code" }, "kind": { "enum": ["BANK", "CASH", "WALLET"] }, "postingGroup": { "$ref": "#/$defs/code" },
          "currency": { "type": "string", "pattern": "^[A-Z]{3}$" }, "bankAccountNo": { "type": "string" },
          "balanceLastStatement": { "$ref": "#/$defs/money" }, "lastStatementNo": { "type": "string" },
          "preventNegativeBalance": { "type": "boolean" } }, "additionalProperties": false } },
        "customers": { "type": "array", "items": { "$ref": "#/$defs/party" } },
        "vendors": { "type": "array", "items": { "$ref": "#/$defs/party" } },
        "items": { "type": "array", "items": { "type": "object", "required": ["code", "genProd", "vatProd"], "properties": {
          "code": { "$ref": "#/$defs/code" }, "name": { "type": "string" }, "type": { "enum": ["SERVICE", "NON_INVENTORY", "INVENTORY"] },
          "genProd": { "$ref": "#/$defs/code" }, "vatProd": { "$ref": "#/$defs/code" },
          "classificationCode": { "type": "string", "pattern": "^[0-9]{7}$" }, "taxProductCode": { "type": "string" },
          "measureUnit": { "type": "string" }, "barCode": { "type": "string" } }, "additionalProperties": false } },
        "dimensions": { "type": "array", "items": { "type": "object", "required": ["code", "values"], "properties": {
          "code": { "$ref": "#/$defs/code" }, "values": { "type": "array", "items": { "$ref": "#/$defs/code" } } },
          "additionalProperties": false } },
        "vatPostingSetup": { "type": "array", "items": { "type": "object", "required": ["bus", "prod"], "properties": {
          "bus": { "$ref": "#/$defs/code" }, "prod": { "$ref": "#/$defs/code" },
          "ebarimtTaxProductCode": { "type": ["string", "null"] }, "nonDeductibleVatPercent": { "$ref": "#/$defs/percent" } },
          "additionalProperties": false } },
        "fiscalYears": { "description": "Baseline-ийн санхүүгийн жилийн жагсаалтыг орлоно", "type": "array", "items": { "type": "integer", "minimum": 2020, "maximum": 2100 } },
        "currencies": { "type": "array", "items": { "type": "string", "pattern": "^[A-Z]{3}$" } },
        "exchangeRates": { "type": "array", "items": { "type": "object", "required": ["currency", "startingDate", "rate"], "properties": {
          "currency": { "type": "string", "pattern": "^[A-Z]{3}$" }, "startingDate": { "$ref": "#/$defs/date" },
          "rate": { "$ref": "#/$defs/rate" } }, "additionalProperties": false } },
        "ebarimt": { "type": "object", "additionalProperties": false, "properties": {
          "enabled": { "type": "boolean" }, "merchantTin": { "type": "string", "pattern": "^[0-9]{11,14}$" },
          "posNo": { "type": "string" }, "nonVatPayerTaxType": { "enum": ["NOT_VAT", "VAT_FREE"] } } },
        "textToAccountRules": { "type": "array", "items": { "type": "object", "required": ["text", "direction", "account"], "properties": {
          "text": { "type": "string" }, "direction": { "enum": ["IN", "OUT"] }, "account": { "$ref": "#/$defs/accountNo" } },
          "additionalProperties": false } },
        "taxParameters": { "type": "array", "items": { "type": "object", "required": ["paramCode", "effectiveFrom", "value"], "properties": {
          "paramCode": { "type": "string" }, "effectiveFrom": { "$ref": "#/$defs/date" }, "effectiveTo": { "$ref": "#/$defs/date" },
          "value": { "type": "string" } }, "additionalProperties": false } }
      }
    },
    "party": {
      "type": "object", "additionalProperties": false, "required": ["code"],
      "properties": {
        "code": { "$ref": "#/$defs/code" }, "name": { "type": "string" },
        "kind": { "enum": ["ORGANIZATION", "INDIVIDUAL", "FOREIGN"] },
        "tin": { "type": "string", "pattern": "^[0-9]{7,14}$" },
        "postingGroup": { "$ref": "#/$defs/code" }, "genBus": { "$ref": "#/$defs/code" }, "vatBus": { "$ref": "#/$defs/code" },
        "paymentTerms": { "$ref": "#/$defs/code" }, "paymentMethod": { "$ref": "#/$defs/code" },
        "pricesIncludingVat": { "type": "boolean" }, "currency": { "type": "string", "pattern": "^[A-Z]{3}$" },
        "bankAccountNo": { "type": "string" }, "blocked": { "type": "boolean" },
        "applicationMethod": { "enum": ["MANUAL", "APPLY_TO_OLDEST"] }
      }
    },
    "openingBalances": {
      "type": "object", "additionalProperties": false, "required": ["date"],
      "properties": {
        "date": { "$ref": "#/$defs/date" },
        "gl": { "type": "array", "items": { "$ref": "#/$defs/drCrLine" } },
        "bank": { "type": "array", "items": { "type": "object", "required": ["bankAccount"], "properties": {
          "bankAccount": { "$ref": "#/$defs/code" }, "dr": { "$ref": "#/$defs/money" }, "cr": { "$ref": "#/$defs/money" } },
          "additionalProperties": false } },
        "customers": { "type": "array", "items": { "$ref": "#/$defs/openItem" } },
        "vendors": { "type": "array", "items": { "$ref": "#/$defs/openItem" } }
      }
    },
    "openItem": {
      "type": "object", "additionalProperties": false, "required": ["party", "documentNo", "documentDate", "dueDate", "amount"],
      "properties": {
        "party": { "$ref": "#/$defs/code" }, "documentNo": { "type": "string" }, "documentType": { "enum": ["INVOICE", "CREDIT_MEMO", "PAYMENT"] },
        "documentDate": { "$ref": "#/$defs/date" }, "dueDate": { "$ref": "#/$defs/date" }, "amount": { "$ref": "#/$defs/money" }
      }
    },
    "drCrLine": {
      "type": "object", "required": ["account"],
      "properties": {
        "account": { "$ref": "#/$defs/accountNo" },
        "dr": { "$ref": "#/$defs/money" }, "cr": { "$ref": "#/$defs/money" },
        "transaction": { "$ref": "#/$defs/relTx" },
        "documentNo": { "$ref": "#/$defs/documentNo" },
        "postingDate": { "$ref": "#/$defs/date" },
        "isClosing": { "type": "boolean" },
        "sourceCode": { "$ref": "#/$defs/code" },
        "reasonCode": { "$ref": "#/$defs/code" },
        "dimensions": { "type": "object", "additionalProperties": { "$ref": "#/$defs/code" } },
        "vatAmount": { "$ref": "#/$defs/money" },
        "reversedEntry": { "$ref": "#/$defs/relEntry" },
        "entry": { "$ref": "#/$defs/relEntry" }
      },
      "oneOf": [ { "required": ["dr"], "not": { "required": ["cr"] } }, { "required": ["cr"], "not": { "required": ["dr"] } } ],
      "additionalProperties": false
    },

    "step": {
      "type": "object", "additionalProperties": false, "required": ["id", "at", "action"],
      "properties": {
        "id": { "$ref": "#/$defs/key" },
        "title": { "type": "string" },
        "at": { "$ref": "#/$defs/businessTime" },
        "as": { "$ref": "#/$defs/key" },
        "company": { "$ref": "#/$defs/key" },
        "action": { "$ref": "#/$defs/action" },
        "input": { "type": "object" },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 200 },
        "previewCheck": { "type": "boolean", "default": true },
        "repeat": { "type": "integer", "minimum": 1, "maximum": 10 },
        "faultInjection": { "enum": ["AFTER_NUMBER_ALLOCATION", "BEFORE_COMMIT"] },
        "expectOutcome": {
          "type": "object", "additionalProperties": false, "required": ["status"],
          "properties": {
            "status": { "enum": ["OK", "ERROR"] },
            "http": { "type": "integer", "minimum": 200, "maximum": 599 },
            "codes": { "type": "array", "items": { "$ref": "#/$defs/errorCode" }, "uniqueItems": true },
            "headers": { "type": "object", "additionalProperties": { "type": "string" } },
            "bodyContains": { "type": "object", "additionalProperties": { "type": ["string", "number", "boolean", "null"] } }
          }
        },
        "capture": { "type": "object", "additionalProperties": { "type": "string", "pattern": "^\\$\\..+" } },
        "expect": { "$ref": "#/$defs/expectations" }
      }
    },
    "action": {
      "enum": [
        "openingBalance.post", "journal.post", "journal.preview", "standardJournal.copy",
        "salesInvoice.post", "salesInvoice.preview", "salesInvoice.cancel", "salesCreditMemo.post",
        "purchaseInvoice.post", "purchaseCreditMemo.post", "purchaseReceipt.register", "purchaseReceipt.confirm",
        "payment.post", "cashCount.post", "transfer.post",
        "ledgerEntry.apply", "ledgerEntry.unapply", "ledgerEntry.editDueDate",
        "transaction.reverse", "transaction.correctionProposal", "register.reverse",
        "bankStatement.import", "bankReconciliation.create", "bankReconciliation.autoMatch",
        "bankReconciliation.match", "bankReconciliation.post", "bankAccountStatement.undo",
        "period.close", "period.reopen", "period.lock", "fiscalYear.close",
        "vatReturn.close", "vatReturn.submit", "vatReturn.reopen", "vatEntry.rejectDeduction",
        "fx.rate.set", "fx.revalue",
        "ebarimt.dispatch", "ebarimt.resolve", "ebarimt.resend", "ebarimt.confirmManualVoid",
        "job.run", "report.run", "settings.update", "clock.advance"
      ]
    },

    "expectations": {
      "type": "object", "additionalProperties": false,
      "properties": {
        "noRowsWritten": { "type": "boolean" },
        "glMatch": { "enum": ["exact", "byAccount"] },
        "matchReason": { "type": "string" },
        "exhaustive": { "type": "boolean", "default": true },
        "documents": { "type": "array", "items": { "$ref": "#/$defs/documentExp" } },
        "glEntries": { "type": "array", "items": { "$ref": "#/$defs/drCrLine" } },
        "vatEntries": { "type": "array", "items": { "$ref": "#/$defs/vatEntryExp" } },
        "custLedgerEntries": { "type": "array", "items": { "$ref": "#/$defs/partyEntryExp" } },
        "vendorLedgerEntries": { "type": "array", "items": { "$ref": "#/$defs/partyEntryExp" } },
        "detailedEntries": { "type": "array", "items": { "$ref": "#/$defs/detailedExp" } },
        "bankLedgerEntries": { "type": "array", "items": { "$ref": "#/$defs/bankEntryExp" } },
        "cashVouchers": { "type": "array", "items": { "type": "object", "required": ["type", "documentNo"], "properties": {
          "type": { "enum": ["RECEIPT", "PAYMENT"] }, "documentNo": { "$ref": "#/$defs/documentNo" }, "amount": { "$ref": "#/$defs/money" },
          "bankAccount": { "$ref": "#/$defs/code" }, "amountInWords": { "type": "string" } }, "additionalProperties": false } },
        "balances": { "type": "array", "items": { "type": "object", "required": ["account", "asOf"], "properties": {
          "account": { "$ref": "#/$defs/accountNo" }, "asOf": { "$ref": "#/$defs/date" }, "includeClosing": { "type": "boolean" },
          "dr": { "$ref": "#/$defs/money" }, "cr": { "$ref": "#/$defs/money" }, "zero": { "const": true } },
          "additionalProperties": false } },
        "partyBalances": { "type": "array", "items": { "type": "object", "required": ["party", "asOf", "balanceLcy"], "properties": {
          "party": { "$ref": "#/$defs/code" }, "asOf": { "$ref": "#/$defs/date" }, "balanceLcy": { "$ref": "#/$defs/money" } },
          "additionalProperties": false } },
        "trialBalance": { "$ref": "#/$defs/trialBalanceExp" },
        "reports": { "type": "array", "items": { "$ref": "#/$defs/reportExp" } },
        "ebarimt": { "type": "array", "items": { "$ref": "#/$defs/ebarimtExp" } },
        "outbox": { "type": "array", "items": { "type": "object", "required": ["topic", "status"], "properties": {
          "topic": { "type": "string" }, "status": { "enum": ["PENDING", "PROCESSING", "DONE", "DEAD", "CANCELLED"] },
          "count": { "type": "integer", "minimum": 0 } }, "additionalProperties": false } },
        "numbering": { "type": "array", "items": { "type": "object", "required": ["series", "lastNo"], "properties": {
          "series": { "$ref": "#/$defs/code" }, "year": { "type": "integer" }, "lastNo": { "type": ["string", "null"] } },
          "additionalProperties": false } },
        "periods": { "type": "array", "items": { "type": "object", "required": ["month", "status"], "properties": {
          "month": { "type": "string" }, "status": { "enum": ["OPEN", "CLOSED", "LOCKED"] } }, "additionalProperties": false } },
        "notifications": { "type": "array", "items": { "type": "object", "required": ["code"], "properties": {
          "code": { "type": "string" }, "absent": { "type": "boolean" }, "contains": { "type": "string" } },
          "additionalProperties": false } },
        "auditEvents": { "type": "array", "items": { "type": "object", "required": ["eventType"], "properties": {
          "eventType": { "type": "string" }, "count": { "type": "integer" } }, "additionalProperties": false } },
        "posapiCalls": { "type": "object", "additionalProperties": false, "properties": {
          "post": { "type": "integer", "minimum": 0 }, "delete": { "type": "integer", "minimum": 0 } } }
      }
    },
    "documentExp": {
      "type": "object", "required": ["kind"],
      "properties": {
        "kind": { "enum": ["SALES_INVOICE", "SALES_CR_MEMO", "PURCHASE_INVOICE", "PURCHASE_CR_MEMO", "CASH_VOUCHER", "JOURNAL", "PAYMENT", "CLOSING", "OPENING"] },
        "documentNo": { "$ref": "#/$defs/documentNo" }, "ref": { "$ref": "#/$defs/varRef" },
        "status": { "type": "string" }, "remaining": { "$ref": "#/$defs/money" },
        "amountIncludingVat": { "$ref": "#/$defs/money" }, "vatAmount": { "$ref": "#/$defs/money" },
        "cancelledBy": { "$ref": "#/$defs/varRef" }
      },
      "additionalProperties": false
    },
    "vatEntryExp": {
      "type": "object", "required": ["type", "base", "amount"],
      "properties": {
        "type": { "enum": ["SALE", "PURCHASE", "SETTLEMENT"] },
        "vatCategory": { "enum": ["VAT10", "VAT0", "EXEMPT", "NOVAT"] },
        "calcType": { "enum": ["NORMAL", "REVERSE_CHARGE", "FULL_VAT"] },
        "vatPercent": { "$ref": "#/$defs/percent" },
        "base": { "$ref": "#/$defs/money" }, "amount": { "$ref": "#/$defs/money" },
        "nonDeductibleBase": { "$ref": "#/$defs/money" }, "nonDeductibleAmount": { "$ref": "#/$defs/money" },
        "nonDeductibleReason": { "enum": ["PASSENGER_CAR", "PERSONAL_USE", "EXEMPT_RELATED", "NO_EBARIMT", "NON_VAT_COMPANY", "SIMPLIFIED_REGIME", "REJECTED"] },
        "vatDifference": { "$ref": "#/$defs/money" },
        "vatDate": { "$ref": "#/$defs/date" }, "deductibleConfirmed": { "type": "boolean" },
        "supplierDdtd": { "type": "string", "pattern": "^([0-9]{33}|\\$[a-zA-Z][a-zA-Z0-9_.]*)$" },
        "closed": { "type": "boolean" }, "ebarimtTaxType": { "enum": ["VAT_ABLE", "VAT_ZERO", "VAT_FREE", "NOT_VAT"] }
      },
      "additionalProperties": false
    },
    "partyEntryExp": {
      "type": "object", "required": ["party", "documentType"],
      "properties": {
        "entry": { "$ref": "#/$defs/relEntry" }, "party": { "$ref": "#/$defs/code" },
        "documentType": { "enum": ["INVOICE", "CREDIT_MEMO", "PAYMENT", "REFUND"] },
        "documentNo": { "$ref": "#/$defs/documentNo" }, "dueDate": { "$ref": "#/$defs/date" },
        "currency": { "type": "string" }, "amount": { "$ref": "#/$defs/fcyAmount" }, "amountLcy": { "$ref": "#/$defs/money" },
        "remaining": { "$ref": "#/$defs/fcyAmount" }, "remainingLcy": { "$ref": "#/$defs/money" },
        "open": { "type": "boolean" }, "closedBy": { "$ref": "#/$defs/relEntry" }, "closedAtDate": { "$ref": "#/$defs/date" }
      },
      "additionalProperties": false
    },
    "detailedExp": {
      "type": "object", "required": ["ledgerEntry", "entryType", "amountLcy"],
      "properties": {
        "ledgerEntry": { "$ref": "#/$defs/relEntry" },
        "entryType": { "enum": ["INITIAL", "APPLICATION", "UNREALIZED_LOSS", "UNREALIZED_GAIN", "REALIZED_LOSS", "REALIZED_GAIN", "APPL_ROUNDING", "CORRECTION_OF_REMAINING_AMOUNT"] },
        "amount": { "$ref": "#/$defs/fcyAmount" }, "amountLcy": { "$ref": "#/$defs/money" },
        "appliedTo": { "$ref": "#/$defs/relEntry" }, "unapplied": { "type": "boolean" },
        "withoutGl": { "type": "boolean" }, "postingDate": { "$ref": "#/$defs/date" }
      },
      "additionalProperties": false
    },
    "bankEntryExp": {
      "type": "object", "required": ["bankAccount", "amount"],
      "properties": {
        "bankAccount": { "$ref": "#/$defs/code" }, "amount": { "$ref": "#/$defs/fcyAmount" }, "amountLcy": { "$ref": "#/$defs/money" },
        "documentNo": { "$ref": "#/$defs/documentNo" }, "open": { "type": "boolean" },
        "statementStatus": { "enum": ["OPEN", "BANK_ACC_ENTRY_APPLIED", "CLOSED"] }, "statementNo": { "type": "string" }
      },
      "additionalProperties": false
    },
    "trialBalanceExp": {
      "type": "object", "required": ["from", "to"],
      "properties": {
        "from": { "$ref": "#/$defs/date" }, "to": { "$ref": "#/$defs/date" }, "includeClosing": { "type": "boolean" },
        "exhaustive": { "type": "boolean" },
        "rows": { "type": "array", "items": { "type": "object", "required": ["account"], "properties": {
          "account": { "$ref": "#/$defs/accountNo" },
          "openingDr": { "$ref": "#/$defs/money" }, "openingCr": { "$ref": "#/$defs/money" },
          "periodDr": { "$ref": "#/$defs/money" }, "periodCr": { "$ref": "#/$defs/money" },
          "closingDr": { "$ref": "#/$defs/money" }, "closingCr": { "$ref": "#/$defs/money" } }, "additionalProperties": false } },
        "totals": { "type": "object", "properties": {
          "periodDr": { "$ref": "#/$defs/money" }, "periodCr": { "$ref": "#/$defs/money" },
          "closingDr": { "$ref": "#/$defs/money" }, "closingCr": { "$ref": "#/$defs/money" } }, "additionalProperties": false }
      },
      "additionalProperties": false
    },
    "reportExp": {
      "type": "object", "required": ["report", "rows"],
      "properties": {
        "report": { "enum": ["SBT", "ODT", "OOT", "MGT", "TB", "GL", "TT03A", "TT03A_UNCONFIRMED", "AR_AGING", "AP_AGING", "EBALANCE_SBT", "BANK_REC", "CUST_STATEMENT", "PERIOD_CLOSE_CHECKLIST"] },
        "params": { "type": "object" },
        "rows": { "type": "array", "items": { "type": "object", "required": ["row"], "properties": {
          "row": { "type": "string" }, "column": { "type": "string" }, "value": { "type": ["string", "null"] },
          "count": { "type": "integer" } }, "additionalProperties": false } }
      },
      "additionalProperties": false
    },
    "ebarimtExp": {
      "type": "object", "required": ["source", "status"],
      "properties": {
        "source": { "$ref": "#/$defs/varRef" },
        "operation": { "enum": ["SAVE", "DELETE"] },
        "type": { "enum": ["B2C_RECEIPT", "B2B_RECEIPT", "B2C_INVOICE", "B2B_INVOICE"] },
        "status": { "enum": ["NONE", "PENDING", "SENT", "SUCCESS", "ERROR", "UNKNOWN", "CANCELLED"] },
        "errorCode": { "$ref": "#/$defs/errorCode" },
        "totalAmount": { "$ref": "#/$defs/money" }, "totalVat": { "$ref": "#/$defs/money" }, "totalCityTax": { "$ref": "#/$defs/money" },
        "billIdSuffix": { "type": "string", "pattern": "^[0-9]{9}$" },
        "customerTin": { "type": ["string", "null"] }, "consumerNo": { "type": ["string", "null"] },
        "inactiveIdOf": { "$ref": "#/$defs/varRef" }, "reportMonth": { "type": ["string", "null"] },
        "receipts": { "type": "array", "items": { "type": "object", "required": ["taxType", "totalAmount", "totalVat"], "properties": {
          "taxType": { "enum": ["VAT_ABLE", "VAT_ZERO", "VAT_FREE", "NOT_VAT"] },
          "totalAmount": { "$ref": "#/$defs/money" }, "totalVat": { "$ref": "#/$defs/money" } }, "additionalProperties": false } },
        "items": { "type": "array", "items": { "type": "object", "required": ["qty", "unitPrice", "totalAmount", "totalVat"], "properties": {
          "name": { "type": "string" }, "qty": { "$ref": "#/$defs/qty" }, "unitPrice": { "$ref": "#/$defs/money" },
          "totalAmount": { "$ref": "#/$defs/money" }, "totalVat": { "$ref": "#/$defs/money" }, "totalCityTax": { "$ref": "#/$defs/money" },
          "taxType": { "enum": ["VAT_ABLE", "VAT_ZERO", "VAT_FREE", "NOT_VAT"] }, "taxProductCode": { "type": ["string", "null"] } },
          "additionalProperties": false } },
        "payments": { "type": "array", "items": { "type": "object", "required": ["code", "paidAmount"], "properties": {
          "code": { "enum": ["CASH", "PAYMENT_CARD", "BANK_TRANSFER", "BANK_TRANSFER_QPAY"] },
          "status": { "enum": ["PAID", "PAY"] }, "paidAmount": { "$ref": "#/$defs/money" } }, "additionalProperties": false } },
        "previousStatus": { "enum": ["SUCCESS", "CANCELLED"] }
      },
      "additionalProperties": false
    }
  }
}
```

**Schema-ийн хувилбар.** Талбар нэмэх (optional) = v1 хэвээр. Талбарын утгыг өөрчлөх, заавал талбар нэмэх = `schemaVersion: 2` ба бүх файлыг migration скриптээр (`Erp.DevTools golden-migrate`) шинэчилнэ. `action`-ийн enum-д шинэ утга нэмэх нь v1-д зөвшөөрөгдөнө.

### 11.7 Жишээ: GS-SAL-001 (бүтэн файл)

```yaml
schemaVersion: 1
id: GS-SAL-001
title: B2C бэлэн борлуулалт, үнэ НӨАТ-тэй, МХ-1 ба eBarimt B2C_RECEIPT
area: SAL
release: R1
rules: NOW
status: SIGNED
refs: [FR-SAL-005, FR-SAL-006, FR-TAX-005, FR-BNK-002, FR-EBR-002, FR-EBR-006, D-F5, D-C7, INV-13]
signedOffBy:
  - { name: "Нягтлан зөвлөх (нэр батлагдана)", role: ACCOUNTING_ADVISOR, date: "2026-11-02" }
variants:
  - { name: y2027, rules: "2027", shiftDates: "+1Y" }       # 2027 оны параметрээр давтана; хүлээгдэх утга ижил
setup:
  baseline: BASE-VAT
  companies:
    - key: C1
steps:
  - id: s1
    title: Нэхэмжлэх батлах (бэлэн)
    at: "2026-03-02T10:15"
    as: clerk
    company: C1
    action: salesInvoice.post
    idempotencyKey: gs-sal-001-s1-0001
    input:
      customer: C-B2C
      pricesIncludingVat: true
      paymentMethod: CASH
      lines:
        - { item: GD-BREAD, qty: "2", unitPrice: "11000" }
    expectOutcome: { status: OK, http: 201 }
    capture: { inv: "$.id", invNo: "$.documentNo" }
    expect:
      documents:
        - { kind: SALES_INVOICE, documentNo: SI-2026-00001, amountIncludingVat: "22000.00", vatAmount: "2000.00", remaining: "0.00" }
      glEntries:
        - { transaction: T1, account: "1200", dr: "22000.00" }
        - { transaction: T1, account: "5100", cr: "20000.00" }
        - { transaction: T1, account: "2300", cr: "2000.00" }
        - { transaction: T2, account: "1100", dr: "22000.00" }
        - { transaction: T2, account: "1200", cr: "22000.00" }
      vatEntries:
        - { type: SALE, vatCategory: VAT10, calcType: NORMAL, vatPercent: "10", base: "-20000.00", amount: "-2000.00", ebarimtTaxType: VAT_ABLE }
      custLedgerEntries:
        - { entry: "#1", party: C-B2C, documentType: INVOICE, documentNo: SI-2026-00001, amountLcy: "22000.00", remainingLcy: "0.00", open: false }
        - { entry: "#2", party: C-B2C, documentType: PAYMENT, documentNo: SI-2026-00001, amountLcy: "-22000.00", remainingLcy: "0.00", open: false }
      bankLedgerEntries:
        - { bankAccount: CASH01, amount: "22000.00", amountLcy: "22000.00", open: true, statementStatus: OPEN }
      cashVouchers:
        - { type: RECEIPT, documentNo: KO-2026-00001, amount: "22000.00", bankAccount: CASH01 }
      ebarimt:
        - source: $inv
          operation: SAVE
          type: B2C_RECEIPT
          status: SUCCESS
          totalAmount: "22000.00"
          totalVat: "2000.00"
          billIdSuffix: "001000001"
          customerTin: null
          receipts: [ { taxType: VAT_ABLE, totalAmount: "22000.00", totalVat: "2000.00" } ]
          items: [ { qty: "2", unitPrice: "11000.00", totalAmount: "22000.00", totalVat: "2000.00", taxType: VAT_ABLE } ]
          payments: [ { code: CASH, status: PAID, paidAmount: "22000.00" } ]
      posapiCalls: { post: 1 }
  - id: s2
    title: Ижил Idempotency-Key-ээр давтан дуудах
    at: "2026-03-02T10:16"
    as: clerk
    company: C1
    action: salesInvoice.post
    idempotencyKey: gs-sal-001-s1-0001
    input: { ref: $inv }
    previewCheck: false
    expectOutcome: { status: OK, http: 201, headers: { Idempotent-Replayed: "true" } }
    expect:
      noRowsWritten: true
      posapiCalls: { post: 1 }
expect:
  balances:
    - { account: "1200", asOf: "2026-03-31", zero: true }
    - { account: "1100", asOf: "2026-03-31", dr: "22000.00" }
  partyBalances:
    - { party: C-B2C, asOf: "2026-03-31", balanceLcy: "0.00" }
  numbering:
    - { series: SI, year: 2026, lastNo: SI-2026-00001 }
    - { series: KO, year: 2026, lastNo: KO-2026-00001 }
```

> Тэмдэглэл: `posapiCalls` нь алхмын эхнээс тоолсон **хуримтлагдсан** тоо. s2-ын `noRowsWritten` ба `post: 1` нь давтан дуудлагаар PosAPI дахин дуудагдаагүйг харуулна (AT-EB-24).

### 11.8 Runner-ийн алгоритм

```text
function RunScenario(file):
    doc  := YamlToJson(file);  Validate(doc, golden-scenario.schema.json) or fail GS-E001
    if file under Scenarios/ and (doc.signedOffBy empty or doc.status = DEPRECATED and age > 1 release): fail GS-E002
    chain := ResolveExtends(doc)                       // гүн ≤ 3, давталтгүй, эс бөгөөс GS-E003
    for variant in [base] + doc.variants:
        db   := CloneTemplateDb()                      // §4.1
        host := StartApiAndWorker(db, FakeTimeProvider, PosApiMock(chain.setup.posapiMock))
        ApplySetup(chain.setup, variant)               // baseline → fn_provision_company_mn(tenant, company, firstFiscalYear)
                                                       // → overrides (API-аар; API байхгүй тохиргоог app_owner + fn_set_context-оор)
                                                       // → openingBalances (openingBalance.post action-аар, OB цуврал)
                                                       // алдаа → GS-E004
        vars := {}
        for step in chain.steps (+ variant date shift):
            clock.Set(step.at)
            snapshotBefore := LedgerWatermarks(db)     // entry_no, transaction_no, outbox, counters
            if IsPostAction(step.action) and step.previewCheck != false:
                preview := CallApi(PreviewOf(step), as = step.as)
                if preview.error and step.expectOutcome.status = OK: fail GS-E011
            response := CallApi(step, as = step.as, idempotencyKey = step.idempotencyKey ?? NewKey(step))
            AssertOutcome(response, step.expectOutcome)                                   // GS-E010
            if preview present and response OK: AssertPreviewEqualsPost(preview, Delta(db, snapshotBefore))   // GS-E031
            vars.Merge(Capture(response, step.capture))
            actual := Delta(db, snapshotBefore)        // энэ алхмаар үүссэн ledger мөрүүд, баримт, outbox
            AssertExpectations(step.expect, actual, vars, mode = step)                     // GS-E020…E052
            if actual has postings: AssertInvariants(db, chain.invariants)                 // GS-E030
        AssertExpectations(doc.expect (variant override), db, vars, mode = final)
        AssertInvariants(db, chain.invariants)
        on failure: write <file>.actual.yaml (бодит утгаар бөглөсөн хүлээгдэх бүтэц)
                    and <file>.diff.md (хүснэгтээр: хүлээгдсэн | бодит | зөрүү)
        Dispose(host, db)
```

- **TST-GS-13.** Runner action бүрийг **REST API-аар** (`WebApplicationFactory`-ийн HTTP client) гүйцэтгэнэ. Ингэснээр endpoint, эрх, idempotency, сериалчлал бүгд шалгагдана. API-гүй тохиргоог (жишээ нь `taxParameters`, `pos_counter`) setup үед л `app_owner`-оор бичнэ.
- **TST-GS-21. Нэг алхам дахь олон HTTP дуудлага.** `*.post` алхам нь ихэвчлэн 2–3 POST (ноорог үүсгэх, мөр нэмэх, `:post`) болно; POST бүрд `Idempotency-Key` заавал ([14 API-IDEM-01](./14-api.md)). Runner түлхүүрийг тодорхой (deterministic) үүсгэнэ: `:post`/`:cancel` зэрэг үйлдлийн дуудлагад `step.idempotencyKey` (эсвэл `NewKey(step)` = `<scenarioId>-<stepId>`), ноорог үүсгэхэд `<key>:draft`, мөр бүрд `<key>:line:<n>`. `If-Match`-ийг ноорогийн сүүлийн хариуны `ETag`-аас авна (API-ETAG-02). `input.ref`-тэй давтан алхам (GS-SAL-001 s2) ноорог үүсгэхгүй, ижил түлхүүр ба **анхны** `If-Match`-аар зөвхөн үйлдлийн дуудлагыг давтана; replay нь ETag шалгалтаас өмнө ажилладаг тул (API-IDEM-12 "Шат 0") хадгалсан хариу буцна.
- **TST-GS-14.** Алхам бүрийн `as` хэрэглэгчийн role-ийн эрхээр дуудна (seed-ийн built-in role). Эрхгүй үйлдэл 403-аар унах ёстой бол `expectOutcome`-д бичнэ.
- **TST-GS-15.** Scenario бүр ≤ 10 s (2027 variant-аас бусад). Хэтэрвэл тайланд анхааруулга (fail биш). Нийт golden job ≤ 8 мин (§2.2).
- **TST-GS-16.** `.actual.yaml` нь хүлээгдэх үр дүнг **санал** болгоно. Түүнийг шууд хуулж `expect` болгохыг хориглоно. Хүлээгдэх үр дүнг нягтлан тооцож баталгаажуулна (TST-P-02). PR-ийн template-д "golden-ийн хүлээгдэх утгыг хэн тооцсон" гэсэн асуулт байна.

### 11.9 Runner-ийн оношлогооны код

| Код | Утга | Жишээ мессеж |
|---|---|---|
| `GS-E001` | Schema-ийн зөрчил | `steps[2].expect.glEntries[0]: must have exactly one of dr/cr` |
| `GS-E002` | Гарын үсэггүй эсвэл хугацаа нь дууссан DEPRECATED scenario `Scenarios/`-д | `GS-VAT-004: signedOffBy is empty` |
| `GS-E003` | `extends`-ийн гинж буруу (давталт, гүн > 3, олдохгүй) | |
| `GS-E004` | Setup амжилтгүй (provisioning, override, эхний үлдэгдэл) | `override generalPostingSetup(DOMESTIC,SERVICES): account 5999 not found` |
| `GS-E010` | Алхмын үр дүн зөрсөн (OK ↔ ERROR, HTTP, алдааны кодын олонлог, header) | `expected {gl.voucher_unbalanced}, got {}` |
| `GS-E011` | Preview алдаа өгсөн боловч post OK байх ёстой | |
| `GS-E020` | G/L мөр зөрсөн (данс, дүн, тал) | `T1 5110: expected cr 1000.00, actual cr 1100.00` |
| `GS-E021` | Хүлээгдээгүй илүү G/L мөр (`exhaustive`) | `T1: unexpected 5190 dr 100.00` |
| `GS-E022` | VAT entry зөрсөн | |
| `GS-E023` | Харилцагч/нийлүүлэгчийн entry эсвэл detailed entry зөрсөн | |
| `GS-E024` | Банк/кассын entry, кассын баримт зөрсөн | |
| `GS-E025` | Үлдэгдэл (данс, харилцагч) зөрсөн | |
| `GS-E026` | Дугаарлалт зөрсөн | `SI 2026: expected SI-2026-00003, actual SI-2026-00004` |
| `GS-E027` | Үе, баримтын төлөв, outbox зөрсөн | |
| `GS-E030` | Default invariant (I-xx) зөрчигдсөн | `I-04 receivables difference 220.00 on 1200` |
| `GS-E031` | Preview ≠ post | |
| `GS-E040` | Тайлангийн мөр зөрсөн | `SBT 2.2.7 closing: expected 2430000.00` |
| `GS-E050` | eBarimt-ийн баримт/payload зөрсөн | `items[1].totalVat expected 303.03` |
| `GS-E051` | PosAPI-ийн дуудлагын тоо зөрсөн | `post: expected 1, actual 2` |
| `GS-E052` | Мэдэгдэл (notification) зөрсөн | |
| `GS-E090` | Runner-ийн дотоод алдаа (scenario-ийн алдаа биш) | |

### 11.10 Гарын үсэг ба өөрчлөлтийн журам

1. Хөгжүүлэгч эсвэл QA ноорогийг `Drafts/`-д бичнэ. `Erp.DevTools golden-render <file>` нь нягтлан уншихад зориулсан Markdown "scenario card" үүсгэнэ: алхам, Дт/Кт хүснэгт, тайлангийн мөр, монгол тайлбар.
2. Нягтлан зөвлөх хүлээгдэх үр дүнг **бие даан** тооцож шалгаад (кодын гаралтаас биш) PR-д approve хийнэ. `signedOffBy` (нэр, role, огноо) нэмж файлыг `Scenarios/` руу зөөнө.
3. Гарын үсэгтэй scenario-ийн `expect`-ийг өөрчлөх PR нь `@accounting-reviewers`-ийн approval-ыг дахин шаардана (CODEOWNERS), `signedOffBy`-д шинэ мөр нэмнэ. Шалтгааныг PR-д бичнэ: хуулийн өөрчлөлт, DECISIONS-ийн өөрчлөлт, эсвэл scenario-ийн алдаа.
4. **TST-GS-17.** Код өөрчлөгдсөний улмаас golden унасан бол **кодыг** засна. `expect`-ийг кодонд тааруулж өөрчлөхийг хориглоно (3-р алхмын шалтгаангүй бол).

### 11.11 Action-ийн каталог (action → API)

| Action | API ([14 §15](./14-api.md)) | Тайлбар |
|---|---|---|
| `openingBalance.post` | `POST /journals` (template `OPENING`) + `…:post` | D-D7, FR-GL-021; харилцагч/нийлүүлэгчийг баримт тус бүрээр |
| `journal.post` / `journal.preview` | `POST /journals/{id}:post` / `:preview` | Runner ноорог журнал, мөрийг эхлээд үүсгэнэ |
| `standardJournal.copy` | Стандарт журналаас ноорог (FR-GL-016) | |
| `salesInvoice.post` / `.preview` / `.cancel` | `POST /sales-invoices` → `…/{id}:post` / `:preview` / `:cancel` | `input.ref` байвал ноорог үүсгэхгүй |
| `salesCreditMemo.post` | `/sales-credit-memos` | `appliesTo`, `reasonCode` |
| `purchaseInvoice.post`, `purchaseCreditMemo.post` | `/purchase-invoices`, `/purchase-credit-memos` | |
| `purchaseReceipt.register` / `.confirm` | `POST /purchase-receipts`, `POST /purchase-receipts/{id}:confirm` ([12 §18.1](./12-ebarimt-integration.md)) | D-E4. Endpoint OpenAPI-д хараахан байхгүй (§21 CR-T09) |
| `payment.post` | `POST /payments` | Касс (МХ-1/МХ-2), банк, `appliesTo`/`appliesToId` |
| `cashCount.post` | `POST /bank-accounts/{id}:count-cash` | FR-BNK-004 |
| `transfer.post` | `POST /payments` (данс хоорондын) | FR-BNK-007 |
| `ledgerEntry.apply` / `.unapply` / `.editDueDate` | `POST /customer-ledger-entries:apply`, `…/{id}:unapply`, `PATCH …/{id}` (vendor ижил) | |
| `transaction.reverse`, `register.reverse` | `POST /gl-transactions/{id}:reverse`, `/gl-registers/{id}:reverse` | |
| `transaction.correctionProposal` | `GET /gl-transactions/{id}/correction-proposal?date=…&reasonCodeId=…` ([05 BR-PST-51](./05-posting-engine.md)) | Саналыг `capture` хийж дараагийн `journal.post`-ийн `input`-д хэрэглэнэ. Endpoint [api/openapi.yaml](./api/openapi.yaml)-д хараахан байхгүй (§21 CR-T09) |
| `bankStatement.import` | `POST /bank-accounts/{id}/statements:import` | `input.file` = `Fixtures/bank-statements/…` (template хувьсагчтай) |
| `bankReconciliation.*` | `/bank-reconciliations…` (`:auto-match`, `…:match`, `:post`) | |
| `bankAccountStatement.undo` | `POST /bank-account-statements/{id}:undo` | FR-BNK-014 |
| `period.*`, `fiscalYear.close` | `/accounting-periods/{id}:close`, `:reopen`, `:lock`, `/fiscal-years/{id}:close` | `reopen`-д step-up-ийг тестийн handler хангана. Санхүүгийн жилийг дахин нээх API байхгүй (жилийг дахин хаах нь сарыг нээх → `fiscalYear.close` дахин, GS-GL-009) |
| `vatReturn.close` / `.submit` / `.reopen` | `/vat-return-periods/{id}:close` / `:submit` / `:reopen` | `:reopen` нь OpenAPI-д хараахан байхгүй (14 Q19; §21 CR-T09) — тэр болтол GS-VAT-017 `Drafts/`-д |
| `vatEntry.rejectDeduction` | [08 §5.8](./08-tax-vat-mn.md) `:reject-deduction` (R1 · Should) | Endpoint OpenAPI-д байхгүй (§21 CR-T09) |
| `fx.rate.set`, `fx.revalue` (R2) | `/currencies/{id}/exchange-rates`, ханшийн дахин үнэлгээ ([09-bank-cash-fx](./09-bank-cash-fx.md); endpoint OpenAPI-д байхгүй) | |
| `ebarimt.dispatch` | Worker-ийн dispatcher-ийг нэг удаа ажиллуулна (async урсгал) | SYNC_FIRST-д шаардлагагүй |
| `ebarimt.resolve`, `.resend`, `.confirmManualVoid` | `/ebarimt/documents/{id}:resolve`, `:resend`, `:confirm-manual-void` | |
| `job.run` | Quartz job-ийг кодоор (`IJobRunner.RunNow(code, company)`) | `tax.vat_threshold.check` ([08 BR-TAX-86](./08-tax-vat-mn.md)), `ebarimt.lease_reaper` ([12 §10.6](./12-ebarimt-integration.md)) г.м. |
| `report.run` | `GET /reports/...`, `POST /financial-reports/{id}:run` | Үр дүнг `capture` хийж болно |
| `settings.update` | `PATCH /companies/{c}`, `/settings/posting-window` | |
| `clock.advance` | `FakeTimeProvider.Advance(...)` | Timeout, reaper, `reportMonth`-ийн цонх |

---

## 12. Golden scenario-ийн каталог

Каталог нь **R1-ийн 108**, **R2-ийн 14** scenario-г тодорхойлно (нийт 122; GS-GL 20, GS-VAT 22, GS-SAL 13, GS-PUR 15, GS-AP 7, GS-AR 9, GS-CASH 7, GS-REC 4, GS-FX 6, GS-CLOSE 5, GS-RPT 5, GS-EBR 9). Scenario бүрийн хэсгүүд: **зорилго**, **алхам**, **хүлээгдэх гол үр дүн**. YAML файл бичихдээ энд заасан тоог яг хэрэглэнэ. Нягтлан зөвлөх файлыг баталгаажуулахдаа тоог дахин тооцож шалгана (TST-GS-16).

**Тэмдэглэгээ:** "Дт 1110 500 000.00" = `{account: "1110", dr: "500000.00"}`. T1, T2 = алхам доторх ваучер. Огноо бүр 2026 он, бизнесийн цаг `Asia/Ulaanbaatar`. "→ 422 `код`" = алхам алдаагаар дуусах ба `noRowsWritten: true`. Дансны нэрийг [seed/README §3.2](./db/seed/README.md)-оос үзнэ.

### 12.1 Суурь тохиргоо (baseline)

**`BASE-VAT`** (`tests/Golden/baselines/BASE-VAT.yaml`):

| Зүйл | Утга |
|---|---|
| Тенант / компани | `GOLDEN` / `C1` "Алтан Жишээ ХХК", `vat_registered = true`, `city_tax_payer = false`, ТТД `37900846788` (PosAPI mock-ийн амжилттай мерчант), дүүрэг `2501`, `invoice_rounding_enabled = false`, posting-ийн цонхгүй |
| Seed | `platform.fn_provision_company_mn(tenant, C1, 2026)`: CoA (182 данс), posting group, General/VAT Posting Setup, дугаарын цуврал 2026 ба 2027 (`SI`, `SC`, `PI`, `PC`, `KO`, `KZ`, `BR`, `BP`, `GJ`, `OB`, `CL`: завсаргүй, жил бүр, огнооны дараалалтай), санхүүгийн жил 2026 ба 2027 (24 нээлттэй сар), НӨАТ-ын үе 24, касс `CASH01` (1100), журнал, шалтгааны код, насжилтын бүлэг `DUE` |
| Мөнгөний данс (override) | `BANK01` (BANK, `BANK_MNT` → 1110, данс `5000000001`), `QPAY` (WALLET, `WALLET` → 1120). R2: `GOL-USD` (BANK, `BANK_FCY` → 1115, USD) |
| Төлбөрийн хэлбэр | `CASH` → `CASH01`; `BANK` → `BANK01`; `QPAY` → `QPAY` (eBarimt `BANK_TRANSFER_QPAY`) |
| Харилцагч | `C-B2B` "Болд Трейд ХХК" (ORGANIZATION, ТТД `61200064714`, DOMESTIC/DOMESTIC/DOMESTIC, `NET30`, үнэ НӨАТ-гүй, данс `5000000099`); `C-B2C` "Иргэн" (INDIVIDUAL, DOMESTIC, `CASH`, үнэ НӨАТ-тэй, төлбөрийн хэлбэр `CASH`); `C-EXP` "Global Trading LLC" (FOREIGN, posting group `FOREIGN` → 1201, Gen. Bus. `EXPORT`, VAT Bus. `EXPORT`, `NET30`) |
| Нийлүүлэгч | `V-DOM` "Оффис Хангамж ХХК" (ТТД `5012345`, DOMESTIC, `NET30`); `V-NONVAT` (VAT Bus. `NONREG`); `V-FOR` "Cloud Services Ltd" (posting group `FOREIGN` → 2101, Gen. Bus. `EXPORT`, VAT Bus. `IMPORT`); `V-CUSTOMS` (загвар `CUSTOMS` → 2365) |
| Бараа, үйлчилгээ | `GD-BREAD` "Талх" (NON_INVENTORY, GOODS, VAT10, БҮНА `2349010`, "ш"); `GD-MILK` "Сүү 1л" (GOODS, VAT10, `2211100`); `GD-BOOK` "Ном" (GOODS, EXEMPT, `taxProductCode` `TPC0002`\*); `SRV-CONS` "Зөвлөх үйлчилгээ" (SERVICE, SERVICES, VAT10); `SRV-ZERO` (SERVICES, VAT0, `TPC0001`\*); `SRV-NOVAT` (SERVICES, NOVAT, `TPC0003`\*) |
| Хэрэглэгч | `owner` (OWNER "Болд"), `acc` (ACCOUNTANT "Сараа"), `clerk` (SALES_CLERK "Тэмүүлэн"), `viewer` (VIEWER) |
| eBarimt | `enabled = true`, `STAGING`, мерчант `37900846788`, POS `001` (`CASH01`), mock instance |
| Банкны текстийн дүрэм | Seed: "ШИМТГЭЛ" → 8300 (зарлага); "ХҮҮНИЙ ОРЛОГО" → 8110 (орлого) |

\* `taxProductCode`-ийн утга нь жишээ (mock бүгдийг хүлээн авна). Бодит кодыг `getProductTaxCode`-оос авна ([seed/README §6](./db/seed/README.md) ⚠).

**`BASE-NONVAT`**: `BASE-VAT`-тэй ижил, ялгаа нь компани `C2` "Мөнгөн Жишээ ХХК", `vat_registered = false`, ТТД `50000000011` (зохиомол 11 оронтой; PosAPI-ийн `merchantTin` нь хуулийн этгээдэд 11 орон байх ёстой тул 7 оронтой регистрийн дугаарыг хэрэглэхгүй), eBarimt мерчант `50000000011` (mock-ийн анхдагч SUCCESS), `non_vat_payer_tax_type = NOT_VAT` (12 SCR-04; багана хэрэгжих хүртэл анхдагч `NOT_VAT`). 10%-ийн VAT setup-ийн мөрүүд `non_deductible_vat_percent = 100` (seed, D-E5). Override `vatPostingSetup`: (DOMESTIC × VAT10) ба (DOMESTIC × VAT0)-ийн `ebarimt_tax_product_code` = `TPC0003` — НӨАТ төлөгч бус компанийн VAT10 бүлгийн мөр BR-TAX-55-аар `NOVAT`/`NOT_VAT` болох бөгөөд `NOT_VAT` мөрөнд `taxProductCode` заавал (VAL-09, [12 MAP-22](./12-ebarimt-integration.md) (3)); үүнгүйгээр GS-SAL-010, GS-EBR-008 `ebarimt.tax_product_code_missing`-ээр унана.

**Модулийн spec-ийн жишээтэй уялдаа.** GS-GL-001…015 нь [05-posting-engine §7, §11.2](./05-posting-engine.md)-ийн жишээ E-A…E-L-ийг, GS-SAL-001…012 ба GS-AR-001…007 нь [06-sales-receivables §7, §11.2](./06-sales-receivables.md)-ийн жишээ P1…P12-ийг, GS-PUR-001…012 ба GS-AP-001…007 нь [07-purchases-payables §7, §11.2](./07-purchases-payables.md)-ийн P1…P15-ийг, GS-VAT-013…022 нь [08-tax-vat-mn §7, §11.2](./08-tax-vat-mn.md)-ийн E-TAX жишээг хэрэгжүүлнэ (GS-VAT-001…012-д 08-ийн E-TAX нэмэлт case болно). Тэдгээрийн ID ба агуулгын эх сурвалж нь модулийн spec. Дүн, данс, НӨАТ, дэд дэвтрийн мөр зөрвөл модулийн spec давамгайлж, энэ каталог ба YAML-ийг ижил PR-д засна (§11.10). Модулийн жишээг golden файл болгохдоо доорх дүрмээр хөрвүүлнэ:

| Модулийн жишээнд | Golden файлд |
|---|---|
| `entry_no`, `transaction_no`, register, CLE/VLE/BLE, `application_no` (жишээ: 531, 119, 41) | Харьцангуй лавлагаа (`#1`, `T1`). Тоон утгыг харьцуулахгүй (TST-GS-07) |
| Хуулийн дугаар (жишээ: `GJ-2026-00042`, `SI-2027-00041`) | Шинэ clone-ийн counter-аас: тухайн цувралын жилийн эхний баримт `…-00001` |
| Мөнгөний данс `BANK01`, касс `CASH01` | `BASE-VAT`-ийн `BANK01`, `CASH01` |
| Харилцагч `C0001`, `C00012`, `C00017`, `C00021`, `C00025`, `C00033`, `C00040` (байгууллага) | `C-B2B` (scenario бүр өөрийн clone-той тул нэг харилцагч хангалттай) |
| Харилцагч `C0002`, `C00001` "Иргэн" | `C-B2C` |
| Нийлүүлэгч `V0001` | `V-DOM` |
| Бараа: GOODS (`GDS-*`) / SERVICES (`SRV-001`) | `GD-BREAD` (эсвэл `GD-MILK`) / `SRV-CONS`; үнийг мөрөнд заана |
| Dimension set-ийн id (5, 7, 9, 11–13) | Dimension-ий утгын хослол (`{SALBAR: TOV, TOSOL: P1}`); id-г харьцуулахгүй |
| 06, 07, 08-ийн 2027 оны огноо | Хэвээр (2027 санхүүгийн жил baseline-д бий). Ийм scenario-д `y2027` variant нэмэхгүй |
| 07-ийн нийлүүлэгч `V00007` (ТТД 5123456) ба бусад | `V-DOM` (ТТД нь баримтын эх ДДТД-тэй хамааралгүй) |
| 08-ийн компани "Жишээ ХХК" / "Бага ХХК" | `BASE-VAT` / `BASE-NONVAT` |

### 12.2 Индекс

| ID | Нэр | Хув. | Дүрэм | Гол шаардлага |
|---|---|---|---|---|
| GS-GL-001 | Ерөнхий журнал: түрээс банкаар (05 E-A) | R1 | NOW | FR-GL-006, FR-GL-009, FR-BNK-001 |
| GS-GL-002 | Төлбөрийн журнал (касс), НӨАТ-тай (05 E-B) | R1 | NOW | FR-GL-006, FR-BNK-003, FR-TAX-007 |
| GS-GL-003 | Зээлийн нэхэмжлэх: posting buffer (05 E-C) | R1 | NOW | FR-SAL-004, FR-TAX-007 |
| GS-GL-004 | НӨАТ-ын үлдэгдлийн хуваарилалт (05 E-D) | R1 | NOW | FR-TAX-004 |
| GS-GL-005 | Бэлэн борлуулалт: нэг register, хоёр гүйлгээ (05 E-E) | R1 | NOW | FR-SAL-006, D-F5 |
| GS-GL-006 | Гүйлгээ буцаах, storno-гүй (05 E-F) | R1 | NOW | FR-GL-010, FR-GL-013, FR-GL-020 |
| GS-GL-007 | Register буцаах, огноо өөр 2 ваучер (05 E-G) | R1 | NOW | FR-GL-015 |
| GS-GL-008 | Жилийн хаалт 2026 (05 E-H) | R1 | NOW | FR-GL-026 AC1, D-D4 |
| GS-GL-009 | Жилийн хаалтыг дахин ажиллуулах (05 E-I) | R1 | NOW | FR-GL-026 AC2 |
| GS-GL-010 | Хуримтлагдсан ашиг руу шилжүүлэх (05 E-J) | R1 | NOW | FR-GL-026 AC3 |
| GS-GL-011 | Эхний үлдэгдэл (05 E-K) | R1 | NOW | FR-GL-021, D-D7 |
| GS-GL-012 | Хаалттай үеийн залруулгын санал (05 E-L) | R1 | NOW | FR-GL-014, D-D5 |
| GS-GL-013 | Preview = Post | R1 | NOW | FR-GL-011 |
| GS-GL-014 | Толгой ба мөрийн dimension, global dimension | R1 | NOW | FR-GL-018 |
| GS-GL-015 | Rollback завсар үлдээхгүй | R1 | NOW | FR-PLT-008, D-C7 |
| GS-GL-016 | Тэнцээгүй ваучер татгалзах, дугаар зарцуулахгүй | R1 | NOW | FR-GL-007, D-C5, D-C7 |
| GS-GL-017 | Бүх алдааг нэг дор буцаах | R1 | NOW | FR-GL-008 |
| GS-GL-018 | Баримтаас үүссэн гүйлгээг буцаах хориг | R1 | NOW | FR-GL-013 AC2, D-D5 |
| GS-GL-019 | Компанийн posting-ийн цонх | R1 | NOW | FR-GL-023 |
| GS-GL-020 | Жил дамнасан дугаарлалт | R1 | NOW | FR-PLT-008, D-C7 |
| GS-VAT-001 | Баримтын түвшний НӨАТ, running remainder (+ 08 E-TAX-01 case) | R1 | NOW | FR-TAX-004 |
| GS-VAT-002 | Үнэ НӨАТ-тэй, бэлэн борлуулалт | R1 | NOW | FR-TAX-005, FR-SAL-006 |
| GS-VAT-003 | Холимог ангилал VAT10/VAT0/EXEMPT | R1 | NOW | FR-TAX-002, FR-TAX-007, INV-31 |
| GS-VAT-004 | Орцын НӨАТ ба ДДТД баталгаажуулалт (+ 08 E-TAX-02 entry 404) | R1 | NOW | FR-TAX-009, D-E4 |
| GS-VAT-005 | Хасагдахгүй орцын НӨАТ (+ 08 E-TAX-02 entry 405) | R1 | NOW | FR-TAX-010 |
| GS-VAT-006 | НӨАТ төлөгч бус компани (+ 08 E-TAX-05) | R1 | NOW | FR-TAX-011, D-E5 |
| GS-VAT-007 | ТТ-03а туслах тайлан, НӨАТ-ын хаалт, илгээх (+ 08 E-TAX-06) | R1 | NOW | FR-TAX-013, FR-TAX-015 |
| GS-VAT-008 | Хоцорсон худалдан авалтын НӨАТ-ын огноо | R1 | NOW | FR-TAX-008, D-E9 |
| GS-VAT-009 | НӨАТ-ын босгын хяналт (2027) (08 §6.13) | R1 | 2027 | FR-TAX-012, D-K5 |
| GS-VAT-010 | Reverse charge (+ 08 E-TAX-03) | R2 | NOW | FR-TAX-020 |
| GS-VAT-011 | Гаалийн НӨАТ (FULL_VAT) (+ 08 E-TAX-04) | R2 | NOW | FR-TAX-021 |
| GS-VAT-012 | НХАТ (үнэ НӨАТ-гүй) | R2 | NOW | FR-TAX-019 |
| GS-VAT-013 | Сөрөг мөр ба carry (08 §6.4) | R1 | NOW | FR-TAX-006 |
| GS-VAT-014 | НӨАТ төлөх (08 E-TAX-07) | R1 | NOW | FR-TAX-015 |
| GS-VAT-015 | Хоцорсон баталгаажуулалт, W-TAX-10 (08 E-TAX-06) | R1 | NOW | FR-TAX-009 |
| GS-VAT-016 | Хасалтаас татгалзах (08 E-TAX-08, Should) | R1 | NOW | FR-TAX-010 |
| GS-VAT-017 | НӨАТ-ын хаалтыг дахин нээх (08 E-TAX-09) | R1 | NOW | FR-TAX-015 |
| GS-VAT-018 | Параметрийн хил 2027-06-30 / 07-01 (08 §5.2) | R1 | 2027 | FR-TAX-017, D-E7 |
| GS-VAT-019 | НХАТ үнэ НӨАТ-тэй, B2C ресторан (08 E-TAX-10) | R2 | NOW | FR-TAX-019 |
| GS-VAT-020 | НХАТ-ын хаалт (08 E-TAX-10) | R2 | NOW | FR-TAX-019 |
| GS-VAT-021 | Хялбаршуулсан НӨАТ (08 E-TAX-11, Could) | R2 | 2027 | FR-TAX-022 |
| GS-VAT-022 | ААНОАТ-ын туслах тайлан (08 E-TAX-12) | R2 | 2027 | 08 BR-TAX-105…107 |
| GS-SAL-001 | B2C бэлэн борлуулалт, МХ-1, eBarimt | R1 | NOW | FR-SAL-006, FR-EBR-002 |
| GS-SAL-002 | B2B зээлийн нэхэмжлэх, 4 мөр, НӨАТ-ын хуваарилалт (06 P1) | R1 | NOW | FR-SAL-003…005, FR-PTY-007 |
| GS-SAL-003 | Хөнгөлөлт тусдаа дансанд `LINE_DISCOUNTS` (06 P1a) | R1 | NOW | FR-SAL-003 AC2, D-F2 |
| GS-SAL-004 | Бэлэн мөнгөний бүхэлчлэл (06 P2b) | R1 | NOW | FR-SAL-013, D-C2 |
| GS-SAL-005 | Хэсэгчилсэн кредит нот (06 P3) | R1 | NOW | FR-SAL-007, FR-EBR-010 |
| GS-SAL-006 | Нэхэмжлэх цуцлах (06 P4) | R1 | NOW | FR-SAL-008, FR-EBR-009 |
| GS-SAL-007 | Бэлэн борлуулалтын буцаалт ба МХ-2 (06 P9) | R1 | NOW | FR-SAL-007, FR-BNK-003 |
| GS-SAL-008 | Сөрөг мөр, тэмдгээр хуваасан НӨАТ-ын бүлэг (06 P10) | R1 | NOW | FR-TAX-004, FR-TAX-006 |
| GS-SAL-009 | VAT10 ба EXEMPT мөр | R1 | NOW | FR-TAX-002, FR-TAX-007 |
| GS-SAL-010 | НӨАТ төлөгч бус компанийн борлуулалт | R1 | NOW | FR-TAX-011, D-E5 |
| GS-SAL-011 | Засварлах: цуцлах ба шинэ ноорог | R1 | NOW | FR-SAL-009 |
| GS-SAL-012 | НӨАТ-ын хувийн солилт ба цуцлалтын snapshot | R1 | 2027 | BR-SAL-74, D-E7 |
| GS-SAL-013 | Idempotency-Key | R1 | NOW | FR-SAL-005 AC2, FR-INT-002 |
| GS-PUR-001 | Зээлийн нэхэмжлэх: хөнгөлөлт, VAT10 + EXEMPT, ДДТД баталгаажсан (07 P1) | R1 | NOW | FR-PUR-001, FR-PTY-008 |
| GS-PUR-002 | НӨАТ-ын зөрүү (+0.01) (07 P1a) | R1 | NOW | FR-PUR-003 |
| GS-PUR-003 | Бэлэн худалдан авалт, НӨАТ-ын зөрүү −0.01, МХ-2 (07 P2) | R1 | NOW | FR-PUR-007, FR-BNK-003 |
| GS-PUR-004 | Хасагдахгүй (`PASSENGER_CAR`) ба хасагдах мөр (07 P3) | R1 | NOW | FR-TAX-010 |
| GS-PUR-005 | НӨАТ төлөгч бус компани ба NONREG нийлүүлэгч (07 P4, P4b) | R1 | NOW | FR-TAX-011, D-E5 |
| GS-PUR-006 | ДДТД-гүй PENDING → холбох, баталгаажуулах (07 P5) | R1 | NOW | FR-TAX-009, D-E4 |
| GS-PUR-007 | ДДТД-гүй NON_DEDUCTIBLE (07 P5b) | R1 | NOW | FR-TAX-010 |
| GS-PUR-008 | Баталгаажаагүй НӨАТ-ыг зардалд шилжүүлэх (07 P5c, Should) | R1 | NOW | FR-TAX-010 |
| GS-PUR-009 | Кредит нот + автомат тулгалт + баталгаажуулалт өвлөх (07 P6) | R1 | NOW | FR-PUR-005 |
| GS-PUR-010 | Цуцлах + засварлах (07 P7) | R1 | NOW | FR-PUR-006 |
| GS-PUR-011 | Бэлэн буцаалт (кредит нот + МХ-1) (07 P15) | R1 | NOW | FR-PUR-005, FR-BNK-002 |
| GS-PUR-012 | Урвуу тооцоо ба гаалийн НӨАТ (07 P13, P14) | R2 | NOW | FR-TAX-020, FR-TAX-021 |
| GS-PUR-013 | Нийлүүлэгчийн баримтын дугаарын давхардал | R1 | NOW | FR-PUR-002, INV-18 |
| GS-PUR-014 | Нийлүүлэгчийн НӨАТ-ын зөрүүний дээд хязгаар | R1 | NOW | FR-PUR-003 AC2 |
| GS-PUR-015 | Бэлэн худалдан авалт ба кассын хориг | R1 | NOW | FR-PUR-007, D-G1, INV-19 |
| GS-AP-001 | Банкны хэсэгчилсэн төлбөр (07 P8) | R1 | NOW | FR-BNK-005, FR-PTY-008 |
| GS-AP-002 | LIFO unapply + DUE_DATE хуваарилалт (07 P9) | R1 | NOW | FR-PTY-010, FR-PTY-011 |
| GS-AP-003 | Урьдчилгаа → нэхэмжлэх → буцаан авалт (07 P10) | R1 | NOW | FR-PTY-012 |
| GS-AP-004 | Төлөх нэхэмжлэхийн санал + журнал (07 P11) | R1 | NOW | FR-BNK-005 |
| GS-AP-005 | Дансны хуулга ба насжилт 2027-04-30 (07 P12) | R1 | NOW | FR-RPT-003, FR-RPT-005 |
| GS-AP-006 | Apply to Oldest (07 AT-AP-07) | R1 | NOW | FR-PTY-010 |
| GS-AP-007 | Нэгтгэсэн журналын мөрийн дүн өөрчлөгдсөн (07 AT-AP-13) | R1 | NOW | FR-BNK-005 |
| GS-AR-001 | Хэсэгчилсэн ба хоёр дахь төлбөр (06 P5) | R1 | NOW | FR-PTY-009 |
| GS-AR-002 | Unapply, LIFO (06 P6) | R1 | NOW | FR-PTY-011 |
| GS-AR-003 | Урьдчилгаа төлбөр, дараа нь нэхэмжлэх (06 P7) | R1 | NOW | FR-PTY-012, D-F4 |
| GS-AR-004 | Олон нэхэмжлэхэд хуваарилах, G/L-гүй (06 P8) | R1 | NOW | FR-PTY-010, FR-PTY-013 |
| GS-AR-005 | Насжилт, D = 2027-04-30 (06 P11) | R1 | NOW | FR-RPT-004 |
| GS-AR-006 | Дансны хуулга 2027-04 (06 P12) | R1 | NOW | FR-RPT-003 |
| GS-AR-007 | Apply to Oldest | R1 | NOW | FR-PTY-010 |
| GS-AR-008 | Тулгалтын огноо ба хаалттай үе | R1 | NOW | FR-PTY-013 |
| GS-AR-009 | Хэтрүүлж тулгах хориг | R1 | NOW | INV-26 |
| GS-CASH-001 | Кассын орлого (МХ-1) нэхэмжлэхтэй тулгах | R1 | NOW | FR-BNK-002 |
| GS-CASH-002 | Кассын зарлага (МХ-2), сөрөг хориг | R1 | NOW | FR-BNK-003, D-G1 |
| GS-CASH-003 | Банкнаас касс руу шилжүүлэг | R1 | NOW | FR-BNK-007 |
| GS-CASH-004 | Кассын тооллого: дутагдал ба илүүдэл | R1 | NOW | FR-BNK-004 |
| GS-CASH-005 | Хуулийн баримтын огнооны дараалал (кассын хоцорсон баримт) | R1 | NOW | D-C7, INV-08 |
| GS-CASH-006 | Хэтэвч (QPay) ба шимтгэл | R1 | NOW | FR-BNK-017 |
| GS-CASH-007 | Мөнгөний бичилтийг буцаах ба хориг | R1 | NOW | FR-BNK-015 |
| GS-REC-001 | Хуулга импорт, автомат тулгалт, батлах | R1 | NOW | FR-BNK-008, 011, 012, 013 |
| GS-REC-002 | Давхар импорт (файл ба мөр) | R1 | NOW | FR-BNK-010 |
| GS-REC-003 | Тэнцэхгүй хуулга ба хоёрдмол тулгалт | R1 | NOW | FR-BNK-011 AC2, FR-BNK-013 AC2 |
| GS-REC-004 | Тулгалтын тайлан ба буцаах | R1 | NOW | FR-BNK-014, FR-BNK-016 |
| GS-FX-001 | Валютын нэхэмжлэх, хуримтлагдсан хөрвүүлэлт | R2 | NOW | FR-FX-004 |
| GS-FX-002 | Ханш хайх (амралтын өдөр, ханшгүй) | R2 | NOW | FR-FX-002 |
| GS-FX-003 | Сарын эцсийн хэрэгжээгүй ханшийн зөрүү | R2 | NOW | FR-FX-008 |
| GS-FX-004 | Төлбөр ба хэрэгжсэн ханшийн зөрүү | R2 | NOW | FR-FX-007 |
| GS-FX-005 | Валютын мөнгөний дансны дахин үнэлгээ | R2 | NOW | FR-FX-009 |
| GS-FX-006 | Валютын хориг (тулгалт, хоцорсон posting) | R2 | NOW | FR-FX-006, FR-FX-010 |
| GS-CLOSE-001 | Сарын хаалт, дахин нээх, түгжих | R1 | NOW | FR-GL-024, D-D3 |
| GS-CLOSE-002 | Жилийн хаалтын дараах тайлан | R1 | NOW | FR-RPT-001 AC2, FR-RPT-009 |
| GS-CLOSE-003 | Жилийн хаалтын урьдчилсан нөхцөл ба W-04 | R1 | NOW | FR-GL-026 AC1 |
| GS-CLOSE-004 | Шинэ жилийн гүйлгээ балансын эхний үлдэгдэл | R1 | NOW | FR-GL-026 AC3, FR-RPT-001 |
| GS-CLOSE-005 | Сарын хаалтын шалгах хуудас | R1 | NOW | FR-GL-025 |
| GS-RPT-001 | Гүйлгээ баланс (жилийн 8 ваучер) | R1 | NOW | FR-RPT-001, FR-RPT-002 |
| GS-RPT-002 | СБТ, ОДТ, ӨӨТ (жил хаагдаагүй) | R1 | NOW | FR-RPT-008…010 |
| GS-RPT-003 | Авлага ба өглөгийн насжилт | R1 | NOW | FR-RPT-004, FR-RPT-005 |
| GS-RPT-004 | Мөнгөн гүйлгээний тайлан (шууд арга) | R1 | NOW | FR-RPT-011 |
| GS-RPT-005 | e-balance мянган төгрөг | R1 | NOW | FR-RPT-013 |
| GS-EBR-001 | B2C бэлэн, VAT_ABLE (жишээ A) | R1 | NOW | FR-EBR-003, 004, 005, 008 |
| GS-EBR-002 | VAT_ABLE + VAT_FREE дэд баримт | R1 | NOW | FR-EBR-003, AT-EB-06 |
| GS-EBR-003 | Сөрөг (хөнгөлөлтийн) мөр шингээх | R1 | NOW | AT-EB-10 |
| GS-EBR-004 | `qty × unitPrice` таарахгүй мөрийг хуваах | R1 | NOW | AT-EB-09 |
| GS-EBR-005 | Хэсэгчилсэн буцаалтын гинж (`inactiveId`) | R1 | NOW | FR-EBR-010, AT-EB-26 |
| GS-EBR-006 | Timeout → UNKNOWN → гараар шийдэх | R1 | NOW | FR-EBR-007, D-J2 |
| GS-EBR-007 | Өмнөх сарын засвар (`reportMonth`) | R1 | NOW | FR-EBR-011, D-J4 |
| GS-EBR-008 | НӨАТ төлөгч бус мерчант (`NOT_VAT`) | R1 | NOW | FR-EBR-015, VAL-09 |
| GS-EBR-009 | eBarimt тохируулаагүй компани | R1 | NOW | FR-EBR-001 AC2, AT-EB-05 |

Бүх R1 scenario-д `variants: [{name: y2027, rules: "2027", shiftDates: "+1Y"}]` нэмнэ. Үл хамаарах нь: GS-VAT-009, GS-VAT-018, GS-SAL-012 ба огноо нь аль хэдийн 2027 онд байгаа scenario (GS-SAL-002…012, GS-AR-001…007, GS-PUR-001…011, GS-AP-001…007, 08-ийн E-TAX жишээнд суурилсан GS-VAT-013…022). Ингэснээр 2027 оны параметрээр (D-K5) ижил үр дүн гарахыг баталгаажуулна. Хүлээгдэх утга өөрчлөгдөх тохиолдолд `expectOverride` бичнэ (NFR-006, NFR-110). `shiftDates` нь бүх огноо, `firstFiscalYear`, хүлээгдэх баримтын дугаарын он (`SI-2026-` → `SI-2027-`)-г хамт шилжүүлнэ. Шилжүүлсний дараа 2-р сарын 29 эсвэл амралтын өдөр (GS-FX-002) хамаарах scenario-д `expectOverride` заавал.

### 12.3 Ерөнхий дэвтэр (GL)

GS-GL-001…015 нь [05-posting-engine §7](./05-posting-engine.md)-ийн E-A…E-L жишээ ба §11.2-ын хүснэгтийг хэрэгжүүлнэ. Дүн, данс, НӨАТ, дэд дэвтрийн мөрийг тэндээс авна. Дугаар, master data-г §12.1-ийн "Модулийн spec-ийн жишээтэй уялдаа" дүрмээр хөрвүүлнэ. GS-GL-016…020 нь энэ баримтын нэмэлт scenario.

**GS-GL-001 — Ерөнхий журнал: түрээс банкаар** · R1 · [05 E-A](./05-posting-engine.md) · FR-GL-006 AC1, FR-GL-009, FR-BNK-001 AC1
- **Зорилго.** Хамгийн энгийн ваучер. Хуулийн дугаар, register, мөнгөний дансны дэд дэвтэр (BLE), G/L-ийн тэмдэгтэй дүн, `system_created` тугийг шалгана.
- **Алхам.** Override dimension `SALBAR` (`TOV`). 03-10 `acc`: GENERAL/DEFAULT журнал, ноорог `J-000123`, мөр: G/L 7210 Дт 1 500 000.00 (Gen. posting type NONE), харьцсан `BANK_ACCOUNT BANK01`, dimension {SALBAR: TOV}, тайлбар "3-р сарын оффисын түрээс".
- **Хүлээгдэх.** `GJ-2026-00001`, source `GENJNL`, `document_type = NONE`. T1: Дт 7210 1 500 000.00 (`system_created = false`); Кт 1110 1 500 000.00 (`system_created = true`, харьцсан данс 7210). Хоёр мөр ижил dimension set. BLE `BANK01` −1 500 000.00, `open`, `statement_status = OPEN`. VAT entry 0. Нэг `gl_register` (T1-ийн 2 мөр). `audit.posting_log` `SUCCEEDED`. Хариуны `vouchers[0]`: `draftDocumentNo = "J-000123"`, `documentNo = "GJ-2026-00001"`. 1110 = Σ BLE (I-05).

**GS-GL-002 — Төлбөрийн журнал (касс): НӨАТ-тай бичиг хэрэг** · R1 · [05 E-B](./05-posting-engine.md) · FR-GL-006 AC1, FR-BNK-003 AC1, FR-TAX-007, BR-PST-36, BR-PST-38
- **Зорилго.** Журналын НӨАТ-ыг gross аргаар тооцоолох, VAT entry-г **суурь** G/L entry-тэй холбох, кассын зарлагын баримт (МХ-2) үүсгэх.
- **Алхам.** `openingBalances` 01-01: `CASH01` 100 000.00 / 3100. 03-12 `acc`: PAYMENT/CASH журнал (`KZ` цуврал), мөр: G/L 7213, Gen. posting type PURCHASE, DOMESTIC × VAT10, Дт 12 345.00 (НӨАТ орсон), харьцсан `BANK_ACCOUNT CASH01`, нийлүүлэгчийн ДДТД бөглөсөн.
- **Хүлээгдэх.** НӨАТ = round(12 345.00 × 10/110) = 1 122.27, суурь 11 222.73. `KZ-2026-00001`, source `PAYMENTJNL`: Дт 7213 11 222.73 (`vat_amount` 1 122.27); Дт 1300 1 122.27; Кт 1100 12 345.00. VAT entry PURCHASE, суурь +11 222.73, дүн +1 122.27, `VAT_ABLE`, `supplier_ebarimt_id` бөглөгдсөн. `gl_entry_vat_entry_link` нь 7213-ийн entry-тэй (1300-ийнх биш). BLE `CASH01` −12 345.00. `posted_cash_voucher` `PAYMENT` 12 345.00. Кассын үлдэгдэл 87 655.00.

**GS-GL-003 — Зээлийн нэхэмжлэх: posting buffer** · R1 · [05 E-C](./05-posting-engine.md) · FR-SAL-004, FR-SAL-005 AC1, FR-TAX-007, BR-PST-08, BR-PST-29, BR-PST-36
- **Зорилго.** Posting buffer-ийн нэгтгэл (данс × posting group × VAT group × dimension set), мөр бүрийн VAT entry, авлагын entry, posting group-ийн кодын snapshot.
- **Алхам.** Override dimension `SALBAR` (`TOV`), `TOSOL` (`P1`). 03-15 `acc`: `C-B2B` (NET30), толгойн dimension {SALBAR: TOV}. Мөр 10000: `GD-BREAD` 2 × 350 000.00 (GOODS), мөрийн dimension {SALBAR: TOV, TOSOL: P1}. Мөр 20000: `SRV-CONS` 1 × 300 000.00 (SERVICES), мөрийн dimension {SALBAR: TOV}. Үнэ НӨАТ-гүй.
- **Хүлээгдэх.** `SI-2026-00001`, `INVOICE`, source `SALES`. G/L (`exact`): Кт 5100 700 000.00 {TOV, P1} (`vat_amount` −70 000.00); Кт 2300 70 000.00 {TOV, P1}; Кт 5110 300 000.00 {TOV} (`vat_amount` −30 000.00); Кт 2300 30 000.00 {TOV}; Дт 1200 1 100 000.00 {TOV}. VAT entry 2: SALE −700 000.00 / −70 000.00 (5100-ийн entry-тэй) ба −300 000.00 / −30 000.00. CLE +1 100 000.00, `sales_lcy` 1 000 000.00, `due_date` 2026-04-14, нээлттэй. INITIAL detailed +1 100 000.00. G/L entry-д `gen_bus_posting_group = DOMESTIC`, `gen_prod_posting_group` = `GOODS`/`SERVICES` (snapshot). eBarimt `B2B_RECEIPT` `PENDING` ба outbox `ebarimt.receipt.send` `PENDING`.

**GS-GL-004 — НӨАТ-ын үлдэгдлийн хуваарилалт** · R1 · [05 E-D](./05-posting-engine.md) · FR-TAX-004
- **Зорилго.** Баримтын түвшний НӨАТ-ыг buffer-ийн мөрүүдэд running remainder-аар хуваарилна. Мөр тус бүрийг бөөрөнхийлбэл нийлбэр зөрөх тохиолдол.
- **Алхам.** Override dimension `SALBAR` (`S1`, `S2`, `S3`). 03-16 `acc`: `C-B2B`, толгой dimension-гүй, `SRV-CONS` гурван мөр тус бүр 1 × 3 333.33, мөрийн dimension S1, S2, S3 (buffer-т нэгтгэгдэхгүй).
- **Хүлээгдэх.** НӨАТ = round(9 999.99 × 0.10) = 1 000.00. `SI-2026-00001`: Кт 5110 3 333.33 {S1}; Кт 2300 333.33 {S1}; Кт 5110 3 333.33 {S2}; Кт 2300 333.34 {S2}; Кт 5110 3 333.33 {S3}; Кт 2300 333.33 {S3}; Дт 1200 10 999.99 (dimension-гүй). VAT entry 3: −3 333.33 / −333.33, −3 333.33 / −333.34, −3 333.33 / −333.33.

**GS-GL-005 — Бэлэн борлуулалт: нэг register, хоёр гүйлгээ** · R1 · [05 E-E](./05-posting-engine.md) · D-F5, FR-SAL-006, BR-PST-42
- **Зорилго.** Бэлэн борлуулалт нэг register-т хоёр гүйлгээ (нэхэмжлэх ба МХ-1) үүсгэж, авлагыг тэр дор нь тулгана. Хяналтын данс = дэд дэвтэр.
- **Алхам.** 03-15 `clerk`: `C-B2C` (бэлэн, үнэ НӨАТ-тэй), `SRV-CONS` 1 × 110 000.00.
- **Хүлээгдэх.** Нэг register. T1 `SI-2026-00001` (`INVOICE`): Кт 5110 100 000.00; Кт 2300 10 000.00; Дт 1200 110 000.00. T2 `KO-2026-00001` (`PAYMENT`, source `CASHVOUCHER`): Дт 1100 110 000.00; Кт 1200 110 000.00. CLE 2 (+110 000.00, −110 000.00). Detailed 4: INITIAL ×2, APPLICATION ×2 (ижил `application_no`). Хоёр CLE хаагдсан, `closed_by` нь бие биеэ заана. BLE `CASH01` +110 000.00, `posted_cash_voucher` `RECEIPT`. 1200-ийн хөдөлгөөн Дт 110 000 / Кт 110 000, үлдэгдэл 0 = Σ detailed.

**GS-GL-006 — Гүйлгээ буцаах (storno-гүй)** · R1 · `extends: GS-GL-001` · [05 E-F](./05-posting-engine.md) · FR-GL-010 AC1, FR-GL-013 AC1, FR-GL-020 AC1, D-C3
- **Зорилго.** Буцаалт нь эсрэг тэмдэгтэй, **эсрэг баганад** орно. Холбоос, туг, дэд дэвтрийн толин тусгалыг шалгана.
- **Алхам.** 03-20 `acc`: `GJ-2026-00001`-ийн гүйлгээг шалтгаан `REVERSAL`-тайгаар буцаах. Дахин буцаах оролдлого.
- **Хүлээгдэх.** Шинэ register (source `REVERSAL`). Шинэ гүйлгээ: `posting_date` 2026-03-10 (эх), `document_no` `GJ-2026-00001` (эх), `reverses_transaction_no` = T1. Мөр: Дт 1110 1 500 000.00 (эх 1110-ийн мөрийг `reversed_entry_no`-оор заана); Кт 7210 1 500 000.00 (**кредит баганад**, сөрөг дебит биш). Эх мөр `reversed = true`, `reversed_by_entry_no` бөглөгдсөн. Эх гүйлгээ `reversed_by_transaction_no` бөглөгдсөн. Эх register `reversed = true`. Шинэ BLE +1 500 000.00 (`reversed = true`); эх BLE хаагдсан (`closed_by_entry_no`). 3-р сарын гүйлгээ баланс, 7210: Дт эргэлт 1 500 000, Кт эргэлт 1 500 000, эцсийн 0 (D-C3). Хоёр дахь оролдлого → 409 `gl.transaction_already_reversed`.

**GS-GL-007 — Register буцаах: огноо өөр 2 ваучер** · R1 · [05 E-G](./05-posting-engine.md) · FR-GL-015 AC1, BR-PST-48
- **Зорилго.** Register-ийн буцаалт эх гүйлгээ бүрд огноо тус бүрийн тэнцсэн шинэ гүйлгээ үүсгэнэ.
- **Алхам.** 03-12 `acc`: нэг журналын run-д 2 ваучер: 03-11 G/L 8300 Дт 5 000.00 / харьцсан `BANK01`; 03-12 G/L 2650 Дт 200 000.00 / харьцсан `BANK01`. 03-13: register-ийг буцаах. Дахин буцаах.
- **Хүлээгдэх.** `GJ-2026-00001` (03-11), `GJ-2026-00002` (03-12), нэг register. Буцаалт: шинэ register, эх `transaction_no` буурах дарааллаар 2 гүйлгээ. Эхнийх 03-12 / `GJ-2026-00002`: Дт 1110 200 000.00; Кт 2650 200 000.00. Дараагийнх 03-11 / `GJ-2026-00001`: Дт 1110 5 000.00; Кт 8300 5 000.00. Огноо бүрд тэнцсэн. BLE +200 000.00 ба +5 000.00 (`reversed_entry_no`). Эх register `reversed = true`. Дахин → 409 `gl.register_already_reversed`.

**GS-GL-008 — Жилийн хаалт 2026** · R1 · [05 E-H](./05-posting-engine.md) · FR-GL-026 AC1, D-D4, BR-PST-55…59
- **Зорилго.** Жилийн хаалт орлого, зардлын дансыг 12-31-ний `is_closing` ваучераар 3500 руу хаана. Шилжүүлгийн ноорог үүсгэнэ.
- **Алхам.** 2026 онд GENERAL журнал (Gen. posting type NONE, харьцсан `BANK01`, сүүлийнхээс бусад). 03-31: Кт 5100 10 000 000. 04-30: Кт 5110 2 000 000. 05-31: Дт 6100 6 000 000. 06-30: Дт 7201 2 400 000. 07-31: Дт 7210 1 200 000. 08-31: Кт 8110 50 000. 09-30: Дт 8300 100 000. 12-15: Дт 9100 235 000 / Кт 2330 235 000. Ингэснээр `GJ-2026-00001`…`00008` үүснэ. 2027-01-05 `acc`: 2026-ийн 12 сарыг хаах. 2027-01-10 `acc`: `fiscalYear.close` 2026.
- **Хүлээгдэх.** Цэвэр ашиг 2 115 000. `CL-2026-00001`, 2026-12-31, `is_closing = true`, source `CLSINCOME`, `document_type = NONE`, dimension-гүй. Мөр: Дт 5100 10 000 000; Дт 5110 2 000 000; Кт 6100 6 000 000; Кт 7201 2 400 000; Кт 7210 1 200 000; Дт 8110 50 000; Кт 8300 100 000; Кт 9100 235 000; Кт 3500 2 115 000. Σ Дт = Σ Кт = 12 050 000. `fiscal_year` 2026 `CLOSED`, `closing_transaction_no` бөглөгдсөн. Шилжүүлгийн ноорог (GENERAL/DEFAULT, 2027-01-01, батлагдаагүй): 3500 Дт 2 115 000 / 3400 Кт 2 115 000.

**GS-GL-009 — Жилийн хаалтыг дахин ажиллуулах** · R1 · `extends: GS-GL-008` · [05 E-I](./05-posting-engine.md) · FR-GL-026 AC2, AT-SEC-044
- **Зорилго.** Хаалтыг дахин ажиллуулахад зөвхөн зөрүүг бичнэ. Зөрүү 0 бол юу ч үүсгэхгүй (идемпотент).
- **Алхам.** 2027-01-12 `owner`: 2026-12-ийг шалтгаантай дахин нээх. 2026-12-20-ны GENERAL журнал: 7210 Дт 100 000 / харьцсан `BANK01`. 12-р сарыг хаах. `fiscalYear.close` 2026 дахин. Гурав дахь удаа ажиллуулах.
- **Хүлээгдэх.** Журнал `GJ-2026-00009`. Зөвхөн зөрүүний ваучер `CL-2026-00002`, 2026-12-31: Кт 7210 100 000; Дт 3500 100 000. `closing_transaction_no` = шинэ гүйлгээ. Өмнөх ноорог устаж, шинэ санал үүснэ: 3500 Дт 2 015 000 / 3400 Кт 2 015 000. Гурав дахь удаа → `posted = false`, ваучер ба дугаар үүсэхгүй (`CL` цувралын сүүлийн дугаар `CL-2026-00002` хэвээр).

**GS-GL-010 — Хуримтлагдсан ашиг руу шилжүүлэх** · R1 · `extends: GS-GL-009` · [05 E-J](./05-posting-engine.md) · FR-GL-026 AC3, D-D4
- **Зорилго.** Шинэ жилийн 01-01-ний 3500 → 3400 шилжүүлгийн санал батлагдаж, дахин хаалт шинэ санал үүсгэхгүй.
- **Алхам.** 2027-01-13 `acc`: саналын ноорогийг батлах. Дараа нь `fiscalYear.close` 2026 дахин.
- **Хүлээгдэх.** `GJ-2027-00001`, 2027-01-01, source `GENJNL`: Дт 3500 2 015 000; Кт 3400 2 015 000. 3500-ийн 2027-01-01-ний үлдэгдэл 0. Дахин хаалт: бичих зүйлгүй, шинэ ноорог үүсэхгүй (`B = 0`).

**GS-GL-011 — Эхний үлдэгдэл** · R1 · [05 E-K](./05-posting-engine.md) · FR-GL-021 AC1/AC2, D-D7, BR-PST-15
- **Зорилго.** Ашиглалтад орох огнооны эхний үлдэгдэл: G/L, мөнгө, авлага ба өглөг баримт тус бүрээр, анхны төлөх огноотой. Хяналтын данс руу шууд бичихийг хориглоно.
- **Алхам.** 2026-01-01 `acc`: OPENING журнал (`J-000001`). Мөр: `BANK_ACCOUNT CASH01` Дт 1 000 000; `BANK_ACCOUNT BANK01` Дт 5 000 000; `CUSTOMER C-B2B` Дт 1 100 000 (`INVOICE`, гадаад № `INV-2025-118`, огноо 2025-12-21, төлөх 2026-01-20); `VENDOR V-DOM` Кт 550 000 (`INVOICE`, гадаад № `OP-7781`, огноо 2025-12-16, төлөх 2026-01-15); 3100 Кт 5 000 000; 3400 Кт 1 550 000. Эхлээд хоёр сөрөг оролдлого: (а) `CUSTOMER` мөрийн оронд `GL_ACCOUNT 1200`; (б) Дт ≠ Кт (1 000-аар).
- **Хүлээгдэх.** (а) → 422 `gl.direct_posting_not_allowed`. (б) → 422 `gl.voucher_unbalanced` (мессежид "1000.00"). Хоёуланд `noRowsWritten`. Амжилттай: `OB-2026-00001`, source `OPENING`, `document_type = NONE`. Мөр: Дт 1100 1 000 000; Дт 1110 5 000 000; Дт 1200 1 100 000; Кт 2100 550 000; Кт 3100 5 000 000; Кт 3400 1 550 000 (Σ 7 100 000). BLE `CASH01` +1 000 000 (МХ-1 үүсэхгүй), `BANK01` +5 000 000. CLE +1 100 000 (`external_document_no` `INV-2025-118`, `due_date` 2026-01-20) ба INITIAL. VLE −550 000 (`OP-7781`, `due_date` 2026-01-15) ба INITIAL. VAT entry 0. 1200 = Σ нээлттэй CLE (FR-GL-021 AC1).

**GS-GL-012 — Хаалттай үеийн залруулгын санал** · R1 · [05 E-L](./05-posting-engine.md) · FR-GL-014 AC1, D-D5, BR-PST-51
- **Зорилго.** Хаалттай үеийн гүйлгээг одоогийн нээлттэй үед залруулна (санал → хэрэглэгч батална). Эх үе өөрчлөгдөхгүй.
- **Алхам.** 01-25 `acc`: GENERAL журнал 7212 Дт 300 000 / 2650 Кт 300 000. 02-03 `acc`: 1-р сарыг хаах. 04-05: эх гүйлгээг буцаах оролдлого. 04-05: `transaction.correctionProposal` (`date` 2026-04-05, шалтгаан `CORRECTION`). Саналын мөрүүдийг GENERAL журналд нэмж, 7213 Дт 300 000 / 2650 Кт 300 000 мөр нэмээд батлах. 04-06: `GJ-2026-00002`-ийн гүйлгээнд (4-р сар нээлттэй) санал хүсэх.
- **Хүлээгдэх.** Эх журнал `GJ-2026-00001`. Буцаалт → 422 `gl.period_closed`. Санал: 7212 Кт 300 000; 2650 Дт 300 000 (Σ 0). Санал нь ноорог, ledger-т юу ч бичигдэхгүй. Батласны дараа `GJ-2026-00002`, 2026-04-05: Кт 7212 300 000; Дт 2650 300 000; Дт 7213 300 000; Кт 2650 300 000. 1-р сарын гүйлгээ баланс өөрчлөгдөөгүй (7212 Дт 300 000). Нээлттэй үеийн гүйлгээнд санал → 409 `gl.correction_use_reversal`.

**GS-GL-013 — Preview = Post** · R1 · [05 E-D, E-C](./05-posting-engine.md) · FR-GL-011 AC1, BR-PST-53, [02 §6.7](./02-architecture.md)
- **Зорилго.** Preview нь posting-тэй ижил кодоор явж ROLLBACK хийнэ. DB өөрчлөгдөхгүй. Алдаа ч ижил.
- **Алхам.** (а) GS-GL-004-ийн нэхэмжлэхийн ноорог: `salesInvoice.preview`, дараа нь `.post`. (б) 03-17 журнал: G/L 7212, PURCHASE, DOMESTIC × VAT10, НӨАТ-тэй 110 000, харьцсан `BANK01`: `journal.preview`, дараа нь `journal.post`. (в) Блоклосон `C-B2B`-ийн ноорог: preview, дараа нь post.
- **Хүлээгдэх.** Preview: `documentNo = "***"`, `registerNo = null`. Entry, VAT entry, CLE нь post-ийнхтэй данс, дүн, dimension-оор яг ижил (I-09). Preview-ийн дараа `noRowsWritten`. `ledger_counter`, `SI`/`GJ` цуврал, outbox, `audit.posting_log` өөрчлөгдөөгүй. (а) GS-GL-004-ийн мөрүүд. (б) Дт 7212 100 000.00; Дт 1300 10 000.00; Кт 1110 110 000.00; VAT entry PURCHASE 100 000.00 / 10 000.00. (в) Preview ба post хоёулаа 422 `sales.customer_blocked`.

**GS-GL-014 — Толгой ба мөрийн dimension, global dimension** · R1 · [05 E-C](./05-posting-engine.md) · FR-GL-018 AC1/AC2, ADR-0010, BR-PST-32, INV-29
- **Зорилго.** Авлагын мөр толгойн set-ийг, орлого ба НӨАТ-ын мөр мөрийн set-ийг авна. Ижил хослол ижил id авна. Global dimension-ийн баганыг set-ээс гаргана.
- **Алхам.** Profile: global dimension 1 = `SALBAR`, 2 = `TOSOL` (`P1`, `P2`). GS-GL-003-ийн нэхэмжлэх. 03-16: ижил мөр, дүн, dimension-ий хослолтой хоёр дахь нэхэмжлэх. 03-17: журнал 7213 Дт 50 000 {SALBAR: TOV, TOSOL: P2}, харьцсан `BANK01`.
- **Хүлээгдэх.** 1200-ийн мөр {TOV}. 5100 ба холбогдох 2300-ийн мөр {TOV, P1}. 5110 ба холбогдох 2300-ийн мөр {TOV}. `global_dim_1_value_id` = TOV бүх мөрд. `global_dim_2_value_id` = P1 зөвхөн {TOV, P1} мөрд (I-10). Хоёр нэхэмжлэхийн ижил хослол ижил `dimension_set_id`. Журналын 1110-ийн мөр журналын мөрийн set {TOV, P2}-тэй (BR-PST-32). TOSOL = P1-ээр шүүсэн гүйлгээ баланс: эхний нэхэмжлэхийн дараа −770 000 ([05 E-C](./05-posting-engine.md)), хоёр дахийн дараа −1 540 000 (5100 −1 400 000, 2300 −140 000); dimension тус бүрээр тэнцэхгүй нь хэвийн.

**GS-GL-015 — Rollback завсар үлдээхгүй** · R1 · [05 AT-PST-026](./05-posting-engine.md) · FR-PLT-008 AC1/AC2, D-C7, BR-PST-26, INV-08
- **Зорилго.** Дугаар олгосны дараа posting бүтэлгүйтвэл хуулийн дугаар ба `ledger_counter` буцаж, завсар үлдэхгүй.
- **Алхам.** 03-10: журнал 7210 Дт 1 000 / харьцсан `BANK01`, `faultInjection: AFTER_NUMBER_ALLOCATION` (TST-GS-20). 03-10: ижил журнал fault-гүй. 03-11: ижил журнал, `faultInjection: BEFORE_COMMIT`. 03-11: fault-гүй.
- **Хүлээгдэх.** Fault-тай алхам бүр → 500 `api.internal_error`, `noRowsWritten`. Амжилттай алхам: `GJ-2026-00001`, `GJ-2026-00002`. `GL_ENTRY` 1…4, `GL_TRANSACTION` 1…2, `GL_REGISTER` 1…2 завсаргүй. I-07 (дугаарын завсар) OK.

**GS-GL-016 — Тэнцээгүй ваучер татгалзах** · R1 · FR-GL-007 AC1, D-C5, D-C7
- **Зорилго.** Тэнцээгүй ваучер юу ч бичихгүй, хуулийн дугаар зарцуулахгүй.
- **Алхам.** 03-10: журнал 7213 Дт 1 000 / 2650 Кт 900. Дараа нь 7213 Дт 1 000 / 2650 Кт 1 000.
- **Хүлээгдэх.** Эхнийх → 422 `gl.voucher_unbalanced` (мессежид "100.00"), `noRowsWritten`. Хоёр дахь нь `GJ-2026-00001` (завсаргүй).

**GS-GL-017 — Бүх алдааг нэг дор буцаах** · R1 · FR-GL-008 AC1, BR-SAL-41
- **Зорилго.** Урьдчилсан шалгалт бүх алдааг цуглуулна. Нэг ч дугаар зарцуулагдахгүй.
- **Алхам.** Override: General Posting Setup-ийн (DOMESTIC, SERVICES) ба (`*`, SERVICES) мөрийг устгах, `C-B2B` блоклох. 03-02: `C-B2B`-д `SRV-CONS` 1 000. Дараа нь хоёуланг засаад дахин батлах.
- **Хүлээгдэх.** → 422 `api.validation_failed`, `errors[]`-ийн кодын олонлог яг {`sales.customer_blocked`, `sales.gen_posting_setup_missing`} (мессежид "DOMESTIC × SERVICES"). `SI` цувралын сүүлийн дугаар NULL. Засварын дараа `SI-2026-00001`.

**GS-GL-018 — Баримтаас үүссэн гүйлгээг буцаах хориг** · R1 · FR-GL-013 AC2, D-D5
- **Зорилго.** D-D5: баримтаас (нэхэмжлэх) үүссэн бичилтийг журналын буцаалтаар биш, зөвхөн кредит нотоор засна.
- **Алхам.** 03-02 `acc`: `C-B2B`-д `SRV-CONS` 1 000. 03-05 `acc`: `SI-2026-00001`-ийн гүйлгээг `transaction.reverse`.
- **Хүлээгдэх.** → 409 `gl.reversal_use_credit_memo`. Нэхэмжлэх, ledger өөрчлөгдөхгүй.

**GS-GL-019 — Компанийн posting-ийн цонх** · R1 · FR-GL-023 AC1, D-D3
- **Зорилго.** Компанийн posting-ийн цонх бүх эрхэд (Owner-т ч) үйлчилнэ.
- **Алхам.** `owner`: цонх 2026-03-01..2026-03-31. `owner` 02-28-ны журнал; 03-01-ний журнал.
- **Хүлээгдэх.** 02-28 → 422 `gl.posting_date_outside_window` (Owner-т ч). 03-01 OK. Аудит: `POSTING_WINDOW_CHANGED`.

**GS-GL-020 — Жил дамнасан дугаарлалт** · R1 · FR-PLT-008, D-C7, INV-08
- **Зорилго.** Хуулийн цуврал жил бүр 00001-ээс эхэлнэ. Тухайн жилийн мөр байхгүй бол өмнөх жилийн угтвараар үргэлжлэхгүй.
- **Алхам.** 2026-12-30 ба 12-31-нд нэхэмжлэх; 2027-01-02-нд нэхэмжлэх. Override `fiscalYears: [2026, 2027, 2028]` (2028-ийн үе бий, `SI`-ийн 2028 мөр байхгүй). 2028-01-03-нд нэхэмжлэх.
- **Хүлээгдэх.** `SI-2026-00001`, `SI-2026-00002`, `SI-2027-00001`. 2028 → 422 `platform.number_series_missing_line` (`ERN01`; өмнөх жилийн угтвараар үргэлжлэхгүй).

### 12.4 НӨАТ (VAT)

GS-VAT-001…012-ийн алхам ба дүн энд. [08 §7](./08-tax-vat-mn.md)-ийн E-TAX жишээ нь харгалзах scenario-ийн **нэмэлт case** (тусдаа алхмын блок, ижил файлд) болно ([08 §11.2](./08-tax-vat-mn.md)); 08-ийн дүрэмтэй зөрвөл 08 давамгайлна (Z8). GS-VAT-013…022-ийн алхам, дүнг 08 тодорхойлно (доор товч).

**GS-VAT-001 — Баримтын түвшний НӨАТ, running remainder** · R1 · FR-TAX-004 AC1/AC2, D-E3
- **Зорилго.** НӨАТ-ыг мөр бүрээр биш, VAT identifier-ийн бүлгээр нэг удаа бөөрөнхийлж, мөрүүдэд running remainder-ээр хуваарилна; eBarimt-ийн item-ийн НӨАТ нийлбэр яг таарна.
- **Алхам.** 03-02: `C-B2B`, үнэ НӨАТ-гүй, 3 мөр `SRV-CONS` тус бүр 100.05.
- **Хүлээгдэх.** Баримтын НӨАТ `round(300.15 × 0.10) = 30.02`. Мөрийн НӨАТ 10.01 / 10.00 / 10.01. G/L: Дт 1200 330.17; Кт 5110 300.15 (нэг мөр, buffer); Кт 2300 30.02. VAT entry: суурь −300.15, дүн −30.02, `vat_percent` 10. eBarimt: item `totalVAT` 10.01 + 10.00 + 10.01 = 30.02 = баримтын `totalVAT`.

**GS-VAT-002 — Үнэ НӨАТ-тэй, бэлэн борлуулалт** · R1 · FR-TAX-005 AC2, FR-SAL-006 AC1
- **Зорилго.** Үнэ НӨАТ-тэй үед бүлгийн НӨАТ ба суурийг тооцох, бэлэн төлбөрийг автоматаар бичих (D-F5).
- **Алхам.** 03-02 `clerk`: `C-B2C` (үнэ НӨАТ-тэй, бэлэн), мөр `GD-BREAD` 1 × 33 000.00 ба `GD-MILK` 1 × 13 993.00.
- **Хүлээгдэх.** НӨАТ 4 272.09 (`46 993 × 10/110`), суурь 42 720.91; мөрийн НӨАТ 3 000.00 ба 1 272.09. T1: Дт 1200 46 993.00; Кт 5100 42 720.91; Кт 2300 4 272.09. T2: Дт 1100 46 993.00; Кт 1200 46 993.00. Хоёр харилцагчийн entry хаагдсан. `KO-2026-00001`.

**GS-VAT-003 — Холимог ангилал** · R1 · FR-TAX-002, FR-TAX-007 AC1, INV-31
- **Зорилго.** Нэг баримтад өөр ангиллын мөрүүд: ангилал бүр тусдаа VAT entry, 0%-ийн мөрөнд НӨАТ-ын G/L мөр үүсэхгүй, eBarimt-д `taxType` тус бүрд дэд баримт.
- **Алхам.** 03-02: `C-B2B`, `SRV-CONS` 1 000 (VAT10), `SRV-ZERO` 500 (VAT0), `GD-BOOK` 300 (EXEMPT).
- **Хүлээгдэх.** G/L: Дт 1200 1 900; Кт 5110 1 000; Кт 5110 500; Кт 5100 300; Кт 2300 100 (VAT0 ба EXEMPT-д НӨАТ-ын G/L мөр **байхгүй**). VAT entry 3: VAT10 −1 000 / −100; VAT0 −500 / 0; EXEMPT −300 / 0. eBarimt `B2B_RECEIPT` (`customerTin` 61200064714): `receipts` = [VAT_ABLE 1 100 / 100, VAT_ZERO 500 / 0, VAT_FREE 300 / 0]; VAT_ZERO ба VAT_FREE item-д `taxProductCode` байна.

**GS-VAT-004 — Орцын НӨАТ ба ДДТД баталгаажуулалт** · R1 · FR-TAX-009 AC1–AC3, D-E4, INV-16, AT-EB-38
- **Зорилго.** Орцын НӨАТ зөвхөн баталгаажсан 33 оронтой ДДТД-тэй үед ТТ-03а-д хасагдана; баталгаажуулалт ledger бичихгүй, зөвхөн туг өөрчилнө.
- **Алхам.** 03-03: `V-DOM`-оос худалдан авалт, 7200 цэвэр 1 000 000 + НӨАТ, ДДТД-гүй. 03-04: 32 оронтой ДДТД бүртгэх. 03-05: 33 оронтой ДДТД `123456789012345678901234567890123` бүртгэж баталгаажуулах. 03-06: ижил ДДТД-ийг өөр нэхэмжлэхэд.
- **Хүлээгдэх.** `PI-2026-00001`: Дт 7200 1 000 000; Дт 1300 100 000; Кт 2100 1 100 000. VAT entry PURCHASE суурь 1 000 000 / дүн 100 000, `deductible_confirmed = false`; ТТ-03а 3-р сар: мөр 8 = 0, "Баталгаажаагүй орцын НӨАТ" жагсаалтад 100 000. 32 орон → 422 `ebarimt.purchase_receipt_ddtd_invalid`. Баталгаажуулалтын дараа `deductible_confirmed = true`, `supplier_ebarimt_id` бөглөгдсөн; ТТ-03а мөр 7 = 1 000 000, мөр 8 = −100 000 (хэвлэхэд 100 000). Давхар → 409 `ebarimt.purchase_receipt_duplicate`. G/L өөрчлөгдөхгүй (баталгаажуулалт нь ledger бичихгүй).

**GS-VAT-005 — Хасагдахгүй орцын НӨАТ** · R1 · FR-TAX-010 AC1
- **Зорилго.** Хасагдахгүй орцын НӨАТ зардалд шингэж, 1300-д бичигдэхгүй, ТТ-03а-гийн мэдээллийн мөрөнд л харагдана.
- **Алхам.** 03-03: `V-DOM`-оос суудлын машины засвар, 7200 цэвэр 1 000 000 + НӨАТ 100 000, хасагдахгүй шалтгаан `PASSENGER_CAR`.
- **Хүлээгдэх.** Дт 7200 1 100 000 (цэвэр + хасагдахгүй НӨАТ, 08 BR-TAX-53); Кт 2100 1 100 000; 1300-д мөр **байхгүй**. VAT entry PURCHASE: `base` 0.00, `amount` 0.00, `non_deductible_base` 1 000 000.00, `non_deductible_amount` 100 000.00, шалтгаан `PASSENGER_CAR`, `deductible_confirmed = false` ([08 BR-TAX-25](./08-tax-vat-mn.md), E-TAX-02 entry 405). ТТ-03а: мөр 7, 8-д орохгүй, мөр 11 (мэдээлэл) = 100 000. Сөрөг: шалтгаангүйгээр хасагдахгүй гэж тэмдэглэх → 422 `tax.non_deductible_reason_required`; `NON_VAT_COMPANY`-г гараар сонгох → 422 `tax.non_deductible_reason_invalid` (BR-TAX-52).

**GS-VAT-006 — НӨАТ төлөгч бус компани** · R1 · `BASE-NONVAT` · FR-TAX-011 AC1/AC2, D-E5
- **Зорилго.** НӨАТ төлөгч бус компани борлуулалтад НӨАТ тооцохгүй, худалдан авалтын НӨАТ-ыг өртөгт шингээнэ (D-E5).
- **Алхам.** 03-02: `C-B2B`-д `SRV-NOVAT` 1 000 000. 03-02: `C-B2B`-д `SRV-CONS` (setup DOMESTIC × **VAT10**) 500 000. 03-03: `V-DOM`-оос 7200 цэвэр 200 000 + НӨАТ 20 000 (ДДТД-тэй). 03-31: `vatReturn.close` 2026-03.
- **Хүлээгдэх.** Борлуулалт 1: Дт 1200 1 000 000; Кт 5110 1 000 000; 2300-д мөр байхгүй; VAT entry SALE NOVAT суурь −1 000 000 / 0. Борлуулалт 2 (BR-TAX-55: VAT10 setup → хувь 0, хэрэгжих ангилал `NOVAT`): Дт 1200 500 000; Кт 5110 500 000; VAT entry SALE `vat_category` NOVAT, `vat_percent` 0, суурь −500 000 / 0 (`vat_identifier` = VAT10 — босгын эргэлтэд тооцогдоно, BR-TAX-83). eBarimt item бүр `NOT_VAT`, `totalVAT = 0`, `taxProductCode` бөглөгдсөн (SRV-NOVAT: `TPC0003`; SRV-CONS: setup-ийн `TPC0003`, §12.1 BASE-NONVAT). Худалдан авалт: Дт 7200 220 000; Кт 2100 220 000; VAT entry `base` 0, `amount` 0, `non_deductible_base` 200 000, `non_deductible_amount` 20 000, шалтгаан `NON_VAT_COMPANY` (BR-TAX-25). `vatReturn.close` → 409 `tax.company_not_vat_registered` (BR-TAX-55).

**GS-VAT-007 — ТТ-03а туслах тайлан, НӨАТ-ын хаалт, илгээх** · R1 · FR-TAX-013 AC1, FR-TAX-015 AC1, FR-TAX-014, D-E8
- **Зорилго.** Сарын НӨАТ-ын бүрэн мөчлөг: ТТ-03а туслах тайлан, баталгаажаагүй орцын НӨАТ тусдаа, settlement ваучер, илгээсэн үеийн түгжээ.
- **Алхам.** Override `ebarimt.enabled = false`. 3-р сард: (1) 03-05 `C-B2B` `SRV-CONS` 10 000 000; (2) 03-06 `C-EXP` `SRV-CONS` 2 000 000 (EXPORT×VAT10 → VAT0, 5120); (3) 03-10 `V-DOM` 7200 3 000 000 + 300 000, ДДТД баталгаажсан; (4) 03-12 `V-DOM` 7200 500 000 + 50 000, баталгаажаагүй; (5) ТТ-03а тайлан; (6) 03-31 `vatReturn.close` 2026-03; (7) 04-08 `vatReturn.submit`; (8) 04-09: `vat_date` 2026-03-20-той худалдан авалт.
- **Хүлээгдэх.** (2): Дт 1201 2 000 000; Кт 5120 2 000 000; VAT entry VAT0 суурь −2 000 000 / 0. (5) ТТ-03а: мөр 1 = 10 000 000; 2 = 1 000 000; 3 = 2 000 000; 6 = 12 000 000; 7 = 3 000 000; 8 = −300 000; 12 = −300 000; 14 = 700 000. Баталгаажаагүй жагсаалт: 1 мөр, 50 000. (6) settlement ваучер 03-31: Дт 2300 1 000 000; Кт 1300 300 000; Кт 2310 700 000; баталгаажсан VAT entry бүр `closed = true`; 50 000-ын entry нээлттэй, 1300-д 50 000 үлдэнэ; НӨАТ-ын үе `CLOSED`. (7) үе `SUBMITTED`, аудит `VAT_PERIOD_SUBMITTED`. (8) → 422 `tax.vat_period_closed` (DB `ERV01`).

**GS-VAT-008 — Хоцорсон худалдан авалтын НӨАТ-ын огноо** · R1 · FR-TAX-008 AC1/AC2, D-E9
- **Зорилго.** Хоцорч ирсэн худалдан авалтын НӨАТ-ын огноог нээлттэй өмнөх НӨАТ-ын үед оруулах ба илгээсэн үед хориглох (D-E9).
- **Алхам.** 04-03: `V-DOM`-оос 7200 200 000 + 20 000, `vat_date` 2026-03-28, ДДТД баталгаажсан (3-р сарын НӨАТ-ын үе OPEN). Дараа нь 3-р сарын үеийг `SUBMITTED` болгоод (override эсвэл алхам), 04-05-нд ижил `vat_date`-тэй худалдан авалт.
- **Хүлээгдэх.** Эхнийх: posting огноо 04-03, VAT entry `vat_date` 03-28; ТТ-03а 3-р сар мөр 8 = −20 000, 4-р сард орохгүй. Хоёр дахь → 422 `tax.vat_period_closed`.

**GS-VAT-009 — НӨАТ-ын босгын хяналт (2027)** · R1 · `BASE-NONVAT` · `rules: 2027` · FR-TAX-012 AC1/AC2, FR-TAX-017 AC1, D-K5
- **Зорилго.** Хуулийн босго код өөрчлөхгүйгээр `tax_parameter`-ийн огноогоор солигдоно (2027-07-01-нээс 400 сая, D-K5).
- **Алхам.** Борлуулалт (`C-B2B`, `SRV-CONS` — setup DOMESTIC × VAT10; **`SRV-NOVAT` биш**: BR-TAX-83-ийн эргэлтэд зөвхөн setup-ийн ангилал VAT10/VAT0 мөр орно): 2026-08-01 20 000 000; 2027-03-01 21 000 000. 2027-05-15-нд `job.run tax.vat_threshold.check`. 2027-07-02-нд дахин.
- **Хүлээгдэх.** 05-15: 12 сарын эргэлт `T` = 41 000 000, `M` = 50 000 000, харьцаа 82.00 % → түвшин `APPROACHING`, анхааруулга W-TAX-01 `tax.vat_threshold_approaching` (мессежид "41 000 000", "50 000 000", "82"), outbox `tax.vat_threshold.level_changed` 1. 07-02: ижил 41 000 000, `M` = 400 000 000 (2027-07-01-нээс) → `VOLUNTARY_ELIGIBLE` (мэдээлэл W-TAX-03), W-TAX-01/02 **гарахгүй** ([08 §6.13](./08-tax-vat-mn.md)). `GET /tax-parameters/vat.registration_threshold_mandatory?date=2027-06-30` → 50 000 000, `?date=2027-07-01` → 400 000 000 ([14 AT-API-047](./14-api.md); `valueNumeric` string).

**GS-VAT-010 — Reverse charge (R2)** · FR-TAX-020 AC1
- **Зорилго.** Резидент бусаас авсан үйлчилгээний урвуу тооцооны НӨАТ G/L-д цэвэр 0, VAT entry-д бүтэн дүнгээр.
- **Алхам.** 03-03: `V-FOR`-оос 7230 (мэргэжлийн үйлчилгээ) 3 500 000, VAT Prod. `IMPORT_SERVICE`.
- **Хүлээгдэх.** Дт 7230 3 500 000; Кт 2101 3 500 000; Дт 1300 350 000; Кт 2305 350 000 (G/L-д НӨАТ цэвэр 0). VAT entry PURCHASE `REVERSE_CHARGE` суурь 3 500 000 / 350 000 (ДДТД шаардахгүй). Нийлүүлэгчийн entry −3 500 000.

**GS-VAT-011 — Гаалийн НӨАТ (FULL_VAT, R2)** · FR-TAX-021 AC1
- **Зорилго.** Гаалийн НӨАТ (FULL_VAT): суурь 0, мөрийн дүн бүхэлдээ НӨАТ, ДДТД-гүйгээр мэдүүлгээр хасагдана.
- **Алхам.** 03-08: банкны төлбөр, мөр: G/L 1300, VAT Prod. `CUSTOMS_VAT` (FULL_VAT) 1 200 000, гадаад баримтын дугаар = гаалийн мэдүүлгийн дугаар, харьцсан `BANK01`.
- **Хүлээгдэх.** Дт 1300 1 200 000; Кт 1110 1 200 000. VAT entry PURCHASE `FULL_VAT` суурь 0, дүн 1 200 000, мэдүүлгээр хасагдах (ТТ-03а мөр 9).

**GS-VAT-012 — НХАТ (R2)** · FR-TAX-019 AC1, D-E6
- **Зорилго.** НХАТ нь НӨАТ-аас тусдаа мөр, данс, ledger-тэй, суурь нь НӨАТ-гүй дүн; eBarimt-ийн `totalCityTax`.
- **Алхам.** Profile `city_tax_payer = true`, НХАТ `UB` 2%. 03-02: `C-B2B`-д рестораны үйлчилгээ цэвэр 5 000 (VAT10 + НХАТ).
- **Хүлээгдэх.** НӨАТ 500, НХАТ 100 (суурь = НӨАТ-гүй 5 000), нийт 5 600. Дт 1200 5 600; Кт 5110 5 000; Кт 2300 500; Кт 2320 100. `city_tax_entry` суурь −5 000 / −100. eBarimt item `totalCityTax = 100.00`, баримтын `totalCityTax = 100.00`.

**GS-VAT-013…022 — 08-ийн нэмэлт scenario** (алхам, дүн: [08 §7, §11.2](./08-tax-vat-mn.md); baseline: "Жишээ ХХК" → `BASE-VAT`, "Бага ХХК" → `BASE-NONVAT`; master data-г §12.1-ийн дүрмээр хөрвүүлнэ)

| ID | Хув. | Гол хүлээгдэх (08-аас) |
|---|---|---|
| GS-VAT-013 | R1 | Сөрөг бүлэг эхэлж, carry: −100.03 / +1 000.05 → НӨАТ −10.00 / +100.00 = 90.00 (`round(900.02 × 0.1)`); GS-SAL-008-тай ижил G/L, энд VAT entry ба carry-г шалгана |
| GS-VAT-014 | R1 | `extends: GS-VAT-007`: 2310-ын Кт үлдэгдлийг банкаар төлөх: Дт 2310 / Кт 1110, VAT entry 0 (BR-TAX-81) |
| GS-VAT-015 | R1 | Хаагдсан үеийн `vat_date`-тэй entry хожуу баталгаажвал дараагийн нээлттэй үеийн ТТ-03а-д (мөр 7, 8) орно; өмнөх үеийн тайлан өөрчлөгдөхгүй; W-TAX-10 |
| GS-VAT-016 | R1 · Should | `vatEntry.rejectDeduction` (`NO_EBARIMT`): `VATADJ` ваучер Дт суурь данс / Кт 1300; эсрэг VAT entry (`non_deductible_*`), хос `closed = true`; ТТ-03а мөр 11 |
| GS-VAT-017 | R1 | `vatReturn.reopen` (Owner, step-up, шалтгаан ≥ 10 тэмдэгт): SETTLEMENT ваучерыг эх огноогоор толин тусгалаар буцаана, `vat_return_period_id` NULL, үе `OPEN`; дахин хаахад ижил дүн; `SUBMITTED` үеийг нээх → 409 `tax.vat_period_submitted` |
| GS-VAT-018 | R1 | `tax_parameter`-ийн хил: 2027-06-30 ба 07-01-ний хайлт өөр мөр буцаана; параметргүй огноо → `tax.parameter_not_effective` (BR-TAX-11) |
| GS-VAT-019, 020 | R2 | НХАТ үнэ НӨАТ-тэй (14 440.00 → НӨАТ 1 289.29 / НХАТ 257.86 / суурь 12 892.85); НХАТ-ын хаалт `CITYTAXSTMT` 2320 → 2325 |
| GS-VAT-021 | R2 · Could | Хялбаршуулсан НӨАТ (параметр `verified` болсны дараа л gating) |
| GS-VAT-022 | R2 | ААНОАТ-ын туслах тайлан (Q1 185 000, Q2 215 000) |

### 12.5 Борлуулалт (SAL)

GS-SAL-001…012 нь [06-sales-receivables §7 ба §11.2](./06-sales-receivables.md)-ийг хэрэгжүүлнэ (P1…P10). 06-ийн жишээ 2027 оны огноотой тул scenario-ийн огноо мөн 2027 байна. GS-SAL-013 нь энэ баримтын нэмэлт.

**GS-SAL-001 — B2C бэлэн борлуулалт** · R1 · [18 §13.3](./18-dev-setup.md), [06 P2](./06-sales-receivables.md) · FR-SAL-005, FR-SAL-006, FR-EBR-002, FR-EBR-006 (бүтэн YAML: §11.7)
- **Зорилго.** B2C бэлэн борлуулалтын бүтэн урсгал: нэхэмжлэх, автомат кассын төлбөр (МХ-1), eBarimt, idempotency.
- **Алхам.** 03-02 `clerk`: `C-B2C` (үнэ НӨАТ-тэй, бэлэн), `GD-BREAD` 2 × 11 000. Ижил `Idempotency-Key`-ээр давтан дуудах.
- **Хүлээгдэх.** `SI-2026-00001`; T1 Дт 1200 22 000 / Кт 5100 20 000 / Кт 2300 2 000; T2 Дт 1100 22 000 / Кт 1200 22 000; `KO-2026-00001`; eBarimt `B2C_RECEIPT` SUCCESS, `billIdSuffix` `001000001`; давтан дуудлагад `Idempotent-Replayed: true`, ledger ба PosAPI-ийн дуудлага нэмэгдэхгүй.

**GS-SAL-002 — B2B зээлийн нэхэмжлэх: 4 мөр, НӨАТ-ын хуваарилалт** · R1 · [06 P1](./06-sales-receivables.md) · FR-SAL-003 AC1, FR-SAL-004, FR-SAL-005 AC1, FR-TAX-004, FR-PTY-007 AC1, FR-EBR-002 AC1
- **Зорилго.** Хоёр Gen. Prod-ийн дансны тодорхойлолт, мөрийн хөнгөлөлт (`NO_DISCOUNTS`, анхдагч), баримтын түвшний НӨАТ-ын running remainder, авлагын entry, async eBarimt `B2B_RECEIPT`.
- **Алхам.** 2027-03-10 `acc`: `C-B2B` (NET30, үнэ НӨАТ-гүй). Мөр 10000: `SRV-CONS` 3 × 333.335, хөнгөлөлт 10 %. Мөр 20000, 30000, 40000: `GD-BREAD` 1 × 100.05. Дараа нь `ebarimt.dispatch`.
- **Хүлээгдэх.** Мөрийн дүн 900.01 / 100.05 / 100.05 / 100.05. Мөрийн НӨАТ 90.00 / 10.01 / 10.00 / 10.01 (Σ 120.02; мөр тус бүр бөөрөнхийлбэл 120.03 болох байсан). `SI-2027-00001`: Кт 5100 300.15 (`vat_amount` −30.02); Кт 2300 30.02; Кт 5110 900.01 (`vat_amount` −90.00); Кт 2300 90.00; Дт 1200 1 320.18. VAT entry 2: −300.15 / −30.02 ба −900.01 / −90.00, `VAT_ABLE`. CLE +1 320.18, `sales_lcy` 1 200.16, `due_date` 2027-04-09, нээлттэй; INITIAL detailed. eBarimt `B2B_RECEIPT`, `customerTin` = `C-B2B`-ийн ТТД, `payments[0] = {BANK_TRANSFER, PAID, 1320.18}`. Outbox `PENDING` → `DONE`, баримт SUCCESS.

**GS-SAL-003 — Хөнгөлөлт тусдаа дансанд (`LINE_DISCOUNTS`)** · R1 · [06 P1a](./06-sales-receivables.md) · FR-SAL-003 AC2, D-F2
- **Зорилго.** `discount_posting = LINE_DISCOUNTS` үед хөнгөлөлт ба түүний НӨАТ тусдаа мөрөөр бичигдэнэ. Цэвэр дүн GS-SAL-002-той ижил.
- **Алхам.** Profile `salesDiscountPosting: LINE_DISCOUNTS`. GS-SAL-002-тэй ижил нэхэмжлэх.
- **Хүлээгдэх.** `SI-2027-00001`: Кт 5110 1 000.01 (VAT entry −1 000.01 / −100.00); Кт 2300 100.00; Дт 5190 100.00 (VAT entry +100.00 / +10.00); Дт 2300 10.00; Кт 5100 300.15 (VAT entry −300.15 / −30.02); Кт 2300 30.02; Дт 1200 1 320.18. Σ Дт = Σ Кт = 1 430.18. VAT entry-ийн цэвэр нийлбэр −1 200.16 / −120.02. CLE +1 320.18.

**GS-SAL-004 — Бэлэн мөнгөний бүхэлчлэл** · R1 · [06 P2b](./06-sales-receivables.md) · FR-SAL-013 AC1, D-C2, MAP-03
- **Зорилго.** Бэлэн мөнгөний бүхэлчлэл тусдаа дансанд бичигдэнэ, eBarimt-д орохгүй (MAP-03).
- **Алхам.** Profile `invoiceRoundingEnabled: true`. 2027-03-11 `clerk`: `C-B2C` бэлэн, `GD-MILK` 1 × 46 993.40.
- **Хүлээгдэх.** НӨАТ 4 272.13, суурь 42 721.27, бүхэлчлэлийн мөр −0.40. T1 `SI-2027-00001`: Дт 1200 46 993.00; Дт 8290 0.40; Кт 5100 42 721.27; Кт 2300 4 272.13. T2: Дт 1100 46 993.00; Кт 1200 46 993.00. Posted header: `amount` 42 720.87, `vat_amount` 4 272.13, `amount_including_vat` 46 993.00 (= CLE). eBarimt: бүхэлчлэлийн мөр item-д орохгүй; `totalAmount` = Σ items = 46 993.40, `totalVAT` 4 272.13, `paidAmount` 46 993.40 (AT-EB-11).

**GS-SAL-005 — Хэсэгчилсэн кредит нот** · R1 · [06 P3](./06-sales-receivables.md) · FR-SAL-007 AC1, FR-GL-020 AC2, FR-TAX-006 AC1, FR-EBR-010
- **Зорилго.** Хэсэгчилсэн кредит нот: шалтгаан заавал, автомат тулгалт, НӨАТ-ын эсрэг бичилт, eBarimt-ийн `inactiveId` засвар.
- **Алхам.** 2027-03-01: `C-B2B`, `GD-BREAD` 1 × 1 000.00 (+100.00). 03-15: шалтгаангүй кредит нот. 03-15: `RETURN` шалтгаантай кредит нот, `GD-BREAD` 1 × 200.00, `appliesTo` = нэхэмжлэх.
- **Хүлээгдэх.** Нэхэмжлэх `SI-2027-00001`: Дт 1200 1 100.00; Кт 5100 1 000.00; Кт 2300 100.00. Шалтгаангүй → 422 `sales.reason_code_required`. Кредит нот `SC-2027-00001`: Дт 5100 200.00; Дт 2300 20.00; Кт 1200 220.00. VAT entry SALE +200.00 / +20.00. Автомат тулгалт: нэхэмжлэхийн үлдэгдэл 880.00 нээлттэй, кредит нотын entry хаагдсан. eBarimt: шинэ `B2B_RECEIPT` нийт 880.00 / НӨАТ 80.00, `inactiveId` = эх баримтын ДДТД; эх баримт `CANCELLED`.

**GS-SAL-006 — Нэхэмжлэх цуцлах** · R1 · [06 P4](./06-sales-receivables.md) · FR-SAL-008 AC1/AC2, FR-EBR-009 AC1, INV-21
- **Зорилго.** Нэхэмжлэх цуцлах = бүтэн кредит нот + тулгалт + холбоос. Давтан цуцлах ба тулгагдсан нэхэмжлэхийг цуцлахыг хориглоно. B2C баримтыг `DELETE`, B2B баримтыг гараар цуцална.
- **Алхам.** (а) 2027-03-05: `C-B2B`, `GD-BREAD` 1 × 1 000.00 (+100.00) → SUCCESS. 03-20: `:cancel` (шалтгаан `CANCEL`). 03-21: дахин `:cancel`. (б) 03-22: `C-B2C`, төлбөрийн хэлбэргүй (зээл), `GD-BREAD` НӨАТ-тэй 1 100 → `B2C_RECEIPT` SUCCESS. 03-23: `:cancel`. (в) 03-24: `C-B2B`-ийн шинэ нэхэмжлэх 1 100, 03-25 банкаар 500 төлж тулгах, 03-26 `:cancel`.
- **Хүлээгдэх.** (а) `SC-2027-00001` (огноо 03-20, мөр 1:1, НӨАТ-ын хувийн snapshot): Дт 5100 1 000.00; Дт 2300 100.00; Кт 1200 1 100.00. Хоёр CLE хаагдсан. `sales.cancelled_document` холбоос, нэхэмжлэхийн `status = CANCELLED`. eBarimt: B2B тул гараар цуцлах даалгавар (12 RET-51); `ebarimt.confirmManualVoid`-ийн дараа эх баримт `CANCELLED`. Давтан цуцлалт → 409 `sales.invoice_already_cancelled`. (б) `SC-2027-00002`; eBarimt `DELETE` баримт SUCCESS, эх баримт `CANCELLED`; PosAPI: post 1, delete 1. (в) → 409 `sales.invoice_has_applications`. 3-р сарын НӨАТ-ын тайланд нэхэмжлэх ба кредит нотын VAT entry хоёулаа (−1 000.00 / −100.00 ба +1 000.00 / +100.00).

**GS-SAL-007 — Бэлэн борлуулалтын буцаалт ба МХ-2** · R1 · [06 P2, P9](./06-sales-receivables.md) · FR-SAL-007, FR-BNK-003 AC1, FR-EBR-010, BR-SAL-52, BR-SAL-63
- **Зорилго.** Бэлэн борлуулалтын бараа буцаалт: кредит нот, бэлэн буцаан олголт (МХ-2), хаагдсан нэхэмжлэхэд тулгахгүй, eBarimt-ийн засварын баримт.
- **Алхам.** 2027-03-11 `clerk`: `C-B2C` бэлэн, үнэ НӨАТ-тэй: мөр 10000 `GD-BREAD` 3 × 11 000; мөр 20000 `GD-MILK` 7 × 1 999. 03-12 `acc`: нэхэмжлэхээс буцаалт, мөр 20000-ийн 1 ширхэг, шалтгаан `RETURN`, төлбөрийн хэлбэр `CASH`.
- **Хүлээгдэх.** Борлуулалт: НӨАТ 4 272.09 (3 000.00 + 1 272.09). `SI-2027-00001`: Дт 1200 46 993.00; Кт 5100 42 720.91; Кт 2300 4 272.09. T2 (`PAYMENT`, `document_no` = нэхэмжлэх): Дт 1100 46 993.00; Кт 1200 46 993.00; МХ-1 `KO-2027-00001`. Хоёр CLE хаагдсан. Буцаалт: НӨАТ 181.73, суурь 1 817.27. `SC-2027-00001`: Дт 5100 1 817.27; Дт 2300 181.73; Кт 1200 1 999.00. T (`REFUND`): Дт 1200 1 999.00; Кт 1100 1 999.00; МХ-2 `KZ-2027-00001`. Кредит нот ба REFUND entry бие биетэйгээ тулгагдсан (нэхэмжлэх аль хэдийн хаагдсан). eBarimt: шинэ `B2C_RECEIPT` 44 994.00 / НӨАТ 4 090.36, `inactiveId` = анхны ДДТД. Кассын үлдэгдэл 44 994.00.

**GS-SAL-008 — Сөрөг мөр, тэмдгээр хуваасан НӨАТ-ын бүлэг** · R1 · [06 P10](./06-sales-receivables.md) · FR-TAX-004, FR-TAX-006
- **Зорилго.** Сөрөг (хөнгөлөлтийн) мөрийн НӨАТ-ыг эерэг мөрөөс тусдаа бүлгээр тооцоолно (06 §6.5).
- **Алхам.** 2027-03-18 `acc`: `C-B2B`. Мөр 10000: `GD-BREAD` 1 × 1 000.05. Мөр 20000: `GL_ACCOUNT` 5190 "Хөнгөлөлт" 1 × −100.03 (VAT10).
- **Хүлээгдэх.** Сөрөг бүлэг эхэлж тооцогдоно: −100.03 × 0.1 = −10.003 → −10.00, carry −0.003; эерэг бүлэг R(100.005 − 0.003) = 100.00 (carry-гүй бол 100.01 болж нийт 90.01 — буруу); нийт 90.00 = R(900.02 × 0.1) ([08 BR-TAX-18, §6.4](./08-tax-vat-mn.md)). `SI-2027-00001`: Кт 5100 1 000.05 (VAT entry −1 000.05 / −100.00); Кт 2300 100.00; Дт 5190 100.03 (VAT entry +100.03 / +10.00); Дт 2300 10.00; Дт 1200 990.02. Σ Дт = Σ Кт = 1 100.05. Цэвэр суурь −900.02, НӨАТ −90.00.

**GS-SAL-009 — VAT10 ба EXEMPT мөр** · R1 · 06 §5.7 · FR-TAX-002, FR-TAX-007 AC1
- **Зорилго.** Нэг баримтад VAT10 ба EXEMPT мөр: 2 VAT entry, EXEMPT-ийн НӨАТ-ын G/L мөр байхгүй.
- **Алхам.** 2027-03-19 `acc`: `C-B2B`. `GD-BREAD` 1 × 10 000.00 (VAT10). `GD-BOOK` 1 × 5 000.00 (EXEMPT).
- **Хүлээгдэх.** `SI-2027-00001`: Кт 5100 10 000.00 (VAT10); Кт 5100 5 000.00 (EXEMPT, тусдаа buffer мөр); Кт 2300 1 000.00; Дт 1200 16 000.00. VAT entry 2: VAT10 −10 000.00 / −1 000.00; EXEMPT −5 000.00 / 0.00. 2300 руу EXEMPT-ийн мөр 0.

**GS-SAL-010 — НӨАТ төлөгч бус компанийн борлуулалт** · R1 · `BASE-NONVAT` · AT-SAL-28 · FR-TAX-011, D-E5
- **Зорилго.** НӨАТ төлөгч бус компанид мөрийн НӨАТ 0, VAT entry суурьтай боловч 0 дүнтэй, 2300 руу бичилт байхгүй.
- **Алхам.** 2027-03-10 `acc`: `C-B2B`, `GD-BREAD` 1 × 11 000.00.
- **Хүлээгдэх.** `SI-2027-00001`: Дт 1200 11 000.00; Кт 5100 11 000.00. VAT entry 1: суурь −11 000.00, дүн 0.00, `vat_category` NOVAT, `vat_percent` 0 (BR-TAX-55). 2300-ийн мөр 0. eBarimt-ийн мөр `NOT_VAT`, `taxProductCode` `TPC0003` (§12.1 BASE-NONVAT setup; GS-EBR-008-тэй нийцнэ).

**GS-SAL-011 — Засварлах: цуцлах ба шинэ ноорог** · R1 · AT-SAL-25 · FR-SAL-009 AC1, BR-SAL-78
- **Зорилго.** Цуцлалтын үед засварын ноорог үүсгэж, шинэ нэхэмжлэхээр солих урсгал.
- **Алхам.** 2027-03-05 `acc`: `C-B2B`, `GD-BREAD` 2 × 500.00. 03-06: `:cancel` (шалтгаан `CORRECTION`, `createCorrectiveDraft: true`). Хариуны `correctiveDraftId` ноорогт тоо хэмжээг 3 болгож батлах.
- **Хүлээгдэх.** `SI-2027-00001`: Дт 1200 1 100.00; Кт 5100 1 000.00; Кт 2300 100.00. Цуцлалт `SC-2027-00001`. Хариунд `correctiveDraftId`, ноорог `OPEN`, эх мөртэй. Шинэ нэхэмжлэх `SI-2027-00002`: Дт 1200 1 650.00; Кт 5100 1 500.00; Кт 2300 150.00. Эх нэхэмжлэх ба кредит нот хаагдсан.

**GS-SAL-012 — НӨАТ-ын хувийн огнооны солилт ба цуцлалтын snapshot** · R1 · `rules: 2027` · AT-SAL-24 · BR-SAL-74, D-E7
- **Зорилго.** `tax_parameter` огноогоор солигдоход шинэ баримт шинэ хувиар, цуцлалт эх нэхэмжлэхийн хувиар (snapshot) бичигдэнэ.
- **Алхам.** Override `taxParameters`: `vat.standard_rate` = 0.12, `effectiveFrom` 2027-04-01 (**зохиомол утга, зөвхөн тест**; хуулийн өөрчлөлт биш). 03-25: `C-B2B`, `GD-BREAD` 1 × 1 000.00. 04-02: ижил нэхэмжлэх. 04-03: эхний нэхэмжлэхийг `:cancel`.
- **Хүлээгдэх.** `SI-2027-00001` (10 %): Дт 1200 1 100.00; Кт 5100 1 000.00; Кт 2300 100.00. `SI-2027-00002` (12 %): Дт 1200 1 120.00; Кт 5100 1 000.00; Кт 2300 120.00. `SC-2027-00001` (04-03): Дт 5100 1 000.00; Дт 2300 100.00; Кт 1200 1 100.00. VAT entry +1 000.00 / +100.00 (10 %, 12 % биш).

**GS-SAL-013 — Idempotency-Key** · R1 · FR-SAL-005 AC2, FR-INT-002, NFR-004
- **Зорилго.** `Idempotency-Key`-ийн дүрэм: ижил түлхүүр + өөр body-г татгалзах, бизнесийн алдааны дараа түлхүүр хадгалагдахгүй.
- **Алхам.** (1) Түлхүүр K1-ээр `C-B2B`-ийн нэхэмжлэх батлах. (2) K1, мөрийн тоо хэмжээ өөр. (3) `C-B2B` блоклогдсон үед K2-оор өөр ноорог батлах. (4) Блокийг авч K2-оор дахин.
- **Хүлээгдэх.** (1) `SI-2026-00001`. (2) → 422 `api.idempotency_key_reused`, `noRowsWritten`. (3) → 422 `sales.customer_blocked`. (4) OK, `SI-2026-00002` (бизнесийн алдааны дараа түлхүүр хадгалагдаагүй, [02 §8.5](./02-architecture.md)).

### 12.6 Худалдан авалт ба өглөг (PUR, AP)

GS-PUR-001…012 ба GS-AP-001…007 нь [07-purchases-payables §7 ба §11.2](./07-purchases-payables.md)-ийн жишээ P1…P15, AT-AP-07, AT-AP-13-ыг хэрэгжүүлнэ. **Алхам, дүн, данс, VAT entry, VLE, detailed-ийн эх сурвалж нь 07** (энд давтахгүй; §12.1-ийн хөрвүүлэх дүрэм). 07-ийн жишээ 2027 оны огноотой. 07-ийн golden бүрийн нэмэлт `expect` ([07 §11.2](./07-purchases-payables.md)): `purchase_receipt`-ийн төлөв, МХ-1/МХ-2, `v_vendor_ledger_entry_check` хоосон, `v_payables_reconciliation.difference = 0`, 1300 = Σ PURCHASE VAT entry (¬closed). GS-PUR-013…015 нь энэ баримтын нэмэлт (07-д байхгүй хил ба сөрөг тохиолдол).

| ID | 07-ийн эх | Энэ баримтын нэмэлт шалгалт |
|---|---|---|
| GS-PUR-001 | P1 | Нийлүүлэгчийн entry-ийн тэмдэг (кредит = сөрөг), `v_vendor_balance.balance_lcy` сөрөг (UI-д "Өглөг" эерэгээр) |
| GS-PUR-002 | P1a | `vat_difference` = +0.01, `max_vat_difference_allowed`-ийн дотор |
| GS-PUR-003 | P2 | `PI` ба `KZ` хоёр ваучер, МХ-2 |
| GS-PUR-004 | P3 | 08 E-TAX-02-той ижил дүрэм (GS-VAT-005) |
| GS-PUR-005 | P4, P4b | 08 BR-TAX-55 (`NON_VAT_COMPANY`) |
| GS-PUR-006 | P5 | ДДТД холбосны дараа `deductible_confirmed = true` (INV-16) |
| GS-PUR-007, 008 | P5b, P5c | `non_deductible_*`, шалтгаан |
| GS-PUR-009 | P6 | Кредит нот эх нэхэмжлэхтэй автомат тулгагдаж, баталгаажуулалтыг өвлөнө |
| GS-PUR-010 | P7 | Цуцлалт + засварласан нэхэмжлэх, receipt дахин холбогдоно |
| GS-PUR-011 | P15 | Хаагдсан нэхэмжлэхийн бэлэн буцаалт: кредит нот + МХ-1 |
| GS-PUR-012 (R2) | P13, P14 | GS-VAT-010, GS-VAT-011-тэй уялдана |
| GS-AP-001…007 | P8…P12, AT-AP-07, AT-AP-13 | Авлагын GS-AR-*-ийн толин тусгал; тулгалтын алхамд G/L мөр 0 (MNT) |

**GS-PUR-013 — Нийлүүлэгчийн баримтын дугаарын давхардал** · R1 · FR-PUR-001 AC1, FR-PUR-002 AC1, INV-18
- **Зорилго.** Нийлүүлэгчийн баримтын дугаар нэг нийлүүлэгч ба баримтын төрөлд давхардахгүй (INV-18). Аппын урьдчилсан шалгалт (07 BR-PUR-12) эхэлж, DB-ийн unique индекс хоёр дахь хамгаалалт (TST-P-03).
- **Алхам.** 03-03: `V-DOM`, нийлүүлэгчийн дугаар `A-123`, 7200 цэвэр 2 000 + НӨАТ, баталгаажсан ДДТД. 03-04: `V-DOM`, ижил `A-123`-тай өөр нэхэмжлэх. 03-04: `A-124`.
- **Хүлээгдэх.** `PI-2026-00001`: Дт 7200 2 000; Дт 1300 200; Кт 2100 2 200. `vendor_ledger_entry` −2 200, нээлттэй, `external_document_no` `A-123`. `A-123` → 409 `purchase.vendor_invoice_no_duplicate`, `noRowsWritten`, `PI` дугаар зарцуулаагүй. `A-124` → `PI-2026-00002`. DB түвшний хамгаалалтыг (precheck унтраасан, `23505` `ux_vendor_ledger_entry__vendor_doc_no` → ижил код) INT-ERR тест шалгана (§9.3).

**GS-PUR-014 — Нийлүүлэгчийн НӨАТ-ын зөрүүний дээд хязгаар** · R1 · FR-PUR-003 AC1/AC2, [08 BR-TAX-26](./08-tax-vat-mn.md)
- **Зорилго.** Нийлүүлэгчийн баримтын НӨАТ-ыг тохиргооны дээд зөрүү хүртэл хүлээн авч, зөрүүг хадгална; хэтэрвэл татгалзана.
- **Алхам.** Override `gl.general_ledger_setup.max_vat_difference_allowed = 1.00` (profile `maxVatDifferenceAllowed`). 03-03: `V-DOM` 7200 цэвэр 2 010.00, нийлүүлэгчийн баримтын НӨАТ 200.00 (систем 201.00). 03-04: цэвэр 2 010.00, НӨАТ 196.00.
- **Хүлээгдэх.** Эхнийх: Дт 7200 2 010.00; Дт 1300 200.00; Кт 2100 2 210.00; VAT entry дүн 200.00, `vat_difference` −1.00. Хоёр дахь (зөрүү 5.00) → 422 `tax.vat_difference_too_large` (мессежид "5.00", "1.00"), `noRowsWritten`.

**GS-PUR-015 — Бэлэн худалдан авалт ба кассын хориг** · R1 · FR-PUR-007 AC1, FR-BNK-003 AC1, D-G1, INV-19
- **Зорилго.** Касс сөрөг болохыг хориглох (D-G1); алдаатай posting дугаар зарцуулахгүй (PI ба KZ хоёулаа).
- **Алхам.** Эхний үлдэгдэл 01-01: `CASH01` 300 000. 03-05: `V-DOM`, бэлэн, 7213 цэвэр 363 636.36 + НӨАТ 36 363.64 = 400 000. 03-06: `V-DOM`, бэлэн, 7213 НӨАТ-тэй 88 000 (ДДТД-тэй).
- **Хүлээгдэх.** 400 000 → 422 `bank.cash_negative_balance` (DB `ERC01`, COMMIT үед; [07](./07-purchases-payables.md) §5); `PI`, `KZ` дугаар зарцуулагдаагүй. 88 000: `PI-2026-00001`: Дт 7213 80 000; Дт 1300 8 000; Кт 2100 88 000; төлбөр `KZ-2026-00001`: Дт 2100 88 000; Кт 1100 88 000. Кассын үлдэгдэл 212 000.

### 12.7 Авлагын тулгалт ба unapply (AR)

GS-AR-001…007 нь [06-sales-receivables §7 ба §11.2](./06-sales-receivables.md)-ийг хэрэгжүүлнэ (P5…P8, P11, P12, AT-AR-13). GS-AR-008…009 нь энэ баримтын нэмэлт. Нийлүүлэгчийн тулгалтыг GS-AP-001…007 шалгана. Дүнг энгийн байлгах үүднээс зарим нэхэмжлэх `SRV-NOVAT` (НӨАТ-гүй) барааг ашиглана.

**GS-AR-001 — Хэсэгчилсэн ба хоёр дахь төлбөр** · R1 · [06 P5](./06-sales-receivables.md) · FR-PTY-009 AC1/AC2, D-F3
- **Зорилго.** BC-ийн detailed entry-ийн загвараар хэсэгчилсэн ба бүтэн тулгалт, `closed_by`, `closed_at_date`.
- **Алхам.** 2027-01-10: `C-B2B`, `GD-BREAD` 1 × 1 000.00 (+100.00), төлөх 02-09. 01-20: `BANK01`-д 500.00 орлого, `appliesTo` = нэхэмжлэх. 02-05: 600.00, ижил.
- **Хүлээгдэх.** `SI-2027-00001`: Дт 1200 1 100.00; Кт 5100 1 000.00; Кт 2300 100.00. `BR-2027-00001`, `BR-2027-00002`: Дт 1110 / Кт 1200. Entry: `#1` нэхэмжлэх +1 100, `#2` −500, `#3` −600. Detailed: `#1` INITIAL +1 100; `#2` INITIAL −500; `#1` APPLICATION −500 (`appliedTo #2`); `#2` APPLICATION +500; `#3` INITIAL −600; `#1` APPLICATION −600; `#3` APPLICATION +600. 01-20-ны дараа `#1` үлдэгдэл 600 нээлттэй, `#2` хаагдсан. 02-05-ны дараа `#1` хаагдсан (`closedBy #3`, `closed_by_amount` +600.00, `closedAtDate` 2027-02-05). Харилцагчийн үлдэгдэл 0 = 1200 (I-04).

**GS-AR-002 — Unapply (LIFO)** · R1 · `extends: GS-AR-001` · [06 P6](./06-sales-receivables.md) · FR-PTY-011 AC1, INV-28, INV-30
- **Зорилго.** Unapply зөвхөн сүүлийн амьд тулгалтаас (LIFO), толин тусгал detailed мөр, MNT-д G/L мөргүй.
- **Алхам.** 2027-02-06: `#2`-ийн (эхний) тулгалтыг буцаах. Дараа нь `#3`-ийнхийг. Дараа нь `#2`-ийнхийг дахин.
- **Хүлээгдэх.** Эхнийх → 409 `party.unapply_not_latest`. Хоёр дахь: шинэ detailed `#1` APPLICATION +600 ба `#3` APPLICATION −600, `transaction_no` NULL, шинэ `application_no`. Эх APPLICATION мөр `unapplied = true`, `unapplied_by_entry_no` бөглөгдсөн. `#1` үлдэгдэл 600 нээлттэй, `#3` −600 нээлттэй, `closed_by_*` NULL. G/L-д шинэ мөр **0**. Гурав дахь (одоо `#2` сүүлийн амьд тулгалт) OK: `#1` үлдэгдэл 1 100, `#2` −500 нээлттэй.

**GS-AR-003 — Урьдчилгаа төлбөр, дараа нь нэхэмжлэх** · R1 · [06 P7](./06-sales-receivables.md) · FR-PTY-012 AC1, D-F4
- **Зорилго.** Нэхэмжлэхгүй орсон төлбөр нээлттэй кредит entry болж үлдэнэ. Дараагийн нэхэмжлэх толгойн `appliesTo`-оор posting-ийн үед тулгагдана (D-F4).
- **Алхам.** 2027-03-01: `C-B2B`-ээс `BANK01`-д 2 000 000.00 орлого, `appliesTo`-гүй. 03-05: нэхэмжлэх, `SRV-CONS` 1 × 1 363 636.36, толгойд `appliesTo` = PAYMENT `BR-2027-00001`.
- **Хүлээгдэх.** Орлого `BR-2027-00001`: Дт 1110 2 000 000.00; Кт 1200 2 000 000.00. Entry −2 000 000.00 нээлттэй. НӨАТ round(136 363.636) = 136 363.64. `SI-2027-00001`: Дт 1200 1 500 000.00; Кт 5110 1 363 636.36; Кт 2300 136 363.64. Detailed (нэхэмжлэхийн гүйлгээнд): нэхэмжлэх INITIAL +1 500 000; төлбөр APPLICATION +1 500 000; нэхэмжлэх APPLICATION −1 500 000. Нэхэмжлэх хаагдсан, урьдчилгааны үлдэгдэл −500 000.00 нээлттэй.

**GS-AR-004 — Олон нэхэмжлэхэд хуваарилах (G/L-гүй)** · R1 · [06 P8](./06-sales-receivables.md) · FR-PTY-010 AC1, FR-PTY-013
- **Зорилго.** Нэг төлбөрийг төлөх огнооны дарааллаар олон нэхэмжлэхэд хуваарилна. Тулгалтын огноо = оролцогч entry-ийн хамгийн хожуу огноо. G/L бичилтгүй.
- **Алхам.** 2027-01-02: `C-B2B`, `SRV-NOVAT` 300.00 (төлөх 01-31). 01-29: `SRV-NOVAT` 500.00 (төлөх 02-28). 02-03: `BANK01`-д 600.00 орлого, тулгалтгүй. 02-10: `ledgerEntry.apply` (тулгах entry = төлбөр, `allocation: DUE_DATE`).
- **Хүлээгдэх.** Тулгалтын огноо 2027-02-03, `transaction_no` NULL, source `SALESAPPL`, нэг `application_no`. Detailed 4: 300-ийн нэхэмжлэх −300, төлбөр +300, 500-ийн нэхэмжлэх −300, төлбөр +300. 300-ийн нэхэмжлэх хаагдсан, 500-ийнх үлдэгдэл 200 нээлттэй, төлбөр хаагдсан (`closed_by` = 500-ийн нэхэмжлэх). Тулгалтын алхамд G/L мөр 0. `audit.posting_log` `APPLICATION` (register-гүй).

**GS-AR-005 — Насжилт, огноо D = 2027-04-30** · R1 · [06 P11](./06-sales-receivables.md) · FR-RPT-004 AC1/AC2, D-F7
- **Зорилго.** Насжилтын бүлгийн хил (0, 30, 31 хоног, "хугацаа болоогүй"), огноогоор үлдэгдэл, D-ээс хойших хөдөлгөөнийг оруулахгүй байх, урьдчилгааны багана.
- **Алхам.** `C-B2B`, `SRV-NOVAT`, төлөх огноог `dueDate`-ээр заана. Нэхэмжлэх: 01-05 5 500 (төлөх 01-20); 02-28 2 200 (03-30); 03-01 1 100 (03-31); 03-31 3 300 (04-30); 04-01 4 400 (05-01). 04-10: 500 орлого, 02-28-ны нэхэмжлэхэд тулгах. 04-20: 1 000 орлого, тулгалтгүй. 05-02: нэхэмжлэх 2 000 (06-01). 05-10: 5 500 орлого, 01-05-ны нэхэмжлэхэд тулгах. `report.run` харилцагчийн насжилт, D = 2027-04-30, бүлгийн set `DUE`.
- **Хүлээгдэх.** Хугацаа болоогүй 4 400.00; 0–30 = 4 400.00 (1 100 + 3 300); 31–60 = 1 700.00; 61–90 = 0.00; 90-ээс дээш 5 500.00 (05-10-ны төлбөр D-ээс хойш); урьдчилгаа / кредит −1 000.00; нийт 15 000.00. 05-02-ны нэхэмжлэх орохгүй. Нийт = Σ detailed (`posting_date ≤ D`).

**GS-AR-006 — Дансны хуулга 2027-04** · R1 · `extends: GS-AR-005` · [06 P12](./06-sales-receivables.md) · FR-RPT-003 AC1
- **Зорилго.** Харилцагчийн дансны хуулга: эхний үлдэгдэл, хөдөлгөөн, эцсийн үлдэгдэл = насжилтын нийт. Тулгалтын мөр хуулгад гарахгүй.
- **Алхам.** `report.run` харилцагчийн хуулга, 2027-04-01..2027-04-30.
- **Хүлээгдэх.** Эхний үлдэгдэл 12 100.00. 04-01 нэхэмжлэх Дт 4 400.00 → 16 500.00. 04-10 төлбөр Кт 500.00 → 16 000.00. 04-20 төлбөр Кт 1 000.00 → 15 000.00. Эцсийн үлдэгдэл 15 000.00 (Дт 4 400.00, Кт 1 500.00) = GS-AR-005-ийн нийт. 04-10-ны APPLICATION мөр (−500 / +500) хуулгад гарахгүй.

**GS-AR-007 — Apply to Oldest** · R1 · AT-AR-13 · FR-PTY-010, BR-AR-37
- **Зорилго.** `APPLY_TO_OLDEST` харилцагчийн `appliesTo`-гүй төлбөр posting-ийн үед хамгийн хуучнаас эхлэн автоматаар тулгагдана.
- **Алхам.** Override `C-B2B` `applicationMethod: APPLY_TO_OLDEST`. GS-AR-004-ийн хоёр нэхэмжлэх. 2027-02-03: 600.00 орлого, `appliesTo`-гүй.
- **Хүлээгдэх.** GS-AR-004-тэй ижил үр дүн (300 хаагдсан, 500-ийн үлдэгдэл 200, төлбөр хаагдсан). Ялгаа: APPLICATION мөрийн `transaction_no` = төлбөрийн ваучер, огноо 02-03.

**GS-AR-008 — Тулгалтын огноо ба хаалттай үе** · R1 · FR-PTY-013 AC1, INV-06, INV-28
- **Зорилго.** Тулгалтын огноо = оролцогч entry-үүдийн хамгийн хожуу огноо. Тэр нь хаалттай үед бол хориглоно.
- **Алхам.** 01-10: нэхэмжлэх 1 100. 02-10: 1 100 орлого, тулгалтгүй. 03-02 `acc`: 1, 2-р сарыг хаах. 03-05: тулгах. 03-06 `owner`: 2-р сарыг шалтгаантай нээх. 03-06: дахин тулгах.
- **Хүлээгдэх.** Тулгалтын огноо = max(01-10, 02-10) = 02-10 → хаалттай → 422 `gl.period_closed`. Нээсний дараа тулгалт OK, detailed мөрийн `posting_date` 2026-02-10.

**GS-AR-009 — Хэтрүүлж тулгах хориг** · R1 · INV-26
- **Зорилго.** Үлдэгдлээс их дүнгээр тулгахыг хориглоно. Үлдэгдэл эх дүнгийн тэмдгийг хадгална (INV-26).
- **Алхам.** 03-02: нэхэмжлэх 1 100. 03-05: 1 500 орлого, тулгалтгүй. 03-06: `amountToApply` 1 500-аар тулгах. 03-06: анхдагчаар тулгах.
- **Хүлээгдэх.** 1 500 → 422 `party.application_exceeds_remaining`. Анхдагч: нэхэмжлэх хаагдсан, төлбөрийн үлдэгдэл −400 нээлттэй.

### 12.8 Касс ба банк (CASH)

**GS-CASH-001 — Кассын орлого (МХ-1) нэхэмжлэхтэй тулгах** · R1 · FR-BNK-002 AC1
- **Зорилго.** Кассын орлогын баримт (МХ-1) кассын цувралаас завсаргүй дугаар авч, нэхэмжлэхтэй тулгагдана.
- **Алхам.** 03-02: `C-B2B`, `SRV-CONS` 800 (+80) зээлээр. 03-03 `clerk`: `CASH01`-д 880 орлого, `appliesTo` нэхэмжлэх, тушаагч "Болд Трейд ХХК".
- **Хүлээгдэх.** `KO-2026-00001`: Дт 1100 880; Кт 1200 880. `bank.posted_cash_voucher` RECEIPT 880. Нэхэмжлэх хаагдсан. МХ-1 PDF гарна (агуулгыг SNAP-03 шалгана).

**GS-CASH-002 — Кассын зарлага (МХ-2), сөрөг хориг** · R1 · FR-BNK-003 AC1/AC2, D-G1
- **Зорилго.** Кассын зарлагын баримтын хориг (сөрөг үлдэгдэл, хүлээн авагчийн бичиг баримт) ба зөв бичилт.
- **Алхам.** Эхний үлдэгдэл `CASH01` 300 000. 03-05: МХ-2 400 000 (7213). 03-05: МХ-2 250 000, хүлээн авагчийн бичиг баримтын дугааргүй. 03-05: МХ-2 250 000, бичиг баримттай, НӨАТ-гүй.
- **Хүлээгдэх.** 400 000 → 422 `bank.cash_negative_balance`. Бичиг баримтгүй → 422 (кодыг [09-bank-cash-fx](./09-bank-cash-fx.md) тодорхойлно, §22 Q13). Зөв: `KZ-2026-00001`: Дт 7213 250 000; Кт 1100 250 000. Кассын үлдэгдэл 50 000.

**GS-CASH-003 — Банкнаас касс руу шилжүүлэг** · R1 · FR-BNK-007 AC1
- **Зорилго.** Мөнгөний данс хоорондын шилжүүлэг нэг гүйлгээ, хоёр мөнгөний дансны entry, кассын баримттай.
- **Алхам.** Эхний үлдэгдэл `BANK01` 10 000 000. 03-10: `BANK01` → `CASH01` 1 000 000.
- **Хүлээгдэх.** Нэг гүйлгээ: Дт 1100 1 000 000; Кт 1110 1 000 000. Bank ledger `BANK01` −1 000 000, `CASH01` +1 000 000. `KO-2026-00001`. МГТ-д `CASH_TRANSFER` (тайланд орохгүй, GS-RPT-004).

**GS-CASH-004 — Кассын тооллого** · R1 · FR-BNK-004 AC1
- **Зорилго.** Кассын тооллогын дутагдал ба илүүдлийг тохиргооны дансанд бичих (D-G1).
- **Алхам.** Эхний үлдэгдэл `CASH01` 1 250 000. 03-31: тоолсон 1 240 000. 04-30: тоолсон 1 245 000.
- **Хүлээгдэх.** 03-31: Дт 8440 10 000; Кт 1100 10 000 (source `CASHCOUNT`, шалтгаан `CASH_DIFF`). 04-30: Дт 1100 5 000; Кт 8240 5 000. Кассын үлдэгдэл 1 245 000 = тоолсон.

**GS-CASH-005 — Хуулийн баримтын огнооны дараалал** · R1 · D-C7, INV-08
- **Зорилго.** Хуулийн цуврал (`date_order = true`) хоцорсон огноотой баримтыг хүлээн авахгүй. Хоцорсон огноогоор кассыг сөрөг болгох тохиолдлыг DB түвшинд DBT-CASH-01 шалгана.
- **Алхам.** 03-01: `BANK01` → `CASH01` 100 000 (`KO-2026-00001`). 03-10: МХ-2 80 000 (`KZ-2026-00001`). 03-12: огноо 03-05-тай МХ-2 **10 000** (кассын running үлдэгдэл 03-05-нд 90 000, 03-10-нд 10 000 — сөрөг болохгүй тул алдааны олонлогт зөвхөн дугаарын дараалал орно; TST-GS-09).
- **Хүлээгдэх.** 03-05-ны МХ-2 → 422, кодын олонлог яг {`platform.number_series_date_order`} (`ERN02`), `noRowsWritten`. `KZ` сүүлийн дугаар `KZ-2026-00001` хэвээр. (Хоцорсон огноо кассыг сөрөг болгох тохиолдол — хоёр код зэрэг гарах эсэх — DBT-CASH-01 ба INT-ERR-д.)

**GS-CASH-006 — Хэтэвч (QPay) ба шимтгэл** · R1 · FR-BNK-017 AC1
- **Зорилго.** QPay-ийн орлого WALLET дансаар орж, банк руу шилжүүлэхэд шимтгэл тусдаа бичигдэнэ.
- **Алхам.** 03-02 `clerk`: `C-B2C`, төлбөрийн хэлбэр `QPAY`, `GD-BREAD` НӨАТ-тэй 110 000. 03-05: `QPAY` → `BANK01` 108 900, шимтгэл 1 100 (8300).
- **Хүлээгдэх.** T1: Дт 1200 110 000; Кт 5100 100 000; Кт 2300 10 000. T2: Дт 1120 110 000; Кт 1200 110 000 (кассын баримт үүсэхгүй). eBarimt `payments` = [`BANK_TRANSFER_QPAY`, 110 000]. Шилжүүлэг: Дт 1110 108 900; Дт 8300 1 100; Кт 1120 110 000.

**GS-CASH-007 — Мөнгөний бичилтийг буцаах ба хориг** · R1 · `extends: GS-REC-001` · FR-BNK-015 AC1, FR-GL-013
- **Зорилго.** Мөнгөний бичилтийг зөвхөн тулгагдаагүй (авлага/өглөг ба хуулгаар) үед буцаана.
- **Алхам.** 04-03: журнал 8300 Дт 5 000 / `BANK01` Кт (`GJ-2026-00001`). 04-04: түүнийг буцаах. 04-04: `BP-2026-00002`-ийн (нийлүүлэгчид тулгагдсан, хуулгаар тулгагдаагүй) гүйлгээг буцаах. 04-04: `KO-2026-00001`-ийн (банкнаас касс руу шилжүүлэг, хуулга №6-аар тулгагдсан) гүйлгээг буцаах.
- **Хүлээгдэх.** Эхнийх: буцаалт OK, огноо 04-03: Дт 1110 5 000 / Кт 8300 5 000, bank ledger +5 000. Нийлүүлэгчид тулгагдсан → 409 `gl.reversal_entries_applied` (эхлээд unapply). Хуулгаар тулгагдсан → 409 `bank.entry_reconciled` (эхлээд хуулгын тулгалтыг буцаана).

### 12.9 Банкны хуулгын тулгалт (REC)

**GS-REC-001 — Хуулга импорт, автомат тулгалт, батлах** · R1 · FR-BNK-008 AC1, FR-BNK-011 AC1, FR-BNK-012 AC1, FR-BNK-013 AC1
- **Зорилго.** Хуулгын бүтэн мөчлөг: импорт, эхний/эцсийн үлдэгдлийн шалгалт, автомат тулгалт (харилцагч, ledger entry, текстийн дүрэм), батлах, үлдэгдэл.
- **Алхам.**
  1. 01-01: эхний үлдэгдэл `BANK01` 10 000 000 / 3100. Хуулга №5 (нэг мөр +10 000 000) импорт → автомат тулгалт → батлах. `balance_last_statement` = 10 000 000.
  2. 03-02: `C-B2B`, `SRV-CONS` 1 000 000 (+100 000) → `SI-2026-00001` (1 100 000).
  3. 03-03: `V-DOM`-оос 7213 НӨАТ-тэй 550 000 (`PI-2026-00001`) ба 7213 НӨАТ-тэй 400 000 (`PI-2026-00002`).
  4. 03-07: `PI-2026-00001`-д 550 000 төлөх (`BP-2026-00001`). 03-10: `BANK01` → `CASH01` 300 000 (`KO-2026-00001`). 03-31: `PI-2026-00002`-д 400 000 (`BP-2026-00002`).
  5. 03-31: хуулга №6 (CSV fixture), эхний 10 000 000: L1 03-05 +1 100 000 "${inv} төлбөр Болд Трейд", харьцагчийн данс `5000000099`; L2 03-08 −550 000 "Оффис хангамж"; L3 03-10 −300 000 "Бэлэн мөнгө авсан"; L4 03-31 −2 500 "ГҮЙЛГЭЭНИЙ ШИМТГЭЛ"; эцсийн 10 247 500.
  6. `bankReconciliation.autoMatch`, дараа нь `bankReconciliation.post`.
- **Хүлээгдэх.** Импорт: "эхний + Σ мөр = эцсийн" шалгалт ✓ (10 000 000 + 247 500). Тулгалт: L1 → `C-B2B`-ийн `SI-2026-00001` (`HIGH`; харьцагчийн данс + баримтын дугаар + дүн); L2 → `BP-2026-00001`-ийн bank ledger entry (дүн яг, огноо 1 хоног); L3 → шилжүүлгийн entry; L4 → текстийн дүрэм 8300 (`HIGH_TEXT_TO_ACCOUNT`). Батлахад шинэ гүйлгээ: (03-05) Дт 1110 1 100 000; Кт 1200 1 100 000 (`BR-2026-00001`, нэхэмжлэх хаагдсан); (03-31) Дт 8300 2 500; Кт 1110 2 500 (НӨАТ-гүй). L1–L4-ийн bank ledger entry `statement_status = CLOSED`, `statement_no = 6`, `open = false`; `BP-2026-00002` (−400 000) OPEN хэвээр. `balance_last_statement` = 10 247 500. 1110-ийн G/L 03-31-нд 9 847 500.

**GS-REC-002 — Давхар импорт** · R1 · `extends: GS-REC-001` · FR-BNK-010 AC1
- **Зорилго.** Ижил файлыг дахин импортлохгүй, давхацсан мөрийг алгасна.
- **Алхам.** 04-01: хуулга №6-ийн **ижил файлыг** дахин импортлох. 04-06: хуулга №7-ийн файл: L4-ийг (ижил банкны гүйлгээний id) давтсан 1 мөр + шинэ 2 мөр (04-02 +200 000 "${inv2}", 04-05 −1 500 "ШИМТГЭЛ").
- **Хүлээгдэх.** Ижил файл → 409 `bank.statement_already_imported` (`ux_bank_statement__file`, файлын SHA-256), `noRowsWritten`. Хуулга №7: шинэ мөр 2, алгассан 1 (`bodyContains: {"$.importedLines": 2, "$.skippedLines": 1}`; `ux_bank_statement_line__dedupe`). Ledger өөрчлөгдөхгүй (импорт posting хийхгүй).

**GS-REC-003 — Тэнцэхгүй хуулга ба хоёрдмол тулгалт** · R1 · FR-BNK-011 AC2, FR-BNK-013 AC2
- **Зорилго.** Хоёрдмол дүнг автоматаар тулгахгүй; тэнцэхгүй хуулгыг батлахгүй.
- **Алхам.** Override: харилцагч `C-B2B2` нэмэх. 03-02: `C-B2B` ба `C-B2B2` тус бүрд 1 100 000-ийн нэхэмжлэх. 03-31: хуулга, нэг мөр +1 100 000, текст ба харьцагчийн дансгүй; эцсийн үлдэгдэл нь эхний + 1 100 000-аас 52 500-аар зөрүүтэй. Автомат тулгалт, батлах.
- **Хүлээгдэх.** Автомат тулгалт хийгдэхгүй (хоёр нэр дэвшигч; `match_confidence` < MEDIUM), санал жагсаалтад хоёулаа. Батлах → 422 `bank.reconciliation_balance_mismatch`.

**GS-REC-004 — Тулгалтын тайлан ба буцаах** · R1 · `extends: GS-REC-001` · FR-BNK-016 AC1, FR-BNK-014 AC1
- **Зорилго.** Банкны тулгалтын тайлангийн тэнцэл ба хуулгын тулгалтыг буцаах.
- **Алхам.** 03-31-ний банкны тулгалтын тайлан. 04-02: хуулга №6-ийн тулгалтыг буцаах (`bankAccountStatement.undo`).
- **Хүлээгдэх.** Тайлан: G/L 9 847 500; тулгагдаагүй entry −400 000; тулгагдаагүй хуулгын мөр 0; хуулга 10 247 500; `9 847 500 − (−400 000) + 0 − 10 247 500 = 0`. Буцаасны дараа L1–L4-ийн entry `OPEN`, `balance_last_statement` = 10 000 000. 03-05 ба 03-31-ний гүйлгээ хэвээр (тусад нь буцаана).

### 12.10 Валют (FX, R2)

Нэмэлт setup: валют USD, `C-EXP.currency = USD`, `GOL-USD` данс. Ханш (1 USD = X ₮): 2026-01-15 3 400; 01-31 3 450; 02-10 3 420; 04-01 3 400; 04-30 3 450; 08-14 3 450.50. eBarimt унтраасан (R1-д зөвхөн MNT, `ebarimt.currency_not_supported`).

**GS-FX-001 — Валютын нэхэмжлэх, хуримтлагдсан хөрвүүлэлт** · FR-FX-004 AC1
- **Зорилго.** Валютын мөрийг хуримтлагдсан нийлбэрийн аргаар MNT болгож, Σ мөр = нийт яг тэнцэнэ (ADR-0006).
- **Алхам.** 08-14: `C-EXP`, 2 мөр `SRV-CONS` тус бүр 1 × 10.01 USD.
- **Хүлээгдэх.** Мөрийн LCY 34 539.51 ба 34 539.50 (нийт 69 079.01). Дт 1201 69 079.01; Кт 5120 69 079.01. VAT entry VAT0 суурь −69 079.01 / 0. Entry: валют USD, дүн 20.02, LCY 69 079.01.

**GS-FX-002 — Ханш хайх** · FR-FX-002 AC1/AC2
- **Зорилго.** Ханш = `starting_date ≤ D`-ийн хамгийн сүүлийнх; ханш байхгүй бол алдаа, 1 хэзээ ч биш.
- **Алхам.** 2026-08-15 (Бямба): `C-EXP`-д 100 USD. EUR-ийн ханшгүй үед EUR-ийн нэхэмжлэх.
- **Хүлээгдэх.** 08-14-ний 3 450.50 → 345 050.00. EUR → 422 `fx.exchange_rate_not_found` (ханш 1-ээр хэзээ ч орлохгүй).

**GS-FX-003 — Сарын эцсийн хэрэгжээгүй ханшийн зөрүү** · FR-FX-008 AC1
- **Зорилго.** Нээлттэй валютын авлагыг сарын эцэст дахин үнэлж, хэрэгжээгүй зөрүүг тусдаа дансанд бичнэ.
- **Алхам.** 01-15: `C-EXP`-д 1 100 USD. 01-31: `fx.revalue` (харилцагч).
- **Хүлээгдэх.** Нэхэмжлэх: Дт 1201 3 740 000; Кт 5120 3 740 000. Дахин үнэлгээ: Дт 1201 55 000; Кт 8510 55 000; detailed UNREALIZED_GAIN LCY +55 000; `fx.exch_rate_adjmt_register` 1 мөр; `adjusted_currency_factor` шинэчлэгдсэн.

**GS-FX-004 — Төлбөр ба хэрэгжсэн ханшийн зөрүү** · `extends: GS-FX-003` · FR-FX-007 AC1
- **Зорилго.** Тулгалтад хэрэгжээгүй зөрүүг буцааж, хэрэгжсэн зөрүүг анхны ханштай харьцуулж тооцно.
- **Алхам.** 02-10: `GOL-USD`-д 1 100 USD орлого, нэхэмжлэхэд тулгах.
- **Хүлээгдэх.** Дт 1115 3 762 000; Дт 8510 55 000 (хэрэгжээгүйг буцаах); Кт 1201 3 795 000; Кт 8500 22 000. Detailed: UNREALIZED_GAIN −55 000 (нэхэмжлэх), REALIZED_GAIN +22 000 (төлбөр), APPLICATION ±1 100 USD / ±3 740 000. Хоёр entry FCY ба LCY үлдэгдэл 0. P&L нийт +22 000 = 1 100 × (3 420 − 3 400).

**GS-FX-005 — Валютын мөнгөний дансны дахин үнэлгээ** · FR-FX-009 AC1
- **Зорилго.** Валютын мөнгөний дансыг дахин үнэлэх: валютын дүн 0, зөвхөн MNT дүн.
- **Алхам.** 04-01: `C-EXP`-ээс урьдчилгаа 5 000 USD `GOL-USD`-д (17 000 000). 04-30: `fx.revalue`, хүрээ = зөвхөн мөнгөний данс.
- **Хүлээгдэх.** Дт 1115 250 000; Кт 8500 250 000 (анхдагч данс ⚠ нягтлан зөвлөх, FR-FX-009). Bank ledger: дүн 0.00, LCY +250 000, `open = false`, `statement_status = CLOSED`. Харилцагчийн entry энэ run-д дахин үнэлэгдэхгүй.

**GS-FX-006 — Валютын хориг** · `extends: GS-FX-003` · FR-FX-006 AC1, FR-FX-010 AC1
- **Зорилго.** Валют хоорондын тулгалт ба сүүлийн дахин үнэлгээнээс өмнөх огноотой валютын posting-ийг хориглох.
- **Алхам.** 02-01: `C-EXP`-ээс MNT 100 000 орлого, USD нэхэмжлэхэд тулгах. 02-02: огноо 01-25-тай USD нэхэмжлэх.
- **Хүлээгдэх.** → 422 `party.application_currency_mismatch`. 01-25 → 422 (кодыг [09-bank-cash-fx](./09-bank-cash-fx.md) тодорхойлно; санал `fx.posting_before_last_revaluation`, §22 Q13).

### 12.11 Хаалт (CLOSE)

Жилийн хаалтын бичилтийг GS-GL-008…010 ([05 E-H…E-J](./05-posting-engine.md)) шалгана. Энэ хэсэг нь үеийн төлөв, хаалтын урьдчилсан нөхцөл ба хаалтын дараах тайланг шалгана.

**GS-CLOSE-001 — Сарын хаалт, дахин нээх, түгжих** · R1 · FR-GL-024 AC1–AC3, D-D3, AT-SEC-041…043
- **Зорилго.** Үеийн төлөвийн машин (OPEN ↔ CLOSED → LOCKED), дахин нээх эрх ба шалтгаан, аудит (D-D3).
- **Алхам.** 04-02 `acc`: 3-р сарыг хаах. 04-02: 03-15-ны журнал. 04-03 `acc`: дахин нээх. 04-03 `owner`: шалтгаан "Банкны хуулга дутуу тулгагдсан байсан"-аар нээх. 04-04 `owner`: хаах, дараа нь түгжих (`LOCKED`). 04-05 `owner`: нээх.
- **Хүлээгдэх.** Хаалтын дараа posting → 422 `gl.period_closed`. `acc` нээх → 403. `owner` → `OPEN`, `accounting_period_status_log` (`CLOSED → OPEN`, шалтгаан), аудит `PERIOD_REOPEN`. Түгжсэн үеийг нээх → 409 `gl.period_locked`, аудит `PERIOD_LOCK`.

**GS-CLOSE-002 — Жилийн хаалтын дараах тайлан** · R1 · `extends: GS-GL-008` · FR-RPT-001 AC2, FR-RPT-008, FR-RPT-009 AC1, D-D4
- **Зорилго.** Жил хаагдсаны дараа гүйлгээ баланс хаалтын бичилттэй ба хаалтын бичилтгүй горимоор зөв гарна. СБТ, ОДТ хоёр горимд ижил ашиг харуулна.
- **Алхам.** 2027-01-11: гүйлгээ баланс 2026-01-01..2026-12-31 (`includeClosing: true`, дараа нь `false`). 2026-12-31-ний СБТ. 2026 оны ОДТ.
- **Хүлээгдэх.** Хаалтын бичилттэй: орлого, зардлын бүх дансны эцсийн үлдэгдэл 0; 1110 Дт 2 350 000; 2330 Кт 235 000; 3500 Кт 2 115 000. Хаалтын бичилтгүй: 5100 Кт 10 000 000; 5110 Кт 2 000 000; 6100 Дт 6 000 000; 7201 Дт 2 400 000; 7210 Дт 1 200 000; 8110 Кт 50 000; 8300 Дт 100 000; 9100 Дт 235 000; 3500 0. Хоёр горимд эцсийн нийт Дт = Кт. СБТ: 1.1.1 = 2 350 000; 2.1.1.3 = 235 000; 2.2.7 = 2 115 000; Хөрөнгө = Өр + Өмч = 2 350 000; `CHK` = 0. ОДТ-ийн цэвэр ашиг 2 115 000.

**GS-CLOSE-003 — Жилийн хаалтын урьдчилсан нөхцөл ба W-04** · R1 · FR-GL-026 AC1, BR-PST-54, BR-PST-58
- **Зорилго.** Бүх сар хаагдаагүй бол жилийн хаалтыг хориглоно. Дараагийн санхүүгийн жил байхгүй бол хаалт амжилттай болох ч шилжүүлгийн ноорог үүсэхгүй, анхааруулга өгнө.
- **Алхам.** Override `fiscalYears: [2026]` (2027 үүсгэхгүй), `periods`: 2026-01…2026-06 ба 2026-08…2026-11 `CLOSED`. 2026-07-31 `acc`: GENERAL журнал 7210 Дт 100 000 / харьцсан `BANK01`. 2027-01-05: 7-р сарыг хаах. 2027-01-06 `acc`: `fiscalYear.close` 2026. 12-р сарыг хаах. `fiscalYear.close` 2026 дахин.
- **Хүлээгдэх.** Эхнийх → 422 `gl.year_close_periods_open` (`periods = ["2026-12"]`), `noRowsWritten`, `CL` дугаар зарцуулаагүй. Хоёр дахь: `CL-2026-00001`: Кт 7210 100 000; Дт 3500 100 000. Хариуны `warnings[]`-д `W-04` (`gl.next_fiscal_year_missing`). Шилжүүлгийн ноорог үүсээгүй.

**GS-CLOSE-004 — Шинэ жилийн гүйлгээ балансын эхний үлдэгдэл** · R1 · `extends: GS-GL-010` · FR-GL-026 AC3, FR-RPT-001 AC1
- **Зорилго.** Шинэ жилийн гүйлгээ балансын эхний үлдэгдэлд өмнөх жилийн хаалтын бичилт орж, орлого, зардлын данс 0-ээс эхэлнэ.
- **Алхам.** 2027-01-14: гүйлгээ баланс 2027-01-01..2027-01-31.
- **Хүлээгдэх.** 3500: эхний Кт 2 015 000, гүйлгээ Дт 2 015 000, эцсийн 0. 3400: эхний 0, гүйлгээ Кт 2 015 000, эцсийн Кт 2 015 000. 1110 эхний Дт 2 250 000. 2330 эхний Кт 235 000. Орлого, зардлын бүх дансны эхний үлдэгдэл 0. Эхний үлдэгдлийн нийт Дт = Кт = 2 250 000. **⚠ Энэ хүлээгдэх утга §20 SCR-T01-ээс хамаарна** (өмнөх жилийн хаалтын бичилтийг эхний үлдэгдэлд оруулах).

**GS-CLOSE-005 — Сарын хаалтын шалгах хуудас** · R1 · FR-GL-025 AC1
- **Зорилго.** Сарын хаалтын өмнөх шалгах хуудас дутуу ажлыг харуулна. Анхааруулгатай хаалтад баталгаажуулалт ба шалтгаан шаардана.
- **Алхам.** 3-р сард: `BANK01`-ийн хуулгын 2 мөр тулгагдаагүй; merchant `99999999901` (timeout)-тэй нэхэмжлэх → eBarimt UNKNOWN. 04-02: шалгах хуудас нээх. Анхааруулгатайгаар хаах (баталгаажуулалт, шалтгаан).
- **Хүлээгдэх.** `PERIOD_CLOSE_CHECKLIST`: "Тулгагдаагүй хуулгын мөр" = 2, "eBarimt UNKNOWN" = 1, улаан, холбоостой. Чеклист `GET /accounting-periods/{id}/close-checklist` ([14](./14-api.md), [15 S-GL-10](./15-ui-ux.md)): мөр бүр `status` ∈ `OK`/`WARNING`/`BLOCKING`. `WARNING`-тэй үед баталгаажуулалтгүй хаах → 422 (кодыг үе/хаалтын spec тодорхойлно, §22 Q13). Баталгаажуулсан → `CLOSED`, `accounting_period_status_log`-д хэрэглэгч ба шалтгаан.

### 12.12 Тайлан (RPT)

**GS-RPT-001 — Гүйлгээ баланс** · R1 · FR-RPT-001 AC1, FR-RPT-002 AC1, PBT-06
- **Зорилго.** Жилийн жишээ өгөгдөл дээр гүйлгээ баланс ба ерөнхий дэвтрийн дүн, тэнцэл.
- **Алхам.** 2026 онд 8 ваучер: V1 01-02 `BANK01`-д 3100-аас 10 000 000 (`BR`); V2 03-15 `V-DOM`-оос G/L 1400 цэвэр 4 000 000 + 400 000 (`PI`); V3 06-20 `C-B2B`-д `GD-BREAD` цэвэр 8 000 000 + 800 000 (`SI`); V4 06-20 журнал 6100 Дт 3 000 000 / 1400 Кт; V5 09-30 банкны төлбөр, G/L 7210 Purchase VAT10 НӨАТ-тэй 1 100 000 (`BP`); V6 12-31 журнал 7201 Дт 1 500 000 / 2200 Кт; V7 12-31 `BANK01`-д 8110-аас 200 000 (`BR`); V8 12-31 журнал 9100 Дт 270 000 / 2330 Кт.
- **Хүлээгдэх.** Гүйлгээ баланс 2026-01-01..12-31 (хаалтгүй), гүйлгээний нийт Дт = Кт = 29 270 000.00, эцсийн нийт Дт = Кт = 25 170 000.00. Эцсийн мөр: 1110 Дт 9 100 000; 1200 Дт 8 800 000; 1300 Дт 500 000; 1400 Дт 1 000 000; 2100 Кт 4 400 000; 2200 Кт 1 500 000; 2300 Кт 800 000; 2330 Кт 270 000; 3100 Кт 10 000 000; 5100 Кт 8 000 000; 6100 Дт 3 000 000; 7201 Дт 1 500 000; 7210 Дт 1 000 000; 8110 Кт 200 000; 9100 Дт 270 000. Ерөнхий дэвтэр 1110: эхний 0 + Дт 10 200 000 − Кт 1 100 000 = 9 100 000 = гүйлгээ балансын мөр.

**GS-RPT-002 — СБТ, ОДТ, ӨӨТ (жил хаагдаагүй)** · R1 · `extends: GS-RPT-001` · FR-RPT-008 AC1/AC2, FR-RPT-009, FR-RPT-010 AC1
- **Зорилго.** Маягт А-гийн СБТ, ОДТ, ӨӨТ-ийг seed-ийн мөрийн харгалзаагаар; жил хаагдаагүй ч Хөрөнгө = Өр + Өмч.
- **Алхам.** 2026-12-31-ний байдлаар СБТ, 2026 оны ОДТ ба ӨӨТ.
- **Хүлээгдэх.** СБТ: 1.1.1 = 9 100 000; 1.1.2 = 8 800 000; 1.1.3 = 500 000; 1.1.6 = 1 000 000; нийт хөрөнгө 19 400 000. 2.1.1.1 = 4 400 000; 2.1.1.2 = 1 500 000; 2.1.1.3 = 1 070 000; 2.2.1 = 10 000 000; 2.2.7 = 2 430 000 (тайлант үеийн ашиг, хаалтгүй); өр + өмч 19 400 000; `CHK` = 0. ОДТ: мөр 1 = 8 000 000; 2 = 3 000 000; 5 = 200 000; 10 = 2 500 000; 19 = 270 000; цэвэр ашиг 2 430 000. ӨӨТ-ийн эцсийн өмч 12 430 000 = СБТ-ийн өмч.

**GS-RPT-003 — Авлага ба өглөгийн насжилт** · R1 · FR-RPT-004 AC1/AC2, FR-RPT-005 AC1, D-F7
- **Зорилго.** Насжилтын бүлгийн хил (0, 30, 31 хоног, "хугацаа болоогүй") ба "огноогоор" үлдэгдэл.
- **Алхам.** `C-B2B`-ийн нэхэмжлэх (НӨАТ-тэй нийт): 02-28 3 300 (төлөх 03-30); 03-01 2 200 (03-31); 03-16 5 500 (04-15); 03-31 1 100 (04-30); 04-01 4 400 (05-01). 05-10: 5 500-ийг төлөх. `V-DOM`-ийн нэхэмжлэх 03-01 2 200 (төлөх 03-31). Насжилт: AR 04-30, AR 05-31, AP 05-15.
- **Хүлээгдэх.** AR 04-30: хугацаа болоогүй 4 400; 0–30 = 2 200 + 5 500 + 1 100 = 8 800 (05-10-нд төлөгдсөн 5 500 бүтнээр харагдана); 31–60 = 3 300; нийт 16 500. AR 05-31: 0–30 = 4 400; 31–60 = 1 100; 61–90 = 3 300 + 2 200 = 5 500; нийт 11 000. AP 05-15: 31–60 бүлэгт 2 200 (эерэгээр).

**GS-RPT-004 — Мөнгөн гүйлгээний тайлан (шууд арга)** · R1 · `extends: GS-RPT-001` · FR-RPT-011 AC1/AC2
- **Зорилго.** Шууд аргын МГТ-ийг харьцсан дансны ангиллаар, олон харьцсан данстай гүйлгээг пропорциональ хувааж гаргах.
- **Алхам.** 12-31: `C-B2B`-ээс `CASH01`-д 1 100 000 (V3-ийн хэсэгчилсэн төлбөр, `KO`). 2026 оны МГТ.
- **Хүлээгдэх.** Үндсэн үйл ажиллагаа: харилцагчаас орсон (`OP_CUST_RECEIPTS`) +1 100 000; үйл ажиллагааны зардал (`OP_OPERATING_EXP`) −1 000 000; татвар (`OP_TAXES_PAID`) −100 000 (V5-ийг харьцсан дансаар пропорциональ хуваасан). Хөрөнгө оруулалт: хүү (`INV_INTEREST_RCVD`) +200 000. Санхүүжилт: хувьцаа (`FIN_SHARES_ISSUED`) +10 000 000. Цэвэр өөрчлөлт 10 200 000 = (1100 + 1110)-ийн өөрчлөлт; `CHK` = 0; ангилаагүй (`X`) = 0.

**GS-RPT-005 — e-balance мянган төгрөг** · R1 · FR-RPT-013 AC1/AC2, D-C2
- **Зорилго.** e-balance-ийн мянган төгрөгийн бөөрөнхийлөлт: мөрийг эхлээд бөөрөнхийлөөд нийлбэрлэж, зөрүүг тусгай мөрөнд (D-C2).
- **Алхам.** 12-31: журнал 1350 Дт 1 449; 1370 Дт 1 449; 3100 Кт 2 898. `EBALANCE_SBT` тайлан.
- **Хүлээгдэх.** 1.1.4 = 1, 1.1.5 = 1 (мянгаар); эргэлтийн хөрөнгийн нийт = 2 (бөөрөнхийлсөн мөрүүдийн нийлбэр); "бөөрөнхийлөлтийн зөрүү" мөр = 1; 2.2.1 = 3; хөрөнгө (зөрүүний мөртэй) 3 = өр + өмч 3.

### 12.13 eBarimt-ийн харгалзуулалт (EBR)

**GS-EBR-001 — B2C бэлэн, VAT_ABLE (жишээ A)** · R1 · FR-EBR-003, FR-EBR-004 AC1, FR-EBR-005, FR-EBR-008 AC1, [12 §22.1](./12-ebarimt-integration.md)
- **Зорилго.** Талбарын харгалзаа (толгой, дэд баримт, item, төлбөр), `billIdSuffix`, SYNC_FIRST хэвлэх хариу ба QR хадгалахгүй байх.
- **Алхам.** 2026-10-06 14:00 `clerk`: `C-B2C` бэлэн, `GD-BREAD` 2 × 2 750, `GD-MILK` 1 × 3 300 (SYNC_FIRST).
- **Хүлээгдэх.** НӨАТ 800 (500 + 300), суурь 8 000. T1: Дт 1200 8 800; Кт 5100 8 000; Кт 2300 800. T2: Дт 1100 8 800; Кт 1200 8 800. eBarimt хүсэлт (SNAP-02-той ижил): `type` `B2C_RECEIPT`, `merchantTin` 37900846788, `districtCode` 2501, `posNo` 001, `billIdSuffix` `001000001`, `consumerNo` "", `receipts` = [VAT_ABLE 8 800 / 800], items (2, 2750.00, 5500.00, 500.00), (1, 3300.00, 3300.00, 300.00), `payments` = [CASH, PAID, 8 800]. Хариу: SUCCESS, ДДТД 33 орон хадгалагдсан; HTTP хариунд `print.qrData` `QR-CANARY-`-ээр эхэлнэ; DB, лог, outbox, `idempotency_key.response_body`-д canary 0 (I-12).

**GS-EBR-002 — VAT_ABLE + VAT_FREE дэд баримт** · R1 · AT-EB-06
- **Зорилго.** `taxType` тус бүрд дэд баримт, `VAT_FREE` item-ийн `taxProductCode` ба `totalVAT = 0`.
- **Алхам.** `C-B2C` бэлэн: `GD-MILK` 2 × 3 300 (VAT10), `GD-BOOK` 1 × 15 000 (EXEMPT).
- **Хүлээгдэх.** G/L (`byAccount`): Дт 1200 21 600; Кт 5100 21 000 (6 000 + 15 000); Кт 2300 600. VAT entry 2. eBarimt `receipts` = [VAT_ABLE 6 600 / 600, VAT_FREE 15 000 / 0]; `GD-BOOK`-ийн item `taxType` VAT_FREE, `totalVAT` 0, `taxProductCode` `TPC0002`; Σ items = Σ receipts = 21 600.

**GS-EBR-003 — Сөрөг (хөнгөлөлтийн) мөр шингээх** · R1 · AT-EB-10, FR-TAX-006
- **Зорилго.** Сөрөг (хөнгөлөлтийн) мөрийг eBarimt-ийн item-д шингээж, НӨАТ-ын нийлбэр яг таарна.
- **Алхам.** `C-B2C` бэлэн, НӨАТ-тэй: `GD-MILK` 1 × 6 000; `GD-BREAD` 1 × 4 000; `GD-MILK` −1 × 1 000 ("Хөнгөлөлт").
- **Хүлээгдэх.** НӨАТ: эерэг бүлэг 909.09, сөрөг бүлэг −90.91, нийт 818.18; суурь 8 181.82. G/L (`byAccount`): Дт 1200 9 000; Кт 5100 8 181.82; Кт 2300 818.18. eBarimt item (сөрөг мөр шингэсэн): (1, 5 400.00, НӨАТ 490.91), (1, 3 600.00, НӨАТ 327.27); Σ = 9 000 / 818.18.

**GS-EBR-004 — `qty × unitPrice` таарахгүй мөрийг хуваах** · R1 · AT-EB-09, VAL-15
- **Зорилго.** `qty × unitPrice` 0.01-д таарахгүй мөрийг хоёр item болгон хуваах (VAL-15).
- **Алхам.** Override бараа `GD-NOTE` "Дэвтэр" (GOODS, VAT10). `C-B2C` бэлэн: 3 × 3 333.333333 (НӨАТ-тэй).
- **Хүлээгдэх.** Мөрийн дүн 10 000.00, НӨАТ 909.09. G/L: Дт 1200 10 000; Кт 5100 9 090.91; Кт 2300 909.09. eBarimt item 2: (2, 3 333.33, 6 666.66, НӨАТ 606.06) ба (1, 3 333.34, 3 333.34, НӨАТ 303.03).

**GS-EBR-005 — Хэсэгчилсэн буцаалтын гинж** · R1 · `extends: GS-SAL-005` · FR-EBR-010 AC1, AT-EB-26, INV-13
- **Зорилго.** Хэсэгчилсэн буцаалтын гинжид `inactiveId` нь үргэлж гинжний сүүлийн ДДТД; нэг амьд баримт.
- **Алхам.** 2027-03-16: `GD-BREAD` 1 × 100.00 (+10.00)-ын хоёр дахь кредит нот, шалтгаан `RETURN`, `appliesTo` = нэхэмжлэх.
- **Хүлээгдэх.** `SC-2027-00002`: Дт 5100 100.00; Дт 2300 10.00; Кт 1200 110.00; нэхэмжлэхийн үлдэгдэл 770.00. eBarimt: C нийт 770 / НӨАТ 70, `inactiveId` = B; гинж A (`CANCELLED`) → B (`CANCELLED`) → C (`SUCCESS`); PosAPI post 3; амьд баримт нэг (INV-13).

**GS-EBR-006 — Timeout → UNKNOWN → гараар шийдэх** · R1 · FR-EBR-007 AC1/AC2, D-J2, AT-EB-16, AT-EB-20, AT-EB-21
- **Зорилго.** Timeout-ийн дараа автоматаар дахин илгээхгүй (D-J2), гараар шийдвэрлэх журам, аудит.
- **Алхам.** Override мерчант ТТД `99999999901`, `posapiMock.receiptTimeoutSeconds: 2`. 03-02: `C-B2B`-ийн нэхэмжлэх. `ebarimt.dispatch`. `clock.advance` 10 мин, `job.run ebarimt.lease_reaper`, `ebarimt.dispatch`. `acc`: "Бүртгэгдээгүй" гэж шийдэх (sendData хийгдээгүй). `acc`: "Бүртгэгдсэн", ДДТД `037900846788202603021000000100001` (33 орон), дүн 1 100.00, тэмдэглэл.
- **Хүлээгдэх.** Posting 201 (ledger commit хэвээр). Баримт `UNKNOWN`, `ebarimt.timeout`, outbox `DEAD`, PosAPI post = 1; 10 минутын дараа ч 1. "Бүртгэгдээгүй" → 409 `ebarimt.resolution_too_early`. "Бүртгэгдсэн" → `SUCCESS`, `resolved_by/at`; `ebarimt_document_event`: PENDING → SENT → UNKNOWN → SUCCESS (тэмдэглэлтэй).

**GS-EBR-007 — Өмнөх сарын засвар (`reportMonth`)** · R1 · FR-EBR-011 AC1/AC2, D-J4, AT-EB-29, AT-EB-30
- **Зорилго.** Өмнөх сарын засвар зөвхөн сарын 1–7-нд `reportMonth`-тэй; НӨАТ-ын огноо тухайн сард байна (D-J4).
- **Алхам.** 2026-09-20: `C-B2B`-ийн нэхэмжлэх 1 100 → SUCCESS. 10-05 09:00: кредит нот 220, `vat_date` 10-05. 10-05 10:00: кредит нот 220, `vat_date` 09-30. 10-08: кредит нот 110, `vat_date` 09-30.
- **Хүлээгдэх.** Эхний кредит нот → 422 `ebarimt.cr_memo_vat_date_outside_report_month` (rollback). Хоёр дахь: `SC-2026-00001`, eBarimt `inactiveId` = эх, `reportMonth` = "2026-09" (форматыг OQ-06/TS-17 баталгаажуулна), SUCCESS. Гурав дахь → 422 `ebarimt.report_month_window_closed`, `SC` дараагийн дугаар зарцуулагдаагүй.

**GS-EBR-008 — НӨАТ төлөгч бус мерчант** · R1 · `BASE-NONVAT` · FR-EBR-015 AC1, VAL-09, AT-EB-34, AT-EB-07
- **Зорилго.** НӨАТ төлөгч бус мерчант зөвхөн `NOT_VAT` (эсвэл `non_vat_payer_tax_type`-ийн) мөр гаргана: VAT10 setup-тэй бараа ч engine-д `NOVAT`/`NOT_VAT` болж хувирна ([08 BR-TAX-55](./08-tax-vat-mn.md), [12 SET-09](./12-ebarimt-integration.md)). VAL-11 (`VAT_ABLE` хориг) нь зөвхөн хамгаалалт бөгөөд UT-EBR-д шалгагдана.
- **Алхам.** `C-B2C` бэлэн `SRV-NOVAT` 50 000. Дараа нь `SRV-CONS` (setup DOMESTIC × VAT10) 10 000. Дараа нь override `vatPostingSetup` (DOMESTIC × VAT10) `ebarimtTaxProductCode: null` болгоод `SRV-CONS` 10 000.
- **Хүлээгдэх.** Эхнийх: Дт 1200 50 000; Кт 5110 50 000; T2 кассын төлбөр; eBarimt item `NOT_VAT`, `totalVAT` 0, `taxProductCode` `TPC0003`. Хоёр дахь: OK, Дт 1200 10 000; Кт 5110 10 000; VAT entry NOVAT, 0 %; eBarimt item `NOT_VAT`, `totalVAT` 0, `taxProductCode` `TPC0003` (setup-ээс, MAP-22 (3)); `VAT_ABLE` мөр 0. Гурав дахь → 422 `ebarimt.tax_product_code_missing` (VAL-09, мөрийн дугаартай), posting rollback, `bill_seq` ба `SI` дугаар зарцуулаагүй (AT-EB-07).

**GS-EBR-009 — eBarimt тохируулаагүй компани** · R1 · FR-EBR-001 AC2, AT-EB-05
- **Зорилго.** eBarimt тохируулаагүй компанид posting саадгүй, баримт үүсэхгүй.
- **Алхам.** Override `ebarimt.enabled = false` (тохиргоо байхгүй). `C-B2C` бэлэн `GD-BREAD` 11 000.
- **Хүлээгдэх.** Posting OK (T1, T2 GS-SAL-001-тэй ижил бүтэц); `ebarimt_document` 0; outbox-д `ebarimt.receipt.send` 0; PosAPI post 0; баримтын eBarimt төлөв "Тохируулаагүй".

### 12.14 Хамрах хүрээний матриц

| Модуль | R1 Must FR (posting-д нөлөөтэй) | Golden-оор хамрагдсан | Golden-гүй (өөр давхаргаар) |
|---|---|---|---|
| GL | FR-GL-006…015, 018, 020…024, 026 | Бүгд (FR-GL-015: GS-GL-007) | FR-GL-012 (DBT-IMM, INT), FR-GL-016 (Should, E2E), FR-GL-025 (GS-CLOSE-005), FR-GL-028 (Should, nightly) |
| TAX | FR-TAX-001…011, 013, 014, 017 | FR-TAX-002…011, 013, 015, 017 | FR-TAX-001 (UT-ACD, INT), FR-TAX-014 (SNAP-06), FR-TAX-016 (Should, INT) |
| PTY | FR-PTY-007…013 | Бүгд | FR-PTY-014 (INT, аудит) |
| SAL | FR-SAL-003…009, 013 | Бүгд | FR-SAL-011 (SNAP-03), FR-SAL-014/015 (INT, E2E) |
| PUR | FR-PUR-001…005 (Must); FR-PUR-006, 007 (Should) | Бүгд (GS-PUR-001…015, GS-AP-001…007) | FR-PUR-009/010 нь R2 (R2-ийн golden), FR-PUR-008 нь R3 |
| BNK | FR-BNK-001…003, 005…008, 010, 011, 013, 015, 016 | Бүгд | FR-BNK-009 (CT-BNK-01/02, жишээ файл хүлээж буй) |
| RPT | FR-RPT-001…005, 008…011, 013 | Бүгд | FR-RPT-012 (INT), FR-RPT-014 (SNAP-04), FR-RPT-017 (INT, SEC-T-17) |
| EBR | FR-EBR-002…011, 015 | Бүгд | FR-EBR-001 (INT), FR-EBR-012/013 (INT, AT-EB-32/33) |

**TST-GS-19.** R1-ийн posting-д нөлөөтэй Must FR бүр ≥ 1 golden scenario-той, эсвэл энэ хүснэгтэд golden-гүй байх шалтгаан ба орлох тест заагдсан байна. CI-ийн traceability тайлан (§17.5) үүнийг шалгана.

---

## 13. E2E тест (Playwright)

### 13.1 Хамрах хүрээ

E2E нь хэрэглэгчийн **урсгал** (navigation, хадгалах, батлах, хэвлэх, алдааны харагдац), хүртээмж ба browser-ийн аюулгүй байдлыг шалгана. Тооцооллын зөв байдлыг golden шалгадаг тул E2E нь цөөн гол дүнг л (нийт, дугаар) шалгана (TST-P-07).

| ID | Урсгал | Persona | Дэлгэц ([15](./15-ui-ux.md)) | Smoke (`main`) | Шалгах гол зүйл |
|---|---|---|---|---|---|
| E2E-01 | Нэвтрэх (MFA), тенант/компани сонгох, гарах | Owner | S-PLT-01…03 | ✔ | Cookie шинж (`__Host-`, `HttpOnly`, `SameSite=Strict`), токен browser-т байхгүй, session timeout-ийн анхааруулга |
| E2E-02 | Компани тохируулах wizard → эхний нэхэмжлэх ≤ 15 мин (NFR-120) | Owner | S-PLT-06 | — | Wizard-ийн алхам, анхдагч тохиргоо, "Эхлэх алхмууд" |
| E2E-03 | Борлуулалтын нэхэмжлэх: ноорог, мөр гараар (зөвхөн гар), preview, батлах | Accountant | S-SAL-02 | ✔ | Grid-ийн товчлол (NFR-071), preview-ийн данс, дугаар `SI-…`, нийлбэр |
| E2E-04 | Бэлэн борлуулалт (POS) → eBarimt хэвлэх цонх (QR, сугалаа) | Sales clerk | S-SAL-09 | ✔ | Хэвлэх цонх нээгдэх; хаасны дараа `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, TanStack Query cache, URL, `history.state`-д `QR-CANARY` 0 (AT-UI-17) |
| E2E-05 | Кредит нот (буцаалт), шалтгааны код заавал | Accountant | S-SAL-* | — | Алдааны жагсаалт (BC "Error Messages"), тулгалт |
| E2E-06 | Кассын орлого/зарлага (МХ-1/МХ-2), PDF | Sales clerk / Accountant | S-BNK-03/04 | ✔ | Сөрөг үлдэгдлийн алдаа монголоор, засах заавартай (NFR-121) |
| E2E-07 | Хуулга импорт (XLSX wizard) → автомат тулгалт → "Батлах ба тулгах" | Accountant | S-BNK-09 | — | Итгэлийн тэмдэг, шалтгаан, зөрүүтэй мөр хуваах |
| E2E-08 | Ерөнхий журнал, буцаалт | Accountant | S-GL-03 | — | Тэнцээгүй ваучерын зөрүүг харуулах |
| E2E-09 | Гүйлгээ баланс → entry хүртэл задлах → Excel экспорт (async) | Accountant | S-RPT-02 | ✔ | Async job, файл татах, тоон нүд |
| E2E-10 | Сарын хаалтын шалгах хуудас, хаах, Owner дахин нээх (step-up) | Accountant / Owner | S-GL-* | — | 403, step-up, шалтгаан |
| E2E-11 | eBarimt UNKNOWN-ийг шийдэх дэлгэц | Accountant (`ebarimt.ops`) | S-EBR-* | — | ДДТД оруулах, аудит |
| E2E-12 | Гэрээт нягтлан: 2 тенант, 3 компани хооронд шилжих | External accountant | S-PLT-03 | — | Тенантын өгөгдөл холилдохгүй (өмнөх компанийн мөр харагдахгүй) |
| E2E-13 | Эрхийн хязгаар: Sales clerk кредит нот батлах, тохиргоо нээх | Sales clerk | — | — | Товч харагдахгүй/идэвхгүй; API 403 |
| E2E-14 | Хүртээмж: үндсэн 8 урсгалд axe (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) | — | §11 | — (nightly) | 0 зөрчил (AT-UI-50, NFR-070) |
| E2E-15 | Pseudo-locale (`xx`) screenshot: текст тасрах, давхцах | — | — | — (nightly) | UX-I18N-16 |
| E2E-16 | HTTP header: CSP, HSTS, `frame-ancestors`, `Cache-Control: no-store` | — | — | ✔ | SEC-T-10 |
| E2E-17 | Tablet (768 px) дээр Sales clerk-ийн урсгал, 320 px reflow | Sales clerk | — | — (nightly) | NFR-072, UX-A11Y-06 |

### 13.2 Дүрэм

- **TST-E2E-01. Өгөгдөл.** Тест бүр өөрийн тенантыг `tools/Erp.DevTools e2e-tenant --name <test-id> --baseline BASE-VAT` командаар (global setup) үүсгэнэ. API-д тестийн тусгай endpoint **нэмэхгүй** (production-д тестийн арын хаалга үлдэх эрсдэл). Тенантыг тест дууссаны дараа устгахгүй (staging-д 7 хоногийн дараа цэвэрлэнэ).
- **TST-E2E-02. Selector.** `getByRole`, `getByLabel`-ийг монгол шошгоор хэрэглэнэ. Шошгыг `web/src/locales/mn/*.json`-оос түлхүүрээр уншина (текстийг тестэд хатуу бичихгүй). `data-testid`-ийг зөвхөн AG Grid-ийн нүд, график зэрэг ARIA-гаар хүрэх боломжгүй газарт хэрэглэнэ.
- **TST-E2E-03. Хүлээлт.** `waitForTimeout` (sleep) хориотой. Playwright-ийн auto-wait ба `expect.poll`-ийг хэрэглэнэ.
- **TST-E2E-04. Browser.** Smoke нь Chromium. Nightly ба RC нь Chromium, Firefox, WebKit (NFR-080).
- **TST-E2E-05. Retry.** CI-д retry 1, retry болох үед trace, video, screenshot-ийг хадгална. Retry-гаар л давсан тестийг flaky гэж тэмдэглэнэ (§17.4).
- **TST-E2E-06. PosAPI.** Staging smoke нь eBarimt **staging** (тест мерчант)-тай ([18 §14](./18-dev-setup.md)), nightly нь mock-той ажиллана.

---

## 14. Гүйцэтгэлийн тест (k6) ба SLO

### 14.1 SLO-той харгалзаа

[02 §13](./02-architecture.md) ба NFR-010…017-ийн зорилт бүр гүйцэтгэлийн тесттэй холбогдоно. Хэмжилт нь **серверийн** хугацаа (OTel histogram, nginx-ээс хариу гарах хүртэл), зөвхөн тогтвортой (steady state) цонхонд. k6-ийн клиентийн хугацаа хоёрдогч шалгуур.

| SLO | Зорилт | Тест | Метрик | Давах шалгуур |
|---|---|---|---|---|
| Нэхэмжлэх ≤ 50 мөр, post/preview (NFR-010) | p95 ≤ 300 ms, p99 ≤ 800 ms | PERF-02, PERF-03 | `erp_posting_duration_seconds{document_type="SALES_INVOICE"}` | Зорилттой ижил |
| Нэхэмжлэх ≤ 500 мөр (NFR-011) | p95 ≤ 2 s | PERF-07 | ижил | ижил |
| Журнал ≤ 20 мөр, касс/банкны ваучер (NFR-012) | p95 ≤ 200 ms | PERF-02 | `…{document_type="JOURNAL"}`, `…{document_type="PAYMENT"}` | ижил |
| Advisory lock хүлээх | p95 ≤ 100 ms; 5 s-д 503 | PERF-06 | `erp_posting_lock_wait_seconds`, `erp_posting_lock_timeouts_total` | p95 ≤ 100 ms; 503-ийн хувь ≤ 0.1% (10 зэрэг) |
| Түгжээ барих (B үе, ≤ 50 мөр) | p95 ≤ 150 ms | PERF-06 | span `posting.locked` | ижил |
| POS: борлуулалт + синхрон eBarimt | p95 ≤ 2.5 s; манай хэсэг ≤ 500 ms | PERF-09 | `http.server.request.duration{http.route=".../:post"}` − stub latency | ижил |
| Жагсаалт 50 мөр / баримт нээх / хайлт (NFR-013) | p95 ≤ 250 / 150 / 400 ms | PERF-02, PERF-03 | `http.server.request.duration` (route-оор) | ижил |
| Гүйлгээ баланс (≤ 200 000 entry), ерөнхий дэвтэр (сар), Маягт А, насжилт/НӨАТ, нэхэмжлэхийн PDF (NFR-014) | 2 s / 1 s / 5 s / 3 s / 500 ms | PERF-07 | route-оор | ижил |
| Async: Excel 100 000 мөр, жилийн архив (NFR-015) | ≤ 60 s, ≤ 10 мин | PERF-08 | `job_run.finished_at − started_at` | ижил |
| Багтаамж (NFR-016) | ≥ 1 500 зэрэг хэрэглэгч, ≥ 50 posting/s тогтвортой, deadlock 0 | PERF-03, PERF-05 | `rate(erp_posting_duration_seconds_count)`, `pg_stat_database.deadlocks` | ≥ 50/s 60 мин, SLO хангагдсан, deadlock 0 |
| Нэг компани | 10 зэрэг posting, deadlock-гүй, завсаргүй, ≈ 10 posting/s | PERF-06 | ижил | ≥ 8 posting/s, deadlock 0, I-07 |
| Outbox (NFR-017) | async event p95 ≤ 5 s, p99 ≤ 30 s; eBarimt async SENT p95 ≤ 5 мин | PERF-09 | `erp_outbox_oldest_pending_age_seconds`, `done_at − created_at` | ижил |
| Login | p95 ≤ 500 ms | PERF-02 | route `/connect/token` | ижил |
| Хүртээмж 99.5% | — | Production-д хэмжинэ; PERF-10 (failover) | — | — |

### 14.2 Орчин

| Зүйл | PERF-01 (smoke) | PERF-02 (v1 baseline) | PERF-03…12 (багтаамж, RC) |
|---|---|---|---|
| Байршил | `staging` | `perf` (Монголын ДТ, ephemeral, Ansible-аар) | `perf` |
| Топологи | staging | [02 §12.4](./02-architecture.md)-ийн "≤ 1 000 тенант" багана: 2 nginx, 2 `erp-api` (4 vCPU, 8 GB), worker тус бүр, PG primary + sync standby (8 vCPU, 32 GB, NVMe) | "5 000 тенант" багана: 4 `erp-api` (8 vCPU, 16 GB), 2 worker VM, PG 16 vCPU / 64 GB, PgBouncer (transaction) |
| Өгөгдөл | Демо + synthetic жижиг | 1 000 тенант (~32 сая `gl_entry`) | 5 000 тенант (~160 сая `gl_entry`) + "том компани" профайл |
| PosAPI | WireMock stub (staging deploy-ийн дотор). eBarimt **staging**-ийг PERF-д хэзээ ч хэрэглэхгүй — СМТТ-ийн туршилтын орчинд ачааллын тест хориотой (ebarimt skill §8, [12 §25](./12-ebarimt-integration.md)); staging PosAPI-г зөвхөн E2E smoke-ийн цөөн функциональ хүсэлтэд (TST-E2E-06) | WireMock stub, хоцролт lognormal (median 400 ms, p95 1.5 s), 0.5% нь timeout | ижил |
| Ачаалал үүсгэгч | 1 k6 | 2 VM (4 vCPU), SUT-ээс тусдаа, ижил ДТ | 4 VM |
| Ажиглалт | staging Grafana | OTel → Prometheus/Tempo; `pg_stat_statements`, `auto_explain` (> 200 ms) | ижил |

- **TST-PERF-01.** Ачаалал үүсгэгч интернэтээр биш, ижил ДТ-ийн сүлжээгээр хандана (латентын хэлбэлзлийг хасна).
- **TST-PERF-02.** `perf` орчин нь production-ий image, тохиргоо, PG параметр, PgBouncer-ийн горимтой яг ижил. Зөрүү бүрийг тайланд бичнэ.

### 14.3 Өгөгдлийн загвар (synthetic dataset)

`tools/Erp.DevTools synth --tenants 5000 --companies-per-tenant 1.1 --months 12 --docs-per-company-month 300 --seed 20261007`:

1. Тенант ба компанийг `platform.fn_provision_company_mn`-ээр provision хийнэ.
2. Баримтыг posting engine-ээр (in-process, HTTP-гүй) батлана. Компани хооронд зэрэгцүүлнэ (≤ 64 урсгал). Нэг компанид цуваа (advisory lock). Ledger-т шууд INSERT хийхгүй (TST-DATA-01).
3. Үүссэн DB-г pgBackRest-ээр snapshot хийж дахин ашиглана (сэргээх ≤ 1 цаг). Зорилтот үүсгэх хурд ≥ 2 000 баримт/s (≈ 20 сая баримт ≈ 3 цаг).

| Параметр | Утга | Эх |
|---|---|---|
| Тенант/компани | 5 000 / 5 500 | [02 §12.4](./02-architecture.md) |
| Баримт / компани / сар | 300 (Zipf: идэвхтэй 5% тенант нийт баримтын 30%) | 02 §12.4 |
| G/L entry / баримт | дунджаар 8 | 02 §12.4 |
| Баримтын холимог | борлуулалтын нэхэмжлэх 55% (B2C 70%, B2B 30%), худалдан авалт 15%, төлбөр/касс 20%, журнал 5%, кредит нот 5% | Таамаг (пилотоор шинэчилнэ) |
| Мөрийн тоо | геометр, дундаж 3, p99 50; "том компани" 500 мөртэй нэхэмжлэх | NFR-011 |
| НӨАТ-ын ангилал | VAT10 85%, EXEMPT 8%, VAT0 4%, NOVAT 3% | Таамаг |
| "Том компани" | Нэг компанид жилд 200 000 `gl_entry` | NFR-014 |
| Огнооны тархалт | Сар бүрийн 1–10-нд 40% (НӨАТ-ын хугацаа) | 02 §12.4 "10-ны ачаалал 5 дахин" |

### 14.4 Ачааллын загвар (workload mix)

| k6 scenario | VU-ийн хувь | Үйлдлийн дараалал (давтана) | Бодох хугацаа |
|---|---|---|---|
| `clerk` | 40% | Харилцагч хайх → B2C бэлэн борлуулалт (3 мөр, SYNC_FIRST) → жагсаалт → баримт нээх | 10–30 s |
| `accountant` | 35% | Худалдан авалт батлах; журнал (5 мөр); төлбөр тулгах; 20 давталт тутамд хуулга импорт + автомат тулгалт; 10 давталт тутамд гүйлгээ баланс, насжилт | 15–60 s |
| `external` | 15% | Компани солих → тайлан (ерөнхий дэвтэр, Маягт А) → async экспорт | 30–90 s |
| `owner_viewer` | 10% | Самбар (cue), баримт нээх, тайлан | 20–60 s |

Ачааллын түвшин: v1 оргил = 300 идэвхтэй хэрэглэгч (~5 posting/s); 10-ны өдөр × 5 (~25 posting/s); багтаамж = 1 500 хэрэглэгч, ≥ 50 posting/s.

### 14.5 Тестийн төрөл

| ID | Нэр | Профайл | Хугацаа | Давах шалгуур | Хэзээ |
|---|---|---|---|---|---|
| PERF-01 | Smoke | 10 VU, бүх scenario | 5 мин | Нэхэмжлэх (≤ 50 мөр) post p95 ≤ 300 ms (staging, [18 §9.2](./18-dev-setup.md) DoD), алдаа < 0.1% | `main` → staging deploy бүр |
| PERF-02 | v1 baseline | 1 000 тенант, 300 VU, ramp 10 мин | 30 мин тогтвортой | §14.1-ийн бүх SLO; CPU (API) < 60%, DB CPU p95 < 60% | Долоо хоногт 2, RC |
| PERF-03 | Багтаамж | 5 000 тенант, 1 500 VU | 60 мин | ≥ 50 posting/s, бүх SLO, deadlock 0 | RC (major/minor) |
| PERF-04 | Stress | 5 мин тутам +10% VU, SLO зөрчигдөх эсвэл алдаа > 1% хүртэл | — | "Өвдөг" (knee)-ийн цэгийг тайлагнана; зөвхөн хүлээгдэх алдаа (`503 api.lock_timeout`, 429); 500 = 0; ачаалал буурснаас 5 мин дотор сэргэнэ; ledger-ийн бүрэн бүтэн байдал (§14.8) | RC (major) |
| PERF-05 | Soak | PERF-03-ийн 70% | 8 цаг | Санах ой өсөлт < 10%, p95 drift < 10%, outbox lag тогтвортой, холболтын pool тогтвортой | RC (major), GA-аас өмнө |
| PERF-06 | Нэг компанийн уралдаан | 10 клиент нэг компанид 50 мөртэй нэхэмжлэх зэрэг; хувилбар 20 клиент | 10 мин | ≥ 8 posting/s; lock wait p95 ≤ 100 ms; lock hold p95 ≤ 150 ms; deadlock 0; I-07; 20 клиентэд 503 нь `Retry-After: 2`-той, ижил түлхүүрээр дахин илгээхэд давхар posting 0 | Nightly (долоо хоногт), RC |
| PERF-07 | Тайлан ба том баримт | "Том компани"; PERF-02-ийн 50% арын ачаалал | 20 давталт тайлан бүрд | NFR-014-ийн босго; 500 мөртэй нэхэмжлэх p95 ≤ 2 s | RC |
| PERF-08 | Async | Excel 100 000 мөр; "том компани"-ийн жилийн архив | — | ≤ 60 s; ≤ 10 мин; тенант бүрд зэрэг 1 ажил | RC |
| PERF-09 | Интеграцийн хоцрогдол | PERF-02 + stub-ийн латентын профайл | 30 мин | Outbox p95 ≤ 5 s, p99 ≤ 30 s; POS e2e p95 ≤ 2.5 s, манай хэсэг ≤ 500 ms; async eBarimt SENT p95 ≤ 5 мин; stub-ийн дуудлага = баримтын тоо (давхар 0) | RC |
| PERF-10 | Failover ачааллын үед | PERF-02 үед standby-г promote (runbook) | — | RTO ≤ 30 мин; 201 хариу авсан posting бүр failover-ийн дараа байна (RPO 0); клиент ижил түлхүүрээр дахин илгээхэд давхар 0 | Хагас жил (DR дасгалтай хамт) |
| PERF-11 | "Noisy neighbor" | Нэг тенант 10 экспорт + 20 req/s жагсаалт; бусад PERF-02 | 30 мин | Бусад тенантын p95-ийн өөрчлөлт ≤ 10%; шуугиантай тенантад 429 (NFR-036) | RC (major) |
| PERF-12 | Сарын 10-ны оргил | 300 → 1 500 VU 5 минутад | 30 мин | SLO хангагдана, эсвэл зөвхөн 503/429-өөр зохицуулалттай доройтно; 500 = 0 | RC (major) |

### 14.6 Хэмжилт, босго, тайлан

- **TST-PERF-03.** SLO-г серверийн histogram-ын p95/p99-өөр, тогтвортой цонхоор (ramp-ийг хасаж) тооцно. k6 `thresholds` нь клиентийн талын хамгаалалт (серверийн босго + 50 ms).
- **TST-PERF-04.** RC бүрд өмнөх RC-ийн суурьтай (baseline) харьцуулна. Аль нэг SLO метрикийн p95 > 10%-иар муудвал QG-RC унана. Үл хамаарах зүйлийг tech lead ба бүтээгдэхүүний эзэн бичгээр зөвшөөрнө.
- **TST-PERF-05.** Тайлан `docs/perf/<version>.md` (репод) болон Grafana snapshot: SLO хүснэгт (зорилт / бодит / төлөв), нөөцийн ашиглалт, `pg_stat_statements`-ийн удаан 20 query, lock wait-ийн тархалт, deadlock, алдааны ангилал, §14.8-ын үр дүн.

### 14.7 k6 жишээ (PERF-02-ийн хэсэг)

```javascript
// tests/Perf/scenarios/baseline.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';   // ДТ доторх толин хуулбараас ачаална

export const options = {
  scenarios: {
    clerk:      { executor: 'ramping-vus', exec: 'clerk',      stages: [{ duration: '10m', target: 120 }, { duration: '30m', target: 120 }] },
    accountant: { executor: 'ramping-vus', exec: 'accountant', stages: [{ duration: '10m', target: 105 }, { duration: '30m', target: 105 }] },
    external:   { executor: 'ramping-vus', exec: 'external',   stages: [{ duration: '10m', target: 45 },  { duration: '30m', target: 45 }] },
    owner:      { executor: 'ramping-vus', exec: 'owner',      stages: [{ duration: '10m', target: 30 },  { duration: '30m', target: 30 }] },
  },
  thresholds: {
    'http_req_duration{name:post_sales_invoice}': ['p(95)<350', 'p(99)<850'],   // серверийн SLO + 50 ms
    'http_req_duration{name:post_journal}':       ['p(95)<250'],
    'http_req_duration{name:list_page}':          ['p(95)<300'],
    'http_req_failed':                             ['rate<0.001'],
    'checks':                                      ['rate>0.999'],
  },
};

const BASE = __ENV.BASE_URL;                       // https://perf.erp.internal/api/v1
const tenants = JSON.parse(open('./data/tenants.json'));   // synth-ийн гаргасан тенант, компани, хэрэглэгч, cookie

export function clerk() {
  const t = tenants[(__VU * 7919 + __ITER) % tenants.length];
  const c = `${BASE}/companies/${t.companyId}`;
  const draft = http.post(`${c}/sales-invoices`, JSON.stringify({
      customerId: t.b2cCustomerId, pricesIncludingVat: true, paymentMethodCode: 'CASH',
      lines: [{ itemId: t.itemIds[0], quantity: '2', unitPrice: '11000' },
              { itemId: t.itemIds[1], quantity: '1', unitPrice: '3300' },
              { itemId: t.itemIds[2], quantity: '3', unitPrice: '1250' }] }),
    { headers: { 'Content-Type': 'application/json', 'Idempotency-Key': uuidv4(), Cookie: t.cookie }, tags: { name: 'create_draft' } });
  check(draft, { 'draft 201': r => r.status === 201 });
  const post = http.post(`${c}/sales-invoices/${draft.json('id')}:post?ebarimtPrint=sync`, null,
    { headers: { 'Idempotency-Key': uuidv4(), 'If-Match': draft.headers['Etag'], Cookie: t.cookie }, tags: { name: 'post_sales_invoice' } });
  check(post, { 'posted 201': r => r.status === 201, 'money is string': r => typeof r.json('amountIncludingVat') === 'string' });
  sleep(10 + Math.random() * 20);
}
// accountant(), external(), owner() ижил бүтэцтэй (tests/Perf/scenarios/*.js)
```

### 14.8 Ачааллын дараах бүрэн бүтэн байдлын шалгалт

**TST-PERF-06.** PERF тест бүрийн дараа (амжилттай эсвэл унасан ч) дараахыг шалгаж тайланд оруулна. Аль нэг нь зөрвөл тест **унасан** гэж үзнэ (гүйцэтгэл хангасан ч):

1. Бүх компанид I-01 (тэнцвэр), I-02 (гүйлгээ баланс = 0), I-04 (дэд дэвтэр = G/L), I-07 (завсаргүй дугаар) — §20 SCR-T02-ийн функцээр.
2. Апп-ийн логт `ERB01`, `ERL01`, `ERT01` 0.
3. `integration.outbox`-ийн `DEAD`: зөвхөн stub-ийн санаатай timeout-той тэнцүү (UNKNOWN баримтын тоо).
4. Stub-ийн `POST /rest/receipt` дуудлагын тоо = `ebarimt_document`-ийн SAVE баримтын тоо (баримт бүрд ≤ 1).
5. Idempotency: ижил түлхүүрээр давтсан хүсэлт бүр нэг л posting.

---

## 15. Аюулгүй байдал, тэсвэрлэх чадвар, сэргээлтийн тест

| Бүлэг | Тест | Давтамж | Эх |
|---|---|---|---|
| Аюулгүй байдал | SEC-T-01…21 (эрхийн матриц, тенант/компани хоорондын сөрөг тест, fail-closed, immutability, нэвтрэлт, redaction canary, PII скан, header, rate limit, upload, egress, SAST/SCA, DAST, pentest) | PR / `main` / nightly / GA | [13 §17.2](./13-security-audit-tenancy.md) |
| Тэсвэрлэх (chaos) | CH-01: dispatch-ийн дундуур worker kill (INT-OUT-02, AT-EB-18/19). CH-02: posting-ийн commit-ийн үед DB холболт тасрах → клиент ижил түлхүүрээр дахин илгээх → нэг posting ([02 §6.10](./02-architecture.md)). CH-03: PgBouncer restart ачааллын үед. CH-04: PosAPI instance унах → outbox `DEAD` → сэргэсний дараа R-2 (AT-EB-37). CH-05: NTP-ийн зөрүү > 1 s → alert. CH-06: Монголбанкны endpoint алдаа → alert, гар оруулга (R2) | Nightly (CH-01, 02, 04), RC (CH-03, 05, 06) | [02 §9](./02-architecture.md), [12 §10.6](./12-ebarimt-integration.md) |
| Сэргээлт | Сар бүрийн restore drill: pgBackRest → scratch кластер → migration-ийн хувилбар, компани бүрийн гүйлгээ баланс = 0, hash chain, RLS-ийн каталог (DBT-RLS-01, 06) | Сар бүр | [13 §13.3](./13-security-audit-tenancy.md), NFR-094 |
| DR | Бүрэн DR дасгал (ДТ-2-т сэргээх), RTO ≤ 4 цаг, RPO ≤ 5 мин | Жилд 2 | NFR-091 |
| Архив | Жилийн архивын багцын manifest-ийг шалгах, өөрчилсөн файлыг илрүүлэх (SEC-T-17); 10 жилийн хадгалалт (устгах API байхгүй) | `main`, жилийн хаалтын дараа | FR-RPT-017, G4 |

---

## 16. UAT төлөвлөгөө (пилот нягтлан)

### 16.1 Оролцогч ба үүрэг

| Оролцогч | Тоо | Үүрэг |
|---|---|---|
| Пилот компани | 5–10 ([00 §10](./00-overview.md) Ф2). Бүрэлдэхүүн: ≥ 2 гэрээт нягтлангийн компани (олон компанитай), ≥ 1 НӨАТ төлөгч бус, ≥ 1 бэлэн/QPay борлуулалттай жижиглэн худалдаа, ≥ 1 B2B үйлчилгээ | Бодит ажлаа системд хийх, UAT сценари гүйцэтгэх, санал өгөх |
| Пилот нягтлан (UAT тестер) | Компани бүрд 1 | Сценари, зэрэгцээ ажиллагааны тулгалт, гарын үсэг (`PILOT_ACCOUNTANT`) |
| Нягтлан зөвлөх | 1 | Хүлээгдэх үр дүнг батлах, нягтлан бодох бүртгэлийн алдааг ангилах, golden scenario болгох |
| Татварын зөвлөх | 1 | ТТ-03а, eBarimt, НӨАТ төлөгч бус горимын шалгалт |
| Бүтээгдэхүүний эзэн | 1 | UAT-ийн эзэн, go/no-go шийдвэр |
| QA lead | 1 | Төлөвлөлт, алдааны triage, тайлан |
| Support | 1–2 | Onboarding, эхний үлдэгдлийн импорт, support grant ([13 §7.9](./13-security-audit-tenancy.md)) |

### 16.2 Үе шат ба хуваарь

| Үе шат | Хугацаа (баримжаа) | Орчин | Агуулга | Гарах шалгуур |
|---|---|---|---|---|
| **UAT-0** Дотоод бэлтгэл | 2027-03 (2 долоо хоног) | staging (демо + synthetic) | QA ба нягтлан зөвлөх UAT-01…18-ийг бүгдийг гүйцэтгэнэ; сургалтын материал, видео | S1/S2 = 0; сценари ≥ 95% давсан |
| **UAT-1** Onboarding ба зэрэгцээ ажиллагаа | 2027-04-01 – 04-30 | production (пилот тенант) | Эхний үлдэгдэл 2027-04-01 (D-D7). 4-р сарын бодит гүйлгээг манай системд оруулна. Хуучин систем/Excel хууль ёсны бүртгэл хэвээр. **eBarimt-ийг хуучин процесс гаргасаар байна**; манай системд eBarimt унтраастай (давхар баримтаас сэргийлнэ). Сарын эцэст §16.5-ын тулгалт | Тулгалтын зөрүү 0 эсвэл тайлбартай; S1 = 0 |
| **UAT-2** Шилжилт ба амьд пилот | 2027-05-01 – 06-30 | production | Манай систем хууль ёсны бүртгэл, eBarimt production ([12 §23.1](./12-ebarimt-integration.md) go-live шалгах хуудас). 4 ба 5-р сарын хаалт, ТТ-03а-г манай тайлангаар (e-tax-тай нягтлан тулгана) | M1–M10-ийн пилотын зорилт; S1/S2 = 0 сүүлийн 30 хоногт |
| **UAT-3** Үнэлгээ | 2027-07-01 – 07-10 | — | Хэмжүүр, санал, гарын үсгийн хуудас, QG-GA-R1 | §16.3 |
| **UAT-R2** | 2027-10 – 11 | production (3 пилот) + staging | Валют, ҮХ, бараа, НХАТ; жилийн хаалтын давтлага staging-д synthetic өгөгдлөөр (production өгөгдөл хуулахгүй, TST-P-08); 2028-01-ийн бодит жилийн хаалтад support бэлэн | R2-ийн golden 100%; давтлагад S1/S2 = 0 |

### 16.3 Орох ба гарах шалгуур

**Орох (UAT-1, QG-PILOT):**
- R1-ийн Must FR 100% хэрэгжиж, автомат тесттэй (§17.5); `Scenarios/` доторх golden бүгд гарын үсэгтэй, ногоон.
- eBarimt staging-ийн гарах шалгуур ([12 §25](./12-ebarimt-integration.md): TS-01…06, 10, 12, 13, 15, 16, 20, 23, 25, 27, 28, 33, 34); mock-д "PLACEHOLDER" mapping үлдээгүй (TST-CT-03).
- Нийцлийн хаалга: G2 (operator, staging), G3 (DPA, PII каталог, шифрлэлт, маск), G4 (10 жилийн хадгалалт), G6 (2027 параметр production-д 2026-12-15-аас өмнө).
- Нөөц, restore drill амжилттай (≤ 35 хоног), мониторинг ба alert ажиллаж байна; support runbook (eBarimt UNKNOWN, restore, break-glass) бэлэн.
- Пилот компани бүртэй DPA ба пилотын гэрээ; хэрэглэгчийн сургалт (2 цаг) хийгдсэн.

**Гарах (пилот дуусах):**
- [00 §8](./00-overview.md)-ийн пилотын зорилт: M1 медиан ≤ 1 цаг; M2 ≤ 2 ажлын өдөр; M3 ≤ 7 хоног; M4 ≤ 4 цаг; M5 ≥ 98%; M6 = 0; M7 ≤ 24 цаг; M8 = 0; M9 = 0; M10 = 0; M11 ≥ 50%; M12 сарын 8.
- S1/S2 нээлттэй 0; S3 ≤ 10 (засах төлөвлөгөөтэй).
- UAT сценари: "чухал" (✱) бүгд давсан, нийт ≥ 95%.
- Пилот нягтлан бүрийн гарын үсгийн хуудас (§16.4 сценари бүрд "давсан / давсан, тайлбартай / унасан").
- UAT-1-ийн зэрэгцээ ажиллагааны тулгалтын зөрүү 0 эсвэл бүгд тайлбартай (хамаарахгүй зөрүү: харгалзаа, огноо).
- Пилотоос олдсон нягтлан бодох бүртгэлийн алдаа бүр golden scenario болсон (TST-P-06).

### 16.4 UAT сценари

| ID | Сценари | Persona | Хэмжүүр / хүлээн авах | Холбоотой автомат тест |
|---|---|---|---|---|
| UAT-01 ✱ | Бүртгүүлэх → компани тохируулах wizard → eBarimt идэвхжүүлэх → анхны нэхэмжлэх, ДДТД | Owner | M1 ≤ 1 цаг | E2E-02, GS-SAL-001 |
| UAT-02 ✱ | Эхний үлдэгдэл Excel импорт (данс, харилцагч, нийлүүлэгч, бараа, нээлттэй баримт) → гүйлгээ баланс тэнцэх | Accountant / Support | M2 ≤ 2 ажлын өдөр; 1200, 2100 = хуучин системийн дэд дэвтэр | GS-GL-002 |
| UAT-03 ✱ | Өдрийн бэлэн борлуулалт ба eBarimt хэвлэх (B2C), QPay | Sales clerk | Нэг борлуулалт ≤ 1 мин; хэвлэх цонх | E2E-04, GS-SAL-001, GS-CASH-006 |
| UAT-04 ✱ | B2B нэхэмжлэх → банкаар төлбөр → тулгалт | Accountant | Нэхэмжлэх хаагдсан | GS-SAL-002, GS-AR-001 |
| UAT-05 ✱ | Буцаалт: хэсэгчилсэн ба бүтэн, eBarimt засвар | Accountant | Порталд засвар харагдах | GS-SAL-005, 006, GS-EBR-005 |
| UAT-06 ✱ | Худалдан авалт, нийлүүлэгчийн ДДТД баталгаажуулах | Accountant | Баталгаажаагүй орцын НӨАТ-ын жагсаалт | GS-VAT-004, GS-PUR-006 |
| UAT-07 ✱ | Хаан/Голомт банкны хуулга импорт → автомат тулгалт → батлах | Accountant | M11 ≥ 50% автомат | GS-REC-001, CT-BNK-01/02 |
| UAT-08 | Кассын дэвтэр, МХ-1/МХ-2 хэвлэх, кассын тооллого | Accountant | Касс = тооллого | GS-CASH-001…004 |
| UAT-09 ✱ | ТТ-03а туслах тайлан → e-tax-д гараар оруулах; eBarimt-тэй НӨАТ-ын тулгалт | Accountant + татварын зөвлөх | M12 ≤ сарын 8; e-tax-ийн дүн = манай тайлан | GS-VAT-007 |
| UAT-10 ✱ | Сарын хаалтын шалгах хуудас → хаах | Accountant | M3 ≤ 7 хоног; M4 ≤ 4 цаг | GS-CLOSE-001, 005 |
| UAT-11 ✱ | Маягт А (СБТ, ОДТ, ӨӨТ, МГТ) → нягтлангийн өөрийн тооцоотой тулгах | Accountant + нягтлан зөвлөх | M13 = 0 | GS-RPT-002, 004 |
| UAT-12 | e-balance-ийн шивэх хуудас (мянгаар) | Accountant | Зөрүүний мөр зөв | GS-RPT-005 |
| UAT-13 ✱ | Гэрээт нягтлан: 3+ компани хооронд шилжих, ижил процесс | External accountant | M15 ≥ 5 компани | E2E-12 |
| UAT-14 ✱ | eBarimt UNKNOWN-ийг шийдэх дасгал (support-ийн симуляци) | Accountant | M7 ≤ 24 цаг | GS-EBR-006, E2E-11 |
| UAT-15 | Эрх: Sales clerk кредит нот батлах боломжгүй, Viewer зөвхөн унших | Owner | 403 / товч харагдахгүй | E2E-13, SEC-T-01 |
| UAT-16 | Хаалттай үеийн засвар, Owner дахин нээх (шалтгаантай) | Accountant / Owner | Аудитын лог | GS-GL-012, GS-CLOSE-001 |
| UAT-17 | Харилцагчийн дансны хуулга ба тооцоо нийлсэн акт (PDF) | Accountant | Эцсийн үлдэгдэл = харилцагчийн дэд дэвтэр | GS-AR-006, FR-RPT-003 (INT) |
| UAT-18 | Насжилт ба төлөх нэхэмжлэхийн санал | Owner / Accountant | Насжилтын бүлэг зөв | GS-RPT-003, GS-AR-005 |

### 16.5 Зэрэгцээ ажиллагааны тулгалт (UAT-1)

Пилот компани бүрд 2027-04-30-ны байдлаар, хуучин систем (эсвэл Excel) ба манай системийн хооронд:

1. **Гүйлгээ баланс:** дансны харгалзааны хүснэгтээр (хуучин данс → seed данс) данс бүрийн эхний, гүйлгээний, эцсийн үлдэгдэл.
2. **НӨАТ:** 4-р сарын борлуулалтын ба баталгаажсан орцын НӨАТ; хуучин процессоор илгээсэн ТТ-03а-тай.
3. **Авлага, өглөг:** харилцагч/нийлүүлэгч бүрийн үлдэгдэл, нээлттэй баримтын жагсаалт.
4. **Мөнгө:** касс ба банк бүрийн үлдэгдэл = банкны хуулга.

Зөрүү бүрийг "зөрүүний бүртгэл"-д (огноо, данс, дүн, шалтгаан: харгалзаа / оруулгын алдаа / системийн алдаа) бичнэ. "Системийн алдаа" ангилалтай зөрүү бүр S1 эсвэл S2 алдаа болж, засварын өмнө golden scenario бичигдэнэ. Хүлцэл: **0.00** (дүн бөөрөнхийлөлтөөс зөрөх ёсгүй; D-C2-ийн бүхэлчлэлийг асаасан компанид бүхэлчлэлийн дансаар тайлбарлана).

### 16.6 Санал хүсэлт ба алдааны ангилал

- Суваг: апп доторх "Санал илгээх" (дэлгэцийн зураг, хуудасны зам, `request_id` — PII-гүй), долоо хоног бүрийн уулзалт, сарын хаалтын дараах ярилцлага.
- Алдааны зэрэглэлийг §17.1 тодорхойлно. **Нягтлан бодох бүртгэлийн үр дүнд нөлөөлсөн алдаа** (буруу данс, дүн, НӨАТ, дугаар, тайлангийн мөр, eBarimt-ийн дүн) нь хамгийн багадаа S2.
- Засварын хугацаа: S1 ≤ 24 цаг (hotfix, QG-HOTFIX), S2 ≤ 3 ажлын өдөр, S3 дараагийн sprint, S4 backlog.
- UX-ийн санал (алдаа биш) бүтээгдэхүүний backlog-д орно. Хэмжүүрийг M1–M15-аар хянана.

### 16.7 Нууцлал ба өгөгдөл

- Пилотын production өгөгдөл бодит тул G3 (DPA, PII каталог, маск, шифрлэлт) заавал хаагдсан байна.
- Багийн хандалт зөвхөн Owner-ийн олгосон хугацаатай support grant-аар ([13 §7.9](./13-security-audit-tenancy.md)), бүх үйлдэл аудитын логтой.
- Алдааг давтан гаргахад TST-DATA-03-ийн журмаар нэргүйжүүлнэ. Пилотын өгөгдлийг staging руу хуулахгүй.
- Бүтээгдэхүүний хэмжүүрийн event (M1, M3 г.м.) нь PII-гүй, пилотын гэрээнд заагдсан байна.

---

## 17. Чанарын хаалга (quality gates)

### 17.1 Алдааны зэрэглэл

| Зэрэг | Тодорхойлолт | Жишээ |
|---|---|---|
| **S1** | Ledger-ийн бүрэн бүтэн байдал, тенантын тусгаарлалт, хууль/татварын үүрэг зөрчигдсөн, эсвэл үндсэн урсгал бүхэлдээ ажиллахгүй | Тэнцээгүй гүйлгээ; дугаарын завсар; өөр тенантын өгөгдөл харагдах; `qrData` хадгалагдсан; eBarimt давхар илгээгдсэн; буруу НӨАТ-ын тайлан илгээгдэх эрсдэл |
| **S2** | Нягтлан бодох бүртгэлийн буруу үр дүн (тойрох арга байгаа), чухал урсгал саатсан | Буруу данс сонгогдох; тайлангийн мөр буруу; тулгалт буруу хуваарилагдах |
| **S3** | Функцийн алдаа, тойрох арга бий, бүртгэлийн үр дүн зөв | Шүүлтүүр ажиллахгүй; PDF-ийн хэлбэр |
| **S4** | Гоо зүй, текст | Орчуулга, зай |

### 17.2 Хаалга бүрийн шалгуур

| Хаалга | Хэзээ | Шалгуур (бүгд биелэх) | Эзэн |
|---|---|---|---|
| **QG-PR** | Pull request merge | `ci-ok` ([18 §10](./18-dev-setup.md)): restore, format, build (analyzer = error), OpenAPI drift + `oasdiff`, unit + property (PR seed), architecture, integration + DB (PG 17, 18), golden (100%, бүгд гарын үсэгтэй), migration (Path A/B, schema diff), SPA, supply chain, image, CodeQL; coverage-ийн доод хязгаар (§17.3) буураагүй; snapshot-ийн өөрчлөлт эзний approval-тай; [18 §9.2](./18-dev-setup.md) DoD | Reviewer (CODEOWNERS), `two-approvals` (мэдрэмтгий зам) |
| **QG-MAIN** | `main` → staging deploy | QG-PR + staging deploy амжилттай + Playwright smoke (E2E-01, 03, 04, 06, 09, 16) + eBarimt staging smoke + PERF-01 | Автомат; унавал `main` "red", шинэ merge зогсоно |
| **QG-NIGHTLY** | Шөнө бүр | Property (10 000/500 давталт), PG 16, E2E бүрэн (3 browser) + axe, ZAP baseline, PII скан, CH-01/02/04, mutation (долоо хоногт). Шууд deploy-г хаахгүй, гэхдээ 2 удаа дараалан улаан бол QG-RC хаагдана | QA lead |
| **QG-RC** | `v*` tag-ийн өмнө (release candidate) | QG-MAIN ногоон; сүүлийн 2 nightly ногоон; PERF-02…09, 11, 12 (§14.5-ын "RC") SLO хангасан, өмнөх RC-ээс > 10% муудаагүй (TST-PERF-04); 2027 variant golden ногоон; S1/S2 нээлттэй 0; High/Critical эмзэг байдал 0 (NFR-034); restore drill ≤ 35 хоногийн өмнө амжилттай; traceability: R1 Must 100% (§17.5); release notes; migration-ийн expand/contract шалгагдсан | Tech lead + бүтээгдэхүүний эзэн |
| **QG-PROD** | Production deploy (`cd.yml`) | QG-RC; freeze календарь (NFR-021); 2 reviewer; pre-check (`pgbackrest check`, backup < 26 цаг, PosAPI `/rest/info`); deploy-ийн дараа smoke + 30 мин хяналт (posting latency, 5xx, outbox lag, UNKNOWN) | Tech lead + ledger owner/devops |
| **QG-PILOT** | Ф2 эхлэх (UAT-1) | §16.3 "Орох" | Бүтээгдэхүүний эзэн |
| **QG-GA-R1** | R1 GA (2027-07) | §16.3 "Гарах"; G1–G4, G6 хаагдсан ([00 §9](./00-overview.md)); гадны pentest (SEC-T-21) High/Critical 0; PERF-03, PERF-05 давсан; DR дасгал; Order 47-ийн матрицын нотолгоо (immutability ба golden тестийн тайлан, Маягт А-гийн PDF) | Бүтээгдэхүүний эзэн (go/no-go) |
| **QG-R2** | R2 хувилбар | R2 Must FR 100% тесттэй; GS-FX-*, GS-VAT-010…012, GS-VAT-019…022, GS-PUR-012, GS-FA-*, GS-INV-* гарын үсэгтэй, ногоон; UAT-R2; жилийн хаалтын давтлага 2027-12-ээс өмнө | Бүтээгдэхүүний эзэн |
| **QG-LAW** | Хуулийн параметр (`tax_parameter`) өөрчлөх | Шинэ мөр нь `effective_from`-тэй (хуучныг дарж бичихгүй, D-E7); холбогдох golden (`rules: 2027` эсвэл шинэ variant) нэмэгдсэн, татварын зөвлөх гарын үсэг зурсан; production-д хүчин төгөлдөр болохоос ≥ 14 хоногийн өмнө (2027-ийн багц 2026-12-15-аас өмнө, G6) | Татварын зөвлөх + `tax-owners` |
| **QG-HOTFIX** | S1 засвар | Засварыг давтан гаргах тест (golden/integration) эхэлж улаан, дараа нь ногоон; QG-PR бүрэн; PERF-01; freeze-ийн үед `override_reason`-тэй | Tech lead |

### 17.3 Coverage ба mutation-ийн бодлого

- **TST-COV-01.** Coverage-ийг хаалга болгон зөвхөн §2.2-ийн доод хязгаараар хэрэглэнэ. Coverage-ийн хувийг өсгөхийн тулд assertion-гүй тест бичихийг хориглоно (review-ээр).
- **TST-COV-02.** PR нь өөрчилсөн мөрийн coverage-ийг (diff coverage) ≥ 80%-иар хангана (`*.Domain`, posting, tax, money-д ≥ 90%).
- **TST-COV-03.** Stryker.NET долоо хоног бүр `Erp.BuildingBlocks.Domain/Monetary`, `Erp.Tax.Domain`, `Erp.GeneralLedger.Application.Posting`, `Erp.Parties.Domain.Application` дээр ажиллана. Mutation score §2.2-оос доош унавал QG-RC унана. Амьд үлдсэн mutant-ыг 2 долоо хоногт тест нэмж эсвэл "тэнцүү mutant" гэж тайлбарлаж хаана.

### 17.4 Flaky тест

- **TST-FLK-01.** Unit, property, DB, integration, golden тестэд CI-ийн retry **хориотой**. Унавал жинхэнэ алдаа гэж үзнэ.
- **TST-FLK-02.** E2E-д 1 retry. Retry-гаар давсан тест `flaky` гэж тэмдэглэгдэж, 48 цагийн дотор засна эсвэл `@quarantine` (шалтгаан + issue)-д оруулна. Quarantine-д 7 хоногоос удаан байх тест QG-RC-ийг хаана.
- **TST-FLK-03.** Flaky-ийн хувь (сүүлийн 14 хоног) < 1%. Хэтэрвэл шинэ E2E нэмэхийг зогсоож тогтвортой байдлын ажлыг эхэнд тавина.

### 17.5 Traceability тайлан

- **TST-TRC-01.** Тест бүр шаардлагатай холбогдоно: xUnit `[Trait("Req", "FR-SAL-005")]`, `[Trait("AC", "FR-SAL-005-AC1")]`; golden `refs`; Playwright `test.info().annotations.push({ type: 'req', description: 'FR-SAL-006' })`.
- **TST-TRC-02.** CI (`main`) `traceability.md` artifact үүсгэнэ: FR/NFR/CMP бүрээр тест, golden, E2E-ийн жагсаалт ба сүүлийн төлөв. [01-requirements](./01-requirements.md)-ээс R1 Must-ийн жагсаалтыг уншиж, тестгүй шаардлагыг "дутуу" гэж тэмдэглэнэ. QG-RC: R1 Must-ийн дутуу = 0.
- **TST-TRC-03.** CMP (нийцэл) шаардлага бүр нотолгоотой (тест, тайлан эсвэл гар шалгалтын бичлэг). Order 47-ийн матрицад (`compliance/order47-matrix.md`, төлөвлөсөн) тестийн ID-аар иш татна.

---

## 18. Тест бичих дүрэм ба нэршил

| # | Дүрэм |
|---|---|
| TST-CNV-01 | Хавтас: `tests/Unit/<Module>/…`, `tests/Integration/<Module>/…`, `tests/Integration/Database/…`, `tests/Contracts/<System>/…`, `tests/Golden/Scenarios/<area>/…`, `tests/E2E/specs/<flow>.spec.ts`, `tests/Perf/scenarios/*.js` |
| TST-CNV-02 | Нэр (C#): `<Subject>_<Condition>_<Expected>` эсвэл шаардлагын ID-тай `FR_SAL_005_AC1_Posts_invoice_with_legal_number`. `DisplayName`-ийг монголоор бичиж болно |
| TST-CNV-03 | Бүтэц: Arrange / Act / Assert; нэг тест нэг зан төлөв. Assertion-гүй тест хориотой (analyzer) |
| TST-CNV-04 | Мөнгө: string-ээс эсвэл `m` literal (TST-UT-01); `double` хориотой (ERP0001 тест төсөлд ч ажиллана) |
| TST-CNV-05 | Цаг: `FakeTimeProvider`; `Thread.Sleep`, `Task.Delay`-ийг хүлээлтэд хэрэглэхгүй, оронд нь `Eventually.Assert(condition, timeout)` туслах |
| TST-CNV-06 | DB: тест бүр өөрийн DB клон эсвэл компанитай; тест хооронд төлөв хуваалцахгүй; `[Collection]`-ийг зөвхөн нэг DB-г хуваалцах зайлшгүй үед |
| TST-CNV-07 | Лог: логийн текстийг assertion-д хэрэглэхгүй (redaction тестээс бусад). Метрик ба DB төлөвөөр шалгана |
| TST-CNV-08 | Тестийн код production assembly-д орохгүй; тестийн тусгай endpoint, authentication handler нь `Test` орчинд л бүртгэгдэнэ (architecture тест `Test_only_components_not_in_production_host`) |
| TST-CNV-09 | Шинэ ledger хүснэгт, guard, trigger нэмэхэд DBT-IMM/DBT-RLS-ийн каталогийн тест өөрөө өргөжнө; тестийг гараар нэмэх шаардлагагүй ч allow-list-ийг review хийнэ |
| TST-CNV-10 | Шинэ алдааны код нэмэхэд INT-ERR тест (HTTP код, монгол мессеж, i18n түлхүүр) нэмнэ |

---

## 19. Тестийн дэд бүтцийн хүлээн авах тест

Тестийн хэрэгсэл өөрөө зөв ажиллаж байгааг (тест "худлаа ногоон" болохгүй) шалгана. Эдгээрийг `tests/Meta/**`-д (golden runner, DB тестийн туслах, CI скрипт) бичнэ.

- **AT-TST-01** (TST-GS-03). **Өгөгдсөн нь** `Scenarios/`-д `signedOffBy` хоосон файл; **Хэрэв** golden job ажиллавал; **Тэгэхэд** job `GS-E002`-оор унана. **Мөн** `Drafts/`-д байвал `golden-drafts` job анхааруулна, `ci-ok` хаагдахгүй.
- **AT-TST-02** (TST-GS-04/05). **Өгөгдсөн нь** scenario `Кт 5110 1000.00` хүлээж байгаа ч engine (санаатай өөрчилсөн тестийн build) 5100-д бичдэг; **Хэрэв** ажиллавал; **Тэгэхэд** `GS-E020` ба `GS-E021`, `*.actual.yaml` ба `*.diff.md` artifact үүснэ, diff-д данс ба дүн харагдана.
- **AT-TST-03** (TST-GS-10). **Өгөгдсөн нь** preview-д тусдаа (буруу) бөөрөнхийлөлт хийдэг санаатай алдаа; **Тэгэхэд** `GS-E031`.
- **AT-TST-04** (DBT-NUM-02). **Өгөгдсөн нь** `fn_next_document_no`-г sequence (`nextval`)-аар сольсон туршилтын migration; **Хэрэв** зэрэгцээ дугаарлалтын тест ажиллавал; **Тэгэхэд** завсар илрүүлж унана.
- **AT-TST-05** (DBT-RLS-01). **Өгөгдсөн нь** `tenant_id`-тэй, RLS-гүй шинэ хүснэгт нэмсэн migration; **Тэгэхэд** DBT-RLS-01 ба `900_rls.sql`-ийн өөрийн шалгалт унана.
- **AT-TST-06** (CT-POS-05). **Өгөгдсөн нь** outbox payload-д QR-ийг санаатай бичих (CHECK-ийг тойрсон лог бичлэг); **Тэгэхэд** canary скан унана.
- **AT-TST-07** (CT-POS-02). **Өгөгдсөн нь** mock mapping-ийн хариунаас `id`-г хассан; **Тэгэхэд** CT-POS-02 унана.
- **AT-TST-08** (TST-DET-04). **Өгөгдсөн нь** санаатай алдаатай property; **Хэрэв** унавал; **Тэгэхэд** мессежид `Replay` seed хэвлэгдэж, тэр seed-ээр локалд яг ижил хамгийн жижиг жишээ гарна.
- **AT-TST-09** (TST-PERF-04). **Өгөгдсөн нь** өмнөх RC-ийн суурь posting p95 = 200 ms, шинэ = 230 ms; **Тэгэхэд** QG-RC "гүйцэтгэл муудсан (+15%)" гэж унана.
- **AT-TST-10** (TST-SNAP-02/03). **Өгөгдсөн нь** `*.verified.*`-д `QR-CANARY` агуулсан өөрчлөлт; **Тэгэхэд** CI унана.
- **AT-TST-11** (TST-GS-19, TST-TRC-02). **Өгөгдсөн нь** R1 Must FR-д ямар ч тест иш татаагүй; **Тэгэхэд** traceability тайланд "дутуу" гарч, QG-RC унана.
- **AT-TST-12** (TST-GS-18). **Өгөгдсөн нь** golden YAML-д хашилтгүй дүн `dr: 1100.00`; **Тэгэхэд** `GS-E001`.

---

## 20. Schema өөрчлөлтийн хүсэлт

Энэ баримт `db/schema/*.sql`-ийг засаагүй. Доорх өөрчлөлтийг схемийн эзэн хийнэ.

| ID | Эрэмбэ | Өөрчлөлт | Шалтгаан |
|---|---|---|---|
| SCR-T01 | Өндөр | `rpt.fn_trial_balance(p_from, p_to, p_include_closing)`: `p_include_closing = false` үед зөвхөн **тайлангийн хугацааны санхүүгийн жилийн эцсийн** (`posting_date = make_date(year(p_to), 12, 31)` ба `p_to`-той тэнцүү эсвэл түүнээс өмнөх тайлант жилийн) хаалтын бичилтийг хасах; өмнөх жилүүдийн хаалтын бичилтийг (`posting_date < p_from`) эхний үлдэгдэлд **үргэлж** оруулах. Одоо бүх `is_closing` мөрийг хасдаг тул 2027-ийн эхний үлдэгдэлд 3500 = 0 болж, 01-01-ний 3500 → 3400 шилжүүлгийн дараа 3500 Дт үлдэгдэлтэй харагдана | GS-CLOSE-004, FR-RPT-001 AC2, D-D4, BC C-огнооны утга; [seed/README §12](./db/seed/README.md) №9-тэй ижил асуудал. Одоогийн функцээр хаагдсан жилийн дараах оны гүйлгээ балансын эхний үлдэгдлийн нийлбэр ≠ 0 болно |
| SCR-T02 | Дунд | `platform.fn_integrity_report(p_company uuid DEFAULT NULL) RETURNS TABLE (check_code text, status text, details jsonb)` — `SECURITY INVOKER` (RLS үйлчилнэ), зөвхөн унших; шалгалт: I-01 (тэнцвэр), I-02 (гүйлгээ баланс), I-03 (`v_*_ledger_entry_check`), I-04 (`v_receivables/payables_reconciliation`), I-05 (мөнгөний данс = G/L), I-07 (ledger бүрийн `entry_no`, `transaction_no`, `gl_register.no`, SCR-T03-ийн хуулийн дугаарын завсар), I-08 (бөөрөнхийлөгдөөгүй MNT). `app_user`, `app_worker`, `app_readonly`-д EXECUTE | Golden runner (§11.5), шөнийн шалгалт ([02 §8.8](./02-architecture.md)), restore drill (NFR-094), гүйцэтгэлийн тестийн дараах шалгалт (§14.8) нэг SQL-ийг хэрэглэнэ |
| SCR-T03 | Дунд | Append-only `platform.number_allocation (id uuid PK, tenant_id, company_id, number_series_line_id, no bigint, document_no platform.document_no, allocated_on date, created_at, created_by, UNIQUE (company_id, number_series_line_id, no))`; `platform.fn_next_document_no` нь gapless цувралд мөр INSERT хийнэ (ижил transaction, rollback-д хамт буцна); `platform.ledger_guard`-д бүртгэх; view `platform.v_number_series_gap` (`security_invoker`) нь цувралын мөр бүрийн дугаарын завсар/давхардлыг гаргана | Хуулийн дугаар олон хүснэгтэд (posted нэхэмжлэх, кредит нот, кассын баримт, журнал) байгаа тул завсаргүй байдлыг нэг газраас шалгах (I-07, M10, DBT-NUM-02, Order 47-ийн нотолгоо) |
| SCR-T04 | Дунд | `tax.vat_entry.tax_parameter_id uuid` (→ `tax.tax_parameter(id)`, NULL зөвшөөрнө) | FR-TAX-003 AC1: VAT entry нь ашигласан параметрийн мөрийн id-г хадгална; GS-VAT-001-ийн хүлээгдэх үр дүн; ADR-0021 (08 spec-д ижил хүсэлт байвал нэгтгэнэ) |
| SCR-T05 | Бага | `audit.posting_log`-д `lock_wait_ms integer`, `line_count integer`, `entry_count integer` | Гүйцэтгэлийн тайлан ба production-ий SLO-ийн нотолгоог trace-ийн sampling-ээс хамааралгүй гаргах (PERF-06, NFR-016) |
| SCR-T06 | Өндөр | `platform.fn_provision_company_mn(p_tenant_id, p_company_id, p_fiscal_year, p_as_of date DEFAULT NULL)`: `v_as_of := coalesce(p_as_of, greatest(v_today, make_date(v_fy, 1, 1)))`. Хариуны `rates_as_of` хэвээр | Одоо `v_today` нь DB-ийн бодит `now()`-оос гардаг тул ижил golden өөр календарийн огноонд өөр НӨАТ-ын setup авч болзошгүй (TST-P-04, TST-DET-07). Golden runner `p_as_of = <baseline-ийн огноо>` дамжуулна; production-д NULL |

---

## 21. Бусад баримт ба starter-т өөрчлөлтийн хүсэлт

| ID | Хаана | Өөрчлөлт | Шалтгаан |
|---|---|---|---|
| CR-T01 | [`starter/Directory.Packages.props`](./starter/Directory.Packages.props), `.config/dotnet-tools.json` | `Verify.XunitV3`, `JsonSchema.Net`, `WireMock.Net` (эсвэл `Testcontainers` + `wiremock/wiremock` image) нэмэх; dotnet tool `dotnet-stryker` | §3.1, §7, §10, §17.3 |
| CR-T02 | `web/package.json`, [`starter/tools/licenses`](./starter/tools/licenses/allowed-licenses.json) | devDependency `fast-check`, `@playwright/test`, `@axe-core/playwright`; `@axe-core/*`-ийг (MPL-2.0) **dev-only** үл хамаарах зүйлд (`ignored-packages.json`) бүртгэх | §3.2, NFR-070 |
| CR-T03 | [`starter/deploy/posapi-mock/mappings`](./starter/deploy/posapi-mock/mappings) | Fault mapping: `99999999903` (`EMPTY_RESPONSE`), `99999999904` (`CONNECTION_RESET_BY_PEER`), `99999999905` (502 HTML), `99999999906` (дүн зөрүүтэй SUCCESS), `99999999907` (`MALFORMED_RESPONSE_CHUNK`); `DELETE /rest/receipt`-ийн timeout хувилбар | §4.4, §10.2 |
| CR-T04 | [`starter/.github/workflows/ci.yml`](./starter/.github/workflows/ci.yml), `nightly.yml` (Sprint 0-ийн дараа) | `golden` job: schema шалгалт (`GS-E001`), `golden-drafts` (gating биш), 2027 variant; `traceability.md` artifact; nightly: property 10 000, PG 16, E2E 3 browser + axe, ZAP, Stryker (долоо хоногт); `perf-smoke` (staging-ийн дараа) | §2.4, §17 |
| CR-T05 | [18-dev-setup.md](./18-dev-setup.md) §13.3 | Golden-ийн schema-ийн байршил (`tests/Golden/golden-scenario.schema.json`), `Drafts/`, `baselines/`, AREA-ийн өргөтгөл (`AR`, `AP`, `REC`, `RPT`), `tools/Erp.DevTools`-ийн шинэ команд: `golden-render`, `golden-migrate`, `synth`, `e2e-tenant`, `contract-diff` | §11, §13, §14 |
| CR-T06 | [02-architecture.md](./02-architecture.md) §6.8, §6.9, §9.1 | "Улаан сторно" → D-C3-ийн дагуу "эсрэг тэмдэгтэй, эсрэг баганад"; үеийн төлөвийг `OPEN/CLOSED/LOCKED`; outbox-ийн төлөвийг `integration.outbox`-ийнхтэй тааруулах | §0.4 Z2–Z4 |
| CR-T07 | [00-overview.md](./00-overview.md) §11.1 | Файлын жагсаалтад `16-test-strategy.md`-ийг "Бэлэн" болгож нэмэх (одоо `19-testing-rollout.md` гэж төлөвлөсөн) | Уншлагын заавар |
| CR-T08 | [01-requirements.md](./01-requirements.md) NFR-006 | "Golden scenario (одоогийн ба 2027)"-д `variants` механизм ба QG-LAW-ийг иш татах | §11.3, §17.2 |
| CR-T09 | [14-api.md](./14-api.md) ба [api/openapi.yaml](./api/openapi.yaml) | OpenAPI-д байхгүй боловч golden action-д шаардлагатай endpoint: `GET /gl-transactions/{id}/correction-proposal` (05 BR-PST-51), `GET/POST /purchase-receipts`, `POST /purchase-receipts/{id}:confirm` (12 §18.1), `POST /vat-return-periods/{id}:reopen` (08 BR-TAX-79; 14 Q19), `:reject-deduction` (08 BR-TAX-51), `GET /tax/vat-threshold` (08 BR-TAX-86), валютын дахин үнэлгээ (R2). Redocly lint (2026-10-07) одоогийн файлыг алдаагүй гэж баталсан | §11.11, GS-GL-012, GS-VAT-004, GS-VAT-009, GS-VAT-016, GS-VAT-017 |
| CR-T10 | [12-ebarimt-integration.md](./12-ebarimt-integration.md) AT-EB-34 | "*Given* VAT10 мөр, *Then* `ebarimt.vat_on_non_vat_payer`"-ийг SET-09 ба 08 BR-TAX-55-тай нийцүүлэх: НӨАТ төлөгч бус мерчантын VAT10 setup-тэй мөр `NOT_VAT` болж амжилттай; VAL-11 нь зөвхөн гараар угсарсан `VAT_ABLE` мөрөнд (unit) | GS-EBR-008, GS-SAL-010, §22 Q12 |
| CR-T11 | [12-ebarimt-integration.md](./12-ebarimt-integration.md) §7 / [00-overview](./00-overview.md) | Golden ба туршилтын мерчант ТТД нь 11 оронтой байх (PosAPI `merchantTin`: хуулийн этгээд 11, хувь хүн 12–14). 7 оронтой регистрийн дугаар (`5123456`)-ыг `merchantTin`-д хэрэглэхгүй | §12.1 BASE-NONVAT |

---

## 22. Нээлттэй асуулт

| # | Асуулт | Нөлөө | Түр шийдвэр | Хэнээс |
|---|---|---|---|---|
| Q1 | Албан ёсны `PosAPI.yaml` v3.2.48-ийг репод хадгалж, contract тестэд ашиглах эрх бий юу? | CT-POS-01/02 | Репод хадгалахгүй бол CI артефакт сангаас (хувийн) татна | ITC (posapi@itc.gov.mn) |
| Q2 | Golden scenario-д гарын үсэг зурах нягтлан зөвлөх хэн бэ; мэргэшсэн нягтлан бодогч (MNCPA) байх шаардлагатай юу (Order 47-ийн нотолгоонд)? | TST-GS-03, G1 | Нэг гэрээт нягтлан зөвлөх + пилот нягтлангууд | Бүтээгдэхүүний эзэн |
| Q3 | Пилотын зэрэгцээ ажиллагаа (UAT-1) жижиг бизнест хэт ачаалалтай юу; сарын нийлбэрээр тулгах "хөнгөн" хувилбар хангалттай юу? | §16.5 | Сарын нийлбэрээр (гүйлгээ баланс, НӨАТ, дэд дэвтэр) тулгана | Пилот харилцагч |
| Q4 | Хаан, Голомт банкны хуулгын жишээ файл (нэргүйжүүлсэн) хэзээ ирэх вэ? | CT-BNK-01/02, FR-BNK-009, UAT-07 | Ерөнхий wizard-аар тестлэнэ | Пилот харилцагч (D-G2) |
| Q5 | Bank account-ын эхний үлдэгдлийн entry-г тулгалтад хэрхэн оруулах (эхний хуулгаар тулгах уу, импортоор "тулгагдсан" гэж тэмдэглэх үү)? | GS-REC-001 алхам 1, FR-BNK-016 | Эхний хуулгаар тулгана | [09-bank-cash-fx](./09-bank-cash-fx.md) |
| Q6 | `perf` орчны зардал (5 000 тенантын топологи RC бүрд) — ephemeral орчин эсвэл staging-ийг түр томруулах уу? | §14.2 | RC (major/minor)-д ephemeral; patch-д PERF-02-оор | DevOps, бүтээгдэхүүний эзэн |
| Q7 | Dev-only хэрэгслийн лиценз (k6 AGPL-3.0, `@axe-core` MPL-2.0)-ийн бодлого | CR-T02 | Бүтээгдэхүүнд түгээхгүй тул dev-only үл хамаарах жагсаалтад | Tech lead |
| Q8 | Golden-ийг REST API-аар ажиллуулах нь CI-ийн хугацаанд (≤ 8 мин) багтах уу? | TST-GS-13 | API-аар; хэтэрвэл shard. Сервисийн давхаргаар ажиллуулах горимыг нэмэхгүй | `ledger-owners` |
| Q9 | Хаалтын бичилтийн шүүлтүүрийн утга (SCR-T01) — ОДТ/СБТ-ийн хөдөлгүүр ижил дүрмийг хэрэглэх үү? | GS-CLOSE-004, GS-RPT-002 | SCR-T01-ийн дүрэм | Тайлангийн spec (хараахан байхгүй), 05 |
| Q10 | ~~Сөрөг мөрийн НӨАТ-ын бүлэг~~ **Шийдэгдсэн:** [08 BR-TAX-18](./08-tax-vat-mn.md) — бүлгийн түлхүүрт тэмдэг орно, сөрөг бүлэг эхэлж, carry эерэг бүлэгт. Posting buffer-ийн G/L мөрийг тэмдгээр салгах эсэх 05-д тодорхойгүй тул GS-EBR-003-ийн G/L-ийг `byAccount`-аар шалгасаар | GS-EBR-003, GS-SAL-008, GS-VAT-013 | `byAccount` | 05 spec |
| Q11 | ~~Хасагдахгүй НӨАТ-ын VAT entry-ийн талбар~~ **Шийдэгдсэн:** [08 BR-TAX-25, E-TAX-02](./08-tax-vat-mn.md) — бүтэн хасагдахгүй мөрөнд `base = 0`, `amount = 0`, `non_deductible_base`, `non_deductible_amount`, шалтгаан | GS-VAT-005, GS-VAT-006 | — | — |
| Q12 | ~~НӨАТ төлөгч бус компанид VAT10 бүлэгтэй бараа~~ **Шийдэгдсэн:** engine автоматаар `NOVAT`/`NOT_VAT` болгоно ([08 BR-TAX-55](./08-tax-vat-mn.md), [12 SET-09](./12-ebarimt-integration.md)); VAL-11 нь зөвхөн хамгаалалт. Үлдсэн зөрүү: 12 AT-EB-34-ийн "Given VAT10 мөр, Then `ebarimt.vat_on_non_vat_payer`" өгүүлбэр SET-09-тэй зөрчилдөж байна (§21 CR-T10). `NOT_VAT` vs `VAT_FREE` ба `taxProductCode`-ийн утга ⚠ OQ-04 (TS-07) хэвээр | GS-VAT-006, GS-SAL-010, GS-EBR-008 | `NOT_VAT` + `TPC0003` (жишээ код) | 12 spec, ITC, ⚠ D-E5 |
| Q13 | Шинэ алдааны кодууд (санал): `fx.posting_before_last_revaluation`, МХ-2-ын бичиг баримтын код ([09-bank-cash-fx](./09-bank-cash-fx.md) эцэслэх); сарын хаалтын баталгаажуулалтын код (05 эсвэл хаалтын spec). (Шийдэгдсэн: `sales.gen_posting_setup_missing`, `sales.reason_code_required` — 06 §8.2; `tax.vat_difference_too_large`, `tax.vat_threshold_approaching` (W-TAX-01) — 08 §8) | §12-ын хүлээгдэх үр дүн | Модулийн spec эцэслэх хүртэл golden-д "санал" гэж тэмдэглэнэ | 05–11 spec, [14 §9.5](./14-api.md) |
| Q14 | Жилийн хаалтын давтлагыг пилотын бодит өгөгдлөөр хийх боломж (production-ий "sandbox компани" хуулбар)? | UAT-R2 | Synthetic өгөгдлөөр staging-д (TST-P-08) | Бүтээгдэхүүний эзэн, хуульч |
| Q15 | Хялбаршуулсан НӨАТ (2027, FR-TAX-022)-ийн томьёо баталгаажаагүй | `rules: 2027` golden | Golden-ийг томьёо батлагдсаны дараа нэмнэ | Татварын зөвлөх |
| Q16 | Пилотын хэмжүүрийн (M1–M15) event цуглуулах зөвшөөрөл ба хадгалах хугацаа | §16.7 | Пилотын гэрээнд PII-гүй event | Хуульч |

---

## Холбоос

- [DECISIONS.md](./DECISIONS.md) · [00-overview.md](./00-overview.md) (§8 хэмжүүр, §9 хаалга, §10 хуваарь) · [01-requirements.md](./01-requirements.md) · [02-architecture.md](./02-architecture.md) · [03-domain-model.md](./03-domain-model.md)
- [05-posting-engine.md](./05-posting-engine.md) · [06-sales-receivables.md](./06-sales-receivables.md) · [07-purchases-payables.md](./07-purchases-payables.md) · [08-tax-vat-mn.md](./08-tax-vat-mn.md) · [09-bank-cash-fx.md](./09-bank-cash-fx.md) · [11-fixed-assets-inventory.md](./11-fixed-assets-inventory.md)
- [12-ebarimt-integration.md](./12-ebarimt-integration.md) · [13-security-audit-tenancy.md](./13-security-audit-tenancy.md) · [14-api.md](./14-api.md) · [15-ui-ux.md](./15-ui-ux.md) · [18-dev-setup.md](./18-dev-setup.md)
- [db/schema](./db/schema/) · [db/seed/README.md](./db/seed/README.md) · [db/tests](./db/tests/) · [starter/deploy/posapi-mock](./starter/deploy/posapi-mock/)
- [research/tech-architecture.md](./research/tech-architecture.md) §11, §16 · research `bc-*.md` "Worked posting examples"

---

## Хяналтын тэмдэглэл (Review log)

**Огноо:** 2026-10-07. **Хамрах хүрээ:** энэ баримтыг DECISIONS.md, `db/schema/*.sql`, `db/seed/*`, 02, 03, 05–08, 11–15, `api/openapi.yaml`, `starter/deploy/posapi-mock`, research ба `ebarimt-integration` skill-ийн PosAPI дүрэмтэй тулгасан эсрэг (adversarial) хяналт. Бүх SQL нэр (`ledger_guard`, `fn_ledger_update`, `ux_vendor_ledger_entry__vendor_doc_no`, `ux_bank_statement__file`, `match_confidence`, `ERB01`…`ERT01`, `ERD01` г.м.) схемд байгааг grep-ээр шалгасан; `platform.fn_integrity_report`, `platform.number_allocation`, `p_as_of` нь §20-ийн хүсэлт (одоогоор байхгүй). §11.6-ийн JSON Schema нь Draft 2020-12-ийн meta-schema-д нийцэж, §11.7-ийн YAML жишээ түүгээр алдаагүй шалгагдсан. `api/openapi.yaml`-ийг Redocly CLI (recommended)-ээр дахин lint хийсэн: алдаагүй.

**Олдсон ба зассан зүйл (26):**

| # | Ангилал | Асуудал | Засвар |
|---|---|---|---|
| R1 | Зөрчил | Толгойд "модулийн spec 05–11 байхгүй" гэсэн нь Z8 (05/06-д иш татсан) ба одоогийн репотой зөрчилдсөн | Одоо байгаа spec-ийг жагсааж, банк/касс, валют, тайлангийн spec байхгүйг заав |
| R2 | ID-ийн давхцал | 16-ийн GS-PUR-001…006 нь 07 §11.2-ийн GS-PUR-001…012 / GS-AP-001…007-той өөр агуулгаар давхцсан (TST-GS-02 зөрчил); `AP` AREA байгаагүй | 07-ийн ID-г баримтлав (Z8); 16-ийн давхардаагүй scenario → GS-PUR-013…015; хуучин "кредит нот", "нийлүүлэгчийн төлбөр" нь 07 GS-PUR-009, GS-AP-001-тэй давхардсан тул хасав; `AP`-ийг ID-ийн хүснэгт, JSON Schema, CR-T05-д нэмэв |
| R3 | ID-ийн уялдаа | 08 нь (зэрэгцээ хяналтаар) 16-ийн GS-VAT-001…012-ийг хүлээн авч GS-VAT-013…022-ийг нэмсэн; 16-ийн индекс, тоо (87/9/96), QG-R2, variant-ийн үл хамаарал хуучирсан | Индекс, §12.4-ийн хүснэгт, тоо (R1 108, R2 14, нийт 122), §2.2, QG-R2-ийг шинэчлэв |
| R4 | Буруу дүрэм | GS-VAT-009: `SRV-NOVAT` борлуулалт нь 08 BR-TAX-83-ийн эргэлтэд орохгүй (зөвхөн setup VAT10/VAT0) → анхааруулга хэзээ ч гарахгүй; job `vat.threshold_check`, API `?asOf=`, код таамаг байсан | `SRV-CONS`; `tax.vat_threshold.check`; `?date=` (14 AT-API-047); W-TAX-01 `tax.vat_threshold_approaching`, 82.00 %, 07-02-нд `VOLUNTARY_ELIGIBLE` |
| R5 | Буруу өгөгдөл | GS-VAT-005/006: хасагдахгүй НӨАТ-ын VAT entry `base` 1 000 000 / 200 000 гэж бичсэн; 08 BR-TAX-25-аар `base = 0`, `non_deductible_base` | Засав; `nonDeductibleBase`, `nonDeductibleReason`-ийг schema-д нэмэв; BR-TAX-52-ийн сөрөг шалгалт нэмэв |
| R6 | Зөрчил | GS-EBR-008 ба Q12: НӨАТ төлөгч бус мерчантын VAT10 мөр → 422 гэж хүлээсэн; 08 BR-TAX-55 ба 12 SET-09-аар `NOVAT`/`NOT_VAT` болж амжилттай. GS-SAL-010 өөрөө зөрчилдсөн | GS-EBR-008-ийг засаж, VAL-09-ийн сөрөг алхам нэмэв; VAL-11-ийг UT-EBR-д шилжүүлэв; 12 AT-EB-34-ийн зөрүүг CR-T10 болгов |
| R7 | Дутуу setup | BASE-NONVAT-ийн VAT10 setup-д `ebarimt_tax_product_code` байхгүй → `NOT_VAT` мөр VAL-09-өөр унана (GS-SAL-010, GS-VAT-006) | `vatPostingSetup` override (`TPC0003`) ба JSON Schema-ийн `overrides.vatPostingSetup` нэмэв |
| R8 | PosAPI дүрэм | BASE-NONVAT-ийн мерчант ТТД `5123456` (7 орон) нь PosAPI `merchantTin`-ийн шаардлага (хуулийн этгээд 11 орон) зөрчсөн | `50000000011`; `merchantTin`/profile `tin` pattern `^[0-9]{11,14}$`; CR-T11 |
| R9 | PosAPI дүрэм | `billIdSuffix`-ийн schema pattern `^[0-9A-Za-z]{3,10}[0-9]{6}$` нь 12 VAL-28 (`^[0-9]{9}$`)-тэй зөрсөн; 10^6-аар эргэх хил тестгүй | Pattern засав; DBT-NUM-08-д `bill_seq % 10^6` хил нэмэв |
| R10 | Тодорхойгүй хүлээлт | GS-CASH-005: хоцорсон −50 000 нь кассыг сөрөг болгож `ERN02` ба `bank.cash_negative_balance` хоёулаа гарч болох байсан (TST-GS-09 кодын олонлог яг) | Дүнг 10 000 болгож, хүлээгдэх олонлогийг тодорхой бичив |
| R11 | Арифметик | GS-GL-014: хоёр ижил нэхэмжлэхийн дараа P1-ийн гүйлгээ баланс −770 000 биш −1 540 000 | Засав (05 E-C-ийн −770 000 нь нэг нэхэмжлэхийнх) |
| R12 | Буруу property | PBT-02: сөрөг мөрийн carry (08 BR-TAX-18)-тэй үед эерэг бүлгийн НӨАТ `round(Σ × r)`-тэй тэнцэхгүй (06 6-C: 100.00 vs 100.01) — тест худлаа унах байсан | Property-г бүлэг ба VAT identifier гэсэн хоёр түвшинд салгаж, §6.4-ийн кодыг засав |
| R13 | Дутуу | §9.3-ийн SQLSTATE хүснэгтэд `ERD01`, `23503`, `23514`, idempotency-ийн `55P03` → 409 `api.idempotency_in_progress` байхгүй; 428-ийн код байхгүй; PBT-21 "хариу бүр ижил" нь API-IDEM-07-той зөрсөн | 14 §9.6-тай тааруулж, 14-ийг эх сурвалж гэж заав |
| R14 | PosAPI дүрэм | PERF-01 (10 VU, 5 мин) eBarimt staging-тэй ажиллахаар байсан — туршилтын орчинд ачааллын тест хориотой | PERF-д зөвхөн stub; staging-ийг E2E smoke-д л |
| R15 | Хэрэгжүүлэх боломжгүй | Нэг алхамд 2–3 POST (ноорог, мөр, `:post`) хийгддэг ч `Idempotency-Key`, `If-Match`-ийг хэрхэн үүсгэх тодорхойгүй; replay алхам ETag-аас болж 412 авах эрсдэлтэй | TST-GS-21 нэмэв |
| R16 | API-ийн зөрүү | `fiscalYear.reopen` action-д API байхгүй; VAT-ийн `:reopen`, `:reject-deduction`, `correction-proposal`, `purchase-receipts` OpenAPI-д байхгүй | Enum засав, action нэмэв; CR-T09 |
| R17 | Тодорхой бус байдал | `fn_provision_company_mn` нь DB-ийн бодит `now()`-оор НӨАТ-ын setup-ийн огноог сонгодог → golden календарийн огнооноос хамаарна | TST-DET-07, SCR-T06 |
| R18 | Generator | `MoneyGen.UnitPrice()` зөвхөн 3 бутархай оронтой утга үүсгэдэг байсан (`numeric(19,6)`-ийг шалгахгүй) | 6 оронтой болгов |
| R19 | Байхгүй баримт | `12-bank-cash`, `13-currency-fx`, `14-fa-inventory`, "07 spec-ийн код" (сарын хаалт), `07/15-reporting` гэх байхгүй/буруу spec-ийн иш | Бодит файл (09, 11) эсвэл "хараахан байхгүй" болгов; сарын хаалтын чеклист 14/15-ийн endpoint-оор |
| R20 | Тодорхойгүй invariant | I-06 (НӨАТ = G/L) "08 нарийсгана" гэж үлдсэн | 08 §6.12-ийн гурван тэгшитгэлээр солив |
| R21 | Тайлбаргүй дүн | GS-SAL-008-ийн 100.00 (энгийн бөөрөнхийлөлтөөр 100.01) | Carry-ийн тооцоог бичив |
| R22 | Шийдэгдсэн асуулт | Q10, Q11, Q12, Q13-ийн хэсэг 08-аар шийдэгдсэн | Шинэчлэв |
| R23 | Mock | `37900846788` нь тусгай mapping биш, бүх ТТД-ийн анхдагч SUCCESS | Тодруулав |
| R24 | Traceability | §12.14-ийн PUR мөр FR-PUR-001…005 гэж; 006/007 нь R1 Should, 009/010 R2 | Засав |
| R25 | Код | GS-PUR-014-ийн `tax.vat_difference_exceeds_max` (санал) | 08-ийн `tax.vat_difference_too_large` |
| R26 | Буруу иш | INV-16/17/19/31-ийн golden иш (GS-CASH-005 нь кассын сөрөг хоригийг шалгахаа больсон) | Шинэчлэв |

**Шалгаад зөв гэж үзсэн (өөрчлөөгүй):** GS-GL-002…012, GS-VAT-001…004, 007, GS-SAL-001…007, 009…012, GS-AR-001…006, GS-REC-001/004, GS-FX-001…005, GS-CLOSE-002/004, GS-RPT-001…005, GS-EBR-001, 003…005-ын арифметик (дебит = кредит, НӨАТ-ын running remainder, насжилтын хил, банкны тулгалтын тэнцэл, ханшийн зөрүү); seed-ийн данс (1100…9100), цуврал (`SI`…`CL`, `J-`), source code, шалтгааны код; PosAPI-ийн дүрэм: POST retry-гүй + UNKNOWN, DELETE зөвхөн B2C_RECEIPT, `reportMonth` (B2B, 1–7, өмнөх сар), `qrData`/`lottery` хадгалахгүй, `taxProductCode` VAT_ABLE-аас бусад мөрөнд, `consumerNo`/`customerTin`-ийн хязгаар, нийлбэрийн гинж; хуулийн параметр (НӨАТ 10 %, босго 50 сая → 400 сая 2027-07-01, НХАТ УБ 2 %).

**Нээлттэй хэвээр (засаагүй, эзэнтэй):** SCR-T01 (гүйлгээ балансын хаалтын бичилт — GS-CLOSE-004 үүнээс хамаарна), SCR-T06; CR-T09…T11; [09-bank-cash-fx](./09-bank-cash-fx.md) (хяналтын үед бичигдэж байсан) ба тайлангийн spec эцэслэгдсэний дараа GS-CASH, GS-REC, GS-FX, GS-RPT, GS-CLOSE-005-ийн дүн ба "санал" кодыг тулгах (Q13); 07 ба 08 нь энэ баримттай ID-гаа дахин өөрчилбөл Z8-ын дагуу §12-ыг дахин тааруулна.
