@echo off
setlocal
set "DIR=%~dp0"
if exist "%DIR%app\scripts\start-windows.ps1" (
  set "ROOT=%DIR%app"
) else (
  for %%I in ("%DIR%..\..") do set "ROOT=%%~fI"
)

set "BACKGROUND="
if "%~1"=="--background" set "BACKGROUND=-Background -NoOpen"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\start-windows.ps1" %BACKGROUND%
if not "%~1"=="--background" pause
