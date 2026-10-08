using System.Globalization;
using Erp.BuildingBlocks.Domain.Monetary;
using Erp.BuildingBlocks.Domain.Results;

namespace Erp.GeneralLedger.Domain.Posting;

/// <summary>
/// Voucher invariants checked in memory before any write (BR-PST-05, -22, -24; D-C5): at least two non-zero lines, every amount
/// non-zero and rounded to the company precision, Σ amount = 0 exactly (no tolerance, no round-off plug: ADR-0006 §5).
/// The DB re-checks the balance at COMMIT (trg_gl_entry_balanced, ERB01).
/// </summary>
internal static class VoucherBalanceRule
{
    public static IReadOnlyList<Error> Check(string voucherNo, IReadOnlyList<VoucherLine> lines, decimal precision)
    {
        ArgumentNullException.ThrowIfNull(lines);
        List<Error> errors = [];
        if (lines.Count(l => l.Amount != 0m) < 2)
        {
            errors.Add(new Error(GlErrorCodes.VoucherEmpty, $"Voucher {voucherNo} needs at least two non-zero lines.") { Details = Detail(voucherNo) });
        }

        foreach (VoucherLine line in lines)
        {
            if (line.Amount == 0m)
            {
                errors.Add(new Error(GlErrorCodes.LineAmountZero, $"Line {line.Key} of voucher {voucherNo} has a zero amount.") { Details = Detail(voucherNo) });
            }
            else if (!MoneyMath.IsRounded(line.Amount, precision))
            {
                errors.Add(new Error(GlErrorCodes.AmountNotRounded, $"Line {line.Key} of voucher {voucherNo} is not rounded to {Text(precision)}.")
                {
                    Details = new Dictionary<string, string>(StringComparer.Ordinal)
                    {
                        ["documentNo"] = voucherNo,
                        ["amount"] = Text(line.Amount),
                        ["precision"] = Text(precision),
                    },
                });
            }
        }

        foreach (IGrouping<string, VoucherLine> duplicate in lines.GroupBy(l => l.Key, StringComparer.Ordinal).Where(g => g.Count() > 1))
        {
            errors.Add(new Error(GlErrorCodes.DuplicateLineKey, $"Line key {duplicate.Key} is used more than once.") { Details = Detail(voucherNo) });
        }

        decimal debit = lines.Where(l => l.Amount > 0m).Sum(l => l.Amount);
        decimal credit = -lines.Where(l => l.Amount < 0m).Sum(l => l.Amount);
        decimal difference = debit - credit;
        if (difference != 0m)
        {
            errors.Add(new Error(
                GlErrorCodes.VoucherUnbalanced,
                $"Voucher {voucherNo} is not balanced: debit {Text(debit)}, credit {Text(credit)}, difference {Text(difference)}.")
            {
                Details = new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["documentNo"] = voucherNo,
                    ["debit"] = Text(debit),
                    ["credit"] = Text(credit),
                    ["difference"] = Text(difference),
                },
            });
        }

        return errors;
    }

    private static Dictionary<string, string> Detail(string voucherNo) => new(StringComparer.Ordinal) { ["documentNo"] = voucherNo };

    private static string Text(decimal value) => value.ToString("0.00##", CultureInfo.InvariantCulture);
}
