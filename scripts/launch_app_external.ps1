# Launch App External - Orchestrator for Backend, Frontend, and Tunnel
# PowerShell script for Windows

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🚀 Launching Application Externally..." -ForegroundColor Cyan

# 1. Start Backend
Write-Host "   Starting Backend Terminal..." -ForegroundColor Green
$BackendScript = Join-Path $ScriptDir "start_backend.ps1"
if (Test-Path $BackendScript) {
    Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$BackendScript`""
} else {
    Write-Error "Backend script not found: $BackendScript"
}

# 2. Wait for Backend
Start-Sleep -Seconds 3

# 3. Start Frontend
Write-Host "   Starting Frontend Terminal..." -ForegroundColor Green
$FrontendScript = Join-Path $ScriptDir "start_frontend.ps1"
if (Test-Path $FrontendScript) {
    Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$FrontendScript`""
} else {
    Write-Error "Frontend script not found: $FrontendScript"
}

# 4. Start Cloudflare Tunnel
Write-Host "   Starting Cloudflare Tunnel Terminal..." -ForegroundColor Green
$TunnelScript = Join-Path $ScriptDir "start_tunnel.ps1"
if (Test-Path $TunnelScript) {
    Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$TunnelScript`""
} else {
    Write-Error "Tunnel script not found: $TunnelScript"
}

Write-Host ""
Write-Host "✅ All terminals launched!" -ForegroundColor Cyan
Write-Host "   • Backend: http://127.0.0.1:8001" -ForegroundColor Gray
Write-Host "   • Frontend: http://127.0.0.1:8081" -ForegroundColor Gray
Write-Host "   • Cloudflare active (if tunnel is authenticated)" -ForegroundColor Gray
