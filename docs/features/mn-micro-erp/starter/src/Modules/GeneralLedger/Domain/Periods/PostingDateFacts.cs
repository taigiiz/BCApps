using System.Globalization;

namespace Erp.GeneralLedger.Domain.Periods;

/// <summary>Period, fiscal year and company posting window of one posting date (read under the lock).</summary>
internal sealed record PostingDateFacts(
    DateOnly PostingDate,
    PeriodStatus? PeriodStatus,
    PeriodStatus? FiscalYearStatus,
    DateOnly? AllowPostingFrom,
    DateOnly? AllowPostingTo)
{
    public static PeriodStatus? ParseStatus(string? value) => value switch
    {
        null => null,
        "OPEN" => Periods.PeriodStatus.Open,
        "CLOSED" => Periods.PeriodStatus.Closed,
        "LOCKED" => Periods.PeriodStatus.Locked,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown period status."),
    };

    public string DateText => PostingDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
