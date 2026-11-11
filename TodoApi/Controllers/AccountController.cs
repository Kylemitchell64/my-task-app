using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using TodoApi.Data;
using TodoApi.Models;
using TodoApi.Services;

namespace TodoApi.Controllers;

[Route("api/account")]
[ApiController]
[Authorize]
[EnableRateLimiting(RateLimitPolicies.Api)]
public class AccountController : ControllerBase
{
    private readonly TodoContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<AccountController> _logger;

    public AccountController(TodoContext db, UserManager<ApplicationUser> userManager, ILogger<AccountController> logger)
    {
        _db = db;
        _userManager = userManager;
        _logger = logger;
    }

    /// <summary>Permanently deletes the signed-in account and everything stored for it.</summary>
    [HttpDelete]
    public async Task<IActionResult> Delete(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId == null) return Unauthorized();

        var strategy = _db.Database.CreateExecutionStrategy();
        var found = await strategy.ExecuteAsync(async () =>
        {
            _db.ChangeTracker.Clear();
            await using var transaction = await _db.Database.BeginTransactionAsync(ct);

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return false;

            await _db.TodoTasks.Where(t => t.UserId == userId).ExecuteDeleteAsync(ct);
            await _db.FocusSessions.Where(s => s.UserId == userId).ExecuteDeleteAsync(ct);
            await _db.RefreshTokens.Where(t => t.UserId == userId).ExecuteDeleteAsync(ct);
            await _db.AuthCodes.Where(c => c.UserId == userId).ExecuteDeleteAsync(ct);
            await _userManager.DeleteAsync(user);

            await transaction.CommitAsync(ct);
            return true;
        });

        if (!found) return Unauthorized();

        _logger.LogInformation("User {UserId} deleted their account", userId);
        return NoContent();
    }
}
