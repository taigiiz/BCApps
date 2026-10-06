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

-- Trial balance (эргэлтийн тайлан) for the current company.
CREATE FUNCTION rpt.fn_trial_balance(p_from date, p_to date, p_include_closing boolean DEFAULT false)
RETURNS TABLE (gl_account_id uuid, gl_account_no text, gl_account_name text, income_balance text,
               opening_balance numeric, period_debit numeric, period_credit numeric, closing_balance numeric)
LANGUAGE sql STABLE AS $$
    SELECT a.id, a.no::text, a.name, a.income_balance,
           coalesce(sum(b.net_amount) FILTER (WHERE b.posting_date < p_from
                       AND (a.income_balance = 'BALANCE_SHEET' OR b.posting_date >= make_date(extract(year FROM p_from)::int, 1, 1))), 0),
           coalesce(sum(b.debit_amount) FILTER (WHERE b.posting_date BETWEEN p_from AND p_to), 0),
           coalesce(sum(b.credit_amount) FILTER (WHERE b.posting_date BETWEEN p_from AND p_to), 0),
           coalesce(sum(b.net_amount) FILTER (WHERE b.posting_date <= p_to
                       AND (a.income_balance = 'BALANCE_SHEET' OR b.posting_date >= make_date(extract(year FROM p_from)::int, 1, 1))), 0)
      FROM gl.gl_account a
      LEFT JOIN rpt.v_trial_balance_base b
             ON b.company_id = a.company_id AND b.gl_account_id = a.id AND (p_include_closing OR NOT b.is_closing)
     WHERE a.company_id = platform.current_company_id() AND a.account_type = 'POSTING'
     GROUP BY a.id, a.no, a.name, a.income_balance
     ORDER BY a.no
$$;
COMMENT ON FUNCTION rpt.fn_trial_balance(date, date, boolean) IS 'Trial balance for the current company: P&L accounts restart at the fiscal-year start; closing (is_closing) entries excluded unless requested.';

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
CREATE FUNCTION party.fn_customer_aging(p_as_of date)
RETURNS TABLE (customer_id uuid, cust_ledger_entry_no bigint, document_no text, due_date date,
               remaining_lcy numeric, days_overdue integer, bucket_seq smallint, bucket_label text)
LANGUAGE sql STABLE AS $$
    WITH rem AS (
        SELECT e.customer_id, e.entry_no, e.document_no::text, e.due_date, e.posting_date, e.document_date,
               sum(d.amount_lcy) AS remaining_lcy
          FROM party.cust_ledger_entry e
          JOIN party.detailed_cust_ledger_entry d ON d.company_id = e.company_id AND d.cust_ledger_entry_no = e.entry_no
         WHERE e.company_id = platform.current_company_id() AND e.posting_date <= p_as_of AND d.posting_date <= p_as_of
         GROUP BY e.customer_id, e.entry_no, e.document_no, e.due_date, e.posting_date, e.document_date
        HAVING sum(d.amount_lcy) <> 0),
    s AS (SELECT id, basis FROM rpt.aging_bucket_set WHERE company_id = platform.current_company_id() AND is_default),
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
COMMENT ON FUNCTION party.fn_customer_aging(date) IS 'AR aging as of a date for the current company (remaining = detailed entries <= as-of), bucketed by the default aging_bucket_set (D-F7).';

CREATE FUNCTION party.fn_vendor_aging(p_as_of date)
RETURNS TABLE (vendor_id uuid, vendor_ledger_entry_no bigint, document_no text, external_document_no text, due_date date,
               remaining_lcy numeric, days_overdue integer, bucket_seq smallint, bucket_label text)
LANGUAGE sql STABLE AS $$
    WITH rem AS (
        SELECT e.vendor_id, e.entry_no, e.document_no::text, e.external_document_no::text AS ext_no, e.due_date,
               e.posting_date, e.document_date, sum(d.amount_lcy) AS remaining_lcy
          FROM party.vendor_ledger_entry e
          JOIN party.detailed_vendor_ledger_entry d ON d.company_id = e.company_id AND d.vendor_ledger_entry_no = e.entry_no
         WHERE e.company_id = platform.current_company_id() AND e.posting_date <= p_as_of AND d.posting_date <= p_as_of
         GROUP BY e.vendor_id, e.entry_no, e.document_no, e.external_document_no, e.due_date, e.posting_date, e.document_date
        HAVING sum(d.amount_lcy) <> 0),
    s AS (SELECT id, basis FROM rpt.aging_bucket_set WHERE company_id = platform.current_company_id() AND is_default),
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
COMMENT ON FUNCTION party.fn_vendor_aging(date) IS 'AP aging as of a date for the current company (remaining credit-negative, BC sign), bucketed like the AR aging (D-F7).';

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

-- Views are created after 900; grant read access explicitly.
GRANT SELECT ON gl.v_gl_account_period_balance, rpt.v_trial_balance_base, party.v_customer_balance, party.v_cust_open_entry,
                party.v_cust_ledger_entry_check, party.v_vendor_balance, party.v_vendor_open_entry,
                party.v_vendor_ledger_entry_check, bank.v_bank_account_balance, party.v_receivables_reconciliation,
                party.v_payables_reconciliation, audit.document_entry
   TO app_user, app_readonly;
GRANT EXECUTE ON FUNCTION party.fn_customer_aging(date), party.fn_vendor_aging(date) TO app_user, app_readonly;
