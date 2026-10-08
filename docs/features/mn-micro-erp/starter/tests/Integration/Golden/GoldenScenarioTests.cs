using Erp.Tests.Integration.Infrastructure;

namespace Erp.Tests.Integration.Golden;

/// <summary>
/// Runs every golden scenario file under tests/Golden (copied to the output folder). Drafts/ run as well in the skeleton: they carry a
/// LEDGER_OWNER sign-off only and move to Scenarios/ (gating, ACCOUNTING_ADVISOR) after the accountant's review (16 §11.10).
/// </summary>
public sealed class GoldenScenarioTests(PostgresFixture database)
{
    private static readonly string _root = Path.Combine(AppContext.BaseDirectory, "Golden");

    public static TheoryData<string> Scenarios() =>
    [
        .. Directory.EnumerateFiles(_root, "GS-*.json", SearchOption.AllDirectories)
            .Select(f => Path.GetRelativePath(_root, f).Replace('\\', '/'))
            .Order(StringComparer.Ordinal),
    ];

    [Theory]
    [MemberData(nameof(Scenarios))]
    public async Task Golden_scenario_passes(string scenario)
    {
        IReadOnlyList<string> failures = await new GoldenScenarioRunner(database).RunAsync(Path.Combine(_root, scenario));

        failures.ShouldBeEmpty(scenario + ":\n" + string.Join("\n", failures));
    }

    [Fact]
    public void Golden_catalog_of_the_skeleton_is_present() =>
        Scenarios().Count.ShouldBeGreaterThanOrEqualTo(6);
}
