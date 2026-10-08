namespace Erp.GeneralLedger.Api.Responses;

/// <summary>Voucher of the response: draft number → legal number.</summary>
internal sealed record PostedVoucherResponse(string? DraftDocumentNo, string DocumentNo, DateOnly PostingDate, long TransactionNo);
