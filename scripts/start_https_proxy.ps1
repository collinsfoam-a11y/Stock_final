# Start HTTPS reverse proxies for the LAN web client.
#
#   https://<lan-ip>:8443  -> http://127.0.0.1:8081  (Expo web dev server)
#   https://<lan-ip>:8444  -> http://127.0.0.1:8001  (FastAPI backend)
#
# Why two ports: backend stays HTTP so native devices keep using
# http://<lan-ip>:8001 unchanged; web gets HTTPS so OPFS / SQLite /
# crypto.randomUUID work in a secure context.
#
# Requires mkcert-generated cert at nginx/ssl/{fullchain,privkey}.pem.

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$CertDir = Join-Path $ProjectRoot "nginx\ssl"
$CertFile = Join-Path $CertDir "fullchain.pem"
$KeyFile = Join-Path $CertDir "privkey.pem"

if (-not (Test-Path $CertFile) -or -not (Test-Path $KeyFile)) {
    Write-Host "Missing certs at $CertDir" -ForegroundColor Red
    Write-Host "Generate them first by running (from project root):" -ForegroundColor Yellow
    Write-Host "  .\tools\mkcert.exe -cert-file nginx/ssl/fullchain.pem -key-file nginx/ssl/privkey.pem 192.168.31.108 localhost 127.0.0.1" -ForegroundColor Cyan
    Write-Host "(replace 192.168.31.108 with your LAN IP)" -ForegroundColor Yellow
    exit 1
}

$ExpoSource = if ($env:HTTPS_PROXY_PORT) { $env:HTTPS_PROXY_PORT } else { "8443" }
$ExpoTarget = if ($env:EXPO_WEB_PORT) { $env:EXPO_WEB_PORT } else { "8081" }
$BackendSource = if ($env:HTTPS_BACKEND_PORT) { $env:HTTPS_BACKEND_PORT } else { "8444" }
$BackendTarget = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8001" }

# Kill anything already on the proxy ports
foreach ($p in @($ExpoSource, $BackendSource)) {
    $existing = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $existing) {
        try { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } catch {}
    }
}

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $runner = "pnpm"
    $runnerArgs = @("dlx")
} else {
    $runner = "npx"
    $runnerArgs = @("--yes")
}

Write-Host "Starting backend TLS proxy: https://0.0.0.0:$BackendSource -> http://127.0.0.1:$BackendTarget" -ForegroundColor Green
$backendArgs = $runnerArgs + @("local-ssl-proxy", "--source", $BackendSource, "--target", $BackendTarget, "--cert", $CertFile, "--key", $KeyFile, "--hostname", "0.0.0.0")
$backendProc = Start-Process -FilePath $runner -ArgumentList $backendArgs -PassThru -NoNewWindow

Start-Sleep -Seconds 1

Write-Host "Starting Expo TLS proxy: https://0.0.0.0:$ExpoSource -> http://127.0.0.1:$ExpoTarget" -ForegroundColor Green
Write-Host "Open https://<your-lan-ip>:$ExpoSource in the browser." -ForegroundColor Cyan
$expoArgs = $runnerArgs + @("local-ssl-proxy", "--source", $ExpoSource, "--target", $ExpoTarget, "--cert", $CertFile, "--key", $KeyFile, "--hostname", "0.0.0.0")

try {
    & $runner @expoArgs
} finally {
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
}
