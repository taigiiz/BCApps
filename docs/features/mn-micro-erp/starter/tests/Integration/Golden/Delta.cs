using Erp.Tests.Integration.Infrastructure;

namespace Erp.Tests.Integration.Golden;

/// <summary>Rows written by one step (entries above the watermarks) and whether any counter moved.</summary>
internal sealed record Delta(IReadOnlyList<GlEntryRow> GlEntries, IReadOnlyList<GoldenVatRow> VatEntries, bool CountersChanged)
{
    public bool IsEmpty => GlEntries.Count == 0 && VatEntries.Count == 0 && !CountersChanged;

    public static async Task<Delta> ReadAsync(LedgerReader ledger, Watermarks before)
    {
        List<GlEntryRow> gl = [.. (await ledger.GlEntriesAsync()).Where(e => e.EntryNo > before.MaxGlEntryNo)];
        List<GoldenVatRow> vat = await ledger.QueryAsync(
            """
            SELECT entry_no, entry_type, base, amount, vat_percent, vat_category, vat_calculation_type, ebarimt_tax_type, vat_date, closed,
                   deductible_confirmed
              FROM tax.vat_entry WHERE company_id = @c AND entry_no > @after ORDER BY entry_no
            """,
            r => new GoldenVatRow(r.GetInt64(0), r.GetString(1), r.GetDecimal(2), r.GetDecimal(3), r.GetDecimal(4), r.IsDBNull(5) ? null : r.GetString(5),
                r.GetString(6), r.IsDBNull(7) ? null : r.GetString(7), r.GetFieldValue<DateOnly>(8), r.GetBoolean(9), r.GetBoolean(10)),
            ("after", before.MaxVatEntryNo));
        Watermarks after = await Watermarks.ReadAsync(ledger);
        return new Delta(gl, vat, !string.Equals(after.Counters, before.Counters, StringComparison.Ordinal));
    }
}
