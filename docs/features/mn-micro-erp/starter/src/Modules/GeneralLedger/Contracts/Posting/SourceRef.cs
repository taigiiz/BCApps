namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>The business object being posted (<c>audit.posting_log.source_id/source_no</c>).</summary>
/// <param name="Kind">Table or document kind, e.g. <c>gl.journal</c>.</param>
/// <param name="Id">Id of the source, when it has one.</param>
/// <param name="No">Human-readable number of the source.</param>
public sealed record SourceRef(string Kind, Guid? Id, string? No);
