namespace Erp.BuildingBlocks.Domain.Monetary;

/// <summary>
/// The ONLY place where money is rounded (ADR-0006, 18-dev-setup.md §4.3). Midpoint rounding is always
/// <see cref="MidpointRounding.AwayFromZero"/>, exactly like PostgreSQL <c>round(numeric, n)</c>; .NET's default
/// banker's rounding (ToEven) is banned everywhere else by RS0030 (BannedSymbols.Domain.txt).
/// </summary>
public static class MoneyMath
{
    /// <summary>Decimal places of every MNT ledger amount (D-C2: precision 0.01).</summary>
    public const int LcyDecimals = 2;

    /// <summary>Precision of every MNT ledger amount (D-C2).</summary>
    public const decimal LcyPrecision = 0.01m;

    /// <summary>Rounds half away from zero, exactly like PostgreSQL round(numeric, decimals). ADR-0006.</summary>
    public static decimal Round(decimal value, int decimals)
    {
#pragma warning disable RS0030 // Sanctioned wrapper: the only Math.Round call allowed on money (architecture test #7)
        return Math.Round(value, decimals, MidpointRounding.AwayFromZero);
#pragma warning restore RS0030
    }

    /// <summary>
    /// Rounds to a precision step such as 0.01 or 1 (<c>company_setup.amount_rounding_precision</c>), midpoint away from zero:
    /// <c>Round(x / p, 0) × p</c> (05-posting-engine §6.1).
    /// </summary>
    public static decimal RoundToPrecision(decimal value, decimal precision) =>
        RoundToPrecision(value, precision, RoundingDirection.Nearest);

    /// <summary>
    /// Rounds to a precision step in the given direction. <see cref="RoundingDirection.Up"/> and
    /// <see cref="RoundingDirection.Down"/> work on the absolute value: <c>Up(−1122.2727, 0.01) = −1122.28</c>.
    /// </summary>
    public static decimal RoundToPrecision(decimal value, decimal precision, RoundingDirection direction)
    {
        if (precision <= 0m)
        {
            throw new ArgumentOutOfRangeException(nameof(precision), precision, "Precision must be positive.");
        }

        decimal steps = Math.Abs(value) / precision;
#pragma warning disable RS0030 // Sanctioned wrapper: directed rounding lives here only (ADR-0006 NEAREST/UP/DOWN)
        decimal rounded = direction switch
        {
            RoundingDirection.Up => Math.Ceiling(steps),
            RoundingDirection.Down => Math.Floor(steps),
            _ => Math.Round(steps, 0, MidpointRounding.AwayFromZero),
        };
#pragma warning restore RS0030
        return Math.Sign(value) * rounded * precision;
    }

    /// <summary>True when <paramref name="value"/> needs no rounding at <paramref name="precision"/> (BR-PST-05).</summary>
    public static bool IsRounded(decimal value, decimal precision) => value == RoundToPrecision(value, precision);

    /// <summary>
    /// Splits <paramref name="total"/> over <paramref name="weights"/> with the running-remainder method
    /// (BC DivideAmount, D-E3, 05-posting-engine §6.6): every share is rounded to <paramref name="precision"/>, the rounding
    /// remainder is carried to the next share and the last share absorbs what is left, so Σ shares = total exactly.
    /// </summary>
    public static IReadOnlyList<decimal> Allocate(decimal total, IReadOnlyList<decimal> weights, decimal precision)
    {
        ArgumentNullException.ThrowIfNull(weights);
        decimal[] shares = new decimal[weights.Count];
        decimal weightSum = weights.Sum();
        if (weights.Count == 0 || weightSum == 0m)
        {
            return shares;
        }

        decimal remainder = 0m;
        decimal allocated = 0m;
        for (int i = 0; i < weights.Count; i++)
        {
            if (i == weights.Count - 1)
            {
                shares[i] = total - allocated;
                break;
            }

            decimal exact = remainder + (total * weights[i] / weightSum);
            shares[i] = RoundToPrecision(exact, precision);
            remainder = exact - shares[i];
            allocated += shares[i];
        }

        return shares;
    }
}
