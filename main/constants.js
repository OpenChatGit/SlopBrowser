/** Shared main-process constants. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

function clampZoomFactor(factor) {
  const n = Number(factor);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 100) / 100;
}

const SIDE_INTEGRATION_IDS = [
  "whatsapp",
  "telegram",
  "discord",
  "gmail",
  "instagram",
  "messenger",
];

const INTEGRATION_PERMISSIONS = new Set([
  "media",
  "mediaKeySystem",
  "geolocation",
  "notifications",
  "fullscreen",
  "pointerLock",
  "clipboard-read",
  "clipboard-sanitized-write",
]);

module.exports = {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  clampZoomFactor,
  SIDE_INTEGRATION_IDS,
  INTEGRATION_PERMISSIONS,
};
