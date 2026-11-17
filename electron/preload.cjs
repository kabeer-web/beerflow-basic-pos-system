const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beerflowDesktop", {
  isDesktop: true,
  getPaths: () => ipcRenderer.invoke("pos:get-paths"),
  /** Permanently delete all app data (userData folder) and quit. */
  wipeAllData: () => ipcRenderer.invoke("pos:wipe-all-data"),
  showMessage: (title, message) => ipcRenderer.invoke("pos:show-message", title, message),
});
