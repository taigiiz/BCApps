namespace Erp.Migrator;

/// <summary>Versioned schema script (applied once, never edited) or repeatable seed script (re-applied when it changes).</summary>
public enum ScriptKind
{
    /// <summary>db/schema/NNN_*.sql.</summary>
    Schema = 0,

    /// <summary>db/seed/legal_parameters.sql and db/seed/mn_*.sql.</summary>
    Seed = 1,
}
