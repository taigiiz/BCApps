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
-- D-J3: eBarimt qrData / lottery must never be persisted (defined here because CHECKs from 120 on use it). Checked at ANY nesting depth
-- (a top-level `?|` check misses {"response": {"qrData": ...}}).
-- -----------------------------------------------------------------------------
CREATE FUNCTION integration.fn_has_forbidden_ebarimt_keys(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT EXISTS (SELECT 1 FROM jsonb_path_query(p, 'strict $.** ? (@.type() == "object")') o(v)
                    CROSS JOIN LATERAL jsonb_object_keys(o.v) k
                   WHERE lower(k) IN ('qrdata','qr_data','lottery','lotteryno','lottery_no'))
$$;
COMMENT ON FUNCTION integration.fn_has_forbidden_ebarimt_keys(jsonb) IS 'True when a JSON document contains a qrData / lottery key at any depth (D-J3). Used by CHECK constraints on every persisted JSON payload.';


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
    require_mfa_all_users    boolean NOT NULL DEFAULT false,                -- CR #59: tenant-wide MFA policy (R2)
    legal_hold_until         date,                                          -- CR #59: no retention purge while set (SEC-RET-03)
    retention_years_override smallint CHECK (retention_years_override >= 10),   -- CR #59: longer retention than the 10-year default (D-I3)
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),
    updated_at       timestamptz,
    updated_by       uuid,
    row_version      integer NOT NULL DEFAULT 1
);
COMMENT ON TABLE platform.tenant IS 'SaaS subscriber account (contract, plan, user limits). No BC equivalent (BC tenant is infrastructure); holds 1..N companies. status / plan_code / max_companies / legal hold are changed only by platform operators (platform.fn_set_tenant_status, column grants in 900).';

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
    director_name                  text CHECK (char_length(director_name) <= 200),          -- CR #80: printed on ТМ-1/МХ-1/МХ-2 (may not be a system user)
    chief_accountant_name          text CHECK (char_length(chief_accountant_name) <= 200),  -- CR #80
    logo_attachment_id             uuid,                                                    -- CR #80: platform.attachment (purpose LOGO), FK added in 140
    stamp_attachment_id            uuid,                                                    -- CR #80: platform.attachment (purpose STAMP), FK added in 140
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
COMMENT ON TABLE platform.app_user IS 'Global identity (a user may belong to several tenants). Mirrors BC system table User (2000000120). Visible to a tenant only through tenant_membership (RLS). The application may update only display_name, phone, preferred_language, last_login_at (column grants in 900).';

-- CR #48 (SEC-JOB-03): fixed system principal for changed_by / created_by of background jobs. It has no credential
-- (identity.user_credential) and is DISABLED, so nobody can sign in as it. Inserted before RLS is enabled (900).
INSERT INTO platform.app_user (id, email, display_name, preferred_language, status)
VALUES ('00000000-0000-7000-8000-000000000001', 'system@erp.invalid', 'System', 'en', 'DISABLED');

-- CR #48 (SEC-RLS-11): identifiable platform operators (support engineers, security admins, DBAs). Tenant-less;
-- app_user may only read it (no DML grant: the table has no tenant_id); rows are written by the migrator / ops.
CREATE TABLE platform.platform_operator (
    user_id      uuid PRIMARY KEY REFERENCES platform.app_user (id),
    role         text NOT NULL CHECK (role IN ('SUPPORT','SECURITY_ADMIN','DBA')),
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid
);
COMMENT ON TABLE platform.platform_operator IS 'Platform operators (support, security admin, DBA): who may act on support grants, tenant status and purges (CR #48). Global, written by ops only. No BC equivalent.';

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
    expires_at   timestamptz,                          -- CR #40 (FR-PLT-005, SEC-ID-07): optional time limit (external accountant)
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, role_id) REFERENCES platform.role (tenant_id, id),
    UNIQUE NULLS NOT DISTINCT (tenant_id, user_id, company_id, role_id),
    CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX ix_user_company_role__role ON platform.user_company_role (tenant_id, role_id);
CREATE INDEX ix_user_company_role__company ON platform.user_company_role (tenant_id, company_id);
CREATE INDEX ix_user_company_role__user ON platform.user_company_role (tenant_id, user_id);
COMMENT ON TABLE platform.user_company_role IS 'Mirrors BC system table Access Control (2000000053): user x company x role (company NULL = all companies). expires_at: assignment ignored by the permission resolver after that time. Changes are audited (explicit audit trigger, 140).';

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
-- Invitations, integration clients, tenant keys and secrets, signatories (13-security CR-05/07/08/14/18)
-- -----------------------------------------------------------------------------
CREATE TABLE platform.tenant_invitation (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES platform.tenant (id),
    email             text NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
    role_id           uuid NOT NULL,
    company_id        uuid,                                  -- NULL = all companies of the tenant
    token_hash        bytea NOT NULL CHECK (octet_length(token_hash) = 32),   -- SHA-256 of the one-time token (never the token)
    expires_at        timestamptz NOT NULL,
    invited_by        uuid,
    accepted_at       timestamptz,
    accepted_user_id  uuid REFERENCES platform.app_user (id),
    revoked_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid DEFAULT platform.current_user_id(),
    updated_at        timestamptz,
    updated_by        uuid,
    row_version       integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, role_id) REFERENCES platform.role (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (token_hash),
    CHECK (expires_at > created_at),
    CHECK ((accepted_at IS NULL) = (accepted_user_id IS NULL)),
    CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX ix_tenant_invitation__role ON platform.tenant_invitation (tenant_id, role_id);
CREATE INDEX ix_tenant_invitation__company ON platform.tenant_invitation (tenant_id, company_id);
CREATE INDEX ix_tenant_invitation__email ON platform.tenant_invitation (tenant_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX ix_tenant_invitation__accepted_user ON platform.tenant_invitation (accepted_user_id) WHERE accepted_user_id IS NOT NULL;
COMMENT ON TABLE platform.tenant_invitation IS 'Invitation of an e-mail (with or without an account) into a tenant with a role (CR #43, SEC-ID-08). Looked up and accepted before a tenant context exists through platform.fn_find_invitation / fn_accept_invitation (SECURITY DEFINER). No BC equivalent.';

CREATE TABLE platform.integration_client (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- service principal id (sub of client_credentials tokens)
    tenant_id          uuid NOT NULL REFERENCES platform.tenant (id),
    company_id         uuid,                                          -- NULL = every company of the tenant
    name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    oidc_client_id     text NOT NULL UNIQUE,
    permission_set_id  uuid NOT NULL REFERENCES platform.permission_set (id),
    expires_at         timestamptz,
    revoked_at         timestamptz,
    revoked_by         uuid,
    last_used_at       timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid DEFAULT platform.current_user_id(),
    updated_at         timestamptz,
    updated_by         uuid,
    row_version        integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    CHECK (revoked_at IS NULL OR revoked_by IS NOT NULL)
);
CREATE INDEX ix_integration_client__permission_set ON platform.integration_client (permission_set_id);
CREATE INDEX ix_integration_client__company ON platform.integration_client (tenant_id, company_id);
COMMENT ON TABLE platform.integration_client IS 'OAuth client_credentials client of a tenant (FR-INT-003, CR #47): optional company scope and one permission set. No BC equivalent (BC: Microsoft Entra application).';

CREATE TABLE platform.tenant_key (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES platform.tenant (id),
    purpose      text NOT NULL CHECK (purpose IN ('PII_ENC','PII_HMAC','SECRET_ENC')),
    version      integer NOT NULL CHECK (version > 0),
    wrapped_key  bytea NOT NULL,                   -- data key encrypted with the KEK (envelope encryption)
    kek_id       text NOT NULL,
    algorithm    text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    retired_at   timestamptz,
    UNIQUE (tenant_id, purpose, version)
);
CREATE UNIQUE INDEX ux_tenant_key__active ON platform.tenant_key (tenant_id, purpose) WHERE retired_at IS NULL;
COMMENT ON TABLE platform.tenant_key IS 'Per-tenant data keys for PII and secret envelope encryption (CR #45, 13 §10.6/§11.3): KEK rotation = rewrap (wrapped_key, kek_id, retired_at are the only updatable columns, 900); purge deletes the keys (crypto-shredding).';

CREATE TABLE platform.tenant_secret (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES platform.tenant (id),
    company_id   uuid,
    kind         text NOT NULL CHECK (kind ~ '^[A-Z][A-Z0-9_]{1,40}$'),   -- EBARIMT_TPI, EBARIMT_API_KEY, BANK_API, QPAY, WEBHOOK, ...
    ciphertext   bytea NOT NULL,                                          -- envelope-encrypted with tenant_key SECRET_ENC
    key_version  integer NOT NULL CHECK (key_version > 0),
    last4        text CHECK (char_length(last4) <= 4),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    rotated_at   timestamptz,
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (tenant_id, id)
);
CREATE INDEX ix_tenant_secret__company ON platform.tenant_secret (tenant_id, company_id);
COMMENT ON TABLE platform.tenant_secret IS 'Third-party credentials of a tenant (eBarimt TPI / API key, bank API, QPay; CR #58, #10, 02 §10.4). Only ciphertext + last 4 characters; ciphertext is redacted in audit.row_change.';

CREATE TABLE platform.company_signatory (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    company_id   uuid NOT NULL,
    signer_role  text NOT NULL CHECK (signer_role IN ('DIRECTOR','CHIEF_ACCOUNTANT','CASHIER')),
    user_id      uuid NOT NULL,
    valid_from   date NOT NULL,
    valid_to     date,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id),
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
    -- one director / one chief accountant at a time; several cashiers may sign in parallel
    EXCLUDE USING gist (company_id WITH =, signer_role WITH =, daterange(valid_from, valid_to, '[]') WITH &&)
        WHERE (signer_role <> 'CASHIER')
);
CREATE INDEX ix_company_signatory__user ON platform.company_signatory (tenant_id, user_id);
COMMENT ON TABLE platform.company_signatory IS 'Designated signers of a company (CR #53, REQ-ACC-01, SEC-SIG-04): only these users may sign as director / chief accountant / cashier in the validity period. No BC equivalent.';

-- -----------------------------------------------------------------------------
-- Per-user UI state (15-ui-ux SCR-UI-01/02/03; cue/saved views are R2)
-- -----------------------------------------------------------------------------
CREATE TABLE platform.user_preference (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    user_id      uuid NOT NULL,
    company_id   uuid,                                 -- NULL = all companies
    pref_key     text NOT NULL CHECK (pref_key IN ('date_format','home_variant','receipt_width_mm','single_key_shortcuts',
                                                   'report_units','factbox_open','default_ebarimt_pos_id')),
    value        jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE NULLS NOT DISTINCT (tenant_id, user_id, company_id, pref_key)
);
CREATE INDEX ix_user_preference__company ON platform.user_preference (tenant_id, company_id);
COMMENT ON TABLE platform.user_preference IS 'My settings synced across devices (S-PLT-16, CR #85/#91): one JSON value per key; localStorage is only the R1 fallback. Not audited (UI state).';

CREATE TABLE platform.cue_setup (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL,
    company_id    uuid NOT NULL,
    user_id       uuid,                                -- NULL = company default
    cue_id        text NOT NULL CHECK (cue_id ~ '^CUE-[0-9]{2}$'),
    threshold1    numeric(19,4),
    threshold2    numeric(19,4),
    low_style     text NOT NULL DEFAULT 'NONE' CHECK (low_style IN ('NONE','FAVORABLE','UNFAVORABLE','AMBIGUOUS','SUBORDINATE')),
    middle_style  text NOT NULL DEFAULT 'NONE' CHECK (middle_style IN ('NONE','FAVORABLE','UNFAVORABLE','AMBIGUOUS','SUBORDINATE')),
    high_style    text NOT NULL DEFAULT 'NONE' CHECK (high_style IN ('NONE','FAVORABLE','UNFAVORABLE','AMBIGUOUS','SUBORDINATE')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid DEFAULT platform.current_user_id(),
    updated_at    timestamptz,
    updated_by    uuid,
    row_version   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id) ON DELETE CASCADE,
    UNIQUE NULLS NOT DISTINCT (company_id, user_id, cue_id),
    CHECK (threshold1 IS NULL OR threshold2 IS NULL OR threshold1 <= threshold2)
);
CREATE INDEX ix_cue_setup__user ON platform.cue_setup (tenant_id, user_id);
COMMENT ON TABLE platform.cue_setup IS 'Simplified BC table 9701 Cue Setup (R2, CR #86): user-adjustable cue thresholds and styles.';

CREATE TABLE platform.saved_view (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    company_id   uuid NOT NULL,
    user_id      uuid NOT NULL,
    page_id      text NOT NULL CHECK (char_length(page_id) BETWEEN 1 AND 40),   -- e.g. S-SAL-02
    name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    filters      jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort         jsonb NOT NULL DEFAULT '[]'::jsonb,
    columns      jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_default   boolean NOT NULL DEFAULT false,
    shared       boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id) ON DELETE CASCADE,
    UNIQUE (company_id, user_id, page_id, name)
);
CREATE UNIQUE INDEX ux_saved_view__default ON platform.saved_view (company_id, user_id, page_id) WHERE is_default;
CREATE INDEX ix_saved_view__user ON platform.saved_view (tenant_id, user_id);
COMMENT ON TABLE platform.saved_view IS 'Saved list views / grid column state on the server (R2, CR #87, UX-GRID-15; BC Views).';

-- -----------------------------------------------------------------------------
-- Tenant purge evidence (13 CR-17; 02 §7.7/§8.1). Tenant-less: kept after the tenant rows are gone.
-- -----------------------------------------------------------------------------
CREATE TABLE platform.tenant_purge_log (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purged_tenant_id  uuid NOT NULL,                    -- not "tenant_id": the row must outlive the tenant and stay outside tenant RLS
    tenant_name       text,
    purged_at         timestamptz NOT NULL DEFAULT now(),
    operator_ids      uuid[] NOT NULL CHECK (cardinality(operator_ids) >= 1),
    ticket            text NOT NULL,
    row_counts        jsonb NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_tenant_purge_log__tenant ON platform.tenant_purge_log (purged_tenant_id);
COMMENT ON TABLE platform.tenant_purge_log IS 'Append-only evidence of a completed tenant purge (who, ticket, row counts per table). Written by the migrator during the purge procedure (platform.fn_guard_immutable purge branch); invisible to application roles.';

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
    ('ITEMJNL',     'Барааны журнал',                       'Item journal'),
    ('PHYSINVJNL',  'Бараа материалын тооллого',            'Physical inventory journal'),     -- CR #97
    ('VATADJ',      'Орцын НӨАТ-ын тохируулга (хасалт)',    'Input VAT adjustment');           -- CR #168 (BR-TAX-51)

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
    yearly_prefix_pattern text,                     -- CR #132 (FR-PLT-008 AC3): e.g. 'SI-{YYYY}-'; the allocator creates the missing yearly line on first use
    document_kind text,                             -- informational tag, e.g. POSTED_SALES_INVOICE, CASH_RECEIPT
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid DEFAULT platform.current_user_id(),
    updated_at    timestamptz,
    updated_by    uuid,
    row_version   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK (NOT (gapless AND manual_nos)),
    CHECK (yearly_prefix_pattern IS NULL
           OR (reset_yearly AND strpos(yearly_prefix_pattern, '{YYYY}') > 0 AND char_length(yearly_prefix_pattern) <= 22))
);
COMMENT ON TABLE platform.number_series IS 'Mirrors BC table 308 No. Series. gapless = legal document numbering (D-C7); a gapless series never allows manual numbers. reset_yearly = numbering restarts every calendar year (one line per year, starting 01-01); posting into a year without its line fails instead of continuing the previous year''s prefix, unless yearly_prefix_pattern is set: then platform.fn_next_document_no creates the line of the new year ({YYYY} replaced, numbering from 1) inside the posting transaction.';

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

-- Evidence of every gapless number drawn (16-test-strategy SCR-T03, I-07, Order 47): one append-only row per
-- allocation, written by fn_next_document_no in the same transaction, so a rolled-back posting leaves no row and
-- platform.v_number_series_gap (920) can prove gaplessness from one place.
CREATE TABLE platform.number_allocation (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    number_series_line_id uuid NOT NULL,
    no                    bigint NOT NULL,
    document_no           text NOT NULL,
    allocated_on          date NOT NULL,                -- the document (posting) date passed to the allocator
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, number_series_line_id) REFERENCES platform.number_series_line (company_id, id),
    UNIQUE (company_id, number_series_line_id, no)
);
COMMENT ON TABLE platform.number_allocation IS 'Append-only log of every number drawn from a gapless series (CR #119). Written only by platform.fn_next_document_no; ledger-guarded (910).';

CREATE FUNCTION platform.fn_next_document_no(p_series_code text, p_date date) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_company   uuid := platform.current_company_id();
    v_tenant    uuid := platform.current_tenant_id();
    s           platform.number_series%ROWTYPE;
    l           platform.number_series_line%ROWTYPE;
    v_found     boolean;
    v_year      integer := extract(year FROM p_date)::integer;
    v_prev_no   bigint;
    v_last_date date;
    v_no        bigint;
    v_doc_no    text;
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
    v_found := FOUND;
    IF s.reset_yearly AND (NOT v_found OR extract(year FROM l.starting_date) <> v_year) THEN
        IF s.yearly_prefix_pattern IS NULL THEN
            RAISE EXCEPTION 'number series % has no line for year % (yearly reset, D-C7)', p_series_code, v_year
                USING ERRCODE = 'ERN01';
        END IF;
        -- CR #132: open the line of the new year (posting is serialized per company, D-C6)
        INSERT INTO platform.number_series_line (tenant_id, company_id, number_series_id, line_no, starting_date, prefix, suffix,
                                                 width, starting_no, increment_by)
        VALUES (v_tenant, v_company, s.id, v_year, make_date(v_year, 1, 1),
                replace(s.yearly_prefix_pattern, '{YYYY}', v_year::text),
                CASE WHEN v_found THEN l.suffix ELSE '' END, CASE WHEN v_found THEN l.width ELSE 5 END, 1,
                CASE WHEN v_found THEN l.increment_by ELSE 1 END)
        RETURNING * INTO l;
        PERFORM 1 FROM platform.number_series_line WHERE id = l.id FOR UPDATE;
        v_found := true;
    END IF;
    IF NOT v_found THEN
        RAISE EXCEPTION 'no open line in number series % for %', p_series_code, p_date USING ERRCODE = 'ERN01';
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
    v_doc_no := l.prefix || lpad(v_no::text, l.width, '0') || l.suffix;

    IF s.gapless THEN
        IF v_prev_no IS NULL THEN
            INSERT INTO platform.number_series_counter (tenant_id, company_id, number_series_line_id, last_no_used, last_date_used)
            VALUES (v_tenant, v_company, l.id, v_no, p_date);
        ELSE
            UPDATE platform.number_series_counter
               SET last_no_used = v_no, last_date_used = greatest(last_date_used, p_date), updated_at = now()
             WHERE company_id = v_company AND number_series_line_id = l.id;
        END IF;
        INSERT INTO platform.number_allocation (tenant_id, company_id, number_series_line_id, no, document_no, allocated_on)
        VALUES (v_tenant, v_company, l.id, v_no, v_doc_no, p_date);
    ELSE
        UPDATE platform.number_series_line
           SET last_no_used = v_no, last_date_used = greatest(coalesce(last_date_used, p_date), p_date),
               open = (ending_no IS NULL OR v_no < ending_no)
         WHERE id = l.id;
    END IF;
    RETURN v_doc_no;
END $$;
COMMENT ON FUNCTION platform.fn_next_document_no(text, date) IS
    'BC No. Series GetNextNo. Gapless series: counter row upserted/locked inside the caller transaction (call as late as possible in posting) and the number logged in platform.number_allocation. reset_yearly series with yearly_prefix_pattern get the line of a new year created on first use. SECURITY DEFINER: app_user has no DML on the counter tables, so numbers can only be drawn here (no manual gaps).';

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
