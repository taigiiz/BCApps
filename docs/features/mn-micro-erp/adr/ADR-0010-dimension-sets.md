# ADR-0010: Dimension set (BC Dimension Set ID-ийн загвар)

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг, нягтлан бодох бүртгэлийн шинжээч
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §4.2.4, §6.2. [ADR-0007](./ADR-0007-append-only-ledger-reversal.md), [ADR-0008](./ADR-0008-gapless-numbering.md)

## Нөхцөл байдал

- **BC-ийн dimension.** Dimension нь дүнгийн шинжилгээний шошго (хэлтэс, салбар, төсөл). Дүн өөрөө биш.
  - Мөр ба entry бүр **нэг integer `Dimension Set ID`**-тэй.
  - Энэ ID нь өөрчлөгдөхгүй, давхардалгүй (dimension → value) хосын багцыг заана. 0 нь хоосон багц.
  - ID-г `Dimension Set Tree Node` модоор олдог. Утгуудын оруулсан дарааллаас үл хамааран ижил багц ижил ID авна (R-07..R-10).
- **Default dimension ба value posting.**
  - Default dimension-ий value posting дүрэм: Code Mandatory, Same Code, No Code.
  - Дүрмүүд хуримтлагддаг (R-19).
  - Posting-ийн явцад гарал үүслийн дансанд (авлага, НӨАТ, банк) дахин шалгагддаг (R-20).
- **Global dimension.** BC 2 "global dimension"-ий утгыг entry бүрт багана болгон хуулдаг (R-23). Global dimension-ийг солих үед бүх ledger хүснэгтийг дахин бичдэг (R-24).
- **Манай ledger append-only** ([ADR-0007](./ADR-0007-append-only-ledger-reversal.md)). Бичил бизнест ихэвчлэн 0–2 dimension хэрэгтэй (салбар/дэлгүүр, төсөл).

## Шийдвэр

1. **Хүснэгтүүд (`gl` схем, компанийн түвшинд):**

   | Хүснэгт | Агуулга |
   |---|---|
   | `dimension` | `code`, `name`, `blocked` |
   | `dimension_value` | `dimension_id`, `code`, `name`, `parent_id`, `value_type ∈ {STANDARD, TOTAL}`, `blocked` |
   | `dimension_set` | `id` (UUIDv7), `key_hash` (UNIQUE), `key_text` |
   | `dimension_set_entry` | `set_id`, `dimension_id`, `value_id`. Нэг удаа бичигдэнэ, өөрчлөгдөхгүй |
   | `default_dimension` | `entity_type`, `entity_id NULL` (NULL = тухайн төрлийн бүх мөр), `dimension_id`, `value_id NULL`, `value_posting ∈ {NONE, CODE_MANDATORY, SAME_CODE, NO_CODE}` |

2. **Set-ийг агуулгын түлхүүрээр олно. ID нь UUIDv7.**
   - `key_text = join(sort_asc("dimension_id:value_id"), ";")`, `key_hash = sha256(key_text)`.
   - `UNIQUE (tenant_id, company_id, key_hash)`.
   - Үүсгэх: `INSERT … (id = UUIDv7, key_hash, key_text) ON CONFLICT (tenant_id, company_id, key_hash) DO NOTHING RETURNING id`. Мөр буцаагүй бол (өөр session аль хэдийн үүсгэсэн) `SELECT id … WHERE key_hash = …`. Дараа нь `dimension_set_entry`-г нэг удаа бичнэ.
   - Хоосон багц = **nil UUID** (`00000000-0000-0000-0000-000000000000`) sentinel. BC-ийн "0"-тэй ижил. Энэ мөрийг `ICompanySeeder` компани бүрд үүсгэнэ, ингэснээр FK бүрэн ажиллана.
   - Ижил багц ямагт ижил ID авна: утгын дараалал ба эх сурвалжаас хамаарахгүй, зэрэг хүсэлт давхардал үүсгэхгүй (BC R-07..R-09).
   - Application нь компани бүрийн `key_hash → id`-г санах ойд кэшлэнэ (багц хэзээ ч өөрчлөгдөхгүй тул кэш хүчингүй болохгүй).
   - **Зөвхөн commit хийгдсэн id-г кэшлэнэ.** Posting-ийн transaction дотор шинээр үүссэн багцыг `TenantSession`-ий post-commit hook кэшид нэмнэ. Preview эсвэл алдаатай posting rollback хийгдвэл тэр багц DB-ээс арилна. Кэшид орсон бол дараагийн posting FK алдаа өгнө. Кэшээс олдоогүй id-г ямагт insert-or-select-оор авна.
3. **Утгыг surrogate id-аар** хадгална. Утгын кодыг нэрлэж солиход багц өөрчлөгдөхгүй. Блоклогдсон утгыг posting-ийн үед дахин шалгана (R-18).
4. **Хязгаар.** v1-д компанид **≤ 4 идэвхтэй dimension** байна. Эхний 2 нь UI-д мөрийн багана болж харагдана (shortcut).
5. **Ledger-д global dimension-ий багана хуулахгүй.**
   - Ledger append-only тул global-ийг сольвол дахин бичих боломжгүй.
   - Бичил бизнесийн хэмжээнд `dimension_set_entry`-тэй JOIN хийх нь хангалттай хурдан.
   - Хурдан тайланд `gl.account_period_balance` проекцын түлхүүрт `dimension_set_id`-г оруулна.
6. **Default-ийн давуу эрэмбэ** тогтмол (BC-ийн priority хүснэгтийн оронд):
   1. хэрэглэгчийн шууд оруулсан утга;
   2. мөрийн бараа эсвэл данс;
   3. header-ийн харилцагч эсвэл нийлүүлэгч;
   4. хүснэгтийн түвшний default.

   Header өөрчлөгдөхөд мөрөнд зөвхөн **ялгааг** (delta) дамжуулна. Мөрөнд гараар өгсөн утга хадгалагдана (R-11).
7. **Шалгалт.** R-13 (value posting-ийн утга), R-18 (блок), R-19 (хуримтлагдах), R-20 (гарал үүслийн данс)-ийг бүрэн хэрэгжүүлнэ.
   - Тохиргоо хадгалах үед зөрчилтэй дүрмийг илрүүлнэ. Жишээ: данс төрлийн түвшинд Code Mandatory, тухайн дансанд No Code. Энэ нь BC-ийн Report 30-ийн оронд ажиллана.
8. **Баримтын posting:**
   - авлага/өглөгийн entry нь **header-ийн** багцыг авна;
   - орлого, зардал, НӨАТ нь **мөрийн** багцыг авна (R-25).

   Тиймээс dimension тус бүрийн гүйлгээ баланс тэнцэхгүй. Тайлан "хоосон" бүлэгтэй байна.
9. **v1-д хийхгүй:** dimension combination, allowed values filter, Heading/Begin-Total/End-Total, 8 shortcut slot, IC mapping.

## Үр дагавар

**Эерэг:**
- BC-ийн семантиктай ижил. Тайлан уян хатан.
- Dimension нэмэхэд схем өөрчлөгдөхгүй.
- Агуулгын hash дээрх UNIQUE түлхүүр зэрэгцээ ажиллагаанд аюулгүй. ID нь бусад техникийн id-тай адил UUIDv7 ([ADR-0008](./ADR-0008-gapless-numbering.md)).

**Сөрөг ба эрсдэл:**
- **Global баганагүй** тул dimension-ээр шүүх тайланд JOIN хэрэгтэй. 5 000 тенантын хэмжээнд гүйцэтгэлийг §13-ийн SLO-оор хянана. Хэрэгтэй бол проекц нэмнэ. Ledger-ийг өөрчлөхгүй.
- **Шинэ багц үүсгэхэд DB-тэй нэг удаа харилцана** (insert-or-select). Багц цөөн, кэштэй тул нөлөө бага.
- **Dimension тус бүрийн тайлан тэнцэхгүй.** Хэрэглэгчид тайлбар ба сургалт хэрэгтэй.

**Шалгах:**
- Property test: утгын дараалал ба эх сурвалжаас үл хамааран ижил багц → ижил ID.
- Зэрэг 100 хүсэлт ижил багц үүсгэхэд мөр давхардахгүй.
- Шинэ багцтай preview хийсний дараа ижил багцтай post амжилттай болно (rollback болсон id кэшид үлдэхгүй).
- Golden scenario: [bc-dimensions-noseries-audit.md](../research/bc-dimensions-noseries-audit.md) §6.1–6.4-ийн жишээ.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| BC-ийн мод (`Dimension Set Tree Node`) | BC-тэй адил | Олон мөр, түгжээ, олон удаагийн хайлт | Hash түлхүүр илүү энгийн |
| Dimension бүрд тусдаа багана (ERPNext) | Query энгийн | Dimension нэмэхэд схем өөрчлөгдөнө. Append-only ledger-д багана нэмэх асуудалтай | Уян хатан биш |
| JSON `analytic_distribution` (Odoo) | Уян | Индекс ба шалгалт сул. Хувиар хуваах нь өөр семантик | BC-ийн семантикаас өөр |
| Агуулгаас тооцсон UUIDv5 ID (DB-гүй тооцоолно) | DB-тэй харилцахгүй | UUIDv7-ийн нийтлэг дүрмээс хазайна | Техникийн id-ийн дүрмийг (UUIDv7) баримтална |
| `bigint` serial set ID (BC шиг integer) | Жижиг түлхүүр | UUIDv7-ийн нийтлэг дүрмээс хазайна | Нэг төрлийн id |
| Ledger-д 2 global багана (BC R-23) | Хурдан шүүлтүүр | Append-only-той зөрчилдөнө (global солих) | Бичил хэмжээнд хэрэггүй |

## Холбоос

- [bc-dimensions-noseries-audit.md](../research/bc-dimensions-noseries-audit.md) §1, R-07..R-25, §7 (Dimensions), §8
- BC: [`DimensionSetEntry.Table.al`](../../../../src/Layers/W1/BaseApp/Finance/Dimension/DimensionSetEntry.Table.al), [`DimensionManagement.Codeunit.al`](../../../../src/Layers/W1/BaseApp/Finance/Dimension/DimensionManagement.Codeunit.al)
