const { BrowserWindow, webContents } = require("electron");
const { getChromeForGuestWebContents } = require("./tab-manager");

/*
 * Only internal file:// pages (history.html, downloads.html) consume these
 * events — skip regular web pages to avoid waking every busy site's renderer.
 */
function sendToInternalPages(channel) {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    try {
      const url = wc.getURL();
      if (!url || !url.startsWith("file:")) continue;
      if (
        !url.includes("/renderer/history.html") &&
        !url.includes("/renderer/downloads.html") &&
        !url.includes("/renderer/settings.html")
      ) {
        continue;
      }
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
    sendToInternalPages("slop:historyChanged");
  }, 250);
}

function notifyZoomChanged(contents, factor) {
  try {
    const tabChrome = getChromeForGuestWebContents(contents.id);
    if (tabChrome && !tabChrome.isDestroyed()) {
      tabChrome.send("slop:zoomChanged", {
        webContentsId: contents.id,
        factor,
      });
      return;
    }
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
  sendToInternalPages("slop:downloadChanged");
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
