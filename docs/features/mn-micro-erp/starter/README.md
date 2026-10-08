# Starter файлууд — шинэ репозиторид хуулах загварууд

> Хамаарах баримт: [`../18-dev-setup.md`](../18-dev-setup.md) (хөгжүүлэлтийн орчин ба ажлын дэг)
> Огноо: 2026-10-06 · Хувилбарууд 2026-10-06-ны байдлаар nuget.org / Docker Hub / MCR дээрээс шалгагдсан

Энэ хавтасны бүтэц нь **шинэ репозиторийн root-ийн бүтэцтэй яг ижил**. Тиймээс хавтсыг бүхэлд нь шинэ репозиторийн root руу хуулна:

```bash
# шинэ (хоосон) репозиторийн root дотроос
cp -r <BCApps>/docs/features/mn-micro-erp/starter/. .
# (spec багцад локал build хийсэн бол bin/obj/TestResults ~400 MB хуулагдана; .gitignore commit-оос хасна, эсвэл:
#  rsync -a --exclude bin/ --exclude obj/ --exclude TestResults/ <BCApps>/docs/features/mn-micro-erp/starter/ .)
rm README.md        # энэ тайлбар файл шинэ репод хэрэггүй (эсвэл docs/ руу зөөнө)
git add -A && git commit -m "build: add repository scaffolding from starter"
```

Хуулсны дараа **заавал солих** зүйлс:

1. `.github/CODEOWNERS` — `@mn-erp/...` багуудыг жинхэнэ GitHub багуудаар солих.
2. `.github/workflows/cd.yml` — GitHub environment `staging` (deployment branch: `main`) / `production` (deployment tag: `v*`, 2 required reviewer)-д `vars` (`LOCAL_REGISTRY`, `APP_HOSTS`, `DB_HOST`, `APP_URL`) тохируулах; Монголын ДТ-д self-hosted runner бүртгэх (label: `mn-dc` + `staging`/`production`) ба runner host-ийг бэлдэх (18-dev-setup.md §11: `/etc/erp/secrets/migrator/`, `/etc/erp/posapi-instances.json`, SSH түлхүүр, registry login).
3. Branch ruleset (`main`): шууд push хориглох, PR заавал, 1 approval + Code Owners review, required checks: `ci-ok`, `two-approvals`; dismiss stale approvals; squash merge only; linear history.
4. (Сонголттой) GitHub Code Security лиценз байвал repo variable `CODEQL_ENABLED=true`.

## Sprint 0 walking skeleton (2026-10-08)

Starter нь одоо **compile хийгддэг, тестлэгдсэн walking skeleton**-ийг агуулна: posting engine-ийн гол зам (журнал → шалгалт → Npgsql-ээр нэг transaction-д бичих → буцаалт), НӨАТ-ын hook, migrator, unit/architecture/integration/golden тест. Sprint 1-ийн баг үүн дээр модуль нэмж эхэлнэ. Нэрс нь [18-dev-setup.md](../18-dev-setup.md) §2 ба канон схем ([../db/schema](../db/schema/), DECISIONS §K)-тэй ижил.

### Бүтэц

```text
Erp.slnx
src/
  Erp.Api/                         ASP.NET Core host: /health/live, /health/ready, G/L endpoint-ууд (http://localhost:5100)
  Erp.Worker/                      STUB host (/health/live) — outbox dispatcher, Quartz Sprint 1-д
  Erp.Migrator/                    өөрийн SQL-first runner (ADR-0014): db/schema + db/seed-ийг embed хийж, journal platform.schema_migration
  BuildingBlocks/
    Erp.BuildingBlocks.Domain/     shared kernel: Monetary/{MoneyMath (ADR-0006), Money, CurrencyCode, RoundingDirection}, Results/{Result, Result<T>, Error}
    Erp.BuildingBlocks.Application/ IBusinessCalendar (≈ IClock: TimeProvider + УБ-ын огноо), TenantScope, ITransactionalSession, ITenantTransactionRunner
    Erp.BuildingBlocks.Infrastructure/ TenantSession (BEGIN + platform.fn_set_context + timeout), runner, EmbeddedSql, health probe
    Erp.BuildingBlocks.Api/        DecimalStringJsonConverter (мөнгө = JSON string), ProblemDetails (errors[]), dev tenant header STUB
  Modules/GeneralLedger/{Contracts,Domain,Application,Infrastructure,Api}
                                   PostingDocument/IPostingService/ILedgerWriter/IReversibleLedger/IJournalVatHandler (Contracts),
                                   тэнцэл/бөөрөнхийлөлт/данс/үеийн дүрэм (Domain), журнал ба буцаалтын handler (Application),
                                   PostingEngine + ReversalService + Posting/Sql/*.sql (Infrastructure), Minimal API (Api)
  Modules/Tax/{Contracts,Domain,Infrastructure}
                                   VatLedgerLine, VatCalculator (gross арга), JournalVatHandler, VatEntryWriter (tax.vat_entry-д бичих ЦОРЫН ГАНЦ код)
tests/
  Unit/Erp.Tests.Unit              MoneyMath (tie, чиглэл, FsCheck: Σ хуваарилалт = нийт), VatCalculator, тэнцэл, үе, данс, JSON, db/ drift
  Architecture/Erp.Tests.Architecture  ArchUnitNET + reflection: давхарга, модулийн хил (зөвхөн *.Contracts), internal, double/float, ledger SQL эзэмшил, pragma
  Integration/Erp.Tests.Integration    бодит PostgreSQL + Erp.Api (WebApplicationFactory) + golden runner (Golden/)
  Golden/                          golden-scenario.schema.json (16 §11.6), Drafts/{gl,vat}/GS-*.json
tools/ci/                          sync-db.sh (spec-ийн db/ → db/), validate-golden.py (schema шалгалт)
db/                                schema/, seed/, tests/, apply.sh = spec багцын ../db-ийн хуулбар (drift-ийг unit тест барина); init/01-roles.sql
```

### Build, ажиллуулах, тест

Шаардлага: .NET 10 SDK (`global.json`: 10.0.100+), PostgreSQL 16+ (17/18 зөвлөмж). Бүх команд starter (= репо) root-оос:

```bash
dotnet restore                      # packages.lock.json-оор (CI: --locked-mode)
dotnet build -c Release             # TreatWarningsAsErrors: 0 warning байх ёстой
dotnet test                         # Unit + Architecture + Integration (доорх DB хэрэгтэй)

# Integration тестийн DB: ERP_TEST_DB (libpq "key=value" эсвэл Npgsql формат). Default:
#   host=localhost port=5432 user=postgres password=postgres dbname=erp_skeleton_test  (= deploy/docker-compose.yml, CI)
# Хэрэглэгч нь DB, role, extension үүсгэх эрхтэй (локал/CI superuser) байна. Тест бүр DB-г DROP/CREATE хийж,
# Erp.Migrator migrate + seed + verify ажиллуулаад, тест бүрд тусдаа компани provision хийнэ (fn_provision_company_mn).
ERP_TEST_DB="host=localhost port=5432 user=postgres password=postgres dbname=erp_skeleton_test" dotnet test

# Зөвхөн нэг төсөл / golden-ууд
dotnet test --project tests/Unit/Erp.Tests.Unit.csproj
dotnet test --project tests/Integration/Erp.Tests.Integration.csproj -- --filter-namespace Erp.Tests.Integration.Golden
python3 tools/ci/validate-golden.py # golden файлуудыг JSON Schema-аар (pip install jsonschema pyyaml)

# Схем ба MN seed (хоосон DB дээр; эхний migrate нь superuser-ээр — 000 нь role/extension үүсгэдэг)
dotnet run --project src/Erp.Migrator -- migrate --connection "Host=localhost;Port=5432;Database=erp;Username=postgres;Password=…"
dotnet run --project src/Erp.Migrator -- seed    --connection "…"   # legal_parameters + mn_* (дахин ажиллуулбал зөвхөн өөрчлөгдсөнийг)
dotnet run --project src/Erp.Migrator -- verify  --connection "…"   # checksum + db/tests/catalog_checks.sql
dotnet run --project src/Erp.Migrator -- info    --connection "…"

# API (provision хийсэн компани хэрэгтэй: db/README.md эсвэл tests/Integration/Infrastructure/PostgresFixture.cs-ийн SQL)
ConnectionStrings__App="Host=localhost;Port=5432;Database=erp;Username=erp_app;Password=erp_app_local" dotnet run --project src/Erp.Api
curl http://localhost:5100/health/ready
curl -X POST http://localhost:5100/api/v1/companies/<companyId>/gl/postings \
  -H 'Content-Type: application/json' -H 'X-Erp-Tenant-Id: <tenantId>' \
  -d '{"lines":[{"documentNo":"J-000001","postingDate":"2026-03-10","account":"7210","balAccount":"2650","amount":"1500000.00"}]}'
#  → 201 {"vouchers":[{"draftDocumentNo":"J-000001","documentNo":"GJ-2026-00001",…}],"glEntries":[…]}
#  …/gl/postings:preview (200, documentNo "***", ROLLBACK) · …/gl-transactions/{transactionNo}:reverse {"reasonCode":"REVERSAL"} (201)
```

Superuser login-оор (тест, локал туршилт) ажиллуулбал `Database:SessionRole=app_user` тохируулна — superuser RLS-ийг тойрдог тул session нь `set_config('role','app_user',true)`-аар app_user болно. Production нь `erp_app` (app_user-ийн гишүүн)-аар нэвтэрч энэ тохиргоог хоосон үлдээнэ.

### Хэрэгжсэн ба stub

| Хэсэг | Төлөв | Тайлбар |
|---|---|---|
| `MoneyMath` (AwayFromZero, Up/Down, `IsRounded`, running-remainder `Allocate`), `Money`, `CurrencyCode`, `Result`/`Error` | ✔ | ADR-0006; `Math.Round`-ийн цорын ганц зөвшөөрөгдсөн газар (architecture тест #7) |
| Posting engine: advisory lock (`platform.fn_lock_company_posting`), түгжээний доорх шалгалт (тэнцэл, бөөрөнхийлөлт, ≥2 мөр, POSTING/blocked/direct posting, OPEN үе + компанийн цонх, шалтгааны код, writer-ийн шалгалт), `fn_next_document_no` (GJ, gapless) + `fn_next_entry_no` (GL_REGISTER/TRANSACTION/ENTRY, VAT_ENTRY), `gl_transaction`/`gl_entry`/`gl_register` (unnest), `SET CONSTRAINTS ALL IMMEDIATE`, DB-ийн SQLSTATE → бизнесийн код | ✔ | 05-posting-engine §5.2, §5.5; нэг run = нэг transaction |
| Preview = ижил код + ROLLBACK (`***`, харьцангуй дугаар, `registerNo = null`) | ✔ | §5.12 |
| Журнал: ваучер = (баримтын №, огноо), BR-PST-27 дараалал, мөрийн тэнцэл, хоёр талт мөр (bal account), `POST …/gl/postings[:preview]` | ✔ (зөвхөн `GL_ACCOUNT` тал) | `CUSTOMER`/`VENDOR`/`BANK_ACCOUNT` тал — Parties/CashBank модультай (Sprint 1+) |
| НӨАТ: gross арга (`VAT = round(A×r/(100+r))`, суурь = A − VAT), VAT G/L мөр (`SystemDerived`), `tax.vat_entry` + `gl_entry_vat_entry_link` (суурь мөртэй), НӨАТ-ын үеийн шалгалт | ✔ (`NORMAL`, бүрэн хасагдах) | `REVERSE_CHARGE`, `FULL_VAT`, хасагдахгүй НӨАТ (D-E5) → тодорхой алдааны код буцаана |
| Буцаалт: эх огноо/дугаар, эсрэг тэмдэг (эсрэг багана, storno-гүй), `fn_ledger_update`-ээр `reversed`/`reversed_by_*`, бүх гүйлгээ нь буцсан register-ийг тэмдэглэх, VAT entry-ийн толин тусгал; давхар буцаалт 409, баримтаас үүссэнийг 409 (`gl.reversal_use_credit_memo`) | ✔ | §5.10; register бүхэлд нь буцаах, хаалттай үеийн залруулгын санал — Sprint 1 |
| `Erp.Migrator`: `migrate` / `seed` / `verify` (checksum + `catalog_checks.sql`) / `info`, journal `platform.schema_migration`, advisory lock, script бүр нэг transaction | ✔ | `reset`, `seed --set demo`, `lock_timeout` retry, `-- migrator: no-transaction`, `db/migrations/V####` — Sprint 1 |
| Нэвтрэлт, эрх (`RequirePermission`), `Idempotency-Key`, `ETag/If-Match`, ноорог журналын resource (`/journals/{id}:post`), OpenAPI, OTel, outbox, `Erp.Worker`, dimension, авлага/өглөг/банк writer | STUB / байхгүй | Tenant нь `X-Erp-Tenant-Id` header-ээс (`DevTenantHeaders` — зөвхөн локал/CI) |
| `audit.posting_log` | ✘ схемийн алдаанаас болж бичихгүй | доорх "Канон схемийн мэдэгдэж буй алдаа" #1 |
| Golden runner | ✔ (JSON, нэг компани, `journal.post/preview`, `transaction.reverse`; I-01, I-06, I-07, I-08; preview = post) | `extends`, `variants` (2027), YAML, хэрэглэгч/эрх, `*.actual.yaml` — Sprint 1 (`tests/Golden/Erp.Tests.Golden.csproj`); дэмжээгүй түлхүүр → `GS-E090` (хэзээ ч чимээгүй алгасахгүй) |

Golden файлууд `tests/Golden/Drafts/`-д `LEDGER_OWNER` гарын үсэгтэй (нягтлангийн гарын үсэггүй) байна: `GS-GL-016` (каталогоос), `GS-GL-021…024`, `GS-VAT-023` (skeleton-ий шинэ ID — 16 §12.2-ийн индекст `санал` төлөвтэй нөөцлөгдсөн (2026-10-08); нягтлан баталсны дараа `Scenarios/` руу зөөнө, TST-GS-03).

**Даалгаврын нэр ба энд хэрэглэсэн нэр:** `Erp.SharedKernel` → `src/BuildingBlocks/Erp.BuildingBlocks.Domain` (18 §2.1), `tests/Erp.UnitTests|IntegrationTests|ArchitectureTests` → `tests/{Unit,Integration,Architecture}/Erp.Tests.*` (`Directory.Build.props` нь `Erp.Tests.*`-д xUnit/IVT өгдөг), `tools/Erp.Migrator` → `src/Erp.Migrator` (18 §2.1, Dockerfile, ci.yml), `tests/golden/*.json` → `tests/Golden/{Scenarios,Drafts}/<area>/GS-*.json` (16 §11.2; JSON-ийг Z5 зөвшөөрнө). `Directory.Packages.props`-д `Microsoft.Extensions.DependencyInjection.Abstractions`, `.Options`, `.Logging.Abstractions` 10.0.12 нэмэгдсэн (shared framework-гүй class library-д); бусад хувилбар өөрчлөгдөөгүй, бүгд restore болсон.

### Канон схемийн мэдэгдэж буй алдаа (skeleton илрүүлсэн)

1. **`audit.posting_log`-д INSERT хийх боломжгүй.** `910_ledger_guards.sql` нь `platform.ledger_guard`-д бүртгэгдсэн, `company_id NOT NULL`-тэй хүснэгт бүрд `platform.fn_ledger_before_insert` trigger тавьдаг бөгөөд тэр нь `NEW.created_at := now()` оноодог; `audit.posting_log`-д `created_at` багана байхгүй (`started_at`/`finished_at` л бий) → `42703 record "new" has no field "created_at"`. Санал (schema change request): `audit.posting_log`-д `created_at timestamptz NOT NULL DEFAULT now()` нэмэх, эсвэл энэ хүснэгтийг `trg_<table>_before_insert`-ээс чөлөөлөх. Засагдтал engine posting log бичихгүй, structured log (`Posted …, lock wait N ms`) л бичнэ.
2. **`identity.user_credential.email_confirmed` алга** (13 CR-03-т хүссэн, `db/CHANGE_REQUESTS.md` #24 "хүлээн авсан" боловч DDL-д ороогүй). 13 §5.3-ын имэйл баталгаажуулалт ба `403 platform.email_not_verified` (US-PLT-001, Sprint 1) үүнээс хамаарна. Засвар: Sprint 1-ийн эхний migration-д `ALTER TABLE identity.user_credential ADD COLUMN email_confirmed_at timestamptz;` (../REVIEW-readiness.md B-03).
3. **`platform.tenant`-ийн анхдагч `plan_code = 'MICRO'`, `max_companies = 3`** — FR-PLT-001-ийн "Micro 1, Plus 3"-тай зөрнө; багцын каталог (`plan_code`-ийн CHECK) алга. Багцын бодлогыг PO шийднэ (../19-risks-open-questions.md PO-19).

### Мэдэгдэж буй API зөрүү (skeleton ↔ `../api/openapi.yaml`)

- `DecimalStringJsonConverter` нь бүх decimal-ийг төгсгөлийн тэггүй (`"1500000"`) бичдэг. 14 API-JSON-06 ба `Amount` schema-д **дүн валютын нарийвчлалаар** (`"1500000.00"`) гарна; нэгжийн үнэ, тоо хэмжээ, ханш, хувь л тэггүй. US-INT-001 (Sprint 1)-д `Amount`-ийн гаралтыг засна (2026-10-08-нд `dotnet run` + curl-ээр илэрсэн).
- `POST …/gl/postings[:preview]` нь skeleton-ий шууд posting endpoint; гэрээнд (`openapi.yaml`) ноорог журналын resource `…/journals/{id}:post` байна. US-GL-006 (Sprint 2) хүртэл түр, дараа нь устгах эсвэл гэрээнд нэмэх (../19 TL-14).

## Файл бүрийн тайлбар

| Файл | Зориулалт | Гол шийдвэр |
|---|---|---|
| `global.json` | .NET SDK-г түгжинэ | `10.0.100` + `rollForward: latestFeature` (10.0.x-ийн аль ч feature band); `test.runner = Microsoft.Testing.Platform` — xUnit v3 4.x нь MTP v2 дээр ажилладаг тул **заавал** |
| `Directory.Build.props` | Бүх .NET төслийн нийтлэг тохиргоо | `net10.0`, nullable, бүх warning = error, `latest-recommended` analyzer, code style build дээр, deterministic build, lock file + CI дээр locked restore, NuGet audit (high/critical = error), модулийн давхаргууд хоорондоо ба тестэд `InternalsVisibleTo`, ERP0001 analyzer-ийг `*.Domain` (`Erp.BuildingBlocks.Domain` орно)/Application/Contracts/модулийн Api-д холбоно, `Erp.Api`/`Erp.Worker`/`Erp.Migrator`/`Erp.DevTools`-д нэг `UserSecretsId`, `Erp.Tests.*` төслүүдэд xUnit v3 + Shouldly + coverage автоматаар |
| `Directory.Packages.props` | Central Package Management — бүх NuGet хувилбар нэг дор | Шалгагдсан хамгийн сүүлийн stable хувилбарууд (Npgsql/EF Core 10, OpenIddict, Quartz, QuestPDF, ClosedXML, OTel, KeyPerFile (`/run/secrets`), Compliance.Redaction, xUnit v3, Testcontainers, ArchUnitNET, FakeTimeProvider); MediatR, AutoMapper, FluentAssertions v8+, Duende-г **хориглосон** (лиценз). FluentValidation (built-in `AddValidation()`), гадаад migration runner (өөрийн `Erp.Migrator`, ADR-0014) нэмэхгүй |
| `BannedSymbols.txt` | Бүх төсөлд хориглосон API (RS0030) | `DateTime.Now/UtcNow/Today` → `TimeProvider` / `IBusinessCalendar`; `Guid.NewGuid` → `Guid.CreateVersion7()`; culture-гүй `decimal.Parse` |
| `BannedSymbols.Domain.txt` | Зөвхөн `*.Domain` (`Erp.BuildingBlocks.Domain` орно), `*.Application`, `*.Contracts` | бүх `Math.Round`/`decimal.Round` overload → `MoneyMath.Round(value, decimals)` (ADR-0006); `double`↔`decimal` хөрвүүлэлт. (`T:System.Double` нь зөвхөн `double.Parse` маягийн хандалтыг барина, үлдсэнийг ERP0001) |
| `tools/Erp.Analyzers/` | Өөрийн Roslyn analyzer (netstandard2.0) | **ERP0001**: мөнгөний кодонд `double`/`float`/`Half`-ийн зарлалт, local, cast, literal, далд хөрвүүлэлтийг build алдаа болгоно. Docker build-д ч хуулагдана |
| `.editorconfig` | C# кодын дүрэм | file-scoped namespace, built-in төрөлд `var` хориотой, `_camelCase` private field, `Async` suffix, CA1305 (IFormatProvider) = error, LoggerMessage заавал, UTF-8 + LF |
| `.gitignore` | Git-ээс хасах | build/node гаралт, IDE, **нууц** (`.env`, `*.pfx`, `appsettings.*.local.json`); `packages.lock.json`-ийг commit хийнэ |
| `.gitattributes` | Мөр төгсгөл | LF хаа сайгүй (migration checksum Windows/Linux дээр ижил байх ёстой) |
| `.dockerignore` | Docker build context | tests/docs/нууц файлуудыг image-д оруулахгүй |
| `.nvmrc` | Node хувилбар | `24` LTS (CI, Docker build ба локал; Node 22 нь 2027-04-30-нд EOL) |
| `nuget.config` | NuGet эх сурвалж | Зөвхөн nuget.org + package source mapping (dependency confusion-оос хамгаална) |
| `.config/dotnet-tools.json` | Локал dotnet tool | `nuget-license` (лицензийн шалгалт), `reportgenerator` (coverage тайлан) |
| `.vscode/extensions.json` | VS Code-ийн санал болгох өргөтгөл | 18-dev-setup.md §17 |
| `Erp.slnx`, `src/`, `tests/`, `tools/ci/` | Sprint 0 walking skeleton | Дээрх "Sprint 0 walking skeleton" хэсэг |
| `.github/workflows/ci.yml` | CI | build/format/OpenAPI drift + `oasdiff breaking`/unit/architecture → integration (PG17+18 service container, `ERP_TEST_DB`; Testcontainers Sprint 1-д) → golden (PG17 service; `validate-golden.py` + `tests/Integration`-ийн `Erp.Tests.Integration.Golden` namespace) → migrations (PG16/17/18: хоосон DB + өмнөх release-ээс (posted demo өгөгдөлтэй) upgrade + schema diff) → web (`api:gen` drift орно) → supply-chain (лиценз, audit, SBOM, gitleaks) → image → CodeQL (сонголттой) → `ci-ok` |
| `.github/workflows/cd.yml` | CD | staging: `main` ногоон болмогц автоматаар; production: `vX.Y.Z` tag-аас dispatch + 2 хүний зөвшөөрөл + freeze календарь (override шалтгаантай); Монголын ДТ доторх self-hosted runner; нууц нь `/run/secrets` файл; migrate → rolling deploy → smoke (`version` = image tag) |
| `.github/workflows/sensitive-review.yml` | Мэдрэмтгий замд 2 approval | GeneralLedger, Tax, EBarimt, модулиудын `Posting/`, `Revaluation/`, Numbering, Money, `db/migrations`, `Erp.Migrator`, golden scenario; `merge_group` дэмжинэ |
| `.github/actionlint.yaml` | actionlint тохиргоо | self-hosted runner-ийн `mn-dc`, `staging`, `production` label |
| `.github/dependabot.yml` | Dependency шинэчлэл | 7 хоног тутам, бүлэглэсэн (NuGet, npm, Actions, Docker) |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR загвар (монгол) | Ledger impact хүснэгт, мөнгө/DB/хувийн мэдээлэл/eBarimt checklist |
| `.github/CODEOWNERS` | Код эзэмшигч (жишээ) | Ledger, tax, eBarimt, migration, golden scenario-д тусгай баг. Заавал оролцох баг (tax, eBarimt, нягтлан) тухайн замд ганцаараа бичигдсэн (олон баг бичвэл аль нэг нь хангалттай болдог) |
| `deploy/docker-compose.yml` | Локал орчин | `postgres:17` (healthcheck, `../db/init` → initdb, `../db` → `/db`; PG18-д `ERP_PG_DATA_DIR`), OTel Collector, Jaeger v2, PosAPI mock (WireMock, port 7080), mailpit (`--profile extras`) |
| `deploy/otel-collector.yaml` | OTel Collector тохиргоо | OTLP 4317/4318 → **redaction**: `qrData`, `lottery`, нууц үг, токен, cookie, `X-API-KEY`, body, регистр/`civil_id`/`consumerNo` attribute-ийг **устгана** (hash биш); лог body-д `[REDACTED]` → Jaeger; logs/metrics → debug |
| `deploy/posapi-mock/mappings/*.json` | PosAPI 3.0 mock (WireMock stub) | `POST/DELETE /rest/receipt`, `/rest/info`, `/rest/sendData`, `/rest/bankAccounts`, `getInfo`; тусгай ТТД: `99999999901` → 40 сек timeout (UNKNOWN), `99999999902` → алдаа (REJECTED); `qrData`/`lottery` нь `QR-CANARY-`/`LOTTERY-CANARY-` canary. **Placeholder**: талбаруудыг албан ёсны PosAPI.yaml (v3.2.48)-тай тулгах |
| `deploy/docker/Dockerfile` | `api`, `worker`, `migrator` image | SPA-г `wwwroot` руу (Node 24); Ubuntu 24.04 + ICU + Noto font (PDF дахь Ө, Ү); non-root, read-only root FS-тэй ажиллахад бэлэн; `InformationalVersion` = image tag; migrator (`Erp.Migrator`) нь chiseled-extra |
| `db/init/01-roles.sql` | Локал/CI-ийн login role ба DB | Login role: `erp_owner` (NOLOGIN, DB эзэмшигч), `erp_migrator`, `erp_app`, `erp_worker`, `erp_ops_ro` — бүгд **NOBYPASSRLS**; DB `erp`, `erp_test`; нууц үгс зөвхөн локал. Эрхийг канон `000_extensions_roles.sql`-ийн group role (`app_owner`, `app_user`, `app_worker`, `app_readonly`, `app_ops`, `app_rls_bypass` — цорын ганц BYPASSRLS, NOLOGIN) агуулна (02-architecture §7.5, DECISIONS D-K6) |
| `tools/licenses/allowed-licenses.json` | NuGet лицензийн allow-list | MIT, Apache-2.0, BSD, ISC, LGPL (өөрчлөлтгүй, dynamic link) г.м. |
| `tools/licenses/ignored-packages.json` | Хянаж зөвшөөрсөн онцгой тохиолдол | `QuestPDF` — Community лиценз (жилийн орлого < USD 1M); босгыг давахаас өмнө төлбөртэй tier авна |

## PosAPI mock-ийн тусгай тохиолдлууд

| Мерчант ТТД (`merchantTin`) | Mock-ийн хариу | Хүлээгдэх систем үйлдэл |
|---|---|---|
| `37900846788` эсвэл бусад | 200, `status: SUCCESS`, 33 оронтой хуурамч ДДТД, canary `qrData`/`lottery` (`QR-CANARY-…`, `LOTTERY-CANARY-…`) | Outbox мөр `SENT`; `qrData`/`lottery` зөвхөн санах ойд, хэвлэхэд; canary утга DB/лог/trace-д олдвол тест унана |
| `99999999901` | 40 секунд хүлээгээд хариулна | Adapter timeout → `UNKNOWN`; **автомат retry хийхгүй**; operator UI-д гараар шийдвэрлэнэ |
| `99999999902` | 400, `status: ERROR` | `REJECTED`, алдааны мессеж хэрэглэгчид |

Mock-ийн stub-уудыг ажиллаж байхад нь шалгах: `curl http://localhost:7080/__admin/mappings`.

## Баталгаажуулалт

**Хоёр дахь (review) шалгалт, 2026-10-06** — ADR ба 02-architecture-тай нэгтгэсний дараа:

| Шалгалт | Хэрэгсэл | Үр дүн |
|---|---|---|
| Бүх YAML файл parse хийгдэнэ (7 файл: 3 workflow, `dependabot.yml`, `actionlint.yaml`, compose, collector) | `python3` + PyYAML | ✔ |
| Бүх JSON файл parse хийгдэнэ (`global.json`, tool manifest, 8 mock mapping, licence list ×2, VS Code) | `python3 -m json.tool` | ✔ |
| MSBuild props, `nuget.config` | XML well-formed (`xml.dom.minidom`) | ✔ |
| GitHub Actions workflow-ууд (`ci`, `cd`, `sensitive-review`) | `actionlint 1.7.12` + `shellcheck 0.11.0`, `.github/actionlint.yaml` | ✔ 0 алдаа |
| Action-уудын major tag (`checkout@v7`, `setup-dotnet@v6`, `setup-node@v7`, `upload-artifact@v7`, `build-push-action@v7`, `metadata-action@v6`, `setup-buildx/login@v4`, `scan-action@v7`, `sbom-action@v0`, `codeql-action@v4`) | `git ls-remote --tags` | ✔ бүгд байгаа |
| NuGet хувилбар бүр (`Directory.Packages.props`, tool manifest) nuget.org-д байгаа, хамгийн сүүлийн stable | nuget.org flat-container API | ✔ (`Microsoft.CodeAnalysis.CSharp 4.14.0`-ийг зориуд хуучнаар нь түгжсэн, Dependabot-д ignore) |
| Docker image tag-ууд (`postgres:17/18`, `otel/opentelemetry-collector-contrib:0.162.0`, `jaegertracing/jaeger:2.22.0`, `wiremock/wiremock:3.13.2`, `axllent/mailpit:v1.31`, `zricethezav/gitleaks:v8.30.1`, `tufin/oasdiff:v1.33.0`, `node:24-bookworm-slim`) | Docker Hub API | ✔ |
| `oasdiff breaking … --fail-on ERR` сонголт ба image-ийн entrypoint | oasdiff v1.33.0 эх код | ✔ |
| OTel Collector тохиргоо + redaction-ийн бодит тест (OTLP/HTTP-ээр лог илгээж, `qrData`/`lottery`/регистр/`consumerNo`/`x-api-key`/`set-cookie` устсан, body-д `[REDACTED]`) | `otelcol-contrib 0.162.0 validate` + ажиллуулж шалгасан | ✔ |
| Docker Compose (`ERP_PG_DATA_DIR`-тэй) | `docker compose config` | ✔ |
| `db/init/01-roles.sql` + канон 000-ийг superuser-ээр (2 удаа — idempotent) + канон 010…920-ийг `erp_migrator`-оор (superuser биш, `SET ROLE app_owner`) хэрэглэх; login role ↔ group role нэгтгэл; 18-dev-setup §3.2-ын шинэ хүснэгт/ledger загвар; `erp_app` контекстгүй query алдаа өгнө; `erp_ops_ro` бизнесийн хүснэгтэд хандахгүй (2026-10-08, PostgreSQL 16.15). Өмнө нь: `erp_owner` NOBYPASSRLS; FORCE RLS + `tenant_isolation` загварын fail-closed зан төлөв (контекстгүй query → `unrecognized configuration parameter`, өмнө нь local тохируулсан холболт → `invalid input syntax for type uuid`), `numeric(19,4)` Infinity татгалзана | PostgreSQL 16.15 (`psql -f`) | ✔ |
| `pg_dump --schema-only`-ийн `\restrict`/`\unrestrict` мөрийг CI-ийн шүүлтүүр арилгана | PostgreSQL 16.15 `pg_dump` | ✔ |
| `sensitive-review.yml`-ийн замын regex, `cd.yml`-ийн freeze календарь | bash, жишээ зам ба огноогоор | ✔ |
| .NET skeleton (2026-10-08): `dotnet restore` (мөн `--locked-mode`), bin/obj-гүй `dotnet build -c Release`, `dotnet test`, `dotnet format whitespace/style --verify-no-changes` | .NET SDK 10.0.401, PostgreSQL 16.15 | ✔ 19 төсөл, **0 warning, 0 error**; тест **125/125** (Unit 66, Architecture 38, Integration 21 = posting 11 + golden 6 + catalog 1 + runner self-test 3); format 0 өөрчлөлт |
| **Readiness review (2026-10-08):** `cp -r starter/.` → bin/obj-гүй шинэ хавтас → `dotnet restore --locked-mode`, `build -c Release --no-restore`, `format whitespace/style --verify-no-changes`, `dotnet test -c Release` | .NET SDK 10.0.401, PostgreSQL 16.15 | ✔ 0 warning/0 error; тест 125: **124 passed, 1 skipped** (`DatabasePackageDriftTests` — standalone репод `../db` байхгүй тул зориуд алгасна); `Erp.Migrator migrate/seed/verify/info` CLI, `Erp.Api` + curl `GJ-2026-00001`; `actionlint 1.7.12` (`detect` gate-тэй) 0 алдаа |
| Analyzer-ууд шинэ төслүүдэд идэвхтэй (түр файлаар): `double` → ERP0001, `DateTime.Now` → RS0030, `Math.Round` → RS0030 | build | ✔ бүгд build error |
| `Erp.Migrator migrate + seed` хийсэн хоосон DB дээр spec-ийн `db/tests/catalog_checks.sql`, `smoke.sql`, `seed_checks.sql` (psql) | PostgreSQL 16.15 | ✔ бүгд PASS (journal хүснэгт catalog шалгалтад нийцнэ); `verify` нь 28 script-ийн checksum + catalog checks |
| `Erp.Api` процессоор: `/health/ready` 200, `POST …/gl/postings` 201 (`GJ-2026-00001`), дүнг JSON number-ээр илгээхэд 400 | `dotnet run` + curl | ✔ |
| Golden файлууд `tests/Golden/golden-scenario.schema.json` (16 §11.6-аас яг хуулсан)-аар | `tools/ci/validate-golden.py` (jsonschema 4.26) | ✔ 6 файл, 0 зөрчил |
| `ci.yml` (integration/golden job-ийг skeleton-д тааруулсны дараа) | `actionlint` + `shellcheck 0.11.0` | ✔ 0 алдаа |

**Эхний шалгалт (starter-ийг бичихэд, 2026-10-06; тухайн үеийн нэрээр):** .NET SDK 10.0.401 дээр `restore --locked-mode`, `format whitespace/style --verify-no-changes`, `build -c Release` — 0 warning, 0 error (жишээ solution: `Erp.SharedKernel/Monetary/MoneyMath`, `Erp.Sales.Domain`, `Erp.Sales.Application`, `Erp.Tests.Unit`, `Erp.Analyzers`; давхаргын `InternalsVisibleTo` ажилласан); unit тест CI-ийн яг командаар (MTP, `--report-xunit-trx --coverage`) 5/5, TRX + Cobertura; сөрөг тест — `double`, `var x = 1.5`, cast, `Math.Sqrt`, `List<float>`, `Half`, `Math.Round`/`decimal.Round`, `DateTime.Now/UtcNow`, `Guid.NewGuid`, culture-гүй `ToString`/`Parse`, built-in `var` бүгд build error (ERP0001, RS0030, CA1305, MA0011, IDE0008); `nuget-license 4.0.18` allow-list (QuestPDF ignore-гүй бол унана); Docker build-ийн нөхцөл (`tools/` байхгүй үед `dotnet publish -p:RestoreLockedMode=true`).

Бичих явцад илэрч засагдсан зүйлс: (1) `Money` төрлийг `...Money` namespace-д байрлуулбал MA0049 алдаа гарна, тиймээс namespace нь `…Domain.Monetary`; (2) тест төсөлд `GenerateDocumentationFile=false` тавибал IDE0005 build алдаа өгнө, тиймээс `true` хэвээр; (3) `T:System.Double` ban нь зарлалт/literal-ийг барьдаггүй, тиймээс ERP0001 analyzer нэмсэн; (4) `job` context-ийг job-level `env`-д хэрэглэх боломжгүй, тиймээс step-level болгосон.

Review-ээр засагдсан гол зүйлс: `erp_owner`-ийн `BYPASSRLS`-ийг хассан (02-architecture §7.5); RLS fail-closed; нэршлийг батлагдсан ADR-уудтай нэгтгэсэн (`Erp.Migrator`, `TenantSession`, `AddValidation()`, `/run/secrets`); 2026-10-08-нд DB-ийн нэрсийг канон схемд ([../db/schema](../db/schema/), DECISIONS §K) нийцүүлсэн (`platform.*` domain/helper, `tenant_isolation`/`company_isolation`, group role `app_*`, `platform.schema_migration`, baseline = `db/schema/*.sql` хувилбаргүй хуулбар; `core.*`, `rls_<table>__tenant`, `erp_dispatch_definer` хасагдсан); staging smoke-ийн `version` зөрөх алдаа (image `InformationalVersion` = tag); production deploy-ийг tag-аас ажиллуулах ба freeze шалгалт; `oasdiff` ба `api:gen` drift; collector дахь регистрийн hash-ийг устгалаар солисон; demo seed ledger-т шууд бичихгүй (`demo-post`); Node 24; CODEOWNERS-ийн "аль нэг баг хангалттай" семантик; Dependabot-ийн EF/Npgsql бүлэг. Үлдсэн зөрүүг 18-dev-setup.md §19-д бичсэн.

`.NET` skeleton (`Erp.slnx`) бэлэн болсон тул `ci.yml`-ийн build/unit/architecture/integration/golden/migrations job-ууд шинэ репод шууд ажиллах ёстой (GitHub дээр хараахан ажиллуулаагүй). `web/` апп (PR #7) болон OpenAPI үүсгэлт хараахан байхгүй. 2026-10-08-аас `ci.yml`-ийн `detect` job нь `web/package-lock.json` байхгүй үед `web` job, supply-chain-ийн npm алхам ба `image` job-ийг **алгасна** (өмнө нь эдгээр унаж, `ci-ok` улаан болж PR #2–#6-г merge хийх боломжгүй байсан). SPA нэмэгдмэгц gate үргэлж true болно; хүсвэл устгана (../REVIEW-readiness.md B-01).
