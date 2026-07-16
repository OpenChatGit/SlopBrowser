/*
 * SlopBrowser — last open tabs (optional restore on launch).
 */
const fs = require("fs");
const path = require("path");

const MAX_TABS = 40;
const MAX_CHAT_MESSAGES = 80;
const MAX_CHAT_TEXT = 12000;

function normalizeChatMessages(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list.slice(-MAX_CHAT_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = String(m.text || "").slice(0, MAX_CHAT_TEXT);
    if (!text.trim()) continue;
    const entry = { role: m.role, text };
    const reasoning = String(m.reasoning || "").slice(0, MAX_CHAT_TEXT);
    if (reasoning.trim()) entry.reasoning = reasoning;
    const reasoningMs = Number(m.reasoningMs);
    if (Number.isFinite(reasoningMs) && reasoningMs >= 0) {
      entry.reasoningMs = Math.round(reasoningMs);
    }
    out.push(entry);
  }
  return out;
}

class SessionStore {
  constructor() {
    this.filePath = "";
    this.cache = { tabs: [], activeIndex: 0 };
  }

  init(userDataPath) {
    this.filePath = path.join(userDataPath, "session.json");
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.cache = this.normalize(raw);
    } catch (_) {
      this.cache = { tabs: [], activeIndex: 0 };
    }
    return this.get();
  }

  normalize(raw) {
    const tabs = Array.isArray(raw?.tabs)
      ? raw.tabs
          .filter((t) => t && typeof t.url === "string" && t.url.trim())
          .slice(0, MAX_TABS)
          .map((t) => ({
            url: String(t.url).trim(),
            title: String(t.title || "").trim(),
            favicon: typeof t.favicon === "string" ? t.favicon : "",
            chatMode: !!t.chatMode,
            chatTitle:
              typeof t.chatTitle === "string" && t.chatTitle.trim()
                ? t.chatTitle.trim()
                : null,
            chatMessages: normalizeChatMessages(t.chatMessages),
          }))
      : [];
    let activeIndex = Number(raw?.activeIndex) || 0;
    if (!tabs.length) activeIndex = 0;
    else activeIndex = Math.max(0, Math.min(activeIndex, tabs.length - 1));
    return { tabs, activeIndex };
  }

  get() {
    return {
      tabs: this.cache.tabs.map((t) => ({
        ...t,
        chatMessages: (t.chatMessages || []).map((m) => ({ ...m })),
      })),
      activeIndex: this.cache.activeIndex,
    };
  }

  set(state) {
    this.cache = this.normalize(state);
    this.save();
    return this.get();
  }

  clear() {
    this.cache = { tabs: [], activeIndex: 0 };
    this.save();
    return this.get();
  }

  save() {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), "utf8");
    } catch (_) {}
  }
}

module.exports = { SessionStore };
