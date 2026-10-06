# BC research: Security, audit, data integrity, multi-company, API, configuration import, job queue

- Source: BCApps (BC v29, MIT). The rules below were read from the AL code. Behaviour that lives in the platform (the AL runtime, not in this repo) is marked **[platform]**.
- Path legend (all repo-relative):
  - `BA/` = `src/Layers/W1/BaseApp/`
  - `SA/` = `src/System Application/App/`
  - `API/` = `src/Apps/W1/APIV2/app/src/pages/`
  - `JQ/` = `src/Layers/W1/BaseApp/Modules/System/JobQueue/` (the task brief named `SA/Job Queue`, which does not exist; the Job Queue lives in the Base App)
  - `RS/` = `src/Layers/W1/BaseApp/System/RapidStart/`
  - `CL/` = `src/Layers/W1/BaseApp/System/ChangeLog/`
- Keep levels: **MUST** = in micro-ERP v1. **SHOULD** = simplified, or soon after v1. **SKIP** = leave out.
- Rule IDs `R-PLATFORM-SECURITY-API-NN` are shortened to `R-NN` in cross-references inside this note. Account numbers in the examples are made up and match the other research notes (1210 Receivables, 3410 VAT payable, 5100 Revenue).

---

## 1. Summary

- **Permissions are data-centric.** A permission set grants, per table, Read/Insert/Modify/Delete, and per code object, Execute. Each grant is *blank*, *Yes* (direct) or *Indirect*. Indirect means the user may touch the table only while running code that itself declares the permission. That is how BC keeps users out of ledger tables while still letting them post.
- **Sets are composed and assigned per company.** Sets include other sets (`IncludedPermissionSets`). Assignment is a row (user or security group, set, company). A blank company means "all companies". The licence **entitlement** is a second ceiling: effective rights = assigned ∩ entitled **[platform]**.
- **User Setup** limits each user: a posting-date window (fixed dates or rolling formulas), an approver chain with amount limits, and invoice-posting policies.
- **Change Log** is opt-in, per table and per field. It writes one row per changed field, with old and new values. Security tables are always logged. Logging cannot be switched off by extension code. Entries about G/L Entry edits are *Protected*.
- **Ledgers are append-only in practice.** G/L entries cannot be inserted or deleted from the UI. Only `Description` can be edited, through a codeunit that re-checks every financial field and forces change logging. Corrections are reversals or credit memos. Posted documents may be deleted only before a configured cut-off date, and only if they have been printed. Deleting one never removes ledger entries.
- **Navigate (Find entries)** answers "what did document X on date D create?" It counts rows in about 40 ledger, posted-document and draft tables that match (Document No., Posting Date, External Doc. No.).
- **Company = data partition.** Almost every table is per company. A new company gets one row for each setup table (G/L Setup, Sales Setup, Company Information, …) the first time someone logs in.
- **APIv2 is worth copying:** GUID ids (`SystemId`) as keys; camelCase entity names; id or number for references, cross-checked; ETag / `If-Match` concurrency; nested line collections; bound actions (`post`, `cancel`); a stable id from draft to posted document.
- **RapidStart packages** import data from Excel or XML into a staging area (record × field, values stored as text). Errors are kept per field. Data is applied in dependency order, in two passes (keys first, then validated fields), and each record succeeds or fails on its own.
- **Job Queue** runs codeunits or reports in the background, once or on a schedule. It runs per company as the user who enqueued the job. It has a status machine, a run log, mutual exclusion by category, and retries with exponential backoff.

---

## 2. Entities

| Entity | BC object | Purpose | Key fields (type) | Keep |
|---|---|---|---|---|
| Permission set (AL object) | `permissionset` e.g. 207 D365 BASIC, 681 D365 JOURNALS, POST, 9977 D365 SALES DOC, POST, 959 D365 BUS FULL ACCESS | Named bundle of rights | `Assignable` Bool; `Access` Public/Internal; `IncludedPermissionSets`; `ExcludedPermissionSets`; `Permissions` = list of `tabledata X = RIMD` / `codeunit X = X` | MUST (as data, not code) |
| Tenant Permission Set / Tenant Permission / Tenant Permission Set Rel. | System tables [platform] | User-defined sets, lines and include/exclude links | Permission: (`App ID` Guid, `Role ID` Code[20], `Object Type`, `Object ID` Int); `Read/Insert/Modify/Delete/Execute Permission` Option {" ", Yes, Indirect}; `Type` {Include, Exclude}; `Security Filter` TableFilter | MUST (lines, include); SKIP exclude, security filter |
| Access Control | System table [platform] | Assigns a set to a user or group | PK (`User Security ID` Guid, `Role ID` Code[20], `Company Name` Text[30], `Scope` {System, Tenant}, `App ID` Guid) | MUST |
| Security Group | Table 9020 (SA) | Group = pseudo-user holding Access Control rows | `Code` Code[20] PK; `Group User SID` Guid; `AAD Group ID` Text[80] | SHOULD (= role) |
| Entitlement | `entitlement` objects (BA/Entitlements) | Licence plan ceiling | `Type` (PerUserServicePlan, Application); `Id` Guid; `ObjectEntitlements` (list of sets) | SKIP (tenant plan flags) |
| Profile | `profile` objects | Role Center UI, not security | `RoleCenter` page ID | SKIP (role dashboards) |
| User Setup | Table 91 | Per-user limits | `User ID` Code[50] PK, NotBlank; `Allow Posting From/To` Date; `Allow Posting From/To DateFormula` (f5991/5992); `Approver ID` Code[50]; `Sales/Purchase Amount Approval Limit` **Integer** (LCY); `Unlimited Sales/Purchase Approval` Bool; `Approval Administrator` Bool; `Substitute` Code[50]; `Sales/Purch. Invoice Posting Policy` Enum; `Allow VAT Date From/To`, `Allow Deferral Posting From/To` Date | MUST (window); SHOULD (approval) |
| Change Log Setup | Table 402 | Master switch | `Change Log Activated` Bool | MUST (always on) |
| Change Log Setup (Table) | Table 403 | What to log per table | `Table No.` Int PK; `Log Insertion/Modification/Deletion` Option {" ", Some Fields, All Fields} | SHOULD (fixed list in code) |
| Change Log Setup (Field) | Table 404 | Field selection for "Some Fields" | PK (`Table No.`, `Field No.`); `Log Insertion/Modification/Deletion` Bool | SKIP |
| Change Log Entry | Table 405 | Audit row, one per field | `Entry No.` BigInt; `Date and Time` DateTime; `User ID` Code[50]; `Table No.`, `Field No.` Int; `Type of Change` Enum {Insertion, Modification, Deletion}; `Old Value`, `New Value` Text[2048]; `Primary Key` Text[250]; `Primary Key Field 1..3 No./Value`; `Record ID`; `Changed Record SystemId` Guid; `Protected` Bool | MUST (as JSON diff per row change) |
| G/L Register | Table 45 | One row per posting run | `No.`; `From/To Entry No.`; `From/To VAT Entry No.`; `Creation Date`, `Creation Time`; `Source Code`; `User ID`; `Journal Batch Name`; `Reversed` | MUST |
| G/L Entry (audit fields) | Table 17 | Ledger line | `User ID` Code[50] (f27); `Source Code` (f28); `Transaction No.` (f52); `Reversed by/Reversed Entry No.` (f74/75); `Last Modified DateTime` (f8005) | MUST |
| Document Entry | Table 265, `TableType = Temporary` | Navigate result row | `Entry No.`; `Table ID`; `Table Name` Text[100]; `No. of Records` Int; `Document Type` | MUST (query result only) |
| Company | System table [platform] | Data partition | `Name` Text[30]; `Id` Guid | MUST (`company_id`) |
| Company Information | Table 79 | Legal identity, one row per company | `Primary Key` Code[10] (blank); `Name` Text[100]; `Address`; `VAT Registration No.` Text[20]; `Registration No.` Text[20]; bank fields; `Picture` BLOB; `Last Modified Date Time` | MUST |
| Setup singletons | T98 G/L Setup, T311 Sales & Receivables Setup, … | Per-company settings | Single row; created by CU 2 Company-Initialize | MUST (`company_setting`) |
| API page | e.g. page 30012 `APIV2 - Sales Invoices`, 30043 lines, 30018 G/L entries, 30009 customers | REST entity | `EntityName`, `EntitySetName`, `ODataKeyFields = SystemId`/`Id`, `DelayedInsert`, `ChangeTrackingAllowed` | MUST (pattern) |
| Sales Invoice Entity Aggregate | Table 5475 | One API view over draft and posted invoices | `Id` Guid; `Status` Enum {Draft, In Review, Open, Paid, Canceled, Corrective}; `Posted` Bool | MUST (concept) |
| Config. Package | Table 8623 | Import or export bundle | `Code` Code[20]; `Package Name` Text[50]; `Processing Order`; `Import Status`/`Apply Status`; `No. of Errors` (FlowField) | SHOULD |
| Config. Package Table | Table 8613 | Table in package | PK (`Package Code`, `Table ID`); `Processing Order` Int; `Skip Table Triggers`, `Delete Recs Before Processing`, `Delayed Insert` Bool; `Parent Table ID`; `Data Template` Code[10] | SHOULD |
| Config. Package Field | Table 8616 | Column in package | PK (+`Field ID`); `Include Field`, `Validate Field`, `Primary Key`, `Create Missing Codes` Bool; `Processing Order` Int | SHOULD |
| Config. Package Record / Data | Tables 8614 / 8615 | Staging rows and cells | Record: (`Package Code`, `Table ID`, `No.` Int), `Invalid`; Data: (+`Field ID`), `Value` **Text[2048]**, `Invalid` | SHOULD |
| Config. Package Error | Table 8617 | Error per (record, field) | PK (`Package Code`, `Table ID`, `Record No.`, `Field ID`); `Error Text` Text[250]; `Error Type` | SHOULD |
| Config. Template Header / Line | Tables 8618 / 8619 | Default values for new records | Line: `Field ID`, `Default Value` Text[2048], `Mandatory`, `Skip Relation Check` | SHOULD (customer/item templates) |
| Job Queue Entry | Table 472 | Background job | `ID` Guid PK; `User ID` Text[65]; `Object Type/ID to Run`; `Record ID to Process`; `Parameter String` Text[250]; `Earliest Start Date/Time`, `Expiration Date/Time`; `Status` Option {Ready, In Process, Error, On Hold, Finished, On Hold with Inactivity Timeout, Waiting}; `Maximum No. of Attempts to Run` (MaxValue 10), `No. of Attempts to Run`; `Rerun Delay (sec.)` 0..3600; `Recurring Job`; `Run on Mondays..Sundays`; `No. of Minutes between Runs`; `Next Run Date Formula`; `Starting/Ending Time`; `Job Queue Category Code` Code[10]; `Priority Within Category`; `Job Timeout` Duration; `Error Message` Text[2048] | MUST (simplified) |
| Job Queue Log Entry | Table 474 | One row per run | `Entry No.`; `ID`; `User ID`; `Start/End Date/Time`; `Status` {Success, In Process, Error}; `Error Message`; `Error Call Stack` BLOB | MUST |
| Job Queue Category | Table 471 | Mutual-exclusion lane | `Code` Code[10] | SHOULD |

---

## 3. Business rules

### Permission model
- **R-PLATFORM-SECURITY-API-01**: A permission line grants R/I/M/D on *table data* or X on any other object. Each value is blank, Yes or Indirect. Editing one value emits an audit message in the RoleManagement category. *Src:* `SA/Permission Sets/src/PermissionImpl.Codeunit.al:89-163,184-205`. *Keep:* MUST. *Notes:* in the new system, permissions are command-level (`sales.invoice.post`) plus data scope. No per-table grants.
- **R-PLATFORM-SECURITY-API-02**: **Indirect = only through trusted code.** Users get `"G/L Entry" = Rimd`: they read directly and write only indirectly. The posting codeunit declares `TableData "G/L Entry" = rimd` (also Cust./Vendor/Bank Ledger Entry, VAT Entry `Rimd`), so the write is legal only inside posting. Journal posters get `"Cust. Ledger Entry" = imd` with no R. *Src:* `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:75-98`; `BA/Permissions/d365journalspost.permissionset.al:36-45`; `BA/Permissions/d365salesdocpost.permissionset.al:63-69,102`. *Keep:* MUST. *Why:* no user, API client or import can write ledger rows except through the posting engine. New system: the ledger tables have no write endpoints, and the DB role used by the API has no INSERT/UPDATE/DELETE on them. Only the posting service writes.
- **R-PLATFORM-SECURITY-API-03**: Execute is not the gate. `BaseApp Objects - Exec` grants X on every codeunit, page, report, query and xmlport. Real control is table-data rights. *Src:* `BA/Permissions/BaseAppObjectsExec.PermissionSet.al:3-13`. *Keep:* SKIP the per-object model. Gate commands instead.
- **R-PLATFORM-SECURITY-API-04**: **Composite sets.** `IncludedPermissionSets` builds a tree: D365 BASIC → Basic-Edit → Basic-Read; JOURNALS, POST ⊃ JOURNALS, EDIT; SALES DOC, POST ⊃ SALES DOC, EDIT; BUS FULL ACCESS ⊃ about 40 functional sets. A set cannot include itself or include the same set twice. Exclusions exist: whole sets (`ExcludedPermissionSets`) or lines of Type=Exclude with the values "Exclude" or "Reduce to indirect". *Src:* `BA/Permissions/d365basic.permissionset.al:3-10`; `d365basicedit.permissionset.al:134-139`; `d365journalspost.permissionset.al:21-26`; `d365salesdocpost.permissionset.al:41-47`; `d365busfullaccess.permissionset.al:172-200`; `SA/Permission Sets/src/PermissionSetRelationImpl.Codeunit.al:298-335`; `PermissionImpl.Codeunit.al:264-289`; `src/Apps/W1/PayablesAgent/app/PermissionSets/PayablesAgRun.Permissionset.al:55-57`. *Keep:* MUST include (flatten into an effective set when the user is resolved). SKIP exclude.
- **R-PLATFORM-SECURITY-API-05**: Non-assignable building blocks. Internal or `Assignable = false` sets (e.g. `Security - Baseapp`, `BaseApp Objects - Exec`) can only be included in other sets. *Src:* `BA/Permissions/SecurityBaseApp.PermissionSet.al:14-18`; `BaseAppObjectsExec.PermissionSet.al:5-6`. *Keep:* SHOULD (only roles are assignable).
- **R-PLATFORM-SECURITY-API-06**: **Entitlement ceiling.** A plan lists the sets it entitles. Essentials includes `D365 BUS FULL ACCESS`. Team Member gets only `D365 READ` + `D365 TEAM MEMBER` (plus basics). The runtime intersects assigned and entitled rights **[platform]**. *Src:* `BA/Entitlements/Dynamics365BusinessCentralEssentialsBaseApp.Entitlement.al:7-18`; `…TeamMemberBaseApp.Entitlement.al:7-18`. *Keep:* SKIP. Use plan feature flags per tenant (for example, "eBarimt module enabled").
- **R-PLATFORM-SECURITY-API-07**: **Per-company assignment.** An Access Control row carries `Company Name`. An empty string applies to all companies. The lookup filters `Company Name = '' | <company>`. Security groups get sets the same way, with a company. *Src:* `SA/User Permissions/src/UserPermissionsImpl.Codeunit.al:247-256,291-305`; `SA/Security Groups/src/SecurityGroupImpl.Codeunit.al:117-150`. *Keep:* MUST (`member_company_role`, where a null company = all).
- **R-PLATFORM-SECURITY-API-08**: **Last-SUPER guard.** You cannot delete or rename the last company-blank SUPER Access Control row, delete its user, or disable it. The delete/rename guards run only on SaaS; the "disable the user" guard has no SaaS check, so it also applies on-prem (verified-corrected). "Another SUPER" must be an enabled real user: not a group, not the sync daemon. The check locks Access Control. *Src:* `UserPermissionsImpl.Codeunit.al:54-141,144-153,169-197`. *Keep:* MUST (every tenant always keeps ≥ 1 active Owner).
- **R-PLATFORM-SECURITY-API-09**: **Security filters.** A permission line can carry a record filter (`Security Filter`). Code chooses per record variable whether it is `Filtered` (applied) or `Ignored`. *Src:* `SA/Permission Sets/src/TenantPermissionSubForm.page.al:191-213`; `BA/Foundation/Navigate/Navigate.Page.al:700-701`; `JQ/JobQueueEntry.Table.al:762-784`. *Keep:* SKIP v1 (company is the only row scope). SHOULD later for "salesperson sees own customers".
- **R-PLATFORM-SECURITY-API-10**: Security-relevant tables are **always** change-logged, whatever the setup says: User, User Property, Access Control, Permission Set, Permission, Tenant Permission*, Plan/User Plan, all Change Log Setup tables, Field Monitoring Setup. *Src:* `CL/ChangeLogManagement.Codeunit.al:174-195`. *Keep:* MUST.

### User Setup
- **R-PLATFORM-SECURITY-API-11**: **Posting window resolution.** If the user has a User Setup row with a non-blank From or To, that window is used. Otherwise the G/L Setup window is used. A blank To becomes 31-12-9999. A blank From means no lower bound (0D). A date formula, evaluated against **TODAY**, overrides the fixed date, and entering one clears the other. Valid ⇔ `From ≤ PostingDate ≤ To`. *Src:* `BA/System/User/UserSetupManagement.Codeunit.al:216-220,335-373,446-459`; `BA/System/User/UserSetup.Table.al:37-61,329-350`. *Keep:* MUST. See also R-PERIODS-REPORTING-08/09 in `bc-periods-reporting.md`.
- **R-PLATFORM-SECURITY-API-12**: From > To is an error only when both are non-blank. A formula-derived range with From > To is also an error. *Src:* `UserSetupManagement.Codeunit.al:245-260,455-458`. *Keep:* MUST.
- **R-PLATFORM-SECURITY-API-13**: **Approval chain.** `Approver ID` ≠ own `User ID`. Limits are integers ≥ 0. Setting "Unlimited" forces the limit to 0. Only one user may be `Approval Administrator`. An approver is sufficient if Unlimited, OR (amount LCY ≤ limit AND limit ≠ 0). Limit 0 without Unlimited therefore means *no* authority. Otherwise the request walks up `Approver ID`. After more hops than there are User Setup rows, it errors, which guards against cycles. The sales approval amount is `TotalSalesLineLCY.Amount`, i.e. **excluding VAT**, after invoice discount. *Src:* `UserSetup.Table.al:99-165,241-261`; `BA/OtherCapabilities/Approvals/ApprovalsMgmt.Codeunit.al:932-990,1168-1186,1390-1408`. *Keep:* SHOULD (single approver + limit, off by default).
- **R-PLATFORM-SECURITY-API-14**: Invoice posting policy: Prohibited → the user may only ship/receive; Mandatory → ship + invoice. *Src:* `UserSetup.Table.al:290-297`; `UserSetupManagement.Codeunit.al:461-486`. *Keep:* SKIP.

### Change Log
- **R-PLATFORM-SECURITY-API-15**: **Scope.** Nothing is logged unless `Change Log Activated` is set (or field monitoring is on). Each table has Insert/Modify/Delete set to blank, Some Fields or All Fields. A rename follows the Modification setting. The Change Log Entry table is never logged. Nothing is logged when there is no company context. *Src:* `CL/ChangeLogSetupTable.Table.al:26-80`; `CL/ChangeLogManagement.Codeunit.al:39-89,91-172`. *Keep:* MUST, simplified: always on for master data, setup, security and drafts. Ledgers are append-only and need no row log.
  - Change logging runs only when the execution context is Normal. Global Trigger Management skips both the trigger setup and the Log* calls in install and upgrade code, so data changed by upgrade code is never change-logged, not even for always-logged tables (added-in-verification). *Src:* `BA/GlobalTriggerManagement.Codeunit.al:62-64,76-77,97-98,117-118,136-137`. *Keep:* MUST: migrations and seed scripts must write their own audit record (for example, one `audit.row_change` batch row per migration).
- **R-PLATFORM-SECURITY-API-16**: Tamper-resistance. The code comment says not to add events that can switch logging off. Extensions may only *add* always-logged tables. G/L Entry, Cust. Ledger Entry and Vendor Ledger Entry become always-logged while their edit codeunits are bound. CU 423 is the code that writes entries; it declares `"Change Log Entry" = ri`. The standard SaaS sets give users only *indirect* rights on the table (`Rimd` in D365 BUS FULL ACCESS and Security - Baseapp, `i` in D365 Basic - Edit), so users cannot insert entries directly. The claim that only CU 423 *can* insert is too strong: report 510 also declares `rid`, and the on-prem `CHANGELOG EDIT` set grants direct `RIMD` (verified-corrected). *Src:* `ChangeLogManagement.Codeunit.al:8-17,41,174-195`; `BA/Finance/GeneralLedger/Ledger/GLEntryEdit.Codeunit.al:58-63`; `BA/Sales/Receivables/LedgEntryTrackChanges.Codeunit.al:13-22`. *Keep:* MUST (audit writes come from a DB trigger, not the app).
- **R-PLATFORM-SECURITY-API-17**: **Row format.** One entry per changed field. On *insert*, only fields with a value are logged: false, 0, 0D/0T, blank and BLOB are skipped, and Options are always logged. On *modify*, the old value is re-read from the DB with ReadCommitted and security filtering applied. If the user cannot read it, Old Value = ''. Values use invariant format `Format(v,0,9)`. Password-like User Property fields are masked as `*`. Up to 3 PK field values, the Record ID and the changed record's SystemId are stored. The row is written in the record's own company. *Src:* `ChangeLogManagement.Codeunit.al:197-265,267-326,355-375,382-422`. *Keep:* MUST (store a JSON before/after per row with record GUID, user, timestamp and correlation id).
- **R-PLATFORM-SECURITY-API-18**: **Protection and retention.** Entries for table 17 (G/L Entry) are flagged `Protected` on insert. The delete report removes unprotected entries in bulk. It defaults to entries older than TODAY − 1 year and asks for confirmation if newer entries are included. It then tries protected entries one at a time and collects the failures. The retention policy for protected entries is 1 year and **locked**. *Src:* `CL/ChangeLogEntry.Table.al:197-200,271-280`; `CL/ChangeLogDelete.Report.al:25-35,61-85,121-137`; `BA/OtherCapabilities/RetentionPolicy/RetenPolInstallBaseApp.Codeunit.al:154-176`. *Keep:* MUST (no deletion of audit rows within the statutory retention period).

### Ledger immutability and deletion
- **R-PLATFORM-SECURITY-API-19**: **G/L entries.** The list page has `InsertAllowed = false` and `DeleteAllowed = false`. A modify runs CU 115, which locks the row, copies **only `Description`**, and then asserts that Entry No., Posting Date, Amount, Document No., VAT Amount, Debit and Credit are unchanged. It binds always-log for table 17. Every insert, modify or rename stamps `Last Modified DateTime`. *Src:* `BA/Finance/GeneralLedger/Ledger/GeneralLedgerEntries.Page.al:35-41,715-724`; `GLEntryEdit.Codeunit.al:18-43`; `GLEntry.Table.al:850-863`. *Keep:* MUST (immutable). SKIP description edits; use a separate annotation table instead.
- **R-PLATFORM-SECURITY-API-20**: **Customer ledger entries.** These are always editable: On Hold, Description, Promised Pay Date, Dispute Status, Exported to Payment File. These are editable only while the entry is **Open**: Due Date (also copied to the detailed entries' `Initial Entry Due Date` and the posted invoice header), Pmt. Discount Date, Applies-to ID, Payment Method/Reference, tolerances, Amount to Apply. Changes to tracked fields are change-logged. *Src:* `BA/Sales/Receivables/CustEntryEdit.Codeunit.al:23-73,106-140`. *Keep:* MUST for due date and dispute/hold on open entries. SKIP the rest.
- **R-PLATFORM-SECURITY-API-21**: Corrections are new postings. The API offers `Cancel`, `CancelAndSend` and `MakeCorrectiveCreditMemo` on posted invoices. There is no update. *Src:* `API/APIV2SalesInvoices.Page.al:962-974,1111-1150`. *Keep:* MUST.
  - Cancel preconditions (added-in-verification). `TestCorrectInvoiceIsAllowed` refuses cancellation when:
    - the original invoice's posting date is outside the user's allowed posting window;
    - the invoice was already corrected or canceled;
    - the invoice is itself a corrective document;
    - it is paid or partly applied (`Amount Including VAT ≠ Remaining Amount`);
    - the sell-to or bill-to customer is blocked;
    - no credit-memo number is free;
    - the inventory period is closed;
    - it is a prepayment invoice or a drop shipment.

    `MakeCorrectiveCreditMemo` also errors if the invoice is not fully open. *Src:* `BA/Sales/History/CorrectPostedSalesInvoice.Codeunit.al:349-370,550-563,587-593`; `API/APIV2SalesInvoices.Page.al:1141-1153`. *Keep:* MUST (cancel only an unpaid invoice whose period is open; otherwise use a credit memo dated today).
- **R-PLATFORM-SECURITY-API-22**: **Deleting a posted invoice** is allowed only if: legal retention allows it (an interface; the W1 default always allows), Sales Setup `Allow Document Deletion Before` is set and PostingDate < that date, and `No. Printed` > 0. It deletes lines, comments and approval/deferral history, but **no ledger entries**. A posted shipment line can be deleted only if `Quantity Invoiced = Quantity`. *Src:* `BA/Sales/History/SalesInvoiceHeader.Table.al:1344-1363,1395-1405`; `BA/Sales/History/PostSalesDelete.Codeunit.al:132-145,342-357`; `BA/Finance/GeneralLedger/Setup/DefaultRetentionPeriodDef.Codeunit.al:11-47`. *Keep:* SKIP deletion entirely. Posted documents are permanent; archive only.
- **R-PLATFORM-SECURITY-API-23**: **Gap placeholders.** Deleting a *draft* that already reserved a posting, shipping or prepayment number inserts a placeholder posted document. It has that number, Posting Date = TODAY, the current User ID, Source Code = Source Code Setup "Deleted Document", and one line whose description is the source-code text. *Src:* `PostSalesDelete.Codeunit.al:48-126,232-340`; `BA/Sales/Document/SalesHeader.Table.al:3720`. *Keep:* MUST (or never reserve a legal number before posting; see the numbering rules in `bc-dimensions-noseries-audit.md`).
- **R-PLATFORM-SECURITY-API-24**: **Deleting G/L accounts and customers.** A G/L account of type Posting needs Balance = 0; the balance test is skipped for heading and total accounts (verified-corrected). Any account also needs no entries on or after the first open period's start. If closed years exist, `Block Deletion of G/L Accounts` must be false and `Allow G/L Acc. Deletion Before` must be set. Entries or budget on or after that date need confirmation, otherwise it errors. Then the remaining entries are **re-pointed to account '' (blank)**. A customer cannot be deleted with entries in an open year or with open entries; its old entries are also re-pointed. *Src:* `BA/Utilities/MoveEntries.Codeunit.al:103-163,495-552`; `BA/Finance/GeneralLedger/Account/GLAccount.Table.al:1128-1144`. *Keep:* MUST block deleting any account or party that has entries (use `blocked`). SKIP moving entries.

### Navigate / document trace
- **R-PLATFORM-SECURITY-API-25**: **Find entries.** The input is a Document No. filter, a Posting Date filter and an External Doc. No. Nothing happens if all three are blank. For each table: posted headers (16), ledgers (G/L, VAT, Cust./Vendor + detailed, bank/check, item/value, FA/maintenance, job, resource, cost, …), drafts (sales and purchase quotes, orders, invoices, credit memos) and unposted journal lines are counted, but only if the user has read permission. The result is a temporary list of (Table ID, name, count). Detailed, VAT, bank and FA ledgers are searched only when Document No. or Posting Date is non-blank. Opened from a record, **both** the exact Document No. and the exact Posting Date are set. *Src:* `BA/Foundation/Navigate/Navigate.Page.al:790-878,880-968,1119-1141,2012-2047`; `DocumentEntry.Table.al:10-13,103-120`. *Keep:* MUST. *Why:* document numbers repeat across series and years, so the posting date is part of the identity.
- **R-PLATFORM-SECURITY-API-26**: Source detection. If exactly one customer/vendor ledger entry or posted header matches, Navigate shows its posting date, type, number and partner. An external-document search for a partner builds OR-filters of all matching (date, document no.) pairs and then runs R-25. *Src:* `Navigate.Page.al:698-788,1488-1538,1792-1811`. *Keep:* SHOULD.

### Multi-company
- **R-PLATFORM-SECURITY-API-27**: **Company = partition.** Tables are per company unless declared `DataPerCompany = false` (41 such tables in the Base App, e.g. No. Series Tenant and Report Layout Selection). On login with a UI, if G/L Setup does not exist, CU 2 inserts the empty setup singletons (G/L, Sales, Purchases, Inventory, FA, VAT, Company Information, … about 25), source codes, standard texts, report selections and workflows, then commits. Deleting a company removes its rows from the shared tables that are keyed by company name. *Src:* `BA/Foundation/Company/CompanyInitialize.Codeunit.al:97-130,277-436,750-791`; `BA/Foundation/NoSeries/NoSeriesTenant.Table.al:12`. *Keep:* MUST (`company_id` on every business row with row-level security, and a seed transaction when a company is created rather than lazily on login).
- **R-PLATFORM-SECURITY-API-28**: **Company Information** is one row (`Primary Key` = blank). It declares `InherentPermissions = X` and `InherentEntitlements = X`. On a table object, X is *execute on the table object*, not read on its data, so the earlier claim "inherent X lets every user read it" is wrong. Users can read the row because the base permission sets grant `tabledata "Company Information" = R`: Security - Baseapp, D365 Basic - Read, D365 READ, and the sales and purchase document sets. In practice almost every user can read it (verified-corrected). `VAT Registration No.` is upper-cased and format-checked on validate. Insert and modify stamp `Last Modified Date Time`. *Src:* `BA/Foundation/Company/CompanyInformation.Table.al:20-32,131-158,513-525`; `BA/Permissions/SecurityBaseApp.PermissionSet.al:28`; `BA/Permissions/d365basicread.permissionset.al:318`. *Keep:* MUST (for MN: name, ТТД/registration no., address, bank, logo, eBarimt merchant data).
- **R-PLATFORM-SECURITY-API-29**: Cross-company effects are explicit. The Change Log writes into the record's company (`ChangeCompany`). Jobs are scheduled with `CurrentCompany()`. *Src:* `ChangeLogManagement.Codeunit.al:204-205`; `JQ/JobQueueEntry.Table.al:859-863`. *Keep:* MUST (each command carries `company_id`; no implicit "current company" in background work).

### API v2 patterns
- **R-PLATFORM-SECURITY-API-30**: **Naming and keys.** One API page per entity: camelCase `EntityName` (`salesInvoice`) and plural `EntitySetName` (`salesInvoices`). The key is a GUID (`ODataKeyFields = SystemId`/`Id`), never the business number. The id cannot be changed ("The id cannot be changed"). `lastModifiedDateTime` = `SystemModifiedAt`. `ChangeTrackingAllowed = true` allows webhooks. *Src:* `API/APIV2SalesInvoices.Page.al:16-27,617-621,698-711`; `API/APIV2Customers.Page.al:12-21,334`. *Keep:* MUST.
- **R-PLATFORM-SECURITY-API-31**: **References by id or number, cross-checked.** Setting `customerId` resolves the customer by SystemId and fills the number. Setting `customerNumber` after `customerId` must match, or it errors. One of the two is required. *Src:* `APIV2SalesInvoices.Page.al:121-160,817-823`. *Keep:* MUST.
- **R-PLATFORM-SECURITY-API-32**: **Stable id from draft to posted.** Posting copies the draft's SystemId into `Sales Invoice Header."Draft Invoice SystemId"`. The aggregate returns that as the id, so the client keeps one URL. Status is derived. For posted invoices the order is Canceled > Corrective > Paid (Closed) > Open. For unposted invoices, Sales Header status Pending Approval → `In Review`, **Released or Pending Prepayment → `Open`**, anything else → `Draft`. So `status: "Open"` alone does not mean posted; check the `posted` flag. The `post` action is gated on `Posted = false`, not on status Draft (verified-corrected). *Src:* `BA/Sales/Posting/SalesPost.Codeunit.al:7248`; `BA/Integration/Entity/SalesInvoiceAggregator.Codeunit.al:517-532,536-560,587-613`; `API/APIV2SalesInvoices.Page.al:915-925`. *Keep:* MUST.
- **R-PLATFORM-SECURITY-API-33**: **Nested lines.** Lines are a subpage linked by `Document Id`. Each line's key is its own SystemId. `sequence` = Line No. `itemId` XOR `accountId`. `lineObjectNumber` cannot change once set. Dimension set lines, attachments and the PDF are also subresources. *Src:* `APIV2SalesInvoices.Page.al:549-570,640-654`; `API/APIV2SalesInvoiceLines.Page.al:10-21,31-120`. *Keep:* MUST.
- **R-PLATFORM-SECURITY-API-34**: **Field-set order is replayed.** Each field's OnValidate records `RegisterFieldSet(FieldNo)` with an increasing order number. Insert and modify then apply the fields in that order through the aggregator. Validation side effects therefore follow the client's order. There is one exception on insert. After the header is created, `SetDates` clears the buffer and re-applies `invoiceDate` (Document Date), then `postingDate`, then `dueDate`, in that fixed order. `invoiceDate` does **not** set the Posting Date: Sales Header `Document Date` OnValidate does not touch it, so the posting date stays at WorkDate unless `postingDate` is sent (verified-corrected). *Src:* `APIV2SalesInvoices.Page.al:682-711,788-801,875-899`; `BA/Sales/Document/SalesHeader.Table.al` field 99 OnValidate. *Keep:* SHOULD. Better: a fixed, documented apply order (partner → dates → currency → lines), independent of JSON order.
- **R-PLATFORM-SECURITY-API-35**: **Bound actions.** `POST …/salesInvoices({id})/Microsoft.NAV.post` checks that the invoice is a draft, posts through the normal engine (`SendToPosting(Sales-Post)`) and returns the resulting entity key. Journals have `post` for a whole batch. *Src:* `APIV2SalesInvoices.Page.al:915-925,976-988,1045-1070`; `API/APIV2Journals.Page.al:100-122`. *Keep:* MUST (`POST /sales-invoices/{id}/post`).
- **R-PLATFORM-SECURITY-API-36**: **Optimistic concurrency.** PATCH and DELETE must send `If-Match: <@odata.etag>` from a previous GET. The etag comes from the row version **[platform]**. `*` forces the write. *Src:* `src/Layers/W1/Tests/TestLibraries/LibraryGraphMgt.Codeunit.al:101-131,170-179,396-403`. *Keep:* MUST (no `*` on financial drafts).
- **R-PLATFORM-SECURITY-API-37**: **Read-only ledgers and permission-aware lists.** G/L entries via the API are `Editable = false` with insert, modify and delete disallowed. The invoice list hides drafts if the caller cannot read Sales Header, and hides posted invoices if the caller cannot read Sales Invoice Header. *Src:* `API/APIV2GLEntries.Page.al:5-20`; `APIV2SalesInvoices.Page.al:825-855`. *Keep:* MUST.

### Configuration packages (RapidStart)
- **R-PLATFORM-SECURITY-API-38**: **Staging model.** A package has tables. Each table has fields marked Include, Validate, Primary Key and a Processing Order. Records hold cells as text (`Value` Text[2048]). Errors are stored per (record, field). A PK field cannot be excluded. Including a field sets Validate = Include. *Src:* `RS/ConfigPackageField.Table.al:50-97`; `RS/ConfigPackageData.Table.al:5-57`; `RS/ConfigPackageError.Table.al:5-86`. *Keep:* SHOULD (import → preview with per-cell errors → apply).
- **R-PLATFORM-SECURITY-API-39**: **Apply algorithm.** (a) Optionally compute table order from PK relations: a table that a PK field relates to is processed first, and a cycle is an error. (b) Sort by (Package Processing Order, Processing Order). (c) Pass 1 inserts the **primary keys only**. Pass 2 sets the other fields in field Processing Order, with validation. (d) Order is parents → children → grandchildren, by `Parent Table ID`. (e) Each record runs in its own try. A failure is stored as a record error and processing continues. Records with PK errors are skipped in pass 2. (f) Applied staging rows are deleted. API buffer tables cannot be imported. (g) Unless the package table has `Delayed Insert`, pass 1 already **inserts a key-only target row** (for a journal: template, batch and line no., with blank account and zero amount). If that record then fails in pass 2, the key-only row stays in the target table, and the staging row stays with its error. With `Delayed Insert`, nothing is inserted until every field has been validated (added-in-verification). *Src:* `RS/ConfigPackageManagement.Codeunit.al:148-184,1070-1203,1205-1229,1243-1306,1424-1498,2522-2528`. *Keep:* SHOULD (fixed import order per entity type; per-row result report).
- **R-PLATFORM-SECURITY-API-40**: Inserts go through table triggers (`Config. Insert With Validation`) unless `Skip Table Triggers` is set. Template defaults are applied before the field values. `Delete Recs Before Processing` truncates the target table first. *Src:* `ConfigPackageManagement.Codeunit.al:340-394,433-476,1270-1274`. *Keep:* MUST always validate through the domain layer. SKIP "skip triggers" and "delete before processing".
- **R-PLATFORM-SECURITY-API-41**: **Excel layout.** One sheet per table. A1 = package code, B1 = table caption, C1 = table ID. Row 3 holds the column headers, and data starts at row 4. *Src:* `RS/ConfigExcelExchange.Codeunit.al:592,656-685,714-715`. *Keep:* SHOULD (one template per entity with a header row and a hidden id cell).
- **R-PLATFORM-SECURITY-API-42**: **Templates.** Applying a template to a new record first makes sure the key exists, filling it from the No. Series if needed. If the key cannot be created, it errors. Then each template line's default value is validated into its field. *Src:* `RS/ConfigTemplateManagement.Codeunit.al:38-60`. *Keep:* SHOULD.

### Job Queue
- **R-PLATFORM-SECURITY-API-43**: **Scheduling.** A job has Earliest Start and Expiration; an expired job is deleted, not run. It is recurring if any weekday is ticked or `Next Run Date Formula` is set; with no interval, the default is 1440 min. A recurring job cannot "Run in User Session". The time window (Starting/Ending Time) may wrap midnight. *Src:* `JQ/JobQueueEntry.Table.al:41-75,175-190,1073-1096`; `JQ/JobQueueDispatcher.Codeunit.al:13-56,132-158`. *Keep:* MUST (cron-like schedule, expiry).
- **R-PLATFORM-SECURITY-API-44**: **Status machine.** The statuses are Ready, In Process, Error, On Hold, Finished, On Hold with Inactivity Timeout and Waiting. An In Process job cannot be deleted. Changing the object, ID or parameter reschedules the job. At run start the status is set to In Process (with session info) and committed, and a log row is inserted. After the run, a non-recurring job is **deleted** and a recurring one is re-enqueued for its next time. *Src:* `JobQueueEntry.Table.al:159-165,476-506,593-647,990-1012`; `JobQueueDispatcher.Codeunit.al:76-130`; `JQ/JobQueueLogEntry.Table.al:56-60`. *Keep:* MUST (keep finished one-off jobs for audit instead of deleting them).
- **R-PLATFORM-SECURITY-API-45**: **Retries.** On failure the error handler logs the error (message, register, call stack) and finalizes the job. If `attempts < Max` and `attempts < 10`, then attempts += 1 and the job is re-enqueued. Otherwise Status = Error and a notification session starts. *Src:* `JobQueueEntry.Table.al:149-157,389-394,1014-1042`; `JQ/JobQueueErrorHandler.Codeunit.al:11-64`. *Keep:* MUST.
- **R-PLATFORM-SECURITY-API-46**: **Categories serialize.** Inside one category, a job that finds another In Process (scheduled) job reschedules itself as Waiting. When a job finishes, the next Waiting job by (Priority, Entry No.) is set Ready. The category row is the semaphore (UpdLock). *Src:* `JobQueueDispatcher.Codeunit.al:161-196,299-317`. *Keep:* SHOULD (per-company lane for posting and eBarimt).
- **R-PLATFORM-SECURITY-API-47**: **Security context.** Enqueueing requires write permission on Job Queue Entry, its log, Error Message and Error Message Register. The job runs as the **enqueuing user** (`User ID` is set when it is scheduled) in that company, with a default timeout of 12 h. *Src:* `JobQueueEntry.Table.al:762-784,839-868`; `JQ/JobQueueEnqueue.Codeunit.al:13-50`. *Keep:* MUST (store the actor; re-check permissions when the job runs).
- **R-PLATFORM-SECURITY-API-48**: **Background posting.** Enqueueing releases the document and sets `Job Queue Status` = Scheduled for Posting. A second enqueue is refused unless the status is blank or Error. The job sets Posting, runs Sales-Post, and then sets blank on success or Error on failure. The posting job entry is built with category `SALESBCKGR` and `Notify On Success` from Sales Setup. It does **not** set `Maximum No. of Attempts to Run`, which therefore stays 0, so a failed background posting is not retried automatically. A user must fix the document and enqueue it again (added-in-verification). *Src:* `BA/Sales/Posting/SalesPostviaJobQueue.Codeunit.al:20-57,70-79,95-124,128-148`; `JQ/JobQueueEntry.Table.al:149-153,1026`. *Keep:* SHOULD (micro-ERP posts synchronously; use the queue for eBarimt submission, bank import and FX rates).

---

## 4. Flows

**F1 Effective permission check (BC)**
1. Collect the Access Control rows for the user and the user's security groups where Company Name ∈ {'', current}.
2. Expand each set through its includes; apply excludes.
3. Intersect with the licence entitlement **[platform]**.
4. On table access, decide on direct rights, or on indirect rights if the running object declares them. Apply the security filter if the record variable is Filtered.

**F2 Posting-date check (every posting line)**
1. Read the User Setup row. Evaluate any formulas against TODAY.
2. If From and To are both blank, use G/L Setup the same way.
3. Blank To → 9999-12-31.
4. Error if the date is outside [From, To].

**F3 Change-log write (on each DB write)**
1. The platform asks `GetDatabaseTableTriggerSetup`. Change Log is consulted only in the Normal execution context, so install and upgrade code is skipped (added-in-verification). The call exits early if there is no company or the table is Change Log Entry; always-logged tables log everything.
2. For a modify, re-read the old row (ReadCommitted, security-filtered).
3. For each normal field: skip it if it has no value (insert/delete) or is unchanged (modify), or if field-level logging is off.
4. Insert a Change Log Entry in the record's company. Protected is set on insert.

**F4 Navigate**
1. Set the filters (Document No., Posting Date, Ext. Doc. No.).
2. Clear the temporary Document Entry list.
3. Find posted documents (16 header tables).
4. Find ledger entries (14 groups).
5. Find drafts and journal lines.
6. If exactly one partner entry or header was found, derive the source.
7. Show the counts; drill down per table.

**F5 Create company**
1. Create the company **[platform]**.
2. On first UI login, CU 2: setup singletons → source codes → standard texts → report selections → bank formats → workflows → upgrade tags → commit.
3. The user fills Company Information and the setups, or applies a configuration package.

**F6 API draft → post**
1. `POST /salesInvoices` with `customerId` or `customerNumber`, plus `postingDate` if it should differ from WorkDate. Fields are applied in the order they were set, except that the three dates are re-applied after insert in the fixed order invoiceDate → postingDate → dueDate (verified-corrected).
2. `POST …/salesInvoiceLines` (`itemId` or `accountId`, quantity, unitPrice).
3. `GET` returns the totals and the `@odata.etag`.
4. `PATCH` with `If-Match`.
5. `POST …/Microsoft.NAV.post`: draft check → Sales-Post.
6. `GET /salesInvoices({sameId})` returns status Open.

**F7 Package import**
1. Import Excel/XML into the staging records and data.
2. Validate: check relations against company data and against the package itself; write errors.
3. Fix the errors in staging or in the file.
4. Apply: order tables → PK pass → field pass → parents/children → per-record try → delete applied rows.
5. Review the remaining errors.

**F8 Job execution**
1. Enqueue: check permissions → status On Hold → insert or modify → `TaskScheduler.CreateTask(dispatcher, errorHandler, company, start)` → status Ready.
2. Dispatcher: if expired → delete. If outside the time window → reschedule. If the category is busy → Waiting.
3. Otherwise: In Process → commit → log row → run → `SetResult` → finalize the log → `FinalizeRun` (delete, or re-enqueue if recurring).
4. On error: the error handler logs the error → `FinalizeRun` → retry with backoff, or Error + notify.

---

## 5. Calculations & rounding

- **Posting window with formulas.** TODAY = 2026-10-06, From formula `-CM`, To formula `CM` → From = 2026-10-01, To = 2026-10-31. A fixed From of 2026-09-01 with To blank → [2026-09-01, 9999-12-31]. The bounds are inclusive. Dates are compared without time. A closing date C31-12 lies between 31-12 and 01-01 (see `bc-gl-posting.md`).
- **Approval sufficiency.** `sufficient = Unlimited OR (0 < Limit AND AmountLCY ≤ Limit)`. `AmountLCY` = the sum of line `Amount` in LCY: excluding VAT, after line and invoice discounts. The limit is an **Integer**, so it holds whole currency units, which suits MNT.
- **Change-log purge default.** The filter is `Date and Time ≤ CreateDateTime(CalcDate('<-1Y>', TODAY), 0T)` → with TODAY = 2026-10-06, entries at or before 2025-10-06 00:00:00.
- **Job retry backoff** (after the increment, n = attempts):
  - `nextStart = now + 1000 · RerunDelaySec + extra(n)` ms.
  - `extra(n) = 10^n` ms for n ≤ 7, and `6 h` for n ≥ 8. That gives n = 1…7: 10 ms, 100 ms, 1 s, 10 s, 100 s, 16.7 min, 2.78 h.
  - The maximum is 10 attempts (`MaxValue = 10`, and `< 10` in code).
- **Next recurring run.**
  - If a Next Run Date Formula is set: `CreateDateTime(CalcDate(formula, date of now), StartingTime)`. The function **returns at once** on this path, so the weekday and time-window step below does not apply (verified-corrected).
  - Else if minutes > 0: `now + minutes`.
  - Else: 00:00 on the day after the job's previous `Earliest Start Date/Time`, or after now if that is blank (verified-corrected).
  - Only for the last two cases: move forward to the first ticked weekday (up to 7 days) and into the [Starting, Ending] time window (`JobQueueDispatcher.Codeunit.al:319-347,383-442`).
  - Inactivity hold: `now + InactivityTimeoutPeriod` minutes, min 5 (`JobQueueEntry.Table.al:409-414`).
- **Navigate counts** are plain `COUNT(*)` with the given filters. No amounts are summed.
- **Rounding:** none in this subsystem. Money appears only through the posting engine, so the posting notes apply.

---

## 6. Worked posting examples

Currency MNT, VAT 10%. Amount is signed (+ debit, − credit).

### 6.1 Invoice created and posted through the API, then traced with Navigate
1. Client: `POST /companies({c})/salesInvoices {customerNumber:"C001", invoiceDate:"2026-10-30", postingDate:"2026-10-30"}` → id `7f3c…`. `postingDate` must be sent explicitly: `invoiceDate` maps to Document Date only, and without `postingDate` the invoice would post on the WorkDate of the API session (verified-corrected).
2. Two lines: 6 × 100,000 and 4 × 100,000, both with VAT10. Then `post`.
3. Posted no. SI26-00042, posting date 2026-10-30, User ID = the API user, Source Code SALES.

| # | Account | Debit | Credit | Amount |
|---|---|---:|---:|---:|
| 1 | 1210 Receivables (CLE +1,100,000) | 1,100,000 | | +1,100,000 |
| 2 | 5100 Revenue, goods | | 1,000,000 | −1,000,000 |
| 3 | 3410 VAT payable | | 100,000 | −100,000 |
| | **Total** | **1,100,000** | **1,100,000** | **0** |

- `GET /salesInvoices(7f3c…)` → `status: "Open"`. The id is unchanged (R-32).
- Navigate(SI26-00042, 2026-10-30) → Posted Sales Invoice 1, G/L Entry 3, VAT Entry 1, Cust. Ledger Entry 1, Detailed Cust. Ledg. Entry 1. Source = Customer C001. These counts hold when the two lines are G/L-account lines (`accountId` → 5100). The revenue lines share one posting setup, so they compress into a single 5100 G/L entry. If they are **item** lines, Navigate also shows Item Ledger Entry 2 and Value Entry 2. It shows a Posted Sales Shipment 1 when Sales Setup "Shipment on Invoice" is on. With Automatic Cost Posting on, there are extra COGS/Inventory G/L entries, so the G/L Entry count is above 3 (verified-corrected).
- G/L Register: one row, From/To Entry No. covering the 3 entries.

### 6.2 Correction by `cancel`, not by edit or delete
`POST …/salesInvoices(7f3c…)/Microsoft.NAV.cancel` → corrective credit memo SCM26-00007, 2026-10-31, applied to the invoice.

| # | Account | Debit | Credit | Amount |
|---|---|---:|---:|---:|
| 1 | 5100 Revenue, goods | 1,000,000 | | +1,000,000 |
| 2 | 3410 VAT payable | 100,000 | | +100,000 |
| 3 | 1210 Receivables (CLE −1,100,000, closes the invoice CLE) | | 1,100,000 | −1,100,000 |
| | **Total** | **1,100,000** | **1,100,000** | **0** |

Net effect of 6.1 + 6.2 on each account is 0. The invoice API status becomes `Canceled`. Both documents stay, and so do all 6 G/L entries.

### 6.3 Posting window: rejected and then accepted
TODAY = 2026-10-06.
- User CASHIER has User Setup formulas `-CM`..`CM`, giving [2026-10-01, 2026-10-31]. A cash receipt dated 2026-09-30 for 550,000 → error "posting date is not within your range of allowed posting dates". No entries are created and no number is consumed.
- User ACC1 has no User Setup row. G/L Setup is [2026-09-01, 2026-12-31], so the posting succeeds:

| # | Account | Debit | Credit | Amount |
|---|---|---:|---:|---:|
| 1 | 1010 Cash | 550,000 | | +550,000 |
| 2 | 1210 Receivables (CLE −550,000) | | 550,000 | −550,000 |
| | **Total** | **550,000** | **550,000** | **0** |

### 6.4 Editing a posted G/L entry (Description only)
Entry 1001 (6.1 row 1): Description "Invoice SI26-00042" → "Invoice SI26-00042 contract 15". CU 115 re-checks Amount +1,100,000, Debit 1,100,000, Credit 0, VAT Amount 0, Posting Date and Document No. All are unchanged, so the modify goes ahead.

| Entry | Account | Debit before/after | Credit before/after |
|---|---|---:|---:|
| 1001 | 1210 | 1,100,000 / 1,100,000 | 0 / 0 |
| 1002 | 5100 | 0 / 0 | 1,000,000 / 1,000,000 |
| 1003 | 3410 | 0 / 0 | 100,000 / 100,000 |
| **Total** | | **1,100,000** | **1,100,000** |

Change Log Entries: **two** rows, not one (verified-corrected). CU 115 calls `Modify(true)`, so the G/L Entry `OnModify` trigger also stamps `Last Modified DateTime` (field 8005). While CU 115 is bound, the table is always-logged, and that mode logs *every* changed normal field:
- Table 17, Field 7 Description, Modification, Old "Invoice SI26-00042", New "Invoice SI26-00042 contract 15", PK Field 1 Value "1001", **Protected = Yes**.
- Table 17, Field 8005 Last Modified DateTime, Modification, old posting timestamp → edit timestamp, **Protected = Yes**.

Both are written even though `Change Log Activated` is off (R-16). *Src:* `GLEntryEdit.Codeunit.al:41`; `GLEntry.Table.al:855-858`; `ChangeLogManagement.Codeunit.al:95-96,316-323`.

### 6.5 Opening balances imported with a configuration package
Excel sheet "Gen. Journal Line": A1 = OPENING, C1 = 81. Data rows (posting date 2026-01-01, doc OB-001):

| Row | Account | Debit | Credit | Package status |
|---|---|---:|---:|---|
| 4 | 1010 Cash | 2,000,000 | | OK |
| 5 | 1110 Bank | 8,000,000 | | OK |
| 6 | 1310 Inventory | 5,000,000 | | OK |
| 7 | 9999 (does not exist) | | 15,000,000 | **Error**: relation to G/L Account fails, row not applied |

Rows 4–6 are applied; row 7 stays in staging with its error (R-39e). Without `Delayed Insert` on the package table, pass 1 has also left a key-only journal line for row 7, with blank account and amount 0 (R-39g). It does not change the balance, and re-applying fills it in. The journal now holds 15,000,000 of debits and no credits, so posting is refused (unbalanced document).

BC caveat on row 6 (verified-corrected): journal posting runs `TestField("Direct Posting", true)` on G/L accounts. Inventory, receivables and payables control accounts are normally set to Direct Posting = No, so a general-journal line to 1310 Inventory is rejected unless that flag is on. In BC, opening inventory is posted through an **item journal**, so that the item ledger valuation and the inventory G/L account agree. In the micro-ERP, the stock part of opening balances should likewise go through the inventory opening command (`GenJnlPostLine.Codeunit.al:7465-7477`; `GenJournalLine.Table.al:4791-4825`). Row 7 is fixed to 4100 Owner's equity and re-applied, and the batch posts:

| # | Account | Debit | Credit | Amount |
|---|---|---:|---:|---:|
| 1 | 1010 Cash | 2,000,000 | | +2,000,000 |
| 2 | 1110 Bank | 8,000,000 | | +8,000,000 |
| 3 | 1310 Inventory | 5,000,000 | | +5,000,000 |
| 4 | 4100 Owner's equity | | 15,000,000 | −15,000,000 |
| | **Total** | **15,000,000** | **15,000,000** | **0** |

### 6.6 Background posting with retry (no amounts)
Max attempts = 3, Rerun Delay = 60 s. The standard "Sales Post via Job Queue" entry leaves Max attempts at **0**, so out of the box a failed background posting goes straight to Error after run 1, with no retry (R-48). This walk-through assumes an admin set 3/60 on the entry; those are also the defaults of `ScheduleJobQueueEntryForLater` (`JobQueueEntry.Table.al:1294-1306`) (verified-corrected). The counter starts at 0 when the job is enqueued. The re-enqueue `Modify()` runs without triggers, so it does not reset the counter. A `Modify(true)`, `Restart` or Set Status → Ready does reset it, through `SetDefaultValues`.

| Run | Fails at | Check `Max > attempts` | attempts after | Next start |
|---|---|---|---:|---|
| 1 | 10:00:00 | 3 > 0 | 1 | 10:01:00.010 (60 s + 10 ms) |
| 2 | 10:01:05 | 3 > 1 | 2 | 10:02:05.100 (60 s + 100 ms) |
| 3 | 10:02:10 | 3 > 2 | 3 | 10:03:11 (60 s + 1 s) |
| 4 | 10:03:15 | 3 > 3 false | 3 | none: Status Error, notification |

So "Maximum No. of Attempts to Run" = 3 means 1 initial run + 3 retries. After the last failure, the invoice's `Job Queue Status` is Error. The draft is unchanged because each posting attempt is all-or-nothing.

---

## 7. Simplifications for the micro-business system

| BC | Micro-ERP |
|---|---|
| Per-table RIMDX, indirect permissions, 98 permission sets, entitlements | About 20 permission strings `module.resource.action`. Permission sets → roles (Owner, ChiefAccountant, Accountant, Cashier, Sales, Viewer, Auditor), as already in `02-architecture.md` §10.2. Ledger tables are writable only by the posting service's DB role (replaces "indirect"). |
| Access Control by company name | `member_company_role(user, company_id NULL=all, role)`. Guard: ≥ 1 active Owner per tenant. |
| Security filters | None in v1. Company is enforced by Postgres RLS. |
| User Setup (25 fields) | `user_company_setting`: `allow_posting_from/to` (date or relative token `CM`/`PM`), optional `approval_limit_mnt` (numeric, excl. VAT). |
| Change Log, opt-in, per field | Always-on trigger-based `audit.row_change` (JSON before/after, actor, request id) for master data, setup, security and drafts. Never for ledgers, which are append-only. No delete API; purge only after the statutory retention period. |
| Description edit on G/L entry | No edits. `ledger_annotation(entry_id, note, user, ts)` if notes are needed. |
| Customer ledger edits | Allow `due_date` (open entries only), `on_hold` and `dispute`; each audited. |
| Posted document deletion, gap placeholders | Never delete posted documents. Do not consume a legal number until posting, so no placeholders are needed. |
| Delete account/customer + move entries | `blocked` flag. Delete only if never used. |
| Navigate | `GET /trace?documentNo=&postingDate=`, a UNION over ledger tables by (company, document_no, posting_date), plus posted and draft documents. |
| Company-Initialize on login | Seed transaction at company creation: all setup rows, CoA template, number series, tax codes. |
| APIv2 OData | REST/JSON: `/api/v1/companies/{companyId}/sales-invoices/{id}`, GUID ids, `ETag`/`If-Match` required on PATCH/DELETE, sub-collections for lines, `POST …/post` and `…/cancel`, idempotency key on commands, stable id across draft → posted. |
| RapidStart packages | Per-entity CSV/XLSX import (customers, vendors, items, CoA, opening balances): upload → preview with per-cell errors → apply in a fixed dependency order, through domain commands; per-row result. Opening balances go into a journal that must balance. |
| Job Queue (7 statuses, categories, weekdays, windows) | `job(id, company_id, type, payload, run_at, cron, status{queued,running,succeeded,failed,dead}, attempts, max_attempts, last_error, created_by)`. Single worker with `SELECT … FOR UPDATE SKIP LOCKED`; per-company lane for posting and eBarimt; exponential backoff `min(2^n · 30 s, 6 h)`. Keep finished rows for 90 days. |

---

## 8. Pitfalls / edge cases the new implementation must not miss

1. **Write paths to ledgers.** BC protects ledgers by having users hold only indirect rights. A new system usually has one DB user, so the same protection needs DB grants or triggers that reject UPDATE/DELETE on ledger tables, and architecture tests (already listed in `02-architecture.md` §5.4).
2. **The last Owner** must not be removable or disable-able, and the check must lock to avoid a race (R-08).
3. **Window bounds are inclusive and use the posting date, not the document date.** Evaluate relative windows against the *server's local date in Asia/Ulaanbaatar*, not UTC. BC uses TODAY.
4. **Approval limit 0 means "cannot approve"**, not "unlimited" (R-13). Compare it with the net amount excluding VAT.
5. **Audit old values must come from the DB**, not the client payload. A client can send a stale `xRec` (R-17).
6. **Audit rows go to the record's company**, and background jobs must carry their company explicitly (R-29).
7. **Navigate needs posting date + document no.** Number series restart per year, so the document number alone is ambiguous (R-25).
8. **Do not "move" entries to a blank account** when deleting master data, as BC does (R-24). It breaks trial-balance reconciliation per account.
9. **The API id must survive posting** (R-32). Otherwise integrations (e-commerce, eBarimt callbacks) lose the link between the draft they created and the posted invoice.
10. **Reference fields need a consistency check:** `customerId` and `customerNumber` both supplied but pointing to different records → 400 error (R-31).
11. **Import order and partial success.** A per-record try means a package can be half applied (R-39e). For opening balances, apply the whole set or nothing, or apply to an unposted journal that must balance before posting (6.5).
12. **Template defaults are applied before imported values.** An empty imported cell must not overwrite a template default (`ModifyRecordDataField` skips a template field whose value is empty, `ConfigPackageManagement.Codeunit.al:449-450`).
13. **Background jobs run with the enqueuer's rights** (R-47). If that user is disabled or loses a role, the job must fail cleanly, not escalate.
14. **Retry only idempotent work.** Posting must be a single transaction. eBarimt submission must not be blindly retried (the architecture already bans an HTTP retry handler on it).
15. **A one-off job deleted on success loses evidence** (R-44). Keep job history.
16. **Change-log noise.** On insert, BC logs every Option/Enum field even when it holds the default value. Booleans are logged only when true; false, 0, blank, 0D/0T and BLOBs are skipped (`ChangeLogManagement.Codeunit.al:382-422`). The earlier wording "Options and Booleans are logged even at default" was wrong for Booleans (verified-corrected). JSON diffs avoid one row per field.
17. **Company Information is readable by almost every user**, because the base sets (Security - Baseapp, D365 Basic - Read, D365 READ) grant `R` on it. It is not because of inherent X, which is only execute on the table object (R-28, verified-corrected). Do not put secrets (API keys, eBarimt tokens) there; use a separate encrypted settings table.
18. **Off-by-one in retries.** In BC, "Maximum No. of Attempts" counts *retries*, so total runs = Max + 1 (6.6). The default is 0, which means no retry (R-48). Name the new field `max_retries`, or define `max_attempts` as total runs and test the boundary. (Item renumbered in verification; it was out of order.)
19. **Upgrade and migration code bypasses the change log** (R-15, added-in-verification). Any data fix run as a migration must write its own audit trail.

---

## 9. Open questions

1. Retention: for how many years must Mongolian law keep accounting audit trails and posted documents, which sets the purge horizon for `audit.row_change` and job history? (Cross-check `mn-accounting.md`.)
2. Should a posted-period lock (closing) also block *audit-relevant* master-data changes, e.g. renaming a G/L account used in a closed year?
3. Is per-user posting-window override needed for micro businesses, or is a company-level lock date enough (owner-only override)?
4. Approvals in v1: off entirely, or only for purchase invoices and payments above a limit?
5. API: OData query syntax (`$filter`, `$expand`) for BC-style compatibility, or plain REST with keyset pagination (current architecture choice)?
6. Should the import feature accept BC-format RapidStart Excel files (A1/C1 header convention) to ease migration from BC or other systems, or only our own templates?
7. Background worker: does the deployment model allow a long-running worker per tenant cluster, or should jobs run in request-triggered serverless functions (affects timeouts; BC defaults to 12 h)?

---

## Verification log

Adversarial check against the BCApps source, 2026-10-06. Paths are repo-relative and use the legend from the top of the note.

- **Example arithmetic:** every worked posting example balances, with debits equal to credits:
  - 6.1: 1,100,000 = 1,000,000 + 100,000, with VAT 10% of 1,000,000 = 100,000.
  - 6.2: the mirror image of 6.1.
  - 6.3: 550,000 = 550,000.
  - 6.4: totals unchanged at 1,100,000.
  - 6.5: 2,000,000 + 8,000,000 + 5,000,000 = 15,000,000.
- **Retry backoff:** 10^n ms gives 10 ms, 100 ms, 1 s, 10 s, 100 s, 1,000 s ≈ 16.7 min and 10,000 s ≈ 2.78 h, then 6 h for n ≥ 8. Confirmed.
- **Corrections:** these concern BC behaviour, preconditions and counts, not the arithmetic.

| Claim | Verdict | Evidence (path:line) |
|---|---|---|
| R-02 Users hold indirect `Rimd`/`imd` on ledgers; CU 12 declares `rimd` on G/L, Cust., Vendor and Bank entries and `Rimd` on VAT Entry | confirmed | `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:75-99`; `BA/Permissions/d365journalspost.permissionset.al:21-45`; `BA/Permissions/d365salesdocpost.permissionset.al:63-69,102` |
| R-03 `BaseApp Objects - Exec` grants X on all objects (tables included) | confirmed | `BA/Permissions/BaseAppObjectsExec.PermissionSet.al:3-13` |
| R-04 Include tree D365 BASIC → Basic-Edit → Basic-Read; cannot include itself or include twice; Exclude/"Reduce to indirect" | confirmed | `BA/Permissions/d365basic.permissionset.al:3-10`; `BA/Permissions/d365basicedit.permissionset.al:134-140`; `SA/Permission Sets/src/PermissionSetRelationImpl.Codeunit.al:298-317`; `SA/Permission Sets/src/PermissionImpl.Codeunit.al:264-289` |
| R-06 Essentials entitles D365 BUS FULL ACCESS; Team Member gets D365 READ + D365 TEAM MEMBER | confirmed | `BA/Entitlements/Dynamics365BusinessCentralEssentialsBaseApp.Entitlement.al:7-18`; `BA/Entitlements/Dynamics365BusinessCentralTeamMemberBaseApp.Entitlement.al:7-18` |
| R-07 Assignment lookup filters `Company Name = '' \| <company>` | confirmed | `SA/User Permissions/src/UserPermissionsImpl.Codeunit.al:247-256` |
| R-08 Last-SUPER guard is SaaS-only | corrected (the disable-user guard is not SaaS-gated) | `SA/User Permissions/src/UserPermissionsImpl.Codeunit.al:54-125,169-197` |
| R-10 Always-logged security tables | confirmed | `CL/ChangeLogManagement.Codeunit.al:174-195` |
| R-11 Posting window: User Setup if From or To is set, else G/L Setup; blank To → 31-12-9999; formula vs TODAY overrides and clears the fixed date | confirmed | `BA/System/User/UserSetupManagement.Codeunit.al:335-373,446-459`; `BA/System/User/UserSetup.Table.al:37-61,329-350` |
| R-12 From > To is an error only when both are non-blank; a formula range with From > To is an error | confirmed | `BA/System/User/UserSetupManagement.Codeunit.al:245-260,455-458` |
| R-13 Sufficient = Unlimited OR (Limit ≠ 0 AND Amount LCY ≤ Limit); chain bounded by the User Setup count; amount excl. VAT | confirmed | `BA/OtherCapabilities/Approvals/ApprovalsMgmt.Codeunit.al:961-1001,1168-1186,1390-1408`; `BA/System/User/UserSetup.Table.al:120-165,241-261` |
| R-15 Change-log scope | confirmed; added the Normal-execution-context rule | `BA/GlobalTriggerManagement.Codeunit.al:62-64,76-77,97-98`; `CL/ChangeLogManagement.Codeunit.al:39-89` |
| R-16 "Only CU 423 can insert Change Log Entries" | corrected (users have only indirect rights; report 510 also has `rid`; on-prem CHANGELOG EDIT grants RIMD) | `CL/ChangeLogManagement.Codeunit.al:12-16`; `CL/ChangeLogDelete.Report.al:9`; `BA/Permissions/d365busfullaccess.permissionset.al:309`; `BA/Permissions/OnPrem/Changelog/ChangelogEdit.PermissionSet.al:11` |
| R-17 Row format: insert skips false/0/blank/BLOB and always logs Options; old value re-read with ReadCommitted + security filter; User Property password fields masked | confirmed | `CL/ChangeLogManagement.Codeunit.al:197-265,289-326,382-422` |
| R-18 G/L-entry rows are Protected; purge default ≤ TODAY−1Y; protected retention 1 year, locked | confirmed | `CL/ChangeLogEntry.Table.al:197-200,271-280`; `CL/ChangeLogDelete.Report.al:25-35,61-85,121-137`; `BA/OtherCapabilities/RetentionPolicy/RetenPolInstallBaseApp.Codeunit.al:162-176` |
| R-19 G/L entries: page Insert/Delete not allowed; CU 115 copies only Description and re-checks 7 fields | confirmed | `BA/Finance/GeneralLedger/Ledger/GeneralLedgerEntries.Page.al:35-36,710-721`; `BA/Finance/GeneralLedger/Ledger/GLEntryEdit.Codeunit.al:24-43,58-63` |
| R-20 Cust. ledger entry editable fields; open-only block; due date copied to detailed entries and the invoice header | confirmed | `BA/Sales/Receivables/CustEntryEdit.Codeunit.al:23-73,106-127` |
| R-21 Cancel / corrective memo API actions | confirmed; added the cancel preconditions | `API/APIV2SalesInvoices.Page.al:1114-1153`; `BA/Sales/History/CorrectPostedSalesInvoice.Codeunit.al:349-370,550-563` |
| R-22 Posted invoice delete needs retention OK + `Allow Document Deletion Before` + No. Printed > 0; W1 retention always allows | confirmed | `BA/Sales/History/SalesInvoiceHeader.Table.al:1344-1363,1395-1405`; `BA/Sales/History/PostSalesDelete.Codeunit.al:342-357`; `BA/Finance/GeneralLedger/Setup/DefaultRetentionPeriodDef.Codeunit.al:36-47` |
| R-23 Gap placeholder: Posting Date TODAY, current user, "Deleted Document" source code, one line | confirmed | `BA/Sales/History/PostSalesDelete.Codeunit.al:48-126,330-334` |
| R-24 G/L account delete needs Balance = 0 | corrected (Posting-type accounts only); rest confirmed | `BA/Utilities/MoveEntries.Codeunit.al:103-124,497-545` |
| R-25 Navigate: no-op if all filters blank; read-permission gated; Detailed/VAT/Bank only with Doc No. or date; opened from a record sets exact Doc No. + date; 16 posted-header tables; 14 ledger groups | confirmed | `BA/Foundation/Navigate/Navigate.Page.al:790-878,880-968,1119-1141,2012-2047`; `BA/Foundation/Navigate/DocumentEntry.Table.al:103-120` |
| R-27 41 `DataPerCompany = false` tables; Company-Initialize on UI login if no G/L Setup (Normal context, not Background) | confirmed | `BA/Foundation/Company/CompanyInitialize.Codeunit.al:97-130,277-283,776-790`; `BA/Foundation/NoSeries/NoSeriesTenant.Table.al:12` |
| R-28 "InherentPermissions = X lets every user read Company Information" | refuted (X is execute on the table object; read comes from the base sets) | `BA/Foundation/Company/CompanyInformation.Table.al:20-25`; `BA/Permissions/SecurityBaseApp.PermissionSet.al:28`; `BA/Permissions/d365basicread.permissionset.al:318` |
| R-31 `customerId` / `customerNumber` cross-check; one of them required | confirmed | `API/APIV2SalesInvoices.Page.al:121-160,817-823` |
| R-32 Draft SystemId kept after posting; status derivation | corrected (an unposted Released invoice shows `Open`) | `BA/Sales/Posting/SalesPost.Codeunit.al:7248`; `BA/Integration/Entity/SalesInvoiceAggregator.Codeunit.al:517-532,536-560,587-613` |
| R-34 Field-set order replayed | corrected (the dates are re-applied in a fixed order; `invoiceDate` ≠ posting date) | `API/APIV2SalesInvoices.Page.al:682-711,788-801,875-899` |
| R-35 `post` checks not-posted, uses `SendToPosting(Sales-Post)`, returns the stable id | confirmed | `API/APIV2SalesInvoices.Page.al:915-925,976-988,1061-1070` |
| R-37 G/L API page read-only; list hides drafts or posted invoices by read permission | confirmed | `API/APIV2GLEntries.Page.al:5-20`; `API/APIV2SalesInvoices.Page.al:825-855` |
| R-38 PK field cannot be excluded; Include sets Validate; `Value` Text[2048] | confirmed | `RS/ConfigPackageField.Table.al:73-97`; `RS/ConfigPackageData.Table.al:37` |
| R-39 Two-pass apply, parents → children → grandchildren, per-record try, applied rows deleted | confirmed; added the key-only insert in pass 1 | `RS/ConfigPackageManagement.Codeunit.al:148-184,1070-1203,1243-1306` |
| R-40 Template applied before field values; Skip Table Triggers; Delete Recs Before Processing | confirmed | `RS/ConfigPackageManagement.Codeunit.al:340-394,433-476,1270-1274` |
| R-41 Excel A1/B1/C1 header; column names on row 3 | confirmed | `RS/ConfigExcelExchange.Codeunit.al:592,656-685,714-715` |
| R-43 Expired job → deleted; recurring if weekday or formula; default 1440 min; no recurring user-session job; wrap-midnight window | confirmed | `JQ/JobQueueDispatcher.Codeunit.al:33-36,132-159`; `JQ/JobQueueEntry.Table.al:1073-1096` |
| R-44 In Process cannot be deleted; non-recurring deleted after success; recurring re-enqueued | confirmed | `JQ/JobQueueEntry.Table.al:476-506,990-1012`; `JQ/JobQueueDispatcher.Codeunit.al:76-125` |
| R-45 Retry iff Max > attempts AND attempts < 10; else Error + notification | confirmed | `JQ/JobQueueEntry.Table.al:149-153,1014-1042`; `JQ/JobQueueErrorHandler.Codeunit.al:11-64` |
| R-46 Category semaphore (UpdLock); Waiting; next by (Priority, Entry No.) | confirmed | `JQ/JobQueueDispatcher.Codeunit.al:161-196,299-317` |
| R-47 Permission check on 4 tables; runs as the enqueuing user in `CurrentCompany()`; 12 h default timeout | confirmed | `JQ/JobQueueEntry.Table.al:762-784,839-868`; `JQ/JobQueueEnqueue.Codeunit.al:13-50` |
| R-48 Background posting statuses; re-enqueue only from blank or Error | confirmed; added "Max attempts left at 0, so no retry" | `BA/Sales/Posting/SalesPostviaJobQueue.Codeunit.al:20-57,95-124,128-148` |
| §5 Retry backoff arithmetic | confirmed | `JQ/JobQueueEntry.Table.al:1026-1033` |
| §5 Next recurring run | corrected (the formula path returns before the weekday/window step; the "next day" is relative to the previous Earliest Start) | `JQ/JobQueueDispatcher.Codeunit.al:319-347` |
| §5 Change-log purge default (≤ 2025-10-06 00:00 for TODAY 2026-10-06) | confirmed | `CL/ChangeLogDelete.Report.al:61-65` |
| §6.1 Invoice via API, D = C = 1,100,000 | corrected (needs `postingDate`; Navigate counts assume G/L-account lines) | `API/APIV2SalesInvoices.Page.al:66-87,875-899`; `BA/Sales/Document/SalesHeader.Table.al` field 99 |
| §6.2 Cancel memo reverses 6.1, D = C = 1,100,000, status Canceled | confirmed | `BA/Integration/Entity/SalesInvoiceAggregator.Codeunit.al:587-605` |
| §6.3 Posting window reject/accept; D = C = 550,000 | confirmed | `BA/System/User/UserSetupManagement.Codeunit.al:335-373,450-459` |
| §6.4 Description edit writes one Change Log Entry | corrected (two entries: Description + Last Modified DateTime, both Protected) | `BA/Finance/GeneralLedger/Ledger/GLEntryEdit.Codeunit.al:41,58-63`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:855-858`; `CL/ChangeLogManagement.Codeunit.al:95-96,316-323` |
| §6.5 Opening balances by package, D = C = 15,000,000 | corrected (key-only row left by pass 1; Direct Posting / item-journal caveat for 1310 Inventory) | `RS/ConfigPackageManagement.Codeunit.al:166-183`; `BA/Finance/GeneralLedger/Posting/GenJnlPostLine.Codeunit.al:7465-7477` |
| §6.6 Retry table (1 run + 3 retries; 10 ms, 100 ms, 1 s extras) | corrected (BC's standard background posting has Max = 0 and no retry; the example needs Max = 3 set explicitly); arithmetic confirmed | `JQ/JobQueueEntry.Table.al:1026-1033,1294-1306`; `BA/Sales/Posting/SalesPostviaJobQueue.Codeunit.al:128-148` |
| Pitfall 16 "Booleans logged at default on insert" | corrected (false Booleans are skipped) | `CL/ChangeLogManagement.Codeunit.al:390-394` |
| Pitfall 17 "readable by everyone (inherent X)" | corrected (via the base permission sets) | `BA/Permissions/SecurityBaseApp.PermissionSet.al:28` |
| §2 Field IDs and types (Job Queue Entry `User ID` Text[65], MaxValue 10, Rerun 0..3600; Change Log Entry Old/New Text[2048]; User Setup f5991/5992; G/L Entry f27/28/52/74/75/8005) | confirmed | `JQ/JobQueueEntry.Table.al:30-35,149-153,389-394`; `CL/ChangeLogEntry.Table.al:66-76`; `BA/System/User/UserSetup.Table.al:329-350`; `BA/Finance/GeneralLedger/Ledger/GLEntry.Table.al:202,213,324,505,515,782` |

Not re-verified (left as written): R-01 line ranges, R-09, R-26, R-30, R-33, R-36 (platform ETag behaviour), R-42.
