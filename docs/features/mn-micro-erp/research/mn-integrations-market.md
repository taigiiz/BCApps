# Integrations, data protection, market and reference ERPs (Mongolia micro-ERP)

- Date of research: 2026-10-06. Tags: **[NOW]** = in force today; **[2027]** = applies from 2027-01-01 (or the date stated). Anything not confirmed is marked **UNVERIFIED**.
- **Method and limits (read first).** The shared web-search budget for this run was already used up before this note started, so no web searches were made. The egress proxy also **blocked direct fetches** of mongolbank.mn, legalinfo.mn, developer.qpay.mn, docs.erpnext.com, odoo.com and pwc.com. The evidence therefore comes from:
  1. The `ebarimt-integration` skill, which summarises the official PosAPI **v3.2.48** documentation (developer.itc.gov.mn, 2026-09-15).
  2. Source code read directly: ERPNext `develop` @ `cf59371c20` and Odoo `20.0` @ `75a41d5ea5`, both dated 2026-10-06.
  3. Open-source Mongolian integration code that calls the real endpoints: erxes, qpay_client, qpay-go, ebarimt-go, posapi-client-java, frankfurter and data-mn.
  4. The sibling note [mn-tax.md](./mn-tax.md).

  Facts that rest only on third-party code are rated **medium** at most. Check them against the official portals before building on them.
- **Fact-check pass (2026-10-06).** An independent check re-verified 28 claims. The web-search budget was also used up for this pass, and the official portals were still blocked. The check therefore used GitHub code search over **other** repositories than the ones cited above, direct reads of GitHub-hosted sources, and the IBAN registry data shipped in validation libraries. Corrected items are marked "(fact-check: corrected)" and items that could not be checked are marked "(fact-check: unverified)". See the [Fact-check log](#fact-check-log).

---

## 1. Summary

- **eBarimt (PosAPI 3.0)** is the main compliance integration. A **local PosAPI service** (`http://<host>:7080`, no token) takes one JSON receipt per sale and returns the 33-digit ДДТД, `qrData` and `lottery`. Amounts must sum exactly (items → sub-receipts → receipt → payments), each `taxType` gets its own sub-receipt, `billIdSuffix` must be unique per day, and `POST /rest/receipt` must never be retried automatically. `qrData` and `lottery` may be used **only for printing**. PosAPI accepts only **Mongolian IPs** on the **local network**, which fixes where the eBarimt connector runs.
- **Purchases.** B2B receipts issued to the company's TIN are the evidence for input VAT. `getSaleListERP` (X-API-KEY) returns them (ДДТД, seller, date, VAT, city tax, net, total) for matching to supplier invoices.
- **Mongolbank rates** sit on a JavaScript page backed by undocumented POST JSON endpoints. Several independent open-source clients call `/mn/currency-rates/data` from a server with a plain POST and no captcha. One source reports reCAPTCHA on the page, so the endpoint may still change or be blocked. (fact-check: corrected) **No official public API was found**, so the ERP needs a rate table with manual entry and import, plus a best-effort automatic fetch.
- **Banks.** Khan Bank (`api.khanbank.com/v1`, OAuth2 client credentials) and Golomt (an "openapi" with an AES/SHA-256 checksum header) have corporate statement APIs, and open-source code uses both. Open-source code also calls corporate statement APIs at **TDB** (OAuth2 client credentials, `accounts/statement/{account}`), **Bogd Bank** and **Trans Bank**. (fact-check: corrected) No evidence was found for XacBank or State Bank statement APIs. Plan **file import (Excel/CSV) with a mapping per bank** first.
- **QPay v2** (`merchant.qpay.mn/v2`) handles QR invoices, payment checks, refunds and **QPay-issued eBarimt**. The ERP must make sure **only one system issues the eBarimt** for each sale.
- **Personal data.** The Law on Personal Data Protection was adopted 2021-12-17 and has been in force since 2022-05-01. Its core duties are to state the purpose, get consent, secure the data, notify breaches and honour data-subject rights. Under that law and the General Tax Law, tax systems identify taxpayers by **TIN (legal entities) or civil_id (individuals)** rather than the national registration number. eBarimt closed the registration-number-to-TIN lookup for citizens on **2026-06-15**. No general data-localisation rule for private ERPs was confirmed.
- **Market.** Local competitor names and prices could not be gathered in this session (UNVERIFIED; needs desk research). Confirmed: Odoo ships `l10n_mn` (BumanIT and Odoo; CoA, VAT taxes, ТТ-03а report) **without eBarimt and without city tax**. erxes (Mongolian, open source) has POS, an eBarimt module, QPay and bank gateways.
- **Reference ERPs** both follow the BC "ledger + application" pattern. ERPNext has **GL Entry** plus **Payment Ledger Entry** (signed amounts against `against_voucher`, with a `delinked` flag), an optional immutable ledger and dimensions as custom fields. Odoo has **account.move.line** plus **account.partial.reconcile** (debit line, credit line, amount, FX move), lock dates and a hash chain.

---

## 2. eBarimt PosAPI 3.0 (skill source: developer.itc.gov.mn, v3.2.48, 2026-09-15)

### 2.1 Services [NOW]
- **Local PosAPI** at `http://<host>:7080`, with no token:
  - `POST /rest/receipt`: save a receipt. Returns the ДДТД, lottery and QR.
  - `DELETE /rest/receipt` `{id, date}`: return a receipt (**B2C_RECEIPT only**).
  - `GET /rest/info`: operator, merchants, **lottery numbers left** and the last send date.
  - `GET /rest/sendData`: push data to the central system.
  - `GET /rest/bankAccounts?tin=`: bank accounts from the local `bankaccount` table.
- **Reference services (no token)** on `api.ebarimt.mn/api/info/check/...`:
  - `getBranchInfo`: `districtCode` = branch code + sub-branch code, 4 digits.
  - `getInfo?tin=`: name, `vatPayer`, `cityPayer`, `freeProject`, `isGovernment`.
  - `getTinInfo?regNo=`: **closed for citizens' registration numbers since 2026-06-15**. (fact-check: unverified; no independent source for the date was found)
  - `getProductTaxCode`, plus barcode/classification look-ups (`barcode/v2/...`, `barcode/all`, page size ≤ 200).
- **Token services** (OpenID password grant: `client_id=vatps` for `api.ebarimt.mn`, `e-inventory` for `service.itc.gov.mn`; some also need an `X-API-KEY`): `saveOprMerchants` (the operator registers a merchant), `getSalesTotalData` (production **01:00–07:00** only), `getSaleListERP`, the easy-register services (`consumer/{identity}`, `getProfile`, `approveQr`, `foreigner/...`), `setReturnReceipt`, and the excise-stamp services (`posSetTransaction` goes **after** the receipt). Implementations: [ebarimt-go apis.go](https://github.com/techpartners-asia/ebarimt-go/blob/d0748aa566/pos3.0/apis.go) and [posapi-client-java](https://github.com/uugan/posapi-client-java/blob/f699f9c146/docs/PosAPI.md).

### 2.2 Receipt model [NOW]
- **Header:** `branchNo` (3), `posNo`, `merchantTin` (legal entity: 11 digits; individual: civil_id of 12–14), `type`, `billIdSuffix`, `totalAmount` (**VAT and city tax included**), `totalVAT`, `totalCityTax`, `districtCode` (4), `customerTin` (B2B), `consumerNo` (8 digits, **B2C_RECEIPT only**), `inactiveId`, `invoiceId`, `reportMonth`, `receipts[]` and `payments[]`.
- **Sub-receipt `receipts[]`:** `taxType`, `merchantTin` (the party earning the income, which can be a lessee), `totalAmount`, `totalVAT`, `totalCityTax`, `bankAccountNo`, `iBan`, `invoiceId` and `items[]`.
- **Item:** `name`, `barCode`, `barCodeType` (GS1/ISBN/UNDEFINED), `classificationCode` (БҮНА, **exactly 7 digits**), `taxProductCode`, `measureUnit`, `qty`, `unitPrice`, `totalAmount`, `totalVAT`, `totalCityTax`, `data.lotNo` (pharmacy) and `data.stockQR[]` (excise; its length must equal `qty`).
- **Payment:** `code` (`CASH`, `PAYMENT_CARD`, `BANK_TRANSFER`, `BANK_TRANSFER_QPAY`), `status` (`PAID`/`PAY`/`REVERSED`/`ERROR`), `paidAmount`, and `data` (card `terminalID`, `rrn`, `maskedCardNumber`, `easy`).
- **Response:** `id` (33-digit ДДТД), `receipts[].id` (sub-receipt ID), `posId`, `status=SUCCESS`, `date`, `qrData`, `lottery` and `easy`.

### 2.3 Types, taxType and mandatory rules [NOW]
- **Type:** an invoice uses `B2B_INVOICE` if the buyer is a legal entity with a TIN, otherwise `B2C_INVOICE`. Any other sale uses `B2B_RECEIPT` or `B2C_RECEIPT` on the same test.
- **taxType per line:**
  - Outside Mongolia → `NOT_VAT`.
  - 0% → `VAT_ZERO`.
  - Exempt → `VAT_FREE`.
  - Everything else → `VAT_ABLE`.

  The first three **require `taxProductCode`** and must have VAT = 0.
- **Sums:** `item.totalAmount = qty × unitPrice`, VAT included. Σ items = sub-receipt, Σ sub-receipts = header, and Σ `paidAmount` = header. VAT and city tax roll up the same way.
- **Splitting:** one sub-receipt per `taxType`, or per (`taxType` × `merchantTin`) when lessees are involved.
- **Other rules:**
  - `billIdSuffix` must be unique per day; a repeat means a duplicate ДДТД.
  - Only **one** payment may carry `data.easy=true`.
  - The receipt date is the **tax server's time**, so keep the server clock on NTP.
  - Do not call `approveQr` when `consumerNo` was already sent.
- **Prohibition:** **storing `qrData` or `lottery` in any form other than the printed receipt is forbidden.** This covers databases, logs and caches. The official service text repeats it ([posapi-client-java, postRestReceipt](https://github.com/uugan/posapi-client-java/blob/f699f9c146/docs/PosAPI.md)).

### 2.4 Returns and corrections [NOW]

| Case | Mechanism |
|---|---|
| Void a whole B2C_RECEIPT | `DELETE /rest/receipt {id, date}`. This works only if the citizen has **not confirmed** the receipt. A confirmed receipt moves to "unconfirmed return" and becomes inactive only after the citizen approves in the e-barimt app ([posapi-client-java](https://github.com/uugan/posapi-client-java/blob/f699f9c146/docs/PosAPI.md)) |
| Partial return or amount fix | New `POST` with `inactiveId` = the **latest** ДДТД in the chain |
| Previous-month B2B or invoice | `POST` with `reportMonth`. Allowed only on **days 1–7** and only for the **previous month** (`B2B_RECEIPT`, `B2B_INVOICE`; `B2C_INVOICE` per the docs, but the release note conflicts) |
| Invoice settled | Receipt with `invoiceId` = the invoice's ДДТД |
| Receipt that had a lottery number | `setReturnReceipt` (X-API-KEY), after the citizen's return |

### 2.5 Operational limits, network and test environment [NOW]
- **Capacity of one PosAPI:** ≤ 1,000 merchants and ≤ 100,000 receipts a day.
- **Hardware and network:**
  - Database ping < 100 ms.
  - Local network only.
  - Disk ≥ 1 GB and network ≥ 80 Mbps.
  - **Access from Mongolian IPs only.**
  - Firewall: `api.ebarimt.mn` → 103.17.108.216/217; `auth.itc.gov.mn` → 103.87.69.75/76.
- **Sending:** receipts must reach the central system within **72 h**. Lottery numbers stop after 3 days without sending. Warn when `leftLotteries` < 100.
- **Conflicting sources on `sendData`:** the skill says to call it at least once a day, while the portal text says PosAPI sends automatically and the call is optional ([posapi-client-java getRestSendData](https://github.com/uugan/posapi-client-java/blob/f699f9c146/docs/PosAPI.md)). The safe choice is a daily scheduled call plus monitoring.
- **Staging environment:**
  - Operator portal: `st-operator.ebarimt.mn`.
  - E-invoice: `stg-invoice.ebarimt.mn`.
  - Auth: `https://st.auth.itc.gov.mn/auth/realms/Staging`.
  - Test merchant TIN `37900846788`.
  - **No load testing.**
- **Signatures:** Monpass signatures have been unsupported since 2025-05-22. Use Gerege, Infosert or Tridum. (fact-check: unverified; no independent source was found)
- Questions on unclear rules go to posapi@itc.gov.mn.

---

## 3. Purchase side: e-invoice and buyer confirmation

- **[NOW]** Input VAT is deductible only for receipts **registered in the unified system** (and confirmed), or for customs declarations. Purchases over MNT 10 M are checked one by one ([mn-tax.md §2.4](./mn-tax.md)).
- **`getSaleListERP`** (POST, X-API-KEY) takes `Pin` (head-company registration number), `subPin[]` (subsidiaries; empty means the head company), `StartDate` and `EndDate`. For each purchase receipt it returns `prPosRno` (ДДТД), the seller's `name` and `regNo`, `buyerRegNo`, `date`, `amountVat`, `amountCityTax`, `amountTotal`, `amountNet` and `fromType` (`INVOICE` or `POS API`) ([ebarimt-go structs.go](https://github.com/techpartners-asia/ebarimt-go/blob/d0748aa566/pos3.0/structs.go)). Confidence: medium. The client is third-party and the field casing looks inconsistent (`EndDate` is typed `int`).
- **UNVERIFIED:**
  - The exact buyer "confirm" action and its deadline in e-invoice.
  - Whether a confirmed purchase can be un-confirmed.
  - Whether an X-API-KEY is issued to an ERP vendor or only to large taxpayers.
- Issued e-invoices (`*_INVOICE`) appear in the e-invoice portal. The production URL is UNVERIFIED; staging is `stg-invoice.ebarimt.mn`.

---

## 4. Mongolbank official exchange rate

- **Role:** the official rate is the statutory reference for customs, tax and accounting under the Law on Currency Regulation, art. 5(2) (as stated in [frankfurter bom.rb](https://github.com/lineofflight/frankfurter/blob/71334f73e9/lib/provider/adapters/bom.rb)). Confidence: medium; check the law text.
- **Pages:** `https://www.mongolbank.mn/mn/currency-rates` (daily) and `/en/currency-rate-movement` (history).
- **Data endpoints:** these are undocumented and used by the site's own JavaScript.
  - `POST https://www.mongolbank.mn/mn/currency-rates/data?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. data-mn says the page is a Vue app protected by **reCAPTCHA** ([data-mn](https://github.com/American-University-of-Mongolia/data-mn/blob/d3c21d428c/tools/sources/mongolbank/datasets/mongolbank-exchange-rates-daily.md)). However, independent clients call this endpoint **from a server** with a plain POST: the dates go in the query string, the body is empty, and there is no captcha or cookie. Examples are [velofoods exchangeRate.js](https://github.com/b232270024-art/velofoods_web/blob/HEAD/src/services/exchangeRate.js) and [okrservice exchangeRates.ts](https://github.com/okrbest/okrservice/blob/HEAD/packages/plugin-accountings-api/src/cronjobs/exchangeRates.ts). An aggregator has also stored daily data from it up to 2026-10-06 ([AllRates-Today](https://github.com/AllRates-Today/central-bank-exchange-rates/tree/main/data/bom/daily)). The claim that calls "work only inside a browser" is therefore wrong today, but the anti-bot risk remains. (fact-check: corrected)
  - `POST https://www.mongolbank.mn/en/currency-rate-movement/data` with a JSON body `{startDate, endDate}`. This returns the **whole archive from 2001-01-02** (about 5 MB) whatever range is asked for, and it is refreshed in arrears ([frankfurter](https://github.com/lineofflight/frankfurter/blob/71334f73e9/lib/provider/adapters/bom.rb)).
  - A legacy endpoint existed at `old.mongolbank.mn/dblistofficialdailyrate.aspx`.
- **Response format:** `{"success":true,"data":[{"RATE_DATE":"2025-02-27","USD":"3,465.69","EUR":"3,630.48",...}]}`.
  - Rates are **strings with comma thousand separators**, quoted per **1 unit** of foreign currency.
  - Coverage is **38 codes in all**: 35 currencies plus SDR (XDR in the aggregator; the label "SDR" on the source), XAU and XAG (per troy ounce) ([AllRates-Today 2026-10-06](https://github.com/AllRates-Today/central-bank-exchange-rates/blob/main/data/bom/daily/2026-10-06.json)). The earlier "38 currencies plus XAU and XAG" overcounted. (fact-check: corrected)
  - Example: USD = 3,576.42 MNT on 2026-05-22. (fact-check: unverified; only the frankfurter test fixture has it.) A recent value is USD = 3,595.40 MNT on 2026-10-06 (AllRates-Today).
- **Publication time:** UNVERIFIED. An aggregator polls weekdays 02:00–04:59 UTC (10:00–12:59 Ulaanbaatar), which suggests a late-morning weekday release ([bom.json](https://github.com/lineofflight/frankfurter/blob/71334f73e9/db/seeds/providers/bom.json)). Weekend and holiday dates **carry the previous rate forward** (data-mn).
- **Design consequence:** treat the fetch as best-effort. Store `source` (MONGOLBANK_AUTO, MANUAL or IMPORT) and the retrieval time, and allow manual entry when the fetch fails.

---

## 5. Banks: statements and corporate APIs

| Bank | Corporate API evidence | Details (from erxes `corporateGateway`, [tree](https://github.com/erxes/erxes/tree/9c0b87b7f1/backend/plugins/payment_api/src/modules/corporateGateway)) | Confidence |
|---|---|---|---|
| **Khan Bank** | Yes | Base `https://api.khanbank.com/v1`. Token: `POST auth/token?grant_type=client_credentials` with Basic `consumerKey:secretKey`. Statement: `GET statements/{account}?from=YYYYMMDD&to=YYYYMMDD&page&size&record`, plus `statements/{account}/record`. **Header fields:** account, iban, currency, beginBalance, endBalance, total{count, credit, debit}. **Line fields:** `record`, tranDate, postDate, time, branch, teller, journal, code, amount, balance, debit, correction, description, relatedAccount. Transfers and tax payments are also available | medium |
| **Golomt** | Yes | Configurable `apiUrl` (UAT `openapi-uat.golomtbank.com/api`; production `openbank.golomtbank.com/api` per [Golomt open-banking docs](https://github.com/hulgeebnaa/open-banking/blob/HEAD/docs/section-2.md)). Login: `v1/auth/login`. Statement: `POST v1/account/operative/statement {registerNo, accountId, startDate, endDate}`. Headers: `X-Golomt-Service: OPERACCTSTA` and `X-Golomt-Checksum` (SHA-256 of the body, AES-CBC with the session key). An independent client ([sukhBackv2 cgw.js](https://github.com/batkt/sukhBackv2/blob/HEAD/controller/cgw.js)) confirms these | medium |
| **TDB (ХХБ)** | Yes (corporate gateway) (fact-check: corrected) | Statement API: token `POST /oauth2/token` (`grant_type=client_credentials`), then `GET /accounts/statement/{account}?from=YYYY/MM/DD&to=YYYY/MM/DD&page=0&size=100`. The server URL is configured per customer ([sukhBackv2 cgw.js](https://github.com/batkt/sukhBackv2/blob/HEAD/controller/cgw.js)). Hosted payment page orders also exist (`order{typeRid:'purch', amount, currency, hppRedirectUrl}`; statuses FULLYPAID/PARTPAID/AUTHORIZED/PAID). The earlier "no statement API evidence" was wrong | low-medium |
| **Bogd Bank, Trans Bank** | Yes (fact-check: corrected) | The same client calls Bogd `POST /api/statement {account_no, start_date, end_date}` (form login) and Trans `getStatement?apikey=` with `{acnt_code, start_date, end_date}` ([sukhBackv2 cgw.js](https://github.com/batkt/sukhBackv2/blob/HEAD/controller/cgw.js)) | low |
| **XacBank (Хас банк)** | Not found | UNVERIFIED | — |
| **State Bank (Төрийн банк)** | Not found | UNVERIFIED | — |

- **Statement export formats** from internet banking (Excel, CSV, PDF, or ISO formats such as MT940 or camt.053): **UNVERIFIED for every bank.** No sample file was available. Collect real export samples from pilot customers before fixing a parser.
- Corporate API access normally needs a **bank contract and per-customer credentials**. Commercial terms are UNVERIFIED.
- **Bank and provider codes** (QPay SDK enum, likely the interbank codes; confidence medium): Mongolbank 010000, TDB 040000, Khan 050000, Golomt 150000, Trans 190000, Arig 210000, Credit 220000, NIB 290000, Capitron 300000, **Khas (XacBank) 320000**, Chinggis Khaan 330000, **State Bank 340000**, NDB 360000, Bogd 380000, M bank 390000 ([enums.py](https://github.com/Amraa1/qpay_client/blob/ac29fbb29e/src/qpay_client/v2/enums.py)).
- **Mongolian IBAN:** Mongolia is in the SWIFT IBAN registry. The format is `MN2!n4!n12!n`: **20 characters**, made of `MN`, 2 check digits, a 4-digit bank code and a 12-digit account number. For example, `MN12 1234 1234 5678 9123`. Validate with the ISO 13616 mod-97 check. ([python-stdnum iban.dat](https://github.com/arthurdejong/python-stdnum/blob/master/stdnum/iban.dat); [iban-validation registry](https://github.com/jschaedl/iban-validation/blob/master/Resource/iban_registry.php); [IbanNet](https://github.com/skwasjer/IbanNet/blob/HEAD/SupportedCountries.md)). Keep the column 34 characters wide for foreign IBANs. (fact-check: corrected; it was UNVERIFIED) Note that the PosAPI `iBan` sample value `1001000151111111111` has no `MN` prefix, so do not validate the eBarimt `iBan` field as an IBAN until ITC confirms the format.

---

## 6. QPay merchant API v2

Source: [qpay_client](https://github.com/Amraa1/qpay_client/tree/ac29fbb29e/src/qpay_client/v2) and the [qpay-go README](https://github.com/techpartners-asia/qpay-go/blob/82213fd1f8/README.md). Confidence: medium.

- **Base URLs:** production `https://merchant.qpay.mn/v2`; sandbox `https://merchant-sandbox.qpay.mn/v2`. Public sandbox defaults: `TEST_MERCHANT` / `123456`, invoice code `TEST_INVOICE`.
- **Auth:** `POST /auth/token` with Basic username:password returns an access token and a refresh token. Refresh with `POST /auth/refresh`.
- **Invoice:** `POST /invoice` with:
  - Required: `invoice_code`, `sender_invoice_no` (≤ 45), `invoice_receiver_code`, `invoice_description` (≤ 255), `amount`, `callback_url`.
  - Optional: `sender_branch_code`, `lines[]` (`tax_product_code`, `classification_code`, quantity, unit price, taxes), `allow_partial`, `minimum_amount`/`maximum_amount`, `expiry_date`.

  The response holds `invoice_id`, `qr_text`, `qr_image`, `qPay_shortUrl` and `urls[]` (bank app deep links). Read with `GET /invoice/{id}`; cancel with `DELETE /invoice/{id}`.
- **Payments:**
  - `POST /payment/check {object_type: INVOICE|QR|ITEM, object_id, offset{page_number, page_limit ≤ 1000}}` returns `count`, `paid_amount` and `rows`.
  - `GET /payment/{id}`, `DELETE /payment/cancel/{id}`, `DELETE /payment/refund/{id}`, `POST /payment/list`.
  - Status values: `NEW`, `FAILED`, `PAID`, `PARTIAL`, `REFUND`.
- **eBarimt through QPay:**
  - `POST /ebarimt/create {payment_id, ebarimt_receiver_type: CITIZEN|COMPANY, ebarimt_receiver}` and `GET /ebarimt/{id}`.
  - There is also an "Ebarimt 3.0 invoice" flow that uses a **separate invoice code** issued by QPay.
  - **Risk:** if both QPay and the ERP issue a receipt for one sale, the sale has two eBarimt receipts.
- **Callback:** treat it as a trigger only. Confirm through `payment/check` before posting. Fees and settlement timing to the merchant account are UNVERIFIED.

---

## 7. Personal data protection and hosting

- **Law on Personal Data Protection (Хувь хүний мэдээлэл хамгаалах тухай хууль):** adopted **2021-12-17**, in force **2022-05-01**. Confidence: medium. The source is a secondary summary that cites DLA Piper and Mondaq ([smarthub doc](https://github.com/aagii9912/smarthub/blob/8d753bbd83/docs/strategy/LEAD_CRM_PIVOT_PLAN_MN.md)). The consolidated text on legalinfo.mn was blocked, so article numbers were **UNVERIFIED** at first. The fact-check found an independent cross-check of DLA Piper, LehmanLaw and Gratanet that confirms both dates ([history-of-privacy verify](https://github.com/fritzhand/history-of-privacy/blob/HEAD/research/verify/global-f105.json)). The article numbers below come from a secondary source.
- **Core duties** (agreed by secondary sources; confidence medium):
  1. Declare the purpose of collection.
  2. Get the data subject's consent, in written or electronic form. Consent can be withdrawn.
  3. Apply technical and organisational security measures.
  4. Notify the authority and the data subject of a breach.
  5. Respect access, correction and deletion rights, and the right to object to marketing.

  A secondary dataset that cites the consolidated text ([who-holds-the-record MNG.json](https://github.com/evil-robot/who-holds-the-record-open/blob/HEAD/data/MNG.json), citing [legalinfo.mn lawId=16390288615991](https://legalinfo.mn/mn/detail?lawId=16390288615991)) gives these articles (fact-check: corrected; they were UNVERIFIED; confidence medium):
  - **Breach notice:** the controller must inform data subjects **immediately** when a violation harms their rights (art. 22.2). It must also send a **yearly record of violations to the National Human Rights Commission** (art. 22.6).
  - **Regulator:** the **National Human Rights Commission** handles complaints and makes recommendations (art. 24.1).
  - **Cross-border transfer:** allowed only under a law, a treaty or the data subject's consent (art. 14.1).
  - **Sensitive data:** health, genetic and biometric data are sensitive (art. 4.1.12).
  - **Impact assessment:** required before automated processing that affects rights (art. 23).
  - **Portability:** data subjects can get free electronic copies (arts. 16.1.8–16.1.9 and 18.2.11).

  Still UNVERIFIED: whether a DPO is required, and which exceptions apply when processing is required by law (for example tax law).
- **Fines:** Law on Violations (Infringements) art. 6.27 fines unlawful disclosure of sensitive data at **2,000 units for an individual and 20,000 units for a legal entity**. At 1 unit = MNT 1,000 that is **MNT 2 M and MNT 20 M** (the unit value was not re-checked). The earlier "MNT 500,000–20,000,000" range matches only at the top end; its lower bound has no source. (fact-check: corrected; source as above, citing [legalinfo.mn/mn/detail/12695](https://legalinfo.mn/mn/detail/12695))
- **Tax identifiers [NOW]:** under the "newly revised" Personal Data Protection Law and the General Tax Law, taxpayers are registered in tax systems by **taxpayer number**: TIN for legal entities and **civil_id** for individuals ([posapi-client-java getTinInfo](https://github.com/uugan/posapi-client-java/blob/f699f9c146/docs/PosAPI.md)). eBarimt closed the look-up by citizen registration number on 2026-06-15 (skill).
- A citizen's registration number is personal data and is widely understood to encode **date of birth and sex**. That encoding is UNVERIFIED; treat the number as sensitive in any case.
- **Hosting and residency:**
  - No general rule was confirmed that forces a private ERP to keep data in Mongolia (UNVERIFIED). The Cyber Security Law (2021) may impose duties on critical infrastructure, but its relevance is UNVERIFIED.
  - **Hard technical constraint [NOW]:** PosAPI is local-network only and accepts Mongolian IPs only, and the ETAX API is also Mongolian-IP-only ([mn-tax.md §7](./mn-tax.md)). The eBarimt connector must therefore run **in Mongolia**, either as an on-premises agent or in a Mongolian data centre or cloud.
- **Retention:** the Accounting Law and General Tax Law retention periods are UNVERIFIED (5 years assumed in mn-tax.md). A legal retention duty overrides a deletion request.

---

## 8. Market: Mongolian accounting and ERP software for small businesses

| Player | What is confirmed | Gaps observed |
|---|---|---|
| **Odoo + `l10n_mn`** | Module "Mongolia - Accounting" by **BumanIT LLC and Odoo S.A.**, auto-installed with Odoo `account`. It has a ~300-account chart with 8-digit codes and bilingual names, about 40 sale and purchase VAT taxes (10%, 0%, exempt, export, liquidation, energy and others) mapped to **ТТ-03а** report lines (`TT3a[12]`), and a 121-record VAT report ([l10n_mn](https://github.com/odoo/odoo/tree/75a41d5ea5/addons/l10n_mn)) | **No eBarimt connector and no city-tax (НХАТ) tax** in core. Mongolian partners must add these |
| **erxes** (Mongolian, open source) | A POS client and a `mongolian_api` plugin with an **eBarimt module** ([ebarimt](https://github.com/erxes/erxes/tree/main/backend/plugins/mongolian_api/src/modules/ebarimt)). Its payment plugin covers QPay (and QuickQR), SocialPay, MonPay, StorePay, Pocket, MinuPay, WeChat Pay via QPay, Golomt e-commerce, Stripe and PayPal, plus Khan, Golomt and TDB corporate gateways ([constants.ts](https://github.com/erxes/erxes/blob/9c0b87b7f1/backend/plugins/payment_api/src/constants.ts)) | A CRM/POS platform. Whether it has a full double-entry ledger is UNVERIFIED |
| **SDK vendors** (techpartners-asia `ebarimt-go`, `qpay-go`) | Integration building blocks | Not end-user products |
| **Local desktop and cloud accounting packages** | Names, features and **prices UNVERIFIED** in this session | Needs desk research: at least 5 products, with price per user per month, eBarimt support, bank import and 2027-regime readiness |
| **International SaaS** (Xero, QuickBooks and similar) | No Mongolian eBarimt integration is known (UNVERIFIED) | Localisation gap |

**Likely gaps to exploit** (hypotheses to test with users):
- Sales posting that is **native to eBarimt**, with a ledger-to-ДДТД reconciliation.
- **Automatic matching of purchase receipts** for input VAT.
- Mongolbank rates without manual typing.
- Bank import and matching for Khan and Golomt.
- Readiness for the **2027 simplified quarterly VAT regime** and the 400 M VAT threshold ([mn-tax.md](./mn-tax.md)).
- Privacy controls under the Personal Data Protection Law.
- A Mongolian user interface at a micro-business price.

---

## 9. Reference ERPs: patterns comparable to BC

### 9.1 ERPNext (`develop` @ cf59371c20)
- **GL Entry** ([gl_entry.json](https://github.com/frappe/erpnext/blob/cf59371c20/erpnext/accounts/doctype/gl_entry/gl_entry.json)) carries posting_date, account, party, cost_center/project, debit/credit in company, account and transaction currency, voucher_type/voucher_no/voucher_detail_no, `against_voucher`, due_date, is_opening, is_advance and `is_cancelled`. A single GL Entry cannot be cancelled; the user must cancel the related transaction. Postgres gets partial indexes where `is_cancelled=0`.
- **Cancellation and immutability** ([general_ledger.py `make_reverse_gl_entries`](https://github.com/frappe/erpnext/blob/cf59371c20/erpnext/accounts/general_ledger.py)). Reversal swaps debit and credit and writes "On cancellation of …". The behaviour depends on a setting:
  - **Default:** the originals get `is_cancelled=1`, and the mirror entries keep the original date with `is_cancelled=1`. Reports filter both out.
  - **`enable_immutable_ledger`:** originals stay `is_cancelled=0`, and the mirror is posted on the **cancellation date**, so reports include both. This is closer to BC's reversal, but BC keeps the original date.
- **Payment Ledger Entry** ([utils.py `get_payment_ledger_entries`](https://github.com/frappe/erpnext/blob/cf59371c20/erpnext/accounts/utils.py)) is an AR/AP sub-ledger built from GL lines on Receivable and Payable accounts.
  - Fields: `amount` signed (+ means owed to us; Payable inverted), voucher, **against_voucher** (the invoice being settled; it defaults to itself), due_date, dimensions and `delinked`.
  - Outstanding = Σ amount per against_voucher where `delinked=0`.
  - Cancelling or **Unreconcile Payment** sets `delinked=1`, or in immutable mode posts negatives.

  This is BC's Cust. Ledger Entry and Detailed Cust. Ledg. Entry merged into one table.
- **Accounting Dimension:** creating one adds a custom field to every doctype listed in the `accounting_dimension_doctypes` hook. Per company it supports **mandatory_for_pl / mandatory_for_bs** and default values, which are checked on each GL Entry.
- **Period control:** `accounts_frozen_till_date` (with a role exemption), **Accounting Period** (with closed document types) and the Period Closing Voucher are checked in [gl_validator.py](https://github.com/frappe/erpnext/blob/cf59371c20/erpnext/accounts/services/gl_validator.py). Account Closing Balance and **Repost Accounting Ledger** (which regenerates the GL for vouchers) round this out. An automatic **round-off GL entry** absorbs small debit/credit differences (`make_round_off_gle` in general_ledger.py).

### 9.2 Odoo (`20.0` @ 75a41d5ea5)
- **account.move** has states `draft`, `posted` and `cancel`.
  - **Hash chain:** journals with `restrict_mode_hash_table` store `secure_sequence_number` and `inalterable_hash`, each chained to the previous hash. Writes to hashed fields raise an error.
  - Reversal goes through `_reverse_moves` (a credit note or reverse entry) ([account_move.py](https://github.com/odoo/odoo/blob/75a41d5ea5/addons/account/models/account_move.py)).
- **account.move.line** stores `balance`, `amount_currency`, **`amount_residual` / `amount_residual_currency`**, `reconciled`, `matched_debit_ids` / `matched_credit_ids`, `full_reconcile_id` and `matching_number`.
- **account.partial.reconcile** holds `debit_move_id`, `credit_move_id`, `amount` (company currency), `debit_amount_currency` / `credit_amount_currency`, **`exchange_move_id`** (the realised FX difference move) and `max_date`. **account.full.reconcile** groups the partials once residuals reach zero. This matches BC's detailed "Application" entries plus the realised gain or loss entry.
- **Lock dates** ([company.py](https://github.com/odoo/odoo/blob/75a41d5ea5/addons/account/models/company.py)):
  - `fiscalyear_lock_date` (global), `tax_lock_date` (set automatically by the tax closing entry), `sale_lock_date`, `purchase_lock_date`, and **`hard_lock_date`**, which is irreversible and allows no exceptions.
  - **account.lock_exception** grants time-boxed exceptions per user.
  - Entries dated inside a lock are *postponed* to the next open date.

### 9.3 Comparison

| Concern | BC | ERPNext | Odoo | Recommendation for the micro-ERP |
|---|---|---|---|---|
| Ledger | G/L Entry, immutable, with Entry No. and Transaction No. | GL Entry with an is_cancelled flag | move.line on a posted move | Append-only GL with a transaction ID (BC style) |
| AR/AP open items | Cust./Vendor Ledger Entry + Detailed entries | Payment Ledger Entry (signed, against_voucher) | `amount_residual` on lines | Open-item entry + **detailed application entries** (BC), with residual cached |
| Application | Detailed entry types (Application, Realized gain/loss…) | PLE with against_voucher; Unreconcile sets delinked | partial.reconcile + exchange move | An application record = partial.reconcile shape; unapply by reversal, not delete |
| Reversal | Mirror on the original date, Reversed flags | Mirror; immutable mode uses the cancel date | Reverse move | Mirror entry; date chosen by the period-lock policy |
| Dimensions | Dimension Set ID | Custom fields per dimension | analytic_distribution (JSON) | Dimension set ID (BC) |
| Period lock | Allow Posting From/To, VAT closing | Frozen date, Accounting Period, PCV | 5 lock dates + exceptions, hard lock | A tax lock date set when the VAT return is filed, plus an irreversible hard lock |
| Tamper evidence | (none in core) | — | Hash chain | Hash chain per ledger (cheap to build) |

---

## 10. Key facts

| Fact | Value | Effective from | Source URL | Confidence |
|---|---|---|---|---|
| PosAPI version documented | v3.2.48 (portal 2026-09-15) | NOW | https://developer.itc.gov.mn/ | high |
| Local PosAPI endpoint | `http://<host>:7080`, no token; `POST/DELETE /rest/receipt`, `/rest/info`, `/rest/sendData` | NOW | https://developer.itc.gov.mn/ ; https://github.com/techpartners-asia/ebarimt-go/blob/d0748aa566/pos3.0/apis.go | high |
| Receipt types | B2C_RECEIPT, B2B_RECEIPT, B2C_INVOICE, B2B_INVOICE | NOW | https://developer.itc.gov.mn/ | high |
| taxType values | VAT_ABLE, VAT_ZERO, VAT_FREE, NOT_VAT; the last three need `taxProductCode` | NOW | https://github.com/techpartners-asia/ebarimt-go/blob/d0748aa566/pos3.0/constants.go | high |
| ДДТД length | 33 digits | NOW | https://developer.itc.gov.mn/ | high |
| `classificationCode` | Exactly 7 digits (БҮНА) | NOW | https://developer.itc.gov.mn/ | high |
| `qrData`/`lottery` | Must not be stored except on the printed receipt | NOW | https://github.com/uugan/posapi-client-java/blob/f699f9c146/docs/PosAPI.md | high |
| Previous-month fix | `reportMonth` on days 1–7, previous month only | NOW | https://developer.itc.gov.mn/ | medium (release-note conflict) |
| B2C void | DELETE only if the citizen has not confirmed; otherwise the citizen must approve | NOW | https://github.com/uugan/posapi-client-java/blob/f699f9c146/docs/PosAPI.md | medium-high |
| PosAPI limits | ≤ 1,000 merchants, ≤ 100k receipts a day, local network, Mongolian IP only | NOW | https://developer.itc.gov.mn/ | medium-high |
| Send window | 72 h; lottery stops after 3 days unsent | NOW | ./mn-tax.md ; https://developer.itc.gov.mn/ | medium-high |
| Citizen reg-no → TIN look-up | Closed | 2026-06-15 | https://developer.itc.gov.mn/ | high (fact-check: unverified) |
| Purchase list API | `getSaleListERP` (X-API-KEY): ДДТД, seller, VAT, city tax, net, total, fromType | NOW | https://github.com/techpartners-asia/ebarimt-go/blob/d0748aa566/pos3.0/structs.go | medium |
| Mongolbank data endpoint | POST `/mn/currency-rates/data` (dates in the query string, empty body), `/en/currency-rate-movement/data`; strings with commas; callable from a server without a captcha today (reCAPTCHA reported on the page); no official API | NOW | https://github.com/lineofflight/frankfurter/blob/71334f73e9/lib/provider/adapters/bom.rb ; https://github.com/okrbest/okrservice/blob/HEAD/packages/plugin-accountings-api/src/cronjobs/exchangeRates.ts | medium (fact-check: corrected) |
| Mongolbank publication time | ~10:00–13:00 UB on weekdays (inferred); weekends carry forward | NOW | https://github.com/lineofflight/frankfurter/blob/71334f73e9/db/seeds/providers/bom.json | low (UNVERIFIED) |
| Khan Bank statement API | `api.khanbank.com/v1`, client_credentials, `GET statements/{acct}` | NOW | https://github.com/erxes/erxes/tree/9c0b87b7f1/backend/plugins/payment_api/src/modules/corporateGateway/khanbank | medium |
| Golomt statement API | `POST v1/account/operative/statement`, checksum header | NOW | https://github.com/erxes/erxes/tree/9c0b87b7f1/backend/plugins/payment_api/src/modules/corporateGateway/golomtbank | medium |
| QPay v2 | `merchant.qpay.mn/v2`; `/auth/token`, `/invoice`, `/payment/check`, `/ebarimt/create` | NOW | https://github.com/Amraa1/qpay_client/blob/ac29fbb29e/src/qpay_client/v2/clients/client.py | medium |
| Personal Data Protection Law | Adopted 2021-12-17; consent, security, breach notice to the data subject "immediately" (art. 22.2); yearly violation record to the National Human Rights Commission (art. 22.6) | 2022-05-01 | https://github.com/aagii9912/smarthub/blob/8d753bbd83/docs/strategy/LEAD_CRM_PIVOT_PLAN_MN.md (cites DLA Piper); https://lehmanlaw.mn/blog/personal-data-protection-in-mongolia/ ; https://legalinfo.mn/mn/detail?lawId=16390288615991 | medium-high (dates); medium (articles) (fact-check: corrected) |
| Mongolian IBAN | `MN` + 2 check digits + 4-digit bank code + 12-digit account = 20 characters | NOW | https://github.com/arthurdejong/python-stdnum/blob/master/stdnum/iban.dat | high (fact-check: corrected) |
| TDB statement API | `/oauth2/token` (client_credentials); `GET /accounts/statement/{acct}?from&to&page&size` | NOW | https://github.com/batkt/sukhBackv2/blob/HEAD/controller/cgw.js | low-medium (fact-check: corrected) |
| Odoo `l10n_mn` | CoA, VAT taxes, ТТ-03а report; no eBarimt, no city tax | 20.0 | https://github.com/odoo/odoo/tree/75a41d5ea5/addons/l10n_mn | high |
| ERPNext immutable ledger | Cancellation posts the mirror on the cancel date and keeps the originals | develop | https://github.com/frappe/erpnext/blob/cf59371c20/erpnext/accounts/general_ledger.py | high |
| VAT threshold and simplified regime | 400 M; quarterly simplified VAT | 2027-01-01 (threshold date may be 2027-07-01) | ./mn-tax.md | medium |

---

## 11. Implications for the ERP design

**eBarimt**
- **I-01 Connector process.** Run a separate "eBarimt agent" next to PosAPI, in the customer's network or a Mongolian cloud. It works from an outbox table: the ERP writes `PENDING`, the agent posts, and the result is `SUCCESS`, `ERROR` or **`UNKNOWN`** (timeout). There is **no automatic retry** of `POST /rest/receipt`. `UNKNOWN` goes to a manual resolution queue.
- **I-02 Receipt log table** `ebarimt_receipt`:
  - Fields: doc_type, doc_no, bill_id_suffix, ddtd, sub_ddtd[], parent_ddtd (from `inactiveId`), invoice_ddtd, type, merchant_tin, customer_tin, consumer_no, total_amount, total_vat, total_city_tax, ebarimt_date, report_month, easy, status, error.
  - **No `qr_data` or `lottery` columns.** Lint logs so they never contain them.
  - The print path passes them in memory only.
- **I-03 Master data:**
  - Company: TIN (11 digits) or civil_id (12–14), VAT-payer and city-payer flags (refreshed from `getInfo`).
  - Branch: `branch_no` (3 digits) and `district_code` (4 digits, from `getBranchInfo`).
  - POS: `pos_no`.
  - Item: barcode, barcode type, **classification_code (7 digits, required)**, measure unit, tax_product_code.
  - VAT code → `taxType` mapping (see mn-tax R3).
- **I-04 Pre-send validation** checks:
  - The sum chain, using the integer MNT amounts as stored.
  - One sub-receipt per `taxType`.
  - `taxProductCode` present for non-VAT_ABLE lines.
  - consumerNo only on B2C and customerTin only on B2B.
  - Payments total = header total, and at most one easy payment.
  - stockQR count = qty.
  - Build header totals **by summing lines**, never by recalculating.
- **I-05 Daily sequence** `billIdSuffix = pos_no + day sequence`. Make it unique per (pos_no, date) with a database constraint.
- **I-06 Corrections workflow:**
  - Credit memo → `DELETE` (full B2C, unconfirmed) or `inactiveId` = latest ДДТД in the chain.
  - Prior-month B2B fixes are enabled on **days 1–7 only**; after that the action is blocked with an explanation.
  - Invoice → receipt linked by `invoiceId`.
- **I-07 Monitoring jobs:**
  - Daily `sendData` call.
  - Watch `/rest/info`, and warn when `leftLotteries < 100` or the last send was more than 48 h ago (warn before the 72 h limit).
  - Report of sales documents without a ДДТД (mn-tax R15).
  - NTP clock check on the agent host.

**Purchases, VAT, FX, banks and payments**
- **I-08 Purchase receipt register:**
  - Supplier invoice fields: supplier TIN, ДДТД, receipt date, net, VAT and city-tax amounts.
  - Scheduled import from `getSaleListERP` when a key is available, otherwise a file import.
  - Automatic matching on (TIN, ДДТД) or (TIN, date, amount). Input VAT is claimable only when matched.
  - A VAT reconciliation report that runs before ТТ-03а.
- **I-09 Exchange rates.** Use a `currency_rate(date, currency, rate_mnt, source, fetched_at, entered_by)` table:
  - Rate is a decimal with at least 4 decimals. Parse strings by stripping the commas.
  - A best-effort Mongolbank fetch job with a manual fallback.
  - Weekend and holiday look-up takes the **latest rate on or before** the date.
  - Revaluation and realised FX use this table.
- **I-10 Bank import framework:**
  - Mapping definitions per bank (column map, date format, sign convention, decimal separator), BC "Data Exchange Definition" style.
  - Start with **Excel/CSV templates for Khan, Golomt, TDB, Khas and State Bank** built from real samples.
  - API connectors come later as plug-ins: Khan and Golomt first, then TDB, which also has an open-source corporate statement client. (fact-check: corrected)
  - Validate Mongolian IBANs as 20 characters with mod-97; see §5. (fact-check: corrected)
  - Store the bank `record`/`journal` IDs to deduplicate re-imports.
- **I-11 Payment channels.** Use the payment method codes CASH, CARD, BANK_TRANSFER and QPAY, mapped to eBarimt payment codes.
  - The QPay plug-in confirms through `payment/check`, never on the callback alone.
  - A company setting `ebarimt_issuer = ERP | QPAY` prevents double receipts. With QPAY, store QPay's eBarimt ID in the receipt log.

**Privacy, hosting and ledger**
- **I-12 Personal data:**
  - Mark party fields that hold personal data (civil_id, registration number, phone, consumerNo).
  - Mask them in lists and exports, with role-based unmasking.
  - Log access and changes.
  - A consent record (purpose, date, channel) for non-tax processing such as marketing.
  - A breach register.
  - A retention policy engine: tax and accounting retention overrides deletion, and anonymisation follows after it.
  - Do **not** use the citizen registration number as a key or for TIN look-ups.
- **I-13 Hosting.** Choose one of:
  1. Mongolian-hosted SaaS, or
  2. Any cloud, with the eBarimt agent on-premises or in Mongolia.

  Record the choice as an ADR. Encryption at rest and in transit is required in both cases.
- **I-14 Ledger design**, taken from the reference ERPs:
  - Append-only GL with a transaction ID and register.
  - AR/AP open items plus **detailed application entries** modelled like Odoo's partial.reconcile (debit item, credit item, amount, amount in currency, realised FX entry ID).
  - Unapply by posting reversing detailed entries.
  - Dimension sets.
  - Lock dates: general, tax (set automatically when the VAT return is "filed") and an irreversible hard lock.
  - An optional hash chain for tamper evidence.

---

## 12. Open questions

1. **eBarimt for non-VAT payers** (most micro businesses, and more of them once the 400 M threshold applies): which `taxType` do they send, with `totalVAT=0`? Does PosAPI derive VAT from the merchant's `vatPayer` flag? Ask posapi@itc.gov.mn.
2. Can an ERP vendor get an **X-API-KEY** for `getSaleListERP` on behalf of each client? Can a single company (not a group) use it for its own purchases?
3. What is the exact **buyer confirmation** step and deadline for B2B purchase receipts? Can B2C receipts a company has received be re-issued as B2B, and how?
4. Does the operator (the ERP vendor) need **certification or registration** as a "system supplier" (`saveOprMerchants`)? What are the steps and costs?
5. Is `sendData` mandatory daily (skill) or automatic (portal text)?
6. Does the `reportMonth` rule cover B2C_INVOICE?
7. Are any **eBarimt API changes scheduled for 2027** (for example, for the simplified VAT regime)? None were found.
8. Mongolbank: what is the official publication time, and is there an official API or data-sharing agreement for software vendors? Is the end-of-day rate or the same-day rate legally required for a transaction?
9. Do Khan Bank, Golomt, TDB, XacBank and State Bank offer **ISO 20022 (camt.053) or MT940** exports to SME customers? We need sample Excel/CSV exports and the terms of corporate API access. The IBAN format is now known (20 characters, §5). (fact-check: corrected)
10. QPay: what are the merchant fees, the settlement timing and the callback payload format? Is the merchant-ID based eBarimt flow required?
11. Personal Data Protection Law: confirm the articles listed in §7 against the official text: "immediate" notice to the data subject, a yearly report to the National Human Rights Commission, and transfers abroad only by law, treaty or consent. Still open: the DPO requirement, the exceptions for legally required processing, the value of a fine unit, and any **data-localisation** duty for private SaaS. (fact-check: corrected)
12. Retention periods under the Accounting Law and the General Tax Law.
13. **Competitor list:** names, prices, eBarimt depth and user counts of local accounting software (desk research or user interviews).

---

## Fact-check log

Checked on 2026-10-06. **Method:** the shared web-search budget was used up, and the egress proxy blocked mongolbank.mn, legalinfo.mn, developer.itc.gov.mn, qpay.mn, swift.com, iban.com, Wikipedia and DLA Piper. Each claim was therefore re-checked against GitHub-hosted sources other than the ones the note cited where possible: other client libraries, other copies of the official PosAPI OpenAPI file, IBAN registry data, and raw Odoo and ERPNext source on `master`/`develop`.

**Totals:** 28 claims checked: 19 confirmed, 6 corrected, 3 unverifiable.

| Claim | Verdict | Source URL |
|---|---|---|
| Personal Data Protection Law adopted 2021-12-17, in force 2022-05-01 | Confirmed (independent cross-check of DLA Piper, LehmanLaw and Gratanet) | https://github.com/fritzhand/history-of-privacy/blob/HEAD/research/verify/global-f105.json ; https://lehmanlaw.mn/blog/personal-data-protection-in-mongolia/ |
| Breach-notice deadline, regulator and transfer rules "UNVERIFIED" | Corrected: notice to the data subject "immediately" (art. 22.2); yearly record to the National Human Rights Commission (art. 22.6); the Commission handles complaints (art. 24.1); transfers abroad by law, treaty or consent (art. 14.1). Secondary source, medium confidence | https://github.com/evil-robot/who-holds-the-record-open/blob/HEAD/data/MNG.json (cites https://legalinfo.mn/mn/detail?lawId=16390288615991) |
| Fines MNT 500,000–20,000,000 | Corrected: art. 6.27 of the Law on Violations sets 2,000 units (individual) and 20,000 units (legal entity) for unlawful disclosure of sensitive data, which is about MNT 2 M and MNT 20 M. The lower bound has no source | same as above (cites https://legalinfo.mn/mn/detail/12695) |
| Mongolian IBAN format "UNVERIFIED" | Corrected: in the SWIFT registry as `MN2!n4!n12!n`, 20 characters | https://github.com/arthurdejong/python-stdnum/blob/master/stdnum/iban.dat ; https://github.com/jschaedl/iban-validation/blob/master/Resource/iban_registry.php ; https://github.com/skwasjer/IbanNet/blob/HEAD/SupportedCountries.md |
| TDB has "no statement API evidence" | Corrected: an open-source corporate-gateway client calls TDB `/oauth2/token` and `/accounts/statement/{acct}`, and also Bogd and Trans Bank statement APIs | https://github.com/batkt/sukhBackv2/blob/HEAD/controller/cgw.js |
| Mongolbank `/mn/currency-rates/data` "works only from inside a browser session" (reCAPTCHA) | Corrected: several independent server-side clients POST to it with no captcha; an aggregator holds data through 2026-10-06. The endpoint itself is confirmed | https://github.com/b232270024-art/velofoods_web/blob/HEAD/src/services/exchangeRate.js ; https://github.com/okrbest/okrservice/blob/HEAD/packages/plugin-accountings-api/src/cronjobs/exchangeRates.ts ; https://github.com/AllRates-Today/central-bank-exchange-rates/tree/main/data/bom/daily |
| Mongolbank coverage "about 38 currencies plus XAU and XAG" | Corrected: 38 codes in total, including XAU, XAG and XDR/SDR | https://github.com/AllRates-Today/central-bank-exchange-rates/blob/main/data/bom/daily/2026-10-06.json |
| Rates are strings with comma thousand separators, per 1 unit | Confirmed (clients strip the commas) | https://github.com/okrbest/okrservice/blob/HEAD/packages/plugin-accountings-api/src/cronjobs/exchangeRates.ts |
| Weekends carry the previous rate forward | Confirmed: Sunday 2026-09-06 USD 3,595.58 equals Friday 2026-09-04. The aggregator may be filling the gap itself | https://github.com/AllRates-Today/central-bank-exchange-rates/blob/main/data/bom/daily/2026-09-06.json |
| USD = 3,576.42 MNT on 2026-05-22 | Unverifiable (only the frankfurter fixture has it) | https://github.com/lineofflight/frankfurter/blob/71334f73e9/spec/provider/adapters/bom_spec.rb |
| Bank codes (TDB 040000, Khan 050000, Golomt 150000, Khas 320000, State 340000, Bogd 380000, M bank 390000) | Confirmed by two other sources. An older PHP SDK has M bank as 991000 | https://github.com/tsetsee/qpay-php-api/blob/HEAD/src/Enum/BankCode.php ; https://github.com/Nomin7711/airalo-miniapp/blob/HEAD/src/constants/banks.js |
| Khan Bank `api.khanbank.com/v1`, `auth/token?grant_type=client_credentials`, `statements/{account}` | Confirmed (independent client; it also uses `statements/corporate/{account}`) | https://github.com/batkt/sukhBackv2/blob/HEAD/controller/cgw.js |
| Golomt `v1/auth/login`, `v1/account/operative/statement`, `OPERACCTSTA`, SHA-256 + AES-CBC checksum, UAT URL | Confirmed; production `openbank.golomtbank.com/api` added | https://github.com/batkt/sukhBackv2/blob/HEAD/controller/cgw.js ; https://github.com/hulgeebnaa/open-banking/blob/HEAD/docs/section-2.md |
| QPay v2 base URLs (`merchant.qpay.mn/v2`, `merchant-sandbox.qpay.mn/v2`); sandbox `TEST_MERCHANT`/`123456`/`TEST_INVOICE` | Confirmed | https://github.com/tsetsee/qpay-php-api/blob/HEAD/src/Enum/BaseUrl.php ; https://github.com/CORESOFTLLC/delivery.maximus.mn/blob/HEAD/apps/web/src/lib/qpay.ts |
| QPay `POST /v2/ebarimt/create {payment_id, ebarimt_receiver_type CITIZEN/COMPANY}` and `POST /payment/check {object_type: INVOICE…}` | Confirmed | https://github.com/mnmonherdene1234/qpaygo/blob/HEAD/ebarimt.go ; https://github.com/mxnkbatr/soyol-io/blob/HEAD/lib/qpay.ts |
| ДДТД is 33 digits | Confirmed | https://github.com/hurelhuyag/ebarimt/blob/HEAD/src/main/java/io/github/hurelhuyag/ebarimt/CreateReceiptResp.java ; https://github.com/orshih6/ebarimtv3/blob/HEAD/README.mn.md |
| `classificationCode` is exactly 7 digits | Confirmed (official sample `2349010`) | https://github.com/orshih6/ebarimtv3/blob/HEAD/README.mn.md ; https://github.com/Amraa1/ebarimt-pos-sdk/blob/HEAD/spec/vendor/PosAPI.yaml |
| `merchantTin`: legal entity 11 digits, individual civil_id 12–14 | Confirmed by the official OpenAPI text (sample `110718991986`). Older libraries check "11 or 14", so accept 11–14. The same text says **branch-registered taxpayers cannot issue receipts** | https://github.com/Amraa1/ebarimt-pos-sdk/blob/HEAD/spec/vendor/PosAPI.yaml |
| `unitPrice` and `totalAmount` include VAT and city tax | Confirmed ("Бүх төрлийн татвар шингэсэн дүн"); some official JSON samples are internally inconsistent | https://github.com/Amraa1/ebarimt-pos-sdk/blob/HEAD/spec/vendor/PosAPI.yaml |
| Firewall: `api.ebarimt.mn` 103.17.108.216/217; `auth.itc.gov.mn` 103.87.69.75/76 | Confirmed (a second copy of the official spec) | https://github.com/Amraa1/ebarimt-pos-sdk/blob/HEAD/spec/openapi/posapi-3.0.yaml |
| PosAPI host: disk ≥ 1 GB, ≥ 80 Mbps, Mongolian network only | Confirmed; the spec adds "from abroad, use a VPN with a Mongolian IP" | https://github.com/Amraa1/ebarimt-pos-sdk/blob/HEAD/spec/openapi/posapi-3.0.yaml |
| Receipts must reach the central system within 72 h | Confirmed | https://github.com/mgmnrn/javafx-fastfood/blob/HEAD/src/mn/mta/pos/exam/BridgePosAPI.java |
| `getTinInfo` closed for citizen registration numbers since 2026-06-15 | Unverifiable (no independent copy of the release note) | https://developer.itc.gov.mn/ (blocked) |
| Monpass signatures unsupported since 2025-05-22 | Unverifiable | https://developer.itc.gov.mn/ (blocked) |
| Odoo `l10n_mn`: BumanIT LLC + Odoo S.A., auto-install; ~300 eight-digit bilingual accounts; ~40 taxes; no city tax | Confirmed on `master`: 304 accounts, 41 taxes, no city-tax record | https://github.com/odoo/odoo/blob/master/addons/l10n_mn/__manifest__.py ; https://github.com/odoo/odoo/blob/master/addons/l10n_mn/data/template/account.tax-mn.csv |
| ERPNext immutable ledger posts the mirror on the cancel date with `is_cancelled=0` | Confirmed (`make_reverse_gl_entries`, `develop`) | https://github.com/frappe/erpnext/blob/develop/erpnext/accounts/general_ledger.py |
| Odoo `hard_lock_date` is irreversible with no exceptions | Confirmed | https://github.com/odoo/odoo/blob/master/addons/account/models/company.py |
| erxes has an eBarimt module in `mongolian_api` | Confirmed | https://github.com/erxes/erxes/tree/main/backend/plugins/mongolian_api/src/modules/ebarimt |
