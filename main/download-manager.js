const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { shell } = require("electron");
const { notifyDownloadChanged, notifyDownloadStarted } = require("./notifications");
const { sourceUrlFromDownload, faviconFromPageUrl } = require("./download-favicon");

const hookedSessions = new WeakSet();

function uniqueSavePath(dir, filename) {
  const safe = path.basename(filename || "download") || "download";
  const target = path.join(dir, safe);
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(safe);
  const base = path.basename(safe, ext);
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

function newDownloadId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

const PROGRESS_BROADCAST_MS = 300;

function createDownloadManager(downloadStore, getDownloadsDir) {
  let lastBroadcast = 0;
  let trailingTimer = null;

  function broadcast() {
    clearTimeout(trailingTimer);
    trailingTimer = null;
    lastBroadcast = Date.now();
    notifyDownloadChanged();
  }

  // Progress ticks fire many times per second; coalesce them so the chrome
  // renderer (and its IPC round-trips) don't compete with page loads.
  function broadcastThrottled() {
    const elapsed = Date.now() - lastBroadcast;
    if (elapsed >= PROGRESS_BROADCAST_MS) {
      broadcast();
      return;
    }
    if (!trailingTimer) {
      trailingTimer = setTimeout(broadcast, PROGRESS_BROADCAST_MS - elapsed);
    }
  }

  function entryFromItem(id, item, savePath, state) {
    const prev = downloadStore.get(id) || {};
    return {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      state,
      startedAt: prev.startedAt || Date.now(),
      endedAt: state === "progressing" ? null : Date.now(),
      sourceUrl: prev.sourceUrl || "",
      favicon: prev.favicon || "",
      webContentsId: prev.webContentsId ?? null,
    };
  }

  function attachSessionDownloadHandler(sess) {
    if (!sess || hookedSessions.has(sess)) return;
    hookedSessions.add(sess);

    sess.on("will-download", (_event, item, webContents) => {
      const id = newDownloadId();
      const dir = getDownloadsDir();
      fs.mkdirSync(dir, { recursive: true });
      const savePath = uniqueSavePath(dir, item.getFilename());
      item.setSavePath(savePath);

      const sourceUrl = sourceUrlFromDownload(webContents, item);
      let webContentsId = null;
      try {
        if (webContents && !webContents.isDestroyed()) {
          webContentsId = webContents.id;
        }
      } catch (_) {}

      const entry = {
        id,
        filename: item.getFilename(),
        url: item.getURL(),
        savePath,
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        state: "progressing",
        startedAt: Date.now(),
        endedAt: null,
        sourceUrl,
        favicon: faviconFromPageUrl(sourceUrl || item.getURL()),
        webContentsId,
      };
      downloadStore.upsert(entry);
      downloadStore.setActiveItem(id, item);
      notifyDownloadStarted({ id, webContentsId, sourceUrl });
      broadcast();

      item.on("updated", (_e, state) => {
        const next = entryFromItem(id, item, savePath, state);
        downloadStore.upsert(next);
        broadcastThrottled();
      });

      item.once("done", (_e, state) => {
        downloadStore.setActiveItem(id, null);
        const next = entryFromItem(id, item, item.getSavePath(), state);
        next.webContentsId = null;
        downloadStore.upsert(next);
        downloadStore.persistCompleted(next);
        broadcast();
      });
    });
  }

  function registerIpc(ipcMain) {
    ipcMain.handle("downloads:getAll", () => downloadStore.getAll());

    ipcMain.handle("downloads:open", (_e, id) => {
      const entry = downloadStore.get(id);
      if (!entry?.savePath) return false;
      shell.openPath(entry.savePath).catch(() => {});
      return true;
    });

    ipcMain.handle("downloads:showInFolder", (_e, id) => {
      const entry = downloadStore.get(id);
      if (!entry?.savePath) return false;
      shell.showItemInFolder(entry.savePath);
      return true;
    });

    ipcMain.handle("downloads:cancel", (_e, id) => {
      const item = downloadStore.getActiveItem(id);
      if (!item) return false;
      item.cancel();
      return true;
    });

    // No broadcast here: the chrome renderer initiates this call and updates
    // its own UI; re-broadcasting created an IPC feedback loop per tick.
    ipcMain.handle("downloads:setFavicon", (_e, id, favicon) => {
      if (!id || !favicon) return false;
      const entry = downloadStore.get(id);
      if (!entry) return false;
      if (entry.favicon === favicon) return true;
      downloadStore.upsert({ ...entry, favicon: String(favicon) });
      if (entry.state !== "progressing") {
        downloadStore.persistCompleted({ ...entry, favicon: String(favicon) });
      }
      return true;
    });

    ipcMain.handle("downloads:remove", (_e, id) => {
      const ok = downloadStore.remove(id);
      if (ok) broadcast();
      return ok;
    });

    ipcMain.handle("downloads:removeMany", (_e, ids) => {
      const count = downloadStore.removeMany(ids);
      if (count > 0) broadcast();
      return count;
    });

    ipcMain.handle("downloads:clear", () => {
      downloadStore.clear();
      broadcast();
      return true;
    });
  }

  return { attachSessionDownloadHandler, registerIpc };
}

module.exports = { createDownloadManager };
