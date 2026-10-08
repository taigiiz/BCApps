using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Erp.Tests.Integration.Infrastructure;

namespace Erp.Tests.Integration.Golden;

/// <summary>
/// Sprint 0 golden runner (16-test-strategy.md §11.8) over JSON scenario files (§11.6 schema; JSON is accepted, Z5). Every action runs
/// through the REST API (TST-GS-13); *.post steps run a preview first and compare it with the post (TST-GS-10). Supported now:
/// baseline BASE-VAT / BASE-NONVAT with one company, profile, overrides.periods / overrides.glAccounts; actions journal.post,
/// journal.preview, transaction.reverse; expectations noRowsWritten, glEntries, vatEntries, numbering, periods, balances, trialBalance;
/// invariants I-01, I-06, I-07, I-08. Anything else fails with GS-E090 so a scenario never passes by being ignored.
/// Not yet: extends, variants (2027 rules), users/permissions (the "as" key is not enforced), JSON-schema validation in-process
/// (the files are validated with tools/ci/validate-golden.py), *.actual / diff.md files.
/// </summary>
internal sealed class GoldenScenarioRunner(PostgresFixture database)
{
    private static readonly HashSet<string> _supportedStepKeys = new(StringComparer.Ordinal)
    {
        "id", "title", "at", "as", "company", "action", "input", "idempotencyKey", "previewCheck", "expectOutcome", "capture", "expect",
    };

    private static readonly HashSet<string> _supportedExpectKeys = new(StringComparer.Ordinal)
    {
        "noRowsWritten", "glMatch", "exhaustive", "glEntries", "vatEntries", "numbering", "periods", "balances", "trialBalance",
    };

    private static readonly string[] _unsupportedScenarioKeys = ["extends", "variants", "invariants"];

    private readonly List<string> _failures = [];
    private readonly Dictionary<string, JsonElement> _vars = new(StringComparer.Ordinal);
    private GlApi? _api;
    private LedgerReader? _ledger;

    public async Task<IReadOnlyList<string>> RunAsync(string path)
    {
        JsonElement scenario = JsonDocument.Parse(await File.ReadAllTextAsync(path)).RootElement;
        CheckHeader(path, scenario);
        if (_failures.Count > 0)
        {
            return _failures;
        }

        if (!await SetupAsync(scenario.GetProperty("setup")))
        {
            return _failures;
        }

        foreach (JsonElement step in scenario.GetProperty("steps").EnumerateArray())
        {
            await RunStepAsync(step);
        }

        if (scenario.TryGetProperty("expect", out JsonElement final))
        {
            await CheckExpectationsAsync("final", final, delta: null);
        }

        _failures.AddRange(await GoldenInvariants.CheckAsync(_ledger!));
        return _failures;
    }

    private static decimal Money(JsonElement value) => decimal.Parse(value.GetString()!, NumberStyles.Number, CultureInfo.InvariantCulture);

    private static string Text(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);

    private static DateOnly Date(string value) => DateOnly.ParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    private void Fail(FormattableString message) => _failures.Add(FormattableString.Invariant(message));

    private void CheckHeader(string path, JsonElement scenario)
    {
        string id = scenario.GetProperty("id").GetString()!;
        if (!Path.GetFileName(path).StartsWith(id + "-", StringComparison.Ordinal))
        {
            Fail($"GS-E001 file name must start with the id {id} (TST-GS-01)");
        }

        JsonElement signOffs = scenario.GetProperty("signedOffBy");
        bool gating = path.Replace('\\', '/').Contains("/Scenarios/", StringComparison.Ordinal);
        if (signOffs.GetArrayLength() == 0
            || (gating && !signOffs.EnumerateArray().Any(s => s.GetProperty("role").GetString() == "ACCOUNTING_ADVISOR")))
        {
            Fail($"GS-E002 {id}: Scenarios/ needs an ACCOUNTING_ADVISOR sign-off (TST-GS-03); unsigned work belongs in Drafts/");
        }

        foreach (string unsupported in _unsupportedScenarioKeys.Where(k => scenario.TryGetProperty(k, out _)))
        {
            Fail($"GS-E090 '{unsupported}' is not supported by the Sprint 0 runner yet");
        }
    }

    private async Task<bool> SetupAsync(JsonElement setup)
    {
        string baseline = setup.GetProperty("baseline").GetString()!;
        JsonElement[] companies = [.. setup.GetProperty("companies").EnumerateArray()];
        if (baseline is not ("BASE-VAT" or "BASE-NONVAT") || companies.Length != 1 || setup.TryGetProperty("users", out _) || setup.TryGetProperty("posapiMock", out _))
        {
            Fail($"GS-E090 setup: only BASE-VAT / BASE-NONVAT with exactly one company is supported by the Sprint 0 runner");
            return false;
        }

        JsonElement company = companies[0];
        CompanyProfile profile = new() { VatRegistered = baseline == "BASE-VAT" };
        if (company.TryGetProperty("profile", out JsonElement p))
        {
            foreach (JsonProperty property in p.EnumerateObject())
            {
                profile = property.Name switch
                {
                    "vatRegistered" => profile with { VatRegistered = property.Value.GetBoolean() },
                    "tin" => profile with { Tin = property.Value.GetString()! },
                    "firstFiscalYear" => profile with { FirstFiscalYear = property.Value.GetInt32() },
                    "allowPostingFrom" => profile with { AllowPostingFrom = Date(property.Value.GetString()!) },
                    "allowPostingTo" => profile with { AllowPostingTo = Date(property.Value.GetString()!) },
                    _ => Unsupported(profile, "profile." + property.Name),
                };
            }
        }

        if (company.TryGetProperty("openingBalances", out _))
        {
            Fail($"GS-E090 setup.openingBalances is not supported by the Sprint 0 runner yet");
        }

        CompanyHandle handle = await database.ProvisionCompanyAsync("Golden " + company.GetProperty("key").GetString(), profile);
        _api = new GlApi(database.Api.CreateClient(), handle);
        _ledger = new LedgerReader(database.ConnectionString, handle.CompanyId);

        if (company.TryGetProperty("overrides", out JsonElement overrides))
        {
            foreach (JsonProperty property in overrides.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "periods":
                        foreach (JsonElement period in property.Value.EnumerateArray())
                        {
                            await database.ExecuteAsAppUserAsync(
                                handle,
                                "UPDATE gl.accounting_period SET status = @status WHERE company_id = @company AND starting_date = @start",
                                ("status", period.GetProperty("status").GetString()!),
                                ("company", handle.CompanyId),
                                ("start", Date(period.GetProperty("month").GetString()! + "-01")));
                        }

                        break;
                    case "glAccounts":
                        foreach (JsonElement account in property.Value.EnumerateArray())
                        {
                            await database.ExecuteAsAppUserAsync(
                                handle,
                                "UPDATE gl.gl_account SET blocked = coalesce(@blocked, blocked), direct_posting = coalesce(@direct, direct_posting) WHERE company_id = @company AND no = @no",
                                ("blocked", account.TryGetProperty("blocked", out JsonElement b) ? b.GetBoolean() : DBNull.Value),
                                ("direct", account.TryGetProperty("directPosting", out JsonElement d) ? d.GetBoolean() : DBNull.Value),
                                ("company", handle.CompanyId),
                                ("no", account.GetProperty("account").GetString()!));
                        }

                        break;
                    default:
                        Fail($"GS-E090 overrides.{property.Name} is not supported by the Sprint 0 runner yet");
                        break;
                }
            }
        }

        return _failures.Count == 0;
    }

    private CompanyProfile Unsupported(CompanyProfile profile, string key)
    {
        Fail($"GS-E090 {key} is not supported by the Sprint 0 runner yet");
        return profile;
    }

    private async Task RunStepAsync(JsonElement step)
    {
        string id = step.GetProperty("id").GetString()!;
        foreach (JsonProperty property in step.EnumerateObject().Where(p => !_supportedStepKeys.Contains(p.Name)))
        {
            Fail($"GS-E090 step {id}: '{property.Name}' is not supported by the Sprint 0 runner yet");
        }

        string action = step.GetProperty("action").GetString()!;
        DateOnly businessDate = DateOnly.FromDateTime(DateTime.ParseExact(step.GetProperty("at").GetString()!, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture));
        JsonNode input = Substitute(JsonNode.Parse(step.TryGetProperty("input", out JsonElement i) ? i.GetRawText() : "{}"))!;
        Watermarks before = await Watermarks.ReadAsync(_ledger!);

        ApiResponse? preview = null;
        ApiResponse response;
        switch (action)
        {
            case "journal.post":
            case "journal.preview":
                foreach (JsonNode? line in input["lines"]!.AsArray())
                {
                    line!["postingDate"] ??= businessDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);   // TST-GS-11
                }

                bool post = action == "journal.post";
                if (post && !(step.TryGetProperty("previewCheck", out JsonElement check) && !check.GetBoolean()))
                {
                    preview = await _api!.PreviewAsync(input.DeepClone());
                }

                response = post ? await _api!.PostAsync(input) : await _api!.PreviewAsync(input);
                break;
            case "transaction.reverse":
                response = await _api!.ReverseAsync(input["transactionNo"]!.GetValue<long>(), input["reasonCode"]?.GetValue<string>());
                break;
            default:
                Fail($"GS-E090 step {id}: action {action} is not supported by the Sprint 0 runner yet");
                return;
        }

        CheckOutcome(id, step.GetProperty("expectOutcome"), response);
        if (preview is not null)
        {
            CheckPreview(id, preview, response);
        }

        if (step.TryGetProperty("capture", out JsonElement capture))
        {
            foreach (JsonProperty variable in capture.EnumerateObject())
            {
                if (JsonPathLite.Select(response.Body, variable.Value.GetString()!) is { } value)
                {
                    _vars[variable.Name] = value.Clone();
                }
                else
                {
                    Fail($"GS-E010 step {id}: capture {variable.Name} = {variable.Value.GetString()} found nothing");
                }
            }
        }

        Delta delta = await Delta.ReadAsync(_ledger!, before);
        if (step.TryGetProperty("expect", out JsonElement expect))
        {
            await CheckExpectationsAsync("step " + id, expect, delta);
        }

        if (delta.GlEntries.Count > 0)
        {
            _failures.AddRange((await GoldenInvariants.CheckAsync(_ledger!)).Select(f => $"step {id}: {f}"));
        }
    }

    // Returns a detached copy of the input with "$var" strings replaced by captured values (TST-GS-08).
    private JsonNode? Substitute(JsonNode? node) => node switch
    {
        JsonObject obj => new JsonObject(obj.Select(p => KeyValuePair.Create(p.Key, Substitute(p.Value)))),
        JsonArray array => new JsonArray([.. array.Select(Substitute)]),
        JsonValue value when value.TryGetValue(out string? text) && text.StartsWith('$') && _vars.TryGetValue(text[1..], out JsonElement captured)
            => JsonNode.Parse(captured.GetRawText()),
        _ => node?.DeepClone(),
    };

    private void CheckOutcome(string step, JsonElement expected, ApiResponse response)
    {
        bool ok = (int)response.Status is >= 200 and < 300;
        string status = expected.GetProperty("status").GetString()!;
        if ((status == "OK") != ok)
        {
            Fail($"GS-E010 step {step}: expected {status}, got {(int)response.Status} {response.Body.GetRawText()}");
            return;
        }

        if (expected.TryGetProperty("http", out JsonElement http) && http.GetInt32() != (int)response.Status)
        {
            Fail($"GS-E010 step {step}: expected HTTP {http.GetInt32()}, got {(int)response.Status}");
        }

        if (expected.TryGetProperty("codes", out JsonElement codes))
        {
            string[] want = [.. codes.EnumerateArray().Select(c => c.GetString()!).Order(StringComparer.Ordinal)];
            string[] got = [.. response.ErrorCodes.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal)];
            if (!want.SequenceEqual(got, StringComparer.Ordinal))
            {
                Fail($"GS-E010 step {step}: expected codes {{{string.Join(", ", want)}}}, got {{{string.Join(", ", got)}}}");
            }
        }

        if (expected.TryGetProperty("bodyContains", out JsonElement contains))
        {
            foreach (JsonProperty property in contains.EnumerateObject())
            {
                string actual = JsonPathLite.Text(JsonPathLite.Select(response.Body, property.Name));
                string want = JsonPathLite.Text(property.Value);
                if (!string.Equals(actual, want, StringComparison.Ordinal))
                {
                    Fail($"GS-E010 step {step}: {property.Name} expected {want}, got {actual}");
                }
            }
        }

        if (expected.TryGetProperty("headers", out _))
        {
            Fail($"GS-E090 step {step}: expectOutcome.headers is not supported by the Sprint 0 runner yet");
        }
    }

    // TST-GS-10 / I-09: preview runs the same code path; its lines equal the post (accounts and amounts), its errors equal the post's.
    private void CheckPreview(string step, ApiResponse preview, ApiResponse post)
    {
        bool postOk = (int)post.Status is >= 200 and < 300;
        bool previewOk = preview.Status == HttpStatusCode.OK;
        if (postOk && !previewOk)
        {
            Fail($"GS-E011 step {step}: preview failed but the post succeeded: {preview.Body.GetRawText()}");
            return;
        }

        if (!postOk)
        {
            string previewCodes = string.Join(",", preview.ErrorCodes.Order(StringComparer.Ordinal));
            string postCodes = string.Join(",", post.ErrorCodes.Order(StringComparer.Ordinal));
            if (!string.Equals(previewCodes, postCodes, StringComparison.Ordinal))
            {
                Fail($"GS-E031 step {step}: preview errors {{{previewCodes}}} differ from post errors {{{postCodes}}}");
            }

            return;
        }

        static string Lines(ApiResponse r) => string.Join(";", r.Body.GetProperty("glEntries").EnumerateArray()
            .Select(e => e.GetProperty("account").GetString() + "=" + e.GetProperty("amount").GetString()).Order(StringComparer.Ordinal));
        if (!string.Equals(Lines(preview), Lines(post), StringComparison.Ordinal))
        {
            Fail($"GS-E031 step {step}: preview {Lines(preview)} <> post {Lines(post)}");
        }

        if (preview.DocumentNos.Any(n => n != "***"))
        {
            Fail($"GS-E031 step {step}: preview must mask legal numbers as ***");
        }
    }

    private async Task CheckExpectationsAsync(string where, JsonElement expect, Delta? delta)
    {
        foreach (JsonProperty property in expect.EnumerateObject().Where(p => !_supportedExpectKeys.Contains(p.Name)))
        {
            Fail($"GS-E090 {where}: expectation '{property.Name}' is not supported by the Sprint 0 runner yet");
        }

        if (expect.TryGetProperty("glMatch", out JsonElement glMatch) && glMatch.GetString() != "exact")
        {
            Fail($"GS-E090 {where}: glMatch {glMatch.GetString()} is not supported by the Sprint 0 runner yet");
        }

        if (delta is not null)
        {
            if (expect.TryGetProperty("noRowsWritten", out JsonElement none) && none.GetBoolean() && !delta.IsEmpty)
            {
                Fail($"GS-E010 {where}: noRowsWritten expected, but {delta.GlEntries.Count} G/L entries / {delta.VatEntries.Count} VAT entries / counters changed: {delta.CountersChanged}");
            }

            bool exhaustive = !expect.TryGetProperty("exhaustive", out JsonElement ex) || ex.GetBoolean();
            if (expect.TryGetProperty("glEntries", out JsonElement gl))
            {
                CheckGlEntries(where, gl, delta, exhaustive);
            }

            if (expect.TryGetProperty("vatEntries", out JsonElement vat))
            {
                CheckVatEntries(where, vat, delta, exhaustive);
            }
        }
        else if (expect.TryGetProperty("glEntries", out _) || expect.TryGetProperty("vatEntries", out _) || expect.TryGetProperty("noRowsWritten", out _))
        {
            Fail($"GS-E090 {where}: glEntries / vatEntries / noRowsWritten are step expectations");
        }

        if (expect.TryGetProperty("numbering", out JsonElement numbering))
        {
            foreach (JsonElement n in numbering.EnumerateArray())
            {
                string? actual = await _ledger!.LastDocumentNoAsync(n.GetProperty("series").GetString()!, n.GetProperty("year").GetInt32());
                string? want = n.GetProperty("lastNo").ValueKind == JsonValueKind.Null ? null : n.GetProperty("lastNo").GetString();
                if (!string.Equals(actual, want, StringComparison.Ordinal))
                {
                    Fail($"GS-E026 {where}: series {n.GetProperty("series").GetString()} {n.GetProperty("year").GetInt32()} expected {want ?? "null"}, actual {actual ?? "null"}");
                }
            }
        }

        if (expect.TryGetProperty("periods", out JsonElement periods))
        {
            foreach (JsonElement period in periods.EnumerateArray())
            {
                List<string> status = await _ledger!.QueryAsync(
                    "SELECT status FROM gl.accounting_period WHERE company_id = @c AND starting_date = @start",
                    r => r.GetString(0),
                    ("start", Date(period.GetProperty("month").GetString()! + "-01")));
                if (status.Count != 1 || status[0] != period.GetProperty("status").GetString())
                {
                    Fail($"GS-E027 {where}: period {period.GetProperty("month").GetString()} expected {period.GetProperty("status").GetString()}, actual {string.Join(",", status)}");
                }
            }
        }

        if (expect.TryGetProperty("balances", out JsonElement balances))
        {
            foreach (JsonElement balance in balances.EnumerateArray())
            {
                string account = balance.GetProperty("account").GetString()!;
                decimal want = balance.TryGetProperty("dr", out JsonElement dr) ? Money(dr) : balance.TryGetProperty("cr", out JsonElement cr) ? -Money(cr) : 0m;
                decimal actual = await _ledger!.BalanceAsync(account, Date(balance.GetProperty("asOf").GetString()!));
                if (actual != want)
                {
                    Fail($"GS-E025 {where}: balance {account} as of {balance.GetProperty("asOf").GetString()} expected {Text(want)} (dr +, cr -), actual {Text(actual)}");
                }
            }
        }

        if (expect.TryGetProperty("trialBalance", out JsonElement trialBalance))
        {
            await CheckTrialBalanceAsync(where, trialBalance);
        }
    }

    private void CheckGlEntries(string where, JsonElement expected, Delta delta, bool exhaustive)
    {
        Dictionary<long, string> rel = delta.GlEntries.Select(e => e.TransactionNo).Distinct().Order()
            .Select((t, index) => (t, Rel: string.Create(CultureInfo.InvariantCulture, $"T{index + 1}"))).ToDictionary(x => x.t, x => x.Rel);
        List<GlEntryRow> unmatched = [.. delta.GlEntries];
        foreach (JsonElement line in expected.EnumerateArray())
        {
            string account = line.GetProperty("account").GetString()!;
            decimal amount = line.TryGetProperty("dr", out JsonElement dr) ? Money(dr) : -Money(line.GetProperty("cr"));
            string? tx = line.TryGetProperty("transaction", out JsonElement t) ? t.GetString() : null;
            GlEntryRow? match = unmatched.FirstOrDefault(e =>
                e.Account == account && e.Amount == amount
                && (tx is null || rel[e.TransactionNo] == tx)
                && (!line.TryGetProperty("documentNo", out JsonElement doc) || e.DocumentNo == doc.GetString())
                && (!line.TryGetProperty("postingDate", out JsonElement date) || e.PostingDate == Date(date.GetString()!))
                && (!line.TryGetProperty("sourceCode", out JsonElement source) || e.SourceCode == source.GetString())
                && (!line.TryGetProperty("vatAmount", out JsonElement vat) || e.VatAmount == Money(vat)));
            if (match is null)
            {
                Fail($"GS-E020 {where}: no G/L entry {tx} {account} {(amount > 0 ? "dr " + Text(amount) : "cr " + Text(-amount))} {line.GetRawText()}; actual: {Describe(delta.GlEntries, rel)}");
            }
            else
            {
                unmatched.Remove(match);
            }
        }

        if (exhaustive && unmatched.Count > 0)
        {
            Fail($"GS-E021 {where}: unexpected G/L entries {Describe(unmatched, rel)}");
        }
    }

    private void CheckVatEntries(string where, JsonElement expected, Delta delta, bool exhaustive)
    {
        List<GoldenVatRow> unmatched = [.. delta.VatEntries];
        foreach (JsonElement line in expected.EnumerateArray())
        {
            GoldenVatRow? match = unmatched.FirstOrDefault(v =>
                v.EntryType == line.GetProperty("type").GetString()
                && v.Base == Money(line.GetProperty("base"))
                && v.Amount == Money(line.GetProperty("amount"))
                && (!line.TryGetProperty("vatCategory", out JsonElement category) || v.VatCategory == category.GetString())
                && (!line.TryGetProperty("calcType", out JsonElement calc) || v.CalculationType == calc.GetString())
                && (!line.TryGetProperty("vatPercent", out JsonElement pct) || v.VatPercent == Money(pct))
                && (!line.TryGetProperty("vatDate", out JsonElement date) || v.VatDate == Date(date.GetString()!))
                && (!line.TryGetProperty("ebarimtTaxType", out JsonElement taxType) || v.EbarimtTaxType == taxType.GetString())
                && (!line.TryGetProperty("closed", out JsonElement closed) || v.Closed == closed.GetBoolean())
                && (!line.TryGetProperty("deductibleConfirmed", out JsonElement confirmed) || v.DeductibleConfirmed == confirmed.GetBoolean()));
            if (match is null)
            {
                Fail($"GS-E022 {where}: no VAT entry {line.GetRawText()}; actual: {string.Join(" | ", delta.VatEntries)}");
            }
            else
            {
                unmatched.Remove(match);
            }
        }

        if (exhaustive && unmatched.Count > 0)
        {
            Fail($"GS-E022 {where}: unexpected VAT entries {string.Join(" | ", unmatched)}");
        }
    }

    private async Task CheckTrialBalanceAsync(string where, JsonElement expected)
    {
        DateOnly from = Date(expected.GetProperty("from").GetString()!);
        DateOnly to = Date(expected.GetProperty("to").GetString()!);
        Dictionary<string, (decimal Opening, decimal PeriodDr, decimal PeriodCr, decimal Closing)> rows = (await _ledger!.QueryAsync(
                """
                SELECT a.no,
                       coalesce(sum(e.amount) FILTER (WHERE e.posting_date < @from), 0),
                       coalesce(sum(e.debit_amount) FILTER (WHERE e.posting_date BETWEEN @from AND @to), 0),
                       coalesce(sum(e.credit_amount) FILTER (WHERE e.posting_date BETWEEN @from AND @to), 0),
                       coalesce(sum(e.amount) FILTER (WHERE e.posting_date <= @to), 0)
                  FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id
                 WHERE e.company_id = @c GROUP BY a.no
                """,
                r => (No: r.GetString(0), Opening: r.GetDecimal(1), PeriodDr: r.GetDecimal(2), PeriodCr: r.GetDecimal(3), Closing: r.GetDecimal(4)),
                ("from", from),
                ("to", to)))
            .ToDictionary(r => r.No, r => (r.Opening, r.PeriodDr, r.PeriodCr, r.Closing), StringComparer.Ordinal);

        if (expected.TryGetProperty("rows", out JsonElement expectedRows))
        {
            foreach (JsonElement row in expectedRows.EnumerateArray())
            {
                string account = row.GetProperty("account").GetString()!;
                (decimal opening, decimal periodDr, decimal periodCr, decimal closing) = rows.GetValueOrDefault(account);
                Compare(where, account, row, "openingDr", Math.Max(opening, 0m));
                Compare(where, account, row, "openingCr", Math.Max(-opening, 0m));
                Compare(where, account, row, "periodDr", periodDr);
                Compare(where, account, row, "periodCr", periodCr);
                Compare(where, account, row, "closingDr", Math.Max(closing, 0m));
                Compare(where, account, row, "closingCr", Math.Max(-closing, 0m));
            }
        }

        if (expected.TryGetProperty("totals", out JsonElement totals))
        {
            Compare(where, "totals", totals, "periodDr", rows.Values.Sum(r => r.PeriodDr));
            Compare(where, "totals", totals, "periodCr", rows.Values.Sum(r => r.PeriodCr));
            Compare(where, "totals", totals, "closingDr", rows.Values.Sum(r => Math.Max(r.Closing, 0m)));
            Compare(where, "totals", totals, "closingCr", rows.Values.Sum(r => Math.Max(-r.Closing, 0m)));
        }
    }

    private void Compare(string where, string row, JsonElement expected, string column, decimal actual)
    {
        if (expected.TryGetProperty(column, out JsonElement value) && Money(value) != actual)
        {
            Fail($"GS-E040 {where}: trial balance {row}.{column} expected {value.GetString()}, actual {Text(actual)}");
        }
    }

    private static string Describe(IEnumerable<GlEntryRow> entries, Dictionary<long, string> rel) =>
        string.Join(" | ", entries.Select(e => string.Create(
            CultureInfo.InvariantCulture,
            $"{rel[e.TransactionNo]} {e.Account} {(e.Amount > 0 ? "dr " + Text(e.Amount) : "cr " + Text(-e.Amount))} vat {Text(e.VatAmount)} {e.DocumentNo} {e.PostingDate:yyyy-MM-dd} {e.SourceCode}")));
}
