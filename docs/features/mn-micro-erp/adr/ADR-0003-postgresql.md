# ADR-0003: Өгөгдлийн сан — PostgreSQL 17/18 (DDL нь 16+-тай нийцнэ)

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §7, §8, §12. [ADR-0004](./ADR-0004-shared-schema-multitenancy-rls.md), [ADR-0014](./ADR-0014-sql-first-migrations.md)

## Нөхцөл байдал

Өгөгдлийн санд дараах шаардлага тавигдана:

1. Мөнгөний нарийн төрөл (`numeric`).
2. Мөрийн түвшний хамгаалалт (RLS).
3. Posting-ийг цуваа болгох хэрэгсэл (advisory lock).
4. Outbox-д зориулсан `FOR UPDATE SKIP LOCKED`.
5. Огнооны давхцалгүй түлхүүр (хуулийн параметр).
6. Нээлттэй лиценз.
7. Монголын провайдер дээр ажиллах боломж.

Нэмэлт нөхцөл:
- Монголын провайдерууд managed PostgreSQL-ийн ямар хувилбар санал болгодог нь UNVERIFIED. Тиймээс 18-аас гадна 17 дээр ч ажиллах ёстой.
- PG18-ийн шинэ боломжууд (`uuidv7()`, `WITHOUT OVERLAPS`) хэрэгтэй ч эдгээрт хатуу хамааралгүй байх нь зөв.

## Шийдвэр

1. **PostgreSQL 18-ийг** сонгоно. Провайдер зөвхөн 17 санал болговол 17-г хүлээн зөвшөөрнө. **DDL нь 16+-тай нийцнэ.**
   - **`uuidv7()`-г DDL-д шууд дуудахгүй.** UUIDv7-г application `Guid.CreateVersion7()`-оор үүсгэнэ (D-C8). Канон DDL-ийн `DEFAULT gen_random_uuid()` нь зөвхөн гараар/seed-ээр оруулах мөрийн нөөц ([db/schema](../db/schema/)).
   - **`WITHOUT OVERLAPS` / `PERIOD`-ийн оронд** `EXCLUDE USING gist (... WITH =, valid_during WITH &&)` (`btree_gist`) ашиглана.
   - **Virtual generated column-ийн оронд** `STORED` хэрэглэнэ, эсвэл view-ээр тооцно.
   - CI нь migration ба integration test-ийг **17 ба 18** дээр ажиллуулна. Шөнө бүр 16 дээр мөн ажиллуулна.
2. **Модуль бүр өөрийн схемтэй** (канон: [000_extensions_roles.sql](../db/schema/000_extensions_roles.sql), [DECISIONS](../DECISIONS.md) D-B3/D-K1). Модулийн схемүүд: `platform`, `gl`, `tax`, `party`, `sales`, `purchase`, `bank`, `fx`, `fa`, `inv`, `rpt`, `ebarimt`, `integration`, `audit`, `identity` (D-K7). Нийтлэг SQL объект (domain `platform.amount`, контекст функц, guard функц, counter) `platform` схемд байна; тусдаа `core`/`ops` схем байхгүй. Quartz.NET-ийн ADO store нь `quartz` схемд ([ADR-0018](./ADR-0018-background-jobs-quartz.md)).
3. **Extension** (канон 000 файл): `pgcrypto` (`digest()` — dimension set ба request hash), `btree_gist` (EXCLUDE constraint), `pg_trgm` (кирилл хайлт), `btree_gin` (`company_id` + trigram GIN индекс); мониторингт `pg_stat_statements` (`shared_preload_libraries`). Өөр extension нэмэх бол ADR бичнэ. AES шифрлэлтийг application хийнэ.
4. **PostgreSQL-ийг дараах үүрэгт давхар ашиглана:**
   - queue (outbox, `SKIP LOCKED`, `LISTEN/NOTIFY`);
   - scheduler store (Quartz ADO);
   - түгжээний менежер (advisory lock).

   v1-д Redis, RabbitMQ, Kafka ашиглахгүй.
5. **Isolation.** Command `READ COMMITTED` + тодорхой түгжээ ашиглана. Олон query-тэй тайлан `REPEATABLE READ READ ONLY`. `SERIALIZABLE` ашиглахгүй: retry-ийн нарийн төвөгтэй байдлаас зайлсхийнэ.
6. **Timeout.** Application-ий role-д `idle_in_transaction_session_timeout = '60s'`. Posting-д `SET LOCAL lock_timeout = '5s'`, `statement_timeout = '30s'`.
7. **Partition.** v1-д хуваахгүй. PK `(tenant_id, company_id, id)` хэлбэртэй тул хожим `HASH (tenant_id)`-аар түлхүүр өөрчлөхгүйгээр хувааж болно ([02-architecture.md](../02-architecture.md) §12.4).

## Үр дагавар

**Эерэг:**
- Нэг технологи. Гүйлгээний бүрэн баталгаа (ACID).
- Outbox ба бизнесийн өгөгдөл нэг transaction-д бичигдэнэ.
- Лицензийн зардал 0.

**Сөрөг ба эрсдэл:**
- **PostgreSQL нь queue-ийн үүрэгтэй учраас ачаалал нэмэгдэнэ.** Outbox ба Quartz-ийн хүснэгт ихээхэн өөрчлөгдөнө (bloat).
  - Бууруулах арга: дуусгасан outbox мөрийг 30 хоногийн дараа устгана; autovacuum-ийн хүснэгт тус бүрийн тохиргоо; хянах метрик.
- **Нэг DB кластер = нэг доголдлын цэг.**
  - Бууруулах арга: sync standby, PITR ([ADR-0022](./ADR-0022-backups-pitr-archive-retention.md)).
- **PG18-ийн боломжийг шууд ашиглахгүй** тул зарим DDL урт болно. Энэ нь хүлээн зөвшөөрөгдөх зардал.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| SQL Server | `decimal`, RLS, .NET-тэй сайн зохицно | Лицензийн зардал. Монголд Linux дээр ажиллуулах туршлага бага | Зардал |
| MySQL / MariaDB | Түгээмэл | RLS байхгүй. Constraint trigger ба deferred constraint сул | Бүрэн бүтэн байдлын шаардлага |
| CockroachDB / YugabyteDB | Хэвтээ масштаб | Advisory lock ба trigger-ийн ялгаа. Үйл ажиллагааны нарийн төвөг. Хэмжээнд хэрэггүй | Хэт их |
| Document DB (MongoDB) | Уян схем | Нягтлан бодох бүртгэлийн хамаарал ба transaction-ийн баталгаа сул | Зөв байдал |
| PG18-ийг шаардах (16/17-гүй) | Шинэ боломжууд | Провайдерын сонголт хумигдана | Байршлын уян хатан байдал |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §4 (PostgreSQL design), §15
- PostgreSQL 18 release notes: https://www.postgresql.org/docs/18/release-18.html
- Explicit locking (advisory locks): https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS
- Numeric types: https://www.postgresql.org/docs/18/datatype-numeric.html
