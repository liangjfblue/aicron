$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Startup = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $Startup 'AICron.lnk'
$PackagedTarget = Join-Path (Split-Path -Parent $Root) 'AICron.bat'
$SourceTarget = Join-Path $Root 'launchers\windows\AICron.bat'
$Target = if (Test-Path $PackagedTarget) { $PackagedTarget } else { $SourceTarget }

if (-not (Test-Path $Target)) {
  Write-Host '❌ 未找到 AICron.bat，无法启用开机自动启动。'
  exit 1
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $Target
$shortcut.Arguments = '--background'
$shortcut.WorkingDirectory = $Root
$shortcut.Description = 'Start AICron'
$shortcut.Save()

Write-Host '✓ 已启用 AICron 开机自动启动'
Write-Host "  $ShortcutPath"
