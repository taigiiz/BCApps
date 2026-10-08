namespace Erp.GeneralLedger.Domain.Posting;

/// <summary>The amount view of one G/L line used by the balance rule.</summary>
internal readonly record struct VoucherLine(string Key, decimal Amount);
