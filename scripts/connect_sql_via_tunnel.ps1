# Start a local TCP proxy to SQL Server through Cloudflare Tunnel.
# Keep this window open while using SSMS, Azure Data Studio, or sqlcmd.

$hostname = "sql.lavanyaemart.app"
$localPort = 14330

Write-Host "Starting Cloudflare TCP proxy..." -ForegroundColor Cyan
Write-Host "Connect your SQL client to: localhost,$localPort" -ForegroundColor Green
Write-Host "Hostname override (if needed): $hostname" -ForegroundColor Yellow
Write-Host ""

cloudflared access tcp --hostname $hostname --url "127.0.0.1:$localPort"
