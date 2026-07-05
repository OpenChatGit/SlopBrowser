const { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } = require("./constants");
const { notifyZoomChanged } = require("./notifications");
const {
  sidePanelIdFromSession,
  applyChromeUserAgent,
} = require("./session-config");

function clampZoomFactor(factor) {
  const n = Number(factor);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 100) / 100;
}

/** host webContents id -> Set of guest webview webContents ids */
const hostWebviewIds = new Map();

function registerWebviewGuestHandlers(app, adblockService, attachDownloadHandler) {
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
    attachDownloadHandler?.(contents.session);

    contents.on("zoom-changed", () => {
      if (contents.isDestroyed()) return;
      const raw = contents.getZoomFactor();
      const clamped = clampZoomFactor(raw);
      if (raw !== clamped) contents.setZoomFactor(clamped);
      notifyZoomChanged(contents, clamped);
    });

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
      if (key === "j" && !input.shift) {
        event.preventDefault();
        contents.hostWebContents?.send("slop:shortcut", "j");
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
}

module.exports = {
  clampZoomFactor,
  hostWebviewIds,
  registerWebviewGuestHandlers,
};
