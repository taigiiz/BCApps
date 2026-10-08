using System.Globalization;
using Erp.BuildingBlocks.Application.Persistence;
using Erp.BuildingBlocks.Domain.Monetary;
using Erp.BuildingBlocks.Domain.Results;
using Erp.GeneralLedger.Application.Ports;
using Erp.GeneralLedger.Contracts.Journals;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.GeneralLedger.Domain;
using Erp.GeneralLedger.Domain.Posting;

namespace Erp.GeneralLedger.Application.Journals;

/// <summary>
/// Phase A of journal posting (05-posting-engine.md §5.4.1): line checks (BC CU11), vouchers = (document no., posting date) in
/// BR-PST-27 order, line balance, side expansion (VAT through Tax's <see cref="IJournalVatHandler"/>), then the engine.
/// Every business error is returned together; the session is marked rollback-only so no number is consumed.
/// </summary>
internal sealed class PostJournalHandler(
    IJournalSetupReader setupReader,
    IGlAccountDirectory accountDirectory,
    IJournalVatHandler vatHandler,
    IPostingService postingService,
    ITransactionalSession session)
{
    public async Task<Result<PostingResult>> HandleAsync(PostJournalCommand command, PostingMode mode, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        Result<PostingResult> result = await BuildAndPostAsync(command, mode, cancellationToken);
        if (result.IsFailure)
        {
            session.MarkRollbackOnly();
        }

        return result;
    }

    private static string LineTarget(int index, string member) => string.Create(CultureInfo.InvariantCulture, $"/lines/{index}/{member}");

    private static IEnumerable<Error> CheckLine(JournalLineInput line, int index, decimal precision)
    {
        if (string.IsNullOrWhiteSpace(line.DocumentNo))
        {
            yield return new Error(GlErrorCodes.DocumentNoRequired, "The document number is required.") { Target = LineTarget(index, "documentNo") };
        }

        if (string.IsNullOrWhiteSpace(line.AccountNo))
        {
            yield return new Error(GlErrorCodes.AccountNotFound, "The account is required.") { Target = LineTarget(index, "account") };
        }

        if (line.Amount == 0m)
        {
            yield return new Error(GlErrorCodes.LineAmountZero, "The amount must not be zero.") { Target = LineTarget(index, "amount") };
        }
        else if (!MoneyMath.IsRounded(line.Amount, precision))
        {
            yield return new Error(GlErrorCodes.AmountNotRounded, "The amount is not rounded to the company precision.")
            {
                Target = LineTarget(index, "amount"),
                Details = new Dictionary<string, string>(StringComparer.Ordinal) { ["precision"] = precision.ToString(CultureInfo.InvariantCulture) },
            };
        }

        bool vatTyped = line.GenPostingType is "SALE" or "PURCHASE";
        if (line.HasVat && (!vatTyped || line.VatBusPostingGroup is null || line.VatProdPostingGroup is null))
        {
            yield return new Error(GlErrorCodes.GenPostingTypeRequired, "VAT posting groups need gen. posting type SALE or PURCHASE and both VAT groups.")
            {
                Target = LineTarget(index, "genPostingType"),
            };
        }
        else if (!line.HasVat && line.GenPostingType != "NONE")
        {
            yield return new Error(GlErrorCodes.GenPostingTypeRequired, "A gen. posting type needs VAT posting groups.") { Target = LineTarget(index, "vatProdPostingGroup") };
        }
    }

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private async Task<Result<PostingResult>> BuildAndPostAsync(PostJournalCommand command, PostingMode mode, CancellationToken cancellationToken)
    {
        if (command.Lines.Count == 0)
        {
            return Result.Failure<PostingResult>(new Error(GlErrorCodes.JournalEmpty, "The journal has no lines."));
        }

        JournalSetup? setup = await setupReader.GetAsync(command.TemplateCode, command.BatchCode, cancellationToken);
        if (setup is null)
        {
            return Result.Failure<PostingResult>(new Error(
                GlErrorCodes.JournalTemplateNotFound,
                $"Journal template {command.TemplateCode} / batch {command.BatchCode} does not exist."));
        }

        List<Error> errors = [];
        if (setup.PostingSeriesCode is null)
        {
            errors.Add(new Error(GlErrorCodes.JournalSeriesMissing, $"Journal {setup.TemplateCode}/{setup.BatchCode} has no posting number series."));
        }

        List<(JournalLineInput Line, int Index, int LineNo)> lines = [.. command.Lines.Select((l, i) => (l, i, l.LineNo ?? ((i + 1) * 10000)))];
        foreach ((JournalLineInput line, int index, _) in lines)
        {
            errors.AddRange(CheckLine(line, index, setup.AmountPrecision));
        }

        string[] accountNos = [.. lines.SelectMany(l => new[] { l.Line.AccountNo, l.Line.BalAccountNo })
            .OfType<string>().Where(n => !string.IsNullOrWhiteSpace(n)).Distinct(StringComparer.Ordinal)];
        IReadOnlyDictionary<string, Guid> accounts = await accountDirectory.ResolveAsync(accountNos, cancellationToken);
        foreach ((JournalLineInput line, int index, _) in lines)
        {
            if (!string.IsNullOrWhiteSpace(line.AccountNo) && !accounts.ContainsKey(line.AccountNo))
            {
                errors.Add(new Error(GlErrorCodes.AccountNotFound, $"G/L account {line.AccountNo} does not exist.") { Target = LineTarget(index, "account") });
            }

            if (NullIfBlank(line.BalAccountNo) is { } bal && !accounts.ContainsKey(bal))
            {
                errors.Add(new Error(GlErrorCodes.AccountNotFound, $"G/L account {bal} does not exist.") { Target = LineTarget(index, "balAccount") });
            }
        }

        if (errors.Count > 0)
        {
            return Result.Failure<PostingResult>(errors);
        }

        // Voucher = (document no., posting date); order: date, document no. (ordinal), first line no. (BR-PST-21, BR-PST-27)
        var groups = lines
            .GroupBy(l => (l.Line.DocumentNo, l.Line.PostingDate))
            .OrderBy(g => g.Key.PostingDate)
            .ThenBy(g => g.Key.DocumentNo, StringComparer.Ordinal)
            .ThenBy(g => g.Min(l => l.LineNo))
            .ToList();

        List<PostingVoucher> vouchers = [];
        int voucherIndex = 0;
        foreach (var group in groups)
        {
            string key = string.Create(CultureInfo.InvariantCulture, $"V{++voucherIndex}");
            errors.AddRange(CheckLineBalance(group.Key.DocumentNo, [.. group.Select(g => g.Line)]));
            List<GlPostingLine> glLines = [];
            List<ISubledgerLine> subledger = [];
            foreach ((JournalLineInput line, _, int lineNo) in group.OrderBy(g => g.LineNo))
            {
                string prefix = string.Create(CultureInfo.InvariantCulture, $"{key}/L{lineNo}");
                Guid account = accounts[line.AccountNo];
                Guid? balAccount = NullIfBlank(line.BalAccountNo) is { } bal ? accounts[bal] : null;
                if (line.HasVat)
                {
                    Result<JournalVatExpansion> expanded = await vatHandler.ExpandAsync(
                        new JournalVatSide(
                            prefix + "/A",
                            account,
                            line.Amount,
                            line.GenPostingType,
                            line.GenBusPostingGroup,
                            line.GenProdPostingGroup,
                            line.VatBusPostingGroup!,
                            line.VatProdPostingGroup!,
                            line.VatDate ?? line.PostingDate,
                            line.Description,
                            line.SupplierEbarimtId),
                        cancellationToken);
                    if (expanded.IsFailure)
                    {
                        errors.AddRange(expanded.Errors);
                        continue;
                    }

                    glLines.AddRange(expanded.Value.GlLines.Select(g => g with { BalGlAccountId = balAccount, ExternalDocumentNo = line.ExternalDocumentNo }));
                    subledger.AddRange(expanded.Value.SubledgerLines);
                }
                else
                {
                    glLines.Add(SideLine(prefix + "/A/BASE", account, line.Amount, balAccount, line));
                }

                if (balAccount is { } balId)
                {
                    glLines.Add(SideLine(prefix + "/B/BASE", balId, -line.Amount, account, line));
                }
            }

            JournalLineInput first = group.OrderBy(g => g.LineNo).First().Line;
            string[] documentTypes = [.. group.Select(g => g.Line.DocumentType).Distinct(StringComparer.Ordinal)];
            vouchers.Add(new PostingVoucher
            {
                Key = key,
                Numbering = new FromSeriesNumbering(setup.PostingSeriesCode!),
                DocumentType = documentTypes.Length == 1 ? documentTypes[0] : "NONE",
                PostingDate = group.Key.PostingDate,
                DocumentDate = first.DocumentDate,
                Description = group.Select(g => g.Line.Description).FirstOrDefault(d => !string.IsNullOrWhiteSpace(d)),
                DraftDocumentNo = group.Key.DocumentNo,
                GlLines = glLines,
                SubledgerLines = subledger,
            });
        }

        if (errors.Count > 0)
        {
            return Result.Failure<PostingResult>(errors);
        }

        PostingDocument document = new()
        {
            Run = new PostingRun(
                setup.SourceCode,
                setup.TemplateType == "OPENING" ? "OPENING_BALANCE" : "GENERAL_JOURNAL",
                new SourceRef("gl.journal_batch", setup.BatchId, setup.BatchCode),
                setup.TemplateCode,
                setup.BatchCode),
            Vouchers = vouchers,
        };

        IReadOnlyList<Error> validation = await postingService.ValidateAsync(document, cancellationToken);
        if (validation.Count > 0)
        {
            return Result.Failure<PostingResult>(validation);
        }

        return await postingService.PostAsync(document, mode, cancellationToken);
    }

    private static GlPostingLine SideLine(string key, Guid accountId, decimal amount, Guid? otherSide, JournalLineInput line) => new()
    {
        Key = key,
        GlAccountId = accountId,
        Amount = amount,
        Origin = LineOrigin.UserEntered,
        BalGlAccountId = otherSide,
        Description = line.Description,
        ExternalDocumentNo = line.ExternalDocumentNo,
    };

    // BR-PST-22(a): a line with both sides balances itself; one-sided lines must net to zero per voucher (R-GL-POSTING-11).
    private static List<Error> CheckLineBalance(string documentNo, IReadOnlyList<JournalLineInput> lines)
    {
        VoucherLine[] balances =
        [
            .. lines.Select((l, i) => new VoucherLine(
                string.Create(CultureInfo.InvariantCulture, $"{documentNo}#{i}"),
                string.IsNullOrWhiteSpace(l.BalAccountNo) ? l.Amount : 0m)),
        ];
        return [.. VoucherBalanceRule.Check(documentNo, balances, MoneyMath.LcyPrecision).Where(e => e.Code == GlErrorCodes.VoucherUnbalanced)];
    }
}
