# BC research: currencies, exchange rates and FX adjustment

- **Source:** BCApps (BC v29, W1 Base App, MIT). Every rule below comes from reading the AL code, not the documentation.
- **Keep levels:** **MUST** = needed in micro-ERP v1. **SHOULD** = keep in a simpler form, or add soon after v1. **SKIP** = leave out.
- **Conventions:**
  - LCY = MNT and VAT = 10%.
  - Accounts come from the illustrative chart in `mn-accounting.md`: 1110 Bank MNT, 1200 AR, 1300 VAT receivable, 2100 AP, 2300 VAT payable, 5100 Revenue, 7200 Expense.
  - Sub-accounts added for these examples:
    - 1112 Bank USD (under 1110).
    - Under 8500 Ханшийн зөрүүний олз (гарз): 8510 FX gain realised, 8515 FX loss realised, 8520 FX gain unrealised, 8525 FX loss unrealised.
  - Rates are MNT per 1 USD and are illustrative.
- **Path aliases** (all paths are repo-relative; `BA/` = `src/Layers/W1/BaseApp/`):

| Alias | File |
|---|---|
| `CUR` | `BA/Finance/Currency/Currency.Table.al` |
| `CER` | `BA/Finance/Currency/CurrencyExchangeRate.Table.al` |
| `ERA` | `BA/Finance/Currency/ExchRateAdjustment.Report.al` |
| `ERP` | `BA/Finance/Currency/ExchRateAdjmtProcess.Codeunit.al` |
| `UCER` | `BA/Finance/Currency/UpdateCurrencyExchangeRates.Codeunit.al` |
| `CERUS` | `BA/Finance/Currency/CurrExchRateUpdateSetup.Table.al` |
| `MAP` | `BA/Finance/Currency/MapCurrencyExchangeRate.Codeunit.al` |
| `GJPL` | `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al` |
| `GJL` | `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al` |
| `SH` / `SP` | `BA/Sales/Document/SalesHeader.Table.al` / `BA/Sales/Posting/SalesPost.Codeunit.al` |
| `CLE` / `DCLE` | `BA/Sales/Receivables/CustLedgerEntry.Table.al` / `BA/Sales/Receivables/DetailedCustLedgEntry.Table.al` |
| `DBUF` | `BA/Finance/ReceivablesPayables/DetailedCVLedgEntryBuffer.Table.al` |
| `CEAPE` | `BA/Sales/Receivables/CustEntryApplyPostedEntries.Codeunit.al` |
| `GLREV` | `BA/Finance/Currency/GLCurrencyRevaluation.Report.al` |

---

## 1. Summary

- **Currency master (T4)**: per currency, it holds the rounding precisions (amount, unit-amount and invoice) and the gain/loss G/L accounts: realised and unrealised gains and losses, plus the ACY-only residual and realised-G/L accounts. LCY is *not* a row. It is the blank currency code, and its precision comes from G/L Setup (`CUR:886-903, 1248-1256`).
- **Rates (T330)** are dated rows keyed by (Currency, Starting Date). The rate in force on date D is the **last row with Starting Date ≤ D**. There is no end date and no fallback: if no row exists, posting fails (`CER:349-369`).
- **The BC "currency factor" means FCY per 1 LCY**: `factor = Exchange Rate Amount / Relational Exch. Rate Amount`, and `LCY = FCY / factor` (`CER:293, 219`). With USD = 3,400 MNT the factor is 1/3400 ≈ 0.000294. Documents and journal lines freeze this factor when the posting date is set (`SH:4746-4774`, `GJL:550-564`).
- **Every FCY ledger amount is stored twice**: `Amount` (FCY) and `Amount (LCY)`. The G/L balances in LCY (plus ACY), but each G/L entry also carries `Source Currency Code` and `Source Currency Amount` (T17 fields 20/18, filled in `GJPL:425-447` for non-system FCY lines); the G/L source-currency revaluation (R-24) relies on these (verified-corrected). The C/V entry keeps `Original Currency Factor` (the posting rate, never changed) and `Adjusted Currency Factor` (the last revaluation rate) (`GJPL:1314-1319`).
- **Exchange-rate adjustment** (Report 596 → CU 699) revalues these to the adjustment rate *as of the adjustment date*:
  - open customer and vendor items, including items that were closed later;
  - FCY bank accounts;
  - with ACY only, G/L accounts and VAT.
- **How the adjustment is recorded:**
  - Customers/vendors: one **Unrealized Gain/Loss detailed entry** per item (FCY amount 0, LCY = delta), and a summarised G/L posting: control account ↔ unrealised gain/loss account (`ERP:1921-2108, 1129-1196`).
  - Banks: a bank ledger entry with FCY 0 and LCY = delta, posted against the **realised** gain/loss accounts (`ERP:841-879`).
- **On application**, three things happen in this order (`GJPL:5929-5945`):
  - the item's unrealised total is **reversed pro rata** to the applied share;
  - the **realised** gain/loss is measured against the **original** posting rates of both entries;
  - an LCY rounding residue is booked as "Correction of Remaining Amount".
  - After all pairs are processed, the same unrealised reversal and correction are also run once on the **applying (new) entry** (`GJPL:3864-3873`), see R-30a (added-in-verification).
- **Invariant protected throughout:** for every open item, `Remaining LCY = Round(Remaining FCY / Adjusted factor)`. When the FCY remaining is 0, the LCY remaining is 0. The control account in the G/L always equals Σ of the subledger LCY.
- **The rate-update service** is generic: a URL plus a Data Exchange mapping, run by a daily job queue entry that upserts T330 rows (`UCER:48-66`, `CERUS:288-309`, `MAP:78-112`). For Mongolia it is replaced by a Mongolbank fetcher with a manual fallback (`mn-integrations-market.md` §4, I-09).

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (types) | Keep |
|---|---|---|---|---|
| Currency | Table 4 `Currency` | FCY master | `Code` Code10 PK; `ISO Code` Code3; `Description` Text30; `Amount Rounding Precision` Dec (init 0.01); `Unit-Amount Rounding Precision` Dec (init 0.00001); `Invoice Rounding Precision` Dec + `Invoice Rounding Type` {Nearest,Up,Down}; `VAT Rounding Type`; `Unrealized Gains/Losses Acc.`, `Realized Gains/Losses Acc.` Code20; `Realized G/L Gains/Losses Account`, `Residual Gains/Losses Account` (ACY); `Conv. LCY Rndg. Debit/Credit Acc.`; `Appln. Rounding Precision`; `Last Date Adjusted` Date; `Currency Factor` (work field set by the adjustment run); `Symbol` | MUST: code, ISO, description, amount and unit precision. SHOULD: gain/loss accounts held globally rather than per currency. SKIP: ACY, residual, EMU, payment tolerance, max VAT difference |
| Currency exchange rate | Table 330 | Dated rate | PK (`Currency Code`, `Starting Date` Date); `Exchange Rate Amount` Dec(1:6); `Relational Exch. Rate Amount` Dec(1:6); `Adjustment Exch. Rate Amount`, `Relational Adjmt Exch Rate Amt`; `Relational Currency Code` Code10; `Fix Exchange Rate Amount` Enum 330 {Currency, Relational Currency, Both} | MUST (as `currency_rate(currency, date, mnt_per_unit, source)`). SKIP: relational currency, fix type, separate adjustment rate |
| Document currency | `Currency Code`, `Currency Factor` Dec(0:15) on T36/T38 (headers) and T81 (journal line) | Rate frozen on the document | `Currency Factor` editable only through validation or the Change Exchange Rate page | MUST (store the rate, not the factor) |
| Journal line FX fields | Table 81 | Posting input | `Amount` (FCY, at currency precision), `Amount (LCY)`, `Currency Factor`, `Source Currency Code/Amount`; editing `Amount (LCY)` sets factor := Amount / Amount (LCY) (`GJL:633-680`) | MUST |
| C/V ledger entry FX fields | T21 / T25 | Item-level FX state | `Currency Code`; `Original Currency Factor`, `Adjusted Currency Factor` Dec(0:15) (`CLE:652-666`); FlowFields `Remaining Amt. (LCY)` (all detailed rows ≤ date), `Original Amt. (LCY)` (Initial Entry only), `Amount (LCY)` (rows with `Ledger Entry Amount`) (`CLE:159-200`); `Closed by Currency Code/Amount` | MUST |
| Detailed C/V entry FX types | T379 / T380, Enum 379 | Movement log | values 3 Unrealized Loss, 4 Unrealized Gain, 5 Realized Loss, 6 Realized Gain, 10 Appln. Rounding, 11 Correction of Remaining Amount; `Exch. Rate Adjmt. Reg. No.` | MUST (3–6, 11). SKIP: 10 |
| Bank account | Table 270 | FCY cash/bank | `Currency Code`; FlowFields `Balance at Date` (FCY) and `Balance at Date (LCY)` over T271, cumulative to the upper date limit (`BA/Bank/BankAccount/BankAccount.Table.al:600-624`) | MUST |
| Adjustment parameters | Table 596 (temp) | Run input | Start/End/Posting Date, Document No., Adjust Customers/Vendors/Employees/Bank/G/L, Adjust Per Entry, Dimension Posting {Source Entry, None, G/L Account}, Preview | MUST (subset: as-of date, posting date, doc no., preview) |
| Adjustment register | Table 86 `Exch. Rate Adjmt. Reg.` | One row per (account type, posting group, currency) per run | `Creation Date`, `Account Type` Enum 596, `Posting Group`, `Currency Code`, `Currency Factor`, `Adjusted Base`, `Adjusted Base (LCY)`, `Adjusted Amt. (LCY)` | SHOULD (as a `fx_reval_run` header) |
| Adjustment ledger entry | Table 186 | Per-item audit line | `Register No.`, `Account Type/No.`, `Document Type/No.`, `Currency Factor`, `Base Amount`, `Base Amount (LCY)`, `Adjustment Amount`, `Detailed Ledger Entry No./Type` (`ERP:2849-2868`) | SHOULD (as `fx_reval_line`) |
| Adjustment buffers | Table 595 (temp); T383 `Detailed CV Ledg. Entry Buffer` only maps buffer index → transaction no./register no. | G/L summarisation | grouped by Currency, Posting Group, Account, Dimension, **IC Partner Code**, Posting Date[, Entry] (`ERP:1082-1127`, `ERP:1129-1157`) (verified-corrected) | SKIP (in-memory) |
| G/L source-currency revaluation | T15 `Source Currency Revaluation`, `Unrealized Revaluation`; T589 `G/L Account Source Currency`; Report `G/L Currency Revaluation` | Revalue G/L accounts (for example FCY loans) carried in a source currency | (`GLREV:166-232`) | SHOULD (v1.1, for FCY loans) |
| ACY G/L adjustment | T15 `Exchange Rate Adjustment` Enum 595; G/L Setup `Additional Reporting Currency`, `VAT Exchange Rate Adjustment` | Translate the G/L into a 2nd reporting currency | (`ERP:317-429, 487-519, 1630-1734`) | SKIP |
| Rate service | Table 1650 `Curr. Exch. Rate Update Setup`; CU 1281; CU 1280 `Map Currency Exchange Rate` | Automatic rate import | `Web Service URL` BLOB, `Data Exch. Def Code`, `Enabled` (consent + daily job), `Log Web Requests` | SKIP the framework. MUST: own Mongolbank fetcher |
| Application currency mode | Sales/Purch. Setup `Appln. between Currencies` {None, EMU, All} | Cross-currency application | (`BA/Finance/ReceivablesPayables/GenJnlApply.Codeunit.al:295-304`) | MUST = None (same currency only) |

---

## 3. Business rules

### Rates and conversion
- **R-CURRENCY-FX-01**: The rate for (currency, date) is the row with the greatest `Starting Date` ≤ date. A blank date means WorkDate. `FindLast` errors when no row exists, so there is no silent fallback. A per-instance cache keys on (currency, date). *Src:* `CER:349-369`. *Keep:* MUST. *Notes:* `Currency.GetExchangeRate` (`CUR:911-927`) falls back to the latest row of any date, returns **1** when there is no row or ERA = 0, and returns **100** for the blank (LCY) code (verified-corrected). It is a display helper; never use it for posting.
- **R-CURRENCY-FX-02**: `ExchangeRate(date, cur)` = `Exchange Rate Amount / Relational Exch. Rate Amount`, which is FCY per 1 LCY. Both amounts must be non-zero (TestField). With a relational currency the factor is `(ERA₁·ERA₂)/(RERA₁·RERA₂)`. *Src:* `CER:269-309`. *Keep:* MUST (as `mnt_per_unit` = RERA/ERA). SKIP: relational.
- **R-CURRENCY-FX-03**: `ExchangeAmtFCYToLCY(date, cur, amt, factor)`:
  - With no relational currency and fix ≠ Both, the result is `amt / factor`, using the **document's** factor.
  - With fix = Both, the table rate on the date is used and the factor is ignored.
  - The result is **unrounded**. Callers apply `Round()`, which uses G/L Setup `Amount Rounding Precision`, nearest, half away from zero (`BA/Finance/Currency/AmountAutoFormat.Codeunit.al:55-59`).
  - *Src:* `CER:195-267`. *Keep:* MUST.
- **R-CURRENCY-FX-04**: `ExchangeAmtLCYToFCY` = `amt × factor`. The caller rounds to the currency's `Amount Rounding Precision`. *Src:* `CER:143-193`; `GJL:654-659`. *Keep:* MUST.
- **R-CURRENCY-FX-05**: `ExchangeAmtFCYToLCYAdjmt` / `ExchangeRateAdjmt` behave the same but use the `Adjustment` / `Relational Adjmt` amounts, which must be non-zero. *Src:* `CER:205-214, 279-288, 317-327`. *Keep:* SKIP (use one rate). *Notes:* the rates page copies all fields from the previous row on insert (`BA/Finance/Currency/CurrencyExchangeRates.Page.al:83-94`). A stale adjustment rate is therefore easy to miss.

### Documents and posting
- **R-CURRENCY-FX-06**: A document's factor is set from the rate on **Posting Date**, or WorkDate if blank. It is recomputed when the posting date or the currency changes. If the factor changes, the user confirms, and the lines are then recalculated. A missing rate shows a notification and leaves the factor unchanged. *Src:* `SH:675-681, 926-950, 4746-4799`; journal `GJL:550-564`. *Keep:* MUST (recompute on the date change, freeze on post).
- **R-CURRENCY-FX-07**: Manual rate on a journal line. Editing `Amount (LCY)` on an FCY line with a non-fixed rate sets `Currency Factor := Amount / Amount (LCY)`. With fix = Both, it recomputes `Amount` instead. *Src:* `GJL:633-680`, `GJL:5039-5060`. *Keep:* SHOULD (this is how "actual MNT received" is recorded; see §6.6).
- **R-CURRENCY-FX-08**: Posting checks:
  - `Amount` must already be rounded to the currency precision.
  - `Amount (LCY)` must be rounded to the LCY precision.
  - `Amount (LCY)` is otherwise `Round(Amount / factor)` (`GJL:5107-5119`).
  - *Src:* `GJPL:414-464`. *Keep:* MUST.
- **R-CURRENCY-FX-09**: Document lines are converted with **running totals**: `lineLCY = Round(cumFCY / factor) − cumLCYsoFar`. This is done separately for `Amount`, `Amount Including VAT`, discounts and VAT base. So Σ lines LCY = Round(total FCY / factor) exactly, and VAT LCY = incl − excl. *Src:* `SP:3487-3560`. *Keep:* MUST.
- **R-CURRENCY-FX-10**: The C/V entry stores `Original Currency Factor := line factor`; for LCY it is 1. `Adjusted Currency Factor := Original`. An FCY line must carry a factor (TestField). *Src:* `GJPL:1314-1319`. *Keep:* MUST.
- **R-CURRENCY-FX-11**: Bank currency rule:
  - An LCY line requires an LCY bank.
  - An FCY line requires the same FCY bank **or an LCY bank**. The LCY bank then receives `Amount (LCY)`.
  - An FCY bank ledger entry gets `Amount` = FCY and `Amount (LCY)`.
  - *Src:* `GJPL:1587-1592, 1608-1613`. *Keep:* MUST.
- **R-CURRENCY-FX-12**: The FCY balance check is narrower than "every FCY journal must balance in FCY" (verified-corrected). At posting, a balancing group (same posting date, or same document type/no. when the template has `Force Doc. Balance`) is checked in FCY **only if all of its lines carry the same non-blank currency**; a line with a different currency clears `LastCurrencyCode`, and the group is then checked in LCY only. Lines that have both `Account No.` and `Bal. Account No.` are self-balancing and do not count. The manual "Insert Conv. LCY Rndg. Lines" function groups lines by (posting date, document no.); when **every** currency total in the group is 0 in FCY but the LCY total is not 0, it inserts an LCY G/L line per FCY currency to `Conv. LCY Rndg. Debit/Credit Acc.`. *Src:* `BA/Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al:405-413, 577-591, 1197-1217`; `BA/Finance/GeneralLedger/Journal/AdjustGenJournalBalance.Codeunit.al:23-157`. *Keep:* MUST (LCY balance), SHOULD (FCY balance + auto rounding line).
- **R-CURRENCY-FX-13**: Invoice rounding: `InvRnd = −Round(Total − Round(Total, InvPrec, dir), AmtPrec)`, posted as an extra line to the posting group's invoice-rounding account. *Src:* `SP:3587-3620`; `CUR:186-214`. *Keep:* SHOULD (MNT cash rounding only).

### Exchange-rate adjustment (customers / vendors)
- **R-CURRENCY-FX-14**: Run checks:
  - Start Date ≤ Posting Date ≤ End Date, with a blank End Date read as 31-12-9999 (`ERA:269-272, 430-436`; `ERP:1896-1902`).
  - Each currency in the filter gets `Last Date Adjusted := Posting Date`, and its adjustment factor is computed **at Posting Date** (`ERP:213-222`).
  - The factor comes from `ExchangeRateAdjmt`, i.e. the row's `Adjustment Exch. Rate Amount` / `Relational Adjmt Exch Rate Amt`, **not** the normal posting rate (R-05). A stale adjustment rate silently produces a wrong revaluation (added-in-verification).
  - *Keep:* MUST.
- **R-CURRENCY-FX-15**: Selecting items (per customer):
  - (a) every **open** FCY entry with Posting Date ≤ End Date;
  - (b) every FCY entry with Posting Date in [Start, End] that has detailed rows dated **after** End Date, i.e. entries applied or closed later.
  - *Src:* `ERP:1302-1352`. *Keep:* MUST. *Notes:* entries dated before Start Date that were closed after End Date are missed, so Start Date should stay blank.
- **R-CURRENCY-FX-16**: Item delta, computed **as of the date**: `Date Filter = 0D..D`, and `delta = Round(RemainingFCY_D / adjFactor) − RemainingLCY_D`. Unrealised rows already created in this run are added to `RemainingLCY`. If `Adjusted Currency Factor` ≠ adjFactor, it is updated even when the delta is 0. *Src:* `ERP:1931, 1949-1981`. *Keep:* MUST.
- **R-CURRENCY-FX-17**: Gain/loss classification is by the sign of **this delta**: > 0 is an Unrealized Gain row, < 0 an Unrealized Loss row. `OldAdj` = Σ prior unrealised rows (no date filter). When the delta crosses past `OldAdj`, BC splits it into two rows: −OldAdj, then the rest. Both rows have the delta's type. *Src:* `ERP:1954-1960, 1996-2093`. *Keep:* MUST (a simple sign rule). *Notes:* the gains and losses accounts therefore do not each net to zero over an item's life; only their sum does.
- **R-CURRENCY-FX-18**: The detailed row has `Amount` (FCY) = **0** and `Amount (LCY)` = delta. Posting Date = adjustment date (or the later date, see R-19). Document No. = run doc no. It inherits the due date and dims of the item. *Src:* `ERP:2667-2685, 1985-1988`. *Keep:* MUST.
- **R-CURRENCY-FX-19**: Late-run correction. For each detailed row of the item dated **after** D, the item is re-adjusted **at that row's date** with the same adjFactor. Typically the FCY remaining is then 0, and BC posts a mirror unrealised row at the application date. This keeps both `Remaining LCY as of D` and `as of the later date` correct. *Src:* `ERP:623-631, 659-666`. *Keep:* MUST (or block it, see §7.4).
- **R-CURRENCY-FX-20**: G/L posting:
  - Buffer per (currency, posting group, control account, dim set, posting date[, entry]). Post `+Σdelta` to the receivables/payables account.
  - Per (currency, dims, date), post `−ΣGains` to `Unrealized Gains Acc.` and `−ΣLosses` to `Unrealized Losses Acc.`; gains and losses are **not netted**.
  - Then insert the detailed rows with the real transaction no. and register no.
  - Lines are `System-Created`, with Source Code `Exchange Rate Adjmt.` and no VAT/gen. posting groups.
  - *Src:* `ERP:797-830, 1129-1196, 1239-1258`. *Keep:* MUST.
- **R-CURRENCY-FX-21**: The customer and vendor algorithms are identical. Signs follow the ledger: an AP item is negative, so a rising USD gives a negative delta, which is an unrealised **loss**. *Src:* `ERP:2110-2296`. *Keep:* MUST.

### Bank and G/L accounts
- **R-CURRENCY-FX-22**: For each FCY bank account (`Currency Code` ≠ ''): `delta = Round(BalanceAtDate_FCY / adjFactor) − BalanceAtDate_LCY`. BC posts a bank journal line with Amount 0 and `Amount (LCY)` = delta, plus the opposite side to **`Realized Gains Acc.`** (delta > 0) or **`Realized Losses Acc.`**. A register row is written per bank posting group. It is never reversed. The balance is taken as of **End Date** (the upper limit of the Date Filter Start..End), while the rate is taken at **Posting Date**; customer/vendor items (R-16) are instead measured as of **Posting Date**. The two coincide only when Posting Date = End Date, which is the request page default (`ERA:99-107`) (added-in-verification). *Src:* `ERP:431-485, 841-879`; `BA/Bank/BankAccount/BankAccount.Table.al:600-624`. *Keep:* MUST. *Notes:* the "realised" account choice is BC's; whether MN tax treats it as realised is an open question (§9).
- **R-CURRENCY-FX-23**: G/L accounts are adjusted **only for ACY** (`Exchange Rate Adjustment` = Adjust Amount / Adjust ACY Amount). Realised-G/L accounts must be set to No Adjustment. VAT accounts must be set to No Adjustment when VAT adjustment is used. *Src:* `ERP:317-429, 487-519, 1630-1753`. *Keep:* **SKIP**.
- **R-CURRENCY-FX-24**: Source-currency G/L revaluation (separate report): for G/L accounts with `Source Currency Revaluation`, `delta = Round(SrcBalance / factor) − LCYBalance`. A journal line is created against the unrealised or realised gain/loss account, chosen by `Unrealized Revaluation`. An account cannot be both revalued this way and used as a C/V control account. *Src:* `GLREV:166-232`; `ERP:832-839`. *Keep:* SHOULD.

### Application (realised gain/loss)
- **R-CURRENCY-FX-25**: Same currency only. `Appln. between Currencies = None` errors when the currencies differ, and that includes LCY vs FCY. *Src:* `BA/Finance/ReceivablesPayables/GenJnlApply.Codeunit.al:295-304`. *Keep:* MUST.
- **R-CURRENCY-FX-26**: Per applied pair, in this order:
  1. `FindAmtForAppln` → `AppliedAmount` (FCY, signed as the reduction of the old entry). `AppliedAmountLCY = Round(AppliedAmount / Old.OriginalFactor)`.
  2. Unrealised reversal on Old.
  3. Realised on New.
  4. Realised on Old.
  5. Application rows.
  6. LCY correction on Old.
  7. After the last pair, once per posting: unrealised reversal and LCY correction on New (R-30a) (added-in-verification).

  *Src:* `GJPL:5921-5945, 3415-3417, 3864-3873`. *Keep:* MUST.
- **R-CURRENCY-FX-27**: Unrealised reversal:
  - `U = Round(ΣUnrealizedLCY(old, all dates) × |applied / remainingBeforeAppln|)`.
  - It creates a row with LCY = **−U**, of type Unrealized Loss if U < 0, else Unrealized Gain. This is the *same* type as the net prior unrealised amount, so the G/L reverses on the same account.
  - It is skipped for LCY entries or when the remaining before application is 0.

  *Src:* `GJPL:3449-3494`; `DCLE:529-536`. *Keep:* MUST.
- **R-CURRENCY-FX-28**: Realised gain/loss:
  - Formula: `R = AppliedAmountLCY − Round(AppliedAmount / entry.OriginalFactor)` (with the entry's signs). R > 0 → Realized Gain row, R < 0 → Realized Loss row; FCY amount 0, LCY = R.
  - In the same-currency case, Old's R is 0 by construction, so the **whole realised difference sits on the new (applying) entry**.
  - It is measured against **original** rates and ignores interim revaluations. Those are reversed by R-27.

  *Src:* `GJPL:3496-3522, 5932-5936`. *Keep:* MUST.
- **R-CURRENCY-FX-29**: Application rows. Old gets (`OldAppliedAmount`, `AppliedAmountLCY`) and New gets (−`AppliedAmount`, −`AppliedAmountLCY`). Both are at Old's original rate. *Src:* `GJPL:3541-3565`. *Keep:* MUST.
- **R-CURRENCY-FX-30**: Correction of Remaining Amount. After application, if `Round(Old.RemainingFCY / Old.AdjustedFactor) ≠ Old.RemainingLCY`, BC posts the difference as a "Correction of Remaining Amount" row. It goes to the posting group's Debit/Credit **Rounding** account. *Src:* `GJPL:3591-3615, 4270-4271, 5511-5518`. *Keep:* MUST (this is what guarantees "FCY 0 ⇒ LCY 0").
- **R-CURRENCY-FX-30a** (added-in-verification): Once all pairs are applied, BC also treats the **applying (new) entry**: it reverses the new entry's own unrealised total pro rata, `Round(ΣU(new) × |Σ Application FCY on new / new remaining before application|)`, with the same sign/type rule as R-27, and then runs the R-30 correction on the new entry. This matters when the applying entry was itself revalued, for example a payment posted in January, revalued at month-end and applied in February through "Apply Entries" with the payment as the applying entry. Without this step the new entry would keep its unrealised amount after it closes. *Src:* `GJPL:3789, 3864-3873` (customer), `GJPL:4481, 4550-4559` (vendor). *Keep:* MUST.
- **R-CURRENCY-FX-31**: G/L for one application transaction:
  - The control account receives Σ `Amount (LCY)` of **all** detailed rows of the transaction (`GJPL:4171, 7752-7776, 7804-7835`).
  - Each gain/loss row posts `−Amount (LCY)` to `Currency.GetGainLossAccount(type)` (`GJPL:5441-5481`; `CUR:995-1020`).
  - The accounts are mandatory: TestField errors if they are blank (`CUR:1027-1108`).

  *Keep:* MUST.
- **R-CURRENCY-FX-32**: Unapply and re-adjustment. Unapply mirrors every non-initial row of the application, gain/loss rows included. BC then re-runs the adjustment for the affected entries at the unapply date, using **each entry's own `Adjusted Currency Factor`**. This restores the reopened item's LCY to remaining × last revaluation rate. *Src:* `CEAPE:438-440, 455-466`; `ERP:2483-2515, 2596-2603, 2623-2626`. *Keep:* MUST.

### Master data, service, safety
- **R-CURRENCY-FX-33**: A currency cannot be deleted while open customer, vendor or employee entries use it. Deleting a currency deletes its rates. *Src:* `CUR:796-819`. *Keep:* MUST (soft-deactivate instead).
- **R-CURRENCY-FX-34**: Precision rules:
  - Invoice precision must be a multiple of the amount precision.
  - Changing the amount precision re-rounds the invoice precision, and raises it to the amount precision if it was smaller.
  - A new currency row does **not** read G/L Setup: it gets the field `InitValue`s (amount 0.01, unit-amount 0.00001, invoice 0.01). `InitRoundingPrecision` (which copies G/L Setup) is only used to build the in-memory LCY "currency" for the blank code (`CUR:1248-1256`) (verified-corrected).
  - BC does not block changing a currency's precision while entries exist; only deletion is blocked (R-33).

  *Src:* `CUR:186-237, 242-251, 886-903`. *Keep:* MUST (amount and unit), SHOULD (invoice).
- **R-CURRENCY-FX-35**: Rate service:
  - Enabling the service needs consent and a valid URL and mapping, and creates a daily job queue entry.
  - The fetch reads the URL into a Data Exchange (JSON is converted to XML) and runs the mapping.
  - Each mapped row is upserted. Defaults: `Starting Date` = Today, `Exchange Rate Amount` = 1, `Adjustment` = same as the normal rate, `Fix` = Currency.
  - HTTP errors are written to the Activity Log.

  *Src:* `CERUS:72-95, 288-309`; `UCER:48-178`; `MAP:78-124`. *Keep:* SKIP the framework, MUST the behaviour (see §7.1).

---

## 4. Flows

### 4.1 Post an FCY sales or purchase invoice
1. Header: Currency Code → factor = rate at Posting Date (R-06). A changed posting date triggers recompute and confirm.
2. Lines are priced and rounded in FCY (currency amount and unit precision).
3. At posting: running-total conversion of every line to LCY (R-09). Optional invoice rounding (R-13).
4. G/L: revenue or expense and VAT in LCY. Customer/vendor entry: `Amount` FCY, Initial detailed row (FCY, LCY), `Original = Adjusted factor` (R-10).
5. Receivables/payables G/L = Σ detailed LCY.

### 4.2 Month-end adjustment run (Report 596 → CU 699)
1. Validate the dates (R-14). Lock the detailed tables and get the next entry no. (`ERP:644-657`).
2. For each currency: stamp Last Date Adjusted and compute adjFactor at Posting Date (`ERP:213-222`).
3. Banks: compute the delta per FCY bank (R-22) → post bank and realised gain/loss → register per posting group.
4. Customers: select items (R-15). For each item: delta at D (R-16/17), then for each later detailed date, delta at that date (R-19). Accumulate the buffers.
5. Post the buffers: control account; unrealised gains; unrealised losses (R-20). Insert the detailed rows. Write the register and ledger lines.
6. Vendors: same as step 4–5. Employees: same (SKIP).
7. G/L (ACY) and VAT (only if "Adjust G/L Accounts"): SKIP.
8. Consistency check of the G/L (`ERP:89-98`). Preview mode throws at the end and rolls back (`ERP:86-87, 1904-1919`).

### 4.3 Apply a payment to an FCY invoice (same currency)
1. Choose the target (Applies-to Doc / ID), see `bc-subledgers-application.md`.
2. Per pair (R-26): applied FCY and LCY at Old's original rate → reverse Old's unrealised pro rata (R-27) → realised on New (R-28) → application rows (R-29) → correction on Old (R-30).
3. Post the G/L: control account = Σ rows. Gain/loss accounts = −rows (R-31).
4. After the pairs: reverse the **new** entry's unrealised share and correct its LCY remaining (R-30a).
5. Unapplying only: after posting, re-adjust the affected entries (R-32). Applying already-posted entries ("Apply Entries") does **not** trigger this re-adjustment; `RunCustExchRateAdjustment` is called only from `PostUnApplyCustomerCommit` (`CEAPE:438-440`) (verified-corrected).

---

## 5. Calculations & rounding

| Quantity | Formula | Rounding | Source |
|---|---|---|---|
| Factor (BC) | `ERA / RERA` (FCY per LCY) | none (stored 0:15 dp) | `CER:293` |
| FCY → LCY | `amt / factor` (or `amt/ERA×RERA` if Fix = Both) | caller: `Round(x)` = LCY precision (G/L Setup, default 0.01), nearest, half away from zero | `CER:215-219`; `AmountAutoFormat:55-59` |
| LCY → FCY | `amt × factor` | currency `Amount Rounding Precision` | `CER:155-159`; `GJL:654-659` |
| Manual rate | `factor := Amount / Amount (LCY)` | none | `GJL:662` |
| Document line LCY | `Round(cumFCY/factor) − cumLCY` | 0.01 per running total | `SP:3506-3552` |
| Invoice rounding | `−Round(T − Round(T, InvPrec, dir), AmtPrec)` | dir `=`/`>`/`<` | `SP:3598-3603`; `CUR:966-976` |
| C/V revaluation delta | `Round(RemFCY_D / adjF) − RemLCY_D` | 0.01 | `ERP:1967-1971` |
| Bank revaluation delta | `Round(BalFCY_D / adjF) − BalLCY_D` | 0.01 | `ERP:445-449` |
| Applied LCY (same currency) | `Round(Applied / Old.origF)` | 0.01 | `GJPL:3416` |
| Unrealised reversal | `Round(ΣU × |applied / remBefore|)`, row LCY = −that | 0.01 | `GJPL:3469-3493` |
| Realised | `AppliedLCY − Round(Applied / entry.origF)` | 0.01 (difference of two rounded values) | `GJPL:3510` |
| Correction | `Round(RemFCY / adjF) − RemLCY` | 0.01 | `GJPL:3604-3612` |
| Display rate | `Round(RERA/ERA, currency precision)` | display only | `CUR:924-926` |

**Running-total example.** Three lines of USD 0.15 at 3,412.57:
- Naive per-line conversion: 511.89 × 3 = 1,535.67.
- Running totals: 511.89, then 1,023.77 − 511.89 = 511.88, then 1,535.66 − 1,023.77 = 511.89. The sum is **1,535.66** = Round(0.45 × 3,412.57). The LCY total always equals the converted FCY total.

**Equivalent rate form for the new system.** Store `rate = MNT per 1 unit` (Mongolbank form) and compute `LCY = round_half_away(FCY × rate, 0.01)`. This gives the same result as BC when factor = 1/rate. It also avoids storing ~0.000294-sized factors, where 15 decimals keep only ~12 significant digits.

---

## 6. Worked posting examples (all balance)

Rates (MNT per USD): **15 Jan 3,400** · **31 Jan 3,450** (month-end) · **10 Feb 3,420** · **28 Feb 3,430**.

### 6.1 Sales invoice INV-1, 15 Jan: USD 1,000 + VAT 100 = USD 1,100
LCY: net 3,400,000, VAT 340,000, total 3,740,000. CLE#1 Initial: +1,100 USD / +3,740,000. origF = adjF = 1/3400.

| Account | Debit | Credit |
|---|---:|---:|
| 1200 AR | 3,740,000 | |
| 5100 Revenue | | 3,400,000 |
| 2300 VAT payable | | 340,000 |

### 6.2 Revaluation, 31 Jan at 3,450
CLE#1 delta = 1,100 × 3,450 − 3,740,000 = **+55,000**. OldAdj = 0, so the row is Unrealized Gain (FCY 0 / LCY +55,000). adjF := 1/3450.

| Account | Debit | Credit |
|---|---:|---:|
| 1200 AR | 55,000 | |
| 8520 FX gain unrealised | | 55,000 |

### 6.3 Customer pays USD 1,100 into USD bank, 10 Feb at 3,420; applied to INV-1
- Payment CLE#2 Initial: −1,100 / −3,762,000.
- Applied = −1,100. AppliedLCY = Round(−1,100 × 3,400) = −3,740,000.

Detailed rows:

| Entry | Type | FCY | LCY |
|---|---|---:|---:|
| CLE#1 | Unrealized Gain (reversal, R-27: 55,000 × 1,100/1,100) | 0 | −55,000 |
| CLE#2 | Realized Gain (R-28: −3,740,000 − (−3,762,000)) | 0 | +22,000 |
| CLE#1 | Application | −1,100 | −3,740,000 |
| CLE#2 | Application | +1,100 | +3,740,000 |

Results:
- CLE#1 remaining = 0 / (3,740,000 + 55,000 − 55,000 − 3,740,000) = 0. CLE#2 remaining = 0 / 0. No correction row.
- AR G/L = −3,762,000 + 22,000 + 3,740,000 − 3,740,000 − 55,000 = **−3,795,000**.

| Account | Debit | Credit |
|---|---:|---:|
| 1112 Bank USD (USD 1,100) | 3,762,000 | |
| 8520 FX gain unrealised (reversal) | 55,000 | |
| 1200 AR | | 3,795,000 |
| 8510 FX gain realised | | 22,000 |
| **Total** | **3,817,000** | **3,817,000** |

P&L check: Jan +55,000; Feb −55,000 + 22,000 = −33,000. Total +22,000 = 1,100 × (3,420 − 3,400). ✔

### 6.4 Vendor invoice PINV-1, 15 Jan: USD 2,000 + VAT 200 = USD 2,200; revaluation; partial payment; second revaluation
**15 Jan.** VLE#5 Initial: −2,200 / −7,480,000.

| Account | Debit | Credit |
|---|---:|---:|
| 7200 Expense | 6,800,000 | |
| 1300 VAT receivable | 680,000 | |
| 2100 AP | | 7,480,000 |

**31 Jan at 3,450.** delta = −2,200 × 3,450 − (−7,480,000) = **−110,000**, so the row is Unrealized Loss.

| Account | Debit | Credit |
|---|---:|---:|
| 8525 FX loss unrealised | 110,000 | |
| 2100 AP | | 110,000 |

**10 Feb: pay USD 1,100 at 3,420 from the USD bank.**
- Payment VLE#6 Initial: +1,100 / +3,762,000.
- Applied = +1,100. AppliedLCY = +3,740,000.
- Reversal: U = Round(−110,000 × 1,100/2,200) = −55,000, so the row is Unrealized Loss with LCY **+55,000**.
- Realised on VLE#6: 3,740,000 − 3,762,000 = **−22,000**, a Realized Loss.
- Application rows: VLE#5 +1,100 / +3,740,000; VLE#6 −1,100 / −3,740,000.
- Check: VLE#5 remaining = −1,100 / (−7,480,000 − 110,000 + 55,000 + 3,740,000) = −3,795,000 = Round(−1,100 × 3,450). No correction row.
- AP G/L = 3,762,000 − 22,000 + 55,000 + 3,740,000 − 3,740,000 = **+3,795,000**.

| Account | Debit | Credit |
|---|---:|---:|
| 2100 AP | 3,795,000 | |
| 8515 FX loss realised | 22,000 | |
| 1112 Bank USD (USD 1,100) | | 3,762,000 |
| 8525 FX loss unrealised (reversal) | | 55,000 |
| **Total** | **3,817,000** | **3,817,000** |

**28 Feb at 3,430.**
- delta = −1,100 × 3,430 − (−3,795,000) = **+22,000**. OldAdj = −55,000.
- Case R-17: delta > 0 and delta ≤ −OldAdj, so the row is **Unrealized Gain**. It goes to the *gains* account, not a reversal of the losses account.
- Remaining LCY becomes −3,773,000 = −1,100 × 3,430. ✔

| Account | Debit | Credit |
|---|---:|---:|
| 2100 AP | 22,000 | |
| 8520 FX gain unrealised | | 22,000 |

### 6.5 USD bank revaluation (BC posts it to the *realised* accounts, R-22)
Opening USD 5,000 at 3,400 = 17,000,000.
- **31 Jan:** 5,000 × 3,450 − 17,000,000 = **+250,000**.
- **28 Feb:** after receiving USD 1,100 (6.3, +3,762,000) and paying USD 1,100 (6.4, −3,762,000), the balance is USD 5,000 / 17,250,000. 5,000 × 3,430 − 17,250,000 = **−100,000**.

| Date | Account | Debit | Credit |
|---|---|---:|---:|
| 31 Jan | 1112 Bank USD (FCY 0) | 250,000 | |
| | 8510 FX gain realised | | 250,000 |
| 28 Feb | 8515 FX loss realised | 100,000 | |
| | 1112 Bank USD (FCY 0) | | 100,000 |

### 6.6 Customer pays a USD invoice in MNT (same-currency rule kept)
- INV-2 on 15 Jan: USD 500 (VAT-exempt export) = 1,700,000. On 31 Jan it was revalued +25,000 (Dr 1200 / Cr 8520).
- 10 Feb: the customer transfers **MNT 1,712,500**. It is entered as a **USD** journal line (Amount −500) with Bal. Account = 1110 MNT bank, which R-11 allows. `Amount (LCY)` is overtyped to −1,712,500, so factor = 500/1,712,500 (R-07).
- Rows: CLE#3 Unrealized Gain −25,000. CLE#4 Realized Gain = −1,700,000 − (−1,712,500) = **+12,500**. Application ∓500 / ∓1,700,000.
- AR G/L = −1,712,500 + 12,500 + 1,700,000 − 1,700,000 − 25,000 = −1,725,000.

| Account | Debit | Credit |
|---|---:|---:|
| 1110 Bank MNT | 1,712,500 | |
| 8520 FX gain unrealised (reversal) | 25,000 | |
| 1200 AR | | 1,725,000 |
| 8510 FX gain realised | | 12,500 |
| **Total** | **1,737,500** | **1,737,500** |

### 6.7 Late run (R-19): 31 Jan adjustment run on 15 Feb, after 6.3 was posted without any revaluation
- 6.3 posted with no unrealised rows. Realised +22,000; AR −3,762,000 + 22,000 = −3,740,000.
- The run then posts CLE#1 Unrealized Gain +55,000 dated **31 Jan** (as of 31 Jan the item was open).
- Re-adjusting at 10 Feb gives delta = Round(0) − (0 + 55,000) = −55,000. OldAdj = +55,000 and |delta| ≤ OldAdj, so the row is **Unrealized Loss** −55,000 dated **10 Feb**.

| Date | Account | Debit | Credit |
|---|---|---:|---:|
| 31 Jan | 1200 AR | 55,000 | |
| | 8520 FX gain unrealised | | 55,000 |
| 10 Feb | 8525 FX loss unrealised | 55,000 | |
| | 1200 AR | | 55,000 |

AR as of 31 Jan = 3,795,000 and as of 10 Feb = 0. Both are correct point-in-time values. Note that the reversal account differs from 6.3, where the reversal hit 8520.

---

## 7. Simplifications for the micro-business system

1. **Rates.**
   - Table: `currency_rate(currency, rate_date, mnt_per_unit NUMERIC(18,6), source {MONGOLBANK_AUTO, MANUAL, IMPORT}, fetched_at, entered_by)`, with PK (currency, rate_date). Lookup = latest `rate_date ≤ D`. Error if missing; never default to 1.
   - Drop the relational currency, the fix type and the separate adjustment rate: revaluation uses the same official rate on the revaluation date.
   - Optional per-document override (`rate_overridden = true`) records the actual bank rate.
   - The fetcher is a daily job calling the Mongolbank endpoint, with manual entry as fallback (`mn-integrations-market.md` §4, I-09). Weekend dates carry the last rate forward through the "≤ D" lookup.
2. **Store rates, not factors.**
   - Documents and journal lines: `currency`, `rate`, `amount_fcy`, `amount_lcy`.
   - Party ledger entries: `orig_rate`, `adj_rate`.
   - G/L entries keep `source_currency` and `source_amount` (REQ-ACC-03), for audit and for v1.1 G/L revaluation.
3. **One conversion function** `to_lcy(fcy, rate) = round_half_away(fcy × rate, lcy_precision)`, plus a running-total helper for documents (R-09). It is the only path to LCY.
4. **Revaluation job** (month-end close step, REQ-ACC-20):
   - Inputs: as-of date D (= posting date), doc no., preview flag. No start date (avoids the R-15 pitfall).
   - Scope: open AR/AP items as of D (as-of SQL sums) **plus** items closed after D (R-19), and FCY bank/cash accounts.
   - Output: one detailed row per item, one balanced G/L transaction per currency, and `fx_reval_run` and `fx_reval_line` tables (T86/T186 equivalent).
   - Guard: block FCY postings dated ≤ the last revaluation date of that currency unless the user reverses and re-runs the revaluation. This makes R-19 rare, but keep the logic anyway.
5. **Gain/loss accounts are global** (G/L Setup): realised and unrealised, each with gain and loss. A per-currency override is SKIP. The cheapest fix for the account asymmetry in R-17 and §6.7 is **one net unrealised account** (8520/8525 merged). The statement line is a single "ханшийн зөрүүний олз (гарз)" anyway.
6. **Application:**
   - Same currency only (R-25).
   - "MNT received for a USD invoice" is a USD payment line with an overtyped LCY (§6.6).
   - Keep R-26 to R-30a exactly, including the reversal on the applying entry (added-in-verification). Realised against **original** rates is what lets tax reports separate realised from unrealised.
   - Drop the appln-rounding and cross-currency branches.
7. **Unapply** mirrors all FX rows, then re-revalues reopened items at their `adj_rate` (R-32).
8. **Skip:** ACY and G/L/VAT exchange adjustment, residual accounts, EMU, payment tolerance, employee ledgers, dimension-posting options (always copy the item's dims), the "adjust per entry" G/L option, the Data Exchange framework, and `Conv. LCY Rndg.` accounts. Instead, auto-insert an "FX rounding" line when an FCY journal balances in FCY but not in LCY.
9. **Precision:** per-currency `amount_precision` (USD 0.01, JPY/KRW 1) and `unit_precision`. LCY (MNT) precision is 0.01, with an optional cash invoice rounding to 1 MNT (R-13).

---

## 8. Pitfalls / edge cases the new implementation must not miss

- **Direction of the factor.** BC's factor is FCY per LCY, and LCY = FCY / factor. Mongolbank publishes MNT per FCY. Mixing them up multiplies amounts by about 11.6 million.
- **Rate on the posting date, not the document date or today.** Re-derive the rate whenever the posting date changes before posting (R-06). Freeze it after posting. Use one rate per document; never mix rates per line.
- **No fallback rate.** A missing rate must block posting (R-01). `GetExchangeRate`'s "return 1" (`CUR:919-926`) is a UI helper only.
- **Point-in-time revaluation.** Use remaining balances *as of D*, not current balances. Include items paid after D (R-15/R-19). Otherwise AR/AP as of D is wrong whenever the run is late.
- **Unrealised reversal ignores dates.** It nets *all* unrealised rows of the item (R-27). A payment backdated before an already-posted revaluation reverses that revaluation on the earlier date. Block it with the guard in §7.4.
- **Proportional reversal rounding.** Partial applications round U each time. The Correction of Remaining Amount row (R-30) keeps the invariant "FCY 0 ⇒ LCY 0". Without it, closed items keep MNT residues on AR/AP.
- **Revaluation rows are FCY 0.** They change only the LCY and must never touch the FCY remaining. `Amount (LCY)` of an entry includes FX rows. Reports that need "original MNT" must use the Initial-Entry sum (`CLE:159-172`).
- **Gain vs loss by delta sign.** A revaluation delta that partly or fully reverses a prior unrealised amount is booked to the *opposite* account: reversing a prior gain goes to the *loss* account (§6.7), and reversing a prior loss goes to the *gain* account (§6.4, 28 Feb) (verified-corrected). The application reversal (R-27) behaves differently and reverses on the same account. Merge the accounts or accept per-account non-zero balances.
- **Bank revaluation is cumulative and never reversed.** It uses `Balance at Date` with an upper limit only, so the run's Start Date is irrelevant. An LCY bank can take FCY lines, but an FCY bank cannot take other currencies (R-11).
- **Advances.** BC revalues *every* open FCY customer/vendor entry, including unapplied prepayments. Under IAS 21, advances settled in goods or services are non-monetary and should **not** be revalued (§9 Q5).
- **VAT stays in MNT.** It is fixed at the invoice rate. W1 adjusts VAT only with ACY (R-23). eBarimt receipts must use the MNT amounts from the invoice date.
- **Running totals per document** (R-09). Per-line rounding breaks the rule "AR = revenue + VAT" by a few мөнгө.
- **FCY journals.** BC enforces the FCY balance only for single-currency groups (R-12); mixed-currency groups are checked in LCY only. A group that balances in every currency but not in LCY needs a conversion-rounding line (verified-corrected). For the new system, check both LCY and per-currency balance explicitly, so that it does not inherit BC's loophole.
- **Concurrency.** Lock the party detailed rows (or use `SELECT … FOR UPDATE` on the items) during revaluation and application. BC locks the tables (`ERP:644-657`).
- **Order inside an application** (R-26). The reversal must be computed from the remaining amount *before* the application. Realised uses AppliedLCY at the *old* entry's original rate.
- **Unapply** must restore LCY at the entry's last `adj_rate`, not today's rate (R-32).
- **A currency in use** cannot be deleted in BC (R-33). BC does **not** stop its precision being changed (R-34), so the new system should add that block itself (verified-corrected). Deactivate the currency instead of deleting it.

---

## 9. Open questions

1. **CIT treatment.** Are unrealised FX gains taxable, and are unrealised losses deductible, under the 2019 CIT law? The answer decides whether the bank revaluation should go to the *unrealised* accounts (recommended default) rather than BC's realised accounts (R-22), and whether a tax-adjustment report must exclude 8520/8525.
2. **Which Mongolbank rate.** Should a transaction use the same-day or the previous-day rate, given publication around 10:00–13:00 UB? How are weekends and holidays handled? Can a different (bank) rate be used for settlement, as in §6.6 with the difference realised, or must even the settlement use the official rate, with the bank difference booked separately?
3. **Revaluation frequency** for micro entities: monthly, quarterly or year-end only? Is a date-ordered, non-reversing revaluation (BC) acceptable to auditors, or do they expect auto-reversing month-end entries?
4. **FCY cash on hand and FCY loans.** Should they be modelled as bank accounts (R-22) or as G/L accounts with source-currency revaluation (R-24, v1.1)?
5. **Advances** (урьдчилгаа) in FCY: exclude them from revaluation (IAS 21 non-monetary) by flagging prepayment documents? BC does not distinguish them.
6. **Cross-currency settlement** (for example a USD invoice settled partly in CNY) is out of v1 scope. Confirm that no target customer needs it.
7. **Decimals.** Mongolbank publishes 2 decimals. Is 6 decimals of storage enough for low-value currencies (KRW, JPY, quoted per 1 unit) to keep conversions stable?

---

## Verification log

The source was re-read in BCApps (W1 Base App). Path aliases are as in the header table; `GLE` = `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al`, `GJPB` = `BA/Finance/GeneralLedger/Posting/GenJnlPostBatch.Codeunit.al`, `AGJB` = `BA/Finance/GeneralLedger/Journal/AdjustGenJournalBalance.Codeunit.al`, `BAT` = `BA/Bank/BankAccount/BankAccount.Table.al`, `ENUM379` = `BA/Finance/ReceivablesPayables/DetailedCVLedgerEntryType.Enum.al`. Every worked example was recomputed line by line: debits = credits, the rows follow the cited formulas, and the P&L totals equal FCY × (settlement rate − invoice rate).

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| Factor = ERA / RERA (FCY per 1 LCY); LCY = FCY / factor | confirmed | `CER:293`, `CER:219` |
| Rate = last row with Starting Date ≤ D; blank date = WorkDate; FindLast errors; cache keyed on (currency, date) (R-01) | confirmed | `CER:349-369` |
| `Currency.GetExchangeRate` falls back to the latest row or returns 1 | corrected (it also returns 100 for the blank LCY code) | `CUR:911-927` |
| Fix = Both ignores the document factor and uses the table rate (R-03) | confirmed | `CER:215-219` |
| `Round()` without a precision uses G/L Setup `Amount Rounding Precision` | confirmed | `BA/Finance/Currency/AmountAutoFormat.Codeunit.al:55-59` |
| Document factor comes from the rate at Posting Date (else WorkDate), with confirmation; a missing rate gives a notification (R-06) | confirmed | `SH:675-681`, `SH:4746-4799` |
| Overtyping `Amount (LCY)` sets factor := Amount / Amount (LCY); Fix = Both recomputes Amount instead (R-07) | confirmed | `GJL:648-662`, `GJL:5039-5064` |
| Posting checks that Amount and Amount (LCY) are rounded (R-08) | confirmed | `GJPL:448-459`; `GJL:5107-5119` |
| Running-total LCY conversion of document lines (R-09) and the 3 × USD 0.15 example (1,535.66) | confirmed | `SP:3506-3552` |
| Invoice-rounding formula (R-13) | confirmed | `SP:3598-3603`; `CUR:966-976` |
| C/V entry Original = Adjusted factor at posting; FCY line needs a factor (R-10) | confirmed | `GJPL:1314-1319` |
| Bank currency rule: an LCY bank accepts FCY lines, an FCY bank only its own currency (R-11) | confirmed | `GJPL:1587-1592`, `GJPL:1608-1613` |
| "A journal with FCY lines must balance in that currency" (R-12) | corrected (single-currency groups only; mixed groups are LCY-only; self-balancing lines are ignored) | `GJPB:405-413`, `GJPB:577-591`, `GJPB:1197-1217`; `AGJB:23-157` |
| "The G/L stores only LCY" (§1) | corrected (G/L entries also carry Source Currency Code/Amount) | `GLE:150-172`; `GJPL:425-447` |
| Run date checks; Last Date Adjusted := Posting Date (R-14) | confirmed | `ERP:213-222`, `ERP:1896-1902`; `ERA:269-272`, `ERA:430-436` |
| Adjustment factor uses the *adjustment* rate fields | added-in-verification | `ERP:219`; `CER:317-327` |
| Item selection: open items ≤ End Date, plus items in [Start, End] with rows after End Date (R-15) | confirmed | `ERP:1302-1352` |
| Delta as of Posting Date, including this run's temp rows; Adjusted factor updated even when delta = 0 (R-16) | confirmed | `ERP:1931-1981` |
| Gain/loss type by delta sign; split at −OldAdj with both rows of the delta's type; OldAdj has no date filter (R-17) | confirmed | `ERP:1996-2093`, `ERP:2749-2755` |
| Adjustment row: FCY 0, inherits due date and global dims (R-18) | confirmed | `ERP:2667-2685` |
| Late-run re-adjustment at each later detailed-row date with the same factor (R-19) | confirmed | `ERP:616-631`, `ERP:659-666` |
| G/L: control account +Σdelta; gains and losses posted separately, not netted; System-Created, no posting groups (R-20) | confirmed | `ERP:797-830`, `ERP:1129-1196` |
| Customer and vendor algorithms are identical (R-21) | confirmed | `ERP:2110-2296` |
| Bank revaluation goes to the **realised** gain/loss accounts; one register row per bank posting group (R-22) | confirmed | `ERP:441-485`, `ERP:841-879` |
| Bank balance is taken as of End Date, while C/V items are measured as of Posting Date | added-in-verification | `ERP:228`, `ERP:1931`; `BAT:600-624`; `ERA:99-107` |
| Source-currency G/L revaluation creates journal lines against unrealised/realised accounts; conflict check with control accounts (R-24) | confirmed | `GLREV:166-232`; `ERP:832-839` |
| Same-currency only when `Appln. between Currencies` = None (R-25) | confirmed | `BA/Finance/ReceivablesPayables/GenJnlApply.Codeunit.al:290-304`; `BA/Sales/Setup/SalesReceivablesSetup.Table.al:260-265` |
| Per-pair order: FindAmt → unrealised(Old) → realised(New) → realised(Old) → application → correction(Old) (R-26) | confirmed | `GJPL:5921-5945` |
| AppliedAmountLCY = Round(Applied / Old.OriginalFactor) | confirmed | `GJPL:3415-3417` |
| Unrealised reversal: Round(ΣU × \|applied / remBefore\|), row = −U, same type as the net prior amount (R-27) | confirmed | `GJPL:3449-3494`, `GJPL:5882`; `DCLE:529-536` |
| Realised = AppliedLCY − Round(Applied / entry.OriginalFactor); Old's R = 0 in the same-currency case (R-28) | confirmed | `GJPL:3496-3522`, `GJPL:5932-5936` |
| Application rows: Old (OldApplied, AppliedLCY), New (−Applied, −AppliedLCY) (R-29) | confirmed | `GJPL:3541-3578` |
| Correction of Remaining Amount on Old → posting group Debit/Credit Rounding account (R-30) | confirmed | `GJPL:3591-3615`, `GJPL:4270-4271`, `GJPL:5511-5518` |
| Unrealised reversal and correction on the **applying (new)** entry after all pairs | added-in-verification (R-30a) | `GJPL:3789`, `GJPL:3864-3873`, `GJPL:4550-4559` |
| Control account = Σ LCY of all detailed rows; each gain/loss row posts −LCY to `GetGainLossAccount`; accounts are mandatory (R-31) | confirmed | `GJPL:4166-4171`, `GJPL:7752-7776`, `GJPL:5441-5452`, `GJPL:4255-4258`; `CUR:995-1108` |
| Unapply mirrors rows with Entry Type > Initial, then re-adjusts at each entry's own Adjusted factor (R-32) | confirmed | `GJPL:6017-6026`; `CEAPE:438-440`; `ERP:2483-2515`, `ERP:2596-2603`, `ERP:2645-2658` |
| "Applying already-posted entries also triggers re-adjustment" (§4.3) | refuted (unapply only) | `CEAPE:91-209` (no call), `CEAPE:357-440` |
| Currency delete blocked by open C/V/employee entries; deleting it deletes its rates (R-33) | confirmed | `CUR:796-819` |
| "A new currency inherits its precisions from G/L Setup" (R-34) | refuted (new rows get InitValues 0.01 / 0.00001 / 0.01; G/L Setup is read only for the blank LCY code) | `CUR:193`, `CUR:224`, `CUR:247`, `CUR:886-903`, `CUR:1248-1256` |
| "A currency in use cannot have its precision changed" (§8) | refuted (no such check in BC) | `CUR:229-236` |
| Invoice precision must be a multiple of the amount precision; changing the amount precision re-rounds it (R-34) | confirmed | `CUR:195-202`, `CUR:229-236` |
| Rate service: consent + URL + mapping, daily job queue; JSON→XML; defaults Today / 1 / adjustment = normal / Fix = Currency; HTTP errors in the Activity Log (R-35) | confirmed | `CERUS:72-95`, `CERUS:288-309`; `UCER:99-109`, `UCER:154-166`; `MAP:78-112` |
| `Amount (LCY)` FlowField includes FX rows (all except Application / Appln. Rounding) | confirmed | `DCLE:520-521`; `CLE:181-194` |
| Enum 379 values 3/4/5/6/10/11 | confirmed | `ENUM379:36-68` |
| Pitfall "partial reversals of a prior gain go to the loss account (§6.4)" | corrected (§6.4 shows the mirror case: reversing a loss goes to the gain account) | `ERP:1996-2048`; §6.4 |
| Adjustment buffer grouping keys | corrected (IC Partner Code also a key; T383 only maps transaction no.) | `ERP:1082-1127`, `ERP:1129-1150`, `ERP:1239-1256` |
| §6.1 invoice: 3,740,000 = 3,400,000 + 340,000 | confirmed (balanced) | `SP:3506-3552` |
| §6.2 revaluation +55,000, Unrealized Gain | confirmed (balanced) | `ERP:1967-1971`, `ERP:2077-2093` |
| §6.3 payment: rows −55,000 / +22,000 / ∓3,740,000; AR −3,795,000; totals 3,817,000 = 3,817,000; P&L +22,000 | confirmed | `GJPL:3415-3565` |
| §6.4 vendor: −110,000; partial payment reversal +55,000, realised −22,000, remaining −3,795,000; totals 3,817,000; 28 Feb +22,000 Unrealized Gain | confirmed | `ERP:2110-2296`; `GJPL:3449-3522` |
| §6.5 bank +250,000 / −100,000 to the realised accounts | confirmed | `ERP:441-449`, `ERP:868-874` |
| §6.6 MNT-for-USD: factor 500/1,712,500, realised +12,500, totals 1,737,500 = 1,737,500 | confirmed | `GJL:648-662`; `GJPL:1608-1613`, `GJPL:3510` |
| §6.7 late run: +55,000 at 31 Jan, then Unrealized Loss −55,000 at 10 Feb | confirmed | `ERP:623-631`, `ERP:1954-1966`, `ERP:1996-2012` |
