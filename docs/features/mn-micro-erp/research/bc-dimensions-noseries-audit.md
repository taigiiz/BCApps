# BC research: Dimensions, number series, source and reason codes

- Source: BCApps (BC v29, MIT). Everything below was read from the AL code, not from documentation, except one runtime fact about `IncStr` (marked as from Microsoft Learn).
- Path legend (all paths are repo-relative):
  - `DIM/` = `src/Layers/W1/BaseApp/Finance/Dimension/`
  - `BA/` = `src/Layers/W1/BaseApp/`
  - `NS/` = `src/Business Foundation/App/NoSeries/src/`
  - `AC/` = `src/Business Foundation/App/AuditCodes/src/`
- Keep levels: **MUST** = needed in the micro-ERP v1. **SHOULD** = keep in a simpler form, or add soon after v1. **SKIP** = leave out.
- Account numbers, dimension codes and IDs in the examples are made up for illustration.

---

## 1. Summary

- **Dimensions are tags on amounts, not amounts.** A Dimension (DEPT, PROJECT, …) has Dimension Values (SHOP, SALES, …). Each line and each ledger entry carries **one integer `Dimension Set ID`**. That ID points to an immutable, deduplicated set of (dimension → value) pairs. ID 0 means the set is empty.
- **Set IDs are found by walking a tree** (`Dimension Set Tree Node`, T481). The pairs are visited in ascending `Dimension Value ID` order, and each path through the tree is one set. The same combination therefore always gets the same ID, in any session. Sets are never edited: changing a dimension gives a new ID.
- **Default Dimensions** are defined per master record (customer, item, G/L account, …) or per whole table (`No.` = blank). They do two jobs: (a) they propose values when a line is created, and (b) they **constrain posting** through `Value Posting` = blank / Code Mandatory / Same Code / No Code.
- **Posting validation runs in layers.** The engine checks dimension combinations first, then (inside `CheckDimValuePosting`) blocked dimensions, blocked values and non-postable value types, then value-posting rules for every source on the line. It then checks the rules again for each G/L account that posting derives, such as the receivables, VAT and bank accounts. (verified-corrected: the combination check runs before the blocked check, `GenJnlCheckLine.Codeunit.al:950-967`, `DimensionManagement.Codeunit.al:558-561`)
- **Denormalization:** two "global" dimensions are copied as code columns onto every ledger entry, so totals per account and dimension can be calculated quickly. Shortcut dimensions 3–8 are only looked up through the set. Changing which dimension is global means rewriting every ledger table.
- **No. Series** = a header (Default Nos., Manual Nos., Date Order) plus dated lines (Starting Date, Starting/Ending/Warning/Last No. Used, Increment-by). The line used is the one with the latest Starting Date on or before the usage date. Numbers are strings, incremented with `IncStr`.
- **There are two implementations.** *Normal* locks the series line and writes the new number in the same transaction, so a rollback leaves no gap. *Sequence* takes numbers from a DB sequence without a row lock, so it can leave gaps.
- **Gapless legal numbers come from the posting flow, not from the series code alone.** Journals only *peek* at the next number when a line is entered and consume it during posting. Documents reserve the posting number on the document. If an unposted document that holds a reserved number is deleted, BC writes a "deleted document" placeholder to fill the gap.
- **Source Code** (Code[10]) records *which process* created an entry: GENJNL, SALES, REVERSAL, CLOSE INCOME, and so on. Logic depends on it: reversal, deferrals and default-dimension priorities all read it. **Reason Code** records *why*. It is an optional tag with no logic attached.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| Dimension | Table 348 | Analysis axis | `Code` Code[20] PK, NotBlank; `Name` Text[30]; `Code Caption`/`Filter Caption` Text[80]; `Blocked` Bool; `Consolidation Code`, `Map-to IC Dimension Code` Code[20] | MUST (drop captions, IC, consolidation) |
| Dimension Value | Table 349 | Values of one dimension | PK (`Dimension Code`, `Code` Code[20]); `Name` Text[50]; `Dimension Value Type` Option {Standard, Heading, Total, Begin-Total, End-Total}; `Totaling` Text[250]; `Blocked` Bool; `Indentation` Int; `Global Dimension No.` Int (1–8, 0 = none); `Dimension Value ID` Int AutoIncrement (global surrogate key) | MUST (Standard; Total → SHOULD as parent tree) |
| Default Dimension | Table 352 | Default value and posting rule per master record or per table | PK (`Table ID` Int, `No.` Code[20], `Dimension Code` Code[20]); `Dimension Value Code` Code[20]; `Value Posting` Enum 353 {" ", Code Mandatory, Same Code, No Code}; `Allowed Values Filter` Text[250] | MUST |
| Default Dimension Priority | Table 354 | Which source table wins on a conflict, per source code | PK (`Source Code` Code[10], `Table ID` Int); `Priority` Int MinValue 1 (1 = highest) | SKIP (fixed precedence) |
| Dimension Set Entry | Table 480 | Members of a set | PK (`Dimension Set ID` Int, `Dimension Code` Code[20]); `Dimension Value Code` Code[20]; `Dimension Value ID` Int; `Global Dimension No.` Int (3–8 only) | MUST |
| Dimension Set Tree Node | Table 481 | Finds the ID of an existing set | PK (`Parent Dimension Set ID` Int, `Dimension Value ID` Int); `Dimension Set ID` Int AutoIncrement; `In Use` Bool | SKIP (replace with a hash key) |
| Dimension Combination | Table 350 | Restriction between two dimensions | PK (`Dimension 1 Code`, `Dimension 2 Code`); `Combination Restriction` Option {Limited, Blocked} | SKIP v1 / SHOULD |
| Dimension Value Combination | Table 351 | Value pairs blocked under a Limited combination | PK (Dim1 Code, Dim1 Value, Dim2 Code, Dim2 Value) | SKIP v1 / SHOULD |
| Dim. Value per Account | Table 356 | Values allowed per account (backs `Allowed Values Filter`) | PK (`Table ID`, `No.`, `Dimension Code`, `Dimension Value Code`); `Allowed` Bool | SKIP |
| G/L Setup dimension fields | Table 98, fields 79–88 | Global Dim 1/2, Shortcut Dim 1–8 | `Global Dimension 1/2 Code` (Editable = false); `Shortcut Dimension 3..8 Code` | MUST (2 globals); SHOULD (more shortcuts) |
| DimensionManagement / Check Dimensions / Change Global Dimensions | CU 408 / 481 / 483 | Engine, document checks, global re-mapping | — | MUST / MUST / SKIP |
| No. Series | Table 308 | Number series header | `Code` Code[20] PK; `Description` Text[100]; `Default Nos.`, `Manual Nos.`, `Date Order` Bool | MUST |
| No. Series Line | Table 309 | Dated number range | PK (`Series Code`, `Line No.` Int); `Starting Date` Date; `Starting No.`, `Ending No.`, `Warning No.`, `Last No. Used` Code[20]; `Increment-by No.` Int (Init 1, Min 1); `Open` Bool (calculated); `Last Date Used` Date; `Implementation` Enum 397 {Normal, Sequence}; `Sequence Name` Code[40]; `Starting Sequence No.` BigInt | MUST (drop Sequence fields, Increment-by) |
| No. Series Relationship | Table 310 | Alternative series allowed for a default series | PK (`Code`, `Series Code`) | SKIP |
| No. Series (+ Batch) API | CU 310 / CU 308 | GetNextNo / PeekNextNo / batch with in-memory state | — | MUST (logic) |
| Source Code | Table 230 | Origin tag | `Code` Code[10] PK; `Description` Text[100] | MUST (as an enum) |
| Source Code Setup | Table 242 + ext. in BA | Maps each process to a source code (≈80 fields) | `Sales`, `Purchases`, `General Journal`, `Cash Receipt Journal`, `Payment Journal`, `Reversal`, `Close Income Statement`, `Exchange Rate Adjmt.`, `VAT Settlement`, `Deleted Document`, … | SKIP (constants) |
| Reason Code | Table 231 | "Why" tag on entries | `Code` Code[10] PK; `Description` Text[100] | SHOULD |
| Return Reason | Table 6635 | Reason for returned goods | `Code` Code[10]; `Description` | SKIP |

---

## 3. Business rules

In cross-references elsewhere in this note, `R-NN` is short for `R-DIMENSIONS-NOSERIES-AUDIT-NN`.

### Dimension and value master data
- **R-DIMENSIONS-NOSERIES-AUDIT-01**: A dimension code cannot be blank. It cannot equal the captions G/L Account, Business Unit, Item, Location or Period. A `Blocked` dimension cannot be used. *Src:* `DIM/Dimension.Table.al:43-67,108`. *Keep:* MUST (not blank, unique, blocked). SKIP the reserved names. *Notes:* the reserved names avoid collisions in analysis-view captions.
- **R-DIMENSIONS-NOSERIES-AUDIT-02**: A dimension cannot be deleted while it is Global Dimension 1/2, a G/L or item budget dimension, or a (item) analysis-view dimension, or while any of its values appears in a dimension set. A **shortcut dimension 3–8 does not block the delete**: `OnDelete` calls `CheckIfDimUsed` with type " ", which skips the shortcut check, and then clears the matching `Shortcut Dimension N Code` in G/L Setup. A delete cascades to its default dimensions, values, combinations, selected dimensions and translations, and removes IC mappings. *Src:* `DIM/Dimension.Table.al:176-232,307-334,346-478,518-538`. *Keep:* MUST (block the delete if the dimension is used). (verified-corrected: shortcut 3–8 was wrongly listed as blocking)
- **R-DIMENSIONS-NOSERIES-AUDIT-03**: A value is keyed by (Dimension Code, Code). The code cannot be blank or `(CONFLICT)`, which the UI reserves for multi-line edits. On insert, the value gets a global auto-increment `Dimension Value ID` that can never be edited, and a `Global Dimension No.` that says which of the 8 slots its dimension occupies. *Src:* `DIM/DimensionValue.Table.al:55-68,184-194,224,279-289,722-751`. *Keep:* MUST (surrogate ID). *Why:* tree nodes and set entries reference the integer ID, so renaming a value code does not break sets.
- **R-DIMENSIONS-NOSERIES-AUDIT-04**: A value cannot be deleted while any `Dimension Set Entry` references its ID. A rename cannot move a value to another dimension. A rename within the same dimension is allowed and cascades. *Src:* `DIM/DimensionValue.Table.al:243-277,301-319,351-357`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-05**: Value types: only `Total` and `End-Total` may have `Totaling`. Once a value has been used, its type cannot be changed from Standard to anything else. **Postable values are Standard *and* Begin-Total.** Heading, Total and End-Total are rejected. *Src:* `DIM/DimensionValue.Table.al:83-119`; `DIM/DimensionManagement.Codeunit.al:1811-1834`. *Keep:* Standard MUST; Total SHOULD; SKIP Heading, Begin-Total and End-Total.
- **R-DIMENSIONS-NOSERIES-AUDIT-06**: Indent builds the totals. The function walks values in Code order. For each End-Total it sets `Totaling := <matching Begin-Total>..<End-Total>`. Nesting is limited to 10 levels, and an End-Total without a matching Begin-Total is an error. Totaling filters are expanded recursively to leaf values, with a guard against cycles. *Src:* `DIM/DimensionValueIndent.Codeunit.al:37,69-105`; `DIM/DimensionManagement.Codeunit.al:3152-3254`. *Keep:* SKIP the indent function. Use `parent_id` with a recursive rollup (SHOULD).

### Dimension sets
- **R-DIMENSIONS-NOSERIES-AUDIT-07**: A set holds at most one value per dimension (PK = Set ID + Dimension Code). Entries with a blank code or blank value are ignored. If nothing remains, the ID is **0**. *Src:* `DIM/DimensionSetEntry.Table.al:116,181-188`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-08**: **Finding the set ID.** Sort the pairs by `Dimension Value ID` ascending. Starting at parent 0, look up the node (parent, valueId) for each pair, and create it with an auto-increment ID if it is missing. The last node's ID is the set ID. Only a node flagged `In Use` has `Dimension Set Entry` rows. Prefix nodes exist but are not sets until they are first used as a set themselves. *Src:* `DIM/DimensionSetEntry.Table.al:169-236`; `DIM/DimensionSetTreeNode.Table.al:26-56`. *Keep:* MUST (the invariant: one ID per distinct combination, independent of order). SKIP the tree itself.
- **R-DIMENSIONS-NOSERIES-AUDIT-09**: Concurrency. On the first node that is missing, the code calls `LockTable`. If an insert fails because another session inserted the node first, it re-reads that node. Promoting a node to In Use also locks. *Src:* `DIM/DimensionSetEntry.Table.al:195-206,209-216`. *Keep:* MUST (in the new system: a unique key plus insert-or-select).
- **R-DIMENSIONS-NOSERIES-AUDIT-10**: Sets are immutable. Changing one dimension on a line copies the set into a temporary buffer, replaces or removes that dimension, and computes a new ID. *Src:* `DIM/DimensionManagement.Codeunit.al:1353-1386`. *Keep:* MUST. *Notes:* the value you type is completed by prefix match (`SAL` → first value `SAL*`), see `:1331-1341`. Prefer SKIP.
- **R-DIMENSIONS-NOSERIES-AUDIT-11**: Merging and propagating sets. `GetCombinedDimensionSetID` merges up to 10 sets, and later sets override earlier ones for the same dimension. `GetDeltaDimSetID` pushes a header change down to lines. It applies only the dimensions that differ between the old and new header set. For a dimension the header **added or changed**, the line gets the new header value, **overwriting any value the line had set itself**. For a dimension the header **removed**, the line's entry for that dimension is deleted, whatever its value. Dimensions the header did not touch keep the line's own values. (verified-corrected: line overrides survive only for dimensions the header change did not touch) *Src:* `DIM/DimensionManagement.Codeunit.al:382-409,419-469`; `BA/Sales/Document/SalesHeader.Table.al:6161-6190`. *Keep:* SHOULD.

### Default dimensions
- **R-DIMENSIONS-NOSERIES-AUDIT-12**: A default with `No.` = blank applies to every record of that table (an "account-type default"). For each source, the specific record's defaults are read first (j = 1), then the table-level defaults (j = 2). *Src:* `DIM/DimensionManagement.Codeunit.al:974-978,726-727`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-13**: `Value Posting` semantics at posting. **Code Mandatory**: the set must contain some value for the dimension. **Same Code** with a default value: the set must contain exactly that value, and a missing or different value is an error. **Same Code** with a blank default: the set must *not* contain the dimension. **No Code**: the set must not contain the dimension, and the default value itself must be blank. `Allowed Values Filter` can be used only with Code Mandatory. *Src:* `DIM/DefaultDimensionValuePostingType.Enum.al:12-37`; `DIM/DefaultDimension.Table.al:150-164,214-234,845-852`; `DIM/DimensionManagement.Codeunit.al:573-594`. *Keep:* MUST (SKIP the allowed-values filter).
- **R-DIMENSIONS-NOSERIES-AUDIT-14**: **Building the defaults for a line (`GetDefaultDimID`).** (1) Seed the buffer from an inherited set, such as the document header, tagged with that set's table (Customer or Vendor). (2) Visit the sources in list order. The source of the field that triggered the rebuild is moved to position 1. (3) Defaults with a blank value are skipped. (4) For a dimension that is already in the buffer, the new value replaces it only if the new source's table has a priority for this Source Code AND either the existing table has no priority or the new priority number is lower. Otherwise **the first value wins**. (5) Global 1/2 are filled from the result. *Src:* `DIM/DimensionManagement.Codeunit.al:926-1028,3522-3531`; `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:11484-11500`; `BA/Sales/Document/SalesLine.Table.al:6577-6602,10661-10669`. *Keep:* MUST (with a fixed precedence).
- **R-DIMENSIONS-NOSERIES-AUDIT-15**: Priorities are stored per Source Code, and 1 is the highest. They are **not seeded automatically**: the "Initialize Dimension Priorities" action on page Default Dimension Priorities inserts, for the selected source code, Sales/Sales Journal: Customer (T18) = 1, Item (T27) = 2, and Purchases/Purchase Journal: Vendor (T23) = 1, Item = 2. With no priority rows (a fresh company), `GetDefaultDimID` keeps the first value, which is the inherited header value, so the header partner still wins. *Src:* `DIM/DefaultDimensionPriority.Table.al:80-90,135-165`; `DIM/DefaultDimensionPriorities.Page.al:102-116`. *Keep:* SKIP. Hard-code "partner (header) beats item/account" to match. (verified-corrected: "seeded" was wrong, these are values inserted on demand)
- **R-DIMENSIONS-NOSERIES-AUDIT-16**: Rebuilding the defaults (for example after the account changes) **resets the whole set**. Values the user entered on a journal line are lost. *Src:* `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:5072-5090`. *Keep:* SHOULD (consider keeping dimensions the user typed).

### Posting validation
- **R-DIMENSIONS-NOSERIES-AUDIT-17**: Journal line check. Unless `OverrideDimErr` is set, the check runs (a) the combination check on the line's set, then (b) value-posting rules for Account, Bal. Account, Job, Salesperson and Campaign. *Src:* `BA/Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:222-223,937-967`. *Keep:* MUST (account + bal. account + partner).
- **R-DIMENSIONS-NOSERIES-AUDIT-18**: `CheckDimValuePosting` first re-checks every pair in the set for blocked dimensions, blocked values and non-postable value types. A draft created earlier can therefore fail if a value has since been blocked. *Src:* `DIM/DimensionManagement.Codeunit.al:543-561,1748-1809,1841-1860`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-19**: **Rules accumulate.** All defaults with `Value Posting` ≠ blank are collected. The specific rule and the account-type rule for the *same* table are **both** enforced. Between *different* tables, only the higher-priority table's rule is kept. If no priorities exist, every rule is enforced. Priorities are looked up with the `SourceCode` held in that DimensionManagement instance, which only `SetSourceCode` sets. Only the sales and purchase document checks (`CheckDimensions.Codeunit.al:135,158,290,311`) call it. The journal-line check (Codeunit 11) and the derived-account check (`CheckGLAccDimError`) never set it, so in practice **every rule from every source is enforced there** (verified-corrected). A contradiction (account-type Code Mandatory plus specific No Code) makes the account impossible to post to. Report 30 "Check Value Posting" exists to find such setups. *Src:* `DIM/DimensionManagement.Codeunit.al:712-753`; `DIM/CheckValuePosting.Report.al:23`. *Keep:* MUST (cumulative), plus a setup-time conflict check.
- **R-DIMENSIONS-NOSERIES-AUDIT-20**: **G/L accounts that posting derives are checked too.** When a G/L entry is created for an account that is not the line's own G/L account or bal. account (receivables, VAT, bank or inventory accounts from posting groups), that account's rules are checked against the line's set. The check is skipped when Amount and Amount (LCY) are both 0, unless the account is an FX gain/loss account. *Src:* `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:2256-2266,7402-7432`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-21**: Sales and purchase documents run in collect-errors mode. The header set is checked against Bill-to Customer, Salesperson, Campaign, Responsibility Center and Location. Each line set is checked against the line No., Job and Location, but only for lines with a quantity to invoice, ship or receive. *Src:* `DIM/CheckDimensions.Codeunit.al:210-319`. *Keep:* MUST (header: partner; line: item/account).
- **R-DIMENSIONS-NOSERIES-AUDIT-22**: Combinations. `Blocked` means the two dimensions may not appear in the same set. `Limited` means only the value pairs listed in T351 are forbidden. A pair is stored once with Dim1 < Dim2, and the check looks it up in both orders. The check exits early if T350 is empty. *Src:* `DIM/DimensionManagement.Codeunit.al:635-710`; `DIM/DimensionCombination.Table.al:45-79`; `DIM/DimensionCombinationsMatrix.Page.al:624-656`. *Keep:* SKIP v1.

### Denormalization and propagation into entries
- **R-DIMENSIONS-NOSERIES-AUDIT-23**: A G/L entry copies `Dimension Set ID` and the two shortcut codes from the posting line as `Global Dimension 1/2 Code`. Shortcut dimensions 3–8 on entries are FlowFields that look up the `Dimension Set Entry` where `Global Dimension No.` = n. The SIFT keys include Global Dim 1/2. *Src:* `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:182-187,562-586,800,809,1004-1006`; `DIM/DimensionSetEntry.Table.al:108-111,257-279`. *Keep:* MUST (the globals), SHOULD (the rest through the set). *Invariant:* the globals must always equal the set's values (`UpdateGlobalDimFromDimSetID`, `DIM/DimensionManagement.Codeunit.al:365-372`).
- **R-DIMENSIONS-NOSERIES-AUDIT-24**: The global dimensions are not editable in G/L Setup. Changing them runs "Change Global Dimensions", which rewrites the Global Dim 1/2 columns table by table across all tables that have dimensions. *Src:* `BA/Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al:639-664`; `DIM/ChangeGlobalDimensions.Codeunit.al:397,514-541`. *Keep:* SKIP (fix the globals at setup, or derive them at query time).
- **R-DIMENSIONS-NOSERIES-AUDIT-24a** (added-in-verification): **Posted G/L entries can have their dimensions changed.** The "Dimension Correction" feature changes `G/L Entry."Dimension Set ID"` in place to a new target set, recomputes Global Dim 1/2 from it, increments `Dimension Changes Count`, and records the change in a correction log that can be undone. It posts no new entries, and it covers G/L entries only, not customer, vendor or VAT entries. The sets themselves stay immutable; only the entry's pointer changes. *Src:* `DIM/Correction/DimCorrectionRun.Codeunit.al:129-170`; `DIM/Correction/DimensionCorrectionUndo.Codeunit.al`. *Keep:* SKIP in v1. If it is added later, keep the old set ID in an audit log, as BC does. Never edit `dimension_set_entry`.
- **R-DIMENSIONS-NOSERIES-AUDIT-25**: On a document, the **receivable/payable entry uses the header set**. **Revenue/expense and VAT G/L entries use the line's set.** The invoice posting buffer groups lines by Dimension Set ID (plus account and posting groups). *Src:* `BA/Sales/Posting/SalesPostInvoice.Codeunit.al:382,399-400,534-537,607-610`; `BA/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:717-746`. *Keep:* MUST. *Consequence:* the trial balance does **not** balance per dimension value (Example 6.1).

### Number series
- **R-DIMENSIONS-NOSERIES-AUDIT-26**: Header flags. `Default Nos.` allows automatic numbers (`TestAutomatic`). `Manual Nos.` allows numbers typed by the user (`TestManual`). Clearing one of them when the other is false automatically sets the other, so at least one is always true. *Src:* `NS/Setup/NoSeries.Table.al:35-57`; `NS/Setup/NoSeriesSetupImpl.Codeunit.al:166-177`; `NS/Single/NoSeriesImpl.Codeunit.al:27-49,247-273`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-27**: **Choosing the line.** A blank usage date means WorkDate. Filter the lines to Starting Date ≤ usage date and take the **latest** Starting Date. Among the lines with that date, take the first **Open** line. The sort is on (`Series Code`, `Starting Date`), which matches key `Series Code, Starting Date, Starting No., Open`, so ties may be broken by Starting No. rather than Line No. (uncertain, depends on runtime sort). There is **no fallback to an earlier open line** if every line on the latest date is closed. If there is none: "cannot assign new numbers … on <date>" when the series has any (still open) lines, otherwise "cannot assign new numbers". (verified-corrected: the tie-break and the error conditions were stated too precisely) A usage date before the line's Starting Date is an error. *Src:* `NS/Single/NoSeriesImpl.Codeunit.al:111-168,324-335`; `NS/Setup/NoSeriesSetupImpl.Codeunit.al:118-135`. *Keep:* MUST. *Why:* this gives per-year ranges such as SI26-, SI27- without code changes.
- **R-DIMENSIONS-NOSERIES-AUDIT-28**: **Date Order.** The usage date must be ≥ the line's `Last Date Used`. This keeps numbers increasing together with dates. *Src:* `NS/Single/NoSeriesImpl.Codeunit.al:170-177`. *Keep:* MUST (for invoices).
- **R-DIMENSIONS-NOSERIES-AUDIT-29**: **Normal GetNextNo.** Re-read the line with `UpdLock`. If `Last No. Used` is blank, the next number is `Starting No.`. Otherwise it is `IncStr(Last, Increment-by)`. Check the range, then set `Last Date Used` := usage date, recalculate `Open`, and modify the line. The number is written in the caller's transaction, so a rollback returns it. *Src:* `NS/Single/NoSeriesStatelessImpl.Codeunit.al:29-62`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-30**: **Range check.** The number must be non-blank and ≥ Starting No. and ≤ Ending No. as **strings**. The non-digit skeleton must equal the Starting No. skeleton. The length must be ≥ len(Starting No.) and ≤ len(Ending No.). From `Warning No.` onwards (and only when `Ending No.` is set), the user gets a message (only if `GuiAllowed`); it is not an error. But when the caller passes `HideErrorsAndWarnings = true`, reaching the Warning No. makes `GetNextNo` return **''** instead of a number (verified-corrected, `NoSeriesStatelessImpl.Codeunit.al:52-53,99-102`). *Src:* `NS/Single/NoSeriesStatelessImpl.Codeunit.al:88-127`. *Keep:* MUST (compare integers instead). *Why:* the length checks make up for string comparison, where '10' < '9'.
- **R-DIMENSIONS-NOSERIES-AUDIT-31**: **Open.** A line is open if `Ending No.` is blank or Last No. Used is blank. It is closed if Last ≥ Ending, if len(Last) > len(Ending), or, when Increment-by ≠ 1, if the next number would exceed Ending. Closed lines are skipped when choosing a line. *Src:* `NS/Setup/NoSeriesSetupImpl.Codeunit.al:137-164`; `NS/Setup/NoSeriesLine.Table.al:97-109`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-32**: **Format consistency.** Every edited number must contain a digit (`IncStr` ≠ ''). Editing Starting, Ending, Warning (or Last No. Used) re-pads all four numbers to a common digit width with the new prefix and suffix. This happens only when the new value contains non-digit characters; an all-digit value sets the width to 0 and nothing is re-padded. Editing any field other than Last No. Used is an error if it would change `Last No. Used`. (verified-corrected) *Src:* `NS/Setup/NoSeriesSetupImpl.Codeunit.al:197-307`; `NS/Setup/NoSeriesLine.Table.al:36-96`. *Keep:* MUST (model it as prefix + width + integer).
- **R-DIMENSIONS-NOSERIES-AUDIT-33**: **Sequence implementation.** Numbers come from a DB `NumberSequence` with no row lock. The line is written only when the date or Open changes. `MayProduceGaps` = true. The text is rebuilt from the Starting No. template. The numeric part can have at most 18 digits. Switching implementation moves "last used" across. *Src:* `NS/Single/NoSeriesImplementation.Enum.al:19-32`; `NS/Single/NoSeriesSequenceImpl.Codeunit.al:31-58,79-202,266-288`. *Keep:* SHOULD (only for non-legal numbers, such as master data and drafts).
- **R-DIMENSIONS-NOSERIES-AUDIT-34**: **Journals consume numbers only at posting.** A new line *peeks* (first line in the batch). A later line copies the previous line's Document No. It *simulates* the next number (previous number + 1) only when it is the bottom line and the previous document balances. Neither consumes anything. (verified-corrected, `GenJournalLine.Table.al:4295-4312`) At posting, each new Document No. that equals `PeekNextNo` is consumed with `GetNextNo`. A different number requires `Manual Nos.`, otherwise the error is "documents that must be posted before …". Batch state lives in memory and `SaveState` writes it just before the commit. *Src:* `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:4295-4312`; `BA/Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al:386-397,319,853-871`; `NS/Batch/NoSeriesBatchImpl.Codeunit.al:87-107,147-168`; `NS/Single/NoSeriesImpl.Codeunit.al:34-37`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-35**: **Document numbering.** A draft takes `GetNextNo` on insert and loops while that No. already exists, so drafts can have gaps. Typing a No. by hand requires Manual Nos. and clears `No. Series`. At posting, `Posting No.` is taken from the posting series and **committed before the ledger posting**, so it is reserved on the document. The exception is a Date Order series, where the commit is suppressed. If a posted header with that number already exists, posting fails. When an invoice or credit memo uses the **same series for `No.` and `Posting No.`**, no second number is drawn: the posted document keeps the draft's No. (`SalesPost.Codeunit.al:2811-2813,7235-7236`). Deleting a document that holds a reserved number (or a same-series invoice/credit memo) asks for confirmation. It then inserts a placeholder posted header with source code `Deleted Document`, so no gap is left. The placeholder is not empty: it is a `TransferFields` copy of the unposted header, with Posting Date = **TODAY**, the current user, and one line whose description is the source code's description. No ledger entries are created. (verified-corrected) *Src:* `BA/Sales/Document/SalesHeader.Table.al:253-262,3966-3990,4352-4373`; `BA/Sales/Posting/SalesPost.Codeunit.al:767-782,2787-2830`; `BA/Sales/History/PostSalesDelete.Codeunit.al:48-123,262-285,317-336`; `BA/Sales/Document/SalesHeader.Table.al:3704-3722,4387-4413`. *Keep:* MUST (the gapless outcome; see the §7 alternative).
- **R-DIMENSIONS-NOSERIES-AUDIT-36**: Relationships allow other series in place of a default series. `AreRelated` requires `Default Nos.` on the default series. *Src:* `NS/Single/NoSeriesImpl.Codeunit.al:215-245`; `NS/Setup/NoSeriesRelationship.Table.al:22-69`. *Keep:* SKIP.

### Source and reason codes
- **R-DIMENSIONS-NOSERIES-AUDIT-37**: Source Code flows. The journal template's Type picks its code from Source Code Setup (General → `General Journal`, …). A new journal line copies it from the template. Document posting uses `SourceCodeSetup.Sales` or `Purchases`. The code is copied to G/L entries, the G/L register and detailed ledger entries. *Src:* `BA/Finance/GeneralLedger/Journal/GenJournalTemplate.Table.al:105-150`; `…/GenJournalLine.Table.al:4327`; `BA/Sales/Posting/SalesPost.Codeunit.al:803`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:1007`; `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1938,3690-3735`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-38**: **Source codes drive logic.** Reversal posts with `Reversal`, as storno entries: same side, negative amount (see 6.3), with `Journal Batch Name` cleared (added-in-verification). Because of the batch rule below, document-posted entries such as sales invoices cannot be reversed with "Reverse Transaction"; they need a credit memo. Year-end closing posts with `Close Income Statement`. Dimension priorities are keyed by source code. Deferral posting treats General, Sales and Purchase *journal* codes differently from document postings. An entry without a journal batch can be reversed only if its code is Payment Reconciliation or Bank Rec. transfer. *Src:* `BA/Finance/GeneralLedger/Reversal/GenJnlPostReverse.Codeunit.al:133`; `BA/Finance/GeneralLedger/Setup/CloseIncomeStatement.Report.al:141`; `DIM/DefaultDimensionPriority.Table.al:90`; `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:2556-2567,8035-8047,8361-8363`; `BA/Finance/GeneralLedger/Reversal/ReversalEntry.Table.al:618-639`. *Keep:* MUST, as a closed enum.
- **R-DIMENSIONS-NOSERIES-AUDIT-39**: Reason Code is an optional Code[10]. It defaults from the journal batch or the document header, and is copied to G/L, VAT and detailed ledger entries. No posting logic depends on it. *Src:* `AC/ReasonCode.Table.al:28-40`; `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:4328`; `BA/Sales/Posting/SalesPostInvoice.Codeunit.al:537,610`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:281,1029`. *Keep:* SHOULD (make it mandatory on credit memos and reversals in v1).

---

## 4. Flows

**F1. Default dimensions for a new document line** (R-14)
1. Read the header's set (for example Customer C001 → {REGION=UB}) and tag it with table = Customer.
2. Build the sources: [line No. (Item or G/L), Responsibility Center, Job, Location]. The source of the field just validated goes first.
3. For each source: specific defaults, then table-level defaults, skipping blank values, with first-wins or priority replacement.
4. Look up each value's `Dimension Value ID`, then compute the set ID (F2) and the Global 1/2 codes.

**F2. Get set ID** (R-07…09)
1. Drop blank pairs. If nothing is left, return 0.
2. Sort by Dimension Value ID ascending. Set node := root (0).
3. For each pair: get (node, valueId). If it is missing, lock and insert, or re-read if another session inserted it. Set node := that node's Set ID.
4. If the final node is not In Use, lock, set In Use, and insert the `Dimension Set Entry` rows. Return the Set ID.

**F3. Journal line posting** (R-17…20, 23)
1. Check Line: combination check, then `CheckDimValuePosting`: blocked/type re-check, collect rules (R-19), evaluate. Any error stops the batch.
2. Post Line → `InitGLEntry` for each G/L account touched. A derived account goes through `CheckGLAccDimError`.
3. `GLEntry.CopyFromGenJnlLine`: Dimension Set ID, Global Dim 1/2, Source Code, Reason Code, journal template and batch.

**F4. Gen. Journal batch numbering** (R-34)
1. While entering lines: peek or simulate the number. Nothing is written.
2. Posting, balance pass: for each new Document No., if it equals the peeked number, take it with GetNextNo in memory; otherwise run TestManual.
3. If the batch has a `Posting No. Series`, each line takes GetNextNo from it, and lines that shared a Document No. keep sharing the new number.
4. After all entries are posted: `SaveState` writes Last No. Used, then the commit. A failure rolls back everything and leaves no gap.

**F5. Sales invoice posting numbers** (R-35)
1. If `Posting No.` is blank, take GetNextNo(Posting No. Series, Posting Date). Skip this for an invoice or credit memo whose `No. Series` = `Posting No. Series`, which keeps its draft No. (verified-corrected)
2. Modify the header and **commit**. Skip the commit for a Date Order series.
3. Post. If posting fails, the number stays on the unposted document and is reused on the next attempt.
4. Deleting that document writes a placeholder posted header.

---

## 5. Calculations & rounding

- **Dimensions carry no amounts.** BC never splits or rounds an amount by dimension. A line has exactly one set. Splitting an amount across departments needs separate lines or allocation accounts, which belong to another subsystem.
- **Set key:** `path = sort_asc([valueId for (dim, value) in set])`. Set ID = the node reached by that path. Two sets are equal ⇔ their sorted valueId lists are equal. Because valueId is unique across all dimensions, sorting gives a total order.
- **Priority comparator** (`DIM/DimensionManagement.Codeunit.al:750-753`): `greater(p1, p2) = p1 > 0 AND (p2 = 0 OR p1 < p2)`. A missing priority is 0 and means "lowest". In `GetDefaultDimID` the comparison is `<` on the stored priorities, so equal priorities keep the first value.
- **Grouping effect:** document posting adds amounts per (account, posting groups, **Dimension Set ID**, …). More distinct sets means more G/L lines, but the totals do not change. No rounding happens in the buffer.
- **IncStr** (Microsoft Learn, *Text.IncStr*): it changes only the **last** digit group. Zero padding is kept (`SI26-00041` → `SI26-00042`). On overflow the string gets longer (`a12b99c` → `a12b100c`). A string with no digits returns ''. A `-` directly before the digits *is* treated as a sign, but per the docs a negative number is "decreased" by one (`'-55'` → `'-56'`). The digits therefore still grow, and `SI26-00041` → `SI26-00042` either way. The overload with an increment (runtime 15+) moves the number by `Increment-by` the same way. (verified-corrected: the earlier wording implied a hazard that does not exist for the digits)
- **Sequence formatting** (`NS/Single/NoSeriesSequenceImpl.Codeunit.al:145-172`): take the Starting No. as a template and find the position *i* of its last digit. The number's text **overwrites the len(number) characters ending at *i***, whatever they are, keeping any suffix (`SI26-00001` + 42 → `SI26-00042`). If the number is longer than the run but still fits left of *i*, it overwrites prefix characters too (`SI26-00001` + 123456 → `SI26123456`). The range check then usually rejects that, because the non-digit skeleton changed. Only when the number is longer than the whole template up to *i* does it fall back to prefix + number, which drops the suffix. (verified-corrected: it is not "if wider than the run, use prefix + number")
- **Open after GetNextNo:** `open = Ending = '' OR Last = '' OR (Last < Ending AND len(Last) ≤ len(Ending) AND (inc = 1 OR (IncStr(Last, inc) ≤ Ending AND len ≤ len(Ending))))`.

---

## 6. Worked posting examples

Setup used in all examples. Dimensions: DEPT = Global 1, PROJECT = Global 2, REGION = Shortcut 3. Values were inserted in this order, which gives the IDs: ADMIN = 1, SALES = 2, SHOP = 3, P001 = 4, UB = 5, DARKHAN = 6. The tree starts empty. Default dimensions: Customer C001: REGION = UB, *Code Mandatory*. Item ITEM-A: DEPT = SHOP, Value Posting blank. G/L 5110 Service revenue: DEPT = SALES, *Same Code*. G/L 7020 Rent: DEPT, *Code Mandatory*, no value. Currency is MNT, VAT is 10%, and Amount is signed (+ debit, − credit).

**Set IDs created** (F2):
| Combination | Sorted value IDs | Nodes created (parent, valueId → ID) | Set ID |
|---|---|---|---|
| {REGION=UB} (invoice header) | [5] | (0,5→1) In Use | 1 |
| {DEPT=SHOP, REGION=UB} (line 1) | [3,5] | (0,3→2) prefix only; (2,5→3) In Use | 3 |
| {DEPT=SALES, REGION=UB} (line 2) | [2,5] | (0,2→4) prefix; (4,5→5) In Use | 5 |
| {DEPT=ADMIN} (journal) | [1] | (0,1→6) In Use | 6 |
| {DEPT=SHOP} (later) | [3] | node 2 found, promoted to In Use | 2 |

### 6.1 Sales invoice SI26-00042: two lines, different departments
Line 1: ITEM-A, net 1,000,000. Line 2: G/L 5110 service, net 500,000. Header set = 1. Source Code = SALES.

| # | G/L account | Debit | Credit | Amount | Set ID | Global Dim 1 | REGION (via set) |
|---|---|---:|---:|---:|---:|---|---|
| 1 | 1210 Receivables | 1,650,000 | | +1,650,000 | 1 | – | UB |
| 2 | 5100 Revenue, goods | | 1,000,000 | −1,000,000 | 3 | SHOP | UB |
| 3 | 3410 VAT payable | | 100,000 | −100,000 | 3 | SHOP | UB |
| 4 | 5110 Revenue, services | | 500,000 | −500,000 | 5 | SALES | UB |
| 5 | 3410 VAT payable | | 50,000 | −50,000 | 5 | SALES | UB |
| | **Total** | **1,650,000** | **1,650,000** | **0** | | | |

Checks: the header set satisfies C001's REGION Code Mandatory. Set 5 satisfies G/L 5110's Same Code SALES. Changing line 2 to SHOP (set 3) would fail. Per-dimension view: DEPT=SHOP −1,100,000; DEPT=SALES −550,000; DEPT blank +1,650,000. The totals sum to 0, but **no single DEPT value balances** (R-25). If a table-level default "G/L Account: DEPT Code Mandatory" were added, row 1 would fail at `InitGLEntry`, because 1210 is a derived account and the header set has no DEPT (R-20).

(added-in-verification) Accounts in BC: 5100 is General Posting Setup's `Sales Account` for the item line. 5110 is the line's own G/L account, because for a G/L Account line the line No. is the revenue account (`SalesPostInvoice.Codeunit.al:295-308`). 1210 comes from the Customer Posting Group, and 3410 from VAT Posting Setup. Because ITEM-A is an inventory item, BC also posts COGS Dr / Inventory Cr from the value entries, with the line's set 3. These entries post at once only with Automatic Cost Posting; otherwise they wait for "Post Inventory Cost to G/L". They are left out here because no unit cost is given. They balance among themselves and do not change the totals above.

### 6.2 General journal GJ26-0008: rent paid from bank, set 6, Source Code GENJNL
One line: Account G/L 7020, Bal. Account BANK-KHAN (posting group → G/L 1110), 2,200,000 including VAT. The number was peeked while the line was entered and consumed at posting.

| # | G/L account | Debit | Credit | Amount | Set ID | Global Dim 1 |
|---|---|---:|---:|---:|---:|---|
| 1 | 7020 Rent expense | 2,000,000 | | +2,000,000 | 6 | ADMIN |
| 2 | 1530 VAT receivable | 200,000 | | +200,000 | 6 | ADMIN |
| 3 | 1110 Bank | | 2,200,000 | −2,200,000 | 6 | ADMIN |
| | **Total** | **2,200,000** | **2,200,000** | **0** | | |

The bank side uses the same set as the line, because it comes from one journal line. Without DEPT the line fails the check (7020 Code Mandatory). Accounts 1530 and 1110 are derived and checked in `InitGLEntry`.

### 6.3 Reversal of 6.2, Source Code REVERSAL (verified-corrected: BC reverses as storno)
| # | G/L account | Debit Amount | Credit Amount | Amount | Set ID |
|---|---|---:|---:|---:|---:|
| 1 | 7020 Rent expense | −2,000,000 | | −2,000,000 | 6 |
| 2 | 1530 VAT receivable | −200,000 | | −200,000 | 6 |
| 3 | 1110 Bank | | −2,200,000 | +2,200,000 | 6 |
| | **Total** | **−2,200,000** | **−2,200,000** | **0** | |

`ReverseGLEntry` copies the original entry and negates `Amount`, `Debit Amount` and `Credit Amount`. It sets `Correction` because the negated debit/credit is negative, and `UpdateDebitCredit(Correction = true)` keeps a negative amount on the **original side**. The reversal therefore shows as a negative debit on 7020 and 1530 and a negative credit on 1110, not as opposite-side entries. Amounts still net to 0 and the account balances are correct. Each entry is copied from the original, so it keeps the original document number, posting date and set. `Journal Batch Name` is cleared and source code REVERSAL is used. *Src:* `BA/Finance/GeneralLedger/Reversal/GenJnlPostReverse.Codeunit.al:133,218-247`; `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:2391`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:964-974`. The VAT entry and bank ledger entry are reversed the same way. A bank ledger entry that is already reconciled blocks the reversal.

### 6.4 Sales credit memo SCM26-00003: return of goods, Reason Code RETURN
| # | G/L account | Debit | Credit | Amount | Set ID | Reason |
|---|---|---:|---:|---:|---:|---|
| 1 | 5100 Revenue, goods | 100,000 | | +100,000 | 3 | RETURN |
| 2 | 3410 VAT payable | 10,000 | | +10,000 | 3 | RETURN |
| 3 | 1210 Receivables | | 110,000 | −110,000 | 1 | RETURN |
| | **Total** | **110,000** | **110,000** | **0** | | |

(verified-corrected) For an Item credit-memo line, BC debits General Posting Setup's **`Sales Credit Memo Account`**, not the `Sales Account` (`SalesPostInvoice.Codeunit.al:302-308`). Row 1 shows 5100 only on the assumption that both setup fields point to the same account; many charts use a separate sales-returns account. The debit/credit columns assume G/L Setup `Mark Cr. Memos as Corrections` = No. With Yes, the header's `Correction` flag makes these storno entries: −100,000 credit, −10,000 credit, −110,000 debit (`SalesHeader.Table.al:4039`; `GLEntry.Table.al:964-974`). The returned item also reverses COGS/inventory with set 3, which is not shown here.

### 6.5 Numbering only (no amounts): series SINV, Date Order = Yes
Line 10000: Starting Date 2026-01-01, SI26-00001..SI26-99999, Warning SI26-99000, Last SI26-00041, Last Date 2026-10-05. Line 20000: Starting Date 2027-01-01, Starting No. SI27-00001.

| Call | Line used | Result |
|---|---|---|
| GetNextNo(2026-10-06) | 10000 | SI26-00042; Last Date := 2026-10-06 |
| GetNextNo(2026-10-04) | 10000 | Error: date before 2026-10-06 (Date Order) |
| GetNextNo(2027-01-02) | 20000 | SI27-00001 (Last blank → Starting No.) |
| GetNextNo(2025-12-31) | none | Error: cannot assign on 2025-12-31 |
| Same rollback after GetNextNo (Normal) | 10000 | Last returns to SI26-00041 → no gap |
| Same with Implementation = Sequence | 10000 | Sequence value is consumed → gap |

---

## 7. Simplifications for the micro-business system

**Dimensions**
- Keep the generic set model. It is cheap and keeps reports flexible. Allow at most 4 active dimensions, 2 of them "global" with denormalized columns `dim1_value_id` and `dim2_value_id` on `gl_entry`. Choose the globals once at company setup. Changing them later is an admin job that recomputes the columns from the set.
- Replace the tree with `dimension_set(id PK, key_hash UNIQUE, key_text)`, where `key_text = join(sorted('dimId:valueId'))`. Use `INSERT … ON CONFLICT (key_hash) DO NOTHING RETURNING id`, then SELECT. Rows in `dimension_set_entry(set_id, dimension_id, value_id)` are written once. Keep **set 0 = empty**.
- Store value references by surrogate ID. Codes can then be renamed without cascading updates.
- Default dimensions: `default_dimension(entity_type, entity_id NULL = all, dimension_id, value_id NULL, value_posting ENUM(none, mandatory, same, forbidden))`. Fixed precedence when building a line set: explicit user input > header partner (inherited header set) > line item/account > other line sources (responsibility center, job, location) > table-level defaults of the same source. This replaces the priority table and is deterministic. It matches BC: the header set is tagged as Customer/Vendor (priority 1) and beats Item (priority 2). It also matches BC with no priority rows, where the first (header) value wins. (verified-corrected: the earlier order "line item/account > header partner" was the reverse of BC and contradicted R-15)
- Validation: implement R-13, R-18, R-19 (cumulative) and R-20 (derived accounts) exactly. Add a setup-time check that rejects contradictory rules (in place of Report 30).
- SKIP: combinations, allowed-values filter, Heading/Begin/End-Total, translations, IC mapping, consolidation codes, the indent tool and the 8-slot shortcut system. For value hierarchies, use `parent_id` with Total values computed by recursive rollup.

**Number series**
- `number_series(code, name, allow_auto, allow_manual, date_order, gapless BOOL)` and `number_series_line(series_id, starting_date, prefix, width, suffix, start_int, end_int NULL, warning_int NULL, last_int NULL, last_date_used, open)`. Use integer arithmetic and fixed width. This removes string comparison and IncStr edge cases. Drop Increment-by, Relationships, and switching implementations at runtime.
- **Gapless series** (posted invoices, credit memos, cash vouchers, journal vouchers): `SELECT … FOR UPDATE` on the line **inside the posting transaction**, as late as possible. For 1–10 users this serialization costs nothing. Because the number is never committed before posting, the BC reserve-and-placeholder machinery (R-35) is not needed.
- **Gaps allowed** (draft documents, customers, items): use a DB sequence or a plain counter. Never reuse a number.
- Keep the Starting Date lines for per-year prefixes. Optionally generate next year's line automatically.

**Audit codes**
- Source code is a closed enum: `GENJNL, SALES, PURCHASE, CASH_RECEIPT, PAYMENT, BANK_REC, REVERSAL, FX_REVAL, VAT_SETTLEMENT, CLOSE_YEAR, OPENING, INVENTORY`. Store it on `gl_entry`, `gl_register` and the subledgers. Do not build a Source Code Setup table.
- Reason code is a small user table. It is optional, but required on credit memos and reversals.

---

## 8. Pitfalls / edge cases the new implementation must not miss

1. The set key must not depend on input order or on dimension names. Two identical sets must always get the same ID, and a concurrent insert must not create a duplicate.
2. An empty set is 0 and has no rows. Blank values never appear in sets.
3. Never update set entries in place. Old ledger entries reference them.
4. Same Code with a **blank** default means "must be blank", not "anything".
5. Rules accumulate within a table (specific + account-type). Contradictory setups lock an account.
6. Rules on control accounts (receivables, VAT, bank) apply through derived postings. One "Code Mandatory" on VAT payable breaks every invoice whose *line* sets lack that dimension, because VAT G/L entries use the line set. The same rule on receivables breaks every invoice whose *header* set lacks it. (verified-corrected)
7. Blocked values are re-checked at posting. Drafts created earlier can fail.
8. Begin-Total values are postable in BC. Decide explicitly; recommendation: Standard only.
9. Rebuilding the defaults on an account change throws away manual dimensions (BC behavior). Header→line propagation must be a delta, so line overrides survive for the dimensions the header did not change. BC overwrites or removes a line's own value for any dimension the header changes (R-11). (verified-corrected)
10. Per-dimension trial balances do not balance (header set vs line sets). Reports must show a "blank" bucket and must not promise a balanced balance sheet per department.
11. The global dimension columns must stay equal to the set. Any rewrite (a global remap, a dimension correction) must update both.
12. Number comparison: never compare formatted numbers as strings. `SI26-100000` < `SI26-99999` as text.
13. Date Order is enforced on the *line's* Last Date Used. Backdated postings fail. Opening-balance imports must run in date order, or use a series without Date Order.
14. A Peek is not a reservation. Two users can see the same peeked number. Only the posting transaction's consumption counts.
15. A Starting No. without digits cannot be incremented. Width overflow (99999 → 100000) must either be an error or be explicitly allowed. Code[20] is the maximum length.
16. If there is no line for the date (for example 2025 postings into a 2026-only series), the error must be clear. Opening-balance setup needs earlier lines.
17. Source codes that drive logic (REVERSAL, CLOSE_YEAR) must not be editable by users.
18. (added-in-verification) Journal batch numbering in BC is computed in memory in the balance pass, *before* `GLEntry.LockTable()` (`GenJnlPostBatch.Codeunit.al:255-258`). `SaveState` then re-`Get`s the series line and overwrites it (`NoSeriesBatchImpl.Codeunit.al:159-168`). Whether two batches sharing one series, posted at the same time, can produce the same Document No. was **not verified** (uncertain). The new system must take the series-row lock inside the posting transaction before the number is used, as §7 already proposes.
19. (added-in-verification) Reversal in BC is storno: the reversing G/L entry stays on the original side with a negative amount (`Debit Amount` = −original). Reports that sum `Debit Amount`/`Credit Amount` columns will show negative turnover. Decide explicitly whether the new system reverses as storno or as opposite-side entries; Mongolian practice and the trial-balance turnover columns depend on it.

---

## 9. Open questions

1. Does Mongolian law (accounting law, or primary document rules for invoices and cash vouchers) require **gapless** internal numbering, given that eBarimt issues its own receipt ID (ДДТД)? This decides which series are `gapless`.
2. Which 2 global dimensions fit typical 1–10 person firms: Branch/Store and Project? Do we need more than 4 dimensions at all?
3. Must per-branch financial statements balance? If yes, we need balancing entries per dimension value, which goes beyond BC behavior.
4. Should the defaults rebuild keep dimensions the user typed (a UX improvement on BC, R-16)?
5. Should Reason Code be mandatory for every manual journal and credit memo, as an audit-trail requirement?
6. Should numbering restart each year (SI26-/SI27- lines), or run continuously? Is this driven by the tax office or by preference?
7. ~~`IncStr` with a hyphen before the digits~~ Resolved in verification: per the AL docs a negative number is "decreased" (`-55` → `-56`), so the digit run still grows, and `SI26-00041` → `SI26-00042` with or without the sign reading. Moot anyway if we use prefix + integer. (verified-corrected)
8. Allowing a dimension value code rename after use: allowed in BC (it cascades). Is it acceptable for exports that were already filed (VAT/eBarimt reports by branch)?

---

## Verification log

Adversarial check against the AL source in this repo (paths as in the legend; `GJPL` = `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al`, `DM` = `DIM/DimensionManagement.Codeunit.al`). Every worked example was recomputed: all five balance (debits = credits, VAT 10% exact, no rounding needed).

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| §1: validation order is blocked → combinations → value posting | corrected (combinations run first, then blocked/type inside CheckDimValuePosting) | `BA/Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:950-967`; `DM:558-561` |
| R-01: dimension code not blank, not a reserved caption; Blocked | confirmed | `DIM/Dimension.Table.al:43-67,108` |
| R-02: delete blocked while global/shortcut/budget/analysis-view dim | corrected (shortcut 3–8 does not block; GL Setup shortcut code is cleared) | `DIM/Dimension.Table.al:176-232,384-402,518-538` |
| R-03: Dimension Value ID AutoIncrement, not editable; `(CONFLICT)` reserved | confirmed | `DIM/DimensionValue.Table.al:55-68,184-194,333-337` |
| R-04: value delete blocked if used in a set; rename cannot change dimension | confirmed | `DIM/DimensionValue.Table.al:243-247,301-319,351-357` |
| R-05: postable types = Standard and Begin-Total | confirmed | `DM:1811-1834` |
| R-06: indent, 10 levels, End-Total without Begin-Total errors | confirmed | `DIM/DimensionValueIndent.Codeunit.al:37,52,85-102` |
| R-07…09: tree walk by ascending Dimension Value ID, LockTable on first miss, insert-or-get, In Use promotion | confirmed | `DIM/DimensionSetEntry.Table.al:169-236`; `DIM/DimensionSetTreeNode.Table.al:26-59` |
| §6 set-ID table (IDs 1,3,5,6,2) | confirmed (recomputed node by node) | `DIM/DimensionSetEntry.Table.al:190-221` |
| R-10: sets immutable; prefix completion of typed value | confirmed | `DM:1331-1341,1353-1386` |
| R-11: delta propagation keeps line overrides | corrected (header-changed or header-removed dims overwrite/delete the line's own value) | `DM:419-469` |
| R-13: Value Posting semantics; No Code requires blank default; Allowed Values Filter only with Code Mandatory | confirmed | `DM:573-594`; `DIM/DefaultDimension.Table.al:150-164,214-234,845-852` |
| R-14: GetDefaultDimID: inherit header set tagged Customer, triggering source first, first value wins unless priority | confirmed | `DM:960-1004,3522-3531`; `BA/Sales/Document/SalesLine.Table.al:6590-6593,10661-10669` |
| R-15: priorities "seeded" Customer/Vendor = 1, Item = 2 | corrected (inserted only by the "Initialize Dimension Priorities" action) | `DIM/DefaultDimensionPriority.Table.al:135-165`; `DIM/DefaultDimensionPriorities.Page.al:102-116` |
| R-16: journal default rebuild resets the whole set | confirmed | `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:5072-5090` |
| R-17: journal check sources Account, Bal. Account, Job, Salesperson, Campaign | confirmed | `BA/Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:222-223,941-967` |
| R-18: blocked/type re-check at posting | confirmed | `DM:558-561,1841-1860` |
| R-19: specific + account-type rules both enforced; priorities filter between tables | corrected (priority filter only where `SetSourceCode` ran, i.e. sales/purchase document checks; journals and derived accounts enforce all) | `DM:137-171,712-762`; `DIM/CheckDimensions.Codeunit.al:135,158,290,311` |
| R-20: derived G/L accounts checked in InitGLEntry; skipped at zero amount unless gain/loss account | confirmed | `GJPL:2256-2266,7402-7432` |
| R-21: sales header/line dimension checks in collect-errors mode, lines only with qty to invoice/ship/receive | confirmed | `DIM/CheckDimensions.Codeunit.al:210-319` |
| R-22: Blocked/Limited combinations, stored Dim1 < Dim2, checked both orders, early exit if empty | confirmed | `DM:646-710`; `DIM/DimensionCombinationsMatrix.Page.al:629-656` |
| R-23: G/L entry copies set ID and global 1/2; shortcuts 3–8 are FlowFields; SIFT key has globals | confirmed | `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:182-187,562-586,800,1004-1007` |
| R-24: Global Dimension 1/2 Code not editable in G/L Setup | confirmed | `BA/Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al:639-664` |
| R-25: receivable uses header set; revenue/VAT use line set; buffer groups by set ID | confirmed | `BA/Sales/Posting/SalesPostInvoice.Codeunit.al:382,531-537,607-610`; `BA/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:717-746` |
| R-26: Default Nos./Manual Nos. — at least one stays true | confirmed | `NS/Setup/NoSeriesSetupImpl.Codeunit.al:166-177` |
| R-27: line choice, tie-break by Line No., error texts | corrected (tie-break order uncertain; no fallback to older line; "on date" error depends on open lines) | `NS/Single/NoSeriesImpl.Codeunit.al:129-168`; `NS/Setup/NoSeriesLine.Table.al:148` |
| R-28: Date Order vs line's Last Date Used | confirmed | `NS/Single/NoSeriesImpl.Codeunit.al:170-177` |
| R-29: Normal GetNextNo with UpdLock, Starting No. when blank, IncStr otherwise | confirmed | `NS/Single/NoSeriesStatelessImpl.Codeunit.al:29-62` |
| R-30: range check; warning is only a message | corrected (with HideErrorsAndWarnings the warning makes GetNextNo return '') | `NS/Single/NoSeriesStatelessImpl.Codeunit.al:52-53,88-127` |
| R-31: Open calculation | confirmed | `NS/Setup/NoSeriesSetupImpl.Codeunit.al:137-164` |
| R-32: re-padding on edit of Starting/Ending/Warning | corrected (also Last No. Used; only when the new value has non-digits) | `NS/Setup/NoSeriesSetupImpl.Codeunit.al:197-225` |
| R-33: Sequence implementation, gaps, 18-digit limit, implementation switch | confirmed | `NS/Single/NoSeriesSequenceImpl.Codeunit.al:31-58,79-143,174-202,266-288` |
| §5: Sequence formatting "if wider than run, use prefix + number" | corrected (number overwrites characters right-aligned at the last digit; fallback only when longer than the template) | `NS/Single/NoSeriesSequenceImpl.Codeunit.al:145-172` |
| §5 and Q7: IncStr reads `-` as minus, implied risk | corrected (negative numbers are "decreased", digits still grow; no hazard) | Microsoft Learn *Text.IncStr(Text)* and *Text.IncStr(Text, BigInteger)* |
| R-34: new journal line peeks or simulates | corrected (simulate only on bottom line after a balanced document; otherwise copies previous Document No.); posting consumption confirmed | `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:4295-4312`; `BA/Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al:386-397,319` |
| R-35: posting no. reserved and committed; delete writes "empty" placeholder | corrected (same-series invoice keeps draft No.; placeholder is a header copy dated TODAY with one text line; confirmation asked) | `BA/Sales/Posting/SalesPost.Codeunit.al:767-782,2797-2830,7235-7236`; `BA/Sales/History/PostSalesDelete.Codeunit.al:48-123,232-336` |
| R-36: AreRelated requires Default Nos. | confirmed | `NS/Single/NoSeriesImpl.Codeunit.al:231-245` |
| R-37: source code from template type; copied to G/L entry, register, detailed entries | confirmed | `BA/Finance/GeneralLedger/Journal/GenJournalTemplate.Table.al:105-150`; `GJPL:1938,3690-3693` |
| R-38: source codes drive reversal, closing, deferrals, reversibility | confirmed (storno detail added) | `BA/Finance/GeneralLedger/Reversal/GenJnlPostReverse.Codeunit.al:133,243`; `BA/Finance/GeneralLedger/Reversal/ReversalEntry.Table.al:618-639`; `GJPL:2556-2567,8361-8363` |
| R-39: Reason Code Code[10], from batch/header, no logic | confirmed | `AC/ReasonCode.Table.al:28-40`; `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:4328`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:1029` |
| §7: precedence "line item/account > header partner" matches BC | refuted (BC: header partner, tagged Customer/Vendor = priority 1, beats Item = 2; also first-wins without priorities) | `BA/Sales/Document/SalesLine.Table.al:6590-6593`; `DM:983-996`; `DIM/DefaultDimensionPriority.Table.al:146-160` |
| Ex 6.1: amounts, VAT, per-dimension totals, derived-account failure | confirmed (1,650,000 = 1,000,000 + 100,000 + 500,000 + 50,000); COGS/inventory omission noted | `BA/Sales/Posting/SalesPostInvoice.Codeunit.al:295-308`; `GJPL:2256-2266` |
| Ex 6.2: 2,200,000 incl. 10% VAT = 2,000,000 + 200,000; bank side derived | confirmed | `GJPL:2256-2266` |
| Ex 6.3: reversal shown as opposite-side debit/credit | refuted (BC reverses as storno: negative Debit Amount on 7020/1530, negative Credit Amount on 1110; Amount column was right) | `BA/Finance/GeneralLedger/Reversal/GenJnlPostReverse.Codeunit.al:225-247`; `GJPL:2391`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:964-974` |
| Ex 6.4: credit memo debits 5100 Revenue, goods | corrected (BC uses General Posting Setup `Sales Credit Memo Account`; storno if Mark Cr. Memos as Corrections) | `BA/Sales/Posting/SalesPostInvoice.Codeunit.al:302-308`; `BA/Sales/Document/SalesHeader.Table.al:4037-4040` |
| Ex 6.5: numbering results incl. Date Order error and no-line error | confirmed | `NS/Single/NoSeriesImpl.Codeunit.al:129-177`; `NS/Single/NoSeriesStatelessImpl.Codeunit.al:41-61` |
| §2 object IDs (T348–356, T480/481, CU 408/481/483, T308–310, CU 308/310, T230/231/242/6635, R 30) | confirmed | object declarations in each cited file |
| §8 pitfall 6: VAT rule breaks invoices whose header or line sets lack the dim | corrected (VAT uses line sets only; receivables use header set) | `BA/Sales/Posting/SalesPostInvoice.Codeunit.al:382,607-610` |
| §8 pitfall 9: delta propagation preserves line overrides | corrected (only for untouched dims) | `DM:419-469` |
| Missing: Dimension Correction rewrites posted G/L entry set IDs | added (R-24a) | `DIM/Correction/DimCorrectionRun.Codeunit.al:129-170` |
| Missing: batch numbering computed before G/L lock | added (pitfall 18, marked uncertain) | `BA/Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al:255-258`; `NS/Batch/NoSeriesBatchImpl.Codeunit.al:159-168` |
| Missing: reversal is storno; document entries not reversible | added (R-38, pitfall 19) | `BA/Finance/GeneralLedger/Reversal/GenJnlPostReverse.Codeunit.al:225-247`; `BA/Finance/GeneralLedger/Reversal/ReversalEntry.Table.al:626-639` |
