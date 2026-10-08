namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Counter names of <c>platform.ledger_counter.ledger</c> (05-posting-engine.md §3.3).</summary>
public static class LedgerCodes
{
    /// <summary>G/L register numbers.</summary>
    public const string GlRegister = "GL_REGISTER";

    /// <summary>G/L transaction (voucher) numbers.</summary>
    public const string GlTransaction = "GL_TRANSACTION";

    /// <summary>G/L entry numbers.</summary>
    public const string GlEntry = "GL_ENTRY";

    /// <summary>VAT entry numbers.</summary>
    public const string VatEntry = "VAT_ENTRY";
}
