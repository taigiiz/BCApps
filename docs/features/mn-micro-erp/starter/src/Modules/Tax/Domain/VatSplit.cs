namespace Erp.Tax.Domain;

/// <summary>A gross or net amount split into VAT base and VAT (Base + Vat = gross).</summary>
internal readonly record struct VatSplit(decimal Base, decimal Vat);
