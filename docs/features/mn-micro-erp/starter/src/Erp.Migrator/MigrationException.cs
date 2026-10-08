namespace Erp.Migrator;

/// <summary>A migration cannot proceed (checksum mismatch, pending scripts in verify, unknown option).</summary>
public sealed class MigrationException : Exception
{
    /// <summary>Creates the exception.</summary>
    public MigrationException()
    {
    }

    /// <summary>Creates the exception with a message.</summary>
    public MigrationException(string message)
        : base(message)
    {
    }

    /// <summary>Creates the exception with a message and an inner exception.</summary>
    public MigrationException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
