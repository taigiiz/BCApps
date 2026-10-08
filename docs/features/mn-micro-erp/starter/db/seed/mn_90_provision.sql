-- =============================================================================
-- seed/mn_90_provision.sql - MN localization package: one-call company onboarding.
--
--   SELECT platform.fn_provision_company_mn(:tenant_id, :company_id);            -- first fiscal year = existing first year,
--                                                                                 -- else go-live year, else today (UB)
--   SELECT platform.fn_provision_company_mn(:tenant_id, :company_id, 2027);      -- explicit first fiscal year
--   SELECT platform.fn_provision_company_mn(:tenant_id, :company_id, 2026, DATE '2026-01-01');  -- explicit rates date
--
-- Preconditions: platform.tenant and platform.company exist (tenant provisioning, 02-architecture §7.7) and the
-- global catalogs are loaded (db/seed/legal_parameters.sql, db/seed/mn_00_catalogs.sql). platform.company_setup is
-- created with defaults (LCY MNT, precision 0.01, not VAT-registered) when the wizard has not written it yet;
-- set vat_registered / tin / district_code BEFORE provisioning so that the VAT matrix (D-E5) and the eBarimt
-- merchant setup are seeded accordingly.
--
-- Properties:
--   * one database transaction (the caller's); any error rolls everything back (FR-PLT-003 AC2);
--   * idempotent: every step inserts only what is missing and never overwrites edited rows, so a second call
--     returns zero inserts and can safely repair a partially provisioned company. Without p_fiscal_year a repeat
--     call anchors on the company's earliest existing fiscal year, so a call in a later year (or after go_live_date
--     changed) does not open extra years and series lines;
--   * SECURITY INVOKER: runs under the caller's RLS context; the function sets app.tenant_id/app.company_id for
--     its own work (transaction-local) and restores the previous values before returning. A caller whose context
--     is bound to another tenant is refused (ERT01): the function never switches a request to a foreign tenant;
--   * serialized per company with a transaction-level advisory lock.
-- p_as_of (optional) = date whose statutory rates are seeded (VAT / city tax setup); default greatest(today, 01-01 of
-- the first fiscal year).
-- Returns a jsonb summary: {"company_id", "fiscal_year", "rates_as_of", "inserted": {step: rows}, "total_inserted"}.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- 16 SCR-T06: optional p_as_of (date of the statutory rates); replaces the 3-argument version.
DROP FUNCTION IF EXISTS platform.fn_provision_company_mn(uuid, uuid, integer);
CREATE OR REPLACE FUNCTION platform.fn_provision_company_mn(p_tenant_id uuid, p_company_id uuid, p_fiscal_year integer DEFAULT NULL,
                                                            p_as_of date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_prev_tenant  text := current_setting('app.tenant_id', true);
    v_prev_company text := current_setting('app.company_id', true);
    v_prev_user    text := current_setting('app.user_id', true);
    v_prev_request text := current_setting('app.request_id', true);
    v_company_name text;
    v_go_live      date;
    v_time_zone    text;
    v_today        date;
    v_fy           integer;
    v_first_fy     integer;
    v_as_of        date;
    v_steps        jsonb := '{}'::jsonb;
    v_total        integer := 0;
    n              integer;
BEGIN
    IF p_tenant_id IS NULL OR p_company_id IS NULL THEN
        RAISE EXCEPTION 'tenant and company are required' USING ERRCODE = '22004';
    END IF;
    -- Tenant isolation (D-K6): a request already bound to a tenant may provision only its own companies. Without
    -- this check the function would silently switch the RLS context to p_tenant_id (onboarding of a new tenant
    -- runs without a tenant context).
    IF nullif(v_prev_tenant, '') IS NOT NULL AND nullif(v_prev_tenant, '')::uuid IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'provisioning refused: the caller''s context is tenant %, not %', v_prev_tenant, p_tenant_id
            USING ERRCODE = 'ERT01';
    END IF;
    PERFORM platform.fn_set_context(p_tenant_id, p_company_id, nullif(v_prev_user, '')::uuid,
                                    coalesce(nullif(v_prev_request, ''), 'provision-mn:' || p_company_id::text));

    SELECT c.name INTO v_company_name FROM platform.company c WHERE c.id = p_company_id AND c.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'company % does not exist in tenant %', p_company_id, p_tenant_id USING ERRCODE = 'ERT01';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('provision-mn:' || p_company_id::text, 0));

    -- Company-wide settings (D-C2: LCY MNT, precision 0.01) and the G/L singletons (BC CU2 Company-Initialize)
    INSERT INTO platform.company_setup (tenant_id, company_id, legal_name)
    VALUES (p_tenant_id, p_company_id, v_company_name)
    ON CONFLICT (company_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_steps := v_steps || jsonb_build_object('company_setup', n); v_total := v_total + n;
    PERFORM gl.fn_initialize_company();

    SELECT go_live_date, time_zone INTO v_go_live, v_time_zone FROM platform.company_setup WHERE company_id = p_company_id;
    SELECT min(year) INTO v_first_fy FROM gl.fiscal_year WHERE company_id = p_company_id;
    v_today := (now() AT TIME ZONE coalesce(v_time_zone, 'Asia/Ulaanbaatar'))::date;
    -- a repeat call keeps the original first year (idempotent across calendar years and go-live edits)
    v_fy    := coalesce(p_fiscal_year, v_first_fy, extract(year FROM v_go_live)::integer, extract(year FROM v_today)::integer);
    -- statutory rates in force at the start of use; tests and back-dated onboarding pass p_as_of (16 SCR-T06)
    v_as_of := coalesce(p_as_of, greatest(v_today, make_date(v_fy, 1, 1)));

    -- Order matters: groups -> accounts -> setups that reference accounts -> numbering -> cash box -> journals ...
    n := tax.fn_mn_seed_vat_groups();                  v_steps := v_steps || jsonb_build_object('vat_groups', n);        v_total := v_total + n;
    n := party.fn_mn_seed_gen_posting_groups();        v_steps := v_steps || jsonb_build_object('gen_posting_groups', n); v_total := v_total + n;
    n := gl.fn_mn_seed_chart_of_accounts();            v_steps := v_steps || jsonb_build_object('chart_of_accounts', n);  v_total := v_total + n;
    n := tax.fn_mn_seed_vat_setup(v_as_of);            v_steps := v_steps || jsonb_build_object('vat_setup', n);          v_total := v_total + n;
    n := party.fn_mn_seed_posting_setup();             v_steps := v_steps || jsonb_build_object('posting_setup', n);      v_total := v_total + n;
    n := bank.fn_mn_seed_bank_posting_groups();        v_steps := v_steps || jsonb_build_object('bank_posting_groups', n); v_total := v_total + n;
    n := fx.fn_mn_seed_currencies();                   v_steps := v_steps || jsonb_build_object('currencies', n);         v_total := v_total + n;
    n := fa.fn_mn_seed_fixed_assets();                 v_steps := v_steps || jsonb_build_object('fixed_assets', n);       v_total := v_total + n;
    n := inv.fn_mn_seed_inventory();                   v_steps := v_steps || jsonb_build_object('inventory', n);          v_total := v_total + n;
    n := platform.fn_mn_ensure_number_series(v_fy) + platform.fn_mn_ensure_number_series(v_fy + 1);
                                                       v_steps := v_steps || jsonb_build_object('number_series', n);      v_total := v_total + n;
    n := platform.fn_mn_seed_reason_codes();           v_steps := v_steps || jsonb_build_object('reason_codes', n);       v_total := v_total + n;
    n := gl.fn_mn_ensure_fiscal_year(v_fy) + gl.fn_mn_ensure_fiscal_year(v_fy + 1);
                                                       v_steps := v_steps || jsonb_build_object('fiscal_years', n);       v_total := v_total + n;
    n := bank.fn_mn_seed_cash_account();               v_steps := v_steps || jsonb_build_object('cash_account', n);       v_total := v_total + n;
    n := gl.fn_mn_seed_journals();                     v_steps := v_steps || jsonb_build_object('journals', n);           v_total := v_total + n;
    n := gl.fn_mn_seed_gl_setup();                     v_steps := v_steps || jsonb_build_object('gl_setup', n);           v_total := v_total + n;
    n := party.fn_mn_seed_payment_methods();           v_steps := v_steps || jsonb_build_object('payment_methods_templates', n); v_total := v_total + n;
    n := platform.fn_mn_seed_module_setups();          v_steps := v_steps || jsonb_build_object('module_setups', n);      v_total := v_total + n;
    n := tax.fn_mn_seed_tax_setup(coalesce(v_first_fy, v_fy));
                                                       v_steps := v_steps || jsonb_build_object('tax_setup', n);          v_total := v_total + n;
    n := rpt.fn_mn_seed_financial_reports();           v_steps := v_steps || jsonb_build_object('financial_reports', n);  v_total := v_total + n;
    n := tax.fn_mn_seed_vat_statement();               v_steps := v_steps || jsonb_build_object('vat_statement', n);      v_total := v_total + n;
    n := rpt.fn_mn_seed_aging();                       v_steps := v_steps || jsonb_build_object('aging', n);              v_total := v_total + n;
    n := platform.fn_mn_seed_roles();                  v_steps := v_steps || jsonb_build_object('roles', n);              v_total := v_total + n;

    UPDATE platform.company SET status = 'ACTIVE' WHERE id = p_company_id AND status = 'PROVISIONING';

    -- restore the caller's context (transaction-local settings)
    PERFORM set_config('app.tenant_id',  coalesce(v_prev_tenant, ''),  true),
            set_config('app.company_id', coalesce(v_prev_company, ''), true),
            set_config('app.user_id',    coalesce(v_prev_user, ''),    true),
            set_config('app.request_id', coalesce(v_prev_request, ''), true);

    RETURN jsonb_build_object('company_id', p_company_id, 'fiscal_year', v_fy, 'rates_as_of', v_as_of,
                              'inserted', v_steps, 'total_inserted', v_total);
END $$;
COMMENT ON FUNCTION platform.fn_provision_company_mn(uuid, uuid, integer, date) IS
    'MN localization package: provisions a new company with the Mongolian defaults (proposed chart of accounts, posting groups and setups, VAT/city tax, number series, fiscal years, journals, Form A reports, ТТ-03а, aging, roles). Idempotent; returns a jsonb summary of inserted rows.';
GRANT EXECUTE ON FUNCTION platform.fn_provision_company_mn(uuid, uuid, integer, date) TO app_user;
