const fs = require("fs");
const path = require("path");

const DEFAULT = {
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  model: "",
};

class AgentSettingsStore {
  constructor() {
    this.filePath = null;
    this.cache = { ...DEFAULT };
  }

  init(userDataPath) {
    this.filePath = path.join(userDataPath, "agent-settings.json");
    this.load();
  }

  load() {
    if (!this.filePath) return { ...DEFAULT };
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.cache = { ...DEFAULT, ...(raw && typeof raw === "object" ? raw : {}) };
    } catch (_) {
      this.cache = { ...DEFAULT };
    }
    return this.get();
  }

  get() {
    return { ...this.cache };
  }

  set(data) {
    this.cache = {
      ...DEFAULT,
      ...(data && typeof data === "object" ? data : {}),
      provider: String(data?.provider || DEFAULT.provider),
      apiKey: String(data?.apiKey ?? ""),
      baseUrl: String(data?.baseUrl ?? ""),
      model: String(data?.model ?? ""),
    };
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

module.exports = { AgentSettingsStore, DEFAULT_AGENT_SETTINGS: DEFAULT };
