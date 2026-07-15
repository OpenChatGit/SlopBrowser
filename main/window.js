const path = require("path");
const { BrowserWindow } = require("electron");
const { initWindowTabs } = require("./tab-manager");
const { initWindowSidePanels } = require("./side-panel-manager");
const { initMenuOverlay } = require("./menu-overlay");

let privateSeq = 0;

function createWindow({ isDev = false, tabDeps = null } = {}) {
  return function create(opts = {}) {
    const isPrivate = !!opts.private;
    const partition = isPrivate
      ? "slopbrowser-private-" + ++privateSeq
      : "persist:slopbrowser";

    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 800,
      minHeight: 500,
      backgroundColor: "#000000",
      title: "SlopBrowser",
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload-chrome.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"), {
      query: {
        partition,
        private: isPrivate ? "1" : "",
      },
    });

    const sendMaxState = () => {
      if (!win.isDestroyed()) {
        win.webContents.send("window:maximized", win.isMaximized());
      }
    };
    win.on("maximize", sendMaxState);
    win.on("unmaximize", sendMaxState);

    if (isDev) {
      win.webContents.openDevTools({ mode: "detach" });
    }

    if (tabDeps) {
      initWindowTabs(win, { ...tabDeps, partition });
      initWindowSidePanels(win);
      initMenuOverlay(win);
    }

    return win;
  };
}

module.exports = { createWindow };
