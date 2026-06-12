@echo off
setlocal
set "DIR=%~dp0"
if exist "%DIR%app\scripts\stop-windows.ps1" (
  set "ROOT=%DIR%app"
) else (
  for %%I in ("%DIR%..\..") do set "ROOT=%%~fI"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\stop-windows.ps1"
pause
