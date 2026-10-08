using Microsoft.AspNetCore.Diagnostics.HealthChecks;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.Services.AddHealthChecks();

WebApplication app = builder.Build();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });

await app.RunAsync();
