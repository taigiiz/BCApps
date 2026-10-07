-- =============================================================================
-- seed/mn_60_security.sql - MN localization package, part 6: default roles of a tenant (D-I2, FR-PLT-005).
--
-- Roles are tenant-scoped (platform.role); they bundle the SYSTEM permission sets of mn_00_catalogs.sql.
--   OWNER                бүх эрх (incl. users/roles, reopening a closed period - D-D3 "зөвхөн Owner")
--   ACCOUNTANT           everything except security and period reopen
--   EXTERNAL_ACCOUNTANT  same as ACCOUNTANT (contract accountant; time limit via support/membership, FR-PLT-005)
--   SALES_CLERK          customers, sales documents (edit + post), cash receipts (МХ-1)
--   VIEWER               read everything + financial reports
-- Assigning a user (platform.user_company_role) is done by the wizard / invitation flow, not by the seed.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

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
      FROM (VALUES
        ('OWNER', ARRAY['*']),
        ('ACCOUNTANT', ARRAY['ERP_BASIC','ERP_READ_ALL','ERP_CUSTOMER_EDIT','ERP_VENDOR_EDIT','ERP_ITEM_EDIT',
                             'ERP_SALES_POST','ERP_PURCH_POST','ERP_CASH','ERP_BANKING','ERP_JOURNALS_POST',
                             'ERP_RECEIVABLES','ERP_PAYABLES','ERP_INV_EDIT','ERP_FA_EDIT','ERP_FIN_REPORTS','ERP_VAT',
                             'ERP_PERIOD_CLOSE','ERP_SETUP','ERP_EBARIMT_OPS','ERP_AUDIT_READ','ERP_PII_UNMASK']),
        ('EXTERNAL_ACCOUNTANT', ARRAY['ERP_BASIC','ERP_READ_ALL','ERP_CUSTOMER_EDIT','ERP_VENDOR_EDIT','ERP_ITEM_EDIT',
                             'ERP_SALES_POST','ERP_PURCH_POST','ERP_CASH','ERP_BANKING','ERP_JOURNALS_POST',
                             'ERP_RECEIVABLES','ERP_PAYABLES','ERP_INV_EDIT','ERP_FA_EDIT','ERP_FIN_REPORTS','ERP_VAT',
                             'ERP_PERIOD_CLOSE','ERP_SETUP','ERP_EBARIMT_OPS','ERP_AUDIT_READ','ERP_PII_UNMASK']),
        ('SALES_CLERK', ARRAY['ERP_BASIC','ERP_CUSTOMER_EDIT','ERP_SALES_POST','ERP_CASH_RECEIPT']),
        ('VIEWER', ARRAY['ERP_BASIC','ERP_READ_ALL','ERP_FIN_REPORTS'])
      ) AS v(role_code, sets)
      JOIN platform.role r ON r.tenant_id = v_tenant AND r.code = v.role_code
      JOIN platform.permission_set s ON s.tenant_id IS NULL AND s.is_system AND (s.code = ANY (v.sets) OR '*' = ANY (v.sets))
    ON CONFLICT (role_id, permission_set_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION platform.fn_mn_seed_roles() IS
    'MN localization package: built-in roles OWNER, ACCOUNTANT, EXTERNAL_ACCOUNTANT, SALES_CLERK, VIEWER of the current tenant mapped to the system permission sets (D-I2). Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION platform.fn_mn_seed_roles() TO app_user;
