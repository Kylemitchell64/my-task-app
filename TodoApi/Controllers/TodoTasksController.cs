using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    [EnableRateLimiting("fixed")]
    public class TodoTasksController : ControllerBase
    {
        private readonly TodoContext _context;
        private readonly ILogger<TodoTasksController> _logger;

        public TodoTasksController(TodoContext context, ILogger<TodoTasksController> logger)
        {
            _context = context;
            _logger = logger;
        }

        private string? GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier);

        // GET: api/TodoTasks
        [HttpGet]
        [Produces("application/json")]
        public async Task<ActionResult<IEnumerable<TodoTask>>> GetTodoTasks()
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            return await _context.TodoTasks
                .Where(t => t.UserId == userId)
                .ToListAsync();
        }

        // GET: api/TodoTasks/5
        [HttpGet("{id}")]
        [Produces("application/json")]
        public async Task<ActionResult<TodoTask>> GetTodoTask(int id)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            var task = await _context.TodoTasks.FindAsync(id);
            if (task == null || task.UserId != userId) return NotFound();

            return task;
        }

        // POST: api/TodoTasks
        [HttpPost]
        public async Task<ActionResult<TodoTask>> PostTodoTask([FromBody] TodoTask task)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            task.CreatedDate = DateTime.UtcNow;
            task.UserId = userId;

            _context.TodoTasks.Add(task);
            await _context.SaveChangesAsync();

            _logger.LogInformation("User {UserId} created task {TaskId}", userId, task.Id);
            return CreatedAtAction(nameof(GetTodoTask), new { id = task.Id }, task);
        }

        // PUT: api/TodoTasks/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutTodoTask(int id, [FromBody] TodoTask updatedTask)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);
            if (id != updatedTask.Id) return BadRequest("ID mismatch");

            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            var existingTask = await _context.TodoTasks.FindAsync(id);
            if (existingTask == null || existingTask.UserId != userId) return NotFound();

            existingTask.Title = updatedTask.Title;
            existingTask.Description = updatedTask.Description;
            existingTask.IsCompleted = updatedTask.IsCompleted;
            existingTask.Category = updatedTask.Category;
            existingTask.EstimatedMinutes = updatedTask.EstimatedMinutes;

            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE ALL — test environment only
        [ApiExplorerSettings(IgnoreApi = true)]
        [HttpDelete("deleteAll")]
        [AllowAnonymous]
        public async Task<IActionResult> DeleteAllTodoTasks([FromServices] IWebHostEnvironment env)
        {
            if (!env.IsEnvironment("Test"))
                return NotFound();

            var allTasks = await _context.TodoTasks.ToListAsync();
            if (!allTasks.Any()) return NoContent();

            _context.TodoTasks.RemoveRange(allTasks);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/TodoTasks/5
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteTodoTask(int id)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            var task = await _context.TodoTasks.FindAsync(id);
            if (task == null || task.UserId != userId) return NotFound();

            _context.TodoTasks.Remove(task);
            await _context.SaveChangesAsync();

            _logger.LogInformation("User {UserId} deleted task {TaskId}", userId, id);
            return NoContent();
        }
    }
}
