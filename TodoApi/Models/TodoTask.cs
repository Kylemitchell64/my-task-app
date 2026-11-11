using System.ComponentModel.DataAnnotations;

namespace TodoApi.Models;

public class TodoTask
{
    public const int TitleMaxLength = 200;
    public const int DescriptionMaxLength = 2000;
    public const int CategoryMaxLength = 100;
    public const int RepeatMaxLength = 16;
    public const int MinEstimate = 1;
    public const int MaxEstimate = 1440;

    public int Id { get; set; }

    /// <summary>Id generated on the device that created the task. Unique per user.</summary>
    public Guid ClientId { get; set; }

    public string UserId { get; set; } = string.Empty;

    [Required, StringLength(TitleMaxLength, MinimumLength = 1)]
    public string Title { get; set; } = string.Empty;

    [StringLength(DescriptionMaxLength)]
    public string Description { get; set; } = string.Empty;

    [StringLength(CategoryMaxLength)]
    public string Category { get; set; } = string.Empty;

    [Range(MinEstimate, MaxEstimate)]
    public int EstimatedMinutes { get; set; } = 25;

    /// <summary>0 = none, 1 = low, 2 = medium, 3 = high.</summary>
    [Range(0, 3)]
    public int Priority { get; set; }

    public DateOnly? DueDate { get; set; }

    /// <summary>"", "daily", "weekdays", "weekly" or "monthly".</summary>
    [StringLength(RepeatMaxLength)]
    public string Repeat { get; set; } = string.Empty;

    public bool IsCompleted { get; set; }

    public DateTime? CompletedAt { get; set; }

    /// <summary>Manual list position. Lower sorts first.</summary>
    public double SortOrder { get; set; }

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    /// <summary>When the task was last edited on a device. Last write wins.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set when the task is deleted. The row stays so other devices learn of it.</summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>The user's sync version at the time this row last changed.</summary>
    public long Version { get; set; }
}
