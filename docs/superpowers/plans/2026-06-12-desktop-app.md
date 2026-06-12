# Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package AICron as a desktop app with system tray, desktop notifications, single-instance behavior, app menu, and startup-at-login controls while preserving the current web/server task logic.

**Architecture:** Keep `server/` as the single backend implementation and keep `web/` as the single UI implementation. Add an Electron shell in `desktop/` that starts the existing Fastify server on localhost, loads the built React UI, owns tray/menu/autostart/notifications, and exposes a tiny desktop bridge API to the renderer.

**Tech Stack:** Electron, electron-builder, Node.js, Fastify, SQLite via better-sqlite3, React/Vite, Vitest.

---

## Scope

This plan implements desktop V1 plumbing only:

- System tray icon and right-click menu.
- Desktop notification after task execution completes.
- Startup-at-login controls.
- Single-instance lock.
- App menu.
- Build scripts for macOS/Windows desktop packages.

This plan intentionally does not rewrite task scheduling, prompt execution, Feishu notifications, task UI, or database schema.

## File Structure

- Create `desktop/main.cjs`: Electron main process. Owns app lifecycle, single instance lock, server child process, BrowserWindow, tray, menu, IPC, and desktop notifications.
- Create `desktop/preload.cjs`: Safe renderer bridge that exposes `window.aicronDesktop`.
- Create `desktop/assets/tray-icon.svg`: Minimal tray icon source asset.
- Modify `package.json`: Add Electron dependencies and desktop scripts.
- Modify `server/index.js`: Export a `createApp()` factory and keep CLI startup behavior, so Electron can start the same server without duplicating backend code.
- Modify `web/src/api/client.js`: Support a runtime API base from `window.aicronDesktop.getApiBaseUrl()`, while keeping browser dev behavior unchanged.
- Modify `web/src/pages/SettingsPage.jsx`: Add desktop-only startup-at-login controls when desktop bridge exists.
- Modify `README.md`: Add desktop development/build instructions.
- Test existing backend with `npm test`.
- Test frontend build with `cd web && npm run build`.
- Test desktop shell with `npm run desktop:dev`.

---

### Task 1: Add Desktop Dependencies And Scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Electron tooling**

Run:

```bash
npm install --save-dev electron electron-builder wait-on concurrently
```

Expected: `package.json` and `package-lock.json` update with the new dev dependencies.

- [ ] **Step 2: Add desktop scripts and build metadata**

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "test": "vitest run",
    "desktop:dev": "concurrently -k \"npm run desktop:server\" \"npm run desktop:web\" \"npm run desktop:electron\"",
    "desktop:server": "PORT=3000 HOST=127.0.0.1 node server/index.js",
    "desktop:web": "npm --prefix web run dev -- --host 127.0.0.1 --port 5180",
    "desktop:electron": "wait-on http://127.0.0.1:3000/api/health http://127.0.0.1:5180 && AICRON_DESKTOP_DEV=1 electron desktop/main.cjs",
    "desktop:build:web": "npm --prefix web run build",
    "desktop:pack": "npm run desktop:build:web && electron-builder --dir",
    "desktop:dist": "npm run desktop:build:web && electron-builder"
  }
}
```

Add this top-level `build` section:

```json
{
  "build": {
    "appId": "com.aicron.app",
    "productName": "AICron",
    "directories": {
      "output": "desktop-dist"
    },
    "files": [
      "desktop/**/*",
      "server/**/*",
      "web/dist/**/*",
      "package.json",
      "node_modules/**/*"
    ],
    "mac": {
      "category": "public.app-category.productivity"
    },
    "win": {
      "target": "nsis"
    }
  }
}
```

Expected: Existing `npm test` still points to `vitest run`.

- [ ] **Step 3: Verify package scripts are parseable**

Run:

```bash
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts).sort().join('\\n'))"
```

Expected output contains:

```text
desktop:build:web
desktop:dev
desktop:dist
desktop:electron
desktop:pack
desktop:server
desktop:web
test
```

- [ ] **Step 4: Commit**

Run:

```bash
git add package.json package-lock.json
git commit -m "build: add electron desktop tooling"
```

---

### Task 2: Refactor Server Startup For Reuse

**Files:**
- Modify: `server/index.js`
- Test: `server/test/routes/health.test.js`

- [ ] **Step 1: Write an import smoke test**

Append this test to `server/test/routes/health.test.js`:

```js
it('server module exports a reusable app factory', async () => {
  const mod = await import('../../index.js');
  expect(typeof mod.createApp).toBe('function');
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- server/test/routes/health.test.js
```

Expected: FAIL because `createApp` is not exported yet.

- [ ] **Step 3: Replace top-level app construction with a factory**

Modify `server/index.js` so it has this shape:

```js
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getDb, closeDb } from './db/index.js';
import { verifyToken } from './utils/jwt.js';
import { authRoutes } from './routes/auth.js';
import { taskRoutes } from './routes/tasks.js';
import { runRoutes } from './routes/runs.js';
import { settingsRoutes } from './routes/settings.js';
import { promptRoutes } from './routes/prompt.js';
import { skillRoutes } from './routes/skill.js';
import { healthRoutes } from './routes/health.js';
import { Scheduler, scheduleTask } from './services/scheduler.js';
import { Executor } from './services/executor.js';
import { TaskService } from './services/task.js';
import { NotifyService } from './services/notify.js';
import { AuthService } from './services/auth.js';

async function authenticate(request, reply) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未登录' });
  }
  try {
    request.user = verifyToken(auth.slice(7));
  } catch {
    return reply.code(401).send({ error: '登录已过期' });
  }
}

export async function createApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const db = getDb();

  app.decorate('db', db);
  app.decorate('authenticate', authenticate);
  app.register(authRoutes);
  app.register(taskRoutes);
  app.register(runRoutes);
  app.register(settingsRoutes);
  app.register(promptRoutes);
  app.register(skillRoutes);
  app.register(healthRoutes);

  const executor = new Executor(db);
  const notifySvc = new NotifyService(db);
  executor.onRunComplete = async (task, run) => {
    if (options.onRunComplete) {
      await options.onRunComplete(task, run);
    }
    try {
      const rows = db.prepare('SELECT * FROM settings').all();
      const settings = {};
      for (const r of rows) settings[r.key] = r.value;
      if (settings.feishuAppId && settings.feishuAppSecret) {
        notifySvc.runSvc.addEvent(run.id, 'notifying', '准备发送通知', '执行结果已生成，正在推送飞书', {
          stage: 'notify',
          progress: 92,
          severity: 'info',
        });
        const result = await notifySvc.notify(task, run, settings);
        if (result?.skipped) {
          notifySvc.runSvc.addEvent(run.id, 'notify_skipped', '通知已跳过', result.reason || '未发送通知', {
            stage: 'notify',
            progress: 100,
            severity: 'warn',
          });
        } else {
          notifySvc.runSvc.addEvent(run.id, 'notified', '通知已发送', '飞书消息推送完成', {
            stage: 'notify',
            progress: 100,
            severity: 'success',
            notification_level: result?.level,
          });
        }
      } else {
        notifySvc.runSvc.addEvent(run.id, 'notify_skipped', '通知已跳过', '未配置飞书应用', {
          stage: 'notify',
          progress: 100,
          severity: 'warn',
        });
      }
    } catch (err) {
      notifySvc.runSvc.addEvent(run.id, 'notify_failed', '通知失败', err.message, {
        stage: 'notify',
        progress: 100,
        severity: 'error',
      });
      app.log.error({ err }, 'Notify error');
    }
  };

  const scheduler = new Scheduler(async (taskId) => {
    const taskSvc = new TaskService(db);
    const task = taskSvc.getById(taskId);
    if (!task || !task.enabled) return;
    if (!Scheduler.isTaskActiveNow(task)) return;
    await executor.execute(task, { triggerType: 'cron' });
  });

  const taskSvc = new TaskService(db);
  const tasks = taskSvc.list({ enabled: true });
  for (const t of tasks) {
    scheduleTask(scheduler, t);
  }

  app.decorate('executor', executor);
  app.decorate('scheduler', scheduler);

  const authSvc = new AuthService(db);
  const existingUser = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!existingUser) {
    const defaultUser = process.env.ADMIN_USER || 'admin';
    const defaultPass = process.env.ADMIN_PASS || 'admin123';
    try {
      await authSvc.createUser(defaultUser, defaultPass);
      app.log.info(`默认用户已创建: ${defaultUser} / ${defaultPass}`);
    } catch (err) {
      app.log.warn(`创建默认用户失败: ${err.message}`);
    }
  }

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  app.addHook('onClose', async () => {
    scheduler.stopAll();
    closeDb();
  });

  return app;
}

export async function startServer(options = {}) {
  const app = await createApp(options);
  await app.listen({
    port: options.port || config.PORT,
    host: options.host || config.HOST,
  });
  return app;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const app = await startServer();
  process.on('SIGINT', async () => {
    await app.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}
```

- [ ] **Step 4: Run targeted test**

Run:

```bash
npm test -- server/test/routes/health.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full backend tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add server/index.js server/test/routes/health.test.js
git commit -m "refactor: expose reusable server factory"
```

---

### Task 3: Add Electron Main Process With Tray, Menu, Single Instance, And Notifications

**Files:**
- Create: `desktop/main.cjs`
- Create: `desktop/preload.cjs`
- Create: `desktop/assets/tray-icon.svg`

- [ ] **Step 1: Create tray icon asset**

Create `desktop/assets/tray-icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#111827"/>
  <path d="M17.2 3.5 7.8 18h7.1l-1.2 10.5L24.2 13h-7.4l.4-9.5Z" fill="#8B5CF6"/>
  <path d="M14.4 18h-4.2l4.9-7.6-.2 5.1h4.3l-4.6 6.8.8-4.3Z" fill="#EDE9FE"/>
</svg>
```

- [ ] **Step 2: Create preload bridge**

Create `desktop/preload.cjs`:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aicronDesktop', {
  isDesktop: true,
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:get-api-base-url'),
  getStartupEnabled: () => ipcRenderer.invoke('desktop:get-startup-enabled'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('desktop:set-startup-enabled', Boolean(enabled)),
  showApp: () => ipcRenderer.invoke('desktop:show-app'),
});
```

- [ ] **Step 3: Create Electron main process**

Create `desktop/main.cjs`:

```js
const { app, BrowserWindow, Menu, Tray, nativeImage, Notification, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const isDev = process.env.AICRON_DESKTOP_DEV === '1';
const HOST = '127.0.0.1';
const PORT = Number(process.env.AICRON_DESKTOP_PORT || 3218);
const API_BASE_URL = `http://${HOST}:${PORT}`;
const WEB_DEV_URL = process.env.AICRON_WEB_URL || 'http://127.0.0.1:5180';

let mainWindow;
let tray;
let serverProcess;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function resolveRoot() {
  if (isDev) return path.resolve(__dirname, '..');
  return process.resourcesPath;
}

function waitForHealth(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${url}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`AICron server did not become ready at ${url}`));
        return;
      }
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function startServer() {
  if (isDev && process.env.AICRON_EXTERNAL_SERVER === '1') {
    await waitForHealth(API_BASE_URL);
    return;
  }

  const root = resolveRoot();
  const serverEntry = path.join(root, 'server', 'index.js');
  const dataDir = path.join(app.getPath('userData'), 'data');
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST,
      DATA_DIR: dataDir,
      DB_PATH: path.join(dataDir, 'aicron.db'),
      RUNS_DIR: path.join(dataDir, 'runs'),
      ELECTRON_RUN_AS_NODE: '1',
    },
    cwd: root,
    stdio: isDev ? 'inherit' : 'ignore',
  });

  serverProcess.on('exit', (code) => {
    if (!isQuitting && code !== 0) {
      new Notification({
        title: 'AICron 后端已退出',
        body: `服务异常退出，退出码：${code}`,
      }).show();
    }
  });

  await waitForHealth(API_BASE_URL);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: 'AICron',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(WEB_DEV_URL);
  } else {
    mainWindow.loadFile(path.join(resolveRoot(), 'web', 'dist', 'index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.svg');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image);
  tray.setToolTip('AICron');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 AICron', click: showMainWindow },
    { label: '打开设置', click: () => { showMainWindow(); mainWindow.webContents.send('desktop:navigate', '/settings'); } },
    { type: 'separator' },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: '退出', click: quitApp },
  ]));
  tray.on('click', showMainWindow);
}

function createMenu() {
  const template = [
    {
      label: 'AICron',
      submenu: [
        { label: '打开 AICron', click: showMainWindow },
        { label: '设置', click: () => { showMainWindow(); mainWindow.webContents.send('desktop:navigate', '/settings'); } },
        { type: 'separator' },
        { role: 'quit', label: '退出 AICron' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '打开项目主页', click: () => shell.openExternal('https://github.com/liangjfblue/aicron') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function quitApp() {
  isQuitting = true;
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  app.quit();
}

ipcMain.handle('desktop:get-api-base-url', () => API_BASE_URL);
ipcMain.handle('desktop:get-startup-enabled', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('desktop:set-startup-enabled', (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('desktop:show-app', () => {
  showMainWindow();
  return true;
});

app.on('second-instance', showMainWindow);
app.on('before-quit', () => {
  isQuitting = true;
});
app.on('window-all-closed', (event) => {
  event.preventDefault();
});
app.on('activate', showMainWindow);
app.on('quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.whenReady().then(async () => {
  await startServer();
  createMenu();
  createTray();
  createWindow();
});
```

- [ ] **Step 4: Run Electron syntax check**

Run:

```bash
node -c desktop/main.cjs
node -c desktop/preload.cjs
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add desktop
git commit -m "feat: add electron desktop shell"
```

---

### Task 4: Make Frontend API Calls Desktop-Aware

**Files:**
- Modify: `web/src/api/client.js`

- [ ] **Step 1: Add runtime API base helper**

Near the top of `web/src/api/client.js`, after `TOKEN_KEY`, add:

```js
let desktopApiBasePromise = null;

function normalizeApiBase(base) {
  return String(base || '').replace(/\/$/, '');
}

async function getApiBase() {
  if (!window.aicronDesktop?.getApiBaseUrl) return '';
  if (!desktopApiBasePromise) {
    desktopApiBasePromise = window.aicronDesktop.getApiBaseUrl().then(normalizeApiBase).catch(() => '');
  }
  return desktopApiBasePromise;
}

async function apiUrl(path) {
  const base = await getApiBase();
  return `${base}${path}`;
}
```

- [ ] **Step 2: Route all fetches through apiUrl**

Change the core `request()` fetch:

```js
const res = await fetch(await apiUrl(path), {
  ...options,
  headers,
});
```

Change direct fetches:

```js
const res = await fetch(await apiUrl('/api/tasks/import/analyze'), {
```

```js
const res = await fetch(await apiUrl(`/api/runs/${runId}/result`), { headers });
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```bash
git add web/src/api/client.js
git commit -m "feat: support desktop api base"
```

---

### Task 5: Add Desktop Startup Controls To Settings

**Files:**
- Modify: `web/src/pages/SettingsPage.jsx`

- [ ] **Step 1: Import desktop detection state**

Inside `SettingsPage`, after existing `useState` calls, add:

```js
const [desktop, setDesktop] = useState({
  available: Boolean(window.aicronDesktop?.isDesktop),
  startupEnabled: false,
  loading: Boolean(window.aicronDesktop?.isDesktop),
});
```

- [ ] **Step 2: Load startup state**

After the existing settings `useEffect`, add:

```js
useEffect(() => {
  if (!window.aicronDesktop?.getStartupEnabled) return;
  window.aicronDesktop.getStartupEnabled()
    .then((enabled) => setDesktop({ available: true, startupEnabled: Boolean(enabled), loading: false }))
    .catch(() => setDesktop({ available: true, startupEnabled: false, loading: false }));
}, []);
```

- [ ] **Step 3: Add toggle handler**

Before `if (loading)`, add:

```js
const handleStartupToggle = async () => {
  if (!window.aicronDesktop?.setStartupEnabled) return;
  const next = !desktop.startupEnabled;
  setDesktop((prev) => ({ ...prev, startupEnabled: next, loading: true }));
  try {
    const actual = await window.aicronDesktop.setStartupEnabled(next);
    setDesktop({ available: true, startupEnabled: Boolean(actual), loading: false });
    showToast(actual ? '已开启开机自启动' : '已关闭开机自启动');
  } catch (err) {
    setDesktop((prev) => ({ ...prev, startupEnabled: !next, loading: false }));
    showToast(err.message || '自启动设置失败', 'error');
  }
};
```

- [ ] **Step 4: Render desktop section**

Insert this section before the account security section:

```jsx
{desktop.available && (
  <section style={styles.section}>
    <h2 style={styles.sectionTitle}>桌面应用</h2>
    <div style={styles.row}>
      <label style={styles.label}>开机自启动</label>
      <button
        className={`btn ${desktop.startupEnabled ? 'btn-primary' : 'btn-secondary'}`}
        style={{ fontSize: '13px', width: '120px' }}
        onClick={handleStartupToggle}
        disabled={desktop.loading}
      >
        {desktop.loading ? '读取中...' : desktop.startupEnabled ? '已开启' : '未开启'}
      </button>
      <span style={{ color: 'var(--ink-tertiary)', fontSize: '13px' }}>
        关闭窗口后任务仍会在托盘后台运行
      </span>
    </div>
  </section>
)}
```

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

Run:

```bash
git add web/src/pages/SettingsPage.jsx
git commit -m "feat: add desktop startup setting"
```

---

### Task 6: Connect Desktop Notifications To Run Completion

**Files:**
- Modify: `desktop/main.cjs`
- Modify: `server/index.js`

- [ ] **Step 1: Add desktop notification helper**

In `desktop/main.cjs`, add:

```js
function notifyRunComplete(task, run) {
  if (!Notification.isSupported()) return;
  const success = run.status === 'succeeded';
  const title = success ? 'AICron 任务执行完成' : 'AICron 任务执行异常';
  const body = `${task.name || '未命名任务'}：${run.status}`;
  const notification = new Notification({ title, body });
  notification.on('click', () => {
    showMainWindow();
    if (run.id) mainWindow.webContents.send('desktop:navigate', `/runs/${run.id}`);
  });
  notification.show();
}
```

- [ ] **Step 2: Start server in-process for desktop production**

Replace the child-process-only `startServer()` implementation with an in-process production path:

```js
async function startServer() {
  if (isDev && process.env.AICRON_EXTERNAL_SERVER === '1') {
    await waitForHealth(API_BASE_URL);
    return;
  }

  const root = resolveRoot();
  const dataDir = path.join(app.getPath('userData'), 'data');
  process.env.PORT = String(PORT);
  process.env.HOST = HOST;
  process.env.DATA_DIR = dataDir;
  process.env.DB_PATH = path.join(dataDir, 'aicron.db');
  process.env.RUNS_DIR = path.join(dataDir, 'runs');

  if (isDev) {
    const serverEntry = path.join(root, 'server', 'index.js');
    serverProcess = spawn(process.execPath, [serverEntry], {
      env: process.env,
      cwd: root,
      stdio: 'inherit',
    });
    await waitForHealth(API_BASE_URL);
    return;
  }

  const serverModule = await import(pathToFileURL(path.join(root, 'server', 'index.js')).href);
  await serverModule.startServer({
    port: PORT,
    host: HOST,
    logger: false,
    onRunComplete: notifyRunComplete,
  });
}
```

Also import `pathToFileURL`:

```js
const { pathToFileURL } = require('node:url');
```

- [ ] **Step 3: Add dev notification limitation comment**

Add this comment above `startServer()`:

```js
// In dev mode the server runs as a child process, so desktop notifications for run
// completion are verified in packaged/in-process mode. The app shell itself can
// still be developed against the dev server.
```

- [ ] **Step 4: Run syntax check**

Run:

```bash
node -c desktop/main.cjs
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add desktop/main.cjs
git commit -m "feat: notify desktop on run completion"
```

---

### Task 7: Add Renderer Navigation Bridge For Menu And Notification Clicks

**Files:**
- Modify: `desktop/preload.cjs`
- Modify: `web/src/main.jsx`

- [ ] **Step 1: Extend preload bridge**

Add this method to `window.aicronDesktop`:

```js
onNavigate: (callback) => {
  const handler = (_event, targetPath) => callback(targetPath);
  ipcRenderer.on('desktop:navigate', handler);
  return () => ipcRenderer.removeListener('desktop:navigate', handler);
},
```

- [ ] **Step 2: Create navigation listener component**

Modify `web/src/main.jsx` to import `useEffect` and `useNavigate`:

```js
import { StrictMode, useEffect } from 'react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
```

Add:

```jsx
function DesktopNavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!window.aicronDesktop?.onNavigate) return undefined;
    return window.aicronDesktop.onNavigate((targetPath) => {
      if (typeof targetPath === 'string' && targetPath.startsWith('/')) {
        navigate(targetPath);
      }
    });
  }, [navigate]);
  return null;
}
```

Render it inside `BrowserRouter`:

```jsx
<BrowserRouter>
  <DesktopNavigationBridge />
  <App />
</BrowserRouter>
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:

```bash
git add desktop/preload.cjs web/src/main.jsx
git commit -m "feat: add desktop navigation bridge"
```

---

### Task 8: Document Desktop Development And Acceptance

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add desktop section**

Append this section to `README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

Run:

```bash
git add README.md
git commit -m "docs: add desktop app usage notes"
```

---

### Task 9: Full Verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Run backend tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Run Electron syntax checks**

Run:

```bash
node -c desktop/main.cjs
node -c desktop/preload.cjs
```

Expected: both commands exit 0.

- [ ] **Step 4: Run desktop dev app**

Run:

```bash
npm run desktop:dev
```

Expected:

- Electron window opens.
- Login works.
- Existing task list loads.
- Tray icon appears.
- Closing the window hides it instead of quitting.
- Tray “打开 AICron” shows the window again.
- Settings page shows desktop startup controls.

- [ ] **Step 5: Run package preview**

Run:

```bash
npm run desktop:pack
```

Expected: `desktop-dist/` contains an unpacked app directory for the current platform.

- [ ] **Step 6: Commit final verification note if needed**

Only if verification requires small documentation changes:

```bash
git add README.md
git commit -m "docs: clarify desktop verification"
```

---

## Self-Review

**Spec coverage:** The plan covers system tray, right-click menu, desktop notifications, startup-at-login controls, single-instance lock, app menu, and preserving existing server/web logic.

**Placeholder scan:** No task uses placeholder instructions like TBD or “implement later”. Each code-changing step includes concrete code or exact commands.

**Type consistency:** The desktop bridge consistently uses `window.aicronDesktop`, `getApiBaseUrl`, `getStartupEnabled`, `setStartupEnabled`, and `onNavigate`. The Electron main process sends `desktop:navigate`, and the preload bridge listens for the same channel.

