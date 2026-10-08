-- =============================================================================
-- 040_tax.sql
-- VAT (BC tables 323, 324, 325, 254, 253, 255-257, 737), city tax (НХАТ, D-E6) and the
-- global effective-dated statutory parameter table (D-E7).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- -----------------------------------------------------------------------------
-- Statutory parameters (GLOBAL, not tenant-scoped). Seed: db/seed/legal_parameters.sql
-- -----------------------------------------------------------------------------
CREATE TABLE tax.tax_parameter (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    param_code     text NOT NULL CHECK (param_code ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),   -- e.g. vat.standard_rate
    description    text NOT NULL,
    value_numeric  numeric,
    value_text     text,
    unit           text NOT NULL,                          -- ratio, MNT, years, months, flag, url, ...
    applies_to     text,
    effective_from date NOT NULL,
    effective_to   date,                                   -- NULL = open-ended
    legal_basis    text,
    source_url     text,
    confidence     text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
    status         text NOT NULL DEFAULT 'unverified' CHECK (status IN ('verified','unverified','superseded')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    EXCLUDE USING gist (param_code WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);
COMMENT ON TABLE tax.tax_parameter IS 'Global effective-dated statutory parameters (rates, thresholds, deadlines; D-E7, ADR-0021). No BC equivalent (BC hard-codes or uses VAT Rate Change). Values lower-case to match the generated seed. Rows with status unverified must not drive postings.';

-- -----------------------------------------------------------------------------
-- VAT posting groups and setup
-- -----------------------------------------------------------------------------
CREATE TABLE tax.vat_bus_posting_group (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    code           platform.code20 NOT NULL,          -- DOMESTIC, FOREIGN, NONVAT_PARTY
    description    text NOT NULL,
    description_en text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    updated_at     timestamptz,
    updated_by     uuid,
    row_version    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE tax.vat_bus_posting_group IS 'Mirrors BC table 323 VAT Business Posting Group (party VAT class).';

CREATE TABLE tax.vat_prod_posting_group (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    code           platform.code20 NOT NULL,          -- VAT10, VAT0, EXEMPT, NOVAT, IMPORT_SERVICE, CUSTOMS_VAT (D-E2)
    description    text NOT NULL,
    description_en text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    updated_at     timestamptz,
    updated_by     uuid,
    row_version    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE tax.vat_prod_posting_group IS 'Mirrors BC table 324 VAT Product Posting Group (item/service VAT class).';

CREATE TABLE tax.vat_posting_setup (
    id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                    uuid NOT NULL,
    company_id                   uuid NOT NULL,
    vat_bus_posting_group_id     uuid NOT NULL,
    vat_prod_posting_group_id    uuid NOT NULL,
    vat_calculation_type         platform.vat_calc_type NOT NULL DEFAULT 'NORMAL',
    vat_identifier               platform.code20 NOT NULL,      -- grouping key of the document VAT calculation
    vat_category                 text NOT NULL CHECK (vat_category IN ('VAT10','VAT0','EXEMPT','NOVAT')),  -- D-E2
    vat_percent                  platform.percent NOT NULL DEFAULT 0,
    vat_rate_param_code          text,                          -- optional link to tax.tax_parameter (effective-dated rate)
    sales_vat_account_id         uuid,
    purchase_vat_account_id      uuid,
    reverse_chrg_vat_account_id  uuid,
    non_deductible_vat_percent   platform.percent NOT NULL DEFAULT 0,   -- 100 for non-VAT-registered companies (D-E5)
    ebarimt_tax_type             platform.ebarimt_tax_type NOT NULL,
    ebarimt_tax_product_code     text CHECK (ebarimt_tax_product_code ~ '^[0-9A-Za-z]{1,10}$'),
    vat_clause_text              text,
    blocked                      boolean NOT NULL DEFAULT false,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid DEFAULT platform.current_user_id(),
    updated_at                   timestamptz,
    updated_by                   uuid,
    row_version                  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, sales_vat_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, purchase_vat_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, reverse_chrg_vat_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, vat_bus_posting_group_id, vat_prod_posting_group_id),
    UNIQUE (company_id, id),
    CHECK (vat_calculation_type <> 'REVERSE_CHARGE' OR reverse_chrg_vat_account_id IS NOT NULL),
    CHECK (ebarimt_tax_type = 'VAT_ABLE' OR vat_percent = 0),
    -- D-E2 mapping of VAT category to eBarimt taxType (NOVAT: NOT_VAT or VAT_FREE pending СМТТ, D-E5)
    CHECK ((vat_category = 'VAT10'  AND ebarimt_tax_type = 'VAT_ABLE')
        OR (vat_category = 'VAT0'   AND ebarimt_tax_type = 'VAT_ZERO')
        OR (vat_category = 'EXEMPT' AND ebarimt_tax_type = 'VAT_FREE')
        OR (vat_category = 'NOVAT'  AND ebarimt_tax_type IN ('NOT_VAT','VAT_FREE'))),
    CHECK (ebarimt_tax_type = 'VAT_ABLE' OR vat_calculation_type <> 'NORMAL' OR ebarimt_tax_product_code IS NOT NULL
           OR vat_category = 'NOVAT')
);
CREATE INDEX ix_vat_posting_setup__prod ON tax.vat_posting_setup (company_id, vat_prod_posting_group_id);
CREATE INDEX ix_vat_posting_setup__sales_acc ON tax.vat_posting_setup (company_id, sales_vat_account_id);
CREATE INDEX ix_vat_posting_setup__purch_acc ON tax.vat_posting_setup (company_id, purchase_vat_account_id);
CREATE INDEX ix_vat_posting_setup__rc_acc ON tax.vat_posting_setup (company_id, reverse_chrg_vat_account_id);
COMMENT ON TABLE tax.vat_posting_setup IS 'Mirrors BC table 325 VAT Posting Setup (VAT Bus. x VAT Prod. matrix: calc type, %, identifier, accounts) plus eBarimt taxType/taxProductCode mapping.';

-- -----------------------------------------------------------------------------
-- VAT return periods and statement templates
-- -----------------------------------------------------------------------------
CREATE TABLE tax.vat_return_period (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    starting_date             date NOT NULL,
    ending_date               date NOT NULL,
    due_date                  date,
    status                    text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','SUBMITTED')),
    settlement_transaction_no bigint,                 -- VAT settlement voucher (source code VATSTMT)
    city_tax_settlement_transaction_no bigint,        -- CR #166 (BR-TAX-95, R2): CITYTAXSTMT voucher, undone on :reopen
    submitted_at              timestamptz,
    submitted_by              uuid,
    submission_reference      text,                   -- e-tax receipt number (ТТ-03а)
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, settlement_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, city_tax_settlement_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    UNIQUE (company_id, starting_date),
    UNIQUE (company_id, id),
    CHECK (ending_date >= starting_date),
    CHECK (status <> 'SUBMITTED' OR submitted_at IS NOT NULL),
    EXCLUDE USING gist (company_id WITH =, daterange(starting_date, ending_date, '[]') WITH &&)
);
CREATE INDEX ix_vat_return_period__settlement ON tax.vat_return_period (company_id, settlement_transaction_no);
CREATE INDEX ix_vat_return_period__city_tax_settlement ON tax.vat_return_period (company_id, city_tax_settlement_transaction_no)
    WHERE city_tax_settlement_transaction_no IS NOT NULL;
COMMENT ON TABLE tax.vat_return_period IS 'Mirrors BC table 737 VAT Return Period (monthly). VAT dates must fall in an OPEN period (D-E9); SUBMITTED = filed, final.';

CREATE TABLE tax.vat_statement_template (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    code           platform.code20 NOT NULL,
    description    text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    updated_at     timestamptz,
    updated_by     uuid,
    row_version    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE tax.vat_statement_template IS 'Mirrors BC table 255 VAT Statement Template.';

CREATE TABLE tax.vat_statement_name (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    vat_statement_template_id  uuid NOT NULL,
    code                       platform.code20 NOT NULL,       -- e.g. TT03A
    description                text NOT NULL,
    form_code                  text,                           -- ТТ-03а
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    updated_at                 timestamptz,
    updated_by                 uuid,
    row_version                integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vat_statement_template_id) REFERENCES tax.vat_statement_template (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, vat_statement_template_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE tax.vat_statement_name IS 'Mirrors BC table 257 VAT Statement Name (one layout, e.g. ТТ-03а).';

CREATE TABLE tax.vat_statement_line (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    vat_statement_name_id      uuid NOT NULL,
    line_no                    integer NOT NULL,
    row_no                     text CHECK (char_length(row_no) <= 10),
    description                text CHECK (char_length(description) <= 250),
    line_type                  text NOT NULL CHECK (line_type IN ('ACCOUNT_TOTALING','VAT_ENTRY_TOTALING','ROW_TOTALING','DESCRIPTION')),
    account_totaling           text CHECK (char_length(account_totaling) <= 250),
    gen_posting_type           platform.gen_posting_type,
    vat_bus_posting_group_id   uuid,
    vat_prod_posting_group_id  uuid,
    vat_category               text CHECK (vat_category IN ('VAT10','VAT0','EXEMPT','NOVAT')),
    row_totaling              text CHECK (char_length(row_totaling) <= 250),
    amount_type                text NOT NULL DEFAULT 'NONE'
                               CHECK (amount_type IN ('NONE','AMOUNT','BASE','NON_DEDUCTIBLE_AMOUNT','NON_DEDUCTIBLE_BASE',
                                                      'FULL_AMOUNT','FULL_BASE')),
    only_deductible_confirmed  boolean NOT NULL DEFAULT false,      -- D-E4: purchase VAT only when the receipt is confirmed
    calculate_with             text NOT NULL DEFAULT 'SIGN' CHECK (calculate_with IN ('SIGN','OPPOSITE_SIGN')),
    print                      boolean NOT NULL DEFAULT true,
    print_with                 text NOT NULL DEFAULT 'SIGN' CHECK (print_with IN ('SIGN','OPPOSITE_SIGN')),
    box_no                     text CHECK (char_length(box_no) <= 30),   -- ТТ-03а row reference
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    updated_at                 timestamptz,
    updated_by                 uuid,
    row_version                integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vat_statement_name_id) REFERENCES tax.vat_statement_name (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id),
    UNIQUE (company_id, vat_statement_name_id, line_no),
    CHECK (line_type <> 'ACCOUNT_TOTALING' OR account_totaling IS NOT NULL),
    CHECK (line_type <> 'ROW_TOTALING' OR row_totaling IS NOT NULL),
    CHECK (line_type <> 'VAT_ENTRY_TOTALING' OR (gen_posting_type IS NOT NULL AND amount_type <> 'NONE'))
);
CREATE INDEX ix_vat_statement_line__bus ON tax.vat_statement_line (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_vat_statement_line__prod ON tax.vat_statement_line (company_id, vat_prod_posting_group_id);
COMMENT ON TABLE tax.vat_statement_line IS 'Mirrors BC table 256 VAT Statement Line (types Account Totaling / VAT Entry Totaling / Row Totaling / Description). Rows map to ТТ-03а lines (D-E8).';
-- CR #172 (Z-TAX-10): unlike BC (blank = only blank), a NULL filter column means "any value" (seed contract).
COMMENT ON COLUMN tax.vat_statement_line.vat_bus_posting_group_id IS 'VAT Entry Totaling filter. NULL = any VAT business posting group (differs from BC, where blank matches only blank).';
COMMENT ON COLUMN tax.vat_statement_line.vat_prod_posting_group_id IS 'VAT Entry Totaling filter. NULL = any VAT product posting group (differs from BC, where blank matches only blank).';
COMMENT ON COLUMN tax.vat_statement_line.vat_category IS 'VAT Entry Totaling filter on vat_entry.vat_category. NULL = any category.';

-- -----------------------------------------------------------------------------
-- Customs declarations (CR #165 CR-TAX-05 merged with 07 SCR-PUR-07): evidence for FULL_VAT import VAT and the
-- customs value of ТТ-03а-5 section Б. vendor / currency FKs are added in 050 / 060.
-- -----------------------------------------------------------------------------
CREATE TABLE tax.customs_declaration (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    declaration_no       text NOT NULL CHECK (char_length(declaration_no) BETWEEN 1 AND 35),
    declaration_date     date NOT NULL,
    customs_office_code  text CHECK (char_length(customs_office_code) <= 20),
    vendor_id            uuid,                                   -- the customs authority vendor (CUSTOMS template), FK in 060
    currency_code        platform.currency_code,                 -- invoice currency of the goods, FK in 050
    exchange_rate        platform.exch_rate CHECK (exchange_rate > 0),   -- customs rate, MNT per 1 FCY
    customs_value        platform.amount NOT NULL DEFAULT 0,     -- MNT
    customs_duty         platform.amount NOT NULL DEFAULT 0,
    excise_tax           platform.amount NOT NULL DEFAULT 0,
    vat_base             platform.amount NOT NULL DEFAULT 0,
    vat_amount           platform.amount NOT NULL DEFAULT 0,
    note                 text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    updated_at           timestamptz,
    updated_by           uuid,
    row_version          integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, declaration_no),
    UNIQUE (company_id, id),
    CHECK ((currency_code IS NULL) = (exchange_rate IS NULL))
);
COMMENT ON TABLE tax.customs_declaration IS 'Import customs declaration (гаалийн мэдүүлэг): customs value, duty, excise, VAT base and VAT (CR #165, #152; BR-TAX-62). Referenced by purchase documents and FULL_VAT VAT entries. No BC equivalent.';

-- -----------------------------------------------------------------------------
-- VAT ledger
-- -----------------------------------------------------------------------------
CREATE TABLE tax.vat_entry (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    entry_no                   bigint NOT NULL CHECK (entry_no > 0),
    entry_type                 text NOT NULL CHECK (entry_type IN ('SALE','PURCHASE','SETTLEMENT')),
    posting_date               date NOT NULL,
    vat_date                   date NOT NULL,                       -- VAT Reporting Date (D-E9)
    document_date              date,
    document_type              platform.document_type NOT NULL DEFAULT 'NONE',
    document_no                platform.document_no NOT NULL,
    external_document_no       platform.ext_document_no,
    base                       platform.amount NOT NULL,            -- signed like BC: sale base < 0, purchase base > 0
    amount                     platform.amount NOT NULL,            -- VAT amount, signed
    non_deductible_base        platform.amount NOT NULL DEFAULT 0,
    non_deductible_amount      platform.amount NOT NULL DEFAULT 0,
    vat_difference             platform.amount NOT NULL DEFAULT 0,
    vat_calculation_type       platform.vat_calc_type NOT NULL,
    vat_percent                platform.percent NOT NULL,           -- rate snapshot (BC has no rate field)
    vat_identifier             platform.code20,
    vat_category               text CHECK (vat_category IN ('VAT10','VAT0','EXEMPT','NOVAT')),
    vat_bus_posting_group      platform.code20,                     -- snapshot codes
    vat_prod_posting_group     platform.code20,
    gen_bus_posting_group      platform.code20,
    gen_prod_posting_group     platform.code20,
    ebarimt_tax_type           platform.ebarimt_tax_type,
    bill_to_pay_to_type        text CHECK (bill_to_pay_to_type IN ('CUSTOMER','VENDOR')),
    bill_to_pay_to_id          uuid,
    bill_to_pay_to_no          platform.code20,
    party_tin                  text,                                -- VAT Registration No. snapshot
    country_code               text CHECK (country_code ~ '^[A-Z]{2}$'),
    transaction_no             bigint NOT NULL,
    gl_register_no             bigint NOT NULL,
    gl_entry_no                bigint,                              -- base G/L entry (first link)
    closed                     boolean NOT NULL DEFAULT false,      -- whitelisted update (settlement)
    closed_by_entry_no         bigint,                              -- whitelisted update
    vat_return_period_id       uuid,                                -- whitelisted update (set on settlement)
    deductible_confirmed       boolean NOT NULL DEFAULT false,      -- D-E4, whitelisted update
    deductible_confirmed_at    timestamptz,
    deductible_confirmed_by    uuid,
    supplier_ebarimt_id        platform.ddtd,                       -- supplier receipt ДДТД (purchase), whitelisted
    non_deductible_reason      text CHECK (non_deductible_reason IN ('NON_VAT_COMPANY','SIMPLIFIED_REGIME','REJECTED',
                                   'PASSENGER_CAR','PERSONAL_USE','EXEMPT_RELATED','NO_EBARIMT')),   -- CR #162 (BR-TAX-25/51/52, ТТ-03а row 11)
    tax_parameter_id           uuid REFERENCES tax.tax_parameter (id),   -- CR #120/#161 (FR-TAX-003 AC1): statutory parameter row that produced vat_percent
    excluded_from_turnover     boolean NOT NULL DEFAULT false,      -- CR #167 (BR-TAX-83): snapshot of gen_prod_posting_group.exclude_from_vat_turnover
    customs_declaration_id     uuid,                                -- CR #165: import VAT evidence (whitelisted: the declaration may arrive later)
    source_code                platform.code20 NOT NULL REFERENCES platform.source_code (code),
    reason_code_id             uuid,
    reversed                   boolean NOT NULL DEFAULT false,
    reversed_by_entry_no       bigint,
    reversed_entry_no          bigint,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, customs_declaration_id) REFERENCES tax.customs_declaration (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, gl_entry_no) REFERENCES gl.gl_entry (company_id, entry_no),
    FOREIGN KEY (company_id, closed_by_entry_no) REFERENCES tax.vat_entry (company_id, entry_no),
    FOREIGN KEY (company_id, vat_return_period_id) REFERENCES tax.vat_return_period (company_id, id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, reversed_entry_no) REFERENCES tax.vat_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_by_entry_no) REFERENCES tax.vat_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id),
    CHECK (entry_type <> 'PURCHASE' OR NOT deductible_confirmed OR supplier_ebarimt_id IS NOT NULL
           OR vat_calculation_type <> 'NORMAL'),
    CHECK (NOT closed OR closed_by_entry_no IS NOT NULL OR entry_type = 'SETTLEMENT'),
    -- CR #174/#177 (CR-TAX-14; BR-TAX-24/25/46/62/73)
    CHECK (vat_calculation_type <> 'FULL_VAT' OR base = 0),
    CHECK (entry_type <> 'SALE' OR (non_deductible_base = 0 AND non_deductible_amount = 0)),
    CHECK (entry_type <> 'SETTLEMENT' OR closed),
    CHECK (entry_type <> 'PURCHASE' OR vat_calculation_type <> 'FULL_VAT' OR amount = 0
           OR (deductible_confirmed AND external_document_no IS NOT NULL AND document_date IS NOT NULL)),
    -- CR #162: a non-deductible part always carries its reason, and a reason only a non-deductible part
    CHECK ((non_deductible_reason IS NOT NULL) = (non_deductible_amount <> 0 OR non_deductible_base <> 0))
);
CREATE INDEX ix_vat_entry__vat_date ON tax.vat_entry (company_id, vat_date, entry_type) INCLUDE (base, amount, closed);
CREATE INDEX ix_vat_entry__open ON tax.vat_entry (company_id, entry_type, vat_date) WHERE NOT closed;
CREATE INDEX ix_vat_entry__transaction ON tax.vat_entry (company_id, transaction_no);
CREATE INDEX ix_vat_entry__register ON tax.vat_entry (company_id, gl_register_no);
CREATE INDEX ix_vat_entry__gl_entry ON tax.vat_entry (company_id, gl_entry_no);
CREATE INDEX ix_vat_entry__document ON tax.vat_entry (company_id, document_no, posting_date);
CREATE INDEX ix_vat_entry__party ON tax.vat_entry (company_id, bill_to_pay_to_type, bill_to_pay_to_id);
CREATE INDEX ix_vat_entry__closed_by ON tax.vat_entry (company_id, closed_by_entry_no) WHERE closed_by_entry_no IS NOT NULL;
CREATE INDEX ix_vat_entry__period ON tax.vat_entry (company_id, vat_return_period_id);
CREATE INDEX ix_vat_entry__reason ON tax.vat_entry (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_vat_entry__reversed_entry ON tax.vat_entry (company_id, reversed_entry_no) WHERE reversed_entry_no IS NOT NULL;
CREATE INDEX ix_vat_entry__reversed_by ON tax.vat_entry (company_id, reversed_by_entry_no) WHERE reversed_by_entry_no IS NOT NULL;
-- Not unique: one supplier receipt yields one VAT entry per VAT identifier (VAT_ABLE + VAT_FREE items) and a
-- purchase credit memo carries the receipt it corrects. "One receipt is booked once" is enforced on
-- ebarimt.purchase_receipt UNIQUE (company_id, ddtd) and its purch_inv_header_id link.
CREATE INDEX ix_vat_entry__supplier_receipt ON tax.vat_entry (company_id, supplier_ebarimt_id)
    WHERE supplier_ebarimt_id IS NOT NULL;
CREATE INDEX ix_vat_entry__customs ON tax.vat_entry (company_id, customs_declaration_id) WHERE customs_declaration_id IS NOT NULL;
CREATE INDEX ix_vat_entry__tax_parameter ON tax.vat_entry (tax_parameter_id) WHERE tax_parameter_id IS NOT NULL;
COMMENT ON TABLE tax.vat_entry IS 'Mirrors BC table 254 VAT Entry (VAT subledger). Append-only; only closed/closed_by/period/deductible/reversal columns change via platform.fn_ledger_update. Adds rate snapshot and eBarimt deduction fields (D-E4).';

CREATE TABLE tax.gl_entry_vat_entry_link (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL,
    company_id    uuid NOT NULL,
    gl_entry_no   bigint NOT NULL,
    vat_entry_no  bigint NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, gl_entry_no) REFERENCES gl.gl_entry (company_id, entry_no),
    FOREIGN KEY (company_id, vat_entry_no) REFERENCES tax.vat_entry (company_id, entry_no),
    UNIQUE (company_id, gl_entry_no, vat_entry_no)
);
CREATE INDEX ix_gl_entry_vat_entry_link__vat ON tax.gl_entry_vat_entry_link (company_id, vat_entry_no);
COMMENT ON TABLE tax.gl_entry_vat_entry_link IS 'Mirrors BC table 253 G/L Entry - VAT Entry Link (used by reversal and drill-down). Append-only.';

-- -----------------------------------------------------------------------------
-- City tax (НХАТ) - schema in R1, functionality in R2 (D-E6)
-- -----------------------------------------------------------------------------
CREATE TABLE tax.city_tax_code (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    code                platform.code20 NOT NULL,          -- CT2 (2 %), NONE
    description         text NOT NULL,
    rate_percent        platform.percent NOT NULL,
    rate_param_code     text,                              -- e.g. city_tax.rate_ub in tax.tax_parameter
    base_type           text NOT NULL DEFAULT 'NET_EXCL_VAT' CHECK (base_type IN ('NET_EXCL_VAT')),
    payable_account_id  uuid,                              -- НХАТ өглөг
    expense_account_id  uuid,                              -- when absorbed by the buyer (purchase side)
    effective_from      date NOT NULL DEFAULT DATE '2000-01-01',
    effective_to        date,
    blocked             boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid DEFAULT platform.current_user_id(),
    updated_at          timestamptz,
    updated_by          uuid,
    row_version         integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, payable_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, expense_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_city_tax_code__payable ON tax.city_tax_code (company_id, payable_account_id);
CREATE INDEX ix_city_tax_code__expense ON tax.city_tax_code (company_id, expense_account_id);
COMMENT ON TABLE tax.city_tax_code IS 'City tax (НХАТ) code: rate and accounts. Separate tax line from VAT (D-E6); base = net amount excl. VAT. No BC equivalent (closest: Sales Tax jurisdiction).';

CREATE TABLE tax.city_tax_setup (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL,
    enabled                  boolean NOT NULL DEFAULT false,
    default_city_tax_code_id uuid,
    settlement_account_id    uuid,                         -- clearing account for the monthly city tax settlement
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    updated_at               timestamptz,
    updated_by               uuid,
    row_version              integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, default_city_tax_code_id) REFERENCES tax.city_tax_code (company_id, id),
    FOREIGN KEY (company_id, settlement_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id)
);
CREATE INDEX ix_city_tax_setup__code ON tax.city_tax_setup (company_id, default_city_tax_code_id);
CREATE INDEX ix_city_tax_setup__account ON tax.city_tax_setup (company_id, settlement_account_id);
COMMENT ON TABLE tax.city_tax_setup IS 'Company switch and defaults for city tax (НХАТ); active only when company_setup.city_tax_payer = true (R2).';

CREATE TABLE tax.city_tax_entry (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL,
    company_id             uuid NOT NULL,
    entry_no               bigint NOT NULL CHECK (entry_no > 0),
    entry_type             text NOT NULL CHECK (entry_type IN ('SALE','PURCHASE','SETTLEMENT')),
    city_tax_code_id       uuid NOT NULL,
    posting_date           date NOT NULL,
    tax_date               date NOT NULL,
    document_type          platform.document_type NOT NULL DEFAULT 'NONE',
    document_no            platform.document_no NOT NULL,
    base                   platform.amount NOT NULL,
    amount                 platform.amount NOT NULL,
    rate_percent           platform.percent NOT NULL,
    tax_parameter_id       uuid REFERENCES tax.tax_parameter (id),     -- CR #161: parameter row that produced rate_percent
    vat_return_period_id   uuid,                                       -- CR #166: settlement period (whitelisted, like vat_entry)
    bill_to_pay_to_type    text CHECK (bill_to_pay_to_type IN ('CUSTOMER','VENDOR')),
    bill_to_pay_to_id      uuid,
    transaction_no         bigint NOT NULL,
    gl_register_no         bigint NOT NULL,
    gl_entry_no            bigint,
    closed                 boolean NOT NULL DEFAULT false,
    closed_by_entry_no     bigint,
    source_code            platform.code20 NOT NULL REFERENCES platform.source_code (code),
    reversed               boolean NOT NULL DEFAULT false,
    reversed_by_entry_no   bigint,
    reversed_entry_no      bigint,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, city_tax_code_id) REFERENCES tax.city_tax_code (company_id, id),
    FOREIGN KEY (company_id, vat_return_period_id) REFERENCES tax.vat_return_period (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, gl_entry_no) REFERENCES gl.gl_entry (company_id, entry_no),
    FOREIGN KEY (company_id, closed_by_entry_no) REFERENCES tax.city_tax_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_entry_no) REFERENCES tax.city_tax_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_by_entry_no) REFERENCES tax.city_tax_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_city_tax_entry__date ON tax.city_tax_entry (company_id, tax_date, entry_type);
CREATE INDEX ix_city_tax_entry__code ON tax.city_tax_entry (company_id, city_tax_code_id);
CREATE INDEX ix_city_tax_entry__transaction ON tax.city_tax_entry (company_id, transaction_no);
CREATE INDEX ix_city_tax_entry__register ON tax.city_tax_entry (company_id, gl_register_no);
CREATE INDEX ix_city_tax_entry__gl_entry ON tax.city_tax_entry (company_id, gl_entry_no);
CREATE INDEX ix_city_tax_entry__closed_by ON tax.city_tax_entry (company_id, closed_by_entry_no) WHERE closed_by_entry_no IS NOT NULL;
CREATE INDEX ix_city_tax_entry__reversed_entry ON tax.city_tax_entry (company_id, reversed_entry_no) WHERE reversed_entry_no IS NOT NULL;
CREATE INDEX ix_city_tax_entry__reversed_by ON tax.city_tax_entry (company_id, reversed_by_entry_no) WHERE reversed_by_entry_no IS NOT NULL;
CREATE INDEX ix_city_tax_entry__period ON tax.city_tax_entry (company_id, vat_return_period_id) WHERE vat_return_period_id IS NOT NULL;
COMMENT ON TABLE tax.city_tax_entry IS 'City tax (НХАТ) ledger, modelled on BC table 254 VAT Entry. Append-only (R2 functionality).';

-- -----------------------------------------------------------------------------
-- Tax setup (CR #163 CR-TAX-03): settlement / CIT accounts instead of passing them in each :close request
-- -----------------------------------------------------------------------------
CREATE TABLE tax.tax_setup (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL,
    company_id                      uuid NOT NULL,
    vat_settlement_account_id       uuid,          -- 2310 НӨАТ-ын тооцоо
    simplified_vat_gain_account_id  uuid,          -- 8200 (simplified VAT regime gain, BR-TAX-100)
    cit_expense_account_id          uuid,          -- 9100 (R2 CIT helper)
    cit_payable_account_id          uuid,          -- 2330
    settlement_journal_template_id  uuid,          -- default GENERAL (posting series GJ)
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid DEFAULT platform.current_user_id(),
    updated_at                      timestamptz,
    updated_by                      uuid,
    row_version                     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vat_settlement_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, simplified_vat_gain_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, cit_expense_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, cit_payable_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, settlement_journal_template_id) REFERENCES gl.journal_template (company_id, id),
    UNIQUE (company_id)
);
CREATE INDEX ix_tax_setup__settlement ON tax.tax_setup (company_id, vat_settlement_account_id);
CREATE INDEX ix_tax_setup__simplified ON tax.tax_setup (company_id, simplified_vat_gain_account_id);
CREATE INDEX ix_tax_setup__cit_expense ON tax.tax_setup (company_id, cit_expense_account_id);
CREATE INDEX ix_tax_setup__cit_payable ON tax.tax_setup (company_id, cit_payable_account_id);
CREATE INDEX ix_tax_setup__template ON tax.tax_setup (company_id, settlement_journal_template_id);
COMMENT ON TABLE tax.tax_setup IS 'Company tax setup (VAT settlement account, simplified-VAT gain, CIT accounts, settlement journal template), CR #163. Simplified counterpart of the BC VAT settlement report options (pitfall 11: account no longer passed per request).';

-- -----------------------------------------------------------------------------
-- Effective-dated company tax profile (CR #164 CR-TAX-04, ADR-0021 #2): VAT registration / deregistration and regime
-- history. platform.company_setup.vat_registered / vat_registered_from become a cache of the row valid today.
-- -----------------------------------------------------------------------------
CREATE TABLE tax.company_tax_profile (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL,
    company_id              uuid NOT NULL,
    valid_from              date NOT NULL,
    valid_to                date,
    vat_status              text NOT NULL CHECK (vat_status IN ('STANDARD','SIMPLIFIED','NOT_REGISTERED')),
    vat_return_frequency    text NOT NULL DEFAULT 'MONTHLY' CHECK (vat_return_frequency IN ('MONTHLY','QUARTERLY')),
    simplified_base         text CHECK (simplified_base IN ('VAT_EXCLUSIVE','VAT_INCLUSIVE')),
    cit_regime              text NOT NULL DEFAULT 'STANDARD' CHECK (cit_regime IN ('STANDARD','CREDIT_90','ONE_PERCENT','SIMPLIFIED_ANNUAL')),
    excluded_activity_code  text,
    note                    text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid DEFAULT platform.current_user_id(),
    updated_at              timestamptz,
    updated_by              uuid,
    row_version             integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, id),
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CHECK ((vat_status = 'SIMPLIFIED') = (simplified_base IS NOT NULL)),
    EXCLUDE USING gist (company_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&)
);
COMMENT ON TABLE tax.company_tax_profile IS 'Effective-dated tax profile of a company (VAT status STANDARD / SIMPLIFIED / NOT_REGISTERED, return frequency, CIT regime), CR #164. company_setup.vat_registered(_from) is maintained from the row valid on the current date (tax.fn_sync_company_vat_status; the daily tax.vat_threshold.check job re-syncs).';

CREATE FUNCTION tax.fn_sync_company_vat_status(p_company_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_today date := (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date;
    v_reg   boolean;
    v_from  date;
BEGIN
    SELECT p.vat_status <> 'NOT_REGISTERED' INTO v_reg
      FROM tax.company_tax_profile p
     WHERE p.company_id = p_company_id AND v_today BETWEEN p.valid_from AND coalesce(p.valid_to, 'infinity'::date);
    IF NOT FOUND THEN
        RETURN;                                   -- no profile row for today: keep the R1 value of company_setup
    END IF;
    IF v_reg THEN
        -- start of the uninterrupted registered stretch that contains today
        WITH RECURSIVE stretch AS (
            SELECT p.valid_from FROM tax.company_tax_profile p
             WHERE p.company_id = p_company_id AND v_today BETWEEN p.valid_from AND coalesce(p.valid_to, 'infinity'::date)
            UNION ALL
            SELECT p.valid_from FROM tax.company_tax_profile p JOIN stretch s ON p.valid_to = s.valid_from - 1
             WHERE p.company_id = p_company_id AND p.vat_status <> 'NOT_REGISTERED')
        SELECT min(valid_from) INTO v_from FROM stretch;
    END IF;
    UPDATE platform.company_setup cs
       SET vat_registered = v_reg, vat_registered_from = CASE WHEN v_reg THEN v_from ELSE cs.vat_registered_from END
     WHERE cs.company_id = p_company_id
       AND (cs.vat_registered IS DISTINCT FROM v_reg OR (v_reg AND cs.vat_registered_from IS DISTINCT FROM v_from));
END $$;
COMMENT ON FUNCTION tax.fn_sync_company_vat_status(uuid) IS 'Refreshes the cache company_setup.vat_registered / vat_registered_from from tax.company_tax_profile (row valid today, Asia/Ulaanbaatar). Called by trigger and by the daily tax.vat_threshold.check job.';

CREATE FUNCTION tax.fn_company_tax_profile_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM tax.fn_sync_company_vat_status(coalesce(NEW.company_id, OLD.company_id));
    RETURN NULL;
END $$;
CREATE TRIGGER trg_company_tax_profile_sync AFTER INSERT OR UPDATE OR DELETE ON tax.company_tax_profile
    FOR EACH ROW EXECUTE FUNCTION tax.fn_company_tax_profile_sync();

-- -----------------------------------------------------------------------------
-- Filed ТТ-03а snapshot (CR #175 CR-TAX-15, mn-tax R19): immutable record written by :submit (ledger-guarded, 910)
-- -----------------------------------------------------------------------------
CREATE TABLE tax.vat_return_snapshot (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    vat_return_period_id  uuid NOT NULL,
    statement_name_code   platform.code20 NOT NULL,          -- e.g. TT03A
    rows                  jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),   -- [{line_no,row_no,value,printed}]
    scope_version         text,
    sha256                bytea NOT NULL CHECK (octet_length(sha256) = 32),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, vat_return_period_id) REFERENCES tax.vat_return_period (company_id, id),
    UNIQUE (company_id, vat_return_period_id)
);
COMMENT ON TABLE tax.vat_return_snapshot IS 'Immutable copy of each submitted VAT return (row values, template scope version, SHA-256), CR #175. Recalculation after template edits (R2) never changes a filed return. Append-only.';

-- Foreign keys from tables of 020
ALTER TABLE gl.gl_account
    ADD FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id);
CREATE INDEX ix_gl_account__vat_bus ON gl.gl_account (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_gl_account__vat_prod ON gl.gl_account (company_id, vat_prod_posting_group_id);

ALTER TABLE gl.journal_line
    ADD FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, bal_vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, bal_vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id);
CREATE INDEX ix_journal_line__vat_bus ON gl.journal_line (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_journal_line__vat_prod ON gl.journal_line (company_id, vat_prod_posting_group_id);
CREATE INDEX ix_journal_line__bal_vat_bus ON gl.journal_line (company_id, bal_vat_bus_posting_group_id);
CREATE INDEX ix_journal_line__bal_vat_prod ON gl.journal_line (company_id, bal_vat_prod_posting_group_id);

ALTER TABLE gl.standard_journal_line
    ADD FOREIGN KEY (company_id, vat_bus_posting_group_id) REFERENCES tax.vat_bus_posting_group (company_id, id),
    ADD FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id);
CREATE INDEX ix_standard_journal_line__vat_bus ON gl.standard_journal_line (company_id, vat_bus_posting_group_id);
CREATE INDEX ix_standard_journal_line__vat_prod ON gl.standard_journal_line (company_id, vat_prod_posting_group_id);
