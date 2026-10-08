-- =============================================================================
-- seed/mn_50_reports.sql - MN localization package, part 5: report definitions.
--
--   * rpt.fn_mn_seed_financial_reports  Form A СБТ (SBT), ОДТ (ODT), ӨӨТ (OOT), МГТ direct method (MGT) and a
--                                       trial balance (TB): row definitions, column definitions, financial reports
--   * tax.fn_mn_seed_vat_statement      VAT statement template VAT / name TT03A (ТТ-03а data, D-E8)
--   * rpt.fn_mn_seed_aging              default aging bucket set (D-F7: by due date 0-30 / 31-60 / 61-90 / 90+)
--
-- Report engine semantics (BC account schedules, research/bc-periods-reporting.md R-30..R-38, R-45):
--   totaling_type POSTING_ACCOUNTS: BC filter on gl_account.no ("1100..1198|1300"); STATEMENT_LINE / CASH_FLOW_CATEGORY:
--   '|'-separated codes; FORMULA: row numbers with + - (operands are raw signed values, R-36); a row with an empty
--   totaling is a heading. show_opposite_sign flips the display only. Balance-sheet rows are BALANCE_AT_DATE; the
--   retained-earnings row 2.2.7 also totals every income-statement account (R-45), so Assets = Liabilities + Equity
--   before and after the year-end close. Every leaf row carries the Form A line (statement_line_id) it exports to;
--   seed_checks.sql verifies that the accounts matched by each leaf row's filter are exactly the accounts mapped to
--   that line.
--   МГТ rows total cash/bank entries by the cash-flow category of the counter-account (inflow +, outflow -);
--   category NON_CASH ends up on the "ангилаагүй" row, which must be 0 before filing (FR-RPT-011).
-- Form A line numbering is unverified (rpt.statement_line.verified = false, mn-accounting.md §3.3).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE OR REPLACE FUNCTION rpt.fn_mn_seed_financial_reports() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO rpt.fin_report_row_definition (tenant_id, company_id, code, description, is_system)
    SELECT v_tenant, v_company, v.code, v.descr, true
      FROM (VALUES ('SBT', 'Санхүүгийн байдлын тайлан (СБТ, Маягт А)'),
                   ('ODT', 'Орлогын дэлгэрэнгүй тайлан (ОДТ, Маягт А)'),
                   ('OOT', 'Өмчийн өөрчлөлтийн тайлан (ӨӨТ, Маягт А)'),
                   ('MGT', 'Мөнгөн гүйлгээний тайлан (МГТ, шууд арга, Маягт А)'),
                   ('TB',  'Гүйлгээ баланс (дансны ангиар)')) AS v(code, descr)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- -------------------------------------------------------------------------
    -- Rows. t: H heading, P posting accounts, F formula, C cash-flow categories; rt: B balance at date,
    -- N net change, G beginning balance; sh: Y always, Z if any column not zero, N never; opp = show opposite sign
    -- -------------------------------------------------------------------------
    INSERT INTO rpt.fin_report_row (tenant_id, company_id, row_definition_id, line_no, row_no, description, description_en,
                                    totaling_type, totaling, row_type, show, show_opposite_sign, bold, double_underline,
                                    indentation, statement_line_id, rounding_anchor)
    SELECT v_tenant, v_company, d.id, v.line_no, v.row_no, v.descr, v.descr_en,
           CASE v.t WHEN 'F' THEN 'FORMULA' WHEN 'C' THEN 'CASH_FLOW_CATEGORY' ELSE 'POSTING_ACCOUNTS' END,
           v.totaling,
           CASE v.rt WHEN 'B' THEN 'BALANCE_AT_DATE' WHEN 'G' THEN 'BEGINNING_BALANCE' ELSE 'NET_CHANGE' END,
           CASE v.sh WHEN 'Z' THEN 'IF_ANY_COLUMN_NOT_ZERO' WHEN 'N' THEN 'NO' ELSE 'YES' END,
           v.opp, v.t IN ('H','F'), coalesce((v.def, v.row_no) IN (('SBT','1.3'), ('SBT','2.3'), ('ODT','22'), ('ODT','24'), ('MGT','7')), false), v.ind, sl.id,
           -- 10 SCR-RPT-06: rows whose rounded value is forced to the rounded components (totals, roll-forward closings)
           coalesce((v.def, v.row_no) IN (('SBT','1.3'), ('SBT','2.3'), ('ODT','22'), ('ODT','24'), ('MGT','5'), ('MGT','7'))
                    OR (v.def = 'OOT' AND v.row_no LIKE '%.9'), false)
      FROM (VALUES
        -- ===== СБТ (SBT) =====
        ('SBT', 10,  NULL,       'ХӨРӨНГӨ',                                               'ASSETS',                              'H', NULL,                          'B','Y',false,0,NULL,NULL),
        ('SBT', 20,  NULL,       'Эргэлтийн хөрөнгө',                                     'Current assets',                      'H', NULL,                          'B','Y',false,1,NULL,NULL),
        ('SBT', 30,  '1.1.1',    'Мөнгө, түүнтэй адилтгах хөрөнгө',                       'Cash and cash equivalents',           'P', '1100..1198',                  'B','Y',false,2,'BS','1.1.1'),
        ('SBT', 40,  '1.1.2',    'Дансны авлага',                                         'Trade receivables',                   'P', '1200..1298',                  'B','Y',false,2,'BS','1.1.2'),
        ('SBT', 50,  '1.1.3',    'Татвар, НДШ-ийн авлага',                                'Tax and social insurance receivables','P', '1300..1349',                  'B','Y',false,2,'BS','1.1.3'),
        ('SBT', 60,  '1.1.4',    'Бусад авлага',                                          'Other receivables',                   'P', '1350..1369',                  'B','Y',false,2,'BS','1.1.4'),
        ('SBT', 70,  '1.1.5',    'Бусад санхүүгийн хөрөнгө',                              'Other financial assets',              'P', '1370..1398',                  'B','Y',false,2,'BS','1.1.5'),
        ('SBT', 80,  '1.1.6',    'Бараа материал',                                        'Inventories',                         'P', '1400..1498',                  'B','Y',false,2,'BS','1.1.6'),
        ('SBT', 90,  '1.1.7',    'Урьдчилж төлсөн зардал/тооцоо',                         'Prepaid expenses and advances',       'P', '1500..1579',                  'B','Y',false,2,'BS','1.1.7'),
        ('SBT', 100, '1.1.8',    'Бусад эргэлтийн хөрөнгө',                               'Other current assets',                'P', '1580..1589',                  'B','Y',false,2,'BS','1.1.8'),
        ('SBT', 110, '1.1.9',    'Борлуулах зорилгоор эзэмшиж буй эргэлтийн бус хөрөнгө', 'Non-current assets held for sale',    'P', '1590..1597',                  'B','Z',false,2,'BS','1.1.9'),
        ('SBT', 120, '1.1',      'Эргэлтийн хөрөнгийн дүн',                               'Total current assets',                'F', '1.1.1+1.1.2+1.1.3+1.1.4+1.1.5+1.1.6+1.1.7+1.1.8+1.1.9', 'B','Y',false,1,'BS','1.1'),
        ('SBT', 130, NULL,       'Эргэлтийн бус хөрөнгө',                                 'Non-current assets',                  'H', NULL,                          'B','Y',false,1,NULL,NULL),
        ('SBT', 140, '1.2.1',    'Үндсэн хөрөнгө',                                        'Property, plant and equipment',       'P', '1600..1698',                  'B','Y',false,2,'BS','1.2.1'),
        ('SBT', 150, '1.2.2',    'Биет бус хөрөнгө',                                      'Intangible assets',                   'P', '1700..1798',                  'B','Y',false,2,'BS','1.2.2'),
        ('SBT', 160, '1.2.3',    'Биологийн хөрөнгө',                                     'Biological assets',                   'P', '1820..1829',                  'B','Z',false,2,'BS','1.2.3'),
        ('SBT', 170, '1.2.4',    'Урт хугацаат хөрөнгө оруулалт',                         'Long-term investments',               'P', '1800..1809',                  'B','Y',false,2,'BS','1.2.4'),
        ('SBT', 180, '1.2.5',    'Хайгуул ба үнэлгээний хөрөнгө',                         'Exploration and evaluation assets',   'P', '1830..1839',                  'B','Z',false,2,'BS','1.2.5'),
        ('SBT', 190, '1.2.6',    'Хойшлогдсон татварын хөрөнгө',                          'Deferred tax assets',                 'P', '1850..1859',                  'B','Y',false,2,'BS','1.2.6'),
        ('SBT', 200, '1.2.7',    'Хөрөнгө оруулалтын зориулалттай үл хөдлөх хөрөнгө',     'Investment property',                 'P', '1810..1819',                  'B','Y',false,2,'BS','1.2.7'),
        ('SBT', 210, '1.2.8',    'Бусад эргэлтийн бус хөрөнгө',                           'Other non-current assets',            'P', '1840..1849|1860..1997',       'B','Y',false,2,'BS','1.2.8'),
        ('SBT', 220, '1.2',      'Эргэлтийн бус хөрөнгийн дүн',                           'Total non-current assets',            'F', '1.2.1+1.2.2+1.2.3+1.2.4+1.2.5+1.2.6+1.2.7+1.2.8', 'B','Y',false,1,'BS','1.2'),
        ('SBT', 230, '1.3',      'НИЙТ ХӨРӨНГӨ',                                          'TOTAL ASSETS',                        'F', '1.1+1.2',                     'B','Y',false,0,'BS','1.3'),
        ('SBT', 240, NULL,       'ӨР ТӨЛБӨР БА ЭЗДИЙН ӨМЧ',                               'LIABILITIES AND EQUITY',              'H', NULL,                          'B','Y',true, 0,NULL,NULL),
        ('SBT', 250, NULL,       'Богино хугацаат өр төлбөр',                             'Current liabilities',                 'H', NULL,                          'B','Y',true, 1,NULL,NULL),
        ('SBT', 260, '2.1.1.1',  'Дансны өглөг',                                          'Trade payables',                      'P', '2100..2198',                  'B','Y',true, 2,'BS','2.1.1.1'),
        ('SBT', 270, '2.1.1.2',  'Цалингийн өглөг',                                       'Wages payable',                       'P', '2200..2298',                  'B','Y',true, 2,'BS','2.1.1.2'),
        ('SBT', 280, '2.1.1.3',  'Татварын өр',                                           'Taxes payable',                       'P', '2300..2349|2360..2398',       'B','Y',true, 2,'BS','2.1.1.3'),
        ('SBT', 290, '2.1.1.4',  'НДШ-ийн өглөг',                                         'Social insurance payable',            'P', '2350..2359',                  'B','Y',true, 2,'BS','2.1.1.4'),
        ('SBT', 300, '2.1.1.5',  'Богино хугацаат зээл',                                  'Short-term borrowings',               'P', '2400..2449',                  'B','Y',true, 2,'BS','2.1.1.5'),
        ('SBT', 310, '2.1.1.6',  'Хүүний өглөг',                                          'Interest payable',                    'P', '2450..2459',                  'B','Y',true, 2,'BS','2.1.1.6'),
        ('SBT', 320, '2.1.1.7',  'Ногдол ашгийн өглөг',                                   'Dividends payable',                   'P', '2460..2498',                  'B','Y',true, 2,'BS','2.1.1.7'),
        ('SBT', 330, '2.1.1.8',  'Урьдчилж орсон орлого',                                 'Deferred income and advances',        'P', '2500..2599',                  'B','Y',true, 2,'BS','2.1.1.8'),
        ('SBT', 340, '2.1.1.9',  'Нөөц (өр төлбөр)',                                      'Provisions',                          'P', '2600..2649',                  'B','Y',true, 2,'BS','2.1.1.9'),
        ('SBT', 350, '2.1.1.10', 'Бусад богино хугацаат өр төлбөр',                       'Other current liabilities',           'P', '2650..2697',                  'B','Y',true, 2,'BS','2.1.1.10'),
        ('SBT', 360, '2.1.1',    'Богино хугацаат өр төлбөрийн дүн',                      'Total current liabilities',           'F', '2.1.1.1+2.1.1.2+2.1.1.3+2.1.1.4+2.1.1.5+2.1.1.6+2.1.1.7+2.1.1.8+2.1.1.9+2.1.1.10', 'B','Y',true,1,'BS','2.1.1'),
        ('SBT', 370, NULL,       'Урт хугацаат өр төлбөр',                                'Non-current liabilities',             'H', NULL,                          'B','Y',true, 1,NULL,NULL),
        ('SBT', 380, '2.1.2.1',  'Урт хугацаат зээл',                                     'Long-term borrowings',                'P', '2700..2749',                  'B','Y',true, 2,'BS','2.1.2.1'),
        ('SBT', 390, '2.1.2.2',  'Хойшлогдсон татварын өр',                               'Deferred tax liabilities',            'P', '2750..2759',                  'B','Y',true, 2,'BS','2.1.2.2'),
        ('SBT', 400, '2.1.2.3',  'Бусад урт хугацаат өр төлбөр',                          'Other non-current liabilities',       'P', '2760..2997',                  'B','Y',true, 2,'BS','2.1.2.3'),
        ('SBT', 410, '2.1.2',    'Урт хугацаат өр төлбөрийн дүн',                         'Total non-current liabilities',       'F', '2.1.2.1+2.1.2.2+2.1.2.3',     'B','Y',true, 1,'BS','2.1.2'),
        ('SBT', 420, '2.1',      'Өр төлбөрийн дүн',                                      'Total liabilities',                   'F', '2.1.1+2.1.2',                 'B','Y',true, 1,'BS','2.1'),
        ('SBT', 430, NULL,       'Эздийн өмч',                                            'Equity',                              'H', NULL,                          'B','Y',true, 1,NULL,NULL),
        ('SBT', 440, '2.2.1',    'Өмч',                                                   'Share capital',                       'P', '3100..3149',                  'B','Y',true, 2,'BS','2.2.1'),
        ('SBT', 450, '2.2.2',    'Халаасны хувьцаа',                                      'Treasury shares',                     'P', '3150..3199',                  'B','Z',true, 2,'BS','2.2.2'),
        ('SBT', 460, '2.2.3',    'Нэмж төлөгдсөн капитал',                                'Share premium',                       'P', '3200..3299',                  'B','Y',true, 2,'BS','2.2.3'),
        ('SBT', 470, '2.2.4',    'Хөрөнгийн дахин үнэлгээний нэмэгдэл',                   'Revaluation surplus',                 'P', '3300..3349',                  'B','Y',true, 2,'BS','2.2.4'),
        ('SBT', 480, '2.2.5',    'Гадаад валютын хөрвүүлэлтийн нөөц',                     'Foreign currency translation reserve','P', '3350..3359',                  'B','Z',true, 2,'BS','2.2.5'),
        ('SBT', 490, '2.2.6',    'Эздийн өмчийн бусад хэсэг',                             'Other components of equity',          'P', '3360..3399',                  'B','Y',true, 2,'BS','2.2.6'),
        ('SBT', 500, '2.2.7',    'Хуримтлагдсан ашиг',                                    'Retained earnings',                   'P', '3400..3998|5000..9998',       'B','Y',true, 2,'BS','2.2.7'),
        ('SBT', 510, '2.2',      'Эздийн өмчийн дүн',                                     'Total equity',                        'F', '2.2.1+2.2.2+2.2.3+2.2.4+2.2.5+2.2.6+2.2.7', 'B','Y',true,1,'BS','2.2'),
        ('SBT', 520, '2.3',      'НИЙТ ӨР ТӨЛБӨР БА ЭЗДИЙН ӨМЧ',                          'TOTAL LIABILITIES AND EQUITY',        'F', '2.1+2.2',                     'B','Y',true, 0,'BS','2.3'),
        ('SBT', 530, 'CHK',      'Шалгалт: хөрөнгө - (өр төлбөр + өмч) = 0',             'Check: assets - (liabilities + equity) = 0', 'F', '1.3+2.3',           'B','Z',false,0,NULL,NULL),
        -- ===== ОДТ (ODT) =====
        ('ODT', 10,  '1',    'Борлуулалтын орлого (цэвэр)',                                'Revenue (net)',                          'P', '5000..5999',  'N','Y',true, 0,'IS','1'),
        ('ODT', 20,  '2',    'Борлуулалтын өртөг',                                         'Cost of sales',                          'P', '6000..6999',  'N','Y',false,0,'IS','2'),
        ('ODT', 30,  '3',    'Нийт ашиг (алдагдал)',                                       'Gross profit (loss)',                    'F', '1+2',         'N','Y',true, 0,'IS','3'),
        ('ODT', 40,  '4',    'Түрээсийн орлого',                                           'Rental income',                          'P', '8100..8109',  'N','Y',true, 1,'IS','4'),
        ('ODT', 50,  '5',    'Хүүний орлого',                                              'Interest income',                        'P', '8110..8119',  'N','Y',true, 1,'IS','5'),
        ('ODT', 60,  '6',    'Ногдол ашгийн орлого',                                       'Dividend income',                        'P', '8120..8129',  'N','Y',true, 1,'IS','6'),
        ('ODT', 70,  '7',    'Эрхийн шимтгэлийн орлого',                                   'Royalty income',                         'P', '8130..8198',  'N','Y',true, 1,'IS','7'),
        ('ODT', 80,  '8',    'Бусад орлого',                                               'Other income',                           'P', '8200..8298',  'N','Y',true, 1,'IS','8'),
        ('ODT', 90,  '9',    'Борлуулалт, маркетингийн зардал',                            'Selling and marketing expenses',         'P', '7000..7198',  'N','Y',false,1,'IS','9'),
        ('ODT', 100, '10',   'Ерөнхий ба удирдлагын зардал',                               'General and administrative expenses',    'P', '7199..7999',  'N','Y',false,1,'IS','10'),
        ('ODT', 110, '11',   'Санхүүгийн зардал',                                          'Finance costs',                          'P', '8300..8398',  'N','Y',false,1,'IS','11'),
        ('ODT', 120, '12',   'Бусад зардал',                                               'Other expenses',                         'P', '8400..8498',  'N','Y',false,1,'IS','12'),
        ('ODT', 130, '13',   'Гадаад валютын ханшийн зөрүүний олз (гарз)',                 'Foreign exchange gain (loss)',           'P', '8500..8598',  'N','Y',true, 1,'IS','13'),
        ('ODT', 140, '14',   'Үндсэн хөрөнгө данснаас хассаны олз (гарз)',                 'Gain (loss) on disposal of PPE',         'P', '8600..8609',  'N','Y',true, 1,'IS','14'),
        ('ODT', 150, '15',   'Биет бус хөрөнгө данснаас хассаны олз (гарз)',               'Gain (loss) on disposal of intangibles', 'P', '8610..8619',  'N','Y',true, 1,'IS','15'),
        ('ODT', 160, '16',   'Хөрөнгө оруулалт борлуулсны олз (гарз)',                     'Gain (loss) on sale of investments',     'P', '8620..8689',  'N','Y',true, 1,'IS','16'),
        ('ODT', 170, '17',   'Бусад ашиг (алдагдал)',                                      'Other gains (losses)',                   'P', '8690..8998',  'N','Y',true, 1,'IS','17'),
        ('ODT', 180, '18',   'Татвар төлөхийн өмнөх ашиг (алдагдал)',                      'Profit (loss) before tax',               'F', '3+4+5+6+7+8+9+10+11+12+13+14+15+16+17', 'N','Y',true,0,'IS','18'),
        ('ODT', 190, '19',   'Орлогын татварын зардал',                                    'Income tax expense',                     'P', '9100..9199',  'N','Y',false,1,'IS','19'),
        ('ODT', 200, '20',   'Татварын дараах ашиг (алдагдал)',                            'Profit (loss) after tax',                'F', '18+19',       'N','Y',true, 0,'IS','20'),
        ('ODT', 210, '21',   'Зогсоосон үйл ажиллагааны татварын дараах ашиг (алдагдал)',  'Discontinued operations',                'P', '9200..9998',  'N','Y',true, 1,'IS','21'),
        ('ODT', 220, '22',   'Тайлант үеийн цэвэр ашиг (алдагдал)',                        'Net profit (loss) for the period',       'F', '20+21',       'N','Y',true, 0,'IS','22'),
        ('ODT', 230, '23.1', 'Хөрөнгийн дахин үнэлгээний нэмэгдлийн өсөлт (бууралт)',      'Change in revaluation surplus',          'P', '3300..3349',  'N','Y',true, 2,'IS','23.1'),
        ('ODT', 240, '23.2', 'Гадаад валютын хөрвүүлэлтийн тэгшитгэлийн өсөлт (бууралт)',  'Foreign currency translation',           'P', '3350..3359',  'N','Z',true, 2,'IS','23.2'),
        ('ODT', 250, '23',   'Бусад дэлгэрэнгүй орлого',                                   'Other comprehensive income',             'F', '23.1+23.2',   'N','Y',true, 1,'IS','23'),
        ('ODT', 260, '24',   'Нийт дэлгэрэнгүй орлого',                                    'Total comprehensive income',             'F', '22+23',       'N','Y',true, 0,'IS','24'),
        -- ===== ӨӨТ (OOT): per equity component (= СБТ 2.2.x column): opening, movements, closing =====
        ('OOT', 100, NULL,    'Өмч (2.2.1)',                                    'Share capital',                 'H', NULL,                     'N','Y',true,0,NULL,NULL),
        ('OOT', 110, 'CAP.1', 'Эхний үлдэгдэл',                                 'Opening balance',               'P', '3100..3149',             'G','Y',true,1,'EQ','1'),
        ('OOT', 120, 'CAP.6', 'Өмчид гарсан өөрчлөлт',                          'Changes in contributed equity', 'P', '3100..3149',             'N','Y',true,1,'EQ','6'),
        ('OOT', 130, 'CAP.9', 'Эцсийн үлдэгдэл',                                'Closing balance',               'P', '3100..3149',             'B','Y',true,1,'EQ','9'),
        ('OOT', 200, NULL,    'Халаасны хувьцаа (2.2.2)',                       'Treasury shares',               'H', NULL,                     'N','Z',true,0,NULL,NULL),
        ('OOT', 210, 'TRS.1', 'Эхний үлдэгдэл',                                 'Opening balance',               'P', '3150..3199',             'G','Z',true,1,'EQ','1'),
        ('OOT', 220, 'TRS.6', 'Өмчид гарсан өөрчлөлт',                          'Changes in contributed equity', 'P', '3150..3199',             'N','Z',true,1,'EQ','6'),
        ('OOT', 230, 'TRS.9', 'Эцсийн үлдэгдэл',                                'Closing balance',               'P', '3150..3199',             'B','Z',true,1,'EQ','9'),
        ('OOT', 300, NULL,    'Нэмж төлөгдсөн капитал (2.2.3)',                 'Share premium',                 'H', NULL,                     'N','Y',true,0,NULL,NULL),
        ('OOT', 310, 'APIC.1','Эхний үлдэгдэл',                                 'Opening balance',               'P', '3200..3299',             'G','Y',true,1,'EQ','1'),
        ('OOT', 320, 'APIC.6','Өмчид гарсан өөрчлөлт',                          'Changes in contributed equity', 'P', '3200..3299',             'N','Y',true,1,'EQ','6'),
        ('OOT', 330, 'APIC.9','Эцсийн үлдэгдэл',                                'Closing balance',               'P', '3200..3299',             'B','Y',true,1,'EQ','9'),
        ('OOT', 400, NULL,    'Хөрөнгийн дахин үнэлгээний нэмэгдэл (2.2.4)',    'Revaluation surplus',           'H', NULL,                     'N','Y',true,0,NULL,NULL),
        ('OOT', 410, 'REV.1', 'Эхний үлдэгдэл',                                 'Opening balance',               'P', '3300..3349',             'G','Y',true,1,'EQ','1'),
        ('OOT', 420, 'REV.5', 'Бусад дэлгэрэнгүй орлого (дахин үнэлгээ)',       'Other comprehensive income',    'P', '3300..3349',             'N','Y',true,1,'EQ','5'),
        ('OOT', 430, 'REV.9', 'Эцсийн үлдэгдэл',                                'Closing balance',               'P', '3300..3349',             'B','Y',true,1,'EQ','9'),
        ('OOT', 500, NULL,    'Гадаад валютын хөрвүүлэлтийн нөөц (2.2.5)',      'Translation reserve',           'H', NULL,                     'N','Z',true,0,NULL,NULL),
        ('OOT', 510, 'FXR.1', 'Эхний үлдэгдэл',                                 'Opening balance',               'P', '3350..3359',             'G','Z',true,1,'EQ','1'),
        ('OOT', 520, 'FXR.5', 'Бусад дэлгэрэнгүй орлого (хөрвүүлэлт)',          'Other comprehensive income',    'P', '3350..3359',             'N','Z',true,1,'EQ','5'),
        ('OOT', 530, 'FXR.9', 'Эцсийн үлдэгдэл',                                'Closing balance',               'P', '3350..3359',             'B','Z',true,1,'EQ','9'),
        ('OOT', 600, NULL,    'Эздийн өмчийн бусад хэсэг (2.2.6)',              'Other components of equity',    'H', NULL,                     'N','Y',true,0,NULL,NULL),
        ('OOT', 610, 'OTH.1', 'Эхний үлдэгдэл',                                 'Opening balance',               'P', '3360..3399',             'G','Y',true,1,'EQ','1'),
        ('OOT', 620, 'OTH.6', 'Өмчид гарсан өөрчлөлт',                          'Changes in equity',             'P', '3360..3399',             'N','Y',true,1,'EQ','6'),
        ('OOT', 630, 'OTH.9', 'Эцсийн үлдэгдэл',                                'Closing balance',               'P', '3360..3399',             'B','Y',true,1,'EQ','9'),
        ('OOT', 700, NULL,    'Хуримтлагдсан ашиг (2.2.7)',                     'Retained earnings',             'H', NULL,                     'N','Y',true,0,NULL,NULL),
        ('OOT', 710, 'RE.1',  'Эхний үлдэгдэл',                                 'Opening balance',               'P', '3400..3998|5000..9998',  'G','Y',true,1,'EQ','1'),
        ('OOT', 720, 'RE.2',  'НББ бодлогын өөрчлөлт, алдааны залруулга',       'Policy changes and corrections','P', '3400..3409|3500..3998',  'N','Y',true,1,'EQ','2'),
        ('OOT', 730, 'RE.4',  'Тайлант үеийн цэвэр ашиг (алдагдал)',            'Net profit (loss)',             'P', '5000..9998',             'N','Y',true,1,'EQ','4'),
        ('OOT', 740, 'RE.7',  'Зарласан ногдол ашиг',                           'Dividends declared',            'P', '3410..3499',             'N','Y',true,1,'EQ','7'),
        ('OOT', 750, 'RE.9',  'Эцсийн үлдэгдэл',                                'Closing balance',               'P', '3400..3998|5000..9998',  'B','Y',true,1,'EQ','9'),
        ('OOT', 800, NULL,    'НИЙТ ЭЗДИЙН ӨМЧ',                                'TOTAL EQUITY',                  'H', NULL,                     'N','Y',true,0,NULL,NULL),
        ('OOT', 810, 'T.1',   'Эхний үлдэгдэл',                                 'Opening balance',               'F', 'CAP.1+TRS.1+APIC.1+REV.1+FXR.1+OTH.1+RE.1', 'N','Y',true,1,NULL,NULL),
        ('OOT', 820, 'T.2',   'НББ бодлогын өөрчлөлт, алдааны залруулга',       'Policy changes and corrections','F', 'RE.2',                   'N','Y',true,1,NULL,NULL),
        ('OOT', 830, 'T.4',   'Тайлант үеийн цэвэр ашиг (алдагдал)',            'Net profit (loss)',             'F', 'RE.4',                   'N','Y',true,1,NULL,NULL),
        ('OOT', 840, 'T.5',   'Бусад дэлгэрэнгүй орлого',                       'Other comprehensive income',    'F', 'REV.5+FXR.5',            'N','Y',true,1,NULL,NULL),
        ('OOT', 850, 'T.6',   'Өмчид гарсан өөрчлөлт',                          'Changes in contributed equity', 'F', 'CAP.6+TRS.6+APIC.6+OTH.6','N','Y',true,1,NULL,NULL),
        ('OOT', 860, 'T.7',   'Зарласан ногдол ашиг',                           'Dividends declared',            'F', 'RE.7',                   'N','Y',true,1,NULL,NULL),
        ('OOT', 870, 'T.9',   'Эцсийн үлдэгдэл (= СБТ 2.2)',                    'Closing balance (= BS 2.2)',    'F', 'CAP.9+TRS.9+APIC.9+REV.9+FXR.9+OTH.9+RE.9', 'N','Y',true,1,NULL,NULL),
        ('OOT', 880, 'T.CHK', 'Шалгалт: эхний + хөдөлгөөн - эцсийн = 0',        'Check: roll-forward = 0',       'F', 'T.1+T.2+T.4+T.5+T.6+T.7-T.9', 'N','Z',false,1,NULL,NULL),
        -- ===== МГТ (MGT), direct method =====
        ('MGT', 10,  NULL,    'Үндсэн үйл ажиллагааны мөнгөн гүйлгээ',                    'Operating activities',            'H', NULL,                    'N','Y',false,0,NULL,NULL),
        ('MGT', 20,  '1.1.1', 'Бараа борлуулах, үйлчилгээ үзүүлсний орлого',              'Receipts from customers',         'C', 'OP_CUST_RECEIPTS',      'N','Y',false,2,'CF','1.1.1'),
        ('MGT', 30,  '1.1.2', 'Эрхийн шимтгэл, хураамж, төлбөрийн орлого',                'Royalties and fees received',     'C', 'OP_ROYALTY_RECEIPTS',   'N','Y',false,2,'CF','1.1.2'),
        ('MGT', 40,  '1.1.3', 'Даатгалын нөхвөрөөс хүлээн авсан мөнгө',                   'Insurance claims received',       'C', 'OP_INSURANCE_CLAIMS',   'N','Y',false,2,'CF','1.1.3'),
        ('MGT', 50,  '1.1.4', 'Буцаан авсан албан татвар',                                'Tax refunds received',            'C', 'OP_TAX_REFUNDS',        'N','Y',false,2,'CF','1.1.4'),
        ('MGT', 60,  '1.1.5', 'Татаас, санхүүжилтийн орлого',                             'Grants received',                 'C', 'OP_GRANTS',             'N','Y',false,2,'CF','1.1.5'),
        ('MGT', 70,  '1.1.6', 'Бусад мөнгөн орлого',                                      'Other receipts',                  'C', 'OP_OTHER_RECEIPTS',     'N','Y',false,2,'CF','1.1.6'),
        ('MGT', 80,  '1.1',   'Мөнгөн орлогын дүн (+)',                                   'Total receipts',                  'F', '1.1.1+1.1.2+1.1.3+1.1.4+1.1.5+1.1.6', 'N','Y',false,1,'CF','1.1'),
        ('MGT', 90,  '1.2.1', 'Ажиллагчдад төлсөн',                                       'Paid to employees',               'C', 'OP_EMPLOYEES',          'N','Y',false,2,'CF','1.2.1'),
        ('MGT', 100, '1.2.2', 'Нийгмийн даатгалын байгууллагад төлсөн',                   'Paid to social insurance',        'C', 'OP_SOCIAL_INSURANCE',   'N','Y',false,2,'CF','1.2.2'),
        ('MGT', 110, '1.2.3', 'Бараа материал худалдан авахад төлсөн',                    'Paid to suppliers',               'C', 'OP_SUPPLIERS',          'N','Y',false,2,'CF','1.2.3'),
        ('MGT', 120, '1.2.4', 'Ашиглалтын зардалд төлсөн',                                'Paid for operating expenses',     'C', 'OP_OPERATING_EXP',      'N','Y',false,2,'CF','1.2.4'),
        ('MGT', 130, '1.2.5', 'Түлш, шатахуун, тээврийн хөлс, сэлбэг хэрэгсэлд төлсөн',   'Paid for fuel and transport',     'C', 'OP_FUEL_TRANSPORT',     'N','Y',false,2,'CF','1.2.5'),
        ('MGT', 140, '1.2.6', 'Хүүний төлбөрт төлсөн',                                    'Interest paid',                   'C', 'OP_INTEREST_PAID',      'N','Y',false,2,'CF','1.2.6'),
        ('MGT', 150, '1.2.7', 'Татварын байгууллагад төлсөн',                             'Taxes paid',                      'C', 'OP_TAXES_PAID',         'N','Y',false,2,'CF','1.2.7'),
        ('MGT', 160, '1.2.8', 'Даатгалын төлбөрт төлсөн',                                 'Insurance paid',                  'C', 'OP_INSURANCE_PAID',     'N','Y',false,2,'CF','1.2.8'),
        ('MGT', 170, '1.2.9', 'Бусад мөнгөн зарлага',                                     'Other payments',                  'C', 'OP_OTHER_PAYMENTS',     'N','Y',false,2,'CF','1.2.9'),
        ('MGT', 180, '1.2',   'Мөнгөн зарлагын дүн (-)',                                  'Total payments',                  'F', '1.2.1+1.2.2+1.2.3+1.2.4+1.2.5+1.2.6+1.2.7+1.2.8+1.2.9', 'N','Y',false,1,'CF','1.2'),
        ('MGT', 190, '1',     'Үндсэн үйл ажиллагааны цэвэр мөнгөн гүйлгээний дүн',       'Net cash from operating',         'F', '1.1+1.2',               'N','Y',false,0,'CF','1'),
        ('MGT', 200, NULL,    'Хөрөнгө оруулалтын үйл ажиллагааны мөнгөн гүйлгээ',        'Investing activities',            'H', NULL,                    'N','Y',false,0,NULL,NULL),
        ('MGT', 210, '2.1.1', 'Үндсэн хөрөнгө борлуулсны орлого',                         'Sale of PPE',                     'C', 'INV_FA_SALE',           'N','Y',false,2,'CF','2.1.1'),
        ('MGT', 220, '2.1.2', 'Биет бус хөрөнгө борлуулсны орлого',                       'Sale of intangibles',             'C', 'INV_INTANGIBLE_SALE',   'N','Y',false,2,'CF','2.1.2'),
        ('MGT', 230, '2.1.3', 'Хөрөнгө оруулалт борлуулсны орлого',                       'Sale of investments',             'C', 'INV_INVESTMENT_SALE',   'N','Y',false,2,'CF','2.1.3'),
        ('MGT', 240, '2.1.4', 'Бусад урт хугацаат хөрөнгө борлуулсны орлого',             'Sale of other long-term assets',  'C', 'INV_OTHER_LT_SALE',     'N','Y',false,2,'CF','2.1.4'),
        ('MGT', 250, '2.1.5', 'Бусдад олгосон зээл, урьдчилгааны буцаан төлөлт',          'Repayment of loans granted',      'C', 'INV_LOANS_REPAID',      'N','Y',false,2,'CF','2.1.5'),
        ('MGT', 260, '2.1.6', 'Хүлээн авсан хүүний орлого',                               'Interest received',               'C', 'INV_INTEREST_RCVD',     'N','Y',false,2,'CF','2.1.6'),
        ('MGT', 270, '2.1.7', 'Хүлээн авсан ногдол ашиг',                                 'Dividends received',              'C', 'INV_DIVIDENDS_RCVD',    'N','Y',false,2,'CF','2.1.7'),
        ('MGT', 280, '2.1',   'Мөнгөн орлогын дүн (+)',                                   'Total investing receipts',        'F', '2.1.1+2.1.2+2.1.3+2.1.4+2.1.5+2.1.6+2.1.7', 'N','Y',false,1,'CF','2.1'),
        ('MGT', 290, '2.2.1', 'Үндсэн хөрөнгө олж эзэмшихэд төлсөн',                      'Purchase of PPE',                 'C', 'INV_FA_BUY',            'N','Y',false,2,'CF','2.2.1'),
        ('MGT', 300, '2.2.2', 'Биет бус хөрөнгө олж эзэмшихэд төлсөн',                    'Purchase of intangibles',         'C', 'INV_INTANGIBLE_BUY',    'N','Y',false,2,'CF','2.2.2'),
        ('MGT', 310, '2.2.3', 'Хөрөнгө оруулалт олж эзэмшихэд төлсөн',                    'Purchase of investments',         'C', 'INV_INVESTMENT_BUY',    'N','Y',false,2,'CF','2.2.3'),
        ('MGT', 320, '2.2.4', 'Бусад урт хугацаат хөрөнгө олж эзэмшихэд төлсөн',          'Purchase of other LT assets',     'C', 'INV_OTHER_LT_BUY',      'N','Y',false,2,'CF','2.2.4'),
        ('MGT', 330, '2.2.5', 'Бусдад олгосон зээл, мөнгөн урьдчилгаа',                   'Loans and advances granted',      'C', 'INV_LOANS_GIVEN',       'N','Y',false,2,'CF','2.2.5'),
        ('MGT', 340, '2.2',   'Мөнгөн зарлагын дүн (-)',                                  'Total investing payments',        'F', '2.2.1+2.2.2+2.2.3+2.2.4+2.2.5', 'N','Y',false,1,'CF','2.2'),
        ('MGT', 350, '2',     'Хөрөнгө оруулалтын үйл ажиллагааны цэвэр мөнгөн гүйлгээний дүн', 'Net cash from investing',  'F', '2.1+2.2',               'N','Y',false,0,'CF','2'),
        ('MGT', 360, NULL,    'Санхүүгийн үйл ажиллагааны мөнгөн гүйлгээ',                'Financing activities',            'H', NULL,                    'N','Y',false,0,NULL,NULL),
        ('MGT', 370, '3.1.1', 'Зээл авсан, өрийн үнэт цаас гаргаснаас хүлээн авсан',      'Proceeds from borrowings',        'C', 'FIN_BORROWINGS',        'N','Y',false,2,'CF','3.1.1'),
        ('MGT', 380, '3.1.2', 'Хувьцаа, өмчийн бусад үнэт цаас гаргаснаас хүлээн авсан',  'Proceeds from share issue',       'C', 'FIN_SHARES_ISSUED',     'N','Y',false,2,'CF','3.1.2'),
        ('MGT', 390, '3.1.3', 'Төрөл бүрийн хандив',                                      'Donations received',              'C', 'FIN_DONATIONS',         'N','Y',false,2,'CF','3.1.3'),
        ('MGT', 400, '3.1.4', 'Санхүүгийн түрээсийн авлагаас хүлээн авсан',               'Finance lease receipts',          'C', 'FIN_LEASE_RECEIPTS',    'N','Y',false,2,'CF','3.1.4'),
        ('MGT', 410, '3.1',   'Мөнгөн орлогын дүн (+)',                                   'Total financing receipts',        'F', '3.1.1+3.1.2+3.1.3+3.1.4', 'N','Y',false,1,'CF','3.1'),
        ('MGT', 420, '3.2.1', 'Зээл, өрийн үнэт цаасны төлбөрт төлсөн',                   'Repayment of borrowings',         'C', 'FIN_LOAN_REPAYMENTS',   'N','Y',false,2,'CF','3.2.1'),
        ('MGT', 430, '3.2.2', 'Санхүүгийн түрээсийн өглөгт төлсөн',                       'Finance lease payments',          'C', 'FIN_LEASE_PAYMENTS',    'N','Y',false,2,'CF','3.2.2'),
        ('MGT', 440, '3.2.3', 'Хувьцаа буцаан худалдан авахад төлсөн',                    'Purchase of own shares',          'C', 'FIN_SHARE_BUYBACK',     'N','Y',false,2,'CF','3.2.3'),
        ('MGT', 450, '3.2.4', 'Төлсөн ногдол ашиг',                                       'Dividends paid',                  'C', 'FIN_DIVIDENDS_PAID',    'N','Y',false,2,'CF','3.2.4'),
        ('MGT', 460, '3.2',   'Мөнгөн зарлагын дүн (-)',                                  'Total financing payments',        'F', '3.2.1+3.2.2+3.2.3+3.2.4', 'N','Y',false,1,'CF','3.2'),
        ('MGT', 470, '3',     'Санхүүгийн үйл ажиллагааны цэвэр мөнгөн гүйлгээний дүн',   'Net cash from financing',         'F', '3.1+3.2',               'N','Y',false,0,'CF','3'),
        ('MGT', 480, '4',     'Валютын ханшийн зөрүүний нөлөө',                           'Effect of exchange rate changes', 'C', 'FX_EFFECT',             'N','Y',false,0,'CF','4'),
        ('MGT', 490, 'X',     'Ангилаагүй мөнгөн гүйлгээ (тайлагнахаас өмнө 0 болгох)',   'Unclassified cash flows (must be 0)', 'C', 'NON_CASH',          'N','Z',false,0,NULL,NULL),
        ('MGT', 500, '5',     'Бүх цэвэр мөнгөн гүйлгээ',                                 'Net change in cash',              'F', '1+2+3+4+X',             'N','Y',false,0,'CF','5'),
        ('MGT', 510, '6',     'Мөнгө, түүнтэй адилтгах хөрөнгийн эхний үлдэгдэл',         'Cash at the beginning',           'P', '1100..1198',            'G','Y',false,0,'CF','6'),
        ('MGT', 520, '7',     'Мөнгө, түүнтэй адилтгах хөрөнгийн эцсийн үлдэгдэл',        'Cash at the end',                 'F', '5+6',                   'N','Y',false,0,'CF','7'),
        ('MGT', 530, 'LEDGER','Мөнгөн хөрөнгийн эцсийн үлдэгдэл (дэвтрээр)',              'Cash at the end per ledger',      'P', '1100..1198',            'B','N',false,0,NULL,NULL),
        ('MGT', 540, 'CHK',   'Шалгалт: МГТ - дэвтэр = 0',                                'Check: cash flow - ledger = 0',   'F', '7-LEDGER',              'N','Z',false,0,NULL,NULL),
        -- ===== Trial balance by account class (account level: rpt.fn_trial_balance) =====
        ('TB', 10, 'K1',    '1 Хөрөнгө',                              'Assets',                       'P', '1000..1999', 'N','Y',false,0,NULL,NULL),
        ('TB', 20, 'K2',    '2 Өр төлбөр',                            'Liabilities',                  'P', '2000..2999', 'N','Y',false,0,NULL,NULL),
        ('TB', 30, 'K3',    '3 Эздийн өмч',                           'Equity',                       'P', '3000..3999', 'N','Y',false,0,NULL,NULL),
        ('TB', 40, 'K5',    '5 Борлуулалтын орлого',                  'Revenue',                      'P', '5000..5999', 'N','Y',false,0,NULL,NULL),
        ('TB', 50, 'K6',    '6 Борлуулалтын өртөг',                   'Cost of sales',                'P', '6000..6999', 'N','Y',false,0,NULL,NULL),
        ('TB', 60, 'K7',    '7 Үйл ажиллагааны зардал',               'Operating expenses',           'P', '7000..7999', 'N','Y',false,0,NULL,NULL),
        ('TB', 70, 'K8',    '8 Бусад орлого, зардал, олз (гарз)',     'Other income and expenses',    'P', '8000..8999', 'N','Y',false,0,NULL,NULL),
        ('TB', 80, 'K9',    '9 Орлогын татвар, зогсоосон үйл ажиллагаа','Income tax, discontinued',   'P', '9000..9999', 'N','Y',false,0,NULL,NULL),
        ('TB', 90, 'TOTAL', 'Нийт (дебит = кредит, үлдэгдэл 0)',      'Total (must net to zero)',     'F', 'K1+K2+K3+K5+K6+K7+K8+K9', 'N','Y',false,0,NULL,NULL)
      ) AS v(def, line_no, row_no, descr, descr_en, t, totaling, rt, sh, opp, ind, st, sl)
      JOIN rpt.fin_report_row_definition d ON d.company_id = v_company AND d.code = v.def
      LEFT JOIN LATERAL (
            SELECT s.id FROM rpt.statement_line s
             WHERE s.form_code = 'A' AND s.statement_code = v.st AND s.line_code = v.sl AND s.effective_to IS NULL
             ORDER BY s.effective_from DESC LIMIT 1) sl ON true
    ON CONFLICT (company_id, row_definition_id, line_no) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- -------------------------------------------------------------------------
    -- Column definitions (BC T333/T334)
    -- -------------------------------------------------------------------------
    INSERT INTO rpt.fin_report_column_definition (tenant_id, company_id, code, description, is_system)
    SELECT v_tenant, v_company, v.code, v.descr, true
      FROM (VALUES ('BS_2Y', 'Оны эхний ба тайлант үеийн эцсийн үлдэгдэл'),
                   ('IS_2Y', 'Өмнөх жил ба тайлант жил'),
                   ('PERIOD','Тайлант үе (нэг багана)'),
                   ('TB_4',  'Эхний үлдэгдэл, дебит, кредит, эцсийн үлдэгдэл')) AS v(code, descr)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO rpt.fin_report_column (tenant_id, company_id, column_definition_id, line_no, column_no, column_header,
                                       column_header_en, column_type, amount_type, comparison_date_formula)
    SELECT v_tenant, v_company, d.id, v.line_no, v.col_no, v.header, v.header_en, v.ctype, v.atype, v.cmp
      FROM (VALUES ('BS_2Y', 10, 'C1', 'Эхний үлдэгдэл',  'Beginning balance', 'BEGINNING_BALANCE', 'NET',    NULL),
                   ('BS_2Y', 20, 'C2', 'Эцсийн үлдэгдэл', 'Ending balance',    'BALANCE_AT_DATE',   'NET',    NULL),
                   ('IS_2Y', 10, 'C1', 'Өмнөх жил',       'Previous year',     'NET_CHANGE',        'NET',    '-1Y'),
                   ('IS_2Y', 20, 'C2', 'Тайлант жил',     'Current year',      'NET_CHANGE',        'NET',    NULL),
                   ('PERIOD',10, 'C1', 'Дүн',             'Amount',            'NET_CHANGE',        'NET',    NULL),
                   ('TB_4',  10, 'C1', 'Эхний үлдэгдэл',  'Opening balance',   'BEGINNING_BALANCE', 'NET',    NULL),
                   ('TB_4',  20, 'C2', 'Дебит гүйлгээ',   'Debit',             'NET_CHANGE',        'DEBIT',  NULL),
                   ('TB_4',  30, 'C3', 'Кредит гүйлгээ',  'Credit',            'NET_CHANGE',        'CREDIT', NULL),
                   ('TB_4',  40, 'C4', 'Эцсийн үлдэгдэл', 'Closing balance',   'BALANCE_AT_DATE',   'NET',    NULL)
           ) AS v(def, line_no, col_no, header, header_en, ctype, atype, cmp)
      JOIN rpt.fin_report_column_definition d ON d.company_id = v_company AND d.code = v.def
    ON CONFLICT (company_id, column_definition_id, line_no) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO rpt.financial_report (tenant_id, company_id, code, name, name_en, report_kind, row_definition_id,
                                      column_definition_id, statement_form_code, is_system)
    SELECT v_tenant, v_company, v.code, v.name, v.name_en, v.kind, r.id, c.id, v.form, true
      FROM (VALUES ('SBT', 'Санхүүгийн байдлын тайлан',   'Statement of financial position', 'BALANCE_SHEET',    'SBT', 'BS_2Y',  'A'),
                   ('ODT', 'Орлогын дэлгэрэнгүй тайлан',   'Statement of comprehensive income','INCOME_STATEMENT', 'ODT', 'IS_2Y',  'A'),
                   ('OOT', 'Өмчийн өөрчлөлтийн тайлан',    'Statement of changes in equity',  'EQUITY',           'OOT', 'PERIOD', 'A'),
                   ('MGT', 'Мөнгөн гүйлгээний тайлан',     'Statement of cash flows (direct)','CASH_FLOW',        'MGT', 'IS_2Y',  'A'),
                   ('TB',  'Гүйлгээ баланс',               'Trial balance',                   'TRIAL_BALANCE',    'TB',  'TB_4',   NULL)
           ) AS v(code, name, name_en, kind, rows, cols, form)
      JOIN rpt.fin_report_row_definition r ON r.company_id = v_company AND r.code = v.rows
      JOIN rpt.fin_report_column_definition c ON c.company_id = v_company AND c.code = v.cols
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION rpt.fn_mn_seed_financial_reports() IS
    'MN localization package: Form A financial report definitions (СБТ, ОДТ, ӨӨТ, МГТ direct method) and a trial balance for the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION rpt.fn_mn_seed_financial_reports() TO app_user;

-- -----------------------------------------------------------------------------
-- VAT statement ТТ-03а (BC T255-257). Signs: VAT entry base/amount are negative for sales and positive for
-- purchases (BC). calculate_with OPPOSITE_SIGN negates a VAT-entry line before it is added to totals; BC does not
-- allow it on a ROW_TOTALING line (R-VAT-27), which only adds the values of its rows. So the sales lines use
-- OPPOSITE_SIGN (value > 0), the deductible-VAT lines 8/9/10 use OPPOSITE_SIGN + print OPPOSITE_SIGN (value < 0,
-- printed > 0), line 12 = 8|9|10 = -(deductible VAT) printed > 0, and line 14 = 2|13|12 = output + reverse charge
-- - deductible. Filters: a NULL VAT Bus./Prod. group means "any group" and vat_category narrows by category
-- (FR-TAX-013 "VAT entry-ийн нийлбэр ангиллаар"); this deviates from BC R-VAT-26, where a blank group matches
-- blank only.
-- box_no: ТТ-03а-6 = sales register, ТТ-03а-5 = purchase register; the line numbering of the current form
-- version is unverified (research/mn-tax.md §2.3). Amount types follow BC T256: AMOUNT/BASE = deductible part,
-- NON_DEDUCTIBLE_* = the rest, FULL_* = both. Confidence (seed/README.md §8): lines 1-8, 12, 14 follow the
-- VAT Law mechanics (structure plausible, numbering ⚠); lines 9 (customs VAT), 10/13 (reverse charge) and 11
-- (information) are ⚠ placements: the box the current form uses for them is not confirmed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tax.fn_mn_seed_vat_statement() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO tax.vat_statement_template (tenant_id, company_id, code, description)
    VALUES (v_tenant, v_company, 'VAT', 'НӨАТ-ын тайлан')
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO tax.vat_statement_name (tenant_id, company_id, vat_statement_template_id, code, description, form_code)
    SELECT v_tenant, v_company, t.id, 'TT03A', 'НӨАТ суутган төлөгчийн сарын тайлан', 'ТТ-03а'
      FROM tax.vat_statement_template t WHERE t.company_id = v_company AND t.code = 'VAT'
    ON CONFLICT (company_id, vat_statement_template_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO tax.vat_statement_line (tenant_id, company_id, vat_statement_name_id, line_no, row_no, description, line_type,
                                        gen_posting_type, vat_bus_posting_group_id, vat_prod_posting_group_id, vat_category,
                                        row_totaling, amount_type, only_deductible_confirmed, calculate_with, print, print_with, box_no)
    SELECT v_tenant, v_company, nm.id, v.line_no, v.row_no, v.descr,
           CASE v.lt WHEN 'D' THEN 'DESCRIPTION' WHEN 'R' THEN 'ROW_TOTALING' ELSE 'VAT_ENTRY_TOTALING' END,
           v.gpt, vb.id, vp.id, v.cat, v.rowtot, v.amt, v.confirmed,
           CASE WHEN v.calc_opp THEN 'OPPOSITE_SIGN' ELSE 'SIGN' END, true,
           CASE WHEN v.print_opp THEN 'OPPOSITE_SIGN' ELSE 'SIGN' END, v.box
      FROM (VALUES
        -- line, row, description,                                                type, gen type,  bus,       prod,            cat,     row totaling, amount type,             confirmed, calc opp, print opp, box
        (10,  'S',  'БОРЛУУЛАЛТ',                                                       'D', NULL,       NULL,      NULL,            NULL,     NULL,       'NONE',                  false, false, false, NULL),
        (20,  '1',  'Татвар ногдох борлуулалт (НӨАТ 10%) - суурь',                      'V', 'SALE',     NULL,      NULL,            'VAT10',  NULL,       'BASE',                  false, true,  false, 'ТТ-03а-6'),
        (30,  '2',  'Борлуулалтын НӨАТ (10%)',                                          'V', 'SALE',     NULL,      NULL,            'VAT10',  NULL,       'AMOUNT',                false, true,  false, 'ТТ-03а-6'),
        (40,  '3',  '0 хувиар татвар ногдох борлуулалт (экспорт)',                      'V', 'SALE',     NULL,      NULL,            'VAT0',   NULL,       'BASE',                  false, true,  false, 'ТТ-03а-6'),
        (50,  '4',  'НӨАТ-аас чөлөөлөгдөх борлуулалт',                                  'V', 'SALE',     NULL,      NULL,            'EXEMPT', NULL,       'BASE',                  false, true,  false, 'ТТ-03а-6'),
        (60,  '5',  'НӨАТ-ын хамрах хүрээнээс гадуурх борлуулалт',                      'V', 'SALE',     NULL,      NULL,            'NOVAT',  NULL,       'BASE',                  false, true,  false, 'ТТ-03а-6'),
        (70,  '6',  'Нийт борлуулалт',                                                  'R', NULL,       NULL,      NULL,            NULL,     '1|3|4|5',  'NONE',                  false, false, false, NULL),
        (80,  'P',  'ХУДАЛДАН АВАЛТ, ИМПОРТ',                                           'D', NULL,       NULL,      NULL,            NULL,     NULL,       'NONE',                  false, false, false, NULL),
        (90,  '7',  'Дотоодын худалдан авалт (НӨАТ 10%, ДДТД баталгаажсан) - суурь',    'V', 'PURCHASE', 'DOMESTIC','VAT10',         NULL,     NULL,       'BASE',                  true,  false, false, 'ТТ-03а-5'),
        (100, '8',  'Хасагдах орцын НӨАТ (дотоод, ДДТД баталгаажсан)',                  'V', 'PURCHASE', 'DOMESTIC','VAT10',         NULL,     NULL,       'AMOUNT',                true,  true,  true,  'ТТ-03а-5'),
        (110, '9',  'Импортын НӨАТ (гаалийн мэдүүлгээр)',                               'V', 'PURCHASE', NULL,      'CUSTOMS_VAT',   NULL,     NULL,       'AMOUNT',                true,  true,  true,  'ТТ-03а-5'),
        (120, '10', 'Резидент бусын үйлчилгээний НӨАТ (урвуу тооцоо, хасагдах)',        'V', 'PURCHASE', 'IMPORT',  'IMPORT_SERVICE',NULL,     NULL,       'AMOUNT',                false, true,  true,  'ТТ-03а-5'),
        (130, '11', 'Хасагдахгүй НӨАТ (мэдээлэл)',                                      'V', 'PURCHASE', NULL,      NULL,            'VAT10',  NULL,       'NON_DEDUCTIBLE_AMOUNT', false, false, false, NULL),
        (140, '12', 'Нийт хасагдах НӨАТ',                                               'R', NULL,       NULL,      NULL,            NULL,     '8|9|10',   'NONE',                  false, false, true,  NULL),
        (150, 'R',  'ТООЦООЛОЛ',                                                        'D', NULL,       NULL,      NULL,            NULL,     NULL,       'NONE',                  false, false, false, NULL),
        -- 13 = the whole reverse-charge VAT owed (FULL_AMOUNT): a non-deductible share is still payable (2305)
        (160, '13', 'Урвуу тооцооны НӨАТ (төлөх)',                                      'V', 'PURCHASE', 'IMPORT',  'IMPORT_SERVICE',NULL,     NULL,       'FULL_AMOUNT',           false, false, false, NULL),
        (170, '14', 'Төлөх (+) / илүү төлсөн (-) НӨАТ',                                 'R', NULL,       NULL,      NULL,            NULL,     '2|13|12',  'NONE',                  false, false, false, NULL)
      ) AS v(line_no, row_no, descr, lt, gpt, bus, prod, cat, rowtot, amt, confirmed, calc_opp, print_opp, box)
      JOIN tax.vat_statement_template t ON t.company_id = v_company AND t.code = 'VAT'
      JOIN tax.vat_statement_name nm ON nm.company_id = v_company AND nm.vat_statement_template_id = t.id AND nm.code = 'TT03A'
      LEFT JOIN tax.vat_bus_posting_group vb ON vb.company_id = v_company AND vb.code = v.bus
      LEFT JOIN tax.vat_prod_posting_group vp ON vp.company_id = v_company AND vp.code = v.prod
    ON CONFLICT (company_id, vat_statement_name_id, line_no) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION tax.fn_mn_seed_vat_statement() IS 'MN localization package: VAT statement template VAT / TT03A (ТТ-03а data with registers ТТ-03а-5/6) of the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION tax.fn_mn_seed_vat_statement() TO app_user;

-- -----------------------------------------------------------------------------
-- Aging buckets (D-F7): days overdue = as-of date - due date
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpt.fn_mn_seed_aging() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO rpt.aging_bucket_set (tenant_id, company_id, code, description, basis, is_default)
    VALUES (v_tenant, v_company, 'DUE', 'Насжилт: төлөх хугацаанаас хойш хоногоор (D-F7)', 'DUE_DATE', true)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO rpt.aging_bucket (tenant_id, company_id, aging_bucket_set_id, sequence_no, label, label_en, from_days, to_days)
    SELECT v_tenant, v_company, s.id, v.seq, v.label, v.label_en, v.from_days, v.to_days
      FROM (VALUES (1::smallint, 'Хугацаа болоогүй',   'Not yet due',  NULL::integer, -1),
                   (2::smallint, '0-30 хоног',         '0-30 days',    0,  30),
                   (3::smallint, '31-60 хоног',        '31-60 days',   31, 60),
                   (4::smallint, '61-90 хоног',        '61-90 days',   61, 90),
                   (5::smallint, '90-ээс дээш хоног',  'Over 90 days', 91, NULL::integer)) AS v(seq, label, label_en, from_days, to_days)
      JOIN rpt.aging_bucket_set s ON s.company_id = v_company AND s.code = 'DUE'
    ON CONFLICT (company_id, aging_bucket_set_id, sequence_no) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION rpt.fn_mn_seed_aging() IS 'MN localization package: default AR/AP aging bucket set DUE (not due, 0-30, 31-60, 61-90, 90+ days by due date) of the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION rpt.fn_mn_seed_aging() TO app_user;
