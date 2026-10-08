using System.Text.Json.Nodes;
using Erp.Tests.Integration.Infrastructure;

namespace Erp.Tests.Integration.Golden;

/// <summary>The runner must fail on wrong expectations and on keys it does not implement (no vacuous passes).</summary>
public sealed class GoldenRunnerSelfTests(PostgresFixture database)
{
    private static readonly string _source = Path.Combine(AppContext.BaseDirectory, "Golden", "Drafts", "gl", "GS-GL-016-unbalanced-voucher-rejected.json");

    [Fact]
    public async Task Wrong_amount_wrong_code_and_wrong_number_are_reported()
    {
        JsonObject scenario = JsonNode.Parse(await File.ReadAllTextAsync(_source, TestContext.Current.CancellationToken))!.AsObject();
        JsonArray steps = scenario["steps"]!.AsArray();
        steps[0]!["expectOutcome"]!["codes"] = new JsonArray("gl.period_closed");
        steps[1]!["expect"]!["glEntries"]![0]!["dr"] = "999.00";
        steps[1]!["expect"]!["numbering"]![0]!["lastNo"] = "GJ-2026-00002";

        IReadOnlyList<string> failures = await RunAsync(scenario);

        failures.ShouldContain(f => f.StartsWith("GS-E010 step s1", StringComparison.Ordinal));
        failures.ShouldContain(f => f.StartsWith("GS-E020 step s2", StringComparison.Ordinal));
        failures.ShouldContain(f => f.StartsWith("GS-E021 step s2", StringComparison.Ordinal));
        failures.ShouldContain(f => f.StartsWith("GS-E026 step s2", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Unsupported_keys_fail_instead_of_being_ignored()
    {
        JsonObject scenario = JsonNode.Parse(await File.ReadAllTextAsync(_source, TestContext.Current.CancellationToken))!.AsObject();
        scenario["steps"]!.AsArray()[1]!["expect"]!["custLedgerEntries"] = new JsonArray();
        scenario["variants"] = new JsonArray();

        IReadOnlyList<string> failures = await RunAsync(scenario);

        failures.ShouldContain(f => f.StartsWith("GS-E090 'variants'", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Scenarios_folder_requires_an_accounting_advisor_signature()
    {
        JsonObject scenario = JsonNode.Parse(await File.ReadAllTextAsync(_source, TestContext.Current.CancellationToken))!.AsObject();

        IReadOnlyList<string> failures = await RunAsync(scenario, folder: "Scenarios");

        failures.ShouldContain(f => f.StartsWith("GS-E002", StringComparison.Ordinal));
    }

    private async Task<IReadOnlyList<string>> RunAsync(JsonObject scenario, string folder = "Drafts")
    {
        string directory = Path.Combine(Path.GetTempPath(), "erp-golden-selftest-" + Guid.CreateVersion7().ToString("N"), folder);
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, Path.GetFileName(_source));
        await File.WriteAllTextAsync(path, scenario.ToJsonString(), TestContext.Current.CancellationToken);
        try
        {
            return await new GoldenScenarioRunner(database).RunAsync(path);
        }
        finally
        {
            Directory.Delete(Path.GetDirectoryName(directory)!, recursive: true);
        }
    }
}
