using System.Net;
using System.Text.Json;

namespace Erp.Tests.Integration.Infrastructure;

/// <summary>Status + parsed JSON body of an API call.</summary>
public sealed record ApiResponse(HttpStatusCode Status, JsonElement Body)
{
    /// <summary>Codes of ProblemDetails <c>errors[]</c> (empty on success).</summary>
    public IReadOnlyList<string> ErrorCodes =>
        Body.ValueKind == JsonValueKind.Object && Body.TryGetProperty("errors", out JsonElement errors) && errors.ValueKind == JsonValueKind.Array
            ? [.. errors.EnumerateArray().Select(e => e.GetProperty("code").GetString()!)]
            : [];

    public IReadOnlyList<string> DocumentNos => [.. Body.GetProperty("vouchers").EnumerateArray().Select(v => v.GetProperty("documentNo").GetString()!)];

    public long TransactionNo(int voucher = 0) => Body.GetProperty("vouchers")[voucher].GetProperty("transactionNo").GetInt64();

    public override string ToString() => $"{(int)Status} {Body}";
}
