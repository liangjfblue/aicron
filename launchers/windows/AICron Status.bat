@echo off
setlocal
set "DIR=%~dp0"
if exist "%DIR%app\scripts\status-windows.ps1" (
  set "ROOT=%DIR%app"
) else (
  for %%I in ("%DIR%..\..") do set "ROOT=%%~fI"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\status-windows.ps1"
pause
