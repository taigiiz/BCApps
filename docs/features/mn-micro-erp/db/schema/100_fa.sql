-- =============================================================================
-- 100_fa.sql
-- Fixed assets (R2, D-G4): classes, posting groups, depreciation books (ACCOUNTING
-- integrated with G/L + TAX memo book), assets, per-book parameters and the FA ledger
-- (BC tables 5607, 5606, 5611, 5600, 5612, 5601).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE TABLE fa.fa_class (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    company_id      uuid NOT NULL,
    code            platform.code20 NOT NULL,      -- BUILDINGS, MACHINERY, VEHICLES, COMPUTERS, INTANGIBLE
    name            text NOT NULL,
    tax_life_param_code text,                      -- e.g. fa.tax_life.computers_software_years in tax.tax_parameter
    ebarimt_classification_code text CHECK (ebarimt_classification_code ~ '^[0-9]{7}$'),   -- CR #101 (FA-R-25): default БҮНА for asset sales
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid DEFAULT platform.current_user_id(),
    updated_at      timestamptz,
    updated_by      uuid,
    row_version     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE fa.fa_class IS 'Mirrors BC table 5607 FA Class (+ link to the statutory tax life parameter).';

CREATE TABLE fa.fa_posting_group (
    id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                         uuid NOT NULL,
    company_id                        uuid NOT NULL,
    code                              platform.code20 NOT NULL,
    description                       text,
    acquisition_cost_account_id       uuid NOT NULL,
    accum_depreciation_account_id     uuid NOT NULL,
    depreciation_expense_account_id   uuid NOT NULL,
    gains_on_disposal_account_id      uuid NOT NULL,
    losses_on_disposal_account_id     uuid NOT NULL,
    write_down_expense_account_id     uuid,
    write_down_account_id             uuid,
    created_at                        timestamptz NOT NULL DEFAULT now(),
    created_by                        uuid DEFAULT platform.current_user_id(),
    updated_at                        timestamptz,
    updated_by                        uuid,
    row_version                       integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, acquisition_cost_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, accum_depreciation_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, depreciation_expense_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, gains_on_disposal_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, losses_on_disposal_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, write_down_expense_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, write_down_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_fa_posting_group__acq ON fa.fa_posting_group (company_id, acquisition_cost_account_id);
CREATE INDEX ix_fa_posting_group__accum ON fa.fa_posting_group (company_id, accum_depreciation_account_id);
CREATE INDEX ix_fa_posting_group__depr ON fa.fa_posting_group (company_id, depreciation_expense_account_id);
CREATE INDEX ix_fa_posting_group__gain ON fa.fa_posting_group (company_id, gains_on_disposal_account_id);
CREATE INDEX ix_fa_posting_group__loss ON fa.fa_posting_group (company_id, losses_on_disposal_account_id);
CREATE INDEX ix_fa_posting_group__wd_exp ON fa.fa_posting_group (company_id, write_down_expense_account_id);
CREATE INDEX ix_fa_posting_group__wd ON fa.fa_posting_group (company_id, write_down_account_id);
COMMENT ON TABLE fa.fa_posting_group IS 'Mirrors BC table 5606 FA Posting Group (reduced to cost, accumulated depreciation, expense, gain, loss, write-down accounts).';

CREATE TABLE fa.depreciation_book (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL,
    company_id                      uuid NOT NULL,
    code                            platform.code20 NOT NULL,      -- NBB (accounting), TAX
    description                     text NOT NULL,
    book_type                       text NOT NULL CHECK (book_type IN ('ACCOUNTING','TAX')),
    gl_integration_acq_cost         boolean NOT NULL DEFAULT true,
    gl_integration_depreciation     boolean NOT NULL DEFAULT true,
    gl_integration_write_down       boolean NOT NULL DEFAULT true,
    gl_integration_disposal         boolean NOT NULL DEFAULT true,
    disposal_calculation_method     text NOT NULL DEFAULT 'NET' CHECK (disposal_calculation_method IN ('NET','GROSS')),
    use_rounding_in_periodic_depr   boolean NOT NULL DEFAULT false,
    fiscal_year_365_days            boolean NOT NULL DEFAULT false,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid DEFAULT platform.current_user_id(),
    updated_at                      timestamptz,
    updated_by                      uuid,
    row_version                     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK (book_type = 'ACCOUNTING' OR NOT (gl_integration_acq_cost OR gl_integration_depreciation
                                           OR gl_integration_write_down OR gl_integration_disposal))
);
CREATE UNIQUE INDEX ux_depreciation_book__one_accounting ON fa.depreciation_book (company_id) WHERE book_type = 'ACCOUNTING';
COMMENT ON TABLE fa.depreciation_book IS 'Mirrors BC table 5611 Depreciation Book. Exactly one ACCOUNTING book (G/L-integrated) and an optional TAX memo book (never posts to G/L).';

CREATE TABLE fa.fixed_asset (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    no                   platform.code20 NOT NULL,
    description          text NOT NULL,
    fa_class_id          uuid,
    fa_posting_group_id  uuid NOT NULL,
    serial_no            text,
    location_text        text,
    responsible_employee text,
    vendor_id            uuid,
    status               text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','DISPOSED')),
    blocked              boolean NOT NULL DEFAULT false,
    inactive             boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    updated_at           timestamptz,
    updated_by           uuid,
    row_version          integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, fa_class_id) REFERENCES fa.fa_class (company_id, id),
    FOREIGN KEY (company_id, fa_posting_group_id) REFERENCES fa.fa_posting_group (company_id, id),
    FOREIGN KEY (company_id, vendor_id) REFERENCES party.vendor (company_id, id),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_fixed_asset__class ON fa.fixed_asset (company_id, fa_class_id);
CREATE INDEX ix_fixed_asset__posting_group ON fa.fixed_asset (company_id, fa_posting_group_id);
CREATE INDEX ix_fixed_asset__vendor ON fa.fixed_asset (company_id, vendor_id);
COMMENT ON TABLE fa.fixed_asset IS 'Mirrors BC table 5600 Fixed Asset (asset card).';

CREATE TABLE fa.fa_depreciation_book (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL,
    company_id                    uuid NOT NULL,
    fixed_asset_id                uuid NOT NULL,
    depreciation_book_id          uuid NOT NULL,
    depreciation_method           text NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (depreciation_method IN ('STRAIGHT_LINE','MANUAL')),
    in_service_date               date,
    depreciation_starting_date    date,                    -- default: 1st day of the month after in-service (D-G4)
    depreciation_ending_date      date,
    no_of_depreciation_months     integer CHECK (no_of_depreciation_months > 0),
    residual_value                platform.amount NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
    fa_posting_group_id           uuid NOT NULL,
    acquisition_date              date,                    -- maintained by posting
    last_depreciation_date        date,                    -- maintained by posting
    disposal_date                 date,                    -- maintained by posting
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid DEFAULT platform.current_user_id(),
    updated_at                    timestamptz,
    updated_by                    uuid,
    row_version                   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id),
    FOREIGN KEY (company_id, depreciation_book_id) REFERENCES fa.depreciation_book (company_id, id),
    FOREIGN KEY (company_id, fa_posting_group_id) REFERENCES fa.fa_posting_group (company_id, id),
    UNIQUE (company_id, fixed_asset_id, depreciation_book_id),
    UNIQUE (company_id, id),
    CHECK (depreciation_method = 'MANUAL' OR depreciation_starting_date IS NULL OR no_of_depreciation_months IS NOT NULL
           OR depreciation_ending_date IS NOT NULL),
    CHECK (depreciation_ending_date IS NULL OR depreciation_starting_date IS NULL OR depreciation_ending_date >= depreciation_starting_date)
);
CREATE INDEX ix_fa_depreciation_book__book ON fa.fa_depreciation_book (company_id, depreciation_book_id);
CREATE INDEX ix_fa_depreciation_book__posting_group ON fa.fa_depreciation_book (company_id, fa_posting_group_id);
COMMENT ON TABLE fa.fa_depreciation_book IS 'Mirrors BC table 5612 FA Depreciation Book (per-asset, per-book parameters; straight-line by months).';

CREATE TABLE fa.depreciation_run (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    run_no                      bigint NOT NULL,
    depreciation_book_id        uuid NOT NULL,
    gl_integrated               boolean NOT NULL,          -- CR #94: snapshot of the book at creation (TAX memo book = false)
    period_ending_date          date NOT NULL,
    posting_date                date NOT NULL,
    document_no                 platform.document_no,     -- CR #94: legal voucher number (series DP), required once posted
    status                      text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
    calculated_at               timestamptz,               -- CR #94 (S11-05): stale-draft detection
    calculated_max_fa_entry_no  bigint,
    total_amount                platform.amount NOT NULL DEFAULT 0,
    transaction_no              bigint,
    posted_at                   timestamptz,
    posted_by                   uuid,
    reversal_transaction_no     bigint,
    reversed_at                 timestamptz,
    reversed_by                 uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, depreciation_book_id) REFERENCES fa.depreciation_book (company_id, id),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, reversal_transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    UNIQUE (company_id, run_no),
    UNIQUE (company_id, id),
    -- CR #94: a TAX memo run never creates a G/L voucher, so POSTED needs a transaction only when G/L-integrated
    CHECK (status <> 'POSTED' OR NOT gl_integrated OR transaction_no IS NOT NULL),
    CHECK (status <> 'REVERSED' OR NOT gl_integrated OR reversal_transaction_no IS NOT NULL),
    CHECK (status = 'DRAFT' OR document_no IS NOT NULL),
    CHECK (status = 'DRAFT' OR posted_at IS NOT NULL),
    CHECK (status <> 'REVERSED' OR reversed_at IS NOT NULL),
    CHECK (posting_date = period_ending_date),
    CHECK (extract(day FROM period_ending_date + 1) = 1)          -- month end
);
CREATE UNIQUE INDEX ux_depreciation_run__period ON fa.depreciation_run (company_id, depreciation_book_id, period_ending_date)
    WHERE status <> 'REVERSED';
CREATE INDEX ix_depreciation_run__transaction ON fa.depreciation_run (company_id, transaction_no);
CREATE INDEX ix_depreciation_run__reversal ON fa.depreciation_run (company_id, reversal_transaction_no) WHERE reversal_transaction_no IS NOT NULL;
COMMENT ON TABLE fa.depreciation_run IS 'Monthly depreciation run (BC Report 5692 Calculate Depreciation output): DRAFT (calculated lines) -> POSTED -> REVERSED. At most one live run per book and period; TAX memo runs post FA ledger entries without a G/L voucher.';

CREATE TABLE fa.fa_ledger_entry (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    entry_no                    bigint NOT NULL CHECK (entry_no > 0),
    fixed_asset_id              uuid NOT NULL,
    depreciation_book_id        uuid NOT NULL,
    fa_posting_date             date NOT NULL,
    posting_date                date NOT NULL,
    document_type               platform.document_type NOT NULL DEFAULT 'NONE',
    document_no                 platform.document_no NOT NULL,
    description                 text,
    fa_posting_category         text NOT NULL DEFAULT 'NONE' CHECK (fa_posting_category IN ('NONE','DISPOSAL','BAL_DISPOSAL')),
    fa_posting_type             text NOT NULL CHECK (fa_posting_type IN ('ACQUISITION_COST','DEPRECIATION','WRITE_DOWN',
                                    'APPRECIATION','PROCEEDS_ON_DISPOSAL','SALVAGE_VALUE','GAIN_LOSS','BOOK_VALUE_ON_DISPOSAL')),
    amount                      platform.amount NOT NULL,
    debit_amount                numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount > 0 THEN amount ELSE 0 END) STORED,
    credit_amount               numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount < 0 THEN -amount ELSE 0 END) STORED,
    part_of_book_value          boolean NOT NULL DEFAULT true,
    part_of_depreciable_basis   boolean NOT NULL DEFAULT false,
    no_of_depreciation_days     integer NOT NULL DEFAULT 0,
    disposal_entry_no           bigint,
    result_on_disposal          text NOT NULL DEFAULT 'NONE' CHECK (result_on_disposal IN ('NONE','GAIN','LOSS')),
    depreciation_method         text,                       -- parameter snapshots
    depreciation_starting_date  date,
    no_of_depreciation_months   integer,
    depreciation_run_id         uuid,
    gl_entry_no                 bigint,                     -- NULL for the TAX memo book
    transaction_no              bigint,
    gl_register_no              bigint,
    dimension_set_id            bigint NOT NULL DEFAULT 0,
    source_code                 platform.code20 NOT NULL REFERENCES platform.source_code (code),
    automatic_entry             boolean NOT NULL DEFAULT false,
    reversed                    boolean NOT NULL DEFAULT false,
    reversed_by_entry_no        bigint,
    reversed_entry_no           bigint,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id),
    FOREIGN KEY (company_id, depreciation_book_id) REFERENCES fa.depreciation_book (company_id, id),
    FOREIGN KEY (company_id, depreciation_run_id) REFERENCES fa.depreciation_run (company_id, id),
    FOREIGN KEY (company_id, gl_entry_no) REFERENCES gl.gl_entry (company_id, entry_no),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, disposal_entry_no) REFERENCES fa.fa_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_entry_no) REFERENCES fa.fa_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_by_entry_no) REFERENCES fa.fa_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id),
    -- CR #96/#108 (FA-R-12): FA posting date = posting date, except opening balances (earlier FA date) and reversals
    CHECK (fa_posting_date = posting_date
           OR (source_code = 'OPENING' AND fa_posting_date <= posting_date AND fa_posting_type IN ('ACQUISITION_COST','DEPRECIATION'))
           OR (source_code = 'REVERSAL' AND reversed_entry_no IS NOT NULL))
);
CREATE INDEX ix_fa_ledger_entry__asset ON fa.fa_ledger_entry (company_id, fixed_asset_id, depreciation_book_id, fa_posting_date) INCLUDE (amount, fa_posting_type);
CREATE INDEX ix_fa_ledger_entry__book ON fa.fa_ledger_entry (company_id, depreciation_book_id);
CREATE INDEX ix_fa_ledger_entry__run ON fa.fa_ledger_entry (company_id, depreciation_run_id) WHERE depreciation_run_id IS NOT NULL;
CREATE INDEX ix_fa_ledger_entry__gl_entry ON fa.fa_ledger_entry (company_id, gl_entry_no) WHERE gl_entry_no IS NOT NULL;
CREATE INDEX ix_fa_ledger_entry__transaction ON fa.fa_ledger_entry (company_id, transaction_no);
CREATE INDEX ix_fa_ledger_entry__register ON fa.fa_ledger_entry (company_id, gl_register_no);
CREATE INDEX ix_fa_ledger_entry__dimension_set ON fa.fa_ledger_entry (company_id, dimension_set_id);
CREATE INDEX ix_fa_ledger_entry__document ON fa.fa_ledger_entry (company_id, document_no, posting_date);
CREATE INDEX ix_fa_ledger_entry__disposal ON fa.fa_ledger_entry (company_id, disposal_entry_no) WHERE disposal_entry_no IS NOT NULL;
CREATE INDEX ix_fa_ledger_entry__reversed_entry ON fa.fa_ledger_entry (company_id, reversed_entry_no) WHERE reversed_entry_no IS NOT NULL;
CREATE INDEX ix_fa_ledger_entry__reversed_by ON fa.fa_ledger_entry (company_id, reversed_by_entry_no) WHERE reversed_by_entry_no IS NOT NULL;

-- Draft calculation of a depreciation run (CR #95, R-FA-INVENTORY-02/28): one line per asset with the amount or the
-- reason it was skipped. Frozen once the run leaves DRAFT (trigger in 910).
CREATE TABLE fa.depreciation_run_line (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    company_id                uuid NOT NULL,
    depreciation_run_id       uuid NOT NULL,
    line_no                   integer NOT NULL,
    fixed_asset_id            uuid NOT NULL,
    fa_depreciation_book_id   uuid NOT NULL,
    first_depreciation_date   date,
    until_date                date,
    no_of_depreciation_days   integer CHECK (no_of_depreciation_days >= 0),
    book_value_before         platform.amount,
    residual_value            platform.amount,
    remaining_life_days       integer,
    calculated_amount         platform.amount NOT NULL DEFAULT 0 CHECK (calculated_amount <= 0),   -- depreciation is a credit to book value
    skip_reason               text CHECK (skip_reason IN ('MANUAL_METHOD','BLOCKED','INACTIVE','DISPOSED','NOT_ACQUIRED',
                                  'ACQUIRED_AFTER_PERIOD','NOT_IN_SERVICE','NOT_STARTED','ALREADY_DEPRECIATED',
                                  'FULLY_DEPRECIATED','ZERO_AMOUNT')),
    dimension_set_id          bigint NOT NULL DEFAULT 0,
    fa_ledger_entry_no        bigint,                         -- set when the run is posted
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid DEFAULT platform.current_user_id(),
    updated_at                timestamptz,
    updated_by                uuid,
    row_version               integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, depreciation_run_id) REFERENCES fa.depreciation_run (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id),
    FOREIGN KEY (company_id, fa_depreciation_book_id) REFERENCES fa.fa_depreciation_book (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, fa_ledger_entry_no) REFERENCES fa.fa_ledger_entry (company_id, entry_no),
    UNIQUE (company_id, depreciation_run_id, fixed_asset_id),
    UNIQUE (company_id, depreciation_run_id, line_no),
    CHECK (skip_reason IS NULL OR calculated_amount = 0)
);
CREATE INDEX ix_depreciation_run_line__asset ON fa.depreciation_run_line (company_id, fixed_asset_id);
CREATE INDEX ix_depreciation_run_line__fa_book ON fa.depreciation_run_line (company_id, fa_depreciation_book_id);
CREATE INDEX ix_depreciation_run_line__dimension_set ON fa.depreciation_run_line (company_id, dimension_set_id);
CREATE INDEX ix_depreciation_run_line__fa_entry ON fa.depreciation_run_line (company_id, fa_ledger_entry_no) WHERE fa_ledger_entry_no IS NOT NULL;
COMMENT ON TABLE fa.depreciation_run_line IS 'Calculated depreciation per asset of a run (draft / preview / post flow, CR #95) incl. skip reasons. Changes are blocked once the run is not DRAFT. Not audited (recalculated drafts).';
COMMENT ON TABLE fa.fa_ledger_entry IS 'Mirrors BC table 5601 FA Ledger Entry (BC posting category/type pairs and signs kept so book value = SUM filters). Append-only.';

-- Foreign keys from earlier files
ALTER TABLE gl.journal_line ADD FOREIGN KEY (company_id, depreciation_book_id) REFERENCES fa.depreciation_book (company_id, id);
CREATE INDEX ix_journal_line__depr_book ON gl.journal_line (company_id, depreciation_book_id);
ALTER TABLE sales.sales_line ADD FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id);
ALTER TABLE sales.sales_invoice_line ADD FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id);
ALTER TABLE sales.sales_cr_memo_line ADD FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id);
ALTER TABLE purchase.purchase_line
    ADD FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id),
    ADD FOREIGN KEY (company_id, depreciation_book_id) REFERENCES fa.depreciation_book (company_id, id);
ALTER TABLE purchase.purch_inv_line ADD FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id);
ALTER TABLE purchase.purch_cr_memo_line ADD FOREIGN KEY (company_id, fixed_asset_id) REFERENCES fa.fixed_asset (company_id, id);
