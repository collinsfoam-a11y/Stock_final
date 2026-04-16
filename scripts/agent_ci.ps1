param(
  [ValidateSet("ci", "python", "node")]
  [string]$Mode = "ci"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-PythonExecutable {
  $candidates = @()
  if ($env:PYTHON_BIN) {
    $candidates += $env:PYTHON_BIN
  }
  $candidates += @(
    (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
    (Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"),
    (Join-Path $ProjectRoot "backend\venv\Scripts\python.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCommand) {
    return $pythonCommand.Source
  }

  throw "Unable to find a Python interpreter. Set PYTHON_BIN to override."
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  try {
    & $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Command exited with code $LASTEXITCODE"
    }
    Write-Host "[ok] $Name"
  } catch {
    Write-Error "[fail] $Name`n$($_.Exception.Message)"
    throw
  }
}

function Invoke-PythonTypecheckNonBlocking {
  param([string]$PythonExe)

  & $PythonExe -m mypy backend --ignore-missing-imports --python-version=3.11
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[ok] python-typecheck"
    return
  }

  Write-Host "[warn] python-typecheck (non-blocking): mypy reported issues"
  $global:LASTEXITCODE = 0
}

$pythonExecutable = Resolve-PythonExecutable

switch ($Mode) {
  "python" {
    Set-Location $ProjectRoot
    Invoke-Step "python-lint" { & $pythonExecutable -m ruff check backend }
    Invoke-PythonTypecheckNonBlocking -PythonExe $pythonExecutable
    Invoke-Step "python-test" { & $pythonExecutable -m pytest backend/tests/ -v --tb=short }
    break
  }
  "node" {
    Set-Location (Join-Path $ProjectRoot "frontend")
    Invoke-Step "node-lint" { npm run lint }
    Invoke-Step "node-typecheck" { npm run typecheck }
    Invoke-Step "node-test" { npm test -- --runInBand --watchAll=false }
    break
  }
  "ci" {
    Set-Location $ProjectRoot
    Invoke-Step "python-lint" { & $pythonExecutable -m ruff check backend }
    Invoke-PythonTypecheckNonBlocking -PythonExe $pythonExecutable
    Invoke-Step "python-test" { & $pythonExecutable -m pytest backend/tests/ -v --tb=short }
    Set-Location (Join-Path $ProjectRoot "frontend")
    Invoke-Step "node-lint" { npm run lint }
    Invoke-Step "node-typecheck" { npm run typecheck }
    Invoke-Step "node-test" { npm test -- --runInBand --watchAll=false }
    Write-Host "[ok] agent-ci complete"
    break
  }
}
