# 18. Хөгжүүлэлтийн орчин, кодын дүрэм ба CI/CD (Developer setup)

> **Төлөв:** Хөгжүүлэлтэд бэлэн тодорхойлолт (development-ready spec). Энд бичсэн шийдвэрийг дагана. Өөрчлөх бол ADR бичиж tech lead-ээр батлуулна. Батлагдсан [ADR](./adr/README.md) ба [02-architecture.md](./02-architecture.md)-тай зөрвөл тэдгээр нь давуу; зөрүүг §19-д бүртгэнэ.
> **Огноо:** 2026-10-06
> **Уншигч:** бүх хөгжүүлэгч, DevOps, QA, golden scenario хянадаг нягтлан бодогч
> **Эх судалгаа:** [`research/tech-architecture.md`](./research/tech-architecture.md) (§3 мөнгө, §6 job, §11 тест, §12 observability, §13 CI/CD), [`research/mn-integrations-market.md`](./research/mn-integrations-market.md) (§2 eBarimt PosAPI 3.0, §2.5 туршилтын орчин)
> **Загвар файлууд:** [`starter/`](./starter/) — шинэ репозиторийн root руу шууд хуулна ([`starter/README.md`](./starter/README.md))

Энэ баримт нь шинэ хөгжүүлэгч **эхний өдрөө** код бичиж эхлэхэд хэрэгтэй бүх зүйлийг нэг дор өгнө. Үүнд: репозиторийн бүтэц, нэршил, мөнгөтэй ажиллах дүрэм, локал орчин, нууцын менежмент, git-ийн ажлын урсгал, Definition of Ready/Done, CI/CD, орчны матриц, тест өгөгдөл, eBarimt-ийн туршилтын орчин, onboarding болон алдаа засах заавар орно.

---

## 0. Товчоор: эхний 30 минут

> **Sprint 0-ийн бодит төлөв (2026-10-08, [REVIEW-readiness.md](./REVIEW-readiness.md)).** Доорх команд нь Sprint 1-ийн **зорилтот** төлөв. Starter-ээс хуулсан репод одоогоор `tools/Erp.DevTools`, `seed --set demo` (`db/seed/demo/`), `web/`, `Erp.Worker`-ийн outbox/Quartz, OpenIddict нэвтрэлт **байхгүй** — 3-р алхмын сүүлийн хоёр команд, 4-р алхмын SPA, "демо хэрэглэгч" ажиллахгүй. Эхний өдөр [§16.1](#161-sprint-0-skeleton--starter-д-бэлэн-2026-10-08)-ийн командуудыг ашиглана: `dotnet restore` → `dotnet build -c Release` → `docker compose -f deploy/docker-compose.yml up -d postgres` → `dotnet test` (integration-ийн default DB нь compose-ийн `postgres/postgres@localhost:5432`). Компани provision хийх SQL: [13 §5.3.1](./13-security-audit-tenancy.md).

```bash
# 0) Шаардлагатай хэрэгслүүд (§5.1): .NET 10 SDK, Node 24 LTS, Docker + Compose v2, psql 17
git clone git@github.com:mn-erp/erp.git && cd erp

# 1) Дэд бүтэц: PostgreSQL 17, OTel Collector, Jaeger, PosAPI mock
docker compose -f deploy/docker-compose.yml up -d

# 2) Локал нууц (зөвхөн локал нууц үг, §7)
dotnet tool restore
dotnet user-secrets --id mn-erp-local-dev set "ConnectionStrings:App"        "Host=localhost;Port=5432;Database=erp;Username=erp_app;Password=erp_app_local"
dotnet user-secrets --id mn-erp-local-dev set "ConnectionStrings:Worker"     "Host=localhost;Port=5432;Database=erp;Username=erp_worker;Password=erp_worker_local"
dotnet user-secrets --id mn-erp-local-dev set "ConnectionStrings:Migrations" "Host=localhost;Port=5432;Database=erp;Username=erp_migrator;Password=erp_migrator_local"

# 3) Схем ба демо өгөгдөл
dotnet run --project src/Erp.Migrator -- migrate --connection "Host=localhost;Port=5432;Database=erp;Username=postgres;Password=postgres"   # анх удаа: 000 (role, өргөтгөл) superuser шаарддаг
dotnet run --project src/Erp.Migrator -- migrate            # дараагийн удаа: ConnectionStrings:Migrations (erp_migrator)
dotnet run --project src/Erp.Migrator -- seed               # хууль журмын параметр + MN багц (db/seed/legal_parameters.sql, mn_*.sql)
dotnet run --project src/Erp.Migrator -- seed --set demo   # master data + ноорог баримт
dotnet run --project tools/Erp.DevTools -- demo-post        # ноорогуудыг posting engine-ээр батална (§13.2)

# 4) Backend (2 terminal) ба frontend
dotnet run --project src/Erp.Api        # http://localhost:5100  (health: /health/ready)
dotnet run --project src/Erp.Worker     # outbox dispatcher + Quartz jobs
cd web && npm ci && npm run dev         # http://localhost:5173  (API руу proxy хийнэ)

# 5) Тест
dotnet test --project tests/Unit/Erp.Tests.Unit.csproj
dotnet test --project tests/Architecture/Erp.Tests.Architecture.csproj
```

Trace-ийг http://localhost:16686 (Jaeger), PosAPI mock-ийн хүсэлтүүдийг http://localhost:7080/__admin/requests хаягаар харна. Демо хэрэглэгчдийн нэвтрэх нэр, нууц үг `db/seed/demo/README.md`-д байгаа. Эдгээр нь зөвхөн локал орчинд ажиллана.

---

## 1. Тогтсон шийдвэрүүд ба хөгжүүлэгчид үзүүлэх нөлөө

Доорх шийдвэрүүд **аль хэдийн гарсан**. Энэ баримт тэдгээрийг дахин хэлэлцэхгүй, харин өдөр тутмын ажилд юу гэсэн үг болохыг тайлбарлана.

| # | Шийдвэр | Хөгжүүлэгчийн өдөр тутмын ажилд |
|---|---|---|
| D1 | Монголын бичил бизнест (1–10 ажилтан) зориулсан **шинэ, бие даасан multi-tenant SaaS**. Business Central (BC)-ийн нягтлан бодох бүртгэлийн логик ба өгөгдлийн загварыг хялбаршуулж дахин хэрэгжүүлнэ. BC extension **биш**. | BC-ийн объектын нэр (G/L Entry, Cust. Ledger Entry, No. Series, Codeunit 12 "Gen. Jnl.-Post Line" г.м.)-ийг лавлагаа болгоно. Хүснэгт, класс нэрийг BC-ийн нэрээс гаргана (§3.2). |
| D2 | .NET 10 LTS, ASP.NET Core, C#. Aggregate ба CRUD-д EF Core 10 + Npgsql, posting ба тайланд raw SQL (Npgsql/Dapper). | Posting, тайлангийн SQL-ийг `.sql` файл болгон бичиж review хийнэ. EF-ийг master data ба баримтын draft-д хэрэглэнэ. |
| D3 | Мөнгө = `System.Decimal`; DB-д дүн `numeric(19,4)` (валютын нарийвчлалаар бөөрөнхийлсөн), ханш `numeric(38,18)`. | `double`/`float` ашиглавал build унана (ERP0001 analyzer). Бөөрөнхийлөлтийг зөвхөн `Money` туслахаар хийнэ (§4). |
| D4 | PostgreSQL 17 эсвэл 18; DDL 16+ дээр ажиллах ёстой. Migration-ыг гараар бичсэн SQL-ээр хийнэ (RLS, trigger орно); EF auto-migration хэрэглэхгүй. | PG18-ийн зөвхөн тусгай боломжийг (`uuidv7()`, `WITHOUT OVERLAPS`) DDL-д **шууд хэрэглэхгүй**. UUIDv7-г апп үүсгэнэ (`Guid.CreateVersion7()`); Канон DDL-ийн `DEFAULT gen_random_uuid()` нь зөвхөн гараар/seed-ээр оруулах мөрийн нөөц ([db/schema](./db/schema/)). Давхцалгүй хугацааг `btree_gist` exclusion constraint-ээр хамгаална. CI migration-ыг PG 16/17/18 дээр шалгана. |
| D5 | Shared schema. Бизнесийн мөр бүр `tenant_id` **ба** `company_id`-тай (BC "company" = tenant доторх тусдаа санхүүгийн дэвтэр). `tenant_id` дээр **FORCE** Row-Level Security (RLS) хоёрдогч хамгаалалт болно. | Query бүр `tenant_id`, `company_id`-аар шүүнэ. RLS-д найдаж шүүлтүүрээ орхихгүй. RLS нь **fail-closed**: `app.tenant_id` тохируулаагүй query 0 мөр биш, **алдаа** өгнө ([02-architecture.md](./02-architecture.md) §7.4). Шинэ хүснэгт бүрт RLS загвар заавал (§3.2). |
| D6 | Ledger хүснэгтүүд зөвхөн нэмэгдэнэ (append-only): UPDATE/DELETE эрх хураагдсан, guard trigger-тэй. Залруулгыг зөвхөн буцаалт (reversal)-аар хийнэ. Debit = Credit тэнцвэрийг DB шалгана. | Ledger мөрийг засах код бичихгүй. Алдааг reversal posting-оор засна. |
| D7 | Хууль ёсны баримтын дугаар нь BC No. Series-ийн утгаар **цоорхойгүй (gapless)** байна. Дугаарыг posting transaction дотор түгжсэн counter мөрөөс авна. Техникийн id нь UUIDv7. | Дугаарыг `INumberAllocator`-аар, зөвхөн posting transaction дотор авна. Sequence-ийг хууль ёсны дугаарт хэрэглэхгүй. |
| D8 | Posting нь синхрон: нэг posting = нэг DB transaction. Компани бүрээр PostgreSQL advisory lock-оор цуваа (serialize) болгоно. Урьдчилан харах (posting preview) нь ижил кодоор ажиллаад rollback хийнэ. | Posting-ийн код transaction-ийг өөрөө эхлүүлэхгүй. `IPostingService` удирдана. Preview-д зориулж тусдаа логик бичихгүй. |
| D9 | Modular monolith. Модулиуд: Platform, GeneralLedger, Tax, Parties, Sales, Purchases, CashBank, Currency, FixedAssets, Inventory, Reporting, EBarimt, Integration. Хил хязгаарыг architecture тест шалгана. | Өөр модулийн хүснэгт, дотоод классыг шууд ашиглахгүй. Зөвхөн `*.Contracts`-ээр харилцана (§2.4). |
| D10 | Transactional outbox + idempotency key. eBarimt PosAPI 3.0 adapter нь `POST /rest/receipt`-ийг **хэзээ ч автоматаар дахин илгээхгүй** (timeout ⇒ `UNKNOWN`, гараар шийднэ). `qrData`/`lottery`-г хадгалахгүй, логлохгүй (зөвхөн хэвлэнэ). | Гадагш чиглэсэн бүх дуудлага outbox-оор дамжина. eBarimt receipt-ийн `HttpClient`-д resilience/retry handler бүртгэхгүй (architecture тест). eBarimt-ийн хариуг лог/trace/DB-д бичихгүй (§3.6). |
| D11 | Хостинг Монголд. PosAPI зөвхөн Монголын IP-аас, дотоод сүлжээгээр хандагдана. Бид PosAPI instance-аа "оператор" болж өөрсдөө ажиллуулна (нэг instance-д ≤ 1000 мерчант). | CD нь Монголын дата төв (ДТ) доторх self-hosted runner-оор явна (§11). Локал болон CI-д PosAPI mock хэрэглэнэ. |
| D12 | Өөрийн outbox dispatcher (`FOR UPDATE SKIP LOCKED`) + хуваарьт ажилд Quartz.NET; PDF — QuestPDF; Excel — ClosedXML; Auth — ASP.NET Core Identity + OpenIddict (OIDC), SPA-д BFF cookie; Frontend — React + TypeScript + AG Grid Community, мөнгийг JSON-д string-ээр; OpenTelemetry; GitHub Actions + Testcontainers; pgBackRest + PITR. | Эдгээрийн оронд өөр сан нэмэх бол ADR бичнэ. Лицензийн allow-list-ийг CI шалгана (§10). |
| D13 | UI эхлээд монгол, дараа нь англи хэлтэй; i18n эхний өдрөөс. Дэвтэр MNT-ээр, санхүүгийн жил = хуанлийн жил. | Hard-coded UI текст байж болохгүй. `mn` ба `en` түлхүүрүүд ижил байхыг CI шалгана. |
| D14 | Нийцлийн шаардлага: Сангийн яамны зөвшөөрсөн программын жагсаалт (Сайдын 2018 оны 47-р тушаал), 10 жил хадгалалт, цахим анхан шатны баримтын тоон гарын үсэг, Хувь хүний мэдээлэл хамгаалах тухай хууль (2021). | Аудит лог, хадгалалт, хувийн мэдээллийн маск (§3.6), тоон гарын үсгийн цэгүүдийг DoD-д шалгана (§9). |

---

## 2. Репозиторийн бүтэц (repository layout)

### 2.1 Мод

Нэг репозитори (monorepo): backend, frontend, DB, тест, хэрэгсэл, баримт бүгд нэг дор. Solution файл нь `.slnx` форматтай (.NET 10-ийн default).

```text
erp/
├── .config/dotnet-tools.json            # nuget-license, reportgenerator
├── .github/
│   ├── CODEOWNERS
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── actionlint.yaml                  # self-hosted runner label-ууд (mn-dc, staging, production)
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml                       # §10
│       ├── cd.yml                       # §11
│       ├── sensitive-review.yml         # §8.3 (2 approval)
│       └── nightly.yml                  # E2E, PG16 бүрэн integration (Sprint 0-ийн дараа)
├── .vscode/extensions.json
├── .editorconfig  .gitattributes  .gitignore  .dockerignore  .nvmrc
├── BannedSymbols.txt  BannedSymbols.Domain.txt
├── Directory.Build.props  Directory.Packages.props  global.json  nuget.config
├── Erp.slnx
├── README.md
│
├── src/
│   ├── Erp.Api/                         # ASP.NET Core host: REST /api/v1, OpenIddict + BFF, SPA static (wwwroot)
│   ├── Erp.Worker/                      # ASP.NET Core host (BackgroundService): outbox dispatcher, Quartz.NET jobs, /health
│   ├── Erp.Migrator/                    # өөрийн SQL-first migration runner + seed loader (console; тусдаа image, ADR-0014)
│   ├── BuildingBlocks/
│   │   ├── Erp.BuildingBlocks.Domain/          # Monetary/ (Money, MoneyMath, CurrencyCode), strongly-typed id (UUIDv7), Result<T>, DomainError, DomainEvent, BusinessDate
│   │   ├── Erp.BuildingBlocks.Application/     # ICommandHandler/IQueryHandler, ITenantContext, ICompanyContext, ICurrentUser, IBusinessCalendar, ITransactionalSession, permissions
│   │   ├── Erp.BuildingBlocks.Infrastructure/  # NpgsqlDataSource, TenantSession (BEGIN + set_config), posting lock, outbox writer, idempotency store, EF conventions, OTel
│   │   ├── Erp.BuildingBlocks.Api/             # endpoint conventions, ProblemDetails, DecimalStringJsonConverter, Idempotency-Key filter, validation, OpenAPI transformers
│   │   ├── Erp.BuildingBlocks.Documents/       # QuestPDF-ийн нийтлэг компонент, фонт, дүнг үсгээр бичих (mn) — ADR-0019
│   │   └── Erp.BuildingBlocks.Testing/         # PostgresFixture (Testcontainers / external), test data builders, golden runner core
│   └── Modules/
│       ├── Platform/                    # tenancy, identity, numbering, audit
│       │   ├── Contracts/Erp.Platform.Contracts.csproj
│       │   ├── Domain/Erp.Platform.Domain.csproj
│       │   ├── Application/Erp.Platform.Application.csproj
│       │   ├── Infrastructure/Erp.Platform.Infrastructure.csproj
│       │   └── Api/Erp.Platform.Api.csproj
│       ├── GeneralLedger/               # ижил 5 давхарга (доор §2.3)
│       ├── Tax/
│       ├── Parties/
│       ├── Sales/
│       ├── Purchases/
│       ├── CashBank/
│       ├── Currency/
│       ├── FixedAssets/
│       ├── Inventory/
│       ├── Reporting/
│       ├── EBarimt/
│       └── Integration/
│
├── db/
│   ├── init/01-roles.sql                # зөвхөн локал/CI: login role ба database үүсгэнэ (superuser)
│   ├── schema/                          # baseline = канон 000_extensions_roles.sql … 920_views.sql (өөрчлөлтгүй; Erp.Migrator-т embedded)
│   ├── migrations/                      # baseline-ийн дараах өөрчлөлт: V0001__<module>_<desc>.sql …, R__rpt__trial_balance.sql
│   ├── tests/                           # catalog_checks.sql, smoke.sql, seed_checks.sql (канон)
│   ├── apply.sh                         # psql-ээр scratch DB-д суулгах (канон)
│   ├── seed/                            # legal_parameters.sql, mn_*.sql (канон MN багц, repeatable)
│   │   ├── demo/                        # S001__demo_tenant.sql ... + README.md (демо хэрэглэгчид)
│   │   └── README.md
│   └── README.md
│
├── web/                                 # React + TypeScript + Vite SPA
│   ├── package.json  package-lock.json  vite.config.ts  tsconfig.json  eslint.config.js
│   ├── public/
│   └── src/
│       ├── app/                         # router, layout, providers, auth (BFF)
│       ├── features/<module>/           # sales, purchases, gl, ... (дэлгэц, hook, component)
│       ├── shared/api/                  # openapi.json (build-ээс), schema.d.ts (openapi-typescript), client
│       ├── shared/money/                # Money branded string, formatMoney, decimal.js preview
│       ├── shared/grid/                 # AG Grid Community wrapper, mn locale
│       └── locales/{mn,en}/<module>.json
│
├── tests/
│   ├── Unit/Erp.Tests.Unit.csproj               # модуль бүрээр хавтас: Unit/GeneralLedger/..., property test (FsCheck)
│   ├── Architecture/Erp.Tests.Architecture.csproj
│   ├── Integration/Erp.Tests.Integration.csproj # Testcontainers PostgreSQL, WebApplicationFactory
│   ├── Golden/
│   │   ├── Erp.Tests.Golden.csproj
│   │   └── Scenarios/<area>/GS-<AREA>-<NNN>-<slug>.yaml
│   └── E2E/                                     # Playwright (TypeScript): package.json, playwright.config.ts, specs/
│
├── tools/
│   ├── Erp.Analyzers/                   # ERP0001: double/float/Half хориг (Roslyn analyzer, starter-т бэлэн)
│   ├── Erp.DevTools/                    # new-migration, new-scenario, demo-post, ebarimt-smoke, anonymize
│   ├── http/                            # *.http хүсэлтүүд (REST Client / Rider)
│   ├── licenses/                        # allowed-licenses.json, ignored-packages.json
│   └── ci/                              # CI-д хэрэглэх жижиг скриптүүд
│
├── deploy/
│   ├── docker-compose.yml               # локал орчин (§6)
│   ├── otel-collector.yaml
│   ├── posapi-mock/mappings/*.json      # WireMock stub
│   ├── docker/Dockerfile                # api / worker / migrator image
│   └── hosts/                           # app VM-ийн compose.yml (нууц → /run/secrets), .env.example (зөвхөн ERP_VERSION, LOCAL_REGISTRY г.м. нууцгүй утга) — Sprint 0 PR #9
│
└── docs/
    ├── adr/                             # ADR-0001-....md
    ├── specs/                           # энэ BCApps/docs/features/mn-micro-erp багцын хуулбар
    └── runbooks/                        # eBarimt UNKNOWN шийдвэрлэх, restore drill, deploy, break-glass
```

### 2.2 Модулийн жагсаалт

| Модуль | Хавтас / namespace угтвар | PostgreSQL schema | Хариуцлага | BC-ийн гол лавлагаа | Эзэмшигч баг |
|---|---|---|---|---|---|
| Platform | `src/Modules/Platform` / `Erp.Platform` | `platform`, `identity`, `audit` | tenant, company, хэрэглэгч ба эрх (Identity + OpenIddict), дугаарлалт, аудит лог, хавсралт, тоон гарын үсгийн бүртгэл | Company, User Setup, No. Series (T308/T309), Change Log | platform (Numbering — ledger-owners) |
| GeneralLedger | `GeneralLedger` / `Erp.GeneralLedger` | `gl` | дансны төлөвлөгөө, санхүүгийн үе, журнал, **posting engine** (`IPostingService`), G/L бичилт, register, dimension | T17 G/L Entry, T45 G/L Register, T81 Gen. Journal Line, CU12 Gen. Jnl.-Post Line | ledger-owners |
| Tax | `Tax` / `Erp.Tax` | `tax` | НӨАТ, НХАТ код, posting setup, хугацаатай (effective-dated) параметр, VAT entry, татварын тайлан | T254 VAT Entry, VAT Posting Setup | tax-owners |
| Parties | `Parties` / `Erp.Parties` | `party` | харилцагч (customer), нийлүүлэгч (vendor), posting group ба General Posting Setup, ТТД шалгалт, хувийн мэдээллийн маск/шифрлэлт, **авлага/өглөгийн ledger** (D-K2) ба open entry, тооцоо хаах (application) | T18 Customer, T23 Vendor, T21/T379, T25/T380 | platform (+ ledger review) |
| Sales | `Sales` / `Erp.Sales` | `sales` | үнийн санал, нэхэмжлэх, credit memo (ноорог ба posted баримт), posting баримт угсралт | T36/T37, T112, CU80 Sales-Post | sales баг (+ ledger review) |
| Purchases | `Purchases` / `Erp.Purchases` | `purchase` | худалдан авалтын нэхэмжлэх, credit memo, оролтын НӨАТ-ын баримт тулгалт | T38/T39, T122, CU90 Purch.-Post | purchases баг |
| CashBank | `CashBank` / `Erp.CashBank` | `bank` | касс, банкны данс, төлбөр, хуулга импорт, тулгалт, МХ-1/МХ-2 | T270, T271 Bank Account Ledger Entry | cashbank баг |
| Currency | `Currency` / `Erp.Currency` | `fx` | валют, Монголбанкны ханш, ханшийн тэгшитгэл (revaluation) | T4 Currency, T330 Currency Exchange Rate | ledger-owners |
| FixedAssets | `FixedAssets` / `Erp.FixedAssets` | `fa` | үндсэн хөрөнгө, элэгдэл (санхүүгийн ба татварын дэвтэр) | T5600, T5601 FA Ledger Entry | ledger-owners |
| Inventory | `Inventory` / `Erp.Inventory` | `inv` | бараа (минимал), байршил, item ledger, өртөг | T27 Item, T32 Item Ledger Entry | inventory баг |
| Reporting | `Reporting` / `Erp.Reporting` | `rpt` | санхүүгийн тайлан (Маягт А-ийн мөр, Account Schedule), e-balance экспорт, PDF (QuestPDF), Excel (ClosedXML); бусад модулийг зөвхөн view/read-ээр | Trial Balance, Account Schedules | reporting баг |
| EBarimt | `EBarimt` / `Erp.EBarimt` | `ebarimt` | PosAPI pool, баримт угсрах, outbox handler, баримтын лог (`qrData`/`lottery`-гүй), лавлах өгөгдөл | E-Document (санаа) | ebarimt-owners |
| Integration | `Integration` / `Erp.Integration` | `integration` (+ `quartz` store) | outbox, inbox, idempotency, job_definition/job_run, Quartz job store, вэбхүүк | Job Queue Entry | platform |

Schema-ийн нэрийн **эх сурвалж нь канон схем [`db/schema/*.sql`](./db/schema/)** ([DECISIONS](./DECISIONS.md) D-K1); [`02-architecture.md`](./02-architecture.md) §4.1–§4.2 ба §5.1-ийн модуль ↔ схемийн харгалзаа энэ хүснэгттэй ижил. C# модулийн нэр (хавтас, namespace) нь BC-ийн функциональ нэртэй (`Parties`, `CashBank`, `Currency`), схем нь богино (`party`, `bank`, `fx`) байж болно. Бүх модульд хамаарах SQL объект нь **`platform`** schema-д байна; тусдаа `core`/`ops` схем байхгүй. Үүнд мөнгөний domain-ууд (`platform.amount`, `platform.unit_amount`, `platform.quantity`, `platform.percent`, `platform.exch_rate`, §4.1), контекст функц (`platform.fn_set_context`, `platform.current_tenant_id()`, `platform.current_company_id()`), posting түгжээ (`platform.fn_lock_company_posting`), дугаарлалт (`platform.fn_next_document_no`, `platform.fn_next_entry_no`), ledger guard (`platform.fn_guard_immutable`, `platform.fn_ledger_before_insert`, `platform.fn_ledger_update`, каталог `platform.ledger_guard`) ба migration-ий журнал `platform.schema_migration` (migrator үүсгэнэ) орно. Аудитын trigger функц нь `audit.fn_row_change`. Эдгээрийг baseline (канон `db/schema/000…920`, өөрчлөлтгүй) үүсгэнэ (§3.3, §16 PR #4). Permission-ийн угтвар нь схемийн нэр (`party.customer.apply`, `bank.payment.post`).

### 2.3 Модулийн доторх давхарга

| Давхарга | Төсөл | Агуулга | Харагдах байдал |
|---|---|---|---|
| Contracts | `Erp.<M>.Contracts` | бусад модульд нээлттэй interface (`IPostingService`, `ILedgerWriter<T>`), DTO, integration event (`SalesInvoicePosted`), permission нэр | `public`, XML doc заавал |
| Domain | `Erp.<M>.Domain` | aggregate, value object, domain service, domain event, invariant (жишээ нь `JournalTransaction`: Σ debit = Σ credit) | `internal` default |
| Application | `Erp.<M>.Application` | command/query handler, use case, авторизаци, transaction-ийн хил, `PostingDocument` угсралт | `internal` default |
| Infrastructure | `Erp.<M>.Infrastructure` | EF `DbContext` (тухайн schema), raw SQL (`Sql/*.sql` embedded resource), repository, гадаад adapter, `Add<M>Module()` DI бүртгэл | `internal` + `public static class <M>Module` |
| Api | `Erp.<M>.Api` | Minimal API endpoint (`Map<M>Endpoints()`), request/response DTO, .NET 10-ийн built-in validation (`AddValidation()`, DataAnnotations атрибут), OpenAPI мета | `internal` + `public static` map функц |

MediatR, AutoMapper ашиглахгүй (лицензийн түлхүүр шаарддаг). Handler-ийг модулийн `Add<M>Module()` дотор шууд DI-д бүртгэнэ. Mapping-ийг гараар бичнэ.

### 2.4 Хамаарлын дүрэм ба architecture тест

```text
Erp.Api / Erp.Worker (composition root)  ──►  бүх модулийн Api + Infrastructure
Erp.<M>.Api             ──►  Erp.<M>.Application, Erp.<M>.Contracts, Erp.BuildingBlocks.Api
Erp.<M>.Infrastructure  ──►  Erp.<M>.Application, Erp.<M>.Domain, Erp.BuildingBlocks.Infrastructure, Erp.<N>.Contracts
Erp.<M>.Application     ──►  Erp.<M>.Domain, Erp.<M>.Contracts, Erp.BuildingBlocks.Application, Erp.<N>.Contracts
Erp.<M>.Domain          ──►  Erp.BuildingBlocks.Domain   (өөр юу ч биш)
Erp.<M>.Contracts       ──►  Erp.BuildingBlocks.Domain   (Money, id төрөл)
```

`tests/Architecture` (ArchUnitNET, xUnit v3) дараах дүрмийг шалгана. Аль нэг нь зөрчигдвөл CI унана:

1. `*.Domain` нь EF Core, Npgsql, Dapper, ASP.NET Core, Quartz, `System.Net.Http`-ээс хамаарахгүй.
2. `*.Application` нь ямар ч модулийн `Infrastructure`/`Api`-аас хамаарахгүй.
3. `Erp.<M>.*` нь өөр модулийн зөвхөн `Erp.<N>.Contracts`-ийг ашиглана. Аль модулийн Contracts-ийг reference хийж болохыг [02-architecture.md](./02-architecture.md) §4.3-ийн хамаарлын матриц тодорхойлно (`Dependency_matrix_matches`).
4. `*.Api` нь `*.Infrastructure`-ээс хамаарахгүй.
5. `gl.gl_entry`, `gl.gl_transaction`, `gl.gl_register`-д `INSERT` хийдэг SQL зөвхөн posting engine-ий namespace-д (`Erp.GeneralLedger.Infrastructure.Posting`) байна. Бусад ledger-ийн (`vat_entry`, `*_ledger_entry`, `detailed_*`) `INSERT` зөвхөн тухайн модулийн `ILedgerWriter<T>` хэрэгжүүлэлтэд байна. Ledger хүснэгтийн нэртэй `UPDATE`/`DELETE` SQL кодын санд байхгүй. Тест embedded `.sql` resource болон string literal-ийг шалгана.
6. `Erp.BuildingBlocks.Domain`, `*.Domain`, `*.Application`, `*.Contracts`, модулийн `*.Api` DTO-д `double`/`float`/`Half` төрлийн field, property, parameter байхгүй. Үүнийг build үед ERP0001 analyzer (§4.2) барьдаг. Тест нь reflection-оор давхар шалгана.
7. `#pragma warning disable RS0030` зөвхөн `Erp.BuildingBlocks.Domain/Monetary/MoneyMath.cs` дотор байж болно. `#pragma warning disable ERP0001` хаана ч байж болохгүй.
8. Модулийн `Domain`/`Application`/`Infrastructure` төслийн type-ууд `internal` байна. Онцгой тохиолдлыг allow-list-ээр (`<M>Module`, endpoint map) зөвшөөрнө.
9. Handler нь `sealed`, нэр нь `*Handler`-ээр төгсөнө. Endpoint бүр permission-тэй (`RequirePermission("<module>.<resource>.<action>")`) эсвэл ил `AllowAnonymous`; allow-list: `/health/*`, `/connect/*`, `/bff/login`.
10. POST/PUT/PATCH/DELETE endpoint бүр `Idempotency-Key` filter-тэй. Үл хамаарах endpoint-ийг кодонд нэрээр жагсаана (`…/post-preview`, `/connect/*`, `/bff/*`).
11. EF model-д `QrData`/`Lottery` нэртэй property байхгүй. Энэ нь integration тест: `DbContext.Model`-ийг шалгаад, мөн `information_schema.columns`-оос `%qr%`, `%lottery%` баганыг хайна.
12. eBarimt receipt-ийн (`POST`/`DELETE /rest/receipt`) named `HttpClient`-д resilience/retry handler бүртгэгдээгүй (`Ebarimt_receipt_client_has_no_retry`). `Microsoft.Extensions.Http.Resilience`-ийг зөвхөн GET (`/rest/info`, `sendData`, лавлах) client-д хэрэглэнэ.
13. Модулиуд `NpgsqlDataSource`-ийг шууд inject хийхгүй. DB руу зөвхөн `TenantSession`-оор (`ITransactionalSession`) хандана.
14. `PrintOnly<T>` (`qrData`, `lottery`) төрлийг logger-ийн аргумент болгож дамжуулахгүй (`No_sensitive_types_in_logs`).

Эдгээр нь [02-architecture.md](./02-architecture.md) §5.4-ийн жагсаалтыг бүрэн агуулна.

---

## 3. Нэршил ба кодын дүрэм (conventions)

### 3.1 C#

| Сэдэв | Дүрэм |
|---|---|
| Хэл, хэв маяг | C# latest, file-scoped namespace, namespace = хавтасны зам (`Erp.Sales.Domain.Invoices`). Нэг файлд нэг public/internal type (файлын нэр = type нэр). Allman хаалт. Бүгдийг `.editorconfig` ба build шалгана. |
| `var` | Built-in төрөлд (`decimal`, `int`, `string`, `bool`) **хориотой**: `decimal total = 0m;`. Учир нь `var total = 0;` нь `int`, `var x = 1.5;` нь `double` болдог. Бусад тохиолдолд төрөл илэрхий бол `var` хэрэглэнэ. |
| Нэршил | Type, method, property — `PascalCase`; private/internal field — `_camelCase`; parameter, local — `camelCase`; interface — `IName`; async method — `...Async`; const — `PascalCase`. Тест нэр: `Method_State_Expected`. |
| Харагдах байдал | Default нь `internal sealed`. `public` зөвхөн `Contracts`-д болон модулийн бүртгэлийн класст. `record`-ийг DTO, command, event, value object-д хэрэглэнэ. |
| Async | I/O хийдэг бүх зүйл async байна. `CancellationToken ct` хамгийн сүүлийн parameter (CA1068), дуудлага бүрт дамжуулна (CA2016 = error). `.Result`/`.Wait()` хэрэглэхгүй. |
| Цаг хугацаа | `DateTime.Now/UtcNow/Today`, `DateTimeOffset.Now/UtcNow` хориотой (RS0030). Техникийн цагийг inject хийсэн `TimeProvider`-оос (`GetUtcNow()`) авна; тестэд `FakeTimeProvider` хэрэглэнэ. Бизнесийн огноог (`posting_date`, `document_date`) `IBusinessCalendar` (`Erp.BuildingBlocks.Application`) өгнө: `DateOnly`/`BusinessDate`, Улаанбаатарын (Asia/Ulaanbaatar) хуанлийн огноо. Техникийн цаг нь `DateTimeOffset` (UTC). |
| Id | `Guid.NewGuid()` хориотой. UUIDv7-г `Guid.CreateVersion7()`-оор үүсгэнэ (D-C8); DB-ийн `DEFAULT gen_random_uuid()` нь зөвхөн гараар/seed-ээр оруулахад. Domain-д strongly-typed id: `readonly record struct CustomerId(Guid Value)`. |
| Алдаа | Хүлээгдэж буй бизнесийн алдаа (хаагдсан үе, хүрэлцэхгүй үлдэгдэл) нь `Result<T>` / `Error(code)` болно. `code` нь тогтвортой англи түлхүүр (`gl.period_closed`), UI-д орчуулна. Exception зөвхөн bug болон дэд бүтцийн алдаанд. |
| Validation | Request-ийн хэлбэрийг Api давхаргад .NET 10-ийн built-in Minimal API validation-оор (`builder.Services.AddValidation()`, DataAnnotations атрибут ба `IValidatableObject`) шалгана. Нэмэлт сан (FluentValidation г.м.) хэрэглэхгүй. Бизнесийн invariant Domain-д. Command-ийн endpoint filter-ийн дараалал: Authorization → Validation → Idempotency → `TenantSession` (BEGIN + `set_config`) → Handler → Commit → post-commit hook ([02-architecture.md](./02-architecture.md) §5.3). |
| Лог | Source-generated `[LoggerMessage]` (CA1848 = error), template тогтмол (CA2254), placeholder `PascalCase`. Хувийн мэдээлэл, `qrData`/`lottery`, токен логлохгүй (§3.6). |
| Culture | Тоо, огноог хадгалах, дамжуулахдаа `CultureInfo.InvariantCulture` (CA1305 = error). `mn-MN` culture-ийг зөвхөн PDF, Excel, UI-д харуулахад хэрэглэнэ. |
| Feature flag | `Microsoft.FeatureManagement`: `FeatureManagement:<Flag>` тохиргоо + tenant-ийн filter. Дуусаагүй ажлыг flag-ийн ард merge хийнэ. |
| Хориотой сан | MediatR, AutoMapper (лицензийн түлхүүр шаарддаг болсон), FluentAssertions v8+ (арилжааны төлбөртэй), Duende IdentityServer (төлбөртэй), Newtonsoft.Json (System.Text.Json хэрэглэнэ), Serilog (built-in logging + OpenTelemetry). |

### 3.2 SQL ба өгөгдлийн сан

**Нэршил**

| Объект | Дүрэм | Жишээ |
|---|---|---|
| Schema | модуль бүрт нэг, богино `snake_case`; эх сурвалж [db/schema](./db/schema/) (D-K1, [02-architecture.md](./02-architecture.md) §4.1) | `platform` (нийтлэг domain, helper, counter, журнал), `identity`, `audit`, `gl`, `tax`, `party`, `sales`, `purchase`, `bank`, `fx`, `fa`, `inv`, `rpt`, `ebarimt`, `integration`; + Quartz-ийн `quartz` store |
| Хүснэгт | ганц тоо, `snake_case`, BC нэрээс товчлолыг хадгална | `gl.gl_entry` (T17), `gl.gl_register` (T45), `tax.vat_entry` (T254), `party.cust_ledger_entry` (T21), `party.detailed_cust_ledger_entry` (T379), `platform.number_series_line` (T309) |
| Багана | `snake_case`; BC талбараас: "Document No." → `document_no`, "Amount (LCY)" → `amount_lcy` | `posting_date`, `document_no`, `amount`, `amount_lcy`, `vat_base_amount` |
| Эхний баганууд | `tenant_id uuid NOT NULL`, `company_id uuid NOT NULL` (бизнесийн мөр бүрт) | |
| Түлхүүр | aggregate ба ledger мөр: `id uuid PRIMARY KEY` (UUIDv7, апп үүсгэнэ) + composite FK-ийн зорилт `UNIQUE (company_id, id)`. Ledger-ийн `entry_no`, `transaction_no`, `gl_register_no` нь компани бүрээр **цоорхойгүй** бөгөөд posting transaction дотор `platform.fn_next_entry_no(ledger, n)` → `platform.ledger_counter`-оос олгогдоно (D-K3, [02-architecture.md](./02-architecture.md) §6.6). Ledger-т `IDENTITY`/`SEQUENCE` хэрэглэхгүй (rollback-д цоорхой үүсгэдэг). FK нь `(tenant_id, company_id) → platform.company (tenant_id, id)`, бусад рүү `(company_id, x_id)`; бизнесийн index `company_id`-аар эхэлнэ | `id uuid PRIMARY KEY`, `UNIQUE (company_id, entry_no)`, `UNIQUE (company_id, id)` |
| Огноо, цаг | бизнесийн огноо → `date`; техникийн цаг → `timestamptz` (UTC); `created_at`, `created_by` | |
| Boolean | `is_`/`has_` угтвартай | `is_reversed`, `has_attachments` |
| Enum маягийн утга | `text` + `CHECK (... IN (...))`; PostgreSQL `ENUM` төрөл хэрэглэхгүй (өөрчлөхөд хүнд) | `status text CHECK (status IN ('PENDING','SENT','REJECTED','UNKNOWN','RESOLVED'))` |
| Constraint | Канон схем PK/UNIQUE/FK/CHECK-ийг ихэнхдээ нэргүй (PostgreSQL-ийн автомат нэр) тодорхойлдог; нэр өгөх бол `pk_<table>`, `fk_<table>__<ref_table>`, `uq_<table>__<cols>`, `ck_<table>__<rule>`, `ex_<table>__<cols>` (exclusion) | `ck_gl_entry__amount_sign` |
| Index | `ix_<table>__<col1>_<col2>`; unique index `ux_<table>__<what>` | `ix_general_ledger_setup__dim1`, `ux_bank_statement_line__dedupe` |
| Trigger / функц | trigger: `trg_<table>_<what>` (нэг доогуур зураас, канон схемтэй ижил); функц (trigger функц орно): `<schema>.fn_<verb>_<noun>` | `trg_gl_entry_immutable`, `trg_gl_entry_no_truncate`, `trg_gl_entry_before_insert`, `trg_gl_entry_balanced`, `trg_<table>_audit`, `platform.fn_guard_immutable()`, `gl.fn_check_transaction_balanced()` |
| RLS policy | канон нэр ([900_rls.sql](./db/schema/900_rls.sql), [ADR-0004](./adr/ADR-0004-shared-schema-multitenancy-rls.md)): `tenant_isolation` (тенантын хүснэгт бүр), `company_isolation` (RESTRICTIVE, `company_id NOT NULL`), `tenant_read_system` (системийн NULL-tenant мөрийг уншуулах) | `CREATE POLICY tenant_isolation ON sales.sales_header …` |
| Мөнгө, ханш | `platform.amount`, `platform.unit_amount`, `platform.quantity`, `platform.percent`, `platform.exch_rate` domain-оор (§4.1, [ADR-0006](./adr/ADR-0006-money-and-rounding.md), D-C1). `money`, `real`, `double precision` төрлийг **хэзээ ч** хэрэглэхгүй | |
| `jsonb` | зөвхөн аудит, outbox payload, тохиргоонд. Тооцоонд орох дүнг `jsonb`-д хадгалахгүй | |
| Collation | DB default нь `C.UTF-8` (code point дараалал). Локал/CI-д libc `C.UTF-8`; prod-ийн PG17+ кластерт `initdb --locale-provider=builtin --builtin-locale=C.UTF-8` (OS/glibc шинэчлэлтээс бүрэн хамааралгүй, collation version анхааруулга гардаггүй). Монгол цагаан толгойн эрэмбийг `ORDER BY name COLLATE "mn-x-icu"`-ээр хийнэ (Ө, Ү зөв байрлалд) | |

**Бичих хэв маяг**

- SQL түлхүүр үгийг ТОМ үсгээр, identifier-ийг жижиг үсгээр бичнэ. 4 зай; багана бүр тусдаа мөрөнд.
- Объект бүрийг schema-тай нь бичнэ (`gl.gl_entry`). Апп-ийн кодонд `SELECT *` бичихгүй, `INSERT`-ийн баганын жагсаалт заавал.
- Зөвхөн parameter-тэй query (Dapper `@tenantId`). SQL string залгахгүй.
- RLS байгаа ч query бүрт `WHERE tenant_id = @tenantId AND company_id = @companyId` бичнэ. RLS нь шүүлтүүр биш, хамгаалалт. Мөн index-ийг ашиглахад шаардлагатай.
- Posting, тайлангийн SQL нь `Infrastructure/Sql/<verb>_<object>.sql` embedded resource байна (жишээ: `insert_gl_entries.sql`). Ингэснээр diff-д харагдана, тестлэгдэнэ.
- Transaction: команд нь `READ COMMITTED`, тайлан нь `REPEATABLE READ READ ONLY`. Transaction-ийг зөвхөн `TenantSession` нээнэ (Worker-т `TenantScope.RunAsync`, компани тус бүрээр). Тэр эхлээд `set_config('app.tenant_id' | 'app.company_id' | 'app.user_id' | 'app.request_id', …, true)`, `SET LOCAL lock_timeout = '5s'`, `SET LOCAL statement_timeout = '30s'`-ийг тохируулна ([02-architecture.md](./02-architecture.md) §7.3). Үүнийг `platform.fn_set_context(tenant, company, user, request)` нэг дуудлагаар хийнэ. Гараар `set_config` дуудахгүй, `NpgsqlDataSource`-ийг модульд шууд inject хийхгүй. Контекст тохируулаагүй query RLS-ээр **алдаа** өгнө (fail-closed).
- Posting-ийн түгжээний дараалал (deadlock-оос сэргийлнэ): (1) `SELECT platform.fn_lock_company_posting(tenant_id, company_id)` (дотроо `pg_advisory_xact_lock`); (2) хууль ёсны дугаар `platform.fn_next_document_no(series_code, date)` (цувралын мөрийг `FOR UPDATE` түгжинэ), олон цуврал бол тогтмол дарааллаар (`series_code`); (3) ledger-ийн дугаар `platform.fn_next_entry_no(ledger, n)` (`platform.ledger_counter`); (4) insert. Үе хаах, ханшийн дахин үнэлгээ, элэгдлийн run ижил түгжээ авна ([02-architecture.md](./02-architecture.md) §6.5).

**Шинэ tenant хүснэгтийн загвар** (baseline-ийн дараах migration бүрт хуулна). Baseline-д [900_rls.sql](./db/schema/900_rls.sql), [910_ledger_guards.sql](./db/schema/910_ledger_guards.sql), [140_integration_audit.sql](./db/schema/140_integration_audit.sql) нь RLS, guard, audit trigger-ийг **нэг удаагийн loop**-оор үүсгэдэг тул шинэ хүснэгтэд эдгээрийг ил бичнэ ([ADR-0014](./adr/ADR-0014-sql-first-migrations.md), RLS [02-architecture.md](./02-architecture.md) §7.4):

```sql
-- Module: Sales · Ticket: ERP-123 · Expand/contract: expand · Rollback: forward-fix only
-- V0042__sales_create_sales_quote_header.sql   (R3-ийн жишээ хүснэгт)
-- lock_timeout = 5s, statement_timeout = 15min-ийг runner тохируулдаг (§3.3). Runner SET ROLE app_owner хийсэн байна.

CREATE TABLE sales.sales_quote_header (            -- ноорог баримт; хууль ёсны дугаар posting үед олгогдоно
    id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),   -- апп UUIDv7 өгнө (D-C8)
    tenant_id     uuid              NOT NULL,
    company_id    uuid              NOT NULL,
    no            platform.document_no NOT NULL,
    posting_date  date              NOT NULL,
    currency_code platform.currency_code,
    amount        platform.amount   NOT NULL DEFAULT 0,
    created_at    timestamptz       NOT NULL DEFAULT now(),
    created_by    uuid              DEFAULT platform.current_user_id(),
    updated_at    timestamptz,
    updated_by    uuid,
    row_version   integer           NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id)                         -- composite FK-ийн зорилт
);
COMMENT ON TABLE sales.sales_quote_header IS 'Mirrors BC table 36 Sales Header (document type Quote).';

-- RLS (900_rls.sql-тэй ижил): app.tenant_id тохируулаагүй бол query АЛДАА өгнө (fail-closed, D-K6)
ALTER TABLE sales.sales_quote_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.sales_quote_header FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.sales_quote_header
    USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY company_isolation ON sales.sales_quote_header AS RESTRICTIVE
    USING (company_id = platform.current_company_id()) WITH CHECK (company_id = platform.current_company_id());
GRANT SELECT ON sales.sales_quote_header TO app_user, app_readonly;
GRANT INSERT, UPDATE, DELETE ON sales.sales_quote_header TO app_user;

-- master data / setup / ноорог баримтад (140_integration_audit.sql-тэй ижил)
CREATE TRIGGER trg_sales_quote_header_touch BEFORE UPDATE ON sales.sales_quote_header
    FOR EACH ROW EXECUTE FUNCTION platform.fn_touch_row();
CREATE TRIGGER trg_sales_quote_header_audit AFTER INSERT OR UPDATE OR DELETE ON sales.sales_quote_header
    FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change();
```

**Ledger хүснэгтэд нэмэлтээр** (910_ledger_guards.sql-тэй ижил):

```sql
INSERT INTO platform.ledger_guard (table_name, key_column, mutable_columns, description)
VALUES ('xx.xx_ledger_entry', 'entry_no', ARRAY['reversed','reversed_by_entry_no'], 'BC T…');
CREATE TRIGGER trg_xx_ledger_entry_immutable BEFORE UPDATE OR DELETE ON xx.xx_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION platform.fn_guard_immutable();          -- whitelist-ээс бусад өөрчлөлт → ERL01
CREATE TRIGGER trg_xx_ledger_entry_no_truncate BEFORE TRUNCATE ON xx.xx_ledger_entry
    FOR EACH STATEMENT EXECUTE FUNCTION platform.fn_guard_immutable();
CREATE TRIGGER trg_xx_ledger_entry_before_insert BEFORE INSERT ON xx.xx_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION platform.fn_ledger_before_insert();     -- company_id = app.company_id (ERT01)
REVOKE UPDATE, DELETE, TRUNCATE ON xx.xx_ledger_entry FROM app_user, app_worker, app_readonly;
-- entry_no: platform.fn_next_entry_no('XX_LEDGER_ENTRY', n); IDENTITY/SEQUENCE хэрэглэхгүй (D-K3)
```

Transaction бүрийн Debit = Credit тэнцвэрийг `DEFERRABLE INITIALLY DEFERRED` constraint trigger-ууд (`trg_gl_entry_balanced` → `gl.fn_check_transaction_balanced`, `trg_gl_transaction_has_entries` → `gl.fn_check_transaction_has_entries`, `ERB01`) commit үед шалгана. Ledger мөрийн `company_id` нь `app.company_id`-тай таарч байгааг `BEFORE INSERT` trigger (`platform.fn_ledger_before_insert`) шалгана. Яг тодорхойлолтыг [910_ledger_guards.sql](./db/schema/910_ledger_guards.sql), [02-architecture.md](./02-architecture.md) §7.4, §8-аас үзнэ.

**Tenant-гүй хүснэгт.** Улсын хэмжээний лавлах өгөгдөл (ISO валют, Монголбанкны албан ханш, хуулийн огноотой татварын параметр, БҮНА ангилал, eBarimt-ийн лавлах) бизнесийн мөр биш. Тиймээс `tenant_id`-гүй, RLS-гүй байна. `app_user` (`erp_app`) зөвхөн `SELECT` эрхтэй. Шинэчлэлтийг `app_worker` (`erp_worker`: ханш, eBarimt лавлах job) эсвэл migration хийнэ ([02-architecture.md](./02-architecture.md) §7.5). Ийм хүснэгт тухайн модулийн schema-д, тусгай угтваргүй байна (`fx.iso_currency`, `fx.official_exchange_rate`, `tax.tax_parameter`, `ebarimt.classification_code`, `ebarimt.tax_product_code`, `rpt.statement_line`). `verify` команд эдгээрийг `tenant_id` баганагүйгээр нь таньдаг. Нэвтрэлтийн `identity.*` хүснэгтүүд мөн тенантгүй, RLS-гүй (D-K7).

### 3.3 Migration

| Дүрэм | Тайлбар |
|---|---|
| Baseline | Канон [`db/schema/*.sql`](./db/schema/) (`000_extensions_roles.sql` … `920_views.sql`) репод **өөрчлөлтгүй** `db/schema/`-д байж, `Erp.Migrator`-т embedded resource болно. Migrator тэдгээрийг нэрийн дарааллаар, нэг бүрийг өөрийн transaction-д (журналын мөртэй хамт) ажиллуулна; psql-ийн `\set …` мөрийг алгасна. `000` нь cluster group role (`app_*`), өргөтгөл, модулийн схем үүсгэдэг тул **эхний `migrate`** нь bootstrap superuser холболтоор: локал/CI-д `postgres` (§0, §10), production-д DBA (2 хүн, runbook). Дараагийн бүх ажиллагаа `erp_migrator`-оор. Baseline файлыг хэзээ ч засахгүй (CI өмнөх release-тэй харьцуулна); spec багц доторх starter-т `tools/ci/sync-db.sh` хуулбарыг шинэчилж, `DatabasePackageDriftTests` зөрүүг барина. |
| Seed | `db/seed/legal_parameters.sql`, `db/seed/mn_*.sql` (канон MN багц: `tax.tax_parameter`, `fx.iso_currency`, `rpt.statement_line`, `platform.fn_provision_company_mn` г.м.) — `seed` командаар, **repeatable** (checksum өөрчлөгдвөл дахин ажиллана). Демо өгөгдөл тусдаа (`seed --set demo`, §13). |
| Байршил, нэр | Baseline-ийн дараах өөрчлөлт: `db/migrations/V<NNNN>__<module>_<description>.sql` (`V0001`-ээс, baseline-ийн дараа ажиллана). 4 оронтой хувилбар, **хоёр** доогуур зураас, жижиг үсгийн `snake_case` тайлбар. Тайлбарын эхний үг нь модуль (схемийн нэр): `V0012__gl_add_gl_register_hash.sql`, `V0013__sales_add_due_date.sql` ([ADR-0014](./adr/ADR-0014-sql-first-migrations.md)). |
| Repeatable | `R__<schema>__<object>.sql` (зөвхөн view ба функц): `R__rpt__trial_balance.sql`. Бүх V файлын дараа, checksum өөрчлөгдсөн үед нэрийн дарааллаар дахин ажиллана. |
| Лавлах өгөгдөл | Улсын лавлах (валют, хуулийн параметр, БҮНА) нь seed эсвэл **V файлаар** орно (`V0031__tax_tax_parameter_2027.sql`, `tax.tax_parameter`-д): шинэ утгыг шинэ мөрөөр (хүчин төгөлдөр болох огноотой) нэмнэ, хуучныг засахгүй ([ADR-0014](./adr/ADR-0014-sql-first-migrations.md) №7, [ADR-0021](./adr/ADR-0021-effective-dated-parameters.md)). |
| Толгой | Эхний мөр: `-- Module: GeneralLedger · Ticket: ERP-123 · Expand/contract: expand · Rollback: forward-fix only`. `lock_timeout = '5s'`, `statement_timeout = '15min'`-ийг runner файл бүрийн өмнө тохируулна. Өөр утга хэрэгтэй бол файл дотор `SET LOCAL` хийнэ. Lock timeout болбол runner тухайн файлыг 3 удаа дахин оролдоно. |
| Transaction | Файл бүр өөрийн transaction-д ажиллана (runner ороож өгнө). Transaction-д ажиллах боломжгүй statement (`CREATE INDEX CONCURRENTLY`) нь тусдаа файлд байж, эхний мөрөнд `-- migrator: no-transaction` тэмдэгтэй байна. |
| Өөрчлөхгүй | `main`-д merge хийгдсэн migration-ийг **хэзээ ч** засахгүй. Runner checksum (SHA-256)-аар шалгана, CI өмнөх release-тэй харьцуулна. Алдааг шинэ V файлаар засна. |
| Expand → contract | Хувилбар N-ийн схем N-1 хувилбарын кодтой ажиллана. Хуучин app-ийн хэрэглэдэг багана/хүснэгтийг тухайн release-д устгахгүй, нэрийг өөрчлөхгүй. `NOT NULL`, FK, CHECK-ийг `NOT VALID` → `VALIDATE` дарааллаар нэмнэ. Contract (хуучныг устгах) нь **дараагийн** release-д. Ledger-ийг UPDATE-ээр backfill хийхгүй. Том backfill нь batched job хэлбэрээр явна ([02-architecture.md](./02-architecture.md) §14.4). |
| Шинэ хүснэгт | §3.2-ын загвар: `tenant_id`, `company_id`, RLS (`tenant_isolation` + `company_isolation`, ENABLE + FORCE) ба GRANT; master data-д `trg_<table>_touch` + `trg_<table>_audit` (`audit.fn_row_change`); ledger-т `platform.ledger_guard` мөр + `trg_<table>_immutable`/`_no_truncate`/`_before_insert` + REVOKE. |
| Дугаарын мөргөлдөөн | Хувилбарын дугаарыг PR нээхдээ авна. `main` дээр давхцвал **өөрийнхөө** файлын дугаарыг merge-ээс өмнө өөрчилнө (CI давхардлыг илрүүлнэ). |
| Гүйцэтгэл | Зөвхөн `Erp.Migrator`-оор. Staging, prod-д DDL-ийг гараар ажиллуулахыг хориглоно. Онцгой тохиолдолд break-glass runbook-ийн дагуу, 2 хүн оролцож хийнэ. |
| Runner ба journal | `Erp.Migrator` нь **өөрсдийн** console runner (гадаад migration сан хэрэглэхгүй, хэдэн зуун мөр код, integration тесттэй — [ADR-0014](./adr/ADR-0014-sql-first-migrations.md)). Нэр нь `Erp.Migrator` (`src/Erp.Migrator`) — [02-architecture.md](./02-architecture.md) §14.4 ба ADR-0014-тэй ижил; DbUp/Flyway/`Erp.Migrations` хэрэглэхгүй. Journal нь `platform.schema_migration` (script, kind = SCHEMA/SEED, SHA-256 checksum, applied_at, applied_by, execution_ms); migrator 000-ийн дараа шууд үүсгэнэ. |
| Runner-ийн хамгаалалт | `erp_migrator`-оор нэвтэрч `SET ROLE app_owner`, `SET lock_timeout = '5s'`, `SET statement_timeout = '15min'`, session-level `pg_advisory_lock(<тогтмол>)` (зэрэг ажиллах runner-ийг хориглоно; иймээс PgBouncer-ийг тойрч PostgreSQL руу шууд холбогдоно). Application startup дээр migration **ажиллуулахгүй**. |

Runner-ийн командууд: `migrate`, `verify`, `seed --set <name>`, `info`, `reset --i-know-this-is-local` (зөвхөн `Development` орчинд). Холболтыг `ConnectionStrings:Migrations` тохиргооноос авна; CI-д `--connection "<connection string>"` сонголтоор дарна. `seed --set demo` нь `Production` орчинд **ажиллахаас татгалзана** (§13). `verify` бол каталогийн тест ([02-architecture.md](./02-architecture.md) §7.8). Дараахыг шалгана: checksum; `tenant_id` баганатай хүснэгт бүрт RLS `ENABLE` + `FORCE` + `tenant_isolation` (`company_id NOT NULL` бол `company_isolation`); `app.tenant_id`-гүй SELECT/INSERT алдаа өгдөг (fail-closed, D-K6); `pg_roles`-оос `BYPASSRLS` зөвхөн `app_rls_bypass`-д (бусад `app_*` ба `erp_*` role-д байхгүй); `platform.ledger_guard`-ийн хүснэгт бүрт `trg_<table>_immutable`/`_no_truncate` trigger ба `app_user`/`app_worker`/`app_readonly`-д UPDATE/DELETE/TRUNCATE эрх байхгүй; master data-д `trg_<table>_audit`; `real`/`double precision`/`money` багана байхгүй; дүнгийн багана `platform.amount`, ханшийн багана `platform.exch_rate` domain-тэй ([db/tests/catalog_checks.sql](./db/tests/catalog_checks.sql)); `qr_data`/`lottery` нэртэй багана байхгүй.

Шинэ migration үүсгэх: `dotnet run --project tools/Erp.DevTools -- new-migration gl add_gl_register_hash` → `db/migrations/V00NN__gl_add_gl_register_hash.sql` (толгой коммент бөглөгдсөн загвар).

### 3.4 API

| Сэдэв | Дүрэм |
|---|---|
| Суурь зам | `/api/v1/...`; major хувилбар URL-д. v1 дотор зөвхөн нэмэлт (additive) өөрчлөлт хийнэ. |
| Компанийн хүрээ | `/api/v1/companies/{companyId}/sales-invoices`. Tenant-ийг session (cookie)-оос авна, URL-д бичихгүй. Хэрэглэгч тухайн компанид эрхгүй бол `404`. |
| Resource нэр | олон тоо, `kebab-case`: `sales-invoices`, `posted-sales-invoices`, `general-journal-batches`, `bank-statements`. |
| Үйлдэл (BC action) | `POST .../sales-invoices/{id}/post`, `POST .../sales-invoices/{id}/post-preview`, `POST .../posted-sales-invoices/{id}/reverse`, `POST .../general-journal-batches/{batch}/post`. |
| JSON | `camelCase` property; enum string `camelCase` (`"status": "posted"`); огноо `"2026-10-06"` (`DateOnly`); цаг ISO-8601 UTC `"2026-10-06T03:15:00Z"`. |
| Мөнгө | **string**: `"amount": "12345.67"`, `"exchangeRate": "3595.4"`, `"quantity": "2"`, `"vatPercent": "10"`. JSON number ирвэл `400` (`money.must_be_string`). OpenAPI: `type: string, format: decimal`. Дэлгэрэнгүйг §4-өөс үзнэ. |
| Idempotency | POST/PUT/PATCH/DELETE команд бүрт `Idempotency-Key: <uuid>` header заавал (үл хамаарах: `…/post-preview`, `/connect/*`, `/bff/*`). Ижил key + ижил body → хадгалсан хариу + `Idempotent-Replayed: true`. Ижил key + өөр body → `422` (`idempotency.key_reused`). |
| Concurrency | Draft баримтад `ETag` (PostgreSQL `xmin`) + `If-Match`. Зөрвөл `412`. |
| Алдаа | RFC 9457 `application/problem+json` + `code` (`gl.period_closed`), `traceId`, `errors` (validation). `title`/`detail`-ийг `Accept-Language`-ээр (default `mn`) орчуулна. |
| Хуудаслалт | Keyset ([02-architecture.md](./02-architecture.md) §5.3): `?after=<cursor>&limit=50` (max 200); `cursor` нь opaque string (ledger-т `entryNo`-оос үүснэ). Эрэмбэ: `?sort=-postingDate,documentNo`. |
| Шүүлт | `camelCase` query: `?postingDateFrom=2026-01-01&postingDateTo=2026-01-31&customerId=...`. |
| Эрх | Endpoint бүр `RequirePermission("<module>.<resource>.<action>")`-тэй (`sales.invoice.post`). Бэлтгэгч ≠ батлагч (segregation of duties) дүрмийг handler шалгана. |
| OpenAPI | Built-in `Microsoft.AspNetCore.OpenApi` `/openapi/v1.json`-ийг өгнө. Build үед (`Microsoft.Extensions.ApiDescription.Server`, `OpenApiDocumentsDirectory`) `web/src/shared/api/openapi.json` үүсгэж commit хийнэ. TS төрлийг `npm run api:gen` (openapi-typescript → `schema.d.ts`) үүсгэнэ. CI: (1) `openapi.json` ба `schema.d.ts`-ийн drift; (2) PR-ийн `openapi.json`-ийг `main`-тэй `oasdiff breaking`-ээр харьцуулж v1-д breaking өөрчлөлтийг хориглоно (§10). |
| Систем | `/health/live`, `/health/ready` (DB, PosAPI `/rest/info`, outbox lag), `/api/v1/system/version` (`{ "version": "v1.4.0", "commit": "…" }`). |

### 3.5 Frontend (`web/`)

- TypeScript `strict`, ESLint (flat config) + Prettier. Component файл `PascalCase.tsx`, hook `useSomething.ts`, feature хавтас модулийн нэрээр (`features/sales`).
- Server state-д TanStack Query, хүснэгтэд AG Grid **Community** (`ag-grid-enterprise` импортыг ESLint `no-restricted-imports` хориглоно). Бүлэглэлт, нийлбэр, Excel экспортыг сервер хийнэ (ClosedXML).
- Мөнгө: `type Money = string & { readonly __brand: 'Money' }`. Generated client `format: decimal`-ийг `Money` болгоно. Харуулахдаа `formatMoney(value, currency, locale)` хэрэглэнэ. Энэ нь `Intl.NumberFormat`-д string дамжуулдаг тул нарийвчлал алдагдахгүй. Урьдчилсан тооцоонд (preview) `decimal.js` хэрэглэнэ. ESLint: `parseFloat`, `Number.parseFloat`, `.toFixed(` хориотой (`no-restricted-globals`, `no-restricted-properties`). **Эцсийн дүнг клиент хэзээ ч тооцохгүй.**
- i18n: `i18next` + `react-i18next`, namespace = модуль, түлхүүр `module.screen.element` (`sales.invoiceList.columns.dueDate`). `mn` нь default ба fallback хэл. `npm run i18n:check` нь `mn`/`en` түлхүүр ижил эсэхийг шалгана. Огноо, тоог `Intl`-ээр `mn-MN` / `en-US`-ээр форматлана.
- Шаардлагатай npm script-үүд (CI эдгээрийг дууддаг): `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:ci` (Vitest + JUnit → `web/test-results/`), `i18n:check`, `api:gen`.
- Vite dev server нь `/api`, `/bff`, `/connect`, `/account`-ийг `http://localhost:5100` руу proxy хийнэ (same-origin cookie, BFF).

### 3.6 Лог, trace ба хувийн мэдээлэл

| Хэзээ ч бичихгүй (лог, span attribute, metric label, алдааны мессеж, outbox payload-ийн лог) | Хэрхэн |
|---|---|
| eBarimt `qrData`, `lottery` | `PrintOnly<T>` төрөлд ороож, `[EbarimtPrintOnly]` data classification-оор тэмдэглэнэ (`Microsoft.Extensions.Compliance.Redaction`). eBarimt HttpClient logger-гүй (`RemoveAllLoggers()`), body capture **унтраалттай**. Хариуг зөвхөн санах ойд байлгаад хэвлэх DTO руу шууд дамжуулна. `ebarimt.ebarimt_document`, `ebarimt.ebarimt_document_event`-д ийм багана байхгүй, JSON багана бүр `integration.fn_has_forbidden_ebarimt_keys` CHECK-тэй (D-J3). Collector давхар устгана (`deploy/otel-collector.yaml`). |
| Нууц үг, токен, cookie, `X-API-KEY` | Header-ийг logging-оос хасна. `IConfiguration`-ийн debug view prod-д унтраалттай. |
| Регистрийн дугаар, civil_id, `consumerNo`, утас, имэйл | `[PersonalData]` classification + HMAC redactor (түлхүүр нь runtime secret) эсвэл маск (`УБ******12`). Энгийн SHA-256 hash хэрэглэхгүй: регистрийн дугаарын орон зай бага тул буцааж тайлж болно. Collector эдгээр нэртэй attribute-ийг **устгана**. |
| Request/response body | ASP.NET Core болон HttpClient-ийн body capture бүх газарт унтраалттай. |

Span attribute ба metric-ийн нэрийг [02-architecture.md](./02-architecture.md) §11.3–11.4-өөс авна. Span: `erp.tenant_id`, `erp.company_id`, `erp.user_id`, `erp.document_type`, `erp.document_id`, `erp.transaction_id`, `erp.outbox_id`, `erp.ebarimt.receipt_id`, `erp.ebarimt.status`. Metric (Prometheus нэрээр): `erp_posting_duration_seconds`, `erp_posting_lock_timeouts_total`, `erp_outbox_oldest_pending_age_seconds`, `erp_ebarimt_unknown_open`, `erp_posapi_left_lotteries_min`, `erp_posapi_last_send_age_seconds`, `erp_login_failures_total`. Metric-ийн label-д tenant id **оруулахгүй** (cardinality).

---

## 4. Мөнгө ба decimal-ийн дүрэм

### 4.1 Төрлийн харгалзаа

Эх сурвалж: [ADR-0006](./adr/ADR-0006-money-and-rounding.md), [02-architecture.md](./02-architecture.md) §8.3–8.4. Энэ хэсэг нь хөгжүүлэгчийн өдөр тутмын дүрэм юм.

| Утга | C# | PostgreSQL domain | JSON (API) | TypeScript |
|---|---|---|---|---|
| Баримтын, валютын (FCY) ба MNT ledger (LCY) дүн | `decimal` | `platform.amount` = `numeric(19,4)`; валютын нарийвчлалаар бөөрөнхийлж хадгална (MNT 0.01, LCY-д тусдаа domain байхгүй) | `"12345.67"` | `Money` (branded string) |
| Нэгжийн үнэ / өртөг | `decimal` | `platform.unit_amount` = `numeric(19,6)` | `"1234.5"` | `Money` |
| Тоо хэмжээ | `decimal` | `platform.quantity` = `numeric(19,5)` | `"2"` | `Qty` |
| Хувь (НӨАТ 10%) | `decimal` | `platform.percent` = `numeric(9,5)`, 0–100 | `"10"` | `Pct` |
| Ханш (1 нэгж валют = X MNT) | `decimal` | `platform.exch_rate` = `numeric(38,18)`; `0 < rate < 1e10`-ийг апп шалгана | `"3595.4"` | `Rate` |

Domain-ууд [010_platform.sql](./db/schema/010_platform.sql)-д (D-C1).

Дүнг хадгалахаас өмнө **валютын нарийвчлалаар** бөөрөнхийлнэ: `fx.currency.amount_rounding_precision` (ISO анхдагч `fx.iso_currency.minor_units`; `ICurrencyCatalog`; MNT 0.01, USD 0.01, JPY 1). Бүртгэлийн валют MNT, нарийвчлал нь 0.01-ээр тогтмол. eBarimt мөн 2 оронтой.

### 4.2 Заавал мөрдөх 12 дүрэм

1. **`double`, `float`, `Half`-ыг мөнгө, тоо хэмжээ, үнэ, ханшид хэзээ ч хэрэглэхгүй.** `Erp.BuildingBlocks.Domain`, `*.Domain`, `*.Application`, `*.Contracts` ба модулийн `*.Api`-д **ERP0001** analyzer (`tools/Erp.Analyzers`, starter-т бэлэн) build алдаа өгнө. Энэ нь зарлалт, local, cast, literal (`var x = 1.5;`), далд хөрвүүлэлт (`Math.Sqrt(2)`) бүгдийг барина. `BannedSymbols.Domain.txt`-ийн `T:System.Double` нь зөвхөн `double.Parse` маягийн хандалтыг барьдаг тул дангаараа хангалтгүй (2026-10-06-нд .NET 10.0.401 SDK дээр туршиж баталгаажуулсан).
2. Literal-д `m` дагавар заавал (`0.1m`). Төрлийг тодорхой бичнэ: `decimal total = 0m;` (IDE0008 = error).
3. **Бөөрөнхийлөлтийг зөвхөн `MoneyMath.Round(value, decimals)` хийнэ** (`MidpointRounding.AwayFromZero`, PostgreSQL `round(numeric, n)`-тэй ижил). Нүцгэн `Math.Round`/`decimal.Round` хориотой (RS0030). .NET-ийн default нь banker's rounding (ToEven) учраас өөр үр дүн өгнө.
4. **Мөрийн дүн:** `round(qty × unit_price, p) − line_discount_amount`. Толгойн дүн = мөрүүдийн Σ. Толгойг тусад нь дахин тооцохгүй (eBarimt-ийн гинж: items → sub-receipts → receipt → payments яг тэнцэх ёстой).
5. **НӨАТ, НХАТ:** `tax_code` бүлэг бүрд **нэг удаа** бөөрөнхийлж, мөрүүдэд **running remainder** аргаар хуваарилна (BC-ийн загвар). НӨАТ шингэсэн үнэд `VAT = round(gross × r / (100 + r), p)`, `base = gross − VAT`. Бүх тооцоог `ITaxCalculator.ComputeDocument` нэг функц хийнэ. UI preview, PDF, eBarimt payload, posting бүгд **ижил** үр дүн авна.
6. **Хөнгөлөлт ба бусад хуваарилалт** нь running remainder аргаар хийгдэнэ. Ингэснээр Σ хэсэг = нийт яг тэнцэнэ.
7. **Валют:** FCY→LCY хөрвүүлэлтийг хуримтлагдсан нийлбэрийн аргаар хийнэ (ADR-0006). Ханшийг "1 нэгж валют = X MNT" хэлбэрээр хадгална. Урвуу ханш (`1/rate`) хадгалахгүй. **Тэнцэхгүй үлдэгдлийг автоматаар нөхөхийг ("round-off plug") хориглоно.** Зөрүүг зөвхөн тодорхой дансанд бичнэ: бэлэн мөнгөний бүхэлчлэл ("Invoice rounding"), тулгалтын бөөрөнхийлөлт (≤ 0.01, "Appln. rounding"), ханшийн олз/гарз.
8. Хуваалтын үр дүн 28 орон хүртэл байдаг. DB-д бичихээс өмнө зорилтот нарийвчлал руу **ил тодоор** бөөрөнхийлнө. PostgreSQL scale-ээс илүү орныг **алдаагүйгээр, чимээгүй** бөөрөнхийлдөг (`platform.amount` нь `numeric(19,4)` тул 0.01-ээс нарийн MNT-г DB татгалзахгүй; шөнийн `platform.fn_integrity_report` I-08 `UNROUNDED_MNT` илрүүлнэ). Integration тестийн `AssertNoHiddenRounding` туслах нь бичсэн утгыг буцааж уншаад яг тэнцүү эсэхийг шалгана.
9. Харьцуулалтыг яг тэнцүүгээр (`==`) хийнэ. Epsilon/tolerance хэрэглэхгүй.
10. Parse, format хийхдээ хадгалах ба API-д `InvariantCulture` хэрэглэнэ. `mn-MN` форматыг зөвхөн харуулахад (PDF, Excel, UI). Статутын маягтын тусгай форматыг (мянгатын тусгаарлагч, ₮ эсвэл мянган ₮) Reporting модулийн нэг газарт тодорхойлно.
11. **JSON:** `DecimalStringJsonConverter` бүх API-д бүртгэгдсэн. Бичихдээ invariant, `.` тусгаарлагч, мянгатын тусгаарлагчгүй, exponent-гүй, илүү тэггүй (`"12345.6"`, `"-15.25"`, `"0"`) байна. Уншихдаа зөвхөн string хүлээн авна (`^-?(0|[1-9]\d{0,14})(\.\d{1,18})?$`). Number ирвэл `400`. SQL дээр `SUM(numeric)` яг тооцогдоно. `AVG`-ийн үр дүнг ил тодоор `round(…, 2)` хийнэ.
12. **Тест:** `MoneyMath`-ийн unit тест tie тохиолдлуудыг заавал агуулна: `Round(2.345, 2) = 2.35`, `Round(-2.345, 2) = -2.35`, `Round(2.355, 2) = 2.36`, `Round(0.005, 2) = 0.01`. Property тест (FsCheck)-ээр: Σ мөрийн НӨАТ = бүлгийн НӨАТ, хуваарилалтын Σ = нийт, posting + reversal = 0, trial balance = 0, eBarimt-ийн нийлбэрийн гинж.

### 4.3 Зөвшөөрөгдсөн цорын ганц бөөрөнхийлөлтийн газар

Файл: `src/BuildingBlocks/Erp.BuildingBlocks.Domain/Monetary/MoneyMath.cs`. Хавтас/namespace нь `Monetary`. Учир нь `Money` төрөл `…Money` namespace-д байвал MA0049 build алдаа өгнө.

```csharp
namespace Erp.BuildingBlocks.Domain.Monetary;

public static class MoneyMath
{
    /// <summary>Rounds half away from zero, exactly like PostgreSQL round(numeric, decimals). ADR-0006.</summary>
    public static decimal Round(decimal value, int decimals)
    {
#pragma warning disable RS0030 // Sanctioned wrapper: the only Math.Round call allowed on money (architecture test #7)
        return Math.Round(value, decimals, MidpointRounding.AwayFromZero);
#pragma warning restore RS0030
    }
}
```

---

## 5. Локал орчныг ажиллуулах

### 5.1 Шаардлагатай хэрэгслүүд (prerequisites)

| Хэрэгсэл | Хувилбар | Шалгах | Тэмдэглэл |
|---|---|---|---|
| .NET SDK | 10.0.100 ба түүнээс дээш (10.0.x-ийн аль ч feature band; `global.json`) | `dotnet --version` | https://dotnet.microsoft.com/download/dotnet/10.0 |
| Node.js | 24 LTS (`.nvmrc`; Node 22 нь 2027-04-30-нд EOL болох тул шинэ төсөлд сонгохгүй) | `node -v` | `nvm use` / `fnm use`; npm нь Node-той хамт ирнэ |
| Docker | Docker Desktop 4.x эсвэл Docker Engine 27+ ба Compose v2 | `docker compose version` | Testcontainers-д Docker заавал. Podman хэрэглэвэл §18-аас үзнэ |
| psql | 17 client | `psql --version` | Ubuntu: PGDG repo-оос `postgresql-client-17`; macOS: `brew install libpq`; Windows: EDB installer-ийн "Command Line Tools" |
| Git | 2.40+ | `git --version` | `core.autocrlf=false` (`.gitattributes` LF-ийг баталгаажуулна) |
| ҮС | Windows 11 + WSL2 (Ubuntu 24.04), macOS 14+, Ubuntu 24.04 | | Windows-д репог **WSL файлын системд** (`~/src/erp`) байрлуулна |
| Санах ой | ≥ 16 GB RAM, ≥ 20 GB чөлөөтэй диск | | Docker Desktop-д ≥ 6 GB RAM өгнө |
| IDE | Rider 2025.3+ эсвэл VS Code + C# Dev Kit | | §17 |

### 5.2 Анхны тохиргоо алхам алхмаар

1. **Clone ба tool:** `git clone …`, дараа нь `dotnet tool restore`, `cd web && npm ci`.
2. **Дэд бүтэц асаах:** `docker compose -f deploy/docker-compose.yml up -d`. `docker compose -f deploy/docker-compose.yml ps` команд `postgres`-ийг `healthy` гэж харуулах ёстой. Анх асаахад `db/init/01-roles.sql` login role-уудыг (`erp_owner`, `erp_migrator`, `erp_app`, `erp_worker`, `erp_ops_ro`) болон `erp`, `erp_test` database-ийг үүсгэнэ. Group role (`app_*`), өргөтгөл, модулийн схемийг эхний `migrate` (superuser холболт, §0) канон `db/schema/000_extensions_roles.sql`-ээр үүсгэж, login role-уудыг group role-д нэгтгэнэ ([02-architecture.md](./02-architecture.md) §7.5).
3. **Нууц тохируулах** (§0-ийн 2-р алхам): гурван connection string-ийг (`App` → `erp_app`, `Worker` → `erp_worker`, `Migrations` → `erp_migrator`) `dotnet user-secrets --id mn-erp-local-dev`-д хадгална. Энэ нэг `UserSecretsId` нь `Erp.Api`, `Erp.Worker`, `Erp.Migrator` гурвын хооронд хуваалцагдана (`Directory.Build.props`). User-secrets нь зөвхөн `Development` орчинд ачаалагдана (§7.1).
4. **Migration:** `dotnet run --project src/Erp.Migrator -- migrate`, дараа нь `-- verify`. Хүлээгдэх үр дүн: `Applied N migrations` болон `verify: OK`.
5. **Демо өгөгдөл:** `dotnet run --project src/Erp.Migrator -- seed --set demo`, дараа нь `dotnet run --project tools/Erp.DevTools -- demo-post` (§13.2).
6. **API:** `dotnet run --project src/Erp.Api`. `launchSettings.json` нь `ASPNETCORE_ENVIRONMENT=Development`, `http://localhost:5100`-ийг тохируулна. OpenIddict локалд development гэрчилгээ хэрэглэнэ.
7. **Worker:** `dotnet run --project src/Erp.Worker`. Outbox dispatcher, Quartz job-ууд эхэлнэ. eBarimt нь `http://localhost:7080` дээрх mock руу явна.
8. **SPA:** `cd web && npm run dev`, дараа нь http://localhost:5173 хаягаар орж демо Owner хэрэглэгчээр нэвтэрнэ.
9. **Шалгах:** демо компанид борлуулалтын нэхэмжлэх үүсгээд **Posting preview** → **Post** хийнэ. Jaeger-д `POST /api/v1/companies/{id}/sales-invoices/{id}/post` trace, PosAPI mock-ийн `/__admin/requests`-д receipt хүсэлт харагдах ёстой. Mock-ийн `qrData`/`lottery` нь `QR-CANARY-`/`LOTTERY-CANARY-` угтвартай. Энэ canary утга DB-д (`pg_dump --data-only | grep CANARY`), логт, Jaeger-д **олдохгүй** байх ёстой.
10. **Тест:** unit ба architecture тест (Docker шаардахгүй), дараа нь integration тест (Docker шаардана).

### 5.3 Өдөр тутмын командууд

| Зорилго | Команд |
|---|---|
| Бүгдийг build хийх | `dotnet build Erp.slnx` |
| Формат засах | `dotnet format Erp.slnx` |
| Unit тест | `dotnet test --project tests/Unit/Erp.Tests.Unit.csproj` |
| Нэг классын тест | `dotnet test --project tests/Unit/Erp.Tests.Unit.csproj -- --filter-class "*MoneyTests"` |
| Architecture тест | `dotnet test --project tests/Architecture/Erp.Tests.Architecture.csproj` |
| Integration тест (Testcontainers) | `dotnet test --project tests/Integration/Erp.Tests.Integration.csproj` (Sprint 0 skeleton: Testcontainers-гүй, `ERP_TEST_DB`-ийн PostgreSQL дээр; golden-ууд ч энд — §16.1) |
| Golden тест локал PG дээр | `ERP_TEST_PG_ADMIN="Host=localhost;Port=5432;Username=postgres;Password=postgres;Database=postgres" dotnet test --project tests/Golden/Erp.Tests.Golden.csproj` |
| Нэг golden scenario | `dotnet test --project tests/Golden/Erp.Tests.Golden.csproj -- --filter-trait "Scenario=GS-SAL-001"` |
| Coverage тайлан | `dotnet test … -- --coverage --coverage-output-format cobertura` → `dotnet reportgenerator -reports:**/*.cobertura.xml -targetdir:artifacts/coverage` |
| Шинэ migration | `dotnet run --project tools/Erp.DevTools -- new-migration <module> <description>` |
| Шинэ golden scenario | `dotnet run --project tools/Erp.DevTools -- new-scenario SAL cash-sale-vat` |
| API client дахин үүсгэх | `dotnet build src/Erp.Api && cd web && npm run api:gen` |
| DB-г бүрэн цэвэрлэх | `docker compose -f deploy/docker-compose.yml down -v`, дараа нь `up -d`, migrate, seed |
| psql-ээр холбогдох (апп-ийн эрхээр) | `psql "host=localhost dbname=erp user=erp_app password=erp_app_local"`, дараа нь `BEGIN; SELECT set_config('app.tenant_id','<uuid>',true), set_config('app.company_id','<uuid>',true);` (тохируулаагүй бол RLS-тэй хүснэгтэд query **алдаа** өгнө — fail-closed) |
| E2E | `cd tests/E2E && npm ci && npx playwright install --with-deps && npx playwright test` |

### 5.4 Локал портууд

| Үйлчилгээ | Порт / URL |
|---|---|
| PostgreSQL | `localhost:5432` (`ERP_PG_PORT`-оор өөрчилж болно) |
| Erp.Api | http://localhost:5100 (OpenAPI: `/openapi/v1.json`) |
| Erp.Worker (health) | http://localhost:5200/health/ready |
| SPA (Vite) | http://localhost:5173 |
| PosAPI mock | http://localhost:7080 (бодит PosAPI-тай ижил порт) |
| OTel Collector | `localhost:4317` (gRPC), `localhost:4318` (HTTP) |
| Jaeger UI | http://localhost:16686 |
| Mailpit (`--profile extras`) | SMTP `localhost:1025`, UI http://localhost:8025 |

---

## 6. docker-compose үйлчилгээнүүд

Файл: [`starter/deploy/docker-compose.yml`](./starter/deploy/docker-compose.yml) → репод `deploy/docker-compose.yml`. Зам нь `deploy/`-ээс харьцангуй: `../db` = репогийн `db/`.

| Үйлчилгээ | Image | Үүрэг | Онцлог |
|---|---|---|---|
| `postgres` | `postgres:17` (18-ийг турших: эхлээд `down -v`, дараа нь `ERP_PG_IMAGE=postgres:18 ERP_PG_DATA_DIR=/var/lib/postgresql … up -d`; 18-ийн image PGDATA-г `/var/lib/postgresql/18/docker`-д хадгалдаг) | Үндсэн DB | `pg_isready -h 127.0.0.1` healthcheck: init дуусахаас өмнө TCP-ээр "healthy" болохгүй. `../db/init` → `/docker-entrypoint-initdb.d` (анх нэг удаа), `../db` → `/db` (psql-ээр `\i /db/...`). `pg_stat_statements`, `log_lock_waits`, `idle_in_transaction_session_timeout=60s`, UTC, data checksums |
| `otel-collector` | `otel/opentelemetry-collector-contrib:0.162.0` | OTLP хүлээн авч redaction хийнэ | `qrData`, `lottery`, нууц үг, токен, cookie, `X-API-KEY`, body, регистр/`civil_id`/`consumerNo` attribute-ийг устгана; лог body доторх `qrData`/`lottery`-г `[REDACTED]` болгоно; trace-ийг Jaeger руу, log/metric-ийг `debug` руу илгээнэ |
| `jaeger` | `jaegertracing/jaeger:2.22.0` | Trace UI | in-memory; зөвхөн UI-ийн 16686 порт нээлттэй |
| `posapi-mock` | `wiremock/wiremock:3.13.2` | PosAPI 3.0 mock | `deploy/posapi-mock/mappings/*.json`; тусгай ТТД `99999999901` → 40 сек хүлээгээд хариулна (`UNKNOWN`), `99999999902` → алдаа (`REJECTED`). Хариуны хэлбэр **placeholder**: албан ёсны PosAPI.yaml (v3.2.48)-тай тулгана |
| `mailpit` | `axllent/mailpit:v1.31` | SMTP барьж авагч | зөвхөн `--profile extras` үед |

API, Worker, SPA-г compose-д оруулаагүй. Тэдгээрийг host дээр `dotnet run` / `npm run dev`-ээр ажиллуулбал debug хийх, hot reload хурдан байна. Production image-ийг локалд турших бол: `docker build -f deploy/docker/Dockerfile --target api -t erp-api:local .`

---

## 7. Тохиргоо ба нууц (configuration & secrets)

### 7.1 Тохиргооны давхарга

Эх сурвалжуудыг дарааллаар нь уншина. Сүүлийнх нь өмнөхийгөө дарна:

1. `appsettings.json`: default утга, **нууцгүй**.
2. `appsettings.{Environment}.json`: орчны ялгаа (`Development` = local, `Test` = CI, `Staging`, `Production`; §12), **нууцгүй**.
3. `dotnet user-secrets` (`UserSecretsId = mn-erp-local-dev`): **зөвхөн `Development`** орчинд.
4. Орчны хувьсагч (environment variables): зөвхөн **нууцгүй** тохиргоо (`Ebarimt__PosApi__Instances__0__BaseUrl`, `OTEL_*`, `ASPNETCORE_ENVIRONMENT`). Тусгаарлагч нь `__`.
5. Нууц файлууд `/run/secrets/*` (staging, prod): `builder.Configuration.AddKeyPerFile("/run/secrets", optional: true)` (`Microsoft.Extensions.Configuration.KeyPerFile`). Файлын нэр = түлхүүр, `__` = `:` (жишээ нь `/run/secrets/ConnectionStrings__App`). Нууцыг орчны хувьсагчид **хийхгүй** ([02-architecture.md](./02-architecture.md) §10.4): `docker inspect`, `/proc/<pid>/environ`, алдааны dump-д ил гардаг.

Options класс бүр `ValidateDataAnnotations().ValidateOnStart()` хийнэ. Тохиргоо буруу бол апп асахгүй. Тохиргооны утгыг логлохгүй.

### 7.2 Гол тохиргооны түлхүүрүүд

| Түлхүүр | Локал утга (жишээ) | Нууц уу | Тайлбар |
|---|---|---|---|
| `ConnectionStrings:App` | `Host=localhost;Port=5432;Database=erp;Username=erp_app;Password=…` | ✔ | `Erp.Api`; `erp_app` role |
| `ConnectionStrings:Worker` | `…;Username=erp_worker;Password=…` | ✔ | `Erp.Worker`; `erp_worker` role |
| `ConnectionStrings:Migrations` | `…;Username=erp_migrator;Password=…` | ✔ | Зөвхөн `Erp.Migrator` (`SET ROLE app_owner`). PgBouncer-ийг тойрч PG руу шууд холбогдоно (session-level advisory lock) |
| `Ebarimt:PosApi:Instances:0:Name` / `:BaseUrl` | `local-mock` / `http://localhost:7080` | — | PosAPI pool (нэг instance ≤ 1000 мерчант) |
| `Ebarimt:PosApi:ReceiptTimeoutSeconds` | `20` (connect timeout 3 s; тестэд `2`) | — | Timeout болвол `UNKNOWN`, retry хийхгүй ([02-architecture.md](./02-architecture.md) §10) |
| `Ebarimt:ReferenceApi:BaseUrl` | `http://localhost:7080` | — | prod: `https://api.ebarimt.mn` |
| `Ebarimt:Auth:Authority` / `:ClientId` | `https://st.auth.itc.gov.mn/auth/realms/Staging` / `vatps` | — | Token сервис (password grant) |
| `Ebarimt:Auth:Username` / `:Password` | — (зөвхөн eBarimt дээр ажиллагсад) | ✔ | Staging операторын данс (§14) |
| `Ebarimt:OperatorApiKey` | — | ✔ | `X-API-KEY` (`saveOprMerchants`, `getSaleListERP`) |
| `Auth:SigningCertificatePath` / `:SigningCertificatePassword` | — (dev cert автоматаар) | ✔ | OpenIddict signing (ES256) ба encryption, prod-д `/run/secrets/oidc_signing.pfx` ([ADR-0016](./adr/ADR-0016-auth-openiddict-bff.md)) |
| `Smtp:Host` / `:Port` / `:Username` / `:Password` | `localhost` / `1025` | ✔ (prod) | Mailpit локалд |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | `http://localhost:4317`, `erp-api` | — | Стандарт OTel орчны хувьсагч |
| `FeatureManagement:<Flag>` | `true/false` | — | §3.1 |
| `Outbox:PollIntervalMs` / `:BatchSize` | `500` / `50` | — | Dispatcher |
| `Quartz:quartz.jobStore.tablePrefix` | `quartz.qrtz_` | — | AdoJobStore (PostgreSQL), cluster mode |

### 7.3 Нууцын бүртгэл

| Нууц | Локал | Staging / Production | Солих давтамж | Эзэмшигч |
|---|---|---|---|---|
| `erp_app`, `erp_worker` DB нууц үг | user-secrets (локал утга) | `/run/secrets/ConnectionStrings__App`, `…__Worker` (app host) | 180 хоног | devops |
| `erp_migrator` DB нууц үг | user-secrets | `/run/secrets/ConnectionStrings__Migrations` (deploy runner, migrator container-т mount) | 180 хоног | devops |
| OIDC signing/encryption гэрчилгээ | dev cert | `/run/secrets/oidc_signing.pfx`, `oidc_encryption.pfx` + нууц үг (`/run/secrets/Auth__SigningCertificatePassword`) | 90 хоног | devops |
| Тенантын нууцын KEK (`platform.tenant_secret`) | локал тогтмол түлхүүр | `/run/secrets/Secrets__Kek` | жил бүр | platform |
| ASP.NET Data Protection түлхүүр | локал файл | PostgreSQL `identity.data_protection_key` (D-K7) + X.509 гэрчилгээгээр шифрлэнэ | автоматаар 90 хоног | platform |
| eBarimt staging операторын данс | user-secrets (eBarimt хөгжүүлэгчид) | staging `/run/secrets` | ажилтан солигдох бүрт | ebarimt-owners |
| eBarimt production `X-API-KEY`, операторын данс | **локалд хэзээ ч байхгүй** | prod `/run/secrets` | ITC-ийн журмаар | ebarimt-owners |
| SMTP | — | `/run/secrets/Smtp__Password` | 180 хоног | devops |
| pgBackRest repo шифрлэлтийн нууц үг | — | DB host `/etc/pgbackrest/` | жил бүр | devops |
| GHCR token | — | GitHub-ийн `GITHUB_TOKEN` (run бүрт) | автоматаар | — |

**Production нууцын эх сурвалж.** Нууцыг хувийн `erp-infra` репод SOPS + age-ээр шифрлэж хадгална ([02-architecture.md](./02-architecture.md) §10.4). Ansible playbook тэдгээрийг host дээр `/etc/erp/secrets/<service>/<KEY>` файл (эрх `0400`, эзэмшигч нь container-ийн `$APP_UID` = 1654) болгон бичнэ. Docker Compose тэдгээрийг container-т `/run/secrets/` руу read-only mount хийнэ. Нууцыг орчны хувьсагч эсвэл `.env` файлд хийхгүй. Age-ийн private түлхүүр 2 хүнд (devops lead, CTO) байна. Production нууц **GitHub Secrets-д хадгалагдахгүй** бөгөөд Монголын ДТ-ээс гарахгүй.

**Production DB role.** Эрхийг канон [000_extensions_roles.sql](./db/schema/000_extensions_roles.sql)-ийн NOLOGIN **group role**-ууд агуулна: `app_owner` (бүх объектын эзэн), `app_user`, `app_worker`, `app_readonly`, `app_ops`, `app_rls_bypass` ([02-architecture.md](./02-architecture.md) §7.5). Login role-ууд (`erp_owner` NOLOGIN DB эзэмшигч, `erp_migrator`, `erp_app`, `erp_worker`, `erp_ops_ro`, `erp_backup`)-ыг `db/init/01-roles.sql`-тэй ижил загвараар ops runbook-ийн дагуу үүсгэнэ; 000 файл тэдгээрийг group role-д нэгтгэнэ (`erp_owner`/`erp_migrator` → `app_owner`, `erp_app` → `app_user`, `erp_worker` → `app_worker`, `erp_ops_ro` → `app_ops`). `BYPASSRLS` зөвхөн `app_rls_bypass`-д (NOLOGIN, хэн ч нэвтрэхгүй, зөвхөн тенант хоорондын SECURITY DEFINER функцийн эзэн) байна. `app_owner` ба түүний гишүүдэд **хэзээ ч** өгөхгүй (өгвөл FORCE RLS эзэмшигчид үйлчлэхээ болино, D-K6); 900_rls.sql-ийн self-check ба `verify` үүнийг шалгана. Нууц үгийг secret store-оос авна. `pg_hba.conf`-д зөвхөн `hostssl … scram-sha-256` зөвшөөрнө. App role-уудад connection limit тавина. `postgres` superuser-ээр application холбогдохгүй.

**Хориг.** `appsettings*.json`, `docker-compose.yml`, тест, баримтад жинхэнэ нууц үг байж болохгүй (локал `*_local` нууц үгс л зөвшөөрөгдөнө). CI-д gitleaks ажиллана (§10). GitHub push protection идэвхтэй. Нууц санамсаргүй commit хийгдвэл тэр даруй **сольж (rotate)**, дараа нь түүхийг цэвэрлэнэ.

---

## 8. Git-ийн ажлын урсгал (git workflow)

### 8.1 Trunk-based хөгжүүлэлт

- `main` нь үргэлж release хийж болохуйц байна. Шууд push хийхгүй, зөвхөн PR-ээр орно.
- Салбар (branch) богино настай: **≤ 2 ажлын өдөр**, өөрчлөлт **≤ ~400 мөр** (generated файлыг тооцохгүй). Том ажлыг feature flag-ийн ард хэсэгчлэн merge хийнэ.
- Салбарын нэр: `<type>/<ticket>-<slug>`, жишээ нь `feat/ERP-123-sales-invoice-post`, `fix/ERP-207-vat-rounding`.
- Өдөр бүр `main` дээр rebase хийнэ. Merge commit үүсгэхгүй (linear history).
- Release салбар байхгүй. Hotfix хэрэгтэй бөгөөд `main`-д release хийж болохгүй өөрчлөлт байгаа үед л tag-аас `hotfix/vX.Y.Z` салбар гаргаж, засварыг `main` руу cherry-pick хийнэ.

### 8.2 Commit ба PR

- PR-ийн гарчиг Conventional Commits хэлбэртэй, англиар: `feat(sales): post sales invoice with VAT`. Squash merge хийхэд энэ гарчиг commit message болно. Scope = модулийн нэр.
- PR-ийн тайлбарыг [`starter/.github/PULL_REQUEST_TEMPLATE.md`](./starter/.github/PULL_REQUEST_TEMPLATE.md)-аар бөглөнө (монгол хэлээр, ledger impact хүснэгттэй).
- Ажлыг эрт Draft PR болгон нээнэ. Review-ийн SLA: эхний хариу ажлын 4 цагийн дотор.
- Merge-ийн дараа салбар автоматаар устна.

### 8.3 CODEOWNERS ба шаардлагатай review

Файл: [`starter/.github/CODEOWNERS`](./starter/.github/CODEOWNERS). 2 approval-ийн дүрмийг [`starter/.github/workflows/sensitive-review.yml`](./starter/.github/workflows/sensitive-review.yml) хэрэгжүүлнэ.

| Өөрчлөгдсөн зам | Шаардлагатай review |
|---|---|
| Ердийн код | 1 approval (CODEOWNERS-ийн баг) |
| `src/Modules/GeneralLedger/**`, `src/Modules/Platform/*/Numbering/**`, `src/BuildingBlocks/Erp.BuildingBlocks.Domain/Monetary/**`, `tools/Erp.Analyzers/**`, модулиудын `*/Posting/**`, `Currency/*/Revaluation/**` | **2 approval**, нэг нь `@ledger-owners` |
| `src/Modules/Tax/**` | **2 approval**, нэг нь `@tax-owners` |
| `src/Modules/EBarimt/**` | **2 approval**, нэг нь `@ebarimt-owners` |
| `db/migrations/**`, `src/Erp.Migrator/**` | **2 approval**, нэг нь CODEOWNERS (`@ledger-owners` эсвэл `@devops`); хоёр багийн review-г хоёуланг нь хүснэ |
| `tests/Golden/Scenarios/**` | **2 approval**, нэг нь `@accounting-reviewers` (нягтлан бодогчийн гарын үсэг) |
| `.github/**`, `deploy/**` | 1 approval, `@devops` |

CODEOWNERS-д нэг замд хэд хэдэн баг бичигдсэн бол **аль нэг** багийн гишүүний approval "Code Owners review"-г хангана. Тиймээс заавал оролцох багийг (tax, eBarimt, нягтлан) тухайн замд **ганцаар** бичсэн. `main` салбарын ruleset: PR заавал; required checks `ci-ok` ба `two-approvals`; Code Owners review заавал; шинэ commit ирэхэд хуучин approval-ийг цуцална (dismiss stale approvals); conversation resolution заавал; force-push, устгалыг хориглоно; linear history; зөвхөн squash merge. Merge queue хэрэглэж болно (`ci.yml` ба `sensitive-review.yml` хоёулаа `merge_group`-ийг дэмждэг; approval-ийг PR дээр аль хэдийн шалгасан тул merge group дээр `two-approvals` шууд давна).

### 8.4 Release ба tag

- Tag: SemVer `vMAJOR.MINOR.PATCH`-ийг `main` дээр тавина. Image tag нь git tag-тай ижил (`v1.4.0`), commit бүрийн image нь `sha-<40 hex>`.
- Хэмнэл: staging-д тасралтгүй (main ногоон болох бүрт). Production release 2 долоо хоног тутам, мягмар гарагт 10:00 (Улаанбаатарын цагаар). Hotfix шаардлагатай үед гарна.
- **Production deploy хийхгүй хугацаа (freeze)** нь [02-architecture.md](./02-architecture.md) §14.6-ийн календарь (Улаанбаатарын цагаар): сар бүрийн 9–10 (НӨАТ-ын тайлан), 1/4/7/10-р сарын 18–20 (ААНОАТ-ын улирлын тайлан), 2-р сарын 5–10 (жилийн санхүүгийн тайлан), 12-р сарын 29 – 1-р сарын 3. `cd.yml` production deploy-ийн өмнө энэ календарийг шалгаж, freeze-д таарвал зогсооно. Hotfix-ийг ерөнхий архитектор ба on-call хамтран батална (`override_freeze` оролт + шалтгаан, audit-д үлдэнэ). 2027-01-01-нээс хүчин төгөлдөр болох татварын дүрмийг (огноотой параметрээр) **2026-12-15-аас өмнө** prod-д гаргана.
- Release notes-ийг GitHub "Generate release notes" PR гарчгуудаас үүсгэнэ.

---

## 9. Definition of Ready / Definition of Done

### 9.1 Definition of Ready (story эхлэхэд бэлэн)

- [ ] User story монгол хэлээр, хэрэглэгчийн үүрэгтэй (Owner, Accountant, Cashier, Viewer). Acceptance criteria нь Given/When/Then хэлбэртэй.
- [ ] Posting-д нөлөөлөх бол **хүлээгдэж буй бичилтийн хүснэгт** (Дт/Кт данс, дүн, НӨАТ/НХАТ)-ийг нягтлан бодогч бэлтгэж, golden scenario-ийн ноорог (`GS-…`) болгосон.
- [ ] BC лавлагаа (объект, codeunit, research note-ийн хэсэг) ба хуулийн үндэслэлийг хүчин төгөлдөр болох огноотой нь (одоо / 2027-01-01) бичсэн.
- [ ] Өгөгдлийн загварын нөлөө тодорхой: шинэ хүснэгт/багана, migration (expand/contract), RLS, ledger эсэх.
- [ ] API-ийн ноорог (endpoint, DTO, permission) ба UI-ийн ноорог (дэлгэц, текст `mn` + `en`) бэлэн.
- [ ] Хувийн мэдээллийн талбарыг тэмдэглэсэн (маск, хадгалалт, зөвшөөрөл).
- [ ] Гадаад хамаарал (eBarimt staging эрх, банкны дээж файл гэх мэт) шийдэгдсэн.
- [ ] Үнэлгээ ≤ 3 өдөр. Түүнээс их бол хуваана.

### 9.2 Definition of Done (дууссан)

- [ ] PR `main`-д merge хийгдсэн, CI (`ci-ok`) ба шаардлагатай review (§8.3) бүгд ногоон.
- [ ] Domain логикт unit тест; SQL, repository, RLS-д integration тест; posting/tax өөрчлөлтөд нягтлан бодогчийн гарын үсэгтэй **golden scenario** нэмсэн эсвэл шинэчилсэн.
- [ ] Мөнгөний 12 дүрэм (§4.2) мөрдөгдсөн: `double` байхгүй (ERP0001), `MoneyMath.Round`, НӨАТ бүлгээр + running remainder, JSON string, trial balance = 0.
- [ ] Migration нь V-файл, expand/contract, RLS (`FORCE`), grant, ledger guard-тай бөгөөд хоосон DB ба өмнөх release дээр шалгагдсан (CI).
- [ ] Аюулгүй байдал: команд бүрт permission; tenant/company тусгаарлалтын тест; бэлтгэгч ≠ батлагч; аудит лог (master data өөрчлөлт); хувийн мэдээлэл логт ороогүй.
- [ ] Нийцэл (D14): цахим анхан шатны баримт үүсгэдэг бол тоон гарын үсгийн цэг (Gerege / Infosert / Tridum adapter-ийн interface) тусгагдсан; шинэ өгөгдөл 10 жилийн хадгалалтын бодлогод (архивын багц, устгалын хориг) хамрагдсан; Сангийн яамны шаардлагын (47/2018) аудитын мөр алдагдаагүй.
- [ ] eBarimt-д хамаатай бол: `qrData`/`lottery` хадгалагдаагүй (тестээр баталгаажсан), `POST /rest/receipt` retry хийгдэхгүй, `UNKNOWN` урсгал тестлэгдсэн, **eBarimt staging дээр** гараар шалгасан.
- [ ] Observability: шинэ урсгалд span ба metric нэмсэн; алдааны лог ойлгомжтой, PII-гүй.
- [ ] i18n: UI текст бүр `mn` ба `en`-д байгаа. Монгол текстийг домэйн мэдээлэлтэй хүн уншиж шалгасан.
- [ ] API өөрчлөгдсөн бол OpenAPI ба TS client шинэчлэгдсэн. Breaking change байхгүй (v1 additive).
- [ ] Баримт: шийдвэр өөрчлөгдсөн бол ADR, runbook (ops-д нөлөөтэй бол), хэрэглэгчийн тусламжийн текст.
- [ ] `staging` орчинд (main merge-ийн дараа автоматаар) deploy хийгдэж, demo өгөгдөл дээр ажиллаж байгааг шалгасан. Дуусаагүй бол feature flag-ийн ард байгаа.
- [ ] Гүйцэтгэл: 50 мөртэй нэхэмжлэлийн posting p95 < 300 ms (staging хэмжээгээр). Тайлан 1 жилийн демо өгөгдөл дээр < 2 сек.
- [ ] Шинэ dependency лицензийн allow-list-д багтана. SBOM автоматаар шинэчлэгдэнэ.

---

## 10. CI pipeline

Файл: [`starter/.github/workflows/ci.yml`](./starter/.github/workflows/ci.yml). Энэ нь `pull_request`, `main` руу push, `v*` tag, `merge_group` үед ажиллана. Job-ууд зэрэгцэн явна. PR-ийн нийт хугацаа **≤ 15 минут** байх ёстой.

| # | Шат (stage) | Job | Хэрэгсэл | Унавал юу гэсэн үг |
|---|---|---|---|---|
| 1 | Restore | `build` | `dotnet restore --locked-mode` + NuGet audit | Lock file commit хийгдээгүй, эсвэл high/critical эмзэг байдалтай (vulnerable) багц |
| 2 | Format check | `build` | `dotnet format whitespace/style --verify-no-changes` | Локалд `dotnet format` ажиллуулна |
| 3 | Build | `build` | `dotnet build` (бүх warning = error; .NET analyzer, Meziantou, BannedSymbols, ERP0001) | Analyzer/кодын дүрэм зөрчигдсөн (`double`, нүцгэн `Math.Round`, culture-гүй format, `DateTime.Now` г.м.) |
| 4 | OpenAPI drift + breaking | `build` | `git status --porcelain web/src/shared/api/openapi.json` (build-ийн дараа); PR дээр `oasdiff breaking` (`main`-ийн contract-тай) | API өөрчлөгдсөн ч contract commit хийгдээгүй, эсвэл v1-д breaking өөрчлөлт орсон (`/api/v2` хэрэгтэй) |
| 5 | Unit тест | `build` | xUnit v3 (MTP), Shouldly, FsCheck, coverage | Domain логик / property invariant эвдэрсэн |
| 6 | Architecture тест | `build` | ArchUnitNET | Модулийн хил, хориотой төрөл, нэршил (§2.4) |
| 7 | Integration тест | `integration` (PG 17, 18) | Testcontainers PostgreSQL, WebApplicationFactory | RLS тусгаарлалт, ledger UPDATE/DELETE/TRUNCATE хориг, gapless дугаар (N зэрэг posting), outbox crash/idempotency, eBarimt timeout → `UNKNOWN`, `qrData` хадгалагдаагүй |
| 8 | Golden scenario | `golden` | PostgreSQL 17 **service container**, `tests/Golden/Scenarios/**/*.yaml` | Нягтлан бодогчийн баталсан хүлээгдэж буй G/L, VAT, sub-ledger, trial balance зөрсөн. `golden-diffs` artifact-аас expected/actual харьцуулалтыг үзнэ |
| 9 | Migration шалгалт | `migrations` (PG 16, 17, 18) | `Erp.Migrator`, `pg_dump` | Доорх 1–4 алхам |
| 10 | SPA | `web` | `npm ci`, ESLint, `tsc`, i18n parity, `api:gen` drift (`schema.d.ts`), Vitest, Vite build | Frontend алдаа, эсвэл TS client OpenAPI-тай зөрсөн |
| 11 | SBOM + dependency/лиценз шалгалт | `supply-chain` | gitleaks, NuGet audit, `nuget-license`, `license-checker-rseidelsohn`, `npm audit`, Syft (CycloneDX SBOM), Grype | Нууц commit хийгдсэн, зөвшөөрөгдөөгүй лиценз, high/critical эмзэг байдал |
| 12 | Container image | `image` (api, worker, migrator) | Buildx, GHCR, provenance + SBOM attestation, Grype | Dockerfile эвдэрсэн эсвэл image-д critical эмзэг байдал. Push зөвхөн `main` ба `v*` tag дээр |
| 13 | SAST | `codeql` (C#, TypeScript; `build-mode: none`) | CodeQL | Аюулгүй байдлын алдаа (injection, path traversal г.м.). Хувийн репод GitHub Code Security лиценз шаардана: repo variable `CODEQL_ENABLED=true` үед л ажиллана |
| — | Нэгтгэл | `ci-ok` | — | Ruleset-ийн required check (`two-approvals`-ийн хамт) |

Image/SBOM-ийн эмзэг байдлыг Grype (Anchore) шалгана. [02-architecture.md](./02-architecture.md) §10.8, §15-д Trivy гэж бичсэн; хоёр нь ижил үүрэгтэй бөгөөд SBOM-ийг Syft-ээр үүсгэдэг тул нэг экосистем (Syft + Grype) сонгосон (§19, нээлттэй асуудал №6).

**Migration шалгалтын алхмууд (`migrations` job):**

1. **Lint:** файлын нэр `V\d{4}__snake_case.sql` / `R__schema__object.sql` хэлбэртэй, хувилбар давхардаагүй, өмнөх release tag-аас хойш **хуучин V файл өөрчлөгдөөгүй** (`git diff --name-status <prev-tag>`).
2. **Path A — хоосон DB:** `db/init/01-roles.sql`, дараа нь superuser холболтоор эхний `migrate` (000 орно), `erp_migrator`-оор `verify`, дахин `migrate` (no-op байх ёстой).
3. **Path B — өмнөх release-ийн snapshot:** өмнөх `v*` tag-ийг `git worktree`-ээр гаргаж, **тэр хувилбарын** `Erp.Migrator`-аар `migrate` + `seed --set demo` хийнэ (схем ба өгөгдөл бүхий snapshot). Дараа нь одоогийн `Erp.Migrator`-аар `migrate` + `verify` хийнэ. Энэ нь өгөгдөлтэй DB дээр upgrade ажиллахыг баталгаажуулна.
4. **Schema diff:** Path A ба Path B-ийн `pg_dump --schema-only` (service container дотроос, хувилбар таарна; `\restrict` мөрийг шүүнэ) **яг ижил** байх ёстой.

Эхний release (`v0.1.0`) гарах хүртэл Path B ба schema diff алгасагдана (`::notice::`).

**Тестийн DB стратеги.** `Erp.BuildingBlocks.Testing.PostgresFixture`:
- `ERP_TEST_PG_ADMIN` тохируулагдсан бол (CI golden, локал compose) тэр серверийг хэрэглэнэ (superuser холболт: role-ууд `db/init/01-roles.sql`-ээр урьдчилан үүссэн байх ёстой). Үгүй бол Testcontainers-ээр `ERP_TEST_PG_IMAGE` (default `postgres:17`)-ийг асааж `db/init/01-roles.sql`-ийг ажиллуулна.
- Нэг удаа `erp_tpl_<run>` template DB-д admin холболтоор migration-ийг (000 орно) хийнэ. Тест класс бүрт `CREATE DATABASE … TEMPLATE erp_tpl_<run>` хийж хурдан клон үүсгэнэ.
- Тест `erp_app` (Worker-ийн тест `erp_worker`)-аар холбогдож tenant ба компанийг `TenantSession`-оор тохируулна, тиймээс RLS идэвхтэй. Ledger хамгаалалтын тест `erp_migrator`-аар ч UPDATE хийж trigger барьж байгааг шалгана.
- xUnit-ийн parallelization нь класс тус бүрээр явна (DB тусдаа учир аюулгүй).

**Nightly (`nightly.yml`, Sprint 0-ийн дараа нэмнэ):** E2E (Playwright) нь compose stack + migrate + seed demo + API + SPA дээр ажиллана; PG16 дээр бүрэн integration тест; `dependabot` PR-уудын бүлэг шалгалт. Ops-ийн сар бүрийн **restore drill** (pgBackRest → scratch cluster → trial balance = 0) тусдаа runbook-оор явна.

---

## 11. CD: Монголын дата төв рүү

Файл: [`starter/.github/workflows/cd.yml`](./starter/.github/workflows/cd.yml).

```text
 PR ─► ci ─► merge main ─► ci (push) ─► image: ghcr.io/<org>/erp-{api,worker,migrator}:sha-<commit>
                                             │
                     workflow_run (ногоон)   ▼
                     ┌───────────── cd: staging (self-hosted runner, Монголын ДТ) ───────────────┐
                     │ mirror GHCR → in-DC registry → pre-checks → migrate+verify → rolling → smoke │
                     └────────────────────────────────────────────────────────────────────────────┘
 git tag v1.4.0 ─► ci ─► image :v1.4.0 ─► workflow_dispatch(tag v1.4.0-аас, production) ─► freeze шалгалт ─► 2 reviewer зөвшөөрөл
                     ┌──────────── cd: production (self-hosted runner, Монголын ДТ) ─────────────┐
                     │ ... + pg_create_restore_point('pre-deploy-v1.4.0-…') өмнө нь               │
                     └────────────────────────────────────────────────────────────────────────────┘
```

**Яагаад self-hosted runner гэж.** PosAPI зөвхөн Монголын IP-аас, дотоод сүлжээнд хандагдана (D11). App host, DB, PosAPI pool нь ДТ-ийн хувийн сүлжээнд байрлана. Runner (`[self-hosted, linux, x64, mn-dc, staging|production]`) ДТ дотор байрлаж, GHCR-ээс image татаж ДТ доторх registry руу толин хуулбар (mirror) хийнэ. Ингэснээр app host интернэт рүү гарах шаардлагагүй. Runner-уудыг зөвхөн `cd.yml` ашиглах runner group-д оруулна. PR-ийн event дээр хэзээ ч ажиллуулахгүй. Ephemeral бус тул сар бүр patch хийнэ.

**Runner host-ийн урьдчилсан нөхцөл** (ops Ansible-аар бэлдэнэ; репод байхгүй):
- `docker` (+ Compose v2), `jq`, `curl`, `ssh` client; `deploy` хэрэглэгчийн SSH түлхүүр app host-ууд болон `DB_HOST` дээр (`deploy@`, `sudo -n -u postgres pgbackrest|psql`-ээр хязгаарласан sudoers).
- `/etc/erp/secrets/migrator/ConnectionStrings__Migrations` (эрх `0400`, uid 1654) — migrator container-т `/run/secrets` болж mount хийгдэнэ.
- `/etc/erp/posapi-instances.json` — тухайн орчны PosAPI instance-уудын URL массив (`["http://posapi-01:7080", …]`).
- `LOCAL_REGISTRY` руу push хийх эрх (`docker login` нэг удаа хийгдсэн).

**Deploy-ийн алхмууд** (`cd.yml`):

1. **Resolve:** staging нь `sha-<commit>`; production нь зөвхөн `vX.Y.Z`. Оролтыг regex-ээр шалгана (script injection-оос хамгаална). Production-ийг **тухайн tag-аас** dispatch хийнэ ("Use workflow from: `vX.Y.Z`"): `github.ref` ≠ `refs/tags/<version>` бол workflow зогсоно. Ингэснээр environment-ийн "зөвхөн `v*` tag" дүрэм ажиллана.
2. **Freeze шалгалт (production):** §8.4-ийн календарь (Asia/Ulaanbaatar). Таарвал зогсоно; `override_freeze=true` + `override_reason` өгвөл үргэлжилнэ (2 reviewer-ийн зөвшөөрөл ба run log аудитын мөр болно).
3. **Mirror:** `ghcr.io/<org>/erp-*:<version>` → `${LOCAL_REGISTRY}/erp-*:<version>`.
4. **Pre-checks:** `pgbackrest check`, сүүлийн backup < 26 цаг, PosAPI instance бүрийн `/rest/info` хариу өгч байгаа, дискний зай.
5. **Production:** `pg_create_restore_point('pre-deploy-<version>-<UTC>')` (PITR-ийн тэмдэг).
6. **Migration (expand):** `erp-migrator migrate`, дараа нь `verify` (нууц нь `/run/secrets`-ээр, `erp_migrator` role, PG руу шууд — PgBouncer-гүй). Хуучин app хувилбар шинэ схем дээр ажилласаар байна (§3.3).
7. **Rolling deploy:** app host бүр дээр (`APP_HOSTS`, 2 VM, nginx/LB-ийн ард) `/opt/erp/.env`-ийн `ERP_VERSION`-ийг шинэчилж, `docker compose pull && up -d` хийнэ. `/health/ready` ногоон болохыг ≤ 3 минут хүлээнэ. Болохгүй бол rollout зогсоно (бусад host хуучин хувилбартаа үлдэнэ). Graceful shutdown ([02-architecture.md](./02-architecture.md) §14.5): SIGTERM ирэхэд API `/health/ready`-ээр 503 буцааж LB-ээс гарна, ажиллаж буй хүсэлтийг ≤ 30 s дуусгана; worker шинэ claim хийхээ зогсоож lease-ээ ≤ 60 s дуусгана. Иймээс host-ийн compose-д `stop_grace_period` (api `40s`, worker `75s`), апп-д `HostOptions.ShutdownTimeout`-ийг түүнээс бага утгаар тохируулна (Docker-ийн default 10 s-ийн дараа SIGKILL илгээдэг).
8. **Smoke:** `/health/ready`, `/api/v1/system/version`-ийн `version` == `<version>` (image-ийн `InformationalVersion`; staging-д `sha-<commit>`, production-д `vX.Y.Z`).
9. **Deploy-ийн дараа 30 минут хянах:** posting latency, 5xx, outbox lag, `UNKNOWN` eBarimt.

**GitHub environment.** `staging`: reviewer-гүй, deployment branch нь зөвхөн `main`. `production`: **2 required reviewer** (tech lead + ledger owner эсвэл devops), deployment tag нь зөвхөн `v*`. `vars`: `LOCAL_REGISTRY`, `APP_HOSTS`, `DB_HOST`, `APP_URL`. Production-ий нууцыг GitHub-д хадгалахгүй (§7.3).

**Rollback.**
- **App:** өмнөх tag-аас `cd.yml`-ийг дахин ажиллуулна (`workflow_dispatch`, "Use workflow from" = өмнөх `vX.Y.Z`, version = мөн тэр). Expand/contract дүрмийн ачаар хуучин app шинэ схем дээр ажиллана. Migrator-ийн `migrate` нь хуучин image-д шинэ migration-ийг "мэдэхгүй" тул journal-д байгаа илүү мөрийг зөвшөөрнө (зөвхөн checksum таарахгүйг алдаа гэж үзнэ).
- **Migration:** буцаахгүй (forward-fix). Алдаатай migration-ийг шинэ V файлаар засна.
- **Өгөгдөл:** зөвхөн сүүлийн арга хэмжээ болгон pgBackRest PITR-ээр restore point руу сэргээнэ (RTO ≤ 4 цаг, RPO ≤ 5 мин). Incident commander-ийн шийдвэрээр, runbook-ийн дагуу хийнэ.

---

## 12. Орчны матриц (environment matrix)

Орчнуудыг [02-architecture.md](./02-architecture.md) §12.1-ээс авсан: `local`, `ci`, `staging`, `production`. Тусдаа "dev" сервер байхгүй: багийн нэгдсэн шалгалт ба демо нь `staging` дээр явна (main ногоон болох бүрт автоматаар deploy). Сургалтын демо тенантууд production дотор `is_demo = true` тэмдэгтэй, eBarimt нь stub горимд ажиллана.

| | local | ci | staging | production |
|---|---|---|---|---|
| Зорилго | Хөгжүүлэгчийн машин | Автомат тест | Багийн нэгдсэн шалгалт, демо, release candidate, UAT, eBarimt staging-тай бүрэн шалгалт | Бодит хэрэглэгч |
| Байршил | Laptop, docker compose | GitHub-hosted runner (ephemeral) | Монголын ДТ, production-той ижил топологи, жижиг хэмжээ | Монголын ДТ-1 (үндсэн) + ДТ-2 (нөөц): 2 nginx + VIP, 2 app VM, PG primary + sync standby, PosAPI pool, ops VLAN (observability, runner, registry) |
| `ASPNETCORE_ENVIRONMENT` | `Development` | `Test` | `Staging` | `Production` |
| PostgreSQL | 17 (compose) | 16/17/18 (Testcontainers / service container) | production-той ижил major | 17 эсвэл 18 |
| Өгөгдөл | demo seed + golden | golden + builder | demo seed + synthetic + pilot туршилтын компаниуд. **Prod өгөгдөл хориотой** (нэргүйжүүлсэн хуулбарыг §13.4-ийн дагуу л) | Бодит, 10 жил хадгална |
| eBarimt | WireMock mock | WireMock / in-process stub | **eBarimt staging** (`st-*.ebarimt.mn`, тест мерчант), өөрийн PosAPI staging instance | **eBarimt production**, PosAPI pool (≤ 1000 мерчант/instance) |
| Auth | OpenIddict dev cert, демо хэрэглэгч | тест хэрэглэгч | бодит OIDC, MFA | MFA (Owner, Accountant заавал) |
| Нууц | user-secrets | ephemeral (локал утга) | `/run/secrets` | `/run/secrets` |
| Deploy | гараар | PR/commit бүрт | `main` ногоон болох бүрт (`cd.yml`, `workflow_run`) | `vX.Y.Z` tag + 2 хүний зөвшөөрөл + freeze шалгалт |
| Backup | — | — | pgBackRest өдөр бүр, 7 хоног хадгална | pgBackRest: full 7 хоног тутам (Ням 01:00), differential өдөр бүр, WAL тасралтгүй (`archive_timeout = 60s`), repo1 ДТ-2-т ≥ 35 хоног PITR, repo2-т сарын full 12 сар ([02-architecture.md](./02-architecture.md) §12.5) |
| Observability | Jaeger (локал) | CI log | OTel → ДТ-ийн backend | OTel → Prometheus / Loki / Tempo / Grafana, alert |
| Хандалт | хөгжүүлэгч | CI | баг + pilot нягтлан | ops (2 хүн), break-glass |

---

## 13. Тест өгөгдөл ба seed

### 13.1 Өгөгдлийн ангилал

| Ангилал | Жишээ | Хаана | Хэрхэн ачаалах | Орчин |
|---|---|---|---|---|
| Лавлах (tenant-гүй) | ISO валют, хуулийн огноотой татварын параметр (2027-01-01-ний мөрүүд урьдчилан), БҮНА ангилал, банкны код | baseline-д канон [db/seed](./db/seed/README.md) (`legal_parameters.sql` → `tax.tax_parameter`, `mn_00_catalogs.sql` → `fx.iso_currency`, `rpt.statement_line`, `platform.source_code` г.м.); дараа нь `db/migrations/V####__<module>_<desc>.sql` (шинэ утга = шинэ мөр, хүчин төгөлдөр болох огноотой; [ADR-0014](./adr/ADR-0014-sql-first-migrations.md) №7) | `migrate` | бүгд |
| Загвар (template) | Монголын дансны төлөвлөгөөний загвар, posting setup, дугаарын цувралын загвар, тайлангийн мөр | загвар хүснэгт (`V####__…_template_*.sql`) + модуль бүрийн `ICompanySeeder` (Platform.Contracts) | шинэ компани үүсэхэд кодоор хуулна | бүгд |
| Демо | "Демо ХХК" tenant | `db/seed/demo/S###__*.sql` (master data + ноорог) → `Erp.DevTools demo-post` (posting engine-ээр батлах) | `seed --set demo`, дараа нь `demo-post` | local, staging (prod-д хориотой) |
| Тестийн fixture | builder: `TestData.SalesInvoice().WithLine(...)` | `src/BuildingBlocks/Erp.BuildingBlocks.Testing` | кодоор | ci |
| Golden scenario | `GS-SAL-001-cash-sale-vat.yaml` | `tests/Golden/Scenarios/<area>/` | golden runner | ci, local |

### 13.2 Демо tenant (`seed --set demo`)

- Tenant **"Демо ХХК"**, 2 компани:
  - **"Демо Худалдаа ХХК"** — НӨАТ төлөгч, ТТД `37900846788` (eBarimt staging-ийн тест мерчант; mock ч энэ ТТД-г таньдаг).
  - **"Демо Үйлчилгээ ХХК"** — НӨАТ төлөгч биш.
- Үүрэг тус бүрээр хэрэглэгч: Owner, Accountant, Cashier, Viewer. Нэвтрэх мэдээллийг `db/seed/demo/README.md`-д бичнэ; эдгээр нууц үг зөвхөн `Development` орчинд хүчинтэй. `Staging`-д seed нь демо хэрэглэгчийн нууц үгийг `/run/secrets/Demo__UserPassword`-оос авна (репод байгаа нууц үгээр staging руу нэвтрэх боломжгүй байх ёстой), MFA заавал.
- 10 харилцагч (B2B ТТД-тэй ба B2C), 5 нийлүүлэгч, БҮНА кодтой 20 бараа, эхний үлдэгдэл, нэг сарын баримт (нэхэмжлэх, төлбөр, худалдан авалт, валютын гүйлгээ).
- Seed нь **idempotent**: тогтмол UUID ба `ON CONFLICT DO NOTHING`. Runner seed-ийг `erp_migrator` → `SET ROLE app_owner`-оор ажиллуулна. FORCE RLS эзэмшигчид ч үйлчилдэг тул tenant/компани бүрийн өмнө `platform.fn_set_context(tenant, company, user, request)`-ээр (`app.tenant_id`, `app.company_id`, `app.user_id`) заавал тохируулна (аудит trigger мөн эдгээрийг уншдаг).
- Seed SQL нь ledger хүснэгтэд (`gl_transaction`, `gl_entry`, `vat_entry`, `*_ledger_entry`, `detailed_*`) шууд INSERT **хийхгүй** (§2.4 дүрэм №5; цоорхойгүй counter ба hash chain эвдэрнэ). Эхний үлдэгдлийг `OPENING` ваучерын **ноорог**, бусад баримтыг ноорог хэлбэрээр оруулна. Тэдгээрийг `dotnet run --project tools/Erp.DevTools -- demo-post` батална: модулиудыг in-process ачаалж (`Add<M>Module()`), `ConnectionStrings:App`-аар `IPostingService`-ийг дуудна. Аль хэдийн батлагдсан ноорог үлдэхгүй тул дахин ажиллуулахад аюулгүй.
- `seed --set demo` нь `Production` орчинд ажиллахаас татгалзана.
- Seed файлын нэр: `S001__demo_tenant.sql`, `S002__demo_master_data.sql`, …
- Seed-ийг migration-ий хамгийн сүүлийн хувилбартай нийцүүлж байх нь хөгжүүлэгчийн үүрэг. CI-ийн Path B (§10) өмнөх release-ийн seed ба `demo-post`-ийг ажиллуулж шалгадаг.

### 13.3 Golden scenario

- Файл: `tests/Golden/Scenarios/<area>/GS-<AREA>-<NNN>-<slug>.yaml`. `<AREA>` нь `GL`, `SAL`, `PUR`, `CASH`, `FX`, `FA`, `INV`, `VAT`, `EBR`, `CLOSE` гэх мэт.
- Бүтэц: `setup` (дансны төлөвлөгөө, параметр, эхний үлдэгдэл) → `steps` (баримтууд, reversal, хаалт) → `expect` (G/L, VAT, sub-ledger бичилт, trial balance, тайлангийн мөр). Яг схемийг golden scenario-ийн тусдаа баримт тодорхойлно. Энд байршил, ажиллуулах арга, хянах дүрмийг л заана.
- Толгойд `signedOffBy` (нягтлан бодогч, огноо) ба `rules: NOW | 2027` заавал. Гарын үсэггүй scenario-г CI алгасахгүй, харин **унагана**.
- Унавал runner `*.actual.yaml` ба `*.diff.md` үүсгэнэ (CI artifact `golden-diffs`).
- Жишээ (хялбаршуулсан, `GS-SAL-001`): 2 ширхэг бараа × 11,000₮ (НӨАТ 10% шингэсэн), бэлнээр төлсөн.
  - Нэхэмжлэх: Дт Авлага 22,000; Кт Борлуулалтын орлого 20,000; Кт НӨАТ-ын өглөг 2,000.
  - Төлбөр: Дт Касс 22,000; Кт Авлага 22,000.
  - Хүлээгдэх үр дүн: авлагын үлдэгдэл 0, trial balance = 0, eBarimt `B2C_RECEIPT` нэг (mock).

### 13.4 Production өгөгдөл

Production өгөгдлийг доод орчин (staging, local) руу **хуулахыг хориглоно** (Хувь хүний мэдээлэл хамгаалах тухай хууль). Incident-ийг давтан гаргахын тулд өгөгдөл хэрэгтэй бол: `tools/Erp.DevTools anonymize` (регистр, civil_id, нэр, утас, имэйл, хаягийг сольж, дүнг хэвээр үлдээнэ). Энэ үйлдлийг хувийн мэдээллийн хариуцагч + CTO бичгээр зөвшөөрч, зөвхөн staging-д, 14 хоногийн дотор устгах нөхцөлтэйгээр хийнэ.

---

## 14. eBarimt PosAPI staging хандалт

> **Нууц үг энд байхгүй.** Туршилтын орчны хаяг, тест мерчант нь [`research/mn-integrations-market.md` §2.5](./research/mn-integrations-market.md)-д бий. Операторын туршилтын данс болон хялбар бүртгэлийн тест хэрэглэгчийн нэвтрэх мэдээллийг тэр research note-ийн эх сурвалж (`ebarimt-integration` skill, §8 "Туршилтын орчин")-оос авч, багийн нууц үгийн санд (password vault) "eBarimt staging" бичлэг болгон хадгална. Тэндээс авна. Repo, баримт, чат, тикетэд хуулахгүй.

**Туршилтын орчны үндсэн мэдээлэл** (research note §2.5):

| | Утга |
|---|---|
| Операторын портал | `https://st-operator.ebarimt.mn` |
| E-Invoice (staging) | `https://stg-invoice.ebarimt.mn` (эхлээд оператор системд нэвтэрсэн байх) |
| Auth realm | `https://st.auth.itc.gov.mn/auth/realms/Staging` (`client_id`: `api.ebarimt.mn`-д `vatps`, `service.itc.gov.mn`-д `e-inventory`) |
| Тест мерчант | ТТД `37900846788` |
| Хязгаарлалт | **Ачааллын тест хийхийг хориглоно.** PosAPI зөвхөн Монголын IP-аас, дотоод сүлжээнд |
| Асуулт | posapi@itc.gov.mn |

**Алхмууд (ebarimt-owners хариуцна, хөгжүүлэгч бүр давтах шаардлагагүй):**

1. **Эрх хүсэх:** tech lead-ээс "eBarimt staging" vault бичлэгийн эрх ба ДТ-ийн VPN эрх авна. Монголоос гадна байгаа бол VPN-ээр Монголын IP авна.
2. **Staging PosAPI instance:** ДТ-ийн staging сүлжээнд `posapi-stg-01` VM дээр PosAPI 3.0-ийн түгээлтийг developer.itc.gov.mn-ээс татаж суулгана. Тухайн хувилбарын (одоо v3.2.48) суулгах зааврыг дагана: диск ≥ 1 GB, сүлжээ ≥ 80 Mbps, DB ping < 100 ms, NTP синк заавал.
3. **Идэвхжүүлэх:** `http://posapi-stg-01:7080/web/` дээр туршилтын операторын данс (vault)-аар нэвтэрч идэвхжүүлнэ.
4. **Мерчант холбох:** Staging auth realm-аас token авч (`grant_type=password`, `client_id=vatps`), `saveOprMerchants`-аар тест мерчант `37900846788`-ийг оператортоо бүртгэнэ. Мерчантын талаас `stg-invoice.ebarimt.mn`-д баталгаажуулна.
5. **Шалгах:** `curl http://posapi-stg-01:7080/rest/info` → `merchants`-д тест мерчант харагдана, `leftLotteries` > 0.
6. **Апп тохируулах (staging env):** `Ebarimt__PosApi__Instances__0__Name=stg-01`, `Ebarimt__PosApi__Instances__0__BaseUrl=http://posapi-stg-01:7080`, `Ebarimt__Auth__Authority=https://st.auth.itc.gov.mn/auth/realms/Staging` (нууцгүй тул env-д болно); операторын нэвтрэх мэдээлэл ба `X-API-KEY` → `/run/secrets/Ebarimt__Auth__Username`, `…__Password`, `Ebarimt__OperatorApiKey` (vault-аас, §7).
7. **Smoke:** `dotnet run --project tools/Erp.DevTools -- ebarimt-smoke --posapi http://posapi-stg-01:7080 --tin 37900846788`. Энэ нь 1 мөртэй B2C баримт илгээж, ДДТД (33 орон) авч, `DELETE /rest/receipt`-ээр буцаана. `qrData`/`lottery`-г хэвлэхгүй, хадгалахгүй, зөвхөн уртыг нь шалгана.
8. **Хөгжүүлэгчийн локал хандалт (debug-д л):** `ssh -L 7080:posapi-stg-01:7080 bastion.stg` → локал `Ebarimt:PosApi:Instances:0:BaseUrl=http://localhost:7080` (mock-оо унтраана). `posNo`-г хөгжүүлэгч бүрт тусад нь олгоно (`billIdSuffix` өдөрт давтагдахгүй байх ёстой).
9. **Өдөр бүрийн job:** staging дээр ч `sendData` (Quartz) ба `/rest/info`-ийн хяналт (`leftLotteries < 100`, сүүлд илгээснээс хойш > 48 цаг) ажиллана.

**eBarimt дээр ажиллахад анхаарах 6 зүйл:** (1) `POST /rest/receipt`-ийг автоматаар retry хийхгүй, timeout ⇒ `UNKNOWN` ⇒ operator UI; (2) `qrData`/`lottery` хаана ч хадгалагдахгүй; (3) толгойн дүнг мөрүүдийн нийлбэрээс гаргана; (4) `billIdSuffix` = `posNo` (3) + `ebarimt.pos_counter mod 10^6` (6 орон): counter нь posting transaction-д олгогдож, өдөр бүр **тэглэгддэггүй**; өдөрт давтагдахгүйг DB-ийн UNIQUE constraint баталгаажуулна ([ADR-0012](./adr/ADR-0012-outbox-idempotency-ebarimt.md)); (5) staging дээр ачааллын тест хийхгүй; (6) хариуны талбарын нэрийг албан ёсны spec-тэй тулгаж mock-оо шинэчилнэ.

---

## 15. Шинэ хөгжүүлэгчийн onboarding checklist

### 15.1 1-р өдөр

- [ ] Эрх: GitHub org ба багууд (CODEOWNERS), чат, тикет систем, багийн нууц үгийн сан (зөвхөн хэрэгтэй бичлэгүүд), Монголын ДТ-ийн VPN (staging, шаардлагатай бол).
- [ ] GitHub данс дээр 2FA ба SSH эсвэл signing түлхүүр; `git config user.email` нь байгууллагын имэйл.
- [ ] §5.1-ийн хэрэгслүүдийг суулгаж `dotnet --version`, `node -v`, `docker compose version`, `psql --version`-ийг шалгасан.
- [ ] §0-ийн командуудаар бүх зүйлийг асааж, демо компанид нэхэмжлэх үүсгэж, posting preview → post хийж, Jaeger-аас trace олсон.
- [ ] Unit ба architecture тест локалд ногоон.
- [ ] Уншсан: энэ баримт (§1–§4 заавал), [02-architecture.md](./02-architecture.md) §5–§7, `research/tech-architecture.md` §1, §3, §4, §5, ADR-ийн жагсаалт (ADR-0004, 0006, 0007, 0008, 0012, 0014 заавал).
- [ ] IDE-д §17-ийн өргөтгөлүүдийг суулгаж, `.editorconfig`-ийг уншиж байгааг шалгасан (C# файл хадгалахад формат автоматаар засагдана).
- [ ] Buddy (ledger-owners-ийн нэг гишүүн)-тэй танилцаж, эхний `good first issue`-г авсан.

### 15.2 1-р долоо хоног

- [ ] Эхний PR merge хийгдсэн (жижиг: seed, i18n текст, тест нэмэх гэх мэт). PR template-ийг бүрэн бөглөсөн.
- [ ] Integration ба golden тестийг локалд ажиллуулсан. Нэг golden scenario-г уншиж, хүлээгдэх бичилтийг гараар тооцож шалгасан.
- [ ] Ledger owner-тэй 1 цагийн posting walkthrough: BC CU12 "Gen. Jnl.-Post Line" ↔ манай `IPostingService`; append-only, reversal, gapless дугаар, advisory lock, preview = rollback.
- [ ] Нягтлан бодох бүртгэлийн үндэс (1–2 цаг, нягтлан бодогчтой): давхар бичилт, НӨАТ ба НХАТ, авлага/өглөг, тооцоо хаах, валютын тэгшитгэл, сарын хаалт.
- [ ] eBarimt урсгалыг (§14, research §2) уншиж, mock дээр timeout (`99999999901`) ба rejected (`99999999902`) тохиолдлыг үзсэн. `UNKNOWN`-ийг гараар шийдэх runbook-ийг уншсан.
- [ ] Хувийн мэдээлэл хамгаалах ба аюулгүй байдлын сургалт (30 мин): §3.6, §7, §13.4.
- [ ] CI pipeline-ийн бүх job-ыг нэг PR дээр дагаж үзсэн. Унасан job-ын artifact (golden-diffs, test results)-ийг хаанаас татахыг мэддэг болсон.
- [ ] Code review-д оролцсон (дор хаяж 2 PR, ажиглагчаар).

---

## 16. Sprint 0: репозиторийн skeleton (эхний долоо хоног)

Шинэ репод эхний 5 өдөр дараах PR-уудыг хийнэ. PR бүр ≤ 1 өдөр, CI ногоон байна.

| # | PR | Эзэн | Агуулга |
|---|---|---|---|
| 1 | `build: scaffolding from starter` | devops | `starter/`-ийг хуулж, ruleset, environment, CODEOWNERS багуудыг тохируулна |
| 2 | `build: solution and empty projects` | tech lead | `Erp.slnx`, 3 host, 6 BuildingBlocks, 13 модуль × 5 давхарга, 4 тест төсөл, `tools/Erp.DevTools`, project reference-ууд (§2.4), `launchSettings.json` (Api 5100, Worker 5200), `packages.lock.json` |
| 3 | `feat(db): migrator` | platform | `Erp.Migrator` (өөрийн runner, ADR-0014): journal `platform.schema_migration` (SHA-256 checksum), `SET ROLE app_owner`, psql `\set` мөрийг алгасах, `lock_timeout 5s` + 3 удаа retry, session advisory lock, `-- migrator: no-transaction`, `--connection`, `migrate/verify/seed/info/reset`, Production-д demo seed хориг; runner-ийн integration тест |
| 4 | `feat(db): canonical baseline` | ledger-owners + devops | Канон `db/schema/000…920`, `db/seed`, `db/tests`, `db/apply.sh`-ийг **өөрчлөлтгүй** хуулна (domain `platform.amount`…, `platform.fn_set_context`, `platform.fn_lock_company_posting`, `platform.fn_next_document_no`/`fn_next_entry_no`, `platform.fn_guard_immutable`, RLS `tenant_isolation`/`company_isolation`, `audit.fn_row_change`; group role `app_*`); `Erp.Migrator` тэдгээрийг embed хийнэ; CI нь `migrate` (эхнийх нь superuser) → `verify` → `db/tests/*.sql`-ийг ажиллуулна. Дараа нь `V0001__integration_quartz_tables.sql` (Quartz-ийн `qrtz_*`; `quartz` схемийг `app_owner` эзэмшилтэйгээр 000-д нэмэх нь канон схемд шаардлагатай өөрчлөлт — [02-architecture.md](./02-architecture.md) "Нийцүүлэлтийн тэмдэглэл") |
| 5 | `feat(platform): building blocks` | tech lead | `Erp.BuildingBlocks.Domain` (`Monetary/MoneyMath` + tie тест, `Money`, `BusinessDate`, `Result<T>`), `IBusinessCalendar`, `TimeProvider` бүртгэл, `TenantSession`, `TenantScope`, `DecimalStringJsonConverter`, ProblemDetails, Idempotency filter, `AddValidation()`, `AddKeyPerFile("/run/secrets")`, OTel тохиргоо |
| 6 | `test: fixtures and first guards` | platform | `PostgresFixture`, анхны RLS тест (tenant A ≠ B, контекстгүй query алдаа өгөх), ledger immutability тест, §2.4-ийн 14 architecture дүрэм |
| 7 | `feat(web): SPA skeleton` | frontend | Vite + React + TS, i18n (`mn`/`en`), BFF login, AG Grid жишээ, `Money` төрөл, ESLint хориг, `api:gen` |
| 8 | `feat(ebarimt): adapter skeleton` | ebarimt-owners | PosAPI client (mock-той), outbox state machine `PENDING → SENT / REJECTED / UNKNOWN → RESOLVED`, retry хийхгүй гэдгийг тест баталгаажуулна |
| 9 | `ci: green pipeline + staging deploy` | devops | Бүх CI job skeleton дээр ногоон; `deploy/hosts/` (app host-ийн compose: `/run/secrets`, `stop_grace_period`, read-only root FS); runner host бэлэн (§11); `staging` орчинд `cd.yml` анх ажилласан |
| 10 | `test(golden): GS-GL-001` | ledger-owners + нягтлан | Энгийн ерөнхий журнал → G/L → trial balance; golden runner end-to-end |

Skeleton үүсгэх скрипт (PR #2):

```bash
dotnet new sln -n Erp --format slnx
# Erp.Worker is also a "web" host: BackgroundServices + Quartz + /health endpoints on its own port.
for h in Erp.Api:web Erp.Worker:web Erp.Migrator:console; do
  n=${h%%:*}; t=${h##*:}; dotnet new "$t" -o "src/$n" -n "$n"; dotnet sln Erp.slnx add "src/$n/$n.csproj" --solution-folder Hosts
done
# Properties/launchSettings.json: Erp.Api -> http://localhost:5100, Erp.Worker -> http://localhost:5200 (§5.4)
for b in Erp.BuildingBlocks.Domain Erp.BuildingBlocks.Application Erp.BuildingBlocks.Infrastructure Erp.BuildingBlocks.Api Erp.BuildingBlocks.Documents Erp.BuildingBlocks.Testing; do
  dotnet new classlib -o "src/BuildingBlocks/$b" -n "$b"
  dotnet sln Erp.slnx add "src/BuildingBlocks/$b/$b.csproj" --solution-folder BuildingBlocks
done
for m in Platform GeneralLedger Tax Parties Sales Purchases CashBank Currency FixedAssets Inventory Reporting EBarimt Integration; do
  for l in Contracts Domain Application Infrastructure Api; do
    dotnet new classlib -o "src/Modules/$m/$l" -n "Erp.$m.$l"
    dotnet sln Erp.slnx add "src/Modules/$m/$l/Erp.$m.$l.csproj" --solution-folder "Modules/$m"
  done
done
for t in Unit Architecture Integration Golden; do
  dotnet new console -o "tests/$t" -n "Erp.Tests.$t"   # xUnit v3 test project = Exe (Directory.Build.props adds packages)
  rm -f "tests/$t/Program.cs"                           # xUnit v3 generates the entry point itself
  dotnet sln Erp.slnx add "tests/$t/Erp.Tests.$t.csproj" --solution-folder Tests
done
dotnet sln Erp.slnx add tools/Erp.Analyzers/Erp.Analyzers.csproj --solution-folder Tools   # starter-ээс ирсэн
dotnet new console -o tools/Erp.DevTools -n Erp.DevTools                                     # new-migration, new-scenario, demo-post, ebarimt-smoke, anonymize
dotnet sln Erp.slnx add tools/Erp.DevTools/Erp.DevTools.csproj --solution-folder Tools
find src tests -name 'Class1.cs' -delete
# csproj дахь <TargetFramework>, <Nullable>, <ImplicitUsings>-ийг устгана: Directory.Build.props тохируулна.
dotnet restore Erp.slnx --force-evaluate   # packages.lock.json үүсгэнэ, commit хийнэ
```

> **Тэмдэглэл (2026-10-08):** `dotnet sln Erp.slnx add <олон төсөл> --solution-folder X` нь .NET SDK 10.0.401 дээр solution folder-ийг буруу онооно (бүх төсөл эхний folder-т орсон). Төсөл бүрийг тусад нь нэмэх, эсвэл `Erp.slnx`-ийг гараар засна (starter-ийн `Erp.slnx`-ийг үз).

### 16.1 Sprint 0 skeleton — starter-д бэлэн (2026-10-08)

[`starter/`](./starter/) нь PR #2–#6, #10-ын **хамгийн бага, ажилладаг хувилбарыг** аль хэдийн агуулна. Шинэ репод `cp -r starter/. .` хийсэн өдрөөсөө доорх командууд ногоон байна; Sprint 1 нь модулиудыг үүн дээр нэмнэ. Дэлгэрэнгүй (бүтэц, curl жишээ, хэрэгжсэн/stub хүснэгт): [`starter/README.md`](./starter/README.md) "Sprint 0 walking skeleton".

**Build / ажиллуулах / тест** (репо root-оос; .NET 10 SDK, PostgreSQL 16+):

```bash
dotnet restore                       # packages.lock.json (CI: --locked-mode)
dotnet build -c Release              # 0 warning (TreatWarningsAsErrors, ERP0001, RS0030, CA/MA/IDE дүрмүүд)
dotnet test                          # Unit + Architecture + Integration
# Integration: ERP_TEST_DB (libpq "key=value" эсвэл Npgsql формат) — DB/role/extension үүсгэх эрхтэй хэрэглэгч.
# Default: "host=localhost port=5432 user=postgres password=postgres dbname=erp_skeleton_test" (= deploy/docker-compose.yml ба CI). DB-г DROP/CREATE → Erp.Migrator
# migrate + seed + verify → тест бүрд шинэ компани (platform.fn_provision_company_mn, НӨАТ төлөгч, 2026–2027 он).
ERP_TEST_DB="host=localhost port=5432 user=postgres password=postgres dbname=erp_skeleton_test" dotnet test
dotnet test --project tests/Integration/Erp.Tests.Integration.csproj -- --filter-namespace Erp.Tests.Integration.Golden
python3 tools/ci/validate-golden.py  # golden JSON ↔ tests/Golden/golden-scenario.schema.json (16 §11.6)

dotnet run --project src/Erp.Migrator -- migrate --connection "<superuser/ops connection>"   # db/schema 000…920
dotnet run --project src/Erp.Migrator -- seed    --connection "…"                             # legal_parameters + mn_*
dotnet run --project src/Erp.Migrator -- verify  --connection "…"                             # checksum + catalog_checks.sql
ConnectionStrings__App="…erp_app…" dotnet run --project src/Erp.Api                          # http://localhost:5100/health/ready
```

**Баталгаажуулсан үр дүн (2026-10-08, .NET SDK 10.0.401, PostgreSQL 16.15):** 19 төсөл 0 warning / 0 error; `dotnet test` **125/125** (Unit 66, Architecture 38, Integration 21); `dotnet format whitespace/style --verify-no-changes` цэвэр; migrator-оор суулгасан DB дээр `db/tests/{catalog_checks,smoke,seed_checks}.sql` бүгд PASS; `ci.yml` actionlint 0 алдаа.

**Хэрэгжсэн (ажилладаг, тестлэгдсэн):**

| Хэсэг | Төсөл / файл | Тест |
|---|---|---|
| `MoneyMath` (AwayFromZero, UP/DOWN абсолют утгаар, `IsRounded`, running-remainder `Allocate`), `Money`, `CurrencyCode`, `Result`/`Error` | `Erp.BuildingBlocks.Domain` (shared kernel) | tie тохиолдол (§4.2 #12), FsCheck: Σ хуваарилалт = нийт |
| `TenantSession` (BEGIN + `platform.fn_set_context` + `lock_timeout`/`statement_timeout`, сонголттой `Database:SessionRole`), `ITenantTransactionRunner`, `IBusinessCalendar` + `TimeProvider`, `DecimalStringJsonConverter`, ProblemDetails `errors[]` | `Erp.BuildingBlocks.*` | JSON: number → 400, string → decimal |
| Posting engine (§5.2): advisory lock, түгжээний доорх шалгалт (тэнцэл яг, бөөрөнхийлөлт, ≥ 2 мөр, POSTING/blocked/direct posting, OPEN үе + компанийн цонх, шалтгааны код, writer), `fn_next_document_no` (gapless GJ) + `fn_next_entry_no`, `gl_transaction`/`gl_entry`/`gl_register`, `SET CONSTRAINTS ALL IMMEDIATE`, SQLSTATE (`ERB01`, `ERP01`, `ERG01`, `ERN0x`, `55P03`) → код; preview = ижил код + ROLLBACK | `Erp.GeneralLedger.Infrastructure.Posting` (+ `Posting/Sql/*.sql`) | тэнцсэн/тэнцээгүй, хаалттай үе, үегүй огноо, цонх, хяналтын/heading данс, preview, 20 зэрэгцээ posting завсаргүй |
| Журнал → `PostingDocument` (ваучер = баримтын № + огноо, BR-PST-27 дараалал, мөрийн тэнцэл, хоёр талт мөр); `POST /api/v1/companies/{id}/gl/postings[:preview]` | `Erp.GeneralLedger.Application/Api` | integration + golden |
| Журналын НӨАТ (gross, `NORMAL`): `IJournalVatHandler` (Tax), `tax.vat_entry` + `gl_entry_vat_entry_link` суурь мөртэй, НӨАТ-ын үеийн шалгалт | `Erp.Tax.*` | 110 000 → 100 000 + 10 000 (борлуулалт, худалдан авалт), I-06 |
| Буцаалт (§5.10): эх огноо/дугаар, эсрэг тэмдэг = эсрэг багана (D-C3), `platform.fn_ledger_update`-ээр эх мөр/гүйлгээ/register-ийг тэмдэглэх, VAT entry-ийн толин тусгал; `POST …/gl-transactions/{no}:reverse` | `ReversalService`, `VatEntryWriter` | давхар буцаалт 409, буцаалтыг буцаах 409, шалтгаангүй 422 |
| `Erp.Migrator` (ADR-0014): `migrate`/`seed`/`verify`/`info`, journal `platform.schema_migration`, script бүр нэг transaction, schema = versioned, seed = repeatable | `src/Erp.Migrator` | fixture бүр хоосон DB-ээс |
| Architecture дүрэм §2.4: #1, #2, #3 (модулийн хил, GL ↛ Tax), #4, #5 (ledger SQL эзэмшил), #6, #7, #8, #9 (handler sealed), #13 | `tests/Architecture` (ArchUnitNET + reflection) | non-vacuity шалгалттай |
| Golden runner (16 §11.8-ийн дэд олонлог): JSON, `journal.post/preview`, `transaction.reverse`, preview = post (I-09), I-01/06/07/08, `GS-E0xx` код; дэмжээгүй түлхүүр → `GS-E090` | `tests/Integration/Golden`, `tests/Golden/Drafts/{gl,vat}` | self-test: буруу дүн/код/дугаар барина |

**Stub эсвэл хараахан байхгүй (Sprint 1+):** нэвтрэлт/BFF/OpenIddict ба `RequirePermission` (tenant нь `X-Erp-Tenant-Id` dev header — зөвхөн локал/CI), `Idempotency-Key`, `ETag/If-Match`, ноорог журналын resource (`/journals/{id}:post`), OpenAPI үүсгэлт, OTel, outbox, `Erp.Worker` (зөвхөн `/health/live`), dimension, `CUSTOMER`/`VENDOR`/`BANK_ACCOUNT` журналын тал (Parties/CashBank writer), `REVERSE_CHARGE`/`FULL_VAT`/хасагдахгүй НӨАТ (тодорхой алдааны код буцаана), register бүхэлд буцаах, хаалттай үеийн залруулгын санал, жилийн хаалт, `Erp.DevTools`, `seed --set demo`, `reset`, `db/migrations/V####`, Testcontainers (`ERP_TEST_PG_IMAGE`), тусдаа `Erp.Tests.Golden` (YAML, `extends`, `variants`, `*.actual.yaml`), `audit.posting_log` (доорх алдаа).

**Нэршлийн зөрүү (энэ баримт давамгайлна):** Sprint 0-ийн даалгаварт `Erp.SharedKernel`, `tests/Erp.UnitTests`, `tools/Erp.Migrator`, `tests/golden/*.json` гэж бичсэн; skeleton нь §2.1-ийн дагуу `Erp.BuildingBlocks.Domain`, `tests/{Unit,Architecture,Integration}/Erp.Tests.*`, `src/Erp.Migrator`, `tests/Golden/{Scenarios,Drafts}/<area>/GS-*.json` (16 §11.2) хэрэглэсэн.

**Канон схемийн алдаа (skeleton илрүүлсэн, schema change request):** `audit.posting_log` нь `platform.ledger_guard`-д бүртгэлтэй тул `trg_posting_log_before_insert` (`platform.fn_ledger_before_insert`) нь `NEW.created_at`-ийг оноодог, гэтэл хүснэгтэд `created_at` алга → ямар ч INSERT `42703`-аар унана. Санал: `created_at timestamptz NOT NULL DEFAULT now()` нэмэх (эсвэл энэ хүснэгтийг before-insert trigger-ээс чөлөөлөх). Засагдтал engine BR-PST-67-ийн posting log-ийг бичихгүй.

---

## 17. Санал болгох IDE өргөтгөл

**VS Code** ([`starter/.vscode/extensions.json`](./starter/.vscode/extensions.json) нээхэд автоматаар санал болгоно):

| Өргөтгөл | ID | Юунд |
|---|---|---|
| C# Dev Kit, C# | `ms-dotnettools.csdevkit`, `ms-dotnettools.csharp` | .NET 10, test explorer (MTP), debug |
| EditorConfig | `editorconfig.editorconfig` | `.editorconfig`-ийн дүрэм |
| ESLint, Prettier | `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode` | `web/` |
| Vitest, Playwright | `vitest.explorer`, `ms-playwright.playwright` | Frontend ба E2E тест |
| PostgreSQL | `ms-ossdata.vscode-pgsql` | Query, schema browser |
| Container Tools | `ms-azuretools.vscode-containers` | Compose, log |
| YAML, GitHub Actions | `redhat.vscode-yaml`, `github.vscode-github-actions` | Workflow, compose, golden YAML |
| i18n Ally | `lokalise.i18n-ally` | `locales/mn`, `locales/en` түлхүүр, дутуу орчуулга |
| REST Client | `humao.rest-client` | `tools/http/*.http` |
| GitLens, markdownlint, Code Spell Checker | `eamodio.gitlens`, `davidanson.vscode-markdownlint`, `streetsidesoftware.code-spell-checker` | Git түүх, баримт |

**JetBrains Rider:** .NET 10, EditorConfig, Database tools (DataGrip), `.http` client, Docker, ESLint/Prettier нь суурилагдсан. Нэмэлтээр: *Conventional Commit*, *.env files support*, *Rainbow CSV* (банкны хуулгын дээж). Settings → Editor → Code Style → "Enable EditorConfig support" идэвхтэй байх. Rider-ийн өөрийн formatter-ийг `.editorconfig`-оос давуу болгож болохгүй.

---

## 18. Асуудал шийдвэрлэх (troubleshooting)

| Шинж тэмдэг | Шалтгаан | Шийдэл |
|---|---|---|
| `postgres` асахгүй, `port is already allocated` | Локалд өөр PostgreSQL 5432 дээр байна | `ERP_PG_PORT=55432 docker compose … up -d`, connection string-д порт солих |
| Role/DB байхгүй (`role "erp_app" does not exist`) | Volume өмнө нь үүссэн тул init script ажиллаагүй | `docker compose -f deploy/docker-compose.yml down -v`, дараа нь `up -d` |
| `unrecognized configuration parameter "app.tenant_id"` эсвэл `invalid input syntax for type uuid: ""` | `app.tenant_id` тохируулаагүй (RLS fail-closed) | Transaction-ийг `TenantSession`-оор нээх; psql-д `BEGIN; SELECT set_config('app.tenant_id','<uuid>',true);` |
| Query 0 мөр буцаана | Буруу (өөр) tenant/company контекст. Контекст огт тохируулаагүй бол 0 мөр биш, алдаа гарна (fail-closed, D-K6) | psql-д `SELECT current_user, current_setting('app.tenant_id', true), current_setting('app.company_id', true);` |
| Ledger INSERT: `company_id` таарахгүй гэсэн алдаа | `app.company_id` тохируулаагүй эсвэл өөр компани | `TenantSession`-ийг зөв компанитай нээх (BEFORE INSERT trigger шалгадаг) |
| `permission denied for table gl_entry` (UPDATE/DELETE) эсвэл `ledger is append-only` | Ledger-ийг засах гэсэн | Зориуд хориглосон. Reversal posting хийнэ |
| `Erp.Migrator`: `checksum mismatch for V00NN` | `main`-д орсон migration-ийг засварласан | Засварыг буцааж шинэ V файл үүсгэ. Локалд merge хийгдээгүй файл бол `reset --i-know-this-is-local` |
| CI: `Duplicate migration versions` | Өөр PR ижил дугаар авсан | Өөрийнхөө файлыг дараагийн чөлөөтэй дугаар руу rename хийнэ |
| `Testing with VSTest target is no longer supported by MTP` | `global.json`-д `test.runner` алга эсвэл SDK < 10 | starter-ийн `global.json`-ийг хуулах, `dotnet --version` ≥ 10.0.100 |
| Testcontainers: `Docker is either not running or misconfigured` | Docker асаагүй / socket эрх | Docker Desktop асаах; Linux: `sudo usermod -aG docker $USER`; Podman: `DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock`, `TESTCONTAINERS_RYUK_DISABLED=true` |
| `NU1004` (locked mode restore) | Багц нэмсэн ч lock file шинэчлэгдээгүй | `dotnet restore Erp.slnx --force-evaluate`, `packages.lock.json`-ийг commit хийнэ |
| `NU1903`/`NU1904` | Эмзэг (vulnerable) багц | Хувилбар шинэчлэх. Түр зөвшөөрөл зөвхөн tech lead + ADR |
| `RS0030` (banned API) | `Math.Round`, `DateTime.Now`, `Guid.NewGuid`, culture-гүй `decimal.Parse` | `MoneyMath.Round(value, decimals)`, `TimeProvider` / `IBusinessCalendar`, `Guid.CreateVersion7()`, `decimal.Parse(s, NumberStyles.Number, CultureInfo.InvariantCulture)` |
| `ERP0001` | Мөнгөний кодонд `double`/`float`/`Half` (зарлалт, literal `1.5`, cast, `Math.Sqrt`) | `decimal` ба `m` дагавар (`1.5m`). Гадаад API double шаардвал Infrastructure давхаргад хөрвүүлнэ |
| `MA0049` (type name = namespace) | `Money` төрөл `…Money` namespace-д | Хавтас/namespace нь `Monetary` (`Erp.BuildingBlocks.Domain.Monetary`) |
| `EnableGenerateDocumentationFile` алдаа | Төсөлд `GenerateDocumentationFile=false` тавьсан | Устгах: IDE0005 build дээр шалгагддаг тул бүх төсөлд `true` байх ёстой |
| `CA1305` / `MA0011` | Culture-гүй `ToString`/`Parse` | `CultureInfo.InvariantCulture`; UI-д `mn-MN`-ийг ил тодоор |
| API `400 money.must_be_string` | Клиент дүнг JSON number-ээр илгээсэн | `Money` string төрөл ашиглах (generated client) |
| PDF-д Ө, Ү харагдахгүй (□) | Фонт бүртгээгүй / image-д фонт алга | QuestPDF-д Noto Sans бүртгэх; image нь `fonts-noto-core` агуулдаг |
| Posting удаан, хүлээгдэнэ | Нэг компанийн advisory lock-ийг урт transaction барьж байна | `SELECT pid, now()-xact_start, query FROM pg_stat_activity WHERE wait_event_type='Lock';`, `pg_locks WHERE locktype='advisory'`. Posting transaction дотор гадаад дуудлага хийхгүй |
| PosAPI mock `404` | Mapping ачаалагдаагүй / зам буруу | `curl localhost:7080/__admin/mappings`; `docker compose logs posapi-mock` |
| eBarimt баримт `UNKNOWN` (локал) | `merchantTin = 99999999901` (зориуд timeout) | Хүлээгдэж буй үр дүн. Operator UI-ээр шийдэх урсгалыг тест |
| Staging PosAPI: `Connection refused :7080` | VPN/Монголын IP алга эсвэл PosAPI идэвхжээгүй | VPN шалгах; `http://posapi-stg-01:7080/web/`-ээр операторын идэвхжүүлэлт |
| Staging token: `401` | `client_id` буруу | `api.ebarimt.mn` → `vatps`, `service.itc.gov.mn` → `e-inventory` |
| Jaeger-д trace алга | OTLP endpoint буруу | `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`; `docker compose logs otel-collector` |
| Баримтын огноо зөрүүтэй | Host-ийн цаг NTP-гүй (PosAPI татварын серверийн цагийг хэрэглэдэг) | NTP синк (`timedatectl`) |
| Windows: build удаан, `CRLF` diff | Репо Windows файлын системд, autocrlf | Репог WSL (`~/src`)-д, `git config core.autocrlf false` |
| psql-д кирилл эвдэрнэ (Windows) | Console codepage | `chcp 65001`, `set PGCLIENTENCODING=UTF8` |
| Node хувилбар буруу | `.nvmrc`-ийг ашиглаагүй | `nvm use` (24) |

---

## 19. Starter файлууд ба холбоотой баримт

[`starter/`](./starter/) хавтас нь шинэ репозиторийн root-тай ижил бүтэцтэй. Файл бүрийн тайлбар, баталгаажуулалтын үр дүн [`starter/README.md`](./starter/README.md)-д байгаа.

| Файл (репо дахь зам) | Хэсэг |
|---|---|
| `deploy/docker-compose.yml`, `deploy/otel-collector.yaml`, `deploy/posapi-mock/mappings/*.json`, `db/init/01-roles.sql` | §5, §6 |
| `.github/workflows/ci.yml` | §10 |
| `.github/workflows/cd.yml`, `deploy/docker/Dockerfile` | §11 |
| `.github/workflows/sensitive-review.yml`, `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/dependabot.yml`, `.github/actionlint.yaml` | §8, §10 |
| `.editorconfig`, `Directory.Build.props`, `Directory.Packages.props`, `BannedSymbols*.txt`, `global.json`, `nuget.config`, `.gitignore`, `.gitattributes`, `.dockerignore`, `.nvmrc` | §3, §4 |
| `tools/Erp.Analyzers/*` (ERP0001) | §4.2 |
| `.config/dotnet-tools.json`, `tools/licenses/*.json`, `.vscode/extensions.json` | §10, §17 |

**Нээлттэй асуудлууд (хөгжүүлэлтийг зогсоохгүй, гэхдээ хариу хэрэгтэй):**

1. PosAPI-ийн хариу ба алдааны яг бүтэц (mock-ийн placeholder талбарууд): албан ёсны PosAPI.yaml v3.2.48-тай тулгаж, staging дээр баталгаажуулна (ebarimt-owners, Sprint 1).
2. `UNKNOWN` баримтыг `billIdSuffix`-ээр автоматаар шалгах API байгаа эсэх (posapi@itc.gov.mn-ээс асуух; research `tech-architecture.md` §17 #2).
3. Монголын ДТ-ийн үйлчилгээ үзүүлэгч, VM/registry/VPN-ийн бодит тохиргоо (research §17 #1). `cd.yml`-ийн `vars` түүнээс хамаарна.
4. QuestPDF-ийн PDF/A нийцэл (10 жилийн архив), орлогын босго давахаас өмнө төлбөртэй лиценз.
5. GitHub Actions-ийн хувийн репо, self-hosted runner-ийн 2026 оны үнэ (research §17 #11).
6. **Үлдсэн жижиг зөрүү (cross-doc review-д шийднэ).** 2026-10-06-ны review-ээр энэ баримт ба `starter/`-ийг батлагдсан ADR-ууд ба [02-architecture.md](./02-architecture.md)-тай нэгтгэсэн (`Erp.Migrator`, `-- migrator: no-transaction`, `lock_timeout 5s`, лавлах өгөгдөл V файлаар, `TenantSession`, `IPostingService`, built-in `AddValidation()`, `Erp.BuildingBlocks.Domain` (+ `.Documents`), `TimeProvider` + `IBusinessCalendar`, `/run/secrets`, `…/post-preview`, freeze календарь, орчнууд, span/metric нэрс). **2026-10-08-нд** DB-ийн нэрсийг канон схем ([db/schema](./db/schema/)) ба [DECISIONS](./DECISIONS.md) §K-д нийцүүлсэн: схем `platform`, `gl`, `tax`, `party`, `sales`, `purchase`, `bank`, `fx`, `fa`, `inv`, `rpt`, `ebarimt`, `integration`, `audit`, `identity` (`core`, `ops`, `parties`, `cash_bank`, `currency`, `fixed_assets`, `inventory`, `purchases`, `reporting` байхгүй); domain `platform.amount` г.м.; helper `platform.fn_*`; RLS бодлого `tenant_isolation`/`company_isolation`; group role `app_*` + login `erp_*`, BYPASSRLS зөвхөн `app_rls_bypass` (`erp_dispatch_definer` хасагдсан); journal `platform.schema_migration`; E2E хавтас `tests/E2E` (02-architecture §5.1-тэй ижил). Аюулгүй байдлын хоёр зөрүү засагдсан хэвээр: `app_owner`/`erp_owner`-т `BYPASSRLS` өгөхгүй; контекстгүй query 0 мөр биш алдаа өгнө (fail-closed, D-K6). Үлдсэн нь: (а) image-ийн тоо — 02-architecture §3 нь API ба worker-ийг нэг image-ээс гэж бичсэн, starter нь `api`, `worker`, `migrator` гурван target гаргадаг (SPA зөвхөн api-д); (б) image-ийн эмзэг байдлын скан — 02-architecture §10.8 Trivy, starter Grype (§10). Нэгийг сонгоод энэ баримт, `starter/`, 02-architecture-ийг зэрэг шинэчилнэ.
