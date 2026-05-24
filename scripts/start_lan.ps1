# ============================================================================
# Start App for LAN Access (Windows)
# Opens backend + Expo in separate terminal windows, both reachable on the LAN
# Usage:  .\scripts\start_lan.ps1
# ============================================================================

$ErrorActionPreference = "Continue"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName
$FrontendDir = Join-Path $ProjectRoot "frontend"

# ---------------------------------------------------------------------------
# 1. Detect LAN IP
# ---------------------------------------------------------------------------
$lanIp = (
    Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notmatch '^127\.' -and
        $_.IPAddress -notmatch '^169\.254\.' -and
        $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object -Property { ($_.IPAddress -split '\.')[0..2] -join '.' } |
    Select-Object -First 1
).IPAddress

if (-not $lanIp) {
    Write-Warning "Could not detect LAN IP automatically. Using localhost."
    $lanIp = "localhost"
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Stock Verify - LAN Launcher (Windows)"     -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  LAN IP detected : $lanIp"                  -ForegroundColor Green
Write-Host "  Backend URL     : http://${lanIp}:8001"    -ForegroundColor Green
Write-Host "  Expo Metro      : http://${lanIp}:8081"    -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 2. Update frontend .env with the detected backend URL
# ---------------------------------------------------------------------------
Write-Host "Updating frontend .env with backend URL..." -ForegroundColor Yellow
$updateIpScript = Join-Path $FrontendDir "scripts\update-ip.js"
if (Test-Path $updateIpScript) {
    & node $updateIpScript
    Write-Host "  frontend/.env updated" -ForegroundColor Gray
} else {
    Write-Warning "update-ip.js not found; skipping .env update"
}

# ---------------------------------------------------------------------------
# 3. Launch Backend in a new PowerShell window
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Starting Backend in new window..." -ForegroundColor Green
$backendScript = Join-Path $ScriptDir "start_backend.ps1"
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-File", "`"$backendScript`""
)
Write-Host "  Backend window launched" -ForegroundColor Gray

# Give backend a head-start before opening Expo
Start-Sleep -Seconds 4

# ---------------------------------------------------------------------------
# 4. Launch Frontend (Expo LAN mode) in a new PowerShell window
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Starting Expo in LAN mode in new window..." -ForegroundColor Green

$expoCmd = @(
    "`$env:REACT_NATIVE_PACKAGER_HOSTNAME = '$lanIp'"
    "`$env:EXPO_DEV_CLIENT_NETWORK_INSPECTOR = 'false'"
    "Set-Location '$FrontendDir'"
    "Write-Host 'Expo LAN Mode - serving on $lanIp' -ForegroundColor Cyan"
    "npx expo start --lan --clear"
) -join [Environment]::NewLine

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command", $expoCmd
)
Write-Host "  Expo window launched" -ForegroundColor Gray

# ---------------------------------------------------------------------------
# 5. Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Both services are starting!"               -ForegroundColor Green
Write-Host ""
Write-Host "  Backend API   http://${lanIp}:8001/docs"  -ForegroundColor White
Write-Host "  Expo web      http://${lanIp}:8081"       -ForegroundColor White
Write-Host ""
Write-Host "  On your phone:"                           -ForegroundColor Yellow
Write-Host "    1. Open the Expo Go app"                -ForegroundColor Gray
Write-Host "    2. Scan the QR code in the Expo window" -ForegroundColor Gray
Write-Host "    3. Make sure phone is on the same WiFi" -ForegroundColor Gray
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
