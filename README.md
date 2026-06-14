# AICron

AICron 是一个本地运行的 Agent 任务调度工具。你可以把和 AI 聊出来的研究计划、监控清单、复盘流程整理成可复用的任务模板，然后按 Cron 定时或手动触发，由 Claude Code CLI / Codex CLI 执行，并把结果推送到飞书。

当前版本定位：**V1 Alpha，可用于个人或小范围内测**。

## 核心能力

- 任务管理：创建、编辑、手动触发、启停任务
- 调度：Cron 表达式、多段调度、有效时间范围
- 执行引擎：Claude Code CLI / Codex CLI
- Prompt 模板：变量替换、引用上次成功结果、父子任务上下文
- 任务链：父任务成功后自动触发子任务
- 执行历史：时间线、执行时长、进度事件、结果详情
- 通知：飞书执行完成通知、摘要通知、附件
- 桌面能力：系统托盘、桌面通知、开机自启动、启动后最小化到托盘
- 首次引导：第一次打开时创建本地账号，配置执行引擎和飞书

## 技术栈

- 后端：Fastify + SQLite (`better-sqlite3`)
- 前端：React + Vite
- 桌面端：Electron
- 调度：`toad-scheduler` + `cron-parser`
- 执行：`child_process.spawn`
- 通知：飞书自建应用 API

## 推荐使用方式

### 桌面版

桌面版是面向普通用户的推荐入口。首次打开时会进入引导页：

1. 创建本地账号
2. 确认 Claude / Codex CLI 路径
3. 填写飞书 App ID、App Secret、默认群聊 ID
4. 按需开启“开机自启动”和“启动后最小化到托盘”

数据默认保存在用户目录，不会写进项目仓库：

- macOS / Linux：`~/.aicron`
- Windows：`C:\Users\<用户名>\.aicron`

数据库位置：

- macOS / Linux：`~/.aicron/data/aicron.db`
- Windows：`C:\Users\<用户名>\.aicron\data\aicron.db`

### 本地 Web 开发版

适合开发、调试或临时本地运行。

```bash
npm install
cd web && npm install && cd ..
npm run desktop:dev
```

开发模式会启动：

- 后端：`http://127.0.0.1:3000`
- 前端：`http://127.0.0.1:5180`
- Electron 桌面壳

如果只想启动 Web：

```bash
node server/index.js
cd web && npm run dev
```

浏览器打开 Vite 输出的地址即可。

## 打包

### macOS 本机打包

```bash
npm install
cd web && npm install && cd ..
npm run desktop:pack
```

生成目录在 `desktop-dist/`。

安装到本机应用目录：

```bash
npm run desktop:pack:install
```

默认安装到：

```text
/Users/<用户名>/Applications/AICron.app
```

### Windows 本机打包

建议在 Windows 机器上拉取仓库后打包。

```powershell
git clone git@github.com:liangjfblue/aicron.git
cd aicron
npm install
cd web
npm install
cd ..
npm run desktop:dist
```

Windows 安装包输出在 `desktop-dist/`。当前 `package.json` 的 Windows target 是 NSIS。

### 生成源码分享包

项目也保留了脚本版分享包：

```bash
./scripts/package-v1.sh
```

生成结果在 `dist-packages/`：

- `AICron-mac-<version>.zip`
- `AICron-windows-<version>.zip`

这类 zip 更适合开发者或半技术用户；普通用户优先使用 Electron 安装包。

## GitHub Release 建议流程

1. 确认工作区干净：

   ```bash
   git status --short
   ```

2. 运行验证：

   ```bash
   npm test
   npm --prefix web run build
   ```

3. 推送代码：

   ```bash
   git push origin master
   ```

4. 创建版本标签：

   ```bash
   git tag v1.0.0-alpha.1
   git push origin v1.0.0-alpha.1
   ```

5. 在 GitHub Releases 页面创建 Release，标题建议：

   ```text
   AICron v1.0.0-alpha.1
   ```

6. 上传构建产物：

   - macOS：`desktop-dist/` 中的 macOS 安装包或压缩包
   - Windows：在 Windows 机器上构建出的 NSIS 安装包

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端端口 |
| `HOST` | `127.0.0.1` | 后端监听地址 |
| `AICRON_HOME` | 用户主目录下的 `.aicron` | 应用数据根目录 |
| `DATA_DIR` | `$AICRON_HOME/data` | 数据目录 |
| `JWT_SECRET` | `aicron-dev-secret-change-me` | JWT 密钥 |
| `CLAUDE_CLI_PATH` | 自动检测 | Claude CLI 路径 |
| `CODEX_CLI_PATH` | 自动检测 | Codex CLI 路径 |

说明：AICron 不再提供默认账号。首次打开空数据库时，需要在引导页创建本地账号。

## 项目结构

```text
aicron/
├── desktop/          # Electron 桌面壳
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
├── scripts/          # 启动、停止、打包和诊断脚本
├── launchers/        # 面向非技术用户的双击入口
└── docs/             # 文档
```

## 常见问题

### 为什么首次打开没有进入引导页？

只有在数据库里没有任何用户时才会进入首次引导。如果你已经创建过账号，后续会进入登录页或任务列表。

### 如何重新走首次引导？

如果只是测试，不要删除整个数据库。可以只清空用户表和引导标记：

```bash
sqlite3 ~/.aicron/data/aicron.db "DELETE FROM users; DELETE FROM settings WHERE key='onboardingCompleted';"
```

### Claude / Codex 路径找不到怎么办？

先确认终端里能运行：

```bash
which claude
which codex
```

Windows PowerShell：

```powershell
where.exe claude
where.exe codex
```

如果能找到，把路径填到设置页或首次引导页。也可以通过 `CLAUDE_CLI_PATH` / `CODEX_CLI_PATH` 指定。

### 飞书通知需要配置什么？

需要飞书自建应用的：

- App ID
- App Secret
- 默认群聊 ID

任务执行完成后，AICron 会把结果摘要或全文推送到配置的群聊。

## 开发命令

```bash
npm test
npm --prefix web run build
npm run desktop:dev
npm run desktop:pack
npm run desktop:dist
```

## License

MIT
