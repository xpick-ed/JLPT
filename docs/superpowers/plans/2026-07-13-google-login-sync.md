# Google 登入 + 每人同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace passphrase sync with Sign in with Google — the Worker verifies a Google ID token and keys per-user KV data by the Google `sub`, over a long-lived Worker session.

**Architecture:** Google Identity Services (frontend) yields an ID token → Worker `POST /session` verifies it via Google's `tokeninfo` endpoint and mints a 60-day opaque session in KV → `GET/PUT /data` authenticate with `Authorization: Bearer <session>` and read/write `user:<sub>`. Local-first is unchanged; login is optional and only enables sync. `mergeStates()` cross-device merge is reused verbatim.

**Tech Stack:** Vanilla ES modules (no build step), Cloudflare Worker + KV, Google Identity Services, `node --test`, Playwright.

## Global Constraints

- Vanilla ES modules, **no build step**; `node --test tests/*.test.mjs`.
- Traditional-Chinese (Taiwan) UI copy.
- Google ID tokens verified **server-side only**; `aud === CLIENT_ID`, `iss` ∈ Google, `exp` valid, `email_verified` true.
- Auth uses `Authorization: Bearer <session>` — **never** a query-string token.
- Worker CORS restricted to the configured origin(s); no `*`.
- Store only study state + `sub`/`email`/`name`; session TTL 60 days.
- `GOOGLE_CLIENT_ID` is public (no client secret in this flow).

---

### Task 1: Worker rewrite — auth endpoints + `validateClaims` + tests + docs

**Files:**
- Modify: `worker/index.js` (full rewrite)
- Modify: `worker/wrangler.toml` (declare vars)
- Modify: `worker/README.md` (setup + endpoints)
- Test: `tests/worker.test.mjs`

**Interfaces:**
- Produces: `validateClaims(claims, clientId, nowSec) -> { ok:true, sub, email, name } | { ok:false, reason }` (exported from `worker/index.js`); endpoints `POST /session`, `GET /data`, `PUT /data`, `POST /logout`.

- [ ] **Step 1: Write the failing test**

Create `tests/worker.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateClaims } from '../worker/index.js';

const CID = 'my-client-id.apps.googleusercontent.com';
const now = 1_000_000;
const good = { aud: CID, iss: 'accounts.google.com', exp: now + 3600, email_verified: 'true', sub: '123', email: 'a@b.com', name: 'A' };

test('accepts a good token', () => {
  const v = validateClaims(good, CID, now);
  assert.equal(v.ok, true);
  assert.equal(v.sub, '123');
  assert.equal(v.email, 'a@b.com');
  assert.equal(v.name, 'A');
});
test('rejects wrong aud', () => assert.equal(validateClaims({ ...good, aud: 'x' }, CID, now).ok, false));
test('rejects wrong iss', () => assert.equal(validateClaims({ ...good, iss: 'evil.com' }, CID, now).ok, false));
test('accepts the https iss form', () => assert.equal(validateClaims({ ...good, iss: 'https://accounts.google.com' }, CID, now).ok, true));
test('rejects expired', () => assert.equal(validateClaims({ ...good, exp: now - 1 }, CID, now).ok, false));
test('rejects unverified email', () => assert.equal(validateClaims({ ...good, email_verified: 'false' }, CID, now).ok, false));
test('accepts boolean email_verified true', () => assert.equal(validateClaims({ ...good, email_verified: true }, CID, now).ok, true));
test('rejects missing sub', () => assert.equal(validateClaims({ ...good, sub: undefined }, CID, now).ok, false));
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/worker.test.mjs`
Expected: FAIL — `validateClaims` not exported / module missing.

- [ ] **Step 3: Rewrite `worker/index.js`**

```js
// worker/index.js — Google-auth per-user sync.
// KV keys: session:<uuid> = {sub,email,name} (TTL 60d); user:<sub> = state blob.
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
const SESSION_TTL = 60 * 24 * 3600; // 60 days, seconds

// Pure: validate Google ID-token claims (as returned by tokeninfo). Exported for tests.
export function validateClaims(claims, clientId, nowSec) {
  if (!claims || typeof claims !== 'object') return { ok: false, reason: 'no claims' };
  if (claims.aud !== clientId) return { ok: false, reason: 'aud' };
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return { ok: false, reason: 'iss' };
  if (!(Number(claims.exp) > nowSec)) return { ok: false, reason: 'exp' };
  if (!(claims.email_verified === true || claims.email_verified === 'true')) return { ok: false, reason: 'email_verified' };
  if (!claims.sub) return { ok: false, reason: 'sub' };
  return { ok: true, sub: String(claims.sub), email: claims.email || '', name: claims.name || '' };
}

function corsOrigin(request, env) {
  const o = request.headers.get('Origin') || '';
  if (o && (o === env.ALLOWED_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o))) return o;
  return null;
}
function corsHeaders(origin) {
  return origin ? {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'vary': 'Origin',
  } : {};
}
function bearer(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/);
  return m ? m[1] : null;
}
async function subFromSession(request, env) {
  const id = bearer(request);
  if (!id) return null;
  const raw = await env.KV.get('session:' + id);
  if (!raw) return null;
  try { return JSON.parse(raw).sub || null; } catch { return null; }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(corsOrigin(request, env));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname;
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (path === '/session' && request.method === 'POST') {
      let credential = null;
      try { credential = (await request.json()).credential; } catch { /* bad body */ }
      if (!credential) return new Response('missing credential', { status: 400, headers: cors });
      const r = await fetch(TOKENINFO + encodeURIComponent(credential));
      if (!r.ok) return new Response('invalid token', { status: 401, headers: cors });
      const v = validateClaims(await r.json(), env.CLIENT_ID, Math.floor(Date.now() / 1000));
      if (!v.ok) return new Response('unauthorized', { status: 401, headers: cors });
      const id = crypto.randomUUID();
      await env.KV.put('session:' + id, JSON.stringify({ sub: v.sub, email: v.email, name: v.name }), { expirationTtl: SESSION_TTL });
      return json({ session: id, email: v.email, name: v.name });
    }

    if (path === '/data') {
      const sub = await subFromSession(request, env);
      if (!sub) return new Response('unauthorized', { status: 401, headers: cors });
      if (request.method === 'PUT') {
        await env.KV.put('user:' + sub, await request.text());
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method === 'GET') {
        return new Response((await env.KV.get('user:' + sub)) || '{}', { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
      }
    }

    if (path === '/logout' && request.method === 'POST') {
      const id = bearer(request);
      if (id) await env.KV.delete('session:' + id);
      return new Response(null, { status: 204, headers: cors });
    }

    return new Response('not found', { status: 404, headers: cors });
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/worker.test.mjs`
Expected: PASS (8 tests). (Importing the module runs only top-level constants/functions; the Workers-only `crypto.randomUUID()`/`fetch` live inside `fetch()` and are not executed by the import.)

- [ ] **Step 5: Declare Worker vars**

In `worker/wrangler.toml`, add (below the existing KV binding) the two plaintext vars:
```toml
[vars]
CLIENT_ID = ""       # set to your Google OAuth Client ID (or use `wrangler secret`)
ALLOWED_ORIGIN = ""  # e.g. https://<user>.github.io
```

- [ ] **Step 6: Document setup + endpoints**

Overwrite `worker/README.md` with the deploy steps and the one-time Google setup:

```markdown
# vocab-sync Worker (Google login)

Per-user sync for the JLPT app. KV: `session:<uuid>` (TTL 60d) and `user:<sub>`.

## Endpoints
- `POST /session`  body `{credential}` (Google ID token) → verifies via Google
  tokeninfo → `{session,email,name}`.
- `GET /data`  `Authorization: Bearer <session>` → the user's state blob.
- `PUT /data`  `Authorization: Bearer <session>` → store the state blob.
- `POST /logout` `Authorization: Bearer <session>` → delete the session.

## One-time Google setup
1. Google Cloud Console → APIs & Services → OAuth consent screen: External;
   app name; scopes `openid email profile`; add yourself + friends as **Test users**.
2. Credentials → Create OAuth client ID → **Web application**. Under
   **Authorized JavaScript origins** add your site origin(s):
   `https://<user>.github.io`, `http://localhost:8000` (dev), any custom domain.
3. Copy the **Client ID** into `web/config.js` `GOOGLE_CLIENT_ID`.

## Deploy
```
cd worker
npx wrangler kv namespace create KV        # once; put the id in wrangler.toml
npx wrangler deploy
npx wrangler secret put CLIENT_ID          # paste the Client ID
# set ALLOWED_ORIGIN in wrangler.toml [vars] to your site origin, then redeploy
```
Put the deployed Worker URL into `web/config.js` `WORKER_URL`.

Basic scopes + test users ⇒ no Google app verification needed.
```

- [ ] **Step 7: Commit**

```bash
git add worker/index.js worker/wrangler.toml worker/README.md tests/worker.test.mjs
git commit -m "feat(worker): Google-auth per-user sync (session + /data) + validateClaims tests"
```

---

### Task 2: `config.js` + `index.html` — client id and GIS script

**Files:**
- Modify: `web/config.js`
- Modify: `web/index.html`

- [ ] **Step 1: Add the client id to config**

Rewrite `web/config.js`:
```js
export const WORKER_URL = "";        // deployed Worker URL, e.g. https://vocab-sync.you.workers.dev
export const GOOGLE_CLIENT_ID = "";  // Google OAuth Client ID (public value)
```

- [ ] **Step 2: Load the GIS library**

In `web/index.html`, add inside `<head>` (after the stylesheet link):
```html
  <script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 3: Syntax-check + commit**

Run: `node --check web/config.js`
Expected: clean.
```bash
git add web/config.js web/index.html
git commit -m "feat: GOOGLE_CLIENT_ID config + load Google Identity Services"
```

---

### Task 3: `auth.js` — session storage + GIS glue + tests

**Files:**
- Create: `web/js/auth.js`
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Produces: `getSession() -> {session,email,name}|null`, `setSession(obj)`, `clearSession()`, `initGoogle(clientId, onCredential)`, `renderButton(el)`.

- [ ] **Step 1: Write the failing test**

Create `tests/auth.test.mjs`:
```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _m: {},
  getItem(k) { return k in this._m ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};

const { getSession, setSession, clearSession } = await import('../web/js/auth.js');

beforeEach(() => { globalThis.localStorage._m = {}; });

test('getSession is null when unset', () => assert.equal(getSession(), null));
test('setSession/getSession round-trip', () => {
  setSession({ session: 's1', email: 'a@b.com', name: 'A' });
  assert.deepEqual(getSession(), { session: 's1', email: 'a@b.com', name: 'A' });
});
test('clearSession removes it', () => {
  setSession({ session: 's1', email: 'a@b.com', name: 'A' });
  clearSession();
  assert.equal(getSession(), null);
});
test('getSession tolerates corrupt json', () => {
  globalThis.localStorage.setItem('vocabmatch.session', '{bad');
  assert.equal(getSession(), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `auth.js`**

```js
const SESSION_KEY = 'vocabmatch.session';

// --- session storage (pure; browser localStorage) ---
export function getSession() {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
export function setSession(obj) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(obj)); } catch { /* private mode */ }
}
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}

// --- Google Identity Services glue (browser only; verified via Playwright/manual) ---
function whenReady() {
  return new Promise((resolve) => {
    let n = 0;
    const t = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.id) { clearInterval(t); resolve(true); }
      else if (++n > 50) { clearInterval(t); resolve(false); }   // give up after ~5s
    }, 100);
  });
}
let _initP = null;   // resolves once id.initialize() has run, so renderButton can await it
export function initGoogle(clientId, onCredential) {
  _initP = (async () => {
    if (!clientId || !(await whenReady())) return false;
    window.google.accounts.id.initialize({ client_id: clientId, callback: (resp) => onCredential(resp.credential) });
    return true;
  })();
  return _initP;
}
export async function renderButton(el) {
  if (!el) return;
  // wait for initialize() (so the button's click wires the callback); if initGoogle
  // was never called, fall back to just waiting for the library.
  const ok = _initP ? await _initP : await whenReady();
  if (!ok) return;
  el.innerHTML = '';
  window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with' });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/auth.test.mjs`
Expected: PASS (4 tests). (The GIS functions reference `window` only inside their bodies, never at import time, so the storage tests run under Node without a DOM.)

- [ ] **Step 5: Commit**

```bash
git add web/js/auth.js tests/auth.test.mjs
git commit -m "feat: auth.js — session storage + Google Identity Services glue"
```

---

### Task 4: `sync.js` rewrite — Bearer session API + tests

**Files:**
- Modify: `web/js/sync.js` (full rewrite; drop `hashKey`)
- Test: `tests/sync.test.mjs`

**Interfaces:**
- Produces: `exchangeSession(workerUrl, credential) -> {session,email,name}|null`, `pull(workerUrl, session) -> state|null`, `push(workerUrl, session, state) -> boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/sync.test.mjs`:
```js
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeSession, pull, push } from '../web/js/sync.js';

let calls;
function stub(res) { calls = []; globalThis.fetch = async (url, opts) => { calls.push({ url, opts: opts || {} }); return res; }; }
afterEach(() => { delete globalThis.fetch; });

test('exchangeSession POSTs {credential} to /session', async () => {
  stub({ ok: true, json: async () => ({ session: 's1', email: 'a', name: 'A' }) });
  const r = await exchangeSession('http://w', 'cred');
  assert.equal(calls[0].url, 'http://w/session');
  assert.equal(calls[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { credential: 'cred' });
  assert.deepEqual(r, { session: 's1', email: 'a', name: 'A' });
});
test('exchangeSession returns null on !ok', async () => {
  stub({ ok: false });
  assert.equal(await exchangeSession('http://w', 'cred'), null);
});
test('pull GETs /data with Bearer', async () => {
  stub({ ok: true, json: async () => ({ cards: { x: 1 } }) });
  const r = await pull('http://w', 's1');
  assert.equal(calls[0].url, 'http://w/data');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer s1');
  assert.deepEqual(r, { cards: { x: 1 } });
});
test('pull returns null on empty blob', async () => {
  stub({ ok: true, json: async () => ({}) });
  assert.equal(await pull('http://w', 's1'), null);
});
test('push PUTs /data with Bearer + JSON body', async () => {
  stub({ ok: true });
  const ok = await push('http://w', 's1', { a: 1 });
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer s1');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { a: 1 });
  assert.equal(ok, true);
});
test('pull/push swallow fetch errors (offline)', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await pull('http://w', 's1'), null);
  assert.equal(await push('http://w', 's1', {}), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/sync.test.mjs`
Expected: FAIL — `exchangeSession` not exported.

- [ ] **Step 3: Rewrite `sync.js`**

```js
export async function exchangeSession(workerUrl, credential) {
  try {
    const r = await fetch(`${workerUrl}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (!r.ok) return null;
    return await r.json();   // { session, email, name }
  } catch { return null; }
}

export async function pull(workerUrl, session) {
  try {
    const r = await fetch(`${workerUrl}/data`, { headers: { authorization: `Bearer ${session}` } });
    if (!r.ok) return null;
    const s = await r.json();
    return s && Object.keys(s).length ? s : null;
  } catch { return null; }
}

export async function push(workerUrl, session, state) {
  try {
    const r = await fetch(`${workerUrl}/data`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });
    return r.ok;
  } catch { return false; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/sync.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/sync.js tests/sync.test.mjs
git commit -m "feat: sync.js — Bearer-session /session + /data API (drop passphrase hash)"
```

---

### Task 5: `app.js` — wire auth + sync

**Files:**
- Modify: `web/js/app.js`

**Interfaces:**
- Consumes: `exchangeSession`, `pull`, `push` (Task 4); `getSession`, `setSession`, `clearSession`, `initGoogle`, `renderButton` (Task 3); `GOOGLE_CLIENT_ID` (Task 2).
- Produces (for `ui.js`, Task 6): handlers `getAccount()`, `onSignOut()`, `mountSignIn(el)`.

- [ ] **Step 1: Update imports**

Replace:
```js
import { hashKey, pull, push } from './sync.js';
```
with:
```js
import { exchangeSession, pull, push } from './sync.js';
import { getSession, setSession, clearSession, initGoogle, renderButton } from './auth.js';
```
And change:
```js
import { WORKER_URL } from '../config.js';
```
to:
```js
import { WORKER_URL, GOOGLE_CLIENT_ID } from '../config.js';
```

- [ ] **Step 2: Replace `persist()`'s push path**

Replace the body of `persist()`:
```js
async function persist() {
  saveState(state);
  if (!WORKER_URL || !state.settings.passphrase) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => push(WORKER_URL, await hashKey(state.settings.passphrase), state), 3000);
}
```
with:
```js
async function persist() {
  saveState(state);
  const sess = getSession();
  if (!WORKER_URL || !sess) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(WORKER_URL, sess.session, state), 3000);
}
```

- [ ] **Step 3: Add sign-in / sign-out / sync helpers**

Add these functions (e.g. just above `renderAll`):
```js
async function syncNow() {
  const sess = getSession();
  if (!WORKER_URL || !sess) return;
  const remote = await pull(WORKER_URL, sess.session);
  if (remote) { Object.assign(state, mergeStates(state, remote)); saveState(state); }
  push(WORKER_URL, sess.session, state);
}
async function onCredential(credential) {
  const res = await exchangeSession(WORKER_URL, credential);
  if (!res) return;
  setSession(res);
  await syncNow();
  renderAll();
}
function signOut() {
  clearSession();
  renderAll();
}
```

- [ ] **Step 4: Add the account handlers to `renderChrome`**

In `renderAll()`'s handlers object, add three entries (after `onSettingsChange`):
```js
    getAccount: () => getSession(),
    onSignOut: () => signOut(),
    mountSignIn: (el) => renderButton(el),
```

- [ ] **Step 5: Rewrite the `pagehide` keepalive**

Replace the `pagehide` listener:
```js
addEventListener('pagehide', () => {
  clearTimeout(pushTimer);
  if (WORKER_URL && state.settings.passphrase) {
    hashKey(state.settings.passphrase).then(k =>
      fetch(`${WORKER_URL}?key=${k}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(state), keepalive: true }).catch(()=>{}));
  }
});
```
with:
```js
addEventListener('pagehide', () => {
  clearTimeout(pushTimer);
  const sess = getSession();
  if (WORKER_URL && sess) {
    fetch(`${WORKER_URL}/data`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sess.session}`, 'content-type': 'application/json' },
      body: JSON.stringify(state),
      keepalive: true,
    }).catch(() => {});
  }
});
```

- [ ] **Step 6: Rewrite the boot sync + init GIS**

Replace the boot prelude:
```js
(async function boot() {
  if (WORKER_URL && state.settings.passphrase) {
    const remote = await pull(WORKER_URL, await hashKey(state.settings.passphrase));
    if (remote) { Object.assign(state, mergeStates(state, remote)); saveState(state); }
    push(WORKER_URL, await hashKey(state.settings.passphrase), state);
  }
  if (state.settings.content === 'grammar') mode = 'cloze';
```
with:
```js
(async function boot() {
  initGoogle(GOOGLE_CLIENT_ID, onCredential);   // non-blocking; sets up the sign-in callback
  if (WORKER_URL && getSession()) await syncNow();
  if (state.settings.content === 'grammar') mode = 'cloze';
```
(The rest of `boot()` — the reading/deck guard, `renderAll()`, `next()` — is unchanged.)

- [ ] **Step 7: Syntax-check**

Run: `node --check web/js/app.js`
Expected: clean (exit 0). `node --test tests/*.test.mjs` — all pass (no JS test imports app.js).

- [ ] **Step 8: Commit**

```bash
git add web/js/app.js
git commit -m "feat: app.js — Google sign-in, session sync, sign-out; drop passphrase sync"
```

---

### Task 6: `ui.js` — account block replaces the passphrase field

**Files:**
- Modify: `web/js/ui.js`

**Interfaces:**
- Consumes: `handlers.getAccount()`, `handlers.onSignOut()`, `handlers.mountSignIn(el)` (Task 5).

- [ ] **Step 1: Read the account at the top of `render()`**

In `render()`, after `const reading = s.content === 'reading';`, add:
```js
    const account = handlers.getAccount ? handlers.getAccount() : null;
```

- [ ] **Step 2: Replace the passphrase field markup**

In the settings panel template, replace the passphrase field:
```js
          <label class="field">
            <span>同步密語（passphrase）</span>
            <input type="text" id="set-passphrase" placeholder="留空＝不同步" autocomplete="off">
          </label>
```
with the account block:
```js
          <div class="field">
            <span>帳號</span>
            ${account
              ? `<div class="account-in">
                   <div class="account-id"><b>${account.name || ''}</b><span>${account.email || ''}</span></div>
                   <button type="button" class="btn-ghost" id="set-signout">登出</button>
                 </div>`
              : `<div id="g-signin" class="g-signin"></div><p class="account-hint">登入後跨裝置同步進度</p>`}
          </div>
```

- [ ] **Step 3: Remove the passphrase handler, add the sign-out handler**

Delete the passphrase wiring:
```js
    const pass = root.querySelector('#set-passphrase');
    if (pass) pass.value = s.passphrase || '';
    if (pass) pass.addEventListener('change', () => {
      handlers.onSettingsChange({ passphrase: pass.value.trim() });
    });
```
and in its place add:
```js
    const signout = root.querySelector('#set-signout');
    if (signout) signout.addEventListener('click', () => handlers.onSignOut());
```

- [ ] **Step 4: Drop `passphrase` from the reset handler**

Change the reset click handler's argument:
```js
      handlers.onSettingsChange({ ...DEFAULT_SETTINGS, content: s.content, passphrase: '' });
```
to:
```js
      handlers.onSettingsChange({ ...DEFAULT_SETTINGS, content: s.content });
```

- [ ] **Step 5: Mount the GIS button at the end of `render()`**

At the very end of `render()` (after the existing event wiring, before the closing `}` of `render`), add:
```js
    const gmount = root.querySelector('#g-signin');
    if (gmount && handlers.mountSignIn) handlers.mountSignIn(gmount);
```

- [ ] **Step 6: Syntax-check + commit**

Run: `node --check web/js/ui.js`
Expected: clean. `node --test tests/*.test.mjs` — all pass.
```bash
git add web/js/ui.js
git commit -m "feat: settings account block (Google sign-in / sign-out) replaces passphrase"
```

---

### Task 7: Account-block CSS

**Files:**
- Modify: `web/style.css`

- [ ] **Step 1: Append the styles**

Add just before the `/* ---- fx: stamp / particle / confetti */` section:
```css
/* ---------------------------------------------------------- account */

.account-in { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.account-id { display: flex; flex-direction: column; min-width: 0; }
.account-id b { font-size: 14px; color: var(--ink); }
.account-id span { font-size: 12px; color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; }
.g-signin { min-height: 40px; display: flex; }
.account-hint { font-size: 12px; color: var(--ink-dim); margin: 8px 0 0; }
```

- [ ] **Step 2: Verify braces balance + commit**

Run: `node -e "const c=require('fs').readFileSync('web/style.css','utf8'); const o=(c.match(/{/g)||[]).length, x=(c.match(/}/g)||[]).length; if(o!==x) throw new Error('mismatch '+o+' vs '+x); console.log('braces balanced', o);"`
Expected: prints `braces balanced <n>`.
```bash
git add web/style.css
git commit -m "style: account block (sign-in mount + signed-in identity)"
```

---

### Task 8: Playwright — signed-in / signed-out UI (mocked session)

**Files:** (no source changes unless a defect is found)

The real Google popup and live Worker are **not** automated here (see the manual
checklist). This verifies the two settings-panel states with a pre-seeded session.

- [ ] **Step 1: Drive both account states**

Run (adjust venv path, e.g. `/tmp/pw-venv`):
```bash
cd /home/eslin/claude_projects/JLPT
python3 -m http.server -d web 8156 >/tmp/srv.log 2>&1 & echo $! > /tmp/srv.pid; sleep 1
/tmp/pw-venv/bin/python - <<'EOF'
from playwright.sync_api import sync_playwright
import json
base = {"newPerDay":50,"levels":["n2"],"categories":[],"sound":False,"pairMode":"meaning","theme":"system","content":"vocab"}
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    # signed OUT
    pg=b.new_page(viewport={"width":900,"height":820}); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8156", wait_until="load")
    pg.evaluate("s=>localStorage.setItem('vocabmatch.state',s)", json.dumps({"cards":{},"settings":base,"updated":0}))
    pg.reload(wait_until="load"); pg.wait_for_timeout(500)
    pg.click(".gear-btn"); pg.wait_for_timeout(300)
    print("signed-out: g-signin mount:", pg.eval_on_selector_all("#g-signin","e=>e.length"),
          "| hint:", pg.eval_on_selector_all(".account-hint","e=>e.length"),
          "| passphrase field gone:", pg.eval_on_selector_all("#set-passphrase","e=>e.length")==0)
    pg.close()
    # signed IN (pre-seed a session)
    pg=b.new_page(viewport={"width":900,"height":820}); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8156", wait_until="load")
    pg.evaluate("s=>localStorage.setItem('vocabmatch.state',s)", json.dumps({"cards":{},"settings":base,"updated":0}))
    pg.evaluate("s=>localStorage.setItem('vocabmatch.session',s)", json.dumps({"session":"tok","email":"me@example.com","name":"Me"}))
    pg.reload(wait_until="load"); pg.wait_for_timeout(500)
    pg.click(".gear-btn"); pg.wait_for_timeout(300)
    print("signed-in: email shown:", "me@example.com" in (pg.text_content(".account-id") or ""),
          "| signout btn:", pg.eval_on_selector_all("#set-signout","e=>e.length"),
          "| g-signin absent:", pg.eval_on_selector_all("#g-signin","e=>e.length")==0)
    pg.close(); b.close()
print("ERRORS:", errs)
EOF
kill $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: signed-out → `g-signin mount: 1`, `hint: 1`, `passphrase field gone: True`; signed-in → `email shown: True`, `signout btn: 1`, `g-signin absent: True`; **`ERRORS: []`**.

- [ ] **Step 2: Full suite**

Run: `node --test tests/*.test.mjs`
Expected: all pass (worker + auth + sync + existing).

- [ ] **Step 3: Commit any fixes** (skip if none)
```bash
git add -A && git commit -m "test: Playwright-verify account UI states (mocked session)"
```

---

## Owner manual smoke test (run after deploying — not a code task)

Do the one-time Google + Cloudflare setup in `worker/README.md`, fill
`web/config.js` (`WORKER_URL`, `GOOGLE_CLIENT_ID`), deploy the Worker, then:

1. Open the site → ⚙ 設定 → click **Sign in with Google** → complete the popup →
   the panel shows your name/email + 登出.
2. Study a few cards (progress changes) → reopen the app on a **second device**,
   sign in with the **same** Google account → confirm the progress merged in.
3. Click **登出** → the app still works offline; sync stops until you sign in again.

If sign-in does nothing: check that your site origin is in the OAuth client's
**Authorized JavaScript origins**, and that `GOOGLE_CLIENT_ID` / `WORKER_URL`
are set. If `/session` returns 401: confirm the Worker's `CLIENT_ID` matches.

## Notes for the executor
- No agents/generation. All tasks are TDD or mechanical wiring.
- Pure helpers (`validateClaims`, session storage, sync request builders) are
  unit-tested; DOM/GIS and the real Google flow are Playwright/manual.
- Deliberate simplification vs the spec's "401 → clearSession": ongoing sync
  failures are treated as transient (offline-safe) and do **not** nuke the
  session; a rare 60-day expiry is handled by the owner clicking 登出 → sign in
  again. Do not add auto-clear-on-null (it would wipe sessions when merely offline).
- Keep UI copy Traditional-Chinese; never put tokens in query strings.
