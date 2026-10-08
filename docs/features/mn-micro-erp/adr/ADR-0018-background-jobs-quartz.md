# ADR-0018: Background job — өөрийн outbox dispatcher + Quartz.NET

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §3, §7.6, §9.1. [ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md)

## Нөхцөл байдал

- **Шаардлагатай background ажлууд:**
  - outbox dispatch (eBarimt, имэйл, event);
  - eBarimt-ийн `sendData` ба `info` хяналт, лавлах өгөгдлийн шинэчлэл;
  - Монголбанкны ханш;
  - элэгдлийн run, давтагдах журнал;
  - босгын хяналт;
  - архивын багц, async тайлан;
  - hash chain ба тууштай байдлын шалгалт;
  - idempotency ба outbox цэвэрлэх;
  - нөөц хуулбарын шалгалт.
- **Ажлын хоёр төрөл:**
  - transaction-тай нягт холбоотой **outbox**: retry бодлого төрөл бүрд өөр, eBarimt-д retry хийхгүй;
  - **cron** хуваарьт ажил.
- **Хувилбарууд:**
  - Hangfire: LGPL-3.0 эсвэл арилжааны лиценз. PostgreSQL storage-ийн лиценз UNVERIFIED.
  - Quartz.NET: Apache-2.0. ADO.NET job store, clustering-тэй.
  - Wolverine: MIT. Ойлголтын ачаалал их ([tech-architecture.md](../research/tech-architecture.md) §6).

## Шийдвэр

1. **Outbox dispatcher-ийг өөрсдөө бичнэ.** Энэ нь `erp-worker` дахь `BackgroundService`.
   - `LISTEN outbox` + 2 s polling. `LISTEN` нь PgBouncer-ийг тойрсон тусдаа холболтоор явна;
   - `integration.fn_claim_outbox(worker, topics, limit, lease)` (SECURITY DEFINER, `app_rls_bypass` эзэмшинэ, EXECUTE зөвхөн `app_worker`, `FOR UPDATE SKIP LOCKED`) — `integration.outbox`-оос;
   - lease ба reaper;
   - `topic` бүрд `RetryPolicy` (`max_attempts`; eBarimt `ebarimt.receipt.send` = 1, D-I6), backoff (`available_at`), `DEAD` төлөв;
   - `depends_on_id`-ээр дараалал баталгаажуулна.

   Ойролцоогоор 300 мөр код. Бүрэн unit ба integration test-тэй.
2. **Хуваарьт ажилд Quartz.NET** ашиглана: ADO.NET job store (`quartz` схем, PostgreSQL; Quartz-ийн стандарт `qrtz_*` DDL нь тусдаа migration — канон схемд хараахан ороогүй, [02-architecture.md](../02-architecture.md) "Нийцүүлэлтийн тэмдэглэл"), clustering асаалттай. Ажлын каталог ба cron нь `integration.job_definition`-д ([140_integration_audit.sql](../db/schema/140_integration_audit.sql)), гүйлт `integration.job_run`-д. Ингэснээр нэг ажил олон worker-т давхар ажиллахгүй.
   - **Глобал ажил**: ханш, PosAPI-ийн хяналт, лавлах өгөгдөл, цэвэрлэгээ.
   - **Компанийн ажил** нь fan-out хэлбэртэй: Quartz-ийн глобал ажил `platform.fn_list_active_companies`-ээр компаниудыг гүйлгэж, компани бүрд outbox мессеж (`job.*`) үүсгэнэ. Гүйцэтгэлийг dispatcher тенантын контекст дотор хийнэ.
3. **Хуваарь** (Asia/Ulaanbaatar):

   | Ажил | Хуваарь |
   |---|---|
   | `MongolbankRateFetchJob` | Ажлын өдөр 11:00, 13:00, 16:00 |
   | `PosApiSendDataJob` | 4 цаг тутам |
   | `PosApiInfoPollJob` | 5 мин тутам |
   | `EbarimtReferenceRefreshJob` | Өдөр бүр 03:00 |
   | `EbarimtSalesTotalsJob` | 02:00 (01:00–07:00-ийн цонх) |
   | `DepreciationFanOutJob` | Сар бүрийн 1-нд 02:00 (санал. Хэрэглэгч батална) |
   | `HashChainVerifyJob` | 04:00 |
   | `ConsistencyCheckJob` (`platform.fn_integrity_report` компани бүрд) | 04:30 |
   | `CleanupJob` (`integration.cleanup` → `integration.fn_purge_expired`: idempotency 7 хоног, outbox/inbox 30 хоног, job_run 90 хоног; хугацаа дууссан `identity.user_session`) | 05:00 |
   | `RetentionPurgeJob` (`audit.fn_purge_expired` тенант бүрд, `audit.fn_purge_platform_rows`: 10 жилийн хадгалалт дууссан аудитын мөр; partition-гүй) | Сар бүрийн 1, 03:30 |
   | `NumberSeriesNextYearJob` | 12-р сарын 1 |

4. **Тенантын ажлын тогтвортой байдал:**
   - Нэг ажлын transaction ≤ 30 s.
   - Урт ажлыг chunk-лана.
   - Компани бүрд нэг зэрэг 1 async тайлан ажиллана.
5. **Ажиглалт.** `integration.job_run`, OTel метрик (`erp_outbox_*`) ба ops UI-ийн "Dead letter" жагсаалт. Тэндээс гараар дахин дараалалд оруулах боломжтой. eBarimt-ийн `ebarimt.receipt.send` (`max_attempts = 1`) мессежийг дахин оруулах боломжгүй: UNKNOWN-ийг шийдэх урсгалаар л явна.

## Үр дагавар

**Эерэг:**
- Лицензийн эрсдэлгүй (Apache-2.0).
- Outbox бизнесийн transaction-тай бүрэн нийцнэ.
- eBarimt-ийн retry-гүй бодлогыг кодоор баталгаажуулна.
- Нэмэлт infrastructure (Redis, broker) хэрэггүй.

**Сөрөг ба эрсдэл:**
- **Hangfire-ийн dashboard байхгүй.** Grafana-ийн dashboard ба ops UI-ийг өөрсдөө хийнэ.
- **Dispatcher-ийн кодыг өөрсдөө хариуцна.** Crash, lease, давхардлын тестээр хамгаална ([ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md)).
- **Quartz-ийн `qrtz_*` хүснэгтүүд** PostgreSQL-д ачаалал нэмнэ. Хэмжээ бага тул хүлээн зөвшөөрнө.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Hangfire | Dashboard, retry | LGPL эсвэл арилжааны лиценз. PostgreSQL storage-ийн лиценз UNVERIFIED. Ерөнхий retry eBarimt-д аюултай | Лиценз ба retry-ийн хяналт |
| Wolverine (outbox + scheduler) | Нэг сан | Ойлголт ба хамаарал их | Энгийн байдал |
| Зөвхөн `BackgroundService` + `PeriodicTimer` (cron-гүй) | Хамаарал байхгүй | Cluster lock, cron, misfire-ийг дахин бичнэ | Quartz үүнийг бэлэн шийддэг |
| RabbitMQ эсвэл Kafka | Хүчтэй messaging | Нэмэлт infrastructure. Transaction-тай нийцүүлэхэд outbox хэрэгтэй хэвээр | P10 зарчим |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §6
- Quartz.NET: https://github.com/quartznet/quartznet
- PostgreSQL `SKIP LOCKED`: https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE
