using Erp.Api.Health;
using Erp.BuildingBlocks.Api.Json;
using Erp.BuildingBlocks.Infrastructure;
using Erp.BuildingBlocks.Infrastructure.Persistence;
using Erp.GeneralLedger.Api;
using Erp.GeneralLedger.Infrastructure;
using Erp.Tax.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new DecimalStringJsonConverter()));
builder.Services.AddErpInfrastructure(options =>
{
    builder.Configuration.GetSection(DatabaseOptions.SectionName).Bind(options);
    if (string.IsNullOrWhiteSpace(options.ConnectionString))
    {
        options.ConnectionString = builder.Configuration.GetConnectionString("App") ?? string.Empty;
    }
});
builder.Services.AddGeneralLedgerModule();
builder.Services.AddTaxModule();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);

WebApplication app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });
app.MapGeneralLedgerEndpoints();

await app.RunAsync();
