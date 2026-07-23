@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set PORT=8080
set "APP_DIR=%~dp0app"
if exist "%~dp0dist\index-offline.html" (
    set "APP_DIR=%~dp0dist"
    echo  Using dist\ folder
) else (
    echo  Using app\ folder
)

echo.
echo  WH40k Tabletop Companion
echo  Starting local server...
echo.

REM Build offline bundle first (needed if server fails)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" >nul 2>&1

REM Start server in a separate window (must be running BEFORE browser opens)
start "WH40k Server" /MIN powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\serve.ps1" -Port %PORT% -Root "%APP_DIR%."

echo  Waiting for server on port %PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; $u='http://127.0.0.1:%PORT%/'; for($i=0;$i -lt 40;$i++){ try { $null=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1; $ok=$true; break } catch { Start-Sleep -Milliseconds 250 } }; if($ok){ exit 0 } else { exit 1 }"

if errorlevel 1 (
    echo.
    echo  Server could not start ^(blocked on this PC^).
    echo  Opening OFFLINE mode instead - no server required.
    echo.
    start "" "%APP_DIR%\index-offline.html"
    pause
    exit /b 0
)

echo  Server ready. Opening browser...
start "" "http://127.0.0.1:%PORT%/"
echo.
echo  Game is running. The minimized "WH40k Server" window must stay open.
echo  Close that window when you are done playing.
echo.
pause
