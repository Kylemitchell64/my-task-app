using Microsoft.EntityFrameworkCore;
using TodoApi.Data;

var builder = WebApplication.CreateBuilder(args);

// Configure PostgreSQL using connection string from appsettings.json
builder.Services.AddDbContext<TodoContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddHealthChecks()
    .AddCheck<TodoApi.HealthChecks.DatabaseHealthCheck>(
        "database",
        tags: new[] { "ready" }
    );

// Configure CORS for React frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReact", policy =>
    {
        policy.WithOrigins("http://localhost:5173") // React dev server
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Add controllers and Swagger/OpenAPI
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Enable CORS
app.UseCors("AllowReact");

// Swagger in development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// **Routing must come before static files for API**
app.UseRouting();

// Map controllers first
app.MapControllers();

// Serve SPA static files **after API routes**
app.UseDefaultFiles();
app.UseStaticFiles();

// SPA fallback for non-API routes
app.MapFallback(context =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = 404;
        return Task.CompletedTask;
    }

    context.Response.ContentType = "text/html";
    return context.Response.SendFileAsync("wwwroot/index.html");
});

app.Run();