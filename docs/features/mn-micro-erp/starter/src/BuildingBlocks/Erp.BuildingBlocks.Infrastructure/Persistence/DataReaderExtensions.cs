using Npgsql;

namespace Erp.BuildingBlocks.Infrastructure.Persistence;

/// <summary>
/// Nullable column accessors. Npgsql buffers the whole row in the default (non-sequential) mode, so synchronous column access after
/// <c>ReadAsync</c> does not block; these helpers keep that explicit and out of async methods (CA1849).
/// </summary>
public static class DataReaderExtensions
{
    /// <summary>The uuid value or null.</summary>
    public static Guid? GetGuidOrNull(this NpgsqlDataReader reader, int ordinal)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.IsDBNull(ordinal) ? null : reader.GetGuid(ordinal);
    }

    /// <summary>The bigint value or null.</summary>
    public static long? GetInt64OrNull(this NpgsqlDataReader reader, int ordinal)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.IsDBNull(ordinal) ? null : reader.GetInt64(ordinal);
    }

    /// <summary>The text value or null.</summary>
    public static string? GetStringOrNull(this NpgsqlDataReader reader, int ordinal)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    /// <summary>The date value.</summary>
    public static DateOnly GetDateOnly(this NpgsqlDataReader reader, int ordinal)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.GetFieldValue<DateOnly>(ordinal);
    }

    /// <summary>The date value or null.</summary>
    public static DateOnly? GetDateOnlyOrNull(this NpgsqlDataReader reader, int ordinal)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal);
    }
}
