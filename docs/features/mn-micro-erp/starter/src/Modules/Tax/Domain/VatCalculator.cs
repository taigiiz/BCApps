using Erp.BuildingBlocks.Domain.Monetary;

namespace Erp.Tax.Domain;

/// <summary>
/// VAT arithmetic of journal lines (05-posting-engine.md §6.4, R-VAT-16). Rounding happens once, here, through MoneyMath with the
/// company's VAT rounding direction; the base absorbs the rounding remainder so Base + Vat = gross exactly (no round-off plug).
/// </summary>
internal static class VatCalculator
{
    /// <summary>Gross method (price includes VAT): <c>VAT = Round(A × r / (100 + r))</c>, <c>Base = A − VAT</c>.</summary>
    public static VatSplit SplitGross(decimal gross, decimal vatPercent, decimal precision, RoundingDirection direction)
    {
        ValidatePercent(vatPercent);
        decimal vat = vatPercent == 0m ? 0m : MoneyMath.RoundToPrecision(gross * vatPercent / (100m + vatPercent), precision, direction);
        return new VatSplit(gross - vat, vat);
    }

    /// <summary>Net method (price excludes VAT): <c>VAT = Round(Base × r / 100)</c>.</summary>
    public static VatSplit FromNet(decimal net, decimal vatPercent, decimal precision, RoundingDirection direction)
    {
        ValidatePercent(vatPercent);
        decimal vat = vatPercent == 0m ? 0m : MoneyMath.RoundToPrecision(net * vatPercent / 100m, precision, direction);
        return new VatSplit(net, vat);
    }

    /// <summary>Maps <c>platform.company_setup.vat_rounding_type</c>.</summary>
    public static RoundingDirection ParseRoundingType(string? value) => value switch
    {
        "UP" => RoundingDirection.Up,
        "DOWN" => RoundingDirection.Down,
        _ => RoundingDirection.Nearest,
    };

    private static void ValidatePercent(decimal vatPercent)
    {
        if (vatPercent is < 0m or > 100m)
        {
            throw new ArgumentOutOfRangeException(nameof(vatPercent), vatPercent, "VAT percent must be between 0 and 100.");
        }
    }
}
