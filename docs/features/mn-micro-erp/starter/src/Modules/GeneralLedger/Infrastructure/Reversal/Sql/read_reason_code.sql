-- Reason code by code (BR-PST-20).
SELECT id, blocked FROM platform.reason_code WHERE company_id = @company_id AND code = @code;
