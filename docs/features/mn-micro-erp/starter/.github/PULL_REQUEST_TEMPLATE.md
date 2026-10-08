<!--
  PR гарчиг: Conventional Commits хэлбэрээр, англиар.  Жишээ:  feat(sales): post sales invoice with VAT 10%
  Төрөл: feat | fix | refactor | perf | test | docs | build | ci | chore | revert
  Scope = модулийн PostgreSQL схемийн нэр (db/schema, DECISIONS D-K1): platform, gl, tax, party, sales, purchase,
          bank, fx, fa, inv, rpt, ebarimt, integration, audit, identity, web, db, ci
  Дүрэм: 18-dev-setup.md §8 (git workflow), §9 (Definition of Done).
-->

## Юу өөрчлөгдсөн бэ (What)

<!-- 1–3 өгүүлбэр. Хэрэглэгч / нягтлан бодогчийн хэлээр. -->

## Яагаад (Why)

<!-- Issue / story холбоос:  Closes #123 -->

## Нягтлан бодох бүртгэлд үзүүлэх нөлөө (Ledger impact)

- [ ] Нөлөөгүй (UI, tooling, docs гэх мэт)
- [ ] Posting-ийн үр дүн өөрчлөгдөнө → доорх хүснэгтийг бөглөж, golden scenario-г шинэчилсэн

| Баримт | Данс (Дт) | Данс (Кт) | Дүн | НӨАТ / НХАТ бичилт | Golden scenario ID |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

BC лавлагаа (хэрэв BC логикийг дагасан бол): <!-- жишээ: Codeunit 80 "Sales-Post", Table 17 "G/L Entry"; research/bc-gl-posting.md §... -->

## Шалгах хуудас (Checklist)

**Мөнгө ба тооцоо**
- [ ] `double` / `float` ашиглаагүй (ERP0001); бүх дүн `decimal`, бүх бөөрөнхийлөлт `MoneyMath.Round` (AwayFromZero, ADR-0006)
- [ ] API дахь мөнгөн дүн JSON **string**; клиент эцсийн дүн тооцоогүй
- [ ] Дебет = Кредит (transaction бүрт) ба trial balance = 0 гэдгийг тест баталгаажуулсан

**Өгөгдлийн сан**
- [ ] Шинэ migration нь `db/migrations/V####__<module>_<description>.sql` (baseline = канон `db/schema/*.sql`, хэзээ ч засахгүй; дараагийн өөрчлөлт зөвхөн V файлаар), толгой коммент бөглөсөн (`-- Module · Ticket · Expand/contract · Rollback`); `CREATE INDEX CONCURRENTLY` тусдаа `-- migrator: no-transaction` файлд; өмнө merge хийгдсэн migration-д хүрээгүй
- [ ] Expand → contract дараалал (хуучин app хувилбар шинэ схем дээр ажиллана)
- [ ] Шинэ хүснэгт: `tenant_id`, `company_id`, RLS `ENABLE` + `FORCE` + `tenant_isolation` (+ RESTRICTIVE `company_isolation`) + `app_user` grant (fail-closed `platform.current_tenant_id()`); дүн `platform.amount`, нэгжийн үнэ `platform.unit_amount`, тоо `platform.quantity`, ханш `platform.exch_rate`; master data-д `trg_<table>_audit` (`audit.fn_row_change`)
- [ ] Шинэ ledger хүснэгт: `platform.ledger_guard` мөр + `trg_<table>_immutable`/`_no_truncate` (`platform.fn_guard_immutable`) + `trg_<table>_before_insert` (`platform.fn_ledger_before_insert`), `app_user`/`app_worker`/`app_readonly`-оос UPDATE/DELETE/TRUNCATE хураасан; `entry_no` нь `platform.fn_next_entry_no` (IDENTITY биш); INSERT зөвхөн posting engine / `ILedgerWriter<T>`-ээр; засвар зөвхөн reversal-аар (storno биш, D-C3)
- [ ] Хууль ёсны дугаар зөвхөн posting transaction доторх `platform.fn_next_document_no`-оос (gapless, D-C7)

**Аюулгүй байдал ба хувийн мэдээлэл**
- [ ] Команд бүрт permission шалгасан; өөр tenant/company-ийн өгөгдөл харагдахгүйг тест баталгаажуулсан
- [ ] Хувийн мэдээлэл (регистр, civil_id, утас) лог / trace / алдааны мессежид ороогүй
- [ ] eBarimt: `qrData` / `lottery` хадгалаагүй, логлоогүй; `POST /rest/receipt`-ийн client-д retry/resilience handler байхгүй
- [ ] Шинэ dependency-ийн лиценз allow-list-д багтана (CI шалгана); нууц үг / түлхүүр commit хийгээгүй

**Чанар**
- [ ] Unit / integration / golden тест нэмсэн эсвэл шинэчилсэн; CI (`ci-ok`) ногоон
- [ ] UI текст бүр `mn` ба `en` resource-д (hard-coded текстгүй)
- [ ] OpenAPI (`web/src/shared/api/openapi.json`) ба TS client (`npm run api:gen`) шинэчлэгдсэн (API өөрчлөгдсөн бол); v1-д breaking өөрчлөлтгүй (`oasdiff`)
- [ ] Шинэ урсгалд span / metric нэмсэн; feature flag-ийн ард (дуусаагүй ажил бол)
- [ ] Docs / ADR шинэчилсэн (шийдвэр өөрчлөгдсөн бол)

## Хэрхэн шалгах вэ (How to test)

<!-- Алхам, seed өгөгдөл, туршсан орчин (local / staging + eBarimt staging). -->

## Rollback төлөвлөгөө

<!-- App image-ийг өмнөх хувилбар руу буцаахад хангалттай юу? Migration буцаах шаардлагагүй гэдгийг баталгаажуулах. -->
