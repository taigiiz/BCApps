-- =============================================================================
-- 080_purchase.sql
-- Purchase documents (drafts and posted) (BC tables 312, 38, 39, 122-125). Mirror of 070_sales.sql.
-- The payables subledger (BC 25/380) lives in the party schema (060, DECISIONS D-K2).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE TABLE purchase.purchase_setup (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL,
    company_id                      uuid NOT NULL,
    vendor_nos_id                   uuid,
    invoice_nos_id                  uuid,
    credit_memo_nos_id              uuid,
    posted_invoice_nos_id           uuid,          -- gapless internal numbering of posted purchase invoices
    posted_credit_memo_nos_id       uuid,
    discount_posting                text NOT NULL DEFAULT 'NO_DISCOUNTS'
                                    CHECK (discount_posting IN ('NO_DISCOUNTS','INVOICE_DISCOUNTS','LINE_DISCOUNTS','ALL_DISCOUNTS')),
    ext_doc_no_mandatory            boolean NOT NULL DEFAULT true,     -- vendor invoice no. mandatory (BC default)
    require_supplier_ebarimt        boolean NOT NULL DEFAULT true,     -- D-E4: VAT deductible only with confirmed ДДТД
    allow_vat_difference            boolean NOT NULL DEFAULT true,     -- BC T312: match the supplier receipt VAT (limit in G/L setup)
    link_doc_date_to_posting_date   boolean NOT NULL DEFAULT true,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid DEFAULT platform.current_user_id(),
    updated_at                      timestamptz,
    updated_by                      uuid,
    row_version                     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, invoice_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, credit_memo_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, posted_invoice_nos_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, posted_credit_memo_nos_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id)
);
CREATE INDEX ix_purchase_setup__vendor_nos ON purchase.purchase_setup (company_id, vendor_nos_id);
CREATE INDEX ix_purchase_setup__invoice_nos ON purchase.purchase_setup (company_id, invoice_nos_id);
CREATE INDEX ix_purchase_setup__cm_nos ON purchase.purchase_setup (company_id, credit_memo_nos_id);
CREATE INDEX ix_purchase_setup__posted_invoice_nos ON purchase.purchase_setup (company_id, posted_invoice_nos_id);
CREATE INDEX ix_purchase_setup__posted_cm_nos ON purchase.purchase_setup (company_id, posted_credit_memo_nos_id);
COMMENT ON TABLE purchase.purchase_setup IS 'Mirrors BC table 312 Purchases & Payables Setup.';

CREATE TABLE purchase.purchase_header (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL,
    company_id                    uuid NOT NULL,
    document_type                 text NOT NULL CHECK (document_type IN ('INVOICE','CREDIT_MEMO')),
    no                            platform.document_no NOT NULL,
    status                        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RELEASED')),
    vendor_id                     uuid NOT NULL,
    vendor_name                   text NOT NULL,
    vendor_invoice_no             platform.ext_document_no,       -- required for INVOICE (BC Vendor Invoice No.)
    vendor_cr_memo_no             platform.ext_document_no,       -- required for CREDIT_MEMO
    supplier_ebarimt_id           platform.ddtd,                  -- supplier receipt ДДТД (D-E4)
    supplier_ebarimt_date         timestamptz,                    -- CR #36 (PUR-02/03): date on the supplier receipt (manual R1 entry)
    purchase_receipt_id           uuid,                           -- imported supplier receipt, FK added in 130
    customs_declaration_id        uuid,                           -- CR #152/#165: import VAT evidence (FULL_VAT lines)
    posting_date                  date,
    document_date                 date NOT NULL DEFAULT current_date,
    vat_date                      date,                           -- D-E9: may differ for late invoices
    due_date                      date,
    prices_including_vat          boolean NOT NULL DEFAULT false,
    currency_code                 platform.currency_code,
    currency_factor               platform.exch_rate,
    exchange_rate                 platform.exch_rate,             -- CR #191: MNT per 1 FCY
    payment_terms_id              uuid,
    payment_method_id             uuid,
    bal_account_type              platform.account_type,
    bal_account_id                uuid,
    vendor_posting_group_id       uuid NOT NULL,
    gen_bus_posting_group_id      uuid NOT NULL,
    vat_bus_posting_group_id      uuid NOT NULL,
    applies_to_doc_type           platform.document_type,
    applies_to_doc_no             platform.document_no,
    applies_to_id                 text CHECK (char_length(applies_to_id) <= 50),
    corrected_invoice_id          uuid,
    reason_code_id                uuid,
    dimension_set_id              bigint NOT NULL DEFAULT 0,
    invoice_discount_calculation  text NOT NULL DEFAULT 'NONE' CHECK (invoice_discount_calculation IN ('NONE','PERCENT','AMOUNT')),
    invoice_discount_value        platform.amount NOT NULL DEFAULT 0,
    posting_no_series_id          uuid,
    amount                        platform.amount NOT NULL DEFAULT 0,
    amount_including_vat          platform.amount NOT NULL DEFAULT 0,
    vat_amount                    platform.amount NOT NULL DEFAULT 0,
    city_tax_amount               platform.amount NOT NULL DEFAULT 0,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid DEFAULT platform.current_user_id(),
    updated_at                    timestamptz,
    updated_by                    uuid,
    row_version                   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, payment_terms_id) REFERENCES party.payment_terms (company_id, id),
    FOREIGN KEY (company_id, payment_method_id) REFERENCES party.payment_method (company_id, id),
    FOREIGN KEY (company_id, vendor_posting_group_id) REFERENCES party.vendor_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, posting_no_series_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, customs_declaration_id) REFERENCES tax.customs_declaration (company_id, id),
    UNIQUE (company_id, document_type, no),
    UNIQUE (company_id, id),
    CHECK ((currency_code IS NULL) = (currency_factor IS NULL)),
    CHECK ((currency_code IS NULL) = (exchange_rate IS NULL)),
    CHECK (exchange_rate IS NULL OR (exchange_rate > 0 AND abs(currency_factor * exchange_rate - 1) <= 0.000000000001)),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (bal_account_type IS NULL OR bal_account_type IN ('GL_ACCOUNT','BANK_ACCOUNT')),
    CHECK (document_type = 'CREDIT_MEMO' OR corrected_invoice_id IS NULL)
);
CREATE INDEX ix_purchase_header__vendor ON purchase.purchase_header (company_id, vendor_id);
CREATE INDEX ix_purchase_header__vendor_invoice ON purchase.purchase_header (company_id, vendor_id, vendor_invoice_no) WHERE vendor_invoice_no IS NOT NULL;
CREATE INDEX ix_purchase_header__currency ON purchase.purchase_header (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_purchase_header__terms ON purchase.purchase_header (company_id, payment_terms_id);
CREATE INDEX ix_purchase_header__method ON purchase.purchase_header (company_id, payment_method_id);
CREATE INDEX ix_purchase_header__vpg ON purchase.purchase_header (company_id, vendor_posting_group_id);
CREATE INDEX ix_purchase_header__gbpg ON purchase.purchase_header (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_purchase_header__vbpg ON purchase.purchase_header (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_purchase_header__reason ON purchase.purchase_header (company_id, reason_code_id);
CREATE INDEX ix_purchase_header__dimension_set ON purchase.purchase_header (company_id, dimension_set_id);
CREATE INDEX ix_purchase_header__posting_nos ON purchase.purchase_header (company_id, posting_no_series_id);
CREATE INDEX ix_purchase_header__corrected ON purchase.purchase_header (company_id, corrected_invoice_id);
CREATE INDEX ix_purchase_header__receipt ON purchase.purchase_header (company_id, purchase_receipt_id);
CREATE INDEX ix_purchase_header__customs ON purchase.purchase_header (company_id, customs_declaration_id);
CREATE INDEX ix_purchase_header__keyset ON purchase.purchase_header (company_id, document_type, document_date, id);   -- CR #73
COMMENT ON TABLE purchase.purchase_header IS 'Mirrors BC table 38 Purchase Header for Invoice and Credit Memo drafts.';

CREATE TABLE purchase.purchase_line (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    purchase_header_id          uuid NOT NULL,
    line_no                     integer NOT NULL,
    line_type                   text NOT NULL CHECK (line_type IN ('COMMENT','GL_ACCOUNT','ITEM','FIXED_ASSET')),
    gl_account_id               uuid,
    item_id                     uuid,                      -- FK added in 110
    fixed_asset_id              uuid,                      -- FK added in 100 (acquisition)
    description                 text CHECK (char_length(description) <= 250),
    unit_of_measure_code        platform.code20,
    quantity                    platform.quantity NOT NULL DEFAULT 0,
    direct_unit_cost            platform.unit_amount NOT NULL DEFAULT 0,
    line_discount_percent       platform.percent NOT NULL DEFAULT 0,
    line_discount_amount        platform.amount NOT NULL DEFAULT 0,
    line_amount                 platform.amount NOT NULL DEFAULT 0,
    inv_discount_amount         platform.amount NOT NULL DEFAULT 0,
    amount                      platform.amount NOT NULL DEFAULT 0,
    amount_including_vat        platform.amount NOT NULL DEFAULT 0,
    vat_base_amount             platform.amount NOT NULL DEFAULT 0,
    vat_percent                 platform.percent NOT NULL DEFAULT 0,
    vat_calculation_type        platform.vat_calc_type NOT NULL DEFAULT 'NORMAL',
    vat_identifier              platform.code20,
    vat_difference              platform.amount NOT NULL DEFAULT 0,      -- to match the supplier receipt VAT
    non_deductible_vat_amount   platform.amount NOT NULL DEFAULT 0,      -- D-E5 non-registered: VAT into cost
    non_deductible_reason       text CHECK (non_deductible_reason IN ('NON_VAT_COMPANY','SIMPLIFIED_REGIME','REJECTED',
                                    'PASSENGER_CAR','PERSONAL_USE','EXEMPT_RELATED','NO_EBARIMT')),   -- CR #146 (FR-TAX-010, BR-PUR-46/97)
    appl_to_item_entry_no       bigint,                                  -- CR #103: return line -> inbound item ledger entry, FK in 110
    gen_bus_posting_group_id    uuid,
    gen_prod_posting_group_id   uuid,
    vat_bus_posting_group_id    uuid,
    vat_prod_posting_group_id   uuid,
    city_tax_code_id            uuid,
    city_tax_amount             platform.amount NOT NULL DEFAULT 0,
    depreciation_book_id        uuid,                                    -- FA acquisition (R2), FK added in 100
    location_id                 uuid,                                    -- FK added in 110
    dimension_set_id            bigint NOT NULL DEFAULT 0,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, purchase_header_id) REFERENCES purchase.purchase_header (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, gen_bus_posting_group_id) REFERENCES party.gen_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_prod_posting_group_id) REFERENCES party.gen_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, city_tax_code_id) REFERENCES tax.city_tax_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    UNIQUE (company_id, purchase_header_id, line_no),
    CHECK (quantity >= 0),
    CHECK ((line_type = 'GL_ACCOUNT') = (gl_account_id IS NOT NULL)),
    CHECK ((line_type = 'ITEM') = (item_id IS NOT NULL)),
    CHECK ((line_type = 'FIXED_ASSET') = (fixed_asset_id IS NOT NULL)),
    CHECK (non_deductible_reason IS NULL OR non_deductible_vat_amount <> 0)
);
CREATE INDEX ix_purchase_line__gl_account ON purchase.purchase_line (company_id, gl_account_id);
CREATE INDEX ix_purchase_line__item ON purchase.purchase_line (company_id, item_id);
CREATE INDEX ix_purchase_line__fixed_asset ON purchase.purchase_line (company_id, fixed_asset_id);
CREATE INDEX ix_purchase_line__gbpg ON purchase.purchase_line (company_id, gen_bus_posting_group_id);
CREATE INDEX ix_purchase_line__gppg ON purchase.purchase_line (company_id, gen_prod_posting_group_id);
CREATE INDEX ix_purchase_line__vbpg ON purchase.purchase_line (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_purchase_line__vppg ON purchase.purchase_line (company_id, vat_prod_posting_group_id);
CREATE INDEX ix_purchase_line__city_tax ON purchase.purchase_line (company_id, city_tax_code_id);
CREATE INDEX ix_purchase_line__depr_book ON purchase.purchase_line (company_id, depreciation_book_id);
CREATE INDEX ix_purchase_line__location ON purchase.purchase_line (company_id, location_id);
CREATE INDEX ix_purchase_line__dimension_set ON purchase.purchase_line (company_id, dimension_set_id);
COMMENT ON TABLE purchase.purchase_line IS 'Mirrors BC table 39 Purchase Line (G/L account, item, fixed asset acquisition).';

-- -----------------------------------------------------------------------------
-- Posted purchase documents (immutable)
-- -----------------------------------------------------------------------------
CREATE TABLE purchase.purch_inv_header (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    no                        platform.document_no NOT NULL,
    pre_assigned_no           platform.document_no,
    draft_id                  uuid,
    vendor_id                 uuid NOT NULL,
    vendor_no                 platform.code20 NOT NULL,
    vendor_name               text NOT NULL,
    vendor_tin                text CHECK (vendor_tin IS NULL OR vendor_tin !~ '^[0-9]{12,14}$'),   -- CR #44: no plaintext personal TIN
    vendor_invoice_no         platform.ext_document_no NOT NULL,
    supplier_ebarimt_id       platform.ddtd,
    supplier_ebarimt_date     timestamptz,                         -- CR #36
    customs_declaration_id    uuid,                                -- CR #152/#165
    posting_date              date NOT NULL,
    document_date             date NOT NULL,
    vat_date                  date NOT NULL,
    due_date                  date NOT NULL,
    prices_including_vat      boolean NOT NULL,
    currency_code             platform.currency_code,
    currency_factor           platform.exch_rate,
    exchange_rate             platform.exch_rate,                     -- CR #191
    payment_terms_code        platform.code20,
    payment_method_code       platform.code20,
    payment_transaction_no    bigint,                                 -- CR #153: G/L transaction of the immediate (cash) payment, МХ-2 reprint
    vendor_posting_group      platform.code20 NOT NULL,
    gen_bus_posting_group     platform.code20 NOT NULL,
    vat_bus_posting_group     platform.code20 NOT NULL,
    reason_code_id            uuid,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    amount                    platform.amount NOT NULL,
    amount_including_vat      platform.amount NOT NULL,
    vat_amount                platform.amount NOT NULL,
    city_tax_amount           platform.amount NOT NULL DEFAULT 0,
    invoice_discount_amount   platform.amount NOT NULL DEFAULT 0,
    amount_lcy                platform.amount NOT NULL,
    amount_including_vat_lcy  platform.amount NOT NULL,
    vendor_ledger_entry_no    bigint NOT NULL,
    transaction_no            bigint NOT NULL,
    gl_register_no            bigint NOT NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, payment_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK ((currency_code IS NULL) = (currency_factor IS NULL)),
    CHECK ((currency_code IS NULL) = (exchange_rate IS NULL)),
    CHECK (exchange_rate IS NULL OR abs(currency_factor * exchange_rate - 1) <= 0.000000000001)
);
CREATE INDEX ix_purch_inv_header__vendor ON purchase.purch_inv_header (company_id, vendor_id, posting_date);
CREATE INDEX ix_purch_inv_header__vendor_invoice ON purchase.purch_inv_header (company_id, vendor_id, vendor_invoice_no);
CREATE INDEX ix_purch_inv_header__date ON purchase.purch_inv_header (company_id, posting_date);
CREATE INDEX ix_purch_inv_header__currency ON purchase.purch_inv_header (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_purch_inv_header__reason ON purchase.purch_inv_header (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_purch_inv_header__dimension_set ON purchase.purch_inv_header (company_id, dimension_set_id);
CREATE INDEX ix_purch_inv_header__transaction ON purchase.purch_inv_header (company_id, transaction_no);
CREATE INDEX ix_purch_inv_header__register ON purchase.purch_inv_header (company_id, gl_register_no);
CREATE INDEX ix_purch_inv_header__vle ON purchase.purch_inv_header (company_id, vendor_ledger_entry_no);
CREATE INDEX ix_purch_inv_header__supplier_receipt ON purchase.purch_inv_header (company_id, supplier_ebarimt_id) WHERE supplier_ebarimt_id IS NOT NULL;
CREATE UNIQUE INDEX ux_purch_inv_header__draft ON purchase.purch_inv_header (company_id, draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX ix_purch_inv_header__keyset ON purchase.purch_inv_header (company_id, document_date, id);   -- CR #73
CREATE INDEX ix_purch_inv_header__payment_tx ON purchase.purch_inv_header (company_id, payment_transaction_no) WHERE payment_transaction_no IS NOT NULL;
CREATE INDEX ix_purch_inv_header__customs ON purchase.purch_inv_header (company_id, customs_declaration_id) WHERE customs_declaration_id IS NOT NULL;
ALTER TABLE purchase.purch_inv_header
    ADD FOREIGN KEY (company_id, customs_declaration_id) REFERENCES tax.customs_declaration (company_id, id);
COMMENT ON TABLE purchase.purch_inv_header IS 'Mirrors BC table 122 Purch. Inv. Header (posted, immutable).';

CREATE TABLE purchase.purch_inv_line (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    purch_inv_header_id       uuid NOT NULL,
    line_no                   integer NOT NULL,
    line_type                 text NOT NULL CHECK (line_type IN ('COMMENT','GL_ACCOUNT','ITEM','FIXED_ASSET')),
    gl_account_id             uuid,
    item_id                   uuid,
    fixed_asset_id            uuid,
    no                        platform.code20,
    description               text,
    unit_of_measure_code      platform.code20,
    quantity                  platform.quantity NOT NULL DEFAULT 0,
    direct_unit_cost          platform.unit_amount NOT NULL DEFAULT 0,
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
    non_deductible_vat_amount platform.amount NOT NULL DEFAULT 0,
    non_deductible_reason     text CHECK (non_deductible_reason IN ('NON_VAT_COMPANY','SIMPLIFIED_REGIME','REJECTED',
                                  'PASSENGER_CAR','PERSONAL_USE','EXEMPT_RELATED','NO_EBARIMT')),   -- CR #146 (copied 1:1 on cancel, BR-PUR-89)
    appl_to_item_entry_no     bigint,                                  -- CR #103, FK in 110
    tax_parameter_id          uuid REFERENCES tax.tax_parameter (id),  -- CR #161
    gen_bus_posting_group     platform.code20,
    gen_prod_posting_group    platform.code20,
    vat_bus_posting_group     platform.code20,
    vat_prod_posting_group    platform.code20,
    city_tax_code             platform.code20,
    city_tax_amount           platform.amount NOT NULL DEFAULT 0,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, purch_inv_header_id) REFERENCES purchase.purch_inv_header (company_id, id),
    FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    UNIQUE (company_id, purch_inv_header_id, line_no),
    CHECK (non_deductible_reason IS NULL OR non_deductible_vat_amount <> 0)
);
CREATE INDEX ix_purch_inv_line__gl_account ON purchase.purch_inv_line (company_id, gl_account_id);
CREATE INDEX ix_purch_inv_line__item ON purchase.purch_inv_line (company_id, item_id);
CREATE INDEX ix_purch_inv_line__fixed_asset ON purchase.purch_inv_line (company_id, fixed_asset_id);
CREATE INDEX ix_purch_inv_line__dimension_set ON purchase.purch_inv_line (company_id, dimension_set_id);
COMMENT ON TABLE purchase.purch_inv_line IS 'Mirrors BC table 123 Purch. Inv. Line (posted, immutable).';

CREATE TABLE purchase.purch_cr_memo_header (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    no                        platform.document_no NOT NULL,
    pre_assigned_no           platform.document_no,
    draft_id                  uuid,
    vendor_id                 uuid NOT NULL,
    vendor_no                 platform.code20 NOT NULL,
    vendor_name               text NOT NULL,
    vendor_tin                text CHECK (vendor_tin IS NULL OR vendor_tin !~ '^[0-9]{12,14}$'),   -- CR #44: no plaintext personal TIN
    vendor_cr_memo_no         platform.ext_document_no NOT NULL,
    supplier_ebarimt_id       platform.ddtd,                      -- supplier's return/correction receipt
    supplier_ebarimt_date     timestamptz,                        -- CR #36
    posting_date              date NOT NULL,
    document_date             date NOT NULL,
    vat_date                  date NOT NULL,
    due_date                  date NOT NULL,
    prices_including_vat      boolean NOT NULL,
    currency_code             platform.currency_code,
    currency_factor           platform.exch_rate,
    exchange_rate             platform.exch_rate,                     -- CR #191
    payment_terms_code        platform.code20,
    payment_method_code       platform.code20,
    payment_transaction_no    bigint,                                 -- CR #153: G/L transaction of the immediate (cash) payment, МХ-2 reprint
    vendor_posting_group      platform.code20 NOT NULL,
    gen_bus_posting_group     platform.code20 NOT NULL,
    vat_bus_posting_group     platform.code20 NOT NULL,
    applies_to_doc_type       platform.document_type,
    applies_to_doc_no         platform.document_no,
    corrected_invoice_id      uuid,
    reason_code_id            uuid,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    amount                    platform.amount NOT NULL,
    amount_including_vat      platform.amount NOT NULL,
    vat_amount                platform.amount NOT NULL,
    city_tax_amount           platform.amount NOT NULL DEFAULT 0,
    invoice_discount_amount   platform.amount NOT NULL DEFAULT 0,
    amount_lcy                platform.amount NOT NULL,
    amount_including_vat_lcy  platform.amount NOT NULL,
    vendor_ledger_entry_no    bigint NOT NULL,
    transaction_no            bigint NOT NULL,
    gl_register_no            bigint NOT NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, corrected_invoice_id) REFERENCES purchase.purch_inv_header (company_id, id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, payment_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK ((currency_code IS NULL) = (currency_factor IS NULL)),
    CHECK ((currency_code IS NULL) = (exchange_rate IS NULL)),
    CHECK (exchange_rate IS NULL OR abs(currency_factor * exchange_rate - 1) <= 0.000000000001)
);
CREATE INDEX ix_purch_cr_memo_header__vendor ON purchase.purch_cr_memo_header (company_id, vendor_id, posting_date);
CREATE INDEX ix_purch_cr_memo_header__date ON purchase.purch_cr_memo_header (company_id, posting_date);
CREATE INDEX ix_purch_cr_memo_header__currency ON purchase.purch_cr_memo_header (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_purch_cr_memo_header__corrected ON purchase.purch_cr_memo_header (company_id, corrected_invoice_id);
CREATE INDEX ix_purch_cr_memo_header__reason ON purchase.purch_cr_memo_header (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_purch_cr_memo_header__dimension_set ON purchase.purch_cr_memo_header (company_id, dimension_set_id);
CREATE INDEX ix_purch_cr_memo_header__transaction ON purchase.purch_cr_memo_header (company_id, transaction_no);
CREATE INDEX ix_purch_cr_memo_header__register ON purchase.purch_cr_memo_header (company_id, gl_register_no);
CREATE INDEX ix_purch_cr_memo_header__vle ON purchase.purch_cr_memo_header (company_id, vendor_ledger_entry_no);
CREATE UNIQUE INDEX ux_purch_cr_memo_header__draft ON purchase.purch_cr_memo_header (company_id, draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX ix_purch_cr_memo_header__keyset ON purchase.purch_cr_memo_header (company_id, document_date, id);   -- CR #73
CREATE INDEX ix_purch_cr_memo_header__payment_tx ON purchase.purch_cr_memo_header (company_id, payment_transaction_no) WHERE payment_transaction_no IS NOT NULL;
COMMENT ON TABLE purchase.purch_cr_memo_header IS 'Mirrors BC table 124 Purch. Cr. Memo Hdr. (posted, immutable).';

CREATE TABLE purchase.purch_cr_memo_line (LIKE purchase.purch_inv_line INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE purchase.purch_cr_memo_line RENAME COLUMN purch_inv_header_id TO purch_cr_memo_header_id;
ALTER TABLE purchase.purch_cr_memo_line
    ADD PRIMARY KEY (id),
    ADD FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    ADD FOREIGN KEY (company_id, purch_cr_memo_header_id) REFERENCES purchase.purch_cr_memo_header (company_id, id),
    ADD FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    ADD FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    ADD FOREIGN KEY (tax_parameter_id) REFERENCES tax.tax_parameter (id),
    ADD UNIQUE (company_id, purch_cr_memo_header_id, line_no);
CREATE INDEX ix_purch_cr_memo_line__gl_account ON purchase.purch_cr_memo_line (company_id, gl_account_id);
CREATE INDEX ix_purch_cr_memo_line__item ON purchase.purch_cr_memo_line (company_id, item_id);
CREATE INDEX ix_purch_cr_memo_line__fixed_asset ON purchase.purch_cr_memo_line (company_id, fixed_asset_id);
CREATE INDEX ix_purch_cr_memo_line__dimension_set ON purchase.purch_cr_memo_line (company_id, dimension_set_id);
COMMENT ON TABLE purchase.purch_cr_memo_line IS 'Mirrors BC table 125 Purch. Cr. Memo Line (posted, immutable).';

CREATE TABLE purchase.cancelled_document (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    cancelled_invoice_id      uuid NOT NULL,
    cancelled_by_cr_memo_id   uuid NOT NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, cancelled_invoice_id) REFERENCES purchase.purch_inv_header (company_id, id),
    FOREIGN KEY (company_id, cancelled_by_cr_memo_id) REFERENCES purchase.purch_cr_memo_header (company_id, id),
    UNIQUE (company_id, cancelled_invoice_id),
    UNIQUE (company_id, cancelled_by_cr_memo_id)
);
ALTER TABLE purchase.purchase_header
    ADD FOREIGN KEY (company_id, corrected_invoice_id) REFERENCES purchase.purch_inv_header (company_id, id);
ALTER TABLE purchase.purch_inv_header
    ADD FOREIGN KEY (company_id, vendor_ledger_entry_no) REFERENCES party.vendor_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE purchase.purch_cr_memo_header
    ADD FOREIGN KEY (company_id, vendor_ledger_entry_no) REFERENCES party.vendor_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE purchase.cancelled_document IS 'Mirrors BC table 1900 Cancelled Document for purchase invoices.';
