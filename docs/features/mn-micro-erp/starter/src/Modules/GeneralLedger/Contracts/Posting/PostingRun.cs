namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Header of one posting run = one <c>gl.gl_register</c> row.</summary>
/// <param name="SourceCode">BC source code (<c>platform.source_code</c>), e.g. GENJNL, REVERSAL.</param>
/// <param name="PostingType"><c>audit.posting_log.posting_type</c>, e.g. GENERAL_JOURNAL, REVERSAL.</param>
/// <param name="Source">The object being posted.</param>
/// <param name="JournalTemplateCode">Journal template code (journals only).</param>
/// <param name="JournalBatchCode">Journal batch code (journals only).</param>
public sealed record PostingRun(
    string SourceCode,
    string PostingType,
    SourceRef Source,
    string? JournalTemplateCode,
    string? JournalBatchCode);
