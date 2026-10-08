namespace Erp.Tests.Unit.Database;

/// <summary>
/// While this repository lives as the starter inside the specification package, db/schema, db/seed, db/tests and db/apply.sh are
/// copies of the canonical docs/features/mn-micro-erp/db (D-K1). Fails when they drift; run tools/ci/sync-db.sh. Skipped in a
/// standalone repository (no ../db next to the repository root).
/// </summary>
public sealed class DatabasePackageDriftTests
{
    [Fact]
    public void Starter_db_copy_matches_the_canonical_package()
    {
        DirectoryInfo root = RepositoryRoot();
        DirectoryInfo canonical = new(Path.Combine(root.FullName, "..", "db"));
        if (!File.Exists(Path.Combine(canonical.FullName, "apply.sh")) || !Directory.Exists(Path.Combine(canonical.FullName, "schema")))
        {
            Assert.Skip("Standalone repository: db/ is the source of truth here.");
        }

        List<string> differences = [];
        foreach (string folder in new[] { "schema", "seed", "tests" })
        {
            string[] expected = [.. Directory.GetFiles(Path.Combine(canonical.FullName, folder)).Select(Path.GetFileName).OfType<string>().Order(StringComparer.Ordinal)];
            string[] actual = [.. Directory.GetFiles(Path.Combine(root.FullName, "db", folder)).Select(Path.GetFileName).OfType<string>().Order(StringComparer.Ordinal)];
            differences.AddRange(expected.Except(actual, StringComparer.Ordinal).Select(f => $"missing db/{folder}/{f}"));
            differences.AddRange(actual.Except(expected, StringComparer.Ordinal).Select(f => $"extra db/{folder}/{f}"));
            differences.AddRange(expected.Intersect(actual, StringComparer.Ordinal)
                .Where(f => !File.ReadAllBytes(Path.Combine(canonical.FullName, folder, f)).SequenceEqual(File.ReadAllBytes(Path.Combine(root.FullName, "db", folder, f))))
                .Select(f => $"different db/{folder}/{f}"));
        }

        if (!File.ReadAllBytes(Path.Combine(canonical.FullName, "apply.sh")).SequenceEqual(File.ReadAllBytes(Path.Combine(root.FullName, "db", "apply.sh"))))
        {
            differences.Add("different db/apply.sh");
        }

        differences.ShouldBeEmpty("run tools/ci/sync-db.sh");
    }

    private static DirectoryInfo RepositoryRoot()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Erp.slnx")))
        {
            directory = directory.Parent;
        }

        return directory ?? throw new InvalidOperationException("Erp.slnx not found above the test output directory.");
    }
}
