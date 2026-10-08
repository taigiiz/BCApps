using Erp.BuildingBlocks.Application.Persistence;
using Microsoft.AspNetCore.Http;

namespace Erp.BuildingBlocks.Api.Tenancy;

/// <summary>
/// SPRINT 0 STUB of the tenant pipeline: the tenant comes from the <c>X-Erp-Tenant-Id</c> header and the user from
/// <c>X-Erp-User-Id</c>. Sprint 1 replaces this with the BFF cookie + TenantContextMiddleware (02-architecture.md §7.3:
/// <c>erp_tid</c> claim, membership and company-role checks). Never deploy beyond local/CI with this stub.
/// </summary>
public static class DevTenantHeaders
{
    /// <summary>Header carrying the tenant id.</summary>
    public const string TenantHeader = "X-Erp-Tenant-Id";

    /// <summary>Header carrying the acting user id (optional).</summary>
    public const string UserHeader = "X-Erp-User-Id";

    /// <summary>Builds the <see cref="TenantScope"/> of the request, or null when the tenant header is missing or invalid.</summary>
    public static TenantScope? TryGetScope(HttpContext context, Guid companyId)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (!Guid.TryParse(context.Request.Headers[TenantHeader].ToString(), out Guid tenantId))
        {
            return null;
        }

        Guid? userId = Guid.TryParse(context.Request.Headers[UserHeader].ToString(), out Guid parsed) ? parsed : null;
        return new TenantScope(tenantId, companyId, userId, context.TraceIdentifier);
    }
}
