using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Data;
using TodoApi.Models;
namespace TodoApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TodoTasksController : ControllerBase
    {
        private readonly TodoContext _context;
        public TodoTasksController(TodoContext context) { _context = context; }
        // GET: api/TodoTasks - Get all tasks
        [HttpGet]
        public async Task<ActionResult<IEnumerable<TodoTask>>> GetTodoTasks()
        {
            return await _context.TodoTasks.ToListAsync();
        }
        // POST: api/TodoTasks - Create new task
        [HttpPost]
        //need to add UTC dateTime
        // public async Task<ActionResult<TodoTask>> PostTodoTask(TodoTask task)
        // {
        //     _context.TodoTasks.Add(task);
        //     await _context.SaveChangesAsync();
        //     return CreatedAtAction(nameof(GetTodoTask), new { id = task.Id }, task);
        // }
        [HttpPost]
        public async Task<ActionResult<TodoTask>> PostTodoTask(TodoTask task)
        {
            // Ensure CreatedDate is stored as UTC
            task.CreatedDate = DateTime.UtcNow;

            _context.TodoTasks.Add(task);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetTodoTask), new { id = task.Id }, task);
        }


        // PUT: api/TodoTasks/5 - Update task
        [HttpPut("{id}")]
        public async Task<IActionResult> PutTodoTask(int id, [FromBody] TodoTask updatedTask)
        {
            if (id != updatedTask.Id)
                return BadRequest("ID mismatch");

            var existingTask = await _context.TodoTasks.FindAsync(id);
            if (existingTask == null)
                return NotFound();

            existingTask.Title = updatedTask.Title;
            existingTask.Description = updatedTask.Description;
            existingTask.IsCompleted = updatedTask.IsCompleted;
            existingTask.Category = updatedTask.Category;
            existingTask.EstimatedMinutes = updatedTask.EstimatedMinutes;

            await _context.SaveChangesAsync();

            return NoContent();
        }






        // DELETE: api/TodoTasks/5 - Delete task
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTodoTask(int id)
        {
            var task = await _context.TodoTasks.FindAsync(id);
            if (task == null) return NotFound();
            _context.TodoTasks.Remove(task);
            await _context.SaveChangesAsync();
            return NoContent();
        }
        // GET: api/TodoTasks/5 - Get one task
        [HttpGet("{id}")]
        public async Task<ActionResult<TodoTask>> GetTodoTask(int id)
        {
            var task = await _context.TodoTasks.FindAsync(id);
            if (task == null) return NotFound();
            return task;
        }
    }
}