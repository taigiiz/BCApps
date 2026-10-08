-- =============================================================================
-- 130_ebarimt.sql
-- eBarimt PosAPI 3.0 anti-corruption layer (D-J1..D-J4): operator PosAPI instances,
-- company setup, POS terminals, one eBarimt document per posted sales document,
-- reference caches and imported supplier receipts.
-- NEVER stored (D-J3): qrData, lottery number - not in tables, logs or caches.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- Global (operator-level) -------------------------------------------------------
CREATE TABLE ebarimt.posapi_instance (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code               text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9\-]{1,40}$'),
    environment        text NOT NULL CHECK (environment IN ('STAGING','PRODUCTION')),
    base_url           text NOT NULL,                  -- http://<host>:7080 (Mongolian network only)
    operator_tin       platform.tin,
    max_merchants      integer NOT NULL DEFAULT 1000 CHECK (max_merchants > 0),
    status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAINING','DISABLED')),
    last_send_data_at  timestamptz,
    left_lotteries     integer,                         -- count from GET /rest/info (monitoring only)
    merchant_soft_limit         integer NOT NULL DEFAULT 800 CHECK (merchant_soft_limit > 0),            -- CR #7/#25 (ADR-0013, TOP-07)
    receipts_per_day_soft_limit integer NOT NULL DEFAULT 70000 CHECK (receipts_per_day_soft_limit > 0),
    health_status      text NOT NULL DEFAULT 'UNKNOWN' CHECK (health_status IN ('UP','DOWN','UNKNOWN')),   -- MON-02: stop dispatching when DOWN
    last_info_at       timestamptz,
    last_info_error    text,
    version            text,                            -- PosAPI version reported by GET /rest/info
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz,
    CHECK (merchant_soft_limit <= max_merchants)
);
COMMENT ON TABLE ebarimt.posapi_instance IS 'Global registry of our operated PosAPI instances (D-B5 operator model, <= 1,000 merchants each). Written by ops/worker only. Tenants read only non-sensitive columns (no base_url / operator_tin; column grants in 900) and their own instance through ebarimt.v_company_posapi_status.';

CREATE TABLE ebarimt.classification_code (
    code          char(7) PRIMARY KEY CHECK (code ~ '^[0-9]{7}$'),
    name          text NOT NULL,
    parent_code   char(7),
    level         smallint,
    is_leaf       boolean NOT NULL DEFAULT true,
    active        boolean NOT NULL DEFAULT true,     -- CR #11 (REF-02): codes dropped by the source are deactivated, never deleted
    fetched_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ebarimt.classification_code IS 'Global cache of БҮНА product classification codes (7 digits) from api.ebarimt.mn reference services.';

CREATE TABLE ebarimt.tax_product_code (
    code          text PRIMARY KEY CHECK (code ~ '^[0-9A-Za-z]{1,10}$'),
    name          text NOT NULL,
    tax_type      platform.ebarimt_tax_type NOT NULL CHECK (tax_type <> 'VAT_ABLE'),
    valid_from    date,
    valid_to      date,
    fetched_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ebarimt.tax_product_code IS 'Global cache of getProductTaxCode (taxProductCode required for VAT_FREE / VAT_ZERO / NOT_VAT lines).';

-- CR #11/#29: getBranchInfo and barcode -> БҮНА caches (global, worker-written)
CREATE TABLE ebarimt.district (
    district_code     char(4) PRIMARY KEY CHECK (district_code ~ '^[0-9]{4}$'),
    branch_code       char(2) NOT NULL,
    branch_name       text NOT NULL,
    sub_branch_code   char(2) NOT NULL,
    sub_branch_name   text NOT NULL,
    active            boolean NOT NULL DEFAULT true,
    fetched_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ebarimt.district IS 'Global cache of PosAPI getBranchInfo (aimag/district + sum/khoroo codes forming districtCode).';

CREATE TABLE ebarimt.barcode_reference (
    barcode              text PRIMARY KEY CHECK (char_length(barcode) BETWEEN 1 AND 50),
    classification_code  char(7) CHECK (classification_code ~ '^[0-9]{7}$'),
    name                 text,
    fetched_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ebarimt.barcode_reference IS 'Global cache of the barcode -> БҮНА classification lookup (api.ebarimt.mn), used to pre-fill item classification codes.';

-- CR #5/#23 (02-architecture taxpayer_cache): 30-day getInfo cache for the B2B decision (SET-10, VAL-18)
CREATE TABLE ebarimt.taxpayer_info (
    tin            platform.tin PRIMARY KEY,
    found          boolean NOT NULL,
    name           text,
    vat_payer      boolean,
    city_payer     boolean,
    free_project   boolean,
    is_government  boolean,
    fetched_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (found OR (name IS NULL AND vat_payer IS NULL))
);
CREATE INDEX ix_taxpayer_info__fetched ON ebarimt.taxpayer_info (fetched_at);
COMMENT ON TABLE ebarimt.taxpayer_info IS 'Global cache of taxpayer registry lookups (getInfo by TIN; public registry data of legal entities). Refreshed after 30 days (job ebarimt.taxpayer_refresh).';

-- Company setup ---------------------------------------------------------------------
CREATE TABLE ebarimt.ebarimt_setup (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    enabled               boolean NOT NULL DEFAULT false,
    environment           text NOT NULL DEFAULT 'STAGING' CHECK (environment IN ('STAGING','PRODUCTION')),
    merchant_tin          platform.tin NOT NULL,
    merchant_name         text,
    district_code         char(4) NOT NULL CHECK (district_code ~ '^[0-9]{4}$'),
    branch_no             char(3) NOT NULL DEFAULT '001' CHECK (branch_no ~ '^[0-9]{3}$'),
    posapi_instance_id    uuid REFERENCES ebarimt.posapi_instance (id),
    registered_with_operator_at timestamptz,          -- saveOprMerchants done
    vat_payer             boolean NOT NULL DEFAULT false,    -- from getInfo (cross-check with company_setup)
    city_tax_payer        boolean NOT NULL DEFAULT false,
    default_b2c_when_no_tin boolean NOT NULL DEFAULT true,
    registration_status   text NOT NULL DEFAULT 'DRAFT'
                          CHECK (registration_status IN ('DRAFT','REQUESTED','AWAITING_CONFIRMATION','ACTIVE','SUSPENDED')),  -- CR #4 (02 §9.3)
    activated_at          timestamptz,
    suspended_reason      text,
    default_classification_code char(7) CHECK (default_classification_code ~ '^[0-9]{7}$'),   -- БҮНА for G/L lines (MAP-31)
    expected_daily_receipts integer CHECK (expected_daily_receipts >= 0),                      -- instance load weighting (TOP-08)
    invoice_flow_enabled  boolean NOT NULL DEFAULT false,                                     -- R2 *_INVOICE + invoiceId flow (D-J1)
    non_vat_payer_tax_type text NOT NULL DEFAULT 'NOT_VAT' CHECK (non_vat_payer_tax_type IN ('NOT_VAT','VAT_FREE')),   -- D-E5 ⚠ СМТТ
    tpi_secret_id         uuid,                                                               -- CR #10: platform.tenant_secret (TPI / X-API-KEY)
    auto_confirm_imported boolean NOT NULL DEFAULT true,                                      -- CR #28 (FR-PUR-009, PUR-12; OQ-14 may flip it)
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    updated_at            timestamptz,
    updated_by            uuid,
    row_version           integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, tpi_secret_id) REFERENCES platform.tenant_secret (tenant_id, id),
    UNIQUE (company_id),
    CHECK (registration_status <> 'ACTIVE' OR activated_at IS NOT NULL),
    CHECK (registration_status <> 'SUSPENDED' OR suspended_reason IS NOT NULL)
);
CREATE INDEX ix_ebarimt_setup__instance ON ebarimt.ebarimt_setup (posapi_instance_id);
CREATE INDEX ix_ebarimt_setup__secret ON ebarimt.ebarimt_setup (tenant_id, tpi_secret_id);
COMMENT ON TABLE ebarimt.ebarimt_setup IS 'Per-company eBarimt merchant settings (merchant TIN, district code, branch, PosAPI instance). No BC equivalent (localization).';

CREATE TABLE ebarimt.ebarimt_pos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL,
    company_id       uuid NOT NULL,
    pos_no           text NOT NULL CHECK (pos_no ~ '^[0-9A-Za-z]{1,10}$'),
    branch_no        char(3) NOT NULL DEFAULT '001' CHECK (branch_no ~ '^[0-9]{3}$'),
    description      text,
    bank_account_id  uuid,                         -- cash box / wallet this POS settles into
    district_code    char(4) CHECK (district_code ~ '^[0-9]{4}$'),   -- CR #11 (SET-04): branch in another district; NULL = ebarimt_setup.district_code
    is_default       boolean NOT NULL DEFAULT false,
    blocked          boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),
    updated_at       timestamptz,
    updated_by       uuid,
    row_version      integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_account_id) REFERENCES bank.bank_account (company_id, id),
    UNIQUE (company_id, branch_no, pos_no),
    UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX ux_ebarimt_pos__default ON ebarimt.ebarimt_pos (company_id) WHERE is_default;
CREATE INDEX ix_ebarimt_pos__bank_account ON ebarimt.ebarimt_pos (company_id, bank_account_id);
COMMENT ON TABLE ebarimt.ebarimt_pos IS 'Logical POS terminal of the merchant (posNo). billIdSuffix comes from ebarimt.pos_counter (never reset, D-K4) and is unique per POS per day.';

CREATE TABLE ebarimt.pos_counter (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    company_id        uuid NOT NULL,
    ebarimt_pos_id    uuid NOT NULL,
    last_seq          bigint NOT NULL DEFAULT 0 CHECK (last_seq >= 0),   -- monotonic, NEVER reset (D-K4, ADR-0012)
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, ebarimt_pos_id) REFERENCES ebarimt.ebarimt_pos (company_id, id),
    UNIQUE (company_id, ebarimt_pos_id)
);
COMMENT ON TABLE ebarimt.pos_counter IS 'billIdSuffix sequence per POS (D-K4: never reset; billIdSuffix = posNo + lpad(seq mod 10^6, 6)). Allocated only by ebarimt.fn_next_bill_seq inside the posting transaction, so a rolled-back posting reuses the number.';

CREATE FUNCTION ebarimt.fn_next_bill_seq(p_ebarimt_pos_id uuid) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_seq bigint;
BEGIN
    INSERT INTO ebarimt.pos_counter AS c (tenant_id, company_id, ebarimt_pos_id, last_seq)
    VALUES (platform.current_tenant_id(), platform.current_company_id(), p_ebarimt_pos_id, 1)
    ON CONFLICT (company_id, ebarimt_pos_id) DO UPDATE SET last_seq = c.last_seq + 1, updated_at = now()
    RETURNING c.last_seq INTO v_seq;
    RETURN v_seq;
END $$;
COMMENT ON FUNCTION ebarimt.fn_next_bill_seq(uuid) IS 'Next billIdSuffix sequence of a POS of the current company (row-locked until commit). bill_id_suffix = seq % 1000000.';

-- eBarimt documents -------------------------------------------------------------------
CREATE TABLE ebarimt.ebarimt_document (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    source_type          text NOT NULL CHECK (source_type IN ('SALES_INVOICE','SALES_CR_MEMO','PAYMENT')),
    source_id            uuid NOT NULL,                    -- posted document id (sales_invoice_header / sales_cr_memo_header)
    source_document_no   platform.document_no NOT NULL,
    operation            text NOT NULL DEFAULT 'SAVE' CHECK (operation IN ('SAVE','DELETE','MANUAL_VOID')),   -- POST vs DELETE /rest/receipt; MANUAL_VOID = B2B cancellation done in the portal (CR #3, no network call)
    ebarimt_type         text NOT NULL CHECK (ebarimt_type IN ('B2C_RECEIPT','B2B_RECEIPT','B2C_INVOICE','B2B_INVOICE')),
    status               text NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','SENT','SUCCESS','ERROR','UNKNOWN','CANCELLED')),
    ddtd                 platform.ddtd,                    -- receipt id returned by PosAPI
    parent_ddtd          platform.ddtd,                    -- invoiceId (payment receipt for an invoice, R2)
    inactive_ddtd        platform.ddtd,                    -- inactiveId (correction of the latest receipt in the chain)
    report_month         char(7) CHECK (report_month ~ '^[0-9]{4}-[0-9]{2}$'),   -- previous-month B2B correction (days 1-7)
    ebarimt_pos_id       uuid NOT NULL,
    branch_no            char(3) CHECK (branch_no ~ '^[0-9]{3}$'),            -- CR #1/#19: request snapshot (request_sha256 must be reproducible
    pos_no               text CHECK (pos_no ~ '^[0-9A-Za-z]{1,10}$'),         --   without master data that may change later)
    district_code        char(4) CHECK (district_code ~ '^[0-9]{4}$'),
    posapi_instance_id   uuid REFERENCES ebarimt.posapi_instance (id),        -- instance the request was / will be sent to (UNKNOWN resolution)
    easy                 boolean NOT NULL DEFAULT false,                      -- CR #17 (R2): easy-registration flag (payments[].data.easy)
    bill_date            date,                             -- business date (Asia/Ulaanbaatar) of billIdSuffix allocation; SAVE only
    bill_seq             bigint CHECK (bill_seq > 0),      -- ebarimt.fn_next_bill_seq value (never reset); SAVE only
    bill_id_suffix       integer CHECK (bill_id_suffix BETWEEN 0 AND 999999),   -- = bill_seq % 1000000, sent as posNo + 6 digits
    merchant_tin         platform.tin NOT NULL,
    customer_tin         platform.tin,                     -- B2B only
    consumer_no          text CHECK (consumer_no ~ '^[0-9]{8}$'),   -- B2C_RECEIPT only
    total_amount         platform.amount NOT NULL,         -- incl. VAT and city tax
    total_vat            platform.amount NOT NULL DEFAULT 0,
    total_city_tax       platform.amount NOT NULL DEFAULT 0,
    request_sha256       bytea CHECK (octet_length(request_sha256) = 32),   -- hash of the exact JSON sent (no payload stored)
    ebarimt_date         timestamptz,                      -- tax server date from the response
    error_code           text,
    error_message        text,
    posapi_message       text,                             -- CR #16: informational PosAPI message on success (e.g. DELETE awaiting the citizen)
    attempt_count        integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts         integer NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),   -- D-I6: POST /rest/receipt = 1
    last_attempt_at      timestamptz,
    sent_at              timestamptz,
    resolved_at          timestamptz,                      -- manual resolution of UNKNOWN / ERROR
    resolved_by          uuid,
    resolution_note      text,
    replaces_document_id uuid,                             -- previous document in the correction chain
    resent_from_document_id uuid,                          -- CR #8 (UNK-10): this document is a resend clone of that (cancelled) one
    outbox_id            uuid,                             -- integration.outbox message that sends it
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    updated_at           timestamptz,
    updated_by           uuid,
    row_version          integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, ebarimt_pos_id) REFERENCES ebarimt.ebarimt_pos (company_id, id),
    FOREIGN KEY (company_id, replaces_document_id) REFERENCES ebarimt.ebarimt_document (company_id, id),
    FOREIGN KEY (company_id, resent_from_document_id) REFERENCES ebarimt.ebarimt_document (company_id, id),
    UNIQUE (company_id, id),
    UNIQUE (company_id, ebarimt_pos_id, bill_seq),                       -- D-K4: a sequence value is used once per POS
    UNIQUE (company_id, ebarimt_pos_id, bill_date, bill_id_suffix),      -- PosAPI: billIdSuffix unique per POS per day
    CHECK ((operation = 'SAVE') = (bill_seq IS NOT NULL AND bill_date IS NOT NULL AND bill_id_suffix IS NOT NULL)),
    CHECK (bill_seq IS NULL OR bill_id_suffix = bill_seq % 1000000),
    CHECK (operation NOT IN ('DELETE','MANUAL_VOID') OR (replaces_document_id IS NOT NULL AND inactive_ddtd IS NOT NULL)),
    CHECK (operation <> 'DELETE' OR ebarimt_type = 'B2C_RECEIPT'),          -- D-J4: DELETE only for a full B2C return (B2B: MANUAL_VOID until ITC allows DELETE)
    CHECK (operation <> 'MANUAL_VOID' OR attempt_count = 0),                 -- recorded only, never sent
    CHECK (operation <> 'SAVE' OR (branch_no IS NOT NULL AND pos_no IS NOT NULL AND district_code IS NOT NULL)),
    CHECK (status <> 'SUCCESS' OR ddtd IS NOT NULL OR operation IN ('DELETE','MANUAL_VOID')),
    CHECK (ebarimt_type NOT IN ('B2B_RECEIPT','B2B_INVOICE') OR customer_tin IS NOT NULL),
    CHECK (consumer_no IS NULL OR ebarimt_type = 'B2C_RECEIPT'),
    CHECK (attempt_count <= max_attempts OR status IN ('ERROR','UNKNOWN','CANCELLED'))
);
-- INV: one live (not cancelled) eBarimt document per posted source document and operation.
CREATE UNIQUE INDEX ux_ebarimt_document__one_open_per_source ON ebarimt.ebarimt_document (company_id, source_type, source_id, operation)
    WHERE status <> 'CANCELLED';
CREATE UNIQUE INDEX ux_ebarimt_document__ddtd ON ebarimt.ebarimt_document (ddtd) WHERE ddtd IS NOT NULL AND operation = 'SAVE';
CREATE INDEX ix_ebarimt_document__status ON ebarimt.ebarimt_document (company_id, status, created_at) WHERE status IN ('PENDING','SENT','ERROR','UNKNOWN');
CREATE INDEX ix_ebarimt_document__source ON ebarimt.ebarimt_document (company_id, source_document_no);
CREATE INDEX ix_ebarimt_document__replaces ON ebarimt.ebarimt_document (company_id, replaces_document_id) WHERE replaces_document_id IS NOT NULL;
CREATE INDEX ix_ebarimt_document__resent_from ON ebarimt.ebarimt_document (company_id, resent_from_document_id) WHERE resent_from_document_id IS NOT NULL;
CREATE INDEX ix_ebarimt_document__instance ON ebarimt.ebarimt_document (posapi_instance_id, status) WHERE posapi_instance_id IS NOT NULL;
CREATE INDEX ix_ebarimt_document__keyset ON ebarimt.ebarimt_document (company_id, created_at, id);   -- CR #73
CREATE INDEX ix_ebarimt_document__source_id ON ebarimt.ebarimt_document (company_id, source_type, source_id, created_at);
COMMENT ON TABLE ebarimt.ebarimt_document IS 'One eBarimt receipt request per posted sales invoice / credit memo (D-J1, D-J4). Status machine PENDING->SENT->SUCCESS|ERROR|UNKNOWN, CANCELLED (transition whitelist in 910). Request data incl. the branch/POS/district/instance snapshot is immutable. No qrData / lottery columns by design (D-J3).';

-- CR #1/#19: payments[] of the request as sent (append-only, 910). data never holds qrData / lottery.
CREATE TABLE ebarimt.ebarimt_document_payment (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    ebarimt_document_id  uuid NOT NULL,
    line_no              integer NOT NULL,
    code                 text NOT NULL CHECK (code IN ('CASH','PAYMENT_CARD','BANK_TRANSFER','BANK_TRANSFER_QPAY')),
    status               text NOT NULL CHECK (status IN ('PAID','PAY','REVERSED','ERROR')),
    paid_amount          platform.amount NOT NULL,
    exchange_code        text,
    data                 jsonb CHECK (data IS NULL OR NOT integration.fn_has_forbidden_ebarimt_keys(data)),
    created_at           timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, ebarimt_document_id) REFERENCES ebarimt.ebarimt_document (company_id, id),
    UNIQUE (company_id, ebarimt_document_id, line_no)
);
COMMENT ON TABLE ebarimt.ebarimt_document_payment IS 'payments[] of an eBarimt request as sent (code, status, amount), CR #1. Immutable; part of the reproducible request (request_sha256).';

-- Status history (02-architecture 11.6 "receipt_event", 10 years): every transition and every manual
-- UNKNOWN/ERROR decision (D-J2). Written by trigger on ebarimt_document; append-only (910).
CREATE TABLE ebarimt.ebarimt_document_event (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    ebarimt_document_id  uuid NOT NULL,
    from_status          text CHECK (from_status IN ('PENDING','SENT','SUCCESS','ERROR','UNKNOWN','CANCELLED')),
    to_status            text NOT NULL CHECK (to_status IN ('PENDING','SENT','SUCCESS','ERROR','UNKNOWN','CANCELLED')),
    attempt_count        integer,
    error_code           text,
    note                 text,                          -- resolution_note of a manual decision
    request_id           text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, ebarimt_document_id) REFERENCES ebarimt.ebarimt_document (company_id, id)
);
CREATE INDEX ix_ebarimt_document_event__document ON ebarimt.ebarimt_document_event (company_id, ebarimt_document_id, created_at);
COMMENT ON TABLE ebarimt.ebarimt_document_event IS 'Append-only status history of eBarimt documents (02-architecture receipt_event): transitions and manual UNKNOWN/ERROR resolutions (D-J2). Never contains qrData/lottery.';

CREATE FUNCTION ebarimt.fn_ebarimt_document_log_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO ebarimt.ebarimt_document_event (tenant_id, company_id, ebarimt_document_id, from_status, to_status,
                                                    attempt_count, error_code, note, request_id)
        VALUES (NEW.tenant_id, NEW.company_id, NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
                NEW.attempt_count, NEW.error_code, NEW.resolution_note, nullif(current_setting('app.request_id', true), ''));
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_ebarimt_document_log_status AFTER INSERT OR UPDATE OF status ON ebarimt.ebarimt_document
    FOR EACH ROW EXECUTE FUNCTION ebarimt.fn_ebarimt_document_log_status();

CREATE TABLE ebarimt.ebarimt_sub_receipt (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    ebarimt_document_id   uuid NOT NULL,
    tax_type              platform.ebarimt_tax_type NOT NULL,
    merchant_tin          platform.tin NOT NULL,
    sub_receipt_id        text,                       -- receipts[].id from the response
    total_amount          platform.amount NOT NULL,
    total_vat             platform.amount NOT NULL DEFAULT 0,
    total_city_tax        platform.amount NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, ebarimt_document_id) REFERENCES ebarimt.ebarimt_document (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, ebarimt_document_id, tax_type, merchant_tin),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE ebarimt.ebarimt_sub_receipt IS 'receipts[] of the PosAPI request: one sub-receipt per taxType (x merchantTin).';

CREATE TABLE ebarimt.ebarimt_document_line (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    ebarimt_document_id   uuid NOT NULL,
    ebarimt_sub_receipt_id uuid,
    line_no               integer NOT NULL,
    source_line_no        integer,
    name                  text NOT NULL,
    bar_code              text,
    bar_code_type         text NOT NULL DEFAULT 'UNDEFINED' CHECK (bar_code_type IN ('GS1','ISBN','UNDEFINED')),
    classification_code   char(7) NOT NULL CHECK (classification_code ~ '^[0-9]{7}$'),
    tax_product_code      text,
    tax_type              platform.ebarimt_tax_type NOT NULL,
    measure_unit          text,
    qty                   platform.quantity NOT NULL,
    unit_price            platform.unit_amount NOT NULL,       -- VAT included
    total_amount          platform.amount NOT NULL,
    total_vat             platform.amount NOT NULL DEFAULT 0,
    total_city_tax        platform.amount NOT NULL DEFAULT 0,
    line_sha256           bytea CHECK (octet_length(line_sha256) = 32),   -- hash of the item JSON as sent
    created_at            timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, ebarimt_document_id) REFERENCES ebarimt.ebarimt_document (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, ebarimt_sub_receipt_id) REFERENCES ebarimt.ebarimt_sub_receipt (company_id, id),
    UNIQUE (company_id, ebarimt_document_id, line_no),
    CHECK (tax_type = 'VAT_ABLE' OR (total_vat = 0 AND tax_product_code IS NOT NULL))
);
CREATE INDEX ix_ebarimt_document_line__sub ON ebarimt.ebarimt_document_line (company_id, ebarimt_sub_receipt_id);
COMMENT ON TABLE ebarimt.ebarimt_document_line IS 'items[] actually sent (fields needed for audit/reconciliation + per-line JSON hash). Sum rules: lines = sub-receipt = document.';

-- Supplier receipts (purchase side, D-E4) ---------------------------------------------------
CREATE TABLE ebarimt.purchase_receipt (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    ddtd                  platform.ddtd NOT NULL,
    supplier_tin          platform.tin NOT NULL,
    supplier_name         text,
    vendor_id             uuid,
    receipt_date          timestamptz NOT NULL,
    ebarimt_type          text CHECK (ebarimt_type IN ('B2B_RECEIPT','B2B_INVOICE','B2C_RECEIPT','B2C_INVOICE')),
    total_amount          platform.amount NOT NULL,
    total_vat             platform.amount NOT NULL DEFAULT 0,
    total_city_tax        platform.amount NOT NULL DEFAULT 0,
    source                text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','IMPORT_API','IMPORT_FILE','QR_SCAN')),
    status                text NOT NULL DEFAULT 'IMPORTED' CHECK (status IN ('IMPORTED','MATCHED','CONFIRMED','REJECTED','RETURNED')),
    purch_inv_header_id   uuid,
    purch_cr_memo_header_id uuid,                     -- CR #147 (BR-PUR-43): supplier's return / correction receipt
    vat_entry_no          bigint,
    confirmed_at          timestamptz,
    confirmed_by          uuid,
    rejection_reason      text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    updated_at            timestamptz,
    updated_by            uuid,
    row_version           integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id),
    FOREIGN KEY (company_id, purch_inv_header_id) REFERENCES purchase.purch_inv_header (company_id, id),
    FOREIGN KEY (company_id, purch_cr_memo_header_id) REFERENCES purchase.purch_cr_memo_header (company_id, id),
    FOREIGN KEY (company_id, vat_entry_no) REFERENCES tax.vat_entry (company_id, entry_no),
    UNIQUE (company_id, ddtd),
    UNIQUE (company_id, id),
    CHECK (purch_inv_header_id IS NULL OR purch_cr_memo_header_id IS NULL),
    CHECK (status <> 'CONFIRMED' OR (confirmed_at IS NOT NULL AND (purch_inv_header_id IS NOT NULL OR purch_cr_memo_header_id IS NOT NULL)))
);
CREATE INDEX ix_purchase_receipt__vendor ON ebarimt.purchase_receipt (company_id, vendor_id);
CREATE INDEX ix_purchase_receipt__status ON ebarimt.purchase_receipt (company_id, status, receipt_date);
CREATE INDEX ix_purchase_receipt__invoice ON ebarimt.purchase_receipt (company_id, purch_inv_header_id);
CREATE INDEX ix_purchase_receipt__cr_memo ON ebarimt.purchase_receipt (company_id, purch_cr_memo_header_id) WHERE purch_cr_memo_header_id IS NOT NULL;
CREATE INDEX ix_purchase_receipt__vat_entry ON ebarimt.purchase_receipt (company_id, vat_entry_no);
COMMENT ON TABLE ebarimt.purchase_receipt IS 'Supplier eBarimt receipts (ДДТД) imported or keyed in, matched to posted purchase invoices; confirmation makes input VAT deductible (D-E4).';

ALTER TABLE purchase.purchase_header
    ADD FOREIGN KEY (company_id, purchase_receipt_id) REFERENCES ebarimt.purchase_receipt (company_id, id);
-- CR #15: POS of a sales draft
ALTER TABLE sales.sales_header
    ADD FOREIGN KEY (company_id, ebarimt_pos_id) REFERENCES ebarimt.ebarimt_pos (company_id, id);
CREATE INDEX ix_sales_header__ebarimt_pos ON sales.sales_header (company_id, ebarimt_pos_id);

-- CR #7/#25 (TOP-03/07/08): merchant load per instance for PickInstance (wizard, app_user) and monitoring
-- (worker). SECURITY DEFINER owned by app_rls_bypass: counts ebarimt_setup rows of every tenant; returns aggregates only.
CREATE FUNCTION ebarimt.fn_instance_merchant_counts()
RETURNS TABLE (posapi_instance_id uuid, merchants bigint, weighted_load numeric, expected_receipts bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    SELECT i.id, count(s.id), greatest(count(s.id)::numeric / i.merchant_soft_limit,
                                       coalesce(sum(s.expected_daily_receipts), 0)::numeric / i.receipts_per_day_soft_limit),
           coalesce(sum(s.expected_daily_receipts), 0)::bigint
      FROM ebarimt.posapi_instance i
      LEFT JOIN ebarimt.ebarimt_setup s ON s.posapi_instance_id = i.id
     GROUP BY i.id, i.merchant_soft_limit, i.receipts_per_day_soft_limit
$$;
COMMENT ON FUNCTION ebarimt.fn_instance_merchant_counts() IS 'Merchants, expected daily receipts and weighted load (max of merchant / receipt ratio to the soft limits) per PosAPI instance across all tenants. Aggregates only, no tenant ids. Owned by app_rls_bypass.';
GRANT SELECT ON ebarimt.posapi_instance, ebarimt.ebarimt_setup TO app_rls_bypass;
ALTER FUNCTION ebarimt.fn_instance_merchant_counts() OWNER TO app_rls_bypass;
REVOKE ALL ON FUNCTION ebarimt.fn_instance_merchant_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ebarimt.fn_instance_merchant_counts() TO app_user;
