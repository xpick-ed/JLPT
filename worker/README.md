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
