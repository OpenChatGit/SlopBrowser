"use strict";

const api = window.sessionRestoreOverlayAPI;
const notice = document.getElementById("sessionRestoreNotice");

const SHADOW_PAD = { top: 4, right: 8, bottom: 20, left: 8 };

function reportSize() {
  if (!notice || !api?.resize) return;
  const r = notice.getBoundingClientRect();
  const width = Math.ceil(r.width) + SHADOW_PAD.left + SHADOW_PAD.right;
  const height = Math.ceil(r.height) + SHADOW_PAD.top + SHADOW_PAD.bottom;
  api.resize({ width, height });
}

document.getElementById("sessionRestoreYes")?.addEventListener("click", () => {
  api?.runAction("session-restore-yes");
});

document.getElementById("sessionRestoreNo")?.addEventListener("click", () => {
  api?.runAction("session-restore-no");
});

api?.onInit(() => {
  requestAnimationFrame(() => {
    reportSize();
    requestAnimationFrame(reportSize);
  });
});

if (typeof ResizeObserver !== "undefined" && notice) {
  new ResizeObserver(() => reportSize()).observe(notice);
}
