using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Npgsql;

namespace Erp.Migrator;

/// <summary>
/// SQL-first migration runner (ADR-0014) over the canonical scripts. Rules:
/// <list type="bullet">
/// <item>One connection per script (like psql -f); psql meta-commands (<c>\set …</c>) are stripped.</item>
/// <item>A script without its own BEGIN/COMMIT runs in one transaction together with its journal row (all or nothing).</item>
/// <item><c>schema/*</c> is versioned: applied once; a changed checksum of an applied script is an error (write a new script).</item>
/// <item><c>seed/*</c> is repeatable (CREATE OR REPLACE / idempotent reload): re-applied when its checksum changes.</item>
/// <item>The journal <c>platform.schema_migration</c> is created right after 000_extensions_roles.sql (which creates schema platform).</item>
/// <item>A session advisory lock keeps two migrators from running at once.</item>
/// </list>
/// The connecting role must create roles/extensions for 000 (bootstrap superuser locally and in CI; ops role in production).
/// </summary>
public sealed partial class MigrationRunner(string connectionString, TextWriter output)
{
    private const long MigratorLockKey = 4_242_001;

    private const string JournalDdl = """
        SET ROLE app_owner;
        CREATE TABLE IF NOT EXISTS platform.schema_migration (
            script       text PRIMARY KEY,
            kind         text NOT NULL CHECK (kind IN ('SCHEMA','SEED')),
            checksum     text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
            applied_at   timestamptz NOT NULL DEFAULT now(),
            applied_by   text NOT NULL DEFAULT session_user,
            execution_ms integer NOT NULL CHECK (execution_ms >= 0)
        );
        COMMENT ON TABLE platform.schema_migration IS 'Erp.Migrator journal (ADR-0014; canonical schema platform, D-K1): one row per applied schema script (SHA-256 checksum, never edited) or seed script (re-applied when its checksum changes).';
        REVOKE ALL ON platform.schema_migration FROM PUBLIC;
        RESET ROLE;
        """;

    private readonly string _connectionString = new NpgsqlConnectionStringBuilder(connectionString) { Pooling = false }.ConnectionString;

    /// <summary>Applies pending schema scripts. Returns the number of scripts applied.</summary>
    public Task<int> MigrateAsync(CancellationToken cancellationToken) => RunAsync(ScriptKind.Schema, cancellationToken);

    /// <summary>Applies new or changed seed scripts (requires a migrated schema). Returns the number of scripts applied.</summary>
    public Task<int> SeedAsync(CancellationToken cancellationToken) => RunAsync(ScriptKind.Seed, cancellationToken);

    /// <summary>Compares the embedded scripts with the journal; throws when a schema script differs or anything is pending.</summary>
    public async Task VerifyAsync(CancellationToken cancellationToken)
    {
        await using NpgsqlConnection connection = await OpenAsync(cancellationToken);
        Dictionary<string, string> journal = await ReadJournalAsync(connection, cancellationToken);
        List<string> problems = [];
        foreach (MigrationScript script in ScriptCatalog.Load())
        {
            if (!journal.TryGetValue(script.Name, out string? checksum))
            {
                problems.Add($"{script.Name}: pending");
            }
            else if (checksum != script.Checksum)
            {
                problems.Add($"{script.Name}: checksum mismatch (journal {checksum[..12]}…, binary {script.Checksum[..12]}…)");
            }
        }

        if (problems.Count > 0)
        {
            throw new MigrationException("verify failed:\n  " + string.Join("\n  ", problems));
        }

        // db/tests/catalog_checks.sql: FK indexes, COMMENT on every table, no float/money columns, tenant tables with RLS columns.
        // It creates temp views and raises when a check fails; run it in a transaction that is rolled back.
        await using (NpgsqlTransaction transaction = await connection.BeginTransactionAsync(cancellationToken))
        {
            try
            {
                MigrationScript checks = ScriptCatalog.LoadTest("tests/catalog_checks.sql");
                await using NpgsqlCommand command = new(ToServerSql(checks), connection, transaction);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (PostgresException ex)
            {
                throw new MigrationException("verify failed: db/tests/catalog_checks.sql: " + ex.MessageText, ex);
            }
            finally
            {
                await transaction.RollbackAsync(CancellationToken.None);
            }
        }

        await output.WriteLineAsync($"verify: {journal.Count} journaled scripts match the binary; catalog checks passed");
    }

    /// <summary>Prints every script with its state.</summary>
    public async Task InfoAsync(CancellationToken cancellationToken)
    {
        await using NpgsqlConnection connection = await OpenAsync(cancellationToken);
        Dictionary<string, string> journal = await ReadJournalAsync(connection, cancellationToken);
        foreach (MigrationScript script in ScriptCatalog.Load())
        {
            string state = !journal.TryGetValue(script.Name, out string? checksum) ? "pending"
                : checksum == script.Checksum ? "applied" : (script.Kind == ScriptKind.Seed ? "changed (re-apply with seed)" : "CHECKSUM MISMATCH");
            await output.WriteLineAsync($"{script.Name,-36} {script.Checksum[..12]}  {state}");
        }
    }

    /// <summary>Text actually sent to the server: psql meta-command lines removed.</summary>
    public static string ToServerSql(MigrationScript script)
    {
        ArgumentNullException.ThrowIfNull(script);
        StringBuilder sql = new();
        if (script.Name == "seed/legal_parameters.sql")
        {
            // db/apply.sh: PGOPTIONS="-c search_path=tax" psql -c 'SET ROLE app_owner' -f legal_parameters.sql
            sql.Append("SET ROLE app_owner;\nSET search_path = tax;\n");
        }

        foreach (string line in script.Text.Split('\n'))
        {
            if (!line.TrimStart().StartsWith('\\'))
            {
                sql.Append(line).Append('\n');
            }
        }

        return sql.ToString();
    }

    [GeneratedRegex(@"^\s*(BEGIN|COMMIT)\s*;", RegexOptions.Multiline | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.ExplicitCapture, matchTimeoutMilliseconds: 1000)]
    private static partial Regex OwnTransactionRegex();

    private static async Task<Dictionary<string, string>> ReadJournalAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        Dictionary<string, string> journal = new(StringComparer.Ordinal);
        await using NpgsqlCommand exists = new("SELECT to_regclass('platform.schema_migration') IS NOT NULL", connection);
        if (await exists.ExecuteScalarAsync(cancellationToken) is not true)
        {
            return journal;
        }

        await using NpgsqlCommand command = new("SELECT script, checksum FROM platform.schema_migration", connection);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            journal[reader.GetString(0)] = reader.GetString(1);
        }

        return journal;
    }

    private async Task<int> RunAsync(ScriptKind kind, CancellationToken cancellationToken)
    {
        await using NpgsqlConnection lockConnection = await OpenAsync(cancellationToken);
        await using (NpgsqlCommand take = new("SELECT pg_advisory_lock(@key)", lockConnection))
        {
            take.Parameters.AddWithValue("key", MigratorLockKey);
            await take.ExecuteNonQueryAsync(cancellationToken);
        }

        Dictionary<string, string> journal = await ReadJournalAsync(lockConnection, cancellationToken);
        if (kind == ScriptKind.Seed && !journal.ContainsKey("schema/920_views.sql"))
        {
            throw new MigrationException("seed needs a migrated schema: run 'migrate' first");
        }

        int applied = 0;
        foreach (MigrationScript script in ScriptCatalog.Load().Where(s => s.Kind == kind))
        {
            if (journal.TryGetValue(script.Name, out string? checksum))
            {
                if (checksum == script.Checksum)
                {
                    continue;
                }

                if (kind == ScriptKind.Schema)
                {
                    throw new MigrationException(
                        $"checksum mismatch for {script.Name}: an applied schema script was edited; add a new script instead (ADR-0014)");
                }
            }

            await ApplyAsync(script, createJournal: journal.Count == 0 && applied == 0, cancellationToken);
            applied++;
        }

        await output.WriteLineAsync(string.Create(CultureInfo.InvariantCulture, $"{kind.ToString().ToLowerInvariant()}: {applied} script(s) applied"));
        return applied;
    }

    private async Task ApplyAsync(MigrationScript script, bool createJournal, CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();
        string sql = ToServerSql(script);
        bool ownTransaction = OwnTransactionRegex().IsMatch(sql);
        await using NpgsqlConnection connection = await OpenAsync(cancellationToken);
        await using NpgsqlTransaction? transaction = ownTransaction ? null : await connection.BeginTransactionAsync(cancellationToken);
        await using (NpgsqlCommand command = new(sql, connection, transaction) { CommandTimeout = 600 })
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        if (createJournal)
        {
            await using NpgsqlCommand ddl = new(JournalDdl, connection, transaction);
            await ddl.ExecuteNonQueryAsync(cancellationToken);
        }

        int elapsedMs = (int)Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        await using (NpgsqlCommand journal = new(
            """
            SET ROLE app_owner;
            INSERT INTO platform.schema_migration (script, kind, checksum, execution_ms) VALUES (@script, @kind, @checksum, @ms)
            ON CONFLICT (script) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now(), applied_by = session_user,
                                               execution_ms = EXCLUDED.execution_ms;
            RESET ROLE;
            """,
            connection,
            transaction))
        {
            journal.Parameters.AddWithValue("script", script.Name);
            journal.Parameters.AddWithValue("kind", script.Kind == ScriptKind.Schema ? "SCHEMA" : "SEED");
            journal.Parameters.AddWithValue("checksum", script.Checksum);
            journal.Parameters.AddWithValue("ms", elapsedMs);
            await journal.ExecuteNonQueryAsync(cancellationToken);
        }

        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }

        await output.WriteLineAsync(string.Create(CultureInfo.InvariantCulture, $"==> {script.Name} ({elapsedMs} ms)"));
    }

    private async Task<NpgsqlConnection> OpenAsync(CancellationToken cancellationToken)
    {
        NpgsqlConnection connection = new(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}
