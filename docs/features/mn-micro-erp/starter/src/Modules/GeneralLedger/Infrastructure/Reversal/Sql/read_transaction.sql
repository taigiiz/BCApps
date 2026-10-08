-- The voucher to reverse (read under the posting lock; ledgers have no UPDATE privilege, so no row lock is taken).
SELECT id, transaction_no, gl_register_no, posting_date, is_closing, document_type, document_no, source_code, description,
       reverses_transaction_no, reversed_by_transaction_no
  FROM gl.gl_transaction
 WHERE company_id = @company_id AND transaction_no = @transaction_no;
