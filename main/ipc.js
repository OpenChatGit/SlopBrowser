const { ipcMain, BrowserWindow, webContents } = require("electron");
const fs = require("fs");
const path = require("path");
const { getBuildInfo } = require("../build-info");
const { notifyHistoryChanged } = require("./notifications");
const { sesFromPartition } = require("./session-config");
const {
  managerForSender: tabManagerForSender,
  isTabGuestWebContents,
} = require("./tab-manager");
const { managerForSender: sidePanelManagerForSender } = require("./side-panel-manager");

function cookieRemoveUrl(cookie) {
  const proto = cookie.secure ? "https:" : "http:";
  const host = (cookie.domain || "").replace(/^\./, "");
  return `${proto}//${host}${cookie.path || "/"}`;
}

function registerIpc(deps) {
  const {
    app,
    adblockService,
    historyStore,
    bookmarkStore,
    downloadManager,
    agentSettingsStore,
    sessionStore,
    createWindow,
    getCachedBuildInfo,
    setCachedBuildInfo,
  } = deps;

  const { streamChat } = require("./slopai-service");
  const { listAgentModels } = require("./agent-models-service");

  ipcMain.on("app:getBuildInfo", (event) => {
    let info = getCachedBuildInfo();
    if (!info) {
      try {
        info = getBuildInfo(app);
        setCachedBuildInfo(info);
      } catch (_) {
        info = {
          version: require("../package.json").version,
          buildId: "unknown",
        };
      }
    }
    event.returnValue = info;
  });

  let youtubePatchCache = null;
  ipcMain.on("blocker:getYoutubePatchSync", (event) => {
    if (youtubePatchCache === null) {
      try {
        youtubePatchCache = fs.readFileSync(
          path.join(__dirname, "..", "blocker", "youtube-video-patch.js"),
          "utf8"
        );
      } catch (_) {
        youtubePatchCache = "";
      }
    }
    event.returnValue = youtubePatchCache;
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

  ipcMain.on("window:new", (_e, opts) => {
    createWindow(opts || {});
  });

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

  ipcMain.handle("cookies:clearPartition", async (_e, partition) => {
    if (!partition) return false;
    const ses = sesFromPartition(partition);
    await ses.clearStorageData();
    await ses.clearCache();
    return true;
  });

  ipcMain.handle("webview:setPointerPassthrough", (e, ignore) => {
    const passthrough = !!ignore;
    tabManagerForSender(e.sender)?.setPointerPassthrough(passthrough);
    sidePanelManagerForSender(e.sender)?.setPointerPassthrough(passthrough);
    return true;
  });

  /** Hide tab/side WebContentsViews for rare full-window chrome overlays. */
  ipcMain.handle("content:setViewsVisible", (e, visible) => {
    tabManagerForSender(e.sender)?.setContentViewsVisible(!!visible);
    sidePanelManagerForSender(e.sender)?.setContentViewsVisible(!!visible);
    return true;
  });

  ipcMain.handle("adblock:getState", () => adblockService.getState());
  ipcMain.handle("adblock:setEnabled", (_e, enabled) =>
    adblockService.setEnabled(enabled)
  );
  ipcMain.handle("adblock:isEnabled", () => adblockService.isEnabled());
  ipcMain.handle("adblock:getCosmetics", (_e, url) =>
    adblockService.getCosmetics(url)
  );
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

  downloadManager.registerIpc(ipcMain);

  ipcMain.handle("agentSettings:get", () => agentSettingsStore.get());
  ipcMain.handle("agentSettings:set", (_e, data) => agentSettingsStore.set(data));

  ipcMain.handle("session:get", () => sessionStore.get());
  ipcMain.handle("session:set", (_e, state) => sessionStore.set(state));
  ipcMain.handle("session:clear", () => sessionStore.clear());

  ipcMain.handle("agentSettings:listModels", async (_e, overrides = {}) => {
    const settings = { ...agentSettingsStore.get(), ...(overrides && typeof overrides === "object" ? overrides : {}) };
    try {
      const models = await listAgentModels(settings);
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err?.message || String(err), models: [] };
    }
  });

  ipcMain.handle("slopai:stream", async (event, { requestId, messages } = {}) => {
    const settings = agentSettingsStore.get();
    const id = requestId || `${Date.now()}`;
    const wc = event.sender;
    const emit = (payload) => {
      if (!wc.isDestroyed()) wc.send("slopai:stream", { requestId: id, ...payload });
    };

    try {
      const result = await streamChat({
        ...settings,
        messages,
        onDelta: (piece) => {
          if (typeof piece === "string") {
            if (!piece) return;
            emit({ type: "chunk", kind: "content", delta: piece });
            return;
          }
          const kind = piece?.kind === "reasoning" ? "reasoning" : "content";
          const delta = piece?.text || "";
          if (!delta) return;
          emit({ type: "chunk", kind, delta });
        },
      });
      const text = typeof result === "string" ? result : result?.text || "";
      const reasoning =
        typeof result === "string" ? "" : result?.reasoning || "";
      emit({ type: "done", text, reasoning });
      return { ok: true, requestId: id };
    } catch (err) {
      const error = err?.message || String(err);
      emit({ type: "error", error });
      return { ok: false, error, requestId: id };
    }
  });

  const { ZOOM_STEP, clampZoomFactor } = require("./constants");
  const { notifyZoomChanged } = require("./notifications");

  ipcMain.on("webview:zoomWheel", (e, payload) => {
    const contents = e.sender;
    if (!contents || contents.isDestroyed?.()) return;
    if (!isTabGuestWebContents(contents.id)) return;

    const deltaY = payload?.deltaY ?? 0;
    if (!deltaY) return;

    const dir = deltaY < 0 ? 1 : -1;
    const next = clampZoomFactor(contents.getZoomFactor() + dir * ZOOM_STEP);
    if (next === contents.getZoomFactor()) return;

    contents.setZoomFactor(next);
    notifyZoomChanged(contents, next);
  });
}

module.exports = { registerIpc };
