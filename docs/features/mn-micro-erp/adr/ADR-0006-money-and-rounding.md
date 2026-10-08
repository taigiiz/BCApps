# ADR-0006: Мөнгө ба бөөрөнхийлөлт

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг, нягтлан бодох бүртгэлийн шинжээч
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §8.3, §8.4. [ADR-0002](./ADR-0002-backend-stack-dotnet10.md), [ADR-0015](./ADR-0015-frontend-react-ag-grid.md)

## Нөхцөл байдал

- **Хөвөгч таслал.** Binary float (`double`) мөнгөн дүнг нарийн хадгалж чадахгүй.
- **PostgreSQL-ийн чимээгүй бөөрөнхийлөлт.** `numeric` нь scale-ээс илүү оронг **алдаа заалгүй чимээгүй бөөрөнхийлдөг**. `NaN` утгыг хадгалж болдог.
- **Хоёр системийн бөөрөнхийлөлт өөр.**
  - PostgreSQL-ийн `round()` дундаж цэгийг тэгээс холдуулж бөөрөнхийлдөг (away from zero).
  - .NET-ийн `Math.Round(decimal)` default-аараа банкны бөөрөнхийлөлт (`ToEven`) хийдэг ([tech-architecture.md](../research/tech-architecture.md) §3).
- **BC-ийн загвар:**
  - Мөр бүр бөөрөнхийлөгдсөн байх ёстой ("needs rounding" алдаа).
  - НӨАТ-ыг баримтын бүлгээр тооцож, мөрт running remainder-ээр хуваарилдаг.
  - FCY→LCY хөрвүүлэлтэд хуримтлагдсан нийлбэрийн арга хэрэглэдэг ([bc-vat.md](../research/bc-vat.md), [bc-sales-documents.md](../research/bc-sales-documents.md)).
- **eBarimt.** НӨАТ шингэсэн 2 оронтой дүнгүүдийн нийлбэр мөр → дэд баримт → баримт → төлбөрийн гинжээр яг таарах ёстой.
- **JavaScript** `number` нь IEEE-754 double.

## Шийдвэр

1. **C#:**
   - Мөнгө, тоо хэмжээ, ханшийг бүгдийг **`System.Decimal`**-ээр илэрхийлнэ.
   - `Money` value object = (`decimal Amount`, `CurrencyCode Currency`).
   - Бөөрөнхийлөлтийг **зөвхөн** `MoneyMath.Round(value, decimals)` хийнэ. Энэ нь `Math.Round(value, decimals, MidpointRounding.AwayFromZero)`-тэй ижил.
   - Domain ба persistence давхаргад `double`, `float` ба `MidpointRounding` заагаагүй `Math.Round` (`Math.Round(x, 2)` ч мөн, учир нь default нь `ToEven`) хэрэглэвэл analyzer ба architecture test алдаа гаргана. `Math.Round` зөвхөн `MoneyMath.Round` дотор байна.
2. **DB-ийн домэйн** (канон: [010_platform.sql](../db/schema/010_platform.sql), [DECISIONS](../DECISIONS.md) D-C1):

   | Домэйн | Төрөл | Хэрэглээ |
   |---|---|---|
   | `platform.amount` | `numeric(19,4)` | Бүх мөнгөн дүн (баримт, FCY, LCY/MNT ledger); валютын нарийвчлалаар бөөрөнхийлж хадгална |
   | `platform.unit_amount` | `numeric(19,6)` | Нэгжийн үнэ / өртөг |
   | `platform.quantity` | `numeric(19,5)` | Тоо хэмжээ |
   | `platform.percent` | `numeric(9,5)`, 0–100 | Хувь |
   | `platform.exch_rate` | **`numeric(38,18)`** | Ханш ба валютын коэффициент |

   LCY-д тусдаа domain (`amount_lcy`) байхгүй: 0.01-ийн бөөрөнхийлөлтийг engine/writer (`MoneyMath.Round`) хангаж, integration тест (`AssertNoHiddenRounding`) ба `platform.fn_integrity_report`-ийн I-08 (`UNROUNDED_MNT`) шалгана. Ханшийн `0 < rate < 1e10` хязгаарыг (`System.Decimal`-ийн 28–29 оронд багтаах) application шалгана.
3. **Нарийвчлал.** Дүнг хадгалахаас өмнө **валютын нарийвчлалаар** бөөрөнхийлнэ. `fx.currency.amount_rounding_precision` (ISO анхдагч нь `fx.iso_currency.minor_units`)-ийн утга: MNT 0.01, USD 0.01, JPY 1. Бүртгэлийн валют MNT, нарийвчлал нь **0.01-ээр тогтмол**. eBarimt мөн 2 оронтой. Хэвлэх нэгж (₮ эсвэл мянган ₮) нь зөвхөн харуулалтын параметр.
4. **Бөөрөнхийлөх дүрэм** ([02-architecture.md](../02-architecture.md) §8.4):
   - мөрийн дүн `round(qty × unit_price) − хөнгөлөлт`;
   - НӨАТ ба НХАТ нь VAT identifier бүлэг бүрд нэг удаа бөөрөнхийлөгдөж, мөрт running remainder-ээр хуваарилагдана (D-E3);
   - НӨАТ-тэй үнэд `VAT = round(gross × r/(100+r))`;
   - FCY→LCY хуримтлагдсан нийлбэрийн аргаар;
   - НӨАТ-ын бөөрөнхийлөлтийн төрөл `NEAREST` (default), `UP`, `DOWN` (абсолют утгаар).
5. **Тэнцэхгүй үлдэгдлийг автоматаар нөхөх ("round-off plug") хориотой.** Зөвхөн дараах тохиолдлуудад тодорхой дансанд зөрүү бичнэ:
   - бэлэн мөнгөний бүхэлчлэл (сонголттой, "Invoice rounding" данс);
   - тулгалтын бөөрөнхийлөлт (≤ 0.01, "Appln. rounding" данс);
   - ханшийн зөрүү (олз эсвэл гарз).
6. **Нэг цэвэр функц.** `ITaxCalculator.ComputeDocument` нь UI-ийн урьдчилсан тооцоо, PDF, eBarimt payload, posting-д **нэг ижил** үр дүн өгнө.
7. **API.** Мөнгийг JSON **string** хэлбэрээр (`"12345.67"`) дамжуулна. OpenAPI-д `type: string, format: decimal`. SPA эцсийн нийлбэр тооцохгүй. Урьдчилсан тооцоонд `decimal.js` ашиглана.

## Үр дагавар

**Эерэг:**
- Нарийвчлал ба бөөрөнхийлөлтийн нэг бодлого. C# ба SQL-ийн үр дүн ижил.
- BC-ийн тооцоотой харьцуулах боломжтой.
- eBarimt-ийн нийлбэрийн гинж таарна.

**Сөрөг ба эрсдэл:**
- **`numeric(19,4)`-д 0.01 нарийвчлалтай дүн хадгалах тул илүү 2 орон** "хоосон" байна. FCY-д хэрэг болох тул хүлээн зөвшөөрнө.
- **`NUMERIC(38,18)` ханш C#-ийн `decimal`-оос их байж болох** эрсдэл бий. `CHECK < 1e10` хязгаар үүнийг хаана.
- **Хөгжүүлэгчийн сахилга.** Бөөрөнхийлөөгүй утга DB-д хүрэхгүйг тест шалгана: posting-ийн бүх INSERT-ийн өмнө `Assert.Rounded`.

**Шалгах:**
- `Money`-ийн unit test: .NET ба PostgreSQL-ийн дундаж цэгийн тохиолдлууд (`2.345 → 2.35`, `-2.345 → -2.35`).
- Property test:
  - Σ мөрийн НӨАТ = header-ийн НӨАТ;
  - Σ LCY мөр = `round(Σ FCY × rate)`;
  - eBarimt-ийн гинж таарах.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| `numeric(18,2)` (судалгааны санал) | Хадгалах зай бага | FCY ба нэгжийн үнийн нарийвчлал хязгаарлагдана | Шийдвэр `numeric(19,4)` болж тогтсон |
| Бүхэл тоогоор хадгалах (мөнгө, ₮-ийн 100-ийн нэг) | Хурдан | Валютын нарийвчлал ялгаатай. Хувь ба ханшийн тооцоо төвөгтэй | Уян хатан биш |
| PostgreSQL `money` төрөл | — | Locale-оос хамаардаг, нарийвчлал тогтмол | PG-ийн баримт бичиг зөвлөдөггүй |
| Banker's rounding (`ToEven`) | .NET-ийн default | PostgreSQL-ийн `round()` ба худалдааны практикаас зөрнө | Нэг бодлого |
| Мөр бүрийн НӨАТ-ыг тусад нь бөөрөнхийлж нэмэх | Энгийн | Header-ийн НӨАТ ≠ round(Σ base × r) | BC-ийн бүлгийн арга илүү зөв |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §3 (Money handling rules), TA-01, TA-02
- [bc-vat.md](../research/bc-vat.md) §5, [bc-sales-documents.md](../research/bc-sales-documents.md) §5, E6, [bc-gl-posting.md](../research/bc-gl-posting.md) R-GL-POSTING-34
- PostgreSQL numeric: https://www.postgresql.org/docs/18/datatype-numeric.html
- .NET `Math.Round`: https://learn.microsoft.com/dotnet/api/system.math.round
