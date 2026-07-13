# PWA — Installable & Offline — Design

**Date:** 2026-07-14
**Status:** Approved (design), pending spec review → writing-plans

## Context & Scope

The JLPT app is a static, local-first site under `web/` (index.html, config.js,
`js/*.js` ES modules, style.css, `data/*.json` vocab/grammar banks, Google login
via GIS + a Cloudflare Worker for sync). Goal: make it a **full PWA** —
installable to the home screen, launches **standalone/fullscreen** with an icon,
and **works offline** via a service worker. No native build, no app store, no
new dependency at runtime (icons are generated offline with Pillow, then
committed).

**Kept working, unchanged:** local-first play, Google login, Worker sync. The SW
must **never** cache the Worker sync calls, the GIS script, or Google fonts
(cross-origin, must stay live).

## Components

### 1. `web/manifest.json`
```json
{
  "name": "JLPT 單字道場",
  "short_name": "JLPT 字",
  "lang": "zh-Hant",
  "dir": "ltr",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#0b0d11",
  "theme_color": "#0b0d11",
  "categories": ["education"],
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
Relative `start_url`/`scope`/icon paths (the site is served under a subpath like
`/JLPT/web/`), so they resolve against the manifest URL and are subpath-agnostic.

### 2. Icons — `build_icons.py` (Pillow) → `web/icons/`
Offline generator (not a runtime dependency); its PNG outputs are committed.
Style matches the in-app hanko: vermilion `#e5442f` field, white 「字」 in
`assets/fonts/NotoSansCJKtc-Regular.ttf`.
- `icon-192.png`, `icon-512.png` — rounded-square vermilion tile on a transparent
  background (the hanko look), 字 centered (~62% of the box).
- `icon-maskable-512.png` — **full-bleed** vermilion (no rounding, no
  transparency), 字 within the central safe zone (~55%) so Android mask crops
  never clip it.
- `apple-touch-icon.png` (180×180) — full-bleed vermilion, 字 centered (iOS
  rounds corners itself; must have no alpha).

### 3. Service worker — `web/sw.js`
- `const CACHE = 'jlpt-pwa-v1';` (bump on each release to refresh the shell).
- **install**: `caches.open(CACHE)` then `addAll(SHELL)` where SHELL is the
  same-origin app shell — `./`, `./index.html`, `./style.css`, `./config.js`,
  `./manifest.json`, the 9 `./js/*.js` + 7 `./js/modes/*.js` modules, and
  `./icons/icon-192.png`, `./icons/icon-512.png`. Then `self.skipWaiting()`.
- **activate**: delete every cache whose key ≠ `CACHE`, then `clients.claim()`.
- **fetch** (only `GET`; only same-origin — every cross-origin request, incl. the
  Worker sync host, `accounts.google.com`, and Google Fonts, is left untouched to
  go to the network):
  **stale-while-revalidate** — respond from cache immediately if present, and in
  parallel fetch from network and update the cache; if not cached, fetch, cache a
  clone, and return it; if the network fetch fails and nothing is cached, the
  request rejects (normal offline-with-no-cache behaviour). This applies uniformly
  to the shell and to `data/*.json` (data is cached the first time a level is
  opened → light install, offline thereafter for opened levels).

### 4. `web/index.html`
Add in `<head>`:
```html
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="JLPT 字">
```

### 5. Registration — `web/js/app.js`
At the end of the module:
```js
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
```
`register('sw.js')` resolves against the document URL (`…/web/`), so the SW scope
covers the whole app.

## Data Flow / Behaviour
- First online visit: shell precached at SW install; each data level cached on
  first fetch (SWR). Subsequent loads open instantly from cache and refresh in
  the background.
- Offline: shell + already-opened levels serve from cache; the app is fully
  playable (progress is localStorage). Google sync/login simply no-op offline
  (they already fail-soft) and resume when back online.
- Update: a new SW version (bumped `CACHE`) installs on the next visit, precaches
  the new shell, activates, and claims clients; the currently open tab updates on
  its next load. SWR means users are at most one reload behind.

## Testing
- **Unit** (`node --test`): `manifest.json` parses and has `name`, `start_url`,
  `display: "standalone"`, and ≥2 icons; the four icon PNGs and `apple-touch-icon.png`
  exist and are non-empty PNG files (magic bytes `\x89PNG`).
- **Playwright**: serve `web/`; confirm the manifest `<link>` exists and
  `manifest.json` + `apple-touch-icon.png` return 200; the SW **registers**
  (`navigator.serviceWorker.getRegistration()` becomes truthy after load); then
  populate the cache with one load, set the browser context **offline**, reload,
  and confirm the chrome + a card still render (offline works); 0 console errors.

## Out of Scope
- Native wrapper / app-store publishing (Capacitor, WebView).
- Push notifications / background sync.
- Precaching every data level up front (kept as runtime SWR to keep install light).
- Custom install-prompt UI (rely on the browser's built-in install affordance).

## Global Constraints
- Vanilla ES modules, **no build step** for the app; `node --test tests/*.test.mjs`.
- Traditional-Chinese (Taiwan) UI copy.
- The SW caches **same-origin GET only**; never the Worker sync endpoints, the
  GIS script, or Google Fonts.
- Icons generated offline (Pillow) and committed; no runtime image dependency.
- `manifest`/`start_url`/`scope`/icon paths are **relative** (subpath-served).
- Local-first play and Google login/sync remain fully functional online and off.
