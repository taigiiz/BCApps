using Erp.BuildingBlocks.Domain.Results;
using Erp.GeneralLedger.Contracts.Posting;

namespace Erp.GeneralLedger.Contracts.Reversal;

/// <summary>Reversal of journal transactions: opposite sign, opposite column, no storno (D-C3, D-D5).</summary>
public interface IReversalService
{
    /// <summary>Reverses a transaction inside the current TenantSession.</summary>
    Task<Result<PostingResult>> ReverseTransactionAsync(ReverseTransactionRequest request, PostingMode mode, CancellationToken cancellationToken);
}
