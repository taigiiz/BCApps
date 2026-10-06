# BC research: bank accounts, cash, payment journals, statement import and reconciliation

- Source: BCApps (BC v29, W1 Base App + `SimplifiedBankStatementImport` app, MIT). Every rule below was read from the AL code.
- Keep levels: **MUST** = micro-ERP v1, **SHOULD** = simpler form or soon after v1, **SKIP** = leave out.
- Accounts follow the illustrative chart in `mn-accounting.md`: 1100 Cash (касс), 1110 Bank MNT, 1111 Bank USD, 1200 AR, 1300 VAT receivable, 2100 AP, 2300 VAT payable, 5100 Revenue, 7200 G&A expenses, 8200 Other income, 8300 Finance costs, 8500 FX gain/loss. LCY = MNT, VAT = 10%. Banking services are VAT-exempt (`mn-tax.md` §1).
- **Path aliases** (`BA/` = `src/Layers/W1/BaseApp/`; every path is repo-relative):

| Alias | File |
|---|---|
| `BANK` | `BA/Bank/BankAccount/BankAccount.Table.al` |
| `BAPG` | `BA/Bank/BankAccount/BankAccountPostingGroup.Table.al` |
| `BLE` | `BA/Bank/Ledger/BankAccountLedgerEntry.Table.al` |
| `GJPL` | `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al` |
| `GJL` | `BA/Finance/GeneralLedger/Journal/GenJournalLine.Table.al` |
| `REC` / `RECL` | `BA/Bank/Reconciliation/BankAccReconciliation.Table.al` / `…/BankAccReconciliationLine.Table.al` |
| `RPOST` | `BA/Bank/Reconciliation/BankAccReconciliationPost.Codeunit.al` |
| `SETNO` | `BA/Bank/Reconciliation/BankAccEntrySetReconNo.Codeunit.al` |
| `MBRL` | `BA/Bank/Reconciliation/MatchBankRecLines.Codeunit.al` |
| `MBE` | `BA/Bank/Reconciliation/MatchBankEntries.Report.al` |
| `RMM` | `BA/Bank/Reconciliation/RecordMatchMgt.Codeunit.al` |
| `MBP` | `BA/Bank/Reconciliation/MatchBankPayments.Codeunit.al` |
| `RULE` | `BA/Bank/Reconciliation/BankPmtApplRule.Table.al` |
| `APE` | `BA/Bank/Reconciliation/AppliedPaymentEntry.Table.al` |
| `LEMB` | `BA/Bank/Reconciliation/LedgerEntryMatchingBuffer.Table.al` |
| `TBR` | `BA/Bank/Reconciliation/TransBankRectoGenJnl.Report.al` |
| `PBARL` | `BA/Bank/Reconciliation/ProcessBankAccRecLines.Codeunit.al` |
| `PDE` | `BA/System/DataExchange/ProcessDataExch.Codeunit.al` |
| `IBS` | `BA/Bank/Statement/ImportBankStatement.Codeunit.al` |
| `UNDO` | `BA/Bank/Statement/UndoBankStatementYesNo.Codeunit.al` |
| `PRM` / `PRB` | `BA/Bank/Payment/PaymentRegistrationMgt.Codeunit.al` / `…/PaymentRegistrationBuffer.Table.al` |
| `SVP` | `BA/Purchases/Payables/SuggestVendorPayments.Report.al` |
| `PJ` | `BA/Finance/GeneralLedger/Journal/PaymentJournal.Page.al` |
| `XRA` | `BA/Finance/Currency/ExchRateAdjmtProcess.Codeunit.al` |
| `REV` / `GJPR` | `BA/Finance/GeneralLedger/Reversal/ReversalEntry.Table.al` / `…/GenJnlPostReverse.Codeunit.al` |
| `MOVE` | `BA/Utilities/MoveEntries.Codeunit.al` |
| `SH` / `SPI` | `BA/Sales/Document/SalesHeader.Table.al` / `BA/Sales/Posting/SalesPostInvoice.Codeunit.al` |
| `WIZ` | `src/Apps/W1/SimplifiedBankStatementImport/App/src/pages/BankStatementFileWizard.Page.al` |
| `DEMO` | `src/Apps/W1/ContosoCoffeeDemoDataset/app/DemoData/Bank/1.Setup Data/CreateBankAccPostingGrp.Codeunit.al` |

---

## 1. Summary

- **Bank account = money sub-ledger.** Every posting to a bank account writes one **Bank Account Ledger Entry** (BLE, T271) and one G/L entry on the G/L account of the bank's **posting group**, for the same `Amount (LCY)` (`GJPL:1567-1710`). Balances are sums over BLEs (`BANK:445-500`).
- **Cash is not a separate module in W1.** Cash boxes are bank accounts whose posting group points to the cash G/L account (`DEMO:21`). (added-in-verification) The CZ localization adds a Cash Desk module (cash receipt/withdrawal documents with min/max balance checks) on top of Bank Account; see F7 step 4. Payment methods with a balancing account post the receipt together with the invoice (`SH:2066-2067`, `SPI:662-707`).
- **Payments and receipts** are general journal lines (Payment Journal, Cash Receipt Journal, Payment Registration, Payment Reconciliation Journal). All of them end in `GenJnlPostLine`. A customer or vendor line with `Bal. Account = Bank` posts the CV entry, the BLE and two G/L entries.
- **Each BLE has two independent states.** `Open/Remaining Amount` tracks reconciliation with the bank. `Statement Status` (Open → Applied → Closed) plus `Statement No./Line No.` shows which statement line it is matched to (`BLE:182-297`).
- **Bank reconciliation** (T273 with type *Bank Reconciliation*) matches imported or suggested statement lines to open BLEs, 1:1, 1:n or n:1. Posting needs Σ lines = Ending − Last balance and every line fully matched. It closes the BLEs and stores a **Bank Account Statement** (`RPOST:179-275`).
- **Payment reconciliation journal** (T273 with type *Payment Application*): import → automatic matching to open **customer/vendor/employee entries, open BLEs and text-to-account rules** → review by confidence → post. Posting creates the payments, applies them and (optionally) closes the BLEs at the same time (`RPOST:471-634`).
- **Automatic matching** scores three signals (related party, document no., amount within tolerance) against a rule table. Score = 1000×(confidence+1) − priority. Confidence is High/Medium/Low, and Text-to-Account mapping ranks between Medium and High (`RULE:195-319`, `MBP:1009-1107`).
- **Statement import** uses the Data Exchange framework: column mapping, date/decimal format + culture, multiplier, negative-sign column. Duplicates are skipped by `Transaction ID` (`PDE:60-240`, `RECL:1411-1499`). The Simplified import wizard detects a CSV layout by itself (`WIZ:906-1334`).
- **Suggest Vendor Payments** fills a payment journal from open vendor entries due by a date. It skips blocked, on-hold, already-applied and net-debit vendors, and can cap the total amount (`SVP:27-858`).
- **FCY bank accounts** are revalued: a BLE with `Amount = 0`, `Amount (LCY) = adjustment` is created and closed at once (`XRA:431-475`, `XRA:841-876`).

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| Bank account | Table 270 `Bank Account` | Bank or cash box master | `No.` Code20; `Name` Text100; `Bank Account No.` Text30; `IBAN` Code50; `Currency Code` Code10 (blank = LCY); `Bank Acc. Posting Group` Code20; `Blocked` Bool; `Last Statement No.` Code20; `Balance Last Statement` Dec; `Last Payment Statement No.` Code20; `Pmt. Rec. No. Series`; `Bank Statement Import Format` Code20; `Match Tolerance Type` {Percentage, Amount}, `Match Tolerance Value` Dec(0:5); `Disable Automatic Pmt Matching` Bool; `Min. Balance` Dec; FlowFields `Balance`, `Balance (LCY)`, `Net Change(+LCY)`, `Balance at Date(+LCY)`, `Debit/Credit Amount(+LCY)`; FlowFilters `Date Filter`, `Global Dim 1/2 Filter` | MUST (+ `type` BANK/CASH; drop SEPA, check, positive-pay, online-bank fields) |
| Bank posting group | Table 277 | Bank → G/L account | `Code` Code20; `G/L Account No.` Code20 | SHOULD (v1: G/L account directly on the bank account) |
| Bank ledger entry | Table 271 | Money movement per bank | `Entry No.` Int; `Bank Account No.`; `Posting Date`, `Document Date`; `Document Type` Enum; `Document No.` Code20; `External Document No.` Code35; `Description` Text100; `Currency Code`; `Amount`, `Remaining Amount`, `Amount (LCY)` Dec; `Debit/Credit Amount(+LCY)`; `Open`, `Positive` Bool; `Closed by Entry No.` Int; `Closed at Date`; `Statement Status` {Open, Bank Acc. Entry Applied, Check Entry Applied, Closed}; `Statement No.` Code20; `Statement Line No.` Int; `Bal. Account Type/No.`; `Transaction No.`; `Reversed`, `Reversed (by) Entry No.`; `Dimension Set ID`; `Source Code`, `User ID` | MUST |
| Reconciliation header | Table 273 `Bank Acc. Reconciliation` | Statement worksheet; PK (`Statement Type`, `Bank Account No.`, `Statement No.`) | `Statement Type` {Bank Reconciliation, Payment Application}; `Statement Date`; `Statement Ending Balance`; `Balance Last Statement`; `Post Payments Only` Bool; `Import Posted Transactions` {" ",Yes,No}; `Allow Duplicated Transactions` Bool; `Copy VAT Setup to Jnl. Line` Bool (InitValue true); sums of lines; `Total Outstd Bank Transactions/Payments` | MUST (one statement type) |
| Reconciliation line | Table 274 | One bank transaction | `Statement Line No.` Int; `Transaction Date`, `Value Date`; `Statement Amount`, `Applied Amount`, `Difference` Dec; `Applied Entries` Int; `Description` Text100; `Transaction Text` Text140; `Additional Transaction Info` Text100; `Related-Party Name` Text250, `…Bank Acc. No.` Text100, `…Address`, `…City`; `Payment Reference No.` Code50; `Transaction ID` Text50; `Account Type/No.`; `Parent Line No.`; FlowFields `Match Confidence`, `Match Quality` | MUST |
| Applied payment entry | Table 1294 | Line → ledger-entry application (payment rec) | `Statement Line No.`; `Account Type/No.`; `Applies-to Entry No.` (0 = no entry, post on account); `Applied Amount`; `Applied Pmt. Discount`; `Quality` Int; `Match Confidence` Enum | MUST (as `statement_match`) |
| n:1 match buffer | Table 2711 `Bank Acc. Rec. Match Buffer` | Several lines ↔ one BLE | `Ledger Entry No.`, `Statement Line No.`, `Match ID`, `Is Processed` | SHOULD (generic match group) |
| Posted statement | Tables 275/276 `Bank Account Statement(+Line)` | Snapshot of a posted bank reconciliation | header fields + `G/L Balance at Posting Date`, `Outstd. Payments/Transact. at Posting` | MUST |
| Posted payment rec | Tables 1295/1296 | Snapshot of posted payment rec | lines + `Applied Document No.`, `Applied Entry No.`, `Reconciled` Bool, `Transaction ID` | MUST (merge with 275/276) |
| Matching rules | Table 1252 `Bank Pmt. Appl. Rule` | Scoring table | `Match Confidence` {None,Low,Medium,High}; `Priority`; `Related Party Matched` {Not Considered, Fully, Partially, No}; `Doc. No./Ext. Doc. No. Matched` {Not Considered, Yes, No, Yes - Multiple}; `Amount Incl. Tolerance Matched` {Not Considered, One Match, Multiple Matches, No Matches}; `Score`; `Review Required`; `Apply Immediatelly` | SHOULD (hard-coded) |
| Matching settings | Table 1253 | Toggles | CV/bank/employee matching on/off; `RelatedParty Name Matching` {String Nearness, Exact Match with Permutations, Disabled} | SKIP |
| Text-to-Account mapping | Table 1251 | "text in statement → account" rules | `Mapping Text` Text250; `Debit Acc. No.`, `Credit Acc. No.`; `Bal. Source Type` {G/L, Customer, Vendor, Bank}; `Bal. Source No.` | MUST |
| Data exchange def. | Tables 1221-1225 and 1227 (`Data Exch. Field` 1221, `…Def` 1222, `…Column Def` 1223, `…Mapping` 1224, `…Field Mapping` 1225, `…Line Def` 1227) + `Bank Export/Import Setup` (1200) (verified-corrected) | File layout | header lines, separator, encoding; column no., data type, `Data Format`, `Data Formatting Culture`, `Negative-Sign Identifier`; field mapping with `Multiplier` (InitValue 1), `Optional` | MUST (as `bank_import_profile` JSON) |
| Payment registration | Tables 980/981 + CU980 | One-screen "mark invoice paid" | `Bal. Account Type` {G/L, Bank}; `Bal. Account No.`; buffer: `Amount Received`, `Date Received`, `Payment Made`, `Rem. Amt. after Discount` | MUST (as "Receive payment") |
| Payment journal | Page 256 on T81 `Gen. Journal Line` | Batch of vendor payments | `Account Type/No.`, `Amount`, `Bal. Account`, `Applies-to Doc./ID` | MUST |
| Check ledger entry | Table 272 | Printed checks | — | SKIP (checks are rare in MN) |

---

## 3. Business rules

| ID | Rule | Source | Keep | Notes |
|---|---|---|---|---|
| R-BANK-CASH-01 | `Currency Code` can change only when `Balance` and `Balance (LCY)` are 0 and no BLE is open. Switching between blank and the LCY code is always allowed. | `BANK:255-289` | MUST | Protects historical BLE amounts from being reinterpreted in another currency. |
| R-BANK-CASH-02 | Posting needs: bank not `Blocked`, a posting group, and a G/L account on it. | `GJPL:1584`, `GJPL:1596-1598`, `GJPL:1697`; `BAPG:38-48` | MUST | Use one G/L account per money account, so subledger = G/L. |
| R-BANK-CASH-03 | Currency compatibility: a line without currency needs an LCY bank. If the bank is FCY, the line currency must equal it. An LCY bank may take an FCY line and stores the LCY amount. | `GJPL:1588-1592`, `GJPL:1609-1612`; `GJL:532-540`, `GJL:8040-8048` | MUST | |
| R-BANK-CASH-04 | BLE amounts: `Amount` = line `Amount` (FCY bank) or `Amount (LCY)` (LCY bank); `Amount (LCY)` always from the line; `Remaining Amount = Amount`; `Positive = Amount > 0`; `Open = Amount ≠ 0`. A zero-amount entry is created closed (`Statement Status = Closed`, `Closed at Date = Posting Date`). | `GJPL:1609-1621` | MUST | Zero-FCY entries (FX revaluation) never reach reconciliation. |
| R-BANK-CASH-05 | Debit/Credit split: `Amount > 0 XOR Correction` → debit, otherwise credit (storno keeps the sign but flips the column). | `BLE:630-649` | SHOULD | |
| R-BANK-CASH-06 | One G/L entry on the posting-group account for `Amount (LCY)`, in the same transaction as the BLE. | `GJPL:1700-1704` | MUST | Invariant: Σ BLE `Amount (LCY)` per G/L account = G/L balance. (added-in-verification) BC does not enforce this invariant: `BAPG:69-77` → `GLAccount.CheckGLAcc` only tests `Account Type = Posting` and `Blocked = false`, so a direct G/L journal line to the bank G/L account breaks it. The new system must forbid direct postings to a money account's G/L account. |
| R-BANK-CASH-07 | `Balance` = Σ `Amount`; `Balance (LCY)` = Σ `Amount (LCY)`; `Net Change` filtered by `Date Filter`; `Balance at Date` = Σ up to the upper bound of `Date Filter`. | `BANK:445-500`, `BANK:600-627` | MUST | SQL sums, no stored balance. |
| R-BANK-CASH-08 | `Min. Balance` is display-only and never enforced. | `BANK:236-242` (used only on pages/reports) | SHOULD | Add a real "no negative cash" check. |
| R-BANK-CASH-09 | A bank account cannot be deleted while it has entries in open fiscal periods or any open BLE. | `MOVE:238-257` | MUST | Prefer `Blocked`. |
| R-BANK-CASH-10 | Statement numbers: bank rec = `IncStr(Last Statement No.)` (seeded with '0'); payment rec = No. series or `IncStr(Last Payment Statement No.)`. **Inserting** a worksheet writes the number back to the bank. A number that already exists as a posted statement is rejected. Rename is forbidden. | `REC:52-71`, `REC:461-470`, `REC:495-525`, `REC:905-927`; `BANK:378-382` | MUST | Use a gap-tolerant sequence per bank. |
| R-BANK-CASH-11 | `Balance Last Statement` is copied from the bank. Changing it asks for confirmation. | `REC:70`, `REC:116-133` | MUST | Opening balance of the next statement. |
| R-BANK-CASH-12 | Matching a BLE to a line needs: `Open`, empty `Statement No./Line No.`, same bank, status not `Closed`. It sets `Statement Status = Bank Acc. Entry Applied` and stores Statement No./Line No. Unmatching resets them. | `SETNO:294-322`, `SETNO:365-378` | MUST | Prevents one BLE from being on two statements. |
| R-BANK-CASH-13 | Cardinality: 1:1, 1:n (one line, several BLEs), n:1 (several lines, one BLE; the last line gets `BLE.Remaining − Σ previous`; BLE `Statement Line No. = −1`). Many-to-many is rejected. | `SETNO:57-151`; `MBRL:72-88` | SHOULD | v1: a "match group" with sum equality. |
| R-BANK-CASH-14 | Line `Applied Amount` += BLE `Remaining Amount`; `Difference = Statement − Applied`. Editing `Statement Amount` removes the application. | `SETNO:76-90`; `RECL:107-153`, `RECL:468-479` | MUST | |
| R-BANK-CASH-15 | Bank-rec post preconditions: `Statement Date` filled; Σ line `Statement Amount` = `Ending − Balance Last Statement`; per line `Applied Amount` = Σ Remaining of its BLEs; Σ applied = Σ statement; Σ `Difference` = 0. | `RPOST:134-135`, `RPOST:360-373`, `RPOST:238`, `RPOST:248-253` | MUST | The statement must be complete and fully explained before posting. |
| R-BANK-CASH-16 | Bank-rec post effects: each BLE gets `Remaining = 0`, `Open = false`, `Closed at Date = Statement Date`, `Statement Status = Closed`, `Statement No. = posted no.`. Bank gets `Last Statement No.` and `Balance Last Statement = worksheet's Balance Last Statement + Σ lines` (the worksheet value, which the user may have overridden per R-11, not the bank's stored value; `RPOST:648`) (verified-corrected). A `Bank Account Statement` is written with a G/L balance snapshot, then the worksheet is deleted. | `RPOST:425-469`, `RPOST:636-650`, `RPOST:652-694`, `RPOST:291-342` | MUST | |
| R-BANK-CASH-17 | If the statement no. already exists as a posted statement, posting takes the next number. | `RPOST:696-706`, `RPOST:903-915` | SHOULD | (added-in-verification) The check is always against `Bank Account Statement` (T275), for **both** statement types, and the replacement number is `IncStr(Bank."Last Statement No.")` (or '1'). A payment-rec worksheet numbered from `Last Payment Statement No.` therefore collides with bank-rec numbers and is silently renumbered from the bank-rec sequence. That posted number is also the `Document No.` of every payment the journal posts (`RPOST:522`). |
| R-BANK-CASH-18 | Unexplained lines (fees, interest) go through "Transfer to General Journal". Only lines with `Difference ≠ 0` are transferred, with `Posting Date = Transaction Date`. If the target batch has no balancing account, or its balancing account is this bank, the line gets `Bal. Account = bank` and `Amount = −Difference`. Otherwise it gets the batch's balancing account and `Amount = +Difference` (verified-corrected). `Account No.` is left for the user to fill. The line is linked to the statement line by `Linked System ID`, except when that line is in an n:1 group. When the line is posted, the new BLE auto-matches if its `Amount` = line `Statement Amount` or `Difference`, and otherwise falls back to `Open`. | `TBR:34-87`; `BLE:540-542`, `BLE:561-628` | MUST | v1: "Create entry from line" posts directly. |
| R-BANK-CASH-19 | Bank-rec auto-match candidates: `Statement Status = Open`, `Remaining ≠ 0`, not `Reversed`, `Posting Date ≤ max(Statement Date, latest line Transaction Date)`; date window \|Δdays\| ≤ tolerance (report default 0). | `BLE:734-756`; `REC:1004-1018`; `MBRL:461-488`; `MBE:49-55` | MUST | Default 0 days is too strict; use 3. |
| R-BANK-CASH-20 | Acceptance: same sign and `0.6 < \|line Difference\| / \|BLE Remaining\| < 1.1`, and (amount exact **or** a text score: nearness ≥ 80 or exact = 100 of BLE `Document No.`/`External Doc No.`/`Description` against line `Description`/`Related-Party Name`/`Additional Info`/`Document No.`). | `MBRL:713-778`, `MBRL:789-833` | MUST | |
| R-BANK-CASH-21 | Ranking: smaller \|amount diff\| → better text (category winner with the highest score) → smaller \|date diff\|. Each BLE goes to one line. A better later line takes the BLE and the loop re-runs. High-confidence shortcut: Δdate = 0, Δamount = 0, text nearness and exact ≥ 95. | `MBRL:546-656`, `MBRL:705-711`, `MBRL:493-532`, `MBRL:372-397` | SHOULD | |
| R-BANK-CASH-22 | Payment-rec candidates: open customer/vendor entries of type blank/Invoice/Credit Memo/Finance Charge/Reminder with empty `Applies-to ID`; open BLEs of the same bank. Currency must equal the bank's (an LCY bank takes FCY entries only if "Appln. between Currencies" ≠ None, using LCY remaining). Lines with `Statement Amount = 0` are skipped. A pair needs `Statement Amount × Remaining ≥ 0` and `Transaction Date ≥ entry Posting Date`. | `MBP:1140-1179`, `MBP:1201-1241`, `MBP:1310-1337`, `MBP:584`, `MBP:1554-1574` | MUST | |
| R-BANK-CASH-23 | Related party: normalized (A–Z0–9, upper) bank account no. equals a customer/vendor bank account → **Fully**. Name nearness ≥ 95 → **Partially** (with the default setting "String Nearness"). If `Related-Party Name` is filled, it is the only text compared, and Partially becomes **Fully** when the statement's address and city equal the customer's and both are non-blank, or when the name is unique (`LIKE @*name*`). If it is blank, `Transaction Text` is compared, and only name uniqueness can upgrade the match to Fully (verified-corrected). For a BLE candidate, the party is the BLE's `Bal. Account` customer/vendor; a G/L or bank bal. account gives **No**. | `MBP:1614-1734`, `MBP:2044-2064`, `MBP:2127-2130`, `MBP:2299-2315` | MUST | MN bank exports usually carry the counterparty account no. → strongest signal. |
| R-BANK-CASH-24 | Document match: `Payment Reference` exact; else doc no. (≥ 4 chars) as a whole token (non-alphanumeric neighbours) in `UPPER(Transaction Text + ' ' + Additional Info)`; then ext. doc no. Several matched docs of one account → "Yes - Multiple" 1:n group (kept only if ≥ 2 entries). | `MBP:1745-1770`, `MBP:1867-1896`, `MBP:1045-1055`, `MBP:2239-2259` | MUST | |
| R-BANK-CASH-25 | Amount tolerance: [Min, Max] from the bank's tolerance (R-BANK-CASH-36). If this entry's remaining (after a valid payment discount) is **outside** [Min, Max] → **No Matches**. If it is inside, the result defaults to **Multiple Matches**. It becomes **One Match** only when exactly one entry of the whole account type (all customers, all vendors, …) is in range, counting 1:n document groups whose total is in range too (verified-corrected). | `MBP:1898-1948`; `LEMB:288-329` | MUST | Uniqueness is global, not per customer. |
| R-BANK-CASH-26 | Score = best rule whose criteria equal the result or are "Not Considered"; `Score = 1000×(Confidence+1) − Priority`; candidates below the lowest non-None rule are dropped. Text-to-Account = 3000 + LCS length (+1 if contained) → "High – Text-to-Account Mapping" (3000–3499). Defaults: 11 High, 9 Medium, 5 Low rules; Low/Medium → `Review Required`. | `RULE:195-223`, `RULE:245-319`, `RULE:339-573`; `MBP:2281-2297` | SHOULD | Text rules override Medium and lose to High. |
| R-BANK-CASH-27 | Candidates are applied in order of `Quality` desc, `No. of Entries` desc. Each line is applied once. An entry already used by another line is reused only for the same account, with all applications the same sign and remaining ≠ 0. | `MBP:1478-1526`, `MBP:1576-1598` | MUST | |
| R-BANK-CASH-28 | All applications of one line must be to the same `Account Type/No.`. `Applied Amount` must lie in [0 … available] (same sign), where available = entry remaining − amounts applied on other lines. A FCY entry against a mismatching FCY bank is rejected. | `APE:345-399`, `APE:429-463` | MUST | One line → one counterparty; splitting is how differences go elsewhere. |
| R-BANK-CASH-29 | Text-to-Account: matches when the trimmed mapping text is fully contained (case-insensitive) in `Transaction Text`. Account = `Debit Acc. No.` for inflow, `Credit Acc. No.` for outflow, or the customer/vendor. If an open BLE with that bal. account, the same amount, ±2 days and a matching description exists, that BLE is matched instead. | `MBP:1370-1442`, `MBP:1444-1476` | MUST | Prevents double-posting of expenses already entered by hand. |
| R-BANK-CASH-30 | Difference on a payment-rec line → "Transfer difference to account" **splits** the line: parent `Statement Amount := Applied`, a child line (`Parent Line No.`) carries the difference to the chosen account. | `MBP:765-838` | MUST | |
| R-BANK-CASH-31 | After import + auto-match, if every line is High, the user may post at once. | `REC:780-789`, `REC:938-954` | SKIP | v1 always shows review. (added-in-verification) The test is `Match Confidence = High` exactly, so a line matched by a text rule ("High - Text-to-Account Mapping") prevents the post-at-once prompt. |
| R-BANK-CASH-32 | Payment-rec post, per line: must have an account and must not be already reconciled. Builds a journal line: `Account` = applied account, `Bal.` = bank, `Document No.` = statement no., `Posting Date` = `Transaction Date`, type Payment, or Refund for customer outflow/vendor inflow, `Applies-to ID = '<bank>-<stmt>-<line>'`, `Amount = −Round(Σ(Applied − Pmt. Disc.))`. BLE applications close the existing BLE instead (a partial application asks for confirmation). The new BLE is closed at once unless *Post Payments Only*. | `RPOST:471-634`, `RPOST:872-901`, `RPOST:917-924`; `RECL:1532-1541` | MUST | |
| R-BANK-CASH-33 | "Post payments and reconcile" also checks Σ lines = Ending − Last and updates the bank and Bank Account Statement. "Post payments only" leaves BLEs open; posted lines get `Reconciled = false`. | `RPOST:137-152`, `RPOST:258-259`, `RPOST:277-289`, `RPOST:734` | MUST | v1: always reconcile. |
| R-BANK-CASH-34 | Import dedupe by `Transaction ID`: skip if already reconciled (posted pmt-rec line or statement line); skip if in another open worksheet unless `Allow Duplicated Transactions`; posted-but-not-reconciled → ask once per statement. | `RECL:1411-1499`; `PBARL:150-162` | MUST | Need a fallback key when the bank gives no ID. |
| R-BANK-CASH-35 | CSV mapping: header lines skipped; columns mapped by number; Date/Decimal parsed with `Data Format` + culture; `Multiplier` (default 1); optional negative-sign column; missing non-optional value → error; `Statement Line No. = file line × 10000 + offset`. | `PDE:60-118`, `PDE:127-240`; `PBARL:59-110` | MUST | XML via `IBS:26-118` (SKIP). |
| R-BANK-CASH-36 | Tolerance range: Amount → `S ± v`, clamped at 0 so the sign is kept; Percentage (`v ≤ 99`) → `S×(1−v/100) … S×(1+v/100)`, swapped when `S < 0`; both rounded. | `RECL:1328-1361`; `BANK:929-962` | MUST | |
| R-BANK-CASH-37 | Wizard: detects separator (comma/semicolon, > 2 matches), header line, one of 13 date patterns, decimal dot/comma (en-US/es-ES); maps Date→`Transaction Date`, Amount→`Statement Amount`, Description→`Transaction Text`; file encoding WINDOWS. | `WIZ:906-977`, `WIZ:1002-1065`, `WIZ:1177-1334` | SHOULD | Must be UTF-8 for Cyrillic. |
| R-BANK-CASH-38 | Undo posted statement: restores `Balance Last Statement`, reopens BLEs (`Remaining := Amount`, `Open := true`), optionally re-creates the worksheet. `Last Statement No.` is not rolled back. | `UNDO:77-215` | SHOULD | (added-in-verification) The re-created worksheet gets a **new** number (`Statement No. := ''` then `Validate("Bank Account No.")` → `IncStr(Last Statement No.)`). The reopened BLEs keep their old `Closed at Date`, which is not cleared. |
| R-BANK-CASH-39 | Reversal of a BLE needs `Open`, no `Statement No.` and no check entries. The mirror entry is `Reversed = true`; both stay `Open` but are excluded from candidates. | `REV:717-743`; `GJPR:551-586`; `BLE:742` | MUST | Un-reconcile first, then reverse. |
| R-BANK-CASH-40 | Payment Registration: lists open non-payment customer entries. Suggests `Amount Received` = remaining, or remaining after discount when date ≤ discount date. Posts Payment (Refund for credit memo) with `Amount = −Amount Received`, bal. = setup account (G/L or bank), `Applies-to Doc.`. Lump payment: one customer, one date, applies via `Applies-to ID`. Currency must equal the bal. bank currency. | `PRM:106-182`, `PRM:359-392`, `PRM:486-583`; `PRB:99-160`, `PRB:249-293`, `PRB:389-439` | MUST | |
| R-BANK-CASH-41 | Suggest Vendor Payments: vendors not blocked with `Balance (LCY) > 0`; open VLEs with empty `Applies-to ID`, empty `On Hold`, `Due Date ≤ Last Payment Date`; `Amount = −Remaining` (− possible discount); per vendor and currency, net < 0 → drop all; `Amount Available` cap; entries already applied by a line of the **same** batch are always skipped, entries in **other** batches only when "Check Other Journal Batches" is on (default on SaaS only, `SVP:466-472`, `SVP:1243`) (verified-corrected); entry posting date > payment date → skipped and reported; priority vendors first; summarize per vendor (`Applies-to ID`) or one line per document (`Applies-to Doc.`). | `SVP:29`, `SVP:32-124`, `SVP:623-668`, `SVP:670-753`, `SVP:755-858`, `SVP:1049-1096`, `SVP:1219-1263` | MUST | Drop priority and discounts in v1. |
| R-BANK-CASH-42 | FCY bank revaluation: `adj = Round(FX→LCY(Balance at Date)) − Balance at Date (LCY)`. Posts a BLE with `Amount = 0` and `Amount (LCY) = adj` (closed, R-BANK-CASH-04), against the realized gain/loss account. | `XRA:431-475`, `XRA:841-876` | MUST (if FCY) | |

---

## 4. Flows

**F1. Receipt or payment through a journal (Cash Receipt / Payment Journal)**
1. Line: `Account Type` = Customer/Vendor/G/L, `Bal. Account` = bank or cash. Currency is defaulted from the bank (`GJL:8053-8081`).
2. `Applies-to Doc. No.` or `Applies-to ID` selects the invoices.
3. Post → `GenJnlPostLine` posts the CV side (application per `bc-subledgers-application.md`), then `PostBankAcc` for the balancing side: checks (R-02/03), BLE insert (R-04), G/L entry (R-06).
4. The BLE is `Open`, `Statement Status = Open`, waiting for the statement.

**F2. Payment Registration (CU980)**
1. `PopulateTable` lists open customer documents (`PRB:249-293`).
2. User ticks *Payment Made* → date auto-fills, amount suggested (`PRB:99-160`).
3. Post → one journal line per document in the setup batch, `Applies-to Doc.`, then batch post (`PRM:106-182`).
4. Lump: check one customer and one date, tag entries with `Applies-to ID`, post one line (`PRM:359-392`, `PRM:522-558`).

**F3. Vendor payment run**
1. Payment Journal → *Suggest Vendor Payments* (`PJ:803-823`).
2. Per vendor: include check → collect VLEs → amount cap → drop net-debit currencies (`SVP:32-47`).
3. `MakeGenJnlLines`: currency filter for an FCY bank, cap, posting-date check, skip entries in other batches, buffer per vendor or document, set `Amount to Apply` (`SVP:755-858`).
4. Insert lines with `Bal. Account = bank`, `Applies-to …` (`SVP:860-936`). User reviews and posts (F1).

**F4. Statement import**
1. Bank has `Bank Statement Import Format` → Data Exch. Def (`REC:963-987`).
2. File → `Data Exch. Field` rows (CSV XMLport or XML parser `IBS:26-118`).
3. Column mapping → temp lines (`PDE:60-118`).
4. `CanImport` dedupe → insert with line no. offset (`PBARL:150-162`).
5. No line imported → worksheet deleted and `Last Statement No.` restored (`REC:731-764`). (verified-corrected) This import path creates a **Payment Application** worksheet (`REC:804-810`), whose insert advanced `Last Payment Statement No.`. That field is not restored, so the number is still consumed. BC restores the unrelated bank-rec field instead.

**F5. Bank reconciliation (statement type Bank Reconciliation)**
1. New worksheet: number, `Balance Last Statement` (`REC:42-75`). Enter `Statement Date` and `Statement Ending Balance`.
2. Lines by import (F4) or *Suggest lines* from open BLEs (`BA/Bank/Reconciliation/SuggestBankAccReconLines.Report.al:31-55`).
3. *Match automatically* (`MBRL:313-432`) and/or manual match (`MBRL:72-88`).
4. Unmatched lines → *Transfer to General Journal* → post → auto-link (R-18).
5. Post: preconditions (R-15) → close BLEs (R-16) → update bank → write statement → delete worksheet.

**F6. Payment reconciliation journal (statement type Payment Application)**
1. Import (F4) into a new worksheet (`REC:709-755`).
2. Unless matching is disabled on the bank: `MatchBankPayments` (`MBP:315-326`):
   a. Load rules and buffers (`MBP:549-611`).
   b. Per line: customers → vendors → employees → BLEs → text mappings; per candidate run `CanEntriesMatch`, related-party, document and amount checks, then score (`MBP:1009-1107`, `MBP:1384-1442`).
   c. Rescore 1:n groups (`MBP:2208-2259`).
   d. Create applied entries by quality (`MBP:1478-1526`).
3. Auto-post if all High (R-31), else review: accept, remove, apply manually, transfer difference (R-30).
4. Post (`RPOST:471-634`): one CV/G/L journal line per statement line + close BLEs. Optionally reconcile (R-33).

**F7. Cash box**
1. Cash = bank account on a CASH posting group (G/L 1100), no statement import.
2. Receipts/payments via F1, F2 or invoice payment method (`SPI:662-707`). Transfers bank↔cash = journal line Bank→Bank.
3. Period end: count cash, post the difference to an over/short account. W1 BC has no dedicated function; a manual bank-rec worksheet can be used.
4. (added-in-verification) The repo also has a dedicated cash module in the Czech localization, `src/Apps/CZ/CashDeskLocalization`. A **Cash Desk** (T11744) is a Bank Account with `Account Type CZP = Cash Desk` (`BankAccountCZP.TableExt.al`; `CashDeskCZP.Table.al:624-679`), and **Cash Documents** (T11732) have type Receipt/Withdrawal. On release, the projected balance (`CalcBalance() ± Amount Including VAT`) is checked against `Min. Balance` for withdrawals and `Max. Balance` for receipts, each with mode Warning or Blocking (`CashDocumentReleaseCZP.Codeunit.al:170-199`). This is the closest BC model for МХ-1/МХ-2 vouchers and the "no negative cash" rule.

**F8. FCY revaluation**: per bank, compute adj (R-42), post the BLE plus G/L entry against gain/loss, group totals per posting group (`XRA:431-475`).

---

## 5. Calculations & rounding

- **Sign convention.** `+` = debit = money in. BLE `Amount`, statement `Statement Amount` and reconciliation `Applied Amount/Difference` all use the bank's view: deposits +, withdrawals −. Journal lines are from the `Account No.` side: customer receipt `Amount = −X` with bank balancing; vendor payment `Amount = +X` (`SVP:696`); Payment Registration `Amount = −Amount Received` (`PRM:155`, citation verified-corrected); payment-rec post `Amount = −Σ applied` (`RPOST:607`).
- **Statement equation** (enforced): `Σ Statement Amount = Statement Ending Balance − Balance Last Statement` (`RPOST:368-371`). After posting: `Bank.Balance Last Statement(new) = worksheet.Balance Last Statement + Σ Statement Amount` (`RPOST:648`; verified-corrected, see R-16).
- **Proof equation** (reported, not enforced): `Balance at Statement Date = Statement Ending Balance + Σ outstanding BLE Amount (signed; Posting Date ≤ Statement Date, not reversed, not on this statement)`. Outstanding payments are negative, so they reduce the adjusted ending balance (verified-corrected: the earlier "Ending − Σ outstanding" only holds when outstanding items are taken as absolute payment amounts). BC splits outstanding items into "Outstanding Payments" (BLEs with check entries) and "Outstanding Bank Transactions" (all others) and computes `Adjusted Statement Ending Balance = Ending + OutstdBankTransac + OutstdPayments` (`BA/Bank/Reports/BankAccReconTest.Report.al:540-549`; `BA/Bank/Reconciliation/BankAccReconTest.Codeunit.al:45-52`, `:98-121`). Snapshots are stored at posting (`RPOST:156-177`, `RPOST:684-688`).
- **Line amounts:** `Difference = Statement Amount − Applied Amount` (`RECL:114-117`).
- **Tolerance** (Amount `v`): `Min = S−v`, `Max = S+v`; if `S ≥ 0` and `Min < 0` → `Min = 0`; if `S < 0` and `Max > 0` → `Max = 0`. (Percentage `p`): `Min = S×(1−p/100)`, `Max = S×(1+p/100)`, swapped if `S < 0`. Then `Round(·)` with default precision 0.01, nearest (`RECL:1336-1360`).
- **Remaining for matching:** if payment discounts exist and `Transaction Date ≤ Pmt. Discount Due Date`, use `Remaining − Remaining Pmt. Disc. Possible` (LCY: `Round(disc / Adjusted Currency Factor)`), else `Remaining` (`LEMB:199-208`, `LEMB:288-297`).
- **String nearness:** `Nearness = (100 × Σ len(common substrings ≥ threshold)) div len(shorter string)`. Common substrings are taken greedily by longest-common-substring, case-insensitive; the threshold is 4 for text matching, and a single character never counts (`RMM:75-139`). `Exact = (100 × len(LCS)) div len(base)` (`RMM:115-128`). `div` truncates.
- **Bank-rec amount closeness:** `0.6 < |S| / |R| < 1.1`, same sign (`MBRL:761-778`).
- **Payment-rec thresholds:** exact = 0.95×100 = 95, close = 65, min doc-no length = 4 (`MBP:2261-2279`). A name is not compared if `len(text) < len(name) × 0.65` (`MBP:2051`).
- **Scores:** rule `= 1000×(c+1) − p` with c ∈ {0 None, 1 Low, 2 Medium, 3 High}. High 3989–3999, Medium 2991–2999, Low 1995–1999 with the default priorities. Text mapper `= 3000 + LCS + (contains ? 1 : 0)` (`RULE:260-287`). Confidence from quality: 3000–3499 → Text-Mapping, else `quality div 1000` (`RULE:299-319`).
- **Posting amount** (payment rec): `Amount = Round(−PaymentLineAmount, Currency."Amount Rounding Precision")`. For an FCY bank, `Amount (LCY) = Round(ExchangeAmtFCYToLCY(date, cur, Amount, factor))` (`RPOST:604-613`).
- **LCY bank vs FCY entries:** remaining shown in LCY = `ExchangeAmount(Remaining, FCY→LCY, Transaction Date)` (`APE:645-690`). Amount to apply = `ExchangeAmount(Applied, LCY→FCY, Posting Date)`, capped at `|Remaining|` (`APE:1221-1263`). BLE remaining in LCY = `Round(Remaining × Amount(LCY) / Amount)` (`APE:708-719`).
- **FX revaluation:** `adj = Round(ExchangeAmtFCYToLCYAdjmt(date, cur, BalanceAtDate, factor)) − BalanceAtDate(LCY)`. `adj > 0` → gain account, else loss (`XRA:445-449`, `XRA:868-874`).
- **Vendor payment amount:** `−(Remaining − RemainingPmtDiscPossible(PostingDate))` if a discount is allowed, else `−Remaining` (`SVP:693-697`).
- **Payment Registration tolerance:** `(1−p/100)×F ≤ A ≤ (1+p/100)×F` (`PRM:457-464`). This only works for positive F.

---

## 6. Worked posting examples (MNT; every table balances)

Money accounts: **KHAN-MNT** (G/L 1110), **CASH-MNT** (G/L 1100), **GOL-USD** (G/L 1111). KHAN `Balance Last Statement` = 10,000,000 (statement 5).

(verified-corrected) BLE numbers #101–#105 below are labels only. BC sets a BLE's `Entry No. := NextEntryNo`, the **G/L entry counter** (`GJPL:3623`), so BLE numbers share the G/L sequence, have gaps, and are not per bank. The CASH-MNT BLEs in Ex 3 also take numbers from that sequence.

**Ex 1 – Customer receipt (Payment Registration, 2026-03-05).** Earlier invoice INV-1001: Dr 1200 1,100,000 / Cr 5100 1,000,000 / Cr 2300 100,000. Registration posts a Payment, `Account = C001`, `Amount = −1,100,000`, `Applies-to Doc = INV-1001`, bal. KHAN.

| Account | Debit | Credit |
|---|---:|---:|
| 1110 Bank | 1,100,000 | |
| 1200 AR | | 1,100,000 |
| **Σ** | **1,100,000** | **1,100,000** |

BLE #101: `Amount = +1,100,000`, `Remaining = +1,100,000`, `Open`, `Positive`, `Debit Amount = 1,100,000`, `Statement Status = Open`.

**Ex 2 – Vendor payment run (2026-03-07).** Invoice PINV-2001 (Dr 7200 500,000; Dr 1300 50,000 / Cr 2100 550,000). Suggest → VLE `Remaining = −550,000` → line `Amount = +550,000`, bal. KHAN.

| Account | Debit | Credit |
|---|---:|---:|
| 2100 AP | 550,000 | |
| 1110 Bank | | 550,000 |
| **Σ** | **550,000** | **550,000** |

BLE #102: `Amount = −550,000`, `Credit Amount = 550,000`. On 03-31 a second payment to V002 for 400,000 gives BLE #104 (−400,000). The bank executes it on 04-01.

**Ex 3 – Cash box.** 03-10: withdraw 300,000 from KHAN to the cash box (line `Account = Bank CASH-MNT`, `+300,000`, bal. KHAN). 03-12: office supplies 88,000 incl. VAT paid in cash (`Account = G/L 7200`, `+88,000`, VAT 10%, bal. CASH-MNT; VAT = 88,000×10/110 = 8,000).

| Date | Account | Debit | Credit |
|---|---|---:|---:|
| 03-10 | 1100 Cash | 300,000 | |
| 03-10 | 1110 Bank | | 300,000 |
| 03-12 | 7200 G&A | 80,000 | |
| 03-12 | 1300 VAT receivable | 8,000 | |
| 03-12 | 1100 Cash | | 88,000 |
| | **Σ** | **388,000** | **388,000** |

BLEs: KHAN #103 −300,000; CASH +300,000 and −88,000. Cash balance = 212,000, which must equal the count.

**Ex 4 – Bank reconciliation, statement 6 (03-31).** Lines: L10000 03-05 +1,100,000 "INV-1001 BOLD LLC"; L20000 03-08 −550,000; L30000 03-10 −300,000 "cash withdrawal"; L40000 03-31 −2,500 "service fee". Ending balance per bank = 10,247,500. Check: Σ = 247,500 = 10,247,500 − 10,000,000 ✓. Auto-match with tolerance 1 day: L10000↔#101 (Δ0, text), L20000↔#102 (amount exact, Δ1 day), L30000↔#103. L40000 has no candidate → transfer to journal: `Account = G/L 8300`, bal. KHAN, `Amount = −Difference = +2,500`. VAT-exempt.

| Account | Debit | Credit |
|---|---:|---:|
| 8300 Finance costs | 2,500 | |
| 1110 Bank | | 2,500 |
| **Σ** | **2,500** | **2,500** |

The new BLE #105 (−2,500) auto-links to L40000. Post: #101/#102/#103/#105 → `Open = false`, `Remaining = 0`, `Statement No. = 6`, `Closed at = 03-31`. Bank `Balance Last Statement = 10,247,500`. Proof: G/L 1110 = 10,000,000 + 1,100,000 − 550,000 − 300,000 − 400,000 − 2,500 = 9,847,500 = 10,247,500 − outstanding #104 (400,000) ✓.

**Ex 5 – Payment reconciliation journal, April statement 7 (post and reconcile).** Bank tolerance: Amount 10,000.

| Line | Data | Match | Score / confidence |
|---|---|---|---|
| L10000 04-01 | −400,000 "PMT V002" | BLE #104 (bank entry): party No, Doc No, amount One Match | Low rule 2000−4 = 1996 → user accepts; closes #104, no new posting |
| L20000 04-02 | +330,000 "INV-1002", party "TUUL TRADE LLC" | C002 INV-1002 remaining 330,000 (invoice 300,000 + VAT 30,000); party Fully, Doc Yes, One Match | 4000−4 = 3996 High |
| L30000 04-15 | −110,000 "UNITEL INTERNET 04" | text rule "UNITEL" → 7200, VAT 10% | 3000+6+1 = 3007 Text-Mapping |
| L40000 04-20 | +505,000 "INV-1003" | C003 INV-1003 remaining 500,000; range [495,000; 515,000]; party No, Doc Yes, One Match | Medium rule (No/Yes/One Match), 3000−6 = 2994 → review |

The user splits L40000: 500,000 to INV-1003 and a child line of +5,000 to G/L 8200. Σ lines = −400,000 + 330,000 − 110,000 + 505,000 = 325,000. Ending = 10,247,500 + 325,000 = 10,572,500.

| Line | Account | Debit | Credit |
|---|---|---:|---:|
| L20000 | 1110 Bank | 330,000 | |
| L20000 | 1200 AR (C002) | | 330,000 |
| L30000 | 7200 G&A | 100,000 | |
| L30000 | 1300 VAT receivable | 10,000 | |
| L30000 | 1110 Bank | | 110,000 |
| L40000 | 1110 Bank | 500,000 | |
| L40000 | 1200 AR (C003) | | 500,000 |
| L40001 | 1110 Bank | 5,000 | |
| L40001 | 8200 Other income | | 5,000 |
| | **Σ** | **945,000** | **945,000** |

All journal lines use `Document No. = 7` and `Posting Date = Transaction Date`. (verified-corrected) In BC the worksheet number comes from `Pmt. Rec. No. Series` or `IncStr(Last Payment Statement No.)`, a sequence separate from the bank-rec "6" of Ex 4. The posted number (and so the `Document No.`) is 7 only if that worksheet number already exists in T275, which makes posting take `IncStr(Last Statement No.)` = 7 (R-17). Otherwise it is the payment-rec number. For L30000 the mapping row must have 7200 in **`Credit Acc. No.`**, because outflows (`Statement Amount < 0`) use the credit account (R-29). The VAT split needs `Copy VAT Setup to Jnl. Line` (default true) and a purchase VAT setup on 7200. New BLEs are closed at once, and #104 is closed. G/L 1110 at 04-30 = 9,847,500 + 725,000 = 10,572,500 = statement ✓ (nothing outstanding).

**Ex 6 – USD bank revaluation (04-30).** GOL-USD `Balance at Date` = 2,000.00 USD, `Balance at Date (LCY)` = 6,800,000. Rate 3,450 → 6,900,000 → adj = +100,000.

| Account | Debit | Credit |
|---|---:|---:|
| 1111 Bank USD | 100,000 | |
| 8500 FX gain/loss | | 100,000 |
| **Σ** | **100,000** | **100,000** |

BLE: `Amount = 0`, `Amount (LCY) = +100,000`, `Open = false`, `Statement Status = Closed`. It never reaches reconciliation.

---

## 7. Simplifications for the micro-business system

1. **One `money_account` table** (`type` BANK | CASH | WALLET, e.g. QPay), with `currency`, `gl_account_id` (unique per account), `iban/account_no`, `bank_code`, `import_profile_id`, `last_statement_no`, `last_statement_balance`, `match_tolerance_amount`. No posting group in v1.
2. **`money_entry`** = BLE without check, SEPA or positive-pay fields: amount, amount_lcy, `status` {open, matched, reconciled}, `statement_id`, `statement_line_id`, reversed flags. Drop `Remaining Amount`: v1 allows no partial reconciliation (BC itself warns against it, `RPOST:571-583`).
3. **One statement workflow** instead of two: import → auto-match → review → "Post & reconcile". Matches may point to (a) existing money entries, which are then closed, (b) open AR/AP documents, where a payment is created, or (c) a text rule or manual account, where an entry is created. This is BC's payment reconciliation journal in "reconcile" mode, and it also covers the classic bank rec.
4. **Match groups** (`statement_match`: set of lines + set of targets, Σ equal, one counterparty per group) replace 1:1/1:n/n:1 buffers and parent/child line splitting.
5. **Matching engine**, deterministic and explainable:
   - Signals: `party` = {account_no, name≥95, none}, `doc` = {token, none}, `amount` = {exact, in tolerance and unique, in tolerance and multiple, none}, `date` Δ.
   - Hard-code about 8 rules (High: account_no+doc+amount; party+doc+unique amount; doc+exact amount unique. Medium: doc only; party+unique amount. Low: amount unique only).
   - Keep BC's score formula so rules can be added later.
   - Text rules: "contains" match, case-insensitive, Cyrillic/Latin normalized.
6. **Import profiles** per bank (JSON): delimiter, encoding (UTF-8 default), header rows, date format, decimal separator, either one signed amount column **or** separate debit/credit columns, plus columns for description, counterparty name/account, reference, transaction id and running balance. Accept XLSX (MN banks export Excel). Ship presets for Khan, Golomt, TDB, XacBank and State Bank. API connectors (Khan, Golomt) later.
7. **Dedupe key** = bank transaction id, else `hash(date, amount, normalized text, running balance)`.
8. **Receive payment** = Payment Registration: button on the invoice and a bulk screen; lump payment for one customer. No payment discounts or tolerance in v1.
9. **Bills to pay** = Suggest Vendor Payments without priority, discounts, dimensions or check numbering: due ≤ date, not on hold, vendor not blocked, net payable > 0, not already in a draft, optional cash cap. Output is a draft payment batch, one line per vendor or per bill. Bank bulk-payment file export → SHOULD.
10. **Cash box:** no import. "Cash count" screen posts the difference to over/short accounts. Block negative cash balance (configurable). МХ-1/МХ-2 vouchers numbered per cash account (`mn-accounting.md`).
11. Keep **FX revaluation** for FCY accounts only (R-42), monthly with the Mongolbank rate.
12. **Skip:** checks, positive pay, SEPA/direct debit, employee matching, intercompany, payment-application settings UI, Copilot matching, many-to-many restrictions, dimensions on statements.

---

## 8. Pitfalls / edge cases the new implementation must not miss

- **Statement number reservation:** BC writes `Last Statement No.` when a worksheet is **created**, so deleted drafts leave gaps, and undo does not roll it back (`REC:461-525`, `UNDO:77-120`). Assign the final number at posting. (added-in-verification) Bank-rec and payment-rec worksheets use two different counters but post into the same T275 number space, so BC renumbers on collision (R-17). Its rollback for an empty import also resets the wrong counter (F4 step 5). One counter per money account, assigned at posting, avoids both problems.
- **Completeness:** the statement only posts when Σ lines = Ending − Last **and** every line is fully explained. Never allow "post with difference". Turn differences into explicit entries (R-15, R-18).
- **The proof equation is not enforced in BC.** Show `G/L − (Ending + Σ outstanding signed)` as a hard warning (verified-corrected sign; see §5). It catches back-dated postings into reconciled periods.
- **Back-dated postings:** a new money entry dated before the last reconciled statement must stay open and appear on the next statement. Lock reconciled periods per account or warn.
- **Reversal:** both entries stay `Open` with `Reversed = true` and must be excluded from matching. A reconciled entry cannot be reversed before un-reconciling (R-39).
- **Zero-amount and LCY-only entries** (FX revaluation, rounding) are auto-closed. Do not show them as outstanding.
- **LCY bank receiving FCY payments** stores LCY in the BLE, so the statement amount is LCY (R-03). An FCY bank needs `amount` in FCY for matching and `amount_lcy` for the G/L.
- **Sign handling on import:** debit/credit columns are often both positive. Negate debits. A negative-sign indicator column (`PDE:164-171`). Thousands separators and "1 234,50" (space) formats appear in MN files.
- **Encoding:** BC's wizard writes `WINDOWS` encoding (`WIZ:926`). Mongolian Cyrillic needs UTF-8 or CP1251 detection, or descriptions become garbage and text matching fails.
- **Duplicate import without transaction IDs** creates double receipts. Use the fallback hash and the running balance.
- **Doc-number token rule:** "INV1001" does not match "INV-1001", and numbers shorter than 4 characters never match (`MBP:1867-1896`). Normalize punctuation and allow registry numbers (РД, 7 digits).
- **Amount uniqueness is global** across all customers (R-25). A wide tolerance turns most matches into "Multiple" → lower confidence. Default tolerance 0 for MNT.
- **One line → one counterparty** (R-28). QPay or card settlements that bundle several customers plus a fee need an explicit split.
- **Posting date** of a payment-rec payment = transaction date, but `Closed at Date` = statement date (`RPOST:509`, `RPOST:883`). Aging and VAT dates follow the transaction date.
- **Text rules double-posting:** if the user already entered the expense, BC matches the existing entry (±2 days, same amount) instead of posting again (R-29). Keep this.
- **Auto-match date tolerance** defaults to 0 in BC (`MBE:49-55`), so weekend and next-day settlements fail. Default to 3 days.
- **Vendor payment run:** skip invoices already in another draft batch. BC does this only when "Check Other Journal Batches" is on, which defaults to on for SaaS only (`SVP:466-472`, `SVP:1219-1263`); make it unconditional (verified-corrected). Also skip invoices posted after the payment date (`SVP:781`). Drop a vendor's entries **per currency** when that currency nets to a debit balance (`SVP:1066-1076`).
- **Currency change** on a used account must be blocked (R-01). Cash boxes per currency.
- **Concurrency:** BC locks BLE and ledger tables during application and posting (`SETNO:65-67`, `RPOST:211-212`). Use row locks on matched entries so two users cannot reconcile the same entry.
- **`Min. Balance` is not enforced in BC.** If negative cash is blocked, check it at posting, not in the UI.

---

## 9. Open questions

1. MNT precision on statements: do Khan/Golomt files carry 2 decimals? Keep amounts NUMERIC(18,2) while LCY rounding is 1 MNT (`bc-vat.md`)?
2. Which banks ship file presets in v1, and which file types (XLSX vs CSV, debit/credit columns, encodings)? Sample files are needed per bank.
3. When should the Khan/Golomt/TDB statement APIs be added (`mn-integrations-market.md`), and who owns the OAuth credentials?
4. QPay/card acquirer settlements arrive net of fees and aggregated. Model them as a WALLET money account with its own statement, or split at bank import?
5. Should a cash box be allowed to go negative, and is the over/short treatment an expense (8400) or a receivable from the cashier?
6. Is partial reconciliation of one money entry ever needed (e.g. a bank splits one payment)? The proposal is no; use match groups.
7. FX revaluation: one account 8500 for realized and unrealized (as in `mn-accounting.md`) or two? Monthly or only at year end for micro?
8. Do users want "post payments only, reconcile later", or always reconcile in one step?
9. Bulk vendor payment files (payment orders) for MN banks: is there a common format, or is it bank-specific?
10. Numbering and legal form of МХ-1/МХ-2 cash vouchers: per cash box or company-wide, and reset yearly?

---

## Verification log

Adversarial check against the AL source (BC W1 BaseApp, SimplifiedBankStatementImport, ContosoCoffee demo data, CZ CashDeskLocalization). Paths use the aliases from the header. `BA/` = `src/Layers/W1/BaseApp/`. Every worked example was recomputed: debits = credits, VAT = gross × 10/110, scores = 1000×(c+1) − priority against the default rule table, and tolerance ranges.

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| R-01 Currency change only with zero balances and no open BLE; blank↔LCY always allowed | confirmed | `BANK:261-289` |
| R-02 Posting needs bank not blocked, a posting group and its G/L account | confirmed | `GJPL:1584`, `GJPL:1597-1598`, `GJPL:1697` |
| R-03 Currency compatibility (LCY bank may take an FCY line) | confirmed | `GJPL:1588-1592`, `GJPL:1609-1612`; `GJL:532-539`, `GJL:8040-8048` |
| R-04 BLE amount/remaining/open/positive; zero-amount BLE created closed | confirmed | `GJPL:1609-1620` |
| R-05 Debit/credit split with Correction flag | confirmed | `BLE:630-649` |
| R-06 One G/L entry on posting-group account for Amount (LCY) | confirmed (+ caveat added: direct G/L posting not blocked) | `GJPL:1700-1704`; `BAPG:69-77`; `BA/Finance/GeneralLedger/Account/GLAccount.Table.al:1305-1311` |
| R-07 Balance / Balance at Date FlowFields | confirmed | `BANK:445-500`, `BANK:600-627` |
| R-08 `Min. Balance` not enforced (W1) | confirmed (CZ Cash Desk does enforce, added to F7) | grep of `"Min. Balance"` in `src/`; `src/Apps/CZ/CashDeskLocalization/app/Src/Codeunits/CashDocumentReleaseCZP.Codeunit.al:170-199` |
| R-09 Bank cannot be deleted with entries in open periods or open BLEs | confirmed | `MOVE:233-257` |
| R-10 Statement numbering, write-back on insert, duplicate rejected, rename forbidden | confirmed | `REC:52-71`, `REC:456-470`, `REC:488-525`, `REC:905-927` |
| R-11 Balance Last Statement copied, change asks confirmation | confirmed | `REC:70`, `REC:116-133` |
| R-12 SetReconNo preconditions and effects | confirmed | `SETNO:294-322`, `SETNO:365-378` |
| R-13 1:1, 1:n, n:1 (last line gets remainder, `Statement Line No. = −1`), no m:n | confirmed | `SETNO:57-151` |
| R-14 Applied += Remaining; Difference; editing Statement Amount removes application | confirmed | `SETNO:76-90`; `RECL:114-117`, `RECL:468-479` |
| R-15 Bank-rec post preconditions | confirmed | `RPOST:134-135`, `RPOST:229-253`, `RPOST:360-373` |
| R-16 Post effects; new Balance Last Statement base | corrected (base is the worksheet value, not the bank's) | `RPOST:425-469`, `RPOST:648` |
| R-17 Duplicate posted no. → next number | confirmed (+ T275 shared by both statement types, added) | `RPOST:696-706`, `RPOST:903-915`, `RPOST:522` |
| R-18 Transfer to General Journal: Bal. = bank, Amount = −Difference | corrected (conditional on the batch's bal. account; else +Difference; no link for n:1) | `TBR:34-87`; `BLE:540-542`, `BLE:588-628` |
| R-19 Bank-rec candidate filter and date window (default 0 days) | confirmed | `BLE:734-756`; `REC:1004-1018`; `MBRL:461-488`; `MBE:49-55` |
| R-20 Acceptance: same sign, 0.6 < ratio < 1.1, amount exact or text ≥ 80 / exact 100 | confirmed | `MBRL:713-778`, `MBRL:763-773`, `MBRL:789-833` |
| R-21 Ranking (amount → text → date), re-run when a better line steals a BLE, high-confidence shortcut | confirmed | `MBRL:546-574`, `MBRL:493-532`, `MBRL:705-711`, `MBRL:372-397` |
| R-22 Payment-rec candidate filters, sign and date checks, zero lines skipped | confirmed | `MBP:1140-1179`, `MBP:1310-1337`, `MBP:584`, `MBP:1554-1574` |
| R-23 Related-party Fully/Partially rules | corrected (address/city upgrade only with structured `Related-Party Name`) | `MBP:1600-1611`, `MBP:1675-1734`, `MBP:1985-2010`, `MBP:2044-2064`, `MBP:2066-2130` |
| R-24 Doc-no token match (≥ 4 chars, non-alphanumeric neighbours) | confirmed | `MBP:1745-1770`, `MBP:1867-1896`, `MBP:2271-2274` |
| R-25 Amount-tolerance categories | corrected ("No Matches" = this entry out of range; in range defaults to Multiple) | `MBP:1898-1948`; `LEMB:288-329` |
| R-26 Score formula, text-mapper 3000 + LCS (+1), default rules 11 High / 9 Medium / 5 Low, Review Required for Low/Medium | confirmed | `RULE:245-319`, `RULE:339-573`; `MBP:2281-2297` |
| R-27 Apply by Quality desc; many-to-one only same account, same sign, remaining ≠ 0 | confirmed | `MBP:1478-1526`, `MBP:1576-1598` |
| R-28 One counterparty per line; applied amount within available | confirmed | `APE:345-399`, `APE:429-463` |
| R-29 Text-to-Account: containment, Debit acc. for inflow / Credit acc. for outflow, ±2-day existing-BLE check | confirmed | `MBP:1370-1442`, `MBP:1444-1476`; `RMM:36-60` |
| R-30 Transfer difference splits the line (parent = applied, child = difference) | confirmed | `MBP:765-838` |
| R-31 Post at once when all lines High | confirmed (+ text-mapping lines block it, added) | `REC:780-789`, `REC:938-954` |
| R-32 Payment-rec posting line build, Refund rule, Applies-to ID format, BLE closing | confirmed | `RPOST:471-634`, `RPOST:872-901`, `RPOST:917-924`; `RECL:1527-1541` |
| R-33 Post-and-reconcile vs post-payments-only (`Reconciled` flag) | confirmed | `RPOST:137-152`, `RPOST:258-259`, `RPOST:277-289`, `RPOST:734` |
| R-34 Import dedupe by Transaction ID | confirmed | `RECL:1410-1499`; `PBARL:150-162` |
| R-35 CSV mapping, multiplier, negative-sign column, line no. = line × 10000 + offset | confirmed | `PDE:60-118`, `PDE:127-240`; `PBARL:59-110`, `PBARL:150-162` |
| R-36 Tolerance range (Amount clamp at 0 / Percentage swap / round) | confirmed | `RECL:1328-1361`; `BANK:929-962` |
| R-37 Wizard: separator > 2 matches, 13 date patterns, en-US/es-ES, field 5/7/23, WINDOWS encoding | confirmed | `WIZ:906-977`, `WIZ:1038-1052`, `WIZ:1177-1240` |
| R-38 Undo statement | confirmed (+ new worksheet no., Closed at Date not cleared, added) | `UNDO:77-215` |
| R-39 Reversal needs open BLE, no statement no., no checks; reversed BLEs excluded from matching | confirmed | `REV:717-743`; `GJPR:551-586`; `BLE:742`; `MBP:602`, `MBP:1321-1322` |
| R-40 Payment Registration (populate, suggest, post Amount = −Amount Received, Refund for credit memo) | confirmed | `PRM:106-182`, `PRM:457-464`; `PRB:99-160`, `PRB:249-293` |
| R-41 Suggest Vendor Payments filters | corrected (other-batch check is optional, default on SaaS only) | `SVP:29`, `SVP:466-472`, `SVP:623-668`, `SVP:670-697`, `SVP:755-858`, `SVP:1049-1076`, `SVP:1219-1263` |
| R-42 FCY revaluation: BLE Amount 0, Amount (LCY) = adj, realized gain/loss account | confirmed | `XRA:431-475`, `XRA:841-876` |
| §1 "Cash is not a separate module" | corrected (true for W1 only; CZ Cash Desk added) | `DEMO:21`; `src/Apps/CZ/CashDeskLocalization/app/Src/Tables/CashDeskCZP.Table.al:29`, `:624-679` |
| §2 Table IDs (270, 271, 273, 274, 275/276, 1251-1253, 1294-1296, 2711, 980/981) | confirmed | `grep "^table <id>"` in `BA/Bank/**` |
| §2 Data-exchange table IDs "1222-1225" | corrected (1221-1225 and 1227) | `BA/System/DataExchange/*.Table.al` headers |
| §5 Proof equation `G/L = Ending − Σ outstanding` | corrected (signed: `Ending + Σ outstanding`) | `BA/Bank/Reports/BankAccReconTest.Report.al:540-549`; `BA/Bank/Reconciliation/BankAccReconTest.Codeunit.al:45-52`, `:98-121` |
| §5 String nearness / exact-nearness formulas, thresholds 95 / 65 / 4 | confirmed | `RMM:36-139`; `MBP:2044-2052`, `MBP:2261-2279` |
| §5 Remaining-for-matching with payment discount | confirmed | `LEMB:192-208`, `LEMB:288-297` |
| §5 LCY bank vs FCY entries conversions | confirmed | `APE:645-719`, `APE:1221-1263` |
| F4 step 5 "Last Statement No. restored" when nothing imported | corrected (path creates a payment-rec worksheet; its counter is not restored) | `REC:709-764`, `REC:804-810` |
| §6 BLE entry numbering #101–#105 | corrected (BLE `Entry No.` = G/L entry counter; labels only) | `GJPL:3617-3624` |
| Ex 1 Receipt 1,100,000: Dr 1110 / Cr 1200; BLE +1,100,000 debit | confirmed (Σ 1,100,000 = 1,100,000) | `PRM:155`; `GJPL:1609-1620`; `BLE:630-649` |
| Ex 2 Vendor payment +550,000: Dr 2100 / Cr 1110; BLE −550,000 credit | confirmed (Σ 550,000 = 550,000) | `SVP:693-697` |
| Ex 3 Cash transfer 300,000 and supplies 88,000 incl. 10% VAT (80,000 + 8,000) | confirmed (Σ 388,000 = 388,000; cash 212,000) | GenJnl VAT-inclusive amount (`GJL` VAT fields) |
| Ex 4 Statement 6: Σ lines 247,500 = 10,247,500 − 10,000,000; matches feasible with 1-day tolerance; fee −2,500 auto-links; proof 9,847,500 | confirmed (traced date/ratio filters for every line/BLE pair) | `MBRL:461-488`, `MBRL:713-778`; `TBR:76-78`; `BLE:605-628` |
| Ex 5 Scores 1996 / 3996 / 3007 / 2994, range [495,000; 515,000], Σ 945,000 = 945,000, ending 10,572,500 | confirmed | `RULE:339-573` (priorities: Low #4, High #4, Medium #6); `MBP:1384-1428`; `RECL:1336-1360` |
| Ex 5 "statement 7" / `Document No. = 7` | corrected (separate payment-rec counter; 7 only via T275 collision) | `REC:52-63`; `RPOST:522`, `RPOST:696-706`, `RPOST:903-915` |
| Ex 6 USD revaluation: 2,000 × 3,450 = 6,900,000 − 6,800,000 = +100,000 gain | confirmed (Σ 100,000 = 100,000; BLE closed) | `XRA:441-449`, `XRA:841-876`; `GJPL:1614-1618` |
| §8 Vendor run "skip invoices in another draft batch" | corrected (optional in BC) | `SVP:466-472`, `SVP:1239-1263` |
