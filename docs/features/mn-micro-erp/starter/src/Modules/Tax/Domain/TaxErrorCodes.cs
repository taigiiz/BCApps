namespace Erp.Tax.Domain;

/// <summary>Stable error codes owned by the Tax module (08-tax-vat-mn.md §8).</summary>
internal static class TaxErrorCodes
{
    public const string VatPostingSetupMissing = "tax.vat_posting_setup_missing";
    public const string VatPostingSetupBlocked = "tax.vat_posting_setup_blocked";
    public const string VatAccountMissing = "tax.vat_account_missing";
    public const string VatPeriodClosed = "tax.vat_period_closed";
    public const string VatCalculationTypeNotSupported = "tax.vat_calculation_type_not_supported";
    public const string NonDeductibleVatNotSupported = "tax.non_deductible_vat_not_supported";
    public const string GenPostingTypeInvalid = "tax.gen_posting_type_invalid";
    public const string ReversalVatSettled = "gl.reversal_vat_settled";
}
