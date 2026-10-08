using Erp.GeneralLedger.Contracts.Posting;

namespace Erp.GeneralLedger.Api.Responses;

/// <summary>Posting / preview result (05-posting-engine.md §5.4.3; preview: documentNo "***", registerNo null).</summary>
internal sealed record PostingResponse(
    bool Posted,
    bool Preview,
    long? RegisterNo,
    IReadOnlyList<PostedVoucherResponse> Vouchers,
    IReadOnlyList<PostedEntryResponse> GlEntries,
    IReadOnlyList<LedgerRowView> SubledgerRows)
{
    public static PostingResponse From(PostingResult result) => new(
        result.Posted,
        result.Preview,
        result.RegisterNo,
        [.. result.Vouchers.Select(v => new PostedVoucherResponse(v.DraftDocumentNo, v.DocumentNo, v.PostingDate, v.TransactionNo))],
        [.. result.GlEntries.Select(e => new PostedEntryResponse(e.EntryNo, e.TransactionNo, e.GlAccountNo, e.Amount, e.Debit, e.Credit, e.VatAmount))],
        result.SubledgerRows);
}
