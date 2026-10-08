namespace Erp.GeneralLedger.Infrastructure.Posting;

/// <summary>Company settings the engine needs (05-posting-engine.md §6.1).</summary>
internal sealed record CompanyPostingSettings(decimal AmountPrecision);
