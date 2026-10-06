using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Operations;

namespace Erp.Analyzers;

/// <summary>
/// ERP0001: double / float / Half must not appear in money code: no declarations, locals, casts, literals or
/// implicit conversions. Amounts, quantities, prices and rates are System.Decimal (18-dev-setup.md section 4).
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class FloatingPointAnalyzer : DiagnosticAnalyzer
{
    public const string DiagnosticId = "ERP0001";

    private static readonly DiagnosticDescriptor _rule = new(
        DiagnosticId,
        title: "Binary floating point is banned in money code",
        messageFormat: "'{0}' is binary floating point; use System.Decimal for amounts, quantities, prices and rates",
        category: "Money",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Money is System.Decimal end to end (C#, numeric in PostgreSQL, string in JSON). See 18-dev-setup.md section 4.");

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(_rule);

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeTypeSyntax, SyntaxKind.PredefinedType, SyntaxKind.IdentifierName, SyntaxKind.QualifiedName);
        context.RegisterOperationAction(AnalyzeLiteral, OperationKind.Literal);
        context.RegisterOperationAction(AnalyzeConversion, OperationKind.Conversion);
    }

    private static bool IsFloatingPoint(ITypeSymbol? type) =>
        type is not null
        && (type.SpecialType is SpecialType.System_Double or SpecialType.System_Single
            || (type.Name == "Half" && type.ContainingNamespace?.ToDisplayString() == "System"));

    private static void AnalyzeTypeSyntax(SyntaxNodeAnalysisContext context)
    {
        // `System.Double` is reported once, at the outer QualifiedName.
        if (context.Node.Parent is QualifiedNameSyntax)
        {
            return;
        }

        ITypeSymbol? type = context.SemanticModel.GetSymbolInfo(context.Node, context.CancellationToken).Symbol as ITypeSymbol;
        if (IsFloatingPoint(type))
        {
            context.ReportDiagnostic(Diagnostic.Create(_rule, context.Node.GetLocation(), type!.ToDisplayString()));
        }
    }

    private static void AnalyzeLiteral(OperationAnalysisContext context)
    {
        if (IsFloatingPoint(context.Operation.Type))
        {
            context.ReportDiagnostic(Diagnostic.Create(_rule, context.Operation.Syntax.GetLocation(), context.Operation.Type!.ToDisplayString()));
        }
    }

    private static void AnalyzeConversion(OperationAnalysisContext context)
    {
        IConversionOperation conversion = (IConversionOperation)context.Operation;
        ITypeSymbol? offending = IsFloatingPoint(conversion.Type) ? conversion.Type
            : IsFloatingPoint(conversion.Operand.Type) ? conversion.Operand.Type
            : null;
        if (offending is not null)
        {
            context.ReportDiagnostic(Diagnostic.Create(_rule, conversion.Syntax.GetLocation(), offending.ToDisplayString()));
        }
    }
}
