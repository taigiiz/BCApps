-- =============================================================================
-- 030_dimension.sql
-- Dimensions (BC tables 348, 349, 352, 480, 481). Owned by the gl module.
-- Dimension Set ID design: a set is identified by an integer id per company (0 = empty set,
-- like BC). BC's Dimension Set Tree Node (T481) is replaced by a unique hash of the sorted
-- (dimension_id:dimension_value_id) pairs; lookup-or-create is one INSERT ... ON CONFLICT.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE TABLE gl.dimension (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    code                platform.code20 NOT NULL,
    name                text NOT NULL CHECK (char_length(name) <= 50),
    name_en             text,
    blocked             boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid DEFAULT platform.current_user_id(),
    updated_at          timestamptz,
    updated_by          uuid,
    row_version         integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE gl.dimension IS 'Mirrors BC table 348 Dimension (analysis axis, e.g. САЛБАР / ТӨСӨЛ). v1: 2 global dimensions (D-D2).';

CREATE TABLE gl.dimension_value (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    dimension_id        uuid NOT NULL,
    code                platform.code20 NOT NULL,
    name                text NOT NULL CHECK (char_length(name) <= 100),
    name_en             text,
    value_type          text NOT NULL DEFAULT 'STANDARD'
                        CHECK (value_type IN ('STANDARD','HEADING','TOTAL','BEGIN_TOTAL','END_TOTAL')),
    parent_value_id     uuid,                       -- rollup tree instead of Begin/End-Total ranges
    totaling            text CHECK (char_length(totaling) <= 250),
    blocked             boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid DEFAULT platform.current_user_id(),
    updated_at          timestamptz,
    updated_by          uuid,
    row_version         integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, dimension_id) REFERENCES gl.dimension (company_id, id),
    FOREIGN KEY (company_id, parent_value_id) REFERENCES gl.dimension_value (company_id, id),
    UNIQUE (company_id, dimension_id, code),
    UNIQUE (company_id, dimension_id, id),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_dimension_value__parent ON gl.dimension_value (company_id, parent_value_id);
COMMENT ON TABLE gl.dimension_value IS 'Mirrors BC table 349 Dimension Value. Referenced by surrogate id so codes can be renamed (Dimension Value ID of BC).';

CREATE TABLE gl.default_dimension (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    entity_type         text NOT NULL CHECK (entity_type IN ('GL_ACCOUNT','CUSTOMER','VENDOR','BANK_ACCOUNT','ITEM',
                                                             'FIXED_ASSET','EMPLOYEE')),
    entity_id           uuid,                       -- NULL = every record of entity_type (BC "No." blank)
    dimension_id        uuid NOT NULL,
    dimension_value_id  uuid,
    value_posting       text NOT NULL DEFAULT 'NONE'
                        CHECK (value_posting IN ('NONE','CODE_MANDATORY','SAME_CODE','NO_CODE')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid DEFAULT platform.current_user_id(),
    updated_at          timestamptz,
    updated_by          uuid,
    row_version         integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, dimension_id) REFERENCES gl.dimension (company_id, id),
    FOREIGN KEY (company_id, dimension_id, dimension_value_id) REFERENCES gl.dimension_value (company_id, dimension_id, id),
    UNIQUE NULLS NOT DISTINCT (company_id, entity_type, entity_id, dimension_id),
    CHECK (value_posting <> 'SAME_CODE' OR dimension_value_id IS NOT NULL),
    CHECK (value_posting <> 'NO_CODE' OR dimension_value_id IS NULL)
);
CREATE INDEX ix_default_dimension__dimension ON gl.default_dimension (company_id, dimension_id, dimension_value_id);
COMMENT ON TABLE gl.default_dimension IS 'Mirrors BC table 352 Default Dimension incl. Value Posting rules (Code Mandatory / Same Code / No Code). UI in R2 (D-D2).';

CREATE SEQUENCE gl.dimension_set_id_seq AS bigint START WITH 1;
COMMENT ON SEQUENCE gl.dimension_set_id_seq IS 'Source of dimension_set_id values (> 0). Gaps are harmless: the id is a technical key; 0 = empty set.';

CREATE TABLE gl.dimension_set (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    company_id        uuid NOT NULL,
    dimension_set_id  bigint NOT NULL CHECK (dimension_set_id >= 0),
    key_hash          bytea NOT NULL CHECK (octet_length(key_hash) = 32),  -- sha256(key_text)
    key_text          text NOT NULL,                                       -- sorted 'dimension_id:value_id;...'
    entry_count       smallint NOT NULL CHECK (entry_count >= 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, dimension_set_id),
    UNIQUE (company_id, key_hash),
    CHECK ((dimension_set_id = 0) = (entry_count = 0))
);
COMMENT ON TABLE gl.dimension_set IS 'Replaces BC table 481 Dimension Set Tree Node: one immutable row per distinct combination of dimension values; dimension_set_id 0 = empty set.';

CREATE TABLE gl.dimension_set_entry (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    company_id          uuid NOT NULL,
    dimension_set_id    bigint NOT NULL,
    dimension_id        uuid NOT NULL,
    dimension_value_id  uuid NOT NULL,
    global_dimension_no smallint NOT NULL DEFAULT 0 CHECK (global_dimension_no BETWEEN 0 AND 2),
    created_at          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    FOREIGN KEY (company_id, dimension_id, dimension_value_id) REFERENCES gl.dimension_value (company_id, dimension_id, id),
    UNIQUE (company_id, dimension_set_id, dimension_id)
);
CREATE INDEX ix_dimension_set_entry__value ON gl.dimension_set_entry (company_id, dimension_id, dimension_value_id);
COMMENT ON TABLE gl.dimension_set_entry IS 'Mirrors BC table 480 Dimension Set Entry (members of a set). Immutable once written.';

-- Lookup-or-create the set for a list of dimension value ids (BC DimensionManagement.GetDimensionSetID).
CREATE FUNCTION gl.fn_get_dimension_set_id(p_value_ids uuid[]) RETURNS bigint
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_key     text;
    v_count   integer;
    v_hash    bytea;
    v_id      bigint;
BEGIN
    IF p_value_ids IS NULL OR cardinality(p_value_ids) = 0 THEN
        RETURN 0;
    END IF;
    SELECT string_agg(dv.dimension_id::text || ':' || dv.id::text, ';' ORDER BY dv.dimension_id, dv.id),
           count(*), count(DISTINCT dv.dimension_id)
      INTO v_key, v_count, v_id
      FROM gl.dimension_value dv
     WHERE dv.company_id = v_company AND dv.id = ANY (p_value_ids);
    IF v_count <> cardinality(p_value_ids) OR v_id <> v_count THEN
        RAISE EXCEPTION 'dimension values unknown, duplicated or two values of one dimension' USING ERRCODE = 'ERD01';
    END IF;
    v_hash := public.digest(v_key, 'sha256');
    SELECT dimension_set_id INTO v_id FROM gl.dimension_set WHERE company_id = v_company AND key_hash = v_hash;
    IF FOUND THEN
        RETURN v_id;
    END IF;
    v_id := nextval('gl.dimension_set_id_seq');
    INSERT INTO gl.dimension_set (tenant_id, company_id, dimension_set_id, key_hash, key_text, entry_count)
    VALUES (v_tenant, v_company, v_id, v_hash, v_key, v_count)
    ON CONFLICT (company_id, key_hash) DO NOTHING;
    IF NOT FOUND THEN   -- concurrent creator won: return its id
        SELECT dimension_set_id INTO v_id FROM gl.dimension_set WHERE company_id = v_company AND key_hash = v_hash;
        RETURN v_id;
    END IF;
    INSERT INTO gl.dimension_set_entry (tenant_id, company_id, dimension_set_id, dimension_id, dimension_value_id, global_dimension_no)
    SELECT v_tenant, v_company, v_id, dv.dimension_id, dv.id,
           CASE dv.dimension_id WHEN s.global_dimension_1_id THEN 1 WHEN s.global_dimension_2_id THEN 2 ELSE 0 END
      FROM gl.dimension_value dv
      LEFT JOIN gl.general_ledger_setup s ON s.company_id = v_company
     WHERE dv.company_id = v_company AND dv.id = ANY (p_value_ids);
    RETURN v_id;
END $$;
COMMENT ON FUNCTION gl.fn_get_dimension_set_id(uuid[]) IS 'Returns the dimension_set_id of a value combination for the current company, creating the set (hash-keyed) if needed. Empty input = 0.';

-- Foreign keys from tables of 020
ALTER TABLE gl.general_ledger_setup
    ADD FOREIGN KEY (company_id, global_dimension_1_id) REFERENCES gl.dimension (company_id, id),
    ADD FOREIGN KEY (company_id, global_dimension_2_id) REFERENCES gl.dimension (company_id, id);
CREATE INDEX ix_general_ledger_setup__dim1 ON gl.general_ledger_setup (company_id, global_dimension_1_id);
CREATE INDEX ix_general_ledger_setup__dim2 ON gl.general_ledger_setup (company_id, global_dimension_2_id);

ALTER TABLE gl.gl_entry
    ADD FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id);
ALTER TABLE gl.journal_line
    ADD FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id);
CREATE INDEX ix_journal_line__dimension_set ON gl.journal_line (company_id, dimension_set_id);
ALTER TABLE gl.standard_journal_line
    ADD FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id);
CREATE INDEX ix_standard_journal_line__dimension_set ON gl.standard_journal_line (company_id, dimension_set_id);

-- -----------------------------------------------------------------------------
-- G/L budgets (BC tables 95/96). Storage for financial-report columns with
-- ledger_entry_type = BUDGET_ENTRIES (rpt.fin_report_column.gl_budget_id). UI in R2+.
-- -----------------------------------------------------------------------------
CREATE TABLE gl.gl_budget (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    code           platform.code20 NOT NULL,
    description    text NOT NULL,
    blocked        boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    updated_at     timestamptz,
    updated_by     uuid,
    row_version    integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE gl.gl_budget IS 'Mirrors BC table 95 G/L Budget Name (named budget version, e.g. 2027 plan).';

CREATE TABLE gl.gl_budget_entry (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    company_id        uuid NOT NULL,
    gl_budget_id      uuid NOT NULL,
    gl_account_id     uuid NOT NULL,
    budget_date       date NOT NULL,                       -- usually the first day of the budgeted month
    amount            platform.amount NOT NULL,            -- signed like gl_entry (debit +)
    description       text CHECK (char_length(description) <= 100),
    dimension_set_id  bigint NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid DEFAULT platform.current_user_id(),
    updated_at        timestamptz,
    updated_by        uuid,
    row_version       integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, gl_budget_id) REFERENCES gl.gl_budget (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, gl_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_gl_budget_entry__budget ON gl.gl_budget_entry (company_id, gl_budget_id, gl_account_id, budget_date) INCLUDE (amount);
CREATE INDEX ix_gl_budget_entry__account ON gl.gl_budget_entry (company_id, gl_account_id);
CREATE INDEX ix_gl_budget_entry__dimension_set ON gl.gl_budget_entry (company_id, dimension_set_id);
COMMENT ON TABLE gl.gl_budget_entry IS 'Mirrors BC table 96 G/L Budget Entry (budget amount per account, date and dimension set). Editable planning data, not a ledger.';

-- Company initialisation for the gl module (called by provisioning after fn_set_context).
CREATE FUNCTION gl.fn_initialize_company() RETURNS void
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
BEGIN
    INSERT INTO gl.dimension_set (tenant_id, company_id, dimension_set_id, key_hash, key_text, entry_count)
    VALUES (v_tenant, v_company, 0, public.digest('', 'sha256'), '', 0)
    ON CONFLICT DO NOTHING;
    INSERT INTO gl.general_ledger_setup (tenant_id, company_id) VALUES (v_tenant, v_company)
    ON CONFLICT (company_id) DO NOTHING;
END $$;
COMMENT ON FUNCTION gl.fn_initialize_company() IS 'BC CU2 Company-Initialize (gl part): empty dimension set 0 and the G/L setup singleton.';
