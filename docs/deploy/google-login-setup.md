# Google 登入 + 每人同步 — 一次性設定步驟

把 JLPT App「真正上線、支援 Google 帳號登入與跨裝置同步」需要的一次性設定。
程式已經寫好，這份只做**設定金鑰＋部署**。小規模（你＋朋友）全程免費、免 Google 審核。

- 本 repo：`xpick-ed/JLPT`
- 站來源 (origin)：**`https://xpick-ed.github.io`**（GitHub Pages）
- 架構：靜態前端（GitHub Pages）＋ Cloudflare Worker（KV）＋ Google Identity Services

> ⚠️ **最重要的一條規則**：三個地方的 **origin 必須完全一致**——
> ① Google 的「已授權 JavaScript 來源」 ② Worker 的 `ALLOWED_ORIGIN` ③ 你實際開站的網址。
> origin 只算 `https://主機名`（含 `http/https`、`www`、port，**不含路徑**）。用自訂網域就三處一起改。

---

## Part A — Google Cloud：建立 OAuth Client ID

### A1 建專案
1. 開 <https://console.cloud.google.com> → 頂端專案下拉 → **New Project** → 名稱 `JLPT` → **Create** → 建好後在下拉選它。

### A2 OAuth 同意畫面
2. 左上 ☰ → **APIs & Services → OAuth consent screen**（新版介面叫 **Google Auth Platform**，按 *Get started*）。
3. **User type：選 External**（個人 Gmail 只能選這個；Internal 只有 Google Workspace 組織才有）→ Create。
4. 填 **App name** `JLPT 單字道場`、**User support email** 你的 Gmail、最下 **Developer contact** 你的 Gmail → Save and continue。
5. **Scopes**：不用加（登入用的 openid/email/profile 是預設）→ Save and continue。
6. **Test users → Add users** → 加你自己＋每個朋友的 Gmail（**只有名單上的人能登入**）→ Save。
7. **Publishing status 保持 “Testing”**（免送審）。

### A3 建立憑證（Credentials／憑證／用戶端）
> 找不到「Credentials」時：中文是 **「憑證」**；新版在 **Google 驗證平台 → 用戶端 (Clients)**。
> 最快是直接開網址：<https://console.cloud.google.com/apis/credentials>（先確認左上選的是 `JLPT` 專案）。

8. **＋ Create Credentials → OAuth client ID**（建立憑證 → OAuth 用戶端 ID）。
9. **Application type：Web application**（網頁應用程式），Name 隨意（`JLPT web`）。
10. **Authorized JavaScript origins（已授權的 JavaScript 來源）→ ＋ Add URI**，加：
    - `https://xpick-ed.github.io` ← 正式站
    - `http://localhost:8000` ← 本機測試（你平常 `python3 -m http.server -d web 8000` 的 port；用別的就加對應 port）
    - **Authorized redirect URIs 留空**（GIS 按鈕不需要）
11. **Create** → **複製 Client ID**（像 `123456-abc.apps.googleusercontent.com`），先貼記事本。

---

## Part B — Cloudflare：部署 Worker

在你電腦、repo 的 `worker/` 資料夾裡執行：

### B1 登入
```bash
cd worker
npx wrangler login          # 開瀏覽器授權 Cloudflare（沒帳號會引導註冊，免費）
```

### B2 建 KV namespace
```bash
npx wrangler kv namespace create KV
```
輸出會有一行 `id = "xxxx..."` → 把它貼進 `worker/wrangler.toml`，**取代** `PASTE_YOUR_KV_NAMESPACE_ID`（引號留著）。
（舊版指令：`npx wrangler kv:namespace create KV`；想看已建過的：`npx wrangler kv namespace list`。）

### B3 填 wrangler.toml 變數（兩個都是公開值，可直接寫進檔案）
```toml
[vars]
CLIENT_ID = "123456-abc.apps.googleusercontent.com"   # ← A11 複製的
ALLOWED_ORIGIN = "https://xpick-ed.github.io"          # ← 你的站來源
```

### B4 註冊 workers.dev 子網域（第一次才要）
若 deploy 時看到 `You need to register a workers.dev subdomain`：
- 開 <https://dash.cloudflare.com> → **Workers & Pages** → 第一次會請你 **Choose a subdomain**（例如 `enhsiang`）→ 確認。之後 Worker 網址就是 `https://vocab-sync.enhsiang.workers.dev`。全帳號共用、只設一次。

### B5 部署
```bash
npx wrangler deploy
```
輸出結尾會印出 Worker 網址 `https://vocab-sync.你的子網域.workers.dev` → **複製**。

快速自測（沒帶登入應回 `unauthorized`，代表 Worker 活著）：
```bash
curl https://vocab-sync.你的子網域.workers.dev/data
# 預期看到：unauthorized
```

---

## Part C — 前端設定 + 上線

### C1 填 `web/config.js`
```js
export const WORKER_URL = "https://vocab-sync.你的子網域.workers.dev";   // ← B5
export const GOOGLE_CLIENT_ID = "123456-abc.apps.googleusercontent.com"; // ← A11
```

### C2 commit + 部署 GitHub Pages
```bash
git add web/config.js worker/wrangler.toml
git commit -m "chore: wire Google login config (client id + worker url)"
git push
```
Pages 還沒開的話：GitHub repo → **Settings → Pages → Source：Deploy from a branch → `main` / (root)** → Save。
等 1–2 分鐘，站在 `https://xpick-ed.github.io/JLPT/web/`（app 在 `web/` 子夾；**origin 仍是 `https://xpick-ed.github.io`**，所以 A10 的授權來源不用改）。

---

## Part D — Smoke test（親手驗一次）

1. 開站 → ⚙ 設定 → **Sign in with Google** → 選帳號 → 面板顯示你的名字/email ＋「登出」。
2. 讀幾張卡（進度會變）→ 用**第二台裝置**、**同一個 Google 帳號**登入 → 確認進度合併過來。
3. 按**登出** → app 仍可離線玩、進度還在；再登入即恢復同步。

這三點都過就完成了。最終極驗收：**你朋友**（有加進 Test users）用他的 Gmail 打開你的網址、登入，他自己的進度也能跨他的裝置同步。

---

## 疑難排解

| 症狀 | 多半是 |
|---|---|
| 按 Sign in 沒反應 | **origin 不符**：網址列 origin 要和 Google「已授權 JavaScript 來源」完全一樣（`https`/`http`、`www`、port 都算）。也確認 `GOOGLE_CLIENT_ID`／`WORKER_URL` 有填。 |
| `/session` 回 401 | Worker 的 `CLIENT_ID` 與前端 `GOOGLE_CLIENT_ID` 要**一模一樣**。 |
| deploy 說 KV id 無效 | `wrangler.toml` 的 KV `id` 還是 `PASTE_YOUR_...`，照 B2 建好貼真 id。 |
| deploy 說要 workers.dev subdomain | 照 B4 註冊子網域再 `npx wrangler deploy`。 |
| 改了設定沒生效 | 改 `wrangler.toml` → 重新 `npx wrangler deploy`；改 `config.js` → `git push` 讓 Pages 重佈。 |

## 名詞中英對照（Console 中文介面）
APIs & Services＝API 和服務／Credentials＝憑證／Create Credentials＝建立憑證／
OAuth client ID＝OAuth 用戶端 ID／OAuth consent screen＝OAuth 同意畫面／
Google Auth Platform＝Google 驗證平台／Clients＝用戶端／Web application＝網頁應用程式／
Authorized JavaScript origins＝已授權的 JavaScript 來源。

---

## 補充：要開放給不特定多人（超過 test users）時
目前是 Testing＋test users，只有名單上的 Gmail 能用。若要真的公開：
1. OAuth 同意畫面 **Publish app**；基本 scope（openid/email/profile）通常**免驗證**即可對外，但會出現「未驗證應用程式」提示，要移除提示才需送 Google 審核。
2. 建議搭配**自訂網域**＋一份簡單的**隱私政策頁**（因為開始存不特定人的資料）。
3. 注意 Cloudflare Workers/KV 免費額度（小規模綽綽有餘）。
