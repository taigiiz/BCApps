-- =============================================================================
-- 070_sales.sql
-- Sales documents (drafts and posted) (BC tables 311, 36, 37, 112-115, 1900).
-- The receivables subledger (BC 21/379) lives in the party schema (060, DECISIONS D-K2).
-- Posted documents are immutable (guards in 910).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE TABLE sales.sales_setup (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL,
    company_id                      uuid NOT NULL,
    customer_nos_id                 uuid,           -- number series for customer cards
    invoice_nos_id                  uuid,           -- draft invoice numbers (gaps allowed)
    credit_memo_nos_id              uuid,           -- draft credit memo numbers
    posted_invoice_nos_id           uuid,           -- gapless (D-C7)
    posted_credit_memo_nos_id       uuid,           -- gapless
    discount_posting                text NOT NULL DEFAULT 'NO_DISCOUNTS'
                                    CHECK (discount_posting IN ('NO_DISCOUNTS','INVOICE_DISCOUNTS','LINE_DISCOUNTS','ALL_DISCOUNTS')),  -- D-F2
    ext_doc_no_mandatory            boolean NOT NULL DEFAULT false,
    allow_vat_difference            boolean NOT NULL DEFAULT false,  -- BC T311 Allow VAT Difference (limit: general_ledger_setup.max_vat_difference_allowed)
    default_posting_date            text NOT NULL DEFAULT 'WORK_DATE' CHECK (default_posting_date IN ('WORK_DATE','NO_DATE')),
    link_doc_date_to_posting_date   boolean NOT NULL DEFAULT true,
    stockout_warning                boolean NOT NULL DEFAULT true,
    ebarimt_on_posting              boolean NOT NULL DEFAULT true,   -- D-J1: create the eBarimt document when posting
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid DEFAULT platform.current_user_id(),
    updated_at                      timestamptz,
    updated_by                      uuid,
    row_version                     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customer_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, invoice_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, credit_memo_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, posted_invoice_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, posted_credit_memo_nos_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id)
);
CREATE INDEX ix_sales_setup__customer_nos ON sales.sales_setup (company_id, customer_nos_id);
CREATE INDEX ix_sales_setup__invoice_nos ON sales.sales_setup (company_id, invoice_nos_id);
CREATE INDEX ix_sales_setup__cm_nos ON sales.sales_setup (company_id, credit_memo_nos_id);
CREATE INDEX ix_sales_setup__posted_invoice_nos ON sales.sales_setup (company_id, posted_invoice_nos_id);
CREATE INDEX ix_sales_setup__posted_cm_nos ON sales.sales_setup (company_id, posted_credit_memo_nos_id);
COMMENT ON TABLE sales.sales_setup IS 'Mirrors BC table 311 Sales & Receivables Setup (number series and posting switches).';

-- -----------------------------------------------------------------------------
-- Drafts (mutable)
-- -----------------------------------------------------------------------------
CREATE TABLE sales.sales_header (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL,
    company_id                    uuid NOT NULL,
    document_type                 text NOT NULL CHECK (document_type IN ('INVOICE','CREDIT_MEMO')),   -- D-A4
    no                            platform.document_no NOT NULL,          -- draft number (not the legal number)
    status                        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RELEASED')),
    customer_id                   uuid NOT NULL,
    customer_name                 text NOT NULL,
    customer_address              text,
    posting_date                  date,
    document_date                 date NOT NULL DEFAULT current_date,
    vat_date                      date,
    due_date                      date,
    prices_including_vat          boolean NOT NULL DEFAULT false,
    currency_code                 platform.currency_code,
    currency_factor               platform.exch_rate,
    payment_terms_id              uuid,
    payment_method_id             uuid,
    bal_account_type              platform.account_type,                  -- cash sale (D-F5)
    bal_account_id                uuid,
    customer_posting_group_id     uuid NOT NULL,
    gen_bus_posting_group_id      uuid NOT NULL,
    vat_bus_posting_group_id      uuid NOT NULL,
    applies_to_doc_type           platform.document_type,
    applies_to_doc_no             platform.document_no,
    applies_to_id                 text CHECK (char_length(applies_to_id) <= 50),
    corrected_invoice_id          uuid,                                   -- credit memo created by "cancel invoice" (D-F6)
    external_document_no          platform.ext_document_no,
    reason_code_id                uuid,
    dimension_set_id              bigint NOT NULL DEFAULT 0,
    invoice_discount_calculation  text NOT NULL DEFAULT 'NONE' CHECK (invoice_discount_calculation IN ('NONE','PERCENT','AMOUNT')),
    invoice_discount_value        platform.amount NOT NULL DEFAULT 0,
    posting_no_series_id          uuid,
    ebarimt_receipt_type          text CHECK (ebarimt_receipt_type IN ('B2C_RECEIPT','B2B_RECEIPT','B2C_INVOICE','B2B_INVOICE','NONE')),
    ebarimt_customer_tin          platform.tin,
    ebarimt_consumer_no           text CHECK (ebarimt_consumer_no ~ '^[0-9]{8}$'),
    amount                        platform.amount NOT NULL DEFAULT 0,     -- cached totals (excl. VAT)
    amount_including_vat          platform.amount NOT NULL DEFAULT 0,
    vat_amount                    platform.amount NOT NULL DEFAULT 0,
    city_tax_amount               platform.amount NOT NULL DEFAULT 0,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid DEFAULT platform.current_user_id(),
    updated_at                    timestamptz,
    updated_by                    uuid,
    row_version                   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customer_id) REFERENCES party.customer (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, payment_terms_id) REFERENCES party.payment_terms (company_id, id),
    FOREIGN KEY (company_id, payment_method_id) REFERENCES party.payment_method (company_id, id),
    FOREIGN KEY (company_id, customer_posting_group_id) REFERENCES party.customer_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, posting_no_series_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id, document_type, no),
    UNIQUE (company_id, id),
    CHECK ((currency_code IS NULL) = (currency_factor IS NULL)),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (bal_account_type IS NULL OR bal_account_type IN ('GL_ACCOUNT','BANK_ACCOUNT')),
    CHECK (document_type = 'CREDIT_MEMO' OR corrected_invoice_id IS NULL)
);
CREATE INDEX ix_sales_header__customer ON sales.sales_header (company_id, customer_id);
CREATE INDEX ix_sales_header__currency ON sales.sales_header (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_sales_header__terms ON sales.sales_header (company_id, payment_terms_id);
CREATE INDEX ix_sales_header__method ON sales.sales_header (company_id, payment_method_id);
CREATE INDEX ix_sales_header__cpg ON sales.sales_header (company_id, customer_posting_group_id);
CREATE INDEX ix_sales_header__gbpg ON sales.sales_header (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_sales_header__vbpg ON sales.sales_header (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_sales_header__reason ON sales.sales_header (company_id, reason_code_id);
CREATE INDEX ix_sales_header__dimension_set ON sales.sales_header (company_id, dimension_set_id);
CREATE INDEX ix_sales_header__posting_nos ON sales.sales_header (company_id, posting_no_series_id);
CREATE INDEX ix_sales_header__corrected ON sales.sales_header (company_id, corrected_invoice_id);
COMMENT ON TABLE sales.sales_header IS 'Mirrors BC table 36 Sales Header for Invoice and Credit Memo drafts (no quote/order in v1, D-A4). Deleted when posted.';

CREATE TABLE sales.sales_line (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    sales_header_id             uuid NOT NULL,
    line_no                     integer NOT NULL,
    line_type                   text NOT NULL CHECK (line_type IN ('COMMENT','GL_ACCOUNT','ITEM','FIXED_ASSET')),
    gl_account_id               uuid,
    item_id                     uuid,                                  -- FK added in 110
    fixed_asset_id              uuid,                                  -- FK added in 100 (R2 disposal)
    description                 text CHECK (char_length(description) <= 250),
    unit_of_measure_code        platform.code20,
    quantity                    platform.quantity NOT NULL DEFAULT 0,
    unit_price                  platform.unit_amount NOT NULL DEFAULT 0,
    line_discount_percent       platform.percent NOT NULL DEFAULT 0,
    line_discount_amount        platform.amount NOT NULL DEFAULT 0,
    line_amount                 platform.amount NOT NULL DEFAULT 0,    -- qty x price - line discount
    inv_discount_amount         platform.amount NOT NULL DEFAULT 0,
    amount                      platform.amount NOT NULL DEFAULT 0,    -- excl. VAT after all discounts
    amount_including_vat        platform.amount NOT NULL DEFAULT 0,
    vat_base_amount             platform.amount NOT NULL DEFAULT 0,
    vat_percent                 platform.percent NOT NULL DEFAULT 0,
    vat_calculation_type        platform.vat_calc_type NOT NULL DEFAULT 'NORMAL',
    vat_identifier              platform.code20,
    vat_difference              platform.amount NOT NULL DEFAULT 0,
    gen_bus_posting_group_id    uuid,
    gen_prod_posting_group_id   uuid,
    vat_bus_posting_group_id    uuid,
    vat_prod_posting_group_id   uuid,
    city_tax_code_id            uuid,
    city_tax_amount             platform.amount NOT NULL DEFAULT 0,
    unit_cost_lcy               platform.unit_amount NOT NULL DEFAULT 0,
    location_id                 uuid,                                  -- FK added in 110 (R2)
    dimension_set_id            bigint NOT NULL DEFAULT 0,
    classification_code         text CHECK (classification_code ~ '^[0-9]{7}$'),     -- БҮНА for eBarimt
    tax_product_code            text,
    barcode                     text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, sales_header_id) REFERENCES sales.sales_header (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_prod_posting_group_id) REFERENCES party.gen_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, city_tax_code_id) REFERENCES tax.city_tax_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    UNIQUE (company_id, sales_header_id, line_no),
    CHECK (quantity >= 0),
    CHECK ((line_type = 'GL_ACCOUNT') = (gl_account_id IS NOT NULL)),
    CHECK ((line_type = 'ITEM') = (item_id IS NOT NULL)),
    CHECK ((line_type = 'FIXED_ASSET') = (fixed_asset_id IS NOT NULL))
);
CREATE INDEX ix_sales_line__gl_account ON sales.sales_line (company_id, gl_account_id);
CREATE INDEX ix_sales_line__item ON sales.sales_line (company_id, item_id);
CREATE INDEX ix_sales_line__fixed_asset ON sales.sales_line (company_id, fixed_asset_id);
CREATE INDEX ix_sales_line__gbpg ON sales.sales_line (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_sales_line__gppg ON sales.sales_line (company_id, gen_prod_posting_group_id);
CREATE INDEX ix_sales_line__vbpg ON sales.sales_line (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_sales_line__vppg ON sales.sales_line (company_id, vat_prod_posting_group_id);
CREATE INDEX ix_sales_line__city_tax ON sales.sales_line (company_id, city_tax_code_id);
CREATE INDEX ix_sales_line__location ON sales.sales_line (company_id, location_id);
CREATE INDEX ix_sales_line__dimension_set ON sales.sales_line (company_id, dimension_set_id);
COMMENT ON TABLE sales.sales_line IS 'Mirrors BC table 37 Sales Line (types comment / G/L account / item / fixed asset). Invoice always ships the full quantity (no shipments).';

-- -----------------------------------------------------------------------------
-- Posted documents (immutable)
-- -----------------------------------------------------------------------------
CREATE TABLE sales.sales_invoice_header (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    no                        platform.document_no NOT NULL,          -- legal, gapless number
    pre_assigned_no           platform.document_no,                   -- draft number
    draft_id                  uuid,                                   -- stable API id of the draft
    customer_id               uuid NOT NULL,
    customer_no               platform.code20 NOT NULL,
    customer_name             text NOT NULL,
    customer_address          text,
    customer_tin              text,
    customer_registration_no  text,
    posting_date              date NOT NULL,
    document_date             date NOT NULL,
    vat_date                  date NOT NULL,
    due_date                  date NOT NULL,
    prices_including_vat      boolean NOT NULL,
    currency_code             platform.currency_code,
    currency_factor           platform.exch_rate,
    payment_terms_code        platform.code20,
    payment_method_code       platform.code20,
    customer_posting_group    platform.code20 NOT NULL,
    gen_bus_posting_group     platform.code20 NOT NULL,
    vat_bus_posting_group     platform.code20 NOT NULL,
    external_document_no      platform.ext_document_no,
    reason_code_id            uuid,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    amount                    platform.amount NOT NULL,
    amount_including_vat      platform.amount NOT NULL,
    vat_amount                platform.amount NOT NULL,
    city_tax_amount           platform.amount NOT NULL DEFAULT 0,
    invoice_discount_amount   platform.amount NOT NULL DEFAULT 0,
    amount_lcy                platform.amount NOT NULL,
    amount_including_vat_lcy  platform.amount NOT NULL,
    cust_ledger_entry_no      bigint NOT NULL,
    transaction_no            bigint NOT NULL,
    gl_register_no            bigint NOT NULL,
    ebarimt_receipt_type      text NOT NULL DEFAULT 'B2C_RECEIPT'
                              CHECK (ebarimt_receipt_type IN ('B2C_RECEIPT','B2B_RECEIPT','B2C_INVOICE','B2B_INVOICE','NONE')),
    ebarimt_customer_tin      platform.tin,
    ebarimt_consumer_no       text CHECK (ebarimt_consumer_no ~ '^[0-9]{8}$'),
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customer_id) REFERENCES party.customer (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK (ebarimt_receipt_type NOT IN ('B2B_RECEIPT','B2B_INVOICE') OR ebarimt_customer_tin IS NOT NULL),
    CHECK ((currency_code IS NULL) = (currency_factor IS NULL))
);
CREATE INDEX ix_sales_invoice_header__customer ON sales.sales_invoice_header (company_id, customer_id, posting_date);
CREATE INDEX ix_sales_invoice_header__date ON sales.sales_invoice_header (company_id, posting_date);
CREATE INDEX ix_sales_invoice_header__currency ON sales.sales_invoice_header (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_sales_invoice_header__reason ON sales.sales_invoice_header (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_sales_invoice_header__dimension_set ON sales.sales_invoice_header (company_id, dimension_set_id);
CREATE INDEX ix_sales_invoice_header__transaction ON sales.sales_invoice_header (company_id, transaction_no);
CREATE INDEX ix_sales_invoice_header__register ON sales.sales_invoice_header (company_id, gl_register_no);
CREATE INDEX ix_sales_invoice_header__cle ON sales.sales_invoice_header (company_id, cust_ledger_entry_no);
CREATE UNIQUE INDEX ux_sales_invoice_header__draft ON sales.sales_invoice_header (company_id, draft_id) WHERE draft_id IS NOT NULL;
COMMENT ON TABLE sales.sales_invoice_header IS 'Mirrors BC table 112 Sales Invoice Header (posted, immutable, with snapshots of customer/posting groups and eBarimt request data).';

CREATE TABLE sales.sales_invoice_line (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    sales_invoice_header_id   uuid NOT NULL,
    line_no                   integer NOT NULL,
    line_type                 text NOT NULL CHECK (line_type IN ('COMMENT','GL_ACCOUNT','ITEM','FIXED_ASSET')),
    gl_account_id             uuid,
    item_id                   uuid,
    fixed_asset_id            uuid,
    no                        platform.code20,                     -- account/item/asset number snapshot
    description               text,
    unit_of_measure_code      platform.code20,
    quantity                  platform.quantity NOT NULL DEFAULT 0,
    unit_price                platform.unit_amount NOT NULL DEFAULT 0,
    line_discount_percent     platform.percent NOT NULL DEFAULT 0,
    line_discount_amount      platform.amount NOT NULL DEFAULT 0,
    line_amount               platform.amount NOT NULL DEFAULT 0,
    inv_discount_amount       platform.amount NOT NULL DEFAULT 0,
    amount                    platform.amount NOT NULL DEFAULT 0,
    amount_including_vat      platform.amount NOT NULL DEFAULT 0,
    vat_base_amount           platform.amount NOT NULL DEFAULT 0,
    vat_percent               platform.percent NOT NULL DEFAULT 0,
    vat_calculation_type      platform.vat_calc_type NOT NULL DEFAULT 'NORMAL',
    vat_identifier            platform.code20,
    vat_difference            platform.amount NOT NULL DEFAULT 0,
    gen_bus_posting_group     platform.code20,
    gen_prod_posting_group    platform.code20,
    vat_bus_posting_group     platform.code20,
    vat_prod_posting_group    platform.code20,
    city_tax_code             platform.code20,
    city_tax_amount           platform.amount NOT NULL DEFAULT 0,
    unit_cost_lcy             platform.unit_amount NOT NULL DEFAULT 0,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    classification_code       text CHECK (classification_code ~ '^[0-9]{7}$'),
    tax_product_code          text,
    barcode                   text,
    ebarimt_tax_type          platform.ebarimt_tax_type,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, sales_invoice_header_id) REFERENCES sales.sales_invoice_header (company_id, id),
    FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    UNIQUE (company_id, sales_invoice_header_id, line_no)
);
CREATE INDEX ix_sales_invoice_line__gl_account ON sales.sales_invoice_line (company_id, gl_account_id);
CREATE INDEX ix_sales_invoice_line__item ON sales.sales_invoice_line (company_id, item_id);
CREATE INDEX ix_sales_invoice_line__fixed_asset ON sales.sales_invoice_line (company_id, fixed_asset_id);
CREATE INDEX ix_sales_invoice_line__dimension_set ON sales.sales_invoice_line (company_id, dimension_set_id);
COMMENT ON TABLE sales.sales_invoice_line IS 'Mirrors BC table 113 Sales Invoice Line (posted, immutable).';

CREATE TABLE sales.sales_cr_memo_header (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    no                        platform.document_no NOT NULL,
    pre_assigned_no           platform.document_no,
    draft_id                  uuid,
    customer_id               uuid NOT NULL,
    customer_no               platform.code20 NOT NULL,
    customer_name             text NOT NULL,
    customer_address          text,
    customer_tin              text,
    customer_registration_no  text,
    posting_date              date NOT NULL,
    document_date             date NOT NULL,
    vat_date                  date NOT NULL,
    due_date                  date NOT NULL,
    prices_including_vat      boolean NOT NULL,
    currency_code             platform.currency_code,
    currency_factor           platform.exch_rate,
    payment_terms_code        platform.code20,
    payment_method_code       platform.code20,
    customer_posting_group    platform.code20 NOT NULL,
    gen_bus_posting_group     platform.code20 NOT NULL,
    vat_bus_posting_group     platform.code20 NOT NULL,
    applies_to_doc_type       platform.document_type,
    applies_to_doc_no         platform.document_no,
    corrected_invoice_id      uuid,                                    -- the invoice this memo cancels/corrects
    external_document_no      platform.ext_document_no,
    reason_code_id            uuid,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    amount                    platform.amount NOT NULL,
    amount_including_vat      platform.amount NOT NULL,
    vat_amount                platform.amount NOT NULL,
    city_tax_amount           platform.amount NOT NULL DEFAULT 0,
    invoice_discount_amount   platform.amount NOT NULL DEFAULT 0,
    amount_lcy                platform.amount NOT NULL,
    amount_including_vat_lcy  platform.amount NOT NULL,
    cust_ledger_entry_no      bigint NOT NULL,
    transaction_no            bigint NOT NULL,
    gl_register_no            bigint NOT NULL,
    ebarimt_receipt_type      text NOT NULL DEFAULT 'B2C_RECEIPT'
                              CHECK (ebarimt_receipt_type IN ('B2C_RECEIPT','B2B_RECEIPT','B2C_INVOICE','B2B_INVOICE','NONE')),
    ebarimt_customer_tin      platform.tin,
    ebarimt_consumer_no       text CHECK (ebarimt_consumer_no ~ '^[0-9]{8}$'),
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customer_id) REFERENCES party.customer (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, corrected_invoice_id) REFERENCES sales.sales_invoice_header (company_id, id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK ((currency_code IS NULL) = (currency_factor IS NULL))
);
CREATE INDEX ix_sales_cr_memo_header__customer ON sales.sales_cr_memo_header (company_id, customer_id, posting_date);
CREATE INDEX ix_sales_cr_memo_header__date ON sales.sales_cr_memo_header (company_id, posting_date);
CREATE INDEX ix_sales_cr_memo_header__currency ON sales.sales_cr_memo_header (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_sales_cr_memo_header__corrected ON sales.sales_cr_memo_header (company_id, corrected_invoice_id);
CREATE INDEX ix_sales_cr_memo_header__reason ON sales.sales_cr_memo_header (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_sales_cr_memo_header__dimension_set ON sales.sales_cr_memo_header (company_id, dimension_set_id);
CREATE INDEX ix_sales_cr_memo_header__transaction ON sales.sales_cr_memo_header (company_id, transaction_no);
CREATE INDEX ix_sales_cr_memo_header__register ON sales.sales_cr_memo_header (company_id, gl_register_no);
CREATE INDEX ix_sales_cr_memo_header__cle ON sales.sales_cr_memo_header (company_id, cust_ledger_entry_no);
CREATE UNIQUE INDEX ux_sales_cr_memo_header__draft ON sales.sales_cr_memo_header (company_id, draft_id) WHERE draft_id IS NOT NULL;
COMMENT ON TABLE sales.sales_cr_memo_header IS 'Mirrors BC table 114 Sales Cr.Memo Header (posted credit memo / return, immutable).';

CREATE TABLE sales.sales_cr_memo_line (LIKE sales.sales_invoice_line INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE sales.sales_cr_memo_line RENAME COLUMN sales_invoice_header_id TO sales_cr_memo_header_id;
ALTER TABLE sales.sales_cr_memo_line
    ADD PRIMARY KEY (id),
    ADD FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    ADD FOREIGN KEY (company_id, sales_cr_memo_header_id) REFERENCES sales.sales_cr_memo_header (company_id, id),
    ADD FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    ADD FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    ADD UNIQUE (company_id, sales_cr_memo_header_id, line_no);
CREATE INDEX ix_sales_cr_memo_line__gl_account ON sales.sales_cr_memo_line (company_id, gl_account_id);
CREATE INDEX ix_sales_cr_memo_line__item ON sales.sales_cr_memo_line (company_id, item_id);
CREATE INDEX ix_sales_cr_memo_line__fixed_asset ON sales.sales_cr_memo_line (company_id, fixed_asset_id);
CREATE INDEX ix_sales_cr_memo_line__dimension_set ON sales.sales_cr_memo_line (company_id, dimension_set_id);
COMMENT ON TABLE sales.sales_cr_memo_line IS 'Mirrors BC table 115 Sales Cr.Memo Line (posted, immutable; same columns as sales_invoice_line).';

CREATE TABLE sales.cancelled_document (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    cancelled_invoice_id      uuid NOT NULL,
    cancelled_by_cr_memo_id   uuid NOT NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, cancelled_invoice_id) REFERENCES sales.sales_invoice_header (company_id, id),
    FOREIGN KEY (company_id, cancelled_by_cr_memo_id) REFERENCES sales.sales_cr_memo_header (company_id, id),
    UNIQUE (company_id, cancelled_invoice_id),
    UNIQUE (company_id, cancelled_by_cr_memo_id)
);
-- Foreign keys that need tables created above / in 060
ALTER TABLE sales.sales_header
    ADD FOREIGN KEY (company_id, corrected_invoice_id) REFERENCES sales.sales_invoice_header (company_id, id);
ALTER TABLE sales.sales_invoice_header
    ADD FOREIGN KEY (company_id, cust_ledger_entry_no) REFERENCES party.cust_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sales.sales_cr_memo_header
    ADD FOREIGN KEY (company_id, cust_ledger_entry_no) REFERENCES party.cust_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE sales.cancelled_document IS 'Mirrors BC table 1900 Cancelled Document (invoice <-> cancelling credit memo, D-F6). An invoice can be cancelled once.';
