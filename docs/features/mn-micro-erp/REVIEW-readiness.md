# Хөгжүүлэлтийн бэлэн байдлын хяналт (Readiness review)

- **Огноо:** 2026-10-08 (Пүрэв). Sprint 0 эхлэх өдөр: **2026-10-12 (Даваа)** ([17](./17-backlog-roadmap.md) §7.1).
- **Хянагч:** шинэ tech lead (4 хүнтэй баг).
- **Асуулт:** энэ багц ([DECISIONS.md](./DECISIONS.md), 00…19, `adr/`, `db/`, `api/openapi.yaml`, `starter/`, `prototype/`) нь хэнээс ч асуулгүйгээр Sprint 0 ба Sprint 1-ийг эхлүүлэхэд хангалттай юу?
- **Арга:** баримтыг уншаад зогсоогүй. Starter-ийг шинэ хавтсанд хуулж build/test хийсэн, DB-г хоосон сан дээр суулгасан, компанийг `app_user` эрхээр (RLS идэвхтэй) provision хийсэн, API-г ажиллуулж журнал батласан, CI workflow-г `actionlint`-оор шалгасан, Sprint 0/1-ийн story бүрийг spec-тэй нь тулгасан. Ажиллуулсан бүх командыг §2-т бичив.

---

## 1. Дүгнэлт

**Нөхцөлтэй бэлэн.** Sprint 0-ийг Даваа гаригт эхлүүлж болно. Код build болж, тест ногоон гарч, DB суугдаж, компани provision хийгдэж, эхний журнал батлагдаж байна. Бизнесийн логикийн spec (05 posting, 06 борлуулалт, 08 НӨАТ) нарийвчилсан. Нээлттэй асуулт бүрд анхдагч шийдвэр бий, тиймээс домэйны кодыг асуултгүйгээр бичиж болно.

**Sprint 1-ийг 17-д төлөвлөсөн хэлбэрээр нь commit хийж болохгүй.** Шалтгаан нь дөрвөн нээлттэй blocker (§8). Тэд бүгд домэйн бус хэсэгт байна: багийн багтаамж, канон схемийн хоёр алдаа ба түүнийг засах migration-ий зам, тенант үүсгэх/нэвтрэх хэсгийн API ба UI-ийн гэрээ, нягтлан зөвлөх. Тавдах blocker болох шинэ репод CI улаан болдог алдааг энэ хяналтаар зассан (B-01).

| Үзүүлэлт | Тоо |
|---|---:|
| Олдвор нийт | **24** |
| — blocker | 5 (засагдсан 1, нээлттэй 4) |
| — major | 12 (засагдсан 4, нээлттэй 8) |
| — minor | 7 (засагдсан 3, нээлттэй 4) |
| Энэ хяналтаар засагдсан | **8** (§6) |
| [19](./19-risks-open-questions.md)-д нэмсэн | 3 эрсдэл (R-27…R-29), 7 асуулт (PO-18…PO-21, TL-14…TL-16) |

---

## 2. Юуг ажиллуулж шалгасан (нотолгоо)

Орчин: .NET SDK 10.0.401, PostgreSQL 16.15 (локал кластер), Python 3 + `jsonschema` 4.26, `actionlint` 1.7.12. Docker энэ орчинд байхгүй тул `docker compose`-ийг ажиллуулаагүй.

| # | Алхам | Команд (товч) | Үр дүн |
|---|---|---|---|
| 1 | Starter-ийг шинэ репо болгох | `cp -r starter/. <new>` → bin/obj устгах → `git init` | ✔ (starter хавтсанд локал build-ийн ~390 MB `bin/obj/TestResults` байсан, m-02) |
| 2 | Restore | `dotnet restore --locked-mode` | ✔ 19 төсөл |
| 3 | Build | `dotnet build -c Release --no-restore` | ✔ **0 warning, 0 error** |
| 4 | Формат | `dotnet format whitespace/style --verify-no-changes` | ✔ |
| 5 | Тест | `ERP_TEST_DB=… dotnet test -c Release` | ✔ **125: 124 passed, 1 skipped** (`DatabasePackageDriftTests`: standalone репод `../db` байхгүй тул зориуд алгасдаг). Засварын дараа дахин ажиллуулсан: ижил |
| 6 | Golden файл | `python3 tools/ci/validate-golden.py` | ✔ 6 файл, 0 зөрчил |
| 7 | Лиценз | `dotnet tool restore`; `nuget-license` (allow-list) | ✔ |
| 8 | Канон DB | `db/apply.sh "…/erp_rdy_review…" --seed --test` | ✔ 19 schema файл, seed, `catalog_checks`/`smoke`/`seed_checks` бүгд PASS (10.7 сек) |
| 9 | Migrator CLI | `Erp.Migrator migrate → seed → verify → info → migrate` | ✔ 19 + 9 script; verify 28 checksum + catalog; давтан migrate = 0 |
| 10 | Тенант + компани provision | 13 §5.3.1-ийн SQL (`app_user`, RLS) | ✔ 2 тенант; `fn_provision_company_mn` 813/750 мөр, 182 данс, 2026 ба 2027 он (24 сар), 5 role, `PROVISIONING → ACTIVE` |
| 11 | API | `Erp.Api` + `curl POST …/gl/postings` | ✔ 201, `GJ-2026-00001`, 7210 Дт / 2650 Кт 1 500 000. Гэхдээ дүн `"1500000"` гэж гарсан (M-04) |
| 12 | OpenIddict-ийн DDL | OpenIddict.EntityFrameworkCore 7.7.1 + EFCore.NamingConventions → `GenerateCreateScript()` | ✔ `identity.oidc_*`-ийн багана бүгд таарсан; хүснэгтийн нэрийг `ToTable`-аар map хийх шаардлагатай (M-06) |
| 13 | Схемийн алдаа | `audit.posting_log`-д INSERT | ✘ `record "new" has no field "created_at"` (B-03). V0001-ийн санал (§8) засвар болохыг шалгасан |
| 14 | CI workflow | `actionlint -config-file .github/actionlint.yaml` | ✔ 0 алдаа (засварын өмнө ба дараа). Шинэ репод логикийн хувьд улаан болох байсан (B-01) |

---

## 3. Sprint 0-ийн алхам бүр (2026-10-12 … 10-23)

| Story | Асуулгүй хийж болох уу | Тайлбар |
|---|---|---|
| US-FND-001 репо, ruleset, CODEOWNERS | **Тийм, гэхдээ хүний үйлдэл хэрэгтэй** | GitHub org/repo, багууд (`@ledger-owners` г.м.) 4 хүнд тааруулах. Private репод ruleset ба CODEOWNERS-ийг албадахад GitHub Team төлөвлөгөө хэрэгтэй (m-06) |
| US-FND-002 solution, давхарга, architecture тест | Тийм | Skeleton-д 2 модуль (GL, Tax) ба 4 BuildingBlocks бий. Үлдсэн 11 модулийн хоосон төслийг 18 §16-ийн скриптээр нэмнэ |
| US-FND-003 migrator + канон схем | **Хэсэгчлэн** | `migrate/seed/verify/info` ажиллаж байна. `db/migrations/V####`, `reset`, `--set demo` хараахан алга. Эхний схемийн засвар (B-03) үүнээс хамаарна |
| US-FND-004 building block | Тийм | `MoneyMath`, `TenantSession`, ProblemDetails бэлэн. Idempotency filter, `BusinessDate` үлдсэн. Спец: 18 §4, ADR-0006 |
| US-FND-005 fixture + golden | Тийм (AC зассан) | GS-GL-001 нь банкны тал, dimension, posting log шаарддаг тул Sp0-д боломжгүй байсан. AC-ийг GS-GL-021…024-өөр солив (M-05) |
| US-FND-006 SPA | Тийм | 15 §13–14 (token, компонент), ADR-0015, prototype. TL-10-ийн анхдагч: React Aria. Нэвтрэх хуудасны UI алга (M-12) |
| US-FND-007 eBarimt skeleton | Тийм | 12 §9–10, WireMock mapping бий. Mock нь албан ёсны PosAPI.yaml-тай тулгагдаагүй placeholder (m-07) |
| US-FND-008 CI/CD + staging | **Хэсэгчлэн** | CI-ийн блок засагдсан (B-01). Staging хост, Монголын ДТ, self-hosted runner алга (M-12 / R-28), тиймээс AC-ийн "staging-д автомат deploy" хэсэг Sp0-д биелэхгүй |

## 4. Sprint 1-ийн story бүр (2026-10-26 … 11-06)

| Story | Асуулгүй хийж болох уу | Саад / анхдагч |
|---|---|---|
| US-PLT-001 бүртгэл → тенант | **Үгүй** | `email_confirmed` багана алга (B-03); тенант үүсгэх endpoint алга (B-04, TL-14); имэйлийн провайдер (M-10, PO-18); багцын загвар (M-09, PO-19). DB-ийн дарааллыг баталгаажуулж 13 §5.3.1-д бичсэн |
| US-PLT-002 OIDC BFF + PKCE | Анхдагчаар | 13 §5.4 нарийвчилсан. Өөрийн Identity store (M-06, TL-16) ба нэвтрэх хуудасны UI (M-12) хэрэгтэй |
| US-PLT-004 тенант солих | Тийм | `platform.fn_list_user_tenants` ба `POST /bff/switch-tenant` (13 §5.5, 15 UX-NAV-03) бий |
| US-PLT-011 завсаргүй дугаар | Тийм | `fn_next_document_no` ба `seed_checks` бэлэн. DBT-NUM-02-ийн зэрэгцээ тестийг бичнэ. DoR → B-05 |
| US-GL-001 дансны төлөвлөгөө | Тийм | `mn_10_coa.sql` 182 данс, UX-COA-01…09, `/gl-accounts` |
| US-GL-004/005 posting engine | Тийм (ихэнх нь skeleton-д бэлэн) | Posting log B-03-аас хамаарна. DoR → B-05 (⚠ D-C3, D-C7) |
| US-GL-008 immutability | Тийм | `smoke.sql` (ERL01/42501) |
| US-TAX-001 хуулийн параметр | Тийм | 08 §5.2, `GET /tax-parameters`, `legal_parameters.sql` |
| US-INT-001 REST суурь | Анхдагчаар | 14 §2–9. Дүнгийн формат (M-04); contract-first эсвэл code-first (M-07) |
| US-FND-009 OTel | Тийм | ADR-0020, `deploy/otel-collector.yaml` |
| US-FND-012 импортын spike | Тийм (spike) | 14 §21 Q20 |

---

## 5. Олдворын бүртгэл

Төлөв: **Засагдсан** = энэ хяналтаар засагдсан; **Нээлттэй → ID** = хүний шийдвэр хэрэгтэй, [19](./19-risks-open-questions.md)-д бүртгэсэн; **Sprint ажил** = шийдвэр шаардлагагүй, багийн ажил.

### Blocker

| ID | Олдвор | Нотолгоо / эх | Засвар | Төлөв |
|---|---|---|---|---|
| B-01 | Starter-ээс үүссэн репод `ci.yml`-ийн `web` job, supply-chain-ийн npm алхам ба `image` job (Dockerfile `COPY web/package.json`) `web/` байхгүйн улмаас унана. Үүнээс болж `ci-ok` улаан болж, ruleset-ийн дагуу PR #2–#6-ийг merge хийх боломжгүй | `ci.yml` (web, supply-chain, image, ci-ok), `deploy/docker/Dockerfile:17`, 18 §16 PR 7 | `detect` job нэмсэн (`web/package-lock.json` байгаа эсэх). `web` ба npm алхам алгасагдана, `image` нь web-ээс хамааралтай тул skipped болно, `ci-ok` нь skipped-ийг амжилттай гэж үзнэ. `actionlint` 0 алдаа | **Засагдсан** |
| B-02 | Баг 4 хүнтэй. 17 §1.3-ийн төлөвлөгөө 6 инженер + TL (төлөвлөх 72 SP) дээр тулгуурласан. Sp0 = 47 SP, Sp1 = 59 SP. 4 хүний бодит багтаамж ≈ 39 SP (3×14 + 7, 20% нөөцтэй). G6 (2026-12-15), пилот (2027-04-01) хугацаандаа хүрэхгүй | 17 §1.1, §1.3, Q-06 | PO-20-оор хамрах хүрээ/огноог Sp0-ийн planning-д шийднэ. §9-ийн 4 хүний Sp0/Sp1 санал | Нээлттэй → PO-20, R-27 |
| B-03 | Канон схемд хоёр алдаа бий. (1) `identity.user_credential.email_confirmed` алга (CR-03-т хүссэн, CHANGE_REQUESTS #24 "хүлээн авсан" боловч DDL-д ороогүй), тиймээс `platform.email_not_verified` хэрэгжихгүй. (2) `audit.posting_log`-д INSERT хийх боломжгүй. Мөн `Erp.Migrator` нь `db/migrations/V####`-ийг дэмждэггүй тул засвар оруулах зам алга | `015_identity.sql`; 13 §5.3, CR-03; §2 #13; starter README "мэдэгдэж буй алдаа" #1–#2 | Sp1-ийн **эхний** ажил: migrator-т V-migration (18 §16 PR 3-ын үлдэгдэл), дараа нь доорх `V0001`. 2026-10-08-нд scratch DB дээр шалгасан. Баталсан baseline-ийг өөрчлөхгүй (A-03) | **Засагдсан** (2026-10-08): бүтээгдэхүүн хараахан production-д ороогүй тул канон DDL-д шууд нэмсэн (`015_identity.sql` → `email_confirmed_at`, `140_integration_audit.sql` → `posting_log.created_at`), `starter/db`-д синк хийсэн. `apply.sh --seed --test` exit 0, `dotnet test` 125/125. Migrator-ийн V-migration дэмжлэг (R-29) Sprint ажил хэвээр |
| B-04 | Sprint 1-ийн тенант/нэвтрэлтийн гэрээ дутуу. Тенант үүсгэх endpoint 13 §19 ба `openapi.yaml`-д алга. `/bff/*`, `/me/*`, `/tenant/*` `openapi.yaml`-д алга. Бүртгэл, нэвтрэх, MFA, нууц үг сэргээх хуудасны UI 15-д ба prototype-д алга | 13 §19, 14 §0 (замыг 13 рүү заадаг), `grep '^  /' api/openapi.yaml` (тенант/me = 0) | Анхдагч санал: `POST /api/v1/tenants` (DB дараалал 13 §5.3.1), Razor хуудсыг 15-ийн token-оор, талбарыг 13 §5.2–5.3-аас авна. TL ба UX Sp0-д батална | Нээлттэй → TL-14 |
| B-05 | Нягтлан зөвлөх ба татварын зөвлөхийн нэр тодорхойгүй. Sp1-ийн posting story-ийн DoR (17 §10.1: GS ноорог зөвлөхөөр хянагдсан, ⚠ D-C3/D-C7 баталгаажсан) биелэхгүй | 17 §1.4 A-01/A-02, §10.1; 19 PO-15 | PO Sp0-д гэрээ байгуулна. Тэр хүртэл Sp1-д posting-гүй story-г эхэнд нь хийнэ | Нээлттэй → PO-21 |

`V0001` санал (B-03, баталгаажсан):

```sql
ALTER TABLE identity.user_credential ADD COLUMN email_confirmed_at timestamptz;   -- NULL = баталгаажаагүй (13 §5.3)
ALTER TABLE audit.posting_log      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();  -- fn_ledger_before_insert
-- PO-19-ийн хариуны дараа: ALTER TABLE platform.tenant ALTER COLUMN max_companies SET DEFAULT 1;  (FR-PLT-001: Micro 1)
-- + COMMENT ON COLUMN … (catalog_checks), db/tests/smoke.sql-д regression
```

### Major

| ID | Олдвор | Засвар | Төлөв |
|---|---|---|---|
| M-01 | 18 §0-ийн "эхний 30 минут"-ын командуудад байхгүй зүйл орсон: `tools/Erp.DevTools`, `seed --set demo`, `web/`, `db/seed/demo/README.md`. Шинэ хөгжүүлэгч эхний өдөр алдаа авна | 18 §0-д Sprint 0-ийн бодит төлвийн тэмдэглэл ба §16.1 руу заасан холбоос нэмсэн | **Засагдсан** |
| M-02 | Integration тестийн анхдагч DB нь энэ sandbox-ийн `host=/var/lib/postgresql port=55432 user=erp`. Хөгжүүлэгчийн компьютер ба docker-compose дээр `ERP_TEST_DB` тохируулаагүй бол `dotnet test` унана | `TestDatabase.DefaultConnection` = `host=localhost port=5432 user=postgres password=postgres` (compose ба CI-тай ижил). README ба 18 §16.1-ийг шинэчилсэн. Дахин build/format/test ✔ | **Засагдсан** |
| M-03 | Бүртгэл → тенант → компанийн DB дараалал баримтжаагүй. Жишээ нь `platform.app_user`-д INSERT хийхээс өмнө `fn_set_context` дуудахгүй бол RLS алдаа гардаг. Owner role оноолт, `fn_mn_seed_roles` ч бичигдээгүй | 13 §5.3.1-д гурван transaction-ийн SQL нэмсэн (§2 #10-аар шалгасан) | **Засагдсан** |
| M-04 | Дүнгийн JSON нь `"1500000"`. 14 API-JSON-06 ба `Amount` schema-д валютын нарийвчлалаар `"1500000.00"` байх ёстой | US-INT-001-д `Amount`-ийн гаралтыг засна. Starter README-д бүртгэсэн | Sprint ажил |
| M-05 | US-FND-005-ийн AC "GS-GL-001 ногоон" Sp0-д биелэхгүй: 05 E-A нь `BANK_ACCOUNT` тал, dimension set 7, `audit.posting_log` шаарддаг | 17 US-FND-005-ийн AC-ийг GS-GL-021…024, GS-VAT-023 болгосон. GS-GL-001-ийг US-BNK-002 / US-GL-009 руу шилжүүлсэн | **Засагдсан** |
| M-06 | Identity store: `Microsoft.AspNetCore.Identity.EntityFrameworkCore` pin хийгдсэн боловч `identity.user_credential` нь стандарт `AspNet*` бүтэц биш. Өөрийн `IUserStore` хэрэгжүүлэх ба OpenIddict entity-г `identity.oidc_*` руу map хийх шаардлагатай | Анхдагч санал TL-16-д. Баганын нийцлийг шалгасан (§2 #12) | Нээлттэй → TL-16 |
| M-07 | API гэрээний эх нь тодорхойгүй. 14 API-VER-05-ийн дагуу кодоос үүссэн `openapi.json` ↔ `api/openapi.yaml`, харин `ci.yml` нь ↔ өмнөх branch-ийн `openapi.json`. Skeleton-ий `POST …/gl/postings` гэрээнд алга | TL-14 (5)-ын анхдагч | Нээлттэй → TL-14 |
| M-08 | Демо өгөгдөл (`db/seed/demo/S###`), `tools/Erp.DevTools` (`demo-post`, `new-migration`, `new-scenario`) байхгүй, 17-д тэдгээрт зориулсан story ч алга. Sprint review-ийн демо, staging, CI Path B (`ci.yml` migrations) үүнээс хамаарна | 17-д US-FND-014 (DevTools + демо seed, ≈ 5 SP, Sp1–Sp2) нэмэх. Агуулга нь 18 §13.2 | Sprint ажил (backlog) |
| M-09 | Багцын загвар тодорхойгүй. Схемийн анхдагч `plan_code='MICRO'`, `max_companies=3` нь FR-PLT-001-ийн "Micro 1"-тэй зөрнө. Billing ба оператор хэрхэн оролцохыг заагаагүй | PO-19 | Нээлттэй → PO-19 |
| M-10 | Transactional имэйлийн провайдер (баталгаажуулалт, урилга, нууц үг сэргээх) сонгогдоогүй, data localisation-тай холбоотой | PO-18 (анхдагч: hosting-ийн SMTP relay, локалд Mailpit) | Нээлттэй → PO-18 |
| M-11 | Шинэ репо үүсмэгц эх сурвалж хоёр болно: D-K1 нь spec багцын `db/schema`-г канон гэж заадаг, харин бүтээгдэхүүний репод `db/` бий | TL-15 (эхний өдөр spec багцыг `docs/spec/` руу зөөж, D-K1-ийг шинэчлэх) | Нээлттэй → TL-15 |
| M-12 | Staging, Монголын ДТ, self-hosted runner Sp0–Sp2-т байхгүй. US-FND-008, eBarimt staging (зөвхөн Монголын IP), G6 эрсдэлтэй | R-28: түр staging-ийг Монгол дахь VPS-д синтетик өгөгдөлтэй байршуулах; US-FND-008-ийн AC-ийг "CI ногоон + GHCR image" болгох | Нээлттэй → R-28, PO-06 |

### Minor

| ID | Олдвор | Засвар | Төлөв |
|---|---|---|---|
| m-01 | 15 UX-WIZ-03 ба A-08 нь "`fn_provision_company_mn` эхний жилийг л үүсгэдэг" гэж бичсэн. Бодит байдал: эхний ба дараагийн жил (`mn_90_provision.sql:101`, §2 #10) | 15-ийг зассан | **Засагдсан** |
| m-02 | Spec багцын `starter/` дотор локал build-ийн гаралт (~390 MB) бий. `cp -r` үүнийг хуулдаг (`.gitignore` commit-оос хасдаг) | README-д `rsync --exclude` зөвлөмж нэмсэн | **Засагдсан** |
| m-03 | README-д "125/125" гэж бичсэн. Standalone репод 124 passed + 1 skipped гарна | README-ийн баталгаажуулалтын хүснэгтэд тайлбарласан | **Засагдсан** |
| m-04 | `015_identity.sql`-ийн тайлбарт "OpenIddict 6.x" гэж бичсэн, pin нь 7.7.1. Багана нь таарч байна | Дараагийн V-migration-д COMMENT-ийг засна (TL-16) | Нээлттэй → TL-16 |
| m-05 | `codeql` matrix-д `javascript-typescript` бий. `web/` байхгүй үед `CODEQL_ENABLED=true` тохируулбал унана | SPA нэмэгдтэл `CODEQL_ENABLED`-ийг асаахгүй | Sprint ажил |
| m-06 | Private репод ruleset, CODEOWNERS-ийг албадах, required reviewer-д GitHub Team хэрэгтэй. `sensitive-review` нь 2 approval шаарддаг тул 4 хүнтэй багт ачаалал өндөр | TL-07 (зардал); sensitive замд 2 approval-ыг хадгалж, бусад замд 1 | Нээлттэй → TL-07 |
| m-07 | PosAPI mock нь placeholder, албан ёсны PosAPI.yaml (v3.2.48)-тай тулгагдаагүй | US-FND-007-д тулгана (`ebarimt-integration` skill, EB-02) | Sprint ажил |

---

## 6. Энэ хяналтаар өөрчилсөн файлууд

| Файл | Өөрчлөлт | Олдвор |
|---|---|---|
| `starter/.github/workflows/ci.yml` | `detect` job; `web`, supply-chain-ийн npm алхам, `image` нь SPA байхгүй үед алгасагдана; `ci-ok`-ийн `needs` | B-01 |
| `starter/tests/Integration/Infrastructure/TestDatabase.cs` | Анхдагч DB = compose/CI | M-02 |
| `starter/README.md` | Хуулах зөвлөмж, CI-ийн тэмдэглэл, мэдэгдэж буй схемийн алдаа #2–#3, API-ийн зөрүү, баталгаажуулалтын мөр | B-01, B-03, M-02, M-04, m-02, m-03 |
| [18-dev-setup.md](./18-dev-setup.md) | §0-д Sprint 0-ийн бодит төлөв; §16.1-ийн анхдагч DB | M-01, M-02 |
| [13-security-audit-tenancy.md](./13-security-audit-tenancy.md) | §5.3.1: бүртгэл → тенант → компанийн шалгасан SQL дараалал ба мэдэгдэж буй дутуу зүйл | M-03, B-03, B-04 |
| [15-ui-ux.md](./15-ui-ux.md) | UX-WIZ-03, A-08: provisioning хоёр жил үүсгэдэг | m-01 |
| [17-backlog-roadmap.md](./17-backlog-roadmap.md) | US-FND-005-ийн AC | M-05 |
| [19-risks-open-questions.md](./19-risks-open-questions.md) | R-27…R-29, PO-18…PO-21, TL-14…TL-16; дулааны зураг, хугацааны жагсаалт ба Хавсралт А-гийн тоо | B-02, B-04, B-05, M-06, M-07, M-09…M-12, m-04, m-06 |

Канон `db/schema`, `db/seed`-д гар хүрээгүй (A-03, D-K1). Тиймээс `starter/db` хуулбартай зөрөх (drift) асуудал үүсэхгүй.

---

## 7. Эхний өдрийн шалгах хуудас (Даваа, 2026-10-12)

**PO (09:00–10:00, planning-аас өмнө)**
- [ ] PO-20: 4 хүний үүрэг ба R1-ийн хамрах хүрээ/огноо (§9-ийн санал дээр тулгуурлан).
- [ ] PO-21: нягтлан ба татварын зөвлөхийн нэр, гэрээний огноо. Нэгдүгээр долоо хоногийн Пүрэв гаригт анхны golden review хийнэ.
- [ ] 19 §4-ийн ITC-1/ITC-2 захидал (EB-01 …), ДТ-ийн үнийн санал (PO-06), Order 47-ийн текст (PO-01) илгээх.

**Tech lead / DevOps (эхний өдөр)**
- [ ] GitHub org ба private repo (Team төлөвлөгөө), 4 хүнд тохирсон багууд, GHCR. `CODEOWNERS`-ийн `@mn-erp/*`-ийг солих.
- [ ] Репо үүсгэх: `rsync -a --exclude bin/ --exclude obj/ --exclude TestResults/ starter/ <repo>/`, spec багцыг `docs/spec/`-д хуулах (TL-15), commit.
- [ ] Ruleset (`main`): PR заавал, `ci-ok` required, squash, linear history. `two-approvals` зөвхөн sensitive замд.
- [ ] Эхний PR-ийн GitHub дээрх `ci.yml`-ийн анхны жинхэнэ ажиллагааг шалгах: `detect` → web skipped → `ci-ok` ногоон. Энэ орчинд GitHub runner-ийг шалгаж чадаагүй.

**Хөгжүүлэгч бүр (≤ 1 цаг)**
- [ ] .NET SDK 10.0.1xx+, Docker + Compose v2, Node 24, psql 17 (18 §5.1).
- [ ] `docker compose -f deploy/docker-compose.yml up -d postgres`
- [ ] `dotnet restore --locked-mode && dotnet build -c Release && dotnet test` → **124 passed, 1 skipped, 0 warning**.
- [ ] `dotnet run --project src/Erp.Migrator -- migrate|seed|verify --connection "Host=localhost;Port=5432;Database=erp;Username=postgres;Password=postgres"`
- [ ] 13 §5.3.1-ийн SQL-ээр нэг тенант/компани provision хийх. `Database__SessionRole=app_user ConnectionStrings__App=… dotnet run --project src/Erp.Api`. README-ийн `curl` → `GJ-2026-00001`.
- [ ] 18 §3–§4 (нэршил, мөнгөний 12 дүрэм) ба DECISIONS-ийг унших.

**Sprint 0 planning (10:00)**
- [ ] §9-ийн дагуу Sp0-ийг дахин тодорхойлох. B-03-ийн (V-migration + V0001), M-04, M-08-ийн тасалбар нээх.

---

## 8. Үлдсэн blocker-ууд (Sprint 1-ийг commit хийхээс өмнө хаагдсан байх ёстой)

| ID | Юу | Эзэн | Хамгийн оройтох хугацаа |
|---|---|---|---|
| B-02 | Багийн бүрэлдэхүүн ба R1-ийн хамрах хүрээ/огноо (PO-20, R-27) | PO + TL | 2026-10-12 (Sp0 planning) |
| B-03 | ✔ Схемийн хоёр алдаа засагдсан (2026-10-08). Үлдсэн нь: `Erp.Migrator`-ийн V-migration дэмжлэг | TL / platform | 2026-10-23 (Sp0 дуусах) |
| B-04 | Тенант үүсгэх endpoint ба нэвтрэлтийн хуудасны гэрээг батлах (TL-14) | TL + UX | 2026-10-21 (Sp1 refinement) |
| B-05 | Нягтлан зөвлөхтэй гэрээ байгуулах, ⚠ D-C3/D-C7-ийн эхний хариу (PO-21) | PO | 2026-10-23 |

---

## 9. 4 хүнтэй багийн Sp0/Sp1 санал (B-02-ийн шийдвэрт оруулах)

**Үүрэг:** (1) TL + ledger (50% код: posting, GL, review). (2) Backend: platform (auth, тенант, migrator, CI/DevOps). (3) Backend: tax + eBarimt (+ golden). (4) Frontend (SPA, UX-тэй хамт). QA ба DevOps-ийн ажлыг хуваана; нягтлан зөвлөх гаднаас.

**Багтаамж:** 3 × 14 + 7 = 49 SP, 20% нөөцтэй бол ≈ **39 SP** sprint-д (17 §1.3-ийн томьёо). Sp0 ≈ 30 SP (тохиргоо).

| Sprint | Story (SP) | Нийт |
|---|---|---:|
| **Sp0** | US-FND-001 (3), US-FND-002-ийн үлдэгдэл (2), US-FND-003-ийн үлдэгдэл: V-migration + V0001 (3), US-FND-004-ийн үлдэгдэл: Idempotency, `BusinessDate` (3), US-FND-006 SPA (5), US-FND-007 eBarimt skeleton (5), US-FND-008 CI ногоон + GHCR, staging-гүй (3), US-FND-014 DevTools + демо seed (5) | 29 |
| **Sp1** | US-PLT-001 (5), US-PLT-002 (8), US-PLT-011-ийн үлдэгдэл (3), US-GL-001 (5), US-GL-004/005-ын үлдэгдэл (5), US-GL-008 (2), US-TAX-001 (3), US-INT-001 (5) | 36 |
| Sp2 руу | US-PLT-004, US-FND-009, US-FND-012 ба 17-ийн Sp2 | — |

Энэ хэмнэлээр 17-ийн R1 (719 SP) ≈ 19–20 sprint үргэлжилнэ. Иймээс огноо эсвэл хамрах хүрээг PO шийднэ (PO-20).
