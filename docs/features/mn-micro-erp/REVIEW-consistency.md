# Баримтуудын уялдааны хяналт (cross-document consistency review)

> Огноо: 2026-10-08. Хамрах хүрээ: `docs/features/mn-micro-erp` багцын бүх `.md` (research/-ийг зөвхөн холбоосоор), `api/openapi.yaml`, `db/schema`, `db/seed`, `starter/` (README, golden draft). Эх сурвалжийн дараалал: [DECISIONS.md](./DECISIONS.md) → `db/schema/*.sql` (D-K1) → бусад баримт.
> Арга: канон схем ба seed-ийг шинэ scratch DB-д суулгаж (`db/apply.sh … --seed --test`, PostgreSQL 16, exit 0), каталогоос нэрсийн жагсаалт гаргаад баримт бүрийн нэр, холбоос, ID, API зам, алдааны код, эрх, дансны кодыг скриптээр тулгасан. Скриптийн илрүүлсэн зөрүү бүрийг гараар нягталсан: хуучин→канон нэрийн харгалзааны хүснэгт, татгалзсан/нөхцөлт санал, event/job/параметрийн нэр нь алдаа биш.

## 1. Хураангуй

| Шалгалт | Хамрах хэмжээ | Илэрсэн зөрүү | Зассан (баримтад) | Схем/seed → CR (`pending`) | Үлдсэн (тайлбартай) |
|---|---|---|---|---|---|
| DB нэр (schema.table/column/function) | 1 038 өвөрмөц `schema.name` (7 500 удаа), `table.column` хэлбэрийн нэрс, 21 bare нэр | 7 жинхэнэ буруу нэр | 7 | 6 (#144–#147, #149, #150) | 0 |
| Markdown холбоос | 2 497 харьцангуй холбоос (71 `.md`) | 20 эвдэрсэн (эхэнд 7) | 13 (энэ файл ба зэрэгцээ `REVIEW-readiness.md` үүссэнээр) | — | 7 (§3.2, хуулбарын шинж) |
| FR ID | 216 тодорхойлсон / 216 иш татсан | 0 | — | — | 0 |
| NFR / US / BR / D / ADR ID | 121 / 179 / 767 өвөрмөц / 64 / 23 | 1 (NFR-123) | 1 | — | 0 |
| GS ID ↔ 16-test-strategy.md | 151 өвөрмөц ID | 26 нь 16-д байхгүй + 1 ID мөргөлдөөн (GS-GL-021) | 29 мөр бүртгэж, 1 ID-г нэгтгэсэн | — | 0 |
| API зам ↔ `api/openapi.yaml` | 799 замын дурдлага; 14 §15 каталог | 14 §15: 0 дутуу. 08-ийн VAT хаалтын гэрээ OpenAPI-д дутуу; 2 замын нэр зөрсөн | OpenAPI: +2 замын нэр, +4 schema, `:close`-д body, 2 schema өргөтгөсөн; 08, 14 засагдсан | — | 208 дурдлага модулийн эзэмшилд (§3.4) |
| Redocly lint | `npx @redocly/cli@latest lint` | 0 алдаа, 0 анхааруулга (засварын өмнө ба дараа) | — | — | 0 |
| Алдааны код | `api.*` каталог 40; OpenAPI ба spec-ийн код | 4 буруу кодын хэрэглээ | 4 | — | 0 |
| Эрхийн объект (`x-permission`, spec) | OpenAPI 99 объект; spec 99 | Seed-д 4 объект алга; spec-д 2 буруу нэр | 2 | 1 (#152) | 0 |
| DECISIONS-тэй зөрчил | мөнгө, storno, дугаарлалт, tenancy/RLS, eBarimt, хувилбар, хуулийн огноо | 3 тодорхойгүй/зөрчилтэй | 2 | 1 (#148) | 0 |
| Posting жишээ ↔ seed CoA | `Дт/Кт NNNN` 427 дурдлага (95 код), хүснэгтийн 4 оронтой нүд 1 237 | Seed-д байхгүй posting данс 0; 1 сценари seed-тэй зөрчилтэй (1699) | 1 | — | 0 |
| Дугаарын формат | 15 хуулийн цуврал (`PREFIX-YYYY-#####`) | 1 seed-гүй угтвар (`SCM`) | 3 | — | 0 |
| Starter-ийн илрүүлсэн схемийн алдаа | starter/README "Канон схемийн мэдэгдэж буй алдаа" | 3 бүртгэгдээгүй | — | 3 (#149–#151) | 0 |

**Нийт:** 15 файлд ~75 засвар (үүнээс 29 нь 16-ийн GS индексийн мөр; §4) ба энэ тайлан, `db/CHANGE_REQUESTS.md`-д 9 шинэ `pending` мөр (§6 → #144–#152). Схем ба seed-ийн SQL-д өөрчлөлт хийгээгүй.

## 2. Нэрсийн бүртгэл (inventory)

| Ангилал | Эх сурвалж | Тоо |
|---|---|---|
| Schema | `db/schema` | 15 (`platform`, `gl`, `tax`, `party`, `sales`, `purchase`, `bank`, `fx`, `fa`, `inv`, `rpt`, `ebarimt`, `integration`, `audit`, `identity`) — D-B3/D-K1/D-K7-тэй таарна |
| Хүснэгт / view | каталог | 201 / 21 (03-domain-model, db/README, CHANGE_REQUESTS-ийн тоотой таарна) |
| Функц (апп schema) | каталог | 98 |
| Domain | `010_platform.sql` | `amount` (19,4), `unit_amount` (19,6), `quantity` (19,5), `exch_rate` (38,18), `percent` (9,5) — D-C1-тэй таарна |
| Seed CoA (демо компани) | `fn_provision_company_mn` | 182 данс (138 POSTING) — starter/db/README-ийн "182"-той таарна |
| Хуулийн дугаарын цуврал | `platform.number_series` | 15 (`SI`, `SC`, `PI`, `PC`, `GJ`, `KO`, `KZ`, `BR`, `BP`, `OB`, `CL`, `FXA`, `DP`, `IA`, `IC`) |
| Эрхийн объект (глобал seed) | `platform.permission` | 227 |
| API | `api/openapi.yaml` | 175 зам, 235 operation, 269 schema (засварын дараа) |
| Шийдвэр | DECISIONS.md | 64 (`D-A1` … `D-K7`) |

## 3. Шалгалт ба үр дүн

### 3.1 DB нэр (`db/schema` = эх сурвалж)

- **Арга.** Backtick доторх `schema.name[.column]` бүрийг каталогийн хүснэгт/view/функц/domain/багана, seed-ийн өгөгдлийн утга (эрх, job, параметр), spec-ийн хүснэгтээр тодорхойлсон код (алдаа, event)-той тулгав. Мөн `table.column` (schema-гүй) ба `fn_*`, `v_*`, `trg_*`, `ix_*`, `*_entry/_header/_line/_setup` хэлбэрийн bare нэрсийг шалгав.
- **Үр дүн.** 1 038 өвөрмөц нэрээс 314 нь DB объект, ~620 нь seed/spec-д тодорхойлогдсон код. Үлдсэн 103-ыг гараар шалгахад ихэнх нь (а) 02/05/06/08/09/10/12-ын "хуучин нэр → канон нэр" хүснэгт, (б) татгалзсан/нөхцөлт CR (`bank.cash_voucher_draft`, `gl.account_period_balance`, `ebarimt.posapi_instance_counter`, `vendor_ledger_entry.cancelled`), (в) event/topic (`gl.fiscal_year.closed`), job, эрхийн нэр байв.
- **Жинхэнэ буруу нэр (засагдсан):** `gl.general_ledger_setup.allow_posting_from/to` → `platform.company_setup.…` (02); `tax.vat_statement_line.vat_bus/prod_posting_group` → `…_id` (08 CR-TAX-12); `integration.integration_attempt` (хүснэгт байхгүй) → `integration.job_run` + OTel (09); `item.inventory_posting_group`, `item.gen_prod` → `…_id` (11); `outbox.depends_on` → `depends_on_id` (CHANGE_REQUESTS #38); 11 OQ-ARCH-01-ийн `phys_count` (02 аль хэдийн `item_journal` болсон тул шийдэгдсэн гэж тэмдэглэв).
- **Схемд байх ёстой боловч алга (CR):** `platform.schema_migration` (#146), `quartz` схем (#145), reusable DDL helper (#147), `audit.posting_log.created_at` (#149), `identity.user_credential.email_confirmed_at` (#150). `000`-ийн `sales`/`purchase` тайлбар D-K2-той зөрнө (#144).

### 3.2 Markdown холбоос

- 71 `.md` файлын 2 497 харьцангуй холбоосыг (файл ба `#anchor`, GitHub slug) шалгав. Хяналтын эхэнд 7 эвдэрсэн байв; явцад 20 болсон (энэ файл руу 3 шинэ холбоос, зэрэгцээ ажлын `REVIEW-readiness.md` руу 10); энэ файл ба `REVIEW-readiness.md` үүссэнээр 13 нь шийдэгдэв.
- **Үлдсэн 7 (тайлбартай):**
  - `starter/db/seed/README.md`-ийн 7 холбоос (`../../DECISIONS.md` г.м.) — `db/seed/README.md`-ийн **байт-байтаар хуулбар** (`tools/ci/sync-db.sh`, `DatabasePackageDriftTests`). Хоёр байрлалд зэрэг ажиллах харьцангуй зам байхгүй; starter-ийг шинэ репо руу хуулахад багцын баримт ч хамт ирэхгүй. Эх файлд (`db/seed/README.md`) бүгд зөв. Засахгүй.
  - `./REVIEW-readiness.md` руу 10 холбоос (13, 18, 19) — зэрэгцээ "readiness review"-ийн файл үүссэний дараа бүгд зөв (2026-10-08 дахин шалгав).

### 3.3 ID-ийн бүртгэл

| ID | Тодорхойлох газар | Үр дүн |
|---|---|---|
| FR | 01-requirements.md (`#### FR-…`) | 216/216; иш татсан бүх FR байна. US→FR ба GS→FR хувилбарын зөрчил (FR-ийн хувилбар US/GS-ээс хожуу) 0 |
| NFR | 01 §NFR (NFR-001…NFR-121) | 16-ийн толгойд `NFR-123` → `NFR-121` засав |
| US | 17-backlog-roadmap.md | Бүгд байна |
| BR, INV, AT, OQ, CR | модуль бүрийн spec | Тодорхойлогдоогүй лавлагаа 0 (`AT-FA-31` г.м. мөр дотроо тодорхойлогдсон) |
| D-* | DECISIONS.md | 64/64; OpenAPI-ийн 33 D-ID бүгд байна |
| ADR | `adr/ADR-*.md` | 23/23 |
| **GS** | **16-test-strategy.md §12.2** | **26 ID 16-д алга байв:** 09 §11.4-ийн санал (GS-CASH-008/009, GS-REC-005…010, GS-FX-007…014), 10 §11.2-ийн санал (GS-CLOSE-006…010, GS-RPT-006…008), starter-ийн skeleton (GS-VAT-023 ба README-ийн `GS-GL-021…024`). **Мөргөлдөөн:** 05 §11-ийн `GS-GL-021-year-close-noop-status` ба starter-ийн `GS-GL-021-balanced-journal-gapless-numbering` — нэг ID хоёр scenario (TST-GS-02 зөрчил); 05-ын санал нь 10-ын GS-CLOSE-006-тэй агуулгаар ижил. **Засвар:** 05-ыг GS-CLOSE-006 болгож нэгтгэсэн; 16 §12.2-т 29 мөрийг `санал` тэмдэгтэй нөөцөлсөн (GS-GL-021…024 = starter-ийн файлууд), тайлбар нэмсэн. Одоо GS ID бүр 16-д байна |

### 3.4 API зам ба OpenAPI

- **14 §15 (нийтийн гэрээний каталог) ↔ OpenAPI:** каталогийн бүх зам ба арга OpenAPI-д байна.
- **Зөрүү (засагдсан):**
  - 08 §10.1 ба BR-TAX-69/72/79 нь `POST /vat-return-periods/{id}:preview-close`, `:reopen` (R1) ба `:close`-ийн body (`postingDate`, `settlementAccountId?`, `expectedScopeVersion`, `expectedLastVatEntryNo?`), ТТ-03а-ийн хариуд `lastVatEntryNo`, `scopeVersion`-ийг тодорхойлсон боловч OpenAPI-д байгаагүй (14 Q19 нь "BR-TAX-79 эцэслэгдсэний дараа нэмнэ" гэсэн; BR-TAX-79 эцэслэгдсэн, seed-д `ACTION tax.vat.reopen` бий). OpenAPI-д `previewCloseVatReturnPeriod`, `reopenVatReturnPeriod`, `VatScopeVersion`, `VatPeriodCloseRequest`, `VatPeriodClosePreviewRequest`, `VatClosePreview` нэмж, `VatReturnReport`-ийг өргөтгөв; 14 §15.5 ба Q19-ийг шинэчлэв.
  - 08 §10.1 `/vat-business-posting-groups`, `/vat-product-posting-groups` → 14/OpenAPI-ийн `/vat-bus-posting-groups`, `/vat-prod-posting-groups`.
  - OpenAPI `CloseChecklistItem.code`-ийн жишээ (`sales.unposted_drafts` г.м.) 10 §5.1-ийн UPPER_SNAKE кодтой (`BANK_UNRECONCILED` г.м.) зөрж байсан; `link` нь UI зам (10 §5.1); `amount`, `manual` талбар нэмэгдэв.
- **Модулийн эзэмшилд үлдсэн 208 дурдлага** (14 §0.1 "Багтахгүй" ба модулийн spec өөрөө эзэмшинэ гэж заасан): UI зам (15, `/c/{company}/…`) 52; JSON pointer/хэсэгчилсэн зам 41; 11 FA/бараа (R2) 31; 12 §18.1 eBarimt-ийн тохиргоо/POS/лавлах 23; 13 §19 нэвтрэлт/тенант 11; бусад модулийн санал 50. Сүүлийн бүлгийн R1 гол нь: `POST /purchase-invoices/{id}:link-ebarimt`, `PUT …/vat-amount-lines` (14 Q17), `GET /input-vat/unconfirmed`, `POST /input-vat:write-off`, `GET /gl-transactions/{id}/correction-proposal`, `:preview-reverse` (гүйлгээ, register), `/standard-journals` (05 §10.1 "✕ санал"), `POST /journals/{id}:suggest-vendor-payments` (07), `GET /fiscal-years/{id}/close-checklist`, `POST /financial-reports/{id}:snapshot` (10), `/imports` (14 Q20), `/tax/vat-threshold`, НӨАТ-ын бүртгэлийн тайлангууд (08), `/bank-statement-import-formats`, `/text-to-account-mappings`, `:settle-wallet` (09). Эдгээрийг 14 §15-д нэмэх нь 14-ийн эзэмшигчийн дараагийн алхам (нэмэлт өөрчлөлт, API-VER-02).
- **Lint:** `npx --yes @redocly/cli@latest lint api/openapi.yaml` — засварын өмнө ба дараа "valid", 0 анхааруулга.

### 3.5 Алдааны код ба эрх

- `api.precondition_failed` (14 §9.4-т байхгүй) → `api.etag_mismatch` (10: BR-PER-19-ийн псевдокод, алдааны хүснэгт, AT-PER-19).
- `api.rate_limited` → `platform.rate_limited` (12 §18.1 `:send-data`; 14 §9.2, API-RL-01).
- `ACTION rpt.report.export` (06) → `ACTION rpt.export.excel` + тухайн REPORT (14 §15.5).
- 08 `/tax/calendar`: `TABLE tax.tax_parameter R` (seed-д объект байхгүй, глобал лавлах) → AUTHENTICATED (14 `GET /tax-parameters`-тэй ижил).
- 12 хяналтын #43 (`ACTION ebarimt.document.resolve`): OpenAPI аль хэдийн `ebarimt.unknown.resolve` хэрэглэдэг — шийдэгдсэн гэж тэмдэглэв.
- OpenAPI-ийн 99 `x-permission` объектоос 3 нь (`TABLE bank.bank_account_statement`, `gl.accounting_period_status_log`, `integration.job_run`) ба 08-ийн R2 `TABLE tax.customs_declaration` seed-ийн каталогт алга → CR #152.

### 3.6 DECISIONS-тэй зөрчил

| Сэдэв | Шалгасан | Үр дүн |
|---|---|---|
| Мөнгөний төрөл (D-C1) | `numeric(p,s)` бүх дурдлага, domain, `float/double` | Схем ба spec таарна. 08 CR-TAX-05-ийн `vat_amount numeric(19,2)` нь түүхэн санал; хэрэгжилт `platform.amount`. ADR-0006-ийн `numeric(18,2)` нь татгалзсан хувилбар. PosAPI-ийн JSON жишээн дэх тоон дүн нь гадаад гэрээ (манай API string) |
| MNT нарийвчлал (D-C2 ⚠) | `amount_rounding_precision` | **Зөрчил:** D-C2 "MNT 0.01; бүхэл төгрөг зөвхөн бэлэн мөнгөний invoice rounding" гэдэг. Схем `CHECK IN (0.01, 1)`, 05/06/08/09/11/14 нь компанийн нарийвчлал = 1 сонголтыг тайлбарласан → **CR #148 (pending)**, нягтлан зөвлөхийн шийдвэр |
| Storno (D-C3) | "storno" бүх дурдлага | Зөрчилгүй — бүх газар "storno-гүй, эсрэг тэмдэг, эсрэг багана" |
| Дугаарлалт (D-C7) | `PREFIX-YYYY-#####`, sequence, жил бүр | Seed-ийн 15 цуврал ба жишээ таарна. 12 §22-ийн кредит нотын `SCM-2026-000xx` (seed-д `SCM` цуврал байхгүй) → `SC-2026-000xx`. 15 UX-PRN-02-ийн `SCM` нь хэвлэмэл маягтын код (цуврал биш) |
| Tenancy / RLS (D-B3, D-K6) | fail-closed, BYPASSRLS | Зөрчилгүй. D-K6-ийн "`erp_owner` BYPASSRLS-гүй" өгүүлбэрийг group role-оор тодотгосон (02 "Нийцүүлэлтийн тэмдэглэл" #6, утга өөрчлөгдөөгүй). 18-ийн алдаа засах хүснэгтийн "0 мөр" мөрийг fail-closed-оор тодотгосон |
| eBarimt (D-J1…J4, D-K4, D-I6) | `max_attempts = 1`, UNKNOWN, `qrData`/`lottery`, B2B DELETE, `reportMonth` 1–7 | Зөрчилгүй (`*_INVOICE` нь бүх газар R2; B2B DELETE татгалзсан хэвээр) |
| Хувилбар (D-A3, §H) | FR-ийн хувилбар; US/GS ↔ FR; R2/R3-ийн функц R1 гэж бичигдсэн эсэх | Зөрчилгүй (FX/FA/бараа/НХАТ/давтагдах журнал/netting R2; захиалга/QPay/approval R3) |
| Хуулийн огноо (D-K5) | 400 сая ₮-ийн босго | Seed `2027-07-01`. 02 §1-ийн "2027-01-01-ний … босго 400 сая" гэснийг D-K5-аар тодотгосон |

### 3.7 Posting жишээ ↔ seed дансны төлөвлөгөө

- Seed CoA-г демо компанид провишн хийж (182 данс) `Дт/Кт NNNN`, `данс NNNN` хэлбэрийн 427 дурдлагыг (95 өвөрмөц код), мөн хүснэгтийн 4 оронтой нүдийг шалгав. Posting жишээнд seed-д байхгүй эсвэл POSTING биш данс **0** (илэрсэн "үл мэдэгдэх" 4 оронтой тоо нь entry №, SMTP порт, утас, тайлангийн шүүлтүүрийн хүрээ байв). Дансны нэр seed-ийн нэртэй нийцнэ (жишээ: 1300 Орцын НӨАТ, 2300 Борлуулалтын НӨАТ, 2310 НӨАТ-ын тооцоо, 3500 Тайлант үеийн ашиг). Нэг мөрт Дт/Кт-тай 11 жишээ тэнцсэн (08 §11-ийн нэг мөр нь гурав дахь мөрийг үгээр өгсөн).
- **Зөрчил (засагдсан):** 10 AT-RPT-63 нь "хэрэглэгч posting данс 1699 үүсгэнэ" гэсэн боловч seed-д 1699 нь `HEADING` "Биет бус хөрөнгө". Seed-ийн шүүлтүүрийн завсар бүр гарчгийн дугаар тул тестийн нөхцөлийг "бичилтгүй HEADING 1699-ийг POSTING болгох" (FR-GL-001 AC2 зөвшөөрнө) болгож засав.
- Starter-ийн golden draft (GS-GL-016/021…024, GS-VAT-023) нь seed-ийн данс (2650, 7210, 1580, 5110, 2300, 7213, 1300)-ыг хэрэглэдэг, тэнцсэн.

## 4. Хийсэн засвар

| Файл | Засвар |
|---|---|
| [DECISIONS.md](./DECISIONS.md) | D-K6: BYPASSRLS-ийн өгүүлбэрийг group/login role-оор тодотгосон (утга хэвээр) |
| [02-architecture.md](./02-architecture.md) | §1 D-K5-ийн огноо; §4.2.2 posting-ийн цонх `platform.company_setup`; "Нийцүүлэлтийн тэмдэглэл" #6 хийгдсэн, #1–#4 → CR #144–#147 |
| [05-posting-engine.md](./05-posting-engine.md) | GS-GL-021 (year-close noop) → GS-CLOSE-006 (§11 жагсаалт, review log, дамжуулах жагсаалт) |
| [06-sales-receivables.md](./06-sales-receivables.md) | Экспортын эрх `rpt.export.excel` |
| [08-tax-vat-mn.md](./08-tax-vat-mn.md) | §10.1 VAT posting group-ийн зам, `/tax/calendar`-ийн эрх; CR-TAX-12-ийн баганын нэр |
| [09-bank-cash-fx.md](./09-bank-cash-fx.md) | Монголбанкны оролдлогын лог `integration.job_run` + OTel |
| [10-periods-closing-reporting.md](./10-periods-closing-reporting.md) | `api.etag_mismatch` (3 газар); AT-RPT-63-ийн 1699 данс |
| [11-fixed-assets-inventory.md](./11-fixed-assets-inventory.md) | `item.*_id` багана (2); OQ-ARCH-01 шийдэгдсэн |
| [12-ebarimt-integration.md](./12-ebarimt-integration.md) | `SC-2026-000xx` (3); `platform.rate_limited`; хяналтын #43 шийдэгдсэн |
| [14-api.md](./14-api.md) | §15.5 НӨАТ-ын үеийн үйлдлүүд; Q19 шийдэгдсэн |
| [16-test-strategy.md](./16-test-strategy.md) | §12.2-т 29 `санал` GS мөр ба тайлбар; толгойн NFR хүрээ |
| [18-dev-setup.md](./18-dev-setup.md) | Алдаа засах хүснэгтийн "0 мөр" (D-K6) |
| [api/openapi.yaml](./api/openapi.yaml) | `:preview-close`, `:reopen`, `:close` body, `VatReturnReport.lastVatEntryNo/scopeVersion`, 4 шинэ schema, `CloseChecklistItem` |
| [db/CHANGE_REQUESTS.md](./db/CHANGE_REQUESTS.md) | #38-ийн баганын нэр; §6 шинэ 9 `pending` мөр |
| [starter/README.md](./starter/README.md) | Golden draft ID-ууд 16 §12.2-т нөөцлөгдсөн |

## 5. Шийдвэр хүлээж буй (db/CHANGE_REQUESTS.md §6, `pending`)

| # | Товч | Эрэмбэ |
|---:|---|---|
| 144 | `000`-ийн `sales`/`purchase` схемийн тайлбар (D-K2) | Бага |
| 145 | Quartz.NET job store-ийн схем (`quartz` эсвэл `integration.qrtz_*`) | Дунд |
| 146 | `platform.schema_migration`-ийг канон схемд | Бага |
| 147 | RLS/ledger/audit-ийн reusable helper функц | Бага |
| 148 | `amount_rounding_precision IN (0.01, 1)` ↔ D-C2 | Нягтлан зөвлөхийн шийдвэр |
| 149 | `audit.posting_log.created_at` (INSERT одоо 42703-аар унадаг) | Өндөр |
| 150 | `identity.user_credential.email_confirmed_at` | Өндөр |
| 151 | `platform.tenant` багцын анхдагч ба CHECK | Дунд (PO) |
| 152 | Seed-ийн эрхийн каталогт 4 объект | Дунд |

## 6. Мэдэгдэж буй, энэ хяналтаар засаагүй

1. Starter-ийн golden JSON-ийн `description` талбар "not yet in the 16 §12 catalog" гэсэн хэвээр (код/өгөгдөл тул хөндөөгүй); ID нь одоо 16 §12.2-т `санал` төлөвтэй.
2. `REVIEW-readiness.md` (зэрэгцээ ажил) нь 17-д тодорхойлогдоогүй `US-FND-014`-ийг иш татдаг — тэр review-ийн эзэмшигч 17-д нэмэх эсэхийг шийднэ.
3. 14 §15-д модулийн R1 endpoint-уудыг (§3.4) нэмэх — 14-ийн эзэмшигч.
4. `starter/db/seed/README.md`-ийн харьцангуй холбоос (хуулбарын шинж, §3.2).

## 7. Давтан ажиллуулах

```bash
createdb -h /var/lib/postgresql -p 55432 -U erp <db>
bash db/apply.sh "postgresql://erp@/<db>?host=/var/lib/postgresql&port=55432" --seed --test   # exit 0
npx --yes @redocly/cli@latest lint api/openapi.yaml                                              # valid
```

Тулгалтын скриптүүд (каталог → нэрсийн жагсаалт, холбоос/anchor, ID, API зам, эрх, дансны код) нь багцын гадна scratch-д ажилласан; дүрмийг энэ файлын §3-т тайлбарласан.
