using System.Net;
using System.Net.Http.Json;
using TodoApi.Contracts;
using TodoApi.Services;

namespace TodoApi.Tests;

public class SyncTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public SyncTests(ApiFactory factory)
    {
        _factory = factory;
    }

    private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private static TaskDto NewTask(string title, long? updatedAt = null) => new()
    {
        Id = Guid.NewGuid(),
        Title = title,
        Description = "",
        Category = "",
        EstimatedMinutes = 25,
        CreatedAt = updatedAt ?? Now,
        UpdatedAt = updatedAt ?? Now,
    };

    private static async Task<SyncResponse> SyncAsync(
        HttpClient client, long cursor, IEnumerable<TaskDto>? tasks = null, IEnumerable<SessionDto>? sessions = null)
    {
        var response = await client.PostAsJsonAsync("/api/sync", new SyncRequest
        {
            Cursor = cursor,
            Tasks = tasks?.ToList(),
            Sessions = sessions?.ToList(),
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SyncResponse>())!;
    }

    [Fact]
    public async Task Sync_requires_a_token()
    {
        var client = _factory.CreateAnonymousClient();
        var response = await client.PostAsJsonAsync("/api/sync", new SyncRequest());
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Sync_rejects_a_forged_token()
    {
        var client = _factory.CreateAnonymousClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", "not.a.token");
        var response = await client.PostAsJsonAsync("/api/sync", new SyncRequest());
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_task_pushed_by_one_device_is_pulled_by_another()
    {
        var (client, _) = await _factory.SignInAsync();
        var task = NewTask("Read the EF Core docs") with
        {
            Description = "Chapters 1-3",
            Category = "C#",
            EstimatedMinutes = 45,
            Priority = 3,
            DueDate = new DateOnly(2026, 12, 1),
            Repeat = "weekly",
            SortOrder = -2.5,
        };

        var push = await SyncAsync(client, 0, [task]);
        Assert.Equal(1, push.Cursor);
        Assert.Empty(push.Tasks); // the sender is not sent its own change back

        var pull = await SyncAsync(client, 0);
        var pulled = Assert.Single(pull.Tasks);
        Assert.Equal(1, pull.Cursor);
        Assert.Equal(task, pulled with { CompletedAt = null });
    }

    [Fact]
    public async Task A_device_that_is_up_to_date_gets_nothing()
    {
        var (client, _) = await _factory.SignInAsync();
        var push = await SyncAsync(client, 0, [NewTask("One")]);

        var again = await SyncAsync(client, push.Cursor);
        Assert.Empty(again.Tasks);
        Assert.Equal(push.Cursor, again.Cursor);
    }

    [Fact]
    public async Task The_newer_edit_wins_and_the_loser_is_sent_the_winner()
    {
        var (client, _) = await _factory.SignInAsync();
        var original = NewTask("Original", Now - 10_000);
        var cursor = (await SyncAsync(client, 0, [original])).Cursor;

        // Device A edits later than device B, but B syncs last.
        var fromA = original with { Title = "Edited on A", UpdatedAt = Now - 1_000 };
        var fromB = original with { Title = "Edited on B", UpdatedAt = Now - 5_000 };

        var afterA = await SyncAsync(client, cursor, [fromA]);
        Assert.Empty(afterA.Tasks);

        var afterB = await SyncAsync(client, cursor, [fromB]);
        var winner = Assert.Single(afterB.Tasks);
        Assert.Equal("Edited on A", winner.Title);

        var final = Assert.Single((await SyncAsync(client, 0)).Tasks);
        Assert.Equal("Edited on A", final.Title);
    }

    [Fact]
    public async Task A_stale_edit_gets_the_server_copy_even_if_the_device_already_pulled_it()
    {
        var (client, _) = await _factory.SignInAsync();
        var task = NewTask("Current", Now - 1_000);
        var cursor = (await SyncAsync(client, 0, [task])).Cursor;

        var stale = task with { Title = "From a slow clock", UpdatedAt = task.UpdatedAt - 60_000 };
        var result = await SyncAsync(client, cursor, [stale]);

        Assert.Equal("Current", Assert.Single(result.Tasks).Title);
        Assert.Equal(cursor, result.Cursor); // nothing changed, so the version does not move
    }

    [Fact]
    public async Task Deleting_a_task_reaches_other_devices_and_erases_its_content()
    {
        var (client, _) = await _factory.SignInAsync();
        var task = NewTask("Secret plan", Now - 5_000) with { Description = "Do not keep me" };
        var cursor = (await SyncAsync(client, 0, [task])).Cursor;

        var deletedAt = Now;
        await SyncAsync(client, cursor, [task with { UpdatedAt = deletedAt, DeletedAt = deletedAt }]);

        var pulled = Assert.Single((await SyncAsync(client, cursor)).Tasks);
        Assert.Equal(task.Id, pulled.Id);
        Assert.Equal(deletedAt, pulled.DeletedAt);
        Assert.Equal("", pulled.Title);
        Assert.Equal("", pulled.Description);
    }

    [Fact]
    public async Task One_user_can_never_see_or_overwrite_another_users_tasks()
    {
        var (alice, _) = await _factory.SignInAsync();
        var (bob, _) = await _factory.SignInAsync();

        var aliceTask = NewTask("Alice's task", Now - 5_000);
        await SyncAsync(alice, 0, [aliceTask]);

        Assert.Empty((await SyncAsync(bob, 0)).Tasks);

        // Bob sends the same id with a newer timestamp. It must become his own row.
        await SyncAsync(bob, 0, [aliceTask with { Title = "Hijacked", UpdatedAt = Now }]);

        Assert.Equal("Alice's task", Assert.Single((await SyncAsync(alice, 0)).Tasks).Title);
        Assert.Equal("Hijacked", Assert.Single((await SyncAsync(bob, 0)).Tasks).Title);
    }

    [Fact]
    public async Task Out_of_range_values_are_cleaned_up_instead_of_blocking_the_sync()
    {
        var (client, _) = await _factory.SignInAsync();
        var messy = NewTask(new string('x', 500)) with
        {
            Description = new string('d', 5_000) + "\0",
            Category = "  spaced  ",
            EstimatedMinutes = 99_999,
            Priority = 42,
            Repeat = "every-full-moon",
            IsCompleted = true,
            CompletedAt = null,
            UpdatedAt = Now + (long)TimeSpan.FromDays(3650).TotalMilliseconds,
        };
        var blank = NewTask("   ");

        await SyncAsync(client, 0, [messy, blank]);
        var stored = (await SyncAsync(client, 0)).Tasks.ToDictionary(t => t.Id);

        var cleaned = stored[messy.Id];
        Assert.Equal(200, cleaned.Title!.Length);
        Assert.Equal(2_000, cleaned.Description!.Length);
        Assert.Equal("spaced", cleaned.Category);
        Assert.Equal(1_440, cleaned.EstimatedMinutes);
        Assert.Equal(3, cleaned.Priority);
        Assert.Equal("", cleaned.Repeat);
        Assert.NotNull(cleaned.CompletedAt);
        Assert.True(cleaned.UpdatedAt <= Now + 5_000, "a timestamp from the far future is pulled back to now");

        Assert.Equal("Untitled", stored[blank.Id].Title);
    }

    [Fact]
    public async Task Script_content_is_stored_as_plain_text()
    {
        var (client, _) = await _factory.SignInAsync();
        const string payload = "<script>alert('xss')</script>";
        await SyncAsync(client, 0, [NewTask(payload)]);

        Assert.Equal(payload, Assert.Single((await SyncAsync(client, 0)).Tasks).Title);
    }

    [Fact]
    public async Task Focus_sessions_are_saved_once_and_shared_between_devices()
    {
        var (client, _) = await _factory.SignInAsync();
        var session = new SessionDto { Id = Guid.NewGuid(), TaskId = Guid.NewGuid(), StartedAt = Now - 60_000, Seconds = 1_500 };

        var first = await SyncAsync(client, 0, sessions: [session]);
        Assert.Empty(first.Sessions);

        // Sending it again changes nothing.
        var second = await SyncAsync(client, first.Cursor, sessions: [session with { Seconds = 9 }]);
        Assert.Equal(first.Cursor, second.Cursor);

        Assert.Equal(session, Assert.Single((await SyncAsync(client, 0)).Sessions));
    }

    [Fact]
    public async Task A_cursor_ahead_of_the_server_asks_the_device_to_send_everything_again()
    {
        var (client, _) = await _factory.SignInAsync();
        var result = await SyncAsync(client, 9_999);

        Assert.True(result.Reset);
        Assert.Equal(0, result.Cursor);
    }

    [Fact]
    public async Task Too_many_items_in_one_request_is_refused()
    {
        var (client, _) = await _factory.SignInAsync();
        var tasks = Enumerable.Range(0, SyncService.MaxItemsPerRequest + 1).Select(i => NewTask($"Task {i}"));

        var response = await client.PostAsJsonAsync("/api/sync", new SyncRequest { Tasks = tasks.ToList() });
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task A_full_batch_is_accepted()
    {
        var (client, _) = await _factory.SignInAsync();
        var tasks = Enumerable.Range(0, SyncService.MaxItemsPerRequest).Select(i => NewTask($"Task {i}")).ToList();

        await SyncAsync(client, 0, tasks);
        Assert.Equal(tasks.Count, (await SyncAsync(client, 0)).Tasks.Count);
    }

    [Fact]
    public async Task A_negative_cursor_is_a_bad_request()
    {
        var (client, _) = await _factory.SignInAsync();
        var response = await client.PostAsJsonAsync("/api/sync", new SyncRequest { Cursor = -1 });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Malformed_json_is_a_bad_request()
    {
        var (client, _) = await _factory.SignInAsync();
        var response = await client.PostAsync("/api/sync",
            new StringContent("{ \"tasks\": [ { \"id\": \"nope\" } ] }", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Devices_syncing_at_the_same_time_never_miss_each_others_changes()
    {
        var (client, _) = await _factory.SignInAsync();
        const int devices = 12;

        // Every device pushes one task at once, each starting from cursor 0.
        var results = await Task.WhenAll(Enumerable.Range(0, devices)
            .Select(i => SyncAsync(client, 0, [NewTask($"Device {i}")])));

        // Versions are handed out one at a time with no gaps or duplicates.
        Assert.Equal(Enumerable.Range(1, devices).Select(i => (long)i), results.Select(r => r.Cursor).Order());

        // A device that continues from the cursor it was given ends up with every task.
        foreach (var result in results)
        {
            var catchUp = await SyncAsync(client, result.Cursor);
            Assert.Equal(devices, 1 + result.Tasks.Count + catchUp.Tasks.Count);
        }
    }
}
