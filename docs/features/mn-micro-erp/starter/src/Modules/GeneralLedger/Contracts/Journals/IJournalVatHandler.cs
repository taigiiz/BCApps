using Erp.BuildingBlocks.Domain.Results;

namespace Erp.GeneralLedger.Contracts.Journals;

/// <summary>Implemented by Tax: splits a gross journal side into base + VAT with the company's VAT posting setup (BR-PST-38).</summary>
public interface IJournalVatHandler
{
    /// <summary>Expands the side; errors such as <c>tax.vat_posting_setup_missing</c> are returned, not thrown.</summary>
    Task<Result<JournalVatExpansion>> ExpandAsync(JournalVatSide side, CancellationToken cancellationToken);
}
