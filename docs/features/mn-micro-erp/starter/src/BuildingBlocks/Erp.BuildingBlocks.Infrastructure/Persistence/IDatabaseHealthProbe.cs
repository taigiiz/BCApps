namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>Readiness probe of the application database (used by /health/ready; no tenant context, no table access).</summary>
public interface IDatabaseHealthProbe
{
    /// <summary>Returns null when the database answers, otherwise a short reason.</summary>
    Task<string?> CheckAsync(CancellationToken cancellationToken);
}
