/*
 * SlopBrowser — Agent / SlopAI connection settings.
 */
const fs = require("fs");
const path = require("path");

const OPENROUTER_AUTO_MODELS = {
  free: "openrouter/free",
  auto: "openrouter/auto",
};

const DEFAULT = {
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  model: "",
  /** "" | "free" | "auto" — OpenRouter auto routers only */
  openRouterAuto: "",
};

function normalizeOpenRouterAuto(value, model) {
  const v = String(value || "").trim();
  if (v === "free" || v === "auto") return v;
  const m = String(model || "").trim();
  if (m === OPENROUTER_AUTO_MODELS.free) return "free";
  if (m === OPENROUTER_AUTO_MODELS.auto) return "auto";
  return "";
}

function modelForOpenRouterAuto(auto) {
  if (auto === "free") return OPENROUTER_AUTO_MODELS.free;
  if (auto === "auto") return OPENROUTER_AUTO_MODELS.auto;
  return "";
}

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
      this.cache = this.normalize(raw);
    } catch (_) {
      this.cache = { ...DEFAULT };
    }
    return this.get();
  }

  normalize(data) {
    const provider = String(data?.provider || DEFAULT.provider);
    let model = String(data?.model ?? "");
    let openRouterAuto = normalizeOpenRouterAuto(data?.openRouterAuto, model);
    if (provider !== "openrouter") openRouterAuto = "";
    if (openRouterAuto) {
      model = modelForOpenRouterAuto(openRouterAuto) || model;
    }
    return {
      ...DEFAULT,
      ...(data && typeof data === "object" ? data : {}),
      provider,
      apiKey: String(data?.apiKey ?? ""),
      baseUrl: String(data?.baseUrl ?? ""),
      model,
      openRouterAuto,
    };
  }

  get() {
    return { ...this.cache };
  }

  set(data) {
    this.cache = this.normalize(data);
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

module.exports = {
  AgentSettingsStore,
  DEFAULT_AGENT_SETTINGS: DEFAULT,
  OPENROUTER_AUTO_MODELS,
};
