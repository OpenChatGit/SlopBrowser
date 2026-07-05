/*
 * SlopBrowser — persistent browse history (non-private sessions).
 */
const fs = require("fs");
const path = require("path");

const MAX_ENTRIES = 2000;
const MERGE_WINDOW_MS = 90_000;

class HistoryStore {
  constructor() {
    this.filePath = "";
    this.entries = [];
    this.flushTimer = null;
  }

  init(userDataPath) {
    this.filePath = path.join(userDataPath, "browse-history.json");
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
      .filter((e) => e && typeof e.url === "string" && e.url)
      .map((e) => ({
        url: e.url,
        title: String(e.title || e.url),
        favicon: e.favicon || "",
        visitedAt: Number(e.visitedAt) || Date.now(),
      }))
      .sort((a, b) => b.visitedAt - a.visitedAt);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
  }

  getAll() {
    return this.entries.slice();
  }

  add(entry) {
    if (!entry?.url) return;
    const item = {
      url: entry.url,
      title: String(entry.title || entry.url),
      favicon: entry.favicon || "",
      visitedAt: Number(entry.visitedAt) || Date.now(),
    };

    const top = this.entries[0];
    if (
      top &&
      top.url === item.url &&
      item.visitedAt - top.visitedAt < MERGE_WINDOW_MS
    ) {
      top.title = item.title;
      top.favicon = item.favicon;
      top.visitedAt = item.visitedAt;
    } else {
      this.entries.unshift(item);
    }

    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
    this.scheduleSave();
  }

  remove(url) {
    if (!url) return;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.url !== url);
    if (this.entries.length !== before) this.persistNow();
  }

  removeEntry(url, visitedAt) {
    if (!url) return;
    const at = Number(visitedAt);
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => {
      if (e.url !== url) return true;
      if (!Number.isFinite(at)) return false;
      return Number(e.visitedAt) !== at;
    });
    if (this.entries.length !== before) this.persistNow();
  }

  removeEntries(list) {
    if (!Array.isArray(list) || !list.length) return;
    const drop = new Set(
      list
        .filter((e) => e?.url)
        .map((e) => `${e.url}\0${Number(e.visitedAt)}`)
    );
    if (!drop.size) return;
    const before = this.entries.length;
    this.entries = this.entries.filter(
      (e) => !drop.has(`${e.url}\0${Number(e.visitedAt)}`)
    );
    if (this.entries.length !== before) this.persistNow();
  }

  clear() {
    if (!this.entries.length) return;
    this.entries = [];
    this.persistNow();
  }

  persistNow() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.save();
  }

  scheduleSave() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.save(), 400);
  }

  save() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ version: 1, entries: this.entries })
      );
    } catch (err) {
      console.error("History save failed:", err.message);
    }
  }
}

module.exports = { HistoryStore };
