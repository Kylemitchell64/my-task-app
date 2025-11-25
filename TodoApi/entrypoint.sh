#!/bin/bash
# Tell the system to use bash to run this script

set -e
# Stop the script immediately if any command fails (prevents weird errors later)

echo "Starting ASP.NET API..."
# Print a message so you know the API is starting

dotnet TodoApi.dll
# Start the compiled ASP.NET API
