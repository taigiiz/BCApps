-- =============================================================================
-- 910_ledger_guards.sql
-- Database-enforced accounting invariants (DECISIONS D-C3..D-C7, D-D3, D-G1, D-E9):
--  * ledgers and posted documents are append-only; only whitelisted system columns may
--    change, and only through platform.fn_ledger_update (SECURITY DEFINER); cache columns
--    (remaining amounts, open) change only through internal triggers;
--  * every G/L transaction balances (deferred constraint trigger, checked at COMMIT,
--    independent of the RLS context active at COMMIT);
--  * posting dates must fall in an OPEN accounting period and inside the company window,
--    and every subledger / posted-document row carries the date of a G/L transaction created
--    in the same database transaction (no back-dating through an old voucher);
--  * ledger rows are written for the company of the request context only;
--  * cash accounts (kind CASH, or any account with prevent_negative_balance) cannot go negative.
-- Error codes: ERB01 unbalanced, ERB02 date/register mismatch with the voucher, ERP01 period/window,
--              ERP02 period/VAT-period status machine, ERL01 immutable, ERT01 context,
--              ERV01 VAT period, ERC01 negative cash, ERG01 account not postable.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

-- -----------------------------------------------------------------------------
-- Catalog of guarded tables and their whitelisted (system-maintained) columns
-- -----------------------------------------------------------------------------
CREATE TABLE platform.ledger_guard (
    table_name       text PRIMARY KEY,               -- schema.table
    key_column       text,                           -- business key used by fn_ledger_update (NULL = no updates; 'id' = uuid overload)
    mutable_columns  text[] NOT NULL DEFAULT '{}',   -- changeable through platform.fn_ledger_update
    trigger_columns  text[] NOT NULL DEFAULT '{}',   -- caches changeable ONLY by internal SECURITY DEFINER triggers
    allow_delete_after interval,                     -- retention purge window (audit only)
    description      text
);
COMMENT ON TABLE platform.ledger_guard IS 'Global catalog: append-only tables and the only columns that may be updated (BC: Entry tables modifiable only by posting codeunits, e.g. CU103 Cust. Entry-Edit). mutable_columns go through platform.fn_ledger_update; trigger_columns (derived caches) are never accepted from the application.';

INSERT INTO platform.ledger_guard (table_name, key_column, mutable_columns, allow_delete_after, description) VALUES
    ('gl.gl_entry',                  'entry_no',       ARRAY['reversed','reversed_by_entry_no'], NULL, 'BC T17'),
    ('gl.gl_transaction',            'transaction_no', ARRAY['reversed_by_transaction_no'], NULL, 'BC T57'),
    ('gl.gl_register',               'no',             ARRAY['reversed'], NULL, 'BC T45'),
    ('gl.accounting_period_status_log', NULL,          '{}', NULL, 'period history'),
    ('gl.dimension_set',             NULL,             '{}', NULL, 'BC T481 replacement'),
    ('gl.dimension_set_entry',       NULL,             '{}', NULL, 'BC T480'),
    ('tax.vat_entry',                'entry_no',       ARRAY['closed','closed_by_entry_no','vat_return_period_id','deductible_confirmed',
                                                             'deductible_confirmed_at','deductible_confirmed_by','supplier_ebarimt_id',
                                                             'customs_declaration_id','reversed','reversed_by_entry_no'], NULL, 'BC T254'),
    ('tax.gl_entry_vat_entry_link',  NULL,             '{}', NULL, 'BC T253'),
    ('tax.city_tax_entry',           'entry_no',       ARRAY['closed','closed_by_entry_no','vat_return_period_id','reversed','reversed_by_entry_no'], NULL, 'city tax ledger'),
    ('tax.vat_return_snapshot',      NULL,             '{}', NULL, 'filed ТТ-03а (CR #175)'),
    ('fx.exch_rate_adjmt_register',  NULL,             '{}', NULL, 'BC T86'),
    ('fx.exch_rate_adjmt_ledger_entry', NULL,          '{}', NULL, 'BC T186'),
    ('sales.sales_invoice_header',   NULL,             '{}', NULL, 'BC T112'),
    ('sales.sales_invoice_line',     NULL,             '{}', NULL, 'BC T113'),
    ('sales.sales_cr_memo_header',   NULL,             '{}', NULL, 'BC T114'),
    ('sales.sales_cr_memo_line',     NULL,             '{}', NULL, 'BC T115'),
    ('sales.cancelled_document',     NULL,             '{}', NULL, 'BC T1900'),
    ('party.cust_ledger_entry',      'entry_no',       ARRAY['closed_by_entry_no',
                                                             'closed_at_date','closed_by_amount','closed_by_amount_lcy',
                                                             'closed_by_currency_code','closed_by_currency_amount','applies_to_id',
                                                             'amount_to_apply','applying_entry','due_date','on_hold','adjusted_currency_factor',
                                                             'adjusted_exchange_rate','reversed','reversed_by_entry_no'], NULL, 'BC T21'),
    ('party.detailed_cust_ledger_entry', 'entry_no',   ARRAY['unapplied','unapplied_by_entry_no'], NULL, 'BC T379'),
    ('purchase.purch_inv_header',    NULL,             '{}', NULL, 'BC T122'),
    ('purchase.purch_inv_line',      NULL,             '{}', NULL, 'BC T123'),
    ('purchase.purch_cr_memo_header', NULL,            '{}', NULL, 'BC T124'),
    ('purchase.purch_cr_memo_line',  NULL,             '{}', NULL, 'BC T125'),
    ('purchase.cancelled_document',  NULL,             '{}', NULL, 'BC T1900'),
    ('party.vendor_ledger_entry',    'entry_no',       ARRAY['closed_by_entry_no',
                                                             'closed_at_date','closed_by_amount','closed_by_amount_lcy',
                                                             'closed_by_currency_code','closed_by_currency_amount','applies_to_id',
                                                             'amount_to_apply','applying_entry','due_date','on_hold','adjusted_currency_factor',
                                                             'adjusted_exchange_rate','supplier_ebarimt_id','reversed','reversed_by_entry_no'], NULL, 'BC T25'),
    ('party.detailed_vendor_ledger_entry', 'entry_no', ARRAY['unapplied','unapplied_by_entry_no'], NULL, 'BC T380'),
    ('bank.bank_ledger_entry',       'entry_no',       ARRAY['remaining_amount','open','closed_by_entry_no','closed_at_date',
                                                             'statement_status','statement_no','statement_line_no',
                                                             'reversed','reversed_by_entry_no'], NULL, 'BC T271'),
    ('bank.posted_cash_voucher',     NULL,             '{}', NULL, 'МХ-1/МХ-2'),
    ('bank.bank_account_statement',  'id',             ARRAY['undone_at','undone_by','undo_reason_code_id'], NULL, 'BC T275 (undo, CR #71/#192)'),
    ('bank.bank_account_statement_line', NULL,         '{}', NULL, 'BC T276'),
    ('fa.fa_ledger_entry',           'entry_no',       ARRAY['reversed','reversed_by_entry_no'], NULL, 'BC T5601'),
    ('inv.item_ledger_entry',        'entry_no',       ARRAY['remaining_quantity','open'], NULL, 'BC T32'),
    ('inv.value_entry',              'entry_no',       ARRAY['cost_posted_to_gl'], NULL, 'BC T5802'),
    ('inv.item_application_entry',   'entry_no',       ARRAY['outbound_entry_is_updated'], NULL, 'BC T339'),
    ('inv.gl_item_ledger_relation',  NULL,             '{}', NULL, 'BC T5823'),
    ('inv.posted_item_journal',      NULL,             '{}', NULL, 'posted adjustment / count (CR #97)'),
    ('inv.posted_item_journal_line', NULL,             '{}', NULL, 'posted adjustment / count line (CR #97)'),
    ('ebarimt.ebarimt_document_line', NULL,            '{}', NULL, 'items[] as sent'),
    ('ebarimt.ebarimt_document_payment', NULL,         '{}', NULL, 'payments[] as sent (CR #1)'),
    ('rpt.filing_submission',        NULL,             '{}', NULL, 'e-balance filing evidence (CR #206)'),
    ('rpt.statement_snapshot',       'snapshot_no',    ARRAY['status'], NULL, 'saved statement (CR #207/#219)'),
    ('platform.number_allocation',   NULL,             '{}', NULL, 'gapless number log (CR #119)'),
    ('platform.document_rendition',  NULL,             '{}', NULL, 'canonical PDF (CR #52)'),
    ('platform.archive_package',     'id',             ARRAY['verified_at','verification_status'], NULL, 'annual archive (CR #51)'),
    ('platform.tenant_purge_log',    NULL,             '{}', NULL, 'tenant purge evidence (CR #57)'),
    ('audit.row_change',             NULL,             '{}', interval '10 years', 'BC T405'),
    ('audit.posting_log',            NULL,             '{}', interval '10 years', 'posting attempts'),
    ('audit.security_event',         NULL,             '{}', interval '10 years', 'security log (02 11.6)'),
    ('platform.document_signature',  NULL,             '{}', NULL, 'document sign-off (FR-PLT-012)'),
    ('ebarimt.ebarimt_document_event', NULL,           '{}', interval '10 years', 'eBarimt status history');

-- Derived caches: remaining amount / open of the C/V ledger entries follow the detailed entries (INV-04, D-C4).
UPDATE platform.ledger_guard SET trigger_columns = ARRAY['remaining_amount','remaining_amount_lcy','open']
 WHERE table_name IN ('party.cust_ledger_entry','party.vendor_ledger_entry');

-- -----------------------------------------------------------------------------
-- Immutability trigger
-- -----------------------------------------------------------------------------
CREATE FUNCTION platform.fn_guard_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    g        platform.ledger_guard%ROWTYPE;
    v_ignore text[];
    v_diff   text[];
BEGIN
    SELECT * INTO g FROM platform.ledger_guard WHERE table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
    IF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION '%.% is append-only: TRUNCATE is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'ERL01';
    ELSIF TG_OP = 'DELETE' THEN
        -- CR #57: tenant purge by the migrator (erp.purge_tenant + PURGE_APPROVED), evidence in platform.tenant_purge_log
        IF platform.fn_purge_in_progress((to_jsonb(OLD) ->> 'tenant_id')::uuid) THEN
            RETURN OLD;
        END IF;
        IF g.allow_delete_after IS NOT NULL
           AND coalesce((to_jsonb(OLD) ->> 'changed_at')::timestamptz, (to_jsonb(OLD) ->> 'finished_at')::timestamptz,
                        (to_jsonb(OLD) ->> 'created_at')::timestamptz)
               < now() - g.allow_delete_after THEN
            RETURN OLD;      -- retention purge
        END IF;
        RAISE EXCEPTION '%.% is append-only: DELETE is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'ERL01';
    END IF;
    -- UPDATE: only whitelisted columns may change (generated columns are recomputed, ignore them)
    SELECT coalesce(g.mutable_columns, '{}') || coalesce(g.trigger_columns, '{}') || coalesce(array_agg(a.attname::text), '{}')
      INTO v_ignore
      FROM pg_attribute a
     WHERE a.attrelid = TG_RELID AND a.attgenerated <> '' AND NOT a.attisdropped;
    SELECT array_agg(k) INTO v_diff
      FROM jsonb_object_keys(to_jsonb(NEW)) k
     WHERE to_jsonb(NEW) -> k IS DISTINCT FROM to_jsonb(OLD) -> k
       AND NOT (k = ANY (v_ignore));
    IF v_diff IS NOT NULL THEN
        RAISE EXCEPTION '%.% is append-only: column(s) % cannot be changed', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_diff
            USING ERRCODE = 'ERL01';
    END IF;
    -- One-way flags: a reversal / unapply is itself undone by a new posting, never by clearing the flag.
    IF coalesce((to_jsonb(OLD) ->> 'reversed')::boolean, false) AND NOT coalesce((to_jsonb(NEW) ->> 'reversed')::boolean, false)
       OR coalesce((to_jsonb(OLD) ->> 'unapplied')::boolean, false) AND NOT coalesce((to_jsonb(NEW) ->> 'unapplied')::boolean, false) THEN
        RAISE EXCEPTION '%.%: reversed/unapplied flags cannot be cleared', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'ERL01';
    END IF;
    -- an undo (bank_account_statement.undone_at, CR #71) is recorded once and never changed
    IF (to_jsonb(OLD) ->> 'undone_at') IS NOT NULL AND (to_jsonb(NEW) -> 'undone_at') IS DISTINCT FROM (to_jsonb(OLD) -> 'undone_at') THEN
        RAISE EXCEPTION '%.%: undone_at is set once', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'ERL01';
    END IF;
    RETURN NEW;
END $$;
COMMENT ON FUNCTION platform.fn_guard_immutable() IS 'BEFORE UPDATE/DELETE/TRUNCATE guard for tables listed in platform.ledger_guard (applies to the owner too).';

-- Company context check + server-side created_at on every ledger insert.
CREATE FUNCTION platform.fn_ledger_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.company_id IS DISTINCT FROM platform.current_company_id() THEN
        RAISE EXCEPTION 'ledger row for company % written in the context of company %', NEW.company_id,
            platform.current_company_id() USING ERRCODE = 'ERT01';
    END IF;
    NEW.created_at := now();      -- transaction timestamp: ties every row to its posting transaction
    RETURN NEW;
END $$;

DO $$
DECLARE
    g record;
    v_schema text;
    v_table  text;
BEGIN
    FOR g IN SELECT table_name FROM platform.ledger_guard ORDER BY 1 LOOP
        v_schema := split_part(g.table_name, '.', 1);
        v_table  := split_part(g.table_name, '.', 2);
        EXECUTE format('CREATE TRIGGER trg_%s_immutable BEFORE UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform.fn_guard_immutable()',
                       v_table, v_schema, v_table);
        EXECUTE format('CREATE TRIGGER trg_%s_no_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION platform.fn_guard_immutable()',
                       v_table, v_schema, v_table);
        IF g.table_name NOT IN ('audit.row_change', 'audit.security_event') AND EXISTS (
               SELECT 1 FROM information_schema.columns
                WHERE table_schema = v_schema AND table_name = v_table AND column_name = 'company_id' AND is_nullable = 'NO') THEN
            EXECUTE format('CREATE TRIGGER trg_%s_before_insert BEFORE INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform.fn_ledger_before_insert()',
                           v_table, v_schema, v_table);
        END IF;
        -- Application roles: SELECT + INSERT only (D-C4)
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I.%I FROM app_user, app_worker, app_readonly', v_schema, v_table);
    END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- The only way to change whitelisted columns
-- -----------------------------------------------------------------------------
CREATE FUNCTION platform.fn_ledger_update(p_table text, p_key bigint, p_changes jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    g        platform.ledger_guard%ROWTYPE;
    v_bad    text[];
    v_cols   text;
    v_rows   integer;
BEGIN
    SELECT * INTO g FROM platform.ledger_guard WHERE table_name = p_table;
    IF NOT FOUND OR g.key_column IS NULL OR g.key_column = 'id' THEN
        RAISE EXCEPTION 'table % has no updatable system columns with a bigint key', p_table USING ERRCODE = 'ERL01';
    END IF;
    -- trigger_columns (e.g. remaining_amount, open) are NOT accepted here: they are derived caches.
    SELECT array_agg(k) INTO v_bad FROM jsonb_object_keys(p_changes) k WHERE NOT (k = ANY (g.mutable_columns));
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'column(s) % of % are not updatable', v_bad, p_table USING ERRCODE = 'ERL01';
    END IF;
    SELECT string_agg(format('%I', k), ', ') INTO v_cols FROM jsonb_object_keys(p_changes) k;
    IF v_cols IS NULL THEN
        RETURN 0;
    END IF;
    EXECUTE format('UPDATE %s t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $1) r) '
                   'WHERE t.company_id = platform.current_company_id() AND t.%I = $2',
                   p_table, v_cols,
                   (SELECT string_agg(format('r.%I', k), ', ') FROM jsonb_object_keys(p_changes) k),
                   p_table, g.key_column)
       USING p_changes, p_key;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION platform.fn_ledger_update(text, bigint, jsonb) IS
    'Updates whitelisted system columns (platform.ledger_guard.mutable_columns) of one ledger row of the current company, e.g. SELECT platform.fn_ledger_update(''gl.gl_entry'', 17, ''{"reversed":true,"reversed_by_entry_no":42}'').';
REVOKE ALL ON FUNCTION platform.fn_ledger_update(text, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_ledger_update(text, bigint, jsonb) TO app_user;

-- uuid-keyed append-only tables (key_column = 'id': archive_package, bank_account_statement; CR #51/#203)
CREATE FUNCTION platform.fn_ledger_update(p_table text, p_id uuid, p_changes jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    g        platform.ledger_guard%ROWTYPE;
    v_bad    text[];
    v_cols   text;
    v_rows   integer;
BEGIN
    SELECT * INTO g FROM platform.ledger_guard WHERE table_name = p_table;
    IF NOT FOUND OR g.key_column IS DISTINCT FROM 'id' THEN
        RAISE EXCEPTION 'table % has no updatable system columns with a uuid key', p_table USING ERRCODE = 'ERL01';
    END IF;
    SELECT array_agg(k) INTO v_bad FROM jsonb_object_keys(p_changes) k WHERE NOT (k = ANY (g.mutable_columns));
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'column(s) % of % are not updatable', v_bad, p_table USING ERRCODE = 'ERL01';
    END IF;
    SELECT string_agg(format('%I', k), ', ') INTO v_cols FROM jsonb_object_keys(p_changes) k;
    IF v_cols IS NULL THEN
        RETURN 0;
    END IF;
    EXECUTE format('UPDATE %s t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $1) r) '
                   'WHERE t.company_id = platform.current_company_id() AND t.id = $2',
                   p_table, v_cols, (SELECT string_agg(format('r.%I', k), ', ') FROM jsonb_object_keys(p_changes) k), p_table)
       USING p_changes, p_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION platform.fn_ledger_update(text, uuid, jsonb) IS
    'uuid-key variant of platform.fn_ledger_update for append-only tables keyed by id (ledger_guard.key_column = ''id''), e.g. platform.archive_package verification.';
REVOKE ALL ON FUNCTION platform.fn_ledger_update(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_ledger_update(text, uuid, jsonb) TO app_user;

-- User edits of open customer / vendor ledger entries (CR #70/#139, FR-PTY-014 AC1, BC CU103 Cust. Entry-Edit): due date
-- and on hold only, written to audit.row_change (ledger rows have no audit trigger). Engine updates (application,
-- reversal) keep using fn_ledger_update and are not change-logged: the detailed entries are their audit trail.
CREATE FUNCTION party.fn_edit_ledger_entry(p_table text, p_entry_no bigint, p_changes jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_bad   text[];
    v_old   jsonb;
    v_new   jsonb;
    v_open  boolean;
    v_id    uuid;
    v_rows  integer;
BEGIN
    IF p_table NOT IN ('party.cust_ledger_entry','party.vendor_ledger_entry') THEN
        RAISE EXCEPTION 'table % is not editable here', p_table USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(k) INTO v_bad FROM jsonb_object_keys(p_changes) k WHERE k NOT IN ('due_date','on_hold');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'column(s) % cannot be edited by a user', v_bad USING ERRCODE = 'ERL01';
    END IF;
    EXECUTE format('SELECT id, open, jsonb_build_object(''due_date'', due_date, ''on_hold'', on_hold) FROM %s '
                   'WHERE company_id = platform.current_company_id() AND entry_no = $1', p_table)
       INTO v_id, v_open, v_old USING p_entry_no;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'ledger entry % not found', p_entry_no USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_open THEN
        RAISE EXCEPTION 'ledger entry % is closed', p_entry_no USING ERRCODE = 'ERL01';
    END IF;
    v_rows := platform.fn_ledger_update(p_table, p_entry_no, p_changes);
    EXECUTE format('SELECT jsonb_build_object(''due_date'', due_date, ''on_hold'', on_hold) FROM %s '
                   'WHERE company_id = platform.current_company_id() AND entry_no = $1', p_table)
       INTO v_new USING p_entry_no;
    IF v_new IS DISTINCT FROM v_old THEN
        INSERT INTO audit.row_change (tenant_id, company_id, schema_name, table_name, row_id, operation, old_data, new_data,
                                      changed_columns, changed_by, request_id)
        VALUES (platform.current_tenant_id(), platform.current_company_id(), split_part(p_table, '.', 1), split_part(p_table, '.', 2),
                v_id, 'U', v_old || jsonb_build_object('entry_no', p_entry_no), v_new || jsonb_build_object('entry_no', p_entry_no),
                (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_new) k WHERE v_new -> k IS DISTINCT FROM v_old -> k),
                platform.current_user_id(), nullif(current_setting('app.request_id', true), ''));
    END IF;
    RETURN v_rows;
END $$;
COMMENT ON FUNCTION party.fn_edit_ledger_entry(text, bigint, jsonb) IS 'Edits due_date / on_hold of an open customer or vendor ledger entry of the current company and writes the change to audit.row_change (CR #70, FR-PTY-014). Permission: ACTION party.ledger_entry.edit.';
REVOKE ALL ON FUNCTION party.fn_edit_ledger_entry(text, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION party.fn_edit_ledger_entry(text, bigint, jsonb) TO app_user;

-- Undo of a posted bank reconciliation (CR #71/#192/#203, FR-BNK-014): marks the statement snapshot once; the
-- statement number can then be posted again (partial unique index WHERE undone_at IS NULL).
CREATE FUNCTION bank.fn_mark_account_statement_undone(p_id uuid, p_reason_code_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    UPDATE bank.bank_account_statement
       SET undone_at = now(), undone_by = platform.current_user_id(), undo_reason_code_id = p_reason_code_id
     WHERE company_id = platform.current_company_id() AND id = p_id AND undone_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bank account statement % not found or already undone', p_id USING ERRCODE = 'ERL01';
    END IF;
END $$;
COMMENT ON FUNCTION bank.fn_mark_account_statement_undone(uuid, uuid) IS 'Marks a posted bank account statement as undone (who, when, reason), once. The reversing bank/G-L entries are posted by the engine in the same transaction.';
REVOKE ALL ON FUNCTION bank.fn_mark_account_statement_undone(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bank.fn_mark_account_statement_undone(uuid, uuid) TO app_user;

-- -----------------------------------------------------------------------------
-- G/L posting rules
-- -----------------------------------------------------------------------------
-- Posting-date rule (D-D3), shared by G/L vouchers and by subledger rows without a voucher
-- (applications without G/L effect): the date must be in an OPEN period (closing vouchers: the
-- period may be CLOSED but not LOCKED) and ALWAYS inside the company posting window - D-D3 forbids
-- posting outside allow_posting_from/to for every right, closing vouchers included.
CREATE FUNCTION gl.fn_assert_posting_date_allowed(p_company_id uuid, p_date date, p_is_closing boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_status    text;
    v_fy_status text;
    v_from      date;
    v_to        date;
BEGIN
    SELECT p.status, fy.status INTO v_status, v_fy_status
      FROM gl.accounting_period p JOIN gl.fiscal_year fy ON fy.company_id = p.company_id AND fy.id = p.fiscal_year_id
     WHERE p.company_id = p_company_id AND p_date BETWEEN p.starting_date AND p.ending_date;
    -- SQLSTATE stays ERP01 for every case (specs map ERP01); DETAIL carries the machine-readable reason (CR #134).
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no accounting period for %', p_date USING ERRCODE = 'ERP01', DETAIL = 'gl.period_not_found';
    END IF;
    IF v_status = 'LOCKED' OR v_fy_status = 'LOCKED' THEN
        RAISE EXCEPTION 'period of % is locked', p_date USING ERRCODE = 'ERP01', DETAIL = 'gl.period_locked';
    ELSIF NOT p_is_closing AND (v_status <> 'OPEN' OR v_fy_status <> 'OPEN') THEN
        RAISE EXCEPTION 'period of % is %', p_date, v_status USING ERRCODE = 'ERP01', DETAIL = 'gl.period_closed';
    END IF;
    SELECT allow_posting_from, allow_posting_to INTO v_from, v_to
      FROM platform.company_setup WHERE company_id = p_company_id;
    IF (v_from IS NOT NULL AND p_date < v_from) OR (v_to IS NOT NULL AND p_date > v_to) THEN
        RAISE EXCEPTION 'posting date % outside the allowed window %..%', p_date, v_from, v_to
            USING ERRCODE = 'ERP01', DETAIL = 'gl.posting_date_outside_window';
    END IF;
END $$;
COMMENT ON FUNCTION gl.fn_assert_posting_date_allowed(uuid, date, boolean) IS 'D-D3 posting-date rule: OPEN period (closing: not LOCKED) and inside the company window for every posting. SQLSTATE ERP01; DETAIL = gl.period_not_found | gl.period_closed | gl.period_locked | gl.posting_date_outside_window (CR #134).';

-- Voucher header: date rule above. Applies to every role.
CREATE FUNCTION gl.fn_gl_transaction_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM gl.fn_assert_posting_date_allowed(NEW.company_id, NEW.posting_date, NEW.is_closing);
    RETURN NEW;
END $$;
CREATE TRIGGER trg_gl_transaction_period BEFORE INSERT ON gl.gl_transaction
    FOR EACH ROW EXECUTE FUNCTION gl.fn_gl_transaction_before_insert();

-- Entry: account postable, same date/closing flag as its voucher, voucher created in this DB transaction.
CREATE FUNCTION gl.fn_gl_entry_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    t gl.gl_transaction%ROWTYPE;
    a gl.gl_account%ROWTYPE;
BEGIN
    SELECT * INTO t FROM gl.gl_transaction WHERE company_id = NEW.company_id AND transaction_no = NEW.transaction_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'G/L transaction % does not exist', NEW.transaction_no USING ERRCODE = 'ERT01';
    END IF;
    IF t.created_at <> now() THEN
        RAISE EXCEPTION 'entries can only be added to G/L transaction % in the database transaction that created it',
            NEW.transaction_no USING ERRCODE = 'ERL01';
    END IF;
    IF NEW.posting_date <> t.posting_date OR NEW.is_closing <> t.is_closing OR NEW.gl_register_no <> t.gl_register_no THEN
        RAISE EXCEPTION 'G/L entry must have the posting date, closing flag and register of its transaction'
            USING ERRCODE = 'ERB02';
    END IF;
    SELECT * INTO a FROM gl.gl_account WHERE company_id = NEW.company_id AND id = NEW.gl_account_id;
    IF a.account_type <> 'POSTING' OR a.blocked THEN
        RAISE EXCEPTION 'G/L account % is not a posting account or is blocked', a.no USING ERRCODE = 'ERG01';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_gl_entry_rules BEFORE INSERT ON gl.gl_entry
    FOR EACH ROW EXECUTE FUNCTION gl.fn_gl_entry_before_insert();

-- Balanced transaction (D-C5): checked at COMMIT (or SET CONSTRAINTS ALL IMMEDIATE in preview), separately for
-- every transaction_no of the database transaction (two unbalanced vouchers that net to zero still fail).
-- The check functions are SECURITY DEFINER owned by app_rls_bypass and filter by NEW.company_id explicitly:
-- with RLS they would see only the company of the context active at COMMIT, so a request that switched
-- company before COMMIT would make the check read zero rows (false "no entries" / silently skipped cash check).
CREATE FUNCTION gl.fn_sum_transaction(p_company_id uuid, p_transaction_no bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_sum   numeric;
    v_count bigint;
BEGIN
    SELECT coalesce(sum(amount), 0), count(*) INTO v_sum, v_count
      FROM gl.gl_entry
     WHERE company_id = p_company_id AND transaction_no = p_transaction_no;
    IF v_sum <> 0 THEN
        RAISE EXCEPTION 'G/L transaction % of company % is not balanced (sum = %)', p_transaction_no, p_company_id, v_sum
            USING ERRCODE = 'ERB01';
    END IF;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'G/L transaction % has no entries', p_transaction_no USING ERRCODE = 'ERB01';
    END IF;
END $$;

-- Row trigger on gl_entry: only the row with the highest entry_no of its transaction sums the voucher,
-- so a voucher of n lines costs O(n) at COMMIT instead of O(n^2). Entries can only be added in the
-- database transaction that created the voucher (trg_gl_entry_rules), so the highest row is always queued.
CREATE FUNCTION gl.fn_check_transaction_balanced() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM gl.gl_entry e
                WHERE e.company_id = NEW.company_id AND e.transaction_no = NEW.transaction_no AND e.entry_no > NEW.entry_no) THEN
        RETURN NULL;
    END IF;
    PERFORM gl.fn_sum_transaction(NEW.company_id, NEW.transaction_no);
    RETURN NULL;
END $$;

-- Row trigger on gl_transaction: a voucher without entries (or unbalanced) fails even if no entry trigger ran.
CREATE FUNCTION gl.fn_check_transaction_has_entries() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    PERFORM gl.fn_sum_transaction(NEW.company_id, NEW.transaction_no);
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_gl_entry_balanced AFTER INSERT ON gl.gl_entry
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gl.fn_check_transaction_balanced();
CREATE CONSTRAINT TRIGGER trg_gl_transaction_has_entries AFTER INSERT ON gl.gl_transaction
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gl.fn_check_transaction_has_entries();

-- Every subledger / posted-document row that names a G/L transaction must carry its posting date and
-- belong to the database transaction that created it. Without this, a vat_entry / cust_ledger_entry /
-- bank_ledger_entry could reference an old voucher of an OPEN period while being dated into a CLOSED one,
-- or be appended to a committed voucher later. Rows with no voucher (detailed C/V application rows
-- without G/L effect, BC "Transaction No. 0") get the posting-date rule directly.
CREATE FUNCTION gl.fn_ledger_transaction_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_row  jsonb := to_jsonb(NEW);
    v_tx   bigint := (v_row ->> 'transaction_no')::bigint;
    v_date date := (v_row ->> 'posting_date')::date;
    t      record;
BEGIN
    IF v_tx IS NULL THEN
        -- voucher-less rows: applications without G/L (BC Transaction No. 0), TAX memo FA entries, zero-cost inventory
        -- postings (CR #96/#108, INV-06) still obey the period lock
        IF TG_TABLE_NAME IN ('detailed_cust_ledger_entry','detailed_vendor_ledger_entry','fa_ledger_entry','item_ledger_entry',
                             'value_entry','posted_item_journal') THEN
            PERFORM gl.fn_assert_posting_date_allowed(NEW.company_id, v_date, false);
        END IF;
        RETURN NEW;
    END IF;
    SELECT x.posting_date, x.created_at INTO t
      FROM gl.gl_transaction x WHERE x.company_id = NEW.company_id AND x.transaction_no = v_tx;
    IF NOT FOUND THEN
        RAISE EXCEPTION '%.%: G/L transaction % does not exist', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_tx USING ERRCODE = 'ERT01';
    END IF;
    IF t.created_at <> now() THEN
        RAISE EXCEPTION '%.%: rows can only reference G/L transaction % in the database transaction that created it',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_tx USING ERRCODE = 'ERL01';
    END IF;
    IF v_date IS DISTINCT FROM t.posting_date THEN
        RAISE EXCEPTION '%.%: posting date % differs from G/L transaction % (%)', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_date, v_tx,
            t.posting_date USING ERRCODE = 'ERB02';
    END IF;
    RETURN NEW;
END $$;
COMMENT ON FUNCTION gl.fn_ledger_transaction_check() IS 'BEFORE INSERT on every guarded table with transaction_no + posting_date (except gl_entry/gl_transaction): same date as the voucher, voucher created in this DB transaction; voucher-less rows (detailed C/V applications, TAX-book FA entries, zero-cost inventory documents) checked against D-D3.';

DO $$
DECLARE
    g record;
BEGIN
    FOR g IN
        SELECT split_part(lg.table_name, '.', 1) AS s, split_part(lg.table_name, '.', 2) AS t
          FROM platform.ledger_guard lg
         WHERE lg.table_name NOT IN ('gl.gl_entry','gl.gl_transaction')
           AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = split_part(lg.table_name, '.', 1)
                          AND c.table_name = split_part(lg.table_name, '.', 2) AND c.column_name = 'transaction_no')
           AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = split_part(lg.table_name, '.', 1)
                          AND c.table_name = split_part(lg.table_name, '.', 2) AND c.column_name = 'posting_date')
         ORDER BY 1, 2
    LOOP
        EXECUTE format('CREATE TRIGGER trg_%s_transaction_check BEFORE INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION gl.fn_ledger_transaction_check()',
                       g.t, g.s, g.t);
    END LOOP;
END
$$;

-- Global dimension columns on ledgers are derived from dimension_set_id (BC Global Dimension 1/2 Code on
-- the entry = value of the set), never taken from the caller: no cross-company or inconsistent values.
CREATE FUNCTION gl.fn_derive_global_dimensions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.dimension_set_id = 0 THEN
        NEW.global_dim_1_value_id := NULL;
        NEW.global_dim_2_value_id := NULL;
    ELSE
        SELECT (array_agg(e.dimension_value_id) FILTER (WHERE e.global_dimension_no = 1))[1],
               (array_agg(e.dimension_value_id) FILTER (WHERE e.global_dimension_no = 2))[1]
          INTO NEW.global_dim_1_value_id, NEW.global_dim_2_value_id
          FROM gl.dimension_set_entry e
         WHERE e.company_id = NEW.company_id AND e.dimension_set_id = NEW.dimension_set_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_gl_entry_global_dims BEFORE INSERT ON gl.gl_entry
    FOR EACH ROW EXECUTE FUNCTION gl.fn_derive_global_dimensions();
CREATE TRIGGER trg_cust_ledger_entry_global_dims BEFORE INSERT ON party.cust_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION gl.fn_derive_global_dimensions();
CREATE TRIGGER trg_vendor_ledger_entry_global_dims BEFORE INSERT ON party.vendor_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION gl.fn_derive_global_dimensions();
CREATE TRIGGER trg_bank_ledger_entry_global_dims BEFORE INSERT ON bank.bank_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION gl.fn_derive_global_dimensions();
CREATE TRIGGER trg_item_ledger_entry_global_dims BEFORE INSERT ON inv.item_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION gl.fn_derive_global_dimensions();

-- VAT date inside an OPEN VAT return period when one is defined (D-E9).
CREATE FUNCTION tax.fn_vat_entry_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status FROM tax.vat_return_period
     WHERE company_id = NEW.company_id AND NEW.vat_date BETWEEN starting_date AND ending_date;
    IF FOUND AND v_status <> 'OPEN' AND NEW.entry_type <> 'SETTLEMENT' THEN
        RAISE EXCEPTION 'VAT period of % is %', NEW.vat_date, v_status USING ERRCODE = 'ERV01';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_vat_entry_period BEFORE INSERT ON tax.vat_entry
    FOR EACH ROW EXECUTE FUNCTION tax.fn_vat_entry_before_insert();

-- VAT return period status machine: OPEN <-> CLOSED -> SUBMITTED; a filed (SUBMITTED) period is final,
-- otherwise reopening it would let VAT entries be dated into a return already filed with the tax office.
CREATE FUNCTION tax.fn_vat_return_period_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF platform.fn_purge_in_progress(OLD.tenant_id) THEN
            RETURN OLD;
        END IF;
        IF OLD.status <> 'OPEN' OR EXISTS (SELECT 1 FROM tax.vat_entry e WHERE e.company_id = OLD.company_id
                                              AND e.vat_date BETWEEN OLD.starting_date AND OLD.ending_date) THEN
            RAISE EXCEPTION 'VAT return period % with entries or not OPEN cannot be deleted', OLD.starting_date USING ERRCODE = 'ERP02';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status = 'SUBMITTED' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.starting_date <> OLD.starting_date
                                     OR NEW.ending_date <> OLD.ending_date) THEN
        RAISE EXCEPTION 'VAT return period % is submitted (final)', OLD.starting_date USING ERRCODE = 'ERP02';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_vat_return_period_status BEFORE UPDATE OR DELETE ON tax.vat_return_period
    FOR EACH ROW EXECUTE FUNCTION tax.fn_vat_return_period_status();

-- Cash may not go negative (D-G1): checked at COMMIT for every CASH account (D-G1 has no opt-out) and for
-- other accounts with prevent_negative_balance. SECURITY DEFINER (app_rls_bypass) for the same reason as the
-- balance check: under RLS a company switch before COMMIT would make the check see no rows and pass.
CREATE FUNCTION bank.fn_check_non_negative_cash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    v_min numeric;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM bank.bank_account
                    WHERE company_id = NEW.company_id AND id = NEW.bank_account_id AND (kind = 'CASH' OR prevent_negative_balance)) THEN
        RETURN NULL;
    END IF;
    -- lowest running balance on any date >= the new entry's date
    SELECT min(running) INTO v_min FROM (
        SELECT sum(sum(amount)) OVER (ORDER BY posting_date) AS running, posting_date
          FROM bank.bank_ledger_entry
         WHERE company_id = NEW.company_id AND bank_account_id = NEW.bank_account_id
         GROUP BY posting_date) d
     WHERE d.posting_date >= NEW.posting_date;
    IF v_min < 0 THEN
        RAISE EXCEPTION 'cash account balance would become negative (%)', v_min USING ERRCODE = 'ERC01';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_bank_ledger_entry_non_negative AFTER INSERT ON bank.bank_ledger_entry
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank.fn_check_non_negative_cash();

-- Accounting period status machine: OPEN <-> CLOSED -> LOCKED; LOCKED is final (D-D3). Second line of defence for the
-- app rules (CR #66, #213/#221; SEC-POST-08, BR-PER-16): only a CLOSED period can be locked; December can be locked only
-- after the year-end close (fiscal year CLOSED); a period cannot be reopened while December of its year is LOCKED
-- (the reopened year could never be closed again).
CREATE FUNCTION gl.fn_accounting_period_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_fy_status text;
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status = 'LOCKED' THEN
            RAISE EXCEPTION 'accounting period % is locked', OLD.name USING ERRCODE = 'ERP02';
        END IF;
        IF NEW.starting_date <> OLD.starting_date OR NEW.ending_date <> OLD.ending_date THEN
            RAISE EXCEPTION 'period dates cannot change together with the status' USING ERRCODE = 'ERP02';
        END IF;
        IF OLD.status = 'OPEN' AND NEW.status = 'LOCKED' THEN
            RAISE EXCEPTION 'accounting period % must be CLOSED before it is locked', OLD.name USING ERRCODE = 'ERP02';
        END IF;
        IF NEW.status = 'LOCKED' AND extract(month FROM NEW.starting_date) = 12 THEN
            SELECT status INTO v_fy_status FROM gl.fiscal_year WHERE company_id = NEW.company_id AND id = NEW.fiscal_year_id;
            IF v_fy_status NOT IN ('CLOSED','LOCKED') THEN
                RAISE EXCEPTION 'December % can be locked only after the year-end close', OLD.name USING ERRCODE = 'ERP02';
            END IF;
        END IF;
        IF OLD.status = 'CLOSED' AND NEW.status = 'OPEN' AND EXISTS (
               SELECT 1 FROM gl.accounting_period d
                WHERE d.company_id = NEW.company_id AND d.fiscal_year_id = NEW.fiscal_year_id
                  AND extract(month FROM d.starting_date) = 12 AND d.status = 'LOCKED') THEN
            RAISE EXCEPTION 'accounting period % cannot be reopened: December of its year is locked', OLD.name USING ERRCODE = 'ERP02';
        END IF;
        NEW.status_changed_at := now();
        NEW.status_changed_by := platform.current_user_id();
    ELSIF NEW.starting_date <> OLD.starting_date OR NEW.ending_date <> OLD.ending_date THEN
        IF EXISTS (SELECT 1 FROM gl.gl_transaction WHERE company_id = OLD.company_id
                      AND posting_date BETWEEN OLD.starting_date AND OLD.ending_date) THEN
            RAISE EXCEPTION 'period with postings cannot change its dates' USING ERRCODE = 'ERP02';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_accounting_period_status BEFORE UPDATE ON gl.accounting_period
    FOR EACH ROW EXECUTE FUNCTION gl.fn_accounting_period_status();

CREATE FUNCTION gl.fn_fiscal_year_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'LOCKED' THEN
        RAISE EXCEPTION 'fiscal year % is locked', OLD.year USING ERRCODE = 'ERP02';
    END IF;
    -- CR #66: a fiscal year is locked only when every month of it is LOCKED
    IF NEW.status = 'LOCKED' AND OLD.status <> 'LOCKED' AND EXISTS (
           SELECT 1 FROM gl.accounting_period p WHERE p.company_id = NEW.company_id AND p.fiscal_year_id = NEW.id AND p.status <> 'LOCKED') THEN
        RAISE EXCEPTION 'fiscal year % can be locked only when all its periods are LOCKED', OLD.year USING ERRCODE = 'ERP02';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_fiscal_year_status BEFORE UPDATE ON gl.fiscal_year
    FOR EACH ROW EXECUTE FUNCTION gl.fn_fiscal_year_status();

-- Periods and fiscal years with postings are never deleted.
REVOKE DELETE ON gl.accounting_period, gl.fiscal_year FROM app_user, app_worker;

-- eBarimt documents: identity, amounts and the request snapshot are frozen once created; only the status side changes,
-- along the whitelisted transitions (CR #18 SCR-18, STM-02): a second network send is impossible at DB level.
CREATE FUNCTION ebarimt.fn_ebarimt_document_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF platform.fn_purge_in_progress(OLD.tenant_id) THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'eBarimt documents are never deleted' USING ERRCODE = 'ERL01';
    END IF;
    IF TG_OP = 'INSERT' THEN
        -- PENDING only via INSERT; a MANUAL_VOID (no network call) may be recorded directly as SUCCESS
        IF NOT (NEW.status = 'PENDING' OR (NEW.operation = 'MANUAL_VOID' AND NEW.status = 'SUCCESS')) OR NEW.attempt_count <> 0 THEN
            RAISE EXCEPTION 'a new eBarimt document starts as PENDING with attempt_count 0' USING ERRCODE = 'ERL01';
        END IF;
        RETURN NEW;
    END IF;
    IF (NEW.source_type, NEW.source_id, NEW.operation, NEW.ebarimt_type, NEW.ebarimt_pos_id, NEW.bill_date, NEW.bill_seq,
        NEW.bill_id_suffix, NEW.merchant_tin, NEW.customer_tin, NEW.consumer_no, NEW.inactive_ddtd, NEW.parent_ddtd,
        NEW.report_month, NEW.total_amount, NEW.total_vat, NEW.total_city_tax, NEW.request_sha256,
        NEW.branch_no, NEW.pos_no, NEW.district_code, NEW.posapi_instance_id, NEW.easy, NEW.replaces_document_id,
        NEW.resent_from_document_id)
       IS DISTINCT FROM
       (OLD.source_type, OLD.source_id, OLD.operation, OLD.ebarimt_type, OLD.ebarimt_pos_id, OLD.bill_date, OLD.bill_seq,
        OLD.bill_id_suffix, OLD.merchant_tin, OLD.customer_tin, OLD.consumer_no, OLD.inactive_ddtd, OLD.parent_ddtd,
        OLD.report_month, OLD.total_amount, OLD.total_vat, OLD.total_city_tax, OLD.request_sha256,
        OLD.branch_no, OLD.pos_no, OLD.district_code, OLD.posapi_instance_id, OLD.easy, OLD.replaces_document_id,
        OLD.resent_from_document_id) THEN
        RAISE EXCEPTION 'eBarimt document request data is immutable' USING ERRCODE = 'ERL01';
    END IF;
    IF NEW.attempt_count < OLD.attempt_count THEN
        RAISE EXCEPTION 'attempt_count never decreases' USING ERRCODE = 'ERL01';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT ((OLD.status = 'PENDING' AND NEW.status IN ('SENT','ERROR','CANCELLED'))
             OR (OLD.status = 'PENDING' AND NEW.status = 'SUCCESS' AND NEW.operation = 'MANUAL_VOID')
             OR (OLD.status = 'SENT'    AND NEW.status IN ('SUCCESS','ERROR','UNKNOWN'))
             OR (OLD.status = 'UNKNOWN' AND NEW.status IN ('SUCCESS','CANCELLED'))
             OR (OLD.status = 'ERROR'   AND NEW.status = 'CANCELLED')
             OR (OLD.status = 'SUCCESS' AND NEW.status = 'CANCELLED')) THEN
            RAISE EXCEPTION 'eBarimt document in status % cannot become %', OLD.status, NEW.status USING ERRCODE = 'ERL01';
        END IF;
        IF NEW.status = 'SENT' AND NEW.attempt_count <> OLD.attempt_count + 1 THEN
            RAISE EXCEPTION 'every send increments attempt_count by one' USING ERRCODE = 'ERL01';
        END IF;
    ELSIF NEW.attempt_count <> OLD.attempt_count THEN
        RAISE EXCEPTION 'attempt_count changes only with a send (-> SENT)' USING ERRCODE = 'ERL01';
    END IF;
    IF OLD.ddtd IS NOT NULL AND NEW.ddtd IS DISTINCT FROM OLD.ddtd THEN
        RAISE EXCEPTION 'ДДТД cannot change once assigned' USING ERRCODE = 'ERL01';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_ebarimt_document_guard BEFORE INSERT OR UPDATE OR DELETE ON ebarimt.ebarimt_document
    FOR EACH ROW EXECUTE FUNCTION ebarimt.fn_ebarimt_document_guard();
REVOKE DELETE ON ebarimt.ebarimt_document FROM app_user, app_worker;

-- Saved statements: FINAL is final (CR #219; fn_guard_immutable only protects reversed / unapplied).
CREATE FUNCTION rpt.fn_statement_snapshot_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'FINAL' AND NEW.status <> 'FINAL' THEN
        RAISE EXCEPTION 'statement snapshot % is FINAL', OLD.snapshot_no USING ERRCODE = 'ERL01';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_statement_snapshot_status BEFORE UPDATE ON rpt.statement_snapshot
    FOR EACH ROW EXECUTE FUNCTION rpt.fn_statement_snapshot_status();

-- Attachments of posted documents (owner table is ledger-guarded) are never deleted; only the AV scan result changes
-- (CR #56, 13 §6.3 "posted баримтын хавсралтыг устгахгүй").
CREATE FUNCTION platform.fn_attachment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$   -- reads the global platform.ledger_guard catalog
BEGIN
    IF NOT EXISTS (SELECT 1 FROM platform.ledger_guard g WHERE g.table_name = OLD.owner_table) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF platform.fn_purge_in_progress(OLD.tenant_id) THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'attachments of posted documents cannot be deleted' USING ERRCODE = 'ERL01';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['av_status','av_checked_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['av_status','av_checked_at']) THEN
        RAISE EXCEPTION 'attachments of posted documents are immutable (except the AV status)' USING ERRCODE = 'ERL01';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_attachment_guard BEFORE UPDATE OR DELETE ON platform.attachment
    FOR EACH ROW EXECUTE FUNCTION platform.fn_attachment_guard();

-- Depreciation run lines are frozen once the run is no longer DRAFT (CR #95).
CREATE FUNCTION fa.fn_depreciation_run_line_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
BEGIN
    SELECT r.status INTO v_status FROM fa.depreciation_run r
     WHERE r.company_id = coalesce(NEW.company_id, OLD.company_id) AND r.id = coalesce(NEW.depreciation_run_id, OLD.depreciation_run_id);
    IF FOUND AND v_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'lines of a % depreciation run cannot change', v_status USING ERRCODE = 'ERL01';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_depreciation_run_line_guard BEFORE INSERT OR UPDATE OR DELETE ON fa.depreciation_run_line
    FOR EACH ROW EXECUTE FUNCTION fa.fn_depreciation_run_line_guard();

-- -----------------------------------------------------------------------------
-- RLS-independent COMMIT-time checks: owned by app_rls_bypass (BYPASSRLS), read-only, filter by company.
-- -----------------------------------------------------------------------------
GRANT CREATE ON SCHEMA gl, bank TO app_rls_bypass;
GRANT SELECT ON gl.gl_entry, bank.bank_ledger_entry, bank.bank_account TO app_rls_bypass;
ALTER FUNCTION gl.fn_sum_transaction(uuid, bigint) OWNER TO app_rls_bypass;
ALTER FUNCTION gl.fn_check_transaction_balanced() OWNER TO app_rls_bypass;
ALTER FUNCTION gl.fn_check_transaction_has_entries() OWNER TO app_rls_bypass;
ALTER FUNCTION bank.fn_check_non_negative_cash() OWNER TO app_rls_bypass;
REVOKE ALL ON FUNCTION gl.fn_sum_transaction(uuid, bigint) FROM PUBLIC;
REVOKE CREATE ON SCHEMA gl, bank FROM app_rls_bypass;
