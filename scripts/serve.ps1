# Static file server (no Node.js). Uses 127.0.0.1 to avoid some Windows URL ACL issues.

param(
    [int]$Port = 8080,
    [string]$Root = $PSScriptRoot
)

$Root = (Resolve-Path $Root).Path.TrimEnd('\')
$listener = New-Object System.Net.HttpListener

# Try 127.0.0.1 first, then localhost
$prefixes = @(
    "http://127.0.0.1:$Port/",
    "http://localhost:$Port/"
)

$started = $false
foreach ($prefix in $prefixes) {
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add($prefix)
        $listener.Start()
        $started = $true
        $usedPrefix = $prefix
        break
    } catch {
        $listener = New-Object System.Net.HttpListener
    }
}

if (-not $started) {
    Write-Host ""
    Write-Host "  ERROR: Could not start web server on port $Port." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Your PC may block local servers (common on work machines)." -ForegroundColor Yellow
    Write-Host "  Use launch-offline.bat instead - no server needed." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

$url = $usedPrefix.TrimEnd('/')

Write-Host ""
Write-Host "  Warhammer 40,000 Tabletop Companion" -ForegroundColor Yellow
Write-Host "  Serving: $Root" -ForegroundColor Gray
Write-Host "  Open:    $url" -ForegroundColor Green
Write-Host ""
Write-Host "  Keep this window open while playing." -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
    '.svg'  = 'image/svg+xml'
}

function Get-LocalPath($url) {
    $path = [System.Uri]::UnescapeDataString($url.LocalPath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
    $full = Join-Path $Root ($path -replace '/', '\')
    $resolved = [System.IO.Path]::GetFullPath($full)
    if (-not $resolved.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    return $resolved
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $localPath = Get-LocalPath $request.Url
        $served = $false

        if ($null -ne $localPath) {
            if (Test-Path $localPath -PathType Container) {
                $indexPath = Join-Path $localPath 'index.html'
                if (Test-Path $indexPath) { $localPath = $indexPath }
            }
            if ((Test-Path $localPath -PathType Leaf)) {
                $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
                $contentType = $mime[$ext]
                if (-not $contentType) { $contentType = 'application/octet-stream' }
                $response.ContentType = $contentType
                $bytes = [System.IO.File]::ReadAllBytes($localPath)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $served = $true
            }
        }

        if (-not $served) {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }

        $response.Close()
    }
} finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
}
