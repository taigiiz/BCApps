using Erp.Tests.Integration.Infrastructure;

namespace Erp.Tests.Integration.Golden;

/// <summary>Ledger high-water marks taken before a step (TST-GS-09 noRowsWritten / step delta).</summary>
internal sealed record Watermarks(long MaxGlEntryNo, long MaxVatEntryNo, string Counters)
{
    public static async Task<Watermarks> ReadAsync(LedgerReader ledger)
    {
        List<(long Gl, long Vat, string Counters)> rows = await ledger.QueryAsync(
            """
            SELECT (SELECT coalesce(max(entry_no), 0) FROM gl.gl_entry WHERE company_id = @c),
                   (SELECT coalesce(max(entry_no), 0) FROM tax.vat_entry WHERE company_id = @c),
                   (SELECT coalesce(string_agg(ledger || '=' || last_no, ',' ORDER BY ledger), '') FROM platform.ledger_counter WHERE company_id = @c)
                   || '|' || (SELECT count(*) FROM platform.number_allocation WHERE company_id = @c)
            """,
            r => (r.GetInt64(0), r.GetInt64(1), r.GetString(2)));
        return new Watermarks(rows[0].Gl, rows[0].Vat, rows[0].Counters);
    }
}
