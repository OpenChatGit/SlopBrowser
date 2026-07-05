/*
 * SlopBrowser - Renderer (browser chrome logic)
 */
"use strict";

const HOME = window.slopAPI.newTabURL;
const HISTORY = window.slopAPI.historyURL;
const PARTITION = window.slopAPI.partition;
// Friendly address shown instead of the internal file:// history page URL.
const HISTORY_DISPLAY = "slop://history";
const HOME_ADDRESS_PLACEHOLDER = "Search the web";
const DEFAULT_ADDRESS_PLACEHOLDER = "Search or enter address";

// Inline SlopBrowser logo (reused for the home tab icon).
const LOGO_SVG =
  '<svg class="logo-icon" viewBox="0 0 215 238" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M101.682 168.635C105.62 167.927 107.59 165.981 107.59 162.796C107.59 159.492 106.515 155.835 104.367 151.825C102.338 147.696 99.295 143.803 95.2373 140.146C84.6156 130.708 70.2345 125.99 52.0941 125.99C43.1432 125.99 34.7891 127.464 27.0316 130.413C18.7968 126.285 12.2329 119.737 7.33972 110.772C2.44657 101.806 0 92.1328 0 81.7517C0 54.6191 11.4571 33.6798 34.3714 18.9338C54.0633 6.31128 78.35 0 107.231 0C128.714 0 146.794 2.30037 161.474 6.90112C176.153 11.3839 188.147 17.1643 197.456 24.2424C200.201 32.0283 201.574 40.109 201.574 48.4848C201.574 56.8605 200.44 64.4694 198.172 71.3115C195.905 78.1537 192.623 83.6392 188.326 87.768C184.269 84.8188 176.929 81.8107 166.307 78.7435C155.686 75.6763 146.019 74.1428 137.306 74.1428C128.594 74.1428 122.746 74.6736 119.763 75.7353C116.898 76.797 115.466 78.4486 115.466 80.69C115.466 81.7517 115.645 82.7544 116.003 83.6981C120.18 82.6364 125.551 82.1056 132.115 82.1056C155.387 82.1056 174.363 87.5321 189.042 98.3851C206.347 111.362 215 130.826 215 156.779C215 179.665 205.631 198.658 186.894 213.758C166.606 229.919 139.335 238 105.083 238C86.2268 238 69.8765 236.584 56.0325 233.753C42.1885 231.04 28.7025 226.203 15.5745 219.243C6.62365 206.385 2.14821 193.349 2.14821 180.137C2.14821 166.806 6.74299 155.776 15.9326 147.047C25.1221 138.317 36.4002 133.952 49.7669 133.952C63.2528 133.952 74.2326 136.666 82.7061 142.092C91.2989 147.519 97.6242 156.366 101.682 168.635Z" fill="currentColor"/>' +
  "</svg>";

// Inline icons for tabs (avoids re-running lucide scans on every update).
const GLOBE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
const X_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function isHome(url) {
  if (!url) return true;
  try {
    const homePath = new URL(HOME).pathname;
    return new URL(url).pathname === homePath;
  } catch (_) {
    const base = HOME.split("?")[0];
    return url === HOME || url.startsWith(base);
  }
}
function isHistoryPage(url) {
  if (!url) return false;
  try {
    return new URL(url).pathname === new URL(HISTORY).pathname;
  } catch (_) {
    const base = HISTORY.split("?")[0];
    return url === HISTORY || url.startsWith(base);
  }
}
function displayURL(url) {
  if (isHistoryPage(url)) return HISTORY_DISPLAY;
  return url;
}

function syncAddressBar(url) {
  if (isHome(url)) {
    els.url.value = "";
    els.url.placeholder = HOME_ADDRESS_PLACEHOLDER;
  } else {
    els.url.value = displayURL(url);
    els.url.placeholder = DEFAULT_ADDRESS_PLACEHOLDER;
  }
}

function canBookmark(url) {
  if (!url || isHome(url) || isHistoryPage(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "file:";
  } catch (_) {
    return false;
  }
}

function syncBookmarkButton(url) {
  const ok = canBookmark(url);
  const bookmarked = ok && bookmarkUrls.has(url);
  els.bookmarkBtn.disabled = !ok;
  els.bookmarkBtn.classList.toggle("bookmarked", bookmarked);
  els.bookmarkBtn.title = ok
    ? bookmarked
      ? "Remove bookmark"
      : "Bookmark this page"
    : "Cannot bookmark this page";
  els.bookmarkBtn.setAttribute(
    "aria-label",
    bookmarked ? "Remove bookmark" : "Bookmark this page"
  );
}

async function refreshBookmarks() {
  try {
    savedBookmarks = (await window.slopAPI.bookmarks.getAll()) || [];
    bookmarkUrls.clear();
    savedBookmarks.forEach((b) => bookmarkUrls.add(b.url));
  } catch (_) {
    savedBookmarks = [];
    bookmarkUrls.clear();
  }
  const tab = activeTab();
  if (tab) syncBookmarkButton(tab.url);
}

function canBookmarkTab(tab) {
  return tab && !tab.private && canBookmark(tab.url);
}

function bookmarkEntryFromTab(tab) {
  return {
    url: tab.url,
    title: tab.title || tab.url,
    favicon: tab.favicon || faviconFallback(tab.url),
  };
}

async function addBookmark(entry) {
  if (!entry?.url || bookmarkUrls.has(entry.url)) return false;
  try {
    await window.slopAPI.bookmarks.add(entry);
    bookmarkUrls.add(entry.url);
    savedBookmarks.unshift(entry);
    if (savedBookmarks.length > 500) savedBookmarks.length = 500;
    const tab = activeTab();
    if (tab) syncBookmarkButton(tab.url);
    return true;
  } catch (_) {
    return false;
  }
}

async function bookmarkThisTab() {
  const tab = activeTab();
  if (!canBookmarkTab(tab)) return;
  await addBookmark(bookmarkEntryFromTab(tab));
  renderBookmarksSubmenu();
}

async function bookmarkAllTabs() {
  let added = false;
  for (const tab of tabs) {
    if (!canBookmarkTab(tab)) continue;
    if (await addBookmark(bookmarkEntryFromTab(tab))) added = true;
  }
  if (added) {
    await refreshBookmarks();
    renderBookmarksSubmenu();
  }
}

async function toggleBookmark() {
  const tab = activeTab();
  if (!canBookmarkTab(tab)) return;
  const entry = {
    url: tab.url,
    title: tab.title || tab.url,
    favicon: tab.favicon || faviconFallback(tab.url),
  };
  try {
    const result = await window.slopAPI.bookmarks.toggle(entry);
    if (result?.bookmarked) {
      bookmarkUrls.add(tab.url);
      savedBookmarks = savedBookmarks.filter((b) => b.url !== tab.url);
      savedBookmarks.unshift(entry);
    } else {
      bookmarkUrls.delete(tab.url);
      savedBookmarks = savedBookmarks.filter((b) => b.url !== tab.url);
    }
    syncBookmarkButton(tab.url);
  } catch (_) {}
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_DEFAULT = 1.0;
let zoomHideTimer = null;

function clampZoom(factor) {
  const n = Number(factor);
  if (!Number.isFinite(n)) return ZOOM_DEFAULT;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 100) / 100;
}

function showZoomIndicator(factor) {
  const pct = Math.round(clampZoom(factor) * 100);
  els.zoomIndicator.textContent = pct + "%";
  els.zoomIndicator.setAttribute("aria-hidden", "false");
  els.zoomIndicator.classList.add("visible");
  clearTimeout(zoomHideTimer);
  zoomHideTimer = setTimeout(() => {
    els.zoomIndicator.classList.remove("visible");
    els.zoomIndicator.setAttribute("aria-hidden", "true");
  }, 1500);
}

function applyTabZoom(tab, factor, showIndicator = true) {
  factor = clampZoom(factor);
  tab.zoom = factor;
  try {
    tab.webview.setZoomFactor(factor);
  } catch (_) {}
  if (showIndicator && tab.id === activeId) showZoomIndicator(factor);
}

function tabByWebContentsId(id) {
  if (!id) return null;
  return tabs.find((t) => t.webContentsId === id) || null;
}

const els = {
  tabs: document.getElementById("tabs"),
  newTab: document.getElementById("newTab"),
  viewsFrame: document.getElementById("viewsFrame"),
  views: document.getElementById("views"),
  zoomIndicator: document.getElementById("zoomIndicator"),
  back: document.getElementById("back"),
  forward: document.getElementById("forward"),
  reload: document.getElementById("reload"),
  urlForm: document.getElementById("urlForm"),
  url: document.getElementById("url"),
  bookmarkBtn: document.getElementById("bookmarkBtn"),
  slopBadge: document.getElementById("slopBadge"),
  slopPanel: document.getElementById("slopPanel"),
  slopPageCount: document.getElementById("slopPageCount"),
  slopTotalCount: document.getElementById("slopTotalCount"),
  adPageCount: document.getElementById("adPageCount"),
  adTotalCount: document.getElementById("adTotalCount"),
  slopStatusText: document.getElementById("slopStatusText"),
  slopToggle: document.getElementById("slopToggle"),
  slopSwitchState: document.getElementById("slopSwitchState"),
  adBlockToggle: document.getElementById("adBlockToggle"),
  adBlockSwitchState: document.getElementById("adBlockSwitchState"),
  menuBtn: document.getElementById("menuBtn"),
  menu: document.getElementById("menu"),
  historySubWrap: document.getElementById("historySubWrap"),
  historyRecentList: document.getElementById("historyRecentList"),
  bookmarksSubWrap: document.getElementById("bookmarksSubWrap"),
  bookmarksThisTab: document.getElementById("bookmarksThisTab"),
  bookmarksAllTabs: document.getElementById("bookmarksAllTabs"),
  bookmarksSavedList: document.getElementById("bookmarksSavedList"),
  cookieOverlay: document.getElementById("cookieOverlay"),
  cookiePanel: document.getElementById("cookiePanel"),
  cookieClose: document.getElementById("cookieClose"),
  cookieScope: document.getElementById("cookieScope"),
  cookieSiteOnly: document.getElementById("cookieSiteOnly"),
  cookieClearSite: document.getElementById("cookieClearSite"),
  cookieClearAll: document.getElementById("cookieClearAll"),
  cookieList: document.getElementById("cookieList"),
  cookieEmpty: document.getElementById("cookieEmpty"),
  sideRail: document.getElementById("sideRail"),
  sideRailItems: document.getElementById("sideRailItems"),
  sideRailToggle: document.getElementById("sideRailToggle"),
  sidePanel: document.getElementById("sidePanel"),
  sidePanelViews: document.getElementById("sidePanelViews"),
  sidePanelResize: document.getElementById("sidePanelResize"),
  sidePanelResizeShield: document.getElementById("sidePanelResizeShield"),
  sidePanelTitle: document.querySelector(".side-panel-title"),
  sidePanelIcon: document.querySelector(".side-panel-icon"),
  sidePanelClose: document.querySelector(".side-panel-close"),
  min: document.getElementById("min"),
  max: document.getElementById("max"),
  close: document.getElementById("close"),
};

// Filter UI — adblock wired to main process; slop filter still UI-only.
const filterUI = {
  slopEnabled: true,
  adBlockEnabled: true,
  totalSlopBlocked: 0,
  totalAdBlocked: 0,
};

/** Per-tab blocked ad count (tab id -> number). */
const tabAdCounts = new Map();

let tabs = [];
let activeId = null;
let idSeq = 1;
let privateTabSeq = 0;

const sessionHistory = [];
const closedTabs = [];
let browseHistory = [];
const bookmarkUrls = new Set();
let savedBookmarks = [];
const HISTORY_MAX = 100;
const HISTORY_RECENT_MAX = 8;
const BROWSE_HISTORY_MAX = 2000;
const BOOKMARKS_MENU_MAX = 12;

/* ---------- Favicons ---------- */
// Prefer a real .ico/.png/.svg favicon over apple-touch icons; take the first.
function pickFavicon(favicons) {
  if (!favicons || !favicons.length) return null;
  const preferred = favicons.find((u) =>
    /\.(ico|png|svg|gif|jpg|jpeg|webp)(\?|$)/i.test(u)
  );
  return preferred || favicons[0];
}

// Default favicon location for a site that didn't declare one in HTML.
function faviconFallback(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin + "/favicon.ico";
  } catch (_) {
    return null;
  }
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ---------- Icons (Lucide) ---------- */
function renderIcons(root) {
  try {
    const scope = root || document;
    const opts = root ? { root } : undefined;
    if (opts) window.lucide.createIcons(opts);
    else window.lucide.createIcons();

    scope.querySelectorAll(".menu-item svg").forEach((svg) => {
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
    });
    scope.querySelectorAll(".rail-item svg").forEach((svg) => {
      const active = svg.closest(".rail-item")?.classList.contains("active");
      const size = active ? "24" : "20";
      svg.setAttribute("width", size);
      svg.setAttribute("height", size);
    });
  } catch (_) {}
}

function updateRailIconSizes(btn) {
  const active = btn.classList.contains("active");
  const size = active ? "24" : "20";
  btn.querySelectorAll("svg").forEach((svg) => {
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
  });
}

function integrationFavicon(domain) {
  return (
    "https://www.google.com/s2/favicons?domain=" +
    encodeURIComponent(domain) +
    "&sz=64"
  );
}

/* ---------- URL Helpers ---------- */
function toURL(input) {
  const raw = input.trim();
  if (!raw) return HOME;
  // Aliases for the start page (must run before the protocol check).
  const low = raw.toLowerCase();
  if (low === "home" || low === "https://home" || low === "slop://home") {
    return HOME;
  }
  // Absolute local file path (Windows "C:\..." / "C:/..." or UNC "\\...").
  if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) {
    return "file:///" + raw.replace(/\\/g, "/");
  }
  // Explicit scheme (http://, https://, file://, ...).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(raw)) return "http://" + raw;

  // Domain heuristic: only the hostname (before the first slash) may decide
  // whether this is a URL. A dot inside the *path* (e.g. "test/demo.html")
  // must NOT make it a URL - otherwise it resolves to a bogus host.
  if (!raw.includes(" ")) {
    const host = raw.split(/[/?#]/)[0];
    const isIp = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host);
    const isDomain = /^[^\s.]+(\.[^\s.]+)+(:\d+)?$/.test(host) && /\.[a-z]{2,}(:\d+)?$/i.test(host);
    if (isIp || isDomain) return "https://" + raw;
  }
  return "https://www.google.com/search?q=" + encodeURIComponent(raw);
}

/* ---------- Tabs ---------- */
function getTab(id) {
  return tabs.find((t) => t.id === id);
}
function activeTab() {
  return getTab(activeId);
}

function createTab(url, opts = {}) {
  const id = idSeq++;
  const isPrivate = !!opts.private;
  // Non-persist partition = in-memory session, cleared when the tab closes.
  const partition = isPrivate
    ? "slopbrowser-tab-private-" + ++privateTabSeq
    : PARTITION;

  const webview = document.createElement("webview");
  webview.setAttribute("allowpopups", "");
  webview.setAttribute("partition", partition);
  webview.setAttribute("preload", window.slopAPI.preloadWebviewPath);
  webview.setAttribute(
    "webpreferences",
    "contextIsolation=yes,javascript=yes"
  );
  webview.dataset.id = String(id);
  if (isPrivate) webview.dataset.private = "1";
  webview.src = url || HOME;
  els.views.appendChild(webview);

  const startURL = url || HOME;
  const tab = {
    id,
    webview,
    title: isHome(startURL) ? "Home" : "New tab",
    url: startURL,
    favicon: null,
    private: isPrivate,
    partition,
    zoom: ZOOM_DEFAULT,
  };
  tabs.push(tab);

  wireWebview(tab);
  renderTabs();
  setActive(id);
  return tab;
}

function updatePrivateChrome() {
  const t = activeTab();
  els.viewsFrame.classList.toggle(
    "private-active",
    !!(t && t.private && isHome(t.url))
  );
  updateTabChromeClasses();
}

function updateTabChromeClasses() {
  for (const t of tabs) {
    const refs = tabEls.get(t.id);
    if (!refs) continue;
    const tabGlow =
      t.private && t.id === activeId && !isHome(t.url);
    const cls =
      "tab" +
      (t.id === activeId ? " active" : "") +
      (t.private ? " private" : "") +
      (tabGlow ? " private-glow" : "");
    if (refs.root.className !== cls) refs.root.className = cls;
  }
}

function updateTabPresentation(tab) {
  const refs = tabEls.get(tab.id);
  if (!refs) return;
  const titleText = tab.title || "New tab";
  if (refs.title.textContent !== titleText) {
    refs.title.textContent = titleText;
  }
  if (refs.root.title !== titleText) refs.root.title = titleText;
  updateTabIcon(tab, refs);
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [tab] = tabs.splice(idx, 1);
  if (!isHome(tab.url) && !isHistoryPage(tab.url)) {
    closedTabs.unshift(historyEntryFromTab(tab));
    if (closedTabs.length > 25) closedTabs.pop();
  }
  tab.webview.remove();
  // Private tabs use in-memory partitions — wipe all site data on close.
  if (tab.private) {
    window.slopAPI.cookies.clearPartition(tab.partition).catch(() => {});
  }
  if (activeId === id) {
    const next = tabs[idx] || tabs[idx - 1];
    if (next) setActive(next.id);
    else createTab(HOME);
  }
  tabAdCounts.delete(id);
  renderTabs();
}

function setActive(id) {
  activeId = id;
  tabs.forEach((t) => {
    t.webview.classList.toggle("active", t.id === id);
  });
  const t = activeTab();
  if (t) {
    syncAddressBar(t.url);
    syncBookmarkButton(t.url);
    updateNavButtons();
    try {
      t.webview.setZoomFactor(t.zoom ?? ZOOM_DEFAULT);
    } catch (_) {}
  }
  updatePrivateChrome();
  renderSideRail();
  refreshFilterPanelCounts();
}

/*
 * Incremental tab rendering: each tab's DOM is built once and then only
 * updated in place. Rebuilding everything on each update caused favicon
 * <img> elements to be recreated constantly (flicker + reload delays).
 */
const tabEls = new Map(); // tab id -> { root, icon, title, iconKey }

function buildTabEl(t) {
  const root = document.createElement("div");
  root.className = "tab";

  const overlay = document.createElement("div");
  overlay.className = "private-border-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const surface = document.createElement("div");
  surface.className = "tab-surface";

  const icon = document.createElement("span");
  icon.className = "tab-icon";

  const title = document.createElement("span");
  title.className = "title";

  const close = document.createElement("span");
  close.className = "close";
  close.innerHTML = X_SVG;
  close.onclick = (e) => {
    e.stopPropagation();
    closeTab(t.id);
  };

  surface.appendChild(icon);
  surface.appendChild(title);
  surface.appendChild(close);
  root.appendChild(overlay);
  root.appendChild(surface);
  root.onclick = () => setActive(t.id);

  return { root, surface, icon, title, iconKey: null };
}

function updateTabIcon(t, refs) {
  const key = isHome(t.url) ? "home" : t.favicon || "globe";
  if (refs.iconKey === key) return;
  refs.iconKey = key;

  if (key === "home") {
    refs.icon.innerHTML = LOGO_SVG;
  } else if (key === "globe") {
    refs.icon.innerHTML = GLOBE_SVG;
  } else {
    refs.icon.innerHTML = "";
    const img = document.createElement("img");
    img.src = key;
    img.onerror = () => {
      // Broken favicon: fall back to the globe and stop retrying.
      t.favicon = null;
      refs.iconKey = "globe";
      refs.icon.innerHTML = GLOBE_SVG;
    };
    refs.icon.appendChild(img);
  }
}

function renderTabs() {
  // Remove elements of closed tabs.
  for (const [id, refs] of tabEls) {
    if (!tabs.some((t) => t.id === id)) {
      refs.root.remove();
      tabEls.delete(id);
    }
  }

  for (const t of tabs) {
    let refs = tabEls.get(t.id);
    if (!refs) {
      refs = buildTabEl(t);
      tabEls.set(t.id, refs);
    }

    const tabGlow =
      t.private && t.id === activeId && !isHome(t.url);
    refs.root.className =
      "tab" +
      (t.id === activeId ? " active" : "") +
      (t.private ? " private" : "") +
      (tabGlow ? " private-glow" : "");
    if (refs.root.title !== t.title) refs.root.title = t.title;

    const titleText = t.title || "New tab";
    if (refs.title.textContent !== titleText) {
      refs.title.textContent = titleText;
    }

    updateTabIcon(t, refs);

    // appendChild moves existing nodes, keeping the order in sync.
    els.tabs.appendChild(refs.root);
  }
}

/* ---------- Webview Events ---------- */
function wireWebview(tab) {
  const wv = tab.webview;

  const bindWebContentsId = () => {
    try {
      tab.webContentsId = wv.getWebContentsId();
      wv.setZoomFactor(tab.zoom ?? ZOOM_DEFAULT);
    } catch (_) {}
  };
  wv.addEventListener("dom-ready", () => {
    bindWebContentsId();
    if (isHistoryPage(tab.url)) injectHistoryPage(tab);
  });

  wv.addEventListener("did-finish-load", () => {
    if (isHistoryPage(tab.url)) injectHistoryPage(tab);
  });

  wv.addEventListener("page-title-updated", (e) => {
    const href = wv.getURL();
    const next = isHome(href)
      ? "Home"
      : isHistoryPage(href)
        ? "History"
        : e.title;
    if (next === tab.title) return;
    tab.title = next;
    updateTabPresentation(tab);
  });

  wv.addEventListener("page-favicon-updated", (e) => {
    const icon = pickFavicon(e.favicons);
    if (icon && icon !== tab.favicon) {
      tab.favicon = icon;
      updateTabPresentation(tab);
    }
  });

  wv.addEventListener("did-stop-loading", () => {
    if (tab.id === activeId) {
      updateNavButtons();
    }
  });

  const onNav = () => {
    const prevOrigin = faviconFallback(tab.url);
    tab.url = wv.getURL();
    // Immediately guess /favicon.ico so the icon shows without waiting for
    // the page to finish loading; page-favicon-updated overrides it with the
    // site's declared icon as soon as it is known. Same-origin navigations
    // keep the current icon (no flicker).
    const nextOrigin = faviconFallback(tab.url);
    if (nextOrigin !== prevOrigin || !tab.favicon) {
      tab.favicon = nextOrigin;
    }
    if (isHome(tab.url)) tab.title = "Home";
    else if (isHistoryPage(tab.url)) tab.title = "History";
    pushSessionHistory(tab);
    if (tab.id === activeId) {
      syncAddressBar(tab.url);
      syncBookmarkButton(tab.url);
      updateNavButtons();
      updatePrivateChrome();
      updateTabPresentation(tab);
    } else {
      updateTabPresentation(tab);
      updateTabChromeClasses();
    }
  };
  wv.addEventListener("did-navigate", onNav);
  wv.addEventListener("did-navigate-in-page", () => {
    tab.url = wv.getURL();
    if (tab.id === activeId) {
      syncAddressBar(tab.url);
      syncBookmarkButton(tab.url);
    }
  });

  // Show a simple dark error page instead of a blank view on load failures.
  wv.addEventListener("did-fail-load", (e) => {
    // -3 = ERR_ABORTED (e.g. user navigated away) - not a real failure.
    if (!e.isMainFrame || e.errorCode === -3) return;
    const html =
      '<body style="margin:0;display:flex;align-items:center;justify-content:center;' +
      'height:100vh;background:#0e0f13;color:#e6e8ef;font-family:Segoe UI,sans-serif">' +
      '<div style="text-align:center;max-width:520px;padding:0 20px">' +
      '<div style="font-size:40px;margin-bottom:12px">&#9888;</div>' +
      '<h2 style="margin:0 0 8px;font-weight:600">Page could not be loaded</h2>' +
      '<p style="color:#8b90a3;font-size:14px;word-break:break-all;margin:0">' +
      escapeHTML(e.validatedURL || tab.url) +
      "</p>" +
      '<p style="color:#8b90a3;font-size:12px;margin-top:10px">' +
      escapeHTML(e.errorDescription || "Error " + e.errorCode) +
      "</p></div></body>";
    wv.executeJavaScript(
      "document.documentElement.innerHTML = " + JSON.stringify(html)
    ).catch(() => {});
  });
}

function updateNavButtons() {
  const t = activeTab();
  if (!t) return;
  try {
    els.back.disabled = !t.webview.canGoBack();
    els.forward.disabled = !t.webview.canGoForward();
  } catch (_) {}
}

/* ---------- Toolbar ---------- */
els.urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const t = activeTab();
  if (!t) return;
  const url = toURL(els.url.value);
  // Navigating again before the previous load finishes rejects with
  // ERR_ABORTED - expected, so swallow it instead of logging an error.
  Promise.resolve(t.webview.loadURL(url)).catch(() => {});
  t.webview.focus();
});

els.back.onclick = () => activeTab() && activeTab().webview.goBack();
els.forward.onclick = () => activeTab() && activeTab().webview.goForward();

async function reloadActiveTab() {
  const t = activeTab();
  if (!t) return;
  try {
    const id = t.webview.getWebContentsId();
    if (id) await window.slopAPI.setWebviewBackground(id);
  } catch (_) {}
  try {
    t.webview.reload();
  } catch (_) {}
}

els.reload.onclick = () => reloadActiveTab();
els.bookmarkBtn.onclick = () => toggleBookmark();
els.newTab.onclick = () => createTab(HOME);

/* ---------- Slop filter dropdown (UI only) ---------- */
function setSlopFilterEnabled(enabled) {
  filterUI.slopEnabled = enabled;
  updateSlopPanel();
}

function setAdBlockerEnabled(enabled) {
  filterUI.adBlockEnabled = enabled;
  window.slopAPI.adblock.setEnabled(enabled).catch(() => {});
  updateSlopPanel();
}

function refreshFilterPanelCounts() {
  const t = activeTab();
  els.adPageCount.textContent = String(t ? tabAdCounts.get(t.id) || 0 : 0);
  els.slopPageCount.textContent = "0";
  els.adTotalCount.textContent = String(filterUI.totalAdBlocked);
  els.slopTotalCount.textContent = String(filterUI.totalSlopBlocked);
}

function updateSlopPanel() {
  const anyOn = filterUI.slopEnabled || filterUI.adBlockEnabled;

  els.slopBadge.classList.toggle("on", anyOn);
  els.slopBadge.classList.toggle("off", !anyOn);
  refreshFilterPanelCounts();
  els.slopStatusText.textContent = anyOn ? "Protection active" : "Protection off";
  els.slopSwitchState.textContent = filterUI.slopEnabled ? "ON" : "OFF";
  els.adBlockSwitchState.textContent = filterUI.adBlockEnabled ? "ON" : "OFF";
  els.slopToggle.classList.toggle("block-off", !filterUI.slopEnabled);
  els.adBlockToggle.classList.toggle("block-off", !filterUI.adBlockEnabled);
  els.slopPanel.classList.toggle("off", !anyOn);
}

function toggleSlopPanel(force) {
  const show = force ?? els.slopPanel.classList.contains("hidden");
  if (show) {
    toggleMenu(false);
    updateSlopPanel();
    renderIcons(els.slopPanel);
  }
  els.slopPanel.classList.toggle("hidden", !show);
}

els.slopBadge.onclick = (e) => {
  e.stopPropagation();
  toggleSlopPanel();
};
els.slopToggle.onclick = () => setSlopFilterEnabled(!filterUI.slopEnabled);
els.adBlockToggle.onclick = () => setAdBlockerEnabled(!filterUI.adBlockEnabled);

/* ---------- History ---------- */
function historyEntryFromTab(tab) {
  return {
    url: tab.url,
    title: tab.title || tab.url,
    favicon: tab.favicon || faviconFallback(tab.url),
    visitedAt: Date.now(),
  };
}

function pushSessionHistory(tab) {
  if (isHome(tab.url) || isHistoryPage(tab.url)) return;
  const entry = historyEntryFromTab(tab);
  if (sessionHistory[0]?.url === entry.url) {
    sessionHistory[0] = entry;
  } else {
    sessionHistory.unshift(entry);
    if (sessionHistory.length > HISTORY_MAX) sessionHistory.pop();
  }

  if (tab.private) return;

  window.slopAPI.history.add(entry).catch(() => {});

  const top = browseHistory[0];
  if (
    top?.url === entry.url &&
    entry.visitedAt - top.visitedAt < 90_000
  ) {
    browseHistory[0] = entry;
  } else {
    browseHistory.unshift(entry);
    if (browseHistory.length > BROWSE_HISTORY_MAX) browseHistory.pop();
  }
}

function openRecentUrl(url) {
  if (!url) return;
  const tab = activeTab();
  if (tab) {
    Promise.resolve(tab.webview.loadURL(url)).catch(() => {});
    tab.webview.focus();
  } else {
    createTab(url);
  }
}

function reopenClosedTab() {
  const entry = closedTabs.shift();
  if (!entry) return;
  const tab = createTab(entry.url);
  tab.title = entry.title;
  tab.favicon = entry.favicon;
  updateTabPresentation(tab);
  renderTabs();
}

async function refreshBrowseHistory() {
  try {
    browseHistory = (await window.slopAPI.history.getAll()) || [];
  } catch (_) {
    browseHistory = [];
  }
}

async function injectHistoryPage(tab) {
  await refreshBrowseHistory();
  const payload = JSON.stringify(browseHistory);
  tab.webview
    .executeJavaScript(
      "(function(d){function apply(){if(typeof window.renderSlopHistory==='function'){window.renderSlopHistory(d);return true}return false}if(!apply())document.addEventListener('DOMContentLoaded',function(){apply()},{once:true})})(" +
        payload +
        ")"
    )
    .catch(() => {});
}

function openHistoryPage() {
  toggleMenu(false);
  const tab = activeTab();
  if (tab) {
    Promise.resolve(tab.webview.loadURL(HISTORY)).catch(() => {});
    tab.webview.focus();
  } else {
    createTab(HISTORY);
  }
}

function historyRecentItems() {
  const items = [];
  closedTabs.forEach((entry, i) => {
    if (items.length >= HISTORY_RECENT_MAX) return;
    items.push({ ...entry, closed: true, showShortcut: i === 0 });
  });
  for (const entry of sessionHistory) {
    if (items.length >= HISTORY_RECENT_MAX) break;
    if (items.some((x) => x.url === entry.url)) continue;
    items.push({ ...entry, closed: false, showShortcut: false });
  }
  return items;
}

function renderHistorySubmenu() {
  const list = els.historyRecentList;
  if (!list) return;
  list.replaceChildren();
  const items = historyRecentItems();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "menu-submenu-empty";
    empty.textContent = "No recent tabs";
    list.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item menu-recent";
    btn.dataset.action = entry.closed ? "history-reopen" : "history-open-url";
    btn.dataset.url = entry.url;
    btn.setAttribute("role", "menuitem");

    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-recent-icon-wrap";
    if (entry.favicon) {
      const icon = document.createElement("img");
      icon.className = "menu-recent-icon";
      icon.src = entry.favicon;
      icon.alt = "";
      icon.referrerPolicy = "no-referrer";
      icon.onerror = () => {
        iconWrap.innerHTML = GLOBE_SVG;
        iconWrap.classList.add("menu-recent-fallback");
      };
      iconWrap.appendChild(icon);
    } else {
      iconWrap.classList.add("menu-recent-fallback");
      iconWrap.innerHTML = GLOBE_SVG;
    }

    const label = document.createElement("span");
    label.className = "menu-recent-label";
    label.textContent = truncate(entry.title, 38);

    btn.appendChild(iconWrap);
    btn.appendChild(label);
    if (entry.showShortcut) {
      const kbd = document.createElement("kbd");
      kbd.textContent = "Ctrl+Shift+T";
      btn.appendChild(kbd);
    }
    list.appendChild(btn);
  }
  renderIcons(list);
}

function renderBookmarksSubmenu() {
  const tab = activeTab();
  if (els.bookmarksThisTab) {
    els.bookmarksThisTab.disabled =
      !canBookmarkTab(tab) || bookmarkUrls.has(tab?.url);
  }
  if (els.bookmarksAllTabs) {
    els.bookmarksAllTabs.disabled = !tabs.some(
      (t) => canBookmarkTab(t) && !bookmarkUrls.has(t.url)
    );
  }

  const list = els.bookmarksSavedList;
  if (!list) return;
  list.replaceChildren();

  const items = savedBookmarks.slice(0, BOOKMARKS_MENU_MAX);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "menu-submenu-empty";
    empty.textContent = "No bookmarks yet";
    list.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item menu-recent";
    btn.dataset.action = "bookmarks-open-url";
    btn.dataset.url = entry.url;
    btn.setAttribute("role", "menuitem");

    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-recent-icon-wrap";
    if (entry.favicon) {
      const icon = document.createElement("img");
      icon.className = "menu-recent-icon";
      icon.src = entry.favicon;
      icon.alt = "";
      icon.referrerPolicy = "no-referrer";
      icon.onerror = () => {
        iconWrap.innerHTML = GLOBE_SVG;
        iconWrap.classList.add("menu-recent-fallback");
      };
      iconWrap.appendChild(icon);
    } else {
      iconWrap.classList.add("menu-recent-fallback");
      iconWrap.innerHTML = GLOBE_SVG;
    }

    const label = document.createElement("span");
    label.className = "menu-recent-label";
    label.textContent = truncate(entry.title, 38);

    btn.appendChild(iconWrap);
    btn.appendChild(label);
    list.appendChild(btn);
  }
  renderIcons(list);
}

/* ---------- Menu (dropdown) ---------- */
function toggleMenu(force) {
  const show = force ?? els.menu.classList.contains("hidden");
  if (show) {
    toggleSlopPanel(false);
    renderHistorySubmenu();
    renderBookmarksSubmenu();
    renderIcons(els.menu);
  } else {
    els.historySubWrap?.classList.remove("sub-open");
    els.bookmarksSubWrap?.classList.remove("sub-open");
  }
  els.menu.classList.toggle("hidden", !show);
}

els.menuBtn.onclick = (e) => {
  e.stopPropagation();
  toggleMenu();
};

els.historySubWrap?.addEventListener("mouseenter", () => {
  renderHistorySubmenu();
  els.historySubWrap.classList.add("sub-open");
});
els.historySubWrap?.addEventListener("mouseleave", () => {
  els.historySubWrap.classList.remove("sub-open");
});

els.bookmarksSubWrap?.addEventListener("mouseenter", () => {
  renderBookmarksSubmenu();
  els.bookmarksSubWrap.classList.add("sub-open");
});
els.bookmarksSubWrap?.addEventListener("mouseleave", () => {
  els.bookmarksSubWrap.classList.remove("sub-open");
});

els.menu.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;
  const action = item.dataset.action;
  if (action === "history" || action === "bookmarks") return;
  if (action === "bookmarks-this-tab") {
    bookmarkThisTab();
    toggleMenu(false);
    return;
  }
  if (action === "bookmarks-all-tabs") {
    bookmarkAllTabs();
    toggleMenu(false);
    return;
  }
  if (action === "bookmarks-open-url") {
    openRecentUrl(item.dataset.url);
    toggleMenu(false);
    return;
  }
  if (action === "history-open") {
    openHistoryPage();
    toggleMenu(false);
    return;
  }
  if (action === "history-open-url") {
    openRecentUrl(item.dataset.url);
    toggleMenu(false);
    return;
  }
  if (action === "history-reopen") {
    const url = item.dataset.url;
    const idx = closedTabs.findIndex((t) => t.url === url);
    const entry = idx !== -1 ? closedTabs.splice(idx, 1)[0] : null;
    if (entry) {
      const tab = createTab(entry.url);
      tab.title = entry.title;
      tab.favicon = entry.favicon;
      updateTabPresentation(tab);
      renderTabs();
    }
    toggleMenu(false);
    return;
  }
  if (action === "newtab") createTab(HOME);
  else if (action === "newwindow") window.slopAPI.newWindow({});
  else if (action === "newprivate") createTab(HOME, { private: true });
  else if (action === "downloads") {
    /* Downloads page — placeholder. */
  } else if (action === "reload") reloadActiveTab();
  else if (action === "cookies") openCookieManager();
  else if (action === "togglesidebar")
    setRailCollapsed(!document.body.classList.contains("rail-collapsed"));
  else if (action === "devtools")
    activeTab() && activeTab().webview.openDevTools();
  toggleMenu(false);
});

/* ---------- Cookie manager ---------- */
const cookieApi = window.slopAPI.cookies;

function tabHttpUrl(tab) {
  if (!tab || isHome(tab.url)) return null;
  try {
    const u = new URL(tab.url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (_) {}
  return null;
}

function formatCookieExpiry(expirationDate) {
  if (!expirationDate) return "Session";
  const d = new Date(expirationDate * 1000);
  return Number.isNaN(d.getTime()) ? "Session" : d.toLocaleString();
}

function truncate(s, max = 80) {
  const t = String(s ?? "");
  return t.length <= max ? t : t.slice(0, max) + "…";
}

async function refreshCookieList() {
  const tab = activeTab();
  if (!tab) return;

  const siteOnly = els.cookieSiteOnly.checked;
  const pageUrl = tabHttpUrl(tab);
  const scope =
    (tab.private ? "Private tab" : "Shared profile") +
    (siteOnly && pageUrl
      ? " · " + new URL(pageUrl).hostname
      : siteOnly
        ? " · no site loaded"
        : "");

  els.cookieScope.textContent = scope;

  let list = [];
  try {
    if (siteOnly && pageUrl) {
      list = await cookieApi.getForUrl(tab.partition, pageUrl);
    } else {
      list = await cookieApi.getAll(tab.partition);
    }
  } catch (_) {
    list = [];
  }

  list.sort((a, b) =>
    (a.domain || "").localeCompare(b.domain || "") ||
    (a.name || "").localeCompare(b.name || "")
  );

  els.cookieList.innerHTML = list
    .map(
      (c, i) =>
        `<div class="cookie-row" data-idx="${i}">` +
        `<div class="cookie-row-name">${escapeHTML(c.name)}</div>` +
        `<button class="cookie-row-del" type="button" data-del="1">Delete</button>` +
        `<div class="cookie-row-domain">${escapeHTML((c.domain || "") + (c.path || "/"))}</div>` +
        `<div class="cookie-row-value">${escapeHTML(truncate(c.value))}</div>` +
        `<div class="cookie-row-meta">${c.httpOnly ? "HttpOnly · " : ""}${c.secure ? "Secure · " : ""}${formatCookieExpiry(c.expirationDate)}</div>` +
        `</div>`
    )
    .join("");

  els.cookieEmpty.classList.toggle("hidden", list.length > 0);
  els.cookieList.dataset.cookies = JSON.stringify(list);
}

function toggleCookieManager(force) {
  const show = force ?? els.cookieOverlay.classList.contains("hidden");
  if (show) {
    toggleMenu(false);
    toggleSlopPanel(false);
    els.cookieOverlay.classList.remove("hidden");
    els.cookieOverlay.setAttribute("aria-hidden", "false");
    renderIcons(els.cookiePanel);
    refreshCookieList();
  } else {
    els.cookieOverlay.classList.add("hidden");
    els.cookieOverlay.setAttribute("aria-hidden", "true");
  }
}

function openCookieManager() {
  toggleCookieManager(true);
}

els.cookieClose.onclick = () => toggleCookieManager(false);
els.cookieOverlay.addEventListener("click", (e) => {
  if (e.target === els.cookieOverlay) toggleCookieManager(false);
});
els.cookiePanel.addEventListener("click", (e) => e.stopPropagation());
els.cookieSiteOnly.onchange = () => refreshCookieList();

els.cookieList.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  const row = btn.closest(".cookie-row");
  const tab = activeTab();
  if (!row || !tab) return;
  const idx = Number(row.dataset.idx);
  let list = [];
  try {
    list = JSON.parse(els.cookieList.dataset.cookies || "[]");
  } catch (_) {}
  const cookie = list[idx];
  if (!cookie) return;
  await cookieApi.remove(tab.partition, cookie);
  refreshCookieList();
});

els.cookieClearSite.onclick = async () => {
  const tab = activeTab();
  const pageUrl = tab && tabHttpUrl(tab);
  if (!tab || !pageUrl) return;
  await cookieApi.clear(tab.partition, pageUrl);
  refreshCookieList();
};

els.cookieClearAll.onclick = async () => {
  const tab = activeTab();
  if (!tab) return;
  await cookieApi.clear(tab.partition);
  refreshCookieList();
};

// Click outside closes open dropdowns.
document.addEventListener("click", (e) => {
  if (!els.menu.classList.contains("hidden") && !e.target.closest("#menuWrap")) {
    toggleMenu(false);
  }
  if (
    !els.slopPanel.classList.contains("hidden") &&
    !e.target.closest("#slopWrap")
  ) {
    toggleSlopPanel(false);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    toggleMenu(false);
    els.historySubWrap?.classList.remove("sub-open");
    els.bookmarksSubWrap?.classList.remove("sub-open");
    toggleSlopPanel(false);
    toggleCookieManager(false);
  }
});

// Select the address bar text on focus
els.url.addEventListener("focus", () => els.url.select());

/* ---------- Keyboard ---------- */
function handleShortcut(key) {
  if (key === "t") {
    createTab(HOME);
  } else if (key === "n") {
    window.slopAPI.newWindow({});
  } else if (key === "private") {
    createTab(HOME, { private: true });
  } else if (key === "w") {
    if (activeId != null) closeTab(activeId);
  } else if (key === "l") {
    els.url.focus();
  } else if (key === "r") {
    reloadActiveTab();
  } else if (key === "h") {
    openHistoryPage();
  } else if (key === "shift+t") {
    reopenClosedTab();
  }
}

window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === "n" && !e.shift) {
    e.preventDefault();
    handleShortcut("n");
  } else if (key === "p" && e.shift) {
    e.preventDefault();
    handleShortcut("private");
  } else if (key === "h" && !e.shift) {
    e.preventDefault();
    handleShortcut("h");
  } else if (key === "t" && e.shift) {
    e.preventDefault();
    handleShortcut("shift+t");
  } else if (["t", "w", "l", "r"].includes(key)) {
    e.preventDefault();
    handleShortcut(key);
  }
});

// Shortcuts pressed while a webview is focused (via the main process).
window.slopAPI.onShortcut(handleShortcut);

// Open popups from web pages as a new tab.
window.slopAPI.onOpenURL((url) => createTab(url));

// OAuth / popups from side-panel apps stay inside the panel.
window.slopAPI.onOpenSideURL(({ url, sideId }) => {
  if (!url || !sideId) return;
  const item = SIDE_RAIL_ITEMS.find((i) => i.id === sideId);
  if (!item || item.type === "tab") return;
  openSidePanel(sideId);
  const wv = sidePanelWebviews.get(sideId);
  if (wv) wv.src = url;
});

window.slopAPI.adblock.onBlocked(({ webContentsId, total }) => {
  filterUI.totalAdBlocked = total;
  const tab = tabs.find((t) => t.webContentsId === webContentsId);
  if (tab) {
    tabAdCounts.set(tab.id, (tabAdCounts.get(tab.id) || 0) + 1);
  }
  if (!tab || tab.id === activeId) refreshFilterPanelCounts();
  else els.adTotalCount.textContent = String(total);
});

window.slopAPI.onZoomChanged(({ webContentsId, factor }) => {
  const tab = tabByWebContentsId(webContentsId);
  if (!tab) return;
  tab.zoom = clampZoom(factor);
  if (tab.id === activeId) showZoomIndicator(tab.zoom);
});

window.slopAPI.adblock.getState().then((state) => {
  filterUI.adBlockEnabled = state.enabled;
  filterUI.totalAdBlocked = state.totalBlocked;
  updateSlopPanel();
}).catch(() => {});

/* ---------- Window controls (custom titlebar) ---------- */
const winApi = window.slopAPI.window;

els.min.onclick = () => winApi.minimize();
els.max.onclick = () => winApi.toggleMaximize();
els.close.onclick = () => winApi.close();

function setMaximized(isMax) {
  document.body.classList.toggle("maximized", !!isMax);
  els.max.title = isMax ? "Restore" : "Maximize";
  fitActiveSideWebview();
}

winApi.onMaximizedChange(setMaximized);
winApi.isMaximized().then(setMaximized);

/* ---------- Side rail (shortcuts & integrations) ---------- */
const SIDE_RAIL_ITEMS = [
  {
    id: "home",
    label: "Home",
    type: "tab",
    icon: "home",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    url: "https://web.whatsapp.com/",
    favicon: "https://web.whatsapp.com/favicon.ico",
    icon: "message-circle",
    accent: "#25d366",
  },
  {
    id: "telegram",
    label: "Telegram",
    url: "https://web.telegram.org/a/",
    favicon: "https://web.telegram.org/favicon.ico",
    icon: "send",
    accent: "#2aabee",
  },
  {
    id: "discord",
    label: "Discord",
    url: "https://discord.com/channels/@me",
    favicon: integrationFavicon("discord.com"),
    icon: "gamepad-2",
    accent: "#5865f2",
  },
  {
    id: "gmail",
    label: "Gmail",
    url: "https://mail.google.com/",
    favicon: integrationFavicon("mail.google.com"),
    icon: "mail",
    accent: "#ea4335",
  },
  {
    id: "instagram",
    label: "Instagram",
    url: "https://www.instagram.com/",
    favicon: integrationFavicon("instagram.com"),
    icon: "camera",
    accent: "#e1306c",
  },
  {
    id: "messenger",
    label: "Messenger",
    url: "https://www.messenger.com/",
    favicon: integrationFavicon("messenger.com"),
    icon: "messages-square",
    accent: "#0084ff",
  },
];

const sidePanelWebviews = new Map();
const sideWebviewLayout = new WeakMap();
let activeSidePanelId = null;
const CHROME_UA = window.slopAPI.chromeUserAgent;
const SIDE_PANEL_MIN_W = 360;
const SIDE_PANEL_MAX_RATIO = 0.5;
const SIDE_PANEL_DEFAULT_W = 500;
let sideFitTimer = null;

function getSidePanelWidth() {
  try {
    const w = parseInt(localStorage.getItem("slop-side-panel-width"), 10);
    return Number.isFinite(w) ? w : SIDE_PANEL_DEFAULT_W;
  } catch (_) {
    return SIDE_PANEL_DEFAULT_W;
  }
}

function clampSidePanelWidth(px) {
  const max = Math.max(SIDE_PANEL_MIN_W, Math.floor(window.innerWidth * SIDE_PANEL_MAX_RATIO));
  return Math.max(SIDE_PANEL_MIN_W, Math.min(max, px));
}

function setSidePanelWidth(px, opts = {}) {
  const w = clampSidePanelWidth(px);
  document.documentElement.style.setProperty("--side-panel-width", w + "px");
  if (!opts.skipPersist) {
    try {
      localStorage.setItem("slop-side-panel-width", String(w));
    } catch (_) {}
  }
  if (!opts.skipWebviewSync) fitActiveSideWebview();
  return w;
}

function scheduleSideWebviewSync(wv) {
  if (!wv) return;
  clearTimeout(sideFitTimer);
  sideFitTimer = setTimeout(() => syncSideWebviewLayout(wv), 40);
}

async function syncSideWebviewLayout(wv) {
  if (!wv || !els.sidePanelViews || !wv.classList.contains("active")) return;

  const w = els.sidePanelViews.clientWidth;
  const h = els.sidePanelViews.clientHeight;
  if (w < 1 || h < 1) return;

  const prev = sideWebviewLayout.get(wv);
  if (prev && prev.w === w && prev.h === h) return;
  sideWebviewLayout.set(wv, { w, h });

  wv.style.width = w + "px";
  wv.style.height = h + "px";

  try {
    wv.setZoomFactor(1);
  } catch (_) {}

  try {
    const id = wv.getWebContentsId();
    if (id) await window.slopAPI.setWebviewSize(id, w, h);
  } catch (_) {}

  try {
    await wv.executeJavaScript(
      "window.dispatchEvent(new Event('resize'))",
      false
    );
  } catch (_) {}
}

function fitActiveSideWebview() {
  if (!activeSidePanelId) return;
  const wv = sidePanelWebviews.get(activeSidePanelId);
  if (wv) scheduleSideWebviewSync(wv);
}

function hideSideWebview(wv) {
  wv.classList.remove("active");
  wv.style.width = "0";
  wv.style.height = "0";
  wv.style.visibility = "hidden";
  wv.style.pointerEvents = "none";
}

function showSideWebviewEl(wv) {
  wv.classList.add("active");
  wv.style.visibility = "visible";
  wv.style.pointerEvents = "auto";
}

function sidePartition(id) {
  return "persist:slopbrowser-side-" + id;
}

function wireSideWebview(item, wv) {
  wv.addEventListener("page-title-updated", (e) => {
    if (activeSidePanelId === item.id) {
      els.sidePanelTitle.textContent = e.title || item.label;
    }
  });

  wv.addEventListener("page-favicon-updated", (e) => {
    if (activeSidePanelId !== item.id) return;
    const icon = pickFavicon(e.favicons);
    if (icon) {
      els.sidePanelIcon.innerHTML =
        `<img src="${escapeHTML(icon)}" alt="">`;
    }
  });

  wv.addEventListener("did-fail-load", (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    const html =
      '<body style="margin:0;display:flex;align-items:center;justify-content:center;' +
      'height:100vh;background:#0e0f13;color:#e6e8ef;font-family:Segoe UI,sans-serif">' +
      '<div style="text-align:center;max-width:320px;padding:0 16px">' +
      '<div style="font-size:32px;margin-bottom:10px">&#9888;</div>' +
      `<h2 style="margin:0 0 8px;font-size:15px;font-weight:600">${escapeHTML(item.label)} could not load</h2>` +
      '<p style="color:#8b90a3;font-size:12px;margin:0 0 12px">Check your connection and try again.</p>' +
      `<p style="color:#8b90a3;font-size:11px;word-break:break-all;margin:0">${escapeHTML(e.validatedURL || item.url)}</p>` +
      "</div></body>";
    wv.executeJavaScript(
      "document.documentElement.innerHTML = " + JSON.stringify(html)
    ).catch(() => {});
  });

  const refit = () => scheduleSideWebviewSync(wv);
  wv.addEventListener("dom-ready", refit);
  wv.addEventListener("did-stop-loading", refit);
  wv.addEventListener("did-navigate", refit);
  wv.addEventListener("did-navigate-in-page", refit);
}

function getOrCreateSideWebview(item) {
  let wv = sidePanelWebviews.get(item.id);
  if (wv) return wv;

  wv = document.createElement("webview");
  wv.className = "side-panel-webview";
  wv.dataset.sideId = item.id;
  wv.setAttribute("partition", sidePartition(item.id));
  wv.setAttribute("allowpopups", "");
  wv.setAttribute("disableguestresize", "");
  wv.setAttribute("useragent", CHROME_UA);
  wv.setAttribute(
    "webpreferences",
    "contextIsolation=yes,javascript=yes,webgl=yes"
  );
  wv.src = item.url;
  wireSideWebview(item, wv);
  els.sidePanelViews.appendChild(wv);
  sidePanelWebviews.set(item.id, wv);
  return wv;
}

function showSideWebview(item) {
  for (const [id, view] of sidePanelWebviews) {
    if (id === item.id) showSideWebviewEl(view);
    else hideSideWebview(view);
  }
  const wv = getOrCreateSideWebview(item);
  showSideWebviewEl(wv);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const url = wv.getURL();
        if (!url || url === "about:blank") wv.src = item.url;
      } catch (_) {
        wv.src = item.url;
      }
      syncSideWebviewLayout(wv);
    });
  });
  return wv;
}

function loadRailCollapsed() {
  try {
    return localStorage.getItem("slop-rail-collapsed") === "1";
  } catch (_) {
    return false;
  }
}

function saveRailCollapsed(collapsed) {
  try {
    localStorage.setItem("slop-rail-collapsed", collapsed ? "1" : "0");
  } catch (_) {}
}

function setRailCollapsed(collapsed) {
  document.body.classList.toggle("rail-collapsed", collapsed);
  saveRailCollapsed(collapsed);
  if (els.sideRailToggle) {
    els.sideRailToggle.title = collapsed ? "Show sidebar" : "Hide sidebar";
    const icon = els.sideRailToggle.querySelector("i");
    if (icon) {
      icon.setAttribute("data-lucide", collapsed ? "panel-left" : "panel-left-close");
      renderIcons(els.sideRailToggle);
    }
  }
}

const railEls = new Map();

function buildSideRailOnce() {
  if (railEls.size) return;

  for (const item of SIDE_RAIL_ITEMS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rail-item";
    btn.dataset.id = item.id;
    btn.title = item.label;

    if (item.favicon) {
      const img = document.createElement("img");
      img.src = item.favicon;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        const icon = document.createElement("i");
        icon.setAttribute("data-lucide", item.icon || "globe");
        img.replaceWith(icon);
        renderIcons(btn);
        updateRailIconSizes(btn);
      };
      btn.appendChild(img);
    } else {
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", item.icon || "home");
      btn.appendChild(icon);
    }

    railEls.set(item.id, btn);
    els.sideRailItems.appendChild(btn);
  }
  renderIcons(els.sideRailItems);
}

function updateRailActiveStates() {
  const homeActive =
    !activeSidePanelId && activeTab() && isHome(activeTab().url);

  for (const item of SIDE_RAIL_ITEMS) {
    const btn = railEls.get(item.id);
    if (!btn) continue;
    const isActive =
      item.type === "tab"
        ? homeActive
        : activeSidePanelId === item.id;
    if (btn.classList.contains("active") !== isActive) {
      btn.classList.toggle("active", isActive);
      updateRailIconSizes(btn);
    }
  }
}

function renderSideRail() {
  buildSideRailOnce();
  updateRailActiveStates();
}

function setSidePanelHeader(item) {
  els.sidePanelTitle.textContent = item.label;
  if (item.favicon) {
    els.sidePanelIcon.innerHTML =
      `<img src="${escapeHTML(item.favicon)}" alt="">`;
  } else {
    els.sidePanelIcon.innerHTML = `<i data-lucide="${item.icon || "globe"}"></i>`;
    renderIcons(els.sidePanel);
  }
}

function openSidePanel(itemId) {
  const item = SIDE_RAIL_ITEMS.find((i) => i.id === itemId);
  if (!item || item.type === "tab") return;

  if (activeSidePanelId === itemId) {
    closeSidePanel();
    return;
  }

  activeSidePanelId = itemId;
  els.sidePanel.classList.remove("hidden");
  setSidePanelHeader(item);
  showSideWebview(item);
  renderSideRail();
}

function closeSidePanel() {
  activeSidePanelId = null;
  els.sidePanel.classList.add("hidden");
  for (const wv of sidePanelWebviews.values()) hideSideWebview(wv);
  renderSideRail();
}

function activateHomeFromRail() {
  closeSidePanel();
  const homeTab = tabs.find((t) => isHome(t.url));
  if (homeTab) setActive(homeTab.id);
  else createTab(HOME);
}

function handleRailClick(itemId) {
  const item = SIDE_RAIL_ITEMS.find((i) => i.id === itemId);
  if (!item) return;
  if (item.type === "tab") {
    activateHomeFromRail();
    return;
  }
  openSidePanel(itemId);
}

els.sideRailItems.addEventListener("click", (e) => {
  const btn = e.target.closest(".rail-item");
  if (!btn) return;
  handleRailClick(btn.dataset.id);
});

els.sideRailToggle.onclick = () =>
  setRailCollapsed(!document.body.classList.contains("rail-collapsed"));
els.sidePanelClose.onclick = () => closeSidePanel();

let sidePanelResizeActive = false;
let windowResizeTimer = null;

setSidePanelWidth(getSidePanelWidth());

if (els.sidePanelViews) {
  new ResizeObserver(() => {
    if (sidePanelResizeActive) return;
    fitActiveSideWebview();
  }).observe(els.sidePanelViews);
}

window.addEventListener("resize", () => {
  if (sidePanelResizeActive) return;
  clearTimeout(windowResizeTimer);
  windowResizeTimer = setTimeout(() => {
    setSidePanelWidth(getSidePanelWidth());
  }, 120);
});

function endSidePanelResize() {
  if (!sidePanelResizeActive) return;
  sidePanelResizeActive = false;
  document.body.classList.remove("side-panel-resizing");
  if (els.sidePanelResizeShield) {
    els.sidePanelResizeShield.classList.add("hidden");
  }
  window.slopAPI.setWebviewsPointerPassthrough(false).catch(() => {});
  setSidePanelWidth(els.sidePanel.offsetWidth);
}

function beginSidePanelResize(e) {
  if (e.button !== 0 || sidePanelResizeActive) return;
  e.preventDefault();
  e.stopPropagation();

  sidePanelResizeActive = true;
  const pointerId = e.pointerId;
  const startX = e.clientX;
  const startW = els.sidePanel.offsetWidth;
  const shield = els.sidePanelResizeShield;

  document.body.classList.add("side-panel-resizing");
  if (shield) shield.classList.remove("hidden");
  window.slopAPI.setWebviewsPointerPassthrough(true).catch(() => {});

  const onMove = (ev) => {
    if (!sidePanelResizeActive || ev.pointerId !== pointerId) return;
    setSidePanelWidth(startW + (ev.clientX - startX), {
      skipWebviewSync: true,
      skipPersist: true,
    });
  };

  const onEnd = (ev) => {
    if (ev.type === "pointerup" && ev.pointerId !== pointerId) return;
    for (const el of [els.sidePanelResize, shield]) {
      if (!el) continue;
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("pointercancel", onEnd);
      el.removeEventListener("lostpointercapture", onEnd);
    }
    window.removeEventListener("blur", onEnd);
    try {
      els.sidePanelResize.releasePointerCapture(pointerId);
    } catch (_) {}
    endSidePanelResize();
  };

  for (const el of [els.sidePanelResize, shield]) {
    if (!el) continue;
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", onEnd);
    el.addEventListener("lostpointercapture", onEnd);
  }
  window.addEventListener("blur", onEnd, { once: true });

  try {
    els.sidePanelResize.setPointerCapture(pointerId);
  } catch (_) {}
}

if (els.sidePanelResize) {
  els.sidePanelResize.addEventListener("pointerdown", beginSidePanelResize);
}

setRailCollapsed(loadRailCollapsed());
renderSideRail();

/* ---------- Start ---------- */
renderIcons();
createTab(HOME);
refreshBrowseHistory();
refreshBookmarks();

window.slopAPI.onHistoryChanged(() => {
  refreshBrowseHistory();
});
