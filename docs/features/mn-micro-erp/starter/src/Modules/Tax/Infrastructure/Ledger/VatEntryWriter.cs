using System.Globalization;
using Erp.BuildingBlocks.Domain.Results;
using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.GeneralLedger.Contracts.Reversal;
using Erp.Tax.Contracts;
using Erp.Tax.Domain;
using Npgsql;

namespace Erp.Tax.Infrastructure.Ledger;

/// <summary>
/// VAT ledger writer (BC T254) of the posting engine and its reversal mirror. This class and its SQL are the only code that inserts
/// <c>tax.vat_entry</c> (architecture rule 5); originals are flagged through <c>platform.fn_ledger_update</c> only (D-C4).
/// </summary>
internal sealed class VatEntryWriter(ITenantSession session) : ILedgerWriter, IReversibleLedger
{
    private const string FolderNamespace = "Erp.Tax.Infrastructure.Ledger";

    public string Ledger => LedgerCodes.VatEntry;

    public int Order => 10;

    public async Task<IReadOnlyList<Error>> ValidateLockedAsync(
        IPostingWriteContext context, IReadOnlyList<ISubledgerLine> lines, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(lines);
        DateOnly[] vatDates = [.. lines.Cast<VatLedgerLine>().Select(l => l.VatDate).Distinct().Order()];
        await using NpgsqlCommand command = session.CreateCommand(TaxSql.Load(FolderNamespace, "read_vat_period_status"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("vat_dates", vatDates);
        List<Error> errors = [];
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            string? status = reader.GetStringOrNull(1);
            if (status is not null && status != "OPEN")
            {
                string date = reader.GetDateOnly(0).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                errors.Add(new Error(TaxErrorCodes.VatPeriodClosed, $"The VAT period of {date} is {status}.")
                {
                    Details = new Dictionary<string, string>(StringComparer.Ordinal) { ["vatDate"] = date },
                });
            }
        }

        return errors;
    }

    public async Task<IReadOnlyList<LedgerRowView>> WriteAsync(
        IPostingWriteContext context, IReadOnlyList<ISubledgerLine> lines, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(lines);
        VatLedgerLine[] vat = [.. lines.Cast<VatLedgerLine>()];
        if (vat.Length == 0)
        {
            return [];
        }

        long first = await context.ReserveEntryNumbersAsync(LedgerCodes.VatEntry, vat.Length, cancellationToken);
        long[] entryNos = [.. vat.Select((_, i) => first + i)];
        PostingVoucher[] vouchers = [.. vat.Select(v => context.VoucherOf(v.GlLineKeys[0]))];

        await using NpgsqlCommand command = session.CreateCommand(TaxSql.Load(FolderNamespace, "insert_vat_entries"));
        NpgsqlParameterCollection p = command.Parameters;
        p.AddWithValue("tenant_id", context.TenantId);
        p.AddWithValue("company_id", context.CompanyId);
        p.AddWithValue("register_no", context.RegisterNo);
        p.AddWithValue("entry_nos", entryNos);
        p.AddWithValue("entry_types", vat.Select(v => v.EntryType).ToArray());
        p.AddWithValue("posting_dates", vouchers.Select(v => v.PostingDate).ToArray());
        p.AddWithValue("vat_dates", vat.Select(v => v.VatDate).ToArray());
        p.AddWithValue("document_types", vouchers.Select(v => v.DocumentType).ToArray());
        p.AddWithValue("document_nos", vouchers.Select(v => context.DocumentNoOf(v.Key)).ToArray());
        p.AddWithValue("bases", vat.Select(v => v.Base).ToArray());
        p.AddWithValue("amounts", vat.Select(v => v.Amount).ToArray());
        p.AddWithValue("calculation_types", vat.Select(v => v.CalculationType).ToArray());
        p.AddWithValue("vat_percents", vat.Select(v => v.VatPercent).ToArray());
        p.AddWithValue("vat_identifiers", vat.Select(v => v.VatIdentifier).ToArray());
        p.AddWithValue("vat_categories", vat.Select(v => v.VatCategory).ToArray());
        p.AddWithValue("vat_bus_groups", vat.Select(v => v.VatBusPostingGroup).ToArray());
        p.AddWithValue("vat_prod_groups", vat.Select(v => v.VatProdPostingGroup).ToArray());
        p.AddWithValue("gen_bus_groups", vat.Select(v => v.GenBusPostingGroup).ToArray());
        p.AddWithValue("gen_prod_groups", vat.Select(v => v.GenProdPostingGroup).ToArray());
        p.AddWithValue("ebarimt_tax_types", vat.Select(v => v.EbarimtTaxType).ToArray());
        p.AddWithValue("transaction_nos", vouchers.Select(v => context.TransactionNoOf(v.Key)).ToArray());
        p.AddWithValue("gl_entry_nos", vat.Select(v => context.EntryNoOf(v.GlLineKeys[0])).ToArray());
        p.AddWithValue("source_codes", vouchers.Select(v => context.SourceCodeOf(v.Key)).ToArray());
        p.AddWithValue("reason_code_ids", vouchers.Select(v => v.ReasonCodeId).ToArray());
        p.AddWithValue("supplier_ebarimt_ids", vat.Select(v => v.SupplierEbarimtId).ToArray());
        await command.ExecuteNonQueryAsync(cancellationToken);

        return [.. vat.Select((v, i) => new LedgerRowView(LedgerCodes.VatEntry, entryNos[i], v.GlLineKeys[0], Describe(v.EntryType, v.Base, v.Amount, v.VatPercent)))];
    }

    public async Task<IReadOnlyList<Error>> ValidateReversalAsync(IReadOnlyList<long> transactionNos, CancellationToken cancellationToken)
    {
        List<Error> errors = [];
        foreach (OriginalVatEntry entry in await ReadOriginalsAsync(transactionNos, cancellationToken))
        {
            Dictionary<string, string> details = new(StringComparer.Ordinal)
            {
                ["vatEntryNo"] = entry.EntryNo.ToString(CultureInfo.InvariantCulture),
                ["transactionNo"] = entry.TransactionNo.ToString(CultureInfo.InvariantCulture),
            };
            if (entry.Closed)
            {
                errors.Add(new Error(TaxErrorCodes.ReversalVatSettled, $"VAT entry {details["vatEntryNo"]} is already settled.") { Details = details });
            }
            else if (entry.VatPeriodStatus is not null and not "OPEN")
            {
                errors.Add(new Error(TaxErrorCodes.VatPeriodClosed, $"The VAT period of VAT entry {details["vatEntryNo"]} is {entry.VatPeriodStatus}.") { Details = details });
            }
        }

        return errors;
    }

    public async Task<IReadOnlyList<LedgerRowView>> ReverseAsync(IPostingWriteContext context, ReversalPlan plan, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(plan);
        IReadOnlyList<OriginalVatEntry> originals = await ReadOriginalsAsync([.. plan.TransactionMap.Keys], cancellationToken);
        if (originals.Count == 0)
        {
            return [];
        }

        long first = await context.ReserveEntryNumbersAsync(LedgerCodes.VatEntry, originals.Count, cancellationToken);
        long[] origNos = [.. originals.Select(o => o.EntryNo)];
        long[] newNos = [.. originals.Select((_, i) => first + i)];
        long?[] newGlEntryNos = [.. originals.Select(o => o.GlEntryNo is long g && plan.GlEntryMap.TryGetValue(g, out long n) ? n : (long?)null)];
        Guid? reasonCodeId = context.Document.Vouchers.Select(v => v.ReasonCodeId).FirstOrDefault(r => r is not null);

        await using (NpgsqlCommand insert = session.CreateCommand(TaxSql.Load(FolderNamespace, "insert_vat_reversal_entries")))
        {
            insert.Parameters.AddWithValue("tenant_id", context.TenantId);
            insert.Parameters.AddWithValue("company_id", context.CompanyId);
            insert.Parameters.AddWithValue("register_no", plan.RegisterNo);
            insert.Parameters.AddWithValue("reason_code_id", NpgsqlTypes.NpgsqlDbType.Uuid, (object?)reasonCodeId ?? DBNull.Value);
            insert.Parameters.AddWithValue("orig_entry_nos", origNos);
            insert.Parameters.AddWithValue("new_entry_nos", newNos);
            insert.Parameters.AddWithValue("new_transaction_nos", originals.Select(o => plan.TransactionMap[o.TransactionNo]).ToArray());
            insert.Parameters.AddWithValue("new_gl_entry_nos", newGlEntryNos);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (NpgsqlCommand flag = session.CreateCommand(TaxSql.Load(FolderNamespace, "flag_reversed_vat_entries")))
        {
            flag.Parameters.AddWithValue("orig_entry_nos", origNos);
            flag.Parameters.AddWithValue("new_entry_nos", newNos);
            await flag.ExecuteNonQueryAsync(cancellationToken);
        }

        return [.. originals.Select((o, i) => new LedgerRowView(
            LedgerCodes.VatEntry,
            newNos[i],
            "REVERSAL/E" + o.EntryNo.ToString(CultureInfo.InvariantCulture),
            new Dictionary<string, string>(StringComparer.Ordinal) { ["reversedEntryNo"] = o.EntryNo.ToString(CultureInfo.InvariantCulture) }))];
    }

    private static Dictionary<string, string> Describe(string entryType, decimal vatBase, decimal amount, decimal percent) => new(StringComparer.Ordinal)
    {
        ["entryType"] = entryType,
        ["base"] = vatBase.ToString(CultureInfo.InvariantCulture),
        ["amount"] = amount.ToString(CultureInfo.InvariantCulture),
        ["vatPercent"] = percent.ToString(CultureInfo.InvariantCulture),
    };

    private async Task<IReadOnlyList<OriginalVatEntry>> ReadOriginalsAsync(IReadOnlyList<long> transactionNos, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = session.CreateCommand(TaxSql.Load(FolderNamespace, "read_vat_entries_for_reversal"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("transaction_nos", transactionNos.ToArray());
        List<OriginalVatEntry> rows = [];
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new OriginalVatEntry(
                reader.GetInt64(0),
                reader.GetInt64(1),
                reader.GetInt64OrNull(2),
                reader.GetBoolean(3),
                reader.GetStringOrNull(5)));
        }

        return rows;
    }
}
