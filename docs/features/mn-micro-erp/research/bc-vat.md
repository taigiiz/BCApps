# BC research: VAT engine (setup, calculation, rounding, VAT entries, statement, settlement)

- Source: BCApps (BC v29, W1 Base App, MIT). Read from the AL code, not from documentation.
- Keep levels: **MUST** = needed in micro-ERP v1, **SHOULD** = keep in a simpler form or add soon after v1, **SKIP** = leave out.
- Account numbers in the examples are made up for illustration. They are not the Mongolian standard chart of accounts. Local currency = MNT, VAT rate = 10%, Amount Rounding Precision = 1 MNT (whole units), VAT Rounding Type = Nearest, unless a row says otherwise.
- Path aliases. All are relative to `src/Layers/W1/BaseApp/`:

| Alias | File |
|---|---|
| VPS | `Finance/VAT/Setup/VATPostingSetup.Table.al` |
| VE | `Finance/VAT/Ledger/VATEntry.Table.al` |
| VEE | `Finance/VAT/Ledger/VATEntryEdit.Codeunit.al` |
| LNK | `Finance/VAT/Ledger/GLEntryVATEntryLink.Table.al` |
| VAL | `Finance/VAT/Calculation/VATAmountLine.Table.al` |
| VRDM | `Finance/VAT/Calculation/VATReportingDateMgt.Codeunit.al` |
| VSL | `Finance/VAT/Reporting/VATStatementLine.Table.al` |
| VSR | `Finance/VAT/Reporting/VATStatement.Report.al` |
| SETL | `Finance/VAT/Reporting/CalcandPostVATSettlement.Report.al` |
| GJPL | `Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al` |
| GJL | `Finance/GeneralLedger/Journal/GenJournalLine.Table.al` |
| GJCL | `Finance/GeneralLedger/Journal/GenJnlCheckLine.Codeunit.al` |
| GLS | `Finance/GeneralLedger/Setup/GeneralLedgerSetup.Table.al` |
| CUR | `Finance/Currency/Currency.Table.al` |
| IPB | `Finance/ReceivablesPayables/InvoicePostingBuffer.Table.al` |
| SL / SH | `Sales/Document/SalesLine.Table.al` / `Sales/Document/SalesHeader.Table.al` |
| SP / SPI | `Sales/Posting/SalesPost.Codeunit.al` / `Sales/Posting/SalesPostInvoice.Codeunit.al` |
| PL / PPI | `Purchases/Document/PurchaseLine.Table.al` / `Purchases/Posting/PurchPostInvoice.Codeunit.al` |
| REV | `Finance/GeneralLedger/Reversal/ReversalEntry.Table.al` |

---

## 1. Summary

- **Setup is a matrix.** One `VAT Posting Setup` row exists for each pair of *VAT Bus. Posting Group* (who the customer or vendor is: domestic, foreign, exempt party) and *VAT Prod. Posting Group* (what is sold: standard, zero-rated, exempt). The row holds the calculation type, the rate, the VAT Identifier and the G/L accounts. Every taxable line must resolve to exactly one row.
- **There are five calculation types** (`Tax Calculation Type` enum 254). *Normal VAT* charges the rate on the base. *Reverse Charge* has the buyer self-assess the VAT, which nets to zero on the G/L. *Full VAT* treats the whole line as VAT, for example import VAT paid at customs. *Sales Tax* is the US jurisdiction engine. *No Taxable VAT* exists only in some localizations.
- **Document VAT is computed per group, then allocated.** Lines are aggregated into `VAT Amount Line` groups keyed by VAT Identifier, calculation type, tax group, use tax and sign. The VAT is rounded once per group and then spread back to the lines with a running remainder. This guarantees that document VAT = round(group base × rate), not the sum of rounded line VATs.
- **Prices Including VAT** switches the line amounts to gross. In that case VAT = round(gross × r/(100+r)) and base = gross − VAT.
- **Rounding** uses the G/L Setup `Amount Rounding Precision` (default 0.01). VAT amounts use the `VAT Rounding Type` (Nearest/Up/Down, measured by magnitude). Bases are always rounded to nearest. Optional invoice rounding adds a system line to the invoice rounding account.
- **Posting.** Each posting-buffer line (one per G/L account plus groups plus dimensions) becomes one revenue or expense G/L entry (net), one `VAT Entry` (Base, Amount) and one VAT G/L entry on the Sales VAT or Purchase VAT account. The VAT entry is linked to the base G/L entry through table 253.
- **Signs.** VAT entries follow G/L signs. Sales invoices give a negative Base and Amount (credit). Purchase invoices give positive values. Credit memos give the opposite sign.
- **VAT Statement** is a configurable return form. Its rows are Account Totaling (G/L net change), VAT Entry Totaling (Σ VAT entries by type, both groups and VAT date), Row Totaling (Σ of other rows) and Description. Sign handling is done per row.
- **Settlement.** For each setup row and each type, the settlement reverses the period's open VAT on the Sales/Purchase VAT accounts, writes `Settlement` VAT entries, posts the net to a settlement (VAT payable) account and marks the source entries `Closed`. Closed entries can't be reversed.
- **Unrealized (cash-basis) VAT** parks VAT in "unrealized" accounts and entry fields until the payment is applied. This can be skipped for v1.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| VAT Business Posting Group | Table 323 | Party VAT class | `Code` Code[20] PK, `Description` Text[100] | MUST (small fixed list) |
| VAT Product Posting Group | Table 324 | Item/service VAT class | `Code` Code[20] PK, `Description` Text[100] | MUST |
| VAT Posting Setup | Table 325 | Rate, type and accounts per (Bus × Prod) | PK (`VAT Bus. Posting Group`, `VAT Prod. Posting Group`) Code[20]; `VAT Calculation Type` Enum 254; `VAT %` Decimal(0:5, 0..100); `VAT Identifier` Code[20]; `Sales VAT Account`, `Purchase VAT Account`, `Reverse Chrg. VAT Acc.` Code[20]; `Unrealized VAT Type` Option; `Sales/Purch. VAT Unreal. Account`; `VAT Clause Code` Code[20]; `Tax Category` Code[10]; `Blocked` Bool; `Sale/Purch. VAT Reporting Code` Code[20]; `Non-Deductible VAT %`, `Non-Ded. Purchase VAT Account`, `Allow Non-Deductible VAT` | MUST (core), SKIP unrealized, non-deductible and EU fields |
| General Ledger Setup (VAT subset) | Table 98 | Global rounding and VAT-date policy | `Amount Rounding Precision` Decimal (InitValue 0.01); `VAT Rounding Type` Option{Nearest,Up,Down}; `Max. VAT Difference Allowed` Decimal; `Inv. Rounding Precision (LCY)` Decimal; `Inv. Rounding Type (LCY)` Option; `VAT Reporting Date` Enum{Posting Date, Document Date}; `VAT Reporting Date Usage` Enum{Enabled, Enabled (Prevent modification), Disabled}; `Unrealized VAT` Bool; `Control VAT Period` Enum | MUST (precision, rounding type, VAT date), SHOULD (max difference) |
| VAT Setup | Table 189 | VAT-date window and non-deductible switches | `Allow VAT Date From/To` Date; `Enable Non-Deductible VAT` Bool | SHOULD (as a period lock) |
| Sales & Receivables / Purchases & Payables Setup, Gen. Journal Template/Batch | Tables 311 (field 29) / 312 (field 25) / 80 (field 24) / 232 (field 10) | Allow a manual VAT override | `Allow VAT Difference` Bool; `Invoice Rounding` Bool | SHOULD |
| Sales/Purchase Header and Line (VAT fields) | Tables 36/37, 38/39 | Document VAT state | Header: `Prices Including VAT` Bool, `VAT Bus. Posting Group`, `VAT Base Discount %`, `VAT Reporting Date`. Line: `VAT %`, `VAT Calculation Type`, `VAT Bus./Prod. Posting Group`, `VAT Identifier`, `Line Amount`, `Inv. Discount Amount`, `Amount`, `Amount Including VAT`, `VAT Base Amount`, `VAT Difference` (Decimal) | MUST (SKIP VAT Base Discount %) |
| VAT Amount Line | Table 290 (temporary) | Per-document VAT aggregation | PK (`VAT Identifier`, `VAT Calculation Type`, `Tax Group Code`, `Use Tax`, `Positive`); `VAT %`, `VAT Base`, `VAT Amount`, `Amount Including VAT`, `Line Amount`, `Inv. Disc. Base Amount`, `Invoice Discount Amount`, `Calculated VAT Amount`, `VAT Difference` Decimal; `Modified`, `Includes Prepayment` Bool | MUST (in-memory struct) |
| Invoice Posting Buffer | Table 55 (temporary) | Groups document lines into G/L and VAT postings | `Group ID` Text[1000] = Type+G/L acc+Gen/VAT groups+tax+Dimension Set+job+FA+deferral; `Amount`, `VAT Amount`, `VAT Base Amount`, `VAT Difference`, `VAT %`, `VAT Calculation Type` | MUST (grouping step) |
| VAT Posting Parameters | Table 187 (temporary) | Hands VAT split amounts to G/L creation | `Full VAT Amount`, `Deductible VAT Amount`, `Non-Deductible VAT Amount`, `Unrealized VAT` | SKIP |
| VAT Entry | Table 254 | VAT ledger (subledger for returns) | `Entry No.` Int PK; `Type` Enum 57 {' ',Purchase,Sale,Settlement}; `Base`, `Amount` Decimal; `VAT Calculation Type`; `Posting Date`, `VAT Reporting Date`, `Document Date` Date; `Document Type`, `Document No.` Code[20], `External Document No.` Code[35]; `Bill-to/Pay-to No.` Code[20]; `Country/Region Code` Code[10]; `VAT Registration No.` Text[20]; `VAT Bus./Prod. Posting Group`, `Gen. Bus./Prod. Posting Group` Code[20]; `Closed` Bool; `Closed by Entry No.` Int; `Transaction No.`, `G/L Register No.` Int; `Source Code` Code[10]; `User ID` Code[50]; `VAT Difference`, `Base Before Pmt. Disc.` Decimal; `Reversed` Bool, `Reversed (by) Entry No.` Int; `G/L Acc. No.` Code[20]; unrealized, ACY, sales-tax and non-deductible fields | MUST (core), SKIP the rest |
| G/L Entry – VAT Entry Link | Table 253 | Many-to-many link between G/L entries and VAT entries | PK (`G/L Entry No.`, `VAT Entry No.`) Int; key2 `VAT Entry No.` | MUST (as FK `vat_entry.gl_entry_id`) |
| G/L Entry (VAT fields) | Table 17 | Snapshot on the base entry | `VAT Amount` Decimal; `Gen. Posting Type`; `VAT Bus./Prod. Posting Group`; `VAT Reporting Date` | MUST |
| VAT Statement Template / Name | Tables 255 / 257 | Container for return layouts | `Name` Code[10], `Description` | SHOULD (a single template) |
| VAT Statement Line | Table 256 | One row of the return | PK (`Statement Template Name`, `Statement Name` Code[10], `Line No.` Int); `Row No.` Code[10]; `Description` Text[100]; `Type` Enum 256 {Account Totaling, VAT Entry Totaling, Row Totaling, Description}; `Account Totaling` Text[30]; `Gen. Posting Type`; `VAT Bus./Prod. Posting Group`; `Row Totaling` Text[50]; `Amount Type` Enum 258 {' ',Amount,Base,Unrealized Amount,Unrealized Base,Non-Deductible Amount/Base,Full Amount/Base}; `Calculate with`/`Print with` Option{Sign,Opposite Sign}; `Print` Bool (InitValue true); `Box No.` Text[30] | MUST |
| VAT Return Period | Table 737 | Period status that blocks posting | start/end Date, `Status` {Open, Closed}, `VAT Return Status` | SHOULD (as `vat_period.locked`) |
| VAT Clause | Table 560 | Exemption text printed on documents | `Code`, `Description` | SHOULD |
| Engines | Report 12 VAT Statement; Report 20 Calc. and Post VAT Settlement; Codeunit 12 Gen. Jnl.-Post Line (VAT part); Codeunit 799 VAT Reporting Date Mgt; Codeunit 338 VAT Entry - Edit | Behaviour | — | MUST (logic, not structure) |
| Non-Deductible VAT, VAT Rate Change | Codeunit 6200; Tables 550-552 | Partial deduction; bulk rate switch | — | SKIP (replace with effective-dated rates) |

---

## 3. Business rules

### Setup
- **R-VAT-01**: Each taxable posting needs exactly one `VAT Posting Setup` row for (Bus, Prod). Posting fails if the row is missing (`Get`) or `Blocked`. *Src:* VPS:350-353, GJPL:518-519. *Keep:* MUST.
- **R-VAT-02**: At posting, the line's `VAT Calculation Type` must equal the setup's value. This catches setups that changed after the document was created. *Src:* GJPL:523. *Keep:* MUST (snapshot the setup on the line and re-check it at posting).
- **R-VAT-03**: `VAT Calculation Type` can't be changed once VAT entries exist for the pair. Delete and rename are refused once G/L entries exist. **`VAT %` changes are not checked.** *Src:* VPS:61-64, 395-404, 363-371, 420-434, 78-82. *Keep:* MUST. Use effective-dated rates instead of an editable rate.
- **R-VAT-04**: Within one VAT Bus group, setups that share a `VAT Identifier` must have the same `VAT %`. On insert or validation, the rate is copied from a sibling with the same identifier. *Why:* VAT is aggregated per identifier on documents (R-VAT-08), so mixing rates in one group would corrupt the calculation. *Src:* VPS:223-233, 373-377, 450-477. *Keep:* SHOULD (identifier = tax code).
- **R-VAT-05**: VAT account fields must point to valid posting G/L accounts. A blank account is reported as a setup error only when that account is needed (sales, purchase or reverse-charge, realized or unrealized). *Src:* VPS:410-418, 485-551. *Keep:* MUST.
- **R-VAT-06**: The default VAT date is the Posting Date or the Document Date (GLS `VAT Reporting Date`), unless the line carries an explicit VAT date. *Src:* GLS:138, 1620-1630; VE:926-932, 1065-1071. *Keep:* MUST (default = posting date).

### Calculation types
- **R-VAT-07 Normal VAT**: VAT is the rate applied to the base. It is posted to `Sales VAT Account` on sales and to `Purchase VAT Account` on purchases. *Src:* GJPL:529-558, 966-970, 983-996, 1007-1022. *Keep:* MUST.
- **R-VAT-07a Reverse Charge**: On document lines the VAT % is cleared to 0, so the vendor is paid net. At posting, VAT = base × r/100 is computed on top of the base. It is posted Dr Purchase VAT and Cr `Reverse Chrg. VAT Acc.`, which nets to zero on the G/L. On a sale, VAT = 0 and no VAT G/L entry is made, but a VAT entry with the base is still written. *Src:* SL:1822-1825; PL:1574-1576; PPI:253-258, 905-920; GJPL:559-586, 997-998, 1051-1066. *Keep:* SHOULD (imported services).
- **R-VAT-07b Full VAT**: The whole line amount is VAT and the base is 0. The line's account must be the setup's VAT account. *Src:* GJPL:587-606; SL:1826-1830; GJL:2133-2139. *Keep:* SHOULD (customs import VAT).
- **R-VAT-07c Sales Tax / No Taxable VAT**: these are separate engines. *Src:* `Foundation/Enums/TaxCalculationType.Enum.al:7-32`; VPS:441-448. *Keep:* SKIP.

### Document calculation
- **R-VAT-08**: Document VAT is calculated per `VAT Amount Line` group, keyed by (VAT Identifier, Calc Type, Tax Group, Use Tax, **Positive**). The group VAT is rounded once and then allocated to the lines with a carried remainder. *Why:* the sum of the line VATs always equals the rounded group VAT, and the printed VAT specification equals the posted VAT. *Src:* SL:7484-7614, 7616-7642; VAL:323, 840-986; SP:3349-3466; SL:7285-7447. *Keep:* MUST.
- **R-VAT-09**: While a line is edited, its VAT is computed from running totals of all other lines with the same VAT Identifier: `line VAT = round(Σgroup) − Σothers`. This keeps the same invariant interactively. *Src:* SL:5935-5941, 6004-6018, 6048-6056. *Keep:* MUST (implemented as "recompute the whole document").
- **R-VAT-10 Prices Including VAT**: `VAT = R_vat(G × r/(100+r))` and `Base = G − VAT`, where G = line amount − invoice discount. Toggling the header flag rescales unit prices by (1+r/100) and requires that no quantity has been invoiced yet. *Src:* VAL:863-897; SL:5998-6020; SH:999-1078. *Keep:* MUST.
- **R-VAT-11 Prices excl. VAT**: `Base = line amount − invoice discount` and `VAT = R_vat(Base × r/100)`. *Src:* VAL:924-952; SL:6043-6058. *Keep:* MUST.
- **R-VAT-12 Rounding**: Amounts are rounded to `Amount Rounding Precision` (LCY falls back to 0.01 when it is 0). VAT amounts use the direction from `VAT Rounding Type`: '=' Nearest, '>' Up, '<' Down. Bases and allocations use nearest. *Src:* GLS:589-607, 799-805; CUR:886-903, 949-959. *Keep:* MUST.
- **R-VAT-13**: Negative lines (Positive = false) form their own VAT Amount Line. Their unrounded VAT residual is carried into the next (positive) group with the same identifier. *Src:* VAL:854-859, 886-896, 940-951; SL:7623, 7637. *Keep:* SHOULD.
- **R-VAT-14 VAT Difference**: A user may override a group's VAT only when `Allow VAT Difference` is on (sales/purchase setup or journal batch) and |VAT − calculated| ≤ `Max. VAT Difference Allowed` (stored as an absolute value). The difference is kept on the lines and the VAT entry. *Src:* VAL:58-74, 359-380; GJL:1136-1175; GLS:779-795; VE:535; SL:870-872. *Keep:* SHOULD (needed to match a supplier's receipt).
- **R-VAT-15 Invoice rounding**: When `Invoice Rounding` is on, the total including VAT is rounded to `Inv. Rounding Precision` with `Inv. Rounding Type`. The difference becomes a system-created G/L line on the customer posting group's `Invoice Rounding Account`. With prices excl. VAT, that line's unit price is diff/(1+VAT%). *Src:* SP:1216-1226, 3587-3643; GLS:386-409. *Keep:* SKIP for v1 (whole MNT); if kept, the rounding account must be no-VAT.

### Journals
- **R-VAT-16**: Journal amounts are **gross**: VAT = R_vat(A × r/(100+r)) and Base = A − VAT. Posting re-derives the same values from `Amount (LCY)` ("Automatic VAT Entry"). *Src:* GJL:366-416; GJPL:543-548. *Keep:* MUST.
- **R-VAT-17**: On G/L lines, `VAT Amount + VAT Base Amount` must equal `Amount`. A G/L line that carries VAT or Gen groups must have Gen. Posting Type Sale or Purchase. Customer, vendor and bank lines must carry no VAT groups. *Src:* GJCL:578-589, 594-605, 617-624. *Keep:* MUST.

### Posting and ledger
- **R-VAT-18**: Documents post through the Invoice Posting Buffer with `VAT Posting = Manual VAT Entry`. The G/L entry Amount is the net amount and `G/L Entry."VAT Amount"` is the VAT. VAT entry Base and Amount are taken from the buffer. *Src:* IPB:717-746, 832-866; GJPL:636-644, 834-879. *Keep:* MUST.
- **R-VAT-19 Signs**: Sales invoice lines are negated before buffering, so the VAT entry Base and Amount are < 0 and the customer entry is +gross. Purchases are the opposite. Credit memos flip the sign again. *Src:* SP:1047-1051, 3569-3585; SPI:645-647. *Keep:* MUST.
- **R-VAT-20**: One VAT entry is written per VAT-bearing posting line. It is linked to the **base** G/L entry (the revenue or expense line, not the VAT line). The links are buffered and written in `FinishPosting`. *Src:* GJPL:1231-1241, 911-913, 2087, 6759-6769; LNK:17-84. *Keep:* MUST.
- **R-VAT-21**: The VAT entry copies its posting context: dates, document, party, country, VAT registration no., Transaction No. and G/L Register No. (TestField). *Src:* VE:1041-1092; GJPL:793-799, 908-909. *Keep:* MUST.
- **R-VAT-22**: VAT entries can't be edited except for the VAT date and party identification fields. Amount and Base are asserted unchanged, and Settlement entries can't be edited at all. Changing the VAT date requires `VAT Reporting Date Usage = Enabled` and an open entry, and it is propagated to the G/L entries and VAT entries of the same transaction and to the posted document. *Src:* VEE:12-31; VE:117-128, 742-766; VRDM:70-85, 308-332. *Keep:* SHOULD.
- **R-VAT-23**: The VAT date must fall inside the allowed VAT-date window and must not land in a closed (or released) VAT return period, according to `Control VAT Period`. *Src:* GJCL:560-561, 1160-1174; VRDM:219-270; GLS:1267. *Keep:* MUST (hard lock after filing).
- **R-VAT-24**: Reversing a transaction whose VAT entry is `Closed` (already settled) is refused. *Src:* REV:796-811. *Keep:* MUST.
- **R-VAT-25 Unrealized VAT** (summary): When the setup has an `Unrealized VAT Type` and the document is not a payment, the VAT entry is written with Amount = Base = 0 and the value goes into `Unrealized/Remaining Unrealized Amount/Base`, using the "Unreal." G/L accounts. Applying a payment creates a realized VAT entry for the paid share (Percentage/First/Last/Fully Paid), moves the G/L from the unrealized to the realized account and reduces the remaining amounts. *Src:* GJPL:830-879, 930-948, 4317-4436, 5816-5855, 7676-7682; VE:961-1017. *Keep:* SKIP.

### Statement
- **R-VAT-26**: The VAT Statement row types work as follows. **Account Totaling** sums the G/L `Net Change` of the accounts in the filter over the VAT-date range. **VAT Entry Totaling** sums VAT entries with `Type` = row Gen. Posting Type, Bus/Prod group = the row's values *exactly* (a blank value filters to blank), VAT date in range and the Open/Closed selection; `Amount Type` picks Amount, Base, Unrealized or Full. **Row Totaling** sums the rows whose `Row No.` matches its filter, nesting at most 6 levels. **Description** has no amount. *Src:* VSR:346-486, 488-512; VSL:65-160. *Keep:* MUST.
- **R-VAT-27**: `Calculate with = Opposite Sign` negates a row before it is added to totals, and it is not allowed on Row Totaling. `Print with` only flips the printed value. "Round to whole numbers" truncates each printed component toward zero (`'<'`) before summing. *Src:* VSL:149-160, 174-180; VSR:131-141, 514-526, 591-600. *Keep:* MUST (sign rules), SKIP (integer printing).
- **R-VAT-28**: The period options are "Within Period" (start..end) or "Before and Within Period" (0D..end), and the entry selection is Open, Closed or both. *Src:* VSR:259-272, 387-394, 500-512. *Keep:* SHOULD.

### Settlement
- **R-VAT-29**: The settlement runs per setup row (sorted Bus, Prod) and per type (Purchase, then Sale) over **open** entries with VAT date in [start, end]. For each group it posts a `Gen. Posting Type = Settlement` line on the Purchase or Sales VAT account with `Amount = −ΣAmount`, `VAT Base = −ΣBase`. That line creates a `Settlement` VAT entry with `Closed = true`. The source entries get `Closed = true` and `Closed by Entry No.` = that settlement entry. *Src:* SETL:437-506, 300-353, 429-434, 889-905, 947-958, 968-982; GJPL:845-850. *Keep:* MUST.
- **R-VAT-30**: ΣAmount over all groups (sales negative, purchases positive) is posted once to the settlement account as `Amount = ΣAmount` (negative means payable). The settlement account must have a blank Gen. Posting Type, no Gen/VAT groups and 0% VAT. *Src:* SETL:351-352, 515-549, 523-529. *Keep:* MUST.
- **R-VAT-31**: For reverse charge, the settlement credits the Purchase VAT account and debits the Reverse Charge account by the same amount, so it doesn't add to the payable. *Src:* SETL:354-373. *Keep:* SHOULD.
- **R-VAT-32**: The settlement requires a posting date, a document no., a settlement account and (when VAT date is enabled) a VAT date. It can run as a test without posting. It locks the G/L and VAT tables. *Src:* SETL:551-557, 710-740. *Keep:* MUST.

---

## 4. Flows

**F1. Line entry (sales; purchase is symmetric)**
1. Line `VAT Prod. Posting Group` validates → get setup (SL:1813) → copy `VAT %`, `VAT Calculation Type`, `VAT Identifier`, `VAT Clause Code` (SL:11172-11182).
2. Reverse Charge or Sales Tax → `VAT % := 0`. Full VAT → line must be a G/L line on the Sales VAT account (SL:1822-1831).
3. If prices include VAT and the rate changed → unit price × (100+new)/(100+old) (SL:1836-1840).
4. `UpdateAmounts`: `Line Amount = RN(Qty × Unit Price) − Line Discount`. A change resets `VAT Difference` (SL:5876-5887). Then `UpdateVATAmounts` uses the running totals of the same VAT identifier (SL:5919-6084).

**F2. Statistics / release (document-level VAT)**
1. `CalcVATAmountLines`: loop over lines with Type≠' ', Qty≠0, Unit Price≠0. Find or insert the group (identifier, calc type, tax group, sign) and sum Line Amount, Inv. Disc. Base, Inv. Disc., VAT Difference (SL:7484-7589, 7644-7686).
2. `VATAmountLine.UpdateLines`: compute the group base and VAT (formulas §5) (VAL:840-986).
3. Optionally, the user edits the group VAT → `VAT Difference` is checked against the maximum (VAL:58-74, 359-380).
4. `UpdateVATOnLines`: push the group values back to the lines with a remainder (SL:7285-7447).

**F3. Post sales invoice**
1. Recompute the VAT Amount Lines for *Qty. to Invoice* (SP:479-481).
2. Per line: `DivideAmount` allocates the group VAT with a remainder (SP:3349-3466) → `RoundAmount` → `ReverseAmount` for invoices (SP:1047-1051).
3. `PrepareLine`: buffer grouped by `Group ID` with Amount (net), VAT Amount, VAT Base, VAT Difference (SPI:127-284; IPB:679-746).
4. After the last line, the invoice-rounding line if enabled (SP:1216-1226).
5. `PostLines`: each buffer row → Gen. Journal Line (`Gen. Posting Type = Sale`, Manual VAT Entry) (SPI:450-523; IPB:832-866) → `GenJnlPostLine.PostGLAcc`:
   a. `InitGLEntry` (net amount), direct-posting check;
   b. `InitVAT`: get the setup, check Blocked and calc type, `GLEntry."VAT Amount" := VAT Amount (LCY)` (GJPL:505-658);
   c. insert the base G/L entry; `PostVAT` → `InsertVAT`: VAT entry (Base, Amount, Type = Sale), link to the base G/L entry; `InsertVATForGLEntry` → G/L entry on the Sales VAT account (GJPL:667-1005, 1195-1248).
6. `PostLedgerEntry`: customer entry for −(−Amount Incl. VAT) = +gross (SPI:593-655).
7. `FinishPosting`: register `To VAT Entry No.`, write the G/L–VAT links (GJPL:2084-2087).

**F4. G/L journal with VAT (automatic)**
1. Line Gen. Posting Type + VAT groups → `VAT %` from setup (GJL:2122-2140) → VAT and base from the gross amount (GJL:382-385).
2. Check line: VAT + Base = Amount, VAT date allowed (GJCL:560, 594-605).
3. `InitVAT` recomputes from `Amount (LCY)`. G/L Amount = gross − VAT → VAT entry → VAT G/L entry (GJPL:529-558, 688-702).

**F5. VAT Statement**
1. The request sets the period, the selection (Open/Closed/both) and the period selection (VSR:173-215).
2. For each statement line: `CalcLineTotal` → by type (VSR:361-483) → `CalcTotalAmount` applies Calculate-with, integer rounding and the add (VSR:514-526).
3. Printed value = total × (Print with sign) (VSR:131-141).

**F6. Calc. and Post VAT Settlement**
1. Validate the inputs and confirm. Build the VAT-date filter start..end (SETL:710-740, 846-853).
2. Lock the G/L and VAT tables (SETL:553-557).
3. For each VAT Posting Setup: for type in [Purchase, Sale], filter open entries by type, groups and VAT date (SETL:437-506) → `CalcSums(Base, Amount)` → post a Settlement line on the VAT account (Amount = −Σ) → accumulate `VATAmount += ΣAmount` → close the source entries (SETL:300-434).
4. After all setups, if `VATAmount ≠ 0`, post `Amount = VATAmount` to the settlement account (SETL:515-549).
5. The payment of the payable is an ordinary bank journal line (no VAT).

**F7. Change the VAT date of a posted entry**: VAT entry edit → reject Settlement and Closed entries, check the new and old dates are allowed → update sibling VAT entries, G/L entries and the posted document header (VE:742-766; VRDM:70-85, 308-389).

---

## 5. Calculations and rounding

Notation: r = VAT %, P = `Amount Rounding Precision`, `RN(x)` = round x to P, nearest. `RV(x)` = round x to P with the `VAT Rounding Type` direction. AL `Round` works on magnitude: '=' is half away from zero, '>' rounds away from zero, '<' rounds toward zero (MS Learn `System.Round`). G = gross line amount, B = base.

| What | Formula | Source |
|---|---|---|
| Line amount | `LA = RN(Qty × UnitPrice) − LineDiscAmt`; `CLA = LA − InvDiscAmt` | SL:5881, 4697-4702 |
| Group, prices excl. | `B_g = ΣCLA`; `VAT_g = VATDiff_g + RV(carry + B_g × r/100)`; `AmtIncl_g = B_g + VAT_g` | VAL:924-952 |
| Group, prices incl. | `VAT_g = VATDiff_g + RV(carry + G_g × r/(100+r))`; `B_g = G_g − VAT_g`; `AmtIncl_g = G_g` | VAL:863-897 |
| Carry | only from a non-positive group to the next group with the same key: `carry = x − RV(x)` | VAL:886-896, 940-951 |
| Allocation to line i (excl.) | `R += VAT_g × CLA_i / CLA_g`; `VAT_i = RN(R)`; `R −= VAT_i`; `AmtIncl_i = CLA_i + VAT_i` | SP:3439-3452 |
| Allocation (incl.) | `RI += AmtIncl_g × CLA_i/CLA_g`; `AmtIncl_i = RN(RI)`; `RV += VAT_g × CLA_i/CLA_g`; `Amount_i = AmtIncl_i − RN(RV)`; the remainders are reduced by the posted values | SP:3407-3429 |
| Journal | `VAT = RV(A × r/(100+r))`, `Base = A − VAT` | GJL:382-385, 411 |
| Reverse charge (purchase) | `VAT = RV(Base × r/100)` on top (journal) or `Base × r/100` per buffer (document) | GJPL:569-572; PPI:910-920 |
| Max difference | `|VAT_entered − VAT_calculated| ≤ Max. VAT Difference Allowed` | VAL:366-377; GJL:1169-1175 |
| Invoice rounding | `Rnd = −RN(T − Round(T, InvPrec, InvDir))` posted as an extra line | SP:3599-3604 |
| Statement "whole numbers" | each printed component `Round(x, 1, '<')` before summing | VSR:518-524, 597-600 |
| Unrealized share (Percentage) | `settled / (full − (paid − settled))` | VE:980-987 |

Effect of the rounding direction (P = 1):

| Case | Exact VAT | Nearest | Up | Down |
|---|---|---|---|---|
| excl., B = 3,015 | 301.5 | 302 | 302 | 301 |
| incl., G = 3,015 | 274.0909 | 274 | 275 | 274 |

---

## 6. Worked posting examples (MNT, 10%, P = 1, Nearest)

Accounts: 1110 Cash, 1120 Bank, 1210 Receivables, 1410 Input VAT (Purchase VAT Acc.), 2110 Payables, 2410 Output VAT (Sales VAT Acc.), 2415 Reverse-charge VAT, 2420 VAT payable (settlement account, no VAT), 5110 Sales, 5990 Invoice rounding (no VAT), 7110 Expenses. Setup rows: DOMESTIC×VAT10 (Normal, 10%), FOREIGN×SERV10 (Reverse Charge, 10%), DOMESTIC×FULL (Full VAT).

**Ex 1. Sales invoice, prices excl. VAT, 3 lines × 1,005**
Group: B = 3,015, VAT = RN(301.5) = **302**. A naive per-line calculation gives 3 × RN(100.5) = 303.
Allocation: share = 302 × 1,005/3,015 = 100.6667. L1: RN(100.6667) = 101, R = −0.3333. L2: RN(100.3333) = 100, R = +0.3333. L3: RN(101.0) = 101. Σ = 302.

| Account | Debit | Credit |
|---|---|---|
| 1210 Receivables | 3,317 | |
| 5110 Sales | | 3,015 |
| 2410 Output VAT | | 302 |
| **Total** | **3,317** | **3,317** |

VAT entry: Type Sale, Base −3,015, Amount −302, linked to the 5110 G/L entry (whose `VAT Amount` = −302). Only one entry, because all lines share the buffer key.

**Ex 2. Same lines, prices incl. VAT (3 × 1,005 gross)**
Group: VAT = RN(3,015 × 10/110 = 274.0909) = **274**, base 2,741. Naive per-line: 3 × RN(91.36) = 273.
Allocation: share 91.3333 → L1 91 (Amount 914), R = +0.3333; L2 RN(91.6667) = 92 (Amount 913), R = −0.3333; L3 91 (Amount 914).

| Account | Debit | Credit |
|---|---|---|
| 1210 Receivables | 3,015 | |
| 5110 Sales | | 2,741 |
| 2410 Output VAT | | 274 |
| **Total** | **3,015** | **3,015** |

**Ex 3. Purchase invoice, prices excl., lines 4,550 + 3,333**: B = 7,883, VAT = RN(788.3) = 788. VAT entry: Purchase, Base +7,883, Amount +788.

| Account | Debit | Credit |
|---|---|---|
| 7110 Expenses | 7,883 | |
| 1410 Input VAT | 788 | |
| 2110 Payables | | 8,671 |
| **Total** | **8,671** | **8,671** |

**Ex 4. Cash expense in a G/L journal (gross 1,100, Purchase, DOMESTIC×VAT10, bal. 1110)**: VAT = RN(1,100 × 10/110) = 100, G/L amount 1,000.

| Account | Debit | Credit |
|---|---|---|
| 7110 Expenses | 1,000 | |
| 1410 Input VAT | 100 | |
| 1110 Cash | | 1,100 |
| **Total** | **1,100** | **1,100** |

**Ex 5. Sales credit memo for line 2 of Ex 1 (1,005 net)**: the credit memo recalculates its own VAT, RN(100.5) = **101**, although only **100** was allocated to that line on the invoice (pitfall P3). VAT entry: Sale, Base +1,005, Amount +101.

| Account | Debit | Credit |
|---|---|---|
| 5110 Sales (or credit-memo account) | 1,005 | |
| 2410 Output VAT | 101 | |
| 1210 Receivables | | 1,106 |
| **Total** | **1,106** | **1,106** |

**Ex 6. Imported service, reverse charge (FOREIGN×SERV10), net 5,000**: the vendor is paid net, and VAT 500 is self-assessed. VAT entry: Purchase, RC, Base 5,000, Amount 500.

| Account | Debit | Credit |
|---|---|---|
| 7110 Expenses | 5,000 | |
| 2110 Payables | | 5,000 |
| 1410 Input VAT | 500 | |
| 2415 Reverse-charge VAT | | 500 |
| **Total** | **5,500** | **5,500** |

**Ex 7. Import VAT paid at customs (Full VAT), 2,500 from bank**: the journal line account is 1410 (required). BC writes a 0-amount entry plus the VAT entry on 1410. VAT entry: Purchase, Full VAT, **Base 0**, Amount 2,500.

| Account | Debit | Credit |
|---|---|---|
| 1410 Input VAT | 2,500 | |
| 1120 Bank | | 2,500 |
| **Total** | **2,500** | **2,500** |

**Ex 8. Invoice rounding (if used): Ex 1 with Inv. Rounding Precision 10, Nearest**: T = 3,317 → 3,320, Rnd = −RN(3,317 − 3,320) = +3.

| Account | Debit | Credit |
|---|---|---|
| 1210 Receivables | 3,320 | |
| 5110 Sales | | 3,015 |
| 2410 Output VAT | | 302 |
| 5990 Invoice rounding | | 3 |
| **Total** | **3,320** | **3,320** |

**Ex 9. Monthly settlement**
Open entries in the period: DOMESTIC×VAT10 Sale ΣBase −50,000, ΣAmount −5,000. Purchase ΣBase 30,000, ΣAmount 3,000. FOREIGN×SERV10 Purchase ΣBase 5,000, ΣAmount 500.
Processing order: DOMESTIC/Purchase → DOMESTIC/Sale → FOREIGN/Purchase → settlement account. VATAmount = 3,000 − 5,000 = −2,000; the RC entry is excluded (R-VAT-31).

| # | Account | Debit | Credit | Settlement VAT entry (Closed) |
|---|---|---|---|---|
| 1 | 1410 Input VAT | | 3,000 | Base −30,000, Amount −3,000 |
| 2 | 2410 Output VAT | 5,000 | | Base +50,000, Amount +5,000 |
| 3 | 1410 Input VAT (RC) | | 500 | Base −5,000, Amount −500 |
| 3b | 2415 Reverse-charge VAT | 500 | | — |
| 4 | 2420 VAT payable | | 2,000 | — |
| | **Total** | **5,500** | **5,500** | |

All source entries become `Closed`, with `Closed by Entry No.` = the settlement entry of their group. Later payment to the tax authority: Dr 2420 2,000 / Cr 1120 2,000 (no VAT).

**Ex 10. VAT Statement on the Ex 9 data (Open, Within Period, before settlement)**

| Row | Type | Filter | Amount Type | Calc. with | Print | Result |
|---|---|---|---|---|---|---|
| 010 Taxable sales | VAT Entry Tot. | Sale, DOMESTIC, VAT10 | Base | Opposite | Y | 50,000 |
| 020 Output VAT | VAT Entry Tot. | Sale, DOMESTIC, VAT10 | Amount | Opposite | Y | 5,000 |
| 030 Output VAT on RC | VAT Entry Tot. | Purchase, FOREIGN, SERV10 | Amount | Sign | Y | 500 |
| 040 Total output | Row Tot. `020\|030` | | | — | Y | 5,500 |
| 050 Input VAT | VAT Entry Tot. | Purchase, DOMESTIC, VAT10 | Amount | Sign | Y | 3,000 |
| 060 Input VAT RC | VAT Entry Tot. | Purchase, FOREIGN, SERV10 | Amount | Sign | Y | 500 |
| 081 / 082 (helpers) | as 050 / 060 | | Amount | Opposite | N | −3,000 / −500 |
| 090 VAT payable | Row Tot. `040\|081\|082` | | | — | Y | 2,000 |
| 100 Check | Account Tot. `2410` | | — | Opposite | Y | 5,000 |

Row Totaling can't negate, so a subtraction needs hidden helper rows with Opposite Sign (R-VAT-27).

---

## 7. Simplifications for the micro-business system

1. **Tax code instead of a wide matrix.** Keep BC's two dimensions but make them small: `party_vat_class` {DOMESTIC, FOREIGN, (NON_VAT_PARTY)} × `item_vat_class` {STD, ZERO, EXEMPT, OUT_OF_SCOPE, FULL_IMPORT, RC_SERVICE}. A mapping table resolves each pair to a `tax_code` row: `{code, calc_type: NORMAL|REVERSE_CHARGE|FULL, rate, valid_from, valid_to, output_account, input_account, rc_account, ebarimt_tax_type, clause_text, blocked}`. tax_code = VAT Identifier.
2. **Effective-dated rates** replace an editable `VAT %` and the Rate Change tool. Snapshot `tax_code`, `rate` and `calc_type` on each document line and on each VAT entry. BC's VAT Entry has **no** rate field, so add one.
3. **One pure function** `computeDocumentVat(lines, pricesInclVat, rounding)` returns the groups (key: tax_code + sign) and the per-line allocation with the remainder method. It is used by the UI, PDF, eBarimt payload and posting. The UI always recomputes the whole document.
4. **Rounding:** store NUMERIC(18,2). The company setting `amount_precision` ∈ {1, 0.01} and the VAT rounding type default to Nearest. Implement Up and Down on |x| (magnitude) if exposed.
5. **VAT Difference**: allow it only on purchase documents (to copy the supplier's receipt VAT), with a configurable maximum (e.g. 1 MNT). Persist `vat_difference` on the line and the VAT entry.
6. **Posting**: one VAT entry per (document, tax_code, G/L account, sign), with `gl_entry_id` FK to the base entry and `transaction_id`. Skip ACY, unrealized and non-deductible fields. Treat non-deductible purchases as a tax code whose VAT is posted to the expense account (Full non-deductible only).
7. **Settlement**: monthly. Select **all open entries with vat_date ≤ period end**, not only start..end, so late entries are not stranded. Write one settlement voucher (lines per tax_code and type, plus the net line to 2420). Set `closed = true` and `settlement_id`. Lock the VAT period in the same transaction.
8. **VAT statement**: keep the four row types and the Calculate-with sign, and store the template as data (the return layout comes from the MN tax research). Drop the integer printing if amounts are whole MNT.
9. **VAT date** = posting date by default, editable only while the period is unlocked. Drop the VAT Return Period workflow statuses (Released, Submitted) and keep only `locked`.
10. **SKIP**: Sales Tax, unrealized/cash-basis VAT, ACY, EU fields, VAT base discount, payment-discount VAT adjustment, VAT Rate Change, prepayment VAT (revisit), invoice rounding (unless cash rounding is required).

---

## 8. Pitfalls and edge cases the new implementation must not miss

1. **Σ round(line) ≠ round(Σ)** (Ex 1: 303 vs 302; Ex 2: 273 vs 274). The printed, posted and eBarimt VAT must all come from the same group calculation and allocation.
2. **Allocation order matters.** The remainder is carried in line-number order. Changing the order changes which line gets the extra unit. Sort deterministically.
3. **A credit memo recomputes VAT** from its own lines and can differ from the VAT originally allocated to that line (Ex 5: 101 vs 100). Either copy the original line VAT as a VAT Difference or accept a 1-unit drift.
4. **Partial invoicing**: each invoice rounds its own groups. The sum over partial invoices can differ from the order total.
5. **Mixed-sign lines** in one document form separate groups with a carry. Don't net them blindly before rounding.
6. **Rate snapshot**: in BC an open document keeps the `VAT %` copied when the line was validated. A changed rate applies only after the line is revalidated (SL:1813-1817).
7. **Statement filters on groups are exact**: a blank Bus/Prod group on a VAT Entry Totaling row means "blank", not "all", and a blank Gen. Posting Type matches nothing.
8. **The settlement start date can strand entries.** An entry posted later into an already-settled period stays open and is missed if the next run starts after it. Lock periods and settle with "≤ end".
9. **Full VAT has Base 0**, so turnover/base rows on the return miss the import value. Store the customs value separately if the return needs it.
10. **Reverse charge** has one purchase VAT entry that must count in both output and input rows. On sales, RC entries carry a base with a 0 amount.
11. **The invoice-rounding and settlement accounts must be zero-VAT.** Otherwise VAT is recomputed on the rounding line, and the settlement setup guards fail.
12. **Settled = immutable**: closed VAT entries block reversal. Corrections after filing must be new documents dated in an open period.
13. **Journal amounts are gross while document line amounts are net** (unless prices include VAT). Mixing these conventions doubles or omits VAT.
14. **A 100% line discount** zeroes the VAT on the posting buffer (SPI:402-408). Zero-amount lines are excluded from the VAT groups (SL:7503-7505).
15. **Rounding of negatives**: AL rounds by magnitude. A naive `Math.round`/`floor` on negative sales amounts gives different results. Round on document-sign (positive) amounts before negating, as BC does.
16. **VAT date ≠ posting date**: the statement and the settlement filter on the VAT date, and Account Totaling uses the G/L `VAT Reporting Date`. Changing the VAT date must update the G/L entries too (VRDM:308-318).
17. **Concurrency**: the settlement locks the G/L and VAT tables (SETL:553-557). Serialize settlement against posting.

---

## 9. Open questions

1. Mongolian VAT return layout (rows/boxes, base vs amount, zero-rated and exempt turnover lines). This is needed to seed the statement template. Owner: MN tax research.
2. eBarimt rounding: per item or per receipt, and decimals vs whole MNT. Must the item VAT sum equal the receipt VAT exactly? This decides `amount_precision` and the allocation output format.
3. Is input VAT deductible only for purchases whose eBarimt receipt is registered or confirmed? If so, add a `deductible_confirmed` flag on purchase VAT entries and a statement filter.
4. Capital city tax (НХАТ) on some goods and services: model it as a second tax line or a separate tax code. It doesn't fit BC's single-VAT-per-line model.
5. Do imported services from non-residents require reverse-charge self-assessment in Mongolia (keeping `REVERSE_CHARGE`)?
6. Filing frequency (monthly?), due date, and whether VAT is accrual-based (confirming that unrealized VAT can be skipped). How should advances and prepayments be taxed?
7. Non-VAT-registered micro businesses (below the registration threshold, to be verified): do they disable VAT entirely and treat input VAT as cost?
8. Should 1-unit differences against a supplier's printed VAT be accepted automatically (VAT Difference ≤ 1 MNT) or always matched?
