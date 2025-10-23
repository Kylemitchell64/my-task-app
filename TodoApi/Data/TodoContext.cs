using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
namespace TodoApi.Data
{
    public class TodoContext : DbContext
    {
        public TodoContext(DbContextOptions<TodoContext> options) : base(options) { }
        public DbSet<TodoTask> TodoTasks { get; set; }
    }
}