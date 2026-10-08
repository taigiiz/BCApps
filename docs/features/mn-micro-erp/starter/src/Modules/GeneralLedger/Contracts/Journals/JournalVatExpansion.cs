using Erp.GeneralLedger.Contracts.Posting;

namespace Erp.GeneralLedger.Contracts.Journals;

/// <summary>G/L lines (base + VAT) and subledger rows (VAT entry) produced for one VAT side.</summary>
/// <param name="GlLines">Base line (carries <c>VatAmount</c>) and the VAT account line.</param>
/// <param name="SubledgerLines">The VAT ledger line attached to the base line.</param>
public sealed record JournalVatExpansion(IReadOnlyList<GlPostingLine> GlLines, IReadOnlyList<ISubledgerLine> SubledgerLines);
