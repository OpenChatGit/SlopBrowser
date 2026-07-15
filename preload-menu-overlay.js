const { contextBridge, ipcRenderer } = require("electron");

let initCb = null;

ipcRenderer.on("menuOverlay:init", (_e, payload) => initCb?.(payload));

contextBridge.exposeInMainWorld("menuOverlayAPI", {
  onInit: (cb) => {
    initCb = cb;
  },
  runAction: (action, detail) =>
    ipcRenderer.send("menuOverlay:action", { action, ...(detail || {}) }),
  close: () => ipcRenderer.send("menuOverlay:closed"),
});
