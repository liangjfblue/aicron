# AICron — AI 任务调度平台

本地部署的个人 AI 任务调度平台。通过 Web 界面管理定时任务，任务由 Claude Code CLI 或 Codex CLI 执行 prompt，执行结果推送到飞书。

## 技术栈

- **后端**: Fastify + SQLite (better-sqlite3)
- **前端**: React + Vite
- **调度**: toad-scheduler + cron-parser
- **执行**: child_process.spawn (claude / codex CLI)
- **通知**: 飞书自建应用 API

## 快速开始

### 一键脚本启动

macOS / Linux：

```bash
./scripts/start.sh
./scripts/status.sh
./scripts/stop.sh
```

Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\status-windows.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1
```

面向非技术用户的双击入口在 `launchers/`：

- Mac：`launchers/mac/AICron.command`
- Windows：`launchers/windows/AICron.bat`

环境检查：

```bash
./scripts/doctor-mac.sh
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor-windows.ps1
```

开机自启动默认不启用。需要时可手动开启：

```bash
./scripts/enable-autostart-mac.sh
./scripts/disable-autostart-mac.sh
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\enable-autostart-windows.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\disable-autostart-windows.ps1
```

打开 http://127.0.0.1:5180 即可使用。

默认账号：`admin` / `admin123`

### 生成 V1 分享包

```bash
./scripts/package-v1.sh
```

生成结果在 `dist-packages/`：

- `AICron-mac-<version>.zip`
- `AICron-windows-<version>.zip`

### 手动开发启动

```bash
# 安装依赖
npm install
cd web && npm install && cd ..

# 启动后端（默认端口 3000）
node server/index.js

# 启动前端开发服务器（另一个终端）
cd web && npm run dev
```

打开 http://localhost:5173 即可使用。

默认账号：`admin` / `admin123`

## 桌面版开发

AICron 桌面版使用 Electron 包装现有 Web UI 和 Fastify 后端。核心任务逻辑仍在 `server/` 中，桌面壳只负责窗口、托盘、菜单、开机自启动和桌面通知。

### 开发启动

```bash
npm install
cd web && npm install && cd ..
npm run desktop:dev
```

开发模式会启动：

- 后端：`http://127.0.0.1:3000`
- 前端：`http://127.0.0.1:5180`
- Electron 桌面壳

### 打包预览

```bash
npm run desktop:pack
```

生成目录在 `desktop-dist/`。正式分发可使用：

```bash
npm run desktop:dist
```

### 桌面版验收点

- 只能打开一个 AICron 实例，重复启动会聚焦已有窗口。
- 关闭窗口后应用仍在托盘运行。
- 托盘右键菜单可以打开窗口、打开设置、切换开机自启动、退出。
- 设置页在桌面版显示“桌面应用”区域，在浏览器版不显示。
- 任务完成后桌面通知弹出，点击通知进入对应执行详情。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 后端端口 |
| HOST | 127.0.0.1 | 监听地址 |
| DATA_DIR | ./data | 数据目录 |
| JWT_SECRET | aicron-dev-secret-change-me | JWT 密钥 |
| ADMIN_USER | admin | 初始管理员用户名 |
| ADMIN_PASS | admin123 | 初始管理员密码 |
| CLAUDE_CLI_PATH | claude | Claude CLI 路径 |
| CODEX_CLI_PATH | codex | Codex CLI 路径 |

## 项目结构

```
aicron/
├── server/           # Fastify 后端
│   ├── routes/       # API 路由
│   ├── services/     # 业务逻辑
│   ├── utils/        # 工具函数
│   ├── plugins/      # Fastify 插件
│   ├── db/           # SQLite 初始化
│   └── test/         # 测试
├── web/              # React 前端
│   └── src/
│       ├── pages/    # 页面组件
│       ├── components/  # 通用组件
│       └── api/      # API 客户端
├── data/             # 运行时数据（gitignore）
└── scripts/          # 脚本
```

## 功能

- 定时调度（Cron）+ 手动触发
- 模板变量（日期、任务名、上次结果等）
- Claude Code CLI / Codex CLI 双引擎
- 飞书通知（全文/摘要 + 附件）
- 变更检测（仅结果变化时通知）
- 任务链（下游任务引用上游结果）
- 执行历史 + diff 对比
- Prompt AI 优化
- Skill API（供 Hermes 等 agent 调用）
- 账号密码登录，会话 3 天

## 开发

```bash
# 运行测试
npx vitest run

# 启动开发
node server/index.js  # 后端
cd web && npm run dev # 前端
```

## License

MIT
