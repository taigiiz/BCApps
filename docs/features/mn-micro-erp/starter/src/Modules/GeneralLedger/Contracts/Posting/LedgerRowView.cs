namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>A subledger row as described by its writer for the posting result (VAT entry, customer entry …).</summary>
/// <param name="Ledger">Ledger code.</param>
/// <param name="EntryNo">Entry number (relative in preview).</param>
/// <param name="GlLineKey">The G/L line it belongs to.</param>
/// <param name="Values">Invariant string values for display / comparison.</param>
public sealed record LedgerRowView(string Ledger, long EntryNo, string GlLineKey, IReadOnlyDictionary<string, string> Values);
