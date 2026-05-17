param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$skipDirs = @(".git", "node_modules", ".venv")
$cacheDirs = @("__pycache__", ".pytest_cache", ".mypy_cache", ".hypothesis", ".ruff_cache", ".next")
$filePatterns = @("*.pyc", "*.pyo")

function Remove-MatchingDirectories {
    param(
        [string]$Path
    )

    foreach ($entry in Get-ChildItem -LiteralPath $Path -Force) {
        if ($entry.PSIsContainer) {
            if ($skipDirs -contains $entry.Name) {
                continue
            }

            if ($cacheDirs -contains $entry.Name) {
                Write-Host $entry.FullName
                Remove-Item -LiteralPath $entry.FullName -Recurse -Force
                continue
            }

            Remove-MatchingDirectories -Path $entry.FullName
        }
    }
}

function Remove-MatchingFiles {
    param(
        [string]$Path
    )

    foreach ($entry in Get-ChildItem -LiteralPath $Path -Force) {
        if ($entry.PSIsContainer) {
            if ($skipDirs -contains $entry.Name) {
                continue
            }

            Remove-MatchingFiles -Path $entry.FullName
            continue
        }

        foreach ($pattern in $filePatterns) {
            if ($entry.Name -like $pattern) {
                Write-Host $entry.FullName
                Remove-Item -LiteralPath $entry.FullName -Force
                break
            }
        }
    }
}

Write-Host "Cleaning build artifacts..."
Remove-MatchingDirectories -Path $repoRoot
Remove-MatchingFiles -Path $repoRoot
Write-Host "Cleanup complete!"
