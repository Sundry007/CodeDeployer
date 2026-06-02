$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $repoRoot "release"
$stagingRoot = Join-Path $repoRoot "release-staging"
$packageJson = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$installerName = "$($packageJson.build.productName)-Setup-$($packageJson.version)-x64.exe"
$blockMapName = "$installerName.blockmap"

Set-Location $repoRoot

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "generate-icons.ps1") | Out-Host
& npm.cmd run build

if (Test-Path -LiteralPath $stagingRoot) {
  try {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction Stop
  } catch {
    $stagingRoot = Join-Path $repoRoot ("release-staging-" + (Get-Date -Format "yyyyMMddHHmmss"))
  }
}

& npx.cmd electron-builder --win nsis --x64 "--config.directories.output=$stagingRoot"

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Copy-Item -LiteralPath (Join-Path $stagingRoot $installerName) -Destination (Join-Path $releaseDir $installerName) -Force
Copy-Item -LiteralPath (Join-Path $stagingRoot $blockMapName) -Destination (Join-Path $releaseDir $blockMapName) -Force

Write-Output (Join-Path $releaseDir $installerName)
