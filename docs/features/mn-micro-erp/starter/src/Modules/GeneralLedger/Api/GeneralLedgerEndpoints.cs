using Erp.BuildingBlocks.Api.Problems;
using Erp.BuildingBlocks.Api.Tenancy;
using Erp.BuildingBlocks.Application.Persistence;
using Erp.BuildingBlocks.Domain.Results;
using Erp.GeneralLedger.Api.Requests;
using Erp.GeneralLedger.Api.Responses;
using Erp.GeneralLedger.Application.Journals;
using Erp.GeneralLedger.Application.Reversal;
using Erp.GeneralLedger.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Erp.GeneralLedger.Api;

/// <summary>
/// G/L endpoints of the Sprint 0 skeleton (14-api.md §15.2 shapes, simplified): direct journal posting / preview and transaction
/// reversal. STUBBED for Sprint 1: authentication + permissions (RequirePermission), Idempotency-Key store, ETag/If-Match, the
/// draft-journal resources (<c>/journals/{id}:post</c>); the tenant comes from the dev header (DevTenantHeaders).
/// </summary>
public static class GeneralLedgerEndpoints
{
    /// <summary>Maps the endpoints under <c>/api/v1/companies/{companyId}</c>.</summary>
    public static IEndpointRouteBuilder MapGeneralLedgerEndpoints(this IEndpointRouteBuilder endpoints)
    {
        RouteGroupBuilder company = endpoints.MapGroup("/api/v1/companies/{companyId:guid}").WithTags("GeneralLedger");
        company.MapPost("/gl/postings", (Guid companyId, PostingRequest body, HttpContext http, CancellationToken ct) =>
                PostAsync(companyId, body, PostingMode.Post, http, ct))
            .WithName("PostJournalLines");
        company.MapPost("/gl/postings:preview", (Guid companyId, PostingRequest body, HttpContext http, CancellationToken ct) =>
                PostAsync(companyId, body, PostingMode.Preview, http, ct))
            .WithName("PreviewJournalLines");
        company.MapPost("/gl-transactions/{transactionNo:long}:reverse", ReverseAsync)
            .WithName("ReverseGlTransaction");
        return endpoints;
    }

    private static async Task<IResult> PostAsync(Guid companyId, PostingRequest body, PostingMode mode, HttpContext http, CancellationToken ct)
    {
        if (DevTenantHeaders.TryGetScope(http, companyId) is not { } scope)
        {
            return MissingTenant();
        }

        PostJournalCommand command = new(
            body.JournalTemplate,
            body.JournalBatch,
            [.. body.Lines.Select(l => new JournalLineInput
            {
                LineNo = l.LineNo,
                DocumentNo = l.DocumentNo,
                PostingDate = l.PostingDate,
                DocumentDate = l.DocumentDate,
                DocumentType = l.DocumentType,
                AccountNo = l.Account,
                BalAccountNo = l.BalAccount,
                Amount = l.Amount,
                Description = l.Description,
                ExternalDocumentNo = l.ExternalDocumentNo,
                GenPostingType = l.GenPostingType,
                GenBusPostingGroup = l.GenBusPostingGroup,
                GenProdPostingGroup = l.GenProdPostingGroup,
                VatBusPostingGroup = l.VatBusPostingGroup,
                VatProdPostingGroup = l.VatProdPostingGroup,
                VatDate = l.VatDate,
                SupplierEbarimtId = l.SupplierEbarimtId,
            })]);

        ITenantTransactionRunner runner = http.RequestServices.GetRequiredService<ITenantTransactionRunner>();
        PostJournalHandler handler = http.RequestServices.GetRequiredService<PostJournalHandler>();
        Result<PostingResult> result = await runner.ExecuteAsync(scope, c => handler.HandleAsync(command, mode, c), ct);
        return ToHttp(result, mode);
    }

    private static async Task<IResult> ReverseAsync(Guid companyId, long transactionNo, ReverseRequest body, HttpContext http, CancellationToken ct)
    {
        if (DevTenantHeaders.TryGetScope(http, companyId) is not { } scope)
        {
            return MissingTenant();
        }

        ITenantTransactionRunner runner = http.RequestServices.GetRequiredService<ITenantTransactionRunner>();
        ReverseTransactionHandler handler = http.RequestServices.GetRequiredService<ReverseTransactionHandler>();
        Result<PostingResult> result = await runner.ExecuteAsync(
            scope, c => handler.HandleAsync(new ReverseTransactionCommand(transactionNo, body.ReasonCode), PostingMode.Post, c), ct);
        return ToHttp(result, PostingMode.Post);
    }

    private static IResult ToHttp(Result<PostingResult> result, PostingMode mode)
    {
        if (result.IsSuccess)
        {
            PostingResponse response = PostingResponse.From(result.Value);
            return mode == PostingMode.Preview ? Results.Ok(response) : Results.Json(response, statusCode: StatusCodes.Status201Created);
        }

        return ErrorResults.Problem(result.Errors, GlErrorStatus.For(result.Errors));
    }

    private static IResult MissingTenant() => ErrorResults.Problem(
        [new Error("platform.tenant_required", $"Header {DevTenantHeaders.TenantHeader} with the tenant id is required (Sprint 0 stub).")],
        StatusCodes.Status400BadRequest);
}
