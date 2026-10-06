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

1. **Хуулийн параметр глобал** (`tax.ref_legal_parameter`, `tenant_id`-гүй):

   ```sql
   CREATE TABLE tax.ref_legal_parameter (
       id            uuid PRIMARY KEY,
       param_code    text NOT NULL,          -- 'VAT_STANDARD_RATE', 'VAT_REG_THRESHOLD', 'VAT_SIMPLIFIED_DEEMED_SHARE', ...
       valid_during  daterange NOT NULL,     -- [from, to)
       value_numeric numeric(38,18),
       value_json    jsonb,                  -- шатлал (CIT bands, PIT bands)
       source_ref    text NOT NULL,          -- хууль, зүйл заалт, URL
       confidence    text NOT NULL CHECK (confidence IN ('CONFIRMED','UNVERIFIED')),
       created_at    timestamptz NOT NULL DEFAULT now(),
       EXCLUDE USING gist (param_code WITH =, valid_during WITH &&)
   );
   ```

   - `btree_gist` нь PG18-ийн `PRIMARY KEY (param_code, valid_during WITHOUT OVERLAPS)`-ийн 16+-тай нийцтэй орлуулга.
   - Утгыг migration (`V…__ref_tax_legal_parameters.sql`) эсвэл платформын админ (эрхтэй, аудиттай) оруулна.
2. **Компанийн огноотой профайл** (`tax.company_tax_profile`, `valid_during`-тэй):
   - НӨАТ-ын статус (`NONE` / `STANDARD` / `SIMPLIFIED`) ба давтамж;
   - НХАТ төлөгч эсэх ба дүүрэг;
   - ААНОАТ-ын горим (`STANDARD` / `ONE_PERCENT` / `CREDIT_90` / `SIMPLIFIED_ANNUAL` = ТТ-02(ХГ) хялбаршуулсан жилийн тайлан). Enum код зөвхөн латин үсэгтэй байна: кирилл "Х", "Г" нь латин "X"-тэй андуурагдаж, CHECK ба харьцуулалтыг эвддэг;
   - хасагдсан салбар;
   - тайлагналын хүрээ (`IFRS_SME` / `IFRS`).

   Boolean биш, огноотой мөрүүд байна (REQ-ACC-22).
3. **Татварын код** (`tax.tax_code`) нь `valid_during` ба хувьтай. Хувийн өөрчлөлт = шинэ мөр. BC-ийн "VAT Rate Change" хэрэгсэл хэрэггүй.
4. **Хайлтын түлхүүр.** `ILegalParameterProvider.GetAsync(code, asOf)` нь `(value, parameter_id)` буцаана.
   - `asOf` нь **posting огноо** эсвэл үеийн татварт **үеийн эхлэл** ([mn-tax.md](../research/mn-tax.md) R1).
5. **Тооцоололд хувилбарыг хадгална.** Тооцоолол бүр ашигласан параметрийн id-г хадгална:
   - `tax.vat_entry.tax_code_id` ба `rate` (snapshot);
   - `fa_depreciation_book.tax_life_param_id`;
   - `vat_settlement.parameter_ids`.
6. **Маргаантай огноо.** Маргаантай огноотой утгыг (400 саяын босго) **хоёр хувилбараар** бэлтгэж, `confidence = 'UNVERIFIED'` гэж тэмдэглэнэ. Эцсийн хуулийн текст батлагдсаны дараа migration-ээр `valid_during`-ийг тогтооно. Код өөрчлөгдөхгүй.
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
