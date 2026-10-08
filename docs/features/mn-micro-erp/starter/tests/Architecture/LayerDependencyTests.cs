using ArchUnitNET.Fluent;
using ArchUnitNET.xUnitV3;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

namespace Erp.Tests.Architecture;

/// <summary>18-dev-setup.md §2.4 rules 1, 2, 4 and 13 (layer dependencies), checked on types with ArchUnitNET.</summary>
public sealed class LayerDependencyTests
{
    private static readonly ArchUnitNET.Domain.Architecture _architecture = ErpAssemblies.Architecture;
    private static readonly string[] _expectedAssemblies = ["Erp.GeneralLedger.Infrastructure", "Erp.Tax.Infrastructure", "Erp.BuildingBlocks.Domain"];

    public static TheoryData<string> DomainAssemblies() => [.. ErpAssemblies.Layer(".Domain").Select(a => a.GetName().Name!)];

    public static TheoryData<string> ApplicationAssemblies() => [.. ErpAssemblies.Layer(".Application").Select(a => a.GetName().Name!)];

    public static TheoryData<string> ApiAssemblies() =>
        [.. ErpAssemblies.Layer(".Api").Where(a => a.GetName().Name != "Erp.Api").Select(a => a.GetName().Name!)];

    [Theory]
    [MemberData(nameof(DomainAssemblies))]
    public void Rule1_Domain_has_no_infrastructure_dependencies(string assembly)
    {
        // Npgsql is loaded into the architecture; EF Core / ASP.NET Core / HttpClient are checked by reference name below.
        IArchRule rule = Types().That().ResideInAssembly(ErpAssemblies.Get(assembly))
            .Should().NotDependOnAny(Types().That().ResideInAssembly(typeof(Npgsql.NpgsqlConnection).Assembly))
            .Because("*.Domain holds pure rules (18-dev-setup.md §2.4 rule 1)");
        rule.Check(_architecture);

        ErpAssemblies.Get(assembly).GetReferencedAssemblies().Select(r => r.Name!)
            .ShouldNotContain(n => n.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal)
                                   || n.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal)
                                   || n.StartsWith("Npgsql", StringComparison.Ordinal)
                                   || n.StartsWith("Dapper", StringComparison.Ordinal)
                                   || n.StartsWith("Quartz", StringComparison.Ordinal)
                                   || n == "System.Net.Http");
    }

    [Theory]
    [MemberData(nameof(DomainAssemblies))]
    public void Rule1_Domain_references_only_the_shared_kernel(string assembly) =>
        ErpAssemblies.Get(assembly).GetReferencedAssemblies().Select(r => r.Name!)
            .Where(n => n.StartsWith("Erp.", StringComparison.Ordinal))
            .ShouldAllBe(n => n == "Erp.BuildingBlocks.Domain");

    [Theory]
    [MemberData(nameof(ApplicationAssemblies))]
    public void Rule2_Application_does_not_depend_on_Infrastructure_or_Api(string assembly)
    {
        IArchRule rule = Types().That().ResideInAssembly(ErpAssemblies.Get(assembly))
            .Should().NotDependOnAny(Types().That().ResideInNamespaceMatching(@"^Erp\.[A-Za-z]+\.(Infrastructure|Api)(\..*)?$"))
            .AndShould().NotDependOnAny(Types().That().ResideInAssembly(typeof(Npgsql.NpgsqlConnection).Assembly))
            .Because("use cases talk to ports, not to adapters (18-dev-setup.md §2.4 rule 2)");
        rule.Check(_architecture);
    }

    [Theory]
    [MemberData(nameof(ApiAssemblies))]
    public void Rule4_Module_Api_does_not_depend_on_Infrastructure(string assembly)
    {
        IArchRule rule = Types().That().ResideInAssembly(ErpAssemblies.Get(assembly))
            .Should().NotDependOnAny(Types().That().ResideInNamespaceMatching(@"^Erp\.[A-Za-z]+\.Infrastructure(\..*)?$"))
            .Because("endpoints call Application handlers only (18-dev-setup.md §2.4 rule 4)");
        rule.Check(_architecture);
    }

    [Fact]
    public void Rule13_Modules_never_touch_NpgsqlDataSource()
    {
        IArchRule rule = Types().That().ResideInNamespaceMatching(@"^Erp\.(GeneralLedger|Tax)(\..*)?$")
            .Should().NotDependOnAny(Types().That().HaveFullName(typeof(Npgsql.NpgsqlDataSource).FullName!))
            .Because("modules reach the database only through ITenantSession (02-architecture.md §7.3)");
        rule.Check(_architecture);
    }

    [Fact]
    public void Handlers_are_sealed_and_named_Handler()
    {
        IArchRule rule = Classes().That().HaveNameEndingWith("Handler").And().ResideInNamespaceMatching(@"^Erp\..*\.Application(\..*)?$")
            .Should().BeSealed()
            .Because("18-dev-setup.md §2.4 rule 9");
        rule.Check(_architecture);
    }

    [Fact]
    public void Composition_root_assemblies_are_known()
    {
        string[] names = [.. ErpAssemblies.Production.Select(a => a.GetName().Name!)];
        _expectedAssemblies.Except(names, StringComparer.Ordinal).ShouldBeEmpty();
        ErpAssemblies.Layer(".Domain").Count().ShouldBeGreaterThanOrEqualTo(3);
    }
}
