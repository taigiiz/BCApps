using System.Reflection;
using ArchUnitNET.Loader;

namespace Erp.Tests.Architecture;

/// <summary>The production assemblies under test (loaded from the Erp.Api composition root + Erp.Migrator).</summary>
internal static class ErpAssemblies
{
    public static readonly Assembly[] Production = LoadProduction();

    public static readonly ArchUnitNET.Domain.Architecture Architecture = new ArchLoader()
        .LoadAssemblies([.. Production, typeof(Npgsql.NpgsqlConnection).Assembly])
        .Build();

    public static Assembly Get(string name) => Production.Single(a => a.GetName().Name == name);

    public static IEnumerable<Assembly> Layer(string suffix) =>
        Production.Where(a => a.GetName().Name!.EndsWith(suffix, StringComparison.Ordinal));

    public static IEnumerable<Assembly> Module(string module) =>
        Production.Where(a => a.GetName().Name!.StartsWith($"Erp.{module}.", StringComparison.Ordinal));

    private static Assembly[] LoadProduction()
    {
        // Force-load the composition root and everything it references transitively.
        HashSet<string> seen = new(StringComparer.Ordinal);
        Queue<Assembly> queue = new([Assembly.Load("Erp.Api"), typeof(Erp.Migrator.MigrationRunner).Assembly]);
        List<Assembly> result = [];
        while (queue.TryDequeue(out Assembly? assembly))
        {
            if (!seen.Add(assembly.GetName().Name!))
            {
                continue;
            }

            result.Add(assembly);
            foreach (AssemblyName reference in assembly.GetReferencedAssemblies().Where(r => r.Name!.StartsWith("Erp.", StringComparison.Ordinal)))
            {
                queue.Enqueue(Assembly.Load(reference));
            }
        }

        return [.. result.OrderBy(a => a.GetName().Name, StringComparer.Ordinal)];
    }
}
