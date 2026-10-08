# ADR-0021: Огнооны хүчинтэй хуулийн параметр (2027 оны өөрчлөлт)

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг, татварын шинжээч
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §1.1, §4.2.5. [ADR-0003](./ADR-0003-postgresql.md), [ADR-0006](./ADR-0006-money-and-rounding.md)

## Нөхцөл байдал

- **2026-06-26-нд батлагдсан татварын багц 2027-01-01-нээс** хэрэгжинэ ([mn-tax.md](../research/mn-tax.md) §1):
  - НӨАТ-ын заавал бүртгүүлэх босго 50 саяас 400 сая болно. Хэрэгжих огноо 2027-01-01 эсвэл 2027-07-01 гэж **маргаантай**;
  - хялбаршуулсан улирлын НӨАТ (90% тооцоот худалдан авалт);
  - ААНОАТ-ын 3 шатлал;
  - 90%-ийн хөнгөлөлтийн босго 2.5 тэрбум болно;
  - ХХОАТ-ын 0% шатлал;
  - НДШ-ийн хувь;
  - хөдөлмөрийн хөлсний доод хэмжээ 1 000 000 ₮ болно.
- **Хуучин ба шинэ дүрэм зэрэг хэрэгтэй.** 2026 оны үеийн засвар ба тайлан 2027 онд хийгдэхэд хуучин дүрэм, 2027 оны гүйлгээнд шинэ дүрэм хэрэглэгдэнэ.
- **Тооцоолол ямар параметрээр хийгдснийг нотлох** шаардлагатай (R19).
- **Техникийн хязгаарлалт.** PG18-ийн `WITHOUT OVERLAPS` нь 16/17-д байхгүй ([ADR-0003](./ADR-0003-postgresql.md)).

## Шийдвэр

1. **Хуулийн параметр глобал** (`tax.tax_parameter`, `tenant_id`-гүй; канон: [040_tax.sql](../db/schema/040_tax.sql), seed [legal_parameters.sql](../db/seed/legal_parameters.sql), [DECISIONS](../DECISIONS.md) D-E7):

   ```sql
   CREATE TABLE tax.tax_parameter (
       id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       param_code     text NOT NULL CHECK (param_code ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),  -- 'vat.standard_rate', 'vat.registration_threshold_mandatory', ...
       description    text NOT NULL,
       value_numeric  numeric,
       value_text     text,
       unit           text NOT NULL,                 -- ratio, MNT, years, months, flag, url, ...
       applies_to     text,
       effective_from date NOT NULL,
       effective_to   date,                          -- NULL = хугацаагүй
       legal_basis    text,                          -- хууль, зүйл заалт
       source_url     text,
       confidence     text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
       status         text NOT NULL DEFAULT 'unverified' CHECK (status IN ('verified','unverified','superseded')),
       created_at     timestamptz NOT NULL DEFAULT now(),
       CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL),
       CHECK (effective_to IS NULL OR effective_to >= effective_from),
       EXCLUDE USING gist (param_code WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
   );
   ```

   - `btree_gist` нь PG18-ийн `PRIMARY KEY (param_code, … WITHOUT OVERLAPS)`-ийн 16+-тай нийцтэй орлуулга.
   - Утгыг migration (seed `legal_parameters.sql`-ийн загвараар) эсвэл платформын админ (эрхтэй, аудиттай) оруулна. `app_user` зөвхөн SELECT.
2. **Компанийн огноотой профайл** (`tax.company_tax_profile`, `valid_from`/`valid_to`, `EXCLUDE` давхцалгүй):
   - НӨАТ-ын статус `vat_status` (`NOT_REGISTERED` / `STANDARD` / `SIMPLIFIED`, `simplified_base`) ба давтамж `vat_return_frequency`;
   - НХАТ-ын тохиргоо (`tax.city_tax_setup`, R2);
   - ААНОАТ-ын горим `cit_regime` (`STANDARD` / `CREDIT_90` / `ONE_PERCENT` / `SIMPLIFIED_ANNUAL` = ТТ-02(ХГ) хялбаршуулсан жилийн тайлан). Enum код зөвхөн латин үсэгтэй байна: кирилл "Х", "Г" нь латин "X"-тэй андуурагдаж, CHECK ба харьцуулалтыг эвддэг;
   - хасагдсан салбар (`excluded_activity_code`).

   Boolean биш, огноотой мөрүүд байна (REQ-ACC-22). `tax.fn_sync_company_vat_status` нь `vat_registered` cache-ийг профайлтай уялдуулна.
3. **НӨАТ-ын хувь** нь VAT Posting Setup (`tax.vat_posting_setup`: `vat_bus_posting_group` × `vat_prod_posting_group`, D-E1) дээр; хуулийн стандарт хувь `tax.tax_parameter` (`vat.standard_rate`)-д огноотой. Хувийн өөрчлөлтийг шинэ параметр мөрөөр ба setup-ийг шинэчлэх migration-оор хийнэ; BC-ийн "VAT Rate Change" хэрэгсэл хэрэггүй.
4. **Хайлтын түлхүүр.** `ILegalParameterProvider.GetAsync(code, asOf)` нь `(value, parameter_id)` буцаана (`effective_from <= asOf AND (effective_to IS NULL OR asOf <= effective_to)`).
   - `asOf` нь **posting огноо** эсвэл үеийн татварт **үеийн эхлэл** ([mn-tax.md](../research/mn-tax.md) R1).
5. **Тооцоололд хувилбарыг хадгална.** Тооцоолол бүр ашигласан утгыг snapshot хийнэ:
   - `tax.vat_entry.vat_percent`, `vat_bus_posting_group`, `vat_prod_posting_group` (snapshot);
   - `fa.fa_class.tax_life_param_code` → `fa.depreciation_run_line`-ийн параметрийн snapshot;
   - `tax.vat_return_snapshot` (НӨАТ-ын тайлангийн тооцоолсон үр дүн).
6. **Маргаантай огноо.** Маргаантай огноотой утгыг (400 саяын босго; D-K5-аар 2027-07-01) **хоёр хувилбараар** бэлтгэж, `status = 'unverified'` (`confidence`-ийг тохируулж) гэж тэмдэглэнэ. Эцсийн хуулийн текст батлагдсаны дараа migration-ээр `effective_from`/`effective_to`-ийг тогтооно. Код өөрчлөгдөхгүй.
7. **Тайлангийн маягтын хувилбар** (ТТ-03а, Маягт А) мөн `valid_from`-той өгөгдөл байна ([ADR-0019](./ADR-0019-reporting-questpdf-closedxml.md)).

## Үр дагавар

**Эерэг:**
- 2027 оны өөрчлөлтийг кодын өөрчлөлтгүйгээр, өгөгдлөөр хэрэгжүүлнэ. Параметрийн migration (`V…__ref_*`) эсвэл платформын админы UI-аар оруулна. Application-ий шинэ build хэрэггүй.
- Хуучин ба шинэ дүрэм зэрэг ажиллана.
- Аудитад параметрийн хувилбарыг нотолно.

**Сөрөг ба эрсдэл:**
- **Тооцоолох код бүр `asOf` ба параметрийн хайлтыг** зөв ашиглах ёстой.
  - Бууруулах арга: тогтмол утгыг кодонд бичихийг analyzer хориглоно (`0.10m` VAT гэх мэт); golden scenario 2026 ба 2027 огноогоор ажиллана.
- **Хуулийн утгыг оруулах үйл явц** (хэн, хэзээ, ямар эх сурвалжаар) байх шаардлагатай. `source_ref` ба аудит үүнийг хангана.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Тогтмолыг кодонд + feature flag | Хурдан | Deploy шаардана. Хуучин үеийн тооцоог давтах хэцүү | P7 зарчим |
| `valid_from`-той, давхцлын constraint-гүй | Энгийн | Давхцсан мөр оруулах боломжтой | Бүрэн бүтэн байдал |
| PG18-ийн `WITHOUT OVERLAPS` | Цэвэр синтакс | PG16/17-д байхгүй | DDL-ийн нийцэл |
| Компани бүр өөрийн хувь хэмжээг засах | Уян | Хуулийн утгыг хэрэглэгч буруу оруулах эрсдэл | Хууль бол глобал |

## Холбоос

- [mn-tax.md](../research/mn-tax.md) §1, §10 (R1, R2, R19), §11
- [mn-accounting.md](../research/mn-accounting.md) §8, REQ-ACC-22
- [tech-architecture.md](../research/tech-architecture.md) §4.7, TA-07
- [bc-vat.md](../research/bc-vat.md) §7 (Effective-dated rates)
