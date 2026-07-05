/**
 * One-time helper: splits renderer.js into ES modules under renderer/js/.
 * Run: node scripts/split-renderer.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "renderer", "renderer.js");
const OUT = path.join(ROOT, "renderer", "js");

const SECTIONS = [
  { file: "constants.js", start: 0, endMarker: "function isHome" },
  { file: "url.js", startMarker: "function isHome", endMarker: "function clampZoom" },
  { file: "zoom.js", startMarker: "function clampZoom", endMarker: "const els" },
  { file: "state.js", startMarker: "const els", endMarker: "/* ---------- Favicons" },
  { file: "utils.js", startMarker: "/* ---------- Favicons", endMarker: "/* ---------- Tabs" },
  { file: "tabs.js", startMarker: "/* ---------- Tabs", endMarker: "/* ---------- Toolbar" },
  { file: "toolbar.js", startMarker: "/* ---------- Toolbar", endMarker: "/* ---------- Slop filter" },
  { file: "filters.js", startMarker: "/* ---------- Slop filter", endMarker: "/* ---------- History" },
  { file: "history.js", startMarker: "/* ---------- History", endMarker: "/* ---------- Menu" },
  { file: "menu.js", startMarker: "/* ---------- Menu", endMarker: "/* ---------- Cookie manager" },
  { file: "cookies.js", startMarker: "/* ---------- Cookie manager", endMarker: "/* ---------- Keyboard" },
  { file: "keyboard.js", startMarker: "/* ---------- Keyboard", endMarker: "/* ---------- Window controls" },
  { file: "window-controls.js", startMarker: "/* ---------- Window controls", endMarker: "/* ---------- Side rail" },
  { file: "side-rail.js", startMarker: "/* ---------- Side rail", endMarker: "/* ---------- Start" },
  { file: "bootstrap.js", startMarker: "/* ---------- Start", end: Infinity },
];

function findLine(lines, marker, from = 0) {
  if (typeof marker === "number") return marker;
  const i = lines.findIndex((l, idx) => idx >= from && l.includes(marker));
  return i === -1 ? lines.length : i;
}

const raw = fs.readFileSync(SRC, "utf8");
const lines = raw.split("\n");

fs.mkdirSync(OUT, { recursive: true });

for (const sec of SECTIONS) {
  const start = sec.startMarker
    ? findLine(lines, sec.startMarker)
    : sec.start ?? 0;
  const end = sec.endMarker
    ? findLine(lines, sec.endMarker, start + 1)
    : lines.length;
  const body = lines.slice(start, end).join("\n").trim();
  fs.writeFileSync(path.join(OUT, sec.file), body + "\n");
  console.log("Wrote", sec.file, end - start, "lines");
}

console.log("Done. Wire imports manually in bootstrap.js");
