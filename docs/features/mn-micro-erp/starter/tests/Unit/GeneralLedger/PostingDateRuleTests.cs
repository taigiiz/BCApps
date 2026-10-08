using Erp.GeneralLedger.Domain;
using Erp.GeneralLedger.Domain.Periods;

namespace Erp.Tests.Unit.GeneralLedger;

public sealed class PostingDateRuleTests
{
    private static readonly DateOnly _date = new(2026, 3, 10);

    [Fact]
    public void Open_Period_IsAllowed() => PostingDateRule.Check(Facts(PeriodStatus.Open), isClosing: false).ShouldBeNull();

    [Fact]
    public void Missing_Period_IsRejected() =>
        PostingDateRule.Check(Facts(null), isClosing: false)!.Code.ShouldBe(GlErrorCodes.PeriodNotFound);

    [Fact]
    public void Closed_Period_IsRejected() =>
        PostingDateRule.Check(Facts(PeriodStatus.Closed), isClosing: false)!.Code.ShouldBe(GlErrorCodes.PeriodClosed);

    [Fact]
    public void Closed_FiscalYear_IsRejected() =>
        PostingDateRule.Check(Facts(PeriodStatus.Open, fiscalYear: PeriodStatus.Closed), isClosing: false)!.Code.ShouldBe(GlErrorCodes.PeriodClosed);

    [Fact]
    public void Locked_Period_IsRejected_EvenForClosingVouchers() =>
        PostingDateRule.Check(Facts(PeriodStatus.Locked), isClosing: true)!.Code.ShouldBe(GlErrorCodes.PeriodLocked);

    [Fact]
    public void Closing_Voucher_MayPostIntoClosedPeriod() =>
        PostingDateRule.Check(Facts(PeriodStatus.Closed), isClosing: true).ShouldBeNull();

    [Fact]
    public void Outside_Window_IsRejected_ForEveryRight() =>
        PostingDateRule.Check(Facts(PeriodStatus.Open) with { AllowPostingFrom = new DateOnly(2026, 3, 11) }, isClosing: false)!
            .Code.ShouldBe(GlErrorCodes.PostingDateOutsideWindow);

    private static PostingDateFacts Facts(PeriodStatus? period, PeriodStatus? fiscalYear = PeriodStatus.Open) =>
        new(_date, period, period is null ? null : fiscalYear, null, null);
}
