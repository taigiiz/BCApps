namespace Erp.GeneralLedger.Api.Responses;

/// <summary>G/L entry of the response (money as JSON strings).</summary>
internal sealed record PostedEntryResponse(long EntryNo, long TransactionNo, string Account, decimal Amount, decimal Debit, decimal Credit, decimal VatAmount);
