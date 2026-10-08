namespace Erp.Tests.Integration.Infrastructure;

/// <summary>Company settings written before provisioning (golden <c>setup.companies[].profile</c>).</summary>
public sealed record CompanyProfile
{
    public bool VatRegistered { get; init; } = true;

    public string Tin { get; init; } = "37900846788";

    public int FirstFiscalYear { get; init; } = 2026;

    public DateOnly? AllowPostingFrom { get; init; }

    public DateOnly? AllowPostingTo { get; init; }
}
