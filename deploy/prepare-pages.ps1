# Prepares dist/ for static hosting (GitHub Pages, Netlify, etc.)
# Run after scripts/build.ps1

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DistDir = Join-Path $ProjectRoot 'dist'
$PlayHtml = Join-Path $DistDir 'play.html'

if (-not (Test-Path $PlayHtml)) {
    Write-Error "dist/play.html not found. Run build.bat or scripts/build.ps1 first."
}

Copy-Item $PlayHtml (Join-Path $DistDir 'index.html') -Force
New-Item (Join-Path $DistDir '.nojekyll') -ItemType File -Force | Out-Null

# Also sync repo root so branch-based GitHub Pages (and opening index.html) works.
# GitHub Actions still deploys dist/; root copies are a fallback when Pages source is "Deploy from a branch".
Copy-Item $PlayHtml (Join-Path $ProjectRoot 'index.html') -Force
Copy-Item $PlayHtml (Join-Path $ProjectRoot 'play.html') -Force
New-Item (Join-Path $ProjectRoot '.nojekyll') -ItemType File -Force | Out-Null

Write-Host "  Prepared dist/ for web hosting (index.html + .nojekyll)" -ForegroundColor Green
Write-Host "  Synced root index.html + play.html for branch Pages / local open" -ForegroundColor Green
