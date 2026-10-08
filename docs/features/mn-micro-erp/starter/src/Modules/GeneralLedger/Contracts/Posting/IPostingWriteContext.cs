namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>What a subledger writer may use while the engine posts (numbers already allocated under the lock).</summary>
public interface IPostingWriteContext
{
    /// <summary>Tenant of the session.</summary>
    Guid TenantId { get; }

    /// <summary>Company of the session.</summary>
    Guid CompanyId { get; }

    /// <summary>Post or preview.</summary>
    PostingMode Mode { get; }

    /// <summary>The run being posted.</summary>
    PostingDocument Document { get; }

    /// <summary>G/L register number of the run.</summary>
    long RegisterNo { get; }

    /// <summary>Voucher that owns the G/L line <paramref name="glLineKey"/>.</summary>
    PostingVoucher VoucherOf(string glLineKey);

    /// <summary>Transaction number allocated to a voucher.</summary>
    long TransactionNoOf(string voucherKey);

    /// <summary>Legal document number allocated to a voucher.</summary>
    string DocumentNoOf(string voucherKey);

    /// <summary>G/L entry number allocated to a G/L line.</summary>
    long EntryNoOf(string glLineKey);

    /// <summary>Source code of a voucher (voucher override or run).</summary>
    string SourceCodeOf(string voucherKey);

    /// <summary>
    /// Reserves <paramref name="count"/> consecutive numbers of <paramref name="ledger"/> (<c>platform.fn_next_entry_no</c>) once per run;
    /// the range is recorded for the register (e.g. from/to VAT entry no.). Returns the first number.
    /// </summary>
    Task<long> ReserveEntryNumbersAsync(string ledger, int count, CancellationToken cancellationToken);
}
