using Npgsql;

namespace TodoApi.Services;

/// <summary>Settings worked out once at startup and shared with the controllers.</summary>
public record AppSettings(string FrontendUrl, bool DevLoginEnabled);

public static class RateLimitPolicies
{
    /// <summary>Signed-in endpoints, counted per user.</summary>
    public const string Api = "api";

    /// <summary>Sign-in endpoints, counted per IP address.</summary>
    public const string Auth = "auth";
}

/// <summary>Claim names used to carry extra profile fields from the OAuth providers.</summary>
public static class ExternalClaims
{
    public const string Avatar = "urn:taskapp:avatar";
    public const string EmailVerified = "urn:taskapp:email_verified";
}

public static class DatabaseConfig
{
    /// <summary>
    /// Finds the connection string. Hosts such as Neon and Render hand out a
    /// <c>postgres://user:pass@host/db</c> URL, so that form is accepted anywhere a
    /// connection string is.
    /// </summary>
    public static string Resolve(IConfiguration configuration, IHostEnvironment environment)
    {
        var value =
            (environment.IsEnvironment("Test") ? configuration.GetConnectionString("TestConnection") : null)
            ?? configuration.GetConnectionString("DefaultConnection")
            ?? configuration["DATABASE_URL"];

        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                "No database configured. Set ConnectionStrings__DefaultConnection or DATABASE_URL.");
        }

        return Normalize(value);
    }

    public static string Normalize(string value)
    {
        value = value.Trim();
        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        var uri = new Uri(value);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
        };

        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        var sslMode = query["sslmode"];
        if (!string.IsNullOrEmpty(sslMode) && Enum.TryParse<SslMode>(sslMode.Replace("-", ""), ignoreCase: true, out var mode))
        {
            builder.SslMode = mode;
        }

        return builder.ConnectionString;
    }
}
