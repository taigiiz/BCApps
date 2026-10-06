# ADR-0020: Ажиглалт — OpenTelemetry, self-host, `qrData`/`lottery`-г хасах

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §11. [ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md), [ADR-0013](./ADR-0013-hosting-in-mongolia-posapi-operator.md), [ADR-0023](./ADR-0023-compliance-gates.md)

## Нөхцөл байдал

- **Хадгалахыг хориглосон өгөгдөл.** eBarimt-ийн журмаар `qrData` ба `lottery`-г **лог, кэш зэрэг ямар ч хэлбэрээр хадгалахыг хориглоно**. Ерөнхий APM хэрэгслүүд HTTP body-г автоматаар бичдэг ([mn-integrations-market.md](../research/mn-integrations-market.md) §2.3).
- **Хувийн мэдээлэл.** Хувь хүний мэдээлэл (регистр, `civil_id`, утас, `consumerNo`) логт орох ёсгүй. Өгөгдлийг Монголоос гаргахгүй ([ADR-0013](./ADR-0013-hosting-in-mongolia-posapi-operator.md)).
- **OpenTelemetry .NET** logs, metrics, traces гурвуулаа stable болсон. Vendor-оос хамааралгүй ([tech-architecture.md](../research/tech-architecture.md) §12).
- **Бизнесийн SLO** (posting-ийн хурд, outbox-ийн хоцрогдол, UNKNOWN баримт, `sendData`-ийн нас) шууд харагдах ёстой.

## Шийдвэр

1. **Instrumentation.** OpenTelemetry .NET SDK-ийг `erp-api` ба `erp-worker`-т ашиглана. Хамрах хүрээ: ASP.NET Core, HttpClient, Npgsql (SQL текст орно, параметр орохгүй), runtime. Бизнесийн метрик ба span-ийг `ActivitySource` ба `Meter`-ээр нэмнэ.
2. **Урсгал:**
   - OTLP gRPC → OTel Collector (contrib) → Prometheus (metrics), Loki (logs), Tempo (traces) → Grafana.
   - **Бүгд Монгол дахь ДЦ-ийн `ops` VLAN-д** self-host хийгдэнэ.
   - Хадгалах хугацаа: метрик 13 сар, лог 30 хоног, trace 7 хоног.
3. **Redaction-ийн 4 давхарга:**
   1. **Төрөл.** `PrintOnly<T>` (eBarimt-ийн `qrData`, `lottery`) ба `Microsoft.Extensions.Compliance.Redaction`-ийн data classification (`[EbarimtPrintOnly]`, `[PersonalData]`, `[Secret]`). Logger redactor-ийг бүртгэнэ.
   2. **HTTP client.** eBarimt-ийн client-д logger байхгүй (`RemoveAllLoggers()`). HTTP body-г span-д оруулахгүй. Гадаад дуудлагын лог (`integration_attempt`) body-гүй.
   3. **Collector.** `attributes` ба `transform` processor нь дараах түлхүүрийг устгана: `qrData`, `qr_data`, `lottery`, `password`, `token`, `authorization`, `cookie`, `regNo`, `civil_id`, `consumerNo`.
   4. **Тест (canary).** Stub PosAPI-ийн `qrData` нь `QR-CANARY-<guid>`. Integration test тест ажилласны дараа дараах газруудаас canary утгыг хайна:
      - DB-ийн бүх текст ба jsonb багана;
      - Loki/файл лог;
      - trace-ийн экспорт.

      Олдвол CI унана.
4. **Лог:**
   - Бүтэцтэй JSON. `trace_id`, `tenant_id`, `company_id`, `user_id`, `request_id` талбартай.
   - HTTP body бичихгүй. SQL параметр бичихгүй.
   - EF-ийн `EnableSensitiveDataLogging` production-д асаалттай бол startup алдаа гаргана.
5. **Метрик.** [02-architecture.md](../02-architecture.md) §11.3-ийн жагсаалт. Label-д тенантын id **оруулахгүй** (cardinality).
6. **Trace.** Span-д `erp.tenant_id`, `erp.company_id`, `erp.document_id`, `erp.transaction_id`, `erp.outbox_id` attribute-тэй. Sampling: алдаа гарсан ба posting-ийн trace 100%, бусад 10%.
7. **Alert** Grafana-аар илгээгдэнэ: Telegram, SMS, имэйл. P1/P2/P3 түвшинтэй ([02-architecture.md](../02-architecture.md) §11.7). Runbook-ийн холбоос alert бүрт байна.
8. **Аудитын лог техникийн логоос тусдаа.** Аудитын лог DB-д 10 жил хадгалагдана ([02-architecture.md](../02-architecture.md) §11.6). Техникийн лог аудитын нотолгоо болохгүй.

## Үр дагавар

**Эерэг:**
- Vendor-оос хамааралгүй, нэг стандарт.
- Өгөгдөл Монголоос гарахгүй.
- eBarimt-ийн журам ба ХХМХТХ-ийн шаардлагыг тестээр нотолно.

**Сөрөг ба эрсдэл:**
- **Observability стекийг өөрсдөө ажиллуулна.** 1–2 VM ба засвар үйлчилгээ шаардлагатай.
- **Loki, Tempo, Grafana нь AGPL-3.0.** Өөрчлөлтгүй, дотооддоо тусдаа процесс болгон ашиглах тул product-ийн лицензэд нөлөөлөхгүй.
- **Redaction-ийн давхаргууд** хөгжүүлэгчийн сахилга шаарддаг. Canary тест ба analyzer-ээр хамгаална.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Гадаадын SaaS APM (Datadog, New Relic гэх мэт) | Үйл ажиллагаагүй | Өгөгдөл Монголоос гарна. Зардал. Body capture-ийн эрсдэл | Байршил ба нийцэл |
| SigNoz (self-host) | Нэг UI | ClickHouse-ийн үйл ажиллагаа. Лицензийг дахин шалгах шаардлагатай | Grafana стек түгээмэл |
| Зөвхөн файл лог | Энгийн | Метрик ба trace байхгүй. SLO хэмжих боломжгүй | Хангалтгүй |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §12, TA-13
- [mn-integrations-market.md](../research/mn-integrations-market.md) §2.3 (хориг), §7 (хувийн мэдээлэл)
- OpenTelemetry .NET: https://github.com/open-telemetry/opentelemetry-dotnet
