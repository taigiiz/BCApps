namespace Erp.BuildingBlocks.Domain.Results;

/// <summary>Outcome of an operation that fails with expected business errors instead of exceptions (18-dev-setup.md §3.1).</summary>
public class Result
{
    private protected Result(IReadOnlyList<Error> errors) => Errors = errors;

    /// <summary>The errors; empty on success.</summary>
    public IReadOnlyList<Error> Errors { get; }

    /// <summary>True when there are no errors.</summary>
    public bool IsSuccess => Errors.Count == 0;

    /// <summary>True when there is at least one error.</summary>
    public bool IsFailure => !IsSuccess;

    /// <summary>A successful result without a value.</summary>
    public static Result Success() => new([]);

    /// <summary>A successful result carrying <paramref name="value"/>.</summary>
    public static Result<T> Success<T>(T value) => new(value);

    /// <summary>A failed result.</summary>
    public static Result Failure(Error error) => new([error]);

    /// <summary>A failed result; <paramref name="errors"/> must not be empty.</summary>
    public static Result Failure(IReadOnlyList<Error> errors) => new(RequireErrors(errors));

    /// <summary>A failed result of type <typeparamref name="T"/>.</summary>
    public static Result<T> Failure<T>(Error error) => new([error]);

    /// <summary>A failed result of type <typeparamref name="T"/>; <paramref name="errors"/> must not be empty.</summary>
    public static Result<T> Failure<T>(IReadOnlyList<Error> errors) => new(RequireErrors(errors));

    private protected static IReadOnlyList<Error> RequireErrors(IReadOnlyList<Error> errors)
    {
        ArgumentNullException.ThrowIfNull(errors);
        return errors.Count > 0 ? errors : throw new ArgumentException("A failed result needs at least one error.", nameof(errors));
    }
}
