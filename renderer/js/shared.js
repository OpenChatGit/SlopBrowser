/** Shared constants, DOM refs, and mutable renderer state. */
export const HOME = window.slopAPI.newTabURL;
export const HISTORY = window.slopAPI.historyURL;
export const DOWNLOADS = window.slopAPI.downloadsURL;
export const SETTINGS = window.slopAPI.settingsURL;
export const PARTITION = window.slopAPI.partition;
export const HISTORY_DISPLAY = "slop://history";
export const DOWNLOADS_DISPLAY = "slop://downloads";
export const SETTINGS_DISPLAY = "slop://settings";
export const HOME_ADDRESS_PLACEHOLDER = "Search the web";
export const DEFAULT_ADDRESS_PLACEHOLDER = "Search or enter address";
export const CHROME_UA = window.slopAPI.chromeUserAgent;

export const LOGO_SVG =
  '<svg class="logo-icon" viewBox="0 0 215 238" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M101.682 168.635C105.62 167.927 107.59 165.981 107.59 162.796C107.59 159.492 106.515 155.835 104.367 151.825C102.338 147.696 99.295 143.803 95.2373 140.146C84.6156 130.708 70.2345 125.99 52.0941 125.99C43.1432 125.99 34.7891 127.464 27.0316 130.413C18.7968 126.285 12.2329 119.737 7.33972 110.772C2.44657 101.806 0 92.1328 0 81.7517C0 54.6191 11.4571 33.6798 34.3714 18.9338C54.0633 6.31128 78.35 0 107.231 0C128.714 0 146.794 2.30037 161.474 6.90112C176.153 11.3839 188.147 17.1643 197.456 24.2424C200.201 32.0283 201.574 40.109 201.574 48.4848C201.574 56.8605 200.44 64.4694 198.172 71.3115C195.905 78.1537 192.623 83.6392 188.326 87.768C184.269 84.8188 176.929 81.8107 166.307 78.7435C155.686 75.6763 146.019 74.1428 137.306 74.1428C128.594 74.1428 122.746 74.6736 119.763 75.7353C116.898 76.797 115.466 78.4486 115.466 80.69C115.466 81.7517 115.645 82.7544 116.003 83.6981C120.18 82.6364 125.551 82.1056 132.115 82.1056C155.387 82.1056 174.363 87.5321 189.042 98.3851C206.347 111.362 215 130.826 215 156.779C215 179.665 205.631 198.658 186.894 213.758C166.606 229.919 139.335 238 105.083 238C86.2268 238 69.8765 236.584 56.0325 233.753C42.1885 231.04 28.7025 226.203 15.5745 219.243C6.62365 206.385 2.14821 193.349 2.14821 180.137C2.14821 166.806 6.74299 155.776 15.9326 147.047C25.1221 138.317 36.4002 133.952 49.7669 133.952C63.2528 133.952 74.2326 136.666 82.7061 142.092C91.2989 147.519 97.6242 156.366 101.682 168.635Z" fill="currentColor"/>' +
  "</svg>";

export const GLOBE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';

export const X_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.0;
export const ZOOM_DEFAULT = 1.0;

export const HISTORY_MAX = 100;
export const HISTORY_RECENT_MAX = 6;
export const BROWSE_HISTORY_MAX = 2000;
export const BOOKMARKS_MENU_MAX = 12;
export const DOWNLOADS_MENU_MAX = 6;
export const SLOPAI_CHATS_MENU_MAX = 6;
export const DOWNLOAD_RING_R = 15;
export const DOWNLOAD_RING_C = 2 * Math.PI * DOWNLOAD_RING_R;

export const SIDE_PANEL_MIN_W = 360;
export const SIDE_PANEL_MAX_RATIO = 0.5;
export const SIDE_PANEL_DEFAULT_W = 500;

export const els = {
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
  slopAiSubWrap: document.getElementById("slopAiSubWrap"),
  slopAiRecentList: document.getElementById("slopAiRecentList"),
  menuCluster: document.getElementById("menuCluster"),
  slopAiCloseChat: document.getElementById("slopAiCloseChat"),
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
  slopAiPanel: document.getElementById("slopAiPanel"),
  slopAiBody: document.getElementById("slopAiBody"),
  slopAiContextWrap: document.getElementById("slopAiContextWrap"),
  slopAiContextIcon: document.getElementById("slopAiContextIcon"),
  slopAiContextLabel: document.getElementById("slopAiContextLabel"),
  slopAiSummarizeWrap: document.getElementById("slopAiSummarizeWrap"),
  slopAiSummarize: document.getElementById("slopAiSummarize"),
  slopAiSummarizeIcon: document.getElementById("slopAiSummarizeIcon"),
  slopAiComposer: document.getElementById("slopAiComposer"),
  slopAiInput: document.getElementById("slopAiInput"),
  slopAiAppend: document.getElementById("slopAiAppend"),
  slopAiSend: document.getElementById("slopAiSend"),
  slopAiResize: document.getElementById("slopAiResize"),
  slopAiResizeShield: document.getElementById("slopAiResizeShield"),
  min: document.getElementById("min"),
  max: document.getElementById("max"),
  close: document.getElementById("close"),
};

export const filterUI = {
  slopEnabled: true,
  adBlockEnabled: true,
  totalSlopBlocked: 0,
  totalAdBlocked: 0,
};

export const tabAdCounts = new Map();
export const tabEls = new Map();
export const sidePanelWebviews = new Map();
export const sideWebviewLayout = new WeakMap();
export const bookmarkUrls = new Set();
export const sessionHistory = [];
export const closedTabs = [];

export function integrationFavicon(domain) {
  return (
    "https://www.google.com/s2/favicons?domain=" +
    encodeURIComponent(domain) +
    "&sz=64"
  );
}

export const SIDE_RAIL_ITEMS = [
  { id: "home", label: "Home", type: "tab", icon: "home" },
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
