-- Mirror VAT entries of a reversal (05-posting-engine.md §5.10): opposite sign, same VAT date, linked to the reversing base G/L entry,
-- reversed = true + reversed_entry_no; then the G/L-VAT links of the mirrors. The ONLY other insert into tax.vat_entry (rule 5).
WITH map AS (
    SELECT * FROM unnest(@orig_entry_nos::bigint[], @new_entry_nos::bigint[], @new_transaction_nos::bigint[], @new_gl_entry_nos::bigint[])
           AS m(orig_entry_no, new_entry_no, new_transaction_no, new_gl_entry_no)
), inserted AS (
    INSERT INTO tax.vat_entry (tenant_id, company_id, entry_no, entry_type, posting_date, vat_date, document_date, document_type, document_no,
                               external_document_no, base, amount, non_deductible_base, non_deductible_amount, vat_difference,
                               vat_calculation_type, vat_percent, vat_identifier, vat_category, vat_bus_posting_group, vat_prod_posting_group,
                               gen_bus_posting_group, gen_prod_posting_group, ebarimt_tax_type, bill_to_pay_to_type, bill_to_pay_to_id,
                               bill_to_pay_to_no, party_tin, country_code, transaction_no, gl_register_no, gl_entry_no,
                               deductible_confirmed, deductible_confirmed_at, deductible_confirmed_by, supplier_ebarimt_id,
                               non_deductible_reason, tax_parameter_id, excluded_from_turnover, customs_declaration_id,
                               source_code, reason_code_id, reversed, reversed_entry_no)
    SELECT v.tenant_id, v.company_id, m.new_entry_no, v.entry_type, v.posting_date, v.vat_date, v.document_date, v.document_type, v.document_no,
           v.external_document_no, -v.base, -v.amount, -v.non_deductible_base, -v.non_deductible_amount, -v.vat_difference,
           v.vat_calculation_type, v.vat_percent, v.vat_identifier, v.vat_category, v.vat_bus_posting_group, v.vat_prod_posting_group,
           v.gen_bus_posting_group, v.gen_prod_posting_group, v.ebarimt_tax_type, v.bill_to_pay_to_type, v.bill_to_pay_to_id,
           v.bill_to_pay_to_no, v.party_tin, v.country_code, m.new_transaction_no, @register_no, m.new_gl_entry_no,
           v.deductible_confirmed, v.deductible_confirmed_at, v.deductible_confirmed_by, v.supplier_ebarimt_id,
           v.non_deductible_reason, v.tax_parameter_id, v.excluded_from_turnover, v.customs_declaration_id,
           'REVERSAL', @reason_code_id, true, v.entry_no
      FROM map m
      JOIN tax.vat_entry v ON v.company_id = @company_id AND v.entry_no = m.orig_entry_no
    RETURNING entry_no, gl_entry_no
)
INSERT INTO tax.gl_entry_vat_entry_link (tenant_id, company_id, gl_entry_no, vat_entry_no)
SELECT @tenant_id, @company_id, i.gl_entry_no, i.entry_no FROM inserted i WHERE i.gl_entry_no IS NOT NULL;
