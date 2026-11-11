using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using TodoApi.Contracts;
using TodoApi.Data;
using TodoApi.Services;

namespace TodoApi.Tests;

public class AccountAndPlatformTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AccountAndPlatformTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Deleting_an_account_removes_everything_and_ends_the_session()
    {
        var (client, tokens) = await _factory.SignInAsync();
        var (other, _) = await _factory.SignInAsync();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var request = new SyncRequest
        {
            Tasks = [new TaskDto { Id = Guid.NewGuid(), Title = "Mine", EstimatedMinutes = 25, CreatedAt = now, UpdatedAt = now }],
            Sessions = [new SessionDto { Id = Guid.NewGuid(), StartedAt = now, Seconds = 60 }],
        };
        await client.PostAsJsonAsync("/api/sync", request);
        await other.PostAsJsonAsync("/api/sync", request);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/account")).StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TodoContext>();
            Assert.False(await db.Users.AnyAsync(u => u.Id == tokens.User.Id));
            Assert.False(await db.TodoTasks.AnyAsync(t => t.UserId == tokens.User.Id));
            Assert.False(await db.FocusSessions.AnyAsync(s => s.UserId == tokens.User.Id));
            Assert.False(await db.RefreshTokens.AnyAsync(t => t.UserId == tokens.User.Id));

            // The other account is untouched.
            Assert.Equal(1, await db.TodoTasks.CountAsync());
            Assert.Equal(1, await db.FocusSessions.CountAsync());
        }

        // The access token is still unexpired, but the account behind it is gone.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/sync", new SyncRequest())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(tokens.RefreshToken))).StatusCode);
    }

    [Fact]
    public async Task Deleting_an_account_requires_a_token()
    {
        var response = await _factory.CreateAnonymousClient().DeleteAsync("/api/account");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("/healthz")]
    [InlineData("/api/diagnostic/status")]
    [InlineData("/api/diagnostic/health")]
    [InlineData("/api/diagnostic/readiness")]
    [InlineData("/api/diagnostic/serviceinfo")]
    public async Task Health_endpoints_answer_without_a_token(string path)
    {
        var response = await _factory.CreateAnonymousClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Responses_carry_security_headers_and_are_never_cached()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/healthz");

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        Assert.True(response.Headers.Contains("Strict-Transport-Security"));
    }

    [Theory]
    [InlineData("https://task-app-frontend-alpha.vercel.app", true)]
    [InlineData("https://frontend.test", true)]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://evil.example", false)]
    public async Task Only_known_origins_pass_the_cors_preflight(string origin, bool allowed)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/sync");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");

        var response = await _factory.CreateAnonymousClient().SendAsync(request);

        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public void Request_bodies_are_capped()
    {
        // TestServer does not enforce Kestrel's limit, so check the configured value.
        var options = _factory.Services
            .GetRequiredService<Microsoft.Extensions.Options.IOptions<Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServerOptions>>();
        Assert.Equal(1_000_000, options.Value.Limits.MaxRequestBodySize);
    }

    [Theory]
    [InlineData("Host=db;Database=app;Username=u;Password=p", "Host=db;Database=app;Username=u;Password=p")]
    [InlineData("postgres://user:p%40ss@db.example.com:6543/tasks?sslmode=require",
        "Host=db.example.com;Port=6543;Database=tasks;Username=user;Password=p@ss;SSL Mode=Require")]
    [InlineData("postgresql://user:secret@ep-cool-name.aws.neon.tech/neondb",
        "Host=ep-cool-name.aws.neon.tech;Port=5432;Database=neondb;Username=user;Password=secret")]
    public void Connection_urls_are_converted_to_connection_strings(string input, string expected)
    {
        Assert.Equal(expected, DatabaseConfig.Normalize(input));
    }
}

/// <summary>
/// Production already has tasks in the old shape. This runs the old schema, adds rows the way
/// the old API did, then applies the new migration and checks nothing is lost.
/// </summary>
public class MigrationTests : IDisposable
{
    private readonly string _databaseName = $"tasks_migration_{Guid.NewGuid():N}";
    private readonly string _connectionString;

    public MigrationTests()
    {
        using var connection = new NpgsqlConnection(ApiFactory.ServerConnectionString);
        connection.Open();
        new NpgsqlCommand($"CREATE DATABASE \"{_databaseName}\"", connection).ExecuteNonQuery();
        _connectionString = new NpgsqlConnectionStringBuilder(ApiFactory.ServerConnectionString) { Database = _databaseName }.ConnectionString;
    }

    [Fact]
    public async Task Existing_tasks_survive_the_upgrade_and_reach_their_owner_on_first_sync()
    {
        var options = new DbContextOptionsBuilder<TodoContext>().UseNpgsql(_connectionString).Options;
        await using var db = new TodoContext(options);
        var migrator = db.GetInfrastructure().GetRequiredService<IMigrator>();

        await migrator.MigrateAsync("AddIdentityAndUsers");
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO "AspNetUsers" ("Id", "UserName", "NormalizedUserName", "Email", "NormalizedEmail", "EmailConfirmed",
                "PhoneNumberConfirmed", "TwoFactorEnabled", "LockoutEnabled", "AccessFailedCount")
            VALUES ('user-1', 'old@example.com', 'OLD@EXAMPLE.COM', 'old@example.com', 'OLD@EXAMPLE.COM', true, false, false, false, 0);

            INSERT INTO "TodoTasks" ("Title", "Description", "IsCompleted", "Category", "CreatedDate", "EstimatedMinutes", "UserId")
            VALUES ('Learn React', 'Hooks', false, 'React', '2026-05-01T10:00:00.123456Z', 30, 'user-1'),
                   ('Learn C#', '', true, 'C#', '2026-05-02T10:00:00Z', 60, 'user-1'),
                   ('Spam from before sign-in existed', '', false, '', '2026-01-01T00:00:00Z', 25, '');
            """);

        await migrator.MigrateAsync();

        var tasks = await db.TodoTasks.OrderBy(t => t.Id).ToListAsync();
        Assert.Equal(3, tasks.Count);
        Assert.Equal(3, tasks.Select(t => t.ClientId).Distinct().Count());
        Assert.All(tasks, t => Assert.NotEqual(Guid.Empty, t.ClientId));
        Assert.All(tasks, t => Assert.Equal(1, t.Version));
        Assert.Equal([1.0, 2.0, 3.0], tasks.Select(t => t.SortOrder));

        Assert.Equal("Learn React", tasks[0].Title);
        Assert.Null(tasks[0].CompletedAt);
        Assert.Equal(0, tasks[0].UpdatedAt.Ticks % TimeSpan.TicksPerMillisecond);
        Assert.Equal(tasks[1].CreatedDate, tasks[1].CompletedAt);

        Assert.Equal(1, (await db.Users.SingleAsync()).SyncVersion);

        // The owner's first sync from a brand new device returns their two tasks.
        var sync = new SyncService(db, TimeProvider.System);
        var response = await sync.SyncAsync("user-1", new SyncRequest { Cursor = 0 });
        Assert.Equal(["Learn C#", "Learn React"], response!.Tasks.Select(t => t.Title).Order());
        Assert.Equal(1, response.Cursor);
    }

    public void Dispose()
    {
        NpgsqlConnection.ClearAllPools();
        using var connection = new NpgsqlConnection(ApiFactory.ServerConnectionString);
        connection.Open();
        new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", connection).ExecuteNonQuery();
    }
}
