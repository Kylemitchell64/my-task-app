using Microsoft.AspNetCore.Identity;

namespace TodoApi.Models;

public class ApplicationUser : IdentityUser
{
    public string? DisplayName { get; set; }
    public string? AvatarUrl { get; set; }

    /// <summary>
    /// Counts up by one each time a sync changes this user's data.
    /// Devices remember the last value they saw and ask only for newer rows.
    /// </summary>
    public long SyncVersion { get; set; }
}
