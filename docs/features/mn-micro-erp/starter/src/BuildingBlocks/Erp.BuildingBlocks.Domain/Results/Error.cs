namespace Erp.BuildingBlocks.Domain.Results;

/// <summary>
/// An expected business error (18-dev-setup.md §3.1): a stable English code such as <c>gl.period_closed</c> that the UI
/// translates, an English developer message, an optional JSON pointer into the request (<see cref="Target"/>) and string-valued details.
/// </summary>
/// <param name="Code">Stable error code, <c>&lt;module&gt;.&lt;reason&gt;</c>.</param>
/// <param name="Message">English message for logs and developers (the UI translates <paramref name="Code"/>).</param>
public sealed record Error(string Code, string Message)
{
    /// <summary>JSON pointer (API field <c>pointer</c>) of the offending request member, e.g. <c>/lines/0/amount</c>.</summary>
    public string? Target { get; init; }

    /// <summary>Machine-readable details (money as invariant strings).</summary>
    public IReadOnlyDictionary<string, string>? Details { get; init; }

    /// <inheritdoc />
    public override string ToString() => Target is null ? $"{Code}: {Message}" : $"{Code} ({Target}): {Message}";
}
