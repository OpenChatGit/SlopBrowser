/*
 * SlopBrowser - Renderer SOURCE (build with: node scripts/build-chrome-module.js)
 * Runtime entry: renderer/main.js → chrome/index.js + js/shared.js + js/utils.js
 */
"use strict";

const HOME = window.slopAPI.newTabURL;
const HISTORY = window.slopAPI.historyURL;
const DOWNLOADS = window.slopAPI.downloadsURL;
const COOKIES = window.slopAPI.cookiesURL;
const SETTINGS = window.slopAPI.settingsURL;
const PARTITION = window.slopAPI.partition;
// Friendly address shown instead of the internal file:// history page URL.
const HISTORY_DISPLAY = "slop://history";
const DOWNLOADS_DISPLAY = "slop://downloads";
const COOKIES_DISPLAY = "slop://cookies";
const SETTINGS_DISPLAY = "slop://settings";
const CHROME_WEB_STORE = "https://chromewebstore.google.com/category/extensions";
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
function isDownloadsPage(url) {
  if (!url) return false;
  try {
    return new URL(url).pathname === new URL(DOWNLOADS).pathname;
  } catch (_) {
    const base = DOWNLOADS.split("?")[0];
    return url === DOWNLOADS || url.startsWith(base);
  }
}
function isCookiesPage(url) {
  if (!url) return false;
  try {
    return new URL(url).pathname === new URL(COOKIES).pathname;
  } catch (_) {
    const base = COOKIES.split("?")[0];
    return url === COOKIES || url.startsWith(base);
  }
}
function isSettingsPage(url) {
  if (!url) return false;
  try {
    return new URL(url).pathname === new URL(SETTINGS).pathname;
  } catch (_) {
    const base = SETTINGS.split("?")[0];
    return url === SETTINGS || url.startsWith(base);
  }
}
function displayURL(url) {
  if (isHistoryPage(url)) return HISTORY_DISPLAY;
  if (isDownloadsPage(url)) return DOWNLOADS_DISPLAY;
  if (isCookiesPage(url)) return COOKIES_DISPLAY;
  if (isSettingsPage(url)) return SETTINGS_DISPLAY;
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

function focusHomeSearch(tab, delayMs = 0) {
  if (!tab || !isHome(tab.url)) return;
  const run = () => {
    window.slopAPI.tabs.focus(tab.id).catch(() => {});
    window.slopAPI.tabs
      .executeJavaScript(
        tab.id,
        "window.__slopFocusHomeSearch&&window.__slopFocusHomeSearch()"
      )
      .catch(() => {});
  };
  if (delayMs > 0) setTimeout(run, delayMs);
  else queueMicrotask(run);
}

function focusActiveHomeSearch(delayMs = 0) {
  focusHomeSearch(activeTab(), delayMs);
}

function canBookmark(url) {
  if (!url || isHome(url) || isHistoryPage(url) || isDownloadsPage(url) || isCookiesPage(url) || isSettingsPage(url))
    return false;
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
  window.slopAPI.tabs.setZoom(tab.id, factor).catch(() => {});
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
  downloadWrap: document.getElementById("downloadWrap"),
  downloadBtn: document.getElementById("downloadBtn"),
  downloadBtnIcon: document.getElementById("downloadBtnIcon"),
  downloadRing: document.querySelector("#downloadBtn .download-ring"),
  downloadRingFill: document.querySelector("#downloadBtn .download-ring-fill"),
  downloadPanel: document.getElementById("downloadPanel"),
  downloadPanelList: document.getElementById("downloadPanelList"),
  downloadsSubWrap: document.getElementById("downloadsSubWrap"),
  downloadsRecentList: document.getElementById("downloadsRecentList"),
  menuCluster: document.getElementById("menuCluster"),
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

/* ---------- Tab content bounds (WebContentsView) ---------- */
let boundsRaf = null;

function syncTabBounds() {
  if (!els.views) return;
  const r = els.views.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  window.slopAPI.tabs
    .setBounds({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    })
    .catch(() => {});
}

function syncSidePanelBounds() {
  if (!els.sidePanelViews || els.sidePanel.classList.contains("hidden")) {
    window.slopAPI.sidePanel.setBounds(null).catch(() => {});
    return;
  }
  const r = els.sidePanelViews.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  window.slopAPI.sidePanel
    .setBounds({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    })
    .catch(() => {});
}

function scheduleContentBoundsSync() {
  if (boundsRaf != null) return;
  boundsRaf = requestAnimationFrame(() => {
    boundsRaf = null;
    syncTabBounds();
    syncSidePanelBounds();
  });
}

function initTabBoundsSync() {
  if (!els.views) return;
  scheduleContentBoundsSync();
  if (typeof ResizeObserver !== "undefined") {
    const boundsObserver = new ResizeObserver(() => scheduleContentBoundsSync());
    boundsObserver.observe(els.views);
    if (els.viewsFrame) boundsObserver.observe(els.viewsFrame);
    if (els.sidePanelViews) boundsObserver.observe(els.sidePanelViews);
  }
  window.addEventListener("resize", scheduleContentBoundsSync);
}

initTabBoundsSync();

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
const DOWNLOADS_MENU_MAX = 6;
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

async function createTab(url, opts = {}) {
  const id = idSeq++;
  const isPrivate = !!opts.private;
  const partition = isPrivate
    ? "slopbrowser-tab-private-" + ++privateTabSeq
    : PARTITION;

  const startURL = url || HOME;
  const tab = {
    id,
    title: isHome(startURL)
      ? "Home"
      : isHistoryPage(startURL)
        ? "History"
        : isDownloadsPage(startURL)
          ? "Downloads"
          : isCookiesPage(startURL)
            ? "Cookies"
            : isSettingsPage(startURL)
              ? "Settings"
              : "New tab",
    url: startURL,
    favicon: null,
    private: isPrivate,
    partition,
    zoom: ZOOM_DEFAULT,
    webContentsId: null,
  };
  tabs.push(tab);
  renderTabs();

  try {
    const result = await window.slopAPI.tabs.create({
      tabId: id,
      url: startURL,
      partition,
      zoom: tab.zoom,
    });
    if (result?.webContentsId) tab.webContentsId = result.webContentsId;
  } catch (_) {}

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
  if (!isHome(tab.url) && !isHistoryPage(tab.url) && !isDownloadsPage(tab.url) && !isCookiesPage(tab.url) && !isSettingsPage(tab.url)) {
    closedTabs.unshift(historyEntryFromTab(tab));
    if (closedTabs.length > 25) closedTabs.pop();
  }
  window.slopAPI.tabs.close(id).catch(() => {});
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

function setActive(id, opts = {}) {
  activeId = id;
  if (!opts.fromMain) {
    window.slopAPI.tabs.setActive(id).catch(() => {});
  }
  const t = activeTab();
  if (t) {
    syncAddressBar(t.url);
    syncBookmarkButton(t.url);
    updateNavButtons();
    applyTabZoom(t, t.zoom ?? ZOOM_DEFAULT, false);
  }
  updatePrivateChrome();
  renderSideRail();
  refreshFilterPanelCounts();
  if (slopPanelOverlayOpen) refreshSlopPanelOverlay();
  if (t && isHome(t.url)) focusHomeSearch(t);
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
  root.dataset.tabId = String(t.id);

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

  surface.appendChild(icon);
  surface.appendChild(title);
  surface.appendChild(close);
  root.appendChild(overlay);
  root.appendChild(surface);

  return { root, surface, icon, title, iconKey: null };
}

function scheduleCloseTab(id) {
  queueMicrotask(() => closeTab(id));
}

els.tabs?.addEventListener("click", (e) => {
  const closeBtn = e.target.closest(".tab .close");
  if (closeBtn) {
    e.stopPropagation();
    e.preventDefault();
    const tabId = Number(closeBtn.closest(".tab")?.dataset.tabId);
    if (Number.isFinite(tabId)) scheduleCloseTab(tabId);
    return;
  }
  const root = e.target.closest(".tab");
  if (!root) return;
  const tabId = Number(root.dataset.tabId);
  if (Number.isFinite(tabId)) setActive(tabId);
});

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
    refs.root.dataset.tabId = String(t.id);

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
async function handleHistoryGuestMessage(tab, payload) {
  const { op, data } = payload || {};
  const h = window.slopAPI.history;
  try {
    if (op === "removeEntry") await h.removeEntry(data.url, data.visitedAt);
    else if (op === "removeEntries") await h.removeEntries(data.entries);
    else if (op === "clear") await h.clear();
    else if (op !== "refresh") return;
  } catch (_) {}
  if (isHistoryPage(tab.url)) await injectHistoryPage(tab);
}

async function handleDownloadsGuestMessage(tab, payload) {
  const { op, data } = payload || {};
  const d = window.slopAPI.downloads;
  try {
    if (op === "open" && data?.id) await d.open(data.id);
    else if (op === "showInFolder" && data?.id) await d.showInFolder(data.id);
    else if (op === "cancel" && data?.id) await d.cancel(data.id);
    else if (op === "remove" && data?.id) await d.remove(data.id);
    else if (op === "removeMany" && data?.ids) await d.removeMany(data.ids);
    else if (op === "clear") await d.clear();
    else if (op !== "refresh") return;
  } catch (_) {}
  if (isDownloadsPage(tab.url)) await injectDownloadsPage(tab);
}

function handleTabEvent(msg) {
  const tabId = msg?.tabId;
  const tab = getTab(tabId);
  if (!tab) return;
  const type = msg?.type;

  if (type === "guest-message") {
    if (msg.channel === "slop:history") {
      handleHistoryGuestMessage(tab, msg.payload).catch(() => {});
    } else if (msg.channel === "slop:downloads") {
      handleDownloadsGuestMessage(tab, msg.payload).catch(() => {});
    }
    return;
  }

  if (type === "dom-ready") {
    if (msg.webContentsId) tab.webContentsId = msg.webContentsId;
    applyTabZoom(tab, tab.zoom ?? ZOOM_DEFAULT, false);
    if (isHistoryPage(tab.url)) injectHistoryPage(tab);
    if (isDownloadsPage(tab.url)) injectDownloadsPage(tab);
    if (isCookiesPage(tab.url)) injectCookiesPage(tab);
    if (isSettingsPage(tab.url)) injectSettingsPage(tab);
    if (isHome(tab.url) && tab.id === activeId) focusHomeSearch(tab, 50);
    return;
  }

  if (type === "did-finish-load") {
    if (isHistoryPage(tab.url)) injectHistoryPage(tab);
    if (isDownloadsPage(tab.url)) injectDownloadsPage(tab);
    if (isCookiesPage(tab.url)) injectCookiesPage(tab);
    if (isSettingsPage(tab.url)) injectSettingsPage(tab);
    if (isHome(tab.url) && tab.id === activeId) focusHomeSearch(tab, 50);
    return;
  }

  if (type === "page-title-updated") {
    const href = msg.url || tab.url;
    const next = isHome(href)
      ? "Home"
      : isHistoryPage(href)
        ? "History"
        : isDownloadsPage(href)
          ? "Downloads"
          : isCookiesPage(href)
            ? "Cookies"
            : isSettingsPage(href)
              ? "Settings"
              : msg.title;
    if (next === tab.title) return;
    tab.title = next;
    updateTabPresentation(tab);
    return;
  }

  if (type === "page-favicon-updated") {
    const icon = pickFavicon(msg.favicons);
    if (icon && icon !== tab.favicon) {
      tab.favicon = icon;
      updateTabPresentation(tab);
      syncDownloadFaviconsForTab(tab).catch(() => {});
    }
    return;
  }

  if (type === "did-stop-loading") {
    if (tab.id === activeId) updateNavButtons();
    return;
  }

  if (type === "did-navigate") {
    const prevOrigin = faviconFallback(tab.url);
    tab.url = msg.url || tab.url;
    const nextOrigin = faviconFallback(tab.url);
    if (nextOrigin !== prevOrigin || !tab.favicon) {
      tab.favicon = nextOrigin;
    }
    if (isHome(tab.url)) tab.title = "Home";
    else if (isHistoryPage(tab.url)) tab.title = "History";
    else if (isDownloadsPage(tab.url)) {
      tab.title = "Downloads";
      if (tab.id === activeId) dismissDownloadIndicator();
    } else if (isCookiesPage(tab.url)) tab.title = "Cookies";
    else if (isSettingsPage(tab.url)) tab.title = "Settings";
    pushSessionHistory(tab);
    if (tab.id === activeId) {
      syncAddressBar(tab.url);
      syncBookmarkButton(tab.url);
      updateNavButtons();
      updatePrivateChrome();
      updateTabPresentation(tab);
      if (isHome(tab.url)) focusHomeSearch(tab, 50);
    } else {
      updateTabPresentation(tab);
      updateTabChromeClasses();
    }
    return;
  }

  if (type === "did-navigate-in-page") {
    tab.url = msg.url || tab.url;
    if (tab.id === activeId) {
      syncAddressBar(tab.url);
      syncBookmarkButton(tab.url);
      if (isHome(tab.url)) focusHomeSearch(tab, 50);
    }
    return;
  }

  if (type === "did-fail-load") {
    if (msg.errorCode === -3) return;
    const html =
      '<body style="margin:0;display:flex;align-items:center;justify-content:center;' +
      'height:100vh;background:#0e0f13;color:#e6e8ef;font-family:Segoe UI,sans-serif">' +
      '<div style="text-align:center;max-width:520px;padding:0 20px">' +
      '<div style="font-size:40px;margin-bottom:12px">&#9888;</div>' +
      '<h2 style="margin:0 0 8px;font-weight:600">Page could not be loaded</h2>' +
      '<p style="color:#8b90a3;font-size:14px;word-break:break-all;margin:0">' +
      escapeHTML(msg.validatedURL || tab.url) +
      "</p>" +
      '<p style="color:#8b90a3;font-size:12px;margin-top:10px">' +
      escapeHTML(msg.errorDescription || "Error " + msg.errorCode) +
      "</p></div></body>";
    window.slopAPI.tabs
      .executeJavaScript(
        tab.id,
        "document.documentElement.innerHTML = " + JSON.stringify(html)
      )
      .catch(() => {});
  }
}

window.slopAPI.tabs.onEvent(handleTabEvent);

window.slopAPI.tabs.onMainCreated((payload) => {
  const tabId = payload?.tabId;
  if (tabId == null || getTab(tabId)) return;
  const url = payload.url || HOME;
  tabs.push({
    id: tabId,
    title: isHome(url) ? "Home" : "New tab",
    url,
    favicon: null,
    private: false,
    partition: payload.partition || PARTITION,
    zoom: ZOOM_DEFAULT,
    webContentsId: payload.webContentsId ?? null,
  });
  renderTabs();
  setActive(tabId, { fromMain: true });
});

window.slopAPI.tabs.onMainClosed(({ tabId }) => {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  tabs.splice(idx, 1);
  tabAdCounts.delete(tabId);
  if (activeId === tabId) {
    const next = tabs[idx] || tabs[idx - 1];
    if (next) setActive(next.id, { fromMain: true });
    else createTab(HOME);
  }
  renderTabs();
});

window.slopAPI.tabs.onMainActivated(({ tabId }) => {
  if (getTab(tabId)) setActive(tabId, { fromMain: true });
});

function updateNavButtons() {
  const t = activeTab();
  if (!t) return;
  Promise.all([
    window.slopAPI.tabs.canGoBack(t.id),
    window.slopAPI.tabs.canGoForward(t.id),
  ])
    .then(([back, forward]) => {
      els.back.disabled = !back;
      els.forward.disabled = !forward;
    })
    .catch(() => {});
}

/* ---------- Toolbar ---------- */
els.urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const t = activeTab();
  if (!t) return;
  const url = toURL(els.url.value);
  // Navigating again before the previous load finishes rejects with
  // ERR_ABORTED - expected, so swallow it instead of logging an error.
  Promise.resolve(window.slopAPI.tabs.loadURL(t.id, url)).catch(() => {});
  window.slopAPI.tabs.focus(t.id).catch(() => {});
});

els.back.onclick = () => {
  const t = activeTab();
  if (t) window.slopAPI.tabs.goBack(t.id).catch(() => {});
};
els.forward.onclick = () => {
  const t = activeTab();
  if (t) window.slopAPI.tabs.goForward(t.id).catch(() => {});
};

async function reloadActiveTab() {
  const t = activeTab();
  if (!t) return;
  window.slopAPI.tabs.reload(t.id).catch(() => {});
}

els.reload.onclick = () => reloadActiveTab();
els.bookmarkBtn.onclick = () => toggleBookmark();
els.newTab.onclick = () => createTab(HOME);

/* ---------- Slop filter dropdown (top-layer overlay) ---------- */
let slopPanelOverlayOpen = false;

function slopPanelIsOpen() {
  return slopPanelOverlayOpen;
}

function gatherSlopPanelData() {
  const t = activeTab();
  return {
    slopEnabled: filterUI.slopEnabled,
    adBlockEnabled: filterUI.adBlockEnabled,
    adPageCount: t ? tabAdCounts.get(t.id) || 0 : 0,
    slopPageCount: 0,
    adTotalCount: filterUI.totalAdBlocked,
    slopTotalCount: filterUI.totalSlopBlocked,
  };
}

async function refreshSlopPanelOverlay() {
  if (!slopPanelOverlayOpen || !els.slopBadge) return;
  updateSlopPanel();
  const rect = els.slopBadge.getBoundingClientRect();
  await window.slopAPI.slopPanelOverlay.show(
    {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    gatherSlopPanelData()
  );
}

function runSlopPanelAction(action) {
  if (action === "slop-toggle") {
    setSlopFilterEnabled(!filterUI.slopEnabled);
    if (slopPanelOverlayOpen) refreshSlopPanelOverlay();
    return;
  }
  if (action === "adblock-toggle") {
    setAdBlockerEnabled(!filterUI.adBlockEnabled);
    if (slopPanelOverlayOpen) refreshSlopPanelOverlay();
  }
}

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
  const show = force ?? !slopPanelOverlayOpen;
  if (show) {
    toggleMenu(false);
    els.slopPanel?.classList.add("hidden");
    updateSlopPanel();
    const rect = els.slopBadge?.getBoundingClientRect();
    if (!rect) return;
    slopPanelOverlayOpen = true;
    window.slopAPI.slopPanelOverlay
      .show(
        {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
        gatherSlopPanelData()
      )
      .catch(() => {
        slopPanelOverlayOpen = false;
      });
  } else {
    slopPanelOverlayOpen = false;
    els.slopPanel?.classList.add("hidden");
    window.slopAPI.slopPanelOverlay.hide().catch(() => {});
  }
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
  if (isHome(tab.url) || isHistoryPage(tab.url) || isDownloadsPage(tab.url) || isCookiesPage(tab.url) || isSettingsPage(tab.url))
    return;
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
    Promise.resolve(window.slopAPI.tabs.loadURL(tab.id, url)).catch(() => {});
    window.slopAPI.tabs.focus(tab.id).catch(() => {});
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
  if (menuIsOpen()) refreshMenuOverlay();
}

async function injectHistoryPage(tab) {
  await refreshBrowseHistory();
  const payload = JSON.stringify(browseHistory);
  window.slopAPI.tabs
    .executeJavaScript(
      tab.id,
      "(function(d){function apply(){if(typeof window.renderSlopHistory==='function'){window.renderSlopHistory(d);return true}return false}if(!apply())document.addEventListener('DOMContentLoaded',function(){apply()},{once:true})})(" +
        payload +
        ")"
    )
    .catch(() => {});
}

async function injectDownloadsPage(tab) {
  let entries = [];
  try {
    entries = (await window.slopAPI.downloads.getAll()) || [];
  } catch (_) {}
  const payload = JSON.stringify(entries);
  window.slopAPI.tabs
    .executeJavaScript(
      tab.id,
      "(function(d){function apply(){if(typeof window.renderSlopDownloads==='function'){window.renderSlopDownloads(d);return true}return false}if(!apply())document.addEventListener('DOMContentLoaded',function(){apply()},{once:true})})(" +
        payload +
        ")"
    )
    .catch(() => {});
}

function injectSettingsPage(tab) {
  const payload = JSON.stringify({
    version: window.slopAPI.version,
    buildId: window.slopAPI.buildId,
  });
  window.slopAPI.tabs
    .executeJavaScript(
      tab.id,
      "(function(d){function apply(){if(typeof window.renderSlopSettings==='function'){window.renderSlopSettings(d);return true}return false}if(!apply())document.addEventListener('DOMContentLoaded',function(){apply()},{once:true})})(" +
        payload +
        ")"
    )
    .catch(() => {});
}

function openHistoryPage() {
  toggleMenu(false);
  const tab = activeTab();
  if (tab) {
    Promise.resolve(window.slopAPI.tabs.loadURL(tab.id, HISTORY)).catch(() => {});
    window.slopAPI.tabs.focus(tab.id).catch(() => {});
  } else {
    createTab(HISTORY);
  }
}

function openDownloadsPage() {
  dismissDownloadIndicator();
  toggleMenu(false);
  const tab = activeTab();
  if (tab) {
    Promise.resolve(window.slopAPI.tabs.loadURL(tab.id, DOWNLOADS)).catch(() => {});
    window.slopAPI.tabs.focus(tab.id).catch(() => {});
  } else {
    createTab(DOWNLOADS);
  }
}

let cookiesPageSiteUrl = null;

function tabHttpUrl(tab) {
  if (!tab || isHome(tab.url) || isHistoryPage(tab.url) || isDownloadsPage(tab.url) || isCookiesPage(tab.url) || isSettingsPage(tab.url))
    return null;
  try {
    const u = new URL(tab.url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (_) {}
  return null;
}

function injectCookiesPage(tab) {
  const payload = JSON.stringify({
    partition: tab.partition || PARTITION,
    private: !!tab.private,
    siteUrl: cookiesPageSiteUrl,
  });
  window.slopAPI.tabs
    .executeJavaScript(
      tab.id,
      "(function(d){function apply(){if(typeof window.renderSlopCookies==='function'){window.renderSlopCookies(d);return true}return false}if(!apply())document.addEventListener('DOMContentLoaded',function(){apply()},{once:true})})(" +
        payload +
        ")"
    )
    .catch(() => {});
}

function openCookiesPage() {
  toggleMenu(false);
  const tab = activeTab();
  cookiesPageSiteUrl = tabHttpUrl(tab);
  if (tab) {
    Promise.resolve(window.slopAPI.tabs.loadURL(tab.id, COOKIES)).catch(() => {});
    window.slopAPI.tabs.focus(tab.id).catch(() => {});
  } else {
    createTab(COOKIES);
  }
}

function openSettingsPage(panel) {
  toggleMenu(false);
  const url = panel ? `${SETTINGS}#${panel}` : SETTINGS;
  const tab = activeTab();
  if (tab) {
    Promise.resolve(window.slopAPI.tabs.loadURL(tab.id, url)).catch(() => {});
    window.slopAPI.tabs.focus(tab.id).catch(() => {});
  } else {
    createTab(url);
  }
}

function openExtensionsStore() {
  toggleMenu(false);
  createTab(CHROME_WEB_STORE);
}

function historyRecentItems() {
  const items = [];
  const seen = new Set();

  closedTabs.forEach((entry, i) => {
    if (items.length >= HISTORY_RECENT_MAX) return;
    if (!entry?.url || isHome(entry.url) || isHistoryPage(entry.url) || isDownloadsPage(entry.url) || isCookiesPage(entry.url) || isSettingsPage(entry.url)) return;
    seen.add(entry.url);
    items.push({ ...entry, closed: true, showShortcut: i === 0 });
  });

  for (const entry of browseHistory) {
    if (items.length >= HISTORY_RECENT_MAX) break;
    if (!entry?.url || isHome(entry.url) || isHistoryPage(entry.url) || isDownloadsPage(entry.url) || isCookiesPage(entry.url) || isSettingsPage(entry.url)) continue;
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    items.push({
      url: entry.url,
      title: entry.title || entry.url,
      favicon: entry.favicon || faviconFallback(entry.url),
      closed: false,
      showShortcut: false,
    });
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
    empty.textContent = "No history yet";
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

/* ---------- Downloads ---------- */
let downloadEntries = [];
let downloadPanelOpen = false;
let downloadHideTimer = null;
let downloadIndicatorAcknowledged = true;

function dismissDownloadIndicator() {
  downloadIndicatorAcknowledged = true;
  clearTimeout(downloadHideTimer);
  downloadHideTimer = null;
  closeDownloadPanel();
  updateDownloadChrome();
}

function closeDownloadPanel() {
  downloadPanelOpen = false;
  els.downloadPanel?.classList.add("hidden");
  window.slopAPI.downloadPanelOverlay.hide().catch(() => {});
  updateDownloadChrome();
}

function revealDownloadIndicator() {
  downloadIndicatorAcknowledged = false;
}

function updateDownloadBtnIcon(entry) {
  const wrap = els.downloadBtnIcon;
  if (!wrap) return;
  if (!entry) {
    wrap.replaceChildren();
    wrap.classList.add("menu-recent-fallback");
    wrap.innerHTML = GLOBE_SVG;
    return;
  }
  fillDownloadIconWrap(wrap, entry);
}

function downloadProgress(entry) {
  if (!entry) return 0;
  if (entry.state === "completed") return 100;
  if (entry.state === "cancelled" || entry.state === "interrupted") return 0;
  if (entry.totalBytes > 0) {
    return Math.min(
      100,
      Math.round((entry.receivedBytes / entry.totalBytes) * 100)
    );
  }
  return entry.receivedBytes > 0 ? -1 : 0;
}

function downloadStateLabel(entry) {
  if (!entry) return "";
  if (entry.state === "completed") return "Completed";
  if (entry.state === "cancelled") return "Cancelled";
  if (entry.state === "interrupted") return "Failed";
  const pct = downloadProgress(entry);
  if (pct < 0) return "Downloading…";
  return `${pct}%`;
}

function tabForDownload(entry) {
  if (!entry) return null;
  if (entry.webContentsId) {
    const byId = tabs.find((t) => t.webContentsId === entry.webContentsId);
    if (byId) return byId;
  }
  const ref = entry.sourceUrl || entry.url || "";
  const host = hostFromUrl(ref);
  if (host) {
    for (const t of tabs) {
      if (isHome(t.url) || isHistoryPage(t.url) || isDownloadsPage(t.url) || isCookiesPage(t.url) || isSettingsPage(t.url)) continue;
      if (hostFromUrl(t.url) === host) return t;
    }
  }
  if (entry.state === "progressing") {
    const a = activeTab();
    if (a && !isHome(a.url) && !isHistoryPage(a.url) && !isDownloadsPage(a.url) && !isCookiesPage(a.url) && !isSettingsPage(a.url)) {
      return a;
    }
  }
  return null;
}

function resolveDownloadFavicon(entry) {
  const tab = tabForDownload(entry);
  if (tab?.favicon) return tab.favicon;
  if (entry?.favicon) return entry.favicon;
  const ref = entry?.sourceUrl || entry?.url || "";
  return googleFavicon(ref) || faviconFallback(ref) || "";
}

function fillDownloadIconWrap(wrap, entry) {
  wrap.replaceChildren();
  wrap.classList.remove("menu-recent-fallback");

  const candidates = [];
  const push = (url) => {
    if (url && !candidates.includes(url)) candidates.push(url);
  };
  push(resolveDownloadFavicon(entry));
  push(googleFavicon(entry?.sourceUrl || entry?.url));
  push(faviconFallback(entry?.sourceUrl || entry?.url));
  push(entry?.favicon);

  if (!candidates.length) {
    wrap.classList.add("menu-recent-fallback");
    wrap.innerHTML = GLOBE_SVG;
    return;
  }

  const img = document.createElement("img");
  img.className = "menu-recent-icon";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  let idx = 0;
  img.onerror = () => {
    idx += 1;
    if (idx < candidates.length) {
      img.src = candidates[idx];
      return;
    }
    wrap.classList.add("menu-recent-fallback");
    wrap.innerHTML = GLOBE_SVG;
  };
  img.src = candidates[0];
  wrap.appendChild(img);
}

async function attachDownloadFavicon(info) {
  const api = window.slopAPI.downloads;
  if (!info?.id || !api?.setFavicon) return;
  const entry = { ...info, state: "progressing" };
  const icon = resolveDownloadFavicon(entry);
  if (icon) await api.setFavicon(info.id, icon).catch(() => {});
}

/* Patches entries locally and fires setFavicon without awaiting, so
 * refreshDownloads needs only one getAll round-trip per change event. */
function syncDownloadFaviconsFromTabs() {
  const api = window.slopAPI.downloads;
  if (!api?.setFavicon) return;
  for (const entry of downloadEntries) {
    const tab = tabForDownload(entry);
    if (!tab?.favicon || tab.favicon === entry.favicon) continue;
    entry.favicon = tab.favicon;
    api.setFavicon(entry.id, tab.favicon).catch(() => {});
  }
}

async function syncDownloadFaviconsForTab(tab) {
  if (!tab?.favicon) return;
  const api = window.slopAPI.downloads;
  if (!api?.setFavicon) return;
  let changed = false;
  for (const entry of downloadEntries) {
    const owner = tabForDownload(entry);
    if (owner?.id !== tab.id) continue;
    if (entry.favicon === tab.favicon) continue;
    entry.favicon = tab.favicon;
    changed = true;
    api.setFavicon(entry.id, tab.favicon).catch(() => {});
  }
  if (changed) {
    updateDownloadChrome();
    if (menuIsOpen()) refreshMenuOverlay();
    if (downloadPanelOpen) refreshDownloadPanelOverlay();
  }
}

function setDownloadRingProgress(pct) {
  const fill = els.downloadRingFill;
  const ring = els.downloadRing;
  if (!fill) return;

  if (pct < 0) {
    ring?.classList.add("indeterminate");
    fill.style.strokeDasharray = `${DOWNLOAD_RING_C * 0.28} ${DOWNLOAD_RING_C * 0.72}`;
    fill.style.strokeDashoffset = "0";
    return;
  }

  ring?.classList.remove("indeterminate");
  fill.style.strokeDasharray = `${DOWNLOAD_RING_C} ${DOWNLOAD_RING_C}`;
  fill.style.strokeDashoffset = String(DOWNLOAD_RING_C * (1 - pct / 100));
}

function primaryDownloadEntry() {
  const active = downloadEntries.find((e) => e.state === "progressing");
  return active || downloadEntries[0] || null;
}

function updateDownloadChrome() {
  const wrap = els.downloadWrap;
  if (!wrap) return;

  const primary = primaryDownloadEntry();
  setDownloadRingProgress(downloadProgress(primary));
  updateDownloadBtnIcon(primary);

  if (downloadPanelOpen) {
    wrap.classList.remove("hidden");
    return;
  }

  if (downloadIndicatorAcknowledged || !downloadEntries.length) {
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");
}

async function refreshDownloads() {
  try {
    downloadEntries = (await window.slopAPI.downloads.getAll()) || [];
  } catch (_) {
    downloadEntries = [];
  }
  syncDownloadFaviconsFromTabs();
  updateDownloadChrome();
  if (menuIsOpen()) refreshMenuOverlay();
  if (downloadPanelOpen) refreshDownloadPanelOverlay();
}

function gatherDownloadPanelData() {
  return {
    entries: downloadEntries.slice(0, 12).map((entry) => ({
      id: entry.id,
      filename: entry.filename,
      receivedBytes: entry.receivedBytes,
      totalBytes: entry.totalBytes,
      state: entry.state,
      stateLabel: downloadStateLabel(entry),
      progress: downloadProgress(entry),
      sizeLabel: formatByteRange(entry.receivedBytes, entry.totalBytes),
      favicon: resolveDownloadFavicon(entry),
    })),
  };
}

async function refreshDownloadPanelOverlay() {
  if (!downloadPanelOpen || !els.downloadBtn) return;
  const rect = els.downloadBtn.getBoundingClientRect();
  await window.slopAPI.downloadPanelOverlay.show(
    {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    gatherDownloadPanelData()
  );
}

function runDownloadPanelAction(action, detail = {}) {
  const id = detail.id;
  if (action === "downloads-clear-all") {
    window.slopAPI.downloads
      .clear()
      .then(() => refreshDownloads())
      .catch(() => {});
    return;
  }
  if (action === "downloads-cancel" && id) {
    window.slopAPI.downloads.cancel(id).catch(() => {});
    if (downloadPanelOpen) refreshDownloadPanelOverlay();
    return;
  }
  if (action === "downloads-open-file" && id) {
    window.slopAPI.downloads.open(id).catch(() => {});
    return;
  }
  if (action === "downloads-show-folder" && id) {
    window.slopAPI.downloads.showInFolder(id).catch(() => {});
  }
}

function downloadsRecentItems() {
  return downloadEntries.slice(0, DOWNLOADS_MENU_MAX);
}

function renderDownloadsSubmenu() {
  const list = els.downloadsRecentList;
  if (!list) return;
  list.replaceChildren();
  const items = downloadsRecentItems();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "menu-submenu-empty";
    empty.textContent = "No downloads yet";
    list.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item menu-recent";
    btn.dataset.action =
      entry.state === "progressing" ? "downloads-open-page" : "downloads-open-file";
    btn.dataset.id = entry.id;
    btn.setAttribute("role", "menuitem");

    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-recent-icon-wrap";
    fillDownloadIconWrap(iconWrap, entry);

    const label = document.createElement("span");
    label.className = "menu-recent-label";
    label.textContent = truncate(entry.filename, 38);

    btn.appendChild(iconWrap);
    btn.appendChild(label);
    const state = document.createElement("kbd");
    state.textContent = downloadStateLabel(entry);
    btn.appendChild(state);
    list.appendChild(btn);
  }
  renderIcons(list);
}


function renderDownloadPanel() {
  const list = els.downloadPanelList;
  if (!list) return;
  list.replaceChildren();

  const items = downloadEntries.slice(0, 12);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "download-panel-empty";
    empty.textContent = "No downloads yet";
    list.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const pct = downloadProgress(entry);
    const row = document.createElement("div");
    row.className = "download-item";
    row.dataset.id = entry.id;

    const head = document.createElement("div");
    head.className = "download-item-head";

    const headMain = document.createElement("div");
    headMain.className = "download-item-head-main";

    const iconWrap = document.createElement("span");
    iconWrap.className = "download-item-icon-wrap";
    fillDownloadIconWrap(iconWrap, entry);

    const name = document.createElement("span");
    name.className = "download-item-name";
    name.title = entry.filename;
    name.textContent = entry.filename;

    headMain.appendChild(iconWrap);
    headMain.appendChild(name);

    const size = document.createElement("span");
    size.className = "download-item-size";
    size.textContent = formatByteRange(entry.receivedBytes, entry.totalBytes);

    head.appendChild(headMain);
    head.appendChild(size);

    const track = document.createElement("div");
    track.className = "download-item-track";
    const bar = document.createElement("div");
    bar.className = "download-item-bar";
    if (entry.state === "completed") bar.classList.add("done");
    else if (entry.state === "cancelled" || entry.state === "interrupted") {
      bar.classList.add("error");
    }
    bar.style.width =
      pct < 0 ? "35%" : `${Math.max(entry.state === "completed" ? 100 : pct, 0)}%`;
    track.appendChild(bar);

    const meta = document.createElement("div");
    meta.className = "download-item-meta";

    const pctLabel = document.createElement("span");
    pctLabel.className = "download-item-pct";
    pctLabel.textContent = downloadStateLabel(entry);

    const actions = document.createElement("div");
    actions.className = "download-item-actions";

    if (entry.state === "progressing") {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.dataset.action = "downloads-cancel";
      cancelBtn.dataset.id = entry.id;
      cancelBtn.textContent = "Cancel";
      actions.appendChild(cancelBtn);
    } else if (entry.state === "completed") {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.dataset.action = "downloads-open-file";
      openBtn.dataset.id = entry.id;
      openBtn.textContent = "Open";
      actions.appendChild(openBtn);

      const folderBtn = document.createElement("button");
      folderBtn.type = "button";
      folderBtn.dataset.action = "downloads-show-folder";
      folderBtn.dataset.id = entry.id;
      folderBtn.textContent = "Show";
      actions.appendChild(folderBtn);
    }

    meta.appendChild(pctLabel);
    meta.appendChild(actions);

    row.appendChild(head);
    row.appendChild(track);
    row.appendChild(meta);
    list.appendChild(row);
  }
}

function toggleDownloadPanel(force) {
  const wrap = els.downloadWrap;
  if (!wrap || !els.downloadBtn) return;

  const show = force ?? !downloadPanelOpen;

  if (show) {
    downloadPanelOpen = true;
    downloadIndicatorAcknowledged = true;
    wrap.classList.remove("hidden");
    els.downloadPanel?.classList.add("hidden");
    toggleMenu(false);
    toggleSlopPanel(false);
    refreshDownloads().then(() => refreshDownloadPanelOverlay());
    return;
  }

  closeDownloadPanel();
}

els.downloadBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDownloadPanel();
});

els.downloadPanel?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  runDownloadPanelAction(btn.dataset.action, { id: btn.dataset.id });
});

/* ---------- Menu (dropdown via top-layer WebContentsView) ---------- */
let menuOverlayOpen = false;

function menuIsOpen() {
  return menuOverlayOpen;
}

function gatherMenuOverlayData() {
  const tab = activeTab();
  return {
    history: historyRecentItems(),
    bookmarks: savedBookmarks.slice(0, BOOKMARKS_MENU_MAX),
    downloads: downloadsRecentItems().map((entry) => ({
      id: entry.id,
      filename: entry.filename,
      state: entry.state,
      stateLabel: downloadStateLabel(entry),
    })),
    bookmarksThisTabDisabled:
      !canBookmarkTab(tab) || bookmarkUrls.has(tab?.url),
    bookmarksAllTabsDisabled: !tabs.some(
      (t) => canBookmarkTab(t) && !bookmarkUrls.has(t.url)
    ),
  };
}

async function refreshMenuOverlay() {
  if (!menuOverlayOpen || !els.menuBtn) return;
  const rect = els.menuBtn.getBoundingClientRect();
  await window.slopAPI.menuOverlay.show(
    {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    gatherMenuOverlayData()
  );
}

function runMenuAction(action, detail = {}) {
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
    openRecentUrl(detail.url);
    toggleMenu(false);
    return;
  }
  if (action === "history-open") {
    openHistoryPage();
    toggleMenu(false);
    return;
  }
  if (action === "history-open-url") {
    openRecentUrl(detail.url);
    toggleMenu(false);
    return;
  }
  if (action === "history-reopen") {
    const url = detail.url;
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
  if (action === "downloads-open-page") {
    openDownloadsPage();
    toggleMenu(false);
    return;
  }
  if (action === "downloads-open-file") {
    dismissDownloadIndicator();
    if (detail.id) window.slopAPI.downloads.open(detail.id).catch(() => {});
    toggleMenu(false);
    return;
  }
  if (action === "newtab") createTab(HOME);
  else if (action === "newwindow") window.slopAPI.newWindow({});
  else if (action === "newprivate") createTab(HOME, { private: true });
  else if (action === "reload") reloadActiveTab();
  else if (action === "cookies") openCookiesPage();
  else if (action === "togglesidebar")
    setRailCollapsed(!document.body.classList.contains("rail-collapsed"));
  else if (action === "devtools") {
    const t = activeTab();
    if (t) window.slopAPI.tabs.openDevTools(t.id).catch(() => {});
  } else if (action === "settings") {
    openSettingsPage();
    return;
  } else if (action === "extensions") {
    openExtensionsStore();
    return;
  }
  toggleMenu(false);
}

async function toggleMenu(force) {
  const show = force ?? !menuOverlayOpen;
  if (show) {
    toggleSlopPanel(false);
    closeDownloadPanel();
    els.menu?.classList.add("hidden");
    const rect = els.menuBtn?.getBoundingClientRect();
    if (!rect) return;
    menuOverlayOpen = true;
    await window.slopAPI.menuOverlay.show(
      {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      gatherMenuOverlayData()
    );
  } else {
    menuOverlayOpen = false;
    els.historySubWrap?.classList.remove("sub-open");
    els.bookmarksSubWrap?.classList.remove("sub-open");
    els.downloadsSubWrap?.classList.remove("sub-open");
    els.menu?.classList.add("hidden");
    await window.slopAPI.menuOverlay.hide().catch(() => {});
  }
}

els.menuBtn.onclick = (e) => {
  e.stopPropagation();
  toggleMenu();
};

function wireSubmenuHover(wrap, onEnter) {
  if (!wrap) return;
  wrap._submenuCloseTimer = null;
  wrap.addEventListener("mouseenter", () => {
    clearTimeout(wrap._submenuCloseTimer);
    wrap._submenuCloseTimer = null;
    onEnter?.();
    wrap.classList.add("sub-open");
  });
  wrap.addEventListener("mouseleave", (e) => {
    if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
    wrap._submenuCloseTimer = setTimeout(() => {
      if (!wrap.matches(":hover")) wrap.classList.remove("sub-open");
    }, 120);
  });
}

function keepSubmenuOpen(wrap) {
  if (!wrap) return;
  clearTimeout(wrap._submenuCloseTimer);
  wrap._submenuCloseTimer = null;
  wrap.classList.add("sub-open");
}

wireSubmenuHover(els.historySubWrap, () => renderHistorySubmenu());
wireSubmenuHover(els.bookmarksSubWrap, () => renderBookmarksSubmenu());
wireSubmenuHover(els.downloadsSubWrap, () => {
  dismissDownloadIndicator();
  renderDownloadsSubmenu();
});

els.menu.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;
  const action = item.dataset.action;
  if (
    action === "history" ||
    action === "bookmarks" ||
    action === "downloads"
  )
    return;
  runMenuAction(action, {
    url: item.dataset.url,
    id: item.dataset.id,
  });
});

// Click outside closes open dropdowns.
document.addEventListener("click", (e) => {
  if (menuIsOpen() && !e.target.closest("#menuWrap")) {
    toggleMenu(false);
  }
  if (
    downloadPanelOpen &&
    !e.target.closest("#downloadWrap")
  ) {
    closeDownloadPanel();
  }
  if (
    slopPanelIsOpen() &&
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
    els.downloadsSubWrap?.classList.remove("sub-open");
    closeDownloadPanel();
    toggleSlopPanel(false);
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
  } else if (key === "j") {
    openDownloadsPage();
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
  } else if (key === "j" && !e.shift) {
    e.preventDefault();
    handleShortcut("j");
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
  window.slopAPI.sidePanel.loadURL(sideId, url).catch(() => {});
});

window.slopAPI.adblock.onBlocked(({ webContentsId, total }) => {
  filterUI.totalAdBlocked = total;
  const tab = tabs.find((t) => t.webContentsId === webContentsId);
  if (tab) {
    tabAdCounts.set(tab.id, (tabAdCounts.get(tab.id) || 0) + 1);
  }
  if (!tab || tab.id === activeId) {
    refreshFilterPanelCounts();
    if (slopPanelOverlayOpen) refreshSlopPanelOverlay();
  } else {
    els.adTotalCount.textContent = String(total);
  }
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
  fitActiveSidePanel();
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

let activeSidePanelId = null;

function fitActiveSidePanel() {
  scheduleContentBoundsSync();
}

function handleSidePanelEvent(msg) {
  const integrationId = msg?.integrationId;
  const item = SIDE_RAIL_ITEMS.find((i) => i.id === integrationId);
  if (!item || item.type === "tab") return;
  const type = msg?.type;

  if (type === "page-title-updated" && activeSidePanelId === integrationId) {
    els.sidePanelTitle.textContent = msg.title || item.label;
    return;
  }

  if (type === "page-favicon-updated" && activeSidePanelId === integrationId) {
    const icon = pickFavicon(msg.favicons);
    if (icon) {
      els.sidePanelIcon.innerHTML = `<img src="${escapeHTML(icon)}" alt="">`;
    }
    return;
  }

  if (type === "did-fail-load") {
    if (msg.errorCode === -3) return;
    const html =
      '<body style="margin:0;display:flex;align-items:center;justify-content:center;' +
      'height:100vh;background:#0e0f13;color:#e6e8ef;font-family:Segoe UI,sans-serif">' +
      '<div style="text-align:center;max-width:320px;padding:0 16px">' +
      '<div style="font-size:32px;margin-bottom:10px">&#9888;</div>' +
      `<h2 style="margin:0 0 8px;font-size:15px;font-weight:600">${escapeHTML(item.label)} could not load</h2>` +
      '<p style="color:#8b90a3;font-size:12px;margin:0 0 12px">Check your connection and try again.</p>' +
      `<p style="color:#8b90a3;font-size:11px;word-break:break-all;margin:0">${escapeHTML(msg.validatedURL || item.url)}</p>` +
      "</div></body>";
    window.slopAPI.sidePanel
      .executeJavaScript(
        integrationId,
        "document.documentElement.innerHTML = " + JSON.stringify(html)
      )
      .catch(() => {});
    return;
  }

  if (type === "dom-ready") {
    scheduleContentBoundsSync();
    if (integrationId === activeSidePanelId) {
      window.slopAPI.sidePanel
        .executeJavaScript(
          integrationId,
          "window.dispatchEvent(new Event('resize'))"
        )
        .catch(() => {});
    }
  }
}

window.slopAPI.sidePanel.onEvent(handleSidePanelEvent);

async function showSidePanelView(item) {
  await window.slopAPI.sidePanel.ensure({
    integrationId: item.id,
    url: item.url,
  });
  await window.slopAPI.sidePanel.setActive(item.id);
  scheduleContentBoundsSync();

  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      try {
        const url = await window.slopAPI.sidePanel.getURL(item.id);
        if (!url || url === "about:blank") {
          await window.slopAPI.sidePanel.loadURL(item.id, item.url);
        }
      } catch (_) {
        window.slopAPI.sidePanel.loadURL(item.id, item.url).catch(() => {});
      }
      scheduleContentBoundsSync();
    });
  });
}

function hideAllSidePanelViews() {
  window.slopAPI.sidePanel.hideAll().catch(() => {});
  window.slopAPI.sidePanel.setBounds(null).catch(() => {});
}

const SIDE_PANEL_MIN_W = 360;
const SIDE_PANEL_MAX_RATIO = 0.5;
const SIDE_PANEL_DEFAULT_W = 500;

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
  if (!opts.skipWebviewSync) fitActiveSidePanel();
  queueMicrotask(() => scheduleContentBoundsSync());
  return w;
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
  queueMicrotask(() => scheduleContentBoundsSync());
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
  showSidePanelView(item);
  renderSideRail();
}

function closeSidePanel() {
  activeSidePanelId = null;
  els.sidePanel.classList.add("hidden");
  hideAllSidePanelViews();
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

window.slopAPI.menuOverlay.onAction((payload) => {
  if (!payload?.action) return;
  runMenuAction(payload.action, payload);
});

window.slopAPI.menuOverlay.onClosed(() => {
  menuOverlayOpen = false;
  els.menu?.classList.add("hidden");
});

window.slopAPI.slopPanelOverlay.onAction((payload) => {
  if (!payload?.action) return;
  runSlopPanelAction(payload.action);
});

window.slopAPI.slopPanelOverlay.onClosed(() => {
  slopPanelOverlayOpen = false;
  els.slopPanel?.classList.add("hidden");
});

window.slopAPI.downloadPanelOverlay.onAction((payload) => {
  if (!payload?.action) return;
  runDownloadPanelAction(payload.action, payload);
});

window.slopAPI.downloadPanelOverlay.onClosed(() => {
  downloadPanelOpen = false;
  els.downloadPanel?.classList.add("hidden");
  updateDownloadChrome();
});

/* ---------- Start ---------- */
renderIcons();
scheduleContentBoundsSync();
createTab(HOME);
refreshBrowseHistory();
refreshBookmarks();
refreshDownloads();

window.slopAPI.onHistoryChanged(() => {
  refreshBrowseHistory();
  for (const tab of tabs) {
    if (isHistoryPage(tab.url)) injectHistoryPage(tab);
  }
});

window.slopAPI.onDownloadChanged(() => {
  refreshDownloads();
  for (const tab of tabs) {
    if (isDownloadsPage(tab.url)) injectDownloadsPage(tab);
  }
});

window.slopAPI.onDownloadStarted((info) => {
  revealDownloadIndicator();
  attachDownloadFavicon(info)
    .then(() => refreshDownloads())
    .catch(() => {});
});
