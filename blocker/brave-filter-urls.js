/*
 * Filter list URLs matching Brave Shields default-enabled components.
 * Source: brave/adblock-resources filter_lists/list_catalog.json
 */
module.exports.BRAVE_DEFAULT_URLS = [
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2020.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2021.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2022.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2023.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2024.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2025.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2026.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-general.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/ubo-link-shorteners.txt",
  "https://easylist.to/easylist/easylist.txt",
  "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-agh-online.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-specific.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-social.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-unbreak.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-android-specific.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-sugarcoat.txt",
  "https://easylist.to/easylist/easyprivacy.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-ios-specific.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty-regional.txt",
  "https://secure.fanboy.co.nz/fanboy-cookiemonster_ubo.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-cookies.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-cookie-specific.txt",
  "https://secure.fanboy.co.nz/fanboy-mobile-notifications.txt",
];

/** Brave optional YouTube lists (not in default_enabled catalog, but Shields uses them). */
module.exports.BRAVE_YOUTUBE_URLS = [
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/experimental.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/yt-distracting.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/yt-recommended.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/yt-shorts.txt",
];

module.exports.REGIONAL_URLS = {
  de: "https://easylist-downloads.adblockplus.org/easylistgermany.txt",
};

module.exports.UBO_REDIRECT_RESOURCES_URL =
  "https://raw.githubusercontent.com/gorhill/uBlock/master/src/js/redirect-resources.js";

module.exports.UBO_WAR_API_URL =
  "https://api.github.com/repos/gorhill/uBlock/contents/src/web_accessible_resources";

module.exports.UBO_WAR_RAW_BASE =
  "https://raw.githubusercontent.com/gorhill/uBlock/master/src/web_accessible_resources/";

module.exports.BRAVE_RESOURCES_URL =
  "https://raw.githubusercontent.com/brave/adblock-resources/master/dist/resources.json";

/** Legacy uBlock scriptlets bundle (adblock-rs resource-assembler format). */
module.exports.UBO_SCRIPTLETS_URL =
  "https://raw.githubusercontent.com/gorhill/uBlock/1.48.0/assets/resources/scriptlets.js";

/** Bit 0: trusted uBlock scriptlets. Bit 1: Brave-only scriptlets. */
module.exports.PERMISSION_TRUSTED = 1;
module.exports.PERMISSION_BRAVE = 3;

module.exports.parseOptionsForListUrl = function parseOptionsForListUrl(url) {
  if (/brave\/adblock-lists|brave-lists|brave-unbreak/i.test(url)) {
    return { permissions: module.exports.PERMISSION_BRAVE };
  }
  if (
    /uBlockOrigin|uAssets|easylist|fanboy|malware-filter|gitlab\.io\/malware-filter/i.test(
      url
    )
  ) {
    return { permissions: module.exports.PERMISSION_TRUSTED };
  }
  return {};
};
