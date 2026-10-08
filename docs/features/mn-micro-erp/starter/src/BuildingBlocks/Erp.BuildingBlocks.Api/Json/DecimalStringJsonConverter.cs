using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Erp.BuildingBlocks.Api.Json;

/// <summary>
/// Money, quantities and rates travel as JSON strings (ADR-0006 §7, 18-dev-setup.md §4.2 rule 11). Reading accepts only strings
/// matching <c>^-?(0|[1-9]\d{0,14})(\.\d{1,18})?$</c> (a JSON number is rejected); writing is invariant, without exponent,
/// thousands separator or trailing zeros (<c>"12345.6"</c>, <c>"-15.25"</c>, <c>"0"</c>).
/// </summary>
public sealed partial class DecimalStringJsonConverter : JsonConverter<decimal>
{
    /// <summary>Error code returned when a client sends a number instead of a string.</summary>
    public const string MustBeStringCode = "money.must_be_string";

    /// <inheritdoc />
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"{MustBeStringCode}: decimal values must be JSON strings such as \"12345.67\".");
        }

        string text = reader.GetString() ?? string.Empty;
        if (!DecimalPattern().IsMatch(text))
        {
            throw new JsonException($"{MustBeStringCode}: '{text}' is not a plain invariant decimal.");
        }

        return decimal.Parse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
    }

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(Format(value));
    }

    /// <summary>Invariant text without trailing zeros, exponent or group separators.</summary>
    public static string Format(decimal value) => value.ToString("0.############################", CultureInfo.InvariantCulture);

    [GeneratedRegex(@"^-?(0|[1-9]\d{0,14})(\.\d{1,18})?$", RegexOptions.CultureInvariant | RegexOptions.ExplicitCapture, matchTimeoutMilliseconds: 100)]
    private static partial Regex DecimalPattern();
}
