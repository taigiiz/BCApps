namespace Erp.GeneralLedger.Application.Journals;

/// <summary>
/// One journal line (BC T81, signed amount: debit +, D-C3). Sprint 0 supports G/L-account sides only (account and optional
/// balancing account); VAT posting groups apply to the account side (gross method). CUSTOMER / VENDOR / BANK_ACCOUNT sides come
/// with the Parties and CashBank modules.
/// </summary>
internal sealed record JournalLineInput
{
    public int? LineNo { get; init; }

    public required string DocumentNo { get; init; }

    public required DateOnly PostingDate { get; init; }

    public DateOnly? DocumentDate { get; init; }

    public string DocumentType { get; init; } = "NONE";

    public required string AccountNo { get; init; }

    public string? BalAccountNo { get; init; }

    public required decimal Amount { get; init; }

    public string? Description { get; init; }

    public string? ExternalDocumentNo { get; init; }

    public string GenPostingType { get; init; } = "NONE";

    public string? GenBusPostingGroup { get; init; }

    public string? GenProdPostingGroup { get; init; }

    public string? VatBusPostingGroup { get; init; }

    public string? VatProdPostingGroup { get; init; }

    public DateOnly? VatDate { get; init; }

    public string? SupplierEbarimtId { get; init; }

    public bool HasVat => VatBusPostingGroup is not null || VatProdPostingGroup is not null;
}
