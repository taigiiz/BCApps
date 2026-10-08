namespace Erp.Tests.Integration.Golden;

/// <summary>A VAT entry as compared by the golden runner.</summary>
internal sealed record GoldenVatRow(
    long EntryNo, string EntryType, decimal Base, decimal Amount, decimal VatPercent, string? VatCategory, string CalculationType,
    string? EbarimtTaxType, DateOnly VatDate, bool Closed, bool DeductibleConfirmed);
