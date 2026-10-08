# ADR-0004: Shared schema олон тенант ба `tenant_id` дээрх FORCE RLS

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §7. [ADR-0003](./ADR-0003-postgresql.md), [ADR-0005](./ADR-0005-tenant-vs-company.md), [ADR-0014](./ADR-0014-sql-first-migrations.md)

## Нөхцөл байдал

- Бид 1 000–5 000 жижиг тенантыг ажиллуулна. Тенант бүрийн өгөгдөл бага: жилд хэдэн мянгаас хэдэн арван мянган entry.
- Тенант бүрд тусдаа схем эсвэл DB үүсгэвэл migration N дахин олширно. Каталог томорч (bloat), connection pool хуваагдана ([tech-architecture.md](../research/tech-architecture.md) §4.2).
- Shared schema-д нэг алдаа өөр тенантын өгөгдлийг задруулж болно. Тиймээс application-ий шүүлтүүрээс гадна DB түвшинд хамгаалалт хэрэгтэй.
- PostgreSQL RLS-ийн онцлог:
  - бодлогогүй бол бүх мөрийг хаадаг (default-deny);
  - хүснэгтийн эзэмшигч `FORCE` тохиргоогүй бол RLS-ийг тойрдог;
  - superuser ба `BYPASSRLS` role ямагт тойрдог.

## Шийдвэр

1. **Shared schema.** Бүх тенант нэг схемийн багцыг хуваалцана. Модуль бүр өөрийн схемтэй байна.
2. Бизнесийн бүх мөр `tenant_id uuid NOT NULL` ба `company_id uuid NOT NULL` баганатай ([ADR-0005](./ADR-0005-tenant-vs-company.md)).
   - PK: `id uuid` (UUIDv7, апп үүсгэнэ) + `UNIQUE (company_id, id)` (composite FK-ийн зорилт); ledger-т нэмэлтээр `UNIQUE (company_id, entry_no)` ([DECISIONS](../DECISIONS.md) D-K3).
   - `(tenant_id, company_id) → platform.company (tenant_id, id)` FK; бусад хүснэгт рүү `(company_id, x_id)`.
   - Бизнесийн индекс `company_id`-аар эхэлнэ.
3. **RLS** (канон: [900_rls.sql](../db/schema/900_rls.sql)). Тенантын бүх хүснэгтэд `ENABLE` ба **`FORCE ROW LEVEL SECURITY`** тохируулна. Бодлого `tenant_isolation` нь `USING` ба `WITH CHECK (tenant_id = platform.current_tenant_id())`; `company_id NOT NULL` хүснэгтэд нэмэлтээр RESTRICTIVE `company_isolation` (`company_id = platform.current_company_id()`). `platform.current_tenant_id()` нь `current_setting('app.tenant_id')::uuid` тул контекст тохируулаагүй бол query **алдаагаар зогсоно** (fail-closed, D-K6), чимээгүй 0 мөр буцаахгүй. RLS бол хоёр дахь хамгаалалт: query бүр `tenant_id` ба `company_id`-ийн нөхцлийг өөрөө бичнэ.
4. **Контекст.** Transaction бүрийн эхэнд `platform.fn_set_context(tenant, company, user, request)` (= `set_config('app.tenant_id' | 'app.company_id' | 'app.user_id' | 'app.request_id', …, true)`, transaction-local) ажиллана. DB руу хандах цорын ганц зам нь `TenantSession`.
5. **Role** (канон: [000_extensions_roles.sql](../db/schema/000_extensions_roles.sql); group role NOLOGIN, login role нь гишүүн):
   - API нь `erp_app` (→ `app_user`), worker нь `erp_worker` (→ `app_worker` = `app_user` + лавлах хүснэгтэд бичих эрх) role-оор холбогдоно. Хоёулаа NOBYPASSRLS, эзэмшигч биш ([02-architecture.md](../02-architecture.md) §7.5);
   - объектыг `app_owner` (NOLOGIN, **NOBYPASSRLS**) эзэмшинэ. FORCE RLS эзэмшигчид ч үйлчилнэ. `app_owner`-т (мөн гишүүн `erp_owner`, `erp_migrator`-т) BYPASSRLS өгвөл FORCE утгагүй болно, тиймээс 900_rls.sql-ийн self-check ба catalog тест үүнийг хориглоно;
   - migration-ийг `erp_migrator` (`SET ROLE app_owner`) ажиллуулна. Тенантын өгөгдөлд хүрэх seed ба backfill тенант бүрд `platform.fn_set_context(…)` хийнэ;
   - BYPASSRLS нь зөвхөн NOLOGIN `app_rls_bypass`-д бий (тенант хоорондын SECURITY DEFINER функцийн эзэмшигч); `app_readonly` (BI, зөвхөн SELECT) ба `app_ops` (зөвхөн `integration.fn_ops_health()`) мөн NOBYPASSRLS.
6. **Тенант хоорондын боловсруулалт.** Worker-ийн тенант хоорондын ажлыг зөвхөн `SECURITY DEFINER` функцүүд гүйцэтгэнэ: `platform.fn_list_active_companies`, `integration.fn_claim_outbox` (EXECUTE зөвхөн `app_worker`). Эдгээр нь зөвхөн id буцаана. Payload-ийг тенантын контекст дотор уншина.
7. **Компанийн тусгаарлалт** нь дараах давхаргаар хангагдана:
   - RESTRICTIVE `company_isolation` RLS бодлого;
   - EF-ийн `"Company"` filter;
   - composite FK;
   - ledger-ийн INSERT trigger (`platform.fn_ledger_before_insert`);
   - integration test.
8. **Глобал лавлах хүснэгт** `tenant_id`-гүй, RLS-гүй. Жишээ: `fx.iso_currency`, `fx.official_exchange_rate`, `tax.tax_parameter`, `ebarimt.classification_code`, `ebarimt.tax_product_code`. `app_user` зөвхөн SELECT эрхтэй, шинэчлэлтийг `app_worker` (job) эсвэл migration хийнэ. Нэвтрэлтийн `identity` схем мөн тенантгүй, RLS-гүй (D-K7).
9. **CI-ийн каталог тест.** `tenant_id`-тэй хүснэгт бүрд RLS ENABLED, FORCED, `tenant_isolation` (ба шаардлагатай бол `company_isolation`) бодлого байгаа эсэх, `NOT NULL`-ийг шалгана. Тенант хоорондын уншилт ба бичилтийн сөрөг тест ажиллана.

## Үр дагавар

**Эерэг:**
- Нэг migration зам, нэг connection pool.
- Тенант нэмэх зардал бараг тэг.
- Тенант хоорондын ops тайлан ба метрикийг хялбар гаргана.
- Application-ий шүүлтүүрийн алдааг RLS хоёр дахь давхаргаар барина.

**Сөрөг ба эрсдэл:**
- **Нэг тенантыг дангаар нь сэргээх** (restore) нь PITR-ээр scratch кластерт сэргээгээд тухайн тенантыг хуулах журам шаардана.
- **Шуугиантай хөрш** (noisy neighbour): нэг тенант бусдын нөөцийг идэж болно.
  - Бууруулах арга: rate limit, `statement_timeout`, async тайлангийн дараалал.
- **RLS-ийн нөхцөл бүх query-д нэмэгдэнэ.** `tenant_id` индексийн эхэнд байдаг тул нөлөө бага.
- **FK шалгалт RLS-ийг тойрдог** (далд суваг). Composite FK `(company_id, x_id) → x (company_id, id)` ба `(tenant_id, company_id) → platform.company` тул тенант/компани хооронд холбоос үүсэхгүй.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Тенант бүрд тусдаа схем | Логик тусгаарлалт хүчтэй. Тенантыг тусад нь сэргээхэд хялбар | 5 000 схем: migration × 5 000, каталог томорно, pooling хэцүү | Масштаб |
| Тенант бүрд тусдаа DB | Хамгийн хүчтэй тусгаарлалт | Үйл ажиллагаа хүнд, зардал өндөр | Бичил бизнест хэт их |
| Зөвхөн application-ий шүүлтүүр (RLS-гүй) | Энгийн | Нэг алдаа = өгөгдөл задрах | Аюулгүй байдал |
| RLS-ийг зөвхөн `tenant_id` дээр тавих (компанийн RLS-гүй) | Бодлого энгийн | Компанийн тусгаарлалт зөвхөн application-д үлдэнэ | **Сонгоогүй**: канон схем RESTRICTIVE `company_isolation`-ийг `company_id NOT NULL` хүснэгт бүрд тавьдаг (900_rls.sql); тенантын түвшний хүсэлт `app.company_id`-гүй хүснэгтүүдээр л явна |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §4.2, TA-03
- PostgreSQL row security: https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- EF Core 10-ийн нэрлэсэн query filter: https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew#named-query-filters
