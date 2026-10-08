using Erp.BuildingBlocks.Infrastructure.Persistence;

namespace Erp.Tax.Infrastructure;

/// <summary>Embedded SQL of the Tax module (resource name = namespace of the folder + file name).</summary>
internal static class TaxSql
{
    public static string Load(string folderNamespace, string name) =>
        EmbeddedSql.Load(typeof(TaxSql).Assembly, $"{folderNamespace}.Sql.{name}.sql");
}
