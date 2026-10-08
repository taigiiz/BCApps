# ADR-0011: Modular monolith ба модулийн хил

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §3, §4, §5. [ADR-0002](./ADR-0002-backend-stack-dotnet10.md), [ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md)

## Нөхцөл байдал

- **Нэг transaction шаардлагатай.** Posting борлуулалт, татвар, авлага, бараа, банк, eBarimt-ийн outbox-ийг нэг DB transaction-д бичих ёстой ([ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md)). Microservice ашиглавал үүнийг distributed transaction эсвэл saga-аар шийдэх болно. Энэ нь нягтлан бодох бүртгэлийн зөв байдлыг эрсдэлд оруулна.
- **Бага баг.** 4–6 инженер тул үйл ажиллагааны нарийн төвөгтэй байдлыг бага байлгах хэрэгтэй.
- **Хилгүй монолитын эрсдэл.** Хил тогтоогоогүй монолит "том бөмбөг шавар" (big ball of mud) болдог. BC-ийн codeunit-ууд бие биенээ шууд дууддаг. Бид модуль бүрийн хариуцлагыг тодорхой байлгах ёстой.

## Шийдвэр

1. **Нэг deployable.** Нэг solution, нэг container image, гурван эхлэх цэг: `Erp.Api`, `Erp.Worker`, `Erp.Migrator` (migration-ий тусдаа алхам).
2. **13 модуль** (`src/Modules/<Module>` → PostgreSQL схем, [02-architecture.md](../02-architecture.md) §4.1): Platform (`platform`, `identity`, `audit`), Integration (`integration`), Currency (`fx`), GeneralLedger (`gl`), Tax (`tax`), EBarimt (`ebarimt`), Parties (`party`), Inventory (`inv`), FixedAssets (`fa`), CashBank (`bank`), Sales (`sales`), Purchases (`purchase`), Reporting (`rpt`). Схемийн нэрийн эх сурвалж нь [db/schema](../db/schema/) ([DECISIONS](../DECISIONS.md) D-K1).
   - Модуль бүр **өөрийн PostgreSQL схемтэй**.
   - Модуль бүр 5 project-тэй: `Erp.<M>.Contracts` (нийтийн), `Erp.<M>.Domain`, `Erp.<M>.Application`, `Erp.<M>.Infrastructure`, `Erp.<M>.Api` (бусад нь `internal`). Нийтлэг код `Erp.BuildingBlocks.*`-д байна ([18-dev-setup.md](../18-dev-setup.md) §2).
3. **Хамаарлын матриц** ([02-architecture.md](../02-architecture.md) §4.3) мөчлөггүй граф (DAG) байна.
   - Модуль зөвхөн матрицын зөвшөөрсөн модулийн **Contracts**-ыг reference хийнэ.
   - Матрицыг `docs/architecture/dependencies.json` файлд хадгалж, CI тест уншина.
4. **Модуль хооронд харилцах 3 хэлбэр** ([02-architecture.md](../02-architecture.md) §4.4):
   - синхрон contract дуудлага (ижил transaction);
   - posting-ийн өргөтгөх цэг (`ILedgerWriter<T>`, `IPostedDocumentWriter`, `IFxRevaluationContributor`, `ICompanySeeder`);
   - outbox-оор дамжих integration event.
5. **Хамаарлыг урвуулах.** Доод модуль дээд модулийн үйлдлийг шаардах бол интерфейсийг доод модуль тодорхойлж, дээд модуль хэрэгжүүлнэ. Жишээ: GL нь `ILedgerWriter<T>`-ийг тодорхойлно, Parties түүнийг хэрэгжүүлнэ.
6. **SQL-ийн хил.**
   - Модуль өөр модулийн хүснэгтэд SQL-ээр хандахгүй.
   - Reporting зөвхөн published view-ийг (`<schema>.v_*`) уншина.
   - FK-г зөвхөн матрицын зөвшөөрсөн чиглэлд үүсгэнэ.
7. **Модуль доторх давхарга:** Domain, Application, Infrastructure, Api. CQRS-lite дүрэм мөрдөнө ([02-architecture.md](../02-architecture.md) §5.2–§5.3).
8. **Architecture test** (ArchUnitNET, CI-д заавал): [02-architecture.md](../02-architecture.md) §5.4-ийн жагсаалт. Үүнд:
   - Contracts-only reference;
   - матрицтай тохирох;
   - Domain-д IO байхгүй;
   - float мөнгө байхгүй;
   - ledger-т зөвхөн engine ба writer бичих;
   - eBarimt receipt client-д retry байхгүй;
   - endpoint бүрт эрхийн шаардлага байх.
9. **Ledger-ийн эзэмшил.** Ledger хүснэгт бүрийг эзэмшигч модуль нь өөрийн `ILedgerWriter<T>`-ээр, posting service-ийн нээсэн transaction дотор бичнэ: `gl.*`-г GeneralLedger, `tax.vat_entry`-г Tax, `party.cust_ledger_entry`/`party.vendor_ledger_entry` + detailed-ийг Parties, `bank.bank_ledger_entry`-г CashBank, `inv.*`-г Inventory, `fa.fa_ledger_entry`-г FixedAssets. Architecture test: ledger хүснэгтийн `INSERT` SQL зөвхөн posting service эсвэл тухайн хүснэгтийг эзэмшигч модулийн ledger writer-т байна. GL өөр модулийн схемд бичихгүй.
   - **Авлага/өглөгийн ledger Parties-д (`party` схем)** байна ([DECISIONS](../DECISIONS.md) D-K2; BC-д Sales/Receivables, Purchases/Payables-д байдаг). Sales, Purchases, CashBank гурвуулаа үүнд Parties-ийн `ILedgerWriter`-ээр бичдэг; Sales/Purchase модуль зөвхөн баримтаа эзэмшинэ. Ledger-ийг Sales-д байрлуулбал Sales → CashBank ("одоо төлсөн" төлбөр) ба CashBank → Sales (төлбөр тулгах) мөчлөг үүснэ.
10. **Ирээдүйд модулийг тусгаарлах.** Модулийг тусдаа service болгох шаардлага гарвал (жишээ нь EBarimt-ийг гаднаас ажиллуулах) Contracts ба outbox нь шилжилтийн зам болно. Энэ нь v1-ийн зорилго **биш**.

## Үр дагавар

**Эерэг:**
- Нэг transaction, нэг deploy, нэг debug орчин.
- Модулийн хил compile-time ба тестээр баталгаажна.
- Шинэ хөгжүүлэгч модулийн картаас ([02-architecture.md](../02-architecture.md) §4.2) хариуцлагыг шууд ойлгоно.

**Сөрөг ба эрсдэл:**
- **Нэг процесс** тул нэг модулийн санах ойн алдаа бүх системд нөлөөлнө.
  - Бууруулах арга: API ба worker тусдаа процесс; rate limit; хүнд тайланг async job болгох.
- **Хамаарлын матрицыг сахилгатай шинэчлэх** шаардлагатай. Шинэ хамаарал = ADR-0011-ийн шинэчлэл + PR review.
- **Project-ийн тоо олон** (13 модуль × 5 + building block). Build-ийн хугацааг incremental build ба test-ийн сонголтоор хянана.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Microservices | Тусдаа масштаб ба deploy | Distributed transaction, saga, сүлжээний алдаа, үйл ажиллагааны зардал | Нягтлан бодох бүртгэлийн зөв байдал, багийн хэмжээ |
| Хилгүй монолит | Хамгийн хурдан эхлэл | Хил эвдэрнэ, тест ба өөрчлөлт хэцүү болно | Урт хугацааны засвар үйлчилгээ |
| Модуль бүрийг 2 assembly болгох (дотоод + Contracts) | Project цөөн, build хурдан | Давхаргын хилийг зөвхөн тестээр шалгана | Сонгосон 5 project-ийн хувилбарт давхаргын хил compile-time-д шалгагддаг. 65+ project-ийг `.slnx` ба Central Package Management зохицуулна |
| Модуль бүрд тусдаа DB | Тусгаарлалт хүчтэй | Нэг transaction боломжгүй | Posting-ийн шаардлага |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §10 (Modular monolith), TA-14
- ArchUnitNET: https://github.com/TNG/ArchUnitNET
