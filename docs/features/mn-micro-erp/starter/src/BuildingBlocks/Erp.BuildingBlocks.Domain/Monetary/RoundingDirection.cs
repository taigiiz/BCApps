namespace Erp.BuildingBlocks.Domain.Monetary;

/// <summary>Rounding direction of <c>platform.company_setup.vat_rounding_type</c> (ADR-0006 §4, 05-posting-engine §6.1).</summary>
public enum RoundingDirection
{
    /// <summary>Nearest, midpoint away from zero (PostgreSQL <c>round(numeric, n)</c>).</summary>
    Nearest = 0,

    /// <summary>Away from zero by absolute value (credit-side VAT rounds the same way as debit-side VAT).</summary>
    Up = 1,

    /// <summary>Towards zero by absolute value.</summary>
    Down = 2,
}
