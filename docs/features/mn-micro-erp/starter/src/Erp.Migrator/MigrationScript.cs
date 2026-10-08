using System.Security.Cryptography;
using System.Text;

namespace Erp.Migrator;

/// <summary>One embedded SQL script.</summary>
/// <param name="Name">Journal key, e.g. <c>schema/020_gl.sql</c>.</param>
/// <param name="Kind">Schema or seed.</param>
/// <param name="Text">Script text with LF line endings.</param>
public sealed record MigrationScript(string Name, ScriptKind Kind, string Text)
{
    /// <summary>Lower-case hex SHA-256 of the LF-normalized text (same on Windows and Linux, see .gitattributes).</summary>
    public string Checksum { get; } = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(Text)));
}
