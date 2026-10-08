using Erp.BuildingBlocks.Domain.Monetary;
using Erp.Tax.Domain;

namespace Erp.Tests.Unit.Tax;

public sealed class VatCalculatorTests
{
    [Fact]
    public void SplitGross_110000_At10Percent_Is100000Plus10000()
    {
        VatSplit split = VatCalculator.SplitGross(110000.00m, 10m, 0.01m, RoundingDirection.Nearest);

        split.Base.ShouldBe(100000.00m);
        split.Vat.ShouldBe(10000.00m);
    }

    [Fact]
    public void SplitGross_SaleCredit_KeepsSign() =>
        VatCalculator.SplitGross(-110000.00m, 10m, 0.01m, RoundingDirection.Nearest).ShouldBe(new VatSplit(-100000.00m, -10000.00m));

    // 05-posting-engine.md §6.4 (E-B): A = 12,345.00, r = 10
    [Theory]
    [InlineData(RoundingDirection.Nearest, "0.01", "1122.27", "11222.73")]
    [InlineData(RoundingDirection.Up, "0.01", "1122.28", "11222.72")]
    [InlineData(RoundingDirection.Down, "0.01", "1122.27", "11222.73")]
    [InlineData(RoundingDirection.Nearest, "1", "1122", "11223")]
    public void SplitGross_RoundingTypes(RoundingDirection direction, string precision, string vat, string vatBase)
    {
        VatSplit split = VatCalculator.SplitGross(12345.00m, 10m, Dec(precision), direction);

        split.Vat.ShouldBe(Dec(vat));
        split.Base.ShouldBe(Dec(vatBase));
        (split.Base + split.Vat).ShouldBe(12345.00m);
    }

    [Fact]
    public void SplitGross_ZeroRate_HasNoVat() => VatCalculator.SplitGross(5000m, 0m, 0.01m, RoundingDirection.Nearest).ShouldBe(new VatSplit(5000m, 0m));

    [Fact]
    public void FromNet_GsVat001_DocumentLevelVat() =>
        VatCalculator.FromNet(300.15m, 10m, 0.01m, RoundingDirection.Nearest).Vat.ShouldBe(30.02m);

    [Fact]
    public void SplitGross_InvalidPercent_Throws() =>
        Should.Throw<ArgumentOutOfRangeException>(() => VatCalculator.SplitGross(1m, 101m, 0.01m, RoundingDirection.Nearest));

    private static decimal Dec(string value) => decimal.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
}
