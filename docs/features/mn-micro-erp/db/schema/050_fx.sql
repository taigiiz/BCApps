-- =============================================================================
-- 050_fx.sql
-- Currencies and exchange rates (BC tables 4, 330, 86, 186). Schema complete in R1,
-- functionality in R2 (D-G3). Rate convention (BC): exchange_rate_amount units of FCY
-- = relational_exch_rate_amount units of LCY, e.g. 1 USD = 3450.50 MNT.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- Global reference data -------------------------------------------------------
CREATE TABLE fx.iso_currency (
    code           platform.currency_code PRIMARY KEY,
    numeric_code   char(3) CHECK (numeric_code ~ '^[0-9]{3}$'),
    name           text NOT NULL,
    name_en        text NOT NULL,
    minor_units    smallint NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 4),
    symbol         text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE fx.iso_currency IS 'Global ISO 4217 catalog used to pre-fill company currencies. No direct BC table (BC Currency is per company).';

INSERT INTO fx.iso_currency (code, numeric_code, name, name_en, minor_units, symbol) VALUES
    ('MNT','496','Монгол төгрөг','Mongolian tugrik',2,'₮'),
    ('USD','840','Америк доллар','US dollar',2,'$'),
    ('EUR','978','Евро','Euro',2,'€'),
    ('CNY','156','Хятад юань','Chinese yuan',2,'¥'),
    ('RUB','643','Орос рубль','Russian ruble',2,'₽'),
    ('KRW','410','Солонгос вон','South Korean won',0,'₩'),
    ('JPY','392','Япон иен','Japanese yen',0,'¥'),
    ('GBP','826','Английн фунт','Pound sterling',2,'£');

CREATE TABLE fx.official_exchange_rate (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code    platform.currency_code NOT NULL REFERENCES fx.iso_currency (code),
    rate_date        date NOT NULL,
    rate_mnt         platform.exch_rate NOT NULL CHECK (rate_mnt > 0),   -- MNT per 1 unit of currency
    source           text NOT NULL DEFAULT 'MONGOLBANK' CHECK (source IN ('MONGOLBANK')),
    fetched_at       timestamptz NOT NULL DEFAULT now(),
    source_reference text,
    UNIQUE (source, currency_code, rate_date)
);
CREATE INDEX ix_official_exchange_rate__lookup ON fx.official_exchange_rate (currency_code, rate_date DESC);
COMMENT ON TABLE fx.official_exchange_rate IS 'Global Mongolbank official daily rates fetched once for all tenants (worker-written). Companies copy/link them into fx.currency_exchange_rate.';

-- Company currencies ----------------------------------------------------------
CREATE TABLE fx.currency (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL,
    company_id                      uuid NOT NULL,
    code                            platform.currency_code NOT NULL,
    iso_code                        platform.currency_code REFERENCES fx.iso_currency (code),
    description                     text NOT NULL,
    symbol                          text,
    amount_rounding_precision       numeric(19,4) NOT NULL DEFAULT 0.01 CHECK (amount_rounding_precision > 0),
    unit_amount_rounding_precision  numeric(19,6) NOT NULL DEFAULT 0.00001 CHECK (unit_amount_rounding_precision > 0),
    invoice_rounding_precision      numeric(19,4) NOT NULL DEFAULT 0.01 CHECK (invoice_rounding_precision > 0),
    invoice_rounding_type           text NOT NULL DEFAULT 'NEAREST' CHECK (invoice_rounding_type IN ('NEAREST','UP','DOWN')),
    vat_rounding_type               text NOT NULL DEFAULT 'NEAREST' CHECK (vat_rounding_type IN ('NEAREST','UP','DOWN')),
    realized_gains_account_id       uuid,
    realized_losses_account_id      uuid,
    unrealized_gains_account_id     uuid,
    unrealized_losses_account_id    uuid,
    last_date_adjusted              date,
    last_date_modified              date,
    blocked                         boolean NOT NULL DEFAULT false,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid DEFAULT platform.current_user_id(),
    updated_at                      timestamptz,
    updated_by                      uuid,
    row_version                     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, realized_gains_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, realized_losses_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, unrealized_gains_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, unrealized_losses_account_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_currency__iso ON fx.currency (iso_code);
CREATE INDEX ix_currency__realized_gains ON fx.currency (company_id, realized_gains_account_id);
CREATE INDEX ix_currency__realized_losses ON fx.currency (company_id, realized_losses_account_id);
CREATE INDEX ix_currency__unrealized_gains ON fx.currency (company_id, unrealized_gains_account_id);
CREATE INDEX ix_currency__unrealized_losses ON fx.currency (company_id, unrealized_losses_account_id);
COMMENT ON TABLE fx.currency IS 'Mirrors BC table 4 Currency (foreign currencies of a company; the LCY itself is not a row). Gain/loss accounts override general_ledger_setup defaults.';

CREATE TABLE fx.currency_exchange_rate (
    id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                         uuid NOT NULL,
    company_id                        uuid NOT NULL,
    currency_id                       uuid NOT NULL,
    starting_date                     date NOT NULL,
    exchange_rate_amount              platform.exch_rate NOT NULL DEFAULT 1 CHECK (exchange_rate_amount > 0),
    relational_exch_rate_amount       platform.exch_rate NOT NULL CHECK (relational_exch_rate_amount > 0),
    adjustment_exch_rate_amount       platform.exch_rate NOT NULL DEFAULT 1 CHECK (adjustment_exch_rate_amount > 0),
    relational_adjmt_exch_rate_amount platform.exch_rate NOT NULL CHECK (relational_adjmt_exch_rate_amount > 0),
    source                            text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MONGOLBANK','MANUAL','IMPORT')),
    official_exchange_rate_id         uuid REFERENCES fx.official_exchange_rate (id),
    created_at                        timestamptz NOT NULL DEFAULT now(),
    created_by                        uuid DEFAULT platform.current_user_id(),
    updated_at                        timestamptz,
    updated_by                        uuid,
    row_version                       integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, currency_id) REFERENCES fx.currency (company_id, id),
    UNIQUE (company_id, currency_id, starting_date),
    CHECK (source <> 'MONGOLBANK' OR official_exchange_rate_id IS NOT NULL)
);
CREATE INDEX ix_currency_exchange_rate__official ON fx.currency_exchange_rate (official_exchange_rate_id);
COMMENT ON TABLE fx.currency_exchange_rate IS 'Mirrors BC table 330 Currency Exchange Rate. Lookup = latest starting_date <= posting date (D-G3); never default to 1.';

-- Exchange-rate adjustment (revaluation) runs ----------------------------------
CREATE TABLE fx.exch_rate_adjmt_register (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL,
    company_id              uuid NOT NULL,
    no                      bigint NOT NULL CHECK (no > 0),
    run_no                  bigint NOT NULL,                     -- one run creates one register row per (account type, group, currency)
    posting_date            date NOT NULL,
    document_no             platform.document_no NOT NULL,
    account_type            text NOT NULL CHECK (account_type IN ('CUSTOMER','VENDOR','BANK_ACCOUNT','GL_ACCOUNT')),
    posting_group_code      platform.code20,
    currency_code           platform.currency_code NOT NULL,
    currency_factor         platform.exch_rate NOT NULL,
    adjusted_base           platform.amount NOT NULL DEFAULT 0,
    adjusted_base_lcy       platform.amount NOT NULL DEFAULT 0,
    adjusted_amt_lcy        platform.amount NOT NULL DEFAULT 0,
    transaction_no          bigint,
    gl_register_no          bigint,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, gl_register_no) REFERENCES gl.gl_register (company_id, no) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (company_id, no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_exch_rate_adjmt_register__run ON fx.exch_rate_adjmt_register (company_id, run_no);
CREATE INDEX ix_exch_rate_adjmt_register__currency ON fx.exch_rate_adjmt_register (company_id, currency_code, posting_date);
CREATE INDEX ix_exch_rate_adjmt_register__transaction ON fx.exch_rate_adjmt_register (company_id, transaction_no);
CREATE INDEX ix_exch_rate_adjmt_register__gl_register ON fx.exch_rate_adjmt_register (company_id, gl_register_no);
COMMENT ON TABLE fx.exch_rate_adjmt_register IS 'Mirrors BC table 86 Exch. Rate Adjmt. Reg. (one row per account type x posting group x currency of a revaluation run). Append-only.';

CREATE TABLE fx.exch_rate_adjmt_ledger_entry (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    entry_no                   bigint NOT NULL CHECK (entry_no > 0),
    register_no                bigint NOT NULL,
    posting_date               date NOT NULL,
    account_type               text NOT NULL CHECK (account_type IN ('CUSTOMER','VENDOR','BANK_ACCOUNT','GL_ACCOUNT')),
    account_id                 uuid NOT NULL,
    account_no                 platform.code20,
    document_type              platform.document_type NOT NULL DEFAULT 'NONE',
    document_no                platform.document_no NOT NULL,
    currency_code              platform.currency_code NOT NULL,
    currency_factor            platform.exch_rate NOT NULL,
    base_amount                platform.amount NOT NULL,
    base_amount_lcy            platform.amount NOT NULL,
    adjustment_amount          platform.amount NOT NULL,
    detailed_ledger_entry_no   bigint,                         -- detailed cust/vendor entry (UNREALIZED_GAIN/LOSS) it produced
    ledger_entry_no            bigint,                         -- cust/vendor/bank ledger entry that was revalued
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, register_no) REFERENCES fx.exch_rate_adjmt_register (company_id, no),
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_exch_rate_adjmt_ledger_entry__register ON fx.exch_rate_adjmt_ledger_entry (company_id, register_no);
CREATE INDEX ix_exch_rate_adjmt_ledger_entry__account ON fx.exch_rate_adjmt_ledger_entry (company_id, account_type, account_id, posting_date);
COMMENT ON TABLE fx.exch_rate_adjmt_ledger_entry IS 'Mirrors BC table 186 Exch. Rate Adjmt. Ledg. Entry (per-item revaluation log). Append-only.';

-- Foreign keys from earlier files (NULL currency_code = LCY, so MATCH SIMPLE skips them)
ALTER TABLE gl.journal_line
    ADD FOREIGN KEY (company_id, currency_code) REFERENCES fx.currency (company_id, code);
CREATE INDEX ix_journal_line__currency ON gl.journal_line (company_id, currency_code) WHERE currency_code IS NOT NULL;
