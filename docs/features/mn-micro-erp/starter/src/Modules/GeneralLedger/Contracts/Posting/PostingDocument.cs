namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Input of the posting engine: one run of 1..5 000 vouchers (05-posting-engine.md §5.1).</summary>
public sealed record PostingDocument
{
    /// <summary>Run header (= register).</summary>
    public required PostingRun Run { get; init; }

    /// <summary>The vouchers in posting order (BR-PST-27).</summary>
    public required IReadOnlyList<PostingVoucher> Vouchers { get; init; }
}
