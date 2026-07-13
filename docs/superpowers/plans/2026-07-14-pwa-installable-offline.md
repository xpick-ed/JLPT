# PWA (Installable + Offline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the JLPT web app an installable, offline PWA (home-screen icon, standalone/fullscreen, works offline) without touching gameplay, local-first, or Google login.

**Architecture:** Add a `web/manifest.json`, an auto-generated 字-hanko icon set (`build_icons.py` → `web/icons/*.png`, committed), and a service worker `web/sw.js` that precaches the same-origin app shell and serves everything same-origin via stale-while-revalidate — while leaving all cross-origin requests (the Worker sync host, the GIS script, Google Fonts) untouched on the network. `index.html` links the manifest/icons; `app.js` registers the SW.

**Tech Stack:** Vanilla ES modules (no build step), a Service Worker + Cache Storage API, Python 3 + Pillow (offline icon generation only), `node --test`, Playwright.

## Global Constraints

- Vanilla ES modules, **no app build step**; `node --test tests/*.test.mjs`.
- Traditional-Chinese (Taiwan) UI copy.
- The SW caches **same-origin GET only** — never the Worker sync endpoints, `accounts.google.com` (GIS), or Google Fonts.
- `manifest`/`start_url`/`scope`/icon paths are **relative** (site is served under a subpath).
- Icons are generated offline (Pillow) and **committed**; no runtime image dependency.
- Local-first play and Google login/sync remain fully functional online and offline.

---

### Task 1: Icon generator + icons + icon test

**Files:**
- Create: `build_icons.py`
- Create: `web/icons/icon-192.png`, `web/icons/icon-512.png`, `web/icons/icon-maskable-512.png`, `web/icons/apple-touch-icon.png` (by running the script)
- Test: `tests/pwa.test.mjs`

**Interfaces:**
- Produces: the four committed PNG files under `web/icons/`.

- [ ] **Step 1: Write the failing test**

Create `tests/pwa.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ICONS = [
  'web/icons/icon-192.png',
  'web/icons/icon-512.png',
  'web/icons/icon-maskable-512.png',
  'web/icons/apple-touch-icon.png',
];

test('icon PNGs exist, are non-trivial, and have PNG magic bytes', () => {
  for (const p of ICONS) {
    const buf = readFileSync(p);
    assert.ok(buf.length > 500, `${p} too small`);
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${p} not a PNG`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/pwa.test.mjs`
Expected: FAIL — `ENOENT` (the PNGs don't exist yet).

- [ ] **Step 3: Write `build_icons.py`**

```python
#!/usr/bin/env python3
"""Generate PWA icons: a vermilion 字-hanko. Run once; commit web/icons/*.png."""
import os
from PIL import Image, ImageDraw, ImageFont

FONT = "assets/fonts/NotoSansCJKtc-Regular.ttf"
SHU = (229, 68, 47)            # #e5442f
WHITE = (255, 255, 255, 255)
OUT = "web/icons"

def make(size, glyph_frac, radius_frac, full_bleed, keep_alpha):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if full_bleed:
        d.rectangle([0, 0, size, size], fill=SHU + (255,))
    else:
        r = int(size * radius_frac)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=SHU + (255,))
    font = ImageFont.truetype(FONT, int(size * glyph_frac))
    bbox = d.textbbox((0, 0), "字", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), "字", font=font, fill=WHITE)
    if keep_alpha:
        return img
    flat = Image.new("RGB", (size, size), SHU)   # apple-touch: no alpha
    flat.paste(img, (0, 0), img)
    return flat

def main():
    os.makedirs(OUT, exist_ok=True)
    make(192, 0.62, 0.22, False, True).save(f"{OUT}/icon-192.png")
    make(512, 0.62, 0.22, False, True).save(f"{OUT}/icon-512.png")
    make(512, 0.55, 0.0, True, True).save(f"{OUT}/icon-maskable-512.png")
    make(180, 0.62, 0.0, True, False).save(f"{OUT}/apple-touch-icon.png")
    print("wrote:", sorted(os.listdir(OUT)))

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Generate the icons and verify the test passes**

Run: `python3 build_icons.py`
Expected: prints `wrote: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']`.
Then run: `node --test tests/pwa.test.mjs`
Expected: PASS.
(Optional visual check: `python3 -c "from PIL import Image; print(Image.open('web/icons/icon-512.png').size)"` → `(512, 512)`.)

- [ ] **Step 5: Commit**

```bash
git add build_icons.py web/icons/*.png tests/pwa.test.mjs
git commit -m "feat: PWA icon generator + vermilion 字 icon set"
```

---

### Task 2: `web/manifest.json` + manifest test

**Files:**
- Create: `web/manifest.json`
- Test: `tests/pwa.test.mjs` (append)

- [ ] **Step 1: Add the failing test**

Append to `tests/pwa.test.mjs`:
```js
test('manifest.json is valid, standalone, with maskable + >=2 icons', () => {
  const m = JSON.parse(readFileSync('web/manifest.json', 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name, 'name/short_name present');
  assert.equal(m.start_url, '.');
  assert.equal(m.scope, '.');
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 2, '>=2 icons');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'has a maskable icon');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/pwa.test.mjs`
Expected: FAIL — `ENOENT` on `web/manifest.json`.

- [ ] **Step 3: Create `web/manifest.json`**

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

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/pwa.test.mjs`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add web/manifest.json tests/pwa.test.mjs
git commit -m "feat: PWA web manifest (standalone, relative paths)"
```

---

### Task 3: Service worker `web/sw.js`

**Files:**
- Create: `web/sw.js`

`mount*`/SW behaviour is browser-only (verified via Playwright in Task 6); this
task has no unit test. Verify with `node --check` for syntax.

- [ ] **Step 1: Write `web/sw.js`**

```js
// PWA service worker: precache the app shell, serve same-origin GET via
// stale-while-revalidate. Cross-origin (Worker sync, GIS, Google Fonts) is
// never intercepted — those always go to the network.
const CACHE = 'jlpt-pwa-v1';   // bump on each release to refresh the shell
const SHELL = [
  './', './index.html', './style.css', './config.js', './manifest.json',
  './js/app.js', './js/ui.js', './js/store.js', './js/session.js', './js/srs.js',
  './js/audio.js', './js/sync.js', './js/auth.js', './js/furigana.js',
  './js/modes/match.js', './js/modes/typing.js', './js/modes/quiz.js',
  './js/modes/falling.js', './js/modes/grammar-cloze.js', './js/modes/grammar-order.js',
  './js/modes/reading.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                      // sync PUT/POST → network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // cross-origin → network (Worker/GIS/fonts)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    e.waitUntil(network);                                // finish the background revalidation
    return cached || (await network) || new Response('', { status: 504 });
  })());
});
```

- [ ] **Step 2: Syntax-check**

Run: `node --check web/sw.js`
Expected: clean (exit 0).

- [ ] **Step 3: Commit**

```bash
git add web/sw.js
git commit -m "feat: service worker (precache shell + same-origin SWR)"
```

---

### Task 4: `index.html` — manifest link + iOS metas

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: Add the tags**

In `web/index.html`, inside `<head>`, after the existing `<link rel="stylesheet" href="style.css">` line (and the GIS `<script>`), add:
```html
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="JLPT 字">
```

- [ ] **Step 2: Commit**

```bash
git add web/index.html
git commit -m "feat: link PWA manifest + apple-touch-icon/iOS metas"
```

---

### Task 5: `app.js` — register the service worker

**Files:**
- Modify: `web/js/app.js`

- [ ] **Step 1: Add registration at the end of the module**

Append to the end of `web/js/app.js`:
```js
// Register the PWA service worker (offline + installable). Best-effort.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
```
(`register('sw.js')` resolves against the document URL — `…/web/` — so the SW scope covers the whole app.)

- [ ] **Step 2: Syntax-check**

Run: `node --check web/js/app.js`
Expected: clean. `node --test tests/*.test.mjs` — still all pass.

- [ ] **Step 3: Commit**

```bash
git add web/js/app.js
git commit -m "feat: register PWA service worker on load"
```

---

### Task 6: Playwright — install metadata + SW registration + offline

**Files:** (no source changes unless a defect is found)

- [ ] **Step 1: Drive it**

Run (adjust venv path, e.g. `/tmp/pw-venv`):
```bash
cd /home/eslin/claude_projects/JLPT
python3 -m http.server -d web 8160 >/tmp/srv.log 2>&1 & echo $! > /tmp/srv.pid; sleep 1
/tmp/pw-venv/bin/python - <<'EOF'
from playwright.sync_api import sync_playwright
import json, urllib.request
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    st = json.dumps({"cards":{}, "settings":{"newPerDay":50,"levels":["n2"],"categories":[],"sound":False,"pairMode":"meaning","theme":"system","content":"vocab"}, "updated":0})
    pg.goto("http://localhost:8160", wait_until="load")
    pg.evaluate("s=>localStorage.setItem('vocabmatch.state',s)", st)
    # metadata
    manifest_href = pg.get_attribute('link[rel="manifest"]', 'href')
    apple = pg.get_attribute('link[rel="apple-touch-icon"]', 'href')
    print("manifest link:", manifest_href, "| apple-touch:", apple)
    for path in ("manifest.json", "icons/apple-touch-icon.png", "icons/icon-512.png"):
        code = urllib.request.urlopen(f"http://localhost:8160/{path}").status
        print(f"  {path} -> {code}")
    # SW registers + becomes ready
    pg.reload(wait_until="load"); pg.wait_for_timeout(800)
    reg = pg.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; }")
    pg.evaluate("() => navigator.serviceWorker.ready")
    pg.wait_for_timeout(500)
    print("SW registered:", reg)
    # reload once more so the SW controls + shell/n2 are cached
    pg.reload(wait_until="load"); pg.wait_for_timeout(700)
    tiles_online = pg.eval_on_selector_all(".tile", "els=>els.length")
    # go OFFLINE and reload — must still render from cache
    ctx.set_offline(True)
    pg.reload(wait_until="load"); pg.wait_for_timeout(900)
    tiles_offline = pg.eval_on_selector_all(".tile", "els=>els.length")
    chrome = pg.eval_on_selector_all(".content-switch", "els=>els.length")
    print("online tiles:", tiles_online, "| OFFLINE tiles:", tiles_offline, "| chrome:", chrome)
    pg.close(); b.close()
print("ERRORS:", errs)
EOF
kill $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: `manifest link: manifest.json`, `apple-touch: icons/apple-touch-icon.png`; each asset `-> 200`; `SW registered: True`; `online tiles` > 0 and **`OFFLINE tiles` > 0** and `chrome: 1` (the app renders offline from cache); **`ERRORS: []`**.

- [ ] **Step 2: Full suite**

Run: `node --test tests/*.test.mjs`
Expected: all pass (pwa + existing).

- [ ] **Step 3: Commit any fixes** (skip if none)
```bash
git add -A && git commit -m "test: Playwright-verify PWA install metadata + offline"
```

---

## Notes for the executor
- No agents/generation. Icons are generated once by `build_icons.py` (Pillow is installed; the font `assets/fonts/NotoSansCJKtc-Regular.ttf` exists) and committed as PNGs.
- Bump `CACHE` in `web/sw.js` whenever the shell changes so clients refresh (SWR already keeps them at most one reload behind).
- The SW only ever touches **same-origin GET** — the Worker sync, GIS login, and Google Fonts stay on the network, so login/sync are unaffected online and fail-soft offline.
