@echo off
setlocal
cd /d "%~dp0"

echo.
echo  WH40k Tabletop Companion - Build
echo  (No Node.js required)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1"
if errorlevel 1 (
    echo.
    pause
    exit /b 1
)

echo  Build complete.
echo.
pause
