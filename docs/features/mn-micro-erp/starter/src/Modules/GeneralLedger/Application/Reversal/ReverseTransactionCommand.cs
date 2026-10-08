namespace Erp.GeneralLedger.Application.Reversal;

/// <summary>Reverse one G/L transaction (FR-GL-013, D-D5).</summary>
internal sealed record ReverseTransactionCommand(long TransactionNo, string? ReasonCode);
