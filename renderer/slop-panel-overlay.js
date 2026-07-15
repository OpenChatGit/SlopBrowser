"use strict";

const els = {
  panel: document.getElementById("slopPanel"),
  backdrop: document.getElementById("slopPanelBackdrop"),
  slopStatusDot: document.getElementById("slopStatusDot"),
  slopStatusText: document.getElementById("slopStatusText"),
  slopPageCount: document.getElementById("slopPageCount"),
  slopTotalCount: document.getElementById("slopTotalCount"),
  adPageCount: document.getElementById("adPageCount"),
  adTotalCount: document.getElementById("adTotalCount"),
  slopToggle: document.getElementById("slopToggle"),
  adBlockToggle: document.getElementById("adBlockToggle"),
  slopSwitchState: document.getElementById("slopSwitchState"),
  adBlockSwitchState: document.getElementById("adBlockSwitchState"),
};

function renderIcons(root) {
  if (typeof lucide !== "undefined" && root) lucide.createIcons({ root });
}

function closePanel() {
  window.slopPanelOverlayAPI.close();
}

function applyPanelData(data) {
  const anyOn = !!(data?.slopEnabled || data?.adBlockEnabled);

  els.panel?.classList.toggle("off", !anyOn);
  els.slopStatusText.textContent = anyOn ? "Protection active" : "Protection off";
  els.slopPageCount.textContent = String(data?.slopPageCount ?? 0);
  els.slopTotalCount.textContent = String(data?.slopTotalCount ?? 0);
  els.adPageCount.textContent = String(data?.adPageCount ?? 0);
  els.adTotalCount.textContent = String(data?.adTotalCount ?? 0);
  els.slopSwitchState.textContent = data?.slopEnabled ? "ON" : "OFF";
  els.adBlockSwitchState.textContent = data?.adBlockEnabled ? "ON" : "OFF";
  els.slopToggle?.classList.toggle("block-off", !data?.slopEnabled);
  els.adBlockToggle?.classList.toggle("block-off", !data?.adBlockEnabled);
  renderIcons(els.panel);
}

function positionPanel(panelAnchor) {
  if (!panelAnchor || !els.panel) return;
  els.panel.style.right = `${Math.max(0, window.innerWidth - panelAnchor.right)}px`;
  els.panel.style.top = `${panelAnchor.top ?? 6}px`;
  els.panel.style.bottom = "auto";
}

els.backdrop?.addEventListener("click", closePanel);

els.slopToggle?.addEventListener("click", () => {
  window.slopPanelOverlayAPI.runAction("slop-toggle");
});

els.adBlockToggle?.addEventListener("click", () => {
  window.slopPanelOverlayAPI.runAction("adblock-toggle");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});

window.slopPanelOverlayAPI.onInit(({ panelAnchor, data }) => {
  positionPanel(panelAnchor);
  applyPanelData(data);
});
