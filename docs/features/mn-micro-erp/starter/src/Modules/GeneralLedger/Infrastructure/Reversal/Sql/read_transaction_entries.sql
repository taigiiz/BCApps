-- Entries of the voucher to reverse, newest first (BC Reversal Entry order).
SELECT entry_no, gl_account_id, amount, vat_amount, gen_posting_type, gen_bus_posting_group, gen_prod_posting_group,
       vat_bus_posting_group, vat_prod_posting_group, vat_date, document_date, external_document_no, description,
       CASE WHEN bal_account_type = 'GL_ACCOUNT' THEN bal_account_id END AS bal_gl_account_id, dimension_set_id
  FROM gl.gl_entry
 WHERE company_id = @company_id AND transaction_no = @transaction_no
 ORDER BY entry_no DESC;
