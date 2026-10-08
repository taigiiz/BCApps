# ADR-0007: Append-only ledger, залруулга зөвхөн буцаалтаар

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг, нягтлан бодох бүртгэлийн шинжээч
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §6.8, §8.1, §8.2, §8.7. [ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md), [ADR-0023](./ADR-0023-compliance-gates.md)

## Нөхцөл байдал

- **Order 47/2018.** Батлагдсан НББ-ийн программд гүйлгээг **нуух, далдлах, санаатайгаар будлиулах, завших боломжгүй** байх шаардлага тавигддаг ([mn-accounting.md](../research/mn-accounting.md) §2.5).
- **BC-ийн загвар:**
  - G/L Entry нь append-only.
  - Залруулгыг толин тусгал буцаалтаар (reversal) хийдэг: `Reversed by Entry No.`; сонголтоор `Correction` (улаан сторно). Манай систем storno-г **хэрэглэхгүй** ([DECISIONS](../DECISIONS.md) D-C3).
  - Cust. Ledger Entry-ийн мөнгөний түүх Detailed Entry-д append-only хадгалагддаг ([bc-gl-posting.md](../research/bc-gl-posting.md) R-GL-POSTING-38..40; [bc-subledgers-application.md](../research/bc-subledgers-application.md) §1).
- **BC-ийн өөрчлөгддөг талбарууд.** BC-ийн entry-д `Open`, `Remaining Amount`, `Reversed` гэх мэт өөрчлөгдөх талбарууд бий. Бид тэдгээрийг өөрчлөгдөхгүй мөрөөс тусгаарлах хэрэгтэй.
- **PostgreSQL-ийн хамгаалалт.** `REVOKE` нь эзэмшигч ба superuser-ийг хамгаалдаггүй. `TRUNCATE`-ийн trigger зөвхөн statement-level байдаг.

## Шийдвэр

1. **Append-only хүснэгтүүд** (канон каталог: `platform.ledger_guard`, [910_ledger_guards.sql](../db/schema/910_ledger_guards.sql)):

   | Схем | Хүснэгт |
   |---|---|
   | `gl` | `gl_transaction`, `gl_entry`, `gl_register`, `accounting_period_status_log`, `dimension_set`, `dimension_set_entry` |
   | `tax` | `vat_entry`, `gl_entry_vat_entry_link`, `city_tax_entry`, `vat_return_snapshot` |
   | `party` | `cust_ledger_entry`, `detailed_cust_ledger_entry`, `vendor_ledger_entry`, `detailed_vendor_ledger_entry` (D-K2) |
   | `bank` | `bank_ledger_entry`, `posted_cash_voucher`, `bank_account_statement`, `bank_account_statement_line` |
   | `inv` | `item_ledger_entry`, `value_entry`, `item_application_entry`, `gl_item_ledger_relation`, `posted_item_journal`, `posted_item_journal_line` |
   | `fa` | `fa_ledger_entry` |
   | `fx` | `exch_rate_adjmt_register`, `exch_rate_adjmt_ledger_entry` |
   | `sales`, `purchase` | posted баримтууд (`sales_invoice_*`, `sales_cr_memo_*`, `purch_inv_*`, `purch_cr_memo_*`), `cancelled_document` |
   | `audit` | `row_change`, `posting_log`, `security_event` |
   | бусад | `ebarimt.ebarimt_document_line`, `ebarimt.ebarimt_document_payment`, `ebarimt.ebarimt_document_event`, `rpt.filing_submission`, `rpt.statement_snapshot`, `platform.number_allocation`, `platform.document_rendition`, `platform.archive_package`, `platform.document_signature`, `platform.tenant_purge_log` |

   Бүрэн жагсаалтыг [02-architecture.md](../02-architecture.md) §8.1 ба `platform.ledger_guard` тогтооно.

2. **Гурван давхаргын хамгаалалт:**
   - `REVOKE UPDATE, DELETE, TRUNCATE … FROM app_user, app_worker, app_readonly` (group role; login `erp_app`, `erp_worker` нь гишүүн);
   - `BEFORE UPDATE OR DELETE` row trigger (`trg_<table>_immutable`) `platform.fn_guard_immutable()`-ийг дуудаж, whitelist-ээс бусад өөрчлөлтөд exception шиднэ (`ERL01`);
   - `BEFORE TRUNCATE` statement trigger (`trg_<table>_no_truncate`, мөн `platform.fn_guard_immutable()`).

   Baseline-д 910 файлын loop эдгээрийг `platform.ledger_guard`-ийн мөр бүрд үүсгэнэ; дараагийн migration шинэ ledger хүснэгтэд `platform.ledger_guard`-д мөр нэмж, ижил trigger-үүдийг ил бичнэ ([ADR-0014](./ADR-0014-sql-first-migrations.md)).
3. **Өөрчлөгддөг системийн талбар** (D-C4): BC-ийн `Open`, `Remaining Amount`, `Reversed`, `Closed by` зэрэг талбарууд ledger мөр дээрээ үлдэнэ, гэхдээ:
   - `mutable_columns` (`reversed`, `reversed_by_*`, `closed_by_entry_no`, `deductible_confirmed*` г.м.) нь зөвхөн SECURITY DEFINER `platform.fn_ledger_update(table, key, changes)`-ээр өөрчлөгдөнө;
   - `trigger_columns` (`party.*_ledger_entry.remaining_amount`, `remaining_amount_lcy`, `open`) нь detailed entry-ийн дотоод trigger-ээр л өөрчлөгдөнө, application-оос хүлээж авахгүй;
   - үеийн үлдэгдэл, нээлттэй entry нь view (`gl.v_gl_account_period_balance`, `party.v_cust_open_entry`); `inv.item_cost_state` нь ledger биш, тусдаа төлөвийн хүснэгт.
4. **Залруулга зөвхөн шинэ бичилтээр:**
   - Журналын ваучер → `ReverseTransaction`: шинэ transaction, эх entry бүрийн **эсрэг тэмдэгтэй** entry (storno биш: эсрэг баганад орно, D-C3); холбоос `gl_entry.reversed_entry_no`, `gl_transaction.reverses_transaction_no`, эх мөрийн `reversed`/`reversed_by_*` нь `platform.fn_ledger_update`-ээр.
   - Posted нэхэмжлэх → Cancel ба Correct (credit memo + тулгалт).
   - Тулгалт → unapply (detailed мөрийн эсрэг тэмдэгтэй мөр, LIFO).
   - Буцаалтын огноо: эх үе `OPEN` бол эх огноогоор. Хаагдсан бол буцаалт хийхгүй, одоогийн үед залруулах баримт (`corrects_transaction_no`) хийнэ. Шалтгааны код заавал (D-D5, [02-architecture.md](../02-architecture.md) §6.8).
5. **"Буцаагдсан" төлөв** нь эх мөрийн whitelisted `reversed` / `reversed_by_entry_no` багана (D-C4); тусдаа `gl_entry_reversal` хүснэгт байхгүй.
6. **Hash chain.** `gl_register` бүр `hash_version`, `prev_hash` ба `hash`-тай (SHA-256). Hash нь register, transaction, G/L entry ба VAT entry-г хамарна. Шөнө бүр шалгана ([02-architecture.md](../02-architecture.md) §8.7).
7. **Үл хамаарах зүйл: тенантын purge.** Тенант `PURGE_APPROVED` төлөвтэй үед `erp_migrator` (`SET ROLE app_owner`) нь `app.tenant_id` ба `erp.purge_tenant` тохиргоотой session-оор purge журмыг ажиллуулна; guard нь `platform.fn_purge_in_progress(tenant_id)` үнэн үед л DELETE-ийг зөвшөөрнө, нотолгоо `platform.tenant_purge_log`-д. Энэ нь гэрээ дууссаны дараах журам бөгөөд аудитын логт бичигдэнэ ([02-architecture.md](../02-architecture.md) §7.7).
8. **Ledger-ийг UPDATE-ээр backfill хийхгүй.** Шинэ багана NULL-тэй байна ([ADR-0014](./ADR-0014-sql-first-migrations.md)).
9. **Хадгалах хугацаатай append-only хүснэгт** (`audit.row_change`, `audit.security_event`, `audit.posting_log`, `ebarimt.ebarimt_document_event` — 10 жил эсвэл тенантын override) нь `platform.ledger_guard.allow_delete_after` цонхтой; хугацаа дууссан мөрийг `audit.fn_purge_expired` / `audit.fn_purge_platform_rows` batch-аар устгана (legal hold үед устгахгүй). Partition R1-д хэрэглэхгүй ([02-architecture.md](../02-architecture.md) §8.1).

## Үр дагавар

**Эерэг:**
- Order 47-ийн "нуух боломжгүй" шаардлагыг техникээр нотолно.
- Аудиторт өөрчлөгдөөгүй түүх ба hash-ийн нотолгоо өгнө.
- BC-тэй ижил загвартай тул тайлангийн утга таарна.

**Сөрөг ба эрсдэл:**
- **Алдаатай бичилтийг зөвхөн буцаалтаар засна.** Ledger дэх мөрийн тоо өснө, хэрэглэгч сургалт шаардана.
- **Migration-д ledger-ийн өгөгдлийг засах боломжгүй.** Схемийн хувьслыг сайн төлөвлөх шаардлагатай.
- **Ledger-ийн cache багана (`remaining_*`, `open`) detailed entry-ээс зөрж болно.**
  - Бууруулах арга: trigger-ээр л шинэчлэгдэнэ; шөнийн тулгалт ба дахин тооцоолох job ([02-architecture.md](../02-architecture.md) §8.8).

**Шалгах (CI):**
- Ledger хүснэгт бүрт `erp_app`, `erp_worker`-оор UPDATE, DELETE, TRUNCATE оролдоход амжилтгүй болно (эрхгүй). `erp_migrator` (`SET ROLE app_owner`)-оор whitelist-ээс гадуур UPDATE/DELETE оролдоход guard trigger `ERL01` өгнө.
- Тенантгүй append-only хүснэгт (`platform.tenant_purge_log`) дээр UPDATE оролдоход мөн `ERL01` гарна (guard функц `tenant_id` баганаас хамаарахгүй).
- Entry-гүй `gl_transaction` commit хийх оролдлого `ERB01` өгнө.
- Каталогийн тест: `platform.ledger_guard`-ийн хүснэгт бүр `trg_<table>_immutable` ба `trg_<table>_no_truncate` trigger-тэй байна.
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
