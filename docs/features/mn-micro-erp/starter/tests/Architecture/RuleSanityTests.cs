using ArchUnitNET.Fluent;
using ArchUnitNET.xUnitV3;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

namespace Erp.Tests.Architecture;

/// <summary>Guards against vacuous passes: the selectors used by the rules match types, and a known dependency is detected.</summary>
public sealed class RuleSanityTests
{
    [Theory]
    [InlineData(@"^Erp\.Tax(\..*)?$")]
    [InlineData(@"^Erp\.GeneralLedger(\..*)?$")]
    [InlineData(@"^Erp\.GeneralLedger\.(Domain|Application|Infrastructure|Api)(\..*)?$")]
    [InlineData(@"^Erp\.[A-Za-z]+\.Infrastructure(\..*)?$")]
    public void Selectors_match_types(string namespacePattern) =>
        Types().That().ResideInNamespaceMatching(namespacePattern).GetObjects(ErpAssemblies.Architecture).ShouldNotBeEmpty();

    [Fact]
    public void Dependency_detection_works_on_a_known_dependency()
    {
        IArchRule rule = Types().That().HaveFullName("Erp.Tax.Infrastructure.Ledger.VatEntryWriter")
            .Should().DependOnAny(Types().That().ResideInNamespace("Erp.GeneralLedger.Contracts.Posting"));
        rule.Check(ErpAssemblies.Architecture);

        var inverted = Types().That().HaveFullName("Erp.Tax.Infrastructure.Ledger.VatEntryWriter")
            .Should().NotDependOnAny(Types().That().ResideInNamespace("Erp.GeneralLedger.Contracts.Posting"));
        inverted.HasNoViolations(ErpAssemblies.Architecture).ShouldBeFalse();
    }
}
