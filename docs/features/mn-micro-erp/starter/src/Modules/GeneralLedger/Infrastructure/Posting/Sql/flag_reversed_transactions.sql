-- Reversal (BR-PST-47): the original voucher points to its reversing voucher.
SELECT platform.fn_ledger_update('gl.gl_transaction', u.orig_transaction_no,
                                 jsonb_build_object('reversed_by_transaction_no', u.new_transaction_no))
  FROM unnest(@orig_transaction_nos::bigint[], @new_transaction_nos::bigint[]) AS u(orig_transaction_no, new_transaction_no);
