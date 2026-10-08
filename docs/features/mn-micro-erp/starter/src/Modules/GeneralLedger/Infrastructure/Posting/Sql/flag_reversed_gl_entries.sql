-- Reversal (BR-PST-47): whitelisted update of the original entries through the guard function (D-C4).
SELECT platform.fn_ledger_update('gl.gl_entry', u.orig_entry_no,
                                 jsonb_build_object('reversed', true, 'reversed_by_entry_no', u.new_entry_no))
  FROM unnest(@orig_entry_nos::bigint[], @new_entry_nos::bigint[]) AS u(orig_entry_no, new_entry_no);
