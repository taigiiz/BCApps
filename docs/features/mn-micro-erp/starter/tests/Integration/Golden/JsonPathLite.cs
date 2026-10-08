using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Erp.Tests.Integration.Golden;

/// <summary>The JSONPath subset used by golden scenarios: <c>$.a.b[0].c</c> (capture, bodyContains).</summary>
internal static partial class JsonPathLite
{
    public static JsonElement? Select(JsonElement root, string path)
    {
        if (!path.StartsWith('$'))
        {
            throw new ArgumentException($"JSONPath must start with '$': {path}", nameof(path));
        }

        JsonElement current = root;
        foreach (Match token in TokenRegex().Matches(path[1..]))
        {
            if (token.Groups["name"].Success)
            {
                if (current.ValueKind != JsonValueKind.Object || !current.TryGetProperty(token.Groups["name"].Value, out JsonElement next))
                {
                    return null;
                }

                current = next;
            }
            else
            {
                int index = int.Parse(token.Groups["index"].Value, CultureInfo.InvariantCulture);
                if (current.ValueKind != JsonValueKind.Array || index >= current.GetArrayLength())
                {
                    return null;
                }

                current = current[index];
            }
        }

        return current;
    }

    /// <summary>Scalar as invariant text for comparisons ("100.00", "true", "null").</summary>
    public static string Text(JsonElement? value) => value switch
    {
        null => "<missing>",
        { ValueKind: JsonValueKind.String } v => v.GetString()!,
        { ValueKind: JsonValueKind.Null } => "null",
        { ValueKind: JsonValueKind.True } => "true",
        { ValueKind: JsonValueKind.False } => "false",
        { } v => v.GetRawText(),
    };

    [GeneratedRegex(@"\.(?<name>[A-Za-z_][A-Za-z0-9_]*)|\[(?<index>[0-9]+)\]", RegexOptions.CultureInvariant | RegexOptions.ExplicitCapture, matchTimeoutMilliseconds: 1000)]
    private static partial Regex TokenRegex();
}
