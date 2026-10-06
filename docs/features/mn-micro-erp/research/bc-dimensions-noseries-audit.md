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
- **Posting validation runs in layers.** The engine checks blocked dimensions and values, then dimension combinations, then value-posting rules for every source on the line. It then checks the rules again for each G/L account that posting derives, such as the receivables, VAT and bank accounts.
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
- **R-DIMENSIONS-NOSERIES-AUDIT-02**: A dimension cannot be deleted while it is a global, shortcut, budget or analysis-view dimension, or while any of its values appears in a dimension set. A delete cascades to its default dimensions, values, combinations and translations. *Src:* `DIM/Dimension.Table.al:176-232,307-334,346-478`. *Keep:* MUST (block the delete if the dimension is used).
- **R-DIMENSIONS-NOSERIES-AUDIT-03**: A value is keyed by (Dimension Code, Code). The code cannot be blank or `(CONFLICT)`, which the UI reserves for multi-line edits. On insert, the value gets a global auto-increment `Dimension Value ID` that can never be edited, and a `Global Dimension No.` that says which of the 8 slots its dimension occupies. *Src:* `DIM/DimensionValue.Table.al:55-68,184-194,224,279-289,722-751`. *Keep:* MUST (surrogate ID). *Why:* tree nodes and set entries reference the integer ID, so renaming a value code does not break sets.
- **R-DIMENSIONS-NOSERIES-AUDIT-04**: A value cannot be deleted while any `Dimension Set Entry` references its ID. A rename cannot move a value to another dimension. A rename within the same dimension is allowed and cascades. *Src:* `DIM/DimensionValue.Table.al:243-277,301-319,351-357`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-05**: Value types: only `Total` and `End-Total` may have `Totaling`. Once a value has been used, its type cannot be changed from Standard to anything else. **Postable values are Standard *and* Begin-Total.** Heading, Total and End-Total are rejected. *Src:* `DIM/DimensionValue.Table.al:83-119`; `DIM/DimensionManagement.Codeunit.al:1811-1834`. *Keep:* Standard MUST; Total SHOULD; SKIP Heading, Begin-Total and End-Total.
- **R-DIMENSIONS-NOSERIES-AUDIT-06**: Indent builds the totals. The function walks values in Code order. For each End-Total it sets `Totaling := <matching Begin-Total>..<End-Total>`. Nesting is limited to 10 levels, and an End-Total without a matching Begin-Total is an error. Totaling filters are expanded recursively to leaf values, with a guard against cycles. *Src:* `DIM/DimensionValueIndent.Codeunit.al:37,69-105`; `DIM/DimensionManagement.Codeunit.al:3152-3254`. *Keep:* SKIP the indent function. Use `parent_id` with a recursive rollup (SHOULD).

### Dimension sets
- **R-DIMENSIONS-NOSERIES-AUDIT-07**: A set holds at most one value per dimension (PK = Set ID + Dimension Code). Entries with a blank code or blank value are ignored. If nothing remains, the ID is **0**. *Src:* `DIM/DimensionSetEntry.Table.al:116,181-188`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-08**: **Finding the set ID.** Sort the pairs by `Dimension Value ID` ascending. Starting at parent 0, look up the node (parent, valueId) for each pair, and create it with an auto-increment ID if it is missing. The last node's ID is the set ID. Only a node flagged `In Use` has `Dimension Set Entry` rows. Prefix nodes exist but are not sets until they are first used as a set themselves. *Src:* `DIM/DimensionSetEntry.Table.al:169-236`; `DIM/DimensionSetTreeNode.Table.al:26-56`. *Keep:* MUST (the invariant: one ID per distinct combination, independent of order). SKIP the tree itself.
- **R-DIMENSIONS-NOSERIES-AUDIT-09**: Concurrency. On the first node that is missing, the code calls `LockTable`. If an insert fails because another session inserted the node first, it re-reads that node. Promoting a node to In Use also locks. *Src:* `DIM/DimensionSetEntry.Table.al:195-206,209-216`. *Keep:* MUST (in the new system: a unique key plus insert-or-select).
- **R-DIMENSIONS-NOSERIES-AUDIT-10**: Sets are immutable. Changing one dimension on a line copies the set into a temporary buffer, replaces or removes that dimension, and computes a new ID. *Src:* `DIM/DimensionManagement.Codeunit.al:1353-1386`. *Keep:* MUST. *Notes:* the value you type is completed by prefix match (`SAL` → first value `SAL*`), see `:1331-1341`. Prefer SKIP.
- **R-DIMENSIONS-NOSERIES-AUDIT-11**: Merging and propagating sets. `GetCombinedDimensionSetID` merges up to 10 sets, and later sets override earlier ones for the same dimension. `GetDeltaDimSetID` pushes a header change down to lines. It applies only the dimensions that differ between the old and new header set, so dimensions a line changed itself are kept. *Src:* `DIM/DimensionManagement.Codeunit.al:382-409,419-469`; `BA/Sales/Document/SalesHeader.Table.al:6161-6190`. *Keep:* SHOULD.

### Default dimensions
- **R-DIMENSIONS-NOSERIES-AUDIT-12**: A default with `No.` = blank applies to every record of that table (an "account-type default"). For each source, the specific record's defaults are read first (j = 1), then the table-level defaults (j = 2). *Src:* `DIM/DimensionManagement.Codeunit.al:974-978,726-727`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-13**: `Value Posting` semantics at posting. **Code Mandatory**: the set must contain some value for the dimension. **Same Code** with a default value: the set must contain exactly that value, and a missing or different value is an error. **Same Code** with a blank default: the set must *not* contain the dimension. **No Code**: the set must not contain the dimension, and the default value itself must be blank. `Allowed Values Filter` can be used only with Code Mandatory. *Src:* `DIM/DefaultDimensionValuePostingType.Enum.al:12-37`; `DIM/DefaultDimension.Table.al:150-164,214-234,845-852`; `DIM/DimensionManagement.Codeunit.al:573-594`. *Keep:* MUST (SKIP the allowed-values filter).
- **R-DIMENSIONS-NOSERIES-AUDIT-14**: **Building the defaults for a line (`GetDefaultDimID`).** (1) Seed the buffer from an inherited set, such as the document header, tagged with that set's table (Customer or Vendor). (2) Visit the sources in list order. The source of the field that triggered the rebuild is moved to position 1. (3) Defaults with a blank value are skipped. (4) For a dimension that is already in the buffer, the new value replaces it only if the new source's table has a priority for this Source Code AND either the existing table has no priority or the new priority number is lower. Otherwise **the first value wins**. (5) Global 1/2 are filled from the result. *Src:* `DIM/DimensionManagement.Codeunit.al:926-1028,3522-3531`; `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:11484-11500`; `BA/Sales/Document/SalesLine.Table.al:6577-6602,10661-10669`. *Keep:* MUST (with a fixed precedence).
- **R-DIMENSIONS-NOSERIES-AUDIT-15**: Priorities are stored per Source Code, and 1 is the highest. The seeded defaults are Sales/Sales Journal: Customer = 1, Item = 2, and Purchases/Purchase Journal: Vendor = 1, Item = 2. *Src:* `DIM/DefaultDimensionPriority.Table.al:80-90,135-165`. *Keep:* SKIP. Hard-code "partner (header) beats item/account" to match.
- **R-DIMENSIONS-NOSERIES-AUDIT-16**: Rebuilding the defaults (for example after the account changes) **resets the whole set**. Values the user entered on a journal line are lost. *Src:* `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:5072-5090`. *Keep:* SHOULD (consider keeping dimensions the user typed).

### Posting validation
- **R-DIMENSIONS-NOSERIES-AUDIT-17**: Journal line check. Unless `OverrideDimErr` is set, the check runs (a) the combination check on the line's set, then (b) value-posting rules for Account, Bal. Account, Job, Salesperson and Campaign. *Src:* `BA/Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al:222-223,937-967`. *Keep:* MUST (account + bal. account + partner).
- **R-DIMENSIONS-NOSERIES-AUDIT-18**: `CheckDimValuePosting` first re-checks every pair in the set for blocked dimensions, blocked values and non-postable value types. A draft created earlier can therefore fail if a value has since been blocked. *Src:* `DIM/DimensionManagement.Codeunit.al:543-561,1748-1809,1841-1860`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-19**: **Rules accumulate.** All defaults with `Value Posting` ≠ blank are collected. The specific rule and the account-type rule for the *same* table are **both** enforced. Between *different* tables, only the higher-priority table's rule is kept. If no priorities exist, every rule is enforced. A contradiction (account-type Code Mandatory plus specific No Code) makes the account impossible to post to. Report 30 "Check Value Posting" exists to find such setups. *Src:* `DIM/DimensionManagement.Codeunit.al:712-753`; `DIM/CheckValuePosting.Report.al:23`. *Keep:* MUST (cumulative), plus a setup-time conflict check.
- **R-DIMENSIONS-NOSERIES-AUDIT-20**: **G/L accounts that posting derives are checked too.** When a G/L entry is created for an account that is not the line's own G/L account or bal. account (receivables, VAT, bank or inventory accounts from posting groups), that account's rules are checked against the line's set. The check is skipped when Amount and Amount (LCY) are both 0, unless the account is an FX gain/loss account. *Src:* `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:2256-2266,7402-7432`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-21**: Sales and purchase documents run in collect-errors mode. The header set is checked against Bill-to Customer, Salesperson, Campaign, Responsibility Center and Location. Each line set is checked against the line No., Job and Location, but only for lines with a quantity to invoice, ship or receive. *Src:* `DIM/CheckDimensions.Codeunit.al:210-319`. *Keep:* MUST (header: partner; line: item/account).
- **R-DIMENSIONS-NOSERIES-AUDIT-22**: Combinations. `Blocked` means the two dimensions may not appear in the same set. `Limited` means only the value pairs listed in T351 are forbidden. A pair is stored once with Dim1 < Dim2, and the check looks it up in both orders. The check exits early if T350 is empty. *Src:* `DIM/DimensionManagement.Codeunit.al:635-710`; `DIM/DimensionCombination.Table.al:45-79`; `DIM/DimensionCombinationsMatrix.Page.al:624-656`. *Keep:* SKIP v1.

### Denormalization and propagation into entries
- **R-DIMENSIONS-NOSERIES-AUDIT-23**: A G/L entry copies `Dimension Set ID` and the two shortcut codes from the posting line as `Global Dimension 1/2 Code`. Shortcut dimensions 3–8 on entries are FlowFields that look up the `Dimension Set Entry` where `Global Dimension No.` = n. The SIFT keys include Global Dim 1/2. *Src:* `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:182-187,562-586,800,809,1004-1006`; `DIM/DimensionSetEntry.Table.al:108-111,257-279`. *Keep:* MUST (the globals), SHOULD (the rest through the set). *Invariant:* the globals must always equal the set's values (`UpdateGlobalDimFromDimSetID`, `DIM/DimensionManagement.Codeunit.al:365-372`).
- **R-DIMENSIONS-NOSERIES-AUDIT-24**: The global dimensions are not editable in G/L Setup. Changing them runs "Change Global Dimensions", which rewrites the Global Dim 1/2 columns table by table across all tables that have dimensions. *Src:* `BA/Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al:639-664`; `DIM/ChangeGlobalDimensions.Codeunit.al:397,514-541`. *Keep:* SKIP (fix the globals at setup, or derive them at query time).
- **R-DIMENSIONS-NOSERIES-AUDIT-25**: On a document, the **receivable/payable entry uses the header set**. **Revenue/expense and VAT G/L entries use the line's set.** The invoice posting buffer groups lines by Dimension Set ID (plus account and posting groups). *Src:* `BA/Sales/Posting/SalesPostInvoice.Codeunit.al:382,399-400,534-537,607-610`; `BA/Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al:717-746`. *Keep:* MUST. *Consequence:* the trial balance does **not** balance per dimension value (Example 6.1).

### Number series
- **R-DIMENSIONS-NOSERIES-AUDIT-26**: Header flags. `Default Nos.` allows automatic numbers (`TestAutomatic`). `Manual Nos.` allows numbers typed by the user (`TestManual`). Clearing one of them when the other is false automatically sets the other, so at least one is always true. *Src:* `NS/Setup/NoSeries.Table.al:35-57`; `NS/Setup/NoSeriesSetupImpl.Codeunit.al:166-177`; `NS/Single/NoSeriesImpl.Codeunit.al:27-49,247-273`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-27**: **Choosing the line.** A blank usage date means WorkDate. Filter the lines to Starting Date ≤ usage date and take the **latest** Starting Date. Among the lines with that date, take the first **Open** line by Line No. If there is none: "cannot assign new numbers … on <date>" when the series has any lines, otherwise "cannot assign new numbers". A usage date before the line's Starting Date is an error. *Src:* `NS/Single/NoSeriesImpl.Codeunit.al:111-168,324-335`; `NS/Setup/NoSeriesSetupImpl.Codeunit.al:118-135`. *Keep:* MUST. *Why:* this gives per-year ranges such as SI26-, SI27- without code changes.
- **R-DIMENSIONS-NOSERIES-AUDIT-28**: **Date Order.** The usage date must be ≥ the line's `Last Date Used`. This keeps numbers increasing together with dates. *Src:* `NS/Single/NoSeriesImpl.Codeunit.al:170-177`. *Keep:* MUST (for invoices).
- **R-DIMENSIONS-NOSERIES-AUDIT-29**: **Normal GetNextNo.** Re-read the line with `UpdLock`. If `Last No. Used` is blank, the next number is `Starting No.`. Otherwise it is `IncStr(Last, Increment-by)`. Check the range, then set `Last Date Used` := usage date, recalculate `Open`, and modify the line. The number is written in the caller's transaction, so a rollback returns it. *Src:* `NS/Single/NoSeriesStatelessImpl.Codeunit.al:29-62`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-30**: **Range check.** The number must be non-blank and ≥ Starting No. and ≤ Ending No. as **strings**. The non-digit skeleton must equal the Starting No. skeleton. The length must be ≥ len(Starting No.) and ≤ len(Ending No.). From `Warning No.` onwards (and only when `Ending No.` is set), the user gets a message; it is not an error. *Src:* `NS/Single/NoSeriesStatelessImpl.Codeunit.al:88-127`. *Keep:* MUST (compare integers instead). *Why:* the length checks make up for string comparison, where '10' < '9'.
- **R-DIMENSIONS-NOSERIES-AUDIT-31**: **Open.** A line is open if `Ending No.` is blank or Last No. Used is blank. It is closed if Last ≥ Ending, if len(Last) > len(Ending), or, when Increment-by ≠ 1, if the next number would exceed Ending. Closed lines are skipped when choosing a line. *Src:* `NS/Setup/NoSeriesSetupImpl.Codeunit.al:137-164`; `NS/Setup/NoSeriesLine.Table.al:97-109`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-32**: **Format consistency.** Every edited number must contain a digit (`IncStr` ≠ ''). Editing Starting, Ending or Warning re-pads all four numbers to a common digit width with the new prefix and suffix. It is an error if this would change `Last No. Used`. *Src:* `NS/Setup/NoSeriesSetupImpl.Codeunit.al:197-307`; `NS/Setup/NoSeriesLine.Table.al:36-96`. *Keep:* MUST (model it as prefix + width + integer).
- **R-DIMENSIONS-NOSERIES-AUDIT-33**: **Sequence implementation.** Numbers come from a DB `NumberSequence` with no row lock. The line is written only when the date or Open changes. `MayProduceGaps` = true. The text is rebuilt from the Starting No. template. The numeric part can have at most 18 digits. Switching implementation moves "last used" across. *Src:* `NS/Single/NoSeriesImplementation.Enum.al:19-32`; `NS/Single/NoSeriesSequenceImpl.Codeunit.al:31-58,79-202,266-288`. *Keep:* SHOULD (only for non-legal numbers, such as master data and drafts).
- **R-DIMENSIONS-NOSERIES-AUDIT-34**: **Journals consume numbers only at posting.** A new line *peeks* (first line) or *simulates* (previous number + 1) and consumes nothing. At posting, each new Document No. that equals `PeekNextNo` is consumed with `GetNextNo`. A different number requires `Manual Nos.`, otherwise the error is "documents that must be posted before …". Batch state lives in memory and `SaveState` writes it just before the commit. *Src:* `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al:4295-4312`; `BA/Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al:386-397,319,853-871`; `NS/Batch/NoSeriesBatchImpl.Codeunit.al:87-107,147-168`; `NS/Single/NoSeriesImpl.Codeunit.al:34-37`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-35**: **Document numbering.** A draft takes `GetNextNo` on insert and loops while that No. already exists, so drafts can have gaps. Typing a No. by hand requires Manual Nos. and clears `No. Series`. At posting, `Posting No.` is taken from the posting series and **committed before the ledger posting**, so it is reserved on the document. The exception is a Date Order series, where the commit is suppressed. If a posted header with that number already exists, posting fails. Deleting a document that holds a reserved number writes an empty posted header with source code `Deleted Document`, so no gap is left. *Src:* `BA/Sales/Document/SalesHeader.Table.al:253-262,3966-3990,4352-4373`; `BA/Sales/Posting/SalesPost.Codeunit.al:767-782,2787-2830`; `BA/Sales/History/PostSalesDelete.Codeunit.al:262-285`. *Keep:* MUST (the gapless outcome; see the §7 alternative).
- **R-DIMENSIONS-NOSERIES-AUDIT-36**: Relationships allow other series in place of a default series. `AreRelated` requires `Default Nos.` on the default series. *Src:* `NS/Single/NoSeriesImpl.Codeunit.al:215-245`; `NS/Setup/NoSeriesRelationship.Table.al:22-69`. *Keep:* SKIP.

### Source and reason codes
- **R-DIMENSIONS-NOSERIES-AUDIT-37**: Source Code flows. The journal template's Type picks its code from Source Code Setup (General → `General Journal`, …). A new journal line copies it from the template. Document posting uses `SourceCodeSetup.Sales` or `Purchases`. The code is copied to G/L entries, the G/L register and detailed ledger entries. *Src:* `BA/Finance/GeneralLedger/Journal/GenJournalTemplate.Table.al:105-150`; `…/GenJournalLine.Table.al:4327`; `BA/Sales/Posting/SalesPost.Codeunit.al:803`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:1007`; `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:1938,3690-3735`. *Keep:* MUST.
- **R-DIMENSIONS-NOSERIES-AUDIT-38**: **Source codes drive logic.** Reversal posts with `Reversal`. Year-end closing posts with `Close Income Statement`. Dimension priorities are keyed by source code. Deferral posting treats General, Sales and Purchase *journal* codes differently from document postings. An entry without a journal batch can be reversed only if its code is Payment Reconciliation or Bank Rec. transfer. *Src:* `BA/Finance/GeneralLedger/Reversal/GenJnlPostReverse.Codeunit.al:133`; `BA/Finance/GeneralLedger/Setup/CloseIncomeStatement.Report.al:141`; `DIM/DefaultDimensionPriority.Table.al:90`; `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:2556-2567,8035-8047,8361-8363`; `BA/Finance/GeneralLedger/Reversal/ReversalEntry.Table.al:618-639`. *Keep:* MUST, as a closed enum.
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
1. If `Posting No.` is blank, take GetNextNo(Posting No. Series, Posting Date).
2. Modify the header and **commit**. Skip the commit for a Date Order series.
3. Post. If posting fails, the number stays on the unposted document and is reused on the next attempt.
4. Deleting that document writes a placeholder posted header.

---

## 5. Calculations & rounding

- **Dimensions carry no amounts.** BC never splits or rounds an amount by dimension. A line has exactly one set. Splitting an amount across departments needs separate lines or allocation accounts, which belong to another subsystem.
- **Set key:** `path = sort_asc([valueId for (dim, value) in set])`. Set ID = the node reached by that path. Two sets are equal ⇔ their sorted valueId lists are equal. Because valueId is unique across all dimensions, sorting gives a total order.
- **Priority comparator** (`DIM/DimensionManagement.Codeunit.al:750-753`): `greater(p1, p2) = p1 > 0 AND (p2 = 0 OR p1 < p2)`. A missing priority is 0 and means "lowest". In `GetDefaultDimID` the comparison is `<` on the stored priorities, so equal priorities keep the first value.
- **Grouping effect:** document posting adds amounts per (account, posting groups, **Dimension Set ID**, …). More distinct sets means more G/L lines, but the totals do not change. No rounding happens in the buffer.
- **IncStr** (Microsoft Learn, *Text.IncStr*): it changes only the **last** digit group. Zero padding is kept (`SI26-00041` → `SI26-00042`). On overflow the string gets longer (`a12b99c` → `a12b100c`). A string with no digits returns ''. A `-` directly before the digits is read as a minus sign. The overload with an increment adds `Increment-by`.
- **Sequence formatting** (`NS/Single/NoSeriesSequenceImpl.Codeunit.al:145-172`): take the Starting No. as a template, find its last digit run, and replace the right-aligned digits with the number, zero-padded to the run width (`SI26-00001` + 42 → `SI26-00042`). If the number is wider than the run, use prefix + number.
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

### 6.2 General journal GJ26-0008: rent paid from bank, set 6, Source Code GENJNL
One line: Account G/L 7020, Bal. Account BANK-KHAN (posting group → G/L 1110), 2,200,000 including VAT. The number was peeked while the line was entered and consumed at posting.

| # | G/L account | Debit | Credit | Amount | Set ID | Global Dim 1 |
|---|---|---:|---:|---:|---:|---|
| 1 | 7020 Rent expense | 2,000,000 | | +2,000,000 | 6 | ADMIN |
| 2 | 1530 VAT receivable | 200,000 | | +200,000 | 6 | ADMIN |
| 3 | 1110 Bank | | 2,200,000 | −2,200,000 | 6 | ADMIN |
| | **Total** | **2,200,000** | **2,200,000** | **0** | | |

The bank side uses the same set as the line, because it comes from one journal line. Without DEPT the line fails the check (7020 Code Mandatory). Accounts 1530 and 1110 are derived and checked in `InitGLEntry`.

### 6.3 Reversal of 6.2, Source Code REVERSAL
| # | G/L account | Debit | Credit | Amount | Set ID |
|---|---|---:|---:|---:|---:|
| 1 | 7020 Rent expense | | 2,000,000 | −2,000,000 | 6 |
| 2 | 1530 VAT receivable | | 200,000 | −200,000 | 6 |
| 3 | 1110 Bank | 2,200,000 | | +2,200,000 | 6 |
| | **Total** | **2,200,000** | **2,200,000** | **0** | |

The reversal keeps the original document number, posting date and set, and uses source code REVERSAL (`GenJnlPostReverse.Codeunit.al:133`).

### 6.4 Sales credit memo SCM26-00003: return of goods, Reason Code RETURN
| # | G/L account | Debit | Credit | Amount | Set ID | Reason |
|---|---|---:|---:|---:|---:|---|
| 1 | 5100 Revenue, goods | 100,000 | | +100,000 | 3 | RETURN |
| 2 | 3410 VAT payable | 10,000 | | +10,000 | 3 | RETURN |
| 3 | 1210 Receivables | | 110,000 | −110,000 | 1 | RETURN |
| | **Total** | **110,000** | **110,000** | **0** | | |

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
- Default dimensions: `default_dimension(entity_type, entity_id NULL = all, dimension_id, value_id NULL, value_posting ENUM(none, mandatory, same, forbidden))`. Fixed precedence when building a line set: explicit user input > line item/account > header partner > table-level defaults. This replaces the priority table, matches BC's seeded Sales and Purchase priorities, and is deterministic.
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
6. Rules on control accounts (receivables, VAT, bank) apply through derived postings, so one "Code Mandatory" on VAT payable breaks every invoice whose header or line sets lack that dimension.
7. Blocked values are re-checked at posting. Drafts created earlier can fail.
8. Begin-Total values are postable in BC. Decide explicitly; recommendation: Standard only.
9. Rebuilding the defaults on an account change throws away manual dimensions (BC behavior). Header→line propagation must be a delta, so line overrides survive.
10. Per-dimension trial balances do not balance (header set vs line sets). Reports must show a "blank" bucket and must not promise a balanced balance sheet per department.
11. The global dimension columns must stay equal to the set. Any rewrite (a global remap, a dimension correction) must update both.
12. Number comparison: never compare formatted numbers as strings. `SI26-100000` < `SI26-99999` as text.
13. Date Order is enforced on the *line's* Last Date Used. Backdated postings fail. Opening-balance imports must run in date order, or use a series without Date Order.
14. A Peek is not a reservation. Two users can see the same peeked number. Only the posting transaction's consumption counts.
15. A Starting No. without digits cannot be incremented. Width overflow (99999 → 100000) must either be an error or be explicitly allowed. Code[20] is the maximum length.
16. If there is no line for the date (for example 2025 postings into a 2026-only series), the error must be clear. Opening-balance setup needs earlier lines.
17. Source codes that drive logic (REVERSAL, CLOSE_YEAR) must not be editable by users.

---

## 9. Open questions

1. Does Mongolian law (accounting law, or primary document rules for invoices and cash vouchers) require **gapless** internal numbering, given that eBarimt issues its own receipt ID (ДДТД)? This decides which series are `gapless`.
2. Which 2 global dimensions fit typical 1–10 person firms: Branch/Store and Project? Do we need more than 4 dimensions at all?
3. Must per-branch financial statements balance? If yes, we need balancing entries per dimension value, which goes beyond BC behavior.
4. Should the defaults rebuild keep dimensions the user typed (a UX improvement on BC, R-16)?
5. Should Reason Code be mandatory for every manual journal and credit memo, as an audit-trail requirement?
6. Should numbering restart each year (SI26-/SI27- lines), or run continuously? Is this driven by the tax office or by preference?
7. `IncStr` with Increment-by > 1 on patterns like `SI26-00041` (a hyphen before the digits): AL docs say `-` is read as a sign. Not verified in this codebase. Moot if we use prefix + integer.
8. Allowing a dimension value code rename after use: allowed in BC (it cascades). Is it acceptable for exports that were already filed (VAT/eBarimt reports by branch)?
