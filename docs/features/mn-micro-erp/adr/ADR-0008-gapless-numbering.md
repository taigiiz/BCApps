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

1. **Хууль ёсны дугаарын цуврал** (`platform.number_series`, `platform.number_series_line`, `platform.number_series_counter`; [010_platform.sql](../db/schema/010_platform.sql)):
   - Мөрийн загвар: `prefix + zero-padded integer (width) + suffix`. Формат `PREFIX-YYYY-#####`, жил бүр шинээр (D-C7). Жишээ: `SI-2026-` + `00042`.
   - `starting_date` нь жил бүрийн мөрийг заана; `reset_yearly` + `yearly_prefix_pattern` (`'SI-{YYYY}-'`) байвал шинэ жилийн мөрийг allocator анх хэрэглэхэд үүсгэнэ.
   - Тоог integer-ээр харьцуулна. String харьцуулалт ба `IncStr`-ийн ирмэгийн тохиолдол байхгүй.
   - Тохиргоо: `gapless`, `manual_nos`, `date_order` (`CHECK (NOT (gapless AND manual_nos))`).
2. **Дугаарыг зөвхөн posting transaction дотор** `platform.fn_next_document_no(series_code, date)` (SECURITY DEFINER) олгоно. Дараалал:
   - advisory lock авна (`platform.fn_lock_company_posting`);
   - цувралын мөрийг `SELECT … FOR UPDATE`;
   - `platform.number_series_counter`-ийг шинэчилж, `platform.number_allocation`-д (append-only) нотолгоо бичнэ. `app_user` counter-т шууд бичих эрхгүй.

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
6. **Гараар дугаар оруулах** (`manual_nos`) зөвхөн цоорхойгүй биш цувралд зөвшөөрөгдөнө. Цоорхойгүй цувралд гараар дугаар оруулахыг хориглоно.
7. **Ledger-ийн техникийн дугаар:**
   - `transaction_no`, `gl_register_no` ба ledger тус бүрийн `entry_no` нь `platform.fn_next_entry_no(ledger, count)`-оор `platform.ledger_counter` (компани × ledger: `GL_ENTRY`, `GL_TRANSACTION`, `GL_REGISTER`, `VAT_ENTRY`, …)-оос posting transaction дотор олгогдоно. Компани бүрд дараалсан, цоорхойгүй ([DECISIONS](../DECISIONS.md) D-K3).
   - Эдгээр дугаарт цоорхой гарвал хөндлөнгийн оролцооны шинж гэж үзнэ (шөнийн шалгалт `platform.fn_integrity_report` I-06).
   - `GENERATED ALWAYS AS IDENTITY` ашиглахгүй: identity нь хүснэгт даяар нэг дараалалтай (компани бүрд биш), rollback хийхэд цоорхой үүсгэдэг. Ledger мөрийн PK нь `id uuid` (UUIDv7), `entry_no` нь `UNIQUE (company_id, entry_no)` бүхий компанийн дараалал (D-K3).
8. **Техникийн id** нь **UUIDv7**.
   - Application `Guid.CreateVersion7()` ашиглана (D-C8). Канон DDL-ийн `DEFAULT gen_random_uuid()` нь зөвхөн гараар/seed-ээр оруулахад.
   - Цаг хугацаагаар эрэмбэлэгддэг тул B-tree индексэд ээлтэй.
   - Хоосон dimension set нь `dimension_set_id = 0` (BC-тэй адил), [ADR-0010](./ADR-0010-dimension-sets.md).
9. **eBarimt-ийн `billIdSuffix`** нь POS тус бүрийн тусдаа, хэзээ ч reset хийгддэггүй тоолуураар олгогдоно (`ebarimt.fn_next_bill_seq` → `ebarimt.pos_counter`, D-K4). [ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md)-ийг үзнэ үү.
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
