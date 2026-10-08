namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>One balanced voucher = one <c>gl.gl_transaction</c> (Σ amount = 0, D-C5).</summary>
public sealed record PostingVoucher
{
    /// <summary>Key unique within the run (V1, V2 …).</summary>
    public required string Key { get; init; }

    /// <summary>How the legal document number is obtained.</summary>
    public required VoucherNumbering Numbering { get; init; }

    /// <summary><c>platform.document_type</c> (NONE, INVOICE, PAYMENT …).</summary>
    public required string DocumentType { get; init; }

    /// <summary>Posting date (must be in an OPEN period inside the company window, D-D3).</summary>
    public required DateOnly PostingDate { get; init; }

    /// <summary>Document date.</summary>
    public DateOnly? DocumentDate { get; init; }

    /// <summary>Year-end closing voucher (only the year-end close service).</summary>
    public bool IsClosing { get; init; }

    /// <summary>Source code override; null = the run's.</summary>
    public string? SourceCode { get; init; }

    /// <summary>Voucher description (<c>gl_transaction.description</c>).</summary>
    public string? Description { get; init; }

    /// <summary>Reason code (required for reversals and credit memos, BR-PST-20).</summary>
    public Guid? ReasonCodeId { get; init; }

    /// <summary>Set by the reversal service only.</summary>
    public long? ReversesTransactionNo { get; init; }

    /// <summary>Draft / journal document number shown in errors and in the response.</summary>
    public string? DraftDocumentNo { get; init; }

    /// <summary>The G/L lines (≥ 2 non-zero, Σ = 0).</summary>
    public required IReadOnlyList<GlPostingLine> GlLines { get; init; }

    /// <summary>Subledger rows (VAT …) attached to the G/L lines.</summary>
    public IReadOnlyList<ISubledgerLine> SubledgerLines { get; init; } = [];

    /// <summary>Number used in error messages before the legal number exists.</summary>
    public string DisplayNo => DraftDocumentNo ?? Key;
}
