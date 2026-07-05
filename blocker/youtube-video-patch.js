/*
 * YouTube in-player ad fallback — UI skip only.
 * Ad metadata stripping is handled by uBlock scriptlets (json-prune, brave-yt-sabr-fix).
 * Avoids fetch/JSON.parse hooks that break first-playback and SABR streaming.
 */
(function () {
  if (window.__slopYtVideoPatch) return;
  window.__slopYtVideoPatch = true;

  const HOST = location.hostname;
  if (
    !/\.?youtube\.com$/i.test(HOST) &&
    HOST !== "youtube-nocookie.com" &&
    HOST !== "youtubekids.com"
  ) {
    return;
  }

  const AD_PROPS = [
    "adPlacements",
    "adSlots",
    "playerAds",
    "adBreakHeartbeatParams",
    "adBreakParams",
    "playerAdParams",
  ];

  function stripAdFields(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const key of AD_PROPS) {
      if (!(key in obj)) continue;
      obj[key] = Array.isArray(obj[key]) ? [] : null;
    }
    if (obj.playerResponse && typeof obj.playerResponse === "object") {
      stripAdFields(obj.playerResponse);
    }
  }

  function guardPlayerGlobal(name) {
    let stored;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get() {
          return stored;
        },
        set(v) {
          stripAdFields(v);
          stored = v;
        },
      });
    } catch (_) {}
  }

  guardPlayerGlobal("ytInitialPlayerResponse");
  guardPlayerGlobal("ytInitialReelWatchSequenceResponse");

  function isAdPlaying(player) {
    if (!player?.classList.contains("ad-showing")) return false;
    return !!(
      document.querySelector(
        ".ytp-ad-player-overlay, .ytp-ad-text, .video-ads, .ytp-ad-preview-container"
      ) ||
      document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button")
    );
  }

  function skipAdUi() {
    const player = document.querySelector(".html5-video-player");
    if (!player || !isAdPlaying(player)) return;

    const skip = document.querySelector(
      ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button"
    );
    if (skip) {
      skip.click();
      return;
    }

    const mainVideo = document.querySelector("video.html5-main-video");
    const videos = document.querySelectorAll(".html5-video-player video");
    for (const vid of videos) {
      if (vid === mainVideo) continue;
      const dur = vid.duration;
      if (Number.isFinite(dur) && dur > 0 && dur < 600) {
        try {
          vid.currentTime = dur;
        } catch (_) {}
        return;
      }
    }

    if (mainVideo && Number.isFinite(mainVideo.duration) && mainVideo.duration > 0) {
      const adOverlay = document.querySelector(".ytp-ad-player-overlay");
      if (adOverlay) {
        try {
          mainVideo.currentTime = mainVideo.duration;
        } catch (_) {}
      }
    }
  }

  let skipPending = false;
  function scheduleSkipAdUi() {
    if (skipPending) return;
    skipPending = true;
    requestAnimationFrame(() => {
      skipPending = false;
      skipAdUi();
    });
  }

  const uiObs = new MutationObserver(scheduleSkipAdUi);
  function startUiObserver() {
    const root = document.documentElement || document.body;
    if (!root) return;
    uiObs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    scheduleSkipAdUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startUiObserver, { once: true });
  } else {
    startUiObserver();
  }

  setInterval(scheduleSkipAdUi, 1000);
})();
