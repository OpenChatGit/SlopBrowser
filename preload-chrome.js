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
let slopAiStreamCb = null;
let tabEventCb = null;
let sidePanelEventCb = null;
let mainTabCreatedCb = null;
let mainTabClosedCb = null;
let mainTabActivatedCb = null;
let menuActionCb = null;
let menuClosedCb = null;
let slopPanelActionCb = null;
let slopPanelClosedCb = null;
let downloadPanelActionCb = null;
let downloadPanelClosedCb = null;
let sessionRestoreActionCb = null;
let sessionRestoreClosedCb = null;
ipcRenderer.on("slop:openURL", (_e, url) => openURLCb?.(url));
ipcRenderer.on("slop:openSideURL", (_e, payload) => openSideURLCb?.(payload));
ipcRenderer.on("slop:shortcut", (_e, key) => shortcutCb?.(key));
ipcRenderer.on("window:maximized", (_e, isMax) => maximizedCb?.(isMax));
ipcRenderer.on("slop:adBlocked", (_e, payload) => adBlockedCb?.(payload));
ipcRenderer.on("slop:zoomChanged", (_e, payload) => zoomChangedCb?.(payload));
ipcRenderer.on("slop:historyChanged", () => historyChangedCb?.());
ipcRenderer.on("slop:downloadChanged", () => downloadChangedCb?.());
ipcRenderer.on("slop:downloadStarted", (_e, payload) => downloadStartedCb?.(payload));
ipcRenderer.on("slopai:stream", (_e, payload) => slopAiStreamCb?.(payload));
ipcRenderer.on("tab:event", (_e, payload) => tabEventCb?.(payload));
ipcRenderer.on("sidePanel:event", (_e, payload) => sidePanelEventCb?.(payload));
ipcRenderer.on("tabs:mainCreated", (_e, payload) => mainTabCreatedCb?.(payload));
ipcRenderer.on("tabs:mainClosed", (_e, payload) => mainTabClosedCb?.(payload));
ipcRenderer.on("tabs:mainActivated", (_e, payload) => mainTabActivatedCb?.(payload));
ipcRenderer.on("menu:action", (_e, payload) => menuActionCb?.(payload));
ipcRenderer.on("menu:closed", () => menuClosedCb?.());
ipcRenderer.on("slopPanel:action", (_e, payload) => slopPanelActionCb?.(payload));
ipcRenderer.on("slopPanel:closed", () => slopPanelClosedCb?.());
ipcRenderer.on("downloadPanel:action", (_e, payload) =>
  downloadPanelActionCb?.(payload)
);
ipcRenderer.on("downloadPanel:closed", () => downloadPanelClosedCb?.());
ipcRenderer.on("sessionRestore:action", (_e, payload) =>
  sessionRestoreActionCb?.(payload)
);
ipcRenderer.on("sessionRestore:closed", () => sessionRestoreClosedCb?.());

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
const cookiesURL = pathToFileURL(
  path.join(__dirname, "renderer", "cookies.html")
).href;
const settingsURL = pathToFileURL(
  path.join(__dirname, "renderer", "settings.html")
).href;

contextBridge.exposeInMainWorld("slopAPI", {
  newTabURL,
  historyURL,
  downloadsURL,
  cookiesURL,
  settingsURL,
  buildId: buildInfo.buildId,
  version: buildInfo.version,

  // Session partition for this window's tabs.
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

  setWebviewsPointerPassthrough: (ignore) =>
    ipcRenderer.invoke("webview:setPointerPassthrough", !!ignore),

  setContentViewsVisible: (visible) =>
    ipcRenderer.invoke("content:setViewsVisible", !!visible),

  menuOverlay: {
    show: (anchor, data) =>
      ipcRenderer.invoke("menuOverlay:show", { anchor, data }),
    hide: () => ipcRenderer.invoke("menuOverlay:hide"),
    isVisible: () => ipcRenderer.invoke("menuOverlay:isVisible"),
    onAction: (cb) => {
      menuActionCb = cb;
    },
    onClosed: (cb) => {
      menuClosedCb = cb;
    },
  },

  slopPanelOverlay: {
    show: (anchor, data) =>
      ipcRenderer.invoke("slopPanelOverlay:show", { anchor, data }),
    hide: () => ipcRenderer.invoke("slopPanelOverlay:hide"),
    isVisible: () => ipcRenderer.invoke("slopPanelOverlay:isVisible"),
    onAction: (cb) => {
      slopPanelActionCb = cb;
    },
    onClosed: (cb) => {
      slopPanelClosedCb = cb;
    },
  },

  downloadPanelOverlay: {
    show: (anchor, data) =>
      ipcRenderer.invoke("downloadPanelOverlay:show", { anchor, data }),
    hide: () => ipcRenderer.invoke("downloadPanelOverlay:hide"),
    isVisible: () => ipcRenderer.invoke("downloadPanelOverlay:isVisible"),
    onAction: (cb) => {
      downloadPanelActionCb = cb;
    },
    onClosed: (cb) => {
      downloadPanelClosedCb = cb;
    },
  },

  sessionRestoreOverlay: {
    show: (anchor, data) =>
      ipcRenderer.invoke("sessionRestoreOverlay:show", { anchor, data }),
    hide: () => ipcRenderer.invoke("sessionRestoreOverlay:hide"),
    isVisible: () => ipcRenderer.invoke("sessionRestoreOverlay:isVisible"),
    onAction: (cb) => {
      sessionRestoreActionCb = cb;
    },
    onClosed: (cb) => {
      sessionRestoreClosedCb = cb;
    },
  },

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

  agentSettings: {
    get: () => ipcRenderer.invoke("agentSettings:get"),
    set: (data) => ipcRenderer.invoke("agentSettings:set", data),
    listModels: (opts) => ipcRenderer.invoke("agentSettings:listModels", opts || {}),
  },

  session: {
    get: () => ipcRenderer.invoke("session:get"),
    set: (state) => ipcRenderer.invoke("session:set", state),
    clear: () => ipcRenderer.invoke("session:clear"),
  },

  slopAi: {
    stream: (payload, handlers = {}) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const activeId = requestId;
      const onEvent = (msg) => {
        if (!msg || msg.requestId !== activeId) return;
        if (msg.type === "chunk" && msg.delta) {
          const kind = msg.kind === "reasoning" ? "reasoning" : "content";
          handlers.onChunk?.(msg.delta, { kind });
          if (kind === "reasoning") handlers.onReasoning?.(msg.delta);
          else handlers.onContent?.(msg.delta);
        }
        if (msg.type === "done") {
          cleanup();
          handlers.onDone?.(msg.text || "", {
            reasoning: msg.reasoning || "",
          });
        }
        if (msg.type === "error") {
          cleanup();
          handlers.onError?.(msg.error || "Request failed");
        }
      };
      const cleanup = () => {
        if (slopAiStreamCb === onEvent) slopAiStreamCb = null;
      };
      slopAiStreamCb = onEvent;
      return ipcRenderer.invoke("slopai:stream", { ...payload, requestId: activeId });
    },
  },

  tabs: {
    setBounds: (bounds) => ipcRenderer.invoke("tabs:setBounds", bounds),
    create: (opts) => ipcRenderer.invoke("tabs:create", opts),
    close: (tabId) => ipcRenderer.invoke("tabs:close", tabId),
    setActive: (tabId) => ipcRenderer.invoke("tabs:setActive", tabId),
    loadURL: (tabId, url) => ipcRenderer.invoke("tabs:loadURL", { tabId, url }),
    goBack: (tabId) => ipcRenderer.invoke("tabs:goBack", tabId),
    goForward: (tabId) => ipcRenderer.invoke("tabs:goForward", tabId),
    reload: (tabId) => ipcRenderer.invoke("tabs:reload", tabId),
    canGoBack: (tabId) => ipcRenderer.invoke("tabs:canGoBack", tabId),
    canGoForward: (tabId) => ipcRenderer.invoke("tabs:canGoForward", tabId),
    getURL: (tabId) => ipcRenderer.invoke("tabs:getURL", tabId),
    setZoom: (tabId, factor) =>
      ipcRenderer.invoke("tabs:setZoom", { tabId, factor }),
    focus: (tabId) => ipcRenderer.invoke("tabs:focus", tabId),
    executeJavaScript: (tabId, code) =>
      ipcRenderer.invoke("tabs:executeJavaScript", { tabId, code }),
    openDevTools: (tabId) => ipcRenderer.invoke("tabs:openDevTools", tabId),
    onEvent: (cb) => {
      tabEventCb = cb;
    },
    onMainCreated: (cb) => {
      mainTabCreatedCb = cb;
    },
    onMainClosed: (cb) => {
      mainTabClosedCb = cb;
    },
    onMainActivated: (cb) => {
      mainTabActivatedCb = cb;
    },
  },

  extensions: {
    getDir: () => ipcRenderer.invoke("extensions:getDir"),
    list: (partition) => ipcRenderer.invoke("extensions:list", partition),
    load: (partition, extensionPath) =>
      ipcRenderer.invoke("extensions:load", { partition, extensionPath }),
    remove: (partition, extensionId) =>
      ipcRenderer.invoke("extensions:remove", { partition, extensionId }),
    installFromStore: (partition, extensionId) =>
      ipcRenderer.invoke("extensions:installFromStore", { partition, extensionId }),
    updateAll: (partition) => ipcRenderer.invoke("extensions:updateAll", partition),
  },

  sidePanel: {
    setBounds: (bounds) => ipcRenderer.invoke("sidePanel:setBounds", bounds),
    ensure: (opts) => ipcRenderer.invoke("sidePanel:ensure", opts),
    setActive: (integrationId) =>
      ipcRenderer.invoke("sidePanel:setActive", integrationId || null),
    hideAll: () => ipcRenderer.invoke("sidePanel:hideAll"),
    loadURL: (integrationId, url) =>
      ipcRenderer.invoke("sidePanel:loadURL", { integrationId, url }),
    getURL: (integrationId) => ipcRenderer.invoke("sidePanel:getURL", integrationId),
    executeJavaScript: (integrationId, code) =>
      ipcRenderer.invoke("sidePanel:executeJavaScript", { integrationId, code }),
    onEvent: (cb) => {
      sidePanelEventCb = cb;
    },
  },
});
