/*
 * SlopBrowser — persistent bookmarks.
 */
const fs = require("fs");
const path = require("path");

const MAX_ENTRIES = 500;

class BookmarkStore {
  constructor() {
    this.filePath = "";
    this.entries = [];
    this.flushTimer = null;
  }

  init(userDataPath) {
    this.filePath = path.join(userDataPath, "bookmarks.json");
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
    const seen = new Set();
    this.entries = this.entries
      .filter((e) => e && typeof e.url === "string" && e.url)
      .map((e) => ({
        url: e.url,
        title: String(e.title || e.url),
        favicon: e.favicon || "",
        createdAt: Number(e.createdAt) || Date.now(),
      }))
      .filter((e) => {
        if (seen.has(e.url)) return false;
        seen.add(e.url);
        return true;
      });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
  }

  getAll() {
    return this.entries.slice();
  }

  has(url) {
    return this.entries.some((e) => e.url === url);
  }

  add(entry) {
    if (!entry?.url) return false;
    const item = {
      url: entry.url,
      title: String(entry.title || entry.url),
      favicon: entry.favicon || "",
      createdAt: Number(entry.createdAt) || Date.now(),
    };

    const idx = this.entries.findIndex((e) => e.url === item.url);
    if (idx !== -1) {
      this.entries[idx] = { ...this.entries[idx], ...item };
    } else {
      this.entries.unshift(item);
    }

    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
    this.scheduleSave();
    return true;
  }

  remove(url) {
    if (!url) return false;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.url !== url);
    if (this.entries.length !== before) this.scheduleSave();
    return this.entries.length !== before;
  }

  toggle(entry) {
    if (!entry?.url) return { bookmarked: false };
    if (this.has(entry.url)) {
      this.remove(entry.url);
      return { bookmarked: false };
    }
    this.add(entry);
    return { bookmarked: true };
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
      console.error("Bookmark save failed:", err.message);
    }
  }
}

module.exports = { BookmarkStore };
