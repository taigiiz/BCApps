# ADR-0009: Синхрон posting — нэг transaction, компанийн advisory lock, preview = rollback

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §6, §13. [ADR-0007](./ADR-0007-append-only-ledger-reversal.md), [ADR-0008](./ADR-0008-gapless-numbering.md), [ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md)

## Нөхцөл байдал

- **BC-ийн posting:**
  - Бүх мөрийг эхлээд шалгаж, дараа нь balance-ийг шалгаад, `GLEntry.LockTable` хийж бичдэг.
  - Төгсгөлд нэг удаа `Commit` хийдэг (R-GL-POSTING-26).
  - Entry No., Transaction No. ба register-ийг түгжээний дор олгодог (R-28).
  - Preview нь ижил кодоор ажиллаад алдаа шидэж rollback хийдэг (R-42).
- **Бидний нөхцөл:**
  - Хэрэглэгч posting-ийн үр дүнг (дугаар, entry) шууд харах ёстой.
  - POS баримт шууд хэвлэгдэх ёстой.
  - Компани бүр 1–10 хэрэглэгчтэй тул компани доторх зэрэгцээ ачаалал бага.
- **PostgreSQL-ийн хэрэгсэл.** Transaction-level advisory lock transaction дуусахад автоматаар чөлөөлөгддөг. `SERIALIZABLE` нь retry-ийн нарийн төвөгтэй логик шаарддаг.

## Шийдвэр

1. **Posting синхрон.** HTTP хүсэлтийн дотор нэг DB transaction-д явагдана. Background queue-гаар posting хийхгүй.
2. **Компанийн posting түгжээ.** `platform.fn_lock_company_posting(tenant_id, company_id)` ([010_platform.sql](../db/schema/010_platform.sql)) нь `pg_advisory_xact_lock(hashtextextended('post:' || tenant_id || ':' || company_id, 0))`-ийг дуудна.
   - Нэг компанийн posting-ууд цуваа ажиллана.
   - Өөр компаниуд зэрэг ажиллана.
3. **Ижил түгжээ авдаг үйлдлүүд:**
   - үе хаах ба нээх, жилийн хаалт;
   - НӨАТ-ын хаалт;
   - ханшийн дахин үнэлгээ;
   - элэгдлийн run;
   - барааны өртгийн дахин тооцоо;
   - буцаалт.
4. **Үе шат** ([02-architecture.md](../02-architecture.md) §6.3):
   - **A:** түгжээгүйгээр угсарч, урьдчилан шалгана (цэвэр функц).
   - **B:** нэг transaction дотор дараалан хийнэ:
     1. idempotency;
     2. түгжээ;
     3. дахин шалгах;
     4. дугаар олгох;
     5. G/L бичих;
     6. ledger writer-ууд;
     7. posted баримт;
     8. outbox;
     9. register ба hash;
     10. COMMIT.
   - **C:** commit-ийн дараа POS бол синхрон dispatch хийнэ.
5. **Isolation ба timeout.** `READ COMMITTED` + тодорхой түгжээ. `SET LOCAL lock_timeout = '5s'`, `statement_timeout = '30s'`. Lock timeout болвол 503 + `Retry-After` буцаана. Клиент ижил `Idempotency-Key`-ээр дахин илгээнэ.
6. **Түгжээний дор гадаад IO хийхгүй.** Түгжээ барих хугацааны зорилт: ≤ 50 мөрт p95 ≤ 150 ms.
7. **Preview** (`PostingMode.Preview`):
   - A ба B үеийг бүтнээр гүйцэтгэнэ. Төгсгөлд `SET CONSTRAINTS ALL IMMEDIATE` хийж deferred trigger-уудыг гүйцэтгээд, дараа нь `ROLLBACK` хийнэ. Ингэснээр DB-ийн тэнцлийн invariant preview-д ч шалгагдана.
   - Дугаарыг `***` гэж нууна. C үе ажиллахгүй.
   - Тусдаа "simulate" код бичихгүй.
   - Golden test "preview = post"-ийг шалгана.
8. **Тэнцлийн давхар хамгаалалт.** Engine commit-оос өмнө Σ = 0-ийг шалгана. DB-д deferred constraint trigger мөн шалгана ([02-architecture.md](../02-architecture.md) §8.2).
9. **Нэг engine.** Бүх баримтын төрөл `IPostingService`-ээр явна. Модулиуд өөрсдийн ledger-ийг `ILedgerWriter<T>`-ээр ижил transaction-д бичнэ. Эх баримтын ноорогийг түгжих ба posted баримт бичихийг эх модуль `IPostedDocumentWriter`-ээр хийнэ (`LockSourceAsync`, `WriteAsync`). GL нь бусад модулийн хүснэгтэд SQL-ээр хандахгүй ([02-architecture.md](../02-architecture.md) §4.5).

## Үр дагавар

**Эерэг:**
- Хэрэглэгч үр дүнг шууд харна. "Хүлээгдэж буй posting" гэсэн төлөв байхгүй.
- Дугаар, тоолуур, үлдэгдлийн проекц нь `SERIALIZABLE` retry-гүйгээр тууштай.
- Үе хаах үйлдэл posting-той давхцахгүй.
- Preview бодит posting-оос зөрөхгүй.

**Сөрөг ба эрсдэл:**
- **Нэг компанийн дээд хурд** ойролцоогоор 10 posting/s (цуваа). Бичил бизнест хангалттай. Банкны хуулгаас олон төлбөр нэг дор импортлох тохиолдолд нэг posting-д олон баримт багцлах эсвэл chunk-лах шаардлагатай.
- **Урт posting** (500+ мөр, жилийн хаалт) түгжээг удаан барина.
  - Бууруулах арга: жилийн хаалт ба дахин үнэлгээг ажлын бус цагт job болгож ажиллуулна. Нэг баримтын мөрийн тоог ≤ 1 000 гэж хязгаарлана.
- **Advisory lock-ийн hash давхцал** нь хоёр компанийг хооронд нь хүлээлгэх л үр дагавартай. Буруу үр дүн гаргахгүй.
- **Commit-ийн үеэр холболт тасарвал** үр дүн тодорхойгүй болно. Idempotency key үүнийг шийднэ ([ADR-0012](./ADR-0012-outbox-idempotency-ebarimt.md)).

**Шалгах:**
- Concurrency test: нэг компанид 50 зэрэг posting хийж, нэгэн зэрэг үе хаахыг оролдоно. Deadlock 0, дугаар цоорхойгүй байна.
- Ачааллын тест: 5 000 тенантын загварт 50 posting/s, p95 ≤ 300 ms ([02-architecture.md](../02-architecture.md) §13).

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Асинхрон posting (queue) | API хурдан хариулна | Хэрэглэгч дугаар ба алдааг шууд харахгүй. POS хэвлэлт удаашрна. Төлөв нарийсна | Хэрэглэгчийн туршлага ба энгийн байдал |
| `SERIALIZABLE` isolation (түгжээгүй) | Ерөнхий шийдэл | Serialization failure-ийн retry. Тоолуурын зөрчил байнга гарна | Нарийн төвөгтэй |
| Тенантын түвшний түгжээ | Нэг түлхүүр | Олон компанитай тенантын компаниуд хоорондоо хүлээнэ | Компани бол бие даасан ном |
| Хүснэгт түгжих (BC `LockTable`) | BC-тэй ижил | Бүх тенантыг хооронд нь түгжинэ | Олон тенантад тохирохгүй |
| Preview-г тусдаа цэвэр функцээр (DB-гүй) | Түгжээ авахгүй | Дугаар, writer-ийн шалгалтыг дуурайх код давхардана. Бодит posting-оос зөрөх эрсдэлтэй | "Preview = post" баталгаа |

## Холбоос

- [bc-gl-posting.md](../research/bc-gl-posting.md) R-GL-POSTING-26, -28, -35, -42; §4.1, §4.4
- [tech-architecture.md](../research/tech-architecture.md) §4.5, TA-05
- BC: [`GenJnlPostBatch.Codeunit.al`](../../../../src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al), [`GenJnlPostPreview.Codeunit.al`](../../../../src/Layers/W1/BaseApp/Finance/GeneralLedger/Preview/GenJnlPostPreview.Codeunit.al)
- PostgreSQL advisory lock: https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS
