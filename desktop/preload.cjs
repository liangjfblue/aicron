const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aicronDesktop', {
  isDesktop: true,
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:get-api-base-url'),
  getStartupEnabled: () => ipcRenderer.invoke('desktop:get-startup-enabled'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('desktop:set-startup-enabled', Boolean(enabled)),
  showApp: () => ipcRenderer.invoke('desktop:show-app'),
  onNavigate: (callback) => {
    const handler = (_event, targetPath) => callback(targetPath);
    ipcRenderer.on('desktop:navigate', handler);
    return () => ipcRenderer.removeListener('desktop:navigate', handler);
  },
});
