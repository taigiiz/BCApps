using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Application.Ports;
using Npgsql;

namespace Erp.GeneralLedger.Infrastructure.Lookups;

/// <summary>Reads journal template / batch settings through the TenantSession.</summary>
internal sealed class JournalSetupReader(ITenantSession session) : IJournalSetupReader
{
    private const string FolderNamespace = "Erp.GeneralLedger.Infrastructure.Lookups";

    public async Task<JournalSetup?> GetAsync(string templateCode, string batchCode, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "read_journal_setup"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("template_code", templateCode);
        command.Parameters.AddWithValue("batch_code", batchCode);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new JournalSetup(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetStringOrNull(5),
            reader.GetDecimal(6));
    }
}
