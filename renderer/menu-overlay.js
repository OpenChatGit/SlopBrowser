"use strict";

const GLOBE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';

const els = {
  menu: document.getElementById("menu"),
  backdrop: document.getElementById("menuBackdrop"),
  historySubWrap: document.getElementById("historySubWrap"),
  bookmarksSubWrap: document.getElementById("bookmarksSubWrap"),
  downloadsSubWrap: document.getElementById("downloadsSubWrap"),
  historyRecentList: document.getElementById("historyRecentList"),
  bookmarksSavedList: document.getElementById("bookmarksSavedList"),
  bookmarksThisTab: document.getElementById("bookmarksThisTab"),
  bookmarksAllTabs: document.getElementById("bookmarksAllTabs"),
  downloadsRecentList: document.getElementById("downloadsRecentList"),
};

let menuData = null;

function truncate(s, max = 80) {
  const t = String(s ?? "");
  return t.length <= max ? t : t.slice(0, max) + "…";
}

function renderIcons(root) {
  if (typeof lucide !== "undefined" && root) lucide.createIcons({ root });
}

function closeMenu() {
  window.menuOverlayAPI.close();
}

function runAction(action, detail) {
  window.menuOverlayAPI.runAction(action, detail);
  closeMenu();
}

function wireSubmenuHover(wrap) {
  if (!wrap) return;
  wrap._submenuCloseTimer = null;
  wrap.addEventListener("mouseenter", () => {
    clearTimeout(wrap._submenuCloseTimer);
    wrap._submenuCloseTimer = null;
    wrap.classList.add("sub-open");
  });
  wrap.addEventListener("mouseleave", (e) => {
    if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
    wrap._submenuCloseTimer = setTimeout(() => {
      if (!wrap.matches(":hover")) wrap.classList.remove("sub-open");
    }, 120);
  });
}

function renderHistoryList(items) {
  const list = els.historyRecentList;
  if (!list) return;
  list.replaceChildren();

  if (!items?.length) {
    const empty = document.createElement("div");
    empty.className = "menu-submenu-empty";
    empty.textContent = "No history yet";
    list.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item menu-recent";
    btn.dataset.action = entry.closed ? "history-reopen" : "history-open-url";
    btn.dataset.url = entry.url;
    btn.setAttribute("role", "menuitem");

    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-recent-icon-wrap";
    if (entry.favicon) {
      const icon = document.createElement("img");
      icon.className = "menu-recent-icon";
      icon.src = entry.favicon;
      icon.alt = "";
      icon.referrerPolicy = "no-referrer";
      icon.onerror = () => {
        iconWrap.innerHTML = GLOBE_SVG;
        iconWrap.classList.add("menu-recent-fallback");
      };
      iconWrap.appendChild(icon);
    } else {
      iconWrap.classList.add("menu-recent-fallback");
      iconWrap.innerHTML = GLOBE_SVG;
    }

    const label = document.createElement("span");
    label.className = "menu-recent-label";
    label.textContent = truncate(entry.title, 38);

    btn.appendChild(iconWrap);
    btn.appendChild(label);
    if (entry.showShortcut) {
      const kbd = document.createElement("kbd");
      kbd.textContent = "Ctrl+Shift+T";
      btn.appendChild(kbd);
    }
    list.appendChild(btn);
  }
  renderIcons(list);
}

function renderBookmarksList(items) {
  const list = els.bookmarksSavedList;
  if (!list) return;
  list.replaceChildren();

  if (!items?.length) {
    const empty = document.createElement("div");
    empty.className = "menu-submenu-empty";
    empty.textContent = "No bookmarks yet";
    list.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item menu-recent";
    btn.dataset.action = "bookmarks-open-url";
    btn.dataset.url = entry.url;
    btn.setAttribute("role", "menuitem");

    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-recent-icon-wrap";
    if (entry.favicon) {
      const icon = document.createElement("img");
      icon.className = "menu-recent-icon";
      icon.src = entry.favicon;
      icon.alt = "";
      icon.referrerPolicy = "no-referrer";
      icon.onerror = () => {
        iconWrap.innerHTML = GLOBE_SVG;
        iconWrap.classList.add("menu-recent-fallback");
      };
      iconWrap.appendChild(icon);
    } else {
      iconWrap.classList.add("menu-recent-fallback");
      iconWrap.innerHTML = GLOBE_SVG;
    }

    const label = document.createElement("span");
    label.className = "menu-recent-label";
    label.textContent = truncate(entry.title, 38);

    btn.appendChild(iconWrap);
    btn.appendChild(label);
    list.appendChild(btn);
  }
  renderIcons(list);
}

function renderDownloadsList(items) {
  const list = els.downloadsRecentList;
  if (!list) return;
  list.replaceChildren();

  if (!items?.length) {
    const empty = document.createElement("div");
    empty.className = "menu-submenu-empty";
    empty.textContent = "No downloads yet";
    list.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item menu-recent";
    btn.dataset.action =
      entry.state === "progressing" ? "downloads-open-page" : "downloads-open-file";
    btn.dataset.id = entry.id;
    btn.setAttribute("role", "menuitem");

    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-recent-icon-wrap menu-recent-fallback";
    iconWrap.innerHTML = GLOBE_SVG;

    const label = document.createElement("span");
    label.className = "menu-recent-label";
    label.textContent = truncate(entry.filename, 38);

    btn.appendChild(iconWrap);
    btn.appendChild(label);
    const state = document.createElement("kbd");
    state.textContent = entry.stateLabel || "";
    btn.appendChild(state);
    list.appendChild(btn);
  }
  renderIcons(list);
}

function applyMenuData(data) {
  menuData = data || {};
  if (els.bookmarksThisTab) {
    els.bookmarksThisTab.disabled = !!menuData.bookmarksThisTabDisabled;
  }
  if (els.bookmarksAllTabs) {
    els.bookmarksAllTabs.disabled = !!menuData.bookmarksAllTabsDisabled;
  }
  renderHistoryList(menuData.history || []);
  renderBookmarksList(menuData.bookmarks || []);
  renderDownloadsList(menuData.downloads || []);
  renderIcons(els.menu);
}

function positionMenu(panelAnchor) {
  if (!panelAnchor || !els.menu) return;
  els.menu.style.right = `${Math.max(0, window.innerWidth - panelAnchor.right)}px`;
  els.menu.style.top = `${panelAnchor.top ?? 6}px`;
  els.menu.style.bottom = "auto";
}

wireSubmenuHover(els.historySubWrap);
wireSubmenuHover(els.bookmarksSubWrap);
wireSubmenuHover(els.downloadsSubWrap);

els.backdrop?.addEventListener("click", closeMenu);

els.menu?.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item || item.disabled) return;
  const action = item.dataset.action;
  if (
    action === "history" ||
    action === "bookmarks" ||
    action === "downloads"
  ) {
    return;
  }

  const detail = {};
  if (item.dataset.url) detail.url = item.dataset.url;
  if (item.dataset.id) detail.id = item.dataset.id;
  runAction(action, detail);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

window.menuOverlayAPI.onInit(({ panelAnchor, data }) => {
  [
    els.historySubWrap,
    els.bookmarksSubWrap,
    els.downloadsSubWrap,
  ].forEach((wrap) => wrap?.classList.remove("sub-open"));
  positionMenu(panelAnchor);
  applyMenuData(data);
});
