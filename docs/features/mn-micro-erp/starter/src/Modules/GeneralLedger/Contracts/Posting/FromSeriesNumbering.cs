namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Next gapless number of a series, drawn under the posting lock with <c>platform.fn_next_document_no</c> (D-C7).</summary>
/// <param name="SeriesCode">Number series code, e.g. GJ.</param>
public sealed record FromSeriesNumbering(string SeriesCode) : VoucherNumbering;
