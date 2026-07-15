const path = require("path");
const { WebContentsView, BrowserWindow } = require("electron");
const { clampZoomFactor } = require("./constants");
const { applyChromeUserAgent } = require("./session-config");
const { canGoBack, canGoForward } = require("./nav-history");

/** @type {Map<number, WindowTabManager>} chrome webContents id -> manager */
const managersByChrome = new Map();

/** @type {Map<number, { manager: WindowTabManager, tabId: number }>} guest wc id */
const guestLookup = new Map();

/** All tab guest webContents ids (for zoom wheel type checks). */
const tabGuestIds = new Set();

function getChromeForGuestWebContents(guestId) {
  const hit = guestLookup.get(guestId);
  if (hit?.manager && !hit.manager.win.isDestroyed()) {
    return hit.manager.chrome;
  }
  return null;
}

function isTabGuestWebContents(guestId) {
  return tabGuestIds.has(guestId);
}

class WindowTabManager {
  constructor(win, deps) {
    this.win = win;
    this.chrome = win.webContents;
    this.adblockService = deps.adblockService;
    this.attachDownloadHandler = deps.attachDownloadHandler;
    this.preloadPath = deps.preloadPath;
    this.partition = deps.partition || "persist:slopbrowser";
    this.homeURL = deps.homeURL || "";
    this.onTabRegistered = deps.onTabRegistered;
    this.onTabUnregistered = deps.onTabUnregistered;
    this.onTabSelected = deps.onTabSelected;
    /** @type {Map<number, { view: WebContentsView, partition: string, zoom: number }>} */
    this.tabs = new Map();
    this.activeTabId = null;
    this.bounds = null;
    this.boundsReady = false;

    managersByChrome.set(this.chrome.id, this);
    win.on("closed", () => {
      managersByChrome.delete(this.chrome.id);
      for (const [guestId, info] of guestLookup) {
        if (info.manager === this) guestLookup.delete(guestId);
      }
      for (const tab of this.tabs.values()) {
        tabGuestIds.delete(tab.view.webContents.id);
      }
      this.tabs.clear();
    });
  }

  sendEvent(tabId, type, data = {}) {
    if (this.chrome.isDestroyed()) return;
    this.chrome.send("tab:event", { tabId, type, ...data });
  }

  applyBoundsToTab(tab) {
    if (!tab?.view || !this.boundsReady || !this.bounds) return;
    tab.view.setBounds(this.bounds);
  }

  applyBoundsToAll() {
    if (!this.boundsReady) return;
    for (const tab of this.tabs.values()) {
      this.applyBoundsToTab(tab);
    }
  }

  setBounds(bounds) {
    const x = Math.round(bounds?.x ?? 0);
    const y = Math.round(bounds?.y ?? 0);
    const width = Math.round(Math.max(0, bounds?.width ?? 0));
    const height = Math.round(Math.max(0, bounds?.height ?? 0));
    if (width < 1 || height < 1) return false;
    this.bounds = { x, y, width, height };
    this.boundsReady = true;
    this.applyBoundsToAll();
    if (this.activeTabId != null) {
      this.setActive(this.activeTabId);
    }
    return true;
  }

  wireGuestContents(tabId, contents) {
    const guestId = contents.id;
    guestLookup.set(guestId, { manager: this, tabId });
    tabGuestIds.add(guestId);

    contents.once("destroyed", () => {
      guestLookup.delete(guestId);
      tabGuestIds.delete(guestId);
    });

    applyChromeUserAgent(contents);
    this.adblockService.ensureSession(contents.session);
    this.attachDownloadHandler?.(contents.session);

    contents.on("zoom-changed", () => {
      if (contents.isDestroyed()) return;
      const raw = contents.getZoomFactor();
      const clamped = clampZoomFactor(raw);
      if (raw !== clamped) contents.setZoomFactor(clamped);
      const tab = this.tabs.get(tabId);
      if (tab) tab.zoom = clamped;
      if (!this.chrome.isDestroyed()) {
        this.chrome.send("slop:zoomChanged", {
          webContentsId: guestId,
          factor: clamped,
        });
      }
    });

    const applyBg = () => {
      try {
        contents.setBackgroundColor("#0e0f13");
      } catch (_) {}
    };
    applyBg();

    const injectCosmetics = (url, isMainFrame) => {
      if (!isMainFrame || !url?.startsWith("http")) return;
      this.adblockService.injectCosmetics(contents, url).catch(() => {});
    };

    contents.once("destroyed", () => {
      this.adblockService.clearCosmeticsForContents(guestId);
    });

    contents.on("will-navigate", (_ev, url) => {
      injectCosmetics(url, true);
    });

    contents.on("did-start-navigation", (_ev, url, _inPlace, isMainFrame) => {
      if (isMainFrame) applyBg();
      injectCosmetics(url, isMainFrame);
    });

    contents.on("did-commit-navigation", (_ev, url, _inPlace, isMainFrame) => {
      if (isMainFrame) applyBg();
      injectCosmetics(url, isMainFrame);
    });

    contents.on("did-navigate-in-page", (_ev, url, isMainFrame) => {
      injectCosmetics(url, isMainFrame);
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (!this.chrome.isDestroyed()) {
        this.chrome.send("slop:openURL", url);
      }
      return { action: "deny" };
    });

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
        this.chrome.send("slop:shortcut", "n");
        return;
      }
      if (key === "p" && input.shift) {
        event.preventDefault();
        this.chrome.send("slop:shortcut", "private");
        return;
      }
      if (key === "h" && !input.shift) {
        event.preventDefault();
        this.chrome.send("slop:shortcut", "h");
        return;
      }
      if (key === "j" && !input.shift) {
        event.preventDefault();
        this.chrome.send("slop:shortcut", "j");
        return;
      }
      if (key === "t" && input.shift) {
        event.preventDefault();
        this.chrome.send("slop:shortcut", "shift+t");
        return;
      }
      if (["t", "w", "l", "r"].includes(key)) {
        event.preventDefault();
        this.chrome.send("slop:shortcut", key);
      }
    });

    contents.on("dom-ready", () => {
      injectCosmetics(contents.getURL(), true);
      this.sendEvent(tabId, "dom-ready", {
        webContentsId: guestId,
        url: contents.getURL(),
      });
    });

    contents.on("did-finish-load", () => {
      this.sendEvent(tabId, "did-finish-load", { url: contents.getURL() });
    });

    contents.on("page-title-updated", (_ev, title) => {
      this.sendEvent(tabId, "page-title-updated", {
        title,
        url: contents.getURL(),
      });
    });

    contents.on("page-favicon-updated", (_ev, favicons) => {
      this.sendEvent(tabId, "page-favicon-updated", {
        favicons,
        url: contents.getURL(),
      });
    });

    contents.on("did-stop-loading", () => {
      this.sendEvent(tabId, "did-stop-loading", { url: contents.getURL() });
    });

    const onNavigate = (_ev, url) => {
      this.sendEvent(tabId, "did-navigate", {
        url: url || contents.getURL(),
      });
    };
    contents.on("did-navigate", onNavigate);

    contents.on("did-navigate-in-page", (_ev, url) => {
      this.sendEvent(tabId, "did-navigate-in-page", {
        url: url || contents.getURL(),
      });
    });

    contents.on(
      "did-fail-load",
      (_ev, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        this.sendEvent(tabId, "did-fail-load", {
          errorCode,
          errorDescription,
          validatedURL,
        });
      }
    );
  }

  createTab({ tabId, url, partition, zoom = 1 }) {
    if (this.tabs.has(tabId)) return { ok: false, error: "Tab exists" };

    const view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition,
      },
    });

    const contents = view.webContents;
    view.setBackgroundColor("#0e0f13");
    this.win.contentView.addChildView(view);
    view.setVisible(false);

    const tab = { view, partition, zoom: clampZoomFactor(zoom) };
    this.tabs.set(tabId, tab);
    this.wireGuestContents(tabId, contents);

    try {
      contents.setZoomFactor(tab.zoom);
    } catch (_) {}

    if (url) {
      contents.loadURL(url).catch(() => {});
    }

    this.onTabRegistered?.(contents, this.win);

    return {
      ok: true,
      tabId,
      webContentsId: contents.id,
    };
  }

  /** Create a tab from the main process (e.g. Chrome extension API). */
  createTabFromMain({ tabId, url, partition, activate = true, notifyRenderer = true }) {
    const part = partition || this.partition;
    const result = this.createTab({
      tabId,
      url,
      partition: part,
      zoom: 1,
    });
    if (!result.ok) return null;
    if (activate) this.setActive(tabId, { skipExtensionSelect: true });
    if (notifyRenderer) {
      this.chrome.send("tabs:mainCreated", {
        tabId,
        url: url || this.homeURL,
        webContentsId: result.webContentsId,
        partition: part,
      });
    }
    return this.getTabContents(tabId);
  }

  closeTab(tabId, opts = {}) {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    const wc = tab.view.webContents;
    this.onTabUnregistered?.(wc);
    this.tabs.delete(tabId);
    tabGuestIds.delete(tab.view.webContents.id);
    guestLookup.delete(tab.view.webContents.id);

    try {
      this.win.contentView.removeChildView(tab.view);
    } catch (_) {}
    try {
      tab.view.webContents.close();
    } catch (_) {}

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
    if (opts.notifyRenderer !== false) {
      this.chrome.send("tabs:mainClosed", { tabId });
    }
    return true;
  }

  setActive(tabId, opts = {}) {
    if (!this.tabs.has(tabId)) return false;
    if (this.activeTabId === tabId && !opts.force) {
      const tab = this.tabs.get(tabId);
      if (tab?.view?.getVisible?.()) return true;
    }
    this.activeTabId = tabId;

    for (const [id, tab] of this.tabs) {
      const active = id === tabId;
      tab.view.setVisible(active && this.boundsReady);
      if (active && this.boundsReady) {
        try {
          this.win.contentView.removeChildView(tab.view);
        } catch (_) {}
        this.win.contentView.addChildView(tab.view);
        this.applyBoundsToTab(tab);
        try {
          tab.view.webContents.focus();
        } catch (_) {}
      }
    }
    if (!opts.skipExtensionSelect) {
      const tab = this.tabs.get(tabId);
      if (tab) this.onTabSelected?.(tab.view.webContents);
    }
    try {
      require("./menu-overlay").raiseIfVisible(this.win);
    } catch (_) {}
    return true;
  }

  getTabContents(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    const wc = tab.view.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc;
  }

  loadURL(tabId, url) {
    const wc = this.getTabContents(tabId);
    if (!wc) return false;
    wc.loadURL(url).catch(() => {});
    return true;
  }

  goBack(tabId) {
    const wc = this.getTabContents(tabId);
    if (!wc || !canGoBack(wc)) return false;
    wc.goBack();
    return true;
  }

  goForward(tabId) {
    const wc = this.getTabContents(tabId);
    if (!wc || !canGoForward(wc)) return false;
    wc.goForward();
    return true;
  }

  reload(tabId) {
    const wc = this.getTabContents(tabId);
    if (!wc) return false;
    try {
      wc.setBackgroundColor("#0e0f13");
    } catch (_) {}
    wc.reload();
    return true;
  }

  canGoBack(tabId) {
    const wc = this.getTabContents(tabId);
    return wc ? canGoBack(wc) : false;
  }

  canGoForward(tabId) {
    const wc = this.getTabContents(tabId);
    return wc ? canGoForward(wc) : false;
  }

  getURL(tabId) {
    const wc = this.getTabContents(tabId);
    return wc ? wc.getURL() : "";
  }

  setZoom(tabId, factor) {
    const tab = this.tabs.get(tabId);
    const wc = this.getTabContents(tabId);
    if (!tab || !wc) return false;
    const next = clampZoomFactor(factor);
    tab.zoom = next;
    wc.setZoomFactor(next);
    return true;
  }

  focus(tabId) {
    const wc = this.getTabContents(tabId);
    if (!wc) return false;
    wc.focus();
    return true;
  }

  async executeJavaScript(tabId, code) {
    const wc = this.getTabContents(tabId);
    if (!wc) return null;
    return wc.executeJavaScript(code, true);
  }

  openDevTools(tabId) {
    const wc = this.getTabContents(tabId);
    if (!wc) return false;
    wc.openDevTools({ mode: "detach" });
    return true;
  }

  forwardGuestMessage(senderId, channel, payload) {
    const hit = guestLookup.get(senderId);
    if (!hit || hit.manager !== this) return false;
    this.sendEvent(hit.tabId, "guest-message", { channel, payload });
    return true;
  }

  setPointerPassthrough(ignore) {
    const passthrough = !!ignore;
    for (const tab of this.tabs.values()) {
      const wc = tab.view.webContents;
      if (!wc || wc.isDestroyed()) continue;
      try {
        wc.setIgnoreMouseEvents(passthrough, { forward: passthrough });
      } catch (_) {}
    }
  }

  setContentViewsVisible(visible) {
    if (visible) {
      if (this.activeTabId != null) {
        this.setActive(this.activeTabId, { force: true });
      }
      return;
    }
    for (const tab of this.tabs.values()) {
      try {
        tab.view.setVisible(false);
      } catch (_) {}
    }
  }
}

function managerForSender(sender) {
  if (!sender || sender.isDestroyed?.()) return null;
  return managersByChrome.get(sender.id) || null;
}

function managerForWindow(win) {
  if (!win || win.isDestroyed()) return null;
  return managersByChrome.get(win.webContents.id) || null;
}

function managerForWebContents(wc) {
  if (!wc || wc.isDestroyed()) return null;
  const hit = guestLookup.get(wc.id);
  return hit?.manager || null;
}

function tabIdForWebContents(wc) {
  if (!wc) return null;
  return guestLookup.get(wc.id)?.tabId ?? null;
}

function initWindowTabs(win, deps) {
  return new WindowTabManager(win, deps);
}

function registerTabIpc(ipcMain) {
  ipcMain.handle("tabs:setBounds", (e, bounds) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    mgr.setBounds(bounds || {});
    return true;
  });

  ipcMain.handle("tabs:create", (e, opts = {}) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return { ok: false, error: "No tab manager" };
    return mgr.createTab(opts);
  });

  ipcMain.handle("tabs:close", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.closeTab(tabId, { notifyRenderer: false });
  });

  ipcMain.handle("tabs:setActive", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.setActive(tabId);
  });

  ipcMain.handle("tabs:loadURL", (e, { tabId, url } = {}) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.loadURL(tabId, url);
  });

  ipcMain.handle("tabs:goBack", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.goBack(tabId);
  });

  ipcMain.handle("tabs:goForward", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.goForward(tabId);
  });

  ipcMain.handle("tabs:reload", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.reload(tabId);
  });

  ipcMain.handle("tabs:canGoBack", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.canGoBack(tabId);
  });

  ipcMain.handle("tabs:canGoForward", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.canGoForward(tabId);
  });

  ipcMain.handle("tabs:getURL", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return "";
    return mgr.getURL(tabId);
  });

  ipcMain.handle("tabs:setZoom", (e, { tabId, factor } = {}) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.setZoom(tabId, factor);
  });

  ipcMain.handle("tabs:focus", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.focus(tabId);
  });

  ipcMain.handle("tabs:executeJavaScript", async (e, { tabId, code } = {}) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return null;
    return mgr.executeJavaScript(tabId, code);
  });

  ipcMain.handle("tabs:openDevTools", (e, tabId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.openDevTools(tabId);
  });

  ipcMain.on("tab:guestMessage", (e, { channel, payload } = {}) => {
    const hit = guestLookup.get(e.sender.id);
    if (!hit?.manager) return;
    hit.manager.forwardGuestMessage(e.sender.id, channel, payload);
  });
}

module.exports = {
  initWindowTabs,
  registerTabIpc,
  getChromeForGuestWebContents,
  isTabGuestWebContents,
  managerForSender,
  managerForWindow,
  managerForWebContents,
  tabIdForWebContents,
  guestLookup,
};
