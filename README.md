# SlopBrowser

A desktop browser (Electron/Chromium) that **blocks AI slop across the whole
web** - like an ad blocker, but against AI-generated bulk junk (content farms,
LLM boilerplate text, AI images).

## Features

- Full browser with **tabs**, address bar, back/forward/reload
- **Slop blocker engine** that runs on *every* page and analyzes content:
  - LLM-typical phrases (`delve`, `rich tapestry`, `in today's digital age`,
    `as an AI language model`, ...)
  - SEO/listicle patterns (`Top 10 ...`, `you won't believe`, ...)
  - Emoji bullet-point spam, monotone sentence lengths, em-dash clustering
  - AI image markers (Midjourney/DALL-E/Stable Diffusion, AI image CDNs)
  - Domain block list for known AI content farms (extendable)
- **Two modes**: *hide* slop or *blur* it (hover reveals the content)
- **Live counter** per tab (like the ad-block counter)
- Toggle the blocker with a click

## Start

```bash
npm install
npm start
```

## Testing

Open a local file in the address bar, e.g.:

```
file:///<path>/SlopBrowser/test/slop-demo.html
```

The AI-slop paragraphs get blocked, real content stays visible.

## Architecture

| File | Purpose |
|------|---------|
| `main.js` | Electron main process, window |
| `preload-chrome.js` | Bridge for the browser UI |
| `renderer/` | Browser UI (tabs, address bar, counter) |
| `preload-webview.js` | Injected into every page, scans & blocks the DOM |
| `blocker/slop-engine.js` | Pure detection heuristics (score + reasons) |

## Tuning slop detection

Rules and weights live in `blocker/slop-engine.js`:

- `PHRASES` / `STRUCTURE`: regex + weight
- `SLOP_DOMAINS`: domain block list
- `THRESHOLD`: the score at which a block counts as slop (default: 5)

## Note

Detection is heuristic - it can produce false positives. That's why there is a
blur mode and an off switch.
