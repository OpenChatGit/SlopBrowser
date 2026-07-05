# SlopBrowser

A desktop browser built with Electron/Chromium — a full tabbed UI plus **ad
blocking** today (Brave-style lists via
[adblock-rs](https://github.com/brave/adblock-rust)).

> **Current status:** **Ad blocking works.** The **Slop Blocker does not** — it is
> not wired into browsing yet. The toolbar toggle and counter for slop are UI
> placeholders only. The slop detection engine exists as standalone code and
> tests, but nothing is injected into live pages.

Slop blocking (AI-generated junk, content farms, LLM boilerplate, SEO spam) is
the long-term goal of this project; it is **not shipped** in the browser yet.

## Features

### Browser

- Tabs with favicons, fixed tab width, private tabs (in-memory session)
- Address bar with search-or-URL handling, bookmark button, back/forward/reload
- **Bookmarks** — per-page and “bookmark all tabs”, persisted locally
- **History** — full history page with search, multi-select, shift-click range
  selection, delete selected / delete all
- **Cookies** — per-site or global manager for the active tab’s partition
- **Side rail** — quick access to Home and web apps (WhatsApp, Telegram,
  Discord, Gmail, …) in a resizable side panel
- Custom frameless window (minimize / maximize / close)
- Keyboard shortcuts (new tab, close tab, history, private tab, reload, …)
- Per-tab zoom with on-screen indicator

### Ad blocking (shipped)

- Network blocking in the main process (Brave default filter lists)
- In-page cosmetic filtering in `preload-webview.js` — CSS hides, procedural
  rules, uBlock scriptlets, YouTube-specific patches
- Toggle and per-tab blocked-count badge in the toolbar panel
- Cached engine build under the user data directory

### Slop blocking (not shipped)

**Not available while browsing.** There is no live slop filter on web pages.

What exists today:

- UI toggle and counter in the toolbar (cosmetic only — does nothing on pages)
- `blocker/slop-engine.js` — offline detection heuristics used by tests and the
  local demo page, not connected to tab webviews

See **Slop engine (dev only)** below if you want to run the engine outside the
browser.

## Start

```bash
npm install
npm start
```

Development with DevTools and hot reload:

```bash
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Build chrome module, then launch Electron |
| `npm run dev` | Same as start, opens DevTools |
| `npm run build:chrome` | Regenerate `renderer/chrome/index.js` from `renderer/renderer.js` |
| `npm test` | Run slop-engine unit tests |

## Slop engine (dev only)

The slop engine is **not part of the browser experience yet**. For development
you can open the demo HTML or run unit tests:

```
file:///C:/Users/You/Documents/Github/SlopBrowser/test/slop-demo.html
```

```bash
npm test
```

## Development

Browser chrome logic is edited in **`renderer/renderer.js`** (source of truth).
At start, `scripts/build-chrome-module.js` generates the ES module at
`renderer/chrome/index.js`, which imports shared constants/state from
`renderer/js/shared.js` and helpers from `renderer/js/utils.js`.

After changing `renderer.js`, run:

```bash
npm run build:chrome
```

—or rely on `prestart`, which runs the build automatically before `npm start`.

Do **not** edit `renderer/chrome/index.js` by hand; changes will be overwritten.

## Architecture

```
SlopBrowser/
├── main.js                 # App bootstrap
├── main/                   # Main-process modules
│   ├── window.js           # BrowserWindow factory
│   ├── ipc.js              # IPC handlers (history, bookmarks, cookies, adblock)
│   ├── webview-guest.js    # Webview lifecycle, zoom, shortcuts
│   ├── session-config.js   # Partitions, user-agent, integrations
│   └── notifications.js    # History/zoom change broadcasts
├── stores/
│   ├── history-store.js    # Persistent browse history (JSON)
│   └── bookmark-store.js   # Persistent bookmarks (JSON)
├── preload-chrome.js       # Bridge for the browser UI (slopAPI)
├── preload-webview.js      # Injected into every tab — ad cosmetics, history bridge
├── blocker/
│   ├── adblock-service.js  # adblock-rs engine, list fetch, cache
│   ├── slop-engine.js      # Slop heuristics (dev/tests — not wired to tabs)
│   ├── brave-filter-urls.js
│   └── youtube-video-patch.js
└── renderer/
    ├── index.html          # Browser shell
    ├── main.js             # Renderer entry (ES module)
    ├── renderer.js         # Chrome logic source — edit this
    ├── chrome/index.js     # Generated chrome module
    ├── js/                 # shared.js, utils.js, registry.js
    ├── history.html        # Full history page (loaded in a tab)
    ├── newtab.html         # Start / home page
    └── style.css           # Browser UI styles
```

| Layer | Role |
|-------|------|
| `main.js` + `main/*` | Windows, sessions, IPC, adblock network layer |
| `preload-chrome.js` | `window.slopAPI` for tabs, history, bookmarks, cookies |
| `preload-webview.js` | Ad cosmetics, scriptlets, `slopApp` / history bridge on pages |
| `renderer/renderer.js` | Tabs, toolbar, menus, side rail, webview wiring |
| `stores/*` | Durable history and bookmarks on disk |
| `blocker/adblock-service.js` | Brave lists, request blocking, cosmetic payloads |
| `blocker/slop-engine.js` | Slop heuristics (dev/tests only — not used in tabs) |

## Tuning slop detection (future)

When the Slop Blocker is implemented, rules will live in
`blocker/slop-engine.js`:

- `PHRASES` / `STRUCTURE` — regex patterns and scores
- `SLOP_DOMAINS` — hostname block list
- `THRESHOLD` — score at which content counts as slop (default: 5)

Detection is heuristic and can produce false positives; blur/hide modes and a
real on/off switch are planned for when slop blocking ships.

## License

MIT — see [package.json](package.json).
