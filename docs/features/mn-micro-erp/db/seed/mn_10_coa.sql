-- =============================================================================
-- seed/mn_10_coa.sql - MN localization package, part 1: chart of accounts.
--
-- PROPOSED SEED CHART - NOT AN OFFICIAL CHART. Mongolia has had no mandatory chart of accounts for
-- ordinary companies since MoF Order 13 of 17 Jan 2017 repealed the 2000/116 model chart; every company
-- approves its own chart in its accounting policy (research/mn-accounting.md §4.1). This chart follows the
-- design proposal of mn-accounting.md §4.2 and keeps every account number used by 01-requirements.md
-- (1100, 1110, 1200, 1300, 1400, 1600, 1690, 2100, 2200, 2300, 3400, 3500, 5100, 6100, 7200, 8300, 8500, 8600).
--
-- Numbering scheme (4 digits, class digit = Form A section):
--   1xxx assets (11 cash, 12 receivables, 13 tax/other receivables, 14 inventory, 15 prepaid/other current,
--        16 PPE, 17 intangibles, 18 other non-current)        2xxx liabilities (20-26 current, 27 non-current)
--   3xxx equity (3400 retained earnings, 3500 current-year result = closing account, D-D4)
--   5xxx revenue   6xxx cost of sales   7xxx operating expenses (71 selling, 72 G&A)
--   8xxx other income/expenses, finance costs, FX and disposal gains/losses   9xxx income tax, discontinued ops
--   No 9900 "summary" account: D-D4 closes income and expense accounts straight into 3500.
-- Structure accounts: x000 = BEGIN_TOTAL of the class, x999 = END_TOTAL of the class; sections inside a class
-- (current / non-current) are BEGIN_TOTAL/END_TOTAL pairs at 1001/1598, 1599/1998, 2001/2698, 2699/2998;
-- a HEADING sits on the number just before its group (1199 "Дансны авлага" precedes 1200).
--
-- Every POSTING account carries: income_balance (derived from the category), normal side (warning only, D-D1),
-- direct_posting = false for control accounts (receivables, payables, VAT, bank/cash/wallet; FR-GL-003); the
-- inventory (14xx), asset-cost (16xx/17xx) and accumulated-depreciation (1690/1790) accounts stay open in R1 and are
-- closed by platform.fn_mn_enable_r2_controls() when inventory / fixed assets are switched on (11 SCR-FA-06),
-- cit_treatment = NON_DEDUCTIBLE for 8430 fines and penalties (08 CR-TAX-10), NORMAL otherwise,
-- the Form A line (rpt.statement_line, СБТ for balance sheet / ОДТ for income statement accounts), the МГТ
-- cash-flow category of the direct method, and default Gen. Prod. / VAT Prod. groups so that a G/L-account
-- line on a sales or purchase document resolves its posting setup without extra input (BC R-ACCOUNT-DETERMINATION-05).
-- gen_posting_type stays NONE: journals never compute VAT implicitly; VAT comes from documents (D-E4).
--
-- To change the seed: edit the VALUES rows below and re-apply this file (CREATE OR REPLACE). Provisioning is
-- idempotent and only inserts missing accounts, so existing companies keep their own edits.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE OR REPLACE FUNCTION gl.fn_mn_seed_chart_of_accounts() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
    v_unmapped text;
BEGIN
    -- -------------------------------------------------------------------------
    -- Account categories (BC T570 tree; additional_report_definition drives the BC-style indirect cash flow)
    -- -------------------------------------------------------------------------
    INSERT INTO gl.gl_account_category (tenant_id, company_id, code, description, description_en, account_category,
                                        additional_report_definition, sort_order, system_generated)
    SELECT v_tenant, v_company, v.code, v.descr, v.descr_en, v.cat, 'NONE', v.sort, true
      FROM (VALUES ('ASSETS','Хөрөнгө','Assets','ASSETS',10), ('LIABILITIES','Өр төлбөр','Liabilities','LIABILITIES',20),
                   ('EQUITY','Эздийн өмч','Equity','EQUITY',30), ('INCOME','Орлого','Income','INCOME',40),
                   ('COGS','Борлуулалтын өртөг','Cost of sales','COGS',50), ('EXPENSE','Зардал','Expenses','EXPENSE',60))
           AS v(code, descr, descr_en, cat, sort)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO gl.gl_account_category (tenant_id, company_id, parent_id, code, description, description_en, account_category,
                                        additional_report_definition, sort_order, system_generated)
    SELECT v_tenant, v_company, p.id, v.code, v.descr, v.descr_en, p.account_category, v.ard, v.sort, true
      FROM (VALUES
        ('ASSETS','CASH','Мөнгө, түүнтэй адилтгах хөрөнгө','Cash and cash equivalents','CASH_ACCOUNTS',11),
        ('ASSETS','AR','Дансны авлага','Trade receivables','OPERATING',12),
        ('ASSETS','TAX_RECEIVABLE','Татвар, НДШ-ийн авлага','Tax receivables','OPERATING',13),
        ('ASSETS','OTHER_RECEIVABLE','Бусад авлага','Other receivables','OPERATING',14),
        ('ASSETS','OTHER_FIN_ASSET','Бусад санхүүгийн хөрөнгө','Other financial assets','INVESTING',15),
        ('ASSETS','INVENTORY','Бараа материал','Inventories','OPERATING',16),
        ('ASSETS','PREPAID','Урьдчилж төлсөн зардал','Prepayments','OPERATING',17),
        ('ASSETS','OTHER_CURRENT','Бусад эргэлтийн хөрөнгө','Other current assets','OPERATING',18),
        ('ASSETS','PPE','Үндсэн хөрөнгө','Property, plant and equipment','INVESTING',21),
        ('ASSETS','ACCUM_DEPR','Хуримтлагдсан элэгдэл','Accumulated depreciation','INVESTING',22),
        ('ASSETS','INTANGIBLE','Биет бус хөрөнгө','Intangible assets','INVESTING',23),
        ('ASSETS','LT_INVEST','Урт хугацаат хөрөнгө оруулалт','Long-term investments','INVESTING',24),
        ('ASSETS','INVEST_PROPERTY','Хөрөнгө оруулалтын үл хөдлөх хөрөнгө','Investment property','INVESTING',25),
        ('ASSETS','DEFERRED_TAX_ASSET','Хойшлогдсон татварын хөрөнгө','Deferred tax assets','NONE',26),
        ('ASSETS','OTHER_NONCURRENT','Бусад эргэлтийн бус хөрөнгө','Other non-current assets','INVESTING',27),
        ('LIABILITIES','AP','Дансны өглөг','Trade payables','OPERATING',31),
        ('LIABILITIES','PAYROLL_LIAB','Цалингийн өглөг','Payroll liabilities','OPERATING',32),
        ('LIABILITIES','TAX_LIAB','Татварын өр','Taxes payable','OPERATING',33),
        ('LIABILITIES','SI_LIAB','НДШ-ийн өглөг','Social insurance payable','OPERATING',34),
        ('LIABILITIES','ST_LOANS','Богино хугацаат зээл','Short-term borrowings','FINANCING',35),
        ('LIABILITIES','INTEREST_DIV_PAYABLE','Хүү, ногдол ашгийн өглөг','Interest and dividends payable','OPERATING',36),
        ('LIABILITIES','DEFERRED_REVENUE','Урьдчилж орсон орлого','Deferred income','OPERATING',37),
        ('LIABILITIES','PROVISIONS','Нөөц (өр төлбөр)','Provisions','OPERATING',38),
        ('LIABILITIES','OTHER_CURRENT_LIAB','Бусад богино хугацаат өр төлбөр','Other current liabilities','OPERATING',39),
        ('LIABILITIES','LT_LOANS','Урт хугацаат зээл','Long-term borrowings','FINANCING',41),
        ('LIABILITIES','DEFERRED_TAX_LIAB','Хойшлогдсон татварын өр','Deferred tax liabilities','NONE',42),
        ('LIABILITIES','OTHER_LT_LIAB','Бусад урт хугацаат өр төлбөр','Other non-current liabilities','FINANCING',43),
        ('EQUITY','CAPITAL','Өмч','Share capital','FINANCING',51),
        ('EQUITY','SHARE_PREMIUM','Нэмж төлөгдсөн капитал','Share premium','FINANCING',52),
        ('EQUITY','REVALUATION','Дахин үнэлгээний нэмэгдэл','Revaluation surplus','NONE',53),
        ('EQUITY','OTHER_EQUITY','Эздийн өмчийн бусад хэсэг','Other equity','NONE',54),
        ('EQUITY','RETAINED_EARNINGS','Хуримтлагдсан ашиг','Retained earnings','RETAINED_EARNINGS',55),
        ('EQUITY','DIVIDENDS','Ногдол ашиг','Distributions to owners','DISTRIBUTION_TO_SHAREHOLDERS',56),
        ('INCOME','REVENUE','Борлуулалтын орлого','Revenue','NONE',61),
        ('INCOME','OTHER_INCOME','Бусад орлого','Other income','NONE',62),
        ('INCOME','GAINS','Олз (гарз)','Gains and losses','NONE',63),
        ('INCOME','DISCONTINUED','Зогсоосон үйл ажиллагаа','Discontinued operations','NONE',64),
        ('COGS','COST_OF_SALES','Борлуулалтын өртөг','Cost of sales','NONE',71),
        ('EXPENSE','SELLING','Борлуулалт, маркетингийн зардал','Selling and marketing','NONE',81),
        ('EXPENSE','ADMIN','Ерөнхий ба удирдлагын зардал','General and administrative','NONE',82),
        ('EXPENSE','FINANCE_COST','Санхүүгийн зардал','Finance costs','NONE',83),
        ('EXPENSE','OTHER_EXPENSE','Бусад зардал','Other expenses','NONE',84),
        ('EXPENSE','INCOME_TAX','Орлогын татварын зардал','Income tax expense','NONE',85)
      ) AS v(parent, code, descr, descr_en, ard, sort)
      JOIN gl.gl_account_category p ON p.company_id = v_company AND p.code = v.parent
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- -------------------------------------------------------------------------
    -- Accounts. Columns: no | type (P posting, H heading, B begin-total, E end-total, T total) | name | name_en |
    -- category | subcategory | normal side (D/C/B) | direct posting | totaling | indentation |
    -- Form A line (СБТ or ОДТ by income_balance) | МГТ category | default gen. prod. group | default VAT prod. group
    -- -------------------------------------------------------------------------
    WITH ins AS (
    INSERT INTO gl.gl_account (tenant_id, company_id, no, name, name_en, search_name, account_type, income_balance,
                               account_category, account_subcategory_id, normal_side, totaling, indentation, direct_posting,
                               gen_posting_type, gen_prod_posting_group_id, vat_prod_posting_group_id,
                               statement_line_id, cash_flow_category_id, cit_treatment)
    SELECT v_tenant, v_company, v.no, v.name, v.name_en, upper(v.name),
           CASE v.t WHEN 'P' THEN 'POSTING' WHEN 'H' THEN 'HEADING' WHEN 'B' THEN 'BEGIN_TOTAL'
                    WHEN 'E' THEN 'END_TOTAL' ELSE 'TOTAL' END,
           CASE WHEN left(v.no, 1) IN ('1','2','3') THEN 'BALANCE_SHEET' ELSE 'INCOME_STATEMENT' END,
           v.cat, sc.id,
           CASE v.side WHEN 'D' THEN 'DEBIT' WHEN 'C' THEN 'CREDIT' ELSE 'BOTH' END,
           v.totaling, v.ind, v.direct, 'NONE', gp.id, vp.id, sl.id, cf.id,
           CASE WHEN v.no IN ('8430') THEN 'NON_DEDUCTIBLE' ELSE 'NORMAL' END   -- 08 CR-TAX-10: fines are not CIT-deductible
      FROM (VALUES
        -- ===== 1 ХӨРӨНГӨ =====
        ('1000','B','ХӨРӨНГӨ','ASSETS','ASSETS',NULL,'D',false,NULL,0,NULL,NULL,NULL,NULL),
        ('1001','B','Эргэлтийн хөрөнгө','Current assets','ASSETS',NULL,'D',false,NULL,1,NULL,NULL,NULL,NULL),
        ('1099','H','Мөнгө, түүнтэй адилтгах хөрөнгө','Cash and cash equivalents','ASSETS',NULL,'D',false,NULL,2,NULL,NULL,NULL,NULL),
        ('1100','P','Касс (төгрөг)','Cash on hand (MNT)','ASSETS','CASH','D',false,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1101','P','Касс (гадаад валют)','Cash on hand (foreign currency)','ASSETS','CASH','D',false,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1110','P','Харилцах данс (төгрөг)','Bank current account (MNT)','ASSETS','CASH','D',false,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1111','P','Харилцах данс 2 (төгрөг)','Bank current account 2 (MNT)','ASSETS','CASH','D',false,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1115','P','Харилцах данс (гадаад валют)','Bank current account (foreign currency)','ASSETS','CASH','D',false,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1120','P','Цахим хэтэвч (QPay г.м.)','E-wallet (QPay etc.)','ASSETS','CASH','D',false,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1121','P','Картын төлбөрийн тооцоо','Card payments clearing','ASSETS','CASH','D',false,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1130','P','Богино хугацаат хадгаламж (3 сар хүртэл)','Short-term deposits (up to 3 months)','ASSETS','CASH','D',true,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1140','P','Замд яваа мөнгөн хөрөнгө','Cash in transit','ASSETS','CASH','D',true,NULL,3,'1.1.1','CASH_TRANSFER',NULL,NULL),
        ('1199','H','Дансны авлага','Trade receivables','ASSETS',NULL,'D',false,NULL,2,NULL,NULL,NULL,NULL),
        ('1200','P','Дансны авлага','Trade receivables','ASSETS','AR','D',false,NULL,3,'1.1.2','OP_CUST_RECEIPTS',NULL,NULL),
        ('1201','P','Дансны авлага (гадаад)','Trade receivables (foreign)','ASSETS','AR','D',false,NULL,3,'1.1.2','OP_CUST_RECEIPTS',NULL,NULL),
        ('1250','P','Найдваргүй авлагын хасагдуулга','Allowance for doubtful receivables','ASSETS','AR','C',true,NULL,3,'1.1.2','NON_CASH',NULL,NULL),
        ('1299','H','Татвар, бусад авлага','Tax and other receivables','ASSETS',NULL,'D',false,NULL,2,NULL,NULL,NULL,NULL),
        ('1300','P','Орцын НӨАТ (татварын авлага)','Input VAT receivable','ASSETS','TAX_RECEIVABLE','D',false,NULL,3,'1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('1310','P','ААНОАТ-ын урьдчилгаа төлөлт','Prepaid corporate income tax','ASSETS','TAX_RECEIVABLE','D',true,NULL,3,'1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('1330','P','Бусад татвар, НДШ-ийн авлага','Other tax and social insurance receivables','ASSETS','TAX_RECEIVABLE','D',true,NULL,3,'1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('1350','P','Бусад авлага','Other receivables','ASSETS','OTHER_RECEIVABLE','D',true,NULL,3,'1.1.4','OP_OTHER_RECEIPTS',NULL,NULL),
        ('1360','P','Ажилтнаас авах авлага','Receivables from employees','ASSETS','OTHER_RECEIVABLE','D',false,NULL,3,'1.1.4','OP_OTHER_PAYMENTS',NULL,NULL),
        ('1370','P','Богино хугацаат олгосон зээл','Short-term loans granted','ASSETS','OTHER_FIN_ASSET','D',true,NULL,3,'1.1.5','INV_LOANS_GIVEN',NULL,NULL),
        ('1399','H','Бараа материал','Inventories','ASSETS',NULL,'D',false,NULL,2,NULL,NULL,NULL,NULL),
        ('1400','P','Барааны нөөц (худалдааны бараа)','Merchandise inventory','ASSETS','INVENTORY','D',true,NULL,3,'1.1.6','OP_SUPPLIERS','GOODS','VAT10'),
        ('1410','P','Түүхий эд, материал','Raw materials','ASSETS','INVENTORY','D',true,NULL,3,'1.1.6','OP_SUPPLIERS','GOODS','VAT10'),
        ('1420','P','Дуусаагүй үйлдвэрлэл','Work in progress','ASSETS','INVENTORY','D',true,NULL,3,'1.1.6','OP_SUPPLIERS',NULL,NULL),
        ('1430','P','Бэлэн бүтээгдэхүүн','Finished goods','ASSETS','INVENTORY','D',true,NULL,3,'1.1.6','OP_SUPPLIERS',NULL,NULL),
        ('1440','P','Хангамжийн материал, бага үнэтэй ажмын хэрэгсэл','Supplies and low-value items','ASSETS','INVENTORY','D',true,NULL,3,'1.1.6','OP_SUPPLIERS','GOODS','VAT10'),
        ('1490','P','Бараа материалын үнэ цэнийн бууралт','Inventory write-down allowance','ASSETS','INVENTORY','C',true,NULL,3,'1.1.6','NON_CASH',NULL,NULL),
        ('1499','H','Урьдчилгаа, бусад эргэлтийн хөрөнгө','Prepayments and other current assets','ASSETS',NULL,'D',false,NULL,2,NULL,NULL,NULL,NULL),
        ('1500','P','Урьдчилж төлсөн зардал','Prepaid expenses','ASSETS','PREPAID','D',true,NULL,3,'1.1.7','OP_OPERATING_EXP',NULL,NULL),
        ('1510','P','Нийлүүлэгчид төлсөн урьдчилгаа','Advances to suppliers','ASSETS','PREPAID','D',true,NULL,3,'1.1.7','OP_SUPPLIERS',NULL,NULL),
        ('1580','P','Бусад эргэлтийн хөрөнгө','Other current assets','ASSETS','OTHER_CURRENT','D',true,NULL,3,'1.1.8','OP_OTHER_PAYMENTS',NULL,NULL),
        ('1598','E','Эргэлтийн хөрөнгийн дүн','Total current assets','ASSETS',NULL,'D',false,'1001..1598',1,NULL,NULL,NULL,NULL),
        ('1599','B','Эргэлтийн бус хөрөнгө','Non-current assets','ASSETS',NULL,'D',false,NULL,1,NULL,NULL,NULL,NULL),
        ('1600','P','Барилга, байгууламж','Buildings and structures','ASSETS','PPE','D',true,NULL,3,'1.2.1','INV_FA_BUY','FA','VAT10'),
        ('1610','P','Машин, тоног төхөөрөмж','Machinery and equipment','ASSETS','PPE','D',true,NULL,3,'1.2.1','INV_FA_BUY','FA','VAT10'),
        ('1620','P','Тээврийн хэрэгсэл','Vehicles','ASSETS','PPE','D',true,NULL,3,'1.2.1','INV_FA_BUY','FA','VAT10'),
        ('1630','P','Компьютер, дагалдах хэрэгсэл','Computers and peripherals','ASSETS','PPE','D',true,NULL,3,'1.2.1','INV_FA_BUY','FA','VAT10'),
        ('1640','P','Тавилга, эд хогшил','Furniture and fixtures','ASSETS','PPE','D',true,NULL,3,'1.2.1','INV_FA_BUY','FA','VAT10'),
        ('1660','P','Бусад үндсэн хөрөнгө','Other property, plant and equipment','ASSETS','PPE','D',true,NULL,3,'1.2.1','INV_FA_BUY','FA','VAT10'),
        ('1690','P','Үндсэн хөрөнгийн хуримтлагдсан элэгдэл','Accumulated depreciation','ASSETS','ACCUM_DEPR','C',true,NULL,3,'1.2.1','NON_CASH',NULL,NULL),
        ('1699','H','Биет бус хөрөнгө','Intangible assets','ASSETS',NULL,'D',false,NULL,2,NULL,NULL,NULL,NULL),
        ('1700','P','Программ хангамж','Software','ASSETS','INTANGIBLE','D',true,NULL,3,'1.2.2','INV_INTANGIBLE_BUY','FA','VAT10'),
        ('1720','P','Газар эзэмших эрх','Land use rights','ASSETS','INTANGIBLE','D',true,NULL,3,'1.2.2','INV_INTANGIBLE_BUY','FA','NOVAT'),
        ('1730','P','Бусад биет бус хөрөнгө (патент, лиценз, тэмдэг)','Other intangibles (patents, licences, trademarks)','ASSETS','INTANGIBLE','D',true,NULL,3,'1.2.2','INV_INTANGIBLE_BUY','FA','VAT10'),
        ('1790','P','Биет бус хөрөнгийн хуримтлагдсан хорогдуулалт','Accumulated amortisation','ASSETS','INTANGIBLE','C',true,NULL,3,'1.2.2','NON_CASH',NULL,NULL),
        ('1799','H','Бусад эргэлтийн бус хөрөнгө','Other non-current assets','ASSETS',NULL,'D',false,NULL,2,NULL,NULL,NULL,NULL),
        ('1800','P','Урт хугацаат хөрөнгө оруулалт','Long-term investments','ASSETS','LT_INVEST','D',true,NULL,3,'1.2.4','INV_INVESTMENT_BUY',NULL,NULL),
        ('1810','P','Хөрөнгө оруулалтын зориулалттай үл хөдлөх хөрөнгө','Investment property','ASSETS','INVEST_PROPERTY','D',true,NULL,3,'1.2.7','INV_OTHER_LT_BUY',NULL,NULL),
        ('1850','P','Хойшлогдсон татварын хөрөнгө','Deferred tax assets','ASSETS','DEFERRED_TAX_ASSET','D',true,NULL,3,'1.2.6','NON_CASH',NULL,NULL),
        ('1890','P','Бусад эргэлтийн бус хөрөнгө','Other non-current assets','ASSETS','OTHER_NONCURRENT','D',true,NULL,3,'1.2.8','INV_OTHER_LT_BUY',NULL,NULL),
        ('1998','E','Эргэлтийн бус хөрөнгийн дүн','Total non-current assets','ASSETS',NULL,'D',false,'1599..1998',1,NULL,NULL,NULL,NULL),
        ('1999','E','НИЙТ ХӨРӨНГӨ','TOTAL ASSETS','ASSETS',NULL,'D',false,'1000..1999',0,NULL,NULL,NULL,NULL),
        -- ===== 2 ӨР ТӨЛБӨР =====
        ('2000','B','ӨР ТӨЛБӨР','LIABILITIES','LIABILITIES',NULL,'C',false,NULL,0,NULL,NULL,NULL,NULL),
        ('2001','B','Богино хугацаат өр төлбөр','Current liabilities','LIABILITIES',NULL,'C',false,NULL,1,NULL,NULL,NULL,NULL),
        ('2099','H','Дансны өглөг','Trade payables','LIABILITIES',NULL,'C',false,NULL,2,NULL,NULL,NULL,NULL),
        ('2100','P','Дансны өглөг','Trade payables','LIABILITIES','AP','C',false,NULL,3,'2.1.1.1','OP_SUPPLIERS',NULL,NULL),
        ('2101','P','Дансны өглөг (гадаад)','Trade payables (foreign)','LIABILITIES','AP','C',false,NULL,3,'2.1.1.1','OP_SUPPLIERS',NULL,NULL),
        ('2199','H','Цалин, ажилтантай хийх тооцоо','Payroll and employee liabilities','LIABILITIES',NULL,'C',false,NULL,2,NULL,NULL,NULL,NULL),
        ('2200','P','Цалингийн өглөг','Wages payable','LIABILITIES','PAYROLL_LIAB','C',true,NULL,3,'2.1.1.2','OP_EMPLOYEES',NULL,NULL),
        ('2210','P','Ажилтанд өгөх өглөг (тайлант тооцоо)','Payables to employees (expense claims)','LIABILITIES','PAYROLL_LIAB','C',false,NULL,3,'2.1.1.2','OP_OTHER_PAYMENTS',NULL,NULL),
        ('2299','H','Татвар, НДШ-ийн өглөг','Taxes and social insurance payable','LIABILITIES',NULL,'C',false,NULL,2,NULL,NULL,NULL,NULL),
        ('2300','P','Борлуулалтын НӨАТ (татварын өр)','Output VAT payable','LIABILITIES','TAX_LIAB','C',false,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2305','P','Урвуу тооцооны НӨАТ','Reverse-charge VAT payable','LIABILITIES','TAX_LIAB','C',false,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2310','P','НӨАТ-ын тооцоо (төлөх / буцаан авах)','VAT settlement account','LIABILITIES','TAX_LIAB','B',true,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2320','P','НХАТ-ын өглөг','City tax payable','LIABILITIES','TAX_LIAB','C',false,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2325','P','НХАТ-ын тооцоо (төлөх)','City tax settlement account','LIABILITIES','TAX_LIAB','C',true,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2330','P','ААНОАТ-ын өглөг','Corporate income tax payable','LIABILITIES','TAX_LIAB','C',true,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2340','P','ХХОАТ-ын өглөг (суутгасан)','Personal income tax withheld','LIABILITIES','TAX_LIAB','C',true,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2345','P','Суутган татварын өглөг','Withholding tax payable','LIABILITIES','TAX_LIAB','C',true,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2350','P','НДШ-ийн өглөг','Social insurance payable','LIABILITIES','SI_LIAB','C',true,NULL,3,'2.1.1.4','OP_SOCIAL_INSURANCE',NULL,NULL),
        ('2360','P','Бусад татвар, хураамжийн өглөг','Other taxes and fees payable','LIABILITIES','TAX_LIAB','C',true,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2365','P','Гаалийн татвар, импортын НӨАТ-ын өглөг','Customs duties and import VAT payable','LIABILITIES','TAX_LIAB','C',false,NULL,3,'2.1.1.3','OP_TAXES_PAID',NULL,NULL),
        ('2399','H','Зээл, хүү, ногдол ашиг','Borrowings, interest and dividends','LIABILITIES',NULL,'C',false,NULL,2,NULL,NULL,NULL,NULL),
        ('2400','P','Богино хугацаат банкны зээл','Short-term bank loans','LIABILITIES','ST_LOANS','C',true,NULL,3,'2.1.1.5','FIN_BORROWINGS',NULL,NULL),
        ('2420','P','Бусад богино хугацаат зээл (эзэд, хувь хүн)','Other short-term borrowings (owners, individuals)','LIABILITIES','ST_LOANS','C',true,NULL,3,'2.1.1.5','FIN_BORROWINGS',NULL,NULL),
        ('2450','P','Хүүний өглөг','Interest payable','LIABILITIES','INTEREST_DIV_PAYABLE','C',true,NULL,3,'2.1.1.6','OP_INTEREST_PAID',NULL,NULL),
        ('2460','P','Ногдол ашгийн өглөг','Dividends payable','LIABILITIES','INTEREST_DIV_PAYABLE','C',true,NULL,3,'2.1.1.7','FIN_DIVIDENDS_PAID',NULL,NULL),
        ('2499','H','Урьдчилгаа, нөөц, бусад өр төлбөр','Advances, provisions and other liabilities','LIABILITIES',NULL,'C',false,NULL,2,NULL,NULL,NULL,NULL),
        ('2500','P','Урьдчилж орсон орлого','Deferred income','LIABILITIES','DEFERRED_REVENUE','C',true,NULL,3,'2.1.1.8','OP_CUST_RECEIPTS',NULL,NULL),
        ('2510','P','Захиалагчаас авсан урьдчилгаа','Advances from customers','LIABILITIES','DEFERRED_REVENUE','C',true,NULL,3,'2.1.1.8','OP_CUST_RECEIPTS',NULL,NULL),
        ('2600','P','Нөөц (өр төлбөр)','Provisions','LIABILITIES','PROVISIONS','C',true,NULL,3,'2.1.1.9','OP_OTHER_PAYMENTS',NULL,NULL),
        ('2650','P','Бусад богино хугацаат өр төлбөр','Other current liabilities','LIABILITIES','OTHER_CURRENT_LIAB','C',true,NULL,3,'2.1.1.10','OP_OTHER_PAYMENTS',NULL,NULL),
        ('2690','P','Тодорхойгүй гүйлгээний түр данс','Suspense account','LIABILITIES','OTHER_CURRENT_LIAB','B',true,NULL,3,'2.1.1.10','NON_CASH',NULL,NULL),
        ('2698','E','Богино хугацаат өр төлбөрийн дүн','Total current liabilities','LIABILITIES',NULL,'C',false,'2001..2698',1,NULL,NULL,NULL,NULL),
        ('2699','B','Урт хугацаат өр төлбөр','Non-current liabilities','LIABILITIES',NULL,'C',false,NULL,1,NULL,NULL,NULL,NULL),
        ('2700','P','Урт хугацаат банкны зээл','Long-term bank loans','LIABILITIES','LT_LOANS','C',true,NULL,3,'2.1.2.1','FIN_BORROWINGS',NULL,NULL),
        ('2750','P','Хойшлогдсон татварын өр','Deferred tax liabilities','LIABILITIES','DEFERRED_TAX_LIAB','C',true,NULL,3,'2.1.2.2','NON_CASH',NULL,NULL),
        ('2790','P','Бусад урт хугацаат өр төлбөр','Other non-current liabilities','LIABILITIES','OTHER_LT_LIAB','C',true,NULL,3,'2.1.2.3','FIN_BORROWINGS',NULL,NULL),
        ('2998','E','Урт хугацаат өр төлбөрийн дүн','Total non-current liabilities','LIABILITIES',NULL,'C',false,'2699..2998',1,NULL,NULL,NULL,NULL),
        ('2999','E','НИЙТ ӨР ТӨЛБӨР','TOTAL LIABILITIES','LIABILITIES',NULL,'C',false,'2000..2999',0,NULL,NULL,NULL,NULL),
        -- ===== 3 ЭЗДИЙН ӨМЧ =====
        ('3000','B','ЭЗДИЙН ӨМЧ','EQUITY','EQUITY',NULL,'C',false,NULL,0,NULL,NULL,NULL,NULL),
        ('3100','P','Өмч (дүрмийн сан)','Share capital','EQUITY','CAPITAL','C',true,NULL,1,'2.2.1','FIN_SHARES_ISSUED',NULL,NULL),
        ('3200','P','Нэмж төлөгдсөн капитал','Share premium','EQUITY','SHARE_PREMIUM','C',true,NULL,1,'2.2.3','FIN_SHARES_ISSUED',NULL,NULL),
        ('3300','P','Хөрөнгийн дахин үнэлгээний нэмэгдэл','Revaluation surplus','EQUITY','REVALUATION','C',true,NULL,1,'2.2.4','NON_CASH',NULL,NULL),
        ('3360','P','Эздийн өмчийн бусад хэсэг','Other components of equity','EQUITY','OTHER_EQUITY','C',true,NULL,1,'2.2.6','FIN_SHARES_ISSUED',NULL,NULL),
        ('3400','P','Хуримтлагдсан ашиг (алдагдал)','Retained earnings','EQUITY','RETAINED_EARNINGS','C',true,NULL,1,'2.2.7','NON_CASH',NULL,NULL),
        ('3410','P','Зарласан ногдол ашиг','Dividends declared','EQUITY','DIVIDENDS','D',true,NULL,1,'2.2.7','FIN_DIVIDENDS_PAID',NULL,NULL),
        ('3500','P','Тайлант үеийн ашиг (алдагдал)','Current year profit (loss)','EQUITY','RETAINED_EARNINGS','C',true,NULL,1,'2.2.7','NON_CASH',NULL,NULL),
        ('3999','E','НИЙТ ЭЗДИЙН ӨМЧ','TOTAL EQUITY','EQUITY',NULL,'C',false,'3000..3999',0,NULL,NULL,NULL,NULL),
        -- ===== 5 ОРЛОГО =====
        ('5000','B','БОРЛУУЛАЛТЫН ОРЛОГО','REVENUE','INCOME',NULL,'C',false,NULL,0,NULL,NULL,NULL,NULL),
        ('5100','P','Борлуулалтын орлого - бараа','Revenue from sale of goods','INCOME','REVENUE','C',true,NULL,1,'1','OP_CUST_RECEIPTS','GOODS','VAT10'),
        ('5110','P','Ажил, үйлчилгээний орлого','Revenue from services','INCOME','REVENUE','C',true,NULL,1,'1','OP_CUST_RECEIPTS','SERVICES','VAT10'),
        ('5120','P','Экспортын борлуулалтын орлого','Export revenue','INCOME','REVENUE','C',true,NULL,1,'1','OP_CUST_RECEIPTS','GOODS','VAT10'),
        ('5130','P','Холбоотой талд борлуулсан орлого','Revenue from related parties','INCOME','REVENUE','C',true,NULL,1,'1','OP_CUST_RECEIPTS','GOODS','VAT10'),
        ('5190','P','Борлуулалтын буцаалт, хөнгөлөлт','Sales returns and discounts','INCOME','REVENUE','D',true,NULL,1,'1','OP_CUST_RECEIPTS','GOODS','VAT10'),
        ('5999','E','НИЙТ БОРЛУУЛАЛТЫН ОРЛОГО','TOTAL REVENUE','INCOME',NULL,'C',false,'5000..5999',0,NULL,NULL,NULL,NULL),
        -- ===== 6 БОРЛУУЛАЛТЫН ӨРТӨГ =====
        ('6000','B','БОРЛУУЛАЛТЫН ӨРТӨГ','COST OF SALES','COGS',NULL,'D',false,NULL,0,NULL,NULL,NULL,NULL),
        ('6100','P','Борлуулсан барааны өртөг','Cost of goods sold','COGS','COST_OF_SALES','D',true,NULL,1,'2','OP_SUPPLIERS','GOODS','VAT10'),
        ('6110','P','Борлуулсан ажил, үйлчилгээний өртөг','Cost of services rendered','COGS','COST_OF_SALES','D',true,NULL,1,'2','OP_OPERATING_EXP','SERVICES','VAT10'),
        ('6120','P','Бараа материалын хорогдол, тооллогын зөрүү','Inventory shrinkage and count differences','COGS','COST_OF_SALES','D',true,NULL,1,'2','NON_CASH','MISC','NOVAT'),
        ('6130','P','Шууд хөдөлмөрийн зардал','Direct labour','COGS','COST_OF_SALES','D',true,NULL,1,'2','OP_EMPLOYEES','MISC','NOVAT'),
        ('6140','P','Бэлтгэл, тээврийн зардал','Freight-in and procurement costs','COGS','COST_OF_SALES','D',true,NULL,1,'2','OP_FUEL_TRANSPORT','MISC','VAT10'),
        ('6190','P','Худалдан авалтын буцаалт, хөнгөлөлт','Purchase returns and discounts','COGS','COST_OF_SALES','C',true,NULL,1,'2','OP_SUPPLIERS','GOODS','VAT10'),
        ('6999','E','НИЙТ БОРЛУУЛАЛТЫН ӨРТӨГ','TOTAL COST OF SALES','COGS',NULL,'D',false,'6000..6999',0,NULL,NULL,NULL,NULL),
        -- ===== 7 ҮЙЛ АЖИЛЛАГААНЫ ЗАРДАЛ =====
        ('7000','B','ҮЙЛ АЖИЛЛАГААНЫ ЗАРДАЛ','OPERATING EXPENSES','EXPENSE',NULL,'D',false,NULL,0,NULL,NULL,NULL,NULL),
        ('7099','H','Борлуулалт, маркетингийн зардал','Selling and marketing expenses','EXPENSE',NULL,'D',false,NULL,1,NULL,NULL,NULL,NULL),
        ('7100','P','Борлуулалт, маркетингийн бусад зардал','Other selling and marketing expenses','EXPENSE','SELLING','D',true,NULL,2,'9','OP_OPERATING_EXP','MISC','VAT10'),
        ('7110','P','Зар сурталчилгааны зардал','Advertising','EXPENSE','SELLING','D',true,NULL,2,'9','OP_OPERATING_EXP','MISC','VAT10'),
        ('7120','P','Борлуулалтын ажилтны цалин, НДШ','Sales staff wages and social insurance','EXPENSE','SELLING','D',true,NULL,2,'9','OP_EMPLOYEES','MISC','NOVAT'),
        ('7140','P','Тээвэрлэлт, хүргэлтийн зардал','Delivery and freight-out','EXPENSE','SELLING','D',true,NULL,2,'9','OP_FUEL_TRANSPORT','MISC','VAT10'),
        ('7150','P','Борлуулалтын шимтгэл, комисс','Sales commissions','EXPENSE','SELLING','D',true,NULL,2,'9','OP_OPERATING_EXP','MISC','VAT10'),
        ('7199','H','Ерөнхий ба удирдлагын зардал','General and administrative expenses','EXPENSE',NULL,'D',false,NULL,1,NULL,NULL,NULL,NULL),
        ('7200','P','Ерөнхий ба удирдлагын бусад зардал','Other general and administrative expenses','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7201','P','Цалингийн зардал','Salaries and wages','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_EMPLOYEES','MISC','NOVAT'),
        ('7202','P','НДШ-ийн зардал (ажил олгогч)','Social insurance (employer share)','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_SOCIAL_INSURANCE','MISC','NOVAT'),
        ('7210','P','Түрээсийн зардал','Rent','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7211','P','Ашиглалтын зардал (цахилгаан, дулаан, ус)','Utilities (power, heating, water)','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7212','P','Холбоо, интернэтийн зардал','Communication and internet','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7213','P','Бичиг хэрэг, хэвлэлийн зардал','Office supplies and printing','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7214','P','Засвар үйлчилгээний зардал','Repairs and maintenance','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7220','P','Шатахууны зардал','Fuel','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_FUEL_TRANSPORT','MISC','VAT10'),
        ('7221','P','Тээврийн хэрэгслийн зардал (сэлбэг, засвар)','Vehicle expenses (parts, repairs)','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_FUEL_TRANSPORT','MISC','VAT10'),
        ('7222','P','Томилолтын зардал','Business travel','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OTHER_PAYMENTS','MISC','NOVAT'),
        ('7230','P','Мэргэжлийн үйлчилгээний зардал (аудит, хууль, зөвлөх)','Professional fees (audit, legal, advisory)','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7231','P','Программ хангамж, лицензийн зардал','Software subscriptions and licences','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7232','P','Сургалтын зардал','Training','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','EXEMPT'),
        ('7240','P','Даатгалын зардал','Insurance','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_INSURANCE_PAID','MISC','EXEMPT'),
        ('7250','P','Татвар, хураамж, төлбөрийн зардал','Taxes, duties and fees','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_TAXES_PAID','MISC','NOVAT'),
        ('7260','P','Үндсэн хөрөнгийн элэгдлийн зардал','Depreciation','EXPENSE','ADMIN','D',true,NULL,2,'10','NON_CASH','MISC','NOVAT'),
        ('7261','P','Биет бус хөрөнгийн хорогдуулалтын зардал','Amortisation','EXPENSE','ADMIN','D',true,NULL,2,'10','NON_CASH','MISC','NOVAT'),
        ('7262','P','Бага үнэтэй ажмын хэрэгслийн зардал','Low-value equipment','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OPERATING_EXP','MISC','VAT10'),
        ('7270','P','Төлөөлөх, зочлох зардал','Entertainment and hospitality','EXPENSE','ADMIN','D',true,NULL,2,'10','OP_OTHER_PAYMENTS','MISC','VAT10'),
        ('7999','E','НИЙТ ҮЙЛ АЖИЛЛАГААНЫ ЗАРДАЛ','TOTAL OPERATING EXPENSES','EXPENSE',NULL,'D',false,'7000..7999',0,NULL,NULL,NULL,NULL),
        -- ===== 8 БУСАД ОРЛОГО, ЗАРДАЛ, ОЛЗ (ГАРЗ) =====
        ('8000','B','БУСАД ОРЛОГО, ЗАРДАЛ, ОЛЗ (ГАРЗ)','OTHER INCOME, EXPENSES, GAINS AND LOSSES',NULL,NULL,'B',false,NULL,0,NULL,NULL,NULL,NULL),
        ('8099','H','Түрээс, хүү, ногдол ашиг, эрхийн шимтгэлийн орлого','Rental, interest, dividend and royalty income','INCOME',NULL,'C',false,NULL,1,NULL,NULL,NULL,NULL),
        ('8100','P','Түрээсийн орлого','Rental income','INCOME','OTHER_INCOME','C',true,NULL,2,'4','OP_OTHER_RECEIPTS','SERVICES','VAT10'),
        ('8110','P','Хүүний орлого','Interest income','INCOME','OTHER_INCOME','C',true,NULL,2,'5','INV_INTEREST_RCVD','MISC','EXEMPT'),
        ('8120','P','Ногдол ашгийн орлого','Dividend income','INCOME','OTHER_INCOME','C',true,NULL,2,'6','INV_DIVIDENDS_RCVD','MISC','NOVAT'),
        ('8130','P','Эрхийн шимтгэлийн орлого','Royalty income','INCOME','OTHER_INCOME','C',true,NULL,2,'7','OP_ROYALTY_RECEIPTS','SERVICES','VAT10'),
        ('8199','H','Бусад орлого','Other income','INCOME',NULL,'C',false,NULL,1,NULL,NULL,NULL,NULL),
        ('8200','P','Бусад орлого','Other income','INCOME','OTHER_INCOME','C',true,NULL,2,'8','OP_OTHER_RECEIPTS','MISC','NOVAT'),
        ('8210','P','Татаас, санхүүжилтийн орлого','Grants and subsidies','INCOME','OTHER_INCOME','C',true,NULL,2,'8','OP_GRANTS','MISC','NOVAT'),
        ('8220','P','Даатгалын нөхөн төлбөрийн орлого','Insurance compensation','INCOME','OTHER_INCOME','C',true,NULL,2,'8','OP_INSURANCE_CLAIMS','MISC','NOVAT'),
        ('8240','P','Илүүдлийн орлого (касс, бараа)','Surpluses (cash and inventory counts)','INCOME','OTHER_INCOME','C',true,NULL,2,'8','OP_OTHER_RECEIPTS','MISC','NOVAT'),
        ('8290','P','Бөөрөнхийлөлтийн зөрүү','Rounding differences','INCOME','OTHER_INCOME','B',false,NULL,2,'8','NON_CASH','MISC','NOVAT'),
        ('8299','H','Санхүүгийн зардал','Finance costs','EXPENSE',NULL,'D',false,NULL,1,NULL,NULL,NULL,NULL),
        ('8300','P','Санхүүгийн зардал (банкны шимтгэл)','Finance costs (bank charges)','EXPENSE','FINANCE_COST','D',true,NULL,2,'11','OP_OTHER_PAYMENTS','MISC','EXEMPT'),
        ('8310','P','Зээлийн хүүний зардал','Interest expense','EXPENSE','FINANCE_COST','D',true,NULL,2,'11','OP_INTEREST_PAID','MISC','EXEMPT'),
        ('8399','H','Бусад зардал','Other expenses','EXPENSE',NULL,'D',false,NULL,1,NULL,NULL,NULL,NULL),
        ('8400','P','Бусад зардал','Other expenses','EXPENSE','OTHER_EXPENSE','D',true,NULL,2,'12','OP_OTHER_PAYMENTS','MISC','NOVAT'),
        ('8410','P','Найдваргүй авлагын зардал','Bad debt expense','EXPENSE','OTHER_EXPENSE','D',true,NULL,2,'12','NON_CASH','MISC','NOVAT'),
        ('8420','P','Хандив, тусламжийн зардал','Donations','EXPENSE','OTHER_EXPENSE','D',true,NULL,2,'12','OP_OTHER_PAYMENTS','MISC','NOVAT'),
        ('8430','P','Торгууль, алдангийн зардал','Fines and penalties','EXPENSE','OTHER_EXPENSE','D',true,NULL,2,'12','OP_OTHER_PAYMENTS','MISC','NOVAT'),
        ('8440','P','Дутагдал, хорогдлын зардал (касс, бараа)','Shortages (cash and inventory)','EXPENSE','OTHER_EXPENSE','D',true,NULL,2,'12','OP_OTHER_PAYMENTS','MISC','NOVAT'),
        ('8450','P','Хөрөнгийн үнэ цэнийн бууралтын гарз','Impairment losses','EXPENSE','OTHER_EXPENSE','D',true,NULL,2,'12','NON_CASH','MISC','NOVAT'),
        ('8499','H','Ханшийн зөрүүний олз (гарз)','Foreign exchange gains (losses)','INCOME',NULL,'B',false,NULL,1,NULL,NULL,NULL,NULL),
        ('8500','P','Ханшийн зөрүүний олз (гарз) - хэрэгжсэн','Realised FX gain (loss)','INCOME','GAINS','B',true,NULL,2,'13','FX_EFFECT','MISC','NOVAT'),
        ('8510','P','Ханшийн зөрүүний олз (гарз) - хэрэгжээгүй','Unrealised FX gain (loss)','INCOME','GAINS','B',true,NULL,2,'13','FX_EFFECT','MISC','NOVAT'),
        ('8599','H','Хөрөнгө данснаас хассаны олз (гарз)','Gains (losses) on disposal','INCOME',NULL,'B',false,NULL,1,NULL,NULL,NULL,NULL),
        ('8600','P','Үндсэн хөрөнгө данснаас хассаны олз (гарз)','Gain (loss) on disposal of PPE','INCOME','GAINS','B',true,NULL,2,'14','INV_FA_SALE','FA','VAT10'),
        ('8610','P','Биет бус хөрөнгө данснаас хассаны олз (гарз)','Gain (loss) on disposal of intangibles','INCOME','GAINS','B',true,NULL,2,'15','INV_INTANGIBLE_SALE','FA','VAT10'),
        ('8620','P','Хөрөнгө оруулалт борлуулсны олз (гарз)','Gain (loss) on sale of investments','INCOME','GAINS','B',true,NULL,2,'16','INV_INVESTMENT_SALE','MISC','NOVAT'),
        ('8690','P','Бусад ашиг (алдагдал)','Other gains (losses)','INCOME','GAINS','B',true,NULL,2,'17','OP_OTHER_RECEIPTS','MISC','NOVAT'),
        ('8999','E','НИЙТ БУСАД ОРЛОГО, ЗАРДАЛ','TOTAL OTHER INCOME AND EXPENSES',NULL,NULL,'B',false,'8000..8999',0,NULL,NULL,NULL,NULL),
        -- ===== 9 ОРЛОГЫН ТАТВАР, ЗОГСООСОН ҮЙЛ АЖИЛЛАГАА =====
        ('9000','B','ОРЛОГЫН ТАТВАР, ЗОГСООСОН ҮЙЛ АЖИЛЛАГАА','INCOME TAX AND DISCONTINUED OPERATIONS',NULL,NULL,'D',false,NULL,0,NULL,NULL,NULL,NULL),
        ('9100','P','Орлогын албан татварын зардал','Current income tax expense','EXPENSE','INCOME_TAX','D',true,NULL,1,'19','OP_TAXES_PAID','MISC','NOVAT'),
        ('9110','P','Хойшлогдсон татварын зардал (орлого)','Deferred tax expense (income)','EXPENSE','INCOME_TAX','B',true,NULL,1,'19','NON_CASH','MISC','NOVAT'),
        ('9200','P','Зогсоосон үйл ажиллагааны ашиг (алдагдал)','Profit (loss) from discontinued operations','INCOME','DISCONTINUED','B',true,NULL,1,'21','OP_OTHER_RECEIPTS','MISC','NOVAT'),
        ('9999','E','НИЙТ ОРЛОГЫН ТАТВАР, ЗОГСООСОН ҮЙЛ АЖИЛЛАГАА','TOTAL INCOME TAX AND DISCONTINUED OPERATIONS',NULL,NULL,'D',false,'9000..9999',0,NULL,NULL,NULL,NULL)
      ) AS v(no, t, name, name_en, cat, subcat, side, direct, totaling, ind, line, cf, gprod, vprod)
      LEFT JOIN gl.gl_account_category sc ON sc.company_id = v_company AND sc.code = v.subcat
      LEFT JOIN party.gen_prod_posting_group gp ON gp.company_id = v_company AND gp.code = v.gprod
      LEFT JOIN tax.vat_prod_posting_group vp ON vp.company_id = v_company AND vp.code = v.vprod
      LEFT JOIN LATERAL (
            SELECT s.id FROM rpt.statement_line s
             WHERE s.form_code = 'A' AND s.line_code = v.line AND s.effective_to IS NULL
               AND s.statement_code = CASE WHEN left(v.no, 1) IN ('1','2','3') THEN 'BS' ELSE 'IS' END
             ORDER BY s.effective_from DESC LIMIT 1) sl ON true
      LEFT JOIN rpt.cash_flow_category cf ON cf.code = v.cf
    ON CONFLICT (company_id, no) DO NOTHING
    RETURNING no, account_type, income_balance, account_subcategory_id, statement_line_id, cash_flow_category_id,
              gen_prod_posting_group_id, vat_prod_posting_group_id)
    SELECT count(*),
           string_agg(no, ', ' ORDER BY no) FILTER (
               WHERE account_type = 'POSTING'
                 AND (account_subcategory_id IS NULL OR statement_line_id IS NULL OR cash_flow_category_id IS NULL
                      OR (income_balance = 'INCOME_STATEMENT'
                          AND (gen_prod_posting_group_id IS NULL OR vat_prod_posting_group_id IS NULL))))
      INTO n, v_unmapped
      FROM ins;
    v_rows := v_rows + n;
    -- Fail loudly instead of provisioning an unmapped account: a later call never repairs an existing row
    -- (inserts missing rows only). Cause: global catalogs (mn_00_catalogs.sql) not loaded, or the VAT / Gen.
    -- posting groups not seeded first (platform.fn_provision_company_mn does it in the right order).
    IF v_unmapped IS NOT NULL THEN
        RAISE EXCEPTION 'chart of accounts seed: accounts % lack a Form A line, МГТ category, subcategory or default posting groups', v_unmapped
            USING ERRCODE = '55000',
                  HINT = 'load db/seed/mn_00_catalogs.sql and run tax.fn_mn_seed_vat_groups() and party.fn_mn_seed_gen_posting_groups() first';
    END IF;

    RETURN v_rows;
END $$;
COMMENT ON FUNCTION gl.fn_mn_seed_chart_of_accounts() IS
    'MN localization package: proposed 4-digit chart of accounts (not an official MoF chart) with account categories, Form A line and МГТ category per posting account, for the current company. Inserts missing rows only; returns the number of rows inserted.';
GRANT EXECUTE ON FUNCTION gl.fn_mn_seed_chart_of_accounts() TO app_user;
