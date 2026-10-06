-- =============================================================================
-- 140_integration_audit.sql
-- Transactional outbox / inbox, API idempotency keys, background jobs (BC Job Queue
-- T472/T474), change log (BC T405), posting log, document navigation (BC Navigate T265),
-- and the generic row_version / audit triggers attached to every mutable table.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- -----------------------------------------------------------------------------
-- D-J3: eBarimt qrData / lottery must never be persisted. Checked at ANY nesting depth
-- (a top-level `?|` check misses {"response": {"qrData": ...}}).
-- -----------------------------------------------------------------------------
CREATE FUNCTION integration.fn_has_forbidden_ebarimt_keys(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT EXISTS (SELECT 1 FROM jsonb_path_query(p, 'strict $.** ? (@.type() == "object")') o(v)
                    CROSS JOIN LATERAL jsonb_object_keys(o.v) k
                   WHERE lower(k) IN ('qrdata','qr_data','lottery','lotteryno','lottery_no'))
$$;
COMMENT ON FUNCTION integration.fn_has_forbidden_ebarimt_keys(jsonb) IS 'True when a JSON document contains a qrData / lottery key at any depth (D-J3). Used by CHECK constraints on every persisted JSON payload.';

-- -----------------------------------------------------------------------------
-- Outbox / inbox / idempotency
-- -----------------------------------------------------------------------------
CREATE TABLE integration.outbox (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES platform.tenant (id),
    company_id       uuid,
    topic            text NOT NULL CHECK (topic ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),   -- e.g. ebarimt.receipt.send
    aggregate_type   text,
    aggregate_id     uuid,
    payload          jsonb NOT NULL,
    idempotency_key  text NOT NULL,
    status           text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DONE','DEAD','CANCELLED')),
    available_at     timestamptz NOT NULL DEFAULT now(),
    attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts     integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),     -- eBarimt POST = 1 (D-I6)
    depends_on_id    uuid,
    lease_owner      text,
    lease_until      timestamptz,
    last_error       text,
    processed_at     timestamptz,
    request_id       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (depends_on_id) REFERENCES integration.outbox (id),
    UNIQUE (tenant_id, idempotency_key),
    CHECK (attempts <= max_attempts),
    CHECK (status <> 'PROCESSING' OR lease_until IS NOT NULL),
    CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(payload))     -- D-J3, any depth
);
CREATE INDEX ix_outbox__ready ON integration.outbox (available_at) WHERE status = 'PENDING';
CREATE INDEX ix_outbox__lease ON integration.outbox (lease_until) WHERE status = 'PROCESSING';
CREATE INDEX ix_outbox__aggregate ON integration.outbox (tenant_id, aggregate_type, aggregate_id);
CREATE INDEX ix_outbox__company ON integration.outbox (tenant_id, company_id);
CREATE INDEX ix_outbox__depends_on ON integration.outbox (depends_on_id) WHERE depends_on_id IS NOT NULL;
COMMENT ON TABLE integration.outbox IS 'Transactional outbox (ADR-0012): written in the posting transaction, dispatched after commit. Replaces BC Job Queue Entry for side effects (eBarimt, e-mail, webhooks).';

CREATE TABLE integration.inbox (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES platform.tenant (id),
    company_id    uuid,
    source        text NOT NULL CHECK (source IN ('QPAY','BANK','EBARIMT','MONGOLBANK','INTERNAL','OTHER')),
    message_id    text NOT NULL,
    payload       jsonb NOT NULL,
    status        text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','FAILED','IGNORED')),
    received_at   timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz,
    last_error    text,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (tenant_id, source, message_id),
    CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(payload))
);
CREATE INDEX ix_inbox__pending ON integration.inbox (received_at) WHERE status = 'RECEIVED';
CREATE INDEX ix_inbox__company ON integration.inbox (tenant_id, company_id);
COMMENT ON TABLE integration.inbox IS 'Inbound message de-duplication (webhooks, callbacks): each (source, message_id) is processed once.';

CREATE TABLE integration.idempotency_key (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES platform.tenant (id),
    key            text NOT NULL CHECK (char_length(key) BETWEEN 8 AND 200),
    user_id        uuid,
    http_method    text NOT NULL DEFAULT 'POST',
    request_path   text,
    request_hash   bytea NOT NULL CHECK (octet_length(request_hash) = 32),
    status         text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED','FAILED')),
    response_code  integer,
    response_body  jsonb,
    resource_id    uuid,
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL DEFAULT now() + interval '7 days',
    UNIQUE (tenant_id, key),
    CHECK (status <> 'COMPLETED' OR response_code IS NOT NULL),
    -- the replayed response of a posting/print call must not keep the receipt QR or lottery (D-J3)
    CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(response_body))
);
CREATE INDEX ix_idempotency_key__expires ON integration.idempotency_key (expires_at);
COMMENT ON TABLE integration.idempotency_key IS 'API Idempotency-Key store (D-I1): same key + same request hash returns the stored response; different hash = 422.';

CREATE TABLE integration.job_definition (
    code           text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_.]*$'),
    description    text NOT NULL,
    scope          text NOT NULL CHECK (scope IN ('SYSTEM','PER_COMPANY','PER_POSAPI_INSTANCE')),
    cron           text,                          -- Quartz cron (UTC); NULL = on demand
    max_attempts   integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
    timeout        interval NOT NULL DEFAULT interval '30 seconds',
    enabled        boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE integration.job_definition IS 'Global background job catalog (simplified BC Job Queue Entry T472 recurrence part).';

INSERT INTO integration.job_definition (code, description, scope, cron, max_attempts) VALUES
    ('outbox.dispatch',          'Dispatch pending outbox messages',                      'SYSTEM', NULL, 1),
    ('ebarimt.receipt.send',     'Send one eBarimt receipt (POST /rest/receipt)',          'PER_COMPANY', NULL, 1),
    ('ebarimt.send_data',        'Daily GET /rest/sendData per PosAPI instance',            'PER_POSAPI_INSTANCE', '0 0 18 * * ?', 3),
    ('fx.mongolbank_rates',      'Fetch Mongolbank official exchange rates',               'SYSTEM', '0 15 2 * * ?', 5),
    ('vat.threshold_check',      'Check 12-month taxable turnover against VAT threshold',  'PER_COMPANY', '0 0 20 1 * ?', 3),
    ('fa.depreciation_reminder', 'Remind about the monthly depreciation run',             'PER_COMPANY', '0 0 1 1 * ?', 3),
    ('integration.cleanup',      'Purge expired idempotency keys and finished job runs',   'SYSTEM', '0 0 19 * * ?', 3);

CREATE TABLE integration.job_run (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid REFERENCES platform.tenant (id),     -- NULL = system job
    company_id           uuid,
    job_definition_code  text NOT NULL REFERENCES integration.job_definition (code),
    status               text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD','CANCELLED')),
    run_after            timestamptz NOT NULL DEFAULT now(),
    attempt              integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    max_attempts         integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
    parameters           jsonb NOT NULL DEFAULT '{}'::jsonb,
    result               jsonb,
    worker               text,
    started_at           timestamptz,
    finished_at          timestamptz,
    last_error           text,
    outbox_id            uuid REFERENCES integration.outbox (id),
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    CHECK (company_id IS NULL OR tenant_id IS NOT NULL),
    CHECK (attempt <= max_attempts),
    CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(parameters) AND NOT integration.fn_has_forbidden_ebarimt_keys(result))
);
CREATE INDEX ix_job_run__queue ON integration.job_run (run_after) WHERE status = 'QUEUED';
CREATE INDEX ix_job_run__definition ON integration.job_run (job_definition_code, created_at);
CREATE INDEX ix_job_run__company ON integration.job_run (tenant_id, company_id, created_at);
CREATE INDEX ix_job_run__outbox ON integration.job_run (outbox_id) WHERE outbox_id IS NOT NULL;
COMMENT ON TABLE integration.job_run IS 'One execution of a job (BC Job Queue Log Entry T474 + queue state). Kept 90 days.';

-- Cross-tenant helpers owned by the BYPASSRLS role (02-architecture 7.6) -----------
CREATE FUNCTION integration.fn_claim_outbox(p_worker text, p_topics text[], p_limit integer, p_lease interval)
RETURNS TABLE (tenant_id uuid, company_id uuid, id uuid, topic text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    UPDATE integration.outbox m
       SET status = 'PROCESSING', lease_owner = p_worker, lease_until = now() + p_lease,
           attempts = m.attempts + 1
     WHERE m.id IN (
           SELECT o.id FROM integration.outbox o
            WHERE o.status = 'PENDING' AND o.available_at <= now() AND o.topic = ANY (p_topics)
              AND o.attempts < o.max_attempts
              AND (o.depends_on_id IS NULL OR EXISTS (SELECT 1 FROM integration.outbox d
                                                       WHERE d.id = o.depends_on_id AND d.status = 'DONE'))
            ORDER BY o.available_at
            LIMIT p_limit
            FOR UPDATE SKIP LOCKED)
    RETURNING m.tenant_id, m.company_id, m.id, m.topic
$$;
COMMENT ON FUNCTION integration.fn_claim_outbox(text, text[], integer, interval) IS
    'Claims ready outbox rows across tenants (returns keys only; payload is read later inside the tenant context).';

CREATE FUNCTION platform.fn_list_active_companies(p_after_tenant uuid, p_after_company uuid, p_limit integer)
RETURNS TABLE (tenant_id uuid, company_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    SELECT c.tenant_id, c.id FROM platform.company c JOIN platform.tenant t ON t.id = c.tenant_id
     WHERE t.status = 'ACTIVE' AND c.status = 'ACTIVE'
       AND (c.tenant_id, c.id) > (coalesce(p_after_tenant, '00000000-0000-0000-0000-000000000000'::uuid),
                                  coalesce(p_after_company, '00000000-0000-0000-0000-000000000000'::uuid))
     ORDER BY c.tenant_id, c.id LIMIT p_limit
$$;
COMMENT ON FUNCTION platform.fn_list_active_companies(uuid, uuid, integer) IS 'Keyset list of active (tenant, company) ids for fan-out jobs; ids only.';

-- Foreign key from 130 (outbox is created in this file)
ALTER TABLE ebarimt.ebarimt_document ADD FOREIGN KEY (outbox_id) REFERENCES integration.outbox (id);
CREATE INDEX ix_ebarimt_document__outbox ON ebarimt.ebarimt_document (outbox_id) WHERE outbox_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
CREATE TABLE audit.row_change (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- append-heavy log: bigint identity, not uuid
    tenant_id        uuid NOT NULL,
    company_id       uuid,
    schema_name      text NOT NULL,
    table_name       text NOT NULL,
    row_id           uuid,
    operation        char(1) NOT NULL CHECK (operation IN ('I','U','D')),
    old_data         jsonb,
    new_data         jsonb,
    changed_columns  text[],
    changed_by       uuid,
    changed_at       timestamptz NOT NULL DEFAULT now(),
    request_id       text,
    CHECK (operation <> 'I' OR old_data IS NULL),
    CHECK (operation <> 'D' OR new_data IS NULL)
);
CREATE INDEX ix_row_change__row ON audit.row_change (tenant_id, schema_name, table_name, row_id, changed_at);
CREATE INDEX ix_row_change__company_time ON audit.row_change (tenant_id, company_id, changed_at);
CREATE INDEX ix_row_change__user ON audit.row_change (tenant_id, changed_by, changed_at);
COMMENT ON TABLE audit.row_change IS 'Mirrors BC table 405 Change Log Entry (always on, one JSON diff row per change) for masters, setup, security and drafts (D-I3). Append-only, kept 10 years.';

CREATE TABLE audit.posting_log (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL,
    company_id       uuid NOT NULL,
    request_id       text,
    idempotency_key  text,
    posting_type     text NOT NULL CHECK (posting_type IN ('GENERAL_JOURNAL','SALES_INVOICE','SALES_CR_MEMO','PURCHASE_INVOICE',
                         'PURCHASE_CR_MEMO','CASH_VOUCHER','PAYMENT','APPLICATION','UNAPPLICATION','REVERSAL','BANK_RECONCILIATION',
                         'VAT_SETTLEMENT','YEAR_CLOSE','FX_ADJUSTMENT','DEPRECIATION','INVENTORY_ADJUSTMENT','OPENING_BALANCE')),
    source_id        uuid,
    source_no        text,
    status           text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
    transaction_no   bigint,
    gl_register_no   bigint,
    document_no      text,
    error_code       text,
    error_message    text,
    started_at       timestamptz NOT NULL,
    finished_at      timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    CHECK (status <> 'SUCCEEDED' OR gl_register_no IS NOT NULL OR posting_type IN ('APPLICATION','UNAPPLICATION'))
);
CREATE INDEX ix_posting_log__company_time ON audit.posting_log (company_id, started_at);
CREATE INDEX ix_posting_log__source ON audit.posting_log (company_id, source_id);
COMMENT ON TABLE audit.posting_log IS 'One row per posting attempt (successes in the posting transaction, failures in a separate transaction). Complements gl_register (BC G/L Register T45 + error log).';

-- -----------------------------------------------------------------------------
-- Security and compliance (R1: FR-PLT-012, FR-PLT-016, NFR-044; 02-architecture 9.8, 10.6, 10.7, 11.6)
-- -----------------------------------------------------------------------------
CREATE TABLE audit.security_event (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- append-heavy log (like row_change)
    tenant_id        uuid,                                -- NULL only for events before a tenant is chosen (failed login)
    company_id       uuid,
    event_type       text NOT NULL CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,60}$'),   -- LOGIN_FAILED, MFA_CHANGED, PERMISSION_DENIED, PII_UNMASK, EXPORT, SUPPORT_SESSION, PERIOD_REOPEN, ...
    user_id          uuid,
    support_access_grant_id uuid,
    outcome          text NOT NULL DEFAULT 'SUCCESS' CHECK (outcome IN ('SUCCESS','DENIED','FAILED')),
    client_ip        inet,
    user_agent       text,
    details          jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_id       text,
    changed_at       timestamptz NOT NULL DEFAULT now(),  -- event time (column name shared with row_change for the retention guard)
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    CHECK (company_id IS NULL OR tenant_id IS NOT NULL),
    CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(details))
);
CREATE INDEX ix_security_event__tenant_time ON audit.security_event (tenant_id, changed_at);
CREATE INDEX ix_security_event__user ON audit.security_event (tenant_id, user_id, changed_at);
COMMENT ON TABLE audit.security_event IS 'Security log (logins, MFA, permission changes/denials, PII unmask, exports, support sessions, period reopen); 10 years, append-only. Tenant-less rows (pre-tenant failed logins) are invisible to tenants and written only through audit.fn_log_security_event.';

CREATE FUNCTION audit.fn_log_security_event(p_tenant_id uuid, p_company_id uuid, p_event_type text, p_user_id uuid,
                                            p_outcome text DEFAULT 'SUCCESS', p_details jsonb DEFAULT '{}'::jsonb,
                                            p_client_ip inet DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    INSERT INTO audit.security_event (tenant_id, company_id, event_type, user_id, outcome, details, client_ip, user_agent, request_id)
    VALUES (p_tenant_id, p_company_id, p_event_type, p_user_id, p_outcome, coalesce(p_details, '{}'::jsonb), p_client_ip, p_user_agent,
            nullif(current_setting('app.request_id', true), ''))
    RETURNING id
$$;
COMMENT ON FUNCTION audit.fn_log_security_event(uuid, uuid, text, uuid, text, jsonb, inet, text) IS 'Writes audit.security_event in any context (also before a tenant is selected). Owned by app_rls_bypass.';

CREATE TABLE audit.security_incident (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid,
    detected_at              timestamptz NOT NULL,
    category                 text NOT NULL CHECK (category IN ('PERSONAL_DATA_BREACH','UNAUTHORIZED_ACCESS','DATA_LOSS','AVAILABILITY','OTHER')),
    severity                 text NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    description              text NOT NULL,
    affected_subjects_count  integer CHECK (affected_subjects_count >= 0),
    subjects_notified_at     timestamptz,                -- ХХМХТХ art. 22.2: notify affected subjects without delay
    regulator_reported_at    timestamptz,                -- art. 22.6: annual report to the National Human Rights Commission
    status                   text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONTAINED','CLOSED')),
    closed_at                timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    updated_at               timestamptz,
    updated_by               uuid,
    row_version              integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL)
);
CREATE INDEX ix_security_incident__tenant ON audit.security_incident (tenant_id, detected_at);
COMMENT ON TABLE audit.security_incident IS 'Personal-data breach / security incident register (NFR-044, 02-architecture 10.6). Changes are audited in row_change.';

CREATE TABLE platform.support_access_grant (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES platform.tenant (id),
    scope            text NOT NULL CHECK (scope IN ('READ_ONLY','READ_WRITE')),
    support_user_id  uuid REFERENCES platform.app_user (id),   -- NULL = any on-duty support engineer
    reason           text NOT NULL,
    starts_at        timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL,
    revoked_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),   -- the Owner who granted it
    updated_at       timestamptz,
    updated_by       uuid,
    row_version      integer NOT NULL DEFAULT 1,
    CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '72 hours')
);
CREATE INDEX ix_support_access_grant__tenant ON platform.support_access_grant (tenant_id, expires_at);
CREATE INDEX ix_support_access_grant__user ON platform.support_access_grant (support_user_id);
COMMENT ON TABLE platform.support_access_grant IS 'Time-boxed support access granted by the tenant Owner (FR-PLT-016, 02-architecture 10.7): READ_ONLY or READ_WRITE, at most 72 hours. Every support session is logged in audit.security_event.';
ALTER TABLE audit.security_event
    ADD FOREIGN KEY (support_access_grant_id) REFERENCES platform.support_access_grant (id);
CREATE INDEX ix_security_event__grant ON audit.security_event (support_access_grant_id) WHERE support_access_grant_id IS NOT NULL;

CREATE TABLE platform.document_signature (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    company_id        uuid NOT NULL,
    document_table    text NOT NULL CHECK (document_table ~ '^[a-z_]+\.[a-z_]+$'),   -- e.g. bank.posted_cash_voucher
    document_id       uuid NOT NULL,
    document_no       platform.document_no NOT NULL,
    signer_role       text NOT NULL CHECK (signer_role IN ('PREPARED_BY','APPROVED_BY','REVIEWED_BY','DIRECTOR','CHIEF_ACCOUNTANT','CASHIER','RECEIVED_BY')),
    signer_user_id    uuid NOT NULL REFERENCES platform.app_user (id),
    document_sha256   bytea NOT NULL CHECK (octet_length(document_sha256) = 32),       -- canonical PDF hash
    signature_kind    text NOT NULL DEFAULT 'INTERNAL' CHECK (signature_kind IN ('INTERNAL','PADES')),
    mfa_method        text,
    mfa_verified_at   timestamptz,
    signed_at         timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, document_table, document_id, signer_role, document_sha256)
);
CREATE INDEX ix_document_signature__signer ON platform.document_signature (signer_user_id);
COMMENT ON TABLE platform.document_signature IS 'Internal document sign-off (FR-PLT-012, ADR-0023 C, 02-architecture 9.8): role, user, time, MFA evidence and the SHA-256 of the canonical PDF. Append-only; a changed PDF no longer matches the stored hash.';

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------
CREATE FUNCTION platform.fn_touch_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at  := now();
    NEW.updated_by  := platform.current_user_id();
    RETURN NEW;
END $$;
COMMENT ON FUNCTION platform.fn_touch_row() IS 'BEFORE UPDATE: optimistic-concurrency row_version + 1 (ETag/If-Match, D-I1), updated_at/by.';

CREATE FUNCTION audit.fn_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_old     jsonb;
    v_new     jsonb;
    v_row     jsonb;
    v_tenant  uuid;
    v_ignore  text[] := ARRAY['row_version','updated_at','updated_by'] || TG_ARGV;
    v_changed text[];
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
    v_row := coalesce(v_new, v_old);
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(k ORDER BY k) INTO v_changed
          FROM jsonb_object_keys(v_new) k
         WHERE v_new -> k IS DISTINCT FROM v_old -> k AND NOT (k = ANY (v_ignore));
        IF v_changed IS NULL THEN
            RETURN NULL;     -- only counters / technical columns changed
        END IF;
    END IF;
    v_tenant := coalesce((v_row ->> 'tenant_id')::uuid,
                         CASE WHEN TG_TABLE_SCHEMA = 'platform' AND TG_TABLE_NAME = 'tenant' THEN (v_row ->> 'id')::uuid END,
                         nullif(current_setting('app.tenant_id', true), '')::uuid);
    IF v_tenant IS NULL THEN
        RETURN NULL;         -- global rows changed outside a tenant context (migrations)
    END IF;
    INSERT INTO audit.row_change (tenant_id, company_id, schema_name, table_name, row_id, operation,
                                  old_data, new_data, changed_columns, changed_by, request_id)
    VALUES (v_tenant, (v_row ->> 'company_id')::uuid, TG_TABLE_SCHEMA, TG_TABLE_NAME, (v_row ->> 'id')::uuid,
            left(TG_OP, 1), v_old, v_new, v_changed,
            nullif(current_setting('app.user_id', true), '')::uuid,
            nullif(current_setting('app.request_id', true), ''));
    RETURN NULL;
END $$;
COMMENT ON FUNCTION audit.fn_row_change() IS 'AFTER INSERT/UPDATE/DELETE row trigger writing audit.row_change (TG_ARGV = extra columns to ignore). Owned by app_rls_bypass so it works in any context.';

GRANT INSERT ON audit.row_change TO app_rls_bypass;
GRANT SELECT, UPDATE ON integration.outbox TO app_rls_bypass;
GRANT SELECT ON platform.company, platform.tenant TO app_rls_bypass;
ALTER FUNCTION audit.fn_row_change() OWNER TO app_rls_bypass;
GRANT SELECT, INSERT ON audit.security_event TO app_rls_bypass;   -- SELECT for RETURNING id
ALTER FUNCTION audit.fn_log_security_event(uuid, uuid, text, uuid, text, jsonb, inet, text) OWNER TO app_rls_bypass;
REVOKE ALL ON FUNCTION audit.fn_log_security_event(uuid, uuid, text, uuid, text, jsonb, inet, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.fn_log_security_event(uuid, uuid, text, uuid, text, jsonb, inet, text) TO app_user;
ALTER FUNCTION integration.fn_claim_outbox(text, text[], integer, interval) OWNER TO app_rls_bypass;
ALTER FUNCTION platform.fn_list_active_companies(uuid, uuid, integer) OWNER TO app_rls_bypass;
REVOKE ALL ON FUNCTION integration.fn_claim_outbox(text, text[], integer, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_list_active_companies(uuid, uuid, integer) FROM PUBLIC;
-- Cross-tenant helpers: the background worker only (the web API role must not lease other tenants' messages).
GRANT EXECUTE ON FUNCTION integration.fn_claim_outbox(text, text[], integer, interval) TO app_worker;
GRANT EXECUTE ON FUNCTION platform.fn_list_active_companies(uuid, uuid, integer) TO app_worker;

-- Attach: row_version trigger to every table with a row_version column; audit trigger to every
-- mutable table except high-churn projections/imports. Ledgers have no row_version (immutable).
DO $$
DECLARE
    t record;
    v_args text;
BEGIN
    FOR t IN
        SELECT c.table_schema, c.table_name
          FROM information_schema.columns c
          JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
         WHERE c.column_name = 'row_version' AND tb.table_type = 'BASE TABLE'
           AND c.table_schema IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt',
                                  'ebarimt','integration','audit')
         ORDER BY 1, 2
    LOOP
        EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform.fn_touch_row()',
                       t.table_name, t.table_schema, t.table_name);
        CONTINUE WHEN (t.table_schema, t.table_name) IN (('inv','item_cost_state'), ('bank','bank_statement_line'));
        v_args := CASE WHEN (t.table_schema, t.table_name) = ('platform','number_series_line')
                       THEN '''last_no_used'', ''last_date_used'', ''open'''
                       ELSE '' END;
        EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change(%s)',
                       t.table_name, t.table_schema, t.table_name, v_args);
    END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- Navigate (BC Document Entry T265): every ledger / posted row by document number
-- -----------------------------------------------------------------------------
CREATE VIEW audit.document_entry WITH (security_invoker = true) AS
    SELECT tenant_id, company_id, document_no, posting_date, 'gl.gl_entry'::text AS table_name, entry_no, id FROM gl.gl_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'tax.vat_entry', entry_no, id FROM tax.vat_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'tax.city_tax_entry', entry_no, id FROM tax.city_tax_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'party.cust_ledger_entry', entry_no, id FROM party.cust_ledger_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'party.detailed_cust_ledger_entry', entry_no, id FROM party.detailed_cust_ledger_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'party.vendor_ledger_entry', entry_no, id FROM party.vendor_ledger_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'party.detailed_vendor_ledger_entry', entry_no, id FROM party.detailed_vendor_ledger_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'bank.bank_ledger_entry', entry_no, id FROM bank.bank_ledger_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'fa.fa_ledger_entry', entry_no, id FROM fa.fa_ledger_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'inv.item_ledger_entry', entry_no, id FROM inv.item_ledger_entry
    UNION ALL SELECT tenant_id, company_id, document_no, posting_date, 'inv.value_entry', entry_no, id FROM inv.value_entry
    UNION ALL SELECT tenant_id, company_id, no, posting_date, 'sales.sales_invoice_header', NULL::bigint, id FROM sales.sales_invoice_header
    UNION ALL SELECT tenant_id, company_id, no, posting_date, 'sales.sales_cr_memo_header', NULL::bigint, id FROM sales.sales_cr_memo_header
    UNION ALL SELECT tenant_id, company_id, no, posting_date, 'purchase.purch_inv_header', NULL::bigint, id FROM purchase.purch_inv_header
    UNION ALL SELECT tenant_id, company_id, no, posting_date, 'purchase.purch_cr_memo_header', NULL::bigint, id FROM purchase.purch_cr_memo_header
    UNION ALL SELECT tenant_id, company_id, no, posting_date, 'bank.posted_cash_voucher', NULL::bigint, id FROM bank.posted_cash_voucher;
COMMENT ON VIEW audit.document_entry IS 'Navigate (BC Document Entry T265 / page 344): filter by company_id, document_no and optionally posting_date.';
