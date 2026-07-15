const { contextBridge, ipcRenderer } = require("electron");

let initCb = null;

ipcRenderer.on("slopPanelOverlay:init", (_e, payload) => initCb?.(payload));

contextBridge.exposeInMainWorld("slopPanelOverlayAPI", {
  onInit: (cb) => {
    initCb = cb;
  },
  runAction: (action) => ipcRenderer.send("slopPanelOverlay:action", { action }),
  close: () => ipcRenderer.send("slopPanelOverlay:closed"),
});
