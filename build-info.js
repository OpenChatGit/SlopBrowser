/*
 * SlopBrowser — persistent build ID (regenerated when package version changes).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");

const PUBLIC_BUILD_INFO_PATH = path.join(__dirname, "build-info.json");

function randomBuildId() {
  return crypto.randomBytes(4).toString("hex");
}

function writePublicBuildInfo(info) {
  const payload = JSON.stringify(info);
  for (const target of [
    PUBLIC_BUILD_INFO_PATH,
    path.join(__dirname, "renderer", "build-info.json"),
  ]) {
    try {
      fs.writeFileSync(target, payload);
    } catch (_) {}
  }
}

function getBuildInfo(app) {
  const version = pkg.version;
  const storePath = path.join(app.getPath("userData"), "build-info.json");

  try {
    const stored = JSON.parse(fs.readFileSync(storePath, "utf8"));
    if (stored.version === version && stored.buildId) {
      const info = { version, buildId: stored.buildId };
      writePublicBuildInfo(info);
      return info;
    }
  } catch (_) {}

  const buildId = randomBuildId();
  const info = { version, buildId };
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(info));
  writePublicBuildInfo(info);
  return info;
}

function readPublicBuildInfo() {
  for (const target of [
    PUBLIC_BUILD_INFO_PATH,
    path.join(__dirname, "renderer", "build-info.json"),
  ]) {
    try {
      const info = JSON.parse(fs.readFileSync(target, "utf8"));
      if (info.version === pkg.version && info.buildId) return info;
    } catch (_) {}
  }
  return null;
}

module.exports = { getBuildInfo, readPublicBuildInfo, PUBLIC_BUILD_INFO_PATH };
