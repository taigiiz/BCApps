using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Contracts.Posting;
using Npgsql;

namespace Erp.GeneralLedger.Infrastructure.Posting;

/// <summary>Numbers allocated for one run and the counter ranges reserved by writers (05-posting-engine.md §5.5).</summary>
internal sealed class PostingWriteContext : IPostingWriteContext
{
    private readonly ITenantSession _session;
    private readonly Dictionary<string, PostingVoucher> _voucherByLineKey = new(StringComparer.Ordinal);
    private readonly Dictionary<string, PostingVoucher> _voucherByKey = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _transactionNos = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _documentNos = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _entryNos = new(StringComparer.Ordinal);
    private readonly Dictionary<string, (long From, long To)> _ranges = new(StringComparer.Ordinal);

    public PostingWriteContext(ITenantSession session, PostingDocument document, PostingMode mode)
    {
        _session = session;
        Document = document;
        Mode = mode;
        foreach (PostingVoucher voucher in document.Vouchers)
        {
            _voucherByKey.Add(voucher.Key, voucher);
            foreach (GlPostingLine line in voucher.GlLines)
            {
                _voucherByLineKey.Add(line.Key, voucher);
            }
        }
    }

    public Guid TenantId => _session.Scope.TenantId;

    public Guid CompanyId => _session.Scope.CompanyId;

    public PostingMode Mode { get; }

    public PostingDocument Document { get; }

    public long RegisterNo { get; private set; }

    public IReadOnlyDictionary<string, (long From, long To)> Ranges => _ranges;

    public PostingVoucher VoucherOf(string glLineKey) =>
        _voucherByLineKey.TryGetValue(glLineKey, out PostingVoucher? voucher)
            ? voucher
            : throw new InvalidOperationException($"Unknown G/L line key '{glLineKey}'.");

    public long TransactionNoOf(string voucherKey) => _transactionNos[voucherKey];

    public string DocumentNoOf(string voucherKey) => _documentNos[voucherKey];

    public long EntryNoOf(string glLineKey) => _entryNos[glLineKey];

    public string SourceCodeOf(string voucherKey) => _voucherByKey[voucherKey].SourceCode ?? Document.Run.SourceCode;

    public async Task<long> ReserveEntryNumbersAsync(string ledger, int count, CancellationToken cancellationToken)
    {
        if (count < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(count), count, "Reserve at least one number.");
        }

        if (_ranges.ContainsKey(ledger))
        {
            // One contiguous block per ledger and run keeps the register ranges exact (05-posting-engine.md §5.5).
            throw new InvalidOperationException($"Ledger {ledger} was already reserved in this run.");
        }

        await using NpgsqlCommand command = _session.CreateCommand(GeneralLedgerSql.Load(PostingEngine.FolderNamespace, "next_entry_no"));
        command.Parameters.AddWithValue("ledger", ledger);
        command.Parameters.AddWithValue("count", count);
        long first = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
        RecordRange(ledger, first, first + count - 1);
        return first;
    }

    internal void SetRegister(long registerNo) => RegisterNo = registerNo;

    internal void SetVoucher(string voucherKey, long transactionNo, string documentNo)
    {
        _transactionNos.Add(voucherKey, transactionNo);
        _documentNos.Add(voucherKey, documentNo);
    }

    internal void SetEntry(string glLineKey, long entryNo) => _entryNos.Add(glLineKey, entryNo);

    internal void RecordRange(string ledger, long from, long to) => _ranges.Add(ledger, (from, to));

    internal (long From, long To)? RangeOf(string ledger) => _ranges.TryGetValue(ledger, out (long From, long To) range) ? range : null;
}
