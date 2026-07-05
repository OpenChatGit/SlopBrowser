const { session } = require("electron");
const { SIDE_INTEGRATION_IDS, INTEGRATION_PERMISSIONS } = require("./constants");

function chromeUserAgent(ua) {
  return ua
    .replace(/\s*SlopBrowser\/[^\s]*/g, "")
    .replace(/\s*Electron\/[^\s]*/g, "")
    .trim();
}

function sesFromPartition(partition) {
  return session.fromPartition(partition);
}

function sidePanelIdFromSession(sess) {
  try {
    const p = sess?.storagePath || "";
    const m = p.match(/slopbrowser-side-([^\\/]+)/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

function configureIntegrationSession(partition) {
  const ses = sesFromPartition(partition);
  const allow = (permission) => INTEGRATION_PERMISSIONS.has(permission);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allow(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allow(permission));
}

function configureIntegrationSessions() {
  for (const id of SIDE_INTEGRATION_IDS) {
    configureIntegrationSession(`persist:slopbrowser-side-${id}`);
  }
}

function applyChromeUserAgent(contents) {
  try {
    const ua = chromeUserAgent(contents.getUserAgent());
    if (ua) contents.setUserAgent(ua);
  } catch (_) {}
}

module.exports = {
  chromeUserAgent,
  sesFromPartition,
  sidePanelIdFromSession,
  configureIntegrationSessions,
  applyChromeUserAgent,
};
