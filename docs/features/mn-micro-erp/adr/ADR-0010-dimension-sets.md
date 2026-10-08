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

1. **Хүснэгтүүд (`gl` схем, компанийн түвшинд; канон: [030_dimension.sql](../db/schema/030_dimension.sql)):**

   | Хүснэгт | Агуулга |
   |---|---|
   | `dimension` | `code`, `name`, `blocked` |
   | `dimension_value` | `dimension_id`, `code`, `name`, `parent_id`, `value_type ∈ {STANDARD, TOTAL}`, `blocked` |
   | `dimension_set` | `id` (uuid PK), **`dimension_set_id bigint`** (BC-ийн Dimension Set ID; `UNIQUE (company_id, dimension_set_id)`), `key_hash` (`UNIQUE (company_id, key_hash)`), `key_text`, `entry_count` |
   | `dimension_set_entry` | `dimension_set_id`, `dimension_id`, `dimension_value_id`, `global_dimension_no` (0/1/2). Нэг удаа бичигдэнэ, өөрчлөгдөхгүй (append-only) |
   | `default_dimension` | `entity_type`, `entity_id NULL` (NULL = тухайн төрлийн бүх мөр), `dimension_id`, `value_id NULL`, `value_posting ∈ {NONE, CODE_MANDATORY, SAME_CODE, NO_CODE}` |

2. **Set-ийг агуулгын түлхүүрээр олно. Түлхүүр нь `dimension_set_id bigint` (BC-тэй адил).**
   - `key_text = join(sort_asc("dimension_id:value_id"), ";")`, `key_hash = sha256(key_text)` (`pgcrypto.digest`).
   - `UNIQUE (company_id, key_hash)`.
   - Үүсгэх: `gl.fn_get_dimension_set_id(value_ids uuid[]) → bigint`. Байгаа бол буцаана; үгүй бол `gl.dimension_set_id_seq`-ээс шинэ id авч `INSERT … ON CONFLICT (company_id, key_hash) DO NOTHING`; зэрэг үүсгэсэн өөр session ялвал түүний id-г буцаана. Дараа нь `dimension_set_entry`-г нэг удаа бичнэ.
   - Хоосон багц = **`dimension_set_id = 0`** (BC-ийн "0"; `CHECK ((dimension_set_id = 0) = (entry_count = 0))`). Ledger-ийн `dimension_set_id bigint NOT NULL DEFAULT 0` ба `(company_id, dimension_set_id) → gl.dimension_set` FK тул 0-ийн мөрийг компани бүрд provisioning үүсгэнэ.
   - Ижил багц ямагт ижил ID авна: утгын дараалал ба эх сурвалжаас хамаарахгүй, зэрэг хүсэлт давхардал үүсгэхгүй (BC R-07..R-09).
   - Application нь компани бүрийн `key_hash → id`-г санах ойд кэшлэнэ (багц хэзээ ч өөрчлөгдөхгүй тул кэш хүчингүй болохгүй).
   - **Зөвхөн commit хийгдсэн id-г кэшлэнэ.** Posting-ийн transaction дотор шинээр үүссэн багцыг `TenantSession`-ий post-commit hook кэшид нэмнэ. Preview эсвэл алдаатай posting rollback хийгдвэл тэр багц DB-ээс арилна. Кэшид орсон бол дараагийн posting FK алдаа өгнө. Кэшээс олдоогүй id-г ямагт insert-or-select-оор авна.
3. **Утгыг surrogate id-аар** хадгална. Утгын кодыг нэрлэж солиход багц өөрчлөгдөхгүй. Блоклогдсон утгыг posting-ийн үед дахин шалгана (R-18).
4. **Хязгаар.** v1-д компанид **≤ 4 идэвхтэй dimension** байна. Эхний 2 нь UI-д мөрийн багана болж харагдана (shortcut).
5. **Global dimension (D-D2: 2 ширхэг)** нь `gl.general_ledger_setup.global_dimension_1_id/_2_id`-д тохируулагдана.
   - Ledger мөрийн `global_dim_1_value_id`/`global_dim_2_value_id` нь `dimension_set_id`-ээс `BEFORE INSERT` trigger (`gl.fn_derive_global_dimensions`)-ээр гарна; оролтоос хүлээж авахгүй.
   - Ledger append-only тул global dimension-ийг сольсны дараа хуучин мөрийн утга өөрчлөгдөхгүй; бусад dimension-ийн тайланг `dimension_set_entry`-тэй JOIN хийнэ.
   - Үеийн үлдэгдлийн тайлан `gl.v_gl_account_period_balance` view-ээр (тусдаа проекцын хүснэгтгүй).
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
- Агуулгын hash дээрх UNIQUE түлхүүр зэрэгцээ ажиллагаанд аюулгүй. Ledger-т хадгалах түлхүүр нь BC-тэй адил `bigint` `dimension_set_id` (0 = хоосон); мөрийн техникийн `id` нь бусадтай адил uuid ([ADR-0008](./ADR-0008-gapless-numbering.md)).

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
| Агуулгаас тооцсон UUIDv5 ID (DB-гүй тооцоолно) | DB-тэй харилцахгүй | Ledger-ийн түлхүүр 16 байт, BC-ийн 0-тэй харгалзахгүй | Канон схем `bigint` сонгосон |
| UUIDv7 set ID (nil UUID = хоосон) | Нэг төрлийн id | 16 байт түлхүүр ledger бүрд; BC-ийн integer семантикаас хазайна | **Сонгоогүй** (2026-10-08 нийцүүлэлт: канон схем `dimension_set_id bigint`, 0 = хоосон) |
| Ledger-д global багана хуулахгүй (зөвхөн JOIN) | Global солиход ledger өөрчлөгдөхгүй | Шүүлтүүр удаан | **Сонгоогүй**: канон схем BC R-23-ийн дагуу `global_dim_1/2_value_id`-г insert үед trigger-ээр гаргадаг; global солиход хуучин мөр өөрчлөгдөхгүй |

## Холбоос

- [bc-dimensions-noseries-audit.md](../research/bc-dimensions-noseries-audit.md) §1, R-07..R-25, §7 (Dimensions), §8
- BC: [`DimensionSetEntry.Table.al`](../../../../src/Layers/W1/BaseApp/Finance/Dimension/DimensionSetEntry.Table.al), [`DimensionManagement.Codeunit.al`](../../../../src/Layers/W1/BaseApp/Finance/Dimension/DimensionManagement.Codeunit.al)
