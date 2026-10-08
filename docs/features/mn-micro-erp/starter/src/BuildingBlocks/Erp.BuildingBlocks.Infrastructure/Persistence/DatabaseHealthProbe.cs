using Npgsql;

namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>Opens a connection and checks that the canonical schema is installed (platform.fn_set_context exists).</summary>
internal sealed class DatabaseHealthProbe(ErpDataSource dataSource) : IDatabaseHealthProbe
{
    public async Task<string?> CheckAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using NpgsqlConnection connection = await dataSource.DataSource.OpenConnectionAsync(cancellationToken);
            await using NpgsqlCommand command = new(
                "SELECT to_regprocedure('platform.fn_set_context(uuid,uuid,uuid,text)') IS NOT NULL", connection);
            object? installed = await command.ExecuteScalarAsync(cancellationToken);
            return installed is true ? null : "schema not installed (run Erp.Migrator migrate)";
        }
        catch (NpgsqlException ex)
        {
            return "database unreachable: " + ex.Message;
        }
    }
}
