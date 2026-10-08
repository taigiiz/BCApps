-- =============================================================================
-- seed/mn_60_security.sql - MN localization package, part 6: default roles of a tenant (D-I2, FR-PLT-005).
--
-- Roles are tenant-scoped (platform.role); they bundle the SYSTEM permission sets of mn_00_catalogs.sql.
-- Normative mapping: 13-security-audit-tenancy §6.5 (13 CR-23 (7)).
--   OWNER                ERP_SUPER only (wildcards + protected objects; reopening a closed period - D-D3 "зөвхөн Owner")
--   ACCOUNTANT           everything except security, tenant admin, PII unmask and period reopen
--   EXTERNAL_ACCOUNTANT  same as ACCOUNTANT (contract accountant; user_company_role.expires_at, SEC-ID-07)
--   SALES_CLERK          customers, sales documents (edit + post), cash receipts (МХ-1), signing (ERP_DOC_SIGN)
--   VIEWER               read everything + financial reports
-- Assigning a user (platform.user_company_role) is done by the wizard / invitation flow, not by the seed.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE OR REPLACE FUNCTION platform.fn_mn_role_sets()
RETURNS TABLE (role_code text, sets text[])
LANGUAGE sql IMMUTABLE AS $$
    SELECT * FROM (VALUES
        ('OWNER', ARRAY['ERP_SUPER']),
        ('ACCOUNTANT', ARRAY['ERP_BASIC','ERP_READ_ALL','ERP_CUSTOMER_EDIT','ERP_VENDOR_EDIT','ERP_ITEM_EDIT',
                             'ERP_SALES_POST','ERP_SALES_RETURN','ERP_SALES_ANY','ERP_PURCH_POST','ERP_CASH','ERP_BANKING',
                             'ERP_JOURNALS_POST','ERP_RECEIVABLES','ERP_PAYABLES','ERP_FIN_REPORTS','ERP_SETUP','ERP_VAT',
                             'ERP_PERIOD_CLOSE','ERP_EBARIMT_OPS','ERP_AUDIT_READ','ERP_ARCHIVE','ERP_DOC_APPROVE',
                             'ERP_INV_EDIT','ERP_FA_EDIT']),
        ('EXTERNAL_ACCOUNTANT', ARRAY['ERP_BASIC','ERP_READ_ALL','ERP_CUSTOMER_EDIT','ERP_VENDOR_EDIT','ERP_ITEM_EDIT',
                             'ERP_SALES_POST','ERP_SALES_RETURN','ERP_SALES_ANY','ERP_PURCH_POST','ERP_CASH','ERP_BANKING',
                             'ERP_JOURNALS_POST','ERP_RECEIVABLES','ERP_PAYABLES','ERP_FIN_REPORTS','ERP_SETUP','ERP_VAT',
                             'ERP_PERIOD_CLOSE','ERP_EBARIMT_OPS','ERP_AUDIT_READ','ERP_ARCHIVE','ERP_DOC_APPROVE',
                             'ERP_INV_EDIT','ERP_FA_EDIT']),
        ('SALES_CLERK', ARRAY['ERP_BASIC','ERP_CUSTOMER_EDIT','ERP_SALES_POST','ERP_CASH_RECEIPT','ERP_DOC_SIGN']),
        ('VIEWER', ARRAY['ERP_BASIC','ERP_READ_ALL','ERP_FIN_REPORTS'])
    ) AS v(role_code, sets)
$$;
COMMENT ON FUNCTION platform.fn_mn_role_sets() IS 'MN localization package: normative built-in role -> system permission set mapping (13 §6.5, CR-23 (7)). Data only.';
GRANT EXECUTE ON FUNCTION platform.fn_mn_role_sets() TO app_user;

CREATE OR REPLACE FUNCTION platform.fn_mn_seed_roles() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant uuid := platform.current_tenant_id();
    v_rows   integer := 0;
    n        integer;
BEGIN
    INSERT INTO platform.role (tenant_id, code, name, name_en, is_builtin)
    SELECT v_tenant, v.code, v.name, v.name_en, true
      FROM (VALUES ('OWNER',               'Эзэмшигч',              'Owner'),
                   ('ACCOUNTANT',          'Нягтлан бодогч',        'Accountant'),
                   ('EXTERNAL_ACCOUNTANT', 'Гэрээт нягтлан бодогч', 'External accountant'),
                   ('SALES_CLERK',         'Борлуулагч, кассчин',   'Sales clerk'),
                   ('VIEWER',              'Үзэгч',                 'Viewer')) AS v(code, name, name_en)
    ON CONFLICT (tenant_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO platform.role_permission_set (tenant_id, role_id, permission_set_id)
    SELECT v_tenant, r.id, s.id
      FROM platform.fn_mn_role_sets() v
      JOIN platform.role r ON r.tenant_id = v_tenant AND r.code = v.role_code
      JOIN platform.permission_set s ON s.tenant_id IS NULL AND s.is_system AND s.code = ANY (v.sets)
    ON CONFLICT (role_id, permission_set_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- Migration of tenants provisioned before 13 CR-23 (7): drop the system-set mappings of the BUILT-IN roles that
    -- are no longer in the normative table (OWNER had every set; ACCOUNTANT / EXTERNAL_ACCOUNTANT had ERP_PII_UNMASK).
    -- Custom roles and tenant-defined sets are never touched.
    DELETE FROM platform.role_permission_set rp
     USING platform.role r, platform.permission_set s, platform.fn_mn_role_sets() v
     WHERE rp.role_id = r.id AND rp.permission_set_id = s.id
       AND r.tenant_id = v_tenant AND r.is_builtin AND r.code = v.role_code
       AND s.tenant_id IS NULL AND s.is_system AND NOT (s.code = ANY (v.sets));
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION platform.fn_mn_seed_roles() IS
    'MN localization package: built-in roles OWNER, ACCOUNTANT, EXTERNAL_ACCOUNTANT, SALES_CLERK, VIEWER of the current tenant mapped to the system permission sets (D-I2, 13 §6.5). Inserts missing rows; removes system-set mappings of built-in roles that are not in platform.fn_mn_role_sets() (CR-23 (7) migration: run once per existing tenant).';
GRANT EXECUTE ON FUNCTION platform.fn_mn_seed_roles() TO app_user;
