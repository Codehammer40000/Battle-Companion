# Builds dist/, prepares index.html, and zips for drag-and-drop upload (Netlify / GitHub web UI)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DeployDir = Join-Path $PSScriptRoot ''
$DistDir = Join-Path $ProjectRoot 'dist'
$ZipPath = Join-Path $DeployDir 'wh40k-battle-guide-web.zip'

& (Join-Path $ProjectRoot 'scripts\build.ps1')
& (Join-Path $DeployDir 'prepare-pages.ps1')

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

# Zip contents of dist/ (not the dist folder itself) so index.html is at archive root
$items = Get-ChildItem -Path $DistDir -Force
Compress-Archive -Path ($items | ForEach-Object { $_.FullName }) -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "  Ready to upload: deploy\wh40k-battle-guide-web.zip" -ForegroundColor Green
Write-Host "  Or upload the dist\ folder to Netlify Drop / GitHub Pages." -ForegroundColor Cyan
Write-Host "  See deploy\BROWSER-UPLOAD.md for steps." -ForegroundColor Gray
Write-Host ""
