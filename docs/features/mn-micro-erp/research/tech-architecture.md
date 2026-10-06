# Technical architecture options for a new multi-tenant micro-business ERP (Mongolia, 2026)

- Date: 2026-10-06
- Scope: the production stack, data platform, integration patterns, testing, operations and hosting for a small team building a multi-tenant accounting/ERP SaaS for Mongolian micro and small businesses
- Related notes: `bc-gl-posting.md`, `bc-account-determination.md`, `mn-accounting.md`, `mn-tax.md`

> **How this was researched.** The shared web-search budget for this run ran out before this note started, so no search-engine queries were made. Facts were checked against primary sources fetched directly:
> - the PostgreSQL 18 documentation sources (`REL_18_STABLE` branch on GitHub; postgresql.org was blocked by the egress proxy)
> - Microsoft Learn and dotnet.microsoft.com
> - the LICENSE and README files of each library, on GitHub
> - the eBarimt PosAPI 3.0 reference (developer.itc.gov.mn, **v3.2.48, 2026-09-15**), through the team's internal `ebarimt-integration` skill
>
> All `.mn` sites (providers, government portals) were unreachable, so every fact about Mongolian hosting is **UNVERIFIED**. Where a value could not be confirmed, it is marked UNVERIFIED and not estimated.
>
> **Now vs 2027.** Almost everything here is technical and has no legal effective date. The regulatory constraints that drive the architecture (eBarimt PosAPI behaviour, 10-year retention, digital signatures) are **in force now**. The 2027-01-01 tax changes (simplified quarterly VAT, a 2-year amendment window and others, see `mn-tax.md`) affect **parameters and reports, not the stack**. They do, however, require effective-dated parameter tables (§4.7).

---

## 1. Summary

**Recommended stack (v1):**

| Layer | Choice | Main reason |
|---|---|---|
| Runtime | **.NET 10 LTS** (ASP.NET Core); move to .NET 12 LTS before Nov 2028 | Exact `decimal` type built in; LTS until **2028-11-14**; strong reporting and Excel libraries |
| Data access | **EF Core 10 + Npgsql** for aggregates and CRUD; **raw SQL through Npgsql (or Dapper)** for posting and reports | Npgsql maps `numeric` ↔ `decimal` by default. EF 10 named query filters suit tenant and soft-delete filters |
| Database | **PostgreSQL 18** (17 is acceptable if the host only offers 17) | Exact `numeric`, RLS, advisory locks, `uuidv7()`, temporal (non-overlapping) keys |
| Tenancy | **Shared schema + `tenant_id` + Row-Level Security (forced)**; one PostgreSQL schema per *module*, not per tenant | Thousands of tiny tenants; one migration path; RLS as a second safety net |
| Ledger | Append-only tables; `REVOKE UPDATE, DELETE, TRUNCATE`; guard triggers; correction only by reversal (storno) | Mirrors the BC G/L design (`bc-gl-posting.md`) |
| Numbering | Gapless counter rows locked inside the posting transaction for legal document numbers; sequences/UUIDv7 for technical IDs | PostgreSQL sequences *cannot* be gapless |
| Integration | Transactional outbox + idempotency keys. The eBarimt adapter **never auto-retries `POST /rest/receipt`** | PosAPI rules (timeout = unknown outcome) |
| Jobs | Own outbox dispatcher (`FOR UPDATE SKIP LOCKED`), plus **Hangfire** (LGPL v3) or **Quartz.NET** (Apache 2.0) for cron jobs | Simple, transactional, visible |
| PDF | **QuestPDF** (free Community licence under USD 1M annual gross revenue) | Code-first fixed-layout statutory forms |
| Excel | **ClosedXML** (MIT) | Server-side exports; no paid grid licence needed |
| Auth | OIDC: **ASP.NET Core Identity + OpenIddict** (Apache 2.0) embedded, with a BFF cookie for the SPA. Alternative: **Keycloak** (Apache 2.0, CNCF) | Few moving parts for a small team; standards-based so it can be swapped later |
| Frontend | **React + TypeScript**, **AG Grid Community** (MIT), money sent as strings | Large hiring pool; avoids the AG Grid Enterprise licence at the start |
| Observability | **OpenTelemetry .NET** (stable for logs, metrics and traces) → self-hosted OTLP backend | Vendor-neutral; with **redaction of eBarimt `qrData`/`lottery`** |
| CI/CD | GitHub Actions + Testcontainers; deploy to Mongolian hosting through a self-hosted runner or SSH | |
| Hosting | **In Mongolia** (data centre or local cloud) | PosAPI is reachable only from Mongolian IPs and only on an internal network |
| Backups | **pgBackRest** (MIT): full and differential backups plus WAL archiving (PITR), with an off-site copy | |
| Architecture | **Modular monolith**: DDD aggregates in the ledger, architecture tests at module boundaries | One deployable, strong consistency for posting |
| Tests | Golden scenario tests on real PostgreSQL, property-based balance invariants, concurrency, RLS and idempotency tests | Accounting correctness is the product |

**Alternatives:**
- **NestJS 12 / TypeScript**: viable if the team is TypeScript-only. It has no native decimal type, and node-postgres returns `numeric` as a string, so money discipline has to be enforced by a library and code review.
- **Java / Spring**: `BigDecimal` is excellent, but the stack is heavier for a small team.
- **Blazor**: worth considering only if the team is .NET-only and accepts a smaller grid/component ecosystem.

---

## 2. Backend platform comparison

| Criterion | .NET 10 (ASP.NET Core, EF Core 10, Npgsql) | Node/TypeScript (NestJS 12) | Java (Spring Boot) |
|---|---|---|---|
| Exact money type | `System.Decimal`: 128-bit, 28–29 significant digits, range ±7.9228×10^28; "appropriate for financial calculations" ([MS Learn](https://learn.microsoft.com/dotnet/api/system.decimal), [C# ref](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/floating-point-numeric-types)) | **None built in.** The TC39 Decimal proposal is still at **Stage 1** ([tc39/proposal-decimal](https://github.com/tc39/proposal-decimal)). Needs decimal.js, big.js or similar everywhere | `java.math.BigDecimal` (arbitrary precision, explicit `RoundingMode`) |
| PostgreSQL `numeric` mapping | Npgsql reads `numeric` as `decimal` by default; `BigInteger` is also supported since 6.0 ([Npgsql type docs](https://www.npgsql.org/doc/types/basic.html), source checked on [GitHub](https://github.com/npgsql/doc)) | node-postgres returns most types as **strings** by default; `int8` is a string to avoid overflow ([node-pg-types](https://github.com/brianc/node-pg-types)) | JDBC `getBigDecimal` |
| Transactions | `NpgsqlTransaction` / EF `BeginTransaction`; explicit isolation; `SET LOCAL` per transaction | Supported, but ORM transaction scoping differs by library (TypeORM, Prisma, Drizzle) | Spring `@Transactional` (mature) |
| Support horizon | .NET 10 **LTS**: released **2025-11-11**, supported to **2028-11-14**. LTS = 3 years, STS = 2 years; a new major every November, even numbers are LTS ([.NET policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)) | NestJS **v12.0.0 released 2026-08-27**, 12.1.1 on 2026-09-28; needs Node 20.19+ or 22.12+ ([releases](https://github.com/nestjs/nest/releases), medium confidence) | Spring Boot 4.x: the current version and dates are **UNVERIFIED** (the fetched page gave inconsistent data) |
| PDF | QuestPDF, FastReport OSS, DevExpress / Telerik (commercial) | pdfmake, Puppeteer (HTML→PDF) | JasperReports, OpenPDF |
| Excel | ClosedXML (MIT), OpenXML SDK | ExcelJS, SheetJS | Apache POI |
| Licensing traps | FluentAssertions **v8+ needs a paid licence for commercial use** ([README](https://github.com/fluentassertions/fluentassertions)). MediatR now uses **licence keys** (Lucky Penny Software) ([README](https://github.com/LuckyPennySoftware/MediatR)). Duende IdentityServer is commercial ([terms](https://duendesoftware.com/license)) | Few | Few |
| Hiring in Mongolia | **UNVERIFIED** (no data obtained) | **UNVERIFIED**; TypeScript skills are needed for the frontend in any case | **UNVERIFIED** |

**Verdict.** .NET 10 gives an exact money type with no extra dependencies and a driver that maps `numeric` to `decimal` without extra code. It has the best fixed-layout PDF and Excel libraries for statutory forms, and a well-defined LTS window. The extra cost is the licensing traps listed above. These are avoided by using plain handlers or Wolverine (MIT, [repo](https://github.com/JasperFx/wolverine)) instead of MediatR, and Shouldly or plain asserts instead of FluentAssertions v8.

---

## 3. Money handling rules (stack-independent)

1. **Never use binary floating point for money.** `numeric` is "especially recommended for storing monetary amounts and other quantities where exactness is required". Addition, subtraction and multiplication are exact ([PG numeric](https://www.postgresql.org/docs/18/datatype-numeric.html)). Do not use PostgreSQL's `money` type: it depends on locale settings and its fractional precision is fixed by `lc_monetary` ([PG money](https://www.postgresql.org/docs/18/datatype-money.html)).
2. **PostgreSQL rounds silently.** If a value has more fractional digits than the column's declared scale, PostgreSQL **rounds it to that scale without raising an error**. It raises an error only for integer-part overflow (PG numeric docs). So the application must round explicitly *before* persisting, and tests must assert that nothing reaches the database unrounded.
3. **The rounding rules differ.** PostgreSQL `round(numeric)` breaks ties **away from zero** ([PG math functions](https://www.postgresql.org/docs/18/functions-math.html)). .NET `Math.Round(decimal)` defaults to **banker's rounding (ToEven)** ([MS Learn](https://learn.microsoft.com/dotnet/api/system.math.round)). Pick one policy. Recommended: `MidpointRounding.AwayFromZero`, the usual commercial convention and the same as PostgreSQL. Wrap it in a single `Money.Round()` helper, and add an analyzer or architecture test that bans bare `Math.Round` in domain code.
4. **Block NaN.** Infinity can only be stored in an *unconstrained* `numeric`. `NaN` is a valid `numeric` value, so add `CHECK (x <> 'NaN')` through a domain.
5. **Proposed domains** (stay inside `System.Decimal` range):
   - `amount numeric(18,2)` for document and ledger amounts in MNT and in foreign currency
   - `unit_price numeric(18,6)`
   - `qty numeric(18,4)`
   - `fx_rate numeric(18,8)`
   - `pct numeric(9,6)`

   The exact MNT minor-unit policy (0.01 vs whole tögrög on printed forms) is an **open question**. eBarimt amounts are VAT-inclusive totals that must add up exactly (see §5).
6. **API boundary.** Serialize money as **JSON strings** (for example `"12345.67"`), never as JSON numbers. A JavaScript `number` is an IEEE-754 double. The server calculates every total that counts; the client may preview totals with a decimal library only.

---

## 4. PostgreSQL design

### 4.1 Version

- **PostgreSQL 18** was released on **2025-09-25**. The latest minor release in the docs source is **18.6 (2026-08-13)** ([release notes](https://www.postgresql.org/docs/18/release-18.html), checked against the `REL_18_STABLE` sources).
- Release highlights that matter here:
  - asynchronous I/O
  - `pg_upgrade` keeps optimizer statistics
  - B-tree skip scan
  - **`uuidv7()`**
  - virtual generated columns (now the default)
  - OAuth authentication
  - **temporal PRIMARY KEY / UNIQUE (`WITHOUT OVERLAPS`) and FOREIGN KEY (`PERIOD`) constraints**
- Support policy: PostgreSQL supports each major version for 5 years. The exact EOL dates (PG16 ≈ Nov 2028, PG17 ≈ Nov 2029, PG18 ≈ Nov 2030) could not be re-fetched because postgresql.org was blocked, so they are **medium confidence** ([versioning](https://www.postgresql.org/support/versioning/)).

### 4.2 Multi-tenancy pattern

| Pattern | Pros | Cons | Fit |
|---|---|---|---|
| **Shared schema + `tenant_id` + RLS** | One migration; cheap per tenant; cross-tenant ops reporting is easy; pooling-friendly | One bug can leak data, so RLS is needed as a safety net; noisy neighbours | **Recommended** (thousands of tiny tenants) |
| Schema per tenant | Strong logical separation; per-tenant restore is easy | N× migrations, catalog bloat at thousands of schemas, harder pooling | For hundreds of tenants at most |
| Database per tenant | Strongest isolation | Operationally heavy | Premium or regulated tenants only |

RLS facts ([PG row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)):
- When RLS is enabled and **no policy exists, a default-deny policy is used**.
- **Superusers and `BYPASSRLS` roles always bypass RLS.**
- **Table owners normally bypass it, unless `FORCE ROW LEVEL SECURITY` is set.**
- `TRUNCATE` and `REFERENCES` are not subject to RLS.
- Referential-integrity checks bypass RLS and can create covert channels.
- Setting `row_security = off` makes a backup **error** rather than silently skip filtered rows.

Implementation pattern:
- The app connects as a **non-owner** role without `BYPASSRLS`.
- Migrations run as a separate owner role.
- Every table has `tenant_id uuid NOT NULL` as the **leading column of the PK and of every index**.
- Each table has a policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)` with a matching `WITH CHECK`, plus `ALTER TABLE … FORCE ROW LEVEL SECURITY`.
- At the start of every transaction: `SELECT set_config('app.tenant_id', $1, true)`. This is transaction-local, so it is safe with transaction-mode connection pooling.
- In EF Core 10, also add a **named query filter** `"Tenant"`, kept separate from `"SoftDelete"` so either can be disabled on its own ([EF Core 10 what's new](https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew#named-query-filters)).

### 4.3 Immutable, append-only ledger

- Ledger tables are append-only:
  - `gl_entry`
  - `vat_entry`
  - `cust_ledger_entry` / `vend_ledger_entry`
  - `bank_ledger_entry`
  - `item_ledger_entry`
  - `fa_ledger_entry`
  - `gl_register`
- Protect them in three layers:
  1. `REVOKE UPDATE, DELETE, TRUNCATE ON … FROM app_role`.
  2. A `BEFORE UPDATE OR DELETE` row trigger that raises an exception, as defence in depth against owner or maintenance sessions.
  3. A **statement-level `BEFORE TRUNCATE` trigger**, because `TRUNCATE` triggers can only be statement-level ([PG triggers](https://www.postgresql.org/docs/18/trigger-definition.html)).
- A few mutable *status* fields exist in BC entries: `Open`, `Remaining Amount` and `Reversed by Entry No.`. Keep them out of the immutable rows:
  - Put application and settlement in separate append-only tables (`*_application`).
  - Compute remaining amounts from those tables, or keep them in a separate mutable projection table (for example `cust_ledger_open_item`).
- Optional tamper evidence: a per-tenant hash chain on `gl_register` rows (hash of the register content plus the previous register hash). Doing it per register, not per entry, reduces contention.
- Corrections are made **only** by reversal (storno) postings, as in BC (`bc-gl-posting.md` §Reversal).

### 4.4 Gapless numbering vs sequences

- PostgreSQL docs: a value from `nextval` "is not reclaimed for re-use if the calling transaction later aborts". Sequences "**cannot be used to obtain 'gapless' sequences**". `INSERT … ON CONFLICT` can also consume values ([PG sequence functions](https://www.postgresql.org/docs/18/functions-sequence.html)).
- Design:
  - **Legal and document numbers**, for posted invoices and vouchers (the МХ-1/МХ-2 cash vouchers, ТМ-1 and so on), come from a `number_series_counter (tenant_id, series_code, period_key, last_no)` row. Run `UPDATE … SET last_no = last_no + 1 RETURNING last_no` **inside the posting transaction**. The row lock serializes concurrent posters of that series, and a rollback undoes the increment, so no gap is left.
  - **Draft documents** get UUIDv7 IDs (PG18 `uuidv7()` or app-generated) and a non-legal draft number.
  - **Technical IDs** (`entry_no`) use `bigint GENERATED ALWAYS AS IDENTITY`; gaps there are harmless.
  - Whether Mongolian law *requires* gapless document numbering is **UNVERIFIED** (see `mn-accounting.md`). Gapless numbering is still the safe default.

### 4.5 Posting serialization and concurrency

- PostgreSQL has **transaction-level advisory locks**, released automatically at transaction end, and session-level ones, which ignore rollback ([PG advisory locks](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS)).
- Use `pg_advisory_xact_lock(hashtextextended('post:' || tenant_id, 0))` at the start of every posting run and of every period-close or year-end run. This:
  - serializes postings per tenant (BC does the same with `GLEntry.LockTable`)
  - lets the posting engine keep running balances, transaction numbers and register ranges consistent without `SERIALIZABLE` retries
  - blocks closing a period while a posting is in flight

  A hash collision only causes extra waiting, never a wrong result.
- Isolation: `READ COMMITTED` plus explicit locks is enough for posting. Use `REPEATABLE READ` read-only transactions for consistent multi-query reports.
- **One database transaction per posting run** (as in BC R-GL-POSTING-26): validate everything first, then take the lock, allocate numbers, insert entries, write the outbox rows and commit.

### 4.6 Partitioning

- Micro-business volumes, roughly thousands of entries per tenant per year, do not need partitioning at the start. Plan for it anyway:
  - On a partitioned table, every PK or UNIQUE constraint **must include all partition-key columns** ([PG partitioning limitations](https://www.postgresql.org/docs/18/ddl-partitioning.html)).
  - So design the ledger PK as `(tenant_id, posting_year, entry_no)`, or at least keep `posting_date` available. That way range partitioning by year, or hash partitioning by tenant, can be added later without changing keys.
- If partitioning is adopted, **pg_partman** has supported only native declarative partitioning since 5.0.1 and automates creating and retiring partitions ([pg_partman](https://github.com/pgpartman/pg_partman)).

### 4.7 Audit and effective-dated parameters

- PostgreSQL has **no SQL:2011 system-versioned (temporal) tables**. Use a **trigger-based change log** on master data and setup tables:
  - `audit.row_change(tenant_id, table_name, pk jsonb, op, old jsonb, new jsonb, changed_by, txid, changed_at)`
  - The actor comes from `current_setting('app.user_id')`, set with `set_config` alongside the tenant.
  - Ledger tables need no change log because they are append-only. The `gl_register` row records the user, time and source.
- **Effective-dated rules** (VAT and city-tax rates, thresholds, the simplified-VAT regime from 2027-01-01, depreciation lives) go in tables with a `valid_during daterange` and a **PG18 temporal key** `PRIMARY KEY (param_code, valid_during WITHOUT OVERLAPS)`. Overlapping validity periods then cannot be stored.
  - Non-range key columns need the **`btree_gist`** extension ([PG CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html)).
  - Every calculation records the parameter version it used (see `mn-tax.md` R19).

---

## 5. Idempotency, transactional outbox and eBarimt

**Generic pattern:**
- Every state-changing API call accepts an `Idempotency-Key` header. Store `(tenant_id, key, request_hash, status, response, created_at)` with a UNIQUE constraint, **in the same transaction as the business write**. A replay returns the stored response; the same key with a different request hash returns 422.
- Every external side effect (eBarimt, e-mail, SMS, bank API) is written as an `outbox` row **in the posting transaction**. A dispatcher picks rows with `SELECT … FOR UPDATE SKIP LOCKED`, calls the external system, and records each attempt in an `integration_attempt` log.

**eBarimt PosAPI 3.0 specifics** (developer.itc.gov.mn, PosAPI v3.2.48):

| Fact | Consequence for design |
|---|---|
| PosAPI is a **local REST service** at `http://<host>:7080` with **no token** (`/rest/receipt`, `/rest/info`, `/rest/sendData`, `/rest/bankAccounts`) | Deploy it as an internal-only service. Never expose it to the internet |
| One PosAPI instance: **≤ 1,000 merchants and ≤ 100,000 receipts/day**; DB ping < 100 ms; **internal network only**; **reachable only from Mongolian IPs**; ≥ 80 Mbps; ≥ 1 GB disk | Plan a **PosAPI pool**: an operator-model instance per ≤ 1,000 tenants. **Host in Mongolia** |
| Merchants are registered to the operator through `saveOprMerchants` (X-API-KEY) and confirmed by the merchant | Tenant onboarding workflow: register the merchant, wait for confirmation, then activate eBarimt for that tenant |
| `billIdSuffix` must be **unique per day**; a repeat gives a duplicate receipt ID (ДДТД) error | Use it as the **idempotency key**. Allocate it deterministically (`posNo` + daily counter) in the posting transaction |
| **Do not auto-retry `POST /rest/receipt`**: after a timeout the receipt may already exist. Record `PENDING`, set `UNKNOWN` on timeout and resolve manually. Only GET calls may be retried | Outbox state machine: `PENDING → SENT(ДДТД) / REJECTED(validation) / UNKNOWN → RESOLVED`. Disable automatic retries for this job type |
| `GET /rest/sendData` must run **at least once a day**; lottery numbers stop after 3 days without sending; warn when `leftLotteries < 100` | Scheduled job per PosAPI instance, plus health checks and alerts |
| **`qrData` and `lottery` must not be stored** anywhere except on the printed receipt | Do not persist response bodies in the outbox. **Redact these fields in logs, traces and APM**, and turn off HTTP body capture |
| Receipt dates use the tax server's clock | Sync all hosts with NTP |
| Totals must add up exactly: the sum of item totals equals the sub-receipt total, the sum of sub-receipts equals the receipt total, and the sum of payments equals the total (also for VAT and city tax) | Compute header totals **from** the lines with exact decimals. This is a property-test target |
| Firewall: `api.ebarimt.mn` → 103.17.108.216/217; `auth.itc.gov.mn` → 103.87.69.75/76; token services use OIDC password grant (Keycloak realms) | Egress allow-list; token cache refreshed 30 s before expiry |
| Monpass digital signatures stopped being supported on 2025-05-22; the alternatives are Gerege, Infosert and Tridum | Digital-signature integration targets these providers |

**Point-of-sale flow.** A POS receipt must be printed immediately, but `qrData` may not be stored. So:
1. Commit the sale together with an outbox row.
2. Dispatch that row **synchronously, in-process**, right after the commit.
3. Hand `qrData` and `lottery` to the client for printing only.
4. If the call fails or times out, the row stays for the background dispatcher (when it is safe to retry) or goes to UNKNOWN.

Invoices (`*_INVOICE`) and B2B receipts can be sent fully asynchronously.

---

## 6. Background jobs

- Planned jobs:
  - the outbox dispatcher
  - daily eBarimt `sendData`
  - reference-data refresh (`getBranchInfo`, `getProductTaxCode`, barcode deltas)
  - daily Mongolbank FX rates
  - recurring journals and depreciation runs
  - period-end checks
  - archive and export generation
  - backup verification
- Options:
  - **Hangfire**: dual licence, **LGPL v3** or commercial ([LICENSE](https://github.com/HangfireIO/Hangfire/blob/main/LICENSE.md)). It has a dashboard and retries. PostgreSQL storage comes from a community package whose licence is **UNVERIFIED**.
  - **Quartz.NET**: **Apache 2.0** ([license](https://github.com/quartznet/quartznet/blob/main/license.txt)). Strong cron scheduling, clustering through ADO.NET job stores.
  - **Wolverine** (MIT): messaging with a built-in PostgreSQL outbox. Powerful, but a bigger conceptual footprint.
- **Recommendation:**
  - Write the outbox dispatcher in-house as a `BackgroundService` using `SKIP LOCKED`. It is about 200 lines, fully transactional, and its retry policy is per job type.
  - Run cron jobs on Hangfire for the dashboard, or on Quartz.NET if a permissive licence is preferred.
  - Disable automatic retries for any non-idempotent external call.

---

## 7. Reporting, PDF and Excel

| Tool | Licence (verified) | Strengths | Weaknesses |
|---|---|---|---|
| **QuestPDF** | Community licence free for "an organisation with annual gross revenue under USD 1,000,000"; Professional and Enterprise tiers above that, with the same features ([LICENSE.md](https://github.com/QuestPDF/QuestPDF/blob/main/LICENSE.md)) | Code-first, fast, testable, Linux-friendly | No end-user designer; prices for paid tiers **UNVERIFIED** |
| **FastReport Open Source** | MIT. **PDF only through the "PdfSimple" plugin**; full PDF (fonts, signing, encryption) needs commercial FastReport .NET. The designer CE is Windows-only freeware ([README](https://github.com/FastReports/FastReport)) | Banded reports, designer | Weak PDF in the OSS edition |
| **DevExpress Reports** | Commercial (pricing **UNVERIFIED**) | End-user web designer; rich exports | Cost; vendor lock-in |
| **ClosedXML** | **MIT** ([LICENSE](https://github.com/ClosedXML/ClosedXML/blob/develop/LICENSE)) | Simple .xlsx generation with formulas and styles | Memory-heavy for very large sheets; stream through OpenXML SDK if needed |

**Recommendation:**
- Use QuestPDF for statutory forms and statements: cash vouchers МХ-1/МХ-2, invoice ТМ-1, balance sheet and the other statements, and the VAT return preview.
- Use ClosedXML for every grid and report export, including e-balance import templates if MoF publishes an Excel format (open question in `mn-accounting.md`).
- **Bundle Cyrillic-capable fonts** (for example Noto Sans or DejaVu) in the container image. Linux base images ship few fonts, and Mongolian Cyrillic (Ө, Ү) must render in PDFs.
- **PDF/A support** for 10-year archives is **UNVERIFIED for QuestPDF** and must be checked.
- Run reports as SQL views or functions over the ledger, in a `REPEATABLE READ` read-only transaction.

---

## 8. Authentication and authorization

- **OpenIddict**: Apache 2.0 ([repo](https://github.com/openiddict/openiddict-core)). An OIDC server embedded in ASP.NET Core, paired with ASP.NET Core Identity for users, MFA and lockout. It runs inside the monolith, so there is nothing extra to operate.
- **Keycloak**: Apache 2.0, a CNCF project ([repo](https://github.com/keycloak/keycloak)). A separate Java server with an admin UI, federation and MFA. The eBarimt and ITC auth endpoints are Keycloak realms, so Keycloak skills exist locally (inference).
- **Duende IdentityServer**: commercial licence terms ([licence](https://duendesoftware.com/license)). Not recommended for cost reasons.
- **Recommended:**
  - Use the **BFF pattern**: the React SPA uses an HttpOnly same-site cookie, and the backend holds the tokens. This means no tokens in browser storage.
  - Use **tenant-scoped RBAC**: `user ↔ tenant membership ↔ roles` (Owner, Accountant, Cashier, Viewer). Apply permission checks per command, and enforce segregation of duties so the user who prepares a document cannot approve it.
  - Defer DAN (government e-ID) login until availability for private SaaS is confirmed (**UNVERIFIED**).

---

## 9. Frontend

- **React + TypeScript + Vite** plus a typed API client generated from OpenAPI.
- Grid: **AG Grid Community is MIT**. **Excel export, row grouping, aggregation, pivoting, server-side row model and integrated charts are Enterprise-only** (commercial) ([README](https://github.com/ag-grid/ag-grid)). Do grouping and totals on the server and export Excel through ClosedXML, so v1 needs no Enterprise licence.
- **DevExtreme** (DevExpress, commercial, pricing **UNVERIFIED**) is richer out of the box. Consider it only if DevExpress Reports is also bought.
- **Blazor** keeps the whole team in one language and can share validation code. Its downsides are a smaller component market, heavier first load (WASM), or server-connection state (Server mode).
- Localization: Mongolian Cyrillic UI as the primary language, English as the secondary. Format numbers and dates through `Intl` with the `mn-MN` locale. Check that the browser's ICU data supports `mn` (it is in CLDR; per-browser support is **UNVERIFIED**).

---

## 10. Modular monolith: module boundaries and DDD

**Modules.** Each module has its own PostgreSQL *schema*, its own EF `DbContext` and a public contracts assembly.

| Module | Owns | Publishes / exposes |
|---|---|---|
| Platform.Tenancy | tenants, subscriptions, tenant settings | `TenantContext` |
| Platform.Identity | users, roles, memberships | permissions API |
| Platform.Numbering | number series, gapless counters | `INumberAllocator` (transactional) |
| Platform.Parameters | effective-dated legal parameters (rates, thresholds) | `IParameterProvider(asOf)` |
| Platform.Audit / Documents | row-change log, attachments, digital signatures | |
| **Ledger (GL)** | CoA, accounting periods, journals, **posting engine**, gl/vat entries, registers | `IPostingService.Post(PostingDocument)` (the only writer of ledger tables) |
| Tax | VAT and city-tax codes, posting setups, VAT return and reconciliation | tax-calculation API |
| Partners | customers, vendors, TIN lookups | |
| Sales / Receivables | quotes, invoices, credit memos, customer ledger, applications | `SalesInvoicePosted` |
| Purchasing / Payables | purchase invoices, vendor ledger, input-VAT eligibility | |
| Cash & Bank | cash desks, bank accounts, payments, statement import, reconciliation | |
| Inventory | items, locations, item ledger, costing | |
| Fixed Assets | assets, depreciation books (accounting and tax) | |
| FX | currencies, Mongolbank rates, revaluation | |
| eBarimt (anti-corruption layer) | PosAPI pool, outbox handlers, receipt log | `ReceiptRegistered` |
| Reporting | statements, e-balance export, read models | |

**Rules:**
- Modules talk only through contracts (in-process interfaces) and domain events dispatched in the same transaction, or through the outbox for side effects.
- No module reads another module's tables directly. Reporting may read through published SQL views.
- Enforce these rules with architecture tests (for example NetArchTest or ArchUnitNET; their licences were not re-verified).

**DDD for the ledger:**
- The `JournalTransaction` aggregate holds lines and enforces **Σ debit = Σ credit in LCY**. When foreign currency is used, each currency's lines must also balance in that currency.
- `Money` is a value object (amount and currency) that always uses the one rounding policy.
- An `AccountingPeriod` aggregate controls open, closed and locked states.
- Posted entries are immutable records. Mistakes are fixed with a **Reversal** domain service.
- Sub-ledgers (sales, purchase, bank and so on) never write G/L tables. They build a `PostingDocument`, and account determination (`bc-account-determination.md`) maps it to G/L lines.

---

## 11. Testing strategy for accounting

1. **Golden scenario tests.** Each scenario is a YAML/JSON file:
   - setup (CoA, parameters, opening balances)
   - a list of documents (sales, purchase, payment, FX revaluation, depreciation, reversal, period close)
   - the **expected** G/L entries, VAT entries, sub-ledger balances, trial balance and statement lines

   Run them against **real PostgreSQL through Testcontainers** ([testcontainers-dotnet](https://github.com/testcontainers/testcontainers-dotnet)). Accountants review and sign the scenarios; they are the regression suite. Include scenarios for the rules in force now and for 2027-01-01, driven by the effective dates.
2. **Property-based tests** (FsCheck, BSD-3 ([repo](https://github.com/fscheck/FsCheck)), or CsCheck, licence not re-verified). Random valid documents must never break these invariants:
   - every posted transaction balances
   - the trial balance sums to 0
   - posting followed by reversal nets every account to 0
   - rounding allocation: Σ line VAT = header VAT, and Σ items = receipt total (the eBarimt chain)
   - FX: LCY = round(FCY × rate) applied per line, with any residual posted to the rounding account
   - sub-ledger totals = control-account balance
3. **Concurrency tests.** N parallel posting runs per tenant must produce gapless document numbers, unique entry numbers and no deadlocks. A period close and a posting run at the same time must serialize.
4. **Security tests.** Running as `app_role`, tenant A must read 0 rows of tenant B. Any `UPDATE` or `DELETE` on ledger tables must fail. `TRUNCATE` must fail.
5. **Idempotency and outbox tests.**
   - Replaying the same idempotency key returns the same result.
   - When the process crashes between commit and dispatch, the row is delivered once.
   - On a PosAPI timeout the row becomes `UNKNOWN` and is not retried.
   - A stub PosAPI asserts that `qrData` is never persisted or logged.
6. **Rounding unit tests** at the `Money` level, including the .NET-vs-PostgreSQL tie cases.
7. Snapshot tests for PDFs (compare the extracted text) and Excel (compare cell values).

---

## 12. Observability

- **OpenTelemetry .NET** is **stable for all three signals** (logs, metrics, traces) ([repo](https://github.com/open-telemetry/opentelemetry-dotnet)). Export over OTLP to a self-hosted backend in the same Mongolian data centre, for example Grafana with Prometheus/Loki/Tempo, or SigNoz (licences not re-verified).
- Each span carries `tenant_id` (hashed), `document_id`, `posting_run_id` and `outbox_id`.
- Business metrics:
  - posting latency
  - outbox lag and `UNKNOWN` count
  - eBarimt `leftLotteries`
  - days since the last `sendData`
  - failed logins
- **Redaction rules:** never record `qrData`, `lottery`, passwords, tokens or full national ID numbers. Turn off request and response body capture for the eBarimt HTTP client.

---

## 13. CI/CD

- **GitHub Actions** pipeline:
  - restore, build and analyzers
  - unit and property tests
  - golden scenarios on Testcontainers PostgreSQL 18
  - generate an **idempotent SQL migration script** (EF migrations bundle or script) and keep it as a reviewable artifact
  - container image pushed to a registry
  - deploy
- Use environment protection (manual approval) for production.
- Migrations run as the owner role in a separate step, *before* the app rolls out. Use expand-then-contract migrations, so the old and new app versions both work during a rolling deploy.
- Because production is in Mongolia and PosAPI is internal-only, deploy through a **self-hosted runner inside the hosting network**, or through SSH from a hosted runner with an IP allow-list.
- GitHub Actions minutes and pricing for 2026 are **UNVERIFIED** (docs.github.com was blocked).

---

## 14. Hosting, backups and cost

**Where to host.**
- **In Mongolia is effectively required.** PosAPI must run on an internal network, accept traffic only from Mongolian IPs, and have a DB ping under 100 ms.
- Hosting abroad would mean splitting the system: the ERP abroad and a PosAPI gateway in Mongolia, connected over a VPN. That adds latency and more failure modes, and ties the synchronous POS print flow to cross-border links.
- Data-protection or localization duties under Mongolian personal-data and cyber-security laws are **UNVERIFIED** here and must be checked with counsel.
- Candidate local providers to request quotes from include domestic telecom and data-centre operators and the state national data centre. Names, offerings, SLAs and prices are all **UNVERIFIED** because the `.mn` sites were unreachable.

**Backups and PITR.**
- Use **pgBackRest** (MIT; full, differential and incremental backups, parallel async WAL push and get, retention policies) ([repo](https://github.com/pgbackrest/pgbackrest)).
- Schedule: a weekly full, a daily differential, and continuous WAL archiving to a second site, with encryption at rest.
- Targets: **RPO ≤ 5 min** (via `archive_timeout`) and **RTO ≤ 4 h**. These are design targets, not facts.
- Run a monthly automated restore drill into a scratch cluster, which runs the trial-balance check.
- Backups are **not** the legal archive. The 10-year retention (`mn-accounting.md`) is met by **per-fiscal-year archive packages** (PDF statements and registers plus CSV/JSON data, with checksums).
- **CloudNativePG** (CNCF; Kubernetes operator with backup, pooler and replicas) ([repo](https://github.com/cloudnative-pg/cloudnative-pg)) suits a later move to Kubernetes. It is too much for v1.

**Cost model.** No local prices could be verified. The table gives engineering sizing estimates for the first ~500 micro tenants; get quotes for the prices.

| Item | v1 sizing (estimate) | Licence cost |
|---|---|---|
| App VM(s) | 2 × 4 vCPU / 8 GB (active/active behind a load balancer) | 0 (.NET, ASP.NET Core) |
| PostgreSQL primary + replica | 2 × 4–8 vCPU / 16–32 GB, SSD | 0 |
| PosAPI instance(s) | 1 per ≤ 1,000 merchants (internal network) | 0 (government software) |
| Backup storage, second site | ~3–5× DB size + WAL | 0 (pgBackRest) |
| Observability VM | 1 × 4 vCPU / 16 GB | 0 (open source) |
| PDF | – | 0 while the vendor's revenue < USD 1M (QuestPDF); then a paid tier (**UNVERIFIED** price) |
| Grid / reports (optional) | – | AG Grid Enterprise or DevExpress, only if chosen (**UNVERIFIED** prices) |
| Digital-signature certificates | per tenant | **UNVERIFIED** (Gerege / Infosert / Tridum) |

---

## 15. Key facts

| Fact | Value | Effective from | Source URL | Confidence |
|---|---|---|---|---|
| .NET 10 support | LTS, released 2025-11-11, end of support 2028-11-14; latest patch 10.0.12 | in force | https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core | high |
| .NET support lengths | LTS 3 years, STS 2 years; even-numbered releases are LTS, one release every November | in force | https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core | high |
| System.Decimal | 128-bit, 28–29 significant digits, ±7.9228×10^28 | – | https://learn.microsoft.com/dotnet/api/system.decimal | high |
| EF Core 10 | Named query filters (several per entity, can be disabled one at a time); complex types can map to JSON | .NET 10 | https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew | high |
| Npgsql numeric mapping | `numeric` → `decimal` (default); `BigInteger` from 6.0 | – | https://www.npgsql.org/doc/types/basic.html | high |
| PostgreSQL 18 | Released 2025-09-25; 18.6 on 2026-08-13; adds uuidv7(), temporal PK/UNIQUE/FK, AIO, virtual generated columns, OAuth | in force | https://www.postgresql.org/docs/18/release-18.html | high |
| PG support window | 5 years per major version (exact EOL dates not re-fetched) | – | https://www.postgresql.org/support/versioning/ | medium |
| PG numeric | Up to 131,072 digits before and 16,383 after the decimal point; exact add, subtract, multiply; values silently rounded to the declared scale | – | https://www.postgresql.org/docs/18/datatype-numeric.html | high |
| PG round() | `round(numeric)` breaks ties away from zero (.NET defaults to ToEven) | – | https://www.postgresql.org/docs/18/functions-math.html | high |
| PG sequences | Cannot be gapless; aborted `nextval` values are not reused | – | https://www.postgresql.org/docs/18/functions-sequence.html | high |
| PG RLS | Default-deny without a policy; superusers and BYPASSRLS bypass; owners bypass unless FORCE | – | https://www.postgresql.org/docs/18/ddl-rowsecurity.html | high |
| PG partitioned unique keys | PK/UNIQUE must include all partition-key columns | – | https://www.postgresql.org/docs/18/ddl-partitioning.html | high |
| eBarimt PosAPI deployment | Local REST on :7080, no token; ≤ 1,000 merchants and ≤ 100k receipts/day per instance; internal network; Mongolian IPs only | in force (v3.2.48, 2026-09-15) | https://developer.itc.gov.mn/ | medium-high |
| eBarimt idempotency | `billIdSuffix` unique per day; do not auto-retry `POST /rest/receipt`; `sendData` ≥ once a day | in force | https://developer.itc.gov.mn/ | medium-high |
| eBarimt data rule | `qrData` and `lottery` must not be stored except on the printed receipt | in force | https://developer.itc.gov.mn/ | medium-high |
| QuestPDF licence | Free Community licence for organisations under USD 1,000,000 annual gross revenue | in force | https://github.com/QuestPDF/QuestPDF/blob/main/LICENSE.md | high |
| AG Grid | Community MIT; Excel export, grouping, aggregation, pivot and SSRM are Enterprise (commercial) | in force | https://github.com/ag-grid/ag-grid | high |
| Library licences | ClosedXML MIT; Hangfire LGPL v3 or commercial; Quartz.NET, OpenIddict and Keycloak Apache 2.0; pgBackRest MIT | in force | GitHub LICENSE files (see §§6–8, 14) | high |
| FluentAssertions v8+ | Commercial use requires a paid licence | in force | https://github.com/fluentassertions/fluentassertions | high |
| JS decimal | TC39 Decimal is at Stage 1 (no native decimal in JS) | – | https://github.com/tc39/proposal-decimal | high |
| OpenTelemetry .NET | Stable for logs, metrics and traces | – | https://github.com/open-telemetry/opentelemetry-dotnet | high |

---

## 16. Implications for the ERP design (requirements)

- **TA-01 Money types.** Declare the database domains `amount numeric(18,2)`, `unit_price numeric(18,6)`, `qty numeric(18,4)`, `fx_rate numeric(18,8)` and `pct numeric(9,6)`, each with `CHECK (VALUE <> 'NaN')`. The C# `Money` value object rounds with `MidpointRounding.AwayFromZero` through one helper. Bare `Math.Round` and `double` or `float` in the domain and persistence layers are banned (analyzer or architecture test).
- **TA-02 API money format.** Money fields in the API are JSON strings, and the OpenAPI schema uses `type: string, format: decimal`. The client never computes authoritative totals.
- **TA-03 Tenancy.**
  - Every table has `tenant_id uuid NOT NULL` as the leading PK and index column.
  - RLS is enabled and forced, with USING and WITH CHECK policies.
  - The app role is not the owner and has no BYPASSRLS. Migrations run under a separate owner role.
  - `set_config('app.tenant_id', …, true)` runs at the start of every transaction, alongside the EF named filter `"Tenant"`.
- **TA-04 Ledger immutability.** Ledger tables have UPDATE, DELETE and TRUNCATE revoked, plus guard triggers (row-level and a TRUNCATE statement trigger). Corrections are made only by reversal. Mutable open-item state lives in separate projection or application tables.
- **TA-05 Posting transaction.** A posting run does the following in one database transaction:
  1. validate
  2. take `pg_advisory_xact_lock` per tenant
  3. allocate the gapless document number from `number_series_counter`
  4. assign `transaction_no` and `register_no`
  5. insert the entries
  6. insert the outbox rows
  7. insert the idempotency record
  8. commit

  A period close takes the same lock.
- **TA-06 Numbering.** Posted legal documents get gapless numbers per `(tenant, series, period)`. Drafts use UUIDv7. Technical IDs use identity columns.
- **TA-07 Effective-dated parameters.** Parameter tables have `valid_during daterange` with a PG18 `WITHOUT OVERLAPS` PK (`btree_gist`). Every tax or depreciation calculation stores the parameter version it used. The 2027-01-01 rules are seeded as future-dated rows.
- **TA-08 Audit.** A trigger-based row-change log covers master data and setup, recording the actor from `app.user_id`. Each posting run writes a `gl_register` row with the user, time, source and entry ranges, and optionally a hash chain.
- **TA-09 Idempotency.** An `Idempotency-Key` is required on POST and PUT commands. A unique `(tenant_id, key)` row holds the request hash and stored response.
- **TA-10 eBarimt adapter.**
  - Run a PosAPI pool inside Mongolia, with each tenant mapped to one instance (≤ 1,000 merchants per instance).
  - Merchant onboarding runs through `saveOprMerchants`.
  - `billIdSuffix` is allocated in the posting transaction.
  - The outbox states are `PENDING/SENT/REJECTED/UNKNOWN/RESOLVED`, with no automatic retry of `POST /rest/receipt`. An operator UI resolves UNKNOWN rows.
  - Run daily `sendData` and the `leftLotteries` and 3-day alerts.
  - Hosts are NTP-synced and an egress allow-list is in place.
  - **`qrData` and `lottery` are never persisted or logged.**
  - The receipt log fields are: `DocumentNo`, `BillIdSuffix`, `DDTD`, `ParentDDTD`, `Type`, `TotalAmount`, `TotalVAT`, `TotalCityTax`, `EbarimtDate`, `Easy`, `Status`, `ErrorMessage`.
- **TA-11 Reporting.** Use QuestPDF for statutory forms with embedded Cyrillic fonts, and ClosedXML for Excel exports. Reports run in REPEATABLE READ read-only transactions. Each fiscal year gets an archive package (PDF plus CSV/JSON plus checksums) for the ≥ 10-year retention.
- **TA-12 Auth.**
  - OIDC (OpenIddict plus ASP.NET Core Identity) with the BFF cookie pattern and MFA for Owner and Accountant roles.
  - Tenant-scoped RBAC with segregation of duties between preparer and approver.
  - Digital-signature integration targets Gerege, Infosert or Tridum.
- **TA-13 Observability.** OpenTelemetry for traces, metrics and logs, with the redaction list. Business SLO dashboards cover outbox lag, UNKNOWN receipts, `sendData` age and posting latency.
- **TA-14 Tests.** The CI gates are:
  - golden scenarios (now and 2027)
  - balance-invariant property tests
  - gapless-numbering concurrency tests
  - RLS isolation tests
  - immutability tests
  - outbox and idempotency crash tests
- **TA-15 Ops.**
  - Production is hosted in Mongolia.
  - pgBackRest runs full, differential and WAL backups to a second site, with monthly restore drills.
  - The targets are RPO ≤ 5 min and RTO ≤ 4 h.
  - Migrations are expand-then-contract and run as a separate CI step.
- **TA-16 Dependency hygiene.** Keep a licence allow-list: MIT, Apache-2.0, BSD and LGPL (unmodified, dynamically linked). Do not use FluentAssertions v8+, MediatR (licence key), or Duende without a budget decision. Watch the QuestPDF revenue threshold.

---

## 17. Open questions

1. **Hosting in Mongolia:** which providers offer managed VMs, object storage and private networking? What do they cost and what SLAs do they offer? Can PosAPI run on the same private network? (UNVERIFIED; get quotes.)
2. **PosAPI internals:** what database does PosAPI use (the "DB ping < 100 ms" requirement), and can one instance serve as the operator for many tenants in production? Is there an API to *look up* a receipt by `billIdSuffix`, to resolve UNKNOWN outcomes automatically? (Ask posapi@itc.gov.mn.)
3. **Reprinting receipts:** the ban on storing `qrData` and `lottery` leaves open how to reprint a POS receipt. Is a reprint allowed, and must it be generated again? (Ask the regulator.)
4. **Data residency:** do the Personal Data Protection Law and the Cyber Security Law require personal or financial data to be stored in Mongolia, or restrict off-site backups abroad? (UNVERIFIED.)
5. **Gapless numbering:** is it legally required for primary documents and invoices, and is the counter per fiscal year or continuous? (See `mn-accounting.md`.)
6. **MNT minor units:** should printed statutory forms and ledgers show whole tögrög or 2 decimals? Does the e-balance export require rounding to whole MNT or to thousands?
7. **PDF/A:** does QuestPDF produce conformant PDF/A for the 10-year archive, or is a post-processing step needed?
8. **Hiring market:** the relative availability of .NET, TypeScript and Java developers in Ulaanbaatar is UNVERIFIED. Count postings on local job boards before the stack is final.
9. **E-ID and signatures:** can private SaaS use DAN login? What are the integration APIs and costs for Gerege, Infosert and Tridum signatures?
10. **Hangfire.PostgreSql** licence and maintenance status, and the prices of the paid tiers of QuestPDF, AG Grid and DevExpress (UNVERIFIED).
11. **GitHub Actions** 2026 pricing for private repositories and self-hosted runners (UNVERIFIED; docs blocked).
12. **Spring Boot 4.x** current version and support dates (UNVERIFIED), in case the Java alternative is reconsidered.
