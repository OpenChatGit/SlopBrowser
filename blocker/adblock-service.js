/*
 * Network ad blocking via Brave adblock-rust — same default lists as Brave Shields.
 */
const fs = require("fs");
const path = require("path");
const fetch = require("cross-fetch");
const adblock = require("adblock-rs");
const {
  BRAVE_DEFAULT_URLS,
  BRAVE_YOUTUBE_URLS,
  REGIONAL_URLS,
  UBO_REDIRECT_RESOURCES_URL,
  UBO_WAR_API_URL,
  UBO_WAR_RAW_BASE,
  BRAVE_RESOURCES_URL,
  UBO_SCRIPTLETS_URL,
  PERMISSION_BRAVE,
  parseOptionsForListUrl,
} = require("./brave-filter-urls");

/** Bump when list set or engine build logic changes (invalidates cache). */
const ENGINE_VERSION = 7;

const EMPTY_COSMETICS = {
  hide_selectors: [],
  procedural_actions: [],
  exceptions: [],
  injected_script: "",
  generichide: false,
};

/* Keys are Electron's resourceType values (camelCase: xhr, webSocket, …),
 * values are adblock-rs request types. */
const RESOURCE_TYPE_MAP = {
  mainFrame: "main_frame",
  subFrame: "sub_frame",
  stylesheet: "stylesheet",
  script: "script",
  image: "image",
  font: "font",
  object: "object",
  xhr: "xmlhttprequest",
  ping: "ping",
  cspReport: "csp_report",
  media: "media",
  webSocket: "websocket",
  other: "other",
};

/** Filter lists older than this get refreshed in the background. */
const LIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function partitionFromSession(sess) {
  try {
    const sp = sess.getStoragePath?.() || "";
    const name = path.basename(sp);
    if (!name || name === "Session") return "default";
    if (name.startsWith("persist_")) return "persist:" + name.slice(8);
    return name;
  } catch (_) {
    return "default";
  }
}

function isIntegrationPartition(partition) {
  return /slopbrowser-side/i.test(partition);
}

function readSerializedEngine(filePath) {
  const buf = fs.readFileSync(filePath);
  // adblock-rs deserialize() expects an ArrayBuffer, not a Node Buffer.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function listCacheName(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[/?&=%]+/g, "_")
    .slice(0, 180);
}

function mimeForResourceType(type) {
  switch (type) {
    case "script":
      return "application/javascript";
    case "stylesheet":
      return "text/css";
    case "image":
      return "image/gif";
    case "media":
      return "audio/mpeg";
    default:
      return "text/plain";
  }
}

class AdblockService {
  constructor() {
    this.engine = null;
    this.ready = false;
    this.loading = false;
    this.enabled = true;
    this.totalBlocked = 0;
    /** WeakSet so destroyed sessions (private tabs) can be GC'd. */
    this.hookedSessions = new WeakSet();
    /** @type {Map<number, string>} webContents id -> insertCSS key */
    this.cosmeticCssKeys = new Map();
    this.earlyPreloadPath = path.join(__dirname, "preload-adblock-early.js");
    this.configPath = "";
    this.enginePath = "";
    this.locale = "en";
  }

  async init(userDataPath, opts = {}) {
    this.cacheDir = path.join(userDataPath, "adblock");
    this.configPath = path.join(this.cacheDir, "config.json");
    this.enginePath = path.join(this.cacheDir, "engine.bin");
    this.listsDir = path.join(this.cacheDir, "lists");
    this.uboDir = path.join(this.cacheDir, "ubo");
    this.locale = opts.locale || "en";
    fs.mkdirSync(this.listsDir, { recursive: true });
    fs.mkdirSync(this.uboDir, { recursive: true });
    this.enabled = this.loadConfig().enabled;
    this.loading = true;
    try {
      await this.loadEngine();
      this.ready = true;
    } catch (err) {
      console.error("Adblock engine failed to load:", err);
    } finally {
      this.loading = false;
    }
    if (this.ready) this.maybeScheduleListRefresh();
  }

  listPathFor(url) {
    return path.join(this.listsDir, listCacheName(url) + ".txt");
  }

  listIsStale(dest) {
    try {
      return Date.now() - fs.statSync(dest).mtimeMs > LIST_MAX_AGE_MS;
    } catch (_) {
      return true;
    }
  }

  /* Lists were previously downloaded once and never refreshed; rebuild the
   * engine in the background when any list is older than a week. */
  maybeScheduleListRefresh() {
    const stale = this.filterUrls().some((url) =>
      this.listIsStale(this.listPathFor(url))
    );
    if (!stale) return;
    setTimeout(() => {
      this.buildEngine().catch((err) =>
        console.warn("Adblock list refresh failed:", err.message)
      );
    }, 30_000);
  }

  loadConfig() {
    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      const cfg = JSON.parse(raw);
      return {
        enabled: cfg.enabled !== false,
        engineVersion: cfg.engineVersion || 0,
      };
    } catch (_) {
      return { enabled: true, engineVersion: 0 };
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(
          { enabled: this.enabled, engineVersion: ENGINE_VERSION },
          null,
          2
        )
      );
    } catch (_) {}
  }

  filterUrls() {
    const urls = [...BRAVE_DEFAULT_URLS, ...BRAVE_YOUTUBE_URLS];
    const lang = (this.locale || "en").split("-")[0].toLowerCase();
    if (REGIONAL_URLS[lang]) urls.push(REGIONAL_URLS[lang]);
    return urls;
  }

  isEnabled() {
    return this.enabled;
  }

  getCosmetics(url) {
    if (!this.enabled || !this.ready || !this.engine) return EMPTY_COSMETICS;
    if (!url || !/^https?:/i.test(url)) return EMPTY_COSMETICS;
    try {
      const res = this.engine.urlCosmeticResources(url);
      return {
        hide_selectors: [...(res.hide_selectors || [])],
        procedural_actions: [...(res.procedural_actions || [])],
        exceptions: [...(res.exceptions || [])],
        injected_script: res.injected_script || "",
        generichide: !!res.generichide,
      };
    } catch (_) {
      return EMPTY_COSMETICS;
    }
  }

  matchHiddenSelectors(classes, ids, exceptions) {
    if (!this.enabled || !this.ready || !this.engine) return [];
    try {
      const cls = Array.isArray(classes) ? classes : [];
      const idList = Array.isArray(ids) ? ids : [];
      const exc = Array.isArray(exceptions) ? exceptions : [];
      return [...this.engine.hiddenClassIdSelectors(cls, idList, exc)];
    } catch (_) {
      return [];
    }
  }

  clearCosmeticsForContents(webContentsId) {
    if (webContentsId != null) this.cosmeticCssKeys.delete(webContentsId);
  }

  async injectCosmetics(contents, url) {
    if (!contents || contents.isDestroyed?.()) return;
    if (!this.enabled || !this.ready || !url || !/^https?:/i.test(url)) return;

    const partition = partitionFromSession(contents.session);
    if (isIntegrationPartition(partition)) return;

    const wcId = contents.id;
    const prevKey = this.cosmeticCssKeys.get(wcId);
    if (prevKey) {
      try {
        await contents.removeInsertedCSS(prevKey);
      } catch (_) {}
      this.cosmeticCssKeys.delete(wcId);
    }

    const res = this.getCosmetics(url);

    if (res.hide_selectors?.length) {
      const css = res.hide_selectors
        .map((sel) => `${sel}{display:none!important;}`)
        .join("\n");
      try {
        const key = await contents.insertCSS(css);
        if (key) this.cosmeticCssKeys.set(wcId, key);
      } catch (_) {}
    }

    if (res.injected_script) {
      const wrapped = `(function(){if(window.__slopScriptletsMain)return;window.__slopScriptletsMain=true;\n${res.injected_script}\n})();`;
      try {
        await contents.executeJavaScript(wrapped, true);
      } catch (_) {}
    }
  }

  async ensureScriptlets() {
    const scriptletsPath = path.join(this.uboDir, "scriptlets.js");
    if (fs.existsSync(scriptletsPath)) return;
    console.log("Downloading uBlock scriptlets (legacy bundle for adblock-rs)...");
    const text = await this.downloadText(UBO_SCRIPTLETS_URL);
    fs.writeFileSync(scriptletsPath, text, "utf8");
  }

  async loadEngine() {
    const cfg = this.loadConfig();
    await this.ensureScriptlets();
    if (cfg.engineVersion === ENGINE_VERSION && fs.existsSync(this.enginePath)) {
      try {
        const filterSet = new adblock.FilterSet(false);
        this.engine = new adblock.Engine(filterSet, false);
        this.engine.deserialize(readSerializedEngine(this.enginePath));
        const resources = await this.loadResources();
        if (resources.length) this.engine.useResources(resources);
        console.log("Adblock engine loaded from cache.");
        return;
      } catch (err) {
        console.warn("Adblock cache invalid, rebuilding:", err.message);
      }
    }
    await this.buildEngine();
  }

  async downloadText(url) {
    const res = await fetch(url, {
      headers: { "User-Agent": "SlopBrowser/0.1" },
    });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    return res.text();
  }

  async downloadBinary(url) {
    const res = await fetch(url, {
      headers: { "User-Agent": "SlopBrowser/0.1" },
    });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async ensureFilterLists() {
    for (const url of this.filterUrls()) {
      const dest = this.listPathFor(url);
      const exists = fs.existsSync(dest);
      if (exists && !this.listIsStale(dest)) continue;
      console.log("Downloading filter list:", url);
      try {
        const text = await this.downloadText(url);
        fs.writeFileSync(dest, text, "utf8");
      } catch (err) {
        // Keep serving the stale copy if the refresh fails offline.
        if (!exists) throw err;
        console.warn("Filter list refresh failed:", url, err.message);
      }
    }
  }

  async ensureUboResources() {
    const warDir = path.join(this.uboDir, "web_accessible_resources");
    const redirectPath = path.join(this.uboDir, "redirect-resources.js");
    const scriptletsPath = path.join(this.uboDir, "scriptlets.js");
    fs.mkdirSync(warDir, { recursive: true });

    if (!fs.existsSync(redirectPath)) {
      console.log("Downloading uBlock redirect-resources.js");
      const text = await this.downloadText(UBO_REDIRECT_RESOURCES_URL);
      fs.writeFileSync(redirectPath, text, "utf8");
    }

    if (!fs.existsSync(scriptletsPath)) {
      console.log("Downloading uBlock scriptlets (legacy bundle for adblock-rs)...");
      const text = await this.downloadText(UBO_SCRIPTLETS_URL);
      fs.writeFileSync(scriptletsPath, text, "utf8");
    }

    const marker = path.join(warDir, ".complete");
    if (!fs.existsSync(marker)) {
      console.log("Downloading uBlock web_accessible_resources...");
      const res = await fetch(UBO_WAR_API_URL, {
        headers: { "User-Agent": "SlopBrowser/0.1" },
      });
      if (!res.ok) throw new Error(`uBO WAR list HTTP ${res.status}`);
      const entries = await res.json();
      for (const entry of entries) {
        if (entry.type !== "file") continue;
        const dest = path.join(warDir, entry.name);
        if (fs.existsSync(dest)) continue;
        const buf = await this.downloadBinary(UBO_WAR_RAW_BASE + entry.name);
        fs.writeFileSync(dest, buf);
      }
      fs.writeFileSync(marker, "", "utf8");
    }
  }

  async loadResources() {
    const resources = [];
    const warDir = path.join(this.uboDir, "web_accessible_resources");
    const redirectPath = path.join(this.uboDir, "redirect-resources.js");
    const scriptletsPath = path.join(this.uboDir, "scriptlets.js");
    if (fs.existsSync(redirectPath) && fs.existsSync(warDir)) {
      try {
        const ubo = adblock.uBlockResources(
          warDir,
          redirectPath,
          fs.existsSync(scriptletsPath) ? scriptletsPath : undefined
        );
        resources.push(...ubo);
      } catch (err) {
        console.warn("uBlock resources failed:", err.message);
      }
    }

    const braveResPath = path.join(this.uboDir, "brave-resources.json");
    if (!fs.existsSync(braveResPath)) {
      try {
        console.log("Downloading Brave adblock resources...");
        const text = await this.downloadText(BRAVE_RESOURCES_URL);
        fs.writeFileSync(braveResPath, text, "utf8");
      } catch (err) {
        console.warn("Brave resources download failed:", err.message);
      }
    }
    if (fs.existsSync(braveResPath)) {
      try {
        const brave = JSON.parse(fs.readFileSync(braveResPath, "utf8"));
        if (Array.isArray(brave)) resources.push(...brave);
      } catch (err) {
        console.warn("Brave resources parse failed:", err.message);
      }
    }

    return resources;
  }

  addLocalFilters(filterSet) {
    const videoFiltersPath = path.join(__dirname, "video-ad-filters.txt");
    if (!fs.existsSync(videoFiltersPath)) return;
    const text = fs.readFileSync(videoFiltersPath, "utf8");
    filterSet.addFilters(text.split(/\r?\n/), { permissions: PERMISSION_BRAVE });
  }

  async buildEngine() {
    console.log("Building adblock engine (Brave default lists)...");
    await this.ensureFilterLists();
    await this.ensureUboResources();

    const filterSet = new adblock.FilterSet(false);
    for (const url of this.filterUrls()) {
      const listPath = path.join(this.listsDir, listCacheName(url) + ".txt");
      const text = fs.readFileSync(listPath, "utf8");
      filterSet.addFilters(text.split(/\r?\n/), parseOptionsForListUrl(url));
    }
    this.addLocalFilters(filterSet);

    // Build into a local engine first: requests keep hitting the old engine
    // until the new one is fully configured (no half-initialized window).
    const engine = new adblock.Engine(filterSet, true);
    const resources = await this.loadResources();
    if (resources.length) {
      engine.useResources(resources);
      console.log(`Loaded ${resources.length} redirect/script resources.`);
    }
    this.engine = engine;

    fs.writeFileSync(this.enginePath, Buffer.from(engine.serialize()));
    this.saveConfig();
    console.log("Adblock engine built and cached.");
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.saveConfig();
    return this.enabled;
  }

  getState() {
    return {
      enabled: this.enabled,
      ready: this.ready,
      loading: this.loading,
      totalBlocked: this.totalBlocked,
      listCount: this.filterUrls().length,
    };
  }

  evaluateRequest(details) {
    if (!this.enabled || !this.ready || !this.engine) {
      return { action: "allow" };
    }

    // Never block top-level document loads (matches Brave/uBO behavior);
    // a bad $document match would white-screen the tab.
    if (details.resourceType === "mainFrame") {
      return { action: "allow" };
    }

    const type = RESOURCE_TYPE_MAP[details.resourceType] || "other";

    // Frame URL gives correct first-/third-party classification; referrer
    // is often stripped and Electron has no `initiator` on this event.
    let frameUrl = "";
    try {
      frameUrl = details.frame?.url || "";
    } catch (_) {}
    const sourceUrl = frameUrl || details.referrer || details.url;

    try {
      const result = this.engine.check(details.url, sourceUrl, type, true);
      if (result.exception) return { action: "allow" };
      if (!result.matched) return { action: "allow" };

      if (result.rewritten_url) {
        return { action: "redirect", redirectURL: result.rewritten_url };
      }

      if (result.redirect) {
        const redirectURL = result.redirect.startsWith("data:")
          ? result.redirect
          : `data:${mimeForResourceType(type)};base64,${result.redirect}`;
        return { action: "redirect", redirectURL };
      }

      return { action: "block" };
    } catch (_) {
      return { action: "allow" };
    }
  }

  notifyBlock(webContentsId) {
    this.totalBlocked++;
    try {
      const { webContents } = require("electron");
      const { getChromeForGuestWebContents } = require("../main/tab-manager");
      const guest = webContents.fromId(webContentsId);
      if (!guest || guest.isDestroyed()) return;
      const tabChrome = getChromeForGuestWebContents(webContentsId);
      const host = tabChrome || guest.hostWebContents;
      if (host && !host.isDestroyed()) {
        host.send("slop:adBlocked", {
          webContentsId,
          total: this.totalBlocked,
        });
      }
    } catch (_) {}
  }

  attachSession(sess) {
    if (!sess || this.hookedSessions.has(sess)) return;
    const partition = partitionFromSession(sess);
    if (isIntegrationPartition(partition)) return;

    this.hookedSessions.add(sess);

    try {
      if (
        typeof sess.registerPreloadScript === "function" &&
        fs.existsSync(this.earlyPreloadPath)
      ) {
        sess.registerPreloadScript({
          type: "frame",
          id: "slopbrowser-adblock-early",
          file: this.earlyPreloadPath,
        });
      }
    } catch (err) {
      console.warn("Early adblock preload unavailable:", err.message);
    }

    sess.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, cb) => {
      const verdict = this.evaluateRequest(details);
      if (verdict.action === "block") {
        this.notifyBlock(details.webContentsId);
        cb({ cancel: true });
      } else if (verdict.action === "redirect") {
        this.notifyBlock(details.webContentsId);
        cb({ redirectURL: verdict.redirectURL });
      } else {
        cb({});
      }
    });
  }

  ensureSession(sess) {
    if (sess) this.attachSession(sess);
  }
}

module.exports = { AdblockService, partitionFromSession, isIntegrationPartition };
