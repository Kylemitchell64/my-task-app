
/**
namespace TodoApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DiagnosticController : ControllerBase
    {
        // GET: api/Diagnostic/status
        [HttpGet("status")]
        public async Task<ActionResult> Status()
        {
            // Using async pattern like TodoTasksController
            await Task.CompletedTask;

            // Return a visible "okay" string in the browser
            return Ok("okay"); // HTTP 200 with content "okay"
        }
    }
}
**/

using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace TodoApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DiagnosticController : ControllerBase
    {
        private readonly HealthCheckService _healthCheckService;
        private readonly IConfiguration _configuration;

        // NEW: Add constructor with dependencies
        public DiagnosticController(
            HealthCheckService healthCheckService,
            IConfiguration configuration)
        {
            _healthCheckService = healthCheckService;
            _configuration = configuration;
        }

        // KEEP YOUR EXISTING STATUS ENDPOINT!
        [HttpGet("status")]
        public async Task<ActionResult> Status()
        {
            await Task.CompletedTask;
            return Ok("okay");
        }


        [HttpGet("health")]
        public async Task<IActionResult> Health()
        {
            var report = await _healthCheckService.CheckHealthAsync();
            
            var response = new
            {
                status = report.Status.ToString(),
                totalDuration = report.TotalDuration,
                entries = report.Entries.Select(e => new
                {
                    name = e.Key,
                    status = e.Value.Status.ToString(),
                    description = e.Value.Description,
                    exception = e.Value.Exception?.Message
                })
            };
            
            var statusCode = report.Status == HealthStatus.Healthy ? 200 : 503;
            return StatusCode(statusCode, response);
        }
        /**
        // NEW: Health endpoint with actual database checks
        [HttpGet("health")]
        public async Task<IActionResult> Health()
        {
            var report = await _healthCheckService.CheckHealthAsync();
            var statusCode = report.Status == HealthStatus.Healthy ? 200 : 503;
            return StatusCode(statusCode, new { status = report.Status.ToString() });
        }
        **/

        // NEW: Readiness endpoint
        [HttpGet("readiness")]
        public async Task<IActionResult> Readiness()
        {
            var report = await _healthCheckService.CheckHealthAsync();
            if (report.Status != HealthStatus.Healthy)
                return StatusCode(503, new { status = "NotReady" });
            return Ok(new { status = "Ready" });
        }

        // NEW: Service info endpoint
        [HttpGet("serviceinfo")]
        public IActionResult ServiceInfo()
        {
            var version = _configuration["VERSION"] ?? "unknown";
            return Ok(new { service = "TodoApi", version, timestamp = DateTime.UtcNow });
        }
    }
}
