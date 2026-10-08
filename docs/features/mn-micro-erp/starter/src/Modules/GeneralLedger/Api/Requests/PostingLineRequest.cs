namespace Erp.GeneralLedger.Api.Requests;

/// <summary>One journal line. Money is a JSON string (DecimalStringJsonConverter); amount is signed (debit +, D-C3).</summary>
internal sealed record PostingLineRequest
{
    public int? LineNo { get; init; }

    public string DocumentNo { get; init; } = string.Empty;

    public DateOnly PostingDate { get; init; }

    public DateOnly? DocumentDate { get; init; }

    public string DocumentType { get; init; } = "NONE";

    public string Account { get; init; } = string.Empty;

    public string? BalAccount { get; init; }

    public decimal Amount { get; init; }

    public string? Description { get; init; }

    public string? ExternalDocumentNo { get; init; }

    public string GenPostingType { get; init; } = "NONE";

    public string? GenBusPostingGroup { get; init; }

    public string? GenProdPostingGroup { get; init; }

    public string? VatBusPostingGroup { get; init; }

    public string? VatProdPostingGroup { get; init; }

    public DateOnly? VatDate { get; init; }

    public string? SupplierEbarimtId { get; init; }
}
