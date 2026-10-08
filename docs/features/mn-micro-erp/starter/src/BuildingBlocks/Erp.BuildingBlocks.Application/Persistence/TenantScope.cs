namespace Erp.BuildingBlocks.Application.Persistence;

/// <summary>
/// The request context written into the transaction with <c>platform.fn_set_context</c> (RLS is fail-closed, D-K6).
/// </summary>
/// <param name="TenantId">Active tenant (<c>app.tenant_id</c>).</param>
/// <param name="CompanyId">Company of the route (<c>app.company_id</c>).</param>
/// <param name="UserId">Acting user (<c>app.user_id</c>), null for system jobs.</param>
/// <param name="RequestId">Request / job-run id (<c>app.request_id</c>).</param>
public sealed record TenantScope(Guid TenantId, Guid CompanyId, Guid? UserId, string RequestId);
