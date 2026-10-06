# ADR-0001: BC extension биш, BC-ийн логикийг шинээр хэрэгжүүлсэн бие даасан бүтээгдэхүүн

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг, бүтээгдэхүүний эзэн
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §1, §4.6. Өмнөх төлөвлөгөө [mn-micro-finance/PLAN.md](../../mn-micro-finance/PLAN.md)-г энэ ADR орлоно

## Нөхцөл байдал

- **Зорилтот хэрэглэгч.** 1–10 ажилтантай Монголын бичил бизнес. Олонх нь гэрээт нягтлантай. Үнэд мэдрэмтгий, энгийн UI хүсдэг.
- **Өмнөх санал.** [mn-micro-finance/PLAN.md](../../mn-micro-finance/PLAN.md) нь Business Central (BC) дээр extension бичих санал байсан. BC online-ийн Монголын хувилбар "Partner localized, W1 base". Энэ нь Azure Asia Pacific бүсэд байрладаг.
- **Хатуу хязгаарлалт:**
  - eBarimt PosAPI зөвхөн **Монголын IP-ээс, дотоод сүлжээнд** ажиллана. BC online-д заавал Монголд байрлах gateway хэрэгтэй болно ([mn-integrations-market.md](../research/mn-integrations-market.md) §2.5).
  - Програм хангамж Сангийн яамны **батлагдсан НББ-ийн программын жагсаалтад** орох ёстой (Order 47/2018). Шалгуурын нэг нь гүйлгээг нуух, засах боломжгүй байх. Энэ нь бүтээгдэхүүнийг бүрэн хянах шаардлагатай гэсэн үг ([mn-accounting.md](../research/mn-accounting.md) §2.5).
  - Хувь хүний мэдээлэл хамгаалах хууль (2021) гадаад руу өгөгдөл дамжуулахыг хязгаарладаг (art. 14.1).
  - BC-ийн хэрэглэгч тус бүрийн лицензийн үнэ бичил бизнест өндөр. Үнийн тоо UNVERIFIED.
- **BC-ээс суралцах боломж.** BC-ийн нягтлан бодох бүртгэлийн логик олон жил шалгагдсан. Эх код нь BCApps репод MIT лицензтэй нээлттэй. Бид дараах хэсгүүдийн дүрмийг AL кодоос шууд уншиж баримтжуулсан: posting, VAT, авлага/өглөг, dimension, дугаарын цуврал ([bc-*.md](../research/)).

## Шийдвэр

1. **Бие даасан, олон тенанттай SaaS** бүтээгдэхүүн хийнэ. Энэ нь BC extension биш, BC runtime-аас хамаарахгүй.
2. **BC-ийн нягтлан бодох бүртгэлийн семантик ба өгөгдлийн загварыг** хялбарчилж, C# ба PostgreSQL дээр **шинээр хэрэгжүүлнэ**. Хуулах семантик:
   - G/L Entry (тэмдэгтэй `amount`, `Correction`);
   - Transaction No. ба G/L Register;
   - Dimension Set ID;
   - No. Series;
   - Source Code ба Reason Code;
   - Cust./Vendor Ledger Entry + Detailed Ledger Entry (тулгалт ба буцаалт);
   - VAT Entry ба VAT Posting Setup;
   - General Posting Setup ба Invoice Posting Buffer;
   - Accounting Period;
   - Posting Preview;
   - Reversal;
   - Permission Set.
3. **Юуг хуулахгүй вэ:** AL-ийн бүтэц (codeunit, FlowField, `Commit`, event subscriber-ийн заль), ACY, IC, Jobs, Manufacturing болон research тэмдэглэлд SKIP гэсэн бүх зүйл.
4. **Хэмжээ.** Судалгааны тэмдэглэлийн MUST/SHOULD/SKIP ангиллыг баримтална. MUST = v1-д хийнэ, SHOULD = хялбар хэлбэрээр эсвэл v1-ийн дараа, SKIP = хийхгүй.
5. **Эх сурвалж.** BC-ийн дүрмийг хэрэгжүүлэхдээ кодын коммент болон тодорхойлолтод BC-ийн эх файлыг заана. Жишээ: `// BC: GenJnlPostLine.Codeunit.al R-GL-POSTING-35`. BCApps-ийн кодоос шууд хэсэг хөрвүүлбэл (MIT) `NOTICE` файлд эх сурвалжийг бичнэ.

## Үр дагавар

**Эерэг:**
- Байршил, үнэ, UI, нийцлийн бүх асуудлыг өөрсдөө хянана. PosAPI-тай нэг дотоод сүлжээнд ажиллана.
- Бичил бизнест хэрэгтэй хэсгээр л хязгаарлагдсан, энгийн загвар гарна.
- Олон жил шалгагдсан BC-ийн дүрмүүд дээр суурилна. Шинэ бүтээн байгуулалтын алдааг багасгана.

**Сөрөг ба эрсдэл:**
- **Бүгдийг бүтээх ажил их.** Тайлан, тохиргоо, эрх, UI-г бүгдийг нь хийнэ.
  - Бууруулах арга: v1-ийн хүрээг хатуу хязгаарлана ([02-architecture.md](../02-architecture.md) §1.4).
- **Нягтлан бодох бүртгэлийн алдааны эрсдэл.**
  - Бууруулах арга: golden scenario-г нягтлан бодогч баталгаажуулна; property-based invariant тест; DB-ийн invariant ([ADR-0007](./ADR-0007-append-only-ledger-reversal.md), [ADR-0009](./ADR-0009-synchronous-posting-advisory-lock.md)).
- **BC-ийн экосистем** (partner, AppSource) байхгүй.
- **BC-ийн шинэ хувилбарын өөрчлөлтийг** автоматаар авахгүй. Шаардлагатай бол research тэмдэглэлийг шинэчилж, гараар тусгана.

**Шалгах:** golden scenario бүрт BC-ийн ижил сценаригийн entry-ийг (bc-*.md-ийн "Worked posting examples") хүлээгдэж буй үр дүн болгон ашиглана.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| BC SaaS + Монголын extension ([PLAN.md](../../mn-micro-finance/PLAN.md)) | Цөмийн ~80% бэлэн. Microsoft-ийн дэд бүтэц | Монголоос гадна байрлана: PosAPI-д gateway хэрэгтэй, өгөгдөл гадаад руу гарна. Хэрэглэгчийн лиценз үнэтэй. UI бичил бизнест хэт нарийн. Order 47-ийн шаардлагыг хянахад хэцүү | Байршил, үнэ, нийцлийн хязгаарлалт |
| BC on-prem-ийг тенант бүрд Монголд | Өгөгдөл Монголд | Тенант бүрд тусдаа instance ажиллуулах нь үйл ажиллагааны хувьд маш хүнд. Лиценз | Олон тенантад тохирохгүй |
| Odoo + `l10n_mn`-ийг өөрчлөх | Бэлэн ERP. Дансны төлөвлөгөө ба НӨАТ бий | eBarimt ба НХАТ байхгүй. LGPL/Enterprise лицензийн нарийн асуудал. Python стек. Ledger-ийн загвар BC-ээс өөр | Өөрчлөх ажил их, хяналт сул |
| ERPNext | Нээлттэй эх. Immutable ledger горимтой | Frappe стек. Олон тенант нь site-аар. Монголын локалчлал байхгүй | Стек ба олон тенантын загвар |
| BC-ийг лавлахгүйгээр эхнээс нь зохиох | Хамгийн чөлөөтэй | Нягтлан бодох бүртгэлийн ирмэгийн тохиолдлыг дахин нээх эрсдэл | BC-ийн шалгагдсан семантик бэлэн байна |

## Холбоос

- [mn-micro-finance/PLAN.md](../../mn-micro-finance/PLAN.md): BC extension-ий өмнөх санал
- [bc-gl-posting.md](../research/bc-gl-posting.md), [bc-dimensions-noseries-audit.md](../research/bc-dimensions-noseries-audit.md), [bc-account-determination.md](../research/bc-account-determination.md), [bc-sales-documents.md](../research/bc-sales-documents.md), [bc-subledgers-application.md](../research/bc-subledgers-application.md), [bc-vat.md](../research/bc-vat.md)
- [mn-accounting.md](../research/mn-accounting.md) §2.5 (батлагдсан программ), [mn-integrations-market.md](../research/mn-integrations-market.md) §2.5, §7
- BC эх код: [`src/Layers/W1/BaseApp/Finance/GeneralLedger/`](../../../../src/Layers/W1/BaseApp/Finance/GeneralLedger/)
