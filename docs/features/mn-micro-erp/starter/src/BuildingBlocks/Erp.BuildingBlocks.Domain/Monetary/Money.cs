using System.Globalization;

namespace Erp.BuildingBlocks.Domain.Monetary;

/// <summary>An amount in a currency (ADR-0006). Arithmetic across currencies is a programming error and throws.</summary>
/// <param name="Amount">The amount (System.Decimal; JSON string; DB numeric(19,4)).</param>
/// <param name="Currency">The ISO 4217 currency.</param>
public readonly record struct Money(decimal Amount, CurrencyCode Currency)
{
    /// <summary>An MNT amount.</summary>
    public static Money Mnt(decimal amount) => new(amount, CurrencyCode.Mnt);

    /// <summary>Zero in <paramref name="currency"/>.</summary>
    public static Money Zero(CurrencyCode currency) => new(0m, currency);

    /// <summary>Adds two amounts of the same currency.</summary>
    public static Money operator +(Money left, Money right) => left.Add(right);

    /// <summary>Subtracts two amounts of the same currency.</summary>
    public static Money operator -(Money left, Money right) => left.Subtract(right);

    /// <summary>The opposite amount (a reversal posts the opposite sign, D-C3).</summary>
    public static Money operator -(Money value) => value.Negate();

    /// <summary>Adds an amount of the same currency.</summary>
    public Money Add(Money other)
    {
        EnsureSameCurrency(other);
        return this with { Amount = Amount + other.Amount };
    }

    /// <summary>Subtracts an amount of the same currency.</summary>
    public Money Subtract(Money other)
    {
        EnsureSameCurrency(other);
        return this with { Amount = Amount - other.Amount };
    }

    /// <summary>The opposite amount.</summary>
    public Money Negate() => this with { Amount = -Amount };

    /// <summary>Rounded with <see cref="MoneyMath.Round(decimal, int)"/>.</summary>
    public Money Round(int decimals) => this with { Amount = MoneyMath.Round(Amount, decimals) };

    /// <inheritdoc />
    public override string ToString() => Amount.ToString(CultureInfo.InvariantCulture) + " " + Currency.Value;

    private void EnsureSameCurrency(Money other)
    {
        if (other.Currency != Currency)
        {
            throw new InvalidOperationException($"Currency mismatch: {Currency.Value} and {other.Currency.Value}.");
        }
    }
}
