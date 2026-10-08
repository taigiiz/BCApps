using Erp.BuildingBlocks.Application.Persistence;
using Erp.BuildingBlocks.Domain.Results;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.GeneralLedger.Contracts.Reversal;
using Erp.GeneralLedger.Domain;

namespace Erp.GeneralLedger.Application.Reversal;

/// <summary>Validates the command (reason code is mandatory, BR-PST-20) and runs the reversal service.</summary>
internal sealed class ReverseTransactionHandler(IReversalService reversalService, ITransactionalSession session)
{
    public async Task<Result<PostingResult>> HandleAsync(ReverseTransactionCommand command, PostingMode mode, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        Result<PostingResult> result = string.IsNullOrWhiteSpace(command.ReasonCode)
            ? Result.Failure<PostingResult>(new Error(GlErrorCodes.ReasonCodeRequired, "A reason code is required to reverse a transaction.") { Target = "/reasonCode" })
            : await reversalService.ReverseTransactionAsync(new ReverseTransactionRequest(command.TransactionNo, command.ReasonCode), mode, cancellationToken);
        if (result.IsFailure)
        {
            session.MarkRollbackOnly();
        }

        return result;
    }
}
