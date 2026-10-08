using System.ComponentModel.DataAnnotations;

namespace Erp.GeneralLedger.Api.Requests;

/// <summary>Body of <c>POST …/gl/postings</c> and <c>…/gl/postings:preview</c> (Sprint 0 direct journal posting).</summary>
internal sealed record PostingRequest
{
    /// <summary>Journal template code (seed: GENERAL, OPENING, …).</summary>
    public string JournalTemplate { get; init; } = "GENERAL";

    /// <summary>Journal batch code (seed: DEFAULT).</summary>
    public string JournalBatch { get; init; } = "DEFAULT";

    /// <summary>Journal lines; vouchers are formed by (documentNo, postingDate).</summary>
    [Required]
    [MinLength(1)]
    public IReadOnlyList<PostingLineRequest> Lines { get; init; } = [];
}
