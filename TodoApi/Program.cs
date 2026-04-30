using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TodoApi.Data;
using TodoApi.Models;

var builder = WebApplication.CreateBuilder(args);

// Use TestConnection when running Cypress tests, DefaultConnection otherwise
var connectionString = builder.Configuration.GetConnectionString(
    Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Test"
        ? "TestConnection"
        : "DefaultConnection"
);

// Cap request body size to 100KB
builder.Services.Configure<Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServerOptions>(o =>
    o.Limits.MaxRequestBodySize = 100_000);

// Configure PostgreSQL
builder.Services.AddDbContext<TodoContext>(options =>
    options.UseNpgsql(connectionString)
);

// ASP.NET Core Identity
builder.Services.AddIdentity<ApplicationUser, Microsoft.AspNetCore.Identity.IdentityRole>(o =>
{
    o.User.RequireUniqueEmail = true;
    o.Lockout.MaxFailedAccessAttempts = 5;
    o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
})
.AddEntityFrameworkStores<TodoContext>()
.AddDefaultTokenProviders();

// JWT authentication
var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY")
    ?? builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT_KEY env var is required");

builder.Services.AddAuthentication(o =>
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
        ValidIssuer = "task-api",
        ValidAudience = "task-app",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
})
.AddGoogle(o =>
{
    o.ClientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID")
        ?? builder.Configuration["OAuth:Google:ClientId"]
        ?? string.Empty;
    o.ClientSecret = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_SECRET")
        ?? builder.Configuration["OAuth:Google:ClientSecret"]
        ?? string.Empty;
})
.AddGitHub(o =>
{
    o.ClientId = Environment.GetEnvironmentVariable("GITHUB_CLIENT_ID")
        ?? builder.Configuration["OAuth:GitHub:ClientId"]
        ?? string.Empty;
    o.ClientSecret = Environment.GetEnvironmentVariable("GITHUB_CLIENT_SECRET")
        ?? builder.Configuration["OAuth:GitHub:ClientSecret"]
        ?? string.Empty;
    o.Scope.Add("user:email");
});

// Rate limiter: 30 requests per minute per IP
builder.Services.AddRateLimiter(o =>
{
    o.AddFixedWindowLimiter("fixed", opt =>
    {
        opt.PermitLimit = 30;
        opt.Window = TimeSpan.FromMinutes(1);
    });
    o.RejectionStatusCode = 429;
});

builder.Services.AddHealthChecks()
    .AddCheck<TodoApi.HealthChecks.DatabaseHealthCheck>(
        "database",
        tags: new[] { "ready" }
    );

// Configure CORS — locked to frontend origin
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "https://task-app-frontend-alpha.vercel.app",
                "http://localhost:5173",
                "http://localhost:5001"
              )
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services
    .AddControllers(options =>
    {
        options.ReturnHttpNotAcceptable = true;
    })
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy =
            System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Trust Render's reverse proxy so OAuth redirect URIs use https://
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

app.UseCors("AllowFrontend");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        return Task.CompletedTask;
    });
    await next();
});

app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/api/diagnostic/health");

// Auto-migrate DB on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TodoContext>();
    db.Database.Migrate();
}

app.Run();
