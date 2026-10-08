-- G/L entries (BC T17): signed amount only, debit/credit are generated columns (D-C3). Append-only (D-C4); the balance per
-- transaction is checked at COMMIT / SET CONSTRAINTS ALL IMMEDIATE by trg_gl_entry_balanced (ERB01).
INSERT INTO gl.gl_entry (tenant_id, company_id, entry_no, transaction_no, gl_register_no, gl_account_id, posting_date, is_closing,
                         document_type, document_no, document_date, external_document_no, description, amount, vat_amount,
                         gen_posting_type, gen_bus_posting_group, gen_prod_posting_group, vat_bus_posting_group, vat_prod_posting_group,
                         vat_date, bal_account_type, bal_account_id, dimension_set_id, source_code, reason_code_id,
                         journal_template_code, journal_batch_code, system_created, reversed, reversed_entry_no)
SELECT @tenant_id, @company_id, e.entry_no, e.transaction_no, @register_no, e.gl_account_id, e.posting_date, e.is_closing,
       e.document_type, e.document_no, e.document_date, e.external_document_no, e.description, e.amount, e.vat_amount,
       e.gen_posting_type, e.gen_bus_group, e.gen_prod_group, e.vat_bus_group, e.vat_prod_group,
       e.vat_date, CASE WHEN e.bal_account_id IS NULL THEN NULL ELSE 'GL_ACCOUNT' END, e.bal_account_id, e.dimension_set_id, e.source_code,
       e.reason_code_id, @journal_template_code, @journal_batch_code, e.system_created, e.reversed_entry_no IS NOT NULL, e.reversed_entry_no
  FROM unnest(@entry_nos::bigint[], @transaction_nos::bigint[], @gl_account_ids::uuid[], @posting_dates::date[], @is_closing::boolean[],
              @document_types::text[], @document_nos::text[], @document_dates::date[], @external_document_nos::text[], @descriptions::text[],
              @amounts::numeric[], @vat_amounts::numeric[], @gen_posting_types::text[], @gen_bus_groups::text[], @gen_prod_groups::text[],
              @vat_bus_groups::text[], @vat_prod_groups::text[], @vat_dates::date[], @bal_account_ids::uuid[], @dimension_set_ids::bigint[],
              @source_codes::text[], @reason_code_ids::uuid[], @system_created::boolean[], @reversed_entry_nos::bigint[])
       AS e(entry_no, transaction_no, gl_account_id, posting_date, is_closing, document_type, document_no, document_date, external_document_no,
            description, amount, vat_amount, gen_posting_type, gen_bus_group, gen_prod_group, vat_bus_group, vat_prod_group, vat_date,
            bal_account_id, dimension_set_id, source_code, reason_code_id, system_created, reversed_entry_no);
