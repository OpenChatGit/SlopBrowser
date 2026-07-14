/**
 * Browser chrome — tab UI, toolbar, menus, side rail.
 * Generated from renderer.js — do not edit; run npm run build:chrome.
 */
import {
  HOME,
  HISTORY,
  DOWNLOADS,
  SETTINGS,
  PARTITION,
  HOME_ADDRESS_PLACEHOLDER,
  DEFAULT_ADDRESS_PLACEHOLDER,
  HISTORY_DISPLAY,
  DOWNLOADS_DISPLAY,
  SETTINGS_DISPLAY,
  LOGO_SVG,
  GLOBE_SVG,
  X_SVG,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_DEFAULT,
  HISTORY_MAX,
  HISTORY_RECENT_MAX,
  BROWSE_HISTORY_MAX,
  BOOKMARKS_MENU_MAX,
  DOWNLOADS_MENU_MAX,
  SLOPAI_CHATS_MENU_MAX,
  DOWNLOAD_RING_R,
  DOWNLOAD_RING_C,
  SIDE_RAIL_ITEMS,
  CHROME_UA,
  SIDE_PANEL_MIN_W,
  SIDE_PANEL_MAX_RATIO,
  SIDE_PANEL_DEFAULT_W,
  els,
  filterUI,
  tabAdCounts,
  tabEls,
  sidePanelWebviews,
  sideWebviewLayout,
  bookmarkUrls,
  sessionHistory,
  closedTabs,
} from "../js/shared.js";

import {
  isHome,
  isHistoryPage,
  isDownloadsPage,
  isSettingsPage,
  displayURL,
  pickFavicon,
  faviconFallback,
  googleFavicon,
  hostFromUrl,
  escapeHTML,
  truncate,
  formatBytes,
  formatByteRange,
  renderIcons,
  updateRailIconSizes,
  toURL,
} from "../js/utils.js";

import { renderMarkdown, enhanceMarkdown } from "../js/markdown.js";

import { PAGE_CONTEXT_EXTRACTOR, buildSlopAiApiMessages } from "../js/page-context.js";

import { api } from "../js/registry.js";

let tabs = [];
let activeId = null;
let idSeq = 1;
let privateTabSeq = 0;
let browseHistory = [];
let savedBookmarks = [];
let activeSidePanelId = null;
let sideFitTimer = null;
let zoomHideTimer = null;


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
  if (!url || isHome(url) || isHistoryPage(url) || isDownloadsPage(url) || isSettingsPage(url))
    return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "file:";
  } catch (_) {
    return false;
  }
}

function isGoogleSearchPage(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const isGoogleHost =
      host === "google.com" ||
      host.endsWith(".google.com") ||
      /^google\.[a-z.]{2,10}$/.test(host);
    if (!isGoogleHost) return false;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return path === "/search" || path === "/" || path === "/webhp";
  } catch (_) {
    return false;
  }
}

function canSummarizePage(url) {
  return canBookmark(url) && !isGoogleSearchPage(url);
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

/* ---------- Favicons ---------- */
// Prefer a real .ico/.png/.svg favicon over apple-touch icons; take the first.
// Default favicon location for a site that didn't declare one in HTML.
/* ---------- Icons (Lucide) ---------- */
/* ---------- URL Helpers ---------- */
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
    "contextIsolation=yes,javascript=yes,sandbox=no"
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
  if (!isHome(tab.url) && !isHistoryPage(tab.url) && !isDownloadsPage(tab.url) && !isSettingsPage(tab.url)) {
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
  updateSlopAiSummarizeButton();
}

/*
 * Incremental tab rendering: each tab's DOM is built once and then only
 * updated in place. Rebuilding everything on each update caused favicon
 * <img> elements to be recreated constantly (flicker + reload delays).
 */

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

function wireWebview(tab) {
  const wv = tab.webview;

  wv.addEventListener("ipc-message", (e) => {
    if (e.channel === "slop:history") {
      handleHistoryGuestMessage(tab, e.args[0]).catch(() => {});
      return;
    }
    if (e.channel === "slop:downloads") {
      handleDownloadsGuestMessage(tab, e.args[0]).catch(() => {});
    }
  });

  const bindWebContentsId = () => {
    try {
      tab.webContentsId = wv.getWebContentsId();
      wv.setZoomFactor(tab.zoom ?? ZOOM_DEFAULT);
    } catch (_) {}
  };
  wv.addEventListener("dom-ready", () => {
    bindWebContentsId();
    if (isHistoryPage(tab.url)) injectHistoryPage(tab);
    if (isDownloadsPage(tab.url)) injectDownloadsPage(tab);
    if (isSettingsPage(tab.url)) injectSettingsPage(tab);
  });

  wv.addEventListener("did-finish-load", () => {
    if (isHistoryPage(tab.url)) injectHistoryPage(tab);
    if (isDownloadsPage(tab.url)) injectDownloadsPage(tab);
    if (isSettingsPage(tab.url)) injectSettingsPage(tab);
  });

  wv.addEventListener("page-title-updated", (e) => {
    const href = wv.getURL();
    const next = isHome(href)
      ? "Home"
      : isHistoryPage(href)
        ? "History"
        : isDownloadsPage(href)
          ? "Downloads"
          : isSettingsPage(href)
            ? "Settings"
            : e.title;
    if (next === tab.title) return;
    tab.title = next;
    updateTabPresentation(tab);
    if (tab.id === activeId) updateSlopAiSummarizeButton();
  });

  wv.addEventListener("page-favicon-updated", (e) => {
    const icon = pickFavicon(e.favicons);
    if (icon && icon !== tab.favicon) {
      tab.favicon = icon;
      updateTabPresentation(tab);
      syncDownloadFaviconsForTab(tab).catch(() => {});
      if (tab.id === activeId) updateSlopAiSummarizeButton();
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
    else if (isDownloadsPage(tab.url)) {
      tab.title = "Downloads";
      if (tab.id === activeId) dismissDownloadIndicator();
    } else if (isSettingsPage(tab.url)) tab.title = "Settings";
    pushSessionHistory(tab);
    if (tab.id === activeId) {
      syncAddressBar(tab.url);
      syncBookmarkButton(tab.url);
      updateNavButtons();
      updatePrivateChrome();
      updateTabPresentation(tab);
      updateSlopAiSummarizeButton();
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
      updateSlopAiSummarizeButton();
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
  if (isHome(tab.url) || isHistoryPage(tab.url) || isDownloadsPage(tab.url) || isSettingsPage(tab.url))
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
  if (!els.menu.classList.contains("hidden")) {
    renderHistorySubmenu();
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

async function injectDownloadsPage(tab) {
  let entries = [];
  try {
    entries = (await window.slopAPI.downloads.getAll()) || [];
  } catch (_) {}
  const payload = JSON.stringify(entries);
  tab.webview
    .executeJavaScript(
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
  tab.webview
    .executeJavaScript(
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
    Promise.resolve(tab.webview.loadURL(HISTORY)).catch(() => {});
    tab.webview.focus();
  } else {
    createTab(HISTORY);
  }
}

function openDownloadsPage() {
  dismissDownloadIndicator();
  toggleMenu(false);
  const tab = activeTab();
  if (tab) {
    Promise.resolve(tab.webview.loadURL(DOWNLOADS)).catch(() => {});
    tab.webview.focus();
  } else {
    createTab(DOWNLOADS);
  }
}

function openSettingsPage() {
  toggleMenu(false);
  const tab = activeTab();
  if (tab) {
    Promise.resolve(tab.webview.loadURL(SETTINGS)).catch(() => {});
    tab.webview.focus();
  } else {
    createTab(SETTINGS);
  }
}

function historyRecentItems() {
  const items = [];
  const seen = new Set();

  closedTabs.forEach((entry, i) => {
    if (items.length >= HISTORY_RECENT_MAX) return;
    if (!entry?.url || isHome(entry.url) || isHistoryPage(entry.url) || isDownloadsPage(entry.url) || isSettingsPage(entry.url)) return;
    seen.add(entry.url);
    items.push({ ...entry, closed: true, showShortcut: i === 0 });
  });

  for (const entry of browseHistory) {
    if (items.length >= HISTORY_RECENT_MAX) break;
    if (!entry?.url || isHome(entry.url) || isHistoryPage(entry.url) || isDownloadsPage(entry.url) || isSettingsPage(entry.url)) continue;
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
  els.downloadPanel?.classList.add("hidden");
  downloadPanelOpen = false;
  els.downloadWrap?.classList.add("hidden");
}

function closeDownloadPanel() {
  els.downloadPanel?.classList.add("hidden");
  downloadPanelOpen = false;
  dismissDownloadIndicator();
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
      if (isHome(t.url) || isHistoryPage(t.url) || isDownloadsPage(t.url) || isSettingsPage(t.url)) continue;
      if (hostFromUrl(t.url) === host) return t;
    }
  }
  if (entry.state === "progressing") {
    const a = activeTab();
    if (a && !isHome(a.url) && !isHistoryPage(a.url) && !isDownloadsPage(a.url) && !isSettingsPage(a.url)) {
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
    renderDownloadsSubmenu();
    if (downloadPanelOpen) renderDownloadPanel();
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
  if (!els.menu.classList.contains("hidden")) renderDownloadsSubmenu();
  if (downloadPanelOpen) renderDownloadPanel();
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

/* ---------- SlopAI chats (menu + panel) ---------- */
const SLOPAI_CHATS_KEY = "slop-ai-chats";
const SLOPAI_CHATS_MAX = 50;
let slopAiChats = [];
let activeSlopAiChatId = null;
let slopAiStreaming = false;
let slopAiStreamText = "";
let slopAiStreamContent = null;

function loadSlopAiChats() {
  try {
    const raw = JSON.parse(localStorage.getItem(SLOPAI_CHATS_KEY));
    slopAiChats = Array.isArray(raw)
      ? raw.filter((c) => c && c.id && c.title)
      : [];
  } catch (_) {
    slopAiChats = [];
  }
  slopAiChats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function saveSlopAiChats() {
  try {
    localStorage.setItem(
      SLOPAI_CHATS_KEY,
      JSON.stringify(slopAiChats.slice(0, SLOPAI_CHATS_MAX))
    );
  } catch (_) {}
}

function newSlopAiChatId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function slopAiChatHasMessages(chat) {
  return Array.isArray(chat?.messages) && chat.messages.length > 0;
}

function getOrCreateEmptySlopAiChat() {
  if (activeSlopAiChatId) {
    const active = slopAiChats.find((c) => c.id === activeSlopAiChatId);
    if (active && !slopAiChatHasMessages(active)) return active;
  }
  const empty = slopAiChats.find((c) => !slopAiChatHasMessages(c));
  if (empty) return empty;
  return createSlopAiChat();
}

function createSlopAiChat(title = "New chat") {
  const chat = {
    id: newSlopAiChatId(),
    title: String(title || "New chat").trim() || "New chat",
    updatedAt: Date.now(),
    messages: [],
  };
  slopAiChats.unshift(chat);
  if (slopAiChats.length > SLOPAI_CHATS_MAX) slopAiChats.length = SLOPAI_CHATS_MAX;
  saveSlopAiChats();
  return chat;
}

function touchSlopAiChat(id) {
  const chat = slopAiChats.find((c) => c.id === id);
  if (!chat) return null;
  chat.updatedAt = Date.now();
  slopAiChats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  saveSlopAiChats();
  return chat;
}

function chatTitleFromText(text) {
  const t = String(text || "").trim();
  if (!t) return "New chat";
  const line = t.split(/\n/)[0].trim();
  return line.length > 42 ? line.slice(0, 42) + "…" : line;
}

function clearSlopAiStreamUI() {
  slopAiStreamText = "";
  slopAiStreamContent = null;
}

function beginSlopAiStreamUI() {
  const list = slopAiMessagesEl();
  if (!list) return;
  list.querySelector(".slopai-msg-loading")?.remove();
  clearSlopAiStreamUI();
  const row = buildSlopAiMessageEl({ role: "assistant", text: "" });
  row.classList.add("slopai-msg-streaming");
  slopAiStreamContent = row.querySelector(".slopai-md");
  if (slopAiStreamContent) slopAiStreamContent.classList.add("slopai-md-streaming");
  list.appendChild(row);
  scrollSlopAiToBottom();
}

function appendSlopAiStream(delta) {
  if (!delta) return;
  slopAiStreamText += delta;
  if (slopAiStreamContent) slopAiStreamContent.textContent = slopAiStreamText;
  scrollSlopAiToBottom();
}

function finishSlopAiStreamUI() {
  if (slopAiStreamContent && slopAiStreamText) {
    slopAiStreamContent.classList.remove("slopai-md-streaming");
    slopAiStreamContent.textContent = "";
    slopAiStreamContent.innerHTML = renderMarkdown(slopAiStreamText);
    enhanceMarkdown(slopAiStreamContent);
    slopAiStreamContent.closest(".slopai-msg-streaming")?.classList.remove("slopai-msg-streaming");
  }
  clearSlopAiStreamUI();
}

function showSlopAiStreamError(message) {
  const list = slopAiMessagesEl();
  list?.querySelector(".slopai-msg-loading")?.remove();
  if (slopAiStreamContent) {
    slopAiStreamContent.classList.add("slopai-md-error");
    slopAiStreamContent.classList.remove("slopai-md-streaming");
    slopAiStreamContent.textContent = message;
    slopAiStreamContent.closest(".slopai-msg-streaming")?.classList.remove("slopai-msg-streaming");
  } else if (list) {
    list.appendChild(
      buildSlopAiMessageEl({
        role: "assistant",
        text: message,
        error: true,
      })
    );
  }
  clearSlopAiStreamUI();
  scrollSlopAiToBottom();
}

function slopAiStreamPromise(payload) {
  return new Promise((resolve, reject) => {
    let text = "";
    window.slopAPI.slopAi
      .stream(payload, {
        onChunk: (delta) => {
          if (!slopAiStreamContent) beginSlopAiStreamUI();
          appendSlopAiStream(delta);
        },
        onDone: (full) => {
          text = full || slopAiStreamText;
          resolve(text);
        },
        onError: (error) => reject(new Error(error || "Request failed")),
      })
      .then((res) => {
        if (!res?.ok && !text) reject(new Error(res?.error || "Request failed"));
      })
      .catch(reject);
  });
}

function scrollSlopAiToBottom() {
  const body = els.slopAiBody;
  if (!body) return;
  requestAnimationFrame(() => {
    body.scrollTop = body.scrollHeight;
  });
}

function slopAiMessagesEl() {
  if (!els.slopAiBody) return null;
  let list = els.slopAiBody.querySelector(".slopai-messages");
  if (!list) {
    els.slopAiBody.replaceChildren();
    list = document.createElement("div");
    list.className = "slopai-messages";
    els.slopAiBody.appendChild(list);
  }
  return list;
}

function buildSlopAiMessageEl(msg) {
  const row = document.createElement("div");
  if (msg.role === "user") {
    row.className = "slopai-msg slopai-msg-user";
    const bubble = document.createElement("div");
    bubble.className = "slopai-bubble";
    bubble.textContent = msg.text || "";
    row.appendChild(bubble);
    return row;
  }

  row.className = "slopai-msg slopai-msg-assistant";
  if (msg.role === "loading") {
    row.classList.add("slopai-msg-loading");
  }
  const content = document.createElement("div");
  content.className = "slopai-md";
  if (msg.role === "loading") {
    content.classList.add("slopai-typing");
    content.innerHTML =
      '<span class="slopai-dot"></span><span class="slopai-dot"></span><span class="slopai-dot"></span>';
    row.appendChild(content);
    return row;
  }
  if (msg.error) {
    content.classList.add("slopai-md-error");
    content.textContent = msg.text || "Something went wrong.";
  } else {
    content.innerHTML = renderMarkdown(msg.text || "");
    enhanceMarkdown(content);
  }
  row.appendChild(content);
  return row;
}

function renderSlopAiMessages(chat) {
  const list = slopAiMessagesEl();
  if (!list || !chat) return;
  list.replaceChildren();
  const msgs = Array.isArray(chat.messages) ? chat.messages : [];
  for (const m of msgs) {
    list.appendChild(buildSlopAiMessageEl(m));
  }
  if (slopAiStreaming) {
    list.appendChild(buildSlopAiMessageEl({ role: "loading" }));
  }
  scrollSlopAiToBottom();
}

function renderSlopAiPanel(chat) {
  if (els.slopAiInput) els.slopAiInput.value = "";
  updateSlopAiComposerSend();
  resizeSlopAiInput();
  if (chat) renderSlopAiMessages(chat);
  else if (els.slopAiBody) els.slopAiBody.replaceChildren();
}

function updateSlopAiComposerSend() {
  const btn = els.slopAiSend;
  const input = els.slopAiInput;
  if (!btn || !input) return;
  const hasText = !!input.value.trim();
  const canSend = hasText && !slopAiStreaming;
  btn.disabled = !canSend;
  btn.classList.toggle("ready", canSend);
}

function resizeSlopAiInput() {
  const input = els.slopAiInput;
  if (!input) return;
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
}

function fillSlopAiTabIcon(wrap, tab) {
  if (!wrap || !tab) return;
  wrap.replaceChildren();
  wrap.classList.remove("slopai-summarize-icon-fallback");

  const candidates = [];
  const push = (url) => {
    if (url && !candidates.includes(url)) candidates.push(url);
  };
  push(tab.favicon);
  push(faviconFallback(tab.url));

  if (!candidates.length) {
    wrap.classList.add("slopai-summarize-icon-fallback");
    wrap.innerHTML = GLOBE_SVG;
    return;
  }

  const img = document.createElement("img");
  img.className = "slopai-summarize-icon-img";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  let idx = 0;
  img.onerror = () => {
    idx += 1;
    if (idx < candidates.length) {
      img.src = candidates[idx];
      return;
    }
    wrap.classList.add("slopai-summarize-icon-fallback");
    wrap.innerHTML = GLOBE_SVG;
  };
  img.src = candidates[0];
  wrap.appendChild(img);
}

function fillSlopAiSummarizeIcon(tab) {
  fillSlopAiTabIcon(els.slopAiSummarizeIcon, tab);
}

async function extractSlopAiPageContext(tab) {
  if (!tab?.webview || !canSummarizePage(tab.url)) return null;
  try {
    const raw = await tab.webview.executeJavaScript(PAGE_CONTEXT_EXTRACTOR, true);
    if (!raw || typeof raw !== "object") return null;
    return {
      title: String(raw.title || tab.title || "").trim(),
      url: String(raw.url || tab.url || "").trim(),
      description: String(raw.description || "").trim(),
      text: String(raw.text || "").trim(),
      truncated: !!raw.truncated,
      extractedAt: Date.now(),
    };
  } catch (_) {
    return null;
  }
}

function updateSlopAiContextUI() {
  const wrap = els.slopAiContextWrap;
  if (!wrap) return;
  const tab = activeTab();
  const show = slopAiPanelOpen && !!(tab && canSummarizePage(tab.url));
  wrap.classList.toggle("hidden", !show);
  if (!show) return;
  fillSlopAiTabIcon(els.slopAiContextIcon, tab);
  const label = els.slopAiContextLabel;
  if (label) label.textContent = tab.title || "Current page";
  wrap.title = tab.url || "AI has context from this page";
}

function updateSlopAiSummarizeButton() {
  const wrap = els.slopAiSummarizeWrap;
  if (!wrap) return;
  const tab = activeTab();
  const show = slopAiPanelOpen && !!(tab && canSummarizePage(tab.url));
  wrap.classList.toggle("hidden", !show);
  if (show) fillSlopAiSummarizeIcon(tab);
  updateSlopAiContextUI();
}

async function summarizeSlopAiPageContent() {
  const tab = activeTab();
  if (!tab || !canSummarizePage(tab.url) || slopAiStreaming) return;
  if (!activeSlopAiChatId) openSlopAiChat();
  if (!activeSlopAiChatId) return;
  await sendSlopAiMessage("Summarize the content of this page.");
}

async function sendSlopAiMessage(presetText) {
  const input = els.slopAiInput;
  if (slopAiStreaming) return;
  const text = (typeof presetText === "string" ? presetText : input?.value || "").trim();
  if (!text) return;
  if (!activeSlopAiChatId) openSlopAiChat();
  if (!activeSlopAiChatId) return;
  const chat = slopAiChats.find((c) => c.id === activeSlopAiChatId);
  if (!chat) return;

  if (!Array.isArray(chat.messages)) chat.messages = [];
  chat.messages.push({ role: "user", text, at: Date.now() });
  if (!chat.title || chat.title === "New chat") {
    chat.title = chatTitleFromText(text);
  }
  saveSlopAiChats();
  touchSlopAiChat(activeSlopAiChatId);

  if (typeof presetText !== "string" && input) {
    input.value = "";
    resizeSlopAiInput();
  }
  updateSlopAiComposerSend();
  renderSlopAiMessages(chat);

  slopAiStreaming = true;
  updateSlopAiComposerSend();
  renderSlopAiMessages(chat);

  const tab = activeTab();
  const pageContext = await extractSlopAiPageContext(tab);
  const apiMessages = buildSlopAiApiMessages(
    chat.messages.filter((m) => (m.role === "user" || m.role === "assistant") && !m.error),
    pageContext
  );

  beginSlopAiStreamUI();

  try {
    const reply = await slopAiStreamPromise({ messages: apiMessages });
    finishSlopAiStreamUI();
    chat.messages.push({ role: "assistant", text: reply, at: Date.now() });
    saveSlopAiChats();
    touchSlopAiChat(activeSlopAiChatId);
  } catch (err) {
    const message = err?.message || "Something went wrong.";
    showSlopAiStreamError(message);
    chat.messages.push({
      role: "assistant",
      text: message,
      error: true,
      at: Date.now(),
    });
    saveSlopAiChats();
  } finally {
    slopAiStreaming = false;
    updateSlopAiComposerSend();
    if (!els.menu.classList.contains("hidden")) renderSlopAiSubmenu();
  }
}

function focusSlopAiComposer() {
  requestAnimationFrame(() => els.slopAiInput?.focus());
}

function updateSlopAiChrome() {
  const btn = els.slopAiCloseChat;
  if (!btn) return;
  btn.classList.toggle("visible", slopAiPanelOpen);
  btn.setAttribute("aria-hidden", slopAiPanelOpen ? "false" : "true");
  if (slopAiPanelOpen) {
    renderIcons(btn);
    renderIcons(els.slopAiComposer);
  }
  updateSlopAiSummarizeButton();
}

function switchSlopAiChat(id) {
  loadSlopAiChats();
  const chat = touchSlopAiChat(id) || slopAiChats.find((c) => c.id === id);
  if (!chat) return;
  activeSlopAiChatId = chat.id;
  renderSlopAiPanel(chat);
  if (!slopAiPanelOpen) {
    toggleSlopAiPanel(true);
  } else {
    updateSlopAiChrome();
    focusSlopAiComposer();
  }
  if (!els.menu.classList.contains("hidden")) renderSlopAiSubmenu();
}

function openSlopAiChat(id) {
  loadSlopAiChats();
  let chat = null;
  if (id) {
    chat = touchSlopAiChat(id) || slopAiChats.find((c) => c.id === id);
  } else {
    chat = getOrCreateEmptySlopAiChat();
  }
  if (!chat) return;

  activeSlopAiChatId = chat.id;
  renderSlopAiPanel(chat);
  if (slopAiPanelOpen) {
    updateSlopAiChrome();
    focusSlopAiComposer();
  } else {
    toggleSlopAiPanel(true);
  }
  if (!els.menu.classList.contains("hidden")) renderSlopAiSubmenu();
}

function slopAiRecentItems() {
  loadSlopAiChats();
  return slopAiChats.slice(0, SLOPAI_CHATS_MENU_MAX);
}

function removeSlopAiChat(id) {
  const sid = String(id || "");
  if (!sid) return;
  loadSlopAiChats();
  const before = slopAiChats.length;
  slopAiChats = slopAiChats.filter((c) => c.id !== sid);
  if (slopAiChats.length === before) return;
  saveSlopAiChats();

  const wasActive = activeSlopAiChatId === sid;
  if (wasActive) {
    const next = slopAiChats[0];
    if (next) {
      switchSlopAiChat(next.id);
    } else {
      activeSlopAiChatId = null;
      closeSlopAiPanel();
    }
  }

  requestAnimationFrame(() => {
    if (!els.menu.classList.contains("hidden")) renderSlopAiSubmenu();
    keepSubmenuOpen(els.slopAiSubWrap);
  });
}

function scheduleRemoveSlopAiChat(id) {
  requestAnimationFrame(() => removeSlopAiChat(id));
}

function renderSlopAiSubmenu() {
  const list = els.slopAiRecentList;
  if (!list) return;
  list.replaceChildren();
  const items = slopAiRecentItems();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "menu-submenu-empty";
    empty.textContent = "No chats yet";
    list.appendChild(empty);
    return;
  }

  for (const chat of items) {
    const row = document.createElement("div");
    row.className = "menu-recent-row";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item menu-recent";
    btn.dataset.action = "slopai-open-chat-id";
    btn.dataset.id = chat.id;
    btn.setAttribute("role", "menuitem");

    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-recent-icon-wrap menu-recent-fallback slopai-menu-icon";
    iconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    const label = document.createElement("span");
    label.className = "menu-recent-label";
    label.textContent = truncate(chat.title, 32);

    btn.appendChild(iconWrap);
    btn.appendChild(label);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "menu-recent-delete";
    del.dataset.action = "slopai-delete-chat";
    del.dataset.id = chat.id;
    del.title = "Delete chat";
    del.setAttribute("aria-label", "Delete chat");
    del.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';

    row.appendChild(btn);
    row.appendChild(del);
    list.appendChild(row);
  }
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
  const panel = els.downloadPanel;
  const wrap = els.downloadWrap;
  if (!panel || !wrap) return;

  const show = force ?? panel.classList.contains("hidden");

  if (show) {
    downloadPanelOpen = true;
    wrap.classList.remove("hidden");
    toggleMenu(false);
    toggleSlopPanel(false);
    refreshDownloads();
    panel.classList.remove("hidden");
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
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === "downloads-cancel" && id) {
    window.slopAPI.downloads.cancel(id).catch(() => {});
  } else if (action === "downloads-open-file" && id) {
    window.slopAPI.downloads.open(id).catch(() => {});
  } else if (action === "downloads-show-folder" && id) {
    window.slopAPI.downloads.showInFolder(id).catch(() => {});
  }
});

/* ---------- Menu (dropdown) ---------- */
function toggleMenu(force) {
  const show = force ?? els.menu.classList.contains("hidden");
  if (show) {
    toggleSlopPanel(false);
    closeDownloadPanel();
    renderHistorySubmenu();
    renderBookmarksSubmenu();
    renderDownloadsSubmenu();
    renderSlopAiSubmenu();
    renderIcons(els.menu);
  } else {
    els.historySubWrap?.classList.remove("sub-open");
    els.bookmarksSubWrap?.classList.remove("sub-open");
    els.downloadsSubWrap?.classList.remove("sub-open");
    els.slopAiSubWrap?.classList.remove("sub-open");
  }
  els.menu.classList.toggle("hidden", !show);
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
wireSubmenuHover(els.slopAiSubWrap, () => renderSlopAiSubmenu());

els.menu.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;
  const action = item.dataset.action;
  if (
    action === "history" ||
    action === "bookmarks" ||
    action === "downloads" ||
    action === "slopai"
  )
    return;
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
  if (action === "downloads-open-page") {
    openDownloadsPage();
    toggleMenu(false);
    return;
  }
  if (action === "downloads-open-file") {
    dismissDownloadIndicator();
    const id = item.dataset.id;
    if (id) window.slopAPI.downloads.open(id).catch(() => {});
    toggleMenu(false);
    return;
  }
  if (action === "slopai-open-chat") {
    openSlopAiChat();
    toggleMenu(false);
    return;
  }
  if (action === "slopai-open-chat-id") {
    openSlopAiChat(item.dataset.id);
    toggleMenu(false);
    return;
  }
  if (action === "newtab") createTab(HOME);
  else if (action === "newwindow") window.slopAPI.newWindow({});
  else if (action === "newprivate") createTab(HOME, { private: true });
  else if (action === "reload") reloadActiveTab();
  else if (action === "cookies") openCookieManager();
  else if (action === "togglesidebar")
    setRailCollapsed(!document.body.classList.contains("rail-collapsed"));
  else if (action === "devtools")
    activeTab() && activeTab().webview.openDevTools();
  else if (action === "settings") {
    openSettingsPage();
    return;
  }
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
    downloadPanelOpen &&
    !e.target.closest("#downloadWrap")
  ) {
    closeDownloadPanel();
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
    els.downloadsSubWrap?.classList.remove("sub-open");
    els.slopAiSubWrap?.classList.remove("sub-open");
    closeDownloadPanel();
    toggleSlopPanel(false);
    toggleSlopAiPanel(false);
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
let slopAiResizeActive = false;
let windowResizeTimer = null;

setSidePanelWidth(getSidePanelWidth());

if (els.sidePanelViews) {
  new ResizeObserver(() => {
    if (sidePanelResizeActive) return;
    fitActiveSideWebview();
  }).observe(els.sidePanelViews);
}

window.addEventListener("resize", () => {
  if (sidePanelResizeActive || slopAiResizeActive) return;
  clearTimeout(windowResizeTimer);
  windowResizeTimer = setTimeout(() => {
    setSidePanelWidth(getSidePanelWidth());
    setSlopAiPanelWidth(getSlopAiPanelWidth());
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

/* ---------- SlopAI panel (right sidebar) ---------- */
const SLOPAI_PANEL_MIN_W = 300;
const SLOPAI_PANEL_MAX_RATIO = 0.45;
const SLOPAI_PANEL_DEFAULT_W = 380;
let slopAiPanelOpen = false;

function getSlopAiPanelWidth() {
  try {
    const w = parseInt(localStorage.getItem("slop-slopai-panel-width"), 10);
    return Number.isFinite(w) ? w : SLOPAI_PANEL_DEFAULT_W;
  } catch (_) {
    return SLOPAI_PANEL_DEFAULT_W;
  }
}

function clampSlopAiPanelWidth(px) {
  const max = Math.max(SLOPAI_PANEL_MIN_W, Math.floor(window.innerWidth * SLOPAI_PANEL_MAX_RATIO));
  return Math.max(SLOPAI_PANEL_MIN_W, Math.min(max, px));
}

function setSlopAiPanelWidth(px, opts = {}) {
  const w = clampSlopAiPanelWidth(px);
  document.documentElement.style.setProperty("--slopai-panel-width", w + "px");
  if (!opts.skipPersist) {
    try {
      localStorage.setItem("slop-slopai-panel-width", String(w));
    } catch (_) {}
  }
  return w;
}

function closeSlopAiPanel() {
  if (!els.slopAiPanel) return;
  if (slopAiResizeActive) endSlopAiPanelResize();
  els.slopAiPanel.classList.add("hidden");
  if (els.slopAiResizeShield) els.slopAiResizeShield.classList.add("hidden");
  slopAiPanelOpen = false;
  updateSlopAiChrome();
  window.slopAPI.setWebviewsPointerPassthrough(false).catch(() => {});
}

function toggleSlopAiPanel(force) {
  if (!els.slopAiPanel) return;
  const show = force ?? els.slopAiPanel.classList.contains("hidden");
  if (show) {
    toggleMenu(false);
    closeDownloadPanel();
    toggleSlopPanel(false);
    els.slopAiPanel.classList.remove("hidden");
    slopAiPanelOpen = true;
    updateSlopAiChrome();
    focusSlopAiComposer();
    return;
  }
  closeSlopAiPanel();
}

function endSlopAiPanelResize() {
  if (!slopAiResizeActive) return;
  slopAiResizeActive = false;
  document.body.classList.remove("slopai-panel-resizing");
  if (els.slopAiResizeShield) {
    els.slopAiResizeShield.classList.add("hidden");
  }
  window.slopAPI.setWebviewsPointerPassthrough(false).catch(() => {});
  setSlopAiPanelWidth(els.slopAiPanel.offsetWidth);
}

function beginSlopAiPanelResize(e) {
  if (e.button !== 0 || slopAiResizeActive) return;
  e.preventDefault();
  e.stopPropagation();

  slopAiResizeActive = true;
  const pointerId = e.pointerId;
  const startX = e.clientX;
  const startW = els.slopAiPanel.offsetWidth;
  const shield = els.slopAiResizeShield;

  document.body.classList.add("slopai-panel-resizing");
  if (shield) shield.classList.remove("hidden");
  window.slopAPI.setWebviewsPointerPassthrough(true).catch(() => {});

  const onMove = (ev) => {
    if (!slopAiResizeActive || ev.pointerId !== pointerId) return;
    setSlopAiPanelWidth(startW + (startX - ev.clientX), { skipPersist: true });
  };

  const onEnd = (ev) => {
    if (ev.type === "pointerup" && ev.pointerId !== pointerId) return;
    for (const el of [els.slopAiResize, shield]) {
      if (!el) continue;
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("pointercancel", onEnd);
      el.removeEventListener("lostpointercapture", onEnd);
    }
    window.removeEventListener("blur", onEnd);
    try {
      els.slopAiResize.releasePointerCapture(pointerId);
    } catch (_) {}
    endSlopAiPanelResize();
  };

  for (const el of [els.slopAiResize, shield]) {
    if (!el) continue;
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", onEnd);
    el.addEventListener("lostpointercapture", onEnd);
  }
  window.addEventListener("blur", onEnd, { once: true });

  try {
    els.slopAiResize.setPointerCapture(pointerId);
  } catch (_) {}
}

setSlopAiPanelWidth(getSlopAiPanelWidth());
updateSlopAiComposerSend();
els.slopAiCloseChat?.addEventListener("click", (e) => {
  e.stopPropagation();
  closeSlopAiPanel();
});

els.slopAiRecentList?.addEventListener("mousedown", (e) => {
  const delBtn = e.target.closest("[data-action='slopai-delete-chat']");
  if (!delBtn) return;
  e.preventDefault();
  e.stopPropagation();
  scheduleRemoveSlopAiChat(delBtn.dataset.id);
});

els.slopAiSummarize?.addEventListener("click", () => {
  summarizeSlopAiPageContent();
});

els.slopAiComposer?.addEventListener("submit", (e) => {
  e.preventDefault();
  sendSlopAiMessage();
});

els.slopAiInput?.addEventListener("input", () => {
  updateSlopAiComposerSend();
  resizeSlopAiInput();
});

els.slopAiInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendSlopAiMessage();
  }
});

if (els.slopAiResize) {
  els.slopAiResize.addEventListener("pointerdown", beginSlopAiPanelResize);
}

setRailCollapsed(loadRailCollapsed());
renderSideRail();


export function startChrome() {
  renderIcons();
  createTab(HOME);
  refreshBrowseHistory();
  refreshBookmarks();
  refreshDownloads();
  loadSlopAiChats();
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
}

Object.assign(api, {
  createTab,
  setActive,
  activeTab,
  closeTab,
  updateTabPresentation,
  renderTabs,
  reloadActiveTab,
  openHistoryPage,
  openDownloadsPage,
  openRecentUrl,
  reopenClosedTab,
  toggleMenu,
  toggleSlopPanel,
  toggleCookieManager,
  openCookieManager,
  setRailCollapsed,
  renderSideRail,
  openSidePanel,
  closeSidePanel,
  fitActiveSideWebview,
  toggleSlopAiPanel,
  closeSlopAiPanel,
  openSlopAiChat,
  bookmarkThisTab,
  bookmarkAllTabs,
});
