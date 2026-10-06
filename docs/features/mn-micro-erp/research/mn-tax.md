# Mongolian tax rules for the micro-business ERP

- Date of research: 2026-10-06. The note covers rules in force **now** (2026) and rules that apply **from 2027-01-01** under the tax package that Parliament approved on 2026-06-26.
- Method: web search only. Direct page fetches were blocked by the network proxy for every relevant domain (pwc.com, kpmg.com, legalinfo.mn, mta.gov.mn, ikon.mn, vatupdate.com). Every fact below comes from search-engine extracts of the cited pages, not from a full reading of the law text. For that reason, a fact is rated **high** only when two or more independent sources agree. Anything that could not be confirmed is marked **UNVERIFIED**.
- Tags: **[NOW]** = in force in 2026. **[2027]** = approved, applies from 2027-01-01 unless another date is stated. **[2028]** = approved, applies from 2028-01-01.
- Before any value goes into seed data, check it against the consolidated law text on legalinfo.mn. The laws are: VAT Law (https://legalinfo.mn/mn/detail/11227), CIT Law (https://legalinfo.mn/mn/detail/14407), PIT Law (https://legalinfo.mn/mn/detail?lawId=14410), General Tax Law (https://legalinfo.mn/mn/detail/14403), Capital City Tax Law (https://legalinfo.mn/mn/detail/11193) and Law on Infringements (https://legalinfo.mn/mn/detail/12695).
- **Fact-check status (2026-10-06):** an independent check was run on this note, but it could not reach the web. The shared web-search budget was already used up, and direct fetches of every cited domain were blocked. The check therefore relied on two things: the eBarimt PosAPI 3.0 reference (developer.itc.gov.mn, v3.2.48), used for the eBarimt and city-tax mechanics, and recomputing every derived number. **None of the statutory rates, thresholds or dates in this note were independently re-confirmed.** They are tagged "(fact-check: unverified)" in §9 and still need a legalinfo.mn check before they go into seed data. See the "Fact-check log" at the end.
- **Re-verification (2026-10-06):** a second pass with a fresh web-search budget re-checked the statutory values. It used about 60 English and Mongolian searches; fetches of pwc.com, gogo.mn and parliament.mn were still blocked, so the pass relied on search extracts. Confirmed values are tagged "(re-verified 2026-10)" and changed values "(re-verify: corrected)". The canonical, effective-dated values now live in [`legal-parameters.md`](legal-parameters.md) and its SQL seed `../db/seed/legal_parameters.sql`, which supersede §9 wherever they differ. See the "Re-verification log (2026-10)" at the end.

---

## 1. Summary

- **VAT (НӨАТ)** is 10%. Exports and international services are zero-rated. A defined list of supplies is exempt (financial services, medical services, education, residential rent and sale, and others). Input VAT can be deducted only when it is backed by an e-receipt (eBarimt) or a customs declaration in the unified system. VAT payers file **monthly** on form **ТТ-03а**, and filing and payment are both due **by the 10th of the following month**.
- **VAT registration thresholds:** registration is mandatory at **MNT 50 million** of sales in any 12 consecutive months **[NOW]**, rising to **MNT 400 million** **[2027]**. Voluntary registration stays at **MNT 10 million**. Sources disagree on when the 400 M threshold applies: English Big-4 summaries say the package applies from 2027-01-01, while Mongolian press reports on the vote say the threshold clause applies from **2027-07-01**. **Resolved: the threshold clause applies from 2027-07-01**, while the rest of the package applies from 2027-01-01. Sources: gogo.mn, ikon.mn and the UB Post of 2026-06-22. The 50 M threshold therefore applies until 2027-06-30. (re-verify: corrected)
- **New in 2027:** (a) a **simplified VAT regime** for VAT payers with turnover below MNT 400 M. They file **quarterly** and count **90% of quarterly sales as deemed purchases**, so the VAT they pay is about 1% of sales. (b) Input VAT on capital expenditure is **deducted in full straight away** (now it is spread over 60 or 120 months for some assets). (c) Taxpayers rated "Good" or better may **defer VAT payment** for 1 month, plus up to 2 more months. (d) VAT applies to cross-border digital services. (re-verified 2026-10: (a)–(c) confirmed in outline by vatupdate 2026-07-09 and KPMG July 2026. The start date of the simplified regime, its eligibility rules and its base remain open.)
- **CIT (ААНОАТ):** **[NOW]** 10% up to MNT 6 bn of taxable income, then MNT 600 M + 25% above that. **[2027]** three bands: 10% up to 6 bn, 15% from 6 to 10 bn, 25% above 10 bn. Small-business reliefs: a **1% rate on revenue up to MNT 300 M**, and a **90% CIT credit for revenue up to MNT 1.5 bn**, which becomes **2.5 bn in 2027**. Neither relief applies to mining, petroleum, alcohol or tobacco. Returns: **ТТ-02** quarterly by the 20th of the month after the quarter, and annually by 10 February. Very small taxpayers use the simplified **ТТ-02 (ХГ)** once a year. (re-verified 2026-10: the rates, the 300 M ceiling and the 1.5 → 2.5 bn ceiling are confirmed. **2027 (re-verify: corrected):** KPMG reports that the annual filing and payment deadline moves to **5 March**, and a reform summary says quarterly payment moves to the last day of the month after the quarter; each has one source. The simplified 1% regime ceiling rises to MNT 400 M.)
- **Tax depreciation** is straight-line: buildings 25 years (40 for mining licence holders), machinery and vehicles 10, computers and software 2, other assets 10. Intangibles are written off over their legal term. (re-verified 2026-10)
- **Withholding tax:** 10% on dividends, interest and royalties paid to residents, and 20% when paid to non-residents. Special 5% rates apply to some debt instruments and listed securities.
- **Payroll (interface only):** employment PIT is progressive at 10%, 15% and 20%, with breakpoints at MNT 10 M and 15 M a month. **[2027]** income up to MNT 792,000 a month is taxed at 0%. **[2028]** a 1% band applies from 792,001 to 2,000,000. The minimum wage rises from 792,000 to **1,000,000 MNT on 2027-01-01**. Social insurance: employees pay 11.5%. Employers pay 12.5–14.5% including 2% health insurance, falling to 10.4/11.3/12.3% plus 2% health in 2027. (re-verified 2026-10: bands, minimum wage and social-insurance subtotals are confirmed. **re-verify: corrected:** sources describe the 0% band as "up to the minimum wage". ikon.mn/n/3po4 says it will be computed at **1,000,000** from 2027-01-01, which conflicts with the fixed 792,000 in amendment summaries; this is still open.)
- **City tax (НХАТ):** in Ulaanbaatar, **2%** (the law allows 0–2%) on retail sales of alcohol and tobacco and on bar, restaurant, **hotel and resort** services. The rate is set by the UB Khural resolution of 2023-12-05, in force 2024-01-01, which also lists car washes and auto repair (one source). (re-verify: corrected) It appears as `totalCityTax` on the eBarimt receipt.
- **Filing channel:** returns are filed on **etax.mta.mn**. The tax authority has said reports can be "submitted directly from accounting software". Third-party developer notes mention an **ETAX API v1.1** on developer.itc.gov.mn, reachable only from Mongolian IP addresses. **The public availability and terms of that API are UNVERIFIED.**
- **eBarimt penalties:** receipts must reach the unified system within **72 hours (3 days)**. Not issuing a receipt is an infringement under Law on Infringements art. 11.19. The amounts found (2% of the prior month's revenue, and fixed amounts in "units") have **medium-to-low confidence**. (re-verified 2026-10: the 72-hour rule is confirmed by news.mn and KPMG's eBarimt manual. The 2% of prior-month revenue is confirmed at medium confidence; when that revenue cannot be determined, a legal entity is fined 15,000 units, per one source.)

---

## 2. Value-added tax (НӨАТ)

### 2.1 Rate and types of supply [NOW, unchanged in 2027]

- **Standard rate: 10%** on goods, works and services sold or imported in Mongolia ([PwC – Other taxes](https://taxsummaries.pwc.com/mongolia/corporate/other-taxes); [MTA VAT guide](https://mta.gov.mn/files/pdf-files/5aszj6ijdb7//6527932c2cb0ae5731d067f3.pdf)). Confidence: high.
- **Zero-rated (0%)** supplies include exports of goods, international transport services, services provided outside Mongolia, services to foreign persons not present in Mongolia, services to aircraft on international flights, state medals and coins made in Mongolia, and exports of *final* (processed) mining products ([Grata via Legal500](https://www.legal500.com/developments/thought-leadership/doing-business-in-mongolia-2026-guideline-from-grata-international-mongolia/); [MTA VAT guide](https://mta.gov.mn/files/pdf-files/5aszj6ijdb7//6527932c2cb0ae5731d067f3.pdf)). Confidence: medium. The full list is in the VAT Law zero-rate article.
- **Exempt** supplies include foreign-exchange and banking services, insurance and reinsurance, securities, loans and interest, financial leasing, medical services, education, residential rent and sale of residential housing, tour-operator services, virtual-asset services, gold sold to the Bank of Mongolia or to commercial banks, and certain locally produced foods ([Legal500/Grata](https://www.legal500.com/developments/thought-leadership/doing-business-in-mongolia-2026-guideline-from-grata-international-mongolia/); [TaxAtlas](https://taxatlas.io/country/mongolia/vat-sales-tax)). Confidence: medium. Input VAT that relates to exempt supplies cannot be deducted.
- **Reverse charge:** services and works received from a non-resident are subject to VAT under the reverse-charge procedure, whether or not they are supplied in Mongolia ([PwC – Other taxes](https://taxsummaries.pwc.com/mongolia/corporate/other-taxes)). Confidence: medium-high.
- **[2027]** VAT applies to cross-border digital services from 2027-01-01 ([PwC tax alert 04/2026](https://www.pwc.com/mn/en/tax_alerts/tax_alert_04_2026.html), via search extract). Confidence: medium.

### 2.2 Registration thresholds

| Item | NOW | 2027 |
|---|---|---|
| Mandatory registration | Sales of **MNT 50 M or more** in any 12 consecutive months. Sales of fixed assets do not count. | **MNT 400 M** in 12 consecutive months |
| Voluntary registration | MNT 10 M | MNT 10 M (unchanged) |

Sources: [PwC – Other taxes](https://taxsummaries.pwc.com/mongolia/corporate/other-taxes) (50 M / 10 M / fixed-asset exclusion); [KPMG July 2026 newsletter](https://assets.kpmg.com/content/dam/kpmgsites/mn/pdf/Mongolian-Tax-Law-Update-2026.pdf.coredownload.inline.pdf) and [PwC alert 04/2026](https://www.pwc.com/mn/en/tax_alerts/tax_alert_04_2026.html) (400 M, voluntary unchanged).

**Effective-date conflict.** Mongolian reports on the final vote say the 400 M threshold clause applies **from 2027-07-01**: [gogo.mn](https://gogo.mn/r/v1656y), [ikon.mn](https://ikon.mn/n/3ocs) and [zuv.mn](https://zuv.mn/1ght). The zuv.mn report also notes that a standing committee had first voted to remove the clause, and the plenary then kept it. English sources describe the package as a whole as effective 2027-01-01. Confidence on the 400 M amount: high. Confidence on the start date: **medium, unresolved**.

**Resolution (re-verify: corrected).** The 2026-10 pass found that gogo.mn ("НӨАТ-ын босго 50 биш 400 сая төгрөг боллоо") and the UB Post of 2026-06-22 both say the clause takes effect on **2027-07-01**. ikon.mn/n/3ocs reports that 72 MPs voted to keep the clause. No source found gives 2027-01-01 for this clause specifically. Seed: 50 M until 2027-06-30, then 400 M from 2027-07-01 (`vat.registration_threshold_mandatory`). The consumer VAT-refund tiers in §2.8 also start on 2027-07-01 (parliament.mn/nn/76672).

### 2.3 Tax period, return and payment

- **[NOW]** The tax period is the **calendar month**. The VAT payer transfers the VAT to the state treasury account and files the return **by the 10th of the following month** (re-verified 2026-10: VAT Law art. 16.1; no 2027 change found) ([VAT Law text via search](https://legalinfo.mn/mn/detail/11227); [MTA Töv branch](http://mta.to.gov.mn/i/2231)). Confidence: high.
- The return form is **ТТ-03а** ("НӨАТ суутган төлөгчийн тайлан"). Its attachments include a purchases register (**ТТ-03а-5**) and a sales register (**ТТ-03а-6**). In the e-tax system these can be filled by pulling e-invoice and receipt data, and customs import data can be pulled in as well ([ubaudit – ТТ-03а guide](https://www.ubaudit.mn/post/%D0%BD%D1%8D%D0%BC%D1%8D%D0%B3%D0%B4%D1%81%D1%8D%D0%BD-%D3%A9%D1%80%D1%82%D0%B3%D0%B8%D0%B9%D0%BD-%D0%B0%D0%BB%D0%B1%D0%B0%D0%BD-%D1%82%D0%B0%D1%82%D0%B2%D0%B0%D1%80%D1%8B%D0%BD-%D1%82%D0%B0%D0%B9%D0%BB%D0%B0%D0%BD%D0%B3%D0%B8%D0%B9%D0%BD-%D0%BC%D0%B0%D1%8F%D0%B3%D1%82-%D1%82%D1%82-03%D0%B0-%D1%82%D0%B0%D0%B9%D0%BB%D0%B0%D0%BD%D0%B3%D0%B8%D0%B9%D0%BD-%D0%BC%D0%B0%D1%8F%D0%B3%D1%82-%D0%BD%D3%A9%D1%85%D3%A9%D1%85-%D0%B7%D0%B0%D0%B0%D0%B2%D0%B0%D1%80); [MTA Töv – customs data guide](http://mta.to.gov.mn/i/2528); form order on [legalinfo](https://legalinfo.mn/mn/detail?lawId=210783)). Confidence: medium. The exact line numbering of the current form version is **UNVERIFIED**.
- **[2027]** Taxpayers in the simplified regime (§2.6) file and pay **quarterly** ([itoim.mn, draft stage](https://itoim.mn/a/2026/01/02/economy/eho)). Confidence: medium.

### 2.4 Input VAT deduction

- **Invoice method:** VAT is deducted on the basis of e-VAT invoices and receipts **registered in the integrated data system**, and customs declarations, for goods and services bought for production or service purposes ([MTA VAT guide](https://mta.gov.mn/files/pdf-files/5aszj6ijdb7//6527932c2cb0ae5731d067f3.pdf)). Confidence: high.
- The seller must be a **VAT payer**, and the receipt information must be **confirmed** in the eBarimt system. Imports are deducted by ticking the customs declaration in the eBarimt VAT section (VAT Law art. 14.1.5, per MTA Töv branch guidance) ([MTA Töv](http://mta.to.gov.mn/i/2528)). Confidence: medium.
- For **high-value purchases (over MNT 10 M)** the tax office checks every receipt. Receipts must be **sent to the unified system within 72 hours**. A receipt that shows as "not sent" can be deleted and re-entered, after which it confirms automatically ([shuud.mn](https://www.shuud.mn/a/562114)). Confidence: medium.
- **Not deductible [NOW]:** VAT on **passenger cars and their parts and spare parts**; on goods, works and services for **personal or employee consumption**; and on purchases related to **exempt** supplies ([MTA VAT guide](https://mta.gov.mn/files/pdf-files/5aszj6ijdb7//6527932c2cb0ae5731d067f3.pdf)). Confidence: medium-high.
- **Fixed assets [NOW]:** VAT on buildings and structures is deducted evenly over **10 years (120 months)**. VAT on equipment and exploration costs is deducted over **5 years (60 months)**. VAT on other fixed assets is deducted at once ([MTA VAT guide](https://mta.gov.mn/files/pdf-files/5aszj6ijdb7//6527932c2cb0ae5731d067f3.pdf)). Confidence: medium. The context may be limited to mining licence holders; **check whether this applies to all VAT payers**.
- **[2027]** Input VAT on investment and equipment becomes **fully and immediately deductible** ([PwC draft-laws alert](https://www.pwc.com/mn/en/tax_alerts/draft_tax_laws_May2026.html); [vatcalc](https://www.vatcalc.com/mongolia/mongolia-vat-reforms/)). Confidence: medium-high. Earlier drafts also allowed VAT on **passenger cars** and "deemed 10% VAT" on purchases from non-VAT payers ([vatupdate 2025](https://www.vatupdate.com/2025/03/27/proposed-amendments-to-mongolias-vat-law-key-changes-and-public-feedback-process/)). **Whether these reached the final law is UNVERIFIED.**
- A time limit for claiming a deduction (same month only, or later months allowed) is **UNVERIFIED**.

### 2.5 Import VAT

- Import VAT of 10% is collected by customs at import and **can be deducted** using the customs declaration that is pulled into the eBarimt and e-tax systems ([MTA VAT guide](https://mta.gov.mn/files/pdf-files/5aszj6ijdb7//6527932c2cb0ae5731d067f3.pdf); [MTA Töv](http://mta.to.gov.mn/i/2528)). The customs value base (customs value plus duty plus excise) is the usual rule but is **UNVERIFIED** here.
- For machinery imported for nationally important projects, the Government may defer customs duty and VAT, or allow them to be paid in parts, **for up to 2 years** ([Carra Globe / customs law extract](https://carraglobe.com/importer-of-record-mongolia/)). Confidence: medium. This is out of scope for micro businesses.
- **[2027]** Compliant taxpayers may request a 1–2-month deferral that **includes import VAT** ([PwC draft-laws alert](https://www.pwc.com/mn/en/tax_alerts/draft_tax_laws_May2026.html)).

### 2.6 Simplified VAT regime for small businesses [2027]

- **Who:** VAT payers with turnover **below MNT 400 M** ([vatcalc](https://www.vatcalc.com/mongolia/mongolia-vat-reforms/); [itoim](https://itoim.mn/a/2026/01/02/economy/eho)).
- **How it works:** the taxpayer counts **90% of quarterly sales as deemed purchases**, so actual input invoices are not needed for the calculation. Filing and payment are **quarterly** (same sources; [vatupdate 02/2026](https://www.vatupdate.com/2026/02/13/mongolia-proposes-major-vat-reforms-immediate-deductions-simplified-regime-and-payment-deferrals/)). The VAT payable works out to about 10% × (sales − 0.9 × sales), which is about **1% of sales**. Whether "sales" here means net of VAT or VAT-inclusive is **UNVERIFIED**.
- **Registration:** a taxpayer that does not register within one month of receiving its certificate, or whose 2025 VAT-liable sales were below 400 M, is **placed in the simplified regime automatically** by the tax authority ([PwC alert 04/2026](https://www.pwc.com/mn/en/tax_alerts/pdf/2026/tax_alert_04_en_2026.pdf), via search extract). Confidence: medium.
- **Excluded:** mining, petroleum, alcohol, tobacco, wholesale and retail of fuel, and related activities (same source). Confidence: medium.
- (re-verified 2026-10) The post-approval sources (vatupdate 2026-07-09 and KPMG July 2026) confirm a ceiling below 400 M, 90% of quarterly sales as deemed purchases, and quarterly filing. Still open: the start date (the 2027-01-01 package date or the 2027-07-01 threshold date), whether placement is automatic, whether the base is VAT-exclusive, and the due day.

### 2.7 VAT payment deferral [2027]

VAT payers with a **"Good" or higher** tax-compliance rating under the General Tax Law may apply to **defer VAT for up to 1 month**. If they pay in full on time and keep the rating, the tax authority may grant a **further deferral of up to 2 months**, paid in **equal monthly instalments** (re-verified 2026-10: also in the draft law text on lawforum.parliament.mn) ([KPMG July 2026](https://assets.kpmg.com/content/dam/kpmgsites/mn/pdf/Mongolian-Tax-Law-Update-2026.pdf.coredownload.inline.pdf); [vatcalc](https://www.vatcalc.com/mongolia/mongolia-vat-reforms/)). Confidence: medium-high.

### 2.8 Consumer VAT refunds (context only)

- **[NOW]** Individuals get refunds of VAT on purchases recorded with their consumer number: 50% of the VAT on monthly purchases up to MNT 1 M, and 20% above that.
- **[2027]** (re-verify: corrected: from **2027-07-01**, per parliament.mn/nn/76672) 100% on purchases up to MNT 500,000, 50% from 500,000 to 1 M, and 20% above 1 M ([zuv.mn](https://zuv.mn/1ba4); [ikon](https://ikon.mn/opinion/3cm1)). Confidence: medium.
- This matters for the ERP only because B2C receipts must carry the customer's `consumerNo` when the buyer gives one. The PosAPI reference narrows this: `consumerNo` is 8 digits and is allowed **only on `B2C_RECEIPT`**, not on `B2C_INVOICE`. `customerTin` is allowed only on `B2B_*` types. (fact-check: corrected)

---

## 3. Corporate income tax (ААНОАТ)

### 3.1 Rates

| Annual taxable income | NOW | 2027 |
|---|---|---|
| 0 – 6 bn MNT | 10% | 10% |
| 6 – 10 bn | MNT 600 M + 25% of the excess over 6 bn | MNT 600 M + **15%** of the excess over 6 bn |
| > 10 bn | (same 25% band) | MNT **1.2 bn** + **25%** of the excess over 10 bn |

Sources: [PwC – Taxes on corporate income](https://taxsummaries.pwc.com/mongolia/corporate/taxes-on-corporate-income); [PwC draft-laws alert](https://www.pwc.com/mn/en/tax_alerts/draft_tax_laws_May2026.html); [KPMG US Taxnewsflash](https://kpmg.com/us/en/taxnewsflash/news/2026/03/mongolia-tax-reform-package-parliament.html); [mnb.mn](https://www.mnb.mn/i/342528). Confidence: high. The 1.2 bn constant was checked arithmetically: 600 M + 4 bn × 15% = 1.2 bn. (re-verified 2026-10)

Other rates **[NOW]**: dividends 10%, royalties 10%, interest 10% (resident), with a 5% rate on interest from some debt instruments (see §3.6). The rate on gains from the sale of immovable property, often cited as 2% of the sale price, is **UNVERIFIED** in this research.

### 3.2 Small-business reliefs

- **1% regime:** CIT of **1%** applies to entities with **annual revenue up to MNT 300 M**. Mining, petroleum, alcohol and tobacco are excluded ([PwC – Taxes on corporate income](https://taxsummaries.pwc.com/mongolia/corporate/taxes-on-corporate-income)). Confidence: medium-high. One secondary source states the 300 M 1% rate is kept in the re-enacted 2027 law. (re-verified 2026-10 for the current rule. The UB Post and KPMG summaries say the **simplified 1% regime ceiling becomes MNT 400 M** in 2027. Whether that replaces this 300 M ceiling or the 50 M simplified return is open.)
- **90% CIT credit:** available to taxpayers with **revenue up to MNT 1.5 bn** outside the excluded sectors, which in practice gives about 1% of revenue ([PwC – Tax credits](https://taxsummaries.pwc.com/mongolia/corporate/tax-credits-and-incentives); [montsame](https://montsame.mn/mn/read/383037)). **[2027]** The threshold rises to **MNT 2.5 bn** ([PwC credits page](https://taxsummaries.pwc.com/mongolia/corporate/tax-credits-and-incentives); [mnb.mn](https://www.mnb.mn/i/342528)). Confidence: high. (re-verified 2026-10)
- **Simplified return ТТ-02 (ХГ):** businesses whose **prior-year revenue was below MNT 50 M** may file a simplified CIT return **once a year (by 15 February)**, paying 1% of total revenue. Losses from earlier years cannot be carried forward after switching to it (re-verified 2026-10 for the 50 M ceiling and 1% of revenue; the 15 February date is still unconfirmed) ([ubaudit](https://www.ubaudit.mn/post/%D0%B0%D0%B0%D0%BD%D0%BE%D0%B0%D1%82-%D1%8B%D0%BD-%D1%85%D1%8F%D0%BB%D0%B1%D0%B0%D1%80%D1%88%D1%83%D1%83%D0%BB%D1%81%D0%B0%D0%BD-%D1%82%D0%B0%D0%B9%D0%BB%D0%B0%D0%BD%D0%B3-%D1%85%D1%8D%D0%BD-%D1%85%D1%8D%D0%B7%D1%8D%D1%8D-%D1%85%D1%8D%D1%80%D1%85%D1%8D%D0%BD-%D1%82%D0%B0%D0%B9%D0%BB%D0%B0%D0%B3%D0%BD%D0%B0%D1%85); [ikon 2020 explainer](https://ikon.mn/n/1pwl)). Confidence: medium-low.
- **How the three relate is unclear.** Sources disagree on whether the 1% applies to gross revenue or to taxable income, and on whether the 300 M to 1.5 bn group files twice a year or quarterly. Treat the exact eligibility tests as an **open question** for a Mongolian tax adviser.

### 3.3 Filing frequency and deadlines

- **[NOW]** CIT returns (**ТТ-02**) are **quarterly**: Q1, H1 and 9M are cumulative and due **by the 20th of the month after the quarter**. Some taxpayers file **semi-annually** instead. The **annual return** is due **by 10 February** of the following year. Advance payments follow a schedule based on the prior year and fall by the 25th of each month, with the year-end settlement by 10 February ([PwC – Tax administration](https://taxsummaries.pwc.com/mongolia/corporate/tax-administration); [MTA Töv](http://mta.to.gov.mn/i/2106)). Confidence: medium-high. The payment schedule details are medium.
- Withholding-tax returns are quarterly (by the 20th of the first month after the quarter) and annual (by 10 February) (PwC – Tax administration).
- The head of the tax authority may extend a filing deadline by up to 7 days when needed ([legalinfo – reporting procedure](https://legalinfo.mn/mn/detail?lawId=210543), via search extract). Confidence: low-medium.
- **[2027]** Filing and payment deadlines are "extended by about 10 days" ([PwC draft-laws alert](https://www.pwc.com/mn/en/tax_alerts/draft_tax_laws_May2026.html)). One extract gives the annual deadline as **5 March**, but it is inconsistent with the current 10 February. **The new dates are UNVERIFIED.** (re-verify: corrected: the 2026-10 pass traced the 5 March date to KPMG's July 2026 newsletter, which moves **both annual filing and annual payment** to 5 March from 2027-01-01. A reform summary also moves the **quarterly payment** to the last day of the month after the quarter. Each has one source, so both stay `unverified` in the seed, and the date they first apply from is open.) Returns can be amended for **2 years** after the period ([ikon](https://ikon.mn/n/3ojp); [eguur](https://eguur.mn/653244/)). Confidence: medium-high.

### 3.4 Tax depreciation (straight-line, set by the CIT Law)

| Asset class | Useful life for tax |
|---|---|
| Buildings, structures, land improvements | 25 years (40 years for mineral, radioactive-mineral and oil licence holders) |
| Machinery, equipment, vehicles, production mechanisms | 10 years |
| Computers, computer parts, software | 2 years |
| Intangible assets with a defined life (including mining licences) | Term of validity |
| Other non-current assets | 10 years |

Sources: [PwC – Deductions](https://taxsummaries.pwc.com/mongolia/corporate/deductions); [CIT Law art. 18 via search](https://legalinfo.mn/mn/detail/14407). Confidence: high. (re-verified 2026-10: PwC and the KPMG 2023 changes PDF. An MTA PDF giving 40/10/10 years reproduces the pre-2020 law.)

- Depreciation starts on the first day of the month after the asset is put into its intended use. Confidence: medium.
- Since 2023, non-mining taxpayers may choose to depreciate **new buildings outside central Ulaanbaatar** (Baganuur, Bagakhangai, Nalaikh, aimags and soums) over 15 years ([PwC – Deductions](https://taxsummaries.pwc.com/mongolia/corporate/deductions)).
- The life for intangibles with an *indefinite* life is **UNVERIFIED**.

### 3.5 Deductibility basics

- To be deductible, an expense must belong to the tax year, relate directly to taxable operations, be actually incurred, be recognised under the Accounting Law, and be supported by qualifying documents. For specified goods and services, the support must be a **payment receipt with a unique number (eBarimt)** ([MTA CIT Law EN](https://mta.gov.mn/files/pdf-files/m02crlc2xm9//63e31166ce968129f2321419.pdf); [PwC – Deductions](https://taxsummaries.pwc.com/mongolia/corporate/deductions)). Confidence: high.
- **Not deductible:** fines and penalties; bad-debt provisions; contingent liabilities. Interest on investor loans above **3 times the investment** is not deductible and is taxed as a dividend. Related-party interest is capped at **30% of EBITDA** (same sources). Confidence: medium-high.
- **Losses** can be carried forward for **4 years** (4–8 years in mining and infrastructure). Each year's offset is limited to **50% of taxable income** ([PwC – Deductions](https://taxsummaries.pwc.com/mongolia/corporate/deductions)). Confidence: medium-high.

### 3.6 Withholding taxes

- **Residents:** 10% on dividends, interest and royalties. **Non-residents:** 20% on the same income ([PwC – Withholding taxes](https://taxsummaries.pwc.com/mongolia/corporate/withholding-taxes)). Confidence: high.
- Payments to non-residents for goods sold, work done or services performed in Mongolia are also subject to 20% WHT. Tax treaties may reduce the rate. Confidence: medium.
- 5% on interest paid to non-residents on bonds issued by Mongolian commercial banks, and 5% on dividends and interest from listed debt or shares of non-mining local entities (PwC – WHT).
- **[2026-07]** The Economic Freedom Law (enacted 3 July 2026) cut WHT on interest from domestic and foreign debt instruments from 20% to 5%. It also extended the 90% tax reduction on publicly traded securities until 2034 ([KPMG July 2026](https://assets.kpmg.com/content/dam/kpmgsites/mn/pdf/Mongolian-Tax-Law-Update-2026.pdf.coredownload.inline.pdf); [PwC draft-laws alert](https://www.pwc.com/mn/en/tax_alerts/draft_tax_laws_May2026.html)). Confidence: medium.

---

## 4. Personal income tax and social insurance (payroll journal interface only)

### 4.1 PIT on employment income

- **[NOW]** Monthly bands: **10%** up to MNT 10 M; MNT 1 M + **15%** of the excess from 10 M to 15 M; MNT 1.75 M + **20%** of the excess above 15 M. The annual equivalents are 120 M and 180 M, with base amounts of 12 M and 21 M ([PwC – Individual](https://taxsummaries.pwc.com/mongolia/individual/taxes-on-personal-income)). Confidence: high. The monthly base amounts were derived from the annual ones. (re-verified 2026-10: in force since 2023-01-01)
- In practice the taxable base is gross salary minus the employee's social insurance contribution. This is common practice in calculators and is **UNVERIFIED in law text**.
- **Monthly PIT credit** by income band:

  | Monthly income (MNT) | Credit (MNT) |
  |---|---|
  | up to 500,000 | 20,000 |
  | up to 1,000,000 | 18,000 |
  | up to 1,500,000 | 16,000 |
  | up to 2,000,000 | 14,000 |
  | up to 2,500,000 | 12,000 |
  | up to 3,000,000 | 10,000 |
  | above 3,000,000 | 0 |

  Sources: [suray.mn calculator](https://suray.mn/mn/tools/finance/salary-calculator); [ikon](https://ikon.mn/n/237i). Confidence: medium.
- **[2027]** Monthly employment income of **0–792,000 is taxed at 0%**. The 10%, 15% and 20% bands above it stay as they are ([PwC – Individual significant developments](https://taxsummaries.pwc.com/mongolia/individual/significant-developments); [ikon](https://ikon.mn/n/3ojp)). **[2028]** A **1%** band applies from 792,001 to 2,000,000 a month ([PwC, same page](https://taxsummaries.pwc.com/mongolia/individual/significant-developments); [unen.mn](http://www.unen.mn/a/127484)). Confidence: medium-high.
- Two points about 2027 are **UNVERIFIED**: whether the 0% band is the fixed figure 792,000 or is linked to the minimum wage (which becomes 1,000,000 from 2027-01-01), and whether the credit table survives. (re-verify: corrected: English and Mongolian summaries describe the band as "income up to the minimum wage, i.e. 792,000". ikon.mn/n/3po4, written after the 2026-08-17 decision, says the 2027 relief is computed at **1,000,000**. Seeded as 1,000,000, `unverified`, low. The credit table could not be re-confirmed.)
- **Minimum wage:** MNT 792,000 since 2025-04-01. The national tripartite committee set **MNT 1,000,000 from 2027-01-01** at its 2026-08-17 meeting ([MLSP](https://mlsp.gov.mn/content/detail/4164)). Confidence: high. The fact-check could not reach any source. Its own background knowledge puts the start of the 792,000 rate at **2025-01-01**, not 2025-04-01. Confirm the start date against the tripartite resolution. Neither date changes a 2026 or 2027 calculation. (fact-check: unverified) (re-verified 2026-10: **2025-04-01 is correct**, per PwC alert 01/2025 (Tripartite resolution No. 3 of 2024-10-07; hourly rate 4,714) and ikon.mn/n/3dfv. **1,000,000 from 2027-01-01** is confirmed by MLSP, mnb.mn/i/350805 and ikon.mn/n/3po4; the hourly rate becomes 5,952.3.)
- **Withholding reports:** the PIT withholding report is **ТТ-11**. Sources indicate tax is withheld monthly, with quarterly reports by the 20th of the month after the quarter and an annual report by 10 February ([legalinfo ТТ-11 instruction](https://legalinfo.mn/mn/detail?lawId=210925); [MTA Töv](http://mta.to.gov.mn/i/2602)). Whether withheld tax is due monthly by the 10th is **UNVERIFIED**.

### 4.2 Social insurance (НДШ)

| Component | Employee NOW | Employer NOW | Employer 2027 |
|---|---|---|---|
| Pension | 8.5% | 8.5% | 8.5% |
| Benefits | 0.8% | 1.0% | 1.0% |
| Industrial accident and occupational disease | – | 0.5 / 1.5 / 2.5% (by risk class) | 0.3 / 1.2 / 2.2% |
| Unemployment | 0.2% | 0.5% | 0.6% |
| **Social insurance subtotal** | 9.5% | **10.5 / 11.5 / 12.5%** | **10.4 / 11.3 / 12.3%** |
| Health insurance | 2% | 2% | 2% (no change reported) |
| **Total** | **11.5%** | **12.5 / 13.5 / 14.5%** | **12.4 / 13.3 / 14.3%** (derived) |

- Sources: [rivermate](https://rivermate.com/guides/mongolia/taxes) (employee 11.5%, employer 12.5–14.5%, pension 8.5% in 2026). The Social Insurance General Law amendment of **2026-07-02**, effective 2027-01-01, lowers the employer accident rate and changes unemployment ([ndaatgal.mn announcement](https://www.ndaatgal.mn/%D0%B0%D0%B6%D0%B8%D0%BB-%D0%BE%D0%BB%D0%B3%D0%BE%D0%B3%D1%87%D0%B8%D0%B9%D0%BD-%D1%82%D3%A9%D0%BB%D3%A9%D1%85-%D1%88%D0%B8%D0%BC%D1%82%D0%B3%D1%8D%D0%BB%D0%B8%D0%B9%D0%BD-%D1%85%D1%83%D0%B2/); the exact percentages come from a secondary source that cites [legalinfo](https://legalinfo.mn/mn/detail?lawId=16760148379551)).
- Confidence: employee and current employer rates medium-high. 2027 employer rates medium. The employer breakdown between accident and unemployment insurance is medium.
- **[2027]** Organisations with **up to 5 employees** that pay their employees' contributions in full may be exempt from the employer share of pension, benefits and health contributions for up to **36 months** (secondary source). Confidence: low-medium.
- (re-verified 2026-10) The employer subtotals of 10.5/11.5/12.5% becoming **10.4/11.3/12.3%** from 2027-01-01 are confirmed (ikon.mn/n/3qs6). The direction of the component change, with accident down and unemployment up, is confirmed by MLSP. The exact 0.3/1.2/2.2% and 0.6% split has one source. No change to health insurance was found. The **insurable ceiling is 10 × the monthly minimum wage**: the employee contribution was capped at MNT 910,800 a month from 2025-04-01 (PwC alert 01/2025).
- The minimum and maximum insurable earnings, and the payment and report deadlines, are **UNVERIFIED**. (Partly resolved in 2026-10: the maximum is as above. A secondary source cites art. 25.1 for a monthly report by the **5th** of the following month; that is still unverified.) Contributions are reported through the social insurance e-system (ndaatgal), and the form codes are not confirmed.

---

## 5. City tax (НХАТ – Нийслэл хотын албан татвар)

- **Legal basis:** the Law on Capital City Tax ([legalinfo](https://legalinfo.mn/mn/detail/11193)). The rate is set by the **Ulaanbaatar Citizens' Representatives Khural** within **0–2.0%**, taking location and population density into account. The Law on City Tax, revised 2024-06-05, extends city taxes to other cities and towns ([legalinfo EN](https://legalinfo.mn/en/edtl/16532054988521)). Confidence: medium-high.
- **What is taxed:** **retail** sales of all alcoholic beverages and tobacco (not wholesale), and **hotel, resort, restaurant and bar** services in the capital. When such premises are leased out, the lessee is the city-tax collector ([MTA Bayangol](https://bayangol.mta.mn/n/6190/%D0%BD%D0%B8%D0%B9%D1%81%D0%BB%D1%8D%D0%BB-%D1%85%D0%BE%D1%82%D1%8B%D0%BD-%D0%B0%D0%BB%D0%B1%D0%B0%D0%BD-%D1%82%D0%B0%D1%82%D0%B2%D0%B0%D1%80); [mongolia.gov.mn FAQ](https://mongolia.gov.mn/news/view/11411)). Confidence: medium-high.
- **Rate:** the UB Khural raised the rate on alcohol and tobacco purchases and on bar and restaurant services **to 2%** ([ikon](https://ikon.mn/n/2isb); [ubn.mn](https://ubn.mn/p/54843)). The official eBarimt PosAPI sample receipt has VAT 500 and city tax 100 on a net price of 5,000, which is 2% of the net price, not of the VAT-inclusive price. Confidence: medium. **Whether hotels and resorts are now 1% or 2% is UNVERIFIED.** (re-verify: corrected: the UB Khural resolution of 2023-12-05, in force 2024-01-01, sets **2%** for alcohol and tobacco and for bars, restaurants, **hotels and resorts**, and also for car washes and auto-repair shops (Qazinform; one source for the last two).) The PosAPI reference sample (`totalAmount` 5,600 = net 5,000 + VAT 500 + city tax 100) confirms two things. The city-tax base is the net price. VAT is also charged on the net price only, **not on the city tax**, so gross = net × 1.12. The sample is only an illustration, so the 2% rate itself is still not confirmed against the UB Khural resolution. (fact-check: unverified rate; base confirmed)
- **eBarimt:** city tax goes in `totalCityTax` at item, sub-receipt and receipt level. Whether a merchant is a city-tax payer can be checked with `getInfo?tin=` (`cityPayer`) (eBarimt PosAPI 3.0 reference, developer.itc.gov.mn, v3.2.48).
- The return form code and the filing frequency for city tax are **UNVERIFIED**. They are believed to be monthly, with the VAT return.

---

## 6. Excise and other taxes (brief)

- **Excise (ОАТ)** applies to alcohol, tobacco, fuel and some vehicles. Retailers of excise goods must scan **excise stamps** (`stockQR`) on each eBarimt receipt line. The number of stamps must equal the quantity (eBarimt PosAPI reference).
- Excise rates were not researched. The recommendation is to **leave excise out of v1** except for passing stamps through on receipts.
- Customs duty applies to imports at rates that vary by tariff line ([PwC – Other taxes](https://taxsummaries.pwc.com/mongolia/corporate/other-taxes)).
- Immovable property tax, land fees and similar taxes are outside the scope of v1.

---

## 7. Returns, forms and e-filing

| Return | Form | Frequency | Due | Confidence |
|---|---|---|---|---|
| VAT | ТТ-03а (+ ТТ-03а-5 purchases, ТТ-03а-6 sales) | Monthly; quarterly for the simplified regime from 2027 | 10th of the following month | high (deadline), medium (attachments) |
| CIT | ТТ-02 | Quarterly (cumulative) and annual | 20th after the quarter; 10 Feb (2027: about +10 days, UNVERIFIED) | medium-high |
| CIT simplified | ТТ-02 (ХГ) | Annual | 15 Feb | medium-low |
| PIT withheld | ТТ-11 | Quarterly and annual (monthly withholding) | 20th after the quarter; 10 Feb | medium |
| Withholding tax | (form code UNVERIFIED) | Quarterly and annual | 20th after the quarter; 10 Feb | medium |
| Social insurance | ndaatgal e-system (form codes UNVERIFIED) | Monthly | UNVERIFIED | low |

- **Portal:** **etax.mta.mn**, which replaced e-tax.mta.mn. The tax authority said the new system lets users "submit tax reports directly from financial software" and "prepare simplified reports from e-receipt data". It also offers a single login across etax, itax and the eBarimt app ([montsame](https://montsame.mn/en/read/215270)). Confidence: medium-high.
- **API:** the ITC developer portal (https://developer.itc.gov.mn/) hosts eBarimt PosAPI documentation. Third-party open-source accounting projects refer to an "**ETAX API v1.1**" there for submitting returns (for example ТТ-03А), with Keycloak authentication and Mongolian-IP-only access. **Whether this API is officially open to third-party software vendors, and what it costs or requires, is UNVERIFIED.** Plan for **file export plus manual upload in v1**, and treat the API as a later option.
- Financial statements go to the Ministry of Finance **e-balance** system. That is not a tax return and is covered by the accounting-law research.

---

## 8. Penalties (eBarimt and filing)

- **Sending receipts on time:** receipts must reach the unified system within **72 hours** ([shuud.mn](https://www.shuud.mn/a/562114); re-verified 2026-10 via [news.mn](https://news.mn/r/740728/) and KPMG's eBarimt manual, "within three days"). PosAPI must call `/rest/sendData` at least once a day, and lottery numbers stop being issued once 3 days pass without sending (PosAPI reference). Confidence: medium-high.
- **Failure to issue a receipt:** a fine equal to **2% of the revenue of the previous reporting month** (Law on Infringements art. 11.19) ([legalinfo](https://legalinfo.mn/mn/detail/12695), via search extract). Confidence: medium-low. (re-verified 2026-10: confirmed at medium confidence. When the prior-month revenue cannot be determined, a legal entity is fined 15,000 units, per one source.)
- **Late submission of receipts:** search extracts mention **500 units** for individuals and **5,000 units** for legal entities, where 1 unit = MNT 1,000. Confidence: **low, UNVERIFIED**.
- **Late filing of a return:** extracts mention 150 units for individuals and 1,500 units for legal entities. Confidence: **low, UNVERIFIED**.
- **Late payment:** older sources give 0.1% per day ([Oxford Business Group 2015](https://oxfordbusinessgroup.com/reports/mongolia/2015-report/economy/managing-your-tax-risks-key-details-about-the-mongolian-tax-environment)). That is outdated, and the current General Tax Law rate is **UNVERIFIED**. **[2027]** The General Tax Law amendments add a **cap on late-payment interest**, suspend penalties while a dispute is unresolved, and allow taxpayers 3 days to fix data errors the tax office flags in a submitted return ([ikon](https://ikon.mn/n/3ojp)). The cap value is **UNVERIFIED**.

---

## 9. Key facts

| Fact | Value | Effective from | Source URL | Confidence |
|---|---|---|---|---|
| VAT standard rate | 10% | in force | https://taxsummaries.pwc.com/mongolia/corporate/other-taxes | high (fact-check: confirmed by PosAPI sample, VAT 500 on net 5,000) |
| VAT mandatory registration threshold | MNT 50 M sales in 12 consecutive months (fixed-asset sales excluded) | in force until **2027-06-30** | https://taxsummaries.pwc.com/mongolia/corporate/other-taxes | high (re-verified 2026-10) |
| VAT mandatory registration threshold (new) | MNT 400 M in 12 consecutive months | **2027-07-01** | https://gogo.mn/r/v1656y ; https://www.pressreader.com/mongolia/the-ub-post/20260622/281509347896954 | high (amount), medium (date) (re-verify: corrected) |
| VAT voluntary registration threshold | MNT 10 M | in force, unchanged | https://assets.kpmg.com/content/dam/kpmgsites/mn/pdf/Mongolian-Tax-Law-Update-2026.pdf.coredownload.inline.pdf | high (re-verified 2026-10) |
| VAT period and deadline | Monthly; file and pay by the 10th of the following month | in force | https://legalinfo.mn/mn/detail/11227 | high (re-verified 2026-10) |
| VAT return form | ТТ-03а | in force | https://legalinfo.mn/mn/detail?lawId=210783 | medium-high (fact-check: unverified) |
| Input VAT evidence | e-receipt or customs declaration registered in the unified system | in force | https://mta.gov.mn/files/pdf-files/5aszj6ijdb7//6527932c2cb0ae5731d067f3.pdf | high (fact-check: unverified) |
| Non-deductible input VAT | Passenger cars and parts; personal or employee use; purchases for exempt supplies | in force | same MTA guide | medium-high (fact-check: unverified) |
| Fixed-asset input VAT | Buildings over 120 months, equipment over 60 months; immediate in full from 2027 | NOW / 2027-01-01 | MTA guide; https://www.pwc.com/mn/en/tax_alerts/draft_tax_laws_May2026.html | medium (fact-check: unverified) |
| Simplified VAT regime | Turnover < MNT 400 M; deemed purchases = 90% of quarterly sales; quarterly | 2027-01-01 or 2027-07-01 (open) | https://www.vatcalc.com/mongolia/mongolia-vat-reforms/ | medium (re-verified 2026-10 in outline; start date and eligibility rules open) |
| VAT deferral | 1 month + up to 2 months in instalments for "Good"-rated taxpayers | 2027-01-01 | KPMG July 2026 (above) | medium-high (re-verified 2026-10) |
| CIT rates | 10% ≤ 6 bn; 600 M + 25% above | in force | https://taxsummaries.pwc.com/mongolia/corporate/taxes-on-corporate-income | high (re-verified 2026-10) |
| CIT rates (new) | 10% ≤ 6 bn; 15% for 6–10 bn; 25% above 10 bn | 2027-01-01 | https://www.pwc.com/mn/en/tax_alerts/draft_tax_laws_May2026.html | high (re-verified 2026-10) |
| CIT 1% regime | Revenue ≤ MNT 300 M; mining, oil, alcohol and tobacco excluded | in force; whether the 2027 400 M simplified-regime ceiling replaces it is open | https://taxsummaries.pwc.com/mongolia/corporate/taxes-on-corporate-income | medium-high (re-verified 2026-10 for the current rule) |
| CIT 90% credit threshold | Revenue ≤ 1.5 bn, becoming ≤ 2.5 bn | NOW / 2027-01-01 | https://taxsummaries.pwc.com/mongolia/corporate/tax-credits-and-incentives | high (re-verified 2026-10) |
| CIT filing | ТТ-02 quarterly by the 20th; annual by 10 Feb | in force (2027: annual 5 March and quarterly payment on the last day of the following month, one source each) | https://taxsummaries.pwc.com/mongolia/corporate/tax-administration | medium-high (re-verified 2026-10 for current dates; re-verify: corrected for 2027) |
| Tax depreciation lives | Buildings 25 (40 mining); machinery 10; computers 2; other 10 | in force | https://taxsummaries.pwc.com/mongolia/corporate/deductions | high (re-verified 2026-10) |
| Loss carryforward | 4 years; capped at 50% of taxable income | in force | https://taxsummaries.pwc.com/mongolia/corporate/deductions | medium-high (fact-check: unverified) |
| WHT | Residents 10%; non-residents 20% (dividends, interest, royalties) | in force | https://taxsummaries.pwc.com/mongolia/corporate/withholding-taxes | high (re-verified 2026-10) |
| PIT employment | 10% / 15% / 20% (monthly breakpoints 10 M / 15 M) | in force since 2023-01-01 | https://taxsummaries.pwc.com/mongolia/individual/taxes-on-personal-income | high (re-verified 2026-10) |
| PIT 0% band | 0% up to the minimum wage (792,000, or 1,000,000 from 2027 per ikon.mn/n/3po4: conflict); 1% band to 2 M from 2028 | 2027-01-01 / 2028-01-01 | https://taxsummaries.pwc.com/mongolia/individual/significant-developments | medium-high for the rates (re-verified 2026-10); low for the 2027 ceiling (re-verify: corrected) |
| Minimum wage | MNT 792,000 (from 2025-04-01), becoming MNT 1,000,000 | NOW / 2027-01-01 | https://mlsp.gov.mn/content/detail/4164 | high (re-verified 2026-10) |
| Social insurance | Employee 11.5%; employer 12.5–14.5% (incl. 2% health); employer social insurance becomes 10.4/11.3/12.3% + health; ceiling 10 × minimum wage | NOW / 2027-01-01 | https://rivermate.com/guides/mongolia/taxes ; https://ikon.mn/n/3qs6 ; ndaatgal.mn | high for totals and subtotals (re-verified 2026-10); medium for the 2027 component split |
| UB city tax | 0–2% band; 2% on retail alcohol and tobacco, bars, restaurants, hotels and resorts (plus car washes and auto repair, one source) | 2024-01-01 | https://ikon.mn/n/2isb ; https://qazinform.com/news/mongolia-adopts-2024-budget-for-capital-city-3e58cf ; https://legalinfo.mn/mn/detail/11193 | medium (re-verify: corrected: hotels and resorts are at 2%) |
| eBarimt sending window | 72 hours | in force | https://www.shuud.mn/a/562114 | medium-high (fact-check: confirmed by PosAPI reference: sendData at least daily, 3-day limit) |
| No-receipt fine | 2% of the previous month's revenue (Law on Infringements 11.19) | in force | https://legalinfo.mn/mn/detail/12695 | medium (re-verified 2026-10) |
| E-filing portal | etax.mta.mn; "ETAX API v1.1" on developer.itc.gov.mn (Mongolian IP only) | in force | https://montsame.mn/en/read/215270 ; https://developer.itc.gov.mn/ | medium (portal), low (API) (fact-check: unverified) |
| Tax return amendment window | 2 years | 2027-01-01 | https://ikon.mn/n/3ojp | medium-high (re-verified 2026-10; also in KPMG July 2026) |

---

## 10. Implications for the ERP design

Each item is a concrete requirement for the micro-ERP.

**R1 – Tax parameters must have effective dates.** All rates, thresholds and bands must live in tables with `valid_from` and `valid_to`, never in code. This covers the VAT rate, VAT thresholds (50 M → 400 M, with a configurable start date), the 90% deemed-purchase share, CIT bands, the 1% and 90%-credit thresholds, PIT bands and credits, social insurance rates, the minimum wage and city-tax rates. Every calculation picks the parameter set by **posting date**, or by **tax-period start** for period taxes.

**R2 – Company tax profile.** The profile must hold:
- TIN (ТТД): **11 digits for a legal entity, 12–14 digits (civil ID) for an individual**, such as a sole trader. This follows the PosAPI `merchantTin` rule, and the official sample uses a 12-digit TIN. Validate length by taxpayer type and do not hard-code 11. (fact-check: corrected)
- VAT status: `NONE` / `STANDARD` / `SIMPLIFIED` (2027), with registration and deregistration dates
- VAT filing frequency (monthly or quarterly)
- City-tax payer flag and district code
- CIT regime: `STANDARD` / `ONE_PERCENT` / `CREDIT_90` / `SIMPLIFIED_ХГ`
- An excluded-sector flag (mining, petroleum, alcohol, tobacco, fuel trade), which blocks the reliefs
- Compliance rating, used for VAT deferral eligibility
- Fiscal year, which is the calendar year

**R3 – VAT codes per document line.** Use the categories `STANDARD_10`, `ZERO`, `EXEMPT`, `OUTSIDE_SCOPE`, `REVERSE_CHARGE_IN` and `IMPORT`. Each maps to an eBarimt `taxType` (`VAT_ABLE` / `VAT_ZERO` / `VAT_FREE` / `NOT_VAT`). For `ZERO`, `EXEMPT` and `OUTSIDE_SCOPE`, a `taxProductCode` is **required**. Validate this on the item and the line before posting.

**R4 – Threshold monitor.** Keep a rolling 12-month sales total that **excludes fixed-asset disposals**. Show alerts at 80% and 100% of the mandatory threshold for the date (50 M now, 400 M from the configured date), and an information message at 10 M.

**R5 – Purchase document fields for input VAT.**
- Seller TIN, eBarimt receipt ID (ДДТД, 33 digits), receipt date, net amount, VAT amount, city-tax amount
- Confirmation status: `PENDING` / `CONFIRMED` / `REJECTED`
- Deductible flag with a reason code: `PASSENGER_CAR`, `PERSONAL_USE`, `EXEMPT_RELATED`, `NO_EBARIMT`, `SIMPLIFIED_REGIME`
- Non-deductible VAT must post to the cost or asset account, not to input VAT.
- Rule: a purchase line from a VAT payer **without a receipt ID cannot post deductible VAT**.

**R6 – Fixed-asset input VAT.**
- For assets acquired before 2027 under the spread rule, keep a deduction schedule: 120 months for buildings, 60 months for equipment.
- For acquisitions from 2027-01-01, deduct in full.
- Whether the spread rule applies to all VAT payers is open (see §11).

**R7 – Imports.** Store the customs declaration number and date, customs value, duty, excise and import VAT. Import VAT is deductible through the declaration, with no eBarimt ID. Shipping costs are allocated to inventory, excluding the VAT.

**R8 – Reverse charge.** A purchase from a non-resident with category `REVERSE_CHARGE_IN` posts self-assessed output VAT and matching input VAT (if deductible). It also raises **20% WHT** on the payment (R12).

**R9 – VAT return builder.** For each period (monthly, or quarterly under `SIMPLIFIED`), produce the data for:
- ТТ-03а totals
- the purchases register (ТТ-03а-5) and the sales register (ТТ-03а-6)
- exempt and zero-rated sales

Run a **reconciliation report** of ERP sales and purchases against eBarimt data before filing. Under the PosAPI reference, purchases come from `api/tpi/receipt/getSaleListERP` and sales totals from `api/tpi/receipt/getSalesTotalData`. `getSalesTotalData` runs in production only between 01:00 and 07:00. Both calls need an OpenID token and an `X-API-KEY`. Do not use `getSaleListERP` for the sales side. (fact-check: corrected) The due-date calendar is the 10th of the following month. Lock the period after filing, and allow corrections only through amendment entries (2-year window from 2027).

**R10 – Simplified VAT (2027).** Payable = rate × taxable sales × (1 − deemed-purchase share). The share is a parameter, initially 0.90. Input VAT on actual purchases is **not** deducted in this regime. Purchase VAT goes to cost, pending confirmation of the rule. Whether sales are VAT-inclusive is **UNVERIFIED**, so the formula must be configurable.

**R11 – CIT engine.**
- Quarterly and annual computation from the GL using a **tax-adjustment register**: an account → tax-treatment mapping, with flags for fines, provisions, expenses without eBarimt, excess interest and others.
- Banded tax with effective-dated bands.
- The 1% regime and the 90% credit as alternative computations, with eligibility checks on revenue and sector.
- A loss carryforward ledger: vintage year, 4-year expiry, 50% cap.
- Output data for ТТ-02 or ТТ-02(ХГ).
- Deadlines: 20th after the quarter; 10 Feb, or the configured 2027 date.

**R12 – Withholding tax.** A WHT code on vendor payments for dividends, interest, royalties and non-resident services. Rates come from the parameter table: 10% for residents, 20% for non-residents, 5% special. The tax is withheld on payment and posted to WHT payable, and feeds the quarterly and annual WHT data.

**R13 – Separate tax depreciation book.**
- Each fixed asset has a **tax class**: Building 25 or 40, Machinery and Vehicles 10, Computer and Software 2, Intangible over its term, Other 10.
- Straight-line depreciation starts in the month after the asset is put in service.
- The accounting book stays independent. Differences feed the CIT adjustment register.

**R14 – City tax.**
- Item or service flag `CITY_TAX_APPLICABLE` (alcohol and tobacco retail, restaurant, bar, hotel, resort), active only when the company is a city-tax payer in the matching district.
- Rate from the parameter table (2% now). The base is the **net price excluding VAT**, following the PosAPI example. VAT is likewise computed on the net price excluding city tax, so the gross price is net × (1 + VAT rate + city-tax rate).
- Posts to a city-tax payable account and fills `totalCityTax` on the eBarimt receipt.

**R15 – eBarimt compliance.**
- Every sale must have a receipt. The selling document is blocked or flagged until a receipt ID exists.
- A monitor for **receipts not sent within 72 hours**.
- Credit notes are linked to receipt IDs for corrections and returns, following the PosAPI rules:
  - To cancel a whole `B2C_RECEIPT`, call `DELETE /rest/receipt {id, date}`.
  - For a partial return or an amount correction, re-post with `inactiveId` = the **latest** ДДТД in the correction chain, not the original one.
  - To re-issue a prior-month B2B receipt or an invoice, use `reportMonth`. This works only on days 1–7 of the month and only for the previous month.
  - The ERP must store the whole chain of receipt IDs. (fact-check: corrected)
- Keep `qrData` and `lottery` only for printing; do not store them.

**R16 – Payroll interface (no payroll engine in v1).** Import a payroll journal per period with:
- gross pay
- employee social insurance (pension, benefits, unemployment, health)
- employer social insurance by component and risk class
- PIT before credit, PIT credit and PIT withheld
- net pay

Check the totals against the parameter tables (0%, 10%, 15% and 20% bands; social insurance rates). Post to the PIT and social-insurance payable accounts, and supply ТТ-11 totals.

**R17 – Tax calendar and reminders** for: VAT (10th), CIT and WHT (20th after the quarter; annual), PIT (ТТ-11), social insurance and city tax. All due dates are configurable because the 2027 extension dates are unverified.

**R18 – Filing output.** v1 exports the ТТ-03а and ТТ-02 data (CSV or XLSX in form-line layout) for manual entry or upload on etax.mta.mn. Design an adapter interface `ITaxFilingChannel` so the ETAX API can be added later.

**R19 – Retention and audit.** Keep tax data and source documents for at least the audit period. 5 years is assumed and **UNVERIFIED**. Keep an immutable record of every filed return, and version-stamp the parameters each calculation used.

---

## 11. Open questions

1. ~~**400 M VAT threshold start date:** is it 2027-01-01 or 2027-07-01?~~ **Resolved 2026-10: 2027-07-01** (see §2.2). (re-verify: corrected)
2. **Simplified VAT regime:** who is eligible (existing VAT payers below 400 M, voluntary registrants or both)? Is the 90% deemed purchase applied to VAT-exclusive or VAT-inclusive sales? Are actual input VAT and import VAT then forfeited? Is a separate return form used?
3. Did the **2027 deductions for passenger-car VAT** and **"deemed 10% VAT" on purchases from non-VAT payers** survive into the final law?
4. Does the **fixed-asset VAT spread (120 and 60 months)** apply to all VAT payers today, or only to mining and exploration?
5. Is there a **time limit for claiming input VAT** (same month, or a later period allowed)? What exactly must the buyer do to confirm a purchase receipt in e-invoice or eBarimt?
6. **How the CIT small-business tests relate:** the 1% on ≤ 300 M (on revenue or on taxable income?), the 90% credit on ≤ 1.5 bn → 2.5 bn, and ТТ-02(ХГ) for < 50 M. Which filing frequency (quarterly or semi-annual) applies to each group, now and in 2027?
7. What are the **exact 2027 CIT and PIT filing and payment deadlines** after the "+10 days" change? *Partly answered 2026-10:* annual filing and payment on 5 March, and quarterly payment on the last day of the following month. Each has one source.
8. Is the **2027 PIT 0% band** a fixed MNT 792,000 or linked to the minimum wage (MNT 1,000,000 from 2027-01-01)? Is the monthly PIT credit table kept?
9. **Social insurance:** what are the minimum and maximum insurable earnings, and the payment and report deadlines? Are the 2027 employer accident and unemployment rates exactly 0.3/1.2/2.2% and 0.6%? Did the health insurance rate change?
10. **UB city tax:** is the rate for hotels and resorts 1% or 2%? *(Answered 2026-10: 2% since 2024-01-01.)* Which form and frequency apply? Does any other city now levy city tax under the 2024 Law on City Tax?
11. **ETAX API:** is it officially open to third-party ERP vendors? What does certification require? Can it submit ТТ-02 and ТТ-11 as well as ТТ-03а?
12. **Penalties:** what are the current amounts under Law on Infringements art. 11.19 (no receipt, late receipt, late filing)? What is the current late-payment interest rate and the new 2027 cap under the General Tax Law?
13. How do **non-VAT-payer** merchants (most micro businesses) fill eBarimt receipts: which `taxType`, and VAT = 0? Do such businesses get any refund of VAT on their purchases? This should be confirmed with the eBarimt research note.
14. What is the **retention period** for tax records under the General Tax Law (5 years assumed)? *(2026-10: the Accounting Law requires at least 10 years for accounting records, which is the binding constraint. One source puts the tax assessment limitation period at 4 years.)*

---

## Fact-check log

Independent fact-check, run on 2026-10-06. **Limits of this check:** the shared WebSearch budget for this run was already used up before the first query, and direct fetches were refused by the egress proxy for every cited domain that was tried: taxsummaries.pwc.com, legalinfo.mn, vatcalc.com, mlsp.gov.mn, montsame.mn, gogo.mn, rivermate.com, mnb.mn and shuud.mn. That left two independent checks:

- **The eBarimt PosAPI 3.0 reference** (developer.itc.gov.mn, v3.2.48, 2026-09-15), which covers eBarimt mechanics and the official sample receipt.
- **Arithmetic recomputation** of the derived constants.

Every statutory rate, threshold and date below is **unverifiable** in this pass, not wrong. Re-run the check against legalinfo.mn and the post-approval PwC/KPMG alerts before seeding.

| Claim | Verdict | Source URL |
|---|---|---|
| VAT standard rate is 10% | Confirmed. The PosAPI sample has VAT 500 on a net price of 5,000. | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| Mandatory VAT registration at MNT 50 M over 12 months (NOW) | Unverifiable | — (search budget exhausted; legalinfo.mn and PwC fetch blocked) |
| Mandatory VAT registration at MNT 400 M (2027), start date 2027-01-01 or 2027-07-01 | Unverifiable. The date conflict remains open. | — (gogo.mn and PwC fetch blocked) |
| Voluntary VAT registration at MNT 10 M | Unverifiable | — |
| VAT period is monthly; file and pay by the 10th of the following month | Unverifiable | — (legalinfo.mn fetch blocked) |
| Simplified VAT regime (< 400 M, 90% deemed purchases, quarterly) | Unverifiable rule. The derived payable of about 1% of sales (10% × 10%) is arithmetically correct. | — (vatcalc fetch blocked) |
| VAT deferral of 1 month + 2 months for "Good"-rated taxpayers (2027) | Unverifiable | — |
| CIT NOW: 10% up to 6 bn, then 600 M + 25% | Unverifiable rates. 10% × 6 bn = 600 M checks out. | — (PwC fetch blocked) |
| CIT 2027: 15% band from 6 to 10 bn, constant 1.2 bn above 10 bn | Confirmed (arithmetic only): 600 M + 15% × 4 bn = 1.2 bn. The rates themselves are unverifiable. | n/a (arithmetic) |
| 1% CIT regime for revenue up to MNT 300 M | Unverifiable | — |
| 90% CIT credit threshold of 1.5 bn, becoming 2.5 bn in 2027 | Unverifiable | — (mnb.mn and PwC fetch blocked) |
| CIT return ТТ-02 quarterly by the 20th, annual by 10 Feb | Unverifiable | — |
| Tax depreciation lives of 25/40, 10, 2 and 10 years | Unverifiable | — |
| Loss carryforward of 4 years, capped at 50% of taxable income | Unverifiable | — |
| WHT of 10% for residents and 20% for non-residents | Unverifiable | — |
| PIT monthly bands 10/15/20% at 10 M and 15 M, with base amounts 1 M and 1.75 M | Confirmed (arithmetic only): 10% × 10 M = 1 M, and 1 M + 15% × 5 M = 1.75 M. This matches the annual 12 M and 21 M. The rates are unverifiable. | n/a (arithmetic) |
| PIT 0% band up to 792,000 (2027) and 1% band up to 2 M (2028) | Unverifiable | — |
| Minimum wage MNT 792,000 since 2025-04-01 | Unverifiable. The checker recalls a start date of 2025-01-01, which needs confirming. | — (mlsp.gov.mn fetch blocked) |
| Minimum wage MNT 1,000,000 from 2027-01-01 | Unverifiable | — (mlsp.gov.mn fetch blocked) |
| Social insurance totals: employee 11.5%, employer 12.5/13.5/14.5%, 2027 employer 10.4/11.3/12.3% + 2% health | Confirmed (arithmetic only). The components add up to the stated subtotals and totals. The component rates are unverifiable. | n/a (arithmetic) |
| City-tax base is the net price excluding VAT, and VAT is not charged on city tax | Confirmed. In the PosAPI sample, 5,600 = 5,000 + 500 VAT + 100 city tax. | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| UB city tax currently 2% (law allows 0–2%) | Unverifiable. The PosAPI sample is consistent with 2% but is only an illustration. | — (ikon.mn and legalinfo.mn fetch blocked) |
| City-tax payer status can be read from `getInfo?tin=` (`cityPayer`) | Confirmed | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| eBarimt sending: `/rest/sendData` at least once a day; 3-day (72-hour) limit, after which lottery numbers stop | Confirmed | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| ДДТД (receipt ID) is 33 digits | Confirmed | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| `taxType` values VAT_ABLE / VAT_ZERO / VAT_FREE / NOT_VAT; `taxProductCode` required for zero-rated, exempt and outside-scope lines | Confirmed | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| Excise `stockQR` count must equal the quantity | Confirmed | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| `qrData` and `lottery` are for printing only and must not be stored | Confirmed | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| R2: TIN is 11 digits | **Corrected.** A legal entity has 11 digits; an individual or sole trader has 12–14 digits (civil ID). | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| R15: credit notes link to the original receipt ID | **Corrected.** Corrections use `inactiveId` = the latest ДДТД in the chain. A full B2C cancellation uses `DELETE /rest/receipt`. Prior-month B2B receipts and invoices use `reportMonth` on days 1–7 only. | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| R9: reconcile sales and purchases with a getSaleListERP-type download | **Corrected.** `getSaleListERP` covers purchases. Sales totals come from `getSalesTotalData`, which runs in production only from 01:00 to 07:00. Both need a token and an `X-API-KEY`. | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| §2.8: B2C receipts carry `consumerNo` | **Corrected.** It is 8 digits and allowed on `B2C_RECEIPT` only, not on `B2C_INVOICE`. | https://developer.itc.gov.mn/ (PosAPI 3.0 reference v3.2.48) |
| ETAX API v1.1 on developer.itc.gov.mn, Mongolian IP only | Unverifiable. The Mongolian-IP-only rule is confirmed for PosAPI only, not for ETAX. | — |
| No-receipt fine of 2% of prior-month revenue (Law on Infringements 11.19) | Unverifiable | — (legalinfo.mn fetch blocked) |
| Tax package approved 2026-06-26; Economic Freedom Law enacted 2026-07-03 | Unverifiable | — |

**Totals:** 35 claims checked. 11 confirmed (8 against the PosAPI reference, 3 by arithmetic only), 4 corrected, 20 unverifiable.

---

## Re-verification log (2026-10)

The second pass ran on 2026-10-06 with a fresh search budget: about 60 English and Mongolian queries. Direct fetches of pwc.com, gogo.mn, d.parliament.mn and lawforum.parliament.mn were still blocked, so verdicts rest on search extracts plus one secondary GitHub mirror, the OpenAccountants Mongolia guides (`ryanduguid/openaccountants` @ `44d2f8d`). That mirror is AI-drafted and pending review, so it never counts as verification on its own. The canonical values, with per-row status and confidence, are in [`legal-parameters.md`](legal-parameters.md).

| Claim | Verdict | Key sources |
|---|---|---|
| 400 M VAT threshold start date | **Corrected: 2027-07-01** (the package otherwise starts 2027-01-01) | https://gogo.mn/r/v1656y ; https://www.pressreader.com/mongolia/the-ub-post/20260622/281509347896954 ; https://ikon.mn/n/3ocs |
| VAT 50 M mandatory / 10 M voluntary; monthly return by the 10th | Re-verified | https://taxsummaries.pwc.com/mongolia/corporate/other-taxes ; https://legalinfo.mn/mn/detail/11227 |
| Simplified VAT regime (< 400 M, 90% deemed purchases, quarterly) | Re-verified in outline; start date, eligibility and base still open | https://www.vatupdate.com/2026/07/09/mongolia-uses-vat-relief-as-cornerstone-of-tax-reform-agenda/ ; https://www.vatcalc.com/mongolia/mongolia-vat-reforms/ |
| VAT deferral of 1 + 2 months | Re-verified | KPMG July 2026 ; lawforum.parliament.mn draft text (search extract) |
| Consumer VAT refund tiers in 2027 | **Corrected: from 2027-07-01** | https://www.parliament.mn/nn/76672/ |
| CIT bands now and in 2027 | Re-verified | https://taxsummaries.pwc.com/mongolia/corporate/taxes-on-corporate-income ; KPMG July 2026 |
| CIT 1% regime ≤ 300 M; 90% credit 1.5 → 2.5 bn; simplified return < 50 M | Re-verified; 2027 simplified ceiling of 400 M has one source | https://ikon.mn/n/1pwl ; https://ikon.mn/n/3j8q ; https://taxsummaries.pwc.com/mongolia/corporate/tax-credits-and-incentives |
| 2027 annual deadline of 5 March; quarterly payment on the last day of the following month | **Corrected** (previously "+10 days, unverified"); one source each | KPMG July 2026 (search extract) |
| Tax depreciation lives 25/40/10/2/10 and the 15-year regional option | Re-verified | https://taxsummaries.pwc.com/mongolia/corporate/deductions ; KPMG 2023 changes PDF |
| PIT bands 10/15/20% (since 2023-01-01) | Re-verified | https://taxsummaries.pwc.com/mongolia/individual/taxes-on-personal-income |
| PIT 0% band (2027) and 1% band to 2 M (2028) | Re-verified for the rates; **conflict on the 0% band ceiling** (792,000 or 1,000,000) | https://ikon.mn/n/3ok6 ; https://www.mnb.mn/i/349937 ; https://ikon.mn/n/3po4 |
| Minimum wage 792,000 from 2025-04-01; 1,000,000 from 2027-01-01 | Re-verified (the 2025-04-01 date is correct) | https://www.pwc.com/mn/en/tax_alerts/tax_alert_01_2025.html ; https://mlsp.gov.mn/content/detail/4164 ; https://www.mnb.mn/i/350805 |
| Social insurance: employee 11.5%; employer subtotals 10.5/11.5/12.5 → 10.4/11.3/12.3 | Re-verified | https://ikon.mn/n/3qs6 ; https://www.ndaatgal.mn/daatgal/ ; https://tradingeconomics.com/mongolia/social-security-rate-for-employees |
| 2027 component split (accident 0.3/1.2/2.2, unemployment 0.6) | Direction re-verified (MLSP); figures from one secondary source | https://mlsp.gov.mn/eng/content/detail/1931 |
| Social-insurance ceiling of 10 × minimum wage; cap of 910,800 from 2025-04-01 | Re-verified (new) | https://www.pwc.com/mn/en/tax_alerts/tax_alert_01_2025.html |
| UB city tax 2%, including hotels and resorts | **Corrected** (hotels and resorts at 2%, since 2024-01-01) | https://qazinform.com/news/mongolia-adopts-2024-budget-for-capital-city-3e58cf ; https://ikon.mn/n/2isb |
| eBarimt 72-hour sending rule | Re-verified | https://news.mn/r/740728/ ; KPMG eBarimt manual 2022 |
| No-receipt fine of 2% of prior-month revenue | Re-verified (medium); fallback of 15,000 units from one source | https://legalinfo.mn/mn/detail/12695 ; https://montsame.mn/mn/read/223966 |
| Late-receipt and late-filing fines in units; current late-payment interest | Still unverifiable | — |
| ETAX API availability | Not re-checked | — |
