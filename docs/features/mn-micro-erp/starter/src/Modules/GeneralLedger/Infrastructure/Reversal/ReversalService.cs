using System.Globalization;
using Erp.BuildingBlocks.Domain.Results;
using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.GeneralLedger.Contracts.Reversal;
using Erp.GeneralLedger.Domain;
using Erp.GeneralLedger.Infrastructure.Posting;
using Npgsql;

namespace Erp.GeneralLedger.Infrastructure.Reversal;

/// <summary>
/// Reversal of one journal transaction (05-posting-engine.md §5.10, D-D5, D-C3): under the posting lock it reads the voucher, checks it
/// (not already reversed, not itself a reversal, not a document posting, reason code), asks every <see cref="IReversibleLedger"/>, and
/// posts a mirror voucher with the ORIGINAL date and number and opposite amounts (opposite column, no storno). The engine flags the
/// originals (reversed / reversed_by_*) through platform.fn_ledger_update; the posting-date rule still applies (closed period → error).
/// </summary>
internal sealed class ReversalService(ITenantSession session, PostingEngine engine, IEnumerable<IReversibleLedger> reversibleLedgers) : IReversalService
{
    private const string FolderNamespace = "Erp.GeneralLedger.Infrastructure.Reversal";

    // Source codes whose transactions may be reversed from the journal UI (05-posting-engine.md §3.7).
    private static readonly HashSet<string> _reversibleSourceCodes = new(StringComparer.Ordinal) { "GENJNL", "STDJNL", "OPENING", "CASHRECJNL", "PAYMENTJNL" };

    public async Task<Result<PostingResult>> ReverseTransactionAsync(ReverseTransactionRequest request, PostingMode mode, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (await engine.LockAsync(cancellationToken) is { } lockError)
        {
            return Fail(lockError);
        }

        OriginalTransaction? original = await ReadTransactionAsync(request.TransactionNo, cancellationToken);
        Dictionary<string, string> details = new(StringComparer.Ordinal) { ["transactionNo"] = request.TransactionNo.ToString(CultureInfo.InvariantCulture) };
        if (original is null)
        {
            return Fail(new Error(GlErrorCodes.TransactionNotFound, "The G/L transaction does not exist.") { Details = details });
        }

        List<Error> errors = [];
        (Guid Id, bool Blocked)? reason = await ReadReasonCodeAsync(request.ReasonCode, cancellationToken);
        if (reason is null)
        {
            errors.Add(new Error(GlErrorCodes.ReasonCodeNotFound, $"Reason code {request.ReasonCode} does not exist.") { Target = "/reasonCode" });
        }
        else if (reason.Value.Blocked)
        {
            errors.Add(new Error(GlErrorCodes.ReasonCodeBlocked, $"Reason code {request.ReasonCode} is blocked.") { Target = "/reasonCode" });
        }

        if (original.ReversedByTransactionNo is not null)
        {
            errors.Add(new Error(GlErrorCodes.TransactionAlreadyReversed, $"Transaction {original.DocumentNo} is already reversed.") { Details = details });
        }
        else if (original.ReversesTransactionNo is not null || original.SourceCode == "REVERSAL")
        {
            errors.Add(new Error(GlErrorCodes.ReversalNotReversible, "A reversal cannot be reversed; post a new journal instead.") { Details = details });
        }
        else if (original.SourceCode is "SALES" or "PURCHASES")
        {
            errors.Add(new Error(GlErrorCodes.ReversalUseCreditMemo, "Document postings are corrected with a credit memo (D-D5).") { Details = details });
        }
        else if (!_reversibleSourceCodes.Contains(original.SourceCode))
        {
            errors.Add(new Error(GlErrorCodes.ReversalNotReversible, $"Transactions of source {original.SourceCode} cannot be reversed here.") { Details = details });
        }

        if (errors.Count == 0)
        {
            foreach (IReversibleLedger ledger in reversibleLedgers.OrderBy(l => l.Order))
            {
                errors.AddRange(await ledger.ValidateReversalAsync([original.TransactionNo], cancellationToken));
            }
        }

        if (errors.Count > 0)
        {
            return Fail(errors);
        }

        IReadOnlyList<OriginalEntry> entries = await ReadEntriesAsync(original.TransactionNo, cancellationToken);
        string description = "Буцаалт: " + (original.Description ?? original.DocumentNo);
        PostingVoucher voucher = new()
        {
            Key = "R1",
            Numbering = new ExistingNumbering(original.DocumentNo),
            DocumentType = original.DocumentType,
            PostingDate = original.PostingDate,
            DocumentDate = entries.Select(e => e.DocumentDate).FirstOrDefault(d => d is not null),
            IsClosing = original.IsClosing,
            SourceCode = "REVERSAL",
            ReasonCodeId = reason!.Value.Id,
            Description = description,
            ReversesTransactionNo = original.TransactionNo,
            DraftDocumentNo = original.DocumentNo,
            GlLines = [.. entries.Select(e => new GlPostingLine
            {
                Key = string.Create(CultureInfo.InvariantCulture, $"R1/E{e.EntryNo}"),
                GlAccountId = e.GlAccountId,
                Amount = -e.Amount,
                VatAmount = -e.VatAmount,
                Origin = LineOrigin.SystemGenerated,
                DimensionSetId = e.DimensionSetId,
                GenPostingType = e.GenPostingType,
                Groups = e.Groups,
                VatDate = e.VatDate,
                Description = e.Description,
                ExternalDocumentNo = e.ExternalDocumentNo,
                BalGlAccountId = e.BalGlAccountId,
                ReversedEntryNo = e.EntryNo,
            })],
        };
        PostingDocument document = new()
        {
            Run = new PostingRun("REVERSAL", "REVERSAL", new SourceRef("gl.gl_transaction", original.Id, original.DocumentNo), null, null),
            Vouchers = [voucher],
        };
        return await engine.PostAsync(document, mode, cancellationToken);
    }

    private Result<PostingResult> Fail(Error error) => Fail([error]);

    private Result<PostingResult> Fail(IReadOnlyList<Error> errors)
    {
        session.MarkRollbackOnly();
        return Result.Failure<PostingResult>(errors);
    }

    private async Task<OriginalTransaction?> ReadTransactionAsync(long transactionNo, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_transaction"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("transaction_no", transactionNo);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new OriginalTransaction(
            reader.GetGuid(0),
            reader.GetInt64(1),
            reader.GetInt64(2),
            reader.GetDateOnly(3),
            reader.GetBoolean(4),
            reader.GetString(5),
            reader.GetString(6),
            reader.GetString(7),
            reader.GetStringOrNull(8),
            reader.GetInt64OrNull(9),
            reader.GetInt64OrNull(10));
    }

    private async Task<IReadOnlyList<OriginalEntry>> ReadEntriesAsync(long transactionNo, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_transaction_entries"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("transaction_no", transactionNo);
        List<OriginalEntry> entries = [];
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            entries.Add(new OriginalEntry(
                reader.GetInt64(0),
                reader.GetGuid(1),
                reader.GetDecimal(2),
                reader.GetDecimal(3),
                reader.GetString(4),
                new PostingGroupSnapshot(reader.GetStringOrNull(5), reader.GetStringOrNull(6), reader.GetStringOrNull(7), reader.GetStringOrNull(8)),
                reader.GetDateOnlyOrNull(9),
                reader.GetDateOnlyOrNull(10),
                reader.GetStringOrNull(11),
                reader.GetStringOrNull(12),
                reader.GetGuidOrNull(13),
                reader.GetInt64(14)));
        }

        return entries;
    }

    private async Task<(Guid Id, bool Blocked)?> ReadReasonCodeAsync(string code, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_reason_code"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("code", code);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? (reader.GetGuid(0), reader.GetBoolean(1)) : null;
    }
}
