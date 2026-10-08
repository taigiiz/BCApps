using System.Globalization;
using Npgsql;

namespace Erp.Tests.Integration.Infrastructure;

/// <summary>Connection settings of the integration database (env <c>ERP_TEST_DB</c>, libpq keyword format or Npgsql format).</summary>
public static class TestDatabase
{
    public const string EnvironmentVariable = "ERP_TEST_DB";
    /// <summary>Matches deploy/docker-compose.yml and the CI service containers (local superuser postgres/postgres).</summary>
    public const string DefaultConnection = "host=localhost port=5432 user=postgres password=postgres dbname=erp_skeleton_test";

    /// <summary>Npgsql connection string of the test database (bootstrap role: must create databases, roles and extensions).</summary>
    public static string ConnectionString { get; } = ToNpgsql(Environment.GetEnvironmentVariable(EnvironmentVariable) is { Length: > 0 } value ? value : DefaultConnection);

    /// <summary>Same server, maintenance database <c>postgres</c> (DROP / CREATE DATABASE).</summary>
    public static string MaintenanceConnectionString => new NpgsqlConnectionStringBuilder(ConnectionString) { Database = "postgres", Pooling = false }.ConnectionString;

    public static string DatabaseName => new NpgsqlConnectionStringBuilder(ConnectionString).Database!;

    /// <summary>Accepts <c>host=… port=… user=… dbname=…</c> (libpq) as well as <c>Host=…;Port=…</c> (Npgsql).</summary>
    public static string ToNpgsql(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (value.Contains(';', StringComparison.Ordinal) || !value.Contains('=', StringComparison.Ordinal))
        {
            return value;
        }

        NpgsqlConnectionStringBuilder builder = new();
        foreach (string pair in value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] parts = pair.Split('=', 2);
            string key = parts[0].ToLowerInvariant();
            string text = parts.Length > 1 ? parts[1] : string.Empty;
            switch (key)
            {
                case "host":
                    builder.Host = text;
                    break;
                case "port":
                    builder.Port = int.Parse(text, CultureInfo.InvariantCulture);
                    break;
                case "user":
                    builder.Username = text;
                    break;
                case "dbname":
                    builder.Database = text;
                    break;
                case "password":
                    builder.Password = text;
                    break;
                case "sslmode":
                    builder.SslMode = Enum.Parse<SslMode>(text, ignoreCase: true);
                    break;
                default:
                    throw new ArgumentException($"Unsupported key '{key}' in {EnvironmentVariable}.", nameof(value));
            }
        }

        return builder.ConnectionString;
    }
}
