using Erp.BuildingBlocks.Domain.Results;

namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>
/// The posting engine (BC CU12 "Gen. Jnl.-Post Line"). Runs inside the command's TenantSession: per-company advisory lock,
/// validation under the lock, gapless numbers from the schema's counter functions, inserts, register; preview = rollback.
/// </summary>
public interface IPostingService
{
    /// <summary>Phase A (no lock, read-only): every error of the document, collected (does not stop at the first).</summary>
    Task<IReadOnlyList<Error>> ValidateAsync(PostingDocument document, CancellationToken cancellationToken);

    /// <summary>Phase B: lock, re-validate, number, write. Business errors return a failed result and mark the session rollback-only.</summary>
    Task<Result<PostingResult>> PostAsync(PostingDocument document, PostingMode mode, CancellationToken cancellationToken);
}
