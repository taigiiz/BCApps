namespace Erp.BuildingBlocks.Domain.Results;

/// <summary>Outcome carrying a value on success. Create it with <see cref="Result.Success{T}(T)"/> / <see cref="Result.Failure{T}(Error)"/>.</summary>
/// <typeparam name="T">Type of the value.</typeparam>
public sealed class Result<T> : Result
{
    private readonly T? _value;

    internal Result(T value)
        : base([]) => _value = value;

    internal Result(IReadOnlyList<Error> errors)
        : base(errors)
    {
    }

    /// <summary>The value; throws when the result is a failure.</summary>
    public T Value => IsSuccess ? _value! : throw new InvalidOperationException("A failed result has no value: " + string.Join("; ", Errors));
}
