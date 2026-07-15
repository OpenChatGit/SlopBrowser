/**
 * Ensures the Electron binary is present after npm install.
 * Falls back to PowerShell Expand-Archive on Windows when extract-zip leaves a broken dist/.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const electronDir = path.join(root, "node_modules", "electron");
const installJs = path.join(electronDir, "install.js");

function platformBinary() {
  switch (process.platform) {
    case "win32":
      return "electron.exe";
    case "darwin":
      return path.join("Electron.app", "Contents", "MacOS", "Electron");
    default:
      return "electron";
  }
}

function isInstalled() {
  try {
    const binary = platformBinary();
    const distDir = path.join(electronDir, "dist");
    const pathTxt = path.join(electronDir, "path.txt");
    if (!fs.existsSync(path.join(distDir, binary))) return false;
    if (!fs.existsSync(pathTxt)) return false;
    return fs.readFileSync(pathTxt, "utf8").trim() === binary;
  } catch (_) {
    return false;
  }
}

function runInstallJs() {
  if (!fs.existsSync(installJs)) return;
  spawnSync(process.execPath, [installJs], {
    cwd: electronDir,
    stdio: "inherit",
    env: process.env,
  });
}

async function windowsFallback() {
  if (process.platform !== "win32") return false;

  let downloadArtifact;
  try {
    ({ downloadArtifact } = require("@electron/get"));
  } catch (_) {
    return false;
  }

  const pkg = require(path.join(electronDir, "package.json"));
  const distDir = path.join(electronDir, "dist");
  const zipPath = await downloadArtifact({
    version: pkg.version,
    artifactName: "electron",
    force: true,
    platform: "win32",
    arch: process.arch,
  });

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: "inherit" }
  );
  if (ps.status !== 0) return false;

  fs.writeFileSync(path.join(electronDir, "path.txt"), "electron.exe");
  return fs.existsSync(path.join(distDir, "electron.exe"));
}

async function main() {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === "1") return;
  if (!fs.existsSync(electronDir)) return;
  if (isInstalled()) return;

  runInstallJs();
  if (isInstalled()) return;

  if (await windowsFallback()) {
    console.log("Electron binary installed (Windows fallback).");
    return;
  }

  console.warn(
    "Electron binary missing. Run: node node_modules/electron/install.js"
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
