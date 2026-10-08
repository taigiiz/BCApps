namespace Erp.GeneralLedger.Api.Requests;

/// <summary>Body of <c>POST …/gl-transactions/{transactionNo}:reverse</c>.</summary>
internal sealed record ReverseRequest(string? ReasonCode);
