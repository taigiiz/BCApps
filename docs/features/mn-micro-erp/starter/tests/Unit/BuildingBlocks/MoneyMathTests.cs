using Erp.BuildingBlocks.Domain.Monetary;
using FsCheck;
using FsCheck.Fluent;
using FsCheck.Xunit;

namespace Erp.Tests.Unit.BuildingBlocks;

public sealed class MoneyMathTests
{
    // 18-dev-setup.md §4.2 rule 12: the tie cases are mandatory (PostgreSQL round() = away from zero, .NET default = ToEven).
    [Theory]
    [InlineData("2.345", 2, "2.35")]
    [InlineData("-2.345", 2, "-2.35")]
    [InlineData("2.355", 2, "2.36")]
    [InlineData("0.005", 2, "0.01")]
    [InlineData("2.5", 0, "3")]
    [InlineData("-2.5", 0, "-3")]
    [InlineData("1122.272727", 2, "1122.27")]
    public void Round_MidpointAwayFromZero_MatchesPostgres(string value, int decimals, string expected) =>
        MoneyMath.Round(Dec(value), decimals).ShouldBe(Dec(expected));

    [Theory]
    [InlineData("1122.2727", "0.01", RoundingDirection.Nearest, "1122.27")]
    [InlineData("1122.2727", "0.01", RoundingDirection.Up, "1122.28")]
    [InlineData("1122.2727", "0.01", RoundingDirection.Down, "1122.27")]
    [InlineData("-1122.2727", "0.01", RoundingDirection.Up, "-1122.28")]
    [InlineData("-1122.2727", "0.01", RoundingDirection.Down, "-1122.27")]
    [InlineData("1122.2727", "1", RoundingDirection.Nearest, "1122")]
    [InlineData("1122.5", "1", RoundingDirection.Nearest, "1123")]
    public void RoundToPrecision_DirectionByAbsoluteValue(string value, string precision, RoundingDirection direction, string expected) =>
        MoneyMath.RoundToPrecision(Dec(value), Dec(precision), direction).ShouldBe(Dec(expected));

    [Fact]
    public void RoundToPrecision_NonPositivePrecision_Throws() =>
        Should.Throw<ArgumentOutOfRangeException>(() => MoneyMath.RoundToPrecision(1m, 0m));

    [Theory]
    [InlineData("100.01", true)]
    [InlineData("100.015", false)]
    [InlineData("-0.10", true)]
    public void IsRounded_AtLcyPrecision(string value, bool expected) =>
        MoneyMath.IsRounded(Dec(value), MoneyMath.LcyPrecision).ShouldBe(expected);

    [Fact]
    public void Allocate_RunningRemainder_MatchesPostingEngineExample()
    {
        // 05-posting-engine.md §6.6 / GS-GL-004: VAT 1,000.00 over three lines of 3,333.33.
        IReadOnlyList<decimal> shares = MoneyMath.Allocate(1000.00m, [3333.33m, 3333.33m, 3333.33m], 0.01m);

        shares.ShouldBe([333.33m, 333.34m, 333.33m]);
        shares.Sum().ShouldBe(1000.00m);
    }

    [Fact]
    public void Allocate_ZeroWeights_ReturnsZeros() =>
        MoneyMath.Allocate(10m, [0m, 0m], 0.01m).ShouldBe([0m, 0m]);

    [Property(MaxTest = 500)]
    public Property Allocate_SharesAlwaysSumToTotal_AndStayRounded()
    {
        Gen<decimal> cents = Gen.Choose(-10_000_000, 10_000_000).Select(c => c / 100m);
        Gen<decimal[]> weights = Gen.Choose(1, 5_000_000).Select(c => c / 100m).ArrayOf().Where(w => w.Length is > 0 and < 20);
        return Prop.ForAll(
            Arb.From(cents),
            Arb.From(weights),
            (total, w) =>
            {
                IReadOnlyList<decimal> shares = MoneyMath.Allocate(total, w, 0.01m);
                return shares.Sum() == total && shares.All(s => MoneyMath.IsRounded(s, 0.01m));
            });
    }

    private static decimal Dec(string value) => decimal.Parse(value, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture);
}
