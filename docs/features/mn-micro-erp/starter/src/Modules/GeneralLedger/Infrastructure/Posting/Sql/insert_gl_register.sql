-- G/L register (BC T45): one row per posting run, written last (from/to G/L and VAT entry numbers).
INSERT INTO gl.gl_register (tenant_id, company_id, no, from_entry_no, to_entry_no, from_vat_entry_no, to_vat_entry_no, source_code,
                            journal_template_code, journal_batch_code, request_id)
VALUES (@tenant_id, @company_id, @register_no, @from_entry_no, @to_entry_no, @from_vat_entry_no, @to_vat_entry_no, @source_code,
        @journal_template_code, @journal_batch_code, @request_id);
