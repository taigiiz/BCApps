namespace Erp.BuildingBlocks.Application.Persistence;

/// <summary>
/// Opens the <see cref="ITransactionalSession"/> of a command, runs it and commits, or rolls back when the session was marked
/// rollback-only or the work threw. In the full pipeline this is the TenantSession endpoint filter (02-architecture.md §5.3).
/// </summary>
public interface ITenantTransactionRunner
{
    /// <summary>Runs <paramref name="work"/> inside one database transaction bound to <paramref name="scope"/>.</summary>
    Task<T> ExecuteAsync<T>(TenantScope scope, Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken);
}
