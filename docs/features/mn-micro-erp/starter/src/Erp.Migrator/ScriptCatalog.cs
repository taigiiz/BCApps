using System.Reflection;

namespace Erp.Migrator;

/// <summary>
/// The embedded canonical scripts in apply order (db/apply.sh): every db/schema/*.sql by name, then db/seed/legal_parameters.sql,
/// then db/seed/mn_*.sql by name.
/// </summary>
public static class ScriptCatalog
{
    /// <summary>All scripts of the binary.</summary>
    public static IReadOnlyList<MigrationScript> Load()
    {
        Assembly assembly = typeof(ScriptCatalog).Assembly;
        string[] names = assembly.GetManifestResourceNames();
        List<MigrationScript> scripts = [];
        foreach (string name in names.Where(n => n.StartsWith("db/schema/", StringComparison.Ordinal)).Order(StringComparer.Ordinal))
        {
            scripts.Add(new MigrationScript(name["db/".Length..], ScriptKind.Schema, Read(assembly, name)));
        }

        foreach (string name in names
                     .Where(n => n == "db/seed/legal_parameters.sql" || n.StartsWith("db/seed/mn_", StringComparison.Ordinal))
                     .OrderBy(n => n == "db/seed/legal_parameters.sql" ? 0 : 1)
                     .ThenBy(n => n, StringComparer.Ordinal))
        {
            scripts.Add(new MigrationScript(name["db/".Length..], ScriptKind.Seed, Read(assembly, name)));
        }

        return scripts;
    }

    /// <summary>An embedded check script, e.g. <c>tests/catalog_checks.sql</c>.</summary>
    public static MigrationScript LoadTest(string name)
    {
        Assembly assembly = typeof(ScriptCatalog).Assembly;
        return new MigrationScript(name, ScriptKind.Schema, Read(assembly, "db/" + name));
    }

    private static string Read(Assembly assembly, string name)
    {
        using Stream stream = assembly.GetManifestResourceStream(name)!;
        using StreamReader reader = new(stream);
        return reader.ReadToEnd().Replace("\r\n", "\n", StringComparison.Ordinal);
    }
}
