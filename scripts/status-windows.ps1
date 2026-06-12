$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path $Root '.pids'
$HostName = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }
$Port = if ($env:PORT) { $env:PORT } else { '3000' }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { '5180' }

function Test-Url($Url) {
  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Show-ProcessStatus($Name, $FileName, $Url) {
  $Path = Join-Path $PidDir "$FileName.pid"
  if (-not (Test-Path $Path)) {
    if ($Url -and (Test-Url $Url)) {
      Write-Host ("  {0,-8} ⚠️  可访问，但不是当前脚本托管" -f $Name)
      return
    }
    Write-Host ("  {0,-8} ❌ 未运行 (无 PID 文件)" -f $Name)
    return
  }

  $ProcessId = Get-Content $Path -ErrorAction SilentlyContinue
  $process = if ($ProcessId) { Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue } else { $null }
  if (-not $process) {
    if ($Url -and (Test-Url $Url)) {
      Write-Host ("  {0,-8} ⚠️  可访问，但 PID 文件已过期" -f $Name)
      return
    }
    Write-Host ("  {0,-8} ❌ 已停止 (PID {1} 已退出)" -f $Name, $ProcessId)
    return
  }

  if ($Url -and -not (Test-Url $Url)) {
    Write-Host ("  {0,-8} ⚠️  进程在但无响应 (PID: {1})" -f $Name, $process.Id)
    return
  }

  Write-Host ("  {0,-8} ✅ 运行中 (PID: {1})" -f $Name, $process.Id)
}

Write-Host 'AICron 状态:'
Write-Host ''
Show-ProcessStatus '后端' 'server' "http://${HostName}:${Port}/api/health"
Show-ProcessStatus '前端' 'frontend' "http://${HostName}:${FrontendPort}"
Write-Host ''
Write-Host "访问地址: http://${HostName}:${FrontendPort}"
Write-Host "日志目录: $Root\data\logs"
