# Starter файлууд — шинэ репозиторид хуулах загварууд

> Хамаарах баримт: [`../18-dev-setup.md`](../18-dev-setup.md) (хөгжүүлэлтийн орчин ба ажлын дэг)
> Огноо: 2026-10-06 · Хувилбарууд 2026-10-06-ны байдлаар nuget.org / Docker Hub / MCR дээрээс шалгагдсан

Энэ хавтасны бүтэц нь **шинэ репозиторийн root-ийн бүтэцтэй яг ижил**. Тиймээс хавтсыг бүхэлд нь шинэ репозиторийн root руу хуулна:

```bash
# шинэ (хоосон) репозиторийн root дотроос
cp -r <BCApps>/docs/features/mn-micro-erp/starter/. .
rm README.md        # энэ тайлбар файл шинэ репод хэрэггүй (эсвэл docs/ руу зөөнө)
git add -A && git commit -m "build: add repository scaffolding from starter"
```

Хуулсны дараа **заавал солих** зүйлс:

1. `.github/CODEOWNERS` — `@mn-erp/...` багуудыг жинхэнэ GitHub багуудаар солих.
2. `.github/workflows/cd.yml` — GitHub environment `staging` (deployment branch: `main`) / `production` (deployment tag: `v*`, 2 required reviewer)-д `vars` (`LOCAL_REGISTRY`, `APP_HOSTS`, `DB_HOST`, `APP_URL`) тохируулах; Монголын ДТ-д self-hosted runner бүртгэх (label: `mn-dc` + `staging`/`production`) ба runner host-ийг бэлдэх (18-dev-setup.md §11: `/etc/erp/secrets/migrator/`, `/etc/erp/posapi-instances.json`, SSH түлхүүр, registry login).
3. Branch ruleset (`main`): шууд push хориглох, PR заавал, 1 approval + Code Owners review, required checks: `ci-ok`, `two-approvals`; dismiss stale approvals; squash merge only; linear history.
4. (Сонголттой) GitHub Code Security лиценз байвал repo variable `CODEQL_ENABLED=true`.

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
| `.github/workflows/ci.yml` | CI | build/format/OpenAPI drift + `oasdiff breaking`/unit/architecture → integration (Testcontainers PG17+18) → golden (PG17 service) → migrations (PG16/17/18: хоосон DB + өмнөх release-ээс (posted demo өгөгдөлтэй) upgrade + schema diff) → web (`api:gen` drift орно) → supply-chain (лиценз, audit, SBOM, gitleaks) → image → CodeQL (сонголттой) → `ci-ok` |
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
| `db/init/01-roles.sql` | Локал/CI-ийн role ба DB | 02-architecture §7.5-ын role: `erp_owner` (NOLOGIN, эзэмшигч, **NOBYPASSRLS** — FORCE RLS эзэмшигчид ч үйлчилнэ), `erp_migrator`, `erp_app` ба `erp_worker` (NOBYPASSRLS, эзэмшигч биш), `erp_dispatch_definer` (цорын ганц BYPASSRLS, NOLOGIN), `erp_ops_ro`; DB `erp`, `erp_test`; нууц үгс зөвхөн локал |
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
| `db/init/01-roles.sql` бодит PostgreSQL дээр; `erp_owner` NOBYPASSRLS; FORCE RLS + `rls_<table>__tenant` загварын fail-closed зан төлөв (контекстгүй query → `unrecognized configuration parameter`, өмнө нь local тохируулсан холболт → `invalid input syntax for type uuid`), `numeric(19,4)` Infinity татгалзана | PostgreSQL 16.15 (`psql -f`) | ✔ |
| `pg_dump --schema-only`-ийн `\restrict`/`\unrestrict` мөрийг CI-ийн шүүлтүүр арилгана | PostgreSQL 16.15 `pg_dump` | ✔ |
| `sensitive-review.yml`-ийн замын regex, `cd.yml`-ийн freeze календарь | bash, жишээ зам ба огноогоор | ✔ |
| .NET build | — | ✘ дахин ажиллуулаагүй: энэ орчноос .NET SDK татах боломжгүй байсан. Эхний шалгалтаас хойш MSBuild-д зөвхөн project нэрийн нөхцөл өөрчлөгдсөн (`Erp.SharedKernel` → `Erp.BuildingBlocks.Domain` нь `EndsWith('.Domain')`-д автоматаар орно; `Erp.Migrations` → `Erp.Migrator`; `Erp.DevTools` нэмэгдсэн) ба `Directory.Packages.props`-д 3 багц хасагдаж (`dbup-postgresql`, `FluentValidation` ×2), 3 багц нэмэгдсэн (`KeyPerFile`, `Compliance.Redaction`, `TimeProvider.Testing`). Sprint 0 PR #2-т `dotnet build`-ээр дахин баталгаажуулна |

**Эхний шалгалт (starter-ийг бичихэд, 2026-10-06; тухайн үеийн нэрээр):** .NET SDK 10.0.401 дээр `restore --locked-mode`, `format whitespace/style --verify-no-changes`, `build -c Release` — 0 warning, 0 error (жишээ solution: `Erp.SharedKernel/Monetary/MoneyMath`, `Erp.Sales.Domain`, `Erp.Sales.Application`, `Erp.Tests.Unit`, `Erp.Analyzers`; давхаргын `InternalsVisibleTo` ажилласан); unit тест CI-ийн яг командаар (MTP, `--report-xunit-trx --coverage`) 5/5, TRX + Cobertura; сөрөг тест — `double`, `var x = 1.5`, cast, `Math.Sqrt`, `List<float>`, `Half`, `Math.Round`/`decimal.Round`, `DateTime.Now/UtcNow`, `Guid.NewGuid`, culture-гүй `ToString`/`Parse`, built-in `var` бүгд build error (ERP0001, RS0030, CA1305, MA0011, IDE0008); `nuget-license 4.0.18` allow-list (QuestPDF ignore-гүй бол унана); Docker build-ийн нөхцөл (`tools/` байхгүй үед `dotnet publish -p:RestoreLockedMode=true`).

Бичих явцад илэрч засагдсан зүйлс: (1) `Money` төрлийг `...Money` namespace-д байрлуулбал MA0049 алдаа гарна, тиймээс namespace нь `…Domain.Monetary`; (2) тест төсөлд `GenerateDocumentationFile=false` тавибал IDE0005 build алдаа өгнө, тиймээс `true` хэвээр; (3) `T:System.Double` ban нь зарлалт/literal-ийг барьдаггүй, тиймээс ERP0001 analyzer нэмсэн; (4) `job` context-ийг job-level `env`-д хэрэглэх боломжгүй, тиймээс step-level болгосон.

Review-ээр засагдсан гол зүйлс: `erp_owner`-ийн `BYPASSRLS`-ийг хассан (02-architecture §7.5); RLS fail-closed; нэршлийг батлагдсан ADR-уудтай нэгтгэсэн (`Erp.Migrator`, `core.*`, `rls_<table>__tenant`, `TenantSession`, `AddValidation()`, `/run/secrets`); staging smoke-ийн `version` зөрөх алдаа (image `InformationalVersion` = tag); production deploy-ийг tag-аас ажиллуулах ба freeze шалгалт; `oasdiff` ба `api:gen` drift; collector дахь регистрийн hash-ийг устгалаар солисон; demo seed ledger-т шууд бичихгүй (`demo-post`); Node 24; CODEOWNERS-ийн "аль нэг баг хангалттай" семантик; Dependabot-ийн EF/Npgsql бүлэг. Үлдсэн зөрүүг 18-dev-setup.md §19-д бичсэн.

Бүтэн `.NET` solution, `web/` апп хараахан байхгүй тул `ci.yml`-ийн integration/golden/migration/web алхмууд шинэ репод skeleton commit хийгдсэний дараа л бодитоор ажиллана (18-dev-setup.md §16 — Sprint 0, эхний долоо хоногийн ажил).
