# BC research: Sales (and purchase) documents and the document posting flow

- Source: BCApps (BC v29, W1 Base App, MIT). Every rule below was read from the AL code, not from documentation.
- Citation format: `[TAG]:line`. The tags map to repo-relative paths in the legend below.
- Keep levels: **MUST** = needed in the micro-ERP v1, **SHOULD** = keep in a simpler form or add soon after v1, **SKIP** = leave out.
- Account numbers in the examples are illustrative. They match the ones in `bc-account-determination.md`: 1100 Bank, 1200 Receivables, 1300 Inventory, 1500 VAT receivable, 2100 Payables, 2300 VAT payable, 5110 Sales of goods, 5120 Service revenue, 6110 COGS, 7010 Office supplies.
- Related notes: `bc-account-determination.md` covers how accounts are picked inside the Invoice Posting Buffer and how discounts are posted. `bc-vat.md` covers the VAT engine. `bc-gl-posting.md` covers Gen. Jnl.-Post Line, transactions and registers. This note covers the **document** layer: the document model, defaults, amounts, release, the Sales-Post pipeline, cancellation, and how purchase posting differs.

**Path legend** (all under `src/Layers/W1/BaseApp/`):

| Tag | File | Tag | File |
|---|---|---|---|
| SH | `Sales/Document/SalesHeader.Table.al` | SL | `Sales/Document/SalesLine.Table.al` |
| REL | `Sales/Document/ReleaseSalesDocument.Codeunit.al` | SCD | `Sales/Document/SalesCalcDiscount.Codeunit.al` |
| SCDT | `Sales/Document/SalesCalcDiscountByType.Codeunit.al` | SP | `Sales/Posting/SalesPost.Codeunit.al` |
| SPI | `Sales/Posting/SalesPostInvoice.Codeunit.al` | CORR | `Sales/History/CorrectPostedSalesInvoice.Codeunit.al` |
| PSD | `Sales/History/PostSalesDelete.Codeunit.al` | SIH | `Sales/History/SalesInvoiceHeader.Table.al` |
| CDM | `Utilities/CopyDocumentMgt.Codeunit.al` | VAL | `Finance/VAT/Calculation/VATAmountLine.Table.al` |
| IPB | `Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al` | GJL | `Finance/GeneralLedger/Journal/GenJournalLine.Table.al` |
| GJPL | `Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al` | GJCL | `Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al` |
| PT | `Foundation/PaymentTerms/PaymentTerms.Table.al` | CUST | `Sales/Customer/Customer.Table.al` |
| ACV | `Finance/VAT/Registration/AltCustVATRegFacade.Codeunit.al` | GLS | `Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al` |
| PP | `Purchases/Posting/PurchPost.Codeunit.al` | PPI | `Purchases/Posting/PurchPostInvoice.Codeunit.al` |
| PH | `Purchases/Document/PurchaseHeader.Table.al` | PPS | `Purchases/Setup/PurchasesPayablesSetup.Table.al` |
| VM | `Purchases/Vendor/VendorMgt.Codeunit.al` | SRS | `Sales/Setup/SalesReceivablesSetup.Table.al` |

---

## 1. Summary

- **One draft model for every document type.** Quote, Order, Invoice, Credit Memo, Blanket Order and Return Order all live in the same Header (T36) and Line (T37) tables, keyed by (`Document Type`, `No.`) and (`Document Type`, `Document No.`, `Line No.`). The document type drives defaults, the sign of the amounts and which posted tables are created.
- **The header pulls defaults from the customer by cascade.** Validating Sell-to fills addresses and the business posting groups. Bill-to fills the customer posting group, currency, Prices Including VAT, payment terms and payment method, and with the default G/L setup it overrides the Gen./VAT business posting groups. When a field that affects prices or VAT changes on a header that already has lines, the lines are recreated.
- **Line amounts are derived, not entered.** `Line Amount = round(Qty × Unit Price) − Line Discount Amount`. The invoice discount is spread over the lines that allow it, using a running remainder. VAT is calculated **per document per VAT identifier** and then spread back to the lines with a running remainder, so the line VAT amounts always add up to the document VAT.
- **Status Open → Released** locks the document for editing. Release checks that there is something to post, recalculates the invoice discount and the VAT, and sets the status. Posting releases an Open document automatically, but leaves it Open in the database if posting later fails.
- **Sales-Post (CU80)** runs these steps in order: check → assign posting numbers (**committed before the ledgers are posted**) → calculate the invoice discount → release → insert the posted header → for each line, split the amounts, negate them for invoices, post the item and fill the Invoice Posting Buffer → post the G/L rows from the buffer → post the customer entry → post the payment (balancing) entry → finalize (delete the draft) → commit.
- **Sign convention:** the amounts on an invoice line are negated before they reach the buffer, so revenue and VAT become credits. The customer entry is posted as −(negated total), which is a debit. Credit memos are left positive, so they produce the mirror image. Purchase posting does the opposite: credit memo lines are negated, invoice lines are not.
- **The customer ledger entry** carries the Due Date, the Pmt. Discount Date and the possible discount from the header. The posted invoice keeps a link to it (`Cust. Ledger Entry No.`). Remaining amount and Closed are calculated from it on demand.
- **Cancel/Correct** of a posted invoice is only allowed if the invoice is fully unpaid, has not been cancelled before, and its posting date is still open. It creates a credit memo by copying the invoice (same amounts, exact cost reversal, applied to the invoice), posts it, and records the pair in `Cancelled Document`. Correct then also creates a new draft invoice as a copy.
- **Due Date = CalcDate(Due Date Calculation, Document Date)**, not the Posting Date. The payment-discount date and percent come from the same Payment Terms. Credit memos get Due Date = Document Date unless the terms say to calculate discounts on credit memos.
- **Purchases mirror sales**, with three differences: the vendor's document number is mandatory by default, a duplicate check runs on (vendor, document type, external document no.), and the sign conventions are reversed.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| Sales Header | Table 36 | Unposted document header | PK `Document Type` Enum 36 {Quote, Order, Invoice, Credit Memo, Blanket Order, Return Order} + `No.` Code[20]; `Sell-to Customer No.`/`Bill-to Customer No.` Code[20]; `Posting Date`, `Document Date`, `VAT Reporting Date`, `Due Date`, `Pmt. Discount Date` Date; `Payment Discount %` Dec(0:5); `Payment Terms Code`, `Payment Method Code` Code[10]; `Currency Code` Code[10]; `Currency Factor` Dec(0:15); `Prices Including VAT` Bool; `Customer Posting Group`, `Gen. Bus. Posting Group`, `VAT Bus. Posting Group` Code[20]; `Bal. Account Type` Enum {G/L Account, Bank Account}/`Bal. Account No.` Code[20]; `Applies-to Doc. Type`/`No.`; `Status` Enum 3612 {Open, Released, Pending Approval, Pending Prepayment}; `Invoice Discount Calculation` {None, %, Amount}, `Invoice Discount Value` Dec; `No. Series`, `Posting No. Series`, `Posting No.`, `Last Posting No.` Code[20]; `External Document No.` Code[35]; `Correction` Bool; `Dimension Set ID` Int; FlowFields `Amount`, `Amount Including VAT` | MUST (SKIP IC, CRM, warehouse, prepayment, shipping-agent and job fields) |
| Sales Line | Table 37 | Unposted document line | PK (`Document Type`, `Document No.`, `Line No.` Int); `Type` Enum 37 {" ", G/L Account, Item, Resource, Fixed Asset, Charge (Item), Allocation Account}; `No.` Code[20]; `Quantity`, `Qty. to Ship`, `Qty. to Invoice`, `Quantity Invoiced` Dec(0:5); `Unit Price` Dec; `Line Discount %` Dec(0:5, 0..100); `Line Discount Amount`, `Line Amount`, `Inv. Discount Amount`, `Amount`, `Amount Including VAT`, `VAT Base Amount`, `VAT Difference` Dec; `VAT %` Dec; `VAT Calculation Type` Enum; `VAT Identifier` Code[20]; `Allow Invoice Disc.` Bool (InitValue true); `Gen. Bus./Prod. Posting Group`, `VAT Bus./Prod. Posting Group`, `Posting Group` Code[20]; `Unit Cost (LCY)` Dec; `System-Created Entry` Bool | MUST (types blank/G/L/Item; SKIP Resource, FA, Charge, Allocation) |
| Payment Terms | Table 3 | Due date and discount rules | `Code` Code[10]; `Due Date Calculation`, `Discount Date Calculation` DateFormula; `Discount %` Dec(0:5); `Calc. Pmt. Disc. on Cr. Memos` Bool | MUST (due date); SKIP the discount part in v1 |
| Payment Method | Table 289 | Default balancing account (cash sale) | `Code`; `Bal. Account Type`; `Bal. Account No.` | SHOULD |
| Sales & Receivables Setup | Table 311 | Number series and posting switches | `Invoice Nos.`, `Posted Invoice Nos.`, `Credit Memo Nos.`, `Posted Credit Memo Nos.`; `Discount Posting` {No, Invoice, Line, All}; `Calc. Inv. Discount`; `Invoice Rounding`; `Ext. Doc. No. Mandatory` (default false); `Default Posting Date`; `Link Doc. Date To Posting Date` (InitValue true) | MUST (subset) |
| Sales Invoice Header / Line | Tables 112 / 113 | Immutable posted invoice | Copy of header and line fields via TransferFields; `Pre-Assigned No.`, `Order No.`, `Cust. Ledger Entry No.` Int; FlowFields `Remaining Amount`, `Closed`, `Cancelled`, `Corrective` | MUST |
| Sales Cr.Memo Header / Line | Tables 114 / 115 | Immutable posted credit memo | as above + `Applies-to Doc. No.`, `Return Order No.` | MUST |
| Cancelled Document | Table 1900 | Invoice ↔ cancelling credit memo link | `Source ID`, `Cancelled Doc. No.`, `Cancelled By Doc. No.` | MUST (as FK `cancelled_by_id`) |
| VAT Amount Line | Table 290 (temp) | VAT totals per VAT identifier for a document | `VAT Identifier`, `VAT %`, `Line Amount`, `Inv. Disc. Base Amount`, `Invoice Discount Amount`, `VAT Base`, `VAT Amount`, `Amount Including VAT` | MUST (as a calculation step, not a table) |
| Invoice Posting Buffer | Table 55 (temp) | Groups line amounts into G/L rows | group key: type + G/L account + posting groups + dimension set (+ tax and deferral fields) | MUST (in-memory) |
| Cust. Ledger Entry / Detailed Cust. Ledg. Entry | Tables 21 / 379 | Receivable subledger | `Document Type`, `Document No.`, `Amount`, `Remaining Amount`, `Due Date`, `Pmt. Discount Date`, `Original Pmt. Disc. Possible`, `Open` | MUST |
| Purchase Header / Line | Tables 38 / 39 | Purchase mirror | as for sales + `Vendor Invoice No.`/`Vendor Cr. Memo No.` Code[35]; `Buy-from`/`Pay-to Vendor No.` | MUST |
| Purch. Inv. Header / Purch. Cr. Memo Hdr. | Tables 122 / 124 (+123/125) | Posted purchase documents | as for sales | MUST |
| Engine codeunits | CU414 Release Sales Document, CU80 Sales-Post, CU815 Sales Post Invoice, CU60/56 invoice discount, CU1303 Correct Posted Sales Invoice, CU6620 Copy Document Mgt., CU363 PostSales-Delete, CU90 Purch.-Post | Behaviour | — | MUST (re-implement the logic, not the structure) |

---

## 3. Business rules

### Document model and header defaults
- **R-SALES-DOCUMENTS-01**: The draft header is keyed by (`Document Type`, `No.`) and **cannot be renamed**. `No.` comes from the series for that document type (Quote/Order/Invoice/Credit Memo Nos.), and the code loops until it finds an unused number. *Src:* [SH]:3653, 3778-3787, 3966-3990, 4254-4292. *Keep:* MUST.
- **R-SALES-DOCUMENTS-02**: When a record is created, Posting Date := WorkDate (except for Quote and Blanket Order, or when the setup says "No Date"). Document Date := Posting Date when `Link Doc. Date To Posting Date` is set (the default), and WorkDate only if it is still blank after that (verified-corrected: the note said Document Date := WorkDate unconditionally; see [SH]:4019-4021, 9753-9768). VAT Date := Posting Date or Document Date depending on G/L Setup, and Correction := GLSetup."Mark Cr. Memos as Corrections" for credit documents. *Src:* [SH]:4014-4021, 4038-4042, 4074-4092; [GLS]:1620-1630. *Keep:* MUST (VAT Date = Posting Date only).
- **R-SALES-DOCUMENTS-03**: Validating Sell-to copies name, address, **Gen. Bus. Posting Group** and **VAT Bus. Posting Group**. It requires the customer to have a Gen. Bus. Posting Group and not to be blocked. Changing the customer, currency or business posting groups recreates all lines (after a confirmation). *Src:* [SH]:105-245, 7766-7796. *Keep:* MUST.
- **R-SALES-DOCUMENTS-04**: Bill-to (NotBlank) copies the **Customer Posting Group** (which gives the receivables account), Currency, Prices Including VAT, Payment Terms, Payment Method, invoice-discount code and price group. With the default `Bill-to/Sell-to VAT Calc. = Bill-to/Pay-to No.`, it also **overrides** the Gen./VAT Bus. Posting Group with the Bill-to values. *Src:* [SH]:267-355, 7940-7997; [ACV]:187-197; [GLS]:901. *Keep:* MUST (collapse to a single customer field). *Notes:* credit documents copy the Payment Method only if the terms calculate discounts on credit memos ([SH]:7969-7975).
- **R-SALES-DOCUMENTS-05**: Most header fields call `TestStatusOpen`, so a Released document cannot be edited. On lines, the check applies to every non-system line except comment lines. *Src:* [SH]:9136-9146; [SL]:7196-7214. *Keep:* MUST.
- **R-SALES-DOCUMENTS-06**: The Currency Factor is taken from the exchange rate on the Posting Date (WorkDate if the date is blank) and is 0 for LCY. Changing the Posting Date recalculates it and asks whether to update the lines. *Src:* [SH]:670-680, 4746-4776. *Keep:* SHOULD.
- **R-SALES-DOCUMENTS-07**: Changing the Posting Date is blocked if a Posting No. is already assigned from a **date-ordered** series. The Document Date follows the Posting Date when `Link Doc. Date To Posting Date` is set. *Src:* [SH]:654-666, 4334-4346, 9753-9768. *Keep:* MUST (the date-order invariant).
- **R-SALES-DOCUMENTS-08**: Bal. Account (header): a G/L account must allow Direct Posting, and a bank account must not be blocked and must have the **same currency as the document**. Bal. Account and `Applies-to Doc. No.` exclude each other. The Payment Method fills Bal. Account Type/No. *Src:* [SH]:1255, 1275-1300, 2049-2072. *Keep:* SHOULD (cash sale).
- **R-SALES-DOCUMENTS-09**: The posted number series is resolved when the record is initialised. If the draft series equals the posted series (Invoice/Credit Memo), the posted document **keeps the draft number** and no new number is drawn. *Src:* [SH]:9433-9504; [SP]:2811-2816, 7223-7237. *Keep:* SHOULD (simplest choice: one series, the posted number = the draft number assigned at posting).

### Lines and amounts
- **R-SALES-DOCUMENTS-10**: Line defaults come from the header: customer, currency, Gen./VAT Bus. Posting Group, dimensions. From the item (or G/L account) come the Gen./VAT Prod. Posting Group, Inventory Posting Group, Unit Cost and `Allow Invoice Disc.`. **G/L-account lines get `Allow Invoice Disc.` = false** and must allow Direct Posting. Items must not be blocked (or sales-blocked, except on credit documents). *Src:* [SL]:9773-9813, 4769-4785, 4799-4860. *Keep:* MUST.
- **R-SALES-DOCUMENTS-11**: When `No.` is validated, the code checks that the General Posting Setup has a Sales account (and a COGS account) and that the VAT Posting Setup has a Sales VAT account. These checks only **send a non-blocking notification** (and only when posting-setup notifications are enabled; a missing General Posting Setup row is even auto-created). They do not stop data entry; the hard failure still happens at posting, when `GetSalesAccount`/`GetSalesCrMemoAccount` logs an error for a blank account (verified-corrected: the note said a missing setup "fails early"). *Src:* [SL]:336-343; `Finance/ReceivablesPayables/PostingSetupManagement.Codeunit.al`:103-122, 422-438; [SPI]:295-311. *Keep:* MUST (in the new system, validate the account mapping as a hard error at line entry or at release).
- **R-SALES-DOCUMENTS-12**: `Line Discount Amount = round(round(Qty × Unit Price) × Line Discount % / 100)`. Entering an amount instead back-calculates the % to 5 decimals, which must stay within 0..100. Changing the line discount resets the line's invoice discount. *Src:* [SL]:9559-9585, 1042-1060, 10258-10280. *Keep:* MUST.
- **R-SALES-DOCUMENTS-13**: `Line Amount = round(Qty × Unit Price) − Line Discount Amount`. A directly entered Line Amount is converted into a Line Discount Amount. The amount after invoice discount is `CalcLineAmount() = Line Amount − Inv. Discount Amount`. *Src:* [SL]:5881, 2051-2085, 4697-4702. *Keep:* MUST.
- **R-SALES-DOCUMENTS-14**: Line VAT is a **cumulative** calculation over all other lines in the document with the same VAT Identifier / calculation type: `AIV_line = round((ΣAmt_others + Amt) × (1+VAT%)) − ΣAIV_others`. For PIV the reverse applies: `Amount = round((ΣLA − ΣInvDisc + CalcLineAmount)/(1+VAT%)) − ΣAmount_others`. *Src:* [SL]:5919-6080. *Keep:* MUST. *Notes:* this protects the invariant Σ line VAT = round(Σ base × rate).
  - The document-level VAT group is not just the VAT Identifier. The VAT Amount Line key is (`VAT Identifier`, `VAT Calculation Type`, `Tax Group Code`, `Use Tax`, `Positive`), where `Positive = Line Amount ≥ 0`. A negative line on an invoice (for example a manual discount line) therefore forms its **own** VAT group and is rounded separately, and the rounding residue of the negative group is carried into the next group of the same identifier. Posting looks up the group with the same five-part key. (added-in-verification) *Src:* [VAL]:323; [SL]:7637; [SP]:3376; [VAL]:840-890.
- **R-SALES-DOCUMENTS-15**: The invoice discount is either a **%** (from Cust. Invoice Disc. using the minimum amount, or set on the header) or an **Amount** typed on the header. It is spread over VAT groups in proportion to `Inv. Disc. Base Amount`, and then over the lines that have `Allow Invoice Disc.`, in both cases with a running remainder. *Src:* [SCD]:57-222; [SCDT]:75-111; [VAL]:637-699; [SL]:7339-7350. *Keep:* SHOULD (Amount and % on the header; SKIP the Cust. Invoice Disc table and service charge).
- **R-SALES-DOCUMENTS-16**: Changing a line discount on a line that carried invoice discount reduces the header's Amount-type `Invoice Discount Value` by that line's share. *Src:* [SL]:9574-9580, 9592-9609. *Keep:* SHOULD.
- **R-SALES-DOCUMENTS-17**: Changing Prices Including VAT requires that no line is invoiced. Unit prices are either converted by ×(1+VAT%) or ÷(1+VAT%) (after confirmation) or kept, and all amounts are recalculated. Changing the VAT Prod. Posting Group on a PIV item line rescales the Unit Price by (100+new%)/(100+old%). *Src:* [SH]:999-1081; [SL]:1835-1841. *Keep:* MUST.
- **R-SALES-DOCUMENTS-18**: A line with Quantity = 0 must have Amount = 0. A line with Quantity ≠ 0 must have Type, No., and Gen. Bus./Prod. Posting Groups. *Src:* [SP]:2635-2661. *Keep:* MUST.

### Release
- **R-SALES-DOCUMENTS-19**: Release fails if there is no line with Type ≠ blank and Quantity ≠ 0 ("nothing to release"), or if the Sell-to customer is blank. *Src:* [REL]:66-67, 154-174, 207-218. *Keep:* MUST.
- **R-SALES-DOCUMENTS-20**: Release recalculates the invoice discount when `Calc. Inv. Discount` is set (keeping the posting date), then sets Status = Released and recalculates VAT on the lines for the General and Invoicing quantities. *Src:* [REL]:104-119, 131-145, 431-443. *Keep:* MUST (recalculate the totals at release).
- **R-SALES-DOCUMENTS-21**: Reopen simply sets Status = Open. A document waiting for approval cannot be released manually, and an order with unpaid prepayment goes to "Pending Prepayment". *Src:* [REL]:223-243, 286-330. *Keep:* MUST (Reopen); SKIP approvals and prepayment.

### Posting checks (Sales-Post)
- **R-SALES-DOCUMENTS-22**: Mandatory fields: Document Type, Sell-to, Bill-to, Posting Date, Document Date. The Posting Date must be inside the allowed posting range. The VAT Date is filled in if it is empty. *Src:* [SP]:8661-8677, 852-856, 8903-8910. *Keep:* MUST.
- **R-SALES-DOCUMENTS-23**: Posting flags: Invoice ⇒ Ship+Invoice, Credit Memo ⇒ Receive+Invoice. On an invoice every line must have Qty. to Ship = Qty. to Invoice = Quantity, so partial invoicing of an Invoice document is impossible. *Src:* [SP]:8694-8739, 2483-2518. *Keep:* MUST.
- **R-SALES-DOCUMENTS-24**: If no line has Qty ≠ 0, the Invoice flag is cleared and release then fails. **A non-credit invoice whose total is negative is rejected**, so credits must be made with a credit memo. *Src:* [SP]:658-689, 943-960. *Keep:* MUST.
- **R-SALES-DOCUMENTS-25**: Non-credit invoices require a Due Date. *Src:* [SP]:893-895. *Keep:* MUST.
- **R-SALES-DOCUMENTS-26**: Customer Blocked: `All` blocks everything, including credit memos and return orders. `Invoice` blocks Quote/Order/Invoice/Blanket Order but **not** credit memos or return orders. `Ship` blocks Quote/Order/Blanket Order when they are edited, and at posting blocks any Quote/Order/Invoice/Blanket Order that ships something; again credit documents are not blocked. `Privacy Blocked` always blocks. Both Sell-to and Bill-to are checked (Bill-to only when it differs). (verified-corrected: Blanket Order and the credit-document exemption were missing.) *Src:* [SP]:6238-6286; [CUST]:2759-2778. *Keep:* MUST (one Blocked flag; decide explicitly whether a blocked customer may still receive a credit memo, since BC allows it unless Blocked = All).
- **R-SALES-DOCUMENTS-27**: Dimension rules and blocked General/VAT posting setups are checked before anything is written. *Src:* [SP]:877-879, 2520-2550. *Keep:* SHOULD.
- **R-SALES-DOCUMENTS-28**: `External Document No.` is mandatory only when `Ext. Doc. No. Mandatory` is set (default **false** for sales). *Src:* [SP]:7228-7231; [GJPL]:7292-7314. *Keep:* SHOULD.

### Numbering and commit points
- **R-SALES-DOCUMENTS-29**: The Posting No. is drawn **before the ledgers are posted**, written to the draft header and **committed** (commit #1). A retry therefore reuses the same number. The code fails early if a posted document with that number already exists. *Src:* [SP]:2787-2830, 766-782. *Keep:* MUST (invariant: no posted number is lost or duplicated). *Notes:* in the new system, draw the number inside the single posting transaction from a row-locked counter.
- **R-SALES-DOCUMENTS-30**: If the series is **date-ordered**, the early commit is suppressed, so the number and the posted document land in the same transaction. If a caller forces a commit anyway, posting fails with an error. *Src:* [SP]:766-777, 371-377. *Keep:* MUST (always one transaction).
- **R-SALES-DOCUMENTS-31**: Further commits happen after the invoice-discount recalculation (#2) and after the automatic release (#3, where the DB status stays Open), and one final commit happens after finalize (#4/#5). Commit #1 only happens when a new posting number was actually drawn (`ModifyHeader`), and commit #2 only when `Calc. Inv. Discount` is set **and** the document is already Released; for an Open document the invoice discount is recalculated inside the release step instead (verified-corrected: both commits were presented as unconditional; [SP]:777-782, 694-716; [REL]:104-119). Line posting runs under `CommitBehavior::Ignore`, so extensions cannot commit half a document. *Src:* [SP]:695-716, 2400-2434, 3292-3295, 378-382, 400-442. *Keep:* MUST (one atomic transaction, no intermediate commits).
- **R-SALES-DOCUMENTS-32**: Deleting a draft that already has a Posting No. (or whose draft series = posted series) **creates an empty posted invoice or credit memo with that number** to fill the gap, after a confirmation. *Src:* [SH]:4352-4421, 3705-3750; [PSD]:232-292. *Keep:* MUST (in a simpler form: never hand out the number before commit, so no gap can arise).

### Posting mechanics
- **R-SALES-DOCUMENTS-33**: Each line is posted in this order: `UpdateSalesLineBeforePost` → `DivideAmount` (prorate by Qty. to Invoice using the document VAT lines and remainders) → `RoundAmount` (add to the FCY and LCY totals) → **`ReverseAmount` if the document is not a credit memo** → item posting → `PrepareLine` into the buffer → insert the posted line. *Src:* [SP]:997-1180. *Keep:* MUST.
  - Line processing order: when the "Concurrent Inventory Posting" feature key is on (`InventorySetup.UseLegacyPosting() = false`), posting iterates the lines by (`Type`, `Line No.`), not by `Line No.` alone. G/L Account lines (Type 1) are therefore processed before Item lines (Type 2). Because `DivideAmount` distributes the group VAT with a running remainder in that iteration order, the **posted** per-line VAT can differ by ±0.01 from the draft's line VAT, which was distributed in `Line No.` order at release. Document and G/L totals are unaffected (see E1). (added-in-verification) *Src:* [SP]:489-490, 3376-3445; `Inventory/Setup/InventorySetup.Table.al`:705-710.
- **R-SALES-DOCUMENTS-34**: The LCY amount of each line = round(running FCY total → LCY) − running LCY total. This makes the line LCY amounts add up exactly to the LCY value of the document total. *Src:* [SP]:3487-3567. *Keep:* SHOULD.
- **R-SALES-DOCUMENTS-35**: The G/L account for a line is the line's own `No.` for G/L-account and FA lines. For items and resources it is the General Posting Setup Sales account, or the **Sales Credit Memo account** on credit documents. *Src:* [SPI]:295-311. *Keep:* MUST.
- **R-SALES-DOCUMENTS-36**: The customer entry: Account = **Bill-to**. `Amount = −TotalSalesLine.AIV`, which is positive (a debit) for invoices because the totals were negated ([SP]:521-526). Due Date, Payment Terms and discount fields come from the header. `Allow Application = Bal. Account No. blank`. *Src:* [SPI]:593-660; [GJL]:7313-7404. *Keep:* MUST.
- **R-SALES-DOCUMENTS-37**: When a Bal. Account is set, a second entry is posted after the customer entry: Document Type Payment (Refund for credit memos), same Document No., Applies-to = the new invoice, `Amount = TotalSalesLine.AIV` (+ remaining payment discount). The invoice is closed in the same posting run. *Src:* [SP]:1262-1274; [SPI]:662-751. *Keep:* SHOULD (cash/POS sale).
- **R-SALES-DOCUMENTS-38**: The (Document Type, Document No.) pair must not already exist in the customer ledger, and the posted header stores the `Cust. Ledger Entry No.` of the new entry. *Src:* [GJPL]:1323-1330; [GJCL]:801-820; [SP]:6158-6184. *Keep:* MUST.
- **R-SALES-DOCUMENTS-39**: Item lines produce an item journal line (Entry Type Sale) with `Invoiced Quantity` and `Amount = −(line Amount × factor − remainder)`. The item engine stores the quantity **negative** for a sale and positive for a return. Inventory and COGS G/L entries come from the value entries. They are posted to the G/L in the same run **only when Inventory Setup `Automatic Cost Posting` is on**; otherwise they wait for the "Post Inventory Cost to G/L" batch, and the sale's G/L transaction contains revenue, VAT and receivable only (added-in-verification; `Inventory/Posting/ItemJnlPostLine.Codeunit.al`:246, 683). *Src:* [SP]:1583-1666, 1318-1391; `Inventory/Journal/ItemJournalLine.Table.al`:2386-2398. *Keep:* MUST (stock-out and COGS; post COGS in the same transaction).
- **R-SALES-DOCUMENTS-40**: Invoice rounding (optional): after the last line, a system line is added on the customer posting group's Invoice Rounding account for `−round(Total AIV − round(Total AIV, Inv. Rounding Precision))`. *Src:* [SP]:1216-1229, 3587-3654. *Keep:* SHOULD (round to whole MNT for cash).
  - The rounding line is an ordinary G/L-account line, so it takes the VAT Prod. Posting Group of the Invoice Rounding account. If that group has a non-zero VAT %, the rounding amount is split into base + VAT (for prices excl. VAT the Unit Price is `IR/(1+VAT%)` and AIV is forced to `IR`). The rounding account should carry a 0 % / exempt VAT group, otherwise the eBarimt VAT totals and the G/L VAT will drift by the VAT share of the rounding. Rounding uses `Currency."Invoice Rounding Precision"` (for LCY, the G/L Setup `Inv. Rounding Precision (LCY)`) and requires `Sales & Receivables Setup."Invoice Rounding"`. (added-in-verification) *Src:* [SP]:3598-3632, 1222-1223.
- **R-SALES-DOCUMENTS-41**: Finalize: for Invoice and Credit Memo documents, or an Order that is completely invoiced, the draft is archived (if set up), then the header, lines and comments are **deleted**. A partly invoiced Order stays. *Src:* [SP]:3192-3317, 3140-3190. *Keep:* MUST (mark the draft as posted, or delete it; never edit posted docs).
- **R-SALES-DOCUMENTS-42**: Preview runs the full posting with fake numbers (`***nnnnnn`) and then raises an error to roll back. *Src:* [SP]:11942-11948, 3285-3290, 7038-7039. *Keep:* SHOULD.

### Credit memos and cancellation
- **R-SALES-DOCUMENTS-43**: Cancel/Correct preconditions: the original Posting Date is still allowed for posting, the invoice is not already cancelled, it is not itself a corrective document, it is **fully unpaid** (`Amount Including VAT = Remaining Amount`), the customer is not blocked, the lines are of supported types, items have not been returned, the inventory period is open, it has no FA or prepayment lines, and number series are free. *Src:* [CORR]:349-370, 550-679. *Keep:* MUST (the unpaid, once-only and open-period checks).
- **R-SALES-DOCUMENTS-44**: The cancelling credit memo is a **copy of the posted invoice**: header via TransferFields (so Posting Date, VAT date and currency factor come **from the invoice**), lines with the same amounts including Inv. Discount Amount, exact cost reversal (`Appl.-from Item Entry`), and Applies-to Doc. = the invoice with Amount to Apply = remaining. It is posted immediately, and a `Cancelled Document` row links the two. *Src:* [CORR]:41-71, 179-207, 393-407; [CDM]:775-792, 696-718, 1718-1757, 7225-7260, 8382-8386. *Keep:* MUST. *Notes:* verify the posting-date inheritance with a test; no code resets it. Verification re-read: the only posting-date reset in the copy path is for Quote/Blanket Order targets ([CDM]:711-712), `UpdateSalesCreditMemoHeader` does not touch it ([CDM]:7326-7345), and the Applies-to fields are only set if the invoice entry is still open ([CDM]:7240-7255).
- **R-SALES-DOCUMENTS-45**: Correct = Cancel + a new draft Invoice copied from the original for the user to edit. *Src:* [CORR]:333-342. *Keep:* SHOULD.
- **R-SALES-DOCUMENTS-46**: Credit documents are marked `Correction` (storno) when the G/L setup says so. Their G/L entries are then posted as negative debits or credits instead of the opposite side. *Src:* [SH]:4037-4040; [CDM]:7322-7340. *Keep:* SKIP in v1 (see open questions).

### Payment terms
- **R-SALES-DOCUMENTS-47**: `Due Date = CalcDate(Due Date Calculation, Document Date)` and `Pmt. Discount Date = CalcDate(Discount Date Calculation, Document Date)`. They are recalculated whenever the Payment Terms or the Document Date change. With blank terms, Due Date = Document Date. On credit documents (without "calc. on Cr. Memos"), Due Date = Document Date and there is no discount. *Src:* [SH]:719-781, 1962-1988; [PT]:2-30. *Keep:* MUST (due date).
- **R-SALES-DOCUMENTS-48**: `Original Pmt. Disc. Possible = round(Amount × Payment Discount % / 100)`, using the amount incl. VAT (or excl. VAT when `Pmt. Disc. Excl. VAT` is set). It is only set when the discount date plus grace period ≥ Posting Date. *Src:* [GJPL]:2617-2650. *Keep:* SKIP in v1.

### Purchase differences
- **R-SALES-DOCUMENTS-49**: `Ext. Doc. No. Mandatory` defaults to **true** for purchases. Invoices and orders need `Vendor Invoice No.`, and credit memos need `Vendor Cr. Memo No.`. *Src:* [PPS]:64-69; [PP]:911-916, 989-1016. *Keep:* MUST.
- **R-SALES-DOCUMENTS-50**: Duplicate check: posting fails if the vendor already has an entry with the same Document Type and External Document No. that has not been reversed. The filter is on the **Pay-to** vendor's ledger entries. The check runs whenever `Ext. Doc. No. Mandatory` is set **or** a vendor document number was entered, so it also applies when the setup flag is off (verified-corrected: the note tied the check only to the mandatory setting). Validating the field shows a notification earlier. *Src:* [PP]:1266-1268, 7592-7608; [VM]:159-166; [GJPL]:7316-7340; [PH]:1206-1226. *Keep:* MUST.
- **R-SALES-DOCUMENTS-51**: Signs: **credit-memo** purchase lines and totals are negated ([PP]:308-310, 1098-1101). The vendor entry has `Amount = −Total AIV`, so it is negative (a credit) for invoices and positive (a debit) for credit memos. *Src:* [PPI]:736-744. *Keep:* MUST.
- **R-SALES-DOCUMENTS-52**: The Vendor Posting Group comes from Pay-to. Gen./VAT Bus. Posting Group come from Buy-from, or from Pay-to under the default VAT calc. setting. Due Date is calculated from the Document Date, as on the sales side. *Src:* [PH]:130, 268-281, 649. *Keep:* MUST.

---

## 4. Flows

### F1: Create and edit a sales invoice
1. Insert: `No.` is taken from the series; `InitRecord` sets the Posting/Document/VAT dates, the posting no. series and Correction ([SH]:3752-3776, 3966-4059).
2. Sell-to is validated: blocked check, address, Gen./VAT Bus. PG, then Bill-to is validated ([SH]:105-245).
3. Bill-to is validated: Customer PG, currency (and currency factor), PIV, payment terms (Due Date), payment method (Bal. Account), dimensions ([SH]:267-355).
4. Add lines: Type → No. (copy from the item or G/L account, setup check, VAT %) → Quantity → Unit Price → Line Discount % → `UpdateAmounts` → `UpdateVATAmounts` ([SL]:117-396, 681-830, 5854-6080).
5. Optional: set the invoice discount (amount or %), which is spread to the VAT groups and then to the lines ([SCDT]:75-111).

### F2: Release / Reopen
1. Return if already Released. Check restrictions and that Sell-to is set ([REL]:66-90).
2. Require at least one line with Type ≠ blank and Qty ≠ 0. Check location and UoM on item lines ([REL]:154-205).
3. If `Calc. Inv. Discount` is set, run Sales-Calc. Discount and restore the Posting Date ([REL]:104-119).
4. Status := Released. Recalculate VAT on the lines (General and Invoicing quantities). Modify ([REL]:131-145).
5. Reopen: Status := Open ([REL]:223-243).

### F3: Sales-Post (`RunWithCheck`, [SP]:294-391)
1. `OnBeforePostSalesDoc` event ([SP]:312). Apply the batch replace-date parameters and test the posting date ([SP]:323, 11551-11609).
2. Load setups and currency. Copy the lines into a temporary table ([SP]:333-342).
3. If invoicing, check that the invoice total is ≥ 0 ([SP]:345-347).
4. **CheckAndUpdate** ([SP]:745-812):
   1. `CheckSalesDocument`: mandatory fields, allowed posting date, VAT date, posting flags, dimensions, blocked customer, Invoice flag recalculated, Due Date, then `TestSalesLine` for each line ([SP]:832-916).
   2. `UpdatePostingNos`: Shipping No., Return Receipt No., Posting No. Collision check. **Commit #1** unless date-ordered ([SP]:766-782).
   3. `CalcInvDiscount` (**commit #2**, only when `Calc. Inv. Discount` is set and the document is not Open). `ReleaseSalesDocument` (**commit #3**; status stays Open in the DB, Released in memory) ([SP]:790-794, 694-716) (verified-corrected).
   4. Archive the order if it ships. Lock tables. Source code = SALES ([SP]:796-803).
   5. `InsertPostedHeaders`: posted invoice header (TransferFields; No. = Posting No., or the draft No. when the series are equal; Pre-Assigned No.; user and source code) or credit memo header ([SP]:7028-7094, 7205-7314).
5. **ProcessPosting** under `CommitBehavior::Ignore` ([SP]:400-543):
   1. Calculate the document VAT Amount Lines for the Invoicing quantity ([SP]:478-481).
   2. For each line, run `PostSalesLine` (F4). After the last line, add the invoice rounding line if enabled ([SP]:494-512, 1216-1229).
   3. If not a credit memo, negate `TotalSalesLine` and `TotalSalesLineLCY` ([SP]:521-526).
   4. If invoicing, run `PostInvoice` (F5) ([SP]:530-532). Then run the inventory adjustment ([SP]:538-542).
6. `UpdateLastPostingNos`: Last Posting No. := Posting No.; Posting No. := '' ([SP]:3020-3036).
7. **FinalizePosting**: archive, delete approvals, **delete the draft** (Invoice/Credit Memo or a fully invoiced Order), preview throws, **commit #4** ([SP]:3192-3317).
8. Commit #5 and update the analysis views. `OnAfterPostSalesDoc` event ([SP]:378-390).

### F4: `PostSalesLine` (one line, [SP]:997-1180)
1. `UpdateSalesLineBeforePost`: zero Qty. to Ship if not shipping; cap Qty. to Invoice at the maximum ([SP]:3038-3111).
2. `TestUpdatedSalesLine`. Set `EverythingInvoiced` := false if a quantity remains ([SP]:1031-1037).
3. `DivideAmount(Qty. to Invoice)`: Line Amount and line discount prorated; Inv. Discount = the stored "to invoice" amount; VAT and AIV from the document VAT line with a running remainder ([SP]:3349-3466).
4. `RoundAmount`: add to the FCY totals; convert the line to LCY by the running-total difference; add to the LCY totals ([SP]:3487-3567).
5. If not a credit memo, `ReverseAmount` (negate quantities and amounts) ([SP]:1047-1051, 3569-3585).
6. By type: G/L checks Direct Posting; Item posts the item journal (shipment and invoice); Resource posts the resource journal ([SP]:1064-1073).
7. If Type ≠ blank and Qty. to Invoice ≠ 0: `PrepareLine` puts 1 to 3 rows into the buffer (invoice discount and line discount rows depending on `Discount Posting`, plus the main revenue row), grouped by the buffer key ([SP]:1075-1082; [SPI]:127-284; [IPB]:717-756).
8. Insert the posted invoice line or credit memo line from the un-negated copy `xSalesLine`, keeping the SystemId ([SP]:1106-1175).

### F5: `PostInvoice` ([SP]:1236-1281)
1. `PostLines`: for each buffer row (last to first), build a Gen. Journal Line (posting/document/VAT dates, dimensions, Gen. Posting Type = Sale) and post it. VAT entries are created by the engine ([SPI]:450-544).
2. `PostLedgerEntry`: customer line (Bill-to), amount −Total AIV, Due Date and payment terms, Applies-to fields → Cust. Ledger Entry plus application ([SPI]:593-660; [GJPL]:1250-1369).
3. Link the posted header to its Cust. Ledger Entry No. ([SP]:6158-6184).
4. If a Bal. Account is set, `PostBalancingEntry` posts a Payment or Refund applied to the new entry ([SPI]:662-751).

### F6: Cancel a posted invoice ([CORR]:139-207, 41-71)
1. `TestCorrectInvoiceIsAllowed` (R-43).
2. Insert a new Credit Memo header with a new draft No. `CopySalesDocForInvoiceCancelling`: TransferFields from the posted invoice, lines copied with their amounts, exact cost reversal, Applies-to = the invoice, Amount to Apply set on the invoice entry.
3. Unapply the item cost applications. The code sets `SuppressCommit := not IsNoSeriesInDateOrder(Posting No. Series)`, so the pre-posting commit happens **only when** the credit memo's posting number series **is** date-ordered and is skipped otherwise (verified-corrected: the note had the condition reversed; [CORR]:56-62). Run Sales-Post on the credit memo.
4. Insert the `Cancelled Document` row (invoice → credit memo). Update the order lines if any. Commit.
5. If posting fails, the user is offered the unposted or posted credit memo ([CORR]:145-177).

### F7: Purchase posting (CU90) differences
1. In the check phase: `Vendor Invoice No.` or `Vendor Cr. Memo No.` is required when mandatory ([PP]:911-916).
2. Lines are negated for **credit** documents only. Totals are negated for credit documents ([PP]:1098-1101, 308-310).
3. After the G/L rows are posted and before the vendor entry, the duplicate External Document No. check runs ([PP]:1266-1268).
4. Vendor entry `Amount = −Total AIV` ([PPI]:736).

---

## 5. Calculations and rounding

Notation: `P` = Amount Rounding Precision of the document currency (LCY 0.01 by default), `r(x)` = round to nearest at P, `v%` = VAT %.

| # | Quantity | Formula | Source |
|---|---|---|---|
| C1 | Gross | `G = r(Qty × UnitPrice)` | [SL]:5881 |
| C2 | Line discount | `LDA = r(G × LD% / 100)`; reverse: `LD% = round(LDA / G × 100, 0.00001)` ∈ [0,100] | [SL]:9570-9573, 10270-10277 |
| C3 | Line Amount | `LA = G − LDA` | [SL]:5881 |
| C4 | Invoice discount split | per VAT group: `IDg = r(running Σ ID × InvDiscBase_g / ΣInvDiscBase)`; per line: `IDl = r(rem + IDg × LA_l / InvDiscBase_g)`, `rem −= IDl` (only lines with Allow Inv. Disc.) | [VAL]:637-665; [SL]:7335-7350 |
| C5 | Group VAT (excl. VAT prices) | `Base_g = Σ(LA − ID)`; `VAT_g = round(Base_g × v%/100, P, VAT rounding direction)`; `AIV_g = Base_g + VAT_g` | [VAL]:700-759 |
| C6 | Group VAT (PIV) | `AIV_g = Σ(LA − ID)`; `VAT_g = round(AIV_g × v/(100+v), P, dir)`; `Base_g = AIV_g − VAT_g` | [VAL]:700-759 |
| C7 | Line VAT distribution | excl. VAT: `VAT_l = r(rem + VAT_g × Amt_l / Base_g)`; PIV: `AIV_l = r(remAIV + AIV_g × CLA_l/CLA_g)`, `Amt_l = AIV_l − r(rem + VAT_g × CLA_l/CLA_g)` | [SL]:7358-7400; [SP]:3394-3445 |
| C8 | Partial invoice | `LA_part = r(QtyToInv × UnitPrice) − r(r(QtyToInv × UnitPrice) × LD% / 100)` (recomputed from the unit price, not prorated from LA; with prepayment to deduct, `r(QtyToInv × r(Qty × UnitPrice) / Qty)` is used for the gross part); the posted `Line Discount Amount` field is `LDA_part = r(LDA × QtyToInv / Qty)` (verified-corrected: the note had `LA_part = LA × QtyToInv / Qty`) | [SP]:3468-3485; [SL]:8442-8474 |
| C9 | LCY of line | `X_LCY,l = round(ΣX_FCY,1..l / CurrencyFactor) − ΣX_LCY,1..l−1` for AIV, Amount, LA, LDA, ID, VAT Difference, VAT Base. `Round()` is called with no precision argument; the platform then takes the precision from Codeunit 45 `ReadRounding`, which BaseApp answers with **G/L Setup `Amount Rounding Precision`** (the LCY precision), with 2 decimals as the fallback only if nothing answers (verified-corrected: the note said a fixed 0.01 default) | [SP]:3499-3555; `Finance/Currency/AmountAutoFormat.Codeunit.al`:55-60; MS Learn "System.Round Method" |
| C10 | Customer amount | `Amount = −Total.AIV` (Total negated for invoices ⇒ positive) | [SPI]:645 |
| C11 | Invoice rounding | `IR = −r(TotalAIV − round(TotalAIV, InvRoundPrec, dir))` posted as a line on the Invoice Rounding account | [SP]:3598-3602 |
| C12 | Due / discount dates | `Due = CalcDate(DueFormula, DocumentDate)`; `PmtDiscDate = CalcDate(DiscFormula, DocumentDate)`. For example, with Document Date 2026-01-31: `1M`→2026-02-28 (clamped to month end), `30D`→2026-03-02, `CM`→2026-01-31, `CM+10D`→2026-02-10, `7D`→2026-02-07 | [SH]:747-751 |
| C13 | Payment discount possible | `r(AIV × Disc% / 100)` if `PmtDiscDate + grace ≥ PostingDate` | [GJPL]:2617-2650 |
| C14 | Item journal amount | `Amount = −(line Amount × factor − RemAmt)`, rounded, with the remainder carried forward | [SP]:1641-1666 |

Ordering rule: the invoice discount is applied **before** VAT. VAT is calculated per group on the discounted base. On the draft (release, `UpdateVATOnLines`) lines are distributed in `Line No.` order, so the last line in a group absorbs the rounding remainder. At posting, the iteration order is (`Type`, `Line No.`) when the Concurrent Inventory Posting feature is on, so the line that absorbs the remainder can change; only the per-line split moves, not the totals (verified-corrected; [SL]:7315-7400; [SP]:489-490).

---

## 6. Worked posting examples (MNT, precision 0.01, VAT 10 %, Nearest)

### E1: Credit sales invoice, prices excl. VAT, line discount + invoice discount amount 1 000.00, `Discount Posting = No Discounts`
Document Date = Posting Date = 2026-01-31. Payment Terms `1M(2%7D)`: Due 2026-02-28, Pmt. Disc. Date 2026-02-07, 2 %.

| Line | Item / account | Qty × price | Gross | Line disc. | Line Amount | Inv. disc. | Amount | VAT (distributed) | Naive per-line VAT |
|---|---|---|---|---|---|---|---|---|---|
| L1 | PEN (GOODS) | 7 × 1 234.55 | 8 641.85 | 3 % = 259.26 | 8 382.59 | 543.63 | 7 838.96 | 783.90 | 783.90 |
| L2 | PAPER (GOODS) | 3 × 2 345.65 | 7 036.95 | 0 | 7 036.95 | 456.37 | 6 580.58 | **658.05** | 658.06 |
| L3 | G/L 5120 service (no inv. disc.) | 1 × 10 000.05 | 10 000.05 | 0 | 10 000.05 | 0 | 10 000.05 | 1 000.01 | 1 000.01 |
| Σ | | | | | 25 419.59 | 1 000.00 | **24 419.59** | **2 441.96** | 2 441.97 ✗ |

- Invoice discount base = 15 419.54. L1 share = 1 000 × 8 382.59 / 15 419.54 = 543.6342 → 543.63, remainder +0.0042. L2 = 456.3658 + 0.0042 = 456.3700 → 456.37 (verified-corrected: the intermediates were 543.6292 / −0.0008 / 456.3708, which do not follow from the inputs; the final amounts were right).
- Document VAT = r(24 419.59 × 10 %) = 2 441.96. Rounding each line separately would give 2 441.97, which is why BC distributes. (Assumes the service account's VAT Prod. Posting Group shares the GOODS VAT Identifier; with separate identifiers the groups give r(1 441.954) = 1 441.95 and r(1 000.005) = 1 000.01, which is the same total and the same G/L.)
- The "VAT (distributed)" column is the `Line No.`-order split (draft lines after release, and posting with legacy order). With Concurrent Inventory Posting on, posting handles L3 (G/L Account) first and the **posted** lines get L3 1 000.01, L1 783.89, L2 658.06. The buffer row 5110 is still 1 441.95, so the G/L below is identical (verified-corrected).
- Payment discount possible = r(26 861.55 × 2 %) = 537.23.

Buffer (after negation): row 5110 (L1+L2 grouped) Amount −14 419.54, VAT −1 441.95; row 5120 Amount −10 000.05, VAT −1 000.01. Customer amount = −(−26 861.55).

| Account | Debit | Credit |
|---|---|---|
| 1200 Receivables (CLE +26 861.55, due 2026-02-28) | 26 861.55 | |
| 5110 Sales of goods | | 14 419.54 |
| 2300 VAT payable (row 5110) | | 1 441.95 |
| 5120 Service revenue | | 10 000.05 |
| 2300 VAT payable (row 5120) | | 1 000.01 |
| **Total** | **26 861.55** | **26 861.55** |

Cost (average cost PEN 800, PAPER 1 500; item ledger quantities −7 and −3; posted in the same run only with `Automatic Cost Posting` on, see R-39):

| Account | Debit | Credit |
|---|---|---|
| 6110 COGS | 10 100.00 | |
| 1300 Inventory | | 10 100.00 |

### E2: Cash sale, Prices Including VAT, Bal. Account = Bank (posting group → 1100)
L1 3 × 11 000 = 33 000.00; L2 7 × 1 999 = 13 993.00 (both incl. VAT, GOODS).
- `AIV_g` = 46 993.00; `VAT_g` = r(46 993 × 10/110) = r(4 272.0909) = 4 272.09; `Base_g` = 42 720.91.
- L1: VAT = r(4 272.09 × 33 000/46 993) = r(2 999.9994) = 3 000.00, Amount = 30 000.00, remainder −0.0006. L2: VAT = r(−0.0006 + 1 272.0906) = r(1 272.0900) = 1 272.09, Amount = 12 720.91 (verified-corrected: 4th-decimal intermediates were 2 999.9993 / −0.0007 / 1 272.0907; results unchanged).

Transaction 1 (invoice):

| Account | Debit | Credit |
|---|---|---|
| 1200 Receivables (CLE invoice +46 993.00) | 46 993.00 | |
| 5110 Sales of goods | | 42 720.91 |
| 2300 VAT payable | | 4 272.09 |
| **Total** | **46 993.00** | **46 993.00** |

Transaction 2 (balancing, Document Type Payment, same Document No., applied to the invoice):

| Account | Debit | Credit |
|---|---|---|
| 1100 Bank | 46 993.00 | |
| 1200 Receivables (CLE payment −46 993.00) | | 46 993.00 |
| **Total** | **46 993.00** | **46 993.00** |

Both customer entries are closed. Receivables net to 0.

### E3: Cancel the E1 invoice
The credit memo copies E1: same lines, same Inv. Discount Amounts, Posting Date 2026-01-31 (inherited), Applies-to = the E1 invoice. Line amounts are not negated (credit memo), so the result is the mirror image.

| Account | Debit | Credit |
|---|---|---|
| 5110 Sales of goods (Sales Cr. Memo account; same as 5110 in this setup) | 14 419.54 | |
| 2300 VAT payable | 1 441.95 | |
| 5120 Service revenue | 10 000.05 | |
| 2300 VAT payable | 1 000.01 | |
| 1200 Receivables (CLE −26 861.55, applied) | | 26 861.55 |
| **Total** | **26 861.55** | **26 861.55** |

Exact cost reversal (item ledger +7 and +3, applied from the original entries):

| Account | Debit | Credit |
|---|---|---|
| 1300 Inventory | 10 100.00 | |
| 6110 COGS | | 10 100.00 |

Result: the invoice and credit memo entries are both closed, the invoice shows `Cancelled = true`, and the credit memo shows `Corrective = true`.

### E4: Partial manual credit memo (customer returns 2 PEN), applied to the E1 invoice
This is an alternative to E3: the E1 invoice was **not** cancelled. After E3 the invoice entry is closed and could not be applied to (verified-corrected: clarified the scenario).
2 × 1 234.55 = 2 469.10; line discount 3 % = 74.07; Amount 2 395.03; VAT r(239.503) = 239.50; total 2 634.53. No invoice discount, because the credit memo is a new document.

| Account | Debit | Credit |
|---|---|---|
| 5110 Sales of goods | 2 395.03 | |
| 2300 VAT payable | 239.50 | |
| 1200 Receivables (CLE −2 634.53, applied) | | 2 634.53 |
| **Total** | **2 634.53** | **2 634.53** |

Invoice remaining = 26 861.55 − 2 634.53 = 24 227.02. **Pitfall:** the share of the invoice discount for these 2 pens (≈155.32 excl. VAT) is not reversed, so the customer is over-credited. Copying the posted line, as cancel does, avoids this. Cost: Dr 1300 1 600.00 / Cr 6110 1 600.00 when `Appl.-from Item Entry` is set.

### E5: Purchase invoice and credit memo (vendor doc nos. mandatory)
Invoice, Vendor Invoice No. `INV-7781`, G/L line 7010 Office supplies 120 000.00 + VAT 12 000.00 (lines not negated):

| Account | Debit | Credit |
|---|---|---|
| 7010 Office supplies | 120 000.00 | |
| 1500 VAT receivable | 12 000.00 | |
| 2100 Payables (VLE −132 000.00) | | 132 000.00 |
| **Total** | **132 000.00** | **132 000.00** |

A second purchase invoice from the same vendor with `INV-7781` fails with "Purchase Invoice INV-7781 already exists for this vendor".

Credit memo, Vendor Cr. Memo No. `CR-15`, 20 000.00 + VAT 2 000.00 (lines negated):

| Account | Debit | Credit |
|---|---|---|
| 2100 Payables (VLE +22 000.00) | 22 000.00 | |
| 7010 Office supplies | | 20 000.00 |
| 1500 VAT receivable | | 2 000.00 |
| **Total** | **22 000.00** | **22 000.00** |

### E6: USD invoice, rate 3 450.50 MNT/USD, two lines of 10.01 USD excl. VAT (LCY running total)
FCY: base 20.02, VAT r(2.002) = 2.00 (1.00 per line), AIV 22.02.

| Line | FCY Amount / AIV | Cumulative LCY Amount / AIV | LCY Amount | LCY AIV | LCY VAT |
|---|---|---|---|---|---|
| L1 | 10.01 / 11.01 | r(34 539.505) = 34 539.51 / r(37 990.005) = 37 990.01 | 34 539.51 | 37 990.01 | 3 450.50 |
| L2 | 10.01 / 11.01 | r(69 079.01) = 69 079.01 / r(75 980.01) = 75 980.01 | **34 539.50** | **37 990.00** | 3 450.50 |

| Account | Debit | Credit |
|---|---|---|
| 1200 Receivables (CLE 22.02 USD / 75 980.01 MNT) | 75 980.01 | |
| 5110 Sales of goods | | 69 079.01 |
| 2300 VAT payable | | 6 901.00 |
| **Total** | **75 980.01** | **75 980.01** |

---

## 7. Simplifications for the micro-business system

| BC feature | Proposal | Keep |
|---|---|---|
| 6 document types | v1: **Invoice, Credit Memo**; Quote as an optional non-posting draft. Order, Return Order and Blanket Order (partial ship/invoice) are left out. | MUST / SHOULD / SKIP |
| Sell-to vs Bill-to | One `customer_id`. Posting groups come from that customer. | SKIP the split |
| Status Open/Released/Pending | `draft` → (`released` optional lock) → `posted` (immutable) → `cancelled` flag via link. | MUST |
| Ship + Invoice in one document, shipments table | An invoice always ships the full quantity. No shipment documents. Item stock-out is posted from the invoice. | MUST (simplified) |
| Line types | `item`, `service` (G/L account or service product), `comment`. | MUST |
| Prices Including VAT | Header flag, defaulted from the customer (B2C = incl., B2B = excl.). Use the BC formulas C6/C7. | MUST |
| Invoice discount | Header `discount_amount` or `discount_pct`; split with C4. No Cust. Invoice Disc table, no service charge. Post as reduced revenue (`No Discounts`). | SHOULD |
| Payment discount, payment tolerance | Not in v1. Keep `due_date` only. | SKIP |
| Payment terms | `code`, `due_days` or a simple formula (`nD`, `nM`, `CM`), computed from `document_date`. | MUST |
| Bal. account on header | "Paid now" with method → cash/bank account. Post a second, applied payment transaction (E2). | SHOULD |
| Numbering | One series per posted type. The number is drawn **inside** the posting transaction with `SELECT … FOR UPDATE` on the counter row, so there are no early commits and no gap-filler documents. The draft has its own non-fiscal ID. | MUST |
| Commit points | One DB transaction for check + number + posted doc + ledgers + draft→posted. Side effects (eBarimt, e-mail) go in an outbox after commit. | MUST |
| Archive of drafts | Not needed. The posted documents and an audit log are enough. | SKIP |
| Cancel/Correct | Implement Cancel (full mirror credit memo, applied, linked, original amounts copied). Correct = Cancel + clone a draft. | MUST / SHOULD |
| Storno (`Correction`) | Post credit memos as normal opposite-side entries. | SKIP (open question) |
| Currency | Header currency + rate from the posting date. LCY running-total conversion (C9). Unrealized FX belongs elsewhere. | SHOULD |
| Dimensions | At most 2 tags (e.g. branch, project) on the header, copied to the lines and entries. | SKIP / SHOULD |
| Invoice rounding | Optional rounding of the cash total to whole MNT on a rounding account. | SHOULD |
| Preview | Run the posting in a transaction and roll it back, returning the would-be entries. | SHOULD |
| Events (`OnBefore…`/`OnAfter…`) | Replace with a few domain events (`InvoicePosted`, `CreditMemoPosted`) emitted after commit. | SKIP the hooks |
| Purchases | Same engine, mirrored signs. `vendor_doc_no` mandatory and unique per (vendor, doc type) among non-reversed entries. | MUST |

---

## 8. Pitfalls and edge cases the new implementation must not miss

1. **Signs.** Negate sales **invoice** lines and totals before G/L; negate purchase **credit memo** lines and totals. The customer and vendor entry is always `−Total AIV` after that step. Getting this backwards silently doubles revenue on credit memos.
2. **VAT per document, not per line.** Round once per VAT rate group (C5/C6) and spread the result with a running remainder (C7). Rounding per line drifts by ±0.01 per line (E1). Recalculate on release **and** at posting.
3. **Invoice discount before VAT, and only on lines that allow it.** G/L lines default to `Allow Invoice Disc. = false`. When the discount is given as an amount, it must be spread with a running remainder so that Σ = the entered amount.
4. **Nested rounding of the line discount:** `r(r(Q×P)×%)`, not `r(Q×P×%)`.
5. **PIV lines:** Amount is derived as `AIV − VAT`, never as `AIV / 1.1` per line. Switching PIV on a document with lines must convert or recalculate the prices.
6. **Due Date comes from the Document Date** and must be recalculated when the Document Date or terms change. Credit memos default to Due = Document Date.
7. **Posting number integrity.** Never consume a fiscal number unless the posted document is committed in the same transaction. BC needs gap-filler empty invoices ([PSD]:232-292) only because it commits early. Check uniqueness of (doc type, doc no.) in the receivables ledger.
8. **Atomicity.** A failure after the G/L rows but before the customer entry must roll back everything. BC relies on a single final commit plus `CommitBehavior::Ignore`.
9. **Negative invoice totals are not allowed.** Force the use of a credit memo. A document with no posting lines cannot be posted.
10. **Cancel only unpaid, uncancelled, non-corrective invoices in an open period.** The cancelling credit memo inherits the **invoice's** posting date and VAT date in BC. If the period is closed, cancellation is refused and a manual credit memo dated today is required.
11. **Partial credit memos priced by hand ignore the original invoice discount** (E4). Offer "credit from posted invoice lines", which copies the net amounts.
12. **Bal. Account and Applies-to exclude each other.** A cash sale posts a second transaction (Payment) applied to the invoice. The bank account currency must equal the document currency.
13. **FCY:** convert with running totals (C9), take the rate from the posting date, and re-confirm the rate when the posting date changes. BC's LCY conversion calls `Round()` without a precision, which resolves to the G/L Setup `Amount Rounding Precision`. Whatever LCY precision is configured (0.01 or whole tögrög) is applied automatically; the new system must use the configured LCY precision too, not a hard-coded 0.01 (verified-corrected).
14. **Blocked customer semantics:** check both the customer on the document and, if different, the billing customer. Only `Blocked = All` (or Privacy Blocked) stops a credit memo. Items: `Blocked` items can never be used, not even on credit memos. Only **`Sales Blocked`** items may still appear on credit documents, with a notification instead of an error (verified-corrected: the note said blocked items may be returned; [SL]:4808-4815).
15. **Posting groups snapshot.** The line stores Gen./VAT posting groups at entry time. A later change on the customer or item must not change posted or in-progress lines silently. BC recreates lines on header changes after a confirmation.
16. **A released document can still be posted after reopen and edit.** Totals must be recalculated at posting regardless of status.
17. **Purchases:** the duplicate vendor document number check must ignore **reversed** entries. Purchase credit memos need their own vendor credit memo number.
18. **Zero-quantity lines** must have zero amounts. Comment lines (Type blank) are copied to posted documents but never posted.

---

## 9. Open questions

1. Does Mongolian law or eBarimt require **gapless sequential** invoice numbers in the ERP, or is the eBarimt receipt ID (DDTD) the fiscal number? This decides whether a counter row lock is required.
2. Cancellation date: should the cancelling credit memo use the **original** invoice date (BC behaviour, which affects the VAT period of the original) or **today**? How does eBarimt handle a return or cancellation of a receipt from a previous VAT period? (See `mn-tax.md`.)
3. Is **storno** presentation (negative debits) required for Mongolian financial statements or audit trails, or are opposite-side entries acceptable?
4. MNT precision: should amounts be kept to 0.01 (eBarimt uses 2 decimals) with optional cash rounding to whole tögrög, or as integers?
5. Are **orders with partial delivery** needed by the target micro businesses (e.g. wholesale), or are invoice and credit memo enough for v1?
6. Is a separate **Bill-to** customer needed (e.g. a parent company paying for its branches)?
7. VAT date: always the posting date, or the document date for purchase invoices received late? (BC supports both via G/L Setup.)
8. Should the invoice discount be posted to a separate "sales discounts" account for management reporting (BC `Discount Posting = Invoice/All`), or netted against revenue?
9. To verify by test in BC: (a) the cancelling credit memo inherits the invoice Posting Date via TransferFields ([CDM]:787); (b) posting an Open document leaves the DB status Open after a failure that happens after commit #3.

---

## Verification log

Adversarial re-check against the AL source. Every worked example was recomputed with exact decimal arithmetic (ROUND_HALF_UP at 0.01). In all six examples debits equal credits: E1 26 861.55 (cost 10 100.00), E2 46 993.00 twice, E3 26 861.55 (cost 10 100.00), E4 2 634.53, E5 132 000.00 and 22 000.00, E6 75 980.01. Paths are relative to `src/Layers/W1/BaseApp/` unless a tag is used.

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| R-01 header key (Document Type, No.), rename blocked, number loop until unused | confirmed | [SH]:3653, 3778-3787, 3974-3986 |
| R-02 InitRecord date defaults (Document Date) | corrected | [SH]:4014-4021, 9753-9768; [SRS]:993-998 |
| R-03 Sell-to: blocked check, Gen. Bus. PG required, lines recreated | confirmed | [SH]:193-195, 224-227 |
| R-04 Bill-to copies Customer PG/currency/PIV/terms/method; Gen./VAT Bus. PG from Bill-to | confirmed | [SH]:7966-7987; [ACV]:187-197; [GLS]:901 |
| R-06 currency factor from Posting Date (WorkDate if blank), 0 for LCY | confirmed | [SH]:4755-4770 |
| R-07 posting date locked when Posting No. from a date-ordered series | confirmed | [SH]:654-666, 4334-4345 |
| R-08 Bal. Account checks; bank currency = document currency; excludes Applies-to | confirmed | [SH]:1254-1255, 1281-1296, 2061-2070 |
| R-09 draft series = posted series ⇒ posted doc keeps draft No. | confirmed | [SP]:2811-2816, 7223-7237 |
| R-10 G/L lines `Allow Invoice Disc.` = false, Direct Posting; item Blocked / Sales Blocked | confirmed | [SL]:4769-4785, 4809-4815 |
| R-11 setup check at `No.` validation "fails early" | refuted (rewritten: notification only) | [SL]:336-343; `Finance/ReceivablesPayables/PostingSetupManagement.Codeunit.al`:103-122, 422-438 |
| R-12 / C2 nested rounding of line discount, reverse % to 5 dp in 0..100 | confirmed | [SL]:9569-9572, 10268-10280 |
| R-13 / C3 Line Amount = r(Qty × Price) − LDA | confirmed | [SL]:5881 |
| R-14 cumulative line VAT (excl. and incl. VAT) | confirmed; sign-split VAT group added | [SL]:5986-6040; [VAL]:323; [SL]:7637 |
| R-15 / C4 invoice discount split per VAT group then per line, running remainder | confirmed | [VAL]:637-662; [SL]:7333-7350; [SCDT]:100 |
| R-16 line-discount change reduces Amount-type header discount | confirmed | [SL]:9573-9608 |
| R-17 PIV switch; VAT Prod. PG change rescales Unit Price | confirmed | [SL]:1835-1840; [SH]:999-1081 |
| R-18 Qty = 0 ⇒ Amount = 0; else Type, No., posting groups | confirmed | [SP]:2653-2660 |
| R-19..21 release checks, Calc. Inv. Discount, VAT recalc, Reopen | confirmed | [REL]:65-66, 104-145, 159-176, 223-243 |
| R-22 mandatory header fields, allowed posting date, VAT date fill | confirmed | [SP]:8670-8674, 852-856, 8903-8910 |
| R-23 Invoice ⇒ Ship+Invoice; Qty. to Ship = Qty. to Invoice = Quantity | confirmed | [SP]:8703-8718, 2502-2509 |
| R-24 negative invoice rejected (both total Line Amount and total AIV < 0; Invoice/Order only) | confirmed | [SP]:942-958 |
| R-25 Due Date required for non-credit invoices | confirmed | [SP]:893-895 |
| R-26 customer Blocked semantics | corrected (Blanket Order; credit docs not blocked by Ship/Invoice) | [CUST]:2759-2778; [SP]:6238-6286 |
| R-28 sales Ext. Doc. No. mandatory only by setup (default false) | confirmed | [GJPL]:7292-7313; [SRS]:106-110 |
| R-29 posting no. drawn early, written, committed; collision check | confirmed | [SP]:2811-2829, 777-782 |
| R-30 date-ordered series suppresses early commit; forced commit errors | confirmed | [SP]:769-776, 371-372 |
| R-31 / F3 4.3 commit points | corrected (commit #1 and #2 are conditional) | [SP]:694-716, 777-782; [REL]:104-119 |
| R-32 deleting a numbered draft creates an empty posted doc | confirmed | [PSD]:261-284; [SH]:4352-4421 |
| R-33 line pipeline and `ReverseAmount` for non-credit docs | confirmed; posting line order added | [SP]:1029-1051, 489-490 |
| R-35 G/L account: line No. for G/L/FA; Sales or Sales Cr. Memo account | confirmed | [SPI]:295-311 |
| R-36 / C10 customer entry on Bill-to, Amount = −Total AIV, Allow Application | confirmed | [SPI]:617, 645; [GJL]:7390, 7397-7401 |
| R-37 balancing entry Payment/Refund, applies to invoice, AIV + rem. pmt. disc. | confirmed | [SPI]:700-705, 725, 745-748 |
| Balancing entry is a separate G/L transaction (E2 "Transaction 2") | confirmed | [GJPL]:1995-1997 |
| R-38 (Document Type, No.) unique in customer ledger (non-payment types) | confirmed | [GJPL]:1322-1330; [GJCL]:801-818 |
| R-39 / C14 item journal amount and sign | confirmed; Automatic Cost Posting dependency added | [SP]:1653; `Inventory/Posting/ItemJnlPostLine.Codeunit.al`:246, 683 |
| R-40 / C11 invoice rounding formula and account | confirmed; VAT-on-rounding-line note added | [SP]:3598-3632 |
| R-41 finalize deletes Invoice/Cr. Memo/fully invoiced Order | confirmed | [SP]:3204-3282 |
| R-43 cancel preconditions (open period, once, not corrective, unpaid, etc.) | confirmed | [CORR]:349-370, 550-562, 585-591 |
| R-44 cancelling CM copies posted invoice incl. Posting Date; applies to invoice | confirmed | [CDM]:775-792, 711-712, 7225-7255, 8382-8386 |
| Cancelled / Corrective FlowFields (E3) | confirmed | [SIH]:1140-1158; `Sales/History/SalesCrMemoHeader.Table.al`:1027-1043 |
| R-46 credit memo `Correction` from G/L Setup | confirmed | [CDM]:7333; [SH]:4038-4041 |
| R-47 / C12 Due Date and Pmt. Disc. Date from Document Date; credit-doc rule | confirmed | [SH]:735-751, 754-760 |
| R-48 / C13 Original Pmt. Disc. Possible with grace period | confirmed | [GJPL]:2627-2644 |
| C5 / C6 / C7 group VAT and line distribution formulas | confirmed | [VAL]:700-759, 840-890; [SL]:7358-7400; [SP]:3394-3445 |
| C8 partial-invoice line amount | corrected | [SL]:8442-8474; [SP]:3468-3485 |
| C9 + pitfall 13: `Round()` default precision "0.01" | corrected (= G/L Setup Amount Rounding Precision) | `Finance/Currency/AmountAutoFormat.Codeunit.al`:55-60; MS Learn System.Round |
| Ordering rule "lines distributed in Line No. order" | corrected (posting uses Type, Line No. under concurrent posting) | [SP]:489-490 |
| R-49 purchase Ext. Doc. No. Mandatory InitValue true; Vendor Invoice / Cr. Memo No. | confirmed | [PPS]:64-69; [PP]:911-914, 998-1013 |
| R-50 vendor duplicate check | corrected (also runs when not mandatory if a number is given; Pay-to vendor) | [PP]:1266-1268, 7597-7605; [VM]:159-166; [GJPL]:7329-7340 |
| R-51 purchase signs (credit docs negated; vendor = −Total AIV) | confirmed | [PP]:307-310, 1097-1100; [PPI]:736 |
| R-52 Vendor PG from Pay-to; Gen./VAT Bus. PG; due date from Document Date | confirmed | [PH]:130-131, 272-280, 649 |
| F6 step 3 "commit unless date-ordered" | refuted (reversed: commit only if date-ordered) | [CORR]:56-62 |
| E1 invoice-discount intermediates (543.6292, −0.0008, 456.3708) | corrected (543.6342, +0.0042, 456.3658); final amounts, VAT 2 441.96, G/L confirmed | recomputed; [VAL]:637-662 |
| E1 posted per-line VAT split | corrected (depends on line order; totals unchanged) | [SP]:489-490, 3430-3445 |
| E2 PIV intermediates | corrected (2 999.9994 / −0.0006 / 1 272.0906); G/L confirmed | recomputed; [SP]:3394-3412 |
| E3 mirror credit memo | confirmed | [SPI]:303-308; [CDM]:775-792 |
| E4 partial credit memo arithmetic (74.07, 239.50, 2 634.53, 24 227.02, ≈155.32) | confirmed; scenario clarified as alternative to E3 (corrected) | recomputed |
| E5 purchase invoice/CM and duplicate message text | confirmed | [GJPL]:183; [PP]:342, 7597-7605 |
| E6 FCY running-total conversion incl. .xx5 ties | confirmed (stored factor 1/3450.5 rounds down, so ties resolve up) | `Finance/Currency/CurrencyExchangeRate.Table.al`:215-219; [SP]:3499-3555 |
| Pitfall 14 "blocked items may still be returned" | refuted (only Sales Blocked items) | [SL]:4809-4815 |

**Counts:** 60 claims checked: 46 confirmed, 11 corrected, 3 refuted. Four rules were added (marked "added-in-verification"): the sign-split VAT groups (R-14), the posting line order (R-33), the Automatic Cost Posting dependency (R-39), and VAT on the invoice rounding line (R-40).
