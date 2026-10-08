-- Accounts used by the run (posting type, blocked, direct posting: BC CU11, ERG01).
SELECT id, no, account_type, blocked, direct_posting
  FROM gl.gl_account
 WHERE company_id = @company_id AND id = ANY(@account_ids);
