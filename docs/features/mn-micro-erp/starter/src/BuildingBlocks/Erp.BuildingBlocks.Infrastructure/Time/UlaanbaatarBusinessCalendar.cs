using Erp.BuildingBlocks.Application.Time;

namespace Erp.BuildingBlocks.Infrastructure.Time;

/// <summary>Business calendar of Asia/Ulaanbaatar on top of the injected <see cref="TimeProvider"/> (FakeTimeProvider in tests).</summary>
internal sealed class UlaanbaatarBusinessCalendar(TimeProvider timeProvider) : IBusinessCalendar
{
    private static readonly TimeZoneInfo _ulaanbaatar = TimeZoneInfo.FindSystemTimeZoneById("Asia/Ulaanbaatar");

    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), _ulaanbaatar).DateTime);
}
