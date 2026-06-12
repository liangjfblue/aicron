param(
  [switch]$Background,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path $Root '.pids'
$LogDir = Join-Path $Root 'data\logs'
$DataDir = Join-Path $Root 'data'
$HostName = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }
$Port = if ($env:PORT) { $env:PORT } else { '3000' }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { '5180' }
$ServerUrl = "http://${HostName}:${Port}"
$FrontendUrl = "http://${HostName}:${FrontendPort}"

New-Item -ItemType Directory -Force -Path $PidDir, $LogDir, $DataDir | Out-Null

function Write-User($Message) {
  if (-not $Background) { Write-Host $Message }
}

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-PidFile($Path) {
  if (-not (Test-Path $Path)) { return $false }
  $ProcessId = Get-Content $Path -ErrorAction SilentlyContinue
  if (-not $ProcessId) { return $false }
  return [bool](Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue)
}

function Test-Port($PortValue) {
  $conn = Get-NetTCPConnection -LocalPort ([int]$PortValue) -State Listen -ErrorAction SilentlyContinue
  return [bool]$conn
}

function Wait-Url($Url, $Label) {
  for ($i = 0; $i -lt 40; $i++) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
      Write-User "  ✓ $Label 已就绪"
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Test-Url($Url) {
  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

Write-User '╔══════════════════════════════════╗'
Write-User '║       AICron 启动中...            ║'
Write-User '╚══════════════════════════════════╝'
Write-User ''

if (-not (Test-Command 'node')) {
  Write-Host '❌ 未找到 Node.js。请先安装 Node.js LTS: https://nodejs.org/'
  exit 1
}

if (-not (Test-Command 'npm')) {
  Write-Host '❌ 未找到 npm。请重新安装 Node.js LTS。'
  exit 1
}

if (-not (Test-Command 'claude')) {
  Write-User '⚠️  未找到 claude 命令。Claude 任务会不可用，请安装并登录 Claude CLI。'
}

if (-not (Test-Command 'codex')) {
  Write-User '⚠️  未找到 codex 命令。Codex 任务会不可用，可以稍后再配置。'
}

$ServerPidFile = Join-Path $PidDir 'server.pid'
if (Test-PidFile $ServerPidFile) {
  Write-User '✓ 后端已在运行'
} else {
  Remove-Item $ServerPidFile -Force -ErrorAction SilentlyContinue
  if (Test-Port $Port) {
    if (Test-Url "$ServerUrl/api/health") {
      Write-User "✓ 后端端口 $Port 已有可用服务（非当前脚本托管）"
    } else {
      Write-Host "❌ 后端端口 $Port 已被占用。请运行 AICron Status.bat 查看状态，或换一个 PORT。"
      exit 1
    }
  } else {
    if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
      Write-User '▶ 安装后端依赖...'
      Push-Location $Root
      npm install *>> (Join-Path $LogDir 'install.log')
      Pop-Location
    }

    Write-User "▶ 启动后端: $ServerUrl"
    $server = Start-Process -FilePath 'node' -ArgumentList @('server/index.js') -WorkingDirectory $Root -RedirectStandardOutput (Join-Path $LogDir 'server.log') -RedirectStandardError (Join-Path $LogDir 'server-error.log') -PassThru -WindowStyle Hidden
    Set-Content -Path $ServerPidFile -Value $server.Id
    Write-User "  后端 PID: $($server.Id)"

    if (-not (Wait-Url "$ServerUrl/api/health" '后端')) {
      Write-Host "❌ 后端启动超时，请查看 $LogDir"
      Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
      Remove-Item $ServerPidFile -Force -ErrorAction SilentlyContinue
      exit 1
    }
  }
}

$FrontendPidFile = Join-Path $PidDir 'frontend.pid'
if (Test-PidFile $FrontendPidFile) {
  Write-User '✓ 前端已在运行'
} else {
  Remove-Item $FrontendPidFile -Force -ErrorAction SilentlyContinue
  if (Test-Port $FrontendPort) {
    if (Test-Url $FrontendUrl) {
      Write-User "✓ 前端端口 $FrontendPort 已有可用服务（非当前脚本托管）"
    } else {
      Write-Host "❌ 前端端口 $FrontendPort 已被占用。请运行 AICron Status.bat 查看状态，或换一个 FRONTEND_PORT。"
      exit 1
    }
  } else {
    $WebRoot = Join-Path $Root 'web'
    if (-not (Test-Path (Join-Path $WebRoot 'node_modules'))) {
      Write-User '▶ 安装前端依赖...'
      Push-Location $WebRoot
      npm install *>> (Join-Path $LogDir 'install.log')
      Pop-Location
    }

    Write-User "▶ 启动前端: $FrontendUrl"
    $frontendArgs = @('vite', '--host', $HostName, '--port', $FrontendPort)
    $frontend = Start-Process -FilePath 'npx' -ArgumentList $frontendArgs -WorkingDirectory $WebRoot -RedirectStandardOutput (Join-Path $LogDir 'frontend.log') -RedirectStandardError (Join-Path $LogDir 'frontend-error.log') -PassThru -WindowStyle Hidden
    Set-Content -Path $FrontendPidFile -Value $frontend.Id
    Write-User "  前端 PID: $($frontend.Id)"

    if (-not (Wait-Url $FrontendUrl '前端')) {
      Write-Host "❌ 前端启动超时，请查看 $LogDir"
      Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
      Remove-Item $FrontendPidFile -Force -ErrorAction SilentlyContinue
      exit 1
    }
  }
}

if (-not $NoOpen) {
  Start-Process $FrontendUrl | Out-Null
}

Write-User ''
Write-User '✓ AICron 已启动'
Write-User "  访问地址: $FrontendUrl"
Write-User "  日志目录: $LogDir"
