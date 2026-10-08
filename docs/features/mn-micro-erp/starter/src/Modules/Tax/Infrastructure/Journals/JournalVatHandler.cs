using Erp.BuildingBlocks.Domain.Monetary;
using Erp.BuildingBlocks.Domain.Results;
using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Contracts.Journals;
using Erp.GeneralLedger.Contracts.Posting;
using Erp.Tax.Contracts;
using Erp.Tax.Domain;
using Npgsql;

namespace Erp.Tax.Infrastructure.Journals;

/// <summary>
/// Gross-method VAT of a journal G/L side (05-posting-engine.md §6.4, BR-PST-38): base line (user account, carries vat_amount),
/// VAT line (setup account, system-derived) and the VAT ledger line linked to the BASE entry (R-VAT-20).
/// Sprint 0 scope: NORMAL calculation, fully deductible; REVERSE_CHARGE, FULL_VAT and non-deductible VAT return explicit errors.
/// </summary>
internal sealed class JournalVatHandler(ITenantSession session) : IJournalVatHandler
{
    private const string FolderNamespace = "Erp.Tax.Infrastructure.Journals";

    public async Task<Result<JournalVatExpansion>> ExpandAsync(JournalVatSide side, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(side);
        bool isSale = side.GenPostingType == "SALE";
        if (!isSale && side.GenPostingType != "PURCHASE")
        {
            return Result.Failure<JournalVatExpansion>(new Error(TaxErrorCodes.GenPostingTypeInvalid, "VAT needs gen. posting type SALE or PURCHASE."));
        }

        await using NpgsqlCommand command = session.CreateCommand(TaxSql.Load(FolderNamespace, "read_vat_posting_setup"));
        command.Parameters.AddWithValue("company_id", session.Scope.CompanyId);
        command.Parameters.AddWithValue("vat_bus", side.VatBusPostingGroup);
        command.Parameters.AddWithValue("vat_prod", side.VatProdPostingGroup);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return Result.Failure<JournalVatExpansion>(new Error(
                TaxErrorCodes.VatPostingSetupMissing,
                $"No VAT posting setup for {side.VatBusPostingGroup} x {side.VatProdPostingGroup}."));
        }

        string calculationType = reader.GetString(0);
        string vatIdentifier = reader.GetString(1);
        string vatCategory = reader.GetString(2);
        decimal vatPercent = reader.GetDecimal(3);
        decimal nonDeductiblePercent = reader.GetDecimal(4);
        string ebarimtTaxType = reader.GetString(5);
        bool blocked = reader.GetBoolean(6);
        Guid? vatAccountId = isSale ? reader.GetGuidOrNull(7) : reader.GetGuidOrNull(8);
        decimal precision = reader.GetDecimal(9);
        RoundingDirection direction = VatCalculator.ParseRoundingType(reader.GetString(10));
        await reader.CloseAsync();

        string combination = side.VatBusPostingGroup + " x " + side.VatProdPostingGroup;
        if (blocked)
        {
            return Result.Failure<JournalVatExpansion>(new Error(TaxErrorCodes.VatPostingSetupBlocked, $"VAT posting setup {combination} is blocked."));
        }

        if (calculationType != "NORMAL")
        {
            return Result.Failure<JournalVatExpansion>(new Error(
                TaxErrorCodes.VatCalculationTypeNotSupported,
                $"VAT calculation type {calculationType} is not implemented in the Sprint 0 skeleton."));
        }

        if (!isSale && nonDeductiblePercent != 0m)
        {
            return Result.Failure<JournalVatExpansion>(new Error(
                TaxErrorCodes.NonDeductibleVatNotSupported,
                "Non-deductible input VAT (D-E5) is not implemented in the Sprint 0 skeleton."));
        }

        VatSplit split = VatCalculator.SplitGross(side.GrossAmount, vatPercent, precision, direction);
        if (split.Vat != 0m && vatAccountId is null)
        {
            return Result.Failure<JournalVatExpansion>(new Error(TaxErrorCodes.VatAccountMissing, $"VAT posting setup {combination} has no VAT account."));
        }

        PostingGroupSnapshot groups = new(side.GenBusPostingGroup, side.GenProdPostingGroup, side.VatBusPostingGroup, side.VatProdPostingGroup);
        string baseKey = side.LineKeyPrefix + "/BASE";
        List<GlPostingLine> glLines =
        [
            new GlPostingLine
            {
                Key = baseKey,
                GlAccountId = side.GlAccountId,
                Amount = split.Base,
                VatAmount = split.Vat,
                Origin = LineOrigin.UserEntered,
                GenPostingType = side.GenPostingType,
                Groups = groups,
                VatDate = side.VatDate,
                Description = side.Description,
            },
        ];
        if (split.Vat != 0m)
        {
            glLines.Add(new GlPostingLine
            {
                Key = side.LineKeyPrefix + "/VAT",
                GlAccountId = vatAccountId!.Value,
                Amount = split.Vat,
                Origin = LineOrigin.SystemDerived,
                GenPostingType = side.GenPostingType,
                Groups = groups,
                VatDate = side.VatDate,
                Description = side.Description,
            });
        }

        VatLedgerLine vatLine = new()
        {
            GlLineKeys = [baseKey],
            EntryType = side.GenPostingType,
            Base = split.Base,
            Amount = split.Vat,
            CalculationType = calculationType,
            VatPercent = vatPercent,
            VatIdentifier = vatIdentifier,
            VatCategory = vatCategory,
            EbarimtTaxType = ebarimtTaxType,
            VatDate = side.VatDate,
            VatBusPostingGroup = side.VatBusPostingGroup,
            VatProdPostingGroup = side.VatProdPostingGroup,
            GenBusPostingGroup = side.GenBusPostingGroup,
            GenProdPostingGroup = side.GenProdPostingGroup,
            SupplierEbarimtId = side.SupplierEbarimtId,
        };
        return Result.Success(new JournalVatExpansion(glLines, [vatLine]));
    }
}
