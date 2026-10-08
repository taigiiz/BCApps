using System.Collections.Concurrent;
using System.Reflection;

namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>
/// Loads SQL kept as embedded <c>*.sql</c> resources next to the code that runs it (02-architecture.md §5.2). Keeping SQL in files
/// lets the architecture tests check which namespace may INSERT into which ledger (rule 5).
/// </summary>
public static class EmbeddedSql
{
    private static readonly ConcurrentDictionary<(Assembly Assembly, string Name), string> _cache = new();

    /// <summary>Returns the text of the embedded resource <paramref name="resourceName"/> of <paramref name="assembly"/>.</summary>
    public static string Load(Assembly assembly, string resourceName)
    {
        ArgumentNullException.ThrowIfNull(assembly);
        return _cache.GetOrAdd((assembly, resourceName), static key =>
        {
            using Stream stream = key.Assembly.GetManifestResourceStream(key.Name)
                ?? throw new InvalidOperationException($"Embedded SQL resource '{key.Name}' not found in {key.Assembly.GetName().Name}.");
            using StreamReader reader = new(stream);
            return reader.ReadToEnd();
        });
    }
}
