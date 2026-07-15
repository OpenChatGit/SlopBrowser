/** Navigation history helpers (Electron 35+ navigationHistory API). */
function canGoBack(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    const nh = contents.navigationHistory;
    if (nh && typeof nh.canGoBack === "function") {
      return nh.canGoBack();
    }
  } catch (_) {}
  return false;
}

function canGoForward(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    const nh = contents.navigationHistory;
    if (nh && typeof nh.canGoForward === "function") {
      return nh.canGoForward();
    }
  } catch (_) {}
  return false;
}

module.exports = { canGoBack, canGoForward };
