namespace Erp.Tests.Integration.Infrastructure;

/// <summary>A provisioned test company (own tenant, MN seed package, fiscal years 2026 and 2027).</summary>
public sealed record CompanyHandle(Guid TenantId, Guid CompanyId, Guid UserId, string Name);
