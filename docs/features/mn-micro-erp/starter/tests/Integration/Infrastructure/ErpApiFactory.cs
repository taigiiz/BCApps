using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Erp.Tests.Integration.Infrastructure;

/// <summary>The real Erp.Api host on an in-memory server, bound to the test database with session role app_user.</summary>
public sealed class ErpApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Database:ConnectionString", connectionString);
        // The test login is a superuser (it creates the database); switch to app_user so FORCE RLS and the grants apply.
        builder.UseSetting("Database:SessionRole", "app_user");
        builder.UseSetting("Database:LockTimeout", "10s");
    }
}
