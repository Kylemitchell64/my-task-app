namespace TodoApi.Models;

/// <summary>One finished stretch of focus time. Written once, never edited.</summary>
public class FocusSession
{
    public const int MaxSeconds = 6 * 60 * 60;

    public int Id { get; set; }

    public Guid ClientId { get; set; }

    public string UserId { get; set; } = string.Empty;

    /// <summary>The task the time was spent on, if it was tied to one.</summary>
    public Guid? TaskClientId { get; set; }

    public DateTime StartedAt { get; set; }

    public int Seconds { get; set; }

    public long Version { get; set; }
}
