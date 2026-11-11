using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace TodoApi.Controllers;

[Route("api/diagnostic")]
[ApiController]
public class DiagnosticController : ControllerBase
{
    private readonly HealthCheckService _healthCheckService;
    private readonly IConfiguration _configuration;

    public DiagnosticController(HealthCheckService healthCheckService, IConfiguration configuration)
    {
        _healthCheckService = healthCheckService;
        _configuration = configuration;
    }

    /// <summary>Answers without touching the database. Used to wake and keep the service warm.</summary>
    [HttpGet("status")]
    [HttpHead("status")]
    public IActionResult Status() => Ok("okay");

    /// <summary>Checks the database too.</summary>
    [HttpGet("health")]
    public async Task<IActionResult> Health(CancellationToken ct)
    {
        var report = await _healthCheckService.CheckHealthAsync(ct);

        // Exception text can carry host names and connection details, so it stays in the logs.
        var response = new
        {
            status = report.Status.ToString(),
            totalDuration = report.TotalDuration,
            entries = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                description = e.Value.Description,
            }),
        };

        return StatusCode(report.Status == HealthStatus.Healthy ? 200 : 503, response);
    }

    [HttpGet("readiness")]
    public async Task<IActionResult> Readiness(CancellationToken ct)
    {
        var report = await _healthCheckService.CheckHealthAsync(ct);
        return report.Status == HealthStatus.Healthy
            ? Ok(new { status = "Ready" })
            : StatusCode(503, new { status = "NotReady" });
    }

    [HttpGet("serviceinfo")]
    public IActionResult ServiceInfo() => Ok(new
    {
        service = "TodoApi",
        version = _configuration["VERSION"] ?? "unknown",
        timestamp = DateTime.UtcNow,
    });
}
