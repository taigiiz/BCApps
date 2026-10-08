-- VAT posting setup (BC T325) of one VAT Bus. x VAT Prod. combination + the company's rounding settings.
SELECT s.vat_calculation_type, s.vat_identifier, s.vat_category, s.vat_percent, s.non_deductible_vat_percent,
       s.ebarimt_tax_type, s.blocked, s.sales_vat_account_id, s.purchase_vat_account_id,
       cs.amount_rounding_precision, cs.vat_rounding_type
  FROM tax.vat_posting_setup s
  JOIN tax.vat_bus_posting_group b ON b.company_id = s.company_id AND b.id = s.vat_bus_posting_group_id
  JOIN tax.vat_prod_posting_group p ON p.company_id = s.company_id AND p.id = s.vat_prod_posting_group_id
  JOIN platform.company_setup cs ON cs.company_id = s.company_id
 WHERE s.company_id = @company_id AND b.code = @vat_bus AND p.code = @vat_prod;
