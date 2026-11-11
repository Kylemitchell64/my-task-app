using Microsoft.EntityFrameworkCore;
using TodoApi.Contracts;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Services;

/// <summary>
/// Merges a device's offline changes into the account and returns what the device is missing.
///
/// Every device keeps its own full copy of the data and works from that copy. A sync sends the
/// rows the device changed and gets back the rows other devices changed. When two devices edit
/// the same task, the edit with the later <see cref="TodoTask.UpdatedAt"/> wins.
/// </summary>
public class SyncService
{
    public const int MaxItemsPerRequest = 500;
    public const int MaxTasksPerUser = 5_000;
    public const int MaxSessionsPerUser = 20_000;

    private static readonly HashSet<string> RepeatRules = ["", "daily", "weekdays", "weekly", "monthly"];
    private static readonly DateTime EarliestTime = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly TimeSpan AllowedClockSkew = TimeSpan.FromDays(1);

    private readonly TodoContext _db;
    private readonly TimeProvider _clock;

    public SyncService(TodoContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    /// <summary>Returns null when the user no longer exists.</summary>
    public Task<SyncResponse?> SyncAsync(string userId, SyncRequest request, CancellationToken ct = default)
    {
        // The retrying strategy needs the whole transaction as one unit it can run again.
        var strategy = _db.Database.CreateExecutionStrategy();
        return strategy.ExecuteAsync(async () =>
        {
            _db.ChangeTracker.Clear();
            await using var transaction = await _db.Database.BeginTransactionAsync(ct);
            var response = await SyncInTransactionAsync(userId, request, ct);
            await transaction.CommitAsync(ct);
            return response;
        });
    }

    private async Task<SyncResponse?> SyncInTransactionAsync(string userId, SyncRequest request, CancellationToken ct)
    {
        var now = _clock.GetUtcNow().UtcDateTime;

        // Locking the user's row makes syncs for one account run one at a time, so versions
        // are handed out in the same order they are committed and no device can miss a row.
        var versions = await _db.Database
            .SqlQuery<long>($"""SELECT "SyncVersion" AS "Value" FROM "AspNetUsers" WHERE "Id" = {userId} FOR UPDATE""")
            .ToListAsync(ct);
        if (versions.Count == 0) return null;

        var currentVersion = versions[0];
        if (request.Cursor > currentVersion)
        {
            return new SyncResponse { Cursor = 0, Reset = true, ServerTime = ToMillis(now) };
        }

        var nextVersion = currentVersion + 1;
        var rejected = new List<Guid>();

        var (acceptedTasks, staleTasks) = await ApplyTasksAsync(userId, request.Tasks, nextVersion, now, rejected, ct);
        var acceptedSessions = await ApplySessionsAsync(userId, request.Sessions, nextVersion, now, rejected, ct);

        var changed = acceptedTasks.Count > 0 || acceptedSessions.Count > 0;
        if (changed)
        {
            await _db.SaveChangesAsync(ct);
            await _db.Database.ExecuteSqlAsync(
                $"""UPDATE "AspNetUsers" SET "SyncVersion" = {nextVersion} WHERE "Id" = {userId}""", ct);
        }

        var cursor = request.Cursor;
        var tasks = await _db.TodoTasks.AsNoTracking()
            .Where(t => t.UserId == userId && (t.Version > cursor || staleTasks.Contains(t.ClientId)))
            .ToListAsync(ct);
        var sessions = await _db.FocusSessions.AsNoTracking()
            .Where(s => s.UserId == userId && s.Version > cursor)
            .ToListAsync(ct);

        return new SyncResponse
        {
            Cursor = changed ? nextVersion : currentVersion,
            // The device already has what it just sent, so leave those rows out.
            Tasks = tasks.Where(t => !acceptedTasks.Contains(t.ClientId)).Select(ToDto).ToList(),
            Sessions = sessions.Where(s => !acceptedSessions.Contains(s.ClientId)).Select(ToDto).ToList(),
            Rejected = rejected,
            ServerTime = ToMillis(now),
        };
    }

    private async Task<(HashSet<Guid> Accepted, HashSet<Guid> Stale)> ApplyTasksAsync(
        string userId, List<TaskDto>? incoming, long version, DateTime now, List<Guid> rejected, CancellationToken ct)
    {
        var accepted = new HashSet<Guid>();
        var stale = new HashSet<Guid>();
        if (incoming is not { Count: > 0 }) return (accepted, stale);

        // If a device sends the same task twice, keep its newest copy.
        var latest = incoming
            .GroupBy(t => t.Id)
            .Select(g => g.MaxBy(t => t.UpdatedAt)!)
            .ToList();

        var ids = latest.Select(t => t.Id).ToList();
        var existing = await _db.TodoTasks
            .Where(t => t.UserId == userId && ids.Contains(t.ClientId))
            .ToDictionaryAsync(t => t.ClientId, ct);

        var liveCount = -1;
        foreach (var dto in latest)
        {
            var updatedAt = ClampTime(dto.UpdatedAt, now);

            if (existing.TryGetValue(dto.Id, out var task))
            {
                if (updatedAt <= task.UpdatedAt)
                {
                    stale.Add(dto.Id);
                    continue;
                }
            }
            else
            {
                if (dto.DeletedAt == null)
                {
                    if (liveCount < 0)
                    {
                        liveCount = await _db.TodoTasks.CountAsync(t => t.UserId == userId && t.DeletedAt == null, ct);
                    }
                    if (liveCount >= MaxTasksPerUser)
                    {
                        rejected.Add(dto.Id);
                        continue;
                    }
                    liveCount++;
                }

                task = new TodoTask { ClientId = dto.Id, UserId = userId };
                _db.TodoTasks.Add(task);
            }

            CopyOnto(task, dto, updatedAt, now);
            task.Version = version;
            accepted.Add(dto.Id);
        }

        return (accepted, stale);
    }

    private async Task<HashSet<Guid>> ApplySessionsAsync(
        string userId, List<SessionDto>? incoming, long version, DateTime now, List<Guid> rejected, CancellationToken ct)
    {
        var accepted = new HashSet<Guid>();
        if (incoming is not { Count: > 0 }) return accepted;

        var latest = incoming.DistinctBy(s => s.Id).ToList();
        var ids = latest.Select(s => s.Id).ToList();
        var known = await _db.FocusSessions
            .Where(s => s.UserId == userId && ids.Contains(s.ClientId))
            .Select(s => s.ClientId)
            .ToListAsync(ct);
        var knownIds = known.ToHashSet();

        var fresh = latest.Where(s => !knownIds.Contains(s.Id)).ToList();
        if (fresh.Count == 0) return accepted;

        var count = await _db.FocusSessions.CountAsync(s => s.UserId == userId, ct);
        foreach (var dto in fresh)
        {
            if (count >= MaxSessionsPerUser)
            {
                rejected.Add(dto.Id);
                continue;
            }
            count++;

            _db.FocusSessions.Add(new FocusSession
            {
                ClientId = dto.Id,
                UserId = userId,
                TaskClientId = dto.TaskId,
                StartedAt = ClampTime(dto.StartedAt, now),
                Seconds = Math.Clamp(dto.Seconds, 1, FocusSession.MaxSeconds),
                Version = version,
            });
            accepted.Add(dto.Id);
        }

        return accepted;
    }

    /// <summary>
    /// Copies a device's task onto the stored row. Values are trimmed and clamped into range
    /// instead of rejected, because one bad row must never block the rest of a device's sync.
    /// </summary>
    private static void CopyOnto(TodoTask task, TaskDto dto, DateTime updatedAt, DateTime now)
    {
        task.UpdatedAt = updatedAt;
        task.CreatedDate = ClampTime(dto.CreatedAt, now);
        task.SortOrder = double.IsFinite(dto.SortOrder) ? dto.SortOrder : 0;
        task.EstimatedMinutes = Math.Clamp(dto.EstimatedMinutes, TodoTask.MinEstimate, TodoTask.MaxEstimate);
        task.Priority = Math.Clamp(dto.Priority, 0, 3);
        task.DueDate = dto.DueDate;

        var repeat = (dto.Repeat ?? string.Empty).Trim().ToLowerInvariant();
        task.Repeat = RepeatRules.Contains(repeat) ? repeat : string.Empty;

        task.IsCompleted = dto.IsCompleted;
        task.CompletedAt = dto.IsCompleted
            ? (dto.CompletedAt is { } completedAt ? ClampTime(completedAt, now) : updatedAt)
            : null;

        if (dto.DeletedAt is { } deletedAt)
        {
            // A deleted task keeps only what other devices need to learn it is gone.
            task.DeletedAt = ClampTime(deletedAt, now);
            task.Title = string.Empty;
            task.Description = string.Empty;
            task.Category = string.Empty;
            return;
        }

        task.DeletedAt = null;
        var title = Clean(dto.Title, TodoTask.TitleMaxLength).Trim();
        task.Title = title.Length > 0 ? title : "Untitled";
        task.Description = Clean(dto.Description, TodoTask.DescriptionMaxLength);
        task.Category = Clean(dto.Category, TodoTask.CategoryMaxLength).Trim();
    }

    private static string Clean(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;

        // PostgreSQL text cannot hold a NUL character.
        var cleaned = value.Contains('\0') ? value.Replace("\0", string.Empty) : value;
        if (cleaned.Length <= maxLength) return cleaned;

        // Do not cut a surrogate pair in half.
        var length = char.IsHighSurrogate(cleaned[maxLength - 1]) ? maxLength - 1 : maxLength;
        return cleaned[..length];
    }

    private static DateTime ClampTime(long unixMillis, DateTime now)
    {
        var latest = now + AllowedClockSkew;
        if (unixMillis <= ToMillis(EarliestTime)) return EarliestTime;
        if (unixMillis >= ToMillis(latest)) return now;
        return DateTimeOffset.FromUnixTimeMilliseconds(unixMillis).UtcDateTime;
    }

    private static long ToMillis(DateTime utc) =>
        new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc)).ToUnixTimeMilliseconds();

    private static TaskDto ToDto(TodoTask task) => new()
    {
        Id = task.ClientId,
        Title = task.Title,
        Description = task.Description,
        Category = task.Category,
        EstimatedMinutes = task.EstimatedMinutes,
        Priority = task.Priority,
        DueDate = task.DueDate,
        Repeat = task.Repeat,
        IsCompleted = task.IsCompleted,
        CompletedAt = task.CompletedAt is { } completedAt ? ToMillis(completedAt) : null,
        SortOrder = task.SortOrder,
        CreatedAt = ToMillis(task.CreatedDate),
        UpdatedAt = ToMillis(task.UpdatedAt),
        DeletedAt = task.DeletedAt is { } deletedAt ? ToMillis(deletedAt) : null,
    };

    private static SessionDto ToDto(FocusSession session) => new()
    {
        Id = session.ClientId,
        TaskId = session.TaskClientId,
        StartedAt = ToMillis(session.StartedAt),
        Seconds = session.Seconds,
    };
}
