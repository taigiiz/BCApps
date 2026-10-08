using System.Text.Json;
using Erp.BuildingBlocks.Api.Json;

namespace Erp.Tests.Unit.BuildingBlocks;

public sealed class DecimalStringJsonConverterTests
{
    private static readonly JsonSerializerOptions _options = new() { Converters = { new DecimalStringJsonConverter() } };

    [Theory]
    [InlineData("\"12345.67\"", "12345.67")]
    [InlineData("\"-15.25\"", "-15.25")]
    [InlineData("\"0\"", "0")]
    public void Read_InvariantString(string json, string expected) =>
        JsonSerializer.Deserialize<decimal>(json, _options).ShouldBe(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture));

    [Theory]
    [InlineData("12345.67")]
    [InlineData("\"1e5\"")]
    [InlineData("\"1,000.00\"")]
    [InlineData("\"01.5\"")]
    public void Read_NumbersAndNonPlainStrings_AreRejected(string json) =>
        Should.Throw<JsonException>(() => JsonSerializer.Deserialize<decimal>(json, _options))
            .Message.ShouldStartWith(DecimalStringJsonConverter.MustBeStringCode);

    [Theory]
    [InlineData("12345.60", "\"12345.6\"")]
    [InlineData("-15.25", "\"-15.25\"")]
    [InlineData("1500000.00", "\"1500000\"")]
    [InlineData("0.00", "\"0\"")]
    public void Write_InvariantWithoutTrailingZeros(string value, string expected) =>
        JsonSerializer.Serialize(decimal.Parse(value, System.Globalization.CultureInfo.InvariantCulture), _options).ShouldBe(expected);
}
