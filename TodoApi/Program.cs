using Microsoft.EntityFrameworkCore;
using TodoApi.Data;
using Npgsql.EntityFrameworkCore.PostgreSQL;

var builder = WebApplication.CreateBuilder(args);

// removed this to add my real database
// builder.Services.AddDbContext<TodoContext>(options =>
//     options.UseSqlite("Data Source=todo.db"));

// didn't work
// builder.Services.AddDbContext<TodoContext>(options =>
//     options.UseNpgsql("postgresql://postgres:[Killapilla200!]@db.okhzxsfgyefzouihxqud.supabase.co:5432/postgres"));

// Use PostgreSQL connection string from appsettings.json
builder.Services.AddDbContext<TodoContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReact", policy =>
    {
        policy.WithOrigins("http://localhost:5173") // React dev server URL
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseCors("AllowReact");  // Browsers block requests between different ports for security. 
                            // CORS says "it's okay, these two apps are allowed to talk."

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

//app.UseHttpsRedirection(); // was causing Failed to determine the https port for redirect.

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

// app.MapGet("/weatherforecast", () =>
// {
//     var forecast =  Enumerable.Range(1, 5).Select(index =>
//         new WeatherForecast
//         (
//             DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
//             Random.Shared.Next(-20, 55),
//             summaries[Random.Shared.Next(summaries.Length)]
//         ))
//         .ToArray();
//     return forecast;
// })
// .WithName("GetWeatherForecast")
// .WithOpenApi();

app.UseDefaultFiles(); // Serve index.html by default
app.UseStaticFiles();  // Serve static files from wwwroot folder

app.MapControllers();   // Map API controllers

// app.AddCors(policy =>
// {
//     policy.AllowAnyHeader();
//     policy.AllowAnyMethod();
//     policy.AllowAnyOrigin(); // allows all, only allow one 
// });

// Fallback to index.html for SPA routes
app.MapFallbackToFile("index.html"); // ensures React SPA routing works

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
