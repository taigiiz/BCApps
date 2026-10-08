using Erp.BuildingBlocks.Domain.Results;
using Microsoft.AspNetCore.Http;

namespace Erp.BuildingBlocks.Api.Problems;

/// <summary>
/// Maps business errors to RFC 9457 ProblemDetails (14-api.md): <c>code</c> = first error code (or <c>api.validation_failed</c>
/// when several), <c>errors[]</c> = every error with <c>code</c>, <c>message</c>, <c>pointer</c>, <c>details</c>.
/// </summary>
public static class ErrorResults
{
    /// <summary>Builds the problem response; <paramref name="status"/> defaults to 422.</summary>
    public static IResult Problem(IReadOnlyList<Error> errors, int status = StatusCodes.Status422UnprocessableEntity)
    {
        ArgumentNullException.ThrowIfNull(errors);
        string code = errors.Count == 1 ? errors[0].Code : "api.validation_failed";
        Dictionary<string, object?> extensions = new(StringComparer.Ordinal)
        {
            ["code"] = code,
            ["errors"] = errors.Select(e => new ProblemError(e.Code, e.Message, e.Target, e.Details)).ToArray(),
        };
        return Results.Problem(
            title: errors.Count == 1 ? errors[0].Message : "The request has validation errors.",
            statusCode: status,
            type: "https://errors.mn-erp.local/" + code,
            extensions: extensions);
    }
}
