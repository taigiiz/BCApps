using Erp.BuildingBlocks.Domain.Results;
using Erp.GeneralLedger.Contracts.Posting;

namespace Erp.GeneralLedger.Contracts.Reversal;

/// <summary>A subledger that mirrors its rows when G/L transactions are reversed (VAT, customer, vendor, bank).</summary>
public interface IReversibleLedger
{
    /// <summary>Call order (10 VAT, 20 customer …).</summary>
    int Order { get; }

    /// <summary>Checks under the posting lock, before the reversal is built (e.g. VAT already settled → <c>gl.reversal_vat_settled</c>).</summary>
    Task<IReadOnlyList<Error>> ValidateReversalAsync(IReadOnlyList<long> transactionNos, CancellationToken cancellationToken);

    /// <summary>Writes the mirror rows and flags the originals.</summary>
    Task<IReadOnlyList<LedgerRowView>> ReverseAsync(IPostingWriteContext context, ReversalPlan plan, CancellationToken cancellationToken);
}
