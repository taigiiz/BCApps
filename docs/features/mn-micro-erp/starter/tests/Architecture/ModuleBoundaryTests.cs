using System.Reflection;
using ArchUnitNET.Fluent;
using ArchUnitNET.xUnitV3;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

namespace Erp.Tests.Architecture;

/// <summary>
/// 18-dev-setup.md §2.4 rule 3 / ADR-0011: a module uses another module only through its <c>*.Contracts</c>; the General Ledger
/// defines the posting contracts and never knows its implementers (dependency inversion: Tax implements IJournalVatHandler,
/// ILedgerWriter, IReversibleLedger).
/// </summary>
public sealed class ModuleBoundaryTests
{
    [Fact]
    public void Tax_uses_GeneralLedger_only_through_its_Contracts()
    {
        IArchRule rule = Types().That().ResideInNamespaceMatching(@"^Erp\.Tax(\..*)?$")
            .Should().NotDependOnAny(Types().That().ResideInNamespaceMatching(@"^Erp\.GeneralLedger\.(Domain|Application|Infrastructure|Api)(\..*)?$"))
            .Because("modules talk through Erp.<M>.Contracts only (ADR-0011)");
        rule.Check(ErpAssemblies.Architecture);
    }

    [Fact]
    public void GeneralLedger_does_not_know_Tax_at_all()
    {
        IArchRule rule = Types().That().ResideInNamespaceMatching(@"^Erp\.GeneralLedger(\..*)?$")
            .Should().NotDependOnAny(Types().That().ResideInNamespaceMatching(@"^Erp\.Tax(\..*)?$"))
            .Because("GL defines the posting contracts; other modules implement them (05-posting-engine.md §5.1)");
        rule.Check(ErpAssemblies.Architecture);
    }

    [Theory]
    [InlineData("GeneralLedger")]
    [InlineData("Tax")]
    public void Module_assemblies_reference_other_modules_only_through_Contracts(string module)
    {
        foreach (Assembly assembly in ErpAssemblies.Module(module))
        {
            string[] foreign = [.. assembly.GetReferencedAssemblies()
                .Select(r => r.Name!)
                .Where(n => n.StartsWith("Erp.", StringComparison.Ordinal)
                            && !n.StartsWith("Erp.BuildingBlocks.", StringComparison.Ordinal)
                            && !n.StartsWith($"Erp.{module}.", StringComparison.Ordinal))];
            foreign.ShouldAllBe(n => n.EndsWith(".Contracts", StringComparison.Ordinal), $"{assembly.GetName().Name} references {string.Join(", ", foreign)}");
        }
    }

    [Theory]
    [InlineData("Erp.GeneralLedger.Domain")]
    [InlineData("Erp.GeneralLedger.Application")]
    [InlineData("Erp.GeneralLedger.Infrastructure")]
    [InlineData("Erp.Tax.Domain")]
    [InlineData("Erp.Tax.Infrastructure")]
    public void Rule8_Module_layers_are_internal_except_the_module_registration(string assembly)
    {
        string[] publicTypes = [.. ErpAssemblies.Get(assembly).GetExportedTypes()
            .Where(t => !(t.IsAbstract && t.IsSealed && t.Name.EndsWith("Module", StringComparison.Ordinal)))
            .Select(t => t.FullName!)];
        publicTypes.ShouldBeEmpty("module layers are internal by default; only <M>Module is public (18-dev-setup.md §2.4 rule 8)");
    }
}
