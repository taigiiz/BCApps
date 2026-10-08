namespace Erp.BuildingBlocks.Application.Persistence;

/// <summary>
/// One database transaction opened for one command: BEGIN + <c>platform.fn_set_context</c> + timeouts (02-architecture.md §7.3).
/// Handlers never begin or commit transactions themselves (D-C6, 18-dev-setup.md D8).
/// </summary>
public interface ITransactionalSession
{
    /// <summary>The tenant / company / user context of the transaction.</summary>
    TenantScope Scope { get; }

    /// <summary>True when the transaction will be rolled back (preview, business error).</summary>
    bool IsRollbackOnly { get; }

    /// <summary>Marks the transaction for ROLLBACK at the end of the command (posting preview = same code + rollback).</summary>
    void MarkRollbackOnly();
}
