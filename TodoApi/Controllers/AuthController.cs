using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using TodoApi.Models;

namespace TodoApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AuthController> _logger;

        public AuthController(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            IConfiguration configuration,
            ILogger<AuthController> logger)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _configuration = configuration;
            _logger = logger;
        }

        // GET /api/auth/login/{provider}
        // Redirects the browser to Google or GitHub login
        [HttpGet("login/{provider}")]
        [AllowAnonymous]
        public IActionResult Login(string provider, [FromQuery] string? returnUrl = null)
        {
            var redirectUrl = Url.Action(nameof(Callback), "Auth");
            var properties = _signInManager.ConfigureExternalAuthenticationProperties(
                provider, redirectUrl);
            return Challenge(properties, provider);
        }

        // GET /api/auth/callback
        // Receives the OAuth result, finds/creates the user, issues a JWT
        [HttpGet("callback")]
        [AllowAnonymous]
        public async Task<IActionResult> Callback()
        {
            var frontendUrl = Environment.GetEnvironmentVariable("FRONTEND_URL")
                ?? _configuration["FrontendUrl"]
                ?? "http://localhost:5173";

            var info = await _signInManager.GetExternalLoginInfoAsync();
            if (info == null)
            {
                _logger.LogWarning("OAuth callback received with no external login info");
                return Redirect($"{frontendUrl}/login?error=oauth_failed");
            }

            // Find user by existing external login
            var user = await _userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey);

            if (user == null)
            {
                // Try to match by email
                var email = info.Principal.FindFirstValue(ClaimTypes.Email);
                if (email == null)
                {
                    _logger.LogWarning("OAuth login from {Provider} provided no email", info.LoginProvider);
                    return Redirect($"{frontendUrl}/login?error=no_email");
                }

                user = await _userManager.FindByEmailAsync(email);

                if (user == null)
                {
                    // First-time login — create the account
                    user = new ApplicationUser
                    {
                        UserName = email,
                        Email = email,
                        EmailConfirmed = true,
                        DisplayName = info.Principal.FindFirstValue(ClaimTypes.Name) ?? email,
                        AvatarUrl = info.Principal.FindFirstValue("picture")
                            ?? info.Principal.FindFirstValue("urn:github:avatar")
                    };

                    var createResult = await _userManager.CreateAsync(user);
                    if (!createResult.Succeeded)
                    {
                        _logger.LogError("Failed to create user {Email}: {Errors}",
                            email, string.Join(", ", createResult.Errors.Select(e => e.Description)));
                        return Redirect($"{frontendUrl}/login?error=create_failed");
                    }
                    _logger.LogInformation("New user registered via {Provider}: {Email}", info.LoginProvider, email);
                }

                // Link this provider to the user account
                await _userManager.AddLoginAsync(user, info);
            }

            var token = GenerateJwt(user);
            _logger.LogInformation("User {Email} logged in via {Provider}", user.Email, info.LoginProvider);

            return Redirect($"{frontendUrl}/auth/callback#token={token}");
        }

        // GET /api/auth/me — returns current user info (optional, useful for frontend)
        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> Me()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _userManager.FindByIdAsync(userId!);
            if (user == null) return NotFound();

            return Ok(new
            {
                id = user.Id,
                email = user.Email,
                displayName = user.DisplayName,
                avatarUrl = user.AvatarUrl
            });
        }

        private string GenerateJwt(ApplicationUser user)
        {
            var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY")
                ?? _configuration["Jwt:Key"]
                ?? throw new InvalidOperationException("JWT_KEY is not configured");

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Email, user.Email!),
                new Claim("name", user.DisplayName ?? user.Email!),
                new Claim("avatarUrl", user.AvatarUrl ?? "")
            };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: "task-api",
                audience: "task-app",
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(60),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
