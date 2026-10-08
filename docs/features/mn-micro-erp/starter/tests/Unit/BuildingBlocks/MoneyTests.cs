using Erp.BuildingBlocks.Domain.Monetary;

namespace Erp.Tests.Unit.BuildingBlocks;

public sealed class MoneyTests
{
    [Fact]
    public void Add_SameCurrency_AddsAmounts() => (Money.Mnt(100.10m) + Money.Mnt(0.90m)).ShouldBe(Money.Mnt(101.00m));

    [Fact]
    public void Add_DifferentCurrency_Throws() =>
        Should.Throw<InvalidOperationException>(() => Money.Mnt(1m) + new Money(1m, new CurrencyCode("USD")));

    [Fact]
    public void Negate_ReversalSign() => (-Money.Mnt(1500000m)).Amount.ShouldBe(-1500000m);

    [Theory]
    [InlineData("MNT", true)]
    [InlineData("mnt", false)]
    [InlineData("MN", false)]
    [InlineData(null, false)]
    public void CurrencyCode_IsValid(string? code, bool expected) => CurrencyCode.IsValid(code).ShouldBe(expected);
}
