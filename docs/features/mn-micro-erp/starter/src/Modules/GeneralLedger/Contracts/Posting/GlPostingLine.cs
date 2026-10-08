namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>One G/L entry to write (05-posting-engine.md §5.1). Amount is signed LCY: debit &gt; 0, credit &lt; 0 (D-C3).</summary>
public sealed record GlPostingLine
{
    /// <summary>Key unique within the run, e.g. <c>V1/L10000/A/BASE</c>; subledger lines refer to it.</summary>
    public required string Key { get; init; }

    /// <summary>The G/L account (<c>gl.gl_account.id</c>).</summary>
    public required Guid GlAccountId { get; init; }

    /// <summary>Signed, already rounded LCY amount; never zero (BR-PST-05).</summary>
    public required decimal Amount { get; init; }

    /// <summary>VAT carried by this base line (<c>gl_entry.vat_amount</c>).</summary>
    public decimal VatAmount { get; init; }

    /// <summary>Where the account came from.</summary>
    public required LineOrigin Origin { get; init; }

    /// <summary>Dimension set id; 0 = empty set.</summary>
    public long DimensionSetId { get; init; }

    /// <summary>NONE, SALE, PURCHASE or SETTLEMENT.</summary>
    public string GenPostingType { get; init; } = "NONE";

    /// <summary>Posting-group snapshot.</summary>
    public PostingGroupSnapshot? Groups { get; init; }

    /// <summary>VAT date (D-E9); null = no VAT.</summary>
    public DateOnly? VatDate { get; init; }

    /// <summary>Description (≤ 100); null = the voucher's.</summary>
    public string? Description { get; init; }

    /// <summary>External document number.</summary>
    public string? ExternalDocumentNo { get; init; }

    /// <summary>The other G/L account of a two-sided journal line.</summary>
    public Guid? BalGlAccountId { get; init; }

    /// <summary>Set by the reversal service only: the entry this line reverses.</summary>
    public long? ReversedEntryNo { get; init; }
}
