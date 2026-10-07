-- =============================================================================
-- seed/mn_30_posting.sql - MN localization package, part 3: account determination and master-data defaults.
--
--   * gl.fn_mn_account_id                  G/L account id by number for the current company (seed helper)
--   * party.fn_mn_seed_gen_posting_groups  Gen. Bus. (DOMESTIC, EXPORT, RELATED) / Gen. Prod. (GOODS, SERVICES, FA, MISC)
--   * party.fn_mn_seed_posting_setup       General Posting Setup incl. '*' fallback rows (gen_bus NULL, D-F1),
--                                          customer posting groups (DOMESTIC, FOREIGN, EMPLOYEE), vendor posting groups
--                                          (DOMESTIC, FOREIGN, EMPLOYEE, CUSTOMS), payment terms
--   * bank.fn_mn_seed_bank_posting_groups  bank/cash/wallet posting groups (one G/L account each, FR-BNK-001 AC2)
--   * fx.fn_mn_seed_currencies             USD, EUR, CNY, RUB with FX gain/loss accounts (functionality R2, D-G3)
--   * fa.fn_mn_seed_fixed_assets           FA classes (tax life = tax_parameter code), FA posting groups, books (R2)
--   * inv.fn_mn_seed_inventory             units of measure (eBarimt measureUnit), inventory groups/setup, location
--
-- Account determination (research/bc-account-determination.md): Gen. Bus. x Gen. Prod. gives revenue, purchase,
-- discount, credit-memo and COGS accounts. Credit memos post to the sales / purchase account itself
-- (01-requirements FR-SAL: "5100 Дт" on a sales credit memo); discount accounts are used only when
-- sales_setup/purchase_setup.discount_posting separates discounts (D-F2 default: net). Direct Cost Applied =
-- Purch. Account (BC E2-inventory: a stock purchase nets to Dr Inventory). Lookup order: exact (bus, prod) row,
-- else the '*' row (gen_bus_posting_group_id NULL), which repeats the DOMESTIC accounts. A purchase discount follows
-- the cost it reduces: goods -> 6190 (contra cost of sales), services -> 7200 itself (no COGS credit for a G&A cost).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE OR REPLACE FUNCTION gl.fn_mn_account_id(p_no text) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT id FROM gl.gl_account WHERE company_id = platform.current_company_id() AND no = p_no
$$;
COMMENT ON FUNCTION gl.fn_mn_account_id(text) IS 'Seed helper: id of the G/L account with number p_no in the current company (NULL when missing).';
GRANT EXECUTE ON FUNCTION gl.fn_mn_account_id(text) TO app_user;

-- -----------------------------------------------------------------------------
-- General business / product posting groups
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION party.fn_mn_seed_gen_posting_groups() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO party.gen_bus_posting_group (tenant_id, company_id, code, description, default_vat_bus_posting_group_id)
    SELECT v_tenant, v_company, v.code, v.descr, vb.id
      FROM (VALUES ('DOMESTIC', 'Дотоодын харилцагч, нийлүүлэгч', 'DOMESTIC'),
                   ('EXPORT',   'Гадаадын харилцагч, нийлүүлэгч (экспорт / импорт)', 'EXPORT'),
                   ('RELATED',  'Холбоотой тал (IFRS for SMEs 33-р бүлгийн тодруулга)', 'DOMESTIC')) AS v(code, descr, vat)
      LEFT JOIN tax.vat_bus_posting_group vb ON vb.company_id = v_company AND vb.code = v.vat
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO party.gen_prod_posting_group (tenant_id, company_id, code, description, default_vat_prod_posting_group_id)
    SELECT v_tenant, v_company, v.code, v.descr, vp.id
      FROM (VALUES ('GOODS',    'Бараа', 'VAT10'),
                   ('SERVICES', 'Ажил, үйлчилгээ', 'VAT10'),
                   ('FA',       'Үндсэн болон биет бус хөрөнгө', 'VAT10'),
                   ('MISC',     'Бусад (дансны мөр, зардал)', 'VAT10')) AS v(code, descr, vat)
      LEFT JOIN tax.vat_prod_posting_group vp ON vp.company_id = v_company AND vp.code = v.vat
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION party.fn_mn_seed_gen_posting_groups() IS 'MN localization package: general business and product posting groups of the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION party.fn_mn_seed_gen_posting_groups() TO app_user;

-- -----------------------------------------------------------------------------
-- General posting setup, customer / vendor posting groups, payment terms
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION party.fn_mn_seed_posting_setup() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
    v_missing integer;
BEGIN
    WITH ins AS (
    INSERT INTO party.general_posting_setup (tenant_id, company_id, gen_bus_posting_group_id, gen_prod_posting_group_id,
                                             sales_account_id, sales_line_disc_account_id, sales_inv_disc_account_id,
                                             sales_credit_memo_account_id, purch_account_id, purch_line_disc_account_id,
                                             purch_inv_disc_account_id, purch_credit_memo_account_id, cogs_account_id,
                                             inventory_adjmt_account_id, direct_cost_applied_account_id)
    SELECT v_tenant, v_company, gb.id, gp.id,
           gl.fn_mn_account_id(v.sales), gl.fn_mn_account_id(v.sdisc), gl.fn_mn_account_id(v.sdisc), gl.fn_mn_account_id(v.sales),
           gl.fn_mn_account_id(v.purch), gl.fn_mn_account_id(v.pdisc), gl.fn_mn_account_id(v.pdisc), gl.fn_mn_account_id(v.purch),
           gl.fn_mn_account_id(v.cogs), gl.fn_mn_account_id(v.adj), gl.fn_mn_account_id(v.purch)
      FROM (VALUES
        -- bus ('*' = NULL), prod,  sales,  sales disc, purch,  purch disc, cogs,   inventory adjustment
        ('*',        'GOODS',    '5100', '5190',     '6100', '6190',     '6100', '6120'),
        ('*',        'SERVICES', '5110', '5190',     '7200', '7200',     '6110', NULL),
        ('*',        'FA',       '8600', NULL,       '1660', NULL,       NULL,   NULL),
        ('*',        'MISC',     '8200', NULL,       '7200', NULL,       NULL,   NULL),
        ('DOMESTIC', 'GOODS',    '5100', '5190',     '6100', '6190',     '6100', '6120'),
        ('DOMESTIC', 'SERVICES', '5110', '5190',     '7200', '7200',     '6110', NULL),
        ('DOMESTIC', 'FA',       '8600', NULL,       '1660', NULL,       NULL,   NULL),
        ('DOMESTIC', 'MISC',     '8200', NULL,       '7200', NULL,       NULL,   NULL),
        ('EXPORT',   'GOODS',    '5120', '5190',     '6100', '6190',     '6100', '6120'),
        ('EXPORT',   'SERVICES', '5120', '5190',     '7200', '7200',     '6110', NULL),
        ('EXPORT',   'FA',       '8600', NULL,       '1660', NULL,       NULL,   NULL),
        ('EXPORT',   'MISC',     '8200', NULL,       '7200', NULL,       NULL,   NULL),
        ('RELATED',  'GOODS',    '5130', '5190',     '6100', '6190',     '6100', '6120'),
        ('RELATED',  'SERVICES', '5130', '5190',     '7200', '7200',     '6110', NULL),
        ('RELATED',  'FA',       '8600', NULL,       '1660', NULL,       NULL,   NULL),
        ('RELATED',  'MISC',     '8200', NULL,       '7200', NULL,       NULL,   NULL)
      ) AS v(bus, prod, sales, sdisc, purch, pdisc, cogs, adj)
      LEFT JOIN party.gen_bus_posting_group gb ON gb.company_id = v_company AND gb.code = v.bus
      JOIN party.gen_prod_posting_group gp ON gp.company_id = v_company AND gp.code = v.prod
     WHERE v.bus = '*' OR gb.id IS NOT NULL
    ON CONFLICT DO NOTHING      -- UNIQUE NULLS NOT DISTINCT (company_id, gen_bus, gen_prod)
    RETURNING sales_account_id, purch_account_id)
    SELECT count(*), count(*) FILTER (WHERE sales_account_id IS NULL OR purch_account_id IS NULL) INTO n, v_missing FROM ins;
    v_rows := v_rows + n;
    IF v_missing > 0 THEN
        RAISE EXCEPTION 'general posting setup seed: sales/purchase accounts not found in the chart of the current company'
            USING ERRCODE = '55000', HINT = 'run gl.fn_mn_seed_chart_of_accounts() first';
    END IF;

    INSERT INTO party.customer_posting_group (tenant_id, company_id, code, description, receivables_account_id,
                                              invoice_rounding_account_id, appln_rounding_account_id)
    SELECT v_tenant, v_company, v.code, v.descr, gl.fn_mn_account_id(v.acc), gl.fn_mn_account_id('8290'), gl.fn_mn_account_id('8290')
      FROM (VALUES ('DOMESTIC', 'Дотоодын харилцагч', '1200'),
                   ('FOREIGN',  'Гадаадын харилцагч', '1201'),
                   ('EMPLOYEE', 'Ажилтан (ажилтнаас авах авлага)', '1360')) AS v(code, descr, acc)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO party.vendor_posting_group (tenant_id, company_id, code, description, payables_account_id,
                                            invoice_rounding_account_id, appln_rounding_account_id)
    SELECT v_tenant, v_company, v.code, v.descr, gl.fn_mn_account_id(v.acc), gl.fn_mn_account_id('8290'), gl.fn_mn_account_id('8290')
      FROM (VALUES ('DOMESTIC', 'Дотоодын нийлүүлэгч', '2100'),
                   ('FOREIGN',  'Гадаадын нийлүүлэгч', '2101'),
                   ('EMPLOYEE', 'Ажилтан (тайлант тооцоо)', '2210'),
                   -- customs authority: duty and import VAT are a tax liability (СБТ 2.1.1.3), and paying them is
                   -- "татварын байгууллагад төлсөн" (МГТ 1.2.7), not a trade payable / payment to suppliers
                   ('CUSTOMS',  'Гаалийн байгууллага (гаалийн татвар, импортын НӨАТ)', '2365')) AS v(code, descr, acc)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- Payment terms (BC T3; BC date formula from the document date, 'CM' = end of the current month)
    INSERT INTO party.payment_terms (tenant_id, company_id, code, description, description_en, due_date_calculation)
    SELECT v_tenant, v_company, v.code, v.descr, v.descr_en, v.formula
      FROM (VALUES ('CASH',  'Бэлнээр / шууд төлөх',  'Due immediately',      '0D'),
                   ('NET7',  '7 хоногийн дотор',      'Net 7 days',           '7D'),
                   ('NET15', '15 хоногийн дотор',     'Net 15 days',          '15D'),
                   ('NET30', '30 хоногийн дотор',     'Net 30 days',          '30D'),
                   ('EOM',   'Тухайн сарын эцэст',    'End of current month', 'CM')) AS v(code, descr, descr_en, formula)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION party.fn_mn_seed_posting_setup() IS
    'MN localization package: general posting setup (with * fallback rows), customer/vendor posting groups (incl. CUSTOMS -> 2365) and payment terms of the current company. Requires the chart of accounts. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION party.fn_mn_seed_posting_setup() TO app_user;

-- -----------------------------------------------------------------------------
-- Bank account posting groups (BC T277). FR-BNK-001 AC2: one G/L account per bank/cash account, so a second
-- MNT bank account uses BANK_MNT_2 (1111); add 1112 + BANK_MNT_3 for a third one.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bank.fn_mn_seed_bank_posting_groups() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_rows integer;
BEGIN
    INSERT INTO bank.bank_account_posting_group (tenant_id, company_id, code, description, gl_account_id)
    SELECT platform.current_tenant_id(), platform.current_company_id(), v.code, v.descr, gl.fn_mn_account_id(v.acc)
      FROM (VALUES ('CASH_MNT',   'Касс (төгрөг)',                 '1100'),
                   ('CASH_FCY',   'Касс (гадаад валют)',           '1101'),
                   ('BANK_MNT',   'Харилцах данс (төгрөг)',        '1110'),
                   ('BANK_MNT_2', 'Харилцах данс 2 (төгрөг)',      '1111'),
                   ('BANK_FCY',   'Харилцах данс (гадаад валют)',  '1115'),
                   ('WALLET',     'Цахим хэтэвч (QPay г.м.)',      '1120'),
                   ('CARD',       'Картын төлбөрийн тооцоо',       '1121')) AS v(code, descr, acc)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION bank.fn_mn_seed_bank_posting_groups() IS 'MN localization package: bank/cash/wallet posting groups of the current company (one G/L account each). Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION bank.fn_mn_seed_bank_posting_groups() TO app_user;

-- -----------------------------------------------------------------------------
-- Foreign currencies (LCY MNT is not a currency row, BC convention). Rates: Mongolbank, R2 (D-G3).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fx.fn_mn_seed_currencies() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_rows integer;
BEGIN
    INSERT INTO fx.currency (tenant_id, company_id, code, iso_code, description, symbol, amount_rounding_precision,
                             realized_gains_account_id, realized_losses_account_id,
                             unrealized_gains_account_id, unrealized_losses_account_id)
    SELECT platform.current_tenant_id(), platform.current_company_id(), i.code, i.code, i.name, i.symbol,
           CASE WHEN i.minor_units = 0 THEN 1 ELSE 0.01 END,
           gl.fn_mn_account_id('8500'), gl.fn_mn_account_id('8500'), gl.fn_mn_account_id('8510'), gl.fn_mn_account_id('8510')
      FROM fx.iso_currency i
     WHERE i.code IN ('USD','EUR','CNY','RUB')
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION fx.fn_mn_seed_currencies() IS 'MN localization package: USD, EUR, CNY, RUB for the current company with realised (8500) / unrealised (8510) FX accounts. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION fx.fn_mn_seed_currencies() TO app_user;

-- -----------------------------------------------------------------------------
-- Fixed assets (R2, D-G4): classes with the statutory tax life parameter, posting groups, depreciation books.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fa.fn_mn_seed_fixed_assets() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO fa.fa_class (tenant_id, company_id, code, name, tax_life_param_code)
    SELECT v_tenant, v_company, v.code, v.name, v.param
      FROM (VALUES ('BUILDINGS',  'Барилга, байгууламж',            'fa.tax_life.buildings_years'),
                   ('MACHINERY',  'Машин, тоног төхөөрөмж',         'fa.tax_life.machinery_years'),
                   ('VEHICLES',   'Тээврийн хэрэгсэл',              'fa.tax_life.machinery_years'),
                   ('COMPUTERS',  'Компьютер, программ хангамж',    'fa.tax_life.computers_software_years'),
                   ('FURNITURE',  'Тавилга, эд хогшил',             'fa.tax_life.other_years'),
                   ('INTANGIBLE', 'Биет бус хөрөнгө',               'fa.tax_life.intangible_definite'),
                   ('OTHER',      'Бусад үндсэн хөрөнгө',           'fa.tax_life.other_years')) AS v(code, name, param)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- Write-down (impairment, IFRS for SMEs s.27): expense 8450 (ОДТ 12), accumulated with depreciation in 1690/1790,
    -- because the NBB book below integrates write-downs with the G/L (gl_integration_write_down = true).
    INSERT INTO fa.fa_posting_group (tenant_id, company_id, code, description, acquisition_cost_account_id,
                                     accum_depreciation_account_id, depreciation_expense_account_id,
                                     gains_on_disposal_account_id, losses_on_disposal_account_id,
                                     write_down_expense_account_id, write_down_account_id)
    SELECT v_tenant, v_company, v.code, v.descr, gl.fn_mn_account_id(v.cost), gl.fn_mn_account_id(v.accum),
           gl.fn_mn_account_id(v.expense), gl.fn_mn_account_id(v.gain), gl.fn_mn_account_id(v.gain),
           gl.fn_mn_account_id('8450'), gl.fn_mn_account_id(v.accum)
      FROM (VALUES ('BUILDINGS',  'Барилга, байгууламж',         '1600', '1690', '7260', '8600'),
                   ('MACHINERY',  'Машин, тоног төхөөрөмж',      '1610', '1690', '7260', '8600'),
                   ('VEHICLES',   'Тээврийн хэрэгсэл',           '1620', '1690', '7260', '8600'),
                   ('COMPUTERS',  'Компьютер, дагалдах хэрэгсэл','1630', '1690', '7260', '8600'),
                   ('FURNITURE',  'Тавилга, эд хогшил',          '1640', '1690', '7260', '8600'),
                   ('OTHER',      'Бусад үндсэн хөрөнгө',        '1660', '1690', '7260', '8600'),
                   ('SOFTWARE',   'Программ хангамж',            '1700', '1790', '7261', '8610'),
                   ('INTANGIBLE', 'Бусад биет бус хөрөнгө',      '1730', '1790', '7261', '8610')) AS v(code, descr, cost, accum, expense, gain)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO fa.depreciation_book (tenant_id, company_id, code, description, book_type, gl_integration_acq_cost,
                                      gl_integration_depreciation, gl_integration_write_down, gl_integration_disposal)
    VALUES (v_tenant, v_company, 'NBB', 'Нягтлан бодох бүртгэлийн дэвтэр (СТОУС)', 'ACCOUNTING', true, true, true, true),
           (v_tenant, v_company, 'TAX', 'Татварын дэвтэр (ААНОАТ-ын хуулийн хугацаа, memo)', 'TAX', false, false, false, false)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION fa.fn_mn_seed_fixed_assets() IS 'MN localization package: FA classes (tax life via tax_parameter code), FA posting groups and the ACCOUNTING/TAX depreciation books of the current company (R2). Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION fa.fn_mn_seed_fixed_assets() TO app_user;

-- -----------------------------------------------------------------------------
-- Units of measure (codes are code20, the Mongolian text goes to eBarimt measureUnit), inventory (R2).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inv.fn_mn_seed_inventory() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO inv.unit_of_measure (tenant_id, company_id, code, description, ebarimt_measure_unit)
    SELECT v_tenant, v_company, v.code, v.descr, v.unit
      FROM (VALUES ('PCS',     'Ширхэг',          'ш'),
                   ('KG',      'Килограмм',       'кг'),
                   ('G',       'Грамм',           'гр'),
                   ('TN',      'Тонн',            'тн'),
                   ('L',       'Литр',            'л'),
                   ('ML',      'Миллилитр',       'мл'),
                   ('M',       'Метр',            'м'),
                   ('M2',      'Квадрат метр',    'м2'),
                   ('M3',      'Шоо метр',        'м3'),
                   ('KM',      'Километр',        'км'),
                   ('HOUR',    'Цаг',             'цаг'),
                   ('DAY',     'Өдөр',            'өдөр'),
                   ('MONTH',   'Сар',             'сар'),
                   ('SERVICE', 'Үйлчилгээ',       'үйлчилгээ'),
                   ('SET',     'Багц, иж бүрдэл', 'багц'),
                   ('BOX',     'Хайрцаг',         'хайрцаг'),
                   ('PACK',    'Боодол',          'боодол'),
                   ('PAIR',    'Хос',             'хос'),
                   ('BOTTLE',  'Шил, лонх',       'шил'),
                   ('KWH',     'Киловатт цаг',    'кВт.ц')) AS v(code, descr, unit)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO inv.inventory_posting_group (tenant_id, company_id, code, description)
    SELECT v_tenant, v_company, v.code, v.descr
      FROM (VALUES ('GOODS', 'Худалдааны бараа'), ('MATERIALS', 'Түүхий эд, материал'),
                   ('FINISHED', 'Бэлэн бүтээгдэхүүн'), ('SUPPLIES', 'Хангамжийн материал')) AS v(code, descr)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO inv.location (tenant_id, company_id, code, name, is_default)
    VALUES (v_tenant, v_company, 'MAIN', 'Үндсэн агуулах', true)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- location NULL = every location (micro: one location, R2)
    INSERT INTO inv.inventory_posting_setup (tenant_id, company_id, location_id, inventory_posting_group_id, inventory_account_id)
    SELECT v_tenant, v_company, NULL, g.id, gl.fn_mn_account_id(v.acc)
      FROM (VALUES ('GOODS','1400'), ('MATERIALS','1410'), ('FINISHED','1430'), ('SUPPLIES','1440')) AS v(code, acc)
      JOIN inv.inventory_posting_group g ON g.company_id = v_company AND g.code = v.code
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION inv.fn_mn_seed_inventory() IS 'MN localization package: units of measure (eBarimt measureUnit), inventory posting groups/setup and the default location of the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION inv.fn_mn_seed_inventory() TO app_user;
