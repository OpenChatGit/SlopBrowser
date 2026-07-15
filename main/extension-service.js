const path = require("path");

const { app, BrowserWindow } = require("electron");

const { ElectronChromeExtensions } = require("electron-chrome-extensions");

const {

  installChromeWebStore,

  installExtension: installStoreExtension,

  uninstallExtension: uninstallStoreExtension,

  updateExtensions: updateStoreExtensions,

} = require("electron-chrome-web-store");

const { sesFromPartition } = require("./session-config");



/** session storage path key -> ElectronChromeExtensions */

const bySession = new Map();

/** session storage path key -> Promise<void> */

const webStoreReady = new Map();



let tabHooks = null;

let mainTabIdSeq = 100000;



function extensionsDir() {

  return path.join(app.getPath("userData"), "extensions");

}



function initExtensionService(hooks) {

  tabHooks = hooks;

}



function sessionKey(sess) {

  return sess?.storagePath || "default";

}



function getExtensionsForSession(sess) {

  if (!sess) return null;

  return bySession.get(sessionKey(sess)) || null;

}



function ensureExtensions(sess) {

  if (!sess || !tabHooks) return null;

  const key = sessionKey(sess);

  let ext = bySession.get(key);

  if (ext) return ext;



  ElectronChromeExtensions.handleCRXProtocol(sess);



  ext = new ElectronChromeExtensions({

    license: "GPL-3.0",

    session: sess,

    async createTab(details) {

      const win =

        BrowserWindow.getFocusedWindow() ||

        BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ||

        null;

      if (!win) throw new Error("No browser window");

      const tabId = mainTabIdSeq++;

      const url = details?.url || tabHooks.getHomeURL?.() || "about:blank";

      const wc = tabHooks.createTabInWindow(win, {

        tabId,

        url,

        partition: tabHooks.partitionForWindow?.(win),

        activate: details?.active !== false,

      });

      if (!wc) throw new Error("Failed to create tab");

      return [wc, win];

    },

    selectTab(wc, win) {

      tabHooks.selectTabWebContents?.(wc, win);

    },

    removeTab(wc, win) {

      tabHooks.closeTabWebContents?.(wc, win);

    },

    createWindow() {

      return tabHooks.createWindow?.() || BrowserWindow.getAllWindows()[0];

    },

  });



  bySession.set(key, ext);

  return ext;

}



async function ensureWebStore(sess) {

  if (!sess) return;

  const key = sessionKey(sess);

  if (webStoreReady.has(key)) return webStoreReady.get(key);



  ensureExtensions(sess);



  const ready = installChromeWebStore({

    session: sess,

    extensionsPath: extensionsDir(),

    autoUpdate: true,

    loadExtensions: true,

    allowUnpackedExtensions: true,

    beforeInstall: async () => ({ action: "allow" }),

  }).catch((err) => {

    webStoreReady.delete(key);

    console.error("Chrome Web Store init failed:", err?.message || err);

    throw err;

  });



  webStoreReady.set(key, ready);

  return ready;

}



function registerTabWithExtensions(sess, wc, win) {

  const ext = ensureExtensions(sess);

  if (!ext || !wc || wc.isDestroyed()) return;

  ext.addTab(wc, win);

}



function unregisterTabWithExtensions(wc) {

  if (!wc || wc.isDestroyed()) return;

  const ext = getExtensionsForSession(wc.session);

  ext?.removeTab(wc);

}



function selectTabWithExtensions(wc) {

  if (!wc || wc.isDestroyed()) return;

  const ext = getExtensionsForSession(wc.session);

  ext?.selectTab(wc);

}



function extensionInfo(ext) {

  return {

    id: ext.id,

    name: ext.name,

    version: ext.manifest?.version || "",

    path: ext.path,

    description: ext.manifest?.description || "",

    fromWebStore: !!(ext.manifest?.update_url && ext.manifest?.key),

  };

}



async function loadExtension(partition, extensionPath) {

  const ses = sesFromPartition(partition);

  await ensureWebStore(ses);

  const ext = await ses.extensions.loadExtension(path.resolve(extensionPath));

  return extensionInfo(ext);

}



function listExtensions(partition) {

  const ses = sesFromPartition(partition);

  return ses.extensions.getAllExtensions().map(extensionInfo);

}



async function removeExtension(partition, extensionId) {

  const ses = sesFromPartition(partition);

  await ensureWebStore(ses);

  await uninstallStoreExtension(extensionId, {

    session: ses,

    extensionsPath: extensionsDir(),

  });

  return true;

}



async function installFromStore(partition, extensionId) {

  const ses = sesFromPartition(partition);

  await ensureWebStore(ses);

  const ext = await installStoreExtension(extensionId, {

    session: ses,

    extensionsPath: extensionsDir(),

  });

  return extensionInfo(ext);

}



async function updateAllExtensions(partition) {

  const ses = sesFromPartition(partition);

  await ensureWebStore(ses);

  await updateStoreExtensions(ses);

  return listExtensions(partition);

}



function registerExtensionIpc(ipcMain) {

  ipcMain.handle("extensions:load", async (_e, { partition, extensionPath } = {}) => {

    if (!partition || !extensionPath) return { ok: false, error: "Missing args" };

    try {

      const info = await loadExtension(partition, extensionPath);

      return { ok: true, extension: info };

    } catch (err) {

      return { ok: false, error: err?.message || String(err) };

    }

  });



  ipcMain.handle("extensions:list", (_e, partition) => {

    if (!partition) return [];

    return listExtensions(partition);

  });



  ipcMain.handle("extensions:remove", async (_e, { partition, extensionId } = {}) => {

    if (!partition || !extensionId) return false;

    try {

      return await removeExtension(partition, extensionId);

    } catch (_) {

      return false;

    }

  });



  ipcMain.handle("extensions:installFromStore", async (_e, { partition, extensionId } = {}) => {

    if (!partition || !extensionId) {

      return { ok: false, error: "Missing args" };

    }

    try {

      const info = await installFromStore(partition, String(extensionId).trim());

      return { ok: true, extension: info };

    } catch (err) {

      return { ok: false, error: err?.message || String(err) };

    }

  });



  ipcMain.handle("extensions:updateAll", async (_e, partition) => {

    if (!partition) return { ok: false, extensions: [] };

    try {

      const extensions = await updateAllExtensions(partition);

      return { ok: true, extensions };

    } catch (err) {

      return { ok: false, error: err?.message || String(err), extensions: [] };

    }

  });



  ipcMain.handle("extensions:getDir", () => extensionsDir());

}



module.exports = {

  initExtensionService,

  ensureExtensions,

  ensureWebStore,

  registerTabWithExtensions,

  unregisterTabWithExtensions,

  selectTabWithExtensions,

  registerExtensionIpc,

  extensionsDir,

};


