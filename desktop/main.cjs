const { app, BrowserWindow, Menu, Tray, nativeImage, Notification, ipcMain, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = process.env.AICRON_DESKTOP_DEV === '1';
const HOST = '127.0.0.1';
const PORT = Number(process.env.AICRON_DESKTOP_PORT || (isDev ? process.env.PORT || 3000 : 3218));
const API_BASE_URL = `http://${HOST}:${PORT}`;
const WEB_DEV_URL = process.env.AICRON_WEB_URL || 'http://127.0.0.1:5180';

let mainWindow;
let tray;
let serverProcess;
let serverApp;
let isQuitting = false;

function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath,
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function resolveRoot() {
  if (isDev) return path.resolve(__dirname, '..');
  return app.getAppPath();
}

function resolveDesktopDataRoot() {
  return process.env.AICRON_HOME || path.join(app.getPath('home'), '.aicron');
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

function notifyRunComplete(task, run) {
  if (!Notification.isSupported()) return;
  const success = run.status === 'succeeded';
  const title = success ? 'AICron 任务执行完成' : 'AICron 任务执行异常';
  const body = `${task.name || '未命名任务'}：${run.status}`;
  const notification = new Notification({ title, body });
  notification.on('click', () => {
    showMainWindow();
    if (run.id && mainWindow) mainWindow.webContents.send('desktop:navigate', `/runs/${run.id}`);
  });
  notification.show();
}

// Dev mode uses the separately started Fastify process from npm scripts. Packaged
// mode starts the same server module in-process so desktop run notifications can
// hook into completion events without duplicating backend logic.
async function startServer() {
  if (isDev) {
    if (process.env.AICRON_EXTERNAL_SERVER === '1') {
      await waitForHealth(API_BASE_URL);
      return;
    }
    const root = resolveRoot();
    const serverEntry = path.join(root, 'server', 'index.js');
    serverProcess = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST,
        ELECTRON_RUN_AS_NODE: '1',
      },
      cwd: root,
      stdio: 'inherit',
    });
    serverProcess.on('exit', (code) => {
      if (!isQuitting && code !== 0 && Notification.isSupported()) {
        new Notification({
          title: 'AICron 后端已退出',
          body: `服务异常退出，退出码：${code}`,
        }).show();
      }
    });
    await waitForHealth(API_BASE_URL);
    return;
  }

  const root = resolveRoot();
  const dataRoot = resolveDesktopDataRoot();
  const dataDir = path.join(dataRoot, 'data');
  process.env.PORT = String(PORT);
  process.env.HOST = HOST;
  process.env.AICRON_HOME = dataRoot;
  process.env.DATA_DIR = dataDir;
  process.env.DB_PATH = path.join(dataDir, 'aicron.db');
  process.env.RUNS_DIR = path.join(dataDir, 'runs');

  const serverModule = await import(pathToFileURL(path.join(root, 'server', 'index.js')).href);
  serverApp = await serverModule.startServer({
    port: PORT,
    host: HOST,
    logger: false,
    onRunComplete: notifyRunComplete,
  });
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

function navigateTo(targetPath) {
  showMainWindow();
  if (mainWindow) mainWindow.webContents.send('desktop:navigate', targetPath);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.svg');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image);
  tray.setToolTip('AICron');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 AICron', click: showMainWindow },
    { label: '打开设置', click: () => navigateTo('/settings') },
    { type: 'separator' },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => setOpenAtLogin(item.checked),
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
        { label: '设置', click: () => navigateTo('/settings') },
        { type: 'separator' },
        { label: '退出 AICron', accelerator: 'CommandOrControl+Q', click: quitApp },
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

async function quitApp() {
  isQuitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  if (serverApp) {
    await serverApp.close();
    serverApp = null;
  }
  app.quit();
}

ipcMain.handle('desktop:get-api-base-url', () => API_BASE_URL);
ipcMain.handle('desktop:get-startup-enabled', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('desktop:set-startup-enabled', (_event, enabled) => {
  setOpenAtLogin(enabled);
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
  try {
    await startServer();
    createMenu();
    createTray();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('AICron 启动失败', err?.stack || err?.message || String(err));
    await quitApp();
  }
});
