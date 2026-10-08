namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>Database settings of the application role (configuration section <c>Database</c>).</summary>
public sealed class DatabaseOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Database";

    /// <summary>Npgsql connection string of the application login (erp_app in local/CI; secret in staging/production).</summary>
    public string ConnectionString { get; set; } = string.Empty;

    /// <summary>
    /// Optional group role switched to with <c>set_config('role', …, true)</c> after BEGIN. Only for test/dev logins that are
    /// superusers (superusers bypass RLS); production logs in as <c>erp_app</c> (member of app_user) and leaves this empty.
    /// </summary>
    public string? SessionRole { get; set; }

    /// <summary>lock_timeout of command transactions (02-architecture.md §7.3; advisory posting lock wait).</summary>
    public string LockTimeout { get; set; } = "5s";

    /// <summary>statement_timeout of command transactions.</summary>
    public string StatementTimeout { get; set; } = "30s";
}
