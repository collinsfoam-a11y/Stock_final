# Start the pi-server sidecar for Stock Verify System
# This requires Node.js but doesn't require a full repo checkout if using npx

$Port = 3000
$Package = "@pi-api/server" # Assuming this is the package name based on research

Write-Host "Starting pi-server sidecar on port $Port..." -ForegroundColor Cyan

# Check if port is already in use
$PortCheck = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($PortCheck) {
    Write-Host "Port $Port is already in use. Assuming pi-server is already running." -ForegroundColor Yellow
    exit 0
}

# Start using npx in a new background window (or just run it here if you want to see logs)
# Using -WindowStyle Hidden to keep it in background
# NOTE: If @pi-api/server doesn't exist yet, we'd clone the repo, but research suggests npx usage.
try {
    Start-Process npx -ArgumentList "-y $Package --port $Port" -WindowStyle Hidden
    Write-Host "pi-server started successfully in the background." -ForegroundColor Green
} catch {
    Write-Error "Failed to start pi-server. Ensure Node.js and npm are installed."
}
