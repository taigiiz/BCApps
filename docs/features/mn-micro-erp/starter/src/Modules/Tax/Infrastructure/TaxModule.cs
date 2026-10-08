using Erp.GeneralLedger.Contracts.Journals;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.GeneralLedger.Contracts.Reversal;
using Erp.Tax.Infrastructure.Journals;
using Erp.Tax.Infrastructure.Ledger;
using Microsoft.Extensions.DependencyInjection;

namespace Erp.Tax.Infrastructure;

/// <summary>DI registration of the Tax module (18-dev-setup.md §2.3: <c>Add&lt;M&gt;Module()</c>).</summary>
public static class TaxModule
{
    /// <summary>Registers the journal VAT handler and the VAT ledger writer / reversal (scoped: they use the TenantSession).</summary>
    public static IServiceCollection AddTaxModule(this IServiceCollection services)
    {
        services.AddScoped<IJournalVatHandler, JournalVatHandler>();
        services.AddScoped<VatEntryWriter>();
        services.AddScoped<ILedgerWriter>(sp => sp.GetRequiredService<VatEntryWriter>());
        services.AddScoped<IReversibleLedger>(sp => sp.GetRequiredService<VatEntryWriter>());
        return services;
    }
}
