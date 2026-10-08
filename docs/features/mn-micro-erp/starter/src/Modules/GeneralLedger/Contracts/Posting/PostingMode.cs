namespace Erp.GeneralLedger.Contracts.Posting;

/// <summary>Post commits; Preview runs the same code path and rolls back (D-C6, 05-posting-engine.md §5.12).</summary>
public enum PostingMode
{
    /// <summary>Write and commit.</summary>
    Post = 0,

    /// <summary>Write, check deferred constraints, roll back; legal numbers are masked as <c>***</c>.</summary>
    Preview = 1,
}
