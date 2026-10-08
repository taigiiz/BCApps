namespace Erp.GeneralLedger.Contracts.Reversal;

/// <summary>Reverse one G/L transaction with its original date and number (D-D5, FR-GL-013).</summary>
/// <param name="TransactionNo">The transaction to reverse.</param>
/// <param name="ReasonCode">Reason code (<c>platform.reason_code.code</c>), required (BR-PST-20).</param>
public sealed record ReverseTransactionRequest(long TransactionNo, string ReasonCode);
