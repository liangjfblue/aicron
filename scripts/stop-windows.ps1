$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path $Root '.pids'

function Stop-FromPidFile($Name, $Path) {
  if (-not (Test-Path $Path)) {
    Write-Host "  - $Name 未找到 PID 文件"
    return
  }

  $ProcessId = Get-Content $Path -ErrorAction SilentlyContinue
  if (-not $ProcessId) {
    Remove-Item $Path -Force -ErrorAction SilentlyContinue
    Write-Host "  - $Name PID 文件为空"
    return
  }

  $process = Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue
  if (-not $process) {
    Remove-Item $Path -Force -ErrorAction SilentlyContinue
    Write-Host "  - $Name 进程已不存在"
    return
  }

  Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  $stillRunning = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
  if ($stillRunning) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ $Name 已强制停止 (PID: $($process.Id))"
  } else {
    Write-Host "  ✓ $Name 已停止 (PID: $($process.Id))"
  }
  Remove-Item $Path -Force -ErrorAction SilentlyContinue
}

Write-Host '■ 停止 AICron...'
Stop-FromPidFile '前端' (Join-Path $PidDir 'frontend.pid')
Stop-FromPidFile '后端' (Join-Path $PidDir 'server.pid')
Write-Host ''
Write-Host '✓ AICron 已停止'
