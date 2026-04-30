using System.ComponentModel.DataAnnotations;

namespace TodoApi.Models
{
    public class TodoTask
    {
        public int Id { get; set; }

        [Required, StringLength(200, MinimumLength = 1)]
        public string Title { get; set; } = string.Empty;

        [StringLength(2000)]
        public string Description { get; set; } = string.Empty;

        public bool IsCompleted { get; set; } = false;

        [StringLength(100)]
        public string Category { get; set; } = string.Empty;

        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

        [Range(1, 1440)]
        public int EstimatedMinutes { get; set; } = 25;

        public string UserId { get; set; } = string.Empty;
    }
}
