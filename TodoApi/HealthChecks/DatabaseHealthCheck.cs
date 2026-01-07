using Microsoft.Extensions.Diagnostics.HealthChecks;
using TodoApi.Data;
using Microsoft.EntityFrameworkCore;

namespace TodoApi.HealthChecks;

public class DatabaseHealthCheck : IHealthCheck
{
    private readonly TodoContext _context;
    private readonly ILogger<DatabaseHealthCheck> _logger;

    public DatabaseHealthCheck(TodoContext context, ILogger<DatabaseHealthCheck> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Use a short timeout to fail fast
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
                cancellationToken, 
                timeoutCts.Token);

            // Actually execute a query against the database
            await _context.Database.ExecuteSqlRawAsync(
                "SELECT 1", 
                linkedCts.Token);
            
            return HealthCheckResult.Healthy("Database connection is healthy");
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Database health check timed out");
            return HealthCheckResult.Unhealthy("Database connection timed out");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Database health check failed");
            return HealthCheckResult.Unhealthy(
                "Database connection failed", 
                ex);
        }
    }
}