using Erp.BuildingBlocks.Domain.Results;
using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.GeneralLedger.Contracts.Reversal;
using Erp.GeneralLedger.Domain;
using Erp.GeneralLedger.Domain.Accounts;
using Erp.GeneralLedger.Domain.Periods;
using Erp.GeneralLedger.Domain.Posting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Erp.GeneralLedger.Infrastructure.Posting;

/// <summary>
/// The posting engine (05-posting-engine.md §5.2, BC CU12). Inside the command's TenantSession: advisory lock per company →
/// validation under the lock (balance, rounding, postable accounts, open period / window, reason codes, writer checks) →
/// gapless numbers from <c>platform.fn_next_document_no</c> / <c>platform.fn_next_entry_no</c> → INSERT gl_transaction, gl_entry →
/// subledger writers → reversal flags → gl_register → <c>SET CONSTRAINTS ALL IMMEDIATE</c>. Preview runs the same
/// path and marks the session rollback-only. This namespace holds the ONLY INSERTs into gl.gl_entry / gl_transaction / gl_register.
/// </summary>
internal sealed partial class PostingEngine(
    ITenantSession session,
    IEnumerable<ILedgerWriter> writers,
    IEnumerable<IReversibleLedger> reversibleLedgers,
    TimeProvider timeProvider,
    ILogger<PostingEngine> logger) : IPostingService
{
    internal const string FolderNamespace = "Erp.GeneralLedger.Infrastructure.Posting";
    private const string PreviewNumber = "***";
    private const int MaxDescriptionLength = 100;

    private bool _runStarted;

    public async Task<IReadOnlyList<Error>> ValidateAsync(PostingDocument document, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(document);
        CompanyPostingSettings settings = await LoadSettingsAsync(cancellationToken);
        List<Error> errors = [.. CheckDocument(document, settings)];
        FactsCheck facts = await CheckFactsAsync(document, cancellationToken);
        errors.AddRange(facts.Errors);
        return errors;
    }

    public async Task<Result<PostingResult>> PostAsync(PostingDocument document, PostingMode mode, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(document);
        if (_runStarted)
        {
            throw new InvalidOperationException("One posting run per database transaction (BR-PST-02).");
        }

        _runStarted = true;
        try
        {
            return await PostCoreAsync(document, mode, cancellationToken);
        }
        catch (PostgresException ex) when (PostgresErrorTranslator.Translate(ex) is { } error)
        {
            session.MarkRollbackOnly();
            LogRejectedByDatabase(ex.SqlState, error.Code);
            return Result.Failure<PostingResult>(error);
        }
    }

    /// <summary>Takes the per-company posting lock (re-entrant within the transaction). Used by the reversal service before it reads.</summary>
    internal async Task<Error?> LockAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "lock_company_posting"));
            command.Parameters.AddWithValue("tenant_id", session.Scope.TenantId);
            command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
            await command.ExecuteNonQueryAsync(cancellationToken);
            return null;
        }
        catch (PostgresException ex) when (PostgresErrorTranslator.Translate(ex) is { } error)
        {
            session.MarkRollbackOnly();
            return error;
        }
    }

    private static IEnumerable<Error> CheckDocument(PostingDocument document, CompanyPostingSettings settings)
    {
        if (document.Vouchers.Count == 0)
        {
            yield return new Error(GlErrorCodes.VoucherEmpty, "The posting has no vouchers.");
            yield break;
        }

        foreach (PostingVoucher voucher in document.Vouchers)
        {
            VoucherLine[] lines = [.. voucher.GlLines.Select(l => new VoucherLine(l.Key, l.Amount))];
            foreach (Error error in VoucherBalanceRule.Check(voucher.DisplayNo, lines, settings.AmountPrecision))
            {
                yield return error;
            }

            string sourceCode = voucher.SourceCode ?? document.Run.SourceCode;
            if (voucher.IsClosing && (sourceCode != "CLSINCOME" || voucher.PostingDate is not { Month: 12, Day: 31 }))
            {
                yield return new Error(GlErrorCodes.ClosingEntryInvalid, $"Voucher {voucher.DisplayNo}: closing entries only on 12-31 by the year-end close.");
            }

            if (sourceCode == "REVERSAL" && voucher.ReasonCodeId is null)
            {
                yield return new Error(GlErrorCodes.ReasonCodeRequired, $"Voucher {voucher.DisplayNo}: a reversal needs a reason code.");
            }
        }
    }

    private static void SelfCheck(PostingDocument document)
    {
        HashSet<string> keys = new(StringComparer.Ordinal);
        foreach (GlPostingLine line in document.Vouchers.SelectMany(v => v.GlLines))
        {
            if (!keys.Add(line.Key))
            {
                throw new InvalidOperationException($"Duplicate G/L line key '{line.Key}' in the posting run (assembler bug, BR-PST-25).");
            }
        }

        foreach (ISubledgerLine line in document.Vouchers.SelectMany(v => v.SubledgerLines))
        {
            if (line.GlLineKeys.Count == 0 || line.GlLineKeys.Any(k => !keys.Contains(k)))
            {
                throw new InvalidOperationException($"Subledger line of {line.Ledger} refers to an unknown G/L line (assembler bug, BR-PST-25).");
            }
        }
    }

    private static string? Truncate(string? text) => text is { Length: > MaxDescriptionLength } ? text[..MaxDescriptionLength] : text;

    private static PostingResult Mask(PostingResult result)
    {
        Dictionary<long, long> tx = result.Vouchers.Select((v, i) => (v.TransactionNo, Rel: i + 1L)).ToDictionary(x => x.TransactionNo, x => x.Rel);
        return result with
        {
            RegisterNo = null,
            Vouchers = [.. result.Vouchers.Select(v => v with { DocumentNo = PreviewNumber, TransactionNo = tx[v.TransactionNo] })],
            GlEntries = [.. result.GlEntries.Select((e, i) => e with { EntryNo = i + 1L, TransactionNo = tx[e.TransactionNo] })],
            SubledgerRows = [.. result.SubledgerRows.GroupBy(r => r.Ledger, StringComparer.Ordinal).SelectMany(g => g.Select((r, i) => r with { EntryNo = i + 1L }))],
        };
    }

    private async Task<Result<PostingResult>> PostCoreAsync(PostingDocument document, PostingMode mode, CancellationToken cancellationToken)
    {
        long lockStarted = timeProvider.GetTimestamp();
        if (await LockAsync(cancellationToken) is { } lockError)
        {
            return Result.Failure<PostingResult>(lockError);
        }

        int lockWaitMs = (int)timeProvider.GetElapsedTime(lockStarted).TotalMilliseconds;
        CompanyPostingSettings settings = await LoadSettingsAsync(cancellationToken);
        PostingWriteContext context = new(session, document, mode);
        List<Error> errors = [.. CheckDocument(document, settings)];
        FactsCheck facts = await CheckFactsAsync(document, cancellationToken);
        errors.AddRange(facts.Errors);

        List<(ILedgerWriter Writer, List<ISubledgerLine> Lines)> subledgers = [.. document.Vouchers
            .SelectMany(v => v.SubledgerLines)
            .GroupBy(l => l.Ledger, StringComparer.Ordinal)
            .Select(g => (Writer: ResolveWriter(g.Key), Lines: g.ToList()))
            .OrderBy(g => g.Writer.Order)];
        foreach ((ILedgerWriter writer, List<ISubledgerLine> lines) in subledgers)
        {
            errors.AddRange(await writer.ValidateLockedAsync(context, lines, cancellationToken));
        }

        if (errors.Count > 0)
        {
            session.MarkRollbackOnly();
            return Result.Failure<PostingResult>(errors);
        }

        SelfCheck(document);
        await AllocateNumbersAsync(context, cancellationToken);
        await InsertTransactionsAsync(context, cancellationToken);
        await InsertEntriesAsync(context, cancellationToken);

        List<LedgerRowView> rows = [];
        foreach ((ILedgerWriter writer, List<ISubledgerLine> lines) in subledgers)
        {
            rows.AddRange(await writer.WriteAsync(context, lines, cancellationToken));
        }

        if (document.Vouchers.Any(v => v.ReversesTransactionNo is not null))
        {
            rows.AddRange(await ApplyReversalAsync(context, cancellationToken));
        }

        await InsertRegisterAsync(context, cancellationToken);
        await ExecuteAsync("set_constraints_immediate", cancellationToken);

        PostingResult result = BuildResult(context, facts.AccountNos, rows, mode);
        if (mode == PostingMode.Preview)
        {
            session.MarkRollbackOnly();
            return Result.Success(Mask(result));
        }

        // audit.posting_log (BR-PST-67) is NOT written yet: the canonical schema rejects every insert into it (the generic ledger
        // trigger platform.fn_ledger_before_insert assigns NEW.created_at, which audit.posting_log does not have). Schema change
        // request: starter/README.md "Known schema defects" #1. Until then the run is logged with structured logging only.
        LogPosted(document.Run.PostingType, result.RegisterNo ?? 0, result.Vouchers.Count, result.GlEntries.Count, lockWaitMs);
        return Result.Success(result);
    }

    private ILedgerWriter ResolveWriter(string ledger) =>
        writers.SingleOrDefault(w => string.Equals(w.Ledger, ledger, StringComparison.Ordinal))
        ?? throw new InvalidOperationException($"No ILedgerWriter is registered for ledger {ledger}.");

    private async Task<CompanyPostingSettings> LoadSettingsAsync(CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_company_settings"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        object? precision = await command.ExecuteScalarAsync(cancellationToken);
        return precision is decimal p
            ? new CompanyPostingSettings(p)
            : throw new InvalidOperationException("platform.company_setup is missing for the company (provision it first).");
    }

    private async Task<FactsCheck> CheckFactsAsync(PostingDocument document, CancellationToken cancellationToken)
    {
        List<Error> errors = [];

        // (1) posting dates: period, fiscal year, company window (D-D3)
        Dictionary<DateOnly, PostingDateFacts> dates = [];
        DateOnly[] postingDates = [.. document.Vouchers.Select(v => v.PostingDate).Distinct().Order()];
        await using (NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_posting_date_facts")))
        {
            command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
            command.Parameters.AddWithValue("posting_dates", postingDates);
            await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                PostingDateFacts facts = new(
                    reader.GetDateOnly(0),
                    PostingDateFacts.ParseStatus(reader.GetStringOrNull(1)),
                    PostingDateFacts.ParseStatus(reader.GetStringOrNull(2)),
                    reader.GetDateOnlyOrNull(3),
                    reader.GetDateOnlyOrNull(4));
                dates[facts.PostingDate] = facts;
            }
        }

        foreach (PostingVoucher voucher in document.Vouchers)
        {
            if (PostingDateRule.Check(dates[voucher.PostingDate], voucher.IsClosing) is { } error)
            {
                Dictionary<string, string> details = new(error.Details ?? new Dictionary<string, string>(StringComparer.Ordinal), StringComparer.Ordinal)
                {
                    ["documentNo"] = voucher.DisplayNo,
                };
                errors.Add(error with { Details = details });
            }
        }

        // (2) accounts: posting type, blocked, direct posting for user-entered lines (ERG01, BR-PST-15)
        Guid[] accountIds = [.. document.Vouchers.SelectMany(v => v.GlLines).Select(l => l.GlAccountId).Distinct()];
        Dictionary<Guid, GlAccountSnapshot> accounts = [];
        await using (NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_accounts")))
        {
            command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
            command.Parameters.AddWithValue("account_ids", accountIds);
            await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                GlAccountSnapshot account = new(
                    reader.GetGuid(0), reader.GetString(1), GlAccountSnapshot.ParseType(reader.GetString(2)), reader.GetBoolean(3), reader.GetBoolean(4));
                accounts[account.Id] = account;
            }
        }

        HashSet<(string Code, Guid Account)> reported = [];
        foreach (PostingVoucher voucher in document.Vouchers)
        {
            foreach (GlPostingLine line in voucher.GlLines)
            {
                Error? error = AccountPostingRule.Check(
                    accounts.GetValueOrDefault(line.GlAccountId), line.Origin == LineOrigin.UserEntered, $"/vouchers/{voucher.DisplayNo}/lines/{line.Key}");
                if (error is not null && reported.Add((error.Code, line.GlAccountId)))
                {
                    errors.Add(error);
                }
            }
        }

        // (3) reason codes
        Guid[] reasonIds = [.. document.Vouchers.Select(v => v.ReasonCodeId).OfType<Guid>().Distinct()];
        if (reasonIds.Length > 0)
        {
            Dictionary<Guid, bool> reasons = [];
            await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_reason_codes"));
            command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
            command.Parameters.AddWithValue("reason_code_ids", reasonIds);
            await using (NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken))
            {
                while (await reader.ReadAsync(cancellationToken))
                {
                    reasons[reader.GetGuid(0)] = reader.GetBoolean(1);
                }
            }

            foreach (Guid id in reasonIds)
            {
                if (!reasons.TryGetValue(id, out bool blocked))
                {
                    errors.Add(new Error(GlErrorCodes.ReasonCodeNotFound, "The reason code does not exist in this company."));
                }
                else if (blocked)
                {
                    errors.Add(new Error(GlErrorCodes.ReasonCodeBlocked, "The reason code is blocked."));
                }
            }
        }

        return new FactsCheck(errors, accounts.ToDictionary(a => a.Key, a => a.Value.No));
    }

    private async Task AllocateNumbersAsync(PostingWriteContext context, CancellationToken cancellationToken)
    {
        PostingDocument document = context.Document;
        await using NpgsqlBatch batch = session.CreateBatch();
        string nextDocumentNo = GeneralLedgerSql.Load(FolderNamespace, "next_document_no");
        string nextEntryNo = GeneralLedgerSql.Load(FolderNamespace, "next_entry_no");

        // (1) legal numbers in voucher order (BR-PST-27), (2) register, transactions, entries in a fixed order (BR-PST-28)
        foreach (PostingVoucher voucher in document.Vouchers)
        {
            if (voucher.Numbering is FromSeriesNumbering series)
            {
                NpgsqlBatchCommand command = new(nextDocumentNo);
                command.Parameters.AddWithValue("series_code", series.SeriesCode);
                command.Parameters.AddWithValue("posting_date", voucher.PostingDate);
                batch.BatchCommands.Add(command);
            }
        }

        foreach ((string ledger, int count) in new[]
                 {
                     (LedgerCodes.GlRegister, 1),
                     (LedgerCodes.GlTransaction, document.Vouchers.Count),
                     (LedgerCodes.GlEntry, document.Vouchers.Sum(v => v.GlLines.Count)),
                 })
        {
            NpgsqlBatchCommand command = new(nextEntryNo);
            command.Parameters.AddWithValue("ledger", ledger);
            command.Parameters.AddWithValue("count", count);
            batch.BatchCommands.Add(command);
        }

        Queue<string> documentNos = new();
        long[] firstNumbers = new long[3];
        await using (NpgsqlDataReader reader = await batch.ExecuteReaderAsync(cancellationToken))
        {
            int seriesCount = document.Vouchers.Count(v => v.Numbering is FromSeriesNumbering);
            for (int i = 0; i < seriesCount + 3; i++)
            {
                if (i > 0)
                {
                    await reader.NextResultAsync(cancellationToken);
                }

                await reader.ReadAsync(cancellationToken);
                if (i < seriesCount)
                {
                    documentNos.Enqueue(reader.GetString(0));
                }
                else
                {
                    firstNumbers[i - seriesCount] = reader.GetInt64(0);
                }
            }
        }

        context.SetRegister(firstNumbers[0]);
        long transactionNo = firstNumbers[1];
        long entryNo = firstNumbers[2];
        foreach (PostingVoucher voucher in document.Vouchers)
        {
            string documentNo = voucher.Numbering switch
            {
                FromSeriesNumbering => documentNos.Dequeue(),
                ExistingNumbering existing => existing.DocumentNo,
                _ => throw new InvalidOperationException("Unknown voucher numbering."),
            };
            context.SetVoucher(voucher.Key, transactionNo++, documentNo);
            foreach (GlPostingLine line in voucher.GlLines)
            {
                context.SetEntry(line.Key, entryNo++);
            }
        }

        context.RecordRange(LedgerCodes.GlEntry, firstNumbers[2], entryNo - 1);
    }

    private async Task InsertTransactionsAsync(PostingWriteContext context, CancellationToken cancellationToken)
    {
        IReadOnlyList<PostingVoucher> vouchers = context.Document.Vouchers;
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "insert_gl_transactions"));
        NpgsqlParameterCollection p = command.Parameters;
        p.AddWithValue("tenant_id", context.TenantId);
        p.AddWithValue("company_id", context.CompanyId);
        p.AddWithValue("register_no", context.RegisterNo);
        p.AddWithValue("transaction_nos", vouchers.Select(v => context.TransactionNoOf(v.Key)).ToArray());
        p.AddWithValue("posting_dates", vouchers.Select(v => v.PostingDate).ToArray());
        p.AddWithValue("is_closing", vouchers.Select(v => v.IsClosing).ToArray());
        p.AddWithValue("document_types", vouchers.Select(v => v.DocumentType).ToArray());
        p.AddWithValue("document_nos", vouchers.Select(v => context.DocumentNoOf(v.Key)).ToArray());
        p.AddWithValue("source_codes", vouchers.Select(v => context.SourceCodeOf(v.Key)).ToArray());
        p.AddWithValue("reason_code_ids", vouchers.Select(v => v.ReasonCodeId).ToArray());
        p.AddWithValue("descriptions", vouchers.Select(v => Truncate(v.Description)).ToArray());
        p.AddWithValue("reverses_transaction_nos", vouchers.Select(v => v.ReversesTransactionNo).ToArray());
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task InsertEntriesAsync(PostingWriteContext context, CancellationToken cancellationToken)
    {
        (PostingVoucher Voucher, GlPostingLine Line)[] entries = [.. context.Document.Vouchers.SelectMany(v => v.GlLines.Select(l => (v, l)))];
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "insert_gl_entries"));
        NpgsqlParameterCollection p = command.Parameters;
        p.AddWithValue("tenant_id", context.TenantId);
        p.AddWithValue("company_id", context.CompanyId);
        p.AddWithValue("register_no", context.RegisterNo);
        p.AddWithValue("journal_template_code", NpgsqlTypes.NpgsqlDbType.Text, (object?)context.Document.Run.JournalTemplateCode ?? DBNull.Value);
        p.AddWithValue("journal_batch_code", NpgsqlTypes.NpgsqlDbType.Text, (object?)context.Document.Run.JournalBatchCode ?? DBNull.Value);
        p.AddWithValue("entry_nos", entries.Select(e => context.EntryNoOf(e.Line.Key)).ToArray());
        p.AddWithValue("transaction_nos", entries.Select(e => context.TransactionNoOf(e.Voucher.Key)).ToArray());
        p.AddWithValue("gl_account_ids", entries.Select(e => e.Line.GlAccountId).ToArray());
        p.AddWithValue("posting_dates", entries.Select(e => e.Voucher.PostingDate).ToArray());
        p.AddWithValue("is_closing", entries.Select(e => e.Voucher.IsClosing).ToArray());
        p.AddWithValue("document_types", entries.Select(e => e.Voucher.DocumentType).ToArray());
        p.AddWithValue("document_nos", entries.Select(e => context.DocumentNoOf(e.Voucher.Key)).ToArray());
        p.AddWithValue("document_dates", entries.Select(e => e.Voucher.DocumentDate).ToArray());
        p.AddWithValue("external_document_nos", entries.Select(e => e.Line.ExternalDocumentNo).ToArray());
        p.AddWithValue("descriptions", entries.Select(e => Truncate(e.Line.Description ?? e.Voucher.Description)).ToArray());
        p.AddWithValue("amounts", entries.Select(e => e.Line.Amount).ToArray());
        p.AddWithValue("vat_amounts", entries.Select(e => e.Line.VatAmount).ToArray());
        p.AddWithValue("gen_posting_types", entries.Select(e => e.Line.GenPostingType).ToArray());
        p.AddWithValue("gen_bus_groups", entries.Select(e => e.Line.Groups?.GenBus).ToArray());
        p.AddWithValue("gen_prod_groups", entries.Select(e => e.Line.Groups?.GenProd).ToArray());
        p.AddWithValue("vat_bus_groups", entries.Select(e => e.Line.Groups?.VatBus).ToArray());
        p.AddWithValue("vat_prod_groups", entries.Select(e => e.Line.Groups?.VatProd).ToArray());
        p.AddWithValue("vat_dates", entries.Select(e => e.Line.VatDate).ToArray());
        p.AddWithValue("bal_account_ids", entries.Select(e => e.Line.BalGlAccountId).ToArray());
        p.AddWithValue("dimension_set_ids", entries.Select(e => e.Line.DimensionSetId).ToArray());
        p.AddWithValue("source_codes", entries.Select(e => context.SourceCodeOf(e.Voucher.Key)).ToArray());
        p.AddWithValue("reason_code_ids", entries.Select(e => e.Voucher.ReasonCodeId).ToArray());
        p.AddWithValue("system_created", entries.Select(e => e.Line.Origin != LineOrigin.UserEntered).ToArray());
        p.AddWithValue("reversed_entry_nos", entries.Select(e => e.Line.ReversedEntryNo).ToArray());
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<LedgerRowView>> ApplyReversalAsync(PostingWriteContext context, CancellationToken cancellationToken)
    {
        Dictionary<long, long> transactionMap = context.Document.Vouchers
            .Where(v => v.ReversesTransactionNo is not null)
            .ToDictionary(v => v.ReversesTransactionNo!.Value, v => context.TransactionNoOf(v.Key));
        Dictionary<long, long> entryMap = context.Document.Vouchers
            .SelectMany(v => v.GlLines)
            .Where(l => l.ReversedEntryNo is not null)
            .ToDictionary(l => l.ReversedEntryNo!.Value, l => context.EntryNoOf(l.Key));

        await using (NpgsqlCommand entries = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "flag_reversed_gl_entries")))
        {
            entries.Parameters.AddWithValue("orig_entry_nos", entryMap.Keys.ToArray());
            entries.Parameters.AddWithValue("new_entry_nos", entryMap.Values.ToArray());
            await entries.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (NpgsqlCommand transactions = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "flag_reversed_transactions")))
        {
            transactions.Parameters.AddWithValue("orig_transaction_nos", transactionMap.Keys.ToArray());
            transactions.Parameters.AddWithValue("new_transaction_nos", transactionMap.Values.ToArray());
            await transactions.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (NpgsqlCommand registers = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "flag_reversed_registers")))
        {
            registers.Parameters.AddWithValue("company_id", context.CompanyId);
            registers.Parameters.AddWithValue("orig_transaction_nos", transactionMap.Keys.ToArray());
            await registers.ExecuteNonQueryAsync(cancellationToken);
        }

        ReversalPlan plan = new(transactionMap, entryMap, context.RegisterNo);
        List<LedgerRowView> rows = [];
        foreach (IReversibleLedger ledger in reversibleLedgers.OrderBy(l => l.Order))
        {
            rows.AddRange(await ledger.ReverseAsync(context, plan, cancellationToken));
        }

        return rows;
    }

    private async Task InsertRegisterAsync(PostingWriteContext context, CancellationToken cancellationToken)
    {
        (long From, long To) entries = context.RangeOf(LedgerCodes.GlEntry)!.Value;
        (long From, long To)? vat = context.RangeOf(LedgerCodes.VatEntry);
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "insert_gl_register"));
        NpgsqlParameterCollection p = command.Parameters;
        p.AddWithValue("tenant_id", context.TenantId);
        p.AddWithValue("company_id", context.CompanyId);
        p.AddWithValue("register_no", context.RegisterNo);
        p.AddWithValue("from_entry_no", entries.From);
        p.AddWithValue("to_entry_no", entries.To);
        p.AddWithValue("from_vat_entry_no", NpgsqlTypes.NpgsqlDbType.Bigint, (object?)vat?.From ?? DBNull.Value);
        p.AddWithValue("to_vat_entry_no", NpgsqlTypes.NpgsqlDbType.Bigint, (object?)vat?.To ?? DBNull.Value);
        p.AddWithValue("source_code", context.Document.Run.SourceCode);
        p.AddWithValue("journal_template_code", NpgsqlTypes.NpgsqlDbType.Text, (object?)context.Document.Run.JournalTemplateCode ?? DBNull.Value);
        p.AddWithValue("journal_batch_code", NpgsqlTypes.NpgsqlDbType.Text, (object?)context.Document.Run.JournalBatchCode ?? DBNull.Value);
        p.AddWithValue("request_id", session.Scope.RequestId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task ExecuteAsync(string sqlName, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, sqlName));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static PostingResult BuildResult(
        PostingWriteContext context, IReadOnlyDictionary<Guid, string> accountNos, IReadOnlyList<LedgerRowView> rows, PostingMode mode)
    {
        PostedVoucher[] vouchers = [.. context.Document.Vouchers.Select(v => new PostedVoucher(
            v.Key, v.DraftDocumentNo, context.DocumentNoOf(v.Key), v.PostingDate, context.TransactionNoOf(v.Key)))];
        PostedGlEntry[] entries = [.. context.Document.Vouchers.SelectMany(v => v.GlLines.Select(l => new PostedGlEntry(
            context.EntryNoOf(l.Key),
            context.TransactionNoOf(v.Key),
            v.Key,
            l.Key,
            l.GlAccountId,
            accountNos.GetValueOrDefault(l.GlAccountId, l.GlAccountId.ToString()),
            l.Amount,
            l.VatAmount)))];
        return new PostingResult(mode == PostingMode.Post, mode == PostingMode.Preview, context.RegisterNo, vouchers, entries, rows);
    }

    [LoggerMessage(EventId = 5001, Level = LogLevel.Information,
        Message = "Posted {PostingType}: register {RegisterNo}, {VoucherCount} voucher(s), {EntryCount} G/L entries, lock wait {LockWaitMs} ms")]
    private partial void LogPosted(string postingType, long registerNo, int voucherCount, int entryCount, int lockWaitMs);

    [LoggerMessage(EventId = 5002, Level = LogLevel.Warning, Message = "Posting rejected by a database guard: SQLSTATE {SqlState} -> {ErrorCode}")]
    private partial void LogRejectedByDatabase(string sqlState, string errorCode);
}
