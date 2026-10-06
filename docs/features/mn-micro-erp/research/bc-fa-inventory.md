# BC research: Fixed assets (minimal) and inventory costing

- **Source:** BCApps (BC v29, W1 Base App, MIT). Everything here was read from the AL code, not from documentation. Citations are repo-relative `path:line` (line ranges are inclusive).
- **Keep levels:** **MUST** = needed in the micro-ERP v1; **SHOULD** = keep in a simpler form, or add soon after v1; **SKIP** = leave out.
- **Accounts** in the examples are illustrative. They follow the CoA sketch in `mn-accounting.md` §5: 1110 bank, 1200 AR, 1300 VAT receivable, 1400 inventory, 1600 FA cost, 1690 accumulated depreciation, 2100 AP, 2300 VAT payable, 5100 sales, 6100 COGS, 7200 G&A (depreciation), 8400 other expense, 8600 gain/loss on disposal. Currency is MNT. VAT is 10%.
- **Related notes:** `bc-account-determination.md` covers the General Posting Setup matrix and the sales/purchase document leg. `bc-gl-posting.md` covers the journal and posting engine, which FA and inventory postings both go through.

---

## 1. Summary

- **FA = card + one row per depreciation book.** `Fixed Asset` (T5600) is master data only. All depreciation parameters, the posting group and the derived dates sit on `FA Depreciation Book` (T5612, key FA No. + Book). Values (acquisition cost, depreciation, book value, gain/loss) are **FlowFields over `FA Ledger Entry`** (T5601). Nothing is stored as a balance.
- **FA ledger amounts are signed:** acquisition +, depreciation −, write-down −, proceeds −, gain −, loss +. Two flags decide what counts where: `Part of Book Value` and `Part of Depreciable Basis`. `FA Posting Category` (blank / Disposal / Bal. Disposal) separates the normal entries from the automatic disposal entries.
- **G/L integration happens per depreciation book and per posting type.** An integrated line must be posted from the general journal (`Account Type = Fixed Asset`). Each FA ledger entry then produces one G/L line on the account that `FA Posting Group` gives for its (category, type). The balancing account comes from the journal line, or from the posting group's "Bal." accounts.
- **Depreciation is a batch that creates journal lines; it does not post.** The straight-line amount uses a **30/360 day count** by default. It spreads the **remaining** book value over the **remaining** life, so it corrects itself after a change in life, a write-down or a late acquisition, and the last period exactly empties the asset. Results are rounded and capped so book value never falls below the ending book value.
- **Disposal is one journal line, "Disposal", carrying the sales proceeds.** On the first disposal the engine posts automatic entries: it reverses acquisition cost and accumulated depreciation and books gain or loss = book value + proceeds (≤0 = gain). With the **Net** method these entries hit Acq. Cost/Accum. Depr. "on Disposal" and the Gains/Losses accounts. With **Gross**, proceeds and book value go to separate sales and book-value accounts.
- **Inventory keeps quantity and value in two ledgers.** `Item Ledger Entry` (T32) holds the quantity: signed `Quantity`, `Remaining Quantity`, `Open`. `Value Entry` (T5802) holds the value: one or more per ILE for direct cost, adjustment, revaluation and rounding. `Item Application Entry` (T339) links outbound to inbound quantities, and that link is the FIFO cost path.
- **Item types:** only `Inventory` items are valued. For `Service` and `Non-Inventory` items, ILEs are created with Remaining Qty 0 and no applications, their value entries carry only `Cost Amount (Non-Invtbl.)`, and nothing is posted to Inventory or COGS. The purchase or sales document line alone hits G/L.
- **At posting time the outbound cost is provisional.** It is the item card `Unit Cost` × quantity. **Adjust Cost** (CU5895) later forwards the actual cost of the applied inbound entries (FIFO) or the period average cost (Average) as `Adjustment` value entries dated on the original posting date.
- **Inventory → G/L is a delta posting from value entries** (CU5802): `CostToPost = Cost Amount (Actual) − Cost Posted to G/L`. Purchase: Dr Inventory / Cr Direct Cost Applied. Sale: Dr COGS / Cr Inventory. The account pair depends on the ILE type, not on whether the entry is an adjustment. So an Adjust Cost entry on a **sale** goes Inventory vs **COGS**, and one on a positive or negative adjustment or a transfer goes Inventory vs Inventory Adjmt. Revaluation and Rounding entries go Inventory vs Inventory Adjmt. (verified-corrected) This runs immediately only if `Automatic Cost Posting` is on.
- **Negative inventory is allowed by default.** The outbound ILE stays open with a negative remaining quantity, and a later inbound applies to it. Consumption and transfers can never go negative.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (types) | Keep |
|---|---|---|---|---|
| Fixed Asset | Table 5600 | FA master card | `No.` Code[20] PK; `Description` Text[100]; `FA Class Code`/`FA Subclass Code` Code[10]; `FA Location Code` Code[10]; `Vendor No.` Code[20]; `Responsible Employee` Code[20]; `Serial No.` Text[50]; `Blocked`, `Inactive` Bool; `FA Posting Group` Code[20]; `Main Asset/Component` Enum; `Budgeted Asset` Bool; `Acquired` FlowField | MUST (No., Description, Class, Location, Employee, Serial, Blocked/Inactive) |
| FA Setup | Table 5603 | Global FA settings | `Default Depr. Book` Code[10]; `Allow FA Posting From/To` Date; `Fixed Asset Nos.` Code[20] | SHOULD (fold into company settings) |
| Depreciation Book | Table 5611 | Book definition (accounting, tax, …) | `Code` Code[10]; `G/L Integration - Acq. Cost/Depreciation/Write-Down/Appreciation/Custom 1/Custom 2/Disposal/Maintenance` Bool; `Disposal Calculation Method` Option {Net, Gross}; `Use Same FA+G/L Posting Dates` Bool (init true); `Fiscal Year 365 Days` Bool; `No. of Days in Fiscal Year` Int (10..1080, 0 ⇒ 360); `Use Rounding in Periodic Depr.` Bool; `Default Final Rounding Amount`, `Default Ending Book Value` Dec; `Allow Changes in Depr. Fields`, `Allow Depr. below Zero`, `Allow Correction of Disposal` Bool; `Use FA Ledger Check` Bool (init true); `Periodic Depr. Date Calc.` Option | MUST, as 2 fixed books: ACCOUNTING (integrated) and TAX (memo) |
| FA Depreciation Book | Table 5612 | Per-asset, per-book parameters and derived dates | PK (`FA No.`, `Depreciation Book Code`); `Depreciation Method` Enum {Straight-Line, Declining-Balance 1/2, DB1/SL, DB2/SL, User-Defined, Manual}; `Depreciation Starting Date`, `Depreciation Ending Date` Date; `No. of Depreciation Years`, `No. of Depreciation Months` Dec(2:8); `Straight-Line %`, `Fixed Depr. Amount`, `Declining-Balance %` Dec; `FA Posting Group` Code[20]; `Ending Book Value`, `Final Rounding Amount` Dec; maintained by posting: `Acquisition Date`, `G/L Acquisition Date`, `Last Acquisition Cost Date`, `Last Depreciation Date`, `Disposal Date`; FlowFields `Acquisition Cost`, `Depreciation`, `Book Value`, `Depreciable Basis`, `Salvage Value`, `Proceeds on Disposal`, `Gain/Loss`, `Write-Down` | MUST (straight-line by months only) |
| FA Posting Group | Table 5606 | G/L accounts per asset class | `Code` Code[20]; `Acquisition Cost Account`, `Accum. Depreciation Account`, `Acq. Cost Acc. on Disposal`, `Accum. Depr. Acc. on Disposal`, `Gains Acc. on Disposal`, `Losses Acc. on Disposal`, `Depreciation Expense Acc.`, `Acquisition Cost Bal. Acc.`, `Sales Acc. on Disp. (Gain/Loss)`, `Book Val. Acc. on Disp. (Gain/Loss)`, `Write-Down Account`, `Write-Down Expense Acc.`, `Maintenance Expense Account` (all Code[20] → G/L); allocation % FlowFields | MUST (6 accounts: cost, accum. depr., depr. expense, gain, loss, write-down expense) |
| FA Ledger Entry | Table 5601 | Immutable FA subledger | `Entry No.` Int PK; `G/L Entry No.` Int; `FA No.`; `FA Posting Date`, `Posting Date` Date; `Document Type/No.`; `Depreciation Book Code`; `FA Posting Category` Enum {" ", Disposal, Bal. Disposal}; `FA Posting Type` Enum {Acquisition Cost, Depreciation, Write-Down, Appreciation, Custom 1, Custom 2, Proceeds on Disposal, Salvage Value, Gain/Loss, Book Value on Disposal, Bonus Depreciation}; `Amount`, `Debit Amount`, `Credit Amount` Dec; `Part of Book Value`, `Part of Depreciable Basis` Bool; `No. of Depreciation Days` Int; `Disposal Entry No.` Int; `Result on Disposal` Option {" ", Gain, Loss}; `Transaction No.`; `Automatic Entry`, `Correction`, `Reversed` Bool; snapshot of depreciation parameters (method, start, years) | MUST |
| FA Posting Type Setup | Table 5604 | Semantics of Write-Down/Appreciation/Custom 1/2 per book | `Part of Book Value`, `Part of Depreciable Basis`, `Include in Depr. Calculation`, `Include in Gain/Loss Calc.`, `Reverse before Disposal` Bool; `Sign` {Debit, Credit} | SKIP (hard-code write-down semantics) |
| FA fields on Gen. Journal Line / FA Journal Line | Table 81 / Table 5621 | Unposted FA transactions | `FA Posting Type` Enum {" ", Acquisition Cost, Depreciation, Write-Down, Appreciation, Custom 1, Custom 2, Disposal, Maintenance, Bonus Depreciation}; `Depreciation Book Code`; `FA Posting Date`; `No. of Depreciation Days`; `Depr. until FA Posting Date`, `Depr. Acquisition Cost` Bool; `Salvage Value` Dec; `FA Error Entry No.` Int | MUST (FA fields on the journal line and the documents; no separate FA journal) |
| FA Register, Maintenance Ledger Entry, Insurance, FA Allocation, Main Asset Component, FA Reclass Journal, Depreciation Table | T5617, T5625, T5628…, T5615, T5640, T5624, T5642 | Audit, maintenance and insurance tracking, G/L allocation, component assets, reclassification, user-defined tables | — | SKIP (maintenance = an ordinary expense line; reclassification is a later SHOULD) |
| Item | Table 27 | Item master | `No.` Code[20]; `Description` Text[100]; `Base Unit of Measure` Code[10]; `Type` Enum {Inventory, Service, Non-Inventory}; `Inventory Posting Group` Code[20] (Inventory type only); `Gen. Prod. Posting Group` Code[20]; `Costing Method` Enum {FIFO, LIFO, Specific, Average, Standard}; `Unit Cost`, `Standard Cost`, `Last Direct Cost`, `Unit Price` Dec; `Cost is Adjusted` Bool (init true); `Allow Online Adjustment` Bool; `Prevent Negative Inventory` Option {Default, No, Yes}; `Inventory` FlowField | MUST (Type, costing method FIFO/Average only, unit cost, unit price, category) |
| Inventory Setup | Table 313 | Costing switches | `Automatic Cost Posting` Bool; `Expected Cost Posting to G/L` Bool; `Automatic Cost Adjustment` Enum {Never, Day, Week, Month, Quarter, Year, Always}; `Prevent Negative Inventory` Bool; `Average Cost Calc. Type` {Item, Item & Location & Variant} (init I&L&V); `Average Cost Period` {Day…Accounting Period} (init Day); `Location Mandatory` Bool | MUST (company costing method + negative-stock policy); hard-code the rest |
| Inventory Posting Group / Setup | Table 94 / Table 5813 | Inventory balance-sheet account per (location × group) | PK (`Location Code`, `Invt. Posting Group Code`); `Inventory Account`, `Inventory Account (Interim)`, `WIP Account`, variance accounts | MUST (collapse to item category → inventory account) |
| General Posting Setup (inventory part) | Table 252 | P&L side of inventory postings | `COGS Account`, `Inventory Adjmt. Account`, `Direct Cost Applied Account`, `Purchase Variance Account`, `COGS Account (Interim)`, `Invt. Accrual Acc. (Interim)` | MUST (COGS and Inventory Adjmt. on item category) |
| Item Ledger Entry | Table 32 | Quantity ledger | `Entry No.` Int; `Item No.`; `Posting Date`; `Entry Type` Enum {Purchase, Sale, Positive Adjmt., Negative Adjmt., Transfer, Consumption, Output, …}; `Document Type/No.`; `Location Code`; `Quantity`, `Remaining Quantity`, `Invoiced Quantity` Dec; `Open`, `Positive`, `Completely Invoiced`, `Correction` Bool; `Applies-to Entry` Int; `Applied Entry to Adjust` Bool; FlowFields `Cost Amount (Actual/Expected/Non-Invtbl.)`, `Sales Amount (Actual)` | MUST |
| Value Entry | Table 5802 | Value ledger (cost and sales amounts) | `Entry No.`; `Item Ledger Entry No.`; `Item Ledger Entry Type`; `Entry Type` Enum {Direct Cost, Revaluation, Rounding, Indirect Cost, Variance, …}; `Posting Date`, `Valuation Date`; `Valued Quantity`, `Item Ledger Entry Quantity`, `Invoiced Quantity`; `Cost per Unit`; `Cost Amount (Actual)`, `Cost Amount (Expected)`, `Cost Amount (Non-Invtbl.)`; `Cost Posted to G/L`, `Expected Cost Posted to G/L`; `Sales Amount (Actual)`, `Purchase Amount (Actual)`, `Discount Amount`; `Expected Cost`, `Adjustment`, `Inventoriable`, `Valued By Average Cost` Bool; `Applies-to Entry` Int; posting groups; `Document No.` | MUST |
| Item Application Entry | Table 339 | Which inbound supplied which outbound | `Entry No.`; `Item Ledger Entry No.`; `Inbound Item Entry No.`; `Outbound Item Entry No.`; `Quantity` Dec (inbound +, outbound −); `Posting Date`; `Cost Application` Bool; `Outbound Entry is Updated` Bool | MUST (as the "cost layer consumption" table) |
| Avg. Cost Adjmt. Entry Point, Post Value Entry to G/L, Item Register, Invt. Posting Buffer | T5804, T5811, T46, T48 | Average recalculation queue, deferred G/L queue, audit, temp buffer | — | SKIP |
| G/L – Item Ledger Relation | Table 5823 | Value entry ↔ G/L entry link | `G/L Entry No.`, `Value Entry No.` | SHOULD (as FK `value_entry.gl_transaction_id`) |
| Engine codeunits | CU 5632 FA Jnl.-Post Line, CU 5600 FA Insert Ledger Entry, CU 5601 FA Insert G/L Account, CU 5602 FA Get G/L Account No., CU 5605 Calculate Disposal, CU 5606 FA Check Consistency, CU 5610/5611 Calculate (Normal) Depreciation, CU 5616 Depreciation Calculation, CU 5617 FA Date Calculation, R 5692 Calculate Depreciation; CU 22 Item Jnl.-Post Line, CU 5802 Inventory Posting To G/L, CU 5895 Inventory Adjustment, CU 5804 ItemCostManagement | Behaviour | — | MUST (re-implement the logic, not the structure) |

---

## 3. Business rules

### Fixed assets: master data and setup

- **R-FA-INVENTORY-01** — An asset's `FA Posting Group` cannot change once it has FA ledger entries. Otherwise the subledger and the G/L accounts would stop reconciling. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FixedAsset.Table.al:287-307`. *Keep:* MUST. *Notes:* the posting group actually used at posting is the one on the FA Depreciation Book, copied onto each ledger entry (`src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:172-175`). The lock above covers only the **card** field. The depreciation-book field `FA Posting Group` (T5612 field 13) is guarded only by `ModifyDeprFields`, which needs `Allow Changes in Depr. Fields` once a depreciation, write-down, appreciation, custom or disposal date exists. After an acquisition alone it can be changed with no check, and later postings would then go to another group's accounts (`src/Layers/W1/BaseApp/FixedAssets/Depreciation/FADepreciationBook.Table.al:279-289, 1044-1063`). The micro system must lock the group as soon as any FA ledger entry exists. (verified-corrected) Reclassification is the only way to move value between groups.
- **R-FA-INVENTORY-02** — Blocked or Inactive assets cannot be posted. The depreciation run skips them without telling the user. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:165-168`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateDepreciation.Report.al:32-33`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:204-211`. *Keep:* MUST (show the skipped assets in the run result).
- **R-FA-INVENTORY-03** — Once any depreciation, write-down or disposal exists, changing the method, start date, years, ending date, posting group or rounding fields needs `Allow Changes in Depr. Fields` on the book. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/FADepreciationBook.Table.al:1044-1063`. *Keep:* MUST. *Notes:* changes take effect prospectively because the straight-line formula uses the remaining life (R-20).
- **R-FA-INVENTORY-04** — Years, months and ending date are kept consistent. Months = Round(Years×12, 1e-8). Ending date = `CalculateDate(Start, Round(Years×360,1))` − 1 day on the 30/360 calendar. Entering an ending date recomputes Months = DeprDays(Start, End)/30 and clears SL% and fixed amount. A book with 365-day years refuses Years/Months and requires an explicit ending date. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/FADepreciationBook.Table.al:134-205, 290-313, 1127-1180`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/FADateCalculation.Codeunit.al:57-97`. *Keep:* MUST (store `useful_life_months`; derive the end date).
- **R-FA-INVENTORY-05** — Only linear methods (SL, DB1/SL, DB2/SL) accept years, months or an ending date. SL%, fixed amount and years exclude each other: setting one clears the others. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/FADepreciationBook.Table.al:118-133, 206-220, 1027-1042, 1194-1202`. *Keep:* SKIP the variants and keep only months.
- **R-FA-INVENTORY-06** — An asset is "ready for acquisition" when its default-book row has a posting group, a depreciation starting date and, for linear methods, years or an ending date. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/FADepreciationBook.Table.al:1376-1393`. *Keep:* MUST (validate before the first posting).

### Fixed assets: posting

- **R-FA-INVENTORY-07** — The **first** FA ledger entry in a book must be an Acquisition Cost. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:112-123`. *Keep:* MUST.
- **R-FA-INVENTORY-08** — Running-total sign invariants are checked on the posting date **and on every later date**: Σ acquisition ≥ 0; Σ depreciation ≤ 0; Σ salvage ≤ 0; Σ proceeds ≤ 0; book value + salvage ≥ 0 (unless the book allows depreciation below zero); depreciable basis ≥ 0. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:124-174, 204-219, 323-367`. *Keep:* MUST. *Notes:* checking forward in time protects back-dated postings from making a later state invalid.
- **R-FA-INVENTORY-09** — After disposal, normal postings are refused ("is disposed"). A disposal is refused if any book-value or depreciable-basis entry is dated after it ("disposal date must be the last date"). *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:178-202, 369-373`. *Keep:* MUST.
- **R-FA-INVENTORY-10** — The FA posting date must be a normal date inside the FA posting window (User Setup, then FA Setup). When `Use Same FA+G/L Posting Dates` is on (the default), it must equal the G/L posting date. A blank FA posting date takes the posting date. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlCheckLine.Codeunit.al:267-322`; `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:112-113`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationBook.Table.al:129-134`. *Keep:* MUST (one date; also run the G/L period check).
- **R-FA-INVENTORY-11** — G/L integration per posting type decides where a line may be posted. An integrated type must come from the general journal, and a non-integrated type (and salvage value, always) from the FA journal. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlCheckLine.Codeunit.al:324-392`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationBook.Table.al:36-75`. *Keep:* MUST as a fixed rule: the accounting book is integrated for every type, and the tax book never is.
- **R-FA-INVENTORY-12** — VAT and general posting groups are allowed only on Acquisition, Appreciation, Disposal and Maintenance lines. Depreciation and write-down lines must have none. When VAT applies, VAT amount + VAT base must equal the amount. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlCheckLine.Codeunit.al:163-195`. *Keep:* MUST.
- **R-FA-INVENTORY-13** — The FA ledger amount is the G/L amount **net of deductible VAT**. `PostFixedAsset` initialises the G/L entry and VAT first, then passes `GLEntry2.Amount` to the FA engine. It then inserts one G/L entry per FA G/L buffer row, followed by the VAT entries. *Src:* `src/Layers/W1/BaseApp/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1711-1819`; `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:101-149`. *Keep:* MUST.
- **R-FA-INVENTORY-14** — The G/L account comes from (category, type). With category blank: Acquisition → `Acquisition Cost Account`; Depreciation → `Accum. Depreciation Account`; Write-Down → `Write-Down Account`; Proceeds → `Sales Acc. on Disp. (Gain)`; Gain/Loss → `Gains`/`Losses Acc. on Disposal`. With category Disposal: Acquisition → `Acq. Cost Acc. on Disposal`; Depreciation → `Accum. Depr. Acc. on Disposal`; Book Value → `Book Val. Acc. on Disp. (Gain/Loss)`. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAGetGLAccountNo.Codeunit.al:20-90`. *Keep:* MUST.
- **R-FA-INVENTORY-15** — Balancing ("Bal.") accounts: for a depreciation line the batch inserts G/L lines for −Amount on `Depreciation Expense Acc.` (Acquisition → `Acquisition Cost Bal. Acc.`, Write-Down → `Write-Down Expense Acc.`). It refuses if the line already has a `Bal. Account No.`. These accounts must allow direct posting. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAInsertGLAccount.Codeunit.al:220-228, 262-311, 365-466`; `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAPostingGroup.Table.al:262-339, 520-531`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateDepreciation.Report.al:181, 292`. *Keep:* MUST.
- **R-FA-INVENTORY-16** — Flags: Acquisition Cost and Salvage Value are part of the depreciable basis. Acquisition Cost, Depreciation and Bonus Depreciation are part of the book value. Write-down and the other types follow FA Posting Type Setup (default for write-down: book value yes, basis no). Entries with a non-blank category (disposal) are **never** part of book value or basis. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAInsertLedgerEntry.Codeunit.al:212-254`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationBook.Table.al:384-407`. *Keep:* MUST (hard-coded).
- **R-FA-INVENTORY-17** — Book Value = Σ Amount where Part of Book Value (optionally ≤ a date). Once `Disposal Date` is set it is shown as 0. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/FADepreciationBook.Table.al:342-354, 1325-1338`. *Keep:* MUST.
- **R-FA-INVENTORY-18** — Each posting maintains the derived dates: `Acquisition Date` = first acquisition FA posting date; `G/L Acquisition Date` = first G/L posting date; `Last Depreciation Date` = max depreciation date; `Disposal Date` = first proceeds date. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:222-302`. *Keep:* MUST (compute them in queries or keep them as denormalised columns).
- **R-FA-INVENTORY-19** — Correcting through `FA Error Entry No.` requires an amount exactly opposite to the original, with the same type, category, book and date. Both entries then get `FA No.` blanked (`Canceled from FA No.` keeps the original), which removes them from every total. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAInsertLedgerEntry.Codeunit.al:122-150`. *Keep:* SKIP (use linked reversal entries; never blank keys).

### Fixed assets: depreciation

- **R-FA-INVENTORY-20** — **Straight-line by life = remaining value over remaining life.** `Amount = −(BookValue + SalvageValue − MinusBookValue) × NumberOfDays / RemainingLife`, where `RemainingLife = Years × DaysInFiscalYear − DeprDays(StartDate, Yesterday(FirstDeprDate))`. If `RemainingLife < 1`, the amount is −BookValue. With an ending date, Years = DeprDays(Start, End)/360. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:426-479, 618-627`. *Keep:* MUST. *Notes:* this is why changing the life, posting a later acquisition or a write-down needs no special handling. The rest is spread over what life remains.
- **R-FA-INVENTORY-21** — The SL% variant is `−SL% × Days/DaysInFY × DepreciableBasis`. The fixed-amount variant is `−Fixed × Days/DaysInFY`. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:435-449`. *Keep:* SKIP.
- **R-FA-INVENTORY-22** — **Day count, 30/360 (default):** `DeprDays = 1 + EndDay − StartDay + 30×(EndMonth − StartMonth) + 360×(EndYear − StartYear)`. A start on the 31st counts as day 30, and an end on the last day of any month counts as day 30. Both ends are inclusive. `DaysInFiscalYear` is the depreciation book's `No. of Days in Fiscal Year` field, or 360 when that field is 0. It is not the asset's book value. (verified-corrected) `ToMorrow` skips the 31st. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:36-99`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:639-641`. *Keep:* MUST. *Notes:* every full month is exactly 30 days, so monthly amounts are equal.
- **R-FA-INVENTORY-23** — **365-day option:** actual days minus any 29 Feb in the range, with DaysInFY = 365. It is incompatible with Custom 1 and with "Last Depr. Entry", and it needs an explicit ending date. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:602-645`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationBook.Table.al:288-311`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:646-654`. *Keep:* SKIP (v1 uses 30/360 monthly).
- **R-FA-INVENTORY-24** — **Depreciation period:** with no depreciation yet and no write-downs, the period starts at `Depreciation Starting Date`. Otherwise it starts at max(last acquisition date, last salvage date, ToMorrow(last depreciation date), last write-down/appreciation/custom date), never before the starting date. The write-down, appreciation and custom dates count only for types with `Include in Depr. Calculation`. For a type flagged `Depreciation Type` (write-down by default) the period starts on that date **+ 1 day** (plain +1, not `ToMorrow`), otherwise on the date itself (`src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:145-171, 647-650`). (verified-corrected) It ends at the run's FA posting date. NumberOfDays ≤ 0 gives 0. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:173-231`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:227-249`. *Keep:* MUST. *Notes:* this makes re-running a posted period return 0, so the run is idempotent.
- **R-FA-INVENTORY-24a** — **First period starts at the Depreciation Starting Date even if that date is before the acquisition.** With no depreciation and no write-down yet, `UseDeprStartingDate` forces `FirstDeprDate := Depreciation Starting Date`. The acquisition date is only used to skip assets acquired after the until-date. A starting date earlier than the acquisition therefore produces a catch-up first period, from the starting date to the until-date, on the first run (`src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:231-239`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:173-195`). *Keep:* MUST as a validation: require `depr_start_date ≥ in_service_date` (by default the first day of the next month, §7.2). (added-in-verification)
- **R-FA-INVENTORY-25** — **Skip conditions:** disposed, not acquired, Manual method, acquired after the until-date, inactive, blocked. The "nothing left to depreciate" case is handled differently. When book value + salvage ≤ 0, or salvage ≥ 0 and book value ≤ ending book value, `SkipOnZero` is set. With `Use FA Ledger Check` on (the default on both the book and the FA depreciation book), the asset is **not** skipped. Instead the method switches to "Below Zero" (`CalcBelowZeroAmount`), which returns 0 unless `Depr. below Zero %` or `Fixed Depr. Amount below Zero` is set. A real skip happens only when `Use FA Ledger Check` and `Allow Depr. below Zero` are both off. The result is 0 by default either way (`src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:543-553`). (verified-corrected) *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:150-170, 182-212`. *Keep:* MUST.
- **R-FA-INVENTORY-26** — **Final adjustment.** The amount is rounded (R-27). If it is ≥ 0 the result is 0. `MaxDepr = BookValue + Salvage − EndingBookValue` (EndingBookValue counts as 0 when there is salvage). If `MaxDepr + Depr < FinalRoundingAmount`, then `Depr := −MaxDepr`, which takes the whole remainder. Finally the result is `Round(Amount)` and must have the opposite sign to the book value. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:281-317`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:171-175, 332-352`. *Keep:* MUST. *Notes:* this keeps book value ≥ ending book value (≥ 0). When salvage is set, ending book value counts as 0 and the floor is the salvage amount (verified-corrected: the earlier wording "0 ≤ book value ≥ residual" was garbled). It also makes the last period close the asset exactly.
- **R-FA-INVENTORY-27** — **Rounding:** `CalcRounding` = `Round(x, 1)` when `Use Rounding in Periodic Depr.`, otherwise `Round(x)` (AL default precision, nearest). The batch then rounds again to G/L `Amount Rounding Precision`, which defaults to 0.01. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:406-422`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateDepreciation.Report.al:43-47`. *Keep:* MUST (round each period to the currency precision; the remaining-life formula absorbs the residual).
- **R-FA-INVENTORY-28** — **Calculate Depreciation creates journal lines; it does not post.** The FA posting date is the until-date, the posting date comes from the request, and the document no. comes from the batch series. A G/L-integrated book writes Gen. Journal lines with `Account Type = Fixed Asset` (plus balancing lines when "Insert Bal. Account", the default). Otherwise it writes FA Journal lines. With same-dates on, the posting date must equal the FA posting date. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateDepreciation.Report.al:30-94, 96-200, 360-381`. *Keep:* MUST as "draft run → preview → post".
- **R-FA-INVENTORY-29** — The days-in-fiscal-year guard ("Allow more than 360/365 Days") only takes effect for DB1 methods. `FiscalYearBegin` is set only in that branch, so for SL `DeprDays(0D, …)` returns 0. *Src:* `src/Layers/W1/BaseApp/FixedAssets/Depreciation/CalculateDepreciation.Codeunit.al:55-84`. *Keep:* SKIP (do not copy this quirk; SL catch-up across years is safe anyway).

### Fixed assets: disposal

- **R-FA-INVENTORY-30** — A journal line of type `Disposal` becomes a `Proceeds on Disposal` ledger entry (amount = −net sales price). On the **first** disposal the engine computes 14 slots: [3] = −Acquisition Cost, [4] = −Depreciation, [5..8] = −write-down/appreciation/custom, [9] = −Salvage, [10] = Book Value (Gross only), and **GainLoss = BookValue + Proceeds**. The formula also subtracts the balance of each write-down, appreciation or custom type whose FA Posting Type Setup has `Include in Gain/Loss Calc.` off. The default setup has Appreciation off and Write-Down on. Under Net, each excluded type also gets a balancing "Bal. Disposal" slot ([11..14] = −[5..8]), which posts to that type's "Bal. Acc. on Disposal" (`src/Layers/W1/BaseApp/FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:55-62`; `src/Layers/W1/BaseApp/FixedAssets/Depreciation/DepreciationBook.Table.al:384-407`). This does not matter for v1, which has no appreciation. (verified-corrected) A result ≤ 0 goes to slot [1], Gain (negative = credit). A result > 0 goes to slot [2], Loss. Each non-zero slot becomes an automatic FA entry with category Disposal (3–10), Bal. Disposal (11–14) or blank (gain/loss). *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:27-68, 215-257`; `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:229-346`. *Keep:* MUST.
- **R-FA-INVENTORY-31** — **Net vs Gross in G/L.** Net: the proceeds entry is **not** G/L-integrated, and G/L receives the Acq. Cost/Accum. Depr. "on Disposal" lines plus Gain/Loss. Gross: Gain/Loss is not integrated. The proceeds go to `Sales Acc. on Disp. (Gain or Loss)` and the book value to `Book Val. Acc. on Disp. (Gain or Loss)`. The Gain-or-Loss choice is re-made after the result is known (`CorrectEntries`). Salvage entries are never G/L-integrated. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAInsertLedgerEntry.Codeunit.al:263-287`; `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAInsertGLAccount.Codeunit.al:552-722`. *Keep:* MUST (Net only).
- **R-FA-INVENTORY-32** — A second disposal entry (a price correction) is allowed only with `Allow Correction of Disposal`, and only with the same Net/Gross method. It recomputes only the gain/loss. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:70-91, 144-170`; `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:244-262`. *Keep:* SKIP (reverse and repost instead).
- **R-FA-INVENTORY-33** — `Depr. until FA Posting Date` posts an automatic depreciation entry up to the line's date (with its balancing G/L) **before** the acquisition or disposal entry. *Src:* `src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:176-177, 348-391`. *Keep:* SHOULD (catch-up depreciation automatically when a disposal is posted).

### Inventory: items and ledgers

- **R-FA-INVENTORY-34** — `Service` and `Non-Inventory` are **non-inventoriable**. For them: `Remaining Quantity` = 0 and `Open` = false; no application entries; no inventory posting group; costing method forced to FIFO; no indirect cost; value entries put cost into `Cost Amount (Non-Invtbl.)` with `Inventoriable` = false, so nothing is posted to Inventory or COGS. *Src:* `src/Layers/W1/BaseApp/Inventory/Item/Item.Table.al:205-245, 3265-3291, 3794-3797`; `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:776-795, 2409-2410, 2548-2554, 2755-2770, 2332-2336`. *Keep:* MUST.
- **R-FA-INVENTORY-35** — `Type` cannot change once ledger entries exist. `Costing Method` cannot change with ledger entries or open purchase orders or return orders. Methods other than FIFO require Type = Inventory. *Src:* `src/Layers/W1/BaseApp/Inventory/Item/Item.Table.al:215-218, 333-361, 2928-2958`. *Keep:* MUST.
- **R-FA-INVENTORY-36** — Posting an Inventory item without an `Inventory Posting Group` fails. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:457-460`. *Keep:* MUST (use the item category).
- **R-FA-INVENTORY-37** — **Quantity and value are separate.** The ILE holds base-UoM quantity, signed (+ inbound, − outbound). At posting `Remaining Quantity = Quantity`, `Open = Remaining ≠ 0` and `Positive = Quantity > 0`. The ILE's cost and sales amounts are FlowFields summing its value entries. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:776-795`; `src/Layers/W1/BaseApp/Inventory/Ledger/ItemLedgerEntry.Table.al:417-434`. *Keep:* MUST.
- **R-FA-INVENTORY-38** — **Value-entry signs.** For Sale, Negative Adjmt., Consumption and outbound Transfer, `Valued Quantity`, `Invoiced Quantity` and the cost are negated, so outbound cost is negative. Sales amount is positive. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:2683-2701, 2733-2741`. *Keep:* MUST.

### Inventory: application and costing

- **R-FA-INVENTORY-39** — **Application.** A new entry with remaining quantity is applied to **open entries of the opposite sign** for the same item, variant and location. They are taken in key order (Posting Date, Entry No.) ascending, or descending for LIFO, unless a fixed `Applies-to Entry` is given. Each step applies min(\|remaining\|), lowers both remaining quantities, and writes an application entry (inbound no., outbound no., qty). It stops when the new entry's remaining quantity is 0. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:1390-1643, 1723-1763, 1822-1841`. *Keep:* MUST (FIFO order; the fixed apply is a SHOULD for returns).
- **R-FA-INVENTORY-40** — An application carries cost (`Cost Application` = true) for every method except Average. For Average items, only **automatic** outbound applications are quantity-only, and their cost comes from the period average. An Average application still carries cost when it is a fixed application (`Applies-to Entry` ≠ 0, e.g. a purchase return applied to its receipt), when it is an inbound entry's own self-application (`CostToApply` and inbound), or for certain corrections. (verified-corrected) *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:2463-2487`. *Keep:* MUST.
- **R-FA-INVENTORY-41** — **Outbound cost at posting is provisional:** the line's `Unit Cost` × qty. For a sale that is the item card's Unit Cost copied to the sales line. Average items use the same value until adjusted. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:2836-2860, 3283-3335`; `src/Layers/W1/BaseApp/Inventory/Journal/ItemJournalLine.Table.al:2742`. *Keep:* SKIP the provisional step. The micro system computes the exact FIFO or average cost at posting (§7).
- **R-FA-INVENTORY-42** — Inbound purchases set `Last Direct Cost = Round((Amount + Discount)/Qty, unit precision)`. The card's `Unit Cost` is replaced by it only when the item's `Net Invoiced Qty.` is > 0 and ≤ this posting's invoiced quantity, i.e. this receipt is all of the net invoiced stock. A card Unit Cost of 0 only opens the check: the net-invoiced-quantity condition must still hold (`src/Layers/W1/BaseApp/Inventory/Costing/ItemCostManagement.Codeunit.al:115-131`). (verified-corrected) Otherwise only Adjust Cost recomputes Unit Cost, as the on-hand average. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:1011-1064`; `src/Layers/W1/BaseApp/Inventory/Costing/ItemCostManagement.Codeunit.al:41-131`. *Keep:* SHOULD (show the current average or FIFO-head cost instead of a stale card value).
- **R-FA-INVENTORY-43** — **Negative inventory** is allowed unless `Prevent Negative Inventory` is set (item: Yes/No/Default → setup). It is **always** refused for Consumption, Assembly Consumption and Transfer. The check runs when an open negative ILE is inserted. An unfilled outbound stays open with negative remaining quantity, and the next inbound applies to it. *Src:* `src/Layers/W1/BaseApp/Inventory/Ledger/ItemLedgerEntry.Table.al:919-948`; `src/Layers/W1/BaseApp/Inventory/Item/Item.Table.al:3293-3308`; `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:2089-2094, 1578-1593`. *Keep:* MUST (default = prevent).
- **R-FA-INVENTORY-44** — **Adjust Cost, FIFO/applied.** For each ILE flagged `Applied Entry to Adjust`, the cost is pushed forward. Each outbound's new cost = Σ over its applications of (inbound total cost × applied qty / inbound qty), rounded per element. The difference from the old cost is posted as an `Adjustment` value entry on the outbound ILE, dated on its original posting date, or on the first open date if that period is closed. When an inbound is fully consumed and invoiced, any residual becomes a `Rounding` value entry. *Src:* `src/Layers/W1/BaseApp/Inventory/Costing/InventoryAdjustment.Codeunit.al:258-360, 472-571, 971-1049, 1137-1189, 2014-2097`. *Keep:* MUST in reduced form: a recost job for back-dated or changed inbound cost.
- **R-FA-INVENTORY-45** — **Adjust Cost, Average.** For each outbound value entry in a valuation period, the average is computed as cost = Σ(actual + expected cost) and qty = Σ qty up to the valuation date, net of excluded open outbounds. When qty > 0 and cost ≥ 0, new cost = Round(cost × valued qty / qty). The rounding residual is **not** carried from one outbound to the next: `AvgCostBuf."Rounding Residual"` is reset to 0 before every `RoundCost` call, and `DeductOutbndValueEntryFromBuf` clears it again. Rounding drift is absorbed another way. Each rounded outbound cost and quantity is subtracted from the running (cost, qty) buffer, so later outbounds in the same period divide the remaining cost by the remaining quantity (`src/Layers/W1/BaseApp/Inventory/Costing/InventoryAdjustment.Codeunit.al:1491-1517`; `src/Layers/W1/BaseApp/Inventory/Costing/CostElementBuffer.Table.al:223-240`). (verified-corrected) Otherwise the entry is not adjusted. An outbound with a fixed application (`Applies-to Entry` ≠ 0) is excluded from average adjustment and keeps the exact cost of the inbound it is applied to (`src/Layers/W1/BaseApp/Inventory/Costing/InventoryAdjustment.Codeunit.al:1429-1430`). (added-in-verification) The period is `Average Cost Period` (default Day) and the grouping is `Average Cost Calc. Type`. *Src:* `src/Layers/W1/BaseApp/Inventory/Costing/InventoryAdjustment.Codeunit.al:1420-1521, 2099-2106`; `src/Layers/W1/BaseApp/Inventory/Costing/ItemCostManagement.Codeunit.al:354-412, 539-561`; `src/Layers/W1/BaseApp/Inventory/Setup/InventorySetup.Table.al:389-416`. *Keep:* SHOULD (a moving average at posting replaces it, see §7).
- **R-FA-INVENTORY-46** — Every inventoriable posting clears `Cost is Adjusted` on the item. `Automatic Cost Adjustment` (Never/Day/…/Always) decides whether posting immediately runs an online adjustment for entries dated within that window. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:5050-5087, 5158-5178, 5493-5512`. *Keep:* SHOULD (a `needs_recost` flag per item).

### Inventory → G/L

- **R-FA-INVENTORY-47** — Inventory G/L is posted from value entries as a **delta**: `CostToPost = Cost Amount (Actual) − Cost Posted to G/L`, after which `Cost Posted to G/L` is updated. This is immediate only when `Automatic Cost Posting` is on. Otherwise the entry is queued in `Post Value Entry to G/L` for the batch. Expected (uninvoiced) cost goes to G/L only when `Expected Cost Posting to G/L` is on. *Src:* `src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:246, 2320-2343, 5287-5312`; `src/Layers/W1/BaseApp/Inventory/Costing/InventoryPostingToGL.Codeunit.al:152-226, 728-737`. *Keep:* MUST (always automatic; no expected cost).
- **R-FA-INVENTORY-48** — **Account pairs** (first account gets +CostToPost, the balancing one gets −CostToPost): Purchase/Direct Cost → (Inventory, Direct Cost Applied); Sale/Direct Cost → (Inventory, COGS); Positive/Negative Adjmt. and Transfer → (Inventory, Inventory Adjmt.); Revaluation/Rounding → (Inventory, Inventory Adjmt.); Purchase Variance → (Inventory, Purchase Variance). Expected cost uses (Inventory (Interim), Invt. Accrual (Interim) or COGS (Interim)). Inventory accounts come from Inventory Posting Setup (location × group) and all others from General Posting Setup (gen. bus. × gen. prod.). *Src:* `src/Layers/W1/BaseApp/Inventory/Costing/InventoryPostingToGL.Codeunit.al:194-218, 235-352, 672-709, 739-771, 795-928`; `src/Layers/W1/BaseApp/Inventory/Costing/InvtPostingBuffer.Table.al:132-151`. *Keep:* MUST.
- **R-FA-INVENTORY-49** — The purchase document posts the line amount to `Purch. Account` (or to the FA or G/L account for those line types). The inventory leg separately credits `Direct Cost Applied`. If both are the same account, the purchase nets to Dr Inventory. *Src:* `src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:402-412`; `src/Layers/W1/BaseApp/Inventory/Costing/InventoryPostingToGL.Codeunit.al:246-257`. *Keep:* MUST (post the inventory line straight to the Inventory account).

---

## 4. Flows

**F1. FA acquisition** (purchase invoice line of Type Fixed Asset, or a G/L journal line with Account Type FA and FA Posting Type Acquisition Cost)
1. The purchase posting builds a Gen. Journal line: `Account Type = Fixed Asset`, `FA Posting Type = Acquisition Cost`, amount net of VAT (`src/Layers/W1/BaseApp/Purchases/Posting/PurchPostInvoice.Codeunit.al:594-597`).
2. Check line: FA date window and same-dates rule (R-10); integration matches journal (R-11); VAT allowed (R-12).
3. `GenJnlPostLine.PostFixedAsset` initialises the G/L entry and VAT (net amount), then calls `FA Jnl.-Post Line.GenJnlPostLine` (R-13).
4. FA engine: lock FA; Blocked/Inactive check; copy posting group and depreciation snapshot from the FA Depreciation Book; optional "Depr. until FA Posting Date" (R-33).
5. `InsertFA`: assign the entry no.; set Part of BV/Basis (R-16); compute G/L integration; buffer the G/L line on `Acquisition Cost Account` (R-14); insert; run consistency checks (R-07/08); update `Acquisition Date` and related dates (R-18). Salvage value, if given, becomes a second automatic entry with no G/L.
6. Back in G/L: insert one G/L entry per buffered line, then VAT and vendor entries. One transaction.

**F2. Monthly depreciation**
1. Run with the book, FA posting date (= month end), posting date (= same), document no.
2. For each asset that is not blocked and not inactive: skip rules (R-25) → FirstDeprDate (R-24) → NumberOfDays (R-22) → SL amount (R-20) → final adjustment and rounding (R-26/27).
3. Write journal lines (Account Type FA, Depreciation, amount negative, No. of Depreciation Days) plus balancing lines on Depreciation Expense (R-15/28).
4. The user posts the journal. Each line runs F1 steps 3–6. G/L: Dr Depreciation Expense / Cr Accumulated Depreciation. `Last Depreciation Date` is updated.

**F3. FA disposal (sale)**
1. Post depreciation up to the disposal date (or use R-33). No later entries may exist (R-09).
2. A sales invoice line of Type FA becomes a journal line with FA Posting Type Disposal (`src/Layers/W1/BaseApp/Sales/Posting/SalesPostInvoice.Codeunit.al:518`), amount = −net price, plus VAT.
3. FA engine `PostDisposalEntry`: determine the disposal type (first or second); for a first disposal, reverse "reverse-before-disposal" types; insert the Proceeds entry; `CalcGainLoss` (R-30); insert the automatic entries; correct the Gross accounts (R-31). `Disposal Date` is set and the book value shows 0.
4. G/L (Net): Cr Acq. Cost on Disposal, Dr Accum. Depr. on Disposal, Cr Gain or Dr Loss. These sum to the −proceeds amount, which balances the customer/VAT side.

**F4. Purchase of an Inventory item** (receipt and invoice together)
1. Item Journal line: Entry Type Purchase, Quantity = Invoiced Qty, Amount = net line amount, Unit Cost = Amount/Qty.
2. `ItemQtyPosting`: create the ILE (remaining = qty, open); apply against open **negative** entries if any (R-39/43); create the self application entry (inbound = itself).
3. `ItemValuePosting`: Value Entry Direct Cost, `Cost Amount (Actual)` = amount, `Cost per Unit` = Round(amount/qty, unit precision).
4. Update Last Direct Cost and Unit Cost (R-42); clear `Cost is Adjusted`.
5. If automatic cost posting: Dr Inventory / Cr Direct Cost Applied (R-47/48). The document leg posts Dr Purch. Account, Dr VAT, Cr AP.

**F5. Sale of an Inventory item**
1. Item Journal line: Entry Type Sale, Quantity 4 (posted as −4), Unit Cost = card Unit Cost.
2. ILE −4: apply FIFO to open positive entries (R-39). If stock is short: refuse (prevent) or leave the remainder open (R-43).
3. Value Entry: Valued Qty −4, Cost = −Unit Cost×4 (provisional, R-41), Sales Amount (Actual) = +net price.
4. G/L: Dr COGS / Cr Inventory. The document leg: Dr AR, Cr Sales, Cr VAT.
5. Adjust Cost (online or batch) corrects the cost to the applied inbound cost (FIFO) or the period average (R-44/45) and posts the delta to G/L.

**F6. Adjust Cost** (batch "Adjust Cost – Item Entries", or online)
1. Select items with `Cost is Adjusted = false`.
2. Applied-cost pass: for each ILE with `Applied Entry to Adjust`, forward cost to the outbound entries it supplied, recursively through transfers (R-44).
3. Average pass: for each valuation-date entry point, recompute the outbound costs (R-45).
4. Post the buffered adjustments as Item Journal lines (`Adjustment = true`, `Applies-to Value Entry`), each with G/L via R-47.
5. Update the item `Unit Cost` (average of on hand) and set `Cost is Adjusted`.

**F7. Service / Non-Inventory item**
1. An ILE is still created (quantity history), with Remaining 0, closed, and no application.
2. The Value Entry has `Inventoriable = false` and `Cost Amount (Non-Invtbl.)`. Nothing goes to Inventory or COGS.
3. G/L comes only from the document: purchase → Purch. Account (an expense); sale → Sales Account.

**F8. Stock count difference**
1. Physical count journal: book qty vs counted qty → a Positive or Negative Adjmt. line.
2. Posted like F4 or F5, but G/L pairs Inventory with Inventory Adjmt. (R-48). The cost of a negative adjustment comes from FIFO or average like a sale.

---

## 5. Calculations & rounding

```
-- 30/360 day count (both ends inclusive)
sd = (day(S)=31) ? 30 : day(S)
ed = (day(E+1)=1) ? 30 : day(E)                 -- last day of any month counts as day 30
DeprDays(S,E) = E<S ? 0 : 1 + ed - sd + 30*(month(E)-month(S)) + 360*(year(E)-year(S))
ToMorrow(d)  = d+1, skipping a 31st
Yesterday(d) = d-1 (from a 31st: d-2)

-- Ending date from life (30/360 calendar)
End = Yesterday( CalculateDate(Start, round(Years*360)) )   -- e.g. 2026-01-15 + 5y => 2031-01-14

-- Straight line by life (remaining value over remaining life)
First        = no depreciation yet ? DeprStartingDate : ToMorrow(LastDeprDate)   (never < DeprStartingDate)
N            = DeprDays(First, UntilDate)
RemLife      = Years*360 - DeprDays(DeprStartingDate, Yesterday(First))
Raw          = RemLife < 1 ? -BV : -(BV + Salvage - MinusBV) * N / RemLife      -- Salvage <= 0
Rounded      = round(Raw, 0.01)            (or 1 if "Use Rounding in Periodic Depr.")
MaxDepr      = BV + Salvage - EndingBV     (EndingBV := 0 if Salvage <> 0)
Depr         = (MaxDepr + Rounded < FinalRoundingAmount) ? -MaxDepr : Rounded;  Depr := min(Depr, 0)

-- Disposal (first disposal)
GainLoss = BookValue + Proceeds            -- Proceeds is negative
           - Σ(types with "Include in Gain/Loss Calc." off, default Appreciation)   (verified-corrected)
GainLoss <= 0  => Gain entry = GainLoss (credit)      else Loss entry = GainLoss (debit)
Net G/L: Cr Cost(-AcqCost) ; Dr AccumDepr(-Depr) ; Gain/Loss  ==> sums to Proceeds

-- FIFO outbound cost (per outbound ILE)
Cost(out) = Σ_applications  round( InboundCost_i * AppliedQty_i / InboundQty_i , 0.01 )
Rounding entry on inbound when fully consumed: -(InboundCost + Σ costs forwarded)

-- Average (BC: per valuation period; proposed: moving average at posting)
AvgCost = (Σ CostActual + Σ CostExpected) / Σ Qty   up to valuation date, only if Qty>0 and Cost>=0
OutCost = Round(TotalCost * ValuedQty / Qty)   -- residual reset to 0 per outbound (verified-corrected);
          then TotalCost += OutCost, Qty += ValuedQty  -- the remaining-balance buffer absorbs rounding

-- Inventory → G/L
CostToPost = CostAmountActual - CostPostedToGL ; then CostPostedToGL := CostAmountActual
Dr/Cr: first account += CostToPost, balancing account += -CostToPost
```

Rounding defaults: amount precision 0.01, and unit-amount precision 0.00001 (`src/Layers/W1/BaseApp/Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al:589-617`). Value entry amounts are rounded with `Round()` (`src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:3560-3580`), and cost per unit with the unit precision (`src/Layers/W1/BaseApp/Inventory/Posting/ItemJnlPostLine.Codeunit.al:3626-3640`). Direction is always nearest (half away from zero). FA percentages and years are stored with 8 decimals and months are rounded to 1e-8.

---

## 6. Worked posting examples (MNT, VAT 10%)

**E1. FA acquisition by purchase invoice.** A delivery van costs 12,000,000 + VAT 1,200,000, the FA posting group is VEHICLE, and depreciation runs SL over 5 years from 2026-01-15.

| Account | Debit | Credit |
|---|---:|---:|
| 1600 FA cost (Acquisition Cost Account) | 12,000,000 | |
| 1300 VAT receivable | 1,200,000 | |
| 2100 AP – vendor | | 13,200,000 |
| **Total** | **13,200,000** | **13,200,000** |

FA ledger: Acquisition Cost +12,000,000 (Part of BV and Basis). Depreciation ending date = 2031-01-14 (R-04).

**E2. Depreciation schedule (30/360, R-20/22/26), simulated with the BC formulas.**

| Period (until) | First day | N days | RemLife | Depreciation | Book value after |
|---|---|---:|---:|---:|---:|
| 2026-01-31 | 2026-01-15 | 16 | 1,800 | −106,666.67 | 11,893,333.33 |
| 2026-02-28 | 2026-02-01 | 30 | 1,784 | −200,000.00 | 11,693,333.33 |
| … 57 equal months … | | 30 | | −200,000.00 | |
| 2030-12-31 | 2030-12-01 | 30 | 44 | −200,000.00 | 93,333.33 |
| 2031-01-31 | 2031-01-01 | 30 | 14 | −93,333.33 (capped at book value) | 0.00 |

That is 61 postings totalling exactly 12,000,000.00. The January 2026 posting:

| Account | Debit | Credit |
|---|---:|---:|
| 7200 Depreciation expense (Depreciation Expense Acc., balancing line) | 106,666.67 | |
| 1690 Accumulated depreciation (Accum. Depreciation Account) | | 106,666.67 |
| **Total** | **106,666.67** | **106,666.67** |

**E3. Disposal with a gain (Net method).** Asset 2: cost 12,000,000, start 2026-02-01, 5 years, 200,000 a month. It is sold on 2028-01-31 after 24 months of depreciation (accumulated 4,800,000, so book value 7,200,000) for 8,000,000 + VAT 800,000. GainLoss = 7,200,000 + (−8,000,000) = −800,000, which is a gain.

FA ledger entries: Proceeds −8,000,000 (category blank, **no G/L** under Net); Disposal/Acquisition Cost −12,000,000; Disposal/Depreciation +4,800,000; Gain/Loss −800,000 (Result = Gain).

| Account | Debit | Credit |
|---|---:|---:|
| 1200 AR – customer | 8,800,000 | |
| 2300 VAT payable | | 800,000 |
| 1600 FA cost (Acq. Cost Acc. on Disposal) | | 12,000,000 |
| 1690 Accumulated depreciation (Accum. Depr. Acc. on Disposal) | 4,800,000 | |
| 8600 Gain on disposal (Gains Acc. on Disposal) | | 800,000 |
| **Total** | **13,600,000** | **13,600,000** |

The FA-generated G/L lines sum to −12,000,000 + 4,800,000 − 800,000 = −8,000,000, which equals the line's net amount.

**E3b. The same sale under Gross**, for comparison. The FA lines are: Cr 8,000,000 Sales Acc. on Disp. (Gain); Dr 7,200,000 Book Val. Acc. on Disp. (Gain); Cr 12,000,000 cost; Dr 4,800,000 accumulated depreciation. Their net is a credit of 8,000,000. Adding Dr AR 8,800,000 and Cr VAT 800,000 gives totals of Dr 20,800,000 = Cr 20,800,000. The P&L shows the same 800,000 gain, but as two gross lines (8,000,000 − 7,200,000).

**E4. Disposal with a loss (Net).** The same asset is sold for 6,000,000 + VAT 600,000. GainLoss = 7,200,000 − 6,000,000 = +1,200,000, which is a loss.

| Account | Debit | Credit |
|---|---:|---:|
| 1200 AR | 6,600,000 | |
| 2300 VAT payable | | 600,000 |
| 1600 FA cost | | 12,000,000 |
| 1690 Accumulated depreciation | 4,800,000 | |
| 8600 Loss on disposal (Losses Acc. on Disposal) | 1,200,000 | |
| **Total** | **12,600,000** | **12,600,000** |

**E5. Inventory: purchase 10 @ 100, sell 4 @ 150 (item A, Inventory, FIFO, automatic cost posting).**

Purchase invoice PI-1 (2026-03-02): 10 × 100 = 1,000 + VAT 100.

| Account | Debit | Credit | Leg |
|---|---:|---:|---|
| 6190 Purch. Account = Direct Cost Applied (clearing) | 1,000 | | document |
| 1300 VAT receivable | 100 | | document |
| 2100 AP | | 1,100 | document |
| 1400 Inventory | 1,000 | | value entry |
| 6190 Direct Cost Applied (clearing) | | 1,000 | value entry |
| **Total** | **2,100** | **2,100** | net effect: Dr 1400 1,000, Dr 1300 100, Cr 2100 1,100 |

Sales invoice SI-1 (2026-03-05): 4 × 150 = 600 + VAT 60.

| Account | Debit | Credit | Leg |
|---|---:|---:|---|
| 1200 AR | 660 | | document |
| 5100 Sales | | 600 | document |
| 2300 VAT payable | | 60 | document |
| 6100 COGS | 400 | | value entry |
| 1400 Inventory | | 400 | value entry |
| **Total** | **1,060** | **1,060** | |

Ledger state after both postings:

| Table | Row | Key values |
|---|---|---|
| ILE 1 | Purchase | Qty 10, Remaining 6, Open = yes, Positive = yes |
| ILE 2 | Sale | Qty −4, Remaining 0, Open = no |
| VE 1 | ILE 1, Direct Cost | Valued Qty 10, Cost/Unit 100, Cost (Actual) 1,000, Purchase Amt 1,000, Cost Posted to G/L 1,000 |
| VE 2 | ILE 2, Direct Cost | Valued Qty −4, Cost/Unit 100, Cost (Actual) −400, Sales Amt 600, Cost Posted to G/L −400 |
| Appl 1 | ILE 1 | Inbound 1, Outbound 0, Qty 10, Cost Application = yes |
| Appl 2 | ILE 2 | Inbound 1, Outbound 2, Qty −4, Cost Application = yes |

Check: on hand = Σ ILE qty = 6; value = Σ VE cost = 600 = the G/L 1400 balance. Gross margin = 600 − 400 = 200.

**E6. FIFO vs Average with two layers plus Adjust Cost** (automatic adjustment = Never). P1 on 03-02: 10 @ 100 = 1,000. P2 on 03-03: 10 @ 120 = 1,200 (the card Unit Cost stays 100 because net invoiced qty 20 > 10, R-42). S1 on 03-05: 15 @ 150 = 2,250 + VAT 225. It is posted at provisional cost −1,500 and applied 10 from P1 and 5 from P2.

| | FIFO | Average (period = Day) |
|---|---:|---:|
| Actual cost of S1 | 10/10×1,000 + 5/10×1,200 = **1,600** | 15 × (2,200/20 = 110) = **1,650** |
| Adjustment value entry (dated 03-05) | −100 | −150 |
| Remaining inventory | 5 × 120 = 600 | 5 × 110 = 550 |

G/L for S1 including the FIFO adjustment:

| Account | Debit | Credit |
|---|---:|---:|
| 1200 AR | 2,475 | |
| 5100 Sales | | 2,250 |
| 2300 VAT payable | | 225 |
| 6100 COGS (posting) | 1,500 | |
| 1400 Inventory (posting) | | 1,500 |
| 6100 COGS (adjust cost) | 100 | |
| 1400 Inventory (adjust cost) | | 100 |
| **Total** | **4,075** | **4,075** |

Inventory G/L = 1,000 + 1,200 − 1,500 − 100 = 600, which matches the remaining FIFO layer.

**E7. Negative inventory** (item B, prevent = No, card Unit Cost 100). S2 on 04-01 sells 4 with stock 0: the ILE −4 stays open with Remaining −4, and the cost is provisional −400. P3 on 04-03 buys 10 @ 110 = 1,100: it applies 4 to S2, so S2 closes and P3 keeps 6 remaining. Adjust Cost revalues S2 at 4/10 × 1,100 = 440, an adjustment of −40 dated 04-01.

| Step | Account | Debit | Credit |
|---|---|---:|---:|
| S2 (cost leg) | 6100 COGS / 1400 Inventory | 400 | 400 |
| P3 (value leg) | 1400 Inventory / 6190 Direct Cost Applied | 1,100 | 1,100 |
| Adjust | 6100 COGS / 1400 Inventory | 40 | 40 |
| **Total** | | **1,540** | **1,540** |

Inventory G/L = −400 + 1,100 − 40 = 660 = 6 × 110. Between 04-01 and 04-03 the Inventory account had a **credit** balance of 400.

**E8. Non-inventory and service items.** Packing material (Non-Inventory) bought for 50,000 + VAT 5,000: Dr Purch. Account (expense, e.g. 7200) 50,000, Dr 1300 5,000, Cr 2100 55,000. Total 55,000 = 55,000, with no inventory leg (`Inventoriable = false`). An installation service (Service) sold for 200,000 + VAT 20,000: Dr 1200 220,000, Cr 5100 200,000, Cr 2300 20,000. Total 220,000 = 220,000, with no COGS.

**E9. Count shortage.** One unit of item A is missing and the FIFO head is P2 at 120. Negative Adjmt.: Dr 8400 Inventory Adjmt. 120 / Cr 1400 Inventory 120.

---

## 7. Simplifications for the micro-business system

**Fixed assets**
1. **One table `fixed_asset`** merges T5600 and the accounting-book row of T5612: class/posting group, `in_service_date`, `depr_start_date`, `useful_life_months`, `residual_value`, method = SL only, `status` {draft, active, disposed}. Add an optional `fa_tax_book` (memo, never in G/L) holding the statutory life for CIT reports (see `mn-tax.md` §3.4).
2. **Default the depreciation start to the first day of the month after it is put in service** (the MN tax rule). With 30/360, every month is then exactly `cost − residual` / life, and partial months appear only if the user overrides the start. Keep BC's remaining-life formula (R-20) and final cap (R-26). It handles changed lives and write-downs at no extra cost.
3. **FA posting types in v1:** Acquisition, Depreciation, Write-down (impairment, SHOULD), Disposal (Net). Salvage becomes a `residual_value` field instead of a ledger entry. Drop Appreciation, Custom 1/2, Bonus, Maintenance ledger (an expense line), Insurance, Allocation, Budgeted assets, Components and Indexation.
4. **FA posting group with 6 accounts:** cost, accumulated depreciation, depreciation expense, gain, loss (may be the same account, 8600), write-down expense. Disposal reuses the cost and accumulated-depreciation accounts, so "on Disposal" accounts are not needed.
5. **No FA journal.** FA operations come from documents: a purchase-invoice line of type FA, a depreciation run, an FA disposal on a sales invoice or a "write-off" document. Each posts G/L and `fa_ledger_entry` rows in **one** transaction through the common posting engine. The depreciation run is a draft that the user previews, then posts. Enforce a unique key (asset, book, period).
6. **Keep BC's (category, type) pairs and signs** on `fa_ledger_entry`, so the book value, acquisition cost and gain/loss queries are the same SUM filters as the BC FlowFields.
7. **Corrections by reversal only.** Reverse the whole disposal or depreciation transaction (linked `reversed_by`), never through "FA Error Entry No." blanking.

**Inventory**
1. **Item types:** default `service` / `non_inventory` (no stock, no COGS); `inventory` is opt-in per item. Store ILE-like quantity history for non-inventory too, for sales statistics.
2. **Costing method per company:** FIFO **or** moving weighted average. No LIFO (IFRS for SMEs), no Standard or Specific. It changes only at the fiscal-year boundary (`mn-accounting.md` REQ-ACC-17).
3. **Compute the actual cost at posting time** instead of BC's provisional cost plus Adjust Cost. FIFO consumes open layers in (posting_date, entry_no) order and writes `item_application` rows carrying the exact cost. A moving average keeps a running (qty, value) per item, and outbound cost = round(value × qty_out / qty_on_hand). The last unit takes the remaining value, so no rounding entry is needed.
4. **Prevent negative inventory by default** (a company setting). This removes the need for provisional costs in v1.
5. **Back-dated postings:** either (a) refuse an inventory posting dated before the item's last outbound posting, or (b) mark the item `needs_recost` and run a **recost job** (the essence of R-44) that re-applies from that date and posts adjustment value entries dated on the original outbound dates, or on the first open date if that period is closed. v1: option (a), plus (b) for purchase-price corrections and landed cost.
6. **Always post automatically to G/L.** There is no expected cost, because receipt and invoice are one document. Keep `cost_posted_to_gl` on the value entry so the recost job posts deltas (R-47).
7. **Accounts on the item category:** inventory, COGS, inventory adjustment and revenue. One location, or location as a dimension in v1. Post the purchase line straight to Inventory, with no Purch. Account/Direct Cost Applied clearing pair (R-49).
8. **Data model:** `item_ledger_entry` (qty, remaining_qty, open), `value_entry` (cost_actual, sales_amount, adjustment flag, gl link), `item_application` (inbound_id, outbound_id, qty, cost). This copies BC's three-table split, which keeps quantity audit separate from value audit.

---

## 8. Pitfalls / edge cases the new implementation must not miss

1. **Signs.** In FA: acquisition +, depreciation −, proceeds −, gain −, loss +. In value entries: outbound cost is negative. G/L: debit +. Mixing these up silently swaps gain and loss (R-30).
2. **The Net disposal proceeds entry has no G/L line.** The automatic entries must sum to the proceeds amount, otherwise the transaction does not balance (E3).
3. **Depreciate up to the disposal date before disposing**, and refuse back-dated FA entries after a disposal (R-09). Book value after disposal is 0 by rule, not by sum (R-17).
4. **30/360 edge cases:** 31st → 30, 28/29 Feb as a month end → 30, `ToMorrow(30 Jan)` = 31 Jan = skipped → 1 Feb. Test the month ends of Jan, Feb (leap and non-leap) and Dec.
5. **Do not compute SL as cost/life each month.** That leaves residuals and breaks after changes. Use the remaining value over the remaining life and cap at book value (R-20/26). The last month may be smaller (E2: 93,333.33).
6. **Re-running depreciation** for a posted period must return 0 (R-24). Unposted draft lines from an earlier run must be replaced, not added to.
7. **Blocked or inactive assets are skipped silently** in BC (R-02). Report them.
8. **FA VAT:** the FA cost is the net amount. Non-deductible VAT increases the cost. Mongolian rules may defer the VAT deduction on buildings (120 months) and equipment (60 months); see `mn-tax.md`. The FA cost is not affected, but VAT receivable timing is.
9. **Posting date vs FA posting date** must be equal in v1 (R-10). Otherwise the G/L and FA period reports disagree.
10. **Changing the FA posting group or depreciation parameters after postings** (R-01/03) needs a reclassification or a prospective change, never a rewrite.
11. **Inventory FIFO is "FIFO at posting time."** BC applies an outbound to the open inbounds that exist when it is posted. A later back-dated purchase does **not** re-apply earlier sales. If the micro system allows back-dating, it needs the recost job, or it must refuse (§7.5).
12. **The card unit cost is stale** (R-42). Never use `item.unit_cost` as the COGS source. Use the layers or the running average.
13. **Rounding in cost allocation:** allocate by share of total cost (inbound cost × applied/inbound qty), not by rounded unit cost × qty. When a layer is fully consumed, post the residual (R-44), or let the last consumer take the remainder.
14. **Average with zero or negative quantity or cost**: BC refuses to calculate (R-45). The moving average needs a defined rule, e.g. keep the last average and correct on the next receipt.
15. **Negative inventory** produces a credit balance on Inventory and provisional COGS (E7). If it is allowed, the recost must happen when the inbound arrives.
16. **Returns:** a sales return should apply to the original sale (BC's `Applies-from Entry`) so it comes back at the original cost, not the current one. Purchase returns should apply to the original receipt.
17. **Closed periods:** cost adjustments for a closed period go to the first open date (`src/Layers/W1/BaseApp/Inventory/Costing/InventoryAdjustment.Codeunit.al:2052-2055`). Never change a locked period.
18. **Type and costing-method changes** after entries must be refused (R-35). Otherwise the history is valued under two rules.
19. **Inventory, accumulated depreciation and FA cost accounts must not allow direct posting** (see `bc-gl-posting.md` R-GL-POSTING-07). Otherwise the subledger and G/L drift apart. This is our design rule, not BC behaviour. BC's FA Posting Group never requires `Direct Posting` = false on the FA accounts. It only requires the expense and balancing accounts (Depreciation Expense, Acquisition Cost Bal., Write-Down Expense and others) to **allow** direct posting (`src/Layers/W1/BaseApp/FixedAssets/FixedAsset/FAPostingGroup.Table.al:520-531`). (added-in-verification)
20. **BC quirk not to copy:** the "more than 360 days" guard only works for DB1 (R-29). The 365-day mode has its own leap-day logic; v1 does not need it.

---

## 9. Open questions

1. **Accounting-book start rule:** should the accounting book (IFRS for SMEs: depreciate from "available for use") also default to the first day of the next month, as the tax rule does, or start mid-month with a partial first period?
2. **Default residual value** (0?) and a **low-value threshold**: below what amount are small assets expensed directly (accounting policy and tax)?
3. **VAT on FA purchases:** does the 60/120-month deferred VAT deduction apply to all VAT payers or only to mining licence holders (`mn-tax.md` §2, medium confidence)? It changes the acquisition posting.
4. **Is a tax depreciation book (memo) required in v1** to produce the CIT difference reconciliation, or is it enough to report statutory-life depreciation outside the ledger?
5. **FIFO or moving average as the default** for Mongolian micro retailers? Do accountants expect a **periodic** (monthly) weighted average, which is BC's model with Average Cost Period = Month, instead of a moving one?
6. **Multi-warehouse in v1?** If yes, is the average per location or company-wide (BC: `Average Cost Calc. Type`)?
7. **Policy for negative stock:** hard block, or allow with a warning and recost? Many micro shops sell before they record the receipt.
8. **Inventory write-down to net realisable value** (IAS 2 / Section 13) and **FA impairment**: needed in v1 (revaluation value entry / write-down FA entry), or year-end manual journals?
9. **Landed costs** (freight and customs on imports, `mn-tax.md` R7): needed in v1 as item charges, which require the recost job?
10. **Rounding unit:** should depreciation and COGS round to whole MNT (`Use Rounding in Periodic Depr.`) or to 0.01?

---

## Verification log

The note was checked adversarially against the AL source in `src/Layers/W1/BaseApp` on 2026-10-06. Every worked example was recomputed. Debits equal credits in all of them, and the VAT is 10% of net in each. The E2 schedule was re-simulated with BC's 30/360 `DeprDays`, the remaining-life SL formula, round-half-away-from-zero to 0.01 and the `AdjustDepr` cap. It gives 61 postings totalling exactly 12,000,000.00, with the same row values as the table. The same simulation for the E3 asset gives 7,200,000.00 book value after 24 months. Paths below are relative to `src/Layers/W1/BaseApp/`.

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| Summary: inventory adjustments post "Inventory vs Inventory Adjmt." | refuted, rewritten in place: the pair follows the ILE type, so an adjustment on a sale goes to COGS | `Inventory/Costing/InventoryPostingToGL.Codeunit.al:198-206, 310-325` |
| R-01 FA posting group locked once FA entries exist | corrected: only the card field is locked; the depreciation-book field, which is used at posting, is guarded only by `ModifyDeprFields` | `FixedAssets/FixedAsset/FixedAsset.Table.al:287-307`; `FixedAssets/Depreciation/FADepreciationBook.Table.al:279-289, 1044-1063` |
| R-02 Blocked/Inactive refused at posting; depreciation run skips them silently | confirmed | `FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:165-168`; `FixedAssets/Depreciation/CalculateDepreciation.Report.al:32-33` |
| R-03 changes after depreciation need `Allow Changes in Depr. Fields` | confirmed | `FixedAssets/Depreciation/FADepreciationBook.Table.al:1044-1063` |
| R-04 Months = Years×12 (1e-8); ending date = Yesterday(CalculateDate(start, Years×360)); 2026-01-15 + 5y gives 2031-01-14 | confirmed | `FixedAssets/Depreciation/FADepreciationBook.Table.al:165, 201, 1127-1180`; `FixedAssets/Depreciation/FADateCalculation.Codeunit.al:58-99` |
| R-06 ready-for-acquisition test | confirmed | `FixedAssets/Depreciation/FADepreciationBook.Table.al:1376-1393` |
| R-07 first entry must be Acquisition Cost | confirmed | `FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:121-123` |
| R-08 sign invariants checked on the posting date and every later date | confirmed | `FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:130-172, 323-367` |
| R-09 no posting after disposal; disposal must be the last date | confirmed | `FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:187-202, 369-373` |
| R-10 FA date window, same-dates rule, blank FA date takes the posting date | confirmed | `FixedAssets/FixedAsset/FAJnlCheckLine.Codeunit.al:276-321`; `FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:112-113` |
| R-11 integrated types go through the general journal, others through the FA journal; salvage never integrated | confirmed | `FixedAssets/FixedAsset/FAJnlCheckLine.Codeunit.al:333-368` |
| R-12 VAT and gen. posting groups only on Acq/Apprec/Disposal/Maintenance; VAT + base = amount | confirmed | `FixedAssets/FixedAsset/FAJnlCheckLine.Codeunit.al:163-193` |
| R-13 FA amount = G/L amount net of VAT; one G/L entry per buffer row, then VAT | confirmed | `Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1732-1744, 1751-1813` |
| R-14 (category, type) → G/L account map | confirmed | `FixedAssets/FixedAsset/FAGetGLAccountNo.Codeunit.al:31-78` |
| R-15 balancing lines on −Amount; refuses an existing Bal. Account No.; accounts must allow direct posting | confirmed | `FixedAssets/FixedAsset/FAInsertGLAccount.Codeunit.al:220-228, 273, 377-397`; `FixedAssets/FixedAsset/FAPostingGroup.Table.al:273-295, 520-531` |
| R-16 Part of Book Value / Depreciable Basis flags; disposal categories never flagged | confirmed | `FixedAssets/FixedAsset/FAInsertLedgerEntry.Codeunit.al:212-254`; `FixedAssets/Depreciation/DepreciationBook.Table.al:384-407` |
| R-17 Book Value FlowField; shown as 0 after disposal (`CalcBookValue`, not the FlowField) | confirmed | `FixedAssets/Depreciation/FADepreciationBook.Table.al:342-354, 1325-1338` |
| R-18 derived dates (Acquisition, G/L Acquisition, Last Depreciation, Disposal) | confirmed | `FixedAssets/FixedAsset/FACheckConsistency.Codeunit.al:242-298` |
| R-19 FA Error Entry No. correction blanks `FA No.` on both entries | confirmed | `FixedAssets/FixedAsset/FAInsertLedgerEntry.Codeunit.al:129-148` |
| R-20 SL = −(BV + Salvage − MinusBV) × N / RemainingLife; RemainingLife < 1 gives −BV | confirmed | `FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:449-472, 618-627` |
| R-21 SL% and fixed-amount variants | confirmed | `FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:435-447` |
| R-22 30/360 day count, 31st → 30, month end → 30 | corrected (wording only): "DaysInFiscalYear = book value" now names the book field `No. of Days in Fiscal Year` | `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:36-99`; `FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:639-641` |
| R-23 365-day mode: leap days dropped; needs "Last Entry", no Custom 1 | confirmed | `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:602-627`; `FixedAssets/Depreciation/DepreciationBook.Table.al:293-300` |
| R-24 first depreciation date | corrected: write-down (Depreciation Type) starts at date + 1; only types included in the depreciation calculation count | `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:145-231, 647-650` |
| R-24a starting date before acquisition gives a catch-up first period | added-in-verification | `FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:231-239`; `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:173-195` |
| R-25 skip when nothing is left to depreciate | corrected: with `Use FA Ledger Check` on (the default) the method switches to "Below Zero" and returns 0; it is not skipped | `FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:151-169, 205-211, 543-553` |
| R-26 round, then cap at −MaxDepr; result ≤ 0 | corrected (Notes wording only); the cap logic itself is confirmed | `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:281-317`; `FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:173-175, 344-352` |
| R-27 `Round(x,1)` when periodic rounding is on, otherwise `Round(x)`; report rounds to G/L precision | confirmed | `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:418-421`; `FixedAssets/Depreciation/CalculateDepreciation.Report.al:46-47` |
| R-28 run writes journal lines (Gen. Jnl when integrated), balancing lines by default, same-dates check | confirmed | `FixedAssets/Depreciation/CalculateDepreciation.Report.al:71-88, 161-181, 292, 372-381` |
| R-29 360/365 guard only for DB1 and DB1/SL | confirmed | `FixedAssets/Depreciation/CalculateDepreciation.Codeunit.al:68-82`; `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:48` |
| R-30 disposal slots; GainLoss = BV + Proceeds; ≤ 0 is a gain | corrected: types excluded from the gain/loss calculation are also subtracted (default: Appreciation) | `FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:39-66`; `FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:277-294` |
| R-31 Net: proceeds not integrated; Gross: gain/loss not integrated; salvage never; CorrectEntries picks Gain/Loss accounts | confirmed | `FixedAssets/FixedAsset/FAInsertLedgerEntry.Codeunit.al:273-284`; `FixedAssets/FixedAsset/FAInsertGLAccount.Codeunit.al:565-596` |
| R-32 second disposal needs `Allow Correction of Disposal` and the same method | confirmed | `FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:157-160`; `FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:250-256` |
| R-33 `Depr. until FA Posting Date` posts depreciation before the main entry | confirmed | `FixedAssets/FixedAsset/FAJnlPostLine.Codeunit.al:176-179, 348-391` |
| R-34 non-inventoriable: Remaining 0, no application entries, Non-Invtbl. cost, FIFO forced | confirmed | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:785-791, 2409-2410, 2755-2770`; `Inventory/Item/Item.Table.al:3283-3288` |
| R-35 Type and costing method locked by entries; non-FIFO needs Inventory type | confirmed | `Inventory/Item/Item.Table.al:217-218, 343-344, 358, 2939-2956` |
| R-38 outbound value-entry signs | confirmed (Assembly Consumption is negated too) | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:2683-2703` |
| R-39 application order (Posting Date, Entry No.); LIFO descending | confirmed | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:1740-1745, 1828-1840` |
| R-40 Average applications are quantity-only | corrected: fixed applications, inbound self-applications and some corrections are cost applications under Average too | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:2465-2483` |
| R-41 provisional outbound cost = line Unit Cost × qty (sales line Unit Cost (LCY)) | confirmed | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:2836-2852, 3582-3602`; `Inventory/Journal/ItemJournalLine.Table.al:2742` |
| R-42 when the card Unit Cost takes the Last Direct Cost | corrected: net invoiced qty must be > 0 and ≤ this posting's invoiced qty; a Unit Cost of 0 alone is not enough | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:1029-1053`; `Inventory/Costing/ItemCostManagement.Codeunit.al:115-131` |
| R-43 negative inventory: item → setup; always refused for consumption and transfer | confirmed | `Inventory/Ledger/ItemLedgerEntry.Table.al:934-945`; `Inventory/Item/Item.Table.al:3293-3308`; `Inventory/Posting/ItemJnlPostLine.Codeunit.al:2089-2093` |
| R-44 FIFO adjust: share of inbound cost; dated on original posting date or first open date; rounding entry | confirmed | `Inventory/Costing/InventoryAdjustment.Codeunit.al:1038, 1137-1189, 2052-2055` |
| R-45 average adjust "rounded with a carried residual" | refuted, rewritten in place: residual reset to 0 per outbound; drift absorbed by the remaining-balance buffer; fixed-applied outbounds excluded (added) | `Inventory/Costing/InventoryAdjustment.Codeunit.al:1429-1430, 1491-1517`; `Inventory/Costing/CostElementBuffer.Table.al:223-240` |
| R-47 delta posting `Cost Amount (Actual) − Cost Posted to G/L`; immediate only with Automatic Cost Posting | confirmed | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:244-246, 5303-5309`; `Inventory/Costing/InventoryPostingToGL.Codeunit.al:169-188, 728-737` |
| R-48 account pairs; first account +CostToPost, balancing −CostToPost | confirmed | `Inventory/Costing/InventoryPostingToGL.Codeunit.al:243-346, 739-768` |
| R-49 purchase line posts to Purch. Account (or to the FA/G/L No.) | confirmed | `Purchases/Posting/PurchPostInvoice.Codeunit.al:402-411` |
| Pitfall 19: no direct posting on FA and inventory accounts | clarified (added-in-verification): this is our design rule; BC does not enforce it | `FixedAssets/FixedAsset/FAPostingGroup.Table.al:33-44, 520-531` |
| E1 FA purchase: 13.2M = 13.2M | confirmed | `Purchases/Posting/PurchPostInvoice.Codeunit.al:404-405, 592-595` |
| E2 schedule 106,666.67 + 59 × 200,000 + 93,333.33 = 12,000,000.00; RemLife 1800/1784/44/14 | confirmed (re-simulated) | `FixedAssets/Depreciation/CalculateNormalDepreciation.Codeunit.al:449-472`; `FixedAssets/Depreciation/DepreciationCalculation.Codeunit.al:293-317` |
| E3 Net gain 13.6M = 13.6M; FA G/L lines sum to −8M | confirmed | `FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:45-66`; `FixedAssets/FixedAsset/FAInsertLedgerEntry.Codeunit.al:275-278` |
| E3b Gross 20.8M = 20.8M | confirmed | `FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:49-50`; `FixedAssets/FixedAsset/FAInsertGLAccount.Codeunit.al:575-596` |
| E4 Net loss 12.6M = 12.6M | confirmed | `FixedAssets/FixedAsset/CalculateDisposal.Codeunit.al:63-66` |
| E5 purchase 2,100 = 2,100; sale 1,060 = 1,060; ledger state and application rows | confirmed | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:766-770, 1599-1601`; `Inventory/Costing/InventoryPostingToGL.Codeunit.al:252-257, 319-324` |
| E6 FIFO 1,600 (adjustment −100), Average 1,650 (adjustment −150); 4,075 = 4,075 | confirmed | `Inventory/Costing/InventoryAdjustment.Codeunit.al:1038, 1481-1517` |
| E7 negative inventory: adjustment −40 dated 04-01; 1,540 = 1,540; Inventory 660 | confirmed | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:1579-1591`; `Inventory/Costing/InventoryAdjustment.Codeunit.al:2052-2055` |
| E8 non-inventory 55,000 = 55,000; service 220,000 = 220,000 | confirmed | `Inventory/Posting/ItemJnlPostLine.Codeunit.al:2332-2336, 2755-2770` |
| E9 negative adjustment Dr Inventory Adjmt. / Cr Inventory | confirmed | `Inventory/Costing/InventoryPostingToGL.Codeunit.al:203-206` |
| Rounding defaults 0.01 / 0.00001 | confirmed | `Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al:589-617` |
