#!/bin/bash
set -e

echo "Starting ASP.NET API on port 80..."
dotnet TodoApi.dll
