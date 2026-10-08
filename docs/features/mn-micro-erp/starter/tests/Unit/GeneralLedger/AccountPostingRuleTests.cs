using Erp.GeneralLedger.Domain;
using Erp.GeneralLedger.Domain.Accounts;

namespace Erp.Tests.Unit.GeneralLedger;

public sealed class AccountPostingRuleTests
{
    [Fact]
    public void Posting_Account_IsAllowed() =>
        AccountPostingRule.Check(Account(GlAccountType.Posting), userEntered: true, "/x").ShouldBeNull();

    [Fact]
    public void Heading_Account_IsRejected() =>
        AccountPostingRule.Check(Account(GlAccountType.Heading), userEntered: false, "/x")!.Code.ShouldBe(GlErrorCodes.AccountNotPosting);

    [Fact]
    public void Blocked_Account_IsRejected() =>
        AccountPostingRule.Check(Account(GlAccountType.Posting) with { Blocked = true }, userEntered: false, "/x")!.Code.ShouldBe(GlErrorCodes.AccountBlocked);

    [Fact]
    public void Control_Account_RejectsUserEnteredLines_ButAcceptsSystemDerived()
    {
        GlAccountSnapshot vatPayable = Account(GlAccountType.Posting) with { No = "2300", DirectPosting = false };

        AccountPostingRule.Check(vatPayable, userEntered: true, "/x")!.Code.ShouldBe(GlErrorCodes.DirectPostingNotAllowed);
        AccountPostingRule.Check(vatPayable, userEntered: false, "/x").ShouldBeNull();
    }

    [Fact]
    public void Missing_Account_IsRejected() =>
        AccountPostingRule.Check(null, userEntered: true, "/x")!.Code.ShouldBe(GlErrorCodes.AccountNotFound);

    private static GlAccountSnapshot Account(GlAccountType type) => new(Guid.CreateVersion7(), "7210", type, Blocked: false, DirectPosting: true);
}
