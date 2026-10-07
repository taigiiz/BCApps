-- =============================================================================
-- seed/mn_20_tax.sql - MN localization package, part 2: VAT and city tax.
--
--   * tax.fn_tax_parameter_numeric   effective-dated lookup in tax.tax_parameter (D-E7: no rate in code)
--   * tax.fn_mn_seed_vat_groups      VAT business groups (DOMESTIC, EXPORT, IMPORT, NONREG) and
--                                    VAT product groups (VAT10, VAT0, EXEMPT, NOVAT, IMPORT_SERVICE, CUSTOMS_VAT)
--   * tax.fn_mn_seed_vat_setup       VAT posting setup matrix (BC T325) + city tax (НХАТ) code UB and setup
--   * tax.fn_mn_ensure_vat_return_periods  monthly VAT return periods of a year (ТТ-03а, due day from tax_parameter)
--
-- Matrix design (D-E1, D-E2): the VAT % of every 10 % row comes from tax_parameter 'vat.standard_rate'
-- (ratio 0.10 -> 10). Goods imports carry no Mongolian VAT on the foreign invoice (IMPORT x goods = NOVAT);
-- the import VAT is paid to customs and booked on a CUSTOMS_VAT line (FULL_VAT). Services from non-residents
-- use IMPORT_SERVICE (REVERSE_CHARGE). NONREG = a vendor that is not a VAT payer (no input VAT); it must not
-- be given to customers - sales VAT depends on the company's own registration (D-E5), not on the buyer.
-- eBarimt taxProductCode: the PosAPI requires one for every VAT_ZERO / VAT_FREE line and the schema requires a
-- default on those setup rows. The official code list (getProductTaxCode) was not available to this package,
-- so the default is the placeholder 'TBD' (⚠ ТОДРУУЛАХ). The item-level code is mandatory anyway (FR-TAX:
-- "taxProductCode шаардлагатай"); replace the placeholder with the code from getProductTaxCode before using the
-- setup-level default. seed_checks.sql reports the placeholder rows as a warning.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE OR REPLACE FUNCTION tax.fn_tax_parameter_numeric(p_param_code text, p_as_of date, p_require_verified boolean DEFAULT true)
RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_value  numeric;
    v_status text;
BEGIN
    SELECT value_numeric, status INTO v_value, v_status
      FROM tax.tax_parameter
     WHERE param_code = p_param_code AND effective_from <= p_as_of AND (effective_to IS NULL OR effective_to >= p_as_of)
     ORDER BY effective_from DESC
     LIMIT 1;
    IF NOT FOUND OR v_value IS NULL THEN
        RAISE EXCEPTION 'tax parameter % has no numeric value on % (load db/seed/legal_parameters.sql)', p_param_code, p_as_of
            USING ERRCODE = 'P0002';
    END IF;
    IF p_require_verified AND v_status <> 'verified' THEN
        RAISE EXCEPTION 'tax parameter % is % on %; unverified parameters must not drive postings', p_param_code, v_status, p_as_of
            USING ERRCODE = '22023';
    END IF;
    RETURN v_value;
END $$;
COMMENT ON FUNCTION tax.fn_tax_parameter_numeric(text, date, boolean) IS
    'Numeric value of an effective-dated statutory parameter (tax.tax_parameter, D-E7) on a date; raises when missing or (by default) not verified.';
GRANT EXECUTE ON FUNCTION tax.fn_tax_parameter_numeric(text, date, boolean) TO app_user;

-- -----------------------------------------------------------------------------
-- VAT business / product groups
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tax.fn_mn_seed_vat_groups() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO tax.vat_bus_posting_group (tenant_id, company_id, code, description, description_en)
    SELECT v_tenant, v_company, v.code, v.descr, v.descr_en
      FROM (VALUES
        ('DOMESTIC', 'Дотоодын харилцагч, нийлүүлэгч (НӨАТ төлөгч, иргэн)', 'Domestic customers and VAT-registered vendors'),
        ('EXPORT',   'Гадаад худалдан авагч (экспорт, 0%)',                  'Foreign customers (export, zero-rated)'),
        ('IMPORT',   'Гадаад нийлүүлэгч (импорт, урвуу тооцоо, гааль)',      'Foreign vendors (import, reverse charge, customs)'),
        ('NONREG',   'НӨАТ төлөгч бус нийлүүлэгч',                           'Vendors not registered for VAT')
      ) AS v(code, descr, descr_en)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO tax.vat_prod_posting_group (tenant_id, company_id, code, description, description_en)
    SELECT v_tenant, v_company, v.code, v.descr, v.descr_en
      FROM (VALUES
        ('VAT10',          'НӨАТ 10% (стандарт)',                                  'VAT 10% (standard)'),
        ('VAT0',           'НӨАТ 0% (экспорт, олон улсын үйлчилгээ)',              'VAT 0% (exports, international services)'),
        ('EXEMPT',         'НӨАТ-аас чөлөөлөгдөх',                                 'VAT exempt'),
        ('NOVAT',          'НӨАТ-ын хамрах хүрээнээс гадуур',                      'Outside the scope of VAT'),
        ('IMPORT_SERVICE', 'Гадаадын резидент бусаас авсан үйлчилгээ (урвуу тооцоо)', 'Services from non-residents (reverse charge)'),
        ('CUSTOMS_VAT',    'Гаалийн байгууллагад төлсөн импортын НӨАТ',            'Import VAT paid to customs')
      ) AS v(code, descr, descr_en)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION tax.fn_mn_seed_vat_groups() IS 'MN localization package: VAT business and product posting groups of the current company (D-E2). Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION tax.fn_mn_seed_vat_groups() TO app_user;

-- -----------------------------------------------------------------------------
-- VAT posting setup (VAT Bus. x VAT Prod.) and city tax
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tax.fn_mn_seed_vat_setup(p_as_of date) RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant     uuid := platform.current_tenant_id();
    v_company    uuid := platform.current_company_id();
    v_rate       numeric := round(tax.fn_tax_parameter_numeric('vat.standard_rate', p_as_of) * 100, 5);
    v_city_rate  numeric := round(tax.fn_tax_parameter_numeric('city_tax.rate_ub', p_as_of) * 100, 5);
    v_city_from  date;
    v_registered boolean;
    v_city_payer boolean;
    v_rows       integer := 0;
    n            integer;
    v_missing    integer;
BEGIN
    SELECT coalesce(vat_registered, false), coalesce(city_tax_payer, false) INTO v_registered, v_city_payer
      FROM platform.company_setup WHERE company_id = v_company;

    -- calc: N normal, R reverse charge, F full VAT; pct: S = standard rate from tax_parameter, 0 = zero
    WITH ins AS (
    INSERT INTO tax.vat_posting_setup (tenant_id, company_id, vat_bus_posting_group_id, vat_prod_posting_group_id,
                                       vat_calculation_type, vat_identifier, vat_category, vat_percent, vat_rate_param_code,
                                       sales_vat_account_id, purchase_vat_account_id, reverse_chrg_vat_account_id,
                                       non_deductible_vat_percent, ebarimt_tax_type, ebarimt_tax_product_code, vat_clause_text)
    SELECT v_tenant, v_company, b.id, p.id,
           CASE v.calc WHEN 'N' THEN 'NORMAL' WHEN 'R' THEN 'REVERSE_CHARGE' ELSE 'FULL_VAT' END,
           v.ident, v.cat,
           CASE v.pct WHEN 'S' THEN v_rate ELSE 0 END,
           CASE v.pct WHEN 'S' THEN 'vat.standard_rate' WHEN '0' THEN CASE WHEN v.cat = 'VAT0' THEN 'vat.zero_rate' END END,
           sa.id, pa.id, CASE WHEN v.calc = 'R' THEN ra.id END,
           -- D-E5: a company that is not VAT-registered cannot deduct input VAT
           CASE WHEN NOT v_registered AND v.pct = 'S' THEN 100 ELSE 0 END,
           v.tax_type,
           CASE WHEN v.calc = 'N' AND v.tax_type IN ('VAT_ZERO','VAT_FREE') THEN 'TBD' END,
           v.clause
      FROM (VALUES
        -- bus,      prod,             calc,pct, identifier, category, eBarimt taxType, clause
        ('DOMESTIC','VAT10',          'N','S','VAT10',  'VAT10', 'VAT_ABLE', NULL),
        ('DOMESTIC','VAT0',           'N','0','VAT0',   'VAT0',  'VAT_ZERO', '0 хувиар татвар ногдуулах бараа, ажил, үйлчилгээ'),
        ('DOMESTIC','EXEMPT',         'N','0','EXEMPT', 'EXEMPT','VAT_FREE', 'НӨАТ-аас чөлөөлөгдөх бараа, ажил, үйлчилгээ'),
        ('DOMESTIC','NOVAT',          'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  'НӨАТ-ын хамрах хүрээнээс гадуур'),
        ('DOMESTIC','CUSTOMS_VAT',    'F','S','CUSTOMS','VAT10', 'VAT_ABLE', 'Гаалийн мэдүүлгээр төлсөн импортын НӨАТ'),
        ('EXPORT',  'VAT10',          'N','0','VAT0',   'VAT0',  'VAT_ZERO', 'Экспорт - 0 хувиар татвар ногдуулна'),
        ('EXPORT',  'VAT0',           'N','0','VAT0',   'VAT0',  'VAT_ZERO', 'Экспорт - 0 хувиар татвар ногдуулна'),
        ('EXPORT',  'EXEMPT',         'N','0','EXEMPT', 'EXEMPT','VAT_FREE', 'НӨАТ-аас чөлөөлөгдөх бараа, ажил, үйлчилгээ'),
        ('EXPORT',  'NOVAT',          'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  'НӨАТ-ын хамрах хүрээнээс гадуур'),
        ('IMPORT',  'VAT10',          'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  'Импортын бараа: НӨАТ-ыг гаалийн мэдүүлгээр (CUSTOMS_VAT)'),
        ('IMPORT',  'VAT0',           'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  NULL),
        ('IMPORT',  'EXEMPT',         'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  NULL),
        ('IMPORT',  'NOVAT',          'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  NULL),
        ('IMPORT',  'IMPORT_SERVICE', 'R','S','RC10',   'VAT10', 'VAT_ABLE', 'Резидент бусаас авсан үйлчилгээ - урвуу тооцоо'),
        ('IMPORT',  'CUSTOMS_VAT',    'F','S','CUSTOMS','VAT10', 'VAT_ABLE', 'Гаалийн мэдүүлгээр төлсөн импортын НӨАТ'),
        ('NONREG',  'VAT10',          'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  'НӨАТ төлөгч бус нийлүүлэгч'),
        ('NONREG',  'VAT0',           'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  'НӨАТ төлөгч бус нийлүүлэгч'),
        ('NONREG',  'EXEMPT',         'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  'НӨАТ төлөгч бус нийлүүлэгч'),
        ('NONREG',  'NOVAT',          'N','0','NOVAT',  'NOVAT', 'NOT_VAT',  'НӨАТ төлөгч бус нийлүүлэгч')
      ) AS v(bus, prod, calc, pct, ident, cat, tax_type, clause)
      JOIN tax.vat_bus_posting_group b ON b.company_id = v_company AND b.code = v.bus
      JOIN tax.vat_prod_posting_group p ON p.company_id = v_company AND p.code = v.prod
      LEFT JOIN gl.gl_account sa ON sa.company_id = v_company AND sa.no = '2300'
      LEFT JOIN gl.gl_account pa ON pa.company_id = v_company AND pa.no = '1300'
      LEFT JOIN gl.gl_account ra ON ra.company_id = v_company AND ra.no = '2305'
    ON CONFLICT (company_id, vat_bus_posting_group_id, vat_prod_posting_group_id) DO NOTHING
    RETURNING sales_vat_account_id, purchase_vat_account_id)
    SELECT count(*), count(*) FILTER (WHERE sales_vat_account_id IS NULL OR purchase_vat_account_id IS NULL)
      INTO n, v_missing FROM ins;
    v_rows := v_rows + n;
    -- sales VAT -> 2300 (liability), purchase VAT -> 1300 (asset), reverse charge 1300 Dr / 2305 Cr. A row without
    -- its accounts would never be repaired by a later call (missing rows only), so the seed fails instead.
    IF v_missing > 0 THEN
        RAISE EXCEPTION 'VAT posting setup seed: VAT accounts 2300/1300 not found in the chart of the current company'
            USING ERRCODE = '55000', HINT = 'run gl.fn_mn_seed_chart_of_accounts() first';
    END IF;

    -- City tax (НХАТ, D-E6): rate from tax_parameter 'city_tax.rate_ub'; base = net excl. VAT (city_tax.base)
    SELECT effective_from INTO v_city_from FROM tax.tax_parameter
     WHERE param_code = 'city_tax.rate_ub' AND effective_from <= p_as_of AND (effective_to IS NULL OR effective_to >= p_as_of)
     ORDER BY effective_from DESC LIMIT 1;
    INSERT INTO tax.city_tax_code (tenant_id, company_id, code, description, rate_percent, rate_param_code, base_type,
                                   payable_account_id, expense_account_id, effective_from)
    SELECT v_tenant, v_company, 'UB',
           'Нийслэлийн албан татвар (архи, тамхи, ресторан, баар, зочид буудал)', v_city_rate, 'city_tax.rate_ub',
           'NET_EXCL_VAT', pay.id, exp.id, v_city_from
      FROM gl.gl_account pay, gl.gl_account exp
     WHERE pay.company_id = v_company AND pay.no = '2320' AND exp.company_id = v_company AND exp.no = '7250'
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO tax.city_tax_setup (tenant_id, company_id, enabled, default_city_tax_code_id, settlement_account_id)
    SELECT v_tenant, v_company, v_city_payer, c.id, s.id
      FROM tax.city_tax_code c, gl.gl_account s
     WHERE c.company_id = v_company AND c.code = 'UB' AND s.company_id = v_company AND s.no = '2325'
    ON CONFLICT (company_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION tax.fn_mn_seed_vat_setup(date) IS
    'MN localization package: VAT posting setup matrix (rates from tax.tax_parameter on p_as_of), city tax code UB and city tax setup of the current company. Requires the VAT groups and the chart of accounts. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION tax.fn_mn_seed_vat_setup(date) TO app_user;

-- -----------------------------------------------------------------------------
-- Monthly VAT return periods (BC T737). Due day = tax_parameter 'vat.return_due_day' of the following month.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tax.fn_mn_ensure_vat_return_periods(p_year integer) RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_due_day integer := tax.fn_tax_parameter_numeric('vat.return_due_day', make_date(p_year, 1, 1), false)::integer;
    v_rows    integer;
BEGIN
    INSERT INTO tax.vat_return_period (tenant_id, company_id, starting_date, ending_date, due_date)
    SELECT v_tenant, v_company, d::date, (d + interval '1 month' - interval '1 day')::date,
           (d + interval '1 month')::date + (v_due_day - 1)
      FROM generate_series(make_date(p_year, 1, 1), make_date(p_year, 12, 1), interval '1 month') d
     WHERE NOT EXISTS (SELECT 1 FROM tax.vat_return_period x
                        WHERE x.company_id = v_company
                          AND daterange(x.starting_date, x.ending_date, '[]') && daterange(d::date, (d + interval '1 month' - interval '1 day')::date, '[]'));
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION tax.fn_mn_ensure_vat_return_periods(integer) IS
    'Creates the missing monthly VAT return periods (ТТ-03а) of a year for the current company; due date = vat.return_due_day of the next month.';
GRANT EXECUTE ON FUNCTION tax.fn_mn_ensure_vat_return_periods(integer) TO app_user;
