# ADR-0002: Backend — .NET 10 LTS, EF Core 10 + Npgsql, posting ба тайланд raw SQL

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §5, §15. [ADR-0006](./ADR-0006-money-and-rounding.md), [ADR-0011](./ADR-0011-modular-monolith.md)

## Нөхцөл байдал

- **Мөнгө.** Нягтлан бодох бүртгэлийн систем мөнгөтэй нарийн, алдаагүй ажиллах ёстой.
  - .NET-ийн `System.Decimal` нь 128 бит, 28–29 чухал оронтой.
  - Npgsql нь PostgreSQL-ийн `numeric`-ийг нэмэлт кодгүйгээр `decimal` руу хөрвүүлдэг.
  - JavaScript-д decimal төрөл байхгүй (TC39 Decimal Stage 1). node-postgres `numeric`-ийг string хэлбэрээр буцаадаг ([tech-architecture.md](../research/tech-architecture.md) §2).
- **Дэмжлэгийн хугацаа.** .NET 10 LTS 2025-11-11-нд гарсан. Дэмжлэг 2028-11-14 хүртэл үргэлжилнэ.
- **Тайлан ба маягт.** Маягтын PDF-д QuestPDF, Excel-д ClosedXML гэсэн бэлэн сангууд .NET-д бий.
- **Лицензийн урхи:**
  - MediatR лицензийн түлхүүртэй болсон;
  - FluentAssertions v8+ арилжааны хэрэглээнд төлбөртэй;
  - Duende IdentityServer арилжааны лицензтэй.
- **Posting-ийн онцлог.** Posting нь түгжээ, batch INSERT, `RETURNING` ба тоолуур ашигладаг. ORM-ийн change tracking ийм ажилд тохиромжгүй, удаан бөгөөд урьдчилан таамаглахад хэцүү.

## Шийдвэр

1. **Runtime:** .NET 10 LTS. Хэл нь C# (тухайн SDK-ийн default хувилбар).
   - Төсөл бүрт `Nullable=enable`, `TreatWarningsAsErrors=true`, `AnalysisLevel=latest-recommended` тохируулна.
2. **Web:** ASP.NET Core Minimal API ба endpoint filter.
   - Command ба query handler нь энгийн интерфейс (`ICommandHandler<,>`, `IQueryHandler<,>`). **MediatR, AutoMapper ашиглахгүй.** Mapping-ийг гараар бичнэ.
3. **Өгөгдөлд хандах хоёр зам:**
   - **EF Core 10 + Npgsql provider:** aggregate ба CRUD-д. Модуль бүр өөрийн схемтэй `DbContext`-тэй (`HasDefaultSchema("sales")`). Нэрлэсэн query filter `"Tenant"`, `"Company"`, `"SoftDelete"` ашиглана. EF migration **ашиглахгүй** ([ADR-0014](./ADR-0014-sql-first-migrations.md)).
   - **Raw SQL (Npgsql `NpgsqlBatch` эсвэл Dapper):** posting engine, ledger writer, тайлангийн query, outbox claim-д. SQL нь модулийн Infrastructure давхаргад, нэрлэсэн константаар (`const string`) эсвэл embedded `.sql` resource хэлбэрээр байна.
4. **Нэг connection, нэг transaction.** EF ба Dapper хоёулаа `TenantSession`-ий холболт ба transaction-ийг хуваалцана (`UseTransaction`). Ингэснээр нэг use case нэг transaction-д багтана.
5. **Тестийн хэрэгсэл:** xUnit v3, Shouldly эсвэл энгийн assert, FsCheck, Testcontainers, ArchUnitNET. FluentAssertions v8+ ашиглахгүй.
6. **Шинэчлэл.** 2028-06-аас өмнө .NET 12 LTS руу шилжинэ. CI шинэ LTS-ийн preview-г 2027 оны 4-р улирлаас эхлэн туршина.

## Үр дагавар

**Эерэг:**
- Мөнгөний нарийвчлал хэлний түвшинд хангагдана.
- Нэг хэл ба нэг runtime ашиглана: API, worker, PDF, Excel, migration runner.
- Posting-ийг SQL-ээр бичих тул гүйцэтгэл ба түгжээний дараалал урьдчилан мэдэгдэнэ.

**Сөрөг ба эрсдэл:**
- **Хоёр зам** (EF ба SQL) байгаа тул дүрэм тодорхой байх ёстой. Architecture test шалгах дүрэм:
  - ledger-т зөвхөн SQL-ээр бичнэ;
  - ноорогт EF ашиглана.
- **Raw SQL-д компанийн predicate** (`company_id`) мартагдаж болно.
  - Бууруулах арга: integration test нь хоёр компанитай ажиллаж хөндлөн мөр гарахгүйг шалгана ([02-architecture.md](../02-architecture.md) §7.4).
- **Frontend TypeScript** тул баг хоёр хэл эзэмших шаардлагатай. Монголын хөдөлмөрийн зах зээл дэх .NET хөгжүүлэгчийн тоо UNVERIFIED.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| NestJS / TypeScript | Frontend-тэй нэг хэл | Decimal төрөл байхгүй. Мөнгөн дүнг string ба сангаар зохицуулна. Ялгаатай ORM-ийн transaction загвар | Мөнгөний нарийвчлалын эрсдэл |
| Java / Spring Boot | `BigDecimal`, боловсорсон экосистем | Бага багт хүнд. Spring Boot 4-ийн огноо UNVERIFIED | Энгийн байдал |
| Go | Хурдан, жижиг image | Decimal сан гаднаас авна. PDF ба Excel сан сул | Тайлангийн сан |
| Зөвхөн EF Core | Нэг зам | Posting-ийн түгжээ ба batch-ийг хянахад хэцүү | Гүйцэтгэл ба тодорхой байдал |
| Зөвхөн Dapper | SQL бүрэн хяналттай | CRUD ба aggregate-ийн boilerplate их | Бүтээмж |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §1, §2, §16 (TA-01, TA-16)
- .NET-ийн дэмжлэгийн бодлого: https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core
- `System.Decimal`: https://learn.microsoft.com/dotnet/api/system.decimal
- EF Core 10-ийн нэрлэсэн query filter: https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew
- Npgsql-ийн төрлийн харгалзаа: https://www.npgsql.org/doc/types/basic.html
