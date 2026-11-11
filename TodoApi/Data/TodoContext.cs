using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Data;

public class TodoContext : IdentityDbContext<ApplicationUser>
{
    public TodoContext(DbContextOptions<TodoContext> options) : base(options) { }

    public DbSet<TodoTask> TodoTasks => Set<TodoTask>();
    public DbSet<FocusSession> FocusSessions => Set<FocusSession>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuthCode> AuthCodes => Set<AuthCode>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<TodoTask>(task =>
        {
            // Existing rows get an id from the database when the column is added.
            task.Property(t => t.ClientId).HasDefaultValueSql("gen_random_uuid()");
            task.Property(t => t.UpdatedAt).HasDefaultValueSql("now()");
            task.HasIndex(t => new { t.UserId, t.ClientId }).IsUnique();
            task.HasIndex(t => new { t.UserId, t.Version });
        });

        builder.Entity<FocusSession>(session =>
        {
            session.Property(s => s.UserId).IsRequired();
            session.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            session.HasIndex(s => new { s.UserId, s.Version });
        });

        builder.Entity<RefreshToken>(token =>
        {
            token.Property(t => t.UserId).IsRequired();
            token.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
            token.HasIndex(t => t.TokenHash).IsUnique();
            token.HasIndex(t => t.UserId);
            token.HasIndex(t => t.FamilyId);
        });

        builder.Entity<AuthCode>(code =>
        {
            code.HasKey(c => c.CodeHash);
            code.Property(c => c.CodeHash).HasMaxLength(64);
            code.Property(c => c.UserId).IsRequired();
        });
    }
}
