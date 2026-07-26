# Update .env to use SQL Server Authentication
$envFile = "backend\.env"

Write-Host "Updating .env to use SQL Server Authentication..." -ForegroundColor Cyan

if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw

    # Update SQL Server configuration for SQL Auth
    # Use IP address if hostname doesn't resolve for pymssql
    # SECURITY: Password must be provided via environment variable SQL_SERVER_PASSWORD
    $sqlPassword = $env:SQL_SERVER_PASSWORD
    if (-not $sqlPassword) {
        Write-Host "ERROR: SQL_SERVER_PASSWORD environment variable is required" -ForegroundColor Red
        Write-Host "Set it with: `$env:SQL_SERVER_PASSWORD='your-password'" -ForegroundColor Yellow
        exit 1
    }

    $sqlHost = if ($env:SQL_SERVER_HOST) { $env:SQL_SERVER_HOST } else { "192.168.1.109" }
    $sqlPort = if ($env:SQL_SERVER_PORT) { $env:SQL_SERVER_PORT } else { "1433" }
    $sqlDatabase = if ($env:SQL_SERVER_DATABASE) { $env:SQL_SERVER_DATABASE } else { "E_MART_KITCHEN_CARE" }
    $sqlUser = if ($env:SQL_SERVER_USER) { $env:SQL_SERVER_USER } else { "stockapp" }

    $content = $content -replace "SQL_SERVER_HOST=.*", "SQL_SERVER_HOST=$sqlHost"
    $content = $content -replace "SQL_SERVER_PORT=.*", "SQL_SERVER_PORT=$sqlPort"
    $content = $content -replace "SQL_SERVER_DATABASE=.*", "SQL_SERVER_DATABASE=$sqlDatabase"
    $content = $content -replace "SQL_SERVER_USER=.*", "SQL_SERVER_USER=$sqlUser"
    $content = $content -replace "SQL_SERVER_PASSWORD=.*", "SQL_SERVER_PASSWORD=$sqlPassword"

    Set-Content $envFile $content -Encoding UTF8

    Write-Host "Updated configuration:" -ForegroundColor Green
    Write-Host "  SQL_SERVER_HOST=$sqlHost" -ForegroundColor White
    Write-Host "  SQL_SERVER_PORT=$sqlPort" -ForegroundColor White
    Write-Host "  SQL_SERVER_DATABASE=$sqlDatabase" -ForegroundColor White
    Write-Host "  SQL_SERVER_USER=$sqlUser" -ForegroundColor White
    Write-Host "  SQL_SERVER_PASSWORD=*** (from environment)" -ForegroundColor White
    Write-Host ""
    Write-Host "Next: Test connection with:" -ForegroundColor Cyan
    Write-Host "  python backend/test_sql_connection.py" -ForegroundColor Yellow
} else {
    Write-Host "Creating .env file..." -ForegroundColor Yellow
    # SECURITY: Password must be provided via environment variable
    $sqlPassword = $env:SQL_SERVER_PASSWORD
    if (-not $sqlPassword) {
        Write-Host "ERROR: SQL_SERVER_PASSWORD environment variable is required" -ForegroundColor Red
        Write-Host "Set it with: `$env:SQL_SERVER_PASSWORD='your-password'" -ForegroundColor Yellow
        exit 1
    }

    $sqlHost = if ($env:SQL_SERVER_HOST) { $env:SQL_SERVER_HOST } else { "192.168.1.109" }
    $sqlPort = if ($env:SQL_SERVER_PORT) { $env:SQL_SERVER_PORT } else { "1433" }
    $sqlDatabase = if ($env:SQL_SERVER_DATABASE) { $env:SQL_SERVER_DATABASE } else { "E_MART_KITCHEN_CARE" }
    $sqlUser = if ($env:SQL_SERVER_USER) { $env:SQL_SERVER_USER } else { "stockapp" }

    $envContent = @"
SQL_SERVER_HOST=$sqlHost
SQL_SERVER_PORT=$sqlPort
SQL_SERVER_DATABASE=$sqlDatabase
SQL_SERVER_USER=$sqlUser
SQL_SERVER_PASSWORD=$sqlPassword
"@
    Set-Content $envFile $envContent -Encoding UTF8
    Write-Host ".env file created!" -ForegroundColor Green
    Write-Host "Password set from SQL_SERVER_PASSWORD environment variable" -ForegroundColor Green
}
