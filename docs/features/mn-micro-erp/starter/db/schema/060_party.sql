-- =============================================================================
-- 060_party.sql
-- Payment terms/methods, posting groups (account determination, D-F1), customers,
-- vendors and their templates (BC tables 3, 289, 92, 93, 250, 251, 252, 18, 23, 1381, 1383),
-- and the receivables/payables subledgers (BC 21, 379, 25, 380), which DECISIONS D-K2 places
-- in the party schema (sales/purchase own only their documents).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE TABLE party.payment_terms (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    code                      platform.code20 NOT NULL,
    description               text NOT NULL,
    description_en            text,
    due_date_calculation      platform.date_formula NOT NULL DEFAULT '0D',   -- e.g. 30D, CM+1M (from document date)
    discount_date_calculation platform.date_formula,                       -- R2+ (payment discount)
    discount_percent          platform.percent NOT NULL DEFAULT 0,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE party.payment_terms IS 'Mirrors BC table 3 Payment Terms (due-date formula; discount part reserved for R2+).';

CREATE TABLE party.payment_method (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    code                  platform.code20 NOT NULL,             -- CASH, CARD, TRANSFER, QPAY
    description           text NOT NULL,
    description_en        text,
    bal_account_type      platform.account_type,                -- GL_ACCOUNT or BANK_ACCOUNT (D-F5 cash sale)
    bal_account_id        uuid,
    ebarimt_payment_code  text NOT NULL DEFAULT 'CASH'
                          CHECK (ebarimt_payment_code IN ('CASH','PAYMENT_CARD','BANK_TRANSFER','BANK_TRANSFER_QPAY')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    updated_at            timestamptz,
    updated_by            uuid,
    row_version           integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (bal_account_type IS NULL OR bal_account_type IN ('GL_ACCOUNT','BANK_ACCOUNT'))
);
COMMENT ON TABLE party.payment_method IS 'Mirrors BC table 289 Payment Method (balancing account for immediate payment) plus eBarimt payments[].code.';

CREATE TABLE party.customer_posting_group (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    code                        platform.code20 NOT NULL,
    description                 text,
    receivables_account_id      uuid NOT NULL,
    invoice_rounding_account_id uuid,
    appln_rounding_account_id   uuid,
    payment_disc_debit_acc_id   uuid,                 -- R2+
    payment_disc_credit_acc_id  uuid,                 -- R2+
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, receivables_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, invoice_rounding_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, appln_rounding_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, payment_disc_debit_acc_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, payment_disc_credit_acc_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_customer_posting_group__recv ON party.customer_posting_group (company_id, receivables_account_id);
CREATE INDEX ix_customer_posting_group__inv_rnd ON party.customer_posting_group (company_id, invoice_rounding_account_id);
CREATE INDEX ix_customer_posting_group__appl_rnd ON party.customer_posting_group (company_id, appln_rounding_account_id);
CREATE INDEX ix_customer_posting_group__pd_debit ON party.customer_posting_group (company_id, payment_disc_debit_acc_id);
CREATE INDEX ix_customer_posting_group__pd_credit ON party.customer_posting_group (company_id, payment_disc_credit_acc_id);
COMMENT ON TABLE party.customer_posting_group IS 'Mirrors BC table 92 Customer Posting Group (receivables account per group).';

CREATE TABLE party.vendor_posting_group (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    code                        platform.code20 NOT NULL,
    description                 text,
    payables_account_id         uuid NOT NULL,
    invoice_rounding_account_id uuid,
    appln_rounding_account_id   uuid,
    payment_disc_debit_acc_id   uuid,
    payment_disc_credit_acc_id  uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, payables_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, invoice_rounding_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, appln_rounding_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, payment_disc_debit_acc_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, payment_disc_credit_acc_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_vendor_posting_group__pay ON party.vendor_posting_group (company_id, payables_account_id);
CREATE INDEX ix_vendor_posting_group__inv_rnd ON party.vendor_posting_group (company_id, invoice_rounding_account_id);
CREATE INDEX ix_vendor_posting_group__appl_rnd ON party.vendor_posting_group (company_id, appln_rounding_account_id);
CREATE INDEX ix_vendor_posting_group__pd_debit ON party.vendor_posting_group (company_id, payment_disc_debit_acc_id);
CREATE INDEX ix_vendor_posting_group__pd_credit ON party.vendor_posting_group (company_id, payment_disc_credit_acc_id);
COMMENT ON TABLE party.vendor_posting_group IS 'Mirrors BC table 93 Vendor Posting Group (payables account per group).';

CREATE TABLE party.gen_bus_posting_group (
    id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                        uuid NOT NULL,
    company_id                       uuid NOT NULL,
    code                             platform.code20 NOT NULL,     -- DOMESTIC, FOREIGN
    description                      text,
    default_vat_bus_posting_group_id uuid,
    auto_insert_default              boolean NOT NULL DEFAULT true,
    created_at                       timestamptz NOT NULL DEFAULT now(),
    created_by                       uuid DEFAULT platform.current_user_id(),
    updated_at                       timestamptz,
    updated_by                       uuid,
    row_version                      integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, default_vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_gen_bus_posting_group__vat ON party.gen_bus_posting_group (company_id, default_vat_bus_posting_group_id);
COMMENT ON TABLE party.gen_bus_posting_group IS 'Mirrors BC table 250 Gen. Business Posting Group.';

CREATE TABLE party.gen_prod_posting_group (
    id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                         uuid NOT NULL,
    company_id                        uuid NOT NULL,
    code                              platform.code20 NOT NULL,    -- GOODS, SERVICES, RENT
    description                       text,
    default_vat_prod_posting_group_id uuid,
    auto_insert_default               boolean NOT NULL DEFAULT true,
    exclude_from_vat_turnover         boolean NOT NULL DEFAULT false,   -- CR #167/#178 (BR-TAX-83): e.g. FA disposals do not count to the VAT threshold
    created_at                        timestamptz NOT NULL DEFAULT now(),
    created_by                        uuid DEFAULT platform.current_user_id(),
    updated_at                        timestamptz,
    updated_by                        uuid,
    row_version                       integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, default_vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_gen_prod_posting_group__vat ON party.gen_prod_posting_group (company_id, default_vat_prod_posting_group_id);
COMMENT ON TABLE party.gen_prod_posting_group IS 'Mirrors BC table 251 Gen. Product Posting Group.';

CREATE TABLE party.general_posting_setup (
    id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                      uuid NOT NULL,
    company_id                     uuid NOT NULL,
    gen_bus_posting_group_id       uuid,          -- NULL = '*' fallback row for any business group (D-F1)
    gen_prod_posting_group_id      uuid NOT NULL,
    sales_account_id               uuid,
    sales_line_disc_account_id     uuid,
    sales_inv_disc_account_id      uuid,
    sales_credit_memo_account_id   uuid,
    purch_account_id               uuid,
    purch_line_disc_account_id     uuid,
    purch_inv_disc_account_id      uuid,
    purch_credit_memo_account_id   uuid,
    cogs_account_id                uuid,
    inventory_adjmt_account_id     uuid,
    direct_cost_applied_account_id uuid,
    blocked                        boolean NOT NULL DEFAULT false,
    created_at                     timestamptz NOT NULL DEFAULT now(),
    created_by                     uuid DEFAULT platform.current_user_id(),
    updated_at                     timestamptz,
    updated_by                     uuid,
    row_version                    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_prod_posting_group_id) REFERENCES party.gen_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, sales_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, sales_line_disc_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, sales_inv_disc_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, sales_credit_memo_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, purch_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, purch_line_disc_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, purch_inv_disc_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, purch_credit_memo_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, cogs_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, inventory_adjmt_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, direct_cost_applied_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE NULLS NOT DISTINCT (company_id, gen_bus_posting_group_id, gen_prod_posting_group_id),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_general_posting_setup__prod ON party.general_posting_setup (company_id, gen_prod_posting_group_id);
CREATE INDEX ix_general_posting_setup__sales ON party.general_posting_setup (company_id, sales_account_id);
CREATE INDEX ix_general_posting_setup__sales_ld ON party.general_posting_setup (company_id, sales_line_disc_account_id);
CREATE INDEX ix_general_posting_setup__sales_id ON party.general_posting_setup (company_id, sales_inv_disc_account_id);
CREATE INDEX ix_general_posting_setup__sales_cm ON party.general_posting_setup (company_id, sales_credit_memo_account_id);
CREATE INDEX ix_general_posting_setup__purch ON party.general_posting_setup (company_id, purch_account_id);
CREATE INDEX ix_general_posting_setup__purch_ld ON party.general_posting_setup (company_id, purch_line_disc_account_id);
CREATE INDEX ix_general_posting_setup__purch_id ON party.general_posting_setup (company_id, purch_inv_disc_account_id);
CREATE INDEX ix_general_posting_setup__purch_cm ON party.general_posting_setup (company_id, purch_credit_memo_account_id);
CREATE INDEX ix_general_posting_setup__cogs ON party.general_posting_setup (company_id, cogs_account_id);
CREATE INDEX ix_general_posting_setup__inv_adj ON party.general_posting_setup (company_id, inventory_adjmt_account_id);
CREATE INDEX ix_general_posting_setup__dca ON party.general_posting_setup (company_id, direct_cost_applied_account_id);
COMMENT ON TABLE party.general_posting_setup IS 'Mirrors BC table 252 General Posting Setup (Gen. Bus. x Gen. Prod. -> revenue/purchase/COGS accounts). gen_bus_posting_group_id NULL = "*" fallback row; an exact row wins.';

-- -----------------------------------------------------------------------------
-- Customers and vendors
-- -----------------------------------------------------------------------------
CREATE TABLE party.customer (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    no                        platform.code20 NOT NULL,
    name                      text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    name_en                   text,
    search_name               text,
    kind                      text NOT NULL DEFAULT 'LEGAL' CHECK (kind IN ('LEGAL','INDIVIDUAL','FOREIGN')),
    tin                       platform.tin,                 -- ТТД of a legal entity (B2B receipt customerTin)
    registration_no           text CHECK (char_length(registration_no) <= 20),
    foreign_tax_id            text,
    vat_registered            boolean NOT NULL DEFAULT false,
    city_tax_payer            boolean NOT NULL DEFAULT false,
    ebarimt_consumer_no       text CHECK (ebarimt_consumer_no ~ '^[0-9]{8}$'),   -- citizen e-barimt number (B2C)
    default_ebarimt_type      text NOT NULL DEFAULT 'AUTO' CHECK (default_ebarimt_type IN ('AUTO','B2B','B2C','NONE')),
    -- CR #44 (ADR-0023 D, FR-PTY-004, NFR-033): an individual's civil registration no. / personal TIN only encrypted
    personal_id_enc           bytea,                                             -- AES-GCM with tenant_key PII_ENC
    personal_id_hmac          bytea CHECK (octet_length(personal_id_hmac) = 32),   -- HMAC (tenant_key PII_HMAC) for exact search
    personal_id_hint          text CHECK (char_length(personal_id_hint) <= 12),     -- masked display, e.g. ••12345678
    personal_tin_enc          bytea,
    personal_tin_hmac         bytea CHECK (octet_length(personal_tin_hmac) = 32),
    personal_tin_hint         text CHECK (char_length(personal_tin_hint) <= 12),
    address                   text,
    city                      text,
    country_code              text NOT NULL DEFAULT 'MN' CHECK (country_code ~ '^[A-Z]{2}$'),
    phone                     text,
    email                     text,
    customer_posting_group_id uuid NOT NULL,
    gen_bus_posting_group_id  uuid NOT NULL,
    vat_bus_posting_group_id  uuid NOT NULL,
    payment_terms_id          uuid,
    payment_method_id         uuid,
    currency_code             platform.currency_code,       -- NULL = LCY
    prices_including_vat      boolean NOT NULL DEFAULT false,
    credit_limit_lcy          platform.amount NOT NULL DEFAULT 0 CHECK (credit_limit_lcy >= 0),
    application_method        text NOT NULL DEFAULT 'MANUAL' CHECK (application_method IN ('MANUAL','APPLY_TO_OLDEST')),
    blocked                   text NOT NULL DEFAULT 'NONE' CHECK (blocked IN ('NONE','INVOICE','ALL')),
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customer_posting_group_id) REFERENCES party.customer_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, payment_terms_id) REFERENCES party.payment_terms (company_id, id),
    FOREIGN KEY (company_id, payment_method_id) REFERENCES party.payment_method (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK (kind <> 'LEGAL' OR country_code <> 'MN' OR tin IS NOT NULL OR registration_no IS NOT NULL OR NOT vat_registered),
    CHECK (kind <> 'INDIVIDUAL' OR (registration_no IS NULL AND tin IS NULL)),          -- CR #44: plaintext only for legal entities
    CHECK ((personal_id_enc IS NULL) = (personal_id_hmac IS NULL)),
    CHECK ((personal_tin_enc IS NULL) = (personal_tin_hmac IS NULL))
);
CREATE INDEX ix_customer__name ON party.customer (company_id, search_name);
CREATE INDEX ix_customer__search_trgm ON party.customer USING gin (company_id, search_name gin_trgm_ops);   -- CR #82
CREATE INDEX ix_customer__personal_id ON party.customer (company_id, personal_id_hmac) WHERE personal_id_hmac IS NOT NULL;
CREATE INDEX ix_customer__personal_tin ON party.customer (company_id, personal_tin_hmac) WHERE personal_tin_hmac IS NOT NULL;
COMMENT ON COLUMN party.customer.search_name IS 'Search key: lower-case Cyrillic<->Latin transliteration skeleton of no + name (UX-FMT-14), maintained by the application; trigram-indexed.';
CREATE INDEX ix_customer__tin ON party.customer (company_id, tin) WHERE tin IS NOT NULL;
CREATE INDEX ix_customer__posting_group ON party.customer (company_id, customer_posting_group_id);
CREATE INDEX ix_customer__gen_bus ON party.customer (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_customer__vat_bus ON party.customer (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_customer__terms ON party.customer (company_id, payment_terms_id);
CREATE INDEX ix_customer__method ON party.customer (company_id, payment_method_id);
CREATE INDEX ix_customer__currency ON party.customer (company_id, currency_code) WHERE currency_code IS NOT NULL;
COMMENT ON TABLE party.customer IS 'Mirrors BC table 18 Customer (sell-to = bill-to, D-A5). Balances come from detailed_cust_ledger_entry, not FlowFields.';

CREATE TABLE party.vendor (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    no                        platform.code20 NOT NULL,
    name                      text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    name_en                   text,
    search_name               text,
    kind                      text NOT NULL DEFAULT 'LEGAL' CHECK (kind IN ('LEGAL','INDIVIDUAL','FOREIGN')),
    tin                       platform.tin,
    registration_no           text CHECK (char_length(registration_no) <= 20),
    foreign_tax_id            text,
    vat_registered            boolean NOT NULL DEFAULT false,
    ebarimt_merchant_tin      platform.tin,                -- seller TIN on the supplier's eBarimt receipts
    personal_id_enc           bytea,                       -- CR #44: individuals only, encrypted (see party.customer)
    personal_id_hmac          bytea CHECK (octet_length(personal_id_hmac) = 32),
    personal_id_hint          text CHECK (char_length(personal_id_hint) <= 12),
    personal_tin_enc          bytea,
    personal_tin_hmac         bytea CHECK (octet_length(personal_tin_hmac) = 32),
    personal_tin_hint         text CHECK (char_length(personal_tin_hint) <= 12),
    address                   text,
    city                      text,
    country_code              text NOT NULL DEFAULT 'MN' CHECK (country_code ~ '^[A-Z]{2}$'),
    phone                     text,
    email                     text,
    vendor_posting_group_id   uuid NOT NULL,
    gen_bus_posting_group_id  uuid NOT NULL,
    vat_bus_posting_group_id  uuid NOT NULL,
    payment_terms_id          uuid,
    payment_method_id         uuid,
    currency_code             platform.currency_code,
    prices_including_vat      boolean NOT NULL DEFAULT false,
    application_method        text NOT NULL DEFAULT 'MANUAL' CHECK (application_method IN ('MANUAL','APPLY_TO_OLDEST')),
    blocked                   text NOT NULL DEFAULT 'NONE' CHECK (blocked IN ('NONE','PAYMENT','ALL')),
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_posting_group_id) REFERENCES party.vendor_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, payment_terms_id) REFERENCES party.payment_terms (company_id, id),
    FOREIGN KEY (company_id, payment_method_id) REFERENCES party.payment_method (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK (kind <> 'INDIVIDUAL' OR (registration_no IS NULL AND tin IS NULL AND ebarimt_merchant_tin IS NULL)),   -- CR #44
    CHECK ((personal_id_enc IS NULL) = (personal_id_hmac IS NULL)),
    CHECK ((personal_tin_enc IS NULL) = (personal_tin_hmac IS NULL))
);
CREATE INDEX ix_vendor__name ON party.vendor (company_id, search_name);
CREATE INDEX ix_vendor__search_trgm ON party.vendor USING gin (company_id, search_name gin_trgm_ops);   -- CR #82
CREATE INDEX ix_vendor__personal_id ON party.vendor (company_id, personal_id_hmac) WHERE personal_id_hmac IS NOT NULL;
CREATE INDEX ix_vendor__personal_tin ON party.vendor (company_id, personal_tin_hmac) WHERE personal_tin_hmac IS NOT NULL;
COMMENT ON COLUMN party.vendor.search_name IS 'Search key: lower-case Cyrillic<->Latin transliteration skeleton of no + name (UX-FMT-14), maintained by the application; trigram-indexed.';
CREATE INDEX ix_vendor__tin ON party.vendor (company_id, tin) WHERE tin IS NOT NULL;
CREATE INDEX ix_vendor__posting_group ON party.vendor (company_id, vendor_posting_group_id);
CREATE INDEX ix_vendor__gen_bus ON party.vendor (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_vendor__vat_bus ON party.vendor (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_vendor__terms ON party.vendor (company_id, payment_terms_id);
CREATE INDEX ix_vendor__method ON party.vendor (company_id, payment_method_id);
CREATE INDEX ix_vendor__currency ON party.vendor (company_id, currency_code) WHERE currency_code IS NOT NULL;
COMMENT ON TABLE party.vendor IS 'Mirrors BC table 23 Vendor (buy-from = pay-to).';

CREATE TABLE party.vendor_bank_account (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    vendor_id      uuid NOT NULL,
    code           platform.code20 NOT NULL,
    bank_name      text NOT NULL,
    bank_code      text,
    account_no     text NOT NULL,
    iban           text,
    currency_code  platform.currency_code,
    is_default     boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    updated_at     timestamptz,
    updated_by     uuid,
    row_version    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    UNIQUE (company_id, vendor_id, code),
    UNIQUE (company_id, id)                                   -- target of gl.journal_line.recipient_bank_account_id (CR #148)
);
CREATE INDEX ix_vendor_bank_account__currency ON party.vendor_bank_account (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE UNIQUE INDEX ux_vendor_bank_account__default ON party.vendor_bank_account (company_id, vendor_id) WHERE is_default;
COMMENT ON TABLE party.vendor_bank_account IS 'Mirrors BC table 288 Vendor Bank Account (payee account for payments / bulk payment files).';

CREATE TABLE party.customer_template (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    code                      platform.code20 NOT NULL,
    description               text NOT NULL,
    kind                      text NOT NULL DEFAULT 'LEGAL' CHECK (kind IN ('LEGAL','INDIVIDUAL','FOREIGN')),
    customer_posting_group_id uuid,
    gen_bus_posting_group_id  uuid,
    vat_bus_posting_group_id  uuid,
    payment_terms_id          uuid,
    payment_method_id         uuid,
    currency_code             platform.currency_code,
    prices_including_vat      boolean NOT NULL DEFAULT false,
    no_series_id              uuid,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customer_posting_group_id) REFERENCES party.customer_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, payment_terms_id) REFERENCES party.payment_terms (company_id, id),
    FOREIGN KEY (company_id, payment_method_id) REFERENCES party.payment_method (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, no_series_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id, code)
);
CREATE INDEX ix_customer_template__cpg ON party.customer_template (company_id, customer_posting_group_id);
CREATE INDEX ix_customer_template__gbpg ON party.customer_template (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_customer_template__vbpg ON party.customer_template (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_customer_template__terms ON party.customer_template (company_id, payment_terms_id);
CREATE INDEX ix_customer_template__method ON party.customer_template (company_id, payment_method_id);
CREATE INDEX ix_customer_template__currency ON party.customer_template (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_customer_template__no_series ON party.customer_template (company_id, no_series_id);
COMMENT ON TABLE party.customer_template IS 'Mirrors BC table 1381 Customer Templ. (defaults for new customers: B2C individual, B2B legal entity, foreign).';

CREATE TABLE party.vendor_template (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    code                      platform.code20 NOT NULL,
    description               text NOT NULL,
    kind                      text NOT NULL DEFAULT 'LEGAL' CHECK (kind IN ('LEGAL','INDIVIDUAL','FOREIGN')),
    vendor_posting_group_id   uuid,
    gen_bus_posting_group_id  uuid,
    vat_bus_posting_group_id  uuid,
    payment_terms_id          uuid,
    payment_method_id         uuid,
    currency_code             platform.currency_code,
    prices_including_vat      boolean NOT NULL DEFAULT false,
    no_series_id              uuid,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_posting_group_id) REFERENCES party.vendor_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, payment_terms_id) REFERENCES party.payment_terms (company_id, id),
    FOREIGN KEY (company_id, payment_method_id) REFERENCES party.payment_method (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, no_series_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id, code)
);
CREATE INDEX ix_vendor_template__vpg ON party.vendor_template (company_id, vendor_posting_group_id);
CREATE INDEX ix_vendor_template__gbpg ON party.vendor_template (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_vendor_template__vbpg ON party.vendor_template (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_vendor_template__terms ON party.vendor_template (company_id, payment_terms_id);
CREATE INDEX ix_vendor_template__method ON party.vendor_template (company_id, payment_method_id);
CREATE INDEX ix_vendor_template__currency ON party.vendor_template (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_vendor_template__no_series ON party.vendor_template (company_id, no_series_id);
COMMENT ON TABLE party.vendor_template IS 'Mirrors BC table 1383 Vendor Templ. (defaults for new vendors).';

-- Foreign keys from tables of 020
ALTER TABLE gl.gl_account
    ADD FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, gen_prod_posting_group_id) REFERENCES party.gen_prod_posting_group (company_id, id);
CREATE INDEX ix_gl_account__gen_bus ON gl.gl_account (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_gl_account__gen_prod ON gl.gl_account (company_id, gen_prod_posting_group_id);

ALTER TABLE gl.journal_line
    ADD FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, gen_prod_posting_group_id) REFERENCES party.gen_prod_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, payment_terms_id) REFERENCES party.payment_terms (company_id, id),
    ADD FOREIGN KEY (company_id, payment_method_id) REFERENCES party.payment_method (company_id, id);
CREATE INDEX ix_journal_line__gen_bus ON gl.journal_line (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_journal_line__gen_prod ON gl.journal_line (company_id, gen_prod_posting_group_id);
CREATE INDEX ix_journal_line__terms ON gl.journal_line (company_id, payment_terms_id);
CREATE INDEX ix_journal_line__method ON gl.journal_line (company_id, payment_method_id);
ALTER TABLE gl.journal_line
    ADD FOREIGN KEY (company_id, recipient_bank_account_id) REFERENCES party.vendor_bank_account (company_id, id);
CREATE INDEX ix_journal_line__recipient_bank ON gl.journal_line (company_id, recipient_bank_account_id) WHERE recipient_bank_account_id IS NOT NULL;
ALTER TABLE tax.customs_declaration
    ADD FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id);
CREATE INDEX ix_customs_declaration__vendor ON tax.customs_declaration (company_id, vendor_id);

ALTER TABLE gl.standard_journal_line
    ADD FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, gen_prod_posting_group_id) REFERENCES party.gen_prod_posting_group (company_id, id);
CREATE INDEX ix_standard_journal_line__gen_bus ON gl.standard_journal_line (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_standard_journal_line__gen_prod ON gl.standard_journal_line (company_id, gen_prod_posting_group_id);

-- =============================================================================
-- Receivables / payables subledgers (DECISIONS D-K2: owned by the party module, written only
-- by the posting engine's ILedgerWriter; sales/purchase own their documents only).
-- Append-only (guards in 910). BC tables 21, 379, 25, 380.
-- =============================================================================
CREATE TABLE party.cust_ledger_entry (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    entry_no                   bigint NOT NULL CHECK (entry_no > 0),
    customer_id                uuid NOT NULL,
    customer_no                platform.code20 NOT NULL,
    posting_date               date NOT NULL,
    document_date              date,
    due_date                   date NOT NULL,                        -- whitelisted (BC allows editing)
    document_type              platform.document_type NOT NULL,
    document_no                platform.document_no NOT NULL,
    external_document_no       platform.ext_document_no,
    description                text,
    currency_code              platform.currency_code,
    original_currency_factor   platform.exch_rate,
    adjusted_currency_factor   platform.exch_rate,                   -- whitelisted (FX revaluation, R2)
    original_exchange_rate     platform.exch_rate,                   -- CR #191: MNT per 1 FCY at posting
    adjusted_exchange_rate     platform.exch_rate,                   -- CR #191: whitelisted (FX revaluation, R2)
    amount                     platform.amount NOT NULL,             -- original amount (= INITIAL detailed entry)
    amount_lcy                 platform.amount NOT NULL,
    sales_lcy                  platform.amount NOT NULL DEFAULT 0,
    remaining_amount           platform.amount NOT NULL DEFAULT 0,   -- cache = sum(detailed.amount); trigger-maintained ONLY
    remaining_amount_lcy       platform.amount NOT NULL DEFAULT 0,   -- cache = sum(detailed.amount_lcy); trigger-maintained ONLY
    positive                   boolean NOT NULL,
    open                       boolean NOT NULL DEFAULT true,        -- trigger-maintained ONLY: remaining_amount <> 0
    closed_by_entry_no         bigint,
    closed_at_date             date,
    closed_by_amount           platform.amount,
    closed_by_amount_lcy       platform.amount,
    closed_by_currency_code    platform.currency_code,
    closed_by_currency_amount  platform.amount,
    applies_to_doc_type        platform.document_type,
    applies_to_doc_no          platform.document_no,
    applies_to_id              text CHECK (char_length(applies_to_id) <= 50),
    amount_to_apply            platform.amount NOT NULL DEFAULT 0,
    applying_entry             boolean NOT NULL DEFAULT false,       -- BC "Applying Entry" (staging flag of Apply Entries)
    on_hold                    text CHECK (char_length(on_hold) <= 3),
    customer_posting_group_id  uuid NOT NULL,
    payment_method_code        platform.code20,
    bal_account_type           platform.account_type,
    bal_account_id             uuid,
    transaction_no             bigint NOT NULL,                      -- a document posting always has a G/L transaction (BC R-08)
    gl_register_no             bigint NOT NULL,
    dimension_set_id           bigint NOT NULL DEFAULT 0,
    global_dim_1_value_id      uuid,                                 -- derived from dimension_set_id by trigger (910)
    global_dim_2_value_id      uuid,
    source_code                platform.code20 NOT NULL REFERENCES platform.source_code (code),
    reason_code_id             uuid,
    reversed                   boolean NOT NULL DEFAULT false,
    reversed_by_entry_no       bigint,
    reversed_entry_no          bigint,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customer_id) REFERENCES party.customer (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, customer_posting_group_id) REFERENCES party.customer_posting_group (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, closed_by_entry_no) REFERENCES party.cust_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, reversed_entry_no) REFERENCES party.cust_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_by_entry_no) REFERENCES party.cust_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, entry_no, customer_id),                      -- target of the detailed-entry party-consistency FK
    UNIQUE (company_id, id),
    CHECK (positive = (amount > 0) OR amount = 0),
    CHECK ((currency_code IS NULL) = (original_currency_factor IS NULL)),
    CHECK ((currency_code IS NULL) = (original_exchange_rate IS NULL)),
    CHECK (original_exchange_rate IS NULL OR abs(original_currency_factor * original_exchange_rate - 1) <= 0.000000000001),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    -- no over-application: remaining keeps the sign of the original amount and never exceeds it (BC CalcApplication)
    CHECK (remaining_amount = 0 OR (sign(remaining_amount) = sign(amount) AND abs(remaining_amount) <= abs(amount)))
);
CREATE INDEX ix_cust_ledger_entry__customer ON party.cust_ledger_entry (company_id, customer_id, posting_date);
CREATE INDEX ix_cust_ledger_entry__open ON party.cust_ledger_entry (company_id, customer_id, due_date) WHERE open;
CREATE INDEX ix_cust_ledger_entry__document ON party.cust_ledger_entry (company_id, document_no, document_type);
CREATE INDEX ix_cust_ledger_entry__currency ON party.cust_ledger_entry (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_cust_ledger_entry__posting_group ON party.cust_ledger_entry (company_id, customer_posting_group_id);
CREATE INDEX ix_cust_ledger_entry__transaction ON party.cust_ledger_entry (company_id, transaction_no);
CREATE INDEX ix_cust_ledger_entry__register ON party.cust_ledger_entry (company_id, gl_register_no);
CREATE INDEX ix_cust_ledger_entry__dimension_set ON party.cust_ledger_entry (company_id, dimension_set_id);
CREATE INDEX ix_cust_ledger_entry__reason ON party.cust_ledger_entry (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_cust_ledger_entry__closed_by ON party.cust_ledger_entry (company_id, closed_by_entry_no) WHERE closed_by_entry_no IS NOT NULL;
CREATE INDEX ix_cust_ledger_entry__reversed_entry ON party.cust_ledger_entry (company_id, reversed_entry_no) WHERE reversed_entry_no IS NOT NULL;
CREATE INDEX ix_cust_ledger_entry__reversed_by ON party.cust_ledger_entry (company_id, reversed_by_entry_no) WHERE reversed_by_entry_no IS NOT NULL;
CREATE INDEX ix_cust_ledger_entry__applies_to_id ON party.cust_ledger_entry (company_id, applies_to_id) WHERE applies_to_id IS NOT NULL;
-- CR #143 (BR-AR-09, R-SALES-DOCUMENTS-38): an invoice / credit memo number is used once in the receivables ledger,
-- whatever wrote it (documents, journals, imports). Opening balances share their OB voucher number; reversing
-- entries are inserted with reversed = true.
CREATE UNIQUE INDEX ux_cust_ledger_entry__doc_no ON party.cust_ledger_entry (company_id, document_type, document_no)
    WHERE document_type IN ('INVOICE','CREDIT_MEMO') AND source_code <> 'OPENING' AND NOT reversed;
COMMENT ON TABLE party.cust_ledger_entry IS 'Mirrors BC table 21 Cust. Ledger Entry (one row per posted customer document; party schema per D-K2). remaining_amount(_lcy)/open are a cache of the detailed entries maintained only by trigger (INV-04); no over-application (CHECK). Append-only except application/status columns.';

CREATE TABLE party.detailed_cust_ledger_entry (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL,
    company_id                      uuid NOT NULL,
    entry_no                        bigint NOT NULL CHECK (entry_no > 0),
    cust_ledger_entry_no            bigint NOT NULL,
    entry_type                      text NOT NULL CHECK (entry_type IN ('INITIAL','APPLICATION','UNREALIZED_LOSS','UNREALIZED_GAIN',
                                        'REALIZED_LOSS','REALIZED_GAIN','PAYMENT_DISCOUNT','CORRECTION_OF_REMAINING_AMOUNT',
                                        'APPL_ROUNDING')),
    posting_date                    date NOT NULL,
    document_type                   platform.document_type NOT NULL,      -- of the transaction that caused the row
    document_no                     platform.document_no NOT NULL,
    amount                          platform.amount NOT NULL,             -- in entry currency
    amount_lcy                      platform.amount NOT NULL,
    debit_amount                    numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount > 0 THEN amount ELSE 0 END) STORED,
    credit_amount                   numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount < 0 THEN -amount ELSE 0 END) STORED,
    debit_amount_lcy                numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount_lcy > 0 THEN amount_lcy ELSE 0 END) STORED,
    credit_amount_lcy               numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount_lcy < 0 THEN -amount_lcy ELSE 0 END) STORED,
    customer_id                     uuid NOT NULL,
    currency_code                   platform.currency_code,
    transaction_no                  bigint,                                -- NULL = BC "Transaction No. 0": application/unapply without G/L (R-08)
    application_no                  bigint,                                -- groups the rows of one application / unapply (monotonic per company)
    applied_cust_ledger_entry_no    bigint,
    unapplied                       boolean NOT NULL DEFAULT false,        -- whitelisted (unapply), never true -> false
    unapplied_by_entry_no           bigint,                                -- whitelisted (unapply)
    ledger_entry_amount             boolean NOT NULL DEFAULT false,        -- counts towards Amount (BC)
    initial_entry_due_date          date,
    initial_document_type           platform.document_type,
    initial_entry_global_dim_1_id   uuid,
    initial_entry_global_dim_2_id   uuid,
    customer_posting_group_id       uuid,
    exch_rate_adjmt_reg_no          bigint,
    source_code                     platform.code20 NOT NULL REFERENCES platform.source_code (code),
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    -- party consistency: a detailed row (and the entry it is applied to) belongs to the same customer
    FOREIGN KEY (company_id, cust_ledger_entry_no, customer_id) REFERENCES party.cust_ledger_entry (company_id, entry_no, customer_id),
    FOREIGN KEY (company_id, applied_cust_ledger_entry_no, customer_id) REFERENCES party.cust_ledger_entry (company_id, entry_no, customer_id),
    FOREIGN KEY (company_id, customer_id) REFERENCES party.customer (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, unapplied_by_entry_no) REFERENCES party.detailed_cust_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, customer_posting_group_id) REFERENCES party.customer_posting_group (company_id, id),
    FOREIGN KEY (company_id, exch_rate_adjmt_reg_no) REFERENCES fx.exch_rate_adjmt_register (company_id, no),
    UNIQUE (company_id, entry_no),
    CHECK (entry_type NOT IN ('APPLICATION','REALIZED_LOSS','REALIZED_GAIN','PAYMENT_DISCOUNT','CORRECTION_OF_REMAINING_AMOUNT',
                              'APPL_ROUNDING') OR application_no IS NOT NULL),
    CHECK (entry_type IN ('APPLICATION','APPL_ROUNDING','CORRECTION_OF_REMAINING_AMOUNT') OR transaction_no IS NOT NULL),
    CHECK (ledger_entry_amount = (entry_type = 'INITIAL') OR entry_type NOT IN ('INITIAL','APPLICATION')),
    CHECK (NOT unapplied OR unapplied_by_entry_no IS NOT NULL)
);
CREATE INDEX ix_detailed_cust_ledger_entry__cle ON party.detailed_cust_ledger_entry (company_id, cust_ledger_entry_no, customer_id, posting_date) INCLUDE (amount, amount_lcy, entry_type);
CREATE INDEX ix_detailed_cust_ledger_entry__customer ON party.detailed_cust_ledger_entry (company_id, customer_id, posting_date) INCLUDE (amount_lcy);
CREATE INDEX ix_detailed_cust_ledger_entry__applied ON party.detailed_cust_ledger_entry (company_id, applied_cust_ledger_entry_no, customer_id) WHERE applied_cust_ledger_entry_no IS NOT NULL;
CREATE INDEX ix_detailed_cust_ledger_entry__transaction ON party.detailed_cust_ledger_entry (company_id, transaction_no) WHERE transaction_no IS NOT NULL;
CREATE INDEX ix_detailed_cust_ledger_entry__application ON party.detailed_cust_ledger_entry (company_id, application_no) WHERE application_no IS NOT NULL;
CREATE INDEX ix_detailed_cust_ledger_entry__unapplied_by ON party.detailed_cust_ledger_entry (company_id, unapplied_by_entry_no) WHERE unapplied_by_entry_no IS NOT NULL;
CREATE INDEX ix_detailed_cust_ledger_entry__posting_group ON party.detailed_cust_ledger_entry (company_id, customer_posting_group_id);
CREATE INDEX ix_detailed_cust_ledger_entry__fx_reg ON party.detailed_cust_ledger_entry (company_id, exch_rate_adjmt_reg_no) WHERE exch_rate_adjmt_reg_no IS NOT NULL;
COMMENT ON TABLE party.detailed_cust_ledger_entry IS 'Mirrors BC table 379 Detailed Cust. Ledg. Entry (append-only money movements: initial, application, FX, corrections). Source of truth for balances and remaining amounts (D-F3). transaction_no NULL = application without G/L effect (BC Transaction No. 0); such rows are grouped by application_no.';
COMMENT ON COLUMN party.detailed_cust_ledger_entry.initial_entry_due_date IS 'Due date of the ledger entry at the time this row was posted (snapshot, never updated; CR #140). Aging uses the current party.cust_ledger_entry.due_date, which an authorized user may edit (party.fn_edit_ledger_entry).';

CREATE TABLE party.vendor_ledger_entry (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    entry_no                   bigint NOT NULL CHECK (entry_no > 0),
    vendor_id                  uuid NOT NULL,
    vendor_no                  platform.code20 NOT NULL,
    posting_date               date NOT NULL,
    document_date              date,
    due_date                   date NOT NULL,
    document_type              platform.document_type NOT NULL,
    document_no                platform.document_no NOT NULL,
    external_document_no       platform.ext_document_no,            -- vendor invoice / credit memo no.
    supplier_ebarimt_id        platform.ddtd,
    description                text,
    currency_code              platform.currency_code,
    original_currency_factor   platform.exch_rate,
    adjusted_currency_factor   platform.exch_rate,
    original_exchange_rate     platform.exch_rate,                  -- CR #191: MNT per 1 FCY at posting
    adjusted_exchange_rate     platform.exch_rate,                  -- CR #191: whitelisted (FX revaluation, R2)
    amount                     platform.amount NOT NULL,            -- invoice: negative (credit)
    amount_lcy                 platform.amount NOT NULL,
    purchase_lcy               platform.amount NOT NULL DEFAULT 0,
    remaining_amount           platform.amount NOT NULL DEFAULT 0,  -- trigger-maintained ONLY
    remaining_amount_lcy       platform.amount NOT NULL DEFAULT 0,  -- trigger-maintained ONLY
    positive                   boolean NOT NULL,
    open                       boolean NOT NULL DEFAULT true,       -- trigger-maintained ONLY
    closed_by_entry_no         bigint,
    closed_at_date             date,
    closed_by_amount           platform.amount,
    closed_by_amount_lcy       platform.amount,
    closed_by_currency_code    platform.currency_code,
    closed_by_currency_amount  platform.amount,
    applies_to_doc_type        platform.document_type,
    applies_to_doc_no          platform.document_no,
    applies_to_id              text CHECK (char_length(applies_to_id) <= 50),
    amount_to_apply            platform.amount NOT NULL DEFAULT 0,
    applying_entry             boolean NOT NULL DEFAULT false,
    on_hold                    text CHECK (char_length(on_hold) <= 3),
    vendor_posting_group_id    uuid NOT NULL,
    payment_method_code        platform.code20,
    bal_account_type           platform.account_type,
    bal_account_id             uuid,
    transaction_no             bigint NOT NULL,
    gl_register_no             bigint NOT NULL,
    dimension_set_id           bigint NOT NULL DEFAULT 0,
    global_dim_1_value_id      uuid,                                -- derived from dimension_set_id by trigger (910)
    global_dim_2_value_id      uuid,
    source_code                platform.code20 NOT NULL REFERENCES platform.source_code (code),
    reason_code_id             uuid,
    reversed                   boolean NOT NULL DEFAULT false,
    reversed_by_entry_no       bigint,
    reversed_entry_no          bigint,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, vendor_posting_group_id) REFERENCES party.vendor_posting_group (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, closed_by_entry_no) REFERENCES party.vendor_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, reversed_entry_no) REFERENCES party.vendor_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_by_entry_no) REFERENCES party.vendor_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, entry_no, vendor_id),
    UNIQUE (company_id, id),
    CHECK (positive = (amount > 0) OR amount = 0),
    CHECK ((currency_code IS NULL) = (original_currency_factor IS NULL)),
    CHECK ((currency_code IS NULL) = (original_exchange_rate IS NULL)),
    CHECK (original_exchange_rate IS NULL OR abs(original_currency_factor * original_exchange_rate - 1) <= 0.000000000001),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (document_type NOT IN ('INVOICE','CREDIT_MEMO') OR external_document_no IS NOT NULL OR source_code = 'OPENING'),
    CHECK (remaining_amount = 0 OR (sign(remaining_amount) = sign(amount) AND abs(remaining_amount) <= abs(amount)))
);
CREATE INDEX ix_vendor_ledger_entry__vendor ON party.vendor_ledger_entry (company_id, vendor_id, posting_date);
CREATE INDEX ix_vendor_ledger_entry__open ON party.vendor_ledger_entry (company_id, vendor_id, due_date) WHERE open;
CREATE INDEX ix_vendor_ledger_entry__document ON party.vendor_ledger_entry (company_id, document_no, document_type);
CREATE INDEX ix_vendor_ledger_entry__currency ON party.vendor_ledger_entry (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_vendor_ledger_entry__posting_group ON party.vendor_ledger_entry (company_id, vendor_posting_group_id);
CREATE INDEX ix_vendor_ledger_entry__transaction ON party.vendor_ledger_entry (company_id, transaction_no);
CREATE INDEX ix_vendor_ledger_entry__register ON party.vendor_ledger_entry (company_id, gl_register_no);
CREATE INDEX ix_vendor_ledger_entry__dimension_set ON party.vendor_ledger_entry (company_id, dimension_set_id);
CREATE INDEX ix_vendor_ledger_entry__reason ON party.vendor_ledger_entry (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_vendor_ledger_entry__closed_by ON party.vendor_ledger_entry (company_id, closed_by_entry_no) WHERE closed_by_entry_no IS NOT NULL;
CREATE INDEX ix_vendor_ledger_entry__reversed_entry ON party.vendor_ledger_entry (company_id, reversed_entry_no) WHERE reversed_entry_no IS NOT NULL;
CREATE INDEX ix_vendor_ledger_entry__reversed_by ON party.vendor_ledger_entry (company_id, reversed_by_entry_no) WHERE reversed_by_entry_no IS NOT NULL;
CREATE INDEX ix_vendor_ledger_entry__applies_to_id ON party.vendor_ledger_entry (company_id, applies_to_id) WHERE applies_to_id IS NOT NULL;
CREATE INDEX ix_vendor_ledger_entry__supplier_receipt ON party.vendor_ledger_entry (company_id, supplier_ebarimt_id) WHERE supplier_ebarimt_id IS NOT NULL;
-- CR #151 (BR-PUR-10/12): vendor document numbers compare case- and whitespace-insensitively, whatever wrote the row
CREATE FUNCTION platform.fn_normalize_ext_doc_no(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT upper(regexp_replace(btrim(p), '\s+', ' ', 'g')) $$;
COMMENT ON FUNCTION platform.fn_normalize_ext_doc_no(text) IS 'Normal form of an external (vendor) document number for uniqueness checks: trimmed, inner whitespace collapsed, upper case.';
-- BC "Purchase invoice already exists for this vendor": one live invoice/credit memo per vendor document number.
CREATE UNIQUE INDEX ux_vendor_ledger_entry__vendor_doc_no ON party.vendor_ledger_entry
    (company_id, vendor_id, document_type, platform.fn_normalize_ext_doc_no(external_document_no))
    WHERE document_type IN ('INVOICE','CREDIT_MEMO') AND external_document_no IS NOT NULL AND NOT reversed;
-- CR #158 (BR-AP-10): our own posted purchase invoice / credit memo number once in the payables ledger (mirror of
-- ux_cust_ledger_entry__doc_no; cash-purchase PAYMENT/REFUND entries share the number with another type).
CREATE UNIQUE INDEX ux_vendor_ledger_entry__doc_no ON party.vendor_ledger_entry (company_id, document_type, document_no)
    WHERE document_type IN ('INVOICE','CREDIT_MEMO') AND source_code <> 'OPENING' AND NOT reversed;
COMMENT ON TABLE party.vendor_ledger_entry IS 'Mirrors BC table 25 Vendor Ledger Entry (party schema per D-K2). Vendor invoice no. is unique per vendor and document type among non-reversed entries (normalized, platform.fn_normalize_ext_doc_no); remaining/open trigger-maintained; no over-application.';

CREATE TABLE party.detailed_vendor_ledger_entry (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL,
    company_id                      uuid NOT NULL,
    entry_no                        bigint NOT NULL CHECK (entry_no > 0),
    vendor_ledger_entry_no          bigint NOT NULL,
    entry_type                      text NOT NULL CHECK (entry_type IN ('INITIAL','APPLICATION','UNREALIZED_LOSS','UNREALIZED_GAIN',
                                        'REALIZED_LOSS','REALIZED_GAIN','PAYMENT_DISCOUNT','CORRECTION_OF_REMAINING_AMOUNT',
                                        'APPL_ROUNDING')),
    posting_date                    date NOT NULL,
    document_type                   platform.document_type NOT NULL,
    document_no                     platform.document_no NOT NULL,
    amount                          platform.amount NOT NULL,
    amount_lcy                      platform.amount NOT NULL,
    debit_amount                    numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount > 0 THEN amount ELSE 0 END) STORED,
    credit_amount                   numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount < 0 THEN -amount ELSE 0 END) STORED,
    debit_amount_lcy                numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount_lcy > 0 THEN amount_lcy ELSE 0 END) STORED,
    credit_amount_lcy               numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount_lcy < 0 THEN -amount_lcy ELSE 0 END) STORED,
    vendor_id                       uuid NOT NULL,
    currency_code                   platform.currency_code,
    transaction_no                  bigint,                                -- NULL = BC "Transaction No. 0" (application without G/L)
    application_no                  bigint,
    applied_vend_ledger_entry_no    bigint,
    unapplied                       boolean NOT NULL DEFAULT false,
    unapplied_by_entry_no           bigint,
    ledger_entry_amount             boolean NOT NULL DEFAULT false,
    initial_entry_due_date          date,
    initial_document_type           platform.document_type,
    initial_entry_global_dim_1_id   uuid,
    initial_entry_global_dim_2_id   uuid,
    vendor_posting_group_id         uuid,
    exch_rate_adjmt_reg_no          bigint,
    source_code                     platform.code20 NOT NULL REFERENCES platform.source_code (code),
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_ledger_entry_no, vendor_id) REFERENCES party.vendor_ledger_entry (company_id, entry_no, vendor_id),
    FOREIGN KEY (company_id, applied_vend_ledger_entry_no, vendor_id) REFERENCES party.vendor_ledger_entry (company_id, entry_no, vendor_id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, unapplied_by_entry_no) REFERENCES party.detailed_vendor_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, vendor_posting_group_id) REFERENCES party.vendor_posting_group (company_id, id),
    FOREIGN KEY (company_id, exch_rate_adjmt_reg_no) REFERENCES fx.exch_rate_adjmt_register (company_id, no),
    UNIQUE (company_id, entry_no),
    CHECK (entry_type NOT IN ('APPLICATION','REALIZED_LOSS','REALIZED_GAIN','PAYMENT_DISCOUNT','CORRECTION_OF_REMAINING_AMOUNT',
                              'APPL_ROUNDING') OR application_no IS NOT NULL),
    CHECK (entry_type IN ('APPLICATION','APPL_ROUNDING','CORRECTION_OF_REMAINING_AMOUNT') OR transaction_no IS NOT NULL),
    CHECK (ledger_entry_amount = (entry_type = 'INITIAL') OR entry_type NOT IN ('INITIAL','APPLICATION')),
    CHECK (NOT unapplied OR unapplied_by_entry_no IS NOT NULL)
);
CREATE INDEX ix_detailed_vendor_ledger_entry__vle ON party.detailed_vendor_ledger_entry (company_id, vendor_ledger_entry_no, vendor_id, posting_date) INCLUDE (amount, amount_lcy, entry_type);
CREATE INDEX ix_detailed_vendor_ledger_entry__vendor ON party.detailed_vendor_ledger_entry (company_id, vendor_id, posting_date) INCLUDE (amount_lcy);
CREATE INDEX ix_detailed_vendor_ledger_entry__applied ON party.detailed_vendor_ledger_entry (company_id, applied_vend_ledger_entry_no, vendor_id) WHERE applied_vend_ledger_entry_no IS NOT NULL;
CREATE INDEX ix_detailed_vendor_ledger_entry__transaction ON party.detailed_vendor_ledger_entry (company_id, transaction_no) WHERE transaction_no IS NOT NULL;
CREATE INDEX ix_detailed_vendor_ledger_entry__application ON party.detailed_vendor_ledger_entry (company_id, application_no) WHERE application_no IS NOT NULL;
CREATE INDEX ix_detailed_vendor_ledger_entry__unapplied_by ON party.detailed_vendor_ledger_entry (company_id, unapplied_by_entry_no) WHERE unapplied_by_entry_no IS NOT NULL;
CREATE INDEX ix_detailed_vendor_ledger_entry__posting_group ON party.detailed_vendor_ledger_entry (company_id, vendor_posting_group_id);
CREATE INDEX ix_detailed_vendor_ledger_entry__fx_reg ON party.detailed_vendor_ledger_entry (company_id, exch_rate_adjmt_reg_no) WHERE exch_rate_adjmt_reg_no IS NOT NULL;
COMMENT ON TABLE party.detailed_vendor_ledger_entry IS 'Mirrors BC table 380 Detailed Vendor Ledg. Entry (append-only; source of truth for payables balances). transaction_no NULL = application without G/L effect.';
COMMENT ON COLUMN party.detailed_vendor_ledger_entry.initial_entry_due_date IS 'Due date of the ledger entry when this row was posted (snapshot, never updated; CR #140). Aging uses the current party.vendor_ledger_entry.due_date.';

-- Remaining-amount cache maintenance (INV-04). SECURITY DEFINER: app_user has no UPDATE on the ledger, and
-- remaining_amount(_lcy)/open are NOT updatable through platform.fn_ledger_update (only this trigger).
CREATE FUNCTION party.fn_detailed_cust_ledger_entry_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    UPDATE party.cust_ledger_entry e
       SET remaining_amount     = e.remaining_amount + NEW.amount,
           remaining_amount_lcy = e.remaining_amount_lcy + NEW.amount_lcy,
           open                 = (e.remaining_amount + NEW.amount) <> 0
     WHERE e.company_id = NEW.company_id AND e.entry_no = NEW.cust_ledger_entry_no;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_detailed_cust_ledger_entry_remaining AFTER INSERT ON party.detailed_cust_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION party.fn_detailed_cust_ledger_entry_after_insert();

CREATE FUNCTION party.fn_detailed_vendor_ledger_entry_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    UPDATE party.vendor_ledger_entry e
       SET remaining_amount     = e.remaining_amount + NEW.amount,
           remaining_amount_lcy = e.remaining_amount_lcy + NEW.amount_lcy,
           open                 = (e.remaining_amount + NEW.amount) <> 0
     WHERE e.company_id = NEW.company_id AND e.entry_no = NEW.vendor_ledger_entry_no;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_detailed_vendor_ledger_entry_remaining AFTER INSERT ON party.detailed_vendor_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION party.fn_detailed_vendor_ledger_entry_after_insert();

-- Application worksheet (FR-PTY-010: "the selection is kept in a temporary application_draft, not on ledger
-- rows"). One row per entry selected under an Applies-to ID (BC Cust. Entry-SetAppl.ID / Apply Entries page).
-- Transient: deleted when the application is posted or abandoned.
CREATE TABLE party.application_draft (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL,
    applies_to_id            text NOT NULL CHECK (char_length(applies_to_id) BETWEEN 1 AND 50),   -- BC Applies-to ID (session/user key)
    party_type               text NOT NULL CHECK (party_type IN ('CUSTOMER','VENDOR')),
    customer_id              uuid,
    vendor_id                uuid,
    cust_ledger_entry_no     bigint,
    vendor_ledger_entry_no   bigint,
    is_applying_entry        boolean NOT NULL DEFAULT false,      -- BC "Applying Entry" (the payment being applied)
    amount_to_apply          platform.amount NOT NULL DEFAULT 0,  -- signed like the entry; 0 = full remaining
    sequence_no              integer NOT NULL DEFAULT 0,          -- allocation order (default: due date ascending)
    owner_kind               text NOT NULL DEFAULT 'SESSION' CHECK (owner_kind IN ('SESSION','JOURNAL_LINE')),   -- CR #149 (BR-AP-34/75/78)
    journal_line_id          uuid,                                -- JOURNAL_LINE drafts live and die with their suggested-payment line
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    updated_at               timestamptz NOT NULL DEFAULT now(),  -- CR #144/#159: the 30-minute stale-session rule reads it
    updated_by               uuid,
    row_version              integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, cust_ledger_entry_no, customer_id) REFERENCES party.cust_ledger_entry (company_id, entry_no, customer_id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, vendor_ledger_entry_no, vendor_id) REFERENCES party.vendor_ledger_entry (company_id, entry_no, vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, journal_line_id) REFERENCES gl.journal_line (company_id, id) ON DELETE CASCADE,
    CHECK ((owner_kind = 'JOURNAL_LINE') = (journal_line_id IS NOT NULL)),
    CHECK ((party_type = 'CUSTOMER') = (customer_id IS NOT NULL AND cust_ledger_entry_no IS NOT NULL)),
    CHECK ((party_type = 'VENDOR') = (vendor_id IS NOT NULL AND vendor_ledger_entry_no IS NOT NULL)),
    CHECK (customer_id IS NULL OR vendor_id IS NULL)
);
CREATE UNIQUE INDEX ux_application_draft__cust ON party.application_draft (company_id, cust_ledger_entry_no, customer_id) WHERE cust_ledger_entry_no IS NOT NULL;
CREATE UNIQUE INDEX ux_application_draft__vend ON party.application_draft (company_id, vendor_ledger_entry_no, vendor_id) WHERE vendor_ledger_entry_no IS NOT NULL;
CREATE UNIQUE INDEX ux_application_draft__one_applying ON party.application_draft (company_id, applies_to_id) WHERE is_applying_entry;
CREATE INDEX ix_application_draft__applies_to_id ON party.application_draft (company_id, applies_to_id, sequence_no);
CREATE INDEX ix_application_draft__journal_line ON party.application_draft (company_id, journal_line_id) WHERE journal_line_id IS NOT NULL;
CREATE INDEX ix_application_draft__stale ON party.application_draft (company_id, updated_at) WHERE owner_kind = 'SESSION';
COMMENT ON TABLE party.application_draft IS 'Application worksheet (FR-PTY-010; BC Applies-to ID + Amount to Apply + Applying Entry staging). An open entry can be in one draft at a time; at most one applying entry per Applies-to ID. Not a ledger: rows are deleted after posting.';
