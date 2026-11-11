using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using TodoApi.Contracts;
using TodoApi.Services;

namespace TodoApi.Tests;

public class AuthTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthTests(ApiFactory factory)
    {
        _factory = factory;
    }

    private static Task<HttpResponseMessage> RefreshAsync(HttpClient client, string refreshToken) =>
        client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(refreshToken));

    [Fact]
    public async Task Signing_in_returns_tokens_that_identify_the_user()
    {
        var (client, tokens) = await _factory.SignInAsync("ada@example.com");

        Assert.Equal("ada@example.com", tokens.User.Email);
        Assert.Equal("Test User", tokens.User.Name);
        Assert.True(tokens.AccessTokenExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        var me = await client.GetFromJsonAsync<UserDto>("/api/auth/me");
        Assert.Equal(tokens.User.Id, me!.Id);
    }

    [Fact]
    public async Task Signing_in_twice_with_the_same_email_is_the_same_account()
    {
        var (_, first) = await _factory.SignInAsync("same@example.com");
        var (_, second) = await _factory.SignInAsync("same@example.com");
        Assert.Equal(first.User.Id, second.User.Id);
    }

    [Fact]
    public async Task Me_requires_a_token()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refreshing_returns_a_new_token_pair_that_works()
    {
        var (client, tokens) = await _factory.SignInAsync();

        var response = await RefreshAsync(client, tokens.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var refreshed = (await response.Content.ReadFromJsonAsync<TokenResponse>())!;

        Assert.NotEqual(tokens.RefreshToken, refreshed.RefreshToken);
        Assert.NotEqual(tokens.AccessToken, refreshed.AccessToken);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", refreshed.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);

        // The chain continues from the new token.
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(client, refreshed.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Two_tabs_refreshing_at_once_do_not_sign_the_user_out()
    {
        var (client, tokens) = await _factory.SignInAsync();

        var winner = await RefreshAsync(client, tokens.RefreshToken);
        var loser = await RefreshAsync(client, tokens.RefreshToken);

        Assert.Equal(HttpStatusCode.OK, winner.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, loser.StatusCode);

        // The winner's new token is still good.
        var refreshed = (await winner.Content.ReadFromJsonAsync<TokenResponse>())!;
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(client, refreshed.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Only_one_of_many_simultaneous_refreshes_succeeds()
    {
        var (client, tokens) = await _factory.SignInAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => RefreshAsync(client, tokens.RefreshToken)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Equal(7, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Replaying_an_old_refresh_token_ends_every_session_descended_from_it()
    {
        // Tests that move the clock get their own API so they cannot disturb the others.
        await using var factory = new ApiFactory();
        var (client, tokens) = await factory.SignInAsync();
        var refreshed = (await (await RefreshAsync(client, tokens.RefreshToken)).Content.ReadFromJsonAsync<TokenResponse>())!;

        factory.Clock.Advance(TokenService.ReuseGracePeriod + TimeSpan.FromSeconds(5));

        // The stolen (old) token is replayed after the grace period.
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(client, tokens.RefreshToken)).StatusCode);

        // The legitimate device's newer token is revoked too.
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(client, refreshed.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Other_devices_stay_signed_in_when_one_family_is_revoked()
    {
        var (client, laptop) = await _factory.SignInAsync("two-devices@example.com");
        var (_, phone) = await _factory.SignInAsync("two-devices@example.com");

        await client.PostAsJsonAsync("/api/auth/logout", new RefreshRequest(laptop.RefreshToken));

        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(client, laptop.RefreshToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(client, phone.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task A_refresh_token_stops_working_after_it_expires()
    {
        await using var factory = new ApiFactory();
        var (client, tokens) = await factory.SignInAsync();

        factory.Clock.Advance(TokenService.RefreshTokenLifetime + TimeSpan.FromMinutes(1));

        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(client, tokens.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task An_unknown_refresh_token_is_refused()
    {
        var client = _factory.CreateAnonymousClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(client, "made-up")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await RefreshAsync(client, "")).StatusCode);
    }

    [Fact]
    public async Task A_sign_in_code_works_exactly_once()
    {
        var (client, tokens) = await _factory.SignInAsync();
        var code = await CreateCodeAsync(_factory, tokens.User.Id);

        var first = await client.PostAsJsonAsync("/api/auth/exchange", new ExchangeRequest(code));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(tokens.User.Id, (await first.Content.ReadFromJsonAsync<TokenResponse>())!.User.Id);

        var second = await client.PostAsJsonAsync("/api/auth/exchange", new ExchangeRequest(code));
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);
    }

    [Fact]
    public async Task A_sign_in_code_expires()
    {
        await using var factory = new ApiFactory();
        var (client, tokens) = await factory.SignInAsync();
        var code = await CreateCodeAsync(factory, tokens.User.Id);

        factory.Clock.Advance(TokenService.AuthCodeLifetime + TimeSpan.FromSeconds(1));

        var response = await client.PostAsJsonAsync("/api/auth/exchange", new ExchangeRequest(code));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_made_up_sign_in_code_is_refused()
    {
        var response = await _factory.CreateAnonymousClient()
            .PostAsJsonAsync("/api/auth/exchange", new ExchangeRequest("guess"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Providers_lists_only_what_is_configured()
    {
        var providers = await _factory.CreateAnonymousClient().GetFromJsonAsync<ProvidersResponse>("/api/auth/providers");

        Assert.Empty(providers!.Providers); // no OAuth credentials in tests
        Assert.True(providers.DevLogin);
    }

    [Fact]
    public async Task Asking_for_a_provider_that_is_not_configured_sends_the_browser_back_with_an_error()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/api/auth/login/Google");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("https://frontend.test/auth/callback#error=provider_unavailable", response.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task The_callback_without_a_provider_round_trip_fails_safely()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/api/auth/callback");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("https://frontend.test/auth/callback#error=oauth_failed", response.Headers.Location!.OriginalString);
    }

    private static async Task<string> CreateCodeAsync(ApiFactory factory, string userId)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<TokenService>().CreateAuthCodeAsync(userId);
    }
}

public class ProductionApiFactory : ApiFactory
{
    protected override string EnvironmentName => "Production";
}

public class ProductionTests : IClassFixture<ProductionApiFactory>
{
    private readonly ProductionApiFactory _factory;

    public ProductionTests(ProductionApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Dev_login_does_not_exist_in_production_even_if_switched_on()
    {
        var client = _factory.CreateAnonymousClient();

        var response = await client.PostAsJsonAsync("/api/auth/dev-login", new { email = "attacker@example.com" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var providers = await client.GetFromJsonAsync<ProvidersResponse>("/api/auth/providers");
        Assert.False(providers!.DevLogin);
    }

    [Fact]
    public async Task Swagger_is_not_exposed_in_production()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/swagger/index.html");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Errors_do_not_leak_details()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/api/does-not-exist");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("Exception", await response.Content.ReadAsStringAsync());
    }
}

public class RateLimitedApiFactory : ApiFactory
{
    protected override Dictionary<string, string> Settings => new()
    {
        ["RateLimits:AuthPerMinute"] = "3",
        ["RateLimits:ApiPerMinute"] = "2",
    };
}

public class RateLimitTests : IClassFixture<RateLimitedApiFactory>
{
    private readonly RateLimitedApiFactory _factory;

    public RateLimitTests(RateLimitedApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Sign_in_and_sync_endpoints_are_rate_limited()
    {
        // One sign-in uses the first of three auth permits.
        var (alice, _) = await _factory.SignInAsync();
        var anonymous = _factory.CreateAnonymousClient();

        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/auth/providers")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/auth/providers")).StatusCode);

        var limited = await anonymous.GetAsync("/api/auth/providers");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.Contains("Retry-After"));

        // The sync limit is counted per account.
        Assert.Equal(HttpStatusCode.OK, (await alice.PostAsJsonAsync("/api/sync", new SyncRequest())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await alice.PostAsJsonAsync("/api/sync", new SyncRequest())).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await alice.PostAsJsonAsync("/api/sync", new SyncRequest())).StatusCode);

        // Health checks are never limited.
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/healthz")).StatusCode);
    }
}
