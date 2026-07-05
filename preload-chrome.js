/*
 * SlopBrowser - Preload for the browser chrome (our UI).
 */
const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const pkg = require("./package.json");
const { readPublicBuildInfo } = require("./build-info");

// Window parameters passed via the loadFile query (partition, private).
const params = new URLSearchParams(window.location.search);

// pathToFileURL yields properly normalized file:/// URLs (forward slashes,
// percent-encoding). Naive "file://" + path breaks on Windows backslashes.
// Single callback slots so hot reload does not stack duplicate IPC listeners.
let openURLCb = null;
let openSideURLCb = null;
let shortcutCb = null;
let maximizedCb = null;
let adBlockedCb = null;
let zoomChangedCb = null;
let historyChangedCb = null;
let downloadChangedCb = null;
let downloadStartedCb = null;
ipcRenderer.on("slop:openURL", (_e, url) => openURLCb?.(url));
ipcRenderer.on("slop:openSideURL", (_e, payload) => openSideURLCb?.(payload));
ipcRenderer.on("slop:shortcut", (_e, key) => shortcutCb?.(key));
ipcRenderer.on("window:maximized", (_e, isMax) => maximizedCb?.(isMax));
ipcRenderer.on("slop:adBlocked", (_e, payload) => adBlockedCb?.(payload));
ipcRenderer.on("slop:zoomChanged", (_e, payload) => zoomChangedCb?.(payload));
ipcRenderer.on("slop:historyChanged", () => historyChangedCb?.());
ipcRenderer.on("slop:downloadChanged", () => downloadChangedCb?.());
ipcRenderer.on("slop:downloadStarted", (_e, payload) => downloadStartedCb?.(payload));

const chromeUA = (() => {
  const v = process.versions.chrome || "131.0.0.0";
  const major = v.split(".")[0];
  return (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  );
})();

const buildInfo = readPublicBuildInfo() || { version: pkg.version, buildId: "" };
const newTabBase = pathToFileURL(
  path.join(__dirname, "renderer", "newtab.html")
).href;
const newTabURL = buildInfo.buildId
  ? `${newTabBase}?build=${encodeURIComponent(buildInfo.buildId)}&v=${encodeURIComponent(buildInfo.version)}`
  : newTabBase;
const historyURL = pathToFileURL(
  path.join(__dirname, "renderer", "history.html")
).href;
const downloadsURL = pathToFileURL(
  path.join(__dirname, "renderer", "downloads.html")
).href;

contextBridge.exposeInMainWorld("slopAPI", {
  newTabURL,
  historyURL,
  downloadsURL,
  buildId: buildInfo.buildId,
  version: buildInfo.version,

  // Absolute path for tab webview cosmetic/scriptlet preload.
  preloadWebviewPath: path.join(__dirname, "preload-webview.js"),

  // Session partition for this window's webviews.
  partition: params.get("partition") || "persist:slopbrowser",
  isPrivate: params.get("private") === "1",
  chromeUserAgent: chromeUA,

  // Open a new window: opts = { private? }.
  newWindow: (opts) => ipcRenderer.send("window:new", opts || {}),

  // Popups (window.open/target=_blank) from webviews as a new tab.
  onOpenURL: (cb) => {
    openURLCb = cb;
  },
  // Popups from side-panel integrations — load inside the same panel.
  onOpenSideURL: (cb) => {
    openSideURLCb = cb;
  },
  // Browser shortcuts captured while a webview was focused.
  onShortcut: (cb) => {
    shortcutCb = cb;
  },

  // Window controls for the custom titlebar.
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggleMaximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    onMaximizedChange: (cb) => {
      maximizedCb = cb;
    },
  },

  cookies: {
    getAll: (partition) => ipcRenderer.invoke("cookies:getAll", partition),
    getForUrl: (partition, url) =>
      ipcRenderer.invoke("cookies:getForUrl", { partition, url }),
    remove: (partition, cookie) =>
      ipcRenderer.invoke("cookies:remove", { partition, cookie }),
    clear: (partition, url) =>
      ipcRenderer.invoke("cookies:clear", { partition, url: url || null }),
    clearPartition: (partition) =>
      ipcRenderer.invoke("cookies:clearPartition", partition),
  },

  setWebviewSize: (webContentsId, width, height) =>
    ipcRenderer.invoke("webview:setSize", { webContentsId, width, height }),

  setWebviewBackground: (webContentsId) =>
    ipcRenderer.invoke("webview:setBackground", webContentsId),

  setWebviewsPointerPassthrough: (ignore) =>
    ipcRenderer.invoke("webview:setPointerPassthrough", !!ignore),

  adblock: {
    getState: () => ipcRenderer.invoke("adblock:getState"),
    setEnabled: (enabled) => ipcRenderer.invoke("adblock:setEnabled", !!enabled),
    onBlocked: (cb) => {
      adBlockedCb = cb;
    },
  },

  onZoomChanged: (cb) => {
    zoomChangedCb = cb;
  },

  onHistoryChanged: (cb) => {
    historyChangedCb = cb;
  },

  onDownloadChanged: (cb) => {
    downloadChangedCb = cb;
  },

  onDownloadStarted: (cb) => {
    downloadStartedCb = cb;
  },

  downloads: {
    getAll: () => ipcRenderer.invoke("downloads:getAll"),
    open: (id) => ipcRenderer.invoke("downloads:open", id),
    showInFolder: (id) => ipcRenderer.invoke("downloads:showInFolder", id),
    cancel: (id) => ipcRenderer.invoke("downloads:cancel", id),
    setFavicon: (id, favicon) =>
      ipcRenderer.invoke("downloads:setFavicon", id, favicon),
    remove: (id) => ipcRenderer.invoke("downloads:remove", id),
    removeMany: (ids) => ipcRenderer.invoke("downloads:removeMany", ids),
    clear: () => ipcRenderer.invoke("downloads:clear"),
  },

  history: {
    getAll: () => ipcRenderer.invoke("history:getAll"),
    add: (entry) => ipcRenderer.invoke("history:add", entry),
    remove: (url) => ipcRenderer.invoke("history:remove", url),
    removeEntry: (url, visitedAt) =>
      ipcRenderer.invoke("history:removeEntry", url, visitedAt),
    removeEntries: (entries) =>
      ipcRenderer.invoke("history:removeEntries", entries),
    clear: () => ipcRenderer.invoke("history:clear"),
  },

  bookmarks: {
    getAll: () => ipcRenderer.invoke("bookmarks:getAll"),
    has: (url) => ipcRenderer.invoke("bookmarks:has", url),
    add: (entry) => ipcRenderer.invoke("bookmarks:add", entry),
    remove: (url) => ipcRenderer.invoke("bookmarks:remove", url),
    toggle: (entry) => ipcRenderer.invoke("bookmarks:toggle", entry),
  },
});
