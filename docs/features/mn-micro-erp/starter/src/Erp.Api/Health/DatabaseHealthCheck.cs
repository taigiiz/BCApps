using Erp.BuildingBlocks.Infrastructure.Persistence;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Erp.Api.Health;

/// <summary>Readiness: the database answers and the canonical schema is installed.</summary>
internal sealed class DatabaseHealthCheck(IDatabaseHealthProbe probe) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        string? problem = await probe.CheckAsync(cancellationToken);
        return problem is null ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy(problem);
    }
}
