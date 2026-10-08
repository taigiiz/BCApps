using Erp.BuildingBlocks.Application.Persistence;
using Npgsql;

namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>
/// Npgsql view of the open <see cref="ITransactionalSession"/>: modules reach the database ONLY through this session, never through
/// NpgsqlDataSource (architecture rule 13, 02-architecture.md §7.3).
/// </summary>
public interface ITenantSession : ITransactionalSession
{
    /// <summary>True between BEGIN and COMMIT/ROLLBACK.</summary>
    bool IsActive { get; }

    /// <summary>Creates a command bound to the session's connection and transaction.</summary>
    NpgsqlCommand CreateCommand(string sql);

    /// <summary>Creates a batch bound to the session's connection and transaction.</summary>
    NpgsqlBatch CreateBatch();
}
