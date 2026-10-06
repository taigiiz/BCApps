# BC research: account determination (posting groups and the Invoice Posting Buffer)

- **Scope:** how Business Central (W1 Base App, v29) decides which G/L accounts a posted sales or purchase document hits. It covers the posting-group setup tables, the Invoice Posting Buffer (aggregation), the hand-off to `Gen. Jnl.-Post Line`, the customer and vendor ledger entry, the inventory (COGS) leg, and missing-setup validation.
- **Out of scope** (other notes): VAT calculation details, FX revaluation, payment application, inventory costing and adjustment, deferrals and prepayments.
- **Paths:** all are repo-relative to `/home/user/BCApps`. The line numbers are from the current checkout.
- **Sign convention (BC and the proposed system):** `Amount > 0` means debit and `Amount < 0` means credit, in LCY (MNT).
- **Account numbers in the examples are placeholders.** The real numbers will come from the Mongolian chart-of-accounts seed.

---

## 1. Summary

- Account determination happens **per document line**. The account comes from the line *type*:
  - G/L Account and Fixed Asset lines post to the number on the line.
  - Item, Resource and Item Charge lines look up the 2-D matrix **General Posting Setup** (key: Gen. Bus. Posting Group × Gen. Prod. Posting Group). It supplies the sales or purchase account, the line and invoice discount accounts, the credit memo accounts, and COGS.
- The **business** group is copied from the customer or vendor through the document header (by default from the **Bill-to/Pay-to** party, see R-05). The **product** group is copied from the item, G/L account, resource or charge. Both are snapshotted on the line when it is entered. (verified-corrected)
- **VAT accounts** come from a second 2-D matrix, **VAT Posting Setup** (VAT Bus. × VAT Prod.).
- The **receivables and payables accounts** come from the 1-D **Customer Posting Group** and **Vendor Posting Group**. The group code travels header → Gen. Journal Line → posting engine. The engine resolves the account at posting time.
- Bank accounts resolve through **Bank Account Posting Group**.
- Lines are first turned into **Invoice Posting Buffer** rows (temporary table 55). A row is created per (type, G/L account, gen. groups, VAT groups, dimension set, …). Rows with an identical key are **summed**, which gives one G/L entry and one VAT entry per distinct combination, not per line.
- When **separate discount posting** is enabled, each line is split into:
  - a discount row (discount account, with its own VAT share), and
  - a *gross* revenue or expense row.

  Both rows are computed by subtraction, so they always add back to the line's net amount and VAT.
- Each buffer row becomes one **Gen. Journal Line** with `VAT Posting = Manual VAT Entry`. That gives one G/L entry for the net amount and one VAT Entry, all posted by codeunit 12. A VAT G/L entry (to the Sales/Purchase VAT Account) is added **only when the row's VAT amount is non-zero**; a zero-rated or exempt row gets a VAT Entry with Amount 0 and no VAT G/L entry (src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:960-964). (verified-corrected)
- After all rows are posted, **one customer or vendor ledger entry** is posted for the document total including VAT. Its G/L entry goes to the receivables or payables account. The whole set shares one transaction, and the engine enforces that it nets to zero.
- **Item lines** post revenue or expense through the buffer only. Inventory, COGS and "direct cost applied" are posted separately from **value entries** by codeunit 5802, using Inventory Posting Setup and General Posting Setup.
- **Missing setup:**
  - Every `Get…Account()` getter raises a contextual error ("X is missing in Y").
  - Line entry sends non-blocking notifications and auto-creates *blocked* placeholder setup rows.
  - A missing or blocked General Posting Setup row stops posting.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| General Posting Setup | Table 252 | Matrix of G/L accounts per business × product group | PK `Gen. Bus. Posting Group` Code[20] (blank allowed), `Gen. Prod. Posting Group` Code[20] (NotBlank). Fields: `Sales Account`, `Sales Line Disc. Account`, `Sales Inv. Disc. Account`, `Sales Credit Memo Account`, `Purch. Account`, `Purch. Line Disc. Account`, `Purch. Inv. Disc. Account`, `Purch. Credit Memo Account`, `COGS Account`, `Inventory Adjmt. Account`, `Direct Cost Applied Account` (all Code[20] → G/L Account), `Blocked` Boolean | MUST (simplified) |
| Gen. Business Posting Group | Table 250 | Classifies the trading partner (for example domestic or export) | `Code` Code[20], `Def. VAT Bus. Posting Group` Code[20], `Auto Insert Default` Boolean | SHOULD (seed one value) |
| Gen. Product Posting Group | Table 251 | Classifies what is sold or bought (goods, services) | `Code` Code[20], `Def. VAT Prod. Posting Group` Code[20], `Auto Insert Default` Boolean | MUST |
| Customer Posting Group | Table 92 | Receivables control account and customer-side technical accounts | `Code` Code[20], `Receivables Account`, `Invoice Rounding Account`, `Payment Disc. Debit/Credit Acc.`, `Debit/Credit Rounding Account`, … (Code[20]) | MUST (Receivables, Invoice Rounding); SKIP the rest for MVP |
| Vendor Posting Group | Table 93 | Payables control account | `Code` Code[20], `Payables Account`, `Invoice Rounding Account`, … | MUST (Payables) |
| Bank Account Posting Group | Table 277 | G/L account for a bank account | `Code` Code[20], `G/L Account No.` Code[20] | SHOULD (or put the G/L account directly on the bank account) |
| VAT Posting Setup | Table 325 | VAT rate, calculation type and VAT accounts | PK `VAT Bus. Posting Group`, `VAT Prod. Posting Group`; `VAT Calculation Type` Enum, `VAT %` Decimal, `Sales VAT Account`, `Purchase VAT Account` Code[20], `Blocked` Boolean | MUST (accounts part) |
| Inventory Posting Setup | Table 5813 | Inventory balance-sheet account per location × inventory group | PK `Location Code` Code[10], `Invt. Posting Group Code` Code[20]; `Inventory Account` Code[20] | MUST (collapse to 1-D) |
| Invoice Posting Buffer | Table 55 (TableType = Temporary) | Aggregates document lines into postable G/L rows | `Group ID` Text[1000] (PK), `Type` Enum 49, `G/L Account` Code[20], gen. and VAT groups Code[20], `Amount`, `VAT Amount`, `VAT Base Amount`, `VAT Difference` Decimal, `Amount (ACY)` / `VAT Amount (ACY)` Decimal (document-currency mirror), `VAT %` Decimal, `Dimension Set ID` Integer, `System-Created Entry` Boolean, `Entry Description` Text[100], `Deferral Code`, `Job No.`, FA fields | MUST (in-memory, reduced key) |
| Invoice Posting Line Type | Enum 49 | Row type: 0 Prepmt. Exch. Rate Difference, 1 G/L Account, 2 Item, 3 Resource, 4 Fixed Asset (AssignmentCompatibility, so Charge (Item) = 5 passes through) | – | MUST (G/L, Item/Service) |
| Invoice Posting (interface), Sales Post Invoice, Purch. Post Invoice | Interface; Codeunits 815 and 816 | PrepareLine → PostLines → PostLedgerEntry → PostBalancingEntry | – | MUST (as a service) |
| Invoice Posting Parameters | Table 56 | Document type, number, external number and source code used for all journal lines | `Document Type`, `Document No.`, … | MUST |
| Gen. Jnl.-Post Line | Codeunit 12 | Single posting engine: G/L, VAT, customer, vendor and bank entries; balance check | – | MUST |
| Inventory Posting To G/L | Codeunit 5802 | Posts value entries to Inventory, COGS and Direct Cost Applied | – | MUST (simplified) |
| PostingSetupManagement | Codeunit 48 | Missing-account errors and notifications | – | MUST (validation), SKIP (notifications) |
| Alt. Customer / Vendor Posting Group; Posting Group Change | Tables 960 and 961; Codeunit 960 | Allowed substitutions of the customer or vendor posting group on a document | PK (old group, alt group) | SKIP |
| Sales & Receivables Setup and Purchases & Payables Setup (fields) | Table 311 / 312 | `Discount Posting` Option (No / Invoice / Line / All), `Invoice Rounding` Boolean, `Allow Multiple Posting Groups` Boolean | – | SHOULD (Discount Posting, Invoice Rounding) |

---

## 3. Business rules

| ID | Rule | Source | Keep | Notes |
|---|---|---|---|---|
| R-ACCOUNT-DETERMINATION-01 | **Sales account by line type.** G/L Account and Fixed Asset lines use the line's `No.`. Other types use `GenPostingSetup.Sales Account`, or `Sales Credit Memo Account` for credit documents. | src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:295-311 | MUST | Simplify: credit memo account optional, falling back to the sales account. |
| R-ACCOUNT-DETERMINATION-02 | **Purchase account by line type** (mirror of 01): `Purch. Account` / `Purch. Credit Memo Account`. | src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:402-413 | MUST | |
| R-ACCOUNT-DETERMINATION-03 | **Matrix lookup is mandatory.** `GenPostingSetup.Get(line.GenBus, line.GenProd)` (a missing row is a hard error) and `TestField(Blocked,false)` run before any amount is computed. | src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:163-164; src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:141-142 | MUST | Applies to *every* line type, including G/L lines. |
| R-ACCOUNT-DETERMINATION-04 | **Both gen. groups are required on a posted line.** The product group is NotBlank in the setup key. The business group may be blank in setup, but sales posting tests that both are filled (unless US sales tax is on). | src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GeneralPostingSetup.Table.al:46-52; src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:2663-2674 | MUST | |
| R-ACCOUNT-DETERMINATION-05 | **Group sourcing (snapshot on the line).** Gen. Bus and VAT Bus come from the header. The header first takes them from the Sell-to customer, but when the Bill-to customer is set and GL Setup `Bill-to/Sell-to VAT Calc.` = `Bill-to/Pay-to No.` (**the default**, enum value 0) they are overwritten from the **Bill-to** customer; only with `Sell-to/Buy-from No.` do the Sell-to values stay. Gen. Prod and VAT Prod come from the master record: Item, G/L Account, Resource, Item Charge, or the FA's acquisition-cost-on-disposal account. (verified-corrected) | src/Layers/W1/BaseApp/Sales/Document/SalesLine.Table.al:9797-9798, 4775-4776, 4829-4830, 4878-4879, 4907-4908, 6875-6882; src/Layers/W1/BaseApp/Sales/Document/SalesHeader.Table.al:7792-7796, 7980; src/Layers/W1/BaseApp/Finance/VAT/Registration/AltCustVATRegDocImpl.Codeunit.al:124-143; src/Layers/W1/BaseApp/Finance/VAT/Registration/AltCustVATRegFacade.Codeunit.al:187-197; src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GLSetupVATCalculation.Enum.al:19-23 | MUST | Posting uses the line snapshot, not the current master values. When Sell-to = Bill-to (the usual case) the source makes no difference. |
| R-ACCOUNT-DETERMINATION-06 | **Receivables account.** The header `Customer Posting Group` is copied from the **Bill-to** customer, then from the header to `GenJnlLine."Posting Group"`. At posting, PostCust requires the customer to have a group, gets the Customer Posting Group, and posts the detailed entries' G/L total to `GetReceivablesAccount()`. | src/Layers/W1/BaseApp/Sales/Document/SalesHeader.Table.al:7982; src/Layers/W1/BaseApp/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:7332-7333; src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1272-1281, 4188-4189, 8550-8565 | MUST | The posting group is stored on the Cust. Ledger Entry, and later applications use it. |
| R-ACCOUNT-DETERMINATION-07 | **Payables account**, the same pattern from the Vendor Posting Group. | src/Layers/W1/BaseApp/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:7218-7219; src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:8567-8571; src/Layers/W1/BaseApp/Purchases/Vendor/VendorPostingGroup.Table.al:372-378 | MUST | |
| R-ACCOUNT-DETERMINATION-08 | **VAT G/L account** comes from VAT Posting Setup: `Sales VAT Account` for Gen. Posting Type Sale and `Purchase VAT Account` for Purchase. One VAT G/L entry is posted **per buffer row whose VAT amount is non-zero**, after the VAT setup is checked (exists, not Blocked, calculation type matches). Zero-VAT rows get a VAT Entry but no VAT G/L entry; sales Reverse Charge rows get no VAT G/L entry; purchase Reverse Charge rows get two (purchase VAT and reverse-charge VAT accounts). (verified-corrected) | src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:517-523, 950-1022; src/Layers/W1/BaseApp/Finance/VAT/Setup/VATPostingSetup.Table.al:485-503 | MUST | |
| R-ACCOUNT-DETERMINATION-09 | **A missing account is an error with context.** Each getter calls `PostingSetupMgt.Log…FieldError`. That calls `ErrorMessageMgt.LogContextFieldError`, which raises `Error("%1 is missing in %2")` unless an error-collection handler is active. Collection happens only when posting is started through `SalesHeader.SendToPosting` (or batch posting), which activates an Error Message Handler; then line-loop errors are collected and `ErrorMessageMgt.Finish` stops the transaction after the line loop. Without an active handler (e.g. a direct `Codeunit.Run` of Sales-Post) the first missing account raises an immediate error. Either way a missing account blocks posting. (verified-corrected) | src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GeneralPostingSetup.Table.al:881-894; src/Layers/W1/BaseApp/Finance/ReceivablesPayables/PostingSetupManagement.Codeunit.al:41, 459-466, 552-562; src/Layers/W1/BaseApp/Modules/System/ErrorMessage/ErrorMessageManagement.Codeunit.al:43-51, 270-273, 287-292; src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:470, 518; src/Layers/W1/BaseApp/Sales/Document/SalesHeader.Table.al:6688-6690 | MUST | The proposed system validates the whole document first and writes nothing on failure. |
| R-ACCOUNT-DETERMINATION-10 | **Early warning on line entry.** Validating `No.` checks the Sales, COGS and VAT sales accounts, and the Inventory account for items. If a setup row is missing, it **inserts it with Blocked = true** and notifies the user. Both the check and the auto-insert run only when the "G/L Account is missing in posting group or setup" My Notification is enabled (`IsPostingSetupNotificationEnabled`); with it disabled nothing is checked or inserted at line entry. (verified-corrected) | src/Layers/W1/BaseApp/Sales/Document/SalesLine.Table.al:338-343, 4837-4838; src/Layers/W1/BaseApp/Finance/ReceivablesPayables/PostingSetupManagement.Codeunit.al:103-122, 306-329 | SHOULD (warn); SKIP auto-insert | The auto-created blocked row then fails R-03 at posting. |
| R-ACCOUNT-DETERMINATION-11 | **Sign normalisation before buffering.** For non-credit sales documents, every line amount field is negated (`ReverseAmount`), so revenue becomes negative (credit). For purchases only credit documents are negated, so expense is positive (debit). Document totals are negated the same way. | src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:1048-1051, 3569-3585, 523-527; src/Layers/W1/BaseApp/Purchases/Posting/PurchPost.Codeunit.al:1098-1100, 307-309 | MUST | Everything downstream is sign-agnostic. |
| R-ACCOUNT-DETERMINATION-12 | **Base totals per line:** `TotalVAT = AmountInclVAT − Amount`, `TotalAmount = Amount`, `TotalVATBase = VAT Base Amount`, all in LCY. | src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:351-361 | MUST | |
| R-ACCOUNT-DETERMINATION-13 | **Separate discount posting.** If `Discount Posting` ∈ {Invoice, All} or {Line, All}, a discount row is built from `−Inv./Line Discount Amount` (positive for sales invoices, negative for purchase invoices; the signs flip for credit memos because only the other direction is reversed) (verified-corrected). It goes to the setup's discount account and is subtracted from the running totals (`SetAccount`, `UpdateVATBase`). The main row then carries the **gross** amount and VAT. | src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:178-227; src/Layers/W1/BaseApp/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:563-571, 758-762; src/Layers/W1/BaseApp/Sales/Setup/SalesReceivablesSetup.Table.al:53-66 | SHOULD | Net revenue is unchanged; it only reclassifies. |
| R-ACCOUNT-DETERMINATION-14 | **VAT on a discount row** is computed independently: `Round(D×r)` (prices excl. VAT) or `Round(D/(1+r)×r)` (prices incl. VAT), using LCY precision and the VAT rounding direction. Reverse-charge lines get no VAT (`CalcDiscountNoVAT`). | src/Layers/W1/BaseApp/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:503-553, 596-610; src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:322-327 | SHOULD | The rounding residue lands on the gross row (see §5). |
| R-ACCOUNT-DETERMINATION-15 | **Purchase discount accounts are hard-required** (TestField) when the discount amount is non-zero. On sales a missing discount account goes through the getter's logged error (R-09); that is still blocking (immediate error, or collected and raised after the line loop), only the error shape differs. (verified-corrected) | src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:168-169, 211-212 | MUST (uniform hard check) | |
| R-ACCOUNT-DETERMINATION-16 | **100 % line discount.** The zeroing in `PrepareInvoicePostingBuffer` acts on a record that was just `Clear`ed and is then overwritten by `CalcDiscount`/`SetAmounts`, so by itself it changes nothing. The effective rule is in `DivideAmount`: a line with `Line Discount %` = 100 gets `Amount` = 0 and `Amount Including VAT` = 0, so its totals (and VAT) are zero. With separate line-discount posting such a line still yields a discount row (+D, +dV) and a gross row (−D, −dV) whose VAT nets to 0. (verified-corrected) | src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:372, 402-408; src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:3417-3420, 3432-3435, 3446-3449 | MUST | |
| R-ACCOUNT-DETERMINATION-17 | **Grouping key (`Group ID`)**, left-padded concatenation of: Journal Templ. Name, Type, G/L Account, Gen. Bus, Gen. Prod, VAT Bus, VAT Prod, Tax Area, Tax Group, Tax Liable, Use Tax, Dimension Set ID, Job No., Fixed Asset Line No., Spend Request No., Deferral Code, Additional Grouping Identifier. | src/Layers/W1/BaseApp/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:717-756 | MUST (reduced) | `VAT %` is *not* in the key; it is implied by the VAT groups. |
| R-ACCOUNT-DETERMINATION-18 | **Merge semantics.** On a key hit, Amount, VAT Amount, VAT Base, VAT Difference, Quantity and VAT Base Before Pmt. Disc. are summed, and `System-Created Entry` becomes false if any contributor is false. On a miss the row is inserted. FA rows get a running `Fixed Asset Line No.`, so they never merge. | src/Layers/W1/BaseApp/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:679-715; src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:424-441 | MUST | |
| R-ACCOUNT-DETERMINATION-19 | **"Copy Line Descr. to G/L Entry"** stores the document line no. in `Fixed Asset Line No.` for G/L-type rows. That makes each line a separate row so it keeps its own description; otherwise the header Posting Description is used. | src/Layers/W1/BaseApp/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:764-778 | SHOULD | |
| R-ACCOUNT-DETERMINATION-20 | **LCY-only rounding residue.** When a merged row ends with LCY ≠ 0 but document-currency amount = 0, the LCY amount is moved to a rounding accumulator. It is added to the next posted row that has a non-zero value. | src/Layers/W1/BaseApp/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:699-700, 780-812 | SKIP (MNT only); MUST with FX | Prevents G/L lines that exist only because of rounding. |
| R-ACCOUNT-DETERMINATION-21 | **Buffer row → journal line.** `Account No. = G/L Account`, `Gen. Posting Type = Sale/Purchase`, `VAT Posting = Manual VAT Entry` (the engine takes VAT amounts as given), `System-Created Entry = true`. Amounts are copied 1:1. The FA type becomes Account Type Fixed Asset, with FA Posting Type Disposal (sales) or Acquisition Cost / Maintenance / Appreciation (purchases) (verified-corrected). | src/Layers/W1/BaseApp/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:832-883; src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:496-523; src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:570-606 | MUST | |
| R-ACCOUNT-DETERMINATION-22 | **Engine posting of a G/L row:** 1 G/L entry for `Amount (LCY)` (net), then VAT Entry (`Base`, `Amount`), then a VAT G/L entry for `VAT Amount` if it is non-zero (R-08). System-created lines skip the engine's `Direct Posting` check; manual journal lines must target Direct Posting accounts, except on closing dates. Document G/L lines are checked separately (R-34). (verified-corrected) | src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1195-1248, 636-644, 772-928, 7465-7477 | MUST | Control accounts (AR, AP, VAT, Inventory) should be non-direct-posting. |
| R-ACCOUNT-DETERMINATION-23 | **Customer ledger entry from totals.** It is posted **after** all buffer rows. Account Type Customer, `Bill-to Customer No.`. `Amount = −Total."Amount Including VAT"` (document currency), `Amount (LCY) = −TotalLCY."Amount Including VAT"`, `Sales/Purch. (LCY) = −TotalLCY.Amount`, `Profit (LCY)`, `Inv. Discount (LCY)`. The totals were already sign-reversed, so the invoice result is a positive debit. | src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:1236-1260; src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:593-655 | MUST | Vendor: src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:683-747 |
| R-ACCOUNT-DETERMINATION-24 | **Transaction balance and rounding invariant.** Lines with the same document type, number and posting date share one transaction no. The engine accumulates `BalanceCheckAmount` per G/L entry and marks the G/L entry set inconsistent unless it nets to 0. Unrounded `Amount`/`Amount (LCY)` is rejected. | src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1990-1997, 2048-2054, 2383-2389, 449-461 | MUST | This is the core guarantee that buffer rows plus the ledger entry balance. |
| R-ACCOUNT-DETERMINATION-25 | **Immediate payment (`Bal. Account No.` on the header).** A second journal line (Document Type Payment, or Refund for credit memos; same Document No. as the invoice) to the same customer, `Applies-to` the new invoice, with `Amount = Total."Amount Including VAT"` (the already-reversed total, so negative = credit for an invoice) **plus `Remaining Pmt. Disc. Possible`** of the new entry, balanced against a G/L or bank account on the same line (verified-corrected). A bank account resolves via `Bank Account Posting Group."G/L Account No."`. | src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:662-751; src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1697-1703 | SHOULD | For cash sales. |
| R-ACCOUNT-DETERMINATION-26 | **Inventory leg of item lines** (separate from the buffer). Sale value entry: Inventory (Inventory Posting Setup) gets `CostToPost` (negative, credit) and COGS (General Posting Setup) gets `−CostToPost` (debit). Purchase value entry: Inventory is debited and `Direct Cost Applied Account` credited. Posted immediately only if `Automatic Cost Posting` is on. | src/Layers/W1/BaseApp/Inventory/Costing/InventoryPostingToGL.Codeunit.al:235-257, 302-324, 739-771, 838, 888, 908; src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:246 | MUST (simplified) | W1 demo uses Purch. Account ≠ Direct Cost Applied (Inventory Adjmt.): src/Apps/W1/ContosoCoffeeDemoDataset/app/DemoData/Finance/1.Setup data/CreatePostingGroups.Codeunit.al:73 |
| R-ACCOUNT-DETERMINATION-27 | **Sales item charges** add revenue only; cost is forced to 0. | src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:2704-2715 | SKIP | |
| R-ACCOUNT-DETERMINATION-28 | **Invoice rounding** (if enabled) appends a system G/L line to the Customer Posting Group's `Invoice Rounding Account`, which must have a Gen. Prod. group. `amount = −Round(Total − Round(Total, InvPrec, dir), AmtPrec)`. | src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:3587-3648; src/Layers/W1/BaseApp/Sales/Customer/CustomerPostingGroup.Table.al:589-600 | SHOULD | |
| R-ACCOUNT-DETERMINATION-29 | **Posting group change** on a document or journal is allowed only if the setup's `Allow Multiple Posting Groups` is on, the customer's `Allow Multiple Posting Groups` is on, and an `Alt. Customer Posting Group(old,new)` row exists. | src/Layers/W1/BaseApp/Sales/Document/SalesHeader.Table.al:9383-9403; src/Layers/W1/BaseApp/Finance/ReceivablesPayables/PostingGroupChange.Codeunit.al:100-127, 158-165; src/Layers/W1/BaseApp/Sales/Customer/Customer.Table.al:4265-4276; src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1273-1277 | SKIP | MVP: posting group fixed per customer. |
| R-ACCOUNT-DETERMINATION-30 | **Setup integrity.** A General Posting Setup row can't be deleted once G/L entries use it. A Customer or Vendor Posting Group can't be deleted while customers or ledger entries use it. The receivables or payables account must not be a source-currency-revaluation account. | src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GeneralPostingSetup.Table.al:653-656, 685-693; src/Layers/W1/BaseApp/Sales/Customer/CustomerPostingGroup.Table.al:457-494, 470-480; src/Layers/W1/BaseApp/Purchases/Vendor/VendorPostingGroup.Table.al:358-370 | MUST | |
| R-ACCOUNT-DETERMINATION-31 | **Journal shape rules.** A G/L line carrying gen. or VAT groups must have a Gen. Posting Type. Customer, vendor and bank lines must carry no gen. or VAT groups. | src/Layers/W1/BaseApp/Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:578-590, 619-623 | MUST | |
| R-ACCOUNT-DETERMINATION-32 | **Default VAT groups.** Gen. Bus and Gen. Prod groups carry `Def. VAT Bus/Prod Posting Group`. Changing the bus default re-points G/L accounts, customers and vendors that still hold the old default; changing the prod default (after a confirm) re-points G/L accounts, items, resources and item charges. (verified-corrected) | src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GenBusinessPostingGroup.Table.al:51-95; src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GenProductPostingGroup.Table.al:47-131 | SHOULD (defaulting only) | |
| R-ACCOUNT-DETERMINATION-33 | **Buffer rows are posted in descending `Group ID` order** (`Find('+')` … `Next(-1)`), not in document order. | src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:463-486 | Note | Never rely on entry order. |
| R-ACCOUNT-DETERMINATION-34 | **Document G/L-account lines must target Direct Posting accounts.** Although the buffer journal lines are system-created and skip the engine check (R-22), a non-system-created G/L line on a sales or purchase document is checked twice: when `No.` is validated (`TestDirectPosting` / `CopyFromGLAccount`) and again at posting (`CheckGLAccountDirectPosting`). System-created lines (invoice rounding) are exempt. The purchase `No.` lookup is also filtered to Direct Posting, Posting-type, unblocked accounts. (added-in-verification) | src/Layers/W1/BaseApp/Sales/Document/SalesLine.Table.al:4773, 4786-4797; src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:1288-1309; src/Layers/W1/BaseApp/Purchases/Document/PurchaseLine.Table.al:185, 4744-4745; src/Layers/W1/BaseApp/Purchases/Posting/PurchPost.Codeunit.al:1328-1329 | MUST | So control accounts (AR, AP, VAT, Inventory) set to non-direct-posting cannot be picked on a document line either. |

---

## 4. Flows

### F1: Sales invoice posting (G/L part), in execution order

1. `ProcessPostingLines`:
   - clears the buffer;
   - computes document VAT amount lines (`CalcVATAmountLines`);
   - loops over the lines, sorted by `Type, Line No.` unless legacy posting is used.

   Source: src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:463-508.
2. For each line, `PostSalesLine` (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:997-1082):
   1. `TestUpdatedSalesLine`, which requires both gen. groups.
   2. `DivideAmount` (quantity-to-invoice proportioning; VAT from the VAT amount lines with remainders).
   3. `RoundAmount`: adds to `TotalSalesLine` (document currency). For an FCY document it converts the line to LCY **cumulatively** and adds to `TotalSalesLineLCY`.
   4. `ReverseAmount` (non-credit documents).
   5. Item, resource or charge sub-ledger posting (item journal and value entries; see F5).
   6. If `Type ≠ " "` and `Qty. to Invoice ≠ 0`, call `InvoicePostingInterface.PrepareLine` (F2).
3. After the last line, optionally `InvoiceRounding` adds a rounding line, which is processed like any line (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:1216-1229).
4. Right after the line loop (non-legacy posting), the value entries whose G/L posting was postponed during the loop (an `OnBeforePostValueEntryToGL` subscriber collects them) are posted to the G/L: Inventory/COGS entries are therefore written **before** the revenue rows and the customer entry (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:485-486, 511-512, 12002-12013). (verified-corrected)
5. Reverse the document totals for non-credit documents (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:523-527).
6. `PostInvoice` (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:1236-1280):
   1. `PostLines`: one Gen. Journal Line per buffer row (F3).
   2. `PostLedgerEntry`: the customer entry (F4).
   3. `PostBalancingEntry` if `Bal. Account No.` is set.
7. Inventory cost adjustment (`MakeInventoryAdjustment`) runs after `PostInvoice` (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:539-542). (verified-corrected)

### F2: `PrepareLine` (one document line → 1..3 buffer rows)

Source: src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:127-284.

1. Get General Posting Setup (bus, prod) and assert it is not Blocked.
2. `PrepareInvoicePostingBuffer`: copy type, groups, VAT calc type, dimensions, `VAT %`, VAT difference, FA fields and description (the "zero VAT if the line discount is 100 %" step has no lasting effect, see R-16) (verified-corrected).
3. `InitTotalAmounts` (R-12).
4. If invoice-discount posting is on: `CalcDiscount(−InvDisc)`. If non-zero, `SetAccount(InvDiscAcc)` subtracts from the totals, and `UpdateInvoicePostingBuffer(row, ForceGLAccountType = true)`. The force flag only matters for **Fixed Asset** lines (their discount row is keyed and posted as type G/L Account with its own FA line no.); for Item, Resource and G/L lines the discount row keeps the line's own Type (src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:424-440). (verified-corrected)
5. The same for the line discount, using `Sales Line Disc. Account`.
6. Adjust the totals for deferrals (skip).
7. `SetAmounts(remaining totals)`.
8. `SetAccount(GetSalesAccount())` (R-01), then `Update(row)`, which merges or inserts (R-17, R-18).
9. Deferral, prepayment and exchange-rate adjustment rows (skip).

### F3: `PostLines`, then the engine for each row

1. Iterate rows in descending key order.
2. `ApplyRoundingForFinalPosting` (R-20).
3. `PrepareGenJnlLine`:
   - `InitNewLine` (header posting date, document date, VAT date, row description and dimensions);
   - document fields from Invoice Posting Parameters;
   - `CopyFromSalesHeader` (source currency code and factor; the `Currency Code` field stays blank, so `Amount` is LCY);
   - `CopyToGenJnlLine`;
   - `Gen. Posting Type = Sale`.
4. `GenJnlPostLine.RunWithCheck`, then `PostGLAcc` (src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1195-1248):
   1. `InitAmounts`: `Amount (LCY) := Amount`, `VAT Amount (LCY) := VAT Amount`; then the rounding checks.
   2. `InitGLEntry(account, Amount (LCY))`.
   3. Skip the direct-posting check (system-created).
   4. `InitVAT`: get the VAT setup, check it is not Blocked, check the calculation type matches, and copy `VAT Amount` (manual).
   5. `InsertGLEntry`: round check, then balance accumulation.
   6. `PostVAT`, then `InsertVAT`: VAT Entry with Base and Amount.
   7. `InsertVATForGLEntry`: a G/L entry to the Sales VAT Account for the VAT amount, only if that amount is non-zero (verified-corrected).
5. `TotalAmount := −Σ Amount` (sales) or `Σ Amount` (purchases); used only for reporting back.

### F4: Customer ledger entry

1. Build a Gen. Journal Line: `Account Type = Customer`, `Account No. = Bill-to`, `Posting Group = header Customer Posting Group`, currency and factor from the header, `System-Created = true`, and amounts from the totals (R-23).
2. In `PostCust` (src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1250-1369):
   1. Check the customer is not blocked and has a posting group.
   2. Check the multiple-groups rule.
   3. Get the posting group, then `ReceivablesAccount`.
   4. Initialise the Cust. Ledger Entry and calculate payment discount and tolerance.
   5. Check the document number is not already used.
   6. Apply (`Applies-to`).
   7. Insert the Cust. Ledger Entry.
   8. `PostDtldCustLedgEntries`, which creates the G/L entry/entries for the totals on the receivables account (src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:4133-4195).
3. The transaction now balances: Σ buffer rows (net + VAT) + receivables = 0.

### F5: Item cost leg

1. The item journal line creates an Item Ledger Entry and a Value Entry (`Cost Amount (Actual)`, negative for a sale).
2. If `Automatic Cost Posting` is on, `InventoryPostingToGL.BufferInvtPosting` runs, by entry type:
   - Sale + Direct Cost: (Inventory, COGS);
   - Purchase + Direct Cost: (Inventory, Direct Cost Applied).
3. `InitInvtPostBuf` writes `+Cost` to the primary account and `−Cost` to the balancing account (src/Layers/W1/BaseApp/Inventory/Costing/InventoryPostingToGL.Codeunit.al:739-771).
4. Account resolution (`SetAccNo`, src/Layers/W1/BaseApp/Inventory/Costing/InventoryPostingToGL.Codeunit.al:795-918):
   - Inventory from Inventory Posting Setup (location, inventory posting group);
   - COGS and Direct Cost Applied from General Posting Setup (value entry's gen. groups), which must not be Blocked.
5. Post to the G/L through the same engine.

### F6: Purchase invoice differences

- No sign reversal for invoices.
- The discount rows are negative (credit to the purchase discount accounts).
- Purchase discount accounts are TestField'd (R-15).
- `CalculateVATAmounts` recomputes VAT for reverse charge and use tax before posting (src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:534, 880-987).
- FA rows can split per FA card.
- Vendor entry: `Amount = −TotalPurchLine."Amount Including VAT"`, a credit.

### F7: Setup validation lifecycle

1. **Master or setup edit.** Account fields validate that the G/L account exists, is a posting account and is not blocked (`CheckGLAcc`). Receivables and payables accounts also get category assignment and the no-revaluation check.
2. **Line entry.** Notifications, plus auto-created blocked setup rows (R-10).
3. **Posting:**
   - the TestFields on the line;
   - `GenPostingSetup.Get` and the not-Blocked check;
   - each `Get…Account()` (collected errors);
   - VAT setup Get/Blocked in the engine;
   - the engine's rounding and balance checks.

---

## 5. Calculations & rounding

**Line level** (VAT note covers details). Prices excl. VAT, Normal VAT, per VAT Identifier (src/Layers/W1/BaseApp/Sales/Document/SalesLine.Table.al:5934-5940, 6043-6058):
- `Amount_i = Round(LineAmount_i − InvDisc_i)`
- `AIV_i = (ΣA_other + A_i) + Round((ΣA_other + A_i)·(1−VATBaseDisc%)·r, prec, dir) − ΣAIV_other + ΣVATDiff_other`, where "other" is **every other line** of the document with the same VAT Identifier, Tax Group, Tax Area and VAT Calculation Type (filter `Line No. <> current`), not only the lines before i. When lines are entered in order this equals the cumulative ΣA≤i form; when an earlier line is edited later, that line absorbs the residue. (verified-corrected)
- **At posting** the line VAT is re-derived by `DivideAmount`: the document-level VAT of each VAT Amount Line (`Round(ΣA·r)` per VAT identifier) is allocated to the lines in proportion to their line amounts, carrying a running remainder (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:3438-3452). (verified-corrected)

VAT is therefore rounded **per document and VAT group**, and each line absorbs the cumulative residue. Example with precision 1 MNT and r = 10 %, three lines of 333:
- line VATs are 33, 34 and 33 (= Round(33.3), Round(66.6) − 33, Round(99.9) − 67; the posting-time allocation of the total 100 gives the same: 33.33→33, 0.33+33.33→34, −0.33+33.33→33);
- the total is 100, whereas per-line rounding would give 99.

Prices incl. VAT: `Amount_i = Round((ΣLineAmt − ΣInvDisc)/(1+r)) − ΣA_other` (same "other lines" filter) (src/Layers/W1/BaseApp/Sales/Document/SalesLine.Table.al:6004-6018).

**Buffer** (all LCY, signed):
- Initial totals: `TV = AIV − A`, `TA = A`, `TB = VATBase`.
- Discount row (D = −signed discount amount; for a sales invoice D > 0):
  - excl. VAT: `dV = Round(D·r, precLCY, VATdir)`, `dB = dA = D`;
  - incl. VAT: `dV = Round(D/(1+r)·r)`, `dB = dA = D − dV`.
- Then `TV −= dV`, `TA −= dA`, `TB −= dB`.
- Main row: `(A_main, V_main, B_main) = (TA, TV, TB)`. So `V_main + dV = original line VAT` **exactly**, and the residue of the independently rounded `dV` falls into `V_main`.
- Example (precision 1): net 4 995 (gross 5 550, discount 555), line VAT 500.
  - `dV = Round(55.5) = 56`;
  - the main row has base −5 550 and VAT −556 (not −555);
  - the total is −500, which is correct.

**Rounding directions:** `'='` nearest, `'>'` up, `'<'` down, taken from GL Setup `VAT Rounding Type` and `Inv. Rounding Type (LCY)`. Default amount precision is 0.01 (src/Layers/W1/BaseApp/Finance/Currency/Currency.Table.al:886-902, 949-975).

**FCY → LCY:** `LCY_i = Round(FCY→LCY(ΣFCY≤i)) − ΣLCY<i` for every amount field (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:3507-3554). The LCY total is therefore the rounding of the FCY total, not a sum of rounded lines.

**Invoice rounding:** `R = −Round(T − Round(T, InvPrec, InvDir), AmtPrec)`, booked as a line with price `R/(1+r)` (excl. VAT) or `R` (incl. VAT) (src/Layers/W1/BaseApp/Sales/Posting/SalesPost.Codeunit.al:3599-3637).

**Engine guards:**
- `Amount` must equal `Round(Amount, currency precision)` and `Amount (LCY)` must equal `Round(Amount (LCY))`; otherwise FieldError "needs rounding" (src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:453-460).
- The same check runs on every G/L entry (src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:2383-2384).

---

## 6. Worked posting examples

**Setup used:**

| Setup | Values |
|---|---|
| Currency | MNT (LCY), precision 0.01, VAT 10 % (VAT Posting Setup DOM × VAT10, Normal VAT) |
| VAT accounts | Sales VAT Account **2300 VAT payable**; Purchase VAT Account **1500 VAT receivable** |
| Customer Posting Group DOM | Receivables **1200** |
| Vendor Posting Group DOM | Payables **2100** |
| Bank Account Posting Group BANK | **1100** |
| General Posting Setup DOM × GOODS | Sales **5110**, Sales Line Disc. **5190**, Purch. **7110**, COGS **6110**, Direct Cost Applied **7190** |
| General Posting Setup DOM × SERVICES and DOM × MISC | Must **exist and be unblocked** although no account in them is used: G/L account 5120 carries Gen. Prod. group SERVICES and 7010 carries MISC, and `PrepareLine` does `GenPostingSetup.Get` + `TestField(Blocked,false)` for G/L lines too (R-03). Without these rows E1 and E2 fail to post. (verified-corrected) |
| Inventory Posting Setup ('' × RESALE) | Inventory **1300** |

### E1: Sales invoice, two lines, line discount, `Discount Posting = Line Discounts` (or All)

- **L1**, Item COFFEE (GOODS): 10 × 50 000 = 500 000, line discount 10 % = 50 000, net 450 000, VAT 45 000.
- **L2**, G/L line 5120 *Service revenue*: 1 × 100 000, VAT 10 000.
- Document: net 550 000, VAT 55 000, total 605 000.

Buffer after reversal and PrepareLine:

| Row | Type | Account | Amount | VAT Amount | VAT Base |
|---|---|---|---|---|---|
| A | Item | 5190 (line disc.) | +50 000 | +5 000 | +50 000 |
| B | Item | 5110 (sales, gross) | −500 000 | −50 000 | −500 000 |
| C | G/L | 5120 (line's own account) | −100 000 | −10 000 | −100 000 |

Resulting G/L (one transaction):

| Account | Debit | Credit | From |
|---|---|---|---|
| 1200 Receivables | 605 000 | | Customer entry (`−(−605 000)`) |
| 5190 Sales discounts | 50 000 | | Row A |
| 2300 VAT payable | 5 000 | | Row A VAT |
| 5110 Sales of goods | | 500 000 | Row B |
| 2300 VAT payable | | 50 000 | Row B VAT |
| 5120 Service revenue | | 100 000 | Row C |
| 2300 VAT payable | | 10 000 | Row C VAT |
| **Total** | **660 000** | **660 000** | balanced |

- VAT entries: (−500 000 / −50 000), (+50 000 / +5 000), (−100 000 / −10 000). Net base −550 000, net VAT −55 000.
- Net revenue: 500 000 − 50 000 + 100 000 = 550 000.

**E1-variant, `Discount Posting = No Discounts`:**

| Account | Debit | Credit |
|---|---|---|
| 1200 | 605 000 | |
| 5110 | | 450 000 |
| 2300 | | 45 000 |
| 5120 | | 100 000 |
| 2300 | | 10 000 |
| **Total** | **605 000** | **605 000** |

**E1-COGS** (Automatic Cost Posting on, average cost 30 000 per unit, value entry cost −300 000):

| Account | Debit | Credit |
|---|---|---|
| 6110 COGS | 300 000 | |
| 1300 Inventory | | 300 000 |

**E1-cash** (header `Bal. Account Type = Bank`, `Bal. Account No. = BANK-1`): a second transaction, Document Type Payment, applied to the invoice.

| Account | Debit | Credit |
|---|---|---|
| 1100 Bank | 605 000 | |
| 1200 Receivables | | 605 000 |

The invoice's Cust. Ledger Entry is closed.

### E2: Purchase invoice with VAT, `Discount Posting = No Discounts`

- **L1**, G/L line 7010 *Office supplies*: 200 000, VAT 20 000.
- **L2**, Item COFFEE (GOODS): 20 × 15 000 = 300 000, VAT 30 000.
- Total 550 000. Purchase invoice lines are not reversed.

| Row | Type | Account | Amount | VAT Amount |
|---|---|---|---|---|
| P1 | G/L | 7010 | +200 000 | +20 000 |
| P2 | Item | 7110 (Purch. Account) | +300 000 | +30 000 |

| Account | Debit | Credit | From |
|---|---|---|---|
| 7010 Office supplies | 200 000 | | P1 |
| 1500 VAT receivable | 20 000 | | P1 VAT |
| 7110 Purchases | 300 000 | | P2 |
| 1500 VAT receivable | 30 000 | | P2 VAT |
| 2100 Payables | | 550 000 | Vendor entry (`−550 000`) |
| **Total** | **550 000** | **550 000** | balanced |

**E2-inventory** (value entry cost +300 000):

| Account | Debit | Credit |
|---|---|---|
| 1300 Inventory | 300 000 | |
| 7190 Direct Cost Applied | | 300 000 |

- If `Direct Cost Applied Account = Purch. Account` (7110), 7110 nets to 0 and the net effect is Dr Inventory 300 000.
- In the W1 demo they differ (Purchases versus Inventory Adjmt.), which gives a "purchases + change in inventory" P&L presentation.

---

## 7. Simplifications for the micro-business system

1. **Keep one posting engine.**
   - `post(journal_lines[]) → gl_entries + vat_entries + cust/vend_ledger_entries` in one DB transaction.
   - Hard asserts: Σ amount = 0 per (document no., posting date), and every amount is rounded to precision.
   - All documents (sales, purchase, cash, bank, manual journal) go through it.
2. **Account-determination tables (seeded, editable):**
   - `gen_product_group(code, name, default_vat_prod)` (MUST).
   - `gen_business_group(code, name, default_vat_bus)` (seed `DOM` only; keep the column so export or related-party splits are possible later).
   - `gen_posting_setup(bus_code, prod_code, sales_acc, sales_return_acc NULL, sales_disc_acc NULL, purch_acc, purch_return_acc NULL, purch_disc_acc NULL, cogs_acc NULL, inventory_acc NULL, blocked)`.
     - Resolution order: exact `(bus, prod)`, otherwise `('*', prod)`. This removes most matrix rows. The fallback is deterministic and shown in the UI.
     - Note: this `'*'` fallback is a new design, not BC behaviour. In BC a `('', prod)` row is **not** a fallback: `Get` is an exact-key lookup, and the blank-bus row is the exact match for transactions that have no business partner (item journal adjustments, revaluation, and the W1 demo seeds such rows for exactly that). A sales line with business group DOM never falls back to `('', prod)`. (added-in-verification)
     - *Return* accounts fall back to the sales or purchase account.
     - `inventory_acc` moves here from BC's Inventory Posting Setup, because micro businesses have one location.
   - `customer_posting_group(code, receivables_acc, rounding_acc)` and `vendor_posting_group(code, payables_acc, rounding_acc)`.
   - Bank: `bank_account.gl_account_id` directly (no group table).
   - `vat_posting_setup(vat_bus, vat_prod, rate, calc_type ∈ {NORMAL, ZERO, EXEMPT, NONE}, sales_vat_acc, purch_vat_acc, blocked)`.
3. **Snapshot** `gen_bus`, `gen_prod`, `vat_bus`, `vat_prod` and the resolved `posting_group` on each document line or header at entry. Re-resolve the *accounts* at posting, and store the account used on each G/L entry and the posting group on each customer or vendor ledger entry.
4. **Posting buffer:**
   - In-memory map with key `(line_kind ∈ {GL, ITEM, SERVICE}, gl_account, gen_bus, gen_prod, vat_bus, vat_prod, dimension_set_id)`.
   - Sums: `amount, vat_amount, vat_base, qty`.
   - Drop: journal template, tax area and use tax, job, FA line, spend request, deferral, ACY, and the additional grouping id.
   - Option `per_line_gl_description` adds `line_no` to the key (R-19).
5. **Discounts:** a company setting `discount_posting ∈ {NET, SEPARATE}` covering line discounts only (no separate invoice discount in MVP). With SEPARATE, implement exactly R-13/R-14 (gross row plus discount row by subtraction).
6. **Line types for MVP:** G/L account, Item (inventory), and Service (a non-stock item; posts like a resource without a resource ledger). SKIP: FA lines (use the FA module or a G/L line), item charges, resources, allocation accounts, prepayments, deferrals, jobs, reverse charge, sales tax, non-deductible VAT, IC, alternative posting groups.
7. **Inventory leg:**
   - Post COGS at sale time (Dr COGS / Cr Inventory at current average cost).
   - On purchase, debit `inventory_acc` **directly** from the buffer for ITEM lines, instead of BC's Purch. Account plus Direct Cost Applied pair. The net G/L is identical to BC configured with `Direct Cost Applied Account = Purch. Account` (E2-inventory, nets to Dr Inventory) with half the entries; it is **not** identical to the W1 demo configuration, where the two accounts differ. (verified-corrected)
   - Caveat: BC's purchase value entry (and so the inventory cost) is the line's **net** `Amount`, after line and invoice discounts (src/Layers/W1/BaseApp/Purchases/Posting/PurchPost.Codeunit.al:1667, 1679), while with separate discount posting the buffer row carries the **gross** amount and the discount goes to the Purch. Line/Inv. Disc. account. A direct Inventory debit from the buffer must therefore use the net amount for ITEM rows, i.e. never split discounts into a separate row for stock purchases. Otherwise inventory is overstated by the discount and the discount is booked to P&L. (added-in-verification)
   - Keep the BC pattern behind a flag only if periodic "purchases" presentation is required (open question).
8. **Validation service:** `resolve_accounts(document) → {account per row} | [missing(table, key, field)]`. It runs on save (warnings) and on post (blocking, collect all). No auto-insert of blocked setup rows.
9. **Credit memos:** no separate sign path. Negate once, by document direction (sales invoice = credit revenue). The same buffer and engine code serves all four document types.

---

## 8. Pitfalls / edge cases the new implementation must not miss

1. **Signs.**
   - Sales lines are negated for invoices, purchase lines for credit memos.
   - Discount rows have the *opposite* sign of the revenue or expense row.
   - The customer amount is `−(reversed total)`.
   - Write property tests: Σ rows + ledger = 0 for all four document types.
2. **Double-counting discounts.** With separate posting, the revenue row must be **gross** (net + discount), never net.
3. **VAT per row ≠ base × rate.** Only the per-document, per-VAT-group total is exact (§5 residue example). VAT returns and e-receipt reconciliation must use totals, not recompute per G/L row.
4. **Never round VAT per line independently.** Use the cumulative method so the invoice printout, VAT entries and G/L agree.
5. **VAT groups and dimensions are in the grouping key.** Merging rows with different VAT setups corrupts VAT entries. Dropping dimensions loses cost-centre analytics.
6. **Receivables account comes from the posting group on the document or ledger entry, not the current customer card.** If a customer's group changes, old open invoices still sit on the old receivables account. Payments must credit the account the invoice debited.
7. **Control accounts** (AR, AP, VAT, Inventory) must be non-direct-posting for manual journals. Otherwise the sub-ledger and G/L drift apart. System postings bypass the check (R-22), but G/L-account lines typed on a sales or purchase document are checked for Direct Posting at entry and at posting (R-34), so the same flag also keeps control accounts off document lines. (verified-corrected)
8. **A missing matrix row is not the same as a missing account in a row.** Both must produce a friendly, collected error before any write. BC's raw `Get` gives a generic "does not exist" error.
9. **Blank business group.**
   - BC allows `('', PROD)` setup rows but rejects blank groups on sales lines.
   - Decide one policy: the proposal is `'*'` fallback, with the line always holding a concrete group.
10. **Discount account requirement is data-dependent.** It is checked only when the discount is non-zero, so test setup validation with discounted lines.
11. **100 % discount lines** end with zero net amount and zero VAT (set in `DivideAmount`, R-16); with separate discount posting they still produce an offsetting discount/gross row pair (verified-corrected). **Zero-amount rows** may still reach the engine (a zero G/L entry is inserted unless the row has a deferral code, and zero-VAT rows still get a VAT Entry); decide whether to skip zero rows (recommended) and keep that decision consistent.
12. **Buffer posting order is not document order.** Nothing (reports, tests) may depend on G/L entry sequence within a document.
13. **The inventory leg is a separate process.** If cost posting is deferred, G/L inventory ≠ item sub-ledger until the batch runs. MVP: always post immediately in the same transaction.
14. **Invoice rounding line.** It posts with VAT, through the rounding account's product group, so that account needs gen. and VAT prod. groups.
15. **FCY (later).**
    - The LCY of each line must be computed cumulatively.
    - LCY-only residues must be folded into the next row (R-20).
    - The buffer "ACY" fields are really the *document currency* mirror; don't confuse them with an additional reporting currency.
16. **Copy-description mode** disables aggregation; expect many more G/L entries.
17. **Sales item charges** never touch COGS or Inventory. Purchase item charges do, through the value entry.

---

## 9. Open questions

1. Do Mongolian statutory statements require **gross sales with a separate discounts or returns contra-account**? This decides whether `discount_posting = SEPARATE` and `sales_return_acc` are the defaults.
2. **VAT categories to seed:**
   - standard 10 %, zero-rated exports, exempt, and the non-VAT-payer company mode;
   - whether city or excise-type taxes (НХАТ) need a second tax line with their own account.

   This is for the VAT/legal research note.
3. **Amount rounding precision for MNT:** 0.01 or 1? It interacts with e-receipt (ebarimt) amount formats and with the cumulative VAT method.
4. **Perpetual inventory with a direct Inventory debit** (proposed), or BC's Purchases plus Direct Cost Applied pair (periodic-style P&L)?
5. Should more than one **business group** (for example DOM / EXPORT / RELATED) be supported at launch, or only the `'*'` fallback plus product groups?
6. Should a customer's **posting group** be changeable once entries exist? The MVP proposal is no. Otherwise a transfer posting between receivables accounts is needed.
7. **Cash sales:** model them as invoice plus balancing payment (BC `Bal. Account`), or as a dedicated POS receipt document that posts Dr Cash / Cr Revenue / Cr VAT without an AR entry?
8. Should **G/L line descriptions** default to per-line (audit-friendly) or aggregated (fewer entries)?

---

## Verification log

Adversarial check against the AL source in this checkout (2026-10-06). All paths are relative to `src/Layers/W1/BaseApp/` unless they start with `src/`. Every worked example was recomputed: E1 (660 000 = 660 000), the E1 variant (605 000 = 605 000), E1-COGS, E1-cash, E2 (550 000 = 550 000), E2-inventory, the discount residue example (−556 + 56 = −500) and the 3 × 333 VAT example (33 + 34 + 33 = 100). All balance, and the account choices match BC once the missing setup rows are added.

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| R-01 Sales account by line type (G/L and FA use `No.`; others use Sales / Sales Cr. Memo account) | confirmed | Sales/Posting/SalesPostInvoice.Codeunit.al:302-308 |
| R-02 Purchase account by line type | confirmed | Purchases/Posting/PurchPostInvoice.Codeunit.al:402-413 |
| R-03 `GenPostingSetup.Get` + `TestField(Blocked,false)` for every line type, G/L lines included | confirmed | Sales/Posting/SalesPostInvoice.Codeunit.al:163-164; Purchases/Posting/PurchPostInvoice.Codeunit.al:141-142 |
| R-04 Prod group NotBlank in setup; both groups tested on sales lines unless sales tax | confirmed | Finance/GeneralLedger/Setup/GeneralPostingSetup.Table.al:46-52; Sales/Posting/SalesPost.Codeunit.al:2635-2674 |
| R-05 Gen. Bus / VAT Bus taken from the Sell-to customer | corrected: overwritten from the Bill-to customer under the default `Bill-to/Sell-to VAT Calc.` = Bill-to/Pay-to No. | Sales/Document/SalesHeader.Table.al:7792-7796, 7980; Finance/VAT/Registration/AltCustVATRegDocImpl.Codeunit.al:124-143; Finance/VAT/Registration/AltCustVATRegFacade.Codeunit.al:187-197; Finance/GeneralLedger/Setup/GLSetupVATCalculation.Enum.al:19-23 |
| R-06 Customer Posting Group from Bill-to → GenJnlLine."Posting Group" → receivables account in PostCust | confirmed | Sales/Document/SalesHeader.Table.al:7982; Finance/GeneralLedger/Journal/GenJournalLine.Table.al:7332-7333; Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1272-1283, 8550-8565 |
| R-07 Payables account, same pattern | confirmed | Finance/GeneralLedger/Journal/GenJournalLine.Table.al:7218-7219; Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:8567-8571; Purchases/Vendor/VendorPostingGroup.Table.al:372-378 |
| R-08 / §1 One VAT G/L entry per buffer row | corrected: only when the row's VAT amount is non-zero; none for sales reverse charge | Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:517-523, 960-1002 |
| R-09 Missing-account errors are always collected during posting | corrected: collected only when an Error Message Handler is active (SendToPosting, batch); otherwise an immediate error; blocking either way | Modules/System/ErrorMessage/ErrorMessageManagement.Codeunit.al:43-51, 287-292; Sales/Document/SalesHeader.Table.al:6688-6690; Sales/Posting/SalesPost.Codeunit.al:470, 518 |
| R-10 Line entry checks accounts and auto-inserts blocked setup rows | corrected: only when the missing-account notification is enabled | Finance/ReceivablesPayables/PostingSetupManagement.Codeunit.al:103-122, 306-318; Sales/Document/SalesLine.Table.al:338-343 |
| R-11 Sales lines negated for non-credit docs, purchase lines for credit docs; totals likewise | confirmed | Sales/Posting/SalesPost.Codeunit.al:1047-1050, 523-527; Purchases/Posting/PurchPost.Codeunit.al:1098-1101, 307-310 |
| R-12 Initial totals TV = AIV − A, TA = A, TB = VAT Base | confirmed | Sales/Posting/SalesPostInvoice.Codeunit.al:351-361 |
| R-13 Discount row built from −discount, subtracted from totals; main row gross | corrected (sign flips for credit memos); mechanism confirmed | Sales/Posting/SalesPostInvoice.Codeunit.al:178-227; Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:563-571, 758-762 |
| R-14 Discount-row VAT `Round(D·r)` / `Round(D/(1+r)·r)` with LCY precision and VAT direction; reverse charge no VAT | confirmed | Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:503-553, 596-610; Sales/Posting/SalesPostInvoice.Codeunit.al:313-346 |
| R-15 Purchase discount accounts TestField'd; sales "only a logged error" | corrected: the sales path is also blocking | Purchases/Posting/PurchPostInvoice.Codeunit.al:168, 211; Finance/GeneralLedger/Setup/GeneralPostingSetup.Table.al:919-956 |
| R-16 100 % line discount zeroes the buffer's VAT | corrected: that zeroing is overwritten (no-op); the real zeroing is in DivideAmount | Sales/Posting/SalesPostInvoice.Codeunit.al:372, 402-408; Sales/Posting/SalesPost.Codeunit.al:3417-3420, 3446-3449 |
| R-17 Group ID key fields and order; VAT % not in key | confirmed | Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:717-746 |
| R-18 Merge sums, System-Created downgrade, FA rows never merge | confirmed | Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:679-715; Sales/Posting/SalesPostInvoice.Codeunit.al:424-440 |
| R-19 Copy Line Descr. puts line no. in `Fixed Asset Line No.` for G/L rows | confirmed | Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:764-778 |
| R-20 LCY-only residue moved to accumulator on merge, applied to next non-zero row | confirmed | Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:699-700, 780-812 |
| R-21 Buffer → journal line (Manual VAT Entry, amounts 1:1, FA posting types) | corrected: purchase FA types also include Appreciation | Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:832-866; Purchases/Posting/PurchPostInvoice.Codeunit.al:590-600 |
| R-22 Engine posting of a G/L row; direct-posting check | corrected: VAT G/L entry conditional; closing-date exemption; document lines checked elsewhere (R-34) | Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1195-1248, 7465-7477 |
| R-23 Customer entry amounts = −reversed totals (Amount, Amount (LCY), Sales/Purch. (LCY), Profit, Inv. Discount) | confirmed | Sales/Posting/SalesPostInvoice.Codeunit.al:593-655; Purchases/Posting/PurchPostInvoice.Codeunit.al:706, 736-738 |
| R-24 Transaction no. per doc type/no/date; weighted balance check; rounding guards | confirmed | Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1990-1997, 2048-2051, 2380-2389, 2569-2580, 449-461 |
| R-25 Balancing payment entry | corrected: Amount also includes Remaining Pmt. Disc. Possible; same Document No. | Sales/Posting/SalesPostInvoice.Codeunit.al:700-751; Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1697-1703 |
| R-26 Inventory leg: Inventory vs COGS (sale), Inventory vs Direct Cost Applied (purchase); Automatic Cost Posting | confirmed | Inventory/Costing/InventoryPostingToGL.Codeunit.al:235-257, 302-324, 739-771; Inventory/Posting/ItemJnlPostLine.Codeunit.al:246 |
| R-27 Sales item charge cost forced to 0 | confirmed | Inventory/Posting/ItemJnlPostLine.Codeunit.al:2704-2715 |
| R-28 Invoice rounding formula and account (needs Gen. Prod. group) | confirmed | Sales/Posting/SalesPost.Codeunit.al:3599-3637; Sales/Customer/CustomerPostingGroup.Table.al:589-600 |
| R-29 Posting group change needs setup flag + customer flag + Alt. group row | confirmed (nuance: the table-level check runs only when the setup flag is on; the page makes the field non-editable otherwise) | Sales/Document/SalesHeader.Table.al:9383-9403; Finance/ReceivablesPayables/PostingGroupChange.Codeunit.al:100-127, 158-165; Sales/Customer/Customer.Table.al:4265-4276 |
| R-30 Setup deletion guards; no source-currency revaluation on receivables/payables | confirmed | Finance/GeneralLedger/Setup/GeneralPostingSetup.Table.al:653-656, 685-693; Sales/Customer/CustomerPostingGroup.Table.al:470-494; Purchases/Vendor/VendorPostingGroup.Table.al:358-370 |
| R-31 Journal shape (G/L line with groups needs Gen. Posting Type; customer/vendor/bank lines carry none) | confirmed | Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:578-590, 619-623, 641-646 |
| R-32 Default VAT group mass update targets | corrected: bus → G/L accounts, customers, vendors; prod → G/L accounts, items, resources, item charges | Finance/GeneralLedger/Setup/GenBusinessPostingGroup.Table.al:51-95; Finance/GeneralLedger/Setup/GenProductPostingGroup.Table.al:47-131 |
| R-33 Buffer rows posted in descending Group ID order | confirmed | Sales/Posting/SalesPostInvoice.Codeunit.al:465-486 |
| §2 Object IDs (tables 55/56/92/93/250/251/252/277/311/312/325/5813/960/961, enum 49, CUs 12/48/815/816/960/5802) | confirmed | grep of object declarations, e.g. Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:34 |
| §2 Buffer "(ACY)" fields are the document-currency mirror | confirmed | Sales/Posting/SalesPost.Codeunit.al:3503; Purchases/Posting/PurchPost.Codeunit.al:3488; Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:851-856 |
| F1 Value-entry G/L posting happens after PostInvoice | corrected: postponed entries are posted right after the line loop, before PostInvoice; only MakeInventoryAdjustment follows PostInvoice | Sales/Posting/SalesPost.Codeunit.al:485-486, 511-512, 530-542, 12002-12013 |
| F2 Discount row `Update(row, force type G/L)` | corrected: the force flag affects only FA lines | Sales/Posting/SalesPostInvoice.Codeunit.al:424-440 |
| §5 Line VAT `ΣA≤i` cumulative formula | corrected: the filter is "all other lines" at entry; at posting DivideAmount re-allocates document VAT with a running remainder (example result unchanged) | Sales/Document/SalesLine.Table.al:5934-5940, 6043-6058; Sales/Posting/SalesPost.Codeunit.al:3438-3452 |
| §5 Discount residue example (dV 56, main VAT −556, total −500) | confirmed (recomputed) | Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:521-543, 563-571 |
| §5 Invoice rounding, FCY cumulative LCY, engine rounding guards, default precision 0.01 | confirmed | Sales/Posting/SalesPost.Codeunit.al:3599-3605, 3507-3554; Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:453-460, 2383-2384; Finance/Currency/Currency.Table.al:886-890 |
| §6 Example setup | corrected: DOM × SERVICES and DOM × MISC rows are required for the G/L lines | Sales/Posting/SalesPostInvoice.Codeunit.al:163-164; Sales/Document/SalesLine.Table.al:4775 |
| §6 E1, E1-variant, E1-COGS, E1-cash, E2, E2-inventory figures and accounts | confirmed (recomputed, all balanced) | Sales/Posting/SalesPostInvoice.Codeunit.al:178-227, 645-650, 725; Inventory/Costing/InventoryPostingToGL.Codeunit.al:235-257, 302-324 |
| §6 W1 demo: Direct Cost Applied = Inventory Adjmt. ≠ Purch. Account | confirmed | src/Apps/W1/ContosoCoffeeDemoDataset/app/DemoData/Finance/1.Setup data/CreatePostingGroups.Codeunit.al:73 |
| §7.7 Direct inventory debit gives "identical" net G/L | corrected: identical only when Direct Cost Applied = Purch. Account | Inventory/Costing/InventoryPostingToGL.Codeunit.al:251-256 |
| §8.7 / §8.11 pitfalls | corrected to match R-16 and R-34 | see R-16, R-34 |

**Added in verification (rules the note missed):**
- R-34: document G/L-account lines must use Direct Posting accounts (Sales/Document/SalesLine.Table.al:4786-4797; Sales/Posting/SalesPost.Codeunit.al:1297-1309; Purchases/Posting/PurchPost.Codeunit.al:1328-1329).
- §7.7 caveat: the purchase value entry (inventory cost) is net of discounts, so a direct Inventory debit must not use the gross buffer row when discounts are posted separately (Purchases/Posting/PurchPost.Codeunit.al:1667, 1679).
- §7.2 note: BC's `('', prod)` General Posting Setup row is an exact-key match for transactions without a partner, not a fallback (Sales/Posting/SalesPostInvoice.Codeunit.al:163; Inventory/Costing/InventoryPostingToGL.Codeunit.al:822-828).

**Counts:** 44 claims checked: 27 confirmed, 17 corrected, 0 refuted; 3 rules added (R-34, the §7.7 discount/inventory caveat, the §7.2 blank-bus note).
