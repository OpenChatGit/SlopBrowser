const path = require("path");
const { BrowserWindow } = require("electron");

let privateSeq = 0;

function createWindow({ isDev = false } = {}) {
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
        webviewTag: true,
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

    return win;
  };
}

module.exports = { createWindow };
