const { BrowserWindow, webContents } = require("electron");

function notifyHistoryChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("slop:historyChanged");
  }
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || wc.getType() !== "webview") continue;
    try {
      wc.send("slop:historyChanged");
    } catch (_) {}
  }
}

function notifyZoomChanged(contents, factor) {
  try {
    const host = contents.hostWebContents;
    if (!host || host.isDestroyed()) return;
    host.send("slop:zoomChanged", {
      webContentsId: contents.id,
      factor,
    });
  } catch (_) {}
}

module.exports = { notifyHistoryChanged, notifyZoomChanged };
