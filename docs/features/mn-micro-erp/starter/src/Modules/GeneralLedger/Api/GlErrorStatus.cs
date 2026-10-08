using Erp.BuildingBlocks.Domain.Results;
using Microsoft.AspNetCore.Http;

namespace Erp.GeneralLedger.Api;

/// <summary>HTTP status of G/L business errors (05-posting-engine.md §8, 14-api.md): 422 by default.</summary>
internal static class GlErrorStatus
{
    public static int For(IReadOnlyList<Error> errors)
    {
        if (errors.Count != 1)
        {
            return StatusCodes.Status422UnprocessableEntity;
        }

        return errors[0].Code switch
        {
            "gl.transaction_not_found" or "gl.journal_template_not_found" => StatusCodes.Status404NotFound,
            "gl.transaction_already_reversed" or "gl.reversal_use_credit_memo" or "gl.reversal_not_reversible" => StatusCodes.Status409Conflict,
            "gl.posting_lock_timeout" => StatusCodes.Status503ServiceUnavailable,
            _ => StatusCodes.Status422UnprocessableEntity,
        };
    }
}
