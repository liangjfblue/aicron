const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aicronDesktop', {
  isDesktop: true,
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:get-api-base-url'),
  getAppVersion: () => ipcRenderer.invoke('desktop:get-app-version'),
  getStartupEnabled: () => ipcRenderer.invoke('desktop:get-startup-enabled'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('desktop:set-startup-enabled', Boolean(enabled)),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  showApp: () => ipcRenderer.invoke('desktop:show-app'),
  onNavigate: (callback) => {
    const handler = (_event, targetPath) => callback(targetPath);
    ipcRenderer.on('desktop:navigate', handler);
    return () => ipcRenderer.removeListener('desktop:navigate', handler);
  },
});
