using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Application.Ports;
using Npgsql;

namespace Erp.GeneralLedger.Infrastructure.Lookups;

/// <summary>Resolves G/L account numbers of the current company.</summary>
internal sealed class GlAccountDirectory(ITenantSession session) : IGlAccountDirectory
{
    private const string FolderNamespace = "Erp.GeneralLedger.Infrastructure.Lookups";

    public async Task<IReadOnlyDictionary<string, Guid>> ResolveAsync(IReadOnlyCollection<string> accountNos, CancellationToken cancellationToken)
    {
        Dictionary<string, Guid> result = new(StringComparer.Ordinal);
        if (accountNos.Count == 0)
        {
            return result;
        }

        await using NpgsqlCommand command = session.CreateCommand(GeneralLedgerSql.Load(FolderNamespace, "resolve_account_numbers"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("account_nos", accountNos.ToArray());
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result[reader.GetString(0)] = reader.GetGuid(1);
        }

        return result;
    }
}
