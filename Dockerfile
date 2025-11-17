# --- Build React Frontend ---
# Use Node to build the React app
FROM node:18 AS frontend-build

# Set working directory inside container
WORKDIR /src

# Copy React project into the container
COPY my-todo-app/ ./my-todo-app/

# Install dependencies and build the React app
RUN cd my-todo-app && npm install && npm run build



# --- Build .NET Backend ---
# Use .NET SDK to build the API
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build

# Set working directory for .NET build stage
WORKDIR /src

# Copy API project files
COPY TodoApi/ ./TodoApi/

# Publish the .NET API in Release mode
RUN dotnet publish TodoApi/TodoApi.csproj -c Release -o /app/publish



# --- Final Runtime Image ---
# Use lightweight ASP.NET runtime for running the final app
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final

# Set working directory for the final container
WORKDIR /app

# Copy backend publish output from the backend-build stage
COPY --from=backend-build /app/publish ./publish

# Copy React build output into the API's wwwroot folder
COPY --from=frontend-build /src/my-todo-app/dist/ ./publish/wwwroot/



# Expose port 8080 for the API
EXPOSE 8080

# Start the API
CMD ["dotnet", "TodoApi.dll"]
