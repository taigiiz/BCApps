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
   - Гадаад нөлөө бүрийг posting ба бизнесийн transaction-д `integration.outbox_message` мөр болгон бичнэ: eBarimt, имэйл, integration event, компанийн job.
   - Dispatcher нь commit-ийн дараа `FOR UPDATE SKIP LOCKED`-ээр мөрийг авч илгээнэ. Ажиллах эхлэлийг `LISTEN/NOTIFY` эсвэл 2 s polling өгнө ([ADR-0018](./ADR-0018-background-jobs-quartz.md)).
   - Тенант хоорондын claim-ийг SECURITY DEFINER функц хийнэ.
2. **Мессежийн төрөл бүрд retry бодлого** ([02-architecture.md](../02-architecture.md) §9.1):
   - `NONE`: `ebarimt.receipt.create`, `ebarimt.receipt.void`;
   - `STANDARD`: GET, имэйл, event.
3. **Inbox.** Consumer `integration.inbox_message (consumer, message_id)`-ийг handler-ийн transaction-д бичнэ. Ингэснээр at-least-once хүргэлт нэг удаагийн нөлөө болно.
4. **API idempotency.**
   - Бүх command-д `Idempotency-Key` заавал байна.
   - `integration.idempotency_key (tenant_id, key)` UNIQUE хүснэгтэд `request_hash`, төлөв, хариуг бизнесийн өөрчлөлттэй **ижил transaction**-д хадгална.
   - Дахин илгээхэд хадгалсан хариуг буцаана. Өөр hash-тэй бол 422. Зэрэг хүсэлт unique индекс дээр хүлээнэ.
   - Хадгалах хугацаа 7 хоног.
5. **eBarimt-ийн дүрэм:**
   - **Retry-гүй.** `POST /rest/receipt` ба `DELETE /rest/receipt`-ийн HttpClient-д resilience handler **бүртгэхгүй**. Architecture test үүнийг шалгана.
   - **Далд retry-гүй.** Энэ client тусдаа `SocketsHttpHandler`-тэй, холболтыг дахин ашиглахгүй (`PooledConnectionLifetime = TimeSpan.Zero`, хүсэлт бүрд `ConnectionClose = true`). Reuse хийсэн холболт тасрахад handler хүсэлтийг дотооддоо дахин илгээж болзошгүйг ингэж хаана ([02-architecture.md](../02-architecture.md) §9.2).
   - **Илгээхийн өмнө** `SENDING` ба `attempt_started_at`-ийг тусдаа transaction-д commit хийнэ.
   - **Төлөвийн шилжилт:**
     - timeout, тасалдал, 5xx, эсвэл lease дууссан → `UNKNOWN`;
     - PosAPI баталгаажуулалтын алдаа → `REJECTED`;
     - **TCP холболт тогтоогдоогүй** (`ConnectCallback`-ийн wrapper баталсан, хүсэлт сүлжээнд гараагүй) → мөр `PENDING` руу буцаж дахин dispatch хийгдэнэ. Энэ нь сүлжээнд гарсан POST-ийг давтах биш. Сүлжээнд гарсан POST-ийг хэзээ ч автоматаар дахин илгээхгүй.
   - **UNKNOWN-ийг оператор шийднэ:** "бүртгэгдсэн" (ДДТД оруулна) эсвэл "бүртгэгдээгүй" (шинэ `billIdSuffix`-тэй шинэ хүсэлт). Шийдвэр бүр аудитын логт бичигдэнэ.
   - **`billIdSuffix`.** `ebarimt.pos_counter` нь posting transaction-д олгогдоно, **өдөр бүр тэглэгдэхгүй**. Утга = `posNo` (3) + `seq mod 10^6` (6 орон). DB-ийн UNIQUE constraint давхардлаас хамгаална.
   - **`qrData` ба `lottery`** нь `PrintOnly<string>` төрөлтэй. Зөвхөн синхрон HTTP хариуны `PrintPayload`-д л байна. Хадгалахгүй газрууд: outbox payload, `ebarimt.receipt`, лог, trace, кэш, browser storage. Canary тест үүнийг шалгана ([ADR-0020](./ADR-0020-observability-otel-redaction.md)).
   - **POS (`SYNC_FIRST`).** Commit хийсний дараа API процесс мөрийг id-аар шууд авч илгээнэ (`integration.fn_claim_outbox_by_id`). Мөр `next_attempt_at = now() + 30 s`-тэй бичигдсэн тул worker 30 s-ээс өмнө авахгүй. Нэхэмжлэх асинхрон явна.
   - **Дараалал.** Засварын баримт (`inactiveId`) эх баримт SENT болсны дараа илгээгдэнэ (`depends_on_id`).
   - **Илгээхийн өмнөх шалгалт.** Нийлбэрийн гинж, `taxType`, `taxProductCode`, `classificationCode` 7 орон, B2B/B2C талбар зэргийг шалгана ([02-architecture.md](../02-architecture.md) §9.2).
6. **Posting ба eBarimt салангид.** eBarimt-ийн алдаа posting-ийг rollback хийхгүй. Баримт "eBarimt: хүлээгдэж буй / тодорхойгүй / татгалзсан" төлөвтэй харагдана. 48 цагаас дээш SENT болоогүй баримтын тайлан гарна. Энэ нь 72 цагийн хязгаараас өмнө анхааруулна.

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
