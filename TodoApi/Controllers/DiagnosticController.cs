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

        public DiagnosticController(
            HealthCheckService healthCheckService,
            IConfiguration configuration)
        {
            _healthCheckService = healthCheckService;
            _configuration = configuration;
        }

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

        [HttpGet("readiness")]
        public async Task<IActionResult> Readiness()
        {
            var report = await _healthCheckService.CheckHealthAsync();
            if (report.Status != HealthStatus.Healthy)
                return StatusCode(503, new { status = "NotReady" });
            return Ok(new { status = "Ready" });
        }

        [HttpGet("serviceinfo")]
        public IActionResult ServiceInfo()
        {
            var version = _configuration["VERSION"] ?? "unknown";
            return Ok(new { service = "TodoApi", version, timestamp = DateTime.UtcNow });
        }
    }
}
