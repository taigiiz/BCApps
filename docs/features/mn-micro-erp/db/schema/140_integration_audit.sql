-- =============================================================================
-- 140_integration_audit.sql
-- Transactional outbox / inbox, API idempotency keys, background jobs (BC Job Queue
-- T472/T474), change log (BC T405), posting log, document navigation (BC Navigate T265),
-- and the generic row_version / audit triggers attached to every mutable table.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- integration.fn_has_forbidden_ebarimt_keys (D-J3) is defined in 010_platform.sql (used from 120/130 on).

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
    depends_on_id    uuid,                         -- FK ON DELETE SET NULL: a purged (DONE) predecessor no longer blocks
    lease_owner      text,
    lease_until      timestamptz,
    last_error       text,
    processed_at     timestamptz,
    request_id       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (depends_on_id) REFERENCES integration.outbox (id) ON DELETE SET NULL,
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
COMMENT ON TABLE integration.outbox IS 'Transactional outbox (ADR-0012): written in the posting transaction, dispatched after commit. Replaces BC Job Queue Entry for side effects (eBarimt, e-mail, webhooks). Finished rows are purged after 30 days (integration.fn_purge_expired); references to them are set NULL.';

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
    response_headers jsonb,                         -- CR #67/#76 (API-IDEM-04/12): replayed Location / ETag / Content-Location only
    resource_id    uuid,
    company_id     uuid,                            -- CR #67: company of the request (archive, export, audit filters)
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL DEFAULT now() + interval '7 days',
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (tenant_id, key),
    CHECK (response_headers IS NULL OR (jsonb_typeof(response_headers) = 'object'
           AND response_headers - ARRAY['Location','ETag','Content-Location'] = '{}'::jsonb)),
    CHECK (status <> 'COMPLETED' OR response_code IS NOT NULL),
    -- the replayed response of a posting/print call must not keep the receipt QR or lottery (D-J3)
    CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(response_body))
);
CREATE INDEX ix_idempotency_key__expires ON integration.idempotency_key (expires_at);
CREATE INDEX ix_idempotency_key__company ON integration.idempotency_key (tenant_id, company_id, created_at);
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

-- Cron: Quartz syntax in UTC (Ulaanbaatar = UTC+8). enabled = false: R2 functionality (switched on with the release).
INSERT INTO integration.job_definition (code, description, scope, cron, max_attempts, timeout, enabled) VALUES
    ('outbox.dispatch',          'Dispatch pending outbox messages',                      'SYSTEM', NULL, 1, interval '30 seconds', true),
    ('ebarimt.receipt.send',     'Send one eBarimt receipt (POST /rest/receipt)',          'PER_COMPANY', NULL, 1, interval '30 seconds', true),
    ('ebarimt.send_data',        'GET /rest/sendData every 4 hours per PosAPI instance (ADR-0013)', 'PER_POSAPI_INSTANCE', '0 0 */4 * * ?', 3, interval '30 seconds', true),
    ('ebarimt.health_probe',     'GET /rest/info health probe: 4 failures = DOWN, 2 successes = UP (MON-02)', 'PER_POSAPI_INSTANCE', '0/30 * * * * ?', 1, interval '5 seconds', true),
    ('ebarimt.info_poll',        'GET /rest/info: left lotteries, last sendData, merchant activation (REG-04)', 'PER_POSAPI_INSTANCE', '0 0/5 * * * ?', 3, interval '30 seconds', true),
    ('ebarimt.lease_reaper',     'Resolve eBarimt sends whose outbox lease expired (12 §10.6)', 'SYSTEM', '0 0/1 * * * ?', 1, interval '30 seconds', true),
    ('ebarimt.overdue_check',    'Unsent / UNKNOWN / ERROR eBarimt documents and chain invariants (12 §14.3)', 'PER_COMPANY', '0 0 * * * ?', 3, interval '30 seconds', true),
    ('ebarimt.reference_sync',   'Refresh БҮНА, tax product codes, districts (03:00 Ulaanbaatar)', 'SYSTEM', '0 0 19 * * ?', 3, interval '5 minutes', true),
    ('ebarimt.taxpayer_refresh', 'Refresh getInfo of the merchant and TIN customers (30-day cache)', 'PER_COMPANY', '0 30 19 1 * ?', 3, interval '2 minutes', true),
    ('ebarimt.purchase_import',  'Import supplier receipts (getSaleListERP), 04:00 Ulaanbaatar (R2)', 'PER_COMPANY', '0 0 20 * * ?', 3, interval '2 minutes', false),
    ('ebarimt.sales_total_reconcile', 'getSalesTotalData vs. ERP sales, 02:30 Ulaanbaatar (R2)', 'PER_COMPANY', '0 30 18 * * ?', 3, interval '2 minutes', false),
    ('fx.mongolbank_rates',      'Fetch Mongolbank official exchange rates, weekdays 10:15 Ulaanbaatar', 'SYSTEM', '0 15 2 ? * MON-FRI', 5, interval '30 seconds', true),
    ('tax.vat_threshold.check',  'Check 12-month taxable turnover against the VAT threshold, daily 06:00 Ulaanbaatar (BR-TAX-86)', 'PER_COMPANY', '0 0 22 * * ?', 3, interval '1 minute', true),
    ('tax.vat_return.export',    'Export a VAT return (ТТ-03а) file, on demand (BR-TAX-70)', 'PER_COMPANY', NULL, 3, interval '120 seconds', true),
    ('rpt.report.export',        'Asynchronous report export (API section 10), on demand', 'PER_COMPANY', NULL, 3, interval '120 seconds', true),
    ('fa.depreciation_reminder', 'Remind about the monthly depreciation run',             'PER_COMPANY', '0 0 1 1 * ?', 3, interval '30 seconds', true),
    ('gl.fiscal_year.ensure_next', 'Create next fiscal year, periods and yearly series lines (1 Dec 02:00 Ulaanbaatar, BR-PER-02)', 'PER_COMPANY', '0 0 18 30 11 ?', 3, interval '1 minute', true),
    ('rpt.filing_deadline_reminder', 'e-balance filing deadline reminder, daily 09:00 Ulaanbaatar in January-February (BR-EBL-09)', 'PER_COMPANY', '0 0 1 * 1,2 ?', 3, interval '30 seconds', true),
    ('party.application_draft.cleanup', 'Delete abandoned session application drafts (BR-AR-36, BR-AP-34)', 'PER_COMPANY', '0 30 19 * * ?', 3, interval '30 seconds', true),
    ('webhook.deliver',          'Deliver webhook events (R2, API section 11)',             'SYSTEM', NULL, 8, interval '15 seconds', false),
    ('integration.cleanup',      'Purge expired idempotency keys, outbox/inbox (30 d) and job runs (90 d)', 'SYSTEM', '0 0 19 * * ?', 3, interval '5 minutes', true);

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
    outbox_id            uuid REFERENCES integration.outbox (id) ON DELETE SET NULL,
    progress_percent     smallint CHECK (progress_percent BETWEEN 0 AND 100),   -- CR #68/#77 (API section 10)
    cancel_requested_at  timestamptz,
    result_file_key      text,                                            -- object-store key of the produced file
    result_expires_at    timestamptz,                                     -- 7-day download window
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    CHECK (company_id IS NULL OR tenant_id IS NOT NULL),
    CHECK ((result_file_key IS NULL) = (result_expires_at IS NULL)),
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

-- Foreign key from 130 (outbox is created in this file); SET NULL when the finished message is purged
ALTER TABLE ebarimt.ebarimt_document ADD FOREIGN KEY (outbox_id) REFERENCES integration.outbox (id) ON DELETE SET NULL;
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
                         'VAT_SETTLEMENT','YEAR_CLOSE','FX_ADJUSTMENT','DEPRECIATION','INVENTORY_ADJUSTMENT','OPENING_BALANCE',
                         'INPUT_VAT_WRITE_OFF')),                       -- CR #155/#168 (BR-TAX-51)
    source_id        uuid,
    source_no        text,
    status           text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
    transaction_no   bigint,
    gl_register_no   bigint,
    document_no      text,
    error_code       text,
    error_message    text,
    lock_wait_ms     integer CHECK (lock_wait_ms >= 0),         -- CR #121/#127 (PERF-06, NFR-016): advisory lock wait
    line_count       integer CHECK (line_count >= 0),           -- document / journal lines posted
    entry_count      integer CHECK (entry_count >= 0),          -- G/L entries written
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
-- Attachments, canonical renditions, annual archive (13-security CR-12/13/22, FR-PLT-011, FR-RPT-017)
-- -----------------------------------------------------------------------------
CREATE TABLE platform.attachment (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL,
    company_id     uuid NOT NULL,
    owner_table    text NOT NULL CHECK (owner_table ~ '^[a-z_]+\.[a-z_]+$'),     -- e.g. sales.sales_invoice_header, platform.company_setup
    owner_id       uuid NOT NULL,
    purpose        text NOT NULL DEFAULT 'DOCUMENT' CHECK (purpose IN ('DOCUMENT','LOGO','STAMP','EVIDENCE','OTHER')),
    file_name      text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
    media_type     text NOT NULL CHECK (media_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
    byte_size      bigint NOT NULL CHECK (byte_size > 0),
    sha256         bytea NOT NULL CHECK (octet_length(sha256) = 32),
    object_key     text NOT NULL,
    av_status      text NOT NULL DEFAULT 'PENDING' CHECK (av_status IN ('PENDING','CLEAN','INFECTED')),
    av_checked_at  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, id),
    UNIQUE (object_key)
);
CREATE INDEX ix_attachment__owner ON platform.attachment (company_id, owner_table, owner_id);
COMMENT ON TABLE platform.attachment IS 'File attached to a draft, posted document or setup row (CR #56, FR-PLT-011, ASVS V5): metadata, SHA-256, object-store key and AV scan status. Attachments of posted documents (ledger-guarded owner tables) are never deleted or changed except the AV status (910). BC Document Attachment (T1173).';

CREATE TABLE platform.document_rendition (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    company_id        uuid NOT NULL,
    document_table    text NOT NULL CHECK (document_table ~ '^[a-z_]+\.[a-z_]+$'),
    document_id       uuid NOT NULL,
    document_no       platform.document_no NOT NULL,
    template_code     text NOT NULL,
    template_version  text NOT NULL,
    sha256            bytea NOT NULL CHECK (octet_length(sha256) = 32),
    object_key        text NOT NULL,
    byte_size         bigint NOT NULL CHECK (byte_size > 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, document_table, document_id, template_version)
);
COMMENT ON TABLE platform.document_rendition IS 'Stored canonical PDF of a document per template version (CR #52, 13 §15.3): signatures (platform.document_signature.document_sha256) point to this immutable file, not to a re-render. Append-only.';

CREATE TABLE platform.archive_package (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    fiscal_year          smallint NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
    version              integer NOT NULL DEFAULT 1 CHECK (version > 0),
    status               text NOT NULL CHECK (status IN ('READY','FAILED')),
    manifest_sha256      bytea CHECK (octet_length(manifest_sha256) = 32),
    object_prefix        text,
    file_count           integer CHECK (file_count >= 0),
    total_bytes          bigint CHECK (total_bytes >= 0),
    retain_until         date NOT NULL,
    generated_at         timestamptz NOT NULL DEFAULT now(),
    generated_by         uuid DEFAULT platform.current_user_id(),
    verified_at          timestamptz,                                  -- mutable (periodic verification)
    verification_status  text NOT NULL DEFAULT 'NOT_VERIFIED' CHECK (verification_status IN ('NOT_VERIFIED','OK','MISMATCH','MISSING')),
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, fiscal_year, version),
    CHECK (status <> 'READY' OR (manifest_sha256 IS NOT NULL AND object_prefix IS NOT NULL))
);
COMMENT ON TABLE platform.archive_package IS 'Annual archive package of a company (CR #51, FR-RPT-017, SEC-RET-06..09): SHA-256 manifest of the exported files and periodic verification. Append-only; only verified_at / verification_status change (platform.fn_ledger_update(table, id uuid, ...)).';

-- -----------------------------------------------------------------------------
-- Onboarding, notifications, e-mail delivery history (15-ui-ux SCR-UI-04/06/11)
-- -----------------------------------------------------------------------------
CREATE TABLE platform.onboarding_session (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL UNIQUE,
    current_step             smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 9),
    data                     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'
                                                                       AND NOT integration.fn_has_forbidden_ebarimt_keys(data)),
    status                   text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','PROVISIONING','COMPLETED','FAILED')),
    provision_job_run_id     uuid REFERENCES integration.job_run (id),
    last_error               text,
    checklist_dismissed_at   timestamptz,
    opening_balance_skipped  boolean NOT NULL DEFAULT false,
    solo_user                boolean NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    updated_at               timestamptz,
    updated_by               uuid,
    row_version              integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id)
);
CREATE INDEX ix_onboarding_session__job ON platform.onboarding_session (provision_job_run_id) WHERE provision_job_run_id IS NOT NULL;
COMMENT ON TABLE platform.onboarding_session IS 'Resumable company setup wizard (CR #79, UX-ONB-03, BC Assisted Setup): step, choices, provisioning job, getting-started checklist flags.';

CREATE TABLE platform.user_notification (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL,
    company_id  uuid NOT NULL,
    user_id     uuid NOT NULL,
    kind        text NOT NULL CHECK (kind ~ '^[A-Z][A-Z0-9_]{1,60}$'),
    title_key   text NOT NULL,                       -- i18n key
    params      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(params)),
    link        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    read_at     timestamptz,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES platform.tenant_membership (tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX ix_user_notification__user ON platform.user_notification (tenant_id, user_id, created_at);
CREATE INDEX ix_user_notification__unread ON platform.user_notification (tenant_id, user_id) WHERE read_at IS NULL;
COMMENT ON TABLE platform.user_notification IS 'Persistent in-app notification (R2, CR #88, S-PLT-21, FR-PLT-015). Not audited.';

CREATE TABLE integration.document_delivery (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    company_id      uuid NOT NULL,
    document_table  text NOT NULL CHECK (document_table ~ '^[a-z_]+\.[a-z_]+$'),
    document_id     uuid NOT NULL,
    document_no     platform.document_no NOT NULL,
    channel         text NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL')),
    recipient       text NOT NULL,                    -- PII-P (e-mail address)
    outbox_id       uuid REFERENCES integration.outbox (id) ON DELETE SET NULL,
    status          text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED','CANCELLED')),
    last_error      text,
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid DEFAULT platform.current_user_id(),
    updated_at      timestamptz,
    updated_by      uuid,
    row_version     integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    CHECK (status <> 'SENT' OR sent_at IS NOT NULL)
);
CREATE INDEX ix_document_delivery__document ON integration.document_delivery (company_id, document_table, document_id, created_at);
CREATE INDEX ix_document_delivery__outbox ON integration.document_delivery (outbox_id) WHERE outbox_id IS NOT NULL;
COMMENT ON TABLE integration.document_delivery IS 'E-mail send history of documents (CR #83, UX-MAIL-03, FR-SAL-012); survives the 30-day outbox purge. BC Email Outbox / Sent Email.';

-- Webhooks (R2, 14-api section 11, CR #69) --------------------------------------
CREATE TABLE integration.webhook_subscription (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES platform.tenant (id),
    company_id                  uuid,
    url                         text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 2048),
    event_types                 text[] NOT NULL CHECK (cardinality(event_types) >= 1),
    status                      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','DISABLED')),
    secret_ciphertext           bytea NOT NULL,                  -- HMAC signing secret, envelope-encrypted
    previous_secret_ciphertext  bytea,                           -- rotation overlap
    previous_secret_expires_at  timestamptz,
    failing_since               timestamptz,
    disabled_reason             text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (tenant_id, id),
    CHECK ((previous_secret_ciphertext IS NULL) = (previous_secret_expires_at IS NULL)),
    CHECK (status <> 'DISABLED' OR disabled_reason IS NOT NULL)
);
CREATE INDEX ix_webhook_subscription__company ON integration.webhook_subscription (tenant_id, company_id);
COMMENT ON TABLE integration.webhook_subscription IS 'Webhook endpoint of a tenant (R2, CR #69): event types, HTTPS URL, encrypted signing secret with rotation overlap, auto-disable after sustained failures.';

CREATE TABLE integration.webhook_delivery (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    subscription_id   uuid NOT NULL,
    event_id          uuid NOT NULL,
    event_type        text NOT NULL,
    payload           jsonb NOT NULL CHECK (NOT integration.fn_has_forbidden_ebarimt_keys(payload)),
    status            text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCEEDED','FAILED','DEAD')),
    attempts          integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts      integer NOT NULL DEFAULT 8 CHECK (max_attempts >= 1),
    next_attempt_at   timestamptz NOT NULL DEFAULT now(),
    last_status_code  integer,
    last_error        text,
    delivered_at      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, subscription_id) REFERENCES integration.webhook_subscription (tenant_id, id) ON DELETE CASCADE,
    UNIQUE (subscription_id, event_id),
    CHECK (attempts <= max_attempts),
    CHECK (status <> 'SUCCEEDED' OR delivered_at IS NOT NULL)
);
CREATE INDEX ix_webhook_delivery__subscription ON integration.webhook_delivery (tenant_id, subscription_id);
CREATE INDEX ix_webhook_delivery__ready ON integration.webhook_delivery (next_attempt_at) WHERE status = 'PENDING';
COMMENT ON TABLE integration.webhook_delivery IS 'One delivery of an event to a webhook subscription with retries (R2, CR #69). Payload never contains qrData / lottery (D-J3).';

-- Foreign keys into the tables above
ALTER TABLE platform.company_setup
    ADD FOREIGN KEY (company_id, logo_attachment_id) REFERENCES platform.attachment (company_id, id),
    ADD FOREIGN KEY (company_id, stamp_attachment_id) REFERENCES platform.attachment (company_id, id);
CREATE INDEX ix_company_setup__logo ON platform.company_setup (company_id, logo_attachment_id);
CREATE INDEX ix_company_setup__stamp ON platform.company_setup (company_id, stamp_attachment_id);
ALTER TABLE rpt.filing_submission
    ADD FOREIGN KEY (company_id, evidence_attachment_id) REFERENCES platform.attachment (company_id, id);
CREATE INDEX ix_filing_submission__attachment ON rpt.filing_submission (company_id, evidence_attachment_id);

-- -----------------------------------------------------------------------------
-- Pre-tenant identity helpers (13-security CR-04): SECURITY DEFINER owned by app_rls_bypass, EXECUTE for app_user.
-- tenant_membership / tenant_invitation are tenant-isolated (fail-closed RLS), so a signed-in user's tenants and an
-- invitation token cannot be resolved without them. Every function checks that p_user_id is the caller (app.user_id).
-- -----------------------------------------------------------------------------
CREATE FUNCTION platform.fn_list_user_tenants(p_user_id uuid)
RETURNS TABLE (tenant_id uuid, name text, tenant_status text, membership_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM platform.current_user_id() THEN
        RAISE EXCEPTION 'tenants can only be listed for the signed-in user' USING ERRCODE = 'ERT01';
    END IF;
    RETURN QUERY
        SELECT t.id, t.name, t.status, m.status
          FROM platform.tenant_membership m JOIN platform.tenant t ON t.id = m.tenant_id
         WHERE m.user_id = p_user_id AND t.status NOT IN ('PURGE_APPROVED','PURGED')
         ORDER BY t.name;
END $$;
COMMENT ON FUNCTION platform.fn_list_user_tenants(uuid) IS 'Tenants of the signed-in user (tenant picker after login, 13 §5.5). Ids and names only.';

CREATE FUNCTION platform.fn_find_invitation(p_token_hash bytea)
RETURNS TABLE (invitation_id uuid, tenant_id uuid, tenant_name text, email text, role_code text, company_id uuid, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    SELECT i.id, i.tenant_id, t.name, i.email, r.code::text, i.company_id, i.expires_at
      FROM platform.tenant_invitation i
      JOIN platform.tenant t ON t.id = i.tenant_id
      JOIN platform.role r ON r.tenant_id = i.tenant_id AND r.id = i.role_id
     WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
       AND t.status = 'ACTIVE'
$$;
COMMENT ON FUNCTION platform.fn_find_invitation(bytea) IS 'Valid (open, not expired) invitation by token hash (13 §4.7), for the accept page before a tenant context exists.';

CREATE FUNCTION platform.fn_accept_invitation(p_token_hash bytea, p_user_id uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    i       platform.tenant_invitation%ROWTYPE;
    v_email text;
BEGIN
    IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM platform.current_user_id() THEN
        RAISE EXCEPTION 'an invitation can only be accepted by the signed-in user' USING ERRCODE = 'ERT01';
    END IF;
    SELECT * INTO i FROM platform.tenant_invitation
     WHERE token_hash = p_token_hash AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invitation not found, expired, revoked or already accepted' USING ERRCODE = 'ERI01';
    END IF;
    SELECT email INTO v_email FROM platform.app_user WHERE id = p_user_id AND status = 'ACTIVE';
    IF v_email IS DISTINCT FROM i.email THEN
        RAISE EXCEPTION 'the invitation was sent to another e-mail address' USING ERRCODE = 'ERI01';
    END IF;
    INSERT INTO platform.tenant_membership AS m (tenant_id, user_id, status, invited_by, joined_at, created_by)
    VALUES (i.tenant_id, p_user_id, 'ACTIVE', i.invited_by, now(), p_user_id)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'ACTIVE', joined_at = coalesce(m.joined_at, now());
    INSERT INTO platform.user_company_role (tenant_id, user_id, company_id, role_id, created_by)
    VALUES (i.tenant_id, p_user_id, i.company_id, i.role_id, i.invited_by)
    ON CONFLICT DO NOTHING;
    UPDATE platform.tenant_invitation SET accepted_at = now(), accepted_user_id = p_user_id WHERE id = i.id;
    INSERT INTO audit.security_event (tenant_id, event_type, user_id, details, request_id)
    VALUES (i.tenant_id, 'INVITATION_ACCEPTED', p_user_id, jsonb_build_object('invitation_id', i.id, 'role_id', i.role_id),
            nullif(current_setting('app.request_id', true), ''));
    RETURN i.tenant_id;
END $$;
COMMENT ON FUNCTION platform.fn_accept_invitation(bytea, uuid) IS 'Accepts an invitation for the signed-in user whose e-mail matches: membership (ACTIVE), role assignment, accepted_at, security event INVITATION_ACCEPTED. Returns the tenant id. ERI01 = invalid / expired / other e-mail.';

-- Tenant status by platform operators only (13-security CR-11, §7.8): the tenant_self policy would otherwise let a
-- tenant reactivate itself. PURGE_APPROVED requires a SECURITY_ADMIN.
CREATE FUNCTION platform.fn_set_tenant_status(p_tenant_id uuid, p_status text, p_reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_role text;
    v_old  text;
BEGIN
    SELECT role INTO v_role FROM platform.platform_operator WHERE user_id = platform.current_user_id() AND active;
    IF v_role IS NULL OR v_role NOT IN ('SUPPORT','SECURITY_ADMIN') OR (p_status = 'PURGE_APPROVED' AND v_role <> 'SECURITY_ADMIN') THEN
        RAISE EXCEPTION 'only a platform operator may change the tenant status' USING ERRCODE = '42501';
    END IF;
    IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'a reason is required' USING ERRCODE = '22023';
    END IF;
    SELECT status INTO v_old FROM platform.tenant WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tenant % not found', p_tenant_id USING ERRCODE = 'ERT01';
    END IF;
    IF v_old = 'PURGED' THEN
        RAISE EXCEPTION 'a purged tenant cannot change status' USING ERRCODE = 'ERP02';
    END IF;
    UPDATE platform.tenant SET status = p_status WHERE id = p_tenant_id;
    INSERT INTO audit.security_event (tenant_id, event_type, user_id, details, request_id)
    VALUES (p_tenant_id, 'TENANT_STATUS_CHANGED', platform.current_user_id(),
            jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason), nullif(current_setting('app.request_id', true), ''));
END $$;
COMMENT ON FUNCTION platform.fn_set_tenant_status(uuid, text, text) IS 'Changes platform.tenant.status for an active platform operator (SUPPORT / SECURITY_ADMIN; PURGE_APPROVED: SECURITY_ADMIN only) with a reason; logs TENANT_STATUS_CHANGED.';

-- True while the migrator purges p_tenant_id (13-security CR-17): session setting erp.purge_tenant = tenant id, the
-- session logged in as a member of app_owner (migrator) and the tenant is PURGE_APPROVED. Read by the guards (910).
CREATE FUNCTION platform.fn_purge_in_progress(p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    SELECT p_tenant_id IS NOT NULL
       AND current_setting('erp.purge_tenant', true) = p_tenant_id::text
       AND pg_has_role(session_user, 'app_owner', 'MEMBER')
       AND EXISTS (SELECT 1 FROM platform.tenant t WHERE t.id = p_tenant_id AND t.status = 'PURGE_APPROVED')
$$;
COMMENT ON FUNCTION platform.fn_purge_in_progress(uuid) IS 'Purge branch of the append-only guards: erp.purge_tenant is set to the tenant id, the session user is a member of app_owner (migrator) and the tenant is PURGE_APPROVED. Evidence goes to platform.tenant_purge_log.';

-- MFA flag of the signed-in user (CR #50): app_user may not UPDATE mfa_enabled directly. Enabling requires an
-- enrolled TOTP secret in identity.user_credential. Owned by app_owner; the app enforces recent authentication.
CREATE FUNCTION platform.fn_set_user_mfa(p_user_id uuid, p_enabled boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM platform.current_user_id() THEN
        RAISE EXCEPTION 'MFA can only be changed for the signed-in user' USING ERRCODE = 'ERT01';
    END IF;
    IF p_enabled AND NOT EXISTS (SELECT 1 FROM identity.user_credential c
                                  WHERE c.user_id = p_user_id AND c.totp_secret_protected IS NOT NULL) THEN
        RAISE EXCEPTION 'no enrolled authenticator for user %', p_user_id USING ERRCODE = '22023';
    END IF;
    UPDATE platform.app_user SET mfa_enabled = p_enabled WHERE id = p_user_id AND mfa_enabled IS DISTINCT FROM p_enabled;
    IF FOUND THEN
        PERFORM audit.fn_log_security_event(nullif(current_setting('app.tenant_id', true), '')::uuid, NULL, 'MFA_CHANGED', p_user_id,
                                            'SUCCESS', jsonb_build_object('enabled', p_enabled));
    END IF;
END $$;
COMMENT ON FUNCTION platform.fn_set_user_mfa(uuid, boolean) IS 'Sets platform.app_user.mfa_enabled for the signed-in user (enable only with an enrolled TOTP secret) and logs MFA_CHANGED.';

-- client_credentials token -> tenant / company / permission set (CR #47): the API resolves the client before any
-- tenant context exists, so the lookup bypasses tenant RLS (read-only, one row).
CREATE FUNCTION platform.fn_resolve_integration_client(p_oidc_client_id text)
RETURNS TABLE (client_id uuid, tenant_id uuid, company_id uuid, permission_set_id uuid, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    SELECT c.id, c.tenant_id, c.company_id, c.permission_set_id,
           c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > now())
               AND EXISTS (SELECT 1 FROM platform.tenant t WHERE t.id = c.tenant_id AND t.status = 'ACTIVE')
      FROM platform.integration_client c
     WHERE c.oidc_client_id = p_oidc_client_id
$$;
COMMENT ON FUNCTION platform.fn_resolve_integration_client(text) IS 'Maps an OAuth client_id to its tenant, optional company and permission set (FR-INT-003) before the tenant context is set. Owned by app_rls_bypass.';

-- -----------------------------------------------------------------------------
-- Retention purges (13-security CR-16/21)
-- -----------------------------------------------------------------------------
CREATE FUNCTION integration.fn_purge_expired(p_kind text, p_before timestamptz, p_limit integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_rows integer;
BEGIN
    IF p_limit IS NULL OR p_limit < 1 THEN
        RAISE EXCEPTION 'p_limit must be >= 1' USING ERRCODE = '22023';
    END IF;
    CASE p_kind
    WHEN 'IDEMPOTENCY_KEY' THEN
        DELETE FROM integration.idempotency_key WHERE id IN (
            SELECT id FROM integration.idempotency_key WHERE expires_at < least(p_before, now()) LIMIT p_limit);
    WHEN 'OUTBOX' THEN
        DELETE FROM integration.outbox WHERE id IN (
            SELECT id FROM integration.outbox
             WHERE status IN ('DONE','DEAD','CANCELLED') AND created_at < least(p_before, now() - interval '30 days')
             LIMIT p_limit);
    WHEN 'INBOX' THEN
        DELETE FROM integration.inbox WHERE id IN (
            SELECT id FROM integration.inbox
             WHERE status IN ('PROCESSED','FAILED','IGNORED') AND received_at < least(p_before, now() - interval '30 days')
             LIMIT p_limit);
    WHEN 'JOB_RUN' THEN
        DELETE FROM integration.job_run WHERE id IN (
            SELECT id FROM integration.job_run
             WHERE status IN ('SUCCEEDED','FAILED','DEAD','CANCELLED') AND created_at < least(p_before, now() - interval '90 days')
             LIMIT p_limit);
    ELSE
        RAISE EXCEPTION 'purge kind % is not allowed', p_kind USING ERRCODE = '22023';
    END CASE;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION integration.fn_purge_expired(text, timestamptz, integer) IS 'Cross-tenant retention purge for job integration.cleanup (CR #55): IDEMPOTENCY_KEY after expires_at (7 d), OUTBOX / INBOX 30 d, JOB_RUN 90 d (finished rows only; references are set NULL). Owned by app_rls_bypass, EXECUTE for app_worker only.';

CREATE FUNCTION audit.fn_purge_expired(p_table text, p_cutoff timestamptz, p_limit integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_hold    date;
    v_years   integer;
    v_cutoff  timestamptz;
    v_col     text;
    v_rows    integer;
BEGIN
    v_col := CASE p_table WHEN 'audit.row_change' THEN 'changed_at' WHEN 'audit.security_event' THEN 'changed_at'
                          WHEN 'audit.posting_log' THEN 'finished_at' WHEN 'ebarimt.ebarimt_document_event' THEN 'created_at' END;
    IF v_col IS NULL THEN
        RAISE EXCEPTION 'table % is not purgeable', p_table USING ERRCODE = '22023';
    END IF;
    SELECT legal_hold_until, greatest(10, coalesce(retention_years_override, 10)) INTO v_hold, v_years
      FROM platform.tenant WHERE id = v_tenant;
    IF v_hold IS NOT NULL AND v_hold >= current_date THEN
        RETURN 0;                                            -- legal hold (SEC-RET-03)
    END IF;
    v_cutoff := least(p_cutoff, now() - make_interval(years => coalesce(v_years, 10)));
    EXECUTE format('DELETE FROM %s WHERE ctid = ANY (ARRAY(SELECT ctid FROM %s WHERE tenant_id = $1 AND %I < $2 LIMIT $3))',
                   p_table, p_table, v_col)
       USING v_tenant, v_cutoff, p_limit;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION audit.fn_purge_expired(text, timestamptz, integer) IS 'Retention purge (10 years or the tenant override; nothing under legal hold) of audit.row_change, audit.security_event, audit.posting_log, ebarimt.ebarimt_document_event for the CURRENT tenant context (RLS applies: owned by app_owner). EXECUTE for app_worker (CR #61/#62).';

CREATE FUNCTION audit.fn_purge_platform_rows(p_cutoff timestamptz, p_limit integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_cutoff timestamptz := least(p_cutoff, now() - interval '10 years');
    v_rows   integer;
    v_more   integer;
BEGIN
    DELETE FROM audit.security_event WHERE id IN (
        SELECT id FROM audit.security_event WHERE tenant_id IS NULL AND changed_at < v_cutoff LIMIT p_limit);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    DELETE FROM audit.row_change WHERE id IN (
        SELECT id FROM audit.row_change WHERE tenant_id = '00000000-0000-0000-0000-000000000000' AND changed_at < v_cutoff LIMIT p_limit);
    GET DIAGNOSTICS v_more = ROW_COUNT;
    RETURN v_rows + v_more;
END $$;
COMMENT ON FUNCTION audit.fn_purge_platform_rows(timestamptz, integer) IS 'Purges tenant-less security events and nil-tenant change-log rows older than 10 years (SEC-RET-11, CR #62); invisible under RLS, so owned by app_rls_bypass. EXECUTE for app_worker.';

-- -----------------------------------------------------------------------------
-- Operations without tenant data (13-security CR-10, SEC-RLS-08): the only thing app_ops (erp_ops_ro) may call.
-- -----------------------------------------------------------------------------
CREATE FUNCTION integration.fn_ops_health()
RETURNS TABLE (area text, key text, status text, row_count bigint, oldest timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    SELECT 'outbox'::text, o.topic, o.status, count(*), min(o.created_at)
      FROM integration.outbox o WHERE o.status IN ('PENDING','PROCESSING','DEAD') GROUP BY o.topic, o.status
    UNION ALL
    SELECT 'job_run', j.job_definition_code, j.status, count(*), min(j.created_at)
      FROM integration.job_run j WHERE j.status IN ('QUEUED','RUNNING','FAILED','DEAD') GROUP BY j.job_definition_code, j.status
    UNION ALL
    SELECT 'ebarimt_document', d.ebarimt_type, d.status, count(*), min(d.created_at)
      FROM ebarimt.ebarimt_document d WHERE d.status IN ('PENDING','SENT','ERROR','UNKNOWN') GROUP BY d.ebarimt_type, d.status
    UNION ALL
    SELECT 'posapi_instance', i.code, i.health_status, i.left_lotteries::bigint, i.last_send_data_at
      FROM ebarimt.posapi_instance i
$$;
COMMENT ON FUNCTION integration.fn_ops_health() IS 'PII-free aggregate health for operations (queues, failed jobs, unsent eBarimt documents, PosAPI instance health): no tenant / company ids, no payloads. Owned by app_rls_bypass; EXECUTE for app_ops and app_worker.';

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
    v_redact  text[];
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
    -- Secrets and encrypted / keyed PII never reach the change log, only the fact that they changed
    -- (*_enc, *_hmac, *ciphertext, wrapped_key, token_hash; CR #44/#45/#58, ADR-0023 D).
    SELECT array_agg(k) INTO v_redact FROM jsonb_object_keys(v_row) k
     WHERE k ~ '(_enc|_hmac|ciphertext)$' OR k IN ('wrapped_key','token_hash');
    IF v_redact IS NOT NULL THEN
        IF v_old IS NOT NULL THEN
            SELECT v_old || jsonb_object_agg(k, CASE WHEN v_old -> k = 'null'::jsonb THEN 'null'::jsonb ELSE '"[redacted]"'::jsonb END)
              INTO v_old FROM unnest(v_redact) k;
        END IF;
        IF v_new IS NOT NULL THEN
            SELECT v_new || jsonb_object_agg(k, CASE WHEN v_new -> k = 'null'::jsonb THEN 'null'::jsonb ELSE '"[redacted]"'::jsonb END)
              INTO v_new FROM unnest(v_redact) k;
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
COMMENT ON FUNCTION audit.fn_row_change() IS 'AFTER INSERT/UPDATE/DELETE row trigger writing audit.row_change (TG_ARGV = extra columns to ignore). Values of secret / encrypted columns are stored as "[redacted]". Owned by app_rls_bypass so it works in any context.';

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

-- Identity / tenant-status / purge / ops helpers (CR #42, #50, #55, #57, #61, #62, #49)
GRANT SELECT, INSERT, UPDATE ON platform.tenant_membership, platform.tenant_invitation TO app_rls_bypass;
GRANT SELECT, INSERT ON platform.user_company_role TO app_rls_bypass;
GRANT SELECT ON platform.role, platform.app_user, platform.platform_operator, platform.integration_client TO app_rls_bypass;
GRANT UPDATE ON platform.tenant TO app_rls_bypass;
GRANT SELECT, DELETE ON integration.idempotency_key, integration.outbox, integration.inbox, integration.job_run TO app_rls_bypass;
GRANT SELECT ON ebarimt.ebarimt_document, ebarimt.posapi_instance TO app_rls_bypass;
GRANT SELECT, DELETE ON audit.security_event, audit.row_change TO app_rls_bypass;
ALTER FUNCTION platform.fn_list_user_tenants(uuid) OWNER TO app_rls_bypass;
ALTER FUNCTION platform.fn_find_invitation(bytea) OWNER TO app_rls_bypass;
ALTER FUNCTION platform.fn_accept_invitation(bytea, uuid) OWNER TO app_rls_bypass;
ALTER FUNCTION platform.fn_set_tenant_status(uuid, text, text) OWNER TO app_rls_bypass;
ALTER FUNCTION platform.fn_purge_in_progress(uuid) OWNER TO app_rls_bypass;
ALTER FUNCTION integration.fn_purge_expired(text, timestamptz, integer) OWNER TO app_rls_bypass;
ALTER FUNCTION audit.fn_purge_platform_rows(timestamptz, integer) OWNER TO app_rls_bypass;
ALTER FUNCTION integration.fn_ops_health() OWNER TO app_rls_bypass;
ALTER FUNCTION platform.fn_resolve_integration_client(text) OWNER TO app_rls_bypass;
REVOKE ALL ON FUNCTION platform.fn_resolve_integration_client(text), platform.fn_set_user_mfa(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_resolve_integration_client(text), platform.fn_set_user_mfa(uuid, boolean) TO app_user;
REVOKE ALL ON FUNCTION platform.fn_list_user_tenants(uuid), platform.fn_find_invitation(bytea), platform.fn_accept_invitation(bytea, uuid),
                       platform.fn_set_tenant_status(uuid, text, text), integration.fn_purge_expired(text, timestamptz, integer),
                       audit.fn_purge_expired(text, timestamptz, integer), audit.fn_purge_platform_rows(timestamptz, integer),
                       integration.fn_ops_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_list_user_tenants(uuid), platform.fn_find_invitation(bytea), platform.fn_accept_invitation(bytea, uuid),
                          platform.fn_set_tenant_status(uuid, text, text) TO app_user;
GRANT EXECUTE ON FUNCTION integration.fn_purge_expired(text, timestamptz, integer), audit.fn_purge_expired(text, timestamptz, integer),
                          audit.fn_purge_platform_rows(timestamptz, integer) TO app_worker;
GRANT EXECUTE ON FUNCTION integration.fn_ops_health() TO app_ops, app_worker;

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
        -- not audited: projections, imports, UI state, recalculated drafts
        CONTINUE WHEN (t.table_schema, t.table_name) IN (('inv','item_cost_state'), ('bank','bank_statement_line'),
                                                         ('platform','user_preference'), ('platform','saved_view'),
                                                         ('fa','depreciation_run_line'));
        -- columns maintained by the system whose changes alone are noise (the ledger is the audit trail, D-I3)
        v_args := CASE (t.table_schema || '.' || t.table_name)
                       WHEN 'platform.number_series_line'   THEN '''last_no_used'', ''last_date_used'', ''open'''
                       WHEN 'platform.app_user'             THEN '''last_login_at'''
                       WHEN 'platform.integration_client'   THEN '''last_used_at'''
                       WHEN 'bank.counterparty_account_map' THEN '''times_confirmed'', ''last_seen_at'''
                       WHEN 'fa.fa_depreciation_book'       THEN '''acquisition_date'', ''last_depreciation_date'', ''disposal_date'''
                       WHEN 'fa.fixed_asset'                THEN '''status'''
                       ELSE '' END;
        EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change(%s)',
                       t.table_name, t.table_schema, t.table_name, v_args);
    END LOOP;
END
$$;

-- Security link tables have no row_version, so the loop above does not see them: role assignments, permissions,
-- includes and tenant keys are change-logged explicitly (CR #39, BC R-PLATFORM-SECURITY-API-10, FR-PLT-009, NFR-051).
CREATE TRIGGER trg_user_company_role_audit AFTER INSERT OR UPDATE OR DELETE ON platform.user_company_role
    FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change();
CREATE TRIGGER trg_permission_audit AFTER INSERT OR UPDATE OR DELETE ON platform.permission
    FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change();
CREATE TRIGGER trg_permission_set_include_audit AFTER INSERT OR UPDATE OR DELETE ON platform.permission_set_include
    FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change();
CREATE TRIGGER trg_role_permission_set_audit AFTER INSERT OR UPDATE OR DELETE ON platform.role_permission_set
    FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change();
CREATE TRIGGER trg_tenant_key_audit AFTER INSERT OR UPDATE OR DELETE ON platform.tenant_key
    FOR EACH ROW EXECUTE FUNCTION audit.fn_row_change();

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
