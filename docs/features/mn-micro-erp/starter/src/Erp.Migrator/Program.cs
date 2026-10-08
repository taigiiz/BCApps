using Erp.Migrator;
using Npgsql;

// Erp.Migrator <migrate|seed|verify|info> [--connection "<npgsql connection string>"]
//   migrate  apply pending db/schema/*.sql (versioned, journaled in platform.schema_migration)
//   seed     apply new/changed db/seed/legal_parameters.sql + db/seed/mn_*.sql (MN localization package; --set mn is the default)
//   verify   fail (exit 2) when a script is pending or an applied script differs from the binary
//   info     list scripts and their state
// Connection: --connection, else ConnectionStrings__Migrations, else ERP_MIGRATOR_CONNECTION.
string? command = args.FirstOrDefault(a => !a.StartsWith("--", StringComparison.Ordinal));
string? connection = optionValue(args, "--connection")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__Migrations")
    ?? Environment.GetEnvironmentVariable("ERP_MIGRATOR_CONNECTION");
string seedSet = optionValue(args, "--set") ?? "mn";

if (command is null || connection is null)
{
    await Console.Error.WriteLineAsync("usage: Erp.Migrator <migrate|seed|verify|info> [--connection <npgsql connection string>] [--set mn]");
    return 64;
}

using CancellationTokenSource cancellation = new();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cancellation.Cancel();
};

MigrationRunner runner = new(connection, Console.Out);
try
{
    switch (command)
    {
        case "migrate":
            await runner.MigrateAsync(cancellation.Token);
            break;
        case "seed" when seedSet == "mn":
            await runner.SeedAsync(cancellation.Token);
            break;
        case "seed":
            throw new MigrationException($"seed set '{seedSet}' is not implemented in the Sprint 0 skeleton (only 'mn'; 'demo' comes with Erp.DevTools)");
        case "verify":
            await runner.VerifyAsync(cancellation.Token);
            break;
        case "info":
            await runner.InfoAsync(cancellation.Token);
            break;
        default:
            await Console.Error.WriteLineAsync($"unknown command '{command}'");
            return 64;
    }

    return 0;
}
catch (MigrationException ex)
{
    await Console.Error.WriteLineAsync(ex.Message);
    return 2;
}
catch (PostgresException ex)
{
    await Console.Error.WriteLineAsync($"PostgreSQL error {ex.SqlState}: {ex.MessageText}{(ex.Where is null ? string.Empty : " | " + ex.Where)}");
    return 1;
}

static string? optionValue(string[] args, string name)
{
    int index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}
