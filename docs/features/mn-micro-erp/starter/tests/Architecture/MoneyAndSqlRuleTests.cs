using System.Reflection;
using System.Text.RegularExpressions;

namespace Erp.Tests.Architecture;

/// <summary>18-dev-setup.md §2.4 rules 5, 6 and 7: ledger SQL ownership, no binary floating point in money code, sanctioned pragmas.</summary>
public sealed partial class MoneyAndSqlRuleTests
{
    private static readonly string[] _ledgerTables = ["gl.gl_entry", "gl.gl_transaction", "gl.gl_register", "tax.vat_entry", "tax.gl_entry_vat_entry_link"];

    public static TheoryData<string> MoneyCodeAssemblies() =>
    [
        .. ErpAssemblies.Production
            .Select(a => a.GetName().Name!)
            .Where(n => n.EndsWith(".Domain", StringComparison.Ordinal) || n.EndsWith(".Application", StringComparison.Ordinal)
                        || n.EndsWith(".Contracts", StringComparison.Ordinal) || (n.EndsWith(".Api", StringComparison.Ordinal) && n.Count(c => c == '.') == 2 && n != "Erp.BuildingBlocks.Api")),
    ];

    [Theory]
    [MemberData(nameof(MoneyCodeAssemblies))]
    public void Rule6_No_double_float_or_Half_in_money_code(string assembly)
    {
        const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
        Type[] banned = [typeof(double), typeof(float), typeof(Half), typeof(double?), typeof(float?), typeof(Half?)];
        List<string> offenders = [];
        foreach (Type type in ErpAssemblies.Get(assembly).GetTypes().Where(t => !t.Name.Contains('<', StringComparison.Ordinal)))
        {
            offenders.AddRange(type.GetFields(all).Where(f => banned.Contains(f.FieldType)).Select(f => $"{type.FullName}.{f.Name}"));
            offenders.AddRange(type.GetProperties(all).Where(p => banned.Contains(p.PropertyType)).Select(p => $"{type.FullName}.{p.Name}"));
            offenders.AddRange(type.GetMethods(all)
                .Where(m => banned.Contains(m.ReturnType) || m.GetParameters().Any(p => banned.Contains(p.ParameterType)))
                .Select(m => $"{type.FullName}.{m.Name}()"));
        }

        offenders.ShouldBeEmpty("money, quantities and rates are System.Decimal (ADR-0006, ERP0001)");
    }

    [Fact]
    public void Rule5_Ledger_inserts_live_only_in_the_owning_writer()
    {
        Dictionary<string, string> owners = new(StringComparer.Ordinal)
        {
            ["gl.gl_entry"] = "Erp.GeneralLedger.Infrastructure.Posting.",
            ["gl.gl_transaction"] = "Erp.GeneralLedger.Infrastructure.Posting.",
            ["gl.gl_register"] = "Erp.GeneralLedger.Infrastructure.Posting.",
            ["tax.vat_entry"] = "Erp.Tax.Infrastructure.Ledger.",
            ["tax.gl_entry_vat_entry_link"] = "Erp.Tax.Infrastructure.Ledger.",
        };
        List<string> violations = [];
        int scanned = 0;
        foreach ((string resource, string sql) in ApplicationSql())
        {
            scanned++;
            foreach (string table in _ledgerTables)
            {
                if (Regex.IsMatch(sql, $@"\bINSERT\s+INTO\s+{Regex.Escape(table)}\b", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1))
                    && !resource.StartsWith(owners[table], StringComparison.Ordinal))
                {
                    violations.Add($"{resource} inserts into {table}");
                }
            }
        }

        scanned.ShouldBeGreaterThan(10);
        violations.ShouldBeEmpty();
    }

    [Fact]
    public void Rule5_No_UPDATE_or_DELETE_of_ledger_tables_in_application_SQL()
    {
        List<string> violations = [];
        foreach ((string resource, string sql) in ApplicationSql())
        {
            foreach (string table in _ledgerTables)
            {
                if (Regex.IsMatch(sql, $@"\b(UPDATE|DELETE\s+FROM)\s+{Regex.Escape(table)}\b", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1)))
                {
                    violations.Add($"{resource} mutates {table}; use platform.fn_ledger_update (D-C4)");
                }
            }
        }

        violations.ShouldBeEmpty();
    }

    [Fact]
    public void Rule7_Only_MoneyMath_may_disable_RS0030_and_nobody_disables_ERP0001()
    {
        string src = Path.Combine(RepositoryRoot(), "src");
        List<string> violations = [];
        foreach (string file in Directory.EnumerateFiles(src, "*.cs", SearchOption.AllDirectories).Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)))
        {
            string text = File.ReadAllText(file);
            string relative = Path.GetRelativePath(src, file).Replace('\\', '/');
            if (PragmaRegex("RS0030").IsMatch(text) && relative != "BuildingBlocks/Erp.BuildingBlocks.Domain/Monetary/MoneyMath.cs")
            {
                violations.Add($"{relative} disables RS0030");
            }

            if (PragmaRegex("ERP0001").IsMatch(text))
            {
                violations.Add($"{relative} disables ERP0001");
            }
        }

        violations.ShouldBeEmpty();
    }

    private static Regex PragmaRegex(string id) => new($@"#pragma\s+warning\s+disable\s+[^\r\n]*\b{id}\b", RegexOptions.None, TimeSpan.FromSeconds(1));

    // Embedded SQL of the application (the migrator's DDL/seed scripts are the schema itself and are excluded).
    private static IEnumerable<(string Resource, string Sql)> ApplicationSql()
    {
        foreach (Assembly assembly in ErpAssemblies.Production.Where(a => a.GetName().Name != "Erp.Migrator"))
        {
            foreach (string name in assembly.GetManifestResourceNames().Where(n => n.EndsWith(".sql", StringComparison.Ordinal)))
            {
                using Stream stream = assembly.GetManifestResourceStream(name)!;
                using StreamReader reader = new(stream);
                yield return (name, reader.ReadToEnd());
            }
        }
    }

    private static string RepositoryRoot()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Erp.slnx")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("Erp.slnx not found.");
    }
}
