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
   - PK: `(tenant_id, company_id, id)`.
   - Бүх индекс `(tenant_id, company_id, …)`-аар эхэлнэ.
   - Тенантын түвшний хүснэгтэд PK нь `(tenant_id, id)`.
3. **RLS.** Тенантын бүх хүснэгтэд `ENABLE` ба **`FORCE ROW LEVEL SECURITY`** тохируулна. Бодлого `rls_<table>__tenant` нь `USING` ба `WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)`. Контекст тохируулаагүй бол query **алдаагаар зогсоно** (fail-closed), чимээгүй 0 мөр буцаахгүй. RLS бол хоёр дахь хамгаалалт: query бүр `tenant_id` ба `company_id`-ийн нөхцлийг өөрөө бичнэ.
4. **Контекст.** Transaction бүрийн эхэнд `set_config('app.tenant_id', …, true)` (transaction-local) ажиллана. Мөн `app.company_id`, `app.user_id`, `app.request_id`-ийг тохируулна. DB руу хандах цорын ганц зам нь `TenantSession`.
5. **Role:**
   - API нь `erp_app`, worker нь `erp_worker` role-оор холбогдоно. Хоёулаа NOBYPASSRLS, эзэмшигч биш. `erp_worker` нь нэмэлтээр лавлах хүснэгтэд бичих ба `quartz.*` эрхтэй ([02-architecture.md](../02-architecture.md) §7.5);
   - объектыг `erp_owner` (NOLOGIN, **NOBYPASSRLS**) эзэмшинэ. FORCE RLS эзэмшигчид ч үйлчилнэ. `erp_owner`-т BYPASSRLS өгвөл FORCE утгагүй болно, тиймээс catalog тест үүнийг хориглоно;
   - migration-ийг `erp_migrator` (`SET ROLE erp_owner`) ажиллуулна. Тенантын өгөгдөлд хүрэх seed ба backfill тенант бүрд `set_config('app.tenant_id', …)` хийнэ;
   - BYPASSRLS нь зөвхөн NOLOGIN `erp_dispatch_definer`-д бий (SECURITY DEFINER функцийн эзэмшигч).
6. **Тенант хоорондын боловсруулалт.** Worker-ийн тенант хоорондын ажлыг зөвхөн `SECURITY DEFINER` функцүүд гүйцэтгэнэ: `platform.fn_list_active_companies`, `integration.fn_claim_outbox`. Эдгээр нь зөвхөн id буцаана. Payload-ийг тенантын контекст дотор уншина.
7. **Компанийн тусгаарлалт** RLS биш, дараах арга хэмжээгээр хангагдана:
   - EF-ийн `"Company"` filter;
   - composite FK;
   - ledger-ийн INSERT trigger;
   - integration test.

   Ингэснээр RLS-ийн бодлого бүх хүснэгтэд нэг загвартай, энгийн хэвээр үлдэнэ.
8. **Глобал лавлах хүснэгт** `tenant_id`-гүй, RLS-гүй. Жишээ: `currency.ref_official_rate`, `tax.ref_legal_parameter`, `ebarimt.ref_*`. `erp_app` зөвхөн SELECT эрхтэй, шинэчлэлтийг `erp_worker` (job) эсвэл migration хийнэ.
9. **CI-ийн каталог тест.** `tenant_id`-тэй хүснэгт бүрд RLS ENABLED, FORCED, бодлого байгаа эсэх, `NOT NULL`-ийг шалгана. Тенант хоорондын уншилт ба бичилтийн сөрөг тест ажиллана.

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
- **FK шалгалт RLS-ийг тойрдог** (далд суваг). Composite FK нь `tenant_id`-г агуулдаг тул тенант хооронд холбоос үүсэхгүй.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Тенант бүрд тусдаа схем | Логик тусгаарлалт хүчтэй. Тенантыг тусад нь сэргээхэд хялбар | 5 000 схем: migration × 5 000, каталог томорно, pooling хэцүү | Масштаб |
| Тенант бүрд тусдаа DB | Хамгийн хүчтэй тусгаарлалт | Үйл ажиллагаа хүнд, зардал өндөр | Бичил бизнест хэт их |
| Зөвхөн application-ий шүүлтүүр (RLS-гүй) | Энгийн | Нэг алдаа = өгөгдөл задрах | Аюулгүй байдал |
| RLS-ийг `company_id` дээр мөн тавих | Компанийн давхар хамгаалалт | Тенантын түвшний (компани хоорондын) хүсэлтэд хоёр горим хэрэгтэй. Бодлого нарийсна | Энгийн байдал; компанийг өөр 4 давхаргаар хамгаалсан |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §4.2, TA-03
- PostgreSQL row security: https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- EF Core 10-ийн нэрлэсэн query filter: https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew#named-query-filters
