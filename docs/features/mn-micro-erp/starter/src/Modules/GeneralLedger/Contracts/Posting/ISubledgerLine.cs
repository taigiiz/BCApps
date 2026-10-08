namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>A subledger row attached to G/L lines (VAT, receivables, bank …) and written by the owning module's <see cref="ILedgerWriter"/>.</summary>
public interface ISubledgerLine
{
    /// <summary><see cref="LedgerCodes"/> value that selects the writer.</summary>
    string Ledger { get; }

    /// <summary>Keys of the G/L lines this row belongs to (VAT: the base line).</summary>
    IReadOnlyList<string> GlLineKeys { get; }
}
