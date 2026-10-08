using Erp.BuildingBlocks.Domain.Results;

namespace Erp.GeneralLedger.Infrastructure.Posting;

/// <summary>Errors of the database-backed checks plus the account numbers needed for the result.</summary>
internal sealed record FactsCheck(IReadOnlyList<Error> Errors, IReadOnlyDictionary<Guid, string> AccountNos);
