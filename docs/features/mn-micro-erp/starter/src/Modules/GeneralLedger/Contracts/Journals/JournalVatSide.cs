namespace Erp.GeneralLedger.Contracts.Journals;

/// <summary>A G/L side of a journal line that carries VAT posting groups (gross method, 05-posting-engine.md §6.4).</summary>
/// <param name="LineKeyPrefix">Prefix of the generated G/L line keys, e.g. <c>V1/L10000/A</c>.</param>
/// <param name="GlAccountId">The base account chosen by the user.</param>
/// <param name="GrossAmount">Signed LCY amount including VAT.</param>
/// <param name="GenPostingType">SALE or PURCHASE.</param>
/// <param name="GenBusPostingGroup">Gen. Bus. Posting Group code (snapshot).</param>
/// <param name="GenProdPostingGroup">Gen. Prod. Posting Group code (snapshot).</param>
/// <param name="VatBusPostingGroup">VAT Bus. Posting Group code.</param>
/// <param name="VatProdPostingGroup">VAT Prod. Posting Group code.</param>
/// <param name="VatDate">VAT date (D-E9: defaults to the posting date).</param>
/// <param name="Description">Line description.</param>
/// <param name="SupplierEbarimtId">Supplier receipt ДДТД of a purchase (D-E4).</param>
public sealed record JournalVatSide(
    string LineKeyPrefix,
    Guid GlAccountId,
    decimal GrossAmount,
    string GenPostingType,
    string? GenBusPostingGroup,
    string? GenProdPostingGroup,
    string VatBusPostingGroup,
    string VatProdPostingGroup,
    DateOnly VatDate,
    string? Description,
    string? SupplierEbarimtId);
