/** URL, favicon, icon, and string helpers. */
import { HOME, HISTORY } from "./shared.js";

export function isHome(url) {
  if (!url) return true;
  try {
    const homePath = new URL(HOME).pathname;
    return new URL(url).pathname === homePath;
  } catch (_) {
    const base = HOME.split("?")[0];
    return url === HOME || url.startsWith(base);
  }
}

export function isHistoryPage(url) {
  if (!url) return false;
  try {
    return new URL(url).pathname === new URL(HISTORY).pathname;
  } catch (_) {
    const base = HISTORY.split("?")[0];
    return url === HISTORY || url.startsWith(base);
  }
}

export function displayURL(url) {
  if (isHistoryPage(url)) return "slop://history";
  return url;
}

export function pickFavicon(favicons) {
  if (!favicons || !favicons.length) return null;
  const preferred = favicons.find((u) =>
    /\.(ico|png|svg|gif|jpg|jpeg|webp)(\?|$)/i.test(u)
  );
  return preferred || favicons[0];
}

export function faviconFallback(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin + "/favicon.ico";
  } catch (_) {
    return null;
  }
}

export function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function truncate(s, max = 80) {
  const t = String(s ?? "");
  return t.length <= max ? t : t.slice(0, max) + "…";
}

export function renderIcons(root) {
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

export function updateRailIconSizes(btn) {
  const active = btn.classList.contains("active");
  const size = active ? "24" : "20";
  btn.querySelectorAll("svg").forEach((svg) => {
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
  });
}

export function toURL(input) {
  const raw = input.trim();
  if (!raw) return HOME;
  const low = raw.toLowerCase();
  if (low === "home" || low === "https://home" || low === "slop://home") {
    return HOME;
  }
  if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) {
    return "file:///" + raw.replace(/\\/g, "/");
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(raw)) return "http://" + raw;
  if (!raw.includes(" ")) {
    const host = raw.split(/[/?#]/)[0];
    const isIp = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host);
    const isDomain =
      /^[^\s.]+(\.[^\s.]+)+(:\d+)?$/.test(host) &&
      /\.[a-z]{2,}(:\d+)?$/i.test(host);
    if (isIp || isDomain) return "https://" + raw;
  }
  return "https://www.google.com/search?q=" + encodeURIComponent(raw);
}
