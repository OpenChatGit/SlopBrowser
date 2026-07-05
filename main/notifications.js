const { BrowserWindow, webContents } = require("electron");

/*
 * Only internal file:// pages (history.html, downloads.html) consume these
 * events — skip regular web pages to avoid waking every busy site's renderer.
 */
function sendToInternalWebviews(channel) {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || wc.getType() !== "webview") continue;
    try {
      const url = wc.getURL();
      if (!url || !url.startsWith("file:")) continue;
      wc.send(channel);
    } catch (_) {}
  }
}

/*
 * History changes fire on every navigation (and in bursts on redirects);
 * each broadcast makes the chrome renderer refetch the whole history via IPC.
 * Coalesce to at most one broadcast per 250ms so page loads aren't taxed.
 */
let historyNotifyTimer = null;

function notifyHistoryChanged() {
  if (historyNotifyTimer) return;
  historyNotifyTimer = setTimeout(() => {
    historyNotifyTimer = null;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("slop:historyChanged");
    }
    sendToInternalWebviews("slop:historyChanged");
  }, 250);
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

function notifyDownloadChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("slop:downloadChanged");
  }
  sendToInternalWebviews("slop:downloadChanged");
}

function notifyDownloadStarted(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("slop:downloadStarted", payload);
  }
}

module.exports = {
  notifyHistoryChanged,
  notifyZoomChanged,
  notifyDownloadChanged,
  notifyDownloadStarted,
};
