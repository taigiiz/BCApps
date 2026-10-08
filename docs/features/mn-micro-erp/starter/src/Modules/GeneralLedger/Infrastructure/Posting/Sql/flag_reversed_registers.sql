-- Reversal (BR-PST-48): an original register is flagged once ALL of its transactions are reversed.
SELECT platform.fn_ledger_update('gl.gl_register', r.no, '{"reversed": true}'::jsonb)
  FROM (SELECT DISTINCT t.gl_register_no AS no
          FROM gl.gl_transaction t
         WHERE t.company_id = @company_id AND t.transaction_no = ANY(@orig_transaction_nos)) r
 WHERE NOT EXISTS (SELECT 1 FROM gl.gl_transaction x
                    WHERE x.company_id = @company_id AND x.gl_register_no = r.no AND x.reversed_by_transaction_no IS NULL);
