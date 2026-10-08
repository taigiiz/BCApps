# ADR-0012: Transactional outbox, idempotency, eBarimt-ийг автоматаар дахин илгээхгүй

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §6.3, §8.5, §9.1, §9.2. [ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md), [ADR-0013](./ADR-0013-hosting-in-mongolia-posapi-operator.md), [ADR-0018](./ADR-0018-background-jobs-quartz.md), [ADR-0020](./ADR-0020-observability-otel-redaction.md)

## Нөхцөл байдал

- **Гадаад дуудлагыг transaction-д оруулах боломжгүй.** Posting-ийн transaction дотор гадаад систем (eBarimt, имэйл, банк) рүү хандвал:
  - түгжээ удаан баригдана;
  - гадаад систем амжилттай, DB rollback болох зөрүү үүснэ.
- **eBarimt PosAPI 3.0-ийн дүрэм** (v3.2.48, [mn-integrations-market.md](../research/mn-integrations-market.md) §2):
  - `POST /rest/receipt`-ийг **автоматаар дахин илгээхгүй**. Timeout болсон бол баримт аль хэдийн үүссэн байж магадгүй. `PENDING` бичиж, timeout-д `UNKNOWN` болгоод гараар шийдвэрлэнэ. Зөвхөн GET-ийг retry хийнэ.
  - `billIdSuffix` өдөр бүр давхардах ёсгүй. Давхардвал ДДТД давхцах алдаа гарна.
  - **`qrData` ба `lottery`-г хэвлэхээс өөр ямар ч хэлбэрээр хадгалахыг хориглоно**: DB, лог, кэш.
  - Баримт 72 цагийн дотор нэгдсэн системд хүрэх ёстой.
- **HTTP-ийн давхар хүсэлт.** Сүлжээ тасарвал клиент дахин илгээнэ. Commit хийгдсэн эсэх тодорхойгүй үед давхар posting гарч болно.

## Шийдвэр

1. **Transactional outbox.**
   - Гадаад нөлөө бүрийг posting ба бизнесийн transaction-д `integration.outbox` мөр (`topic`, `payload`, `idempotency_key`, `max_attempts`) болгон бичнэ: eBarimt, имэйл, integration event, компанийн job ([140_integration_audit.sql](../db/schema/140_integration_audit.sql)).
   - Dispatcher нь commit-ийн дараа `FOR UPDATE SKIP LOCKED`-ээр мөрийг авч илгээнэ. Ажиллах эхлэлийг `LISTEN/NOTIFY` эсвэл 2 s polling өгнө ([ADR-0018](./ADR-0018-background-jobs-quartz.md)).
   - Тенант хоорондын claim-ийг SECURITY DEFINER функц `integration.fn_claim_outbox` (`app_rls_bypass` эзэмшинэ, EXECUTE зөвхөн `app_worker`) хийнэ.
2. **`topic` бүрд retry бодлого** ([02-architecture.md](../02-architecture.md) §9.1):
   - retry-гүй (`max_attempts = 1`, D-I6): `ebarimt.receipt.send` (`POST` ба `DELETE /rest/receipt`, `ebarimt_document.operation`-оор ялгана);
   - стандарт: GET (`ebarimt.send_data`, `ebarimt.info_poll`), имэйл, event.
3. **Inbox.** Consumer `integration.inbox (tenant_id, source, message_id)` UNIQUE мөрийг handler-ийн transaction-д бичнэ. Ингэснээр at-least-once хүргэлт нэг удаагийн нөлөө болно.
4. **API idempotency.**
   - Бүх command-д `Idempotency-Key` заавал байна.
   - `integration.idempotency_key (tenant_id, key)` UNIQUE хүснэгтэд `request_hash`, төлөв, хариуг бизнесийн өөрчлөлттэй **ижил transaction**-д хадгална.
   - Дахин илгээхэд хадгалсан хариуг буцаана. Өөр hash-тэй бол 422. Зэрэг хүсэлт unique индекс дээр хүлээнэ.
   - Хадгалах хугацаа 7 хоног.
5. **eBarimt-ийн дүрэм:**
   - **Retry-гүй.** `POST /rest/receipt` ба `DELETE /rest/receipt`-ийн HttpClient-д resilience handler **бүртгэхгүй**. Architecture test үүнийг шалгана.
   - **Далд retry-гүй.** Энэ client тусдаа `SocketsHttpHandler`-тэй, холболтыг дахин ашиглахгүй (`PooledConnectionLifetime = TimeSpan.Zero`, хүсэлт бүрд `ConnectionClose = true`). Reuse хийсэн холболт тасрахад handler хүсэлтийг дотооддоо дахин илгээж болзошгүйг ингэж хаана ([02-architecture.md](../02-architecture.md) §9.2).
   - **Илгээхийн өмнө** `ebarimt.ebarimt_document.status = 'SENT'` (in-flight), `attempt_count = 1`, `last_attempt_at`-ийг тусдаа transaction-д commit хийнэ (`CHECK (attempt_count <= max_attempts …)`).
   - **Төлөвийн шилжилт** (канон төлөв: `PENDING`, `SENT`, `SUCCESS`, `ERROR`, `UNKNOWN`, `CANCELLED`; [12-ebarimt-integration.md](../12-ebarimt-integration.md) §9):
     - амжилттай (ДДТД) → `SUCCESS`;
     - timeout, тасалдал, 5xx, эсвэл lease дууссан → `UNKNOWN`;
     - PosAPI баталгаажуулалтын алдаа → `ERROR`;
     - **TCP холболт тогтоогдоогүй** (`ConnectCallback`-ийн wrapper баталсан, хүсэлт сүлжээнд гараагүй) → `ERROR` (баримт үүсээгүй нь тодорхой); дахин илгээхдээ **шинэ** баримт (шинэ `billIdSuffix`) үүсгэнэ. Сүлжээнд гарсан POST-ийг хэзээ ч автоматаар дахин илгээхгүй.
   - **UNKNOWN-ийг оператор шийднэ** (`ebarimt.unknown.resolve` эрх): "бүртгэгдсэн" (ДДТД оруулна → `SUCCESS` + `resolved_*`) эсвэл "бүртгэгдээгүй" (`CANCELLED` + шинэ `billIdSuffix`-тэй шинэ хүсэлт). Шийдвэр бүр аудитын логт бичигдэнэ.
   - **`billIdSuffix`** ([DECISIONS](../DECISIONS.md) D-K4). `ebarimt.fn_next_bill_seq(ebarimt_pos_id)` нь `ebarimt.pos_counter`-оос posting transaction-д олгоно, **хэзээ ч reset хийгдэхгүй**. `bill_id_suffix = bill_seq % 10^6`; илгээх утга = `posNo` (3) + 6 орон. `UNIQUE (company_id, ebarimt_pos_id, bill_seq)` ба `UNIQUE (company_id, ebarimt_pos_id, bill_date, bill_id_suffix)` давхардлаас хамгаална.
   - **`qrData` ба `lottery`** нь `PrintOnly<string>` төрөлтэй. Зөвхөн синхрон HTTP хариуны `PrintPayload`-д л байна. Хадгалахгүй газрууд: outbox payload, `ebarimt.ebarimt_document` (JSON багана бүр `integration.fn_has_forbidden_ebarimt_keys` CHECK-тэй), лог, trace, кэш, browser storage. Canary тест үүнийг шалгана ([ADR-0020](./ADR-0020-observability-otel-redaction.md)).
   - **POS (`SYNC_FIRST`).** Commit хийсний дараа API процесс мөрийг тенантын контекст дотор id-аар шууд авч (`UPDATE integration.outbox SET status = 'PROCESSING' … WHERE id = $1 AND status = 'PENDING'`) илгээнэ; SECURITY DEFINER функц хэрэггүй. Мөр `available_at = now() + 30 s`-тэй бичигдсэн тул worker 30 s-ээс өмнө авахгүй. Нэхэмжлэх асинхрон явна.
   - **Дараалал.** Засварын баримт (`inactiveId`) эх баримт `SUCCESS` болсны дараа илгээгдэнэ (outbox `depends_on_id`, `ebarimt_document.replaces_document_id`).
   - **Илгээхийн өмнөх шалгалт.** Нийлбэрийн гинж, `taxType`, `taxProductCode`, `classificationCode` 7 орон, B2B/B2C талбар зэргийг шалгана ([02-architecture.md](../02-architecture.md) §9.2).
6. **Posting ба eBarimt салангид.** eBarimt-ийн алдаа posting-ийг rollback хийхгүй. Баримт "eBarimt: хүлээгдэж буй / тодорхойгүй / татгалзсан" төлөвтэй харагдана. 48 цагаас дээш `SUCCESS` болоогүй баримтын тайлан гарна (`ebarimt.overdue_check` job). Энэ нь 72 цагийн хязгаараас өмнө анхааруулна.

## Үр дагавар

**Эерэг:**
- Posting ба гадаад нөлөө хоорондоо зөрөхгүй.
- Давхар баримт гарахгүй.
- PosAPI-ийн журамд нийцнэ.
- Процесс унасан ч мессеж алдагдахгүй.

**Сөрөг ба эрсдэл:**
- **UNKNOWN-ийг гараар шийдэх** ажил оператор ба нягтланд ногдоно.
  - Бууруулах арга: тодорхой UI ба alert. `billIdSuffix`-ээр баримт хайх API байгаа эсэхийг ITC-ээс асууна (UNVERIFIED). Байвал автомат шалгалт нэмнэ.
- **QR-тай баримтыг дахин хэвлэх боломжгүй.** Журмын тодруулга авах хүртэл "ХУУЛБАР"-ыг QR-гүй хэвлэнэ.
- **Outbox хүснэгт ихээр өөрчлөгдөнө.** Дууссан мөрийг 30 хоногийн дараа устгана. Autovacuum-ийг тохируулна.

**Шалгах (CI):**
- Stub PosAPI timeout өгөхөд → `UNKNOWN` болж, POST дахин илгээгдэхгүй (stub-ийн дуудлагын тоо = 1).
- Stub PosAPI хүсэлтийг хүлээн аваад холболтыг хариугүй хаахад → `UNKNOWN`, stub-ийн дуудлагын тоо = 1 (далд retry байхгүй).
- Commit ба dispatch-ийн хооронд процессыг "алах" тест: мессеж нэг удаа хүргэгдэнэ.
- Idempotency: ижил түлхүүрээр зэрэг 10 хүсэлт илгээхэд 1 posting гарна.
- `qrData` canary тест.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Posting transaction дотор PosAPI дуудах | Энгийн, QR шууд гарна | Түгжээг удаан барина. PosAPI амжилттай + DB rollback = бүртгэлгүй баримт | Зөв байдал |
| Ерөнхий retry (Polly) бүх дуудлагад | Найдвартай мэт | `POST /rest/receipt` давхардана | PosAPI-ийн журам |
| Wolverine / MassTransit outbox | Бэлэн | Ойлголтын ачаалал их. eBarimt-ийн тусгай төлөвийн машин хэрэгтэй хэвээр | Энгийн байдал ([ADR-0018](./ADR-0018-background-jobs-quartz.md)) |
| `qrData`-г шифрлэж хадгалах (дахин хэвлэхэд) | Дахин хэвлэх боломжтой | Журмаар шууд хориглосон | Хууль, журам |
| Idempotency-г зөвхөн баримтын төлвөөр | Энгийн | Commit тодорхойгүй үед төлбөр ба журнал давхардана | Хангалтгүй |

## Холбоос

- [mn-integrations-market.md](../research/mn-integrations-market.md) §2, I-01..I-07
- [tech-architecture.md](../research/tech-architecture.md) §5, TA-09, TA-10
- [mn-tax.md](../research/mn-tax.md) R15
- eBarimt PosAPI 3.0 (developer.itc.gov.mn, v3.2.48, 2026-09-15). Асуулт: posapi@itc.gov.mn
