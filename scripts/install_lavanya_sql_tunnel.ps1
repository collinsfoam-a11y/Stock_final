# Install/restart Cloudflare tunnel service for sql.lavanyaemart.app
# Run this script as Administrator.

$ErrorActionPreference = "Stop"

$configSource = "$env:USERPROFILE\.cloudflared\config-lavanya-sql.yml"
$configTarget = "$env:USERPROFILE\.cloudflared\config.yml"

if (-not (Test-Path $configSource)) {
    throw "Missing tunnel config: $configSource"
}

Copy-Item -Path $configSource -Destination $configTarget -Force

$service = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue
if (-not $service) {
    cloudflared service install
} else {
    Restart-Service cloudflared
}

Start-Sleep -Seconds 3
cloudflared tunnel info lavanya-sql

Write-Host ""
Write-Host "Tunnel service is running for sql.lavanyaemart.app -> tcp://192.168.1.8:1433" -ForegroundColor Green
