# Өгөгдлийн сангийн каноник схем (canonical schema)

Энэ хавтас нь бичил бизнесийн ERP-ийн PostgreSQL схемийн **нэг эх сурвалж** юм. Схем нь R1-ийг бүрэн, R2-ийн хүснэгтүүдийг (валют, үндсэн хөрөнгө, бараа, НХАТ) урьдчилан агуулна. Ингэснээр R2-т эвдрэх өөрчлөлт (breaking change) хийх шаардлагагүй. Бүх шийдвэр [DECISIONS.md](../DECISIONS.md)-д нийцнэ. Домэйн загварын тайлбар, ER диаграмм, BC-ийн харгалзааг [03-domain-model.md](../03-domain-model.md)-оос үзнэ.

Шалгагдсан орчин: **PostgreSQL 16.15** (17+-ийн `uuidv7()`, `JSON_TABLE`, `MERGE … RETURNING` ашиглаагүй).

## 1. Файлын бүтэц

```
db/
├── apply.sh                    схемийг дарааллаар нь өгөгдлийн санд суулгана
├── schema/
│   ├── 000_extensions_roles.sql   өргөтгөл, бүлэг role, модулийн schema
│   ├── 010_platform.sql           domain төрөл, контекст функц, tenant/company, хэрэглэгч, эрх, дугаарлалт, counter
│   ├── 020_gl.sql                 дансны төлөвлөгөө, тохиргоо, санхүүгийн жил/үе, журнал, gl_transaction/register/entry
│   ├── 030_dimension.sql          dimension, утга, default dimension, dimension set (hash)
│   ├── 040_tax.sql                НӨАТ-ын бүлэг/тохиргоо, vat_entry, тайлангийн загвар, НХАТ, tax_parameter (глобал)
│   ├── 050_fx.sql                 валют, ханш, Монголбанкны албан ханш, ханшийн тэгшитгэлийн бүртгэл (R2)
│   ├── 060_party.sql              төлбөрийн нөхцөл/хэлбэр, posting group-ууд, харилцагч, нийлүүлэгч, загвар,
│   │                              авлага/өглөгийн дэд дэвтэр (D-K2), тулгалтын ажлын хуудас (application_draft)
│   ├── 070_sales.sql              борлуулалтын ноорог ба posted баримт
│   ├── 080_purchase.sql           худалдан авалтын ноорог ба posted баримт
│   ├── 090_bank.sql               банк/касс/хэтэвч, bank ledger, хуулга импорт, тулгалт, МХ-1/МХ-2
│   ├── 100_fa.sql                 үндсэн хөрөнгө (R2)
│   ├── 110_inv.sql                бараа, барааны дэвтэр (R2)
│   ├── 120_rpt.sql                санхүүгийн тайлангийн тодорхойлолт, Form A мөрийн код, МГТ ангилал, насжилт
│   ├── 130_ebarimt.sql            eBarimt PosAPI 3.0 давхарга (POS тус бүрийн reset-гүй billIdSuffix counter, төлөвийн түүх)
│   ├── 140_integration_audit.sql  outbox/inbox, idempotency, job, аудитын лог, аюулгүй байдлын лог, гарын үсэг,
│   │                              support хандалт, Navigate view, ерөнхий trigger
│   ├── 900_rls.sql                эрх олголт ба row-level security (RLS)
│   ├── 910_ledger_guards.sql      ledger-ийн хамгаалалт: append-only, тэнцлийн шалгалт, үеийн хяналт, voucher-тэй уялдаа
│   └── 920_views.sql              үлдэгдэл, гүйлгээ баланс, нээлттэй гүйлгээ, насжилт, тогтвортой байдлын шалгалт
├── seed/
│   ├── legal_parameters.sql    хууль журмын параметрүүд (`tax.tax_parameter`)
│   ├── mn_*.sql                MN нутагшуулалтын багц: Маягт А-гийн мөр, МГТ-ийн ангилал, системийн эрх (глобал) ба
│   │                           `platform.fn_provision_company_mn` — шинэ компанийн анхдагч тохиргоо нэг дуудлагаар
│   └── README.md               багцын тайлбар, дансны төлөвлөгөөний хүснэгт, өөрчлөх заавар
└── tests/
    ├── catalog_checks.sql      бүтцийн дүрмийн шалгалт (FK индекс, COMMENT, float байхгүй, …)
    ├── smoke.sql               утааны тест (smoke test): тэнцэл, өөрчлөгдөхгүй байдал, RLS, дугаарлалт
    └── seed_checks.sql         MN багцын шалгалт: provisioning idempotent, харгалзаа, тохиргооны данс, цуврал, туршилтын posting
```

Модуль хоорондын FK-г зөвхөн "дараа үүсэх" файлд `ALTER TABLE … ADD FOREIGN KEY`-ээр нэмнэ. Жишээ нь `gl.gl_account.vat_bus_posting_group_id`-ийн FK нь `040_tax.sql`-д байна. Иймээс файлуудыг **заавал дарааллаар** нь ажиллуулна.

## 2. Суулгах

```bash
# хоосон өгөгдлийн сан үүсгээд бүх файлыг дарааллаар суулгах
createdb erp_dev
db/apply.sh "postgresql://erp@localhost:5432/erp_dev"

# хууль журмын параметр ба MN нутагшуулалтын багц ачаалах, тест ажиллуулах
# (тест нь туршилтын tenant оруулдаг тул зөвхөн scratch DB-д; --seed --test нь seed_checks.sql-ийг ч ажиллуулна)
db/apply.sh "postgresql://erp@localhost:5432/erp_scratch" --seed --test

# шинэ компанид Монголын анхдагч тохиргоо (дансны төлөвлөгөө, posting setup, НӨАТ, цуврал, жил, тайлан, role)
psql -d erp_scratch -c "SELECT platform.fn_provision_company_mn('<tenant-uuid>', '<company-uuid>')"

# гараар (CI-ийн шалгалттай ижил)
for f in db/schema/*.sql; do psql -v ON_ERROR_STOP=1 -d erp_scratch -f "$f" || break; done
psql -v ON_ERROR_STOP=1 -d erp_scratch -f db/tests/catalog_checks.sql
psql -v ON_ERROR_STOP=1 -d erp_scratch -f db/tests/smoke.sql
```

- `000_extensions_roles.sql`-ийг superuser (эсвэл CREATEROLE + өргөтгөл суулгах эрхтэй role) ажиллуулна. Role нь кластерын түвшний объект тул давтан ажиллуулахад `IF NOT EXISTS`-ээр хамгаалагдсан.
- Бусад файл бүр `SET ROLE app_owner` хийнэ. Иймээс бүх объектыг `app_owner` эзэмшинэ, FORCE RLS эзэмшигчид ч үйлчилнэ.
- Файлууд idempotent биш. Production-д SQL-first migration ([ADR-0014](../adr/ADR-0014-sql-first-migrations.md)) энэ схемээс эхэлж, дараагийн өөрчлөлтийг тусдаа migration файлаар нэмнэ.

## 3. Role ба эрх

| Role | Шинж | Эрх |
|---|---|---|
| `app_owner` | NOLOGIN, BYPASSRLS **үгүй** | Бүх schema/объектыг эзэмшинэ. Migrator login (`erp_migrator`) гишүүн нь |
| `app_user` | NOLOGIN, BYPASSRLS үгүй | Бизнесийн хүснэгтэд DML. Ledger ба posted баримтад **зөвхөн SELECT, INSERT**. Глобал лавлахад SELECT |
| `app_worker` | `app_user`-ийн гишүүн | Нэмэлтээр: Монголбанкны ханш, eBarimt-ийн кэш, PosAPI төлөв бичих. Тенант хоорондын `integration.fn_claim_outbox`, `platform.fn_list_active_companies`-ийг **зөвхөн энэ role** дуудна |
| `app_readonly` | NOLOGIN | Зөвхөн SELECT (RLS үйлчилнэ) |
| `app_rls_bypass` | NOLOGIN, **BYPASSRLS** | Зөвхөн SECURITY DEFINER функц эзэмшинэ: `integration.fn_claim_outbox`, `platform.fn_list_active_companies`, `audit.fn_row_change`, `audit.fn_log_security_event`, мөн COMMIT-ийн шалгалт `gl.fn_sum_transaction`, `gl.fn_check_transaction_*`, `bank.fn_check_non_negative_cash` (RLS-ийн контекстоос хамааралгүй) |

Локал/CI-ийн login role-ууд (`starter/db/init/01-roles.sql`) байвал автоматаар холбогдоно: `erp_migrator → app_owner`, `erp_app → app_user`, `erp_worker → app_worker`, `erp_ops_ro → app_readonly`.

## 4. Дүрэм (conventions)

- **Нэршил:** snake_case, хүснэгтийн нэр ганц тоогоор. Модуль бүр өөрийн schema-тай (D-B3).
- **Түлхүүр:** бизнесийн хүснэгт бүр `id uuid PRIMARY KEY` (UUIDv7-г app үүсгэнэ, нөөц default нь `gen_random_uuid()`). Ledger-д нэмэлтээр компани дотор давхардахгүй `entry_no bigint` байна (D-C8).
- **Тенант:** бизнесийн мөр бүр `tenant_id`, `company_id`-тай. `(tenant_id, company_id)` → `platform.company(tenant_id, id)` FK нь тенант зөрөхөөс хамгаална. Өөр хүснэгт рүү заах FK нь `(company_id, x_id)` гэсэн нийлмэл (composite) хэлбэртэй. Ингэснээр өөр компанийн мөр рүү заах боломжгүй.
- **Мөнгө (D-C1):** domain-уудаар тодорхойлно. `platform.amount` = `numeric(19,4)`, `platform.unit_amount` = `numeric(19,6)`, `platform.quantity` = `numeric(19,5)`, `platform.exch_rate` = `numeric(38,18)`. `float`/`double`/`money` хориотой (catalog шалгалт).
- **Код:** BC-ийн `Code[20]`-ийг `platform.code20` domain орлоно: `CHECK (VALUE ~ '^[A-Z0-9_\-\.]{1,20}$')`.
- **Enum:** `text` + `CHECK` (давтагдах утгад domain). PostgreSQL `ENUM` төрөл **ашиглахгүй**. Шалтгаан: утга нэмэх/хасахыг transaction доторх энгийн migration-оор хийнэ, EF Core-д string-ээр шууд буудаг, API-ийн UPPER_SNAKE утгатай ижил.
- **G/L дүн (D-C3):** зөвхөн тэмдэгтэй `amount` хадгална. `debit_amount`/`credit_amount` нь `GENERATED ALWAYS … STORED` багана. Storno байхгүй.
- **Optimistic concurrency:** өөрчлөгддөг мастер/ноорогт `row_version integer` байна. `BEFORE UPDATE` trigger (`platform.fn_touch_row`) нэмэгдүүлж, `updated_at/updated_by`-г бөглөнө. Ledger-д `row_version` байхгүй (өөрчлөгддөггүй).
- **Аудит (D-I3):** `row_version`-тэй бүх хүснэгтэд `audit.fn_row_change` trigger автоматаар холбогдоно (JSON diff).
- **Индекс:** FK бүр индекстэй. Үл хамаарах зүйл нь `platform.company` руу заах тенантын FK ба глобал лавлах руу заах FK (тэдгээр мөр устгагддаггүй). `tests/catalog_checks.sql` үүнийг шалгана.
- **COMMENT:** хүснэгт бүрд англи COMMENT байх ба BC-ийн аль хүснэгтийг дуурайсныг заана ("Mirrors BC table 17 G/L Entry").
- **Огноо:** бизнесийн огноо `date` (Asia/Ulaanbaatar), техникийн цаг `timestamptz` (UTC).

## 5. Хамгаалалтын механизм

| Механизм | Хаана | Юуг хангах |
|---|---|---|
| FORCE RLS + `tenant_isolation` policy | `900_rls.sql` | Өөр тенантын мөр харагдахгүй, бичигдэхгүй. Контекст тохируулаагүй бол query алдаа өгнө (fail-closed) |
| `company_isolation` RESTRICTIVE policy | `900_rls.sql` | Компанийн хүснэгтийг зөвхөн `app.company_id` контекстоор |
| `platform.fn_set_context(tenant, company, user, request)` | `010_platform.sql` | `set_config(..., true)` — transaction-ий түвшний контекст |
| `platform.ledger_guard` + `fn_guard_immutable` | `910_ledger_guards.sql` | Ledger/posted хүснэгтэд UPDATE нь зөвхөн жагсаасан системийн баганад; DELETE/TRUNCATE хориотой |
| `platform.fn_ledger_update(table, key, jsonb)` | `910_ledger_guards.sql` | Зөвшөөрөгдсөн баганыг (`mutable_columns`) өөрчлөх цорын ганц зам (SECURITY DEFINER). Кэш багана (`trigger_columns`: `remaining_amount(_lcy)`, `open`) үүгээр өөрчлөгдөхгүй |
| `trg_gl_entry_balanced`, `trg_gl_transaction_has_entries` (DEFERRABLE INITIALLY DEFERRED) | `910_ledger_guards.sql` | `sum(amount) = 0` per `(company_id, transaction_no)` — COMMIT үед, voucher бүрд тусад нь; RLS-ийн контекстоос хамааралгүй (app_rls_bypass) |
| `trg_*_transaction_check` | `910_ledger_guards.sql` | `transaction_no`-той ledger/posted мөр бүр voucher-ийнхаа огноотой, тухайн DB transaction-д үүссэн voucher-т л холбогдоно (`ERL01`, `ERB02`). Voucher-гүй тулгалтын мөр үеийн дүрмээр шалгагдана |
| `trg_gl_transaction_period` / `gl.fn_assert_posting_date_allowed` | `910_ledger_guards.sql` | Posting date нь OPEN үе ба компанийн цонх дотор (хаалтын ваучер ч цонхонд захирагдана, D-D3) |
| `trg_*_global_dims` | `910_ledger_guards.sql` | `global_dim_1/2_value_id`-г `dimension_set_id`-ээс гаргана (оролтыг үл тооно) |
| `trg_vat_return_period_status` | `910_ledger_guards.sql` | SUBMITTED НӨАТ-ын үе эцсийнх (`ERP02`) |
| `platform.fn_next_document_no` | `010_platform.sql` | Завсаргүй (gapless) дугаар — posting transaction дотор түгжинэ; `reset_yearly` цувралд тухайн жилийн мөр заавал (`ERN01`). SECURITY DEFINER, counter-т `app_user` шууд бичихгүй |
| `platform.fn_next_entry_no` | `010_platform.sql` | Ledger бүрийн `entry_no`/`transaction_no`/`register_no` (SECURITY DEFINER) |
| `ebarimt.fn_next_bill_seq` | `130_ebarimt.sql` | POS тус бүрийн reset-гүй `billIdSuffix` дараалал (D-K4), `bill_id_suffix = seq mod 10^6` |

Алдааны код: `ERB01` тэнцээгүй гүйлгээ, `ERB02` voucher-ийн огноо/register зөрсөн, `ERP01` үе/цонх, `ERP02` үе ба НӨАТ-ын үеийн төлөвийн шилжилт, `ERL01` өөрчлөгдөхгүй дүрэм, `ERT01` контекст/тенант, `ERV01` НӨАТ-ын үе, `ERC01` касс сөрөг, `ERG01` данс posting биш, `ERN01..03` дугаарлалт, `ERD01` dimension.

## 6. BC-ийн харгалзааны товчоо

| Модуль (schema) | Гол хүснэгт | BC объект |
|---|---|---|
| `platform` | `company`, `company_setup`, `permission_set`, `permission`, `user_company_role`, `number_series(_line)`, `source_code`, `reason_code` | Company, T79, permissionset/T2000000165-166, Access Control, T308/309, T230, T231 |
| `gl` | `gl_account`, `gl_account_category`, `general_ledger_setup`, `accounting_period`, `journal_template/batch/line`, `gl_register`, `gl_transaction`, `gl_entry`, `dimension*`, `gl_budget(_entry)` | T15, T570, T98, T50, T80/232/81, T45, T57, T17, T348/349/352/480/481, T95/96 |
| `tax` | `vat_posting_setup`, `vat_entry`, `gl_entry_vat_entry_link`, `vat_statement_*`, `vat_return_period` | T323/324/325, T254, T253, T255-257, T737 |
| `fx` | `currency`, `currency_exchange_rate`, `exch_rate_adjmt_register`, `exch_rate_adjmt_ledger_entry` | T4, T330, T86, T186 |
| `party` | `customer`, `vendor`, posting group-ууд, `general_posting_setup`, `payment_terms`, `payment_method`, `cust/vendor_ledger_entry`, `detailed_*` (D-K2), `application_draft` | T18, T23, T92/93/250/251/252, T3, T289, T21/T25, T379/T380 |
| `sales` / `purchase` | header/line ноорог, posted header/line, `cancelled_document` | T36-37/38-39, T112-115/T122-125, T1900 |
| `bank` | `bank_account`, `bank_ledger_entry`, `bank_reconciliation(_line)`, `bank_account_statement(_line)` | T270, T271, T273/274, T275/276, T1251, T1294 |
| `fa` | `fixed_asset`, `depreciation_book`, `fa_depreciation_book`, `fa_ledger_entry` | T5600, T5611, T5612, T5601 |
| `inv` | `item`, `item_ledger_entry`, `value_entry`, `item_application_entry` | T27, T32, T5802, T339 |
| `rpt` | `financial_report`, `fin_report_row`, `fin_report_column` | T88, T84/85, T333/334 |
| `audit` | `row_change`, `posting_log`, `security_event`, `security_incident`, `document_entry` (view) | T405 Change Log Entry, T265 Document Entry (Navigate) |

Дэлгэрэнгүй харгалзаа, хялбарчилсан/хассан зүйлсийг [03-domain-model.md](../03-domain-model.md)-ийн §4-өөс үзнэ.

## 7. Тестийн үр дүн (2026-10-06, PostgreSQL 16.15)

- 18 файл алдаагүй суусан. Нийт **158 хүснэгт**, 12 view (хяналтын дараа, доорх тэмдэглэлийг үзнэ үү).
- `catalog_checks.sql`: FK индексгүй 0, COMMENT-гүй 0, float багана 0, дүрэм зөрчсөн хүснэгт 0.
- `seed_checks.sql` (MN багц, [seed/README.md](seed/README.md) §11 ба хяналтын тэмдэглэл): **80/80 PASS** — provisioning хоёр, гурав дахь удаад 0 мөр нэмнэ, өөр тенантын компанийг provision хийхийг татгалзана (`ERT01`), posting данс бүр Маягт А-гийн мөр ба МГТ-ийн ангилалтай, тохиргооны 282 дансны ишлэл бүгд posting данс, баримтын төрөл бүрд цуврал, тэнцсэн ваучер DB guard-уудаар батлагдана, ТТ-03а-г BC-ийн дүрмээр тооцоход төлөх НӨАТ зөв гарна.
- `smoke.sql`: **58/58 PASS** (анхны 33 + хяналтын 25 regression шалгалт). Үүнд тэнцсэн гүйлгээ commit болох, тэнцээгүй нь COMMIT үед `ERB01`-ээр унах, `gl_entry.amount`-ийг `app_user` (42501) болон эзэмшигч (ERL01) хоёулаа өөрчилж чадахгүй байх, rollback-ийн дараа дугаар завсаргүй үргэлжлэх, буцаалт эсрэг баганад орох, хаалттай үед posting хийх боломжгүй байх, авлагын үлдэгдэл detailed entry-тэй тэнцэх, тенант/компанийн RLS тусгаарлалт, контекстгүй query алдаа өгөх зэрэг шалгалт орсон.

## Хяналтын тэмдэглэл (Review log)

**Огноо:** 2026-10-06. **Хамрах хүрээ:** `db/schema/*.sql`, `db/tests/smoke.sql`, [03-domain-model.md](../03-domain-model.md). **Жишиг:** [DECISIONS.md](../DECISIONS.md) ба `research/bc-*.md`-ийн "Entities"/"Business rules" (MUST/SHOULD), PostgreSQL-ийн зөв ажиллагаа, eBarimt, олон компанийн бүрэн бүтэн байдал.
**Шалгалт:** шинэ DB дээр 18 файл алдаагүй суусан → `catalog_checks.sql` цэвэр → `smoke.sql` **58/58 PASS** (`apply.sh --seed --test`-ээр ч мөн). Хүснэгт 150 → **158**, view 11 → **12**.

**Тоо:** 36 засвар = DECISIONS зөрчил 9, BC дүрмийн дутуу 9, PostgreSQL/аюулгүй байдал 10, дутуу R1 хүснэгт ба read model 7, тестийн харнесс 1.

### A. DECISIONS-ийн зөрчил

| # | Юу байсан | Юу болгосон | Шалтгаан |
|---|---|---|---|
| A1 | `cust/vendor_ledger_entry`, `detailed_*` нь `sales`/`purchase` schema-д | `party` schema руу шилжүүлсэн (`060_party.sql`); view-үүд `party.v_*`, `party.fn_customer_aging`; posted header → ledger entry FK | **D-K2** (01-requirements §6 #11) |
| A2 | `ebarimt.pos_day_counter` — POS × өдөр бүр тэглэгддэг counter | `ebarimt.pos_counter` (reset-гүй) + `ebarimt.fn_next_bill_seq`; `ebarimt_document.bill_seq` (POS-д UNIQUE), `bill_id_suffix = bill_seq % 10^6` CHECK; өдрийн UNIQUE хэвээр | **D-K4**, ADR-0012 (§6 #12) |
| A3 | Кассын сөрөг үлдэгдлийг зөвхөн `prevent_negative_balance = true` үед шалгадаг | `kind = 'CASH'` бол үргэлж шалгана | **D-G1** "кассын үлдэгдэл сөрөг болохыг хориглоно" — сонголтгүй |
| A4 | Хаалтын (`is_closing`) ваучер компанийн posting цонхыг алгасдаг | `gl.fn_assert_posting_date_allowed`: цонх бүх posting-д | **D-D3** "бүх эрхэд хориглоно" |
| A5 | `remaining_amount(_lcy)`, `open` нь `fn_ledger_update`-ээр app-аас өөрчлөгдөж болдог байсан (кэш эвдэрнэ) | `ledger_guard.trigger_columns`: зөвхөн detailed entry-ийн trigger; `fn_ledger_update` татгалзана. `reversed`/`unapplied` нэг чиглэлтэй (true→false хориотой) | **D-C4**, D-F3 (үлдэгдэл detailed-ээс) |
| A6 | Жилийн цуврал: тухайн жилийн мөр байхгүй бол өмнөх жилийн мөрөөр (`SI-2026-…`-г 2027-д) дугаар олгодог | `number_series.reset_yearly` + `ERN01` | **D-C7** (`PREFIX-YYYY-#####`, жил бүр шинээр) |
| A7 | `app_user` нь `number_series_counter`, `ledger_counter`-т шууд UPDATE/DELETE хийж чаддаг (завсар/давхардал) | DML-ийг REVOKE; `fn_next_document_no`, `fn_next_entry_no`, `fn_next_bill_seq` нь SECURITY DEFINER | **D-C7**, D-K3, D-K4 |
| A8 | `vat_category` ба eBarimt `taxType`-ийн уялдааг шалгадаггүй | CHECK: VAT10→VAT_ABLE, VAT0→VAT_ZERO, EXEMPT→VAT_FREE, NOVAT→NOT_VAT/VAT_FREE | **D-E2**, D-E5 |
| A9 | `qrData`/`lottery`-г зөвхөн outbox/inbox-ийн дээд түвшний түлхүүрт шалгадаг | `integration.fn_has_forbidden_ebarimt_keys` (бүх гүнд); outbox, inbox, `idempotency_key.response_body`, `job_run.parameters/result`, `security_event.details` | **D-J3** (хэвлэх хариу idempotency store-д хадгалагдах эрсдэл) |

### B. BC-ийн дүрэм ба entity-ийн дутуу

| # | Юу байсан | Юу болгосон | Шалтгаан |
|---|---|---|---|
| B1 | G/L-гүй тулгалт (BC "Transaction No. 0": MNT-ийн posted entry хооронд тулгах, unapply) боломжгүй: `detailed.transaction_no NOT NULL` + voucher ≥ 1 мөр | `transaction_no` NULL байж болно (зөвхөн APPLICATION/APPL_ROUNDING/CORRECTION), ийм мөр үеийн дүрмээр шалгагдана; тулгалтын бүх төрөлд `application_no` заавал | bc-subledgers-application R-08, R-31 |
| B2 | Хэтрүүлж тулгах (over-application) хориггүй | CLE/VLE: `remaining_amount` тэмдгээ хадгалж, `abs ≤ abs(amount)` CHECK | BC CalcApplication |
| B3 | Detailed мөр өөр харилцагчийн entry-д бичигдэж болно | `(company_id, entry_no, customer_id/vendor_id)` нийлмэл FK (detailed ба applied entry) | Олон компани/харилцагчийн бүрэн бүтэн байдал |
| B4 | `Applying Entry` (MUST) байхгүй, FR-PTY-010-ийн `application_draft` байхгүй | `applying_entry` багана (whitelist) + `party.application_draft` | T21 MUST; FR-PTY-010 |
| B5 | `fin_report_column.ledger_entry_type = BUDGET_ENTRIES` байгаа ч төсвийн хадгалах газаргүй | `gl.gl_budget`, `gl.gl_budget_entry` (T95/96), `fin_report_column.gl_budget_id` + CHECK | bc-periods-reporting T95/96 SHOULD |
| B6 | `Allow VAT Difference` тохиргоо байхгүй | `sales_setup`, `purchase_setup`, `journal_template.allow_vat_difference` | bc-vat T311/312/80 SHOULD; D-E3 |
| B7 | `gl_account.income_balance` ба `account_category` зөрж болно | CHECK (INCOME/COGS/EXPENSE ⇒ INCOME_STATEMENT) | D-D1; жилийн хаалт (D-D4) үүн дээр тулгуурлана |
| B8 | Журналын мөрөнд FA-ийн талбар дутуу | `fa_posting_date`, `no_of_depreciation_days`, `salvage_value` (R2) | bc-fa-inventory T81 MUST |
| B9 | `value_entry.document_type` шалгалтгүй text | ILE-тэй ижил CHECK | Өгөгдлийн чанар |

### C. PostgreSQL-ийн зөв ажиллагаа ба аюулгүй байдал

| # | Юу байсан | Юу болгосон | Шалтгаан |
|---|---|---|---|
| C1 | Дэд дэвтэр/posted мөр (`vat_entry`, `cust_ledger_entry`, `bank_ledger_entry`, posted header, …) өмнө commit болсон voucher-т холбогдож эсвэл өөр огноотой байж болдог → CLOSED үе рүү back-date хийх зам | `gl.fn_ledger_transaction_check` (`trg_*_transaction_check`): voucher-ийн огноотой, тухайн DB transaction-д үүссэн voucher (`ERB02`, `ERL01`) | D-D3 үеийн түгжээг тойрох цоорхой |
| C2 | COMMIT-ийн тэнцэл/касс шалгалт RLS-тэй уншдаг: request COMMIT-оос өмнө компани сольбол тэнцэл "мөргүй" гэж буруу унаж, кассын шалгалт **чимээгүй өнгөрдөг** | `gl.fn_sum_transaction`, `gl.fn_check_transaction_*`, `bank.fn_check_non_negative_cash` нь `app_rls_bypass`-ийн SECURITY DEFINER, `company_id`-ээр шүүнэ | D-C5, D-G1 |
| C3 | Тэнцлийн trigger мөр бүрд бүх voucher-ийг дахин нийлбэрлэдэг (O(n²)) | Зөвхөн хамгийн их `entry_no`-той мөр нийлбэрлэнэ; индекс `(company_id, transaction_no, entry_no)` | Эхний үлдэгдлийн том импорт |
| C4 | `fn_claim_outbox`, `fn_list_active_companies` (BYPASSRLS) `app_user`-д нээлттэй (900-ийн "ALL FUNCTIONS" grant дахин олгодог) — web role бусад тенантын мессежийг lease хийж чадна | Зөвхөн `app_worker`; 900-д тусгайлан REVOKE | Тенант тусгаарлалт |
| C5 | `ux_vat_entry__supplier_receipt` UNIQUE: нэг ДДТД-д VAT_ABLE + VAT_FREE мөртэй баримт (2 VAT entry) ба худалдан авалтын кредит нот бүтэлгүйтнэ | Энгийн индекс; "нэг баримтыг нэг удаа" дүрэм `ebarimt.purchase_receipt UNIQUE (company_id, ddtd)`-д | D-E3 (VAT identifier тус бүр entry), D-E4 |
| C6 | Дутуу FK | `sales/purchase_header.corrected_invoice_id`; posted header → `cust/vendor_ledger_entry_no` (DEFERRABLE); `gl_transaction.reversed_by_transaction_no`; `fiscal_year.closing_transaction_no`; `ebarimt_document.outbox_id`; `vendor_bank_account.currency_code`; `user_setup (tenant_id, user_id) → tenant_membership` | FK бүрэн байдал, тенантын гишүүнчлэл |
| C7 | `global_dim_1/2_value_id` шалгалтгүй (өөр компанийн/зөрүүтэй утга) | `gl.fn_derive_global_dimensions`: `dimension_set_id`-ээс гаргана | D-D2 |
| C8 | SUBMITTED НӨАТ-ын үеийг OPEN болгож болдог | `trg_vat_return_period_status` (`ERP02`); оруулгатай/OPEN биш үеийг устгахгүй | D-E9, ТТ-03а илгээсний дараа |
| C9 | eBarimt `DELETE` үйлдэлд billIdSuffix заавал; DELETE мөрийн ДДТД нь SAVE-тэй UNIQUE зөрчинө | Bill талбар зөвхөн SAVE-д; DELETE нь `replaces_document_id` + `inactive_ddtd`, зөвхөн B2C; ДДТД-ийн UNIQUE зөвхөн SAVE; хүсэлтийн өөрчлөгдөхгүй талбарыг өргөтгөсөн (`bill_seq`, `consumer_no`, `inactive_ddtd`, `parent_ddtd`, `report_month`, `request_sha256`) | D-J4, D-J1 |
| C10 | `fn_next_*` SECURITY DEFINER болсон тул `search_path`-ийг түгжсэн | `SET search_path = pg_catalog, pg_temp` | search_path hijack-аас хамгаалах |

### D. Дутуу R1 хүснэгт ба read model (01-requirements §6 #13)

| # | Нэмсэн | Эх |
|---|---|---|
| D1 | `platform.document_signature` (append-only, PDF-ийн SHA-256, үүрэг, MFA) | FR-PLT-012, ADR-0023 C |
| D2 | `platform.support_access_grant` (READ_ONLY/READ_WRITE, ≤ 72 цаг CHECK) | FR-PLT-016, 02 §10.7 |
| D3 | `audit.security_event` + `audit.fn_log_security_event` (тенантгүй мөр тенантад харагдахгүй, 10 жил, append-only) | 02 §11.6, ADR-0016 |
| D4 | `audit.security_incident` | NFR-044, 02 §10.6 |
| D5 | `ebarimt.ebarimt_document_event` (төлөвийн шилжилт, UNKNOWN-ийн гар шийдвэр; trigger-ээр) | D-J2, 02 §11.6 (`receipt_event`) |
| D6 | `party.application_draft` | FR-PTY-010 |
| D7 | `party.fn_vendor_aging`, `party.v_payables_reconciliation` | D-F7 (AP насжилт), INV-11 (AP) |

### E. Тест

- `smoke.sql`: хүлээгдэж буй алдааны блок бүрийн өмнө `LAST_ERROR_SQLSTATE`-г `none` болгосон. Өмнө нь өмнөх тестийн алдааны код үлдэж, алдаа гараагүй тохиолдолд ч **хуурамч PASS** өгөх боломжтой байсан (C4-ийн шинэ тест эхний ажиллуулалтад яг ингэж хуурамчаар давсан тул илэрсэн).
- 25 шинэ regression шалгалт: нийлбэрээрээ 0 боловч тус бүр тэнцээгүй 2 voucher (ERB01); COMMIT-оос өмнө компани солих; хуучин voucher-т дэд дэвтрийн мөр (ERL01); огноо зөрөх (ERB02); global dimension гаргах; нэг DB transaction-д 2 voucher; G/L-гүй тулгалт; хэтрүүлж тулгах (23514); хаалттай үед G/L-гүй тулгалт (ERP01); өөр харилцагчийн detailed (23503); кэш баганыг `fn_ledger_update`-ээр өөрчлөх (ERL01); `reversed`-ийг буцаах (ERL01); counter шууд өөрчлөх (42501); outbox claim (42501); nested `qrData` (23514); жилийн цуврал (ERN01); billIdSuffix дараалал ба rollback; SUBMITTED НӨАТ-ын үе (ERP02); CASH сөрөг (ERC01); `bill_id_suffix` CHECK; eBarimt төлөвийн түүх; тенантгүй security event; эцсийн integrity view-үүд.

### F. Санаатайгаар өөрчлөөгүй / нээлттэй

1. Полиморф `account_id`/`bal_account_id`, `source_id`, `ebarimt_document.source_id` FK-гүй хэвээр — posting engine шалгана (BC-ийн Account Type/No. загвар).
2. `cust/vendor_ledger_entry.open` нь `remaining_amount <> 0`-тэй CHECK-ээр уялдаагүй: CLE мөр INITIAL detailed-ээс өмнө (remaining = 0, open = true) оруулагддаг. Уялдааг `v_*_ledger_entry_check` шалгана.
3. "Тухайн DB transaction-д үүссэн voucher" шалгалт нь `created_at = now()` (transaction-ий эхлэх цаг)-д тулгуурлана; компани бүрийн advisory lock-той хамт практикт хангалттай.
4. `ebarimt.posapi_instance.left_lotteries` нь instance-ийн үлдсэн сугалааны **тоо** (мониторинг), баримтын сугалааны дугаар биш — D-J3-тай зөрчилдөхгүй.
5. 02-architecture-д дурдсан `integration.integration_attempt`, `party.consent`, `party.contact` R1 шаардлагагүй тул нэмээгүй.
6. FX: судалгаа "ханшийг хадгал" гэж зөвлөдөг; схем BC-ийн `currency_factor`-ийг хадгалсан (D-C1-ийн `numeric(38,18)`).
7. Хэрэглэгчийн posting цонх (`platform.user_setup`, R2) DB-ээр хүчээр мөрдүүлэхгүй — app давхарга.
8. `audit.row_change` ба том ledger-ийн партицлал — 03-domain-model §8-ийн нээлттэй асуудал хэвээр.
