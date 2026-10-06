# Нэр томьёоны толь (Glossary)

> **Огноо:** 2026-10-06. **Нэг эх сурвалж:** [DECISIONS.md](./DECISIONS.md).
> Монгол ↔ англи ↔ Business Central (BC)-ийн нэр томьёо. Баримтын багцад монгол нэрийг хэрэглэж, англи нэрийг анх удаа хаалтад бичнэ. Код, хүснэгт, баганын нэрийг англиар үлдээнэ.
> **BC объект** баганад BC-ийн хүснэгт (T), codeunit (CU), тайлан (R), хуудас (P)-ийн дугаарыг W1 Base App-аас бичсэн. "—" = BC-д шууд харгалзах зүйлгүй.
> **Манай систем** баганад DECISIONS.md-ийн шийдвэр эсвэл хүснэгтийн нэрийг заасан.

---

## 1. Нягтлан бодох бүртгэлийн ерөнхий ойлголт

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Нягтлан бодох бүртгэл (НББ) | Accounting, bookkeeping | — | НББ-ийн тухай хууль (2015) |
| Давхар бичилт | Double-entry bookkeeping | — | Гүйлгээ бүр дебит = кредит (D-C5) |
| Хуримтлалын суурь | Accrual basis | — | Мөнгөн суурьтай горим байхгүй |
| Дебит (Дт) | Debit (Dr) | Debit Amount | `amount > 0` (D-C3) |
| Кредит (Кт) | Credit (Cr) | Credit Amount | `amount < 0` (D-C3) |
| Тэмдэгтэй дүн | Signed amount | Amount | `gl_entry.amount`; дебит/кредитийг тэмдгээс гаргана |
| Харьцсан данс | Balancing (contra) account | Bal. Account No. | Журналын мөрийн нөгөө тал |
| Үлдэгдэл | Balance | Balance, Balance at Date | Хадгалахгүй, бичилтээс тооцно |
| Эхний үлдэгдэл | Opening balance | Beginning balance, opening entries | Ашиглалтад орох огноогоор "Эхний үлдэгдэл" журнал (D-D7) |
| Эцсийн үлдэгдэл | Closing balance | Balance at Date | |
| Гүйлгээ (эргэлт) | Turnover, net change | Net Change | Хугацааны дебит ба кредит |
| Анхан шатны баримт | Primary (source) document | — | Order 347-ийн маягт (МХ-1, ТМ-1 г.м.) |
| Нягтлан бодогч | Accountant | Accountant (profile) | Role: Accountant (D-I2) |
| Ерөнхий нягтлан бодогч | Chief accountant | — | Тайланд гарын үсэг зурна |
| Гэрээт нягтлан | Outsourced (external) accountant | External Accountant | Role: External accountant (D-I2) |
| НББ-ийн бодлого | Accounting policy | — | Дансны төлөвлөгөө, өртгийн аргыг тогтооно |
| Бөөрөнхийлөлт | Rounding | Amount Rounding Precision, Invoice Rounding | MNT 0.01; бэлэн мөнгөнд 1.00 сонголттой (D-C2) |
| Нарийвчлал | Precision | Amount Rounding Precision | Дүн `numeric(19,4)`, үнэ `numeric(19,6)`, тоо `numeric(19,5)`, ханш `numeric(38,18)` (D-C1) |
| Мөнгөн дүнг үсгээр | Amount in words | — | Маягт дээр монголоор (төгрөг, мөнгө) |
| Өртөг | Cost | Cost Amount | |
| Орлого | Revenue, income | Income | |
| Зардал | Expense | Expense | |
| Хөрөнгө | Asset | Assets (category) | |
| Өр төлбөр | Liability | Liabilities (category) | |
| Өмч | Equity | Equity (category) | |

## 2. Дансны төлөвлөгөө ба ерөнхий дэвтэр

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Дансны төлөвлөгөө | Chart of accounts (CoA) | G/L Account (T15) | MN seed 4 оронтой, Маягт А-гийн харгалзаатай |
| Данс | Account | G/L Account | |
| Бичилт хийх данс | Posting account | Account Type = Posting | Зөвхөн энэ төрөлд бичилт орно |
| Гарчгийн данс | Heading account | Account Type = Heading | |
| Нийлбэр данс | Total account | Total, Begin-Total, End-Total | D-D1 |
| Хяналтын данс | Control account | Direct Posting = No | Авлага, өглөг, НӨАТ, банк |
| Шууд бичих | Direct posting | Direct Posting | Гар журналаар бичих эсэх |
| Блоклосон данс | Blocked account | Blocked | Устгахын оронд |
| Орлогын тайлангийн данс | Income statement account | Income/Balance = Income Statement | Жилийн хаалтаар тэглэгдэнэ |
| Балансын данс | Balance sheet account | Income/Balance = Balance Sheet | |
| Дансны ангилал | Account category | G/L Account Category (T570) | |
| Маягт А-гийн мөрийн код | Form A line code | — | Данс бүр СБТ/ОДТ-ийн мөртэй |
| Ерөнхий дэвтэр | General ledger (G/L) | G/L Entry (T17) | `gl.gl_entry` |
| Ерөнхий дэвтрийн бичилт | G/L entry | G/L Entry | Append-only (D-C4) |
| Гүйлгээ (ваучер) | Transaction (voucher) | Transaction No. | `transaction_no`; Σ = 0 (D-C5) |
| Бүртгэлийн багц | Register (posting run) | G/L Register (T45) | `gl_register` |
| Бичилтийн дугаар | Entry number | Entry No. | Компани доторх завсаргүй `entry_no` (D-K3) |
| Дэд дэвтэр | Subledger | Cust./Vendor/Bank Ledger Entry | Авлага, өглөг, банк, ҮХ, бараа |
| Дэвтэр (ledger) | Ledger | Ledger entry tables | Append-only хүснэгтүүд |
| Хуримтлагдсан ашиг | Retained earnings | Retained Earnings Acc. | Seed: 3400 |
| Тайлант үеийн ашиг (алдагдал) | Current-year profit (loss) | — | Seed: 3500; жилийн хаалтын данс (D-D4) |
| Орлого, зардлын нэгдсэн данс | Income summary account | — | Seed: 9900 (уламжлалт) |

## 3. Журнал, батлах (posting), буцаалт

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Журнал | Journal | Gen. Journal Template (T80) + Batch (T232) | Нэг `journal` хүснэгт |
| Ерөнхий журнал | General journal | General Journal | |
| Журналын мөр | Journal line | Gen. Journal Line (T81) | |
| Журналын баримт (ваучер) | Journal voucher | Document No. | Завсаргүй дугаартай (D-C7) |
| Стандарт журнал | Standard journal | Standard General Journal | Загвараас хуулах (D-D6) |
| Давтагдах журнал | Recurring journal | Recurring General Journal | R2 (D-D6) |
| Батлах | Posting | Post (CU13 Gen. Jnl.-Post Batch, CU12 Gen. Jnl.-Post Line) | Нэг DB transaction (D-C6) |
| Бичилтийн хөдөлгүүр | Posting engine | Gen. Jnl.-Post Line (CU12) | Бүх баримт нэг engine-ээр |
| Батлахын өмнө харах | Posting preview | Preview Posting (CU19) | Ижил код + ROLLBACK |
| Ваучерийн тэнцвэр | Voucher balance | Balance (LCY), Force Doc. Balance | |
| Буцаалт | Reversal | Reverse Transaction / Register (CU17) | Журналаас үүссэн гүйлгээг (D-D5) |
| Сторно (улаан сторно) | Storno correction | Correction | **Хэрэглэхгүй**: буцаалт эсрэг баганад (D-C3) |
| Засварлах баримт | Correcting (adjusting) entry | — | Хаалттай үеийн алдааг одоогийн үед |
| Эх сурвалжийн код | Source code | Source Code (T230) | GENJNL, SALES, REVERSAL г.м. хаалттай жагсаалт |
| Шалтгааны код | Reason code | Reason Code (T231) | Кредит нот ба буцаалтад заавал |
| Системийн үүсгэсэн бичилт | System-created entry | System-Created Entry | Хяналтын дансанд бичиж болно |
| Хаалтын бичилт | Closing entry | Closing-date (C-date) entry | `is_closing = true`, 12-31 (D-D4) |
| Дугаарын цуврал | Number series | No. Series (T308), No. Series Line (T309) | `PREFIX-YYYY-#####` |
| Завсаргүй дугаарлалт | Gapless numbering | No. Series (Normal implementation) | Posting transaction доторх түгжигдсэн counter (D-C7) |
| Ноорог | Draft | Open document | Хуулийн бус дугаартай |

## 4. Үе ба хаалт

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Санхүүгийн жил | Fiscal year | Accounting Period (New Fiscal Year) | Хуанлийн жил (`fiscal_year`) |
| Тайлант үе (сар) | Accounting period | Accounting Period (T50) | `accounting_period` |
| Нээлттэй үе | Open period | — | Posting зөвшөөрнө |
| Хаалттай үе | Closed period | Closed (BC-д posting-ийг хаадаггүй) | Posting хориотой; Owner шалтгаантай нээнэ (D-D3) |
| Түгжигдсэн үе | Locked period | Date Locked | Тайлан илгээсний дараа; UI-аар нээхгүй |
| Үе хаах | Period close | Close Fiscal Year (CU6) | Сарын хаалтын шалгах хуудастай |
| Жилийн хаалт | Year-end close | Close Income Statement (R94) | |
| Posting огнооны цонх | Allowed posting date range | Allow Posting From/To (G/L Setup, User Setup) | Компанийн цонх R1, хэрэглэгчийн цонх R2 |
| Хаалтын шалгах хуудас | Close checklist | — | Банк, eBarimt, НӨАТ, Маягт А-гийн харгалзаа |

## 5. Борлуулалт ба худалдан авалтын баримт

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Нэхэмжлэх | Invoice | Sales Invoice | Маягт ТМ-1 |
| Борлуулалтын нэхэмжлэх | Sales invoice | Sales Header (T36) / Sales Invoice Header (T112) | |
| Худалдан авалтын нэхэмжлэх | Purchase invoice | Purchase Header (T38) / Purch. Inv. Header (T122) | |
| Кредит нот (буцаалтын баримт) | Credit memo | Sales Cr.Memo Header (T114), Purch. Cr. Memo Hdr. (T124) | Эх нэхэмжлэхтэй тулгагдана (D-F6) |
| Нэхэмжлэх цуцлах | Cancel invoice | Correct Posted Sales Invoice (CU1303), Cancel | Бүтэн кредит нот |
| Нэхэмжлэх засах | Correct invoice | Correct Posted Sales Invoice (CU1303), Correct | Цуцлах + шинэ ноорог |
| Батлагдсан баримт | Posted document | Posted Sales Invoice | Өөрчлөгдөхгүй |
| Баримтын мөр | Document line | Sales Line (T37) | |
| Мөрийн хөнгөлөлт | Line discount | Line Discount % | Анхдагчаар цэвэр дүнгээр (D-F2) |
| Нэхэмжлэхийн хөнгөлөлт | Invoice discount | Invoice Discount | R2 |
| Төлбөрийн хөнгөлөлт | Payment discount | Payment Discount | v1-д байхгүй |
| Үнэ НӨАТ-тэй | Prices including VAT | Prices Including VAT | |
| Төлбөрийн нөхцөл | Payment terms | Payment Terms (T3) | |
| Төлөх огноо | Due date | Due Date | |
| Төлбөрийн хэлбэр | Payment method | Payment Method (T289) | Balancing account-тай |
| Бэлэн борлуулалт | Cash sale | Bal. Account on sales header | Нэхэмжлэх + автомат төлбөр (D-F5) |
| Захиалга | Order | Sales Order, Purchase Order | R3 |
| Үнийн санал | Quote | Sales Quote | R3 |
| Нийлүүлэгчийн нэхэмжлэхийн дугаар | Vendor invoice number | Vendor Invoice No. | Заавал, давхардахгүй |
| Гадаад баримтын дугаар | External document number | External Document No. | |
| Худалдан авагч ба төлөгч | Sell-to and bill-to customer | Sell-to / Bill-to Customer | Салгахгүй (D-A5) |

## 6. Харилцагч, авлага, өглөг, тулгалт

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Харилцагч (худалдан авагч) | Customer | Customer (T18) | `party` schema |
| Нийлүүлэгч | Vendor (supplier) | Vendor (T23) | |
| Авлага | Accounts receivable (A/R) | Receivables Account | |
| Өглөг | Accounts payable (A/P) | Payables Account | |
| Харилцагчийн дэвтрийн бичилт | Customer ledger entry | Cust. Ledger Entry (T21) | `cust_ledger_entry` |
| Нийлүүлэгчийн дэвтрийн бичилт | Vendor ledger entry | Vendor Ledger Entry (T25) | `vendor_ledger_entry` |
| Дэлгэрэнгүй бичилт | Detailed ledger entry | Detailed Cust. Ledg. Entry (T379), Detailed Vendor Ledg. Entry (T380) | Үлдэгдэл үүнээс тооцогдоно (D-F3) |
| Тулгалт | Application | Apply Entries | |
| Тулгалтыг буцаах | Unapplication | Unapply Entries | LIFO |
| Тодорхой баримтад тулгах | Apply to a document | Applies-to Doc. No. | |
| Олон баримтад хуваарилах | Apply by ID (allocation) | Applies-to ID | `application_draft` |
| Үлдэгдэл дүн | Remaining amount | Remaining Amount | |
| Урьдчилгаа төлбөр | Advance payment | Open payment entry | D-F4 |
| Насжилт | Aging | Aged Accounts Receivable (R120) / Payable (R322) | 0–30 / 31–60 / 61–90 / 90+ (D-F7) |
| Харилцан суутгал | Netting (offset) | — | R2 (D-F8) |
| Дансны хуулга (харилцагчийн) | Customer statement | Standard Statement (R1316) | |
| Тооцоо нийлсэн акт | Balance confirmation (reconciliation act) | — | Маягт ТМ-2…ТМ-4-ийн нэг |
| Харилцагчийн posting group | Customer posting group | Customer Posting Group (T92) | Авлагын данс |
| Нийлүүлэгчийн posting group | Vendor posting group | Vendor Posting Group (T93) | Өглөгийн данс |

## 7. Дансны тодорхойлолт (account determination)

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Бичилтийн бүлэг | Posting group | Posting Group | |
| Бизнесийн ерөнхий бүлэг | General business posting group | Gen. Business Posting Group (T250) | Харилцагч талаас |
| Барааны ерөнхий бүлэг | General product posting group | Gen. Product Posting Group (T251) | Бараа/данс талаас |
| Ерөнхий posting-ийн тохиргоо | General posting setup | General Posting Setup (T252) | `'*'` fallback-тай (D-F1) |
| Дансны тодорхойлолт | Account determination | — | Ямар дансанд бичихийг сонгох дүрэм |
| Нэхэмжлэхийн posting buffer | Invoice posting buffer | Invoice Posting Buffer (T55) | Мөрүүдийг бүлэглэх |
| Банкны posting group | Bank account posting group | Bank Account Posting Group (T277) | Мөнгөний данс шууд G/L данстай |

## 8. Банк ба касс

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Касс (бэлэн мөнгө) | Cash box (cash on hand) | Bank Account (cash) | `bank_account.kind = CASH` (D-G1) |
| Харилцах данс | Bank (current) account | Bank Account (T270) | `kind = BANK` |
| Хэтэвч | Wallet (QPay, card settlement) | — | `kind = WALLET` (D-G2) |
| Мөнгөний данс | Money account | Bank Account | |
| Кассын орлогын баримт (МХ-1) | Cash receipt voucher | Cash Receipt Journal | Касс бүрд завсаргүй |
| Кассын зарлагын баримт (МХ-2) | Cash payment voucher | Payment Journal | Касс сөрөг болохыг хориглоно |
| Банкны дэвтрийн бичилт | Bank ledger entry | Bank Account Ledger Entry (T271) | `bank_ledger_entry` |
| Банкны хуулга | Bank statement | Bank Account Statement (T275) | |
| Хуулга импорт | Statement import | Import Bank Statement (Data Exchange) | CSV/XLSX wizard, Хаан ба Голомтын preset |
| Банкны тулгалт | Bank reconciliation | Bank Acc. Reconciliation (T273) | |
| Төлбөрийн тулгалтын журнал | Payment reconciliation journal | Payment Reconciliation Journal | Нэг урсгалд нэгтгэсэн |
| Автомат тулгалт | Automatic matching | Match Bank Payments (CU1255) | Оноо = 1000 × (итгэл + 1) − эрэмбэ |
| Текстээс данс руу дүрэм | Text-to-account mapping | Text-to-Account Mapping (T1251) | |
| Тулгалтын бүлэг | Match group | — | Σ мөр = Σ зорилт |
| Кассын тооллого | Cash count | — | |
| Илүүдэл/дутагдал | Cash over/short | — | Тохиргооны данс |
| Шилжүүлэг | Transfer between accounts | — | |
| Төлбөр бүртгэх | Payment registration | Payment Registration (P981) | |
| Төлөх нэхэмжлэхийн санал | Suggest vendor payments | Suggest Vendor Payments (R393) | |
| IBAN | International bank account number | IBAN | Монголд 20 тэмдэгт |

## 9. Татвар

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| НӨАТ (Нэмэгдсэн өртгийн албан татвар) | Value-added tax (VAT) | VAT | 10% |
| Борлуулалтын НӨАТ | Output VAT | Sales VAT Account | |
| Орцын НӨАТ | Input VAT | Purchase VAT Account | Баталгаажсан ДДТД-тэй үед хасагдана (D-E4) |
| Хасагдах НӨАТ | Deductible VAT | — | `deductible_confirmed` |
| Хасагдахгүй НӨАТ | Non-deductible VAT | Non-Deductible VAT | Өртөгт шингэнэ |
| НӨАТ төлөгч | VAT-registered taxpayer | VAT Registration No. | `vat_registered` |
| НӨАТ төлөгч бус | Non-VAT-registered | — | D-E5 |
| 0%-ийн НӨАТ | Zero-rated | VAT Prod. Posting Group (zero) | `VAT0` → `VAT_ZERO` |
| НӨАТ-аас чөлөөлөгдөх | Exempt | VAT Prod. Posting Group (exempt) | `EXEMPT` → `VAT_FREE` |
| НӨАТ-ын хамрах хүрээнээс гадуур | Out of scope | No Taxable VAT | `NOVAT` → `NOT_VAT` |
| Урвуу тооцоолол | Reverse charge | Reverse Charge VAT | Гадаадын үйлчилгээ |
| Гаалийн НӨАТ | Import (customs) VAT | Full VAT | `FULL_VAT` |
| НӨАТ-ын тохиргоо | VAT posting setup | VAT Posting Setup (T325) | Bus. × Prod. матриц (D-E1) |
| НӨАТ-ын бизнесийн бүлэг | VAT business posting group | VAT Business Posting Group (T323) | |
| НӨАТ-ын барааны бүлэг | VAT product posting group | VAT Product Posting Group (T324) | |
| VAT identifier | VAT identifier | VAT Identifier | Баримтын НӨАТ-ыг бүлэглэх түлхүүр |
| НӨАТ-ын бичилт | VAT entry | VAT Entry (T254) | `vat_entry` |
| НӨАТ-ын огноо | VAT date | VAT Reporting Date | = posting огноо (D-E9) |
| НӨАТ-ын тайлан | VAT return | VAT Statement (T255/T256) | ТТ-03а (D-E8) |
| НӨАТ-ын хаалт | VAT settlement | Calc. and Post VAT Settlement (R20) | |
| НӨАТ-ын бүртгэлийн босго | VAT registration threshold | — | 50 сая → 400 сая (2027-07-01) (D-K5) |
| Хялбаршуулсан НӨАТ | Simplified VAT regime | — | 2027, параметрээр |
| НХАТ (Нийслэл хотын албан татвар) | Capital city tax | — | НӨАТ-аас тусдаа (D-E6), R2 |
| ААНОАТ (Аж ахуйн нэгжийн орлогын албан татвар) | Corporate income tax (CIT) | — | |
| ХХОАТ (Хувь хүний орлогын албан татвар) | Personal income tax (PIT) | — | Цалингийн журналд |
| НДШ (Нийгмийн даатгалын шимтгэл) | Social insurance contribution | — | Цалингийн журналд |
| Суутган татвар | Withholding tax (WHT) | — | |
| Онцгой албан татвар (ОАТ) | Excise tax | — | `stockQR` |
| ТТД (Татвар төлөгчийн дугаар) | Taxpayer identification number (TIN) | VAT Registration No. | ААН 11 орон; хувь хүн `civil_id` 12–14 |
| Улсын бүртгэлийн дугаар (регистр) | State registration number | Registration No. | Хувь хүнийх шифрлэгдэнэ |
| Хуулийн параметр | Statutory (legal) parameter | — | `tax_parameter`, огноотой (D-E7) |
| ТТ-03а | VAT return form | — | Дараа сарын 10-ны дотор |
| ТТ-03а-5 / ТТ-03а-6 | Purchases / sales register (VAT) | — | |
| ТТ-02 | CIT return form | — | |
| ТТ-11 | PIT withholding return form | — | |
| Татварын элэгдэл | Tax depreciation | Depreciation Book (tax) | Memo дэвтэр (D-G4) |

## 10. eBarimt

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| eBarimt (и-баримт) | Electronic receipt system | E-Document (ойролцоо) | PosAPI 3.0 |
| PosAPI | PosAPI 3.0 (local REST service) | — | `:7080`, Монголын IP |
| ДДТД | Receipt ID (33 digits) | — | Posted нэхэмжлэх ба логт |
| Төлбөрийн баримт | Receipt | — | `B2C_RECEIPT`, `B2B_RECEIPT` |
| Нэхэмжлэхийн баримт | Invoice receipt | — | `B2C_INVOICE`, `B2B_INVOICE` (R2) |
| Мерчант | Merchant | — | Компани = нэг мерчант |
| Оператор | Operator | — | Олон мерчантын PosAPI-г ажиллуулагч (D-B5) |
| Сугалааны дугаар | Lottery number | — | `lottery`; хадгалахгүй (D-J3) |
| QR өгөгдөл | QR data | — | `qrData`; хадгалахгүй (D-J3) |
| Хэрэглэгчийн дугаар | Consumer number | — | `consumerNo`, 8 орон, зөвхөн B2C |
| БҮНА (Бүтээгдэхүүн, үйлчилгээний нэгдсэн ангилал) | Product classification code | — | `classificationCode`, 7 орон |
| Татварын барааны код | Tax product code | — | `taxProductCode`; 0%, чөлөөлөгдөх, гадуур |
| Татварын төрөл | Tax type | — | `VAT_ABLE`, `VAT_ZERO`, `VAT_FREE`, `NOT_VAT` |
| Дэд баримт | Sub-receipt | — | `receipts[]`, `taxType` бүрд |
| Баримтын давтагдашгүй дагавар | Bill ID suffix | — | `billIdSuffix`, POS бүрийн counter (D-K4) |
| Буцаалтын холбоос | Inactive (replaced) receipt ID | — | `inactiveId` = гинжний сүүлийн ДДТД |
| Тайлант сар | Report month | — | `reportMonth`, сарын 1–7-нд (D-J4) |
| Өгөгдөл илгээх | Data submission | — | `sendData`, 72 цагийн дотор |
| Тодорхойгүй төлөв | Unknown status | — | `UNKNOWN`; гараар шийднэ (D-J2) |
| Outbox | Transactional outbox | — | Commit-ийн дараа илгээх (ADR-0012) |

## 11. Валют

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Валют | Currency | Currency (T4) | |
| Үндсэн валют (төгрөг, ₮) | Local currency (LCY, MNT) | LCY | |
| Гадаад валют | Foreign currency (FCY) | Currency Code | R2 |
| Ханш | Exchange rate | Currency Exchange Rate (T330) | "1 нэгж = X ₮", `numeric(38,18)` |
| Монголбанкны албан ханш | Official Mongolbank rate | — | Өдөр бүр татна, гараар оруулж болно (D-G3) |
| Ханшийн зөрүү | Exchange difference | Gains/Losses | |
| Хэрэгжсэн ханшийн зөрүү | Realized FX gain/loss | Realized Gains/Losses Acc. | Тулгалтаар |
| Хэрэгжээгүй ханшийн зөрүү | Unrealized FX gain/loss | Unrealized Gains/Losses Acc. | Сар/жилийн эцэст |
| Ханшийн дахин үнэлгээ | Exchange rate adjustment | Exch. Rate Adjustment (R596, CU699) | |
| Валютын хүчин зүйл | Currency factor | Currency Factor | BC-д FCY / LCY; манайд ханшаар хадгална |

## 12. Үндсэн хөрөнгө

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Үндсэн хөрөнгө (ҮХ) | Fixed asset (FA) | Fixed Asset (T5600) | R2 |
| Элэгдэл | Depreciation | Depreciation | Шулуун шугам, сар бүр (D-G4) |
| Хуримтлагдсан элэгдэл | Accumulated depreciation | Accum. Depreciation Account | Seed: 1690 |
| Шулуун шугамын арга | Straight-line method | Straight-line | |
| Ашиглалтын хугацаа | Useful life | No. of Depreciation Years/Months | |
| Үлдэх өртөг | Residual (salvage) value | Salvage Value | |
| Дансны үнэ | Book value | Book Value | |
| Капиталжуулах (худалдан авах) | Acquisition | Acquisition Cost | |
| Акталт (данснаас хасах) | Write-off, retirement | Disposal | |
| Худалдаалалт | Sale of an asset | Disposal (Proceeds on Disposal) | Олз/гарз 8600 |
| Үнэ цэнийн бууралт | Impairment (write-down) | Write-Down | |
| Элэгдлийн дэвтэр | Depreciation book | Depreciation Book (T5611), FA Depreciation Book (T5612) | НББ + татварын memo |
| ҮХ-ийн posting group | FA posting group | FA Posting Group (T5606) | 6 данс |
| ҮХ-ийн дэвтрийн бичилт | FA ledger entry | FA Ledger Entry (T5601) | `fa_ledger_entry` |
| ҮХ-1 акт | FA acceptance/transfer certificate | — | Order 347 |

## 13. Бараа материал

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Бараа материал | Inventory | Item, Type = Inventory | R2 (D-G5) |
| Үйлчилгээ | Service item | Item, Type = Service | R1 |
| Нөөцлөгддөггүй бараа | Non-inventory item | Item, Type = Non-Inventory | R1 |
| Хэмжих нэгж | Unit of measure | Unit of Measure (T204) | |
| Барааны дэвтрийн бичилт | Item ledger entry | Item Ledger Entry (T32) | Тоо хэмжээ |
| Үнийн бичилт | Value entry | Value Entry (T5802) | Өртөг |
| Барааны тулгалт | Item application | Item Application Entry (T339) | FIFO-д (R3) |
| Борлуулсан барааны өртөг | Cost of goods sold (COGS) | COGS Account | Seed: 6100 |
| Хөдөлгөөнт жигнэсэн дундаж | Moving weighted average | Costing Method = Average | R2 |
| FIFO (эхэлж орсон нь эхэлж гарах) | First in, first out | Costing Method = FIFO | R3 |
| Тооллого | Physical inventory count | Phys. Inventory Journal | |
| Сөрөг үлдэгдэл | Negative inventory | Prevent Negative Inventory | Хориглоно |
| Агуулах (байршил) | Location (warehouse) | Location (T14) | v1-д нэг |
| Цэвэр боломжит үнэ цэнэ | Net realizable value (NRV) | — | |
| БМ маягт | Inventory receipt/issue form | — | Order 347 |

## 14. Тайлан

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Гүйлгээ баланс (эргэлтийн тайлан) | Trial balance | Trial Balance (R6), Excel-ийн гүйлгээ баланс (тусдаа app) | Эхний, гүйлгээ, эцсийн Дт/Кт |
| Ерөнхий дэвтрийн тайлан | General ledger report | Detail Trial Balance (R4) | |
| Санхүүгийн тайлан | Financial statements | Financial Report (T88) | Маягт А |
| СБТ (Санхүүгийн байдлын тайлан) | Statement of financial position (balance sheet) | Balance Sheet | |
| ОДТ (Орлогын дэлгэрэнгүй тайлан) | Statement of comprehensive income | Income Statement | |
| ӨӨТ (Өмчийн өөрчлөлтийн тайлан) | Statement of changes in equity | Retained Earnings Statement | |
| МГТ (Мөнгөн гүйлгээний тайлан) | Statement of cash flows | Cash Flow Statement | Шууд арга |
| Тодруулга | Notes to the financial statements | — | |
| Маягт А | Form A (annual statement forms) | — | СЯ-ны Order 361 |
| e-balance (и-баланс) | e-balance filing system | — | 2-р сарын 10 |
| Шивэх хуудас | Keying sheet | — | e-balance-ийн дарааллаар, мянган ₮ |
| Харьцуулсан үзүүлэлт | Comparative figures | Comparison Date Formula | |
| Мөрийн тодорхойлолт | Row definition | Acc. Schedule Name/Line (T84/T85) | |
| Баганын тодорхойлолт | Column definition | Column Layout (T333/T334) | |
| Касс, банкны дэвтэр | Cash book, bank book | Bank Account Ledger | Order 100 |
| Борлуулалтын журнал | Sales journal (register) | — | Order 100 |
| Худалдан авалтын журнал | Purchase journal (register) | — | Order 100 |
| Бичилт хайх | Find entries | Navigate (P344) | |
| Архивын багц | Archive package | — | Жил бүр, 10 жил |

## 15. Хэмжигдэхүүн

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Хэмжигдэхүүн | Dimension | Dimension (T348) | |
| Хэмжигдэхүүний утга | Dimension value | Dimension Value (T349) | |
| Хэмжигдэхүүний багц | Dimension set | Dimension Set ID, Dimension Set Entry (T480) | 0 = хоосон (ADR-0010) |
| Глобал хэмжигдэхүүн | Global dimension | Global Dimension 1/2 | 2 ширхэг (D-D2) |
| Анхдагч хэмжигдэхүүн | Default dimension | Default Dimension (T352) | UI R2 |
| Утга бичих дүрэм | Value posting rule | Value Posting (Code Mandatory, Same Code, No Code) | R2 |
| Салбар | Branch (department) | Department | Санал болгох dimension |
| Төсөл | Project | Project | Санал болгох dimension |

## 16. Платформ ба систем

| Монгол | English | BC нэр томьёо / объект | Тайлбар, манай систем |
|---|---|---|---|
| Тенант | Tenant | Tenant (BC SaaS) | SaaS-ийн захиалагч данс, RLS-ийн хил |
| Компани | Company | Company | Нэг ТТД, нэг мерчант (ADR-0005) |
| Хэрэглэгч | User | User | Глобал |
| Гишүүнчлэл | Membership | — | Хэрэглэгч ↔ тенант |
| Эрхийн багц | Permission set | Permission Set | R/I/M/D/X (D-I2) |
| Үүрэг | Role | Profile / User Group | Owner, Accountant, Sales clerk, Viewer, External accountant |
| Эзэмшигч | Owner | SUPER (ойролцоо) | |
| Аудитын лог | Audit log (change log) | Change Log Entry (T405) | `audit.row_change`, 10 жил (D-I3) |
| Нэмэх л боломжтой | Append-only | — | Ledger-ийг засахгүй, устгахгүй (D-C4) |
| Мөрийн түвшний хамгаалалт | Row-level security (RLS) | — | Fail-closed (D-K6) |
| Түгжээ | Advisory lock | LockTable | `pg_advisory_xact_lock` (D-C6) |
| Давхар үйлдлээс хамгаалах түлхүүр | Idempotency key | — | `Idempotency-Key` header (D-I1) |
| Хувилбарын шошго | ETag | @odata.etag | `If-Match` (D-I1) |
| Background job | Background job | Job Queue Entry (T472) | `max_attempts` (D-I6) |
| Компани тохируулах wizard | Setup wizard | Assisted Setup | MN анхдагч тохиргоо |
| Мастер өгөгдөл | Master data | — | Харилцагч, данс, бараа |
| Импорт | Data import | Configuration Package (RapidStart) | Өөрсдийн Excel загвар (D-I5) |
| Нөөц хуулбар | Backup | — | pgBackRest, PITR |
| Гамшгаас сэргээх | Disaster recovery (DR) | — | RPO/RTO |
| Цахим гарын үсэг | Digital (electronic) signature | — | PAdES (ADR-0023) |
| Хувь хүний мэдээлэл | Personal data (PII) | — | Маск ба шифрлэлт |
| Хувилбар | Release | — | R1 (MVP), R2, R3 (D-A3) |

## 17. Хууль, байгууллага, товчлол

| Монгол | English | BC нэр томьёо / объект | Тайлбар |
|---|---|---|---|
| НББ-ийн тухай хууль | Law on Accounting | — | 2015-06-19, хүчинтэй 2016-01-01 |
| СЯ (Сангийн яам) | Ministry of Finance (MoF) | — | Батлагдсан программын жагсаалт |
| МТА (Монгол Улсын татварын алба) | Mongolian Tax Administration (MTA) | — | etax.mta.mn |
| ММНБИ (Монголын мэргэшсэн нягтлан бодогчдын институт) | MonICPA | — | Батлагдсан программын хяналт |
| Монголбанк | Bank of Mongolia (Mongolbank) | — | Албан ханш |
| ITC / СМТТ | eBarimt-ийг хариуцдаг төрийн мэдээллийн технологийн төв | — | developer.itc.gov.mn, posapi@itc.gov.mn |
| ХЭҮК (Хүний эрхийн үндэсний комисс) | National Human Rights Commission | — | Хувь хүний мэдээллийн зохицуулагч |
| ХХМХТХ (Хувь хүний мэдээлэл хамгаалах тухай хууль) | Law on Personal Data Protection | — | 2021-12-17, хүчинтэй 2022-05-01 |
| Order 47 (2018) | MoF Order 47: requirements for accounting software | — | Нийцлийн хаалга G1 |
| Order 361 (2017) | MoF Order 361: financial statement forms (Form A/B) | — | |
| Order 347 (2017) | MoF Order 347: primary document forms | — | МХ-1, МХ-2, ТМ-1, БМ, ҮХ |
| Order 100 (2018) | MoF Order 100: accounting registers | — | |
| СТОУС | International Financial Reporting Standards (IFRS) | — | |
| ЖДҮ-ийн СТОУС | IFRS for SMEs | — | Бичил компанийн суурь |
| ЖДҮ (Жижиг, дунд үйлдвэр) | Small and medium enterprise (SME) | — | Бичил: ≤ 10 ажилтан, ≤ 300 сая ₮ |
| ДАН | State e-ID (single sign-on) | — | Хойшлуулсан |
| ДЦ | Data center | — | Монголд 2 ДЦ |
