using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Erp.Tests.Integration.Infrastructure;

namespace Erp.Tests.Integration.Posting;

/// <summary>
/// Golden G/L behaviour of the walking skeleton through the real HTTP API, posting engine, schema guards and RLS (app_user).
/// Every test provisions its own company, so numbers always start at 1.
/// </summary>
public sealed class GlPostingTests(PostgresFixture database)
{
    [Fact]
    public async Task Balanced_vouchers_post_with_gapless_legal_and_entry_numbers()
    {
        (GlApi api, LedgerReader ledger) = await NewCompanyAsync("Balanced");

        // Three vouchers in one run: numbered in BR-PST-27 order (posting date, then document no.), not in input order.
        JsonObject body = new()
        {
            ["lines"] = new JsonArray(
                GlApi.Line("J-000002", "2026-03-12", "7213", "50000.00", "2650", "Бичиг хэрэг"),
                GlApi.Line("J-000001", "2026-03-10", "7210", "1500000.00", "2650", "3-р сарын түрээс"),
                GlApi.Line("J-000003", "2026-03-11", "7212", "30000.00", "2650", "Интернэт")),
        };
        ApiResponse first = await api.PostAsync(body);
        ApiResponse second = await api.PostAsync(GlApi.Voucher("J-000004", "2026-03-13", "7230", "2650", "120000.00"));

        first.Status.ShouldBe(HttpStatusCode.Created, first.ToString());
        second.Status.ShouldBe(HttpStatusCode.Created, second.ToString());
        first.DocumentNos.ShouldBe(["GJ-2026-00001", "GJ-2026-00002", "GJ-2026-00003"]);
        second.DocumentNos.ShouldBe(["GJ-2026-00004"]);

        List<GlTransactionRow> transactions = await ledger.TransactionsAsync();
        transactions.Select(t => (t.TransactionNo, t.DocumentNo, t.PostingDate.Day)).ShouldBe(
            [(1L, "GJ-2026-00001", 10), (2L, "GJ-2026-00002", 11), (3L, "GJ-2026-00003", 12), (4L, "GJ-2026-00004", 13)]);
        transactions.ShouldAllBe(t => t.SourceCode == "GENJNL");

        List<GlEntryRow> entries = await ledger.GlEntriesAsync();
        entries.Select(e => e.EntryNo).ShouldBe([1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L]);
        entries.GroupBy(e => e.TransactionNo).ShouldAllBe(g => g.Sum(e => e.Amount) == 0m);
        GlEntryRow rent = entries.Single(e => e.Account == "7210");
        (rent.Debit, rent.Credit, rent.Amount).ShouldBe((1500000.00m, 0m, 1500000.00m));
        GlEntryRow accrual = entries.Single(e => e.Account == "2650" && e.TransactionNo == 1);
        (accrual.Debit, accrual.Credit, accrual.Amount).ShouldBe((0m, 1500000.00m, -1500000.00m));

        (await ledger.RegistersAsync()).Select(r => (r.No, r.FromEntryNo, r.ToEntryNo)).ShouldBe([(1L, (long?)1, (long?)6), (2L, (long?)7, (long?)8)]);
        (await ledger.CountersAsync()).ShouldBe([("GL_ENTRY", 8L), ("GL_REGISTER", 2L), ("GL_TRANSACTION", 4L)]);
    }

    [Fact]
    public async Task Unbalanced_voucher_is_rejected_and_consumes_no_number()
    {
        (GlApi api, LedgerReader ledger) = await NewCompanyAsync("Unbalanced");
        JsonObject unbalanced = new()
        {
            ["lines"] = new JsonArray(GlApi.Line("J-000001", "2026-03-10", "7213", "1000.00"), GlApi.Line("J-000001", "2026-03-10", "2650", "-900.00")),
        };

        ApiResponse rejected = await api.PostAsync(unbalanced);

        rejected.Status.ShouldBe(HttpStatusCode.UnprocessableEntity, rejected.ToString());
        rejected.ErrorCodes.ShouldBe(["gl.voucher_unbalanced"]);
        rejected.Body.GetProperty("errors")[0].GetProperty("details").GetProperty("difference").GetString().ShouldBe("100.00");
        (await ledger.CountAsync("gl.gl_entry")).ShouldBe(0);
        (await ledger.CountersAsync()).ShouldBeEmpty();
        (await ledger.LastDocumentNoAsync("GJ", 2026)).ShouldBeNull();

        JsonObject balanced = new()
        {
            ["lines"] = new JsonArray(GlApi.Line("J-000001", "2026-03-10", "7213", "1000.00"), GlApi.Line("J-000001", "2026-03-10", "2650", "-1000.00")),
        };
        ApiResponse posted = await api.PostAsync(balanced);
        posted.Status.ShouldBe(HttpStatusCode.Created, posted.ToString());
        posted.DocumentNos.ShouldBe(["GJ-2026-00001"]);
    }

    [Fact]
    public async Task Closed_period_is_rejected_for_posting_and_open_period_still_posts()
    {
        CompanyHandle company = await database.ProvisionCompanyAsync("Closed period");
        await database.ExecuteAsAppUserAsync(company, "UPDATE gl.accounting_period SET status = 'CLOSED' WHERE company_id = @c AND starting_date = DATE '2026-01-01'", ("c", company.CompanyId));
        GlApi api = Api(company);

        ApiResponse rejected = await api.PostAsync(GlApi.Voucher("J-000001", "2026-01-20", "7210", "2650", "500000.00"));
        ApiResponse previewRejected = await api.PreviewAsync(GlApi.Voucher("J-000001", "2026-01-20", "7210", "2650", "500000.00"));
        ApiResponse noPeriod = await api.PostAsync(GlApi.Voucher("J-000002", "2029-01-20", "7210", "2650", "500000.00"));
        ApiResponse posted = await api.PostAsync(GlApi.Voucher("J-000003", "2026-02-03", "7210", "2650", "500000.00"));

        rejected.Status.ShouldBe(HttpStatusCode.UnprocessableEntity, rejected.ToString());
        rejected.ErrorCodes.ShouldBe(["gl.period_closed"]);
        previewRejected.ErrorCodes.ShouldBe(["gl.period_closed"]);
        noPeriod.ErrorCodes.ShouldBe(["gl.period_not_found"]);
        posted.DocumentNos.ShouldBe(["GJ-2026-00001"]);
    }

    [Fact]
    public async Task Company_posting_window_applies_to_every_posting()
    {
        CompanyHandle company = await database.ProvisionCompanyAsync(
            "Window", new CompanyProfile { AllowPostingFrom = new DateOnly(2026, 3, 1), AllowPostingTo = new DateOnly(2026, 3, 31) });
        GlApi api = Api(company);

        (await api.PostAsync(GlApi.Voucher("J-1", "2026-02-28", "7210", "2650", "10.00"))).ErrorCodes.ShouldBe(["gl.posting_date_outside_window"]);
        (await api.PostAsync(GlApi.Voucher("J-2", "2026-03-01", "7210", "2650", "10.00"))).DocumentNos.ShouldBe(["GJ-2026-00001"]);
    }

    [Fact]
    public async Task Reversal_posts_opposite_entries_in_the_opposite_column_and_flags_the_originals()
    {
        (GlApi api, LedgerReader ledger) = await NewCompanyAsync("Reversal");
        ApiResponse original = await api.PostAsync(GlApi.Voucher("J-000123", "2026-03-10", "7210", "2650", "1500000.00", "3-р сарын түрээс"));
        original.Status.ShouldBe(HttpStatusCode.Created, original.ToString());

        ApiResponse reversal = await api.ReverseAsync(original.TransactionNo());
        ApiResponse again = await api.ReverseAsync(original.TransactionNo());
        ApiResponse reverseTheReversal = await api.ReverseAsync(reversal.TransactionNo());
        ApiResponse noReason = await api.ReverseAsync(original.TransactionNo(), reasonCode: null);

        reversal.Status.ShouldBe(HttpStatusCode.Created, reversal.ToString());
        reversal.DocumentNos.ShouldBe(["GJ-2026-00001"]);   // original number and date (BR-PST-30), no new legal number
        again.Status.ShouldBe(HttpStatusCode.Conflict);
        again.ErrorCodes.ShouldBe(["gl.transaction_already_reversed"]);
        reverseTheReversal.ErrorCodes.ShouldBe(["gl.reversal_not_reversible"]);
        noReason.ErrorCodes.ShouldBe(["gl.reason_code_required"]);

        List<GlTransactionRow> transactions = await ledger.TransactionsAsync();
        transactions.Count.ShouldBe(2);
        GlTransactionRow mirror = transactions[1];
        (mirror.DocumentNo, mirror.PostingDate, mirror.SourceCode, mirror.ReversesTransactionNo).ShouldBe(("GJ-2026-00001", new DateOnly(2026, 3, 10), "REVERSAL", (long?)1));
        transactions[0].ReversedByTransactionNo.ShouldBe(2);

        List<GlEntryRow> entries = await ledger.GlEntriesAsync();
        GlEntryRow rent = entries.Single(e => e.Account == "7210" && e.TransactionNo == 1);
        GlEntryRow rentReversal = entries.Single(e => e.Account == "7210" && e.TransactionNo == 2);
        (rentReversal.Debit, rentReversal.Credit).ShouldBe((0m, 1500000.00m));      // credit column, not a negative debit (D-C3, no storno)
        rentReversal.ReversedEntryNo.ShouldBe(rent.EntryNo);
        rentReversal.Reversed.ShouldBeTrue();
        rent.Reversed.ShouldBeTrue();
        rent.ReversedByEntryNo.ShouldBe(rentReversal.EntryNo);
        entries.Where(e => e.TransactionNo == 1).ShouldAllBe(e => e.Reversed && e.ReversedByEntryNo != null);

        (await ledger.RegistersAsync()).Select(r => (r.No, r.SourceCode, r.Reversed)).ShouldBe([(1L, "GENJNL", true), (2L, "REVERSAL", false)]);
        (await ledger.BalanceAsync("7210", new DateOnly(2026, 3, 31))).ShouldBe(0m);
        entries.Where(e => e.Account == "7210").Sum(e => e.Debit).ShouldBe(1500000.00m);
        entries.Where(e => e.Account == "7210").Sum(e => e.Credit).ShouldBe(1500000.00m);
    }

    [Fact]
    public async Task Vat_10_percent_journal_splits_gross_110000_into_100000_plus_10000_with_a_vat_entry()
    {
        (GlApi api, LedgerReader ledger) = await NewCompanyAsync("VAT");
        JsonObject sale = new()
        {
            ["lines"] = new JsonArray(
                GlApi.Line("J-000010", "2026-03-15", "1580", "110000.00", description: "Үйлчилгээний орлого (НӨАТ-тэй)"),
                new JsonObject
                {
                    ["documentNo"] = "J-000010",
                    ["postingDate"] = "2026-03-15",
                    ["account"] = "5110",
                    ["amount"] = "-110000.00",
                    ["genPostingType"] = "SALE",
                    ["genBusPostingGroup"] = "DOMESTIC",
                    ["genProdPostingGroup"] = "SERVICES",
                    ["vatBusPostingGroup"] = "DOMESTIC",
                    ["vatProdPostingGroup"] = "VAT10",
                }),
        };

        ApiResponse preview = await api.PreviewAsync(sale);
        ApiResponse posted = await api.PostAsync(sale);

        preview.Status.ShouldBe(HttpStatusCode.OK, preview.ToString());
        preview.DocumentNos.ShouldBe(["***"]);
        posted.Status.ShouldBe(HttpStatusCode.Created, posted.ToString());
        List<GlEntryRow> entries = await ledger.GlEntriesAsync();
        entries.Select(e => (e.Account, e.Amount, e.VatAmount, e.SystemCreated)).ShouldBe(
            [("1580", 110000.00m, 0m, false), ("5110", -100000.00m, -10000.00m, false), ("2300", -10000.00m, 0m, true)], ignoreOrder: true);
        preview.Body.GetProperty("glEntries").EnumerateArray().Select(e => (e.GetProperty("account").GetString(), e.GetProperty("amount").GetString()))
            .ShouldBe([("1580", "110000"), ("5110", "-100000"), ("2300", "-10000")], ignoreOrder: true);

        VatEntryRow vat = (await ledger.VatEntriesAsync()).ShouldHaveSingleItem();
        (vat.EntryType, vat.Base, vat.Amount, vat.VatPercent, vat.VatCategory, vat.CalculationType, vat.EbarimtTaxType).ShouldBe(
            ("SALE", -100000.00m, -10000.00m, 10m, "VAT10", "NORMAL", "VAT_ABLE"));
        vat.GlEntryNo.ShouldBe(entries.Single(e => e.Account == "5110").EntryNo);   // linked to the BASE entry, not to 2300 (R-VAT-20)
        (await ledger.RegistersAsync()).Single().Apply(r => (r.FromVatEntryNo, r.ToVatEntryNo).ShouldBe(((long?)1, (long?)1)));
        (await ledger.CountAsync("tax.gl_entry_vat_entry_link")).ShouldBe(1);

        // Reversal mirrors the VAT entry and flags the original.
        ApiResponse reversal = await api.ReverseAsync(posted.TransactionNo());
        reversal.Status.ShouldBe(HttpStatusCode.Created, reversal.ToString());
        List<VatEntryRow> vatEntries = await ledger.VatEntriesAsync();
        vatEntries.Count.ShouldBe(2);
        (vatEntries[1].Base, vatEntries[1].Amount, vatEntries[1].ReversedEntryNo).ShouldBe((100000.00m, 10000.00m, (long?)1));
        vatEntries[0].Reversed.ShouldBeTrue();
        vatEntries[0].ReversedByEntryNo.ShouldBe(2);
        (await ledger.BalanceAsync("2300", new DateOnly(2026, 3, 31))).ShouldBe(0m);
    }

    [Fact]
    public async Task Control_and_heading_accounts_are_rejected_for_user_lines()
    {
        (GlApi api, _) = await NewCompanyAsync("Accounts");

        ApiResponse control = await api.PostAsync(GlApi.Voucher("J-1", "2026-03-10", "2300", "2650", "100.00"));
        ApiResponse heading = await api.PostAsync(GlApi.Voucher("J-2", "2026-03-10", "1199", "2650", "100.00"));
        ApiResponse endTotal = await api.PostAsync(GlApi.Voucher("J-5", "2026-03-10", "9999", "2650", "100.00"));
        ApiResponse unknown = await api.PostAsync(GlApi.Voucher("J-3", "2026-03-10", "4321", "2650", "100.00"));
        ApiResponse unrounded = await api.PostAsync(GlApi.Voucher("J-4", "2026-03-10", "7210", "2650", "100.005"));

        control.ErrorCodes.ShouldBe(["gl.direct_posting_not_allowed"]);
        heading.ErrorCodes.ShouldBe(["gl.account_not_posting"]);
        endTotal.ErrorCodes.ShouldBe(["gl.account_not_posting"]);
        unknown.ErrorCodes.ShouldBe(["gl.account_not_found"]);
        unrounded.ErrorCodes.ShouldBe(["gl.amount_not_rounded"]);
    }

    [Fact]
    public async Task Preview_runs_the_same_path_and_rolls_back_everything()
    {
        (GlApi api, LedgerReader ledger) = await NewCompanyAsync("Preview");
        JsonObject body = GlApi.Voucher("J-1", "2026-03-10", "7210", "2650", "250000.00");

        ApiResponse preview = await api.PreviewAsync(body);

        preview.Status.ShouldBe(HttpStatusCode.OK, preview.ToString());
        preview.Body.GetProperty("registerNo").ValueKind.ShouldBe(System.Text.Json.JsonValueKind.Null);
        preview.Body.GetProperty("preview").GetBoolean().ShouldBeTrue();
        (await ledger.CountAsync("gl.gl_entry")).ShouldBe(0);
        (await ledger.CountersAsync()).ShouldBeEmpty();
        (await ledger.LastDocumentNoAsync("GJ", 2026)).ShouldBeNull();
        (await api.PostAsync(body)).DocumentNos.ShouldBe(["GJ-2026-00001"]);
    }

    [Fact]
    public async Task Twenty_concurrent_postings_keep_every_number_gapless()
    {
        (GlApi api, LedgerReader ledger) = await NewCompanyAsync("Concurrency");

        ApiResponse[] responses = await Task.WhenAll(Enumerable.Range(1, 20).Select(i =>
            api.PostAsync(GlApi.Voucher(Invariant($"J-{i:000000}"), "2026-03-10", "7213", "2650", Invariant($"{i * 1000}.00")))));

        responses.ShouldAllBe(r => r.Status == HttpStatusCode.Created);
        responses.SelectMany(r => r.DocumentNos).Order(StringComparer.Ordinal)
            .ShouldBe(Enumerable.Range(1, 20).Select(i => Invariant($"GJ-2026-{i:00000}")));
        (await ledger.GlEntriesAsync()).Select(e => e.EntryNo).ShouldBe(Enumerable.Range(1, 40).Select(i => (long)i));
        (await ledger.TransactionsAsync()).Select(t => t.TransactionNo).ShouldBe(Enumerable.Range(1, 20).Select(i => (long)i));
        (await ledger.RegistersAsync()).Select(r => r.No).ShouldBe(Enumerable.Range(1, 20).Select(i => (long)i));
        (await ledger.AllocationsAsync()).Select(a => a.No).ShouldBe(Enumerable.Range(1, 20).Select(i => (long)i));
        (await ledger.BalanceAsync("7213", new DateOnly(2026, 3, 31))).ShouldBe(Enumerable.Range(1, 20).Sum(i => i * 1000m));
    }

    [Fact]
    public async Task Missing_tenant_header_is_rejected_and_rls_hides_other_tenants()
    {
        CompanyHandle a = await database.ProvisionCompanyAsync("Tenant A");
        CompanyHandle b = await database.ProvisionCompanyAsync("Tenant B");
        using HttpClient client = database.Api.CreateClient();

        HttpResponseMessage missing = await client.PostAsJsonAsync(
            Invariant($"/api/v1/companies/{a.CompanyId}/gl/postings"), GlApi.Voucher("J-1", "2026-03-10", "7210", "2650", "1.00"), TestContext.Current.CancellationToken);
        missing.StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // Tenant B's headers with tenant A's company: RLS (company_isolation + tenant_isolation) shows no journal template.
        GlApi crossTenant = new(client, a with { TenantId = b.TenantId });
        ApiResponse response = await crossTenant.PostAsync(GlApi.Voucher("J-1", "2026-03-10", "7210", "2650", "1.00"));
        response.ErrorCodes.ShouldBe(["gl.journal_template_not_found"]);
    }

    [Fact]
    public async Task Health_endpoints_report_live_and_ready()
    {
        using HttpClient client = database.Api.CreateClient();
        (await client.GetAsync("/health/live", TestContext.Current.CancellationToken)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await client.GetAsync("/health/ready", TestContext.Current.CancellationToken)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    private static string Invariant(FormattableString text) => FormattableString.Invariant(text);

    private GlApi Api(CompanyHandle company) => new(database.Api.CreateClient(), company);

    private async Task<(GlApi Api, LedgerReader Ledger)> NewCompanyAsync(string name)
    {
        CompanyHandle company = await database.ProvisionCompanyAsync(name);
        return (Api(company), new LedgerReader(database.ConnectionString, company.CompanyId));
    }
}
