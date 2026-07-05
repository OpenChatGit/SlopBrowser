/*
 * SlopBrowser - Main Process
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const { getBuildInfo } = require("./build-info");
const { HistoryStore } = require("./stores/history-store");
const { BookmarkStore } = require("./stores/bookmark-store");
const { AdblockService } = require("./blocker/adblock-service");
const { createWindow: createWindowFactory } = require("./main/window");
const { configureIntegrationSessions } = require("./main/session-config");
const { registerWebviewGuestHandlers } = require("./main/webview-guest");
const { registerIpc } = require("./main/ipc");

const isDev = process.argv.includes("--dev");
const adblockService = new AdblockService();
const historyStore = new HistoryStore();
const bookmarkStore = new BookmarkStore();
let cachedBuildInfo = null;

const createWindow = createWindowFactory({ isDev });

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

registerIpc({
  app,
  adblockService,
  historyStore,
  bookmarkStore,
  createWindow,
  getCachedBuildInfo: () => cachedBuildInfo,
  setCachedBuildInfo: (info) => {
    cachedBuildInfo = info;
  },
});

registerWebviewGuestHandlers(app, adblockService);

app.whenReady().then(() => {
  cachedBuildInfo = getBuildInfo(app);
  historyStore.init(app.getPath("userData"));
  bookmarkStore.init(app.getPath("userData"));
  const { sesFromPartition } = require("./main/session-config");
  adblockService.ensureSession(sesFromPartition("persist:slopbrowser"));
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
});
