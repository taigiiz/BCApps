-- =============================================================================
-- tests/seed_checks.sql - checks of the MN localization package (db/seed/mn_*.sql).
-- Run after `apply.sh --seed` on a scratch database as a superuser / bootstrap role
-- (apply.sh --seed --test runs it after smoke.sql):
--   psql -v ON_ERROR_STOP=1 -d erp_scratch -f db/tests/seed_checks.sql
-- Fixtures (tenant, companies) are inserted as the bootstrap role; provisioning, the sanity queries and the
-- test postings run as app_user (no BYPASSRLS, FORCE RLS applies). Expected failures are captured with
-- ON_ERROR_STOP off and asserted through LAST_ERROR_SQLSTATE (reset to 'none' before each block).
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\set VERBOSITY terse
\pset footer off

\set tenant_s   '''e0000000-0000-0000-0000-000000000001'''
\set company_s1 '''e1000000-0000-0000-0000-000000000001'''
\set company_s2 '''e2000000-0000-0000-0000-000000000001'''
\set user_s     '''e9000000-0000-0000-0000-000000000001'''
\set tenant_x   '''e0000000-0000-0000-0000-000000000002'''
\set company_x  '''e3000000-0000-0000-0000-000000000001'''

CREATE FUNCTION pg_temp.assert(p_ok boolean, p_msg text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL: %', p_msg;
    END IF;
    RETURN 'PASS: ' || p_msg;
END $$;

-- BC filter on account numbers: '1100..1198|1300' (ranges compare as text; all seed numbers have 4 digits)
CREATE FUNCTION pg_temp.in_filter(p_no text, p_filter text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(bool_or(CASE WHEN position('..' IN f) > 0
                                 THEN p_no BETWEEN split_part(f, '..', 1) AND split_part(f, '..', 2)
                                 ELSE p_no = f END), false)
      FROM unnest(string_to_array(p_filter, '|')) f
$$;

-- -----------------------------------------------------------------------------
-- 0. Global catalogs (mn_00_catalogs.sql)
-- -----------------------------------------------------------------------------
SELECT pg_temp.assert((SELECT count(*) FROM rpt.statement_line WHERE form_code = 'A' AND statement_code = 'BS') = 45
                  AND (SELECT count(*) FROM rpt.statement_line WHERE form_code = 'A' AND statement_code = 'IS') = 27
                  AND (SELECT count(*) FROM rpt.statement_line WHERE form_code = 'A' AND statement_code = 'EQ') = 9
                  AND (SELECT count(*) FROM rpt.statement_line WHERE form_code = 'A' AND statement_code = 'CF') = 48,
                      'Form A statement lines loaded: СБТ 45, ОДТ 27, ӨӨТ 9, МГТ 48');
SELECT pg_temp.assert((SELECT bool_and(statement_line_id IS NOT NULL) FROM rpt.cash_flow_category WHERE activity <> 'NONE' OR code = 'FX_EFFECT'),
                      'every operating/investing/financing cash-flow category points to an МГТ line');
SELECT pg_temp.assert((SELECT count(*) FROM platform.permission_set WHERE tenant_id IS NULL AND is_system) = 30
                  AND (SELECT count(*) FROM platform.permission WHERE tenant_id IS NULL) >= 200,
                      'system permission sets (30) and their permissions are loaded');
SELECT pg_temp.assert((SELECT bool_and(c.relforcerowsecurity) FROM pg_class c
                        WHERE c.oid IN ('platform.permission_set'::regclass, 'platform.permission'::regclass,
                                        'platform.permission_set_include'::regclass)),
                      'FORCE ROW LEVEL SECURITY restored on the permission tables after the system-set seed');

-- -----------------------------------------------------------------------------
-- 1. Fixtures: one tenant, two companies (VAT payer with TIN, and a bare company without company_setup)
-- -----------------------------------------------------------------------------
BEGIN;
INSERT INTO platform.tenant (id, name, status) VALUES (:tenant_s, 'Seed check tenant', 'ACTIVE');
INSERT INTO platform.company (id, tenant_id, name, status) VALUES
    (:company_s1, :tenant_s, 'Seed НӨАТ ХХК', 'PROVISIONING'), (:company_s2, :tenant_s, 'Seed Жижиг ХХК', 'ACTIVE');
INSERT INTO platform.company_setup (tenant_id, company_id, legal_name, tin, vat_registered, vat_registered_from,
                                    city_tax_payer, district_code)
VALUES (:tenant_s, :company_s1, 'Seed НӨАТ ХХК', '37900846788', true, DATE '2020-01-01', true, '2501');
INSERT INTO platform.app_user (id, email, display_name) VALUES (:user_s, 'seed.owner@example.mn', 'Seed Owner');
INSERT INTO platform.tenant_membership (tenant_id, user_id) VALUES (:tenant_s, :user_s);
INSERT INTO platform.tenant (id, name, status) VALUES (:tenant_x, 'Seed check other tenant', 'ACTIVE');
INSERT INTO platform.company (id, tenant_id, name, status) VALUES (:company_x, :tenant_x, 'Other tenant ХХК', 'PROVISIONING');
COMMIT;

-- -----------------------------------------------------------------------------
-- 2. Provisioning twice (idempotent), as app_user
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s2, :user_s, 'seed-check-1') \gset
SELECT platform.fn_provision_company_mn(:tenant_s, :company_s1) AS prov1 \gset
SELECT pg_temp.assert(platform.current_company_id() = :company_s2, 'caller context (company S2) restored after provisioning company S1');
COMMIT;
SELECT (:'prov1'::jsonb ->> 'fiscal_year')::integer AS fy, (:'prov1'::jsonb ->> 'fiscal_year')::integer + 1 AS fy_next,
       (:'prov1'::jsonb ->> 'fiscal_year')::integer + 2 AS fy_out,
       (:'prov1'::jsonb ->> 'total_inserted')::integer AS first_total \gset
SELECT pg_temp.assert(:first_total > 800, 'first provisioning of S1 inserted ' || :first_total || ' rows (fiscal year ' || :fy || ')');

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_provision_company_mn(:tenant_s, :company_s1) AS prov2 \gset
COMMIT;
SELECT pg_temp.assert((:'prov2'::jsonb ->> 'total_inserted')::integer = 0,
                      'second provisioning of S1 is a no-op (idempotent): ' || (:'prov2'::jsonb ->> 'inserted'));

-- third call after go_live_date moved to next year: still anchored on the existing first fiscal year (no extra
-- year, no extra series lines), i.e. idempotent across calendar years / go-live edits
UPDATE platform.company_setup SET go_live_date = make_date(:fy + 1, 7, 1) WHERE company_id = :company_s1;
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_provision_company_mn(:tenant_s, :company_s1) AS prov2b \gset
COMMIT;
UPDATE platform.company_setup SET go_live_date = NULL WHERE company_id = :company_s1;
SELECT pg_temp.assert((:'prov2b'::jsonb ->> 'total_inserted')::integer = 0 AND (:'prov2b'::jsonb ->> 'fiscal_year')::integer = :fy,
                      'third provisioning of S1 (go-live moved to ' || (:fy + 1) || ') is a no-op anchored on fiscal year ' || :fy);

-- tenant isolation: a request bound to tenant S cannot provision a company of another tenant (ERT01), nothing written
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-cross-tenant') \gset
SELECT platform.fn_provision_company_mn(:tenant_x, :company_x);
COMMIT;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERT01'
                  AND NOT EXISTS (SELECT 1 FROM gl.gl_account WHERE company_id = :company_x),
                      'provisioning a company of another tenant from a tenant-bound context is refused (ERT01, D-K6)');

-- fail loudly: the chart seed alone, before the VAT / Gen. groups exist, refuses to create unmapped accounts (55000)
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_x, :company_x, NULL, 'seed-check-order') \gset
SELECT gl.fn_mn_seed_chart_of_accounts();
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '55000',
                      'chart seed without its prerequisites fails (55000) instead of inserting accounts without default posting groups');

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_provision_company_mn(:tenant_s, :company_s2, :fy) AS prov3 \gset
SELECT platform.fn_provision_company_mn(:tenant_s, :company_s2, :fy) AS prov4 \gset
COMMIT;
SELECT pg_temp.assert((:'prov3'::jsonb -> 'inserted' ->> 'company_setup')::integer = 1
                  AND (:'prov3'::jsonb -> 'inserted' ->> 'roles')::integer = 0
                  AND (:'prov4'::jsonb ->> 'total_inserted')::integer = 0,
                      'S2: company_setup created with defaults, tenant roles reused, second call no-op');

-- -----------------------------------------------------------------------------
-- 3. Sanity checks per company (run for S1 = VAT payer and S2 = not registered)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-s1') \gset

SELECT pg_temp.assert((SELECT status = 'ACTIVE' FROM platform.company WHERE id = :company_s1), 'company S1 switched PROVISIONING -> ACTIVE');
SELECT pg_temp.assert((SELECT lcy_code = 'MNT' AND amount_rounding_precision = 0.01 FROM platform.company_setup),
                      'company setup: LCY MNT, amount precision 0.01 (D-C2)');

-- chart of accounts
SELECT pg_temp.assert((SELECT count(*) FROM gl.gl_account) = 182 AND (SELECT count(*) FROM gl.gl_account WHERE account_type = 'POSTING') = 138,
                      'chart of accounts: 182 accounts, 138 posting');
SELECT pg_temp.assert((SELECT count(*) FROM gl.gl_account_category) = 49, 'account categories: 6 roots + 43 subcategories');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM gl.gl_account WHERE account_type = 'POSTING'
                                     AND (statement_line_id IS NULL OR cash_flow_category_id IS NULL OR account_category IS NULL
                                          OR account_subcategory_id IS NULL)),
                      'every posting account maps to a Form A statement line, an МГТ category and an account category');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM gl.gl_account a JOIN rpt.statement_line s ON s.id = a.statement_line_id
                                   WHERE s.is_total OR s.statement_code <> CASE a.income_balance WHEN 'BALANCE_SHEET' THEN 'BS' ELSE 'IS' END),
                      'statement lines are leaf lines of СБТ (balance sheet accounts) / ОДТ (income statement accounts)');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM gl.gl_account a JOIN rpt.statement_line s ON s.id = a.statement_line_id
                                   WHERE a.account_type <> 'POSTING'),
                      'only posting accounts carry a statement line');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM gl.gl_account a JOIN gl.gl_account_category c ON c.id = a.account_subcategory_id
                                   WHERE c.account_category <> a.account_category),
                      'account subcategory belongs to the account''s category');
SELECT pg_temp.assert((SELECT bool_and(no ~ '^[1-9][0-9]{3}$') FROM gl.gl_account), 'all account numbers have 4 digits');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM gl.gl_account WHERE account_type IN ('END_TOTAL','TOTAL') AND totaling IS NULL),
                      'END_TOTAL accounts carry a totaling filter');
SELECT pg_temp.assert((SELECT count(*) FROM gl.gl_account WHERE account_type = 'BEGIN_TOTAL') = (SELECT count(*) FROM gl.gl_account WHERE account_type = 'END_TOTAL'),
                      'BEGIN_TOTAL / END_TOTAL accounts are paired');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM unnest(ARRAY['1100','1110','1200','1300','1400','1600','1690','2100','2200','2300',
                                                             '3400','3500','5100','6100','7200','8300','8500','8600']) r(no)
                                   WHERE NOT EXISTS (SELECT 1 FROM gl.gl_account a WHERE a.no = r.no AND a.account_type = 'POSTING')),
                      'all account numbers used by 01-requirements examples exist as posting accounts');

-- control accounts are not open to manual journals (FR-GL-003)
SELECT pg_temp.assert(NOT EXISTS (
        SELECT 1 FROM gl.gl_account a
         WHERE a.direct_posting
           AND a.id IN (SELECT receivables_account_id FROM party.customer_posting_group
                        UNION SELECT payables_account_id FROM party.vendor_posting_group
                        UNION SELECT gl_account_id FROM bank.bank_account_posting_group
                        UNION SELECT sales_vat_account_id FROM tax.vat_posting_setup
                        UNION SELECT purchase_vat_account_id FROM tax.vat_posting_setup
                        UNION SELECT reverse_chrg_vat_account_id FROM tax.vat_posting_setup
                        UNION SELECT payable_account_id FROM tax.city_tax_code)),
                      'receivable, payable, VAT, city tax and bank/cash accounts have direct_posting = false');

-- every account referenced by a setup exists, is a posting account and is not blocked
CREATE TEMP VIEW seed_setup_accounts AS
    SELECT 'general_posting_setup' AS source, u.acc FROM party.general_posting_setup g
      CROSS JOIN LATERAL unnest(ARRAY[g.sales_account_id, g.sales_line_disc_account_id, g.sales_inv_disc_account_id,
                                      g.sales_credit_memo_account_id, g.purch_account_id, g.purch_line_disc_account_id,
                                      g.purch_inv_disc_account_id, g.purch_credit_memo_account_id, g.cogs_account_id,
                                      g.inventory_adjmt_account_id, g.direct_cost_applied_account_id]) u(acc)
    UNION ALL SELECT 'vat_posting_setup', u.acc FROM tax.vat_posting_setup v
      CROSS JOIN LATERAL unnest(ARRAY[v.sales_vat_account_id, v.purchase_vat_account_id, v.reverse_chrg_vat_account_id]) u(acc)
    UNION ALL SELECT 'customer_posting_group', u.acc FROM party.customer_posting_group c
      CROSS JOIN LATERAL unnest(ARRAY[c.receivables_account_id, c.invoice_rounding_account_id, c.appln_rounding_account_id]) u(acc)
    UNION ALL SELECT 'vendor_posting_group', u.acc FROM party.vendor_posting_group c
      CROSS JOIN LATERAL unnest(ARRAY[c.payables_account_id, c.invoice_rounding_account_id, c.appln_rounding_account_id]) u(acc)
    UNION ALL SELECT 'bank_account_posting_group', gl_account_id FROM bank.bank_account_posting_group
    UNION ALL SELECT 'fa_posting_group', u.acc FROM fa.fa_posting_group f
      CROSS JOIN LATERAL unnest(ARRAY[f.acquisition_cost_account_id, f.accum_depreciation_account_id, f.depreciation_expense_account_id,
                                      f.gains_on_disposal_account_id, f.losses_on_disposal_account_id,
                                      f.write_down_expense_account_id, f.write_down_account_id]) u(acc)
    UNION ALL SELECT 'inventory_posting_setup', inventory_account_id FROM inv.inventory_posting_setup
    UNION ALL SELECT 'general_ledger_setup', u.acc FROM gl.general_ledger_setup s
      CROSS JOIN LATERAL unnest(ARRAY[s.retained_earnings_account_id, s.current_year_result_account_id, s.invoice_rounding_account_id,
                                      s.cash_over_account_id, s.cash_short_account_id, s.realized_fx_gain_account_id,
                                      s.realized_fx_loss_account_id, s.unrealized_fx_gain_account_id, s.unrealized_fx_loss_account_id]) u(acc)
    UNION ALL SELECT 'city_tax', u.acc FROM tax.city_tax_code t CROSS JOIN LATERAL unnest(ARRAY[t.payable_account_id, t.expense_account_id]) u(acc)
    UNION ALL SELECT 'city_tax_setup', settlement_account_id FROM tax.city_tax_setup
    UNION ALL SELECT 'currency', u.acc FROM fx.currency c
      CROSS JOIN LATERAL unnest(ARRAY[c.realized_gains_account_id, c.realized_losses_account_id,
                                      c.unrealized_gains_account_id, c.unrealized_losses_account_id]) u(acc)
    UNION ALL SELECT 'text_to_account_mapping', u.acc FROM bank.text_to_account_mapping m
      CROSS JOIN LATERAL unnest(ARRAY[m.debit_account_id, m.credit_account_id]) u(acc);
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM seed_setup_accounts s LEFT JOIN gl.gl_account a ON a.id = s.acc
                                   WHERE s.acc IS NOT NULL AND (a.id IS NULL OR a.account_type <> 'POSTING' OR a.blocked)),
                      'every account of general/VAT/customer/vendor/bank/FA/inventory/G/L/city-tax/currency setup is an existing, unblocked posting account ('
                      || (SELECT count(*) FROM seed_setup_accounts WHERE acc IS NOT NULL) || ' references)');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM party.general_posting_setup
                                   WHERE sales_account_id IS NULL OR purch_account_id IS NULL OR sales_credit_memo_account_id IS NULL
                                      OR purch_credit_memo_account_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM tax.vat_posting_setup WHERE sales_vat_account_id IS NULL OR purchase_vat_account_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM gl.general_ledger_setup s
                                   WHERE s.retained_earnings_account_id IS NULL OR s.current_year_result_account_id IS NULL
                                      OR s.cash_over_account_id IS NULL OR s.cash_short_account_id IS NULL
                                      OR s.invoice_rounding_account_id IS NULL OR s.realized_fx_gain_account_id IS NULL
                                      OR s.unrealized_fx_loss_account_id IS NULL),
                      'mandatory accounts of general posting setup, VAT posting setup and G/L setup are filled');
SELECT pg_temp.assert((SELECT a.no = '3500' FROM gl.general_ledger_setup s JOIN gl.gl_account a ON a.id = s.current_year_result_account_id)
                  AND (SELECT a.no = '3400' FROM gl.general_ledger_setup s JOIN gl.gl_account a ON a.id = s.retained_earnings_account_id),
                      'year-end close: current-year result 3500, retained earnings 3400 (D-D4)');

-- posting groups and matrices
SELECT pg_temp.assert((SELECT string_agg(code, ',' ORDER BY code) FROM party.gen_bus_posting_group) = 'DOMESTIC,EXPORT,RELATED'
                  AND (SELECT string_agg(code, ',' ORDER BY code) FROM party.gen_prod_posting_group) = 'FA,GOODS,MISC,SERVICES'
                  AND (SELECT string_agg(code, ',' ORDER BY code) FROM party.customer_posting_group) = 'DOMESTIC,EMPLOYEE,FOREIGN'
                  AND (SELECT string_agg(code, ',' ORDER BY code) FROM party.vendor_posting_group) = 'CUSTOMS,DOMESTIC,EMPLOYEE,FOREIGN'
                  AND (SELECT count(*) FROM bank.bank_account_posting_group) = 7,
                      'posting groups: gen bus 3, gen prod 4, customer 3, vendor 4, bank 7');
SELECT pg_temp.assert((SELECT count(*) FROM party.general_posting_setup) = 16
                  AND NOT EXISTS (SELECT 1 FROM party.gen_bus_posting_group b CROSS JOIN party.gen_prod_posting_group p
                                   WHERE NOT EXISTS (SELECT 1 FROM party.general_posting_setup g
                                                      WHERE g.gen_bus_posting_group_id = b.id AND g.gen_prod_posting_group_id = p.id))
                  AND (SELECT count(*) FROM party.general_posting_setup WHERE gen_bus_posting_group_id IS NULL) = 4,
                      'general posting setup: full 3 x 4 matrix + 4 ''*'' fallback rows (D-F1)');
SELECT pg_temp.assert((SELECT count(*) FROM tax.vat_posting_setup) = 19
                  AND NOT EXISTS (SELECT 1 FROM tax.vat_bus_posting_group b CROSS JOIN tax.vat_prod_posting_group p
                                   WHERE p.code IN ('VAT10','VAT0','EXEMPT','NOVAT')
                                     AND NOT EXISTS (SELECT 1 FROM tax.vat_posting_setup v
                                                      WHERE v.vat_bus_posting_group_id = b.id AND v.vat_prod_posting_group_id = p.id)),
                      'VAT posting setup: 4 x 4 base matrix + reverse charge + customs VAT rows (19)');
SELECT pg_temp.assert((SELECT bool_and(v.vat_percent = round(tax.fn_tax_parameter_numeric('vat.standard_rate', current_date) * 100, 5)
                                        AND v.vat_rate_param_code = 'vat.standard_rate')
                         FROM tax.vat_posting_setup v WHERE v.ebarimt_tax_type = 'VAT_ABLE')
                  AND (SELECT bool_and(vat_percent = 0) FROM tax.vat_posting_setup WHERE ebarimt_tax_type <> 'VAT_ABLE'),
                      'VAT % comes from tax_parameter vat.standard_rate (10) on taxable rows, 0 elsewhere (D-E7)');
SELECT pg_temp.assert((SELECT string_agg(b.code || 'x' || p.code || ':' || v.vat_calculation_type, ',' ORDER BY b.code, p.code)
                         FROM tax.vat_posting_setup v JOIN tax.vat_bus_posting_group b ON b.id = v.vat_bus_posting_group_id
                         JOIN tax.vat_prod_posting_group p ON p.id = v.vat_prod_posting_group_id
                        WHERE v.vat_calculation_type <> 'NORMAL')
                      = 'DOMESTICxCUSTOMS_VAT:FULL_VAT,IMPORTxCUSTOMS_VAT:FULL_VAT,IMPORTxIMPORT_SERVICE:REVERSE_CHARGE',
                      'calculation types: customs VAT = FULL_VAT, non-resident services = REVERSE_CHARGE (D-E1)');
SELECT pg_temp.assert((SELECT bool_and(non_deductible_vat_percent = 0) FROM tax.vat_posting_setup),
                      'S1 is VAT-registered: input VAT fully deductible');
SELECT pg_temp.assert(NOT EXISTS (
        WITH bus AS (SELECT vat_bus_posting_group_id AS id FROM party.customer_template
                     UNION SELECT vat_bus_posting_group_id FROM party.vendor_template
                     UNION SELECT default_vat_bus_posting_group_id FROM party.gen_bus_posting_group),
             prod AS (SELECT vat_prod_posting_group_id AS id FROM gl.gl_account WHERE vat_prod_posting_group_id IS NOT NULL
                      UNION SELECT default_vat_prod_posting_group_id FROM party.gen_prod_posting_group)
        SELECT 1 FROM bus CROSS JOIN prod
         WHERE NOT EXISTS (SELECT 1 FROM tax.vat_posting_setup v
                            WHERE v.vat_bus_posting_group_id = bus.id AND v.vat_prod_posting_group_id = prod.id)),
                      'every VAT Bus. group used by a template / Gen. Bus. default x every VAT Prod. group used by an account / Gen. Prod. default has a VAT setup row');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM tax.vat_posting_setup s
                                    JOIN gl.gl_account sa ON sa.id = s.sales_vat_account_id
                                    JOIN gl.gl_account pa ON pa.id = s.purchase_vat_account_id
                                    LEFT JOIN gl.gl_account ra ON ra.id = s.reverse_chrg_vat_account_id
                                   WHERE sa.account_category <> 'LIABILITIES' OR pa.account_category <> 'ASSETS'
                                      OR (s.vat_calculation_type = 'REVERSE_CHARGE' AND ra.account_category IS DISTINCT FROM 'LIABILITIES')),
                      'sales VAT -> liability (2300), purchase VAT -> asset (1300), reverse charge -> liability (2305) on every VAT setup row');
SELECT pg_temp.assert((SELECT bool_and(purch_line_disc_account_id = purch_account_id AND purch_inv_disc_account_id = purch_account_id)
                         FROM party.general_posting_setup g JOIN party.gen_prod_posting_group p ON p.id = g.gen_prod_posting_group_id
                        WHERE p.code = 'SERVICES'),
                      'a purchase discount on services reduces the service cost itself (7200), never cost of sales');
SELECT pg_temp.assert((SELECT a.no = '2365' AND NOT a.direct_posting AND s.line_code = '2.1.1.3' AND f.code = 'OP_TAXES_PAID'
                         FROM party.vendor_template t JOIN party.vendor_posting_group g ON g.id = t.vendor_posting_group_id
                         JOIN gl.gl_account a ON a.id = g.payables_account_id
                         JOIN rpt.statement_line s ON s.id = a.statement_line_id
                         JOIN rpt.cash_flow_category f ON f.id = a.cash_flow_category_id
                        WHERE t.code = 'CUSTOMS'),
                      'customs authority: payable 2365 (control, СБТ 2.1.1.3 tax liability), paid as МГТ 1.2.7 taxes, not trade payables');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM gl.gl_account a JOIN rpt.cash_flow_category f ON f.id = a.cash_flow_category_id
                                   WHERE f.direction = 'INFLOW'
                                     AND a.id IN (SELECT receivables_account_id FROM party.customer_posting_group WHERE code = 'EMPLOYEE'
                                                  UNION SELECT payables_account_id FROM party.vendor_posting_group WHERE code = 'EMPLOYEE')),
                      'employee advances / expense claims (1360, 2210) are classified as cash outflows in МГТ');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM fa.fa_posting_group WHERE write_down_expense_account_id IS NULL OR write_down_account_id IS NULL)
                  AND (SELECT bool_and(gl_integration_write_down) FROM fa.depreciation_book WHERE code = 'NBB'),
                      'FA posting groups carry write-down accounts (8450 / accumulated depreciation) for the G/L-integrated NBB book');
SELECT pg_temp.assert((SELECT string_agg(m.mapping_text || ':' || coalesce(d.no, '-') || '/' || coalesce(c.no, '-'), ',' ORDER BY m.line_no)
                         FROM bank.text_to_account_mapping m LEFT JOIN gl.gl_account d ON d.id = m.debit_account_id
                         LEFT JOIN gl.gl_account c ON c.id = m.credit_account_id)
                      = 'ШИМТГЭЛ:-/8300,ХАДГАЛАМЖИЙН ХҮҮ:8110/-,ХҮҮНИЙ ОРЛОГО:8110/-',
                      'bank text rules follow BC T1251 (debit account = inflow, credit account = outflow): fee outflow -> 8300, interest inflow -> 8110');
SELECT 'WARN: ' || count(*) || ' VAT setup rows carry the eBarimt taxProductCode placeholder TBD (replace from getProductTaxCode)' AS warning
  FROM tax.vat_posting_setup WHERE ebarimt_tax_product_code = 'TBD';
SELECT pg_temp.assert((SELECT rate_percent = round(tax.fn_tax_parameter_numeric('city_tax.rate_ub', current_date) * 100, 5)
                              AND rate_param_code = 'city_tax.rate_ub' FROM tax.city_tax_code WHERE code = 'UB')
                  AND (SELECT enabled FROM tax.city_tax_setup),
                      'city tax UB: rate from tax_parameter city_tax.rate_ub (2 %), enabled for a city-tax payer (D-E6)');

-- numbering (D-C7)
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM unnest(ARRAY['SI','SC','PI','PC','KO','KZ','BR','BP','GJ','OB','CL']) r(code)
                                   WHERE NOT EXISTS (SELECT 1 FROM platform.number_series s
                                                      WHERE s.code = r.code AND s.gapless AND s.reset_yearly AND NOT s.manual_nos)),
                      'legal document series (invoices, credit memos, МХ-1/МХ-2, bank and journal vouchers, opening, closing) are gapless and yearly');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM platform.number_series s
                                   WHERE s.reset_yearly
                                     AND (SELECT count(*) FROM platform.number_series_line l
                                           WHERE l.number_series_id = s.id AND l.starting_date IN (make_date(:fy, 1, 1), make_date(:fy_next, 1, 1))) <> 2),
                      'every yearly series has a line for ' || :fy || ' and ' || :fy_next);
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM sales.sales_setup WHERE customer_nos_id IS NULL OR invoice_nos_id IS NULL OR credit_memo_nos_id IS NULL
                                                                     OR posted_invoice_nos_id IS NULL OR posted_credit_memo_nos_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM purchase.purchase_setup WHERE vendor_nos_id IS NULL OR invoice_nos_id IS NULL OR credit_memo_nos_id IS NULL
                                                                     OR posted_invoice_nos_id IS NULL OR posted_credit_memo_nos_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM inv.inventory_setup WHERE item_nos_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM gl.journal_template WHERE no_series_id IS NULL OR posting_no_series_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM bank.bank_account WHERE kind = 'CASH' AND (cash_receipt_no_series_id IS NULL OR cash_payment_no_series_id IS NULL))
                  AND NOT EXISTS (SELECT 1 FROM party.customer_template WHERE no_series_id IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM party.vendor_template WHERE no_series_id IS NULL),
                      'number series exist for every document type (sales, purchase, items, journals, cash vouchers, master data)');
SELECT pg_temp.assert((SELECT string_agg(s.code || '=' || l.prefix, ',' ORDER BY s.code)
                         FROM platform.number_series s JOIN platform.number_series_line l ON l.number_series_id = s.id
                        WHERE s.code IN ('SI','KO') AND l.starting_date = make_date(:fy, 1, 1))
                      = 'KO=KO-' || :fy || '-,SI=SI-' || :fy || '-',
                      'series format PREFIX-YYYY-##### (SI-' || :fy || '-, KO-' || :fy || '-)');

-- fiscal calendar
SELECT pg_temp.assert((SELECT count(*) FROM gl.fiscal_year WHERE year IN (:fy, :fy_next) AND status = 'OPEN') = 2
                  AND (SELECT count(*) FROM gl.accounting_period WHERE status = 'OPEN'
                          AND starting_date BETWEEN make_date(:fy, 1, 1) AND make_date(:fy_next, 12, 1)) = 24
                  AND (SELECT count(*) FROM tax.vat_return_period) = 24
                  AND (SELECT bool_and(extract(day FROM due_date) = 10) FROM tax.vat_return_period),
                      'fiscal years ' || :fy || '/' || :fy_next || ': 24 open monthly periods, 24 VAT return periods due on the 10th');

-- journals, cash box, payment methods, templates, master data
SELECT pg_temp.assert((SELECT string_agg(code, ',' ORDER BY code) FROM gl.journal_template) = 'CASH_RECEIPT,CLOSING,GENERAL,OPENING,PAYMENT'
                  AND (SELECT count(*) FROM gl.journal_batch) = 7,
                      'journal templates GENERAL, CASH_RECEIPT, PAYMENT, OPENING, CLOSING with 7 batches');
SELECT pg_temp.assert((SELECT a.no FROM bank.bank_account b JOIN bank.bank_account_posting_group g ON g.id = b.bank_account_posting_group_id
                         JOIN gl.gl_account a ON a.id = g.gl_account_id WHERE b.no = 'CASH01' AND b.kind = 'CASH') = '1100',
                      'default cash box CASH01 posts to 1100');
SELECT pg_temp.assert((SELECT string_agg(code || ':' || ebarimt_payment_code, ',' ORDER BY code) FROM party.payment_method)
                        = 'BANK:BANK_TRANSFER,CARD:PAYMENT_CARD,CASH:CASH,QPAY:BANK_TRANSFER_QPAY'
                  AND (SELECT bal_account_type = 'BANK_ACCOUNT' AND bal_account_id = (SELECT id FROM bank.bank_account WHERE no = 'CASH01')
                         FROM party.payment_method WHERE code = 'CASH'),
                      'payment methods with eBarimt payment codes; CASH balances against the cash box (D-F5)');
SELECT pg_temp.assert((SELECT string_agg(code || ':' || due_date_calculation, ',' ORDER BY code) FROM party.payment_terms)
                        = 'CASH:0D,EOM:CM,NET15:15D,NET30:30D,NET7:7D',
                      'payment terms CASH, NET7, NET15, NET30, EOM');
SELECT pg_temp.assert((SELECT count(*) FROM inv.unit_of_measure WHERE ebarimt_measure_unit IS NOT NULL) = 20
                  AND (SELECT ebarimt_measure_unit FROM inv.unit_of_measure WHERE code = 'PCS') = 'ш',
                      'units of measure with eBarimt measureUnit (ш, кг, л, м, цаг, үйлчилгээ, ...)');
SELECT pg_temp.assert((SELECT count(*) FROM platform.reason_code) = 11 AND (SELECT count(*) FROM party.customer_template) = 4
                  AND (SELECT count(*) FROM party.vendor_template) = 5 AND (SELECT count(*) FROM fx.currency) = 4
                  AND (SELECT count(*) FROM fa.fa_class) = 7 AND (SELECT count(*) FROM fa.depreciation_book) = 2,
                      'reason codes, customer/vendor templates, currencies, FA classes and books seeded');
SELECT pg_temp.assert((SELECT count(*) FROM ebarimt.ebarimt_setup WHERE merchant_tin = '37900846788' AND NOT enabled) = 1
                  AND (SELECT count(*) FROM ebarimt.ebarimt_pos WHERE is_default) = 1,
                      'eBarimt merchant setup (disabled until registration) and default POS 001 created for a company with TIN');

-- financial reports: leaf rows <-> account mapping
SELECT pg_temp.assert((SELECT string_agg(code || ':' || report_kind, ',' ORDER BY code) FROM rpt.financial_report)
                        = 'MGT:CASH_FLOW,ODT:INCOME_STATEMENT,OOT:EQUITY,SBT:BALANCE_SHEET,TB:TRIAL_BALANCE',
                      'financial reports СБТ, ОДТ, ӨӨТ, МГТ, гүйлгээ баланс');
CREATE TEMP VIEW seed_leaf_rows AS
    SELECT d.code AS def, r.row_no, r.totaling, s.statement_code, s.line_code, r.statement_line_id
      FROM rpt.fin_report_row r JOIN rpt.fin_report_row_definition d ON d.id = r.row_definition_id
      JOIN rpt.statement_line s ON s.id = r.statement_line_id
     WHERE d.code IN ('SBT','ODT') AND r.totaling_type = 'POSTING_ACCOUNTS';
SELECT pg_temp.assert(NOT EXISTS (
        SELECT 1 FROM seed_leaf_rows lr
          JOIN gl.gl_account a ON a.account_type = 'POSTING'
                              AND a.income_balance = CASE lr.statement_code WHEN 'BS' THEN 'BALANCE_SHEET' ELSE 'INCOME_STATEMENT' END
         WHERE pg_temp.in_filter(a.no, lr.totaling) <> (a.statement_line_id = lr.statement_line_id)),
                      'each СБТ/ОДТ leaf row totals exactly the accounts mapped to its Form A line');
SELECT pg_temp.assert(NOT EXISTS (
        SELECT 1 FROM gl.gl_account a
         WHERE a.account_type = 'POSTING'
           AND (SELECT count(*) FROM seed_leaf_rows lr
                 WHERE lr.statement_code = CASE a.income_balance WHEN 'BALANCE_SHEET' THEN 'BS' ELSE 'IS' END
                   AND pg_temp.in_filter(a.no, lr.totaling)) <> 1),
                      'every posting account is totaled by exactly one leaf row of СБТ (balance) or ОДТ (income)');
SELECT pg_temp.assert(NOT EXISTS (
        SELECT 1 FROM rpt.fin_report_row r
          CROSS JOIN LATERAL regexp_split_to_table(r.totaling, '[-+*/()]') t(tok)
         WHERE r.totaling_type = 'FORMULA' AND tok <> ''
           AND NOT EXISTS (SELECT 1 FROM rpt.fin_report_row x WHERE x.row_definition_id = r.row_definition_id AND x.row_no = tok)),
                      'every formula operand references an existing row of the same definition');
SELECT pg_temp.assert(NOT EXISTS (
        SELECT 1 FROM rpt.fin_report_row r CROSS JOIN LATERAL unnest(string_to_array(r.totaling, '|')) c(code)
         WHERE r.totaling_type = 'CASH_FLOW_CATEGORY' AND NOT EXISTS (SELECT 1 FROM rpt.cash_flow_category f WHERE f.code = c.code))
                  AND NOT EXISTS (
        SELECT 1 FROM gl.gl_account a JOIN rpt.cash_flow_category f ON f.id = a.cash_flow_category_id
         WHERE f.code <> 'CASH_TRANSFER'
           AND NOT EXISTS (SELECT 1 FROM rpt.fin_report_row r JOIN rpt.fin_report_row_definition d ON d.id = r.row_definition_id
                            WHERE d.code = 'MGT' AND r.totaling_type = 'CASH_FLOW_CATEGORY' AND f.code = ANY (string_to_array(r.totaling, '|')))),
                      'МГТ rows reference existing categories and every category used by an account reaches an МГТ row');
SELECT pg_temp.assert((SELECT count(*) FROM tax.vat_statement_line) = 17
                  AND (SELECT form_code FROM tax.vat_statement_name WHERE code = 'TT03A') = 'ТТ-03а',
                      'VAT statement ТТ-03а: 17 lines');
SELECT pg_temp.assert((SELECT string_agg(row_no || ':' || amount_type || ':' || only_deductible_confirmed, ',' ORDER BY line_no)
                         FROM tax.vat_statement_line WHERE row_no IN ('2','8','9','10','13'))
                      = '2:AMOUNT:false,8:AMOUNT:true,9:AMOUNT:true,10:AMOUNT:false,13:FULL_AMOUNT:false',
                      'ТТ-03а: output VAT, confirmed input VAT (D-E4), customs VAT, reverse charge deductible (AMOUNT) vs payable (FULL_AMOUNT)');
SELECT pg_temp.assert((SELECT string_agg(coalesce(from_days::text, '') || '..' || coalesce(to_days::text, ''), ' ' ORDER BY sequence_no)
                         FROM rpt.aging_bucket) = '..-1 0..30 31..60 61..90 91..',
                      'aging buckets: not due, 0-30, 31-60, 61-90, 90+ days by due date (D-F7)');

-- roles (tenant)
SELECT pg_temp.assert((SELECT string_agg(code, ',' ORDER BY code) FROM platform.role)
                        = 'ACCOUNTANT,EXTERNAL_ACCOUNTANT,OWNER,SALES_CLERK,VIEWER'
                  AND (SELECT count(*) FROM platform.role_permission_set rp JOIN platform.role r ON r.id = rp.role_id WHERE r.code = 'OWNER') = 30,
                      'default roles Owner, Accountant, External accountant, Sales clerk, Viewer; Owner holds all 30 sets (D-I2)');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM platform.role_permission_set rp JOIN platform.role r ON r.id = rp.role_id
                                    JOIN platform.permission_set s ON s.id = rp.permission_set_id
                                   WHERE (r.code IN ('ACCOUNTANT','EXTERNAL_ACCOUNTANT') AND s.code IN ('ERP_SECURITY','ERP_PERIOD_REOPEN'))
                                      OR (r.code = 'SALES_CLERK' AND s.code IN ('ERP_JOURNALS_POST','ERP_SETUP','ERP_CASH'))
                                      OR (r.code = 'VIEWER' AND s.code NOT IN ('ERP_BASIC','ERP_READ_ALL','ERP_FIN_REPORTS'))),
                      'segregation: no security/reopen for accountants, no journals/setup/cash payments for sales clerk, read-only viewer');
COMMIT;

-- S2: company without VAT registration
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s2, :user_s, 'seed-check-s2') \gset
SELECT pg_temp.assert((SELECT count(*) FROM gl.gl_account) = 182 AND (SELECT count(*) FROM tax.vat_posting_setup) = 19,
                      'S2 provisioned with the same chart (182) and VAT matrix (19)');
SELECT pg_temp.assert((SELECT bool_and(non_deductible_vat_percent = 100) FROM tax.vat_posting_setup WHERE ebarimt_tax_type = 'VAT_ABLE')
                  AND NOT (SELECT enabled FROM tax.city_tax_setup)
                  AND NOT EXISTS (SELECT 1 FROM ebarimt.ebarimt_setup),
                      'S2 not VAT-registered: input VAT 100 % non-deductible (D-E5), city tax off, no eBarimt merchant setup without TIN');
COMMIT;

-- -----------------------------------------------------------------------------
-- 4. Postings through the database guards on the seeded setup (company S1, app_user)
-- -----------------------------------------------------------------------------
-- 4a. Opening balance voucher (OB series): cash 1,000,000 against share capital, with the cash-box ledger entry
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-post-1') \gset
SELECT platform.fn_lock_company_posting(:tenant_s, :company_s1) \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r1, platform.fn_next_entry_no('GL_TRANSACTION') AS t1,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e1, platform.fn_next_entry_no('BANK_LEDGER_ENTRY') AS b1,
       platform.fn_next_document_no('OB', make_date(:fy, 1, 1)) AS ob_no \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_s, :company_s1, :t1, :r1, make_date(:fy, 1, 1), :'ob_no', 'OPENING');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date,
                         document_no, description, amount, source_code)
SELECT :tenant_s, :company_s1, :e1 + v.i, :t1, :r1, gl.fn_mn_account_id(v.acc), make_date(:fy, 1, 1), :'ob_no', 'Эхний үлдэгдэл', v.amount, 'OPENING'
  FROM (VALUES (0, '1100', 1000000.00), (1, '3100', -1000000.00)) v(i, acc, amount);
INSERT INTO bank.bank_ledger_entry (tenant_id, company_id, entry_no, bank_account_id, posting_date, document_no, description,
                                    amount, amount_lcy, remaining_amount, positive, transaction_no, gl_register_no, source_code)
SELECT :tenant_s, :company_s1, :b1, id, make_date(:fy, 1, 1), :'ob_no', 'Эхний үлдэгдэл', 1000000, 1000000, 1000000, true, :t1, :r1, 'OPENING'
  FROM bank.bank_account WHERE no = 'CASH01';
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_s, :company_s1, :r1, :e1, :e1 + 1, 'OPENING');
COMMIT;
SELECT pg_temp.assert(:'ob_no' = 'OB-' || :fy || '-00001', 'opening voucher numbered from the gapless OB series: ' || :'ob_no');

-- 4b. Sales invoice with VAT (SI series, DOMESTIC x VAT10): 1200 Дт 1,100 / 5110 Кт 1,000 / 2300 Кт 100 + VAT entry
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-post-2') \gset
SELECT platform.fn_lock_company_posting(:tenant_s, :company_s1) \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r2, platform.fn_next_entry_no('GL_TRANSACTION') AS t2,
       platform.fn_next_entry_no('GL_ENTRY', 3) AS e2, platform.fn_next_entry_no('VAT_ENTRY') AS v2,
       platform.fn_next_document_no('SI', make_date(:fy, 3, 15)) AS si_no \gset
SELECT a.no AS vat_acc, s.vat_percent AS vat_pct, s.vat_identifier AS vat_ident
  FROM tax.vat_posting_setup s JOIN tax.vat_bus_posting_group b ON b.id = s.vat_bus_posting_group_id
  JOIN tax.vat_prod_posting_group p ON p.id = s.vat_prod_posting_group_id JOIN gl.gl_account a ON a.id = s.sales_vat_account_id
 WHERE b.code = 'DOMESTIC' AND p.code = 'VAT10' \gset
SELECT a.no AS rev_acc FROM party.general_posting_setup g JOIN party.gen_bus_posting_group b ON b.id = g.gen_bus_posting_group_id
  JOIN party.gen_prod_posting_group p ON p.id = g.gen_prod_posting_group_id JOIN gl.gl_account a ON a.id = g.sales_account_id
 WHERE b.code = 'DOMESTIC' AND p.code = 'SERVICES' \gset
SELECT a.no AS ar_acc FROM party.customer_posting_group c JOIN gl.gl_account a ON a.id = c.receivables_account_id WHERE c.code = 'DOMESTIC' \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_type, document_no, source_code)
VALUES (:tenant_s, :company_s1, :t2, :r2, make_date(:fy, 3, 15), 'INVOICE', :'si_no', 'SALES');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_type,
                         document_no, amount, vat_amount, gen_posting_type, gen_bus_posting_group, gen_prod_posting_group,
                         vat_bus_posting_group, vat_prod_posting_group, source_code)
SELECT :tenant_s, :company_s1, :e2 + v.i, :t2, :r2, gl.fn_mn_account_id(v.acc), make_date(:fy, 3, 15), 'INVOICE', :'si_no',
       v.amount, v.vat, v.gpt, v.gb, v.gp, v.vb, v.vp, 'SALES'
  FROM (VALUES (0, :'ar_acc',  1100.00,    0.00, 'NONE', NULL,       NULL,       NULL,       NULL),
               (1, :'rev_acc', -1000.00, -100.00, 'SALE', 'DOMESTIC', 'SERVICES', 'DOMESTIC', 'VAT10'),
               (2, :'vat_acc', -100.00,     0.00, 'SALE', 'DOMESTIC', 'SERVICES', 'DOMESTIC', 'VAT10'))
       v(i, acc, amount, vat, gpt, gb, gp, vb, vp);
INSERT INTO tax.vat_entry (tenant_id, company_id, entry_no, entry_type, posting_date, vat_date, document_type, document_no, base, amount,
                           vat_calculation_type, vat_percent, vat_identifier, vat_category, vat_bus_posting_group, vat_prod_posting_group,
                           gen_bus_posting_group, gen_prod_posting_group, ebarimt_tax_type, transaction_no, gl_register_no, gl_entry_no, source_code)
VALUES (:tenant_s, :company_s1, :v2, 'SALE', make_date(:fy, 3, 15), make_date(:fy, 3, 15), 'INVOICE', :'si_no', -1000, -100,
        'NORMAL', :vat_pct, :'vat_ident', 'VAT10', 'DOMESTIC', 'VAT10', 'DOMESTIC', 'SERVICES', 'VAT_ABLE', :t2, :r2, :e2 + 1, 'SALES');
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, from_vat_entry_no, to_vat_entry_no, source_code)
VALUES (:tenant_s, :company_s1, :r2, :e2, :e2 + 2, :v2, :v2, 'SALES');
COMMIT;
SELECT pg_temp.assert(:'si_no' = 'SI-' || :fy || '-00001' AND :'ar_acc' = '1200' AND :'rev_acc' = '5110' AND :'vat_acc' = '2300',
                      'sales invoice ' || :'si_no' || ' posted with accounts resolved from the seeded setups (1200 / 5110 / 2300)');

-- 4c. Cash receipt МХ-1 (KO series of the cash box): 1100 Дт 1,100 / 1200 Кт 1,100 + cash ledger + posted voucher
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-post-3') \gset
SELECT platform.fn_lock_company_posting(:tenant_s, :company_s1) \gset
SELECT ns.code AS ko_series FROM bank.bank_account b JOIN platform.number_series ns ON ns.id = b.cash_receipt_no_series_id WHERE b.no = 'CASH01' \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r3, platform.fn_next_entry_no('GL_TRANSACTION') AS t3,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e3, platform.fn_next_entry_no('BANK_LEDGER_ENTRY') AS b3,
       platform.fn_next_document_no(:'ko_series', make_date(:fy, 3, 20)) AS ko_no \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_type, document_no, source_code)
VALUES (:tenant_s, :company_s1, :t3, :r3, make_date(:fy, 3, 20), 'PAYMENT', :'ko_no', 'CASHVOUCHER');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_type,
                         document_no, amount, source_code)
SELECT :tenant_s, :company_s1, :e3 + v.i, :t3, :r3, gl.fn_mn_account_id(v.acc), make_date(:fy, 3, 20), 'PAYMENT', :'ko_no', v.amount, 'CASHVOUCHER'
  FROM (VALUES (0, '1100', 1100.00), (1, '1200', -1100.00)) v(i, acc, amount);
INSERT INTO bank.bank_ledger_entry (tenant_id, company_id, entry_no, bank_account_id, posting_date, document_type, document_no, description,
                                    amount, amount_lcy, remaining_amount, positive, cash_flow_category_id, transaction_no, gl_register_no, source_code)
SELECT :tenant_s, :company_s1, :b3, b.id, make_date(:fy, 3, 20), 'PAYMENT', :'ko_no', 'Нэхэмжлэхийн төлбөр', 1100, 1100, 1100, true,
       (SELECT cash_flow_category_id FROM gl.gl_account WHERE no = '1200'), :t3, :r3, 'CASHVOUCHER'
  FROM bank.bank_account b WHERE b.no = 'CASH01';
INSERT INTO bank.posted_cash_voucher (tenant_id, company_id, voucher_type, no, bank_account_id, posting_date, counterparty_name,
                                      purpose, amount, amount_in_words, bank_ledger_entry_no, transaction_no)
SELECT :tenant_s, :company_s1, 'RECEIPT', :'ko_no', b.id, make_date(:fy, 3, 20), 'Харилцагч А', :'si_no' || ' нэхэмжлэхийн төлбөр',
       1100, 'Нэг мянга нэг зуун төгрөг', :b3, :t3
  FROM bank.bank_account b WHERE b.no = 'CASH01';
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_s, :company_s1, :r3, :e3, :e3 + 1, 'CASHVOUCHER');
COMMIT;
SELECT pg_temp.assert(:'ko_no' = 'KO-' || :fy || '-00001', 'cash receipt МХ-1 numbered ' || :'ko_no' || ' from the cash box series');

-- 4d. Results of the three postings
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-results') \gset
SELECT pg_temp.assert((SELECT sum(period_debit) = sum(period_credit) AND sum(period_debit) = 1002200
                         FROM rpt.fn_trial_balance(make_date(:fy, 1, 1), make_date(:fy, 12, 31))),
                      'trial balance on the seeded chart: debit = credit = 1,002,200');
SELECT pg_temp.assert((SELECT sum(e.amount) FILTER (WHERE s.statement_code = 'BS' AND s.line_code LIKE '1.%')
                            = -sum(e.amount) FILTER (WHERE s.statement_code = 'IS' OR s.line_code LIKE '2.%')
                         FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id JOIN rpt.statement_line s ON s.id = a.statement_line_id),
                      'Form A mapping balances: СБТ 1.x assets = 2.x liabilities and equity + current-year result');
SELECT pg_temp.assert((SELECT sum(e.amount) FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id
                        JOIN rpt.statement_line s ON s.id = a.statement_line_id WHERE s.statement_code = 'BS' AND s.line_code = '1.1.1') = 1001100,
                      'СБТ line 1.1.1 (cash) = 1,001,100 through the account mapping');
SELECT pg_temp.assert((SELECT -sum(amount) FROM tax.vat_entry v
                         JOIN tax.vat_statement_line l ON l.vat_category = v.vat_category AND l.gen_posting_type = v.entry_type
                        WHERE l.row_no = '2') = 100,
                      'ТТ-03а line 2 (output VAT 10 %) = 100');
SELECT pg_temp.assert((SELECT sum(amount) FROM bank.bank_ledger_entry) = 1001100
                  AND (SELECT f.code FROM bank.bank_ledger_entry b JOIN rpt.cash_flow_category f ON f.id = b.cash_flow_category_id
                        WHERE b.document_no = :'ko_no') = 'OP_CUST_RECEIPTS',
                      'cash box ledger = G/L 1100; the receipt is classified МГТ 1.1.1 by the counter-account 1200 (FR-RPT-011 AC1)');
COMMIT;

-- 4e. Unbalanced voucher on the seeded accounts is rejected at COMMIT (ERB01); the GJ number is not consumed
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-unbalanced') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r4, platform.fn_next_entry_no('GL_TRANSACTION') AS t4,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e4, platform.fn_next_document_no('GJ', make_date(:fy, 4, 1)) AS gj_bad \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_s, :company_s1, :t4, :r4, make_date(:fy, 4, 1), :'gj_bad', 'GENJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no, amount, source_code)
SELECT :tenant_s, :company_s1, :e4 + v.i, :t4, :r4, gl.fn_mn_account_id(v.acc), make_date(:fy, 4, 1), :'gj_bad', v.amount, 'GENJNL'
  FROM (VALUES (0, '7210', 500000.00), (1, '1110', -400000.00)) v(i, acc, amount);
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_s, :company_s1, :r4, :e4, :e4 + 1, 'GENJNL');
COMMIT;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERB01', 'unbalanced voucher on seeded accounts rejected at COMMIT (ERB01)');

-- 4f. Balanced general journal voucher (GJ series) with dimension set 0 posts; number GJ-YYYY-00001 (no gap)
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-journal') \gset
SELECT platform.fn_lock_company_posting(:tenant_s, :company_s1) \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r5, platform.fn_next_entry_no('GL_TRANSACTION') AS t5,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e5, platform.fn_next_document_no('GJ', make_date(:fy, 4, 1)) AS gj_no \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_s, :company_s1, :t5, :r5, make_date(:fy, 4, 1), :'gj_no', 'GENJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no,
                         description, amount, source_code)
SELECT :tenant_s, :company_s1, :e5 + v.i, :t5, :r5, gl.fn_mn_account_id(v.acc), make_date(:fy, 4, 1), :'gj_no', 'Сарын элэгдэл', v.amount, 'GENJNL'
  FROM (VALUES (0, '7260', 25000.00), (1, '1690', -25000.00)) v(i, acc, amount);
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_s, :company_s1, :r5, :e5, :e5 + 1, 'GENJNL');
COMMIT;
SELECT pg_temp.assert(:'gj_no' = 'GJ-' || :fy || '-00001', 'balanced journal voucher posted as ' || :'gj_no' || ' (rolled-back number reused, gapless)');

-- 4g. Heading account is not postable (ERG01)
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-heading') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r6, platform.fn_next_entry_no('GL_TRANSACTION') AS t6,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e6 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_s, :company_s1, :t6, :r6, make_date(:fy, 4, 2), 'TEST-HEADING', 'GENJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no, amount, source_code)
SELECT :tenant_s, :company_s1, :e6 + v.i, :t6, :r6, gl.fn_mn_account_id(v.acc), make_date(:fy, 4, 2), 'TEST-HEADING', v.amount, 'GENJNL'
  FROM (VALUES (0, '1199', 100.00), (1, '1110', -100.00)) v(i, acc, amount);
COMMIT;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERG01', 'posting to the HEADING account 1199 is rejected (ERG01)');

-- 4h. Outside the provisioned fiscal years: no accounting period (ERP01) and no yearly series line (ERN01)
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-period') \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_s, :company_s1, 999999, 999999, make_date(:fy_out, 1, 15), 'TEST-PERIOD', 'GENJNL');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERP01', 'posting into ' || :fy_out || ' (no fiscal year provisioned) is rejected (ERP01)');
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-series') \gset
SELECT platform.fn_next_document_no('SI', make_date(:fy_out, 1, 15));
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERN01', 'SI number for ' || :fy_out || ' refused until that year''s line exists (ERN01, D-C7)');

-- 4i. Next year is prepared with the ensure-functions, idempotently
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-next-year') \gset
SELECT platform.fn_mn_ensure_number_series(:fy_out) + gl.fn_mn_ensure_fiscal_year(:fy_out) AS added \gset
SELECT platform.fn_mn_ensure_number_series(:fy_out) + gl.fn_mn_ensure_fiscal_year(:fy_out) AS added_again \gset
SELECT platform.fn_next_document_no('SI', make_date(:fy_out, 1, 15)) AS si_next_year \gset
ROLLBACK;
SELECT pg_temp.assert(:added > 0 AND :added_again = 0 AND :'si_next_year' = 'SI-' || :fy_out || '-00001',
                      'ensure-functions open ' || :fy_out || ' (series line, fiscal year, VAT periods) idempotently: ' || :'si_next_year');

-- 4j. ТТ-03а evaluated with BC VAT-statement semantics (R-VAT-26/27; NULL group = any group, vat_category filter):
--     March: sale VAT 100 (4b); domestic purchase VAT 40 with a confirmed ДДТД and 20 without (D-E4); reverse charge
--     on a non-resident service, base 300 / VAT 30 of which 50 % non-deductible. Expected: output 100, deductible
--     40 + 15, reverse charge payable 30 (FULL_AMOUNT), to pay 100 + 30 - 55 = 75.
CREATE FUNCTION pg_temp.vat_line(p_row text, p_from date, p_to date, p_printed boolean DEFAULT true) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
    l record;
    v numeric := 0;
    r text;
BEGIN
    SELECT s.* INTO l FROM tax.vat_statement_line s JOIN tax.vat_statement_name n ON n.id = s.vat_statement_name_id
     WHERE n.code = 'TT03A' AND s.row_no = p_row;
    IF l.line_type = 'VAT_ENTRY_TOTALING' THEN
        SELECT coalesce(sum(CASE l.amount_type WHEN 'AMOUNT' THEN e.amount WHEN 'BASE' THEN e.base
                                 WHEN 'NON_DEDUCTIBLE_AMOUNT' THEN e.non_deductible_amount WHEN 'NON_DEDUCTIBLE_BASE' THEN e.non_deductible_base
                                 WHEN 'FULL_AMOUNT' THEN e.amount + e.non_deductible_amount
                                 WHEN 'FULL_BASE' THEN e.base + e.non_deductible_base END), 0)
          INTO v
          FROM tax.vat_entry e
         WHERE e.entry_type = l.gen_posting_type AND e.vat_date BETWEEN p_from AND p_to
           AND (l.vat_bus_posting_group_id IS NULL
                OR e.vat_bus_posting_group = (SELECT code FROM tax.vat_bus_posting_group WHERE id = l.vat_bus_posting_group_id))
           AND (l.vat_prod_posting_group_id IS NULL
                OR e.vat_prod_posting_group = (SELECT code FROM tax.vat_prod_posting_group WHERE id = l.vat_prod_posting_group_id))
           AND (l.vat_category IS NULL OR e.vat_category = l.vat_category)
           AND (NOT l.only_deductible_confirmed OR e.deductible_confirmed);
        IF l.calculate_with = 'OPPOSITE_SIGN' THEN v := -v; END IF;
    ELSIF l.line_type = 'ROW_TOTALING' THEN
        IF l.calculate_with <> 'SIGN' THEN
            RAISE EXCEPTION 'R-VAT-27: Calculate with must be SIGN on the Row Totaling line %', p_row;
        END IF;
        FOREACH r IN ARRAY string_to_array(l.row_totaling, '|') LOOP
            v := v + pg_temp.vat_line(r, p_from, p_to, false);
        END LOOP;
    END IF;
    RETURN CASE WHEN p_printed AND l.print_with = 'OPPOSITE_SIGN' THEN -v ELSE v END;
END $$;

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-vat-return') \gset
SELECT platform.fn_lock_company_posting(:tenant_s, :company_s1) \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r7, platform.fn_next_entry_no('GL_TRANSACTION') AS t7,
       platform.fn_next_entry_no('GL_ENTRY', 11) AS e7, platform.fn_next_entry_no('VAT_ENTRY', 3) AS v7,
       platform.fn_next_document_no('PI', make_date(:fy, 3, 25)) AS pi_no \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_type, document_no, source_code)
VALUES (:tenant_s, :company_s1, :t7, :r7, make_date(:fy, 3, 25), 'INVOICE', :'pi_no', 'PURCHASES');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_type,
                         document_no, amount, vat_amount, gen_posting_type, gen_bus_posting_group, gen_prod_posting_group,
                         vat_bus_posting_group, vat_prod_posting_group, source_code)
SELECT :tenant_s, :company_s1, :e7 + v.i, :t7, :r7, gl.fn_mn_account_id(v.acc), make_date(:fy, 3, 25), 'INVOICE', :'pi_no',
       v.amount, v.vat, v.gpt, v.gb, v.gp, v.vb, v.vp, 'PURCHASES'
  FROM (VALUES (0,  '7200',  400.00, 40.00, 'PURCHASE', 'DOMESTIC', 'MISC',     'DOMESTIC', 'VAT10'),
               (1,  '1300',   40.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL),
               (2,  '2100', -440.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL),
               (3,  '7200',  200.00, 20.00, 'PURCHASE', 'DOMESTIC', 'MISC',     'DOMESTIC', 'VAT10'),
               (4,  '1300',   20.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL),
               (5,  '2100', -220.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL),
               (6,  '7230',  300.00, 30.00, 'PURCHASE', 'EXPORT',   'SERVICES', 'IMPORT',   'IMPORT_SERVICE'),
               (7,  '7230',   15.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL),
               (8,  '1300',   15.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL),
               (9,  '2101', -300.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL),
               (10, '2305',  -30.00,  0.00, 'NONE',     NULL,       NULL,       NULL,       NULL))
       v(i, acc, amount, vat, gpt, gb, gp, vb, vp);
INSERT INTO tax.vat_entry (tenant_id, company_id, entry_no, entry_type, posting_date, vat_date, document_type, document_no,
                           base, amount, non_deductible_base, non_deductible_amount, vat_calculation_type, vat_percent, vat_identifier,
                           vat_category, vat_bus_posting_group, vat_prod_posting_group, gen_bus_posting_group, gen_prod_posting_group,
                           ebarimt_tax_type, deductible_confirmed, supplier_ebarimt_id, transaction_no, gl_register_no, gl_entry_no, source_code)
SELECT :tenant_s, :company_s1, :v7 + v.i, 'PURCHASE', make_date(:fy, 3, 25), make_date(:fy, 3, 25), 'INVOICE', :'pi_no',
       v.base, v.amount, v.nd_base, v.nd_amount, v.calc, 10, v.ident, 'VAT10', v.vb, v.vp, v.gb, v.gp, 'VAT_ABLE',
       v.confirmed, v.ddtd, :t7, :r7, :e7 + v.gl_i, 'PURCHASES'
  FROM (VALUES (0, 400.00, 40.00,   0.00,  0.00, 'NORMAL',         'VAT10', 'DOMESTIC', 'VAT10',          'DOMESTIC', 'MISC',     true,  repeat('1', 33), 0),
               (1, 200.00, 20.00,   0.00,  0.00, 'NORMAL',         'VAT10', 'DOMESTIC', 'VAT10',          'DOMESTIC', 'MISC',     false, NULL,            3),
               (2, 150.00, 15.00, 150.00, 15.00, 'REVERSE_CHARGE', 'RC10',  'IMPORT',   'IMPORT_SERVICE', 'EXPORT',   'SERVICES', false, NULL,            6))
       v(i, base, amount, nd_base, nd_amount, calc, ident, vb, vp, gb, gp, confirmed, ddtd, gl_i);
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, from_vat_entry_no, to_vat_entry_no, source_code)
VALUES (:tenant_s, :company_s1, :r7, :e7, :e7 + 10, :v7, :v7 + 2, 'PURCHASES');
COMMIT;

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_s, :company_s1, :user_s, 'seed-check-vat-statement') \gset
SELECT string_agg(row_no || '=' || pg_temp.vat_line(row_no, make_date(:fy, 3, 1), make_date(:fy, 3, 31))::numeric(19,2), ' ' ORDER BY line_no) AS tt03a
  FROM tax.vat_statement_line WHERE line_type <> 'DESCRIPTION' \gset
COMMIT;
SELECT pg_temp.assert(:'tt03a' = '1=1000.00 2=100.00 3=0.00 4=0.00 5=0.00 6=1000.00 7=400.00 8=40.00 9=0.00 10=15.00 11=15.00 12=55.00 13=30.00 14=75.00',
                      'ТТ-03а (March): output 100, deductible 40 + reverse charge 15 (unconfirmed 20 excluded, D-E4), RC payable 30, to pay 75: ' || :'tt03a');

SELECT 'seed checks finished' AS result;
