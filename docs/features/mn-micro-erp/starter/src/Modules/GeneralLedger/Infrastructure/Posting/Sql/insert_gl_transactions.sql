-- Voucher headers (BC T57 extended). trg_gl_transaction_period re-checks the posting date (ERP01).
INSERT INTO gl.gl_transaction (tenant_id, company_id, transaction_no, gl_register_no, posting_date, is_closing, document_type, document_no,
                               source_code, reason_code_id, description, reverses_transaction_no)
SELECT @tenant_id, @company_id, t.transaction_no, @register_no, t.posting_date, t.is_closing, t.document_type, t.document_no,
       t.source_code, t.reason_code_id, t.description, t.reverses_transaction_no
  FROM unnest(@transaction_nos::bigint[], @posting_dates::date[], @is_closing::boolean[], @document_types::text[], @document_nos::text[],
              @source_codes::text[], @reason_code_ids::uuid[], @descriptions::text[], @reverses_transaction_nos::bigint[])
       AS t(transaction_no, posting_date, is_closing, document_type, document_no, source_code, reason_code_id, description,
            reverses_transaction_no);
