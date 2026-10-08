-- VAT return period status of each VAT date (D-E9). No row = no VAT period defined for the date (allowed).
SELECT d.vat_date, p.status
  FROM unnest(@vat_dates::date[]) AS d(vat_date)
  LEFT JOIN tax.vat_return_period p ON p.company_id = @company_id AND d.vat_date BETWEEN p.starting_date AND p.ending_date;
