-- Period, fiscal year and posting window of every voucher date (same rule as gl.fn_assert_posting_date_allowed, ERP01).
SELECT d.posting_date, p.status AS period_status, fy.status AS fiscal_year_status, cs.allow_posting_from, cs.allow_posting_to
  FROM unnest(@posting_dates::date[]) AS d(posting_date)
  LEFT JOIN gl.accounting_period p ON p.company_id = @company_id AND d.posting_date BETWEEN p.starting_date AND p.ending_date
  LEFT JOIN gl.fiscal_year fy ON fy.company_id = p.company_id AND fy.id = p.fiscal_year_id
  LEFT JOIN platform.company_setup cs ON cs.company_id = @company_id;
