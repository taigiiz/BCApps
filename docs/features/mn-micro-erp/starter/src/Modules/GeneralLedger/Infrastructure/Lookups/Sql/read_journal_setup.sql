-- Journal template / batch (BC T80/T232): source code and posting number series (batch overrides template).
SELECT b.id, t.code, b.code, t.template_type, t.source_code, coalesce(bs.code, ts.code) AS posting_series_code,
       cs.amount_rounding_precision
  FROM gl.journal_template t
  JOIN gl.journal_batch b ON b.company_id = t.company_id AND b.journal_template_id = t.id AND b.code = @batch_code
  LEFT JOIN platform.number_series ts ON ts.company_id = t.company_id AND ts.id = t.posting_no_series_id
  LEFT JOIN platform.number_series bs ON bs.company_id = b.company_id AND bs.id = b.posting_no_series_id
  JOIN platform.company_setup cs ON cs.company_id = t.company_id
 WHERE t.company_id = @company_id AND t.code = @template_code;
