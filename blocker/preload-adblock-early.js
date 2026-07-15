/*
 * Runs via session.registerPreloadScript before the page preload — hides ad
 * placeholders and runs scriptlets before first paint when possible.
 */
"use strict";

const { ipcRenderer } = require("electron");

const STYLE_ID = "slop-cosmetic-css";
const EARLY_FLAG = "__slopCosmeticsEarly";

function injectPageScript(code) {
  if (!code) return;
  const doc = document;
  const run = () => {
    const root = doc.documentElement;
    const parent = root || doc.head || doc.body;
    if (!parent) return false;
    const s = doc.createElement("script");
    s.textContent = code;
    const first = root?.firstChild;
    if (first) parent.insertBefore(s, first);
    else parent.appendChild(s);
    s.remove();
    return true;
  };
  if (run()) return;
  const poll = setInterval(() => {
    if (run()) clearInterval(poll);
  }, 0);
  setTimeout(() => clearInterval(poll), 15000);
}

function injectHideCss(selectors) {
  if (!selectors?.length) return;
  const root = document.documentElement;
  if (!root) return;
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    el.setAttribute("type", "text/css");
    root.appendChild(el);
  }
  const rules = selectors.map((sel) => `${sel}{display:none!important;}`);
  el.textContent = rules.join("\n");
}

function bootstrap() {
  if (window[EARLY_FLAG]) return;
  const href = location.href;
  if (!href || href === "about:blank" || !/^https?:/i.test(href)) return;

  let enabled = true;
  try {
    enabled = ipcRenderer.sendSync("adblock:isEnabledSync");
  } catch (_) {
    return;
  }
  if (!enabled) return;

  let res;
  try {
    res = ipcRenderer.sendSync("adblock:getCosmeticsSync", href);
  } catch (_) {
    return;
  }
  if (!res) return;

  window[EARLY_FLAG] = true;
  window.__slopCosmeticsBoot = true;

  if (res.hide_selectors?.length) injectHideCss(res.hide_selectors);
  if (res.injected_script) {
    injectPageScript(
      `(function(){if(window.__slopScriptletsEarly)return;window.__slopScriptletsEarly=true;\n${res.injected_script}\n})();`
    );
  }
}

function runWhenReady() {
  if (document.documentElement) {
    bootstrap();
    return;
  }
  const poll = setInterval(() => {
    if (document.documentElement) {
      clearInterval(poll);
      bootstrap();
    }
  }, 0);
  setTimeout(() => clearInterval(poll), 15000);
}

runWhenReady();
