namespace Erp.Tax.Infrastructure.Ledger;

/// <summary>A VAT entry of a transaction being reversed.</summary>
internal sealed record OriginalVatEntry(long EntryNo, long TransactionNo, long? GlEntryNo, bool Closed, string? VatPeriodStatus);
