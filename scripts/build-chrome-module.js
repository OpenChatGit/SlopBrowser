/**
 * Converts renderer.js into an ES module using shared.js + utils.js imports.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "renderer", "renderer.js");
const SHARED = path.join(ROOT, "renderer", "js", "shared.js");
const UTILS = path.join(ROOT, "renderer", "js", "utils.js");
const OUT = path.join(ROOT, "renderer", "chrome", "index.js");

function parseExports(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const names = [];
  const re = /^export (?:const|function|async function) (\w+)/gm;
  let m;
  while ((m = re.exec(src))) names.push(m[1]);
  return names;
}

function stripFunctionDeclaration(body, name) {
  const re = new RegExp(`^(?:async )?function ${name}\\s*\\([^)]*\\)\\s*\\{`, "m");
  for (;;) {
    const match = re.exec(body);
    if (!match) break;
    const start = match.index;
    let i = start + match[0].length;
    let depth = 1;
    while (i < body.length && depth > 0) {
      const ch = body[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    while (i < body.length && body[i] === "\n") i++;
    body = body.slice(0, start) + body.slice(i);
  }
  return body;
}

function stripBindingDeclaration(body, name) {
  return body.replace(new RegExp(`^(?:const|let|var) ${name}\\b[^\\n]*\\n`, "gm"), "");
}

function stripMultilineConstFrom(body, startPattern, endPattern) {
  const re = new RegExp(startPattern + "[\\s\\S]*?" + endPattern, "m");
  return body.replace(re, "");
}

const sharedExports = parseExports(SHARED);
const utilsExports = parseExports(UTILS);

let body = fs.readFileSync(SRC, "utf8");
body = body.replace(/\r\n/g, "\n");

body = body.replace(/^\/\*[\s\S]*?\*\/\n/, "");
body = body.replace(/^"use strict";\n\n/, "");

// Large blocks moved to shared.js (multiline consts / arrays).
body = stripMultilineConstFrom(
  body,
  "^const HOME = window",
  "^const X_SVG =[\\s\\S]*?<\\/svg>';\\n"
);
body = stripMultilineConstFrom(
  body,
  "^const els = \\{",
  "^\\};\\n\\n/\\*\\* Per-tab blocked ad count \\(tab id -> number\\)\\. \\*/\\n"
);
body = stripMultilineConstFrom(
  body,
  "\\/\\* ---------- Side rail",
  "^const SIDE_RAIL_ITEMS = \\[[\\s\\S]*?\\];\\n"
);
body = body.replace(
  /\/\* ---------- Side rail[\s\S]*?\];?\n/m,
  "/* ---------- Side rail (items in shared.js) ---------- */\n\n"
);
body = stripMultilineConstFrom(
  body,
  "^let activeSidePanelId = null;",
  "^let zoomHideTimer = null;\\n"
);

body = body.replace(/\/\* ---------- Start ----------[\s\S]*$/m, "");

// Remove any remaining bindings / functions that live in shared.js or utils.js.
const importedNames = [...new Set([...sharedExports, ...utilsExports])];
for (const name of importedNames) {
  body = stripBindingDeclaration(body, name);
  body = stripFunctionDeclaration(body, name);
}

// State declared in the generated module header (not imported).
const HEADER_STATE = [
  "tabs",
  "activeId",
  "idSeq",
  "privateTabSeq",
  "browseHistory",
  "savedBookmarks",
  "activeSidePanelId",
  "boundsRaf",
  "zoomHideTimer",
];

for (const name of HEADER_STATE) {
  body = stripBindingDeclaration(body, name);
}

// Collapse excessive blank lines.
body = body.replace(/\n{3,}/g, "\n\n");

for (const name of importedNames) {
  const fnRe = new RegExp(`^(?:async )?function ${name}\\b`, "m");
  const bindingRe = new RegExp(`^(?:const|let|var) ${name}\\b`, "m");
  if (fnRe.test(body) || bindingRe.test(body)) {
    console.error(
      `build-chrome-module: duplicate "${name}" still in body — check strip rules`
    );
    process.exit(1);
  }
}

const header = `/**
 * Browser chrome — tab UI, toolbar, menus, side rail.
 * Generated from renderer.js — do not edit; run npm run build:chrome.
 */
import {
  HOME,
  HISTORY,
  DOWNLOADS,
  COOKIES,
  SETTINGS,
  PARTITION,
  HOME_ADDRESS_PLACEHOLDER,
  DEFAULT_ADDRESS_PLACEHOLDER,
  HISTORY_DISPLAY,
  DOWNLOADS_DISPLAY,
  COOKIES_DISPLAY,
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
  bookmarkUrls,
  sessionHistory,
  closedTabs,
} from "../js/shared.js";

import {
  isHome,
  isHistoryPage,
  isDownloadsPage,
  isCookiesPage,
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

import { api } from "../js/registry.js";

let tabs = [];
let activeId = null;
let idSeq = 1;
let privateTabSeq = 0;
let browseHistory = [];
let savedBookmarks = [];
let activeSidePanelId = null;
let boundsRaf = null;
let zoomHideTimer = null;

`;

const footer = `
export function startChrome() {
  renderIcons();
  scheduleContentBoundsSync();
  bootSession().catch(() => createTab(HOME));
  refreshBrowseHistory();
  refreshBookmarks();
  refreshDownloads();
  window.slopAPI.sessionRestoreOverlay?.onAction?.((payload) => {
    const action = payload?.action;
    if (action === "session-restore-yes") {
      acceptSessionRestore().catch(() => {});
      return;
    }
    if (action === "session-restore-no") {
      declineSessionRestore().catch(() => {});
    }
  });
  window.addEventListener("resize", () => {
    refreshSessionRestoreNoticePosition();
  });
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
  openCookiesPage,
  openRecentUrl,
  reopenClosedTab,
  toggleMenu,
  toggleSlopPanel,
  setRailCollapsed,
  renderSideRail,
  openSidePanel,
  closeSidePanel,
  fitActiveSidePanel,
  bookmarkThisTab,
  bookmarkAllTabs,
});
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, header + body + footer);
console.log("Wrote", OUT);
