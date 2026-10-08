namespace Erp.Tests.Integration.Infrastructure;

public sealed record GlEntryRow(
    long EntryNo, long TransactionNo, long RegisterNo, string Account, decimal Amount, decimal Debit, decimal Credit, decimal VatAmount,
    string DocumentNo, DateOnly PostingDate, string SourceCode, bool SystemCreated, bool Reversed, long? ReversedByEntryNo, long? ReversedEntryNo);

public sealed record GlTransactionRow(
    long TransactionNo, long RegisterNo, string DocumentNo, DateOnly PostingDate, string SourceCode, long? ReversesTransactionNo, long? ReversedByTransactionNo);

public sealed record GlRegisterRow(long No, long? FromEntryNo, long? ToEntryNo, long? FromVatEntryNo, long? ToVatEntryNo, string SourceCode, bool Reversed);

public sealed record VatEntryRow(
    long EntryNo, string EntryType, decimal Base, decimal Amount, decimal VatPercent, string? VatCategory, string CalculationType,
    string? EbarimtTaxType, DateOnly VatDate, DateOnly PostingDate, long TransactionNo, long? GlEntryNo, bool Reversed, long? ReversedEntryNo,
    long? ReversedByEntryNo);
