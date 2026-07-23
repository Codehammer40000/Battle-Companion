@echo off
setlocal
cd /d "%~dp0"

set "APP_DIR=%~dp0app"
if exist "%~dp0dist\play.html" set "APP_DIR=%~dp0dist"

echo.
echo  WH40k Battle Guide - OFFLINE mode
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1"
if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
)

if not exist "%APP_DIR%\play.html" (
    echo ERROR: play.html was not created. Check build output above.
    pause
    exit /b 1
)

echo  Opening Battle Guide...
start "" "%APP_DIR%\play.html"
echo.
pause
