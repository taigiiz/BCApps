using Erp.GeneralLedger.Contracts.Posting;

namespace Erp.Tax.Contracts;

/// <summary>
/// One <c>tax.vat_entry</c> to write (BC T254), attached to its base G/L line. Base and amount are signed like the G/L base line:
/// a sale is negative (credit), a purchase positive (debit).
/// </summary>
public sealed record VatLedgerLine : ISubledgerLine
{
    /// <inheritdoc />
    public string Ledger => LedgerCodes.VatEntry;

    /// <summary>The base G/L line key (one element).</summary>
    public required IReadOnlyList<string> GlLineKeys { get; init; }

    /// <summary>SALE or PURCHASE.</summary>
    public required string EntryType { get; init; }

    /// <summary>Signed VAT base.</summary>
    public required decimal Base { get; init; }

    /// <summary>Signed VAT amount.</summary>
    public required decimal Amount { get; init; }

    /// <summary>NORMAL, REVERSE_CHARGE or FULL_VAT.</summary>
    public required string CalculationType { get; init; }

    /// <summary>Rate snapshot in percent (10 = 10 %).</summary>
    public required decimal VatPercent { get; init; }

    /// <summary>VAT identifier of the posting setup (grouping key of the document VAT calculation).</summary>
    public required string VatIdentifier { get; init; }

    /// <summary>VAT10, VAT0, EXEMPT or NOVAT (D-E2).</summary>
    public required string VatCategory { get; init; }

    /// <summary>eBarimt taxType (VAT_ABLE, VAT_ZERO, VAT_FREE, NOT_VAT).</summary>
    public required string EbarimtTaxType { get; init; }

    /// <summary>VAT date (D-E9).</summary>
    public required DateOnly VatDate { get; init; }

    /// <summary>VAT Bus. Posting Group code (snapshot).</summary>
    public string? VatBusPostingGroup { get; init; }

    /// <summary>VAT Prod. Posting Group code (snapshot).</summary>
    public string? VatProdPostingGroup { get; init; }

    /// <summary>Gen. Bus. Posting Group code (snapshot).</summary>
    public string? GenBusPostingGroup { get; init; }

    /// <summary>Gen. Prod. Posting Group code (snapshot).</summary>
    public string? GenProdPostingGroup { get; init; }

    /// <summary>Supplier receipt ДДТД of a purchase (D-E4).</summary>
    public string? SupplierEbarimtId { get; init; }
}
