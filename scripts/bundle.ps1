# Bundles ES modules into one file that works without a web server (file://)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$JsDir = Join-Path $ProjectRoot 'app\js'
$OutFile = Join-Path $JsDir 'bundle.js'
$OrderFile = Join-Path $PSScriptRoot 'bundle-order.txt'

$order = Get-Content $OrderFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }

function Strip-ModuleSyntax([string]$text) {
    $text = [regex]::Replace($text, '(?ms)^import\s+.*?;\s*\r?\n', '')
    $text = [regex]::Replace($text, '(?ms)^export\s+\{[^}]+\};\s*\r?\n', '')
    $text = [regex]::Replace($text, '\bexport\s+function\s+', 'function ')
    $text = [regex]::Replace($text, '\bexport\s+const\s+', 'const ')
    return $text
}

$bundle = @(
    '/* WH40k Battle Guide - bundled for offline use */',
    '(function () {',
    "'use strict';",
    ''
)

foreach ($file in $order) {
    $path = Join-Path $JsDir $file
    if (-not (Test-Path $path)) {
        throw "Missing: $file"
    }
    $content = Get-Content $path -Raw -Encoding UTF8
    $content = Strip-ModuleSyntax $content
    $bundle += "/* --- $file --- */"
    $bundle += $content.TrimEnd()
    $bundle += ''
}

$bundle += '})();'
$bundleText = ($bundle -join "`r`n")
[System.IO.File]::WriteAllText($OutFile, $bundleText, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Created: app\js\bundle.js ($($order.Count) files)" -ForegroundColor Green
