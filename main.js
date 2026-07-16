/*
 * SlopBrowser - Main Process
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { getBuildInfo } = require("./build-info");
const { HistoryStore } = require("./stores/history-store");
const { BookmarkStore } = require("./stores/bookmark-store");
const { DownloadStore } = require("./stores/download-store");
const { AgentSettingsStore } = require("./stores/agent-settings-store");
const { SessionStore } = require("./stores/session-store");
const { createDownloadManager } = require("./main/download-manager");
const { AdblockService } = require("./blocker/adblock-service");
const { createWindow: createWindowFactory } = require("./main/window");
const { configureIntegrationSessions } = require("./main/session-config");
const { registerIpc } = require("./main/ipc");
const { registerTabIpc } = require("./main/tab-manager");
const { registerSidePanelIpc } = require("./main/side-panel-manager");
const {
  initExtensionService,
  registerExtensionIpc,
  registerTabWithExtensions,
  unregisterTabWithExtensions,
  selectTabWithExtensions,
  ensureWebStore,
  extensionsDir,
} = require("./main/extension-service");
const {
  managerForWindow,
  managerForWebContents,
  tabIdForWebContents,
} = require("./main/tab-manager");
const { registerMenuOverlayIpc } = require("./main/menu-overlay");

const isDev = process.argv.includes("--dev");
const adblockService = new AdblockService();
const historyStore = new HistoryStore();
const bookmarkStore = new BookmarkStore();
const downloadStore = new DownloadStore();
const agentSettingsStore = new AgentSettingsStore();
const sessionStore = new SessionStore();
const downloadManager = createDownloadManager(downloadStore, () =>
  app.getPath("downloads")
);
let cachedBuildInfo = null;

const homeURL = pathToFileURL(
  path.join(__dirname, "renderer", "newtab.html")
).href;

const tabDeps = {
  adblockService,
  attachDownloadHandler: downloadManager.attachSessionDownloadHandler,
  preloadPath: path.join(__dirname, "preload-webview.js"),
  homeURL,
  onTabRegistered(wc, win) {
    registerTabWithExtensions(wc.session, wc, win);
  },
  onTabUnregistered(wc) {
    unregisterTabWithExtensions(wc);
  },
  onTabSelected(wc) {
    selectTabWithExtensions(wc);
  },
};

const createWindow = createWindowFactory({ isDev, tabDeps });

initExtensionService({
  getHomeURL: () => homeURL,
  partitionForWindow(win) {
    return managerForWindow(win)?.partition || "persist:slopbrowser";
  },
  createTabInWindow(win, opts) {
    const mgr = managerForWindow(win);
    if (!mgr) return null;
    return mgr.createTabFromMain(opts);
  },
  selectTabWebContents(wc, win) {
    const mgr = managerForWebContents(wc) || managerForWindow(win);
    const tabId = tabIdForWebContents(wc);
    if (!mgr || tabId == null) return;
    mgr.setActive(tabId, { skipExtensionSelect: true });
    if (!mgr.chrome.isDestroyed()) {
      mgr.chrome.send("tabs:mainActivated", { tabId });
    }
  },
  closeTabWebContents(wc, win) {
    const mgr = managerForWebContents(wc) || managerForWindow(win);
    const tabId = tabIdForWebContents(wc);
    if (!mgr || tabId == null) return;
    mgr.closeTab(tabId);
  },
  createWindow: () => createWindow(),
});

if (!app.isPackaged) {
  try {
    require("electron-reload")(__dirname, {
      electron: path.join(
        __dirname,
        "node_modules",
        "electron",
        process.platform === "win32" ? "dist/electron.exe" : "dist/electron"
      ),
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });
  } catch (err) {
    console.warn("Hot reload unavailable:", err.message);
  }
}

registerTabIpc(require("electron").ipcMain);
registerSidePanelIpc(require("electron").ipcMain);
registerExtensionIpc(require("electron").ipcMain);
registerMenuOverlayIpc(require("electron").ipcMain);

registerIpc({
  app,
  adblockService,
  historyStore,
  bookmarkStore,
  downloadManager,
  agentSettingsStore,
  sessionStore,
  createWindow,
  getCachedBuildInfo: () => cachedBuildInfo,
  setCachedBuildInfo: (info) => {
    cachedBuildInfo = info;
  },
});

app.whenReady().then(async () => {
  cachedBuildInfo = getBuildInfo(app);
  historyStore.init(app.getPath("userData"));
  bookmarkStore.init(app.getPath("userData"));
  downloadStore.init(app.getPath("userData"));
  agentSettingsStore.init(app.getPath("userData"));
  sessionStore.init(app.getPath("userData"));
  const { sesFromPartition } = require("./main/session-config");
  const mainSession = sesFromPartition("persist:slopbrowser");
  adblockService.ensureSession(mainSession);
  try {
    fs.mkdirSync(extensionsDir(), { recursive: true });
  } catch (_) {}
  try {
    await ensureWebStore(mainSession);
  } catch (err) {
    console.error("Extension / Web Store init failed:", err?.message || err);
  }
  configureIntegrationSessions();

  createWindow();

  adblockService
    .init(app.getPath("userData"), {
      locale: app.getLocale?.() || "en",
    })
    .catch((err) => {
      console.error("Adblock init failed:", err.message);
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  historyStore.save();
  bookmarkStore.save();
  downloadStore.save();
});
