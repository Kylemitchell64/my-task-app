namespace TodoApi.Models;

/// <summary>
/// A long-lived token a device trades for a new access token.
/// Only its hash is stored. Each use replaces it with a new one in the same family.
/// </summary>
public class RefreshToken
{
    public int Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public string TokenHash { get; set; } = string.Empty;

    /// <summary>Shared by every token descended from one sign-in.</summary>
    public Guid FamilyId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    /// <summary>Set when the token is traded for its replacement.</summary>
    public DateTime? UsedAt { get; set; }

    /// <summary>Set when the device signs out or the token's family is revoked.</summary>
    public DateTime? RevokedAt { get; set; }
}

/// <summary>A single-use code handed to the browser after OAuth, traded once for tokens.</summary>
public class AuthCode
{
    public string CodeHash { get; set; } = string.Empty;

    public string UserId { get; set; } = string.Empty;

    public DateTime ExpiresAt { get; set; }
}
