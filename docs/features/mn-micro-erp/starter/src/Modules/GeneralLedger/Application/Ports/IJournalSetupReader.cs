namespace Erp.GeneralLedger.Application.Ports;

/// <summary>Reads journal template / batch settings of the current company.</summary>
internal interface IJournalSetupReader
{
    Task<JournalSetup?> GetAsync(string templateCode, string batchCode, CancellationToken cancellationToken);
}
