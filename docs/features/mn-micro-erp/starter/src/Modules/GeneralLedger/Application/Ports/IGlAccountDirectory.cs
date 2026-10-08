namespace Erp.GeneralLedger.Application.Ports;

/// <summary>Resolves account numbers (as typed by the user) to ids of the current company; validity is checked by the engine.</summary>
internal interface IGlAccountDirectory
{
    Task<IReadOnlyDictionary<string, Guid>> ResolveAsync(IReadOnlyCollection<string> accountNos, CancellationToken cancellationToken);
}
