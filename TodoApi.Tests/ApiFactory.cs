using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using TodoApi.Contracts;

namespace TodoApi.Tests;

/// <summary>
/// Boots the real API against a real PostgreSQL database that exists only for one test class.
/// The app applies its own migrations on startup, so every run also tests the migrations.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    public static string ServerConnectionString =>
        Environment.GetEnvironmentVariable("TEST_DATABASE")
        ?? "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=postgres";

    private readonly string _databaseName = $"tasks_test_{Guid.NewGuid():N}";

    public FakeClock Clock { get; } = new();

    protected virtual string EnvironmentName => "Test";

    protected virtual Dictionary<string, string> Settings => new();

    public string ConnectionString => new NpgsqlConnectionStringBuilder(ServerConnectionString)
    {
        Database = _databaseName,
        // Each test class has its own database, so keep its pool small.
        MaxPoolSize = 20,
    }.ConnectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        CreateDatabase();

        builder.UseEnvironment(EnvironmentName);
        // UseSetting is visible to Program.cs while it is still configuring services.
        builder.UseSetting("ConnectionStrings:DefaultConnection", ConnectionString);
        builder.UseSetting("ConnectionStrings:TestConnection", ConnectionString);
        builder.UseSetting("Jwt:Key", "integration-test-signing-key-that-is-long-enough-0123456789");
        builder.UseSetting("FrontendUrl", "https://frontend.test");
        builder.UseSetting("Auth:DevLogin", "true");
        builder.UseSetting("RateLimits:ApiPerMinute", "100000");
        builder.UseSetting("RateLimits:AuthPerMinute", "100000");
        foreach (var (key, value) in Settings) builder.UseSetting(key, value);

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }

    /// <summary>Signs in through the dev-login endpoint and returns a client that sends the token.</summary>
    public async Task<(HttpClient Client, TokenResponse Tokens)> SignInAsync(string? email = null)
    {
        email ??= $"user-{Guid.NewGuid():N}@example.com";
        var client = CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var response = await client.PostAsJsonAsync("/api/auth/dev-login", new { email, name = "Test User" });
        response.EnsureSuccessStatusCode();
        var tokens = (await response.Content.ReadFromJsonAsync<TokenResponse>())!;

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return (client, tokens);
    }

    public HttpClient CreateAnonymousClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private void CreateDatabase()
    {
        using var connection = new NpgsqlConnection(ServerConnectionString);
        connection.Open();
        using var command = new NpgsqlCommand($"CREATE DATABASE \"{_databaseName}\"", connection);
        command.ExecuteNonQuery();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;

        NpgsqlConnection.ClearAllPools();
        using var connection = new NpgsqlConnection(ServerConnectionString);
        connection.Open();
        using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", connection);
        command.ExecuteNonQuery();
    }
}

/// <summary>A clock the tests can move forward.</summary>
public class FakeClock : TimeProvider
{
    private TimeSpan _offset = TimeSpan.Zero;

    public override DateTimeOffset GetUtcNow() => DateTimeOffset.UtcNow + _offset;

    public void Advance(TimeSpan by) => _offset += by;
}
