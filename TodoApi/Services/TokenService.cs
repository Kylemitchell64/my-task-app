using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TodoApi.Contracts;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Services;

public record JwtSettings(string Key)
{
    public const string Issuer = "task-api";
    public const string Audience = "task-app";
    public const string DevPlaceholderKey =
        "dev-only-placeholder-key-replace-with-real-key-in-production-env-var";

    public SymmetricSecurityKey SigningKey { get; } = new(Encoding.UTF8.GetBytes(Key));
}

public enum RefreshOutcome
{
    Success,
    /// <summary>Unknown, expired or reused token. The device must sign in again.</summary>
    Invalid,
    /// <summary>Another request used this token a moment ago. The device should retry with its newest token.</summary>
    Superseded,
}

public record RefreshResult(RefreshOutcome Outcome, TokenResponse? Tokens = null);

public class TokenService
{
    public static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(60);
    public static readonly TimeSpan AuthCodeLifetime = TimeSpan.FromMinutes(2);

    /// <summary>
    /// Two tabs can try to refresh with the same token at the same moment.
    /// Inside this window the loser is told to retry instead of being treated as a thief.
    /// </summary>
    public static readonly TimeSpan ReuseGracePeriod = TimeSpan.FromSeconds(60);

    private readonly TodoContext _db;
    private readonly JwtSettings _jwt;
    private readonly TimeProvider _clock;
    private readonly ILogger<TokenService> _logger;

    public TokenService(TodoContext db, JwtSettings jwt, TimeProvider clock, ILogger<TokenService> logger)
    {
        _db = db;
        _jwt = jwt;
        _clock = clock;
        _logger = logger;
    }

    private DateTime UtcNow => _clock.GetUtcNow().UtcDateTime;

    public static UserDto ToDto(ApplicationUser user) => new(
        user.Id,
        user.Email ?? string.Empty,
        string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email ?? string.Empty : user.DisplayName,
        string.IsNullOrWhiteSpace(user.AvatarUrl) ? null : user.AvatarUrl);

    /// <summary>Starts a new sign-in on a device: a fresh access token and refresh token.</summary>
    public async Task<TokenResponse> IssueAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var now = UtcNow;

        // Tidy up as we go so the table cannot grow without bound.
        await _db.RefreshTokens
            .Where(t => t.UserId == user.Id && t.ExpiresAt < now)
            .ExecuteDeleteAsync(ct);

        return await IssueInFamilyAsync(user, Guid.NewGuid(), ct);
    }

    public async Task<RefreshResult> RefreshAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = Hash(rawToken);
        var now = UtcNow;

        // Claim the token in a single statement so only one of two racing requests can win.
        var claimed = await _db.RefreshTokens
            .Where(t => t.TokenHash == hash && t.UsedAt == null && t.RevokedAt == null && t.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAt, now), ct);

        var token = await _db.RefreshTokens.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token == null) return new RefreshResult(RefreshOutcome.Invalid);

        if (claimed == 0)
        {
            if (token.RevokedAt != null || token.ExpiresAt <= now || token.UsedAt is not { } usedAt)
                return new RefreshResult(RefreshOutcome.Invalid);

            if (now - usedAt <= ReuseGracePeriod)
                return new RefreshResult(RefreshOutcome.Superseded);

            // A token that was already traded in is being used again. Either it leaked
            // or a device replayed it. Either way, end every session descended from it.
            _logger.LogWarning("Refresh token reuse detected for user {UserId}; revoking family", token.UserId);
            await RevokeFamilyAsync(token.FamilyId, ct);
            return new RefreshResult(RefreshOutcome.Invalid);
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == token.UserId, ct);
        if (user == null) return new RefreshResult(RefreshOutcome.Invalid);

        return new RefreshResult(RefreshOutcome.Success, await IssueInFamilyAsync(user, token.FamilyId, ct));
    }

    /// <summary>Signs a device out by ending its refresh-token family.</summary>
    public async Task RevokeAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = Hash(rawToken);
        var familyId = await _db.RefreshTokens
            .Where(t => t.TokenHash == hash)
            .Select(t => (Guid?)t.FamilyId)
            .FirstOrDefaultAsync(ct);
        if (familyId != null) await RevokeFamilyAsync(familyId.Value, ct);
    }

    public async Task<string> CreateAuthCodeAsync(string userId, CancellationToken ct = default)
    {
        var now = UtcNow;
        await _db.AuthCodes.Where(c => c.ExpiresAt < now).ExecuteDeleteAsync(ct);

        var code = NewSecret();
        _db.AuthCodes.Add(new AuthCode
        {
            CodeHash = Hash(code),
            UserId = userId,
            ExpiresAt = now + AuthCodeLifetime,
        });
        await _db.SaveChangesAsync(ct);
        return code;
    }

    /// <summary>Returns the user the code was issued for, or null. A code works once.</summary>
    public async Task<ApplicationUser?> RedeemAuthCodeAsync(string code, CancellationToken ct = default)
    {
        var hash = Hash(code);
        var now = UtcNow;

        var entry = await _db.AuthCodes.AsNoTracking().FirstOrDefaultAsync(c => c.CodeHash == hash, ct);
        if (entry == null) return null;

        // Deleting is the claim: if another request got there first, nothing is deleted.
        var deleted = await _db.AuthCodes.Where(c => c.CodeHash == hash).ExecuteDeleteAsync(ct);
        if (deleted == 0 || entry.ExpiresAt <= now) return null;

        return await _db.Users.FirstOrDefaultAsync(u => u.Id == entry.UserId, ct);
    }

    private async Task<TokenResponse> IssueInFamilyAsync(ApplicationUser user, Guid familyId, CancellationToken ct)
    {
        var now = UtcNow;
        var refreshToken = NewSecret();
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = Hash(refreshToken),
            FamilyId = familyId,
            CreatedAt = now,
            ExpiresAt = now + RefreshTokenLifetime,
        });
        await _db.SaveChangesAsync(ct);

        var expires = now + AccessTokenLifetime;
        return new TokenResponse(
            CreateAccessToken(user, now, expires),
            new DateTimeOffset(expires).ToUnixTimeMilliseconds(),
            refreshToken,
            ToDto(user));
    }

    private Task RevokeFamilyAsync(Guid familyId, CancellationToken ct)
    {
        var now = UtcNow;
        return _db.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
    }

    private string CreateAccessToken(ApplicationUser user, DateTime now, DateTime expires)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        };

        var token = new JwtSecurityToken(
            issuer: JwtSettings.Issuer,
            audience: JwtSettings.Audience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: new SigningCredentials(_jwt.SigningKey, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string NewSecret() =>
        Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
