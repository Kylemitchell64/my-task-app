# --- Build React Frontend ---
# Use Node to build the React app
FROM node:18 AS frontend-build

# Set working directory inside container
WORKDIR /src

# Copy React project into the container
COPY my-todo-app/ ./my-todo-app/

# Install dependencies and build the React app
# Vite outputs build into /dist by default
RUN cd my-todo-app && npm install && npm run build

# --- Build .NET Backend ---
# Use .NET SDK to build the API
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build

# Set working directory for .NET build stage
WORKDIR /src

# Copy API project files
COPY TodoApi/ ./TodoApi/

# Publish the .NET API in Release mode
# Output goes to /src/publish to keep it consistent and accessible in final image
RUN dotnet publish TodoApi/TodoApi.csproj -c Release -o /src/publish

# --- Final Runtime Image ---
# Use lightweight ASP.NET runtime for running the final app
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final

# Set working directory for the final container
WORKDIR /app

# Copy backend publish output from the backend-build stage directly into /app
COPY --from=backend-build /src/publish .

# Copy React build output into the API's wwwroot folder
# React (Vite) build output is in /dist
COPY --from=frontend-build /src/my-todo-app/dist/ ./wwwroot/

# Copy entrypoint script into the container
# This script will previously run migrations before starting the API (NOT ANYMORE)
COPY TodoApi/entrypoint.sh .

# Make the script executable inside the container
RUN chmod +x entrypoint.sh

# Expose port 8080 for the API
# changing default Docker engine port: EXPOSE 8080
EXPOSE 5000

# Optional: Ensure the container runs as a non-root user (safer for production)
# USER appuser

# Start the API using the entrypoint script
# Migrations are removed — entrypoint now only starts the API
ENTRYPOINT ["./entrypoint.sh"]
