using Erp.GeneralLedger.Application.Journals;
using Erp.GeneralLedger.Application.Ports;
using Erp.GeneralLedger.Application.Reversal;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.GeneralLedger.Contracts.Reversal;
using Erp.GeneralLedger.Infrastructure.Lookups;
using Erp.GeneralLedger.Infrastructure.Posting;
using Erp.GeneralLedger.Infrastructure.Reversal;
using Microsoft.Extensions.DependencyInjection;

namespace Erp.GeneralLedger.Infrastructure;

/// <summary>DI registration of the General Ledger module (18-dev-setup.md §2.3: <c>Add&lt;M&gt;Module()</c>).</summary>
public static class GeneralLedgerModule
{
    /// <summary>Registers the posting engine, reversal service, lookups and use-case handlers (all scoped to the TenantSession).</summary>
    public static IServiceCollection AddGeneralLedgerModule(this IServiceCollection services)
    {
        services.AddScoped<PostingEngine>();
        services.AddScoped<IPostingService>(sp => sp.GetRequiredService<PostingEngine>());
        services.AddScoped<IReversalService, ReversalService>();
        services.AddScoped<IJournalSetupReader, JournalSetupReader>();
        services.AddScoped<IGlAccountDirectory, GlAccountDirectory>();
        services.AddScoped<PostJournalHandler>();
        services.AddScoped<ReverseTransactionHandler>();
        return services;
    }
}
