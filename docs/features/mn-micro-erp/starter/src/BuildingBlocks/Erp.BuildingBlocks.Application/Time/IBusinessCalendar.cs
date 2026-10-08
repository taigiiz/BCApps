namespace Erp.BuildingBlocks.Application.Time;

/// <summary>
/// Business dates (posting date, document date) in the Asia/Ulaanbaatar calendar (02-architecture.md §5.2).
/// Technical timestamps come from the injected <see cref="TimeProvider"/>; DateTime.Now / UtcNow / Today are banned (RS0030).
/// </summary>
public interface IBusinessCalendar
{
    /// <summary>Today's date in Asia/Ulaanbaatar.</summary>
    DateOnly Today { get; }
}
