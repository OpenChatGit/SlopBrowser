function sourceUrlFromDownload(webContents, item) {
  try {
    if (webContents && !webContents.isDestroyed()) {
      const page = webContents.getURL();
      if (page && /^https?:/i.test(page)) return page;
    }
  } catch (_) {}

  try {
    const ref = typeof item.getReferrer === "function" ? item.getReferrer() : "";
    if (ref && /^https?:/i.test(ref)) return ref;
  } catch (_) {}

  try {
    const dl = item.getURL();
    const u = new URL(dl);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (_) {}

  return "";
}

function faviconFromPageUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return (
      "https://www.google.com/s2/favicons?domain=" +
      encodeURIComponent(u.hostname) +
      "&sz=64"
    );
  } catch (_) {
    return "";
  }
}

module.exports = { sourceUrlFromDownload, faviconFromPageUrl };
