# Google 登入 + 每人同步（Google Login & Per-User Sync）— Design

**Date:** 2026-07-13
**Status:** Approved (design), pending spec review → writing-plans

## Context & Scope

The JLPT web app is a static GitHub Pages frontend that is **local-first**
(plays fully offline via localStorage). Cross-device sync today is a passphrase
model: `web/js/sync.js` hashes a passphrase (SHA-256) and a tiny Cloudflare
Worker (`worker/index.js`) stores the whole state blob in KV keyed by that hash
(`?key=`), with `mergeStates()` doing cross-device merge.

**Goal:** replace the passphrase model with **Sign in with Google**. Each Google
account gets its own synced progress. The Worker verifies a Google ID token and
keys per-user data by the Google `sub`. Small scale (owner + a few friends),
extending the existing Cloudflare Worker + KV — **no new vendor**.

**Kept as-is:** local-first (works offline; login is **optional** and only
enables sync); `mergeStates()` cross-device merge. **Removed:** the passphrase
sync path and its KV data (owner is the main user; local progress is unaffected).

## Architecture & Flow

```
Frontend (GIS)                 Worker (Cloudflare)              KV
  Sign in with Google  ──ID token──▶  POST /session
                                       verify token (tokeninfo)
                                       validateClaims(aud/iss/exp/email_verified)
                                       mint session id ───────────▶ session:<id> = {sub,email,name}  (TTL 60d)
  store {session,email,name} ◀── {session,email,name}
  GET/PUT /data  ──Bearer session──▶  resolve session→sub ──────▶ user:<sub> = state blob
```

- **Why a Worker session** (not the raw ID token for sync): Google ID tokens
  expire in ~1h; keying ongoing sync on them would break hourly. `/session`
  verifies the Google token **once at login** and mints a long-lived opaque
  session token; all subsequent sync uses that. Session missing/expired → 401 →
  frontend prompts re-login.
- **Token verification** happens only at `/session` (login, low frequency) via
  Google's `https://oauth2.googleapis.com/tokeninfo?id_token=<jwt>` endpoint. Its
  claims are checked by the pure `validateClaims`. Per-sync requests never call
  Google (zero added latency).

## Worker (`worker/index.js` rewrite)

**Env:** `CLIENT_ID` (Google OAuth client id), `ALLOWED_ORIGIN` (the site origin,
e.g. `https://<user>.github.io`), `KV` (existing namespace binding).

**CORS:** reflect the request `Origin` **only if** it is in the allowlist
`[ALLOWED_ORIGIN, 'http://localhost:*' for dev]`; otherwise omit CORS headers.
Methods `GET,PUT,POST,OPTIONS`; allow header `authorization,content-type`.

**Routes** (by `URL.pathname` + method):
- `OPTIONS *` → 204 + CORS.
- `POST /session` — body `{ credential }`. `fetch(tokeninfo?id_token=credential)`;
  if 200, `validateClaims(claims, env.CLIENT_ID, Date.now()/1000)`. On ok: `id =
  crypto.randomUUID()`; `KV.put('session:'+id, JSON.stringify({sub,email,name}),
  {expirationTtl: 60*24*3600})`; return `{ session:id, email, name }`. On failure
  → 401.
- `GET /data` — `authz(request)` → sub; return `KV.get('user:'+sub) || '{}'`.
- `PUT /data` — `authz(request)` → sub; `KV.put('user:'+sub, await request.text())`; 204.
- `POST /logout` — `authz(request)` → delete `session:<id>`; 204.
- unknown → 404.

**Auth helper** `authz(request, env)`: read `Authorization: Bearer <id>`; look up
`session:<id>`; return its `sub` or null (→ caller returns 401).

**Pure, exported, unit-tested:** `validateClaims(claims, clientId, nowSec)` →
`{ ok:true, sub, email, name }` or `{ ok:false, reason }`. Checks: `aud ===
clientId`; `iss` ∈ `{'accounts.google.com','https://accounts.google.com'}`;
`Number(exp) > nowSec`; `email_verified === true || email_verified === 'true'`.

`crypto.randomUUID()` is available in both Workers and Node (for tests).

## Frontend

### `web/config.js`
Add `export const GOOGLE_CLIENT_ID = "";` alongside `WORKER_URL` (client id is a
**public** value, not a secret).

### `index.html`
Load GIS once: `<script src="https://accounts.google.com/gsi/client" async defer></script>`.

### `web/js/auth.js` (new)
- Session storage (pure, unit-tested with a `localStorage` shim):
  `getSession()`, `setSession({session,email,name})`, `clearSession()` under key
  `vocabmatch.session`.
- GIS glue (DOM — Playwright/manual): `initGoogle(clientId, onCredential)`
  initializes `google.accounts.id` with the callback; `renderButton(el)` renders
  the Sign-in button into `el`; `promptOneTap()` optional. No secret involved.

### `web/js/sync.js` (rewrite; drop `hashKey`)
- `exchangeSession(workerUrl, credential)` → `POST /session` → `{session,email,name}` or null.
- `pull(workerUrl, session)` → `GET /data` with `Authorization: Bearer <session>` → state or null (401 → null).
- `push(workerUrl, session, state)` → `PUT /data` with Bearer + JSON body → `true|false` (401 → false).
- All return null/false on network error (offline-safe), matching today's behaviour.

### `web/js/app.js`
- Boot: `const sess = getSession(); if (WORKER_URL && sess) { pull→mergeStates→saveState→push }`.
- `persist()`: if `WORKER_URL && getSession()`, debounced `push(WORKER_URL, session, state)`.
- `pagehide`: keepalive `PUT /data` with Bearer (mirrors current keepalive push).
- `onCredential(cred)`: `exchangeSession` → `setSession` → pull/merge/push → `renderAll()`.
- `signOut()`: `clearSession()` → `renderAll()` (local data stays; sync stops).
- On a 401 from pull/push: `clearSession()` and re-render (prompts re-login).

### `web/js/ui.js` (settings account section)
Replace the「同步密語」field with an **account** block:
- Signed out: a mount point `<div id="g-signin"></div>` + a one-line hint
  「登入後跨裝置同步進度」. After each chrome render while signed-out, app calls
  `auth.renderButton(el)` to (re)mount the GIS button.
- Signed in: show `name`（若有）＋ `email` ＋ a「登出」button wired to `signOut()`.

## Data Model (KV)
- `session:<uuid>` → `{ sub, email, name }`, TTL 60 days.
- `user:<sub>` → the state blob (same shape `saveState`/`mergeStates` use today).
- Passphrase keys are abandoned (not migrated).

## Security
- Google ID token is **always verified server-side** (tokeninfo) with
  `aud`/`iss`/`exp`/`email_verified` checked; the client is never trusted.
- Session token is opaque, unguessable (`randomUUID`), KV-stored with TTL, sent
  in the `Authorization` header (**never** a query string → not logged in URLs).
- CORS restricted to the app origin(s).
- Only study state + `sub`/`email`/`name` are stored — no other PII.

## Error Handling
- Offline / Worker unreachable: sync calls return null/false; app stays fully
  functional local-only.
- Expired/invalid session (401): clear the local session and prompt re-login;
  local progress is untouched.
- `/session` verification failure: 401; the UI keeps the signed-out state.

## One-Time Setup (documented for the owner; not code)
1. **Google Cloud Console**: OAuth consent screen (External; app name; scopes
   `openid email profile`; add owner + friends as **test users**). Create an
   **OAuth 2.0 Client ID** (type: Web application); set **Authorized JavaScript
   origins** to the site URL(s) (GitHub Pages URL, localhost for dev, any custom
   domain). Copy the Client ID into `web/config.js` `GOOGLE_CLIENT_ID`.
2. **Cloudflare**: set Worker vars `CLIENT_ID` (same id) and `ALLOWED_ORIGIN`
   (site origin); `wrangler deploy`. KV binding already exists.
3. Basic scopes + test users ⇒ **no Google app verification needed**.

`worker/README.md` is updated with these steps.

## Testing
- **Unit** (`node --test`):
  - `validateClaims` — accepts a good claims object; rejects wrong `aud`, wrong
    `iss`, expired `exp`, and `email_verified` false/missing (import from
    `worker/index.js`).
  - `auth.js` session storage — set/get/clear round-trip via a `localStorage` shim.
  - `sync.js` — with a stubbed `globalThis.fetch`: `pull` issues `GET /data` with
    the Bearer header; `push` issues `PUT /data` with Bearer + JSON body;
    `exchangeSession` POSTs `{credential}` to `/session`; all return null/false on
    a thrown fetch.
- **Playwright** (mocked session, no real Google): pre-seed `localStorage`
  `vocabmatch.session`; route-stub the Worker `/data` endpoints; verify the
  settings show name/email + 登出 when signed in and the `#g-signin` mount +
  hint when signed out; verify sync requests carry `Authorization: Bearer`; 0
  console errors.
- **Manual smoke test (owner)**: a checklist in the plan — real Google sign-in
  popup, cross-device: sign in on device A, study, sign in on device B, confirm
  progress merges. (The real Google popup cannot be automated in this harness.)

## Out of Scope
- Refresh tokens / silent renewal beyond the 60-day session (re-login on expiry).
- >100 users, publishing the OAuth app, Google verification (small scale only).
- Migrating existing passphrase data.
- Avatars beyond the name/email text (the picture claim is available but not used).

## Global Constraints
- Vanilla ES modules, **no build step**; `node --test tests/*.test.mjs`.
- Traditional-Chinese (Taiwan) UI copy.
- Google ID tokens verified **server-side only**; `aud === CLIENT_ID`,
  `email_verified` true, `exp` valid.
- Auth uses the `Authorization: Bearer` header — never a query-string token.
- Worker CORS restricted to the configured origin(s); no `*`.
- Store only study state + `sub`/`email`/`name`; session TTL 60 days.
- `GOOGLE_CLIENT_ID` is public; no client secret exists in this flow.
