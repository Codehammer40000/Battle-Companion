@echo off
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0zip-for-upload.ps1"
if errorlevel 1 (
    echo.
    pause
    exit /b 1
)
echo.
pause
