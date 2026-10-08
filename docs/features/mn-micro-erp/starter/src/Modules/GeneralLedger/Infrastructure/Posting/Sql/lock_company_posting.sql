-- Per-company posting serialization (D-C6, BC CU12 LockTable): transaction-level advisory lock, released at COMMIT/ROLLBACK.
SELECT platform.fn_lock_company_posting(@tenant_id, @company_id);
