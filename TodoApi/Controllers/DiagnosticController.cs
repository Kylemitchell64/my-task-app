using Microsoft.AspNetCore.Mvc;

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
