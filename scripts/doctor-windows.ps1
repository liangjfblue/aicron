$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$HostName = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }
$Port = if ($env:PORT) { $env:PORT } else { '3000' }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { '5180' }

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Port($PortValue) {
  return [bool](Get-NetTCPConnection -LocalPort ([int]$PortValue) -State Listen -ErrorAction SilentlyContinue)
}

function Test-Url($Url) {
  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Show-Check($Name, $Ok, $Fix) {
  if ($Ok) {
    Write-Host ("✅ {0}" -f $Name)
  } else {
    Write-Host ("❌ {0}" -f $Name)
    Write-Host ("   修复建议: {0}" -f $Fix)
  }
}

Write-Host 'AICron 环境检查'
Write-Host ''

Show-Check 'Node.js' (Test-Command 'node') '安装 Node.js LTS: https://nodejs.org/'
Show-Check 'npm' (Test-Command 'npm') '重新安装 Node.js LTS，确保 npm 被加入 PATH。'
Show-Check 'Claude CLI' (Test-Command 'claude') '安装并登录 Claude CLI；如果暂时不用 Claude 任务，可以稍后再配。'
Show-Check 'Codex CLI' (Test-Command 'codex') '安装并登录 Codex CLI；如果暂时不用 Codex 任务，可以稍后再配。'

$DataDir = Join-Path $Root 'data'
try {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  $testFile = Join-Path $DataDir '.write-test'
  Set-Content -Path $testFile -Value 'ok'
  Remove-Item $testFile -Force
  Show-Check '数据目录可写' $true ''
} catch {
  Show-Check '数据目录可写' $false '把 AICron 放到当前用户有权限的目录，例如桌面或文档目录。'
}

Show-Check "后端端口 $Port" ((-not (Test-Port $Port)) -or (Test-Url "http://${HostName}:${Port}/api/health")) '端口被占用。请停止旧的 AICron，或设置新的 PORT。'
Show-Check "前端端口 $FrontendPort" ((-not (Test-Port $FrontendPort)) -or (Test-Url "http://${HostName}:${FrontendPort}")) '端口被占用。请停止旧的 AICron，或设置新的 FRONTEND_PORT。'

$Startup = [Environment]::GetFolderPath('Startup')
$Shortcut = Join-Path $Startup 'AICron.lnk'
Show-Check '开机自启动配置' (Test-Path $Shortcut) '如需开机自启动，请运行 scripts\enable-autostart-windows.ps1。'

Write-Host ''
Write-Host "项目目录: $Root"
Write-Host "后端地址: http://${HostName}:${Port}"
Write-Host "前端地址: http://${HostName}:${FrontendPort}"
