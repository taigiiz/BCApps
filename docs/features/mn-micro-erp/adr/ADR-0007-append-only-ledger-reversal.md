# ADR-0007: Append-only ledger, залруулга зөвхөн буцаалтаар

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг, нягтлан бодох бүртгэлийн шинжээч
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §6.8, §8.1, §8.2, §8.7. [ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md), [ADR-0023](./ADR-0023-compliance-gates.md)

## Нөхцөл байдал

- **Order 47/2018.** Батлагдсан НББ-ийн программд гүйлгээг **нуух, далдлах, санаатайгаар будлиулах, завших боломжгүй** байх шаардлага тавигддаг ([mn-accounting.md](../research/mn-accounting.md) §2.5).
- **BC-ийн загвар:**
  - G/L Entry нь append-only.
  - Залруулгыг толин тусгал буцаалтаар (reversal) хийдэг: `Correction` (улаан сторно), `Reversed by Entry No.`.
  - Cust. Ledger Entry-ийн мөнгөний түүх Detailed Entry-д append-only хадгалагддаг ([bc-gl-posting.md](../research/bc-gl-posting.md) R-GL-POSTING-38..40; [bc-subledgers-application.md](../research/bc-subledgers-application.md) §1).
- **BC-ийн өөрчлөгддөг талбарууд.** BC-ийн entry-д `Open`, `Remaining Amount`, `Reversed` гэх мэт өөрчлөгдөх талбарууд бий. Бид тэдгээрийг өөрчлөгдөхгүй мөрөөс тусгаарлах хэрэгтэй.
- **PostgreSQL-ийн хамгаалалт.** `REVOKE` нь эзэмшигч ба superuser-ийг хамгаалдаггүй. `TRUNCATE`-ийн trigger зөвхөн statement-level байдаг.

## Шийдвэр

1. **Append-only хүснэгтүүд:**

   | Схем | Хүснэгт |
   |---|---|
   | `gl` | `gl_transaction`, `gl_entry`, `gl_register`, `gl_entry_reversal` |
   | `tax` | `vat_entry`, `vat_settlement` |
   | `parties` | `cust_ledger_entry`, `detailed_cust_ledg_entry`, `vend_ledger_entry`, `detailed_vend_ledg_entry` |
   | `cash_bank` | `bank_ledger_entry`, posted `payment_document` |
   | `inventory` | `item_ledger_entry`, `value_entry` |
   | `fixed_assets` | `fa_ledger_entry` |
   | `sales`, `purchases` | posted баримтууд, `sales.cancelled_document` |
   | `audit` | `row_change`, `security_event` |
   | бусад | `ebarimt.receipt_event`, `currency.ref_official_rate`, `platform.document_signature`, `integration.integration_attempt` |

   Бүрэн жагсаалтыг [02-architecture.md](../02-architecture.md) §8.1 тогтооно.

2. **Гурван давхаргын хамгаалалт:**
   - `REVOKE UPDATE, DELETE, TRUNCATE … FROM erp_app, erp_worker, erp_ops_ro`;
   - `BEFORE UPDATE OR DELETE` row trigger (`trg_<table>__block_update_delete`) `core.fn_block_ledger_mutation()`-ийг дуудаж exception шиднэ (`ERA01`);
   - `BEFORE TRUNCATE` statement trigger (`trg_<table>__block_truncate`).

   Migration-ий helper `core.fn_make_append_only('schema.table')` эдгээрийг нэг дор үүсгэнэ.
3. **Өөрчлөгддөг төлөв тусдаа проекц хүснэгтэд** байна. Проекцыг posting transaction дотор синхроноор шинэчилнэ. Ledger-ээс бүрэн дахин тооцоолж болно.
   - `parties.cust_open_item` (нээлттэй эсэх, үлдэгдэл);
   - `gl.account_period_balance`;
   - `inventory.item_cost_state`.
4. **Залруулга зөвхөн шинэ бичилтээр:**
   - Журналын ваучер → `ReverseTransaction`: шинэ transaction, `is_correction = true` (улаан сторно), `gl_entry_reversal (original_entry_id, reversal_entry_id)`.
   - Posted нэхэмжлэх → Cancel ба Correct (credit memo + тулгалт).
   - Тулгалт → unapply (detailed мөрийн толин тусгал, LIFO).
   - Буцаалтын огноо: эх үе нээлттэй бол эх огноо. Хаагдсан бол нээлттэй цонхноос хэрэглэгч сонгоно. Шалтгааны код заавал ([02-architecture.md](../02-architecture.md) §6.8).
5. **"Буцаагдсан" төлвийг** `gl_entry_reversal`-ээс JOIN-оор гаргана. Эх мөрийг өөрчлөхгүй.
6. **Hash chain.** `gl_register` бүр `prev_hash` ба `hash`-тай (SHA-256). Hash нь register, transaction, G/L entry ба VAT entry-г хамарна. Шөнө бүр шалгана ([02-architecture.md](../02-architecture.md) §8.7).
7. **Цорын ганц үл хамаарах зүйл: тенантын purge.** Тенант `PURGE_APPROVED` төлөвтэй үед `erp_migrator` (`SET ROLE erp_owner`) нь `app.tenant_id` ба `erp.purge_tenant` тохиргоотой session-оор `platform.fn_purge_tenant`-ийг ажиллуулна. Энэ нь гэрээ дууссаны дараах журам бөгөөд аудитын логт бичигдэнэ ([02-architecture.md](../02-architecture.md) §7.7).
8. **Ledger-ийг UPDATE-ээр backfill хийхгүй.** Шинэ багана NULL-тэй байна ([ADR-0014](./ADR-0014-sql-first-migrations.md)).
9. **Хадгалах хугацаатай append-only хүснэгт** (`audit.*` 10 жил, `integration.integration_attempt` 2 жил) сараар хуваагдана. Хугацаа дууссан partition-ийг `core.fn_rotate_partitions()` DETACH + DROP хийнэ. Мөр бүрийг DELETE хийхгүй тул guard trigger өөрчлөгдөхгүй ([02-architecture.md](../02-architecture.md) §8.1).

## Үр дагавар

**Эерэг:**
- Order 47-ийн "нуух боломжгүй" шаардлагыг техникээр нотолно.
- Аудиторт өөрчлөгдөөгүй түүх ба hash-ийн нотолгоо өгнө.
- BC-тэй ижил загвартай тул тайлангийн утга таарна.

**Сөрөг ба эрсдэл:**
- **Алдаатай бичилтийг зөвхөн буцаалтаар засна.** Ledger дэх мөрийн тоо өснө, хэрэглэгч сургалт шаардана.
- **Migration-д ledger-ийн өгөгдлийг засах боломжгүй.** Схемийн хувьслыг сайн төлөвлөх шаардлагатай.
- **Проекц ledger-ээс зөрж болно.**
  - Бууруулах арга: шөнийн тулгалт ба дахин тооцоолох job ([02-architecture.md](../02-architecture.md) §8.8).

**Шалгах (CI):**
- Ledger хүснэгт бүрт `erp_app`, `erp_worker`-оор UPDATE, DELETE, TRUNCATE оролдоход амжилтгүй болно. `erp_migrator` (`SET ROLE erp_owner`)-оор оролдоход guard trigger `ERA01` өгнө.
- Тенантгүй append-only хүснэгт (`currency.ref_official_rate`) дээр UPDATE оролдоход мөн `ERA01` гарна (guard функц `tenant_id` баганаас хамаарахгүй).
- Entry-гүй `gl_transaction` commit хийх оролдлого `ERB01` өгнө.
- Каталогийн тест: append-only жагсаалтын хүснэгт бүр trigger-тэй байна.
- Property test: post хийгээд reverse хийхэд данс бүрийн нийлбэр 0 болно.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| ERPNext-ийн `is_cancelled` flag (UPDATE хийдэг) | Тайлан энгийн | Эх мөр өөрчлөгдөнө | Order 47 |
| Odoo-гийн загвар: hash chain + төлөвтэй мөр | Hash бий | Мөр нь өөрчлөгддөг талбартай | Өөрчлөгдөхгүй байх баталгаа сул |
| Event sourcing (бүх төлөв event-ээс) | Бүрэн түүх | Нарийн төвөгтэй, тайлангийн query хэцүү | Энгийн байдал |
| Зөвхөн application-ий дүрэм (DB хамгаалалтгүй) | Энгийн | Админ эсвэл алдаатай код ledger-ийг засаж чадна | Аудитлах чадвар |

## Холбоос

- [bc-gl-posting.md](../research/bc-gl-posting.md) R-GL-POSTING-35..40, §7, §8
- [bc-subledgers-application.md](../research/bc-subledgers-application.md) §1, §4.3
- [tech-architecture.md](../research/tech-architecture.md) §4.3, TA-04
- [mn-integrations-market.md](../research/mn-integrations-market.md) §9.3 (ERPNext, Odoo-гийн харьцуулалт)
- BC: [`GLEntry.Table.al`](../../../../src/Layers/W1/BaseApp/Finance/GeneralLedger/Ledger/GLEntry.Table.al), [`GenJnlPostReverse.Codeunit.al`](../../../../src/Layers/W1/BaseApp/Finance/GeneralLedger/Reversal/GenJnlPostReverse.Codeunit.al), [`DetailedCustLedgEntry.Table.al`](../../../../src/Layers/W1/BaseApp/Sales/Receivables/DetailedCustLedgEntry.Table.al)
