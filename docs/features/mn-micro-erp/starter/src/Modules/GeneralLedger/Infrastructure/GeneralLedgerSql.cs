using Erp.BuildingBlocks.Infrastructure.Persistence;

namespace Erp.GeneralLedger.Infrastructure;

/// <summary>Embedded SQL of the G/L module (resource name = folder namespace + <c>.Sql.</c> + file name).</summary>
internal static class GeneralLedgerSql
{
    public static string Load(string folderNamespace, string name) =>
        EmbeddedSql.Load(typeof(GeneralLedgerSql).Assembly, $"{folderNamespace}.Sql.{name}.sql");
}
