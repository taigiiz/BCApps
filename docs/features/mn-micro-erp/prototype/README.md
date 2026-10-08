# Бичил ERP — тайлбартай UI прототип

Энэ хавтас нь Монголын бичил бизнест зориулсан, Business Central (BC)-ийн нягтлан бодох логикийг дахин бичсэн бие даасан multi-tenant ERP-ийн **дэлгэцийн прототип** юм. Прототип нь бодит бүтээгдэхүүн шиг харагдаж, ажилладаг; өгөгдөл нь **зохиомол** ("Наран Түмэн ХХК", ТТД `00000000099`). Дэлгэц бүрд тайлбар (Тайлбар горим) байгаа бөгөөд тайлбар бүр хөгжүүлэлтийн баримтын (`../*.md`) тодорхой хэсэг, дүрмийн ID, DB хүснэгттэй холбогдоно.

> Жишээ өгөгдөл — бодит компани биш. Харин дансны төлөвлөгөө, posting-ийн тохиргоо, НӨАТ-ын матриц, дугаарын цуврал, Маягт А ба ТТ-03а-гийн мөрүүд нь `../db/seed/*.sql`-ээс 1:1 хуулагдсан.

## 1. Хэрхэн нээх

| Арга | Юу хийх |
|---|---|
| Локалаар | `standalone.html`-ийг браузерт нээнэ (бүх CSS, JS дотроо; интернэтгүй үед фонт нь fallback-аар). |
| Дахин угсрах | `python3 build_standalone.py` — `app.html`-ийн дарааллаар бүх файлыг inline хийж `standalone.html`-ийг дахин бичнэ. |
| claude.ai Artifact | `app.html` нь зөвхөн хуудасны агуулга (`<!doctype>`, `<head>`, `<body>`-гүй); бусад файл (`styles.css`, `css/*`, `js/**`) `files`-ээр нийтлэгдэнэ. |
| Хөдөлгүүрийн тест | `node tests/engine_check.js` (Node 18+). |

Чиглүүлэлт нь зөвхөн `#token` hash (`#home`, `#sales-invoice` …). Бичлэгийн сонголт (аль ноорог, аль баримт) нь хуудасны санах ойд (`ERP.app.ctx`) байна.

## 2. Дэлгэцүүд

| Зам | Дэлгэц | Төлөв | Файл |
|---|---|---|---|
| `#home` | Нүүр (Эзэн / Нягтлан role center: cue, сарын борлуулалтын график, хугацаа хэтэрсэн топ 5, 9-р сарын хаалтын шалгах хуудас) | Бүтээгдсэн | `js/screens/home.js` |
| `#sales-invoices` | Борлуулалтын нэхэмжлэх: ноорог / батлагдсан / кредит нот | Бүтээгдсэн | `js/screens/sales.js` |
| `#sales-invoice` | Нэхэмжлэхийн ноорог: харилцагч, огноо, нөхцөл, "Үнэ НӨАТ-тэй", eBarimt төрөл, мөрүүд, шууд тооцоо, FactBox, "Тооцоог харах", урьдчилан харах, батлах (F9) | Бүтээгдсэн | `js/screens/sales.js` |
| `#posted-invoice` | Батлагдсан нэхэмжлэх: төлбөрийн ба eBarimt төлөв, төлөвийн түүх, PosAPI JSON, бичилтүүд, хэвлэх цонх (QR-тай нэг удаа / QR-гүй хуулбар) | Бүтээгдсэн | `js/screens/sales.js` |
| `#credit-memo` | Кредит нот: эх нэхэмжлэхээс мөр хуулах, буцаах тоо, шалтгаан, автомат тулгалт, eBarimt-ийн засварын гинж | Бүтээгдсэн | `js/screens/sales-ar.js` |
| `#customers`, `#customer` | Харилцагчийн жагсаалт ба насжилт; карт (бичилт + detailed, насжилт, тулгалт/тулгалт цуцлах, дансны хуулга) | Бүтээгдсэн | `js/screens/sales-ar.js` |
| `#cust-apply` | Төлбөр бүртгэх ба тулгах (Applies-to ID) | Бүтээгдсэн | `js/screens/sales-ar.js` |
| `#purchase-invoices`, `#purchase-invoice` | Худалдан авалтын жагсаалт, ноорог засварлагч, ДДТД, орцын НӨАТ баталгаажуулах | Бүтээгдсэн | `js/screens/sales-ar.js` (`js/screens/purchases.js`-ийн анхны жагсаалтыг дарж бүртгэнэ) |
| `#cash`, `#bank-rec` | Кассын баримт МХ-1/МХ-2 ба кассын дэвтэр; хуулга импорт, автомат тулгалт, тулгалтын тайлан | Бүтээгдсэн | `js/screens/cash-bank.js` |
| `#ebarimt` | eBarimt хяналт: төлөв, UNKNOWN/ERROR шийдвэрлэх, засварын гинж | Бүтээгдсэн | `js/screens/sales-ar.js` |
| `#coa`, `#journal`, `#trial-balance`, `#periods` | Дансны төлөвлөгөө, ерөнхий журнал ба буцаалт, гүйлгээ баланс, үе ба хаалт | Бүтээгдсэн | `js/screens/gl.js` |
| `#financial-statements`, `#vat-return`, `#setup` | Маягт А (СБТ/ОДТ/ӨӨТ/МГТ, e-balance), ТТ-03а ба НӨАТ-ын хаалт, компани тохируулах wizard | Бүтээгдсэн | `js/screens/reports-tax.js` |
| `#notes` | Тайлбарын жагсаалт: бүлгээр, шүүлтүүртэй (дүрэм, хүснэгт, BC объект) | Бүтээгдсэн | `js/screens/system.js` |
| `#checks` | Хөдөлгүүрийн инвариант (PASS/FAIL) | Бүтээгдсэн | `js/screens/system.js` |

Цэс нь 15 §2.3-ын мэдээллийн архитектурын дарааллыг дагана (Борлуулалт → Худалдан авалт → Мөнгө → eBarimt → Санхүү → Татвар → Хаалт → Тайлан → Тохиргоо); прототипт бүтээсэн дэлгэцүүд л цэсэнд байна (UX-NAV-06: "Удахгүй" цэс харуулахгүй). Замын мөрийн сүүлийн хэсэг нь бичлэг (баримтын дугаар, харилцагчийн нэр, UX-NAV-07).

Туршиж үзэх урсгал: **Нүүр → "+ Шинэ нэхэмжлэх"** эсвэл **Борлуулалт → Нэхэмжлэх → DSI-000036** (FR-SAL-003-ийн бөөрөнхийлөлтийн жишээ) → мөр өөрчлөх → "Тооцоог харах" → "Урьдчилан харах" → **Батлах (F9)** → батлагдсан баримт ба eBarimt-ийн төлөв → `#checks` (бүх инвариант PASS хэвээр). Бэлэн B2C ноорог DSI-000035-ийг батлахад QR-тай хэвлэх цонх нээгдэнэ.

## 3. Тайлбар хэрхэн ажилладаг

- Дээд мөрний **Тайлбар** товч (анх нээхэд асаалттай) тайлбарын горимыг асаана/унтраана.
- Тайлбартай элемент `data-note="<id>"` шинжтэй. Горим асаалттай үед дугаартай шар тэмдэг гарна; тэмдэг эсвэл элементийг (товч, оролтоос бусад хэсгийг) дарахад баруун талд (утсанд доороос) тайлбарын самбар нээгдэнэ.
- Тайлбар бүр: **Юу хийдэг вэ**, **Яагаад**, **BC-д** (дуурайсан BC объект), **Дүрэм** (BR-*, D-*, FR-*, INV-* г.м.), **Өгөгдөл** (`schema.table.column`), **Баримт** (`../<file>.md#<гарчиг>` холбоос).
- Дэлгэц бүр **"Энэ дэлгэц"** танилцуулгатай (хураах боломжтой, байдал нь `localStorage`-д).
- Тооцоолол ажилладаг газарт **"Тооцоог харах"** дэлгэх хэсэг жинхэнэ тоогоор алхам алхмаар харуулна: мөрийн дүн, НӨАТ-ын бүлэг ба running remainder хуваарилалт, данс тодорхойлолт, CUE-04, eBarimt-ийн нийлбэрийн гинж, гүйлгээ балансын нийлбэр.
- `#notes` бүх тайлбарыг бүлгээр; `#checks` инвариантуудыг шууд ажиллуулна.
- `tests/engine_check.js` тайлбар бүрийн `doc.section` нь тухайн md файлд яг ийм гарчигтай байгааг, мөн markup дахь бүх `data-note` бүртгэлтэй эсэхийг шалгана.

## 4. Юу нь жинхэнэ логик, юу нь mock

| Жинхэнэ (js/engine.js) | Mock / хялбарчилсан |
|---|---|
| Мөнгө: бүхэл цент, бүтээгдэхүүн/хуваалтад BigInt, тэгээс холдуулж бөөрөнхийлөх (06 §6.1) | Сервер, DB, RLS, эрх, idempotency, outbox — бүгд санах ойд |
| Мөрийн дүн C1–C3, НӨАТ VAT identifier-ээр, running remainder, сөрөг бүлгийн carry, "Үнэ НӨАТ-тэй" (D-E3, BR-SAL-18..27) | PosAPI: хариу симуляц (ДДТД 33 оронтой хуурамч), PENDING → SENT → SUCCESS/ERROR/UNKNOWN |
| Данс тодорхойлолт: General Posting Setup (`*` нөөц мөртэй), VAT Posting Setup, харилцагч/нийлүүлэгч/банкны posting group (D-F1) | QR: `qrData`-аас зурсан **жишээ дүрслэл** (бодит QR биш) |
| Ваучерын posting: шалгалтыг цуглуулах, тэнцэл, завсаргүй цуврал, entry/transaction/register дугаар, G/L, VAT, авлага/өглөг (header + detailed), банк/касс, МХ-1/МХ-2 | Цалингийн тооцоо (гаднаас импортолсон журнал, PAYROLLJNL) |
| Бэлэн борлуулалт (2 дахь ваучер, ижил SI дугаар), кредит нотын автомат тулгалт, тулгалт/unapply (LIFO), буцаалт (D-D5) | Элэгдэл гар журналаар (FA модуль R2) |
| НӨАТ-ын сарын хаалт (2300/1300 → 2310) ба төлөлт, ТТ-03а (R-VAT-26/27-ийн тэмдэг) | Банкны хуулга: бичигдсэн банкны бичилт + `bankStatementExtras` |
| Гүйлгээ баланс, Маягт А СБТ/ОДТ/МГТ (seed-ийн мөр, шүүлтүүр, томьёо), насжилт, cue, сарын хаалтын шалгах хуудас | Хэрэглэгч, үүрэг (Эзэн/Нягтлан) нь зөвхөн нүүрийн хувилбар |
| eBarimt JSON (12 §5–§6: receipts/items/payments, STRICT_SPLIT, сөрөг мөр шингээх, AMT-03 гинж), `qrData`/`lottery` хадгалахгүй | Огноо: бизнесийн "өнөөдөр" = 2026.10.08 (тогтмол) |

Эх гүйлгээнүүд (`js/data.js`, `ERP.data.sources`): эхний үлдэгдэл (OB), 27 борлуулалтын нэхэмжлэх, 3 кредит нот, 14 худалдан авалт (ДДТД-тэй/гүй), харилцагчийн ба нийлүүлэгчийн төлбөр, банкны шимтгэл ба хүү, кассын зарлага, касс → банк шилжүүлэг, сар бүрийн цалингийн журнал ба төлөлт, улирлын элэгдэл, 1–8-р сарын НӨАТ-ын хаалт ба төлөлт. Хөдөлгүүр эхлэхдээ эдгээрийг огнооны дарааллаар батална; ямар ч тайлангийн тоо хатуу бичигдээгүй.

## 5. Файлын бүтэц ба эзэмшил (FILE OWNERSHIP)

Дараагийн builder-ууд **зөвхөн өөрийн файлыг** засна; хуваалцсан файлыг (`styles.css`, `js/data.js`, `js/engine.js`, `js/annotations.js`, `js/app.js`, `app.html`, `build_standalone.py`) засах шаардлагагүй.

| Файл | Эзэмшигч | Агуулга |
|---|---|---|
| `app.html`, `styles.css`, `js/data.js`, `js/engine.js`, `js/annotations.js`, `js/app.js` | Суурь (foundation) | Хуваалцсан — өөрчлөхгүй |
| `js/screens/home.js`, `js/notes/home.js`, `css/home.css` | Суурь | Нүүр |
| `js/screens/sales.js`, `js/notes/sales.js`, `css/sales.css` | Суурь | Нэхэмжлэхийн урсгал, eBarimt хэвлэх |
| `js/screens/purchases.js`, `js/notes/purchases.js` | Суурь | Худалдан авалтын жагсаалт |
| `js/screens/system.js` | Суурь | `#notes`, `#checks` |
| **`js/screens/gl.js`**, `js/notes/gl.js`, `css/gl.css` | GL builder | `#coa`, `#journal`, `#trial-balance`, `#periods` |
| **`js/screens/sales-ar.js`**, `js/notes/sales-ar.js`, `css/sales-ar.css` | Sales/AR builder | `#customers`, `#customer` (карт, тулгалт), батлагдсан баримтын жагсаалт, кредит нот, `#ebarimt` |
| **`js/screens/cash-bank.js`**, `js/notes/cash-bank.js`, `css/cash-bank.css` | Cash/bank builder | `#cash` (МХ-1/МХ-2), `#bank-rec` (хуулга импорт + тулгалт) |
| **`js/screens/reports-tax.js`**, `js/notes/reports-tax.js`, `css/reports-tax.css` | Reports/tax builder | `#financial-statements`, `#vat-return`, `#setup` |

Бүх area файл одоо `ERP.app.registerScreen({...})`-ээр бүрэн дэлгэцээ бүртгэсэн (stub үлдээгүй). Бүх файл `app.html`-д ачаалах дарааллаараа орсон (`data → engine → annotations → notes/* → app → screens/*`), `build_standalone.py` ижил дарааллыг `app.html`-ээс уншина.

## 6. Нийтийн API (builder-ууд зөвхөн эдгээрийг хэрэглэнэ)

### 6.1 `ERP.app` (js/app.js)

| Функц | Тайлбар |
|---|---|
| `registerScreen({ route, title, crumbs, intro, owner, render(el, ctx), crumbRecord?(ctx), onLeave? })` | Дэлгэц бүртгэх. `route` нь bare `#token`. `crumbs` = `[['Бүлэг'], ['Хуудас', 'route?']]`. `intro` = 2–4 өгүүлбэр (HTML зөвшөөрнө). `render` нь хоосон контейнерт зурна. `crumbRecord` нь замын мөрийн сүүлийн хэсэгт бичлэгийн нэр/дугаар буцаана (UX-NAV-07). |
| `stub({ route, title, crumbs, intro, owner, plan })` | "Удахгүй" placeholder. |
| `navigate(route, ctxPatch?)` | `ERP.app.ctx`-д утга тавиад шилжинэ (жишээ `navigate('posted-invoice', { postedNo: 'SI-2026-00001' })`). |
| `refresh()` | Одоогийн дэлгэцийг дахин зурна. |
| `decorateNotes(root?)` | Хэсэгчлэн дахин зурсны дараа тайлбарын тэмдгийг шинэчилнэ. |
| `openNote(id)`, `closeNote()` | Тайлбарын самбар. |
| `ctx` | Дэлгэц хоорондын контекст: `draftNo`, `postedNo`, `customerNo`, `salesTab` г.м. Шинэ түлхүүрийг area-ийн угтвартай нэрлэнэ. |
| `state.role` | `'OWNER' | 'ACCOUNTANT'`. |

### 6.2 `ERP.ui` (js/app.js)

`esc(s)`, `money(cents, { sym, blankZero })`, `moneyCell(cents, opts)` (`<td class="num">`), `date('YYYY-MM-DD') → 'YYYY.MM.DD'`, `parseDate(text) → ISO | null`, `dateInput(id, iso)`, `pill(status, text?)` (`DRAFT, POSTED, UNPAID, OVERDUE, PARTIALLY_PAID, PAID, PENDING, SENT, SUCCESS, ERROR, UNKNOWN, CORRECTED, OPEN, CLOSED, SUBMITTED, PASS, FAIL, OK, WARNING, BLOCKING` …), `pillLabel(status)`, `calc(summary, html)` ("Тооцоог харах"), `errList(errors)`, `warnList(warnings)`, `json(obj)`, `copy(text, button)`, `toast(html, 'error'?)`, `modal({ title, body, wide, footer:[{label, kind, id, onClick(close)}], onRequestClose, onClose })`, `confirm({ title, body, ok, cancel, danger }) → Promise<bool>`, `$`, `$$`.
`alert/confirm/prompt`, `window.print`, `<a download>` хэрэглэхгүй; form бүр `preventDefault`; оролт бүр тогтвортой `id`-тай.

### 6.3 `ERP.notes` (js/annotations.js)

`register(screenKey, groupTitle, { id: { title, what, why, bc, rules: [], data: [], doc: [{ file, section }] } })`, `get(id)`, `all()`, `byScreen()`, `slug(heading)`, `link(doc)`. `doc.section` = md файлын **яг** гарчиг (`#`-гүй). `data-note`-ийг контейнер элементэд (div, section, span, label, th, td) тавина.

### 6.4 `ERP.engine` (js/engine.js)

Бүх дүн **бүхэл цент** (Number); G/L-д Дт +, Кт −. Огноо `'YYYY-MM-DD'` string. Алдаа `{ code, message, field?, line? }`.

| Хэсэг | Функц |
|---|---|
| Мөнгө | `money.toCents(str)`, `money.fmt(cents, { sym, blankZero })`, `money.compact(cents)`, `money.parseScaled(str, scale) → BigInt`, `money.roundDiv(n, d)`, `money.fmtQty`, `money.fmtPrice`, `money.fmtRatio(num, den, digits)` |
| Огноо | `dates.fmt`, `dates.addDays`, `dates.daysBetween(a, b)`, `dates.endOfMonth`, `dates.calcDate(formula, date)`, `dates.monthLabel('2026-09')` |
| Тохиргоо | `setup.account(no)`, `setup.accounts()`, `setup.customer(no)`, `setup.vendor(no)`, `setup.item(no)`, `setup.bank(no)`, `setup.genPostingSetup(bus, prod)`, `setup.vatSetup(bus, prod)`, `setup.bankGlAccount(bankNo)`, `setup.receivablesAccount(cpg)`, `setup.payablesAccount(vpg)`, `setup.vatLabel(setup)` |
| Тооцоо | `calcDocument({ side:'SALE'|'PURCHASE', docType, pricesInclVat, vatBus, genBus, lines:[{ type:'ITEM'|'GL_ACCOUNT', no, qty, price, disc, vatProd?, classificationCode? }] })` (бүлэг = VAT identifier × тооцооны төрөл × тэмдэг, BR-TAX-18) → `{ lines, groups (alloc алхамтай), amount, vatAmount, amountInclVat, vatByIdentifier, errors }`; `itemPriceFor(item, piv, vatBus)` |
| Ноорог | `drafts.list()`, `drafts.get(no)`, `drafts.create(customerNo, { docType, documentDate, postingDate, lines, appliesTo, reason })`, `drafts.setCustomer(d, no)`, `drafts.setPricesInclVat(d, piv, recalc)`, `drafts.addLine(d, line)`, `drafts.setLineNo(d, i, type, no)`, `drafts.removeLine(d, i)`, `drafts.remove(no)`, `drafts.dueDate(d)`, `drafts.calc(d)`, `drafts.resolvedEbarimtType(d)` |
| Борлуулалт | `sales.precheck(d)`, `sales.preview(d)` → `{ ok, result (дугаар '***'), calc, ebarimtRequest }`, `sales.post(d, { interactive:true })` → `{ ok, posted, ebarimt, printPayload? }`, `sales.postedInvoices()`, `sales.postedCreditMemos()`, `sales.getPosted(no)`, `sales.paymentStatus(posted)` → `{ status, badge, remaining }`, `sales.customerBalance(no, asOf)` |
| Худалдан авалт | `purchases.post({ id, date, vend, vendorInvoiceNo, lines, ddtd, confirm }, { preview })`, `purchases.list()`, `purchases.confirmInputVat(no, ddtd)` |
| Мөнгө | `payments.receipt({ date, bank, cust, amount?, appliesTo?, cf? })`, `payments.vendorPayment({ date, bank, vend, amount?, appliesTo, cf? })`, `payments.bankGl({ date, bank, acc, amount, desc, party, cf? })` (`cf` = банкны бичилтийн МГТ-ийн ангиллын override, BR-RPT-73), `payments.transfer({ date, from, to, amount, desc })` — бүгд `(o, { preview })` |
| Журнал | `journal.post({ date, series:'GJ'|'OB', source, desc, reason, lines:[{ acc|bank|cust|vend, amt, desc, … }] }, { preview })` |
| Дэд дэвтэр | `ledger.applyCustomer(newEntryNo, [targetEntryNo | { entryNo, amount }], date, { preview })` (харилцагч, авлагын данс, огноо, тэмдгийг шалгана; G/L-гүй, `transactionNo = null`), `ledger.applyVendor(...)`, `ledger.unapplyCustomer(applicationNo, date)` → `{ undoApplicationNo }` (толин тусгал мөр шинэ application №-тэй, BR-AR-44/45), `ledger.unapplyVendor(...)`, `ledger.reverseTransaction(txNo, reasonCode, { preview })` |
| НӨАТ | `vat.settlementPlan(period)`, `vat.settle(period, date, { preview })` (scope 08 §5.9: нээлттэй үе = оноогдоогүй, `vat_date ≤ үеийн төгсгөл`; хаагдсан үе = оноогдсон entry), `vat.pay(period, date, bank)`, `vat.periods()`, `vat.entries()`, `vat.unconfirmedInput(upTo)` |
| Тайлан | `reports.glBalance(filter, to, from, { onlyOpening, excludeOpening, excludeClosing })`, `reports.bankBalance(bank, asOf)`, `reports.trialBalance({ from, to })`, `reports.financialStatement('SBT'|'ODT'|'MGT', { asOf })` → `{ columns, rows, values, displayValue(row, colId) }`, `reports.cashFlow({ from, to })`, `reports.vatReturn('2026-09')`, `reports.aging('customer'|'vendor', asOf)`, `reports.salesByMonth(2026)`, `reports.accountEntries(no, from, to)`, `reports.bankStatement(bank, 'YYYY-MM')` |
| eBarimt | `ebarimt.documents()`, `ebarimt.get(id)`, `ebarimt.buildRequest(doc)`, `ebarimt.chainOk(request)`, `ebarimt.dispatch(id)`, `ebarimt.chainStatus(posted)`, `ebarimt.decideType(requested, customer)`, `ebarimt.itemsFromLines(lines)` |
| Нүүр | `home.cues()` (CUE-01..17), `home.closeChecklist('2026-09')` |
| Бусад | `post(postingDocument, { preview })` (доод түвшний ваучер), `invariants()`, `periods.list()`, `periods.of(date)`, `periods.setStatus(period, status)`, `state()` (уншихад л; ledger-ийг шууд өөрчлөхгүй), `boot()` |

`printPayload` (`qrData`, `lottery`) нь `sales.post`-ын хариунд л ирнэ; дэлгэц үүнийг өөрийн closure хувьсагчид барьж, цонх хаагдахад устгана (D-J3). Төлөв (`state()`) болон browser storage-д хэзээ ч бичихгүй — `#checks`-ийн INV-15 үүнийг шалгана.

### 6.5 Загвар (CSS)

Өнгө бүр `styles.css`-ийн `:root` token (`--paper`, `--surface`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--accent`, `--seal`, `--warn`, `--ok`, `--info`, `--*-soft` …); харанхуй горимд зөвхөн token дахин тодорхойлогдоно. Area CSS-д literal өнгө бичихгүй. Бэлэн class: `card`, `cues/cue`, `grid-table` (`num`, `code`, `tfoot` давхар зураас), `table-wrap`, `doc-layout`/`factbox`, `form-grid`/`field`/`input`/`select`, `fasttab`, `totals`, `pill`, `tabs/tab`, `btn` (`primary`, `danger`, `ghost`, `sm`), `calc`, `banner`, `errlist`, `check-row`.

## 7. Шалгалт

```
node tests/engine_check.js
python3 build_standalone.py && node tests/browser_check.js   # Playwright: 22 зам × (1280/390 px, цайвар/бараан), screenshots/
```

Хөдөлгүүрийн инвариант (гүйлгээ тэнцэл, гүйлгээ баланс, авлага/өглөг/банкны дэд дэвтэр = хяналтын данс, НӨАТ-ын бичилт = 2300+1300, ТТ-03а = VAT entry, баримтын НӨАТ = eBarimt totalVAT, eBarimt нийлбэрийн гинж, СБТ тэнцэл, МГТ = дэвтрийн мөнгө, завсаргүй дугаар, QR хадгалаагүй, касс сөрөг биш), баримтын жишээ тоо (06 §6.2–6.5 Жишээ 6-A/B/C, FR-SAL-003 AC1, 15 §16.2-ын 55 990.01, 12 §6.2-ын мөр хуваалт), posting-ийн зан төлөв (preview дугаар зарцуулахгүй, хаалттай үе, хяналтын данс, тулгалт/unapply, буцаалт, орцын НӨАТ баталгаажуулах) ба тайлбарын баримтын холбоосыг шалгана.
