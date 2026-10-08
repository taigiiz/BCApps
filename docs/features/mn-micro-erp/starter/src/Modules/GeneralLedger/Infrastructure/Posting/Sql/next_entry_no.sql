-- First number of a reserved block of a ledger counter (Entry / Transaction / Register No., D-C6, D-K3).
SELECT platform.fn_next_entry_no(@ledger, @count);
