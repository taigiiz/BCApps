namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>A G/L entry in the posting result.</summary>
/// <param name="EntryNo">Entry number (relative 1..n in preview).</param>
/// <param name="TransactionNo">Transaction number (relative in preview).</param>
/// <param name="VoucherKey">Voucher key of the input.</param>
/// <param name="LineKey">G/L line key of the input.</param>
/// <param name="GlAccountId">Account id.</param>
/// <param name="GlAccountNo">Account number.</param>
/// <param name="Amount">Signed amount (debit &gt; 0).</param>
/// <param name="VatAmount">VAT amount carried by the line.</param>
public sealed record PostedGlEntry(
    long EntryNo,
    long TransactionNo,
    string VoucherKey,
    string LineKey,
    Guid GlAccountId,
    string GlAccountNo,
    decimal Amount,
    decimal VatAmount)
{
    /// <summary>Debit column (amount when positive).</summary>
    public decimal Debit => Amount > 0m ? Amount : 0m;

    /// <summary>Credit column (−amount when negative).</summary>
    public decimal Credit => Amount < 0m ? -Amount : 0m;
}
