# ADR-0014: SQL-first migration (RLS, trigger-тэй), EF migration ашиглахгүй

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §7.4, §8, §14.4. [ADR-0003](./ADR-0003-postgresql.md), [ADR-0004](./ADR-0004-shared-schema-multitenancy-rls.md), [ADR-0007](./ADR-0007-append-only-ledger-reversal.md)

## Нөхцөл байдал

- **Схемийн гол хэсэг нь EF Core-ийн model-д байдаггүй.** Үүнд:
  - RLS бодлого;
  - append-only guard trigger, deferred constraint trigger;
  - domain-ууд (`core.amount_lcy`);
  - `EXCLUDE` constraint;
  - SECURITY DEFINER функц;
  - role ба эрх (GRANT/REVOKE);
  - published view;
  - `CREATE INDEX CONCURRENTLY`.
- **EF-ийн auto-migration** эдгээрийг ойлгодоггүй. Raw SQL-ээр нэмэхэд EF model ба бодит схем зөрнө.
- **Zero-downtime deploy** expand/contract дүрэм ба transaction-гүй script шаарддаг.

## Шийдвэр

1. **Migration-ийг гараар SQL-ээр бичнэ.**
   - Зам: `db/migrations/V<NNNN>__<module>_<description>.sql` (жишээ: `V0012__gl_create_gl_entry.sql`). View ба функц: `R__<schema>__<object>.sql` (repeatable).
   - Runner нь **өөрсдийн `Erp.Migrator`** console: `migrate`, `verify`, `seed --set <name>`, `info`. Журнал `core.schema_migration`-д (version, SHA-256 checksum, applied_at, applied_by, execution_ms) бичигдэнэ. Дэлгэрэнгүй: [18-dev-setup.md](../18-dev-setup.md) §3.3.
   - Migration зөвхөн урагш явна (down script байхгүй).
   - Хэрэглэгдсэн script-ийг засахгүй. CI checksum шалгана.
2. **EF Core migration ашиглахгүй.** EF model нь бэлэн схемд map хийнэ. CI тест EF-ийн metadata (хүснэгт, багана, төрөл, nullability)-г `information_schema`-тай харьцуулна.
3. **Helper функцүүд** (`core` схемд, анхны migration-д):
   - `core.fn_apply_tenant_rls(regclass)`: RLS ENABLE ба FORCE, `rls_<table>__tenant` бодлого, `erp_app` ба `erp_worker`-ийн GRANT (`erp_ops_ro` нь зөвхөн `ops.*` view-д эрхтэй);
   - `core.fn_make_append_only(regclass)`: guard trigger, TRUNCATE trigger, REVOKE;
   - `core.fn_add_audit_trigger(regclass)`: `audit.row_change` trigger;
   - `core.fn_rotate_partitions()`: хадгалах хугацаатай хүснэгтийн сарын partition үүсгэх ба устгах ([02-architecture.md](../02-architecture.md) §8.1).
4. **Дүрэм** ([02-architecture.md](../02-architecture.md) §14.4):
   - Migrator `SET ROLE erp_owner`, `SET lock_timeout = '5s'`, `SET statement_timeout = '15min'`-ийг тохируулж, зэрэг ажиллах migrator-ыг session-level `pg_advisory_lock`-оор хориглоно. Session-level lock тул migrator PgBouncer-ийг тойрч PostgreSQL руу шууд холбогдоно.
   - Expand/contract; хувилбар N-ийн схем N-1-ийн кодтой ажиллана.
   - Индексийг `CONCURRENTLY` үүсгэнэ, transaction-гүй script-д (`-- migrator: no-transaction`).
   - FK ба CHECK-ийг `NOT VALID` → `VALIDATE` дарааллаар нэмнэ.
   - Enum нь `CHECK` хэлбэртэй (PostgreSQL `ENUM` хэрэглэхгүй).
   - **Ledger-ийг UPDATE-ээр backfill хийхгүй.**
   - Том backfill нь batched job хэлбэрээр ажиллана.
5. **Ажиллуулах.** Migration-ийг CI/CD-ийн тусдаа алхамд, application-ийг шинэчлэхээс **өмнө** `erp_migrator` (`SET ROLE erp_owner`) ажиллуулна. Application startup дээр migration ажиллуулахгүй.
6. **CI-ийн тест** (`verify` командыг ашиглана):
   - хоосон DB → head;
   - өмнөх release-ийн snapshot → head;
   - PG 17 ба 18;
   - каталог тест: RLS, append-only, audit trigger, `real`/`double precision`/`money` багана байхгүй, `qr_data`/`lottery` багана байхгүй;
   - EF ↔ схемийн нийцэл.
7. **Seed.** Улсын хэмжээний лавлах өгөгдөл (валют, хуулийн параметр, БҮНА) нь `V…__ref_*.sql` migration-оор орно. Демо өгөгдөл `db/seed/` (idempotent, `ON CONFLICT DO NOTHING`). Шинэ компанийн анхны өгөгдлийг `ICompanySeeder` үүсгэнэ.

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
