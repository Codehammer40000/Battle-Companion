# Validates app files, bundles JS, builds single-file play.html, copies to dist\

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$AppDir = Join-Path $ProjectRoot 'app'
$DistDir = Join-Path $ProjectRoot 'dist'

Write-Host ""
Write-Host "  WH40k Battle Guide - Build (no Node.js)" -ForegroundColor Yellow
Write-Host ""

$required = @(
    'css\app.css',
    'js\main.js',
    'js\guideRender.js',
    'js\guide\guideState.js',
    'js\guide\phaseFlow.js',
    'js\guide\rosterParser.js',
    'js\guide\abilityMapper.js',
    'js\constants.js',
    'js\geometry.js',
    'js\los.js',
    'js\battleSim\battleMapState.js',
    'js\battleSim\layouts.js',
    'js\battleSim\mapView.js',
    'js\battleSim\battleSimRender.js'
)

$missing = @()
foreach ($file in $required) {
    $path = Join-Path $AppDir $file
    if (-not (Test-Path $path)) {
        $missing += $file
    }
}

if ($missing.Count -gt 0) {
    Write-Host "  BUILD FAILED - missing files:" -ForegroundColor Red
    foreach ($m in $missing) {
        Write-Host "    - $m" -ForegroundColor Red
    }
    exit 1
}

& (Join-Path $PSScriptRoot 'bundle.ps1')

# Build single-file play.html (all CSS + JS inlined — works from file:// without external loads)
$cssPath = Join-Path $AppDir 'css\app.css'
$jsPath = Join-Path $AppDir 'js\bundle.js'
$playPath = Join-Path $AppDir 'play.html'

$css = [System.IO.File]::ReadAllText($cssPath)
$js = [System.IO.File]::ReadAllText($jsPath)
$js = $js.Replace('</script>', '</scr' + 'ipt>')

$html = @"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Warhammer 40,000 - Battle Companion</title>
    <style>
$css
    </style>
  </head>
  <body>
    <div id="root"><p style="padding:2rem;color:#d4a853;font-family:Georgia,serif">Loading Battle Guide...</p></div>
    <script>
$js
    </script>
  </body>
</html>
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($playPath, $html, $utf8NoBom)
Write-Host "  Created: app\play.html (single-file, offline-safe)" -ForegroundColor Green

if (Test-Path $DistDir) {
    Remove-Item $DistDir -Recurse -Force
}
Copy-Item $AppDir $DistDir -Recurse

Write-Host "  Output copied to: dist\" -ForegroundColor Green
Write-Host ""
Write-Host "  Play: double-click launch-offline.bat" -ForegroundColor Cyan
Write-Host ""
