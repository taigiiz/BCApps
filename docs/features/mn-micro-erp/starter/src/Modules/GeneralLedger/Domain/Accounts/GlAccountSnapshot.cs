namespace Erp.GeneralLedger.Domain.Accounts;

/// <summary>The account fields the posting rules need, read under the posting lock.</summary>
internal sealed record GlAccountSnapshot(Guid Id, string No, GlAccountType AccountType, bool Blocked, bool DirectPosting)
{
    /// <summary>Maps <c>gl.gl_account.account_type</c> text to the enum.</summary>
    public static GlAccountType ParseType(string value) => value switch
    {
        "POSTING" => GlAccountType.Posting,
        "HEADING" => GlAccountType.Heading,
        "BEGIN_TOTAL" => GlAccountType.BeginTotal,
        "END_TOTAL" => GlAccountType.EndTotal,
        "TOTAL" => GlAccountType.Total,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown G/L account type."),
    };
}
