using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TodoApi.Data;
using TodoApi.HealthChecks;
using TodoApi.Models;
using TodoApi.Services;

var builder = WebApplication.CreateBuilder(args);
var configuration = builder.Configuration;
var environment = builder.Environment;

// ---------- Limits ----------

// A full sync batch is well under this. Anything larger is rejected before it is read.
builder.Services.Configure<KestrelServerOptions>(o => o.Limits.MaxRequestBodySize = 1_000_000);

// ---------- Database ----------

var connectionString = DatabaseConfig.Resolve(configuration, environment);
builder.Services.AddDbContext<TodoContext>(options =>
    options.UseNpgsql(connectionString, npgsql => npgsql.EnableRetryOnFailure(3)));

// ---------- Identity ----------

builder.Services
    .AddIdentity<ApplicationUser, IdentityRole>(o => o.User.RequireUniqueEmail = true)
    .AddEntityFrameworkStores<TodoContext>()
    .AddDefaultTokenProviders();

// ---------- Authentication ----------

var jwtKey = configuration["JWT_KEY"] ?? configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT_KEY is required.");
if (jwtKey.Length < 32)
    throw new InvalidOperationException("JWT_KEY must be at least 32 characters.");
if (environment.IsProduction() && jwtKey == JwtSettings.DevPlaceholderKey)
    throw new InvalidOperationException("JWT_KEY is still the development placeholder. Set a real key.");

var jwtSettings = new JwtSettings(jwtKey);
builder.Services.AddSingleton(jwtSettings);

var authentication = builder.Services
    .AddAuthentication(o =>
    {
        o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = JwtSettings.Issuer,
            ValidAudience = JwtSettings.Audience,
            IssuerSigningKey = jwtSettings.SigningKey,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

// A provider is only registered when its credentials exist, so the API still runs
// locally and in tests without any OAuth setup.
var googleId = configuration["GOOGLE_CLIENT_ID"] ?? configuration["OAuth:Google:ClientId"];
var googleSecret = configuration["GOOGLE_CLIENT_SECRET"] ?? configuration["OAuth:Google:ClientSecret"];
if (!string.IsNullOrWhiteSpace(googleId) && !string.IsNullOrWhiteSpace(googleSecret))
{
    authentication.AddGoogle(o =>
    {
        o.ClientId = googleId;
        o.ClientSecret = googleSecret;
        o.ClaimActions.MapJsonKey(ExternalClaims.Avatar, "picture");
        o.ClaimActions.MapJsonKey(ExternalClaims.EmailVerified, "email_verified");
    });
}

var gitHubId = configuration["GITHUB_CLIENT_ID"] ?? configuration["OAuth:GitHub:ClientId"];
var gitHubSecret = configuration["GITHUB_CLIENT_SECRET"] ?? configuration["OAuth:GitHub:ClientSecret"];
if (!string.IsNullOrWhiteSpace(gitHubId) && !string.IsNullOrWhiteSpace(gitHubSecret))
{
    authentication.AddGitHub(o =>
    {
        o.ClientId = gitHubId;
        o.ClientSecret = gitHubSecret;
        o.Scope.Add("user:email");
        o.ClaimActions.MapJsonKey(ExternalClaims.Avatar, "avatar_url");
    });
}

// ---------- App settings ----------

var frontendUrl = (configuration["FRONTEND_URL"] ?? configuration["FrontendUrl"] ?? "http://localhost:5173")
    .TrimEnd('/');
var devLoginEnabled = !environment.IsProduction() && configuration.GetValue("Auth:DevLogin", false);

builder.Services.AddSingleton(new AppSettings(frontendUrl, devLoginEnabled));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<SyncService>();

// ---------- Rate limiting ----------

var apiPerMinute = configuration.GetValue("RateLimits:ApiPerMinute", 120);
var authPerMinute = configuration.GetValue("RateLimits:AuthPerMinute", 60);

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (context, _) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        return ValueTask.CompletedTask;
    };

    // Signed-in traffic is counted per account, so one busy user cannot starve another.
    o.AddPolicy(RateLimitPolicies.Api, http => RateLimitPartition.GetTokenBucketLimiter(
        http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ClientIp(http),
        _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = apiPerMinute,
            TokensPerPeriod = apiPerMinute,
            ReplenishmentPeriod = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));

    o.AddPolicy(RateLimitPolicies.Auth, http => RateLimitPartition.GetFixedWindowLimiter(
        ClientIp(http),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = authPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
});

// ---------- CORS ----------

var allowedOrigins = new[]
    {
        frontendUrl,
        "https://task-app-frontend-alpha.vercel.app",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:5001",
    }
    .Concat((configuration["CORS_ORIGINS"] ?? string.Empty)
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    .Select(origin => origin.TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    // Tokens travel in the Authorization header, never in cookies, so credentials stay off.
    options.AddDefaultPolicy(policy => policy
        .WithOrigins(allowedOrigins)
        .WithHeaders("Authorization", "Content-Type")
        .WithMethods("GET", "POST", "DELETE")
        .SetPreflightMaxAge(TimeSpan.FromHours(1)));
});

// ---------- MVC ----------

builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);

builder.Services.AddProblemDetails();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// The API only receives traffic through the host's reverse proxy, which sets these headers.
// Without them OAuth redirect URIs would be built with http:// instead of https://.
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
};
forwardedHeaders.KnownNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaders);

app.UseExceptionHandler();
app.UseStatusCodePages();

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    // Nothing this API returns should be kept by a browser or a proxy.
    headers.CacheControl = "no-store";
    if (!app.Environment.IsDevelopment())
    {
        headers.StrictTransportSecurity = "max-age=31536000; includeSubDomains";
    }
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapControllers();

// Cheap liveness check: no database, no auth. This is what a keep-warm ping should hit.
app.MapMethods("/healthz", ["GET", "HEAD"], () => Results.Text("ok"));
app.MapGet("/", () => Results.Ok(new { service = "TodoApi", status = "ok" }));

await MigrateAsync(app);

app.Run();

static string ClientIp(HttpContext http) =>
    http.Connection.RemoteIpAddress?.ToString() ?? "unknown";

// Applies pending migrations. A free database can take a moment to wake, so this retries,
// and if the database never answers the API still starts and reports unhealthy instead
// of crash-looping.
static async Task MigrateAsync(WebApplication app)
{
    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    const int attempts = 5;

    for (var attempt = 1; attempt <= attempts; attempt++)
    {
        try
        {
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TodoContext>();
            await db.Database.MigrateAsync();
            return;
        }
        catch (Exception ex) when (attempt < attempts)
        {
            logger.LogWarning(ex, "Database not ready (attempt {Attempt} of {Attempts}); retrying", attempt, attempts);
            await Task.Delay(TimeSpan.FromSeconds(2 * attempt));
        }
        catch (Exception ex)
        {
            logger.LogCritical(ex, "Could not migrate the database. Starting anyway; requests will fail until it is reachable.");
        }
    }
}

public partial class Program;
