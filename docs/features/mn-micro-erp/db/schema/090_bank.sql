-- =============================================================================
-- 090_bank.sql
-- Bank, cash and wallet accounts (cash = bank_account kind CASH, D-G1), bank ledger,
-- statement import, reconciliation and payment application (BC tables 277, 270, 271,
-- 273-276, 1251, 1294, 1295/1296, Data Exchange Definition).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE TABLE bank.bank_account_posting_group (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    code           platform.code20 NOT NULL,
    description    text,
    gl_account_id  uuid NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    updated_at     timestamptz,
    updated_by     uuid,
    row_version    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_bank_account_posting_group__gl ON bank.bank_account_posting_group (company_id, gl_account_id);
COMMENT ON TABLE bank.bank_account_posting_group IS 'Mirrors BC table 277 Bank Account Posting Group (bank/cash -> G/L account).';

CREATE TABLE bank.bank_statement_import_format (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL,
    company_id         uuid NOT NULL,
    code               platform.code20 NOT NULL,           -- KHAN_XLSX, GOLOMT_CSV, GENERIC_CSV
    description        text NOT NULL,
    preset_bank        text CHECK (preset_bank IN ('KHAN','GOLOMT','TDB','XAC','STATE','GENERIC')),
    file_type          text NOT NULL CHECK (file_type IN ('CSV','XLSX')),
    encoding           text NOT NULL DEFAULT 'UTF-8',
    delimiter          text CHECK (char_length(delimiter) = 1),
    header_rows        smallint NOT NULL DEFAULT 1 CHECK (header_rows >= 0),
    sheet_name         text,
    date_format        text NOT NULL DEFAULT 'yyyy-MM-dd',
    decimal_separator  text NOT NULL DEFAULT '.' CHECK (decimal_separator IN ('.', ',')),
    thousand_separator text CHECK (thousand_separator IN (',', '.', ' ', '')),
    amount_mode        text NOT NULL DEFAULT 'SIGNED' CHECK (amount_mode IN ('SIGNED','DEBIT_CREDIT')),
    negative_sign_identifier text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid DEFAULT platform.current_user_id(),
    updated_at         timestamptz,
    updated_by         uuid,
    row_version        integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id),
    CHECK (file_type <> 'CSV' OR delimiter IS NOT NULL)
);
COMMENT ON TABLE bank.bank_statement_import_format IS 'Simplified BC Data Exch. Def (T1222) + Line Def (T1227) for bank statement files (D-G2 mapping wizard and bank presets).';

CREATE TABLE bank.bank_statement_import_column (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL,
    company_id             uuid NOT NULL,
    import_format_id       uuid NOT NULL,
    target_field           text NOT NULL CHECK (target_field IN ('TRANSACTION_DATE','VALUE_DATE','AMOUNT','DEBIT_AMOUNT',
                               'CREDIT_AMOUNT','DESCRIPTION','COUNTERPARTY_NAME','COUNTERPARTY_ACCOUNT','PAYMENT_REFERENCE',
                               'TRANSACTION_ID','RUNNING_BALANCE','CURRENCY')),
    column_no              smallint CHECK (column_no > 0),
    column_header          text,
    data_format            text,
    multiplier             numeric(9,4) NOT NULL DEFAULT 1,
    optional               boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid DEFAULT platform.current_user_id(),
    updated_at             timestamptz,
    updated_by             uuid,
    row_version            integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, import_format_id) REFERENCES bank.bank_statement_import_format (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, import_format_id, target_field),
    CHECK (column_no IS NOT NULL OR column_header IS NOT NULL)
);
COMMENT ON TABLE bank.bank_statement_import_column IS 'Column mapping of an import format; mirrors BC Data Exch. Column Def (T1223) + Field Mapping (T1225, incl. Multiplier).';

CREATE TABLE bank.bank_account (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL,
    company_id                    uuid NOT NULL,
    no                            platform.code20 NOT NULL,
    name                          text NOT NULL,
    kind                          text NOT NULL DEFAULT 'BANK' CHECK (kind IN ('BANK','CASH','WALLET')),
    bank_name                     text,
    bank_code                     text,
    bank_account_no               text,
    iban                          text CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$'),
    currency_code                 platform.currency_code,               -- NULL = LCY
    bank_account_posting_group_id uuid NOT NULL,
    import_format_id              uuid,
    last_statement_no             text,
    balance_last_statement        platform.amount NOT NULL DEFAULT 0,
    match_tolerance_type          text NOT NULL DEFAULT 'AMOUNT' CHECK (match_tolerance_type IN ('AMOUNT','PERCENTAGE')),
    match_tolerance_value         numeric(19,5) NOT NULL DEFAULT 0 CHECK (match_tolerance_value >= 0),
    min_balance                   platform.amount NOT NULL DEFAULT 0,
    prevent_negative_balance      boolean NOT NULL DEFAULT false,       -- true for CASH by default (D-G1)
    cash_receipt_no_series_id     uuid,                                 -- МХ-1 (кассын орлогын баримт), gapless
    cash_payment_no_series_id     uuid,                                 -- МХ-2 (кассын зарлагын баримт), gapless
    blocked                       boolean NOT NULL DEFAULT false,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid DEFAULT platform.current_user_id(),
    updated_at                    timestamptz,
    updated_by                    uuid,
    row_version                   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, bank_account_posting_group_id) REFERENCES bank.bank_account_posting_group (company_id, id),
    FOREIGN KEY (company_id, import_format_id) REFERENCES bank.bank_statement_import_format (company_id, id),
    FOREIGN KEY (company_id, cash_receipt_no_series_id) REFERENCES platform.number_series (company_id, id),
    FOREIGN KEY (company_id, cash_payment_no_series_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK (kind <> 'CASH' OR (bank_account_no IS NULL AND iban IS NULL))
);
CREATE INDEX ix_bank_account__currency ON bank.bank_account (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_bank_account__posting_group ON bank.bank_account (company_id, bank_account_posting_group_id);
CREATE INDEX ix_bank_account__import_format ON bank.bank_account (company_id, import_format_id);
CREATE INDEX ix_bank_account__cash_receipt_nos ON bank.bank_account (company_id, cash_receipt_no_series_id);
CREATE INDEX ix_bank_account__cash_payment_nos ON bank.bank_account (company_id, cash_payment_no_series_id);
COMMENT ON TABLE bank.bank_account IS 'Mirrors BC table 270 Bank Account; kind BANK / CASH (касс, D-G1) / WALLET (QPay, card acquirer). Cash voucher series per cash account.';

CREATE TABLE bank.bank_ledger_entry (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL,
    company_id              uuid NOT NULL,
    entry_no                bigint NOT NULL CHECK (entry_no > 0),
    bank_account_id         uuid NOT NULL,
    posting_date            date NOT NULL,
    document_date           date,
    document_type           platform.document_type NOT NULL DEFAULT 'NONE',
    document_no             platform.document_no NOT NULL,
    external_document_no    platform.ext_document_no,
    description             text,
    counterparty_name       text,
    currency_code           platform.currency_code,
    amount                  platform.amount NOT NULL,                -- in bank account currency, signed (receipt > 0)
    amount_lcy              platform.amount NOT NULL,
    debit_amount            numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount > 0 THEN amount ELSE 0 END) STORED,
    credit_amount           numeric(19,4) GENERATED ALWAYS AS (CASE WHEN amount < 0 THEN -amount ELSE 0 END) STORED,
    remaining_amount        platform.amount NOT NULL,                -- whitelisted (reconciliation)
    open                    boolean NOT NULL DEFAULT true,           -- whitelisted
    positive                boolean NOT NULL,
    closed_by_entry_no      bigint,
    closed_at_date          date,
    statement_status        text NOT NULL DEFAULT 'OPEN'
                            CHECK (statement_status IN ('OPEN','BANK_ACC_ENTRY_APPLIED','CLOSED')),
    statement_no            text,
    statement_line_no       integer,
    bal_account_type        platform.account_type,
    bal_account_id          uuid,
    cash_flow_category_id   uuid,                                    -- МГТ direct method override, FK added in 120
    transaction_no          bigint NOT NULL,
    gl_register_no          bigint NOT NULL,
    dimension_set_id        bigint NOT NULL DEFAULT 0,
    global_dim_1_value_id   uuid,
    global_dim_2_value_id   uuid,
    source_code             platform.code20 NOT NULL REFERENCES platform.source_code (code),
    reason_code_id          uuid,
    reversed                boolean NOT NULL DEFAULT false,
    reversed_by_entry_no    bigint,
    reversed_entry_no       bigint,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_account_id) REFERENCES bank.bank_account (company_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, reason_code_id) REFERENCES platform.reason_code (company_id, id),
    FOREIGN KEY (company_id, closed_by_entry_no) REFERENCES bank.bank_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (company_id, reversed_entry_no) REFERENCES bank.bank_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, reversed_by_entry_no) REFERENCES bank.bank_ledger_entry (company_id, entry_no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id),
    CHECK (positive = (amount > 0) OR amount = 0),
    CHECK ((bal_account_type IS NULL) = (bal_account_id IS NULL)),
    CHECK (statement_status = 'OPEN' OR statement_no IS NOT NULL)
);
CREATE INDEX ix_bank_ledger_entry__account_date ON bank.bank_ledger_entry (company_id, bank_account_id, posting_date) INCLUDE (amount, amount_lcy);
CREATE INDEX ix_bank_ledger_entry__open ON bank.bank_ledger_entry (company_id, bank_account_id, posting_date) WHERE open;
CREATE INDEX ix_bank_ledger_entry__statement ON bank.bank_ledger_entry (company_id, bank_account_id, statement_no, statement_line_no) WHERE statement_no IS NOT NULL;
CREATE INDEX ix_bank_ledger_entry__document ON bank.bank_ledger_entry (company_id, document_no, posting_date);
CREATE INDEX ix_bank_ledger_entry__currency ON bank.bank_ledger_entry (company_id, currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX ix_bank_ledger_entry__transaction ON bank.bank_ledger_entry (company_id, transaction_no);
CREATE INDEX ix_bank_ledger_entry__register ON bank.bank_ledger_entry (company_id, gl_register_no);
CREATE INDEX ix_bank_ledger_entry__dimension_set ON bank.bank_ledger_entry (company_id, dimension_set_id);
CREATE INDEX ix_bank_ledger_entry__reason ON bank.bank_ledger_entry (company_id, reason_code_id) WHERE reason_code_id IS NOT NULL;
CREATE INDEX ix_bank_ledger_entry__cash_flow ON bank.bank_ledger_entry (company_id, cash_flow_category_id) WHERE cash_flow_category_id IS NOT NULL;
CREATE INDEX ix_bank_ledger_entry__closed_by ON bank.bank_ledger_entry (company_id, closed_by_entry_no) WHERE closed_by_entry_no IS NOT NULL;
CREATE INDEX ix_bank_ledger_entry__reversed_entry ON bank.bank_ledger_entry (company_id, reversed_entry_no) WHERE reversed_entry_no IS NOT NULL;
CREATE INDEX ix_bank_ledger_entry__reversed_by ON bank.bank_ledger_entry (company_id, reversed_by_entry_no) WHERE reversed_by_entry_no IS NOT NULL;
COMMENT ON TABLE bank.bank_ledger_entry IS 'Mirrors BC table 271 Bank Account Ledger Entry (bank, cash and wallet movements). Append-only except reconciliation/status columns.';

CREATE TABLE bank.posted_cash_voucher (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    voucher_type        text NOT NULL CHECK (voucher_type IN ('RECEIPT','PAYMENT')),   -- МХ-1 / МХ-2
    no                  platform.document_no NOT NULL,                                 -- gapless per cash account series
    bank_account_id     uuid NOT NULL,
    posting_date        date NOT NULL,
    counterparty_type   platform.account_type,
    counterparty_id     uuid,
    counterparty_name   text NOT NULL,
    counterparty_id_doc text,                     -- person identification (регистр), printed on the voucher
    purpose             text NOT NULL,
    amount              platform.amount NOT NULL CHECK (amount > 0),
    amount_in_words     text,
    currency_code       platform.currency_code,
    bank_ledger_entry_no bigint NOT NULL,
    transaction_no      bigint NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_account_id) REFERENCES bank.bank_account (company_id, id),
    FOREIGN KEY (company_id, bank_ledger_entry_no) REFERENCES bank.bank_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    UNIQUE (company_id, voucher_type, no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_posted_cash_voucher__account ON bank.posted_cash_voucher (company_id, bank_account_id, posting_date);
CREATE INDEX ix_posted_cash_voucher__ble ON bank.posted_cash_voucher (company_id, bank_ledger_entry_no);
CREATE INDEX ix_posted_cash_voucher__transaction ON bank.posted_cash_voucher (company_id, transaction_no);
COMMENT ON TABLE bank.posted_cash_voucher IS 'Posted cash receipt / payment voucher (МХ-1 / МХ-2, D-A4), immutable, gapless numbers. No BC table (BC prints from G/L/bank entries).';

-- -----------------------------------------------------------------------------
-- Imported statements and reconciliation
-- -----------------------------------------------------------------------------
CREATE TABLE bank.bank_statement (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL,
    company_id         uuid NOT NULL,
    bank_account_id    uuid NOT NULL,
    statement_no       text NOT NULL,
    statement_date     date NOT NULL,
    period_from        date,
    period_to          date,
    opening_balance    platform.amount,
    closing_balance    platform.amount,
    import_format_id   uuid,
    file_name          text,
    file_sha256        bytea CHECK (octet_length(file_sha256) = 32),
    status             text NOT NULL DEFAULT 'IMPORTED' CHECK (status IN ('IMPORTED','IN_RECONCILIATION','POSTED','DISCARDED')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid DEFAULT platform.current_user_id(),
    updated_at         timestamptz,
    updated_by         uuid,
    row_version        integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_account_id) REFERENCES bank.bank_account (company_id, id),
    FOREIGN KEY (company_id, import_format_id) REFERENCES bank.bank_statement_import_format (company_id, id),
    UNIQUE (company_id, bank_account_id, statement_no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_bank_statement__import_format ON bank.bank_statement (company_id, import_format_id);
CREATE UNIQUE INDEX ux_bank_statement__file ON bank.bank_statement (company_id, bank_account_id, file_sha256) WHERE file_sha256 IS NOT NULL AND status <> 'DISCARDED';
COMMENT ON TABLE bank.bank_statement IS 'Imported bank statement file header (staging before reconciliation). BC keeps this in T273 + Data Exch.; split out for re-import detection.';

CREATE TABLE bank.bank_statement_line (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    bank_statement_id     uuid NOT NULL,
    bank_account_id       uuid NOT NULL,
    line_no               integer NOT NULL,
    transaction_date      date NOT NULL,
    value_date            date,
    amount                platform.amount NOT NULL,
    currency_code         platform.currency_code,
    description           text,
    transaction_text      text,
    counterparty_name     text,
    counterparty_account  text,
    payment_reference     text,
    transaction_id        text,
    running_balance       platform.amount,
    dedupe_key            text NOT NULL,          -- bank transaction id, else hash(date, amount, text, balance)
    status                text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','MATCHED','POSTED','IGNORED')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    updated_at            timestamptz,
    updated_by            uuid,
    row_version           integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_statement_id) REFERENCES bank.bank_statement (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, bank_account_id) REFERENCES bank.bank_account (company_id, id),
    UNIQUE (company_id, bank_statement_id, line_no),
    UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX ux_bank_statement_line__dedupe ON bank.bank_statement_line (company_id, bank_account_id, dedupe_key) WHERE status <> 'IGNORED';
CREATE INDEX ix_bank_statement_line__date ON bank.bank_statement_line (company_id, bank_account_id, transaction_date);
COMMENT ON TABLE bank.bank_statement_line IS 'Imported statement transaction (BC Bank Acc. Reconciliation Line T274 import fields). Dedupe key prevents double import.';

CREATE TABLE bank.bank_reconciliation (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL,
    bank_account_id          uuid NOT NULL,
    statement_no             text NOT NULL,
    statement_date           date NOT NULL,
    balance_last_statement   platform.amount NOT NULL DEFAULT 0,
    statement_ending_balance platform.amount NOT NULL DEFAULT 0,
    bank_statement_id        uuid,
    status                   text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','POSTED')),
    posted_at                timestamptz,
    posted_by                uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    updated_at               timestamptz,
    updated_by               uuid,
    row_version              integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_account_id) REFERENCES bank.bank_account (company_id, id),
    FOREIGN KEY (company_id, bank_statement_id) REFERENCES bank.bank_statement (company_id, id),
    UNIQUE (company_id, bank_account_id, statement_no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_bank_reconciliation__statement ON bank.bank_reconciliation (company_id, bank_statement_id);
CREATE UNIQUE INDEX ux_bank_reconciliation__one_open ON bank.bank_reconciliation (company_id, bank_account_id) WHERE status = 'OPEN';
COMMENT ON TABLE bank.bank_reconciliation IS 'Mirrors BC table 273 Bank Acc. Reconciliation (single workflow: bank rec + payment application). One open reconciliation per account.';

CREATE TABLE bank.bank_reconciliation_line (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    bank_reconciliation_id     uuid NOT NULL,
    statement_line_no          integer NOT NULL,
    bank_statement_line_id     uuid,
    transaction_date           date NOT NULL,
    value_date                 date,
    description                text,
    transaction_text           text,
    related_party_name         text,
    related_party_account_no   text,
    payment_reference_no       text,
    transaction_id             text,
    statement_amount           platform.amount NOT NULL,
    applied_amount             platform.amount NOT NULL DEFAULT 0,
    difference                 platform.amount GENERATED ALWAYS AS (statement_amount - applied_amount) STORED,
    applied_entries            integer NOT NULL DEFAULT 0,
    account_type               platform.account_type,        -- post-to target when no ledger entry exists
    account_id                 uuid,
    match_confidence           text NOT NULL DEFAULT 'NONE'
                               CHECK (match_confidence IN ('NONE','LOW','MEDIUM','HIGH','HIGH_TEXT_TO_ACCOUNT','MANUAL','ACCEPTED')),
    match_quality              integer NOT NULL DEFAULT 0,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    updated_at                 timestamptz,
    updated_by                 uuid,
    row_version                integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_reconciliation_id) REFERENCES bank.bank_reconciliation (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, bank_statement_line_id) REFERENCES bank.bank_statement_line (company_id, id),
    UNIQUE (company_id, bank_reconciliation_id, statement_line_no),
    UNIQUE (company_id, id),
    CHECK ((account_type IS NULL) = (account_id IS NULL))
);
CREATE INDEX ix_bank_reconciliation_line__statement_line ON bank.bank_reconciliation_line (company_id, bank_statement_line_id);
COMMENT ON TABLE bank.bank_reconciliation_line IS 'Mirrors BC table 274 Bank Acc. Reconciliation Line.';

CREATE TABLE bank.bank_rec_match (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL,
    bank_reconciliation_id   uuid NOT NULL,
    match_no                 integer NOT NULL,
    match_confidence         text NOT NULL CHECK (match_confidence IN ('LOW','MEDIUM','HIGH','HIGH_TEXT_TO_ACCOUNT','MANUAL','ACCEPTED')),
    score                    integer NOT NULL DEFAULT 0,
    rule_code                text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_reconciliation_id) REFERENCES bank.bank_reconciliation (company_id, id) ON DELETE CASCADE,
    UNIQUE (company_id, bank_reconciliation_id, match_no),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE bank.bank_rec_match IS 'Match group (n statement lines <-> m bank ledger entries, equal sums). Replaces BC Bank Acc. Rec. Match Buffer (T2711) and parent/child line splitting.';

CREATE TABLE bank.bank_rec_match_member (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL,
    company_id              uuid NOT NULL,
    bank_rec_match_id       uuid NOT NULL,
    member_type             text NOT NULL CHECK (member_type IN ('STATEMENT_LINE','BANK_LEDGER_ENTRY')),
    reconciliation_line_id  uuid,
    bank_ledger_entry_no    bigint,
    amount                  platform.amount NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_rec_match_id) REFERENCES bank.bank_rec_match (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, reconciliation_line_id) REFERENCES bank.bank_reconciliation_line (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, bank_ledger_entry_no) REFERENCES bank.bank_ledger_entry (company_id, entry_no),
    CHECK ((member_type = 'STATEMENT_LINE') = (reconciliation_line_id IS NOT NULL)),
    CHECK ((member_type = 'BANK_LEDGER_ENTRY') = (bank_ledger_entry_no IS NOT NULL))
);
CREATE INDEX ix_bank_rec_match_member__match ON bank.bank_rec_match_member (company_id, bank_rec_match_id);
CREATE UNIQUE INDEX ux_bank_rec_match_member__line ON bank.bank_rec_match_member (company_id, reconciliation_line_id) WHERE reconciliation_line_id IS NOT NULL;
CREATE INDEX ix_bank_rec_match_member__ble ON bank.bank_rec_match_member (company_id, bank_ledger_entry_no) WHERE bank_ledger_entry_no IS NOT NULL;
COMMENT ON TABLE bank.bank_rec_match_member IS 'Members of a match group: statement lines and bank ledger entries.';

CREATE TABLE bank.payment_application_proposal (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL,
    reconciliation_line_id   uuid NOT NULL,
    account_type             platform.account_type NOT NULL,          -- CUSTOMER / VENDOR / GL_ACCOUNT / BANK_ACCOUNT
    account_id               uuid NOT NULL,
    applies_to_entry_no      bigint,                                  -- cust./vendor ledger entry; NULL = on account
    applied_amount           platform.amount NOT NULL,
    match_confidence         text NOT NULL DEFAULT 'NONE'
                             CHECK (match_confidence IN ('NONE','LOW','MEDIUM','HIGH','HIGH_TEXT_TO_ACCOUNT','MANUAL','ACCEPTED')),
    quality                  integer NOT NULL DEFAULT 0,
    rule_code                text,
    accepted                 boolean NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    updated_at               timestamptz,
    updated_by               uuid,
    row_version              integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, reconciliation_line_id) REFERENCES bank.bank_reconciliation_line (company_id, id) ON DELETE CASCADE,
    UNIQUE NULLS NOT DISTINCT (company_id, reconciliation_line_id, account_type, account_id, applies_to_entry_no)
);
CREATE INDEX ix_payment_application_proposal__entry ON bank.payment_application_proposal (company_id, account_type, applies_to_entry_no) WHERE applies_to_entry_no IS NOT NULL;
COMMENT ON TABLE bank.payment_application_proposal IS 'Mirrors BC table 1294 Applied Payment Entry + T1293 proposals (scored candidates from the Match Bank Payments rules, D-G2).';

CREATE TABLE bank.text_to_account_mapping (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL,
    company_id         uuid NOT NULL,
    line_no            integer NOT NULL,
    mapping_text       text NOT NULL CHECK (char_length(mapping_text) BETWEEN 1 AND 250),
    debit_account_id   uuid,
    credit_account_id  uuid,
    bal_source_type    text NOT NULL DEFAULT 'GL_ACCOUNT' CHECK (bal_source_type IN ('GL_ACCOUNT','CUSTOMER','VENDOR','BANK_ACCOUNT')),
    bal_source_id      uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid DEFAULT platform.current_user_id(),
    updated_at         timestamptz,
    updated_by         uuid,
    row_version        integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, debit_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, credit_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, line_no)
);
CREATE INDEX ix_text_to_account_mapping__debit ON bank.text_to_account_mapping (company_id, debit_account_id);
CREATE INDEX ix_text_to_account_mapping__credit ON bank.text_to_account_mapping (company_id, credit_account_id);
COMMENT ON TABLE bank.text_to_account_mapping IS 'Mirrors BC table 1251 Text-to-Account Mapping (statement text -> account, e.g. bank fees).';

CREATE TABLE bank.bank_account_statement (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL,
    company_id                    uuid NOT NULL,
    bank_account_id               uuid NOT NULL,
    statement_no                  text NOT NULL,
    statement_date                date NOT NULL,
    balance_last_statement        platform.amount NOT NULL,
    statement_ending_balance      platform.amount NOT NULL,
    gl_balance_at_posting_date    platform.amount NOT NULL,
    outstanding_payments          platform.amount NOT NULL DEFAULT 0,
    outstanding_transactions      platform.amount NOT NULL DEFAULT 0,
    bank_reconciliation_id        uuid,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_account_id) REFERENCES bank.bank_account (company_id, id),
    FOREIGN KEY (company_id, bank_reconciliation_id) REFERENCES bank.bank_reconciliation (company_id, id),
    UNIQUE (company_id, bank_account_id, statement_no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_bank_account_statement__rec ON bank.bank_account_statement (company_id, bank_reconciliation_id);
COMMENT ON TABLE bank.bank_account_statement IS 'Mirrors BC table 275 Bank Account Statement (immutable snapshot of a posted reconciliation; merges T1295).';

CREATE TABLE bank.bank_account_statement_line (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    bank_account_statement_id   uuid NOT NULL,
    statement_line_no           integer NOT NULL,
    transaction_date            date NOT NULL,
    description                 text,
    statement_amount            platform.amount NOT NULL,
    applied_amount              platform.amount NOT NULL,
    applied_entry_nos           bigint[],
    applied_document_no         text,
    transaction_id              text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, bank_account_statement_id) REFERENCES bank.bank_account_statement (company_id, id),
    UNIQUE (company_id, bank_account_statement_id, statement_line_no)
);
COMMENT ON TABLE bank.bank_account_statement_line IS 'Mirrors BC table 276 Bank Account Statement Line (+ T1296 posted payment recon line). Immutable.';
