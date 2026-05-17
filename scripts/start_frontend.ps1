# Start Frontend (Expo) - Ensures only one instance runs
# PowerShell script for Windows

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $ProjectRoot "frontend"

Write-Host "ðŸ” Checking for existing frontend instances..." -ForegroundColor Yellow

# Kill existing Expo/Metro processes
Get-Process | Where-Object {
    $_.ProcessName -match "node" -and
    ($_.CommandLine -match "expo" -or $_.CommandLine -match "metro")
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill processes on common frontend ports
$ports = @(8081, 19000, 19001)
foreach ($port in $ports) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($processes) {
        $pids = $processes | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "   Killed process on port $port (PID: $procId)" -ForegroundColor Gray
            } catch {}
        }
    }
}

Start-Sleep -Seconds 2

Write-Host "ðŸš€ Starting frontend (Expo)..." -ForegroundColor Green

Set-Location $FrontendDir

# Clear caches
Write-Host "ðŸ§¹ Clearing caches..." -ForegroundColor Cyan
Remove-Item -Path ".metro-cache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "node_modules\.cache" -Recurse -Force -ErrorAction SilentlyContinue
$expoCache = Join-Path $env:USERPROFILE ".expo\cache"
if (Test-Path $expoCache) {
    Remove-Item -Path $expoCache -Recurse -Force -ErrorAction SilentlyContinue
}

npx expo start --web --clear
