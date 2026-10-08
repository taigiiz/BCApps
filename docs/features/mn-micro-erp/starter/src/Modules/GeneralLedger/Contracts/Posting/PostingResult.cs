namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Result of a post or a preview (05-posting-engine.md §5.1).</summary>
/// <param name="Posted">True when committed rows exist (false in preview).</param>
/// <param name="Preview">True for a preview.</param>
/// <param name="RegisterNo">G/L register number; null in preview.</param>
/// <param name="Vouchers">Vouchers with their numbers.</param>
/// <param name="GlEntries">G/L entries.</param>
/// <param name="SubledgerRows">Subledger rows described by the writers.</param>
public sealed record PostingResult(
    bool Posted,
    bool Preview,
    long? RegisterNo,
    IReadOnlyList<PostedVoucher> Vouchers,
    IReadOnlyList<PostedGlEntry> GlEntries,
    IReadOnlyList<LedgerRowView> SubledgerRows);
