-- =============================================================================
-- 120_rpt.sql
-- Financial report engine definitions (BC tables 88, 84, 85, 333, 334), Mongolian
-- statement line codes for e-balance Form A (global catalog), cash-flow categories for the
-- direct-method МГТ, and aging bucket setup (D-F7).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- Global catalogs ---------------------------------------------------------------
CREATE TABLE rpt.statement_line (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    form_code        text NOT NULL DEFAULT 'A' CHECK (form_code IN ('A','B')),            -- MoF Order 361 Form A / B
    statement_code   text NOT NULL CHECK (statement_code IN ('BS','IS','EQ','CF')),        -- СБТ, ОДТ, ӨӨТ, МГТ
    line_code        text NOT NULL CHECK (line_code ~ '^[0-9]+(\.[0-9]+)*$'),               -- e.g. 1.1.1
    parent_line_code text,
    name             text NOT NULL,
    name_en          text,
    sort_order       integer NOT NULL,
    normal_side      text NOT NULL DEFAULT 'DEBIT' CHECK (normal_side IN ('DEBIT','CREDIT')),
    is_total         boolean NOT NULL DEFAULT false,
    formula          text,                                     -- for total lines, e.g. 1.1+1.2
    effective_from   date NOT NULL DEFAULT DATE '2018-01-01',
    effective_to     date,
    verified         boolean NOT NULL DEFAULT false,           -- checked against the official annex
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (form_code, statement_code, line_code, effective_from),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
COMMENT ON TABLE rpt.statement_line IS 'Global catalog of e-balance Form A/B statement line codes (СБТ/ОДТ/ӨӨТ/МГТ). Each posting G/L account maps to one line. Replaces BC Account Category -> generated statements (CU571).';

CREATE TABLE rpt.cash_flow_category (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code               platform.code20 NOT NULL UNIQUE,
    name               text NOT NULL,
    name_en            text,
    activity           text NOT NULL CHECK (activity IN ('OPERATING','INVESTING','FINANCING','NONE')),
    direction          text NOT NULL CHECK (direction IN ('INFLOW','OUTFLOW','BOTH')),
    statement_line_id  uuid REFERENCES rpt.statement_line (id),
    sort_order         integer NOT NULL DEFAULT 0,
    created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE rpt.cash_flow_category IS 'Global direct-method cash-flow categories (МГТ lines: receipts from customers, payments to suppliers, wages, taxes, ...). Replaces BC Additional Report Definition (indirect method).';

-- Financial report definitions (company) ---------------------------------------
CREATE TABLE rpt.fin_report_row_definition (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    company_id   uuid NOT NULL,
    code         platform.code20 NOT NULL,
    description  text NOT NULL,
    is_system    boolean NOT NULL DEFAULT false,      -- shipped read-only definition (copy to edit, R2)
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE rpt.fin_report_row_definition IS 'Mirrors BC table 84 Acc. Schedule Name (row definition header).';

CREATE TABLE rpt.fin_report_row (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL,
    company_id             uuid NOT NULL,
    row_definition_id      uuid NOT NULL,
    line_no                integer NOT NULL,
    row_no                 text CHECK (row_no ~ '^[A-Za-z0-9_.\-]{1,10}$'),
    description            text,
    description_en         text,
    totaling_type          text NOT NULL DEFAULT 'POSTING_ACCOUNTS'
                           CHECK (totaling_type IN ('POSTING_ACCOUNTS','TOTAL_ACCOUNTS','FORMULA','ACCOUNT_CATEGORY',
                                                    'CASH_FLOW_CATEGORY','STATEMENT_LINE','SET_BASE_FOR_PERCENT')),
    totaling               text CHECK (char_length(totaling) <= 2048),
    row_type               text NOT NULL DEFAULT 'NET_CHANGE' CHECK (row_type IN ('NET_CHANGE','BALANCE_AT_DATE','BEGINNING_BALANCE')),
    amount_type            text NOT NULL DEFAULT 'NET' CHECK (amount_type IN ('NET','DEBIT','CREDIT')),
    show                   text NOT NULL DEFAULT 'YES' CHECK (show IN ('YES','NO','IF_ANY_COLUMN_NOT_ZERO',
                                                                       'WHEN_POSITIVE_BALANCE','WHEN_NEGATIVE_BALANCE')),
    show_opposite_sign     boolean NOT NULL DEFAULT false,
    bold                   boolean NOT NULL DEFAULT false,
    italic                 boolean NOT NULL DEFAULT false,
    underline              boolean NOT NULL DEFAULT false,
    double_underline       boolean NOT NULL DEFAULT false,
    new_page               boolean NOT NULL DEFAULT false,
    indentation            smallint NOT NULL DEFAULT 0 CHECK (indentation BETWEEN 0 AND 10),
    statement_line_id      uuid REFERENCES rpt.statement_line (id),     -- e-balance export target of this row
    dimension_1_totaling   text,
    dimension_2_totaling   text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid DEFAULT platform.current_user_id(),
    updated_at             timestamptz,
    updated_by             uuid,
    row_version            integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, row_definition_id) REFERENCES rpt.fin_report_row_definition (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, row_definition_id, line_no),
    CHECK (totaling_type <> 'FORMULA' OR totaling IS NOT NULL)
);
CREATE UNIQUE INDEX ux_fin_report_row__row_no ON rpt.fin_report_row (company_id, row_definition_id, row_no) WHERE row_no IS NOT NULL;
COMMENT ON TABLE rpt.fin_report_row IS 'Mirrors BC table 85 Acc. Schedule Line (row: totaling type, row type, show rules, sign flip, formatting). Formula grammar per BC R-33..R-36.';

CREATE TABLE rpt.fin_report_column_definition (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    company_id   uuid NOT NULL,
    code         platform.code20 NOT NULL,
    description  text NOT NULL,
    is_system    boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE rpt.fin_report_column_definition IS 'Mirrors BC table 333 Column Layout Name (column definition header).';

CREATE TABLE rpt.fin_report_column (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL,
    column_definition_id     uuid NOT NULL,
    line_no                  integer NOT NULL,
    column_no                text CHECK (column_no ~ '^[A-Za-z0-9_.\-]{1,10}$'),
    column_header            text,
    column_header_en         text,
    column_type              text NOT NULL DEFAULT 'NET_CHANGE'
                             CHECK (column_type IN ('NET_CHANGE','BALANCE_AT_DATE','BEGINNING_BALANCE','YEAR_TO_DATE',
                                                    'REST_OF_FISCAL_YEAR','ENTIRE_FISCAL_YEAR','FORMULA')),
    ledger_entry_type        text NOT NULL DEFAULT 'ENTRIES' CHECK (ledger_entry_type IN ('ENTRIES','BUDGET_ENTRIES')),
    amount_type              text NOT NULL DEFAULT 'NET' CHECK (amount_type IN ('NET','DEBIT','CREDIT')),
    formula                  text CHECK (char_length(formula) <= 250),
    comparison_date_formula  platform.date_formula,            -- e.g. -1Y
    show                     text NOT NULL DEFAULT 'ALWAYS' CHECK (show IN ('ALWAYS','NEVER','WHEN_POSITIVE','WHEN_NEGATIVE')),
    show_opposite_sign       boolean NOT NULL DEFAULT false,
    sign_neutral             boolean NOT NULL DEFAULT false,   -- ratio columns: skip the row sign flip
    rounding_factor          text NOT NULL DEFAULT 'NONE' CHECK (rounding_factor IN ('NONE','ONE','THOUSAND','MILLION')),
    include_closing_entries  boolean NOT NULL DEFAULT false,   -- D-D4: is_closing entries excluded by default
    gl_budget_id             uuid,                             -- BC Budget Name: source for BUDGET_ENTRIES columns
    dimension_1_totaling     text,
    dimension_2_totaling     text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    updated_at               timestamptz,
    updated_by               uuid,
    row_version              integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, column_definition_id) REFERENCES rpt.fin_report_column_definition (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, gl_budget_id) REFERENCES gl.gl_budget (company_id, id),
    UNIQUE (company_id, column_definition_id, line_no),
    CHECK (column_type <> 'FORMULA' OR formula IS NOT NULL),
    CHECK (ledger_entry_type <> 'BUDGET_ENTRIES' OR gl_budget_id IS NOT NULL)
);
CREATE INDEX ix_fin_report_column__budget ON rpt.fin_report_column (company_id, gl_budget_id) WHERE gl_budget_id IS NOT NULL;
CREATE UNIQUE INDEX ux_fin_report_column__column_no ON rpt.fin_report_column (company_id, column_definition_id, column_no) WHERE column_no IS NOT NULL;
COMMENT ON TABLE rpt.fin_report_column IS 'Mirrors BC table 334 Column Layout (column type, comparison date formula, formula, show, rounding factor).';

CREATE TABLE rpt.financial_report (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    code                  platform.code20 NOT NULL,          -- SBT, ODT, OOT, MGT, TB
    name                  text NOT NULL,
    name_en               text,
    report_kind           text NOT NULL DEFAULT 'OTHER'
                          CHECK (report_kind IN ('BALANCE_SHEET','INCOME_STATEMENT','EQUITY','CASH_FLOW','TRIAL_BALANCE','OTHER')),
    row_definition_id     uuid NOT NULL,
    column_definition_id  uuid NOT NULL,
    statement_form_code   text CHECK (statement_form_code IN ('A','B')),
    is_system             boolean NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    updated_at            timestamptz,
    updated_by            uuid,
    row_version           integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, row_definition_id) REFERENCES rpt.fin_report_row_definition (company_id, id),
    FOREIGN KEY (company_id, column_definition_id) REFERENCES rpt.fin_report_column_definition (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_financial_report__rows ON rpt.financial_report (company_id, row_definition_id);
CREATE INDEX ix_financial_report__columns ON rpt.financial_report (company_id, column_definition_id);
COMMENT ON TABLE rpt.financial_report IS 'Mirrors BC table 88 Financial Report (named row definition x column definition).';

-- Aging buckets (D-F7) ------------------------------------------------------------
CREATE TABLE rpt.aging_bucket_set (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    company_id   uuid NOT NULL,
    code         platform.code20 NOT NULL,
    description  text NOT NULL,
    basis        text NOT NULL DEFAULT 'DUE_DATE' CHECK (basis IN ('DUE_DATE','POSTING_DATE','DOCUMENT_DATE')),
    is_default   boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX ux_aging_bucket_set__default ON rpt.aging_bucket_set (company_id) WHERE is_default;
COMMENT ON TABLE rpt.aging_bucket_set IS 'AR/AP aging configuration (BC Report 120 / CU763 periods). Default: due date, 0-30/31-60/61-90/90+ days (D-F7).';

CREATE TABLE rpt.aging_bucket (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL,
    company_id         uuid NOT NULL,
    aging_bucket_set_id uuid NOT NULL,
    sequence_no        smallint NOT NULL,
    label              text NOT NULL,
    label_en           text,
    from_days          integer,                 -- NULL = open lower bound (not yet due)
    to_days            integer,                 -- NULL = open upper bound
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid DEFAULT platform.current_user_id(),
    updated_at         timestamptz,
    updated_by         uuid,
    row_version        integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, aging_bucket_set_id) REFERENCES rpt.aging_bucket_set (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, aging_bucket_set_id, sequence_no),
    CHECK (from_days IS NULL OR to_days IS NULL OR to_days >= from_days)
);
COMMENT ON TABLE rpt.aging_bucket IS 'One aging column: days overdue = as_of_date - basis date, bucket [from_days, to_days].';

-- Foreign keys from earlier files (targets are global catalogs)
ALTER TABLE gl.gl_account
    ADD FOREIGN KEY (statement_line_id) REFERENCES rpt.statement_line (id),
    ADD FOREIGN KEY (cash_flow_category_id) REFERENCES rpt.cash_flow_category (id);
CREATE INDEX ix_gl_account__statement_line ON gl.gl_account (company_id, statement_line_id);
CREATE INDEX ix_gl_account__cash_flow ON gl.gl_account (company_id, cash_flow_category_id);
ALTER TABLE bank.bank_ledger_entry
    ADD FOREIGN KEY (cash_flow_category_id) REFERENCES rpt.cash_flow_category (id);
