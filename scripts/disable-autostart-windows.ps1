$Startup = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $Startup 'AICron.lnk'

if (Test-Path $ShortcutPath) {
  Remove-Item $ShortcutPath -Force
  Write-Host '✓ 已关闭 AICron 开机自动启动'
} else {
  Write-Host '- AICron 未启用开机自动启动'
}
