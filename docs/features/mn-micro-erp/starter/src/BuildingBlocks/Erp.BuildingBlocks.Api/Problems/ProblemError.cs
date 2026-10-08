using System.Text.Json.Serialization;

namespace Erp.BuildingBlocks.Api.Problems;

/// <summary>One entry of the ProblemDetails <c>errors[]</c> extension.</summary>
/// <param name="Code">Stable error code.</param>
/// <param name="Message">English message.</param>
/// <param name="Target">JSON pointer of the offending member (serialized as <c>pointer</c>).</param>
/// <param name="Details">Machine-readable details.</param>
public sealed record ProblemError(
    string Code,
    string Message,
    [property: JsonPropertyName("pointer")] string? Target,
    IReadOnlyDictionary<string, string>? Details);
