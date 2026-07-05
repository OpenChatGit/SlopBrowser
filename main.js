/*
 * SlopBrowser - Main Process
 */
const { app, BrowserWindow, ipcMain, session, webContents } = require("electron");
const path = require("path");
const { getBuildInfo } = require("./build-info");
const { HistoryStore } = require("./history-store");
const { BookmarkStore } = require("./bookmark-store");
const { AdblockService } = require("./blocker/adblock-service");

const isDev = process.argv.includes("--dev");
const adblockService = new AdblockService();
const historyStore = new HistoryStore();
const bookmarkStore = new BookmarkStore();
let cachedBuildInfo = null;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

function clampZoomFactor(factor) {
  const n = Number(factor);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 100) / 100;
}

function notifyHistoryChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("slop:historyChanged");
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

// Hot reload while running from source (npm start / npm run dev).
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

let privateSeq = 0;

/** host webContents id -> Set of guest webview webContents ids */
const hostWebviewIds = new Map();

const SIDE_INTEGRATION_IDS = [
  "whatsapp",
  "telegram",
  "discord",
  "gmail",
  "instagram",
  "messenger",
];

const INTEGRATION_PERMISSIONS = new Set([
  "media",
  "mediaKeySystem",
  "geolocation",
  "notifications",
  "fullscreen",
  "pointerLock",
  "clipboard-read",
  "clipboard-sanitized-write",
]);

/** Strip Electron/SlopBrowser tokens so sites accept the webview as Chrome. */
function chromeUserAgent(ua) {
  return ua
    .replace(/\s*SlopBrowser\/[^\s]*/g, "")
    .replace(/\s*Electron\/[^\s]*/g, "")
    .trim();
}

/** @param {string} partition */
function sesFromPartition(partition) {
  return session.fromPartition(partition);
}

function sidePanelIdFromSession(sess) {
  try {
    const sp = sess.getStoragePath?.() || "";
    const m = sp.match(/slopbrowser-side-([^/\\]+)/i);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

function configureIntegrationSession(partition) {
  const ses = sesFromPartition(partition);
  const allow = (permission) => INTEGRATION_PERMISSIONS.has(permission);
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allow(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => allow(permission));
}

function configureIntegrationSessions() {
  for (const id of SIDE_INTEGRATION_IDS) {
    configureIntegrationSession(`persist:slopbrowser-side-${id}`);
  }
}

/** Build a URL suitable for session.cookies.remove(). */
function cookieRemoveUrl(cookie) {
  const proto = cookie.secure ? "https:" : "http:";
  const host = (cookie.domain || "").replace(/^\./, "");
  return `${proto}//${host}${cookie.path || "/"}`;
}

/**
 * Creates a browser window.
 * @param {{private?: boolean}} [opts]
 */
function createWindow(opts = {}) {
  const isPrivate = !!opts.private;

  // Normal windows share a persistent session; private windows get a
  // fresh in-memory partition (no "persist:" prefix => cleared on close).
  const partition = isPrivate
    ? "slopbrowser-private-" + ++privateSeq
    : "persist:slopbrowser";

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#000000",
    title: "SlopBrowser",
    // Frameless: we draw our own titlebar.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload-chrome.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Sandbox off so our preload can use Node modules (path).
      sandbox: false,
      // Allow <webview> tags in the renderer (our browser window).
      webviewTag: true,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: {
      partition,
      private: isPrivate ? "1" : "",
    },
  });

  // Report maximize state to the renderer so the icon matches.
  const sendMaxState = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("window:maximized", win.isMaximized());
    }
  };
  win.on("maximize", sendMaxState);
  win.on("unmaximize", sendMaxState);

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

// Window controls from the renderer (custom titlebar).
ipcMain.on("app:getBuildInfo", (event) => {
  if (!cachedBuildInfo) {
    try {
      cachedBuildInfo = getBuildInfo(app);
    } catch (_) {
      cachedBuildInfo = {
        version: require("./package.json").version,
        buildId: "unknown",
      };
    }
  }
  event.returnValue = cachedBuildInfo;
});

ipcMain.on("window:minimize", (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});

ipcMain.on("window:toggleMaximize", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("window:close", (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});

ipcMain.handle("window:isMaximized", (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
});

// Open a new browser window (normal / private).
ipcMain.on("window:new", (_e, opts) => {
  createWindow(opts || {});
});

// Cookie management (per webview session partition).
ipcMain.handle("cookies:getAll", async (_e, partition) => {
  if (!partition) return [];
  return sesFromPartition(partition).cookies.get({});
});

ipcMain.handle("cookies:getForUrl", async (_e, { partition, url }) => {
  if (!partition || !url) return [];
  return sesFromPartition(partition).cookies.get({ url });
});

ipcMain.handle("cookies:remove", async (_e, { partition, cookie }) => {
  if (!partition || !cookie?.name) return false;
  const ses = sesFromPartition(partition);
  await ses.cookies.remove(cookieRemoveUrl(cookie), cookie.name);
  return true;
});

ipcMain.handle("cookies:clear", async (_e, { partition, url }) => {
  if (!partition) return false;
  const ses = sesFromPartition(partition);
  if (url) {
    const list = await ses.cookies.get({ url });
    await Promise.all(
      list.map((c) => ses.cookies.remove(cookieRemoveUrl(c), c.name))
    );
  } else {
    await ses.clearStorageData({ storages: ["cookies"] });
  }
  return true;
});

/** Wipe all site data for an in-memory (private) tab partition. */
ipcMain.handle("cookies:clearPartition", async (_e, partition) => {
  if (!partition) return false;
  const ses = sesFromPartition(partition);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

/** Precise guest size for side-panel webviews (disableguestresize). */
ipcMain.handle("webview:setSize", (_e, { webContentsId, width, height }) => {
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) return false;
  const w = Math.round(Math.max(1, width));
  const h = Math.round(Math.max(1, height));
  wc.setSize({ normal: { width: w, height: h } });
  return true;
});

/** Pass mouse events through guest webviews to the chrome (panel resize drag). */
ipcMain.handle("webview:setPointerPassthrough", (e, ignore) => {
  const hostId = e.sender?.id;
  if (!hostId) return false;
  const passthrough = !!ignore;
  const ids = hostWebviewIds.get(hostId);
  if (!ids) return true;
  for (const id of ids) {
    const wc = webContents.fromId(id);
    if (!wc || wc.isDestroyed()) continue;
    try {
      wc.setIgnoreMouseEvents(passthrough, { forward: passthrough });
    } catch (_) {}
  }
  return true;
});

ipcMain.handle("adblock:getState", () => adblockService.getState());

ipcMain.handle("adblock:setEnabled", (_e, enabled) => {
  return adblockService.setEnabled(enabled);
});

ipcMain.handle("adblock:isEnabled", () => adblockService.isEnabled());

ipcMain.handle("history:getAll", () => historyStore.getAll());
ipcMain.handle("history:add", (_e, entry) => {
  historyStore.add(entry);
  notifyHistoryChanged();
  return true;
});
ipcMain.handle("history:remove", (_e, url) => {
  historyStore.remove(url);
  notifyHistoryChanged();
  return true;
});
ipcMain.handle("history:removeEntry", (_e, url, visitedAt) => {
  historyStore.removeEntry(url, visitedAt);
  notifyHistoryChanged();
  return true;
});
ipcMain.handle("history:removeEntries", (_e, entries) => {
  historyStore.removeEntries(entries);
  notifyHistoryChanged();
  return true;
});
ipcMain.handle("history:clear", () => {
  historyStore.clear();
  notifyHistoryChanged();
  return true;
});

ipcMain.handle("bookmarks:getAll", () => bookmarkStore.getAll());
ipcMain.handle("bookmarks:has", (_e, url) => bookmarkStore.has(url));
ipcMain.handle("bookmarks:add", (_e, entry) => {
  bookmarkStore.add(entry);
  return true;
});
ipcMain.handle("bookmarks:remove", (_e, url) => {
  bookmarkStore.remove(url);
  return true;
});
ipcMain.handle("bookmarks:toggle", (_e, entry) => bookmarkStore.toggle(entry));

ipcMain.handle("adblock:getCosmetics", (_e, url) => {
  return adblockService.getCosmetics(url);
});

ipcMain.handle("adblock:matchHiddenSelectors", (_e, payload) => {
  const { classes, ids, exceptions } = payload || {};
  return adblockService.matchHiddenSelectors(classes, ids, exceptions);
});

ipcMain.on("adblock:isEnabledSync", (e) => {
  e.returnValue = adblockService.isEnabled();
});

ipcMain.on("adblock:getCosmeticsSync", (e, url) => {
  e.returnValue = adblockService.getCosmetics(url);
});

ipcMain.handle("webview:setBackground", (_e, webContentsId) => {
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) return false;
  try {
    wc.setBackgroundColor("#0e0f13");
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.on("webview:zoomWheel", (e, payload) => {
  const contents = e.sender;
  if (!contents || contents.isDestroyed?.()) return;
  if (contents.getType?.() !== "webview") return;

  const deltaY = payload?.deltaY ?? 0;
  if (!deltaY) return;

  const dir = deltaY < 0 ? 1 : -1;
  const next = clampZoomFactor(contents.getZoomFactor() + dir * ZOOM_STEP);
  if (next === contents.getZoomFactor()) return;

  contents.setZoomFactor(next);
  notifyZoomChanged(contents, next);
});

// Configuration for every embedded webview (tabs + side panel).
app.on("web-contents-created", (_e, contents) => {
  if (contents.getType() !== "webview") return;

  const guestId = contents.id;
  let hostId = null;

  const trackHost = () => {
    const host = contents.hostWebContents;
    if (!host || host.isDestroyed()) return;
    hostId = host.id;
    let ids = hostWebviewIds.get(hostId);
    if (!ids) {
      ids = new Set();
      hostWebviewIds.set(hostId, ids);
    }
    ids.add(guestId);
  };
  trackHost();

  contents.once("destroyed", () => {
    if (hostId == null) return;
    const ids = hostWebviewIds.get(hostId);
    if (!ids) return;
    ids.delete(guestId);
    if (ids.size === 0) hostWebviewIds.delete(hostId);
  });

  applyChromeUserAgent(contents);
  adblockService.ensureSession(contents.session);

  contents.on("zoom-changed", () => {
    if (contents.isDestroyed()) return;
    const raw = contents.getZoomFactor();
    const clamped = clampZoomFactor(raw);
    if (raw !== clamped) contents.setZoomFactor(clamped);
    notifyZoomChanged(contents, clamped);
  });

  // Dark base background instead of white: prevents the white flash
  // on navigation and reload before the page paints itself.
  const applyBg = () => {
    try {
      contents.setBackgroundColor("#0e0f13");
    } catch (_) {}
  };
  applyBg();
  const injectCosmetics = (url, isMainFrame) => {
    if (!isMainFrame || !url?.startsWith("http")) return;
    adblockService.injectCosmetics(contents, url).catch(() => {});
  };

  contents.on("did-start-navigation", (_ev, url, _inPlace, isMainFrame) => {
    if (isMainFrame) applyBg();
    injectCosmetics(url, isMainFrame);
  });

  contents.on("did-commit-navigation", (_ev, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) applyBg();
  });

  contents.on("did-navigate-in-page", (_ev, url, isMainFrame) => {
    injectCosmetics(url, isMainFrame);
  });

  // Popups: side-panel integrations stay in-panel; main tabs open new tab.
  contents.setWindowOpenHandler(({ url }) => {
    const host = contents.hostWebContents;
    const sideId = sidePanelIdFromSession(contents.session);
    if (sideId) {
      host?.send("slop:openSideURL", { url, sideId });
    } else {
      host?.send("slop:openURL", url);
    }
    return { action: "deny" };
  });

  // Also capture browser shortcuts when the web page has focus.
  contents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown") {
      const key = input.key;
      if (key === "F5" || ((input.control || input.meta) && key.toLowerCase() === "r")) {
        applyBg();
      }
    }
    if (input.type !== "keyDown" || !(input.control || input.meta)) return;
    const key = input.key.toLowerCase();
    if (key === "n" && !input.shift) {
      event.preventDefault();
      contents.hostWebContents?.send("slop:shortcut", "n");
      return;
    }
    if (key === "p" && input.shift) {
      event.preventDefault();
      contents.hostWebContents?.send("slop:shortcut", "private");
      return;
    }
    if (key === "h" && !input.shift) {
      event.preventDefault();
      contents.hostWebContents?.send("slop:shortcut", "h");
      return;
    }
    if (key === "t" && input.shift) {
      event.preventDefault();
      contents.hostWebContents?.send("slop:shortcut", "shift+t");
      return;
    }
    if (["t", "w", "l", "r"].includes(key)) {
      event.preventDefault();
      contents.hostWebContents?.send("slop:shortcut", key);
    }
  });
});

function applyChromeUserAgent(contents) {
  try {
    const ua = chromeUserAgent(contents.getUserAgent());
    if (ua) contents.setUserAgent(ua);
  } catch (_) {}
}

app.whenReady().then(() => {
  cachedBuildInfo = getBuildInfo(app);
  historyStore.init(app.getPath("userData"));
  bookmarkStore.init(app.getPath("userData"));
  const mainSes = sesFromPartition("persist:slopbrowser");
  adblockService.ensureSession(mainSes);
  configureIntegrationSessions();

  createWindow();

  adblockService.init(app.getPath("userData"), {
    locale: app.getLocale?.() || "en",
  }).catch((err) => {
    console.error("Adblock init failed:", err);
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
