namespace Erp.GeneralLedger.Infrastructure.Reversal;

/// <summary>The voucher being reversed.</summary>
internal sealed record OriginalTransaction(
    Guid Id,
    long TransactionNo,
    long RegisterNo,
    DateOnly PostingDate,
    bool IsClosing,
    string DocumentType,
    string DocumentNo,
    string SourceCode,
    string? Description,
    long? ReversesTransactionNo,
    long? ReversedByTransactionNo);
