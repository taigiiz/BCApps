# Бичил бизнесийн санхүүгийн ERP (Монгол) — Төлөвлөгөө

> Төлөв: **Орлуулагдсан.** Хэрэглэгч BC extension биш, BC-ийн логикийг дуурайсан шинэ систем бичих шийдвэр гаргасан. Шинэ багцыг [../mn-micro-erp/README.md](../mn-micro-erp/README.md)-ээс үзнэ.
> Суурь: BCApps `main` (Business Central 29.0, W1 Base Application)
> Огноо: 2026-10-06

---

## 1. Товч дүгнэлт

**Зорилго:** 1–10 ажилтантай, 1 нягтлантай (ихэвчлэн гэрээт) Монголын бичил бизнест зориулсан санхүүгийн систем бий болгох. Систем нь нэхэмжлэх ба eBarimt, авлага/өглөг, касс/банк, НӨАТ, санхүүгийн тайланг хамарна. Шийдлийг BCApps репогийн Business Central дээр барина.

**Санал болгож буй шийдэл:** Business Central-ийн W1 цөмийг (Base App, System App, Business Foundation) **огт өөрчлөхгүй**. Түүн дээр Монголын онцлогийг хэдэн **extension** болгон бичнэ:

| # | Extension | Үүрэг |
|---|---|---|
| 1 | **MN Core** | Монгол локалчлал: дансны төлөвлөгөө, НӨАТ/НХАТ тохиргоо, ТТД, тайлан, Монголбанкны ханш, банкны хуулга, маягтууд |
| 2 | **MN eBarimt** | PosAPI 3.0 холболт. E-Document framework-ийн service хэлбэрээр хийнэ |
| 3 | **MN Micro Experience** | Бичил бизнест зориулсан хялбар интерфейс. W1 `BasicExperience` аппын загвараар хийнэ |
| 4 | **MN Setup Data** | Шинэ компанийг 1 өдөрт ашиглалтад оруулах бэлэн тохиргоо. Contoso demo dataset-ийн загвараар хийнэ |
| 5 | **MN Language** | Монгол хэлний (mn-MN) XLIFF орчуулга. Эхлээд зөвхөн хамрах хүрээний объектуудыг орчуулна |
| — | **eBarimt Gateway** | Монголд байрлах жижиг REST үйлчилгээ. BC online болон дотоод сүлжээний PosAPI-г холбоно |

**Яагаад ийм шийдэл вэ:**

- Microsoft Learn-ийн мэдээллээр Business Central online Монголд **"Partner localized, W1 base, Available"** төлөвтэй (орчин `MN`, Azure Asia Pacific). Өөрөөр хэлбэл Монголын локалчлалыг Microsoft хийхгүй, partner хийх ёстой. BCApps-д `MN` хавтас одоогоор байхгүй.
- Санхүүгийн цөмийн ~80% нь бэлэн. Үүнд ерөнхий журнал, posting engine, НӨАТ-ын бүртгэл, авлага/өглөг, банкны тулгалт, тайлангийн хэрэгсэл орно. Бид Монголын онцлог ~20%-ийг л бичнэ.
- BCApps нь MIT лицензтэй. Тиймээс `BasicExperience`, Испанийн `Verifactu`, Чехийн CNB ханш зэрэг бэлэн жишээг загвар болгон ашиглаж болно.

**Хугацаа ба баг:** ~22 долоо хоног (≈5 сар), 3–4 хүн. MVP (нэхэмжлэх + eBarimt + НӨАТ + үндсэн тайлан) ~11 долоо хоногт гарна.

**Гол 3 эрсдэл:**
1. PosAPI зөвхөн дотоод сүлжээнд ажилладаг тул BC online-оос шууд хандах боломжгүй. Үүнийг eBarimt Gateway-ээр шийднэ.
2. **2027-01-01-нээс** татварын хуулийн өөрчлөлт хүчин төгөлдөр болно. Тиймээс бүх татварын параметрийг огноогоор хадгална.
3. Лицензийн зардал. `Basic Experience` лиценз зөвхөн Дани, Исландад байдаг тул Монголд Essentials лиценз хэрэглэнэ.

---

## 2. BCApps судалгааны үр дүн

### 2.1 Репозиторийн бүтэц

| Зам | Агуулга | Бидэнд |
|---|---|---|
| `src/System Application` | Платформын модулиуд: Email, Barcode (QR), Rest Client, Secrets, Guided Experience, Retention Policy, Translation | Дахин ашиглана |
| `src/Business Foundation` | No. Series (дугаарлалт), Audit Codes (Source/Reason Code), Entitlements | Дахин ашиглана |
| `src/Layers/W1/BaseApp` | Base Application, 8,118 `.al` файл: Finance 1,037, Bank 239, Foundation 209, FixedAssets 213, CashFlow 49 | **Цөм, өөрчлөхгүй** |
| `src/Layers/<CC>` | Microsoft-ийн дотоод overlay (зөвхөн өөрчилсөн файлууд, жишээ нь IS-д 36 файл) | Partner ашиглах боломжгүй |
| `src/Apps/W1` | Microsoft-ийн 1-р талын 100+ апп | Сонгож ашиглана |
| `src/Apps/<CC>` | Улсын extension-ууд (IS Core, NO ElectronicVATSubmission, ES Verifactu г.м.) | **Загвар болгоно** |
| `src/Tools/Test Framework` | AL тестийн framework | Тестэд ашиглана |
| `build/projects` | AL-Go төслүүд (улс бүрт `Apps <CC>`) | CI загвар |

### 2.2 Бичил бизнест шууд ашиглах бэлэн цөм

Доорх замууд бүгд `src/Layers/W1/BaseApp/`-аас эхэлнэ.

| Хэсэг | Гол объектууд | Байдал |
|---|---|---|
| Ерөнхий дэвтэр | G/L Account (T15) `Finance/GeneralLedger/Account/GLAccount.Table.al`, G/L Entry (T17), G/L Account Category (T570) | Бэлэн, CoA-г тохируулна |
| Журнал ба posting | Gen. Journal Line (T81), **Gen. Jnl.-Post Line (CU12)** `Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al` (~9.8k мөр), Post Batch (CU13), Preview (CU19) | Бэлэн |
| Буцаалт | Reversal Entry (T179), Reversal-Post (CU179) | Бэлэн |
| Posting бүлгүүд | Gen. Bus./Prod. Posting Group (T250/251), General Posting Setup (T252), Customer/Vendor/Bank Posting Group (T92/93/277) | Тохируулна |
| НӨАТ | VAT Posting Setup (T325), VAT Entry (T254), VAT Statement (T255–257, R12), Calc. and Post VAT Settlement (R20), VAT Report framework (T740/741/746), G/L–VAT Reconciliation (R11) | Тохируулна + MN тайлан |
| Хэмжигдэхүүн (dimension) | Dimension (T348), Dimension Set Entry (T480), G/L Setup-ийн Global Dim 1/2 | 1–2 dimension тохируулна |
| Үе ба хаалт | Accounting Period (T50), Create Fiscal Year (R93), Close Income Statement (R94), Allow Posting From/To (G/L Setup ба User Setup) | Бэлэн |
| Валют | Currency (T4), Exchange Rate (T330), Exch. Rate Adjustment (R596), **Curr. Exch. Rate Update Setup (T1650)** | Монголбанкны ханшийг холбоно |
| Банк ба касс | Bank Account (T270), Bank Acc. Reconciliation (T273, P379), Payment Reconciliation Journal (P1290), Import Bank Statement (CU1200), Cash Receipt/Payment Journal (P255/256), Payment Registration (P981) | Бэлэн + MN банкны формат |
| Борлуулалт (авлага) | Customer (T18), Sales Header/Line (T36/37), **Sales-Post (CU80)**, Sales Invoice Header (T112), Correct Posted Sales Invoice (CU1303), Apply entries (CU226), Payment Terms/Methods (T3/T289), Reminders (сонголтоор) | Бэлэн + eBarimt |
| Худалдан авалт (өглөг) | Vendor (T23), Purchase Header/Line (T38/39), **Purch.-Post (CU90)**, Suggest Vendor Payments (R393), Payment Journal (P256), Incoming Document (T130) | Бэлэн + eBarimt ДДТД талбар |
| Бараа (энгийн) | Item (T27), төрөл нь Inventory/Service/Non-Inventory. Service болон Non-Inventory төрөл үнэлгээ хийхгүй, ItemJnlPostLine (CU22)-д аль хэдийн шийдэгдсэн | Ихэвчлэн Service/Non-Inventory хангалттай |
| Үндсэн хөрөнгө | Fixed Asset (T5600), Depreciation Book (T5611), FA Depreciation Book (T5612), Calculate Depreciation (R5692), FA G/L Journal (P5628) | Хамгийн бага хэсгийг ашиглана (даатгал, засварыг хэрэглэхгүй) |
| Санхүүгийн тайлан | Financial Report (T88), Acc. Schedule Line (T85), Column Layout (T334), Trial Balance (P1393/R6), Balance Sheet (R151), Income Statement (R154), Statement of Cashflows (R155), Aged AR/AP (R120/R322) | Монгол маягтаар тохируулна |
| Аудит ба хяналт | G/L Entry өөрчлөгдөхгүй (зөвхөн CU115 цөөн талбар засна), Navigate (P344), Change Log (T402/405), Posted баримт устгах хориг, User Setup posting хязгаар | Бэлэн |
| Цалингийн импорт | `Finance/Payroll/`: Import Payroll Transaction, Payroll Setup | Гадны цалингийн системээс журнал импортлоно |

### 2.3 Төлөвлөгөөнд нөлөөлсөн гол олдворууд

1. **`src/Apps/W1/BasicExperience`** нь *"core financial capabilities for small businesses"* апп бөгөөд яг бидний зорилттой давхцдаг.
   - "BF Basic" гэсэн experience tier үүсгэдэг: `ExperienceTierBF.Codeunit.al`, `AppAreaMgmtBF.Codeunit.al`.
   - ~69 page extension-аар захиалга (order), blanket order, purchase quote-ыг нууж, **зөвхөн нэхэмжлэхийн урсгал** үлдээдэг.
   - Ашиглагдахгүй role center-үүдийг унтраадаг (`BasicMgmtBF.Codeunit.al`).
   - Microsoft Learn-ийн мэдээллээр энэ апп зөвхөн **Дани, Исландад**, **3 хүртэлх хэрэглэгчтэй** ажилладаг. Тиймээс бид өөрсдийн "MN Micro" tier-ийг энэ загвараар хийнэ.
2. **Application Area механизм** (`Modules/System/ApplicationArea/ApplicationAreaMgmt.Codeunit.al`, 884–940-р мөр). Хуудасны бүх control ба action `ApplicationArea`-аар шүүгддэг. Иймээс интерфейсийг хялбарчлахдаа код бичих шаардлага бага.
3. **E-Document framework** (`src/Apps/W1/EDocument/App`) eBarimt-д хамгийн тохиромжтой суурь:
   - Format интерфейс: `"E-Document"` (`Document/Interfaces/EDocument.Interface.al`), enum 6101.
   - Transport интерфейсүүд: `IDocumentSender`, `IDocumentResponseHandler`, `ISentDocumentActions`, `IExportEligibilityEvaluator`, enum 6151 "Service Integration".
   - `Sales-Post.OnAfterPostSalesDoc` дээр автоматаар ажилладаг. Default Document Sending Profile ашиглавал харилцагч бүрт тохиргоо хийх шаардлагагүй.
   - **Хамгийн ойр жишээ:** Испанийн Verifactu (`src/Apps/ES/EDocumentFormats/DocumentRegistration/app/src/Core/`). Энэ апп татварын албанд бүртгүүлээд QR кодыг нэхэмжлэх дээр хэвлэдэг.
   - ⚠ Хуучин `"E-Document Integration"` интерфейс 26.0-оос obsolete болсон тул ашиглахгүй.
4. **Ханшийн үйлчилгээ:** `Finance/Currency/UpdateCurrencyExchangeRates.Codeunit.al`-д `OnBeforeGetCurrencyExchangeData` event бий. Монголбанкны ханшийг холбоход Чехийн CNB жишээ (`src/Apps/CZ/CoreLocalizationPack/app/Src/Codeunits/CNBCurrExchRateMgtCZL.Codeunit.al`) тохирно.
5. **НӨАТ-ын тайлангийн framework:**
   - `VAT Reports Configuration` (T746) ба `VAT Report Mediator` ашиглана.
   - Жишээ: `src/Apps/NO/ElectronicVATSubmission`, `src/Apps/DK/ElectronicVATDeclarationDK`.
6. **Локалчлалын орчин үеийн загвар бол тусдаа extension.**
   - `src/Apps/IS/ISCore/app` (ID 14600–14620) нь өөр хамаарал зарлаагүй, зөвхөн Base App-аас хамаардаг, "Cloud" target-тэй.
   - Норвеги шийдлээ функцээр нь хэд хэдэн апп болгон салгасан. `src/Layers/<CC>` overlay нь зөвхөн Microsoft-ийн дотоод build-д зориулагдсан.
7. **`src/Apps/W1/WithholdingTax`**: худалдан авалт ба ажилтанд суутгах татвар, гэрчилгээ, тайлан. Иргэнээс авсан үйлчилгээний ХХОАТ суутгалд ашиглаж болно.
8. **Тест:** W1 тестийн номын сангууд `src/Layers/W1/Tests/` (ERM, ERM-Sales, ERM-Purchase, Bank г.м.) дотор байна. PosAPI-г `HttpClientHandler`-оор mock хийж болох ч энэ нь зөвхөн on-prem/container дээр ажиллана. AL-Go-ийн CI container ашигладаг тул асуудалгүй.

---

## 3. Зорилтот хэрэглэгч ба шаардлага

### 3.1 Хэрэглэгчийн профайл

- **Байгууллага:** 1–10 ажилтантай ХХК, хувь хүн бизнес эрхлэгч, ТББ.
- **Салбар:** голчлон үйлчилгээ (зөвлөх, IT, засвар, сургалт), жижиг худалдаа, онлайн худалдаа.
- **Систем хэрэглэгч:** 1–3 хүн (эзэн/менежер, нягтлан, магадгүй гэрээт нягтлан).
- **Одоогийн байдал:** Excel эсвэл хуучин нягтлан бодох програм ашигладаг. eBarimt-ыг вэбээс гараар гаргадаг. Банкны хуулгыг гараар бичдэг. Татварын тайланг гараар бөглөдөг.
- **Хэмжээ:** сард 20–500 нэхэмжлэх, 50–1,000 банкны гүйлгээ.

### 3.2 Функциональ шаардлага (MoSCoW)

| ID | Шаардлага | Ач холбогдол | BC-д | MN-д хийх ажил |
|---|---|---|---|---|
| F-01 | Монгол дансны төлөвлөгөө ба G/L Account Category mapping | Must | Механизм бэлэн | Config package |
| F-02 | Ерөнхий журнал, буцаалт, давтагдах журнал | Must | Бэлэн | — |
| F-03 | Борлуулалтын нэхэмжлэх, буцаалт (credit memo) → eBarimt (B2B/B2C) | Must | Нэхэмжлэх бэлэн | **MN eBarimt** |
| F-04 | Худалдан авалтын нэхэмжлэх; орцын НӨАТ-ыг нийлүүлэгчийн eBarimt ДДТД-аар нотлох | Must | Нэхэмжлэх бэлэн | ДДТД талбар, тулгалтын тайлан |
| F-05 | Касс, банк, төлбөр бүртгэх, тулгалт | Must | Бэлэн | Кассын ордер маягт |
| F-06 | Монгол банкуудын хуулга импорт (CSV/Excel) | Must | Механизм бэлэн | Банк бүрийн Data Exch. Def |
| F-07 | НӨАТ 10%, 0%, чөлөөлөгдөх, НӨАТ-гүй | Must | Бэлэн | VAT Posting Setup + eBarimt taxType mapping |
| F-08 | НӨАТ-ын тайлан (татварын үе бүрээр) | Must | Framework бэлэн | VAT Statement + MN тайлан |
| F-09 | Санхүүгийн тайлан: СБД, ОДТ, ӨӨТ, МГТ; e-balance-д оруулах Excel | Must | Financial Reports бэлэн | Маягтын мөрийн тохиргоо |
| F-10 | Гүйлгээ баланс, ерөнхий дэвтэр, дансны хуулга, авлага/өглөгийн насжилт | Must | Бэлэн | Монгол layout |
| F-11 | Хэрэглэгчийн эрх, хаалттай үе, аудитын мөр | Must | Бэлэн | Permission set багц |
| F-12 | Монгол хэлний интерфейс | Must | Механизм бэлэн | **MN Language** |
| F-13 | Валют (USD, CNY, EUR, RUB…), Монголбанкны ханш, ханшийн тэгшитгэл | Should | Бэлэн | Ханшийн холболт |
| F-14 | Үндсэн хөрөнгө: НББ-ийн ба татварын 2 элэгдлийн дэвтэр | Should | Бэлэн | Тохиргоо |
| F-15 | Энгийн бараа материал (FIFO/дундаж) | Should | Бэлэн | Тохиргоо |
| F-16 | НХАТ (нийслэлийн хотын албан татвар) | Should* | **Байхгүй** | Тусгай загвар (§5.5) |
| F-17 | Цалингийн журнал импорт (ХХОАТ, НДШ) | Should | Импорт бэлэн | Импортын формат |
| F-18 | ААНОАТ-ын тооцооллын туслах тайлан | Could | — | Тайлан |
| F-19 | Суутгах татвар (ХХОАТ: гэрээт иргэн, түрээс) | Could | WithholdingTax апп | Тохиргоо |
| F-20 | QPay / банкны API-аар төлбөр тулгах | Could | — | Дараагийн хувилбар |
| — | Үйлдвэрлэл, агуулах, сервис, төсөл, consolidation, intercompany, CRM, бүрэн цалин | Won't | — | Нууна |

\* НХАТ нь зөвхөн тодорхой бараа, үйлчилгээнд (ресторан, зочид буудал, архи, тамхи, шатахуун г.м.) ногддог. Зорилтот сегмент үйлчилгээ бол MVP-д оруулахгүй байж болно (§11, Q2).

### 3.3 Функциональ бус шаардлага

- **Хялбар байдал:** нягтлан 1 өдрийн сургалтаар өдөр тутмын ажлаа хийдэг болно. Role center дээр ≤ 10 үндсэн үйлдэл байна.
- **Нэвтрүүлэлт:** шинэ компанийг ≤ 1 ажлын өдөрт ашиглалтад оруулна (wizard, бэлэн тохиргоо, эхний үлдэгдлийн Excel импорт).
- **Хуулийн өөрчлөлт:** татварын хувь, босго, горимыг **огноотой параметр** хүснэгтэд хадгална. Код өөрчлөхгүйгээр 2027-01-01-ний өөрчлөлтийг дэмжинэ.
- **Аудит:** posted бичилт өөрчлөгдөхгүй. eBarimt-ын бүх хүсэлт, хариуг лог хүснэгтэд бичнэ. Харин `qrData` ба `lottery`-г **хадгалахгүй** (журмын хориг, §5.4).
- **Өгөгдлийн байршил ба нууцлал:** BC online MN орчин Azure Asia Pacific-д байрлана. Хувь хүний мэдээлэл хамгаалах тухай хуулийн дагуу иргэний регистр, `consumerNo`-г хамгийн бага хэмжээгээр хадгална.
- **Шинэчлэл:** BC жилд 2 том, сар бүр жижиг шинэчлэлтэй. AL-Go CI нь дараагийн major хувилбарын (insider) artifact-аар тогтмол build хийнэ.

---

## 4. Хамрах хүрээ

**MVP-д орно:** ерөнхий дэвтэр, НӨАТ, борлуулалтын нэхэмжлэх ба eBarimt, худалдан авалтын нэхэмжлэх, касс/банк, банкны хуулга импорт, НӨАТ-ын тайлан, 4 санхүүгийн тайлан, гүйлгээ баланс, насжилт, монгол интерфейс (үндсэн дэлгэцүүд), тохиргооны wizard.

**Дараагийн хувилбарт орно:** валют ба Монголбанкны ханш, үндсэн хөрөнгө, бараа материал, НХАТ, цалингийн импорт, суутгах татвар, ААНОАТ туслах тайлан, QPay.

**Хамрахгүй:** үйлдвэрлэл, агуулах, сервис, төсөл, CRM, consolidation, intercompany, бүрэн цалингийн модуль, B2C касс/POS. Жижиглэн худалдааны кассыг тусдаа POS систем хийж, ERP-д нэгтгэсэн журнал оруулна.

---

## 5. Шийдлийн архитектур

### 5.1 Давхаргын бүтэц

```
┌───────────────────────────────────────────────────────────────────┐
│  MN Micro Experience   ("MN Micro" tier, "Бичил бизнес" RC, эрх)  │
├──────────────────────────────┬────────────────────────────────────┤
│  MN eBarimt                  │  MN Core          MN Setup Data     │
│  (E-Document service)        │  (локалчлал)      MN Language       │
├──────────────────────────────┴────────────────────────────────────┤
│  W1 аппууд: E-Document Core · Simplified Bank Statement Import ·  │
│  Excel Reports · API v2 · (Withholding Tax · Review G/L Entries)  │
├───────────────────────────────────────────────────────────────────┤
│  Base Application (W1) — ӨӨРЧЛӨХГҮЙ                               │
│  Business Foundation · System Application · Platform 29.x          │
└───────────────────────────────────────────────────────────────────┘
                 │  HTTPS (tenant бүрийн API key, IP allowlist)
                 ▼
┌──────────────────────── Монгол дахь дата төв ─────────────────────┐
│  eBarimt Gateway (REST) ──► PosAPI 3.0 (:7080, дотоод сүлжээ)      │
│                         └─► api.ebarimt.mn / service.itc.gov.mn    │
│                             (лавлах сервисүүд: getInfo, БҮНА …)    │
└───────────────────────────────────────────────────────────────────┘
```

### 5.2 Extension-ууд ба хамаарал

| Апп | Хамаарал | Гол агуулга |
|---|---|---|
| MN Core | Base App | tableext (Company Info, Customer, Vendor, Item, VAT Posting Setup, Payment Method), татварын параметрийн хүснэгт, тайлан, Data Exch. Def, ханшийн холболт, setup wizard |
| MN eBarimt | MN Core, E-Document Core | Format + Sender + Actions, setup/POS хүснэгт, лог, мониторинг, тулгалтын тайлан |
| MN Micro Experience | MN Core | Experience tier, Application Area, Role Center, permission set |
| MN Setup Data | MN Core, Contoso Coffee Demo Dataset | CoA, posting бүлэг, НӨАТ, дугаарлалт, хэмжигдэхүүн, төлбөрийн нөхцөл, жишээ өгөгдөл |
| MN Language | Base App, System App, E-Document Core, … | Зөвхөн `Translations/*.mn-MN.xlf` |

**Объектын ID:** AppSource-д гаргах бол Microsoft-оос ID муж авна. Түүнийг авах хүртэл per-tenant муж (50000–99999)-д хөгжүүлнэ.

**Репо:** BCApps маш том (бүх улс) бөгөөд upstream-д хувь нэмэр оруулахын тулд батлагдсан issue шаарддаг. Тиймээс MN аппуудыг **тусдаа AL-Go for GitHub (AppSource template) репод** хөгжүүлж, BCApps fork-ыг лавлах эх код болгон ашиглахыг санал болгоно. Fork дотор prototype хийх бол дараах бүтцийг дагана:

```
src/Apps/MN/
  MNCore/app            MNCore/test
  EBarimt/app           EBarimt/test
  MicroExperienceMN/app
  ContosoCoffeeDemoDatasetMN/app
  LanguageMN/app
build/projects/Apps MN/.AL-Go/settings.json   ← MN artifact байхгүй тул "country": "w1"
```

### 5.3 MN Core — өгөгдлийн загварт нэмэх зүйлс

| Объект | Нэмэх талбар / агуулга |
|---|---|
| tableext Company Information (T79) | ТТД (7/11 орон), улсын бүртгэлийн дугаар, НӨАТ төлөгч (огноотой), НХАТ төлөгч, татварын горим (Ерөнхий / хялбаршуулсан), татварын хэлтэс/дүүрэг |
| tableext Customer (T18) / Vendor (T23) | ТТД/регистр, төрөл (ААН / иргэн / гадаад), НӨАТ төлөгч эсэх (`getInfo`-оор шалгана), eBarimt-ын B2B/B2C шалгуур |
| tableext Item (T27) | БҮНА код (`classificationCode`, 7 орон), татварын барааны код (`taxProductCode`), баркод |
| tableext VAT Posting Setup (T325) | eBarimt `taxType` (VAT_ABLE / VAT_FREE / VAT_ZERO / NOT_VAT), НХАТ % |
| tableext Payment Method (T289) | eBarimt төлбөрийн код (CASH / PAYMENT_CARD / BANK_TRANSFER / BANK_TRANSFER_QPAY) |
| tableext Purchase Header (T38), Purch. Inv. Header (T122) | Нийлүүлэгчийн eBarimt ДДТД (33 орон) |
| table **MN Tax Parameter** | Огноотой параметрүүд: НӨАТ-ын босго, ААНОАТ-ын шатлал, хялбаршуулсан горимын босго, НХАТ-ын хувь |
| Financial Reports | Санхүүгийн байдлын тайлан (СБД), Орлогын дэлгэрэнгүй тайлан (ОДТ), Өмчийн өөрчлөлтийн тайлан (ӨӨТ), Мөнгөн гүйлгээний тайлан (МГТ) |
| Тайлан ба маягт | Кассын орлогын/зарлагын ордер, гүйлгээ баланс (монгол маягт), дансны хуулга, НӨАТ-ын тайлангийн туслах хүснэгт, худалдан авалтын eBarimt тулгалт |
| Data Exch. Def | Хаан, Голомт, ХХБ, Хас, Төрийн банкны хуулгын формат; Монголбанкны ханш |
| Setup wizard | ТТД → `getInfo` → НӨАТ/НХАТ төлөгч эсэхийг автоматаар бөглөнө, CoA багц, санхүүгийн жил (календарийн жил), банк, eBarimt салбар/касс |

### 5.4 MN eBarimt — дизайн

**Холболтын загвар (санал): төвлөрсөн gateway, "оператор" загвар**

- PosAPI 3.0 нь дотоод сүлжээнд `:7080` дээр токенгүй ажилладаг бөгөөд Монголын IP-ээс хандах шаардлагатай. BC online-ийн сервер Azure Asia Pacific-д байрладаг тул шууд хандах боломжгүй.
- Нэг PosAPI ≤ 1,000 мерчант, өдөрт ≤ 100,000 баримтыг дэмждэг. Иймээс **нэг gateway олон бичил бизнест үйлчилж** болно (`saveOprMerchants`-аар мерчант бүртгэнэ).
- Gateway-ийн үүрэг: tenant бүрийн API key-ээр нэвтрэх, IP allowlist, `billIdSuffix`-ээр давхардал (idempotency) шалгах, лог хөтлөх (`qrData`-гүй), `/rest/sendData`-г өдөр бүр дуудах, `/rest/info`-оор мониторинг хийх.
- Өөр хувилбар: том харилцагчид өөрийн байрандаа PosAPI ба gateway (mini PC) суулгана.

**BC тал (E-Document service):**

| Интерфейс | Хэрэгжүүлэлт |
|---|---|
| `"E-Document"` (format, enum 6101) | Posted Sales Invoice/Cr. Memo-оос PosAPI JSON үүсгэнэ. Дэд баримтыг `taxType`-аар салгана. Дүнгийн нийлбэрийн дүрмийг шалгана |
| `IDocumentSender` (enum 6151) | Gateway руу `POST /rest/receipt` илгээнэ |
| `ISentDocumentActions` | Хүчингүй болгох (`DELETE /rest/receipt`), засвар (`inactiveId`) |
| `IExportEligibilityEvaluator` | Аль баримтыг илгээхийг шийднэ (компани, баримтын төрөл, B2B/B2C) |

**Баримтын төрөл сонгох логик:**

- Нэхэмжлэх (зээлээр борлуулалт) → `B2B_INVOICE` / `B2C_INVOICE`. Харилцагчийн ТТД байгаа эсэхээр B2B эсвэл B2C гэж ялгана.
- Төлбөр нэхэмжлэхтэй тулгагдах үед (Cust. Ledger Entry apply) → `*_RECEIPT { invoiceId }`. Энэ урсгалыг §11-ийн C2 асуултаар баталгаажуулна.
- Шууд төлбөртэй борлуулалт → `B2B_RECEIPT` / `B2C_RECEIPT`.
- Credit memo → хэсэгчилсэн бол `inactiveId` (сүүлийн ДДТД), бүтэн бол `DELETE` (B2C). Өмнөх сарынх бол `reportMonth` (сарын 1–7-нд).

**Заавал мөрдөх дүрмүүд:**

1. `qrData` ба `lottery`-г **DB, лог, кэшид хадгалахгүй**.
   - E-Document Core-ийн ClearanceModel модуль posted нэхэмжлэх дээр `"QR Code Base64"` талбар нэмдэг. eBarimt-д **энэ талбарыг ашиглахгүй**.
   - Баримтыг posting хийсэн сешн дотор санах ойн (temporary) буферээр шууд хэвлэнэ.
   - Дахин хэвлэх үед QR-гүй (зөвхөн ДДТД-тай) гаргах эсэхийг СМТТ-өөс тодруулна (posapi@itc.gov.mn).
2. `POST /rest/receipt`-г **автоматаар retry хийхгүй**. E-Document-ийн автомат давталтыг энэ алхамд унтраана. Timeout болбол төлөвийг `UNKNOWN` болгож гараар шийдвэрлүүлнэ.
3. Илгээхийн өмнө валидац хийнэ: `items → receipts → total`-ын нийлбэр, `Σ payments = totalAmount`, `classificationCode` 7 орон, VAT_FREE/ZERO/NOT_VAT үед `taxProductCode` заавал.
4. `billIdSuffix` = POS дугаар + өдрийн дараалал (No. Series-ээр, өдөр бүр шинээр эхэлнэ).
5. Мониторинг: сугалааны үлдэгдэл < 100, илгээгээгүй баримт 3 хоногоос хэтэрсэн, `UNKNOWN` төлөвтэй баримт байвал Role Center дээр анхааруулна.

**Худалдан авалтын тал:** нийлүүлэгчийн нэхэмжлэх дээр ДДТД бүртгэнэ. Сар бүр "Худалдан авалтын eBarimt тулгалт" тайлангаар орцын НӨАТ-ын бичилтийг eBarimt-д баталгаажсан худалдан авалттай тулгана. Тулгах өгөгдлийг e-invoice порталын экспортоос эсвэл боломжтой API-аас авна (тодруулах).

### 5.5 Татварын тохиргооны загвар

**НӨАТ (VAT Posting Setup):**

| VAT Bus. \ VAT Prod. | НӨАТ10 | НӨАТ0 | ЧӨЛӨӨ | НӨАТГҮЙ |
|---|---|---|---|---|
| ДОТООД | 10%, VAT_ABLE | 0%, VAT_ZERO | 0%, VAT_FREE | 0%, NOT_VAT |
| ЭКСПОРТ | — | 0%, VAT_ZERO | — | 0%, NOT_VAT |
| ИМПОРТ | 10% (гаалийн НӨАТ, журналаар) | — | — | — |

- Борлуулалтын үнийг **НӨАТ шингэсэн** байдлаар оруулна (Sales Header/Customer-ийн "Prices Including VAT"). eBarimt бүх дүнг татвар шингэсэн байдлаар авдаг тул энэ нь тохирно.
- **НХАТ:** BC-ийн НӨАТ-ын механизм нэг мөрөнд нэг татвар л тооцдог. Хувилбарууд:
  - (а) VAT Posting Setup-д "НХАТ %" талбар нэмж, борлуулалтын мөрөнд НХАТ-ын дүнг тооцоод, `Sales-Post`-ийн event-ээр НХАТ-ын өглөгийн дансанд бичих.
  - (б) "НХАТ"-ыг тусдаа G/L мөр болгон автоматаар нэмэх.
  - **Санал: (а).** Ү0-ийн spike-аар баталгаажуулна.
- **2027-01-01-ний өөрчлөлт** (2026-06-26-нд батлагдсан; PwC/KPMG):
  - НӨАТ-ын албан журмын бүртгэлийн босго 50 сая → **400 сая ₮** болно.
  - 400 саяас доош борлуулалттай аж ахуйд хялбаршуулсан НӨАТ-ын горим нэвтэрнэ.
  - ААНОАТ 3 шатлалтай болно: 6 тэрбум хүртэл 10%, 6–10 тэрбум 15%, 10 тэрбумаас дээш 25%.
  - Бичил бизнесийн нэлээд хэсэг НӨАТ төлөгчөөс гарч магадгүй. Тиймээс систем **"НӨАТ төлөгч бус" горимыг** бүрэн дэмжих ёстой. Эцсийн хуулийн текстийг legalinfo.mn-ээс баталгаажуулна.

### 5.6 Дансны төлөвлөгөө ба санхүүгийн тайлан

- Сангийн яамны үлгэрчилсэн дансны төлөвлөгөөг Config package болгоно. Кодчилол ба стандартыг (СТОУС эсвэл ЖДҮ-ийн СТОУС) мэргэшсэн нягтлан зөвлөхтэй баталгаажуулна.
- Данс бүрийг G/L Account Category (T570)-ийн дэд ангилалд холбоно. Ингэснээр `Categ. Generate Acc. Schedules` (CU571) суурь тайлангуудыг автоматаар үүсгэнэ. Дараа нь мөр бүрийг маягтын мөртэй тааруулна.
- 4 тайлан + тодруулгыг Financial Reports-оор гаргаж, Excel экспортоор e-balance-д оруулна. e-balance-ийн импортын форматыг Ү0-д шалгана.

### 5.7 Банк, касс, валют

- **Банкны хуулга:** `SimplifiedBankStatementImport` wizard ашиглана. MN Core-д 5 том банкны бэлэн Data Exch. Def-ийг хамт нийлүүлнэ. Payment Reconciliation Journal автоматаар тулгана.
- **Касс:** "КАСС" төрлийн Bank Account үүсгэнэ. Ингэснээр кассын дэвтэр, тулгалт, кассын орлогын/зарлагын ордер бүгд ажиллана.
- **Ханш:** Curr. Exch. Rate Update Setup дээр Монголбанкны албан ханшийг өдөр бүр job queue-ээр татна. Сарын эцэст Exch. Rate Adjustment ажиллуулна.

### 5.8 MN Micro Experience

- **"MN Micro" tier:** `BasicExperience`-ийн загвараар хийнэ. Basic, VAT, Dimensions, Fixed Assets (сонголтоор), Notes-ийг идэвхжүүлнэ. Захиалга, агуулах, үйлдвэрлэл, сервис, төсөл, intercompany-г нууна.
- **"Бичил бизнес" Role Center:** Business Manager (P9022) эсвэл Bookkeeper (P9004)-ийг суурь болгоно.
  - Cue-ууд: төлөгдөөгүй нэхэмжлэх, хугацаа хэтэрсэн авлага, eBarimt хүлээгдэж буй/алдаатай, мөнгөн хөрөнгө, НӨАТ-ын үлдэгдэл.
  - Үйлдлүүд: Нэхэмжлэх, Төлбөр бүртгэх, Банкны хуулга, Худалдан авалт, НӨАТ тайлан, Санхүүгийн тайлан.
- **Permission set багц:**
  - `MN MICRO OWNER`: D365 BUS FULL ACCESS + MN.
  - `MN MICRO ACCOUNTANT`: D365 ACCOUNTANTS + MN.
  - `MN EBARIMT`: зөвхөн eBarimt-ын объектууд.

### 5.9 Монгол хэл

- BC-д өөр аппын caption-ыг орчуулах механизм бий: `dependencies` + `Translations/*.xlf`.
- Microsoft Монгол хэлний орчуулга нийлүүлдэггүй тул partner хийх ёстой. Платформын (системийн) caption англиар үлдэх магадлалтай. Үүнийг Ү0-ийн spike-аар тодруулна.
- Үе шаттай орчуулна:
  1. "MN Micro" tier-д харагдах ~150 хуудас, ~30 тайлан, бүх MN апп.
  2. Үлдсэн хэсгийг аажмаар орчуулна.
- Нэр томьёоны толь (глоссари) бэлдэнэ: General Ledger = Ерөнхий дэвтэр, Trial Balance = Гүйлгээ баланс, Receivables = Авлага, Payables = Өглөг гэх мэт. Машин орчуулгын дараа нягтлан хянана.

---

## 6. Хэрэгжүүлэх үе шат

| Үе шат | Хугацаа | Үр дүн | Дуусгах шалгуур |
|---|---|---|---|
| **Ү0. Бэлтгэл, шинжилгээ** | 2 д.х. | Шаардлагыг баталгаажуулах; eBarimt mapping ярилцлага; CoA ба тайлангийн маягтын mapping; AL-Go репо; BC online MN sandbox; ID муж. **Spike:** gateway холболт, НХАТ загвар, mn-MN хэл | §11-ийн Q1–Q5 шийдэгдсэн; PosAPI staging-д 1 баримт амжилттай |
| **Ү1. MN Core суурь** | 4 д.х. | tableext-үүд, татварын параметр, setup wizard, Config package (CoA, posting бүлэг, НӨАТ, дугаарлалт), Financial Reports (4 тайлан), кассын ордер, гүйлгээ баланс | Шинэ компани wizard-аар 1 цагт тохируулагдана; тестүүд ногоон |
| **Ү2. MN eBarimt** | 5 д.х. | Gateway; E-Document format/sender/actions; нэхэмжлэх→төлбөрийн урсгал; буцаалт/засвар; лог, мониторинг, `sendData` job; худалдан авалтын ДДТД | Staging-д бүх сценари (B2B/B2C, invoice/receipt, буцаалт, засвар, валют) амжилттай |
| **Ү3. Банк, валют, тайлан** | 3 д.х. | 5 банкны хуулгын формат; Монголбанкны ханш; НӨАТ-ын тайлан; худалдан авалтын eBarimt тулгалт; e-balance-ийн Excel экспорт | Нэг сарын хаалт бүрэн давтагдана |
| **Ү4. Micro Experience, хэл** (Ү3-тай зэрэг) | 3 д.х. | Tier, Role Center, permission set, үндсэн дэлгэцийн mn-MN орчуулга | Нягтлан монгол интерфейсээр өдрийн ажлаа хийнэ |
| **Ү5. Пилот** | 4 д.х. | 3–5 бичил бизнес; эхний үлдэгдлийн Excel миграци; бодит eBarimt; 1 сарын хаалт; НӨАТ-ын тайлан илгээх | Пилотын харилцагчид Excel/хуучин системээ хаана |
| **Ү6. Гаргалт** | 2 д.х. | AppSourceCop шалгалт, хэрэглэгчийн гарын авлага, дэмжлэгийн процесс, AppSource-д нийтлэх | AppSource validation давсан |

**Нийт:** ~21–23 долоо хоног. **MVP** (Ү0 + Ү1 + Ү2 + Ү3-ийн НӨАТ-ын тайлан) ≈ 11–12 долоо хоног.

⚠ Ажил 2026 оны 10-р сард эхэлбэл Ү2 ойролцоогоор 2027 оны 1-р сард дуусна. Тиймээс **2027 оны татварын дүрмийг эхнээс нь** загварт тусгана.

---

## 7. Баг ба хэрэгсэл

| Үүрэг | Ачаалал |
|---|---|
| AL ахлах хөгжүүлэгч (архитектур, E-Document, posting) | 1.0 |
| AL хөгжүүлэгч (тайлан, тохиргоо, UI) | 1.0 |
| Gateway хөгжүүлэгч (.NET/Node, DevOps) | 0.5 |
| Функциональ зөвлөх: мэргэшсэн нягтлан, татварын мэргэжилтэн | 0.5–1.0 |
| QA / тест | 0.5 |
| Орчуулга, нэр томьёо | 0.3 |

**Хэрэгсэл:** VS Code + AL Language, AL-Go for GitHub (CI/CD), BC container (W1 29.x artifact) ба BC online sandbox, `src/Tools/Test Framework`, W1 тестийн номын сангууд (`src/Layers/W1/Tests/`), eBarimt staging орчин.

---

## 8. Тест ба чанар

- **Unit/integration тест:** апп бүрт тестийн апп байна (`Library Assert`, `Library - ERM`, `Library - Sales`, `Library - Purchase`). PosAPI/gateway-г `HttpClientHandler`-оор mock хийнэ. CI-д `TestHttpRequestPolicy = BlockOutboundRequests` тохируулна.
- **Бизнесийн сценари (≥ 20):**
  1. B2C бэлэн борлуулалт.
  2. B2B нэхэмжлэх → хэсэгчилсэн төлбөр → бүтэн төлбөр.
  3. Буцаалт (энэ сард / өмнөх сард).
  4. Валютын нэхэмжлэх ба ханшийн тэгшитгэл.
  5. Худалдан авалт → орцын НӨАТ → НӨАТ-ын тооцоо.
  6. Банкны хуулга импорт → автомат тулгалт.
  7. Сарын болон жилийн хаалт.
  8. НӨАТ төлөгч бус компанийн горим.
- **eBarimt:** staging-д бүх төрлийн баримт, алдааны хариуг (дүн таарахгүй, `taxProductCode` дутуу, `billIdSuffix` давхардсан, timeout) шалгана. Staging дээр ачааллын тест хийхгүй.
- **Хүлээн авах тест:** пилот харилцагчийн нягтлан бодит сарын хаалтыг шинэ системээр хийж, хуучин системийн дүнтэй тулгана.

---

## 9. Эрсдэл ба шийдэл

| # | Эрсдэл | Нөлөө | Шийдэл |
|---|---|---|---|
| R1 | PosAPI дотоод сүлжээнд ажилладаг, BC online-оос хандах боломжгүй | Өндөр | Монголд eBarimt Gateway байрлуулна (§5.4); Ү0-д PoC хийнэ |
| R2 | `qrData` хадгалах хориг ба дахин хэвлэх хэрэгцээ хоорондоо зөрчилддөг | Дунд | Posting хийх үед шууд хэвлэнэ; дахин хэвлэхийг СМТТ-өөс бичгээр тодруулна |
| R3 | 2027-01-01-ний татварын өөрчлөлт, цаашдын өөрчлөлтүүд | Өндөр | Огноотой параметрийн хүснэгт; legalinfo.mn-ийг хянана; хуулийн зөвлөх |
| R4 | Лицензийн өртөг бичил бизнест өндөр | Өндөр | Нэг Essentials (нягтлан) + Team Member/M365 read-only (эзэн); нягтлангийн үйлчилгээний компанийн олон компанитай загвар (Q3). Лицензийн нөхцөлийг CSP partner-аар баталгаажуулна |
| R5 | Монгол хэлний платформын орчуулга байхгүй байж магадгүй | Дунд | Ү0 spike; эхлээд апп түвшний орчуулга |
| R6 | НХАТ-ыг BC-ийн НӨАТ механизм дэмждэггүй | Дунд | Тусгай загвар (§5.5), spike |
| R7 | BC-ийн шинэчлэл API-г obsolete болгох | Дунд | AL-Go-оор дараагийн major хувилбарт CI; obsolete анхааруулгыг 0 байлгана |
| R8 | eBarimt-ын баримт бичигт зөрчил байдаг (ж: `unitPrice` татвартай эсэх) | Дунд | Таамаглахгүй; кодонд тэмдэглэнэ; posapi@itc.gov.mn-ээр тодруулна |
| R9 | Хувь хүний мэдээлэл | Дунд | Иргэний регистр, `consumerNo`-г хамгийн бага хэмжээгээр хадгална; Retention Policy |
| R10 | Монголд өөр partner-ийн локалчлал AppSource-д гарах | Бага–Дунд | AppSource-ийг шалгаж, давуу талаа (eBarimt gateway, бичил UX) тодорхойлно |

---

## 10. Төсөвт нөлөөлөх хүчин зүйлс (тооцоолох)

- **Хөгжүүлэлт:** ~3.5 FTE × 5 сар.
- **Gateway-ийн дэд бүтэц:** Монголын дата төвд 2 VM (HA), SSL, мониторинг.
- **BC лиценз:** хэрэглэгч бүрт сар бүр (CSP үнээр). Essentials, Team Member, External Accountant-ийн хослолыг харилцагч бүрээр тооцно.
- **AppSource:** publisher бүртгэл, ID муж, validation.

---

## 11. Нээлттэй асуултууд (шийдвэр шаардлагатай)

| # | Асуулт | Санал |
|---|---|---|
| Q1 | Байршуулалт: BC online + төвлөрсөн gateway уу, эсвэл on-prem (Монголд) уу? | BC online + gateway |
| Q2 | Зорилтот сегмент: зөвхөн үйлчилгээ (НХАТ, бараа хэрэггүй) үү, эсвэл ресторан/худалдаа уу? | MVP-д үйлчилгээ |
| Q3 | Бизнесийн загвар: компани бүр өөрийн tenant уу, эсвэл нягтлангийн үйлчилгээний компани олон компанийг нэг tenant-д хөтлөх үү? | Хоёуланг нь дэмжинэ; пилотыг нягтлангийн компанитай |
| Q4 | eBarimt-ын харгалзуулалт: ТТД-ийн эх үүсвэр (A1), B2B шалгуур (C1), нэхэмжлэх→төлбөрийн урсгал (C2), үнэ татвар шингэсэн эсэх (E1), VAT групп → `taxType` (E4), төлбөрийн хэлбэр (F1), буцаалтын дүрэм (G1) | Ү0-ийн ярилцлагаар |
| Q5 | НББ-ийн стандарт (СТОУС / ЖДҮ-ийн СТОУС) ба тайлангийн маягтын хувилбар | Нягтлан зөвлөх |
| Q6 | Цалинг аль гадны системээс импортлох вэ? | Excel загвар |
| Q7 | Аль банкуудаас эхлэх вэ? | Хаан, Голомт, ХХБ |
| Q8 | `qrData`-г дахин хэвлэх асуудал | СМТТ-ээс бичгээр |
| Q9 | НӨАТ төлөгч бус ААН-ийн eBarimt үүрэг ба `taxType` (2027-оос) | СМТТ, татварын зөвлөх |

---

## 12. Дараагийн 2 долоо хоногийн алхам

1. Q1–Q3-ыг шийдэх.
2. AL-Go репо үүсгэж, BC online MN sandbox (trial) нээх.
3. eBarimt staging-ийн эрх авч, gateway PoC хийх: 1 баримт `POST /rest/receipt` → ДДТД.
4. Нягтлан зөвлөхтэй CoA ба 4 тайлангийн мөрийн mapping хийх.
5. Spike: mn-MN хэлний дэмжлэг, НХАТ-ын загвар, e-balance-ийн импортын формат.

---

## Хавсралт A. BCApps дахь лавлах файлууд

| Сэдэв | Зам |
|---|---|
| Posting engine | `src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al` |
| Sales posting events | `src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al` (`OnAfterPostSalesDoc`) |
| G/L Setup | `src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al` |
| VAT Posting Setup | `src/Layers/W1/BaseApp/Finance/VAT/Setup/VATPostingSetup.Table.al` |
| VAT Report framework | `src/Layers/W1/BaseApp/Finance/VAT/Reporting/` |
| Financial Reports | `src/Layers/W1/BaseApp/Finance/FinancialReports/` |
| Ханшийн үйлчилгээ | `src/Layers/W1/BaseApp/Finance/Currency/UpdateCurrencyExchangeRates.Codeunit.al` |
| Банкны хуулга | `src/Layers/W1/BaseApp/Bank/Statement/ImportBankStatement.Codeunit.al`, `src/Apps/W1/SimplifiedBankStatementImport` |
| Application Area | `src/Layers/W1/BaseApp/Modules/System/ApplicationArea/ApplicationAreaMgmt.Codeunit.al` |
| Basic Experience | `src/Apps/W1/BasicExperience/app/src/codeunit/ExperienceTierBF.Codeunit.al` |
| E-Document интерфейс | `src/Apps/W1/EDocument/App/src/Document/Interfaces/EDocument.Interface.al`, `.../Integration/Interfaces/IDocumentSender.Interface.al` |
| Verifactu (ES) жишээ | `src/Apps/ES/EDocumentFormats/DocumentRegistration/app/src/Core/` |
| CNB ханш (CZ) жишээ | `src/Apps/CZ/CoreLocalizationPack/app/Src/Codeunits/CNBCurrExchRateMgtCZL.Codeunit.al` |
| Улсын extension жишээ | `src/Apps/IS/ISCore/app`, `src/Apps/NO/ElectronicVATSubmission` |
| Демо өгөгдлийн жишээ | `src/Apps/W1/ContosoCoffeeDemoDataset`, `src/Apps/IS/ContosoCoffeeDemoDatasetIS` |
| Дугаарлалт | `src/Business Foundation/App/NoSeries/src/` |
| Цалингийн импорт | `src/Layers/W1/BaseApp/Finance/Payroll/` |
| Суутгах татвар | `src/Apps/W1/WithholdingTax/app` |

## Хавсралт B. Эх сурвалж

- Microsoft Learn: [Country/regional availability and supported languages](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/compliance/apptest-countries-and-translations) (Mongolia: Partner, W1, Available, Asia Pacific)
- Microsoft Learn: [The Basic Experience extension](https://learn.microsoft.com/dynamics365/business-central/ui-extensions-basic-experience) (DK/IS, ≤ 3 хэрэглэгч)
- Microsoft Learn: [Working with translation files](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/developer/devenv-work-with-translation-files)
- Microsoft Learn: [Mock outbound HttpClient calls](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/developer/devenv-httpclient-mock-outbound-calls)
- Microsoft Learn: [Licensing in Business Central](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/deployment/licensing)
- PwC Mongolia: [Key Amendments to the Tax laws in 2026](https://www.pwc.com/mn/en/tax_alerts/tax_alert_04_2026.html); KPMG: [Mongolia tax reform package](https://kpmg.com/us/en/taxnewsflash/news/2026/03/mongolia-tax-reform-package-parliament.html)
- Moore Global: [Mongolia Tax Guide](https://www.moore-global.com/services/tax/international-corporate-tax/mongolia/) (одоогийн 1%-ийн горим ≤ 300 сая ₮, НӨАТ-ын босго 50 сая ₮)
- СМТТ: eBarimt PosAPI 3.0 баримт бичиг (developer.itc.gov.mn)
