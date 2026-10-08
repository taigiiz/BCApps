namespace Erp.GeneralLedger.Domain.Periods;

/// <summary>Status of an accounting period or fiscal year (D-D3).</summary>
internal enum PeriodStatus
{
    Open = 0,
    Closed = 1,
    Locked = 2,
}
