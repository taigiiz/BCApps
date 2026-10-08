namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Re-uses an existing document number; only the reversal service uses it (BR-PST-30).</summary>
/// <param name="DocumentNo">The document number of the voucher being reversed.</param>
public sealed record ExistingNumbering(string DocumentNo) : VoucherNumbering;
