using Microsoft.EntityFrameworkCore;
using TodoApi.Data;

var builder = WebApplication.CreateBuilder(args);

// ======================================================
// SELECT CONNECTION STRING BASED ON ENVIRONMENT
// - DefaultConnection → normal dev / prod DB
// - TestConnection    → isolated Cypress TEST DB
// Triggered by: ASPNETCORE_ENVIRONMENT=Test
// ======================================================
var connectionString = builder.Configuration.GetConnectionString(
    Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Test"
        ? "TestConnection"
        : "DefaultConnection"
);

// Configure PostgreSQL using connection string from appsettings.json
builder.Services.AddDbContext<TodoContext>(options =>
    options.UseNpgsql(connectionString)
);

builder.Services.AddHealthChecks()
    .AddCheck<TodoApi.HealthChecks.DatabaseHealthCheck>(
        "database",
        tags: new[] { "ready" }
    );

// Configure CORS for React frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
            "http://localhost:5173",
            "http://localhost:3000",
            "http://localhost",
            "https://portfolio-lemon-mu-85.vercel.app",
            "https://www.kylehmitchell.com"
        )
        .AllowAnyHeader()
        .AllowAnyMethod();
    });
});

// Add controllers and Swagger/OpenAPI
//builder.Services.AddControllers();
builder.Services
    .AddControllers(options =>
    {
        options.ReturnHttpNotAcceptable = true;
    })
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy =
            System.Text.Json.JsonNamingPolicy.CamelCase;
    });
//Was causing backend to send PascalCase JSON
//  not camelCase, which the React frontend expects
/**
.AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = null;
});
**/

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Enable CORS
//app.UseCors("AllowReact");
app.UseCors("AllowFrontend");

// Swagger in development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

//middleware to set security headers
app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        return Task.CompletedTask;
    });

    await next();   //prevents blocking the request pipeline
});

/** duplicate headers & intefered with response constructiuon
app.Use(async (context, next) =>
{
    context.Response.Headers.Add("X-Content-Type-Options", "nosniff");
    await next();
});
**/

// **Routing must come before static files for API**
app.UseRouting();

// Map controllers first
app.MapControllers();

// Health check endpoint for Cypress e2e tests
app.MapHealthChecks("/api/diagnostic/health");

//REMOVED STATIC FILE MIDDLEWARE
//REMOVING SPA FALLBACK AS NGINX WILL HANDLE IT
/**
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
**/


//Automigrate DB on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TodoContext>();
    db.Database.Migrate();
}


app.Run();