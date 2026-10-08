namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>A voucher in the posting result.</summary>
/// <param name="Key">Voucher key of the input.</param>
/// <param name="DraftDocumentNo">Draft number of the input.</param>
/// <param name="DocumentNo">Legal document number (<c>***</c> in preview).</param>
/// <param name="PostingDate">Posting date.</param>
/// <param name="TransactionNo">G/L transaction number (relative 1..n in preview).</param>
public sealed record PostedVoucher(string Key, string? DraftDocumentNo, string DocumentNo, DateOnly PostingDate, long TransactionNo);
