using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Erp.BuildingBlocks.Api.Tenancy;

namespace Erp.Tests.Integration.Infrastructure;

/// <summary>HTTP client of the G/L endpoints for one company (dev tenant headers, Sprint 0 stub).</summary>
public sealed class GlApi(HttpClient client, CompanyHandle company)
{
    public CompanyHandle Company { get; } = company;

    /// <summary>A one-voucher journal: debit <paramref name="account"/> / credit <paramref name="balAccount"/>.</summary>
    public static JsonObject Voucher(string documentNo, string postingDate, string account, string balAccount, string amount, string? description = null) => new()
    {
        ["lines"] = new JsonArray(Line(documentNo, postingDate, account, amount, balAccount, description)),
    };

    public static JsonObject Line(string documentNo, string postingDate, string account, string amount, string? balAccount = null, string? description = null)
    {
        JsonObject line = new()
        {
            ["documentNo"] = documentNo,
            ["postingDate"] = postingDate,
            ["account"] = account,
            ["amount"] = amount,
        };
        if (balAccount is not null)
        {
            line["balAccount"] = balAccount;
        }

        if (description is not null)
        {
            line["description"] = description;
        }

        return line;
    }

    public Task<ApiResponse> PostAsync(JsonNode body) => SendAsync(CompanyPath("gl/postings"), body);

    public Task<ApiResponse> PreviewAsync(JsonNode body) => SendAsync(CompanyPath("gl/postings:preview"), body);

    public Task<ApiResponse> ReverseAsync(long transactionNo, string? reasonCode = "REVERSAL") =>
        SendAsync(CompanyPath(string.Create(CultureInfo.InvariantCulture, $"gl-transactions/{transactionNo}:reverse")), new JsonObject { ["reasonCode"] = reasonCode });

    private string CompanyPath(string suffix) => string.Create(CultureInfo.InvariantCulture, $"/api/v1/companies/{Company.CompanyId}/{suffix}");

    private async Task<ApiResponse> SendAsync(string path, JsonNode body)
    {
        using HttpRequestMessage request = new(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add(DevTenantHeaders.TenantHeader, Company.TenantId.ToString());
        request.Headers.Add(DevTenantHeaders.UserHeader, Company.UserId.ToString());
        using HttpResponseMessage response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        string text = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        JsonElement json = string.IsNullOrWhiteSpace(text) ? default : JsonDocument.Parse(text).RootElement.Clone();
        return new ApiResponse(response.StatusCode, json);
    }
}
