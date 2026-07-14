const fetch = require("cross-fetch");

let openRouterCtor = null;

async function getOpenRouterCtor() {
  if (!openRouterCtor) {
    ({ OpenRouter: openRouterCtor } = await import("@openrouter/sdk"));
  }
  return openRouterCtor;
}

function normalizeModel(id, name) {
  const modelId = String(id || "").trim();
  if (!modelId) return null;
  const label = String(name || modelId).trim() || modelId;
  return { id: modelId, name: label };
}

function uniqueModels(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function readError(res) {
  try {
    const data = await res.json();
    return (
      data?.error?.message ||
      data?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      res.statusText ||
      "Request failed"
    );
  } catch (_) {
    return res.statusText || "Request failed";
  }
}

function isOpenAIChatModel(id) {
  const s = String(id || "").toLowerCase();
  if (!s) return false;
  if (
    s.includes("embedding") ||
    s.includes("whisper") ||
    s.includes("tts") ||
    s.includes("dall-e") ||
    s.includes("davinci") ||
    s.includes("babbage") ||
    s.includes("curie") ||
    s.includes("ada")
  ) {
    return false;
  }
  return /^(gpt-|o\d|chatgpt)/.test(s) || s.startsWith("ft:");
}

function modelsUrlFromBase(baseUrl) {
  const root = String(baseUrl || "").replace(/\/+$/, "");
  if (!root) return "";
  if (root.endsWith("/models")) return root;
  if (root.endsWith("/v1")) return `${root}/models`;
  if (root.includes("/v1/")) return root.replace(/\/v1\/.*$/, "/v1/models");
  return `${root}/v1/models`;
}

async function listOpenAICompatibleModels(url, apiKey) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(await readError(res));

  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  return uniqueModels(
    items
      .map((m) => normalizeModel(m.id, m.name || m.id))
      .filter(Boolean)
      .filter((m) => isOpenAIChatModel(m.id))
  );
}

async function listOpenAIModels(apiKey) {
  if (!apiKey?.trim()) throw new Error("API key required");
  return listOpenAICompatibleModels("https://api.openai.com/v1/models", apiKey.trim());
}

async function listAnthropicModels(apiKey) {
  if (!apiKey?.trim()) throw new Error("API key required");

  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(await readError(res));

  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  return uniqueModels(
    items.map((m) => normalizeModel(m.id, m.display_name || m.name || m.id)).filter(Boolean)
  );
}

async function listGoogleModels(apiKey) {
  if (!apiKey?.trim()) throw new Error("API key required");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
  );
  if (!res.ok) throw new Error(await readError(res));

  const data = await res.json();
  const items = Array.isArray(data?.models) ? data.models : [];
  return uniqueModels(
    items
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => {
        const id = String(m.name || "").replace(/^models\//, "");
        return normalizeModel(id, m.displayName || id);
      })
      .filter(Boolean)
  );
}

async function listOpenRouterModels(apiKey) {
  if (!apiKey?.trim()) throw new Error("API key required");

  try {
    const OpenRouter = await getOpenRouterCtor();
    const client = new OpenRouter({ apiKey: apiKey.trim() });
    const result = await client.models.list();
    const items = result?.data?.data ?? result?.data ?? [];
    if (Array.isArray(items) && items.length) {
      return uniqueModels(
        items.map((m) => normalizeModel(m.id || m.slug, m.name || m.id || m.slug)).filter(Boolean)
      );
    }
  } catch (_) {}

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
  });
  if (!res.ok) throw new Error(await readError(res));

  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  return uniqueModels(
    items.map((m) => normalizeModel(m.id, m.name || m.id)).filter(Boolean)
  );
}

async function listOllamaModels(baseUrl) {
  const root = (baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");

  try {
    const res = await fetch(`${root}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data?.models) ? data.models : [];
      if (items.length) {
        return uniqueModels(
          items.map((m) => normalizeModel(m.name, m.name)).filter(Boolean)
        );
      }
    }
  } catch (_) {}

  return listOpenAICompatibleModels(`${root}/v1/models`);
}

async function listCustomModels(baseUrl, apiKey) {
  const url = modelsUrlFromBase(baseUrl);
  if (!url) throw new Error("Base URL is required for custom provider");
  return listOpenAICompatibleModels(url, apiKey?.trim() || undefined);
}

async function listAgentModels({ provider, apiKey, baseUrl } = {}) {
  const p = String(provider || "openai");

  if (p === "openai") return listOpenAIModels(apiKey);
  if (p === "anthropic") return listAnthropicModels(apiKey);
  if (p === "google") return listGoogleModels(apiKey);
  if (p === "openrouter") return listOpenRouterModels(apiKey);
  if (p === "ollama") return listOllamaModels(baseUrl);
  if (p === "custom") return listCustomModels(baseUrl, apiKey);

  throw new Error(`Unknown provider: ${p}`);
}

module.exports = { listAgentModels };
