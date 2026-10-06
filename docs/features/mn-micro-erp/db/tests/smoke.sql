-- =============================================================================
-- tests/smoke.sql - smoke test of the canonical schema (PostgreSQL 16+).
-- Run against a freshly applied database as a superuser / bootstrap role:
--   psql -v ON_ERROR_STOP=1 -d erp_schema_check -f db/tests/smoke.sql
-- Fixtures are inserted as the bootstrap role; every business statement runs as
-- app_user (non-owner, no BYPASSRLS) or app_owner (FORCE RLS applies to it as well).
-- Expected failures are captured with ON_ERROR_STOP off and asserted via LAST_ERROR_SQLSTATE.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset footer off

\set tenant_a  '''a0000000-0000-0000-0000-000000000001'''
\set tenant_b  '''b0000000-0000-0000-0000-000000000001'''
\set company_a1 '''a1000000-0000-0000-0000-000000000001'''
\set company_a2 '''a2000000-0000-0000-0000-000000000001'''
\set company_b1 '''b1000000-0000-0000-0000-000000000001'''
\set user_1    '''c0000000-0000-0000-0000-000000000001'''

CREATE FUNCTION pg_temp.assert(p_ok boolean, p_msg text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL: %', p_msg;
    END IF;
    RETURN 'PASS: ' || p_msg;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Fixtures: two tenants, three companies (bootstrap role)
-- -----------------------------------------------------------------------------
BEGIN;
INSERT INTO platform.tenant (id, name, status) VALUES (:tenant_a, 'Tenant A', 'ACTIVE'), (:tenant_b, 'Tenant B', 'ACTIVE');
INSERT INTO platform.company (id, tenant_id, name) VALUES
    (:company_a1, :tenant_a, 'А ХХК'), (:company_a2, :tenant_a, 'А2 ХХК'), (:company_b1, :tenant_b, 'Б ХХК');
INSERT INTO platform.company_setup (tenant_id, company_id, legal_name, tin, vat_registered, allow_posting_from, allow_posting_to) VALUES
    (:tenant_a, :company_a1, 'А ХХК', '1234567', true, DATE '2026-01-01', DATE '2026-12-31'),
    (:tenant_a, :company_a2, 'А2 ХХК', '7654321', false, NULL, NULL),
    (:tenant_b, :company_b1, 'Б ХХК', '2345678', false, NULL, NULL);
INSERT INTO platform.app_user (id, email, display_name) VALUES (:user_1, 'accountant@example.mn', 'Нягтлан');
INSERT INTO platform.tenant_membership (tenant_id, user_id) VALUES (:tenant_a, :user_1);
COMMIT;

-- -----------------------------------------------------------------------------
-- 2. Company initialisation as app_user (calendar, accounts, number series)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-init-a1') \gset
SELECT gl.fn_initialize_company() \gset
SELECT gl.fn_create_fiscal_year(2026) AS fy_a1 \gset
INSERT INTO gl.gl_account (tenant_id, company_id, no, name, income_balance, account_category, direct_posting) VALUES
    (:tenant_a, :company_a1, '1100', 'Касс', 'BALANCE_SHEET', 'ASSETS', true),
    (:tenant_a, :company_a1, '1200', 'Дансны авлага', 'BALANCE_SHEET', 'ASSETS', false),
    (:tenant_a, :company_a1, '5100', 'Борлуулалтын орлого', 'INCOME_STATEMENT', 'INCOME', true);
INSERT INTO platform.number_series (tenant_id, company_id, code, description, gapless, document_kind)
VALUES (:tenant_a, :company_a1, 'GJ', 'Ерөнхий журналын баримт', true, 'JOURNAL_VOUCHER');
INSERT INTO platform.number_series_line (tenant_id, company_id, number_series_id, line_no, starting_date, prefix, width)
SELECT :tenant_a, :company_a1, id, 10000, DATE '2026-01-01', 'GJ-2026-', 5 FROM platform.number_series WHERE code = 'GJ';
COMMIT;

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a2, :user_1, 'smoke-init-a2') \gset
SELECT gl.fn_initialize_company() \gset
INSERT INTO gl.gl_account (tenant_id, company_id, no, name, income_balance) VALUES
    (:tenant_a, :company_a2, '1100', 'Касс (А2)', 'BALANCE_SHEET');
COMMIT;

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_b, :company_b1, NULL, 'smoke-init-b1') \gset
SELECT gl.fn_initialize_company() \gset
INSERT INTO gl.gl_account (tenant_id, company_id, no, name, income_balance) VALUES
    (:tenant_b, :company_b1, '1100', 'Касс (Б)', 'BALANCE_SHEET'),
    (:tenant_b, :company_b1, '5100', 'Орлого (Б)', 'INCOME_STATEMENT');
COMMIT;

-- -----------------------------------------------------------------------------
-- 3. Balanced 2-line transaction commits (D-C5) with a gapless document number (D-C7)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-post-1') \gset
SELECT platform.fn_lock_company_posting(:tenant_a, :company_a1) \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS reg_no,
       platform.fn_next_entry_no('GL_TRANSACTION') AS tx_no,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS first_entry,
       platform.fn_next_document_no('GJ', DATE '2026-03-15') AS doc_no \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_a, :company_a1, :tx_no, :reg_no, DATE '2026-03-15', :'doc_no', 'GENJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date,
                         document_no, description, amount, source_code)
SELECT :tenant_a, :company_a1, :first_entry + v.i, :tx_no, :reg_no, a.id, DATE '2026-03-15', :'doc_no', 'Бэлэн борлуулалт', v.amount, 'GENJNL'
  FROM (VALUES (0, '1100', 1000.00), (1, '5100', -1000.00)) v(i, acc, amount)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :reg_no, :first_entry, :first_entry + 1, 'GENJNL');
COMMIT;
SELECT pg_temp.assert(:'doc_no' = 'GJ-2026-00001', 'first gapless voucher number is GJ-2026-00001');
SELECT pg_temp.assert((SELECT count(*) = 2 AND sum(amount) = 0 AND sum(debit_amount) = 1000 AND sum(credit_amount) = 1000
                         FROM gl.gl_entry WHERE company_id = :company_a1 AND transaction_no = :tx_no),
                      'balanced transaction committed; debit/credit derived from the signed amount');

-- -----------------------------------------------------------------------------
-- 4. Unbalanced transaction fails at COMMIT (deferred constraint trigger, ERB01)
-- -----------------------------------------------------------------------------
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-post-2') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS reg_no2,
       platform.fn_next_entry_no('GL_TRANSACTION') AS tx_no2,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS first_entry2,
       platform.fn_next_document_no('GJ', DATE '2026-03-16') AS doc_no2 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_a, :company_a1, :tx_no2, :reg_no2, DATE '2026-03-16', :'doc_no2', 'GENJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date,
                         document_no, amount, source_code)
SELECT :tenant_a, :company_a1, :first_entry2 + v.i, :tx_no2, :reg_no2, a.id, DATE '2026-03-16', :'doc_no2', v.amount, 'GENJNL'
  FROM (VALUES (0, '1100', 1000.00), (1, '5100', -900.00)) v(i, acc, amount)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :reg_no2, :first_entry2, :first_entry2 + 1, 'GENJNL');
COMMIT;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERB01', 'unbalanced transaction rejected at COMMIT (ERB01): ' || :'LAST_ERROR_MESSAGE');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM gl.gl_entry WHERE company_id = :company_a1 AND posting_date = DATE '2026-03-16'),
                      'nothing of the unbalanced transaction was persisted');

-- The rolled-back posting left no gap: the next voucher number is 00002 and the next entry no. continues.
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-post-3') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS reg_no3,
       platform.fn_next_entry_no('GL_TRANSACTION') AS tx_no3,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS first_entry3,
       platform.fn_next_document_no('GJ', DATE '2026-03-20') AS doc_no3 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code,
                               reverses_transaction_no)
VALUES (:tenant_a, :company_a1, :tx_no3, :reg_no3, DATE '2026-03-20', :'doc_no3', 'REVERSAL', :tx_no);
-- Reversal of transaction 1 (D-C3): opposite sign, therefore opposite column, no storno.
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date,
                         document_no, amount, source_code, reversed, reversed_entry_no)
SELECT :tenant_a, :company_a1, :first_entry3 + o.i, :tx_no3, :reg_no3, e.gl_account_id, DATE '2026-03-20', :'doc_no3',
       -e.amount, 'REVERSAL', true, e.entry_no
  FROM (SELECT entry_no, gl_account_id, amount, row_number() OVER (ORDER BY entry_no) - 1 AS i
          FROM gl.gl_entry WHERE company_id = :company_a1 AND transaction_no = :tx_no) e
  CROSS JOIN LATERAL (SELECT e.i) o(i);
SELECT platform.fn_ledger_update('gl.gl_entry', e.entry_no,
           jsonb_build_object('reversed', true, 'reversed_by_entry_no', :first_entry3 + (row_number() OVER (ORDER BY e.entry_no)) - 1))
  FROM gl.gl_entry e WHERE e.company_id = :company_a1 AND e.transaction_no = :tx_no;
SELECT platform.fn_ledger_update('gl.gl_transaction', :tx_no, jsonb_build_object('reversed_by_transaction_no', :tx_no3)) \gset
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :reg_no3, :first_entry3, :first_entry3 + 1, 'REVERSAL');
COMMIT;
SELECT pg_temp.assert(:'doc_no3' = 'GJ-2026-00002', 'gapless: rolled-back number GJ-2026-00002 was reused, no gap');
SELECT pg_temp.assert(:tx_no3 = :tx_no + 1 AND :first_entry3 = :first_entry + 2, 'ledger counters have no gap after rollback');
SELECT pg_temp.assert((SELECT bool_and(reversed) AND count(*) = 4 AND sum(amount) = 0 FROM gl.gl_entry WHERE company_id = :company_a1),
                      'reversal posted with opposite signs; originals flagged through platform.fn_ledger_update');
SELECT pg_temp.assert((SELECT debit_amount = 0 AND credit_amount = 1000 FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id
                        WHERE e.company_id = :company_a1 AND e.transaction_no = :tx_no3 AND a.no = '1100'),
                      'reversal of a debit lands in the credit column (no storno)');

-- -----------------------------------------------------------------------------
-- 5. Ledger immutability
-- -----------------------------------------------------------------------------
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-update') \gset
UPDATE gl.gl_entry SET amount = amount + 1 WHERE company_id = :company_a1;
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '42501', 'app_user cannot UPDATE gl_entry.amount (privilege revoked): ' || :'LAST_ERROR_MESSAGE');

\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_owner;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-update-owner') \gset
UPDATE gl.gl_entry SET amount = amount + 1 WHERE company_id = :company_a1;
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERL01', 'even the owner cannot change gl_entry.amount (trigger ERL01): ' || :'LAST_ERROR_MESSAGE');

\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-update-fn') \gset
SELECT platform.fn_ledger_update('gl.gl_entry', 1, '{"amount": 5}'::jsonb);
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERL01', 'fn_ledger_update refuses non-whitelisted columns');

\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-delete') \gset
DELETE FROM gl.gl_entry WHERE company_id = :company_a1;
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '42501', 'app_user cannot DELETE G/L entries');

-- Entries cannot be appended to a voucher committed earlier.
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-append') \gset
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no, amount, source_code)
SELECT :tenant_a, :company_a1, 999, :tx_no, :reg_no, id, DATE '2026-03-15', 'X', 0, 'GENJNL' FROM gl.gl_account WHERE no = '1100';
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERL01', 'cannot add entries to an already committed G/L transaction');

-- -----------------------------------------------------------------------------
-- 6. Period control (D-D3): no posting into a CLOSED period
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-close') \gset
UPDATE gl.accounting_period SET status = 'CLOSED' WHERE company_id = :company_a1 AND starting_date = DATE '2026-02-01';
INSERT INTO gl.accounting_period_status_log (tenant_id, company_id, accounting_period_id, from_status, to_status)
SELECT :tenant_a, :company_a1, id, 'OPEN', 'CLOSED' FROM gl.accounting_period WHERE company_id = :company_a1 AND starting_date = DATE '2026-02-01';
COMMIT;
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-closed-post') \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_a, :company_a1, 900, 900, DATE '2026-02-10', 'GJ-X', 'GENJNL');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERP01', 'posting into a CLOSED period is rejected (ERP01)');

-- -----------------------------------------------------------------------------
-- 7. Receivables: remaining amount is maintained from detailed entries (INV-04)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-ar') \gset
INSERT INTO tax.vat_bus_posting_group (tenant_id, company_id, code, description) VALUES (:tenant_a, :company_a1, 'DOMESTIC', 'Дотоод');
INSERT INTO party.gen_bus_posting_group (tenant_id, company_id, code) VALUES (:tenant_a, :company_a1, 'DOMESTIC');
INSERT INTO party.customer_posting_group (tenant_id, company_id, code, receivables_account_id)
SELECT :tenant_a, :company_a1, 'DOMESTIC', id FROM gl.gl_account WHERE company_id = :company_a1 AND no = '1200';
INSERT INTO party.customer (tenant_id, company_id, no, name, kind, tin, customer_posting_group_id, gen_bus_posting_group_id, vat_bus_posting_group_id)
SELECT :tenant_a, :company_a1, 'C0001', 'Хэрэглэгч ХХК', 'LEGAL', '5555555',
       (SELECT id FROM party.customer_posting_group WHERE code = 'DOMESTIC'),
       (SELECT id FROM party.gen_bus_posting_group WHERE code = 'DOMESTIC'),
       (SELECT id FROM tax.vat_bus_posting_group WHERE code = 'DOMESTIC')
RETURNING id AS customer_id \gset
-- invoice 1,100: AR debit / revenue credit
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r4, platform.fn_next_entry_no('GL_TRANSACTION') AS t4,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e4, platform.fn_next_entry_no('CUST_LEDGER_ENTRY') AS cle4,
       platform.fn_next_entry_no('DETAILED_CUST_LEDGER_ENTRY') AS d4 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_type, document_no, source_code)
VALUES (:tenant_a, :company_a1, :t4, :r4, DATE '2026-03-21', 'INVOICE', 'SI-2026-00001', 'SALES');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_type,
                         document_no, amount, source_code, source_type, source_id)
SELECT :tenant_a, :company_a1, :e4 + v.i, :t4, :r4, a.id, DATE '2026-03-21', 'INVOICE', 'SI-2026-00001', v.amount, 'SALES', 'CUSTOMER', :'customer_id'
  FROM (VALUES (0, '1200', 1100.00), (1, '5100', -1100.00)) v(i, acc, amount)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO party.cust_ledger_entry (tenant_id, company_id, entry_no, customer_id, customer_no, posting_date, due_date, document_type,
                                     document_no, amount, amount_lcy, positive, customer_posting_group_id, transaction_no, gl_register_no, source_code)
SELECT :tenant_a, :company_a1, :cle4, :'customer_id', 'C0001', DATE '2026-03-21', DATE '2026-04-20', 'INVOICE', 'SI-2026-00001',
       1100, 1100, true, id, :t4, :r4, 'SALES' FROM party.customer_posting_group WHERE code = 'DOMESTIC';
INSERT INTO party.detailed_cust_ledger_entry (tenant_id, company_id, entry_no, cust_ledger_entry_no, entry_type, posting_date, document_type,
                                              document_no, amount, amount_lcy, customer_id, transaction_no, ledger_entry_amount, source_code)
VALUES (:tenant_a, :company_a1, :d4, :cle4, 'INITIAL', DATE '2026-03-21', 'INVOICE', 'SI-2026-00001', 1100, 1100, :'customer_id', :t4, true, 'SALES');
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :r4, :e4, :e4 + 1, 'SALES');
COMMIT;
SELECT pg_temp.assert((SELECT remaining_amount = 1100 AND open FROM party.cust_ledger_entry WHERE company_id = :company_a1 AND entry_no = :cle4),
                      'invoice ledger entry open with remaining 1,100 = sum(detailed)');

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-pay') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r5, platform.fn_next_entry_no('GL_TRANSACTION') AS t5,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e5, platform.fn_next_entry_no('CUST_LEDGER_ENTRY') AS cle5,
       platform.fn_next_entry_no('DETAILED_CUST_LEDGER_ENTRY', 4) AS d5, platform.fn_next_entry_no('APPLICATION_NO') AS appl5 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_type, document_no, source_code)
VALUES (:tenant_a, :company_a1, :t5, :r5, DATE '2026-03-25', 'PAYMENT', 'CR-2026-00001', 'CASHRECJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_type,
                         document_no, amount, source_code)
SELECT :tenant_a, :company_a1, :e5 + v.i, :t5, :r5, a.id, DATE '2026-03-25', 'PAYMENT', 'CR-2026-00001', v.amount, 'CASHRECJNL'
  FROM (VALUES (0, '1100', 1100.00), (1, '1200', -1100.00)) v(i, acc, amount)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO party.cust_ledger_entry (tenant_id, company_id, entry_no, customer_id, customer_no, posting_date, due_date, document_type,
                                     document_no, amount, amount_lcy, positive, customer_posting_group_id, transaction_no, gl_register_no, source_code)
SELECT :tenant_a, :company_a1, :cle5, :'customer_id', 'C0001', DATE '2026-03-25', DATE '2026-03-25', 'PAYMENT', 'CR-2026-00001',
       -1100, -1100, false, id, :t5, :r5, 'CASHRECJNL' FROM party.customer_posting_group WHERE code = 'DOMESTIC';
INSERT INTO party.detailed_cust_ledger_entry (tenant_id, company_id, entry_no, cust_ledger_entry_no, entry_type, posting_date, document_type,
                                              document_no, amount, amount_lcy, customer_id, transaction_no, application_no,
                                              applied_cust_ledger_entry_no, ledger_entry_amount, source_code)
VALUES (:tenant_a, :company_a1, :d5,     :cle5, 'INITIAL',     DATE '2026-03-25', 'PAYMENT', 'CR-2026-00001', -1100, -1100, :'customer_id', :t5, NULL, NULL, true, 'CASHRECJNL'),
       (:tenant_a, :company_a1, :d5 + 1, :cle5, 'APPLICATION', DATE '2026-03-25', 'PAYMENT', 'CR-2026-00001',  1100,  1100, :'customer_id', :t5, :appl5, :cle4, false, 'CASHRECJNL'),
       (:tenant_a, :company_a1, :d5 + 2, :cle4, 'APPLICATION', DATE '2026-03-25', 'PAYMENT', 'CR-2026-00001', -1100, -1100, :'customer_id', :t5, :appl5, :cle5, false, 'CASHRECJNL');
SELECT platform.fn_ledger_update('party.cust_ledger_entry', :cle4,
           jsonb_build_object('closed_by_entry_no', :cle5, 'closed_at_date', DATE '2026-03-25', 'closed_by_amount', -1100)) \gset
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :r5, :e5, :e5 + 1, 'CASHRECJNL');
COMMIT;
SELECT pg_temp.assert((SELECT bool_and(NOT open) AND sum(remaining_amount) = 0 FROM party.cust_ledger_entry WHERE company_id = :company_a1),
                      'payment applied: both customer entries closed, remaining 0');
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-ar-check') \gset
SELECT pg_temp.assert((SELECT count(*) = 0 FROM party.v_cust_ledger_entry_check), 'v_cust_ledger_entry_check is empty (cache = detailed)');
SELECT pg_temp.assert((SELECT balance_lcy = 0 FROM party.v_customer_balance WHERE customer_no = 'C0001'), 'customer balance from detailed entries = 0');
SELECT pg_temp.assert((SELECT difference = 0 FROM party.v_receivables_reconciliation), 'receivables subledger = G/L 1200');
SELECT pg_temp.assert((SELECT sum(period_debit) = sum(period_credit) FROM rpt.fn_trial_balance(DATE '2026-01-01', DATE '2026-12-31')),
                      'trial balance: total debit turnover = total credit turnover');
SELECT pg_temp.assert(gl.fn_get_dimension_set_id(ARRAY[]::uuid[]) = 0, 'empty dimension set id = 0');
COMMIT;

-- -----------------------------------------------------------------------------
-- 8. Row-level security: tenant and company isolation for a non-owner role
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-rls') \gset
SELECT pg_temp.assert((SELECT count(*) = 3 FROM gl.gl_account), 'tenant A / company A1 sees only its 3 accounts');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM gl.gl_account WHERE tenant_id = :tenant_b), 'tenant B accounts are invisible (RLS)');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM gl.gl_account WHERE company_id = :company_a2), 'company A2 accounts are invisible from A1 (restrictive policy)');
SELECT pg_temp.assert((SELECT count(*) = 1 FROM platform.tenant), 'only the own tenant row is visible');
SELECT pg_temp.assert((SELECT count(*) = 2 FROM platform.company), 'tenant A sees its 2 companies, not tenant B''s');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM gl.gl_entry WHERE tenant_id <> :tenant_a), 'no foreign ledger rows visible');
COMMIT;

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_b, :company_b1, NULL, 'smoke-rls-b') \gset
SELECT pg_temp.assert((SELECT count(*) = 2 FROM gl.gl_account), 'tenant B sees only its 2 accounts');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM gl.gl_entry), 'tenant B sees none of tenant A''s G/L entries');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM audit.row_change WHERE tenant_id = :tenant_a), 'tenant A audit rows invisible to tenant B');
COMMIT;

\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-rls-write') \gset
INSERT INTO gl.gl_account (tenant_id, company_id, no, name, income_balance) VALUES (:tenant_b, :company_b1, '9999', 'Хууль бус', 'BALANCE_SHEET');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '42501', 'cannot insert a row for another tenant (RLS WITH CHECK)');

\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT count(*) FROM gl.gl_account;
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' IN ('42704','22P02'), 'no context set: query fails closed (' || :'LAST_ERROR_SQLSTATE' || ')');

-- Audit trail was written for master data (D-I3)
SELECT pg_temp.assert((SELECT count(*) > 0 FROM audit.row_change WHERE table_name = 'gl_account' AND tenant_id = :tenant_a),
                      'audit.row_change captured G/L account inserts');

-- =============================================================================
-- 9. Review regressions (db/README.md "Хяналтын тэмдэглэл")
-- =============================================================================

-- 9.1 Two vouchers in one DB transaction that net to zero but are each unbalanced -> ERB01 (D-C5 per voucher)
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-two-unbalanced') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r91, platform.fn_next_entry_no('GL_TRANSACTION', 2) AS t91,
       platform.fn_next_entry_no('GL_ENTRY', 4) AS e91 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_a, :company_a1, :t91, :r91, DATE '2026-03-27', 'X-1', 'GENJNL'),
       (:tenant_a, :company_a1, :t91 + 1, :r91, DATE '2026-03-27', 'X-2', 'GENJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no, amount, source_code)
SELECT :tenant_a, :company_a1, :e91 + v.i, :t91 + v.tx, :r91, a.id, DATE '2026-03-27', 'X', v.amount, 'GENJNL'
  FROM (VALUES (0, 0, '1100', 100.00), (1, 0, '5100', -90.00), (2, 1, '1100', 90.00), (3, 1, '5100', -100.00)) v(i, tx, acc, amount)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :r91, :e91, :e91 + 3, 'GENJNL');
COMMIT;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERB01', 'two unbalanced vouchers netting to zero in one DB transaction are rejected (ERB01)');

-- 9.2 Balance/cash checks do not depend on the RLS context active at COMMIT (company switched before COMMIT)
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-switch') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r92, platform.fn_next_entry_no('GL_TRANSACTION') AS t92,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e92 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_a, :company_a1, :t92, :r92, DATE '2026-03-27', 'SW-1', 'GENJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no, amount, source_code)
SELECT :tenant_a, :company_a1, :e92 + v.i, :t92, :r92, a.id, DATE '2026-03-27', 'SW-1', v.amount, 'GENJNL'
  FROM (VALUES (0, '1100', 10.00), (1, '5100', -10.00)) v(i, acc, amount)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :r92, :e92, :e92 + 1, 'GENJNL');
SELECT platform.fn_set_context(:tenant_a, :company_a2, :user_1, 'smoke-switch-2') \gset
COMMIT;
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-switch-check') \gset
SELECT pg_temp.assert((SELECT count(*) = 2 FROM gl.gl_entry WHERE transaction_no = :t92),
                      'balanced voucher commits even when the request switched company before COMMIT (RLS-independent check)');
COMMIT;

-- 9.3 Subledger rows cannot reference a voucher committed earlier (back-dating / appending) -> ERL01
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-old-voucher') \gset
INSERT INTO party.cust_ledger_entry (tenant_id, company_id, entry_no, customer_id, customer_no, posting_date, due_date, document_type,
                                     document_no, amount, amount_lcy, positive, customer_posting_group_id, transaction_no, gl_register_no, source_code)
SELECT :tenant_a, :company_a1, 9001, :'customer_id', 'C0001', DATE '2026-03-21', DATE '2026-03-21', 'INVOICE', 'SI-FAKE',
       1, 1, true, id, :t4, :r4, 'SALES' FROM party.customer_posting_group WHERE code = 'DOMESTIC';
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERL01', 'a customer ledger entry cannot be attached to an already committed G/L transaction (ERL01)');

-- 9.4 Subledger row dated differently from its voucher (e.g. into a CLOSED period) -> ERB02
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-date-mismatch') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r94, platform.fn_next_entry_no('GL_TRANSACTION') AS t94 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_a, :company_a1, :t94, :r94, DATE '2026-03-27', 'DM-1', 'SALES');
INSERT INTO tax.vat_entry (tenant_id, company_id, entry_no, entry_type, posting_date, vat_date, document_no, base, amount,
                           vat_calculation_type, vat_percent, transaction_no, gl_register_no, source_code)
VALUES (:tenant_a, :company_a1, 9001, 'SALE', DATE '2026-02-10', DATE '2026-02-10', 'DM-1', -100, -10, 'NORMAL', 10, :t94, :r94, 'SALES');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERB02', 'a VAT entry cannot carry a posting date different from its G/L transaction (ERB02)');

-- 9.5 Global dimension columns are derived from the dimension set (input value ignored)
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-dims') \gset
INSERT INTO gl.dimension (tenant_id, company_id, code, name) VALUES (:tenant_a, :company_a1, 'SALBAR', 'Салбар') RETURNING id AS dim_id \gset
INSERT INTO gl.dimension_value (tenant_id, company_id, dimension_id, code, name)
VALUES (:tenant_a, :company_a1, :'dim_id', 'UB', 'Улаанбаатар') RETURNING id AS dim_val_id \gset
UPDATE gl.general_ledger_setup SET global_dimension_1_id = :'dim_id' WHERE company_id = :company_a1;
SELECT gl.fn_get_dimension_set_id(ARRAY[:'dim_val_id']::uuid[]) AS dim_set \gset
COMMIT;

-- 9.6 Invoice + payment as two vouchers of one DB transaction (each balanced), then an application
--     WITHOUT G/L effect (BC Transaction No. 0 -> transaction_no NULL)
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-inv2-pay2') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r96, platform.fn_next_entry_no('GL_TRANSACTION', 2) AS t96,
       platform.fn_next_entry_no('GL_ENTRY', 4) AS e96, platform.fn_next_entry_no('CUST_LEDGER_ENTRY', 2) AS cle96,
       platform.fn_next_entry_no('DETAILED_CUST_LEDGER_ENTRY', 2) AS d96 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_type, document_no, source_code)
VALUES (:tenant_a, :company_a1, :t96, :r96, DATE '2026-03-26', 'INVOICE', 'SI-2026-00002', 'SALES'),
       (:tenant_a, :company_a1, :t96 + 1, :r96, DATE '2026-03-26', 'PAYMENT', 'CR-2026-00002', 'CASHRECJNL');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no,
                         amount, source_code, dimension_set_id, global_dim_1_value_id)
SELECT :tenant_a, :company_a1, :e96 + v.i, :t96 + v.tx, :r96, a.id, DATE '2026-03-26', v.doc, v.amount, 'SALES', :dim_set, gen_random_uuid()
  FROM (VALUES (0, 0, '1200', 500.00, 'SI-2026-00002'), (1, 0, '5100', -500.00, 'SI-2026-00002'),
               (2, 1, '1100', 500.00, 'CR-2026-00002'), (3, 1, '1200', -500.00, 'CR-2026-00002')) v(i, tx, acc, amount, doc)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO party.cust_ledger_entry (tenant_id, company_id, entry_no, customer_id, customer_no, posting_date, due_date, document_type,
                                     document_no, amount, amount_lcy, positive, customer_posting_group_id, transaction_no, gl_register_no, source_code)
SELECT :tenant_a, :company_a1, :cle96 + v.i, :'customer_id', 'C0001', DATE '2026-03-26', DATE '2026-04-26', v.dt, v.doc,
       v.amount, v.amount, v.amount > 0, g.id, :t96 + v.i, :r96, 'SALES'
  FROM (VALUES (0, 'INVOICE', 'SI-2026-00002', 500.00), (1, 'PAYMENT', 'CR-2026-00002', -500.00)) v(i, dt, doc, amount)
  CROSS JOIN party.customer_posting_group g WHERE g.code = 'DOMESTIC';
INSERT INTO party.detailed_cust_ledger_entry (tenant_id, company_id, entry_no, cust_ledger_entry_no, entry_type, posting_date, document_type,
                                              document_no, amount, amount_lcy, customer_id, transaction_no, ledger_entry_amount, source_code)
VALUES (:tenant_a, :company_a1, :d96,     :cle96,     'INITIAL', DATE '2026-03-26', 'INVOICE', 'SI-2026-00002',  500,  500, :'customer_id', :t96,     true, 'SALES'),
       (:tenant_a, :company_a1, :d96 + 1, :cle96 + 1, 'INITIAL', DATE '2026-03-26', 'PAYMENT', 'CR-2026-00002', -500, -500, :'customer_id', :t96 + 1, true, 'CASHRECJNL');
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :r96, :e96, :e96 + 3, 'SALES');
COMMIT;
SELECT pg_temp.assert((SELECT count(*) = 4 FROM gl.gl_entry WHERE company_id = :company_a1 AND transaction_no IN (:t96, :t96 + 1)),
                      'two balanced vouchers in one DB transaction commit');
SELECT pg_temp.assert((SELECT bool_and(global_dim_1_value_id = :'dim_val_id') FROM gl.gl_entry
                        WHERE company_id = :company_a1 AND transaction_no IN (:t96, :t96 + 1)),
                      'global_dim_1_value_id is derived from the dimension set, the supplied random value is ignored');

-- over-application (remaining would change sign) -> CHECK violation 23514
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-overapply') \gset
SELECT platform.fn_next_entry_no('DETAILED_CUST_LEDGER_ENTRY') AS d97, platform.fn_next_entry_no('APPLICATION_NO') AS appl97 \gset
INSERT INTO party.detailed_cust_ledger_entry (tenant_id, company_id, entry_no, cust_ledger_entry_no, entry_type, posting_date, document_type,
                                              document_no, amount, amount_lcy, customer_id, transaction_no, application_no,
                                              applied_cust_ledger_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :d97, :cle96, 'APPLICATION', DATE '2026-03-27', 'PAYMENT', 'CR-2026-00002', -600, -600, :'customer_id',
        NULL, :appl97, :cle96 + 1, 'SALESAPPL');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '23514', 'over-application (remaining changes sign) is rejected by CHECK');

-- application without G/L dated into a CLOSED period -> ERP01
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-appl-closed') \gset
INSERT INTO party.detailed_cust_ledger_entry (tenant_id, company_id, entry_no, cust_ledger_entry_no, entry_type, posting_date, document_type,
                                              document_no, amount, amount_lcy, customer_id, transaction_no, application_no,
                                              applied_cust_ledger_entry_no, source_code)
VALUES (:tenant_a, :company_a1, 9002, :cle96, 'APPLICATION', DATE '2026-02-15', 'PAYMENT', 'CR-2026-00002', -500, -500, :'customer_id',
        NULL, 9002, :cle96 + 1, 'SALESAPPL');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERP01', 'an application without G/L still obeys the period lock (ERP01)');

BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-apply') \gset
SELECT platform.fn_next_entry_no('DETAILED_CUST_LEDGER_ENTRY', 2) AS d98, platform.fn_next_entry_no('APPLICATION_NO') AS appl98 \gset
INSERT INTO party.detailed_cust_ledger_entry (tenant_id, company_id, entry_no, cust_ledger_entry_no, entry_type, posting_date, document_type,
                                              document_no, amount, amount_lcy, customer_id, transaction_no, application_no,
                                              applied_cust_ledger_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :d98,     :cle96 + 1, 'APPLICATION', DATE '2026-03-27', 'PAYMENT', 'CR-2026-00002',  500,  500, :'customer_id', NULL, :appl98, :cle96,     'SALESAPPL'),
       (:tenant_a, :company_a1, :d98 + 1, :cle96,     'APPLICATION', DATE '2026-03-27', 'PAYMENT', 'CR-2026-00002', -500, -500, :'customer_id', NULL, :appl98, :cle96 + 1, 'SALESAPPL');
COMMIT;
SELECT pg_temp.assert((SELECT bool_and(NOT open) AND sum(remaining_amount) = 0 FROM party.cust_ledger_entry
                        WHERE company_id = :company_a1 AND entry_no IN (:cle96, :cle96 + 1)),
                      'application without G/L (transaction_no NULL) closes invoice and payment');

-- detailed entry of another customer's ledger entry -> FK violation (party consistency)
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-wrong-party') \gset
INSERT INTO party.customer (tenant_id, company_id, no, name, kind, customer_posting_group_id, gen_bus_posting_group_id, vat_bus_posting_group_id)
SELECT :tenant_a, :company_a1, 'C0002', 'Өөр ХХК', 'INDIVIDUAL', g.id, b.id, v.id
  FROM party.customer_posting_group g, party.gen_bus_posting_group b, tax.vat_bus_posting_group v
 WHERE g.code = 'DOMESTIC' AND b.code = 'DOMESTIC' AND v.code = 'DOMESTIC'
RETURNING id AS customer2_id \gset
INSERT INTO party.detailed_cust_ledger_entry (tenant_id, company_id, entry_no, cust_ledger_entry_no, entry_type, posting_date, document_type,
                                              document_no, amount, amount_lcy, customer_id, transaction_no, application_no, source_code)
VALUES (:tenant_a, :company_a1, 9003, :cle96, 'APPLICATION', DATE '2026-03-27', 'PAYMENT', 'X', 0, 0, :'customer2_id', NULL, 9003, 'SALESAPPL');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '23503', 'a detailed entry must belong to the customer of its ledger entry (composite FK)');

-- 9.7 Cache columns are not writable through fn_ledger_update; reversed flag cannot be cleared
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-cache') \gset
SELECT platform.fn_ledger_update('party.cust_ledger_entry', :cle96, '{"remaining_amount": 0, "open": false}'::jsonb);
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERL01', 'remaining_amount/open are trigger-maintained only (fn_ledger_update refuses them)');

\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-unreverse') \gset
SELECT platform.fn_ledger_update('gl.gl_entry', :first_entry, '{"reversed": false}'::jsonb);
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERL01', 'a reversed flag cannot be cleared');

-- 9.8 Counters: no direct DML for app_user; cross-tenant outbox claim is worker-only
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-counter') \gset
UPDATE platform.ledger_counter SET last_no = last_no + 100 WHERE ledger = 'GL_ENTRY';
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '42501', 'app_user cannot move a ledger counter (gaps) directly');

\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT * FROM integration.fn_claim_outbox('web', ARRAY['ebarimt.receipt.send'], 10, interval '1 minute');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '42501', 'the web role cannot claim other tenants'' outbox messages');

-- 9.9 qrData / lottery rejected at any depth of a persisted JSON payload (D-J3)
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-qr') \gset
INSERT INTO integration.outbox (tenant_id, company_id, topic, payload, idempotency_key)
VALUES (:tenant_a, :company_a1, 'ebarimt.receipt.send', '{"response": {"receipts": [{"qrData": "x"}]}}', 'smoke-qr-1');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '23514', 'nested qrData in an outbox payload is rejected');

-- 9.10 Yearly number series (D-C7): no silent fallback to the previous year's line
UPDATE platform.number_series SET reset_yearly = true WHERE company_id = :company_a1 AND code = 'GJ';
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-yearly') \gset
SELECT platform.fn_next_document_no('GJ', DATE '2027-01-05');
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERN01', 'yearly series without a 2027 line refuses to issue GJ-2026-... in 2027 (ERN01)');

-- 9.11 eBarimt billIdSuffix sequence per POS is never reset (D-K4) and reused after rollback
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-pos') \gset
INSERT INTO ebarimt.ebarimt_pos (tenant_id, company_id, pos_no) VALUES (:tenant_a, :company_a1, '001') RETURNING id AS pos_id \gset
SELECT ebarimt.fn_next_bill_seq(:'pos_id') AS seq1 \gset
COMMIT;
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-pos-rb') \gset
SELECT ebarimt.fn_next_bill_seq(:'pos_id') AS seq_rb \gset
ROLLBACK;
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-pos-2') \gset
SELECT ebarimt.fn_next_bill_seq(:'pos_id') AS seq2 \gset
COMMIT;
SELECT pg_temp.assert(:seq1 = 1 AND :seq_rb = 2 AND :seq2 = 2, 'bill sequence per POS: 1, then 2 reused after rollback, no daily reset');

-- 9.12 A filed (SUBMITTED) VAT return period cannot be reopened
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-vat-period') \gset
INSERT INTO tax.vat_return_period (tenant_id, company_id, starting_date, ending_date, status, submitted_at)
VALUES (:tenant_a, :company_a1, DATE '2026-01-01', DATE '2026-01-31', 'SUBMITTED', now());
COMMIT;
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-vat-reopen') \gset
UPDATE tax.vat_return_period SET status = 'OPEN' WHERE company_id = :company_a1 AND starting_date = DATE '2026-01-01';
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERP02', 'a SUBMITTED VAT return period is final (ERP02)');

-- 9.13 Cash account (kind CASH) can never go negative, even without prevent_negative_balance (D-G1)
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-cash-setup') \gset
INSERT INTO bank.bank_account_posting_group (tenant_id, company_id, code, gl_account_id)
SELECT :tenant_a, :company_a1, 'CASH', id FROM gl.gl_account WHERE company_id = :company_a1 AND no = '1100';
INSERT INTO bank.bank_account (tenant_id, company_id, no, name, kind, bank_account_posting_group_id)
SELECT :tenant_a, :company_a1, 'CASH01', 'Касс', 'CASH', id FROM bank.bank_account_posting_group WHERE code = 'CASH'
RETURNING id AS cash_id \gset
COMMIT;
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-cash-neg') \gset
SELECT platform.fn_next_entry_no('GL_REGISTER') AS r913, platform.fn_next_entry_no('GL_TRANSACTION') AS t913,
       platform.fn_next_entry_no('GL_ENTRY', 2) AS e913, platform.fn_next_entry_no('BANK_LEDGER_ENTRY') AS b913 \gset
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, document_no, source_code)
VALUES (:tenant_a, :company_a1, :t913, :r913, DATE '2026-03-27', 'MX2-1', 'CASHVOUCHER');
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, document_no, amount, source_code)
SELECT :tenant_a, :company_a1, :e913 + v.i, :t913, :r913, a.id, DATE '2026-03-27', 'MX2-1', v.amount, 'CASHVOUCHER'
  FROM (VALUES (0, '1100', -500.00), (1, '5100', 500.00)) v(i, acc, amount)
  JOIN gl.gl_account a ON a.company_id = :company_a1 AND a.no = v.acc;
INSERT INTO bank.bank_ledger_entry (tenant_id, company_id, entry_no, bank_account_id, posting_date, document_no, amount, amount_lcy,
                                    remaining_amount, positive, transaction_no, gl_register_no, source_code)
VALUES (:tenant_a, :company_a1, :b913, :'cash_id', DATE '2026-03-27', 'MX2-1', -500, -500, -500, false, :t913, :r913, 'CASHVOUCHER');
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, source_code)
VALUES (:tenant_a, :company_a1, :r913, :e913, :e913 + 1, 'CASHVOUCHER');
COMMIT;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = 'ERC01', 'a CASH account cannot go negative (ERC01)');

-- 9.13b eBarimt document: bill sequence fields consistent; status changes are logged append-only
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-ebarimt-doc') \gset
INSERT INTO ebarimt.ebarimt_document (tenant_id, company_id, source_type, source_id, source_document_no, ebarimt_type,
                                      ebarimt_pos_id, bill_date, bill_seq, bill_id_suffix, merchant_tin, total_amount, total_vat)
VALUES (:tenant_a, :company_a1, 'SALES_INVOICE', gen_random_uuid(), 'SI-2026-00002', 'B2C_RECEIPT',
        :'pos_id', DATE '2026-03-26', :seq2, :seq2 % 1000000, '1234567', 550, 50)
RETURNING id AS ebd_id \gset
UPDATE ebarimt.ebarimt_document SET status = 'SENT', attempt_count = 1 WHERE id = :'ebd_id';
COMMIT;
SELECT pg_temp.assert((SELECT count(*) = 2 FROM ebarimt.ebarimt_document_event WHERE ebarimt_document_id = :'ebd_id'),
                      'eBarimt status history: PENDING and SENT logged in ebarimt_document_event');
\set ON_ERROR_STOP off
\set LAST_ERROR_SQLSTATE 'none'
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-ebarimt-badsuffix') \gset
INSERT INTO ebarimt.ebarimt_document (tenant_id, company_id, source_type, source_id, source_document_no, ebarimt_type,
                                      ebarimt_pos_id, bill_date, bill_seq, bill_id_suffix, merchant_tin, total_amount)
VALUES (:tenant_a, :company_a1, 'SALES_INVOICE', gen_random_uuid(), 'SI-X', 'B2C_RECEIPT', :'pos_id', DATE '2026-03-26', 3, 7, '1234567', 1);
ROLLBACK;
\set ON_ERROR_STOP on
SELECT pg_temp.assert(:'LAST_ERROR_SQLSTATE' = '23514', 'bill_id_suffix must equal bill_seq mod 10^6');

-- 9.13c Pre-tenant security events are invisible to tenants
SELECT audit.fn_log_security_event(NULL, NULL, 'LOGIN_FAILED', NULL, 'FAILED', '{"login":"x@example.mn"}') AS sec_id \gset
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-sec') \gset
SELECT audit.fn_log_security_event(:tenant_a, :company_a1, 'PII_UNMASK', :user_1) \gset
SELECT pg_temp.assert((SELECT count(*) = 1 FROM audit.security_event), 'tenant sees only its own security events (not the pre-tenant login failure)');
COMMIT;

-- 9.14 Integrity views stay clean after all of the above
BEGIN;
SET LOCAL ROLE app_user;
SELECT platform.fn_set_context(:tenant_a, :company_a1, :user_1, 'smoke-final-check') \gset
SELECT pg_temp.assert((SELECT count(*) = 0 FROM party.v_cust_ledger_entry_check), 'v_cust_ledger_entry_check still empty');
SELECT pg_temp.assert((SELECT bool_and(difference = 0) FROM party.v_receivables_reconciliation), 'receivables subledger = G/L after applications');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM party.fn_customer_aging(DATE '2026-12-31')), 'AR aging empty: everything applied');
COMMIT;

\echo 'SMOKE TEST: ALL CHECKS PASSED'
