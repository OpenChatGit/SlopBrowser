const { contextBridge, ipcRenderer } = require("electron");

let initCb = null;

ipcRenderer.on("sessionRestoreOverlay:init", (_e, payload) => initCb?.(payload));

contextBridge.exposeInMainWorld("sessionRestoreOverlayAPI", {
  onInit: (cb) => {
    initCb = cb;
  },
  runAction: (action, detail) =>
    ipcRenderer.send("sessionRestoreOverlay:action", {
      action,
      ...(detail || {}),
    }),
  resize: (size) => ipcRenderer.send("sessionRestoreOverlay:resize", size || {}),
  close: () => ipcRenderer.send("sessionRestoreOverlay:closed"),
});
