using Erp.BuildingBlocks.Domain.Results;
using Erp.GeneralLedger.Domain;
using Erp.GeneralLedger.Domain.Posting;

namespace Erp.Tests.Unit.GeneralLedger;

public sealed class VoucherBalanceRuleTests
{
    [Fact]
    public void Check_Balanced_NoErrors() =>
        VoucherBalanceRule.Check("J-1", [new("A", 1500000.00m), new("B", -1500000.00m)], 0.01m).ShouldBeEmpty();

    [Fact]
    public void Check_Unbalanced_ReportsDifference()
    {
        // GS-GL-016: 7213 Dt 1 000 / 2650 Kt 900 -> gl.voucher_unbalanced, message contains 100.00
        IReadOnlyList<Error> errors = VoucherBalanceRule.Check("J-1", [new("A", 1000m), new("B", -900m)], 0.01m);

        Error error = errors.ShouldHaveSingleItem();
        error.Code.ShouldBe(GlErrorCodes.VoucherUnbalanced);
        error.Message.ShouldContain("100.00");
        error.Details!["difference"].ShouldBe("100.00");
    }

    [Fact]
    public void Check_SingleLine_IsEmptyVoucher() =>
        VoucherBalanceRule.Check("J-1", [new("A", 0m), new("B", 0m)], 0.01m)
            .Select(e => e.Code).ShouldBe([GlErrorCodes.VoucherEmpty, GlErrorCodes.LineAmountZero, GlErrorCodes.LineAmountZero], ignoreOrder: true);

    [Fact]
    public void Check_UnroundedAmount_IsRejected_NoRoundOffPlug() =>
        VoucherBalanceRule.Check("J-1", [new("A", 10.005m), new("B", -10.005m)], 0.01m)
            .Select(e => e.Code).Distinct(StringComparer.Ordinal).ShouldBe([GlErrorCodes.AmountNotRounded]);

    [Fact]
    public void Check_WholeTugrikPrecision_RejectsCents() =>
        VoucherBalanceRule.Check("J-1", [new("A", 10.50m), new("B", -10.50m)], 1m)
            .ShouldContain(e => e.Code == GlErrorCodes.AmountNotRounded);
}
