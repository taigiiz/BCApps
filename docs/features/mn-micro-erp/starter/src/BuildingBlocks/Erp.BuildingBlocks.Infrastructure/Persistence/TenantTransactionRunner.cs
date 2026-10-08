using Erp.BuildingBlocks.Application.Persistence;

namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>Begins the scoped <see cref="TenantSession"/>, runs the command and commits (or rolls back).</summary>
internal sealed class TenantTransactionRunner(TenantSession session) : ITenantTransactionRunner
{
    public async Task<T> ExecuteAsync<T>(TenantScope scope, Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(work);
        await session.BeginAsync(scope, cancellationToken);
        bool completed = false;
        try
        {
            T result = await work(cancellationToken);
            await session.CompleteAsync(commit: true, cancellationToken);
            completed = true;
            return result;
        }
        finally
        {
            if (!completed)
            {
                await session.CompleteAsync(commit: false, CancellationToken.None);
            }
        }
    }
}
