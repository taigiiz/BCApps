-- =============================================================================
-- 020_gl.sql
-- General ledger: chart of accounts, categories, setup, fiscal calendar, journals,
-- transactions/registers and the immutable G/L entry ledger.
-- Foreign keys to tables created by later files (posting groups, currencies, dimensions,
-- statement lines) are added by those files with ALTER TABLE.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- -----------------------------------------------------------------------------
-- Chart of accounts
-- -----------------------------------------------------------------------------
CREATE TABLE gl.gl_account_category (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    parent_id                  uuid,
    code                       platform.code20 NOT NULL,
    description                text NOT NULL,
    description_en             text,
    account_category           text NOT NULL
                               CHECK (account_category IN ('ASSETS','LIABILITIES','EQUITY','INCOME','COGS','EXPENSE')),
    income_balance             text GENERATED ALWAYS AS
                               (CASE WHEN account_category IN ('INCOME','COGS','EXPENSE') THEN 'INCOME_STATEMENT'
                                     ELSE 'BALANCE_SHEET' END) STORED,
    additional_report_definition text NOT NULL DEFAULT 'NONE'
                               CHECK (additional_report_definition IN ('NONE','OPERATING','INVESTING','FINANCING',
                                      'CASH_ACCOUNTS','RETAINED_EARNINGS','DISTRIBUTION_TO_SHAREHOLDERS')),
    sort_order                 integer NOT NULL DEFAULT 0,
    system_generated           boolean NOT NULL DEFAULT false,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    updated_at                 timestamptz,
    updated_by                 uuid,
    row_version                integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, parent_id) REFERENCES gl.gl_account_category (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK (parent_id IS NULL OR parent_id <> id),
    CHECK (additional_report_definition = 'NONE' OR account_category IN ('ASSETS','LIABILITIES','EQUITY'))
);
CREATE INDEX ix_gl_account_category__parent ON gl.gl_account_category (company_id, parent_id);
COMMENT ON TABLE gl.gl_account_category IS 'Mirrors BC table 570 G/L Account Category (presentation tree; parent_id + sort_order instead of Presentation Order string).';

CREATE TABLE gl.gl_account (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    no                        platform.code20 NOT NULL,
    name                      text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    name_en                   text,
    search_name               text,
    account_type              text NOT NULL DEFAULT 'POSTING'
                              CHECK (account_type IN ('POSTING','HEADING','BEGIN_TOTAL','END_TOTAL','TOTAL')),
    income_balance            text NOT NULL CHECK (income_balance IN ('INCOME_STATEMENT','BALANCE_SHEET')),
    account_category          text CHECK (account_category IN ('ASSETS','LIABILITIES','EQUITY','INCOME','COGS','EXPENSE')),
    account_subcategory_id    uuid,                           -- -> gl_account_category
    normal_side               text NOT NULL DEFAULT 'BOTH' CHECK (normal_side IN ('BOTH','DEBIT','CREDIT')),  -- warning only (D-D1)
    totaling                  text CHECK (char_length(totaling) <= 250),  -- BC filter syntax, e.g. 1000..1999
    indentation               smallint NOT NULL DEFAULT 0 CHECK (indentation BETWEEN 0 AND 10),
    direct_posting            boolean NOT NULL DEFAULT true,
    blocked                   boolean NOT NULL DEFAULT false,
    reconciliation_account    boolean NOT NULL DEFAULT false,
    gen_posting_type          platform.gen_posting_type NOT NULL DEFAULT 'NONE',
    gen_bus_posting_group_id  uuid,                           -- FK added in 060
    gen_prod_posting_group_id uuid,                           -- FK added in 060
    vat_bus_posting_group_id  uuid,                           -- FK added in 040
    vat_prod_posting_group_id uuid,                           -- FK added in 040
    statement_line_id         uuid,                           -- e-balance Form A line, FK added in 120
    cash_flow_category_id     uuid,                           -- МГТ direct-method category, FK added in 120
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, account_subcategory_id) REFERENCES gl.gl_account_category (company_id, id),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK (account_type = 'POSTING' OR gen_posting_type = 'NONE'),
    CHECK (account_type IN ('TOTAL','END_TOTAL') OR totaling IS NULL),
    -- BC: Income/Balance follows the Account Category (INCOME/COGS/EXPENSE -> income statement); year-end close relies on it
    CHECK (account_category IS NULL OR income_balance = CASE WHEN account_category IN ('INCOME','COGS','EXPENSE')
                                                             THEN 'INCOME_STATEMENT' ELSE 'BALANCE_SHEET' END)
);
CREATE INDEX ix_gl_account__subcategory ON gl.gl_account (company_id, account_subcategory_id);
CREATE INDEX ix_gl_account__name ON gl.gl_account (company_id, search_name);
COMMENT ON TABLE gl.gl_account IS 'Mirrors BC table 15 G/L Account (chart of accounts). Balances are SQL aggregates over gl_entry instead of FlowFields.';

-- -----------------------------------------------------------------------------
-- Setup and fiscal calendar
-- -----------------------------------------------------------------------------
CREATE TABLE gl.general_ledger_setup (
    id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                        uuid NOT NULL,
    company_id                       uuid NOT NULL,
    global_dimension_1_id            uuid,                    -- FK added in 030
    global_dimension_2_id            uuid,                    -- FK added in 030
    retained_earnings_account_id     uuid,                    -- 3400 Хуримтлагдсан ашиг
    current_year_result_account_id   uuid,                    -- 3500 Тайлант үеийн ашиг (D-D4)
    invoice_rounding_account_id      uuid,
    cash_over_account_id             uuid,                    -- D-G1 cash count surplus
    cash_short_account_id            uuid,                    -- D-G1 cash count shortage
    realized_fx_gain_account_id      uuid,                    -- R2; per-currency override in fx.currency
    realized_fx_loss_account_id      uuid,
    unrealized_fx_gain_account_id    uuid,
    unrealized_fx_loss_account_id    uuid,
    max_vat_difference_allowed       platform.amount NOT NULL DEFAULT 0 CHECK (max_vat_difference_allowed >= 0),
    journal_template_mandatory       boolean NOT NULL DEFAULT true,
    block_deletion_of_gl_accounts    boolean NOT NULL DEFAULT true,
    created_at                       timestamptz NOT NULL DEFAULT now(),
    created_by                       uuid DEFAULT platform.current_user_id(),
    updated_at                       timestamptz,
    updated_by                       uuid,
    row_version                      integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, retained_earnings_account_id)   REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, current_year_result_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, invoice_rounding_account_id)    REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, cash_over_account_id)           REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, cash_short_account_id)          REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, realized_fx_gain_account_id)    REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, realized_fx_loss_account_id)    REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, unrealized_fx_gain_account_id)  REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, unrealized_fx_loss_account_id)  REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id),
    CHECK (global_dimension_1_id IS NULL OR global_dimension_2_id IS NULL OR global_dimension_1_id <> global_dimension_2_id)
);
CREATE INDEX ix_general_ledger_setup__re ON gl.general_ledger_setup (company_id, retained_earnings_account_id);
CREATE INDEX ix_general_ledger_setup__cyr ON gl.general_ledger_setup (company_id, current_year_result_account_id);
CREATE INDEX ix_general_ledger_setup__inv_rnd ON gl.general_ledger_setup (company_id, invoice_rounding_account_id);
CREATE INDEX ix_general_ledger_setup__cash_over ON gl.general_ledger_setup (company_id, cash_over_account_id);
CREATE INDEX ix_general_ledger_setup__cash_short ON gl.general_ledger_setup (company_id, cash_short_account_id);
CREATE INDEX ix_general_ledger_setup__rfx_gain ON gl.general_ledger_setup (company_id, realized_fx_gain_account_id);
CREATE INDEX ix_general_ledger_setup__rfx_loss ON gl.general_ledger_setup (company_id, realized_fx_loss_account_id);
CREATE INDEX ix_general_ledger_setup__ufx_gain ON gl.general_ledger_setup (company_id, unrealized_fx_gain_account_id);
CREATE INDEX ix_general_ledger_setup__ufx_loss ON gl.general_ledger_setup (company_id, unrealized_fx_loss_account_id);
COMMENT ON TABLE gl.general_ledger_setup IS 'Mirrors BC table 98 General Ledger Setup (G/L part: global dimensions, closing/rounding/FX accounts). LCY, rounding precision and posting window live in platform.company_setup.';

CREATE TABLE gl.fiscal_year (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    year                  smallint NOT NULL CHECK (year BETWEEN 2000 AND 2200),
    starting_date         date NOT NULL,
    ending_date           date NOT NULL,
    status                text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
    closing_transaction_no bigint,                 -- year-end closing voucher (is_closing entries)
    closed_at             timestamptz,
    closed_by             uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    updated_at            timestamptz,
    updated_by            uuid,
    row_version           integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, year),
    UNIQUE (company_id, id),
    CHECK (starting_date = make_date(year, 1, 1) AND ending_date = make_date(year, 12, 31))
);
COMMENT ON TABLE gl.fiscal_year IS 'Fiscal year (calendar year by law). Derived from BC table 50 Accounting Period rows with New Fiscal Year = true; status replaces the C-date close flags.';

CREATE TABLE gl.accounting_period (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    company_id      uuid NOT NULL,
    fiscal_year_id  uuid NOT NULL,
    starting_date   date NOT NULL,
    ending_date     date NOT NULL,
    name            text NOT NULL,
    new_fiscal_year boolean NOT NULL DEFAULT false,
    status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid DEFAULT platform.current_user_id(),
    updated_at      timestamptz,
    updated_by      uuid,
    row_version     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, fiscal_year_id) REFERENCES gl.fiscal_year (company_id, id),
    UNIQUE (company_id, starting_date),
    UNIQUE (company_id, id),
    CHECK (ending_date >= starting_date),
    CHECK (new_fiscal_year = (extract(month FROM starting_date) = 1)),
    EXCLUDE USING gist (company_id WITH =, daterange(starting_date, ending_date, '[]') WITH &&)
);
CREATE INDEX ix_accounting_period__fiscal_year ON gl.accounting_period (company_id, fiscal_year_id);
COMMENT ON TABLE gl.accounting_period IS 'Mirrors BC table 50 Accounting Period (monthly). Status OPEN/CLOSED/LOCKED (D-D3): posting only into OPEN periods; CLOSED can be reopened by Owner with a reason; LOCKED is final.';

CREATE TABLE gl.accounting_period_status_log (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    accounting_period_id uuid NOT NULL,
    from_status          text NOT NULL CHECK (from_status IN ('OPEN','CLOSED','LOCKED')),
    to_status            text NOT NULL CHECK (to_status IN ('OPEN','CLOSED','LOCKED')),
    reason_code_id       uuid,
    reason_text          text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, accounting_period_id) REFERENCES gl.accounting_period (company_id, id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    CHECK (from_status <> to_status),
    CHECK (from_status <> 'LOCKED'),
    CHECK (to_status <> 'OPEN' OR reason_text IS NOT NULL)
);
CREATE INDEX ix_accounting_period_status_log__period ON gl.accounting_period_status_log (company_id, accounting_period_id, created_at);
CREATE INDEX ix_accounting_period_status_log__reason ON gl.accounting_period_status_log (company_id, reason_code_id);
COMMENT ON TABLE gl.accounting_period_status_log IS 'Append-only history of period status changes (reopen requires a reason, D-D3). No BC equivalent (BC only has Closed/Date Locked flags).';

-- -----------------------------------------------------------------------------
-- Journals (BC tables 80, 232, 81)
-- -----------------------------------------------------------------------------
CREATE TABLE gl.journal_template (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL,
    company_id             uuid NOT NULL,
    code                   platform.code20 NOT NULL,
    description            text NOT NULL,
    template_type          text NOT NULL DEFAULT 'GENERAL'
                           CHECK (template_type IN ('GENERAL','SALES','PURCHASES','CASH_RECEIPTS','PAYMENTS','CASH',
                                                    'BANK','ASSETS','OPENING')),
    recurring              boolean NOT NULL DEFAULT false,   -- R2 (D-D6)
    force_doc_balance      boolean NOT NULL DEFAULT true,
    allow_vat_difference   boolean NOT NULL DEFAULT false,   -- BC T80 field 24 (limit: general_ledger_setup.max_vat_difference_allowed)
    source_code            platform.code20 NOT NULL REFERENCES platform.source_code (code),
    bal_account_type       platform.account_type,
    bal_account_id         uuid,                             -- polymorphic (G/L or bank account)
    no_series_id           uuid,
    posting_no_series_id   uuid,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid DEFAULT platform.current_user_id(),
    updated_at             timestamptz,
    updated_by             uuid,
    row_version            integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, no_series_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, posting_no_series_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (bal_account_type IS NULL OR bal_account_type IN ('GL_ACCOUNT','BANK_ACCOUNT'))
);
CREATE INDEX ix_journal_template__no_series ON gl.journal_template (company_id, no_series_id);
CREATE INDEX ix_journal_template__posting_no_series ON gl.journal_template (company_id, posting_no_series_id);
COMMENT ON TABLE gl.journal_template IS 'Mirrors BC table 80 Gen. Journal Template (journal type, source code, numbering). Force Doc. Balance is always on.';

CREATE TABLE gl.journal_batch (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    journal_template_id  uuid NOT NULL,
    code                 platform.code20 NOT NULL,
    description          text,
    bal_account_type     platform.account_type,
    bal_account_id       uuid,
    no_series_id         uuid,
    posting_no_series_id uuid,
    reason_code_id       uuid,
    copy_vat_setup       boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    updated_at           timestamptz,
    updated_by           uuid,
    row_version          integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, journal_template_id) REFERENCES gl.journal_template (company_id, id),
    FOREIGN KEY (company_id, no_series_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, posting_no_series_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    UNIQUE (company_id, journal_template_id, code),
    UNIQUE (company_id, id),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (bal_account_type IS NULL OR bal_account_type IN ('GL_ACCOUNT','BANK_ACCOUNT'))
);
CREATE INDEX ix_journal_batch__no_series ON gl.journal_batch (company_id, no_series_id);
CREATE INDEX ix_journal_batch__posting_no_series ON gl.journal_batch (company_id, posting_no_series_id);
CREATE INDEX ix_journal_batch__reason ON gl.journal_batch (company_id, reason_code_id);
COMMENT ON TABLE gl.journal_batch IS 'Mirrors BC table 232 Gen. Journal Batch (named working set of journal lines).';

CREATE TABLE gl.journal_line (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL,
    company_id                    uuid NOT NULL,
    journal_batch_id              uuid NOT NULL,
    line_no                       integer NOT NULL,
    account_type                  platform.account_type NOT NULL DEFAULT 'GL_ACCOUNT',
    account_id                    uuid,                       -- polymorphic by account_type (validated by the posting engine)
    bal_account_type              platform.account_type,
    bal_account_id                uuid,
    posting_date                  date,
    document_date                 date,
    vat_date                      date,                       -- D-E9: defaults to posting_date
    document_type                 platform.document_type NOT NULL DEFAULT 'NONE',
    document_no                   platform.document_no,
    external_document_no          platform.ext_document_no,
    description                   text CHECK (char_length(description) <= 100),
    currency_code                 platform.currency_code,     -- NULL = LCY; FK added in 050
    currency_factor               platform.exch_rate,         -- FCY per 1 LCY (BC Currency Factor)
    amount                        platform.amount NOT NULL DEFAULT 0,   -- signed, in currency_code (debit +)
    amount_lcy                    platform.amount NOT NULL DEFAULT 0,
    gen_posting_type              platform.gen_posting_type NOT NULL DEFAULT 'NONE',
    gen_bus_posting_group_id      uuid,
    gen_prod_posting_group_id     uuid,
    vat_bus_posting_group_id      uuid,
    vat_prod_posting_group_id     uuid,
    vat_calculation_type          platform.vat_calc_type,
    vat_percent                   platform.percent,
    vat_amount                    platform.amount NOT NULL DEFAULT 0,
    vat_base_amount               platform.amount NOT NULL DEFAULT 0,
    vat_difference                platform.amount NOT NULL DEFAULT 0,
    bal_gen_posting_type          platform.gen_posting_type NOT NULL DEFAULT 'NONE',
    bal_vat_bus_posting_group_id  uuid,
    bal_vat_prod_posting_group_id uuid,
    bal_vat_amount                platform.amount NOT NULL DEFAULT 0,
    supplier_ebarimt_id           platform.ddtd,              -- D-E4 supplier receipt ДДТД for purchase VAT
    dimension_set_id              bigint NOT NULL DEFAULT 0,  -- FK added in 030
    applies_to_doc_type           platform.document_type,
    applies_to_doc_no             platform.document_no,
    applies_to_id                 text CHECK (char_length(applies_to_id) <= 50),
    due_date                      date,
    payment_terms_id              uuid,                       -- FK added in 060
    payment_method_id             uuid,                       -- FK added in 060
    reason_code_id                uuid,
    fa_posting_type               text CHECK (fa_posting_type IN ('ACQUISITION_COST','DEPRECIATION','WRITE_DOWN',
                                                                  'DISPOSAL','APPRECIATION')),  -- R2
    depreciation_book_id          uuid,                       -- R2, FK added in 100
    fa_posting_date               date,                       -- R2: BC FA Posting Date (defaults to posting_date)
    no_of_depreciation_days       integer CHECK (no_of_depreciation_days >= 0),   -- R2: manual depreciation lines
    salvage_value                 platform.amount,            -- R2: disposal
    recurring_method              text CHECK (recurring_method IN ('FIXED','VARIABLE','REVERSING_FIXED','REVERSING_VARIABLE')),
    recurring_frequency           platform.date_formula,
    expiration_date               date,
    system_created                boolean NOT NULL DEFAULT false,
    comment                       text,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid DEFAULT platform.current_user_id(),
    updated_at                    timestamptz,
    updated_by                    uuid,
    row_version                   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, journal_batch_id) REFERENCES gl.journal_batch (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    UNIQUE (company_id, journal_batch_id, line_no),
    UNIQUE (company_id, id),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (currency_code IS NOT NULL OR amount = amount_lcy),
    CHECK ((currency_code IS NULL) = (currency_factor IS NULL)),
    CHECK (currency_factor IS NULL OR currency_factor > 0)
);
CREATE INDEX ix_journal_line__reason ON gl.journal_line (company_id, reason_code_id);
CREATE INDEX ix_journal_line__document ON gl.journal_line (company_id, journal_batch_id, document_no, posting_date);
COMMENT ON TABLE gl.journal_line IS 'Mirrors BC table 81 Gen. Journal Line (unposted). Signed amount only (no Debit/Credit input columns, no Correction/storno flag: D-C3).';

-- -----------------------------------------------------------------------------
-- Standard journals (BC tables 750/751; D-D6 v1 "copy from template")
-- -----------------------------------------------------------------------------
CREATE TABLE gl.standard_journal (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    journal_template_id uuid NOT NULL,
    code                platform.code20 NOT NULL,
    description         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid DEFAULT platform.current_user_id(),
    updated_at          timestamptz,
    updated_by          uuid,
    row_version         integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, journal_template_id) REFERENCES gl.journal_template (company_id, id),
    UNIQUE (company_id, journal_template_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE gl.standard_journal IS 'Mirrors BC table 750 Standard General Journal (reusable journal template copied into a batch).';

CREATE TABLE gl.standard_journal_line (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    standard_journal_id       uuid NOT NULL,
    line_no                   integer NOT NULL,
    account_type              platform.account_type NOT NULL DEFAULT 'GL_ACCOUNT',
    account_id                uuid,
    bal_account_type          platform.account_type,
    bal_account_id            uuid,
    document_type             platform.document_type NOT NULL DEFAULT 'NONE',
    description               text CHECK (char_length(description) <= 100),
    amount                    platform.amount NOT NULL DEFAULT 0,
    gen_posting_type          platform.gen_posting_type NOT NULL DEFAULT 'NONE',
    gen_bus_posting_group_id  uuid,
    gen_prod_posting_group_id uuid,
    vat_bus_posting_group_id  uuid,
    vat_prod_posting_group_id uuid,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, standard_journal_id) REFERENCES gl.standard_journal (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, standard_journal_id, line_no),
    UNIQUE (company_id, id),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL))
);
COMMENT ON TABLE gl.standard_journal_line IS 'Mirrors BC table 751 Standard General Journal Line.';

-- -----------------------------------------------------------------------------
-- Posting output: register, transaction, G/L entry (append-only; guards in 910)
-- -----------------------------------------------------------------------------
CREATE TABLE gl.gl_register (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    no                   bigint NOT NULL CHECK (no > 0),
    from_entry_no        bigint,
    to_entry_no          bigint,
    from_vat_entry_no    bigint,
    to_vat_entry_no      bigint,
    source_code          platform.code20 NOT NULL REFERENCES platform.source_code (code),
    journal_template_code text,
    journal_batch_code   text,
    request_id           text,                       -- API request / job run that produced the posting
    reversed             boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK (from_entry_no IS NULL OR to_entry_no >= from_entry_no),
    CHECK (from_vat_entry_no IS NULL OR to_vat_entry_no >= from_vat_entry_no)
);
CREATE INDEX ix_gl_register__created ON gl.gl_register (company_id, created_at);
COMMENT ON TABLE gl.gl_register IS 'Mirrors BC table 45 G/L Register: one row per posting run (audit trail; reversal of a whole register). Append-only.';

CREATE TABLE gl.gl_transaction (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    transaction_no             bigint NOT NULL CHECK (transaction_no > 0),
    gl_register_no             bigint NOT NULL,
    posting_date               date NOT NULL,
    is_closing                 boolean NOT NULL DEFAULT false,   -- D-D4 year-end closing voucher (replaces BC C-date)
    document_type              platform.document_type NOT NULL DEFAULT 'NONE',
    document_no                platform.document_no NOT NULL,
    source_code                platform.code20 NOT NULL REFERENCES platform.source_code (code),
    reason_code_id             uuid,
    description                text,
    reverses_transaction_no    bigint,                 -- set on the reversing voucher
    reversed_by_transaction_no bigint,                 -- set on the original (whitelisted update)
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, reverses_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, reversed_by_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, transaction_no),
    UNIQUE (company_id, id),
    CHECK (reverses_transaction_no IS NULL OR reverses_transaction_no <> transaction_no),
    CHECK (NOT is_closing OR (extract(month FROM posting_date) = 12 AND extract(day FROM posting_date) = 31))
);
CREATE INDEX ix_gl_transaction__register ON gl.gl_transaction (company_id, gl_register_no);
CREATE INDEX ix_gl_transaction__document ON gl.gl_transaction (company_id, document_no, posting_date);
CREATE INDEX ix_gl_transaction__date ON gl.gl_transaction (company_id, posting_date);
CREATE INDEX ix_gl_transaction__reason ON gl.gl_transaction (company_id, reason_code_id);
CREATE UNIQUE INDEX ux_gl_transaction__reverses ON gl.gl_transaction (company_id, reverses_transaction_no)
    WHERE reverses_transaction_no IS NOT NULL;
CREATE INDEX ix_gl_transaction__reversed_by ON gl.gl_transaction (company_id, reversed_by_transaction_no)
    WHERE reversed_by_transaction_no IS NOT NULL;
COMMENT ON TABLE gl.gl_transaction IS 'Mirrors BC table 57 G/L Transaction, extended to a voucher header (posting date, document, closing flag, reversal links). sum(gl_entry.amount) = 0 per transaction (D-C5).';

CREATE TABLE gl.gl_entry (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    entry_no                  bigint NOT NULL CHECK (entry_no > 0),
    transaction_no            bigint NOT NULL,
    gl_register_no            bigint NOT NULL,
    gl_account_id             uuid NOT NULL,
    posting_date              date NOT NULL,
    is_closing                boolean NOT NULL DEFAULT false,
    document_type             platform.document_type NOT NULL DEFAULT 'NONE',
    document_no               platform.document_no NOT NULL,
    document_date             date,
    external_document_no      platform.ext_document_no,
    description               text CHECK (char_length(description) <= 100),
    amount                    platform.amount NOT NULL,           -- signed LCY amount: debit > 0, credit < 0 (D-C3)
    debit_amount              numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount > 0 THEN amount ELSE 0 END) STORED,
    credit_amount             numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount < 0 THEN -amount ELSE 0 END) STORED,
    vat_amount                platform.amount NOT NULL DEFAULT 0,
    gen_posting_type          platform.gen_posting_type NOT NULL DEFAULT 'NONE',
    gen_bus_posting_group     platform.code20,                    -- snapshot codes (historic value, no FK)
    gen_prod_posting_group    platform.code20,
    vat_bus_posting_group     platform.code20,
    vat_prod_posting_group    platform.code20,
    vat_date                  date,
    bal_account_type          platform.account_type,
    bal_account_id            uuid,
    source_type               platform.source_type NOT NULL DEFAULT 'NONE',
    source_id                 uuid,
    source_no                 platform.code20,
    source_currency_code      platform.currency_code,             -- R2: original FCY of the posting
    source_currency_amount    platform.amount,
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    global_dim_1_value_id     uuid,                               -- derived from dimension_set_id by trigger (910), never trusted from input
    global_dim_2_value_id     uuid,
    source_code               platform.code20 NOT NULL REFERENCES platform.source_code (code),
    reason_code_id            uuid,
    journal_template_code     text,
    journal_batch_code        text,
    system_created            boolean NOT NULL DEFAULT false,
    reversed                  boolean NOT NULL DEFAULT false,     -- whitelisted update (910)
    reversed_by_entry_no      bigint,                             -- whitelisted update (910)
    reversed_entry_no         bigint,                             -- set at insert on the reversing entry
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, reversed_entry_no) REFERENCES gl.gl_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_by_entry_no) REFERENCES gl.gl_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id),
    CHECK ((source_currency_code IS NULL) = (source_currency_amount IS NULL)),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (NOT reversed OR reversed_by_entry_no IS NOT NULL OR reversed_entry_no IS NOT NULL)
);
CREATE INDEX ix_gl_entry__account_date ON gl.gl_entry (company_id, gl_account_id, posting_date) INCLUDE (amount, is_closing);
CREATE INDEX ix_gl_entry__transaction ON gl.gl_entry (company_id, transaction_no, entry_no) INCLUDE (amount);
CREATE INDEX ix_gl_entry__register ON gl.gl_entry (company_id, gl_register_no);
CREATE INDEX ix_gl_entry__document ON gl.gl_entry (company_id, document_no, posting_date);
CREATE INDEX ix_gl_entry__date ON gl.gl_entry (company_id, posting_date);
CREATE INDEX ix_gl_entry__source ON gl.gl_entry (company_id, source_type, source_id, posting_date);
CREATE INDEX ix_gl_entry__dimension_set ON gl.gl_entry (company_id, dimension_set_id);
CREATE INDEX ix_gl_entry__dim1 ON gl.gl_entry (company_id, global_dim_1_value_id, posting_date) WHERE global_dim_1_value_id IS NOT NULL;
CREATE INDEX ix_gl_entry__dim2 ON gl.gl_entry (company_id, global_dim_2_value_id, posting_date) WHERE global_dim_2_value_id IS NOT NULL;
CREATE INDEX ix_gl_entry__reason ON gl.gl_entry (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_gl_entry__reversed_entry ON gl.gl_entry (company_id, reversed_entry_no) WHERE reversed_entry_no IS NOT NULL;
CREATE INDEX ix_gl_entry__reversed_by ON gl.gl_entry (company_id, reversed_by_entry_no) WHERE reversed_by_entry_no IS NOT NULL;
COMMENT ON TABLE gl.gl_entry IS 'Mirrors BC table 17 G/L Entry. Append-only (D-C4); signed amount, debit/credit derived from the sign, no storno (D-C3); LCY only (ACY dropped).';
COMMENT ON COLUMN gl.gl_entry.amount IS 'Signed LCY amount. Debit > 0, credit < 0. A reversal posts the opposite sign, so it lands in the opposite column (no storno).';

-- Year-end closing voucher link (D-D4); gl_transaction is created after fiscal_year.
ALTER TABLE gl.fiscal_year
    ADD FOREIGN KEY (company_id, closing_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no);
CREATE INDEX ix_fiscal_year__closing_transaction ON gl.fiscal_year (company_id, closing_transaction_no)
    WHERE closing_transaction_no IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Fiscal calendar helper
-- -----------------------------------------------------------------------------
CREATE FUNCTION gl.fn_create_fiscal_year(p_year integer) RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_fy      uuid;
    m         integer;
    v_start   date;
    v_names   text[] := ARRAY['1-р сар','2-р сар','3-р сар','4-р сар','5-р сар','6-р сар',
                              '7-р сар','8-р сар','9-р сар','10-р сар','11-р сар','12-р сар'];
BEGIN
    INSERT INTO gl.fiscal_year (tenant_id, company_id, year, starting_date, ending_date)
    VALUES (v_tenant, v_company, p_year, make_date(p_year, 1, 1), make_date(p_year, 12, 31))
    RETURNING id INTO v_fy;
    FOR m IN 1..12 LOOP
        v_start := make_date(p_year, m, 1);
        INSERT INTO gl.accounting_period (tenant_id, company_id, fiscal_year_id, starting_date, ending_date, name, new_fiscal_year)
        VALUES (v_tenant, v_company, v_fy, v_start, (v_start + interval '1 month' - interval '1 day')::date,
                v_names[m] || ' ' || p_year, m = 1);
    END LOOP;
    RETURN v_fy;
END $$;
COMMENT ON FUNCTION gl.fn_create_fiscal_year(integer) IS 'BC Report 93 Create Fiscal Year (fixed: calendar year, 12 monthly periods) for the current company.';
