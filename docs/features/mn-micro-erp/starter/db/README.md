# db/ — өгөгдлийн сангийн скриптүүд

| Хавтас | Агуулга | Хэн ажиллуулна |
|---|---|---|
| `init/01-roles.sql` | Зөвхөн локал/CI: login role (`erp_migrator`, `erp_app`, `erp_worker`, `erp_ops_ro`) ба DB | `postgres` container-ийн initdb |
| `schema/*.sql` | **Каноник схем** (DECISIONS D-K1) — 19 файл, дарааллаар | `Erp.Migrator migrate` (эсвэл `db/apply.sh`) |
| `seed/legal_parameters.sql`, `seed/mn_*.sql` | Хууль журмын параметр + MN нутагшуулалтын багц (`platform.fn_provision_company_mn`) | `Erp.Migrator seed` (эсвэл `db/apply.sh --seed`) |
| `tests/*.sql` | psql-ийн каталог/smoke/seed шалгалт (scratch DB-д) | `db/apply.sh <url> --seed --test` |

`schema/`, `seed/`, `tests/`, `apply.sh` нь spec багцын `docs/features/mn-micro-erp/db`-ийн **хуулбар**. Starter нь
spec багц дотор байх хугацаанд эх хувийг өөрчилсний дараа `tools/ci/sync-db.sh` ажиллуулна; хуулбар зөрвөл
`Erp.Tests.Unit`-ийн `DatabasePackageDriftTests` унана. Шинэ репод (`cp -r starter/. .`) энэ хавтас өөрөө эх сурвалж болно;
дараагийн өөрчлөлтийг ADR-0014-ийн дагуу шинэ migration файлаар нэмнэ (Sprint 1).

Дэлгэрэнгүй тайлбар: spec багцын `db/README.md`, `db/seed/README.md`.

## Локал туршилтын компани (provisioning)

Нэвтрэлт/онбординг (Platform модуль) хараахан байхгүй тул туршилтын тенант, компанийг SQL-ээр үүсгэнэ (bootstrap role-оор,
дараа нь `app_user`-ээр MN багцыг суулгана; integration тестийн `PostgresFixture.ProvisionCompanyAsync`-тай ижил):

```sql
BEGIN;
INSERT INTO platform.tenant (id, name, status) VALUES ('11111111-1111-7111-8111-111111111111', 'Demo tenant', 'ACTIVE');
INSERT INTO platform.company (id, tenant_id, name, status)
VALUES ('22222222-2222-7222-8222-222222222222', '11111111-1111-7111-8111-111111111111', 'Demo ХХК', 'PROVISIONING');
INSERT INTO platform.company_setup (tenant_id, company_id, legal_name, tin, vat_registered, vat_registered_from, district_code)
VALUES ('11111111-1111-7111-8111-111111111111', '22222222-2222-7222-8222-222222222222', 'Demo ХХК', '37900846788', true, DATE '2020-01-01', '2501');
COMMIT;

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context('11111111-1111-7111-8111-111111111111', '22222222-2222-7222-8222-222222222222', NULL, 'local-demo');
SELECT platform.fn_provision_company_mn('11111111-1111-7111-8111-111111111111', '22222222-2222-7222-8222-222222222222',
                                        2026, DATE '2026-01-01');   -- CoA 182 данс, GJ/SI/… цуврал, 2026–2027 он, НӨАТ setup
COMMIT;
```

Дараа нь API-д `X-Erp-Tenant-Id: 11111111-1111-7111-8111-111111111111` header-тэй, замд `22222222-…` компанитай хандана.
