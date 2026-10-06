# Архитектурын шийдвэрийн бүртгэл (ADR)

Энэ хавтсанд Монголын бичил бизнесийн ERP-ийн архитектурын шийдвэрүүд байна. Нэг файлд нэг шийдвэр бичигдэнэ. Нийт тодорхойлолт нь [02-architecture.md](../02-architecture.md) файлд бий.

## Жагсаалт

| № | Шийдвэр | Төлөв | Гол хэсэг |
|---|---|---|---|
| [ADR-0001](./ADR-0001-standalone-product-reimplementing-bc.md) | BC extension биш, BC-ийн логикийг шинээр хэрэгжүүлсэн бие даасан бүтээгдэхүүн | Батлагдсан | §1, §4.6 |
| [ADR-0002](./ADR-0002-backend-stack-dotnet10.md) | Backend: .NET 10 LTS, EF Core 10 + Npgsql, posting ба тайланд raw SQL | Батлагдсан | §5, §15 |
| [ADR-0003](./ADR-0003-postgresql.md) | Өгөгдлийн сан: PostgreSQL 17/18 (DDL нь 16+-тай нийцнэ) | Батлагдсан | §7, §8 |
| [ADR-0004](./ADR-0004-shared-schema-multitenancy-rls.md) | Shared schema олон тенант ба `tenant_id` дээрх FORCE RLS | Батлагдсан | §7 |
| [ADR-0005](./ADR-0005-tenant-vs-company.md) | Тенант ба компани (BC company = тусдаа дансны бүртгэл) | Батлагдсан | §7.1 |
| [ADR-0006](./ADR-0006-money-and-rounding.md) | Мөнгө ба бөөрөнхийлөлт: `decimal`, `numeric(19,4)`, ханш `numeric(38,18)`, AwayFromZero | Батлагдсан | §8.3, §8.4 |
| [ADR-0007](./ADR-0007-append-only-ledger-reversal.md) | Append-only ledger, залруулга зөвхөн буцаалтаар | Батлагдсан | §8.1, §6.8 |
| [ADR-0008](./ADR-0008-gapless-numbering.md) | Цоорхойгүй хууль ёсны дугаар (BC No. Series), техникийн id нь UUIDv7 | Батлагдсан | §6.6 |
| [ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md) | Синхрон posting: нэг transaction, компанийн advisory lock, preview = rollback | Батлагдсан | §6 |
| [ADR-0010](./ADR-0010-dimension-sets.md) | Dimension set (BC Dimension Set ID-ийн загвар) | Батлагдсан | §4.2.4 |
| [ADR-0011](./ADR-0011-modular-monolith.md) | Modular monolith ба модулийн хил (architecture test) | Батлагдсан | §4, §5 |
| [ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md) | Transactional outbox, idempotency, eBarimt-ийг автоматаар дахин илгээхгүй | Батлагдсан | §8.5, §9.1, §9.2 |
| [ADR-0013](./ADR-0013-hosting-in-mongolia-posapi-operator.md) | Монголд байршуулах ба PosAPI operator загвар | Батлагдсан | §9.3, §12 |
| [ADR-0014](./ADR-0014-sql-first-migrations.md) | SQL-first migration (RLS, trigger-тэй), EF migration ашиглахгүй | Батлагдсан | §14.4 |
| [ADR-0015](./ADR-0015-frontend-react-ag-grid.md) | Frontend: React + TypeScript + AG Grid Community, мөнгийг string-ээр | Батлагдсан | §3, §15 |
| [ADR-0016](./ADR-0016-auth-openiddict-bff.md) | Нэвтрэлт: ASP.NET Core Identity + OpenIddict (OIDC), BFF cookie | Батлагдсан | §10.1 |
| [ADR-0017](./ADR-0017-i18n-mongolian-first.md) | i18n: эхлээд монгол, дараа нь англи хэл | Батлагдсан | §1.3 P11 |
| [ADR-0018](./ADR-0018-background-jobs-quartz.md) | Background job: өөрийн outbox dispatcher + Quartz.NET | Батлагдсан | §9.1 |
| [ADR-0019](./ADR-0019-reporting-questpdf-closedxml.md) | Тайлан: SQL view, QuestPDF, ClosedXML | Батлагдсан | §4.2.13, §9.6 |
| [ADR-0020](./ADR-0020-observability-otel-redaction.md) | Ажиглалт: OpenTelemetry, self-host, `qrData`/`lottery`-г хасах | Батлагдсан | §11 |
| [ADR-0021](./ADR-0021-effective-dated-parameters.md) | Огнооны хүчинтэй хуулийн параметр (2027 оны өөрчлөлт) | Батлагдсан | §4.2.5 |
| [ADR-0022](./ADR-0022-backups-pitr-archive-retention.md) | Нөөц хуулбар (pgBackRest, PITR), DR, 10 жилийн архив | Батлагдсан | §12.5–§12.8 |
| [ADR-0023](./ADR-0023-compliance-gates.md) | Нийцлийн хаалга: СЯ-ны жагсаалт (Order 47), 10 жил, цахим гарын үсэг, ХХМХТХ | Батлагдсан | §9.8, §10.6 |

## Төлвийн утга

| Төлөв | Утга |
|---|---|
| Санал (Proposed) | Хэлэлцэж байна |
| Батлагдсан (Accepted) | Хэрэгжүүлнэ. Хазайх бол шинэ ADR бичнэ |
| Орлогдсон (Superseded by ADR-XXXX) | Шинэ ADR орлосон. Хуучин файлыг устгахгүй |
| Татгалзсан (Rejected) | Хэрэгжүүлэхгүй. Шалтгааныг хадгална |

## Загвар

Шинэ ADR бичихдээ дараах загварыг хуулна. Файлын нэр нь `ADR-NNNN-<англи-slug>.md` хэлбэртэй байна.

```markdown
# ADR-NNNN: <Гарчиг>

- **Төлөв:** Санал | Батлагдсан | Орлогдсон (ADR-XXXX) | Татгалзсан
- **Огноо:** YYYY-MM-DD
- **Шийдвэр гаргагч:** <хүмүүс эсвэл баг>
- **Холбогдох:** <ADR-ууд, 02-architecture.md-ийн хэсэг>

## Нөхцөл байдал
Ямар асуудал, хязгаарлалт, хүч энэ шийдвэрийг шаардсан бэ.

## Шийдвэр
Бид юу хийх вэ. Тодорхой, шалгаж болохуйц бичнэ.

## Үр дагавар
Эерэг, сөрөг, эрсдэл ба түүнийг бууруулах арга. Хэрэгжүүлэлтийг хэрхэн шалгах вэ.

## Харьцуулсан хувилбарууд
| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |

## Холбоос
Судалгааны тэмдэглэл, BC-ийн эх код, гадаад баримт бичиг.
```
