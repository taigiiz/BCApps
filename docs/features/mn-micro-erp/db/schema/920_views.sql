-- =============================================================================
-- 920_views.sql
-- Read models replacing BC FlowFields: G/L balances by period, trial balance base,
-- customer/vendor balances from detailed entries, open items, bank balances, aging,
-- and consistency checks used by tests and the nightly integrity job.
-- All views are security_invoker, so the caller's RLS context applies.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- G/L account net change per accounting period (BC G/L Account "Net Change" with a period Date Filter).
CREATE VIEW gl.v_gl_account_period_balance WITH (security_invoker = true) AS
SELECT e.tenant_id, e.company_id, e.gl_account_id, a.no AS gl_account_no, a.name AS gl_account_name,
       p.id AS accounting_period_id, p.starting_date, p.ending_date,
       sum(e.amount) FILTER (WHERE NOT e.is_closing)        AS net_change,
       sum(e.debit_amount) FILTER (WHERE NOT e.is_closing)  AS debit_amount,
       sum(e.credit_amount) FILTER (WHERE NOT e.is_closing) AS credit_amount,
       sum(e.amount) FILTER (WHERE e.is_closing)            AS closing_amount
  FROM gl.gl_entry e
  JOIN gl.gl_account a ON a.company_id = e.company_id AND a.id = e.gl_account_id
  JOIN gl.accounting_period p ON p.company_id = e.company_id AND e.posting_date BETWEEN p.starting_date AND p.ending_date
 GROUP BY e.tenant_id, e.company_id, e.gl_account_id, a.no, a.name, p.id, p.starting_date, p.ending_date;
COMMENT ON VIEW gl.v_gl_account_period_balance IS 'Per account and accounting period: net change, debit, credit (closing entries separated, D-D4).';

-- Daily aggregate: the base for trial balance, balance-at-date and the report engine.
CREATE VIEW rpt.v_trial_balance_base WITH (security_invoker = true) AS
SELECT e.tenant_id, e.company_id, e.gl_account_id, e.posting_date, e.is_closing,
       sum(e.amount) AS net_amount, sum(e.debit_amount) AS debit_amount, sum(e.credit_amount) AS credit_amount,
       count(*) AS entry_count
  FROM gl.gl_entry e
 GROUP BY e.tenant_id, e.company_id, e.gl_account_id, e.posting_date, e.is_closing;
COMMENT ON VIEW rpt.v_trial_balance_base IS 'Daily G/L aggregate per account and closing flag; trial balance = opening (< from) + period (from..to) + closing balance.';

-- Trial balance (эргэлтийн тайлан) for the current company. CR #117/#123/#205/#217 (SCR-RPT-01, BR-RPT-11, GS-CLOSE-004):
-- BC C-date semantics - the opening balance is every entry dated before p_from INCLUDING earlier closing entries
-- (so income-statement accounts open at zero once the previous year is closed, and 3500/3400 open correctly);
-- p_include_closing only controls the closing entries dated p_to. Optional global-dimension filters.
-- (A migration from the earlier 3-argument version must DROP FUNCTION rpt.fn_trial_balance(date, date, boolean)
--  first, otherwise 3-argument calls become ambiguous.)
CREATE FUNCTION rpt.fn_trial_balance(p_from date, p_to date, p_include_closing boolean DEFAULT false,
                                     p_dim1 uuid DEFAULT NULL, p_dim2 uuid DEFAULT NULL)
RETURNS TABLE (gl_account_id uuid, gl_account_no text, gl_account_name text, income_balance text,
               opening_balance numeric, period_debit numeric, period_credit numeric, closing_balance numeric)
LANGUAGE sql STABLE AS $$
    WITH agg AS (
        SELECT e.gl_account_id,
               sum(e.amount) FILTER (WHERE e.posting_date < p_from)                                  AS opening,
               sum(e.debit_amount) FILTER (WHERE e.posting_date >= p_from
                       AND (p_include_closing OR NOT (e.posting_date = p_to AND e.is_closing)))     AS p_debit,
               sum(e.credit_amount) FILTER (WHERE e.posting_date >= p_from
                       AND (p_include_closing OR NOT (e.posting_date = p_to AND e.is_closing)))     AS p_credit
          FROM gl.gl_entry e
         WHERE e.company_id = platform.current_company_id()
           AND e.posting_date <= p_to
           AND (p_dim1 IS NULL OR e.global_dim_1_value_id = p_dim1)
           AND (p_dim2 IS NULL OR e.global_dim_2_value_id = p_dim2)
         GROUP BY e.gl_account_id)
    SELECT a.id, a.no::text, a.name, a.income_balance,
           coalesce(g.opening, 0), coalesce(g.p_debit, 0), coalesce(g.p_credit, 0),
           coalesce(g.opening, 0) + coalesce(g.p_debit, 0) - coalesce(g.p_credit, 0)
      FROM gl.gl_account a
      LEFT JOIN agg g ON g.gl_account_id = a.id
     WHERE a.company_id = platform.current_company_id() AND a.account_type = 'POSTING'
     ORDER BY a.no
$$;
COMMENT ON FUNCTION rpt.fn_trial_balance(date, date, boolean, uuid, uuid) IS 'Trial balance for the current company with BC C-date semantics (research §5.1): opening includes all earlier closing entries; p_include_closing adds the closing entries dated p_to; optional global dimension 1/2 value filters.';

-- Customer balances from detailed entries (BC Customer.Balance (LCY) FlowField over T379). party schema (D-K2).
CREATE VIEW party.v_customer_balance WITH (security_invoker = true) AS
SELECT c.tenant_id, c.company_id, c.id AS customer_id, c.no AS customer_no, c.name AS customer_name,
       coalesce(sum(d.amount_lcy), 0) AS balance_lcy,
       coalesce(sum(d.amount_lcy) FILTER (WHERE d.entry_type = 'INITIAL' AND d.amount_lcy > 0), 0) AS invoiced_lcy
  FROM party.customer c
  LEFT JOIN party.detailed_cust_ledger_entry d ON d.company_id = c.company_id AND d.customer_id = c.id
 GROUP BY c.tenant_id, c.company_id, c.id, c.no, c.name;
COMMENT ON VIEW party.v_customer_balance IS 'Customer balance (LCY) = sum of detailed customer ledger entries (D-F3).';

CREATE VIEW party.v_cust_open_entry WITH (security_invoker = true) AS
SELECT e.tenant_id, e.company_id, e.entry_no, e.customer_id, e.customer_no, e.posting_date, e.due_date,
       e.document_type, e.document_no, e.currency_code, e.amount, e.amount_lcy,
       e.remaining_amount, e.remaining_amount_lcy, (current_date - e.due_date) AS days_overdue
  FROM party.cust_ledger_entry e
 WHERE e.open;
COMMENT ON VIEW party.v_cust_open_entry IS 'Open receivables (BC Cust. Ledger Entries with Open = true).';

CREATE VIEW party.v_cust_ledger_entry_check WITH (security_invoker = true) AS
SELECT e.tenant_id, e.company_id, e.entry_no, e.remaining_amount, e.remaining_amount_lcy, e.open,
       coalesce(sum(d.amount), 0) AS detailed_remaining, coalesce(sum(d.amount_lcy), 0) AS detailed_remaining_lcy
  FROM party.cust_ledger_entry e
  LEFT JOIN party.detailed_cust_ledger_entry d ON d.company_id = e.company_id AND d.cust_ledger_entry_no = e.entry_no
 GROUP BY e.tenant_id, e.company_id, e.entry_no, e.remaining_amount, e.remaining_amount_lcy, e.open
HAVING e.remaining_amount <> coalesce(sum(d.amount), 0)
    OR e.remaining_amount_lcy <> coalesce(sum(d.amount_lcy), 0)
    OR e.open <> (coalesce(sum(d.amount), 0) <> 0);
COMMENT ON VIEW party.v_cust_ledger_entry_check IS 'Integrity check INV-04: rows where the cached remaining amount differs from the detailed entries (must be empty).';

-- Aging (D-F7) for receivables and payables: remaining per open item as of a date, bucketed by the
-- default rpt.aging_bucket_set of the current company.
-- CR #137 (SCR-SAL-02, D-F7): as-of date, optional bucket set (default set when NULL) and optional customer.
CREATE FUNCTION party.fn_customer_aging(p_as_of date, p_aging_bucket_set_id uuid DEFAULT NULL, p_customer_id uuid DEFAULT NULL)
RETURNS TABLE (customer_id uuid, cust_ledger_entry_no bigint, document_no text, due_date date,
               remaining_lcy numeric, days_overdue integer, bucket_seq smallint, bucket_label text)
LANGUAGE sql STABLE AS $$
    WITH rem AS (
        SELECT e.customer_id, e.entry_no, e.document_no::text, e.due_date, e.posting_date, e.document_date,
               sum(d.amount_lcy) AS remaining_lcy
          FROM party.cust_ledger_entry e
          JOIN party.detailed_cust_ledger_entry d ON d.company_id = e.company_id AND d.cust_ledger_entry_no = e.entry_no
         WHERE e.company_id = platform.current_company_id() AND e.posting_date <= p_as_of AND d.posting_date <= p_as_of
           AND (p_customer_id IS NULL OR e.customer_id = p_customer_id)
         GROUP BY e.customer_id, e.entry_no, e.document_no, e.due_date, e.posting_date, e.document_date
        HAVING sum(d.amount_lcy) <> 0),
    s AS (SELECT id, basis FROM rpt.aging_bucket_set
           WHERE company_id = platform.current_company_id()
             AND CASE WHEN p_aging_bucket_set_id IS NULL THEN is_default ELSE id = p_aging_bucket_set_id END),
    r AS (SELECT rem.*, (p_as_of - CASE s.basis WHEN 'POSTING_DATE' THEN rem.posting_date
                                                WHEN 'DOCUMENT_DATE' THEN coalesce(rem.document_date, rem.posting_date)
                                                ELSE rem.due_date END)::integer AS days, s.id AS set_id
            FROM rem LEFT JOIN s ON true)
    SELECT r.customer_id, r.entry_no, r.document_no, r.due_date, r.remaining_lcy, r.days, b.sequence_no, b.label
      FROM r
      LEFT JOIN LATERAL (
            SELECT ab.sequence_no, ab.label FROM rpt.aging_bucket ab
             WHERE ab.company_id = platform.current_company_id() AND ab.aging_bucket_set_id = r.set_id
               AND (ab.from_days IS NULL OR r.days >= ab.from_days) AND (ab.to_days IS NULL OR r.days <= ab.to_days)
             ORDER BY ab.sequence_no LIMIT 1) b ON true
$$;
COMMENT ON FUNCTION party.fn_customer_aging(date, uuid, uuid) IS 'AR aging as of a date for the current company (remaining = detailed entries <= as-of, so past dates are exact), bucketed by the given or the default aging_bucket_set (D-F7); optional customer filter.';

CREATE FUNCTION party.fn_vendor_aging(p_as_of date, p_aging_bucket_set_id uuid DEFAULT NULL, p_vendor_id uuid DEFAULT NULL)
RETURNS TABLE (vendor_id uuid, vendor_ledger_entry_no bigint, document_no text, external_document_no text, due_date date,
               remaining_lcy numeric, days_overdue integer, bucket_seq smallint, bucket_label text)
LANGUAGE sql STABLE AS $$
    WITH rem AS (
        SELECT e.vendor_id, e.entry_no, e.document_no::text, e.external_document_no::text AS ext_no, e.due_date,
               e.posting_date, e.document_date, sum(d.amount_lcy) AS remaining_lcy
          FROM party.vendor_ledger_entry e
          JOIN party.detailed_vendor_ledger_entry d ON d.company_id = e.company_id AND d.vendor_ledger_entry_no = e.entry_no
         WHERE e.company_id = platform.current_company_id() AND e.posting_date <= p_as_of AND d.posting_date <= p_as_of
           AND (p_vendor_id IS NULL OR e.vendor_id = p_vendor_id)
         GROUP BY e.vendor_id, e.entry_no, e.document_no, e.external_document_no, e.due_date, e.posting_date, e.document_date
        HAVING sum(d.amount_lcy) <> 0),
    s AS (SELECT id, basis FROM rpt.aging_bucket_set
           WHERE company_id = platform.current_company_id()
             AND CASE WHEN p_aging_bucket_set_id IS NULL THEN is_default ELSE id = p_aging_bucket_set_id END),
    r AS (SELECT rem.*, (p_as_of - CASE s.basis WHEN 'POSTING_DATE' THEN rem.posting_date
                                                WHEN 'DOCUMENT_DATE' THEN coalesce(rem.document_date, rem.posting_date)
                                                ELSE rem.due_date END)::integer AS days, s.id AS set_id
            FROM rem LEFT JOIN s ON true)
    SELECT r.vendor_id, r.entry_no, r.document_no, r.ext_no, r.due_date, r.remaining_lcy, r.days, b.sequence_no, b.label
      FROM r
      LEFT JOIN LATERAL (
            SELECT ab.sequence_no, ab.label FROM rpt.aging_bucket ab
             WHERE ab.company_id = platform.current_company_id() AND ab.aging_bucket_set_id = r.set_id
               AND (ab.from_days IS NULL OR r.days >= ab.from_days) AND (ab.to_days IS NULL OR r.days <= ab.to_days)
             ORDER BY ab.sequence_no LIMIT 1) b ON true
$$;
COMMENT ON FUNCTION party.fn_vendor_aging(date, uuid, uuid) IS 'AP aging as of a date for the current company (remaining credit-negative, BC sign), bucketed like the AR aging (D-F7); optional bucket set and vendor.';

-- Vendor side
CREATE VIEW party.v_vendor_balance WITH (security_invoker = true) AS
SELECT v.tenant_id, v.company_id, v.id AS vendor_id, v.no AS vendor_no, v.name AS vendor_name,
       coalesce(sum(d.amount_lcy), 0) AS balance_lcy          -- negative = we owe the vendor (credit)
  FROM party.vendor v
  LEFT JOIN party.detailed_vendor_ledger_entry d ON d.company_id = v.company_id AND d.vendor_id = v.id
 GROUP BY v.tenant_id, v.company_id, v.id, v.no, v.name;
COMMENT ON VIEW party.v_vendor_balance IS 'Vendor balance (LCY) = sum of detailed vendor ledger entries (credit-negative, BC sign convention).';

CREATE VIEW party.v_vendor_open_entry WITH (security_invoker = true) AS
SELECT e.tenant_id, e.company_id, e.entry_no, e.vendor_id, e.vendor_no, e.posting_date, e.due_date,
       e.document_type, e.document_no, e.external_document_no, e.currency_code, e.amount, e.amount_lcy,
       e.remaining_amount, e.remaining_amount_lcy, (current_date - e.due_date) AS days_overdue
  FROM party.vendor_ledger_entry e
 WHERE e.open;
COMMENT ON VIEW party.v_vendor_open_entry IS 'Open payables (BC Vendor Ledger Entries with Open = true).';

CREATE VIEW party.v_vendor_ledger_entry_check WITH (security_invoker = true) AS
SELECT e.tenant_id, e.company_id, e.entry_no, e.remaining_amount, e.remaining_amount_lcy, e.open,
       coalesce(sum(d.amount), 0) AS detailed_remaining, coalesce(sum(d.amount_lcy), 0) AS detailed_remaining_lcy
  FROM party.vendor_ledger_entry e
  LEFT JOIN party.detailed_vendor_ledger_entry d ON d.company_id = e.company_id AND d.vendor_ledger_entry_no = e.entry_no
 GROUP BY e.tenant_id, e.company_id, e.entry_no, e.remaining_amount, e.remaining_amount_lcy, e.open
HAVING e.remaining_amount <> coalesce(sum(d.amount), 0)
    OR e.remaining_amount_lcy <> coalesce(sum(d.amount_lcy), 0)
    OR e.open <> (coalesce(sum(d.amount), 0) <> 0);
COMMENT ON VIEW party.v_vendor_ledger_entry_check IS 'Integrity check INV-04 for payables (must be empty).';

-- Bank / cash balances
CREATE VIEW bank.v_bank_account_balance WITH (security_invoker = true) AS
SELECT b.tenant_id, b.company_id, b.id AS bank_account_id, b.no, b.name, b.kind, b.currency_code,
       coalesce(sum(e.amount), 0) AS balance, coalesce(sum(e.amount_lcy), 0) AS balance_lcy,
       coalesce(sum(e.amount) FILTER (WHERE e.statement_status = 'OPEN'), 0) AS unreconciled_amount
  FROM bank.bank_account b
  LEFT JOIN bank.bank_ledger_entry e ON e.company_id = b.company_id AND e.bank_account_id = b.id
 GROUP BY b.tenant_id, b.company_id, b.id, b.no, b.name, b.kind, b.currency_code;
COMMENT ON VIEW bank.v_bank_account_balance IS 'Bank/cash/wallet balance (BC Bank Account.Balance / Balance (LCY) FlowFields).';

-- Subledger <-> G/L reconciliation per receivables / payables account (nightly integrity job, INV-11).
CREATE VIEW party.v_receivables_reconciliation WITH (security_invoker = true) AS
WITH sub AS (
    SELECT d.company_id, g.receivables_account_id AS gl_account_id, sum(d.amount_lcy) AS subledger_lcy
      FROM party.detailed_cust_ledger_entry d
      JOIN party.customer_posting_group g ON g.company_id = d.company_id AND g.id = d.customer_posting_group_id
     GROUP BY d.company_id, g.receivables_account_id),
gl AS (
    SELECT e.company_id, e.gl_account_id, sum(e.amount) AS gl_lcy
      FROM gl.gl_entry e
     WHERE (e.company_id, e.gl_account_id) IN (SELECT company_id, receivables_account_id FROM party.customer_posting_group)
     GROUP BY e.company_id, e.gl_account_id)
SELECT coalesce(sub.company_id, gl.company_id) AS company_id, coalesce(sub.gl_account_id, gl.gl_account_id) AS gl_account_id,
       coalesce(sub.subledger_lcy, 0) AS subledger_lcy, coalesce(gl.gl_lcy, 0) AS gl_lcy,
       coalesce(gl.gl_lcy, 0) - coalesce(sub.subledger_lcy, 0) AS difference
  FROM sub FULL JOIN gl ON gl.company_id = sub.company_id AND gl.gl_account_id = sub.gl_account_id;
COMMENT ON VIEW party.v_receivables_reconciliation IS 'Receivables subledger vs. G/L receivables accounts; difference must be 0 when the accounts are subledger-only (direct_posting = false).';

CREATE VIEW party.v_payables_reconciliation WITH (security_invoker = true) AS
WITH sub AS (
    SELECT d.company_id, g.payables_account_id AS gl_account_id, sum(d.amount_lcy) AS subledger_lcy
      FROM party.detailed_vendor_ledger_entry d
      JOIN party.vendor_posting_group g ON g.company_id = d.company_id AND g.id = d.vendor_posting_group_id
     GROUP BY d.company_id, g.payables_account_id),
gl AS (
    SELECT e.company_id, e.gl_account_id, sum(e.amount) AS gl_lcy
      FROM gl.gl_entry e
     WHERE (e.company_id, e.gl_account_id) IN (SELECT company_id, payables_account_id FROM party.vendor_posting_group)
     GROUP BY e.company_id, e.gl_account_id)
SELECT coalesce(sub.company_id, gl.company_id) AS company_id, coalesce(sub.gl_account_id, gl.gl_account_id) AS gl_account_id,
       coalesce(sub.subledger_lcy, 0) AS subledger_lcy, coalesce(gl.gl_lcy, 0) AS gl_lcy,
       coalesce(gl.gl_lcy, 0) - coalesce(sub.subledger_lcy, 0) AS difference
  FROM sub FULL JOIN gl ON gl.company_id = sub.company_id AND gl.gl_account_id = sub.gl_account_id;
COMMENT ON VIEW party.v_payables_reconciliation IS 'Payables subledger vs. G/L payables accounts (INV-11 for AP); difference must be 0.';

-- -----------------------------------------------------------------------------
-- Customer / vendor statements (CR #138/#157, FR-RPT-003): opening balance, balance-changing movements (application
-- rows net to zero within one party and are left out), running and closing balance, LCY.
-- -----------------------------------------------------------------------------
CREATE FUNCTION party.fn_customer_statement(p_customer_id uuid, p_from date, p_to date)
RETURNS TABLE (line_no bigint, line_kind text, posting_date date, document_type text, document_no text, entry_type text,
               description text, debit_lcy numeric, credit_lcy numeric, balance_lcy numeric)
LANGUAGE sql STABLE AS $$
    WITH mv AS (
        SELECT d.entry_no, d.posting_date, d.document_type::text AS document_type, d.document_no::text AS document_no,
               d.entry_type, e.description, d.amount_lcy
          FROM party.detailed_cust_ledger_entry d
          JOIN party.cust_ledger_entry e ON e.company_id = d.company_id AND e.entry_no = d.cust_ledger_entry_no
         WHERE d.company_id = platform.current_company_id() AND d.customer_id = p_customer_id
           AND d.entry_type <> 'APPLICATION' AND d.posting_date <= p_to),
    op AS (SELECT coalesce(sum(amount_lcy), 0) AS bal FROM mv WHERE posting_date < p_from)
    SELECT 0::bigint, 'OPENING', p_from, NULL::text, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric, op.bal FROM op
    UNION ALL
    SELECT row_number() OVER (ORDER BY m.posting_date, m.entry_no), 'MOVEMENT', m.posting_date, m.document_type, m.document_no,
           m.entry_type, m.description, greatest(m.amount_lcy, 0), greatest(-m.amount_lcy, 0),
           op.bal + sum(m.amount_lcy) OVER (ORDER BY m.posting_date, m.entry_no)
      FROM mv m CROSS JOIN op WHERE m.posting_date >= p_from
    UNION ALL
    SELECT 9223372036854775807, 'CLOSING', p_to, NULL, NULL, NULL, NULL, NULL, NULL, (SELECT coalesce(sum(amount_lcy), 0) FROM mv)
    ORDER BY 1
$$;
COMMENT ON FUNCTION party.fn_customer_statement(uuid, date, date) IS 'Customer statement read model (FR-RPT-003, CR #138): OPENING, MOVEMENT (detailed entries except APPLICATION, running balance), CLOSING; LCY, current company. Published for the reporting module (02 §4.3).';

CREATE FUNCTION party.fn_vendor_statement(p_vendor_id uuid, p_from date, p_to date)
RETURNS TABLE (line_no bigint, line_kind text, posting_date date, document_type text, document_no text, external_document_no text,
               entry_type text, description text, debit_lcy numeric, credit_lcy numeric, balance_lcy numeric)
LANGUAGE sql STABLE AS $$
    WITH mv AS (
        SELECT d.entry_no, d.posting_date, d.document_type::text AS document_type, d.document_no::text AS document_no,
               e.external_document_no::text AS external_document_no, d.entry_type, e.description, d.amount_lcy
          FROM party.detailed_vendor_ledger_entry d
          JOIN party.vendor_ledger_entry e ON e.company_id = d.company_id AND e.entry_no = d.vendor_ledger_entry_no
         WHERE d.company_id = platform.current_company_id() AND d.vendor_id = p_vendor_id
           AND d.entry_type <> 'APPLICATION' AND d.posting_date <= p_to),
    op AS (SELECT coalesce(sum(amount_lcy), 0) AS bal FROM mv WHERE posting_date < p_from)
    SELECT 0::bigint, 'OPENING', p_from, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric, op.bal FROM op
    UNION ALL
    SELECT row_number() OVER (ORDER BY m.posting_date, m.entry_no), 'MOVEMENT', m.posting_date, m.document_type, m.document_no,
           m.external_document_no, m.entry_type, m.description, greatest(m.amount_lcy, 0), greatest(-m.amount_lcy, 0),
           op.bal + sum(m.amount_lcy) OVER (ORDER BY m.posting_date, m.entry_no)
      FROM mv m CROSS JOIN op WHERE m.posting_date >= p_from
    UNION ALL
    SELECT 9223372036854775807, 'CLOSING', p_to, NULL, NULL, NULL, NULL, NULL, NULL, NULL, (SELECT coalesce(sum(amount_lcy), 0) FROM mv)
    ORDER BY 1
$$;
COMMENT ON FUNCTION party.fn_vendor_statement(uuid, date, date) IS 'Vendor statement read model (FR-RPT-003, CR #157): mirror of party.fn_customer_statement (credit-negative BC sign).';

-- -----------------------------------------------------------------------------
-- Draft documents per date (CR #215, BR-PER-37 DRAFTS_IN_PERIOD checklist): published views for the reporting module
-- -----------------------------------------------------------------------------
CREATE VIEW sales.v_draft_document WITH (security_invoker = true) AS
SELECT tenant_id, company_id, document_type, posting_date, count(*) AS document_count
  FROM sales.sales_header GROUP BY tenant_id, company_id, document_type, posting_date;
COMMENT ON VIEW sales.v_draft_document IS 'Unposted sales drafts per document type and posting date (NULL = no date yet), for the period-close checklist.';

CREATE VIEW purchase.v_draft_document WITH (security_invoker = true) AS
SELECT tenant_id, company_id, document_type, posting_date, count(*) AS document_count
  FROM purchase.purchase_header GROUP BY tenant_id, company_id, document_type, posting_date;
COMMENT ON VIEW purchase.v_draft_document IS 'Unposted purchase drafts per document type and posting date, for the period-close checklist.';

CREATE VIEW bank.v_draft_document WITH (security_invoker = true) AS
SELECT tenant_id, company_id, 'BANK_RECONCILIATION'::text AS document_type, statement_date AS posting_date, count(*) AS document_count
  FROM bank.bank_reconciliation WHERE status = 'OPEN' GROUP BY tenant_id, company_id, statement_date
UNION ALL
SELECT tenant_id, company_id, 'BANK_STATEMENT', statement_date, count(*)
  FROM bank.bank_statement WHERE status IN ('IMPORTED','IN_RECONCILIATION') GROUP BY tenant_id, company_id, statement_date;
COMMENT ON VIEW bank.v_draft_document IS 'Open bank reconciliations and imported, not yet posted statements per statement date, for the period-close checklist.';

-- -----------------------------------------------------------------------------
-- Fixed assets and inventory read models (CR #98/#113; FR-FA-008/009, FR-INV-009, nightly checks)
-- -----------------------------------------------------------------------------
CREATE FUNCTION fa.fn_fa_book_values(p_as_of date, p_depreciation_book_id uuid DEFAULT NULL)
RETURNS TABLE (fixed_asset_id uuid, depreciation_book_id uuid, acquisition_cost numeric, depreciation numeric, write_down numeric,
               appreciation numeric, book_value numeric, disposed boolean)
LANGUAGE sql STABLE AS $$
    SELECT e.fixed_asset_id, e.depreciation_book_id,
           coalesce(sum(e.amount) FILTER (WHERE e.fa_posting_type = 'ACQUISITION_COST'), 0),
           coalesce(sum(e.amount) FILTER (WHERE e.fa_posting_type = 'DEPRECIATION'), 0),
           coalesce(sum(e.amount) FILTER (WHERE e.fa_posting_type = 'WRITE_DOWN'), 0),
           coalesce(sum(e.amount) FILTER (WHERE e.fa_posting_type = 'APPRECIATION'), 0),
           coalesce(sum(e.amount) FILTER (WHERE e.part_of_book_value), 0),
           bool_or(e.fa_posting_category = 'DISPOSAL')
      FROM fa.fa_ledger_entry e
     WHERE e.company_id = platform.current_company_id() AND e.fa_posting_date <= p_as_of
       AND (p_depreciation_book_id IS NULL OR e.depreciation_book_id = p_depreciation_book_id)
     GROUP BY e.fixed_asset_id, e.depreciation_book_id
$$;
COMMENT ON FUNCTION fa.fn_fa_book_values(date, uuid) IS 'FA register as of a date per asset and depreciation book (BC FA Depreciation Book FlowFields: acquisition cost, depreciation, write-down, appreciation, book value).';

CREATE VIEW fa.v_fa_gl_reconciliation WITH (security_invoker = true) AS
WITH acc AS (
    SELECT company_id, acquisition_cost_account_id AS account_id, 'ACQUISITION_COST'::text AS fa_posting_type FROM fa.fa_posting_group
    UNION SELECT company_id, accum_depreciation_account_id, 'DEPRECIATION' FROM fa.fa_posting_group
    UNION SELECT company_id, write_down_account_id, 'WRITE_DOWN' FROM fa.fa_posting_group WHERE write_down_account_id IS NOT NULL),
sub AS (
    SELECT e.company_id, a.account_id, sum(e.amount) AS subledger_amount
      FROM fa.fa_ledger_entry e
      JOIN fa.depreciation_book b ON b.company_id = e.company_id AND b.id = e.depreciation_book_id AND b.book_type = 'ACCOUNTING'
      JOIN fa.fa_depreciation_book fb ON fb.company_id = e.company_id AND fb.fixed_asset_id = e.fixed_asset_id
                                     AND fb.depreciation_book_id = e.depreciation_book_id
      JOIN fa.fa_posting_group g ON g.company_id = e.company_id AND g.id = fb.fa_posting_group_id
      JOIN acc a ON a.company_id = e.company_id AND a.fa_posting_type = e.fa_posting_type
                AND a.account_id = CASE e.fa_posting_type WHEN 'ACQUISITION_COST' THEN g.acquisition_cost_account_id
                                                          WHEN 'DEPRECIATION' THEN g.accum_depreciation_account_id
                                                          ELSE g.write_down_account_id END
     WHERE e.part_of_book_value
     GROUP BY e.company_id, a.account_id),
gl AS (
    SELECT e.company_id, e.gl_account_id AS account_id, sum(e.amount) AS gl_amount
      FROM gl.gl_entry e
     WHERE (e.company_id, e.gl_account_id) IN (SELECT company_id, account_id FROM acc)
     GROUP BY e.company_id, e.gl_account_id)
SELECT coalesce(sub.company_id, gl.company_id) AS company_id, coalesce(sub.account_id, gl.account_id) AS gl_account_id,
       coalesce(sub.subledger_amount, 0) AS subledger_amount, coalesce(gl.gl_amount, 0) AS gl_amount,
       coalesce(gl.gl_amount, 0) - coalesce(sub.subledger_amount, 0) AS difference
  FROM sub FULL JOIN gl ON gl.company_id = sub.company_id AND gl.account_id = sub.account_id;
COMMENT ON VIEW fa.v_fa_gl_reconciliation IS 'ACCOUNTING-book FA ledger vs G/L per acquisition-cost / accumulated-depreciation / write-down account (FR-FA-009, FA-R-22); difference must be 0 once the accounts are control accounts (platform.fn_mn_enable_r2_controls).';

CREATE FUNCTION fa.fn_fa_book_tax_difference(p_year integer)
RETURNS TABLE (fixed_asset_id uuid, accounting_book_value numeric, tax_book_value numeric, difference numeric,
               accounting_depreciation numeric, tax_depreciation numeric)
LANGUAGE sql STABLE AS $$
    WITH v AS (
        SELECT e.fixed_asset_id, b.book_type,
               coalesce(sum(e.amount) FILTER (WHERE e.part_of_book_value AND e.fa_posting_date <= make_date(p_year, 12, 31)), 0) AS bv,
               coalesce(sum(e.amount) FILTER (WHERE e.fa_posting_type = 'DEPRECIATION'
                                               AND e.fa_posting_date BETWEEN make_date(p_year, 1, 1) AND make_date(p_year, 12, 31)), 0) AS dep
          FROM fa.fa_ledger_entry e
          JOIN fa.depreciation_book b ON b.company_id = e.company_id AND b.id = e.depreciation_book_id
         WHERE e.company_id = platform.current_company_id()
         GROUP BY e.fixed_asset_id, b.book_type)
    SELECT fixed_asset_id,
           coalesce(max(bv) FILTER (WHERE book_type = 'ACCOUNTING'), 0), coalesce(max(bv) FILTER (WHERE book_type = 'TAX'), 0),
           coalesce(max(bv) FILTER (WHERE book_type = 'ACCOUNTING'), 0) - coalesce(max(bv) FILTER (WHERE book_type = 'TAX'), 0),
           coalesce(max(dep) FILTER (WHERE book_type = 'ACCOUNTING'), 0), coalesce(max(dep) FILTER (WHERE book_type = 'TAX'), 0)
      FROM v GROUP BY fixed_asset_id
$$;
COMMENT ON FUNCTION fa.fn_fa_book_tax_difference(integer) IS 'Accounting vs TAX memo book value at year end and depreciation of the year per asset (FR-FA-008, deferred tax helper).';

CREATE FUNCTION inv.fn_inventory_valuation(p_as_of date)
RETURNS TABLE (item_id uuid, location_id uuid, quantity numeric, cost_amount numeric, unit_cost numeric)
LANGUAGE sql STABLE AS $$
    SELECT v.item_id, v.location_id, sum(v.item_ledger_entry_quantity), sum(v.cost_amount_actual),
           CASE WHEN sum(v.item_ledger_entry_quantity) <> 0 THEN round(sum(v.cost_amount_actual) / sum(v.item_ledger_entry_quantity), 6) END
      FROM inv.value_entry v
     WHERE v.company_id = platform.current_company_id() AND v.valuation_date <= p_as_of
     GROUP BY v.item_id, v.location_id
$$;
COMMENT ON FUNCTION inv.fn_inventory_valuation(date) IS 'Inventory valuation as of a date from value entries (BC Inventory Valuation report, FR-INV-009).';

CREATE VIEW inv.v_item_cost_state_check WITH (security_invoker = true) AS
SELECT s.tenant_id, s.company_id, s.item_id, s.location_id, s.quantity_on_hand, s.value_on_hand,
       coalesce(v.qty, 0) AS ledger_quantity, coalesce(v.cost, 0) AS ledger_value
  FROM inv.item_cost_state s
  LEFT JOIN LATERAL (SELECT sum(x.item_ledger_entry_quantity) AS qty, sum(x.cost_amount_actual) AS cost
                       FROM inv.value_entry x
                      WHERE x.company_id = s.company_id AND x.item_id = s.item_id
                        AND x.location_id IS NOT DISTINCT FROM s.location_id) v ON true
 WHERE s.quantity_on_hand <> coalesce(v.qty, 0) OR s.value_on_hand <> coalesce(v.cost, 0);
COMMENT ON VIEW inv.v_item_cost_state_check IS 'Integrity check: inv.item_cost_state (running average projection) differs from the value entries (must be empty).';

CREATE VIEW inv.v_inventory_gl_reconciliation WITH (security_invoker = true) AS
WITH sub AS (
    SELECT v.company_id, s.inventory_account_id AS account_id, sum(v.cost_amount_actual) AS subledger_amount
      FROM inv.value_entry v
      JOIN inv.inventory_posting_group pg ON pg.company_id = v.company_id AND pg.code = v.inventory_posting_group
      JOIN LATERAL (SELECT ips.inventory_account_id FROM inv.inventory_posting_setup ips
                     WHERE ips.company_id = v.company_id AND ips.inventory_posting_group_id = pg.id
                       AND (ips.location_id = v.location_id OR ips.location_id IS NULL)
                     ORDER BY ips.location_id NULLS LAST LIMIT 1) s ON true
     GROUP BY v.company_id, s.inventory_account_id),
gl AS (
    SELECT e.company_id, e.gl_account_id AS account_id, sum(e.amount) AS gl_amount
      FROM gl.gl_entry e
     WHERE (e.company_id, e.gl_account_id) IN (SELECT company_id, inventory_account_id FROM inv.inventory_posting_setup)
     GROUP BY e.company_id, e.gl_account_id)
SELECT coalesce(sub.company_id, gl.company_id) AS company_id, coalesce(sub.account_id, gl.account_id) AS gl_account_id,
       coalesce(sub.subledger_amount, 0) AS subledger_amount, coalesce(gl.gl_amount, 0) AS gl_amount,
       coalesce(gl.gl_amount, 0) - coalesce(sub.subledger_amount, 0) AS difference
  FROM sub FULL JOIN gl ON gl.company_id = sub.company_id AND gl.account_id = sub.account_id;
COMMENT ON VIEW inv.v_inventory_gl_reconciliation IS 'Value entries vs G/L inventory accounts (FR-INV-009, INV-R-26); difference 0 once the inventory accounts are control accounts.';

-- -----------------------------------------------------------------------------
-- eBarimt read models (CR #12/#30 SCR-12, CR #84 SCR-UI-05)
-- -----------------------------------------------------------------------------
CREATE VIEW ebarimt.v_company_posapi_status WITH (security_invoker = true) AS
SELECT s.tenant_id, s.company_id, s.enabled, s.environment, s.registration_status, s.posapi_instance_id,
       i.code AS instance_code, i.status AS instance_status, i.health_status, i.left_lotteries, i.last_send_data_at, i.last_info_at
  FROM ebarimt.ebarimt_setup s
  LEFT JOIN ebarimt.posapi_instance i ON i.id = s.posapi_instance_id;
COMMENT ON VIEW ebarimt.v_company_posapi_status IS 'The current company''s PosAPI instance status (lottery count, last sendData, health) without base_url / operator_tin (CUE-08, eBarimt monitor).';

CREATE VIEW ebarimt.v_source_document_status WITH (security_invoker = true) AS
WITH src AS (
    SELECT h.tenant_id, h.company_id, 'SALES_INVOICE'::text AS source_type, h.id AS source_id, h.no::text AS source_document_no,
           h.ebarimt_receipt_type,
           EXISTS (SELECT 1 FROM sales.cancelled_document x WHERE x.company_id = h.company_id AND x.cancelled_invoice_id = h.id) AS cancelled
      FROM sales.sales_invoice_header h
    UNION ALL
    SELECT h.tenant_id, h.company_id, 'SALES_CR_MEMO', h.id, h.no::text, h.ebarimt_receipt_type, false
      FROM sales.sales_cr_memo_header h),
docs AS (
    -- chain of an invoice = its own documents + those of the credit memos correcting it; a credit memo shows its own
    SELECT d.company_id, d.source_type AS chain_type, d.source_id AS chain_id, d.id, d.source_type, d.operation, d.ebarimt_type,
           d.status, d.ddtd, d.error_code, d.created_at
      FROM ebarimt.ebarimt_document d
    UNION ALL
    SELECT d.company_id, 'SALES_INVOICE', c.corrected_invoice_id, d.id, d.source_type, d.operation, d.ebarimt_type,
           d.status, d.ddtd, d.error_code, d.created_at
      FROM sales.sales_cr_memo_header c
      JOIN ebarimt.ebarimt_document d ON d.company_id = c.company_id AND d.source_type = 'SALES_CR_MEMO' AND d.source_id = c.id
     WHERE c.corrected_invoice_id IS NOT NULL),
agg AS (
    SELECT company_id, chain_type, chain_id, count(*) AS doc_count,
           bool_or(status = 'UNKNOWN') AS has_unknown, bool_or(status = 'SENT') AS has_sent,
           bool_or(operation IN ('DELETE','MANUAL_VOID') AND status = 'SUCCESS') AS voided,
           bool_or(operation = 'MANUAL_VOID') AS has_manual_void, bool_and(status = 'CANCELLED') AS all_cancelled
      FROM docs GROUP BY company_id, chain_type, chain_id),
latest AS (
    SELECT DISTINCT ON (company_id, chain_type, chain_id) *
      FROM docs WHERE status <> 'CANCELLED'
     ORDER BY company_id, chain_type, chain_id, created_at DESC, id DESC)
SELECT s.tenant_id, s.company_id, s.source_type, s.source_id, s.source_document_no,
       CASE WHEN s.ebarimt_receipt_type = 'NONE'                          THEN 'NOT_REQUIRED'
            WHEN coalesce(a.doc_count, 0) = 0                             THEN 'NOT_CONFIGURED'
            WHEN a.has_unknown                                            THEN 'UNKNOWN'
            WHEN a.has_sent                                               THEN 'SENT'
            WHEN l.status = 'ERROR'                                       THEN 'ERROR'
            WHEN l.status = 'PENDING'                                     THEN 'PENDING'
            WHEN l.status = 'SUCCESS' AND l.operation = 'SAVE' AND l.ebarimt_type IN ('B2B_RECEIPT','B2B_INVOICE')
                 AND s.cancelled AND NOT a.has_manual_void                THEN 'MANUAL_VOID_REQUIRED'
            WHEN a.voided OR (a.all_cancelled AND s.cancelled)            THEN 'VOIDED'
            WHEN l.status = 'SUCCESS' AND s.source_type = 'SALES_INVOICE' AND l.source_type = 'SALES_CR_MEMO' THEN 'CORRECTED'
            WHEN l.status = 'SUCCESS'                                     THEN 'SUCCESS'
            ELSE 'NOT_CONFIGURED' END AS chain_status,
       l.id AS latest_document_id, l.ddtd::text AS ddtd,
       round((extract(epoch FROM now() - l.created_at) / 3600)::numeric, 1) AS age_hours, l.error_code
  FROM src s
  LEFT JOIN agg a ON a.company_id = s.company_id AND a.chain_type = s.source_type AND a.chain_id = s.source_id
  LEFT JOIN latest l ON l.company_id = s.company_id AND l.chain_type = s.source_type AND l.chain_id = s.source_id;
COMMENT ON VIEW ebarimt.v_source_document_status IS 'eBarimt status of each posted sales invoice (whole correction chain) and credit memo, in the 12 §9.4 chainStatus order (API EbarimtChainStatus) - unsent receipts report (FR-EBR-013 AC2). NetState-empty is approximated by "invoice fully cancelled" (sales.cancelled_document); the API refines MANUAL_VOID_REQUIRED for partial-return chains.';

-- -----------------------------------------------------------------------------
-- Gapless numbering evidence (CR #119/#125, I-07, M10, Order 47)
-- -----------------------------------------------------------------------------
CREATE VIEW platform.v_number_series_gap WITH (security_invoker = true) AS
WITH a AS (
    SELECT na.tenant_id, na.company_id, na.number_series_line_id, na.no, na.document_no,
           lag(na.no) OVER (PARTITION BY na.company_id, na.number_series_line_id ORDER BY na.no) AS prev_no
      FROM platform.number_allocation na)
SELECT a.tenant_id, a.company_id, s.code AS series_code, l.prefix, a.number_series_line_id,
       coalesce(a.prev_no + l.increment_by, l.starting_no) AS missing_from, a.no - l.increment_by AS missing_to,
       'GAP'::text AS issue
  FROM a
  JOIN platform.number_series_line l ON l.company_id = a.company_id AND l.id = a.number_series_line_id
  JOIN platform.number_series s ON s.company_id = l.company_id AND s.id = l.number_series_id
 WHERE (a.prev_no IS NULL AND a.no > l.starting_no) OR (a.prev_no IS NOT NULL AND a.no - a.prev_no > l.increment_by)
UNION ALL
SELECT c.tenant_id, c.company_id, s.code, l.prefix, c.number_series_line_id,
       coalesce(x.max_no, l.starting_no - l.increment_by) + l.increment_by, c.last_no_used, 'COUNTER_AHEAD_OF_LOG'
  FROM platform.number_series_counter c
  JOIN platform.number_series_line l ON l.company_id = c.company_id AND l.id = c.number_series_line_id
  JOIN platform.number_series s ON s.company_id = l.company_id AND s.id = l.number_series_id
  LEFT JOIN LATERAL (SELECT max(na.no) AS max_no FROM platform.number_allocation na
                      WHERE na.company_id = c.company_id AND na.number_series_line_id = c.number_series_line_id) x ON true
 WHERE c.last_no_used <> coalesce(x.max_no, l.starting_no - l.increment_by);
COMMENT ON VIEW platform.v_number_series_gap IS 'Missing numbers of gapless series (GAP) and counters not matching the allocation log (COUNTER_AHEAD_OF_LOG); must be empty (I-07, DBT-NUM-02).';

-- -----------------------------------------------------------------------------
-- One integrity report for the golden runner, the nightly job, the restore drill and post-load checks
-- (CR #118/#124, invariants I-01..I-08). Read-only, SECURITY INVOKER (caller's RLS = current company).
-- -----------------------------------------------------------------------------
CREATE FUNCTION platform.fn_integrity_report(p_company uuid DEFAULT NULL)
RETURNS TABLE (check_code text, status text, details jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_company uuid := platform.current_company_id();
    v_d       jsonb;
BEGIN
    IF p_company IS NOT NULL AND p_company <> v_company THEN
        RAISE EXCEPTION 'integrity report runs for the context company only' USING ERRCODE = 'ERT01';
    END IF;
    -- I-01 every voucher balances
    SELECT jsonb_agg(x) INTO v_d FROM (SELECT transaction_no, sum(amount) AS sum FROM gl.gl_entry WHERE company_id = v_company
                                         GROUP BY transaction_no HAVING sum(amount) <> 0 ORDER BY transaction_no LIMIT 20) x;
    check_code := 'I-01 GL_TRANSACTION_BALANCED'; status := CASE WHEN v_d IS NULL THEN 'PASS' ELSE 'FAIL' END; details := coalesce(v_d, '[]'); RETURN NEXT;
    -- I-02 trial balance debit = credit
    SELECT jsonb_build_object('debit', coalesce(sum(debit_amount), 0), 'credit', coalesce(sum(credit_amount), 0)) INTO v_d
      FROM gl.gl_entry WHERE company_id = v_company;
    check_code := 'I-02 TRIAL_BALANCE'; status := CASE WHEN v_d ->> 'debit' = v_d ->> 'credit' THEN 'PASS' ELSE 'FAIL' END; details := v_d; RETURN NEXT;
    -- I-03 remaining-amount caches = detailed entries (INV-04)
    SELECT jsonb_build_object('customer', (SELECT count(*) FROM party.v_cust_ledger_entry_check WHERE company_id = v_company),
                              'vendor', (SELECT count(*) FROM party.v_vendor_ledger_entry_check WHERE company_id = v_company)) INTO v_d;
    check_code := 'I-03 LEDGER_CACHE'; status := CASE WHEN (v_d ->> 'customer')::int + (v_d ->> 'vendor')::int = 0 THEN 'PASS' ELSE 'FAIL' END;
    details := v_d; RETURN NEXT;
    -- I-04 receivables / payables subledger = G/L (INV-11)
    SELECT jsonb_agg(x) INTO v_d FROM (
        SELECT 'AR' AS side, gl_account_id, difference FROM party.v_receivables_reconciliation WHERE company_id = v_company AND difference <> 0
        UNION ALL
        SELECT 'AP', gl_account_id, difference FROM party.v_payables_reconciliation WHERE company_id = v_company AND difference <> 0) x;
    check_code := 'I-04 SUBLEDGER_GL'; status := CASE WHEN v_d IS NULL THEN 'PASS' ELSE 'FAIL' END; details := coalesce(v_d, '[]'); RETURN NEXT;
    -- I-05 bank / cash subledger = G/L per money account
    SELECT jsonb_agg(x) INTO v_d FROM (
        SELECT b.no, g.gl_account_id,
               coalesce((SELECT sum(e.amount_lcy) FROM bank.bank_ledger_entry e WHERE e.company_id = b.company_id AND e.bank_account_id = b.id), 0) AS bank_lcy,
               coalesce((SELECT sum(e.amount) FROM gl.gl_entry e WHERE e.company_id = b.company_id AND e.gl_account_id = g.gl_account_id), 0) AS gl_lcy
          FROM bank.bank_account b JOIN bank.bank_account_posting_group g ON g.company_id = b.company_id AND g.id = b.bank_account_posting_group_id
         WHERE b.company_id = v_company) x
     WHERE x.bank_lcy <> x.gl_lcy;
    check_code := 'I-05 BANK_GL'; status := CASE WHEN v_d IS NULL THEN 'PASS' ELSE 'FAIL' END; details := coalesce(v_d, '[]'); RETURN NEXT;
    -- I-06 ledger entry numbers 1..n without gaps (D-K3)
    SELECT jsonb_agg(x) INTO v_d FROM (
        SELECT 'gl_entry' AS ledger, count(*) AS n, max(entry_no) AS max_no FROM gl.gl_entry WHERE company_id = v_company
        UNION ALL SELECT 'gl_transaction', count(*), max(transaction_no) FROM gl.gl_transaction WHERE company_id = v_company
        UNION ALL SELECT 'gl_register', count(*), max(no) FROM gl.gl_register WHERE company_id = v_company
        UNION ALL SELECT 'vat_entry', count(*), max(entry_no) FROM tax.vat_entry WHERE company_id = v_company
        UNION ALL SELECT 'cust_ledger_entry', count(*), max(entry_no) FROM party.cust_ledger_entry WHERE company_id = v_company
        UNION ALL SELECT 'vendor_ledger_entry', count(*), max(entry_no) FROM party.vendor_ledger_entry WHERE company_id = v_company
        UNION ALL SELECT 'bank_ledger_entry', count(*), max(entry_no) FROM bank.bank_ledger_entry WHERE company_id = v_company) x
     WHERE coalesce(x.max_no, 0) <> x.n;
    check_code := 'I-06 LEDGER_NUMBER_GAPS'; status := CASE WHEN v_d IS NULL THEN 'PASS' ELSE 'FAIL' END; details := coalesce(v_d, '[]'); RETURN NEXT;
    -- I-07 legal (gapless) document numbers
    SELECT jsonb_agg(to_jsonb(g) - 'tenant_id' - 'company_id') INTO v_d FROM platform.v_number_series_gap g WHERE g.company_id = v_company;
    check_code := 'I-07 LEGAL_NUMBER_GAPS'; status := CASE WHEN v_d IS NULL THEN 'PASS' ELSE 'FAIL' END; details := coalesce(v_d, '[]'); RETURN NEXT;
    -- I-08 MNT amounts rounded to 0.01 (D-C2)
    SELECT jsonb_build_object('gl_entry', (SELECT count(*) FROM gl.gl_entry WHERE company_id = v_company AND amount <> round(amount, 2)),
                              'vat_entry', (SELECT count(*) FROM tax.vat_entry WHERE company_id = v_company
                                             AND (amount <> round(amount, 2) OR base <> round(base, 2)))) INTO v_d;
    check_code := 'I-08 UNROUNDED_MNT'; status := CASE WHEN (v_d ->> 'gl_entry')::int + (v_d ->> 'vat_entry')::int = 0 THEN 'PASS' ELSE 'FAIL' END;
    details := v_d; RETURN NEXT;
END $$;
COMMENT ON FUNCTION platform.fn_integrity_report(uuid) IS 'Integrity invariants I-01..I-08 for the context company (balanced vouchers, trial balance, ledger caches, AR/AP and bank subledger = G/L, entry-number and legal-number gaps, MNT rounding). Read-only; one row per check with PASS / FAIL and details.';

-- Views are created after 900; grant read access explicitly.
GRANT SELECT ON gl.v_gl_account_period_balance, rpt.v_trial_balance_base, party.v_customer_balance, party.v_cust_open_entry,
                party.v_cust_ledger_entry_check, party.v_vendor_balance, party.v_vendor_open_entry,
                party.v_vendor_ledger_entry_check, bank.v_bank_account_balance, party.v_receivables_reconciliation,
                party.v_payables_reconciliation, audit.document_entry, sales.v_draft_document, purchase.v_draft_document,
                bank.v_draft_document, fa.v_fa_gl_reconciliation, inv.v_item_cost_state_check, inv.v_inventory_gl_reconciliation,
                ebarimt.v_company_posapi_status, ebarimt.v_source_document_status, platform.v_number_series_gap
   TO app_user, app_readonly;
GRANT EXECUTE ON FUNCTION rpt.fn_trial_balance(date, date, boolean, uuid, uuid),
                          party.fn_customer_statement(uuid, date, date), party.fn_vendor_statement(uuid, date, date),
                          fa.fn_fa_book_values(date, uuid), fa.fn_fa_book_tax_difference(integer), inv.fn_inventory_valuation(date),
                          platform.fn_integrity_report(uuid)
   TO app_user, app_readonly;
GRANT EXECUTE ON FUNCTION platform.fn_integrity_report(uuid) TO app_worker;
GRANT EXECUTE ON FUNCTION party.fn_customer_aging(date, uuid, uuid), party.fn_vendor_aging(date, uuid, uuid) TO app_user, app_readonly;
