-- Reason codes used by the run.
SELECT id, blocked FROM platform.reason_code WHERE company_id = @company_id AND id = ANY(@reason_code_ids);
