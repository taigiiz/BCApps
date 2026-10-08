using Erp.GeneralLedger.Contracts.Posting;

namespace Erp.GeneralLedger.Infrastructure.Reversal;

/// <summary>A G/L entry of the voucher being reversed.</summary>
internal sealed record OriginalEntry(
    long EntryNo,
    Guid GlAccountId,
    decimal Amount,
    decimal VatAmount,
    string GenPostingType,
    PostingGroupSnapshot Groups,
    DateOnly? VatDate,
    DateOnly? DocumentDate,
    string? ExternalDocumentNo,
    string? Description,
    Guid? BalGlAccountId,
    long DimensionSetId);
