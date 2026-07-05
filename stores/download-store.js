/*
 * SlopBrowser — in-memory download history (current session + persisted list).
 */
const fs = require("fs");
const path = require("path");
const { faviconFromPageUrl } = require("../main/download-favicon");

const MAX_ENTRIES = 200;

class DownloadStore {
  constructor() {
    this.filePath = "";
    this.entries = [];
    this.activeItems = new Map();
  }

  init(userDataPath) {
    this.filePath = path.join(userDataPath, "downloads.json");
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.entries = Array.isArray(raw.entries) ? raw.entries : [];
      this.normalize();
    } catch (_) {
      this.entries = [];
    }
  }

  normalize() {
    this.entries = this.entries
      .filter((e) => e && e.id && e.filename)
      .map((e) => ({
        id: String(e.id),
        filename: String(e.filename),
        url: String(e.url || ""),
        savePath: String(e.savePath || ""),
        receivedBytes: Number(e.receivedBytes) || 0,
        totalBytes: Number(e.totalBytes) || 0,
        state: e.state || "completed",
        startedAt: Number(e.startedAt) || Date.now(),
        endedAt: Number(e.endedAt) || null,
        sourceUrl: String(e.sourceUrl || ""),
        favicon: String(e.favicon || faviconFromPageUrl(e.sourceUrl || e.url) || ""),
        webContentsId:
          e.webContentsId != null ? Number(e.webContentsId) || null : null,
      }))
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
  }

  snapshot(entry) {
    return {
      id: entry.id,
      filename: entry.filename,
      url: entry.url,
      savePath: entry.savePath,
      receivedBytes: entry.receivedBytes,
      totalBytes: entry.totalBytes,
      state: entry.state,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      sourceUrl: entry.sourceUrl || "",
      favicon: entry.favicon || "",
      webContentsId: entry.webContentsId ?? null,
    };
  }

  getAll() {
    return this.entries.map((e) => this.snapshot(e));
  }

  get(id) {
    const e = this.entries.find((x) => x.id === id);
    return e ? this.snapshot(e) : null;
  }

  upsert(entry) {
    const idx = this.entries.findIndex((e) => e.id === entry.id);
    if (idx === -1) this.entries.unshift(entry);
    else this.entries[idx] = { ...this.entries[idx], ...entry };
    this.entries.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
  }

  setActiveItem(id, item) {
    if (item) this.activeItems.set(id, item);
    else this.activeItems.delete(id);
  }

  getActiveItem(id) {
    return this.activeItems.get(id);
  }

  remove(id) {
    const sid = String(id || "");
    if (!sid) return false;
    const item = this.activeItems.get(sid);
    if (item) {
      try {
        item.cancel();
      } catch (_) {}
      this.activeItems.delete(sid);
    }
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== sid);
    if (this.entries.length !== before) {
      this.scheduleSave();
      return true;
    }
    return !!item;
  }

  removeMany(ids) {
    const set = new Set((ids || []).map((id) => String(id)).filter(Boolean));
    if (!set.size) return 0;
    for (const id of set) {
      const item = this.activeItems.get(id);
      if (item) {
        try {
          item.cancel();
        } catch (_) {}
        this.activeItems.delete(id);
      }
    }
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => !set.has(e.id));
    const removed = before - this.entries.length;
    if (removed > 0) this.save();
    return removed;
  }

  clear() {
    for (const item of this.activeItems.values()) {
      try {
        item.cancel();
      } catch (_) {}
    }
    this.activeItems.clear();
    this.entries = [];
    this.save();
  }

  persistCompleted(entry) {
    this.upsert(entry);
    this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.save(), 400);
  }

  save() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.filePath) return;
    const done = this.entries
      .filter((e) => e.state !== "progressing")
      .map((e) => ({
        id: e.id,
        filename: e.filename,
        url: e.url,
        savePath: e.savePath,
        receivedBytes: e.receivedBytes,
        totalBytes: e.totalBytes,
        state: e.state,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        sourceUrl: e.sourceUrl || "",
        favicon: e.favicon || faviconFromPageUrl(e.sourceUrl || e.url) || "",
      }));
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ version: 1, entries: done.slice(0, MAX_ENTRIES) })
      );
    } catch (err) {
      console.error("Downloads save failed:", err.message);
    }
  }
}

module.exports = { DownloadStore };
