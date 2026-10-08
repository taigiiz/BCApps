using Npgsql;

namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>
/// Holder of the process-wide <see cref="NpgsqlDataSource"/>. NpgsqlDataSource itself is NOT registered in DI, so modules cannot
/// bypass <see cref="ITenantSession"/> (architecture rule 13).
/// </summary>
internal sealed class ErpDataSource(NpgsqlDataSource dataSource) : IAsyncDisposable
{
    public NpgsqlDataSource DataSource { get; } = dataSource;

    public ValueTask DisposeAsync() => DataSource.DisposeAsync();
}
