using Erp.BuildingBlocks.Domain.Results;

namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>
/// Writes one subledger inside the posting transaction (05-posting-engine.md §5.8). INSERTs into a ledger table live ONLY in the
/// owning module's writer (architecture rule 5); the engine calls writers by <see cref="Order"/>.
/// </summary>
public interface ILedgerWriter
{
    /// <summary>The <see cref="LedgerCodes"/> value handled.</summary>
    string Ledger { get; }

    /// <summary>Write order (10 VAT, 20 customer, 30 vendor, 40 bank …).</summary>
    int Order { get; }

    /// <summary>Checks under the posting lock (e.g. VAT period open).</summary>
    Task<IReadOnlyList<Error>> ValidateLockedAsync(IPostingWriteContext context, IReadOnlyList<ISubledgerLine> lines, CancellationToken cancellationToken);

    /// <summary>Inserts the rows; returns their description for the posting result.</summary>
    Task<IReadOnlyList<LedgerRowView>> WriteAsync(IPostingWriteContext context, IReadOnlyList<ISubledgerLine> lines, CancellationToken cancellationToken);
}
