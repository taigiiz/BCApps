using Erp.BuildingBlocks.Domain.Results;

namespace Erp.GeneralLedger.Domain.Periods;

/// <summary>
/// D-D3 posting-date rule, identical to the DB guard <c>gl.fn_assert_posting_date_allowed</c> (ERP01): the date must fall in an OPEN
/// period of an OPEN fiscal year (closing vouchers: not LOCKED) and inside the company window, for every user right.
/// </summary>
internal static class PostingDateRule
{
    public static Error? Check(PostingDateFacts facts, bool isClosing)
    {
        ArgumentNullException.ThrowIfNull(facts);
        Dictionary<string, string> details = new(StringComparer.Ordinal) { ["postingDate"] = facts.DateText };
        if (facts.PeriodStatus is null)
        {
            return new Error(GlErrorCodes.PeriodNotFound, $"There is no accounting period for {facts.DateText}.") { Details = details };
        }

        if (facts.PeriodStatus == PeriodStatus.Locked || facts.FiscalYearStatus == PeriodStatus.Locked)
        {
            return new Error(GlErrorCodes.PeriodLocked, $"The period of {facts.DateText} is locked.") { Details = details };
        }

        if (!isClosing && (facts.PeriodStatus != PeriodStatus.Open || facts.FiscalYearStatus != PeriodStatus.Open))
        {
            return new Error(GlErrorCodes.PeriodClosed, $"The period of {facts.DateText} is closed.") { Details = details };
        }

        if ((facts.AllowPostingFrom is { } from && facts.PostingDate < from) || (facts.AllowPostingTo is { } to && facts.PostingDate > to))
        {
            return new Error(GlErrorCodes.PostingDateOutsideWindow, $"{facts.DateText} is outside the company posting window.") { Details = details };
        }

        return null;
    }
}
