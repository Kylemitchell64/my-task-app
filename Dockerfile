# --- Build Backend ---
FROM mcr.microsoft.com/dotnet/sdk:7.0 AS backend-build

WORKDIR /src
COPY TodoApi/ ./TodoApi/

# Restore and publish
RUN dotnet restore TodoApi/TodoApi.csproj
RUN dotnet build TodoApi/TodoApi.csproj -c Release
RUN dotnet publish TodoApi/TodoApi.csproj -c Release -o /src/publish

# --- Apply EF Core Migrations during build ---
# Optional: only if you want migrations applied at build
# This requires your database to be reachable from the build stage
# RUN dotnet ef database update --project TodoApi/TodoApi.csproj

# --- Final runtime image ---
FROM mcr.microsoft.com/dotnet/aspnet:7.0 AS final
WORKDIR /app

# Copy published backend
COPY --from=backend-build /src/publish . 

# Copy frontend build if using Vite
COPY frontend-dist/ ./wwwroot/

# Copy entrypoint if needed for other runtime commands
COPY TodoApi/entrypoint.sh .
RUN chmod +x entrypoint.sh

# Expose port
EXPOSE 80

# Run the app
ENTRYPOINT ["dotnet", "TodoApi.dll"]
