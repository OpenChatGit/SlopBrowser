const { contextBridge, ipcRenderer } = require("electron");

let initCb = null;

ipcRenderer.on("downloadPanelOverlay:init", (_e, payload) => initCb?.(payload));

contextBridge.exposeInMainWorld("downloadPanelOverlayAPI", {
  onInit: (cb) => {
    initCb = cb;
  },
  runAction: (action, detail) =>
    ipcRenderer.send("downloadPanelOverlay:action", { action, ...(detail || {}) }),
  close: () => ipcRenderer.send("downloadPanelOverlay:closed"),
});
