using Erp.BuildingBlocks.Domain.Results;

namespace Erp.GeneralLedger.Domain.Accounts;

/// <summary>BC CU11 account checks: posting type, blocked, direct posting for user-chosen accounts (BR-PST-15, ERG01).</summary>
internal static class AccountPostingRule
{
    public static Error? Check(GlAccountSnapshot? account, bool userEntered, string target)
    {
        if (account is null)
        {
            return new Error(GlErrorCodes.AccountNotFound, "The G/L account does not exist in this company.") { Target = target };
        }

        if (account.AccountType != GlAccountType.Posting)
        {
            return new Error(GlErrorCodes.AccountNotPosting, $"G/L account {account.No} is not a posting account.")
            {
                Target = target,
                Details = new Dictionary<string, string>(StringComparer.Ordinal) { ["account"] = account.No },
            };
        }

        if (account.Blocked)
        {
            return new Error(GlErrorCodes.AccountBlocked, $"G/L account {account.No} is blocked.")
            {
                Target = target,
                Details = new Dictionary<string, string>(StringComparer.Ordinal) { ["account"] = account.No },
            };
        }

        if (userEntered && !account.DirectPosting)
        {
            return new Error(GlErrorCodes.DirectPostingNotAllowed, $"G/L account {account.No} is a control account (direct posting off).")
            {
                Target = target,
                Details = new Dictionary<string, string>(StringComparer.Ordinal) { ["account"] = account.No },
            };
        }

        return null;
    }
}
