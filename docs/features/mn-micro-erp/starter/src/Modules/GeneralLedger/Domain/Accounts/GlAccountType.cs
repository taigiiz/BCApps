namespace Erp.GeneralLedger.Domain.Accounts;

/// <summary>BC G/L Account Type (D-D1); only <see cref="Posting"/> accounts take entries.</summary>
internal enum GlAccountType
{
    Posting = 0,
    Heading = 1,
    BeginTotal = 2,
    EndTotal = 3,
    Total = 4,
}
