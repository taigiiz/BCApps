using Npgsql;

namespace Erp.Tests.Integration.Infrastructure;

/// <summary>
/// Reads ledgers of one company as the bootstrap role (assertions only; the application itself always runs as app_user under RLS).
/// </summary>
public sealed class LedgerReader(string connectionString, Guid companyId)
{
    public Task<List<GlEntryRow>> GlEntriesAsync() => QueryAsync(
        """
        SELECT e.entry_no, e.transaction_no, e.gl_register_no, a.no, e.amount, e.debit_amount, e.credit_amount, e.vat_amount, e.document_no,
               e.posting_date, e.source_code, e.system_created, e.reversed, e.reversed_by_entry_no, e.reversed_entry_no
          FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id
         WHERE e.company_id = @c ORDER BY e.entry_no
        """,
        r => new GlEntryRow(r.GetInt64(0), r.GetInt64(1), r.GetInt64(2), r.GetString(3), r.GetDecimal(4), r.GetDecimal(5), r.GetDecimal(6), r.GetDecimal(7),
            r.GetString(8), r.GetFieldValue<DateOnly>(9), r.GetString(10), r.GetBoolean(11), r.GetBoolean(12), Long(r, 13), Long(r, 14)));

    public Task<List<GlTransactionRow>> TransactionsAsync() => QueryAsync(
        """
        SELECT transaction_no, gl_register_no, document_no, posting_date, source_code, reverses_transaction_no, reversed_by_transaction_no
          FROM gl.gl_transaction WHERE company_id = @c ORDER BY transaction_no
        """,
        r => new GlTransactionRow(r.GetInt64(0), r.GetInt64(1), r.GetString(2), r.GetFieldValue<DateOnly>(3), r.GetString(4), Long(r, 5), Long(r, 6)));

    public Task<List<GlRegisterRow>> RegistersAsync() => QueryAsync(
        """
        SELECT no, from_entry_no, to_entry_no, from_vat_entry_no, to_vat_entry_no, source_code, reversed
          FROM gl.gl_register WHERE company_id = @c ORDER BY no
        """,
        r => new GlRegisterRow(r.GetInt64(0), Long(r, 1), Long(r, 2), Long(r, 3), Long(r, 4), r.GetString(5), r.GetBoolean(6)));

    public Task<List<VatEntryRow>> VatEntriesAsync() => QueryAsync(
        """
        SELECT entry_no, entry_type, base, amount, vat_percent, vat_category, vat_calculation_type, ebarimt_tax_type, vat_date, posting_date,
               transaction_no, gl_entry_no, reversed, reversed_entry_no, reversed_by_entry_no
          FROM tax.vat_entry WHERE company_id = @c ORDER BY entry_no
        """,
        r => new VatEntryRow(r.GetInt64(0), r.GetString(1), r.GetDecimal(2), r.GetDecimal(3), r.GetDecimal(4), Text(r, 5), r.GetString(6), Text(r, 7),
            r.GetFieldValue<DateOnly>(8), r.GetFieldValue<DateOnly>(9), r.GetInt64(10), Long(r, 11), r.GetBoolean(12), Long(r, 13), Long(r, 14)));

    /// <summary>Last legal number drawn from a series in a year (platform.number_allocation), or null.</summary>
    public async Task<string?> LastDocumentNoAsync(string series, int year)
    {
        List<string> rows = await QueryAsync(
            """
            SELECT a.document_no FROM platform.number_allocation a
              JOIN platform.number_series_line l ON l.id = a.number_series_line_id
              JOIN platform.number_series s ON s.id = l.number_series_id
             WHERE a.company_id = @c AND s.code = @series AND extract(year FROM l.starting_date) = @year
             ORDER BY a.no DESC LIMIT 1
            """,
            r => r.GetString(0),
            ("series", series),
            ("year", year));
        return rows.Count == 0 ? null : rows[0];
    }

    /// <summary>All legal numbers drawn by the company, per series line in drawing order.</summary>
    public Task<List<(Guid Line, long No)>> AllocationsAsync() => QueryAsync(
        "SELECT number_series_line_id, no FROM platform.number_allocation WHERE company_id = @c ORDER BY number_series_line_id, no",
        r => (r.GetGuid(0), r.GetInt64(1)));

    public Task<List<(string Ledger, long LastNo)>> CountersAsync() => QueryAsync(
        "SELECT ledger, last_no FROM platform.ledger_counter WHERE company_id = @c ORDER BY ledger",
        r => (r.GetString(0), r.GetInt64(1)));

    public async Task<long> CountAsync(string table)
    {
        List<long> rows = await QueryAsync($"SELECT count(*) FROM {table} WHERE company_id = @c", r => r.GetInt64(0));
        return rows[0];
    }

    public async Task<decimal> BalanceAsync(string account, DateOnly asOf)
    {
        List<decimal> rows = await QueryAsync(
            """
            SELECT coalesce(sum(e.amount), 0) FROM gl.gl_entry e JOIN gl.gl_account a ON a.id = e.gl_account_id
             WHERE e.company_id = @c AND a.no = @account AND e.posting_date <= @as_of
            """,
            r => r.GetDecimal(0),
            ("account", account),
            ("as_of", asOf));
        return rows[0];
    }

    public async Task<List<T>> QueryAsync<T>(string sql, Func<NpgsqlDataReader, T> map, params (string Name, object Value)[] parameters)
    {
        ArgumentNullException.ThrowIfNull(map);
        await using NpgsqlConnection connection = new(connectionString);
        await connection.OpenAsync();
        await using NpgsqlCommand command = new(sql, connection);
        command.Parameters.AddWithValue("c", companyId);
        foreach ((string name, object value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync();
        List<T> rows = [];
        while (await reader.ReadAsync())
        {
            rows.Add(map(reader));
        }

        return rows;
    }

    private static long? Long(NpgsqlDataReader r, int i) => r.IsDBNull(i) ? null : r.GetInt64(i);

    private static string? Text(NpgsqlDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);
}
