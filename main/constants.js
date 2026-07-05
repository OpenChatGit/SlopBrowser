/** Shared main-process constants. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

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
  SIDE_INTEGRATION_IDS,
  INTEGRATION_PERMISSIONS,
};
