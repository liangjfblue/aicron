# AICron 发布流程

这份文档给维护者使用，不面向普通用户。

## 发布前检查

```bash
git status --short
npm test
npm --prefix web run build
```

确认没有误提交：

- 数据库文件
- `.env`
- `dist-packages/`
- `desktop-dist/`
- 本地过程文档

## 推送代码

```bash
git push origin master
```

## 创建标签

示例：

```bash
git tag -a v1.0.0-alpha.1 -m "AICron v1.0.0-alpha.1"
git push origin v1.0.0-alpha.1
```

## 创建 GitHub Release

打开：

```text
https://github.com/liangjfblue/aicron/releases/new
```

选择对应 tag，标题建议：

```text
AICron v1.0.0-alpha.1
```

Release notes 模板：

```md
## AICron v1.0.0-alpha.1

V1 Alpha，适合个人使用和小范围内测。

### 主要能力
- 桌面版：托盘、桌面通知、开机自启动、启动后最小化到托盘
- 首次引导：创建本地账号，配置 Claude/Codex 路径和飞书
- 任务调度：Cron、多段调度、有效时间范围
- Agent 执行：Claude Code CLI / Codex CLI
- 飞书通知：摘要/全文/附件
- 执行历史：时间线、执行时长、进度事件、结果详情
- 任务链：父任务成功后触发子任务

### 数据目录
- macOS / Linux: ~/.aicron
- Windows: C:\Users\<用户名>\.aicron
```

## 上传构建产物

- macOS：上传本机打包结果
- Windows：在 Windows 机器上执行 `npm run desktop:dist` 后上传 NSIS 安装包

Windows 建议在真实 Windows 环境验证：

```powershell
npm install
cd web
npm install
cd ..
npm run desktop:dist
```
