# Mongolia research: accounting law, standards, financial statements, chart of accounts and primary documents

- Date context: October 2026. The note separates **rules in force now** from **rules effective 2027-01-01**.
- Scope: what a new micro-business ERP for Mongolian legal entities (mainly ХХК, LLCs) needs from the accounting law, the reporting standards, the e-balance filing, the chart of accounts and primary documents. Tax rules (VAT, CIT, PIT, social insurance) and eBarimt get only the detail the closing calendar needs. Separate research notes cover them.
- **Method and limits.** WebFetch was blocked by the egress proxy for legalinfo.mn, mof.gov.mn, mse.mn, ey.com, pwc.com, kpmg.com and ifrs.org, so no primary text could be read in full. Every fact below comes from search-engine extracts of those pages. Article numbers, order numbers and dates are as precise as those extracts allowed. Anything we could not confirm is marked **UNVERIFIED**. The web-search budget for this run ran out before the e-balance import question was settled. Before any value here is hard-coded, check it against the official text on legalinfo.mn.
- **Fact-check pass (2026-10-06).** An independent fact-check could not run new web searches, because the shared search budget for the run was used up, and direct fetches to legalinfo.mn, mof.gov.mn, pwc.com, ifrs.org, icaew.com and vatupdate.com were blocked. Verdicts in the "Fact-check log" (end of note) rest on (a) stable, well-known facts about IFRS for SMEs and Mongolian tax practice, checked against the reviewer's own prior knowledge, and (b) cross-checks against the sibling note `mn-tax.md`. Items marked "(fact-check: unverified)" still need a primary-source check before build.
- **Re-verification pass (2026-10-06).** A second pass with a fresh search budget re-checked the statutory values in this note. Fetches of mof.gov.mn and legalinfo.mn were still blocked, so the pass relied on search extracts. Confirmed values are tagged "(re-verified 2026-10)" and changed ones "(re-verify: corrected)". The canonical effective-dated values are in [`legal-parameters.md`](legal-parameters.md) and `../db/seed/legal_parameters.sql`. See the "Re-verification log (2026-10)" at the end.
- Abbreviations: НББ = нягтлан бодох бүртгэл (accounting); СТОУС = IFRS; ЖДҮ-ийн СТОУС = IFRS for SMEs; НББОУС = IAS; МоF = Ministry of Finance (Сангийн яам); СБТ = Санхүүгийн байдлын тайлан (statement of financial position); ОДТ = Орлогын дэлгэрэнгүй тайлан (statement of comprehensive income); ӨӨТ = Өмчийн өөрчлөлтийн тайлан (statement of changes in equity); МГТ = Мөнгөн гүйлгээний тайлан (cash-flow statement).

---

## 1. Summary

1. **Governing law.** The *Law on Accounting* (Нягтлан бодох бүртгэлийн тухай хууль, revised edition) was adopted on **19 June 2015** and took effect on **1 January 2016** ([legalinfo EN unofficial translation](https://legalinfo.mn/en/edtl/16230949065051); [MN text](https://legalinfo.mn/mn/detail?lawId=11191)). It requires **accrual-basis, double-entry** bookkeeping, kept in the **Mongolian language** and in **MNT**, on a **calendar fiscal year**.
2. **Standards.** Art. 4.1 recognises three frameworks: IFRS (4.1.1), IFRS for SMEs (4.1.2) and IPSAS (4.1.3). Entities classed as SMEs apply IFRS for SMEs. Public-interest entities apply full IFRS. **No separate "micro" accounting framework is in force.** The old *Жижиг аж ахуйн нэгжид мөрдөх НББ-ийн маягт, аргачлал* (forms and methods for small entities) was repealed by MoF Order 361/2017 ([legalinfo 204653](https://legalinfo.mn/mn/detail?lawId=204653)). A micro company therefore uses **IFRS for SMEs with the MoF standard statement forms**.
3. **Which entity applies which standard** is set by an MoF classification procedure. The current one is **MoF Order A/25 of 6 Feb 2025**, which replaced Order 41 of 4 Feb 2016 ([legalinfo 17355848942361](https://legalinfo.mn/mn/detail?lawId=17355848942361); [legalinfo 11809](https://legalinfo.mn/mn/detail?lawId=11809)). (fact-check: unverified) (re-verified 2026-10: the order number and date are confirmed by search extracts, and so is the "sales ≥ MNT 2.5 bn → full IFRS" criterion. The other criteria were not found, so the threshold row stays `unverified`.)
4. **Statements and filing.** Every entity files an annual set (СБТ, ОДТ, ӨӨТ, МГТ, notes) **by 10 February** of the following year. Entities on full IFRS also file a **half-year** set by **20 July**. Filing is electronic, through the MoF **"Санхүүгийн тайлангийн и-баланс"** system at `e-balance.mof.gov.mn` (re-verified 2026-10: the 1 Jan – 10 Feb window is confirmed; the URL and the A/205 order details remain unverified). The procedure for it was last revised by **MoF Order A/205 of 18 Nov 2024** ([legalinfo 17333248876151](https://legalinfo.mn/mn/detail?lawId=17333248876151)). (fact-check: unverified: the order number and date, the e-balance URL, and whether IFRS-for-SMEs entities are exempt from the 20 July filing)
5. **Statement forms** come from **MoF Order 361 of 14 Dec 2017**: the preparation instruction, **Form A** (annual, with notes) and **Form B** (interim) ([legalinfo 13210](https://legalinfo.mn/mn/detail?lawId=13210), [A form 208281](https://legalinfo.mn/mn/detail?lawId=208281), [B form 208282](https://legalinfo.mn/mn/detail?lawId=208282)). (fact-check: unverified: the note's own evidence in §3.2 conflicts with "Form B = interim"; see there)
6. **Chart of accounts.** The MoF *model chart of accounts* (СЭЗС Order 116 of 2000) was **repealed by MoF Order 13 of 17 Jan 2017** ([legalinfo 7495/205201](https://legalinfo.mn/mn/detail/7495/2/205201)). There is **no mandatory chart for ordinary companies** today. Each entity approves its own chart in its accounting policy and maps it to the Form A lines. The ERP must ship a seed chart and a line mapping. It must not copy an "official" chart, because none exists. (fact-check: unverified: the Order 13/2017 number and date)
7. **Primary documents.** A transaction cannot be recorded without a complete primary document. The document is valid once it carries the signatures of the people who made, approved or checked it, plus the stamp. Electronic primary documents need a **digital signature**. The standard forms are in **MoF Order 347 of 5 Dec 2017**, for example НХМаягт МХ-1/МХ-2 (cash receipt and payment vouchers), ТМ-1 (invoice), БМ-* (inventory) and ҮХ-* (fixed assets). The journals and registers are in **MoF Order 100 of 8 May 2018**. (fact-check: unverified: the numbers and dates of Orders 347/2017 and 100/2018)
8. **Retention:** at least **10 years**, unless the Archives law says otherwise (medium confidence). (fact-check: unverified) (re-verified 2026-10: EY's accounting-law summary and an extract citing the 2016 law (art. 8.3) agree.)
9. **Accounting software must be MoF-approved.** Under Art. 17.1.11 the MoF publishes the list of approved accounting software, and **MoF Order 47 (2018)** sets the requirements. Since about 2024 MonICPA has carried out the monitoring ([mof.gov.mn list](https://mof.gov.mn/article/entry/12-20); [mof.gov.mn Order 47](https://mof.gov.mn/article/entry/2018-47)). This is a **go-to-market gate for the ERP**. (fact-check: unverified: the Order 47 date and MonICPA's role) (re-verified 2026-10: the Order 47 (2018) title and requirements are confirmed, and so is MonICPA's role in monitoring and assessing approved software. The full checklist, cost and timeline were still not obtained.)
10. **From 2027-01-01:** the tax-reform package passed on **26 June 2026** takes effect, with a VAT registration threshold of MNT 400m, new CIT bands and a 90% CIT-credit threshold of MNT 2.5bn ([PwC alert 04/2026](https://www.pwc.com/mn/en/tax_alerts/tax_alert_04_2026.html)). The **start date of the MNT 400m VAT threshold is disputed**: English Big-4 summaries give 2027-01-01, but Mongolian press reports on the vote ([gogo.mn](https://gogo.mn/r/v1656y), cited in `mn-tax.md`) put the threshold clause at **2027-07-01**. Treat the date as a parameter, not a constant (fact-check: corrected). **Resolved: 2027-07-01** (gogo.mn, ikon.mn and the UB Post of 2026-06-22) (re-verify: corrected). The passage date and the CIT figures could not be re-checked in this pass, but `mn-tax.md` reports the same values from KPMG and mnb.mn (fact-check: unverified) (re-verified 2026-10: passage on 2026-06-26, the 15% band for 6–10 bn and the 2.5 bn credit ceiling are all confirmed). The **third edition of IFRS for SMEs** (IASB) also applies to periods from 1 Jan 2027. Its formal adoption in Mongolia is UNVERIFIED. We found **no 2026 amendment to the Law on Accounting** (UNVERIFIED that none exists).

---

## 2. Law on Accounting (in force)

### 2.1 Identity and status
- Adopted on 19 June 2015 and effective on 1 January 2016. The unofficial English translation on legalinfo was reviewed on 23 Nov 2022 ([legalinfo EN](https://legalinfo.mn/en/edtl/16230949065051)). Earlier laws date from 1993/1997, with revisions in 2001–2012 ([EY summary PDF](https://ey.com/content/dam/ey-unified-site/ey-com/en-mn/documents/ey-mongolia-new-accounting-and-auditing-laws.pdf)).
- Definitions that the ERP model depends on (from extracts of Art. 4/8 definitions):
  - **Primary document (анхан шатны баримт):** a contract, invoice, payment receipt or other evidence that proves a transaction took place.
  - **Accrual basis:** income is recognised when earned and costs when incurred, whatever the cash timing.
  - **Double entry:** each transaction is recorded as both a debit and a credit.
  - **General ledger:** all the accounts that make up the entity's financial statements.

### 2.2 Applicable standards (Art. 4)
- Art. 4.1 lists **IFRS** (4.1.1), **IFRS for SMEs** (4.1.2) and **IPSAS** (4.1.3) ([legalinfo 11191](https://legalinfo.mn/mn/detail?lawId=11191)).
- **Full IFRS is required** for listed companies, banks, NBFIs, insurers, licensed businesses named in the Law on Licensing, state-owned and state-participation enterprises, public utilities and similar entities. The IFRS Foundation jurisdiction profile, as quoted in search, says the same ([IFRS profile](https://www.ifrs.org/content/dam/ifrs/publications/jurisdictions/pdf-profiles/mongolia-ifrs-profile.pdf)).
- **SMEs apply IFRS for SMEs.** The IFRS profile (an older edition) also says that IFRS for SMEs "has not been adopted" and that SMEs used full IFRS or MoF regulation. That statement is probably out of date: the MoF publishes the Mongolian IFRS-for-SMEs text (ЖДААН), and an e-reporting standard page exists ([standards.mn ЖДААН](https://standards.mn/standard/zhdaan)). **Treat IFRS for SMEs as the framework for micro companies** (medium confidence).
- **Classification procedure (Art. 4.2):** MoF Order A/25 of 6 Feb 2025, *Аж ахуйн нэгж, байгууллагын ангилал, шалгуур үзүүлэлт тогтоох журам*. Meeting **any one** criterion places an entity in the IFRS ("large") class. Criteria are reviewed against the **three preceding years'** statements. One extract says entities with sales of **MNT 2.5bn or more** follow IFRS (low confidence; fact-check: unverified) (re-verified 2026-10: the same criterion appears in a second extract, but both may come from one summary, so it stays medium and `unverified` in the seed). The other thresholds (assets, staff) are UNVERIFIED ([legalinfo 17355848942361](https://legalinfo.mn/mn/detail?lawId=17355848942361); [ubaudit summary](https://www.ubaudit.mn/post/%D0%B0%D0%B6-%D0%B0%D1%85%D1%83%D0%B9%D0%BD-%D0%BD%D1%8D%D0%B3%D0%B6-%D0%B1%D0%B0%D0%B9%D0%B3%D1%83%D1%83%D0%BB%D0%BB%D0%B0%D0%B3%D1%8B%D0%BD-%D0%B0%D0%BD%D0%B3%D0%B8%D0%BB%D0%B0%D0%BB-%D1%88%D0%B0%D0%BB%D0%B3%D1%83%D1%83%D1%80-%D2%AF%D0%B7%D2%AF%D2%AF%D0%BB%D1%8D%D0%BB%D1%82-%D1%82%D0%BE%D0%B3%D1%82%D0%BE%D0%BE%D1%85)).
- **"Micro" exists only in the SME law.** The *Law on Supporting SMEs and Services* (Жижиг, дунд үйлдвэр, үйлчилгээг дэмжих тухай хууль, adopted 6 June 2019) defines a micro enterprise as having **up to 10 employees and annual sales up to MNT 300.0m** (medium confidence; [legalinfo 14525](https://legalinfo.mn/mn/detail/14525)). (fact-check: unverified: the adoption date, and whether the headcount limit is "up to 9" or "up to 10") The SME ceiling quoted by the IFRS profile is up to 200 employees and MNT 2.5bn. For accounting purposes a micro company is simply an IFRS-for-SMEs entity.

### 2.3 Language, currency, fiscal year
- Books are kept **in Mongolian** (Art. 7.1). This also binds foreign entities' representative offices.
- The unit of account is **MNT (төгрөг)**. Foreign-currency transactions are translated at the **Mongolbank official rate** in force at the time. Keeping books in a foreign currency needs MoF consent, and statements must still be presented in MNT. Related procedure: *НББ-ийн валютыг тогтоох, өөрчлөх, санхүүгийн тайланг хөрвүүлэх журам* ([legalinfo 207944](https://legalinfo.mn/mn/detail?lawId=207944)).
- **Fiscal year = 1 January to 31 December** (law extract; high confidence).

### 2.4 Accounting policy and records
- Each entity drafts and approves an **accounting-policy document** (НББ-ийн бодлогын баримт бичиг). It holds the chart of accounts, the forms and the methods chosen within the standard, and must comply with the law ([nalaikh audit guide](https://nalaikh.audit.gov.mn/index.php?option=com_content&view=article&id=200&catid=107&Itemid=1098)).
- The CEO and the chief accountant are responsible for the records and the statements. Both **sign the financial statements** (and stamp them, see 2.7). The person who keeps the books must be a qualified accountant (law extract, medium).
- **Inventory count (тооллого)** of assets and liabilities is required **before the annual statements are prepared**, when the person responsible for assets changes, and in other cases set by law. The CEO and chief accountant organise it (law extract, medium).

### 2.5 Approved accounting software (important for us)
- Art. **17.1.11**: the state authority "publishes the accounting software approved for keeping books by entities operating in Mongolia" ([MoF list page](https://mof.gov.mn/article/entry/12-20); [sankhuu.audit.da.gov.mn](https://sankhuu.audit.da.gov.mn/2024/%D0%BC%D0%BE%D0%BD%D0%B3%D0%BE%D0%BB%D1%8B%D0%BD-%D0%BC%D1%8D%D1%80%D0%B3%D1%8D%D1%88%D1%81%D1%8D%D0%BD-%D0%BD%D1%8F%D0%B3%D1%82%D0%BB%D0%B0%D0%BD-%D0%B1%D0%BE%D0%B4%D0%BE%D0%B3%D1%87%D0%B4%D1%8B/)). The list was refreshed on about 3 Sep 2024. **MonICPA (ММНБИ)** carries out the monitoring function.
- **MoF Order 47 (2018)**, *Аж ахуйн нэгж, байгууллагын НББ-ийн программд тавигдах шаардлага, удирдамж батлах, ажлын хэсэг байгуулах тухай* ([mof.gov.mn](https://mof.gov.mn/article/entry/2018-47); [mains.mn copy](https://mains.mn/2018/05/02/%D1%81%D0%B0%D0%BD%D0%B3%D0%B8%D0%B9%D0%BD-%D1%81%D0%B0%D0%B9%D0%B4%D1%8B%D0%BD-%D1%82%D1%83%D1%88%D0%B0%D0%B0%D0%BB-47-%D1%80-%D1%82%D1%83%D1%88%D0%B0%D0%B0%D0%BB-%D0%BD%D1%8F%D0%B3%D1%82%D0%BB%D0%B0/)). Requirements from the extracts:
  - The software complies with the law, IFRS and IPSAS.
  - Its terminology matches the standards.
  - Journals, the general ledger and the statements can be produced with notes, in forms that meet the standard.
  - Transactions **cannot be hidden, concealed, deliberately confused or embezzled**.
  - A companion *НББ-ийн программд үнэлгээ өгөх журам* (evaluation procedure) exists.
- One extract dates Order 47 to **5 March 2018**. Its full checklist is UNVERIFIED and is the most important document to get before the build starts. (re-verified 2026-10: the order title is confirmed as *Нягтлан бодох бүртгэлийн програмд тавигдах шаардлага, удирдамж батлах, ажлын хэсэг байгуулах тухай*. A 2018 MoF document delegating some state accounting functions to MonICPA also exists. mains.mn no longer resolves, and mof.gov.mn is blocked from this environment.)

### 2.6 Retention
- Accounting documents, registers and financial statements: **at least 10 years**, unless the Law on Archives sets otherwise (law extract via search; medium confidence; [legalinfo 11191](https://legalinfo.mn/mn/detail?lawId=11191)). (re-verified 2026-10: [EY summary](https://ey.com/content/dam/ey-unified-site/ey-com/en-mn/documents/ey-mongolia-new-accounting-and-auditing-laws.pdf); one extract cites art. 8.3)
- Tax: under the 2019 General Tax Law the limitation period for assessment was **cut from 5 to 4 years** ([PwC tax alert 08/2019](https://www.pwc.com/mn/en/tax_alerts/pdf/tax_alert_08_2019.pdf), medium). (fact-check: unverified) The 10-year accounting rule is the binding constraint.

### 2.7 Signatures, stamps and electronic records
- A primary document is valid once the employee who **made, approved or checked** it has signed it and the **stamp/seal** is applied. **Electronic primary documents must be confirmed with a digital signature.** Statements filed electronically are signed with a digital signature. Transactions without complete primary documents **may not be recorded** or reported (law extract, medium).
- Record changes in primary documents "in written and electronic form" (law extract).
- The *Law on Digital Signature* (revised) was adopted on **17 Dec 2021** ([legalinfo 574](https://legalinfo.mn/mn/detail?lawId=574)). Its effective date is UNVERIFIED. Lead for the build team: the 2011 law was the *Тоон гарын үсгийн тухай хууль*. The December 2021 revision appears to have been renamed *Цахим гарын үсгийн тухай хууль* (Law on Electronic Signature). It was probably part of the 17 Dec 2021 digital-law package (personal data protection, public information, cyber security), which took effect on **1 May 2022**. Check the title and effective date on legalinfo before citing them in specs (fact-check: unverified).
- We found no evidence that company stamps have stopped being mandatory (UNVERIFIED). Keep the stamp configurable.

### 2.8 Penalties
- Breaches are punished under the Criminal Code or the *Law on Infractions* (Зөрчлийн тухай хууль, [legalinfo 12695](https://legalinfo.mn/mn/detail/12695)). Fine amounts for late statements or missing records are UNVERIFIED.

---

## 3. Financial statements and e-balance

### 3.1 Components
For IFRS and IFRS-for-SMEs entities the set is ([MoF instruction 208277](https://legalinfo.mn/mn/detail?lawId=208277)):

| Mongolian | English | Notes |
|---|---|---|
| Санхүүгийн байдлын тайлан (СБТ) | Statement of financial position | Two-year comparative; coded lines 1.x / 2.x |
| Орлогын дэлгэрэнгүй тайлан (ОДТ) | Statement of comprehensive income | Expenses by function (cost of sales, selling & marketing, G&A, finance, other) |
| Өмчийн өөрчлөлтийн тайлан (ӨӨТ) | Statement of changes in equity | Columns per equity component |
| Мөнгөн гүйлгээний тайлан (МГТ) | Statement of cash flows | **Direct method** per the MoF instruction extract (medium) |
| Тодруулга | Notes | Numbered note templates in Form A |

### 3.2 MoF Order 361 (14 Dec 2017): instruction, Form A, Form B
- Annex 1 is the *Санхүүгийн тайлан, тодруулгыг бэлтгэх заавар* (preparation instruction). Annex 2 is **Form A**, Annex 3 is **Form B** ([legalinfo 13210](https://legalinfo.mn/mn/detail?lawId=13210)). Listed companies' published statements carry the header "Сангийн сайдын 2017 оны 361 дүгээр тушаалын 3 дугаар хавсралт" ([example](https://user.tender.gov.mn/uploads/question/67e3c68bcddeb.pdf)).
- Use: **Form A = annual** statements with notes. **Form B = interim** (half-year) statements (medium; [ubaudit B form](https://www.ubaudit.mn/post/%D1%81%D0%B0%D0%BD%D1%85%D2%AF%D2%AF%D0%B3%D0%B8%D0%B9%D0%BD-%D1%82%D0%B0%D0%B9%D0%BB%D0%B0%D0%BD%D0%B3%D0%B8%D0%B9%D0%BD-%D0%B1-%D0%BC%D0%B0%D1%8F%D0%B3%D1%82)). A 2022 MoF order for cooperatives follows the same pattern (A annual, B half-year).
- **Caution (fact-check: unverified).** The note's own evidence conflicts with "Form B = interim only". The example above (a tender.gov.mn upload) is a set of *annual* statements, yet it carries the "361, Annex 3" header, i.e. Form B. Bidders on tender.gov.mn are often small companies. That fits another reading: Form A and Form B may differ by **class of entity** (for example full IFRS vs IFRS for SMEs, or a detailed vs a simplified format), not by period. Order 361 also repealed the old small-entity forms. This decides which form the micro ERP must produce, so read Annexes 2–3 of Order 361 (legalinfo 208281/208282) and the e-balance form picker before building REQ-ACC-11.
- Amendments: a 2023 MoF order (draft dated 25 Sep 2023) changed several **Form A notes**, including the fixed-asset, intangible, short-term liability, long-term loan and sales-revenue notes, and **removed note 25 "Investment"** ([mof.gov.mn draft](https://mof.gov.mn/files/uploads/discussion/2023.09.25_%D0%A1%D0%B0%D0%BD%D0%B3%D0%B8%D0%B9%D0%BD_%D1%81%D0%B0%D0%B9%D0%B4%D1%8B%D0%BD_2017_%D0%BE%D0%BD%D1%8B_361_%D0%B4%D2%AF%D0%B3%D1%8D%D1%8D%D1%80_%D1%82%D1%83%D1%88%D0%B0%D0%B0%D0%BB%D0%B0%D0%B0%D1%80_%D0%B1%D0%B0%D1%82%D0%BB%D0%B0%D0%B3%D0%B4%D1%81%D0%B0%D0%BD_%D0%A1%D0%B0%D0%BD%D1%85%D2%AF%D2%AF%D0%B3%D0%B8%D0%B9%D0%BD_%D1%82%D0%B0%D0%B9%D0%BB%D0%B0%D0%BD%D0%B3%D1%8B%D0%BD_%D1%82%D0%BE%D0%B4%D1%80%D1%83%D1%83%D0%BB%D0%B3%D0%B0,_%D0%BC%D0%B0%D1%8F%D0%B3%D1%82%D0%B0%D0%B4_%D0%BD%D1%8D%D0%BC%D1%8D%D0%BB%D1%82,_%D3%A9%D3%A9%D1%80%D1%87%D0%BB%D3%A9%D0%BB%D1%82_%D0%BE%D1%80%D1%83%D1%83%D0%BB%D0%B0%D1%85_%D1%82%D1%83%D1%85%D0%B0%D0%B9__.pdf)). Whether the final order was adopted, and its number and date, are UNVERIFIED. The Form A version must therefore be a versioned artifact in the ERP.

### 3.3 Statement line structure (representative)
Line codes confirmed by search extracts are marked ✔. The rest come from published Form A/B statements as recalled and are **UNVERIFIED**. Check them against the official annex before use.

**СБТ: assets**
- 1.1 Эргэлтийн хөрөнгө (current assets)
  - ✔ 1.1.1 Мөнгө, түүнтэй адилтгах хөрөнгө
  - ✔ 1.1.2 Дансны авлага
  - ✔ 1.1.3 Татвар, НДШ-ийн авлага
  - ✔ 1.1.4 Бусад авлага
  - ✔ 1.1.5 Бусад санхүүгийн хөрөнгө
  - ✔ 1.1.6 Бараа материал
  - 1.1.7 Урьдчилж төлсөн зардал/тооцоо
  - 1.1.8 Бусад эргэлтийн хөрөнгө
  - 1.1.9 Борлуулах зорилгоор эзэмшиж буй эргэлтийн бус хөрөнгө
- 1.2 Эргэлтийн бус хөрөнгө (non-current assets)
  - ✔ 1.2.1 Үндсэн хөрөнгө
  - ✔ 1.2.2 Биет бус хөрөнгө
  - 1.2.3 Биологийн хөрөнгө
  - 1.2.4 Урт хугацаат хөрөнгө оруулалт
  - 1.2.5 Хайгуул ба үнэлгээний хөрөнгө
  - 1.2.6 Хойшлогдсон татварын хөрөнгө
  - 1.2.7 Хөрөнгө оруулалтын зориулалттай үл хөдлөх хөрөнгө
  - 1.2.8 Бусад эргэлтийн бус хөрөнгө
- 1.3 Нийт хөрөнгө (total assets)

**СБТ: liabilities and equity**
- 2.1.1 Богино хугацаат өр төлбөр (current liabilities)
  - 2.1.1.1 Дансны өглөг
  - 2.1.1.2 Цалингийн өглөг
  - 2.1.1.3 Татварын өр
  - 2.1.1.4 НДШ-ийн өглөг
  - 2.1.1.5 Богино хугацаат зээл
  - 2.1.1.6 Хүүний өглөг
  - 2.1.1.7 Ногдол ашгийн өглөг
  - 2.1.1.8 Урьдчилж орсон орлого
  - 2.1.1.9 Нөөц (өр төлбөр)
  - 2.1.1.10 Бусад богино хугацаат өр төлбөр
- 2.1.2 Урт хугацаат өр төлбөр (non-current liabilities), including 2.1.2.1 Урт хугацаат зээл
- 2.2 Эздийн өмч (equity)
  - 2.2.1 Өмч
  - 2.2.2 Халаасны хувьцаа
  - 2.2.3 Нэмж төлөгдсөн капитал
  - 2.2.4 Хөрөнгийн дахин үнэлгээний нэмэгдэл
  - 2.2.5 Гадаад валютын хөрвүүлэлтийн нөөц
  - 2.2.6 Эздийн өмчийн бусад хэсэг
  - 2.2.7 Хуримтлагдсан ашиг
- 2.3 Нийт өр төлбөр ба эздийн өмч (total liabilities and equity)

**ОДТ** (order confirmed by the instruction extract; line numbers UNVERIFIED):
1. Борлуулалтын орлого (цэвэр)
2. Борлуулалтын өртөг
3. Нийт ашиг (алдагдал)
4. Other income: түрээсийн орлого, хүүний орлого, ногдол ашгийн орлого, эрхийн шимтгэлийн орлого, бусад орлого
5. Operating and other costs: борлуулалт, маркетингийн зардал; ерөнхий ба удирдлагын зардал; санхүүгийн зардал; бусад зардал. Бусад зардал includes donations, penalties and bad-debt expense.
6. Gains and losses: гадаад валютын ханшийн зөрүүний олз (гарз); disposal gains/losses on fixed and intangible assets and investments; бусад ашиг (алдагдал)
7. Татвар төлөхийн өмнөх ашиг
8. Орлогын татварын зардал
9. Татварын дараах ашиг
10. Зогсоосон үйл ажиллагааны ашиг (discontinued operations)
11. Тайлант үеийн цэвэр ашиг
12. Бусад дэлгэрэнгүй орлого / Нийт дэлгэрэнгүй орлого (other and total comprehensive income)

Sources: [MoF instruction 208277](https://legalinfo.mn/mn/detail?lawId=208277), [Form A 208281](https://legalinfo.mn/mn/detail?lawId=208281), [legalinfo ОДТ annex](https://legalinfo.mn/mn/detail?lawId=16759870498401), [legalinfo СБТ annex](https://legalinfo.mn/mn/detail?lawId=16759870762171), [legalinfo МГТ annex](https://legalinfo.mn/mn/detail?lawId=16759870536101).

### 3.4 Deadlines (in force)

| Who | What | Deadline | Confidence |
|---|---|---|---|
| All entities (IFRS and IFRS for SMEs) | Annual statements, Form A with notes, via e-balance | **10 February** of the next year. The e-balance window for FY2025 ran 1 Jan – 10 Feb 2026. (re-verified 2026-10; the MoF has granted ad-hoc extensions after system overloads, e.g. to 14 Feb) | high |
| Full-IFRS entities (4.1.1) | Half-year statements, Form B | **20 July** | medium ([commenda](https://www.commenda.io/mongolia/annual-compliance); search extract of Art. 10/12 of the law) |
| IFRS-for-SMEs entities (incl. micro) | Interim filing | None found. Annual only. (fact-check: unverified. The 20 July date is widely cited, but whether SMEs are exempt is not confirmed. See also the Form A/B caution in §3.2.) | medium |
| (historic) | "Quarterly to Treasury by the 20th" (EY, IFRS profile) | Probably superseded by the 2015 law | low |

No extensions exist. A corrected and re-sent report counts as filed on time if it is re-sent inside the window ([MoF e-balance article](https://mof.gov.mn/article/entry/e-balance)). Citizens petitioned Parliament to move the Feb 10 / Jul 20 dates away from the holidays, which shows these dates are the working practice ([petition](https://petition.parliament.mn/Detail?id=cec2eaca-a8fb-4030-8949-1326037e9287)).

### 3.5 e-balance (Санхүүгийн тайлангийн и-баланс)
- **Operator and URL:** MoF, `https://e-balance.mof.gov.mn/` (re-verify 2026-10: not confirmed; the host could not be reached and search returns no page for it, so it is seeded as `unverified`) ([MoF how-to](https://mof.gov.mn/article/entry/e-balance); [EN how-to](https://mof.gov.mn/en/article/entry/how-to-enter-and-send-financial-statements-into-e-balance-system)). Note that `ebalance.mn` is a **different, private** accounting help site.
- **Legal basis:** *Санхүүгийн тайланг цахим хэлбэрээр хүргүүлэх, хүлээн авах, тайлангийн мэдээллийг ашиглах журам*, revised by **MoF Order A/205 of 18 Nov 2024** ([legalinfo 17333248876151](https://legalinfo.mn/mn/detail?lawId=17333248876151)). The earlier receiving and consolidation procedure is at [legalinfo 210883](https://legalinfo.mn/mn/detail?lawId=210883).
- **How it works:**
  - Login credentials are issued, on the basis of the state-registration certificate, by the entity's **харилцагч санхүүгийн байгууллага** (assigned finance office, e.g. a district finance department). Large entities file with the MoF.
  - The system is open **from the first day to 24:00 of the last day** of the legal filing window.
  - The entity is fully responsible for the data. If the figures are wrong, the entity must correct and re-send.
  - Under the older procedure the receiving office reviews within **10 working days** (medium).
- **Data entry:** reports are **keyed into on-screen forms** that follow Form A/B. MoF and vendors publish keying tutorials ([MoF YouTube playlist](https://www.youtube.com/playlist?list=PLjl0wI7u9rgRkvRt9LigAMjIOqs1OIf90)). Excel versions of Forms A/B circulate from audit firms ([ubaudit A form](https://www.ubaudit.mn/post/%D1%81%D0%B0%D0%BD%D1%85%D2%AF%D2%AF%D0%B3%D0%B8%D0%B9%D0%BD-%D1%82%D0%B0%D0%B9%D0%BB%D0%B0%D0%BD%D0%B3%D0%B8%D0%B9%D0%BD-%D0%B0-%D0%BC%D0%B0%D1%8F%D0%B3%D1%82-%D1%85%D1%85%D0%BA)). **Whether e-balance accepts an official Excel or XML import file, or offers a public API, is UNVERIFIED.** We found no official import schema. A third-party GitHub repo mentions an "ITC developer portal (eTax / e-Balance)", but we did not check it.

---

## 4. Chart of accounts

### 4.1 Status
- The **model chart** *Аж ахуйн нэгж, байгууллагад мөрдөх НББ-ийн дансны үлгэрчилсэн заавар* was an annex to **Order 116 of 2000** of the Minister of Finance and Economy (СЭЗС). It was **repealed by MoF Order 13 of 17 Jan 2017**, together with the energy-sector chart and the consolidation instruction ([legalinfo 7495/205201](https://legalinfo.mn/mn/detail/7495/2/205201); [8608](https://legalinfo.mn/mn/detail/8608)). Order 361/2017 also repealed the small-entity forms and methods ([204653](https://legalinfo.mn/mn/detail?lawId=204653)).
- **Since 2017 ordinary companies have no mandatory chart.** Each entity builds and approves its own chart in its accounting policy, based on IFRS, and may add or remove accounts (search extract, medium).
- **Mandatory sector charts still exist:**
  - Banks: joint Mongolbank/MoF order A-294/340 of 24 Nov 2017 ([legalinfo 13181](https://legalinfo.mn/mn/detail?lawId=13181))
  - NGOs: MoF Order 386 of 28 Dec 2017 ([legalinfo 13211](https://legalinfo.mn/mn/detail/13211))
  - Cooperatives, savings and credit cooperatives, insurance and NBFIs (FRC)
  - Budget entities

  These are out of scope for a micro ERP.
- **Legacy numbering.** Some sector charts give 5-digit account numbers "whose first two digits equal the codes of the СЭЗС 2000/116 chart". A secondary source lists those two-digit groups as 10 current assets, 20 non-current assets, 30 short-term liabilities, 40 long-term liabilities, 41 equity, 51 revenue, 61 cost of sales, 70 G&A, 71 selling and marketing, 91 income-tax expense and 92 closing (summary) account. **UNVERIFIED (low).** Mongolian accountants and local software still use this pattern widely, so a seed that resembles it will feel familiar.

### 4.2 Proposed seed chart (design proposal, **not** an official chart)
4-digit codes. The class digit follows the Form A sections so that the mapping to lines is obvious.

| Class | Range | Representative accounts (code – name) | Form A line |
|---|---|---|---|
| 1 Assets | 1000–1999 | 1100 Касс (cash on hand, MNT/FX); 1110 Харилцах данс (bank); 1200 Дансны авлага (trade receivables); 1250 Найдваргүй авлагын хасагдуулга (allowance); 1300 Татвар, НДШ-ийн авлага (incl. VAT receivable); 1350 Бусад авлага; 1400 Бараа материал (goods, materials, WIP, finished goods); 1500 Урьдчилж төлсөн зардал/тооцоо; 1600 Үндсэн хөрөнгө (cost, by class); 1690 Хуримтлагдсан элэгдэл; 1700 Биет бус хөрөнгө; 1790 Хуримтлагдсан хорогдуулалт; 1800 Хойшлогдсон татварын хөрөнгө | 1.1.1–1.2.8 |
| 2 Liabilities | 2000–2999 | 2100 Дансны өглөг; 2200 Цалингийн өглөг; 2300 Татварын өр (VAT payable, CIT payable, PIT withheld); 2350 НДШ-ийн өглөг; 2400 Богино хугацаат зээл; 2450 Хүүний өглөг; 2500 Урьдчилж орсон орлого; 2600 Нөөц; 2700 Урт хугацаат зээл | 2.1.1.x / 2.1.2.x |
| 3 Equity | 3000–3999 | 3100 Өмч (charter capital); 3200 Нэмж төлөгдсөн капитал; 3300 Дахин үнэлгээний нэмэгдэл; 3400 Хуримтлагдсан ашиг (retained earnings); 3500 Тайлант үеийн ашиг (current-year result) | 2.2.x |
| 5 Revenue | 5000–5999 | 5100 Борлуулалтын орлого; 5190 Борлуулалтын буцаалт, хөнгөлөлт (contra) | ОДТ 1 |
| 6 Cost of sales | 6000–6999 | 6100 Борлуулсан барааны өртөг | ОДТ 2 |
| 7 Operating expenses | 7000–7999 | 7100 Борлуулалт, маркетингийн зардал; 7200 Ерөнхий ба удирдлагын зардал (salaries, НДШ employer share, rent, utilities, depreciation, communication, fuel …) | ОДТ op. expenses |
| 8 Other income/expense, gains/losses | 8000–8999 | 8100 Түрээс, хүү, ногдол ашгийн орлого; 8200 Бусад орлого; 8300 Санхүүгийн зардал; 8400 Бусад зардал (penalties, donations, bad debt); 8500 Ханшийн зөрүүний олз (гарз), realised and unrealised; 8600 Хөрөнгө данснаас хассаны олз (гарз) | ОДТ other lines |
| 9 Income tax & closing | 9000–9999 | 9100 Орлогын татварын зардал; 9900 Орлого, зардлын нэгдсэн данс (closing/summary) | ОДТ tax |

Each posting account carries a **Form A line code** (СБТ/ОДТ) and a **cash-flow category** (МГТ, direct method), so the statements can be produced directly from the ledger.

---

## 5. Primary documents (анхан шатны баримт)

### 5.1 Legal basis
- The law requires a complete primary document before any posting, signatures plus stamp, and a digital signature for electronic documents (see 2.7). Primary-document **forms and their completion instructions are set by the MoF**.
- **MoF Order 347 of 5 Dec 2017**, *Өмчийн бүх хэлбэрийн аж ахуйн нэгж, байгууллагад нийтлэг хэрэглэгдэх анхан шатны бүртгэлийн маягт*, approved the common primary forms and the filling instruction ([legalinfo 13053](https://legalinfo.mn/mn/detail/13053); [instruction 208147](https://legalinfo.mn/mn/detail?lawId=208147)). An MoF draft amending Order 347 was published in 2022. Its status is UNVERIFIED.
- **MoF Order 100 of 8 May 2018**, *Аж ахуйн нэгж, байгууллагад нийтлэг хэрэглэгдэх НББ-ийн маягт, хөтлөх аргачлал*, covers the accounting registers and journals. Examples: a **purchase journal** for credit purchases of inventory, supplies and fixed assets, and a **cash-transaction journal** for cash purchases ([legalinfo 13454](https://legalinfo.mn/mn/detail?lawId=13454)).

### 5.2 Common forms relevant to a micro company
Form codes come from search extracts of the Order 347 instruction and practitioner guides (medium). Required fields follow the instruction's common pattern; the exact field list is UNVERIFIED.

| Code | Name | Use | Key fields |
|---|---|---|---|
| НХМаягт **МХ-1** | Кассын (бэлэн мөнгөний) орлогын баримт | Cash receipt voucher | Org name and register no.; voucher no. (sequential); date; received from; purpose (гүйлгээний утга); corresponding account; amount in figures and **in words**; signatures of chief accountant, cashier and payer; stamp |
| НХМаягт **МХ-2** | Кассын зарлагын баримт | Cash payment voucher | As МХ-1, plus recipient ID (register/ID no.) and the approver's signature (director) |
| НХМаягт **ТМ-1** | Нэхэмжлэх | Invoice for goods and services delivered | Sequential no.; date; seller and buyer name, register no., address, **bank and account no.**; lines (description, unit, qty, unit price, amount); VAT; total in words; due date; signatures of director and accountant; stamp |
| НХМаягт ТМ-2 … ТМ-4 | Advance report, reconciliation certificate (тооцоо нийлсэн акт), driver's sheet | Settlement documents | Per form |
| НХМаягт **БМ-1…БМ-4** (and further БМ forms) | Inventory receipt, **орлогын баримт**, **зарлагын баримт**, release permit, etc. | Goods receipt and issue | Doc no.; date; warehouse; supplier/receiver; item code and name; unit; qty; unit cost; amount; signatures of storekeeper and receiver |
| Inventory-count forms (тооллогын хуудас, тулгалт) | Count sheet, count-difference report | Mandatory year-end count | Item; book qty; counted qty; difference; value; commission signatures |
| НХМаягт **ҮХ-1** | Үндсэн хөрөнгө хүлээн авах, шилжүүлэх акт | FA acquisition or transfer, approved by the director. Supporting docs go to the accountant **within 3 working days**. | Asset ID; description; cost; useful life; location; commission signatures |
| НХМаягт ҮХ-2 / ҮХ-3 | FA improvement/major repair acceptance; FA write-off (ашиглалтаас хасах) | Capex and disposals | Per form |
| Payroll forms | Timesheet, payroll sheet | Monthly payroll | Per form (UNVERIFIED codes) |

- **eBarimt** (VAT e-receipt, PosAPI 3.0) is the tax-law proof for B2C and B2B sales and for input-VAT credit. For sales the ERP keeps **both** the accounting primary document (invoice or voucher) and the eBarimt receipt ID. See the separate eBarimt note.
- The company **stamp (тамга)** is still part of the validity rule in the law extracts. Electronic documents need a digital signature instead (2.7).

---

## 6. Inventory and fixed assets: measurement rules

### 6.1 In force: IFRS for SMEs (2015 edition) and IAS for IFRS entities
- **Inventories (IFRS for SMEs Section 13 / IAS 2):** measured at the **lower of cost and estimated selling price less costs to complete and sell**. Cost formula is **FIFO or weighted average**. **LIFO is not permitted.** Specific identification is required for items that are not interchangeable. The same formula applies to inventories of similar nature and use. Write-downs to selling price less costs come under Section 27 and are reversed when the reason goes away.
- **PPE (Section 17 / IAS 16):**
  - Initial measurement at cost.
  - Subsequent measurement by the **cost model**. The revaluation model has been permitted since the 2015 amendments.
  - Depreciation over the useful life to residual value, by significant component.
  - Methods: straight-line, diminishing balance or units-of-production.
  - Useful life, residual value and method are reviewed when there is an **indication** of change.
- **Intangibles (Section 18):** all are treated as having a finite life and are amortised. If the useful life cannot be estimated reliably, the 2015 edition (para. 18.20) says the life is **management's best estimate, but not more than 10 years**. The flat 10-year *presumption* was the 2009 wording. Model this as a policy life capped at 10 years, not as a fixed 10-year default (fact-check: corrected).
- **Capitalisation threshold:** no statutory threshold was found. It is an accounting-policy choice (UNVERIFIED that none exists).
- **Tax book differs from the accounting book.** Under the CIT Law (2019, effective 2020) tax depreciation is straight-line with statutory lives. PwC tax summaries cite buildings **25 years** (40 in some cases), machinery and equipment **10 years**, computers and software **2 years** ([PwC tax summaries](https://taxsummaries.pwc.com/mongolia/corporate/deductions)). Another extract says 3 years for computers, which conflicts, so these lives are medium confidence. Fact-check: the 2-year life for computers and software is the rule under the 2019 CIT Law (effective 2020). The 3-year figure comes from the pre-2020 CIT Law. (re-verified 2026-10: PwC deductions page and the KPMG 2023 changes PDF. An MTA PDF giving 40/10/10 years reproduces the pre-2020 law.) The 40-year building life applies only to holders of mineral, radioactive-mineral or petroleum licences. "Other non-current assets" are 10 years. These values match `mn-tax.md` §3.4. The MoF methodology for **reconciling financial and tax-report differences** applies ([legalinfo 211184](https://legalinfo.mn/mn/detail?lawId=211184)).
- **Foreign currency:** monetary items are retranslated at the **Mongolbank closing rate**. Differences go to profit or loss as ханшийн зөрүүний олз/гарз ([ХЗХ НББ заавар](https://legalinfo.mn/mn/detail?lawId=204659), by analogy).

### 6.2 From 2027-01-01 (IASB)
- The **third edition of IFRS for SMEs** was issued on 27 Feb 2025 and is effective for periods beginning **on or after 1 Jan 2027**, with early application permitted ([ICAEW](https://www.icaew.com/insights/viewpoints-on-the-news/2025/feb-2025/iasb-publishes-third-edition-of-ifrs-for-smes-accounting-standard); [KPMG](https://kpmg.com/xx/en/our-insights/ifrg/2024/ifrs-sme.html)). Main changes:
  - **Section 23 is rewritten on the IFRS 15 five-step model**, as "Revenue from Contracts with Customers".
  - A **new Section 12, Fair Value Measurement** (based on IFRS 13).
  - Section 2 is aligned with the 2018 Conceptual Framework.
  - Inventory and PPE rules are substantially unchanged.
- Whether the MoF has adopted or translated the third edition for Mongolia is **UNVERIFIED**. The ERP must support IFRS 15-style revenue recognition anyway: performance obligations, and for a micro company mostly point-in-time sales.

---

## 7. Typical month-end and year-end closing for a Mongolian micro company

Tax deadlines are shown only as calendar anchors. They come from [PwC tax administration](https://taxsummaries.pwc.com/mongolia/corporate/tax-administration) via search (medium) and are authoritative in the tax note.

**Monthly (by working day 5–10 of the next month)**
1. **Cut-off:**
   - Every sale has an invoice (ТМ-1) and an eBarimt.
   - Every cash movement has an МХ-1/МХ-2 voucher.
   - Every goods movement has a БМ document.
2. **Bank and cash reconciliation:** import the bank statement, match it, and count the cash (касс тулгалт).
3. **Reconcile eBarimt with the ledger:**
   - Sales and output VAT against issued receipts.
   - Purchases and input VAT against received receipts.
   - The **VAT return is monthly, due by the 10th** of the next month.
4. **Payroll:**
   - Calculate PIT (ХХОАТ) and social insurance (НДШ, employee and employer shares).
   - File the social-insurance return by about the **5th**. Pay PIT and НДШ by about the **10th**. (fact-check: unverified. `mn-tax.md` also marks the monthly PIT due date as UNVERIFIED, so keep these dates configurable.) (re-verify 2026-10: one secondary source cites Social Insurance General Law art. 25.1 for the 5th and PIT Law art. 25.6 for the 10th; both are still `unverified` in the seed.)
5. **Depreciation and amortisation:** run monthly or by policy.
6. **Accruals and prepayments:** utilities, rent, interest, deferred revenue.
7. **FX revaluation:** retranslate monetary FX balances (cash, bank, AR, AP, loans) at the **Mongolbank rate on the last day**, and post unrealised gain or loss.
8. **Inventory:** post costing adjustments (FIFO or weighted average). Post a write-down if net realisable value is below cost.
9. **CIT advance:** pay by the **25th**. Quarter months only: quarterly CIT and PIT-withholding returns by the **20th** of the month after quarter-end.
10. Review the trial balance, then **lock the period**.

**Year-end (December close, statements by 10 Feb)**
1. **Physical count** of inventory, fixed assets, cash and balances with counterparties (тооллого; reconciliation acts with major customers and suppliers). Post the differences.
2. **Bad-debt allowance; impairment check** of inventory and PPE; review useful lives and residual values when there are indications.
3. **Provisions:** e.g. vacation pay, warranties, litigation.
4. **Current tax:**
   - Compute CIT from the tax adjustments (ledger to tax base).
   - Deferred tax, if the policy and the standard require it (simplified for SMEs).
   - The **annual CIT return is due 10 Feb**. (re-verify: corrected for 2027: KPMG reports 5 March from 2027-01-01. It is not yet confirmed whether FY2026 returns already use it.)
5. **Closing entries:** close revenue and expense accounts to the summary account (Орлого, зардлын нэгдсэн данс), then to **current-year result and retained earnings**. In local practice this is posted on a closing date.
6. **Prepare Form A:** СБТ, ОДТ, ӨӨТ, МГТ and notes, plus prior-year comparatives. The CEO and chief accountant sign.
7. **Key the statements into e-balance** between 1 Jan and 10 Feb and keep the submission evidence. Audit is required only for in-scope entities. Micro LLCs are normally not in scope (UNVERIFIED; see the Audit law).
8. **Archive** the year's primary documents, registers and statements for ≥10 years.

---

## 8. What changes on 2027-01-01

| Area | Change | Source | Confidence |
|---|---|---|---|
| Tax package | Passed **26 June 2026**, effective **1 Jan 2027**: amendments to the CIT Law, VAT Law, PIT Law and General Tax Law. The VAT threshold clause and the consumer-refund tiers start **1 Jul 2027** | [PwC 04/2026](https://www.pwc.com/mn/en/tax_alerts/tax_alert_04_2026.html) | high (re-verified 2026-10) |
| VAT | Registration is mandatory once operating sales reach **MNT 400m** in 12 consecutive months. The start date is **2027-07-01** (re-verify: corrected) rather than 2027-01-01 (Mongolian press, [gogo.mn](https://gogo.mn/r/v1656y), via `mn-tax.md`). A simplified VAT regime (deemed purchases of 90% of quarterly sales) is reported for businesses below that threshold. Compliant taxpayers may defer VAT by up to 2 months. | PwC; [vatupdate](https://www.vatupdate.com/2026/07/09/mongolia-uses-vat-relief-as-cornerstone-of-tax-reform-agenda/) | high (amount) / **medium (start date, disputed)** / medium (simplified regime detail) (fact-check: corrected) |
| CIT | New **15% band for MNT 6–10bn**; 25% only above **MNT 10bn**; the **90% CIT credit** threshold rises from MNT 1.5bn to **2.5bn** | PwC; search summary | high (re-verified 2026-10) |
| Tax administration | A "Taxpayer Compliance Level" score of up to 100 points, set quarterly and annually | PwC | medium |
| IFRS for SMEs | Third edition is effective for periods from 1 Jan 2027 (IASB). Mongolian adoption is UNVERIFIED. | ICAEW/KPMG | high (IASB) / UNVERIFIED (MN) |
| Law on Accounting | **No 2026 amendment found** | search | UNVERIFIED |
| Statement forms (Order 361) | No new form version for FY2026 or FY2027 found | search | UNVERIFIED |

Design consequence: VAT registration status, the VAT regime (standard or simplified) and the CIT regime must be **date-effective parameters** per company, not booleans.

---

## 9. Key facts

| Fact | Value | Effective from | Source URL | Confidence |
|---|---|---|---|---|
| Law on Accounting (revised) adopted | 19 June 2015 | 2016-01-01 | https://legalinfo.mn/en/edtl/16230949065051 | medium |
| Frameworks allowed (Art. 4.1) | IFRS; IFRS for SMEs; IPSAS | 2016-01-01 | https://legalinfo.mn/mn/detail?lawId=11191 | high |
| Framework for micro/SME companies | IFRS for SMEs (no separate micro standard) | in force | https://legalinfo.mn/mn/detail?lawId=204653 | medium |
| Entity classification procedure | MoF Order A/25, 6 Feb 2025 (replaces Order 41/2016) | 2025 | https://legalinfo.mn/mn/detail?lawId=17355848942361 | medium (re-verified 2026-10) |
| IFRS-class revenue criterion | ≥ MNT 2.5bn sales (other criteria unknown) | 2025 | same | medium (re-verified 2026-10 from search extracts; still single-sourced) |
| Micro enterprise (SME law 2019) | ≤ 10 employees and ≤ MNT 300m sales | 2019 | https://legalinfo.mn/mn/detail/14525 | medium |
| Fiscal year | 1 Jan – 31 Dec | in force | https://legalinfo.mn/mn/detail?lawId=11191 | high |
| Book language and currency | Mongolian; MNT; FX at Mongolbank rate | in force | same | high |
| Annual statements deadline | 10 February (e-balance) | in force | https://mof.gov.mn/article/entry/e-balance | high (re-verified 2026-10) |
| Half-year statements | 20 July, full-IFRS entities only | in force | https://www.commenda.io/mongolia/annual-compliance | medium |
| e-balance procedure | MoF Order A/205, 18 Nov 2024 | 2024-11 | https://legalinfo.mn/mn/detail?lawId=17333248876151 | medium |
| Statement forms | MoF Order 361, 14 Dec 2017: instruction + Form A (annual) + Form B (interim) | 2017-12 | https://legalinfo.mn/mn/detail?lawId=13210 | medium |
| Cash-flow method in MoF form | Direct | in force | https://legalinfo.mn/mn/detail?lawId=208277 | medium |
| Model chart of accounts | Repealed by MoF Order 13, 17 Jan 2017; no mandatory chart for companies | 2017-01-17 | https://legalinfo.mn/mn/detail/7495/2/205201 | medium |
| Primary-document forms | MoF Order 347, 5 Dec 2017 (МХ-1/2, ТМ-1, БМ-*, ҮХ-*) | 2017-12 | https://legalinfo.mn/mn/detail/13053 | medium |
| Accounting registers/journals | MoF Order 100, 8 May 2018 | 2018-05 | https://legalinfo.mn/mn/detail?lawId=13454 | medium |
| Electronic primary docs | Must carry a digital signature; paper ones need signatures and stamp | in force | https://legalinfo.mn/mn/detail?lawId=11191 | medium |
| Retention | ≥ 10 years unless the Archives law says otherwise | in force | https://legalinfo.mn/mn/detail?lawId=11191 | medium (re-verified 2026-10) |
| Approved accounting software | Art. 17.1.11 list; requirements in MoF Order 47 (2018); MonICPA monitors | in force | https://mof.gov.mn/article/entry/12-20 | medium (re-verified 2026-10; full checklist still missing) |
| Inventory count | Before annual statements; on custodian change | in force | https://legalinfo.mn/mn/detail?lawId=11191 | medium |
| Tax reform package | Passed 26 Jun 2026: VAT threshold MNT 400m; CIT 15% band 6–10bn | 2027-01-01; VAT threshold **2027-07-01** (re-verify: corrected) | https://www.pwc.com/mn/en/tax_alerts/tax_alert_04_2026.html | high (amounts) / medium (dates) |
| IFRS for SMEs 3rd edition | Revenue per IFRS 15 model; fair-value section | periods ≥ 2027-01-01 (IASB) | https://www.icaew.com/insights/viewpoints-on-the-news/2025/feb-2025/iasb-publishes-third-edition-of-ifrs-for-smes-accounting-standard | high (MN adoption UNVERIFIED) |
| Tax depreciation lives | Buildings 25y (40y for mineral/petroleum licence holders); machinery 10y; computers/software 2y (3y was the pre-2020 rule); other 10y | 2020-01-01 | https://taxsummaries.pwc.com/mongolia/corporate/deductions | medium-high (re-verified 2026-10) |
| CIT/VAT filing cadence | CIT quarterly by the 20th after quarter end, annual by 10 Feb; VAT monthly by the 10th | in force (2027: annual 5 March, one source) | https://taxsummaries.pwc.com/mongolia/corporate/tax-administration | high (re-verified 2026-10) |

---

## 10. Implications for the ERP design

Each item is a concrete requirement (REQ-ACC-nn) for the specs.

**Company setup and parameters**
1. **REQ-ACC-01 Company profile.** Store:
   - Legal name in Mongolian
   - State register no. (регистрийн дугаар, 7 digits for legal entities)
   - Legal form
   - **Reporting framework** {IFRS for SMEs, IFRS}, date-effective
   - Classification (micro/small/medium/large) with its source (A/25 assessment)
   - Assigned finance office for e-balance (харилцагч санхүүгийн байгууллага)
   - VAT status and regime (standard / simplified / not registered), date-effective
   - CIT regime, date-effective
   - CEO and chief accountant (names and IDs, used on signatures)
2. **REQ-ACC-02 Fiscal calendar** fixed at Jan–Dec, with monthly periods. A fiscal year other than the calendar year is not allowed. Period states: open → soft-locked → closed. Postings into closed periods are blocked; corrections are posted in an open period with a reference.
3. **REQ-ACC-03 Currency.** MNT is the only functional and reporting currency.
   - Store transaction currency, amount and rate on every line.
   - Rates table keyed by **Mongolbank official rate per date** (source = Mongolbank).
   - Use the transaction-date rate on posting.
   - Month-end revaluation job using the last-day rate.
   - Realised and unrealised FX accounts.
4. **REQ-ACC-04 Language.** All statutory outputs (vouchers, invoices, registers, statements) render in **Mongolian Cyrillic**. English is an optional second label. Amount-in-words must be generated in Mongolian (төгрөг/мөнгө).

**Ledger integrity (also needed for MoF Order 47 approval)**
5. **REQ-ACC-05 Double entry and accrual only.** Every posting is balanced. There is no single-entry or cash-basis mode.
6. **REQ-ACC-06 Immutable ledger.**
   - No delete or update of posted entries. Corrections go through reversal (storno) or an adjusting entry.
   - Full **audit trail** (who, when, before and after) on master data and documents.
   - Gapless sequential numbering per document type and year.
   - This meets the "cannot be hidden, concealed or embezzled" requirement.
7. **REQ-ACC-07 Primary-document gate.** A posting is impossible without a source document record: type, number, date, counterparty, attachments, signatures or approvals. Manual journals require an attached document (scan, PDF or e-document) and an approver.
8. **REQ-ACC-08 Signatures and approval workflow.**
   - Capture the signer roles (made by / approved by / checked by, i.e. director, chief accountant, cashier, storekeeper).
   - For electronic documents, support **digital-signature** integration (PKI per the Digital Signature Law) or at least a signed-hash record.
   - The stamp image is a configurable print element.
9. **REQ-ACC-09 Retention.**
   - Retain documents, attachments, ledgers and statements for **≥ 10 years**, as a configurable parameter defaulting to 10.
   - Purging data that is still inside the retention window is prohibited.
   - Provide an export or archive package per fiscal year: PDF/A of registers and statements plus CSV/JSON data.

**Chart of accounts and reporting**
10. **REQ-ACC-10 Chart of accounts.**
    - The company owns and edits its chart.
    - Ship the seed in §4.2 (4-digit, class-based).
    - Every posting account must carry:
      - (a) a **Form A line code** (СБТ or ОДТ)
      - (b) a cash-flow category for the **direct-method МГТ**
      - (c) an equity-component tag for the ӨӨТ
      - (d) a tax-adjustment tag (for the CIT reconciliation)
    - Validation: posting accounts cannot be left unmapped at period close.
11. **REQ-ACC-11 Statutory statements.**
    - Generate **Form A** (annual: СБТ, ОДТ, ӨӨТ, МГТ, notes) and **Form B** (interim), with prior-period comparatives, in MNT. Rounding/units (MNT or thousand MNT) is a parameter.
    - Statement templates are **versioned data** (Order 361 plus amendments), not code.
    - Cash flow uses the **direct method**, built from cash and bank entries classified by counter-account or category.
12. **REQ-ACC-12 e-balance support.** Produce a line-by-line "keying sheet" that mirrors the e-balance screen order, plus an XLSX in the Form A/B layout. No e-balance import or API is confirmed, so treat direct submission as a **future adapter** behind an interface. Store the submission status, date and evidence (screenshot/PDF) per year.
13. **REQ-ACC-13 Filing calendar.** Configure deadlines: annual statements 10 Feb; half-year 20 July (only if framework = IFRS); tax dates from the tax module. Show alerts and the period-close status.
14. **REQ-ACC-14 Registers per MoF Order 100.**
    - Cash book (касс), bank book, purchase journal, sales journal, general journal, general ledger, trial balance (гүйлгээ баланс), AR and AP subledgers, inventory and FA registers.
    - All printable and exportable.

**Primary documents**
15. **REQ-ACC-15 Standard forms.**
    - Printable templates for **МХ-1, МХ-2, ТМ-1 (invoice), БМ receipt/issue, the inventory count sheet, ҮХ-1, ҮХ-2, ҮХ-3**.
    - Common header: org name, register no., form code, sequential no., date. Lines; amount in figures and words; signer blocks.
    - The exact field list must be checked against the Order 347 annex.
16. **REQ-ACC-16 Invoice ↔ eBarimt linkage.** The sales invoice holds the eBarimt receipt ID/ДДТД and its status. VAT reports reconcile ledger VAT with eBarimt totals per month.

**Inventory and fixed assets**
17. **REQ-ACC-17 Inventory costing.**
    - **FIFO or moving weighted average**, chosen per company in the accounting policy and changeable only at a fiscal-year boundary. **No LIFO.**
    - NRV write-down and reversal.
    - Physical count document with automatic adjustment postings.
18. **REQ-ACC-18 Fixed assets.**
    - Asset card: ID, class, acquisition date and cost, location, custodian.
    - **Two depreciation books**: an accounting book (policy life, residual, method) and a tax book (statutory lives, straight-line).
    - Monthly depreciation run; disposal with gain/loss.
    - Record of the 3-day ҮХ-1 hand-over.
19. **REQ-ACC-19 Book-tax reconciliation.** Tag permanent and temporary differences and produce the reconciliation behind the CIT return (MoF methodology 211184).

**Closing**
20. **REQ-ACC-20 Close checklist** (§7) built into the product: bank/cash rec, eBarimt rec, payroll, depreciation, accruals, FX revaluation, inventory, tax accruals, lock. Year-end adds the count, allowances, the closing entry to retained earnings on a closing date, Form A, sign-off and e-balance.
21. **REQ-ACC-21 Software-approval readiness.**
    - Maintain a compliance matrix against **MoF Order 47** and the evaluation procedure.
    - Keep the documentation and test evidence needed to get onto the MoF approved-software list before go-live.
22. **REQ-ACC-22 Date-effective legal parameters.** VAT threshold (MNT 400m from 2027), CIT bands and the 90%-credit threshold, statement-form version and IFRS-for-SMEs edition are all stored with `valid_from`, so the 2027 changes do not need code changes.

---

## 11. Open questions

1. **MoF Order 47 (2018)**: what is the full functional checklist and evaluation procedure for approved accounting software? Is it now administered by MonICPA? What does approval cost and how long does it take? *(Blocker for go-to-market.)*
2. **e-balance:** is there an official Excel or XML import format, or an API (e.g. via the ITC developer portal)? Does the e-balance login use a digital signature (e-sign/ДАН)?
3. **Form A/B:** what are the exact current line codes and note templates after the 2023 amendment of Order 361? What is the final order number and date? Has a new version been issued for FY2026?
4. **MoF Order A/25 (2025):** what are the exact thresholds (revenue, assets, employees) that move an entity from IFRS for SMEs to full IFRS? *(2026-10: the sales ≥ MNT 2.5 bn criterion is confirmed by extracts; the asset and headcount criteria are still unknown.)*
5. Has the MoF **adopted the third edition of IFRS for SMEs** for periods from 2027-01-01? Is there a Mongolian translation?
6. **Retention:** is the 10-year period in the Accounting Law exact (article and text)? Does the Archives law set longer periods for payroll records?
7. **Order 347 forms:** what is the complete list of form codes (МХ, ТМ, БМ, ҮХ, payroll) and the mandatory fields? Is the 2022 draft amendment in force?
8. **Stamp (тамга):** is it still legally required on primary documents and statements, or is a digital signature enough for e-documents in all cases?
9. Is a **micro LLC** exempt from the statutory audit (Audit law scope), and are there any simplified notes for micro entities in the Order 361 instruction?
10. **Penalties** under the Law on Infractions: what are the amounts for late or missing statements and for missing primary documents? (Needed for alert texts.)
11. ~~**Tax depreciation:** is it 2 or 3 years for computers and software? Do building lives differ by sector (25 vs 40)?~~ Largely answered by the fact-check: 2 years under the 2019 CIT Law, 3 years under the old law. 40 years applies to mineral and petroleum licence holders. Confirm the article number in the CIT Law text.
12. Was any **amendment to the Law on Accounting** passed with the June 2026 tax package or the July 2026 Law on Economic Freedom?
13. ~~**VAT 400m threshold start date:** is it 2027-01-01 or 2027-07-01?~~ **Resolved 2026-10: 2027-07-01.** (re-verify: corrected)
14. **Form A vs Form B:** is the split annual/interim, or by entity class? See the §3.2 caution. *(Added by fact-check. It blocks REQ-ACC-11.)*

---

## Fact-check log

Independent pass, 2026-10-06. **Limits:** no new web search could run, because the shared WebSearch budget for this run was exhausted. Direct fetches of legalinfo.mn, mof.gov.mn, pwc.com, taxsummaries.pwc.com, ifrs.org, icaew.com and vatupdate.com were blocked by the egress proxy. Verdicts therefore mean:
- **confirmed (knowledge):** matches stable, widely documented facts known to the reviewer before this run. The URL is the canonical place to re-check the fact, and was **not** fetched in this pass.
- **corrected:** changed in the note, either because the claim was wrong, or because its confidence or date was overstated given conflicting evidence (including the sibling note `mn-tax.md`).
- **unverifiable:** could not be re-checked independently in this pass. The item is tagged "(fact-check: unverified)" in the body.

| Claim | Verdict | Source URL |
|---|---|---|
| Law on Accounting (revised) adopted 19 Jun 2015, effective 1 Jan 2016 | confirmed (knowledge) | https://legalinfo.mn/en/edtl/16230949065051 |
| Art. 4.1 frameworks: IFRS / IFRS for SMEs / IPSAS | confirmed (knowledge) | https://legalinfo.mn/mn/detail?lawId=11191 |
| Annual financial statements due 10 February of the following year | confirmed (knowledge) | https://mof.gov.mn/article/entry/e-balance |
| Half-year statements due 20 July, and only for full-IFRS entities (SMEs annual only) | unverifiable (the date is widely cited; the SME exemption is not confirmed) | https://legalinfo.mn/mn/detail?lawId=11191 |
| Classification procedure = MoF Order A/25 of 6 Feb 2025, replacing Order 41/2016 | unverifiable | https://legalinfo.mn/mn/detail?lawId=17355848942361 |
| Full-IFRS class threshold: sales ≥ MNT 2.5bn | unverifiable | https://legalinfo.mn/mn/detail?lawId=17355848942361 |
| SME law (2019): micro = ≤10 employees and ≤ MNT 300m sales | unverifiable | https://legalinfo.mn/mn/detail/14525 |
| e-balance at e-balance.mof.gov.mn; procedure revised by MoF Order A/205 of 18 Nov 2024 | unverifiable | https://legalinfo.mn/mn/detail?lawId=17333248876151 |
| Order 361 (14 Dec 2017): Form A = annual, Form B = interim | unverifiable, with an internal conflict flagged (annual statements carry the Annex 3 / Form B header) | https://legalinfo.mn/mn/detail?lawId=13210 |
| Model chart of accounts (СЭЗС 116/2000) repealed by MoF Order 13 of 17 Jan 2017; no mandatory chart | unverifiable | https://legalinfo.mn/mn/detail/7495/2/205201 |
| Primary-document forms: MoF Order 347 of 5 Dec 2017 | unverifiable | https://legalinfo.mn/mn/detail/13053 |
| Registers and journals: MoF Order 100 of 8 May 2018 | unverifiable | https://legalinfo.mn/mn/detail?lawId=13454 |
| Retention ≥ 10 years | unverifiable | https://legalinfo.mn/mn/detail?lawId=11191 |
| Approved-software list (Art. 17.1.11); requirements in MoF Order 47 dated 5 Mar 2018; MonICPA monitors | unverifiable | https://mof.gov.mn/article/entry/2018-47 |
| Digital Signature Law (revised) adopted 17 Dec 2021 | unverifiable. Lead added: likely renamed *Цахим гарын үсгийн тухай хууль*, effective 1 May 2022 | https://legalinfo.mn/mn/detail?lawId=574 |
| Tax limitation period cut from 5 to 4 years (2019 General Tax Law) | unverifiable | https://www.pwc.com/mn/en/tax_alerts/pdf/tax_alert_08_2019.pdf |
| Tax package passed 26 Jun 2026, effective 1 Jan 2027 | unverifiable (consistent with `mn-tax.md`) | https://www.pwc.com/mn/en/tax_alerts/tax_alert_04_2026.html |
| VAT registration threshold MNT 400m effective 1 Jan 2027, rated "high" | **corrected**: the start date is disputed (2027-01-01 vs 2027-07-01), so confidence on the date is now medium | https://gogo.mn/r/v1656y |
| CIT: 15% band for MNT 6–10bn, 25% above 10bn; 90% credit threshold 1.5bn → 2.5bn | unverifiable (consistent with `mn-tax.md`) | https://taxsummaries.pwc.com/mongolia/corporate/taxes-on-corporate-income |
| IFRS for SMEs 3rd edition issued 27 Feb 2025; effective for periods from 1 Jan 2027; early application permitted | confirmed (knowledge) | https://www.ifrs.org/issued-standards/ifrs-for-smes/ |
| 3rd edition: Section 23 rewritten on the IFRS 15 five-step model; new Section 12 Fair Value Measurement; Section 2 aligned with the 2018 Conceptual Framework | confirmed (knowledge) | https://www.ifrs.org/issued-standards/ifrs-for-smes/ |
| Intangibles: "default 10 years" when the life cannot be estimated | **corrected**: 2015 edition para. 18.20 says management's best estimate, not more than 10 years | https://www.ifrs.org/issued-standards/ifrs-for-smes/ |
| Inventories (Section 13): lower of cost and selling price less costs to complete and sell; FIFO or weighted average; LIFO prohibited; specific identification for non-interchangeable items | confirmed (knowledge) | https://www.ifrs.org/issued-standards/ifrs-for-smes/ |
| PPE (Section 17): revaluation model allowed since the 2015 amendments; review of life, residual value and method on an indication | confirmed (knowledge) | https://www.ifrs.org/issued-standards/ifrs-for-smes/ |
| Tax depreciation: buildings 25y (40y), machinery 10y, computers/software 2y | confirmed (knowledge), with a clarification: 40y = mineral/petroleum licence holders; 3y = pre-2020 law | https://taxsummaries.pwc.com/mongolia/corporate/deductions |
| Tax calendar: VAT monthly by the 10th; CIT quarterly by the 20th after the quarter; annual CIT by 10 Feb | confirmed (knowledge; agrees with `mn-tax.md`) | https://taxsummaries.pwc.com/mongolia/corporate/tax-administration |
| Social-insurance return by about the 5th; PIT and НДШ paid by about the 10th | unverifiable | https://taxsummaries.pwc.com/mongolia/corporate/tax-administration |
| Legal-entity state register number is 7 digits | confirmed (knowledge). Keep it separate from the eBarimt/ETAX taxpayer number (ТТД), which may differ. | n/a: check the Law on State Registration of Legal Persons on legalinfo.mn |
| MoF cash-flow statement form (МГТ) uses the direct method | confirmed (knowledge: the published form lists receipts from sales, payments to employees, payments to suppliers, etc.) | https://legalinfo.mn/mn/detail?lawId=208277 |

**Totals:** 29 claims checked: 11 confirmed (knowledge), 2 corrected, 16 unverifiable. **Recommended next step:** in a run with search budget, re-check the 16 unverifiable rows first, starting with Form A/B, the e-balance procedure, Order 47 and the VAT threshold start date. Those four drive REQ-ACC-11, -12, -21 and -22.

---

## Re-verification log (2026-10)

The second pass ran on 2026-10-06 with a fresh search budget. Fetches of mof.gov.mn, legalinfo.mn, pwc.com and parliament.mn were still blocked, so verdicts rest on search extracts. Canonical values with per-row status are in [`legal-parameters.md`](legal-parameters.md).

| Claim | Verdict | Key sources |
|---|---|---|
| Classification procedure = MoF Order A/25 of 6 Feb 2025 | Re-verified | https://legalinfo.mn/mn/detail?lawId=17355848942361 ; ubaudit.mn summary |
| Full-IFRS class threshold: sales ≥ MNT 2.5bn | Partly re-verified (search extracts only; other criteria unknown) | same |
| Annual statements due 10 February via e-balance (window 1 Jan – 10 Feb) | Re-verified | https://mof.gov.mn/article/entry/e-balance ; https://legalinfo.mn/mn/detail?lawId=210883 ; https://www.infoproff.com/en/open-data/mongolia/71/financial-reporting-obligations-for-companies-in-mongolia |
| e-balance URL `e-balance.mof.gov.mn`; Order A/205 of 18 Nov 2024 | Still unverifiable | — |
| Half-year statements due 20 July for full-IFRS entities only | Still unverifiable (scope) | https://www.commenda.io/mongolia/annual-compliance |
| Retention ≥ 10 years | Re-verified | https://ey.com/content/dam/ey-unified-site/ey-com/en-mn/documents/ey-mongolia-new-accounting-and-auditing-laws.pdf |
| Approved-software list (Art. 17.1.11); requirements in MoF Order 47 (2018); MonICPA monitors | Re-verified (rule, order title, MonICPA role); checklist not obtained | https://mof.gov.mn/article/entry/2018-47 ; https://mof.gov.mn/article/entry/12-20 |
| Tax package passed 26 Jun 2026, effective 1 Jan 2027 | Re-verified; **corrected**: the VAT threshold clause starts 1 Jul 2027 | https://gogo.mn/r/v1656y ; https://www.pressreader.com/mongolia/the-ub-post/20260622/281509347896954 |
| CIT: 15% band for 6–10bn; 90% credit 1.5bn → 2.5bn | Re-verified | https://taxsummaries.pwc.com/mongolia/corporate/tax-credits-and-incentives ; KPMG July 2026 |
| Tax depreciation 25/40/10/2/10 years | Re-verified | https://taxsummaries.pwc.com/mongolia/corporate/deductions |
| Annual CIT return due 10 Feb | Re-verified for now; **corrected** for 2027 (5 March, one source) | https://taxsummaries.pwc.com/mongolia/corporate/tax-administration ; KPMG July 2026 |
| Social-insurance report by the 5th; PIT and НДШ paid by the 10th | Still unverified (single secondary source) | GitHub openaccountants mirror |
