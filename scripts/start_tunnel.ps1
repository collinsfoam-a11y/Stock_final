# Start Cloudflare Tunnel
# PowerShell script for Windows

$ErrorActionPreference = "Stop"

# Kill existing cloudflared processes more thoroughly
Get-Process | Where-Object { $_.ProcessName -match "cloudflared" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "🚀 Starting Cloudflare Tunnel (5d21508f)..." -ForegroundColor Green
Write-Host "   Using config: C:\Users\mknou\.cloudflared\config.yml" -ForegroundColor Gray
Write-Host "   Access via:" -ForegroundColor Cyan
Write-Host "   • https://stock.lavanyaemart.app -> Backend" -ForegroundColor Gray
Write-Host "   • https://app.lavanyaemart.app -> Frontend" -ForegroundColor Gray

cloudflared tunnel --config "C:\Users\mknou\.cloudflared\config.yml" run 5d21508f-0f19-49bc-ab83-009eabd71e8d
