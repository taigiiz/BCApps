using Erp.Migrator;
using Npgsql;

[assembly: AssemblyFixture(typeof(Erp.Tests.Integration.Infrastructure.PostgresFixture))]

namespace Erp.Tests.Integration.Infrastructure;

/// <summary>
/// One fresh database per test run: DROP/CREATE, <c>Erp.Migrator migrate + seed</c> (the canonical db/ package), then every test
/// provisions its own company with <c>platform.fn_provision_company_mn</c> (16-test-strategy.md §4.1, TST-DET-07: rates as of 2026-01-01).
/// Also hosts the API (WebApplicationFactory) bound to the database with session role <c>app_user</c> (RLS applies).
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private ErpApiFactory? _factory;

    public string ConnectionString { get; } = TestDatabase.ConnectionString;

    public ErpApiFactory Api => _factory ?? throw new InvalidOperationException("Fixture not initialized.");

    public async ValueTask InitializeAsync()
    {
        await using (NpgsqlConnection admin = new(TestDatabase.MaintenanceConnectionString))
        {
            await admin.OpenAsync();
            string db = TestDatabase.DatabaseName;
            await using NpgsqlCommand drop = new($"DROP DATABASE IF EXISTS \"{db}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
            await using NpgsqlCommand create = new($"CREATE DATABASE \"{db}\"", admin);
            await create.ExecuteNonQueryAsync();
        }

        MigrationRunner runner = new(ConnectionString, TextWriter.Null);
        await runner.MigrateAsync(CancellationToken.None);
        await runner.SeedAsync(CancellationToken.None);
        await runner.VerifyAsync(CancellationToken.None);
        _factory = new ErpApiFactory(ConnectionString);
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }

        NpgsqlConnection.ClearAllPools();
    }

    /// <summary>Creates tenant + company (+ setup, user, membership) as the bootstrap role, then provisions as app_user.</summary>
    public async Task<CompanyHandle> ProvisionCompanyAsync(string name, CompanyProfile? profile = null)
    {
        profile ??= new CompanyProfile();
        CompanyHandle handle = new(Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), name);
        await using NpgsqlConnection connection = new(ConnectionString);
        await connection.OpenAsync();
        await using (NpgsqlTransaction fixtures = await connection.BeginTransactionAsync())
        {
            await using NpgsqlCommand insert = new(
                """
                INSERT INTO platform.tenant (id, name, status) VALUES (@tenant, @name, 'ACTIVE');
                INSERT INTO platform.company (id, tenant_id, name, status) VALUES (@company, @tenant, @name, 'PROVISIONING');
                INSERT INTO platform.company_setup (tenant_id, company_id, legal_name, tin, vat_registered, vat_registered_from, district_code,
                                                    allow_posting_from, allow_posting_to)
                VALUES (@tenant, @company, @name, @tin, @vat, CASE WHEN @vat THEN DATE '2020-01-01' END, '2501', @from, @to);
                INSERT INTO platform.app_user (id, email, display_name) VALUES (@user, @email, 'Test accountant');
                INSERT INTO platform.tenant_membership (tenant_id, user_id) VALUES (@tenant, @user);
                """,
                connection,
                fixtures);
            insert.Parameters.AddWithValue("tenant", handle.TenantId);
            insert.Parameters.AddWithValue("company", handle.CompanyId);
            insert.Parameters.AddWithValue("user", handle.UserId);
            insert.Parameters.AddWithValue("name", name);
            insert.Parameters.AddWithValue("email", "acc-" + handle.UserId.ToString("N", System.Globalization.CultureInfo.InvariantCulture) + "@example.mn");
            insert.Parameters.AddWithValue("tin", NpgsqlTypes.NpgsqlDbType.Text, profile.VatRegistered ? profile.Tin : DBNull.Value);
            insert.Parameters.AddWithValue("vat", profile.VatRegistered);
            insert.Parameters.AddWithValue("from", NpgsqlTypes.NpgsqlDbType.Date, (object?)profile.AllowPostingFrom ?? DBNull.Value);
            insert.Parameters.AddWithValue("to", NpgsqlTypes.NpgsqlDbType.Date, (object?)profile.AllowPostingTo ?? DBNull.Value);
            await insert.ExecuteNonQueryAsync();
            await fixtures.CommitAsync();
        }

        await using NpgsqlTransaction provisioning = await connection.BeginTransactionAsync();
        await using NpgsqlCommand provision = new(
            """
            SET LOCAL ROLE app_user;
            SELECT platform.fn_set_context(@tenant, @company, @user, 'test-provision');
            SELECT platform.fn_provision_company_mn(@tenant, @company, @year, make_date(@year, 1, 1));
            """,
            connection,
            provisioning);
        provision.Parameters.AddWithValue("tenant", handle.TenantId);
        provision.Parameters.AddWithValue("company", handle.CompanyId);
        provision.Parameters.AddWithValue("user", handle.UserId);
        provision.Parameters.AddWithValue("year", profile.FirstFiscalYear);
        await provision.ExecuteNonQueryAsync();
        await provisioning.CommitAsync();
        return handle;
    }

    /// <summary>Runs SQL as app_user inside the company context (RLS applies), e.g. closing a period.</summary>
    public async Task ExecuteAsAppUserAsync(CompanyHandle company, string sql, params (string Name, object Value)[] parameters)
    {
        ArgumentNullException.ThrowIfNull(company);
        await using NpgsqlConnection connection = new(ConnectionString);
        await connection.OpenAsync();
        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync();
        await using (NpgsqlCommand context = new("SET LOCAL ROLE app_user; SELECT platform.fn_set_context(@t, @c, @u, 'test-setup');", connection, transaction))
        {
            context.Parameters.AddWithValue("t", company.TenantId);
            context.Parameters.AddWithValue("c", company.CompanyId);
            context.Parameters.AddWithValue("u", company.UserId);
            await context.ExecuteNonQueryAsync();
        }

        await using (NpgsqlCommand command = new(sql, connection, transaction))
        {
            foreach ((string name, object value) in parameters)
            {
                command.Parameters.AddWithValue(name, value);
            }

            await command.ExecuteNonQueryAsync();
        }

        await transaction.CommitAsync();
    }
}
