# BC research: Accounting periods, year-end close, posting restrictions, financial reporting engine

- Source: BCApps (BC v29, W1 Base App, MIT). Read from the AL code, not from documentation.
- Path legend: unless a path starts with `src/`, it is relative to `src/Layers/W1/BaseApp/`. `AccSchedMgt` = `Finance/FinancialReports/AccSchedManagement.Codeunit.al`; `CloseIS` = `Finance/GeneralLedger/Setup/CloseIncomeStatement.Report.al`; `UserSetupMgt` = `System/User/UserSetupManagement.Codeunit.al`; `CategGen` = `Finance/FinancialReports/CategGenerateAccSchedules.Codeunit.al`.
- Keep levels: **MUST** = needed in the micro-ERP v1, **SHOULD** = keep in a simpler form or add soon after v1, **SKIP** = leave out.
- Sign convention throughout: `Amount` is signed, **debit = positive, credit = negative** (same as `bc-gl-posting.md`). Account numbers follow the seed chart in `mn-accounting.md` §4.2 (3400 retained earnings, 3500 current-year result). They are illustrative.

---

## 1. Summary

- **Periods are only start dates.** `Accounting Period` (T50) has one row per period, keyed by `Starting Date`. A period ends the day before the next row starts. `New Fiscal Year = true` marks the first period of a fiscal year (FY). No end-date column exists, so the periods are contiguous by construction.
- **Two flags, two meanings.** `Closed` means "this period belongs to a closed fiscal year". `Date Locked` means "the period structure is frozen". Neither flag blocks posting. Posting is controlled **only** by the *Allow Posting From/To* date window (per user in User Setup, falling back to G/L Setup).
- **Closing a year (CU6) has no accounting effect.** It sets `Closed` on the oldest open year and `Date Locked` on that year plus the first period of the next year. It cannot be undone. Its real purpose is to unlock **closing-date (C-date) postings** for that year end.
- **Closing dates.** A C-date `C31.12.2025` is a fictitious instant between 31.12.2025 and 01.01.2026. Year-end closing entries are posted on it. A normal range `01.01..31.12` excludes it, so the year's income statement still shows the profit. Beginning-balance filters (`..C(start−1)`) include it, so the next year opens with zero P&L accounts.
- **Close Income Statement (R94)** sums every income-statement posting account from FY start to C(FY end). It writes reversing lines per account, grouped by business unit and selected-dimension combination when those are chosen, but in v29 with no dimension/BU grouping it writes **one reversing line per G/L entry** (R-22), plus one retained-earnings line (*Balance* mode), or uses retained earnings as the balancing account on each line (*Details* mode). The lines go into a general journal for review. Because the range includes the C-date, re-running it only closes the **delta** in total (the line count can still be large, R-22). (verified-corrected)
- **G/L FlowFields** are pure aggregates over `G/L Entry.Amount`. `Net Change` uses the date filter, `Balance at Date` uses 0D..upper limit, and `Balance` uses all dates. All of them respect Totaling and the dimension and business-unit filters. Nothing is stored.
- **Financial reports** (the former *account schedules*) combine a **row definition** (T84/T85: what to sum) with a **column definition** (T333/T334: which period, actual or budget, comparison, formula). The engine `CalcCell` (CU8) evaluates each cell. It resolves dates from the column type and row type, sums G/L entries or budget entries under combined filters, evaluates row and column formulas recursively on **raw signed values**, caches the cells, and only at the end applies the Show filters, the sign flips and the display rounding.
- **G/L account categories** (T570) form a tree (Assets, Liabilities, Equity, Income, COGS, Expense, with subcategories). Each posting account points to one subcategory. CU571 generates the balance sheet, income statement, cash-flow and retained-earnings definitions from the tree. The balance sheet's retained-earnings line adds **all income-statement accounts**, so the balance sheet balances whether or not the year has been closed.
- **Trial balance** = for each account, the opening balance (to `C(start−1)`), the period debit and credit turnover, and the closing balance (to the normal end date). The closing trial balance (R10) mixes pre-closing P&L with post-closing balance-sheet figures.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| Accounting Period | Table 50 | Period calendar and fiscal years | `Starting Date` Date PK (NotBlank); `Name` Text[10] (month name); `New Fiscal Year` Bool; `Closed` Bool (not editable); `Date Locked` Bool (not editable); `Average Cost Calc. Type`/`Average Cost Period` Enum | MUST (drop the avg-cost fields) |
| Inventory Period | Table 5814 | Separate lock for item ledger postings | `Ending Date` Date PK; `Name` Text[50]; `Closed` Bool | SKIP (one period lock) |
| General Ledger Setup (subset) | Table 98 | Company posting window; links to the default reports | `Allow Posting From`/`To` Date (f2/f3); `Allow Posting From/To DateFormula` (f205/f206); `Allow Deferral Posting From/To`; `Fin. Rep. for Balance Sheet` (f114) / `for Income Stmt.` (f115) / `Cash Flow` / `Retained Earn.` Code[10]; `Amount Decimal Places` | MUST (subset) |
| User Setup | Table 91 | Per-user posting window | `User ID` Code[50] PK; `Allow Posting From`/`To` Date (+ DateFormula); `Allow VAT Date From/To`; `Allow Deferral Posting From/To` | SHOULD |
| G/L Account (reporting part) | Table 15 | Aggregation target | `Account Type` Enum 16; `Income/Balance` Enum 20 {Income Statement, Balance Sheet}; `Account Category` Enum 15; `Account Subcategory Entry No.` Int (f80) → T570; `Totaling` Text[250]; FlowFilters `Date Filter` (f28), `Global Dimension 1/2 Filter`, `Business Unit Filter`, `Budget Filter`, `Dimension Set ID Filter`; FlowFields `Balance at Date` (f31), `Net Change` (f32), `Budgeted Amount` (f33), `Balance` (f36), `Budget at Date` (f37), `Debit Amount` (f47), `Credit Amount` (f48) Decimal | MUST |
| G/L Entry (date part) | Table 17 | Ledger | `Posting Date` Date with `ClosingDates = true`; `Amount`, `Debit Amount`, `Credit Amount`; `Prior-Year Entry` Bool (f30); `Source Code` | MUST |
| G/L Budget Name / G/L Budget Entry | Tables 95 / 96 | Budget figures for budget columns | `Budget Name` Code[10]; `G/L Account No.`; `Date` (ClosingDates); `Amount` Decimal (debit +); global and budget dims | SHOULD |
| G/L Account Category | Table 570 | Presentation tree for statements | `Entry No.` Int PK; `Parent Entry No.` Int; `Sibling Sequence No.` Int; `Presentation Order` Text[100]; `Indentation` Int; `Description` Text[80]; `Account Category` Option {,Assets,Liabilities,Equity,Income,COGS,Expense}; `Income/Balance` (derived); `Additional Report Definition` Option {" ", Operating, Investing, Financing Activities, Cash Accounts, Retained Earnings, Distribution to Shareholders}; `System Generated` Bool; `Has Children` FlowField | MUST (simplified) |
| Financial Report | Table 88 | Named report = rows × columns + default filters | `Name` Code[10] PK; `Description` Text[80]; `Financial Report Row Group` Code[10] → T84; `Financial Report Column Group` Code[10] → T333; `DateFilter`, `Dim1..4Filter`, `GLBudgetFilter` Text[2048]; `PeriodType`; `NegativeAmountFormat`; `Status`, `CategoryCode` | SHOULD |
| Acc. Schedule Name (row definition) | Table 84 | Header of the row set | `Name` Code[10]; `Description`; `Default Column Layout`; `Analysis View Name` | MUST |
| Acc. Schedule Line (row) | Table 85 | One report row | PK (`Schedule Name`, `Line No.` Int); `Row No.` Code[10]; `Description` Text[100]; `Totaling` Text[250]; `Totaling Type` Enum 85; `Row Type` Option {Net Change, Balance at Date, Beginning Balance}; `Amount Type` Enum 333 {Net, Debit, Credit}; `Show` Enum 851; `Show Opposite Sign`, `Bold`, `Italic`, `Underline`, `Double Underline`, `New Page` Bool; `Indentation` Int; `Dimension 1..4 Totaling` Text[250]; FlowFilters `Date Filter`, `Dimension 1..4 Filter`, `G/L Budget Filter`, `Business Unit Filter` | MUST (subset) |
| Column Layout Name / Column Layout (column) | Tables 333 / 334 | One report column | PK (`Column Layout Name`, `Line No.`); `Column No.` Code[10]; `Column Header` Text[30]; `Column Type` Enum 331 (InitValue Net Change); `Ledger Entry Type` Enum 332 {Entries, Budget Entries}; `Amount Type` Enum 333; `Formula` Code[80]; `Comparison Date Formula` DateFormula; `Comparison Period Formula` Code[20]; `Show Opposite Sign` Bool; `Show` Enum 334 {Always, Never, When Positive, When Negative}; `Rounding Factor` Enum 364 {None,1,1000,1000000}; `Show Indented Lines` Option; `Dimension 1..4 Totaling` Text[80]; `G/L Account Totaling` Text[250]; `Budget Name` Code[10]; `Show in ACY` | MUST (subset) |
| Acc. Sched. Cell Value | Table 342 (temp) | Cell cache | `Row No.` (=line no.), `Column No.`, `Value`, `Has Error`, `Period Error` | SKIP (in-memory memo) |
| Entry No. Amount Buffer / Selected Dimension | Tables 386 (temp) / 369 | Work buffers for R94 | BU, Entry No., Amount, Amount2, source-currency fields / user + object + dimension code | SKIP |
| Source Code Setup | Table 242 | `Close Income Statement` source code on closing entries | Code[10] | MUST (as enum value `CLOSE`) |
| Engine objects | R93 Create Fiscal Year; CU6 Fiscal Year-Close; R94 Close Income Statement; CU360 Accounting Period Mgt.; CU5700 User Setup Management; CU8 AccSchedManagement; CU921 Period Formula Parser; CU9200 Matrix Management; CU570 G/L Account Category Mgt.; CU571 Categ. Generate Acc. Schedules; R25 Account Schedule; R6 Trial Balance (obsolete); R10 Closing Trial Balance; `src/Apps/W1/ExcelReports/.../TrialBalance.Codeunit.al` | Behaviour | — | MUST (re-implement the logic) |

---

## 3. Business rules

### A. Accounting periods and fiscal years
- **R-PERIODS-REPORTING-01**: A period is a start date. Its end is the next period's start − 1. The FY start is the latest `New Fiscal Year` period ≤ the date, and the FY end is the next `New Fiscal Year` start − 1. If no next FY exists, the FY end is `31.12.9999`. *Src:* `Foundation/Period/AccountingPeriod.Table.al:19-28,146-177`; `Foundation/Period/AccountingPeriodMgt.Codeunit.al:48-80,123-133`. *Keep:* MUST. *Notes:* you can only find the end of a year once the **next** year exists. Columns such as "Entire Fiscal Year" and "Rest of FY" break without it (§5.2). The `31.12.9999` fallback is CU360 (`FindEndOfFiscalYear`, `AccPeriodEndDate`); the table helper `T50.GetFiscalYearEndDate` instead returns `0D` when no next FY exists, and `FindFiscalYear` returns the first period ever when no FY start ≤ the date exists. Pick one convention in the new system. (verified-corrected)
- **R-PERIODS-REPORTING-02**: With **no** periods, everything falls back to the calendar year (`<-CY>`/`<CY>`) and the C-date fiscal-year check is skipped. *Src:* `AccountingPeriod.Table.al:149-150,170-171`; `AccountingPeriodMgt.Codeunit.al:41-42,52-56,70-74`. *Keep:* SHOULD (we always seed the periods, but the fallback is harmless).
- **R-PERIODS-REPORTING-03**: *Create Fiscal Year* creates `NoOfPeriods + 1` periods (default 12 × `1M`). Period 1 and period N+1 get `New Fiscal Year`, so the next year's start is always defined. An existing start date is not duplicated (`Find('=')`). The first period ever created gets `Date Locked`. If the new year starts before the earliest **non-closed** period and that period is `Date Locked`, every new period before it is created as Closed and Date Locked (after a confirmation). *Src:* `Foundation/Period/CreateFiscalYear.Report.al:59-62,79-89,94-118`. *Keep:* MUST (simplified: one calendar year, 12 months, generated automatically). *Notes:* the backdated-year path is useful for migrating history.
- **R-PERIODS-REPORTING-04**: A `Date Locked` period cannot be deleted or renamed, its `New Fiscal Year` flag cannot change, and no period can be inserted directly before it. *Src:* `AccountingPeriod.Table.al:42,103-121`. *Keep:* MUST (the structure of a closed year is immutable). *Invariant:* closing entries and reports of a closed year keep referring to the same FY boundaries.
- **R-PERIODS-REPORTING-05**: *Fiscal Year-Close* takes the **oldest** non-closed period, which must be a `New Fiscal Year` period. It fails with "You must create a new fiscal year before you can close the old year" if no next FY exists. It sets `Closed` on every period of that year and `Date Locked` on those periods **plus the first period of the next FY**. It cannot be reversed. It posts nothing and checks no balances. *Src:* `Foundation/Period/FiscalYearClose.Codeunit.al:30,36-51,64-68`. *Keep:* MUST. *Notes:* years are closed strictly in order, oldest first.
- **R-PERIODS-REPORTING-06**: Neither `Closed` nor `Date Locked` blocks posting. `Closed` drives (a) the `Prior-Year Entry` flag (posting date < start of the first non-closed period) and (d) Create FY. `Date Locked` on the next FY's first period, which CU6 sets, drives (b) the C-date permission (R-14) and (c) the prerequisite check of R94 (R-16). *Src:* `AccountingPeriodMgt.Codeunit.al:26-35`; `Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1912,2070`. *Keep:* MUST (understand it). We deliberately differ in §7 and let a closed period hard-block posting. The `Prior-Year Entry` flag is SKIP (it can be derived).
  - (added-in-verification) `Closed` also gates **master-data deletion**: a G/L account can be deleted only if its balance is 0 and it has no entries on or after the start of the first non-closed period; once closed periods exist, `Block Deletion of G/L Accounts` must be off and `Allow G/L Acc. Deletion Before` must be set (entries after that date need a confirmation). Customers, vendors, items and fixed assets go through the same Move Entries pattern. *Src:* `Utilities/MoveEntries.Codeunit.al:497-545`. *Keep:* MUST in simplified form (never hard-delete an account or partner with entries in an open year; prefer `blocked`).
- **R-PERIODS-REPORTING-07**: The inventory period lock is a separate table. An item posting is rejected if a **closed** inventory period with `Ending Date ≥ posting date` exists. R94 only displays whether that period is closed. *Src:* `Inventory/Setup/InventoryPeriod.Table.al:102-113,120-130`; `Inventory/Journal/ItemJnlCheckLine.Codeunit.al:322-325`; `CloseIS:379-384,756-766`. *Keep:* SKIP (fold it into the single period lock).

### B. Posting-date window
- **R-PERIODS-REPORTING-08**: The window is resolved as follows. If the current user has a `User Setup` row with a non-blank From **or** To, that row's window is used. Otherwise G/L Setup's window is used. A blank `To` means `31.12.9999` and a blank `From` means no lower bound. The range is inclusive: `PostingDate in [From..To]`. *Src:* `UserSetupMgt:335-373`. *Keep:* MUST (company window), SHOULD (user override). *Invariant:* nobody can post into a period that the controller has locked.
- **R-PERIODS-REPORTING-09**: Date formulas (`Allow Posting From/To DateFormula`) are evaluated relative to **TODAY** and override the fixed dates, which gives a rolling window such as `-CM`..`CM`. Entering a fixed date clears the formula and vice versa. `From > To` raises an error. *Src:* `UserSetupMgt:245-260,446-459`; `Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al:64-95,1412-1436`. *Keep:* SHOULD.
- **R-PERIODS-REPORTING-10**: When `Journal Templ. Name Mandatory` is on, the journal template's own window takes priority. Deferrals and VAT dates have separate windows. *Src:* `UserSetupMgt:279-314,375-403,412-444`. *Keep:* the VAT-date window is SHOULD (see `bc-vat.md`); the template and deferral windows are SKIP.
- **R-PERIODS-REPORTING-11**: The window is enforced in `Gen. Jnl.-Check Line.CheckDates` for **every** G/L posting, including journals that documents create internally. The error is "is not within your range of allowed posting dates". *Src:* `Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:77,519-551`; `UserSetupMgt:216-220`. *Keep:* MUST. Enforce it in the posting engine, not in the UI.

### C. Closing dates and the year-end close
- **R-PERIODS-REPORTING-12**: A closing date C(D) sorts after D and before D+1. `G/L Entry."Posting Date"`, `Gen. Journal Line."Posting Date"` and `G/L Budget Entry.Date` accept C-dates. *Src:* `Finance/GeneralLedger/Ledger/GLEntry.Table.al:82`; `Finance/GeneralLedger/Journal/GenJournalLine.Table.al:275`; `Finance/GeneralLedger/Budget/GLBudgetEntry.Table.al:73`. *Keep:* MUST (store `posting_date` plus `is_closing`; see §5.1).
- **R-PERIODS-REPORTING-13**: A window `[From..To]` with a normal `To = 31.12` **excludes** `C31.12`. To post the closing voucher, the window must reach at least `C31.12` (e.g. `To` blank, `01.01` of the next year, or `C31.12`). *Src:* `UserSetupMgt:370-372` (AL date ordering). *Keep:* MUST.
- **R-PERIODS-REPORTING-14**: A C-date line is allowed only if **both** `Account Type` and `Bal. Account Type` are G/L Account ("can only be a closing date for G/L entries"). In addition, the period that starts on `NormalDate(posting date) + 1` must exist, be `New Fiscal Year` and be `Date Locked`. In other words, closing dates are allowed only on the last day of a year that has been closed. *Src:* `GenJnlCheckLine.Codeunit.al:76,527-537`; `AccountingPeriodMgt.Codeunit.al:37-46`. *Keep:* MUST. *Invariant:* sub-ledgers (customers, vendors, banks) never carry closing entries, and no one can post C-dates in the middle of a year.
  - (added-in-verification) Because R93 also sets `Date Locked` on the **first period ever created** (R-03), the check also passes for the C-date just **before the very first fiscal year** (e.g. `C31.12.2024` when the first FY starts 01.01.2025), without any year having been closed. This is BC's route for posting opening balances on a closing date (§9 Q6). Item journals reject C-dates outright (`Inventory/Journal/ItemJnlCheckLine.Codeunit.al:315-316`). *Src:* `Foundation/Period/CreateFiscalYear.Report.al:109-110`; `AccountingPeriodMgt.Codeunit.al:43-45`.
- **R-PERIODS-REPORTING-15**: For C-dates the posting engine (a) skips the `Direct Posting` check (it is also skipped for `System-Created Entry` lines) and (b) computes its date-weighted balance checksum with a +50 offset. The checksum weights every amount by `(date − 01.01.0000) mod 99 + 1` and `mod 98 + 1` and requires both sums to be 0, so in practice a transaction must balance **per posting date**, and the +50 offset makes `C(D)` count as a different date from `D`. (verified-corrected) *Src:* `GenJnlPostLine.Codeunit.al:7465-7477,2569-2582`. *Keep:* MUST (balance per `(posting_date, is_closing)`).
- **R-PERIODS-REPORTING-16**: Preconditions of R94: `EndDate + 1` must be a `New Fiscal Year` period that is `Date Locked`. Otherwise the error is "The fiscal year must be closed before the income statement can be closed" (or "does not exist"). The posting date is `ClosingDate(EndDate)`. The default end date is (last locked FY start) − 1. `Document No.` is mandatory and is peeked from the batch's number series. *Src:* `CloseIS:402-411,448-452,502,580-613,619-627`. *Keep:* MUST.
- **R-PERIODS-REPORTING-17**: **Scope:** only G/L accounts with `Account Type = Posting` and `Income/Balance = Income Statement`. Entries are read from `FiscalYearStartDate..ClosingDate(EndDate)`, so earlier closing entries at the same C-date are netted in and a re-run closes only the remaining delta **in total**; without dimension/BU grouping the re-run still emits one line per G/L entry, including offsetting lines for the earlier closing entries (R-22, 6.5). (verified-corrected) *Src:* `CloseIS:41,45,196`. *Keep:* MUST. *Notes:* the `Income/Balance` flag decides closing. `Account Category` decides only the presentation (R-41).
- **R-PERIODS-REPORTING-18**: **Amounts:** for each account (and each group of business unit and selected dimension values), the line amount is `−Σ Amount`. Groups that net to zero are skipped, but this only matters when entries are actually grouped (selected dimensions, BU or the `GroupSum` fast path); in the ungrouped case each entry is its own group (R-22) and nothing nets away. (verified-corrected) In *Balance* mode a final line on the retained-earnings account gets `Amount = +Σ(all closed amounts)` with no dimensions. In *Details* mode every line gets `Bal. Account = RE` and no summary line is written. *Src:* `CloseIS:138-171,163-167,218-237`. *Keep:* MUST (Balance mode), SHOULD (Details mode).
- **R-PERIODS-REPORTING-19**: The retained-earnings account must be a Posting account with Balance Sheet and category Equity or blank. It defaults to the first account mapped to an Equity category with `Additional Report Definition = Retained Earnings`. The field is enforced only by the lookup's table relation and `CheckGLAcc`; the report **requires** it only when ACY is used (`CloseIS:467-469`). Without ACY a blank RE account produces a Balance-mode line with a blank account, or Details-mode lines with a blank balancing account, which fail at posting. (verified-corrected) *Src:* `CloseIS:319-335,413-421`. *Keep:* MUST (make it mandatory).
- **R-PERIODS-REPORTING-20**: **Dimensions:** the user picks the dimensions to close by. Closing lines carry only the picked dimensions. For global dimensions only (and when grouping by BU or Dim 1) the report sums by filter in a fast path. The report warns if any G/L account has a default dimension with `Value Posting = Code Mandatory/Same Code` on a dimension that was not picked, because those lines would fail to post. *Src:* `CloseIS:60-63,74-85,454-462,482-496,665-690,718-754`. *Keep:* SHOULD (the micro-ERP default is no dimensions; exempt system closing entries from mandatory-dimension rules).
- **R-PERIODS-REPORTING-21**: **Output:** without ACY, the lines are **inserted into the chosen general journal batch, not posted**. The user reviews and posts them. With ACY they are posted directly and Details mode is forced. The lines carry `Source Code = Close Income Statement` and the batch's `Reason Code`. Nothing stops a second run from appending duplicate lines while the first ones are still unposted. *Src:* `CloseIS:141-142,467-478,498-505,635-658`. *Keep:* MUST (generate a draft closing voucher, then post it; block a re-run while a draft exists).
- **R-PERIODS-REPORTING-22**: A v29 detail: the grouping key is (`Business Unit Code`, `Entry No.`). `Entry No.` is the id of the selected-dimension combination, or a **new negative number** when the entry has no selected dimension values. With no dimensions selected and no business-unit grouping (so the `GroupSum` fast path is off), each G/L entry therefore becomes its own closing line. The totals are identical, only more lines are produced. *Src:* `CloseIS:85-108,805-812`; `Finance/Dimension/DimensionBufferManagement.Codeunit.al:259-264`. *Keep:* SKIP (aggregate per account and dimension set).

### D. G/L FlowFields and date semantics
- **R-PERIODS-REPORTING-23**: The FlowFields are defined as follows:
  - `Net Change` = Σ`Amount` with `Posting Date` ∈ `Date Filter`.
  - `Balance at Date` = Σ`Amount` with `Posting Date` ≤ `upperlimit(Date Filter)`.
  - `Balance` = Σ`Amount` over all dates.
  - `Debit Amount` / `Credit Amount` = Σ of the gross columns within the `Date Filter`.

  All of them filter on `No.` **or** the `Totaling` filter for total accounts, the global dimension 1/2 filters, the business-unit filter and the dimension-set filter. `Net Change`, `Balance at Date`, `Debit Amount` and `Credit Amount` also filter `VAT Reporting Date` on the `VAT Reporting Date Filter` FlowFilter (upper limit for `Balance at Date`); `Balance` does not. (verified-corrected) *Src:* `Finance/GeneralLedger/Account/GLAccount.Table.al:388,416-450,501-513,664-697`. *Keep:* MUST.
- **R-PERIODS-REPORTING-24**: `Budgeted Amount` = Σ`G/L Budget Entry.Amount` within the date filter and the budget filter. `Budget at Date` uses the upper limit. `Budgeted Credit Amount` = −Σ. Budgets use the ledger sign convention, so revenue budgets are negative. *Src:* `GLAccount.Table.al:456-467,519-530,714-746`. *Keep:* SHOULD.
- **R-PERIODS-REPORTING-25**: Beginning balances use `..ClosingDate(start − 1)`, which **includes** the prior year-end closing entries. The one exception is the `Rest of Fiscal Year` column × `Beginning Balance` row, which uses `0D..To` (a normal date) (§5.2). (verified-corrected) Period and "at date" filters end on a normal date, which **excludes** the closing entries of that day. Result: the income statement for `01.01..31.12` shows the profit; the balance sheet at `31.12` is the pre-closing view; and the balance at the next year's start has zero P&L accounts. *Src:* `AccSchedMgt:1445,1462,1468,1491`; `src/Apps/W1/ExcelReports/App/src/Financials/TrialBalance.Codeunit.al:153`. *Keep:* MUST.

### E. Financial report engine
- **R-PERIODS-REPORTING-26**: A report is `Financial Report` = row definition (T84 + T85) × column definition (T333 + T334), plus default filters. `CalcCell(row, column)` is evaluated for every visible cell. *Src:* `Finance/FinancialReports/FinancialReport.Table.al:207-224`; `AccSchedMgt:605-658`. *Keep:* MUST (simplified).
- **R-PERIODS-REPORTING-27**: Totaling types:
  - `Posting Accounts`: filter `No.` on `Totaling` and `Account Type = Posting`.
  - `Total Accounts`: `Account Type <> Posting`, summed through each account's own `Totaling`.
  - `Formula`.
  - `Set Base For Percent`.
  - `Cost Type` / `Cost Type Total`.
  - `Cash Flow Entry/Total Accounts`.
  - `Account Category` (category entry numbers).

  Fast path: a Posting-Accounts filter of ≤ 250 characters without `*` is evaluated as a single pseudo-total account (one aggregate query). *Src:* `Finance/FinancialReports/AccScheduleLineTotalingType.Enum.al:26-82`; `AccSchedMgt:739-757,1182-1215`. *Keep:* MUST for Posting Accounts, Formula and Account Category; SHOULD for Set Base For Percent; SKIP for the cost and cash-flow types and Total Accounts (use categories).
- **R-PERIODS-REPORTING-28**: Account Category totaling does a breadth-first walk from the listed categories through all their descendants. It sums the posting accounts whose `Account Subcategory Entry No.` is in the visited set. A visited set prevents double counting. *Src:* `AccSchedMgt:793-831`. *Keep:* MUST.
- **R-PERIODS-REPORTING-29**: An empty `Totaling` returns 0 (header or blank line). If the row date filter has no start or end, or the end is `31.12.9999`, the cell returns 0 and sets `PeriodError`. *Src:* `AccSchedMgt:619-623,714-715,734-737`. *Keep:* MUST (a bounded date range is mandatory).
- **R-PERIODS-REPORTING-30**: The date range of a cell is derived from the column type × row type matrix (§5.2) after the column's comparison shift. *Src:* `AccSchedMgt:1432-1503`. *Keep:* MUST for Net Change, Balance at Date, Beginning Balance and Year to Date; SHOULD for Entire FY, Rest of FY and Month to Date.
- **R-PERIODS-REPORTING-31**: `Comparison Date Formula` (e.g. `-1Y`) shifts the start and end dates. If the base range is whole months, the end is snapped to the month end (e.g. Feb 2025 → 01.02–29.02.2024). The fiscal-year start is then recomputed from the new end. `Comparison Period Formula` (`-1P`, `-1FY`, `FY[1..CP]`, tokens P/FY/CP/LP) uses accounting periods. The two formulas are mutually exclusive. *Src:* `AccSchedMgt:520-538,2491-2526`; `Finance/FinancialReports/ColumnLayout.Table.al:108-117,157-170`; `Foundation/Period/PeriodFormulaParser.Codeunit.al:10-15`. *Keep:* MUST for the date formula, SHOULD for the period formula.
- **R-PERIODS-REPORTING-32**: With `Ledger Entry Type = Entries` the cell sums G/L entries. With `Budget Entries` it sums G/L budget entries. For budgets, the Debit/Credit amount type is derived from the sign of the net (Debit = max(net, 0), Credit = max(−net, 0)), and the budget name comes from the column's `Budget Name`, else from the row's budget filter. Row and column `Amount Type` combine as follows: if either side is Net, the other side wins; Debit against Credit gives 0. *Src:* `AccSchedMgt:887-888,893-1050,1290-1293,2579-2591`. *Keep:* MUST for Entries, SHOULD for Budget and for the amount types.
- **R-PERIODS-REPORTING-33**: Formula grammar:
  - Operators: `+ - * / ^ %`, plus parentheses.
  - Operands are **filters** on `Row No.` (row formulas) or `Column No.` (column formulas). Ranges `a..b` and lists `a|b` are allowed. All matching lines **except the current one** are summed.
  - A token of more than 10 characters that is not a filter is a numeric constant. A shorter token is a constant only if no row or column with that number exists.
  - An unknown reference raises the error "illegal value or nonexistent row number".
  - Division by zero (`/` or `%`) returns 0 and sets `DivisionError`.

  *Src:* `AccSchedMgt:1120-1180,1655-1686,1726-1789,2023-2039`. *Keep:* MUST.
- **R-PERIODS-REPORTING-34**: The parser looks for the **rightmost top-level** operator, trying `+`, then `-`, `*`, `/`, `^`, `%`, and recurses on both sides. The effect is left-associative evaluation with `+ -` binding loosest and `%` tightest; `^` is also left-associative. A missing left operand is 0, so `-F1` works as unary minus. If the column wins (R-35) and the column formula ends with a bare `%` (e.g. `C1%`) on a row that is not a base row, the left side is divided by the same expression evaluated on the nearest **preceding** `Set Base For Percent` row. *Src:* `AccSchedMgt:540-587,1688-1724,1757-1767`. *Keep:* MUST for precedence; SHOULD for the base percent.
- **R-PERIODS-REPORTING-35**: Precedence between row and column: if the column is a `Formula`, it wins even on formula rows. Otherwise a formula row evaluates its row formula with the same column. The checks are: balanced parentheses, no two operators in a row, and no operator at the end or before `)`. These operator checks cover only `+ - * / ^`; `%` is not checked, which is what lets a trailing `%` (base percent, R-34) through. (verified-corrected) *Src:* `AccSchedMgt:722-733`; `Finance/FinancialReports/AccScheduleLine.Table.al:571-608`; `ColumnLayout.Table.al:98-103`. *Keep:* MUST.
- **R-PERIODS-REPORTING-36**: Formulas work on **raw signed** values (`CalcCellValue`), never on displayed values. The Show filters and sign flips are applied once, by `CalcCell`, on the outermost cell. *Src:* `AccSchedMgt:646-647,1137,1166`. *Keep:* MUST. *Invariant:* the totals stay arithmetically correct whatever the presentation flags are.
- **R-PERIODS-REPORTING-37**: `FormatCellResult` runs in this exact order:
  1. Column `Show` (When Positive → zero if raw < 0; When Negative → zero if raw > 0).
  2. Column `Show Opposite Sign`.
  3. `Show Indented Lines`.
  4. Row `Show Opposite Sign`.

  *Src:* `AccSchedMgt:660-698`. *Keep:* MUST. *Notes:* a percentage column is flipped by the row sign too (pitfall §8.8).
- **R-PERIODS-REPORTING-38**: Row `Show` values:
  - `Yes`, or `No` (the row is never printed).
  - `If Any Column Not Zero`.
  - `When Positive Balance` / `When Negative Balance`: for account rows, the test runs inside `CalcGLAcc` on the **raw** net of that call's G/L entries within the column's date filter, per column. It is per G/L account only when the engine loops over accounts (Total Accounts, Account Category rows, or a Posting Accounts filter longer than 250 characters or containing `*`). The usual Posting Accounts row (≤ 250 characters, no `*`) takes the pseudo-total fast path (R-27), so the test is applied **once to the whole row's aggregate**. A single-account row (a typical VAT or bank row) behaves the same either way. For formula rows the test runs in the report on the **displayed** value (after the sign flips of R-37). (verified-corrected)

  `Set Base For Percent` rows are never printed. *Src:* `AccSchedMgt:739-757,890-891,1053-1060`; `Finance/FinancialReports/AccountSchedule.Report.al:234-238,1076,1092-1102,1411-1423`. *Keep:* MUST for Yes/No/If non-zero; SHOULD for the positive/negative test. Decide explicitly whether it is per account or per row; BC's default path is per row.
- **R-PERIODS-REPORTING-39**: Dimension filtering. The row's runtime dimension filters (filter group 0), the row's `Dimension n Totaling` (group 2) and the column's `Dimension n Totaling` (group 8) are **AND-ed**. Dimension values of type Total or End-Total are expanded to their `Totaling`. Without an analysis view only global dimensions 1 and 2 reach `G/L Entry`. *Src:* `AccSchedMgt:1217-1255,2067-2154,2448-2466`. *Keep:* SHOULD (filter on the dimension set in SQL).
- **R-PERIODS-REPORTING-40**: Cells are memoized per (row line, column line). The cache is cleared when the row or column filters, the names or the ACY flag change. *Src:* `AccSchedMgt:629-645,717-721,839-845`. *Keep:* SHOULD (memoize per report run; also gives cycle detection).

### F. Categories and generated statements
- **R-PERIODS-REPORTING-41**: A category's `Account Category` derives `Income/Balance` (Income, COGS, Expense → Income Statement). `Additional Report Definition` is allowed only on balance-sheet categories. `Presentation Order` = class digit (Assets 0 … Expense 5) + a 6-digit sibling sequence per level, and `Indentation` = depth. The G/L account's category also derives its own `Income/Balance`. *Src:* `Finance/GeneralLedger/Account/GLAccountCategory.Table.al:85-129,196-238`; `GLAccount.Table.al:184-187`. *Keep:* MUST (derive, never type by hand). We use `parent_id` + `sort_order` instead of the order string.
- **R-PERIODS-REPORTING-42**: Accounts are mapped through `G/L Account."Account Subcategory Entry No."`. `ValidateTotaling` maps only the accounts in the filter that have the same `Income/Balance` as the category. Other accounts in the filter are **silently skipped**, and it errors only if none match. (verified-corrected) A system-generated category, or one still used by an account, cannot be deleted. Deleting a category deletes its children. *Src:* `GLAccountCategory.Table.al:164-176,412-455`. *Keep:* MUST.
- **R-PERIODS-REPORTING-43**: The seed tree (`InitializeAccountCategories`) has 6 system roots and their subcategories (Cash, AR, Prepaid, Inventory, Equipment, Accum. Depreciation, Current, Payroll and Long-term Liabilities, Common Stock, Retained Earnings, Distributions, Income types, COGS types, Expense types). It exits only if some G/L account is already mapped **and** categories exist. Otherwise it clears every account's mapping, deletes all existing categories and reseeds. (verified-corrected) *Src:* `Finance/GeneralLedger/Account/GLAccountCategoryMgt.Codeunit.al:154-262`. *Keep:* SHOULD (replace with Mongolian Form A sections).
- **R-PERIODS-REPORTING-44**: Generated statements:
  - Balance sheet = Assets group, Liabilities group, Equity group, then "Total Liabilities & Equity" = `F(liab)+F(equity)`.
  - Income statement = Income, COGS, Gross Profit = `Income+COGS`, Expense, Net Income = `GrossProfit+Expense`.
  - `Show Opposite Sign = not PositiveNormalBalance` (credit-normal categories Liabilities, Equity and Income are flipped).
  - Leaf rows get `Show = If Any Column Not Zero`.
  - A parent gets a heading row (its own accounts) and a `Total …` formula over its children.
  - Column layouts: Balance at Date for the balance sheet, Net Change for the rest.

  *Src:* `CategGen:43-136,325-380`; `GLAccountCategory.Table.al:481-484`; `GLAccountCategoryMgt.Codeunit.al:316-415,465-487`. *Keep:* MUST (logic).
- **R-PERIODS-REPORTING-45**: The balance sheet's Retained Earnings row = the RE accounts **OR all income-statement accounts** ("must include non-closed income statement"). *Src:* `CategGen:354-362,434-447`. *Keep:* MUST. *Invariant:* Assets = Liabilities + Equity at any date, before or after the close and whether or not the close was ever run.
  - (added-in-verification) The invariant holds only if **every** balance-sheet posting account is mapped to a subcategory and no filter string is truncated. Category rows are built from `GetTotaling()` (accounts whose `Account Subcategory Entry No.` = the category, `CopyStr(…, 250)`), so an unmapped balance-sheet account is silently left off the statement. *Src:* `GLAccountCategory.Table.al:527-540`. The new system needs a "no unmapped accounts" check before it shows a statement.
- **R-PERIODS-REPORTING-46**: Row numbers are `P0001` (account rows) and `F0001` (formula rows), zero-padded. Subtotals use ranges `P000a..P000b`. Because the comparison is by **string**, the `F` rows fall outside a `P` range, so nested subtotals are not double counted. *Src:* `CategGen:350,399-408`. *Keep:* MUST if string ranges are kept; otherwise use explicit child references.
- **R-PERIODS-REPORTING-47**: The cash-flow statement (indirect method) is built from `Additional Report Definition`: Net Income + Operating, Investing and Financing net changes, with cash at the beginning (Beginning Balance row) and cash at the end = `−NetIncrease + Beginning`. The retained-earnings statement = RE opening (Beginning Balance) + Net Income − Distributions. *Src:* `CategGen:137-310`. *Keep:* SHOULD (Mongolia's МГТ is the direct method; see `mn-accounting.md`).
  - (added-in-verification) **Sign caution.** The generated formulas are `Gross = Primo + NetIncome` and `Ultimo = Gross − Distributions`, evaluated on raw signed values (R-36). Primo and Net Income are credit-negative, while distributions are debit-positive and their row is not flipped. Example: RE opening 100, profit 50, distributions 20 give raw `Gross = −150` and `Ultimo = −150 − 20 = −170`, displayed as **170** instead of the correct 130. On raw values the correct formula is `Gross + Distributions`. Do not copy the formula text. *Src:* `CategGen:249-310` (`'%1-%2'` at line 305, Distribution row `ShowOppositeSign = false` at 291-296).

### G. Trial balance
- **R-PERIODS-REPORTING-48**: Classic trial balance (R6, `ObsoleteState = Pending`, tag 28.0, caption "Trial Balance (Obsolete)"; it still exists in v29) (verified-corrected): for each account in `No.` order, `Net Change` and `Balance at Date` for the date filter, split into Debit and Credit columns by sign: the layout prints `BlankNegAndZero(x)` in the debit column and `BlankNegAndZero(−x)` in the credit column. Totals and headings come from the account types. *Src:* `Finance/GeneralLedger/Reports/TrialBalance.Report.al:28-30,99-111,141-151`; `Finance/GeneralLedger/Reports/TrialBalance.rdlc:2745,2809`. *Keep:* MUST (as the turnover sheet in §5.4).
- **R-PERIODS-REPORTING-49**: Replacement Excel trial balance:
  - Starting balance = `Balance at Date` with filter `..C(start−1)`, plus the gross debit and credit up to then.
  - Net change debit/credit = the gross `Debit Amount` / `Credit Amount` for the period.
  - Ending balance = `Balance at Date(end)`.
  - "Balance (Debit/Credit)" = starting gross + period gross. These are cumulative turnover, **not** netted balances.

  *Src:* `src/Apps/W1/ExcelReports/App/src/Financials/TrialBalance.Codeunit.al:146-178`. *Keep:* MUST (but present the opening and closing balances netted per account; see §5.4).
- **R-PERIODS-REPORTING-50**: The closing trial balance (R10) shows income-statement accounts over `FYstart..FYend` (pre-closing) and balance-sheet accounts over `0D..C(FYend)` (post-closing, RE included). Each is compared with the prior year. *Src:* `Finance/GeneralLedger/Reports/ClosingTrialBalance.Report.al:103-126`. *Keep:* SHOULD.

---

## 4. Flows

### 4.1 Set up the calendar (R93)
1. Default to 12 periods × `1M` with a start date. The request page prefills the latest existing period.
2. Confirm. If the new year is before an existing locked year, it is created and closed in one step.
3. Loop i = 1..N+1. Stop at N+1 if that date ≤ the start of the first **non-closed** period (`FirstPeriodStartDate`; the early `exit` also skips step 4). (verified-corrected) Init the period, set `Name` = month text, set `New FY` on i=1 and i=N+1, set `Date Locked` on i=1 if no non-closed period exists (in practice the first period ever), set Closed and Date Locked if it falls before a locked first non-closed period. Insert it if missing. Advance by the period length.
4. Update the average-cost settings (SKIP).

### 4.2 Month-end lock
1. Finish the month (reconciliations, accruals, depreciation, FX).
2. Move `Allow Posting From` (G/L Setup and/or each User Setup) to the first day of the next month. The periods themselves are untouched; BC has no per-month status.

### 4.3 Year-end in BC (order matters)
1. Create the next FY (R93). This is required by CU6 and by the FY-end lookups.
2. Post all adjustments of the old year on normal dates ≤ 31.12 (CIT accrual, FX revaluation, depreciation, inventory).
3. **Close Year** (CU6): `Closed` on all periods of the year, `Date Locked` on them plus 01.01 of the next year.
4. Make sure the posting window includes `C31.12` (R-13).
5. Run **Close Income Statement** (R94): see 4.4. The journal lines appear in the batch.
6. Review and post the batch. The closing entries are stored on `C31.12`, source code CLOSE.
7. Move `Allow Posting From` to 01.01 of the next year (lock the old year).
8. Late audit adjustment: reopen the window, post on 31.12, re-run R94 (it closes only the delta), post, lock again.

### 4.4 Close Income Statement algorithm (R94)
1. OnOpenPage: default `EndDate` = start of the last `New FY` + `Date Locked` period − 1; default RE account = first account of the "Retained Earnings" category; dimension selection = the saved user selection.
2. OnPreReport:
   1. Validate that EndDate is a closed FY end (R-16) and that `DocNo` is set.
   2. Check the dimension posting rules; confirm the warning or abort.
   3. With ACY: RE account required, force Details mode.
   4. Derive `ClosePerGlobalDim1/2/Only` from the selection.
   5. Initialise the journal line template: `Posting Date = C(EndDate)`, `Document No.`, `Description`, next `Line No.` after the last line in the batch.
3. For each posting income-statement G/L account in `No.` order:
   1. Read its entries with `Posting Date ∈ [FYstart .. C(EndDate)]`, using a key ordered by BU/dims when grouping.
   2. For each entry with a non-zero amount, add the amount to `TotalAmount`, build the selected-dimension subset of its dimension set, and add the amount to the buffer row keyed by (BU or '', dimension-combination id). When the entry has no selected dimension values, the id is a **fresh negative number per entry**, so nothing is merged (R-22). (verified-corrected) In the `GroupSum` fast path the entry's amount is first replaced by the filtered sum for its group, and the loop then skips the rest of that group.
   3. At the end of the account, for each buffer row with a non-zero amount, emit a line: `Account = this account`, `Amount = −buffer`, dimension set from the subset, shortcut dims only for the selected global dims, and in Details mode `Bal. Account = RE`. Then insert the line into the journal (or post it, with ACY).
4. After all accounts, in Balance mode with `TotalAmount ≠ 0`: emit the RE line with `Amount = TotalAmount`, no dims, no BU, `Line No. + 10000`.
5. Commit and show a message. The user then posts the batch through the normal pipeline, where CheckDates enforces R-14.

### 4.5 Cell evaluation (`CalcCell`)
1. If the column has `Show in ACY`, use ACY amounts.
2. Copy the row's runtime filters. `StartDate = min(Date Filter)`. If `EndDate` changed: `EndDate = max(Date Filter)` and `FiscalStartDate = FY start(EndDate)`.
3. If the filters, names or ACY changed since the last call, clear the cache and the base-percent rows.
4. `CalcCellValue(row, col)`:
   1. Empty Totaling → 0.
   2. Cached → return.
   3. Column is a Formula → evaluate the column formula over the columns of this row.
   4. Else row is a Formula or Set Base For Percent → evaluate the row formula over the rows in this column.
   5. Else, if the dates are invalid → 0 + PeriodError.
   6. Else by totaling type: apply the account row filters (R-27) and the column date filter (§5.2), then sum `CalcGLAcc` per account, or once for the pseudo-total fast path. The per-account steps are: amount-type conflict → 0; Entries or Budget aggregate under the AND-ed filter groups (R-39); per-account Show positive/negative test.
   7. Store the result in the cache together with the error flags.
5. `FormatCellResult` (R-37) → value for display. The report then applies `FormatCellAsText`: rounding factor, then `%` suffix if the column formula contains `%`, then the negative format.

### 4.6 Generate statements from categories (CU571)
1. Ensure that the report names, the two column layouts (Balance at Date, Net Change) and the financial reports exist (GLAccountCategoryMgt).
2. For each statement: delete its rows, then for each root category of the relevant classes (in Presentation Order), recursively: a parent gets a heading row (its own accounts), then its children, then a `Total` formula `P_from..P_to`. A leaf gets a Posting Accounts row (the RE leaf adds the income-statement filter) with `Show = If Any Column Not Zero`.
3. Append the formula rows (Gross Profit, Net Income, Total L+E).

### 4.7 Trial balance
For each posting account (and each total/heading row for display): opening = Σ up to `C(start−1)`; turnover Dr/Cr = Σ gross debits and credits in `[start..end]`; closing = opening + Dr − Cr = Σ up to `end`. Check that Σ opening = 0, Σ Dr turnover = Σ Cr turnover, and Σ closing = 0.

---

## 5. Calculations and rounding

### 5.1 Encoding C-dates for SQL
Use the ordinal key `k(d, closing) = 2·days(d) + (closing ? 1 : 0)`. The BC filters then become:
- `a..b` (normal endpoints) → `k ∈ [2a, 2b]`, which includes C-dates strictly inside the range and excludes `C(b)`.
- `Balance at Date(D)` → `k ≤ 2D`.
- `Beginning balance before S` = `..C(S−1)` → `k ≤ 2S−1`, i.e. `k < 2S`.
- `Net Change` incl. closing → `[2a, 2b+1]`.

Aggregates:
- `NetChange(A, a, b) = Σ amount WHERE account ∈ A AND k BETWEEN 2a AND 2b`
- `BalanceAt(A, D) = Σ amount WHERE k ≤ 2D`; `Opening(A, S) = Σ amount WHERE k < 2S`; `Balance(A) = Σ amount`
- Debit and credit turnover = Σ of the `debit_amount` / `credit_amount` columns over the same predicate.

### 5.2 Date ranges per column type × row type
`From`/`To` = the row date filter after the comparison shift. `FYS` = FY start of `To` (or of the shifted range). `FYE(x)` = FY end containing x. "0" means the cell is forced to zero (filter `= 0D`). Src `AccSchedMgt:1439-1503`.

| Column type \ Row type | Net Change | Balance at Date | Beginning Balance |
|---|---|---|---|
| Net Change | `From..To` | `0D..To` | `..C(From−1)` |
| Balance at Date | `0D..To` | `0D..To` | 0 |
| Beginning Balance | `..C(From−1)` | 0 | `..C(From−1)` |
| Year to Date | `FYS..To` | `0D..To` | `..C(FYS−1)` |
| Rest of Fiscal Year | `To+1..FYE(FYS)` | `0D..FYE(To)` | `0D..To` |
| Entire Fiscal Year | `FYS..FYE(FYS)` | `0D..FYE(To)` | `..C(FYS−1)` |
| Month to Date | `CM-start(To)..To` | `0D..To` | `..C(CM-start(To)−1)` |

The comparison shift is `From' = CalcDate(f, From)` and `To' = CalcDate(f, To)`. If `From` and `From'` are month starts and `To` is a month end, then `To' := month-end(To')`. Src `AccSchedMgt:2499-2507`.

### 5.3 Formula evaluation
- `a % b = 100·a/b`; `a / 0 = 0` (+ DivisionError); `a ^ b = Power(a,b)`. Src `AccSchedMgt:1655-1678`.
- An operand is the Σ of the raw `CalcCellValue` over all matching rows or columns except the current one. Recursion has no explicit cycle guard beyond "not self", so the new system must detect cycles.
- Base percent: in a column formula `X%` (no right operand, row is not a base row) → `100·X(row) / X(base row)`, where the base row is the nearest preceding `Set Base For Percent` row.

### 5.4 Trial balance (turnover sheet) presentation for MN
- `OpeningDr = max(Opening, 0)`, `OpeningCr = max(−Opening, 0)`
- `TurnDr = Σ debit_amount`, `TurnCr = Σ credit_amount`
- `Closing = Opening + TurnDr − TurnCr`
- `ClosingDr = max(Closing, 0)`, `ClosingCr = max(−Closing, 0)`

Each account is netted by itself. R6 does the same split for the net change and the balance. R49's "Balance (Debit)" is gross and must not be copied.

### 5.5 Display pipeline and rounding
1. Start from the raw value (Dr+).
2. Apply column Show (on the raw sign; "When Positive" means "when a debit").
3. Apply column Opposite Sign.
4. Apply Indented-lines zeroing.
5. Apply row Opposite Sign.
6. `RoundAmount` (`Finance/Analysis/MatrixManagement.Codeunit.al:609-635`):
   - None: no rounding; formatted with G/L Setup `Amount Decimal Places`.
   - `1`: `Round(x, 1)`.
   - `1000`: `Round(x/1000, 0.1)`.
   - `1000000`: `Round(x/1e6, 0.1)`.
   - AL `Round` defaults to "nearest", with .5 rounded away from zero.
7. A zero result prints as blank.

Rounding is **display-only and per cell**: subtotals are rounded from unrounded sums, so the displayed parts need not foot. Example: 1,449 + 1,449 = 2,898 at factor 1000 displays 1.4 + 1.4 → 2.9.

### 5.6 Close Income Statement amounts
For each income-statement posting account `i` and group `g`: `L(i,g) = −Σ amount(i,g, FYS..C(FYE))`. In Balance mode the RE line = `+Σ_i,g Σ amount` = −(net profit). A profit therefore credits RE and a loss debits it. The voucher sums to zero by construction: `Σ L + RE = 0`.

---

## 6. Worked posting examples (MNT, 10% VAT)

Company: a new ХХК with FY 2025 = 01.01–31.12.2025 and 12 monthly periods. Dimension DEPT ∈ {SALES, ADMIN}. The CIT rate is illustrative (see `mn-tax.md`).

### 6.1 Year 2025 vouchers (all on normal dates)
| # | Date | Account | Dr | Cr | DEPT |
|---|---|---|---|---|---|
| V1 | 02.01 | 1110 Bank | 10,000,000 | | |
| | | 3100 Charter capital | | 10,000,000 | |
| V2 | 15.03 | 1400 Inventory | 4,000,000 | | |
| | | 1300 VAT receivable | 400,000 | | |
| | | 2100 Trade payables | | 4,400,000 | |
| V3 | 20.06 | 1200 Trade receivables | 8,800,000 | | SALES |
| | | 5100 Sales revenue | | 8,000,000 | SALES |
| | | 2300 Tax payable (VAT) | | 800,000 | SALES |
| V4 | 20.06 | 6100 COGS | 3,000,000 | | |
| | | 1400 Inventory | | 3,000,000 | |
| V5 | 30.09 | 7200 G&A expense (rent) | 1,000,000 | | ADMIN |
| | | 1300 VAT receivable | 100,000 | | ADMIN |
| | | 1110 Bank | | 1,100,000 | ADMIN |
| V6 | 31.12 | 7200 G&A expense (salary) | 1,500,000 | | SALES |
| | | 2200 Salaries payable | | 1,500,000 | SALES |
| V7 | 31.12 | 1110 Bank | 200,000 | | |
| | | 8100 Interest income | | 200,000 | |
| V8 | 31.12 | 9100 CIT expense (10% × 2,700,000) | 270,000 | | |
| | | 2300 Tax payable (CIT) | | 270,000 | |
| **Σ** | | | **29,270,000** | **29,270,000** | |

### 6.2 Trial balance, date filter 01.01.2025..31.12.2025 (opening = 0, C31.12 excluded)
| Acct | Turnover Dr | Turnover Cr | Closing Dr | Closing Cr |
|---|---|---|---|---|
| 1110 | 10,200,000 | 1,100,000 | 9,100,000 | |
| 1200 | 8,800,000 | | 8,800,000 | |
| 1300 | 500,000 | | 500,000 | |
| 1400 | 4,000,000 | 3,000,000 | 1,000,000 | |
| 2100 | | 4,400,000 | | 4,400,000 |
| 2200 | | 1,500,000 | | 1,500,000 |
| 2300 | | 1,070,000 | | 1,070,000 |
| 3100 | | 10,000,000 | | 10,000,000 |
| 5100 | | 8,000,000 | | 8,000,000 |
| 6100 | 3,000,000 | | 3,000,000 | |
| 7200 | 2,500,000 | | 2,500,000 | |
| 8100 | | 200,000 | | 200,000 |
| 9100 | 270,000 | | 270,000 | |
| **Σ** | **29,270,000** | **29,270,000** | **25,170,000** | **25,170,000** |

The income-statement accounts net to −8,000,000 + 3,000,000 + 2,500,000 − 200,000 + 270,000 = **−2,430,000**, i.e. a net profit of 2,430,000.

### 6.3 Close Income Statement, Balance mode (after CU6 closed 2025), doc CLOSE-2025, posting date **C31.12.2025**
This is what BC v29 writes into an empty batch with **no** dimension and **no** BU selection. Each G/L entry becomes its own line (R-22), so 7200 (entries V5 and V6) gets two lines. The synthetic keys are −1 for V5 and −2 for V6 and are read in ascending order, so V6 comes first. Account lines step by 10, and the RE line adds 10000 to the last line number. (verified-corrected)

| Line | Account | Signed Amount | Dr | Cr |
|---|---|---|---|---|
| 10 | 5100 | +8,000,000 | 8,000,000 | |
| 20 | 6100 | −3,000,000 | | 3,000,000 |
| 30 | 7200 (reverses V6) | −1,500,000 | | 1,500,000 |
| 40 | 7200 (reverses V5) | −1,000,000 | | 1,000,000 |
| 50 | 8100 | +200,000 | 200,000 | |
| 60 | 9100 | −270,000 | | 270,000 |
| 10060 | 3400 Retained earnings (= TotalAmount) | −2,430,000 | | 2,430,000 |
| **Σ** | | **0** | **8,200,000** | **8,200,000** |

The micro-ERP's aggregated voucher (one line per account, the recommended design) is the same with 7200 as a single line of −2,500,000. The totals are identical.

### 6.4 Same close, Details mode, closed by DEPT (each line has Bal. Account 3400 and carries its DEPT on both entries)
`Amount` is the signed journal-line amount on the income-statement account; the balancing 3400 side gets the opposite sign. (verified-corrected: the original table showed every amount as positive.) Entries without a DEPT value each get their own line. Every such account here has only one entry, so the result is the same.

| Line | Dr | Cr | Amount (signed) | DEPT |
|---|---|---|---|---|
| 5100 / bal 3400 | 5100 8,000,000 | 3400 8,000,000 | +8,000,000 | SALES |
| 6100 / bal 3400 | 3400 3,000,000 | 6100 3,000,000 | −3,000,000 | – |
| 7200 / bal 3400 | 3400 1,000,000 | 7200 1,000,000 | −1,000,000 | ADMIN |
| 7200 / bal 3400 | 3400 1,500,000 | 7200 1,500,000 | −1,500,000 | SALES |
| 8100 / bal 3400 | 8100 200,000 | 3400 200,000 | +200,000 | – |
| 9100 / bal 3400 | 3400 270,000 | 9100 270,000 | −270,000 | – |
| **Σ** | **13,970,000** | **13,970,000** | | |

3400 nets to Cr 8,200,000 − Dr 5,770,000 = **Cr 2,430,000**, the same total as in 6.3. By DEPT, 3400 is: SALES Cr 6,500,000; ADMIN Dr 1,000,000; none Dr 3,070,000.

### 6.5 Late adjustment and re-run (delta only)
In Feb 2026 the auditor finds unrecorded December utilities of 220,000 incl. VAT (ADMIN). The admin opens the window to `31.12.2025..` and posts on 31.12.2025:

| Account | Dr | Cr |
|---|---|---|
| 7200 | 200,000 | |
| 1300 | 20,000 | |
| 2100 | | 220,000 |
| **Σ** | **220,000** | **220,000** |

The re-run of R94 reads `01.01.2025..C31.12.2025`. 7200 = 2,500,000 + 200,000 − 2,500,000 = 200,000, and every other account nets to 0. In BC v29 with no dimension or BU grouping, the zero accounts are **not** skipped, because each G/L entry is its own group (R-22). The batch therefore gets offsetting line pairs for every original entry and every first-run closing entry: 5100 +8,000,000 (V3) / −8,000,000 (first-run closing entry); 6100 −3,000,000 / +3,000,000; 7200 −1,000,000, −1,500,000 and −200,000 (V5, V6, the adjustment) against +1,500,000 and +1,000,000 (the first-run closing entries); and so on, plus an RE line of +200,000 (= TotalAmount). The **net** effect is the 2-line voucher below. This is what the micro-ERP should generate, aggregated per account. (verified-corrected) Voucher CLOSE-2025-2 at C31.12.2025, net:

| Account | Dr | Cr |
|---|---|---|
| 3400 | 200,000 | |
| 7200 | | 200,000 |
| **Σ** | **200,000** | **200,000** |

The CIT recalculation (−20,000) should be posted before the re-run. It is omitted here.

### 6.6 Mongolian two-step variant (RE parameter = 3500 Current-year result)
If R94 targets 3500 instead of 3400, 6.3's last line credits 3500 with 2,430,000. After the shareholders approve the result (a normal date, e.g. 01.03.2026):

| Account | Dr | Cr |
|---|---|---|
| 3500 | 2,430,000 | |
| 3400 | | 2,430,000 |
| **Σ** | **2,430,000** | **2,430,000** |

### 6.7 Financial statements from the engine (after 6.3; figures in MNT)
The income statement uses a Net Change column, row filter `01.01.2025..31.12.2025`. C31.12 is excluded, so the closing entries are not visible. Raw → displayed:
- Income: 5100 −8,000,000 and 8100 −200,000 → total raw −8,200,000, flipped → **8,200,000**
- COGS: +3,000,000 → **3,000,000**
- Gross profit `F(inc)+F(cogs)` = −5,200,000 → flipped → **5,200,000**
- Expense: 7200 + 9100 = +2,770,000 → **2,770,000**
- Net income `GP+Exp` = −2,430,000 → flipped → **2,430,000**

If someone enters the filter `01.01.2025..C31.12.2025`, every line shows 0. That is wrong for the statement.

Balance sheet (Balance at Date column):

| Row (raw → shown) | at 31.12.2025 (C31.12 excluded) | at 31.01.2026 (closing included) |
|---|---|---|
| Total Assets | 19,400,000 | 19,400,000 |
| Total Liabilities | −6,970,000 → 6,970,000 | same |
| Charter capital 3100 | −10,000,000 → 10,000,000 | same |
| Retained earnings row = 3400 + all IS accounts | 0 + (−2,430,000) → 2,430,000 | (−2,430,000) + 0 → 2,430,000 |
| Total L+E `F(liab)+F(eq)` | −19,400,000 → **19,400,000** | **19,400,000** |

The balance sheet balances in both states (R-45).

Ratio pitfall (R-37): the columns are C1 = 2025, C2 = `-1Y`, C3 = `C1-C2`, C4 = `C3%C2`.
- On the Revenue row (row sign flip on), with 2024 revenue = 6,400,000: C3 raw = −8,000,000 − (−6,400,000) = −1,600,000 → shown 1,600,000. C4 raw = 100 × (−1,600,000)/(−6,400,000) = 25 → shown **−25%** (wrong sign).
- On the 7200 row (no flip), 2,500,000 vs 2,000,000 → C4 = **25%** (correct).

---

## 7. Simplifications for the micro-business system

1. **Calendar fixed by law** (Jan–Dec; `mn-accounting.md` REQ-ACC-02). Generate `fiscal_year` and 12 `period` rows automatically, and always pre-create next year when the current year opens. Drop the Create-FY options, the non-monthly periods and the average-cost fields.
2. **Explicit period status** `open → locked → closed` per month, instead of BC's "Closed does not block". The posting engine rejects any date in a non-open period. `locked` can be reopened by the Owner/Accountant role with a reason, and the action is audit-logged. `closed` is set by year close and needs a privileged "reopen year", which also flags that the closing voucher must be regenerated. Keep an optional per-user window (R-08 precedence) as an extra restriction, not a replacement.
3. **C-dates as `(posting_date, is_closing)`** plus the ordinal key of §5.1. Allow `is_closing` only on the last day of a FY whose status is `closing/closed`, only on G/L lines, and only from the year-end service (no manual C-date journals in v1).
4. **Year-end wizard** with these steps:
   1. Checklist: all 12 months locked; VAT, CIT and FX done; bank reconciled.
   2. Close the year.
   3. Generate a **draft closing voucher**: Balance mode with no dimensions by default; per-dimension closing is an option.
   4. Show a preview with balance checks.
   5. Post it.
   6. Re-runs post only the delta. A re-run is blocked while a draft exists.
   7. Optionally run the 3500 → 3400 transfer (6.6).
5. **FlowFields → SQL aggregates** over `gl_entry` with an index on `(account_id, k)`. Add a `period_balance(account, period, dims_hash, closing_flag)` table only if performance needs it. Drop the ACY, business-unit, source-currency and analysis-view variants.
6. **Report engine, v1 scope:**
   - Row types: account filter or list, category, formula.
   - Column types: Net Change, Balance at Date, Beginning Balance, YTD.
   - Comparison: a date formula (`-1Y`, `-1M`) only.
   - Ledger: actuals only, with budgets later.
   - Amount type: net, debit, credit.
   - Row Show: yes, no, if non-zero, plus per-account positive/negative (needed to split a VAT or bank balance between assets and liabilities).
   - Display: rounding factor (1, 1000) as display-only, and a new **"sign-neutral" flag for ratio columns** that skips the row flip.
   - Formulas: keep the BC grammar and its range semantics, but resolve references by row code and add cycle detection.
7. **Statements = Mongolian Form A templates** (СБТ balance sheet, ОДТ income statement, ӨӨТ, МГТ). Each posting account carries a Form A line code (`mn-accounting.md` §4.2), and the rows are generated like CU571. Keep R-45: the equity "retained earnings / current result" line includes all P&L accounts. Ship the definitions read-only in v1 and allow copies to be edited.
8. **Trial balance (эргэлтийн тайлан)** as §5.4, with a toggle "include closing entries" and drill-down to entries.
9. **SKIP:** Inventory Period, Analysis Views, cost accounting and cash-flow-forecast totaling types, business units and consolidation, ACY, Excel layout templates, report status and category tables, deferral and template posting windows, `Prior-Year Entry`, Period Formula (P/FY/CP tokens) in v1.

---

## 8. Pitfalls and edge cases

1. **C-date range semantics.** `a..b` excludes `C(b)`, while beginning balances must include `C(start−1)`. Get this wrong and either the year's P&L shows 0 or next year's P&L starts non-zero.
2. **The posting window must cover C31.12** (R-13). Otherwise the closing voucher fails with "not within allowed posting dates" even though the period logic allows it.
3. **"Closed" ≠ "locked"** in BC. Do not port BC's semantics by accident: decide explicitly (§7.2).
4. **Re-running the close** is safe only because the range includes the C-date (delta). Duplicate **unposted** drafts are the real risk (R-21).
5. **Next FY must exist** before the close and for the FY-end lookups. Otherwise CU6 refuses to close, and the FY-end lookups return `31.12.9999`. "Entire/Rest of FY" columns then silently run to `31.12.9999`, which includes everything after the year end; they do **not** raise a PeriodError. A PeriodError comes only from a **row** date filter that is open-ended or ends at `31.12.9999` (R-01, R-05, R-29). (verified-corrected)
6. **Closing touches only the G/L.** Never let C-date postings hit customers, vendors or banks. Skip the direct-posting check only for system closing entries.
7. **Balance per (date, is_closing).** A voucher that mixes normal and C-date lines must balance within each kind (R-15).
8. **Sign flips happen after the formulas.** A ratio column on a credit-normal row shows the wrong sign (6.7). Column "When Positive" tests the raw (debit) sign, not the displayed sign.
9. **Row references are string filters.** `P0001..P0010` relies on zero padding. `10..50` also matches `100`, `2`, `30A`, and so on. A short numeric token such as `100` is read as row "100" if such a row exists.
10. **Precedence and associativity** (R-34): `^` is left-associative. There is no explicit unary operator except a leading `-`. Division by zero gives 0 with a flag, not an exception. Report it visibly.
11. **Rounding does not foot** (§5.5). Statutory forms in thousand MNT may need "round each line, then derive the totals" plus a balancing difference line. This is an open question for e-balance.
12. **Show positive/negative granularity.** In BC it is per `CalcGLAcc` call. That is per account only off the fast path (Total Accounts, Account Category, or long or `*` filters); a normal Posting Accounts row is tested on the row aggregate (R-38). Choose deliberately. Per-account is right for splitting VAT, bank or counterparty balances between assets and liabilities, but it is not what a plain BC row does. (verified-corrected)
13. **Category double counting.** A category walk must dedupe (R-28). Generated subtotals must not include nested `Total` rows (R-46).
14. **Truncated filters.** CU571 builds the income-statement account filter with `CopyStr(…, 250)` (`CategGen:434-447`). A chart with many non-contiguous P&L accounts silently drops accounts from the RE line, and the balance sheet stops balancing. Use set membership, not filter strings. (added-in-verification) The same truncation applies to every category row, because `GLAccountCategory.GetTotaling()` is also `CopyStr(…, 250)` (`GLAccountCategory.Table.al:540`).
15. **Income/Balance vs category mismatch.** Closing uses `Income/Balance`, presentation uses the category. Derive one from the other (R-41) and block inconsistent edits.
16. **Mandatory dimensions** on P&L accounts make closing lines fail unless you close per that dimension or exempt system closing entries (R-20).
17. **Posting into a closed year** (after reopening) also changes CIT and the opening balances. Force the re-close and a CIT re-check (6.5).
18. **Budgets use the ledger sign.** Revenue budgets must be entered as negative, or the variance columns invert.
19. **Comparison month-end snapping** (Feb 28/29) applies only when the base range is whole months (§5.2).
20. **Concurrency.** Lock the period (status) before generating the closing voucher, so that no posting lands between the calculation and the post.

---

## 9. Open questions

1. Must a closed (or locked) month hard-block posting for every role, or may an Owner override it with an audit reason? How many reopen levels do we need: month only, or year too?
2. Mongolian practice: close straight to 3400, or to 3500 (current-year result) with a later transfer to 3400 (6.6)? If there is a transfer, on what date: 01.01 or the date of the shareholders' approval? Is a 9900 summary (Орлого, зардлын нэгдсэн данс) step required by auditors or tax inspectors?
3. Do Mongolian accountants expect a **monthly** P&L close to 9900, or only a year-end close?
4. Does e-balance require the statements in thousand MNT, footed after rounding (round-then-sum) with a rounding line?
5. Should the closing voucher be generated per dimension (DEPT/project) in v1, or only per account?
6. Opening balances on a mid-year go-live: post them on the go-live date, or create the prior FY as closed (R-03 backdated path) and post on `C31.12` of the prior year?
7. Do we need a separate VAT-date window (`bc-vat.md`), or is the posting-date period lock enough for Mongolian VAT returns?
8. Are user-editable report definitions needed in v1, or are fixed Form A templates plus a management P&L enough?
9. What is the display precision for MNT (0 vs 2 decimals) in reports and the trial balance (G/L Setup `Amount Decimal Places` equivalent)?
10. Do 1–10 employee companies need per-user posting windows at all, or is a company-wide period status enough?

---

## Verification log

An adversarial pass checked the claims against the AL source in `src/Layers/W1/BaseApp` (paths relative to it unless they start with `src/`) and recomputed every worked example. Result: 65 claims checked, 46 confirmed, 15 corrected, 4 refuted (rewritten in place). Corrected and added text is marked `(verified-corrected)` / `(added-in-verification)` above.

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| R-01 FY start/end from `New Fiscal Year` periods; end = 31.12.9999 when no next FY | corrected (CU360 returns 31.12.9999, but `T50.GetFiscalYearEndDate` returns 0D) | `Foundation/Period/AccountingPeriodMgt.Codeunit.al:66-80,123-133`; `Foundation/Period/AccountingPeriod.Table.al:146-158` |
| R-02 No periods → calendar year; C-date FY check skipped | confirmed | `AccountingPeriodMgt.Codeunit.al:41-42`; `AccountingPeriod.Table.al:149-150,170-171` |
| R-03 Create FY: N+1 periods, `New FY` on 1 and N+1, no duplicates, first period Date Locked, backdated year closed | confirmed | `Foundation/Period/CreateFiscalYear.Report.al:59-62,79-118` |
| R-04 Date Locked blocks delete, rename, `New FY` change and insert-before | confirmed | `AccountingPeriod.Table.al:42,103-121` |
| R-05 CU6 closes oldest open FY, needs next FY, locks next FY's first period, posts nothing | confirmed | `Foundation/Period/FiscalYearClose.Codeunit.al:26,36-51,64-68` |
| R-06 Closed/Date Locked do not block posting; `Prior-Year Entry` = date < first open period | confirmed (+ added: Closed gates master-data deletion) | `AccountingPeriodMgt.Codeunit.al:26-35`; `Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1912,2070`; `Utilities/MoveEntries.Codeunit.al:497-545` |
| R-07 Inventory period lock for item postings | confirmed | `Inventory/Setup/InventoryPeriod.Table.al:102-113`; `Inventory/Journal/ItemJnlCheckLine.Codeunit.al:322-325` |
| R-08 Window: User Setup row if From or To set, else G/L Setup; blank To = 31.12.9999; inclusive | confirmed | `System/User/UserSetupManagement.Codeunit.al:335-373` |
| R-09 DateFormula relative to TODAY overrides fixed dates; fixed date clears formula; From > To errors | confirmed | `UserSetupManagement.Codeunit.al:245-260,446-459`; `Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al:64-95` |
| R-11 CheckDates runs for every G/L posting (batch pre-checks, then `RunWithoutCheck`) | confirmed | `Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:142,519-551`; `GenJnlPostLine.Codeunit.al:371-386`; `Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al:1551,1587-1613` |
| R-12 `ClosingDates = true` on G/L Entry, Gen. Journal Line, G/L Budget Entry | confirmed | `Finance/GeneralLedger/Ledger/GLEntry.Table.al:82`; `Finance/GeneralLedger/Journal/GenJournalLine.Table.al:275`; `Finance/GeneralLedger/Budget/GLBudgetEntry.Table.al:73` |
| R-13 Window ending at normal 31.12 excludes C31.12 | confirmed | `UserSetupManagement.Codeunit.al:370-372` |
| R-14 C-date needs both account types = G/L and next period `New FY` + Date Locked | confirmed (+ added: also allowed before the first FY) | `GenJnlCheckLine.Codeunit.al:76,527-537`; `AccountingPeriodMgt.Codeunit.al:37-46`; `CreateFiscalYear.Report.al:109-110` |
| R-15 C-date checksum makes normal and C-dates balance "separately" | corrected (date-weighted checksum: balance per posting date; C(D) ≠ D) | `GenJnlPostLine.Codeunit.al:2049,2569-2582,7465-7477` |
| R-16 R94 preconditions, posting date C(EndDate), default end date, DocNo peeked from series | confirmed | `Finance/GeneralLedger/Setup/CloseIncomeStatement.Report.al:402-411,448-452,580-627` |
| R-17 Scope Posting + Income Statement; range FYS..C(End); re-run = delta | corrected (delta only in total; lines per R-22) | `CloseIncomeStatement.Report.al:41,45,196` |
| R-18 Line = −Σ; zero groups skipped; RE line = TotalAmount; Details uses Bal. Account | corrected (zero-skip only matters when grouped) | `CloseIncomeStatement.Report.al:65-110,138-171,218-237` |
| R-19 RE account constraints and default | corrected (required only with ACY) | `CloseIncomeStatement.Report.al:319-335,413-421,467-469` |
| R-20 Dimension selection, `GroupSum` fast path, mandatory-dimension warning | confirmed | `CloseIncomeStatement.Report.al:454-462,482-496,665-690,718-754,789-792` |
| R-21 Lines inserted into the batch (ACY: posted, Details forced); Source/Reason code; duplicates possible | confirmed | `CloseIncomeStatement.Report.al:139-142,467-478,498-505,635-658` |
| R-22 Grouping key (BU, Entry No.); negative id per entry without selected dims | confirmed | `CloseIncomeStatement.Report.al:85-108,805-812`; `Finance/Dimension/DimensionBufferManagement.Codeunit.al:259-264`; `Utilities/EntryNoAmountBuffer.Table.al:68` |
| R-23 G/L FlowField definitions | corrected (VAT Reporting Date Filter omitted) | `Finance/GeneralLedger/Account/GLAccount.Table.al:416-450,501-513,664-697` |
| R-24 Budget FlowFields; `Budgeted Credit Amount` = −Σ | confirmed | `GLAccount.Table.al:456-467,519-530,714-746` |
| R-25 Beginning balances "always" use `..C(start−1)` | corrected (Rest-of-FY × Beginning Balance uses `0D..To`) | `Finance/FinancialReports/AccSchedManagement.Codeunit.al:1473-1480` |
| §5.2 Column type × row type date matrix (21 cells) | confirmed | `AccSchedManagement.Codeunit.al:1432-1503` |
| R-27 Totaling types; Posting Accounts fast path (≤ 250 chars, no `*`) | confirmed | `AccSchedManagement.Codeunit.al:739-757,1191-1202`; `Finance/FinancialReports/AccScheduleLineTotalingType.Enum.al:26-82` |
| R-28 Account Category walk with visited set | confirmed | `AccSchedManagement.Codeunit.al:793-831` |
| R-29 Empty Totaling → 0; unbounded row filter → 0 + PeriodError | confirmed | `AccSchedManagement.Codeunit.al:714-715,734-737` |
| R-31 Comparison date formula with month-end snap; mutually exclusive with period formula | confirmed | `AccSchedManagement.Codeunit.al:2491-2518`; `Finance/FinancialReports/ColumnLayout.Table.al:108-117,157-170` |
| R-32 Budget Dr/Cr from net sign; budget name precedence; amount-type conflict → 0 | confirmed | `AccSchedManagement.Codeunit.al:993-1018,1290-1293,2579-2591` |
| R-33 Formula operands are filters, self excluded, >10-char constants, error text, ÷0 → 0 | confirmed | `AccSchedManagement.Codeunit.al:46,1120-1180,1655-1678,1782-1785,2023-2039` |
| R-34 Rightmost top-level operator by order `+ - * / ^ %`; bare `%` base percent | confirmed | `AccSchedManagement.Codeunit.al:568-585,1688-1712,1758-1771` |
| R-35 Column formula wins; CheckFormula rules | corrected (`%` not covered by the operator checks) | `AccSchedManagement.Codeunit.al:722-733`; `Finance/FinancialReports/AccScheduleLine.Table.al:571-603` |
| R-36 Formulas evaluate raw values; flips only in CalcCell | confirmed | `AccSchedManagement.Codeunit.al:646-647,1137,1166` |
| R-37 FormatCellResult order | confirmed | `AccSchedManagement.Codeunit.al:660-698` |
| R-38 Show When Positive/Negative is "per G/L account inside the sum" | refuted (per `CalcGLAcc` call: the whole-row aggregate on the default fast path; formula rows test the displayed value) | `AccSchedManagement.Codeunit.al:739-757,890-891,1053-1060`; `Finance/FinancialReports/AccountSchedule.Report.al:1076,1092-1102` |
| R-39 Dimension filter groups 0/2/8 AND-ed; only global dims without analysis view | confirmed | `AccSchedManagement.Codeunit.al:1217-1255` |
| R-40 Cell cache and invalidation | confirmed | `AccSchedManagement.Codeunit.al:629-645,717-721` |
| R-41 Category → Income/Balance; Additional Report Definition only for BS; Presentation Order | confirmed | `Finance/GeneralLedger/Account/GLAccountCategory.Table.al:85-129,196-238`; `GLAccount.Table.al:184-187` |
| R-42 ValidateTotaling "accepts only" same Income/Balance | corrected (others silently skipped) | `GLAccountCategory.Table.al:412-440` |
| R-43 Seed "runs only when no mapping exists" | corrected (exits only if mapped and categories exist; otherwise wipes and reseeds) | `Finance/GeneralLedger/Account/GLAccountCategoryMgt.Codeunit.al:154-175` |
| R-44 Generated BS/IS structure, flips (`not PositiveNormalBalance`), GP and NI formulas, column layouts | confirmed | `Finance/FinancialReports/CategGenerateAccSchedules.Codeunit.al:43-131,325-380`; `GLAccountCategory.Table.al:481-484`; `GLAccountCategoryMgt.Codeunit.al:465-487` |
| R-45 BS RE row = RE accounts OR all IS accounts | confirmed (+ added: unmapped accounts break the invariant) | `CategGenerateAccSchedules.Codeunit.al:354-362,434-447`; `GLAccountCategory.Table.al:527-541` |
| R-46 `P0001`/`F0001` row numbers; string ranges exclude F rows | confirmed | `CategGenerateAccSchedules.Codeunit.al:350-352,399-408` |
| R-47 Cash-flow and RE statement formulas | confirmed (+ added: `Gross − Distributions` sign caution) | `CategGenerateAccSchedules.Codeunit.al:137-310` |
| R-48 R6 "obsolete since 28.0"; debit/credit split via `BlankNegAndZero` | corrected (ObsoleteState Pending, tag 28.0) | `Finance/GeneralLedger/Reports/TrialBalance.Report.al:24-30`; `Finance/GeneralLedger/Reports/TrialBalance.rdlc:2745,2809` |
| R-49 Excel trial balance: start `..C(start−1)`, cumulative gross "Balance (Debit/Credit)" | confirmed | `src/Apps/W1/ExcelReports/App/src/Financials/TrialBalance.Codeunit.al:146-178` |
| R-50 Closing TB: IS `FYS..FYE`, BS `0D..C(FYE)`, prior-year comparison | confirmed | `Finance/GeneralLedger/Reports/ClosingTrialBalance.Report.al:103-126` |
| §5.5 RoundAmount factors (1 → Round 1; 1000/1e6 → Round 0.1) | confirmed | `Finance/Analysis/MatrixManagement.Codeunit.al:609-628` |
| §1 "R94 writes one reversing line per account" | refuted (one line per G/L entry when ungrouped) | `CloseIncomeStatement.Report.al:85-108,805-812` |
| §4.1 step 3 stop condition "first existing period" | corrected (first **non-closed** period) | `CreateFiscalYear.Report.al:79-96` |
| 6.1 Vouchers: each balances; Σ Dr = Σ Cr = 29,270,000; VAT 10%; CIT 10% × 2,700,000 = 270,000 | confirmed | recomputed |
| 6.2 Trial balance: turnover 29,270,000 = 29,270,000; closing 25,170,000 = 25,170,000; IS net −2,430,000 | confirmed | recomputed |
| 6.3 Balance-mode closing voucher (one line per account, RE at 10050) | corrected (7200 splits into 2 lines; RE line 10060; totals 8,200,000 = 8,200,000 unchanged) | `CloseIncomeStatement.Report.al:139,143,225,232,805-812` |
| 6.4 Details-mode amounts shown unsigned | corrected (signed; Σ 13,970,000 = 13,970,000 and 3400 net Cr 2,430,000 confirmed) | `CloseIncomeStatement.Report.al:143,163-167` |
| 6.5 Re-run: "other accounts net to 0 and are skipped" | refuted (net 0 but emitted as offsetting per-entry lines; net voucher 200,000 = 200,000 confirmed) | `CloseIncomeStatement.Report.al:65-110,138` |
| 6.5 Adjustment 200,000 + VAT 20,000 = 220,000; delta 200,000; CIT change −20,000 | confirmed | recomputed |
| 6.6 3500 → 3400 transfer balances | confirmed | recomputed |
| 6.7 IS (8,200,000 / 3,000,000 / GP 5,200,000 / 2,770,000 / NI 2,430,000) and BS (19,400,000 = 6,970,000 + 10,000,000 + 2,430,000) in both states | confirmed | recomputed; `CategGenerateAccSchedules.Codeunit.al:62-75,119-133` |
| 6.7 Ratio pitfall: C4 raw 25 shown −25% on a flipped row | confirmed | `AccSchedManagement.Codeunit.al:660-698,1660-1665,1824-1828` |
| §5.1 Ordinal key `2·days + closing` reproduces BC's C-date filters | confirmed | derived from `AccSchedManagement.Codeunit.al:1443-1468` |
| Pitfall 5 "missing next FY gives a PeriodError" | corrected (FY-end lookups silently run to 31.12.9999; PeriodError only from the row filter) | `AccSchedManagement.Codeunit.al:734-737`; `AccountingPeriodMgt.Codeunit.al:79` |
| Pitfall 12 "Show positive/negative is per account, not per row" | refuted (per row on the default fast path) | `AccSchedManagement.Codeunit.al:739-757,1053-1060` |
| Pitfall 14 IS filter truncated to 250 chars | confirmed (+ added: category totaling also truncated) | `CategGenerateAccSchedules.Codeunit.al:434-441`; `GLAccountCategory.Table.al:540` |
| Object and enum IDs in §2 and the engine list (T50, 5814, 98, 91, 15, 17, 95/96, 570, 88, 84, 85, 333/334, 342, 386, 369, 242; R93, R94, R25, R6, R10; CU6, 8, 360, 921, 5700, 9200, 570, 571; enums 15, 16, 20, 85, 331-334, 364, 851) | confirmed | object declarations, e.g. `Finance/FinancialReports/AccSchedManagement.Codeunit.al:33`, `Foundation/Enums/AnalysisRoundingFactor.Enum.al:7` |
