using Erp.BuildingBlocks.Domain.Results;
using Erp.GeneralLedger.Domain;
using Npgsql;

namespace Erp.GeneralLedger.Infrastructure.Posting;

/// <summary>
/// Maps the SQLSTATEs raised by the canonical schema's guards (db/README.md §5) to business error codes
/// (05-posting-engine.md §8.8). Unknown states return null and propagate as infrastructure errors (HTTP 500).
/// </summary>
internal static class PostgresErrorTranslator
{
    public static Error? Translate(PostgresException exception)
    {
        ArgumentNullException.ThrowIfNull(exception);
        string message = exception.MessageText;
        return exception.SqlState switch
        {
            "ERB01" => new Error(GlErrorCodes.VoucherUnbalanced, message),
            "ERP01" => new Error(exception.Detail is { } detail && detail.StartsWith("gl.", StringComparison.Ordinal) ? detail : GlErrorCodes.PeriodClosed, message),
            "ERG01" => new Error(GlErrorCodes.AccountNotPosting, message),
            "ERN01" => new Error(GlErrorCodes.NumberSeriesMissingLine, message),
            "ERN02" => new Error(GlErrorCodes.NumberSeriesDateOrder, message),
            "ERN03" => new Error(GlErrorCodes.NumberSeriesExhausted, message),
            "ERV01" => new Error("tax.vat_period_closed", message),
            PostgresErrorCodes.LockNotAvailable => new Error(GlErrorCodes.PostingLockTimeout, "Another posting of this company is running; try again."),
            _ => null,
        };
    }
}
