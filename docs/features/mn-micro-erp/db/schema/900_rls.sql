-- =============================================================================
-- 900_rls.sql
-- Table privileges and row-level security (DECISIONS D-B3, ADR-0004).
--  * Every table with a tenant_id column: ENABLE + FORCE ROW LEVEL SECURITY, policy on
--    tenant_id = current_setting('app.tenant_id')::uuid (fail-closed when unset).
--  * Company-scoped tables (company_id NOT NULL): additional RESTRICTIVE policy on
--    company_id = current_setting('app.company_id')::uuid.
--  * Global catalogs (no tenant_id): no RLS, SELECT only for app roles.
-- Context helper: platform.fn_set_context(tenant, company, user, request) defined in 010.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    s text;
BEGIN
    FOREACH s IN ARRAY ARRAY['platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt',
                             'ebarimt','integration','audit']
    LOOP
        EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO app_user, app_readonly', s);
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO app_user', s);
    END LOOP;
END
$$;

-- DML on tenant-owned tables (ledgers lose UPDATE/DELETE again in 910).
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT c.table_schema, c.table_name
          FROM information_schema.columns c
          JOIN information_schema.tables tb USING (table_schema, table_name)
         WHERE c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE'
           AND c.table_schema IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt',
                                  'ebarimt','integration','audit')
    LOOP
        EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %I.%I TO app_user', t.table_schema, t.table_name);
    END LOOP;
END
$$;

-- Counters are written only by the SECURITY DEFINER allocators (platform.fn_next_document_no,
-- platform.fn_next_entry_no, ebarimt.fn_next_bill_seq): a direct UPDATE/DELETE could skip or reuse
-- legal numbers (D-C7, D-K3, D-K4).
REVOKE INSERT, UPDATE, DELETE ON platform.number_series_counter, platform.ledger_counter, ebarimt.pos_counter FROM app_user;
-- ... and so is the allocation log that proves gaplessness (CR #119)
REVOKE INSERT, UPDATE, DELETE ON platform.number_allocation FROM app_user;

-- Tenant-less tables the application writes under its own policies. Column-level UPDATE (CR #50, 13 §7.8, SEC-ID-11):
-- a tenant cannot change its own status / plan / limits / legal hold (platform.fn_set_tenant_status, operators only),
-- and a user cannot change its own status or MFA flag (platform.fn_set_user_mfa).
GRANT INSERT ON platform.tenant, platform.app_user TO app_user;
GRANT UPDATE (name, default_language, require_mfa_all_users, updated_at, updated_by) ON platform.tenant TO app_user;
GRANT UPDATE (display_name, phone, preferred_language, last_login_at, updated_at, updated_by) ON platform.app_user TO app_user;
-- Tenant data keys (CR #45): insert, rewrap (wrapped_key / kek_id) and retire only; deleted only by the purge.
REVOKE UPDATE, DELETE ON platform.tenant_key FROM app_user;
GRANT UPDATE (wrapped_key, kek_id, retired_at) ON platform.tenant_key TO app_user;
-- Operator-only tables: invisible to application and report roles.
REVOKE ALL ON platform.tenant_purge_log FROM app_user, app_readonly;
-- PosAPI instances (CR #84): tenants see no base_url / operator_tin; the worker reads and maintains everything.
REVOKE SELECT ON ebarimt.posapi_instance FROM app_user, app_readonly;
GRANT SELECT (id, code, environment, max_merchants, status, last_send_data_at, left_lotteries, merchant_soft_limit,
              receipts_per_day_soft_limit, health_status, last_info_at, version, created_at, updated_at)
    ON ebarimt.posapi_instance TO app_user, app_readonly;
GRANT SELECT ON ebarimt.posapi_instance TO app_worker;
-- audit.row_change is written only by the audit trigger (owned by app_rls_bypass).
REVOKE INSERT, UPDATE, DELETE ON audit.row_change FROM app_user;
-- audit.security_event: tenant rows may be inserted by the app; NULL-tenant rows only via audit.fn_log_security_event.
REVOKE UPDATE, DELETE ON audit.security_event FROM app_user;
-- Worker-maintained global reference data.
GRANT INSERT, UPDATE ON fx.official_exchange_rate, ebarimt.classification_code, ebarimt.tax_product_code,
                        ebarimt.district, ebarimt.barcode_reference, ebarimt.taxpayer_info TO app_worker;
GRANT INSERT, UPDATE ON ebarimt.taxpayer_info TO app_user;            -- CR #23: getInfo on demand (customer TIN check)
GRANT UPDATE (last_send_data_at, left_lotteries, updated_at, health_status, last_info_at, last_info_error, version)
    ON ebarimt.posapi_instance TO app_worker;
GRANT INSERT, UPDATE ON integration.job_run TO app_worker;

-- Functions: SECURITY DEFINER helpers are granted explicitly; everything else keeps PUBLIC EXECUTE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform, gl, tax, party, sales, purchase, bank, fx, fa, inv, rpt, ebarimt, integration, audit
    TO app_user;
-- ... except the cross-tenant worker helpers (140): granted to app_worker only, never to the web role.
REVOKE EXECUTE ON FUNCTION integration.fn_claim_outbox(text, text[], integer, interval),
                           platform.fn_list_active_companies(uuid, uuid, integer) FROM app_user;

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
-- Global table platform.tenant: a session sees only its own tenant row. Provisioning sets
-- app.tenant_id to the new id before inserting it.
ALTER TABLE platform.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON platform.tenant
    USING (id = platform.current_tenant_id())
    WITH CHECK (id = platform.current_tenant_id());

-- Global identity: visible to members of the current tenant; writable only by the user itself.
ALTER TABLE platform.app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.app_user FORCE ROW LEVEL SECURITY;
CREATE POLICY app_user_visible ON platform.app_user FOR SELECT
    USING (id = platform.current_user_id()
           OR EXISTS (SELECT 1 FROM platform.tenant_membership m
                       WHERE m.user_id = app_user.id
                         AND m.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid));
CREATE POLICY app_user_self_write ON platform.app_user FOR INSERT
    WITH CHECK (id = platform.current_user_id());
CREATE POLICY app_user_self_update ON platform.app_user FOR UPDATE
    USING (id = platform.current_user_id())
    WITH CHECK (id = platform.current_user_id());

DO $$
DECLARE
    t record;
    v_nullable_tenant boolean;
    v_company_scoped  boolean;
BEGIN
    FOR t IN
        SELECT c.table_schema, c.table_name, c.is_nullable
          FROM information_schema.columns c
          JOIN information_schema.tables tb USING (table_schema, table_name)
         WHERE c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE'
           AND c.table_schema IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt',
                                  'ebarimt','integration','audit')
         ORDER BY 1, 2
    LOOP
        v_nullable_tenant := (t.is_nullable = 'YES');
        SELECT EXISTS (SELECT 1 FROM information_schema.columns c2
                        WHERE c2.table_schema = t.table_schema AND c2.table_name = t.table_name
                          AND c2.column_name = 'company_id' AND c2.is_nullable = 'NO')
          INTO v_company_scoped;

        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.table_schema, t.table_name);
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.table_schema, t.table_name);

        IF (t.table_schema, t.table_name) = ('audit', 'security_event') THEN
            -- tenant-less rows (pre-tenant failed logins) are NOT system data: invisible to every tenant
            EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = platform.current_tenant_id()) '
                           'WITH CHECK (tenant_id = platform.current_tenant_id())', t.table_schema, t.table_name);
        ELSIF NOT v_nullable_tenant THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = platform.current_tenant_id()) '
                           'WITH CHECK (tenant_id = platform.current_tenant_id())', t.table_schema, t.table_name);
        ELSIF (t.table_schema, t.table_name) = ('integration', 'job_run') THEN
            -- system job runs (tenant_id NULL) are visible/writable to the worker
            EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I '
                           'USING (tenant_id IS NULL OR tenant_id = platform.current_tenant_id()) '
                           'WITH CHECK (tenant_id IS NULL OR tenant_id = platform.current_tenant_id())',
                           t.table_schema, t.table_name);
        ELSE
            -- system rows (tenant_id NULL, e.g. shipped permission sets) are readable, never writable
            EXECUTE format('CREATE POLICY tenant_read_system ON %I.%I FOR SELECT '
                           'USING (tenant_id IS NULL OR tenant_id = platform.current_tenant_id())',
                           t.table_schema, t.table_name);
            EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = platform.current_tenant_id()) '
                           'WITH CHECK (tenant_id = platform.current_tenant_id())', t.table_schema, t.table_name);
        END IF;

        IF v_company_scoped THEN
            EXECUTE format('CREATE POLICY company_isolation ON %I.%I AS RESTRICTIVE '
                           'USING (company_id = platform.current_company_id()) '
                           'WITH CHECK (company_id = platform.current_company_id())', t.table_schema, t.table_name);
        END IF;
    END LOOP;
END
$$;

-- Self-check: every tenant table is protected; no app role can bypass RLS.
DO $$
DECLARE
    v_missing text;
BEGIN
    SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ') INTO v_missing
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE c.relkind IN ('r','p') AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'tables without forced RLS: %', v_missing;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('app_owner','app_user','app_readonly','app_worker') AND rolbypassrls) THEN
        RAISE EXCEPTION 'an application role has BYPASSRLS';
    END IF;
END
$$;
