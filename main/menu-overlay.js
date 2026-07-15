const path = require("path");
const { WebContentsView, BrowserWindow } = require("electron");

const OVERLAY_SPECS = {
  menu: {
    width: 720,
    height: 560,
    html: "menu-overlay.html",
    preload: "preload-menu-overlay.js",
    initChannel: "menuOverlay:init",
  },
  slopPanel: {
    width: 360,
    height: 320,
    html: "slop-panel-overlay.html",
    preload: "preload-slop-panel-overlay.js",
    initChannel: "slopPanelOverlay:init",
  },
  downloadPanel: {
    width: 360,
    height: 440,
    html: "download-panel-overlay.html",
    preload: "preload-download-panel-overlay.js",
    initChannel: "downloadPanelOverlay:init",
  },
};

/** @type {Map<number, WindowOverlayManager>} chrome webContents id */
const managersByChrome = new Map();

class OverlayInstance {
  constructor(win, type, spec) {
    this.win = win;
    this.type = type;
    this.spec = spec;
    this.view = null;
    this.visible = false;
    this.bounds = null;
  }

  destroyView() {
    if (!this.view) return;
    try {
      this.win.contentView.removeChildView(this.view);
    } catch (_) {}
    try {
      this.view.webContents.close();
    } catch (_) {}
    this.view = null;
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view;

    const preloadPath = path.join(__dirname, "..", this.spec.preload);
    this.view = new WebContentsView({
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    try {
      this.view.setBackgroundColor("#00000000");
    } catch (_) {}

    this.view.webContents.loadFile(
      path.join(__dirname, "..", "renderer", this.spec.html)
    );

    this.view.webContents.on("destroyed", () => {
      if (this.view?.webContents?.isDestroyed?.()) this.view = null;
    });

    return this.view;
  }

  computeBounds(anchor) {
    const [winW, winH] = this.win.getContentSize();
    const right = Math.round(anchor.x + anchor.width);
    const below = Math.round(anchor.y + anchor.height);

    let x = right - this.spec.width;
    let y = below;
    x = Math.max(0, Math.min(x, Math.max(0, winW - this.spec.width)));
    y = Math.max(0, Math.min(y, Math.max(0, winH - 1)));

    const height = Math.min(this.spec.height, Math.max(0, winH - y));
    const bounds = {
      x,
      y,
      width: Math.min(this.spec.width, winW),
      height,
    };

    const panelAnchor = {
      right: right - x,
      top: 6,
    };

    return { bounds, panelAnchor };
  }

  raise() {
    if (!this.visible || !this.view || !this.bounds) return;
    try {
      this.win.contentView.removeChildView(this.view);
      this.win.contentView.addChildView(this.view);
      this.view.setBounds(this.bounds);
    } catch (_) {}
  }

  show(anchor, data) {
    if (!anchor || this.win.isDestroyed()) return false;

    const view = this.ensureView();
    const { bounds, panelAnchor } = this.computeBounds(anchor);
    this.bounds = bounds;
    this.visible = true;

    try {
      try {
        this.win.contentView.removeChildView(view);
      } catch (_) {}
      this.win.contentView.addChildView(view);
      view.setBounds(bounds);
    } catch (_) {
      return false;
    }

    const sendInit = () => {
      if (view.webContents.isDestroyed()) return;
      view.webContents.send(this.spec.initChannel, {
        panelAnchor,
        data: data || {},
      });
    };

    if (view.webContents.isLoading()) {
      view.webContents.once("did-finish-load", sendInit);
    } else {
      sendInit();
    }

    this.raise();
    return true;
  }

  hide() {
    this.visible = false;
    this.bounds = null;
    if (!this.view) return false;
    try {
      this.win.contentView.removeChildView(this.view);
    } catch (_) {}
    return true;
  }
}

class WindowOverlayManager {
  constructor(win) {
    this.win = win;
    this.chrome = win.webContents;
    /** @type {Map<string, OverlayInstance>} */
    this.overlays = new Map();

    for (const [type, spec] of Object.entries(OVERLAY_SPECS)) {
      this.overlays.set(type, new OverlayInstance(win, type, spec));
    }

    managersByChrome.set(this.chrome.id, this);
    win.on("closed", () => {
      managersByChrome.delete(this.chrome.id);
      for (const overlay of this.overlays.values()) {
        overlay.destroyView();
      }
      this.overlays.clear();
    });
  }

  overlay(type) {
    return this.overlays.get(type) || null;
  }

  show(type, anchor, data) {
    return this.overlay(type)?.show(anchor, data) ?? false;
  }

  hide(type) {
    return this.overlay(type)?.hide() ?? false;
  }

  isVisible(type) {
    return this.overlay(type)?.visible ?? false;
  }

  raiseAllVisible() {
    for (const overlay of this.overlays.values()) {
      if (overlay.visible) overlay.raise();
    }
  }
}

function initMenuOverlay(win) {
  return new WindowOverlayManager(win);
}

function managerForSender(sender) {
  if (!sender || sender.isDestroyed?.()) return null;
  return managersByChrome.get(sender.id) || null;
}

function managerForWindow(win) {
  if (!win || win.isDestroyed()) return null;
  return managersByChrome.get(win.webContents.id) || null;
}

function raiseIfVisible(win) {
  managerForWindow(win)?.raiseAllVisible();
}

function registerOverlayIpc(ipcMain, type, channels) {
  const { show, hide, isVisible, action, closed, chromeAction, chromeClosed } =
    channels;

  ipcMain.handle(show, (e, payload) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    const { anchor, data } = payload || {};
    return mgr.show(type, anchor, data);
  });

  ipcMain.handle(hide, (e) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    mgr.hide(type);
    return true;
  });

  ipcMain.handle(isVisible, (e) => {
    const mgr = managerForSender(e.sender);
    return mgr ? mgr.isVisible(type) : false;
  });

  ipcMain.on(action, (e, payload) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const mgr = win ? managerForWindow(win) : null;
    const chrome = mgr?.chrome;
    if (!chrome || chrome.isDestroyed()) return;
    chrome.send(chromeAction, payload || {});
  });

  ipcMain.on(closed, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const mgr = win ? managerForWindow(win) : null;
    if (!mgr) return;
    mgr.hide(type);
    const chrome = mgr.chrome;
    if (!chrome || chrome.isDestroyed()) return;
    chrome.send(chromeClosed);
  });
}

function registerMenuOverlayIpc(ipcMain) {
  registerOverlayIpc(ipcMain, "menu", {
    show: "menuOverlay:show",
    hide: "menuOverlay:hide",
    isVisible: "menuOverlay:isVisible",
    action: "menuOverlay:action",
    closed: "menuOverlay:closed",
    chromeAction: "menu:action",
    chromeClosed: "menu:closed",
  });

  registerOverlayIpc(ipcMain, "slopPanel", {
    show: "slopPanelOverlay:show",
    hide: "slopPanelOverlay:hide",
    isVisible: "slopPanelOverlay:isVisible",
    action: "slopPanelOverlay:action",
    closed: "slopPanelOverlay:closed",
    chromeAction: "slopPanel:action",
    chromeClosed: "slopPanel:closed",
  });

  registerOverlayIpc(ipcMain, "downloadPanel", {
    show: "downloadPanelOverlay:show",
    hide: "downloadPanelOverlay:hide",
    isVisible: "downloadPanelOverlay:isVisible",
    action: "downloadPanelOverlay:action",
    closed: "downloadPanelOverlay:closed",
    chromeAction: "downloadPanel:action",
    chromeClosed: "downloadPanel:closed",
  });
}

module.exports = {
  initMenuOverlay,
  managerForSender,
  managerForWindow,
  raiseIfVisible,
  registerMenuOverlayIpc,
};
