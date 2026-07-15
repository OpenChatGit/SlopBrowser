"use strict";

const GLOBE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';

const els = {
  panel: document.getElementById("downloadPanel"),
  backdrop: document.getElementById("downloadPanelBackdrop"),
  list: document.getElementById("downloadPanelList"),
  clearAll: document.getElementById("downloadPanelClearAll"),
};

function truncate(s, max = 80) {
  const t = String(s ?? "");
  return t.length <= max ? t : t.slice(0, max) + "…";
}

function fillIconWrap(wrap, favicon) {
  wrap.replaceChildren();
  if (!favicon) {
    wrap.classList.add("menu-recent-fallback");
    wrap.innerHTML = GLOBE_SVG;
    return;
  }
  wrap.classList.remove("menu-recent-fallback");
  const img = document.createElement("img");
  img.className = "menu-recent-icon";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.onerror = () => {
    wrap.classList.add("menu-recent-fallback");
    wrap.innerHTML = GLOBE_SVG;
  };
  img.src = favicon;
  wrap.appendChild(img);
}

function renderPanel(entries) {
  const list = els.list;
  if (!list) return;
  list.replaceChildren();
  if (els.clearAll) {
    els.clearAll.disabled = !entries?.length;
  }

  if (!entries?.length) {
    const empty = document.createElement("div");
    empty.className = "download-panel-empty";
    empty.textContent = "No downloads yet";
    list.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const pct = entry.progress ?? 0;
    const row = document.createElement("div");
    row.className = "download-item";
    row.dataset.id = entry.id;

    const head = document.createElement("div");
    head.className = "download-item-head";

    const headMain = document.createElement("div");
    headMain.className = "download-item-head-main";

    const iconWrap = document.createElement("span");
    iconWrap.className = "download-item-icon-wrap";
    fillIconWrap(iconWrap, entry.favicon);

    const name = document.createElement("span");
    name.className = "download-item-name";
    name.title = entry.filename || "";
    name.textContent = truncate(entry.filename, 48);

    headMain.appendChild(iconWrap);
    headMain.appendChild(name);

    const size = document.createElement("span");
    size.className = "download-item-size";
    size.textContent = entry.sizeLabel || "—";

    head.appendChild(headMain);
    head.appendChild(size);

    const track = document.createElement("div");
    track.className = "download-item-track";
    const bar = document.createElement("div");
    bar.className = "download-item-bar";
    if (entry.state === "completed") bar.classList.add("done");
    else if (entry.state === "cancelled" || entry.state === "interrupted") {
      bar.classList.add("error");
    }
    bar.style.width =
      pct < 0 ? "35%" : `${Math.max(entry.state === "completed" ? 100 : pct, 0)}%`;
    track.appendChild(bar);

    const meta = document.createElement("div");
    meta.className = "download-item-meta";

    const pctLabel = document.createElement("span");
    pctLabel.className = "download-item-pct";
    pctLabel.textContent = entry.stateLabel || "";

    const actions = document.createElement("div");
    actions.className = "download-item-actions";

    if (entry.state === "progressing") {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.dataset.action = "downloads-cancel";
      cancelBtn.dataset.id = entry.id;
      cancelBtn.textContent = "Cancel";
      actions.appendChild(cancelBtn);
    } else if (entry.state === "completed") {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.dataset.action = "downloads-open-file";
      openBtn.dataset.id = entry.id;
      openBtn.textContent = "Open";
      actions.appendChild(openBtn);

      const folderBtn = document.createElement("button");
      folderBtn.type = "button";
      folderBtn.dataset.action = "downloads-show-folder";
      folderBtn.dataset.id = entry.id;
      folderBtn.textContent = "Show";
      actions.appendChild(folderBtn);
    }

    meta.appendChild(pctLabel);
    meta.appendChild(actions);

    row.appendChild(head);
    row.appendChild(track);
    row.appendChild(meta);
    list.appendChild(row);
  }
}

function closePanel() {
  window.downloadPanelOverlayAPI.close();
}

function positionPanel(panelAnchor) {
  if (!panelAnchor || !els.panel) return;
  els.panel.style.right = `${Math.max(0, window.innerWidth - panelAnchor.right)}px`;
  els.panel.style.top = `${panelAnchor.top ?? 6}px`;
  els.panel.style.bottom = "auto";
}

els.backdrop?.addEventListener("click", closePanel);

els.clearAll?.addEventListener("click", () => {
  if (els.clearAll?.disabled) return;
  window.downloadPanelOverlayAPI.runAction("downloads-clear-all");
});

els.list?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  window.downloadPanelOverlayAPI.runAction(btn.dataset.action, {
    id: btn.dataset.id,
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});

window.downloadPanelOverlayAPI.onInit(({ panelAnchor, data }) => {
  positionPanel(panelAnchor);
  renderPanel(data?.entries || []);
});
