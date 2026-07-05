/*
 * SlopBrowser — webview preload: cosmetic ad blocking (CSS, scriptlets, procedural).
 * Network blocking stays in main via adblock-service; this handles in-page hiding.
 */
const { ipcRenderer, contextBridge } = require("electron");
const fs = require("fs");
const path = require("path");

const pkg = require("./package.json");
const repoRaw =
  typeof pkg.repository === "string"
    ? pkg.repository
    : pkg.repository?.url || "https://github.com/Nicol/SlopBrowser";
const githubURL = repoRaw
  .replace(/^git\+/, "")
  .replace(/^github:/, "https://github.com/")
  .replace(/\.git$/, "");

function resolveBuildInfo() {
  try {
    const { readPublicBuildInfo } = require("./build-info");
    const fromFile = readPublicBuildInfo();
    if (fromFile) return fromFile;
  } catch (_) {}

  try {
    const fromIpc = ipcRenderer.sendSync("app:getBuildInfo");
    if (fromIpc?.buildId) return fromIpc;
  } catch (_) {}

  return { version: pkg.version, buildId: "" };
}

try {
  const buildInfo = resolveBuildInfo();
  let historyChangedCb = null;
  let downloadChangedCb = null;
  ipcRenderer.on("slop:historyChanged", () => historyChangedCb?.());
  ipcRenderer.on("slop:downloadChanged", () => downloadChangedCb?.());

  contextBridge.exposeInMainWorld("slopApp", {
    version: buildInfo.version || pkg.version,
    buildId: buildInfo.buildId || "",
    githubURL,
    onHistoryChanged: (cb) => {
      historyChangedCb = cb;
    },
    onDownloadChanged: (cb) => {
      downloadChangedCb = cb;
    },
    history: {
      getAll: () => ipcRenderer.invoke("history:getAll"),
      remove: (url) => ipcRenderer.invoke("history:remove", url),
      removeEntry: (url, visitedAt) =>
        ipcRenderer.invoke("history:removeEntry", url, visitedAt),
      removeEntries: (entries) =>
        ipcRenderer.invoke("history:removeEntries", entries),
      clear: () => ipcRenderer.invoke("history:clear"),
    },
    downloads: {
      getAll: () => ipcRenderer.invoke("downloads:getAll"),
      open: (id) => ipcRenderer.invoke("downloads:open", id),
      showInFolder: (id) => ipcRenderer.invoke("downloads:showInFolder", id),
      cancel: (id) => ipcRenderer.invoke("downloads:cancel", id),
      remove: (id) => ipcRenderer.invoke("downloads:remove", id),
      removeMany: (ids) => ipcRenderer.invoke("downloads:removeMany", ids),
      clear: () => ipcRenderer.invoke("downloads:clear"),
    },
  });

  // Fallback for file:// pages when direct IPC from the guest is unavailable.
  contextBridge.exposeInMainWorld("slopHistoryBridge", {
    send(op, data) {
      ipcRenderer.sendToHost("slop:history", { op, data: data ?? null });
    },
  });

  contextBridge.exposeInMainWorld("slopDownloadsBridge", {
    send(op, data) {
      ipcRenderer.sendToHost("slop:downloads", { op, data: data ?? null });
    },
  });
} catch (_) {}

const STYLE_ID = "slop-cosmetic-css";
const DARK_BASE_ID = "slop-dark-base";
const HREF_POLL_MS = 800;
const MUTATION_THROTTLE_MS = 250;

let ytPatchCode = "";
try {
  ytPatchCode = fs.readFileSync(
    path.join(__dirname, "blocker", "youtube-video-patch.js"),
    "utf8"
  );
} catch (_) {}

function isYouTubeHost(href) {
  try {
    const host = new URL(href).hostname;
    return (
      /(^|\.)youtube\.com$/i.test(host) ||
      host === "youtube-nocookie.com" ||
      host === "youtubekids.com"
    );
  } catch (_) {
    return false;
  }
}

function injectPageScript(code) {
  if (!code) return;
  const doc = document;
  const run = () => {
    const root = doc.documentElement;
    const parent = root || doc.head || doc.body;
    if (!parent) return false;
    const s = doc.createElement("script");
    s.textContent = code;
    const first = root?.firstChild;
    if (first) parent.insertBefore(s, first);
    else parent.appendChild(s);
    s.remove();
    return true;
  };
  if (run()) return;
  // Poll until <html> exists — inject while still "loading", before page scripts.
  const poll = setInterval(() => {
    if (run()) clearInterval(poll);
  }, 0);
  setTimeout(() => clearInterval(poll), 15000);
}

function originOf(href) {
  try {
    return new URL(href).origin;
  } catch (_) {
    return "";
  }
}

function isFullNavigation(prev, next) {
  if (!next || next === "about:blank" || !/^https?:/i.test(next)) return false;
  if (!prev || prev === "about:blank") return true;
  return originOf(prev) !== originOf(next);
}

function isInternalPage(href = location.href) {
  return (
    !href ||
    href === "about:blank" ||
    href.startsWith("file:") ||
    href.startsWith("chrome:")
  );
}

function applyDarkBase() {
  try {
    const href = location.href;
    if (!isInternalPage(href)) {
      document.getElementById(DARK_BASE_ID)?.remove();
      document.documentElement?.style.removeProperty("background-color");
      return;
    }
    const root = document.documentElement;
    if (root) root.style.backgroundColor = "#0e0f13";
    let el = document.getElementById(DARK_BASE_ID);
    if (!el && root) {
      el = document.createElement("style");
      el.id = DARK_BASE_ID;
      el.textContent =
        "html,body{background:#0e0f13!important;color-scheme:dark}";
      root.appendChild(el);
    }
  } catch (_) {}
}

function injectHideSelectorsEarly(selectors) {
  if (!selectors?.length) return;
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.documentElement || document.head)?.appendChild(el);
  }
  const rules = selectors.map((sel) => `${sel}{display:none!important;}`);
  el.textContent = rules.join("\n");
  for (const sel of selectors) hiddenSelectors.add(sel);
}

function bootstrapEarlyBlockers(force = false) {
  applyDarkBase();

  const href = location.href;
  if (!href || href === "about:blank" || !/^https?:/i.test(href)) return false;

  if (!force && bootstrapRes && bootstrapHref === href) return true;

  let enabled = true;
  try {
    enabled = ipcRenderer.sendSync("adblock:isEnabledSync");
  } catch (_) {}

  if (enabled) {
    let res;
    try {
      res = ipcRenderer.sendSync("adblock:getCosmeticsSync", href);
    } catch (_) {
      res = null;
    }

    if (res?.injected_script) {
      const wrapped = `(function(){if(window.__slopCosmeticsBoot)return;window.__slopCosmeticsBoot=true;\n${res.injected_script}\n})();`;
      injectPageScript(wrapped);
      lastScriptletKey = "len:" + res.injected_script.length;
    }
    if (res?.hide_selectors?.length) {
      injectHideSelectorsEarly(res.hide_selectors);
    }
    if (res) {
      active = true;
      generichide = !!res.generichide;
      exceptions = res.exceptions || [];
      setProceduralRules(res.procedural_actions);
      bootstrapRes = res;
      bootstrapHref = href;
    }
  }

  injectYouTubeVideoPatch(href);
  return true;
}

function injectYouTubeVideoPatch(href) {
  if (!ytPatchCode || !isYouTubeHost(href)) return;
  injectPageScript(ytPatchCode);
}

let active = false;
let generichide = false;
let exceptions = [];
let proceduralRules = [];
let bootstrapRes = null;
let bootstrapHref = "";
let lastScriptletKey = "";
let lastHref = "";
let mutationTimer = null;
let hrefTimer = null;
let observer = null;

const hiddenSelectors = new Set();
const pendingClasses = new Set();
const pendingIds = new Set();

let fastBootTimer = null;

function scheduleFastBootstrap() {
  if (fastBootTimer) return;
  fastBootTimer = setInterval(() => {
    const href = location.href;
    if (!/^https?:/i.test(href)) return;
    clearInterval(fastBootTimer);
    fastBootTimer = null;
    if (bootstrapEarlyBlockers(true)) {
      lastHref = href;
      applyCosmetics();
    }
  }, 16);
  setTimeout(() => {
    if (fastBootTimer) {
      clearInterval(fastBootTimer);
      fastBootTimer = null;
    }
  }, 30000);
}

function nodeText(el) {
  return (el.innerText || el.textContent || "").trim();
}

function matchesAttrRule(el, rule) {
  if (!rule || !el.getAttribute) return false;
  const eq = rule.indexOf("=");
  if (eq === -1) return el.hasAttribute(rule);
  const name = rule.slice(0, eq);
  const val = rule.slice(eq + 1);
  const attr = el.getAttribute(name);
  if (attr == null) return false;
  if (val.length > 2 && val.startsWith("/") && val.endsWith("/")) {
    try {
      return new RegExp(val.slice(1, -1)).test(attr);
    } catch (_) {
      return false;
    }
  }
  return attr === val;
}

function expandOperator(nodes, op) {
  if (!op || !nodes.length) return nodes;
  switch (op.type) {
    case "has-text":
      return nodes.filter((n) => nodeText(n).includes(op.arg));
    case "min-text-length": {
      const min = parseInt(op.arg, 10) || 0;
      return nodes.filter((n) => nodeText(n).length >= min);
    }
    case "matches-attr":
      return nodes.filter((n) => matchesAttrRule(n, op.arg));
    case "matches-css":
      return nodes.filter((n) => {
        try {
          return n.matches(op.arg);
        } catch (_) {
          return false;
        }
      });
    case "upward": {
      const steps = parseInt(op.arg, 10) || 1;
      const out = new Set();
      for (const el of nodes) {
        let p = el;
        for (let i = 0; i < steps && p; i++) p = p.parentElement;
        if (p) out.add(p);
      }
      return [...out];
    }
    case "xpath": {
      try {
        const snap = document.evaluate(
          op.arg,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        const out = [];
        for (let i = 0; i < snap.snapshotLength; i++) {
          const n = snap.snapshotItem(i);
          if (n && n.nodeType === 1) out.push(n);
        }
        return out;
      } catch (_) {
        return [];
      }
    }
    default:
      return nodes;
  }
}

function resolveProceduralTargets(filter) {
  const parts = filter.selector || [];
  if (!parts.length || parts[0].type !== "css-selector") return [];
  let nodes;
  try {
    nodes = Array.from(document.querySelectorAll(parts[0].arg));
  } catch (_) {
    return [];
  }
  for (let i = 1; i < parts.length; i++) {
    nodes = expandOperator(nodes, parts[i]);
    if (!nodes.length) break;
  }
  return nodes;
}

function applyProceduralAction(nodes, action) {
  if (!nodes.length) return;
  if (!action) {
    for (const n of nodes) {
      try {
        n.style.setProperty("display", "none", "important");
      } catch (_) {}
    }
    return;
  }
  switch (action.type) {
    case "remove":
      for (const n of nodes) {
        try {
          n.remove();
        } catch (_) {}
      }
      break;
    case "style":
      for (const n of nodes) {
        try {
          n.style.cssText += ";" + action.arg;
        } catch (_) {}
      }
      break;
    case "remove-attr":
      for (const n of nodes) {
        try {
          n.removeAttribute(action.arg);
        } catch (_) {}
      }
      break;
    case "remove-class":
      for (const n of nodes) {
        try {
          n.classList.remove(action.arg);
        } catch (_) {}
      }
      break;
    default:
      break;
  }
}

/* Parse once — runProceduralFilters fires on every mutation flush. */
function setProceduralRules(list) {
  proceduralRules = [];
  for (const json of list || []) {
    try {
      proceduralRules.push(JSON.parse(json));
    } catch (_) {}
  }
}

function runProceduralFilters() {
  for (const filter of proceduralRules) {
    const nodes = resolveProceduralTargets(filter);
    applyProceduralAction(nodes, filter.action);
  }
}

function ensureStyleEl() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    el.setAttribute("type", "text/css");
    (document.head || document.documentElement).appendChild(el);
  }
  return el;
}

function syncStylesheet() {
  const el = ensureStyleEl();
  if (!hiddenSelectors.size) {
    el.textContent = "";
    return;
  }
  const rules = [];
  for (const sel of hiddenSelectors) {
    rules.push(`${sel}{display:none!important;}`);
  }
  el.textContent = rules.join("\n");
}

function addHideSelectors(selectors) {
  if (!selectors?.length) return;
  let changed = false;
  for (const sel of selectors) {
    if (!sel || hiddenSelectors.has(sel)) continue;
    hiddenSelectors.add(sel);
    changed = true;
  }
  if (changed) syncStylesheet();
}

function injectScriptlet(code) {
  if (!code) return;
  injectPageScript(code);
}

function collectClassId(node, classes, ids) {
  if (node.nodeType !== 1) return;
  const el = node;
  if (el.id) ids.add(el.id);
  if (el.classList?.length) {
    for (const c of el.classList) classes.add(c);
  }
  if (el.children) {
    for (const child of el.children) collectClassId(child, classes, ids);
  }
}

function scheduleMutationWork() {
  if (mutationTimer) return;
  mutationTimer = setTimeout(() => {
    mutationTimer = null;
    flushMutationWork();
  }, MUTATION_THROTTLE_MS);
}

async function flushMutationWork() {
  if (!active) return;
  runProceduralFilters();

  if (generichide) return;

  const classes = [...pendingClasses];
  const ids = [...pendingIds];
  pendingClasses.clear();
  pendingIds.clear();
  if (!classes.length && !ids.length) return;

  try {
    const matched = await ipcRenderer.invoke("adblock:matchHiddenSelectors", {
      classes,
      ids,
      exceptions,
    });
    addHideSelectors(matched);
  } catch (_) {}
}

function onMutations(records) {
  if (!active) return;
  for (const rec of records) {
    for (const node of rec.addedNodes) {
      collectClassId(node, pendingClasses, pendingIds);
    }
  }
  scheduleMutationWork();
}

function startObserver() {
  if (observer) return;
  const root = document.documentElement || document.body;
  if (!root) return;
  observer = new MutationObserver(onMutations);
  observer.observe(root, { childList: true, subtree: true });
}

function clearCosmetics() {
  active = false;
  generichide = false;
  exceptions = [];
  proceduralRules = [];
  lastScriptletKey = "";
  hiddenSelectors.clear();
  pendingClasses.clear();
  pendingIds.clear();
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

async function applyCosmetics() {
  const href = location.href;
  if (!href || href === "about:blank") return;
  if (href.startsWith("file:") || href.startsWith("chrome:")) return;

  let res = null;
  if (bootstrapRes && bootstrapHref === href) {
    res = bootstrapRes;
    bootstrapRes = null;
  }

  if (!res) {
    let enabled = false;
    try {
      enabled = await ipcRenderer.invoke("adblock:isEnabled");
    } catch (_) {
      return;
    }

    if (!enabled) {
      clearCosmetics();
      return;
    }

    try {
      res = await ipcRenderer.invoke("adblock:getCosmetics", href);
    } catch (_) {
      return;
    }
  }

  active = true;
  generichide = !!res.generichide;
  exceptions = res.exceptions || [];
  setProceduralRules(res.procedural_actions);

  addHideSelectors(res.hide_selectors);

  /* Key by content, not href: scriptlets live per document context, so an
   * SPA route change with identical scriptlets must not re-run them (double
   * JSON.parse wraps, stacked handlers, …). */
  const scriptKey = "len:" + (res.injected_script?.length || 0);
  if (res.injected_script && scriptKey !== lastScriptletKey) {
    lastScriptletKey = scriptKey;
    injectScriptlet(res.injected_script);
  }

  runProceduralFilters();

  if (!generichide) {
    const classes = new Set();
    const ids = new Set();
    collectClassId(document.documentElement || document.body, classes, ids);
    pendingClasses.clear();
    pendingIds.clear();
    for (const c of classes) pendingClasses.add(c);
    for (const id of ids) pendingIds.add(id);
    await flushMutationWork();
  }

  startObserver();
}

/*
 * Webview preloads persist across navigations — bootstrap must rerun on every
 * full navigation (about:blank → site, or origin change). SPA route changes
 * within the same origin only refresh cosmetics; scriptlets stay in the page.
 */
function onNavigation() {
  const href = location.href;
  if (href === lastHref) return;
  const prev = lastHref;
  lastHref = href;
  hiddenSelectors.clear();
  syncStylesheet();
  applyDarkBase();

  if (isFullNavigation(prev, href)) {
    bootstrapRes = null;
    bootstrapHref = "";
    lastScriptletKey = "";
    bootstrapEarlyBlockers(true);
  } else {
    applyCosmetics();
  }
}

function boot() {
  lastHref = location.href;
  if (/^https?:/i.test(lastHref)) {
    bootstrapEarlyBlockers(true);
    applyCosmetics();
  } else {
    scheduleFastBootstrap();
  }

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (!bootstrapRes && /^https?:/i.test(location.href)) {
        bootstrapEarlyBlockers(true);
        applyCosmetics();
      }
    },
    { once: true }
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      ipcRenderer.send("webview:zoomWheel", { deltaY: e.deltaY });
    },
    { passive: false, capture: true }
  );

  window.addEventListener("pageshow", () => onNavigation());
  window.addEventListener("popstate", () => onNavigation());

  if (!hrefTimer) {
    hrefTimer = setInterval(onNavigation, HREF_POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCosmetics, { once: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
