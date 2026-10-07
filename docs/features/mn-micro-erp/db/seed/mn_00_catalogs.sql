-- =============================================================================
-- seed/mn_00_catalogs.sql - MN localization package, part 0: GLOBAL catalogs (no tenant).
--
--   * rpt.statement_line     e-balance Form A line codes: СБТ (BS), ОДТ (IS), ӨӨТ (EQ), МГТ (CF)
--   * rpt.cash_flow_category direct-method МГТ categories (one per G/L account, override per bank entry)
--   * platform.source_code   two extra source codes used by the package
--   * platform.permission_set / permission / permission_set_include: SYSTEM permission sets
--     (tenant_id NULL, is_system = true) that the per-tenant default roles reference (D-I2)
--
-- Idempotent: every INSERT is ON CONFLICT DO NOTHING (re-running never changes edited rows).
-- Form A line codes follow research/mn-accounting.md §3.3. Only some СБТ codes were confirmed by
-- search extracts; ОДТ/ӨӨТ/МГТ numbering is a reconstruction of the published Form A layout. All rows
-- are therefore loaded with verified = false until checked against the official annex of MoF Order 361
-- (legalinfo 208281/208282). Changing a code = new row with a new effective_from (FR-RPT-012), never an
-- UPDATE of a row that reports were produced with.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Form A statement lines
-- -----------------------------------------------------------------------------
INSERT INTO rpt.statement_line (form_code, statement_code, line_code, parent_line_code, name, name_en, sort_order,
                                normal_side, is_total, formula, effective_from, verified)
SELECT 'A', v.st, v.code, v.parent, v.name, v.name_en, v.sort, v.side, v.formula IS NOT NULL, v.formula, DATE '2018-01-01', false
  FROM (VALUES
    -- СБТ: Санхүүгийн байдлын тайлан (statement of financial position)
    ('BS','1.1',      NULL,    'Эргэлтийн хөрөнгө',                                         'Current assets',                                   100,'DEBIT', '1.1.1+1.1.2+1.1.3+1.1.4+1.1.5+1.1.6+1.1.7+1.1.8+1.1.9'),
    ('BS','1.1.1',    '1.1',   'Мөнгө, түүнтэй адилтгах хөрөнгө',                           'Cash and cash equivalents',                        110,'DEBIT', NULL),
    ('BS','1.1.2',    '1.1',   'Дансны авлага',                                             'Trade receivables',                                120,'DEBIT', NULL),
    ('BS','1.1.3',    '1.1',   'Татвар, НДШ-ийн авлага',                                    'Tax and social insurance receivables',             130,'DEBIT', NULL),
    ('BS','1.1.4',    '1.1',   'Бусад авлага',                                              'Other receivables',                                140,'DEBIT', NULL),
    ('BS','1.1.5',    '1.1',   'Бусад санхүүгийн хөрөнгө',                                  'Other financial assets',                           150,'DEBIT', NULL),
    ('BS','1.1.6',    '1.1',   'Бараа материал',                                            'Inventories',                                      160,'DEBIT', NULL),
    ('BS','1.1.7',    '1.1',   'Урьдчилж төлсөн зардал/тооцоо',                             'Prepaid expenses and advances',                    170,'DEBIT', NULL),
    ('BS','1.1.8',    '1.1',   'Бусад эргэлтийн хөрөнгө',                                   'Other current assets',                             180,'DEBIT', NULL),
    ('BS','1.1.9',    '1.1',   'Борлуулах зорилгоор эзэмшиж буй эргэлтийн бус хөрөнгө',     'Non-current assets held for sale',                 190,'DEBIT', NULL),
    ('BS','1.2',      NULL,    'Эргэлтийн бус хөрөнгө',                                     'Non-current assets',                               200,'DEBIT', '1.2.1+1.2.2+1.2.3+1.2.4+1.2.5+1.2.6+1.2.7+1.2.8'),
    ('BS','1.2.1',    '1.2',   'Үндсэн хөрөнгө',                                            'Property, plant and equipment',                    210,'DEBIT', NULL),
    ('BS','1.2.2',    '1.2',   'Биет бус хөрөнгө',                                          'Intangible assets',                                220,'DEBIT', NULL),
    ('BS','1.2.3',    '1.2',   'Биологийн хөрөнгө',                                         'Biological assets',                                230,'DEBIT', NULL),
    ('BS','1.2.4',    '1.2',   'Урт хугацаат хөрөнгө оруулалт',                             'Long-term investments',                            240,'DEBIT', NULL),
    ('BS','1.2.5',    '1.2',   'Хайгуул ба үнэлгээний хөрөнгө',                             'Exploration and evaluation assets',                250,'DEBIT', NULL),
    ('BS','1.2.6',    '1.2',   'Хойшлогдсон татварын хөрөнгө',                              'Deferred tax assets',                              260,'DEBIT', NULL),
    ('BS','1.2.7',    '1.2',   'Хөрөнгө оруулалтын зориулалттай үл хөдлөх хөрөнгө',         'Investment property',                              270,'DEBIT', NULL),
    ('BS','1.2.8',    '1.2',   'Бусад эргэлтийн бус хөрөнгө',                               'Other non-current assets',                         280,'DEBIT', NULL),
    ('BS','1.3',      NULL,    'НИЙТ ХӨРӨНГӨ',                                              'TOTAL ASSETS',                                     300,'DEBIT', '1.1+1.2'),
    ('BS','2.1',      NULL,    'Өр төлбөр',                                                 'Liabilities',                                      400,'CREDIT','2.1.1+2.1.2'),
    ('BS','2.1.1',    '2.1',   'Богино хугацаат өр төлбөр',                                 'Current liabilities',                              410,'CREDIT','2.1.1.1+2.1.1.2+2.1.1.3+2.1.1.4+2.1.1.5+2.1.1.6+2.1.1.7+2.1.1.8+2.1.1.9+2.1.1.10'),
    ('BS','2.1.1.1',  '2.1.1', 'Дансны өглөг',                                              'Trade payables',                                   411,'CREDIT',NULL),
    ('BS','2.1.1.2',  '2.1.1', 'Цалингийн өглөг',                                           'Wages payable',                                    412,'CREDIT',NULL),
    ('BS','2.1.1.3',  '2.1.1', 'Татварын өр',                                               'Taxes payable',                                    413,'CREDIT',NULL),
    ('BS','2.1.1.4',  '2.1.1', 'НДШ-ийн өглөг',                                             'Social insurance payable',                         414,'CREDIT',NULL),
    ('BS','2.1.1.5',  '2.1.1', 'Богино хугацаат зээл',                                      'Short-term borrowings',                            415,'CREDIT',NULL),
    ('BS','2.1.1.6',  '2.1.1', 'Хүүний өглөг',                                              'Interest payable',                                 416,'CREDIT',NULL),
    ('BS','2.1.1.7',  '2.1.1', 'Ногдол ашгийн өглөг',                                       'Dividends payable',                                417,'CREDIT',NULL),
    ('BS','2.1.1.8',  '2.1.1', 'Урьдчилж орсон орлого',                                     'Deferred income and customer advances',            418,'CREDIT',NULL),
    ('BS','2.1.1.9',  '2.1.1', 'Нөөц (өр төлбөр)',                                          'Provisions',                                       419,'CREDIT',NULL),
    ('BS','2.1.1.10', '2.1.1', 'Бусад богино хугацаат өр төлбөр',                           'Other current liabilities',                        420,'CREDIT',NULL),
    ('BS','2.1.2',    '2.1',   'Урт хугацаат өр төлбөр',                                    'Non-current liabilities',                          430,'CREDIT','2.1.2.1+2.1.2.2+2.1.2.3'),
    ('BS','2.1.2.1',  '2.1.2', 'Урт хугацаат зээл',                                         'Long-term borrowings',                             431,'CREDIT',NULL),
    ('BS','2.1.2.2',  '2.1.2', 'Хойшлогдсон татварын өр',                                   'Deferred tax liabilities',                         432,'CREDIT',NULL),
    ('BS','2.1.2.3',  '2.1.2', 'Бусад урт хугацаат өр төлбөр',                              'Other non-current liabilities',                    433,'CREDIT',NULL),
    ('BS','2.2',      NULL,    'Эздийн өмч',                                                'Equity',                                           500,'CREDIT','2.2.1+2.2.2+2.2.3+2.2.4+2.2.5+2.2.6+2.2.7'),
    ('BS','2.2.1',    '2.2',   'Өмч',                                                       'Share capital',                                    510,'CREDIT',NULL),
    ('BS','2.2.2',    '2.2',   'Халаасны хувьцаа',                                          'Treasury shares',                                  520,'DEBIT', NULL),
    ('BS','2.2.3',    '2.2',   'Нэмж төлөгдсөн капитал',                                    'Share premium',                                    530,'CREDIT',NULL),
    ('BS','2.2.4',    '2.2',   'Хөрөнгийн дахин үнэлгээний нэмэгдэл',                       'Revaluation surplus',                              540,'CREDIT',NULL),
    ('BS','2.2.5',    '2.2',   'Гадаад валютын хөрвүүлэлтийн нөөц',                         'Foreign currency translation reserve',             550,'CREDIT',NULL),
    ('BS','2.2.6',    '2.2',   'Эздийн өмчийн бусад хэсэг',                                 'Other components of equity',                       560,'CREDIT',NULL),
    ('BS','2.2.7',    '2.2',   'Хуримтлагдсан ашиг',                                        'Retained earnings',                                570,'CREDIT',NULL),
    ('BS','2.3',      NULL,    'НИЙТ ӨР ТӨЛБӨР БА ЭЗДИЙН ӨМЧ',                              'TOTAL LIABILITIES AND EQUITY',                     600,'CREDIT','2.1+2.2'),
    -- ОДТ: Орлогын дэлгэрэнгүй тайлан (statement of comprehensive income), expenses by function
    ('IS','1',    NULL, 'Борлуулалтын орлого (цэвэр)',                                     'Revenue (net)',                                    1010,'CREDIT',NULL),
    ('IS','2',    NULL, 'Борлуулалтын өртөг',                                              'Cost of sales',                                    1020,'DEBIT', NULL),
    ('IS','3',    NULL, 'Нийт ашиг (алдагдал)',                                            'Gross profit (loss)',                              1030,'CREDIT','1+2'),
    ('IS','4',    NULL, 'Түрээсийн орлого',                                                'Rental income',                                    1040,'CREDIT',NULL),
    ('IS','5',    NULL, 'Хүүний орлого',                                                   'Interest income',                                  1050,'CREDIT',NULL),
    ('IS','6',    NULL, 'Ногдол ашгийн орлого',                                            'Dividend income',                                  1060,'CREDIT',NULL),
    ('IS','7',    NULL, 'Эрхийн шимтгэлийн орлого',                                        'Royalty income',                                   1070,'CREDIT',NULL),
    ('IS','8',    NULL, 'Бусад орлого',                                                    'Other income',                                     1080,'CREDIT',NULL),
    ('IS','9',    NULL, 'Борлуулалт, маркетингийн зардал',                                 'Selling and marketing expenses',                   1090,'DEBIT', NULL),
    ('IS','10',   NULL, 'Ерөнхий ба удирдлагын зардал',                                    'General and administrative expenses',              1100,'DEBIT', NULL),
    ('IS','11',   NULL, 'Санхүүгийн зардал',                                               'Finance costs',                                    1110,'DEBIT', NULL),
    ('IS','12',   NULL, 'Бусад зардал',                                                    'Other expenses',                                   1120,'DEBIT', NULL),
    ('IS','13',   NULL, 'Гадаад валютын ханшийн зөрүүний олз (гарз)',                      'Foreign exchange gain (loss)',                     1130,'CREDIT',NULL),
    ('IS','14',   NULL, 'Үндсэн хөрөнгө данснаас хассаны олз (гарз)',                      'Gain (loss) on disposal of PPE',                   1140,'CREDIT',NULL),
    ('IS','15',   NULL, 'Биет бус хөрөнгө данснаас хассаны олз (гарз)',                    'Gain (loss) on disposal of intangible assets',     1150,'CREDIT',NULL),
    ('IS','16',   NULL, 'Хөрөнгө оруулалт борлуулсны олз (гарз)',                          'Gain (loss) on sale of investments',               1160,'CREDIT',NULL),
    ('IS','17',   NULL, 'Бусад ашиг (алдагдал)',                                           'Other gains (losses)',                             1170,'CREDIT',NULL),
    ('IS','18',   NULL, 'Татвар төлөхийн өмнөх ашиг (алдагдал)',                           'Profit (loss) before tax',                         1180,'CREDIT','3+4+5+6+7+8+9+10+11+12+13+14+15+16+17'),
    ('IS','19',   NULL, 'Орлогын татварын зардал',                                         'Income tax expense',                               1190,'DEBIT', NULL),
    ('IS','20',   NULL, 'Татварын дараах ашиг (алдагдал)',                                 'Profit (loss) after tax',                          1200,'CREDIT','18+19'),
    ('IS','21',   NULL, 'Зогсоосон үйл ажиллагааны татварын дараах ашиг (алдагдал)',       'Profit (loss) from discontinued operations',       1210,'CREDIT',NULL),
    ('IS','22',   NULL, 'Тайлант үеийн цэвэр ашиг (алдагдал)',                             'Net profit (loss) for the period',                 1220,'CREDIT','20+21'),
    ('IS','23',   NULL, 'Бусад дэлгэрэнгүй орлого',                                        'Other comprehensive income',                       1230,'CREDIT','23.1+23.2'),
    ('IS','23.1', '23', 'Хөрөнгийн дахин үнэлгээний нэмэгдлийн өсөлт (бууралт)',           'Change in revaluation surplus',                    1231,'CREDIT',NULL),
    ('IS','23.2', '23', 'Гадаад валютын хөрвүүлэлтийн тэгшитгэлийн өсөлт (бууралт)',       'Foreign currency translation differences',         1232,'CREDIT',NULL),
    ('IS','24',   NULL, 'Нийт дэлгэрэнгүй орлого',                                         'Total comprehensive income',                       1240,'CREDIT','22+23'),
    ('IS','25',   NULL, 'Нэгж хувьцаанд ногдох суурь ашиг (алдагдал)',                     'Basic earnings per share',                         1250,'CREDIT',NULL),
    -- ӨӨТ: Өмчийн өөрчлөлтийн тайлан (rows = movements; columns = equity components = СБТ 2.2.x lines)
    ('EQ','1',    NULL, 'Эхний үлдэгдэл',                                                  'Opening balance',                                  2010,'CREDIT',NULL),
    ('EQ','2',    NULL, 'Нягтлан бодох бүртгэлийн бодлогын өөрчлөлтийн нөлөө, алдааны залруулга', 'Effect of policy changes and error corrections', 2020,'CREDIT',NULL),
    ('EQ','3',    NULL, 'Залруулсан үлдэгдэл',                                             'Restated balance',                                 2030,'CREDIT','1+2'),
    ('EQ','4',    NULL, 'Тайлант үеийн цэвэр ашиг (алдагдал)',                             'Net profit (loss) for the period',                 2040,'CREDIT',NULL),
    ('EQ','5',    NULL, 'Бусад дэлгэрэнгүй орлого',                                        'Other comprehensive income',                       2050,'CREDIT',NULL),
    ('EQ','6',    NULL, 'Өмчид гарсан өөрчлөлт',                                           'Changes in contributed equity',                    2060,'CREDIT',NULL),
    ('EQ','7',    NULL, 'Зарласан ногдол ашиг',                                            'Dividends declared',                               2070,'DEBIT', NULL),
    ('EQ','8',    NULL, 'Дахин үнэлгээний нэмэгдлийн хэрэгжсэн дүн',                       'Realised revaluation surplus',                     2080,'CREDIT',NULL),
    ('EQ','9',    NULL, 'Эцсийн үлдэгдэл',                                                 'Closing balance',                                  2090,'CREDIT','3+4+5+6+7+8'),
    -- МГТ: Мөнгөн гүйлгээний тайлан, шууд арга (direct method)
    ('CF','1',     NULL,  'Үндсэн үйл ажиллагааны мөнгөн гүйлгээ',                         'Cash flows from operating activities',             3000,'DEBIT', '1.1+1.2'),
    ('CF','1.1',   '1',   'Мөнгөн орлогын дүн (+)',                                         'Cash receipts',                                    3010,'DEBIT', '1.1.1+1.1.2+1.1.3+1.1.4+1.1.5+1.1.6'),
    ('CF','1.1.1', '1.1', 'Бараа борлуулах, үйлчилгээ үзүүлсний орлого',                    'Receipts from customers',                          3011,'DEBIT', NULL),
    ('CF','1.1.2', '1.1', 'Эрхийн шимтгэл, хураамж, төлбөрийн орлого',                      'Royalties, fees and commissions received',         3012,'DEBIT', NULL),
    ('CF','1.1.3', '1.1', 'Даатгалын нөхвөрөөс хүлээн авсан мөнгө',                         'Insurance claims received',                        3013,'DEBIT', NULL),
    ('CF','1.1.4', '1.1', 'Буцаан авсан албан татвар',                                      'Tax refunds received',                             3014,'DEBIT', NULL),
    ('CF','1.1.5', '1.1', 'Татаас, санхүүжилтийн орлого',                                   'Grants and subsidies received',                    3015,'DEBIT', NULL),
    ('CF','1.1.6', '1.1', 'Бусад мөнгөн орлого',                                            'Other cash receipts',                              3016,'DEBIT', NULL),
    ('CF','1.2',   '1',   'Мөнгөн зарлагын дүн (-)',                                        'Cash payments',                                    3020,'CREDIT','1.2.1+1.2.2+1.2.3+1.2.4+1.2.5+1.2.6+1.2.7+1.2.8+1.2.9'),
    ('CF','1.2.1', '1.2', 'Ажиллагчдад төлсөн',                                             'Paid to employees',                                3021,'CREDIT',NULL),
    ('CF','1.2.2', '1.2', 'Нийгмийн даатгалын байгууллагад төлсөн',                         'Paid to social insurance',                         3022,'CREDIT',NULL),
    ('CF','1.2.3', '1.2', 'Бараа материал худалдан авахад төлсөн',                          'Paid to suppliers of goods and materials',         3023,'CREDIT',NULL),
    ('CF','1.2.4', '1.2', 'Ашиглалтын зардалд төлсөн',                                      'Paid for operating expenses',                      3024,'CREDIT',NULL),
    ('CF','1.2.5', '1.2', 'Түлш, шатахуун, тээврийн хөлс, сэлбэг хэрэгсэлд төлсөн',         'Paid for fuel, transport and spare parts',         3025,'CREDIT',NULL),
    ('CF','1.2.6', '1.2', 'Хүүний төлбөрт төлсөн',                                          'Interest paid',                                    3026,'CREDIT',NULL),
    ('CF','1.2.7', '1.2', 'Татварын байгууллагад төлсөн',                                   'Taxes paid',                                       3027,'CREDIT',NULL),
    ('CF','1.2.8', '1.2', 'Даатгалын төлбөрт төлсөн',                                       'Insurance premiums paid',                          3028,'CREDIT',NULL),
    ('CF','1.2.9', '1.2', 'Бусад мөнгөн зарлага',                                           'Other cash payments',                              3029,'CREDIT',NULL),
    ('CF','2',     NULL,  'Хөрөнгө оруулалтын үйл ажиллагааны мөнгөн гүйлгээ',               'Cash flows from investing activities',             3100,'DEBIT', '2.1+2.2'),
    ('CF','2.1',   '2',   'Мөнгөн орлогын дүн (+)',                                         'Investing receipts',                               3110,'DEBIT', '2.1.1+2.1.2+2.1.3+2.1.4+2.1.5+2.1.6+2.1.7'),
    ('CF','2.1.1', '2.1', 'Үндсэн хөрөнгө борлуулсны орлого',                               'Proceeds from sale of PPE',                        3111,'DEBIT', NULL),
    ('CF','2.1.2', '2.1', 'Биет бус хөрөнгө борлуулсны орлого',                             'Proceeds from sale of intangibles',                3112,'DEBIT', NULL),
    ('CF','2.1.3', '2.1', 'Хөрөнгө оруулалт борлуулсны орлого',                             'Proceeds from sale of investments',                3113,'DEBIT', NULL),
    ('CF','2.1.4', '2.1', 'Бусад урт хугацаат хөрөнгө борлуулсны орлого',                   'Proceeds from other long-term assets',             3114,'DEBIT', NULL),
    ('CF','2.1.5', '2.1', 'Бусдад олгосон зээл, мөнгөн урьдчилгааны буцаан төлөлт',          'Repayment of loans and advances granted',          3115,'DEBIT', NULL),
    ('CF','2.1.6', '2.1', 'Хүлээн авсан хүүний орлого',                                     'Interest received',                                3116,'DEBIT', NULL),
    ('CF','2.1.7', '2.1', 'Хүлээн авсан ногдол ашиг',                                       'Dividends received',                               3117,'DEBIT', NULL),
    ('CF','2.2',   '2',   'Мөнгөн зарлагын дүн (-)',                                        'Investing payments',                               3120,'CREDIT','2.2.1+2.2.2+2.2.3+2.2.4+2.2.5'),
    ('CF','2.2.1', '2.2', 'Үндсэн хөрөнгө олж эзэмшихэд төлсөн',                            'Purchase of PPE',                                  3121,'CREDIT',NULL),
    ('CF','2.2.2', '2.2', 'Биет бус хөрөнгө олж эзэмшихэд төлсөн',                          'Purchase of intangibles',                          3122,'CREDIT',NULL),
    ('CF','2.2.3', '2.2', 'Хөрөнгө оруулалт олж эзэмшихэд төлсөн',                          'Purchase of investments',                          3123,'CREDIT',NULL),
    ('CF','2.2.4', '2.2', 'Бусад урт хугацаат хөрөнгө олж эзэмшихэд төлсөн',                'Purchase of other long-term assets',               3124,'CREDIT',NULL),
    ('CF','2.2.5', '2.2', 'Бусдад олгосон зээл, мөнгөн урьдчилгаа',                         'Loans and advances granted',                       3125,'CREDIT',NULL),
    ('CF','3',     NULL,  'Санхүүгийн үйл ажиллагааны мөнгөн гүйлгээ',                       'Cash flows from financing activities',             3200,'DEBIT', '3.1+3.2'),
    ('CF','3.1',   '3',   'Мөнгөн орлогын дүн (+)',                                         'Financing receipts',                               3210,'DEBIT', '3.1.1+3.1.2+3.1.3+3.1.4'),
    ('CF','3.1.1', '3.1', 'Зээл авсан, өрийн үнэт цаас гаргаснаас хүлээн авсан',             'Proceeds from borrowings',                         3211,'DEBIT', NULL),
    ('CF','3.1.2', '3.1', 'Хувьцаа болон өмчийн бусад үнэт цаас гаргаснаас хүлээн авсан',    'Proceeds from issue of shares',                    3212,'DEBIT', NULL),
    ('CF','3.1.3', '3.1', 'Төрөл бүрийн хандив',                                            'Donations received',                               3213,'DEBIT', NULL),
    ('CF','3.1.4', '3.1', 'Санхүүгийн түрээсийн авлагаас хүлээн авсан',                      'Finance lease receipts',                           3214,'DEBIT', NULL),
    ('CF','3.2',   '3',   'Мөнгөн зарлагын дүн (-)',                                        'Financing payments',                               3220,'CREDIT','3.2.1+3.2.2+3.2.3+3.2.4'),
    ('CF','3.2.1', '3.2', 'Зээл, өрийн үнэт цаасны төлбөрт төлсөн',                         'Repayment of borrowings',                          3221,'CREDIT',NULL),
    ('CF','3.2.2', '3.2', 'Санхүүгийн түрээсийн өглөгт төлсөн',                             'Finance lease payments',                           3222,'CREDIT',NULL),
    ('CF','3.2.3', '3.2', 'Хувьцаа буцаан худалдан авахад төлсөн',                          'Purchase of own shares',                           3223,'CREDIT',NULL),
    ('CF','3.2.4', '3.2', 'Төлсөн ногдол ашиг',                                             'Dividends paid',                                   3224,'CREDIT',NULL),
    ('CF','4',     NULL,  'Валютын ханшийн зөрүүний нөлөө',                                 'Effect of exchange rate changes on cash',          3300,'DEBIT', NULL),
    ('CF','5',     NULL,  'Бүх цэвэр мөнгөн гүйлгээ',                                       'Net increase (decrease) in cash',                  3400,'DEBIT', '1+2+3+4'),
    ('CF','6',     NULL,  'Мөнгө, түүнтэй адилтгах хөрөнгийн эхний үлдэгдэл',               'Cash and cash equivalents at the beginning',       3500,'DEBIT', NULL),
    ('CF','7',     NULL,  'Мөнгө, түүнтэй адилтгах хөрөнгийн эцсийн үлдэгдэл',              'Cash and cash equivalents at the end',             3600,'DEBIT', '5+6')
  ) AS v(st, code, parent, name, name_en, sort, side, formula)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Direct-method cash-flow categories (МГТ). One category per G/L account (gl_account.cash_flow_category_id),
--    overridable per bank/cash entry (bank_ledger_entry.cash_flow_category_id). A cash entry is classified by the
--    category of its counter-account (FR-RPT-011). A flow against a category's natural direction is shown on the
--    same line with the opposite sign (e.g. a supplier refund reduces 1.2.3); a different line needs the per-entry
--    override (e.g. loan repayment: FIN_LOAN_REPAYMENTS on an entry against 2400).
--    activity NONE: CASH_TRANSFER (between cash accounts, eliminated), NON_CASH (accounts that never settle in cash;
--    cash against them is shown as "unclassified" for review), FX_EFFECT (exchange differences, МГТ line 4).
-- -----------------------------------------------------------------------------
INSERT INTO rpt.cash_flow_category (code, name, name_en, activity, direction, statement_line_id, sort_order)
SELECT v.code, v.name, v.name_en, v.activity, v.direction,
       (SELECT s.id FROM rpt.statement_line s
         WHERE s.form_code = 'A' AND s.statement_code = 'CF' AND s.line_code = v.line AND s.effective_to IS NULL
         ORDER BY s.effective_from DESC LIMIT 1),
       v.sort
  FROM (VALUES
    ('OP_CUST_RECEIPTS',       'Бараа, үйлчилгээ борлуулсны орлого',          'Receipts from customers',            'OPERATING','INFLOW', '1.1.1', 10),
    ('OP_ROYALTY_RECEIPTS',    'Эрхийн шимтгэл, хураамжийн орлого',            'Royalties and fees received',        'OPERATING','INFLOW', '1.1.2', 20),
    ('OP_INSURANCE_CLAIMS',    'Даатгалын нөхвөр',                           'Insurance claims received',          'OPERATING','INFLOW', '1.1.3', 30),
    ('OP_TAX_REFUNDS',         'Буцаан авсан татвар',                          'Tax refunds received',               'OPERATING','INFLOW', '1.1.4', 40),
    ('OP_GRANTS',              'Татаас, санхүүжилт',                           'Grants received',                    'OPERATING','INFLOW', '1.1.5', 50),
    ('OP_OTHER_RECEIPTS',      'Бусад мөнгөн орлого',                          'Other operating receipts',           'OPERATING','INFLOW', '1.1.6', 60),
    ('OP_EMPLOYEES',           'Ажиллагчдад төлсөн',                           'Paid to employees',                  'OPERATING','OUTFLOW','1.2.1', 110),
    ('OP_SOCIAL_INSURANCE',    'НДШ-д төлсөн',                                 'Paid to social insurance',           'OPERATING','OUTFLOW','1.2.2', 120),
    ('OP_SUPPLIERS',           'Бараа материал, нийлүүлэгчид төлсөн',          'Paid to suppliers',                  'OPERATING','OUTFLOW','1.2.3', 130),
    ('OP_OPERATING_EXP',       'Ашиглалтын зардалд төлсөн',                    'Paid for operating expenses',        'OPERATING','OUTFLOW','1.2.4', 140),
    ('OP_FUEL_TRANSPORT',      'Шатахуун, тээвэр, сэлбэгт төлсөн',             'Paid for fuel and transport',        'OPERATING','OUTFLOW','1.2.5', 150),
    ('OP_INTEREST_PAID',       'Хүүний төлбөрт төлсөн',                        'Interest paid',                      'OPERATING','OUTFLOW','1.2.6', 160),
    ('OP_TAXES_PAID',          'Татварын байгууллагад төлсөн',                 'Taxes paid',                         'OPERATING','OUTFLOW','1.2.7', 170),
    ('OP_INSURANCE_PAID',      'Даатгалын төлбөрт төлсөн',                     'Insurance premiums paid',            'OPERATING','OUTFLOW','1.2.8', 180),
    ('OP_OTHER_PAYMENTS',      'Бусад мөнгөн зарлага',                         'Other operating payments',           'OPERATING','OUTFLOW','1.2.9', 190),
    ('INV_FA_SALE',            'Үндсэн хөрөнгө борлуулсан',                    'Sale of PPE',                        'INVESTING','INFLOW', '2.1.1', 210),
    ('INV_INTANGIBLE_SALE',    'Биет бус хөрөнгө борлуулсан',                  'Sale of intangibles',                'INVESTING','INFLOW', '2.1.2', 220),
    ('INV_INVESTMENT_SALE',    'Хөрөнгө оруулалт борлуулсан',                  'Sale of investments',                'INVESTING','INFLOW', '2.1.3', 230),
    ('INV_OTHER_LT_SALE',      'Бусад урт хугацаат хөрөнгө борлуулсан',        'Sale of other long-term assets',     'INVESTING','INFLOW', '2.1.4', 240),
    ('INV_LOANS_REPAID',       'Олгосон зээлийн буцаан төлөлт',                'Repayment of loans granted',         'INVESTING','INFLOW', '2.1.5', 250),
    ('INV_INTEREST_RCVD',      'Хүлээн авсан хүү',                             'Interest received',                  'INVESTING','INFLOW', '2.1.6', 260),
    ('INV_DIVIDENDS_RCVD',     'Хүлээн авсан ногдол ашиг',                     'Dividends received',                 'INVESTING','INFLOW', '2.1.7', 270),
    ('INV_FA_BUY',             'Үндсэн хөрөнгө олж эзэмшсэн',                  'Purchase of PPE',                    'INVESTING','OUTFLOW','2.2.1', 310),
    ('INV_INTANGIBLE_BUY',     'Биет бус хөрөнгө олж эзэмшсэн',                'Purchase of intangibles',            'INVESTING','OUTFLOW','2.2.2', 320),
    ('INV_INVESTMENT_BUY',     'Хөрөнгө оруулалт олж эзэмшсэн',                'Purchase of investments',            'INVESTING','OUTFLOW','2.2.3', 330),
    ('INV_OTHER_LT_BUY',       'Бусад урт хугацаат хөрөнгө олж эзэмшсэн',      'Purchase of other long-term assets', 'INVESTING','OUTFLOW','2.2.4', 340),
    ('INV_LOANS_GIVEN',        'Бусдад олгосон зээл, урьдчилгаа',              'Loans and advances granted',         'INVESTING','OUTFLOW','2.2.5', 350),
    ('FIN_BORROWINGS',         'Зээл авсан',                                   'Proceeds from borrowings',           'FINANCING','INFLOW', '3.1.1', 410),
    ('FIN_SHARES_ISSUED',      'Хувьцаа гаргаж хүлээн авсан',                  'Proceeds from share issue',          'FINANCING','INFLOW', '3.1.2', 420),
    ('FIN_DONATIONS',          'Хандив хүлээн авсан',                          'Donations received',                 'FINANCING','INFLOW', '3.1.3', 430),
    ('FIN_LEASE_RECEIPTS',     'Санхүүгийн түрээсийн авлагаас',                'Finance lease receipts',             'FINANCING','INFLOW', '3.1.4', 440),
    ('FIN_LOAN_REPAYMENTS',    'Зээлийн төлбөрт төлсөн',                       'Repayment of borrowings',            'FINANCING','OUTFLOW','3.2.1', 510),
    ('FIN_LEASE_PAYMENTS',     'Санхүүгийн түрээсийн өглөгт төлсөн',           'Finance lease payments',             'FINANCING','OUTFLOW','3.2.2', 520),
    ('FIN_SHARE_BUYBACK',      'Хувьцаа буцаан худалдан авсан',                'Purchase of own shares',             'FINANCING','OUTFLOW','3.2.3', 530),
    ('FIN_DIVIDENDS_PAID',     'Төлсөн ногдол ашиг',                           'Dividends paid',                     'FINANCING','OUTFLOW','3.2.4', 540),
    ('FX_EFFECT',              'Валютын ханшийн зөрүүний нөлөө',               'Effect of exchange rate changes',    'NONE',     'BOTH',   '4',     900),
    ('CASH_TRANSFER',          'Мөнгөн хөрөнгө хоорондын шилжүүлэг',           'Transfer between cash accounts',     'NONE',     'BOTH',   NULL,    910),
    ('NON_CASH',               'Мөнгөн бус данс (ангилалгүй)',                 'Non-cash account (unclassified)',    'NONE',     'BOTH',   NULL,    920)
  ) AS v(code, name, name_en, activity, direction, line, sort)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Source codes used by the package (the base catalog is in 010_platform.sql)
-- -----------------------------------------------------------------------------
INSERT INTO platform.source_code (code, description, description_en) VALUES
    ('PAYROLLJNL', 'Цалингийн журнал (импорт)', 'Payroll journal import'),
    ('CASHCOUNT',  'Кассын тооллогын зөрүү',    'Cash count difference')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. System permission sets (tenant_id NULL, is_system = true; 02-architecture §10.2, D-I2).
--    The tables have FORCE ROW LEVEL SECURITY and the policies never allow tenant_id NULL rows to be
--    written, so the owner lifts FORCE for this transaction only (owner without FORCE bypasses RLS) and
--    restores it before COMMIT. Object names: TABLE = schema.table ('*' = every table), ACTION/REPORT =
--    {module}.{resource}.{action}. Rights string: R I M D X; upper case = direct (Y), lower case = indirect (I).
-- -----------------------------------------------------------------------------
ALTER TABLE platform.permission_set NO FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.permission NO FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.permission_set_include NO FORCE ROW LEVEL SECURITY;

INSERT INTO platform.permission_set (tenant_id, code, name, name_en, assignable, is_system)
SELECT NULL, v.code, v.name, v.name_en, true, true
  FROM (VALUES
    ('ERP_BASIC',          'ERP BASIC - нэвтрэх, лавлах унших',            'Basic access and reference data'),
    ('ERP_READ_ALL',       'ERP READ ALL - бүх өгөгдөл унших',             'Read all data'),
    ('ERP_CUSTOMER_VIEW',  'ERP CUSTOMER, VIEW',                           'Customers, view'),
    ('ERP_CUSTOMER_EDIT',  'ERP CUSTOMER, EDIT',                           'Customers, edit'),
    ('ERP_VENDOR_VIEW',    'ERP VENDOR, VIEW',                             'Vendors, view'),
    ('ERP_VENDOR_EDIT',    'ERP VENDOR, EDIT',                             'Vendors, edit'),
    ('ERP_ITEM_EDIT',      'ERP ITEM, EDIT - бараа, үйлчилгээний карт',    'Items, edit'),
    ('ERP_SALES_EDIT',     'ERP SALES DOC, EDIT',                          'Sales documents, edit'),
    ('ERP_SALES_POST',     'ERP SALES DOC, POST',                          'Sales documents, post'),
    ('ERP_PURCH_EDIT',     'ERP PURCH DOC, EDIT',                          'Purchase documents, edit'),
    ('ERP_PURCH_POST',     'ERP PURCH DOC, POST',                          'Purchase documents, post'),
    ('ERP_CASH_RECEIPT',   'ERP CASH RECEIPT - кассын орлого (МХ-1)',       'Cash receipts'),
    ('ERP_CASH',           'ERP CASH - кассын орлого, зарлага (МХ-1/МХ-2)', 'Cash vouchers'),
    ('ERP_BANKING',        'ERP BANKING',                                  'Banking'),
    ('ERP_JOURNALS_EDIT',  'ERP JOURNALS, EDIT',                           'Journals, edit'),
    ('ERP_JOURNALS_POST',  'ERP JOURNALS, POST',                           'Journals, post and reverse'),
    ('ERP_RECEIVABLES',    'ERP ACC. RECEIVABLE',                          'Receivables application'),
    ('ERP_PAYABLES',       'ERP ACC. PAYABLE',                             'Payables application'),
    ('ERP_INV_EDIT',       'ERP INV, EDIT',                                'Inventory adjustments'),
    ('ERP_FA_VIEW',        'ERP FA, VIEW',                                 'Fixed assets, view'),
    ('ERP_FA_EDIT',        'ERP FA, EDIT',                                 'Fixed assets, edit and depreciate'),
    ('ERP_FIN_REPORTS',    'ERP FINANCIAL REP.',                           'Financial reports and export'),
    ('ERP_VAT',            'ERP VAT - НӨАТ-ын тайлан, хаалт',              'VAT return and settlement'),
    ('ERP_PERIOD_CLOSE',   'ERP PERIOD CLOSE - үе, жил хаах',              'Period and year-end close'),
    ('ERP_PERIOD_REOPEN',  'ERP PERIOD REOPEN - хаасан үе нээх (D-D3)',     'Reopen closed periods'),
    ('ERP_SETUP',          'ERP SETUP - тохиргоо',                         'Company setup'),
    ('ERP_SECURITY',       'ERP SECURITY - хэрэглэгч, эрх',                'Users and permissions'),
    ('ERP_EBARIMT_OPS',    'ERP EBARIMT OPS',                              'eBarimt operations'),
    ('ERP_AUDIT_READ',     'ERP AUDIT READ',                               'Audit log read'),
    ('ERP_PII_UNMASK',     'ERP PII UNMASK',                               'Unmask personal data')
  ) AS v(code, name, name_en)
ON CONFLICT DO NOTHING;

INSERT INTO platform.permission (tenant_id, permission_set_id, object_type, object_name,
                                 read_permission, insert_permission, modify_permission, delete_permission, execute_permission)
SELECT NULL, s.id, v.otype, v.oname,
       CASE WHEN strpos(v.r, 'R') > 0 THEN 'Y' WHEN strpos(v.r, 'r') > 0 THEN 'I' ELSE 'N' END,
       CASE WHEN strpos(v.r, 'I') > 0 THEN 'Y' WHEN strpos(v.r, 'i') > 0 THEN 'I' ELSE 'N' END,
       CASE WHEN strpos(v.r, 'M') > 0 THEN 'Y' WHEN strpos(v.r, 'm') > 0 THEN 'I' ELSE 'N' END,
       CASE WHEN strpos(v.r, 'D') > 0 THEN 'Y' WHEN strpos(v.r, 'd') > 0 THEN 'I' ELSE 'N' END,
       CASE WHEN strpos(v.r, 'X') > 0 THEN 'Y' WHEN strpos(v.r, 'x') > 0 THEN 'I' ELSE 'N' END
  FROM (VALUES
    -- BASIC: sign-in, own profile, reference lists every user needs on a document
    ('ERP_BASIC','ACTION','platform.profile.edit','X'),
    ('ERP_BASIC','TABLE','platform.company','R'),
    ('ERP_BASIC','TABLE','platform.company_setup','R'),
    ('ERP_BASIC','TABLE','platform.reason_code','R'),
    ('ERP_BASIC','TABLE','platform.source_code','R'),
    ('ERP_BASIC','TABLE','platform.number_series','R'),
    ('ERP_BASIC','TABLE','party.payment_terms','R'),
    ('ERP_BASIC','TABLE','party.payment_method','R'),
    ('ERP_BASIC','TABLE','party.gen_bus_posting_group','R'),
    ('ERP_BASIC','TABLE','party.gen_prod_posting_group','R'),
    ('ERP_BASIC','TABLE','tax.vat_bus_posting_group','R'),
    ('ERP_BASIC','TABLE','tax.vat_prod_posting_group','R'),
    ('ERP_BASIC','TABLE','tax.vat_posting_setup','R'),
    ('ERP_BASIC','TABLE','inv.unit_of_measure','R'),
    ('ERP_BASIC','TABLE','inv.item','R'),
    ('ERP_BASIC','TABLE','inv.item_unit_of_measure','R'),
    ('ERP_BASIC','TABLE','gl.dimension','R'),
    ('ERP_BASIC','TABLE','gl.dimension_value','R'),
    ('ERP_BASIC','TABLE','fx.currency','R'),
    ('ERP_BASIC','TABLE','fx.iso_currency','R'),
    ('ERP_BASIC','TABLE','bank.bank_account','R'),
    -- READ ALL: every table (Viewer)
    ('ERP_READ_ALL','TABLE','*','R'),
    -- customers / vendors / items
    ('ERP_CUSTOMER_VIEW','TABLE','party.customer','R'),
    ('ERP_CUSTOMER_VIEW','TABLE','party.customer_template','R'),
    ('ERP_CUSTOMER_VIEW','TABLE','party.cust_ledger_entry','R'),
    ('ERP_CUSTOMER_VIEW','TABLE','party.detailed_cust_ledger_entry','R'),
    ('ERP_CUSTOMER_EDIT','TABLE','party.customer','RIMD'),
    ('ERP_CUSTOMER_EDIT','ACTION','party.customer.lookup_tin','X'),
    ('ERP_VENDOR_VIEW','TABLE','party.vendor','R'),
    ('ERP_VENDOR_VIEW','TABLE','party.vendor_template','R'),
    ('ERP_VENDOR_VIEW','TABLE','party.vendor_bank_account','R'),
    ('ERP_VENDOR_VIEW','TABLE','party.vendor_ledger_entry','R'),
    ('ERP_VENDOR_VIEW','TABLE','party.detailed_vendor_ledger_entry','R'),
    ('ERP_VENDOR_EDIT','TABLE','party.vendor','RIMD'),
    ('ERP_VENDOR_EDIT','TABLE','party.vendor_bank_account','RIMD'),
    ('ERP_ITEM_EDIT','TABLE','inv.item','RIMD'),
    ('ERP_ITEM_EDIT','TABLE','inv.item_unit_of_measure','RIMD'),
    -- sales documents
    ('ERP_SALES_EDIT','TABLE','sales.sales_header','RIMD'),
    ('ERP_SALES_EDIT','TABLE','sales.sales_line','RIMD'),
    ('ERP_SALES_EDIT','ACTION','sales.document.preview','X'),
    ('ERP_SALES_POST','ACTION','sales.invoice.post','X'),
    ('ERP_SALES_POST','ACTION','sales.creditmemo.post','X'),
    ('ERP_SALES_POST','ACTION','sales.pos.post','X'),
    ('ERP_SALES_POST','ACTION','sales.invoice.cancel','X'),
    ('ERP_SALES_POST','TABLE','sales.sales_invoice_header','Ri'),
    ('ERP_SALES_POST','TABLE','sales.sales_invoice_line','Ri'),
    ('ERP_SALES_POST','TABLE','sales.sales_cr_memo_header','Ri'),
    ('ERP_SALES_POST','TABLE','sales.sales_cr_memo_line','Ri'),
    ('ERP_SALES_POST','TABLE','party.cust_ledger_entry','Ri'),
    ('ERP_SALES_POST','TABLE','party.detailed_cust_ledger_entry','Ri'),
    ('ERP_SALES_POST','TABLE','gl.gl_entry','i'),
    ('ERP_SALES_POST','TABLE','tax.vat_entry','i'),
    ('ERP_SALES_POST','TABLE','ebarimt.ebarimt_document','Rim'),
    -- purchase documents
    ('ERP_PURCH_EDIT','TABLE','purchase.purchase_header','RIMD'),
    ('ERP_PURCH_EDIT','TABLE','purchase.purchase_line','RIMD'),
    ('ERP_PURCH_EDIT','TABLE','ebarimt.purchase_receipt','R'),
    ('ERP_PURCH_POST','ACTION','purchase.invoice.post','X'),
    ('ERP_PURCH_POST','ACTION','purchase.creditmemo.post','X'),
    ('ERP_PURCH_POST','ACTION','ebarimt.purchase_receipt.import','X'),
    ('ERP_PURCH_POST','TABLE','purchase.purch_inv_header','Ri'),
    ('ERP_PURCH_POST','TABLE','purchase.purch_inv_line','Ri'),
    ('ERP_PURCH_POST','TABLE','purchase.purch_cr_memo_header','Ri'),
    ('ERP_PURCH_POST','TABLE','purchase.purch_cr_memo_line','Ri'),
    ('ERP_PURCH_POST','TABLE','party.vendor_ledger_entry','Ri'),
    ('ERP_PURCH_POST','TABLE','party.detailed_vendor_ledger_entry','Ri'),
    ('ERP_PURCH_POST','TABLE','gl.gl_entry','i'),
    ('ERP_PURCH_POST','TABLE','tax.vat_entry','i'),
    -- cash and bank
    ('ERP_CASH_RECEIPT','ACTION','bank.cash_receipt.post','X'),
    ('ERP_CASH_RECEIPT','TABLE','bank.posted_cash_voucher','Ri'),
    ('ERP_CASH_RECEIPT','TABLE','bank.bank_ledger_entry','Ri'),
    ('ERP_CASH','ACTION','bank.cash_payment.post','X'),
    ('ERP_CASH','ACTION','bank.cash_count.post','X'),
    ('ERP_BANKING','TABLE','bank.bank_account','RIM'),
    ('ERP_BANKING','TABLE','bank.bank_ledger_entry','Rim'),
    ('ERP_BANKING','TABLE','bank.bank_statement','RIMD'),
    ('ERP_BANKING','TABLE','bank.bank_statement_line','RIMD'),
    ('ERP_BANKING','TABLE','bank.bank_reconciliation','RIMD'),
    ('ERP_BANKING','TABLE','bank.bank_reconciliation_line','RIMD'),
    ('ERP_BANKING','TABLE','bank.text_to_account_mapping','RIMD'),
    ('ERP_BANKING','ACTION','bank.statement.import','X'),
    ('ERP_BANKING','ACTION','bank.payment.post','X'),
    ('ERP_BANKING','ACTION','bank.reconciliation.post','X'),
    -- journals
    ('ERP_JOURNALS_EDIT','TABLE','gl.journal_batch','RIMD'),
    ('ERP_JOURNALS_EDIT','TABLE','gl.journal_line','RIMD'),
    ('ERP_JOURNALS_EDIT','TABLE','gl.standard_journal','RIMD'),
    ('ERP_JOURNALS_EDIT','TABLE','gl.standard_journal_line','RIMD'),
    ('ERP_JOURNALS_POST','ACTION','gl.journal.post','X'),
    ('ERP_JOURNALS_POST','ACTION','gl.transaction.reverse','X'),
    ('ERP_JOURNALS_POST','ACTION','gl.register.reverse','X'),
    ('ERP_JOURNALS_POST','TABLE','gl.gl_entry','Ri'),
    ('ERP_JOURNALS_POST','TABLE','gl.gl_transaction','Ri'),
    ('ERP_JOURNALS_POST','TABLE','gl.gl_register','Ri'),
    -- receivables / payables application
    ('ERP_RECEIVABLES','TABLE','party.application_draft','RIMD'),
    ('ERP_RECEIVABLES','ACTION','party.customer.apply','X'),
    ('ERP_RECEIVABLES','ACTION','party.customer.unapply','X'),
    ('ERP_RECEIVABLES','REPORT','rpt.customer_aging','X'),
    ('ERP_RECEIVABLES','REPORT','rpt.customer_statement','X'),
    ('ERP_PAYABLES','TABLE','party.application_draft','RIMD'),
    ('ERP_PAYABLES','ACTION','party.vendor.apply','X'),
    ('ERP_PAYABLES','ACTION','party.vendor.unapply','X'),
    ('ERP_PAYABLES','REPORT','rpt.vendor_aging','X'),
    -- inventory / fixed assets (R2)
    ('ERP_INV_EDIT','ACTION','inv.adjustment.post','X'),
    ('ERP_INV_EDIT','ACTION','inv.count.post','X'),
    ('ERP_FA_VIEW','TABLE','fa.fixed_asset','R'),
    ('ERP_FA_VIEW','TABLE','fa.fa_depreciation_book','R'),
    ('ERP_FA_VIEW','TABLE','fa.fa_ledger_entry','R'),
    ('ERP_FA_EDIT','TABLE','fa.fixed_asset','RIMD'),
    ('ERP_FA_EDIT','TABLE','fa.fa_depreciation_book','RIMD'),
    ('ERP_FA_EDIT','ACTION','fa.depreciation.run','X'),
    ('ERP_FA_EDIT','ACTION','fa.disposal.post','X'),
    -- reports
    ('ERP_FIN_REPORTS','TABLE','rpt.financial_report','R'),
    ('ERP_FIN_REPORTS','TABLE','rpt.fin_report_row','R'),
    ('ERP_FIN_REPORTS','TABLE','rpt.fin_report_column','R'),
    ('ERP_FIN_REPORTS','REPORT','rpt.trial_balance','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.gl_detail','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.account_statement','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.balance_sheet','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.income_statement','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.equity_statement','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.cash_flow','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.sales_journal','X'),
    ('ERP_FIN_REPORTS','REPORT','rpt.purchase_journal','X'),
    ('ERP_FIN_REPORTS','ACTION','rpt.export.excel','X'),
    ('ERP_FIN_REPORTS','ACTION','rpt.ebalance.keying_sheet','X'),
    -- VAT
    ('ERP_VAT','TABLE','tax.vat_return_period','RIM'),
    ('ERP_VAT','TABLE','tax.vat_entry','Rm'),
    ('ERP_VAT','REPORT','rpt.vat_return','X'),
    ('ERP_VAT','ACTION','tax.vat.settle','X'),
    ('ERP_VAT','ACTION','tax.vat_return.submit','X'),
    ('ERP_VAT','ACTION','tax.vat_entry.confirm_deductible','X'),
    -- period close / reopen
    ('ERP_PERIOD_CLOSE','TABLE','gl.accounting_period','RM'),
    ('ERP_PERIOD_CLOSE','TABLE','gl.fiscal_year','RIM'),
    ('ERP_PERIOD_CLOSE','ACTION','gl.period.close','X'),
    ('ERP_PERIOD_CLOSE','ACTION','gl.period.lock','X'),
    ('ERP_PERIOD_CLOSE','ACTION','gl.year.close','X'),
    ('ERP_PERIOD_CLOSE','ACTION','fx.revaluation.run','X'),
    ('ERP_PERIOD_REOPEN','ACTION','gl.period.reopen','X'),
    -- setup
    ('ERP_SETUP','ACTION','platform.company.setup','X'),
    ('ERP_SETUP','TABLE','platform.company_setup','RM'),
    ('ERP_SETUP','TABLE','platform.number_series','RIMD'),
    ('ERP_SETUP','TABLE','platform.number_series_line','RIMD'),
    ('ERP_SETUP','TABLE','platform.reason_code','RIMD'),
    ('ERP_SETUP','TABLE','gl.gl_account','RIMD'),
    ('ERP_SETUP','TABLE','gl.gl_account_category','RIMD'),
    ('ERP_SETUP','TABLE','gl.general_ledger_setup','RM'),
    ('ERP_SETUP','TABLE','gl.journal_template','RIMD'),
    ('ERP_SETUP','TABLE','gl.dimension','RIMD'),
    ('ERP_SETUP','TABLE','gl.dimension_value','RIMD'),
    ('ERP_SETUP','TABLE','gl.default_dimension','RIMD'),
    ('ERP_SETUP','TABLE','tax.vat_bus_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','tax.vat_prod_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','tax.vat_posting_setup','RIMD'),
    ('ERP_SETUP','TABLE','tax.vat_statement_template','RIMD'),
    ('ERP_SETUP','TABLE','tax.vat_statement_name','RIMD'),
    ('ERP_SETUP','TABLE','tax.vat_statement_line','RIMD'),
    ('ERP_SETUP','TABLE','tax.city_tax_code','RIMD'),
    ('ERP_SETUP','TABLE','tax.city_tax_setup','RM'),
    ('ERP_SETUP','TABLE','party.gen_bus_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','party.gen_prod_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','party.general_posting_setup','RIMD'),
    ('ERP_SETUP','TABLE','party.customer_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','party.vendor_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','party.payment_terms','RIMD'),
    ('ERP_SETUP','TABLE','party.payment_method','RIMD'),
    ('ERP_SETUP','TABLE','party.customer_template','RIMD'),
    ('ERP_SETUP','TABLE','party.vendor_template','RIMD'),
    ('ERP_SETUP','TABLE','bank.bank_account_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','bank.bank_statement_import_format','RIMD'),
    ('ERP_SETUP','TABLE','fx.currency','RIMD'),
    ('ERP_SETUP','TABLE','fx.currency_exchange_rate','RIMD'),
    ('ERP_SETUP','TABLE','inv.unit_of_measure','RIMD'),
    ('ERP_SETUP','TABLE','inv.inventory_setup','RM'),
    ('ERP_SETUP','TABLE','inv.inventory_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','inv.inventory_posting_setup','RIMD'),
    ('ERP_SETUP','TABLE','fa.fa_class','RIMD'),
    ('ERP_SETUP','TABLE','fa.fa_posting_group','RIMD'),
    ('ERP_SETUP','TABLE','fa.depreciation_book','RIMD'),
    ('ERP_SETUP','TABLE','sales.sales_setup','RM'),
    ('ERP_SETUP','TABLE','purchase.purchase_setup','RM'),
    ('ERP_SETUP','TABLE','rpt.financial_report','RIMD'),
    ('ERP_SETUP','TABLE','rpt.fin_report_row_definition','RIMD'),
    ('ERP_SETUP','TABLE','rpt.fin_report_row','RIMD'),
    ('ERP_SETUP','TABLE','rpt.fin_report_column_definition','RIMD'),
    ('ERP_SETUP','TABLE','rpt.fin_report_column','RIMD'),
    ('ERP_SETUP','TABLE','rpt.aging_bucket_set','RIMD'),
    ('ERP_SETUP','TABLE','rpt.aging_bucket','RIMD'),
    ('ERP_SETUP','TABLE','ebarimt.ebarimt_setup','RIM'),
    ('ERP_SETUP','TABLE','ebarimt.ebarimt_pos','RIMD'),
    -- security
    ('ERP_SECURITY','ACTION','platform.security.manage','X'),
    ('ERP_SECURITY','ACTION','platform.user.invite','X'),
    ('ERP_SECURITY','TABLE','platform.tenant_membership','RIMD'),
    ('ERP_SECURITY','TABLE','platform.role','RIMD'),
    ('ERP_SECURITY','TABLE','platform.role_permission_set','RIMD'),
    ('ERP_SECURITY','TABLE','platform.user_company_role','RIMD'),
    ('ERP_SECURITY','TABLE','platform.user_setup','RIMD'),
    ('ERP_SECURITY','TABLE','platform.permission_set','RIMD'),
    ('ERP_SECURITY','TABLE','platform.permission','RIMD'),
    ('ERP_SECURITY','TABLE','platform.permission_set_include','RIMD'),
    ('ERP_SECURITY','TABLE','platform.support_access_grant','RIMD'),
    -- eBarimt operations, audit, PII
    ('ERP_EBARIMT_OPS','TABLE','ebarimt.ebarimt_document','RM'),
    ('ERP_EBARIMT_OPS','TABLE','ebarimt.ebarimt_document_event','R'),
    ('ERP_EBARIMT_OPS','ACTION','ebarimt.merchant.register','X'),
    ('ERP_EBARIMT_OPS','ACTION','ebarimt.unknown.resolve','X'),
    ('ERP_AUDIT_READ','TABLE','audit.row_change','R'),
    ('ERP_AUDIT_READ','TABLE','audit.posting_log','R'),
    ('ERP_AUDIT_READ','TABLE','audit.security_event','R'),
    ('ERP_AUDIT_READ','REPORT','audit.integrity','X'),
    ('ERP_PII_UNMASK','ACTION','platform.pii.unmask','X')
  ) AS v(set_code, otype, oname, r)
  JOIN platform.permission_set s ON s.tenant_id IS NULL AND s.code = v.set_code
ON CONFLICT (permission_set_id, object_type, object_name) DO NOTHING;

-- Composite sets (BC IncludedPermissionSets): EDIT contains VIEW, CASH contains CASH RECEIPT.
INSERT INTO platform.permission_set_include (tenant_id, permission_set_id, included_permission_set_id)
SELECT NULL, p.id, c.id
  FROM (VALUES ('ERP_CUSTOMER_EDIT','ERP_CUSTOMER_VIEW'), ('ERP_VENDOR_EDIT','ERP_VENDOR_VIEW'),
               ('ERP_FA_EDIT','ERP_FA_VIEW'), ('ERP_CASH','ERP_CASH_RECEIPT'), ('ERP_SALES_POST','ERP_SALES_EDIT'),
               ('ERP_PURCH_POST','ERP_PURCH_EDIT'), ('ERP_JOURNALS_POST','ERP_JOURNALS_EDIT')) AS v(parent, child)
  JOIN platform.permission_set p ON p.tenant_id IS NULL AND p.code = v.parent
  JOIN platform.permission_set c ON c.tenant_id IS NULL AND c.code = v.child
ON CONFLICT (permission_set_id, included_permission_set_id) DO NOTHING;

ALTER TABLE platform.permission_set FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.permission FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.permission_set_include FORCE ROW LEVEL SECURITY;

COMMIT;
