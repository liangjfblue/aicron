# AICron V1 启动包使用说明

这份说明面向第一批内测用户。目标是让 Mac 和 Windows 用户都能通过双击启动 AICron，并且知道如何停止、查看状态和开启开机自启动。

## Mac 用户

### 启动

双击：

```text
AICron.command
```

启动后会自动：

- 检查 Node.js、npm、Claude CLI、Codex CLI。
- 安装缺失的项目依赖。
- 启动后端和前端。
- 打开浏览器访问 AICron。

### 停止

双击：

```text
Stop AICron.command
```

### 查看状态

双击：

```text
AICron Status.command
```

### 环境检查

如果启动失败，运行：

```bash
./scripts/doctor-mac.sh
```

### 开机自启动

默认不启用。需要开启时运行：

```bash
./scripts/enable-autostart-mac.sh
```

关闭：

```bash
./scripts/disable-autostart-mac.sh
```

Mac 自启动使用 `launchd`，配置文件位于：

```text
~/Library/LaunchAgents/com.aicron.app.plist
```

## Windows 用户

### 启动

双击：

```text
AICron.bat
```

启动后会自动：

- 检查 Node.js、npm、Claude CLI、Codex CLI。
- 安装缺失的项目依赖。
- 启动后端和前端。
- 打开浏览器访问 AICron。

### 停止

双击：

```text
Stop AICron.bat
```

### 查看状态

双击：

```text
AICron Status.bat
```

### 环境检查

双击：

```text
AICron Doctor.bat
```

也可以在 PowerShell 里运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor-windows.ps1
```

### 开机自启动

默认不启用。需要开启时运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\enable-autostart-windows.ps1
```

关闭：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\disable-autostart-windows.ps1
```

Windows 自启动会在用户启动文件夹创建快捷方式：

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AICron.lnk
```

## 打包目录建议

Mac zip：

```text
AICron-mac/
  AICron.command
  Stop AICron.command
  AICron Status.command
  app/
    ...项目文件
```

Windows zip：

```text
AICron-windows/
  AICron.bat
  Stop AICron.bat
  AICron Status.bat
  AICron Doctor.bat
  app/
    ...项目文件
```

## 常见问题

### 提示未安装 Node.js

安装 Node.js LTS：https://nodejs.org/

### 提示未找到 Claude CLI

Claude 任务会不可用。请先安装并登录 Claude CLI。

### 提示端口被占用

先运行停止脚本。如果仍然被占用，可以设置新端口：

Mac：

```bash
PORT=3100 FRONTEND_PORT=5280 ./scripts/start.sh
```

Windows：

```powershell
$env:PORT=3100
$env:FRONTEND_PORT=5280
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

### 任务没有自动执行

检查 AICron 是否正在运行，并确认系统没有睡眠。V1 只负责开机自启动，不负责唤醒电脑。
