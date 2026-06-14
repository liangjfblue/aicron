# AICron

把成熟的 AI 任务 Prompt，变成会自动运行的桌面任务。

你可以用 AICron 做这些事：

- 每天/每周自动跑一份行业观察、投资跟踪、竞品监控或工作复盘
- 把 Claude Code / Codex 的执行结果自动推送到飞书
- 让一个任务完成后，继续触发下一个任务
- 在本机保存任务、执行记录和结果，不依赖云端服务

当前版本是 **V1 Alpha**，适合个人使用和小范围内测。

## 普通用户怎么开始

### 1. 下载并打开

从 GitHub Release 下载适合你电脑的安装包。

- macOS：下载 Mac 版本，打开 `AICron.app`
- Windows：下载 Windows 安装包，安装后打开 AICron

第一次打开时，系统会进入“首次引导”。

### 2. 创建本地账号

AICron 不提供默认账号。第一次使用时，需要你自己创建一个本地账号和密码。

这个账号只保存在你的电脑上，用来保护本地任务和执行记录。

### 3. 配置 Claude / Codex

AICron 本身不替代 Claude Code 或 Codex，它会调用你电脑上已经安装好的命令行工具。

首次引导会自动尝试检测：

- Claude CLI
- Codex CLI

如果检测到了，确认路径即可。如果没有检测到，可以先跳过，之后在“设置”里再填写。

### 4. 配置飞书通知

如果你希望任务完成后自动发到飞书，需要准备：

- 飞书自建应用的 App ID
- 飞书自建应用的 App Secret
- 默认群聊 ID

不配置飞书也可以使用 AICron，只是不会自动推送消息。

### 5. 新建第一个任务

进入 AICron 后，点击“新建任务”：

1. 填任务名称
2. 选择执行引擎：Claude 或 Codex
3. 粘贴你的 Agent 任务模板
4. 设置执行时间
5. 保存

你也可以先手动点击“执行”，确认结果正常后再交给定时调度。

## 适合什么场景

AICron 适合“不是一次性聊天，而是要持续执行”的任务：

- 每周 AI 产业链信号扫描
- 每天舆情/新闻/竞品监控
- 定期生成投资观察报告
- 定期总结项目状态
- 定期检查某个网站、仓库、文档或数据源
- 父任务先收集信息，子任务再整理成报告

一句话：**把你已经验证过的 Prompt，变成一个长期运行的工作流。**

## 数据保存在哪里

AICron 默认把数据保存在你的用户目录下：

- macOS / Linux：`~/.aicron`
- Windows：`C:\Users\<用户名>\.aicron`

数据库位置：

- macOS / Linux：`~/.aicron/data/aicron.db`
- Windows：`C:\Users\<用户名>\.aicron\data\aicron.db`

这些数据不会自动上传到云端，也不会写进项目仓库。

## 常见问题

### 首次打开没有进入引导页？

只有数据库里没有任何用户时，才会进入首次引导。

如果你已经创建过账号，后续会进入登录页或任务列表。

### 忘记账号，想重新走首次引导怎么办？

如果只是测试，不要删除整个数据库。可以只清空用户表和引导标记。

macOS / Linux：

```bash
sqlite3 ~/.aicron/data/aicron.db "DELETE FROM users; DELETE FROM settings WHERE key='onboardingCompleted';"
```

Windows 需要先安装 SQLite 命令行工具，或直接备份后删除 `C:\Users\<用户名>\.aicron\data\aicron.db`。

### 找不到 Claude / Codex 怎么办？

先确认命令行里能找到它们。

macOS / Linux：

```bash
which claude
which codex
```

Windows PowerShell：

```powershell
where.exe claude
where.exe codex
```

如果命令能返回路径，把路径填到 AICron 的设置页。

### 飞书没有收到消息怎么办？

优先检查这几项：

- App ID 是否正确
- App Secret 是否正确
- 默认群聊 ID 是否正确
- 飞书应用是否已经加入目标群聊
- 任务通知方式是否开启

可以先在设置页使用“测试飞书”确认连接是否正常。

### 任务没有自动执行？

检查：

- AICron 是否正在运行
- 任务是否启用
- Cron 时间是否设置正确
- 电脑是否睡眠

V1 不负责唤醒电脑。如果电脑睡眠，任务不会准时执行。

### macOS 提示无法打开？

当前 Alpha 版本可能还没有正式签名。可以在“系统设置 → 隐私与安全性”里允许打开，或右键点击应用后选择“打开”。

### Windows 提示不安全？

当前 Alpha 版本可能还没有正式签名。请确认安装包来自本项目 Release，再选择继续运行。

## 给开发者

### 技术栈

- 后端：Fastify + SQLite (`better-sqlite3`)
- 前端：React + Vite
- 桌面端：Electron
- 调度：`toad-scheduler` + `cron-parser`
- 执行：`child_process.spawn`
- 通知：飞书自建应用 API

### 本地开发

```bash
npm install
cd web && npm install && cd ..
npm run desktop:dev
```

开发模式会启动：

- 后端：`http://127.0.0.1:3000`
- 前端：`http://127.0.0.1:5180`
- Electron 桌面壳

### 打包

macOS：

```bash
npm run desktop:pack
```

安装到本机应用目录：

```bash
npm run desktop:pack:install
```

Windows 建议在 Windows 机器上打包：

```powershell
npm install
cd web
npm install
cd ..
npm run desktop:dist
```

### 常用命令

```bash
npm test
npm --prefix web run build
npm run desktop:dev
npm run desktop:pack
npm run desktop:dist
```

### 项目结构

```text
aicron/
├── desktop/          # Electron 桌面壳
├── server/           # Fastify 后端
├── web/              # React 前端
├── scripts/          # 启动、停止、打包和诊断脚本
├── launchers/        # 脚本版双击入口
└── docs/             # 文档
```

## License

MIT
