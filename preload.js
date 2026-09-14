const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  scanFolder: (rootPath) => ipcRenderer.invoke('library:scan-folder', rootPath),
  getCover: (filePath, format) => ipcRenderer.invoke('library:get-cover', { filePath, format }),
  getPageList: (filePath, format) => ipcRenderer.invoke('comic:get-page-list', { filePath, format }),
  getPageData: (filePath, format, pageName) => ipcRenderer.invoke('comic:get-page-data', { filePath, format, pageName }),
  readFileBuffer: (filePath) => ipcRenderer.invoke('comic:read-file', filePath),
  openPathInExplorer: (filePath) => ipcRenderer.invoke('shell:show-item', filePath)
});
