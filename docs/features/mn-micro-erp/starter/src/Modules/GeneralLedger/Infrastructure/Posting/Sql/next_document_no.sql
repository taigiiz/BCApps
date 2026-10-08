-- Gapless legal number (D-C7): counter row locked until COMMIT; a rollback leaves no gap.
SELECT platform.fn_next_document_no(@series_code, @posting_date);
