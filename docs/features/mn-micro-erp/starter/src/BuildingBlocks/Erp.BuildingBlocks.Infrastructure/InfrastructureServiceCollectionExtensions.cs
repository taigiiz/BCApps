using Erp.BuildingBlocks.Application.Persistence;
using Erp.BuildingBlocks.Application.Time;
using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.BuildingBlocks.Infrastructure.Time;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Erp.BuildingBlocks.Infrastructure;

/// <summary>DI registration of the shared infrastructure (composition roots: Erp.Api, Erp.Worker, tests).</summary>
public static class InfrastructureServiceCollectionExtensions
{
    /// <summary>Registers TenantSession (scoped), the transaction runner, the health probe, TimeProvider and the business calendar.</summary>
    public static IServiceCollection AddErpInfrastructure(this IServiceCollection services, Action<DatabaseOptions> configure)
    {
        services.AddOptions<DatabaseOptions>()
            .Configure(configure)
            .Validate(o => !string.IsNullOrWhiteSpace(o.ConnectionString), "Database:ConnectionString is required.");
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<IBusinessCalendar, UlaanbaatarBusinessCalendar>();
        services.TryAddSingleton(sp =>
        {
            DatabaseOptions options = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            return new ErpDataSource(new NpgsqlDataSourceBuilder(options.ConnectionString).Build());
        });
        services.TryAddSingleton<IDatabaseHealthProbe, DatabaseHealthProbe>();
        services.TryAddScoped<TenantSession>();
        services.TryAddScoped<ITenantSession>(sp => sp.GetRequiredService<TenantSession>());
        services.TryAddScoped<ITransactionalSession>(sp => sp.GetRequiredService<TenantSession>());
        services.TryAddScoped<ITenantTransactionRunner, TenantTransactionRunner>();
        return services;
    }
}
