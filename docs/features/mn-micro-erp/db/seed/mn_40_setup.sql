-- =============================================================================
-- seed/mn_40_setup.sql - MN localization package, part 4: numbering, calendar, journals and module setups.
--
--   * platform.fn_mn_ensure_number_series(year)  number series (D-C7) + the yearly lines of p_year
--   * platform.fn_mn_seed_reason_codes           reason codes (credit memo, reversal, period reopen, ...)
--   * gl.fn_mn_ensure_fiscal_year(year)          fiscal year + 12 monthly periods + 12 VAT return periods
--   * bank.fn_mn_seed_cash_account               default cash box CASH01 with its МХ-1 / МХ-2 series (D-G1)
--   * gl.fn_mn_seed_journals                     journal templates/batches GENERAL, CASH_RECEIPT, PAYMENT, OPENING, CLOSING
--   * gl.fn_mn_seed_gl_setup                     G/L setup: retained earnings 3400, current-year result 3500 (D-D4),
--                                                rounding 8290, cash over/short 8240/8440, FX 8500/8510
--   * party.fn_mn_seed_payment_methods           CASH, BANK, CARD, QPAY (+ eBarimt payments[].code) and party templates
--   * platform.fn_mn_seed_module_setups          sales/purchase/inventory setup, eBarimt POS (+ setup when TIN known),
--                                                bank text-to-account rules
--
-- Numbering (D-C7): legal documents use GAPLESS series PREFIX-YYYY-##### that restart every year (reset_yearly:
-- a line per year must exist, otherwise posting fails with ERN01 instead of continuing last year's prefix).
-- Provisioning creates the lines of the first fiscal year and of the next one; call
-- platform.fn_mn_ensure_number_series(<year>) and gl.fn_mn_ensure_fiscal_year(<year>) before each new year
-- (the year-end close job does it). Drafts and master data use non-gapless series (gaps allowed).
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- -----------------------------------------------------------------------------
-- Number series
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_mn_number_series_def()
RETURNS TABLE (code text, description text, gapless boolean, yearly boolean, manual boolean, kind text, prefix text, width smallint)
LANGUAGE sql IMMUTABLE AS $$
    SELECT * FROM (VALUES
        -- legal documents: gapless, PREFIX-YYYY-##### (D-C7)
        ('SI',        'Борлуулалтын нэхэмжлэх (батлагдсан, ТМ-1)',  true,  true,  false, 'POSTED_SALES_INVOICE',   'SI', 5::smallint),
        ('SC',        'Борлуулалтын кредит нот (батлагдсан)',       true,  true,  false, 'POSTED_SALES_CR_MEMO',   'SC', 5::smallint),
        ('PI',        'Худалдан авалтын нэхэмжлэх (батлагдсан)',    true,  true,  false, 'POSTED_PURCH_INVOICE',   'PI', 5::smallint),
        ('PC',        'Худалдан авалтын кредит нот (батлагдсан)',   true,  true,  false, 'POSTED_PURCH_CR_MEMO',   'PC', 5::smallint),
        ('KO',        'Кассын орлогын баримт (МХ-1)',               true,  true,  false, 'CASH_RECEIPT',           'KO', 5::smallint),
        ('KZ',        'Кассын зарлагын баримт (МХ-2)',              true,  true,  false, 'CASH_PAYMENT',           'KZ', 5::smallint),
        ('BR',        'Банкны орлогын ваучер',                      true,  true,  false, 'BANK_RECEIPT',           'BR', 5::smallint),
        ('BP',        'Банкны зарлагын ваучер',                     true,  true,  false, 'BANK_PAYMENT',           'BP', 5::smallint),
        ('GJ',        'Ерөнхий журналын ваучер',                    true,  true,  false, 'JOURNAL_VOUCHER',        'GJ', 5::smallint),
        ('OB',        'Эхний үлдэгдлийн ваучер',                    true,  true,  false, 'OPENING_VOUCHER',        'OB', 5::smallint),
        ('CL',        'Жилийн хаалтын ваучер',                      true,  true,  false, 'CLOSING_VOUCHER',        'CL', 5::smallint),
        -- drafts: sequence, gaps allowed (D-C7)
        ('SI_DRAFT',  'Борлуулалтын нэхэмжлэхийн ноорог',           false, false, false, 'SALES_INVOICE_DRAFT',    'DSI-', 6::smallint),
        ('SC_DRAFT',  'Борлуулалтын кредит нотын ноорог',           false, false, false, 'SALES_CR_MEMO_DRAFT',    'DSC-', 6::smallint),
        ('PI_DRAFT',  'Худалдан авалтын нэхэмжлэхийн ноорог',       false, false, false, 'PURCH_INVOICE_DRAFT',    'DPI-', 6::smallint),
        ('PC_DRAFT',  'Худалдан авалтын кредит нотын ноорог',       false, false, false, 'PURCH_CR_MEMO_DRAFT',    'DPC-', 6::smallint),
        ('JNL_DRAFT', 'Журналын мөрийн ноорог дугаар',              false, false, false, 'JOURNAL_DRAFT',          'J-',   6::smallint),
        -- master data (manual numbers allowed)
        ('CUST',      'Харилцагчийн дугаар',                        false, false, true,  'CUSTOMER',               'C',  5::smallint),
        ('VEND',      'Нийлүүлэгчийн дугаар',                       false, false, true,  'VENDOR',                 'V',  5::smallint),
        ('ITEM',      'Бараа, үйлчилгээний дугаар',                 false, false, true,  'ITEM',                   'I',  5::smallint),
        ('FA',        'Үндсэн хөрөнгийн дугаар',                    false, false, true,  'FIXED_ASSET',            'FA', 5::smallint)
    ) AS v(code, description, gapless, yearly, manual, kind, prefix, width)
$$;
COMMENT ON FUNCTION platform.fn_mn_number_series_def() IS 'MN localization package: definition of the number series (code, gapless, yearly reset, document kind, prefix, width). Data only.';
GRANT EXECUTE ON FUNCTION platform.fn_mn_number_series_def() TO app_user;

CREATE OR REPLACE FUNCTION platform.fn_mn_ensure_number_series(p_year integer) RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO platform.number_series (tenant_id, company_id, code, description, default_nos, manual_nos, date_order,
                                        gapless, reset_yearly, document_kind)
    SELECT v_tenant, v_company, d.code, d.description, true, d.manual, d.gapless, d.gapless, d.yearly, d.kind
      FROM platform.fn_mn_number_series_def() d
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- yearly line of p_year (line_no = year, prefix SI-2026-) / one open-ended line for the other series
    INSERT INTO platform.number_series_line (tenant_id, company_id, number_series_id, line_no, starting_date, prefix, width, starting_no)
    SELECT v_tenant, v_company, s.id,
           CASE WHEN d.yearly THEN p_year ELSE 1 END,
           CASE WHEN d.yearly THEN make_date(p_year, 1, 1) ELSE DATE '2000-01-01' END,
           CASE WHEN d.yearly THEN d.prefix || '-' || p_year || '-' ELSE d.prefix END,
           d.width, 1
      FROM platform.fn_mn_number_series_def() d
      JOIN platform.number_series s ON s.company_id = v_company AND s.code = d.code
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION platform.fn_mn_ensure_number_series(integer) IS
    'MN localization package: number series of the current company (gapless PREFIX-YYYY-##### for legal documents, D-C7) and their lines for p_year. Idempotent; call once per new year.';
GRANT EXECUTE ON FUNCTION platform.fn_mn_ensure_number_series(integer) TO app_user;

-- -----------------------------------------------------------------------------
-- Reason codes (BC T231): required on credit memos, reversals and period reopen
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_mn_seed_reason_codes() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_rows integer;
BEGIN
    INSERT INTO platform.reason_code (tenant_id, company_id, code, description, description_en)
    SELECT platform.current_tenant_id(), platform.current_company_id(), v.code, v.descr, v.descr_en
      FROM (VALUES ('RETURN',      'Бараа буцаалт',                             'Goods returned'),
                   ('PRICE_ADJ',   'Үнийн тохируулга, хөнгөлөлт',               'Price adjustment or discount'),
                   ('CANCEL',      'Нэхэмжлэх цуцлах (бүтэн кредит нот)',       'Invoice cancellation'),
                   ('CORRECTION',  'Алдаа засах',                               'Correction of an error'),
                   ('REVERSAL',    'Журналын гүйлгээ буцаах',                   'Journal reversal'),
                   ('REOPEN',      'Хаасан үеийг дахин нээх (D-D3)',            'Reopen a closed period'),
                   ('WRITE_OFF',   'Найдваргүй авлага данснаас хасах',          'Bad debt write-off'),
                   ('CASH_DIFF',   'Кассын тооллогын зөрүү',                    'Cash count difference'),
                   ('INV_COUNT',   'Бараа материалын тооллогын зөрүү',          'Inventory count difference'),
                   ('EBARIMT_FIX', 'eBarimt баримтын засвар (inactiveId)',      'eBarimt receipt correction'),
                   ('OPENING',     'Эхний үлдэгдэл оруулах',                    'Opening balances')) AS v(code, descr, descr_en)
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION platform.fn_mn_seed_reason_codes() IS 'MN localization package: reason codes of the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION platform.fn_mn_seed_reason_codes() TO app_user;

-- -----------------------------------------------------------------------------
-- Fiscal year (calendar year by law) + 12 periods + VAT return periods
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gl.fn_mn_ensure_fiscal_year(p_year integer) RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_rows integer := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM gl.fiscal_year WHERE company_id = platform.current_company_id() AND year = p_year) THEN
        PERFORM gl.fn_create_fiscal_year(p_year);       -- BC Report 93: fiscal year + 12 monthly periods
        v_rows := 13;
    END IF;
    v_rows := v_rows + tax.fn_mn_ensure_vat_return_periods(p_year);
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION gl.fn_mn_ensure_fiscal_year(integer) IS
    'Creates the fiscal year p_year with its 12 monthly accounting periods and VAT return periods for the current company when missing. Idempotent.';
GRANT EXECUTE ON FUNCTION gl.fn_mn_ensure_fiscal_year(integer) TO app_user;

-- -----------------------------------------------------------------------------
-- Default cash box (bank_account kind CASH, D-G1: never negative) with its gapless МХ-1 / МХ-2 series
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bank.fn_mn_seed_cash_account() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_company uuid := platform.current_company_id();
    v_rows    integer;
BEGIN
    INSERT INTO bank.bank_account (tenant_id, company_id, no, name, kind, bank_account_posting_group_id,
                                   prevent_negative_balance, cash_receipt_no_series_id, cash_payment_no_series_id)
    SELECT platform.current_tenant_id(), v_company, 'CASH01', 'Үндсэн касс', 'CASH', g.id, true, ko.id, kz.id
      FROM bank.bank_account_posting_group g
      JOIN platform.number_series ko ON ko.company_id = v_company AND ko.code = 'KO'
      JOIN platform.number_series kz ON kz.company_id = v_company AND kz.code = 'KZ'
     WHERE g.company_id = v_company AND g.code = 'CASH_MNT'
    ON CONFLICT (company_id, no) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION bank.fn_mn_seed_cash_account() IS 'MN localization package: default cash box CASH01 (G/L 1100, МХ-1 series KO, МХ-2 series KZ) of the current company. Inserts it when missing.';
GRANT EXECUTE ON FUNCTION bank.fn_mn_seed_cash_account() TO app_user;

-- -----------------------------------------------------------------------------
-- Journal templates and batches (BC T80/T232). posting_no_series = the gapless voucher series.
-- The CASH batches balance against the cash box and number their vouchers with МХ-1 / МХ-2 directly.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gl.fn_mn_seed_journals() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO gl.journal_template (tenant_id, company_id, code, description, template_type, source_code,
                                     no_series_id, posting_no_series_id)
    SELECT v_tenant, v_company, v.code, v.descr, v.ttype, v.src, d.id, p.id
      FROM (VALUES ('GENERAL',      'Ерөнхий журнал',                 'GENERAL',       'GENJNL',     'GJ'),
                   ('CASH_RECEIPT', 'Мөнгөн орлогын журнал',          'CASH_RECEIPTS', 'CASHRECJNL', 'BR'),
                   ('PAYMENT',      'Төлбөрийн журнал',               'PAYMENTS',      'PAYMENTJNL', 'BP'),
                   ('OPENING',      'Эхний үлдэгдлийн журнал (D-D7)', 'OPENING',       'OPENING',    'OB'),
                   ('CLOSING',      'Жилийн хаалтын журнал (D-D4)',   'GENERAL',       'CLSINCOME',  'CL')) AS v(code, descr, ttype, src, series)
      JOIN platform.number_series d ON d.company_id = v_company AND d.code = 'JNL_DRAFT'
      JOIN platform.number_series p ON p.company_id = v_company AND p.code = v.series
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO gl.journal_batch (tenant_id, company_id, journal_template_id, code, description, bal_account_type,
                                  bal_account_id, posting_no_series_id, reason_code_id)
    SELECT v_tenant, v_company, t.id, v.code, v.descr,
           CASE WHEN v.cash THEN 'BANK_ACCOUNT' END, CASE WHEN v.cash THEN c.id END,
           p.id, r.id
      FROM (VALUES ('GENERAL',      'DEFAULT',  'Үндсэн',                           false, NULL, NULL),
                   ('CASH_RECEIPT', 'BANK',     'Банкны орлого',                    false, NULL, NULL),
                   ('CASH_RECEIPT', 'CASH',     'Кассын орлого (МХ-1)',             true,  'KO', NULL),
                   ('PAYMENT',      'BANK',     'Банкны зарлага',                   false, NULL, NULL),
                   ('PAYMENT',      'CASH',     'Кассын зарлага (МХ-2)',            true,  'KZ', NULL),
                   ('OPENING',      'DEFAULT',  'Эхний үлдэгдэл',                   false, NULL, 'OPENING'),
                   ('CLOSING',      'YEAR_END', 'Орлого, зардлын хаалт (12-31)',    false, NULL, NULL)) AS v(tmpl, code, descr, cash, series, reason)
      JOIN gl.journal_template t ON t.company_id = v_company AND t.code = v.tmpl
      LEFT JOIN bank.bank_account c ON c.company_id = v_company AND c.no = 'CASH01'
      LEFT JOIN platform.number_series p ON p.company_id = v_company AND p.code = v.series
      LEFT JOIN platform.reason_code r ON r.company_id = v_company AND r.code = v.reason
     WHERE NOT v.cash OR c.id IS NOT NULL
    ON CONFLICT (company_id, journal_template_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION gl.fn_mn_seed_journals() IS 'MN localization package: journal templates GENERAL, CASH_RECEIPT, PAYMENT, OPENING, CLOSING and their batches for the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION gl.fn_mn_seed_journals() TO app_user;

-- -----------------------------------------------------------------------------
-- General ledger setup (singleton created by gl.fn_initialize_company): fills empty account fields only.
-- LCY = MNT and amount precision 0.01 live in platform.company_setup (D-C2).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gl.fn_mn_seed_gl_setup() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_rows integer;
BEGIN
    UPDATE gl.general_ledger_setup s
       SET retained_earnings_account_id   = coalesce(s.retained_earnings_account_id,   gl.fn_mn_account_id('3400')),
           current_year_result_account_id = coalesce(s.current_year_result_account_id, gl.fn_mn_account_id('3500')),
           invoice_rounding_account_id    = coalesce(s.invoice_rounding_account_id,    gl.fn_mn_account_id('8290')),
           cash_over_account_id           = coalesce(s.cash_over_account_id,           gl.fn_mn_account_id('8240')),
           cash_short_account_id          = coalesce(s.cash_short_account_id,          gl.fn_mn_account_id('8440')),
           realized_fx_gain_account_id    = coalesce(s.realized_fx_gain_account_id,    gl.fn_mn_account_id('8500')),
           realized_fx_loss_account_id    = coalesce(s.realized_fx_loss_account_id,    gl.fn_mn_account_id('8500')),
           unrealized_fx_gain_account_id  = coalesce(s.unrealized_fx_gain_account_id,  gl.fn_mn_account_id('8510')),
           unrealized_fx_loss_account_id  = coalesce(s.unrealized_fx_loss_account_id,  gl.fn_mn_account_id('8510'))
     WHERE s.company_id = platform.current_company_id()
       AND (s.retained_earnings_account_id IS NULL OR s.current_year_result_account_id IS NULL
            OR s.invoice_rounding_account_id IS NULL OR s.cash_over_account_id IS NULL OR s.cash_short_account_id IS NULL
            OR s.realized_fx_gain_account_id IS NULL OR s.realized_fx_loss_account_id IS NULL
            OR s.unrealized_fx_gain_account_id IS NULL OR s.unrealized_fx_loss_account_id IS NULL);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION gl.fn_mn_seed_gl_setup() IS 'MN localization package: fills the empty account fields of the G/L setup (3400, 3500, 8290, 8240, 8440, 8500, 8510). Never overwrites a value.';
GRANT EXECUTE ON FUNCTION gl.fn_mn_seed_gl_setup() TO app_user;

-- -----------------------------------------------------------------------------
-- Payment methods (BC T289 + eBarimt payments[].code) and customer / vendor templates (BC T1381/T1383)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION party.fn_mn_seed_payment_methods() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    -- Only CASH gets a balancing account (the default cash box, D-F5 cash sale). BANK / CARD / QPAY get theirs
    -- when the company registers the bank account / card acquirer / QPay wallet (wizard step "касс ба банк").
    INSERT INTO party.payment_method (tenant_id, company_id, code, description, description_en, bal_account_type,
                                      bal_account_id, ebarimt_payment_code)
    SELECT v_tenant, v_company, v.code, v.descr, v.descr_en,
           CASE WHEN v.cash AND c.id IS NOT NULL THEN 'BANK_ACCOUNT' END, CASE WHEN v.cash THEN c.id END, v.ebarimt
      FROM (VALUES ('CASH', 'Бэлэн мөнгө',              'Cash',              true,  'CASH'),
                   ('BANK', 'Банкны шилжүүлэг',         'Bank transfer',     false, 'BANK_TRANSFER'),
                   ('CARD', 'Төлбөрийн карт (POS)',     'Payment card',      false, 'PAYMENT_CARD'),
                   ('QPAY', 'QPay',                     'QPay',              false, 'BANK_TRANSFER_QPAY')) AS v(code, descr, descr_en, cash, ebarimt)
      LEFT JOIN bank.bank_account c ON c.company_id = v_company AND c.no = 'CASH01'
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO party.customer_template (tenant_id, company_id, code, description, kind, customer_posting_group_id,
                                         gen_bus_posting_group_id, vat_bus_posting_group_id, payment_terms_id,
                                         payment_method_id, prices_including_vat, no_series_id)
    SELECT v_tenant, v_company, v.code, v.descr, v.kind, cpg.id, gb.id, vb.id, pt.id, pm.id, v.incl_vat, ns.id
      FROM (VALUES ('B2C',      'Иргэн (B2C, eBarimt B2C_RECEIPT)',      'INDIVIDUAL', 'DOMESTIC', 'DOMESTIC', 'DOMESTIC', 'CASH',  'CASH', true),
                   ('B2B',      'ААН (ТТД-тэй, eBarimt B2B_RECEIPT)',    'LEGAL',      'DOMESTIC', 'DOMESTIC', 'DOMESTIC', 'NET30', 'BANK', false),
                   ('FOREIGN',  'Гадаадын худалдан авагч (экспорт)',     'FOREIGN',    'FOREIGN',  'EXPORT',   'EXPORT',   'NET30', 'BANK', false),
                   ('EMPLOYEE', 'Ажилтан (ажилтнаас авах авлага)',       'INDIVIDUAL', 'EMPLOYEE', 'DOMESTIC', 'DOMESTIC', 'CASH',  'CASH', true)
           ) AS v(code, descr, kind, cpg, gbpg, vbpg, terms, method, incl_vat)
      JOIN party.customer_posting_group cpg ON cpg.company_id = v_company AND cpg.code = v.cpg
      JOIN party.gen_bus_posting_group gb ON gb.company_id = v_company AND gb.code = v.gbpg
      JOIN tax.vat_bus_posting_group vb ON vb.company_id = v_company AND vb.code = v.vbpg
      JOIN party.payment_terms pt ON pt.company_id = v_company AND pt.code = v.terms
      JOIN party.payment_method pm ON pm.company_id = v_company AND pm.code = v.method
      LEFT JOIN platform.number_series ns ON ns.company_id = v_company AND ns.code = 'CUST'
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO party.vendor_template (tenant_id, company_id, code, description, kind, vendor_posting_group_id,
                                       gen_bus_posting_group_id, vat_bus_posting_group_id, payment_terms_id,
                                       payment_method_id, prices_including_vat, no_series_id)
    SELECT v_tenant, v_company, v.code, v.descr, v.kind, vpg.id, gb.id, vb.id, pt.id, pm.id, v.incl_vat, ns.id
      FROM (VALUES ('DOMESTIC_VAT', 'Дотоодын НӨАТ төлөгч нийлүүлэгч (ДДТД шаардана)', 'LEGAL',      'DOMESTIC', 'DOMESTIC', 'DOMESTIC', 'NET30', 'BANK', false),
                   ('NONVAT',       'НӨАТ төлөгч бус нийлүүлэгч',                       'LEGAL',      'DOMESTIC', 'DOMESTIC', 'NONREG',   'NET30', 'BANK', false),
                   ('FOREIGN',      'Гадаадын нийлүүлэгч (импорт)',                     'FOREIGN',    'FOREIGN',  'EXPORT',   'IMPORT',   'NET30', 'BANK', false),
                   ('CUSTOMS',      'Гаалийн байгууллага (импортын НӨАТ)',              'LEGAL',      'CUSTOMS',  'DOMESTIC', 'IMPORT',   'CASH',  'BANK', false),
                   ('EMPLOYEE',     'Ажилтан (тайлант тооцоо)',                         'INDIVIDUAL', 'EMPLOYEE', 'DOMESTIC', 'NONREG',   'CASH',  'CASH', false)
           ) AS v(code, descr, kind, vpg, gbpg, vbpg, terms, method, incl_vat)
      JOIN party.vendor_posting_group vpg ON vpg.company_id = v_company AND vpg.code = v.vpg
      JOIN party.gen_bus_posting_group gb ON gb.company_id = v_company AND gb.code = v.gbpg
      JOIN tax.vat_bus_posting_group vb ON vb.company_id = v_company AND vb.code = v.vbpg
      JOIN party.payment_terms pt ON pt.company_id = v_company AND pt.code = v.terms
      JOIN party.payment_method pm ON pm.company_id = v_company AND pm.code = v.method
      LEFT JOIN platform.number_series ns ON ns.company_id = v_company AND ns.code = 'VEND'
    ON CONFLICT (company_id, code) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION party.fn_mn_seed_payment_methods() IS 'MN localization package: payment methods (eBarimt payment codes) and customer/vendor templates of the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION party.fn_mn_seed_payment_methods() TO app_user;

-- -----------------------------------------------------------------------------
-- Module setups: sales, purchase, inventory, eBarimt POS (+ merchant setup when TIN and district are known),
-- bank statement text rules (BC T1251)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.fn_mn_seed_module_setups() RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_tenant  uuid := platform.current_tenant_id();
    v_company uuid := platform.current_company_id();
    v_rows    integer := 0;
    n         integer;
BEGIN
    INSERT INTO sales.sales_setup (tenant_id, company_id, customer_nos_id, invoice_nos_id, credit_memo_nos_id,
                                   posted_invoice_nos_id, posted_credit_memo_nos_id)
    SELECT v_tenant, v_company,
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'CUST'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'SI_DRAFT'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'SC_DRAFT'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'SI'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'SC')
    ON CONFLICT (company_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO purchase.purchase_setup (tenant_id, company_id, vendor_nos_id, invoice_nos_id, credit_memo_nos_id,
                                         posted_invoice_nos_id, posted_credit_memo_nos_id)
    SELECT v_tenant, v_company,
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'VEND'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'PI_DRAFT'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'PC_DRAFT'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'PI'),
           (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'PC')
    ON CONFLICT (company_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO inv.inventory_setup (tenant_id, company_id, inventory_enabled, item_nos_id)
    SELECT v_tenant, v_company, false, (SELECT id FROM platform.number_series WHERE company_id = v_company AND code = 'ITEM')
    ON CONFLICT (company_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- eBarimt: logical POS 001 settling into the cash box; the merchant setup needs the TIN and district code
    INSERT INTO ebarimt.ebarimt_pos (tenant_id, company_id, pos_no, branch_no, description, bank_account_id, is_default)
    SELECT v_tenant, v_company, '001', '001', 'Үндсэн касс (POS 001)',
           (SELECT id FROM bank.bank_account WHERE company_id = v_company AND no = 'CASH01'), true
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    INSERT INTO ebarimt.ebarimt_setup (tenant_id, company_id, enabled, environment, merchant_tin, merchant_name,
                                       district_code, vat_payer, city_tax_payer)
    SELECT v_tenant, v_company, false, 'STAGING', cs.tin, cs.legal_name, cs.district_code, cs.vat_registered, cs.city_tax_payer
      FROM platform.company_setup cs
     WHERE cs.company_id = v_company AND cs.tin IS NOT NULL AND cs.district_code IS NOT NULL
    ON CONFLICT (company_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;

    -- Bank statement text rules (FR-BNK-012 AC1: "ШИМТГЭЛ" -> 8300 Дт / 1110 Кт). BC T1251 semantics (R-BANK-CASH-29,
    -- 03-domain-model "="): debit_account_id is used for an INFLOW (statement amount > 0), credit_account_id for an
    -- OUTFLOW. A bank fee is an outflow -> credit_account_id; deposit interest is an inflow -> debit_account_id.
    INSERT INTO bank.text_to_account_mapping (tenant_id, company_id, line_no, mapping_text, debit_account_id, credit_account_id)
    SELECT v_tenant, v_company, v.line_no, v.txt, gl.fn_mn_account_id(v.inflow), gl.fn_mn_account_id(v.outflow)
      FROM (VALUES (10000, 'ШИМТГЭЛ',          NULL,   '8300'),
                   (20000, 'ХАДГАЛАМЖИЙН ХҮҮ', '8110', NULL),
                   (30000, 'ХҮҮНИЙ ОРЛОГО',    '8110', NULL)) AS v(line_no, txt, inflow, outflow)
    ON CONFLICT (company_id, line_no) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; v_rows := v_rows + n;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION platform.fn_mn_seed_module_setups() IS 'MN localization package: sales/purchase/inventory setup, eBarimt POS 001 (+ merchant setup when TIN and district are known) and bank text rules of the current company. Inserts missing rows only.';
GRANT EXECUTE ON FUNCTION platform.fn_mn_seed_module_setups() TO app_user;
