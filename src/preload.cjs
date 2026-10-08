const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('kontaktDrop', {
  filePath: (file) => webUtils.getPathForFile(file),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  analyze: (folder) => ipcRenderer.invoke('analyze-library', folder),
  search: (analysis) => ipcRenderer.invoke('search-library', analysis),
  prepare: (options) => ipcRenderer.invoke('prepare-library', options),
  openPath: (target) => ipcRenderer.invoke('open-path', target),
  openKontakt: () => ipcRenderer.invoke('open-kontakt')
});
