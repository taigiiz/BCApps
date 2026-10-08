namespace Erp.GeneralLedger.Application.Ports;

/// <summary>Journal template + batch settings needed to post (BC T80/T232).</summary>
internal sealed record JournalSetup(
    Guid BatchId,
    string TemplateCode,
    string BatchCode,
    string TemplateType,
    string SourceCode,
    string? PostingSeriesCode,
    decimal AmountPrecision);
