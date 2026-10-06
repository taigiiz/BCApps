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
- **Unapply** is strictly LIFO per entry. It mirrors all detailed rows of the application transaction (negated, `Unapplied = true`) and reopens the header entries (`GJPL:5962-6136`, `CEAPE:279-291, 713-729`).
- **Customer balance** = Σ detailed `Amount` (no type filter, so applications net out). **Balance Due** = the same sum filtered by the denormalized `Initial Entry Due Date` (`CUST:725-890`). Vendor FlowFields use the same sums **negated** (`VEND:478-500`).
- **Aging as of date D** = for each entry with `Posting Date ≤ D`, Σ detailed amounts with `Posting Date ≤ D`, bucketed by due date (or posting/document date) relative to D (`AAR:440-523, 853-876`; `AARX:341-367`).
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
- **R-SUBLEDGERS-APPLICATION-01**: Header amounts are derived from detailed rows. `Remaining Amount` = Σ dtl.Amount (all types) for the entry; `Amount` = Σ dtl.Amount where `Ledger Entry Amount = true`; `Original Amount` = Σ dtl.Amount where type = Initial Entry. All of them honour `Date Filter` on the detailed `Posting Date`. *Src:* `CLE:129-200, 670-681`. *Keep:* MUST. *Notes:* store `remaining_amount` on the header as a cache only if it is updated in the same DB transaction. The sum is the source of truth.
- **R-SUBLEDGERS-APPLICATION-02**: `Ledger Entry Amount := not (Entry Type in [Application, Appln. Rounding])`, set on insert. So payment discount, FX gain/loss and the correction rows change an entry's `Amount`, while applications only change `Remaining Amount`. *Src:* `DCLE:449-452, 511-522`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-03**: When a document is posted, exactly one Initial Entry row is created **even when the amount is 0** (`InsertZeroAmout = true`). That row sets `Original Amount`. Then `Open := Remaining ≠ 0` and `Positive := Remaining > 0`. *Src:* `GJPL:1307-1309`; `DBUF:501-507, 575-578`. *Keep:* MUST. *Notes:* `Positive` never changes later. It is the "side" of the document.
- **R-SUBLEDGERS-APPLICATION-04**: Detailed rows of one posting are **merged** when they share CV entry, entry type, posting date, document type and no., party, and gen/VAT posting groups. Their amounts are summed into one row. *Src:* `DBUF:523-565`. *Keep:* SHOULD (merge per entry+type within a transaction).
- **R-SUBLEDGERS-APPLICATION-05**: `Debit/Credit Amount` on a detailed row = the sign of `Amount`, swapped when `Correction` is set (storno). Unapply rows copy the original split and negate it, so they produce negative debit/credit values. *Src:* `DCLE:470-487`; `GJPL:6661-6673`. *Keep:* SHOULD (only if storno presentation is required, otherwise derive from the sign).
- **R-SUBLEDGERS-APPLICATION-06**: The header row is written **after** the application has been computed in the buffer, so its status fields (`Open`, `Closed by …`) are already final at insert. `Amount to Apply`, `Applies-to Doc. No.` and `Applies-to ID` are cleared on the new entry. *Src:* `GJPL:1333-1349`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-07**: The receivables G/L entry is the **sum of `Amount (LCY)` of all detailed rows of the posting** (per dimension set), posted to the customer posting group's receivables account. Application rows cancel out. Gain/loss, discount and rounding rows are booked to their own accounts with the opposite sign. *Src:* `GJPL:4133-4195` (UpdateTotalAmounts per row, then CreateGLEntriesForTotalAmounts), `7752-7830`, `5419-5530`. *Keep:* MUST. *Notes:* this is the invariant **Σ detailed Amount (LCY) for a customer = that customer's share of the AR G/L balance**.
- **R-SUBLEDGERS-APPLICATION-08**: If a posting creates detailed rows but **no G/L entries**, those rows get `Transaction No. = 0`, and `Application No.` = the first detailed `Entry No.` of the set. This happens when two posted LCY entries are applied to each other. *Src:* `DCLE:493-509`; `GJPL:1360-1362, 4006-4007, 6130-6131`. *Keep:* MUST (as an explicit `application_id` on every application row, always set).
- **R-SUBLEDGERS-APPLICATION-09**: Each detailed row denormalizes `Initial Entry Due Date`, `Initial Document Type`, `Initial Entry Global Dim 1/2` and `Posting Group` from its header. Balance-due and aging sums can then run on one table. Changing `Due Date` on an open entry rewrites `Initial Entry Due Date` on **all** its detailed rows. *Src:* `DBUF:647-656`; `EDIT:41-45`. *Keep:* MUST (or join to the header in SQL; then drop the denormalization).
- **R-SUBLEDGERS-APPLICATION-10**: On a posted entry only a whitelist of fields can be edited: due/discount dates, `Applies-to ID`, `Amount to Apply`, on-hold flag, description and payment references. Due/discount dates require `Open = true`. Amounts are never edited. *Src:* `EDIT:23-73`; `CLE:350-385, 451-462`. *Keep:* MUST.

### Choosing what to apply
- **R-SUBLEDGERS-APPLICATION-11**: Application runs only if the new entry has `Amount to Apply ≠ 0` and at least one of these holds: `Applies-to Doc. No.` is set, `Applies-to ID` is set, or (customer `Application Method = Apply to Oldest` and the line has `Allow Application`). *Src:* `GJPL:3776-3786`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-12**: **Applies-to Doc. No.** method: find the *open* entry of that customer with that doc type and no. The target must have the **opposite sign** (`TestField(Positive, not New.Positive)`), and the currency must be compatible. Exactly one target is applied, then the loop stops. *Src:* `GJPL:4031-4058`, `3912-3913`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-13**: **Applies-to ID** method: the candidates are all open entries of the customer with the same `Applies-to ID`, excluding the new entry itself. With the Manual method only entries with `Amount to Apply ≠ 0` qualify. With Apply to Oldest the blank ID matches every untagged open entry with `Posting Date ≤` the payment date. Candidates are sorted by `Customer No., Applies-to ID, Open, Positive, Due Date` (then Entry No.). *Src:* `GJPL:4059-4092`; key `CLE:1099`. *Keep:* MUST (manual), SHOULD (oldest).
- **R-SUBLEDGERS-APPLICATION-14**: Tagging an entry with an Applies-to ID defaults its `Amount to Apply` to its full `Remaining Amount`. Untagging resets it to 0. `Amount to Apply` must have the same sign as `Remaining Amount`, and its absolute value cannot be larger. *Src:* `SETID:61-95`; `CLE:783-805, 1591-1599`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-15**: Mixed-sign candidate sets. If candidates of the **same** sign as the new entry exist, BC computes the net of new + all candidates (net of pmt discounts). It then first processes, and **fully consumes**, the candidates whose sign is opposite to that net. The leftover side is applied only while the signs still allow it. *Src:* `GJPL:4094-4115`, `3377-3384`, `3914-3922`. *Keep:* SHOULD (simplify: v1 allows only opposite-sign candidates).
- **R-SUBLEDGERS-APPLICATION-16**: Application date = max(new entry posting date, posting dates of the targets). For Applies-to ID, only tagged targets count. All Application rows carry that date. Posting an application of already-posted entries before the latest posting date in the set is refused. In the UI, a journal payment cannot be applied to a document posted later than itself. *Src:* `GJPL:4052-4053, 4086-4087, 3798`; `CEAPE:105-112, 126-146`; `ACE:1050-1058`. *Keep:* MUST. *Notes:* this keeps aging consistent: nothing is settled before it exists.
- **R-SUBLEDGERS-APPLICATION-17**: Currencies: with `Appln. between Currencies = None` (the default), every entry in one application must have the same currency. *Src:* `GJA:281-349`; `GJPL:4077-4078`. *Keep:* MUST (v1: same currency only).

### Application algorithm
- **R-SUBLEDGERS-APPLICATION-18**: Per pair, in this order: payment tolerance → payment discount → pmt-disc tolerance → currency appln rounding → **FindAmtForAppln** → unrealized G/L reversal on old → realized G/L on new and old → **CalcApplication** → remaining pmt disc → LCY correction on old. *Src:* `GJPL:5870-5958`. *Keep:* MUST (the bold steps plus the FX steps), SKIP (tolerances).
- **R-SUBLEDGERS-APPLICATION-19**: Applied amount (in the new entry's currency, signed like the **old** entry's reduction): without a sign filter it is `ABSMin(New.Remaining, -Old.AmountToApply)` if Old.AmountToApply ≠ 0, else `ABSMin(New.Remaining, -Old.Remaining)`. When a sign filter is active (R-15), the old entry is consumed fully. When the payment covers remaining − discount, the old entry is closed fully. *Src:* `GJPL:3366-3409`; `ABSMin` `GJPL:7236-7241`. *Keep:* MUST. *Notes:* this is what makes partial payments work: the smaller absolute amount wins.
- **R-SUBLEDGERS-APPLICATION-20**: LCY value of the application = `Round(AppliedAmount / Old."Original Currency Factor")`. For LCY entries the factor is 1. *Src:* `GJPL:3415-3417`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-21**: CalcApplication writes the old entry's `Application` row with (`OldAppliedAmount`, `AppliedAmountLCY`) and the new entry's with (`−AppliedAmount`, `−AppliedAmountLCY`). Both rows have `Applied CV Ledger Entry No.` = **new** entry no. *Src:* `GJPL:3541-3565`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-22**: Closing. Each entry's `Open := Remaining ≠ 0`. If the **old** entry closes, it gets `Closed by Entry No. = new`, `Closed at Date = application date` and `Closed by Amount = −OldAppliedAmount`. If the **new** entry closes while the old one stays open, the new entry gets `Closed by Entry No. = old`. If both close in the same pair, only the old one points to the new one, and the new one gets only `Closed at Date`. *Src:* `GJPL:3550-3579`. *Keep:* SHOULD (`closed_at` MUST; `closed_by` is informational, use the application rows for navigation).
- **R-SUBLEDGERS-APPLICATION-23**: Loop termination: Applies-to Doc. No. stops after one target. Otherwise the loop continues while the new entry is still open and candidates remain. A candidate with `Applies-to ID` but zero `Amount to Apply` after the run gets its ID cleared. A partially applied candidate keeps its tag in a temporary list. *Src:* `GJPL:3902-3929, 3820-3832`. *Keep:* MUST (clear tags after posting).

### FX, rounding and discount (summary)
- **R-SUBLEDGERS-APPLICATION-24**: Realized gain/loss (on each FCY entry) = `AppliedAmountLCY − Round(AppliedAmount / entry."Original Currency Factor")`. If > 0 it is a Realized Gain row, if < 0 a Realized Loss row, with FCY amount 0. The G/L posting is `−Amount(LCY)` to the currency's gain/loss account. *Src:* `GJPL:3496-3522, 5442-5452`. *Keep:* SHOULD (MUST if FCY is in v1).
- **R-SUBLEDGERS-APPLICATION-25**: Unrealized gain/loss from earlier revaluations is reversed **pro rata** on application: `Round(Σ unrealized LCY × |applied / remaining before|)`, posted with the opposite sign. *Src:* `GJPL:3449-3494`; `DCLE:529-536`. *Keep:* SHOULD (needed with the month-end revaluation required by MN rules, see `mn-accounting.md`).
- **R-SUBLEDGERS-APPLICATION-26**: Correction of Remaining Amount. For FCY entries, if `Round(Remaining FCY / Adjusted Currency Factor) ≠ Remaining LCY`, the difference is posted as a correction row to the posting group's Debit/Credit Rounding account. This keeps the residual LCY balance zero when the FCY balance is zero. *Src:* `GJPL:3598-3615, 4270-4271`. *Keep:* SHOULD.
- **R-SUBLEDGERS-APPLICATION-27**: Payment discount. The possible discount is fixed at invoice posting as `Round(base × Payment Discount % / 100)` (base = incl. VAT unless `Pmt. Disc. Excl. VAT`), valid until `Pmt. Discount Date` (+grace). It is granted only when a **Payment/Refund** applied on or before that date covers `Remaining − RemainingPmtDiscPossible`. It is posted as a `Payment Discount` row **on the payment (new) entry**, `PmtDisc = −RemainingPmtDiscPossible`, to the posting group's pmt-disc account. *Src:* `GJPL:2617-2651, 2726-2793, 4260-4261`; `PTM:2121-2159`. *Keep:* SKIP in v1 (rare for MN micro businesses). Reserve the entry type.

### Unapply and reversal
- **R-SUBLEDGERS-APPLICATION-28**: Only an `Application` row that is not yet `Unapplied` can be unapplied, and only the **latest** such row on that entry (highest Entry No.). *Src:* `CEAPE:236-253, 279-291`; `GJPL:6010, 6032`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-29**: Every entry touched by the application must have that application as its **latest transaction**. That means its latest application transaction, and its latest non-unrealized detailed transaction, must be this one. Otherwise: "unapply all application entries … posted after this entry first". *Src:* `CEAPE:255-276, 596-612, 713-729`. *Keep:* MUST. *Notes:* strict LIFO stops the remaining amounts from ever becoming inconsistent with the order of history.
- **R-SUBLEDGERS-APPLICATION-30**: Unapply is refused if the entry is `Reversed` (`CEAPE:498-506`), if the posting date is outside the allowed window (`CEAPE:468-478`), or if it is earlier than the application's posting date (`CEAPE:389-390`). *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-31**: Unapply takes **all** non-initial rows of the application transaction for that customer, selected by `Transaction No.`, or by `Application No.` when the transaction no. is 0. These include the discount, gain/loss and rounding rows. It inserts a mirror row for each one (negated amounts, posting date = unapply date, new transaction, `Unapplied = true`, `Unapplied by Entry No.` = original), flags the original the same way, and reopens the header (clears `Closed by …`, restores `Remaining Pmt. Disc. Possible` and `Max. Payment Tolerance` from the snapshot on the row). Receivables G/L = Σ mirrored LCY. In single currency that sum is 0, so no AR G/L entry. *Src:* `GJPL:6014-6026, 6070-6135, 6661-6686, 6878-6906, 7777-7802`. *Keep:* MUST.
- **R-SUBLEDGERS-APPLICATION-32**: Reversing (storno) a posted transaction requires its ledger entries to have **no non-unapplied rows other than Initial Entry**. So you unapply first, then reverse. *Src:* `REV:816-846`. *Keep:* MUST.

### Balances and aging
- **R-SUBLEDGERS-APPLICATION-33**: `Customer.Balance(LCY)` = Σ dtl.Amount(LCY) for the customer. `Net Change` = the same with `Posting Date` in the date filter. `Balance Due(LCY)` = the same with `Initial Entry Due Date ≤ upper bound of the date filter`, **without** a posting-date filter. `Pmt. Discounts (LCY)` = −Σ of the discount types. *Src:* `CUST:725-890, 841-856`. Vendor: the same sums **negated** (`VEND:478-500`). *Keep:* MUST (Balance, Net Change, Balance Due as of date).
- **R-SUBLEDGERS-APPLICATION-34**: Aging as of D. Candidates are the entries with `Posting Date ≤ D`. Remaining as of D = Σ dtl rows of the entry with `Posting Date ≤ D`, and zero results are skipped. The bucket is chosen by Due Date (default), Posting Date or Document Date against periods counted back from D. *Src:* `AAR:201-261, 429-523, 853-876, 931-938`; `AARX:341-367` (`Remaining Amt. (LCY)` with `Date Filter = ..D`). *Keep:* MUST.

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
2. Check the posting date window and the date ≥ application date. Check that no entry is reversed. Apply the LIFO checks to every row of that application (`CEAPE:385-413`).
3. Select the rows by Transaction No. (or Application No.), with type > Initial Entry (`GJPL:6014-6026`).
4. For each: insert the mirror row, accumulate LCY, post the special accounts, flag the original, and reopen the header (`6070-6118`).
5. Post Σ LCY to receivables (0 in single currency), stamp the transaction, finish (`6121-6135`).
6. Re-run the exchange-rate adjustment for the affected FCY entries (`CEAPE:440, 455-466`).

### 4.4 Aging report (as of D) — `AAR`
1. Compute the buckets (`853-876`). For due-date aging: bucket 1 = (D+1 … ∞) "Not due". Then 3 buckets of `PeriodLength` going back from D. The last bucket is open-ended ("Before …").
2. Collect the candidates: open entries, plus entries closed by entries posted after D (`201-261`).
3. For each candidate, sum the detailed rows dated ≤ D, and skip zero (`440-498`).
4. Find the bucket index by due date (or posting/document date), and add to the customer, currency and grand totals (`500-523`).

---

## 5. Calculations & rounding

| Quantity | Formula | Rounding | Source |
|---|---|---|---|
| Remaining (as of D) | Σ dtl.Amount, `posting_date ≤ D` | none (stored values are already rounded) | `CLE:144-155` |
| Applied amount | `ABSMin(New.Rem, −Old.AmtToApply or −Old.Rem)` | none (amounts are already rounded) | `GJPL:3377-3407` |
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

### 6.3 Second payment 600 (PMT-002, 2026-02-05)
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
- As of **2026-01-31** (due-date aging): CLE#1 = D1 + D3 = 600, due 02-09 > D, so it goes in **Not due 600**. CLE#2 = 0, skipped. CLE#3 is posted after D, so it is excluded. Total 600 = `Net Change` up to 01-31 (D1..D4).
- As of 2026-02-28: CLE#1 = 0, so there is nothing to age.
- Variant without PMT-002, as of 2026-03-15: 600 is 34 days overdue. With 30-day buckets it falls in **31–60**.

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

---

## 8. Pitfalls / edge cases

- **Zero-amount documents** still need an Initial row (R-03), otherwise `Original Amount` and the history break.
- **Same-sign application** must be blocked (`TestField(Positive, not New.Positive)`) unless you implement R-15.
- **Partial payments never close the invoice**. Only `remaining = 0` closes it. Do not close on "payment amount ≥ invoice amount" without checking the sign.
- **Overpayment**: the payment stays open with a negative remaining (customer credit). That credit must show in the balance and in aging (as a negative amount, usually in "Not due" or its own column).
- **Application date ≠ payment date** when the invoice was posted later: aging as of a date between the two must still show both entries open.
- **Aging must use detailed posting dates**, not header `Open`/`Closed at`. An entry that is closed today may have been open at D (`AAR:201-239` exists for this).
- **Balance Due ignores posting date**. If you want an "as of" overdue balance, add `posting_date ≤ D` yourself.
- **Changing a due date** must update every place aging reads (BC rewrites the detailed rows, `EDIT:45`).
- **LIFO unapply** spans *all* entries in the application. A payment that settled 3 invoices blocks unapply of an earlier payment on any of them.
- **Transaction No. 0**: applications without G/L must still be groupable (`application_id`), or unapply cannot find the set.
- **Concurrency**: BC locks the detailed and header tables before computing entry numbers (`GJPL:1284-1285`). Use DB sequences and row locks on the entries being applied (`SELECT … FOR UPDATE`) to prevent double application.
- **Reversal vs unapply**: storno of an applied document must fail until it is unapplied (R-32).
- **Rounding**: never derive MNT application amounts by percentage. Move stored amounts only. FCY needs the correction row (R-26), or residual LCY "ghost" balances appear on closed entries.
- **Vendor display**: store negative and display positive. Mixing the two conventions in the API is the most common source of AP errors.
- **Applies-to tags left behind** after a cancelled apply page block the next user. BC clears the ID when it closes the page (`CEAPE:566-569`). Prefer draft tables.

---

## 9. Open questions

1. Is FCY (USD/CNY) receivables/payables in v1 scope? This decides whether R-24…R-26 are MUST.
2. Do we need early-payment discounts at all, for some customers (wholesale)? If yes, VAT treatment of the discount under MN VAT law (credit note/eBarimt return?) must be defined first.
3. Should prepayments (урьдчилгаа) be modeled as open payment entries applied later (BC way), or as a separate liability account (2500)? This affects the VAT timing with eBarimt.
4. Aging buckets: fixed 30/60/90 or configurable? Is a bad-debt allowance (1250) computed from aging buckets required by the MN close checklist?
5. Should unapply be allowed across closed periods (BC allows it if the posting date is open), or must the unapply date fall in the period of the application?
6. Netting customer vs vendor balances of the same counterparty (contra): needed? BC requires a journal; not covered here.
