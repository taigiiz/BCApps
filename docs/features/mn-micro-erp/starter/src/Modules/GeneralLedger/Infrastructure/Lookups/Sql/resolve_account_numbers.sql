-- Account number -> id of the current company.
SELECT no, id FROM gl.gl_account WHERE company_id = @company_id AND no = ANY(@account_nos);
