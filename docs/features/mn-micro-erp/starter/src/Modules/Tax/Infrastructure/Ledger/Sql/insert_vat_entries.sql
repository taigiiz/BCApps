-- VAT ledger (BC T254): the ONLY insert into tax.vat_entry of a posting (architecture rule 5). One row per VAT ledger line,
-- linked to its BASE G/L entry (gl_entry_no + tax.gl_entry_vat_entry_link, R-VAT-20).
WITH rows AS (
    SELECT *
      FROM unnest(@entry_nos::bigint[], @entry_types::text[], @posting_dates::date[], @vat_dates::date[], @document_types::text[],
                  @document_nos::text[], @bases::numeric[], @amounts::numeric[], @calculation_types::text[], @vat_percents::numeric[],
                  @vat_identifiers::text[], @vat_categories::text[], @vat_bus_groups::text[], @vat_prod_groups::text[],
                  @gen_bus_groups::text[], @gen_prod_groups::text[], @ebarimt_tax_types::text[], @transaction_nos::bigint[],
                  @gl_entry_nos::bigint[], @source_codes::text[], @reason_code_ids::uuid[], @supplier_ebarimt_ids::text[])
           AS r(entry_no, entry_type, posting_date, vat_date, document_type, document_no, base, amount, calculation_type, vat_percent,
                vat_identifier, vat_category, vat_bus_group, vat_prod_group, gen_bus_group, gen_prod_group, ebarimt_tax_type,
                transaction_no, gl_entry_no, source_code, reason_code_id, supplier_ebarimt_id)
), inserted AS (
    INSERT INTO tax.vat_entry (tenant_id, company_id, entry_no, entry_type, posting_date, vat_date, document_type, document_no, base, amount,
                               vat_calculation_type, vat_percent, vat_identifier, vat_category, vat_bus_posting_group, vat_prod_posting_group,
                               gen_bus_posting_group, gen_prod_posting_group, ebarimt_tax_type, transaction_no, gl_register_no, gl_entry_no,
                               source_code, reason_code_id, supplier_ebarimt_id)
    SELECT @tenant_id, @company_id, r.entry_no, r.entry_type, r.posting_date, r.vat_date, r.document_type, r.document_no, r.base, r.amount,
           r.calculation_type, r.vat_percent, r.vat_identifier, r.vat_category, r.vat_bus_group, r.vat_prod_group,
           r.gen_bus_group, r.gen_prod_group, r.ebarimt_tax_type, r.transaction_no, @register_no, r.gl_entry_no,
           r.source_code, r.reason_code_id, r.supplier_ebarimt_id
      FROM rows r
    RETURNING entry_no, gl_entry_no
)
INSERT INTO tax.gl_entry_vat_entry_link (tenant_id, company_id, gl_entry_no, vat_entry_no)
SELECT @tenant_id, @company_id, i.gl_entry_no, i.entry_no FROM inserted i;
