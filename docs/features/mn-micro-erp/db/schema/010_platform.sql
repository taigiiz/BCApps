-- =============================================================================
-- 010_platform.sql
-- Shared domains, request context helpers, tenants, companies, users, permissions
-- (BC permission-set model), number series (gapless), source/reason codes, ledger counters.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- -----------------------------------------------------------------------------
-- Domains (DECISIONS D-C1). Enumerations are text domains/columns with CHECK constraints
-- (not PostgreSQL ENUM types): values can be added/removed with ALTER DOMAIN inside a
-- transactional migration, EF Core maps them as plain strings, and the API already uses
-- the same UPPER_SNAKE strings.
-- -----------------------------------------------------------------------------
CREATE DOMAIN platform.amount       AS numeric(19,4);   -- money; rounded to the currency precision before storage
CREATE DOMAIN platform.unit_amount  AS numeric(19,6);   -- unit price / unit cost
CREATE DOMAIN platform.quantity     AS numeric(19,5);   -- quantities
CREATE DOMAIN platform.exch_rate    AS numeric(38,18);  -- exchange rates and currency factors
CREATE DOMAIN platform.percent      AS numeric(9,5) CHECK (VALUE BETWEEN 0 AND 100);
CREATE DOMAIN platform.code20       AS text CHECK (VALUE ~ '^[A-Z0-9_\-\.]{1,20}$');      -- BC Code[20]
CREATE DOMAIN platform.currency_code AS text CHECK (VALUE ~ '^[A-Z]{3}$');                 -- ISO 4217
CREATE DOMAIN platform.document_no  AS text CHECK (char_length(VALUE) BETWEEN 1 AND 35 AND VALUE = btrim(VALUE));
CREATE DOMAIN platform.ext_document_no AS text CHECK (char_length(VALUE) BETWEEN 1 AND 35);
CREATE DOMAIN platform.tin          AS text CHECK (VALUE ~ '^[0-9]{7,14}$');               -- ТТД / civil id (digits)
CREATE DOMAIN platform.ddtd         AS text CHECK (VALUE ~ '^[0-9]{33}$');                 -- eBarimt ДДТД (33 digits)
CREATE DOMAIN platform.date_formula AS text CHECK (char_length(VALUE) <= 32);              -- BC DateFormula, e.g. 30D, CM+1M
CREATE DOMAIN platform.document_type AS text
    CHECK (VALUE IN ('NONE','PAYMENT','INVOICE','CREDIT_MEMO','REFUND','FINANCE_CHARGE_MEMO','REMINDER'));  -- BC enum 6
CREATE DOMAIN platform.account_type AS text
    CHECK (VALUE IN ('GL_ACCOUNT','CUSTOMER','VENDOR','BANK_ACCOUNT','FIXED_ASSET'));                      -- BC enum 81 (subset)
CREATE DOMAIN platform.source_type AS text
    CHECK (VALUE IN ('NONE','CUSTOMER','VENDOR','BANK_ACCOUNT','FIXED_ASSET','EMPLOYEE'));                -- BC enum 82 (subset)
CREATE DOMAIN platform.gen_posting_type AS text
    CHECK (VALUE IN ('NONE','PURCHASE','SALE','SETTLEMENT'));                                                -- BC Gen. Posting Type
CREATE DOMAIN platform.vat_calc_type AS text
    CHECK (VALUE IN ('NORMAL','REVERSE_CHARGE','FULL_VAT'));                                                 -- BC enum 254 (D-E1)
CREATE DOMAIN platform.ebarimt_tax_type AS text
    CHECK (VALUE IN ('VAT_ABLE','VAT_ZERO','VAT_FREE','NOT_VAT'));                                           -- PosAPI taxType (D-E2)

COMMENT ON DOMAIN platform.amount IS 'Money amount numeric(19,4) per DECISIONS D-C1; float/double are forbidden.';
COMMENT ON DOMAIN platform.code20 IS 'BC Code[20]: upper-case A-Z, 0-9, _ - . ; 1..20 characters.';

-- -----------------------------------------------------------------------------
-- Request context (02-architecture.md 7.3). Settings are transaction-local (set_config(..., true)).
-- current_tenant_id()/current_company_id() FAIL CLOSED: an unset or empty setting raises an error.
-- -----------------------------------------------------------------------------
CREATE FUNCTION platform.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT current_setting('app.tenant_id')::uuid $$;

CREATE FUNCTION platform.current_company_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT current_setting('app.company_id')::uuid $$;

CREATE FUNCTION platform.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION platform.fn_set_context(p_tenant_id uuid, p_company_id uuid DEFAULT NULL,
                                        p_user_id uuid DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS void LANGUAGE sql VOLATILE AS $$
    SELECT set_config('app.tenant_id',  p_tenant_id::text, true),
           set_config('app.company_id', coalesce(p_company_id::text, ''), true),
           set_config('app.user_id',    coalesce(p_user_id::text, ''), true),
           set_config('app.request_id', coalesce(p_request_id, ''), true);
$$;
COMMENT ON FUNCTION platform.fn_set_context(uuid, uuid, uuid, text) IS
    'Sets the transaction-local RLS context (app.tenant_id, app.company_id, app.user_id, app.request_id). Call right after BEGIN.';

CREATE FUNCTION platform.fn_lock_company_posting(p_tenant_id uuid, p_company_id uuid) RETURNS void
LANGUAGE sql VOLATILE AS $$
    SELECT pg_advisory_xact_lock(hashtextextended('post:' || p_tenant_id::text || ':' || p_company_id::text, 0))
$$;
COMMENT ON FUNCTION platform.fn_lock_company_posting(uuid, uuid) IS
    'Per-company posting serialization (DECISIONS D-C6, BC CU12 LockTable). Held until COMMIT/ROLLBACK.';

-- -----------------------------------------------------------------------------
-- Tenant / company
-- -----------------------------------------------------------------------------
CREATE TABLE platform.tenant (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    status           text NOT NULL DEFAULT 'PROVISIONING'
                     CHECK (status IN ('PROVISIONING','ACTIVE','READ_ONLY','SUSPENDED','PURGE_APPROVED','PURGED')),
    plan_code        text NOT NULL DEFAULT 'MICRO',
    default_language text NOT NULL DEFAULT 'mn' CHECK (default_language IN ('mn','en')),
    max_companies    integer NOT NULL DEFAULT 3 CHECK (max_companies > 0),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),
    updated_at       timestamptz,
    updated_by       uuid,
    row_version      integer NOT NULL DEFAULT 1
);
COMMENT ON TABLE platform.tenant IS 'SaaS subscriber account (contract, plan, user limits). No BC equivalent (BC tenant is infrastructure); holds 1..N companies.';

CREATE TABLE platform.company (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES platform.tenant (id),
    name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROVISIONING','ACTIVE','ARCHIVED')),
    is_demo      boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, name)
);
COMMENT ON TABLE platform.company IS 'Mirrors BC system table Company: one legal entity with its own books. Every business row carries (tenant_id, company_id) referencing this table.';

CREATE TABLE platform.company_setup (
    id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                      uuid NOT NULL,
    company_id                     uuid NOT NULL,
    legal_name                     text NOT NULL,
    legal_name_en                  text,
    legal_form                     text NOT NULL DEFAULT 'LLC'
                                   CHECK (legal_form IN ('LLC','JSC','PARTNERSHIP','NGO','SOLE_PROPRIETOR','STATE_OWNED','COOPERATIVE','OTHER')),
    tin                            platform.tin,                 -- ТТД (taxpayer id)
    registration_no                text CHECK (char_length(registration_no) BETWEEN 1 AND 20),  -- улсын бүртгэлийн дугаар
    vat_registered                 boolean NOT NULL DEFAULT false,   -- D-E5
    vat_registered_from            date,
    city_tax_payer                 boolean NOT NULL DEFAULT false,   -- D-E6 (НХАТ)
    address                        text,
    district_code                  text CHECK (district_code ~ '^[0-9]{4}$'),
    phone                          text,
    email                          text,
    lcy_code                       platform.currency_code NOT NULL DEFAULT 'MNT',
    amount_rounding_precision      numeric(19,4) NOT NULL DEFAULT 0.01 CHECK (amount_rounding_precision IN (0.01, 1)),
    unit_amount_rounding_precision numeric(19,6) NOT NULL DEFAULT 0.00001 CHECK (unit_amount_rounding_precision > 0),
    vat_rounding_type              text NOT NULL DEFAULT 'NEAREST' CHECK (vat_rounding_type IN ('NEAREST','UP','DOWN')),
    invoice_rounding_enabled       boolean NOT NULL DEFAULT false,   -- D-C2 cash rounding to whole MNT
    invoice_rounding_precision     numeric(19,4) NOT NULL DEFAULT 1 CHECK (invoice_rounding_precision > 0),
    report_decimal_places          smallint NOT NULL DEFAULT 2 CHECK (report_decimal_places IN (0, 2)),
    allow_posting_from             date,                              -- D-D3 company posting window
    allow_posting_to               date,
    fiscal_year_start_month        smallint NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month = 1),  -- calendar year by law
    accounting_standard            text NOT NULL DEFAULT 'IFRS_FOR_SMES' CHECK (accounting_standard IN ('IFRS_FOR_SMES','IFRS')),
    go_live_date                   date,
    default_language               text NOT NULL DEFAULT 'mn' CHECK (default_language IN ('mn','en')),
    time_zone                      text NOT NULL DEFAULT 'Asia/Ulaanbaatar',
    created_at                     timestamptz NOT NULL DEFAULT now(),
    created_by                     uuid DEFAULT platform.current_user_id(),
    updated_at                     timestamptz,
    updated_by                     uuid,
    row_version                    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id),
    CHECK (allow_posting_from IS NULL OR allow_posting_to IS NULL OR allow_posting_from <= allow_posting_to),
    CHECK (NOT vat_registered OR tin IS NOT NULL)
);
COMMENT ON TABLE platform.company_setup IS 'Mirrors BC table 79 Company Information plus the company-wide parts of table 98 General Ledger Setup (LCY, rounding, posting window). One row per company.';

-- -----------------------------------------------------------------------------
-- Users and permissions (BC permission sets; DECISIONS D-I2)
-- -----------------------------------------------------------------------------
CREATE TABLE platform.app_user (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email              text NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
    display_name       text NOT NULL,
    phone              text,
    preferred_language text NOT NULL DEFAULT 'mn' CHECK (preferred_language IN ('mn','en')),
    status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','LOCKED')),
    external_subject   text,                       -- OpenIddict subject
    mfa_enabled        boolean NOT NULL DEFAULT false,
    last_login_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_at         timestamptz,
    updated_by         uuid,
    row_version        integer NOT NULL DEFAULT 1,
    UNIQUE (email)
);
COMMENT ON TABLE platform.app_user IS 'Global identity (a user may belong to several tenants). Mirrors BC system table User (2000000120). Visible to a tenant only through tenant_membership (RLS).';

CREATE TABLE platform.tenant_membership (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES platform.tenant (id),
    user_id      uuid NOT NULL REFERENCES platform.app_user (id),
    status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED','ACTIVE','DISABLED')),
    invited_by   uuid,
    joined_at    timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    UNIQUE (tenant_id, user_id)
);
CREATE INDEX ix_tenant_membership__user ON platform.tenant_membership (user_id);
COMMENT ON TABLE platform.tenant_membership IS 'User membership in a tenant. No direct BC table (BC users are per tenant); prerequisite for user_company_role.';

CREATE TABLE platform.permission_set (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid REFERENCES platform.tenant (id),   -- NULL = system set shipped with the product (read-only to tenants)
    code         platform.code20 NOT NULL,
    name         text NOT NULL,
    name_en      text,
    assignable   boolean NOT NULL DEFAULT true,
    is_system    boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CHECK (is_system = (tenant_id IS NULL))
);
CREATE INDEX ix_permission_set__tenant ON platform.permission_set (tenant_id);
COMMENT ON TABLE platform.permission_set IS 'Mirrors BC permissionset objects and system table Tenant Permission Set (2000000165). tenant_id NULL = system set.';

CREATE TABLE platform.permission (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid REFERENCES platform.tenant (id),
    permission_set_id  uuid NOT NULL REFERENCES platform.permission_set (id) ON DELETE CASCADE,
    object_type        text NOT NULL CHECK (object_type IN ('TABLE','ACTION','REPORT','PAGE','API')),
    object_name        text NOT NULL CHECK (object_name ~ '^[a-z0-9_]+(\.[a-z0-9_\-]+)*$|^\*$'),  -- e.g. sales.sales_header, sales.invoice.post
    read_permission    char(1) NOT NULL DEFAULT 'N' CHECK (read_permission    IN ('N','Y','I')),  -- N none, Y direct, I indirect
    insert_permission  char(1) NOT NULL DEFAULT 'N' CHECK (insert_permission  IN ('N','Y','I')),
    modify_permission  char(1) NOT NULL DEFAULT 'N' CHECK (modify_permission  IN ('N','Y','I')),
    delete_permission  char(1) NOT NULL DEFAULT 'N' CHECK (delete_permission  IN ('N','Y','I')),
    execute_permission char(1) NOT NULL DEFAULT 'N' CHECK (execute_permission IN ('N','Y','I')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid DEFAULT platform.current_user_id(),
    UNIQUE (permission_set_id, object_type, object_name)
);
CREATE INDEX ix_permission__tenant ON platform.permission (tenant_id);
COMMENT ON TABLE platform.permission IS 'Mirrors BC system table Tenant Permission (2000000166): object + RIMDX rights (N/Y/I = none/direct/indirect).';

CREATE TABLE platform.permission_set_include (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid REFERENCES platform.tenant (id),
    permission_set_id          uuid NOT NULL REFERENCES platform.permission_set (id) ON DELETE CASCADE,
    included_permission_set_id uuid NOT NULL REFERENCES platform.permission_set (id),
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    UNIQUE (permission_set_id, included_permission_set_id),
    CHECK (permission_set_id <> included_permission_set_id)
);
CREATE INDEX ix_permission_set_include__included ON platform.permission_set_include (included_permission_set_id);
CREATE INDEX ix_permission_set_include__tenant ON platform.permission_set_include (tenant_id);
COMMENT ON TABLE platform.permission_set_include IS 'Mirrors BC system table Tenant Permission Set Rel. (IncludedPermissionSets). Exclude relations are not supported.';

-- A tenant row must not be attached to another tenant's (or a system) permission set.
CREATE FUNCTION platform.fn_permission_tenant_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM platform.permission_set s
                    WHERE s.id = NEW.permission_set_id AND s.tenant_id IS NOT DISTINCT FROM NEW.tenant_id) THEN
        RAISE EXCEPTION 'permission row tenant does not match its permission set' USING ERRCODE = 'ERT01';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_permission_tenant_check BEFORE INSERT OR UPDATE ON platform.permission
    FOR EACH ROW EXECUTE FUNCTION platform.fn_permission_tenant_check();
CREATE TRIGGER trg_permission_set_include_tenant_check BEFORE INSERT OR UPDATE ON platform.permission_set_include
    FOR EACH ROW EXECUTE FUNCTION platform.fn_permission_tenant_check();

CREATE TABLE platform.role (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES platform.tenant (id),
    code         platform.code20 NOT NULL,              -- OWNER, ACCOUNTANT, SALES_CLERK, VIEWER, EXTERNAL_ACCOUNTANT
    name         text NOT NULL,
    name_en      text,
    is_builtin   boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
);
COMMENT ON TABLE platform.role IS 'Assignable bundle of permission sets (BC Security Group / user group). Default roles per D-I2: Owner, Accountant, Sales clerk, Viewer, External accountant.';

CREATE TABLE platform.role_permission_set (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    role_id           uuid NOT NULL,
    permission_set_id uuid NOT NULL REFERENCES platform.permission_set (id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, role_id) REFERENCES platform.role (tenant_id, id) ON DELETE CASCADE,
    UNIQUE (role_id, permission_set_id)
);
CREATE INDEX ix_role_permission_set__set ON platform.role_permission_set (permission_set_id);
CREATE INDEX ix_role_permission_set__tenant_role ON platform.role_permission_set (tenant_id, role_id);
COMMENT ON TABLE platform.role_permission_set IS 'Role -> permission set assignment (BC Access Control rows of a security group).';

CREATE TABLE platform.user_company_role (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    user_id      uuid NOT NULL,
    company_id   uuid,                                 -- NULL = all companies of the tenant
    role_id      uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, role_id) REFERENCES platform.role (tenant_id, id),
    UNIQUE NULLS NOT DISTINCT (tenant_id, user_id, company_id, role_id)
);
CREATE INDEX ix_user_company_role__role ON platform.user_company_role (tenant_id, role_id);
CREATE INDEX ix_user_company_role__company ON platform.user_company_role (tenant_id, company_id);
COMMENT ON TABLE platform.user_company_role IS 'Mirrors BC system table Access Control (2000000053): user x company x role (company NULL = all companies).';

CREATE TABLE platform.user_setup (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    user_id             uuid NOT NULL,
    allow_posting_from  date,
    allow_posting_to    date,
    allow_vat_date_from date,
    allow_vat_date_to   date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid DEFAULT platform.current_user_id(),
    updated_at          timestamptz,
    updated_by          uuid,
    row_version         integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id),   -- user must be a member of this tenant
    UNIQUE (company_id, user_id),
    CHECK (allow_posting_from IS NULL OR allow_posting_to IS NULL OR allow_posting_from <= allow_posting_to),
    CHECK (allow_vat_date_from IS NULL OR allow_vat_date_to IS NULL OR allow_vat_date_from <= allow_vat_date_to)
);
CREATE INDEX ix_user_setup__user ON platform.user_setup (tenant_id, user_id);
COMMENT ON TABLE platform.user_setup IS 'Mirrors BC table 91 User Setup (posting window per user; R2). Narrows, never widens, the company window.';

-- -----------------------------------------------------------------------------
-- Source codes and reason codes
-- -----------------------------------------------------------------------------
CREATE TABLE platform.source_code (
    code           platform.code20 PRIMARY KEY,
    description    text NOT NULL,
    description_en text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE platform.source_code IS 'Mirrors BC table 230 Source Code (+ fixed Source Code Setup T242). Global, product-defined catalog.';

INSERT INTO platform.source_code (code, description, description_en) VALUES
    ('GENJNL',      'Ерөнхий журнал',                       'General journal'),
    ('STDJNL',      'Стандарт журнал',                      'Standard journal'),
    ('OPENING',     'Эхний үлдэгдэл',                       'Opening balances'),
    ('SALES',       'Борлуулалт',                           'Sales'),
    ('PURCHASES',   'Худалдан авалт',                       'Purchases'),
    ('CASHRECJNL',  'Мөнгөн орлогын журнал',               'Cash receipt journal'),
    ('PAYMENTJNL',  'Төлбөрийн журнал',                     'Payment journal'),
    ('CASHVOUCHER', 'Кассын баримт (МХ-1/МХ-2)',            'Cash voucher'),
    ('PAYMENTREG',  'Төлбөр бүртгэх',                       'Payment registration'),
    ('BANKREC',     'Банкны тулгалт',                       'Bank reconciliation'),
    ('PAYMTRECON',  'Төлбөрийн тулгалтын журнал',           'Payment reconciliation journal'),
    ('SALESAPPL',   'Авлагын тулгалт',                      'Sales entry application'),
    ('PURCHAPPL',   'Өглөгийн тулгалт',                     'Purchase entry application'),
    ('UNAPPSALES',  'Авлагын тулгалт цуцлах',               'Unapply sales entries'),
    ('UNAPPPURCH',  'Өглөгийн тулгалт цуцлах',              'Unapply purchase entries'),
    ('REVERSAL',    'Буцаалт',                              'Reversal'),
    ('EXCHRATADJ',  'Ханшийн тэгшитгэл',                    'Exchange rate adjustment'),
    ('VATSTMT',     'НӨАТ-ын хаалт',                        'VAT settlement'),
    ('CITYTAXSTMT', 'НХАТ-ын хаалт',                        'City tax settlement'),
    ('CLSINCOME',   'Орлого, зарлагын хаалт',               'Close income statement'),
    ('FAGLJNL',     'Үндсэн хөрөнгийн бичилт',              'Fixed asset posting'),
    ('DEPRECIATION','Элэгдэл',                              'Depreciation run'),
    ('INVTADJMT',   'Барааны өртгийн тохируулга',           'Inventory cost adjustment'),
    ('ITEMJNL',     'Барааны журнал',                       'Item journal');

CREATE TABLE platform.reason_code (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    code           platform.code20 NOT NULL,
    description    text NOT NULL,
    description_en text,
    blocked        boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    updated_at     timestamptz,
    updated_by     uuid,
    row_version    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE platform.reason_code IS 'Mirrors BC table 231 Reason Code. Required on credit memos, reversals and period reopen.';

-- -----------------------------------------------------------------------------
-- Number series (BC tables 308/309; DECISIONS D-C7)
-- -----------------------------------------------------------------------------
CREATE TABLE platform.number_series (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL,
    company_id    uuid NOT NULL,
    code          platform.code20 NOT NULL,
    description   text NOT NULL,
    default_nos   boolean NOT NULL DEFAULT true,
    manual_nos    boolean NOT NULL DEFAULT false,
    date_order    boolean NOT NULL DEFAULT true,
    gapless       boolean NOT NULL DEFAULT false,   -- true: legal documents; number drawn inside the posting transaction
    reset_yearly  boolean NOT NULL DEFAULT false,   -- D-C7 PREFIX-YYYY-#####: a line must exist for the posting year (no fallback to last year's line)
    document_kind text,                             -- informational tag, e.g. POSTED_SALES_INVOICE, CASH_RECEIPT
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid DEFAULT platform.current_user_id(),
    updated_at    timestamptz,
    updated_by    uuid,
    row_version   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK (NOT (gapless AND manual_nos))
);
COMMENT ON TABLE platform.number_series IS 'Mirrors BC table 308 No. Series. gapless = legal document numbering (D-C7); a gapless series never allows manual numbers. reset_yearly = numbering restarts every calendar year (one line per year, starting 01-01); posting into a year without its line fails instead of continuing the previous year''s prefix.';

CREATE TABLE platform.number_series_line (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL,
    company_id       uuid NOT NULL,
    number_series_id uuid NOT NULL,
    line_no          integer NOT NULL,
    starting_date    date NOT NULL,                 -- yearly lines: 2026-01-01 / prefix SI-2026-
    prefix           text NOT NULL DEFAULT '' CHECK (char_length(prefix) <= 20),
    suffix           text NOT NULL DEFAULT '' CHECK (char_length(suffix) <= 10),
    width            smallint NOT NULL DEFAULT 5 CHECK (width BETWEEN 1 AND 12),
    starting_no      bigint NOT NULL DEFAULT 1 CHECK (starting_no >= 0),
    ending_no        bigint,
    warning_no       bigint,
    increment_by     integer NOT NULL DEFAULT 1 CHECK (increment_by >= 1),
    last_no_used     bigint,                        -- used by non-gapless series only (gapless: number_series_counter)
    last_date_used   date,
    open             boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),
    updated_at       timestamptz,
    updated_by       uuid,
    row_version      integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, number_series_id) REFERENCES platform.number_series (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, number_series_id, line_no),
    UNIQUE (company_id, number_series_id, starting_date),
    UNIQUE (company_id, id),
    CHECK (ending_no IS NULL OR ending_no >= starting_no),
    CHECK (warning_no IS NULL OR (warning_no >= starting_no AND (ending_no IS NULL OR warning_no <= ending_no)))
);
COMMENT ON TABLE platform.number_series_line IS 'Mirrors BC table 309 No. Series Line (dated ranges, integer arithmetic instead of IncStr).';

CREATE TABLE platform.number_series_counter (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    number_series_line_id uuid NOT NULL,
    last_no_used          bigint NOT NULL,
    last_date_used        date NOT NULL,
    updated_at            timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, number_series_line_id) REFERENCES platform.number_series_line (company_id, id),
    UNIQUE (company_id, number_series_line_id)
);
COMMENT ON TABLE platform.number_series_counter IS 'Hot counter row for gapless series (BC Last No. Used of T309 split out). Locked with UPDATE inside the posting transaction, so a rolled-back posting leaves no gap (ADR-0008).';

CREATE FUNCTION platform.fn_next_document_no(p_series_code text, p_date date) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_company   uuid := platform.current_company_id();
    v_tenant    uuid := platform.current_tenant_id();
    s           platform.number_series%ROWTYPE;
    l           platform.number_series_line%ROWTYPE;
    v_prev_no   bigint;
    v_last_date date;
    v_no        bigint;
BEGIN
    SELECT * INTO s FROM platform.number_series WHERE company_id = v_company AND code = p_series_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'number series % not found', p_series_code USING ERRCODE = 'ERN01';
    END IF;
    -- The line row lock serializes all allocations of this series until the caller commits.
    SELECT * INTO l FROM platform.number_series_line
     WHERE company_id = v_company AND number_series_id = s.id AND starting_date <= p_date AND open
     ORDER BY starting_date DESC LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no open line in number series % for %', p_series_code, p_date USING ERRCODE = 'ERN01';
    END IF;
    IF s.reset_yearly AND extract(year FROM l.starting_date) <> extract(year FROM p_date) THEN
        RAISE EXCEPTION 'number series % has no line for year % (yearly reset, D-C7)', p_series_code, extract(year FROM p_date)
            USING ERRCODE = 'ERN01';
    END IF;

    IF s.gapless THEN
        SELECT last_no_used, last_date_used INTO v_prev_no, v_last_date
          FROM platform.number_series_counter
         WHERE company_id = v_company AND number_series_line_id = l.id
           FOR UPDATE;
    ELSE
        v_prev_no := l.last_no_used;
        v_last_date := l.last_date_used;
    END IF;
    v_no := CASE WHEN v_prev_no IS NULL THEN l.starting_no ELSE v_prev_no + l.increment_by END;

    IF s.date_order AND v_last_date IS NOT NULL AND p_date < v_last_date THEN
        RAISE EXCEPTION 'number series % requires date order (% < %)', p_series_code, p_date, v_last_date
            USING ERRCODE = 'ERN02';
    END IF;
    IF l.ending_no IS NOT NULL AND v_no > l.ending_no THEN
        RAISE EXCEPTION 'number series % exhausted', p_series_code USING ERRCODE = 'ERN03';
    END IF;

    IF s.gapless THEN
        IF v_prev_no IS NULL THEN
            INSERT INTO platform.number_series_counter (tenant_id, company_id, number_series_line_id, last_no_used, last_date_used)
            VALUES (v_tenant, v_company, l.id, v_no, p_date);
        ELSE
            UPDATE platform.number_series_counter
               SET last_no_used = v_no, last_date_used = greatest(last_date_used, p_date), updated_at = now()
             WHERE company_id = v_company AND number_series_line_id = l.id;
        END IF;
    ELSE
        UPDATE platform.number_series_line
           SET last_no_used = v_no, last_date_used = greatest(coalesce(last_date_used, p_date), p_date),
               open = (ending_no IS NULL OR v_no < ending_no)
         WHERE id = l.id;
    END IF;
    RETURN l.prefix || lpad(v_no::text, l.width, '0') || l.suffix;
END $$;
COMMENT ON FUNCTION platform.fn_next_document_no(text, date) IS
    'BC No. Series GetNextNo. Gapless series: counter row upserted/locked inside the caller transaction (call as late as possible in posting). SECURITY DEFINER: app_user has no DML on the counter tables, so numbers can only be drawn here (no manual gaps).';

-- -----------------------------------------------------------------------------
-- Ledger counters: Entry No. / Transaction No. / Register No. per company and ledger (D-C6, D-C8)
-- -----------------------------------------------------------------------------
CREATE TABLE platform.ledger_counter (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL,
    company_id  uuid NOT NULL,
    ledger      text NOT NULL CHECK (ledger ~ '^[A-Z][A-Z0-9_]{1,40}$'),  -- GL_ENTRY, GL_TRANSACTION, GL_REGISTER, VAT_ENTRY, ...
    last_no     bigint NOT NULL DEFAULT 0 CHECK (last_no >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, ledger)
);
COMMENT ON TABLE platform.ledger_counter IS 'Per-company counters replacing BC "last Entry No. + 1" under LockTable (CU12). Updated only inside the posting transaction, so numbers are gapless.';

CREATE FUNCTION platform.fn_next_entry_no(p_ledger text, p_count integer DEFAULT 1) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_last bigint;
BEGIN
    IF p_count < 1 THEN
        RAISE EXCEPTION 'p_count must be >= 1' USING ERRCODE = '22023';
    END IF;
    INSERT INTO platform.ledger_counter AS c (tenant_id, company_id, ledger, last_no)
    VALUES (platform.current_tenant_id(), platform.current_company_id(), p_ledger, p_count)
    ON CONFLICT (company_id, ledger) DO UPDATE SET last_no = c.last_no + p_count, updated_at = now()
    RETURNING c.last_no INTO v_last;
    RETURN v_last - p_count + 1;   -- first number of the reserved block
END $$;
COMMENT ON FUNCTION platform.fn_next_entry_no(text, integer) IS
    'Reserves p_count consecutive numbers of a ledger for the current company; returns the first. Row lock lasts until commit. SECURITY DEFINER (counter rows are not writable by app_user).';
