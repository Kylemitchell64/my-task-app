namespace TodoApi.Contracts;

// Times cross the wire as Unix milliseconds so no device has to parse date strings.

public record TaskDto
{
    public Guid Id { get; init; }
    public string? Title { get; init; }
    public string? Description { get; init; }
    public string? Category { get; init; }
    public int EstimatedMinutes { get; init; }
    public int Priority { get; init; }
    public DateOnly? DueDate { get; init; }
    public string? Repeat { get; init; }
    public bool IsCompleted { get; init; }
    public long? CompletedAt { get; init; }
    public double SortOrder { get; init; }
    public long CreatedAt { get; init; }
    public long UpdatedAt { get; init; }
    public long? DeletedAt { get; init; }
}

public record SessionDto
{
    public Guid Id { get; init; }
    public Guid? TaskId { get; init; }
    public long StartedAt { get; init; }
    public int Seconds { get; init; }
}

public record SyncRequest
{
    /// <summary>The last version this device has seen. 0 on a first sync.</summary>
    public long Cursor { get; init; }
    public List<TaskDto>? Tasks { get; init; }
    public List<SessionDto>? Sessions { get; init; }
}

public record SyncResponse
{
    /// <summary>Send this back as <see cref="SyncRequest.Cursor"/> next time.</summary>
    public long Cursor { get; init; }

    /// <summary>
    /// True when the device's cursor is ahead of the server, which means the server
    /// lost data. The device should send everything it has again.
    /// </summary>
    public bool Reset { get; init; }

    /// <summary>Rows the device does not have yet, or that beat what it just sent.</summary>
    public List<TaskDto> Tasks { get; init; } = [];
    public List<SessionDto> Sessions { get; init; } = [];

    /// <summary>Ids of new rows that were not saved because the account is full.</summary>
    public List<Guid> Rejected { get; init; } = [];

    public long ServerTime { get; init; }
}
