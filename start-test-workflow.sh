#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PROJECT="$SCRIPT_DIR/TodoApi/TodoApi.csproj"
BACKEND_PORT=5001
HEALTH_URL="http://localhost:$BACKEND_PORT/api/diagnostic/health"

echo "📂 Script directory: $SCRIPT_DIR"
echo "📦 Backend project path: $BACKEND_PROJECT"

# --- Ensure Cypress is installed ---
echo "📦 Installing Cypress if needed..."
npx cypress install

# --- Start backend in Test mode ---
echo "🌱 Starting backend in Test mode on port $BACKEND_PORT..."
# Use 'env' command to guarantee the variable passes to dotnet in Git Bash
env ASPNETCORE_ENVIRONMENT=Test dotnet run --project "$BACKEND_PROJECT" --urls "http://localhost:$BACKEND_PORT" &
BACKEND_PID=$!

# --- Wait until backend health endpoint is ready ---
echo "⏳ Waiting for backend to be ready at $HEALTH_URL ..."
until curl -s "$HEALTH_URL" >/dev/null 2>&1; do
    echo "Waiting for backend..."
    sleep 1
done
echo "✅ Backend is ready!"

# --- Launch Cypress GUI ---
echo "🌟 Launching Cypress..."
npx cypress open

# --- Kill backend when Cypress closes ---
kill $BACKEND_PID
