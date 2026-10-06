# ADR-0008: Цоорхойгүй хууль ёсны дугаар (BC No. Series), техникийн id нь UUIDv7

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §6.6, §8.2. [ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md)

## Нөхцөл байдал

- **Хууль ёсны дугаар.** Анхан шатны баримт (ТМ-1 нэхэмжлэх, МХ-1/МХ-2 кассын баримт) дараалсан дугаартай байна ([mn-accounting.md](../research/mn-accounting.md) §5.2, REQ-ACC-06). Хуулиар цоорхойгүй байх ёстой эсэх нь UNVERIFIED. Гэвч цоорхойгүй дугаар бол аюулгүй default.
- **PostgreSQL sequence цоорхой үүсгэдэг.** Rollback хийгдсэн `nextval` эргэж ашиглагддаггүй ([tech-architecture.md](../research/tech-architecture.md) §4.4).
- **BC-ийн No. Series.** Normal горимд дугаарын мөрийг түгжиж, ижил transaction-д бичдэг. Rollback хийвэл дугаар буцна. Баримтын posting дугаарыг ledger-ээс **өмнө commit** хийж, устгасан баримтын оронд "Deleted Document" орлуулагч бичдэг ([bc-dimensions-noseries-audit.md](../research/bc-dimensions-noseries-audit.md) R-29, R-35).
- **Манай posting** нэг transaction-д явагддаг ба компани тус бүрд цуваа ажилладаг ([ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md)).

## Шийдвэр

1. **Хууль ёсны дугаарын цуврал** (`platform.no_series` ба `no_series_line`):
   - Мөрийн загвар: `prefix + zero-padded integer + suffix`. Жишээ: `БН26-` + `00042`.
   - `starting_date` нь жил бүрийн мөрийг заана.
   - Тоог integer-ээр харьцуулна. String харьцуулалт ба `IncStr`-ийн ирмэгийн тохиолдол байхгүй.
   - Тохиргоо: `gapless`, `allow_manual`, `date_order`.
2. **Дугаарыг зөвхөн posting transaction дотор** олгоно. Дараалал:
   - advisory lock авна;
   - `SELECT … FOR UPDATE`;
   - `UPDATE … SET last_no = …`.

   Rollback хийвэл дугаар буцна, цоорхой үүсэхгүй. BC-ийн "commit-ийн өмнө нөөцлөх" ба "Deleted Document орлуулагч" механизм **хэрэггүй**.
3. **Цоорхойгүй цуврал (`gapless = true`):**
   - posted борлуулалтын нэхэмжлэх ба credit memo;
   - posted худалдан авалтын (дотоод) дугаар;
   - МХ-1 ба МХ-2;
   - банкны ваучер;
   - ерөнхий журналын ваучер;
   - БМ ба ҮХ баримт.
4. **Ноорогийн дугаар** (`draft_no`) хууль ёсны биш. Цоорхойтой байж болох тусдаа тоолуураар олгогдоно.
5. **`date_order`.** Хэрэглэх огноо ≥ мөрийн `last_date_used` байна (BC R-28). Default нь борлуулалтын нэхэмжлэх ба кассын баримтад асаалттай. Эхний үлдэгдэл оруулах цувралд унтраалттай.
6. **Гараар дугаар оруулах** (`allow_manual`) зөвхөн цоорхойгүй биш цувралд зөвшөөрөгдөнө. Цоорхойгүй цувралд гараар дугаар оруулахыг хориглоно.
7. **Ledger-ийн техникийн дугаар:**
   - `transaction_no`, `entry_no`, `register_no` нь `gl.company_counter`-оос posting transaction дотор олгогдоно. Компани бүрд дараалсан, цоорхойгүй.
   - Эдгээр дугаарт цоорхой гарвал хөндлөнгийн оролцооны шинж гэж үзнэ (шөнийн шалгалт).
   - `GENERATED ALWAYS AS IDENTITY` ашиглахгүй: identity нь хүснэгт даяар нэг дараалалтай (компани бүрд биш), rollback хийхэд цоорхой үүсгэдэг. Ledger мөрийн PK нь `(tenant_id, company_id, id)` (UUIDv7), `entry_no` нь компанийн дараалал бүхий UNIQUE багана.
8. **Техникийн id** нь **UUIDv7**.
   - Application `Guid.CreateVersion7()` ашиглана. DB-ийн default нь `core.fn_uuid_v7()`.
   - Цаг хугацаагаар эрэмбэлэгддэг тул B-tree индексэд ээлтэй.
   - Хоосон dimension set-ийг nil UUID sentinel-ээр илэрхийлнэ (BC-ийн 0), [ADR-0010](./ADR-0010-dimension-sets.md).
9. **eBarimt-ийн `billIdSuffix`** нь тусдаа тоолуураар олгогдоно (`ebarimt.pos_counter`, байнга өсдөг). [ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md)-ийг үзнэ үү.
10. **Шинэ жилийн мөр.** Шинэ санхүүгийн жилийн мөрийг 12-р сарын 1-нд job автоматаар үүсгэнэ. Хэрэглэгч засах боломжтой.

## Үр дагавар

**Эерэг:**
- Хууль ёсны дугаар цоорхойгүй бөгөөд огноотой хамт өснө.
- BC-ээс энгийн механизмтай: commit-ийн өмнө нөөцлөх, орлуулагч бичих шаардлагагүй.
- Аудитор дугаарын дарааллыг шууд шалгана.

**Сөрөг ба эрсдэл:**
- **Цуврал бүрийн мөр нь posting-ийн үеэр түгжигдэнэ.** Advisory lock компани бүрийн posting-ийг аль хэдийн цуваа болгосон тул нэмэлт зардал бараг байхгүй. 1–10 хэрэглэгчтэй компанид хүлээх хугацаа бага.
- **Preview нь тоолуурыг түгжинэ.** Rollback хийгддэг тул цоорхой үүсэхгүй. Preview-д rate limit тавина.
- **Хуулиар цоорхойгүй байх шаардлага** тодорхой болох хүртэл бүх баримтын цувралд цоорхойгүй дүрэм мөрдөнө.

**Шалгах (CI):**
- Concurrency test: нэг компанид 50 зэрэг posting, тэдгээрийн 10 нь санаатай алдаатай. Үр дүнд дугаар цоорхойгүй, давхардалгүй, огнооны дараалал зөрчигдөхгүй байна.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| PostgreSQL sequence | Түгжээгүй, хурдан | Цоорхой үүсгэнэ | Хууль ёсны дугаарт тохирохгүй. Ноорогт ч энгийн тоолуур хангалттай |
| BC-ийн аргаар: дугаарыг commit-ийн өмнө нөөцлөх + "Deleted Document" орлуулагч | BC-тэй ижил | Нарийн төвөгтэй. Олон commit цэгтэй | Нэг transaction-ий загварт хэрэггүй |
| Дугаарыг ноорог үүсэхэд олгох | Хэрэглэгч эрт харна | Ноорог устахад цоорхой үүснэ | Цоорхойгүй байх шаардлага |
| Глобал (тенант хоорондын) тоолуур | Энгийн | Тенант хооронд түгжээ үүснэ | Тусгаарлалт |

## Холбоос

- [bc-dimensions-noseries-audit.md](../research/bc-dimensions-noseries-audit.md) R-26..R-35, §7 (Number series), §8 (12–16)
- [tech-architecture.md](../research/tech-architecture.md) §4.4, TA-06
- BC: [`NoSeriesStatelessImpl.Codeunit.al`](../../../../src/Business%20Foundation/App/NoSeries/src/Single/NoSeriesStatelessImpl.Codeunit.al)
- PostgreSQL-ийн sequence функц: https://www.postgresql.org/docs/18/functions-sequence.html
