# Start Backend Server - Ensures only one instance runs
# PowerShell script for Windows

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $ProjectRoot "backend"
$MongoDataDir = Join-Path $BackendDir "data\db"
$MongoLogFile = Join-Path $ProjectRoot "mongo-dev.out.log"
$BundledMongod = Join-Path $ProjectRoot ".runtime\mongodb-7.0.15\mongodb-win32-x86_64-windows-7.0.15\bin\mongod.exe"

function Test-MongodBinary {
    param([string]$Path)

    if (-not $Path -or -not (Test-Path $Path)) {
        return $false
    }

    try {
        & $Path --version *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Resolve-MongodBinary {
    if ($env:MONGOD_BIN -and (Test-MongodBinary $env:MONGOD_BIN)) {
        return $env:MONGOD_BIN
    }

    $command = Get-Command mongod.exe -ErrorAction SilentlyContinue
    if ($command -and (Test-MongodBinary $command.Source)) {
        return $command.Source
    }

    if (Test-MongodBinary $BundledMongod) {
        return $BundledMongod
    }

    throw "No working mongod binary found. Install MongoDB or restore $BundledMongod"
}

function Ensure-LocalMongo {
    $existing = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "MongoDB already listening on 27017" -ForegroundColor Gray
        return
    }

    $mongod = Resolve-MongodBinary
    New-Item -ItemType Directory -Force -Path $MongoDataDir | Out-Null
    Write-Host "Starting local MongoDB..." -ForegroundColor Green
    Write-Host "   Binary: $mongod" -ForegroundColor Gray

    Start-Process -FilePath $mongod `
        -ArgumentList @("--dbpath", $MongoDataDir, "--port", "27017", "--bind_ip", "127.0.0.1", "--logpath", $MongoLogFile, "--logappend") `
        -WindowStyle Hidden | Out-Null

    $deadline = (Get-Date).AddSeconds(35)
    do {
        Start-Sleep -Milliseconds 500
        $existing = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
    } until ($existing -or (Get-Date) -gt $deadline)

    if (-not $existing) {
        throw "MongoDB did not start on 27017. Check $MongoLogFile"
    }
}

Write-Host "Checking for existing backend instances..." -ForegroundColor Yellow

# Kill existing backend processes
Get-Process | Where-Object {
    $_.ProcessName -match "python" -and
    $_.CommandLine -match "server\.py"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill processes on common backend ports
$ports = @(8000, 8001, 8002, 8003, 8004, 8005)
foreach ($port in $ports) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
                 Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processes) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Write-Host "   Killed process on port $port (PID: $processId)" -ForegroundColor Gray
        } catch {}
    }
}

Start-Sleep -Seconds 2

Ensure-LocalMongo

Write-Host "Starting backend server..." -ForegroundColor Green

Set-Location $BackendDir
$env:PYTHONPATH = "$ProjectRoot;$env:PYTHONPATH"
$env:PYTHONUTF8 = 1

# Backend stays HTTP; TLS is terminated by start_https_proxy.ps1 so native
# devices can keep using http://lan:8001 while web uses https://lan:8444.
# Set DISABLE_SSL=false in your env to force backend-native HTTPS.
if (-not $env:DISABLE_SSL) { $env:DISABLE_SSL = "true" }

python server.py
