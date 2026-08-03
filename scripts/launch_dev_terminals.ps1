# Launch Backend and Frontend in Separate Developer Terminals
# PowerShell Script

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

Write-Host "🚀 Launching Developer Terminals..." -ForegroundColor Cyan

# 1. Start Backend
Write-Host "   Starting Backend Terminal..." -ForegroundColor Green
$BackendScript = Join-Path $ScriptDir "start_backend.ps1"
if (Test-Path $BackendScript) {
    Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$BackendScript`""
} else {
    Write-Error "Backend script not found: $BackendScript"
}

# 2. Start Frontend
Write-Host "   Starting Frontend Terminal..." -ForegroundColor Green
$FrontendScript = Join-Path $ScriptDir "start_frontend.ps1"
if (Test-Path $FrontendScript) {
    Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$FrontendScript`""
} else {
    Write-Error "Frontend script not found: $FrontendScript"
}

Write-Host ""
Write-Host "✅ Terminals launched!" -ForegroundColor Cyan
Write-Host "   • Backend running on port 8001 (http://localhost:8001/docs)" -ForegroundColor Gray
Write-Host "   • Frontend running on port 8081 (http://localhost:8081)" -ForegroundColor Gray
