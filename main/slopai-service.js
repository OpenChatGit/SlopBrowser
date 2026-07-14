const fetch = require("cross-fetch");

let openRouterCtor = null;

async function getOpenRouterCtor() {
  if (!openRouterCtor) {
    ({ OpenRouter: openRouterCtor } = await import("@openrouter/sdk"));
  }
  return openRouterCtor;
}

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
  openrouter: "openai/gpt-4o-mini",
  ollama: "llama3.2",
  custom: "gpt-4o-mini",
};

function pickModel(provider, model) {
  const m = String(model || "").trim();
  return m || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
}

function openAICompatibleUrl(provider, baseUrl) {
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "ollama") {
    const root = (baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    return root.includes("/v1/") ? root : `${root}/v1/chat/completions`;
  }
  if (provider === "custom") {
    const root = String(baseUrl || "").replace(/\/+$/, "");
    if (!root) throw new Error("Base URL is required for custom provider");
    if (root.endsWith("/chat/completions")) return root;
    if (root.endsWith("/v1")) return `${root}/chat/completions`;
    return `${root}/v1/chat/completions`;
  }
  return null;
}

async function readError(res) {
  try {
    const data = await res.json();
    return (
      data?.error?.message ||
      data?.error?.type ||
      data?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      res.statusText ||
      "Request failed"
    );
  } catch (_) {
    try {
      const text = await res.text();
      if (text) return text.slice(0, 500);
    } catch (_) {}
    return res.statusText || "Request failed";
  }
}

async function consumeSSE(res, onJson) {
  if (!res.body?.getReader) {
    throw new Error("Streaming not supported for this response");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);

      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") {
        eventName = "";
        continue;
      }

      try {
        onJson(JSON.parse(data), eventName);
      } catch (_) {}
      eventName = "";
    }
  }
}

function parseOpenAIChunk(json) {
  const err = json?.error?.message || (typeof json?.error === "string" ? json.error : null);
  if (err) throw new Error(err);
  const delta = json?.choices?.[0]?.delta?.content;
  return typeof delta === "string" ? delta : "";
}

function parseAnthropicChunk(json) {
  if (json?.type === "error") {
    throw new Error(json?.error?.message || json?.message || "Anthropic stream error");
  }
  if (json?.type === "content_block_delta") {
    return json?.delta?.text || "";
  }
  return "";
}

function parseGoogleChunk(json) {
  const err = json?.error?.message;
  if (err) throw new Error(err);
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

async function streamOpenAICompatible({
  url,
  apiKey,
  model,
  messages,
  extraHeaders = {},
  maxTokens = 4096,
  onDelta,
}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...extraHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!res.ok) throw new Error(await readError(res));

  let full = "";
  await consumeSSE(res, (json) => {
    const delta = parseOpenAIChunk(json);
    if (!delta) return;
    full += delta;
    onDelta?.(delta);
  });

  if (!full.trim()) throw new Error("Empty response from model");
  return full.trim();
}

async function streamAnthropic({ apiKey, model, messages, onDelta }) {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const conv = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  if (!conv.length) throw new Error("No messages to send");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: systemParts.length ? systemParts.join("\n\n") : undefined,
      messages: conv,
    }),
  });

  if (!res.ok) throw new Error(await readError(res));

  let full = "";
  await consumeSSE(res, (json) => {
    const delta = parseAnthropicChunk(json);
    if (!delta) return;
    full += delta;
    onDelta?.(delta);
  });

  if (!full.trim()) throw new Error("Empty response from model");
  return full.trim();
}

async function streamGoogle({ apiKey, model, messages, onDelta }) {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  if (!contents.length) throw new Error("No messages to send");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const body = { contents };
  if (systemParts.length) {
    body.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(await readError(res));

  let full = "";
  await consumeSSE(res, (json) => {
    const delta = parseGoogleChunk(json);
    if (!delta) return;
    full += delta;
    onDelta?.(delta);
  });

  if (!full.trim()) throw new Error("Empty response from model");
  return full.trim();
}

async function streamOpenRouter({ apiKey, model, messages, maxTokens = 1024, onDelta }) {
  const OpenRouter = await getOpenRouterCtor();
  const openRouter = new OpenRouter({
    apiKey,
    httpReferer: "https://github.com/Nicol/SlopBrowser",
    appTitle: "SlopBrowser",
  });

  const stream = await openRouter.chat.send({
    chatRequest: {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      maxTokens,
    },
  });

  let full = "";
  for await (const chunk of stream) {
    const content = chunk?.choices?.[0]?.delta?.content;
    if (typeof content === "string" && content) {
      full += content;
      onDelta?.(content);
    }
  }

  if (!full.trim()) throw new Error("Empty response from model");
  return full.trim();
}

async function streamChat({ provider, apiKey, baseUrl, model, messages, onDelta }) {
  const p = String(provider || "openai");
  const m = pickModel(p, model);
  const list = Array.isArray(messages) ? messages.filter((x) => x?.role && x?.content) : [];
  if (!list.length) throw new Error("No messages");

  if (p === "anthropic") {
    if (!apiKey?.trim()) throw new Error("API key required — set it in Settings → Agent");
    return streamAnthropic({ apiKey: apiKey.trim(), model: m, messages: list, onDelta });
  }

  if (p === "google") {
    if (!apiKey?.trim()) throw new Error("API key required — set it in Settings → Agent");
    return streamGoogle({ apiKey: apiKey.trim(), model: m, messages: list, onDelta });
  }

  if (p === "openrouter") {
    if (!apiKey?.trim()) throw new Error("API key required — set it in Settings → Agent");
    return streamOpenRouter({
      apiKey: apiKey.trim(),
      model: m,
      messages: list,
      maxTokens: 1024,
      onDelta,
    });
  }

  const url = openAICompatibleUrl(p, baseUrl);
  if (!url) throw new Error(`Unknown provider: ${p}`);

  if (p === "openai") {
    if (!apiKey?.trim()) throw new Error("API key required — set it in Settings → Agent");
  }

  return streamOpenAICompatible({
    url,
    apiKey: apiKey?.trim() || undefined,
    model: m,
    messages: list,
    extraHeaders: {},
    maxTokens: 4096,
    onDelta,
  });
}

module.exports = { streamChat, DEFAULT_MODELS };
