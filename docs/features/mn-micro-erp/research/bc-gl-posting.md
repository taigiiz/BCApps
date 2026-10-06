# BC research: General Ledger core, journals and posting engine (incl. reversal and preview)

- Source: BCApps (BC v29, W1 Base App, MIT). Read from the AL code, not from documentation.
- Path legend: unless a path starts with `src/`, it is relative to `src/Layers/W1/BaseApp/Finance/GeneralLedger/`. Other Base App paths are written as `BaseApp/...` = `src/Layers/W1/BaseApp/...`.
- Keep levels: **MUST** = needed in the micro-ERP v1, **SHOULD** = keep in a simpler form or add soon after v1, **SKIP** = leave out.
- Account numbers in the examples are made up for illustration. They are not the Mongolian standard chart of accounts.

---

## 1. Summary

- **Chart of accounts** (`G/L Account`, T15) has one flat table. Only `Account Type = Posting` accounts can hold entries. The `Heading`, `Total`, `Begin-Total` and `End-Total` types are for presentation and totals; totals are calculated as a filter over account numbers in `Totaling`.
- **Ledger** (`G/L Entry`, T17) is append-only. `Amount` is signed: debit is positive and credit is negative. `Debit Amount` and `Credit Amount` are derived from it, and the `Correction` flag (storno) changes which column is used. Every entry has a `Transaction No.` (one balanced set) and a `G/L Register No.` (one posting run).
- **Journals** have three levels: Template (T80, the type and its rules), Batch (T232, a named working set with defaults and number series) and Line (T81). One line can post both sides of a transaction through `Bal. Account No.`. Account types are G/L, Customer, Vendor, Bank Account, Fixed Asset, IC Partner, Employee and Allocation.
- **The pipeline is `Gen. Jnl.-Post` (CU231) → `Gen. Jnl.-Post Batch` (CU13) → `Gen. Jnl.-Check Line` (CU11) → `Gen. Jnl.-Post Line` (CU12).** The batch codeunit does three things in order: (1) checks every line, (2) checks the balance per document or per date, (3) posts the lines. Then it deletes the lines (or moves recurring lines forward) and commits once.
- **Balancing is enforced twice.** (a) Before posting, the batch checks that `Balance (LCY)` sums to zero for each group of Document Type + Document No. + Posting Date. (b) While posting, `FinishPosting` keeps a date-weighted checksum of the entries. If it is not zero, the table is marked inconsistent, and the database then refuses to commit.
- **Dates:** each posting date must be inside the allowed range. The range comes from the user, else the journal template, else G/L Setup. Closing dates (C-dates) are allowed only for G/L-to-G/L lines and only when the fiscal year is locked. Year-end closing entries are posted on a C-date.
- **Numbering:** the Entry No. and Transaction No. are taken from the last entry + 1 while holding a table lock (or from a database sequence when concurrent posting is on). A new Transaction No. starts whenever the document or date changes, or when the running balance returns to 0. One G/L Register is created per posting run.
- **Reversal** posts a mirror transaction with negated amounts on the **original posting date**, in a new transaction and a new register, using correction (storno) columns. It links the original and the mirror through `Reversed`, `Reversed by Entry No.` and `Reversed Entry No.`. Only journal-posted entries can be reversed, and only when they are unapplied, unreconciled and the VAT is not closed.
- **Preview** runs the real posting code with commit set to raise an error. It records the inserted ledger rows through event subscribers and then throws the error `Preview mode.`, which rolls everything back.
- **Recurring journals** (Fixed, Variable, Balance, each optionally Reversing) post repeatedly from the same lines and then move the posting date forward by `Recurring Frequency`. The reversing variants post an opposite entry the next day.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| G/L Account | Table 15 | Chart of accounts | `No.` Code[20] PK; `Name` Text[100]; `Account Type` Enum 16 {Posting, Heading, Total, Begin-Total, End-Total}; `Income/Balance` Enum 20 {Income Statement, Balance Sheet}; `Account Category` Enum; `Debit/Credit` Option {Both, Debit, Credit}; `Totaling` Text[250]; `Blocked` Bool; `Direct Posting` Bool (InitValue true); `Indentation` Int; `Gen. Posting Type`, `Gen./VAT Bus./Prod. Posting Group` Code[20]; FlowFields `Balance`, `Net Change`, `Balance at Date`, `Debit Amount`, `Credit Amount` | MUST |
| G/L Entry | Table 17 | Immutable ledger | `Entry No.` Int PK; `G/L Account No.` Code[20]; `Posting Date` Date (ClosingDates=true); `Document Type` Enum 6; `Document No.` Code[20]; `External Document No.` Code[35]; `Description` Text[100]; `Amount`, `Debit Amount`, `Credit Amount`, `VAT Amount` Decimal; `Bal. Account Type` Enum 81 / `Bal. Account No.` Code[20]; `Source Type` Enum 82 / `Source No.` Code[20]; `Transaction No.` Int; `G/L Register No.` Int; `Dimension Set ID` Int; `Global Dimension 1/2 Code` Code[20]; `Source Code` Code[10]; `Journal Templ. Name`/`Journal Batch Name` Code[10]; `User ID` Code[50]; `System-Created Entry`, `Prior-Year Entry`, `Reversed` Bool; `Reversed by Entry No.`, `Reversed Entry No.` Int; `Gen. Posting Type`; `VAT Bus./Prod. Posting Group`; `VAT Reporting Date`; `Additional-Currency Amount`, `Source Currency *` | MUST (SKIP the ACY, source-currency, IC, FA, job and prod-order fields) |
| G/L Register | Table 45 | One row per posting run (audit) | `No.` Int PK; `From/To Entry No.` Int; `From/To VAT Entry No.` Int; `Source Code`; `User ID`; `Journal Templ. Name`/`Journal Batch Name`; `Reversed` Bool; `SystemCreatedAt` | MUST |
| G/L Transaction | Table 57 | Maps a transaction to its register | `No.` Int PK (= Transaction No.); `G/L Register No.` Int | SHOULD (as a voucher header) |
| Gen. Journal Template | Table 80 | Journal type and its rules | `Name` Code[10]; `Type` Enum {General, Sales, Purchases, Cash Receipts, Payments, Assets, Intercompany, Jobs}; `Recurring` Bool; `Force Doc. Balance` Bool (InitValue true); `Source Code`; `Bal. Account Type/No.`; `No. Series`, `Posting No. Series`; `Allow Posting Date From/To` (+ DateFormula); `Copy to Posted Jnl. Lines`; `Increment Batch Name` | SHOULD (merge into batch) |
| Gen. Journal Batch | Table 232 | Named working set | PK (`Journal Template Name`, `Name`); `Bal. Account Type/No.`; `No. Series`; `Posting No. Series`; `Reason Code`; `Copy VAT Setup to Jnl. Lines`; `Suggest Balancing Amount` | MUST (as "journal") |
| Gen. Journal Line | Table 81 | Unposted line | PK (`Journal Template Name`, `Journal Batch Name`, `Line No.` Int); `Account Type` Enum 81 {G/L Account, Customer, Vendor, Bank Account, Fixed Asset, IC Partner, Employee, Allocation Account}; `Account No.`; `Bal. Account Type/No.`; `Posting Date`; `Document Date`; `Document Type`; `Document No.`; `External Document No.`; `Description`; `Currency Code`; `Amount`, `Debit Amount`, `Credit Amount`, `Amount (LCY)`, `Balance (LCY)`, `Currency Factor` Decimal; `Correction` Bool; `Gen. Posting Type`; `VAT %`, `VAT Amount`, `VAT Base Amount` (+ `Bal.` versions); `Dimension Set ID`; `Recurring Method` Enum 53; `Recurring Frequency` DateFormula; `Expiration Date`; `Reverse Date Calculation` DateFormula; `System-Created Entry`; `Allow Zero-Amount Posting` | MUST |
| General Ledger Setup | Table 98 | Single-row settings | `Allow Posting From/To` Date (+ DateFormula); `LCY Code`; `Amount Rounding Precision` (init 0.01); `VAT Rounding Type` {Nearest, Up, Down}; `Journal Templ. Name Mandatory`; `Additional Reporting Currency`; `Use Concurrent Posting`; `Posting Preview Type`; `Block Deletion of G/L Accounts`; `Allow G/L Acc. Deletion Before` | MUST (subset) |
| Accounting Period | Table 50 | Periods and fiscal years | `Starting Date` PK; `New Fiscal Year`; `Closed`; `Date Locked` | MUST |
| User Setup | Table 91 | Posting window per user | `User ID`; `Allow Posting From/To` | SHOULD |
| Reversal Entry | Table 179 | Temporary buffer for "Reverse transaction" | `Reversal Type` {Transaction, Register}; `Entry Type`; `Entry No.`; `Transaction No.`; `G/L Register No.`; amounts | SKIP as a table (compute it on the fly) |
| Posted Gen. Journal Line | Table 181 | Optional archive of posted journal lines | copies the T81 fields + `G/L Register No.` | SKIP (the ledger is the archive) |
| G/L Entry - VAT Entry Link | Table 253 | Links G/L entries to VAT entries (used by reversal) | `G/L Entry No.`, `VAT Entry No.` | MUST (as FK `vat_entry.gl_entry_id`) |
| Source Code (+ Setup) | Tables 230 / 242 | Tags the origin of an entry (GENJNL, SALES, REVERSAL, …) | `Code` Code[10] | SHOULD (enum) |
| Gen. Jnl. Allocation | Table 221 | Spreads recurring amounts across accounts | | SKIP |
| Engine codeunits | CU231 Post, CU13 Post Batch, CU11 Check Line, CU12 Post Line, CU366 Exchange Acc., CU19 Post Preview, CU179 Reversal-Post, CU17 Post Reverse | Behaviour | — | MUST (re-implement the logic, not the structure) |

---

## 3. Business rules

### Chart of accounts
- **R-GL-POSTING-01**: G/L entries can be created only on accounts with `Account Type = Posting` and `Blocked = false`. *Src:* `Account/GLAccount.Table.al:1305-1311` (CheckGLAcc), re-checked at posting in `Posting/GenJnlPostLine.Codeunit.al:2253-2254`. *Keep:* MUST. *Notes:* the journal line lookup already filters to Posting accounts that are not blocked (`Journal/GenJournalLine.Table.al:182-183`).
- **R-GL-POSTING-02**: An account's type cannot be changed away from `Posting` once it has G/L entries or budget entries. Changing the type clears `Totaling`, sets `Direct Posting := true` when the account becomes Posting, and sets it to false for every other type. *Src:* `Account/GLAccount.Table.al:117-137`. *Keep:* MUST.
- **R-GL-POSTING-03**: `Totaling` can be filled only for `Total` or `End-Total` accounts (`IsTotaling`). For `End-Total`, it is generated as `<Begin-Total No.>..<End-Total No.>` by the indent function. There can be at most 10 nesting levels, and every `End-Total` needs a matching `Begin-Total`. *Src:* `Account/GLAccount.Table.al:475-488,1526-1529`; `Account/GLAccountIndent.Codeunit.al:35,73-90`. *Keep:* SHOULD (replace with a parent_id tree plus computed rollups). *Notes:* the ranges compare account numbers as **strings**.
- **R-GL-POSTING-04**: Balances are calculated, not stored. `Balance` = Σ Amount over all dates; `Net Change` = Σ Amount within the date filter; `Balance at Date` = Σ Amount up to the end of the date filter. All three sum over `No.` or the `Totaling` filter. *Src:* `Account/GLAccount.Table.al:416-450,501-513`. *Keep:* MUST (as SQL aggregates or materialized period totals).
- **R-GL-POSTING-05**: Setting `Account Category` to Income, Cost of Goods Sold or Expense makes `Income/Balance = Income Statement`; any other category makes it Balance Sheet. Year-end closing processes only Posting accounts with Income/Balance = Income Statement. *Src:* `Account/GLAccount.Table.al:184-187`; `Setup/CloseIncomeStatement.Report.al:41`. *Keep:* MUST.
- **R-GL-POSTING-06**: `Debit/Credit` (Both/Debit/Credit) is **informational only**. No posting code enforces it; it is used only by reports and data migration. *Src:* `Account/GLAccount.Table.al:218-224` (no posting references found in the Base App). *Keep:* SKIP the enforcement (optionally show a warning).
- **R-GL-POSTING-07**: `Direct Posting = false` blocks manual journal postings to the account. This protects control accounts such as AR, AP, VAT and bank G/L accounts, whose entries must come from their subledgers. The check is skipped for system-created entries and for closing dates. *Src:* `Posting/GenJnlPostLine.Codeunit.al:7465-7477`; `Journal/GenJournalLine.Table.al:4781-4797`; the batch default balancing account must allow direct posting (`Journal/GenJournalBatch.Table.al:403-412`). *Keep:* MUST.
- **R-GL-POSTING-08**: A G/L account can be deleted only if its balance is 0 and it has no entries in any open fiscal year. For closed years, deletion is governed by `Block Deletion of G/L Accounts` and `Allow G/L Acc. Deletion Before`. *Src:* `BaseApp/Utilities/MoveEntries.Codeunit.al:510-527`. *Keep:* MUST (simplify to: delete only if the account has no entries; otherwise block it).

### Journal model
- **R-GL-POSTING-09**: The account and the balancing account cannot both be "partner" types (Customer, Vendor, FA, IC Partner, plus Employee during validation). At least one side must be G/L or Bank. *Src:* `Journal/GenJournalLine.Table.al:125-132`; `Journal/GenJnlCheckLine.Codeunit.al:259-277`. *Keep:* MUST.
- **R-GL-POSTING-10**: Sign convention on a line: `Amount` is from the point of view of `Account No.` (positive = debit). The balancing account receives `-Amount`. Entering `Debit Amount` gives Amount = +x; entering `Credit Amount` gives Amount = −x. Entering a **negative** debit or credit sets `Correction := true` (storno). *Src:* `Journal/GenJournalLine.Table.al:597-606,619-628,4258-4273`. *Keep:* MUST.
- **R-GL-POSTING-11**: `Balance (LCY)` = 0 when both Account and Bal. Account are filled (the line balances itself); = −Amount(LCY) when only the Bal. Account is filled; = +Amount(LCY) when only the Account is filled. The batch total is Σ `Balance (LCY)`. *Src:* `Journal/GenJournalLine.Table.al:4234-4241`; `Journal/GenJournalBatch.Table.al:474-482`. *Keep:* MUST.
- **R-GL-POSTING-12**: A new line inherits Posting Date, Document No., Account Type and Document Type from the previous line. If the previous document is balanced and the user is at the bottom line, the Document No. is advanced to the next number in the series. The balancing account is taken from the batch defaults. *Src:* `Journal/GenJournalLine.Table.al:4291-4344`. *Keep:* SHOULD (UX).
- **R-GL-POSTING-13**: A line is "empty", and skipped, when Account No. = '' and Amount = 0, and either there is no Bal. Account or the line is not system-created. Lines with Amount = 0 are rejected unless they are system-created, `Allow Zero-Amount Posting` is set, or the account is an FA. *Src:* `Journal/GenJournalLine.Table.al:4165-4175,7658-7665`; `Journal/GenJnlCheckLine.Codeunit.al:969-980`. *Keep:* MUST.
- **R-GL-POSTING-14**: A G/L account line that has VAT or general posting groups must have `Gen. Posting Type` set to Purchase or Sale; this decides which VAT account is used. Customer, Vendor, Employee and Bank lines must not have posting groups. For automatic VAT, `VAT Amount + VAT Base Amount = Amount` must hold, in LCY as well. *Src:* `Journal/GenJnlCheckLine.Codeunit.al:578-616,618-624,641-647`. *Keep:* MUST.
- **R-GL-POSTING-15**: When the posting date is a closing date, choosing a G/L account clears the posting groups, so no VAT is posted on closing entries. *Src:* `Journal/GenJournalLine.Table.al:7745-7747`. *Keep:* MUST (if closing dates are kept).
- **R-GL-POSTING-16**: The template `Type` sets the default Source Code and page. A recurring template must have an empty `No. Series`, and a recurring batch cannot have a default Bal. Account. *Src:* `Journal/GenJournalTemplate.Table.al:106-158,193-198`; `Journal/GenJournalBatch.Table.al:414-429`. *Keep:* SHOULD.

### Check line (CU11)
- **R-GL-POSTING-17**: `RunCheck` runs in this order: empty line → exit; CheckDates; Document No. is required; account-type pair rule; Account No. is required if there is no Bal. Account; zero-amount rule; `Amount` and `Amount (LCY)` must have the same sign; Applies-to fields are not allowed for G/L-to-G/L lines; CheckAccountNo / CheckBalAccountNo; dimensions; currency. *Src:* `Journal/GenJnlCheckLine.Codeunit.al:115-236`. *Keep:* MUST.
- **R-GL-POSTING-18**: Allowed posting dates, first match wins: (1) `User Setup` From/To for the current user; (2) if both are empty, the journal template window (only when `Journal Templ. Name Mandatory`); (3) otherwise G/L Setup From/To. An empty "To" means 31-12-9999. DateFormula variants are evaluated relative to **Today**. *Src:* `BaseApp/System/User/UserSetupManagement.Codeunit.al:335-373,412-444,446-459`; called from `Journal/GenJnlCheckLine.Codeunit.al:549-551`. *Keep:* MUST (global window + period lock), SHOULD (per user).
- **R-GL-POSTING-19**: A closing date (`Posting Date <> NormalDate(Posting Date)`) is allowed only if both Account Type and Bal. Account Type are G/L. If accounting periods exist, the next day (`NormalDate + 1`) must be an accounting period with `New Fiscal Year = true` and `Date Locked = true`; in other words, the C-date must be the last day of a locked fiscal year. *Src:* `Journal/GenJnlCheckLine.Codeunit.al:527-538`; `BaseApp/Foundation/Period/AccountingPeriodMgt.Codeunit.al:37-46`. *Keep:* SHOULD (see §7).
- **R-GL-POSTING-20**: The dimension combination must be allowed, and the default-dimension "value posting" rules (Code Mandatory / Same Code / No Code) are checked for account, balancing account, job, salesperson and campaign. The G/L account dimension rules are checked again for G/L entries created by the system (VAT, receivables, …) unless Amount and Amount (LCY) are both 0. *Src:* `Journal/GenJnlCheckLine.Codeunit.al:937-967`; `Posting/GenJnlPostLine.Codeunit.al:2257-2266,7402-7432`. *Keep:* SHOULD (only 2 dimensions in v1).

### Batch balance (CU13)
- **R-GL-POSTING-21**: The posting order and balance groups depend on the template. If `Force Doc. Balance` (the default) is on, lines are sorted by (`Document No.`, `Posting Date`), and the balance is checked each time the posting date, document type or document no. changes. If it is off, the balance is checked only when the posting date changes. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:359-364,406-415`. *Keep:* MUST (always force document balance).
- **R-GL-POSTING-22**: Inside each group, `CurrentBalance` = Σ `Balance (LCY)` of the non-zero lines, and it must equal 0 when the group ends. Two more checks: reversing recurring lines must balance on their own (`CurrentBalanceReverse`), and currency lines must balance in the line currency (`CurrencyBalance`). The final group is checked after the loop. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:417-438,477,546-591`. *Keep:* MUST (LCY balance); SHOULD (currency balance once FX exists).
- **R-GL-POSTING-23**: `Correction` must be the same on every line of a document, and it requires `Force Doc. Balance`. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:593-609`. *Keep:* SHOULD.
- **R-GL-POSTING-24**: With `Force Doc. Balance`, one document that contains a VAT line cannot have more than one customer or vendor. The VAT information is copied from the customer or vendor line onto the G/L lines of the same document. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:445-466,478-480`. *Keep:* MUST (one partner per voucher).
- **R-GL-POSTING-25**: Number series in the batch: if a line's Document No. equals the next number in the batch `No. Series`, that number is consumed; otherwise the series must allow manual numbers. If `Posting No. Series` is set, documents are renumbered at posting. All lines with the same source Document No. get the same posted number. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:388-400,853-872`. *Keep:* MUST (automatic numbering); SKIP the separate posting series.
- **R-GL-POSTING-26**: All checks finish before anything is posted. Every line is checked first, then the balance, then `GLEntry.LockTable` and the posting of lines. One `Commit` happens at the end, unless the run is a preview. A posting date later than WorkDate needs confirmation. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:237-259,268-282,316-327,1606-1609`. *Keep:* MUST (one DB transaction per posting run).
- **R-GL-POSTING-27**: After a successful run, the journal lines of a normal journal are deleted (they can optionally be copied to Posted Gen. Journal Line). Recurring lines are kept: their Posting Date moves forward by `Recurring Frequency`, and the amounts of non-Fixed methods are reset to 0. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:1394-1473,1662-1681`. *Keep:* MUST (delete), SHOULD (recurring).

### Numbering, transaction, register (CU12)
- **R-GL-POSTING-28**: On the first line of a run, `StartPosting` locks the G/L Entry table and sets `NextEntryNo := last Entry No. + 1` and `NextTransactionNo := last Transaction No. + 1`. It also locks the VAT Entry table and creates the in-memory register: `No. = last + 1`, `From Entry No. = NextEntryNo`, plus Source Code, batch and user. *Src:* `Posting/GenJnlPostLine.Codeunit.al:479-497,1899-1953`. *Keep:* MUST (use a DB sequence or identity column; also see R-35).
- **R-GL-POSTING-29**: A new Transaction No. is allocated when the Document Type, Document No. or Posting Date changes, **or** when the running balance (single-sided lines only) is 0 and the line is not system-created. *Src:* `Posting/GenJnlPostLine.Codeunit.al:1969-1977,1990-2002,7479-7494`. *Keep:* MUST (simplify: one transaction per balanced voucher).
- **R-GL-POSTING-30**: Every ledger row created by a line gets `Entry No. = NextEntryNo` and is then incremented. Bank, customer and vendor ledger entries reuse **the same number as their G/L entry**, and all rows share the `Transaction No.`. *Src:* `Posting/GenJnlPostLine.Codeunit.al:2271-2272,2405,3617-3662`. *Keep:* SKIP the shared numbering (use explicit FKs); MUST keep transaction_id on every subledger row.
- **R-GL-POSTING-31**: G/L entries are first written to a temporary buffer (`TempGLEntryBuf`). `FinishPosting` then inserts them with `G/L Register No.`, `Prior-Year Entry` (= Posting Date earlier than the current fiscal year start) and a G/L Transaction row, and finally sets `GLReg."To Entry No."`. The register is inserted once and later updated, but **only when the transaction is consistent**. *Src:* `Posting/GenJnlPostLine.Codeunit.al:2060-2086,2105-2121`; `Ledger/GLTransaction.Table.al:113-124`. *Keep:* MUST.
- **R-GL-POSTING-32**: Posting order within one line: when the account is a Customer, Vendor or FA and a Bal. Account exists, the two sides are swapped first (CU366: the account fields become the bal. fields and the amounts are negated), so that the **balancing side posts first**. Otherwise the Account side posts first, then the swap, then the Bal. side. *Src:* `Posting/GenJnlPostLine.Codeunit.al:310-330`; `Journal/ExchangeAccGLJournalLine.Codeunit.al:23-66`. *Keep:* SHOULD (the order is only cosmetic, but it determines Entry No. order).
- **R-GL-POSTING-33**: For a G/L account line, `PostGLAcc` creates the base G/L entry (Amount = Amount (LCY) − VAT Amount when VAT is automatic), then the VAT entry and the VAT G/L entry, whose account comes from VAT Posting Setup (Sales or Purchase VAT account). For a Bank line, `PostBankAcc` creates a bank ledger entry plus a G/L entry on the bank posting group's G/L account. *Src:* `Posting/GenJnlPostLine.Codeunit.al:1195-1248,505-558,950-1005,1567-1709`. *Keep:* MUST.

### Consistency and rounding
- **R-GL-POSTING-34**: Every G/L entry amount must already be rounded to 0.01 (`Round()` default), otherwise posting fails with the error "needs rounding". The line `Amount` must also be rounded to the currency precision, and `Amount (LCY)` to 0.01. *Src:* `Posting/GenJnlPostLine.Codeunit.al:449-462,2383-2384`. *Keep:* MUST.
- **R-GL-POSTING-35**: **Transaction consistency.** Every inserted entry adds `Amount × ((PostingDate − 0D) mod 99 + 1)` to one accumulator and `Amount × (… mod 98 + 1)` to another. For closing dates, `+50` is added to the day offset. `IsTransactionConsistent` = both accumulators are 0 (and likewise for ACY and source currency). The result is passed to `GLEntry.Consistent(...)`: an inconsistent table makes the commit fail. *Src:* `Posting/GenJnlPostLine.Codeunit.al:2387-2389,2569-2615,2048-2054,2090`. *Keep:* MUST, as an explicit check: Σ amount = 0 per (transaction, posting_date, is_closing), plus a deferred DB constraint.
- **R-GL-POSTING-36**: `Debit Amount` / `Credit Amount` on a G/L entry are derived in `UpdateDebitCredit(Correction)`. If (Amount > 0 and not Correction) or (Amount < 0 and Correction), then Debit = Amount and Credit = 0; otherwise Debit = 0 and Credit = −Amount. So a correction puts **negative** values in the original column. *Src:* `Ledger/GLEntry.Table.al:964-987`. *Keep:* MUST.

### Dates and closing
- **R-GL-POSTING-37**: `Posting Date` fields allow closing dates (`ClosingDates = true`) on the journal line and on the G/L entry. Year-end close posts the Income Statement accounts to Retained Earnings on `ClosingDate(FY end)`, and it requires that the next period starts a new fiscal year and is `Date Locked`. *Src:* `Ledger/GLEntry.Table.al:78-83`; `Journal/GenJournalLine.Table.al:271-275`; `Setup/CloseIncomeStatement.Report.al:41,502,580-612`. *Keep:* SHOULD.

### Reversal
- **R-GL-POSTING-38**: Two scopes can be reversed: a **Transaction** (all ledgers filtered by `Transaction No.`) or a **Register** (Entry No. range From..To, and VAT entries by VAT range). A register cannot be reversed twice, and it must have come from a journal batch. *Src:* `Reversal/ReversalEntry.Table.al:431-444,892-907,914-956`. *Keep:* MUST (Transaction), SKIP (Register).
- **R-GL-POSTING-39**: Conditions for reversal. Every G/L entry must have a non-empty `Journal Batch Name` (or a bank reconciliation source code). Its posting date must be inside the allowed window. The account must not be blocked, there must be no Job No., and the entry must not already be reversed. The selected G/L amounts must sum to 0. Customer and vendor entries must have no detailed entries other than the "Initial Entry" that are still applied. Bank entries must be `Open`, must not be on a bank statement, and must not have a check ledger entry. VAT entries must not be `Closed` (settled). *Src:* `Reversal/ReversalEntry.Table.al:539-548,619-665,667-700,717-744,796-814,816-846,1115-1128`. *Keep:* MUST.
- **R-GL-POSTING-40**: How the reversal is posted. A new posting run is opened (Source Code = REVERSAL). Entries are processed in **descending Entry No.** Each new entry is a copy of the original with Amount, VAT, Quantity, Debit/Credit and ACY negated. The **posting date and document no. stay the same**. The new entry gets a new Entry No., the **single new Transaction No.** (shared by the whole reversal), the new Register No., an empty `Journal Batch Name` and `Correction = true`. On the new entry: `Reversed Entry No.` = original and `Reversed = true`. On the original: `Reversed by Entry No.` = new and `Reversed = true`. Subledger and VAT entries are mirrored the same way, and the new register is marked `Reversed`. *Src:* `Reversal/GenJnlPostReverse.Codeunit.al:132-145,209-312,551-587,595-651`; `Posting/GenJnlPostLine.Codeunit.al:7175-7179`. *Keep:* MUST.
- **R-GL-POSTING-41**: Before reversing, the candidate list is rebuilt and compared with what the user saw (`VerifyReversalEntries`), to detect concurrent changes. FA entries trigger a warning. *Src:* `Reversal/ReversalPost.Codeunit.al:65-73`. *Keep:* SHOULD (optimistic concurrency token).

### Preview
- **R-GL-POSTING-42**: Preview runs the **real** batch with `PreviewMode = true` inside a procedure marked `CommitBehavior::Error`. The event handler copies every inserted G/L, VAT, customer, vendor, bank, … row into temporary tables and marks a table inconsistent to guarantee that nothing can be committed. When the run finishes, `ThrowError()` raises `'Preview mode.'`, which rolls everything back. The handler shows Document No. as `***` and uses separate preview number sequences, so no real numbers are used up. *Src:* `Preview/GenJnlPostPreview.Codeunit.al:85-114,238-242`; `Preview/PostingPreviewEventHandler.Codeunit.al:80,273-306`; `Posting/GenJnlPostBatch.Codeunit.al:224-225,308-311`. *Keep:* SHOULD (implement as a pure function; see §7).

### Recurring
- **R-GL-POSTING-43**: In a recurring template every line with an account needs `Recurring Method` and `Recurring Frequency`, and a Bal. Account is not allowed. The F/V/RF/RV methods need Amount ≠ 0. B/RB need Amount = 0 (the amount is calculated as −Net Change of the account up to the posting date, G/L only) and must use Allocations. Lines are posted only if Posting Date ≤ WorkDate, the line has not expired, and the date is allowed. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:620-648,650-680,682-720,1275-1302,1327-1354`. *Keep:* SHOULD (F, V, RF, RV only).
- **R-GL-POSTING-44**: For the reversing methods (RF, RV, RB), each posted line is negated and posted again on `Posting Date + 1`, or on `CalcDate(Reverse Date Calculation)`, which must be later than the posting date. *Src:* `Posting/GenJnlPostBatch.Codeunit.al:1561-1581,1683-1695,1366-1392`. *Keep:* SHOULD.

---

## 4. Flows

### 4.1 Post a journal batch (user presses Post)
1. **CU231 `Code`**: checks the template (no forced posting report; a recurring journal cannot be filtered by date), asks "Do you want to post?", optionally queues the posting as a job, then runs CU13. *Src:* `Posting/GenJnlPost.Codeunit.al:74-133`.
2. **CU13 `Code`**: filters on template and batch, `LockTable` on journal lines and allocations, loads the template, batch and setup. For a recurring journal it builds a temporary set of eligible lines (date ≤ WorkDate, not expired, date allowed, non-zero). *Src:* `Posting/GenJnlPostBatch.Codeunit.al:155-185`.
3. **Check phase**: for each line: set the VAT date if empty → `CheckLine` (recurring checks, recalculate Balance-method amounts, allocations, confirm "after WorkDate", then CU11 `RunCheck`). *Src:* `:237-251,1587-1619`.
4. **Balance phase**: `ProcessBalanceOfLines` sorts the lines, consumes Document No. numbers from the series, checks Correction consistency, accumulates the balance per group and raises an error at the first unbalanced group. *Src:* `:346-483`.
5. `GLEntry.LockTable`; `FindNextGLRegisterNo`. *Src:* `:258-259`.
6. **Post phase**: for each line → `PostGenJournalLine`: recurring texts, `CheckDocumentNo` (renumbering), then **CU12 `RunWithoutCheck`**, optional archive, queue a reversing line if the method is Reversing, post allocations. *Src:* `:268-282,1528-1585`.
7. Post the queued reversing lines with CU12 `RunWithCheck`. *Src:* `:288-292,1366-1392`.
8. If this is a preview, throw the preview error here. Otherwise delete or update the lines, save the number-series state and **Commit**. *Src:* `:303-327`.

### 4.2 Post one line (CU12 `Code`)
1. Empty line → remember the doc/date and exit. If `VAT Reporting Date` is empty, derive it. Optionally run CU11 (RunWithCheck). *Src:* `Posting/GenJnlPostLine.Codeunit.al:269-282`.
2. `InitAmounts`: when there is no currency, Amount (LCY) = Amount; check the rounding. Default Document Date and Due Date to the Posting Date. *Src:* `:285-297,414-464`.
3. `StartPosting` for the first line (locks, next numbers, register) or `ContinuePosting` (new Transaction No. if needed, update the running balance). *Src:* `:303-306,1899-1988`.
4. Post the Account side through `PostGenJnlLine` (dispatches by Account Type), then swap (CU366) and post the Bal. side. *Src:* `:310-330,390-412`.
5. In each `Post*` procedure: `InitGLEntry` (checks blocked/posting/dimensions; copies the fields from the line; assigns Entry No. and Transaction No.) → `InitVAT` → `InsertGLEntry` (rounding check; update the consistency accumulators; `UpdateDebitCredit`; add to buffer; `NextEntryNo++`) → `PostVAT` (VAT entry plus VAT G/L entry). *Src:* `:2239-2289,2371-2413,667-756`.
6. `FinishPosting`: compute consistency, insert the buffered G/L entries and the transaction row, insert or modify the register, set the `Consistent` flag. *Src:* `:2040-2103`.

### 4.3 Reverse a transaction
1. The user opens "Reverse Transaction" on a G/L entry → `ReverseTransaction(TransactionNo)` → `InsertReversalEntry` builds the buffer from customer, vendor, employee, bank, FA, maintenance, VAT and G/L entries with the same Transaction No. *Src:* `Reversal/ReversalEntry.Table.al:431-504`.
2. Confirm → `Reversal-Post`: re-apply the filter → `CheckEntries` (locks plus all R-39 checks) → `VerifyReversalEntries` → `GenJnlPostReverse.Reverse`. *Src:* `Reversal/ReversalPost.Codeunit.al:23-88`.
3. `Reverse`: Start/ContinuePosting with Source Code REVERSAL, then `SetGLRegReverse`. For each G/L entry in descending order: create the mirror entry → reverse the matching subledger entry (same Entry No.) → `ReverseVAT` through the link table. Check that no subledger entry was left unmatched → `FinishPosting` → mark the original register Reversed (register scope). *Src:* `Reversal/GenJnlPostReverse.Codeunit.al:80-207`.

### 4.4 Preview
`CU231.Preview` → `CU19.Preview` → bind the handler → `OnRunPreview` → CU13 with `PreviewMode` → … → `ThrowError('Preview mode.')`. Back in CU19: unbind, check that the last error is the preview error, show the captured entries and raise `Error('')` again. *Src:* `Preview/GenJnlPostPreview.Codeunit.al:75-123`.

### 4.5 Year-end close
Lock the fiscal year (Accounting Period `Date Locked` on the next year's first period) → the Close Income Statement report builds journal lines that offset each Income Statement account balance (optionally per dimension), with Retained Earnings as the balancing account or as one summary line, dated `ClosingDate(FY end)` → post through the normal journal pipeline (R-19 applies). *Src:* `Setup/CloseIncomeStatement.Report.al:41,163-226,502,580-612`.

---

## 5. Calculations and rounding

| Item | Formula / rule | Source |
|---|---|---|
| Debit/Credit on a journal line | `Amount>0 xor Correction` → Debit = Amount; else Credit = −Amount (Correction inverts the column choice) | `Journal/GenJournalLine.Table.al:4258-4269` |
| Amount (LCY) | no currency: = Amount; otherwise `Round(ExchangeAmtFCYToLCY(PostingDate, Cur, Amount, CurrencyFactor))` at 0.01 | `Journal/GenJournalLine.Table.al:5112-5119` |
| Line VAT (Normal VAT, amounts include VAT) | `VAT Amount = Round(Amount × VAT% / (100 + VAT%), CurrencyPrecision, VATRoundingDirection)`; `VAT Base = Amount − VAT Amount` (the base absorbs the rounding) | `Journal/GenJournalLine.Table.al:383-386,411` |
| VAT at posting (no VAT difference) | `GLEntry.VAT Amount = Round(Amount(LCY) × VAT% / (100+VAT%), LCYPrecision, dir)`; `GLEntry.Amount = Amount(LCY) − VAT Amount` | `Posting/GenJnlPostLine.Codeunit.al:543-548` |
| Bal. side VAT | same formula applied to `−Amount` | `Journal/GenJournalLine.Table.al:1621-1628` |
| Rounding direction | VAT Rounding Type Nearest/Up/Down → `'='`/`'>'`/`'<'` | `BaseApp/Finance/Currency/Currency.Table.al:949-959` |
| LCY precision | `GLSetup."Amount Rounding Precision"` (default 0.01); the G/L insert check always uses 0.01 | `Setup/GeneralLedgerSetup.Table.al:589-595`; `Currency.Table.al:886-892`; `Posting/GenJnlPostLine.Codeunit.al:2383` |
| Batch group balance | Σ Balance(LCY) over the group = 0 | `Posting/GenJnlPostBatch.Codeunit.al:433,552` |
| Transaction consistency | `Σ Amount·((d−0D) mod 99 + 1) = 0` and `Σ Amount·((d−0D) mod 98 + 1) = 0`; C-date: `(NormalDate(d)−0D+50)`. Two co-prime weights make it practically impossible for a transaction that is unbalanced in some date bucket to pass. | `Posting/GenJnlPostLine.Codeunit.al:2571-2581` |
| Account balances | Balance = ΣAmount; Net Change = ΣAmount within the date filter; Balance at Date = ΣAmount up to the end of the filter | `Account/GLAccount.Table.al:416-450,501-513` |
| Recurring Balance method | Amount := −NetChange(account, 0D..PostingDate) | `Posting/GenJnlPostBatch.Codeunit.al:666-674` |

---

## 6. Worked posting examples (MNT, 10% VAT)

Illustrative accounts: 1110 Cash, 1120 Bank (G/L account of the bank posting group), 1310 VAT input, 3410 VAT output, 3510 Accrued liabilities, 4110 Owner capital, 4210 Retained earnings, 5110 Sales revenue, 7110 Rent expense, 7210 Office supplies. Force Doc. Balance is on. Examples A–C are posted in **one batch run** on 2026-01-05..07.

**A. Owner contribution, two single-sided lines (GJ-0001, 2026-01-05)**

| Line | Account | Amount | Balance (LCY) | Running |
|---|---|---|---|---|
| 10000 | Bank BANK-KHAN | +5,000,000.00 | +5,000,000 | +5,000,000 |
| 20000 | G/L 4110 | −5,000,000.00 | −5,000,000 | **0** ✓ |

| Entry | Trans | Account | Amount | Debit | Credit |
|---|---|---|---|---|---|
| 1 | 1 | 1120 (+ bank ledger entry no. 1) | +5,000,000.00 | 5,000,000.00 | |
| 2 | 1 | 4110 | −5,000,000.00 | | 5,000,000.00 |

**B. Cash sale incl. VAT, one line with a balancing account (GJ-0002, 2026-01-06).** Account G/L 5110, Gen. Posting Type = Sale, VAT 10%, Amount = −110,000, Bal. Account G/L 1110. The line has both accounts, so Balance (LCY) = 0. VAT = Round(−110,000×10/110) = −10,000.00 and the base is −100,000.00.

| Entry | Trans | Account | Amount | Debit | Credit | Note |
|---|---|---|---|---|---|---|
| 3 | 2 | 5110 | −100,000.00 | | 100,000.00 | VAT Amount −10,000 stored on the entry |
| 4 | 2 | 3410 | −10,000.00 | | 10,000.00 | VAT entry: Base −100,000, Amount −10,000 |
| 5 | 2 | 1110 | +110,000.00 | 110,000.00 | | balancing side (posted after the swap) |

Σ = 0 ✓.

**C. Office supplies bought with VAT, paid from bank (GJ-0003, 2026-01-07)**

| Line | Account | Amount | Balance (LCY) |
|---|---|---|---|
| 10000 | G/L 7210, Purchase, VAT 10% | +55,000 | +55,000 |
| 20000 | Bank BANK-KHAN | −55,000 | −55,000 → 0 ✓ |

| Entry | Trans | Account | Amount | Debit | Credit |
|---|---|---|---|---|---|
| 6 | 3 | 7210 | +50,000.00 | 50,000.00 | |
| 7 | 3 | 1310 | +5,000.00 | 5,000.00 | |
| 8 | 3 | 1120 (+ bank ledger entry no. 8) | −55,000.00 | | 55,000.00 |

Register 1: From Entry 1, To Entry 8, Source Code GENJNL, batch DEFAULT; Transactions 1–3.

**D. VAT rounding (gross 12,345 MNT, 10%)**: 12,345 × 10/110 = 1,122.2727…

| Precision / direction | VAT | Base | Entries (Cr 5110 / Cr 3410 / Dr 1110) |
|---|---|---|---|
| 0.01 Nearest | 1,122.27 | 11,222.73 | −11,222.73 / −1,122.27 / +12,345.00 (Σ 0) |
| 0.01 Up | 1,122.28 | 11,222.72 | −11,222.72 / −1,122.28 / +12,345.00 (Σ 0) |
| 1.00 Nearest | 1,122 | 11,223 | −11,223 / −1,122 / +12,345 (Σ 0) |

**E. Reversal of transaction 3 (run on 2026-01-20; the entries keep posting date 2026-01-07)**. New register 2 and new Transaction 4. Entries are processed in descending order, and every new entry has `Correction = true`.

| New entry | Reverses | Account | Amount | Debit | Credit | Reversed Entry No. |
|---|---|---|---|---|---|---|
| 9 | 8 | 1120 | +55,000.00 | | −55,000.00 | 8 |
| 10 | 7 | 1310 | −5,000.00 | −5,000.00 | | 7 |
| 11 | 6 | 7210 | −50,000.00 | −50,000.00 | | 6 |

Σ Amount = 0 ✓. Entries 6/7/8 get `Reversed = true` and `Reversed by Entry No.` = 11/10/9. The bank ledger entry 8 is mirrored as 9. The VAT entry is negated and its new entry is linked to the new G/L entry. Net balances of 7210 and 1310 return to 0, and the debit and credit turnovers of the period both drop by the reversed amounts (storno effect).

**F. Recurring accrual "RF Reversing Fixed", monthly (31-01-2026)**. No Bal. Account is allowed, so the journal has two lines: 7110 +300,000 and 3510 −300,000.

| Date | Account | Amount | Source |
|---|---|---|---|
| 2026-01-31 | 7110 | +300,000.00 | normal pass |
| 2026-01-31 | 3510 | −300,000.00 | normal pass |
| 2026-02-01 | 7110 | −300,000.00 | reversing line (Posting Date + 1) |
| 2026-02-01 | 3510 | +300,000.00 | reversing line |

After posting, the line's Posting Date becomes CalcDate('1M', 31-01) = 2026-02-28, and the amounts stay because the method is Fixed. The reversing lines must balance on their own (R-22).

**G. Year-end close on C31-12-2026** (FY 2026 locked; the 01-01-2027 period has New Fiscal Year = true and Date Locked = true). Income Statement balances: 5110 −1,200,000; 7110 +600,000; 7210 +150,000 → profit 450,000.

| Posting Date | Account | Amount |
|---|---|---|
| C31-12-2026 | 5110 | +1,200,000.00 |
| C31-12-2026 | 7110 | −600,000.00 |
| C31-12-2026 | 7210 | −150,000.00 |
| C31-12-2026 | 4210 | −450,000.00 |

Σ = 0 ✓. The 2026 P&L run "up to 31-12-2026" (normal date) still shows the profit, while "up to C31-12-2026" shows zero for the Income Statement accounts.

---

## 7. Simplifications for the micro-business system

1. **Merge template and batch into one `journal`** (type: GENERAL, CASH, BANK, SALES, PURCHASE, RECURRING). Force document balance is always on. Each journal has a default balancing account and a number series.
2. **Voucher-first model.** Keep the journal line with Account/Bal. Account (users like it), but at posting convert each document into a `gl_transaction` header (id, doc type, doc no, posting date, source code, register id, reversal links) with ≥2 `gl_entry` rows. This replaces both the "running balance resets the Transaction No." rule and the shared Entry No. trick (R-29, R-30).
3. **Posting engine as a pure function**: `post(lines, ctx) -> {entries, vat_entries, sub_ledger_entries, errors}`. Persisting the result is a separate step done in one serializable DB transaction. Preview = call the function and do not persist. This avoids BC's "error to roll back" trick and never touches number series (preview numbers are shown as `***`).
4. **Invariants in the DB**: `CHECK (debit >= 0 AND credit >= 0 …)` is not possible because of storno, so use a deferred constraint trigger instead: `SUM(amount) GROUP BY transaction_id, posting_date, is_closing = 0` at commit. Entries are append-only (revoke UPDATE/DELETE; reversal flags live in a side table, or are the only mutable columns).
5. **Account numbers**: Code(20), stored as text; enforce fixed-length numeric codes so that string ranges and numeric order agree. Use `parent_id` plus `is_posting` instead of Begin-/End-Total; keep `Heading` only for presentation. Rollups are calculated with recursive CTEs or with materialized period balances.
6. **Dates**: one company-wide posting window, plus per-user overrides (SHOULD), plus accounting periods with `closed` flags. **Closing dates**: replace the AL C-date with `is_closing BOOLEAN` on the transaction plus posting date = fiscal year end. Reports then filter `is_closing` explicitly. (Mongolia: the fiscal year = calendar year.)
7. **Rounding**: store NUMERIC(18,2) in MNT. Calculate VAT from the gross amount with HALF_UP to 0.01 (configurable to 1.00 MNT). Assert that every entry is rounded before insert.
8. **Reversal**: transaction scope only, for manual and journal vouchers. Documents (invoices) are corrected with credit memos. Keep BC's rules R-39 and R-40, but decide the reversal date (see §9).
9. **Recurring**: F, V, RF and RV only, with an expiration date. Skip Balance, Balance by Dimension and allocations.
10. **Skip**: ACY, source currency, IC, FA-through-journal, jobs, deferrals, cost accounting, sales tax, payment discount and tolerance, checks, job-queue posting, concurrent posting (sequences cover it), Posted Gen. Journal Line archive.

---

## 8. Pitfalls and edge cases

- **Two balance layers**: the batch pre-check works only on **single-sided lines** (Balance (LCY) = 0 for a line with both accounts), while the post-time consistency check covers **all entries, including system-created VAT entries**. Implement both: line-level, then entry-level.
- **The balance group key includes the posting date.** Two lines with the same Document No. but different dates are two groups, and each must balance (R-21, R-35).
- **Lines are sorted by Document No. before posting** when document balance is forced. The posting order is not the order lines were entered, and this affects Entry No. order.
- **Correction (storno)** produces negative Debit/Credit columns. Trial balance turnovers must sum the signed columns. Never ABS() them.
- **Reversal keeps the original posting date.** If that period is now outside the allowed window, reversal is impossible (R-39). Reversal entries are themselves `Reversed = true`, so they drop out of "non-reversed" views.
- **A register reversal produces one transaction** for all the original transactions.
- **Debit/Credit on the account is not enforced** (R-06). Do not copy it as a hard rule without a business decision.
- **C-date ordering**: D < C(D) < D+1. An "Allow Posting To" of 31-12 excludes C31-12. Fiscal-year checks run on `NormalDate + 1`.
- **Direct Posting** must be false on AR, AP, VAT and bank control accounts, otherwise the subledgers drift from the G/L. It is bypassed for system-created entries and on C-dates.
- **VAT is derived from the gross amount** in journals (Amount includes VAT), but from the net amount in reverse-charge. One voucher with VAT may have at most one customer or vendor (R-24).
- **An empty line is not an error**, and a zero-amount line is (unless allowed). Recurring lines with Amount = 0 are silently skipped.
- **The number series is consumed only when Document No. = the peeked next number.** Manually typed numbers must be allowed by the series, which can leave gaps or duplicates.
- **Locking**: BC locks the G/L Entry, VAT Entry and G/L Register tables for the whole run (global serialization). Use DB sequences plus short transactions, and do not hold locks across user interaction.
- **Dimension rules are checked again on system-generated G/L entries** (for example, a mandatory department on the VAT account), which can fail even though the user's line passed.
- **Amount and Amount (LCY) must have the same sign**, and an FCY line must balance in FCY as well as in LCY.
- **Deleting accounts**: BC renames the entries to a blank account (MoveEntries) when allowed. In the new system, block deletion if any entry exists.

---

## 9. Open questions

1. MNT precision: store at 0.01 (eBarimt uses 2 decimals) or round everything to 1 MNT? What is the VAT rounding direction under Mongolian rules?
2. Reversal date: keep BC's "same posting date", or allow (or require) posting on the current date when the original period is closed (common practice: correct in the current period)?
3. Mongolian report presentation: are storno (negative same-column) corrections acceptable on the general ledger and in the trial balance, or must reversals appear in the opposite column?
4. Are gapless document numbers per journal type legally required? This decides whether numbers are taken from a locked counter or from a sequence.
5. Year-end close: post real closing entries (BC style), or calculate retained earnings virtually in reports? (This affects the `is_closing` design.)
6. Dimensions in v1: none, 1 or 2 global dimensions (department, project)?
7. Do micro users need recurring journals in v1, or only "copy previous voucher"?
8. Should `Debit/Credit` on accounts become a warning (useful for beginners), given that BC does not enforce it?
9. Should the per-user posting window be in v1, given that there are at most 10 users?
