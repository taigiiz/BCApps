namespace Erp.BuildingBlocks.Domain.Monetary;

/// <summary>ISO 4217 alphabetic currency code (DB domain <c>platform.currency_code</c>: <c>^[A-Z]{3}$</c>).</summary>
public readonly record struct CurrencyCode
{
    /// <summary>Mongolian tögrög, the local (ledger) currency of every company (D-C2).</summary>
    public static readonly CurrencyCode Mnt = new("MNT");

    /// <summary>Creates a currency code; throws when <paramref name="value"/> is not three upper-case Latin letters.</summary>
    public CurrencyCode(string value)
    {
        if (!IsValid(value))
        {
            throw new ArgumentException("A currency code is three upper-case Latin letters (ISO 4217).", nameof(value));
        }

        Value = value;
    }

    /// <summary>The three-letter code.</summary>
    public string Value { get; }

    /// <summary>True when <paramref name="value"/> is three upper-case Latin letters.</summary>
    public static bool IsValid(string? value) => value is { Length: 3 } && value.All(c => c is >= 'A' and <= 'Z');

    /// <inheritdoc />
    public override string ToString() => Value;
}
