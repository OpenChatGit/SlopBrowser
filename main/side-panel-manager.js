const { WebContentsView } = require("electron");
const { applyChromeUserAgent } = require("./session-config");

/** @type {Map<number, WindowSidePanelManager>} */
const managersByChrome = new Map();

function sidePartition(id) {
  return `persist:slopbrowser-side-${id}`;
}

function managerForSender(sender) {
  if (!sender || sender.isDestroyed?.()) return null;
  return managersByChrome.get(sender.id) || null;
}

class WindowSidePanelManager {
  constructor(win) {
    this.win = win;
    this.chrome = win.webContents;
    /** @type {Map<string, { view: WebContentsView, url: string }>} */
    this.panels = new Map();
    this.activeId = null;
    this.bounds = null;
    this.boundsReady = false;

    managersByChrome.set(this.chrome.id, this);
    win.on("closed", () => {
      managersByChrome.delete(this.chrome.id);
      for (const panel of this.panels.values()) {
        try {
          this.win.contentView.removeChildView(panel.view);
        } catch (_) {}
        try {
          panel.view.webContents.close();
        } catch (_) {}
      }
      this.panels.clear();
    });
  }

  sendEvent(integrationId, type, data = {}) {
    if (this.chrome.isDestroyed()) return;
    this.chrome.send("sidePanel:event", { integrationId, type, ...data });
  }

  applyBoundsToPanel(panel) {
    if (!panel?.view || !this.boundsReady || !this.bounds) return;
    panel.view.setBounds(this.bounds);
  }

  setBounds(bounds) {
    if (!bounds) {
      this.boundsReady = false;
      for (const panel of this.panels.values()) {
        panel.view.setVisible(false);
      }
      return true;
    }
    const x = Math.round(bounds.x ?? 0);
    const y = Math.round(bounds.y ?? 0);
    const width = Math.round(Math.max(0, bounds.width ?? 0));
    const height = Math.round(Math.max(0, bounds.height ?? 0));
    if (width < 1 || height < 1) return false;
    this.bounds = { x, y, width, height };
    this.boundsReady = true;
    for (const panel of this.panels.values()) {
      this.applyBoundsToPanel(panel);
    }
    if (this.activeId) this.setActive(this.activeId);
    return true;
  }

  wireContents(integrationId, contents) {
    applyChromeUserAgent(contents);

    const applyBg = () => {
      try {
        contents.setBackgroundColor("#0e0f13");
      } catch (_) {}
    };
    applyBg();

    contents.setWindowOpenHandler(({ url }) => {
      if (!this.chrome.isDestroyed()) {
        this.chrome.send("slop:openSideURL", { url, sideId: integrationId });
      }
      return { action: "deny" };
    });

    contents.on("did-start-navigation", (_ev, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) applyBg();
    });

    contents.on("page-title-updated", (_ev, title) => {
      this.sendEvent(integrationId, "page-title-updated", {
        title,
        url: contents.getURL(),
      });
    });

    contents.on("page-favicon-updated", (_ev, favicons) => {
      this.sendEvent(integrationId, "page-favicon-updated", {
        favicons,
        url: contents.getURL(),
      });
    });

    contents.on("dom-ready", () => {
      this.sendEvent(integrationId, "dom-ready", { url: contents.getURL() });
    });

    contents.on("did-stop-loading", () => {
      this.sendEvent(integrationId, "did-stop-loading", { url: contents.getURL() });
    });

    contents.on("did-navigate", () => {
      this.sendEvent(integrationId, "did-navigate", { url: contents.getURL() });
    });

    contents.on("did-navigate-in-page", () => {
      this.sendEvent(integrationId, "did-navigate-in-page", {
        url: contents.getURL(),
      });
    });

    contents.on(
      "did-fail-load",
      (_ev, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        this.sendEvent(integrationId, "did-fail-load", {
          errorCode,
          errorDescription,
          validatedURL,
        });
      }
    );
  }

  ensure({ integrationId, url }) {
    if (!integrationId) return { ok: false };
    let panel = this.panels.get(integrationId);
    if (panel) {
      if (url && url !== panel.url) {
        panel.url = url;
        panel.view.webContents.loadURL(url).catch(() => {});
      }
      return { ok: true, integrationId, webContentsId: panel.view.webContents.id };
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition: sidePartition(integrationId),
        webgl: true,
      },
    });

    const contents = view.webContents;
    view.setBackgroundColor("#0e0f13");
    this.win.contentView.addChildView(view);
    view.setVisible(false);

    panel = { view, url: url || "" };
    this.panels.set(integrationId, panel);
    this.wireContents(integrationId, contents);

    if (url) {
      contents.loadURL(url).catch(() => {});
    }

    return { ok: true, integrationId, webContentsId: contents.id };
  }

  setActive(integrationId) {
    this.activeId = integrationId || null;

    for (const [id, panel] of this.panels) {
      const active = integrationId != null && id === integrationId;
      const show = active && this.boundsReady;
      panel.view.setVisible(show);
      if (show) {
        try {
          this.win.contentView.removeChildView(panel.view);
        } catch (_) {}
        this.win.contentView.addChildView(panel.view);
        this.applyBoundsToPanel(panel);
        try {
          panel.view.webContents.focus();
        } catch (_) {}
      }
    }
    return true;
  }

  hideAll() {
    return this.setActive(null);
  }

  loadURL(integrationId, url) {
    const panel = this.panels.get(integrationId);
    if (!panel || !url) return false;
    panel.url = url;
    panel.view.webContents.loadURL(url).catch(() => {});
    return true;
  }

  getURL(integrationId) {
    const panel = this.panels.get(integrationId);
    if (!panel) return "";
    try {
      return panel.view.webContents.getURL();
    } catch (_) {
      return "";
    }
  }

  async executeJavaScript(integrationId, code) {
    const panel = this.panels.get(integrationId);
    if (!panel) return null;
    return panel.view.webContents.executeJavaScript(code, false);
  }

  setPointerPassthrough(ignore) {
    const passthrough = !!ignore;
    for (const panel of this.panels.values()) {
      const wc = panel.view.webContents;
      if (!wc || wc.isDestroyed()) continue;
      try {
        wc.setIgnoreMouseEvents(passthrough, { forward: passthrough });
      } catch (_) {}
    }
  }

  setContentViewsVisible(visible) {
    if (visible) {
      if (this.activeId) this.setActive(this.activeId);
      return;
    }
    for (const panel of this.panels.values()) {
      try {
        panel.view.setVisible(false);
      } catch (_) {}
    }
  }
}

function initWindowSidePanels(win) {
  return new WindowSidePanelManager(win);
}

function registerSidePanelIpc(ipcMain) {
  ipcMain.handle("sidePanel:setBounds", (e, bounds) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.setBounds(bounds);
  });

  ipcMain.handle("sidePanel:ensure", (e, opts = {}) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return { ok: false };
    return mgr.ensure(opts);
  });

  ipcMain.handle("sidePanel:setActive", (e, integrationId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.setActive(integrationId || null);
  });

  ipcMain.handle("sidePanel:hideAll", (e) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.hideAll();
  });

  ipcMain.handle("sidePanel:loadURL", (e, { integrationId, url } = {}) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return false;
    return mgr.loadURL(integrationId, url);
  });

  ipcMain.handle("sidePanel:getURL", (e, integrationId) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return "";
    return mgr.getURL(integrationId);
  });

  ipcMain.handle("sidePanel:executeJavaScript", async (e, { integrationId, code } = {}) => {
    const mgr = managerForSender(e.sender);
    if (!mgr) return null;
    return mgr.executeJavaScript(integrationId, code);
  });
}

module.exports = {
  initWindowSidePanels,
  registerSidePanelIpc,
  managerForSender,
};
