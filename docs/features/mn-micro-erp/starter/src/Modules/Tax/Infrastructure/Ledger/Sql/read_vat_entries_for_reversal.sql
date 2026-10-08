-- VAT entries of the transactions being reversed, with the settlement flag and the VAT period status of their VAT date.
SELECT v.entry_no, v.transaction_no, v.gl_entry_no, v.closed, v.vat_date, p.status AS vat_period_status
  FROM tax.vat_entry v
  LEFT JOIN tax.vat_return_period p ON p.company_id = v.company_id AND v.vat_date BETWEEN p.starting_date AND p.ending_date
 WHERE v.company_id = @company_id AND v.transaction_no = ANY(@transaction_nos)
 ORDER BY v.entry_no;
