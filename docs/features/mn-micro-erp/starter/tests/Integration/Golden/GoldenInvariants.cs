using Erp.Tests.Integration.Infrastructure;

namespace Erp.Tests.Integration.Golden;

/// <summary>Default invariants of 16-test-strategy.md §11.5 implemented by the Sprint 0 runner (GS-E030): I-01, I-06, I-07, I-08.</summary>
internal static class GoldenInvariants
{
    public static async Task<IReadOnlyList<string>> CheckAsync(LedgerReader ledger)
    {
        List<string> failures = [];

        // I-01: every transaction balances and has entries
        failures.AddRange((await ledger.QueryAsync(
                """
                SELECT t.transaction_no, coalesce(sum(e.amount), 0), count(e.entry_no)
                  FROM gl.gl_transaction t LEFT JOIN gl.gl_entry e ON e.company_id = t.company_id AND e.transaction_no = t.transaction_no
                 WHERE t.company_id = @c GROUP BY t.transaction_no
                HAVING coalesce(sum(e.amount), 0) <> 0 OR count(e.entry_no) = 0
                """,
                r => (FormattableString)$"GS-E030 I-01 transaction {r.GetInt64(0)}: sum {r.GetDecimal(1)}, {r.GetInt64(2)} entries"))
            .Select(Invariant));

        // I-06: VAT control accounts = open VAT entries (seed accounts 2300 output VAT, 1300 input VAT)
        failures.AddRange((await ledger.QueryAsync(
                """
                SELECT v.acc, v.gl, v.vat FROM (
                  SELECT '2300' AS acc,
                         (SELECT coalesce(sum(e.amount), 0) FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id WHERE e.company_id = @c AND a.no = '2300') AS gl,
                         (SELECT coalesce(sum(amount), 0) FROM tax.vat_entry WHERE company_id = @c AND entry_type = 'SALE' AND NOT closed) AS vat
                  UNION ALL
                  SELECT '1300',
                         (SELECT coalesce(sum(e.amount), 0) FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id WHERE e.company_id = @c AND a.no = '1300'),
                         (SELECT coalesce(sum(amount), 0) FROM tax.vat_entry WHERE company_id = @c AND entry_type = 'PURCHASE' AND NOT closed)) v
                 WHERE v.gl <> v.vat
                """,
                r => (FormattableString)$"GS-E030 I-06 account {r.GetString(0)}: G/L {r.GetDecimal(1)} <> open VAT entries {r.GetDecimal(2)}"))
            .Select(Invariant));

        // I-07: entry / transaction / register / VAT entry numbers and legal numbers are 1..n without gaps
        failures.AddRange((await ledger.QueryAsync(
                """
                SELECT 'gl_entry.entry_no', count(*), coalesce(max(entry_no), 0) FROM gl.gl_entry WHERE company_id = @c
                UNION ALL SELECT 'gl_transaction.transaction_no', count(*), coalesce(max(transaction_no), 0) FROM gl.gl_transaction WHERE company_id = @c
                UNION ALL SELECT 'gl_register.no', count(*), coalesce(max(no), 0) FROM gl.gl_register WHERE company_id = @c
                UNION ALL SELECT 'vat_entry.entry_no', count(*), coalesce(max(entry_no), 0) FROM tax.vat_entry WHERE company_id = @c
                UNION ALL SELECT 'number_allocation(' || number_series_line_id || ')', count(*), max(no) - min(no) + 1
                            FROM platform.number_allocation WHERE company_id = @c GROUP BY number_series_line_id
                """,
                r => (Name: r.GetString(0), Count: r.GetInt64(1), Span: r.GetInt64(2))))
            .Where(x => x.Count != x.Span)
            .Select(x => Invariant($"GS-E030 I-07 {x.Name}: {x.Count} rows but numbers span {x.Span} (gap)")));

        // I-08: stored MNT amounts are rounded to 0.01 (no hidden rounding)
        failures.AddRange((await ledger.QueryAsync(
                """
                SELECT 'gl_entry ' || entry_no FROM gl.gl_entry WHERE company_id = @c AND (amount <> round(amount, 2) OR vat_amount <> round(vat_amount, 2))
                UNION ALL SELECT 'vat_entry ' || entry_no FROM tax.vat_entry WHERE company_id = @c AND (base <> round(base, 2) OR amount <> round(amount, 2))
                """,
                r => "GS-E030 I-08 unrounded " + r.GetString(0))));

        return failures;
    }

    private static string Invariant(FormattableString text) => FormattableString.Invariant(text);
}
