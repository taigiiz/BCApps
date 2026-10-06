# BC research: customer/vendor subledgers, detailed entries, application/unapplication and aging

- Source: BCApps (BC v29, W1 Base App, MIT). Every rule below was read from the AL code, not from documentation.
- Keep levels: **MUST** = needed in micro-ERP v1, **SHOULD** = keep in simpler form or add soon after v1, **SKIP** = leave out.
- Account numbers in the examples come from the illustrative chart in `mn-accounting.md` (1110 Bank, 1200 AR, 1300 VAT receivable, 2100 AP, 2300 VAT payable, 5100 Revenue, 5190 Sales discounts, 8500 FX gain/loss). Currency is MNT and VAT is 10%.
- **Path aliases** (every path is repo-relative; `BA/` = `src/Layers/W1/BaseApp/`):

| Alias | File |
|---|---|
| `CLE` | `BA/Sales/Receivables/CustLedgerEntry.Table.al` |
| `DCLE` | `BA/Sales/Receivables/DetailedCustLedgEntry.Table.al` |
| `VLE` | `BA/Purchases/Payables/VendorLedgerEntry.Table.al` |
| `ENUM` | `BA/Finance/ReceivablesPayables/DetailedCVLedgerEntryType.Enum.al` |
| `DBUF` | `BA/Finance/ReceivablesPayables/DetailedCVLedgEntryBuffer.Table.al` |
| `GJPL` | `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al` |
| `GJA` | `BA/Finance/ReceivablesPayables/GenJnlApply.Codeunit.al` |
| `CEAPE` | `BA/Sales/Receivables/CustEntryApplyPostedEntries.Codeunit.al` |
| `SETID` | `BA/Sales/Receivables/CustEntrySetApplID.Codeunit.al` |
| `EDIT` | `BA/Sales/Receivables/CustEntryEdit.Codeunit.al` |
| `ACE` | `BA/Sales/Receivables/ApplyCustomerEntries.Page.al` |
| `PTM` | `BA/Finance/ReceivablesPayables/PaymentToleranceManagement.Codeunit.al` |
| `CUST` / `VEND` | `BA/Sales/Customer/Customer.Table.al` / `BA/Purchases/Vendor/Vendor.Table.al` |
| `AARCU` | `BA/Finance/ReceivablesPayables/AgedAccReceivable.Codeunit.al` |
| `AAR` | `BA/Sales/Reports/AgedAccountsReceivable.Report.al` (obsolete since 28.0) |
| `AARX` | `src/Apps/W1/ExcelReports/App/src/Financials/EXRAgedAccountsRecExcel.Report.al` (its replacement) |
| `REV` | `BA/Finance/GeneralLedger/Reversal/ReversalEntry.Table.al` |

---

## 1. Summary

- **Two levels per document.** Each posted document (invoice, credit memo, payment, refund) creates one **header** ledger entry (`Cust. Ledger Entry` T21 / `Vendor Ledger Entry` T25). It holds the descriptive and status data: customer, document, dates, `Open`, `Positive`, `Closed by …`, and the apply-in-progress fields. Every *money movement* on it is an append-only **detailed** entry (T379 / T380). Amount, Remaining Amount, Original Amount and the LCY variants are **FlowFields (sums over the detailed entries)**, never stored (`CLE:129-200, 670-681`).
- **Why.** The header is mutable (status fields), but the money history is immutable. That gives point-in-time balances (`Date Filter` on the sums), exact unapply (mirror the detailed rows), and FX/discount/rounding breakdowns, while the header table stays small.
- **Detailed entry types** (`ENUM:24-92`): Initial Entry, Application, Unrealized/Realized Gain/Loss, Payment Discount (+VAT variants), Appln. Rounding, Correction of Remaining Amount, Payment Tolerance / Payment Discount Tolerance (+VAT variants). `Amount` (the "original" document amount) excludes **Application** and **Appln. Rounding** (`DCLE:511-522`). `Remaining Amount` includes everything.
- **Application** = pairwise matching of opposite-sign open entries for the same customer. For each pair BC writes two `Application` detailed rows: the applied-to ("old") entry gets `OldAppliedAmount` and the applying ("new") entry gets `-AppliedAmount`. In one currency they sum to zero, so the receivables G/L account does not move (`GJPL:3541-3565`).
- **Two ways to choose what to apply**: `Applies-to Doc. No.` (exactly one target document) or `Applies-to ID` (a tag on many open entries, each with its own `Amount to Apply`). Customers with `Application Method = Apply to Oldest` are applied automatically, by due date (`GJPL:3782-3785`, `4063-4078`).
- **Unapply** is LIFO per entry. It mirrors all detailed rows of the application transaction (negated, `Unapplied = true`) and reopens the header entries (`GJPL:5962-6136`, `CEAPE:279-291, 713-729`). BC's cross-entry LIFO check runs only for applications with `Transaction No. ≠ 0`, so it is not strict in every case. See R-29. (verified-corrected)
- **Customer balance** = Σ detailed `Amount` (no type filter, so applications net out). **Balance Due** = the same sum filtered by the denormalized `Initial Entry Due Date` (`CUST:725-890`). Vendor FlowFields use the same sums **negated** (`VEND:478-500`).
- **Aging as of date D** = for each entry with `Posting Date ≤ D`, Σ detailed amounts with `Posting Date ≤ D`, bucketed by due date (or posting/document date) relative to D (`AAR:440-523, 853-876`; `AARX:341-367`). Both BC reports differ from this model in some cases. See R-34. (verified-corrected)
- **Sign convention**: positive = debit. A customer invoice is +, a customer payment is −. A vendor invoice is −, a vendor payment is +. `Positive` = sign of the initial remaining amount (`GJPL:1309`).

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| Customer ledger entry | Table 21 `Cust. Ledger Entry` | One row per posted customer document; status holder | `Entry No.` Int PK; `Customer No.` Code20; `Posting Date`, `Document Date`, `Due Date`, `Pmt. Discount Date` Date; `Document Type` Enum; `Document No.` Code20; `External Document No.` Code35; `Currency Code` Code10; `Open`, `Positive` Bool; `Closed by Entry No.` Int; `Closed at Date` Date; `Closed by Amount(/LCY)` Dec; `Applies-to Doc. Type/No.`; `Applies-to ID` Code50; `Amount to Apply` Dec; `Applying Entry` Bool; `Original/Adjusted Currency Factor` Dec; `Customer Posting Group` Code20; `Transaction No.`, `G/L Register No.` Int; `Reversed`, `Reversed (by) Entry No.`; FlowFields `Amount`, `Remaining Amount`, `Original Amount`, `(LCY)` variants, `Debit/Credit Amount`; FlowFilter `Date Filter` | MUST (drop pmt-tolerance, reminder, IC, SEPA, dispute fields) |
| Detailed customer ledger entry | Table 379 `Detailed Cust. Ledg. Entry` | Append-only money movements of a T21 row | `Entry No.` Int PK; `Cust. Ledger Entry No.` Int FK; `Entry Type` Enum 379; `Posting Date`; `Document Type/No.` (of the *causing* transaction); `Amount`, `Amount (LCY)`, `Debit/Credit Amount(/LCY)` Dec; `Customer No.`; `Currency Code`; `Transaction No.`; `Application No.` Int; `Applied Cust. Ledger Entry No.` Int; `Unapplied` Bool; `Unapplied by Entry No.` Int; `Ledger Entry Amount` Bool; `Initial Entry Due Date` Date; `Initial Document Type`; `Initial Entry Global Dim. 1/2`; `Posting Group` Code20; `Remaining Pmt. Disc. Possible`, `Max. Payment Tolerance` (snapshots for unapply); `Excluded from calculation` Bool | MUST |
| Vendor ledger entry / detailed | Tables 25 / 380 | Mirror of 21/379 for payables | Same as above (`Vendor No.`, `Vendor Posting Group`, `Purchase (LCY)`) | MUST (share one schema with a `party_type` column) |
| Detailed entry type | Enum 379 `Detailed CV Ledger Entry Type` | Classifies detailed rows | values 1–17 (`ENUM:24-92`) | MUST: Initial, Application, Realized Gain/Loss, Unrealized Gain/Loss, Correction of Remaining Amount. SHOULD: Payment Discount, Appln. Rounding. SKIP: tolerance and VAT-adjustment types |
| CV buffers | Tables 382 `CV Ledger Entry Buffer`, 383 `Detailed CV Ledg. Entry Buffer` | In-memory working copies during posting; one code path for customer, vendor and employee | `Remaining Amount` is updated incrementally as detailed rows are added (`DBUF:570-577`) | SKIP as tables (use in-memory structs) |
| Customer / Vendor balances | Table 18 / Table 23 FlowFields | `Balance`, `Balance (LCY)`, `Net Change`, `Balance Due`, `Payments`, `Pmt. Discounts (LCY)` | Sum over T379/T380 | MUST (SQL views) |
| Application method | Enum 1381 {Manual, Apply to Oldest}; `Customer."Application Method"` (`CUST:1072`) | Auto-apply payments | | SHOULD |
| Customer Posting Group | Table 92 | Receivables account; pmt-disc, rounding and appln-rounding accounts (`…/CustomerPostingGroup.Table.al:514-583`) | | MUST (receivables), SHOULD (rounding), SKIP (rest) |
| Apply Unapply Parameters | Table 579 | Document No. + posting date for posting an apply/unapply | | SKIP (method arguments) |
| Engine | CU12 `Gen. Jnl.-Post Line` (PostCust, ApplyCustLedgEntry, PostApply, CalcApplication, UnapplyCustLedgEntry); CU225 `Gen. Jnl.-Apply`; CU226/227 `Cust/VendEntry-Apply Posted Entries`; CU101 `Cust. Entry-SetAppl.ID`; CU103 `Cust. Entry-Edit`; CU426 `Payment Tolerance Management` | Behaviour | | MUST (re-implement the logic) |
| Aging | CU763 `Aged Acc. Receivable` (chart); Report 120 (obsolete); Report 4402 `EXR Aged Accounts Rec Excel` | AR aging | | MUST (one as-of-date query) |

---

## 3. Business rules

### Ledger structure and derived values
- **R-SUBLEDGERS-APPLICATION-01**: Header amounts are derived from detailed rows. `Remaining Amount` = Σ dtl.Amount (all types) for the entry; `Amount` = Σ dtl.Amount where `Ledger Entry Amount = true`; `Original Amount` = Σ dtl.Amount where type = Initial Entry. All of them honour `Date Filter` on the detailed `Posting Date`. `Remaining Amount(/LCY)` and the customer `Balance`/`Net Change`/`Balance Due` sums also filter `Excluded from calculation = false`. This only matters for the Spanish Cartera feature, so a sum over all rows is correct for us. `Amount` and `Original Amount` have no such filter (`CLE:150, 180`; `CUST:733, 749`). (verified-corrected) *Src:* `CLE:129-200, 670-681`. *Keep:* MUST. *Notes:* store `remaining_amount` on the header as a cache only if it is updated in the same DB transaction. The sum is the source of truth.
- **R-SUBLEDGERS-APPLICATION-02**: `Ledger Entry Amount := not (Entry Type in [Application, Appln. Rounding])`, set on insert. So payment discount, FX gain/loss and the correction rows change an entry's `Amount`, while applications only change `Remaining Amount`. *Src:* `DCLE:449-452, 511-522`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-03**: When a document is posted, exactly one Initial Entry row is created **even when the amount is 0** (`InsertZeroAmout = true`). That row sets `Original Amount`. Then `Open := Remaining ≠ 0` and `Positive := Remaining > 0`. *Src:* `GJPL:1307-1309`; `DBUF:501-507, 575-578`. *Keep:* MUST. *Notes:* `Positive` never changes later. It is the "side" of the document.
- **R-SUBLEDGERS-APPLICATION-04**: Detailed rows of one posting are **merged** when they share CV entry, entry type, posting date, document type and no., party, and gen/VAT posting groups. Their amounts are summed into one row. *Src:* `DBUF:523-565`. *Keep:* SHOULD (merge per entry+type within a transaction).
- **R-SUBLEDGERS-APPLICATION-05**: `Debit/Credit Amount` on a detailed row = the sign of `Amount`, swapped when `Correction` is set (storno). Unapply rows copy the original split and negate it, so they produce negative debit/credit values. *Src:* `DCLE:470-487`; `GJPL:6661-6673`. *Keep:* SHOULD (only if storno presentation is required, otherwise derive from the sign).
- **R-SUBLEDGERS-APPLICATION-06**: The header row is written **after** the application has been computed in the buffer, so its status fields (`Open`, `Closed by …`) are already final at insert. `Amount to Apply`, `Applies-to Doc. No.` and `Applies-to ID` are cleared on the new entry. *Src:* `GJPL:1333-1349`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-07**: The receivables G/L entry is the **sum of `Amount (LCY)` of all detailed rows of the posting** (per dimension set), posted to the customer posting group's receivables account. Application rows cancel out. Gain/loss, discount and rounding rows are booked to their own accounts with the opposite sign. *Src:* `GJPL:4133-4195` (UpdateTotalAmounts per row, then CreateGLEntriesForTotalAmounts), `7752-7830`, `5419-5530`. *Keep:* MUST. *Notes:* this is the invariant **Σ detailed Amount (LCY) for a customer = that customer's share of the AR G/L balance**.
- **R-SUBLEDGERS-APPLICATION-08**: If a posting creates detailed rows but **no G/L entries**, those rows get `Transaction No. = 0`, and `Application No.` = the first detailed `Entry No.` of the set. This happens when two posted LCY entries are applied to each other. *Src:* `DCLE:493-509`; `GJPL:1360-1362, 4006-4007, 6130-6131`. *Keep:* MUST (as an explicit `application_id` on every application row, always set).
  - (added-in-verification) A **document posting never gets Transaction No. 0**. When a new ledger entry is inserted and the receivables total is 0, `CreateGLEntriesForTotalAmounts` still writes a **zero-amount** receivables G/L entry (`GJPL:7831-7832`, `if not GLEntryInserted and LedgEntryInserted`). So only two things can produce Transaction No. 0: a posted-entries application (`CustPostApplyCustLedgEntry` passes `LedgEntryInserted = false`, `GJPL:4000`) and an unapply in a single currency (`GJPL:6130-6131`).
- **R-SUBLEDGERS-APPLICATION-09**: Each detailed row denormalizes `Initial Entry Due Date`, `Initial Document Type`, `Initial Entry Global Dim 1/2` and `Posting Group` from its header. Balance-due and aging sums can then run on one table. Changing `Due Date` on an open entry rewrites `Initial Entry Due Date` on **all** its detailed rows. *Src:* `DBUF:647-656`; `EDIT:41-45`. *Keep:* MUST (or join to the header in SQL; then drop the denormalization).
- **R-SUBLEDGERS-APPLICATION-10**: On a posted entry only a whitelist of fields can be edited. **Open entries:** due/discount dates, `Applies-to ID`, `Amount to Apply`, payment references, and the header amount fields `Remaining Pmt. Disc. Possible`, `Max. Payment Tolerance` and `Accepted Payment Tolerance`. **Any entry, including closed ones:** `On Hold`, `Description`, `Promised Pay Date`, `Dispute Status`, `Exported to Payment File`. `Due Date`, `Pmt. Discount Date`, `Applies-to ID` and `Amount to Apply` each `TestField(Open, true)`. The ledger amounts (detailed rows and the FlowFields built from them) are never edited. Discount and tolerance amounts on an open header can be edited. (verified-corrected) *Src:* `EDIT:39-66`; `CLE:350-385, 451-462, 783-805`. *Keep:* MUST.

### Choosing what to apply
- **R-SUBLEDGERS-APPLICATION-11**: Application runs only if the new entry has `Amount to Apply ≠ 0` and at least one of these holds: `Applies-to Doc. No.` is set, `Applies-to ID` is set, or (customer `Application Method = Apply to Oldest` and the line has `Allow Application`). *Src:* `GJPL:3776-3786`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-12**: **Applies-to Doc. No.** method: find the *open* entry of that customer with that doc type and no. The target must have the **opposite sign** (`TestField(Positive, not New.Positive)`), and the currency must be compatible. Exactly one target is applied, then the loop stops. *Src:* `GJPL:4031-4058`, `3912-3913`. *Keep:* MUST.
  - (added-in-verification) This path does **not** filter or reset the target's `Amount to Apply`. If the target still has a non-zero `Amount to Apply`, for example a stale `Applies-to ID` tag left by another user (see §8), the applied amount is capped at `ABSMin(New.Remaining, −Old."Amount to Apply")` instead of the target's remaining amount (`GJPL:3393-3405`). So a payment meant to clear the invoice can apply only partly. In the micro-ERP, keep allocation amounts out of the ledger row (§7.4).
- **R-SUBLEDGERS-APPLICATION-13**: **Applies-to ID** method: the candidates are all open entries of the customer with the same `Applies-to ID`, excluding the new entry itself. With the Manual method only entries with `Amount to Apply ≠ 0` qualify. With Apply to Oldest the blank ID matches every untagged open entry with `Posting Date ≤` the payment date. Candidates are sorted by `Customer No., Applies-to ID, Open, Positive, Due Date` (then Entry No.). *Src:* `GJPL:4059-4092`; key `CLE:1099`. *Keep:* MUST (manual), SHOULD (oldest).
- **R-SUBLEDGERS-APPLICATION-14**: Tagging an entry with an Applies-to ID defaults its `Amount to Apply` to its full `Remaining Amount`. Untagging resets it to 0. `Amount to Apply` must have the same sign as `Remaining Amount`, and its absolute value cannot be larger. *Src:* `SETID:61-95`; `CLE:783-805, 1591-1599`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-15**: Mixed-sign candidate sets. If candidates of the **same** sign as the new entry exist, BC computes the net of new + all candidates (net of pmt discounts). It then first processes the candidates whose sign is opposite to that net. While that sign filter is active, each candidate is consumed by its whole `Amount to Apply`, or its whole `Remaining Amount` when `Amount to Apply` = 0. The applied amount is **not** capped by the new entry's remaining amount, so the new entry can temporarily grow (`GJPL:3377-3389`). (verified-corrected) The leftover side is applied only while the signs still allow it (`GJPL:3914-3922`: after the filtered set, the loop stops when `first.Remaining × New.Remaining ≥ 0`). With Apply to Oldest, the net-sum loop stops as soon as the running total reaches 0 or changes sign (`GJPL:4107-4111`). *Src:* `GJPL:4094-4115`, `3377-3384`, `3914-3922`. *Keep:* SHOULD (simplify: v1 allows only opposite-sign candidates).
- **R-SUBLEDGERS-APPLICATION-16**: Application date = max(new entry posting date, posting dates of the targets). For Applies-to ID, only tagged targets count. All Application rows carry that date. Posting an application of already-posted entries before the latest posting date in the set is refused. In the UI, a journal payment cannot be applied to a document posted later than itself. *Src:* `GJPL:4052-4053, 4086-4087, 3798`; `CEAPE:105-112, 126-146`; `ACE:1050-1058`. *Keep:* MUST. *Notes:* this keeps aging consistent: nothing is settled before it exists.
- **R-SUBLEDGERS-APPLICATION-17**: Currencies: with `Appln. between Currencies = None` (the default), every entry in one application must have the same currency. *Src:* `GJA:281-349`; `GJPL:4077-4078`. *Keep:* MUST (v1: same currency only).

### Application algorithm
- **R-SUBLEDGERS-APPLICATION-18**: Per pair, in this order: payment tolerance → payment discount → pmt-disc tolerance → currency appln rounding → **FindAmtForAppln** → unrealized G/L reversal on old → realized G/L on new and old → **CalcApplication** → remaining pmt disc → LCY correction on old. *Src:* `GJPL:5870-5958`. *Keep:* MUST (the bold steps plus the FX steps), SKIP (tolerances).
- **R-SUBLEDGERS-APPLICATION-19**: Applied amount (in the new entry's currency, signed like the **old** entry's reduction): without a sign filter it is `ABSMin(New.Remaining, -Old.AmountToApply)` if Old.AmountToApply ≠ 0, else `ABSMin(New.Remaining, -Old.Remaining)`. When a sign filter is active (R-15), it is `−Old.AmountToApply`, or `−Old.Remaining` if that is 0, with **no** `ABSMin` against the new entry. (verified-corrected) When a pmt discount applies and the payment covers remaining − discount, it is `−Old.Remaining`, so the old entry is closed fully. *Src:* `GJPL:3366-3409`; `ABSMin` `GJPL:7236-7241`. *Keep:* MUST. *Notes:* this is what makes partial payments work: the smaller absolute amount wins.
- **R-SUBLEDGERS-APPLICATION-20**: LCY value of the application = `Round(AppliedAmount / Old."Original Currency Factor")`. For LCY entries the factor is 1. *Src:* `GJPL:3415-3417`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-21**: CalcApplication writes the old entry's `Application` row with (`OldAppliedAmount`, `AppliedAmountLCY`) and the new entry's with (`−AppliedAmount`, `−AppliedAmountLCY`). Both rows have `Applied CV Ledger Entry No.` = **new** entry no. *Src:* `GJPL:3541-3565`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-22**: Closing. Each entry's `Open := Remaining ≠ 0`. If the **old** entry closes, it gets `Closed by Entry No. = new`, `Closed at Date = application date` and `Closed by Amount = −OldAppliedAmount`. If the **new** entry closes and `AllApplied` is false, the new entry gets `Closed by Entry No.` = the current old entry and `Closed by Amount = AppliedAmount`. `AllApplied` starts as true for each application run (`GJPL:3780`). It becomes false the first time **any** old entry in the run stays open (`GJPL:3559`) and never goes back to true, so "an old entry stayed open" may refer to an earlier pair (`GJPL:3571-3575`). (verified-corrected) If no old entry stayed open, only the old ones point to the new entry, and the new entry gets only `Closed at Date`. *Src:* `GJPL:3550-3579`. *Keep:* SHOULD (`closed_at` MUST; `closed_by` is informational, use the application rows for navigation).
- **R-SUBLEDGERS-APPLICATION-23**: Loop termination: Applies-to Doc. No. stops after one target. Otherwise the loop continues while the new entry is still open and candidates remain. Each detailed row reduces the entry's `Amount to Apply` by the row's amount (`DBUF:570`). So a candidate whose `Amount to Apply` reaches 0 gets its ID cleared. A partially applied candidate keeps its `Applies-to ID` in the database, with the **residual** `Amount to Apply`, and is also recorded in a temporary list. If the same ID is used again later, it will be applied again. (verified-corrected) For untagged same-currency candidates, `Amount to Apply` is reset to 0 (`GJPL:3820-3821`). *Src:* `GJPL:3902-3929, 3820-3832`. *Keep:* MUST (clear tags after posting).

### FX, rounding and discount (summary)
- **R-SUBLEDGERS-APPLICATION-24**: Realized gain/loss (on each FCY entry) = `AppliedAmountLCY − Round(AppliedAmount / entry."Original Currency Factor")`. If > 0 it is a Realized Gain row, if < 0 a Realized Loss row, with FCY amount 0. The G/L posting is `−Amount(LCY)` to the currency's gain/loss account. *Src:* `GJPL:3496-3522, 5442-5452`. *Keep:* SHOULD (MUST if FCY is in v1).
- **R-SUBLEDGERS-APPLICATION-25**: Unrealized gain/loss from earlier revaluations is reversed **pro rata** on application: `Round(Σ unrealized LCY × |applied / remaining before|)`, posted with the opposite sign. *Src:* `GJPL:3449-3494`; `DCLE:529-536`. *Keep:* SHOULD (needed with the month-end revaluation required by MN rules, see `mn-accounting.md`).
- **R-SUBLEDGERS-APPLICATION-26**: Correction of Remaining Amount. For FCY entries, if `Round(Remaining FCY / Adjusted Currency Factor) ≠ Remaining LCY`, the difference is posted as a correction row to the posting group's Debit/Credit Rounding account. This keeps the residual LCY balance zero when the FCY balance is zero. *Src:* `GJPL:3598-3615, 4270-4271`. *Keep:* SHOULD.
- **R-SUBLEDGERS-APPLICATION-27**: Payment discount. The possible discount is fixed at invoice posting as `Round(base × Payment Discount % / 100)` (base = incl. VAT unless `Pmt. Disc. Excl. VAT`). It is computed only if `Pmt. Discount Date` + `Payment Discount Grace Period` ≥ the invoice posting date. It is granted only when a **Payment/Refund** whose **posting date ≤ `Pmt. Discount Date`** (no grace, `PTM:2134, 2137`) covers `Remaining − RemainingPmtDiscPossible`. The grace period only sets `Pmt. Disc. Tolerance Date` (`GJPL:2664`). A discount after the discount date goes through the pmt-discount *tolerance* path, which is SKIP. (verified-corrected) It is posted as a `Payment Discount` row **on the payment (new) entry**, `PmtDisc = −RemainingPmtDiscPossible`, to the posting group's pmt-disc account. *Src:* `GJPL:2617-2651, 2726-2793, 4260-4261`; `PTM:2121-2159`. *Keep:* SKIP in v1 (rare for MN micro businesses). Reserve the entry type.

### Unapply and reversal
- **R-SUBLEDGERS-APPLICATION-28**: Only an `Application` row that is not yet `Unapplied` can be unapplied, and only the **latest** such row on that entry (highest Entry No.). *Src:* `CEAPE:236-253, 279-291`; `GJPL:6010, 6032`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-29**: Every entry touched by the application must have that application as its **latest transaction**. That means its latest application transaction, and its latest non-unrealized detailed transaction, must be this one. Otherwise: "unapply all application entries … posted after this entry first". *Src:* `CEAPE:255-276, 596-612, 713-729`. *Keep:* MUST. *Notes:* strict LIFO stops the remaining amounts from ever becoming inconsistent with the order of history.
  - (verified-corrected) **BC's cross-entry check has a gap.** `CheckUnappliedEntries` is called only for rows with `Transaction No. ≠ 0` (`CEAPE:411-412`). Both "latest transaction" finders keep a row only if its `Transaction No.` is greater than the running maximum (`CEAPE:607`, `269`), so transaction-0 applications are invisible to them. Posted-entries applications in a single currency are such applications (R-08). Example: an invoice is partly paid by a journal payment (T2) and later applied to a credit memo through "Apply Entries" (Transaction No. 0). The payment's application can still be unapplied, even though a later application touched the same invoice. Only the per-entry rule of R-28 always holds. **For the micro-ERP:** enforce strict LIFO per entry with a monotonic `application_id` and do not copy this gap.
- **R-SUBLEDGERS-APPLICATION-30**: Unapply is refused if the entry is `Reversed` (`CEAPE:498-506`), if the posting date is outside the allowed window (`CEAPE:468-478`), or if it is earlier than the application's posting date (`CEAPE:389-390`). *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-31**: Unapply takes **all** non-initial rows of the application transaction for that customer, selected by `Transaction No.`, or by `Application No.` when the transaction no. is 0. These include the discount, gain/loss and rounding rows. It inserts a mirror row for each one (negated amounts, posting date = unapply date, new transaction, `Unapplied = true`, `Unapplied by Entry No.` = original), flags the original the same way, and reopens the header (clears `Closed by …`, restores `Remaining Pmt. Disc. Possible` and `Max. Payment Tolerance` from the snapshot on the row). Receivables G/L = Σ mirrored LCY. In single currency that sum is 0, so no AR G/L entry. *Src:* `GJPL:6014-6026, 6070-6135, 6661-6686, 6878-6906, 7777-7802`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-32**: Reversing (storno) a posted transaction requires its ledger entries to have **no non-unapplied rows other than Initial Entry**. So you unapply first, then reverse. *Src:* `REV:816-846`. *Keep:* MUST.

### Balances and aging
- **R-SUBLEDGERS-APPLICATION-33**: `Customer.Balance(LCY)` = Σ dtl.Amount(LCY) for the customer. `Net Change` = the same with `Posting Date` in the date filter. `Balance Due(LCY)` = the same with `Initial Entry Due Date ≤ upper bound of the date filter`, **without** a posting-date filter. `Pmt. Discounts (LCY)` = −Σ of the discount types. *Src:* `CUST:725-890, 841-856`. Vendor: `Balance`, `Net Change` and `Balance Due` are the same sums **negated** (`VEND:478-500`). Vendor `Pmt. Discounts (LCY)` is **not** negated (`VEND:558-570`), unlike the customer field. (verified-corrected) *Keep:* MUST (Balance, Net Change, Balance Due as of date).
- **R-SUBLEDGERS-APPLICATION-34**: Aging as of D. Candidates are the entries with `Posting Date ≤ D`. Remaining as of D = Σ dtl rows of the entry with `Posting Date ≤ D`, and zero results are skipped. The bucket is chosen by Due Date (default), Posting Date or Document Date against periods counted back from D. *Src:* `AAR:201-261, 429-523, 853-876, 931-938`; `AARX:341-367` (`Remaining Amt. (LCY)` with `Date Filter = ..D`). *Keep:* MUST.
  - (verified-corrected) The "Posting Date ≤ D" candidate rule holds exactly only for **Report 4402** (`AARX:349`). Each report differs from the clean model in its own way:
    - **Report 120** (obsolete): for due-date and document-date aging, **all open entries** are candidates whatever their posting date. Only posting-date aging filters `Posting Date ≤ D` (`AAR:240-262`). For an entry posted **after** D, the Initial Entry row is re-dated to its `Document Date` if that is ≤ D, or, for due-date aging, to its `Due Date` if that is ≤ D. It is then counted (`AAR:446-461`). So a back-dated invoice (document date ≤ D, posted after D) shows up in the as-of-D aging.
    - **Report 4402** (Excel): besides `Posting Date ≤ D`, it filters the aging basis date to `[earliest period start, D]` (`AARX:346-359`). For due-date aging this **drops entries that are not yet due** (due date > D). It also drops entries older than `PeriodCount × PeriodLength` (default 5 × 1M). There is no "Not due" or "older" bucket in its dataset.
    - **For the micro-ERP:** use the clean rule (posting date ≤ D, Σ detail ≤ D, explicit "Not due" and "older" buckets). Do not copy either report's quirk.

---

## 4. Flows

### 4.1 Post a customer document (invoice, credit memo or payment) — `PostCust` `GJPL:1250-1369`
1. Check the customer (blocked) and the posting group, and resolve the receivables account (`1270-1282`).
2. Lock the detailed and header tables (`1284-1285`). Build the header in memory: `Entry No.`, `Transaction No.`, fields copied from the journal line (`CLE:1435-1480`).
3. Insert the Initial Entry row into the buffer (amount = line Amount/Amount (LCY), even 0). Set `Open` and `Positive` (`1307-1309`).
4. Compute the possible payment discount and the currency factors (`1312-1320`).
5. For non-payments, check that the external/document number is unique (`1322-1330`).
6. **ApplyCustLedgEntry** (4.2).
7. Copy the buffer to the header, clear the apply fields, insert the header (`1336-1349`).
8. **PostDtldCustLedgEntries**: insert detailed rows (Entry No. = last + sequence), sum LCY per dimension set, book special rows to their accounts, then book the total to receivables (`4133-4195`).
9. If no G/L entry was created, set Transaction No. to 0 and stamp the Application No. (`1360-1362`).

### 4.2 Apply (inside a posting, or "Apply Entries" on posted entries) — `GJPL:3755-3900`
1. Exit if Amount to Apply = 0, or if neither a method nor auto-apply is set (`3776-3786`).
2. `PrepareTempCustLedgEntry`: collect and order the candidates (R-12/13/15). Compute the application date (`4016-4116`).
3. Loop over the candidates: `PostApply` (`5870-5958`):
   1. Convert the old entry's amounts to the new entry's currency.
   2. Tolerance and discount rows (if enabled).
   3. `FindAmtForAppln` gives AppliedAmount, AppliedAmountLCY and OldAppliedAmount.
   4. Unrealized reversal on the old entry, realized gain/loss on both.
   5. `CalcApplication`: two Application rows, Open/Closed flags.
   6. LCY correction on the old entry.
4. After each pair: modify the old header (clear `Amount to Apply` and the ID when fully used), and run unrealized VAT if enabled (`3820-3858`).
5. Stop according to R-23. Then run the new entry's unrealized-G/L reversal and LCY correction, and clear its `Applies-to ID` and `Amount to Apply` (`3863-3877`).
6. Posted-entries variant (`CEAPE:148-208` → `GJPL:3935-4014`): the system creates a journal line (source code "Sales Entry Application", `System-Created Entry`) and runs steps 1–5 on the existing header. It raises an error if no detailed row was created (`CEAPE:192-196`).

### 4.3 Unapply — `CEAPE:357-453` → `GJPL:5962-6136`
1. The user picks an entry. Find its last non-unapplied Application row (`CEAPE:298-311`).
2. Check the posting date window and the date ≥ application date. Check that no entry is reversed. Apply the LIFO checks to every row of that application, but only when the row's `Transaction No. ≠ 0` (`CEAPE:385-413`, gap described in R-29). (verified-corrected)
3. Select the rows by Transaction No. (or Application No.), with type > Initial Entry (`GJPL:6014-6026`).
4. For each: insert the mirror row, accumulate LCY, post the special accounts, flag the original, and reopen the header (`6070-6118`).
5. Post Σ LCY to receivables (0 in single currency), stamp the transaction, finish (`6121-6135`).
6. Re-run the exchange-rate adjustment for the affected FCY entries (`CEAPE:440, 455-466`).

### 4.4 Aging report (as of D) — `AAR`
1. Compute the buckets (`853-876`). For due-date aging: bucket 1 = (D+1 … ∞) "Not due". Then 3 buckets of `PeriodLength` going back from D. The last bucket is open-ended ("Before …").
2. Collect the candidates (`201-261`). The first group is open entries: for due-date and document-date aging, at **any** posting date. For posting-date aging, only those with posting date ≤ D and a non-zero remaining as of D. The second group is entries with posting date ≤ D that are linked through `Closed by Entry No.` (in either direction) to an entry posted after D. (verified-corrected)
3. For each candidate, sum the detailed rows dated ≤ D, and skip zero (`440-498`). Exception: for an entry posted after D, its Initial Entry row is re-dated to the entry's Document Date, or Due Date for due-date aging, if that date is ≤ D (`446-461`). See R-34. (verified-corrected)
4. Find the bucket index by due date (or posting/document date), and add to the customer, currency and grand totals (`500-523`).

---

## 5. Calculations & rounding

| Quantity | Formula | Rounding | Source |
|---|---|---|---|
| Remaining (as of D) | Σ dtl.Amount, `posting_date ≤ D` | none (stored values are already rounded) | `CLE:144-155` |
| Applied amount | `ABSMin(New.Rem, −Old.AmtToApply or −Old.Rem)`. With an R-15 sign filter it is `−Old.AmtToApply or −Old.Rem`, with no ABSMin (verified-corrected) | none (amounts are already rounded) | `GJPL:3377-3407` |
| Applied LCY | `Round(Applied / Old.OrigFactor)` | `Round()` with the default precision (0.01), nearest | `GJPL:3416` |
| Realized G/L | `AppliedLCY − Round(Applied / Entry.OrigFactor)` | nearest | `GJPL:3510` |
| Unrealized reversal | `Round(ΣUnreal × |Applied/RemBefore|)` | nearest | `GJPL:3466-3482` |
| LCY correction | `Round(Rem / AdjFactor) − RemLCY` | nearest | `GJPL:3604-3613` |
| Appln rounding (cross-currency only) | `−(New.Rem + Old.Rem)` if `0 < |x| ≤ Appln. Rounding Precision` | n/a | `GJPL:3347-3364, 7243-7255` |
| Possible pmt disc | `Round(base × % / 100, AmountRoundingPrecision)` | nearest | `GJPL:2645-2647` |
| Remaining pmt disc after invoice↔credit-memo application | pro-rata `Round(…)`; payments do **not** reduce it | nearest | `PTM:1993-2032` |

- BC currency factor = FCY per 1 LCY, so LCY = FCY / factor. In MNT terms, factor = 1 / rate.
- For an MNT-only v1, every LCY formula collapses to LCY = amount. Realized/unrealized G/L, correction and appln rounding are never created. **Do not** introduce a rounding step on applications: MNT amounts are stored at 2 decimals (or 0, if the company chooses tögrög-only), and the application only moves amounts that already exist.

---

## 6. Worked posting examples

All examples balance. "Dtl" = a detailed entry. CLE#n = customer ledger entry n.

### 6.1 Invoice 1,100 incl. VAT (INV-001, posted 2026-01-10, due 2026-02-09)
| Account | Debit | Credit |
|---|---:|---:|
| 1200 AR (customer C1) | 1,100 | |
| 5100 Revenue | | 1,000 |
| 2300 VAT payable | | 100 |
| **Total** | **1,100** | **1,100** |

Dtl D1: CLE#1, Initial Entry, +1,100, `Ledger Entry Amount` = true, `Initial Entry Due Date` = 2026-02-09. CLE#1: Open, Positive, Remaining 1,100.

### 6.2 Partial payment 500 (PMT-001, 2026-01-20, Applies-to Doc. No. = INV-001)
| Account | Debit | Credit |
|---|---:|---:|
| 1110 Bank | 500 | |
| 1200 AR | | 500 |

Detailed rows (the AR posting = Σ = −500 −500 +500 = −500):

| Dtl | CLE | Type | Doc | Amount | Applied CLE |
|---|---|---|---|---:|---|
| D2 | #2 PMT-001 | Initial Entry | PMT-001 | −500 | – |
| D3 | #1 INV-001 | Application | PMT-001 | −500 | #2 |
| D4 | #2 PMT-001 | Application | PMT-001 | +500 | #2 |

Result: CLE#1 Remaining = 1,100 − 500 = **600**, Open. CLE#2 Remaining 0, closed. **CLE#2.Closed by Entry No. = 1** because the payment was consumed and the invoice stays open. Closed by Amount = −500.

### 6.3 Second payment 600 (PMT-002, 2026-02-05, Applies-to Doc. No. = INV-001; the original omitted the method) (verified-corrected)
| Account | Debit | Credit |
|---|---:|---:|
| 1110 Bank | 600 | |
| 1200 AR | | 600 |

| Dtl | CLE | Type | Amount |
|---|---|---|---:|
| D5 | #3 PMT-002 | Initial Entry | −600 |
| D6 | #1 INV-001 | Application | −600 |
| D7 | #3 PMT-002 | Application | +600 |

CLE#1 Remaining 1,100 − 500 − 600 = 0, closed. **CLE#1.Closed by Entry No. = 3**, Closed by Amount = +600, Closed at 2026-02-05. CLE#3 closed, `Closed by Entry No. = 0` (both closed in the same pair), Closed at 2026-02-05. Customer balance = Σ D1..D7 = 0 = the AR G/L for C1 (1,100 − 500 − 600).

### 6.4 Aging and balance as of a date
- As of **2026-01-31** (due-date aging): CLE#1 = D1 + D3 = 600, due 02-09 > D, so it goes in **Not due 600**. CLE#2 = 0, skipped. CLE#3 is posted after D, so it is excluded. Total 600 = `Net Change` up to 01-31 (D1..D4). This is what Report 120 shows. Report 4402 (Excel) would **omit** CLE#1 here, because its due date 02-09 is after D and that report filters `Due Date` to `[earliest period start, D]` (`AARX:354`). (verified-corrected)
- As of 2026-02-28: CLE#1 = 0, so there is nothing to age.
- Variant without PMT-002, as of 2026-03-15: 600 is 34 days overdue. With 30-day buckets it falls in **31–60**. In Report 120, the bucket for 02-09 is 01-15..02-13, labelled "31 - 60 days" (`AAR:858-891`).

### 6.5 Unapply (LIFO)
- Unapplying PMT-001 first fails, because CLE#1's latest application is PMT-002's transaction (R-29).
- Unapply PMT-002 on 2026-02-06. D8: CLE#1 Application +600 (`Unapplied` = true, `Unapplied by` = D6). D9: CLE#3 Application −600 (`Unapplied by` = D7). D6 and D7 are flagged `Unapplied` = true. CLE#1 is reopened (Remaining 600) and CLE#3 is reopened (Remaining −600). **G/L: none** (Σ = 0). The transaction no. on D8/D9 is 0 and `Application No.` = 8.

### 6.6 Payment discount 2% (summary only; SKIP v1)
Invoice 1,100 with a possible discount of 22. Payment of 1,078 on or before the discount date. Dtl rows: CLE#2 Initial −1,078; CLE#2 Payment Discount −22; CLE#1 Application −1,100; CLE#2 Application +1,100.

| Account | Debit | Credit |
|---|---:|---:|
| 1110 Bank | 1,078 | |
| 5190 Sales discounts | 22 | |
| 1200 AR | | 1,100 |

(VAT is not adjusted unless `Adjust for Payment Disc.` is set.)

### 6.7 FCY invoice and realized gain (export, 0% VAT)
Invoice USD 100 at 3,400 = 340,000 MNT. Payment USD 100 at 3,450 = 345,000 MNT. Dtl rows on the payment CLE: Initial (−100 USD / −345,000), Realized Gain (0 / +5,000), Application (+100 / +340,000). On the invoice CLE: Application (−100 / −340,000). The AR posting = −345,000 + 5,000 + 340,000 − 340,000 = −340,000.

| Account | Debit | Credit |
|---|---:|---:|
| 1110 Bank (USD) | 345,000 | |
| 1200 AR | | 340,000 |
| 8500 FX gain | | 5,000 |

### 6.8 Vendor side (sign mirror)
Purchase invoice 1,000 + VAT 100. VLE#10 Initial **−1,100** (Positive = false). `Vendor.Balance` = −Σ = **+1,100**. Payment +1,100 applied: VLE#10 Application +1,100, VLE#11 Initial +1,100, VLE#11 Application −1,100.

| Posting | Account | Debit | Credit |
|---|---|---:|---:|
| Invoice | 7200 Expense (or 1400 Inventory) | 1,000 | |
| | 1300 VAT receivable | 100 | |
| | 2100 AP | | 1,100 |
| Payment | 2100 AP | 1,100 | |
| | 1110 Bank | | 1,100 |

---

## 7. Simplifications for the micro-business system

1. **One schema for both parties**: `party_ledger_entry(id, party_type{C,V}, party_id, doc_type, doc_no, posting_date, document_date, due_date, currency, positive, open, closed_at, closed_by_entry_id, posting_group, transaction_id, reversed…)` + `party_ledger_detail(id, entry_id, type, posting_date, doc_type, doc_no, amount, amount_lcy, application_id, applied_entry_id, unapplied, unapplied_by_id, transaction_id)`. Keep BC signs (debit +). Use a vendor view for the negated display.
2. **Detail types for v1**: `INITIAL`, `APPLICATION`, `REALIZED_GAIN`, `REALIZED_LOSS`, `UNREALIZED_GAIN`, `UNREALIZED_LOSS`, `CORRECTION` (the last 5 only if FCY is on). Reserve `PMT_DISCOUNT` and `APPLN_ROUNDING`.
3. **Remaining amount**: computed with `SUM()`. Optionally cache it on the header and update it in the same transaction, with a nightly consistency check (Σ detail = cached, Σ party details = AR/AP G/L by posting group).
4. **Application UI**: (a) "Pay invoice X" = Applies-to Doc. No. (b) "Allocate payment" = a list of open opposite-sign entries with an editable *amount to apply*, stored on a transient `application_draft` table instead of on the ledger rows. This avoids BC's per-user `Applies-to ID` locking problem.
5. **Allocation order**: user selection, else oldest due date first, then entry id. Opposite-sign candidates only. Applied = min(|remaining payment|, |amount to apply or remaining invoice|).
6. **Application date** = max(posting dates). Forbid application dates in closed periods.
7. **Unapply**: LIFO per entry, whole application at once, mirror rows, no G/L in MNT. "Reverse document" requires unapply first.
8. **Drop**: payment tolerance, payment-discount tolerance, cross-currency application, `Excluded from calculation` (Spanish Cartera field), additional reporting currency, `On Hold`, reminder levels, interest calculation, IC, SEPA/direct debit, dispute status, multiple posting groups per customer.
9. **Aging**: one SQL function `aging(as_of, basis∈{due,posting,document}, buckets=[0,30,60,90])` using `days = as_of − basis_date`. Buckets: Not due (≤0), 1–30, 31–60, 61–90, >90. Remaining = SUM details ≤ as_of.
   - (verified-corrected) This is **one day off from BC**. In Report 120, "Not due" = due date > D. The first overdue bucket is due date in `[D−29, D]`, i.e. days 0–29, with the label "1 - 30 days", because the label is `D − date + 1` (`AAR:858-898`). So BC puts an invoice due **today** in "1–30", and an invoice exactly 30 days overdue in "31–60". Choose one convention on purpose and test it at the boundaries.

---

## 8. Pitfalls / edge cases

- **Zero-amount documents** still need an Initial row (R-03), otherwise `Original Amount` and the history break.
- **Same-sign application** must be blocked (`TestField(Positive, not New.Positive)`) unless you implement R-15.
- **Partial payments never close the invoice**. Only `remaining = 0` closes it. Do not close on "payment amount ≥ invoice amount" without checking the sign.
- **Overpayment**: the payment stays open with a negative remaining (customer credit). That credit must show in the balance and in aging as a negative amount. In BC, a payment/refund journal line gets `Due Date := Document Date` (`BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:1253-1254`). So in due-date aging an unapplied payment lands in the overdue bucket of its payment date, not in "Not due". Decide explicitly whether credits get their own column. (verified-corrected)
- **Application date ≠ payment date** when the invoice was posted later: aging as of a date between the two must still show both entries open.
- **Aging must use detailed posting dates**, not header `Open`/`Closed at`. An entry that is closed today may have been open at D (`AAR:201-239` exists for this).
- **Balance Due ignores posting date**. If you want an "as of" overdue balance, add `posting_date ≤ D` yourself.
- **Changing a due date** must update every place aging reads (BC rewrites the detailed rows, `EDIT:45`).
- **LIFO unapply** spans *all* entries in the application. A payment that settled 3 invoices blocks unapply of an earlier payment on any of them. In BC this holds only when the blocking application has `Transaction No. ≠ 0`. A later posted-entries application in LCY (transaction 0) does **not** block it (R-29). The micro-ERP should block in both cases. (verified-corrected)
- **Transaction No. 0**: applications without G/L must still be groupable (`application_id`), or unapply cannot find the set.
- **Concurrency**: BC locks the detailed and header tables before computing entry numbers (`GJPL:1284-1285`). Use DB sequences and row locks on the entries being applied (`SELECT … FOR UPDATE`) to prevent double application.
- **Reversal vs unapply**: storno of an applied document must fail until it is unapplied (R-32).
- **Rounding**: never derive MNT application amounts by percentage. Move stored amounts only. FCY needs the correction row (R-26), or residual LCY "ghost" balances appear on closed entries.
- **Vendor display**: store negative and display positive. Mixing the two conventions in the API is the most common source of AP errors.
- **Applies-to tags left behind** after a cancelled apply page block the next user. When the page closes without posting, BC clears `Applies-to ID` and `Amount to Apply` only on the **applying** entry, and only if no custom ID was set (`ACE:732-742`, via `Cust. Entry-Edit`). `CEAPE:566-569` only resets the in-memory record. Tags on the *target* entries stay with the user's ID until that user untags them. Partially applied targets also keep their tag after posting (R-23). (verified-corrected) Prefer draft tables.

---

## 9. Open questions

1. Is FCY (USD/CNY) receivables/payables in v1 scope? This decides whether R-24…R-26 are MUST.
2. Do we need early-payment discounts at all, for some customers (wholesale)? If yes, VAT treatment of the discount under MN VAT law (credit note/eBarimt return?) must be defined first.
3. Should prepayments (урьдчилгаа) be modeled as open payment entries applied later (BC way), or as a separate liability account (2500)? This affects the VAT timing with eBarimt.
4. Aging buckets: fixed 30/60/90 or configurable? Is a bad-debt allowance (1250) computed from aging buckets required by the MN close checklist?
5. Should unapply be allowed across closed periods (BC allows it if the posting date is open), or must the unapply date fall in the period of the application?
6. Netting customer vs vendor balances of the same counterparty (contra): needed? BC requires a journal; not covered here.

---

## Verification log

I checked every claim below against the AL source. Paths use the aliases from the top of this note, and `GJL` = `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al`. I recomputed every worked example. All of them balance (debits = credits), and their detailed-row sums match the AR postings.

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| R-01 Header Amount/Remaining/Original are FlowFields over detailed rows with Date Filter | corrected (Remaining and Balance also filter `Excluded from calculation = false`) | `CLE:129-155, 175-180, 670-681`; `CUST:733, 749` |
| R-02 `Ledger Entry Amount` = not (Application or Appln. Rounding), set on insert | confirmed | `DCLE:449-452, 511-522` |
| Enum 379 values 1–17 (0 = blank) | confirmed | `ENUM:24-92` |
| R-03 Initial row even at 0; `Open`/`Positive` from remaining | confirmed | `GJPL:1302-1309`; `DBUF:501-507` |
| R-04 Merge key for buffered detailed rows | confirmed | `DBUF:523-565` |
| R-05 Debit/Credit split with Correction swap; unapply negates the split | confirmed | `DCLE:470-487`; `GJPL:6661-6673` |
| R-06 Header inserted after the application; apply fields cleared | confirmed | `GJPL:1333-1349` |
| R-07 Receivables G/L = Σ Amount (LCY) of all rows; special rows posted with opposite sign | confirmed | `GJPL:4161-4180, 7752-7775, 7807-7832, 5451, 5482-5520` |
| R-08 Transaction No. 0 and Application No. = first entry no. | confirmed (+ added: a document posting always writes a G/L entry, even a zero one) | `DCLE:493-509`; `GJPL:1360-1362, 4000, 4006-4007, 6130-6131, 7831-7832` |
| R-09 Due Date change rewrites `Initial Entry Due Date` on all rows | confirmed | `EDIT:41-45`; `DBUF:647-656` |
| R-10 Edit whitelist, "amounts are never edited" | corrected (pmt-disc/tolerance header amounts are editable; closed entries allow only a few fields) | `EDIT:39-66` |
| R-11 Application gating (Amount to Apply ≠ 0 and a method) | confirmed | `GJPL:3776-3786` |
| R-12 Applies-to Doc. No.: open target, opposite sign, one target | confirmed (+ added: a stale `Amount to Apply` on the target caps the application) | `GJPL:4030-4058, 3393-3405, 3912-3913` |
| R-13 Applies-to ID candidates, Apply to Oldest filter, sort key | confirmed | `GJPL:4059-4092`; `CLE:1099` |
| R-14 Tagging defaults Amount to Apply; same-sign and ≤ remaining check | confirmed | `SETID:61-95`; `CLE:783-805, 1591-1599` |
| R-15 Mixed-sign candidates are "fully consumed" | corrected (consumed by Amount to Apply or Remaining, not capped by the new entry) | `GJPL:3377-3389, 4094-4115, 3914-3922` |
| R-16 Application date = max of posting dates; UI earlier-date block | confirmed | `GJPL:4052-4053, 4086-4087, 3798`; `CEAPE:105-112, 126-146`; `ACE:1050-1058` |
| R-17 `Appln. between Currencies = None` means the same currency only | confirmed | `GJA:281-349`; `GJPL:4077-4078` |
| R-18 PostApply step order | confirmed | `GJPL:5870-5958` |
| R-19 Applied amount formula | corrected (sign-filter case has no ABSMin) | `GJPL:3377-3407`; `GJPL:7236-7241` |
| R-20 AppliedAmountLCY = Round(Applied / Old.OrigFactor) | confirmed | `GJPL:3415-3417` |
| R-21 Two Application rows; Applied CV entry = new entry | confirmed | `GJPL:3541-3566`; `DBUF:673-685` |
| R-22 Closed-by rules | corrected (`AllApplied` flag stays false once set) | `GJPL:3555-3579, 3780` |
| R-23 Tag clearing and loop end | corrected (partial candidates keep the tag and a residual Amount to Apply) | `GJPL:3820-3832, 3902-3929`; `DBUF:570` |
| R-24 Realized G/L formula, row type and G/L sign | confirmed | `GJPL:3510-3522, 5451` |
| R-25 Unrealized reversal pro rata | confirmed | `GJPL:3466-3494`; `DCLE:529-536` |
| R-26 Correction of Remaining Amount to the rounding accounts | confirmed | `GJPL:3598-3615`; `GJPL:4270-4271` |
| R-27 Pmt-disc validity "until Pmt. Discount Date (+grace)" | corrected (the payment posting date must be ≤ the discount date; grace only affects the tolerance date) | `PTM:2131-2138`; `GJPL:2628-2647, 2664, 2761, 2788-2791` |
| R-28 Only the latest non-unapplied Application row can be unapplied | confirmed | `CEAPE:236-253, 279-291` |
| R-29 Strict cross-entry LIFO | corrected (skipped for Transaction No. 0; such applications are invisible to the check) | `CEAPE:255-276, 411-412, 596-612, 713-729` |
| R-30 Unapply refusals (reversed, date window, before application date) | confirmed | `CEAPE:389-390, 468-478, 498-506` |
| R-31 Unapply mirror rows, flags, header reopen, G/L = Σ LCY | confirmed | `GJPL:6014-6135, 6661-6686, 6878-6900, 7777-7802` |
| R-32 Reversal blocked while non-initial, non-unapplied rows exist | confirmed | `REV:816-830` |
| R-33 Customer/vendor balance FlowFields; vendor "all negated" | corrected (vendor Pmt. Discounts (LCY) is not negated) | `CUST:722-856`; `VEND:478-530, 558-570` |
| R-34 Aging candidates = Posting Date ≤ D | corrected (Report 120 re-dates entries posted after D; Report 4402 drops not-due and older entries) | `AAR:240-262, 446-461`; `AARX:346-359` |
| §4.4 steps 2–3 candidate collection | corrected | `AAR:201-262, 440-498` |
| §6.1–6.2 invoice and partial payment rows, closed-by (= 1, −500) | confirmed (1,100 = 1,000 + 100; AR −500) | `GJPL:3407, 3541-3579` |
| §6.3 second payment, both closed, CLE#3 Closed by = 0 | corrected (application method was missing; numbers confirmed) | `GJPL:3571-3579` |
| §6.4 aging as of 01-31 = Not due 600; 34 days → 31–60 | corrected (holds for Report 120; Report 4402 omits it) | `AAR:858-891`; `AARX:354` |
| §6.5 unapply mirror D8/D9, no G/L, Transaction No. 0, Application No. 8 | confirmed | `GJPL:6080-6131`; `DCLE:493-509`; `CEAPE:713-729` |
| §6.6 pmt-disc rows and G/L (1,078 + 22 = 1,100) | confirmed | `GJPL:2761, 2788-2791, 5482-5487`; `PTM:2131-2138` |
| §6.7 FCY realized gain (−345,000 + 5,000 + 340,000 − 340,000 = −340,000; Dr 345,000 = Cr 340,000 + 5,000) | confirmed | `GJPL:3416, 3510, 5451` |
| §6.8 vendor sign mirror (Dr 1,000 + 100 = Cr 1,100) | confirmed | `VEND:478-500` |
| §5 "payments do not reduce Remaining Pmt. Disc. Possible" | confirmed | `PTM:2001-2027` |
| §7.9 bucket boundaries (Not due ≤ 0, 1–30) | corrected (BC is one day off: due today goes in "1–30") | `AAR:858-898` |
| §8 overpayment usually in "Not due" | corrected (BC payment Due Date = Document Date, so it is aged as overdue) | `GJL:1252-1254` |
| §8 "BC clears the ID when it closes the page" | refuted (only the applying entry is cleared; target tags persist) | `ACE:732-742`; `CEAPE:566-569` |
| Object IDs (T21/25/92/379/380/382/383/579, CU12/101/103/225/226/227/426/763, R120/R4402) | confirmed | object headers of each file |
| Report 120 obsolete since 28.0 | confirmed | `AAR:22-28` |
