using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TodoApi.Contracts;
using TodoApi.Services;

namespace TodoApi.Controllers;

[Route("api/sync")]
[ApiController]
[Authorize]
[EnableRateLimiting(RateLimitPolicies.Api)]
public class SyncController : ControllerBase
{
    private readonly SyncService _sync;

    public SyncController(SyncService sync)
    {
        _sync = sync;
    }

    /// <summary>
    /// Sends this device's changes and returns everything it has not seen yet.
    /// The user comes from the token, so one account can never read or write another's rows.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<SyncResponse>> Sync([FromBody] SyncRequest request, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId == null) return Unauthorized();

        if (request.Cursor < 0)
            return Problem(statusCode: 400, title: "Cursor cannot be negative.");

        if ((request.Tasks?.Count ?? 0) > SyncService.MaxItemsPerRequest ||
            (request.Sessions?.Count ?? 0) > SyncService.MaxItemsPerRequest)
        {
            return Problem(
                statusCode: 413,
                title: $"Send at most {SyncService.MaxItemsPerRequest} tasks and {SyncService.MaxItemsPerRequest} sessions per request.");
        }

        var response = await _sync.SyncAsync(userId, request, ct);
        if (response == null) return Unauthorized();
        return response;
    }
}
