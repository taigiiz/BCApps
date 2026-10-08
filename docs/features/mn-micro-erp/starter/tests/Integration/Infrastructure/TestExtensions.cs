namespace Erp.Tests.Integration.Infrastructure;

internal static class TestExtensions
{
    /// <summary>Runs an assertion on a value inline.</summary>
    public static void Apply<T>(this T value, Action<T> assertion)
    {
        ArgumentNullException.ThrowIfNull(assertion);
        assertion(value);
    }
}
