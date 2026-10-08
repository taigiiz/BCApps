-- Whitelisted update of the originals through the SECURITY DEFINER guard function (D-C4): reversed + reversed_by_entry_no.
SELECT platform.fn_ledger_update('tax.vat_entry', u.orig_entry_no,
                                 jsonb_build_object('reversed', true, 'reversed_by_entry_no', u.new_entry_no))
  FROM unnest(@orig_entry_nos::bigint[], @new_entry_nos::bigint[]) AS u(orig_entry_no, new_entry_no);
