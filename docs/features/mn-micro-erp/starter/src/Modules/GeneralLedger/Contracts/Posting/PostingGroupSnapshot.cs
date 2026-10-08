namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Posting-group codes copied onto the G/L entry (historic snapshot, no FK).</summary>
/// <param name="GenBus">Gen. Bus. Posting Group code.</param>
/// <param name="GenProd">Gen. Prod. Posting Group code.</param>
/// <param name="VatBus">VAT Bus. Posting Group code.</param>
/// <param name="VatProd">VAT Prod. Posting Group code.</param>
public sealed record PostingGroupSnapshot(string? GenBus, string? GenProd, string? VatBus, string? VatProd);
