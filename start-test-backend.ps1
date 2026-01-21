# start-test-backend.ps1
$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting TodoApi in TEST environment on http://localhost:5001 ..."

# Set environment
$env:ASPNETCORE_ENVIRONMENT="Test"

# Start the backend in a separate process
$backend = Start-Process -NoNewWindow -PassThru -FilePath "dotnet" -ArgumentList "run --project TodoApi/TodoApi.csproj --urls http://localhost:5001"

# Wait for backend to be ready
Write-Host "⏳ Waiting for backend to start..."
$backendReady = $false

while (-not $backendReady) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:5001/api/diagnostic/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) {
            $backendReady = $true
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

Write-Host "✅ Backend is ready. Opening Cypress..."
# Open Cypress
npx cypress open
