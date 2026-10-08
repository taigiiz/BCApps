namespace Erp.GeneralLedger.Contracts.Reversal;

/// <summary>Mapping from original to reversing numbers handed to every <see cref="IReversibleLedger"/> (05-posting-engine.md §5.10).</summary>
/// <param name="TransactionMap">Original transaction no. → reversing transaction no.</param>
/// <param name="GlEntryMap">Original G/L entry no. → reversing G/L entry no.</param>
/// <param name="RegisterNo">Register of the reversal run.</param>
public sealed record ReversalPlan(
    IReadOnlyDictionary<long, long> TransactionMap,
    IReadOnlyDictionary<long, long> GlEntryMap,
    long RegisterNo);
