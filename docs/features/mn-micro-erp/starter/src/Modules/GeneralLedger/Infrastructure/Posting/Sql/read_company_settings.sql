-- LCY rounding precision of the company (D-C2: 0.01, optionally 1).
SELECT amount_rounding_precision FROM platform.company_setup WHERE company_id = @company_id;
