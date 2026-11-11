using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TodoApi.Contracts;
using TodoApi.Models;
using TodoApi.Services;

namespace TodoApi.Controllers;

[Route("api/auth")]
[ApiController]
[EnableRateLimiting(RateLimitPolicies.Auth)]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly TokenService _tokens;
    private readonly AppSettings _settings;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        TokenService tokens,
        AppSettings settings,
        ILogger<AuthController> logger)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _tokens = tokens;
        _settings = settings;
        _logger = logger;
    }

    /// <summary>Which sign-in buttons the frontend should show.</summary>
    [HttpGet("providers")]
    [AllowAnonymous]
    public async Task<ProvidersResponse> Providers()
    {
        var schemes = await _signInManager.GetExternalAuthenticationSchemesAsync();
        return new ProvidersResponse(schemes.Select(s => s.Name).ToList(), _settings.DevLoginEnabled);
    }

    /// <summary>Sends the browser to Google or GitHub to sign in.</summary>
    [HttpGet("login/{provider}")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(string provider)
    {
        var schemes = await _signInManager.GetExternalAuthenticationSchemesAsync();
        var scheme = schemes.FirstOrDefault(s => string.Equals(s.Name, provider, StringComparison.OrdinalIgnoreCase));
        if (scheme == null) return RedirectWithError("provider_unavailable");

        var properties = _signInManager.ConfigureExternalAuthenticationProperties(
            scheme.Name, Url.Action(nameof(Callback)));
        return Challenge(properties, scheme.Name);
    }

    /// <summary>
    /// Where the provider sends the browser back. Finds or creates the user, then hands the
    /// frontend a single-use code. Tokens never appear in a URL.
    /// </summary>
    [HttpGet("callback")]
    [AllowAnonymous]
    public async Task<IActionResult> Callback()
    {
        var info = await _signInManager.GetExternalLoginInfoAsync();
        if (info == null)
        {
            _logger.LogWarning("OAuth callback received with no external login info");
            return RedirectWithError("oauth_failed");
        }

        // The external cookie has done its job once the login info is read.
        await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);

        var name = info.Principal.FindFirstValue(ClaimTypes.Name);
        var avatarUrl = info.Principal.FindFirstValue(ExternalClaims.Avatar);

        var user = await _userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
        if (user == null)
        {
            var email = info.Principal.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrWhiteSpace(email))
            {
                _logger.LogWarning("OAuth login from {Provider} provided no email", info.LoginProvider);
                return RedirectWithError("no_email");
            }

            // Accounts are matched by email, so an address the provider has not verified
            // must not be allowed to claim someone else's account.
            var verified = info.Principal.FindFirstValue(ExternalClaims.EmailVerified);
            if (string.Equals(verified, "false", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("OAuth login from {Provider} had an unverified email", info.LoginProvider);
                return RedirectWithError("email_unverified");
            }

            user = await _userManager.FindByEmailAsync(email);
            if (user == null)
            {
                user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
                var created = await _userManager.CreateAsync(user);
                if (!created.Succeeded)
                {
                    _logger.LogError("Failed to create user from {Provider}: {Errors}",
                        info.LoginProvider, string.Join(", ", created.Errors.Select(e => e.Code)));
                    return RedirectWithError("create_failed");
                }
                _logger.LogInformation("New user {UserId} registered via {Provider}", user.Id, info.LoginProvider);
            }

            var linked = await _userManager.AddLoginAsync(user, info);
            if (!linked.Succeeded)
            {
                _logger.LogError("Failed to link {Provider} to user {UserId}: {Errors}",
                    info.LoginProvider, user.Id, string.Join(", ", linked.Errors.Select(e => e.Code)));
                return RedirectWithError("link_failed");
            }
        }

        await UpdateProfileAsync(user, name, avatarUrl);

        var code = await _tokens.CreateAuthCodeAsync(user.Id, HttpContext.RequestAborted);
        _logger.LogInformation("User {UserId} signed in via {Provider}", user.Id, info.LoginProvider);

        // A fragment is never sent to a server or written to its logs.
        return Redirect($"{_settings.FrontendUrl}/auth/callback#code={Uri.EscapeDataString(code)}");
    }

    /// <summary>Trades the single-use code from the callback for tokens.</summary>
    [HttpPost("exchange")]
    [AllowAnonymous]
    public async Task<ActionResult<TokenResponse>> Exchange([FromBody] ExchangeRequest request, CancellationToken ct)
    {
        var user = await _tokens.RedeemAuthCodeAsync(request.Code, ct);
        if (user == null) return Problem(statusCode: 401, title: "This sign-in link has expired. Please sign in again.");

        return await _tokens.IssueAsync(user, ct);
    }

    /// <summary>Trades a refresh token for a new access token and a new refresh token.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<TokenResponse>> Refresh([FromBody] RefreshRequest request, CancellationToken ct)
    {
        var result = await _tokens.RefreshAsync(request.RefreshToken, ct);
        return result.Outcome switch
        {
            RefreshOutcome.Success => result.Tokens!,
            RefreshOutcome.Superseded => Problem(statusCode: 409, title: "This token was just replaced. Retry with the newest one."),
            _ => Problem(statusCode: 401, title: "Your session has ended. Please sign in again."),
        };
    }

    /// <summary>Signs this device out.</summary>
    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest request, CancellationToken ct)
    {
        await _tokens.RevokeAsync(request.RefreshToken, ct);
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();
        return TokenService.ToDto(user);
    }

    /// <summary>
    /// Signs in as any email with no password. Exists for local development and automated
    /// tests, and only answers when it is switched on outside of Production.
    /// </summary>
    [HttpPost("dev-login")]
    [AllowAnonymous]
    public async Task<ActionResult<TokenResponse>> DevLogin([FromBody] DevLoginRequest request, CancellationToken ct)
    {
        if (!_settings.DevLoginEnabled) return NotFound();

        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user == null)
        {
            user = new ApplicationUser { UserName = request.Email, Email = request.Email, EmailConfirmed = true };
            var created = await _userManager.CreateAsync(user);
            if (!created.Succeeded) return Problem(statusCode: 400, title: "Could not create that user.");
        }

        await UpdateProfileAsync(user, request.Name, null);
        return await _tokens.IssueAsync(user, ct);
    }

    private async Task UpdateProfileAsync(ApplicationUser user, string? name, string? avatarUrl)
    {
        var changed = false;
        if (!string.IsNullOrWhiteSpace(name) && name != user.DisplayName)
        {
            user.DisplayName = name.Length > 100 ? name[..100] : name;
            changed = true;
        }
        if (IsSafeAvatarUrl(avatarUrl) && avatarUrl != user.AvatarUrl)
        {
            user.AvatarUrl = avatarUrl;
            changed = true;
        }
        if (changed) await _userManager.UpdateAsync(user);
    }

    private static bool IsSafeAvatarUrl(string? url) =>
        url is { Length: > 0 and <= 500 }
        && Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps;

    private RedirectResult RedirectWithError(string error) =>
        Redirect($"{_settings.FrontendUrl}/auth/callback#error={error}");
}
