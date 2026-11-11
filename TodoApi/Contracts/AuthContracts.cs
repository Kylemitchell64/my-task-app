using System.ComponentModel.DataAnnotations;

namespace TodoApi.Contracts;

public record ExchangeRequest([Required, StringLength(200)] string Code);

public record RefreshRequest([Required, StringLength(200)] string RefreshToken);

public record DevLoginRequest([Required, EmailAddress, StringLength(254)] string Email, [StringLength(100)] string? Name);

public record UserDto(string Id, string Email, string Name, string? AvatarUrl);

public record TokenResponse(string AccessToken, long AccessTokenExpiresAt, string RefreshToken, UserDto User);

public record ProvidersResponse(IReadOnlyList<string> Providers, bool DevLogin);
