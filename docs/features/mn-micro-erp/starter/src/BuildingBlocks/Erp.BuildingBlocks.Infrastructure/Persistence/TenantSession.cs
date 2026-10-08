using System.Text.RegularExpressions;
using Erp.BuildingBlocks.Application.Persistence;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>
/// Scoped database session of one command (02-architecture.md §7.3): BEGIN (READ COMMITTED), transaction-local request context via
/// <c>platform.fn_set_context</c>, optional session role, lock/statement timeouts; COMMIT or ROLLBACK at the end.
/// </summary>
internal sealed partial class TenantSession(ErpDataSource dataSource, IOptions<DatabaseOptions> options) : ITenantSession, IAsyncDisposable
{
    private const string BeginSql =
        "SELECT platform.fn_set_context(@tenant_id, @company_id, @user_id, @request_id), " +
        "set_config('lock_timeout', @lock_timeout, true), set_config('statement_timeout', @statement_timeout, true)";

    private NpgsqlConnection? _connection;
    private NpgsqlTransaction? _transaction;
    private TenantScope? _scope;

    public TenantScope Scope => _scope ?? throw new InvalidOperationException("The tenant session has not been started.");

    public bool IsRollbackOnly { get; private set; }

    public bool IsActive => _transaction is not null;

    public void MarkRollbackOnly() => IsRollbackOnly = true;

    public NpgsqlCommand CreateCommand(string sql)
    {
        EnsureActive();
        return new NpgsqlCommand(sql, _connection, _transaction);
    }

    public NpgsqlBatch CreateBatch()
    {
        EnsureActive();
        return new NpgsqlBatch(_connection, _transaction);
    }

    public async Task BeginAsync(TenantScope scope, CancellationToken cancellationToken)
    {
        if (_transaction is not null)
        {
            throw new InvalidOperationException("The tenant session is already active; one command = one transaction.");
        }

        _scope = scope;
        IsRollbackOnly = false;
        _connection = await dataSource.DataSource.OpenConnectionAsync(cancellationToken);
        _transaction = await _connection.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted, cancellationToken);

        DatabaseOptions settings = options.Value;
        if (!string.IsNullOrEmpty(settings.SessionRole))
        {
            if (!RoleNameRegex().IsMatch(settings.SessionRole))
            {
                throw new InvalidOperationException("Database:SessionRole is not a valid role name.");
            }

            await using NpgsqlCommand role = new("SELECT set_config('role', @role, true)", _connection, _transaction);
            role.Parameters.AddWithValue("role", settings.SessionRole);
            await role.ExecuteNonQueryAsync(cancellationToken);
        }

        await using NpgsqlCommand context = new(BeginSql, _connection, _transaction);
        context.Parameters.AddWithValue("tenant_id", scope.TenantId);
        context.Parameters.AddWithValue("company_id", scope.CompanyId);
        context.Parameters.AddWithValue("user_id", (object?)scope.UserId ?? DBNull.Value).NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Uuid;
        context.Parameters.AddWithValue("request_id", scope.RequestId);
        context.Parameters.AddWithValue("lock_timeout", settings.LockTimeout);
        context.Parameters.AddWithValue("statement_timeout", settings.StatementTimeout);
        await context.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task CompleteAsync(bool commit, CancellationToken cancellationToken)
    {
        if (_transaction is null)
        {
            return;
        }

        try
        {
            if (commit && !IsRollbackOnly)
            {
                await _transaction.CommitAsync(cancellationToken);
            }
            else
            {
                await _transaction.RollbackAsync(CancellationToken.None);
            }
        }
        finally
        {
            await CloseAsync();
        }
    }

    public async ValueTask DisposeAsync() => await CloseAsync();

    [GeneratedRegex("^[a-z_][a-z0-9_]{0,62}$", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 100)]
    private static partial Regex RoleNameRegex();

    private async Task CloseAsync()
    {
        if (_transaction is not null)
        {
            await _transaction.DisposeAsync();
            _transaction = null;
        }

        if (_connection is not null)
        {
            await _connection.DisposeAsync();
            _connection = null;
        }
    }

    private void EnsureActive()
    {
        if (_transaction is null)
        {
            throw new InvalidOperationException("No active tenant session: run the command through ITenantTransactionRunner.");
        }
    }
}
