# ADR-0014: SQL-first migration (RLS, trigger-тэй), EF migration ашиглахгүй

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §7.4, §8, §14.4. [ADR-0003](./ADR-0003-postgresql.md), [ADR-0004](./ADR-0004-shared-schema-multitenancy-rls.md), [ADR-0007](./ADR-0007-append-only-ledger-reversal.md)

## Нөхцөл байдал

- **Схемийн гол хэсэг нь EF Core-ийн model-д байдаггүй.** Үүнд:
  - RLS бодлого;
  - append-only guard trigger, deferred constraint trigger;
  - domain-ууд (`platform.amount`, `platform.exch_rate`);
  - `EXCLUDE` constraint;
  - SECURITY DEFINER функц;
  - role ба эрх (GRANT/REVOKE);
  - published view;
  - `CREATE INDEX CONCURRENTLY`.
- **EF-ийн auto-migration** эдгээрийг ойлгодоггүй. Raw SQL-ээр нэмэхэд EF model ба бодит схем зөрнө.
- **Zero-downtime deploy** expand/contract дүрэм ба transaction-гүй script шаарддаг.

## Шийдвэр

1. **Migration-ийг гараар SQL-ээр бичнэ.**
   - **Эх сурвалж** нь канон схем [db/schema/*.sql](../db/schema/) ([DECISIONS](../DECISIONS.md) D-K1). Шинэ репод:
     - **baseline** = `db/schema/000_extensions_roles.sql` … `920_views.sql` **өөрчлөлтгүй** (`Erp.Migrator`-т embedded; нэрийн дарааллаар, psql-ийн `\set …` мөрийг алгасна). `000` нь cluster group role (`app_*`), өргөтгөл ба модулийн схем үүсгэдэг тул **эхний `migrate`** нь bootstrap superuser холболтоор (локал/CI: `postgres`; production: DBA, 2 хүн) явна; дараа нь `erp_migrator`;
     - **seed** = `db/seed/legal_parameters.sql`, `db/seed/mn_*.sql` (repeatable: checksum өөрчлөгдвөл `seed` дахин ажиллуулна);
     - **дараагийн өөрчлөлт**: `db/migrations/V<NNNN>__<module>_<description>.sql` (`V0001`-ээс, baseline-ийн дараа; жишээ: `V0012__gl_add_gl_register_hash.sql`). View ба функц: `R__<schema>__<object>.sql` (repeatable).
   - Runner нь **өөрсдийн `Erp.Migrator`** console (`src/Erp.Migrator`; [02-architecture.md](../02-architecture.md) §14.4 ба [18-dev-setup.md](../18-dev-setup.md) §3.3-тай ижил нэр): `migrate`, `verify`, `seed --set <name>`, `info`. Журнал `platform.schema_migration (script, kind, checksum SHA-256, applied_at, applied_by, execution_ms)`; хүснэгтийг migrator 000-ийн дараа шууд үүсгэнэ. Гадаад runner (DbUp, Flyway, `Erp.Migrations`) хэрэглэхгүй.
   - Migration зөвхөн урагш явна (down script байхгүй).
   - Хэрэглэгдсэн script-ийг засахгүй. CI checksum шалгана.
2. **EF Core migration ашиглахгүй.** EF model нь бэлэн схемд map хийнэ. CI тест EF-ийн metadata (хүснэгт, багана, төрөл, nullability)-г `information_schema`-тай харьцуулна.
3. **Хамгаалалтын объектууд** (канон схемд, `platform`/`audit` схем; тусдаа `core` схем байхгүй):
   - RLS: baseline-ийн [900_rls.sql](../db/schema/900_rls.sql) `tenant_id`-тай бүх хүснэгтэд `ENABLE` + `FORCE`, `tenant_isolation` (+ RESTRICTIVE `company_isolation`) бодлого ба `app_user`-ийн GRANT-ийг loop-оор үүсгэнэ (`app_ops` бизнесийн хүснэгтэд эрхгүй, зөвхөн `integration.fn_ops_health()`);
   - append-only: [910_ledger_guards.sql](../db/schema/910_ledger_guards.sql) `platform.ledger_guard`-ийн мөр бүрд `trg_<table>_immutable`, `trg_<table>_no_truncate` (`platform.fn_guard_immutable`), `trg_<table>_before_insert` (`platform.fn_ledger_before_insert`) ба REVOKE;
   - аудит: [140_integration_audit.sql](../db/schema/140_integration_audit.sql) `row_version`-тай хүснэгт бүрд `trg_<table>_touch` (`platform.fn_touch_row`) ба `trg_<table>_audit` (`audit.fn_row_change`);
   - хадгалах хугацаа: `audit.fn_purge_expired`, `audit.fn_purge_platform_rows`, `integration.fn_purge_expired` (partition-гүй, [02-architecture.md](../02-architecture.md) §8.1).

   Baseline-ийн дараах migration шинэ хүснэгтэд эдгээр объектыг **ил бичнэ** ([18-dev-setup.md](../18-dev-setup.md) §3.2-ын загвар). Reusable helper функц (`platform.fn_apply_rls(regclass)` г.м.) канон схемд нэмэгдвэл загварыг хялбарчилна (02-architecture "Нийцүүлэлтийн тэмдэглэл").
4. **Дүрэм** ([02-architecture.md](../02-architecture.md) §14.4):
   - Migrator (`erp_migrator`, `app_owner`-ийн гишүүн) `SET ROLE app_owner`, `SET lock_timeout = '5s'`, `SET statement_timeout = '15min'`-ийг тохируулж, зэрэг ажиллах migrator-ыг session-level `pg_advisory_lock`-оор хориглоно. Session-level lock тул migrator PgBouncer-ийг тойрч PostgreSQL руу шууд холбогдоно.
   - Expand/contract; хувилбар N-ийн схем N-1-ийн кодтой ажиллана.
   - Индексийг `CONCURRENTLY` үүсгэнэ, transaction-гүй script-д (`-- migrator: no-transaction`).
   - FK ба CHECK-ийг `NOT VALID` → `VALIDATE` дарааллаар нэмнэ.
   - Enum нь `CHECK` хэлбэртэй (PostgreSQL `ENUM` хэрэглэхгүй).
   - **Ledger-ийг UPDATE-ээр backfill хийхгүй.**
   - Том backfill нь batched job хэлбэрээр ажиллана.
5. **Ажиллуулах.** Migration-ийг CI/CD-ийн тусдаа алхамд, application-ийг шинэчлэхээс **өмнө** `erp_migrator` (`SET ROLE app_owner`) ажиллуулна. Application startup дээр migration ажиллуулахгүй.
6. **CI-ийн тест** (`verify` командыг ашиглана):
   - хоосон DB → head;
   - өмнөх release-ийн snapshot → head;
   - PG 16, 17 ба 18;
   - каталог тест ([db/tests/catalog_checks.sql](../db/tests/catalog_checks.sql)-тэй ижил): RLS (`tenant_isolation`/`company_isolation`, fail-closed), append-only, audit trigger, BYPASSRLS зөвхөн `app_rls_bypass`, `real`/`double precision`/`money` багана байхгүй, `qr_data`/`lottery` багана байхгүй;
   - EF ↔ схемийн нийцэл.
7. **Seed.** Улсын хэмжээний лавлах өгөгдөл (`fx.iso_currency`, `tax.tax_parameter`, `rpt.statement_line`, БҮНА) нь канон [db/seed](../db/seed/README.md) (`legal_parameters.sql`, `mn_00_catalogs.sql` г.м.)-ээр `seed` командаар орно; дараагийн хуулийн өөрчлөлтийг V migration эсвэл seed-ийн шинэчлэлээр (шинэ утга = шинэ мөр, хүчин төгөлдөр болох огноотой) нэмнэ. Демо өгөгдөл `db/seed/demo/` (idempotent, `ON CONFLICT DO NOTHING`). Шинэ компанийн анхны өгөгдлийг `ICompanySeeder` эсвэл `platform.fn_provision_company_mn` үүсгэнэ.

## Үр дагавар

**Эерэг:**
- DB-ийн бүх хамгаалалт ил тод бөгөөд code review-д харагдана.
- PostgreSQL-ийн бүх боломжийг ашиглана.
- Migration-ий гүйцэтгэл урьдчилан мэдэгдэнэ.

**Сөрөг ба эрсдэл:**
- **Схем хоёр газар тодорхойлогдоно** (SQL ба EF mapping).
  - Бууруулах арга: EF ↔ схемийн CI тест.
- **Хөгжүүлэгч SQL DDL ба PostgreSQL-ийн түгжээний онцлогийг** мэдэх шаардлагатай. Migration-ий PR review-д checklist ашиглана.
- **Migrator-ийн кодыг өөрсдөө хариуцна** (журнал, checksum, advisory lock, no-transaction, `verify`). Код бага (хэдэн зуун мөр) бөгөөд integration test-ээр хамгаалагдана.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| EF Core migrations | Хурдан, model-оос автоматаар | RLS, trigger, domain-ийг raw SQL-ээр нэмэх шаардлагатай. Zero-downtime-ийг хянахад хэцүү | Хангалтгүй хяналт |
| Flyway (Community) | Боловсорсон | Java runtime хэрэгтэй | Стек |
| Sqitch | Хамаарлын граф | Perl. Бага түгээмэл | Стек |
| DbUp | Бэлэн .NET runner | `verify` (RLS, ledger guard, төрлийн шалгалт), `SET ROLE`, advisory lock-ийг нэмж бичих шаардлагатай хэвээр | Өөрсдийн runner энгийн, хамааралгүй |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §13 (CI/CD), TA-03, TA-04, TA-15
- PostgreSQL `CREATE INDEX CONCURRENTLY`: https://www.postgresql.org/docs/18/sql-createindex.html
